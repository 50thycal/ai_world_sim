import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {newWorld} from '../src/world.js';

// Exercise the shipped click handlers and API responses without a browser, subscription or model calls.
// This does not verify CSS layout or physical-phone interaction.
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(backend){
 const elements=new Map();
 const element=id=>{
  if(!elements.has(id)){
   const classes=new Set();
   elements.set(id,{id,textContent:id,hidden:true,disabled:false,value:'demo',options:[],style:{},
    classList:{toggle(name,on){on?classes.add(name):classes.delete(name);},contains:name=>classes.has(name)},
    getContext:()=>({}),querySelectorAll:()=>[],setAttribute(){},scrollIntoView(){this.scrolled=true;},showModal(){this.open=true;}});
  }
  return elements.get(id);
 };
 const buttons=['connect','disconnect','play','pause','step','refresh-account','new-run'].map(element);
 element('run-count').value='5';element('village-life').checked=false;element('days').value='10';element('social-start').checked=true;
 const state={world:newWorld(),events:[],busy:false};
 const context={document:{getElementById:element,querySelector:s=>element(s.slice(1)),querySelectorAll:s=>s==='#owner-content button'?buttons:[]},
  fetch:async(path,options)=>{const response=await backend(path,options);const result=response??{data:path==='/api/state'?state:path==='/api/frames'?[]:{connected:false,available:true}};return{ok:result.ok!==false,json:async()=>result.data};},
  location:{hash:'',pathname:'/'},history:{replaceState(){}},URLSearchParams,performance:{now:()=>0},setInterval(){},setTimeout(){},requestAnimationFrame(){}};
 vm.runInNewContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
 await settle();return{element,state,render:()=>context.render()};
}
test('Connect shows immediate progress and then a visible sign-in code',async()=>{
 let finish,login=false;
 const {element}=await fixture(async path=>{
  if(path==='/api/admin/connect'){await new Promise(resolve=>finish=resolve);login=true;return{data:{}};}
  if(path==='/api/admin/status')return{data:{available:true,connected:false,login:login?{userCode:'TEST-0000',verificationUrl:'https://auth.openai.com/codex/device'}:null}};
 });
 const pending=element('connect').onclick();await settle();
 assert.equal(element('connect').textContent,'Connecting…');assert.match(element('owner-message').textContent,/Requesting/);
 finish();await pending;
 assert.equal(element('device-login').hidden,false);assert.equal(element('device-code').textContent,'TEST-0000');assert.equal(element('device-login').scrolled,true);assert.equal(element('connect').disabled,false);
});
test('failed Connect displays an actionable error beside the controls and permits retry',async()=>{
 const {element}=await fixture(async path=>path==='/api/admin/connect'?{ok:false,data:{error:'OpenAI device sign-in could not be reached. Please retry shortly.'}}:undefined);
 await element('connect').onclick();
 assert.match(element('owner-message').textContent,/could not be reached/);assert.equal(element('owner-message').classList.contains('error'),true);assert.equal(element('connect').disabled,false);assert.match(element('account-status').textContent,/retry/);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="owner-message"')<html.indexOf('id="owner-content"'));
});
test('Pause stays available during a slow step without unlocking other pending controls',async()=>{
 let finish;
 const {element}=await fixture(async path=>{
  if(path==='/api/admin/step')await new Promise(resolve=>finish=resolve);
 });
 const pending=element('step').onclick();await settle();assert.equal(element('pause').disabled,false);
 await element('pause').onclick();assert.equal(element('connect').disabled,true);
 finish();await pending;assert.equal(element('connect').disabled,false);
});

test('Refresh explicitly confirms the disconnected state rather than appearing inert',async()=>{
 const {element}=await fixture(async()=>undefined);
 await element('refresh-account').onclick();
 assert.match(element('owner-message').textContent,/No ChatGPT account connected/);
 assert.equal(element('refresh-account').disabled,false);assert.equal(element('refresh-account').textContent,'Refresh');
});

test('app and run versions remain distinct, and the pilot ends at Day 1 24:00',async()=>{
 const {element,state,render}=await fixture(async()=>undefined);state.appVersion='0.2.2';state.world.version='world-v1';render();
 assert.equal(element('app-version').textContent,'App v0.2.2');assert.match(element('run-version').textContent,/Simulation v1/);assert.match(element('decision-pace').textContent,/v1 pilot preserved/);
 state.world.version='world-v2';delete state.world.days;state.world.maxTicks=288;state.world.tick=288;state.world.nextDecisionTick=288;render();
 assert.equal(element('clock').textContent,'Day 1 · 24:00');assert.match(element('decision-pace').textContent,/24 \/ 24 rounds/);
});

test('v3 runs show their experimental condition and behavior ledger, and new runs send the chosen condition',async()=>{
 let sent;const {element,state,render}=await fixture(async(path,options)=>{if(path==='/api/admin/new')sent=JSON.parse(options.body);});
 state.world=newWorld('demo',null,{scenario:'commons',personas:true});state.metrics={gifts:2,pantryShares:1,thefts:1,theftAttempts:3,foodGini:0.42};render();
 assert.equal(element('scenario-tag').textContent,'CONDITION · FRAGILE COMMONS · TEMPERAMENTS');assert.match(element('scenario-summary').textContent,/never again once stripped/);
 assert.match(element('thefts').innerHTML,/1 <em>\/ 3 tries/);assert.match(element('gini').innerHTML,/0\.42/);assert.match(element('orchard').innerHTML,/^6 /);
 assert.match(element('inspector').innerHTML,/BEHAVIOR RECORD/);assert.match(element('inspector').innerHTML,/community-minded/);
 element('scenario').value='inequality';element('personas').checked=true;element('model').value='';await element('new-run').onclick();
 assert.deepEqual(sent,{mode:'demo',model:'',scenario:'inequality',economy:false,village:false,life:false,runCount:5,personas:true,days:10,socialStart:true});
});

test('market view escapes resident text and owner controls explicitly select economy or baseline',async()=>{
 let sent;const {element,state,render}=await fixture(async(path,options)=>{if(path==='/api/admin/new')sent=JSON.parse(options.body);});
 state.world=newWorld('demo',null,{economy:true});state.world.agents[0].name='<script>bad()</script>';
 state.world.economy.offers=[{id:1,sellerId:'v1',seller:'<img onerror=bad()>',item:'tool',price:2,expiresAt:144}];
 render();assert.equal(element('market-section').hidden,false);assert.match(element('market-summary').textContent,/48 coins/);
 assert.ok(!element('market-offers').innerHTML.includes('<img'));assert.ok(!element('market-roles').innerHTML.includes('<script>'));
 assert.match(element('inspector').innerHTML,/LIVELIHOOD/);
 element('economy').checked=true;element('economy').onchange();assert.equal(element('scenario').value,'sustainable');
 await element('new-run').onclick();assert.equal(sent.economy,true);assert.equal(sent.scenario,'sustainable');
 state.world=newWorld();render();assert.equal(element('market-section').hidden,true);
});

test('v4 duration controls update the budget, preserve midnight labels and expose private social notes',async()=>{
 const {element,state,render}=await fixture(async()=>undefined);
 element('run-count').value='5';element('village-life').checked=false;element('days').value='10';element('days').oninput();assert.match(element('run-budget').textContent,/7,200/);
 element('days').value='2.5';await element('new-run').onclick();assert.match(element('owner-message').textContent,/whole days/);
 state.world.tick=288;state.world.nextDecisionTick=288;render();
 assert.equal(element('clock').textContent,'Day 2 / 10 · 00:00');assert.match(element('decision-pace').textContent,/24 \/ 240 rounds/);
 state.world.tick=2880;render();assert.equal(element('clock').textContent,'Day 10 / 10 · 24:00');
 state.world.agents[0].relationships.v2={name:'<script>bad()</script>',heardMessages:1,giftsReceived:0,theftsSuffered:0,firstWords:null,recentEvents:[]};render();
 assert.match(element('inspector').innerHTML,/SOCIAL NOTEBOOK/);assert.ok(!element('inspector').innerHTML.includes('<script>'));
 state.daySummaries=[{day:1,daily:{gatheredFood:4,gatheredWood:0,mealsCooked:2,gifts:1,thefts:0,messages:6,starvingHours:0},cumulative:{orchard:5}}];render();
 assert.equal(element('day-report').hidden,false);assert.match(element('day-rows').innerHTML,/<th>1<\/th>/);
});
