// Automated browser acceptance against disposable local data, never the live service or Codex.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { assign, advance } from '../src/world.js';

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
    assert.equal(await page.getByLabel('Separate runs').inputValue(), '5');
    assert.equal(await page.getByLabel('Requests, projects, homes & gatherings (v6)').isChecked(),true);
    assert.equal(await page.getByLabel('Encourage introductions on arrival').isChecked(), true);
    await page.locator('#scenario').selectOption('sustainable');
    await page.getByLabel('Simulation days').fill('3');
    assert.match(await page.locator('#run-budget').innerText(), /2,160 planned.*60 retries.*2,220 model requests/);
    // Check layout and owner form at the actual phone viewport, not a cropped desktop image.
    assert.ok(await page.locator('#owner-dialog').evaluate(e => e.getBoundingClientRect().right <= innerWidth));
    await page.screenshot({ path: `${screenshots}/v4-${name}-setup.png` });
    await page.getByRole('button', { name: 'Create paused batch' }).click();
    await page.getByText('Batch ready. Press Play village / batch to begin.', { exact: true }).waitFor();
    assert.equal(app.store.world.scenario.id, 'sustainable');
    assert.equal(app.store.world.version, 'world-v6');
    await page.getByRole('button', { name: 'Close owner controls' }).click();
    await page.getByRole('heading', { name: 'The village market' }).waitFor();
    await page.getByRole('heading', { name: 'Work, homes & the village green' }).waitFor();
    assert.equal(await page.locator('#village-projects article').count(),3);
    assert.equal(app.batches.batch.count,5);
    assert.equal(await page.locator('#market-roles > div').count(), 6);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${screenshots}/v5-${name}-market.png`, fullPage: true });
    // Exercise full stalls and a real engine transfer in disposable scripted data.
    for (const a of app.store.world.agents) assign(app.store.world, a, { action: 'offer', target: 'square', item: 'meal', price: 2, offerId: 0, message: '', reason: 'Browser fixture lists a meal.' });
    while (app.store.world.agents.some(a => a.task)) app.store.save(advance(app.store.world), true);
    await page.reload(); await page.locator('#market-offers .offer-card').first().waitFor();
    assert.equal(await page.locator('#market-offers .offer-card').count(), 6);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const offer = app.store.world.economy.offers.find(o => o.sellerId === 'v1');
    assign(app.store.world, app.store.world.agents[1], { action: 'buy', target: 'v1', item: offer.item, price: offer.price, offerId: offer.id, message: '', reason: 'Browser fixture accepts a listing.' });
    while (app.store.world.agents[1].task) app.store.save(advance(app.store.world), true);
    await page.reload(); await page.locator('#market-trades').getByText(/Fen.*bought 1 meal from Mira for 2 coins/).waitFor();
    assert.match(await page.locator('#inspector').innerText(), /LIVELIHOOD/);
    assert.equal(await page.locator('#market-offers .offer-card').count(), 5);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${screenshots}/v5-${name}-trade.png`, fullPage: true });
    await page.getByText(/Each site replenishes 1 unit every 2 simulated hours/).waitFor();
    assert.equal(app.store.world.days, 3); assert.equal(app.store.world.maxCalls, 444); assert.equal(app.store.world.running, false);
    const act = (a,d) => { assign(app.store.world,a,{price:0,offerId:0,message:'',reason:'Browser engine fixture.',...d});while(a.task)app.store.save(advance(app.store.world),true); };
    const [mira,fen,asha,bolt]=app.store.world.agents;
    act(mira,{action:'request',target:'square',item:'wood',price:2});
    fen.inventory.wood=1;app.store.save();
    await page.reload();await page.locator('#village-requests article').waitFor();
    assert.match(await page.locator('#village-requests').innerText(),/Bring 1 wood/);
    const request=app.store.world.village.requests[0];
    act(fen,{action:'fulfill',target:'v1',item:'wood',price:2,offerId:request.id});
    bolt.inventory.wood=2;act(bolt,{action:'craft_bed',target:'square',item:'bed'});act(bolt,{action:'furnish',target:'shelter',item:'bed'});
    asha.inventory.meal++;act(asha,{action:'host_meal',target:'square',item:'meal'});
    await page.reload();await page.locator('#village-gatherings article').waitFor();
    assert.match(await page.locator('#village-exchanges').innerText(),/Fen completed request for Mira/);
    await page.screenshot({path:`${screenshots}/v6-${name}-village.png`,fullPage:true});
    // A real five-run scripted queue populates comparison results and archival inspection.
    app.batches.create('demo',null,{village:true,days:1,socialStart:false});app.batches.play();
    while(app.batches.batch.status==='running'){await app.runner.step();app.batches.advance();}
    await page.reload();await page.locator('#batch-summary').getByText(/5\/5 complete/).waitFor();
    assert.equal(await page.locator('#batch-rows tr').count(),5);
    assert.match(await page.locator('#batch-aggregate').innerText(),/mean.*range/);
    await page.locator('[data-run]').first().click();await page.getByText('Recorded playback',{exact:true}).waitFor();
    assert.equal(await page.locator('#timeline').isDisabled(),true);
    await page.getByRole('button',{name:'Return to live'}).click();
    assert.equal(await page.locator('#timeline').isDisabled(),false);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${screenshots}/v6-${name}-batch.png`,fullPage:true});
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Browser acceptance passed: ${name} ${viewport.width}x${viewport.height}; daily results, private notebooks, duration/budget and paused creation.`);
  }
} finally {
  if (browser) await browser.close();
  await app.close(); rmSync(dir, { recursive: true, force: true });
}
