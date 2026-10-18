import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resources, Diagnostics, decisionLedger, heartbeat } from '../src/diagnostics.js';
import { WorldStore } from '../src/world.js';
import { Runner } from '../src/runner.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
test('resource counters keep missing, malformed and unlimited values unknown', () => {
  const values = { 'memory.current':'412000000', 'memory.max':'1000000000', 'memory.events':'max 8\noom 2\noom_kill 1\n' };
  const r=resources(path=>values[path.split('/').at(-1)]);
  assert.equal(r.memoryMB,412);assert.equal(r.memoryLimitMB,1000);assert.equal(r.oomKills,1);assert.equal(r.memoryMaxEvents,8);
  const unknown=resources(()=>{throw Error('missing');});assert.equal(unknown.memoryMB,null);assert.equal(unknown.oomKills,null);
  assert.equal(resources(path=>path.endsWith('memory.max')?'max':'bad').memoryLimitMB,null);
  assert.equal(resources(()=>'bad').memoryMB,null);
});
test('diagnostics are bounded, scalar-only, and distinguish incomplete shutdowns', () => {
  const db=new DatabaseSync(':memory:');const d=new Diagnostics(db,{log(){},limit:100});
  try {
    assert.equal(d.previousShutdown,'unknown');
    for(let i=0;i<110;i++)d.emit({event:'test',tick:i,prompt:'SECRET',stderr:'SECRET',error:{message:'SECRET'},userCode:'SECRET'});
    assert.equal(d.report().events.length,100);assert.ok(!JSON.stringify(d.report()).includes('SECRET'));
    const restarted=new Diagnostics(db,{log(){}});assert.equal(restarted.previousShutdown,'unclean_or_incomplete');
    restarted.emit({event:'server_stop',busy:false});assert.equal(new Diagnostics(db,{log(){}}).previousShutdown,'clean');
  } finally {db.close();}
});
test('diagnostic storage/logger failures do not interrupt a model result', () => {
  const db=new DatabaseSync(':memory:'),d=new Diagnostics(db,{log(){throw Error('logger failed');}});db.close();
  assert.doesNotThrow(()=>d.emit({event:'test'}));assert.equal(d.writeFailures,1);
});
test('durable request IDs link persisted proposals and failures across restart without repeating decisions', async () => {
  const dir=mkdtempSync(join(tmpdir(),'world-diagnostic-')),path=join(dir,'world.sqlite');let store=new WorldStore(path);
  try {
    store.reset('chatgpt','test-model');let n=0;
    const diagnostic=new Diagnostics(store.db,{log(){}});
    const runner=new Runner(store,{decide:async()=>{if(++n===2)throw Error('Codex request timed out');return {decision:{action:'wait',target:'none',item:'none',message:'',reason:'Observe'},usage:{}};}},diagnostic);
    await assert.rejects(runner.step(true),/timed out/);
    const ledger=decisionLedger(store);assert.deepEqual(ledger.map(x=>x.outcome),['result_saved','failed']);assert.notEqual(ledger[0].requestId,ledger[1].requestId);
    const saved=diagnostic.report().events.find(e=>e.event==='decision_persisted');assert.equal(saved.requestId,ledger[0].requestId);
    assert.equal(diagnostic.report().events.find(e=>e.event==='decision_failed').failureCode,'timeout');
    const id=store.world.id;store.close();store=new WorldStore(path);assert.equal(store.world.id,id);assert.equal(store.world.decisionRound.decisions.length,1);
    let calls=0;await new Runner(store,{decide:async()=>{calls++;return {decision:{action:'wait',target:'none',item:'none',message:'',reason:''},usage:{}};}}).step(true);
    assert.equal(calls,5);assert.equal(store.world.calls,7);assert.equal(decisionLedger(store).filter(x=>x.outcome==='result_saved').length,6);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
test('unfinished requests remain unresolved, and legacy requests are not guessed', () => {
 const dir=mkdtempSync(join(tmpdir(),'world-ledger-')),store=new WorldStore(join(dir,'w.sqlite'));
 try {store.save([{kind:'request',number:1},{kind:'request',requestId:'interrupted',number:2}]);assert.deepEqual(decisionLedger(store).map(x=>x.outcome),['legacy_unlinked','unresolved']);}
 finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('heartbeats identify frozen inference and stop without keeping the process alive',async()=>{
 const events=[],runner={busy:true,activeRequest:{requestId:'active'}},store={world:{id:'run',version:'world-v2',tick:12,calls:7,running:true,decisionRound:{decisions:[{}]},completedActions:2}};
 const stop=heartbeat({emit:e=>events.push(e)},runner,store,{intervalMs:10});await wait(35);stop();const count=events.length;await wait(20);
 assert.ok(count>=1);assert.equal(events.length,count);assert.equal(events[0].requestId,'active');assert.equal(events[0].pendingProposals,1);assert.equal(events[0].tick,12);
});
