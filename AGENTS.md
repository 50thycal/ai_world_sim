# AI World Sim

Node 24 built-ins and pinned official Codex CLI. No provider API key or paid fallback.

- Demo and ChatGPT are separate runs. Pause on inference failure; never substitute scripted decisions.
- Engine owns positions, inventories and outcomes. Model text is data, never executable code.
- Preserve run IDs, versions, decision sources and failures. Restart paused.
- Villager observations must not leak other villagers' private inventories or memories.
- Credentials stay outside public assets, exports, logs and git. Codex owns device authentication.
- Disable shell, web search, plugins and external tools for villagers.
- One Railway replica and persistent volume; no shared SQLite across replicas.
- Run npm test and npm run check. Browser-check desktop and phone layouts for UI changes.
- Distinguish protocol/demo tests from completed subscription inference and deployed persistence checks.
