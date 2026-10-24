import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newWorld,assign,advance,observation,metrics,validateDecision,decisionSchema,WorldStore} from '../src/world.js';
import {syncMeals,prepareVisitor,score} from '../src/living.js';
import {Runner} from '../src/runner.js';
import {Batches} from '../src/batches.js';
import {createApp} from '../src/server.js';
import {CodexClient} from '../src/codex.js';
const d=(action,target='none',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:'Controlled check.'});
function fixture(options={}){const w=newWorld('demo',null,{living:true,...options});for(const a of w.agents){a.x=8;a.y=12;}return w;}
function ticks(w,n){const es=[];for(let i=0;i<n;i++){es.push(...advance(w));assert.equal(metrics(w).coins,48);}return es;}
function act(w,a,c){assign(w,a,c);const es=[];for(let i=0;a.task&&i<500;i++)es.push(...ticks(w,1));assert.equal(a.task,null);return es;}
const choices=o=>Object.values(o.planning.choiceGroups).flat();
const mealTotal=w=>Object.values(w.living.food.lots).flat().reduce((n,l)=>n+l.quantity,0);

test('v13 saves independent control, visitor and competitive conditions without changing legacy inputs',()=>{
 for(const [options,label,calls]of[[{},'control',1440],[{visitor:true},'visitor',1608],[{competitive:true},'competitive',1440],[{visitor:true,competitive:true},'visitor_competitive',1608]]){
 const w=fixture(options);assert.equal(w.version,'world-v13');assert.equal(w.living.condition,label);assert.equal(w.plannedCalls,calls);assert.equal(w.maxCalls,calls+12);assert.equal(w.agents.length,6);assert.equal(w.decisionInputVersion,'living-facts-v1');assert.equal(observation(w,w.agents[0]).objective.mode,options.competitive?'competitive':'unscored');}
 const before=fixture({visitor:true});assert.ok(act(before,before.agents[0],d('talk','v7')).some(e=>e.kind==='blocked'));
 assert.throws(()=>fixture({visitor:true,days:3}),/four/);assert.throws(()=>fixture({competitive:'yes'}));assert.throws(()=>validateDecision(d('preserve_meals','hearth','meal'),'world-v12'));
});
test('cooking reserves the shared discount once, refunds on replacement and preserves repeated work',()=>{
 const w=fixture(),[a,b]=w.agents;w.village.projects.stove.completedAt=0;w.living.stoveCredits=1;a.inventory.wood=0;b.inventory.wood=1;
 assign(w,a,d('cook','hearth'));assert.equal(a.task.kitchen.cost,0);assert.equal(w.living.stoveCredits,0);assign(w,b,d('cook','hearth'));assert.equal(b.task.kitchen.cost,1);assert.equal(b.inventory.wood,0);
 const task=b.task;assign(w,b,d('cook','hearth'));assert.equal(b.task,task);assert.equal(w.living.stats.kitchenReservations,2);
 act(w,a,d('rest','shelter'));assert.equal(w.living.stoveCredits,2); // A's credit returned; B completed paid cooking.
 assert.equal(w.village.stats.fuelSaved,0);assert.equal(b.inventory.meal,3);assert.equal(w.living.stats.kitchenRefunds,1);
});
test('two cooks cannot consume the same reserved credit and failed cooking returns its fuel exactly once',()=>{
 const w=fixture(),[a,b]=w.agents;w.village.projects.stove.completedAt=0;w.living.stoveCredits=1;
 assign(w,a,d('cook','hearth'));assign(w,b,d('cook','hearth'));ticks(w,10);assert.equal(a.inventory.meal,3);assert.equal(b.inventory.meal,1);assert.equal(w.village.stats.fuelSaved,1);assert.equal(w.living.stoveCredits,0);
 b.inventory.wood=1;assign(w,b,d('cook','hearth'));b.inventory.raw=0;ticks(w,10);assert.equal(b.inventory.wood,1);assert.equal(w.living.stats.kitchenRefunds,1);ticks(w,2);assert.equal(b.inventory.wood,1);
});
test('safety-pause refunds a plan-step cooking reservation and exposes explicit resume/cancel choices',()=>{
 const w=fixture(),a=w.agents[0];a.inventory.wood=1;assign(w,a,d('meal_plan','hearth','meal'));while(a.task)ticks(w,1);ticks(w,1);assert.equal(a.task.action,'cook');assert.equal(a.inventory.wood,0);a.hunger=80;ticks(w,1);assert.equal(a.workPlan.suspended,true);assert.equal(a.inventory.wood,1);assert.equal(a.task,null);
 const o=observation(w,a);assert.deepEqual(o.currentFacts.pendingCommitment.decisions.map(c=>c.action),['resume_plan','cancel_plan']);assert.equal(a.stats.ate,0);
});
test('meal age follows gifts, shop escrow and refunds; expiry consumes goods without minting meals or coins',()=>{
 const w=fixture(),[a,b]=w.agents;a.inventory.meal=4;syncMeals(w);const born=w.living.food.lots['bag:'+a.id][0].bornAt;w.tick=500;
 act(w,a,d('give',b.id,'meal'));assert.equal(w.living.food.lots['bag:'+b.id].at(-1).bornAt,born);
 act(w,a,d('open_shop','square','meal',1));const shop=w.life.shops[0];assert.ok(shop.stock);assert.ok(w.living.food.lots['shop:'+shop.id].every(l=>l.bornAt===0));act(w,a,d('close_shop','square','none',0,shop.id));assert.ok(w.living.food.lots['bag:'+a.id].every(l=>l.bornAt===0));
 w.tick=863;const before=mealTotal(w),es=ticks(w,1);assert.equal(mealTotal(w),0);assert.equal(w.living.stats.mealsSpoiled,before);assert.ok(es.some(e=>e.kind==='food_spoiled'));assert.equal(w.pantry,0);
});
test('preservation consumes wood and extends only three meals from original birth, including across sale',()=>{
 const w=fixture(),[a,b]=w.agents;a.inventory.meal=5;a.inventory.wood=1;syncMeals(w);w.tick=500;act(w,a,d('preserve_meals','hearth','meal'));assert.equal(a.inventory.wood,0);assert.equal(w.living.stats.mealsPreserved,3);assert.equal(w.living.food.lots['bag:'+a.id].filter(l=>l.preserved).reduce((n,l)=>n+l.quantity,0),3);
 w.tick=863;ticks(w,1);assert.equal(a.inventory.meal,3);act(w,a,d('offer','square','meal',1));const offer=w.economy.offers[0];act(w,b,d('buy',a.id,'meal',1,offer.id));assert.ok(w.living.food.lots['bag:'+b.id].every(l=>l.preserved&&l.bornAt===0));w.tick=1727;ticks(w,1);assert.equal(a.inventory.meal,0);assert.equal(b.inventory.meal,0);assert.equal(mealTotal(w),0);
});
test('expired meal offers disappear and prepared event meals cannot resurrect through cancellation',()=>{
 const w=fixture(),[host,guest]=w.agents;host.inventory.meal=4;syncMeals(w);act(w,host,d('offer','square','meal',1));act(w,host,d('host_event','square','meal',1));const e=w.planning.sharedEvents.entries[0];act(w,guest,d('rsvp_event',host.id,'none',0,e.id));act(w,host,d('prepare_event','square','meal',0,e.id));
 for(const lots of Object.values(w.living.food.lots))for(const l of lots)l.bornAt=w.tick-864;
 ticks(w,1);assert.equal(w.economy.offers.length,0);assert.equal(w.planning.sharedEvents.entries.length,0);assert.equal(host.inventory.meal,0);assert.equal(mealTotal(w),0);act(w,host,d('cancel_event','square','none',0,e.id));assert.equal(host.inventory.meal,0);
});
test('a willing RSVP enables bounded host production; attending consumes one real kit and pays once',()=>{
 const w=fixture(),[host,guest]=w.agents;host.inventory.wood=1;act(w,host,d('host_event','music','leisure_kit',1));const e=w.planning.sharedEvents.entries[0];act(w,host,d('event_plan','square','none',0,e.id));assert.equal(host.workPlan,null);
 act(w,guest,d('rsvp_event',host.id,'none',0,e.id));act(w,host,d('event_plan','square','none',0,e.id));for(let i=0;e.status!=='prepared'&&i<100;i++)ticks(w,1);assert.equal(e.status,'prepared');assert.equal(host.inventory.wood,0);assert.equal(e.reserved,1);assert.equal(host.coins,8);while(w.tick<e.startsAt)ticks(w,1);
 act(w,guest,d('join_event',host.id,'none',1,e.id));assert.equal(w.planning.stats.eventsHeld,1);assert.equal(w.planning.stats.eventKitsConsumed,1);assert.equal(host.coins,9);assert.equal(guest.coins,7);assert.equal(host.wellbeing.sharedWith[guest.id],1);
});
test('RSVP is a race-safe declaration, permits withdrawal and never forces attendance or spending',()=>{
 const w=fixture(),[host,a,b]=w.agents;act(w,host,d('host_event','games','leisure_kit',1));const e=w.planning.sharedEvents.entries[0];assign(w,a,d('rsvp_event',host.id,'none',0,e.id));assign(w,b,d('rsvp_event',host.id,'none',0,e.id));ticks(w,4);assert.ok([a.id,b.id].includes(e.rsvpId));assert.equal(w.living.stats.rsvpsMade,1);assert.equal(a.coins+b.coins,16);const guest=w.agents.find(a=>a.id===e.rsvpId);act(w,guest,d('withdraw_rsvp',host.id,'none',0,e.id));assert.equal(e.rsvpId,null);assert.equal(w.planning.stats.eventsHeld,0);
});
test('the visitor arrives once before a frozen round, has no inherited secrets or new coins, and can trade',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'living-visitor-'));let s;
 try{s=new WorldStore(join(dir,'w.sqlite'));s.reset('demo',null,{visitor:true});const w=s.world;w.agents[0].memories.push({text:'NEVER_COPY'});w.agents[0].goal={target:'home_bed'};w.tick=864;w.nextDecisionTick=864;const runner=new Runner(s,{});await runner.step(true);assert.equal(w.agents.length,7);assert.equal(w.living.stats.visitorArrivals,1);assert.equal(s.records().filter(r=>r.kind==='visitor_arrived').length,1);const visitor=w.agents[6];assert.ok(!JSON.stringify(visitor).includes('NEVER_COPY'));assert.equal(visitor.goal,null);assert.equal(visitor.coins,0);assert.equal(prepareVisitor(w).length,0);assert.equal(metrics(w).coins,48);const round=s.records().find(r=>r.kind==='round');assert.equal(round.actors.length,7);validateDecision(d('give','v7','raw'),w.version);
 visitor.x=8;visitor.y=12;const buyer=w.agents[1];buyer.x=8;buyer.y=12;act(w,visitor,d('offer','square','raw',1));const offer=w.economy.offers[0];act(w,buyer,d('buy',visitor.id,'raw',1,offer.id));assert.equal(visitor.coins,1);
 }finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});
test('score uses time averages and capped net ownership, cannot farm trade counts, and does not leak private opponents',()=>{
 const w=fixture({competitive:true}),[a,b]=w.agents;ticks(w,20);const first=score(w,a);a.economicStats.sold=100000;w.economy.stats.trades=100000;assert.equal(score(w,a).total,first.total);
 const before=score(w,a).parts.wealth;act(w,a,d('post_order','square','wood',1));assert.equal(score(w,a).parts.wealth,before);act(w,a,d('cancel_job','square','none',0,w.community.jobs[0].id));assert.equal(score(w,a).parts.wealth,before);
 a.coins=48;b.coins=0;assert.equal(score(w,a).parts.wealth,20);a.coins=1000;assert.equal(score(w,a).parts.wealth,20);const o=observation(w,b);assert.equal(o.objective.myScore.actorId,b.id);assert.ok(!JSON.stringify(o).includes('100000'));assert.equal(o.objective.myScore.ownCoinsIncludingRefundableEscrow,0);assert.ok(score(w,b).total<=100);
 const oldAverage=score(w,b).parts.connection;b.wellbeing.connection=100;assert.equal(score(w,b).parts.connection,oldAverage);
});
test('food lots, fuel escrow, contest averages and visitor lifecycle persist; a five-run queue keeps exact condition flags',()=>{
 const dir=mkdtempSync(join(tmpdir(),'living-persist-'));let s;
 try{s=new WorldStore(join(dir,'w.sqlite'));s.reset('demo',null,{visitor:true,competitive:true});const w=s.world,a=w.agents[0];a.inventory.wood=1;assign(w,a,d('cook','hearth'));ticks(w,1);s.save();const id=w.id;s.close();s=new WorldStore(join(dir,'w.sqlite'));assert.equal(s.world.running,false);assert.equal(s.world.id,id);assert.equal(s.world.agents[0].task.kitchen.cost,1);assert.equal(s.world.living.scores[a.id].ticks,1);assert.ok(s.world.living.food.lots.pantry);const b=new Batches(s,new Runner(s,{}));b.create('demo',null,{visitor:true,competitive:true});assert.equal(b.batch.count,5);b.batch.status='running';s.world.tick=s.world.maxTicks;b.advance();assert.equal(s.world.living.condition,'visitor_competitive');assert.equal(s.world.agents.length,6);assert.equal(s.world.plannedCalls,1608);
 }finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});
test('the real adapter records v13 schema and private score inputs with seven calls after visitor arrival',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'living-wire-'));const c=new CodexClient({dataDir:dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url)),timeout:1000,probeIntervalMs:20}),s=new WorldStore(join(dir,'w.sqlite'));
 try{s.reset('chatgpt','test-model',{visitor:true,competitive:true});s.world.tick=864;s.world.nextDecisionTick=864;await new Runner(s,c).step(true);assert.equal(s.world.calls,7);const r=s.records().filter(r=>r.kind==='request').at(-1),wire=JSON.parse(readFileSync(join(dir,'codex','test-protocol.json'),'utf8'));assert.deepEqual(wire.turn.outputSchema,decisionSchema('world-v13'));assert.deepEqual(JSON.parse(wire.turn.input[0].text),r.input.observation);assert.equal(r.actorId,'v7');assert.equal(r.input.observation.objective.mode,'unscored');assert.equal(s.world.retriesUsed,0);
 }finally{await c.stop();s.close();rmSync(dir,{recursive:true,force:true});}
});
test('all advertised v13 choices validate, and other residents’ freshness, goals and scores stay private',()=>{
 const w=fixture({competitive:true}),[a,b]=w.agents;a.inventory.wood=2;syncMeals(w);b.goal={target:'SECRET_GOAL'};b.inventory.raw=1234567;const o=observation(w,a);for(const x of choices(o))validateDecision(x.choice,w.version);assert.ok(!JSON.stringify(o).includes('SECRET_GOAL'));assert.ok(!JSON.stringify(o).includes('1234567'));assert.equal(o.currentFacts.foodFreshness.length,1);assert.equal(o.objective.myScore.actorId,a.id);
});
// Deliberately scripted feasibility evidence, never a provider fallback or adoption claim.
test('ten-day fresh control and visitor conditions can survive using only observed renewable supplies',()=>{
 for(const visitor of [false,true]){
 const w=fixture({visitor});
 while(w.tick<w.maxTicks){
  prepareVisitor(w);
  if(w.tick%12===0)for(const a of w.agents){
   const o=observation(w,a),cf=o.currentFacts,task=o.currentTask;let c=d('wait');
   if(cf.hunger>=45&&cf.inventory.meal)c=d('eat');
   else if(task)c=d('continue');
   else if(cf.energy<25)c=d('rest','shelter');
   else if(cf.inventory.meal>=4)c=d('wait');
   else if(cf.inventory.raw&&cf.inventory.wood)c=d('cook','hearth');
   else c=d('gather',cf.inventory.raw?'forest':'orchard');
   assign(w,a,c);
  }
  advance(w);assert.equal(metrics(w).coins,48);
 }
 assert.equal(w.agents.length,visitor?7:6);assert.equal(w.calls,0);assert.equal(metrics(w).starvingHours,0);assert.ok(w.agents.every(a=>a.health===100));assert.equal(metrics(w).rawMeals,0);
 }
});

test('owner HTTP creation and public research retain separate conditions, planned calls and spectator-only scores',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'living-http-')),previous=process.env.OWNER_SETUP_TOKEN;process.env.OWNER_SETUP_TOKEN='living-http-test';
 const app=createApp({dataDir:dir,codex:{stop(){},status:()=>({})},intervalMs:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const post=(path,data,cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
 try{assert.equal((await post('/api/admin/new',{mode:'demo',visitor:true})).status,401);const claim=await post('/api/claim',{token:'living-http-test'}),cookie=claim.headers.get('set-cookie').split(';')[0];
 assert.equal((await post('/api/admin/new',{mode:'demo',visitor:'yes'},cookie)).status,400);assert.equal((await post('/api/admin/new',{mode:'demo',visitor:true,days:3},cookie)).status,400);
 const response=await post('/api/admin/new',{mode:'demo',visitor:true,competitive:true},cookie);assert.equal(response.status,200);const state=await response.json();assert.equal(state.world.running,false);assert.equal(state.batch.count,5);assert.equal(state.contestScores.length,6);assert.equal(state.world.plannedCalls,1608);
 const report=await(await fetch(base+'/api/research/runs/'+state.world.id)).json();assert.equal(report.run.experiment.condition,'visitor_competitive');assert.equal(report.run.contestScores.length,6);
 const next=await(await post('/api/admin/new',{mode:'demo',living:true},cookie)).json();assert.equal(next.world.living.condition,'control');assert.equal(next.contestScores,null);assert.equal(next.world.plannedCalls,1440);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.OWNER_SETUP_TOKEN;else process.env.OWNER_SETUP_TOKEN=previous;}
});

test('simultaneous shop refunds preserve each owner’s original food age',()=>{
 const w=fixture(),[a,b]=w.agents;a.inventory.meal=4;syncMeals(w);act(w,a,d('open_shop','square','meal',1));
 // B stocks newly produced meals while A's stock is much older. Reverse shop ordering on expiry.
 b.inventory.meal=0;syncMeals(w);w.tick=200;b.inventory.meal=4;syncMeals(w);act(w,b,d('open_shop','square','meal',1));
 for(const shop of w.life.shops)shop.expiresAt=w.tick;w.life.shops.reverse();ticks(w,1);
 assert.ok(w.living.food.lots['bag:'+a.id].every(l=>l.bornAt===0));assert.ok(w.living.food.lots['bag:'+b.id].every(l=>l.bornAt===200));assert.equal(w.life.shops.length,0);
});
