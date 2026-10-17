import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexClient } from '../src/codex.js';
const dir=mkdtempSync(join(tmpdir(),'village-codex-'));
const c=new CodexClient({dataDir:dir});
try{
  await c.start();
  if(c.status().connected)throw new Error('Credential isolation failed');
  console.log(JSON.stringify({handshake:'passed',accountIsolation:'passed',liveInference:'not run; owner phone sign-in required'}));
}finally{await c.stop();rmSync(dir,{recursive:true,force:true});}
