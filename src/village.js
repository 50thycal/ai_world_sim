import { AGENCY_VERSION, PLANNING_VERSION, EVENT_VERSION } from './treatments.js';
import { COMMUNITY_VERSION, hasCommunity, activity } from './community.js';
import { COORDINATION_VERSION, hasCoordination } from './coordination.js';
import { LIFE_VERSION } from './life.js';
// Versioned cooperative economy. All transfers and benefits are physical engine outcomes.
export const VILLAGE_VERSION = 'world-v6';
export const hasVillage = w => [VILLAGE_VERSION,LIFE_VERSION,COORDINATION_VERSION,COMMUNITY_VERSION,AGENCY_VERSION,PLANNING_VERSION,EVENT_VERSION].includes(w.version) && w.village?.version === 1;
export const VILLAGE_ITEMS = ['bed', 'furnishing'];
export const VILLAGE_ACTIONS = ['request', 'request_cooking', 'fulfill', 'fulfill_cooking', 'cancel_request',
  'contribute', 'build', 'request_work', 'fulfill_work', 'craft_bed', 'craft_furnishing', 'furnish', 'socialize', 'host_meal', 'attend'];
export const PROJECTS = {
  stove: { name: 'Efficient communal stove', site: 'hearth', woodNeeded: 6, workNeeded: 12, benefit: 'Every second cooking batch uses no wood.' },
  orchard_upgrade: { name: 'Orchard improvements', site: 'orchard', woodNeeded: 8, workNeeded: 12, benefit: 'Food regeneration rises from 12 to 18 units per day, including at zero.' },
  workshop: { name: 'Village workshop', site: 'square', woodNeeded: 6, workNeeded: 12, benefit: 'Non-specialist tool recipes use 1 wood instead of 2; home goods cost 1 less wood, minimum 1.' },
};
const clone = x => structuredClone(x);
const fail = text => ({ text: `could not complete village action: ${text}`, failed: true });
export function addVillage(w) {
  w.village = { version: 1, nextId: 1, requests: [], gatherings: [], exchanges: [], stoveCredit: false,
    projects: Object.fromEntries(Object.entries(PROJECTS).map(([id, p]) => [id, { ...p, id, wood: 0, work: 0, completedAt: null }])),
    stats: { requestsPosted: 0, requestsFilled: 0, requestsExpired: 0, cookingServices: 0, workContracts: 0,
      projectContributions: 0, projectWork: 0, projectsCompleted: 0, homeGoodsCrafted: 0, homesImproved: 0, socialVisits: 0, sharedMeals: 0, fuelSaved: 0 } };
  for (const a of w.agents) {
    a.inventory.bed = 0; a.inventory.furnishing = 0;
    a.home = { bed: false, furnishing: false }; a.satisfaction = 65;
  }
}
export const cookingWood = w => hasVillage(w) && w.village.stoveCredit ? 0 : 1;
export function spendCookingFuel(w) {
  if (!hasVillage(w) || w.village.projects.stove.completedAt === null) return;
  if (w.village.stoveCredit) w.village.stats.fuelSaved++;
  w.village.stoveCredit = !w.village.stoveCredit;
}
export const homeCost = (w, a, item) => Math.max(1, (item === 'bed' ? 3 : 2) - (a.profession === 'craftsperson' ? 1 : 0) - (hasVillage(w) && w.village.projects.workshop.completedAt !== null ? 1 : 0));
export const villageSite = (w, d) => ['contribute', 'build', 'request_work', 'fulfill_work'].includes(d.action)
  ? w.village.projects[d.target]?.site : d.action === 'fulfill_cooking' ? 'hearth' : d.action === 'furnish' ? 'shelter' : 'square';
export function villagePlanProblem(w, a, d) {
  if (!VILLAGE_ACTIONS.includes(d.action)) return null;
  const project = w.village.projects[d.target];
  if (['request', 'request_cooking', 'request_work'].includes(d.action)) {
    if (d.offerId !== 0) return 'new requests use offerId 0';
    if (d.action === 'request' && (!['meal','raw','wood','tool',...VILLAGE_ITEMS].includes(d.item) || d.price < 1)) return 'request needs an item and price 1–12';
    if (d.action === 'request_cooking' && d.item !== 'meal') return 'request_cooking uses item meal';
    if (d.action === 'request_work' && (!project || d.item !== 'none' || d.price < 1)) return 'request_work needs a project target, item none and price 1–12';
  } else if (['fulfill', 'fulfill_cooking', 'fulfill_work', 'cancel_request', 'attend'].includes(d.action)) {
    if (d.offerId < 1) return 'copy the exact public offerId';
    if (d.action === 'cancel_request' && (d.price !== 0 || d.item !== 'none')) return 'cancel_request uses item none and price 0';
    if (d.action === 'attend' && (d.item !== 'meal' || d.price !== 0)) return 'attend uses item meal and price 0';
    if (d.action === 'fulfill_work' && (!project || d.item !== 'none')) return 'fulfill_work needs the exact project target and item none';
    if (['fulfill', 'fulfill_cooking', 'attend'].includes(d.action) && !w.agents.some(b => b.id === d.target && b.id !== a.id)) return 'target the other resident id';
  } else {
    if (d.price !== 0 || d.offerId !== 0) return 'non-contract actions use price 0 and offerId 0';
    if (['contribute', 'build'].includes(d.action) && (!project || d.item !== (d.action === 'contribute' ? 'wood' : 'none'))) return 'choose a project; contribute item wood or build item none';
    if (d.action.startsWith('craft_') && d.item !== d.action.slice(6)) return 'craft_bed uses item bed; craft_furnishing uses item furnishing';
    if (d.action === 'furnish' && !VILLAGE_ITEMS.includes(d.item)) return 'furnish needs item bed or furnishing';
    if (d.action === 'host_meal' && d.item !== 'meal') return 'host_meal uses item meal';
    if (d.action === 'socialize' && d.item !== 'none') return 'socialize uses item none';
  }
  return null;
}
function projectWork(w, a, p) {
  if (p.completedAt !== null || p.wood < p.woodNeeded || a.energy < 5) return null;
  const units = Math.min(a.profession === 'craftsperson' ? 3 : 2, p.workNeeded - p.work);
  p.work += units; a.energy -= 4; w.village.stats.projectWork += units;
  if (p.work >= p.workNeeded) {
    p.completedAt = w.tick; w.village.stats.projectsCompleted++;
    if (p.id === 'orchard_upgrade') { w.scenario.regrow.food = 0.75; w.scenario.summary += ' Completed orchard improvements now raise food regeneration to 18 units per day (0.75 per hour); fuel still regenerates at 12 per day.'; }
  }
  return units;
}
function exchange(w, a, r, extra) {
  const owner = w.agents.find(b => b.id === r.ownerId);
  a.coins += r.price; a.economicStats.earned += r.price; owner.economicStats.spent += r.price;
  w.village.requests = w.village.requests.filter(x => x.id !== r.id); w.village.stats.requestsFilled++;
  w.economy.stats.coinsTraded += r.price;
  const e = { tick: w.tick, actorId: a.id, targetId: owner.id, offerId: r.id, price: r.price, requestType: r.type, ...extra };
  w.village.exchanges = [...w.village.exchanges, e].slice(-24);
  return { owner, extra: { ...e, success: true } };
}
function refund(w, r) {
  const a = w.agents.find(b => b.id === r.ownerId); a.coins += r.price;
  for (const [item, count] of Object.entries(r.escrow)) a.inventory[item] += count;
}
export function expireVillage(w, emit) {
  if (!hasVillage(w)) return;
  for (const r of [...w.village.requests]) if (r.expiresAt <= w.tick) {
    refund(w, r); w.village.requests = w.village.requests.filter(x => x.id !== r.id); w.village.stats.requestsExpired++;
    emit(w.agents.find(a => a.id === r.ownerId), `Request #${r.id} expired; reserved coins and supplies returned.`, 'request_expired', { offerId: r.id });
  }
  for (const g of [...w.village.gatherings]) if (g.expiresAt <= w.tick) {
    const host = w.agents.find(a => a.id === g.hostId); host.inventory.meal++;
    w.village.gatherings = w.village.gatherings.filter(x => x.id !== g.id);
    emit(host, `Shared meal #${g.id} ended; its uneaten meal returned.`, 'gathering_expired', { offerId: g.id });
  }
}
export function completeVillageAction(w, a, t, yieldMeals) {
  const v = w.village;
  if (['request', 'request_cooking', 'request_work'].includes(t.action)) {
    if (v.requests.some(r => r.ownerId === a.id)) return fail('one open request per resident; cancel it first.');
    if (a.coins < t.price) return fail('not enough coins to fund this request.');
    const escrow = t.action === 'request_cooking' ? { raw: 1, wood: 1 } : {};
    if (Object.entries(escrow).some(([item,n]) => a.inventory[item] < n)) return fail('cooking request needs one raw and one wood in reserve.');
    const p = v.projects[t.projectId];
    if (t.action === 'request_work' && (p.completedAt !== null || p.wood < p.woodNeeded)) return fail('project must be supplied and unfinished before hiring labor.');
    a.coins -= t.price; for (const [item,n] of Object.entries(escrow)) a.inventory[item] -= n;
    const r = { id: v.nextId++, ownerId: a.id, owner: a.name, type: t.action, item: t.item, price: t.price,
      projectId: t.action === 'request_work' ? t.projectId : null, escrow, postedAt: w.tick, expiresAt: w.tick + 288 };
    v.requests.push(r); v.stats.requestsPosted++;
    return { kind: 'request_posted', text: `posted ${r.type} #${r.id}: ${r.projectId || r.item}, ${r.price} coins reserved.`, extra: { ...r } };
  }
  if (t.action === 'cancel_request') {
    const r = v.requests.find(r => r.id === t.offerId && r.ownerId === a.id);
    if (!r) return fail('request ended or belongs to someone else.');
    refund(w, r); v.requests = v.requests.filter(x => x.id !== r.id);
    return { text: `cancelled request #${r.id}; reserved supplies and coins returned.`, extra: { offerId: r.id } };
  }
  if (['fulfill', 'fulfill_cooking', 'fulfill_work'].includes(t.action)) {
    const r = v.requests.find(r => r.id === t.offerId), expected = { fulfill: 'request', fulfill_cooking: 'request_cooking', fulfill_work: 'request_work' }[t.action];
    if (!r || r.type !== expected || r.ownerId === a.id || r.price !== t.price || r.item !== t.item ||
      (t.action === 'fulfill_work' ? r.projectId !== t.projectId : r.ownerId !== t.customerId)) return fail('the exact request is unavailable.');
    const owner = w.agents.find(b => b.id === r.ownerId); let extra;
    if (t.action === 'fulfill') {
      if (!a.inventory[r.item]) return fail('missing the requested good.');
      a.inventory[r.item]--; owner.inventory[r.item]++;
      extra = { item: r.item, quantity: 1 };
    } else if (t.action === 'fulfill_cooking') {
      if (a.energy < 5) return fail('cooking needs energy.');
      // Service inputs are reserved by its requester. A free barter splits the output;
      // a paid service returns all meals. The stove returns an unused fuel unit to its owner.
      const wood = cookingWood(w); if (!wood) owner.inventory.wood++;
      const delivered = r.price === 0 ? (hasCoordination(w) ? Math.floor(yieldMeals/2) : 1) : yieldMeals;
      owner.inventory.meal += delivered; a.inventory.meal += yieldMeals - delivered;
      spendCookingFuel(w); a.energy -= 4; a.stats.cooked += yieldMeals; w.mealsCooked += yieldMeals; a.skills.cook++;
      v.stats.cookingServices++; extra = { item: 'meal', mealsProduced: yieldMeals, mealsDelivered: delivered, mealsKept: yieldMeals - delivered, woodSpent: wood, rawSpent: 1 };
    } else {
      const units = projectWork(w, a, v.projects[r.projectId]);
      if (units === null) return fail('project no longer needs work, lacks materials, or needs energy.');
      v.stats.workContracts++; extra = { projectId: r.projectId, work: units, completed: v.projects[r.projectId].completedAt !== null };
    }
    const settled = exchange(w, a, r, extra);
    return { kind: t.action === 'fulfill_cooking' ? 'cooking_service' : t.action === 'fulfill_work' ? 'work_contract' : 'request_filled',
      text: `fulfilled ${owner.name}'s ${r.type} #${r.id} for ${r.price} coins${r.price === 0 && r.type === 'request_cooking' ? ' and a share of the cooked meals' : ''}.`, extra: settled.extra };
  }
  if (t.action === 'contribute') {
    const p = v.projects[t.projectId];
    if (p.completedAt !== null || p.wood >= p.woodNeeded || !a.inventory.wood) return fail('project already supplied, finished, or missing carried wood.');
    a.inventory.wood--; p.wood++; v.stats.projectContributions++;
    return { text: `contributed 1 wood to ${p.name} (${p.wood}/${p.woodNeeded}).`, extra: { projectId: p.id, woodSpent: 1 } };
  }
  if (t.action === 'build') {
    const p = v.projects[t.projectId], units = projectWork(w, a, p);
    if (units === null) return fail('project needs all materials first, energy, and unfinished work.');
    return { kind: p.completedAt !== null ? 'project_completed' : 'project_work', text: `worked on ${p.name} (${p.work}/${p.workNeeded})${p.completedAt !== null ? '; now complete: ' + p.benefit : ''}.`, extra: { projectId: p.id, work: units, completed: p.completedAt !== null } };
  }
  if (t.action.startsWith('craft_')) {
    const cost = homeCost(w, a, t.item);
    if (a.inventory.wood < cost || a.energy < 5) return fail(`home goods need ${cost} wood and energy.`);
    a.inventory.wood -= cost; a.energy -= 4; a.inventory[t.item]++; a.skills.craftsperson++; v.stats.homeGoodsCrafted++;
    return { kind: 'home_crafted', text: `crafted a ${t.item} using ${cost} wood.`, extra: { item: t.item, woodSpent: cost } };
  }
  if (t.action === 'furnish') {
    if (a.home[t.item] || !a.inventory[t.item]) return fail('home already has this improvement or no carried item.');
    a.inventory[t.item]--; a.home[t.item] = true; if(!hasCommunity(w))a.satisfaction = Math.min(100, a.satisfaction + 15); v.stats.homesImproved++;
    return { kind: 'home_improved', text: `installed a ${t.item} at the lodge.`, extra: { item: t.item } };
  }
  if (t.action === 'socialize') {
    const partners = w.agents.filter(b => b.id !== a.id && Math.abs(b.x-a.x)+Math.abs(b.y-a.y) <= 2);
    if(hasCommunity(w))activity(w,a,'socialize',{connection:partners.length?6:1,enjoyment:3});else a.satisfaction = Math.min(100, a.satisfaction + (partners.length ? 15 : 5)); a.energy = Math.min(100, a.energy + 3); v.stats.socialVisits++;
    if (t.message) { a.lastMessage = t.message; a.lastMessageTick = w.tick; a.stats.talked++; }
    return { kind: 'socialize', text: `spent leisure time at the green${partners.length ? ' with ' + partners.map(b => b.name).join(', ') : ''}${t.message ? ': “' + t.message + '”' : '.'}`, extra: { participants: partners.map(b => b.id), spoken: Boolean(t.message) } };
  }
  if (t.action === 'host_meal') {
    if (!a.inventory.meal || v.gatherings.some(g => g.hostId === a.id)) return fail('needs one meal and no existing gathering.');
    a.inventory.meal--; const g = { id: v.nextId++, hostId: a.id, host: a.name, postedAt: w.tick, expiresAt: w.tick + 24 };
    v.gatherings.push(g); if(hasCommunity(w))activity(w,a,'host_meal',{enjoyment:4});else a.satisfaction = Math.min(100, a.satisfaction + 10);
    return { kind: 'gathering_posted', text: `invited a neighbor to shared meal #${g.id} at the green for two hours.`, extra: { ...g } };
  }
  if (t.action === 'attend') {
    const g = v.gatherings.find(g => g.id === t.offerId && g.hostId === t.customerId && g.hostId !== a.id);
    if (!g || a.hunger < 40) return fail('shared meal ended or hunger is below 40.');
    a.hunger = Math.max(0, a.hunger - 40); a.stats.ate++; if(hasCommunity(w))activity(w,a,'shared_meal',{connection:8,enjoyment:8});else a.satisfaction = Math.min(100, a.satisfaction + 20); v.stats.sharedMeals++;
    v.gatherings = v.gatherings.filter(x => x.id !== g.id);
    return { kind: 'shared_meal', text: `accepted ${g.host}'s shared meal at the green.`, extra: { targetId: g.hostId, offerId: g.id, item: 'meal' } };
  }
  return fail('unknown village action.');
}
export function villageMetrics(w) {
  if (!hasVillage(w)) return {};
  return { ...w.village.stats, requestsOpen: w.village.requests.length,
    coinsEscrowed: w.village.requests.reduce((n,r) => n + r.price, 0),
    averageSatisfaction: Math.round(w.agents.reduce((n,a) => n+a.satisfaction,0)/6),
    bedsInstalled: w.agents.filter(a => a.home.bed).length, furnishedHomes: w.agents.filter(a => a.home.furnishing).length };
}
export function villageObservation(w, a) {
  return { version: 1, requests: clone(w.village.requests), gatherings: clone(w.village.gatherings), projects: clone(w.village.projects),
    recentExchanges: clone(w.village.exchanges.slice(-6)), myHome: clone(a.home), satisfaction: a.satisfaction,
    tools: { equippedCharges: a.toolUses, spareTools: a.inventory.tool, totalChargesAvailable: a.toolUses + a.inventory.tool * 6,
      usable: a.toolUses > 0 || a.inventory.tool > 0,
      guidance: 'A spare tool automatically equips on the next successful harvest. Zero equipped charges does NOT mean no usable tools. Tools increase maximum harvest; they cannot harvest resources that have not regrown. Each tool competes with cooking for wood.' },
    recipes: { cooking: { raw: 1, woodNow: cookingWood(w), meals: a.profession === 'cook' ? 3 : 2 },
      bedWood: homeCost(w,a,'bed'), furnishingWood: homeCost(w,a,'furnishing') },
    rules: 'The public board shows funded needs, not private bags. Posting or fulfilling walks to the green; cooking services cook at the hearth. One request per resident, expires in 24 hours; reserved coins and inputs refund once on expiry or cancel_request (item none, price 0, offerId your request). ' +
      'request: target square, item desired good, price 1–12, offerId 0; reserves coins for ONE item. fulfill: target requester id, copy item/price/offerId exactly; deliver one carried good for their reserved coins. ' +
      'request_cooking: target square, item meal, offerId 0, reserves 1 raw+1 wood and price 0–12 coins. With price 0 the requester gets 1 meal and the cook keeps the remaining output; with a positive fee the requester gets ALL output. fulfill_cooking: target requester id, copy meal/price/offerId, cook their reserved supplies at hearth. No one promises future delivery: exchange completes only when work and supplies succeed. ' +
      'contribute: target stove, orchard_upgrade or workshop, item wood, price 0, offerId 0; deposit 1 wood. build: same project target, item none, price 0, offerId 0; after all materials arrive, add 2 work (craftsperson 3), costing 4 energy. request_work: project target, item none, price 1–12, offerId 0, reserves pay for ONE build action; fulfill_work copies exact project/item/price/offerId, performs work and earns the reserved pay. Completed project benefits apply to everyone. ' +
      'craft_bed (item bed) and craft_furnishing (item furnishing) at square use the listed wood cost and 4 energy; goods can be sold, requested, gifted or stolen. furnish at shelter uses one carried home good, once per type. Installed beds raise rest recovery from 5 to 7 per tick; furnishings reduce satisfaction decline from 0.06 to 0.03 per tick. Satisfaction is an optional quality-of-life goal, not health or trust. ' +
      'socialize at square, item none, gives 5 satisfaction alone or 15 with nearby people and 3 energy; message is spoken locally. host_meal at square, item meal, reserves 1 meal for two hours and gives host 10 satisfaction. attend: target host id, item meal, price 0, offerId exact gathering, requires hunger >=40; voluntarily eat the reserved meal (-40 hunger) and gain 20 satisfaction. One meal per invitation; expired uneaten meals return. ' +
      'All actions otherwise use price 0 and offerId 0. Stay fed; consider exchanging surplus, meeting public requests, building shared improvements, improving your home and enjoying time with neighbors. These are choices, not mandatory jobs; coins and satisfaction cannot prevent starvation.' };
}
