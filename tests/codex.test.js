import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexClient, isolatedConfig, rpcFailure } from '../src/codex.js';
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
    await assert.rejects(c.decide({name:'TriggerFailure'},'test-model'),/failed/);
  }finally{c.stop();await new Promise(r=>setTimeout(r,300));rmSync(dir,{recursive:true,force:true});}
});
test('official pinned Codex binary accepts isolated initialization and account/read',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'codex-protocol-')),c=new CodexClient({dataDir:dir});
  try{await c.start();assert.equal(c.status().available,true);assert.equal(c.status().connected,false);}finally{c.stop();await new Promise(r=>setTimeout(r,200));rmSync(dir,{recursive:true,force:true});}
});

test('device-login failures give bounded actionable messages without exposing upstream secrets',()=>{
 assert.match(rpcFailure({message:'failed to request device code: HTTP 403 secret-token-do-not-echo'},'account/login/start'),/HTTP 403/);
 assert.ok(!rpcFailure({message:'failed to request device code secret-token-do-not-echo'},'account/login/start').includes('secret-token'));
 assert.match(rpcFailure({message:'Device authentication is disabled'},'account/login/start'),/Settings → Security/);
 assert.match(rpcFailure({message:'unknown variant'},'account/login/start'),/compatibility/);
});
