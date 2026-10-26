import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diskSpace, requireStorage, MIN_FREE_BYTES, encodeRecord, decodeRecord } from '../src/storage.js';
import { WorldStore } from '../src/world.js';
import { Batches } from '../src/batches.js';
import { Runner } from '../src/runner.js';
import { Research } from '../src/research.js';
import { compactEvidence } from '../scripts/compact-evidence.js';
import { Diagnostics, sqliteWriteCondition, failureCode } from '../src/diagnostics.js';

test('filesystem headroom uses unprivileged available blocks; unknown/full space is terminal', () => {
  const space = diskSpace('ignored', () => ({blocks:100n,bavail:2n,bfree:90n,bsize:4096n}));
  assert.equal(space.availableBytes,8192);
  assert.throws(()=>requireStorage(space), {diagnosticCode:'storage_low'});
  assert.throws(()=>requireStorage(diskSpace('ignored',()=>{throw Error('SECRET');})), {diagnosticCode:'storage_unavailable'});
  assert.doesNotThrow(()=>requireStorage({availableBytes:MIN_FREE_BYTES}));
  assert.equal(sqliteWriteCondition({errcode:13,message:'SECRET'}),'storage_full');
  assert.equal(failureCode({errcode:13,message:'SECRET'}),'storage_full');
  assert.equal(sqliteWriteCondition({errcode:10 | (2<<8)}),'database_io');
  assert.equal(sqliteWriteCondition({message:'SECRET'}),'database_write_failed');
});
test('mixed legacy/compressed inputs survive API, export, compaction and restart with stable evidence IDs', () => {
  const dir=mkdtempSync(join(tmpdir(),'village-storage-')),path=join(dir,'w.sqlite'); let store=new WorldStore(path);
  const input={observation:{name:'Mira',unicode:'こんにちは',memories:Array(200).fill('identical witnessed memory')},instructions:'unchanged',outputSchema:{type:'object'},effort:'low'};
  const legacy={kind:'request',requestId:'legacy',number:1,actorId:'v1',tick:0,input};
  const current={...legacy,requestId:'compressed',number:2};
  const encoded=encodeRecord(current); assert.deepEqual(decodeRecord(encoded),current); assert.ok(encoded.length<JSON.stringify(current).length/4);
  try {
    const id=store.world.id;
    store.db.prepare('INSERT INTO records(run,tick,kind,data) VALUES (?,?,?,?)').run(id,0,'request',JSON.stringify(legacy));
    store.save([current,{kind:'failure',requestId:'compressed',failureCode:'timeout'}],true);
    const api=new Research(store,new Diagnostics(store.db,{log(){}}),{});
    const report=api.report({world:store.world,updated:''}); assert.equal(report.evidence.capturedInputs,2);
    assert.deepEqual(report.requests.map(r=>r.outcome),['unresolved','failed']);
    const page=api.page('records',id,new URLSearchParams()); const records=store.export().records;
    assert.deepEqual(page.items.map(r=>r.data),records);
    const ids=page.items.map(r=>r.id),frames=store.frames(); store.close();
    const stats=compactEvidence(path); assert.equal(stats.requestsCompressed,1);
    store=new WorldStore(path); assert.equal(store.world.id,id); assert.equal(store.world.running,false);
    assert.deepEqual(store.export().records,records); assert.deepEqual(store.frames(),frames);
    const idsAfter=new Research(store,{writeFailures:0,limit:20000},{}).page('records',id,new URLSearchParams()).items.map(r=>r.id);
    assert.deepEqual(idsAfter,ids); store.close(); assert.equal(compactEvidence(path).requestsCompressed,0); store=new WorldStore(path);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
test('low space pauses before buying a request and preserves saved proposals and budgets', async () => {
  const dir=mkdtempSync(join(tmpdir(),'village-low-disk-')),store=new WorldStore(join(dir,'w.sqlite'));
  try {
    store.reset('chatgpt','test-model'); store.world.decisionRound={tick:0,decisions:[{actorId:'v1',decision:{action:'wait',target:'none',item:'none',message:'',reason:''}}]}; store.save();
    const pending=structuredClone(store.world.decisionRound); const calls=store.world.calls; let started=0;
    store.checkStorage=()=>requireStorage({availableBytes:1});
    await assert.rejects(new Runner(store,{decide(){started++;}}).step(true),{diagnosticCode:'storage_low'});
    assert.equal(started,0);assert.equal(store.world.calls,calls);assert.equal(store.world.retriesUsed,0);assert.equal(store.world.running,false);
    assert.deepEqual(store.world.decisionRound,pending);
    assert.equal(store.records().at(-1).failureCode,'storage_low');
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});

test('SQLite full preserves the original write error when SQLite already rolled back',()=>{
 const dir=mkdtempSync(join(tmpdir(),'village-sqlite-full-')),store=new WorldStore(join(dir,'w.sqlite'));
 try {
  store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const pages=store.db.prepare('PRAGMA page_count').get().page_count;
  store.db.exec(`PRAGMA max_page_count=${pages}`);
  assert.throws(()=>store.save([{kind:'talk',text:'x'.repeat(1000000)}]),error=>error.errcode===13);
  assert.equal(store.db.isTransaction,false);assert.equal(store.records().length,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('new-world storage guard refuses low or unknown space without cancelling queues or changing evidence',()=>{
  const dir=mkdtempSync(join(tmpdir(),'village-admission-space-')),store=new WorldStore(join(dir,'w.sqlite'));
  try {
    const batches=new Batches(store,new Runner(store,{}));batches.create('demo',null,{adaptive:true});
    const before={world:structuredClone(store.world),batch:structuredClone(batches.batch),rows:store.db.prepare('SELECT * FROM worlds ORDER BY id').all()};
    for(const space of [{availableBytes:0},{availableBytes:null}]){
      store.checkStorage=()=>requireStorage(space);
      assert.throws(()=>batches.create('demo',null,{adaptive:true}),/storage|Storage/);
      assert.throws(()=>store.reset('demo',null,{}),/storage|Storage/);
      assert.deepEqual(store.world,before.world);assert.deepEqual(batches.batch,before.batch);
      assert.deepEqual(store.db.prepare('SELECT * FROM worlds ORDER BY id').all(),before.rows);
    }
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
