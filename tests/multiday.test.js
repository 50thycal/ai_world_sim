import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore, newWorld, observation, assign, advance, validateDays, decodeFrame, metrics } from '../src/world.js';
import { Runner } from '../src/runner.js';
import { Research } from '../src/research.js';
import { Diagnostics, decisionLedger } from '../src/diagnostics.js';
const decision = (action = 'wait', target = 'none', item = 'none', message = '') => ({ action, target, item, message, reason: 'Test plan.' });
const finish = w => { const events = []; for (let i = 0; i < 40 && w.agents.some(a => a.task); i++) events.push(...advance(w)); return events; };

test('new v4 runs default to ten days, bound duration and describe the actual horizon', () => {
  const w = newWorld('chatgpt', 'test-model');
  assert.equal(w.version, 'world-v4'); assert.equal(w.days, 10); assert.equal(w.maxTicks, 2880); assert.equal(w.maxCalls, 1452);
  assert.equal(w.socialStart, true);
  for (const d of [0, -1, 31, 1.5, '10', null, NaN]) assert.throws(() => validateDays(d), /whole number/);
  const o = observation(w, w.agents[0]);
  assert.equal(o.totalDays, 10); assert.equal(o.daysRemaining, 10); assert.equal(o.minuteOfDay, 0);
  assert.match(o.rules, /24 per day for 10 days/); assert.match(o.socialContext.guidance, /five strangers/);
  assert.match(o.rules, /live through this 10-day stay/);
  assert.ok(o.socialContext.people.every(p => p.heardMessages === 0 && p.firstWords === null));
  assert.equal(observation(newWorld('demo', null, { socialStart: false }), w.agents[0]).socialContext.phase, 'living_together');
});

test('ten days continue through midnight without refills or resets and make exactly 1440 inference attempts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'village-ten-days-')), path = join(dir, 'world.sqlite');
  let s = new WorldStore(path);
  try {
    s.reset('chatgpt', 'test-model'); const id = s.world.id, pantry = s.world.pantry, resources = structuredClone(s.world.resources);
    let calls = 0, rounds = 0; const observedDays = new Set();
    const codex = { decide: async o => {
      calls++; observedDays.add(o.day); assert.equal(o.totalDays, 10);
      assert.equal(o.minuteOfDay, o.minute % 1440);
      return { decision: decision(), usage: { inputTokens: 2, outputTokens: 1 } };
    } };
    let r = new Runner(s, codex); s.world.running = true;
    while (s.world.tick < 288) { await r.step(); rounds++; }
    assert.equal(s.world.running, true); assert.equal(s.world.tick, 288); assert.equal(s.world.calls, 144);
    assert.equal(observation(s.world, s.world.agents[0]).day, 2);
    assert.equal(observation(s.world, s.world.agents[0]).minuteOfDay, 0);
    assert.equal(s.world.pantry, pantry); assert.deepEqual(s.world.resources, resources);
    const prior = structuredClone(s.world.agents);
    s.close(); s = new WorldStore(path); assert.equal(s.world.running, false); assert.equal(s.world.id, id);
    assert.deepEqual(s.world.agents, prior); s.world.running = true; r = new Runner(s, codex);
    while (s.world.running) { await r.step(); rounds++; }
    assert.equal(rounds, 240); assert.equal(calls, 1440); assert.equal(s.world.calls, 1440);
    assert.equal(observedDays.size, 10); assert.equal(s.world.tick, 2880); assert.equal(s.world.pauseReason, '10-day simulation complete');
    assert.equal(s.frames().length, 2881); assert.equal(s.world.nextDecisionTick, 2880);
    assert.deepEqual(s.world.resources, resources); assert.equal(s.world.pantry, pantry);
    await assert.rejects(r.step(true), /complete/); assert.deepEqual(advance(s.world), []);
    const d = new Diagnostics(s.db, { log() {} }), research = new Research(s, d, r);
    const report = research.get(new URL(`http://local/api/research/runs/${id}`)).body;
    assert.equal(report.dailySummaries.length, 10); assert.equal(report.dailySummaries.at(-1).day, 10);
    assert.equal(report.evidence.capturedInputs, 1440); assert.equal(report.requestCounts.result_saved, 1440);
    assert.ok(report.dailySummaries.every(x => x.daily.gifts === 0 && x.daily.gathered === 0));
    const frame = s.db.prepare('SELECT state FROM frames WHERE run=? ORDER BY id DESC LIMIT 1').get(id);
    assert.ok(frame.state instanceof Uint8Array); assert.deepEqual(decodeFrame(frame.state), s.world);
    const sizes = s.db.prepare('SELECT sum(length(state)) bytes FROM frames WHERE run=?').get(id);
    assert.ok(sizes.bytes < Buffer.byteLength(JSON.stringify(s.world)) * 2881 / 2);
    assert.equal(decisionLedger(s).length, 1440);
    console.log(JSON.stringify({ verification: 'ten-day mock inference', calls, rounds, frames: s.frames().length, compressedFrameMB: Math.round(sizes.bytes / 1e4) / 100, sqliteMB: Math.round(statSync(path).size / 1e4) / 100 }));
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('private encounter notebooks preserve first words, direct help and witnessed theft across days', () => {
  const w = newWorld(), [a, b, , , , far] = w.agents;
  Object.assign(far, { x: 18, y: 0 });
  assign(w, a, decision('talk', b.id, 'none', 'I am Mira. What is your plan?')); finish(w);
  assert.match(b.relationships[a.id].firstWords.text, /I am Mira/);
  assert.equal(a.relationships[b.id].conversationsStarted, 1);
  assert.equal(far.relationships[a.id], undefined);
  assign(w, a, decision('give', b.id, 'meal')); finish(w);
  assert.equal(b.relationships[a.id].giftsReceived, 1); assert.equal(a.relationships[b.id].giftsGiven, 1);
  assign(w, a, decision('steal', b.id, 'meal')); finish(w);
  assert.equal(b.relationships[a.id].theftsSuffered, 1);
  for (let i = 0; i < 6; i++) { assign(w, a, decision('talk', b.id, 'none', 'We need to coordinate.')); finish(w); }
  w.tick = 287; const notebooks = structuredClone(b.relationships); const summaries = advance(w);
  assert.equal(w.tick, 288); assert.equal(w.running, false); // direct-engine fixture was never started
  assert.equal(summaries.find(e => e.kind === 'day_summary').day, 1);
  assert.match(b.relationships[a.id].firstWords.text, /I am Mira/);
  assert.equal(b.relationships[a.id].recentEvents.length, 4);
  assert.equal(b.relationships[a.id].giftsReceived, notebooks[a.id].giftsReceived);
  a.relationships[b.id].privateConclusion = 'PRIVATE_SOCIAL_SECRET'; a.inventory.meal = 999;
  const own = JSON.stringify(observation(w, b));
  assert.ok(!own.includes('PRIVATE_SOCIAL_SECRET')); assert.ok(!own.includes('999'));
  assert.ok(!Object.hasOwn(b.relationships[a.id], 'trust'));
});

test('ten-day scripted commons retains bounded social memory, daily accounting and finite physical state',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-ten-day-demo-')),s=new WorldStore(join(dir,'w.sqlite'));
 try{
  s.reset('demo',null,{scenario:'commons'});const r=new Runner(s,{});
  while(s.world.tick<s.world.maxTicks)await r.step(true);
  assert.equal(s.world.calls,0);assert.equal(s.world.tick,2880);
  const summaries=s.db.prepare("SELECT data FROM records WHERE run=? AND kind='day_summary' ORDER BY id").all(s.world.id).map(x=>JSON.parse(x.data));
  assert.equal(summaries.length,10);
  assert.equal(summaries.reduce((n,d)=>n+d.daily.gifts,0),metrics(s.world).gifts);
  assert.equal(summaries.reduce((n,d)=>n+d.daily.messages,0),metrics(s.world).messages);
  for(const a of s.world.agents){
   assert.ok(a.memories.length<=24);assert.ok(a.plans.length<=6);assert.ok(Object.keys(a.relationships).length<=5);
   assert.ok(a.health>=1&&a.health<=100);assert.ok(a.hunger>=0&&a.hunger<=100);
   assert.ok(Object.values(a.inventory).every(n=>n>=0));
   for(const p of Object.values(a.relationships))assert.ok(p.recentEvents.length<=4);
  }
  assert.ok(s.world.resources.food>=0&&s.world.resources.wood>=0);
  const bytes=s.db.prepare('SELECT sum(length(state)) n FROM frames WHERE run=?').get(s.world.id).n;
  console.log(JSON.stringify({verification:'ten-day scripted social commons',frames:s.frames().length,compressedFrameMB:Math.round(bytes/1e4)/100,finalWorldKB:Math.round(Buffer.byteLength(JSON.stringify(s.world))/1000)}));
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('historical v3 observations, one-day budgets and text replay frames retain the old rules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'village-v3-')), s = new WorldStore(join(dir, 'w.sqlite'));
  try {
    s.world.version = 'world-v3'; s.world.maxTicks = 288; s.world.maxCalls = 144;
    delete s.world.days; delete s.world.socialStart;
    for (const a of s.world.agents) delete a.relationships;
    const o = observation(s.world, s.world.agents[0]);
    assert.equal(o.socialContext, undefined); assert.equal(o.totalDays, undefined); assert.match(o.rules, /24 per day\./);
    s.save([], true); const frame = s.db.prepare('SELECT state FROM frames').get();
    assert.equal(typeof frame.state, 'string'); assert.deepEqual(decodeFrame(frame.state), s.world);
    s.world.tick = 287; advance(s.world); assert.equal(s.world.pauseReason, 'One-day pilot complete');
    assert.ok(metrics(s.world));
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});
