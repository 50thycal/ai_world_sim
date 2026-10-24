import { LIVING_VERSION, hasLiving, AGENCY_VERSION, PLANNING_VERSION, EVENT_VERSION, hasAgency } from './treatments.js';
// Fresh v9 rules only: consented plans, coin-backed jobs and differentiated wellbeing.
export const COMMUNITY_VERSION = 'world-v9';
export const COMMUNITY_INPUT = 'community-facts-v1';
export const hasCommunity = w => [COMMUNITY_VERSION,AGENCY_VERSION,PLANNING_VERSION,EVENT_VERSION,LIVING_VERSION].includes(w.version) && w.community?.version === 1;
export const COMMUNITY_ACTIONS = ['meal_plan','shop_plan','restock_shop','cancel_plan','post_order','claim_job','complete_job','cancel_job','reserve_upkeep'];
const GOODS = ['raw','wood','meal','tool','leisure_kit'];
const orderGoods = w => hasAgency(w) ? [...GOODS,'bed','furnishing'] : GOODS;
const person = (w,id) => w.agents.find(a=>a.id===id);
const choice = (action,target='square',item='none',price=0,offerId=0) => ({action,target,item,price,offerId,message:'',reason:''});
const fail = text => ({failed:true,text:`could not complete community action: ${text}`});
export function addCommunity(w) {
  w.community = {version:1,nextId:1,jobs:[],stats:{plansStarted:0,plansCompleted:0,plansStopped:0,planSteps:0,batchRestocked:0,jobsPosted:0,jobsClaimed:0,jobsFilled:0,jobsExpired:0,jobWages:0,goodsDelivered:0,preparedEvents:0,sharedExperiences:0,clinicActiveTicks:0,gardenActiveTicks:0}};
  w.life.council.garden.benefit='Hobbies and accepted invitations give five extra enjoyment before repetition/cap.';
  for(const a of w.agents) { a.workPlan=null; a.wellbeing={comfort:40,connection:35,enjoyment:45,recent:[],sharedWith:{}}; syncWellbeing(a); }
}
function syncWellbeing(a) { const b=a.wellbeing; a.satisfaction=(b.comfort+b.connection+b.enjoyment)/3; }
export function activityPreview(w,a,kind,{connection=0,enjoyment=0}={}) {
  const b=a.wellbeing, repeats=b.recent.filter(e=>w.tick-e.tick<288 && e.kind===kind).length, novelty=1/(1+repeats);
  const nextConnection=Math.min(100,b.connection+connection*novelty),nextEnjoyment=Math.min(100,b.enjoyment+enjoyment*novelty);
  return {repeats,nextConnection,nextEnjoyment,connectionGain:nextConnection-b.connection,enjoymentGain:nextEnjoyment-b.enjoyment};
}
export function activity(w,a,kind,{connection=0,enjoyment=0,partner=null}={}) {
  if(!hasCommunity(w))return;
  const b=a.wellbeing;b.recent=b.recent.filter(e=>w.tick-e.tick<288);
  const preview=activityPreview(w,a,kind,{connection,enjoyment});
  b.connection=preview.nextConnection;b.enjoyment=preview.nextEnjoyment;
  b.recent=[...b.recent,{kind,tick:w.tick}].slice(-24);
  if(partner)b.sharedWith[partner]=(b.sharedWith[partner]||0)+1;
  syncWellbeing(a);
}
export function communityTick(w,a) {
  const b=a.wellbeing,target=20+(a.home.bed?25:0)+(a.home.furnishing?30:0);
  b.comfort+=(target-b.comfort)*0.002;b.connection=Math.max(0,b.connection-0.025);b.enjoyment=Math.max(0,b.enjoyment-0.04);syncWellbeing(a);
}
export function communityProblem(w,a,d) {
  if(!COMMUNITY_ACTIONS.includes(d.action))return null;
  if(d.action==='meal_plan')return d.target==='hearth'&&d.item==='meal'&&d.price===0&&d.offerId===0?null:'meal_plan: hearth, meal, price/offerId 0';
  if(['shop_plan','restock_shop'].includes(d.action))return d.target==='square'&&GOODS.includes(d.item)&&d.price===0&&d.offerId>0?null:'shop_plan/restock_shop: square, exact shop good/id, price 0';
  if(d.action==='cancel_plan')return d.target==='none'&&d.item==='none'&&d.price===0&&d.offerId===0?null:'cancel_plan: none, none, price/offerId 0';
  if(d.action==='post_order')return d.target==='square'&&orderGoods(w).includes(d.item)&&d.price>=1&&d.offerId===0?null:'post_order: square, raw/wood/meal/tool/leisure_kit, unit price 1–12, offerId 0';
  if(d.action==='reserve_upkeep')return ['clinic','garden'].includes(d.target)&&d.item==='wood'&&d.price===0&&d.offerId===0?null:'reserve_upkeep: clinic/garden, wood, price/offerId 0';
  if(d.price!==0||d.offerId<1)return 'job actions use price 0 and exact job id';
  if(['claim_job','cancel_job'].includes(d.action)&&!(d.target==='square'&&d.item==='none'))return 'claim_job/cancel_job: square, none, price 0, job id';
  if(d.action==='complete_job'&&!(orderGoods(w).includes(d.item)&&[...w.agents.map(b=>b.id),'clinic','garden'].includes(d.target)))return 'complete_job: exact buyer/service, good, price 0, job id';
  return null;
}
export function communitySite(w,d) { return d.action==='meal_plan'?'hearth':d.action==='complete_job'?(d.target==='clinic'?'shelter':d.target==='garden'?'square':d.target):'square'; }
const ownShop = (w,a,t) => w.life.shops.find(s=>s.id===t.offerId&&s.ownerId===a.id&&s.item===t.item);
const reserve = item => item==='meal'?2:1;
function closeJob(w,j,refund=true) {
  if(refund) { if(j.projectId)w.life.council[j.projectId].balance+=j.escrow;else person(w,j.buyerId).coins+=j.escrow; }
  w.community.jobs=w.community.jobs.filter(x=>x.id!==j.id);
}
export function expireCommunity(w,emit) {
  if(!hasCommunity(w))return;
  for(const j of [...w.community.jobs]) {
    if(w.tick>=j.expiresAt){closeJob(w,j);w.community.stats.jobsExpired++;emit(person(w,j.buyerId||j.workerId),`Job #${j.id} expired; unused wages returned.`, 'job_expired',{jobId:j.id});}
    else if(j.workerId&&w.tick>=j.claimUntil){const worker=person(w,j.workerId);j.workerId=null;j.claimUntil=null;emit(worker,`Reservation on job #${j.id} ended; the job is available again.`, 'job_released',{jobId:j.id});}
  }
}
export function completeCommunityAction(w,a,t) {
  const c=w.community;
  if(t.action==='cancel_plan') { stopPlan(w,a,'cancelled');return{kind:'plan_stopped',text:'cancelled the current production plan.',extra:hasAgency(w)?{refund:a.lastWorkPlan?.refund||null}:{}}; }
  if(['meal_plan','shop_plan'].includes(t.action)) {
    if(t.action==='shop_plan'&&!ownShop(w,a,t))return fail('exact own shop is no longer open.');
    a.workPlan={kind:t.action,item:t.item,shopId:t.offerId,startedAt:w.tick,expiresAt:w.tick+144,steps:0,maxSteps:8};c.stats.plansStarted++;
    return{kind:'plan_started',text:`started a voluntary ${t.action==='meal_plan'?'three-meal household':'three-unit shop stock'} plan, limited to eight steps or twelve hours.`};
  }
  if(t.action==='restock_shop') {
    const s=ownShop(w,a,t);if(!s)return fail('exact own shop is closed.');
    const n=Math.min(3,6-s.stock,Math.max(0,a.inventory[s.item]-reserve(s.item)));if(n<1)return fail('no surplus above personal reserve, or shop is full.');
    a.inventory[s.item]-=n;s.stock+=n;c.stats.batchRestocked+=n;return{kind:'shop_restocked',text:`stocked ${n} ${s.item}, keeping ${reserve(s.item)} for personal use.`,extra:{shopId:s.id,item:s.item,quantity:n}};
  }
  if(t.action==='post_order') {
    if(c.jobs.some(j=>j.buyerId===a.id))return fail('one open purchase order per resident.');
    const quantity=hasAgency(w)&&['bed','furnishing'].includes(t.item)?1:2;
    const escrow=quantity*t.price;if(a.coins<escrow)return fail(hasAgency(w)?`${quantity} unit prices must be reserved up front.`:'two unit prices must be reserved up front.');
    a.coins-=escrow;const j={id:c.nextId++,buyerId:a.id,buyer:a.name,projectId:null,item:t.item,quantity,price:t.price,escrow,workerId:null,claimUntil:null,expiresAt:w.tick+288};
    c.jobs.push(j);c.stats.jobsPosted++;if(hasAgency(w)&&quantity===1)w.agency.stats.homeOrdersPosted++;return{kind:'job_posted',text:`posted job #${j.id}: ${hasAgency(w)?quantity:'two'} ${j.item} for ${escrow} reserved coins.`,extra:{jobId:j.id,item:j.item,quantity,coins:escrow}};
  }
  if(t.action==='reserve_upkeep') {
    const p=w.life.council[t.customerId];
    if(!p||p.status!=='complete'||p.balance<1||p.serviceUntil>w.tick+288||c.jobs.some(j=>j.projectId===p.id||j.workerId===a.id))return fail('needs completed service, one public coin, upkeep within 24h and no existing reservation.');
    p.balance--;const j={id:c.nextId++,buyerId:null,buyer:p.name,projectId:p.id,item:'wood',quantity:1,price:1,escrow:1,workerId:a.id,claimUntil:w.tick+288,expiresAt:w.tick+288};c.jobs.push(j);c.stats.jobsPosted++;c.stats.jobsClaimed++;
    return{kind:'job_claimed',text:`reserved ${p.name} upkeep for one public coin, payable only after actual maintenance.`,extra:{jobId:j.id,projectId:p.id}};
  }
  const j=c.jobs.find(j=>j.id===t.offerId);if(!j)return fail('job is no longer open.');
  if(t.action==='claim_job') {
    if(j.workerId||j.buyerId===a.id||j.projectId||c.jobs.some(x=>x.workerId===a.id))return fail('job already reserved, your own order, or you already hold a reservation.');
    j.workerId=a.id;j.claimUntil=w.tick+144;c.stats.jobsClaimed++;return{kind:'job_claimed',text:`reserved job #${j.id} for twelve hours. Payment requires delivery.`,extra:{jobId:j.id}};
  }
  if(t.action==='cancel_job') {
    if(j.buyerId===a.id){closeJob(w,j);return{kind:'job_cancelled',text:`cancelled job #${j.id}; unused coins returned.`};}
    if(j.workerId!==a.id)return fail('only buyer or reserved worker may cancel.');
    if(j.projectId)closeJob(w,j);else{j.workerId=null;j.claimUntil=null;}
    return{kind:'job_released',text:`released job #${j.id}; no wages paid.`};
  }
  if(j.workerId!==a.id||t.customerId!==(j.projectId||j.buyerId)||t.item!==j.item||a.inventory[j.item]<j.quantity)return fail('needs your exact reserved job and all promised goods.');
  if(j.projectId) {
    const p=w.life.council[j.projectId];if(p.status!=='complete'||p.serviceUntil>w.tick+24||a.energy<5)return fail('upkeep is not due within two hours or energy is too low.');
    a.inventory.wood--;a.energy-=4;p.serviceUntil=w.tick+288;w.life.stats.maintenance++;w.life.stats.civicWood++;w.life.stats.civicWages++;
  } else {a.inventory[j.item]-=j.quantity;person(w,j.buyerId).inventory[j.item]+=j.quantity;c.stats.goodsDelivered+=j.quantity;}
  a.coins+=j.escrow;a.economicStats.earned+=j.escrow;
  if(j.buyerId){person(w,j.buyerId).economicStats.spent+=j.escrow;w.economy.stats.coinsTraded+=j.escrow;}
  c.stats.jobsFilled++;c.stats.jobWages+=j.escrow;const paid=j.escrow;closeJob(w,j,false);
  return{kind:'job_filled',text:`completed job #${j.id} for ${paid} reserved coins.`,extra:{jobId:j.id,targetId:j.buyerId,projectId:j.projectId,item:j.item,quantity:j.quantity,coins:paid}};
}
export function stopPlan(w,a,status) { if(!a.workPlan)return; const p=a.workPlan;
  if(hasAgency(w)&&p.kind==='upkeep_plan') {
    const j=w.community.jobs.find(j=>j.id===p.jobId&&j.workerId===a.id);
    if(j){p.refund={jobId:j.id,projectId:j.projectId,coins:j.escrow};closeJob(w,j);w.agency.stats.upkeepReservationsReleased++;}
  }
  a.workPlan=null;w.community.stats[status==='completed'?'plansCompleted':'plansStopped']++;a.lastWorkPlan={...p,endedAt:w.tick,status}; }
// The initiating model choice authorizes only these finite physical steps. No eating or buying.
export function nextPlanStep(w,a,{fuel,toolWood}) {
  const p=a.workPlan;if(!p)return null;
  if(w.tick>=p.expiresAt||a.energy<10||a.hunger>=80){stopPlan(w,a,'interrupted');return null;}
  const s=p.kind==='shop_plan'?w.life.shops.find(s=>s.id===p.shopId&&s.ownerId===a.id&&s.item===p.item):null;
  if(p.kind==='shop_plan'&&!s){stopPlan(w,a,'shop_closed');return null;}
  if(p.kind==='meal_plan'&&a.inventory.meal>=3||s&&s.stock>=3){stopPlan(w,a,'completed');return null;}
  if(p.steps>=p.maxSteps){stopPlan(w,a,'step_limit');return null;}
  if(s&&a.inventory[p.item]>reserve(p.item))return choice('restock_shop','square',p.item,0,s.id);
  const item=p.item;
  if(item==='meal') {
    if(!a.inventory.raw)return choice('gather','orchard');
    if(a.inventory.wood<fuel)return choice('gather','forest');
    return choice('cook','hearth');
  }
  if(item==='raw'||item==='wood')return choice('gather',item==='raw'?'orchard':'forest');
  if(a.inventory.wood<(item==='tool'?toolWood:1))return choice('gather','forest');
  return choice(item==='tool'?'craft':'craft_kit','square',item);
}
export function communityObservation(w,a,o) {
  const cf=o.currentFacts;
  cf.wellbeing=structuredClone(a.wellbeing);
  cf.foodRunway={carriedCookedMeals:a.inventory.meal,cookedCoverageHours:Math.round(a.inventory.meal*40/5.4*10)/10,hoursUntilStarvationDamage:Math.max(0,Math.round((95-a.hunger)/5.4*10)/10),estimate:'At current hunger, no future meals. Travel and work still take time; eating is voluntary and needs hunger 40. Raw food costs health.'};
  cf.foodRunway.cookingInputsReady=a.inventory.raw>=1&&a.inventory.wood>=cf.cookingRecipe.woodNow&&a.energy>=5;
  cf.foodRunway.minimumCookTravelAndWorkMinutes=5*(Math.abs(a.x-8)+Math.abs(a.y-8)+(a.skills.cook>=w.economy.rules.practiceThreshold?2:3));
  const opportunities=o.coordination.opportunities;
  if(cf.foodRunway.cookingInputsReady)opportunities.unshift({choice:choice('cook','hearth'),effect:`Cook ${cf.cookingRecipe.meals} safe meals using one raw and ${cf.cookingRecipe.woodNow} wood now; travel/work still take time.`});
  if(a.inventory.meal<3&&!a.workPlan)opportunities.unshift({choice:choice('meal_plan','hearth','meal'),effect:'Gather inputs and cook until carrying at least three safe meals; at most eight steps/twelve hours; stops at hunger 80, low energy or failure. No auto-eating.'});
  for(const s of w.life.shops.filter(s=>s.ownerId===a.id&&GOODS.includes(s.item))) {
    if(a.inventory[s.item]>reserve(s.item)&&s.stock<6)opportunities.unshift({choice:choice('restock_shop','square',s.item,0,s.id),effect:`Stock up to three surplus goods; keep ${reserve(s.item)} for yourself.`});
    if(s.stock<3&&!a.workPlan)opportunities.push({choice:choice('shop_plan','square',s.item,0,s.id),effect:'Produce and stock to a target of three. Same finite physical plan limits; personal reserves protected when stocking.'});
  }
  const jobs=structuredClone(w.community.jobs);
  for(const j of jobs) {
    if(!j.workerId&&j.buyerId!==a.id)opportunities.push({choice:choice('claim_job','square','none',0,j.id),effect:`Reserve the job before gathering/delivering ${j.quantity} ${j.item}; ${j.escrow} coins already escrowed.`});
    if(j.workerId===a.id&&a.inventory[j.item]>=j.quantity&&(!j.projectId||w.life.council[j.projectId].serviceUntil<=w.tick+24))opportunities.push({choice:choice('complete_job',j.projectId||j.buyerId,j.item,0,j.id),effect:`Deliver all ${j.quantity} ${j.item} and earn ${j.escrow} coins; upkeep also needs energy.`});
  }
  if(a.coins>=2&&!jobs.some(j=>j.buyerId===a.id)) {
    const item=a.inventory.wood<2?'wood':a.inventory.raw<2?'raw':a.inventory.leisure_kit<1?'leisure_kit':null;
    if(item)opportunities.push({choice:choice('post_order','square',item,1),effect:`Reserve two coins to purchase two ${item}. Another resident may claim and deliver; expiry refunds unused coins.`});
  }
  const services=Object.values(w.life.council).map(p=>({id:p.id,status:p.status,publicCoins:p.balance,constructionWagesRemaining:p.status==='complete'?0:Math.ceil((p.workNeeded-p.work)/2),operatingReserveTarget:3,operatingReserveHeld:w.community.jobs.filter(j=>j.projectId===p.id).reduce((n,j)=>n+j.escrow,0),activeHours:Math.max(0,(p.serviceUntil-w.tick)/12)}));
  for(const p of services) {
    if(['voting','approved','complete'].includes(p.status)&&p.publicCoins+p.operatingReserveHeld<p.constructionWagesRemaining+3&&a.coins)opportunities.push({choice:choice('fund',p.id,'none',Math.min(2,a.coins)),effect:`Voluntary funding: ${p.constructionWagesRemaining} construction wage coins plus a three-coin operating reserve target; no taxes or minted wages.`});
    if(p.status==='complete'&&p.publicCoins>0&&!jobs.some(j=>j.projectId===p.id||j.workerId===a.id))opportunities.push({choice:choice('reserve_upkeep',p.id,'wood'),effect:'Reserve one public coin for your next upkeep job; supply one wood and work when due within two hours.'});
  }
  if(a.inventory.leisure_kit&&!w.life.invitations.some(i=>i.hostId===a.id))opportunities.push({choice:choice('invite',a.personal.interest),effect:'Reserve one leisure kit for a shared event at the green. Host must remain there; unused kit returns on expiry.'});
  if(a.workPlan)opportunities.unshift({choice:choice('continue','none'),effect:'Continue the bounded plan. Any other choice replaces it; cancel_plan explicitly stops it.'});
  o.community={myPlan:structuredClone(a.workPlan),lastPlan:structuredClone(a.lastWorkPlan||null),jobs,services};
  // Replace obsolete v8 wellbeing claims; all other v8 physical rules remain in force.
  o.rules=o.rules.replace('Finished work waits for review.','Ordinary finished work waits for review; an explicitly chosen bounded plan may start its next physical step.').replace('Satisfaction is optional quality of life, not health/trust.','Satisfaction is the mean of private comfort, connection and enjoyment, not health or trust.').replace('furnishing halves satisfaction decay.','beds and furnishings improve the comfort target (20 base, +25 bed, +30 furnishing).');
  o.actions.social='socialize square: +3 energy; connection +6 with neighbors/+1 alone and enjoyment +3. Each repeat of the same activity within 24h divides gains by 1+previous repeats. host_meal reserves one meal, enjoyment +4; attend consumes it, -40 hunger, enjoyment +8 and connection +8. Shared experiences are witnessed counts, never trust.';
  o.actions.leisure='hobby music/games/walking uses six work ticks, four-hour cooldown; preferred +12 enjoyment/other +8, preferred hour +5, garden +5, consumed kit +8, +3 energy. Repetition divides wellbeing gains. craft_kit uses one wood and four energy. invite reserves one kit, starts +1h at green for three hours; accept_invite host/id requires both present and leisure-ready, consumes reserved kit and gives both hobby benefits plus connection8/enjoyment8. Expiry returns kit once; decline leaves it reserved. Connection decays 0.3/hour, enjoyment0.48/hour; comfort moves toward home target. Health remains separate.';
  o.actions.community='meal_plan hearth meal 0/0 aims for three carried meals; shop_plan square exact shop item/id price0 aims for three stocked. Each authorizes at most eight physical gather/cook/craft/restock steps or twelve hours; stops at hunger80, energy<10, failed step, closed shop. continue preserves it; any other choice interrupts. restock_shop square exact item/id price0 transfers up to3 surplus, keeps2 meals/1 other, cap6. cancel_plan none none 0/0. post_order square good unitPrice1–12 id0 reserves TWO unit prices for two goods, expires24h; one per buyer. claim_job square none price0 jobId reserves12h, one per worker. complete_job exact buyer id/good price0 jobId delivers all goods before payment. cancel_job square none price0 jobId: buyer refunds/removes, worker releases. reserve_upkeep clinic/garden wood 0/0 reserves one public coin and job24h; complete_job service wood price0 jobId consumes one wood/four energy when due within2h, restores24h. Expiry refunds once. No automatic buying/eating, no minted coins.';
  return o;
}
