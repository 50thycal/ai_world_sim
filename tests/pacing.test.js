import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newWorld,assign,advance,observation,WorldStore,PLACES} from '../src/world.js';
import {Runner} from '../src/runner.js';
const d=(action,target='none')=>({action,target,reason:'Test plan.',message:''});
const finish=(w,n=3)=>{for(let i=0;i<n;i++)advance(w);};
const settle=()=>new Promise(r=>setImmediate(r));

test('v2 blocks unnecessary eating without consuming cooked or raw food; v1 remains unchanged',()=>{
 for(const raw of [false,true]){
  const w=newWorld(),a=w.agents[0];a.hunger=3;if(raw)a.inventory.meal=0;
  const inventory=structuredClone(a.inventory);assign(w,a,d('eat'));finish(w);
  assert.deepEqual(a.inventory,inventory);assert.equal(a.health,100);
 }
 const hungry=newWorld(),a=hungry.agents[0];a.hunger=40;assign(hungry,a,d('eat'));finish(hungry);assert.equal(a.inventory.meal,0);assert.ok(a.hunger<3);
 const legacy=newWorld();legacy.version='world-v1';const b=legacy.agents[0];b.hunger=3;assign(legacy,b,d('eat'));finish(legacy);assert.equal(b.inventory.meal,0);
 assert.match(observation(hungry,a).rules,/blocked below hunger 40/);
});
test('continuing a journey or repeating the same plan preserves work and travel progress',()=>{
 const w=newWorld(),a=w.agents[0];assign(w,a,d('cook','hearth'));finish(w,1);
 const task=structuredClone(a.task),position={x:a.x,y:a.y};assign(w,a,d('continue'));
 assert.deepEqual(a.task,task);assert.deepEqual({x:a.x,y:a.y},position);
 a.x=PLACES.hearth.x;a.y=PLACES.hearth.y;finish(w,1);const work=a.task.work;
 assign(w,a,d('cook','hearth'));assert.equal(a.task.work,work);
});
test('rest restores energy progressively and ends early when fully rested',()=>{
 const w=newWorld(),a=w.agents[0];Object.assign(a,PLACES.shelter);a.energy=60;
 assign(w,a,d('rest','shelter'));finish(w,1);assert.equal(a.energy,65);assert.ok(a.task);
 finish(w,7);assert.equal(a.energy,100);assert.equal(a.task,null);
 a.energy=98;assign(w,a,d('rest','shelter'));finish(w,1);assert.equal(a.energy,100);assert.equal(a.task,null);
});
test('a full v2 day makes exactly 144 hourly requests, skips quiet time and finishes at 24:00',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-day-'));const s=new WorldStore(join(dir,'world.sqlite'));
 try{
  s.reset('chatgpt','test-model');s.world.running=true;const minutes=[];
  const r=new Runner(s,{decide:async o=>{minutes.push(o.minute);return{decision:d('wait'),usage:{inputTokens:10,outputTokens:2}};}});
  let steps=0;while(s.world.running&&steps++<300)await r.step();
  assert.equal(steps,24);assert.equal(s.world.tick,288);assert.equal(s.world.calls,144);assert.equal(s.world.pauseReason,'One-day pilot complete');
  for(let hour=0;hour<24;hour++)assert.equal(minutes.filter(m=>m===hour*60).length,6);
  assert.equal(minutes.at(-1),23*60);assert.equal(s.world.nextDecisionTick,288);assert.ok(s.world.skippedTicks>200);
  assert.equal(s.records(1000).filter(e=>e.kind==='failure').length,0);assert.equal(s.frames().at(-1).tick,288);
  assert.equal(s.world.inputTokens,1440);assert.equal(s.world.outputTokens,288);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('hourly reviews happen during long journeys without resetting the job',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-travel-'));const s=new WorldStore(join(dir,'world.sqlite'));
 try{
  s.reset('chatgpt','test-model');const minutes=[];
  const r=new Runner(s,{decide:async o=>{minutes.push(o.minute);return{decision:o.currentTask?d('continue'):d('gather','forest'),usage:{}};}});
  while(s.world.tick<=12)await r.step(true);
  assert.equal(s.world.calls,12);assert.equal(minutes.filter(m=>m===60).length,6);
  assert.equal(s.world.agents[0].task.action,'gather');assert.ok(s.world.agents[0].y<10);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('pause and restart retain partial hourly proposals without repeating their requests',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-round-'));const path=join(dir,'world.sqlite');let s=new WorldStore(path);
 try{
  s.reset('chatgpt','test-model');let reply,n=0;
  const r=new Runner(s,{decide:async()=>{if(++n===2)return new Promise(resolve=>reply=resolve);return{decision:d('wait'),usage:{}};}});
  const pending=r.step(true);while(!reply)await settle();r.pause();reply({decision:d('wait'),usage:{}});await pending;
  assert.equal(s.world.calls,2);assert.equal(s.world.decisionRound.decisions.length,2);assert.ok(s.world.agents.every(a=>!a.task));
  s.close();s=new WorldStore(path);let bought=0;
  const resumed=new Runner(s,{decide:async()=>{bought++;return{decision:d('wait'),usage:{}};}});
  await resumed.step(true);assert.equal(bought,4);assert.equal(s.world.calls,6);assert.equal(s.world.tick,12);assert.equal(s.world.decisionRound,null);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('opening a saved v1 run does not change its version, rules, budget or recorded frames',()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-legacy-'));const path=join(dir,'world.sqlite');let s=new WorldStore(path);
 try{
  s.world.version='world-v1';s.world.tick=164;s.world.calls=144;delete s.world.nextDecisionTick;delete s.world.decisionRound;delete s.world.skippedTicks;
  s.save([{kind:'legacy-evidence',text:'Preserve the pilot'}],true);const before=s.export();s.close();s=new WorldStore(path);
  const after=s.export();assert.equal(after.world.version,'world-v1');assert.equal(after.world.calls,144);assert.equal(after.world.tick,164);
  assert.deepEqual(after.world,before.world);assert.deepEqual(after.records,before.records);assert.deepEqual(s.frame(s.frames()[0].id),before.world);assert.equal(after.world.nextDecisionTick,undefined);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('the scripted v2 village completes all hourly plans with conserved finite resources',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-demo-'));const s=new WorldStore(join(dir,'world.sqlite'));
 try{
  const r=new Runner(s,{});while(s.world.tick<288)await r.step(true);
  assert.equal(s.world.tick,288);assert.equal(s.world.calls,0);assert.equal(s.world.nextDecisionTick,288);
  assert.equal(s.records(1000).filter(e=>e.kind==='decision').length,144);assert.ok(s.world.mealsCooked>0);
  for(const a of s.world.agents){assert.ok(a.health>0);for(const n of Object.values(a.inventory))assert.ok(n>=0);}
  assert.ok(s.world.resources.food>=0);assert.ok(s.world.resources.wood>=0);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
