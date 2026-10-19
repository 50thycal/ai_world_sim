import { randomUUID } from 'node:crypto';
import { failureCode } from './diagnostics.js';
import { instructionsFor } from './codex.js';
import { slotAttempts, retriesUsed, transientFailure, RETRY_DELAYS } from './recovery.js';
import { advance, assign, demoDecision, observation, decisionSchema, groundedInput, hourly, decisionDue, DECISION_INTERVAL, routineOnly, APP_VERSION } from './world.js';

export class Runner {
  constructor(store, codex, diagnostics = { emit() {} }, { retryDelays = RETRY_DELAYS } = {}) {
    this.diagnostics = diagnostics; this.activeRequest = null; this.store = store; this.codex = codex; this.busy = false; this.generation = 0; this.pendingName = null;
    this.retryDelays = retryDelays; this.retryState = null; this.retryWait = null;
  }
  pause(reason = 'Paused by owner') {
    this.generation++; this.retryWait?.cancel(); this.retryState = null;
    this.store.world.running = false; this.store.world.pauseReason = reason; this.store.save();
  }
  waitForRetry(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.retryWait = null; resolve(true); }, ms);
      this.retryWait = { cancel: () => { clearTimeout(timer); this.retryWait = null; resolve(false); } };
    });
  }
  cancelled() { const error = new Error('Decision recovery cancelled by owner'); error.cancelled = true; return error; }
  async proposal(w, a, generation = this.generation) {
    let decision, usage = {};
    if (w.mode === 'chatgpt') {
      if (w.calls >= w.maxCalls) throw new Error(`${w.maxCalls}-request run budget reached`);
      if (!w.model) throw new Error('Choose a model for this new ChatGPT run');
      const input = observation(w, a);
      const decisionInputVersion = groundedInput(w) ? w.decisionInputVersion : null;
      const policy = w.version === 'world-v4' ? w.recovery : null;
      let result;
      for (let automaticRetry = 0; ; automaticRetry++) {
        if (this.generation !== generation) throw this.cancelled();
        if (w.calls >= w.maxCalls) throw new Error(`${w.maxCalls}-request run budget reached`);
        const slot = policy ? slotAttempts(this.store, a) : { count: 0, previousRequestId: null };
        const used = policy ? w.retriesUsed ?? retriesUsed(this.store) : 0;
        if (policy && slot.count && used >= policy.retryLimit) throw new Error('Run retry allowance exhausted; paused for owner review');
        const requestId = randomUUID();
        if (policy && slot.count) w.retriesUsed = used + 1;
        // Scientific evidence only: the exact closed-world input, never host/account state.
        w.calls++; this.store.save([{ kind: 'request', requestId, requestedAt: new Date().toISOString(), appVersion: APP_VERSION, actor: a.name, actorId: a.id, tick: w.tick, number: w.calls, source: 'chatgpt', model: w.model,
          codeRevision: /^[a-f0-9]{40}$/.test(process.env.RAILWAY_GIT_COMMIT_SHA || '') ? process.env.RAILWAY_GIT_COMMIT_SHA : null,
          ...(policy ? { attemptNumber: slot.count + 1, retryOf: slot.previousRequestId, automaticRetry: automaticRetry > 0, recoveryPolicyVersion: policy.version } : {}),
          input: { observation: input, instructions: instructionsFor(decisionInputVersion), outputSchema: decisionSchema(w.version), effort: 'low', decisionInputVersion } }]);
        this.pendingName = a.name;
        const context = { requestId, runId: w.id, worldVersion: w.version, actorId: a.id, tick: w.tick, requestNumber: w.calls, decisionInputVersion };
        this.activeRequest = context;
        this.diagnostics.emit({ event: 'decision_requested', ...context, model: w.model });
        try { result = await this.codex.decide(input, w.model, context); }
        catch (error) {
          const code = failureCode(error);
          this.diagnostics.emit({ event: 'decision_failed', ...context, failureCode: code });
          this.store.save([{ kind: 'failure', requestId, appVersion: APP_VERSION, tick: w.tick, actorId: a.id, failureCode: code, text: error.message, source: w.mode }]);
          error.failureRecorded = true;
          if (this.generation !== generation) throw this.cancelled();
          if (!policy || !transientFailure(code, error.httpStatusCode)) throw error;
          if (automaticRetry >= policy.maxAutomaticRetries || w.retriesUsed >= policy.retryLimit || w.calls >= w.maxCalls) {
            error.message += '; automatic recovery exhausted, paused for owner review';
            throw error;
          }
          const delayMs = this.retryDelays[automaticRetry] ?? this.retryDelays.at(-1);
          this.activeRequest = null;
          this.retryState = { actorId: a.id, actor: a.name, requestId, retryAt: new Date(Date.now() + delayMs).toISOString(), delayMs };
          this.store.save([{ kind: 'retry_scheduled', tick: w.tick, requestId, actorId: a.id, failureCode: code, delayMs,
            text: `${a.name}'s temporary inference failure will be retried after ${delayMs / 1000} seconds; simulation time is frozen.` }]);
          this.diagnostics.emit({ event: 'retry_scheduled', ...context, failureCode: code, retryDelayMs: delayMs, retriesUsed: w.retriesUsed, retryLimit: policy.retryLimit });
          const proceed = await this.waitForRetry(delayMs); this.retryState = null;
          if (!proceed || this.generation !== generation) throw this.cancelled();
          continue;
        }
        break;
      }
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
      if (e.cancelled) return;
      this.diagnostics.emit({ event: 'run_failed', runId: w.id, tick: w.tick, requestId: this.activeRequest?.requestId, failureCode: failureCode(e) });
      this.pause(e.message);
      this.store.save(e.failureRecorded ? [] : [{ kind: 'failure', ...(this.activeRequest ? { requestId: this.activeRequest.requestId } : {}), appVersion: APP_VERSION, tick: w.tick, text: e.message, source: w.mode }], true);
      throw e;
    } finally { this.busy = false; this.pendingName = null; this.activeRequest = null; this.retryState = null; }
  }
}
