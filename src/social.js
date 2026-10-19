const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const SOCIAL_EVENTS = new Set(['talk', 'give', 'steal', 'share', 'take', 'gather', 'cook', 'trade', 'offer', 'craft']);
const profile = (other, tick) => ({ id: other.id, name: other.name, firstSeenTick: tick, lastSeenTick: tick,
  heardMessages: 0, conversationsStarted: 0, giftsReceived: 0, giftsGiven: 0, theftsSuffered: 0,
  theftsWitnessed: 0, firstWords: null, lastWords: null, recentEvents: [] });

// Personal observations only. No automatic trust score or access to another resident's mind/bag.
export function noticePeople(w) {
  for (const a of w.agents) for (const b of w.agents) {
    if (a === b || distance(a, b) > 4) continue;
    a.relationships[b.id] ||= profile(b, w.tick);
    a.relationships[b.id].lastSeenTick = w.tick;
  }
}

export function rememberEncounter(w, witness, event) {
  if (!SOCIAL_EVENTS.has(event.kind)) return;
  const otherId = event.actorId === witness.id ? event.targetId : event.actorId;
  const other = w.agents.find(a => a.id === otherId && a.id !== witness.id);
  if (!other) return;
  const p = witness.relationships[other.id] ||= profile(other, w.tick);
  p.lastSeenTick = w.tick;
  p.recentEvents = [...p.recentEvents, { tick: event.tick, kind: event.kind, actorId: event.actorId,
    targetId: event.targetId || null, text: event.text }].slice(-4);
  if (event.kind === 'talk') {
    if (event.actorId !== witness.id) {
      p.heardMessages++;
      p.firstWords ||= { tick: event.tick, text: event.text };
      p.lastWords = { tick: event.tick, text: event.text };
    } else p.conversationsStarted++;
  }
  if (event.kind === 'give') {
    if (event.targetId === witness.id) p.giftsReceived++;
    if (event.actorId === witness.id) p.giftsGiven++;
  }
  if (event.kind === 'steal' && event.success === true) {
    if (event.targetId === witness.id) p.theftsSuffered++;
    if (event.actorId !== witness.id) p.theftsWitnessed++;
  }
}

export function socialObservation(w, a) {
  const people = structuredClone(a.relationships);
  for (const b of w.agents) if (b !== a && distance(a, b) <= 4) people[b.id] ||= profile(b, w.tick);
  return { phase: w.socialStart && w.tick < 24 ? 'arrival_among_strangers' : 'living_together',
    guidance: w.socialStart && w.tick < 24
      ? 'You have just arrived with five strangers. Who are they, what do they need, and can you rely on them? Consider introducing yourself, asking questions, listening and discussing how to live together. You may handle urgent needs first. Nobody has agreed to a group plan yet.'
      : 'Use your own encounters to decide whom to approach, trust, help, avoid or challenge. Discuss plans and judge them against what you actually witness. Cooperation, competition and changing your mind are all possible.',
    memoryRule: 'This notebook contains only your own encounters. First words, most recent words and counters persist across days; the four latest observed events per person are kept. Statements are claims, not proof. There is no preset trust score. Others cannot see this notebook.',
    people: Object.values(people) };
}
