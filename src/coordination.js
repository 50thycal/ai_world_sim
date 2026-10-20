// A fresh treatment. Saved v4-v7 worlds never receive these rules or condensed observations.
export const COORDINATION_VERSION = 'world-v8';
export const COORDINATED_INPUT = 'coordinated-facts-v1';
export const hasCoordination = w => w.version === COORDINATION_VERSION && w.coordination?.version === 1;
export const COORDINATION_ACTIONS = ['shop_buy', 'sponsor'];
export function addCoordination(w) {
  w.coordination = { version: 1, stats: { shopPurchases: 0, sponsoredVotes: 0, openingStock: 0 } };
  w.economy.rules.specialistCook = 4;
}
export function coordinationProblem(w,a,d) {
  if (!COORDINATION_ACTIONS.includes(d.action)) return null;
  if (d.action==='shop_buy' && (!w.agents.some(b=>b.id===d.target && b.id!==a.id) || d.item==='care' || d.item==='none' || d.price<1 || d.offerId<1)) return 'shop_buy needs another merchant id and exact stocked good, unit price and shop id';
  if (d.action==='sponsor' && (!Object.hasOwn(w.life.council,d.target) || d.item!=='none' || d.price<1 || d.offerId!==0)) return 'sponsor needs clinic/garden, item none, contribution 1–12 and offerId 0';
  return null;
}
export function completeCoordinationAction(w,a,t) {
  const fail=text=>({failed:true,text:`could not coordinate: ${text}`});
  if(t.action==='shop_buy') {
    const s=w.life.shops.find(s=>s.id===t.offerId && s.ownerId===t.customerId && s.item===t.item && s.price===t.price);
    if(!s || s.ownerId===a.id || s.item==='care' || s.stock<1 || a.coins<s.price)return fail('exact shop stock is unavailable or unaffordable.');
    const seller=w.agents.find(b=>b.id===s.ownerId);s.stock--;a.inventory[s.item]++;a.coins-=s.price;seller.coins+=s.price;
    a.economicStats.bought++;a.economicStats.spent+=s.price;seller.economicStats.sold++;seller.economicStats.earned+=s.price;
    w.economy.stats.trades++;w.economy.stats.coinsTraded+=s.price;w.coordination.stats.shopPurchases++;
    const trade={tick:w.tick,shopId:s.id,buyerId:a.id,sellerId:s.ownerId,item:s.item,price:s.price};
    w.economy.trades=[...w.economy.trades,trade].slice(-24);
    return{kind:'shop_purchase',text:`collected one ${s.item} from ${s.owner}'s shop for ${s.price} coins.`,extra:{...trade,targetId:s.ownerId,success:true}};
  }
  const p=w.life.council[t.customerId];
  if(!p || !['unproposed','voting'].includes(p.status) || a.coins<t.price)return fail('ballot is unavailable or contribution is unaffordable.');
  if(p.status==='unproposed' && Object.values(w.life.council).some(q=>q.status==='voting'))return fail('another ballot is open.');
  if(p.status==='unproposed') {
    p.status='voting';p.proposerId=a.id;p.votes={};p.deadline=w.tick+288;w.life.stats.proposals++;
  }
  p.votes[a.id]='yes';a.coins-=t.price;p.balance+=t.price;p.contributions[a.id]=(p.contributions[a.id]||0)+t.price;
  w.coordination.stats.sponsoredVotes++;
  return{kind:'sponsored_vote',text:`pledged ${t.price} coins and voted yes for ${p.name}; four distinct residents must approve.`,extra:{projectId:p.id,coins:t.price,vote:'yes'}};
}
export function openingStock(w,a,s) {
  if(!hasCoordination(w)||s.item==='care')return 0;
  // Explicit open_shop consent reserves up to three carried goods, leaving at least one.
  const count=Math.min(3,Math.max(0,a.inventory[s.item]-1));a.inventory[s.item]-=count;s.stock=count;w.coordination.stats.openingStock+=count;return count;
}
const clone=x=>structuredClone(x);
const example=(action,target='square',item='none',price=0,offerId=0)=>({action,target,item,price,offerId,message:'',reason:''});
export function coordinationObservation(w,a,o) {
  const cf=o.currentFacts;
  const intents=w.agents.filter(b=>b.task && ['gather','cook','craft','contribute','build','civic_work','maintain'].includes(b.task.action))
    .map(b=>({actorId:b.id,name:b.name,action:b.task.action,target:b.task.projectId || b.task.target}));
  const opportunities=[];
  for(const s of w.life.shops)if(s.ownerId!==a.id&&s.stock>0&&s.price<=a.coins)opportunities.push({choice:example('shop_buy',s.ownerId,s.item,s.price,s.id),effect:`Collect 1 advertised ${s.item}; no three-delivery deposit.`});
  for(const r of w.village.requests)if(r.ownerId!==a.id && (r.type==='request_cooking' && a.energy>=5 || r.type==='request' && a.inventory[r.item]>0 || r.type==='request_work' && a.energy>=5)) {
    const action={request:'fulfill',request_cooking:'fulfill_cooking',request_work:'fulfill_work'}[r.type];
    opportunities.push({choice:example(action,r.projectId || r.ownerId,r.item,r.price,r.id),effect:r.type==='request_cooking'?`Cook reserved inputs for ${r.price} coins${r.price===0?' and half of the meals':''}.`:`Earn ${r.price} reserved coins; delivery/work must succeed.`});
  }
  if(a.inventory.raw && a.inventory.wood && !w.village.requests.some(r=>r.ownerId===a.id))opportunities.push({choice:example('request_cooking','square','meal',a.coins?1:0),effect:`Reserve inputs for another cook. Asha produces 4 meals; your own batch produces ${w.economy.rules[a.profession==='cook'?'specialistCook':'baseCook']}. Paid service returns all output; free barter splits it evenly.`});
  if(!w.life.shops.some(s=>s.ownerId===a.id)) {
    const item=['meal','raw','wood','tool','leisure_kit'].find(i=>a.inventory[i]>=2);
    if(item)opportunities.push({choice:example('open_shop','square',item,1),effect:`Open a three-day shop and stock up to 3 carried ${item}, keeping at least one. Customers choose whether to buy.`});
  }
  for(const p of Object.values(w.life.council)) {
    if(a.coins && p.status==='voting' && p.votes[a.id]!=='yes' || a.coins && p.status==='unproposed' && !Object.values(w.life.council).some(q=>q.status==='voting'))opportunities.push({choice:example('sponsor',p.id,'none',1),effect:`One choice pledges 1 coin and votes yes for ${p.name}. Four distinct yes votes needed; failed ballot refunds pledges.`});
    if(p.status==='approved' && p.wood>=p.woodNeeded && p.balance>=1 && a.energy>=5)opportunities.push({choice:example('civic_work',p.id),effect:'Complete public work to earn 1 donated coin.'});
    if(p.status==='approved' && p.wood<p.woodNeeded && a.inventory.wood)opportunities.push({choice:example('civic_supply',p.id,'wood'),effect:`Supply 1 wood; ${p.woodNeeded-p.wood} more needed before paid building.`});
    if(p.status==='complete' && p.serviceUntil<=w.tick+24 && p.balance>=1 && a.inventory.wood && a.energy>=5)opportunities.push({choice:example('maintain',p.id,'wood'),effect:'Spend 1 wood and work; earn 1 public coin; restore service for 24h.'});
  }
  for(const i of w.life.invitations)if(i.hostId!==a.id&&!i.declinedBy.includes(a.id))opportunities.push({choice:example('accept_invite',i.hostId,'none',0,i.id),effect:`Meet ${i.host} at the green during ticks ${i.startsAt}–${i.expiresAt}; both must be present and leisure-ready.`});
  const recipe={raw:1,woodNow:o.village.recipes.cooking.woodNow,meals:a.profession==='cook'?4:2};
  cf.cookingRecipe=recipe;
  const notes=clone(o.socialContext);
  if(notes?.memoryRule)notes.memoryRule+=' This condensed input shows the two latest events per person; the full saved notebook retains four.';
  if(notes?.people)for(const p of notes.people)if(p.recentEvents)p.recentEvents=p.recentEvents.slice(-2);
  return {currentFacts:cf,name:a.name,day:o.day,totalDays:o.totalDays,minuteOfDay:o.minuteOfDay,daysRemaining:o.daysRemaining,
    position:o.position,currentTask:o.currentTask,nextReviewMinutes:60*(w.reviewHours||1),decisionNumber:o.decisionNumber,
    scenario:o.scenario,...(o.temperament?{temperament:o.temperament}:{}),places:o.places,
    nearbyVillagers:o.nearbyVillagers,pantryMeals:o.pantryMeals,localResources:o.localResources,
    memories:o.memories.slice(-6),myRecentPlans:o.myRecentPlans,socialContext:notes,
    economy:{capabilities:o.economy.capabilities,professions:o.economy.professions,offers:o.economy.offers,recentTrades:o.economy.recentTrades.slice(-3)},
    village:{requests:o.village.requests,projects:o.village.projects,gatherings:o.village.gatherings,recipes:{...o.village.recipes,cooking:recipe},recentExchanges:o.village.recentExchanges.slice(-3)},
    life:{shops:o.life.shops,myOrders:o.life.myOrders,invitations:o.life.invitations,council:o.life.council,availableNow:o.life.availableNow},
    coordination:{publicWorkIntents:intents,renewalClock:Object.fromEntries(Object.entries(w.scenario.regrow).map(([key,rate])=>[key,{minutesUntilNextScheduledUnit:Math.ceil((1-(w.regrowth[key]||0))*12/rate)*5,ratePerHour:rate}])),
      guidance:'Public intents are declared work, not promises or private inventories. Same-hour new choices are simultaneous and still may compete. Renewal clocks do not reveal hidden stocks; growth at capacity is discarded. Compare known local stock, crowding, travel, food needs and alternatives.',opportunities},
    rules:`One voluntary choice every ${w.reviewHours||1} hour(s); five-minute physics ticks, movement 1 tile/tick. New choices can replace a task; continue or repeat same choice preserves it. Finished work waits for review. Hunger rises 5.4/hour; 0 full, 100 starving. Eat needs hunger>=40: own meal, then adjacent pantry meal (-40 hunger), otherwise own raw (-15 hunger,-8 health). Hunger>=95 damages 0.2 health/tick; floor 1. Coins cannot prevent starvation. Resources are renewable but collecting/cooking/distributing takes work. Other bags, coins, preferences and notebooks are private. No forced jobs or automatic buying. Satisfaction is optional quality of life, not health/trust. Cooking is 4 meals for Asha, 2 for others, using listed raw/fuel; free cooking barter splits output equally. Beds restore 7 energy/tick instead of 5; furnishing halves satisfaction decay. Tools add 1 harvest capacity, never create unavailable resources; spare auto-equips for 6 successful harvests. Six practiced jobs reduce production work from 3 to 2 ticks.`,
    actions:{
      basics:'All choices require action,target,item,message,reason,price,offerId. Use price=0,offerId=0,item=none unless below. Messages<=240,reason<=500. Any action is optional; opportunities are examples, not mandatory commands.',
      survival:'gather orchard/forest for raw/wood, costs 6 energy, needs energy>=5 and actual stock; cook hearth uses recipe and 4 energy; eat none or pantry follows food priority; take pantry withdraws 1 meal; share pantry deposits 1 meal; rest shelter recovers up to 40 energy (56 with bed). wait none idles; continue preserves current task.',
      social:'talk square or resident id speaks locally (4 tiles). give/steal target other id,item carried good transfers 1; theft is witnessed. socialize square gives 5 satisfaction alone/15 with neighbors,+3 energy. host_meal square,item meal reserves 1 meal for 2h; attend host id,item meal,offerId invitation requires hunger>=40, eats meal and +20 satisfaction. Expired meals return.',
      market:'craft square,item tool costs listed tool wood and 4 energy. offer square,item good,price 1–12,offerId 0 escrows ONE good for 12h. buy seller id copies exact item,price,offerId. cancel_offer square,item none,price 0,own offerId refunds it. One live offer/seller.',
      requests:'request square,item desired good,price 1–12 reserves coins for ONE delivery for 24h. fulfill requester id copies item,price,offerId,delivers 1 carried good. request_cooking square,item meal,price 0–12 reserves 1 raw+1 wood+fee; fulfill_cooking requester id copies fields,cooks at hearth using their supplies and 4 energy; positive fee returns all meals,zero fee splits output equally. cancel_request square,item none,price 0,own requestId refunds inputs/payment. One live request/resident.',
      projects:'contribute stove/orchard_upgrade/workshop,item wood deposits 1; build same project,item none adds 2 work (maker 3),costs 4 energy after ALL wood supplied. request_work project,item none,price 1–12 reserves pay for ONE job; fulfill_work copies project,price,offerId,earns pay only when work succeeds. Public benefits shown on projects.',
      homes:'craft_bed square,item bed and craft_furnishing square,item furnishing consume listed home wood cost +4 energy. furnish shelter,item bed/furnishing installs a carried good once/type.',
      shops:'open_shop square,item advertised good/care,price 1–12 creates one fixed-price shop for 3 days; stocks up to 3 carried goods while keeping 1. stock_shop square,exact item/shopId,price 0 adds 1 (max6). shop_buy merchant id,exact item,price,shopId collects ONE stocked good at square. order merchant id,exact item,price,shopId reserves 3 times price for up to 3 daily deliveries (one order/buyer). deliver customer id,exact item,price,ORDER id walks to customer,delivers 1 stocked good and earns pay; next due in 24h. close_shop square,item none,price 0,shopId returns stock/deposits; cancel_order square,item none,price 0,orderId refunds unspent coins. Expiry refunds once; no automatic sales.',
      care:'Care shops accept orders,not pickup. deliver care uses provider meal+4 energy; fed customer hunger<60,health<100,four hours since care: restores 8 health (12 with active clinic),no hunger reduction. recover shelter,item meal consumes 1 meal at active clinic,restores up to6 health,same fed/cooldown rules.',
      leisure:'hobby music/games/walking,item none: takes 6 work ticks, walking orchard/others square. +12 satisfaction for preferred hobby/8 otherwise,+5 preferred hour,+5 active garden,+3 energy; cooldown4h. craft_kit square,item leisure_kit uses 1 wood+4 energy; next hobby consumes kit for +8 satisfaction. invite music/games/walking posts green event starting +1h,lasting3h; accept_invite/decline_invite host id,exact invitationId,item none,price0. Acceptance requires both at green and leisure-ready, gives both hobby benefit+5. Host chooses to remain there.',
      council:'sponsor clinic/garden,item none,price1–12,offerId0 opens ballot if none open,pledges coins and casts YOUR yes vote. propose opens ballot with own yes, no pledge; vote_yes/vote_no project changes own vote. Four distinct yes votes within24h pass. fund project,item none,price1–12 donates budget. Failed ballot refunds pledges; approved funds committed. civic_supply approved project,item wood donates 1 (4 total). civic_work project,item none requires all wood,energy>=5,budget>=1; costs4 energy,adds2work(maker3),earns1 donated coin;8 work enables24h. maintain completed project,item wood when due within2h spends1wood+4energy,earns1budget coin,renews24h. Inactive services keep saved budgets. No minted wages.'}};
}
