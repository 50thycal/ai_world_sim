// Operational pacing only: the Runner still advances and saves the same five-minute ticks.
export const PACE_DELAYS = { watch: 1200, fast: 10 };
export const executionPace = w => w.execution?.pace || 'watch';
export function setExecutionPace(store,batches,pace) {
  if(!Object.hasOwn(PACE_DELAYS,pace))throw new Error('Choose fast or watch execution');
  if(store.world.running || batches.runner.busy)throw new Error('Pause and wait for the current decision first');
  const previous=executionPace(store.world);
  store.world.execution={version:1,pace};
  if(batches.batch && !['completed','cancelled'].includes(batches.batch.status))batches.batch.options.pace=pace;
  store.save([{kind:'execution_policy',tick:store.world.tick,pace,previous,
    text:`Owner selected ${pace} wall-clock execution; physics ticks, hourly decisions, model, call budget and saved proposals are unchanged.`}],false,batches.batch);
}
export function createScheduler({store,runner,batches,diagnostics,intervalMs,clock=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}) {
  let timer,closed=false,scheduledAt=0,scheduledRunning=false;
  const stats={steps:0,physicsTicks:0,stepMs:0,scheduledWaitMs:0,idleWaitMs:0};
  const snapshot=()=>({pace:executionPace(store.world),delayMs:intervalMs ?? PACE_DELAYS[executionPace(store.world)],...stats});
  const arm=()=>{if(closed)return;scheduledAt=clock();scheduledRunning=store.world.running;const delay=intervalMs ?? (store.world.running?PACE_DELAYS[executionPace(store.world)]:250);timer=schedule(pump,delay);timer?.unref?.();};
  async function pump() {
    if(closed)return;stats[scheduledRunning&&store.world.running?'scheduledWaitMs':'idleWaitMs']+=Math.max(0,clock()-scheduledAt);
    try {
      if(!runner.busy){batches.advance();if(store.world.running){
        const before=store.world.tick,runId=store.world.id,start=clock();
        try {await runner.step();}catch{/* Runner retains and pauses failures. */}
        const elapsed=clock()-start;stats.steps++;stats.stepMs+=elapsed;stats.physicsTicks+=Math.max(0,store.world.tick-before);
        if(store.world.nextDecisionTick>before && before%12===0)diagnostics.emit({event:'execution_round',runId,tick:before,durationMs:Math.round(elapsed),pace:executionPace(store.world)});
        batches.advance();
      }}
    } catch(error) {
      if(!closed){batches.pause(error.message);diagnostics.emit({event:'execution_failed',runId:store.world.id,tick:store.world.tick,failureCode:'execution_failed'});}
    } finally {arm();}
  }
  arm();
  return{snapshot,close(){closed=true;cancel(timer);}};
}
