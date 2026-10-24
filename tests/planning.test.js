import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {newWorld,assign,advance,observation,metrics,decisionSchema,validateDecision,WorldStore} from '../src/world.js';
import {CodexClient} from '../src/codex.js';
import {Runner} from '../src/runner.js';
import {Batches} from '../src/batches.js';
const d=(action,target='none',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:'Controlled test choice.'});
const fixture=events=>{const w=newWorld('demo',null,events?{sharedEvents:true}:{planning:true});for(const a of w.agents){a.x=8;a.y=12;}return w;};
function ticks(w,n){const es=[];for(let i=0;i<n;i++){es.push(...advance(w));assert.equal(metrics(w).coins,48);}return es;}
function act(w,a,c){assign(w,a,c);let es=[];for(let i=0;a.task&&i<400;i++)es.push(...ticks(w,1));assert.equal(a.task,null);return es;}
function finish(w,a){let es=[];for(let i=0;(a.task||a.workPlan)&&i<500;i++)es.push(...ticks(w,1));assert.equal(a.workPlan,null);assert.equal(a.task,null);return es;}
function funded(w,id='clinic',duration=70){const p=w.life.council[id];p.status='complete';p.serviceUntil=w.tick+duration;w.agents[5].coins-=3;p.balance=3;return p;}
function allChoices(o){return Object.values(o.planning.choiceGroups).flat();}

test('v11 planning and optional v12 events are separately versioned fresh conditions',()=>{
 const w=fixture(),e=fixture(true),old=newWorld('demo',null,{agency:true});assert.equal(w.version,'world-v11');assert.equal(w.decisionInputVersion,'planning-facts-v1');assert.equal(e.version,'world-v12');assert.equal(e.decisionInputVersion,'planning-events-facts-v1');assert.equal(w.planning.sharedEvents,null);assert.equal(w.plannedCalls,1440);assert.equal(e.plannedCalls,1440);
 assert.throws(()=>validateDecision(d('set_goal','stove'),old.version));assert.throws(()=>validateDecision(d('host_event','music','leisure_kit',1),w.version));validateDecision(d('host_event','music','leisure_kit',1),e.version);
 assert.throws(()=>newWorld('demo',null,{planning:'yes'}));assert.throws(()=>newWorld('demo',null,{sharedEvents:true,scenario:'commons'}),/Renewable/);
});
test('private daily goals survive eating/rest, observe real progress, expire and never force physical work',()=>{
 const w=fixture(),[a,b]=w.agents;const events=act(w,a,d('set_goal','stove'));assert.ok(events.some(e=>e.kind==='goal_set'&&e.privateTo===a.id));assert.ok(!JSON.stringify(b.memories).includes('private 24-hour goal'));
 a.hunger=45;act(w,a,d('eat'));act(w,a,d('rest','shelter'));assert.equal(a.goal.target,'stove');assert.equal(w.village.projects.stove.work,0);assert.equal(a.lastGoal,null);
 w.village.projects.stove.completedAt=w.tick;ticks(w,1);assert.equal(a.goal,null);assert.equal(a.lastGoal.status,'observed_complete');assert.equal(w.planning.stats.goalsObservedComplete,1);ticks(w,1);assert.equal(w.planning.stats.goalsObservedComplete,1);
 act(w,a,d('set_goal','home_bed'));a.goal.expiresAt=w.tick;ticks(w,2);assert.equal(a.lastGoal.status,'expired');assert.equal(w.planning.stats.goalsExpired,1);assert.equal(a.home.bed,false);
});
test('decision groups expose exact project work, long-term home benefits and private goal context',()=>{
 const w=fixture(),a=w.agents[0];a.inventory.wood=4;let o=observation(w,a);assert.ok(allChoices(o).some(x=>x.choice.action==='contribute'&&x.choice.target==='stove'));assert.ok(allChoices(o).some(x=>x.choice.action==='craft_bed'));assert.equal(o.planning.projects[0].horizonDaysRemaining,10);assert.match(o.planning.home.guidance,/per day/);assert.doesNotMatch(o.actions.community,/any other choice interrupts/);assert.doesNotMatch(o.actions.agency,/any other choice replaces/);assert.ok(allChoices(o).filter(x=>x.choice.action==='meal_plan').every(x=>/pauses at hunger/.test(x.effect)));
 const p=w.village.projects.stove;p.wood=p.woodNeeded;o=observation(w,a);assert.ok(allChoices(o).some(x=>x.choice.action==='build'&&x.choice.target==='stove'));assert.ok(allChoices(o).some(x=>x.choice.action==='request_work'));for(const x of allChoices(o))validateDecision(x.choice,w.version);
 w.agents[1].goal={target:'PRIVATE_GOAL'};w.agents[1].inventory.wood=987654;assert.ok(!JSON.stringify(observation(w,a)).includes('PRIVATE_GOAL'));assert.ok(!JSON.stringify(observation(w,a)).includes('987654'));
});
test('food and rest pause work without refunding or extending reservation; explicit resume finishes maintenance',()=>{
 const w=fixture(),a=w.agents[0],p=funded(w);a.inventory.wood=1;assign(w,a,d('upkeep_plan','clinic','wood'));while(a.task)ticks(w,1);ticks(w,1);const deadline=a.workPlan.expiresAt,job=w.community.jobs[0];
 a.hunger=45;act(w,a,d('eat'));assert.equal(a.workPlan.suspended,true);assert.equal(a.workPlan.expiresAt,deadline);assert.equal(p.balance,2);assert.equal(w.community.jobs[0].id,job.id);
 act(w,a,d('rest','shelter'));assert.equal(a.workPlan.suspended,true);assert.ok(allChoices(observation(w,a)).some(x=>x.choice.action==='resume_plan'));
 act(w,a,d('resume_plan'));finish(w,a);assert.equal(a.coins,9);assert.equal(p.balance,2);assert.equal(w.life.stats.maintenance,1);assert.equal(w.planning.stats.plansResumed,1);assert.equal(a.stats.ate,1);
});
test('safety pauses do not automatically eat; continue explicitly resumes after personal care',()=>{
 const w=fixture(),a=w.agents[0],p=funded(w);a.inventory.wood=1;assign(w,a,d('upkeep_plan','clinic','wood'));while(a.task)ticks(w,1);a.hunger=80;ticks(w,1);assert.equal(a.workPlan.suspended,true);assert.equal(a.stats.ate,0);assert.equal(p.balance,2);
 act(w,a,d('eat'));a.hunger=30;assign(w,a,d('continue'));assert.equal(a.workPlan.suspended,false);finish(w,a);assert.equal(w.life.stats.maintenance,1);assert.equal(a.stats.ate,1);
});
test('temporary depletion is recorded and waits for actual renewable growth, then earns the reserved wage',()=>{
 const w=fixture(),a=w.agents[0],p=funded(w);assign(w,a,d('upkeep_plan','clinic','wood'));while(a.task)ticks(w,1);
 a.x=13;a.y=3;w.resources.wood=0;w.regrowth.wood=0;
 const es=finish(w,a);assert.ok(es.some(e=>e.kind==='blocked'&&e.recovery));assert.ok(es.some(e=>e.kind==='gather'&&e.planStep));assert.equal(w.planning.stats.shortagesRecovered,1);assert.ok(w.planning.stats.shortageWaits>=1);assert.equal(w.life.stats.maintenance,1);assert.equal(a.coins,9);assert.equal(p.balance,2);assert.equal(w.calls,0);
});
test('shortage retries remain bounded; expiry while paused refunds once and keeps an unrelated care task',()=>{
 const w=fixture(),a=w.agents[0],p=funded(w);assign(w,a,d('upkeep_plan','clinic','wood'));while(a.task)ticks(w,1);a.x=13;a.y=3;w.resources.wood=0;w.regrowth.wood=0;
 for(let i=0;a.workPlan&&i<250;i++){w.resources.wood=0;ticks(w,1);}assert.equal(a.workPlan,null);assert.ok(w.planning.stats.shortagesRecovered<=3);assert.equal(p.balance,3);assert.equal(a.coins,8);
 assign(w,a,d('upkeep_plan','clinic','wood'));while(a.task)ticks(w,1);a.energy=20;assign(w,a,d('rest','shelter'));const care=a.task;a.workPlan.expiresAt=w.tick;ticks(w,1);assert.equal(a.workPlan,null);assert.equal(a.task,care);assert.equal(p.balance,3);ticks(w,2);assert.equal(p.balance,3);
});
test('an explicit supply order can pause an upkeep plan without spending its public wage',()=>{
 const w=fixture(),a=w.agents[0],p=funded(w);assign(w,a,d('upkeep_plan','clinic','wood'));while(a.task)ticks(w,1);act(w,a,d('post_order','square','wood',1));assert.equal(a.workPlan.suspended,true);assert.equal(a.coins,6);assert.equal(p.balance,2);assert.equal(w.community.jobs.length,2);act(w,a,d('cancel_plan'));assert.equal(p.balance,3);assert.equal(w.community.jobs.filter(j=>j.buyerId===a.id).length,1);
});
test('event supply loop pays a real producer and host only after willing participation',()=>{
 const w=fixture(true),[host,maker,guest]=w.agents;maker.inventory.wood=2;act(w,host,d('set_goal','shared_event'));act(w,host,d('host_event','music','leisure_kit',1));act(w,host,d('post_order','square','leisure_kit',1));const job=w.community.jobs[0];
 act(w,maker,d('claim_job','square','none',0,job.id));act(w,maker,d('craft_kit','square','leisure_kit'));act(w,maker,d('craft_kit','square','leisure_kit'));act(w,maker,d('complete_job',host.id,'leisure_kit',0,job.id));assert.equal(maker.coins,10);assert.equal(host.coins,6);
 const event=w.planning.sharedEvents.entries[0];const seen=observation(w,guest);assert.equal(seen.sharedEvents.entries[0].hostId,host.id);assert.equal(seen.planning.myGoal,null);assert.equal(seen.planning.myWorkPlan,null);for(const x of allChoices(seen))validateDecision(x.choice,w.version);act(w,host,d('prepare_event','square','leisure_kit',0,event.id));assert.equal(event.reserved,1);assert.equal(host.inventory.leisure_kit,1);while(w.tick<event.startsAt)ticks(w,1);
 const es=act(w,guest,d('join_event',host.id,'none',1,event.id));assert.ok(es.some(e=>e.kind==='event_held'));assert.equal(host.coins,7);assert.equal(guest.coins,7);assert.equal(host.inventory.leisure_kit,1);assert.equal(w.life.stats.kitsUsed,1);assert.equal(w.planning.stats.eventKitsConsumed,1);assert.equal(host.wellbeing.sharedWith[guest.id],1);assert.equal(guest.wellbeing.sharedWith[host.id],1);assert.equal(host.lastGoal.status,'observed_complete');assert.equal(w.planning.sharedEvents.entries.length,0);
 act(w,guest,d('join_event',host.id,'none',1,event.id));assert.equal(host.coins,7);assert.equal(w.planning.stats.eventsHeld,1);
});
test('event cancellation/expiry returns prepared supplies once and charges no ticket',()=>{
 for(const mode of ['cancel','expire']){
 const w=fixture(true),host=w.agents[0];host.inventory.leisure_kit=1;act(w,host,d('host_event','games','leisure_kit',2));const e=w.planning.sharedEvents.entries[0];act(w,host,d('prepare_event','square','leisure_kit',0,e.id));assert.equal(host.inventory.leisure_kit,0);
 if(mode==='cancel')act(w,host,d('cancel_event','square','none',0,e.id));else{e.expiresAt=w.tick;ticks(w,1);}ticks(w,2);assert.equal(host.inventory.leisure_kit,1);assert.equal(host.coins,8);assert.equal(w.planning.stats.eventSuppliesReturned,1);assert.equal(w.planning.stats.eventsHeld,0);
 }
});
test('shared meal consumes two real meals; no attendance or food is forced',()=>{
 const w=fixture(true),[host,guest]=w.agents;host.inventory.meal=3;host.hunger=45;guest.hunger=45;const before=metrics(w).foodGini;
 act(w,host,d('host_event','square','meal',1));const e=w.planning.sharedEvents.entries[0];act(w,host,d('prepare_event','square','meal',0,e.id));assert.equal(host.inventory.meal,1);assert.equal(e.reserved,2);assert.equal(metrics(w).foodGini,before);
 while(w.tick<e.startsAt)ticks(w,1);const foods=()=>w.agents.reduce((n,a)=>n+a.inventory.meal,0)+w.pantry+w.planning.sharedEvents.entries.reduce((n,e)=>n+(e.item==='meal'?e.reserved:0),0);const foodBefore=foods();
 host.x=13;host.y=3;act(w,guest,d('join_event',host.id,'none',1,e.id));assert.equal(foods(),foodBefore);assert.equal(guest.coins,8);
 host.x=8;host.y=12;act(w,guest,d('join_event',host.id,'none',1,e.id));assert.equal(foods(),foodBefore-2);assert.equal(w.planning.stats.eventMealsConsumed,2);assert.equal(host.stats.ate,1);assert.equal(guest.stats.ate,1);assert.ok(host.hunger<40);assert.ok(guest.hunger<40);
});
test('competing guests cannot consume or pay for the same prepared event twice',()=>{
 const w=fixture(true),[host,a,b]=w.agents;host.inventory.leisure_kit=1;act(w,host,d('host_event','music','leisure_kit',2));const e=w.planning.sharedEvents.entries[0];act(w,host,d('prepare_event','square','leisure_kit',0,e.id));while(w.tick<e.startsAt)ticks(w,1);
 assign(w,a,d('join_event',host.id,'none',2,e.id));assign(w,b,d('join_event',host.id,'none',2,e.id));ticks(w,8);assert.equal(w.planning.stats.eventsHeld,1);assert.equal(w.planning.stats.eventKitsConsumed,1);assert.equal(host.coins,10);assert.equal(a.coins+b.coins,14);
});
test('goals, suspended work and prepared event escrow survive restart paused',()=>{
 const dir=mkdtempSync(join(tmpdir(),'planning-store-'));let s;
 try{s=new WorldStore(join(dir,'w.sqlite'));s.reset('demo',null,{sharedEvents:true,days:1});const w=s.world,[host,worker]=w.agents;for(const a of w.agents){a.x=8;a.y=12;}host.inventory.leisure_kit=1;act(w,host,d('set_goal','shared_event'));act(w,host,d('host_event','music','leisure_kit',1));const e=w.planning.sharedEvents.entries[0];act(w,host,d('prepare_event','square','leisure_kit',0,e.id));funded(w);worker.inventory.wood=1;act(w,worker,d('upkeep_plan','clinic','wood'));worker.hunger=45;act(w,worker,d('eat'));w.running=true;s.save();const id=w.id;s.close();s=new WorldStore(join(dir,'w.sqlite'));assert.equal(s.world.running,false);assert.equal(s.world.id,id);assert.equal(s.world.agents[0].goal.target,'shared_event');assert.equal(s.world.planning.sharedEvents.entries[0].reserved,1);assert.equal(s.world.agents[1].workPlan.suspended,true);assert.equal(metrics(s.world).coins,48);
 const r=new Runner(s,{}),b=new Batches(s,r);b.create('demo',null,{planning:true,days:1});assert.equal(b.batch.count,5);b.batch.status='running';s.world.tick=s.world.maxTicks;b.advance();assert.equal(s.world.version,'world-v11');assert.equal(s.world.planning.sharedEvents,null);
 }finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});
test('both new treatments record exact fake-adapter inputs with unchanged six-call hourly cadence',async()=>{
 for(const options of [{planning:true},{sharedEvents:true}]){
 const dir=mkdtempSync(join(tmpdir(),'planning-wire-')),c=new CodexClient({dataDir:dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url)),timeout:500,probeIntervalMs:20}),s=new WorldStore(join(dir,'w.sqlite'));
 try{s.reset('chatgpt','test-model',options);await new Runner(s,c).step(true);const request=s.records().filter(r=>r.kind==='request').at(-1),wire=JSON.parse(readFileSync(join(dir,'codex','test-protocol.json'),'utf8'));assert.deepEqual(JSON.parse(wire.turn.input[0].text),request.input.observation);assert.deepEqual(wire.turn.outputSchema,decisionSchema(s.world.version));assert.ok(request.input.observation.planning.choiceGroups);assert.equal(s.world.calls,6);assert.equal(s.world.retriesUsed,0);}finally{await c.stop();s.close();rmSync(dir,{recursive:true,force:true});}
 }
});
