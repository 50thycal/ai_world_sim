# Little Commons · AI World Sim

Six residents in an observable village: gather food and wood, walk to the hearth, cook, eat, rest,
share meals and talk within hearing range. A small Railway-first MVP to test subscription-backed
villagers before extending the world.


## Current release: app v0.4.0 / simulation v4

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
| **Plenty** (control) | Abundant food/wood, equal bags | Baseline disposition when nothing is at stake |
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
- Configurable 1–30 day runs (10 by default), 144 inference attempts per day, at most 20 retained runs.
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
- Same initial state per condition; deterministic rotating resolution order. Conditions are chosen per run; there is no batch/replicate runner yet.
- Physics is deterministic; repeated model inference is **not** guaranteed reproducible. Replay reads recorded frames.
- Action decisions are recorded with provenance; exact observations/protocol inputs are saved for requests
  made from app v0.3.1 onward. Older observations cannot be reliably recovered. Simulation v2 saves completed mid-round
  proposals for resume; legacy v1 discards unapplied proposals. Requests already sent still count.
  A `round` record binds applied decisions at its tick.
- Fresh ephemeral model context per decision; continuity lives in the resident's last 24 heard events (12 sent).
- No hidden resource regeneration (v3 commons regrowth is stated in every observation), death, births or autonomous construction.
- Theft is always visible to residents within 4 tiles; there is no hidden crime or punishment system yet.
- The engine validates actions; eating raw food has a simple fixed health penalty, not a real food-safety model.
- Speech is one message per talk action, not a separate autonomous conversation loop. No action-grounded promise system yet.
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
