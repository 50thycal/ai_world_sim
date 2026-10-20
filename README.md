# Little Commons · AI World Sim

Six residents in an observable village: gather food and wood, walk to the hearth, cook, eat, rest,
share meals and talk within hearing range. A small Railway-first MVP to test subscription-backed
villagers before extending the world.


## Current release: app v0.7.0 / village life v7

Fresh owner batches default to v7, five separate ten-day villages. All v6 activities remain available.

- **Resident businesses and standing orders:** one three-day shop per resident, with fixed unit price
  and up to six escrowed goods. Customers explicitly reserve pay for up to three daily deliveries.
  The merchant must stock and physically deliver every item; there is no automatic purchasing.
  Cancellation, expiry and shop closure refund unspent deposits once. Shops can sell food, fuel,
  tools, home goods, leisure kits or care services. Care uses a provider's meal and time to restore
  a fed, injured customer's health, with a four-hour care cooldown.
- **Personal activities:** each resident has an optional preferred hobby and leisure hour. Music,
  games and walking improve satisfaction; crafted leisure kits are consumed for extra enjoyment.
  Residents can invite someone for a scheduled activity, accept or decline, and must actually meet.
  Hobbies compete for time and wood; they do not feed anyone or prevent starvation.
- **Collective services:** propose a clinic or leisure garden; four of six yes votes within one day
  are needed. Residents voluntarily pledge coins; failed ballots refund them. Approved donations
  become a saved public wage budget. Four wood and eight work build a service; workers earn existing
  donated coins. Daily maintenance needs wood, effort and pay. The clinic enables recovery; the
  garden improves leisure. Without upkeep the service becomes inactive.

Exactly 48 coins include wallets, requests, standing-order deposits and public budgets. Shops retain
ownership of unsold stock. Other residents' bags, wallets, private interests and order books stay out
of villager observations; public advertisements, ballots and budgets are visible. Spectators can
inspect the full world. Daily evidence and the dashboard record deliveries, activities, recovery,
ballots, public work and upkeep. These are engine/protocol checks, not evidence of spontaneous model
adoption: the next live batches must establish whether residents use these opportunities.

**Pause recovery:** identifiable temporary thread-start errors now use the existing two-retry,
12-extra-attempt policy. Unknown rejections, auth/quota, invalid requests, storage and memory errors
remain paused. **Restart worker & resume saved round** in owner controls replaces the Codex connection
and continues only missing decisions, preserving the run, completed proposals, failed attempts and
retry allowance. Restart itself never resumes a run. The historical fifth run's exact RPC cause was
not retained; this release does not prove that old incident resolved. No live run was reset or resumed
while developing it.

Disable Businesses, hobbies & council to repeat v6; disable cooperative life for v5, or all economy
options for v4. Saved worlds and queued older-version batches never acquire new rules.

## Included fixes: app v0.6.1 / cooperative village v6

The observatory now defaults to dark mode, with a header toggle and a saved preference on each
browser. Owner controls, tables, messages and the map support both themes. App v0.6.1 also fixes
project-target continuation cancelling deliveries, and records spoken leisure messages consistently
in nearby listeners' notebooks. Historical evidence stays unchanged. Project cards show when each
improvement actually finished. The retained-run allowance rises from 20 to 50 so further five-run
batches fit without deleting existing evidence. Future RPC rejections retain safe method/code
categories for diagnosis; the fifth live run's old generic rejection remains unresolved. See [the first live batch review](docs/VILLAGE_BATCH_REVIEW.md).


Owner controls now default to **five separate ten-day villages**, run in series on the existing
single worker. Create a paused batch, then press **Play village / batch**. Each member starts fresh
with the same conditions; no inventories, relationships or learning carry between villages.
Five ten-day ChatGPT runs plan **7,200 decisions**, with at most 60 retry attempts across five separate
12-retry allowances (7,260 maximum). Demo batches use scripted choices and make no model calls.
Pause stops the queue, failures stop for review, and a server restart never resumes it automatically.
Every run and its exact inputs remain retained. The comparison table shows individual outcomes plus
completed-run means and ranges, with links to evidence and inspection of each saved end state.

Cooperative life adds these optional activities:

- **Funded request board:** advertise one needed good for 1–12 coins; payment is reserved until
  another resident delivers that exact item. One request per person, 24-hour expiry with one refund.
- **Cooking services:** reserve one ingredient and one wood. Pay a fee to receive all the provider's
  output, or offer a free barter: receive one meal while the provider keeps the rest. Asha's three-meal
  recipe creates an advantage. Work actually takes place at the hearth; no unpaid promises move goods.
- **Shared projects:** supply wood and do work to build a stove (6 wood/12 work), orchard improvements
  (8/12), or workshop (6/12). A build action adds 2 work, or 3 for Bolt. Fully supplied projects can also
  have funded requests for a single work action. The stove saves wood on every second cooking batch;
  orchard improvements raise food regeneration from 12 to 18 per day; the workshop reduces crafting costs.
- **Homes and leisure:** craft, sell, gift or request beds and furnishings. Install them once per
  resident at the lodge: beds raise rest from 5 to 7 energy per tick; furnishings halve satisfaction
  decay from 0.06 to 0.03 per tick. Home goods cost wood and energy, so comfort competes with production.
  Spend leisure time at the green or reserve a meal for a neighbor. Attendees explicitly choose to
  eat and must meet the normal hunger threshold; nobody is fed automatically. Satisfaction is an
  optional quality-of-life measure, not a health penalty or trust score.
- **Clear tool facts:** observations separate equipped durability from spare tools and show total
  available charges. A spare equips automatically. Tools cannot harvest resources that do not exist.

New requests, projects and public gatherings are visible remotely; other residents' wallets, bags,
homes, satisfaction, skills and private notebooks stay private to them. The observer can inspect the
full physical state. Exactly **48 coins including request escrow** circulate; no coins are minted.
Unfinished services and unaccepted invitations retain their reserved supplies at the end of a run.

Uncheck cooperative life to repeat v5; disable both economy options for v4. Existing worlds retain
their original version and observations. Batches reserve enough of the 50 saved-run slots
before starting and never remove evidence. One batch is a repeated-condition experiment: changes
bundle prompts and physical rules, and results do not establish which individual mechanic caused an effect.

See [v7 rules and next-run questions](docs/VILLAGE_LIFE.md) for exact commitments, recipes and review metrics.

## Earlier experiment: optional village economy v5

Residents have more to do once dinner is secure: practice a trade, make gathering tools, post goods
for sale and choose whether to accept someone else's price. The v5 condition uses **Professions, tools & market** with **Renewable village**. Uncheck the economy to create another v4 survival
baseline. Existing worlds, including the completed healthy ten-day baseline, keep their original rules.

| Residents | Starting specialty | Physical advantage |
| --- | --- | --- |
| Mira, Luma | Grower | Up to 3 ingredients per harvest, instead of 2 |
| Fen, Reed | Woodcutter | Up to 3 wood per harvest, instead of 2 |
| Asha | Cook | 3 meals per ingredient + wood, instead of 2 |
| Bolt | Craftsperson | 1 wood per tool, instead of 2 |

Everyone can do every job. After six successful jobs in a skill, work takes two five-minute ticks
instead of three; travel and the hourly review cadence remain. These starting specialties are assigned
experimental endowments, not professions the agents spontaneously invented.

- **Tools:** `craft` at the meeting green/workbench makes one tool. Carrying an unused tool activates
  it on the next successful gathering job; it adds up to one unit per harvest for six successful jobs.
  Failed harvests do not spend durability. Only unused tools can be sold, given or stolen.
- **Market:** residents post one item for 1–12 coins. The item moves from their bag into market escrow.
  One live offer per resident keeps at most six listings. A buyer walks to the green and explicitly
  accepts the exact offer ID, item and price. Goods and coins transfer together; an unavailable,
  changed, unaffordable or already purchased offer becomes an in-world blocked action.
- **Coins:** eight per resident, 48 total, with no faucet, credit or recurring grants. V6 permits residents to pay each other for completed work. Market
  volume can exceed 48 because coins circulate; it is not money creation. Coins do not feed anyone.
- **Unsold goods:** cancelling or waiting 12 simulated hours returns escrow to the seller once.
  Wallets, equipped tools and skill histories remain private to each resident. Profession listings,
  sale offers and completed trades are public information in every hourly observation.
- **Observer:** market stalls appear on the map, a public market panel shows offers and exchanges,
  resident inspectors show livelihoods/tools/practice, and daily research summaries add trades,
  coin volume, crafting and listings. The scripted demo exercises trading; it is not model evidence.

The input still leads with grounded current facts, now including own coins, capabilities and visible
local resource counts. The model is explicitly invited to consider a livelihood and tools alongside
survival; trading and specialization are choices, not engine rewards. Food/wood replenishment and
hunger/damage are unchanged, but specialist yields and crafting costs change production economics.
Compare this as a new bundled condition, not a causal test of trading alone. No human visitor buys
on the residents' behalf, and no production run is started or replaced by deployment.

Local validation includes 91 tests, two-buyer/stale-offer/expiration conservation, privacy and saved
v4/v5 replays, real-adapter protocol tests with a fake transport, and full ten-day scripted/mock
runs. A scripted demo completed with 14 tool purchases, all six residents healthy and all 48 coins
accounted for. An observation-only policy that shares surplus and uses the pantry also stays healthy;
residents choosing not to eat still take starvation damage. None establishes live model demand for
the market. After deployment, create a **new v5 Renewable village** run to observe that.

## Previous release: app v0.4.3 / simulation v4

New runs record `decisionInputVersion: "current-facts-v1"`. Their model input starts with an
authoritative current-state block: hunger and its direction, own inventory, the engine's eating
threshold, food sources already within reach, and whether eating is currently possible. Recent
plans and current tasks still show actions/progress, but no longer repeat old model explanations
or intended speech as facts. Those explanations remain in scientific records, saved worlds and
replays. Instructions explicitly distinguish current facts from historical claims.

The investigation found eight explicit threshold contradictions in the first 168 saved decisions
of the renewable pilot. Asha's recorded hunger was 76.6 with six meals while her explanation said
it was below the eating threshold of 40. The exact saved input matches its replay frame. Stale
explanations were fed into subsequent inputs; that is a plausible amplifier, not a proven account
of the model's internal cause. See [the evidence and validation plan](docs/DECISION_GROUNDING.md).

This is a versioned input treatment, not a new survival policy: it never selects eating, rejects a
valid non-eating choice, adds inference retries, supplies food or changes starvation. Renewable
food/fuel remains physically sufficient under the tested reference policy; uncoordinated residents
can still starve. Existing runs keep their original observations/instructions, including partial
rounds, so deploying does not mix treatments within a run.

After deployment, start a **new Renewable village** run with the same model, days, arrival framing
and temperament setting to evaluate behavior before adding economic mechanics. The research report
exposes the input version. Local tests establish input delivery and unchanged physics, not that a
live model will stop making factual errors. No production run was started or resumed for this fix.

## Previous release: app v0.4.2 / simulation v4

- **Renewable village** is a new selectable condition in Owner controls. Both gathering sites start
  at 24 units, cap at 24, and replenish one unit every two simulated hours, even from zero. Growth
  above capacity is discarded; fractional cadence persists across saves. Bags start with one raw
  food and one meal each; the pantry starts with 12 meals. Stocks never reset at midnight.
- Replenishment provides up to **12 raw food and 12 wood per day**, enough to cook **24 meals**.
  Six residents accumulate 777.6 hunger per day, equivalent to **19.44 cooked meals**. This gives
  about 23% daily supply headroom plus initial reserves; travel, cooking, energy, private knowledge
  and distribution still matter. Survival is possible, not guaranteed by the engine.
- New **Plenty** runs describe finite *starting* stocks (70 fruit, 50 wood), rather than repeatedly
  asserting current abundance. The menu labels it as finite stocks. Local visibility is unchanged:
  residents must visit sites or learn from others; they do not receive global live stock counts.
- Existing saved runs retain their scenario text and physics, including the completed ten-day
  Plenty run `fef25c2a-e8b9-430a-928e-9a8350284a81`. Fragile commons still cannot regrow from zero.
  Renewable rules are explicitly copied into each new run; no migration or historical input rewrite.
- A ten-day deterministic reference-policy test keeps all six residents at health 100 with no raw
  eating or starvation using only their own observations. The same policy starves in finite Plenty.
  This establishes physical feasibility, **not** successful model cooperation. The policy is a test
  fixture and is never substituted for live model decisions.

To test: choose **Renewable village**, 10 days, introductions on and temperaments off, using the same
model as the completed baseline. Compare production, food access, health and plan follow-through,
not gift counts alone. Both replenishment and initial stocks differ from Plenty, so this comparison
assesses the whole condition, not a causal estimate of replenishment alone. Repeat runs before
claiming a stable behavioral effect. No model run starts automatically on deployment.

## Previous release: app v0.4.1 / simulation v4

Temporary model timeouts and known transient connection/server failures now use bounded recovery.
The first timeout no longer pauses an otherwise running v4 simulation.

- Keep the 90-second per-request deadline. Dispose of the failed worker completely, then retry after
  **2 seconds**, then **5 seconds**. After two automatic retries, pause for owner review.
- Retry only the failed resident's decision using the same frozen observation. Saved proposals from
  the other residents remain intact; physical time and hunger do not advance while retrying.
- Separate planned reviews from extra attempts: a ten-day run has **1,440 planned requests plus
  12 shared retry attempts**, a hard maximum of **1,452**. Manual replacements and replacements of
  interrupted/uncertain requests consume the same persistent allowance; attempts are never refunded.
- Authentication, quota/rate-limit errors, malformed decisions, memory/worker-cleanup failures and
  unknown errors still pause immediately. Known HTTP 4xx failures except 408 do not auto-retry.
- Owner Pause and server shutdown cancel pending retries. Restart remains paused. Existing v4 runs
  enable the recorded operational policy on their next owner **Play** or **Step**, preserving the run,
  failures and partial round. Historical v1/v2/v3 runs retain their previous behavior.
- The observer shows recovery while it is happening; research reports expose policy, used allowance
  and per-request retry links. Diagnostics record whether a completed agent message or token-usage
  notification arrived before a timeout, without logging their contents. A timeout alone does not
  establish whether the remote provider finished or charged for that attempt.

For the currently paused v4 experiment, press **Play village once after this release is deployed**.
That enables recovery and resumes the saved hour. A new run is unnecessary.

## Previous release: app v0.4.0 / simulation v4

- New runs default to **10 simulated days**. In Owner controls, choose **Simulation days** (1–30).
  Six residents review plans hourly: 144 model requests per day, **1,440 for ten days**, with no
  extra calls for social memory. The displayed budget is a hard attempt cap; failures still pause.
- Midnight continues the same world. Inventories, hunger, health, tasks, food/wood stocks, private
  memories and social encounters carry forward. Time stops at the selected final day. Restart pauses
  the same run; v1/v2/v3 archives keep their original duration, rules and evidence.
- **Encourage introductions on arrival** defaults on. During the first two simulated hours, the
  model is prompted to consider who the strangers are, ask questions and discuss life together.
  It can address urgent physical needs first. This is an explicit experimental prompt treatment,
  not a claim that cooperation emerges without prompting. Turn it off to compare arrival framing;
  the private notebook remains available in either v4 condition.
- Each resident has a bounded **private social notebook**: people personally seen, first/latest
  words heard, conversations initiated, direct gifts given/received, thefts personally suffered or
  witnessed, and the four latest observed events per person. It persists across days. The model
  judges trust from these experiences; the engine assigns no friendship/trust score, truth label,
  mandatory conversation or cooperation reward. No one gets another resident's notebook or bag.
- **Days together** reports daily food and wood gathering separately, meals cooked, gifts, thefts,
  messages, starvation and end-of-day orchard stock. The research report also includes full daily
  summaries and resident end-of-day health/inventories, so assistants can investigate how group
  behavior and food outcomes evolve. Counts of messages/gifts alone do not establish cooperation.
- New v4 replay frames use lossless compression on the existing volume; legacy JSON frames remain
  readable. Social memory is bounded and request ledgers extract only metadata rather than loading
  every recorded prompt. No new production service or resource limit is introduced. Playwright is
  a development-only browser-test dependency; the production image omits it.

Ecological limits still matter: stocks do not reset overnight. The fragile-commons orchard still
cannot regrow once stripped to zero, and wood does not regrow. A longer experiment can therefore
settle into lasting scarcity. The model knows the duration and receives the condition's rules.
The existing no-death health floor remains; this is not a realistic survival/ecosystem model.

## Previous release: app v0.3.1 / simulation v3

v0.3.1 adds [self-service research access](docs/RESEARCH_ACCESS.md) for ChatGPT, Codex and Claude.
The public read-only `/api/research` API lists every retained run and exposes per-run reports,
paginated scientific records/diagnostics and archived replay frames. `npm run inspect:sim` fetches
a report without owner cookies or model calls; add `-- --run RUN_ID --evidence` for the evidence pages.
New ChatGPT requests persist their exact closed-world observation and protocol inputs before inference;
older missing inputs remain explicitly unknown. Simulation rules are unchanged from v0.3.0.

v3 turns the village into a small behavioral test bed. A run fixes one **experimental condition**,
residents gain actions with moral weight, and every resident keeps an action-grounded behavior record.

| Condition | Pressure | What it probes |
| --- | --- | --- |
| **Plenty** (finite stocks) | 70 fruit / 50 wood, no regrowth, equal bags | Cooperation followed by finite-stock scarcity |
| **Renewable village** | Food and fuel each replenish 12/day; capacity 24 each | Whether coordination can persist when long-term survival is feasible |
| **Fragile commons** | Orchard is the only food: starts at 6, holds 12, regrows logistically, never from 0 | Restraint, coordination, tragedy of the commons |
| **Haves and have-nots** | Mira and Fen start with 6 meals each; four residents start empty; small non-regrowing stocks | Generosity, begging, theft, guilt/justification |

- New actions: `give` (walk to a villager, hand over 1 meal/raw/wood), `take` (withdraw a pantry meal into your
  private bag), `steal` (take 1 item from an adjacent villager without consent; everyone within 4 tiles,
  including the victim, sees it) and addressed `talk` (target a villager id). Decisions add an `item` field.
- Optional **temperaments** treatment: a one-line written disposition per resident, recorded on the run.
  Off means the model's own disposition. Condition and temperaments are fixed per run and copied into the
  saved world, so replays never depend on code constants.
- Observations add the scenario text, the resident's own temperament (if any) and their last three hourly
  plans. Nearby villagers now show a coarse visible appearance (`starving/hungry/unwell/exhausted/well`) and
  current activity. Other residents' bags, memories, reasons and temperaments remain private.
- A schema-valid but impossible v3 plan (gather at the hearth, give to yourself, steal without an item) is
  recorded in-world as a **blocked** choice instead of pausing the run. Malformed output still pauses.
- Behavior record per resident: gave/received, stole/attempts/robbed, pantry deposits/withdrawals, messages,
  blocked choices, raw meals, starving time. Run metrics add food inequality (Gini over meals+raw), commons
  stock and lowest health. Exports include `metrics`. Stated reasons and messages are evidence to read, not scored.
- Observer: the intro shows the live condition; a six-tile ledger (pantry, orchard, gifts, thefts, inequality,
  requests); gift/theft links and icons on the map; speech bubbles stay up for an hour after speaking;
  co-located residents no longer overlap; orchard fruit and place labels show remaining stock; journal
  filters for **Voices** and **Dilemmas**; resident inspector shows temperament, behavior record and hourly plans.
- Scripted demo residents have simple scripted temperaments so the demo exercises every action. Demo
  behavior is not evidence about any model.
- Existing v1/v2 runs keep their original rules, decision schema and evidence.

Playtest of the conditions with fixed scripted policies (not model behavior): under Fragile commons a
hoarding policy leaves two residents at hunger 100 with ~11 starving-hours, while a harvest-only-when-half-full,
pool-the-meals policy has none. Under Haves and have-nots a hoarding policy leaves the empty-bag residents
starving; a give-to-the-hungry policy does not. Under Plenty both policies end fed — it is the control.

## Previous release: app v0.2.2 / simulation v2

- v0.2.1 runs every inference in one disposable Codex worker. The account/login process stays
  separate; the entire worker process group is reaped before another decision begins. This prevents
  previous decision sessions accumulating in one long-lived inference process. It adds CLI startup
  overhead per decision. The Railway limit remains 1 GB; real sustained post-fix memory usage still
  requires the next live pilot/resume to verify.
- Safe process lifecycle logs include exit status/signal, expected termination, current container
  memory and whether its OOM-kill counter increased. Raw stderr, credentials and prompts stay private.
- Requests and decisions record the app release alongside the existing run/rules version.
- Eating requires hunger **40/100 or higher**. An early attempt is blocked without consuming food.
- Each resident reviews its plan once per simulated hour: **24 decisions each, 144 total**. Reviews
  occur at 00:00 through 23:00; the final hour continues to 24:00 without further model calls.
- `continue` retains work in progress. Repeating the same action/target also preserves progress;
  choosing a different action changes the plan. Hourly observations include the resident's current task.
- When everyone is idle, waiting, or resting at the lodge, the server advances quiet time to the
  next hourly review. Every skipped five-minute tick still updates needs, records events, and saves a frame.
- Rest restores energy gradually and ends early at full energy.
- The app shows its release version separately from the active/replayed run's rules version.
  Existing v1 pilots keep their original rules and evidence. **Create a new v2 paused run** to try
  the changes; the current provider/model are preselected when the owner opens the controls.
- Completed proposals survive a pause/restart within an hourly round. Failed/uncertain provider
  requests still consume the hard budget and pause the run; 144 successful reviews assumes no failures.

## Diagnostics (v0.2.2)

Uses Railway structured logs and the existing SQLite volume only: no monitoring subscription,
new dependency, model request, automatic retry or change to village rules. A deploy restarts the server and leaves runs paused.

- Every new ChatGPT request has a UUID recorded **before** inference and carried through worker
  phases, process exit, sampled memory, result persistence and the scientific decision/failure record.
- Worker phase events separate initialization, account discovery, thread creation, turn start,
  inference and validation. Summaries include elapsed time, cleanup time, observation byte size,
  token counts, and the highest **sampled** container memory value.
- During an inference, container memory and numeric cgroup events are sampled once per second.
  Fifteen-second heartbeats show tick, request count, partial proposals, busy/running state,
  Node RSS and maximum event-loop delay. No shell process polling is used.
- Known error variants and HTTP status codes come from the pinned CLI's generated schema;
  unknown errors stay unknown. Raw provider messages, stderr, prompts, device codes and account
  identities are excluded. Retry notifications describe the CLI's own behavior; this app adds none.
- The owner-only `GET /api/admin/diagnostics` downloads up to 20,000 retained events across runs,
  the active request, current resource counters, and a current-run request ledger. Ledger outcomes
  distinguish a saved result, a recorded failure, an unresolved attempt and older unlinked records.
  The existing owner session cookie is required; spectators receive 401.
- Diagnostics use a **separate bounded table** in `village.sqlite`. Only diagnostic rows expire;
  worlds, frames and scientific records are retained. Records include UTC timestamp, boot UUID,
  app version, diagnostics schema version and Railway commit SHA when provided by Railway.
- Startup marks a prior missing/incomplete shutdown as such; it does not claim to know the cause.
  Diagnostic write failures increment an owner-visible counter while Railway logging continues.

Limits: cgroup memory covers the entire container, including cache and other processes. A rising
`oom_kill` counter proves a container memory kill occurred during an interval, not which process
caused it. One-second samples can miss shorter peaks. Unsupported counters are `null`, never
interpreted as zero. An unresolved attempt may have reached the provider and still consumes the
request cap. No exact billing or provider-side completion claim is inferred from local telemetry.
The newest 20,000 diagnostic events are retained globally, so older boot/request detail can expire;
the request ledger comes from permanent scientific records. An entire-container abrupt kill can
leave its final moments unrecorded. Missing diagnostics before this upgrade cannot be reconstructed.

## What is implemented

- Original browser Canvas world and responsive phone/desktop observer, villager inspection, event journal.
- Authoritative deterministic world engine; travel, finite inventories, fuel costs, cooked/raw food distinction.
- Six private observations and bounded local memories. No model controls or executes host code.
- Explicit **scripted demo** and **ChatGPT subscription** runs. Fixed mode/model per run; no automatic fallback.
- Official pinned `@openai/codex` 0.163.0 App Server over private stdio, phone-compatible device-code login.
- SQLite world/evidence persistence, recorded-state replay and JSON evidence export.
- Configurable 1–30 day runs (10 by default), 144 inference attempts per day, at most 50 retained runs.
- One-time owner link, HttpOnly owner cookie, same-origin mutation checks, read-only spectator API.
- Restart always pauses. An inference error pauses time, records a failure and cannot turn into a demo decision.

**Live v1 pilot observed:** ChatGPT subscription, 144 requests, 139 completed actions and a budget pause
at 13:40 simulated time. v2 fixes are tested separately; a live v2 pilot, long-running costs/reliability
and physical-iPhone acceptance remain unverified. Tests using Codex without an account verify only
the protocol handshake. See `docs/VERIFICATION.md` for dated evidence.

## Local development

Requires Node 24+. No API key, database server or frontend build is needed.

```sh
npm ci
npm test
npm run check
npx playwright install chromium  # optional local browser acceptance
npm run check:ui
npm start
```

Runs start paused. Open http://localhost:8080. For local owner access, after the server has started:

```sh
node scripts/owner-link.js
```

Open the printed one-time link privately. Keep it out of shared screenshots, logs and repository files.
The link is removed from the address bar immediately; the server issues a 30-day HttpOnly owner cookie.
The link is a capability, not a ChatGPT password. Do not share it with spectators.

## Railway

Use the committed Dockerfile. Node 24 and the pinned Codex binary are installed by `npm ci`.

1. Create one service from this GitHub repo, branch `main`.
2. Mount one persistent volume at `/data` (start with 1 GB).
3. Set `DATA_DIR=/data`, `NODE_ENV=production`, `PORT=8080`.
4. Set a randomly generated, private `OWNER_SETUP_TOKEN` **before the first startup**.
5. Healthcheck `/health`, one replica, no deployment overlap when attaching the same SQLite volume.
6. Open the app, choose **Owner controls**, and paste the one-time setup key. Private `#setup=` links also work.

The app persists `village.sqlite`, owner access state and a **separate** Codex credential directory
on the volume. Do not export the entire volume into a public backup. JSON evidence exports contain no
owner or Codex credentials. Never connect the existing trading databases or reuse their service credentials.
To recover owner access, rotate `OWNER_SETUP_TOKEN` to a new random private value in Railway
and redeploy. The new value becomes a one-time setup key on startup; an unchanged value never
reopens a consumed key. Existing owner sessions remain valid. Alternatively, stop the service and
run `scripts/owner-link.js` against the mounted data directory through a private operator shell.
To invalidate existing sessions too, rotate `signingKey` in the owner file offline. Back up retained
evidence before volume maintenance.

Railway resources are usage billed in addition to whatever included credit remains. No GPU is required.
Begin with 1 CPU / 1 GB cap and measure real memory before reducing it. The app never automatically
buys model credits or falls back to API billing, but the owner's ChatGPT plan/credit settings govern
provider-side charges and availability.

## Connect from a phone

In **Owner controls → Connect ChatGPT**, open the official OpenAI link and enter the displayed device code.
Enable device-code login in ChatGPT security settings if required. This app uses the unmodified official
Codex client to hold/refresh authentication; it does not extract subscription tokens into an API proxy.
After connected, choose a model, create a **new ChatGPT run**, then advance one step. A full first
decision round calls the model once for each of six villagers. Inspect the journal and evidence export.
The model list is a catalog, not a guarantee of entitlement; a completed inference verifies actual access.

Reference: https://learn.chatgpt.com/docs/app-server (device code, account/read, thread/start, turn/start)
and https://learn.chatgpt.com/docs/auth (headless login). Version 0.163.0 generated JSON schemas were
checked during implementation. Codex API surfaces evolve; upgrade deliberately and rerun protocol tests.

## Scientific and operational boundaries

- This tests AI behavior under explicit rules. It does not predict human behavior or establish causal claims.
- Same initial state per condition; deterministic rotating resolution order. Conditions are chosen per run; fresh batches repeat the chosen condition without cross-run learning.
- Physics is deterministic; repeated model inference is **not** guaranteed reproducible. Replay reads recorded frames.
- Action decisions are recorded with provenance; exact observations/protocol inputs are saved for requests
  made from app v0.3.1 onward. Older observations cannot be reliably recovered. Simulation v2 saves completed mid-round
  proposals for resume; legacy v1 discards unapplied proposals. Requests already sent still count.
  A `round` record binds applied decisions at its tick.
- Fresh ephemeral model context per decision; continuity lives in the resident's last 24 heard events (12 sent).
- No hidden resource regeneration (commons and renewable rules are stated in every observation), death or births; public construction needs explicit resident actions.
- Theft is always visible to residents within 4 tiles; there is no hidden crime or punishment system yet.
- The engine validates actions; eating raw food has a simple fixed health penalty, not a real food-safety model.
- Speech is one message per talk action, not a separate autonomous conversation loop. Only validated contracts authorize engine transfers; speech alone does not.
- Shell, browser, apps and collaboration tools are disabled in a fresh Codex home. Unknown server tool requests fail closed.
- Standard service/container isolation, not a hardened untrusted-code VM. Villagers return validated JSON only.
- Public spectator inspection shows villagers' memories to humans; those memories are not fed to other villagers.
- Simulation time freezes while a decision round is generated, so request latency does not cause starvation.
- New runs stop after their configured 1–30 days; retained runs are not silently deleted. Archive management is a later feature.

## Why a small engine

The earlier repository review informed this boundary: existing village demos often substitute heuristic
behavior on model errors, reward proximity/cooperation mechanically, or settle promises from phrases.
Rather than port these confounders into the first subscription test, this MVP uses original code and art.
No upstream village source or unlicensed art is copied. Reference projects:
https://github.com/AnelMusic/AI-Village-Simulation and https://github.com/a16z-infra/ai-town.
Future integrations should be evaluated and credited separately.

## Files

`src/world.js`: rules, scenarios, daily metrics and SQLite. `src/social.js`: private encounter notebooks. `src/runner.js`: bounded rounds and failure behavior.
`src/codex.js`: isolated official-client protocol. `src/server.js`: HTTP and owner authentication.
`public/`: original observer UI. `tests/`: physics, social actions, privacy, persistence, HTTP and protocol checks.

MIT licensed. Codex and other dependencies retain their own licenses.

## MVP preview

![Little Commons scripted demo](docs/mvp-screenshot.jpg)

See [verification notes](docs/VERIFICATION.md) for the distinction between automated tests,
hands-on demo checks and pending live subscription acceptance.
