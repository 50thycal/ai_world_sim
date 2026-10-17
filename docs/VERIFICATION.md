# MVP verification — 2026-10-17

## Completed before deployment

- 15 Node tests: resource conservation, actual travel/cooking requirements, raw-food health penalty,
  private observations/hearing, malformed proposal rejection, complete deterministic demo day,
  SQLite restart with the same run and recorded frames, quota failure, owner pause during inference,
  durable request budget, owner-only mutations, one-time claim, explicit setup-key rotation without losing the world,
  CSRF, public routes and evidence export.
- Real pinned Codex 0.163.0: isolated initialization and account/read accepted, no account inherited.
- Fake JSON-RPC transport: device-code response, model catalog, very fast successful decision,
  token usage and failed turn exercised through the actual adapter. This is not live inference.
- JavaScript syntax checks passed. Source-only publish set and git whitespace checks reviewed.

## Hands-on deployment checks

- Railway deployment succeeded from the published main branch; `/data` is a separate persistent volume.
- Deployed HTTP owner claim and scripted stepping succeeded: six villagers, tick 18, 18 recorded frames,
  actual wood gathering, zero model requests. The run is paused.
- Chrome desktop: canvas map and six residents rendered; selected Fen and observed his inspector;
  toggled map labels; loaded the first recorded moment (00:05), then returned to live (01:30).
- No app-origin JavaScript errors observed. Browser extension metadata warnings were unrelated.
- Screenshot: [deployed scripted demo](mvp-screenshot.jpg). This image is not evidence of AI behavior.
- Redeployed the final owner-setup build. Run `602422e6-0a6a-4ef4-8284-0e8dcac28eba`
  survived at tick 18 with 18 frames and remained paused. No data reset occurred.
- Deployed owner-only status reports the official Codex process available, no connected account,
  no pending login and no adapter error. Owner-only evidence export returns world and records.
- The final owner setup form renders with a masked setup-key field and unlock button.
  An unused one-time owner key was prepared privately for the owner; it is absent from this repository.

## Pending owner acceptance

- Authorize device-code login on a physical phone with the intended ChatGPT account.
- Confirm available model and create a fresh ChatGPT run. Advance one decision round (six requests).
- Confirm completed decisions, provider-reported usage, actual resource changes after travel,
  pause/resume and evidence export. Check the selected account's quota/credit settings.
- After signing in, redeploy while paused and verify the connected account survives. World persistence
  across redeployment has already passed; account persistence still requires a real account.

No subscription inference, paid API call or model-cost benchmark has been completed by these tests.
Physical-phone layout and sign-in remain unverified; desktop browser rendering is verified.

## Owner controls repair — 2026-10-17

- Actual iPhone requests reached the server: Connect returned HTTP 400, while Play and Disconnect
  returned 200. The original error message was below the visible portion of the owner dialog.
- Added the system CA certificate bundle to the slim runtime image. After deployment, the same
  authenticated Connect request returned HTTP 200 with a real OpenAI device code and the expected
  verification URL. No sign-in credentials or codes are recorded here. This verifies code issuance,
  not completed subscription sign-in or model inference.
- Progress/errors now appear in a sticky status panel near the dialog header; Connect shows an
  immediate busy label, successful code issuance scrolls the code into view, and Pause remains
  usable while a decision is pending. Stale pending device logins can be renewed.
- 20 Node tests pass, including shipped frontend click handlers with a simulated DOM/backend:
  delayed code issuance, visible provider error/retry, explicit Refresh feedback, and Pause during a pending step. The HTTP
  tests also cover fresh demo run creation, preservation of old run/frame records, and the
  explicit pause requirement before a new run. These are not physical-phone browser tests.

## App v0.2.0 / simulation v2

- Observed the real v1 subscription pilot: 144 requests, 139 completed actions, 60 meals cooked,
  one sharing action, stopped at tick 164 by the original budget cap. Live v1 inference is confirmed.
- 29 automated checks pass for the v2 release, including a full hourly scripted-demo day and API version metadata.

- New deterministic fake-provider tests cover exactly six requests at each hourly boundary,
  144 total, no premature budget pause, and completion at tick 288 (24:00). This is not a live-model benchmark.
- Covered low-hunger food conservation, legacy v1 eating behavior, progressive/early-ending rest,
  long-journey continuation, quiet-time skipping, and partial-round restart without duplicate requests.
- Verified legacy run IDs, rules versions, budgets, historical frames and evidence survive opening
  the new release. App and run versions are separately tested in the shipped frontend handlers.
- Physical iPhone validation of this release and a new subscription-backed v2 pilot remain owner acceptance checks.

### Live v0.2.0 deployment check

- Railway reported SUCCESS. Health/state report app `0.2.0` and latest rules `world-v2`.
- The prior live v1 run retained its ID, tick 164, 144 requests, physical state, counters and all
  166 recorded frame IDs. The original budget-stop label was recovered from its existing failure
  record after an older shutdown path replaced it; future shutdowns preserve terminal labels.
- Desktop Chrome displays app v0.2.0 separately from the preserved simulation v1/run ID, and
  instructs the owner to create a fresh run for v2. No app-origin console errors were observed.
- The release does not automatically start model calls or rewrite the old pilot as v2.

![App v0.2.0 with the preserved v1 pilot](v020-version-labels.jpg)

## App v0.2.1 — bounded inference workers

- 32 automated checks pass, including the official pinned CLI handshake and the 144-worker stress test.

- The pasted 13:38–13:42 UTC container messages are deployments preceding the live v2 pilot.
  An online HTTP container does not establish that its Codex child is alive.
- Railway metrics observed a peak near 1 GB at the 1 GB service limit. The v2 pilot paused at
  tick 120 / 64 requests with `Codex process stopped`; existing logs lack a child exit reason.
  Memory pressure is strongly indicated, not a confirmed kernel OOM diagnosis for that old exit.
- Each inference now starts a separate official Codex process with the same persisted subscription
  home, while the owner account/login process stays separate. Entire worker process groups are
  terminated and awaited before the next inference. No RAM limit increase or paid API fallback.
- A fake-provider stress test completed 144 decisions with 144 distinct, reaped worker processes,
  at most one worker at a time, and one unchanged account-control process. This is not live inference
  or a Railway memory benchmark.
- Tests also cover unexpected worker exit with safe diagnostics and successful subsequent recovery,
  and killing a launcher descendant that ignores SIGTERM. The official pinned CLI initialization
  and isolated account/read still pass without a connected account.
- App v0.2.1 keeps world-v2 rules and preserves the paused run and its partial hourly proposals.
  Real subscription-backed memory behavior remains to be checked after the owner resumes the pilot.
