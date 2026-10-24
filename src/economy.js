import { LIVING_VERSION, hasLiving, AGENCY_VERSION, PLANNING_VERSION, EVENT_VERSION } from './treatments.js';
import { COMMUNITY_VERSION, hasCommunity } from './community.js';
import { COORDINATION_VERSION } from './coordination.js';
import { LIFE_VERSION, hasLife, lifeMetrics } from './life.js';
import { hasVillage, VILLAGE_VERSION, VILLAGE_ITEMS } from './village.js';
// The engine owns every coin, escrow item and outcome. No model text executes here.
export const ECONOMY_VERSION = 'world-v5';
export const hasEconomy = w => [ECONOMY_VERSION, VILLAGE_VERSION, LIFE_VERSION, COORDINATION_VERSION,COMMUNITY_VERSION,AGENCY_VERSION,PLANNING_VERSION,EVENT_VERSION,LIVING_VERSION].includes(w.version) && w.economy?.version === 1;
export const MARKET_ACTIONS = ['craft', 'offer', 'buy', 'cancel_offer'];
export const MARKET_ITEMS = ['meal', 'raw', 'wood', 'tool'];
const ROLES = ['grower', 'woodcutter', 'cook', 'craftsperson', 'grower', 'woodcutter'];
const copy = x => structuredClone(x);

export function addEconomy(w) {
  w.economy = { version: 1, nextOfferId: 1, offers: [], trades: [],
    rules: { initialCoins: 8, totalCoins: 48, maxPrice: 12, offerLifetimeTicks: 144,
      baseGather: 2, specialistGather: 3, toolBonus: 1, toolCharges: 6,
      baseCook: 2, specialistCook: 3, craftWood: 2, specialistCraftWood: 1, practiceThreshold: 6 },
    stats: { trades: 0, coinsTraded: 0, toolsCrafted: 0, toolsUsed: 0, offersPosted: 0, offersExpired: 0, offersCancelled: 0 } };
  for (const [i, a] of w.agents.entries()) {
    a.profession = ROLES[i]; a.coins = 8; a.inventory.tool = 0; a.toolUses = 0;
    a.skills = { grower: 0, woodcutter: 0, cook: 0, craftsperson: 0 };
    a.economicStats = { bought: 0, sold: 0, earned: 0, spent: 0, crafted: 0 };
  }
}

export const skillFor = (action, target) => action === 'gather' ? target === 'orchard' ? 'grower' : 'woodcutter'
  : action === 'cook' ? 'cook' : action === 'craft' ? 'craftsperson' : null;
export function practice(w, a, skill) { if (hasEconomy(w)) a.skills[skill]++; }
export function productionWork(w, a, action, target) {
  const skill = skillFor(action, target);
  return hasEconomy(w) && skill && a.skills[skill] >= w.economy.rules.practiceThreshold ? 2 : 3;
}
export function gatherYield(w, a, target) {
  if (!hasEconomy(w)) return 2;
  const r = w.economy.rules, specialist = a.profession === skillFor('gather', target);
  return (specialist ? r.specialistGather : r.baseGather) + (a.toolUses > 0 || a.inventory.tool > 0 ? r.toolBonus : 0);
}
export function useTool(w, a) {
  if (!hasEconomy(w)) return;
  if (a.toolUses === 0 && a.inventory.tool > 0) { a.inventory.tool--; a.toolUses = w.economy.rules.toolCharges; w.economy.stats.toolsUsed++; }
  if (a.toolUses > 0) a.toolUses--;
}
export const cookYield = (w, a) => hasEconomy(w) ? a.profession === 'cook' ? w.economy.rules.specialistCook : w.economy.rules.baseCook : 2;
export const craftCost = (w, a) => hasVillage(w) && w.village.projects.workshop.completedAt !== null ? 1 : a.profession === 'craftsperson' ? w.economy.rules.specialistCraftWood : w.economy.rules.craftWood;

export function economyObservation(w, a) {
  const r = w.economy.rules;
  return { version: 1, myProfession: a.profession, coins: a.coins, skills: copy(a.skills), toolUsesRemaining: a.toolUses,
    capabilities: { gatherOrchard: gatherYield(w, a, 'orchard'), gatherForest: gatherYield(w, a, 'forest'),
      cookMeals: cookYield(w, a), craftToolWoodCost: craftCost(w, a) },
    professions: w.agents.map(b => ({ id: b.id, name: b.name, profession: b.profession })),
    offers: copy(w.economy.offers.filter(o => o.expiresAt > w.tick)),
    recentTrades: copy(w.economy.trades.slice(-6)),
    rules: `The meeting green is a public market and workbench. Each resident started with ${r.initialCoins} coins; coins only transfer, never regenerate. ` +
      `Everyone can gather, cook and craft. Growers gather ${r.specialistGather} raw; woodcutters gather ${r.specialistGather} wood; others gather ${r.baseGather}. A cook makes ${r.specialistCook} meals per raw+wood; others make ${r.baseCook}. ` +
      `craft at square consumes ${r.craftWood} wood (${r.specialistCraftWood} for a craftsperson) and 4 energy for 1 unused tool. A tool automatically adds ${r.toolBonus} gathering yield for ${r.toolCharges} successful harvests, then wears out. Failed harvests use no tool charge. ` +
      `${r.practiceThreshold} successful jobs in a skill reduce its work time from 3 to 2 five-minute ticks; travel and hourly reviews still apply. ` +
      `offer at square lists ONE carried meal, raw, wood or unused tool for an integer price 1–${r.maxPrice}, with offerId 0. One live offer per resident; that item leaves your bag into escrow. It returns on cancellation or after ${r.offerLifetimeTicks * 5 / 60} hours. ` +
      `buy walks to square: target the seller's villager id, copy the listing's offerId, item and price exactly. If the offer still exists and you can afford it, the item and coins exchange atomically. You cannot buy your own offer. ` +
      `cancel_offer at square copies your own offerId; item none and price 0. Use price 0 and offerId 0 for all other actions. Listings and completed trades are public information; other wallets and bags remain private. ` +
      'Alongside staying fed, consider developing a useful livelihood, practicing skills and obtaining tools. Trade, gifts, self-reliance and leisure are your choices; coins do not replace food or prevent starvation.' };
}

export function marketPlanProblem(w, a, d) {
  if (hasVillage(w) && !MARKET_ACTIONS.includes(d.action)) return null;
  if (!MARKET_ACTIONS.includes(d.action)) return d.price !== 0 || d.offerId !== 0 ? 'price and offerId must be 0 outside market actions' : null;
  if (d.action === 'offer' && (![...MARKET_ITEMS, ...(hasVillage(w) ? VILLAGE_ITEMS : [])].includes(d.item) || d.price < 1 || d.offerId !== 0)) return 'offer needs a carried item, price 1–12 and offerId 0';
  if (d.action === 'buy' && (!w.agents.some(b => b.id === d.target && b.id !== a.id) || ![...MARKET_ITEMS, ...(hasVillage(w) ? VILLAGE_ITEMS : [])].includes(d.item) || d.offerId < 1 || d.price < 1)) return 'buy needs another seller, exact offerId, item and price';
  if (d.action === 'craft' && (d.item !== 'tool' || d.price !== 0 || d.offerId !== 0)) return 'craft needs item tool, price 0 and offerId 0';
  if (d.action === 'cancel_offer' && (d.item !== 'none' || d.price !== 0 || d.offerId < 1)) return 'cancel_offer needs your offerId, item none and price 0';
  return null;
}

export function expireOffers(w, emit) {
  if (!hasEconomy(w)) return;
  for (const o of [...w.economy.offers]) if (o.expiresAt <= w.tick) {
    const seller = w.agents.find(a => a.id === o.sellerId);
    seller.inventory[o.item]++; w.economy.offers = w.economy.offers.filter(x => x.id !== o.id);
    w.economy.stats.offersExpired++;
    emit(seller, `${seller.name}'s offer #${o.id} expired; the ${o.item} returned to their bag.`, 'offer_expired', { offerId: o.id, item: o.item });
  }
}

export function completeMarketAction(w, a, t) {
  const m = w.economy, r = m.rules, fail = text => ({ text, failed: true });
  if (t.action === 'craft') {
    const cost = craftCost(w, a);
    if (a.inventory.wood < cost || a.energy < 5) return fail(`could not craft: needs ${cost} wood and energy.`);
    a.inventory.wood -= cost; a.inventory.tool++; a.energy = Math.max(0, a.energy - 4);
    a.economicStats.crafted++; m.stats.toolsCrafted++; practice(w, a, 'craftsperson');
    return { text: `crafted a gathering tool using ${cost} wood.`, extra: { woodSpent: cost, item: 'tool' } };
  }
  if (t.action === 'offer') {
    if (m.offers.some(o => o.sellerId === a.id)) return fail('already has an offer; cancel it before listing another.');
    if (!a.inventory[t.item]) return fail(`had no ${t.item} to list for sale.`);
    const o = { id: m.nextOfferId++, sellerId: a.id, seller: a.name, item: t.item, price: t.price,
      postedAt: w.tick, expiresAt: w.tick + r.offerLifetimeTicks };
    a.inventory[t.item]--; m.offers.push(o); m.stats.offersPosted++;
    return { text: `listed 1 ${o.item} for ${o.price} coins at the market (offer #${o.id}).`, extra: { offerId: o.id, item: o.item, price: o.price } };
  }
  const o = m.offers.find(o => o.id === t.offerId);
  if (t.action === 'cancel_offer') {
    if (!o || o.sellerId !== a.id) return fail('could not cancel: that offer is not theirs or has ended.');
    a.inventory[o.item]++; m.offers = m.offers.filter(x => x.id !== o.id); m.stats.offersCancelled++;
    return { text: `cancelled offer #${o.id}; the ${o.item} returned to their bag.`, extra: { offerId: o.id, item: o.item } };
  }
  if (!o || o.sellerId !== t.sellerId || o.item !== t.item || o.price !== t.price) return fail('could not buy: the exact offer is no longer available.');
  if (o.sellerId === a.id || a.coins < o.price) return fail('could not buy: own offer or insufficient coins.');
  const seller = w.agents.find(b => b.id === o.sellerId);
  a.coins -= o.price; seller.coins += o.price; a.inventory[o.item]++;
  m.offers = m.offers.filter(x => x.id !== o.id); m.stats.trades++; m.stats.coinsTraded += o.price;
  a.economicStats.bought++; a.economicStats.spent += o.price; seller.economicStats.sold++; seller.economicStats.earned += o.price;
  const trade = { tick: w.tick, offerId: o.id, buyerId: a.id, sellerId: seller.id, item: o.item, price: o.price };
  m.trades = [...m.trades, trade].slice(-24);
  return { text: `bought 1 ${o.item} from ${seller.name} for ${o.price} coins.`, kind: 'trade', extra: { ...trade, targetId: seller.id, success: true } };
}

export function economyMetrics(w) {
  if (!hasEconomy(w)) return {};
  return { trades: w.economy.stats.trades, coinsTraded: w.economy.stats.coinsTraded,
    toolsCrafted: w.economy.stats.toolsCrafted, toolsUsed: w.economy.stats.toolsUsed,
    offersPosted: w.economy.stats.offersPosted, activeOffers: w.economy.offers.length,
    coins: w.agents.reduce((n, a) => n + a.coins, 0) + (hasVillage(w) ? w.village.requests.reduce((n,r) => n+r.price,0) : 0) + (hasLife(w) ? lifeMetrics(w).orderCoinsReserved + lifeMetrics(w).publicCoins : 0) + (hasCommunity(w) ? w.community.jobs.reduce((n,j)=>n+j.escrow,0) : 0) };
}
