import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
// Operator-only recovery. Does not read or print Codex credentials or alter village evidence.
const dir=resolve(process.env.DATA_DIR||'data'),file=join(dir,'owner.json');
const owner=JSON.parse(readFileSync(file,'utf8')),token=randomBytes(32).toString('hex');
owner.setupHash=createHash('sha256').update(token).digest('hex');owner.claimed=false;
writeFileSync(file+'.tmp',JSON.stringify(owner),{mode:0o600});renameSync(file+'.tmp',file);
console.log(`${process.env.PUBLIC_URL||'http://localhost:8080'}/#setup=${token}`);
