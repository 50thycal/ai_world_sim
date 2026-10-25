import { hasLiving } from './treatments.js';
import { stopPlan, activityPreview } from './community.js';
import { hobbyBase } from './agency.js';

export const LIVING_ACTIONS=['preserve_meals','rsvp_event','withdraw_rsvp','event_plan'];
const choice=(action,target='none',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:''});
const fail=text=>({failed:true,text:'could not complete living-village action: '+text});
export function addLiving(w,{visitor,competitive}) {
  w.living={version:1,condition:visitor?(competitive?'visitor_competitive':'visitor'):(competitive?'competitive':'control'),
    visitor:{enabled:visitor,arrivalTick:864,arrived:false,actorId:'v7',endowment:{raw:2,wood:1,meal:1,coins:0}},
    competitive,stoveCredits:0,food:{lots:{},owners:{},nextId:1,shelfTicks:864,preservedTicks:1728},
    stats:{visitorArrivals:0,mealsSpoiled:0,mealsPreserved:0,rsvpsMade:0,rsvpsWithdrawn:0,kitchenReservations:0,kitchenRefunds:0},scores:{}};
  // Stable identity and policy, separate from the six original contestants.
  for(const a of w.agents)w.living.scores[a.id]={ticks:0,health:0,comfort:0,connection:0,enjoyment:0};
  w.plannedCalls+=visitor?Math.max(0,w.days-3)*24/(w.reviewHours||1):0;w.maxCalls=w.plannedCalls+12;
  syncMeals(w);
}
export function prepareVisitor(w) {
  if(!hasLiving(w)||!w.living.visitor.enabled||w.living.visitor.arrived||w.tick<w.living.visitor.arrivalTick)return [];
  // Clone a fully initialized resident's shape, then reset every private/history/economic field.
  const a=structuredClone(w.agents[0]);
  Object.assign(a,{id:'v7',name:'Rowan',x:8,y:12,color:'#d6b779',hunger:25,energy:85,health:100,task:null,coins:0,profession:'craftsperson',
    inventory:Object.fromEntries(Object.keys(a.inventory).map(k=>[k,0])),home:{bed:false,furnishing:false},toolUses:0,
    lastReason:'',lastMessage:'',lastMessageTick:null,memories:[],persona:null,plans:[],relationships:{},
    stats:Object.fromEntries(Object.keys(a.stats).map(k=>[k,0])),skills:Object.fromEntries(Object.keys(a.skills).map(k=>[k,0])),
    economicStats:Object.fromEntries(Object.keys(a.economicStats).map(k=>[k,0])),personal:{interest:'games',preferredHour:19,lastLeisureAt:null,lastCareAt:null,leisureCount:0},
    wellbeing:{comfort:40,connection:35,enjoyment:45,recent:[],sharedWith:{}},satisfaction:40,workPlan:null,lastWorkPlan:null,goal:null,lastGoal:null,
    actionFeedback:null,lastAttempt:null,eventsHosted:0});
  delete a.lastAttendedEvent;
  delete a.pendingPlanStop;delete a.pendingPlanPause;delete a.pendingPlanResume;
  Object.assign(a.inventory,{raw:2,wood:1,meal:1});w.agents.push(a);w.living.visitor.arrived=true;w.living.stats.visitorArrivals++;syncMeals(w);
  const e={kind:'visitor_arrived',tick:w.tick,actor:a.name,actorId:a.id,x:a.x,y:a.y,endowment:structuredClone(w.living.visitor.endowment),text:'Rowan arrived for the remainder of the run with two raw food, one wood, one meal and zero coins. Rowan is independently model-controlled and may work, trade or socialize.'};
  for(const b of w.agents){b.memories.push({tick:w.tick,text:e.text});b.memories=b.memories.slice(-24);}
  return [e];
}
// Every physical meal location participates. Age follows transfers, refunds and shop/event escrow.
function locations(w) {
  const m=new Map(),add=(key,obj,field,owner=null,remove=null)=>m.set(key,{count:()=>obj[field],set:n=>{obj[field]=n;if(!n&&remove)remove();},owner});
  for(const a of w.agents)add('bag:'+a.id,a.inventory,'meal',a.id);
  add('pantry',w,'pantry');
  for(const s of w.life.shops)if(s.item==='meal')add('shop:'+s.id,s,'stock',s.ownerId);
  for(const e of w.planning.sharedEvents.entries)if(e.item==='meal')add('event:'+e.id,e,'reserved',e.hostId);
  for(const o of [...w.economy.offers])if(o.item==='meal'){
    const holder={count:1};add('offer:'+o.id,holder,'count',o.sellerId,()=>{w.economy.offers=w.economy.offers.filter(x=>x.id!==o.id);});
  }
  for(const g of [...w.village.gatherings]){
    const holder={count:1};add('gathering:'+g.id,holder,'count',g.hostId,()=>{w.village.gatherings=w.village.gatherings.filter(x=>x.id!==g.id);});
  }
  for(const r of w.village.requests)if(r.escrow.meal)add('request:'+r.id,r.escrow,'meal',r.ownerId);
  return m;
}
const expiry=(food,l)=>l.bornAt+(l.preserved?food.preservedTicks:food.shelfTicks);
const count=lots=>lots.reduce((n,l)=>n+l.quantity,0);
function take(lots,n) {
  const out=[];while(n>0&&lots.length){const l=lots[0],q=Math.min(n,l.quantity);out.push({...l,quantity:q});l.quantity-=q;n-=q;if(!l.quantity)lots.shift();}return out;
}
export function syncMeals(w) {
  if(!hasLiving(w))return;
  const food=w.living.food,loc=locations(w),moving=[],needs=[];
  for(const key of new Set([...Object.keys(food.lots),...loc.keys()])){
    const lots=food.lots[key]||[],n=loc.get(key)?.count()||0,difference=n-count(lots);
    if(difference<0)moving.push(...take(lots,-difference).map(l=>({...l,sourceOwner:food.owners[key]??loc.get(key)?.owner??null})));
    if(difference>0)needs.push([key,difference]);
    if(loc.has(key))food.lots[key]=lots;else delete food.lots[key];
  }
  moving.sort((a,b)=>expiry(food,a)-expiry(food,b)||a.id-b.id);
  // Several shops/events can refund on the same tick. Return each owner's original lots
  // before settling cross-owner transfers, so simultaneous refunds cannot swap food ages.
  const allocations=new Map(needs.map(([key])=>[key,[]]));
  for(const [key,n] of needs){const owner=loc.get(key).owner;if(!owner)continue;let remaining=n;
    for(const l of moving)if(remaining&&l.quantity&&l.sourceOwner===owner){const q=Math.min(remaining,l.quantity);allocations.get(key).push({...l,quantity:q});l.quantity-=q;remaining-=q;}
  }
  const rest=moving.filter(l=>l.quantity);
  for(const [key,n] of needs){const moved=allocations.get(key);moved.push(...take(rest,n-count(moved)));const remaining=n-count(moved);
    food.lots[key].push(...moved.map(({sourceOwner,...l})=>l));if(remaining)food.lots[key].push({id:food.nextId++,bornAt:w.tick,quantity:remaining,preserved:false});food.lots[key].sort((a,b)=>expiry(food,a)-expiry(food,b)||a.id-b.id);
  }
  food.owners=Object.fromEntries([...loc].map(([key,l])=>[key,l.owner]));
  // Residual decreases are actual consumption, never reassigned to future production.
}
export function expireMeals(w,emit) {
  if(!hasLiving(w))return;
  const food=w.living.food,loc=locations(w);
  for(const [key,lots] of Object.entries(food.lots)){
    const expired=lots.filter(l=>w.tick-l.bornAt>=(l.preserved?food.preservedTicks:food.shelfTicks)),n=count(expired);if(!n)continue;
    const entry=loc.get(key);if(!entry)continue;
    food.lots[key]=lots.filter(l=>!expired.includes(l));entry.set(entry.count()-n);w.living.stats.mealsSpoiled+=n;
    const actor=w.agents.find(a=>a.id===entry.owner)||w.agents[0];
    emit(actor,`${n} cooked meal${n===1?'':'s'} expired in ${key.startsWith('bag:')?'personal stores':key.split(':')[0]}; ingredients do not spoil.`, 'food_spoiled',{quantity:n,location:key,...(key.startsWith('bag:')?{privateTo:entry.owner}:{})});
  }
  for(const e of w.planning.sharedEvents.entries)if(e.status==='prepared'&&e.reserved<e.quantity)e.expiresAt=w.tick;
}
export function reserveKitchen(w,a,t) {
  if(!hasLiving(w)||!a.inventory.raw||a.energy<5)return;
  const cost=w.living.stoveCredits>0?0:1;if(cost&&!a.inventory.wood)return;
  if(cost)a.inventory.wood--;else w.living.stoveCredits--;
  t.kitchen={cost};w.living.stats.kitchenReservations++;
}
export function refundKitchen(w,a,t) {
  if(!hasLiving(w)||!t?.kitchen)return;
  if(t.kitchen.cost)a.inventory.wood+=t.kitchen.cost;else w.living.stoveCredits++;
  delete t.kitchen;w.living.stats.kitchenRefunds++;
}
export function settleKitchen(w,a,t) {
  const cost=t.kitchen.cost;
  if(!cost)w.village.stats.fuelSaved++;
  else if(w.village.projects.stove.completedAt!==null)w.living.stoveCredits++;
  delete t.kitchen;
}
export function livingProblem(w,a,d) {
  if(d.target==='v7'&&!w.agents.some(b=>b.id==='v7'))return 'the visitor has not arrived';
  if(!LIVING_ACTIONS.includes(d.action))return null;
  if(d.price!==0)return 'living-village actions use price 0';
  if(d.action==='preserve_meals')return d.target==='hearth'&&d.item==='meal'&&d.offerId===0?null:'preserve_meals hearth/meal/price0/id0';
  if(d.offerId<1||d.item!=='none')return 'copy event id; item none, price0';
  if(d.action==='event_plan')return d.target==='square'?null:'event_plan square/none/price0/eventId';
  return w.agents.some(b=>b.id===d.target&&b!==a)?null:'RSVP uses the other host id';
}
export function livingAction(w,a,t) {
  if(t.action==='preserve_meals'){
    const lots=w.living.food.lots['bag:'+a.id],eligible=lots.filter(l=>!l.preserved);if(!eligible.length||!a.inventory.wood||a.energy<5)return fail('needs unpreserved carried meals, one wood and energy.');
    let remaining=3,n=0;for(const l of [...lots])if(!l.preserved&&remaining){const q=Math.min(remaining,l.quantity);l.quantity-=q;remaining-=q;n+=q;lots.push({...l,quantity:q,preserved:true});}
    w.living.food.lots['bag:'+a.id]=lots.filter(l=>l.quantity);a.inventory.wood--;a.energy-=4;w.living.stats.mealsPreserved+=n;
    return {kind:'meals_preserved',text:`preserved ${n} meals using one wood; lifetime is six days from original cooking, not from preservation.`,extra:{quantity:n,woodSpent:1}};
  }
  const e=w.planning.sharedEvents.entries.find(e=>e.id===t.offerId);if(!e)return fail('event is no longer open.');
  if(t.action==='event_plan'){
    if(e.hostId!==a.id||!e.rsvpId)return fail('your event needs a willing RSVP first.');
    a.workPlan={kind:'event_plan',eventId:e.id,item:e.item,startedAt:w.tick,expiresAt:Math.min(e.expiresAt,w.tick+144),maxSteps:12,steps:0,hostedAtStart:a.eventsHosted};w.community.stats.plansStarted++;
    return {kind:'plan_started',text:'started a voluntary gather/craft/cook/prepare/wait event plan: twelve steps/twelve hours, no automatic purchasing or eating.'};
  }
  if(e.hostId!==t.customerId||e.hostId===a.id)return fail('copy the other host id.');
  if(t.action==='withdraw_rsvp'){
    if(e.rsvpId!==a.id)return fail('no RSVP to withdraw.');e.rsvpId=null;w.living.stats.rsvpsWithdrawn++;
    return {kind:'rsvp_withdrawn',text:'withdrew the event RSVP. No attendance or payment was forced.',extra:{eventId:e.id}};
  }
  if(e.rsvpId&&e.rsvpId!==a.id)return fail('another guest already reserved this event.');
  if(e.rsvpId===a.id)return fail('you already RSVP’d.');
  if(a.coins<e.price)return fail('current wallet cannot cover the advertised ticket; no coins reserved.');
  e.rsvpId=a.id;w.living.stats.rsvpsMade++;
  return {kind:'event_rsvp',text:`RSVP’d to ${e.host}'s ${e.interest}; still must attend and pay only on success.`,extra:{eventId:e.id,targetId:e.hostId}};
}
export function eventPlanStep(w,a) {
  const p=a.workPlan;if(p?.kind!=='event_plan')return null;
  const e=w.planning.sharedEvents.entries.find(e=>e.id===p.eventId);
  if(!e||p.steps>=p.maxSteps){stopPlan(w,a,a.eventsHosted>p.hostedAtStart?'completed':!e?'event_ended':'step_limit');return {choice:null};}
  if(!e.rsvpId)return {choice:choice('wait','square'),work:Math.min(12,p.expiresAt-w.tick)};
  if(e.status==='prepared')return {choice:choice('wait','square'),work:Math.max(1,e.expiresAt-w.tick)};
  if(a.inventory[e.item]>=e.quantity)return {choice:choice('prepare_event','square',e.item,0,e.id)};
  if(e.item==='meal'&&!a.inventory.raw)return {choice:choice('gather','orchard')};
  if(!a.inventory.wood)return {choice:choice('gather','forest')};
  return {choice:e.item==='meal'?choice('cook','hearth'):choice('craft_kit','square','leisure_kit')};
}
export function recordScores(w) {
  for(const a of w.agents.filter(a=>a.id!=='v7')){const s=w.living.scores[a.id];s.ticks++;for(const k of ['health','comfort','connection','enjoyment'])s[k]+=k==='health'?a.health:a.wellbeing[k];}
}
export function score(w,a) {
  const s=w.living.scores[a.id];if(!s)return null;
  const ticks=s.ticks||1,averages=Object.fromEntries(['health','comfort','connection','enjoyment'].map(k=>[k,s.ticks?s[k]/ticks:(k==='health'?a.health:a.wellbeing[k])]));
  const owned=a.coins+w.community.jobs.filter(j=>j.buyerId===a.id).reduce((n,j)=>n+j.escrow,0)+w.village.requests.filter(r=>r.ownerId===a.id).reduce((n,r)=>n+r.price,0)+w.life.orders.filter(o=>o.buyerId===a.id).reduce((n,o)=>n+o.price*o.remaining,0)+Object.values(w.life.council).filter(p=>p.status==='voting').reduce((n,p)=>n+(p.contributions[a.id]||0),0);
  const parts={health:averages.health*.3,comfort:averages.comfort*.2,connection:averages.connection*.2,enjoyment:averages.enjoyment*.1,wealth:Math.min(16,owned)/16*20};
  return {actorId:a.id,name:a.name,total:Math.round(Object.values(parts).reduce((n,x)=>n+x,0)*100)/100,parts,averages,ownCoinsIncludingRefundableEscrow:owned,provisional:w.tick<w.maxTicks};
}
export function livingMetrics(w) {
  const residents=w.agents.filter(a=>a.id!=='v7');
  return {...Object.fromEntries(['health','comfort','connection','enjoyment'].map(k=>['residentAverage'+k[0].toUpperCase()+k.slice(1),Math.round(residents.reduce((n,a)=>n+(k==='health'?a.health:a.wellbeing[k]),0)/residents.length)])),...w.living.stats,visitorPresent:Number(w.living.visitor.arrived),competitiveMode:Number(w.living.competitive),reservedCookingWood:w.agents.reduce((n,a)=>n+(a.task?.kitchen?.cost||0),0)};
}
export function livingObservation(w,a,o) {
  const l=w.living,groups=o.planning.choiceGroups;
  groups.sharedEvents=groups.sharedEvents.filter(x=>x.choice.action==='prepare_event'?w.planning.sharedEvents.entries.find(e=>e.id===x.choice.offerId)?.rsvpId:x.choice.action==='join_event'?w.planning.sharedEvents.entries.find(e=>e.id===x.choice.offerId)?.rsvpId===a.id:true);
  groups.exchange=groups.exchange.filter(x=>x.choice.action!=='order'||!w.life.orders.some(o=>o.buyerId===a.id));
  o.rules=o.rules.replace('six residents','residents');o.actions.council=o.actions.council.replace('Four distinct yes votes','Four distinct yes votes (including an arrived visitor)');
  o.experiment={condition:l.condition,visitorEnabled:l.visitor.enabled,visitorArrivalDay:4,visitorPresent:l.visitor.arrived,visitorRules:'Rowan arrives at the green on day four, stays through the end, brings two raw, one wood, one meal and zero coins, and chooses independently. Total coins remain48; no guaranteed purchases, jobs or friendship.'};
  if(!l.visitor.enabled)delete o.experiment.visitorRules;
  o.currentFacts.cookingRecipe={...o.currentFacts.cookingRecipe,availableStoveCredits:l.stoveCredits,reservation:a.task?.kitchen||null,guidance:'At task assignment reserve one available stove credit or one carried wood. A reservation survives travel and returns once if interrupted/blocked. Same-hour residents can compete for unreserved credits; carrying one wood guarantees fuel.'};
  const advertisedFreshness=key=>{const lots=l.food.lots[key]||[];return lots.length?Math.min(...lots.map(x=>expiry(l.food,x))):null;};
  for(const offer of o.economy.offers)if(offer.item==='meal')offer.mealExpiresAt=advertisedFreshness('offer:'+offer.id);
  for(const shop of o.life.shops)if(shop.item==='meal')shop.nextMealExpiry=advertisedFreshness('shop:'+shop.id);
  for(const event of o.sharedEvents.entries)if(event.item==='meal'&&event.reserved)event.nextMealExpiry=advertisedFreshness('event:'+event.id);
  o.currentFacts.foodFreshness=(l.food.lots['bag:'+a.id]||[]).map(x=>({quantity:x.quantity,preserved:x.preserved,expiresAt:x.bornAt+(x.preserved?l.food.preservedTicks:l.food.shelfTicks)}));
  o.actions.preservation='preserve_meals hearth,item meal,price0,id0 uses one wood/four energy to preserve up to three carried unpreserved meals. Cooked meals expire after3 days; preserved after6 days from original production. Transfers/refunds never reset age. Raw ingredients do not spoil.';
  if(a.inventory.wood&&a.energy>=5&&(l.food.lots['bag:'+a.id]||[]).some(x=>!x.preserved))groups.survival.push({choice:choice('preserve_meals','hearth','meal'),effect:'Spend one wood to extend up to three meals to six days from cooking. Preserve only what you expect to need; ingredients do not spoil.'});
  if(a.workPlan?.suspended){o.currentFacts.pendingCommitment={kind:a.workPlan.kind,expiresAt:a.workPlan.expiresAt,reason:a.workPlan.pauseReason,decisions:[choice('resume_plan'),choice('cancel_plan')],guidance:'Your plan is paused. Resume explicitly after needs are met, or cancel; unrelated work replaces it. Deadline never extends.'};}
  // Expose actual supplier convenience without claiming mandatory demand or automatic renewal.
  for(const shop of w.life.shops.filter(s=>!w.life.orders.some(o=>o.buyerId===a.id)&&s.ownerId!==a.id&&s.item==='meal'&&s.stock&&s.price*3<=a.coins))groups.exchange.push({choice:choice('order',shop.ownerId,'meal',shop.price,shop.id),effect:`Authorize up to three meal deliveries, one per day, at ${shop.price} each; reserve ${shop.price*3} existing coins. Merchant must physically deliver. Compare travel/cooking time and freshness; cancel refunds unused deposit.`});
  const coverage=a.inventory.meal*40/5.4;
  o.planning.recurringNeeds={mealCoverageHours:Math.round(coverage),cookOutput:o.currentFacts.cookingRecipe.meals,foodGuidance:'Meals have finite lifetime. Compare personal meal coverage and expiry with selling, sharing, preserving or doing other work. A cook makes four meals/raw versus two for others; paying a supplier may save travel/work, but no trade is compulsory.'};
  const e=w.planning.sharedEvents.entries.find(e=>e.hostId===a.id);
  if(e?.rsvpId&&!a.workPlan)groups.sharedEvents.unshift({choice:choice('event_plan','square','none',0,e.id),effect:'Your event has a willing RSVP. Authorize bounded ordinary gathering/production/preparation and waiting at the green; no automatic spending or attendance.'});
  for(const event of w.planning.sharedEvents.entries.filter(e=>e.hostId!==a.id)){
    if(!event.rsvpId&&a.coins>=event.price)groups.sharedEvents.unshift({choice:choice('rsvp_event',event.hostId,'none',0,event.id),effect:`Declare willingness to join ${event.host}; a claim, not forced attendance or payment. Host obtains real supplies after an RSVP.`});
    if(event.rsvpId===a.id)groups.sharedEvents.push({choice:choice('withdraw_rsvp',event.hostId,'none',0,event.id),effect:'Withdraw your RSVP. No ticket charged.'});
  }
  o.sharedEvents.guidance+=' Hosts advertise a provisional start six hours after announcement; preparation schedules no earlier than that, and at least one hour after preparation. RSVP is public willingness, never payment or a private readiness disclosure.';
  const gain=activityPreview(w,a,'event_'+a.personal.interest,{connection:12,enjoyment:hobbyBase(w,a,a.personal.interest)-(a.inventory.leisure_kit?8:0)+8});
  o.sharedEvents.myPotentialGain={connection:gain.connectionGain,enjoyment:gain.enjoymentGain,estimate:'Own preferred shared hobby now, before travel/decay; attendance and actual timing change this.'};
  o.actions.sharedEvents+=' In v13 prepare_event and join_event require the willing guest RSVP. rsvp_event/withdraw_rsvp hostId,item none,price0,eventId; event_plan square,none,price0,eventId authorizes at most12 steps/12h of production, preparation and waiting, with unchanged plan pause/expiry rules. RSVP reserves no coins or forced movement.';
  o.objective=l.competitive&&a.id!=='v7'?{mode:'competitive',instruction:'Compete to finish with the highest individual score among the six original residents. Choose your own strategy; cooperation, trade and competition are all available. Points never create coins or goods.',formula:'100 maximum:30 time-average health +20 time-average comfort +20 time-average connection +10 time-average enjoyment (each percentage of100);20 final owned/refundable coins capped at16. Counters, raw hoards and repeated trades earn no direct points. No other private scores/wallets are disclosed.',myScore:score(w,a)}:{mode:'unscored',instruction:a.id==='v7'?'You are Rowan, a visitor among established residents. Choose how to live, work, trade and interact; no purchases, allegiance or role are compulsory.':'Choose your own priorities for living in this village. There is no contest or leaderboard objective.'};
  return o;
}
