import { createScheduler, setExecutionPace } from './execution.js';
import { Batches, DEFAULT_RUNS, validateRunCount } from './batches.js';
import http from 'node:http';
import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldStore, PLACES, LATEST_VERSION, APP_VERSION, SCENARIOS, DEFAULT_DAYS, validateDays, hourly, metrics } from './world.js';
import { CodexClient } from './codex.js';
import { Diagnostics, heartbeat, decisionLedger } from './diagnostics.js';
import { Runner } from './runner.js';
import { Research } from './research.js';
import { enableRecovery } from './recovery.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = s => createHash('sha256').update(s).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function ownerStorage(dataDir) {
  const path = join(dataDir, 'owner.json');
  let owner = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {
    signingKey: randomBytes(32).toString('hex'),
    setupHash: hash(process.env.OWNER_SETUP_TOKEN || randomBytes(32).toString('hex')), claimed: false,
  };
  const save = () => { writeFileSync(path + '.tmp', JSON.stringify(owner), { mode: 0o600 }); renameSync(path + '.tmp', path); };
  // Explicit environment-token rotation restores access without replacing worlds or sessions.
  const configuredHash = process.env.OWNER_SETUP_TOKEN ? hash(process.env.OWNER_SETUP_TOKEN) : null;
  if (configuredHash && owner.envSetupHash !== configuredHash) {
    owner.setupHash = configuredHash; owner.envSetupHash = configuredHash; owner.claimed = false;
  }
  save(); return { owner, save };
}

export function createApp({ dataDir = resolve(process.env.DATA_DIR || 'data'), codex, intervalMs } = {}) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const store = new WorldStore(join(dataDir, 'village.sqlite'));
  const diagnostics = new Diagnostics(store.db);
  codex ||= new CodexClient({ dataDir, binary: process.env.CODEX_BINARY || join(root, 'node_modules/.bin/codex'), onDiagnostic: event => diagnostics.emit(event) });
  const runner = new Runner(store, codex, diagnostics);
  const batches = new Batches(store, runner);
  const research = new Research(store, diagnostics, runner);
  diagnostics.emit({ event: 'run_recovered', runId: store.world.id, worldVersion: store.world.version, tick: store.world.tick, calls: store.world.calls, pendingProposals: store.world.decisionRound?.decisions.length || 0 });
  const stopHeartbeat = heartbeat(diagnostics, runner, store);
  const { owner, save: saveOwner } = ownerStorage(dataDir);
  const sign = text => createHmac('sha256', owner.signingKey).update(text).digest('hex');
  const isOwner = req => {
    // Recovery links can be generated offline; reload owner state to honor them without races.
    Object.assign(owner, JSON.parse(readFileSync(join(dataDir, 'owner.json'), 'utf8')));
    const value = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('village_owner='))?.slice(14);
    if (!value) return false;
    const [expiry, signature] = value.split('.');
    return Number(expiry) > Date.now() && equal(signature, sign(expiry));
  };
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const snapshot = () => ({ execution: scheduler?.snapshot(), appVersion: APP_VERSION, latestWorldVersion: LATEST_VERSION, world: store.world, metrics: metrics(store.world), places: PLACES, events: store.records(80).filter(e => !['request', 'decision'].includes(e.kind)),
    daySummaries: store.db.prepare("SELECT data FROM records WHERE run=? AND kind='day_summary' ORDER BY id").all(store.world.id).map(r => { const { day, daily, cumulative } = JSON.parse(r.data); return { day, daily, cumulative }; }),
    batch: batches.report(), busy: runner.busy, pendingName: runner.pendingName, retry: runner.retryState });
  async function body(req) {
    let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 8192) throw new Error('Request too large'); }
    const parsed = JSON.parse(data || '{}'); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object'); return parsed;
  }
  let scheduler;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://local');
      if (req.method === 'GET') {
        if (url.pathname === '/health') return json(res, 200, { ok: true, version: APP_VERSION, latestWorldVersion: LATEST_VERSION });
        if (url.pathname === '/api/research' || url.pathname.startsWith('/api/research/')) {
          const result = research.get(url); return json(res, result.status, result.body);
        }
        if (url.pathname === '/api/state') return json(res, 200, snapshot());
        if (url.pathname === '/api/session') return json(res, 200, { owner: isOwner(req) });
        if (url.pathname === '/api/frames') return json(res, 200, store.frames());
        if (url.pathname.startsWith('/api/frame/')) {
          const frame = store.frame(Number(url.pathname.split('/').pop()));
          return json(res, frame ? 200 : 404, frame ? { appVersion: APP_VERSION, latestWorldVersion: LATEST_VERSION, world: frame, metrics: metrics(frame), places: PLACES } : { error: 'Frame not found' });
        }
        if (url.pathname.startsWith('/api/admin/')) {
          if (!isOwner(req)) return json(res, 401, { error: 'Owner access required' });
          if (url.pathname === '/api/admin/status') {
            if (codex.ready) await codex.readAccount().catch(() => {});
            return json(res, 200, { ...codex.status(), login: codex.login ? { verificationUrl: codex.login.verificationUrl, userCode: codex.login.userCode, failed: codex.login.failed } : null });
          }
          if (url.pathname === '/api/admin/diagnostics') {
            res.setHeader('Content-Disposition', `attachment; filename="village-diagnostics-${diagnostics.bootId}.json"`);
            return json(res, 200, { ...diagnostics.report(20000), runId: store.world.id, activeRequest: runner.activeRequest, requests: decisionLedger(store) });
          }
          if (url.pathname === '/api/admin/models') return json(res, 200, { models: await codex.models() });
          if (url.pathname === '/api/admin/export') {
            res.setHeader('Content-Disposition', `attachment; filename="village-${store.world.id}.json"`);
            return json(res, 200, store.export());
          }
        }
        const files = { '/': ['index.html', 'text/html'], '/theme.js': ['theme.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        if (files[url.pathname]) {
          const [file, type] = files[url.pathname];
          res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
          return res.end(readFileSync(join(root, 'public', file)));
        }
        return json(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin request refused' });
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Use JSON' });
      if (url.pathname === '/api/claim') {
        const b = await body(req);
        if (owner.claimed || typeof b.token !== 'string' || b.token.length > 128 || !equal(hash(b.token), owner.setupHash)) return json(res, 403, { error: 'Owner link is invalid or already used' });
        owner.claimed = true; saveOwner();
        const expiry = String(Date.now() + 30 * 86400000);
        res.setHeader('Set-Cookie', `village_owner=${expiry}.${sign(expiry)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
        return json(res, 200, { owner: true });
      }
      if (!url.pathname.startsWith('/api/admin/') || !isOwner(req)) return json(res, 401, { error: 'Owner access required' });
      const b = await body(req);
      switch (url.pathname) {
        case '/api/admin/owner-link': {
          const token = randomBytes(32).toString('hex');
          owner.setupHash = hash(token); owner.claimed = false; saveOwner();
          return json(res, 200, { token });
        }
        case '/api/admin/connect': return json(res, 200, await codex.connect());
        case '/api/admin/disconnect': batches.pause(); await codex.disconnect(); return json(res, 200, { ok: true });
        case '/api/admin/pause': batches.pause(); return json(res, 200, snapshot());
        case '/api/admin/recover': {
          if (runner.busy || store.world.running) throw new Error('Pause and wait for the current decision first');
          if (store.world.tick >= store.world.maxTicks) throw new Error('This run is complete');
          if (store.world.calls >= store.world.maxCalls) throw new Error('Run attempt budget complete. Start a new run.');
          const generation = runner.generation;
          runner.busy = true;
          try {
            store.save([{kind:'worker_recovery',tick:store.world.tick,source:store.world.mode,
            pendingProposals:store.world.decisionRound?.decisions.length || 0,
            text:'Owner requested a fresh Codex connection and resumption of the saved round; completed proposals and failed attempts retained.'}]);
            if (store.world.mode === 'chatgpt') {
              await codex.stop(); await codex.start(); await codex.readAccount();
              if (!codex.status().connected) throw new Error('Connect ChatGPT before recovering');
            }
            if (runner.generation !== generation) throw new Error('Worker recovery cancelled by owner');
            enableRecovery(store); batches.play();
            return json(res,200,snapshot());
          } finally { runner.busy = false; }
        }
        case '/api/admin/run':
          if (store.world.mode === 'chatgpt') {
            await codex.start(); await codex.readAccount();
            if (!codex.status().connected) throw new Error('Connect ChatGPT before starting');
          }
          enableRecovery(store);
          if ((!batches.batch && store.world.tick >= store.world.maxTicks) || (store.world.tick < store.world.maxTicks && store.world.calls >= store.world.maxCalls && !(hourly(store.world) && store.world.nextDecisionTick >= store.world.maxTicks))) throw new Error('Run attempt budget complete. Start a new run.');
          batches.play(); return json(res, 200, snapshot());
        case '/api/admin/pace': setExecutionPace(store,batches,b.pace); return json(res,200,snapshot());
        case '/api/admin/step': enableRecovery(store); await runner.step(true); return json(res, 200, snapshot());
        case '/api/admin/new':
          if (runner.busy || store.world.running) throw new Error('Pause and wait for the current decision first');
          if (!['demo', 'chatgpt'].includes(b.mode)) throw new Error('Choose demo or chatgpt');
          if (!Object.hasOwn(SCENARIOS, b.scenario ?? (b.economy || b.village || b.life || b.coordination ? 'sustainable' : 'plenty'))) throw new Error('Choose a known scenario');
          if (b.economy !== undefined && typeof b.economy !== 'boolean') throw new Error('Choose whether to enable the village economy');
          if (b.coordination !== undefined && typeof b.coordination !== 'boolean') throw new Error('Choose whether to enable coordinated village life');
          if (b.pace !== undefined && !['fast','watch'].includes(b.pace)) throw new Error('Choose fast or watch execution');
          if (b.life !== undefined && typeof b.life !== 'boolean') throw new Error('Choose whether to enable livelihoods and personal life');
          if (b.village !== undefined && typeof b.village !== 'boolean') throw new Error('Choose whether to enable cooperative village life');
          validateRunCount(b.runCount ?? DEFAULT_RUNS);
          validateDays(b.days ?? DEFAULT_DAYS);
          if (b.socialStart !== undefined && typeof b.socialStart !== 'boolean') throw new Error('Choose whether to encourage introductions');
          if (b.mode === 'chatgpt') {
            const models = await codex.models(); if (!models.some(m => m.id === b.model)) throw new Error('Choose an available model');
          }
          if (runner.busy || store.world.running) throw new Error('Pause and wait for the current decision first');
          batches.create(b.mode, b.mode === 'chatgpt' ? b.model : null, { scenario: b.scenario ?? (b.economy || b.village || b.life || b.coordination ? 'sustainable' : 'plenty'), economy: b.economy ?? false, village: b.village ?? false, life: b.life ?? false, coordination: b.coordination ?? false, reviewHours: b.reviewHours ?? 1, pace: b.pace ?? 'fast', personas: b.personas === true, days: b.days ?? DEFAULT_DAYS, socialStart: b.socialStart ?? true }, b.runCount ?? DEFAULT_RUNS);
          return json(res, 200, snapshot());
        default: return json(res, 404, { error: 'Not found' });
      }
    } catch (e) {
      const safe = e instanceof SyntaxError ? 'Invalid JSON' : e.message;
      // All Codex/provider errors are sanitized inside the adapter, not echoed from upstream.
      if (!res.headersSent) json(res, 400, { error: safe }); else res.end();
    }
  });
  server.requestTimeout = 120000; server.headersTimeout = 15000; server.maxConnections = 100;
  scheduler=createScheduler({store,runner,batches,diagnostics,intervalMs});
  runner.executionStats=()=>scheduler.snapshot();
  return { server, store, runner, codex, diagnostics, batches, close: async () => {
    scheduler.close(); stopHeartbeat(); batches.pause(store.world.running ? 'Server stopped' : store.world.pauseReason); await codex.stop();
    for (let i = 0; i < 25 && runner.busy; i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(resolveClose => server.listening ? server.close(resolveClose) : resolveClose());
    diagnostics.emit({ event: 'server_stop', runId: store.world.id, tick: store.world.tick, calls: store.world.calls, busy: runner.busy });
    store.close();
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  app.server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('AI World Sim listening; runs start paused.'));
  // Account discovery only; never starts inference or a sign-in until the owner asks.
  app.codex.start().catch(() => {});
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close().then(() => process.exit(0)));
}
