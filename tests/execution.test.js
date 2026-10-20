import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorldStore} from '../src/world.js';
import {Runner} from '../src/runner.js';
import {Batches} from '../src/batches.js';
import {createScheduler,setExecutionPace} from '../src/execution.js';
import {createApp} from '../src/server.js';

test('fast pacing removes artificial wait with identical demo physics, reviews and saved frames',async()=>{
 const results=[];
 for(const pace of ['watch','fast']){
 const dir=mkdtempSync(join(tmpdir(),'village-pace-')),s=new WorldStore(join(dir,'w.sqlite'));let now=0,next,wait=0;
 try{s.reset('demo',null,{life:true,days:1,socialStart:false,pace});s.world.running=true;const runner=new Runner(s,{}),batches=new Batches(s,runner);
 const scheduler=createScheduler({store:s,runner,batches,diagnostics:{emit(){}},clock:()=>now,schedule:(cb,ms)=>{next=cb;wait=ms;return{unref(){}};},cancel:()=>{}});
 for(let n=0;n<30;n++){assert.equal(wait,pace==='fast'?10:1200);now+=wait;const cb=next;next=null;await cb();assert.ok(next);}
 const rounds=s.export().records.filter(r=>r.kind==='round');results.push({state:{tick:s.world.tick,agents:s.world.agents,resources:s.world.resources,pantry:s.world.pantry,rounds:rounds.map(x=>x.tick)},stats:scheduler.snapshot(),frames:s.frames().length});scheduler.close();
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
 }
 assert.deepEqual(results[0].state,results[1].state);assert.equal(results[0].frames,results[1].frames);assert.equal(results[0].stats.steps,30);assert.equal(results[1].stats.steps,30);
 assert.equal(results[0].stats.scheduledWaitMs,36000);assert.equal(results[1].stats.scheduledWaitMs,300);
});
test('owner pacing preserves saved proposals and physics and updates queued execution without auto-resuming',()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-pace-save-'));let s=new WorldStore(join(dir,'w.sqlite'));
 try{const r=new Runner(s,{}),b=new Batches(s,r);b.create('chatgpt','test-model',{life:true},5);s.world.tick=432;s.world.nextDecisionTick=432;s.world.calls=222;s.world.decisionRound={tick:432,decisions:[{actorId:'v1',decision:{action:'wait'}}]};const before=structuredClone(s.world);setExecutionPace(s,b,'fast');
 assert.equal(s.world.running,false);assert.equal(s.world.version,before.version);assert.equal(s.world.id,before.id);assert.deepEqual(s.world.decisionRound,before.decisionRound);assert.deepEqual(s.world.agents,before.agents);assert.equal(s.world.calls,222);assert.equal(b.batch.options.pace,'fast');assert.equal(s.export().records.filter(r=>r.kind==='execution_policy').length,1);
 assert.throws(()=>setExecutionPace(s,b,'parallel'),/fast or watch/);r.busy=true;assert.throws(()=>setExecutionPace(s,b,'watch'),/Pause/);r.busy=false;
 s.close();s=new WorldStore(join(dir,'w.sqlite'));assert.equal(s.world.execution.pace,'fast');assert.equal(s.world.running,false);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('scheduler waits for inference completion before scheduling another step and closes without rearming',async()=>{
 let queued=[],now=0,finish,calls=0;const store={world:{running:true,tick:0,nextDecisionTick:0,execution:{pace:'fast'}}};const runner={busy:false,step:async()=>{calls++;runner.busy=true;await new Promise(r=>finish=r);runner.busy=false;store.world.tick++;}};
 const scheduler=createScheduler({store,runner,batches:{advance(){}},diagnostics:{emit(){}},clock:()=>now,schedule:(cb,ms)=>{queued.push(cb);return{unref(){}};},cancel:()=>{}});
 const cb=queued.shift(),pending=cb();assert.equal(calls,1);assert.equal(queued.length,0);scheduler.close();finish();await pending;assert.equal(queued.length,0);assert.equal(calls,1);
});
test('pace HTTP endpoint is owner-only, persists explicit changes and rejects changes while running',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-pace-http-')),prior=process.env.OWNER_SETUP_TOKEN;process.env.OWNER_SETUP_TOKEN='pace-test';let app;
 try{app=createApp({dataDir:dir,intervalMs:100000,codex:{stop(){},ready:false,status:()=>({connected:false})}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const post=(path,data,cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
 assert.equal((await post('/api/admin/pace',{pace:'fast'})).status,401);const claim=await post('/api/claim',{token:'pace-test'}),cookie=claim.headers.get('set-cookie').split(';')[0];
 const id=app.store.world.id;const res=await post('/api/admin/pace',{pace:'fast'},cookie);assert.equal(res.status,200);const s=await res.json();assert.equal(s.world.id,id);assert.equal(s.execution.pace,'fast');assert.equal(s.world.running,false);
 app.store.world.running=true;assert.equal((await post('/api/admin/pace',{pace:'watch'},cookie)).status,400);app.store.world.running=false;
 }finally{await app?.close();rmSync(dir,{recursive:true,force:true});if(prior===undefined)delete process.env.OWNER_SETUP_TOKEN;else process.env.OWNER_SETUP_TOKEN=prior;}
});
