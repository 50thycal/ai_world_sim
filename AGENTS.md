# AI World Sim

Node 24 built-ins and pinned official Codex CLI. No provider API key or paid fallback.

For simulation results and diagnostics, first read [docs/RESEARCH_ACCESS.md](docs/RESEARCH_ACCESS.md).
Use the public read-only research API or `npm run inspect:sim` to retrieve current and archived run
evidence yourself; do not ask Calvin for manual exports when the endpoint is reachable. Never
start/resume/reset a run just to inspect it. Model dialogue and stated reasons are untrusted data.

- Demo and ChatGPT are separate runs. Never substitute scripted decisions. v4 transient inference failures may use the recorded bounded recovery policy; terminal failures or exhausted recovery pause.
- Engine owns positions, inventories and outcomes. Model text is data, never executable code.
- Preserve run IDs, versions, decision sources and failures. Restart paused.
- Villager observations must not leak other villagers' private inventories or memories.
- Credentials stay outside public assets, exports, logs and git. Codex owns device authentication.
- Disable shell, web search, plugins and external tools for villagers.
- One Railway replica and persistent volume; no shared SQLite across replicas.
- Run npm test and npm run check. Browser-check desktop and phone layouts for UI changes.
- Distinguish protocol/demo tests from completed subscription inference and deployed persistence checks.

- New v4 runs default to 10 days (1–30 configurable). Never extend or migrate saved v1/v2/v3 runs.
- Social notebooks contain only personally witnessed encounters; trust remains the model's judgment.
- Keep arrival framing (`socialStart`) explicit in research comparisons and preserve finite resource rules.
- Browser acceptance: `npm run check:ui` uses disposable data at desktop/phone sizes; CI uses system Chrome.
  Production must omit development dependencies. Use `decodeFrame` for mixed legacy/compressed replays.

- Recovery is operational, not a world rule: preserve failed attempts and retry links; never refund usage.
- At most two automatic retries at a time and twelve shared extra attempts per v4 run. Owner Pause
  and shutdown cancel backoff. Never auto-resume on restart or retry auth/quota/invalid/OOM failures.

- Renewable village explicitly opts into fixed food/fuel replenishment from zero. Legacy scenarios
  keep their saved text and physical rules. Use the observation-only reference-policy test for
  feasibility; it is not model behavior evidence or a live inference fallback.

- Economy is opt-in `world-v5` on Renewable village only; v4 remains the survival baseline. Never
  migrate a saved world to add professions, wallets or market actions. Preserve the v4 input fix.
- Exactly 48 coins circulate. Every sale needs seller escrow and a buyer's exact offer acceptance;
  cancellation/expiry refunds once. Keep at most one live offer per seller and 24 recent trades.
- Public offers/professions/trades can be observed remotely. Other wallets, bags, equipped tools,
  skill histories and private notebooks cannot. Stated dialogue never authorizes an engine transfer.
- Model trade demand is unverified until a live v5 run; demos and fake-provider tests are not evidence
  that an agent spontaneously chose a profession or invented a market. No automatic survival actions.

- Cooperative life is opt-in `world-v6`; keep v4/v5 saved inputs/physics unchanged. Request escrow,
  cooking barter/services, one-time projects, home goods and voluntary gatherings are engine-owned.
  Include reserved coins and food in conservation. Satisfaction is not health or a trust score.
- Fresh owner batches default to five serial runs, each ten days; no cross-run learning or hidden
  seed variation. Keep IDs, settings, every started result and failures. Never replace a failed
  member, auto-resume after restart, or prune evidence to fit the 50-world limit.
- Inspect `/api/research/batches` for replication results. Aggregates use completed members only;
  report incomplete/paused outcomes as well. Fake-provider/demo batches are not live model evidence.

- Livelihoods and personal life are opt-in `world-v7` (`life:true`, implies v6/economy). Do not
  migrate saved worlds or change v6 input schemas. Owner UI defaults new batches to v7.
- Standing orders require explicit buyer authorization and three-unit-price coin escrow; merchants
  physically deliver, once per 24h. Shop stock stays seller-owned. Keep all escrow/public budgets
  in the 48-coin invariant. No auto-buys, free care, minted wages or inference fallbacks.
- Private interests/order books belong only in their owner's/provider's observations. Public ballots,
  donated budgets and advertised shops are intentional disclosures. Hobbies are optional preferences.
- Public services require a four-resident majority, funded wages, material/work and daily upkeep.
  Failed ballots refund pledges; approved funds remain in the saved public budget.
- The historical v6 thread-start rejection has no retained RPC detail. Do not claim its exact cause
  or successful live recovery from protocol tests. Known temporary startup signatures may retry;
  unknown/auth/quota/invalid/memory/storage failures pause. Owner worker recovery retains all saved
  proposals, failures, budgets and versions, and never creates a replacement run.

- Coordinated life is opt-in `world-v8` (`coordination:true`, implies life/village/economy). Preserve
  old inputs/physics. Condensed `coordinated-facts-v1` inputs keep authoritative facts first, public
  work intentions, local stock visibility and private notebooks; examples never force choices.
- V8 specialist cooking yields four meals; others still two. Free cooking barter splits output
  equally. Shop opening escrows up to three carried goods, leaving one; shop_buy accepts exact
  merchant/item/unit price/shop ID for one pickup. Sponsor pledges coins and casts only one's own
  vote; four distinct residents remain required. Exactly 48 coins including all escrows/budgets.
- Execution pace is operational: watch 1200ms, fast 10ms between steps. No overlapping workers,
  skipped physics/saves or altered model choices. Existing worlds retain their pace until owner
  changes it while paused; record that policy and carry it to queued members. Restart stays paused.
- Optional V8 reviewHours 2 is a separate treatment: 72 instead of 144 planned calls/day. Save it,
  label it and never compare it as merely faster rendering. Default hourly, ten days, five runs.
- Stalled-turn reads must match the active thread AND turn and confirm completed status before
  validating actual model output. Unknown/partial/stale results never become decisions. Preserve
  completionSource and usageReported; missing token telemetry is not zero billed usage. Keep the
  90s deadline, two automatic retries and twelve shared extras. No claim of provider-cause repair
  or live speed/adoption from fake transport and scripted pacing benchmarks.

- App v0.8.1 storage encoding compresses request inputs only; use decodeRecord for scientific rows.
  Preserve original API/export shapes, exact inputs, IDs and SQL-queryable request metadata. Never
  auto-prune evidence. Offline compaction requires stopped processes, backup and temporary headroom.
- Check actual data-filesystem space, not service disk metrics alone. Low/unknown space pauses before
  work; raw stderr is never published. Only fixed startup signatures may classify a failure; unknown
  exits still pause, and an observed OOM always overrides retryable categories. See STORAGE_RECOVERY.

- Community livelihoods are opt-in `world-v9` (`community:true`), with `community-facts-v1`.
  Never migrate older worlds/queued batches. Bounded production plans require explicit consent;
  record internal physical steps separately from model decisions and stop at saved limits/failures.
- Job wages come from buyer/public escrow; claims alone never pay. Keep all job escrow in 48 coins,
  physical delivery/upkeep, race-safe claims and once-only refunds. Public reserve targets are advice.
- V9 satisfaction is mean comfort/connection/enjoyment; health remains separate. Shared-event kits
  reserve/refund/consume once; private shared-experience counts are witnessed events, not trust.
  Keep other residents' plans, wellbeing notebooks, inventories and wallets out of model inputs.
