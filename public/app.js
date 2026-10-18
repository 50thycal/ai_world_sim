const $ = id => document.getElementById(id);
let current, displayed, previous, receivedAt = 0, selected = 'v1', showLabels = true, replay = false, frames = [], owner = false, polling = false, defaultsApplied = false;
const canvas = $('village'), ctx = canvas.getContext('2d');
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = tick => `${String(Math.floor(tick * 5 / 60) % 24).padStart(2, '0')}:${String(tick * 5 % 60).padStart(2, '0')}`;
const hourlyRun = w => ['world-v2', 'world-v3', 'world-v4'].includes(w?.version);
const VERBS = { gather: 'Gathering', give: 'Giving', steal: 'Stealing', take: 'Taking', talk: 'Talking', invalid: 'Confused' };
const ICONS = { give: '🎁', steal: '✋', take: '🥣', talk: '💬' };
const DILEMMAS = ['give', 'steal', 'take', 'share', 'blocked', 'failure'];
// Static copy keyed by scenario id; never interpolates run data into HTML.
const QUESTIONS = { plenty: 'Who gathers?<br>Who cooks?<br>Who leaves a little<br>for someone else?', commons: 'Who holds back?<br>Who strips the trees?<br>Does anyone<br>say “enough”?', inequality: 'Do the haves<br>share?<br>Do the have-nots<br>ask, or take?' };
let journalFilter = 'all';
const nameOf = (w, id) => w.agents.find(b => b.id === id)?.name || id;
const active = a => a.task ? `${VERBS[a.task.action] || a.task.action[0].toUpperCase() + a.task.action.slice(1)}${a.task.target ? ' · ' + nameOf(displayed.world, a.task.target) : ''}` : hourlyRun(displayed?.world) ? 'Between hourly decisions' : 'Considering the day';
const speaking = (w, a) => a.lastMessage && (a.lastMessageTick == null ? a.task?.action === 'talk' : w.tick - a.lastMessageTick <= 12);
async function api(path, data) {
  const r = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await r.json(); if (!r.ok) throw new Error(result.error || 'Request failed'); return result;
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 5000); }
function render() {
  if (!displayed) return;
  const w = displayed.world;
  $('mode').textContent = w.mode === 'demo' ? 'DEMO · SCRIPTED' : 'CHATGPT · LIVE DECISIONS';
  const finished = w.tick >= w.maxTicks, totalDays = w.days || Math.ceil(w.maxTicks / 288);
  $('clock').textContent = `Day ${finished ? totalDays : Math.floor(w.tick / 288) + 1}${w.days ? ' / ' + totalDays : ''} · ${finished ? '24:00' : time(w.tick)}`;
  $('app-version').textContent = `App v${current.appVersion || '0.4.0'}`;
  $('run-version').textContent = `Simulation ${w.version.replace('world-','')} · Run ${w.id.slice(0,8)}`;
  $('decision-pace').textContent = hourlyRun(w) ? `Hourly decisions · ${Math.min(w.maxTicks/12,(w.nextDecisionTick || 0)/12)} / ${w.maxTicks/12} rounds · quiet time skips ahead` : 'v1 pilot preserved · start a fresh run to use v4';
  $('scenario-tag').textContent = w.scenario ? `CONDITION · ${w.scenario.name.toUpperCase()}${w.personas ? ' · TEMPERAMENTS' : ''}` : 'FIELD NOTE 001';
  $('scenario-question').innerHTML = QUESTIONS[w.scenario?.id] || QUESTIONS.plenty;
  $('scenario-summary').textContent = w.scenario?.summary || 'A one-day pilot in a shared world';
  const m = displayed.metrics;
  $('world-status').textContent = replay ? 'Recorded playback' : current.busy ? `${current.pendingName || 'Village'} is thinking…` : w.running ? 'The village is living' : w.pauseReason;
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
  for(const dx of [-36,35]){ctx.fillStyle='#99815b';ctx.fillRect(square.x+dx-12,square.y-6,25,7);ctx.fillRect(square.x+dx-10,square.y+1,4,7);ctx.fillRect(square.x+dx+7,square.y+1,4,7);}
  const stock = { orchard: ` · ${w.resources.food}`, forest: ` · ${w.resources.wood}`, pantry: ` · ${w.pantry}` };
  if (showLabels) for(const [key,place]of Object.entries(places)){const p=xy(place.x,place.y);tag(place.name+(stock[key]||''),p.x,p.y+(key==='forest'?26:35));}
  const t = replay || matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : Math.min(1, (now - receivedAt) / 850);
  const agents = w.agents.map(a=>{const old=previous?.world.agents.find(b=>b.id===a.id)||a;return {...a,drawX:old.x+(a.x-old.x)*t,drawY:old.y+(a.y-old.y)*t};});
  // Residents sharing a tile stand side by side instead of drawing over each other.
  const tiles = {};for(const a of agents)(tiles[`${a.x},${a.y}`] ||= []).push(a);
  for(const group of Object.values(tiles))group.forEach((a,k)=>{a.drawX+=(k-(group.length-1)/2)*.75;});
  agents.sort((a,b)=>a.drawY-b.drawY);
  const at = Object.fromEntries(agents.map(a=>[a.id,xy(a.drawX,a.drawY)]));
  // Live gifts and thefts from the last hour are drawn as links between the two residents.
  const recent = replay ? [] : current.events.filter(e=>['give','steal'].includes(e.kind)&&e.targetId&&w.tick-e.tick<=12);
  for(const e of recent){const a=at[e.actorId],b=at[e.targetId];if(!a||!b)continue;ctx.save();ctx.setLineDash([6,6]);ctx.lineWidth=3;ctx.strokeStyle=e.kind==='give'?'#5d8a52cc':'#b4553fcc';ctx.beginPath();ctx.moveTo(a.x,a.y-15);ctx.lineTo(b.x,b.y-15);ctx.stroke();ctx.restore();}
  const badges = Object.fromEntries((replay ? [] : current.events.filter(e=>['give','steal','take'].includes(e.kind)&&w.tick-e.tick<=6)).map(e=>[e.actorId,ICONS[e.kind]]));
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
$('return-live').onclick=()=>{replaySequence++;replay=false;previous=null;displayed=current;render();};
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
  const button=document.querySelector(name==='new'?'#new-run':name==='run'?'#play':'#'+name);
  const label=button?.textContent;
  const buttons=[...document.querySelectorAll('#owner-content button')];
  buttons.forEach(b=>b.disabled=b.id!=='pause');
  if(button)button.textContent=name==='connect'?'Connecting…':'Working…';
  ownerMessage(name==='connect'?'Requesting your OpenAI sign-in code…':name==='step'?'Waiting for the village’s decisions…':'Working…');
  try{
    await api('/api/admin/'+name,data);
    ownerMessage(name==='connect'?'Open OpenAI sign-in below and enter the displayed code.':name==='new'?'New run ready. Press Play village to begin.':name==='run'?'Village running. Close this panel to watch.':name==='pause'?'Village paused.':'Done.');
    await account();await poll();await loadFrames();
    if(name==='connect' && !$('device-login').hidden)$('device-login').scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(e){ownerMessage(e.message,true);if(name==='connect')$('account-status').textContent=e.message;}
  finally{if(button)button.textContent=label;pendingActions--;actionPending=pendingActions>0;buttons.forEach(b=>b.disabled=actionPending&&b.id!=='pause');}
}
$('manage').onclick=async()=>{const s=await api('/api/session');owner=s.owner;$('owner-required').hidden=owner;$('owner-content').hidden=!owner;$('owner-dialog').showModal();if(owner){if(!defaultsApplied&&current){$('new-mode').value=current.world.mode;if(current.world.scenario){$('scenario').value=current.world.scenario.id;$('personas').checked=current.world.personas;}defaultsApplied=true;}account();}};
$('claim-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/claim',{token:$('setup-key').value.trim()});$('setup-key').value='';owner=true;$('owner-required').hidden=true;$('owner-content').hidden=false;$('owner-message').textContent='Owner access connected on this device.';await account();}catch(err){$('owner-message').textContent=err.message;}};
for(const [id,name]of [['connect','connect'],['disconnect','disconnect'],['play','run'],['pause','pause'],['step','step']])$(id).onclick=()=>action(name);
$('refresh-account').onclick=async()=>{
  if(accountLoading||actionPending)return;
  const button=$('refresh-account');button.disabled=true;button.textContent='Checking…';ownerMessage('Checking your ChatGPT connection…');
  try{const s=await account();if(s)ownerMessage(s.connected?'ChatGPT is connected.':s.login?.userCode?'Sign-in is waiting for your approval using the code below.':'No ChatGPT account connected yet. Choose Connect ChatGPT.');}
  finally{button.disabled=false;button.textContent='Refresh';}
};
function updateBudget(){const days=Number($('days').value);$('run-budget').textContent=Number.isInteger(days)&&days>=1&&days<=30?`${days} days · up to ${(days*144).toLocaleString()} model requests (144 per day). Scripted demo makes no model requests.`:'Choose 1–30 whole days.';}
$('days').oninput=updateBudget;
$('new-run').onclick=()=>{const days=Number($('days').value);if(!Number.isInteger(days)||days<1||days>30){ownerMessage('Choose 1–30 whole days.',true);return;}return action('new',{mode:$('new-mode').value,model:$('model').value,scenario:$('scenario').value,personas:$('personas').checked,days,socialStart:$('social-start').checked});};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{journalFilter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));render();};
async function init(){const params=new URLSearchParams(location.hash.slice(1));const token=params.get('setup');if(token){history.replaceState(null,'',location.pathname);try{await api('/api/claim',{token});toast('Owner access connected on this device.');owner=true;}catch(e){toast(e.message);}}await poll();await loadFrames();if(owner)$('manage').click();}
init();requestAnimationFrame(draw);setInterval(poll,1000);setInterval(loadFrames,6000);setInterval(()=>{if(owner&&$('owner-dialog').open&&!actionPending)account();},5000);
