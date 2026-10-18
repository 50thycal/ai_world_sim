import { randomUUID } from 'node:crypto';
import { failureCode } from './diagnostics.js';
import { INSTRUCTIONS } from './codex.js';
import { advance, assign, demoDecision, observation, decisionSchema, hourly, decisionDue, DECISION_INTERVAL, routineOnly, APP_VERSION } from './world.js';

export class Runner {
  constructor(store, codex, diagnostics = { emit() {} }) { this.diagnostics = diagnostics; this.activeRequest = null; this.store = store; this.codex = codex; this.busy = false; this.generation = 0; this.pendingName = null; }
  pause(reason = 'Paused by owner') {
    this.generation++; this.store.world.running = false; this.store.world.pauseReason = reason; this.store.save();
  }
  async proposal(w, a) {
    let decision, usage = {};
    if (w.mode === 'chatgpt') {
      if (w.calls >= w.maxCalls) throw new Error('144-request pilot budget reached');
      if (!w.model) throw new Error('Choose a model for this new ChatGPT run');
      const requestId = randomUUID();
      const input = observation(w, a);
      // Scientific evidence only: the exact closed-world input, never host/account state.
      w.calls++; this.store.save([{ kind: 'request', requestId, requestedAt: new Date().toISOString(), appVersion: APP_VERSION, actor: a.name, actorId: a.id, tick: w.tick, number: w.calls, source: 'chatgpt', model: w.model,
        codeRevision: /^[a-f0-9]{40}$/.test(process.env.RAILWAY_GIT_COMMIT_SHA || '') ? process.env.RAILWAY_GIT_COMMIT_SHA : null,
        input: { observation: input, instructions: INSTRUCTIONS, outputSchema: decisionSchema(w.version), effort: 'low' } }]);
      this.pendingName = a.name;
      const context = { requestId, runId: w.id, worldVersion: w.version, actorId: a.id, tick: w.tick, requestNumber: w.calls };
      this.activeRequest = context;
      this.diagnostics.emit({ event: 'decision_requested', ...context, model: w.model });
      let result;
      try { result = await this.codex.decide(input, w.model, context); }
      catch (error) { this.diagnostics.emit({ event: 'decision_failed', ...context, failureCode: failureCode(error) }); throw error; }
      decision = result.decision; usage = result.usage || {};
      w.inputTokens += usage.inputTokens || 0; w.outputTokens += usage.outputTokens || 0;
    } else decision = demoDecision(w, a);
    return { decision, record: { kind: 'decision', ...(this.activeRequest ? { requestId: this.activeRequest.requestId } : {}), appVersion: APP_VERSION, tick: w.tick, actor: a.name, source: w.mode, model: w.model, decision, usage, pendingRound: true } };
  }
  persisted() {
    if (this.activeRequest) this.diagnostics.emit({ event: 'decision_persisted', ...this.activeRequest, pendingProposals: this.store.world.decisionRound?.decisions.length || 0 });
    this.activeRequest = null;
  }
  tick(records = []) { const events = advance(this.store.world); this.store.save([...records, ...events], true); }
  async step(force = false) {
    if (this.busy) throw new Error('A decision round is already in progress');
    const w = this.store.world;
    if (!force && !w.running) return;
    if (w.tick >= w.maxTicks) throw new Error('Pilot complete. Start a new run.');
    this.busy = true; const generation = this.generation;
    try {
      let decisions = [], reviewed = false;
      // All proposals see the same frozen physical world. Apply only after the complete round.
      if (hourly(w)) {
        if (decisionDue(w)) {
          reviewed = true;
          w.decisionRound ||= { tick: w.nextDecisionTick, decisions: [] };
          for (const a of w.agents) {
            if (w.decisionRound.decisions.some(d => d.actorId === a.id)) continue;
            const { decision, record } = await this.proposal(w, a);
            w.decisionRound.decisions.push({ actorId: a.id, decision });
            // A pause/restart preserves completed proposals; resuming does not buy them again.
            this.store.save([record]); this.persisted();
            if (this.generation !== generation) return;
          }
          decisions = w.decisionRound.decisions.map(d => [w.agents.find(a => a.id === d.actorId), d.decision]);
        }
      } else {
        reviewed = true;
        for (const a of w.agents.filter(a => !a.task)) {
          const { decision, record } = await this.proposal(w, a);
          this.store.save([record]); this.persisted(); decisions.push([a, decision]);
          if (this.generation !== generation) return;
        }
      }
      if (this.generation !== generation) return;
      for (const [a, d] of decisions) assign(w, a, d);
      if (reviewed && hourly(w)) { w.nextDecisionTick += DECISION_INTERVAL; w.decisionRound = null; }
      this.tick(reviewed ? [{ kind: 'round', appVersion: APP_VERSION, tick: w.tick, source: w.mode, actors: decisions.map(([a]) => a.id), decisionsApplied: true }] : []);
      if (reviewed) this.diagnostics.emit({ event: 'round_persisted', runId: w.id, worldVersion: w.version, tick: w.tick, calls: w.calls, completedActions: w.completedActions });
      const fromTick = w.tick;
      while (w.tick < w.maxTicks && !decisionDue(w) && routineOnly(w)) { w.skippedTicks++; this.tick(); }
      if (w.tick > fromTick) this.store.save([{ kind: 'time_skip', appVersion: APP_VERSION, tick: w.tick, fromTick, toTick: w.tick,
        text: `Advanced ${(w.tick - fromTick) * 5} quiet minutes of idle time or routine rest.`, source: w.mode }]);
    } catch (e) {
      this.diagnostics.emit({ event: 'run_failed', runId: w.id, tick: w.tick, requestId: this.activeRequest?.requestId, failureCode: failureCode(e) });
      this.pause(e.message);
      this.store.save([{ kind: 'failure', ...(this.activeRequest ? { requestId: this.activeRequest.requestId } : {}), appVersion: APP_VERSION, tick: w.tick, text: e.message, source: w.mode }], true);
      throw e;
    } finally { this.busy = false; this.pendingName = null; this.activeRequest = null; }
  }
}
