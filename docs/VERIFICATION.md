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
