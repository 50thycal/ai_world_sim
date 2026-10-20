const $ = id => document.getElementById(id);
let current, displayed, previous, receivedAt = 0, selected = 'v1', showLabels = true, replay = false, frames = [], owner = false, polling = false, defaultsApplied = false;
const canvas = $('village'), ctx = canvas.getContext('2d');
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = tick => `${String(Math.floor(tick * 5 / 60) % 24).padStart(2, '0')}:${String(tick * 5 % 60).padStart(2, '0')}`;
const hourlyRun = w => ['world-v2', 'world-v3', 'world-v4', 'world-v5', 'world-v6', 'world-v7', 'world-v8'].includes(w?.version);
const VERBS = { shop_buy:'Collecting a shop purchase',sponsor:'Funding and voting', open_shop:'Opening a business', stock_shop:'Stocking the shop', order:'Placing a standing order', deliver:'Delivering an order', hobby:'Enjoying a hobby', invite:'Planning an activity', accept_invite:'Joining a neighbor', propose:'Making a proposal', fund:'Funding a service', civic_work:'Building a public service', maintain:'Maintaining a service', recover:'Visiting the clinic', gather: 'Gathering', give: 'Giving', steal: 'Stealing', take: 'Taking', talk: 'Talking', craft: 'Making tools', offer: 'Listing goods', buy: 'Shopping', cancel_offer: 'Collecting goods', request: 'Posting a need', fulfill: 'Making a delivery', request_cooking: 'Hiring a cook', fulfill_cooking: 'Cooking for a neighbor', contribute: 'Supplying a project', build: 'Building', request_work: 'Hiring help', fulfill_work: 'Working for a neighbor', craft_bed: 'Making a bed', craft_furnishing: 'Making furnishings', furnish: 'Improving a home', socialize: 'At the green', host_meal: 'Hosting a meal', attend: 'Sharing a meal', invalid: 'Confused' };
const ICONS = { give: '🎁', steal: '✋', take: '🥣', talk: '💬', craft: '🛠', offer: '🏷', trade: '🤝', offer_expired: '↩' };
const DILEMMAS = ['shop_purchase','sponsored_vote','delivery','shop_opened','order_placed','shared_activity','invitation','invitation_declined','proposal','vote','proposal_passed','proposal_rejected','civic_completed','maintenance','recovery','give', 'steal', 'take', 'share', 'blocked', 'failure', 'offer', 'trade', 'cancel_offer', 'offer_expired', 'craft', 'request_posted', 'request_filled', 'cooking_service', 'work_contract', 'project_work', 'project_completed', 'home_improved', 'socialize', 'shared_meal', 'gathering_posted'];
const professionName = role => ({ grower: 'Grower', woodcutter: 'Woodcutter', cook: 'Cook', craftsperson: 'Craftsperson' }[role] || role);
// Static copy keyed by scenario id; never interpolates run data into HTML.
const QUESTIONS = { sustainable: 'Who keeps supplies<br>moving?<br>Can cooperation<br>last ten days?', plenty: 'Who gathers?<br>Who cooks?<br>Who leaves a little<br>for someone else?', commons: 'Who holds back?<br>Who strips the trees?<br>Does anyone<br>say “enough”?', inequality: 'Do the haves<br>share?<br>Do the have-nots<br>ask, or take?' };
let journalFilter = 'all';
const nameOf = (w, id) => w.agents.find(b => b.id === id)?.name || id;
const active = a => a.task ? `${VERBS[a.task.action] || a.task.action[0].toUpperCase() + a.task.action.slice(1)}${a.task.target ? ' · ' + nameOf(displayed.world, a.task.target) : ''}` : hourlyRun(displayed?.world) ? 'Between hourly decisions' : 'Considering the day';
const speaking = (w, a) => a.lastMessage && (a.lastMessageTick == null ? a.task?.action === 'talk' : w.tick - a.lastMessageTick <= 12);
async function api(path, data) {
  const r = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await r.json(); if (!r.ok) throw new Error(result.error || 'Request failed'); return result;
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 5000); }
function renderEconomy(w, a) {
  $('market-section').hidden = !w.economy;
  if (!w.economy) return;
  const m = w.economy;
  $('market-summary').textContent = `${m.stats.trades} trades · ${m.stats.coinsTraded} coins exchanged · ${m.stats.toolsCrafted} tools made · ${w.agents.reduce((n, b) => n + b.coins, 0) + (w.village?.requests.reduce((n,r) => n+r.price,0) || 0) + (w.life?.orders.reduce((n,o)=>n+o.price*o.remaining,0) || 0) + (w.life ? Object.values(w.life.council).reduce((n,p)=>n+p.balance,0) : 0)} coins total${w.village ? " (including reserved payment)" : " circulating"}`;
  $('market-roles').innerHTML = w.agents.map(b => `<div><strong>${escape(b.name)}</strong><span>${escape(professionName(b.profession))}</span></div>`).join('');
  $('market-offers').innerHTML = m.offers.map(o => `<article class="offer-card"><p class="eyebrow">${escape(o.seller)} · OFFER #${o.id}</p><h3>1 ${escape(o.item)}</h3><strong>${o.price} coins</strong><p>Returns in ${Math.max(0, Math.ceil((o.expiresAt - w.tick) * 5 / 60))} hours</p></article>`).join('') || '<p class="empty">The stalls are quiet. Residents can bring goods to sell here.</p>';
  $('market-trades').innerHTML = m.trades.slice(-8).reverse().map(t => `<div class="memory">D${Math.floor(t.tick / 288) + 1} ${time(t.tick)} · <b>${escape(nameOf(w, t.buyerId))}</b> bought 1 ${escape(t.item)} from ${escape(nameOf(w, t.sellerId))} for ${t.price} coins.</div>`).join('') || '<p class="hint">Accepted trades will appear here. Residents choose whether to buy.</p>';
  $('market-days').innerHTML = (replay ? [] : current.daySummaries || []).filter(d => d.daily.trades !== undefined).map(d => `<tr><th>${d.day}</th><td>${d.daily.trades}</td><td>${d.daily.coinsTraded}</td><td>${d.daily.toolsCrafted}</td><td>${d.daily.offersPosted}</td></tr>`).join('');
  $('inspector').innerHTML += `<p class="eyebrow">LIVELIHOOD</p><p><strong>${escape(professionName(a.profession))}</strong> · ${a.coins} coins</p><div class="inventory"><span>${a.inventory.tool} unused tools</span><span>${a.toolUses} tool uses left</span><span>${a.economicStats.bought} purchases · ${a.economicStats.sold} sales</span></div><p class="hint">Everyone can do every job. Specialties improve output; six successful jobs make a skill quicker.</p>${Object.entries(a.skills).map(([role, xp]) => `<div class="skill-row"><span>${escape(professionName(role))}</span><span>${xp} jobs${xp >= m.rules.practiceThreshold ? ' · practiced' : ''}</span></div>`).join('')}`;
}
function renderVillage(w, a) {
  $('village-section').hidden = !w.village;
  if (w.village) {
    const v = w.village;
    $('village-summary').textContent = `${v.stats.requestsFilled} needs met · ${v.stats.cookingServices} cooking services · ${v.stats.projectsCompleted}/3 projects complete · ${v.stats.homesImproved} home improvements · ${v.stats.sharedMeals} shared meals`;
    $('village-requests').innerHTML = v.requests.map(r => `<article class="offer-card"><p class="eyebrow">${escape(r.owner)} · REQUEST #${r.id}</p><h3>${escape(r.type === 'request_cooking' ? 'Cook my ingredients' : r.type === 'request_work' ? 'Work on ' + r.projectId : 'Bring 1 ' + r.item)}</h3><strong>${r.price ? r.price + ' reserved coins' : 'Share the cooked meals'}</strong><p>Expires in ${Math.max(0,Math.ceil((r.expiresAt-w.tick)/12))} hours</p></article>`).join('') || '<p class="empty">No open requests. Residents can post funded needs here.</p>';
    $('village-projects').innerHTML = Object.values(v.projects).map(p => `<article class="offer-card"><h3>${escape(p.name)}</h3><p>${p.completedAt === null ? `${p.wood}/${p.woodNeeded} wood · ${p.work}/${p.workNeeded} work` : `Complete · day ${Math.floor(p.completedAt/288)+1}, ${time(p.completedAt)}`}</p><p>${escape(p.benefit)}</p></article>`).join('');
    $('village-gatherings').innerHTML = v.gatherings.map(g => `<article class="offer-card"><h3>${escape(g.host)} is hosting</h3><p>One meal waiting at the green · ${Math.max(0,Math.ceil((g.expiresAt-w.tick)*5))} minutes left</p></article>`).join('') || '<p class="hint">Neighbors can gather for leisure or invite someone to a shared meal.</p>';
    $('village-exchanges').innerHTML = v.exchanges.slice(-8).reverse().map(e => `<div class="memory">D${Math.floor(e.tick/288)+1} ${time(e.tick)} · ${escape(nameOf(w,e.actorId))} completed ${escape(e.requestType.replaceAll('_',' '))} for ${escape(nameOf(w,e.targetId))} · ${e.price} coins</div>`).join('') || '<p class="hint">Completed deliveries and services appear here.</p>';
    $('inspector').innerHTML += `<p class="eyebrow">HOME &amp; LIFE</p><p>${Math.round(a.satisfaction)}/100 satisfaction · ${a.home.bed ? 'Better bed' : 'Basic sleeping space'} · ${a.home.furnishing ? 'Furnished' : 'Unfurnished'}</p><p class="hint">${a.inventory.bed} beds and ${a.inventory.furnishing} furnishings carried. Satisfaction is a quality-of-life measure, not health or trust. Spare tools equip automatically on harvest.</p>`;
  }
  const b = current.batch;
  $('batch-section').hidden = !b;
  if (!b) return;
  $('batch-summary').textContent = `${b.completedRuns}/${b.count} complete · reviews every ${b.options.reviewHours||1} hour(s) · ${b.status} · ${b.pendingRuns} waiting to begin${b.reason ? ' · ' + b.reason : ''}`;
  $('batch-section').querySelector('h2').textContent = `${b.count} villages, fresh beginnings`;
  $('batch-rows').innerHTML = b.runs.map(r => `<tr><th><button class="quiet" data-run="${escape(r.id)}">${r.index}</button></th><td>${escape(r.status)}${r.status === 'paused' ? ' · ' + escape(r.pauseReason) : ''}</td><td>${r.failures}</td>${['trades','requestsFilled','cookingServices','deliveries','invitationsAccepted','civicCompleted','projectsCompleted','homesImproved','starvingHours','lowestHealth'].map(k => `<td>${r.metrics?.[k] ?? '—'}</td>`).join('')}<td><a href="${escape(r.report)}" target="_blank" rel="noopener">Evidence ↗</a></td></tr>`).join('');
  $('batch-aggregate').textContent = b.completedRuns ? ['requestsFilled','deliveries','invitationsAccepted','civicCompleted','projectsCompleted','starvingHours','lowestHealth'].filter(k => b.aggregate[k]).map(k => `${({deliveries:'Deliveries',invitationsAccepted:'Shared activities',civicCompleted:'Public services',requestsFilled:'Needs met',projectsCompleted:'Projects',starvingHours:'Starving hours',lowestHealth:'Lowest health'})[k]}: mean ${b.aggregate[k].mean}, range ${b.aggregate[k].min}–${b.aggregate[k].max}`).join(' · ') : 'Averages and ranges appear as runs finish.';
  $('batch-rows').querySelectorAll('[data-run]').forEach(button => button.onclick = async () => {
    const sequence = ++replaySequence;
    try {
      const r = await api('/api/research/runs/' + button.dataset.run);
      if (sequence !== replaySequence) return;
      replay = true; previous = null; displayed = { world: r.world, metrics: r.run.metrics, places: current.places };
      $('timeline').disabled = true; render(); $('run-version').scrollIntoView({block:'center',behavior:'smooth'});
    } catch (e) { toast(e.message); }
  });
}
function renderLife(w,a) {
  $('life-section').hidden = !w.life;
  if(!w.life)return;
  const l=w.life;
  $('life-summary').textContent=`${l.stats.deliveries} ${l.stats.deliveries===1?'delivery':'deliveries'} · ${l.stats.hobbiesEnjoyed} hobbies enjoyed · ${l.stats.invitationsAccepted} shared activities · ${l.stats.civicWages} coins earned on public work · ${Math.round(l.stats.healthRestored)} health recovered`;
  $('life-shops').innerHTML=l.shops.map(s=>`<article class="offer-card"><p class="eyebrow">${escape(s.owner)} · SHOP #${s.id}</p><h3>${escape(s.item.replaceAll('_',' '))}</h3><strong>${s.price} ${s.price===1?'coin':'coins'} per delivery</strong><p>${s.item==='care'?'Care service · requires a meal and time':s.stock+' goods in stock'} · closes D${Math.floor(s.expiresAt/288)+1} ${time(s.expiresAt)}</p></article>`).join('')||'<p class="empty">No resident has opened a business yet.</p>';
  $('life-orders').innerHTML=l.orders.map(o=>`<article class="offer-card"><h3>${escape(nameOf(w,o.sellerId))} → ${escape(o.buyer)}</h3><p>${o.remaining} ${escape(o.item)} deliveries remaining · ${o.price*o.remaining} coins reserved</p><p>${o.nextDeliveryAt<=w.tick?'Ready for delivery':'Next delivery D'+(Math.floor(o.nextDeliveryAt/288)+1)+' '+time(o.nextDeliveryAt)}</p></article>`).join('')||'<p class="hint">No standing orders. Goods and payment move only after a customer authorizes an order and a merchant delivers.</p>';
  $('life-calendar').innerHTML=l.invitations.map(i=>`<article class="offer-card"><p class="eyebrow">INVITATION #${i.id}</p><h3>${escape(i.host)} · ${escape(i.interest)}</h3><p>At the green · D${Math.floor(i.startsAt/288)+1} ${time(i.startsAt)} to D${Math.floor(i.expiresAt/288)+1} ${time(i.expiresAt)}</p><p>${i.declinedBy.length} declined · host must be present</p></article>`).join('')||'<p class="hint">The calendar is open. Each resident has a preferred hobby and leisure hour; invitations are voluntary.</p>';
  $('life-council').innerHTML=Object.values(l.council).map(p=>`<article class="offer-card"><p class="eyebrow">${escape(p.status.toUpperCase())}</p><h3>${escape(p.name)}</h3><p>${escape(p.benefit)}</p><p>${Object.values(p.votes).filter(v=>v==='yes').length} yes / 4 needed · ${p.balance} public coins</p><p>${p.wood}/${p.woodNeeded} wood · ${p.work}/${p.workNeeded} work</p><p>${p.status==='voting'?'Ballot closes D'+(Math.floor(p.deadline/288)+1)+' '+time(p.deadline):p.status==='complete'?(p.serviceUntil>w.tick?'Service active until D'+(Math.floor(p.serviceUntil/288)+1)+' '+time(p.serviceUntil):'Service inactive · maintenance needed'):'Residents choose whether to propose and fund this service.'}</p></article>`).join('');
  $('inspector').innerHTML+=`<p class="eyebrow">PERSONAL PLANS</p><p>Enjoys ${escape(a.personal.interest)} · preferred leisure hour ${a.personal.preferredHour}:00</p><p class="hint">${a.personal.leisureCount} activities enjoyed · ${a.inventory.leisure_kit} leisure kits carried. Preferences are optional goals. Recovery needs food, time and a maintained clinic or paid care.</p>`;
}
function render() {
  if (!displayed) return;
  const w = displayed.world; const reviewInterval=12*(w.reviewHours||1);
  $('mode').textContent = w.mode === 'demo' ? 'DEMO · SCRIPTED' : 'CHATGPT · LIVE DECISIONS';
  const finished = w.tick >= w.maxTicks, totalDays = w.days || Math.ceil(w.maxTicks / 288);
  $('clock').textContent = `Day ${finished ? totalDays : Math.floor(w.tick / 288) + 1}${w.days ? ' / ' + totalDays : ''} · ${finished ? '24:00' : time(w.tick)}`;
  $('app-version').textContent = `App v${current.appVersion || '0.5.0'}`;
  $('run-version').textContent = `Simulation ${w.version.replace('world-','')} · Run ${w.id.slice(0,8)}`;
  $('decision-pace').textContent = hourlyRun(w) ? `Every ${w.reviewHours||1} hour(s) · ${Math.min(w.maxTicks/reviewInterval,(w.nextDecisionTick || 0)/reviewInterval)} / ${w.maxTicks/reviewInterval} rounds · quiet time skips ahead` : 'v1 pilot preserved · start a fresh run to use v4';
  $('scenario-tag').textContent = w.scenario ? `CONDITION · ${w.scenario.name.toUpperCase()}${w.personas ? ' · TEMPERAMENTS' : ''}` : 'FIELD NOTE 001';
  $('scenario-question').innerHTML = w.economy ? 'Who makes?<br>Who trades?<br>What will they<br>build a living on?' : QUESTIONS[w.scenario?.id] || QUESTIONS.plenty;
  $('scenario-summary').textContent = (w.scenario?.summary || 'A one-day pilot in a shared world') + (w.economy ? ' Professions, gathering tools and a village market are active.' : '');
  const m = displayed.metrics;
  $('world-status').textContent = replay ? 'Recorded playback' : current.retry ? `${current.retry.actor} · retrying temporary model failure…` : current.busy ? `${current.pendingName || 'Village'} is thinking…` : w.running ? 'The village is living' : w.pauseReason;
  $('pantry').innerHTML = `${w.pantry} <em>meals</em>`;
  $('orchard').innerHTML = `${w.resources.food} <em>fruit</em>`;
  $('gifts').innerHTML = m ? `${m.gifts} <em>· ${m.pantryShares} to pantry</em>` : `— <em>· ${w.shares} to pantry</em>`;
  $('thefts').innerHTML = m ? `${m.thefts} <em>/ ${m.theftAttempts} tries</em>` : '—';
  $('gini').innerHTML = m ? `${m.foodGini.toFixed(2)} <em>gini</em>` : '—';
  $('calls').innerHTML = `${w.calls} <em>/ ${w.maxCalls}</em>`;
  $('residents').innerHTML = w.agents.map(a => `<button class="resident${a.id === selected ? ' selected' : ''}" data-agent="${a.id}" aria-pressed="${a.id === selected}"><span class="avatar" data-color="${a.color}"></span><span><span class="name">${a.name}</span><span class="activity">${escape(active(a))}</span></span><span class="status-dot"></span></button>`).join('');
  for (const el of document.querySelectorAll('[data-color]')) el.style.backgroundColor = el.dataset.color;
  $('residents').querySelectorAll('button').forEach(b => b.onclick = () => { selected = b.dataset.agent; render(); });
  const a = w.agents.find(x => x.id === selected);
  $('inspector').innerHTML = `<h3>${a.name}’s day</h3><div class="needs">${[['Hunger', a.hunger], ['Energy', a.energy], ['Health', a.health]].map(([n, v]) => `<div><div class="need"><span>${n}</span><span>${Math.round(v)} / 100</span></div><div class="meter"><span data-width="${v}"></span></div></div>`).join('')}</div><div class="inventory"><span>${a.inventory.raw} ingredients</span><span>${a.inventory.wood} wood</span><span>${a.inventory.meal} meals</span></div>${a.persona ? `<p class="temperament">${escape(a.persona)}</p>` : ''}<p class="eyebrow">STATED REASON</p><p class="stated">${escape(a.lastReason || 'A new day. Nothing decided yet.')}</p>${a.stats ? `<p class="eyebrow">BEHAVIOR RECORD</p><div class="behavior">${[['Gave', a.stats.gave], ['Received', a.stats.received], ['Stole', a.stats.stole], ['Robbed', a.stats.robbed], ['To pantry', a.stats.shared], ['From pantry', a.stats.took], ['Spoke', a.stats.talked], ['Starving h', Math.round(a.stats.starvingTicks / 12 * 10) / 10]].map(([n, v]) => `<span><b>${v}</b>${n}</span>`).join('')}</div>` : ''}${a.plans?.length ? `<p class="eyebrow">HOURLY PLANS</p>${a.plans.slice(-3).reverse().map(p => `<div class="memory"><b>D${Math.floor(p.tick/288)+1} ${time(p.tick)} · ${escape(p.action)}${p.target !== 'none' ? ' → ' + escape(nameOf(w, p.target)) : ''}${p.item && p.item !== 'none' ? ' (' + escape(p.item) + ')' : ''}</b><br>${escape(p.reason)}</div>`).join('')}` : ''}<p class="eyebrow">RECENT MEMORIES</p>${a.memories.slice(-3).reverse().map(m => `<div class="memory">D${Math.floor(m.tick/288)+1} ${time(m.tick)} · ${escape(m.text)}</div>`).join('') || '<p class="hint">Memories form from events within hearing range.</p>'}`;
  renderEconomy(w, a);
  renderVillage(w, a);
  renderLife(w,a);
  $('coordination-section').hidden=!w.coordination;
  if(w.coordination){
    $('coordination-summary').textContent=`${w.coordination.stats.shopPurchases} shop pickups · ${w.coordination.stats.sponsoredVotes} funded votes · ${w.coordination.stats.openingStock} goods stocked on opening`;
    $('coordination-plans').innerHTML=w.agents.filter(b=>b.task&&['gather','cook','craft','contribute','build','civic_work','maintain'].includes(b.task.action)).map(b=>`<article class="offer-card"><h3>${escape(b.name)}</h3><p>${escape(active(b))}</p></article>`).join('')||'<p class="hint">No public production tasks underway at this moment.</p>';
  }
  if($('execution-status'))$('execution-status').textContent=`Current execution: ${current.execution?.pace||'watch'} · reviews every ${w.reviewHours||1} hour(s)`;
  if (a.relationships) {
    const people = Object.values(a.relationships);
    $('inspector').innerHTML += `<p class="eyebrow">SOCIAL NOTEBOOK · PRIVATE TO ${escape(a.name.toUpperCase())}</p><p class="hint">Witnessed encounters; trust is the resident’s judgment.</p>${people.map(p => `<div class="memory"><b>${escape(p.name)}</b> · heard ${p.heardMessages} messages · received ${p.giftsReceived} gifts · robbed ${p.theftsSuffered} times${p.firstWords ? '<br>First words heard: ' + escape(p.firstWords.text) : ''}${p.lastWords && p.lastWords.tick !== p.firstWords?.tick ? '<br>Latest words heard: ' + escape(p.lastWords.text) : ''}${p.recentEvents.slice(-2).map(e => '<br>D' + (Math.floor(e.tick/288)+1) + ' ' + time(e.tick) + ' · ' + escape(e.text)).join('')}</div>`).join('') || '<p class="hint">No encounters recorded yet. Everyone begins as a stranger.</p>'}`;
  }
  $('day-report').hidden = replay || !current.daySummaries?.length;
  $('day-rows').innerHTML = (current.daySummaries || []).map(d => `<tr><th>${d.day}</th>${['gatheredFood','gatheredWood','mealsCooked','gifts','thefts','messages','starvingHours'].map(k => '<td>' + d.daily[k] + '</td>').join('')}<td>${d.cumulative.orchard}</td></tr>`).join('');
  for (const el of document.querySelectorAll('[data-width]')) el.style.width = `${el.dataset.width}%`;
  if (!replay) {
    const events = current.events.filter(e => e.text && (journalFilter === 'all' || (journalFilter === 'voices' ? e.kind === 'talk' : DILEMMAS.includes(e.kind)))).slice(-14).reverse();
    $('events').innerHTML = events.map(e => `<div class="event ${escape(e.kind)}"><span class="event-time">D${Math.floor(e.tick/288)+1} ${time(e.tick)}</span><span class="event-dot"></span><span>${ICONS[e.kind] ? ICONS[e.kind] + ' ' : ''}${escape(e.text)}</span></div>`).join('') || `<p class="empty">${journalFilter === 'all' ? 'A quiet beginning. The first footsteps are still to come.' : 'Nothing of this kind among the latest events yet.'}</p>`;
  }
  $('replay-banner').hidden = !replay;
  $('playback-note').textContent = replay ? `Viewing day ${finished ? totalDays : Math.floor(w.tick/288)+1}, ${finished ? '24:00' : time(w.tick)}. Live simulation is separate.` : `${frames.length} saved moments · ${w.inputTokens + w.outputTokens} reported tokens`;
}

// All village artwork is original Canvas drawing. No downloaded game assets.
function tree(x, y, size = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  ctx.fillStyle = '#83946744'; ctx.beginPath(); ctx.ellipse(4, 10, 21, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#79694b'; ctx.fillRect(-3, -11, 6, 24);
  for (const [dy, color] of [[-5, '#657f59'], [-18, '#70895e'], [-30, '#7c9567']]) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, dy - 21); ctx.lineTo(-23, dy + 13); ctx.lineTo(23, dy + 13); ctx.closePath(); ctx.fill();
  } ctx.restore();
}
const xy = (x, y) => ({ x: 80 + x * 52, y: 38 + y * 45 });
function roof(x, y, color = '#a77553', wide = 85) {
  ctx.fillStyle = '#76805a33'; ctx.fillRect(x - wide / 2 + 9, y + 6, wide, 25);
  ctx.fillStyle = '#d8c5a0'; ctx.fillRect(x - wide / 2, y - 28, wide, 53);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - wide / 2 - 9, y - 26); ctx.lineTo(x, y - 70); ctx.lineTo(x + wide / 2 + 9, y - 26); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#574f3b'; ctx.fillRect(x - 10, y - 3, 20, 28);
  ctx.fillStyle = '#8a9b82'; ctx.fillRect(x - wide / 2 + 10, y - 14, 12, 13);
}
function tag(text, x, y) {
  ctx.font = '13px system-ui'; const width = ctx.measureText(text).width + 20;
  ctx.fillStyle = '#f4f1dfed'; ctx.beginPath(); ctx.roundRect(x - width / 2, y, width, 25, 4); ctx.fill();
  ctx.fillStyle = '#586548'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 17);
}
function draw(now) {
  requestAnimationFrame(draw); if (!displayed) return;
  const w = displayed.world, places = displayed.places;
  ctx.clearRect(0, 0, 1000, 850); ctx.fillStyle = '#c8d1aa'; ctx.fillRect(0, 0, 1000, 850);
  for (let y = 0; y < 17; y++) for (let x = 0; x < 19; x++) {
    ctx.fillStyle = ['#bdc99c', '#d0d7b5', '#c1cea3'][(x * 7 + y * 11) % 3];
    const p = xy(x, y); ctx.globalAlpha = .25; ctx.fillRect(p.x - 24, p.y - 19, 49, 42);
    ctx.globalAlpha = 1;
    if ((x * 17 + y * 13) % 7 === 0) { ctx.strokeStyle = '#a8ba88'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 5); ctx.moveTo(p.x + 4, p.y); ctx.lineTo(p.x + 6, p.y - 3); ctx.stroke(); }
  }
  // River along the eastern boundary.
  ctx.strokeStyle = '#9dbcb2'; ctx.lineWidth = 65; ctx.beginPath(); ctx.moveTo(960, -30); ctx.bezierCurveTo(850, 160, 1010, 340, 950, 480); ctx.bezierCurveTo(890, 650, 990, 710, 920, 880); ctx.stroke();
  ctx.strokeStyle = '#b6cec1'; ctx.lineWidth = 2; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(929, i * 109 + 25); ctx.lineTo(951, i * 109 + 28); ctx.stroke(); }
  ctx.strokeStyle = '#d9cba6'; ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const center = xy(8, 8);
  for (const p of Object.values(places)) { const pt = xy(p.x, p.y); ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(pt.x, center.y); ctx.lineTo(pt.x, pt.y); ctx.stroke(); }
  for (const [x, y, s] of [[0,3,1],[1,1,1.2],[2,2,1],[1,6,.8],[14,1,1],[15,2,1.1],[14,4,1.2],[13,1,.9],[15,5,.9],[0,12,1.1],[1,14,.8],[14,14,1.1],[15,13,.8]]) { const p = xy(x,y); tree(p.x,p.y,s); }
  // Orchard trees and fruit.
  const orchard = xy(3,4);
  let fruit = Math.min(9, w.resources.food); // Visible fruit tracks the remaining commons.
  for(const dx of [-35, 5, 39]) { ctx.fillStyle = '#7b7652'; ctx.fillRect(orchard.x+dx-3,orchard.y-25,6,28); ctx.fillStyle=w.resources.food?'#8eaa70':'#a3a07a';ctx.beginPath();ctx.arc(orchard.x+dx,orchard.y-38,23,0,7);ctx.fill();ctx.fillStyle='#ba7958';for(const [ax,ay]of [[-8,-42],[7,-32],[9,-48]]){if(fruit-- <= 0)break;ctx.beginPath();ctx.arc(orchard.x+dx+ax,orchard.y+ay,3,0,7);ctx.fill();}}
  const lodge=xy(4,12);roof(lodge.x,lodge.y,'#93745b',106);
  const pantry=xy(11,10);roof(pantry.x,pantry.y,'#8b946a',70);
  const hearth=xy(8,8);ctx.fillStyle='#aaac8a';ctx.beginPath();ctx.ellipse(hearth.x,hearth.y,34,18,0,0,7);ctx.fill();
  ctx.fillStyle='#866c4b';ctx.fillRect(hearth.x-16,hearth.y-3,33,6);ctx.save();ctx.translate(hearth.x,hearth.y-9);ctx.rotate(.5);ctx.fillRect(-15,-3,30,6);ctx.restore();
  ctx.fillStyle='#c78344';ctx.beginPath();ctx.moveTo(hearth.x-12,hearth.y-4);ctx.quadraticCurveTo(hearth.x-18,hearth.y-20,hearth.x-2,hearth.y-35);ctx.quadraticCurveTo(hearth.x+2,hearth.y-18,hearth.x+11,hearth.y-25);ctx.quadraticCurveTo(hearth.x+21,hearth.y-5,hearth.x-12,hearth.y-4);ctx.fill();
  ctx.fillStyle='#e6bb65';ctx.beginPath();ctx.ellipse(hearth.x,hearth.y-10,6,10,0,0,7);ctx.fill();
  const square=xy(8,12);ctx.fillStyle='#acbb8d';ctx.beginPath();ctx.ellipse(square.x,square.y,50,33,0,0,7);ctx.fill();
  if(w.economy){for(const dx of [-35,35]){ctx.fillStyle='#9b7855';ctx.fillRect(square.x+dx-16,square.y-27,32,25);ctx.fillStyle=dx<0?'#ba865d':'#7d9572';ctx.fillRect(square.x+dx-20,square.y-35,40,12);ctx.fillStyle='#e9d6b5';ctx.fillRect(square.x+dx-12,square.y-35,8,12);ctx.fillRect(square.x+dx+4,square.y-35,8,12);}}
  for(const dx of [-36,35]){ctx.fillStyle='#99815b';ctx.fillRect(square.x+dx-12,square.y-6,25,7);ctx.fillRect(square.x+dx-10,square.y+1,4,7);ctx.fillRect(square.x+dx+7,square.y+1,4,7);}
  if(w.village){for(const p of Object.values(w.village.projects)){const place=places[p.site],pt=xy(place.x,place.y);ctx.fillStyle=p.completedAt!==null?'#547c54':'#b79052';ctx.fillRect(pt.x+35,pt.y-20,12,12);if(showLabels)tag(p.completedAt!==null?'Built':'Work '+p.work+'/'+p.workNeeded,pt.x,pt.y+65);}}
  const stock = { orchard: ` · ${w.resources.food}`, forest: ` · ${w.resources.wood}`, pantry: ` · ${w.pantry}` };
  if (showLabels) for(const [key,place]of Object.entries(places)){const p=xy(place.x,place.y);tag((w.economy&&key==='square'?'Market & workbench':place.name)+(stock[key]||''),p.x,p.y+(key==='forest'?26:35));}
  const t = replay || matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : Math.min(1, (now - receivedAt) / 850);
  const agents = w.agents.map(a=>{const old=previous?.world.agents.find(b=>b.id===a.id)||a;return {...a,drawX:old.x+(a.x-old.x)*t,drawY:old.y+(a.y-old.y)*t};});
  // Residents sharing a tile stand side by side instead of drawing over each other.
  const tiles = {};for(const a of agents)(tiles[`${a.x},${a.y}`] ||= []).push(a);
  for(const group of Object.values(tiles))group.forEach((a,k)=>{a.drawX+=(k-(group.length-1)/2)*.75;});
  agents.sort((a,b)=>a.drawY-b.drawY);
  const at = Object.fromEntries(agents.map(a=>[a.id,xy(a.drawX,a.drawY)]));
  // Live gifts and thefts from the last hour are drawn as links between the two residents.
  const recent = replay ? [] : current.events.filter(e=>['give','steal','trade'].includes(e.kind)&&e.targetId&&w.tick-e.tick<=12);
  for(const e of recent){const a=at[e.actorId],b=at[e.targetId];if(!a||!b)continue;ctx.save();ctx.setLineDash([6,6]);ctx.lineWidth=3;ctx.strokeStyle=e.kind==='give'?'#5d8a52cc':'#b4553fcc';ctx.beginPath();ctx.moveTo(a.x,a.y-15);ctx.lineTo(b.x,b.y-15);ctx.stroke();ctx.restore();}
  const badges = Object.fromEntries((replay ? [] : current.events.filter(e=>['give','steal','take','trade','craft','offer'].includes(e.kind)&&w.tick-e.tick<=6)).map(e=>[e.actorId,ICONS[e.kind]]));
  for(const a of agents){const p=at[a.id];ctx.fillStyle='#57634333';ctx.beginPath();ctx.ellipse(p.x,p.y+6,15,7,0,0,7);ctx.fill();if(a.id===selected){ctx.strokeStyle='#f6f4e4';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(p.x,p.y+5,20,11,0,0,7);ctx.stroke();}ctx.fillStyle='#5e614a';ctx.fillRect(p.x-7,p.y-3,5,12);ctx.fillRect(p.x+2,p.y-3,5,12);ctx.fillStyle=a.color;ctx.beginPath();ctx.roundRect(p.x-11,p.y-26,22,25,6);ctx.fill();ctx.fillStyle='#ebc6a0';ctx.beginPath();ctx.arc(p.x,p.y-32,10,0,7);ctx.fill();ctx.fillStyle='#5b503d';ctx.beginPath();ctx.arc(p.x,p.y-35,10,Math.PI,Math.PI*2);ctx.fill();ctx.fillStyle='#384936';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillText(a.name,p.x,p.y-49);if(badges[a.id]){ctx.font='18px system-ui';ctx.fillText(badges[a.id],p.x+20,p.y-40);}if(speaking(w,a)){tag(a.lastMessage.length>38?a.lastMessage.slice(0,37)+'…':a.lastMessage,p.x,p.y-87);}}
  // Night is a visual clock; it does not change experimental rules.
  const hour = w.tick * 5 / 60 % 24;if(hour<5||hour>20){ctx.fillStyle='#23384925';ctx.fillRect(0,0,1000,850);}
}
canvas.onclick = e => {if(!displayed)return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*1000/r.width,y=(e.clientY-r.top)*850/r.height;let best;for(const a of displayed.world.agents){const p=xy(a.x,a.y);const distance=Math.hypot(p.x-x,p.y-23-y);if(distance<40&&(!best||distance<best.distance))best={id:a.id,distance};}if(best){selected=best.id;render();}};
$('labels').onclick=()=>{showLabels=!showLabels;$('labels').textContent=showLabels?'Hide labels':'Show labels';$('labels').setAttribute('aria-pressed',String(showLabels));};
async function poll(){if(polling)return;polling=true;try{const state=await api('/api/state');previous=displayed;current=state;receivedAt=performance.now();if(!replay)displayed=state;$('connection').textContent='Connected';render();}catch{$('connection').textContent='Reconnecting';}finally{polling=false;}}
async function loadFrames(){try{frames=await api('/api/frames');$('timeline').max=Math.max(0,frames.length-1);if(!replay)$('timeline').value=frames.length-1;render();}catch{}}
let replaySequence=0;
let accountLoading=false, actionPending=false, pendingActions=0;
function ownerMessage(message, failed=false){const el=$('owner-message');el.textContent=message;el.classList.toggle('error',failed);}

$('timeline').oninput=async e=>{const f=frames[Number(e.target.value)];if(!f)return;const sequence=++replaySequence;try{const frame=await api('/api/frame/'+f.id);if(sequence!==replaySequence)return;replay=true;previous=null;displayed=frame;render();}catch(err){toast(err.message);}};
$('return-live').onclick=()=>{$('timeline').disabled=false;replaySequence++;replay=false;previous=null;displayed=current;render();};
async function account(){
  if(accountLoading)return;
  accountLoading=true;
  try{
    const s=await api('/api/admin/status');
    $('account-status').textContent=s.connected?`Connected to ChatGPT${s.plan?' · '+s.plan:''}`:s.login?.userCode?'Your sign-in code is ready below.':s.lastError || (s.available?'Ready to connect your subscription.':'Starting the private Codex connection…');
    $('device-login').hidden=!s.login?.userCode;
    if(s.login?.userCode){$('device-code').textContent=s.login.userCode;$('device-link').href=s.login.verificationUrl;}
    if(s.login?.failed)ownerMessage('Sign-in did not complete. Try Connect ChatGPT again.',true);
    if(s.connected&&$('model').options.length<2){const r=await api('/api/admin/models');$('model').innerHTML=r.models.map(m=>`<option value="${escape(m.id)}"${m.id===(current?.world.model || r.models.find(x=>x.isDefault)?.id)?' selected':''}>${escape(m.name)}</option>`).join('');}
    return s;
  }catch(e){ownerMessage(e.message,true);}finally{accountLoading=false;}
}
async function action(name,data={}){
  if(actionPending && name!=='pause')return;
  pendingActions++; actionPending=true;
  const button=document.querySelector(name==='new'?'#new-run':name==='run'?'#play':name==='pace'?'#apply-pace':'#'+name);
  const label=button?.textContent;
  const buttons=[...document.querySelectorAll('#owner-content button')];
  buttons.forEach(b=>b.disabled=b.id!=='pause');
  if(button)button.textContent=name==='connect'?'Connecting…':'Working…';
  ownerMessage(name==='connect'?'Requesting your OpenAI sign-in code…':name==='step'?'Waiting for the village’s decisions…':'Working…');
  try{
    await api('/api/admin/'+name,data);
    if(name==='new'){replaySequence++;replay=false;$('timeline').disabled=false;previous=null;}
    ownerMessage(name==='connect'?'Open OpenAI sign-in below and enter the displayed code.':name==='new'?'Batch ready. Press Play village / batch to begin.':(name==='run'||name==='recover')?'Village running. Close this panel to watch.':name==='pause'?'Village paused.':'Done.');
    await account();await poll();await loadFrames();
    if(name==='connect' && !$('device-login').hidden)$('device-login').scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(e){ownerMessage(e.message,true);if(name==='connect')$('account-status').textContent=e.message;}
  finally{if(button)button.textContent=label;pendingActions--;actionPending=pendingActions>0;buttons.forEach(b=>b.disabled=actionPending&&b.id!=='pause');}
}
$('manage').onclick=async()=>{const s=await api('/api/session');owner=s.owner;$('owner-required').hidden=owner;$('owner-content').hidden=!owner;$('owner-dialog').showModal();if(owner){if(!defaultsApplied&&current){$('new-mode').value=current.world.mode;if(current.world.scenario){$('scenario').value=current.world.scenario.id;$('personas').checked=current.world.personas;}if($('economy').checked)$('scenario').value='sustainable';defaultsApplied=true;}account();}};
$('claim-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/claim',{token:$('setup-key').value.trim()});$('setup-key').value='';owner=true;$('owner-required').hidden=true;$('owner-content').hidden=false;$('owner-message').textContent='Owner access connected on this device.';await account();}catch(err){$('owner-message').textContent=err.message;}};
for(const [id,name]of [['connect','connect'],['disconnect','disconnect'],['play','run'],['pause','pause'],['step','step'],['recover','recover'],['apply-pace','pace']])$(id).onclick=()=>action(name,name==='pace'?{pace:$('pace').value}:{});
$('refresh-account').onclick=async()=>{
  if(accountLoading||actionPending)return;
  const button=$('refresh-account');button.disabled=true;button.textContent='Checking…';ownerMessage('Checking your ChatGPT connection…');
  try{const s=await account();if(s)ownerMessage(s.connected?'ChatGPT is connected.':s.login?.userCode?'Sign-in is waiting for your approval using the code below.':'No ChatGPT account connected yet. Choose Connect ChatGPT.');}
  finally{button.disabled=false;button.textContent='Refresh';}
};
function updateBudget(){const reviews=Number($('review-hours').value)||1;const days=Number($('days').value), count=Number($('run-count').value || 5);$('run-budget').textContent=Number.isInteger(days)&&days>=1&&days<=30&&Number.isInteger(count)&&count>=1&&count<=10?`${count} separate runs × ${days} days · ${(count*days*144/reviews).toLocaleString()} planned + ${count*12} retries · up to ${(count*(days*144/reviews+12)).toLocaleString()} model requests. Runs execute in series. Scripted demo makes no model requests.`:'Choose 1–30 whole days and 1–10 separate runs.';}
$('review-hours').onchange=updateBudget;
$('days').oninput=updateBudget; $('run-count').oninput=updateBudget;
$('coordination').onchange=()=>{if($('coordination').checked){$('living-life').checked=true;$('village-life').checked=true;$('economy').checked=true;$('scenario').value='sustainable';}};
$('living-life').onchange=()=>{if($('living-life').checked){$('village-life').checked=true;$('economy').checked=true;$('scenario').value='sustainable';}else $('coordination').checked=false;};
$('village-life').onchange=()=>{if($('village-life').checked){$('economy').checked=true;$('scenario').value='sustainable';}else {$('living-life').checked=false;$('coordination').checked=false;}};
$('economy').onchange=()=>{if($('economy').checked)$('scenario').value='sustainable';else {$('village-life').checked=false;$('living-life').checked=false;$('coordination').checked=false;}};
$('new-run').onclick=()=>{const days=Number($('days').value), runCount=Number($('run-count').value || 5);if(!Number.isInteger(days)||days<1||days>30||!Number.isInteger(runCount)||runCount<1||runCount>10){ownerMessage('Choose 1–30 whole days and 1–10 separate runs.',true);return;}if(($('economy').checked||$('village-life').checked||$('living-life').checked||$('coordination').checked)&&$('scenario').value!=='sustainable'){ownerMessage('Choose Renewable village for the economy experiment.',true);return;}return action('new',{mode:$('new-mode').value,model:$('model').value,scenario:$('scenario').value,economy:$('economy').checked===true,village:$('village-life').checked===true,life:$('living-life').checked===true,coordination:$('coordination').checked===true,pace:$('pace').value,reviewHours:Number($('review-hours').value)||1,runCount,personas:$('personas').checked,days,socialStart:$('social-start').checked});};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{journalFilter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));render();};
async function init(){const params=new URLSearchParams(location.hash.slice(1));const token=params.get('setup');if(token){history.replaceState(null,'',location.pathname);try{await api('/api/claim',{token});toast('Owner access connected on this device.');owner=true;}catch(e){toast(e.message);}}await poll();await loadFrames();if(owner)$('manage').click();}
init();requestAnimationFrame(draw);setInterval(poll,1000);setInterval(loadFrames,6000);setInterval(()=>{if(owner&&$('owner-dialog').open&&!actionPending)account();},5000);
