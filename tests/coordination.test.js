import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorld,observation,assign,advance,metrics,validateDecision,decisionSchema,WorldStore } from '../src/world.js';
import { Runner } from '../src/runner.js';
import { CodexClient } from '../src/codex.js';
import { Batches } from '../src/batches.js';
const d=(action,target='square',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:'Controlled choice.'});
const fixture=()=>{const w=newWorld('demo',null,{coordination:true,socialStart:false});for(const a of w.agents){a.x=8;a.y=12;}return w;};
function act(w,a,choice){assign(w,a,choice);const es=[];while(a.task)es.push(...advance(w));assert.equal(metrics(w).coins,48);return es.at(-1);}
function until(w,t){while(w.tick<t)advance(w);}

test('v8 is explicit; earlier schemas, observations and self-cooking remain unchanged',()=>{
 const old=newWorld('demo',null,{life:true});assert.equal(old.version,'world-v7');assert.equal(old.economy.rules.specialistCook,3);assert.equal(old.decisionInputVersion,'current-facts-v1');
 const w=fixture();assert.equal(w.version,'world-v8');assert.equal(w.economy.rules.specialistCook,4);assert.equal(w.economy.rules.baseCook,2);assert.equal(w.plannedCalls,1440);assert.equal(w.reviewHours,1);assert.equal(w.decisionInputVersion,'coordinated-facts-v1');
 validateDecision(d('sponsor','clinic','none',1),w.version);assert.throws(()=>validateDecision(d('sponsor','clinic','none',1),old.version));assert.throws(()=>newWorld('demo',null,{coordination:true,scenario:'commons'}),/Renewable/);
});
test('opening a v8 shop escrows bounded surplus; one-item pickup is exact, voluntary and race-safe',()=>{
 const w=fixture(),[seller,buyer,other]=w.agents;seller.inventory.meal=4;
 act(w,seller,d('open_shop','square','meal',2));const s=w.life.shops[0];assert.equal(s.stock,3);assert.equal(seller.inventory.meal,1);assert.equal(w.coordination.stats.openingStock,3);
 until(w,w.tick+12);assert.equal(buyer.coins,8);assert.equal(buyer.inventory.meal,1);
 assert.equal(act(w,buyer,d('shop_buy',seller.id,'meal',1,s.id)).kind,'blocked');assert.equal(s.stock,3);
 act(w,buyer,d('shop_buy',seller.id,'meal',2,s.id));assert.equal(buyer.coins,6);assert.equal(seller.coins,10);assert.equal(buyer.inventory.meal,2);assert.equal(s.stock,2);
 act(w,other,d('shop_buy',seller.id,'meal',2,s.id));act(w,buyer,d('shop_buy',seller.id,'meal',2,s.id));assert.equal(s.stock,0);
 assert.equal(act(w,other,d('shop_buy',seller.id,'meal',2,s.id)).kind,'blocked');assert.equal(w.coordination.stats.shopPurchases,3);assert.equal(w.economy.stats.trades,3);
 act(w,seller,d('close_shop','square','none',0,s.id));assert.equal(seller.inventory.meal,1);
});
test('legacy shop opening is empty, care cannot be picked up, and remaining new stock refunds once',()=>{
 const old=newWorld('demo',null,{life:true});old.agents[0].inventory.meal=5;act(old,old.agents[0],d('open_shop','square','meal',1));assert.equal(old.life.shops[0].stock,0);
 const w=fixture(),[a,b]=w.agents;a.inventory.wood=9;act(w,a,d('open_shop','square','wood',1));const s=w.life.shops[0];assert.equal(s.stock,3);assert.equal(a.inventory.wood,6);until(w,s.expiresAt+1);assert.equal(a.inventory.wood,9);
 act(w,a,d('open_shop','square','care',1));assert.equal(act(w,b,d('shop_buy',a.id,'care',1,w.life.shops[0].id)).kind,'blocked');
});
test('sponsorship combines pledge and own vote but cannot buy a majority; rejected pledges return',()=>{
 const w=fixture(),[a,b,c,e]=w.agents;
 act(w,a,d('sponsor','clinic','none',2));const p=w.life.council.clinic;assert.equal(p.status,'voting');assert.equal(p.balance,2);assert.equal(p.votes[a.id],'yes');assert.equal(a.coins,6);
 act(w,a,d('sponsor','clinic','none',1));assert.equal(Object.keys(p.votes).length,1);until(w,p.deadline);assert.equal(p.status,'unproposed');assert.equal(a.coins,8);assert.equal(p.balance,0);
 for(const x of [a,b,c,e])act(w,x,d('sponsor','garden','none',1));const g=w.life.council.garden;until(w,g.deadline);assert.equal(g.status,'approved');assert.equal(g.balance,4);assert.equal(Object.values(g.votes).filter(v=>v==='yes').length,4);
 assert.equal(act(w,a,d('sponsor','garden','none',1)).kind,'blocked');
});
test('four-meal specialist service rewards both sides of barter; paid service returns all meals',()=>{
 for(const fee of [0,1]){
 const w=fixture(),[buyer,,cook]=w.agents;buyer.inventory.raw=1;buyer.inventory.wood=1;buyer.inventory.meal=0;cook.inventory.meal=0;
 act(w,buyer,d('request_cooking','square','meal',fee));const r=w.village.requests[0];const e=act(w,cook,d('fulfill_cooking',buyer.id,'meal',fee,r.id));
 assert.equal(e.mealsProduced,4);assert.equal(buyer.inventory.meal,fee?4:2);assert.equal(cook.inventory.meal,fee?0:2);assert.equal(buyer.inventory.raw,0);assert.equal(buyer.inventory.wood,0);assert.equal(cook.coins,8+fee);
 }
});
test('compact v8 inputs expose public work and exact opportunities while keeping private state private',()=>{
 const w=fixture(),[a,b]=w.agents;b.inventory.meal=98765;b.coins=87654;b.personal.interest='PRIVATE-INTEREST';b.memories=[{tick:0,text:'PRIVATE-MEMORY'}];b.relationships={v6:{private:'PRIVATE-NOTE'}};
 assign(w,b,d('gather','forest'));const o=observation(w,a),serialized=JSON.stringify(o);
 assert.ok(o.coordination.publicWorkIntents.some(i=>i.actorId===b.id&&i.target==='forest'));assert.ok(!serialized.includes('98765'));assert.ok(!serialized.includes('87654'));assert.ok(!serialized.includes('PRIVATE-'));
 assert.equal(o.currentFacts.hunger,a.hunger);assert.equal(o.currentFacts.inventory.meal,a.inventory.meal);assert.equal(o.inventory,undefined);assert.equal(o.nearbyVillagers.find(x=>x.id===b.id).inventory,undefined);
 assert.ok(o.coordination.opportunities.some(x=>x.choice.action==='sponsor'));assert.ok(serialized.includes('satisfaction'));
 // Like-for-like mature history: smaller input, full history remains in saved state.
 const legacy=structuredClone(w);legacy.version='world-v7';legacy.decisionInputVersion='current-facts-v1';legacy.economy.rules.specialistCook=3;
 assert.ok(serialized.length<JSON.stringify(observation(legacy,a)).length*.9);
});
test('two-hour reviews halve calls with every physical tick and hunger rule retained',async()=>{
 for(const reviewHours of [1,2]){
 const dir=mkdtempSync(join(tmpdir(),'coordinated-cadence-')),s=new WorldStore(join(dir,'w.sqlite'));let calls=0;
 try{s.reset('chatgpt','test-model',{coordination:true,days:1,reviewHours});const r=new Runner(s,{decide:async o=>{calls++;assert.equal(o.nextReviewMinutes,60*reviewHours);return{decision:d('wait','none')};}});s.world.running=true;while(s.world.running)await r.step();assert.equal(s.world.tick,288);assert.equal(calls,144/reviewHours);assert.equal(s.world.maxCalls,144/reviewHours+12);assert.equal(s.frames().length,289);assert.ok(s.world.agents.some(a=>a.health<100));}finally{s.close();rmSync(dir,{recursive:true,force:true});}
 }
 assert.throws(()=>newWorld('demo',null,{life:true,reviewHours:2}),/v8/);assert.throws(()=>newWorld('demo',null,{coordination:true,reviewHours:3}),/1 or 2/);
});
test('v8 remains physically sustainable under an observation-only coordination policy',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'coordinated-food-')),s=new WorldStore(join(dir,'w.sqlite'));
 try{s.reset('chatgpt','test-model',{coordination:true,socialStart:false});const r=new Runner(s,{decide:async o=>{
 const {hunger,energy,inventory}=o.currentFacts;let choice;
 if(hunger>=45&&inventory.meal)choice=d('eat','none');
 else if(hunger>=55&&!inventory.meal&&!(inventory.raw&&inventory.wood))choice=d('eat','pantry');
 else if(o.currentTask)choice=d('continue','none');
 else if(energy<25)choice=d('rest','shelter');
 else if(inventory.meal>2)choice=d('share','pantry');
 else if(inventory.raw&&inventory.wood)choice=d('cook','hearth');
 else choice=d('gather',inventory.raw?'forest':'orchard');
 return{decision:choice};}});s.world.running=true;while(s.world.running)await r.step();assert.equal(s.world.tick,2880);assert.equal(s.world.calls,1440);assert.equal(metrics(s.world).starvingHours,0);assert.ok(s.world.agents.every(a=>a.health===100));assert.equal(metrics(s.world).coins,48);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('real adapter fake transport sends the compact v8 facts and schema exactly as recorded',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'coordinated-wire-')),c=new CodexClient({dataDir:dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url)),timeout:500,probeIntervalMs:20}),s=new WorldStore(join(dir,'w.sqlite'));
 try{s.reset('chatgpt','test-model',{coordination:true});s.world.agents[5].name='CompletedWithoutEvent';await new Runner(s,c).step(true);const request=s.records().filter(x=>x.kind==='request').at(-1),wire=JSON.parse(readFileSync(join(dir,'codex','test-protocol.json'),'utf8'));assert.deepEqual(JSON.parse(wire.turn.input[0].text),request.input.observation);assert.deepEqual(wire.turn.outputSchema,decisionSchema('world-v8'));assert.match(wire.thread.baseInstructions,/currentFacts/);assert.equal(request.input.decisionInputVersion,'coordinated-facts-v1');const decision=s.records().filter(x=>x.kind==='decision').at(-1);assert.equal(decision.completionSource,'thread_read');assert.equal(decision.usageReported,false);assert.equal(s.world.calls,6);assert.equal(s.world.retriesUsed,0);}finally{await c.stop();s.close();rmSync(dir,{recursive:true,force:true});}
});
test('five fresh v8 members retain pace and review treatment across a paused restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'coordinated-five-'));let s=new WorldStore(join(dir,'w.sqlite'));
 try{let r=new Runner(s,{}),b=new Batches(s,r);b.create('demo',null,{coordination:true,days:1,reviewHours:2,pace:'fast'});s.close();s=new WorldStore(join(dir,'w.sqlite'));r=new Runner(s,{});b=new Batches(s,r);assert.equal(b.batch.status,'paused');b.play();while(b.batch.status==='running'){await r.step();b.advance();}assert.equal(b.report().completedRuns,5);for(const id of b.batch.runIds){const w=JSON.parse(s.db.prepare('SELECT state FROM worlds WHERE id=?').get(id).state);assert.equal(w.version,'world-v8');assert.equal(w.reviewHours,2);assert.equal(w.execution.pace,'fast');assert.equal(w.maxCalls,84);assert.equal(metrics(w).coins,48);}}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
