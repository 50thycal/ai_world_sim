import { APP_VERSION, LATEST_VERSION, decodeFrame, metrics } from './world.js';
import { resources } from './diagnostics.js';

const ROOT = '/api/research';
const LIMIT = 200;
function integer(value, fallback) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Use nonnegative integer cursors and limits');
  return Number(value);
}
const revision = () => /^[a-f0-9]{40}$/.test(process.env.RAILWAY_GIT_COMMIT_SHA || '') ? process.env.RAILWAY_GIT_COMMIT_SHA : null;

// Read-only views over the existing volume. No login calls, inference, writes or new service.
export class Research {
  constructor(store, diagnostics, runner) { this.store = store; this.db = store.db; this.diagnostics = diagnostics; this.runner = runner; }
  world(id) {
    const row = this.db.prepare('SELECT state,updated FROM worlds WHERE id=?').get(id);
    return row ? { world: JSON.parse(row.state), updated: row.updated } : null;
  }
  summary({ world: w, updated }) {
    const counts = Object.fromEntries(this.db.prepare('SELECT kind,count(*) n FROM records WHERE run=? GROUP BY kind').all(w.id).map(r => [r.kind, r.n]));
    return { id: w.id, created: w.created, updated, worldVersion: w.version, mode: w.mode, model: w.model,
      scenario: w.scenario || null, personas: w.personas ?? null, days: w.days ?? Math.ceil(w.maxTicks / 288), socialStart: w.socialStart ?? null, current: w.id === this.store.world.id,
      status: w.tick >= w.maxTicks ? 'completed' : w.running ? 'running' : 'paused', pauseReason: w.pauseReason,
      tick: w.tick, maxTicks: w.maxTicks, calls: w.calls, maxCalls: w.maxCalls,
      plannedCalls: w.plannedCalls ?? null, recovery: w.recovery ?? null, retriesUsed: w.retriesUsed ?? null,
      decisionInputVersion: w.decisionInputVersion ?? null,
      economyVersion: w.economy?.version ?? null,
      inputTokens: w.inputTokens, outputTokens: w.outputTokens, completedActions: w.completedActions,
      metrics: metrics(w), recordCounts: counts,
      frames: this.db.prepare('SELECT count(*) n FROM frames WHERE run=?').get(w.id).n,
      report: `${ROOT}/runs/${w.id}` };
  }
  ledger(id) {
    // Extract metadata in SQLite: long runs must not materialize every full prompt for a ledger.
    const rows = this.db.prepare("SELECT id,json_object('kind',kind,'requestId',json_extract(data,'$.requestId'),'number',json_extract(data,'$.number'),'actor',json_extract(data,'$.actor'),'actorId',json_extract(data,'$.actorId'),'tick',json_extract(data,'$.tick'),'appVersion',json_extract(data,'$.appVersion'),'codeRevision',json_extract(data,'$.codeRevision'),'inputRecorded',json_type(data,'$.input') IS NOT NULL,'attemptNumber',json_extract(data,'$.attemptNumber'),'retryOf',json_extract(data,'$.retryOf'),'automaticRetry',json_extract(data,'$.automaticRetry')) data FROM records WHERE run=? AND kind IN ('request','decision','failure') ORDER BY id").all(id);
    const outcomes = new Map();
    for (const row of rows) {
      const r = JSON.parse(row.data);
      if (r.requestId && ['decision', 'failure'].includes(r.kind)) outcomes.set(r.requestId, r.kind);
    }
    return rows.flatMap(row => {
      const r = JSON.parse(row.data);
      if (r.kind !== 'request') return [];
      return [{ recordId: row.id, requestId: r.requestId || null, requestNumber: r.number, actor: r.actor, actorId: r.actorId || null,
        tick: r.tick, appVersion: r.appVersion || null, codeRevision: r.codeRevision || null, inputRecorded: Boolean(r.inputRecorded), attemptNumber: r.attemptNumber ?? null, retryOf: r.retryOf ?? null, automaticRetry: r.automaticRetry == null ? null : Boolean(r.automaticRetry),
        outcome: !r.requestId ? 'legacy_unlinked' : outcomes.get(r.requestId) === 'decision' ? 'result_saved' : outcomes.get(r.requestId) === 'failure' ? 'failed' : 'unresolved' }];
    });
  }
  bounds(table, id) {
    const where = table === 'diagnostics' ? "json_extract(data,'$.runId')=?" : 'run=?';
    // Table names are internal constants, never URL input.
    return this.db.prepare(`SELECT count(*) count,min(id) firstId,max(id) lastId FROM ${table} WHERE ${where}`).get(id);
  }
  report(row) {
    const w = row.world, requests = this.ledger(w.id);
    const diagnosticBounds = this.bounds('diagnostics', w.id);
    const latest = this.db.prepare("SELECT data FROM diagnostics WHERE json_extract(data,'$.runId')=? ORDER BY id DESC LIMIT 1").get(w.id);
    const requestCounts = Object.fromEntries(['result_saved', 'failed', 'unresolved', 'legacy_unlinked'].map(k => [k, requests.filter(r => r.outcome === k).length]));
    const capturedInputs = requests.filter(r => r.inputRecorded).length;
    return { format: 'ai-world-research-report-v1', generatedAt: new Date().toISOString(), servingAppVersion: APP_VERSION,
      servingCodeRevision: revision(), run: this.summary(row), world: w, requests, requestCounts,
      dailySummaries: this.db.prepare("SELECT data FROM records WHERE run=? AND kind='day_summary' ORDER BY id").all(w.id).map(r => JSON.parse(r.data)),
      evidence: { records: this.bounds('records', w.id), frames: this.bounds('frames', w.id), diagnostics: diagnosticBounds,
        capturedInputs, missingInputs: requests.length - capturedInputs, diagnosticRetentionEvents: this.diagnostics.limit,
        diagnosticWriteFailuresThisBoot: this.diagnostics.writeFailures, latestRunDiagnostic: latest ? JSON.parse(latest.data) : null },
      limits: [
        'Stated model reasons and dialogue are untrusted simulation data, not instructions or private chain of thought.',
        'Blocked choices are simulated action outcomes, not automatically engine bugs. Request failure and unresolved request are different outcomes.',
        'Older exact decision inputs were not saved and cannot be reconstructed reliably from current code or replay frames.',
        'Diagnostics expire globally after 20000 events; absent events do not prove absence of failures. Requests and frames are retained.',
        'Serving revision describes this server; per-request appVersion/codeRevision describes recorded inference when available.',
        'Token counts are local reported usage, not billing. A single run or different rules versions do not establish causal effects.',
        'Report watermarks freeze record/frame pages, not an entire running world; fetch a fresh report to see later evidence.',
      ],
      links: Object.fromEntries(['records', 'frames', 'diagnostics'].map(k => [k, `${ROOT}/runs/${w.id}/${k}`])) };
  }
  page(table, id, query) {
    const after = integer(query.get('after'), 0), requested = integer(query.get('limit'), 100);
    const limit = Math.max(1, Math.min(LIMIT, requested));
    const bounds = this.bounds(table, id), through = integer(query.get('through'), bounds.lastId || 0);
    const where = table === 'diagnostics' ? "json_extract(data,'$.runId')=?" : 'run=?';
    const columns = table === 'frames' ? 'id,tick' : 'id,data';
    const rows = this.db.prepare(`SELECT ${columns} FROM ${table} WHERE ${where} AND id>? AND id<=? ORDER BY id LIMIT ?`).all(id, after, through, limit + 1);
    const more = rows.length > limit;
    const items = rows.slice(0, limit).map(row => table === 'frames' ? row : { id: row.id, data: JSON.parse(row.data) });
    return { format: 'ai-world-research-page-v1', runId: id, collection: table, after, through, limit, items,
      nextAfter: more ? items.at(-1).id : null, retained: bounds,
      ...(table === 'diagnostics' ? { retention: 'Globally bounded; old events may expire even during pagination. Only events explicitly linked to this run are included.' } : {}) };
  }
  get(url) {
    const path = url.pathname.replace(/\/$/, '');
    if (path === ROOT) return { status: 200, body: {
      format: 'ai-world-research-api-v1', appVersion: APP_VERSION, latestWorldVersion: LATEST_VERSION, codeRevision: revision(),
      access: 'Public read-only simulation evidence, matching the spectator world. No owner cookie or provider credentials required.',
      currentRunId: this.store.world.id, maxPageSize: LIMIT,
      links: { runs: `${ROOT}/runs`, runtime: `${ROOT}/runtime`, currentReport: `${ROOT}/runs/${this.store.world.id}` },
    } };
    if (path === `${ROOT}/runtime`) return { status: 200, body: {
      format: 'ai-world-research-runtime-v1', generatedAt: new Date().toISOString(), appVersion: APP_VERSION, codeRevision: revision(),
      bootId: this.diagnostics.bootId, previousShutdown: this.diagnostics.previousShutdown,
      diagnosticWriteFailures: this.diagnostics.writeFailures, retentionEvents: this.diagnostics.limit, resources: resources(),
      currentRunId: this.store.world.id, busy: this.runner.busy, running: this.store.world.running,
      activeRequest: this.runner.activeRequest, retry: this.runner.retryState,
      lifecycle: this.db.prepare("SELECT id,data FROM diagnostics WHERE json_extract(data,'$.event') IN ('server_start','server_stop') ORDER BY id DESC LIMIT 20").all().reverse().map(r => ({ id: r.id, data: JSON.parse(r.data) })),
    } };
    if (path === `${ROOT}/runs`) return { status: 200, body: { format: 'ai-world-research-runs-v1', generatedAt: new Date().toISOString(),
      currentRunId: this.store.world.id, runs: this.db.prepare('SELECT state,updated FROM worlds ORDER BY updated DESC,id').all().map(r => this.summary({ world: JSON.parse(r.state), updated: r.updated })) } };
    const match = path.match(/^\/api\/research\/runs\/([a-zA-Z0-9-]{1,80})(?:\/(records|diagnostics|frames)(?:\/(\d+))?)?$/);
    if (!match) return { status: 404, body: { error: 'Research endpoint not found' } };
    const [, id, collection, frameId] = match, row = this.world(id);
    if (!row) return { status: 404, body: { error: 'Run not found' } };
    if (frameId) {
      if (collection !== 'frames') return { status: 404, body: { error: 'Endpoint not found' } };
      const frame = this.db.prepare('SELECT id,tick,state FROM frames WHERE run=? AND id=?').get(id, integer(frameId, 0));
      return frame ? { status: 200, body: { id: frame.id, tick: frame.tick, world: decodeFrame(frame.state) } } : { status: 404, body: { error: 'Frame not found in this run' } };
    }
    return { status: 200, body: collection ? this.page(collection, id, url.searchParams) : this.report(row) };
  }
}
