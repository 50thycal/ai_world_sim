import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newWorld,assign,advance,observation,metrics,validateDecision,WorldStore,routineOnly} from '../src/world.js';
import {instructionsFor} from '../src/codex.js';
import {Batches} from '../src/batches.js';
const d=(action,target='square',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:'Controlled test choice.'});
const fixture=()=>{const w=newWorld('demo',null,{community:true,socialStart:false});for(const a of w.agents){a.x=8;a.y=12;}return w;};
function ticks(w,n){const es=[];for(let i=0;i<n;i++){es.push(...advance(w));assert.equal(metrics(w).coins,48);}return es;}
function act(w,a,c){assign(w,a,c);let es=[];for(let i=0;a.task&&i<100;i++)es.push(...ticks(w,1));assert.equal(a.task,null);return es;}
function finishPlan(w,a){const es=[];for(let i=0;(a.task||a.workPlan)&&i<200;i++)es.push(...ticks(w,1));assert.equal(a.task,null);assert.equal(a.workPlan,null);return es;}

test('v9 is opt-in and v8 keeps its original schema, facts and satisfaction',()=>{
 const old=newWorld('demo',null,{coordination:true}),w=fixture();assert.equal(old.version,'world-v8');assert.equal(old.community,undefined);assert.equal(old.agents[0].satisfaction,65);assert.equal(old.decisionInputVersion,'coordinated-facts-v1');
 assert.throws(()=>validateDecision(d('meal_plan','hearth','meal'),old.version));assert.equal(observation(old,old.agents[0]).community,undefined);
 assert.equal(w.version,'world-v9');assert.equal(w.decisionInputVersion,'community-facts-v1');assert.equal(w.plannedCalls,1440);assert.match(instructionsFor(w.decisionInputVersion),/currentFacts/);
 assert.throws(()=>newWorld('demo',null,{community:true,scenario:'commons'}),/Renewable/);assert.throws(()=>newWorld('demo',null,{community:'yes'}),/community/);
});
test('consented household plan gathers physical inputs and cooks without extra decisions or eating',()=>{
 const w=fixture(),a=w.agents[0];a.inventory.raw=0;a.inventory.wood=0;const startFood=w.resources.food,startWood=w.resources.wood;
 assign(w,a,d('meal_plan','hearth','meal'));const es=finishPlan(w,a);
 assert.equal(a.lastWorkPlan.status,'completed');assert.equal(a.inventory.meal,3);assert.equal(a.stats.ate,0);assert.equal(w.calls,0);assert.equal(w.community.stats.plansCompleted,1);assert.equal(w.community.stats.planSteps,3);
 assert.equal(a.stats.gatheredFood,3);assert.equal(a.stats.gatheredWood,2);assert.ok(w.resources.food<startFood);assert.ok(w.resources.wood<startWood);assert.ok(es.some(e=>e.planStep&&e.kind==='cook'));
});
test('plans stop on depletion, hunger, energy, time and manual replacement; quiet skip cannot hide them',()=>{
 for(const type of ['depleted','hungry','tired','expired','replaced','step_limit']){
  const w=fixture(),a=w.agents[0];a.inventory.raw=0;assign(w,a,d('meal_plan','hearth','meal'));while(a.task)ticks(w,1);assert.equal(routineOnly(w),false);
  if(type==='depleted')w.resources.food=0;
  if(type==='hungry')a.hunger=80;
  if(type==='tired')a.energy=9;
  if(type==='expired')a.workPlan.expiresAt=w.tick;
  if(type==='step_limit')a.workPlan.maxSteps=0;
  if(type==='replaced')assign(w,a,d('wait','none'));
  finishPlan(w,a);assert.notEqual(a.lastWorkPlan.status,'completed');assert.equal(a.stats.ate,0);assert.equal(w.community.stats.plansStopped,1);
 }
});
test('shop plans produce and stock surplus, preserve meals and stop when shop closes',()=>{
 const w=fixture(),a=w.agents[2];a.inventory.meal=2;act(w,a,d('open_shop','square','meal',2));const s=w.life.shops[0];s.stock=0;a.inventory.wood=1;
 assign(w,a,d('shop_plan','square','meal',0,s.id));finishPlan(w,a);assert.ok(s.stock>=3);assert.ok(a.inventory.meal>=2);assert.ok(w.community.stats.batchRestocked>=3);
 assign(w,a,d('shop_plan','square','meal',0,s.id));while(a.task)ticks(w,1);s.expiresAt=w.tick;ticks(w,1);finishPlan(w,a);assert.equal(a.lastWorkPlan.status,'shop_closed');
});
test('purchase jobs reserve payment, arbitrate competing claims, require exact delivery and pay once',()=>{
 const w=fixture(),[buyer,worker,rival]=w.agents;act(w,buyer,d('post_order','square','wood',2));const j=w.community.jobs[0];assert.equal(j.escrow,4);assert.equal(buyer.coins,4);
 assign(w,worker,d('claim_job','square','none',0,j.id));assign(w,rival,d('claim_job','square','none',0,j.id));ticks(w,4);assert.ok([worker.id,rival.id].includes(j.workerId));const winner=w.agents.find(a=>a.id===j.workerId);assert.equal(w.community.stats.jobsClaimed,1);
 assert.ok(act(w,winner,d('complete_job',buyer.id,'raw',0,j.id)).some(e=>e.kind==='blocked'));assert.equal(winner.coins,8);
 winner.inventory.wood=2;const before=buyer.inventory.wood;act(w,winner,d('complete_job',buyer.id,'wood',0,j.id));assert.equal(buyer.inventory.wood,before+2);assert.equal(winner.inventory.wood,0);assert.equal(winner.coins,12);assert.equal(w.community.jobs.length,0);assert.equal(w.community.stats.jobsFilled,1);
 act(w,winner,d('complete_job',buyer.id,'wood',0,j.id));assert.equal(winner.coins,12);
});
test('job cancellation, claim timeout and expiry refund exactly once',()=>{
 const w=fixture(),[buyer,worker]=w.agents;act(w,buyer,d('post_order','square','raw',1));let j=w.community.jobs[0];act(w,worker,d('claim_job','square','none',0,j.id));j.claimUntil=w.tick;ticks(w,1);assert.equal(j.workerId,null);assert.equal(buyer.coins,6);
 act(w,worker,d('claim_job','square','none',0,j.id));act(w,worker,d('cancel_job','square','none',0,j.id));assert.equal(j.workerId,null);act(w,buyer,d('cancel_job','square','none',0,j.id));assert.equal(buyer.coins,8);
 act(w,buyer,d('post_order','square','wood',1));j=w.community.jobs[0];j.expiresAt=w.tick;ticks(w,2);assert.equal(buyer.coins,8);assert.equal(w.community.jobs.length,0);
});
test('upkeep reserves public wages, consumes real wood/work, and cannot double-pay',()=>{
 const w=fixture(),[donor,worker,rival]=w.agents,p=w.life.council.clinic;p.status='complete';p.serviceUntil=w.tick;donor.coins-=3;p.balance=3;worker.inventory.wood=2;
 act(w,worker,d('reserve_upkeep','clinic','wood'));const j=w.community.jobs[0];assert.equal(p.balance,2);assert.equal(j.escrow,1);
 act(w,rival,d('reserve_upkeep','clinic','wood'));assert.equal(w.community.jobs.length,1);
 const energy=worker.energy;act(w,worker,d('complete_job','clinic','wood',0,j.id));assert.equal(worker.inventory.wood,1);assert.ok(worker.energy<=energy-4);assert.equal(worker.coins,9);assert.ok(p.serviceUntil>w.tick+280);assert.equal(w.life.stats.maintenance,1);assert.equal(w.community.stats.jobsFilled,1);
 act(w,worker,d('complete_job','clinic','wood',0,j.id));assert.equal(worker.coins,9);
 // Reserved funds return to public balance when a worker releases the next job.
 act(w,worker,d('reserve_upkeep','clinic','wood'));const next=w.community.jobs[0];act(w,worker,d('cancel_job','square','none',0,next.id));assert.equal(p.balance,2);assert.equal(worker.coins,9);
});
test('wellbeing distinguishes home comfort, social contact, enjoyment and health with diminishing repetition',()=>{
 const w=fixture(),a=w.agents[0],b=a.wellbeing;const start=b.connection,comfort=b.comfort;
 act(w,a,d('socialize'));const first=b.connection-start;const after=b.connection;act(w,a,d('socialize'));assert.ok(b.connection-after<first);assert.ok(b.comfort<comfort);assert.equal(a.health,100);
 a.home.bed=true;a.home.furnishing=true;const before=b.comfort;ticks(w,24);assert.ok(b.comfort>before);assert.ok(b.enjoyment<100);assert.equal(a.satisfaction,(b.comfort+b.connection+b.enjoyment)/3);
});
test('prepared events escrow kits, return unused supplies once and record actual shared experiences',()=>{
 const w=fixture(),[host,guest]=w.agents;act(w,host,d('invite','music'));assert.equal(w.life.invitations.length,0);
 host.inventory.leisure_kit=1;act(w,host,d('invite','music'));let i=w.life.invitations[0];assert.equal(host.inventory.leisure_kit,0);assert.equal(i.kitReserved,1);i.expiresAt=w.tick;ticks(w,2);assert.equal(host.inventory.leisure_kit,1);
 act(w,host,d('invite','music'));i=w.life.invitations[0];ticks(w,12);act(w,guest,d('accept_invite',host.id,'none',0,i.id));assert.equal(w.life.invitations.length,0);assert.equal(host.inventory.leisure_kit,0);assert.equal(w.life.stats.kitsUsed,1);assert.equal(guest.wellbeing.sharedWith[host.id],1);assert.equal(host.wellbeing.sharedWith[guest.id],1);assert.equal(w.community.stats.sharedExperiences,1);
});
test('observations expose own runway, actionable restocking/funding and public jobs without private bags or notebooks',()=>{
 const w=fixture(),[a,b]=w.agents;b.inventory.raw=98765;b.coins=6;a.coins=10;b.personal.interest='private_interest';b.lastReason='private_reason';b.wellbeing.sharedWith={secret_person:99};
 a.inventory.meal=5;act(w,a,d('open_shop','square','meal',1));a.inventory.meal=5;const p=w.life.council.clinic;p.status='approved';
 const o=observation(w,a),s=JSON.stringify(o);assert.ok(o.currentFacts.foodRunway.hoursUntilStarvationDamage>0);assert.ok(o.coordination.opportunities.some(x=>x.choice.action==='restock_shop'));assert.ok(o.coordination.opportunities.some(x=>x.choice.action==='fund'));assert.ok(!s.includes('98765'));assert.ok(!s.includes('private_interest'));assert.ok(!s.includes('private_reason'));assert.ok(!s.includes('secret_person'));
 for(const x of o.coordination.opportunities)validateDecision(x.choice,w.version);
});
test('v9 plans, job escrow, private wellbeing and exact inputs survive persistence; next batch member retains v9',()=>{
 const dir=mkdtempSync(join(tmpdir(),'community-'));let store;
 try{store=new WorldStore(join(dir,'world.sqlite'));store.reset('demo',null,{community:true,days:1});const w=store.world,[buyer,worker]=w.agents;act(w,buyer,d('post_order','square','wood',1));assign(w,worker,d('meal_plan','hearth','meal'));while(worker.task)ticks(w,1);const before=observation(w,worker);store.save([{kind:'request',input:{observation:before}}]);store.save();store.close();store=new WorldStore(join(dir,'world.sqlite'));assert.equal(store.world.version,'world-v9');assert.equal(store.world.agents[1].workPlan.kind,'meal_plan');assert.equal(metrics(store.world).coins,48);assert.deepEqual(store.records().find(r=>r.kind==='request').input.observation,before);
 const batches=new Batches(store,{generation:0,busy:false});batches.create('demo',null,{community:true,days:1});assert.equal(batches.batch.count,5);store.world.tick=store.world.maxTicks;batches.batch.status='running';batches.advance();assert.equal(store.world.version,'world-v9');assert.equal(store.world.community.jobs.length,0);assert.equal(store.world.agents[0].workPlan,null);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('real adapter fake transport sends and records exact v9 facts and schema without changing call cadence',async()=>{
 const {CodexClient}=await import('../src/codex.js'),{Runner}=await import('../src/runner.js'),{fileURLToPath}=await import('node:url'),{readFileSync}=await import('node:fs');
 const dir=mkdtempSync(join(tmpdir(),'community-wire-')),c=new CodexClient({dataDir:dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url)),timeout:500,probeIntervalMs:20}),s=new WorldStore(join(dir,'w.sqlite'));
 try{s.reset('chatgpt','test-model',{community:true});await new Runner(s,c).step(true);const request=s.records().filter(x=>x.kind==='request').at(-1),wire=JSON.parse(readFileSync(join(dir,'codex','test-protocol.json'),'utf8'));assert.deepEqual(JSON.parse(wire.turn.input[0].text),request.input.observation);assert.ok(wire.turn.outputSchema.properties.action.enum.includes('meal_plan'));assert.match(wire.thread.baseInstructions,/currentFacts/);assert.equal(request.input.decisionInputVersion,'community-facts-v1');assert.equal(s.world.calls,6);assert.equal(s.world.retriesUsed,0);}finally{await c.stop();s.close();rmSync(dir,{recursive:true,force:true});}
});

test('reserved upkeep cannot pay early or after another worker renewed service; expiry restores the budget',()=>{
 const w=fixture(),[donor,worker,rival]=w.agents,p=w.life.council.garden;p.status='complete';p.serviceUntil=w.tick+200;donor.coins-=3;p.balance=3;worker.inventory.wood=1;rival.inventory.wood=1;
 act(w,worker,d('reserve_upkeep','garden','wood'));const j=w.community.jobs[0];act(w,worker,d('complete_job','garden','wood',0,j.id));assert.equal(worker.coins,8);assert.equal(worker.inventory.wood,1);
 p.serviceUntil=w.tick;act(w,rival,d('maintain','garden','wood'));assert.equal(rival.coins,9);act(w,worker,d('complete_job','garden','wood',0,j.id));assert.equal(worker.coins,8);j.expiresAt=w.tick;ticks(w,2);assert.equal(p.balance,2);assert.equal(w.community.jobs.length,0);
});
test('renewable resources do not automatically feed idle v9 villagers',()=>{
 const w=fixture();ticks(w,288);assert.ok(metrics(w).starvingHours>0);assert.ok(w.agents.every(a=>a.health<100));assert.equal(w.community.stats.plansStarted,0);assert.equal(w.community.stats.jobsPosted,0);assert.equal(w.mealsCooked,0);assert.equal(metrics(w).rawMeals,0);
});
