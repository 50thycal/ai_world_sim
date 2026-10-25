import {stopPlan} from './community.js';
import {hasAdaptive} from './treatments.js';
export const ADAPTIVE_ACTIONS=['attend_plan'];
const choice=(action,target='none',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:''});
// An explicitly conditional forecast, not a survival policy or private view into neighbors.
export function foodForecast(w,a) {
 const f=w.living.food,queue=(f.lots['bag:'+a.id]||[]).map(l=>({...l,expiresAt:l.bornAt+(l.preserved?f.preservedTicks:f.shelfTicks)})).sort((a,b)=>a.expiresAt-b.expiresAt||a.id-b.id);
 let nextAt=w.tick+Math.max(0,(40-a.hunger)/5.4)*12,atRisk=0,usable=0;
 for(const l of queue)for(let i=0;i<l.quantity;i++){
  if(l.expiresAt<=nextAt)atRisk++;else{usable++;nextAt+=40/5.4*12;}
 }
 return {carriedMeals:a.inventory.meal,estimatedUsableMeals:usable,estimatedMealsExpiringBeforeUse:atRisk,
   nextEligibleEatHours:Math.round(Math.max(0,(40-a.hunger)/5.4)*10)/10,
   preservationWood:1,preservationMaximumMeals:3,
   assumption:'Estimate if you eat carried meals when hunger first reaches40, with no new food, sales, gifts or travel delays. It is not an instruction to eat or preserve.',
   tradeoff:'Preservation consumes the same wood needed for cooking, housing and shared activities. Fresh meals you can eat before expiry do not need preservation; raw ingredients never spoil.'};
}
export function adaptiveObservation(w,a,o) {
 if(!hasAdaptive(w))return o;
 const forecast=foodForecast(w,a);o.currentFacts.foodForecast=forecast;
 o.planning.choiceGroups.survival=o.planning.choiceGroups.survival.filter(x=>x.choice.action!=='preserve_meals'||forecast.estimatedMealsExpiringBeforeUse>0);
 for(const x of Object.values(o.planning.choiceGroups).flat())if(x.choice.action==='cook')x.effect+=' A shared stove credit can be claimed by another resident in this same review. One carried wood is a fuel fallback; a reservation shown on your current task is already yours.';
 for(const e of w.planning.sharedEvents.entries)if(e.rsvpId===a.id&&!a.workPlan)o.planning.choiceGroups.sharedEvents.unshift({choice:choice('attend_plan',e.hostId,'none',e.price,e.id),effect:`Authorize travel, waiting and one attendance attempt for event #${e.id}, at most12 steps/12h. Pay ${e.price} only after both participate. Meals/rest can pause the plan; no automatic food or other purchases.`});
 o.actions.attendance='attend_plan hostId, item none, exact ticket price/eventId: requires your willing RSVP. Explicitly authorizes bounded travel/wait/join and exact ticket on success; max12 steps/12h within event expiry. No automatic eating, resumption or other spending. cancel_plan ends it; withdraw_rsvp also releases your RSVP.';
 o.actions.preservation+=' In this treatment the optional example appears only when the own-food forecast estimates expiry before use. The action remains available even without an example; there is no automatic preservation or production.';
 return o;
}

export function adaptiveProblem(w,a,d) {
 if(!ADAPTIVE_ACTIONS.includes(d.action))return null;
 const e=w.planning.sharedEvents.entries.find(e=>e.id===d.offerId);
 return e&&e.rsvpId===a.id&&e.hostId===d.target&&d.item==='none'&&d.price===e.price?null:'attend_plan needs your RSVP and the exact other host, item none, ticket price and event id';
}
export function adaptiveAction(w,a,t) {
 const e=w.planning.sharedEvents.entries.find(e=>e.id===t.offerId);
 if(!e||e.rsvpId!==a.id||e.hostId!==t.customerId||e.price!==t.price)return {failed:true,text:'could not begin attendance: event or RSVP changed.'};
 a.workPlan={kind:'attend_plan',eventId:e.id,hostId:e.hostId,ticket:e.price,item:'none',startedAt:w.tick,expiresAt:Math.min(e.expiresAt,w.tick+144),steps:0,maxSteps:12};
 w.community.stats.plansStarted++;w.adaptive.stats.attendancePlansStarted++;
 return {kind:'plan_started',text:`authorized bounded travel, waiting and attendance for event #${e.id}; exact ticket only after successful participation.`,extra:{eventId:e.id,price:e.price}};
}
export function adaptivePlanStep(w,a) {
 const p=a.workPlan;if(p?.kind!=='attend_plan')return null;
 const e=w.planning.sharedEvents.entries.find(e=>e.id===p.eventId);
 if(!e||e.rsvpId!==a.id||p.steps>=p.maxSteps){stopPlan(w,a,a.lastAttendedEvent?.eventId===p.eventId?'completed':!e?'event_ended':p.steps>=p.maxSteps?'step_limit':'rsvp_ended');return {choice:null};}
 if(a.x!==8||a.y!==12)return {choice:choice('wait','square'),work:1};
 if(e.status!=='prepared')return {choice:choice('wait','square'),work:Math.min(12,p.expiresAt-w.tick)};
 if(w.tick<e.startsAt)return {choice:choice('wait','square'),work:e.startsAt-w.tick};
 return {choice:choice('join_event',p.hostId,'none',p.ticket,p.eventId)};
}
export function adaptiveResult(w,a,t,kind) {
 if(kind==='event_held'&&t.action==='join_event'){
  a.lastAttendedEvent={eventId:t.offerId,tick:w.tick};
  if(a.workPlan?.kind==='attend_plan')w.adaptive.stats.attendancePlansCompleted++;
 }
}
