import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from '../src/world.js';
import { Runner } from '../src/runner.js';
import { enableRecovery, retriesUsed, transientFailure } from '../src/recovery.js';
import { decisionLedger } from '../src/diagnostics.js';
import { CodexClient } from '../src/codex.js';
import { createApp } from '../src/server.js';
const decision = { action: 'wait', target: 'none', item: 'none', message: '', reason: 'Observe.' };
const timeout = () => new Error('Villager decision timed out');
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'village-recovery-')), path = join(dir, 'w.sqlite'), store = new WorldStore(path);
  store.reset('chatgpt', 'test-model');
  return { dir, path, store, close() { store.close(); rmSync(dir, { recursive: true, force: true }); } };
};

test('a transient timeout recovers the same frozen input and completes all ten days inside the extra-attempt allowance', async () => {
  const f = fixture(), s = f.store; let n = 0, priorInput, priorContext; const failures = new Set([2, 200, 1000]);
  try {
    const r = new Runner(s, { decide: async (input, model, context) => {
      n++;
      if (priorInput) { assert.deepEqual(input, priorInput); assert.equal(context.actorId, priorContext.actorId); assert.equal(context.tick, priorContext.tick); priorInput = null; }
      if (failures.has(n)) { priorInput = structuredClone(input); priorContext = context; throw timeout(); }
      return { decision, usage: {} };
    } }, undefined, { retryDelays: [0, 0] });
    s.world.running = true;
    while (s.world.running) await r.step();
    assert.equal(n, 1443); assert.equal(s.world.tick, 2880); assert.equal(s.world.pauseReason, '10-day simulation complete');
    assert.equal(s.world.retriesUsed, 3); assert.equal(retriesUsed(s), 3); assert.equal(s.world.maxCalls, 1452);
    const ledger = decisionLedger(s); assert.equal(ledger.filter(x => x.outcome === 'result_saved').length, 1440);
    assert.equal(ledger.filter(x => x.outcome === 'failed').length, 3); assert.equal(ledger.filter(x => x.outcome === 'unresolved').length, 0);
    const requests = s.export().records.filter(x => x.kind === 'request');
    const retried = requests.filter(x => x.retryOf); assert.equal(retried.length, 3);
    assert.ok(retried.every(x => x.automaticRetry && x.attemptNumber === 2));
    assert.equal(new Set(requests.map(x => x.requestId)).size, 1443);
  } finally { f.close(); }
});

test('the existing paused v4 run gains a recorded policy on Play without replacing saved proposals or failed attempts', async () => {
  const f = fixture(), s = f.store;
  try {
    delete s.world.recovery; delete s.world.plannedCalls; delete s.world.retriesUsed; s.world.maxCalls = 1440;
    s.world.tick = 420; s.world.nextDecisionTick = 420; s.world.calls = 2;
    s.world.decisionRound = { tick: 420, decisions: [{ actorId: 'v1', decision }] };
    s.world.pauseReason = 'Villager decision timed out; run paused';
    s.save([{ kind: 'request', requestId: 'mira-saved', actorId: 'v1', actor: 'Mira', tick: 420, number: 1 },
      { kind: 'decision', requestId: 'mira-saved', decision },
      { kind: 'request', requestId: 'fen-timeout', actorId: 'v2', actor: 'Fen', tick: 420, number: 2 },
      { kind: 'failure', requestId: 'fen-timeout', tick: 420, text: s.world.pauseReason }]);
    const before = s.export(), id = s.world.id; enableRecovery(s); enableRecovery(s);
    assert.equal(s.world.maxCalls, 1452); assert.equal(s.world.plannedCalls, 1440); assert.equal(s.world.retriesUsed, 0);
    assert.equal(s.world.running, false); assert.equal(s.world.id, id); assert.deepEqual(s.world.agents, before.world.agents);
    assert.deepEqual(s.export().records.slice(0, 4), before.records);
    assert.equal(s.export().records.filter(x => x.kind === 'recovery_policy').length, 1);
    const called = []; const r = new Runner(s, { decide: async o => { called.push(o.name); return { decision }; } }, undefined, { retryDelays: [0, 0] });
    await r.step(true);
    assert.deepEqual(called, ['Fen', 'Asha', 'Bolt', 'Luma', 'Reed']); assert.equal(s.world.calls, 7); assert.equal(s.world.retriesUsed, 1);
    const replacement = s.export().records.find(x => x.kind === 'request' && x.retryOf === 'fen-timeout');
    assert.equal(replacement.automaticRetry, false); assert.equal(replacement.attemptNumber, 2);
    assert.equal(decisionLedger(s).filter(x => x.outcome === 'failed').length, 1);
  } finally { f.close(); }
});

test('persistent timeouts stop after two automatic retries and all failed attempts remain linked', async () => {
  const f = fixture(), s = f.store; let calls = 0;
  try {
    const r = new Runner(s, { decide: async () => { calls++; throw timeout(); } }, undefined, { retryDelays: [0, 0] });
    await assert.rejects(r.step(true), /automatic recovery exhausted/);
    assert.equal(calls, 3); assert.equal(s.world.calls, 3); assert.equal(s.world.retriesUsed, 2); assert.equal(s.world.running, false);
    assert.equal(s.world.tick, 0); assert.equal(r.activeRequest, null); assert.equal(r.retryState, null);
    assert.equal(decisionLedger(s).length, 3); assert.ok(decisionLedger(s).every(x => x.outcome === 'failed'));
  } finally { f.close(); }
});

test('retry allowance is a persistent hard bound, including manual replacement attempts after restart', async () => {
  const f = fixture(); let s = f.store, calls = 0;
  try {
    s.world.recovery.retryLimit = 1; s.world.maxCalls = s.world.plannedCalls + 1;
    let r = new Runner(s, { decide: async () => { calls++; throw timeout(); } }, undefined, { retryDelays: [0, 0] });
    await assert.rejects(r.step(true), /exhausted/); assert.equal(calls, 2); assert.equal(s.world.retriesUsed, 1);
    s.close(); s = new WorldStore(f.path); enableRecovery(s);
    r = new Runner(s, { decide: async () => { calls++; return { decision }; } });
    await assert.rejects(r.step(true), /retry allowance exhausted/);
    assert.equal(calls, 2); assert.equal(s.world.calls, 2); assert.equal(s.world.maxCalls, s.world.plannedCalls + 1);
    assert.equal(s.world.running, false);
  } finally { s.close(); rmSync(f.dir, { recursive: true, force: true }); }
});

test('owner Pause cancels backoff immediately and a late failed response cannot restart or overwrite that pause', async () => {
  for (const phase of ['backoff', 'inference']) {
    const f = fixture(), s = f.store; let calls = 0, rejectResponse;
    try {
      const r = new Runner(s, { decide: async () => { calls++; if (phase === 'inference') return new Promise((_, reject) => { rejectResponse = reject; }); throw timeout(); } }, undefined, { retryDelays: [60000, 60000] });
      const pending = r.step(true);
      for (let i = 0; i < 100 && !(phase === 'backoff' ? r.retryWait : rejectResponse); i++) await new Promise(resolve => setImmediate(resolve));
      assert.ok(phase === 'backoff' ? r.retryWait : rejectResponse);
      r.pause('Paused by owner'); if (rejectResponse) rejectResponse(timeout()); await pending;
      assert.equal(calls, 1); assert.equal(s.world.calls, 1); assert.equal(s.world.tick, 0); assert.equal(s.world.pauseReason, 'Paused by owner');
      assert.equal(r.retryWait, null); assert.equal(r.retryState, null); assert.equal(s.world.running, false);
    } finally { f.close(); }
  }
});

test('authentication, quota, malformed output, memory failures and unknown failures pause without automatic retries', async () => {
  for (const code of ['unauthorized', 'usageLimitExceeded', 'rateLimitExceeded', 'invalid_decision', 'memory_kill_observed', 'cleanup_failed', 'unclassified']) {
    const f = fixture(); let calls = 0;
    try {
      const r = new Runner(f.store, { decide: async () => { calls++; const e = new Error('Provider failed'); e.diagnosticCode = code; throw e; } }, undefined, { retryDelays: [0, 0] });
      await assert.rejects(r.step(true)); assert.equal(calls, 1); assert.equal(f.store.world.retriesUsed, 0);
    } finally { f.close(); }
  }
  assert.equal(transientFailure('httpConnectionFailed', 401), false); assert.equal(transientFailure('httpConnectionFailed', 429), false);
  assert.equal(transientFailure('httpConnectionFailed', 503), true);
});

test('real worker teardown completes before the runner recovers a timeout with a fresh worker', async () => {
 const f=fixture(),s=f.store,binary=fileURLToPath(new URL('./fake-codex.js',import.meta.url));chmodSync(binary,0o755);
 const events=[],c=new CodexClient({dataDir:f.dir,binary,timeout:500,onDiagnostic:e=>events.push(e)});
 try{
  s.world.agents[0].name='TimeoutOnce';
  const r=new Runner(s,c,undefined,{retryDelays:[0,0]});await r.step(true);
  assert.equal(s.world.calls,7);assert.equal(s.world.retriesUsed,1);assert.equal(s.world.tick,12);
  let active=0,max=0;
  for(const e of events.filter(x=>x.role==='decision')){if(e.event==='codex_start')active++;if(e.event==='codex_exit')active--;max=Math.max(max,active);}
  assert.equal(max,1);assert.equal(active,0);assert.equal(c.decisionWorker,null);
  assert.equal(decisionLedger(s).filter(x=>x.outcome==='failed').length,1);
 }finally{await c.stop();f.close();}
});

test('owner Play activates recovery for a paused old v4 run while anonymous access cannot change its budget', async () => {
 const dir=mkdtempSync(join(tmpdir(),'village-resume-http-'));let app;
 const previous=process.env.OWNER_SETUP_TOKEN;process.env.OWNER_SETUP_TOKEN='test-resume-only';
 try{
  app=createApp({dataDir:dir,intervalMs:100000,codex:{ready:false,start:async()=>{},readAccount:async()=>{},status:()=>({connected:true}),stop(){}}});
  app.store.reset('chatgpt','test-model');delete app.store.world.recovery;delete app.store.world.plannedCalls;delete app.store.world.retriesUsed;app.store.world.maxCalls=1440;
  app.store.world.pauseReason='Villager decision timed out; run paused';app.store.save();const id=app.store.world.id;
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
  const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  assert.equal((await post('/api/admin/run',{})).status,401);assert.equal(app.store.world.maxCalls,1440);
  const claim=await post('/api/claim',{token:'test-resume-only'}),cookie=claim.headers.get('set-cookie').split(';')[0];
  const response=await post('/api/admin/run',{},cookie);assert.equal(response.status,200);
  const state=await response.json();assert.equal(state.world.id,id);assert.equal(state.world.running,true);assert.equal(state.world.maxCalls,1452);
  assert.equal(state.world.recovery.retryLimit,12);assert.equal(state.world.calls,0);
  await post('/api/admin/pause',{},cookie);
 }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.OWNER_SETUP_TOKEN;else process.env.OWNER_SETUP_TOKEN=previous;}
});


test('identifiable thread startup failure retries with a reaped fresh worker and preserves its failure link',async()=>{
 const f=fixture(),s=f.store,c=new CodexClient({dataDir:f.dir,binary:fileURLToPath(new URL('./fake-codex.js',import.meta.url))});
 try{s.world.model='StartupOnce';const r=new Runner(s,c,undefined,{retryDelays:[0,0]});await r.step(true);
 assert.equal(s.world.calls,7);assert.equal(s.world.retriesUsed,1);assert.equal(s.world.tick,12);assert.equal(c.decisionWorker,null);
 const rows=s.export().records,failure=rows.find(r=>r.kind==='failure');assert.equal(failure.failureCode,'worker_startup_transient');assert.ok(rows.some(r=>r.kind==='request'&&r.retryOf===failure.requestId));
 }finally{await c.stop();f.close();}
});

test('owner worker recovery restarts only the connection and resumes the five saved v6 proposals without repurchasing them',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-owner-repair-'));const prior=process.env.OWNER_SETUP_TOKEN;process.env.OWNER_SETUP_TOKEN='test-worker-repair';let app,starts=0,stops=0;const called=[];
 try{const codex={ready:false,start:async()=>{starts++;},readAccount:async()=>{},stop:async()=>{stops++;},status:()=>({connected:true}),decide:async input=>{called.push(input.name);return{decision:{...decision,price:0,offerId:0}};}};
 app=createApp({dataDir:dir,intervalMs:100000,codex});app.batches.create('chatgpt','test-model',{village:true,days:10},1);const w=app.store.world;w.tick=432;w.nextDecisionTick=432;w.calls=222;w.pauseReason='Codex rejected request';
 w.decisionRound={tick:432,decisions:w.agents.slice(0,5).map(a=>({actorId:a.id,decision:{...decision,price:0,offerId:0}}))};
 app.store.save([{kind:'request',requestId:'reed-failed',actorId:'v6',actor:'Reed',tick:432},{kind:'failure',requestId:'reed-failed',failureCode:'unclassified',tick:432,text:'Codex rejected request'}]);const id=w.id,before=structuredClone(w.agents);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const post=(path,body={},cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
 assert.equal((await post('/api/admin/recover')).status,401);
 const claim=await post('/api/claim',{token:'test-worker-repair'}),cookie=claim.headers.get('set-cookie').split(';')[0];
 const response=await post('/api/admin/recover',{},cookie);assert.equal(response.status,200);assert.equal(stops,1);assert.ok(starts>=1);assert.equal(w.id,id);assert.equal(w.tick,432);assert.equal(w.calls,222);assert.equal(w.running,true);assert.deepEqual(w.agents,before);assert.equal(w.decisionRound.decisions.length,5);
 assert.equal((await post('/api/admin/recover',{},cookie)).status,400);await app.runner.step();assert.deepEqual(called,['Reed']);assert.equal(w.calls,223);assert.equal(w.retriesUsed,1);assert.equal(w.id,id);assert.equal(w.version,'world-v6');assert.ok(app.store.export().records.some(r=>r.kind==='failure'&&r.requestId==='reed-failed'));assert.ok(app.store.export().records.some(r=>r.kind==='request'&&r.retryOf==='reed-failed'));
 }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});if(prior===undefined)delete process.env.OWNER_SETUP_TOKEN;else process.env.OWNER_SETUP_TOKEN=prior;}
});
