import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorld,observation,assign,advance,metrics} from '../src/world.js';
import {syncMeals} from '../src/living.js';
const d=(action,target='none',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:'Controlled review.'});
const choices=o=>Object.values(o.planning.choiceGroups).flat();
function fixture(){const w=newWorld('demo',null,{adaptive:true});for(const a of w.agents){a.x=8;a.y=12;}return w;}
test('cycle2: fresh meals that can be eaten before expiry do not advertise costly preservation',()=>{
 const old=newWorld('demo',null,{living:true});old.agents[0].inventory.wood=1;assert.ok(choices(observation(old,old.agents[0])).some(x=>x.choice.action==='preserve_meals'));
 const w=fixture(),a=w.agents[0];a.inventory.wood=1;syncMeals(w);const o=observation(w,a);assert.equal(w.version,'world-v14');assert.equal(o.currentFacts.foodForecast.estimatedMealsExpiringBeforeUse,0);assert.ok(!choices(o).some(x=>x.choice.action==='preserve_meals'));assert.match(o.currentFacts.foodForecast.tradeoff,/same wood/);
});
test('cycle2: near-expiry surplus advertises preservation without forcing work or leaking other bags',()=>{
 const w=fixture(),a=w.agents[0];a.inventory.meal=6;a.inventory.wood=1;syncMeals(w);for(const l of w.living.food.lots['bag:'+a.id])l.bornAt=-850;
 w.agents[1].inventory.raw=987654;const o=observation(w,a);assert.ok(o.currentFacts.foodForecast.estimatedMealsExpiringBeforeUse>0);assert.ok(choices(o).some(x=>x.choice.action==='preserve_meals'));assert.ok(!JSON.stringify(o).includes('987654'));assert.equal(a.inventory.wood,1);assert.equal(w.living.stats.mealsPreserved,0);
});

test('cycle3: explicitly replacing an internal cooking step preserves or refunds its actual fuel',()=>{
 const w=fixture(),a=w.agents[0];a.x=8;a.y=8;a.inventory.meal=0;a.inventory.wood=1;syncMeals(w);
 assign(w,a,d('meal_plan','hearth','meal'));while(a.task)advance(w);advance(w);assert.equal(a.task.action,'cook');assert.equal(a.task.kitchen.cost,1);assert.equal(a.inventory.wood,0);
 assign(w,a,d('cook','hearth'));assert.equal(a.inventory.wood+(a.task?.kitchen?.cost||0),1);while(a.task)advance(w);assert.equal(a.inventory.meal,2);assert.equal(a.stats.cooked,2);assert.equal(metrics(w).coins,48);
});

test('cycle3: a held free stove credit is returned on a same-action plan override exactly once',()=>{
 const w=fixture(),a=w.agents[0];a.x=8;a.y=8;a.inventory.meal=0;a.inventory.wood=1;w.village.projects.stove.completedAt=0;w.living.stoveCredits=1;syncMeals(w);
 assign(w,a,d('meal_plan','hearth','meal'));while(a.task)advance(w);advance(w);assert.equal(a.task.kitchen.cost,0);assert.equal(w.living.stoveCredits,0);
 assign(w,a,d('cook','hearth'));assert.equal(a.task.kitchen.cost,0);assert.equal(w.living.stoveCredits,0);while(a.task)advance(w);assert.equal(w.village.stats.fuelSaved,1);assert.equal(w.living.stoveCredits,0);assert.equal(a.inventory.wood,1);
});
function act(w,a,c){assign(w,a,c);const es=[];for(let i=0;a.task&&i<400;i++)es.push(...advance(w));assert.equal(a.task,null);return es;}
test('cycle4 baseline: an ordinary early join fails rather than keeping a scheduled attendance commitment',()=>{
 const w=fixture(),[host,guest]=w.agents;host.inventory.leisure_kit=1;act(w,host,d('host_event','music','leisure_kit',1));const e=w.planning.sharedEvents.entries[0];act(w,guest,d('rsvp_event',host.id,'none',0,e.id));act(w,host,d('prepare_event','square','leisure_kit',0,e.id));
 assert.ok(w.tick<e.startsAt);const es=act(w,guest,d('join_event',host.id,'none',1,e.id));assert.ok(es.some(e=>e.kind==='blocked'));assert.equal(w.planning.stats.eventsHeld,0);assert.equal(e.reserved,1);assert.equal(guest.coins,8);
});

test('cycle4: explicit host and guest plans meet, consume a kit and pay once after scheduled participation',()=>{
 const w=fixture(),[host,guest]=w.agents;host.inventory.wood=1;act(w,host,d('host_event','games','leisure_kit',1));const e=w.planning.sharedEvents.entries[0];act(w,guest,d('rsvp_event',host.id,'none',0,e.id));
 act(w,host,d('event_plan','square','none',0,e.id));act(w,guest,d('attend_plan',host.id,'none',1,e.id));assert.equal(guest.coins,8);
 for(let i=0;(host.workPlan||guest.workPlan||host.task||guest.task)&&i<200;i++){advance(w);assert.equal(metrics(w).coins,48);}
 assert.equal(w.planning.stats.eventsHeld,1);assert.equal(w.planning.stats.eventKitsConsumed,1);assert.equal(host.coins,9);assert.equal(guest.coins,7);assert.equal(w.adaptive.stats.attendancePlansCompleted,1);assert.equal(guest.lastWorkPlan.status,'completed');assert.equal(host.lastWorkPlan.status,'completed');assert.equal(w.calls,0);
});
test('cycle4: an RSVP withdrawal stops the guest commitment without any forced ticket payment',()=>{
 const w=fixture(),[host,guest]=w.agents;act(w,host,d('host_event','music','leisure_kit',2));const e=w.planning.sharedEvents.entries[0];act(w,guest,d('rsvp_event',host.id,'none',0,e.id));act(w,guest,d('attend_plan',host.id,'none',2,e.id));act(w,guest,d('withdraw_rsvp',host.id,'none',0,e.id));
 for(let i=0;i<30;i++)advance(w);assert.equal(guest.coins,8);assert.equal(e.rsvpId,null);assert.equal(guest.workPlan,null);assert.equal(w.planning.stats.eventsHeld,0);
});
test('v14 ten-day control and visitor feasibility preserves exact food, wood and all 48 coins',async()=>{
 const {prepareVisitor}=await import('../src/living.js');
 for(const visitor of [false,true]){
  const w=newWorld('demo',null,{adaptive:true,visitor,socialStart:false});let cooks=0;
  while(w.tick<w.maxTicks){prepareVisitor(w);
   if(w.tick%12===0)for(const a of w.agents){const o=observation(w,a),f=o.currentFacts;let c=d('wait');
    if(f.hunger>=45&&f.inventory.meal)c=d('eat');else if(o.currentTask)c=d('continue');else if(f.energy<25)c=d('rest','shelter');else if(f.inventory.meal>=4)c=d('wait');else if(f.inventory.raw&&f.inventory.wood)c=d('cook','hearth');else c=d('gather',f.inventory.raw?'forest':'orchard');assign(w,a,c);
   }
   cooks+=advance(w).filter(e=>e.kind==='cook').length;assert.equal(metrics(w).coins,48);
  }
  assert.ok(w.agents.every(a=>a.health===100));assert.equal(metrics(w).rawMeals,0);assert.equal(metrics(w).starvingHours,0);assert.equal(w.calls,0);
  const sum=key=>w.agents.reduce((n,a)=>n+a.inventory[key],0),stats=key=>w.agents.reduce((n,a)=>n+a.stats[key],0);
  assert.equal(sum('raw'),6+(visitor?2:0)+stats('gatheredFood')-cooks);
  assert.equal(sum('meal')+w.pantry,18+(visitor?1:0)+w.mealsCooked-stats('ate')-w.living.stats.mealsSpoiled);
  assert.equal(sum('wood')+metrics(w).reservedCookingWood,(visitor?1:0)+stats('gatheredWood')-cooks+w.village.stats.fuelSaved);
 }
});
test('v14 real fake-adapter and paused persistence keep exact input/schema, condition and own attendance plans',async()=>{
 const {mkdtempSync,rmSync,readFileSync}=await import('node:fs'),{join}=await import('node:path'),{tmpdir}=await import('node:os'),{fileURLToPath}=await import('node:url');
 const {WorldStore,decisionSchema}=await import('../src/world.js'),{Runner}=await import('../src/runner.js'),{Batches}=await import('../src/batches.js'),{CodexClient}=await import('../src/codex.js');
 const dir=mkdtempSync(join(tmpdir(),'adaptive-acceptance-'));let store=new WorldStore(join(dir,'w.sqlite'));
 const client=new CodexClient({dataDir:dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url)),timeout:1000,probeIntervalMs:20});
 try{
  store.reset('chatgpt','test-model',{adaptive:true,visitor:true,competitive:true});store.world.agents[0].lastAttendedEvent={eventId:9876,tick:1};store.world.tick=864;store.world.nextDecisionTick=864;await new Runner(store,client).step(true);
  assert.equal(store.world.calls,7);assert.equal(store.world.agents[6].lastAttendedEvent,undefined);const request=store.records().filter(r=>r.kind==='request').at(-1),wire=JSON.parse(readFileSync(join(dir,'codex','test-protocol.json'),'utf8'));
  assert.deepEqual(wire.turn.outputSchema,decisionSchema('world-v14'));assert.deepEqual(JSON.parse(wire.turn.input[0].text),request.input.observation);assert.ok(request.input.observation.currentFacts.foodForecast);assert.equal(request.input.observation.objective.mode,'unscored');
  store.reset('demo',null,{adaptive:true});const w=store.world,[host,guest]=w.agents;for(const a of w.agents){a.x=8;a.y=12;}host.inventory.wood=1;act(w,host,d('host_event','games','leisure_kit',1));const e=w.planning.sharedEvents.entries[0];act(w,guest,d('rsvp_event',host.id,'none',0,e.id));act(w,host,d('event_plan','square','none',0,e.id));act(w,guest,d('attend_plan',host.id,'none',1,e.id));advance(w);w.running=true;store.save();const id=w.id;store.close();store=new WorldStore(join(dir,'w.sqlite'));
  assert.equal(store.world.id,id);assert.equal(store.world.running,false);assert.equal(store.world.agents[1].workPlan.kind,'attend_plan');assert.equal(store.world.version,'world-v14');
  const batch=new Batches(store,new Runner(store,{}));batch.create('demo',null,{adaptive:true,visitor:true});assert.equal(batch.batch.count,5);batch.batch.status='running';store.world.tick=store.world.maxTicks;batch.advance();assert.equal(store.world.version,'world-v14');assert.equal(store.world.living.visitor.enabled,true);assert.equal(store.world.plannedCalls,1608);
 }finally{await client.stop();store.close();rmSync(dir,{recursive:true,force:true});}
});
test('final review: malformed continuation remains blocked but cannot discard reserved cooking fuel',()=>{
 const w=fixture(),a=w.agents[0];a.inventory.wood=1;assign(w,a,d('cook','hearth'));assert.equal(a.task.kitchen.cost,1);
 assign(w,a,d('continue','none','none',1));assert.equal(a.task.action,'invalid');assert.equal(a.inventory.wood+(a.task.kitchen?.cost||0),1);
 const es=[];while(a.task)es.push(...advance(w));assert.ok(es.some(e=>e.kind==='blocked'));assert.equal(a.inventory.wood,1);assert.equal(w.living.stats.kitchenRefunds,1);
 const free=fixture(),b=free.agents[0];free.village.projects.stove.completedAt=0;free.living.stoveCredits=1;assign(free,b,d('cook','hearth'));assign(free,b,d('continue','none','none',1));assert.equal(free.living.stoveCredits,1);assert.equal(free.living.stats.kitchenRefunds,1);
});
