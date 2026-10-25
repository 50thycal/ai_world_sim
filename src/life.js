import { hobbyBase } from './agency.js';
import { ADAPTIVE_VERSION, LIVING_VERSION, hasLiving, AGENCY_VERSION, PLANNING_VERSION, EVENT_VERSION, hasAgency } from './treatments.js';
import { COMMUNITY_VERSION, hasCommunity, activity } from './community.js';
import { COORDINATION_VERSION, openingStock } from './coordination.js';
// world-v7 only. Standing consent, stocks, budgets and social commitments are saved physics.
export const LIFE_VERSION = 'world-v7';
export const hasLife = w => [LIFE_VERSION,COORDINATION_VERSION,COMMUNITY_VERSION,AGENCY_VERSION,PLANNING_VERSION,EVENT_VERSION,LIVING_VERSION,ADAPTIVE_VERSION].includes(w.version) && w.life?.version === 1;
export const HOBBIES = ['music', 'games', 'walking'];
export const CIVIC = {
  clinic: { name: 'Community clinic', site: 'shelter', benefit: 'Fed residents can recover health; care deliveries restore 12 instead of 8 health.' },
  garden: { name: 'Leisure garden', site: 'square', benefit: 'Hobbies and accepted invitations give 5 extra satisfaction.' },
};
export const LIFE_TARGETS = [...HOBBIES, ...Object.keys(CIVIC)];
export const SHOP_ITEMS = ['meal', 'raw', 'wood', 'tool', 'bed', 'furnishing', 'leisure_kit', 'care'];
export const LIFE_ACTIONS = ['open_shop', 'stock_shop', 'close_shop', 'order', 'cancel_order', 'deliver', 'craft_kit',
  'hobby', 'invite', 'accept_invite', 'decline_invite', 'propose', 'vote_yes', 'vote_no', 'fund', 'civic_supply', 'civic_work', 'maintain', 'recover'];
const copy = x => structuredClone(x);
const fail = text => ({ text: `could not complete life action: ${text}`, failed: true });
const person = (w, id) => w.agents.find(a => a.id === id);
const civicActive = (w, id) => w.life.council[id].status === 'complete' && w.life.council[id].serviceUntil > w.tick;
export function addLife(w) {
  w.life = { version: 1, nextId: 1, shops: [], orders: [], invitations: [], recent: [],
    council: Object.fromEntries(Object.entries(CIVIC).map(([id, p]) => [id, { id, ...p, status: 'unproposed', votes: {}, contributions: {}, balance: 0,
      wood: 0, woodNeeded: 4, work: 0, workNeeded: 8, deadline: null, completedAt: null, serviceUntil: 0 }])),
    stats: { shopsOpened: 0, ordersPlaced: 0, deliveries: 0, careVisits: 0, careMealsConsumed: 0, healthRestored: 0,
      kitsCrafted: 0, kitsUsed: 0, hobbiesEnjoyed: 0, invitationsAccepted: 0, invitationsDeclined: 0, invitationsMissed: 0,
      proposals: 0, proposalsPassed: 0, proposalsRejected: 0, civicWood: 0, civicWork: 0, civicCompleted: 0, civicWages: 0, maintenance: 0, recoveries: 0 } };
  for (const [i, a] of w.agents.entries()) {
    a.inventory.leisure_kit = 0;
    a.personal = { interest: HOBBIES[i % 3], preferredHour: 18 + i % 3, lastLeisureAt: null, lastCareAt: null, leisureCount: 0 };
  }
}
export function lifeSite(w, d) {
  if (d.action === 'deliver') return d.target;
  if (['propose','vote_yes','vote_no','fund'].includes(d.action)) return 'square';
  if (['civic_supply','civic_work','maintain'].includes(d.action)) return CIVIC[d.target]?.site;
  if (d.action === 'recover') return 'shelter';
  if (['accept_invite','decline_invite'].includes(d.action)) return w.life.invitations.find(i => i.id === d.offerId)?.site || 'square';
  return d.action === 'hobby' && d.target === 'walking' ? 'orchard' : 'square';
}
export function lifeProblem(w, a, d) {
  if (!LIFE_ACTIONS.includes(d.action)) return null;
  const civic = Object.hasOwn(CIVIC, d.target), other = w.agents.some(b => b.id === d.target && b.id !== a.id);
  if (d.action === 'open_shop' && (d.target !== 'square' || !SHOP_ITEMS.includes(d.item) || d.price < 1 || d.offerId !== 0)) return 'open_shop: square, advertised item, price 1–12, offerId 0';
  if (d.action === 'stock_shop' && (d.target !== 'square' || !SHOP_ITEMS.filter(i=>i!=='care').includes(d.item) || d.price !== 0 || d.offerId < 1)) return 'stock_shop: square, exact shop item/id, price 0';
  if (d.action === 'close_shop' && (d.target !== 'square' || d.item !== 'none' || d.price !== 0 || d.offerId < 1)) return 'close_shop: square, item none, price 0, own shop id';
  if (['order','deliver'].includes(d.action) && (!other || !SHOP_ITEMS.includes(d.item) || d.price < 1 || d.offerId < 1)) return 'copy the exact other resident, item, unit price and shop/order id';
  if (d.action === 'cancel_order' && (d.item !== 'none' || d.price !== 0 || d.offerId < 1)) return 'cancel_order: item none, price 0, own order id';
  if (d.action === 'craft_kit' && (d.item !== 'leisure_kit' || d.price !== 0 || d.offerId !== 0 || d.target !== 'square')) return 'craft_kit: square, leisure_kit, price/offerId 0';
  if (['hobby','invite'].includes(d.action) && (!HOBBIES.includes(d.target) || d.item !== 'none' || d.price !== 0 || d.offerId !== 0)) return 'choose music, games or walking; item none, price/offerId 0';
  if (['accept_invite','decline_invite'].includes(d.action) && (!other || d.item !== 'none' || d.price !== 0 || d.offerId < 1)) return 'copy the host id and invitation id, item none, price 0';
  if (['propose','vote_yes','vote_no','fund','civic_supply','civic_work','maintain'].includes(d.action)) {
    if (!civic || d.offerId !== 0) return 'choose clinic or garden; offerId 0';
    if (d.item !== (['civic_supply','maintain'].includes(d.action) ? 'wood' : 'none')) return 'civic_supply/maintain use wood; other council actions use none';
    if (d.action === 'fund' ? d.price < 1 : d.price !== 0) return 'fund uses contribution 1–12; other council actions use price 0';
  }
  if (d.action === 'recover' && (d.target !== 'shelter' || d.item !== 'meal' || d.price !== 0 || d.offerId !== 0)) return 'recover: shelter, meal, price/offerId 0';
  return null;
}
function recent(w, a, text, extra = {}) {
  w.life.recent = [...w.life.recent, { tick: w.tick, actorId: a.id, text, ...extra }].slice(-24);
}
function refundOrder(w, o) { person(w,o.buyerId).coins += o.price * o.remaining; }
function closeShop(w, s) {
  if (s.item !== 'care') person(w,s.ownerId).inventory[s.item] += s.stock;
  for (const o of w.life.orders.filter(o=>o.shopId===s.id)) refundOrder(w,o);
  w.life.orders = w.life.orders.filter(o=>o.shopId!==s.id); w.life.shops = w.life.shops.filter(x=>x.id!==s.id);
}
export function expireLife(w, emit) {
  if (!hasLife(w)) return;
  const l = w.life;
  for (const s of [...l.shops]) if (s.expiresAt <= w.tick) {
    closeShop(w,s); emit(person(w,s.ownerId), 'Shop closed after three days; remaining stock and all unspent customer deposits returned.', 'shop_closed', { shopId:s.id });
  }
  for (const o of [...l.orders]) if (o.expiresAt <= w.tick) {
    refundOrder(w,o); l.orders=l.orders.filter(x=>x.id!==o.id);
    emit(person(w,o.buyerId), `Standing order #${o.id} expired; unspent deposit returned.`, 'order_closed', {orderId:o.id});
  }
  for (const i of [...l.invitations]) if (i.expiresAt <= w.tick) {
    if(hasCommunity(w)&&i.kitReserved)person(w,i.hostId).inventory.leisure_kit++;
    l.stats.invitationsMissed++; l.invitations=l.invitations.filter(x=>x.id!==i.id);
    emit(person(w,i.hostId), `Invitation #${i.id} ended without a shared activity.`, 'invitation_missed', { invitationId:i.id });
  }
  for (const p of Object.values(l.council)) if (p.status === 'voting' && p.deadline <= w.tick) {
    if (Object.values(p.votes).filter(v=>v==='yes').length >= 4) {
      p.status='approved'; l.stats.proposalsPassed++;
      emit(person(w,p.proposerId), `${p.name} passed with at least four yes votes. Donated coins now fund building and maintenance wages.`, 'proposal_passed', {projectId:p.id});
    } else {
      for (const [id,n] of Object.entries(p.contributions)) person(w,id).coins+=n;
      p.balance=0;p.contributions={};p.status='unproposed'; l.stats.proposalsRejected++;
      emit(person(w,p.proposerId), `${p.name} did not pass; all pledges returned.`, 'proposal_rejected', {projectId:p.id});
    }
  }
}
function restoreHealth(w, a, amount) {
  const gained = Math.min(amount,100-a.health); a.health+=gained;a.personal.lastCareAt=w.tick;w.life.stats.healthRestored+=gained;return gained;
}
function canCare(w,a) { return a.hunger<60 && a.health<100 && (a.personal.lastCareAt===null || w.tick-a.personal.lastCareAt>=48); }
function leisure(w,a,interest) {
  const p=a.personal, preferred=p.interest===interest, hour=Math.floor(w.tick/12)%24;
  let gain=preferred?12:8;
  if (hour===p.preferredHour) gain+=5;
  if(civicActive(w,'garden'))gain+=5;
  if(hasAgency(w))gain=hobbyBase(w,a,interest)-(a.inventory.leisure_kit?8:0);
  if(a.inventory.leisure_kit){a.inventory.leisure_kit--;gain+=8;w.life.stats.kitsUsed++;}
  if(hasCommunity(w))activity(w,a,interest,{enjoyment:gain});else a.satisfaction=Math.min(100,a.satisfaction+gain);a.energy=Math.min(100,a.energy+3);
  p.lastLeisureAt=w.tick;p.leisureCount++;w.life.stats.hobbiesEnjoyed++;
  return gain;
}
const readyLeisure = (w,a) => a.personal.lastLeisureAt===null || w.tick-a.personal.lastLeisureAt>=48;
export function completeLifeAction(w,a,t) {
  const l=w.life,id=t.offerId,target=t.customerId;
  if(t.action==='open_shop') {
    if(l.shops.some(s=>s.ownerId===a.id))return fail('one shop per resident; close it before changing its item or price.');
    const s={id:l.nextId++,ownerId:a.id,owner:a.name,item:t.item,price:t.price,stock:0,openedAt:w.tick,expiresAt:w.tick+864};
    const stocked=openingStock(w,a,s);l.shops.push(s);l.stats.shopsOpened++;return{kind:'shop_opened',text:`opened a ${s.item} business, ${s.price} coins per delivery, for three days${stocked?`; stocked ${stocked} carried goods`:``}.`,extra:{stocked,shopId:s.id,item:s.item,price:s.price}};
  }
  if(t.action==='stock_shop'||t.action==='close_shop') {
    const s=l.shops.find(s=>s.id===id&&s.ownerId===a.id);
    if(!s)return fail('own shop is unavailable.');
    if(t.action==='close_shop'){closeShop(w,s);return{kind:'shop_closed',text:'closed their business; stock and unspent order deposits returned.',extra:{shopId:id}};}
    if(s.item!==t.item||s.item==='care'||s.stock>=6||!a.inventory[s.item])return fail('wrong item, no carried stock, or six-unit stock limit.');
    a.inventory[s.item]--;s.stock++;return{kind:'shop_stocked',text:`stocked 1 ${s.item} in shop #${s.id}.`,extra:{shopId:id,item:s.item}};
  }
  if(t.action==='order') {
    const s=l.shops.find(s=>s.id===id&&s.ownerId===target&&s.item===t.item&&s.price===t.price);
    if(!s||l.orders.some(o=>o.buyerId===a.id)||a.coins<s.price*3)return fail('shop changed, an order is already open, or three deliveries are unaffordable.');
    a.coins-=s.price*3;
    const o={id:l.nextId++,shopId:s.id,buyerId:a.id,buyer:a.name,sellerId:s.ownerId,item:s.item,price:s.price,remaining:3,nextDeliveryAt:w.tick,expiresAt:Math.min(w.tick+864,s.expiresAt)};
    l.orders.push(o);l.stats.ordersPlaced++;return{kind:'order_placed',text:`authorized up to three daily ${s.item} deliveries from ${s.owner}; reserved ${s.price*3} coins.`,extra:{orderId:o.id,shopId:s.id,item:s.item,price:s.price}};
  }
  if(t.action==='cancel_order') {
    const o=l.orders.find(o=>o.id===id&&o.buyerId===a.id);if(!o)return fail('own order is unavailable.');
    refundOrder(w,o);l.orders=l.orders.filter(x=>x.id!==id);return{kind:'order_closed',text:`cancelled standing order #${id}; unspent coins returned.`,extra:{orderId:id}};
  }
  if(t.action==='deliver') {
    const o=l.orders.find(o=>o.id===id&&o.sellerId===a.id&&o.buyerId===target&&o.item===t.item&&o.price===t.price);
    if(!o||o.nextDeliveryAt>w.tick)return fail('exact order is unavailable or next daily delivery is not due.');
    const s=l.shops.find(s=>s.id===o.shopId),b=person(w,o.buyerId);let extra={};
    if(o.item==='care') {
      if(!canCare(w,b)||!a.inventory.meal||a.energy<5)return fail('care needs a carried meal, energy and a fed injured customer who has not received care in four hours.');
      a.inventory.meal--;a.energy-=4;l.stats.careMealsConsumed++;l.stats.careVisits++;
      extra={mealConsumed:1,healthRestored:restoreHealth(w,b,civicActive(w,'clinic')?12:8)};
    } else {
      if(!s?.stock)return fail('shop has no reserved stock; stock_shop first.');
      s.stock--;b.inventory[o.item]++;
    }
    a.coins+=o.price;a.economicStats.earned+=o.price;a.economicStats.sold++;b.economicStats.spent+=o.price;b.economicStats.bought++;
    w.economy.stats.coinsTraded+=o.price;w.economy.stats.trades++;l.stats.deliveries++;
    o.remaining--;o.nextDeliveryAt=w.tick+288;if(!o.remaining)l.orders=l.orders.filter(x=>x.id!==id);
    const text=`delivered ${o.item} to ${b.name} for ${o.price} coins on standing order #${id}.`;
    recent(w,a,text,{targetId:b.id});return{kind:'delivery',text,extra:{orderId:id,shopId:o.shopId,targetId:b.id,item:o.item,price:o.price,...extra}};
  }
  if(t.action==='craft_kit') {
    if(!a.inventory.wood||a.energy<5)return fail('a leisure kit needs one wood and energy.');
    a.inventory.wood--;a.energy-=4;a.inventory.leisure_kit++;l.stats.kitsCrafted++;
    return{kind:'kit_crafted',text:'made a leisure kit from one wood.',extra:{woodSpent:1,item:'leisure_kit'}};
  }
  if(t.action==='hobby') {
    if(!readyLeisure(w,a))return fail('leave four hours between hobbies or shared activities.');
    const gain=leisure(w,a,target);return{kind:'hobby',text:`enjoyed ${target} (+${gain} ${hasCommunity(w)?'base enjoyment before repetition/cap':'satisfaction before the cap'}).`,extra:{interest:target}};
  }
  if(t.action==='invite') {
    if(l.invitations.some(i=>i.hostId===a.id))return fail('one open invitation per host.');
    if(hasCommunity(w)&&!a.inventory.leisure_kit)return fail('a prepared invitation needs one leisure kit; unused kits return on expiry.');
    if(hasCommunity(w)){a.inventory.leisure_kit--;w.community.stats.preparedEvents++;}
    const i={...(hasCommunity(w)?{kitReserved:1}:{}),id:l.nextId++,hostId:a.id,host:a.name,interest:target,site:'square',startsAt:w.tick+12,expiresAt:w.tick+48,declinedBy:[]};
    l.invitations.push(i);return{kind:'invitation',text:`invited a neighbor to ${target} at the green in one hour; three-hour activity window.`,extra:{invitationId:i.id,interest:target,startsAt:i.startsAt}};
  }
  if(['accept_invite','decline_invite'].includes(t.action)) {
    const i=l.invitations.find(i=>i.id===id&&i.hostId===target&&i.hostId!==a.id&&!i.declinedBy.includes(a.id));
    if(!i)return fail('exact invitation ended or you already declined.');
    if(t.action==='decline_invite'){i.declinedBy.push(a.id);l.stats.invitationsDeclined++;return{kind:'invitation_declined',text:`declined ${i.host}'s invitation.`,extra:{invitationId:id,targetId:i.hostId}};}
    const host=person(w,i.hostId);
    if(w.tick<i.startsAt||Math.abs(host.x-a.x)+Math.abs(host.y-a.y)>2||!readyLeisure(w,a)||!readyLeisure(w,host))return fail('wait for the scheduled window, both residents at the green and four hours since their last activity.');
    leisure(w,a,i.interest);leisure(w,host,i.interest);if(hasCommunity(w)){activity(w,a,'shared_event',{connection:8,enjoyment:8,partner:host.id});activity(w,host,'shared_event',{connection:8,enjoyment:8,partner:a.id});w.life.stats.kitsUsed+=i.kitReserved||0;w.community.stats.sharedExperiences++;}else{a.satisfaction=Math.min(100,a.satisfaction+5);host.satisfaction=Math.min(100,host.satisfaction+5);}
    l.invitations=l.invitations.filter(x=>x.id!==id);l.stats.invitationsAccepted++;
    return{kind:'shared_activity',text:`joined ${host.name} for ${i.interest} at the green.`,extra:{invitationId:id,targetId:host.id,interest:i.interest}};
  }
  if(t.action==='recover') {
    if(!civicActive(w,'clinic')||!canCare(w,a)||!a.inventory.meal)return fail('needs a maintained clinic, one meal, hunger below 60, injury and four hours since care.');
    a.inventory.meal--;l.stats.careMealsConsumed++;l.stats.recoveries++;const gained=restoreHealth(w,a,6);
    return{kind:'recovery',text:`used a meal and clinic time to recover ${gained} health.`,extra:{mealConsumed:1,healthRestored:gained}};
  }
  const p=l.council[target];
  if(!p)return fail('unknown public service.');
  if(t.action==='propose') {
    if(p.status!=='unproposed'||Object.values(l.council).some(p=>p.status==='voting'))return fail('only one ballot at a time; this service may already be approved.');
    p.status='voting';p.proposerId=a.id;p.votes={[a.id]:'yes'};p.deadline=w.tick+288;l.stats.proposals++;
    return{kind:'proposal',text:`proposed ${p.name}; four yes votes needed within 24 hours.`,extra:{projectId:p.id}};
  }
  if(t.action==='vote_yes'||t.action==='vote_no') {
    if(p.status!=='voting')return fail('ballot is not open.');
    p.votes[a.id]=t.action==='vote_yes'?'yes':'no';return{kind:'vote',text:`voted ${p.votes[a.id]} on ${p.name}.`,extra:{projectId:p.id,vote:p.votes[a.id]}};
  }
  if(t.action==='fund') {
    if(!['voting','approved','complete'].includes(p.status)||a.coins<t.price)return fail('no open project or insufficient coins.');
    a.coins-=t.price;p.balance+=t.price;p.contributions[a.id]=(p.contributions[a.id]||0)+t.price;
    return{kind:'civic_funded',text:`committed ${t.price} coins to ${p.name}'s public wage budget.`,extra:{projectId:p.id,coins:t.price}};
  }
  if(t.action==='civic_supply') {
    if(p.status!=='approved'||p.wood>=p.woodNeeded||!a.inventory.wood)return fail('approved unfinished project needs carried wood.');
    a.inventory.wood--;p.wood++;l.stats.civicWood++;return{kind:'civic_supply',text:`supplied one wood to ${p.name}.`,extra:{projectId:p.id,woodSpent:1}};
  }
  if(t.action==='civic_work'||t.action==='maintain') {
    const maintenance=t.action==='maintain';
    if(a.energy<5||p.balance<1)return fail('needs energy and one coin in the public wage budget.');
    if(maintenance ? p.status!=='complete'||p.serviceUntil>w.tick+24||!a.inventory.wood : p.status!=='approved'||p.wood<p.woodNeeded)return fail('building needs approval and all wood; maintenance needs a completed service due within two hours and one wood.');
    if(maintenance){a.inventory.wood--;p.serviceUntil=w.tick+288;l.stats.maintenance++;l.stats.civicWood++;}
    else {
      const units=Math.min(a.profession==='craftsperson'?3:2,p.workNeeded-p.work);p.work+=units;l.stats.civicWork+=units;
      if(p.work>=p.workNeeded){p.status='complete';p.completedAt=w.tick;p.serviceUntil=w.tick+288;l.stats.civicCompleted++;}
    }
    a.energy-=4;p.balance--;a.coins++;a.economicStats.earned++;l.stats.civicWages++;
    return{kind:maintenance?'maintenance':p.status==='complete'?'civic_completed':'civic_work',text:`${maintenance?'maintained':'worked on'} ${p.name} and earned one donated coin.`,extra:{projectId:p.id,wage:1,woodSpent:maintenance?1:0}};
  }
  return fail('unknown life action.');
}
export function lifeMetrics(w) {
  if(!hasLife(w))return{};
  return{...w.life.stats,shopsOpen:w.life.shops.length,standingOrders:w.life.orders.length,
    orderCoinsReserved:w.life.orders.reduce((n,o)=>n+o.price*o.remaining,0),publicCoins:Object.values(w.life.council).reduce((n,p)=>n+p.balance,0)};
}
export function lifeFoodOwned(w,a) { return hasLife(w)?w.life.shops.filter(s=>s.ownerId===a.id&&['meal','raw'].includes(s.item)).reduce((n,s)=>n+s.stock,0):0; }
export function lifeObservation(w,a) {
  const l=w.life;
  return{version:1,shops:copy(l.shops),myOrders:copy(l.orders.filter(o=>o.buyerId===a.id||o.sellerId===a.id)),
    invitations:copy(l.invitations),council:copy(l.council),myLife:copy(a.personal),recent:copy(l.recent.slice(-6)),
    availableNow:{maxAffordableStandingOrderUnitPrice:Math.floor(a.coins/3),leisureReady:readyLeisure(w,a),careReady:canCare(w,a),clinicActive:civicActive(w,'clinic'),gardenActive:civicActive(w,'garden')},
    rules:'Optional livelihoods and leisure accompany survival; no automatic buying, eating, gathering or forced jobs. '+
      'open_shop: square, item meal/raw/wood/tool/bed/furnishing/leisure_kit/care, unit price 1–12, offerId 0. One shop per person; fixed terms for three days. stock_shop: square, exact shop item/id, price 0; move ONE carried good into stock (max 6). close_shop: square, item none, price 0, shop id; return all stock and unspent customer deposits. '+
      'order: target seller id, exact shop item/unit price and shop id as offerId. Explicitly reserves THREE times unit price for up to three deliveries, at most one per 24 hours. One open order per buyer. cancel_order: square, item none, price 0, order id; refund unspent coins. deliver: target customer id, copy order item/unit price and order id; walk to customer, transfer one stocked good and earn reserved pay. Nothing is bought or delivered automatically; unsold shop stock belongs to its merchant. Expiry refunds unused balances once. '+
      'care is a delivered service: provider uses one carried meal and 4 energy, customer needs health<100, hunger<60, and four hours since care. Restores 8 health (12 with maintained clinic); no food transfer or hunger reduction. '+
      'craft_kit: square, item leisure_kit, price/offerId 0; 1 wood +4 energy. A kit is consumed by a hobby/shared activity for +8 satisfaction. It can be gifted, stolen or sold through a shop. '+
      'hobby: target music/games/walking, item none, price/offerId 0; walking at orchard, others green. +12 satisfaction for own interest, otherwise +8; preferred hour +5, maintained garden +5, energy +3. At least four hours between hobbies/shared activities. Interests and preferred hours are optional personal goals, not hidden mandates. '+
      'invite: target music/games/walking, item none, price/offerId 0; post at green for an activity starting one hour later, open three hours. Host must choose to be at green during window. accept_invite: target host id, exact invitation id, item none, price 0; walk to green; both must be present and leisure-ready. Each receives hobby benefit +5 social satisfaction. One guest. decline_invite uses same fields; decline is remembered per guest. '+
      'propose: target clinic/garden, item none, price/offerId 0; one ballot at a time, proposer votes yes, four of six yes votes within 24h to pass. vote_yes/vote_no use same fields; votes may change until deadline. fund: target project, item none, offerId 0, price 1–12 donated coins. Failed ballot refunds pledges; approval commits them to a public budget. No tax or minted wages. '+
      'civic_supply: target approved clinic/garden, item wood, price/offerId 0; deposit 1 wood (4 total). civic_work: project, item none, price/offerId 0, after all wood and at least 1 budget coin: 2 work (maker 3), 4 energy, earns 1 public coin. Needs 8 work, activates service for 24h. maintain: completed project, item wood, price/offerId 0; when service expired/due within 2h, spend 1 wood+4 energy, earn 1 budget coin, renew service for 24h. Public balances stay saved when inactive. '+
      'recover: shelter, item meal, price/offerId 0; maintained clinic, consume 1 meal, health<100, hunger<60, four hours since care; +6 health, no hunger reduction. Other actions have price/offerId 0 unless their documented contract says otherwise.'};
}
