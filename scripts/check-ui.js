// Automated browser acceptance against disposable local data, never the live service or Codex.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

const dir = mkdtempSync(join(tmpdir(), 'village-browser-'));
const app = createApp({ dataDir: dir, codex: { ready: false, stop() {}, status: () => ({ connected: false, available: true }) }, intervalMs: 100000 });
const screenshots = 'test-results'; mkdirSync(screenshots, { recursive: true });
let browser;
try {
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const owner = JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')), expiry = String(Date.now() + 3600000);
  const value = `${expiry}.${createHmac('sha256', owner.signingKey).update(expiry).digest('hex')}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
    app.store.reset('demo', null, { scenario: 'commons', days: 10 });
    while (app.store.world.tick < 576) await app.runner.step(true);
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: 'village_owner', value, url: base }]);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.getByText('Day 3 / 10 · 00:00', { exact: true }).waitFor();
    assert.equal(await page.locator('#day-rows tr').count(), 2);
    assert.match(await page.locator('#inspector').innerText(), /SOCIAL NOTEBOOK/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${screenshots}/v4-${name}-world.png`, fullPage: true });
    await page.getByRole('button', { name: 'Owner controls ↗' }).click();
    assert.equal(await page.getByLabel('Simulation days').inputValue(), '10');
    assert.equal(await page.getByLabel('Encourage introductions on arrival').isChecked(), true);
    await page.getByLabel('Condition', { exact: true }).selectOption('sustainable');
    await page.getByLabel('Simulation days').fill('3');
    assert.match(await page.locator('#run-budget').innerText(), /432 planned.*12 retries.*444 model requests/);
    // Check layout and owner form at the actual phone viewport, not a cropped desktop image.
    assert.ok(await page.locator('#owner-dialog').evaluate(e => e.getBoundingClientRect().right <= innerWidth));
    await page.screenshot({ path: `${screenshots}/v4-${name}-setup.png` });
    await page.getByRole('button', { name: 'Start a new v4 paused run' }).click();
    await page.getByText('New run ready. Press Play village to begin.', { exact: true }).waitFor();
    assert.equal(app.store.world.scenario.id, 'sustainable');
    await page.getByText(/Each site replenishes 1 unit every 2 simulated hours/).waitFor();
    assert.equal(app.store.world.days, 3); assert.equal(app.store.world.maxCalls, 444); assert.equal(app.store.world.running, false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Browser acceptance passed: ${name} ${viewport.width}x${viewport.height}; daily results, private notebooks, duration/budget and paused creation.`);
  }
} finally {
  if (browser) await browser.close();
  await app.close(); rmSync(dir, { recursive: true, force: true });
}
