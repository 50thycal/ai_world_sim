import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

test('HTTP owner claim, CSRF, read-only spectators, exports and restart persistence', async () => {
  const dir=mkdtempSync(join(tmpdir(),'world-http-'));process.env.OWNER_SETUP_TOKEN='test-owner-capability';
  const fake={ready:false,status:()=>({connected:false}),stop(){}};
  const app=createApp({dataDir:dir,codex:fake,intervalMs:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const post=(p,b,cookie,origin)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:JSON.stringify(b)});
  try{
    const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).version,'0.6.0');
    assert.equal((await post('/api/admin/run',{})).status,401);
    assert.equal((await fetch(base+'/api/admin/status')).status,401);
    assert.equal((await fetch(base+'/api/admin/diagnostics')).status,401);
    assert.equal((await fetch(base+'/data/owner.json')).status,404);
    assert.equal((await post('/api/claim',{token:'wrong'})).status,403);
    const claim=await post('/api/claim',{token:'test-owner-capability'});assert.equal(claim.status,200);const cookie=claim.headers.get('set-cookie').split(';')[0];
    const diagnostics=await (await fetch(base+'/api/admin/diagnostics',{headers:{cookie}})).json();
    assert.equal(diagnostics.format,'ai-world-diagnostics-v1');assert.equal(diagnostics.runId,app.store.world.id);
    assert.ok(!JSON.stringify(diagnostics).includes('test-owner-capability'));assert.ok(!JSON.stringify(diagnostics).includes('signingKey'));
    assert.equal((await post('/api/claim',{token:'test-owner-capability'})).status,403);
    assert.equal((await post('/api/admin/step',{},cookie,'https://evil.invalid')).status,403);
    assert.equal((await post('/api/admin/step',{},cookie)).status,200);
    const state=await (await fetch(base+'/api/state')).json();assert.equal(state.world.agents.length,6);assert.equal(state.world.tick,1);assert.equal(state.world.mode,'demo');assert.equal(state.appVersion,'0.6.0');assert.equal(state.world.version,'world-v4');
    const exported=await (await fetch(base+'/api/admin/export',{headers:{cookie}})).json();assert.equal(exported.format,'ai-world-run-v1');assert.ok(!JSON.stringify(exported).includes('signingKey'));
    const frames=await (await fetch(base+'/api/frames')).json();assert.equal(frames.length,1);
    assert.equal((await (await fetch(base+'/api/frame/'+frames[0].id)).json()).world.tick,1);
    const fresh=await post('/api/admin/new',{mode:'demo'},cookie);assert.equal(fresh.status,200);
    const freshState=await fresh.json();assert.notEqual(freshState.world.id,state.world.id);assert.equal(freshState.world.running,false);
    assert.equal(app.store.db.prepare('SELECT count(*) n FROM worlds').get().n,2);
    assert.equal(app.store.db.prepare('SELECT count(*) n FROM frames WHERE run=?').get(state.world.id).n,1);
    await post('/api/admin/run',{},cookie);
    const blocked=await post('/api/admin/new',{mode:'demo'},cookie);assert.equal(blocked.status,400);assert.match((await blocked.json()).error,/Pause/);
    await post('/api/admin/pause',{},cookie);
    const unknown=await post('/api/admin/new',{mode:'demo',scenario:'__proto__'},cookie);assert.equal(unknown.status,400);assert.match((await unknown.json()).error,/scenario/);
    const commons=await (await post('/api/admin/new',{mode:'demo',scenario:'commons',personas:true},cookie)).json();
    assert.equal(commons.world.scenario.id,'commons');assert.equal(commons.world.personas,true);assert.equal(commons.metrics.orchard,6);assert.ok(commons.world.agents.every(a=>a.persona));
    assert.equal(commons.world.days,10);assert.equal(commons.world.maxCalls,1452);assert.equal(commons.world.socialStart,true);
    for(const days of [0,31,2.5,'10']) assert.equal((await post('/api/admin/new',{mode:'demo',days},cookie)).status,400);
    assert.equal((await post('/api/admin/new',{mode:'demo',socialStart:'yes'},cookie)).status,400);
    const shorter=await (await post('/api/admin/new',{mode:'demo',days:3,socialStart:false},cookie)).json();
    assert.equal(shorter.world.days,3);assert.equal(shorter.world.maxTicks,864);assert.equal(shorter.world.maxCalls,444);assert.equal(shorter.world.socialStart,false);
    const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await home.text(),/Little Commons/);
    const script=await fetch(base+'/app.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});delete process.env.OWNER_SETUP_TOKEN;}
});

 test('unchanged setup token stays consumed after restart; explicit rotation restores access and preserves the run', async () => {
  const dir=mkdtempSync(join(tmpdir(),'world-recovery-'));
  const fake={ready:false,status:()=>({connected:false}),stop(){}};
  let app;
  const open=async()=>{app=createApp({dataDir:dir,codex:fake,intervalMs:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${app.server.address().port}`;};
  const claim=(base,token)=>fetch(base+'/api/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  try {
    process.env.OWNER_SETUP_TOKEN='initial-test-key';let base=await open();const id=app.store.world.id;
    assert.equal((await claim(base,'initial-test-key')).status,200);await app.close();
    base=await open();assert.equal((await claim(base,'initial-test-key')).status,403);await app.close();
    process.env.OWNER_SETUP_TOKEN='rotated-test-key';base=await open();assert.equal(app.store.world.id,id);
    assert.equal((await claim(base,'initial-test-key')).status,403);assert.equal((await claim(base,'rotated-test-key')).status,200);
  } finally {if(app)await app.close();rmSync(dir,{recursive:true,force:true});delete process.env.OWNER_SETUP_TOKEN;}
});
