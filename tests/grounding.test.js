import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorld, observation, GROUNDED_INPUT, MIN_EAT_HUNGER, PLACES, WorldStore, advance } from '../src/world.js';
import { CodexClient, instructionsFor, INSTRUCTIONS } from '../src/codex.js';
import { Runner } from '../src/runner.js';
import { Diagnostics } from '../src/diagnostics.js';
import { Research } from '../src/research.js';

test('Asha incident: current facts precede history and old rationales cannot become current facts', () => {
  const w = newWorld('chatgpt', 'test-model', { scenario: 'sustainable' }), a = w.agents[2];
  w.tick = 108; a.hunger = 76.60000000000028; a.inventory = { raw: 1, wood: 0, meal: 6 };
  const stale = 'Hunger is below the eating threshold.';
  a.plans = [{ tick: 96, action: 'cook', target: 'hearth', item: 'none', reason: stale }];
  a.task = { action: 'gather', target: 'forest', item: 'wood', work: 1, reason: stale, message: 'Old intention.' };
  const before = structuredClone(w), o = observation(w, a);
  assert.equal(Object.keys(o)[0], 'currentFacts');
  assert.equal(o.currentFacts.asOfTick, 108); assert.equal(o.currentFacts.hunger, a.hunger);
  assert.equal(o.currentFacts.inventory.meal, 6); assert.equal(o.currentFacts.eating.minimumHunger, MIN_EAT_HUNGER);
  assert.equal(o.currentFacts.eating.hungerRequirementMet, true); assert.equal(o.currentFacts.eating.canEatNow, true);
  assert.deepEqual(o.currentTask, { action: 'gather', target: 'forest', item: 'wood', work: 1 });
  assert.deepEqual(o.myRecentPlans, [{ minute: 480, action: 'cook', target: 'hearth', item: 'none' }]);
  assert.ok(!JSON.stringify(o).includes(stale)); assert.deepEqual(w, before);
  o.currentFacts.inventory.meal = 0; assert.equal(a.inventory.meal, 6);
});

test('eligibility handles exact thresholds and reachable food without revealing other bags or remote pantry', () => {
  const w = newWorld(), a = w.agents[0];
  a.inventory = { raw: 0, wood: 0, meal: 1 };
  for (const hunger of [0, 39.999999999, 40, 76.6, 94.9999, 95, 100]) {
    a.hunger = hunger; const f = observation(w, a).currentFacts;
    assert.equal(f.eating.hungerRequirementMet, hunger >= 40);
    assert.equal(f.eating.canEatNow, hunger >= 40);
    assert.equal(f.starvationDamage.activeNow, hunger >= 95);
  }
  a.hunger = 80; a.inventory.meal = 0; a.x = 0; a.y = 0;
  w.agents[1].inventory.meal = 98765; w.pantry = 87654;
  let o = observation(w, a);
  assert.equal(o.currentFacts.eating.canEatNow, false); assert.deepEqual(o.currentFacts.eating.reachableFoodSources, []);
  assert.ok(!JSON.stringify(o).includes('98765')); assert.ok(!JSON.stringify(o).includes('87654'));
  Object.assign(a, PLACES.pantry); o = observation(w, a);
  assert.deepEqual(o.currentFacts.eating.reachableFoodSources, ['pantry_meal']); assert.equal(o.currentFacts.eating.canEatNow, true);
  w.pantry = 0; a.inventory.raw = 1; o = observation(w, a);
  assert.deepEqual(o.currentFacts.eating.reachableFoodSources, ['carried_raw']); assert.equal(o.currentFacts.eating.rawFoodHealthCost, 8);
});

test('saved v4 inputs remain legacy across reload; new runs explicitly record their treatment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'grounding-history-')); let s = new WorldStore(join(dir, 'w.sqlite'));
  try {
    delete s.world.decisionInputVersion;
    s.world.agents[0].plans = [{ tick: 0, action: 'wait', target: 'none', item: 'none', reason: 'Historical explanation.' }];
    const before = observation(s.world, s.world.agents[0]); s.save(); s.close(); s = new WorldStore(join(dir, 'w.sqlite'));
    assert.deepEqual(observation(s.world, s.world.agents[0]), before); assert.equal(before.currentFacts, undefined);
    assert.equal(before.myRecentPlans[0].reason, 'Historical explanation.'); assert.equal(instructionsFor(null), INSTRUCTIONS);
    const research = new Research(s, new Diagnostics(s.db, { log() {} }), new Runner(s, {}));
    assert.equal(research.summary({ world: s.world }).decisionInputVersion, null);
    s.reset('demo', null, { scenario: 'sustainable' });
    assert.equal(s.world.decisionInputVersion, GROUNDED_INPUT);
    assert.equal(research.summary({ world: s.world }).decisionInputVersion, GROUNDED_INPUT);
    for (const version of ['world-v1', 'world-v2', 'world-v3']) {
      s.world.version = version; assert.equal(observation(s.world, s.world.agents[0]).currentFacts, undefined);
    }
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('recorded input and instructions match the real adapter wire in both new and legacy runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grounding-wire-')), s = new WorldStore(join(dir, 'w.sqlite'));
  const binary = fileURLToPath(new URL('./fake-codex.js', import.meta.url)); chmodSync(binary, 0o755);
  const c = new CodexClient({ dataDir: dir, binary }), runner = new Runner(s, c);
  try {
    for (const grounded of [true, false]) {
      s.reset('chatgpt', 'test-model', { scenario: 'sustainable' });
      if (!grounded) delete s.world.decisionInputVersion;
      const a = s.world.agents[0]; a.name = 'CaptureGrounding'; a.hunger = 76.6; a.inventory.meal = 6;
      const { record } = await runner.proposal(s.world, a); s.save([record]); runner.persisted();
      const saved = s.records().find(r => r.kind === 'request').input;
      const wire = JSON.parse(readFileSync(join(dir, 'codex', 'test-protocol.json'), 'utf8'));
      assert.deepEqual(JSON.parse(wire.turn.input[0].text), saved.observation);
      assert.deepEqual(wire.turn.outputSchema, saved.outputSchema); assert.equal(wire.turn.effort, saved.effort);
      assert.equal(wire.thread.baseInstructions, saved.instructions);
      assert.equal(saved.decisionInputVersion, grounded ? GROUNDED_INPUT : null);
      assert.equal(Boolean(saved.observation.currentFacts), grounded);
      // The fake model's choice remains a wait even though it can eat. No replacement or extra inference.
      assert.equal(record.decision.action, 'wait'); assert.equal(s.world.calls, 1);
      assert.equal(a.inventory.meal, 6); assert.equal(s.world.tick, 0);
    }
  } finally { await c.stop(); s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('renewable supply does not stop starvation when residents choose not to use food', () => {
  const w = newWorld('demo', null, { scenario: 'sustainable' });
  for (let i = 0; i < 288; i++) advance(w);
  assert.ok(w.agents.every(a => a.health < 100 && a.stats.starvingTicks > 0));
  assert.equal(w.resources.food, 24); assert.equal(w.resources.wood, 24); assert.equal(w.pantry, 12);
  assert.ok(w.agents.every(a => a.inventory.meal === 1));
});
