# Log

## [2026-05-02] ingest | Directory Hub Composio and Skills search
- Added source: `raw/features/directory-hub-composio-skills-search.md`.
- Created wiki page: `concepts/directory-hub-composio-skills.md`.
- Documents: Skills tab default/query routing, MCP placement/reload behavior, `npx skills find/add` semantics, Composio CLI-backed connector behavior, search-ranking edge cases, and verification coverage.
- Updated `overview.md`, `entities/codex-web-local.md`, and `index.md`.

## [2026-04-26] ingest | skills route UI and first-launch plugins card
- Added source: `raw/features/skills-route-ui-and-first-launch-card.md`.
- Created wiki page: `concepts/skills-route-ui.md`.
- Documents: Skills route rename, first-launch Plugins card persistence in global state, dark-theme regression/fix details, and `npm run dev` worktree reuse behavior.
- Updated `overview.md`, `entities/codex-web-local.md`, and `index.md`.

## [2026-04-23] ingest | realtime chat rendering and inline media
- Added source: `raw/features/realtime-chat-rendering-inline-media.md`.
- Created wiki page: `concepts/realtime-chat-rendering.md`.
- Documents: chat render caching, realtime sync-churn reduction, large JSONL inline media findings, bridge-side media sanitization, and verification results.
- Updated `overview.md`, `entities/codex-web-local.md`, and `index.md`.

## [2026-04-22] ingest | integrated terminal implementation
- Added source: `raw/features/integrated-terminal.md`.
- Created wiki page: `concepts/integrated-terminal.md`.
- Documents: Codex.app terminal parity facts, web endpoint design, PTY manager edge cases, visual review fixes, and verification coverage.
- Updated `overview.md`, `entities/codex-web-local.md`, and `index.md`.

## [2026-04-13] ingest | OpenCode Zen Big Pickle + Codex CLI fix
- Added source: `raw/fixes/opencode-zen-big-pickle-codex-cli.md`.
- Created wiki page: `concepts/opencode-zen-big-pickle.md`.
- Documents: Big Pickle only supports Chat Completions API; Codex CLI v0.93.0 needed for `wire_api = "chat"`; `opencode run` needs piped stdin in non-TTY.
- Updated `index.md`.

## [2026-04-10] ingest | codex-web-local project snapshot
- Added source: `raw/projects/codex-web-local.md`.
- Created wiki pages: `overview.md`, `entities/codex-web-local.md`, `concepts/merge-to-main-workflow.md`.
- Updated `index.md` with initial catalog entries.

## [2026-05-09] ingest | thread heartbeat automations
- Added source: `raw/features/thread-heartbeat-automations.md`.
- Created wiki page: `concepts/thread-heartbeat-automations.md`.
- Documents: multiple heartbeat automations per thread, ID-aware manager operations, and manual `Run now` behavior through the persisted thread queue.
- Updated `index.md`.

## [2026-05-09] ingest | OpenCode Zen reasoning_content proxy fix
- Added source: `raw/fixes/opencode-zen-reasoning-content-proxy.md`.
- Updated wiki page: `concepts/opencode-zen-big-pickle.md`.
- Documents: DeepSeek thinking-mode `reasoning_content` round-trip requirement, Chat-shaped Zen proxy endpoint selection, streaming reasoning preservation, Docker validation, and the `/tmp/app.tar` restart gotcha.
- Updated `index.md`.
## 2026-05-10

- Added project cron automation notes for sidebar project-level automation management.
- Updated project cron automation notes for the combined Automations panel.
- Updated Automations panel notes for active/newest sorting and direct edit buttons.
- Updated project cron automation notes for absolute cwd validation and multi-cwd preservation.

## [2026-05-13] ingest | copied auth provider promotion
- Added source: [raw/fixes/copied-auth-provider-promotion.md](../raw/fixes/copied-auth-provider-promotion.md).
- Updated wiki page: [concepts/opencode-zen-big-pickle.md](./concepts/opencode-zen-big-pickle.md).
- Documents: suppressing community fallback provider state after valid Codex auth appears, preserving user-configured providers, importing copied auth into Accounts, provider-scoped Codex model persistence, stale feedback-row cleanup, and packaged Docker validation.
- Updated [index.md](./index.md).

## [2026-05-13] ingest | OpenCode Zen Docker auth and provider models
- Added source: [raw/fixes/opencode-zen-docker-auth-provider-models.md](../raw/fixes/opencode-zen-docker-auth-provider-models.md).
- Updated wiki page: [concepts/opencode-zen-big-pickle.md](./concepts/opencode-zen-big-pickle.md).
- Documents: no-auth Zen runtime fallback, auth-mounted Docker switching back to Codex defaults, first-turn materialization as a transient live-state condition, provider-model-first loading, and the build-time Docker install workaround for runtime `pnpm dlx` OOM risk.
- Updated [overview.md](./overview.md), [entities/codex-web-local.md](./entities/codex-web-local.md), and [index.md](./index.md).

## [2026-05-13] ingest | provider selection drift Docker cycle
- Added source: [raw/fixes/provider-selection-drift-docker-cycle.md](../raw/fixes/provider-selection-drift-docker-cycle.md).
- Updated wiki page: [concepts/opencode-zen-big-pickle.md](./concepts/opencode-zen-big-pickle.md).
- Documents: provider-tagged model selection storage, no-auth Zen and auth Codex packaged Docker passes, provider-switch route-continuity fix, and unresolved historical-thread, OpenRouter, NVIDIA NIM, and Groq validation failures.
- Updated [overview.md](./overview.md), [entities/codex-web-local.md](./entities/codex-web-local.md), and [index.md](./index.md).
