import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { newWorld, assign, advance, observation, metrics, validateDecision, decisionSchema, WorldStore } from '../src/world.js';
import { CodexClient } from '../src/codex.js';
import { Runner } from '../src/runner.js';
import { Batches } from '../src/batches.js';
const d=(action,target='square',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:'Controlled test choice.'});
const fixture=()=>{const w=newWorld('demo',null,{life:true,days:10,socialStart:false});for(const a of w.agents){a.x=8;a.y=12;}return w;};
function act(w,a,decision){assign(w,a,decision);const es=[];for(let n=0;a.task&&n<100;n++)es.push(...advance(w));assert.equal(a.task,null);assert.equal(metrics(w).coins,48);return es.at(-1);}
function until(w,tick){while(w.tick<tick)advance(w);}
function shop(w,a,item='meal',price=1){assert.equal(act(w,a,d('open_shop','square',item,price)).kind,'shop_opened');return w.life.shops.find(s=>s.ownerId===a.id);}
function ballot(w,p='clinic',pass=true){const as=w.agents;act(w,as[0],d('propose',p));if(pass)for(const a of as.slice(1,4))act(w,a,d('vote_yes',p));return w.life.council[p];}

test('v7 is explicit, strict, and preserves old versions and their model inputs',()=>{
 const old=newWorld('demo',null,{village:true});assert.equal(old.version,'world-v6');assert.equal(old.life,undefined);assert.equal(observation(old,old.agents[0]).life,undefined);
 const w=fixture();assert.equal(w.version,'world-v7');assert.equal(w.agents[0].inventory.leisure_kit,0);assert.equal(w.plannedCalls,1440);
 assert.throws(()=>newWorld('demo',null,{life:true,scenario:'commons'}),/Renewable/);
 validateDecision(d('hobby','music'),w.version);assert.throws(()=>validateDecision(d('hobby','music'),old.version));assert.throws(()=>validateDecision({...d('order','v2','meal',1,1),automatic:true},w.version));
 assert.ok(decisionSchema(w.version).properties.action.enum.includes('deliver'));
 assert.equal(act(w,w.agents[0],d('talk','clinic')).kind,'blocked');
});

test('shops need explicit customer consent; daily deliveries move escrowed stock and pay exactly once',()=>{
 const w=fixture(),[seller,buyer]=w.agents;seller.inventory.meal=5;const s=shop(w,seller);
 act(w,seller,d('stock_shop','square','meal',0,s.id));const before=buyer.inventory.meal;
 until(w,w.tick+24);assert.equal(buyer.inventory.meal,before);assert.equal(buyer.coins,8);
 assert.equal(act(w,buyer,d('order',seller.id,'meal',1,s.id)).kind,'order_placed');const o=w.life.orders[0];assert.equal(buyer.coins,5);assert.equal(metrics(w).orderCoinsReserved,3);
 assert.equal(act(w,seller,d('deliver',buyer.id,'meal',2,o.id)).kind,'blocked');
 assert.equal(act(w,seller,d('deliver',buyer.id,'meal',1,o.id)).kind,'delivery');assert.equal(buyer.inventory.meal,before+1);assert.equal(s.stock,0);assert.equal(seller.coins,9);assert.equal(o.remaining,2);
 assert.equal(act(w,seller,d('deliver',buyer.id,'meal',1,o.id)).kind,'blocked');
 until(w,o.nextDeliveryAt);act(w,seller,d('stock_shop','square','meal',0,s.id));act(w,seller,d('deliver',buyer.id,'meal',1,o.id));assert.equal(o.remaining,1);
 act(w,buyer,d('cancel_order','square','none',0,o.id));assert.equal(buyer.coins,6);assert.equal(w.life.orders.length,0);
 assert.equal(act(w,buyer,d('cancel_order','square','none',0,o.id)).kind,'blocked');assert.equal(buyer.coins,6);
});

test('closure, expiry and racing deliveries refund or settle remaining deposits once',()=>{
 for(const expiry of [false,true]){
 const w=fixture(),[seller,buyer,other]=w.agents;const s=shop(w,seller,'meal',2);act(w,seller,d('stock_shop','square','meal',0,s.id));act(w,buyer,d('order',seller.id,'meal',2,s.id));const o=w.life.orders[0];
 assert.equal(buyer.coins,2);assert.equal(act(w,other,d('deliver',buyer.id,'meal',2,o.id)).kind,'blocked');
 if(expiry)until(w,s.expiresAt+1);else act(w,seller,d('close_shop','square','none',0,s.id));
 assert.equal(buyer.coins,8);assert.equal(seller.inventory.meal,1);assert.equal(w.life.orders.length,0);assert.equal(w.life.shops.length,0);assert.equal(metrics(w).coins,48);
 until(w,w.tick+1);assert.equal(buyer.coins,8);
 }
});

test('stock caps, unaffordable orders, one order per buyer, and private buyer books are enforced',()=>{
 const w=fixture(),[a,b,c]=w.agents;a.inventory.wood=10;const s=shop(w,a,'wood',3);for(let i=0;i<7;i++)act(w,a,d('stock_shop','square','wood',0,s.id));assert.equal(s.stock,6);assert.equal(a.inventory.wood,4);
 assert.equal(act(w,b,d('order',a.id,'wood',3,s.id)).kind,'blocked');act(w,a,d('close_shop','square','none',0,s.id));const s2=shop(w,a,'wood',1);act(w,b,d('order',a.id,'wood',1,s2.id));
 assert.equal(observation(w,a).life.myOrders.length,1);assert.equal(observation(w,b).life.myOrders.length,1);assert.equal(observation(w,c).life.myOrders.length,0);
 assert.equal(observation(w,c).life.myLife.interest,c.personal.interest);assert.ok(!JSON.stringify(observation(w,c)).includes('"preferredHour":18'));
 const nearby=observation(w,c).nearbyVillagers.find(x=>x.id===a.id);assert.equal(nearby.inventory,undefined);assert.equal(nearby.coins,undefined);assert.equal(nearby.personal,undefined);
});

test('care deliveries use real meals and energy, require consent and fed injury, and cap health',()=>{
 const w=fixture(),[a,b]=w.agents;b.health=96;b.hunger=20;a.inventory.meal=2;const s=shop(w,a,'care');act(w,b,d('order',a.id,'care',1,s.id));const o=w.life.orders[0];
 const before=a.inventory.meal;const event=act(w,a,d('deliver',b.id,'care',1,o.id));assert.equal(event.kind,'delivery');assert.equal(event.healthRestored,4);assert.equal(b.health,100);assert.equal(a.inventory.meal,before-1);assert.equal(w.life.stats.careMealsConsumed,1);
 until(w,o.nextDeliveryAt);b.hunger=70;b.health=70;assert.equal(act(w,a,d('deliver',b.id,'care',1,o.id)).kind,'blocked');assert.equal(o.remaining,2);
 b.hunger=20;act(w,a,d('deliver',b.id,'care',1,o.id));assert.equal(b.health,78);assert.equal(w.life.stats.careMealsConsumed,2);
});

test('hobbies consume kits, respect personal interests and cooldowns, and never feed villagers',()=>{
 const w=fixture(),a=w.agents[0];a.inventory.wood=2;a.satisfaction=20;a.hunger=20;
 act(w,a,d('craft_kit','square','leisure_kit'));assert.equal(a.inventory.wood,1);assert.equal(a.inventory.leisure_kit,1);
 const hunger=a.hunger;assert.equal(act(w,a,d('hobby','music')).kind,'hobby');assert.equal(a.inventory.leisure_kit,0);assert.ok(a.satisfaction>39);assert.ok(a.hunger>hunger);assert.equal(w.life.stats.kitsUsed,1);
 assert.equal(act(w,a,d('hobby','music')).kind,'blocked');until(w,a.personal.lastLeisureAt+48);assert.equal(act(w,a,d('hobby','walking')).kind,'hobby');assert.equal(a.personal.leisureCount,2);
});

test('invitations need a scheduled window, voluntary acceptance and a physically present host; declines persist',()=>{
 const w=fixture(),[host,guest,decliner]=w.agents;act(w,host,d('invite','games'));const i=w.life.invitations[0];
 assert.equal(act(w,guest,d('accept_invite',host.id,'none',0,i.id)).kind,'blocked');
 assert.equal(act(w,decliner,d('decline_invite',host.id,'none',0,i.id)).kind,'invitation_declined');
 until(w,i.startsAt);assert.equal(act(w,decliner,d('accept_invite',host.id,'none',0,i.id)).kind,'blocked');
 host.x=0;host.y=0;assert.equal(act(w,guest,d('accept_invite',host.id,'none',0,i.id)).kind,'blocked');host.x=8;host.y=12;
 assert.equal(act(w,guest,d('accept_invite',host.id,'none',0,i.id)).kind,'shared_activity');assert.equal(w.life.invitations.length,0);assert.equal(host.personal.leisureCount,1);assert.equal(guest.personal.leisureCount,1);
});

test('failed public ballots refund pledges; approved services need funding, materials, work and maintenance',()=>{
 const w=fixture(),[a,b,c]=w.agents;let p=ballot(w,'clinic',false);act(w,a,d('fund','clinic','none',3));assert.equal(a.coins,5);until(w,p.deadline);assert.equal(a.coins,8);assert.equal(p.balance,0);assert.equal(p.status,'unproposed');
 p=ballot(w);act(w,a,d('fund','clinic','none',4));act(w,b,d('fund','clinic','none',2));until(w,p.deadline);assert.equal(p.status,'approved');
 assert.equal(act(w,c,d('civic_work','clinic')).kind,'blocked');c.inventory.wood=8;for(let i=0;i<4;i++)act(w,c,d('civic_supply','clinic','wood'));
 const coins=c.coins;for(let i=0;i<4;i++)act(w,c,d('civic_work','clinic'));assert.equal(p.status,'complete');assert.equal(c.coins,coins+4);assert.equal(p.balance,2);
 assert.equal(act(w,c,d('maintain','clinic','wood')).kind,'blocked');until(w,p.serviceUntil);assert.equal(observation(w,a).life.availableNow.clinicActive,false);
 assert.equal(act(w,c,d('maintain','clinic','wood')).kind,'maintenance');assert.equal(p.balance,1);assert.equal(c.inventory.wood,3);assert.equal(metrics(w).coins,48);
 a.hunger=20;a.health=50;a.inventory.meal=2;assert.equal(act(w,a,d('recover','shelter','meal')).kind,'recovery');assert.equal(a.health,56);assert.equal(a.inventory.meal,1);assert.equal(act(w,a,d('recover','shelter','meal')).kind,'blocked');
});

test('new v7 world, open orders, reserved stock and council balances survive paused restart exactly',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-life-save-'));let store;
 try{store=new WorldStore(join(dir,'w.sqlite'));store.world=fixture();const w=store.world,[a,b]=w.agents;const s=shop(w,a);act(w,a,d('stock_shop','square','meal',0,s.id));act(w,b,d('order',a.id,'meal',1,s.id));ballot(w);act(w,a,d('fund','clinic','none',2));store.save([],true);const before=structuredClone(w);store.close();store=new WorldStore(join(dir,'w.sqlite'));
 assert.deepEqual(store.world.life,before.life);assert.deepEqual(store.world.agents,before.agents);assert.equal(store.world.running,false);assert.equal(metrics(store.world).coins,48);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('v7 schema and private current facts pass through the real Codex adapter fake transport',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-life-wire-'));const c=new CodexClient({dataDir:dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url))});
 try{const w=fixture(),input=observation(w,w.agents[0]);const result=await c.decide(input,'test-model',{worldVersion:w.version,decisionInputVersion:w.decisionInputVersion});assert.equal(result.decision.action,'wait');const wire=JSON.parse(readFileSync(join(dir,'codex','test-protocol.json'),'utf8'));assert.deepEqual(wire.turn.outputSchema,decisionSchema(w.version));assert.deepEqual(JSON.parse(wire.turn.input[0].text),input);assert.equal(wire.thread.ephemeral,true);assert.equal(wire.thread.approvalPolicy,'never');}finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});

test('five serial v7 scripted villages retain settings and completed results without model calls',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-life-five-'));const s=new WorldStore(join(dir,'w.sqlite'));
 try{const runner=new Runner(s,{}),b=new Batches(s,runner);b.create('demo',null,{life:true,days:1,socialStart:false});b.play();while(b.batch.status==='running'){await runner.step();b.advance();}const r=b.report();assert.equal(r.completedRuns,5);assert.equal(new Set(r.runs.map(r=>r.id)).size,5);assert.ok(r.runs.every(r=>r.worldVersion==='world-v7'&&r.calls===0&&r.metrics.coins===48));}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('malformed but schema-valid v7 choices and competing consumers never create resources or crash',()=>{
 const w=fixture(),schema=decisionSchema(w.version);let seed=9571;
 const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let step=0;step<1000;step++){
   const a=w.agents[random(6)],action=schema.properties.action.enum[random(schema.properties.action.enum.length)],target=schema.properties.target.enum[random(schema.properties.target.enum.length)],item=schema.properties.item.enum[random(schema.properties.item.enum.length)];
   assign(w,a,d(action,target,item,random(13),random(12)));advance(w);
   assert.equal(metrics(w).coins,48);
   for(const b of w.agents){assert.ok(Number.isInteger(b.coins)&&b.coins>=0);assert.ok(Object.values(b.inventory).every(n=>Number.isInteger(n)&&n>=0));assert.ok(Number.isFinite(b.health)&&b.health>=1&&b.health<=100);}
 }
});

test('the final standing delivery settles once and exhausted public budgets cannot mint wages',()=>{
 const w=fixture(),[seller,buyer,worker]=w.agents;seller.inventory.meal=4;const s=shop(w,seller);
 for(let i=0;i<3;i++)act(w,seller,d('stock_shop','square','meal',0,s.id));act(w,buyer,d('order',seller.id,'meal',1,s.id));const o=w.life.orders[0];
 for(let i=0;i<3;i++){if(i)until(w,o.nextDeliveryAt);assert.equal(act(w,seller,d('deliver',buyer.id,'meal',1,o.id)).kind,'delivery');}
 assert.equal(w.life.orders.length,0);assert.equal(seller.coins,11);assert.equal(buyer.coins,5);assert.equal(act(w,seller,d('deliver',buyer.id,'meal',1,o.id)).kind,'blocked');
 const p=ballot(w,'garden');act(w,worker,d('fund','garden','none',1));until(w,p.deadline);worker.inventory.wood=4;
 for(let i=0;i<4;i++)act(w,worker,d('civic_supply','garden','wood'));const before=worker.coins;
 act(w,worker,d('civic_work','garden'));assert.equal(worker.coins,before+1);assert.equal(p.balance,0);assert.equal(act(w,worker,d('civic_work','garden')).kind,'blocked');assert.equal(worker.coins,before+1);
});
