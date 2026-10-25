// Disposable real-browser checks for the recorded five-cycle review. Never calls the live provider.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtempSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {createApp} from '../src/server.js';
import {advance,assign} from '../src/world.js';
const cycle=Number(process.env.REVIEW_CYCLE||1),before=process.env.REVIEW_BEFORE==='1';
const dir=mkdtempSync(join(tmpdir(),'village-improvement-'));
const app=createApp({dataDir:dir,codex:{stop(){},status:()=>({connected:false,available:true})},intervalMs:100000});
let browser;
try{
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});mkdirSync('test-results',{recursive:true});
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['phone',{width:390,height:844}]]){
  app.batches.create('demo',null,{competitive:true,adaptive:cycle>=4,days:1},1);for(let i=0;i<12;i++)app.store.save(advance(app.store.world),true);
  if(cycle===5){
   if(process.env.REVIEW_EVIDENCE_DIR){
    const root=process.env.REVIEW_EVIDENCE_DIR,batch=JSON.parse(readFileSync(join(root,'batches.json'),'utf8')).batches[0];app.batches.batch=batch;
    for(const id of batch.runIds){const report=JSON.parse(readFileSync(join(root,id+'-report.json'),'utf8'));app.store.world=report.world;app.store.save([],false,batch);}
   }else{app.store.world.planning.stats.eventsHeld=1;app.store.world.community.stats.sharedExperiences=1;app.store.world.tick=app.store.world.maxTicks;app.batches.batch.status='completed';app.store.save([],false,app.batches.batch);}
  }
  const context=await browser.newContext({viewport});const owner=JSON.parse(readFileSync(join(dir,'owner.json'),'utf8')),expiry=String(Date.now()+3600000),cookie=`${expiry}.${createHmac('sha256',owner.signingKey).update(expiry).digest('hex')}`;
  await context.addCookies([{name:'village_owner',value:cookie,url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#residents .resident').first().waitFor();if(cycle!==5)await page.locator('#contest-scores article').first().waitFor();
  if(cycle===1){
   assert.equal(await page.locator('#contest-scores article').count(),6);
   await page.locator('#batch-rows [data-run]').first().click();await page.locator('#replay-banner').waitFor({state:'visible'});
   assert.equal(await page.locator('#contest-scores article').count(),before?0:6);
   if(!before){assert.match(await page.locator('#run-version').innerText(),/ARCHIVED/);await page.getByRole('button',{name:'Return to live'}).click();await page.locator('#replay-banner').waitFor({state:'hidden'});assert.equal(await page.locator('#contest-scores article').count(),6);}
  }
  if(cycle===4){
   const w=app.store.world,[host,guest]=w.agents;for(const a of w.agents){a.x=8;a.y=12;}host.inventory.wood=1;
   const act=(a,d)=>{assign(w,a,{price:0,offerId:0,message:'',reason:'Browser review fixture.',...d});while(a.task)app.store.save(advance(w),true);};
   act(host,{action:'host_event',target:'games',item:'leisure_kit',price:1});const e=w.planning.sharedEvents.entries[0];
   act(guest,{action:'rsvp_event',target:host.id,item:'none',offerId:e.id});
   act(host,{action:'event_plan',target:'square',item:'none',offerId:e.id});act(guest,{action:'attend_plan',target:host.id,item:'none',price:1,offerId:e.id});
   await page.reload();await page.locator('#shared-events-board article').waitFor();assert.match(await page.locator('#shared-events-board').innerText(),/RSVP: Fen/);
   assert.match(await page.locator('#community-plans').innerText(),/Attend event/);
   await page.screenshot({path:`test-results/cycle4-waiting-${name}.png`,fullPage:true});await page.locator('#community-plans').screenshot({path:`test-results/cycle4-plans-${name}.png`});
   for(let i=0;(host.workPlan||guest.workPlan||host.task||guest.task)&&i<200;i++)app.store.save(advance(w),true);
   await page.reload();await page.locator('#shared-events-summary').getByText(/1 held/).waitFor();assert.equal(w.planning.stats.eventsHeld,1);assert.equal(host.coins,9);assert.equal(guest.coins,7);assert.match(await page.locator('#market-summary').innerText(),/48 coins total/);
  }
  if(cycle===5){
   if(before)assert.equal(await page.locator('#village-overview').count(),0);
   else{
    await page.getByRole('heading',{name:'The village at a glance'}).waitFor();
    assert.match(await page.locator('#overview-status').innerText(),/complete/i);
    if(process.env.REVIEW_EVIDENCE_DIR){assert.match(await page.locator('#overview-batch').innerText(),/7 raw meals/);assert.match(await page.locator('#overview-batch').innerText(),/44 paid jobs/);assert.match(await page.locator('#overview-batch').innerText(),/68/);}
    else assert.equal(await page.locator('#batch-rows tr td').nth(6).innerText(),'1');
    assert.ok(await page.locator('#village-overview').evaluate(e=>e.getBoundingClientRect().top<innerHeight));
    await page.getByRole('link',{name:'Work & trade',exact:true}).click();assert.equal(await page.evaluate(()=>location.hash),'#market-section');
    await page.locator('#village-overview').screenshot({path:`test-results/cycle5-overview-${name}.png`});
   }
  }
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.screenshot({path:`test-results/cycle${cycle}-${before?'before':'after'}-${name}.png`,fullPage:true});
  console.log(`Cycle ${cycle} ${before?'baseline':'corrected'} ${name}: browser assertions passed`);await context.close();
 }
}finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
