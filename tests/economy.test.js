import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorld, observation, assign, advance, validateDecision, decisionSchema, demoDecision, metrics, WorldStore, PLACES } from '../src/world.js';
import { Runner } from '../src/runner.js';
import { CodexClient } from '../src/codex.js';
import { createApp } from '../src/server.js';
import { Research } from '../src/research.js';
import { Diagnostics } from '../src/diagnostics.js';

const d = (action = 'wait', target = 'none', item = 'none', price = 0, offerId = 0) => ({ action, target, item, price, offerId, message: '', reason: 'Test economy choice.' });
const fixture = () => {
  const w = newWorld('demo', null, { economy: true, socialStart: false });
  for (const a of w.agents) { a.x = PLACES.square.x; a.y = PLACES.square.y; }
  return w;
};
const finish = (w, a) => { const events = []; for (let n = 0; a.task && n < 80; n++) events.push(...advance(w)); assert.equal(a.task, null); return events; };
const act = (w, a, decision) => { assign(w, a, decision); return finish(w, a); };
const balances = w => ({ coins: w.agents.reduce((n, a) => n + a.coins, 0),
  items: Object.fromEntries(['meal', 'raw', 'wood', 'tool'].map(item => [item,
    w.agents.reduce((n, a) => n + a.inventory[item], 0) + w.economy.offers.filter(o => o.item === item).length])) });

test('v5 is an explicit renewable-only experiment; baseline schema and physics stay available', () => {
  const baseline = newWorld(), w = fixture();
  assert.equal(baseline.version, 'world-v4'); assert.equal(baseline.economy, undefined);
  assert.equal(w.version, 'world-v5'); assert.equal(w.scenario.id, 'sustainable');
  assert.deepEqual(w.resources, { food: 24, wood: 24 }); assert.equal(w.pantry, 12);
  assert.equal(w.maxCalls, 1452); assert.equal(w.plannedCalls, 1440);
  assert.equal(balances(w).coins, 48); assert.equal(w.economy.offers.length, 0);
  assert.throws(() => newWorld('demo', null, { economy: true, scenario: 'commons' }), /Renewable/);
  assert.throws(() => newWorld('demo', null, { economy: 'true' }), /economy/);
  assert.throws(() => validateDecision(d('offer', 'square', 'meal', 2), 'world-v4'), /Invalid/);
  for (const price of [-1, 1.5, 13, Infinity]) assert.throws(() => validateDecision(d('offer', 'square', 'meal', price), w.version), /Invalid/);
  assert.equal(decisionSchema(w.version).properties.price.type, 'integer');
  const invalid = act(w, w.agents[0], d('offer', 'square', 'meal', 0));
  assert.equal(invalid.at(-1).kind, 'blocked'); assert.equal(w.economy.offers.length, 0);
});

test('seller escrows exactly one good; buyer acceptance transfers it and conserved coins atomically', () => {
  const w = fixture(), [seller, buyer] = w.agents, before = balances(w);
  act(w, seller, d('offer', 'square', 'meal', 3)); const offer = structuredClone(w.economy.offers[0]);
  assert.equal(seller.inventory.meal, 0); assert.deepEqual(balances(w), before);
  assert.equal(w.economy.stats.trades, 0); assert.equal(buyer.coins, 8);
  // A posted listing is consent to this price, not permission to remove arbitrary bag contents.
  const event = act(w, buyer, d('buy', seller.id, 'meal', offer.price, offer.id)).at(-1);
  assert.equal(event.kind, 'trade'); assert.equal(event.targetId, seller.id);
  assert.equal(seller.coins, 11); assert.equal(buyer.coins, 5); assert.equal(buyer.inventory.meal, 2);
  assert.equal(w.economy.offers.length, 0); assert.equal(w.economy.stats.trades, 1);
  assert.deepEqual(balances(w), before); assert.equal(seller.economicStats.earned, 3);
});

test('two buyers cannot both receive one listing; stale price, wrong owner and own purchases are blocked', () => {
  const w = fixture(), [seller, buyer, rival] = w.agents;
  act(w, seller, d('offer', 'square', 'meal', 2)); const o = w.economy.offers[0], before = balances(w);
  assert.equal(act(w, buyer, d('buy', seller.id, 'meal', 1, o.id)).at(-1).kind, 'blocked');
  assert.equal(act(w, rival, d('cancel_offer', 'square', 'none', 0, o.id)).at(-1).kind, 'blocked');
  assert.equal(act(w, seller, d('buy', seller.id, 'meal', 2, o.id)).at(-1).kind, 'blocked');
  assign(w, buyer, d('buy', seller.id, 'meal', 2, o.id)); assign(w, rival, d('buy', seller.id, 'meal', 2, o.id));
  const events = advance(w);
  assert.equal(events.filter(e => e.kind === 'trade').length, 1); assert.equal(events.filter(e => e.kind === 'blocked').length, 1);
  assert.equal(w.economy.stats.trades, 1); assert.deepEqual(balances(w), before);
});

test('insufficient funds never takes a good; cancellation and expiration each refund once', () => {
  const w = fixture(), [seller, buyer] = w.agents;
  buyer.coins = 0; seller.coins = 16;
  act(w, seller, d('offer', 'square', 'meal', 2)); const o = w.economy.offers[0], before = balances(w);
  assert.equal(act(w, buyer, d('buy', seller.id, 'meal', 2, o.id)).at(-1).kind, 'blocked');
  assert.deepEqual(balances(w), before); assert.equal(w.economy.offers.length, 1);
  act(w, seller, d('cancel_offer', 'square', 'none', 0, o.id)); assert.equal(seller.inventory.meal, 1);
  assert.deepEqual(balances(w), before);
  act(w, seller, d('offer', 'square', 'meal', 2)); const second = w.economy.offers[0];
  // Old listing IDs cannot purchase a later listing with the same seller/item/price.
  assert.equal(act(w, buyer, d('buy', seller.id, 'meal', 2, o.id)).at(-1).kind, 'blocked');
  w.tick = second.expiresAt; const events = advance(w);
  assert.equal(events.filter(e => e.kind === 'offer_expired').length, 1); assert.equal(seller.inventory.meal, 1);
  advance(w); assert.equal(seller.inventory.meal, 1); assert.equal(w.economy.offers.length, 0);
  assert.deepEqual(balances(w), before);
});

test('a new listing cannot overwrite escrow and price metadata cannot hide in ordinary actions', () => {
  const w = fixture(), a = w.agents[0]; a.inventory.meal = 2;
  act(w, a, d('offer', 'square', 'meal', 2)); const old = structuredClone(w.economy.offers[0]);
  assert.equal(act(w, a, d('offer', 'square', 'meal', 4)).at(-1).kind, 'blocked');
  assert.deepEqual(w.economy.offers, [old]); assert.equal(a.inventory.meal, 1);
  assert.equal(act(w, a, d('wait', 'none', 'none', 3)).at(-1).kind, 'blocked');
  assert.equal(act(w, a, d('continue', 'none', 'none', 3)).at(-1).kind, 'blocked');
});

test('crafting consumes fuel; tools wear only on successful harvests and specialty output is physical', () => {
  const w = fixture(), grower = w.agents[0], cook = w.agents[2], maker = w.agents[3];
  grower.inventory.wood = 2; maker.inventory.wood = 1;
  act(w, grower, d('craft', 'square', 'tool')); act(w, maker, d('craft', 'square', 'tool'));
  assert.equal(grower.inventory.wood, 0); assert.equal(maker.inventory.wood, 0);
  assert.equal(grower.inventory.tool, 1); assert.equal(maker.inventory.tool, 1);
  grower.x = PLACES.orchard.x; grower.y = PLACES.orchard.y; const start = grower.inventory.raw;
  act(w, grower, d('gather', 'orchard')); assert.equal(grower.inventory.raw, start + 4);
  assert.equal(grower.inventory.tool, 0); assert.equal(grower.toolUses, 5);
  w.resources.food = 0; w.scenario.regrow = {};
  assert.equal(act(w, grower, d('gather', 'orchard')).at(-1).kind, 'blocked'); assert.equal(grower.toolUses, 5);
  for (let i = 0; i < 5; i++) { w.resources.food = 10; act(w, grower, d('gather', 'orchard')); }
  assert.equal(grower.toolUses, 0); assert.equal(grower.skills.grower, 6);
  assign(w, grower, d('gather', 'orchard')); assert.equal(grower.task.work, 2); finish(w, grower);
  cook.x = PLACES.hearth.x; cook.y = PLACES.hearth.y; cook.inventory.wood = 1;
  const meals = cook.inventory.meal; act(w, cook, d('cook', 'hearth'));
  assert.equal(cook.inventory.meal, meals + 3); assert.equal(cook.inventory.raw, 0); assert.equal(cook.inventory.wood, 0);
});

test('public professions and listings never reveal private wallets, skills, bags or equipped tool state', () => {
  const w = fixture(), [a, b] = w.agents;
  b.coins = 98765; b.inventory.meal = 87654; b.toolUses = 76543; b.skills.cook = 65432;
  b.memories.push({ tick: 0, text: 'PRIVATE-WALLET-PLAN' });
  act(w, b, d('offer', 'square', 'meal', 2)); const o = observation(w, a), text = JSON.stringify(o);
  assert.equal(o.economy.offers[0].sellerId, b.id); assert.equal(o.economy.professions.length, 6);
  for (const secret of ['98765', '87654', '87653', '76543', '65432', 'PRIVATE-WALLET-PLAN']) assert.ok(!text.includes(secret));
  assert.equal(o.currentFacts.coins, a.coins); assert.equal(o.currentFacts.eating.canEatNow, false);
  assert.ok(!text.includes('Use item none unless giving or stealing.'));
  o.economy.offers[0].price = 12; assert.equal(w.economy.offers[0].price, 2);
});

test('escrow, IDs, skills and wallets survive restart without migrating an archived baseline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'market-save-')), path = join(dir, 'w.sqlite'); let s = new WorldStore(path);
  try {
    const baseline = structuredClone(s.world); s.save([], true); s.reset('demo', null, { economy: true });
    const a = s.world.agents[0]; a.x = PLACES.square.x; a.y = PLACES.square.y;
    act(s.world, a, d('offer', 'square', 'meal', 2)); s.save([], true); const saved = structuredClone(s.world);
    s.close(); s = new WorldStore(path); assert.deepEqual(s.world, saved);
    const old = JSON.parse(s.db.prepare('SELECT state FROM worlds WHERE id=?').get(baseline.id).state);
    assert.deepEqual(old, baseline); assert.equal(old.economy, undefined);
    const research = new Research(s, new Diagnostics(s.db, { log() {} }), new Runner(s, {}));
    assert.equal(research.summary({ world: s.world }).economyVersion, 1);
    s.world.tick = s.world.economy.offers[0].expiresAt; advance(s.world); assert.equal(a.inventory.meal, 0);
    assert.equal(s.world.agents[0].inventory.meal, 1); assert.equal(balances(s.world).coins, 48);
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('ten-day scripted economy preserves currency and finite inventories while exercising tools and trades', () => {
  const w = newWorld('demo', null, { economy: true, socialStart: false }); let trades = 0, summaries = [];
  while (w.tick < w.maxTicks) {
    if (w.tick % 12 === 0) for (const a of w.agents) assign(w, a, demoDecision(w, a));
    const events = advance(w); trades += events.filter(e => e.kind === 'trade').length;
    summaries.push(...events.filter(e => e.kind === 'day_summary'));
    assert.equal(balances(w).coins, 48); assert.ok(w.economy.offers.length <= 6); assert.ok(w.economy.trades.length <= 24);
    for (const a of w.agents) {
      assert.ok(Number.isInteger(a.coins) && a.coins >= 0);
      assert.ok(Object.values(a.inventory).every(n => Number.isInteger(n) && n >= 0));
      assert.ok(a.toolUses >= 0 && a.toolUses <= 6);
    }
  }
  assert.equal(w.tick, 2880); assert.equal(w.calls, 0); assert.equal(summaries.length, 10);
  assert.ok(trades > 0); assert.equal(summaries.reduce((n, s) => n + s.daily.trades, 0), trades);
  assert.equal(metrics(w).trades, trades); assert.ok(metrics(w).toolsCrafted > 0);
  assert.equal(metrics(w).starvingHours, 0); assert.ok(w.agents.every(a => a.health === 100));
  // No safety net: choosing not to use available food still causes damage.
  const idle = fixture(); for (let n = 0; n < 288; n++) advance(idle);
  assert.ok(idle.agents.every(a => a.health < 100)); assert.equal(idle.pantry, 12);
});

test('v5 sends the exact expanded schema through the real adapter with a disposable fake transport', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'market-wire-')), s = new WorldStore(join(dir, 'w.sqlite'));
  const binary = fileURLToPath(new URL('./fake-codex.js', import.meta.url)); chmodSync(binary, 0o755);
  const c = new CodexClient({ dataDir: dir, binary });
  try {
    s.reset('chatgpt', 'test-model', { economy: true }); const runner = new Runner(s, c); await runner.step(true);
    assert.equal(s.world.calls, 6); assert.equal(s.world.nextDecisionTick, 12);
    const requests = s.records().filter(r => r.kind === 'request'); assert.equal(requests.length, 6);
    const wire = JSON.parse(readFileSync(join(dir, 'codex', 'test-protocol.json'), 'utf8')), saved = requests.at(-1).input;
    assert.deepEqual(JSON.parse(wire.turn.input[0].text), saved.observation);
    assert.deepEqual(wire.turn.outputSchema, saved.outputSchema); assert.ok(saved.outputSchema.required.includes('offerId'));
    assert.equal(saved.observation.economy.rules.includes('escrow'), true);
    assert.equal(s.records().filter(r => r.kind === 'decision').length, 6);
  } finally { await c.stop(); s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('a ten-day v5 mock run keeps hourly budgets, recovery and observation-only survival', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'market-ten-days-')), s = new WorldStore(join(dir, 'w.sqlite')); let calls = 0, failedInput;
  try {
    s.reset('chatgpt', 'test-model', { economy: true, socialStart: false });
    const runner = new Runner(s, { decide: async o => {
      calls++;
      if (calls === 2) { failedInput = structuredClone(o); const e = new Error('Villager decision timed out'); e.diagnosticCode = 'timeout'; throw e; }
      if (calls === 3) assert.deepEqual(o, failedInput);
      let choice;
      if (o.hunger >= 45 && o.inventory.meal) choice = d('eat');
      else if (o.hunger >= 55 && !o.inventory.meal && !(o.inventory.raw && o.inventory.wood)) choice = d('eat', 'pantry');
      else if (o.currentTask) choice = d('continue');
      else if (o.energy < 25) choice = d('rest', 'shelter');
      else if (o.inventory.meal > 2) choice = d('share', 'pantry');
      else if (o.inventory.raw && o.inventory.wood) choice = d('cook', 'hearth');
      else choice = d('gather', o.inventory.raw ? 'forest' : 'orchard');
      return { decision: choice, usage: {} };
    } }, undefined, { retryDelays: [0, 0] });
    s.world.running = true; while (s.world.running) await runner.step();
    assert.equal(s.world.tick, 2880); assert.equal(calls, 1441); assert.equal(s.world.retriesUsed, 1);
    const kinds = Object.fromEntries(s.db.prepare('SELECT kind,count(*) n FROM records GROUP BY kind').all().map(r => [r.kind, r.n]));
    assert.equal(kinds.decision, 1440); assert.equal(kinds.round, 240); assert.equal(kinds.day_summary, 10); assert.equal(kinds.failure, 1);
    assert.equal(balances(s.world).coins, 48); assert.equal(metrics(s.world).starvingHours, 0);
    assert.ok(s.world.agents.every(a => a.health === 100));
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('owner HTTP selects the new economy explicitly; spectators cannot create it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'market-http-')), oldToken = process.env.OWNER_SETUP_TOKEN;
  process.env.OWNER_SETUP_TOKEN = 'market-test-owner';
  const app = createApp({ dataDir: dir, codex: { stop() {}, status: () => ({}) }, intervalMs: 100000 });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/api/admin/new', { mode: 'demo', economy: true })).status, 401);
    const claim = await post('/api/claim', { token: 'market-test-owner' }); const cookie = claim.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/admin/new', { mode: 'demo', economy: true, scenario: 'commons' }, cookie)).status, 400);
    assert.equal((await post('/api/admin/new', { mode: 'demo', economy: 'true' }, cookie)).status, 400);
    assert.equal((await post('/api/admin/new', { mode: 'demo', economy: true }, cookie)).status, 200);
    assert.equal(app.store.world.version, 'world-v5'); assert.equal(app.store.world.running, false);
    assert.equal((await (await fetch(base + '/api/state')).json()).metrics.coins, 48);
    assert.equal((await post('/api/admin/new', { mode: 'demo', economy: false }, cookie)).status, 200);
    assert.equal(app.store.world.version, 'world-v4'); assert.equal(app.store.world.economy, undefined);
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); if (oldToken === undefined) delete process.env.OWNER_SETUP_TOKEN; else process.env.OWNER_SETUP_TOKEN = oldToken; }
});
