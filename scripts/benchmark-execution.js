// Disposable scripted benchmark. Never connects to Codex or uses production data.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorldStore} from '../src/world.js';
import {Runner} from '../src/runner.js';
import {Batches} from '../src/batches.js';
import {createScheduler} from '../src/execution.js';
const results=[];
for(const pace of ['watch','fast']){
 const dir=mkdtempSync(join(tmpdir(),'village-pace-benchmark-')),store=new WorldStore(join(dir,'w.sqlite'));
 let scheduler;
 try{
  store.reset('demo',null,{coordination:true,days:2,socialStart:false,pace});store.world.running=true;
  const runner=new Runner(store,{}),batches=new Batches(store,runner),started=performance.now();
  scheduler=createScheduler({store,runner,batches,diagnostics:{emit(){}}});
  await new Promise((resolve,reject)=>{const monitor=setInterval(()=>{const stats=scheduler.snapshot();if(stats.steps>=12){clearInterval(monitor);scheduler.close();resolve();}else if(!store.world.running){clearInterval(monitor);reject(new Error('Benchmark stopped unexpectedly'));}},1);});
  assert.equal(scheduler.snapshot().steps,12);assert.equal(store.world.calls,0);
  const world=store.world;results.push({pace,wallMs:Math.round(performance.now()-started),...scheduler.snapshot(),state:{tick:world.tick,agents:world.agents,resources:world.resources,pantry:world.pantry,economy:world.economy,village:world.village,life:world.life}});
 }finally{scheduler?.close();store.close();rmSync(dir,{recursive:true,force:true});}
}
assert.deepEqual(results[0].state,results[1].state);
console.log(JSON.stringify({kind:'scripted-pacing-benchmark',noModelCalls:true,identicalPhysics:true,runs:results.map(({state,...r})=>r),scope:'Twelve engine steps in disposable scripted worlds. Measures pacing and SQLite overhead, not provider latency or end-to-end live speedup.'},null,2));
