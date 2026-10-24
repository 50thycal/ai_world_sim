import { hasPlanning, hasEvents } from './treatments.js';

export const PLANNING_ACTIONS=['set_goal','clear_goal','resume_plan'];
export const GOAL_TARGETS=['home_bed','home_furnishing'];
const GOALS=['stove','orchard_upgrade','workshop','clinic','garden',...GOAL_TARGETS];
export const planChoice=(action,target='none',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:''});
export function addPlanning(w) {
  w.planning={version:1,stats:{goalsSet:0,goalsObservedComplete:0,goalsExpired:0,plansPaused:0,plansResumed:0,shortagesRecovered:0,shortageWaits:0},sharedEvents:null};
  for(const a of w.agents){a.goal=null;a.lastGoal=null;}
}
export function planningProblem(w,a,d) {
  if(!PLANNING_ACTIONS.includes(d.action))return null;
  if(d.item!=='none'||d.price!==0||d.offerId!==0)return 'goal/resume choices use item none, price 0, offerId 0';
  if(d.action==='set_goal' && ![...GOALS,...(hasEvents(w)?['shared_event']:[])].includes(d.target))return 'set_goal needs a listed home, public-project or service target';
  if(d.action!=='set_goal'&&d.target!=='none')return 'clear_goal/resume_plan use target none';
  return null;
}
export function goalProgress(w,a,goal=a.goal) {
  if(!goal)return null;
  const target=goal.target;
  if(target.startsWith('home_')){const item=target.slice(5);return {complete:Boolean(a.home[item]),installed:Boolean(a.home[item]),carried:a.inventory[item]};}
  if(target==='shared_event')return {complete:(a.eventsHosted||0)>goal.hostedAtStart,hostedSinceStart:(a.eventsHosted||0)-goal.hostedAtStart};
  const p=w.village.projects[target];
  if(p)return {complete:p.completedAt!==null,wood:p.wood,woodNeeded:p.woodNeeded,work:p.work,workNeeded:p.workNeeded};
  const service=w.life.council[target];
  return {complete:service.status==='complete'&&service.serviceUntil>w.tick,status:service.status,activeHours:Math.max(0,(service.serviceUntil-w.tick)/12)};
}
export function completePlanningAction(w,a,t) {
  if(t.action==='resume_plan') {
    if(!a.workPlan?.suspended)return {failed:true,text:'could not resume: no suspended plan remains.'};
    if(a.hunger>=80||a.energy<10)return {failed:true,text:'could not resume: hunger/energy still exceeds the plan safety limits.'};
    a.workPlan.suspended=false;delete a.workPlan.pauseReason;w.planning.stats.plansResumed++;
    return {kind:'plan_resumed',text:'resumed the saved physical plan within its original deadline.'};
  }
  if(t.action==='clear_goal'){a.lastGoal=a.goal?{...a.goal,status:'cleared',endedAt:w.tick}:a.lastGoal;a.goal=null;return {kind:'goal_cleared',text:'cleared a private longer-term goal.',extra:{privateTo:a.id}};}
  const candidate={target:t.customerId,startedAt:w.tick,expiresAt:w.tick+288,hostedAtStart:a.eventsHosted||0};
  if(goalProgress(w,a,candidate).complete)return {failed:true,text:'could not set goal: this goal is already met.',extra:{privateTo:a.id}};
  a.goal=candidate;w.planning.stats.goalsSet++;
  return {kind:'goal_set',text:`chose a private 24-hour goal: ${t.customerId}. Meals and rest do not erase this goal.`,extra:{privateTo:a.id}};
}
export function updateGoals(w,emit) {
  if(!hasPlanning(w))return;
  for(const a of w.agents)if(a.goal) {
    const progress=goalProgress(w,a);
    const complete=progress.complete,expired=w.tick>=a.goal.expiresAt;
    if(!complete&&!expired)continue;
    a.lastGoal={...a.goal,status:complete?'observed_complete':'expired',endedAt:w.tick};a.goal=null;
    w.planning.stats[complete?'goalsObservedComplete':'goalsExpired']++;
    emit(a,complete?'observed the chosen goal fulfilled; this does not establish who contributed.':'let the private goal expire after 24 hours.',complete?'goal_completed':'goal_expired',{privateTo:a.id});
  }
}
export function pausePlan(w,a,reason) {
  if(!a.workPlan||a.workPlan.suspended)return;
  a.workPlan.suspended=true;a.workPlan.pauseReason=reason;
  if(a.task?.planStep)a.task=null;
  w.planning.stats.plansPaused++;a.pendingPlanPause=true;
}
export function retainPlanForChoice(w,a,d) {
  if(!hasPlanning(w)||!a.workPlan)return false;
  if(['set_goal','clear_goal','resume_plan','continue'].includes(d.action))return true;
  if(['eat','rest','recover','post_order'].includes(d.action)){pausePlan(w,a,'personal needs or explicit supply order');return true;}
  return false;
}
export function renewalWait(w,site) {
  const key=site==='orchard'?'food':'wood',rate=w.scenario.regrow[key];
  return rate>0?Math.max(1,Math.ceil((1-(w.regrowth[key]||0))*12/rate)):null;
}
export function recoverShortage(w,a,t) {
  if(!hasPlanning(w)||!t.planStep||t.action!=='gather'||!a.workPlan||a.energy<5)return false;
  const key=t.target==='orchard'?'food':'wood';
  if(w.resources[key]!==0)return false;
  const wait=renewalWait(w,t.target),p=a.workPlan;
  if(!wait||(p.shortages||0)>=3||p.steps>=p.maxSteps||w.tick+wait+4>=p.expiresAt)return false;
  p.shortages=(p.shortages||0)+1;p.retryAt=w.tick+wait;p.retrySite=t.target;w.planning.stats.shortagesRecovered++;
  return true;
}
export function planningWait(w,a) {
  const p=a.workPlan;
  if(p?.retryAt>w.tick){w.planning.stats.shortageWaits++;return {choice:planChoice('wait'),work:p.retryAt-w.tick};}
  if(p?.retryAt){delete p.retryAt;delete p.retrySite;}
  return null;
}
function projectChoices(w,a,o) {
  const choices=[],projects=[];
  for(const p of Object.values(w.village.projects)) {
    const remainingWood=Math.max(0,p.woodNeeded-p.wood),remainingWork=Math.max(0,p.workNeeded-p.work);
    projects.push({id:p.id,complete:p.completedAt!==null,remainingWood,remainingWork,benefit:p.benefit,
      horizonDaysRemaining:Math.max(0,(w.maxTicks-w.tick)/288),
      longTermEffect:p.id==='stove'?'Every second completed cooking batch saves one wood after construction. Savings depend on future use.':p.id==='orchard_upgrade'?'Food regeneration rises by six units per simulated day after completion. Capacity can still discard unused growth.':'Tool/home recipes cost less wood where applicable after completion. Savings depend on future crafting.'});
    if(p.completedAt!==null)continue;
    if(remainingWood && a.inventory.wood)choices.push({choice:planChoice('contribute',p.id,'wood'),effect:`Supply one carried wood toward ${p.name}; ${remainingWood} wood remain. ${p.benefit}`});
    if(!remainingWood && a.energy>=5)choices.push({choice:planChoice('build',p.id),effect:`Spend four energy to build ${a.profession==='craftsperson'?3:2} work toward ${p.name}; ${remainingWork} work remain. ${p.benefit}`});
    if(!remainingWood && a.coins && !w.village.requests.some(r=>r.ownerId===a.id))choices.push({choice:planChoice('request_work',p.id,'none',1),effect:'Explicitly reserve one existing coin for another resident to perform one construction job. No automatic hiring.'});
  }
  for(const item of ['bed','furnishing'])if(!a.home[item]&&!a.inventory[item]&&a.inventory.wood>=o.village.recipes[item+'Wood']&&a.energy>=5)
    choices.push({choice:planChoice('craft_'+item,'square',item),effect:`Spend ${o.village.recipes[item+'Wood']} wood and four energy on a ${item}; install separately for a lasting comfort benefit.`});
  return {choices,projects};
}
export function planningObservation(w,a,o) {
  const {choices,projects}=projectChoices(w,a,o);
  const home={currentComfort:a.wellbeing.comfort,currentTarget:20+(a.home.bed?25:0)+(a.home.furnishing?30:0),
    bedTargetIncrease:a.home.bed?0:25,furnishingTargetIncrease:a.home.furnishing?0:30,
    guidance:'Comfort approaches the installed-home target gradually, about 44% of the remaining gap per day. Immediate hobby gains do not capture this future benefit.'};
  o.planning={myGoal:structuredClone(a.goal),progress:goalProgress(w,a),lastGoal:structuredClone(a.lastGoal),
    myWorkPlan:structuredClone(a.workPlan),home,projects,
    guidance:'You may choose a private 24-hour goal. Compare survival, slow home/project benefits, earning/spending and connection alongside immediate enjoyment. Goals do not force work. Meals/rest/supply orders pause physical plans; choose resume_plan (or continue with no other task) afterward. Other choices replace physical plans; goals persist. No automatic eating or buying.'};
  let opportunities=o.coordination.opportunities.filter(x=>x.choice.action!=='continue'||!a.workPlan?.suspended);
  opportunities.push(...choices);
  if(!a.goal) {
    const target=!a.home.bed?'home_bed':!a.home.furnishing?'home_furnishing':projects.find(p=>!p.complete)?.id;
    if(target)opportunities.push({choice:planChoice('set_goal',target),effect:'Record a private 24-hour goal; choose production, purchases or contribution actions separately. Food and rest do not erase the goal.'});
  }
  if(a.workPlan?.suspended)opportunities.unshift({choice:planChoice('resume_plan'),effect:`Resume after addressing ${a.workPlan.pauseReason}; original deadline and payment conditions remain.`});
  // Offer the exact recovery action separately from upkeep; maintenance never directly heals.
  if(o.currentFacts.lifeAvailableNow.clinicActive && o.currentFacts.lifeAvailableNow.careReady && a.inventory.meal)
    opportunities.push({choice:planChoice('recover','shelter','meal'),effect:'Consume one carried meal at the active clinic to restore up to six personal health. This is different from paid maintenance.'});
  for(const x of opportunities) {
    if(x.choice.action==='meal_plan')x.effect=x.effect.replace('stops at hunger 80, low energy or failure','pauses at hunger 80 or low energy; limited renewable shortages may wait within the original bounds');
    if(x.choice.action==='continue')x.effect='Continue the bounded plan. Meals, rest, recovery and supply orders pause it; resume explicitly afterward within the original deadline. Other work replaces it; cancel_plan stops it.';
    if(x.choice.action==='upkeep_plan')x.effect=x.effect.replace('stops on low energy/hunger or failed work','pauses on low energy/hunger; may wait through up to three renewable shortages within the original bounds')+' Maintenance directly restores zero personal health. Use recover for a fed injured resident.';
  }
  // Override inherited treatment text only here; historical inputs remain byte-for-byte frozen.
  o.actions.community=o.actions.community.replace('stops at hunger80, energy<10, failed step, closed shop','pauses at hunger80 or energy<10; up to three renewable shortages may wait within the original bounds; other failed steps or closed shops stop it').replace('any other choice interrupts','meals/rest/recovery/post_order pause it, goal choices preserve it, other work interrupts');
  o.actions.agency=o.actions.agency.replace('any other choice replaces it and refunds unspent upkeep wages to the public budget','meals/rest/recovery/post_order pause it, goal choices preserve it, other work replaces it and refunds unspent upkeep wages to the public budget');
  o.coordination.opportunities=[...new Map(opportunities.map(x=>[JSON.stringify(x.choice),x])).values()];
  const groups={survival:[],commitments:[],homeAndProjects:[],exchange:[],leisure:[]};
  for(const x of o.coordination.opportunities) {
    const action=x.choice.action;
    const key=['meal_plan','cook','eat','rest','recover'].includes(action)?'survival':['continue','resume_plan','upkeep_plan','complete_job'].includes(action)?'commitments':['set_goal','contribute','build','request_work','furnish','craft_bed','craft_furnishing','sponsor','fund','civic_work','civic_supply'].includes(action)?'homeAndProjects':['hobby','invite','craft_kit'].includes(action)?'leisure':'exchange';
    groups[key].push(x);
  }
  o.planning.choiceGroups=groups;
  // One copy of the exact choices avoids growing the prompt with a duplicate flat menu.
  o.coordination.opportunities=[];
  o.coordination.guidance+=' In this treatment, exact voluntary choices are grouped in planning.choiceGroups.';
  o.actions.planning='set_goal target home_bed/home_furnishing/stove/orchard_upgrade/workshop/clinic/garden, item none, price0, offerId0 records a private goal lasting24h; it never executes work automatically. clear_goal none none0/0 clears it. resume_plan none none0/0 resumes a saved suspended physical plan. Eating, rest, recovery and an explicit post_order pause physical plans without extending their deadlines. Other choices replace them. Temporary depletion during a consented plan may wait for public renewable growth, at most three shortages within the original step/deadline budget. No free resources or auto-survival. Upkeep pays a wage and restores service, never personal health.';
  return o;
}
export function plannedFoodOwned(w,a) {
  return hasEvents(w)?w.planning.sharedEvents.entries.filter(e=>e.hostId===a.id&&e.item==='meal').reduce((n,e)=>n+e.reserved,0):0;
}
