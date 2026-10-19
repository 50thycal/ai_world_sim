import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWorld, advance, assign, observation, metrics, WorldStore } from '../src/world.js';

const ticks = (w, count) => { for (let i = 0; i < count; i++) advance(w); };

test('renewable sites recover from zero on a two-hour cadence without banking growth above capacity', () => {
  const w = newWorld('demo', null, { scenario: 'sustainable' });
  w.resources = { food: 0, wood: 0 };
  ticks(w, 23); assert.deepEqual(w.resources, { food: 0, wood: 0 });
  // Fractional replenishment survives a serialized checkpoint/restart.
  const resumed = JSON.parse(JSON.stringify(w)); ticks(resumed, 1);
  assert.deepEqual(resumed.resources, { food: 1, wood: 1 });
  assert.deepEqual(w.resources, { food: 0, wood: 0 });
  const full = newWorld('demo', null, { scenario: 'sustainable' }); ticks(full, 240);
  assert.deepEqual(full.resources, { food: 24, wood: 24 });
  full.resources = { food: 0, wood: 0 }; ticks(full, 23);
  assert.deepEqual(full.resources, { food: 0, wood: 0 }); ticks(full, 1);
  assert.deepEqual(full.resources, { food: 1, wood: 1 });
  const commons = newWorld('demo', null, { scenario: 'commons' }); commons.resources.food = 0;
  ticks(commons, 288); assert.equal(commons.resources.food, 0); assert.equal(commons.resources.wood, 12);
});

test('new condition text describes initial stocks; current resource visibility remains local', () => {
  const w = newWorld('demo', null, { scenario: 'plenty' }), a = w.agents[0];
  w.resources = { food: 0, wood: 0 };
  assert.match(observation(w, a).scenario, /starts with 70/);
  assert.doesNotMatch(observation(w, a).scenario, /are abundant/);
  const renewable = newWorld('demo', null, { scenario: 'sustainable' }), b = renewable.agents[0];
  assert.match(observation(renewable, b).scenario, /including after reaching zero/);
  assert.deepEqual(observation(renewable, b).localResources, {});
  b.x = 3; b.y = 4;
  assert.deepEqual(observation(renewable, b).localResources, { orchard: 24 });
  renewable.agents[1].inventory.meal = 98765;
  assert.ok(!JSON.stringify(observation(renewable, b)).includes('98765'));
});

// Feasibility control, not villager/model behavior: each resident uses only their own observation.
// This deliberately simple policy includes no sharing, hidden bag access or emergency food injection.
function referenceDecision(o) {
  let action = 'wait', target = 'none';
  if (o.hunger >= 45 && o.inventory.meal) action = 'eat';
  else if (o.currentTask) action = 'continue';
  else if (o.energy < 25) { action = 'rest'; target = 'shelter'; }
  else if (o.inventory.raw && o.inventory.wood) { action = 'cook'; target = 'hearth'; }
  else { action = 'gather'; target = o.inventory.raw ? 'forest' : 'orchard'; }
  return { action, target, item: 'none', message: '', reason: 'Scripted feasibility control.' };
}

test('ten days are physically feasible with renewable food AND fuel; finite Plenty still collapses', () => {
  for (const scenario of ['sustainable', 'plenty']) {
    const w = newWorld('demo', null, { scenario, socialStart: false });
    while (w.tick < w.maxTicks) {
      if (w.tick % 12 === 0) for (const a of w.agents) assign(w, a, referenceDecision(observation(w, a)));
      advance(w);
      for (const stock of Object.values(w.resources)) assert.ok(Number.isFinite(stock) && stock >= 0);
    }
    assert.equal(w.tick, 2880);
    if (scenario === 'sustainable') {
      assert.ok(w.agents.every(a => a.health === 100));
      assert.equal(metrics(w).starvingHours, 0); assert.equal(metrics(w).rawMeals, 0);
      assert.ok(w.mealsCooked >= 190); assert.equal(w.calls, 0);
    } else assert.ok(metrics(w).starvingHours > 0);
  }
});

test('saved scenario copy and fractional renewal survive SQLite reload; historical summaries are not rewritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'renewable-village-')), path = join(dir, 'w.sqlite');
  let s = new WorldStore(path);
  try {
    s.reset('demo', null, { scenario: 'plenty' });
    const oldId = s.world.id, summary = 'Historical condition: Food and wood are abundant and do not regrow.';
    s.world.scenario.summary = summary; s.save([], true);
    s.reset('demo', null, { scenario: 'sustainable' });
    s.world.resources = { food: 0, wood: 0 }; ticks(s.world, 23); s.save([], true);
    const snapshot = structuredClone(s.world.scenario); s.close(); s = new WorldStore(path);
    assert.deepEqual(s.world.scenario, snapshot); advance(s.world);
    assert.deepEqual(s.world.resources, { food: 1, wood: 1 });
    const old = JSON.parse(s.db.prepare('SELECT state FROM worlds WHERE id=?').get(oldId).state);
    assert.equal(old.scenario.summary, summary);
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});
