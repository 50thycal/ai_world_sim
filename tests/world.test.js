import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWorld, assign, advance, demoDecision, observation, validateDecision, WorldStore } from '../src/world.js';
import { Runner } from '../src/runner.js';
const d = (action, target = 'none') => ({ action, target, reason: 'Testing a valid action.', message: '' });
const finish = w => { for (let i = 0; i < 40 && w.agents.some(a => a.task); i++) advance(w); };

test('actions require real travel and cooking consumes actual fuel and ingredients', () => {
  const w = newWorld(), a = w.agents[0]; a.inventory.wood = 1;
  assign(w, a, d('cook', 'hearth')); const original = structuredClone(a.inventory);
  advance(w); assert.deepEqual(a.inventory, original);
  finish(w); assert.deepEqual(a.inventory, { raw: 0, wood: 0, meal: 3 }); assert.equal(w.mealsCooked, 2);
  assign(w, a, d('cook', 'hearth')); finish(w); assert.equal(a.inventory.meal, 3);
});
test('sharing and pantry eating conserve meals and require proximity', () => {
  const w = newWorld(), a = w.agents[0], start = w.pantry;
  assign(w, a, d('share', 'pantry')); finish(w);
  assert.equal(w.pantry, start + 1); assert.equal(a.inventory.meal, 0); assert.equal(w.shares, 1);
  assign(w, a, d('eat', 'pantry')); finish(w); assert.equal(w.pantry, start);
});
test('raw food carries an explicit health cost', () => {
  const w = newWorld(), a = w.agents[0]; a.inventory.meal = 0; a.hunger = 70;
  assign(w, a, d('eat')); finish(w); assert.equal(a.health, 92); assert.equal(a.inventory.raw, 0);
});
test('observations and hearing exclude distant villagers private state', () => {
  const w = newWorld(), a = w.agents[0], b = w.agents[1];
  b.x = 15; b.y = 15; b.inventory.meal = 999; b.memories = [{ text: 'PRIVATE_SECRET' }];
  const own = JSON.stringify(observation(w, a)); assert.ok(!own.includes('PRIVATE_SECRET')); assert.ok(!own.includes('999'));
  assign(w, b, { ...d('talk'), message: 'Far away secret' }); finish(w);
  assert.ok(!a.memories.some(m => m.text.includes('Far away secret')));
});
test('malformed and executable model proposals cannot enter the world', () => {
  assert.throws(() => validateDecision({ ...d('gather','hearth') }));
  assert.throws(() => validateDecision({ ...d('wait'), shell: 'read secrets' }));
  assert.throws(() => validateDecision({ ...d('wait'), message: 'x'.repeat(241) }));
});
test('one full demo day stays finite, deterministic and within resource constraints', () => {
  const run = () => { const w = newWorld(); for(let t=0;t<288;t++){for(const a of w.agents)if(!a.task)assign(w,a,demoDecision(w,a));advance(w);} return w; };
  const a=run(),b=run(); assert.deepEqual(a.agents,b.agents);assert.equal(a.running,false);assert.ok(a.mealsCooked>0);
  for(const v of a.agents){for(const n of Object.values(v.inventory))assert.ok(n>=0);assert.ok(v.energy>=0&&v.energy<=100);assert.ok(v.memories.length<=24);}
  assert.ok(a.resources.food>=0&&a.resources.wood>=0);
});
test('SQLite resumes the same run paused with frames and evidence intact', () => {
  const dir=mkdtempSync(join(tmpdir(),'world-'));try{const p=join(dir,'world.sqlite'),s=new WorldStore(p);const id=s.world.id;
  s.world.running=true;assign(s.world,s.world.agents[0],d('rest','shelter'));s.save(advance(s.world),true);const before=structuredClone(s.world);s.close();
  const reopened=new WorldStore(p);assert.equal(reopened.world.id,id);assert.equal(reopened.world.tick,before.tick);assert.equal(reopened.world.running,false);assert.equal(reopened.frames().length,1);reopened.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('failed model pauses global time and never substitutes a demo action', async () => {
  const dir=mkdtempSync(join(tmpdir(),'world-'));const s=new WorldStore(join(dir,'world.sqlite'));try{s.reset('chatgpt','test-model');s.world.running=true;
  const r=new Runner(s,{decide:async()=>{throw new Error('Quota unavailable');}});await assert.rejects(r.step());
  assert.equal(s.world.tick,0);assert.equal(s.world.running,false);assert.equal(s.world.calls,1);assert.ok(s.world.agents.every(a=>!a.task));assert.ok(s.records().some(e=>e.kind==='failure'));}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('owner pause during inference discards a late answer without advancing time', async () => {
  const dir=mkdtempSync(join(tmpdir(),'world-'));const s=new WorldStore(join(dir,'world.sqlite'));try{s.reset('chatgpt','test-model');s.world.running=true;
  let reply;const r=new Runner(s,{decide:()=>new Promise(resolve=>reply=resolve)});const running=r.step();r.pause();reply({decision:d('wait'),usage:{}});await running;
  assert.equal(s.world.tick,0);assert.equal(s.world.running,false);assert.ok(s.world.agents.every(a=>!a.task));}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('request budget is persisted before inference and cannot be bypassed on resume', async () => {
  const dir=mkdtempSync(join(tmpdir(),'world-'));const s=new WorldStore(join(dir,'world.sqlite'));try{s.reset('chatgpt','test-model');s.world.calls=144;s.save();let called=false;
  const r=new Runner(s,{decide:async()=>{called=true;}});await assert.rejects(r.step(true));assert.equal(called,false);assert.equal(s.world.calls,144);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
