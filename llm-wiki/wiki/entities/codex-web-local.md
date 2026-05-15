# Entity: codex-web-local

## Summary
`codex-web-local` is a local fork/workspace for a Codex web UI and CLI wrapper (`codexapp`).

## Tech profile
- Frontend: Vue 3, Vite, TypeScript
- Backend bridge: Node + Express
- CLI output: `dist-cli/index.js` via tsup

## Operational characteristics
- Frequent branch merges into local `main`
- Strong conflict-resolution policy (intentional per-file merges)
- Manual regression documentation in `tests.md`
- Integrated terminal uses a Node PTY bridge plus an xterm frontend for local/worktree threads
- Realtime chat rendering uses cached markdown/highlight output and bridge-side inline media sanitization to keep browser payloads bounded
- User-visible UI work is expected to include dark-theme verification, not only light-theme checks
- Worktree dev startup may reuse a shared `node_modules` tree; forcing reinstall is not always the right default
- Directory Hub is the `#/skills` surface for Plugins, Apps, Composio, MCPs, Skills search, and installed local skills
- Unauthenticated Docker startup can use OpenCode Zen as a runtime fallback, while an auth-mounted `CODEX_HOME` should switch back to the default Codex provider path without Zen flags

## Source links
- [Source snapshot](../../raw/projects/codex-web-local.md)
- [Integrated terminal source](../../raw/features/integrated-terminal.md)
- [Directory Hub Composio and Skills search source](../../raw/features/directory-hub-composio-skills-search.md)
- [Realtime chat rendering source](../../raw/features/realtime-chat-rendering-inline-media.md)
- [Skills route UI + first-launch card source](../../raw/features/skills-route-ui-and-first-launch-card.md)
- [OpenCode Zen Docker auth/provider models source](../../raw/fixes/opencode-zen-docker-auth-provider-models.md)
- [Integrated terminal concept](../concepts/integrated-terminal.md)
- [Directory Hub, Composio, and Skills Search concept](../concepts/directory-hub-composio-skills.md)
- [Realtime chat rendering concept](../concepts/realtime-chat-rendering.md)
- [Merge-to-main workflow concept](../concepts/merge-to-main-workflow.md)
- [Skills route UI concept](../concepts/skills-route-ui.md)
- [OpenCode Zen + Big Pickle concept](../concepts/opencode-zen-big-pickle.md)
