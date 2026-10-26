import { randomUUID } from 'node:crypto';
import { newWorld, metrics, APP_VERSION, MAX_SAVED_RUNS } from './world.js';

export const DEFAULT_RUNS = 5;
export function validateRunCount(n) {
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('Choose 1–10 separate runs');
  return n;
}
export function batchReport(store, b) {
  if (!b) return null;
  const runs = b.runIds.map(id => {
    const row = store.db.prepare('SELECT state FROM worlds WHERE id=?').get(id);
    const w = JSON.parse(row.state), completed = w.tick >= w.maxTicks;
    const failures = store.db.prepare("SELECT count(*) n FROM records WHERE run=? AND kind='failure'").get(id).n;
    return { id, index: w.batch.index, worldVersion: w.version, mode: w.mode, model: w.model,
      experiment:w.living?{condition:w.living.condition,visitor:w.living.visitor.enabled,competitive:w.living.competitive}:null, reviewHours:w.reviewHours||1, executionPace:w.execution?.pace||'watch', decisionInputVersion:w.decisionInputVersion||null,
      status: completed ? 'completed' : w.running ? 'running' : 'paused', tick: w.tick, maxTicks: w.maxTicks,
      calls: w.calls, failures, retriesUsed: w.retriesUsed, pauseReason: w.pauseReason, metrics: metrics(w),
      report: `/api/research/runs/${id}` };
  });
  const complete = runs.filter(r => r.status === 'completed'), keys = Object.keys(complete[0]?.metrics || {});
  const aggregate = Object.fromEntries(keys.map(k => {
    const values = complete.map(r => r.metrics[k]).filter(Number.isFinite);
    return [k, { mean: Math.round(values.reduce((n,v) => n+v,0)/values.length*100)/100, min: Math.min(...values), max: Math.max(...values) }];
  }));
  return { ...b, completedRuns: complete.length, pendingRuns: b.count - runs.length, runs, aggregate,
    comparison: 'Independent fresh villages with identical settings; no learning between runs. Aggregates include completed runs only. Pauses and failures remain visible. Repetition measures variation within this condition, not a causal comparison with other versions.' };
}
// Serial queue: a single inference worker and existing SQLite volume. The world and
// queue cursor commit together, so a crash cannot lose a run or create it twice.
export class Batches {
  constructor(store, runner) {
    this.store = store; this.runner = runner;
    const id = store.world.batch?.id;
    this.batch = id ? JSON.parse(store.db.prepare('SELECT state FROM batches WHERE id=?').get(id)?.state || 'null') : null;
    if (this.batch?.status === 'running') { this.batch.status = 'paused'; this.batch.reason = 'Server restarted; press Play to resume the batch'; store.save([], false, this.batch); }
  }
  create(mode, model, options, count = DEFAULT_RUNS) {
    validateRunCount(count);
    this.store.checkStorage();
    const used = this.store.db.prepare('SELECT count(*) n FROM worlds').get().n;
    if (used + count > MAX_SAVED_RUNS) throw new Error(`This batch needs ${count} saved-run slots; ${MAX_SAVED_RUNS-used} remain. Existing evidence is retained. Choose fewer runs or archive saved evidence before retrying.`);
    // Validate/build before cancelling any existing batch.
    const w = newWorld(mode, model, options);
    if (this.batch && !['completed','cancelled'].includes(this.batch.status)) {
      this.batch.status = 'cancelled'; this.batch.reason = 'Replaced by an owner-created batch'; this.store.save([],false,this.batch);
    }
    const b = { id: randomUUID(), version: 1, created: new Date().toISOString(), status: 'paused', reason: 'Ready to start',
      count, mode, model, appVersion: APP_VERSION, worldVersion: w.version, codeRevision: /^[a-f0-9]{40}$/.test(process.env.RAILWAY_GIT_COMMIT_SHA || '') ? process.env.RAILWAY_GIT_COMMIT_SHA : null, options: structuredClone(options), runIds: [w.id] };
    w.batch = { id: b.id, index: 1, count }; this.batch = b; this.store.world = w;
    this.runner.generation++; this.store.save([{ kind: 'batch_run', tick: 0, batchId: b.id, index: 1, count }], true, b);
  }
  play() {
    if (this.batch?.status === 'completed') throw new Error('Batch complete. Create a fresh batch.');
    if (this.batch && this.store.world.batch?.id === this.batch.id) { this.batch.status = 'running'; this.batch.reason = ''; }
    this.store.world.running = this.store.world.tick < this.store.world.maxTicks;
    this.store.world.pauseReason = ''; this.store.save([], false, this.batch);
    this.advance();
  }
  pause(reason = 'Paused by owner') {
    this.runner.pause(reason);
    if (this.batch && this.batch.status !== 'completed') {
      this.batch.status = 'paused'; this.batch.reason = reason; this.store.save([],false,this.batch);
    }
  }
  advance() {
    const b = this.batch, w = this.store.world;
    if (!b || b.status !== 'running' || this.runner.busy || w.batch?.id !== b.id || w.running) return;
    if (w.tick < w.maxTicks) { b.status = 'paused'; b.reason = w.pauseReason || 'Run paused; review before continuing'; this.store.save([],false,b); return; }
    if (b.runIds.length === b.count) { b.status = 'completed'; b.reason = `${b.count} separate runs complete`; this.store.save([],false,b); return; }
    const next = newWorld(b.mode, b.model, b.options);
    if (next.version !== b.worldVersion) { b.status = 'paused'; b.reason = 'World version changed; create a fresh batch to keep conditions comparable'; this.store.save([],false,b); return; }
    next.batch = { id: b.id, index: b.runIds.length+1, count: b.count }; next.running = true; next.pauseReason = '';
    b.runIds.push(next.id); this.store.world = next;
    this.store.save([{ kind: 'batch_run', tick: 0, batchId: b.id, index: next.batch.index, count: b.count }], true, b);
  }
  report() { return batchReport(this.store, this.batch); }
}
