import { advance, assign, demoDecision, observation } from './world.js';

export class Runner {
  constructor(store, codex) { this.store = store; this.codex = codex; this.busy = false; this.generation = 0; this.pendingName = null; }
  pause(reason = 'Paused by owner') {
    this.generation++; this.store.world.running = false; this.store.world.pauseReason = reason; this.store.save();
  }
  async step(force = false) {
    if (this.busy) throw new Error('A decision round is already in progress');
    const w = this.store.world;
    if (!force && !w.running) return;
    if (w.tick >= w.maxTicks) throw new Error('Pilot complete. Start a new run.');
    this.busy = true; const generation = this.generation;
    try {
      // Every villager in a decision round sees the same frozen world. Resolve only after all answers.
      const due = w.agents.filter(a => !a.task), decisions = [];
      for (const a of due) {
        let decision, usage = {};
        if (w.mode === 'chatgpt') {
          if (w.calls >= w.maxCalls) throw new Error('144-request pilot budget reached');
          if (!w.model) throw new Error('Choose a model for this new ChatGPT run');
          w.calls++; this.store.save([{ kind: 'request', actor: a.name, tick: w.tick, number: w.calls, source: 'chatgpt', model: w.model }]);
          this.pendingName = a.name;
          const result = await this.codex.decide(observation(w, a), w.model);
          decision = result.decision; usage = result.usage;
          w.inputTokens += usage.inputTokens || 0; w.outputTokens += usage.outputTokens || 0;
        } else decision = demoDecision(w, a);
        const record = { kind: 'decision', tick: w.tick, actor: a.name, source: w.mode, model: w.model, decision, usage, pendingRound: true };
        this.store.save([record]); decisions.push([a, decision]);
        if (this.generation !== generation) return;
      }
      if (this.generation !== generation) return;
      for (const [a, d] of decisions) assign(w, a, d);
      const events = advance(w);
      this.store.save([{ kind: 'round', tick: w.tick - 1, source: w.mode, actors: decisions.map(([a]) => a.id), decisionsApplied: true }, ...events], true);
    } catch (e) {
      this.pause(e.message);
      this.store.save([{ kind: 'failure', tick: w.tick, text: e.message, source: w.mode }], true);
      throw e;
    } finally { this.busy = false; this.pendingName = null; }
  }
}
