import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createApp } from '../src/server.js';
import { INSTRUCTIONS } from '../src/codex.js';
import { Research } from '../src/research.js';

test('public research retrieves archived evidence with bounded stable pages, scoped frames and no owner powers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'world-research-'));
  const fake = { ready: false, status: () => ({ connected: false }), stop() {} };
  let app;
  const open = async () => {
    app = createApp({ dataDir: dir, codex: fake, intervalMs: 100000 });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${app.server.address().port}`;
  };
  try {
    let base = await open();
    writeFileSync(join(dir, 'credential-sentinel'), 'NEVER-EXPORTED');
    const id = app.store.world.id;
    app.store.save([{ kind: 'request', requestId: 'uncertain', number: 1 }, { kind: 'request', number: 2 }], true);
    app.store.save(Array.from({ length: 205 }, (_, i) => ({ kind: 'blocked', text: `blocked ${i}`, tick: 0 })));
    app.diagnostics.emit({ event: 'decision_failed', runId: id, requestId: 'uncertain', failureCode: 'timeout', stderr: 'NEVER-EXPORTED', token: 'NEVER-EXPORTED' });
    const frame = app.store.frames()[0].id;
    app.store.reset('demo', null, { scenario: 'inequality' });
    app.diagnostics.emit({ event: 'decision_requested', runId: app.store.world.id, requestId: 'other-run' });
    const get = async path => {
      const response = await fetch(base + path); assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const text = await response.text();
      for (const secret of ['NEVER-EXPORTED', 'signingKey', 'setupHash', 'userCode', 'verificationUrl']) assert.ok(!text.includes(secret));
      return JSON.parse(text);
    };
    const discovery = await get('/api/research'); assert.equal(discovery.maxPageSize, 200);
    const runs = await get('/api/research/runs'); assert.equal(runs.runs.length, 2);
    assert.equal(runs.runs.find(r => r.id === id).current, false);
    const report = await get(`/api/research/runs/${id}`);
    assert.equal(report.run.scenario.id, 'plenty'); assert.equal(report.evidence.missingInputs, 2);
    assert.deepEqual(report.requests.map(r => r.outcome), ['unresolved', 'legacy_unlinked']);
    const through = report.evidence.records.lastId;
    // Concurrent append to the archived run must not escape the original watermark.
    app.store.db.prepare('INSERT INTO records(run,tick,kind,data) VALUES (?,?,?,?)').run(id, 0, 'blocked', JSON.stringify({ kind: 'blocked', text: 'later' }));
    const first = await get(`/api/research/runs/${id}/records?limit=99999&through=${through}`);
    assert.equal(first.items.length, 200); assert.ok(first.nextAfter);
    const last = await get(`/api/research/runs/${id}/records?after=${first.nextAfter}&through=${through}`);
    assert.equal(last.items.length, 7); assert.equal(last.nextAfter, null);
    assert.equal(new Set([...first.items, ...last.items].map(r => r.id)).size, 207);
    const diag = await get(`/api/research/runs/${id}/diagnostics`);
    assert.ok(diag.items.every(r => r.data.runId === id)); assert.ok(!JSON.stringify(diag).includes('other-run'));
    const frames = await get(`/api/research/runs/${id}/frames`); assert.equal(frames.items[0].id, frame);
    assert.equal((await get(`/api/research/runs/${id}/frames/${frame}`)).world.id, id);
    assert.equal((await fetch(`${base}/api/research/runs/${app.store.world.id}/frames/${frame}`)).status, 404);
    for (const q of ['after=-1', 'limit=NaN', 'through=9007199254740992']) assert.equal((await fetch(`${base}/api/research/runs/${id}/records?${q}`)).status, 400);
    assert.equal((await fetch(`${base}/api/research/runs/missing`)).status, 404);
    assert.equal((await fetch(`${base}/api/admin/diagnostics`)).status, 401);
    for (const path of ['/api/research', '/api/admin/run', '/api/admin/new', '/api/admin/step', '/api/admin/connect']) {
      assert.equal((await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    }
    assert.equal(app.store.world.tick, 0); assert.equal(app.store.world.calls, 0);
    const oldCurrent = app.store.world.id;
    await app.close(); base = await open();
    assert.equal((await get(`/api/research/runs/${id}`)).evidence.records.count, 208);
    assert.equal((await get('/api/research')).currentRunId, oldCurrent);
    assert.equal((await get('/api/research/runtime')).previousShutdown, 'clean');
    // Execute the actual agent command against HTTP; no API keys or owner cookies.
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/inspect-sim.js', '--url', base, '--run', id, '--evidence']);
      let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(Error(stderr)));
    });
    assert.equal(output.report.run.id, id);
    assert.equal(output.records.flatMap(p => p.items).length, 208);
    assert.equal(output.frames[0].items[0].id, frame);
  } finally { if (app) await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('exact private observation and protocol inputs persist before a failed inference without changing model input', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'world-inputs-'));
  let app;
  const fake = { stop() {}, decide: async (input, model, context) => {
    const stored = app.store.records(1)[0];
    assert.equal(stored.kind, 'request'); assert.equal(stored.requestId, context.requestId);
    assert.deepEqual(stored.input.observation, input); assert.equal(stored.input.instructions, INSTRUCTIONS);
    assert.equal(stored.input.effort, 'low'); assert.equal(stored.model, model);
    assert.equal(stored.actorId, 'v1'); assert.ok(stored.requestedAt);
    assert.ok(input.nearbyVillagers.every(v => !Object.hasOwn(v, 'inventory') && !Object.hasOwn(v, 'memories')));
    throw Error('Codex request timed out');
  } };
  try {
    app = createApp({ dataDir: dir, codex: fake, intervalMs: 100000 }); app.store.reset('chatgpt', 'test-model'); delete app.store.world.recovery;
    await assert.rejects(app.runner.step(true), /timed out/);
    assert.equal(app.store.world.calls, 1); assert.equal(app.store.world.running, false);
    const research = new Research(app.store, app.diagnostics, app.runner);
    const data = research.get(new URL(`http://local/api/research/runs/${app.store.world.id}`)).body;
    assert.equal(data.requests[0].outcome, 'failed'); assert.equal(data.evidence.capturedInputs, 1);
    assert.equal(data.evidence.missingInputs, 0);
    // Diagnostic retention must not delete the permanent request or its input.
    app.diagnostics.limit = 100;
    for (let i = 0; i < 110; i++) app.diagnostics.emit({ event: 'test' });
    assert.ok(app.store.records().find(r => r.kind === 'request').input.observation);
  } finally { if (app) await app.close(); rmSync(dir, { recursive: true, force: true }); }
});
