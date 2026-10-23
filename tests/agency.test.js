import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorld, assign, advance, observation, metrics, validateDecision, WorldStore, routineOnly, decisionSchema } from '../src/world.js';
import { activity, activityPreview } from '../src/community.js';
import { hobbyBase } from '../src/agency.js';
import { CodexClient } from '../src/codex.js';
import { Runner } from '../src/runner.js';
import { Batches } from '../src/batches.js';

const d=(action,target='square',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:'Controlled test choice.'});
const fixture=()=>{const w=newWorld('demo',null,{agency:true,socialStart:false});for(const a of w.agents){a.x=8;a.y=12;}return w;};
function ticks(w,n){const es=[];for(let i=0;i<n;i++){es.push(...advance(w));assert.equal(metrics(w).coins,48);}return es;}
function act(w,a,c){assign(w,a,c);let es=[];for(let i=0;a.task&&i<400;i++)es.push(...ticks(w,1));assert.equal(a.task,null);return es;}
function finish(w,a){let es=[];for(let i=0;(a.task||a.workPlan)&&i<400;i++)es.push(...ticks(w,1));assert.equal(a.workPlan,null);assert.equal(a.task,null);return es;}
function funded(w,id='garden',duration=80){const p=w.life.council[id];p.status='complete';p.serviceUntil=w.tick+duration;w.agents[5].coins-=3;p.balance=3;return p;}

test('v10 is fresh and explicit; v9 keeps old schema, purchase quantities and prompts',()=>{
 const old=newWorld('demo',null,{community:true}),w=fixture();assert.equal(old.version,'world-v9');assert.equal(old.agency,undefined);assert.equal(w.version,'world-v10');assert.equal(w.decisionInputVersion,'actionable-facts-v1');assert.equal(w.plannedCalls,1440);assert.equal(w.maxCalls,1452);
 assert.throws(()=>validateDecision(d('upkeep_plan','garden','wood'),old.version));validateDecision(d('upkeep_plan','garden','wood'),w.version);
 assert.throws(()=>newWorld('demo',null,{agency:'yes'}));assert.throws(()=>newWorld('demo',null,{agency:true,scenario:'commons'}),/Renewable/);
 assert.equal(observation(old,old.agents[0]).currentFacts.activityChoices,undefined);assert.equal(observation(old,old.agents[0]).agency,undefined);
});
test('exact hobby choices consume carried kits; invalid-kit regression gives an actionable correction',()=>{
 const w=fixture(),a=w.agents[0];a.inventory.leisure_kit=1;
 let o=observation(w,a);const h=o.currentFacts.activityChoices.hobbies.find(h=>h.interest==='music');assert.equal(h.choice.item,'none');assert.equal(h.kitWillBeConsumed,true);assert.equal(h.enjoyment,20);
 act(w,a,d('hobby','music','leisure_kit'));o=observation(w,a);assert.equal(o.currentFacts.lastActionResult.success,false);assert.match(o.currentFacts.lastActionResult.guidance,/automatically/);assert.equal(a.inventory.leisure_kit,1);
 const corrected=o.currentFacts.lastActionResult.correction;assert.deepEqual(corrected,{...d('hobby','music'),reason:''});act(w,a,corrected);assert.equal(a.inventory.leisure_kit,0);assert.equal(w.life.stats.kitsUsed,1);assert.equal(a.actionFeedback.success,true);assert.equal(w.agency.stats.blockedHobbyChoices,1);
 o=observation(w,a);assert.ok(o.currentFacts.activityChoices.hobbies.every(h=>!h.ready));assert.ok(!o.coordination.opportunities.some(x=>x.choice.action==='hobby'));
});
test('preview and engine share repetition and caps; alternative hobbies beat a repeated social loop',()=>{
 const w=fixture(),a=w.agents[0];for(let i=0;i<15;i++)activity(w,a,'socialize',{connection:6,enjoyment:3});a.wellbeing.enjoyment=10;
 const o=observation(w,a);assert.ok(o.currentFacts.activityChoices.hobbies[0].enjoyment>o.currentFacts.activityChoices.socialize.enjoyment);
 const before={...a.wellbeing},p=activityPreview(w,a,'music',{enjoyment:hobbyBase(w,a,'music')});activity(w,a,'music',{enjoyment:hobbyBase(w,a,'music')});assert.equal(a.wellbeing.enjoyment-before.enjoyment,p.enjoymentGain);
 a.wellbeing.enjoyment=99.5;assert.equal(activityPreview(w,a,'games',{enjoyment:12}).enjoymentGain,0.5);
});
test('home purchase orders escrow one unit, require delivery, install for a benefit and pay once',()=>{
 const w=fixture(),[buyer,maker]=w.agents;act(w,buyer,d('post_order','square','bed',3));const j=w.community.jobs[0];assert.equal(j.quantity,1);assert.equal(j.escrow,3);assert.equal(buyer.coins,5);assert.equal(w.agency.stats.homeOrdersPosted,1);
 act(w,maker,d('claim_job','square','none',0,j.id));let o=observation(w,maker);assert.ok(o.coordination.opportunities.some(x=>x.choice.action==='gather'&&x.choice.target==='forest'));
 maker.inventory.wood=3;o=observation(w,maker);assert.ok(o.coordination.opportunities.some(x=>x.choice.action==='craft_bed'));act(w,maker,d('craft_bed','square','bed'));act(w,maker,d('complete_job',buyer.id,'bed',0,j.id));assert.equal(buyer.inventory.bed,1);assert.equal(maker.coins,11);
 act(w,maker,d('complete_job',buyer.id,'bed',0,j.id));assert.equal(maker.coins,11);act(w,buyer,d('furnish','shelter','bed'));assert.equal(buyer.home.bed,true);assert.equal(buyer.inventory.bed,0);assert.ok(!observation(w,buyer).agency.myNeeds.some(n=>n.item==='bed'));
});
test('unfilled home orders refund once; ordinary supplies still require two units',()=>{
 const w=fixture(),a=w.agents[0];act(w,a,d('post_order','square','furnishing',2));w.community.jobs[0].expiresAt=w.tick;ticks(w,2);assert.equal(a.coins,8);
 act(w,a,d('post_order','square','wood',2));assert.equal(w.community.jobs[0].quantity,2);assert.equal(w.community.jobs[0].escrow,4);act(w,a,d('cancel_job','square','none',0,w.community.jobs[0].id));assert.equal(a.coins,8);
 const old=newWorld('demo',null,{community:true});act(old,old.agents[0],d('post_order','square','bed',2));assert.equal(old.community.jobs.length,0);
});
test('upkeep plan reserves existing funds, gathers real wood, travels, waits and performs one paid maintenance',()=>{
 const w=fixture(),a=w.agents[0],p=funded(w);const energy=a.energy;
 assign(w,a,d('upkeep_plan','garden','wood'));const es=finish(w,a);
 assert.equal(a.lastWorkPlan.status,'completed');assert.equal(p.balance,2);assert.equal(a.coins,9);assert.equal(w.life.stats.maintenance,1);assert.equal(w.agency.stats.upkeepPlansStarted,1);assert.equal(w.agency.stats.upkeepPlansCompleted,1);assert.equal(w.community.stats.plansCompleted,1);assert.equal(w.community.jobs.length,0);assert.ok(a.stats.gatheredWood>=2);assert.equal(a.inventory.wood,a.stats.gatheredWood-1);assert.ok(a.energy<energy-4);assert.equal(a.stats.ate,0);assert.equal(w.calls,0);assert.ok(es.some(e=>e.kind==='job_filled'&&e.planStep));assert.ok(es.some(e=>e.kind==='plan_completed'));
});
test('upkeep is race-safe and each interruption releases wages once',()=>{
 for(const mode of ['manual','hunger','energy','depleted','renewed','expired']) {
  const w=fixture(),[a,b]=w.agents,p=funded(w,'clinic',120);assign(w,a,d('upkeep_plan','clinic','wood'));while(a.task)ticks(w,1);assert.equal(p.balance,2);assert.equal(routineOnly(w),false);
  act(w,b,d('upkeep_plan','clinic','wood'));assert.equal(w.community.jobs.length,1);assert.equal(w.agency.stats.upkeepPlansStarted,1);
  if(mode==='manual')assign(w,a,d('rest','shelter'));
  if(mode==='hunger')a.hunger=80;
  if(mode==='energy')a.energy=9;
  if(mode==='depleted')w.resources.wood=0;
  if(mode==='renewed')p.serviceUntil=w.tick+500;
  if(mode==='expired')a.workPlan.expiresAt=w.tick;
  finish(w,a);assert.equal(p.balance,3,mode);assert.equal(w.community.jobs.length,0,mode);assert.equal(a.coins,8);ticks(w,3);assert.equal(p.balance,3);assert.equal(w.agency.stats.upkeepReservationsReleased,1);
 }
});
test('cancelling a waiting plan restores ordinary task duration and does not retain a long wait',()=>{
 const w=fixture(),a=w.agents[0],p=funded(w,'garden',160);a.inventory.wood=1;assign(w,a,d('upkeep_plan','garden','wood'));while(a.task)ticks(w,1);ticks(w,1);assert.equal(a.task.action,'wait');assert.ok(a.task.work>100);
 assign(w,a,d('wait','square'));assert.equal(a.workPlan,null);assert.equal(a.task.work,3);assert.equal(p.balance,3);ticks(w,3);assert.equal(a.task,null);
});
test('service renewal by a real second worker cancels the plan without a second payment',()=>{
 const w=fixture(),[a,b]=w.agents,p=funded(w,'clinic',20);a.inventory.wood=1;b.inventory.wood=1;b.x=4;b.y=12;assign(w,a,d('upkeep_plan','clinic','wood'));while(a.task)ticks(w,1);
 act(w,b,d('maintain','clinic','wood'));finish(w,a);assert.equal(a.coins,8);assert.equal(b.coins,9);assert.equal(p.balance,2);assert.equal(w.life.stats.maintenance,1);assert.equal(a.inventory.wood,1);assert.equal(a.lastWorkPlan.status,'service_renewed');
});
test('choices expose only own needs/feedback and explicitly posted public demand',()=>{
 const w=fixture(),[a,b]=w.agents;b.inventory.bed=78901;b.lastAttempt={reason:'PRIVATE_ATTEMPT'};b.actionFeedback={text:'PRIVATE_FEEDBACK'};b.wellbeing.sharedWith={PRIVATE_NOTE:2};b.coins=6;a.coins=10;
 act(w,a,d('post_order','square','bed',3));let o=observation(w,b);assert.equal(o.agency.publicPurchaseOrders[0].item,'bed');assert.equal(o.agency.publicPurchaseOrders[0].reservedPay,3);
 o=observation(w,a);const text=JSON.stringify(o);for(const marker of ['78901','PRIVATE_ATTEMPT','PRIVATE_FEEDBACK','PRIVATE_NOTE'])assert.ok(!text.includes(marker));
 for(const x of o.coordination.opportunities)validateDecision(x.choice,w.version);assert.match(o.actions.leisure,/item none/);
 const oldCoins=a.coins;ticks(w,24);assert.equal(a.coins,oldCoins);assert.equal(w.agency.stats.upkeepPlansStarted,0);
});
test('upkeep reservation and progress persist paused across restart; next batch member stays v10',()=>{
 const dir=mkdtempSync(join(tmpdir(),'agency-store-'));let s;
 try{s=new WorldStore(join(dir,'w.sqlite'));s.reset('demo',null,{agency:true,days:1});const a=s.world.agents[0];funded(s.world,'garden',120);a.inventory.wood=1;a.x=8;a.y=12;assign(s.world,a,d('upkeep_plan','garden','wood'));while(a.task)ticks(s.world,1);ticks(s.world,1);s.world.running=true;s.save();const id=s.world.id;s.close();s=new WorldStore(join(dir,'w.sqlite'));assert.equal(s.world.running,false);assert.equal(s.world.id,id);assert.equal(s.world.agents[0].workPlan.kind,'upkeep_plan');finish(s.world,s.world.agents[0]);assert.equal(s.world.agency.stats.upkeepPlansCompleted,1);
 const r=new Runner(s,{}),b=new Batches(s,r);b.create('demo',null,{agency:true,days:1});assert.equal(b.batch.count,5);b.batch.status='running';s.world.tick=s.world.maxTicks;b.advance();assert.equal(s.world.version,'world-v10');assert.equal(s.world.decisionInputVersion,'actionable-facts-v1');assert.equal(s.world.agency.stats.upkeepPlansStarted,0);
 }finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});
test('fake adapter records exact v10 observations/schema with unchanged hourly model calls',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'agency-wire-')),c=new CodexClient({dataDir:dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url)),timeout:500,probeIntervalMs:20}),s=new WorldStore(join(dir,'w.sqlite'));
 try{s.reset('chatgpt','test-model',{agency:true});await new Runner(s,c).step(true);const request=s.records().filter(r=>r.kind==='request').at(-1),wire=JSON.parse(readFileSync(join(dir,'codex','test-protocol.json'),'utf8'));assert.deepEqual(JSON.parse(wire.turn.input[0].text),request.input.observation);assert.deepEqual(wire.turn.outputSchema,decisionSchema('world-v10'));assert.equal(request.input.decisionInputVersion,'actionable-facts-v1');assert.match(wire.thread.baseInstructions,/currentFacts/);assert.equal(s.world.calls,6);assert.equal(s.world.retriesUsed,0);}finally{await c.stop();s.close();rmSync(dir,{recursive:true,force:true});}
});

test('remote activity estimates do not disclose attendance at a distant meeting green',()=>{
 const w=fixture(),a=w.agents[0];a.x=3;a.y=4;const first=observation(w,a).currentFacts.activityChoices.socialize;w.agents[1].x=0;w.agents[1].y=14;const second=observation(w,a).currentFacts.activityChoices.socialize;assert.deepEqual(second,first);assert.equal(first.connection,null);assert.ok(first.connectionRange.length===2);
});
