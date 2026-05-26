# Tests

This file is the manual test index. Detailed regression and feature verification steps live in domain folders under [`tests/`](tests/).

## Architecture

- Keep one root index (`tests.md`) so existing links and contributor habits keep working.
- Put each product area in a domain folder such as `tests/automations/` or `tests/chat-composer-rendering/`.
- Keep one manual test section per file inside the domain folder so feature updates create small diffs and narrow merge conflicts.
- Use each domain folder `index.md` to find the detailed section file.
- Add new test sections to the narrowest matching domain folder; create a new domain folder only when no existing domain fits.
- Use [`tests/template.md`](tests/template.md) for the required manual test shape.

## Domain Folders

| Folder | Sections | Scope |
| --- | ---: | --- |
| [Projects, Sidebar, and New Chat](tests/projects-sidebar-new-chat/index.md) | 16 | Home route, project picker, sidebar organization, new-chat setup, projectless folders, and project/worktree shell behavior. |
| [Automations](tests/automations/index.md) | 4 | Thread heartbeat automations, project cron automations, dialogs, action rows, and automation panel behavior. |
| [Skills, Plugins, and Integrations](tests/skills-plugins-integrations/index.md) | 27 | Skills Hub, skill sync, plugin/app directory surfaces, prompts, Composio, Telegram, and installed skill behavior. |
| [Chat Composer and Message Rendering](tests/chat-composer-rendering/index.md) | 33 | Composer controls, queued messages, plan mode, markdown parsing, file links, attachments, generated images, and visible message rows. |
| [Thread Loading, Streaming, and State](tests/thread-loading-state/index.md) | 26 | Thread list/detail loading, pagination, selected-thread stability, streaming scroll behavior, live-state reads, and missing-thread handling. |
| [Providers and Models](tests/providers-models/index.md) | 24 | Provider selectors, model menus, OpenRouter, OpenCode Zen, custom endpoints, Responses/Completions format, and model refresh behavior. |
| [Auth and Docker Runtime](tests/auth-docker-runtime/index.md) | 12 | Codex auth, Docker-packaged runtime cases, copied auth behavior, invalid auth errors, and auth-aware provider fallback. |
| [CLI, Network, and Platform](tests/cli-network-platform/index.md) | 17 | CLI startup, dev scripts, npx, Tailscale, Cloudflare tunnels, Windows, Android, Termux, and platform packaging behavior. |
| [Git, Worktrees, and Rollback](tests/git-worktrees-rollback/index.md) | 25 | Branch controls, worktree creation, rollback commits, changed-files panels, file browser links, and rollback debug behavior. |
| [Accounts, Feedback, and Observability](tests/accounts-feedback-observability/index.md) | 14 | Account panels, quota refresh, feedback diagnostics, Sentry, browser profiling, API perf logs, and Qodo diagnostic fixes. |
| [Theme, Layout, and Terminal](tests/theme-layout-terminal/index.md) | 16 | Light/dark theme regressions, responsive layout, terminal UI, mobile keyboard behavior, dialog sizing, and visual alignment. |
| [Website, Docs, and Miscellaneous](tests/website-docs-misc/index.md) | 3 | Static website checks and small compatibility checks that do not yet fit a narrower product area. |

## Template

See [`tests/template.md`](tests/template.md).
