import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const APP_VERSION = '0.2.1';
export const VERSION = 'world-v2';
export const isV2 = w => w.version === VERSION;
export const DECISION_INTERVAL = 12; // Five-minute ticks: one decision per villager per simulated hour.
export const MIN_EAT_HUNGER = 40;
export const decisionDue = w => isV2(w) && w.tick >= w.nextDecisionTick && w.tick < w.maxTicks;
export const routineOnly = w => isV2(w) && w.agents.every(a => !a.task || a.task.action === 'wait' ||
  (a.task.action === 'rest' && a.x === PLACES.shelter.x && a.y === PLACES.shelter.y));
export const PLACES = {
  orchard: { x: 3, y: 4, name: 'Wild orchard', kind: 'food' },
  forest: { x: 13, y: 3, name: 'Pine woods', kind: 'wood' },
  hearth: { x: 8, y: 8, name: 'Common hearth', kind: 'cook' },
  pantry: { x: 11, y: 10, name: 'Village pantry', kind: 'share' },
  shelter: { x: 4, y: 12, name: 'Sleeping lodge', kind: 'rest' },
  square: { x: 8, y: 12, name: 'Meeting green', kind: 'talk' },
};
export const ACTIONS = ['gather', 'cook', 'eat', 'rest', 'share', 'talk', 'wait', 'continue'];
export const DECISION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ACTIONS },
    target: { type: 'string', enum: [...Object.keys(PLACES), 'none'] },
    message: { type: 'string' }, reason: { type: 'string' },
  }, required: ['action', 'target', 'message', 'reason'],
};
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const clone = x => structuredClone(x);

export function newWorld(mode = 'demo', model = null) {
  if (!['demo', 'chatgpt'].includes(mode)) throw new Error('Unknown mode');
  return {
    version: VERSION, id: randomUUID(), created: new Date().toISOString(),
    mode, model, running: false, pauseReason: 'Ready for an owner to start', tick: 0,
    nextDecisionTick: 0, decisionRound: null, skippedTicks: 0,
    maxTicks: 288, maxCalls: 144, calls: 0, inputTokens: 0, outputTokens: 0,
    completedActions: 0, shares: 0, mealsCooked: 0,
    resources: { food: 70, wood: 50 }, pantry: 8,
    agents: ['Mira', 'Fen', 'Asha', 'Bolt', 'Luma', 'Reed'].map((name, i) => ({
      id: `v${i + 1}`, name, x: 6 + i % 3, y: 10 + Math.floor(i / 3),
      color: ['#e9ac75', '#80b7a3', '#be9cda', '#d9c76f', '#d58b9c', '#8ab9d4'][i],
      hunger: 22 + i * 3, energy: 85, health: 100,
      inventory: { raw: 1, wood: 0, meal: 1 }, task: null,
      lastReason: '', lastMessage: '', memories: [],
    })),
  };
}

export function validateDecision(d) {
  if (!d || Object.keys(d).sort().join(',') !== 'action,message,reason,target' ||
      !ACTIONS.includes(d.action) || ![...Object.keys(PLACES), 'none'].includes(d.target) ||
      typeof d.message !== 'string' || typeof d.reason !== 'string' ||
      d.message.length > 240 || d.reason.length > 500) throw new Error('Invalid villager decision');
  if (d.action === 'gather' && !['orchard', 'forest'].includes(d.target)) throw new Error('Choose a gathering site');
  return clone(d);
}

export function observation(w, a) {
  return {
    name: a.name, minute: w.tick * 5, day: Math.floor(w.tick / 288) + 1,
    position: { x: a.x, y: a.y }, hunger: a.hunger, energy: a.energy, health: a.health,
    ...(isV2(w) ? { currentTask: clone(a.task), nextReviewMinutes: 60, decisionNumber: Math.floor(w.tick / DECISION_INTERVAL) + 1 } : {}),
    inventory: clone(a.inventory), memories: a.memories.slice(-12), places: PLACES,
    nearbyVillagers: w.agents.filter(b => b.id !== a.id && dist(a, b) <= 4)
      .map(b => ({ id: b.id, name: b.name, x: b.x, y: b.y })),
    pantryMeals: dist(a, PLACES.pantry) <= 3 ? w.pantry : 'not currently visible',
    localResources: Object.fromEntries(['orchard', 'forest'].filter(p => dist(a, PLACES[p]) <= 3)
      .map(p => [p, w.resources[PLACES[p].kind]])),
    rules: (isV2(w) ? 'Hunger 0 means full; 100 means starving. Hunger rises 5.4 per hour. Eating is blocked below hunger 40 and does not consume food. A cooked meal reduces hunger by 40. You get one decision each hour, 24 per day. Choose continue to finish your current task, or choose a different action to change plans. Repeating the same action/target also continues existing work without resetting travel or progress. Finished work waits until the next hourly review. Rest at the lodge restores 5 energy per five-minute tick, up to 40 per rest, and stops early when full. ' : '') + 'Choose one action. gather at orchard gives raw food; forest gives wood. cook at hearth consumes 1 raw + 1 wood for 2 meals. eat uses your meal, then pantry if adjacent, then raw food. Raw food reduces hunger but costs health. rest restores energy at shelter. share at pantry deposits 1 meal. talk is heard within 4 tiles; square is a meeting place. Travel and work take time. No death in this pilot. Your goal is to live through the day; relationships and cooperation are your choices.',
  };
}

export function demoDecision(w, a) {
  let action, target = 'none', reason;
  if (isV2(w) && a.task) return { action: 'continue', target: 'none', reason: 'Finish my current work.', message: '' };
  if (a.hunger > 50 && (a.inventory.meal || w.pantry > 0)) {
    action = 'eat'; target = a.inventory.meal ? 'none' : 'pantry'; reason = 'Time for a meal.';
  } else if (a.energy < 35) { action = 'rest'; target = 'shelter'; reason = 'I need a good rest.';
  } else if (a.inventory.meal >= 3) { action = 'share'; target = 'pantry'; reason = 'I have a meal to spare.';
  } else if (a.inventory.raw && a.inventory.wood) { action = 'cook'; target = 'hearth'; reason = 'I can turn my ingredients into dinner.';
  } else if (a.inventory.raw && !a.inventory.wood) { action = 'gather'; target = 'forest'; reason = 'The hearth needs fuel.';
  } else if ((w.tick + Number(a.id.slice(1))) % 7 === 0) { action = 'talk'; target = 'square'; reason = 'I will check in with the village.';
  } else { action = 'gather'; target = 'orchard'; reason = 'I should gather ingredients.'; }
  return { action, target, reason, message: action === 'talk' ? 'How is everyone getting on with dinner?' : '' };
}

export function assign(w, a, decision) {
  const d = validateDecision(decision);
  const required = { cook: 'hearth', share: 'pantry', rest: 'shelter' };
  const target = required[d.action] || (d.target === 'none' ? null : d.target);
  a.lastReason = d.reason;
  if (isV2(w) && d.action === 'continue') {
    if (!a.task) a.task = { ...d, action: 'wait', target: null, work: 1 };
    return;
  }
  if (isV2(w) && a.task?.action === d.action && a.task.target === target) {
    a.task.reason = d.reason; a.task.message = d.message; return;
  }
  a.task = { ...d, target, work: d.action === 'rest' ? 8 : 3 };
}

export function advance(w) {
  const events = [];
  const event = (a, text, kind = 'action') => {
    const e = { tick: w.tick, kind, actor: a.name, actorId: a.id, x: a.x, y: a.y, text };
    events.push(e);
    for (const b of w.agents) if (dist(a, b) <= 4) {
      b.memories.push({ tick: w.tick, text }); b.memories = b.memories.slice(-24);
    }
  };
  // Rotate the resolution order rather than always favoring the first villager.
  const agents = [...w.agents.slice(w.tick % 6), ...w.agents.slice(0, w.tick % 6)];
  for (const a of agents) {
    a.hunger = Math.min(100, a.hunger + 0.45);
    if (a.hunger >= 95) a.health = Math.max(1, a.health - 0.2);
    if (!a.task) continue;
    const t = a.task, goal = t.target ? PLACES[t.target] : a;
    if (dist(a, goal)) {
      if (a.x !== goal.x) a.x += Math.sign(goal.x - a.x); else a.y += Math.sign(goal.y - a.y);
      a.energy = Math.max(0, a.energy - 0.3); continue;
    }
    if (isV2(w) && t.action === 'rest') {
      a.energy = Math.min(100, a.energy + 5);
      if (a.energy === 100) t.work = 1;
    }
    if (--t.work > 0) continue;
    let text, failed = false;
    const bag = a.inventory;
    switch (t.action) {
      case 'gather': {
        const key = PLACES[t.target].kind, item = key === 'food' ? 'raw' : 'wood';
        if (!w.resources[key] || a.energy < 5) { text = 'could not gather: exhausted or resource depleted.'; failed = true; break; }
        const count = Math.min(2, w.resources[key]); w.resources[key] -= count; bag[item] += count;
        a.energy = Math.max(0, a.energy - 6); text = `gathered ${count} ${item === 'raw' ? 'ingredients' : 'wood'}.`; break;
      }
      case 'cook':
        if (!bag.raw || !bag.wood || a.energy < 5) { text = 'could not cook: needs ingredients, wood and energy.'; failed = true; break; }
        bag.raw--; bag.wood--; bag.meal += 2; a.energy = Math.max(0, a.energy - 4);
        w.mealsCooked += 2; text = 'cooked two safe meals at the hearth.'; break;
      case 'eat':
        if (isV2(w) && a.hunger < MIN_EAT_HUNGER) { text = 'was not hungry enough to eat (needs hunger 40); food was saved.'; failed = true; break; }
        if (bag.meal) { bag.meal--; a.hunger = Math.max(0, a.hunger - 40); text = 'ate a cooked meal.'; }
        else if (dist(a, PLACES.pantry) <= 1 && w.pantry) { w.pantry--; a.hunger = Math.max(0, a.hunger - 40); text = 'ate a meal from the pantry.'; }
        else if (bag.raw) { bag.raw--; a.hunger = Math.max(0, a.hunger - 15); a.health = Math.max(1, a.health - 8); text = 'ate raw food and lost health.'; }
        else { text = 'could not eat: no food within reach.'; failed = true; } break;
      case 'rest': if (!isV2(w)) a.energy = Math.min(100, a.energy + 40); text = 'rested at the sleeping lodge.'; break;
      case 'share':
        if (!bag.meal) { text = 'had no cooked meal to share.'; failed = true; break; }
        bag.meal--; w.pantry++; w.shares++; text = 'left a meal in the common pantry.'; break;
      case 'talk': a.lastMessage = t.message || 'Hello, neighbors.'; text = `said: “${a.lastMessage}”`; break;
      default: text = 'waited and watched the village.';
    }
    a.task = null; w.completedActions++; event(a, `${a.name} ${text}`, failed ? 'blocked' : t.action);
  }
  w.tick++;
  if (w.tick >= w.maxTicks) { w.running = false; w.pauseReason = 'One-day pilot complete'; }
  return events;
}

export class WorldStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, run TEXT NOT NULL, tick INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_run ON records(run,id);
      CREATE TABLE IF NOT EXISTS frames (id INTEGER PRIMARY KEY, run TEXT NOT NULL, tick INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS frames_run ON frames(run,id);`);
    const row = this.db.prepare('SELECT state FROM worlds ORDER BY updated DESC LIMIT 1').get();
    this.world = row ? JSON.parse(row.state) : newWorld();
    const wasRunning = this.world.running;
    this.world.running = false;
    if (row && wasRunning) this.world.pauseReason = 'Server restarted; resume when ready';
    // Earlier releases replaced terminal pause labels during shutdown. Recover the recorded reason.
    if (row && !wasRunning && this.world.pauseReason === 'Server stopped') {
      const failure = this.db.prepare("SELECT data FROM records WHERE run=? AND kind='failure' ORDER BY id DESC LIMIT 1").get(this.world.id);
      const last = failure ? JSON.parse(failure.data) : null;
      if (last?.tick === this.world.tick && typeof last.text === 'string') this.world.pauseReason = last.text;
    }
    this.save();
  }
  save(events = [], frame = false) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR REPLACE INTO worlds VALUES (?,?,?)').run(this.world.id, JSON.stringify(this.world), new Date().toISOString());
      const insert = this.db.prepare('INSERT INTO records(run,tick,kind,data) VALUES (?,?,?,?)');
      for (const e of events) insert.run(this.world.id, this.world.tick, e.kind, JSON.stringify(e));
      if (frame) this.db.prepare('INSERT INTO frames(run,tick,state) VALUES (?,?,?)').run(this.world.id, this.world.tick, JSON.stringify(this.world));
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  reset(mode, model) {
    if (this.db.prepare('SELECT count(*) n FROM worlds').get().n >= 20) throw new Error('20 saved runs retained. Export and archive before starting more.');
    this.world = newWorld(mode, model); this.save([], true);
  }
  records(limit = 100) {
    return this.db.prepare('SELECT data FROM records WHERE run=? ORDER BY id DESC LIMIT ?').all(this.world.id, limit).reverse().map(r => JSON.parse(r.data));
  }
  frames() { return this.db.prepare('SELECT id,tick FROM frames WHERE run=? ORDER BY id').all(this.world.id); }
  frame(id) { const r = this.db.prepare('SELECT state FROM frames WHERE run=? AND id=?').get(this.world.id, id); return r ? JSON.parse(r.state) : null; }
  export() {
    return { format: 'ai-world-run-v1', world: clone(this.world), records: this.db.prepare('SELECT data FROM records WHERE run=? ORDER BY id').all(this.world.id).map(r => JSON.parse(r.data)) };
  }
  close() { this.db.close(); }
}
