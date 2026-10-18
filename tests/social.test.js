import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWorld, assign, advance, observation, metrics, WorldStore, PLACES, SCENARIOS } from '../src/world.js';
import { Runner } from '../src/runner.js';
const d = (action, target = 'none', item = 'none', message = '') => ({ action, target, item, message, reason: 'Test plan.' });
const finish = w => { const events = []; for (let i = 0; i < 40 && w.agents.some(a => a.task); i++) events.push(...advance(w)); return events; };
const meals = w => w.pantry + w.agents.reduce((n, a) => n + a.inventory.meal, 0);
const temp = async (fn) => { const dir = mkdtempSync(join(tmpdir(), 'village-social-')); const s = new WorldStore(join(dir, 'w.sqlite')); try { await fn(s); } finally { s.close(); rmSync(dir, { recursive: true, force: true }); } };

test('give walks to a moving villager, conserves items and records both sides', () => {
  const w = newWorld(), [a, b] = w.agents; Object.assign(b, { x: PLACES.orchard.x, y: PLACES.orchard.y });
  assign(w, b, d('gather', 'forest')); assign(w, a, d('give', b.id, 'meal'));
  const before = meals(w), events = finish(w);
  const gift = events.find(e => e.kind === 'give');
  assert.equal(gift.targetId, b.id); assert.match(gift.text, /Mira gave a meal to Fen/);
  assert.equal(a.inventory.meal, 0); assert.equal(b.inventory.meal, 2); assert.equal(meals(w), before);
  assert.equal(a.stats.gave, 1); assert.equal(b.stats.received, 1);
  assign(w, a, d('give', b.id, 'meal')); assert.equal(finish(w).at(-1).kind, 'blocked'); assert.equal(a.stats.blocked, 1);
});
test('theft is seen by everyone within hearing range, including the victim, and failed attempts still count', () => {
  const w = newWorld(), [a, b, , , , far] = w.agents; Object.assign(far, { x: 15, y: 1 });
  assign(w, a, d('steal', b.id, 'meal')); const before = meals(w), theft = finish(w).find(e => e.kind === 'steal');
  assert.match(theft.text, /Mira stole a meal from Fen/); assert.equal(meals(w), before);
  assert.equal(a.inventory.meal, 2); assert.equal(b.inventory.meal, 0); assert.equal(b.stats.robbed, 1);
  assert.ok(b.memories.some(m => m.text === theft.text)); assert.ok(!far.memories.some(m => m.text === theft.text));
  assign(w, a, d('steal', b.id, 'meal')); const attempt = finish(w).find(e => e.kind === 'steal');
  assert.match(attempt.text, /tried to steal a meal from Fen but found none/); assert.equal(a.stats.stole, 1); assert.equal(a.stats.stealAttempts, 2);
});
test('take withdraws pantry meals into a private bag; an empty pantry blocks it', () => {
  const w = newWorld(), a = w.agents[0]; w.pantry = 1;
  assign(w, a, d('take', 'square')); finish(w); assert.equal(w.pantry, 0); assert.equal(a.inventory.meal, 2); assert.equal(a.stats.took, 1);
  assert.equal(a.x, PLACES.pantry.x); assign(w, a, d('take', 'pantry')); assert.equal(finish(w).at(-1).kind, 'blocked');
});
test('a well-formed but impossible v3 plan is recorded as blocked without pausing the run', async () => temp(async s => {
  s.reset('chatgpt', 'test-model'); s.world.running = true;
  const plans = [d('gather', 'hearth'), d('give', 'v2', 'meal'), d('steal', 'v1'), d('give', 'square', 'meal'), d('wait'), d('wait')];
  let n = 0; const r = new Runner(s, { decide: async () => ({ decision: plans[n++], usage: {} }) });
  while (s.world.tick < 12) await r.step();
  assert.equal(s.world.running, true); assert.equal(s.records(500).filter(e => e.kind === 'failure').length, 0);
  const blocked = s.records(500).filter(e => e.kind === 'blocked').map(e => e.text);
  assert.deepEqual(blocked.slice(0, 4).sort(), ['Asha could not steal: it needs an item: meal, raw or wood.', 'Bolt could not give: it needs another villager as the target.',
    'Fen could not give: it needs another villager as the target.', 'Mira could not gather: nothing grows there to gather.']);
}));
test('v3 observations show visible appearance but never other villagers bags, memories, reasons or temperaments', () => {
  const w = newWorld('demo', null, { scenario: 'inequality', personas: true }), [a, b] = w.agents;
  b.hunger = 85; b.memories = [{ tick: 0, text: 'PRIVATE_MEMORY' }]; b.lastReason = 'PRIVATE_REASON'; b.inventory.meal = 777;
  const o = observation(w, a), text = JSON.stringify(o), seen = o.nearbyVillagers.find(v => v.id === b.id);
  assert.equal(seen.looks, 'starving'); assert.equal(seen.doing, 'idle'); assert.deepEqual(Object.keys(seen).sort(), ['doing', 'id', 'looks', 'name', 'x', 'y']);
  for (const secret of ['PRIVATE_MEMORY', 'PRIVATE_REASON', '777', b.persona]) assert.ok(!text.includes(secret), secret);
  assert.equal(o.temperament, a.persona); assert.match(o.scenario, /Haves and have-nots/); assert.match(o.rules, /steal takes 1 item/);
  const plain = newWorld(); assert.equal(observation(plain, plain.agents[0]).temperament, undefined);
});
test('scenarios set endowments, and the commons regrows logistically but never from zero', () => {
  const unequal = newWorld('demo', null, { scenario: 'inequality' });
  assert.deepEqual(unequal.agents.map(a => a.inventory.meal), [6, 6, 0, 0, 0, 0]); assert.equal(unequal.scenario.id, 'inequality');
  assert.throws(() => newWorld('demo', null, { scenario: 'utopia' }), /scenario/);
  const w = newWorld('demo', null, { scenario: 'commons' }); for (let i = 0; i < 24; i++) advance(w);
  assert.ok(w.resources.food > 6 && w.resources.food <= 12, String(w.resources.food));
  for (let i = 0; i < 200; i++) advance(w); assert.equal(w.resources.food, 12);
  const bare = newWorld('demo', null, { scenario: 'commons' }); bare.resources.food = 0; for (let i = 0; i < 100; i++) advance(bare); assert.equal(bare.resources.food, 0);
  assert.deepEqual(w.scenario.regrow, SCENARIOS.commons.regrow); w.scenario.regrow.food = 0;
  assert.equal(SCENARIOS.commons.regrow.food, 0.25, 'run copies are independent of the catalog');
});
test('behavior metrics summarize gifts, thefts, starvation and food inequality; legacy runs have none', () => {
  const w = newWorld('demo', null, { scenario: 'inequality' }), m = metrics(w);
  assert.equal(m.foodGini, 0.67); assert.equal(m.gifts, 0); assert.equal(m.starvingHours, 0);
  w.agents[2].hunger = 99; for (let i = 0; i < 12; i++) advance(w); assert.equal(metrics(w).starvingHours, 1);
  const legacy = newWorld(); legacy.version = 'world-v2'; assert.equal(metrics(legacy), null);
});
for (const scenario of Object.keys(SCENARIOS)) test(`the scripted ${scenario} day completes with conserved, non-negative stocks`, async () => temp(async s => {
  s.reset('demo', null, { scenario }); const r = new Runner(s, {});
  while (s.world.tick < 288) await r.step(true);
  assert.equal(s.world.nextDecisionTick, 288); assert.equal(s.records(5000).filter(e => e.kind === 'decision').length, 144);
  for (const a of s.world.agents) { for (const n of Object.values(a.inventory)) assert.ok(n >= 0); assert.ok(a.health >= 1); }
  assert.ok(s.world.resources.food >= 0 && s.world.resources.wood >= 0); assert.equal(s.export().metrics.orchard, s.world.resources.food);
}));
