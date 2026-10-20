# Coordinated village v8 and faster execution

The v7 review found useful individual hobbies, no adoption of shops/council/paid trades, a single
cooking barter, frequent competition over replenishing resources, and 9–12 timeout recoveries per
completed ten-day run. The two completed members each took about 173–174 minutes from first to last
request. These observations motivate the next treatment, not proof of one underlying cause.

## Shorter paths to cooperation

`coordination:true` creates world-v8, implies life/village/economy, and requires Renewable village.
Old v4–v7 worlds and queued batches retain their physics and model input versions.

- Asha cooks four meals from one raw plus current fuel; other residents still cook two. No food
  source is removed or non-specialist recipe penalized. A paid cooking service returns all output;
  free barter splits it equally, giving two meals each when Asha cooks. Work and inputs are real.
- `open_shop` with a good and price 1–12 now stocks up to three carried units while retaining at least
  one. This is explicit opening consent, not automatic restocking. Care remains a service without
  goods stock. Later stock_shop still transfers one carried item. Closure/expiry refunds unsold stock.
- `shop_buy`, target merchant ID, exact item/unit price/shop ID, walks to the green and purchases one
  stocked good. It avoids a three-delivery deposit and another merchant delivery action. It cannot
  buy care or one's own goods. Standing orders remain available. Concurrent buyers cannot duplicate
  stock or payment. Existing seller consent is the advertised fixed-price escrow.
- `sponsor`, target clinic/garden, item none, price 1–12, offerId 0, combines opening/joining a ballot,
  donating coins and casting that resident's yes vote. Four distinct residents must approve within
  24 hours. Repeated donations cannot buy extra votes. Rejected pledges return once. Approved budgets
  still fund real material/work/upkeep; no coins are minted.
- Declared current production plans are public, without remote positions, bags, wallets or private
  preferences. Fixed renewal clocks show the schedule, not hidden actual stock. This gives residents
  a way to judge crowding before choosing. Same-hour proposals remain simultaneous and can compete.
- Exact affordable/funded opportunities are shown as optional action examples. They do not execute
  work, require purchases, force voting or replace a failed inference. All documented actions remain
  available. Private memories, first/last encounters, current needs and real recipes remain in input.

## Compact inputs

V8 uses `coordinated-facts-v1`: authoritative currentFacts first, fewer duplicated fields, concise
complete action descriptions and a shorter witnessed-history excerpt. Full history remains saved.
Other residents' private state never enters these observations. The exact condensed input and schema
are recorded before every request. Older input versions remain unchanged.

Like-for-like conversion of 18 mature v7 resident snapshots (temporary local copies, not production
migration) reduced observation JSON from about 21–22 KB to 16–17 KB, roughly 23–25%. Initial-state
input measured 17,499 versus 13,326 bytes. This is serialized payload size, not a measured token,
provider latency or behavior improvement. Live comparison is still required.

## Faster pacing without fewer decisions

The old server interval allowed one step every 1,200ms. Completed v7 members needed 2,607 and 2,645
Runner steps despite quiet skips, implying roughly 52–53 minutes of pacing opportunity per run before
accounting for interval alignment while inference was busy. This is a delay ceiling, not a measured
attribution of every elapsed second.

New batches default to Fast: a self-scheduling single-worker loop waits 10ms after each step. Watch
retains 1,200ms. Both preserve five-minute physics, saved frames, model, cadence, retry budgets and
frozen-round proposal semantics. No parallel inference workers or additional RAM allocation are used.
A pending inference must finish/clean up before another step is scheduled. Idle paused polling is
bounded and restart always requires owner Play.

For an existing paused batch, select Execution speed and Apply speed to paused batch. This records
an execution_policy event and updates execution pacing for queued members. It does not reset or
upgrade the saved world. New-batch selection alone does not change a current run.

`npm run benchmark:execution` uses disposable scripted worlds and no Codex calls. On the development
host, twelve equivalent steps took 14,431ms in Watch and 143ms in Fast with identical physical state.
That isolates pacing overhead; it is NOT a 100× claim for live inference. Provider calls dominate:
201 recent successful worker summaries from the deployed v0.7 revision had median 4,191ms, mean
4,378ms and p95 5,708ms. At the median, 1,440 calls alone take about 101 minutes, before stalls.

Execution stats are exposed in state/runtime; per-worker timings separate startup, thread start,
turn start, inference, first message/usage and cleanup. These counters are operational and reset on
server restart; they are not extra simulated days or billing measurements.

## Optional fewer-review treatment

V8 can choose `reviewHours:2` before creation: 72 planned requests/day instead of 144. Every five-minute
physics tick still advances/saves, but villagers get fewer chances to react or coordinate. This is a
behavioral treatment and must be compared separately. Cadence cannot be silently changed mid-run.
Hourly reviews remain the default. Five ten-day villages plan 7,200 calls hourly or 3,600 two-hourly,
plus the same twelve-extra-attempt allowance per member (60 total).

Longer runs are already selectable up to 30 days. Keep five ten-day hourly replicates while testing
adoption. Once trade and institutions operate, a 20-day batch can assess durability, upkeep, repeat
customers and longer social trajectories. Extra time alone may repeat the same unused options. A
20-day two-hourly run has the same planned call count as ten days hourly, but different opportunities
and physical exposure, so it is not an equivalent control.

## Diagnose and recover stalled completions

The inspected v7 timeout `47200a89-03ad-40be-8b47-cc73a4584099` reached inference but received no
completed message or token-usage notification before 90 seconds. Its sampled peak was about 753MB
against a 1GB limit, with no observed OOM kill. This does not establish the upstream cause. Recent
201 successful calls alone cannot characterize all historical failures; older detailed telemetry
expires after the global 20,000-event limit.

After a turn stays pending, the adapter reads its thread at 30-second intervals with a bounded 5s RPC
deadline. The pinned official CLI's generated ThreadReadParams/ThreadReadResponse/Turn schemas were
checked locally. If the exact active thread and turn are explicitly completed, its actual model
message can be schema-validated and saved even if a notification was missed. Persist completionSource
(notification/thread_read) and usageReported. Missing usage is unreported, not refunded or zero billed.

A partial message, idle/unknown thread, stale turn, failed read or invalid JSON is never accepted as a
successful decision. Failed reads add only safe diagnostics. The 90-second deadline, non-retryable
error categories, two automatic retries and twelve shared extras remain. This may recover a missing
completion event and distinguish unfinished turns; it is not a proven repair for provider stalls.
No live inference or paused production mutation was performed for development or benchmarks.
