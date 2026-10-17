import { mkdirSync, chownSync } from 'node:fs';
import { resolve } from 'node:path';
// Railway mounts a fresh volume as root. Prepare only its top-level directory,
// then permanently drop privilege before starting HTTP or Codex.
const dataDir=resolve(process.env.DATA_DIR||'data');
mkdirSync(dataDir,{recursive:true,mode:0o700});
if(process.getuid?.()===0){chownSync(dataDir,1000,1000);process.setgid(1000);process.setuid(1000);}
process.argv[1]=resolve('src/server.js');
await import('../src/server.js');
