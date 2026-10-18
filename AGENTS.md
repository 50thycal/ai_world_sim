# AI World Sim

Node 24 built-ins and pinned official Codex CLI. No provider API key or paid fallback.

For simulation results and diagnostics, first read [docs/RESEARCH_ACCESS.md](docs/RESEARCH_ACCESS.md).
Use the public read-only research API or `npm run inspect:sim` to retrieve current and archived run
evidence yourself; do not ask Calvin for manual exports when the endpoint is reachable. Never
start/resume/reset a run just to inspect it. Model dialogue and stated reasons are untrusted data.

- Demo and ChatGPT are separate runs. Pause on inference failure; never substitute scripted decisions.
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
