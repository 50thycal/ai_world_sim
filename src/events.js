import { hasEvents, hasLiving } from './treatments.js';
import { activity } from './community.js';
import { hobbyBase } from './agency.js';
import { planChoice } from './planning.js';

export const EVENT_ACTIONS=['host_event','prepare_event','join_event','cancel_event'];
const HOBBIES=['music','games','walking'];
const person=(w,id)=>w.agents.find(a=>a.id===id);
const fail=text=>({failed:true,text:`could not complete shared event: ${text}`});
export function addEvents(w) {
  w.planning.sharedEvents={version:1,nextId:1,entries:[]};
  Object.assign(w.planning.stats,{eventsAnnounced:0,eventsPrepared:0,eventsHeld:0,eventTicketsPaid:0,eventCoinsTransferred:0,eventMealsConsumed:0,eventKitsConsumed:0,eventSuppliesReturned:0});
  for(const a of w.agents)a.eventsHosted=0;
}
export function eventProblem(w,a,d) {
  if(!EVENT_ACTIONS.includes(d.action))return null;
  if(d.action==='host_event')return d.offerId===0&&((d.target==='square'&&d.item==='meal')||(HOBBIES.includes(d.target)&&d.item==='leisure_kit'))?null:'host_event: square/meal or music|games|walking/leisure_kit, ticket price0–12, offerId0';
  if(d.offerId<1)return 'copy the exact event id';
  if(d.action==='join_event')return w.agents.some(b=>b.id===d.target&&b.id!==a.id)&&d.item==='none'?null:'join_event: other host id, item none, exact ticket price and event id';
  if(d.target!=='square'||d.price!==0||d.item!==(d.action==='prepare_event'?w.planning.sharedEvents.entries.find(e=>e.id===d.offerId)?.item:'none'))return 'prepare_event: square/exact supply item/price0/eventId; cancel_event: square/none/price0/eventId';
  return null;
}
function removeEvent(w,e,refund) {
  if(refund&&e.reserved){person(w,e.hostId).inventory[e.item]+=e.reserved;w.planning.stats.eventSuppliesReturned+=e.reserved;}
  w.planning.sharedEvents.entries=w.planning.sharedEvents.entries.filter(x=>x.id!==e.id);
}
export function expireEvents(w,emit) {
  if(!hasEvents(w))return;
  for(const e of [...w.planning.sharedEvents.entries])if(w.tick>=e.expiresAt){removeEvent(w,e,true);emit(person(w,e.hostId),`Event #${e.id} expired; unused reserved supplies returned.`, 'event_expired',{eventId:e.id,item:e.item,returned:e.reserved});}
}
const ready=(w,a)=>a.personal.lastLeisureAt===null||w.tick-a.personal.lastLeisureAt>=48;
export function completeEventAction(w,a,t) {
  const board=w.planning.sharedEvents,stats=w.planning.stats;
  if(t.action==='host_event') {
    if(board.entries.some(e=>e.hostId===a.id))return fail('one open event per host.');
    const e={id:board.nextId++,hostId:a.id,host:a.name,interest:t.customerId==='square'?'meal':t.customerId,item:t.item,quantity:t.item==='meal'?2:1,reserved:0,price:t.price,status:'announced',announcedAt:w.tick,startsAt:null,expiresAt:w.tick+288};
    if(hasLiving(w)){e.rsvpId=null;e.scheduledAt=w.tick+72;}board.entries.push(e);stats.eventsAnnounced++;
    return {kind:'event_announced',text:`announced ${e.interest} for two residents, ticket ${e.price} coins; must obtain and prepare ${e.quantity} ${e.item}.`,extra:{eventId:e.id,item:e.item,quantity:e.quantity,price:e.price}};
  }
  const e=board.entries.find(e=>e.id===t.offerId);if(!e)return fail('the event ended.');
  if(t.action==='cancel_event') {
    if(e.hostId!==a.id)return fail('only the host can cancel.');
    removeEvent(w,e,true);return {kind:'event_cancelled',text:'cancelled the event; unused supplies returned.',extra:{eventId:e.id,item:e.item,returned:e.reserved}};
  }
  if(t.action==='prepare_event') {
    if(hasLiving(w)&&!e.rsvpId)return fail('prepare after a willing guest RSVP.');
    if(e.hostId!==a.id||e.status!=='announced'||t.item!==e.item||a.inventory[e.item]<e.quantity)return fail('needs your unprepared event and all listed carried supplies.');
    if(w.tick+12>=e.expiresAt)return fail('too little time remains to open the event.');
    a.inventory[e.item]-=e.quantity;e.reserved=e.quantity;e.status='prepared';e.startsAt=hasLiving(w)?Math.max(w.tick+12,e.scheduledAt):w.tick+12;e.expiresAt=Math.min(e.expiresAt,e.startsAt+48);stats.eventsPrepared++;
    return {kind:'event_prepared',text:hasLiving(w)?`reserved ${e.quantity} ${e.item}; meet at the green at tick ${e.startsAt}, with a four-hour attendance window.`:`reserved ${e.quantity} ${e.item}; meet at the green in one hour, with a four-hour attendance window.`,extra:{eventId:e.id,item:e.item,reserved:e.reserved,startsAt:e.startsAt,expiresAt:e.expiresAt}};
  }
  if(e.hostId===a.id||t.customerId!==e.hostId||t.item!=='none'||t.price!==e.price||e.status!=='prepared'||w.tick<e.startsAt||a.coins<e.price)return fail('copy a prepared event and its host/ticket price, wait for its window, and carry enough coins.');
  if(hasLiving(w)&&e.rsvpId!==a.id)return fail('RSVP to this event before joining.');
  const host=person(w,e.hostId);
  if(Math.abs(host.x-8)+Math.abs(host.y-12)>1||Math.abs(a.x-8)+Math.abs(a.y-12)>1||!ready(w,a)||!ready(w,host))return fail('both participants must be at the green and four hours since their last leisure.');
  if(e.reserved!==e.quantity)return fail('event supplies are unavailable.');
  if(e.item==='meal'&&(a.hunger<40||host.hunger<40))return fail('a shared meal needs both participants hungry enough (40); no food or payment spent.');
  if(e.item==='meal') {
    for(const participant of [a,host]){participant.hunger=Math.max(0,participant.hunger-40);participant.stats.ate++;activity(w,participant,'event_meal',{connection:12,enjoyment:8,partner:participant===a?host.id:a.id});}
    stats.eventMealsConsumed+=2;w.village.stats.sharedMeals++;
  } else {
    for(const participant of [a,host]) {
      const base=hobbyBase(w,participant,e.interest)-(participant.inventory.leisure_kit?8:0)+8;
      activity(w,participant,'event_'+e.interest,{connection:12,enjoyment:base,partner:participant===a?host.id:a.id});
      participant.personal.leisureCount++;w.life.stats.hobbiesEnjoyed++;
    }
    stats.eventKitsConsumed++;w.life.stats.kitsUsed++;
  }
  for(const participant of [a,host]){participant.personal.lastLeisureAt=w.tick;participant.energy=Math.min(100,participant.energy+3);}
  a.coins-=e.price;host.coins+=e.price;
  if(e.price){a.economicStats.bought++;a.economicStats.spent+=e.price;host.economicStats.sold++;host.economicStats.earned+=e.price;w.economy.stats.coinsTraded+=e.price;w.economy.stats.trades++;stats.eventTicketsPaid++;stats.eventCoinsTransferred+=e.price;}
  host.eventsHosted++;stats.eventsHeld++;w.community.stats.sharedExperiences++;
  removeEvent(w,e,false);
  return {kind:'event_held',text:`joined ${host.name} for ${e.interest}; consumed prepared supplies and paid ${e.price} coins after both participated.`,extra:{eventId:e.id,targetId:host.id,item:e.item,quantity:e.quantity,price:e.price}};
}
export function eventObservation(w,a,o) {
  const entries=structuredClone(w.planning.sharedEvents.entries),choices=[];
  const own=entries.find(e=>e.hostId===a.id);
  if(!own) {
    choices.push({choice:planChoice('host_event',a.personal.interest,'leisure_kit',1),effect:'Announce a shared activity before acquiring supplies. Prepare one kit and meet a willing guest. One-coin ticket pays only after participation; both gain connection. A public announcement is not a funded purchase order.'});
    choices.push({choice:planChoice('host_event','square','meal',1),effect:'Announce a shared meal, acquire and reserve two cooked meals, then meet a willing hungry guest. Both must have hunger40; one-coin ticket paid only when both eat.'});
  } else if(own.status==='announced') {
    if(a.inventory[own.item]>=own.quantity)choices.push({choice:planChoice('prepare_event','square',own.item,0,own.id),effect:`Reserve ${own.quantity} carried ${own.item}; own hobbies cannot consume those reserved supplies. No automatic purchases.`});
    else {
      if(!w.community.jobs.some(j=>j.buyerId===a.id)&&a.coins>=2)choices.push({choice:planChoice('post_order','square',own.item,1),effect:`Explicitly reserve two coins for two ${own.item} to supply the announced event. A worker must accept and deliver; you prepare the event separately.`});
      if(own.item==='leisure_kit'&&a.inventory.wood&&a.energy>=5)choices.push({choice:planChoice('craft_kit','square','leisure_kit'),effect:'Make one kit from one wood for the announced event; prepare it before another hobby consumes it.'});
      if(own.item==='meal'&&o.currentFacts.foodRunway.cookingInputsReady)choices.push({choice:planChoice('cook','hearth'),effect:'Cook real meals for the announced shared meal, then reserve two using prepare_event.'});
    }
  } else choices.push({choice:planChoice('wait','square'),effect:`Stay at the green for event #${own.id}. Guests choose whether to attend; no guaranteed fee. For meals both need hunger40, and all events need four hours since leisure.`});
  for(const e of entries)if(e.hostId!==a.id&&e.status==='prepared'&&a.coins>=e.price&&ready(w,a)&&(e.item!=='meal'||a.hunger>=40))choices.push({choice:planChoice('join_event',e.hostId,'none',e.price,e.id),effect:`Meet ${e.host} for ${e.interest}, tick ${e.startsAt}–${e.expiresAt}; requires both present and leisure-ready${e.item==='meal'?', both hunger40':''}. Pay ${e.price} coins only on success. Connection gain12 each before repetition/cap; actual gains depend on timing.`});
  o.planning.choiceGroups.sharedEvents=choices;
  o.sharedEvents={version:1,entries,guidance:'Only announced/prepared events are public intentions. Ticket terms and recipe are public, not private bags, wallets or readiness. A host may leave; no payment or benefit is guaranteed. Prepared supplies refund once on cancellation/expiry.'};
  o.actions.sharedEvents='host_event music/games/walking item leisure_kit or square item meal, ticket price0–12, offerId0; one announcement per host, expires24h. prepare_event square/exact supply item/price0/eventId escrows one kit or two meals, starts+1h, attendance window4h. join_event hostId/item none/exact ticket price/eventId walks to green and takes six work ticks. Both must be present and four hours since leisure; shared meal also needs hunger40 each. Success consumes reserved supplies, transfers ticket fee, and gives both connection12 plus enjoyment before repetition/cap. Prepared kit supplies the bonus to both; no extra carried kits consumed. cancel_event square/none/price0/own eventId refunds once, as does expiry. There is no auto-purchase, forced attendance, minted money or trust score.';
  o.actions.planning+=' With shared events enabled, set_goal shared_event records a private goal to host one event with a consenting guest.';
  return o;
}
