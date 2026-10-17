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
    assert.equal((await fetch(base+'/health')).status,200);
    assert.equal((await post('/api/admin/run',{})).status,401);
    assert.equal((await fetch(base+'/api/admin/status')).status,401);
    assert.equal((await fetch(base+'/data/owner.json')).status,404);
    assert.equal((await post('/api/claim',{token:'wrong'})).status,403);
    const claim=await post('/api/claim',{token:'test-owner-capability'});assert.equal(claim.status,200);const cookie=claim.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/claim',{token:'test-owner-capability'})).status,403);
    assert.equal((await post('/api/admin/step',{},cookie,'https://evil.invalid')).status,403);
    assert.equal((await post('/api/admin/step',{},cookie)).status,200);
    const state=await (await fetch(base+'/api/state')).json();assert.equal(state.world.agents.length,6);assert.equal(state.world.tick,1);assert.equal(state.world.mode,'demo');
    const exported=await (await fetch(base+'/api/admin/export',{headers:{cookie}})).json();assert.equal(exported.format,'ai-world-run-v1');assert.ok(!JSON.stringify(exported).includes('signingKey'));
    const frames=await (await fetch(base+'/api/frames')).json();assert.equal(frames.length,1);
    assert.equal((await (await fetch(base+'/api/frame/'+frames[0].id)).json()).world.tick,1);
    const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await home.text(),/Little Commons/);
    const script=await fetch(base+'/app.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});delete process.env.OWNER_SETUP_TOKEN;}
});
