// No credentials, writes or model calls. Works in Codex, Claude Code and ordinary Node 24.
const args = process.argv.slice(2);
const options = { url: 'https://village-production-4258.up.railway.app', run: null, evidence: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--evidence') options.evidence = true;
  else if (['--url', '--run'].includes(args[i]) && args[i + 1]) options[args[i].slice(2)] = args[++i];
  else throw new Error('Usage: npm run inspect:sim -- [--url https://host] [--run RUN_ID] [--evidence]');
}
const base = new URL(options.url);
if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Use a plain HTTP(S) base URL without credentials');
async function get(path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw new Error(`Simulation read failed: HTTP ${response.status} at ${path}. Check deployment and /api/research availability.`);
  return response.json();
}
try {
  const discovery = await get('/api/research');
  const run = options.run || discovery.currentRunId;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(run)) throw new Error('Invalid run ID');
  const path = `/api/research/runs/${run}`;
  const report = await get(path);
  const result = { source: base.origin, retrievedAt: new Date().toISOString(), report, runtime: await get('/api/research/runtime') };
  if (options.evidence) {
    for (const collection of ['records', 'diagnostics', 'frames']) {
      const pages = [], through = report.evidence[collection].lastId || 0;
      let after = 0;
      do {
        const page = await get(`${path}/${collection}?limit=200&after=${after}&through=${through}`);
        pages.push(page);
        if (page.nextAfter === null) break;
        if (page.nextAfter <= after) throw new Error('Nonadvancing evidence cursor');
        after = page.nextAfter;
      } while (true);
      result[collection] = pages;
    }
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) { console.error(error.message); process.exitCode = 1; }
