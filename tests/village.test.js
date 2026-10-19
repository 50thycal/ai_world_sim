import test from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, assign, advance, observation, metrics, decisionSchema, validateDecision, PLACES, WorldStore } from '../src/world.js';
import { cookingWood } from '../src/village.js';
import { Runner } from '../src/runner.js';
import { Batches, batchReport } from '../src/batches.js';
import { mkdtempSync, rmSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexClient } from '../src/codex.js';
import { createApp } from '../src/server.js';
const d = (action, target='none', item='none', price=0, offerId=0) => ({action,target,item,price,offerId,message:'',reason:'Engine fixture; not model evidence.'});
const fixture = () => { const w=newWorld('demo',null,{village:true,socialStart:false}); for(const a of w.agents)Object.assign(a,PLACES.square);return w; };
const act = (w,a,z) => {assign(w,a,z);const es=[];for(let i=0;a.task&&i<100;i++)es.push(...advance(w));assert.equal(a.task,null);return es;};
const coins = w => w.agents.reduce((n,a)=>n+a.coins,0)+w.village.requests.reduce((n,r)=>n+r.price,0);
const items = (w,item) => w.agents.reduce((n,a)=>n+a.inventory[item],0)+w.economy.offers.filter(o=>o.item===item).length+w.village.requests.reduce((n,r)=>n+(r.escrow[item]||0),0)+(item==='meal'?w.village.gatherings.length:0);

test('v6 is opt-in, renewable-only, with private actionable spare-tool facts and unchanged v4/v5 inputs',()=>{
 const w=fixture(),a=w.agents[0],b=w.agents[1];assert.equal(w.version,'world-v6');assert.equal(newWorld('demo',null,{economy:true}).version,'world-v5');
 assert.throws(()=>newWorld('demo',null,{village:true,scenario:'plenty'}),/Renewable/);
 a.inventory.tool=5;a.toolUses=0;b.coins=98765;b.satisfaction=87654;b.inventory.furnishing=76543;b.home.bed=true;b.memories=[{tick:0,text:'PRIVATE HOME'}];
 const o=observation(w,a);assert.equal(o.currentFacts.tools.usable,true);assert.equal(o.currentFacts.tools.totalChargesAvailable,30);
 for(const secret of ['98765','87654','76543','PRIVATE HOME'])assert.ok(!JSON.stringify(o).includes(secret));
 assert.equal(o.village.myHome.bed,false);assert.equal(o.village.recipes.cooking.woodNow,1);assert.ok(decisionSchema(w.version).properties.action.enum.includes('fulfill_cooking'));
 assert.throws(()=>validateDecision(d('build','stove'),'world-v5'),/Invalid/);
 const v5=newWorld('demo',null,{economy:true});assert.equal(observation(v5,v5.agents[0]).village,undefined);
});
test('funded request delivery is exact, voluntary, conserved, and wins only once under competing deliveries',()=>{
 const w=fixture(),[owner,supplier,rival]=w.agents,before=items(w,'raw');
 assert.equal(act(w,owner,d('request','square','raw',12)).at(-1).kind,'blocked');assert.equal(coins(w),48);
 act(w,owner,d('request','square','raw',3));const r=w.village.requests[0];assert.equal(owner.coins,5);assert.equal(coins(w),48);assert.equal(metrics(w).coins,48);
 assert.equal(act(w,supplier,d('fulfill',owner.id,'raw',2,r.id)).at(-1).kind,'blocked');assert.equal(w.village.requests.length,1);
 assign(w,supplier,d('fulfill',owner.id,'raw',3,r.id));assign(w,rival,d('fulfill',owner.id,'raw',3,r.id));let es=[];for(let n=0;n<4;n++)es.push(...advance(w));
 assert.equal(es.filter(e=>e.kind==='request_filled').length,1);assert.equal(w.village.requests.length,0);assert.equal(coins(w),48);assert.equal(items(w,'raw'),before);assert.equal(w.village.stats.requestsFilled,1);
 assert.equal(act(w,owner,d('fulfill',owner.id,'raw',3,r.id)).at(-1).kind,'blocked');
});
test('funded cooking expiry and cancellation refund supplies and coins once, with ownership and limits',()=>{
 const w=fixture(),[a,b]=w.agents;a.inventory.wood=2;const raw=items(w,'raw'),wood=items(w,'wood');
 act(w,a,d('request_cooking','square','meal',2));const r=w.village.requests[0];assert.equal(a.coins,6);assert.equal(items(w,'raw'),raw);assert.equal(items(w,'wood'),wood);
 assert.equal(act(w,a,d('request','square','wood',1)).at(-1).kind,'blocked');
 assert.equal(act(w,b,d('cancel_request','square','none',0,r.id)).at(-1).kind,'blocked');
 act(w,a,d('cancel_request','square','none',0,r.id));assert.equal(a.coins,8);assert.equal(items(w,'wood'),wood);
 assert.equal(act(w,a,d('cancel_request','square','none',0,r.id)).at(-1).kind,'blocked');assert.equal(coins(w),48);
 act(w,a,d('request_cooking','square','meal',1));const next=w.village.requests[0];w.tick=next.expiresAt;
 assert.equal(advance(w).filter(e=>e.kind==='request_expired').length,1);advance(w);assert.equal(items(w,'raw'),raw);assert.equal(items(w,'wood'),wood);assert.equal(a.coins,8);
});
test('paid cooking returns all output; barter splits output and cannot duplicate inputs',()=>{
 for(const fee of [0,2]){
 const w=fixture(),a=w.agents[0],cook=w.agents[2];a.inventory.wood=1;const before=items(w,'meal'),raw=items(w,'raw');
 act(w,a,d('request_cooking','square','meal',fee));const r=w.village.requests[0];
 const es=act(w,cook,d('fulfill_cooking',a.id,'meal',fee,r.id));assert.equal(es.at(-1).kind,'cooking_service');
 assert.equal(a.inventory.meal,fee?4:2);assert.equal(cook.inventory.meal,fee?1:3);assert.equal(items(w,'meal'),before+3);assert.equal(items(w,'raw'),raw-1);assert.equal(items(w,'wood'),0);assert.equal(coins(w),48);
 assert.equal(act(w,cook,d('fulfill_cooking',a.id,'meal',fee,r.id)).at(-1).kind,'blocked');assert.equal(items(w,'meal'),before+3);
 }
});
function buildProject(w,id){const a=w.agents[3],p=w.village.projects[id];a.inventory.wood=p.woodNeeded;
 for(let i=0;i<p.woodNeeded;i++)act(w,a,d('contribute',id,'wood'));
 for(let i=0;i<4;i++){a.energy=100;act(w,a,d('build',id));}return p;}
test('projects require real materials and labor; completion applies each benefit once',()=>{
 const w=fixture(),a=w.agents[3];assert.equal(act(w,a,d('build','stove')).at(-1).kind,'blocked');
 for(const id of ['stove','orchard_upgrade','workshop']){const p=buildProject(w,id);assert.notEqual(p.completedAt,null);const old=p.completedAt;assert.equal(act(w,a,d('build',id)).at(-1).kind,'blocked');assert.equal(p.completedAt,old);}
 assert.equal(w.village.stats.projectsCompleted,3);assert.equal(w.scenario.regrow.food,0.75);
 const grower=w.agents[0];grower.inventory.wood=1;act(w,grower,d('craft','square','tool'));assert.equal(grower.inventory.wood,0);
 const cook=w.agents[2];Object.assign(cook,PLACES.hearth);cook.inventory.raw=2;cook.inventory.wood=1;
 act(w,cook,d('cook','hearth'));assert.equal(cookingWood(w),0);act(w,cook,d('cook','hearth'));assert.equal(cookingWood(w),1);assert.equal(cook.inventory.wood,0);assert.equal(w.village.stats.fuelSaved,1);
});
test('paid project labor settles only when work succeeds; competing final jobs do not double-pay',()=>{
 const w=fixture(),[a,b,c]=w.agents,p=w.village.projects.stove;p.wood=p.woodNeeded;p.work=p.workNeeded-2;
 act(w,a,d('request_work','stove','none',2));const r=w.village.requests[0];
 assert.equal(act(w,b,d('fulfill_work','workshop','none',2,r.id)).at(-1).kind,'blocked');
 const es=act(w,b,d('fulfill_work','stove','none',2,r.id));assert.equal(es.at(-1).kind,'work_contract');assert.equal(b.coins,10);assert.equal(a.coins,6);assert.equal(coins(w),48);assert.equal(w.village.stats.projectsCompleted,1);
 assert.equal(act(w,c,d('fulfill_work','stove','none',2,r.id)).at(-1).kind,'blocked');assert.equal(coins(w),48);
});
test('home goods are real tradeable items; installation is once-only and improves rest',()=>{
 const w=fixture(),a=w.agents[3],b=w.agents[0];a.inventory.wood=2;
 act(w,a,d('craft_bed','square','bed'));assert.equal(a.inventory.bed,1);assert.equal(a.inventory.wood,0);
 act(w,a,d('offer','square','bed',3));const o=w.economy.offers[0];act(w,b,d('buy',a.id,'bed',3,o.id));assert.equal(b.inventory.bed,1);
 act(w,b,d('furnish','shelter','bed'));assert.equal(b.home.bed,true);assert.equal(b.inventory.bed,0);
 assert.equal(act(w,b,d('furnish','shelter','bed')).at(-1).kind,'blocked');
 b.energy=10;Object.assign(b,PLACES.shelter);act(w,b,d('rest','shelter'));assert.equal(b.energy,66);
});
test('gathering requires a willing hungry attendee; expiry refunds once; recreation never feeds idle residents',()=>{
 const w=fixture(),[a,b,c]=w.agents,meals=items(w,'meal');a.inventory.meal++;
 act(w,a,d('host_meal','square','meal'));const g=w.village.gatherings[0];assert.equal(items(w,'meal'),meals+1);
 b.hunger=20;assert.equal(act(w,b,d('attend',a.id,'meal',0,g.id)).at(-1).kind,'blocked');assert.equal(w.village.gatherings.length,1);
 b.hunger=60;assert.equal(act(w,b,d('attend',a.id,'meal',0,g.id)).at(-1).kind,'shared_meal');assert.ok(b.hunger<30);assert.equal(items(w,'meal'),meals);
 assert.equal(act(w,c,d('attend',a.id,'meal',0,g.id)).at(-1).kind,'blocked');
 act(w,a,d('host_meal','square','meal'));w.tick=w.village.gatherings[0].expiresAt;advance(w);advance(w);assert.equal(w.village.gatherings.length,0);assert.equal(items(w,'meal'),meals);
 b.satisfaction=10;act(w,b,d('socialize','square'));assert.ok(b.satisfaction>20);
 const idle=fixture();for(let i=0;i<288;i++)advance(idle);assert.ok(idle.agents.every(a=>a.health<100));assert.equal(idle.pantry,12);
});
const withStore=async fn=>{const dir=mkdtempSync(join(tmpdir(),'village-v6-'));const s=new WorldStore(join(dir,'w.sqlite'));try{await fn(s,dir);}finally{s.close();rmSync(dir,{recursive:true,force:true});}};
test('five serial fresh villages have distinct IDs, stable settings, archived results and completed-only aggregates',()=>withStore(async s=>{
 const runner=new Runner(s,{}),b=new Batches(s,runner);b.create('demo',null,{village:true,days:10,socialStart:false});assert.equal(b.batch.count,5);assert.equal(s.world.running,false);b.play();
 while(b.batch.status==='running'){await runner.step();b.advance();}
 const report=b.report();assert.equal(report.completedRuns,5);assert.equal(report.pendingRuns,0);assert.equal(new Set(report.runIds).size,5);assert.equal(report.status,'completed');
 for(const id of report.runIds){const w=JSON.parse(s.db.prepare('SELECT state FROM worlds WHERE id=?').get(id).state);assert.equal(w.tick,2880);assert.equal(w.calls,0);assert.equal(w.version,'world-v6');assert.equal(coins(w),48);assert.equal(w.batch.count,5);}
 assert.equal(Object.keys(report.aggregate).length>5,true);assert.equal(s.db.prepare("SELECT count(*) n FROM records WHERE kind='day_summary'").get().n,50);
}));
test('queue failure and owner pause freeze all future runs; restart preserves escrow, queue cursor and evidence',()=>withStore(async(s,dir)=>{
 const runner=new Runner(s,{decide:async()=>{throw new Error('invalid response')}}),b=new Batches(s,runner);b.create('chatgpt','test',{village:true,days:1});const id=s.world.id;b.play();
 await assert.rejects(runner.step());b.advance();assert.equal(b.batch.status,'paused');assert.equal(b.batch.runIds.length,1);assert.equal(s.world.id,id);assert.equal(b.report().completedRuns,0);assert.equal(b.report().runs[0].failures,1);
 b.play();b.pause();assert.equal(s.world.running,false);b.advance();assert.equal(b.batch.runIds.length,1);
 // Emulate restart by constructing another store over committed data.
 const a=s.world.agents[0];a.inventory.wood=1;act(s.world,a,d('request_cooking','square','meal',2));b.play();s.save([],true,b.batch);
 const restored=new WorldStore(join(dir,'w.sqlite'));try{const restoredB=new Batches(restored,new Runner(restored,{}));assert.equal(restored.world.running,false);assert.equal(restoredB.batch.status,'paused');assert.deepEqual(restoredB.batch.runIds,[id]);assert.equal(restored.world.village.requests.length,1);assert.equal(coins(restored.world),48);assert.equal(restored.world.calls,1);}finally{restored.close();}
}));
test('batch admission is bounded without deleting evidence; completed current run resumes next member exactly once',()=>withStore(async s=>{
 const b=new Batches(s,new Runner(s,{}));b.create('demo',null,{village:true,days:1});const first=s.world.id;
 s.world.tick=s.world.maxTicks;s.save();b.play();assert.equal(b.batch.runIds.length,2);assert.notEqual(s.world.id,first);b.advance();assert.equal(b.batch.runIds.length,2);
 b.pause();assert.throws(()=>b.create('demo',null,{village:true},11),/1–10/);const before=s.world.id;
 for(let i=0;i<14;i++)s.reset('demo',null,{});
 assert.throws(()=>b.create('demo',null,{village:true},5),/slots/);assert.ok(s.db.prepare('SELECT id FROM worlds WHERE id=?').get(before));
}));
test('real adapter fake transport sends and saves v6 schema and exact current facts',()=>withStore(async(s,dir)=>{
 const binary=fileURLToPath(new URL('./fake-codex.js',import.meta.url));chmodSync(binary,0o755);const c=new CodexClient({dataDir:dir,binary});
 try{s.reset('chatgpt','test',{village:true});await new Runner(s,c).step(true);const wire=JSON.parse(readFileSync(join(dir,'codex','test-protocol.json'),'utf8'));const saved=s.records().filter(r=>r.kind==='request').at(-1).input;
 assert.deepEqual(wire.turn.outputSchema,decisionSchema('world-v6'));assert.deepEqual(JSON.parse(wire.turn.input[0].text),saved.observation);assert.ok(saved.observation.village.rules.includes('request_cooking'));assert.equal(s.world.calls,6);
 }finally{await c.stop();}
}));
test('HTTP defaults to five paused villages and exposes read-only batch results with owner-only controls',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-batch-http-')),previous=process.env.OWNER_SETUP_TOKEN;process.env.OWNER_SETUP_TOKEN='v6-owner';
 const app=createApp({dataDir:dir,codex:{stop(){},status:()=>({})},intervalMs:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const post=(path,data,cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
 try{assert.equal((await post('/api/admin/new',{mode:'demo',village:true})).status,401);const claim=await post('/api/claim',{token:'v6-owner'}),cookie=claim.headers.get('set-cookie').split(';')[0];
 const response=await post('/api/admin/new',{mode:'demo',village:true},cookie);assert.equal(response.status,200);const state=await response.json();assert.equal(state.batch.count,5);assert.equal(state.world.version,'world-v6');assert.equal(state.world.running,false);
 const report=await(await fetch(base+'/api/research/batches/'+state.batch.id)).json();assert.equal(report.completedRuns,0);assert.equal(report.runIds.length,1);assert.equal(report.aggregate.lowestHealth,undefined);
 assert.equal((await post('/api/admin/new',{mode:'demo',village:true,runCount:2.5},cookie)).status,400);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.OWNER_SETUP_TOKEN;else process.env.OWNER_SETUP_TOKEN=previous;}
});

test('five ten-day mock-provider villages each retain 1440 applied decisions and full daily evidence',()=>withStore(async s=>{
 const policy=o=>{
  if(o.hunger>=45&&o.inventory.meal)return d('eat');
  if(o.hunger>=55&&!o.inventory.meal&&!(o.inventory.raw&&o.inventory.wood))return d('eat','pantry');
  if(o.currentTask)return d('continue');
  if(o.energy<25)return d('rest','shelter');
  if(o.inventory.meal>2)return d('share','pantry');
  if(o.inventory.raw&&o.inventory.wood)return d('cook','hearth');
  return d('gather',o.inventory.raw?'forest':'orchard');
 };
 let requests=0;const runner=new Runner(s,{decide:async o=>{requests++;return{decision:policy(o),usage:{inputTokens:1,outputTokens:1}};}}),b=new Batches(s,runner);
 b.create('chatgpt','mock-provider',{village:true,days:10,socialStart:false});b.play();while(b.batch.status==='running'){await runner.step();b.advance();}
 assert.equal(requests,7200);const report=b.report();assert.equal(report.completedRuns,5);assert.equal(report.aggregate.starvingHours.max,0);
 for(const run of report.runs){assert.equal(run.calls,1440);assert.equal(run.retriesUsed,0);assert.equal(run.metrics.lowestHealth,100);assert.equal(run.metrics.coins,48);
 const counts=Object.fromEntries(s.db.prepare('SELECT kind,count(*) n FROM records WHERE run=? GROUP BY kind').all(run.id).map(r=>[r.kind,r.n]));
 assert.equal(counts.request,1440);assert.equal(counts.decision,1440);assert.equal(counts.round,240);assert.equal(counts.day_summary,10);assert.equal(counts.failure,undefined);
 }
}));

test('mixed valid and impossible v6 choices never crash the engine, mint coins or create negative inventories',()=>{
 const w=fixture();let seed=7341;const pick=xs=>xs[(seed=(seed*1664525+1013904223)>>>0)%xs.length];
 const schema=decisionSchema(w.version).properties;
 while(w.tick<w.maxTicks){
  if(w.tick%12===0)for(const a of w.agents){
   const z=d(pick(schema.action.enum),pick(schema.target.enum),pick(schema.item.enum),pick([0,0,0,1,2,8,12]),pick([0,0,0,1,2,3]));
   assign(w,a,z);
  }
  advance(w);assert.equal(coins(w),48);assert.ok(w.village.requests.length<=6);assert.ok(w.village.gatherings.length<=6);
  for(const a of w.agents){assert.ok(a.coins>=0&&Number.isInteger(a.coins));assert.ok(Object.values(a.inventory).every(n=>Number.isInteger(n)&&n>=0));assert.ok(a.satisfaction>=0&&a.satisfaction<=100);}
 }
});
