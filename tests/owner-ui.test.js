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
 const {element,state,render}=await fixture(async()=>undefined);state.appVersion='0.2.1';state.world.version='world-v1';render();
 assert.equal(element('app-version').textContent,'App v0.2.1');assert.match(element('run-version').textContent,/Simulation v1/);assert.match(element('decision-pace').textContent,/v1 pilot preserved/);
 state.world.version='world-v2';state.world.tick=288;state.world.nextDecisionTick=288;render();
 assert.equal(element('clock').textContent,'Day 1 · 24:00');assert.match(element('decision-pace').textContent,/24 \/ 24 rounds/);
});
