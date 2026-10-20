export const RETRY_LIMIT = 12;
export const MAX_AUTOMATIC_RETRIES = 2;
export const RETRY_DELAYS = [2000, 5000];
export const recoveryPolicy = () => ({ version: 1, retryLimit: RETRY_LIMIT, maxAutomaticRetries: MAX_AUTOMATIC_RETRIES });
export const transientFailure = (code, httpStatus) => !(httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408) &&
  ['timeout', 'worker_startup_transient', 'serverOverloaded', 'flexUnavailable', 'internalServerError', 'httpConnectionFailed',
    'responseStreamConnectionFailed', 'responseStreamDisconnected', 'responseTooManyFailedAttempts'].includes(code);

export function retriesUsed(store) {
  return store.db.prepare("SELECT coalesce(sum(n-1),0) n FROM (SELECT count(*) n FROM records WHERE run=? AND kind='request' GROUP BY tick,coalesce(json_extract(data,'$.actorId'),json_extract(data,'$.actor')))").get(store.world.id).n;
}
export function slotAttempts(store, actor) {
  const rows = store.db.prepare("SELECT json_extract(data,'$.requestId') requestId FROM records WHERE run=? AND tick=? AND kind='request' AND (json_extract(data,'$.actorId')=? OR json_extract(data,'$.actor')=?) ORDER BY id").all(store.world.id, store.world.tick, actor.id, actor.name);
  return { count: rows.length, previousRequestId: rows.at(-1)?.requestId || null };
}

// Existing v4 runs opt into the operational policy only when their owner next presses Play/Step.
// No inference, refunds, historical decision edits, or automatic resume on server startup.
export function enableRecovery(store) {
  const w = store.world;
  if (!['world-v4', 'world-v5'].includes(w.version) || w.recovery) return;
  const previousMaxCalls = w.maxCalls;
  w.plannedCalls = w.maxTicks / 12 * w.agents.length;
  w.recovery = recoveryPolicy();
  w.retriesUsed = retriesUsed(store);
  w.maxCalls = Math.max(previousMaxCalls, w.plannedCalls + RETRY_LIMIT);
  store.save([{ kind: 'recovery_policy', tick: w.tick, policy: w.recovery, previousMaxCalls,
    plannedCalls: w.plannedCalls, maxCalls: w.maxCalls,
    text: `Bounded recovery enabled: up to ${RETRY_LIMIT} extra attempts across this run, at most ${MAX_AUTOMATIC_RETRIES} automatic retries at a time.` }]);
}
