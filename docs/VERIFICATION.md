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
- A redeploy persistence check and final owner setup form check will be recorded below.

## Pending owner acceptance

- Authorize device-code login on a physical phone with the intended ChatGPT account.
- Confirm available model and create a fresh ChatGPT run. Advance one decision round (six requests).
- Confirm completed decisions, provider-reported usage, actual resource changes after travel,
  pause/resume and evidence export. Check the selected account's quota/credit settings.
- Restart the service while paused and verify both the same world and connected account survive.

No subscription inference, paid API call or model-cost benchmark has been completed by these tests.
Physical-phone layout and sign-in remain unverified; desktop browser rendering is verified.
