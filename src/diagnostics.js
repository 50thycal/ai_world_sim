import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { APP_VERSION } from './world.js';

const number = value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
export function resources(read = path => readFileSync(path, 'utf8')) {
  const get = path => { try { return read(path).trim(); } catch { return null; } };
  const bytes = get('/sys/fs/cgroup/memory.current'), limit = get('/sys/fs/cgroup/memory.max');
  const events = get('/sys/fs/cgroup/memory.events');
  const counters = {};
  for (const key of ['oom', 'oom_kill', 'max']) counters[key] = events?.match(new RegExp(`^${key} (\\d+)$`, 'm'))?.[1] ?? null;
  return { memoryMB: number(bytes) === null ? null : number(bytes) / 1e6,
    memoryLimitMB: number(limit) === null ? null : number(limit) / 1e6,
    oomKills: counters.oom_kill === null ? null : number(counters.oom_kill),
    oomEvents: counters.oom === null ? null : number(counters.oom),
    memoryMaxEvents: counters.max === null ? null : number(counters.max),
    nodeRssMB: process.memoryUsage().rss / 1e6 };
}

export function failureCode(error) {
  if (error?.diagnosticCode) return error.diagnosticCode;
  const message = String(error?.message || '');
  if (/timed out/i.test(message)) return 'timeout';
  if (/memory limit reached/i.test(message)) return 'memory_kill_observed';
  if (/stopped|closed|binary unavailable/i.test(message)) return 'worker_transport';
  if (/JSON|decision|action|target/i.test(message) || error instanceof SyntaxError) return 'invalid_decision';
  if (/subscription limits|Model turn failed/i.test(message)) return 'provider_turn_failed';
  return 'unclassified';
}

// A separate bounded table: diagnostics retention never deletes scientific run evidence.
export class Diagnostics {
  constructor(db, { log = event => console.info(JSON.stringify(event)), limit = 20000 } = {}) {
    this.db = db; this.log = log; this.limit = Math.max(100, limit); this.bootId = randomUUID(); this.writeFailures = 0;
    db.exec('CREATE TABLE IF NOT EXISTS diagnostics (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    db.exec("CREATE INDEX IF NOT EXISTS diagnostics_run ON diagnostics(json_extract(data,'$.runId'),id)");
    const last = db.prepare('SELECT data FROM diagnostics ORDER BY id DESC LIMIT 1').get();
    const previous = last ? JSON.parse(last.data) : null;
    this.previousShutdown = !previous ? 'unknown' : previous.event === 'server_stop' && !previous.busy ? 'clean' : 'unclean_or_incomplete';
    this.insert = db.prepare('INSERT INTO diagnostics(data) VALUES (?)');
    this.trim = db.prepare('DELETE FROM diagnostics WHERE id <= (SELECT id FROM diagnostics ORDER BY id DESC LIMIT 1 OFFSET ?)');
    this.emit({ event: 'server_start', previousShutdown: this.previousShutdown });
  }
  emit(event) {
    // Explicit scalar allowlist. Never accept arbitrary provider bodies, prompts or credentials.
    const safe = { timestamp: new Date().toISOString(), bootId: this.bootId, appVersion: APP_VERSION, diagnosticsVersion: 1 };
    const revision = process.env.RAILWAY_GIT_COMMIT_SHA;
    if (/^[a-f0-9]{40}$/.test(revision || '')) safe.codeRevision = revision;
    const strings = ['event', 'runId', 'requestId', 'actorId', 'worldVersion', 'model', 'phase', 'role', 'signal', 'failureCode', 'previousShutdown', 'providerCode', 'rpcMethod', 'rpcErrorClass'];
    const numbers = ['tick', 'requestNumber', 'pid', 'code', 'durationMs', 'cleanupMs', 'observationBytes', 'inputTokens', 'outputTokens', 'memoryMB', 'memoryLimitMB', 'nodeRssMB', 'peakMemoryMB', 'samples', 'oomKills', 'oomEvents', 'memoryMaxEvents', 'eventLoopDelayMaxMs', 'pendingProposals', 'calls', 'completedActions', 'httpStatusCode', 'retryDelayMs', 'retriesUsed', 'retryLimit', 'rpcErrorCode'];
    for (const key of strings) if (typeof event[key] === 'string') safe[key] = event[key].slice(0, 160);
    for (const key of numbers) {
      if (event[key] === null) safe[key] = null;
      else if (typeof event[key] === 'number' && Number.isFinite(event[key])) safe[key] = event[key];
    }
    for (const key of ['expected', 'connected', 'oomKillObserved', 'running', 'busy', 'willRetry', 'messageReceived', 'usageReceived']) if (typeof event[key] === 'boolean') safe[key] = event[key];
    try { this.insert.run(JSON.stringify(safe)); this.trim.run(this.limit); }
    catch { this.writeFailures++; }
    try { this.log(safe); } catch { /* Diagnostics must not change simulation outcomes. */ }
  }
  report(limit = 1000) {
    return { format: 'ai-world-diagnostics-v1', appVersion: APP_VERSION, bootId: this.bootId,
      previousShutdown: this.previousShutdown, writeFailures: this.writeFailures, retentionEvents: this.limit,
      resources: resources(), events: this.db.prepare('SELECT data FROM diagnostics ORDER BY id DESC LIMIT ?').all(Math.min(20000, Math.max(1, limit))).reverse().map(row => JSON.parse(row.data)) };
  }
}

export function decisionLedger(store) {
  const records = store.db.prepare("SELECT json_extract(data,'$.kind') kind,json_extract(data,'$.requestId') requestId,json_extract(data,'$.number') number,json_extract(data,'$.tick') tick,json_extract(data,'$.appVersion') appVersion FROM records WHERE run=? AND kind IN ('request','decision','failure') ORDER BY id").all(store.world.id);
  const outcomes = new Map(records.filter(r => r.requestId && ['decision', 'failure'].includes(r.kind)).map(r => [r.requestId, r.kind]));
  return records.filter(r => r.kind === 'request').map(r => ({ requestId: r.requestId || null, requestNumber: r.number,
    tick: r.tick, appVersion: r.appVersion || null,
    outcome: !r.requestId ? 'legacy_unlinked' : outcomes.get(r.requestId) === 'decision' ? 'result_saved' : outcomes.get(r.requestId) === 'failure' ? 'failed' : 'unresolved' }));
}

export function heartbeat(diagnostics, runner, store, { intervalMs = 15000 } = {}) {
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  const timer = setInterval(() => {
    const w = store.world;
    diagnostics.emit({ event: 'heartbeat', runId: w.id, worldVersion: w.version, tick: w.tick, calls: w.calls,
      running: w.running, busy: runner.busy, requestId: runner.activeRequest?.requestId,
      phase: runner.retryState ? 'retry_backoff' : runner.activeRequest ? 'inference_or_save' : runner.busy ? 'simulation' : 'idle',
      pendingProposals: w.decisionRound?.decisions.length || 0, completedActions: w.completedActions,
      eventLoopDelayMaxMs: delay.max / 1e6, ...resources() });
    delay.reset();
  }, intervalMs); timer.unref();
  return () => { clearInterval(timer); delay.disable(); };
}
