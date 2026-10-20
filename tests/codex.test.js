import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexClient, isolatedConfig, rpcFailure, providerFailure, rpcDiagnostic, rpcCondition } from '../src/codex.js';
import { fileURLToPath } from 'node:url';

test('villager harness disables shell, browser, apps and shared agent credentials',()=>{
  const c=isolatedConfig();for(const key of ['shell_tool','apps','multi_agent','computer_use','browser_use','view_image'])assert.equal(c['features.'+key],false);
  assert.equal(c.web_search,'disabled');assert.equal(c.forced_login_method,'chatgpt');
});
test('device login and fast completed turns use the real RPC adapter with a fake transport',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'codex-fake-')),binary=fileURLToPath(new URL('./fake-codex.js',import.meta.url));chmodSync(binary,0o755);
  const c=new CodexClient({dataDir:dir,binary});
  try{
    await c.start();assert.equal(c.status().connected,true);assert.equal((await c.models())[0].id,'test-model');
    const login=await c.connect();assert.equal(login.userCode,'TEST-0000');
    const r=await c.decide({name:'Mira'},'test-model');assert.equal(r.decision.action,'wait');assert.equal(r.usage.inputTokens,120);
    const v3=await c.decide({name:'Mira'},'test-model',{worldVersion:'world-v3'});assert.equal(v3.decision.item,'none');
    await assert.rejects(c.decide({name:'TriggerFailure'},'test-model'),/failed/);
  }finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});
test('official pinned Codex binary accepts isolated initialization and account/read',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'codex-protocol-')),c=new CodexClient({dataDir:dir});
  try{await c.start();assert.equal(c.status().available,true);assert.equal(c.status().connected,false);}finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});

test('device-login failures give bounded actionable messages without exposing upstream secrets',()=>{
 assert.match(rpcFailure({message:'failed to request device code: HTTP 403 secret-token-do-not-echo'},'account/login/start'),/HTTP 403/);
 assert.ok(!rpcFailure({message:'failed to request device code secret-token-do-not-echo'},'account/login/start').includes('secret-token'));
 assert.match(rpcFailure({message:'Device authentication is disabled'},'account/login/start'),/Settings → Security/);
 assert.match(rpcFailure({message:'unknown variant'},'account/login/start'),/compatibility/);
});

test('144 decisions use separate reaped workers and keep the control connection alive',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-bounded-')),binary=fileURLToPath(new URL('./fake-codex.js',import.meta.url));chmodSync(binary,0o755);
 const events=[],c=new CodexClient({dataDir:dir,binary,onDiagnostic:e=>events.push(e)});
 try{
  await c.start();const controlPid=c.child.pid;let active=0,maxActive=0;
  for(let i=0;i<144;i++){
   const r=await c.decide({name:'Mira'},'test-model');assert.equal(r.decision.action,'wait');
   assert.equal(c.decisionWorker,null);assert.equal(c.child.pid,controlPid);assert.equal(c.status().connected,true);
  }
  const starts=events.filter(e=>e.event==='codex_start'&&e.role==='decision');assert.equal(starts.length,144);assert.equal(new Set(starts.map(e=>e.pid)).size,144);
  for(const e of events.filter(e=>e.role==='decision')){if(e.event==='codex_start')active++;else if(e.event==='codex_exit'){active--;assert.equal(e.expected,true);}maxActive=Math.max(maxActive,active);}
  assert.equal(active,0);assert.equal(maxActive,1);assert.equal(events.filter(e=>e.event==='codex_start'&&e.role==='control').length,1);
 }finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});
test('worker failure preserves the owner connection and reports only safe exit fields',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-exit-')),binary=fileURLToPath(new URL('./fake-codex.js',import.meta.url));chmodSync(binary,0o755);
 const events=[],c=new CodexClient({dataDir:dir,binary,onDiagnostic:e=>events.push(e)});
 try{
  await c.start();await assert.rejects(c.decide({name:'CrashWorker'},'test-model'),/exit 37/);
  assert.equal(c.decisionWorker,null);assert.equal(c.status().connected,true);assert.equal(c.status().lastWorkerExit.code,37);
  assert.equal(c.status().lastWorkerExit.expected,false);assert.ok(!JSON.stringify(events).includes('TEST-0000'));
  assert.equal((await c.decide({name:'Mira'},'test-model')).decision.action,'wait');assert.equal(c.status().lastError,null);
 }finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});
test('shutdown kills launcher descendants, including a child that ignores SIGTERM',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-tree-')),binary=fileURLToPath(new URL('./fake-codex-launcher.js',import.meta.url));chmodSync(binary,0o755);
 const c=new CodexClient({dataDir:dir,binary});let pending;
 try{
  await c.start();pending=c.decide({name:'IgnoreTermination'},'test-model');pending.catch(()=>{});
  let workerPid;
  for(let i=0;i<200;i++){try{workerPid=Number(readFileSync(join(dir,'codex','test-worker.pid'),'utf8'));break;}catch{await new Promise(r=>setTimeout(r,10));}}
  assert.ok(workerPid);await c.stop();await assert.rejects(pending,/stopped|closed/);assert.equal(c.decisionWorker,null);
  let state='gone';try{state=readFileSync(`/proc/${workerPid}/status`,'utf8').match(/^State:\s+(\w)/m)?.[1];}catch{}
  assert.ok(['gone','Z','X'].includes(state),`Descendant still running: ${state}`);
 }finally{await c.stop();if(pending)await pending.catch(()=>{});rmSync(dir,{recursive:true,force:true});}
});


test('diagnostics correlate worker phases, sampled peaks, timeouts and provider codes without upstream text',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-diagnostics-')),binary=fileURLToPath(new URL('./fake-codex.js',import.meta.url));chmodSync(binary,0o755);
 let sample=0;const events=[],c=new CodexClient({dataDir:dir,binary,timeout:200,sampleIntervalMs:5,
  resourceReader:()=>({memoryMB:400+(sample++%3)*100,oomKills:0}),onDiagnostic:e=>events.push(e)});
 const context={runId:'run-test',requestId:'request-test',actorId:'v1',tick:12,requestNumber:7};
 try{
  await assert.rejects(c.decide({name:'TimeoutWorker'},'test-model',context),/timed out/);
  assert.equal(c.decisionWorker,null);const summary=events.find(e=>e.event==='decision_worker_summary');
  assert.equal(summary.requestId,'request-test');assert.equal(summary.failureCode,'timeout');assert.equal(summary.phase,'inference');
  assert.equal(summary.peakMemoryMB,600);assert.ok(summary.samples>3);assert.ok(summary.durationMs>=200);
  assert.ok(events.some(e=>e.event==='codex_phase'&&e.phase==='thread_start'&&e.runId==='run-test'));
  assert.ok(events.some(e=>e.event==='inference_sample'&&e.requestId==='request-test'));
  assert.ok(events.some(e=>e.event==='decision_timeout'&&e.messageReceived===false&&e.usageReceived===false));
  await assert.rejects(c.decide({name:'RateLimit'},'test-model',context),e=>e.diagnosticCode==='rateLimitExceeded');
  assert.ok(events.some(e=>e.providerCode==='rateLimitExceeded'));assert.ok(!JSON.stringify(events).includes('SECRET'));
 }finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});
test('a completed message without turn completion is diagnosed without exporting its contents',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-missing-completion-')),binary=fileURLToPath(new URL('./fake-codex.js',import.meta.url));chmodSync(binary,0o755);
 const events=[],c=new CodexClient({dataDir:dir,binary,timeout:250,onDiagnostic:e=>events.push(e)});
 try{
  await assert.rejects(c.decide({name:'MessageWithoutCompletion'},'test-model'),/timed out/);
  assert.ok(events.some(e=>e.event==='decision_timeout'&&e.messageReceived===true&&e.usageReceived===false));
  assert.ok(!JSON.stringify(events).includes('SECRET-MESSAGE'));assert.equal(c.decisionWorker,null);
 }finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});
test('provider codes accept only schema-known variants and numeric HTTP status',()=>{
 assert.deepEqual(providerFailure({httpConnectionFailed:{httpStatusCode:503,message:'SECRET'}}),{providerCode:'httpConnectionFailed',httpStatusCode:503});
 assert.deepEqual(providerFailure('SECRET'),{providerCode:'unknown'});
 assert.deepEqual(providerFailure({responseStreamDisconnected:{httpStatusCode:'SECRET'}}),{providerCode:'responseStreamDisconnected'});
});


test('RPC diagnostics preserve only an allowlisted method and bounded numeric category',()=>{
 assert.deepEqual(rpcDiagnostic({code:-32602,message:'SECRET',data:{token:'SECRET'}},'thread/start'),{rpcMethod:'thread/start',rpcErrorClass:'invalid_params',rpcErrorCode:-32602});
 assert.deepEqual(rpcDiagnostic({code:-32001,message:'SECRET'},'turn/start'),{rpcMethod:'turn/start',rpcErrorClass:'server_error',rpcErrorCode:-32001});
 assert.deepEqual(rpcDiagnostic({code:'SECRET',message:'SECRET'},'SECRET-METHOD'),{rpcMethod:'unknown',rpcErrorClass:'unknown'});
});
test('thread-start RPC rejection retains safe diagnostics through the real adapter without exposing raw error data',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-rpc-reject-')),binary=fileURLToPath(new URL('./fake-codex.js',import.meta.url));chmodSync(binary,0o755);const events=[];
 const c=new CodexClient({dataDir:dir,binary,onDiagnostic:e=>events.push(e)});
 try{await assert.rejects(c.decide({name:'Mira'},'RejectThreadStart',{runId:'test',requestId:'test-rpc',actorId:'v1',tick:432,worldVersion:'world-v6'}),/Codex rejected/);
 const e=events.find(e=>e.event==='codex_rpc_failed');assert.equal(e.rpcMethod,'thread/start');assert.equal(e.rpcErrorCode,-32602);assert.equal(e.rpcErrorClass,'invalid_params');assert.equal(e.requestId,'test-rpc');assert.ok(!JSON.stringify(events).includes('SECRET'));assert.equal(c.decisionWorker,null);
 }finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});


test('startup classification is narrowly retryable and never exports raw provider details',()=>{
 assert.equal(rpcCondition({code:-32603,message:'Internal error'},'thread/start').providerCode,'worker_startup_transient');
 assert.equal(rpcCondition({code:-32603,message:'database is locked: SECRET-PATH'},'thread/start').providerCode,'worker_startup_transient');
 for(const [message,code] of [['out of memory SECRET','worker_memory_error'],['no space left on device SECRET','worker_storage_full'],['Authentication failed SECRET','unauthorized'],['usage limit reached SECRET','usageLimitExceeded'],['rate limit exceeded SECRET','rateLimitExceeded']])assert.deepEqual(rpcCondition({code:-32603,message},'thread/start'),{providerCode:code});
 assert.equal(rpcCondition({code:-32603,message:'Internal error'},'turn/start').providerCode,'unknown');
 assert.equal(rpcCondition({code:-32602,message:'Internal error'},'thread/start').providerCode,'unknown');
 assert.equal(rpcCondition({code:-32603,message:'UNKNOWN SECRET'},'thread/start').providerCode,'unknown');
 assert.equal(rpcCondition({code:-32603,message:'Internal error',data:{codexErrorInfo:'usageLimitExceeded'}},'thread/start').providerCode,'usageLimitExceeded');
});


test('stalled-turn inspection recovers only a completed matching turn and validates its actual model output',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-probe-')),events=[],c=new CodexClient({dataDir:dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url)),timeout:250,probeIntervalMs:20,onDiagnostic:e=>events.push(e)});
 try{
  const r=await c.decide({name:'CompletedWithoutEvent'},'test-model',{worldVersion:'world-v8'});assert.equal(r.decision.reason,'Actual captured model output.');assert.equal(r.completionSource,'thread_read');assert.equal(r.usageReported,false);assert.equal(c.decisionWorker,null);assert.ok(events.some(e=>e.event==='completion_recovered'));assert.ok(events.some(e=>e.event==='stalled_turn_probe'&&e.remoteTurnStatus==='completed'));
  const summary=events.find(e=>e.event==='decision_worker_summary');for(const key of ['startupMs','threadStartMs','turnStartMs','inferenceMs'])assert.ok(summary[key]>=0);
  for(const name of ['StaleComplete','WrongPolledThread'])await assert.rejects(c.decide({name},'test-model',{worldVersion:'world-v8'}),/timed out/);
  await assert.rejects(c.decide({name:'InvalidPolledOutput'},'test-model',{worldVersion:'world-v8'}));assert.ok(!JSON.stringify(events).includes('SECRET'));assert.equal(c.decisionWorker,null);
 }finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
});
