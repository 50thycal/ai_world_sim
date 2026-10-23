import { hasAgency } from './treatments.js';
import { activityPreview, completeCommunityAction, stopPlan } from './community.js';

export const AGENCY_ACTIONS = ['upkeep_plan'];
const choice = (action, target = 'square', item = 'none', price = 0, offerId = 0) =>
  ({ action, target, item, price, offerId, message: '', reason: '' });
const round = n => Math.round(n * 100) / 100;
const siteFor = id => id === 'clinic' ? 'shelter' : 'square';
const sitePosition = id => id === 'clinic' ? {x:4,y:12} : {x:8,y:12};
export function addAgency(w) {
  w.agency = { version: 1, stats: { upkeepPlansStarted: 0, upkeepPlansCompleted: 0, upkeepReservationsReleased: 0, homeOrdersPosted: 0, blockedHobbyChoices: 0 } };
}
export function agencyProblem(w, a, d) {
  if (d.action !== 'upkeep_plan') return null;
  return ['clinic','garden'].includes(d.target) && d.item === 'wood' && d.price === 0 && d.offerId === 0
    ? null : 'upkeep_plan: clinic/garden, item wood, price 0, offerId 0';
}
export function completeAgencyAction(w, a, t) {
  const result = completeCommunityAction(w,a,{...t,action:'reserve_upkeep'});
  if (result.failed) return result;
  const job = w.community.jobs.find(j=>j.workerId===a.id && j.projectId===t.customerId);
  a.workPlan = {kind:'upkeep_plan',item:'wood',projectId:job.projectId,jobId:job.id,
    startedAt:w.tick,expiresAt:job.expiresAt,expectedServiceUntil:w.life.council[job.projectId].serviceUntil,steps:0,maxSteps:8};
  w.community.stats.plansStarted++; w.agency.stats.upkeepPlansStarted++;
  return {kind:'plan_started',text:`reserved ${job.buyer} upkeep and started a bounded wood, travel and maintenance plan. Payment requires actual work.`,extra:{jobId:job.id,projectId:job.projectId}};
}
export function agencyPlanInterruption(w,a) {
  const p=a.workPlan;
  if(p?.kind!=='upkeep_plan'||p.finished)return null;
  const job=w.community.jobs.find(j=>j.id===p.jobId&&j.workerId===a.id);
  if(!job)return 'reservation_ended';
  const service=w.life.council[p.projectId];
  return service.status!=='complete'||service.serviceUntil>p.expectedServiceUntil?'service_renewed':null;
}
export function nextAgencyStep(w,a) {
  const p=a.workPlan;
  if(p.finished) { stopPlan(w,a,'completed'); return null; }
  const job=w.community.jobs.find(j=>j.id===p.jobId && j.workerId===a.id);
  if(!job) { stopPlan(w,a,'reservation_ended'); return null; }
  const service=w.life.council[p.projectId];
  if(service.status!=='complete' || service.serviceUntil>p.expectedServiceUntil || service.serviceUntil-24>=job.expiresAt) {
    stopPlan(w,a,'service_renewed'); return null;
  }
  if(p.steps>=p.maxSteps) { stopPlan(w,a,'step_limit'); return null; }
  if(!a.inventory.wood) return {choice:choice('gather','forest')};
  const site=sitePosition(p.projectId);
  // Travel first; calculate the wait only after arriving so movement cannot overshoot the deadline.
  if(a.x!==site.x || a.y!==site.y) return {choice:choice('wait',siteFor(p.projectId)),work:1};
  if(service.serviceUntil>w.tick+24) return {choice:choice('wait',siteFor(p.projectId)),work:service.serviceUntil-24-w.tick};
  return {choice:choice('complete_job',p.projectId,'wood',0,job.id)};
}
export function agencyStepResult(w,a,t,failed) {
  if(!failed && t.planStep && t.action==='complete_job' && a.workPlan?.kind==='upkeep_plan') {
    a.workPlan.finished=true; w.agency.stats.upkeepPlansCompleted++;
  }
}
// The same preview function supplies the engine's leisure base and the model's estimate.
export function hobbyBase(w,a,interest) {
  return (a.personal.interest===interest?12:8) + (Math.floor(w.tick/12)%24===a.personal.preferredHour?5:0)
    + (w.life.council.garden.status==='complete' && w.life.council.garden.serviceUntil>w.tick?5:0)
    + (a.inventory.leisure_kit?8:0);
}
export function feedback(w,a,t,{failed,kind,text}) {
  if(!hasAgency(w))return;
  const action=t.action==='invalid'?t.attempted:t.action;
  a.actionFeedback={tick:w.tick,action,target:t.action==='invalid'?(a.lastAttempt?.target||'none'):t.customerId||t.target||'none',item:t.item,
    success:!failed,outcome:kind,text,internalPlanStep:Boolean(t.planStep)};
  if(failed && action==='hobby') {
    w.agency.stats.blockedHobbyChoices++;
    a.actionFeedback.correction=choice('hobby',['music','games','walking'].includes(a.lastAttempt?.target)?a.lastAttempt.target:a.personal.interest);
    a.actionFeedback.guidance='Use item none, price 0, offerId 0. A carried leisure kit is consumed automatically; never put leisure_kit in the hobby item field. A correction fixes the fields, not timing/location eligibility.';
  }
}
function preview(w,a,kind,gains) {
  const p=activityPreview(w,a,kind,gains);
  return {connection:round(p.connectionGain),enjoyment:round(p.enjoymentGain),repetitions:p.repeats,
    estimate:'If performed now, before travel/work decay; actual completion time, other residents and shared resources may change the result.'};
}
export function agencyObservation(w,a,o) {
  const cf=o.currentFacts, ready=cf.lifeAvailableNow.leisureReady;
  const greenVisible=Math.abs(a.x-8)+Math.abs(a.y-12)<=2;
  const nearby=greenVisible?w.agents.filter(b=>b.id!==a.id && Math.abs(b.x-8)+Math.abs(b.y-12)<=2):[];
  const social=preview(w,a,'socialize',{connection:nearby.length?6:1,enjoyment:3});
  if(!greenVisible){social.connectionRange=[social.connection,preview(w,a,'socialize',{connection:6}).connection];social.connection=null;social.attendance='Unknown at the remote green; no remote attendance is revealed.';}
  const hobbies=['music','games','walking'].map(interest=>({interest,choice:choice('hobby',interest),ready,
    kitWillBeConsumed:Boolean(a.inventory.leisure_kit),energyGain:Math.min(3,100-a.energy),
    ...preview(w,a,interest,{enjoyment:hobbyBase(w,a,interest)})}));
  cf.lastActionResult=structuredClone(a.actionFeedback||null);
  cf.activityChoices={socialize:{choice:choice('socialize'),...social,energyGain:Math.min(3,100-a.energy),comfortGain:0,healthGain:0},hobbies,
    kitRule:'For every hobby use item none, price 0 and offerId 0. A carried kit is consumed automatically.',
    guidance:'Compare the estimated gains. Repeating socializing does not improve comfort, create trust, or substitute for a different hobby. These are optional choices, not required scores.'};
  const needs=[];
  if(a.inventory.meal<3)needs.push({item:'meal',quantity:2,exampleUnitPrice:1,benefit:'Two prepared meals replace gathering and cooking; each can reduce hunger 40 once hunger reaches 40.'});
  if(a.inventory.wood<2)needs.push({item:'wood',quantity:2,exampleUnitPrice:1,benefit:'Fuel, tools, home goods or upkeep without spending your own time gathering.'});
  if(!a.home.bed && !a.inventory.bed)needs.push({item:'bed',quantity:1,exampleUnitPrice:3,benefit:'Install once at shelter: comfort target +25 and rest restores seven instead of five energy per tick.'});
  if(!a.home.furnishing && !a.inventory.furnishing)needs.push({item:'furnishing',quantity:1,exampleUnitPrice:2,benefit:'Install once at shelter: comfort target +30. Does not replace food or improve health.'});
  if(!a.inventory.leisure_kit)needs.push({item:'leisure_kit',quantity:2,exampleUnitPrice:2,benefit:'Each kit adds eight base hobby enjoyment before repetition/cap, or prepares one shared invitation.'});
  if(!a.inventory.tool && !a.toolUses)needs.push({item:'tool',quantity:2,exampleUnitPrice:2,benefit:'Each tool lasts six successful harvests and adds one harvest capacity; scarce actual stock is still required.'});
  const held=w.community.jobs.find(j=>j.workerId===a.id);
  const opportunities=o.coordination.opportunities.filter(x=>!['post_order','reserve_upkeep'].includes(x.choice.action)
    && !(x.choice.action==='claim_job' && held));
  for(const h of hobbies)if(ready)opportunities.push({choice:h.choice,effect:`${h.interest}: estimated +${h.enjoyment} enjoyment now; ${h.kitWillBeConsumed?'automatically consumes one carried kit':'no kit needed'}. Item is none. Four-hour cooldown.`});
  if(!a.inventory.leisure_kit && a.inventory.wood && a.energy>=5)
    opportunities.push({choice:choice('craft_kit','square','leisure_kit'),effect:'Spend one wood/four energy to prepare a kit for a hobby or invitation.'});
  const hasOrder=w.community.jobs.some(j=>j.buyerId===a.id);
  for(const n of needs) {
    n.affordableExample=a.coins>=n.quantity*n.exampleUnitPrice;
    n.carried=a.inventory[n.item];
    n.selfCraftWood=n.item==='bed'?o.village.recipes.bedWood:n.item==='furnishing'?o.village.recipes.furnishingWood:n.item==='leisure_kit'?1:n.item==='tool'?cf.capabilities.craftToolWoodCost:null;
    if(!hasOrder && n.affordableExample)opportunities.push({choice:choice('post_order','square',n.item,n.exampleUnitPrice),effect:`Voluntarily reserve ${n.quantity*n.exampleUnitPrice} coins for ${n.quantity} ${n.item}. ${n.benefit} Example price only; choose 1–12. Nobody automatically buys or accepts work.`});
  }
  for(const item of ['bed','furnishing'])if(a.inventory[item] && !a.home[item])
    opportunities.push({choice:choice('furnish','shelter',item),effect:`Install your carried ${item}; no additional wood or payment required.`});
  if(held && !held.projectId && a.inventory[held.item]<held.quantity) {
    let c;
    const item=held.item;
    if(['raw','wood'].includes(item))c=choice('gather',item==='raw'?'orchard':'forest');
    else if(item==='meal')c=!a.inventory.raw?choice('gather','orchard'):a.inventory.wood<cf.cookingRecipe.woodNow?choice('gather','forest'):choice('cook','hearth');
    else {
      const cost=item==='tool'?cf.capabilities.craftToolWoodCost:item==='leisure_kit'?1:o.village.recipes[item+'Wood'];
      c=a.inventory.wood<cost?choice('gather','forest'):choice(item==='tool'?'craft':item==='leisure_kit'?'craft_kit':'craft_'+item,'square',item);
    }
    opportunities.push({choice:c,effect:`Prepare the missing ${held.item} for your reserved job #${held.id}. Payment of ${held.escrow} coins still requires delivery of all ${held.quantity} goods. Your other needs remain voluntary priorities.`});
  }
  // Home purchase orders are public intentions. Other residents' private needs are never inferred.
  const jobs=w.community.jobs.filter(j=>!j.projectId).map(j=>({...structuredClone(j),reservedPay:j.escrow,
    guidance:'Deliver exactly the posted quantity after claiming. Private buyer inventories and wallets are unknown.'}));
  const services=Object.values(w.life.council).map(p=>({id:p.id,name:p.name,status:p.status,publicCoins:p.balance,
    activeHours:Math.max(0,(p.serviceUntil-w.tick)/12),maintenanceDueInHours:Math.max(0,(p.serviceUntil-24-w.tick)/12),
    reservedWorker:w.community.jobs.find(j=>j.projectId===p.id)?.workerId||null,benefit:p.benefit}));
  for(const p of services)if(p.status==='complete' && p.publicCoins>=1 && p.maintenanceDueInHours<=22 && !p.reservedWorker && !held)
    opportunities.push({choice:choice('upkeep_plan',p.id,'wood'),effect:`Reserve one public coin for ${p.name}. Gather one wood if needed, travel, wait until due, maintain and earn the coin; max eight steps/24h, stops on low energy/hunger or failed work. Current benefit: ${p.benefit}`});
  o.coordination.opportunities=[...new Map(opportunities.map(x=>[JSON.stringify(x.choice),x])).values()];
  o.agency={myNeeds:needs,myReservedJob:structuredClone(held||null),publicPurchaseOrders:jobs,services};
  o.actions.leisure='hobby: target music/games/walking, item none, price 0, offerId 0, message/reason strings. NEVER use item leisure_kit for hobby: a carried kit is consumed automatically. Six work ticks, four-hour cooldown. See currentFacts.activityChoices for current gains. craft_kit: square, item leisure_kit, price/offerId 0, costs one wood/four energy. invite: hobby target, item none, price/offerId 0, reserves one kit; starts +1h at green, lasts3h. accept_invite/decline_invite: host id, item none, price0, exact invitation id. Both present and leisure-ready for acceptance. Unused reserved kit returns once on expiry.';
  o.actions.community=o.actions.community.replace('reserves TWO unit prices for two goods','reserves one unit price for one bed/furnishing, TWO unit prices for two other goods');
  o.actions.agency='upkeep_plan: clinic/garden, item wood, price0, offerId0. One explicit choice reserves one existing public coin and a bounded gather/travel/wait/complete job sequence, max8 steps/24h. continue preserves it; any other choice replaces it and refunds unspent upkeep wages to the public budget. A renewal by someone else cancels/refunds this plan. No buying/eating or model calls occur inside plans. post_order also supports bed/furnishing, quantity ONE each; all other goods remain quantity TWO. Everyone can earn existing coins by filling explicit orders. Monetary examples are voluntary prices, not automatic purchases or forced roles.';
  return o;
}
