# AGENTS.md

## Git Workflow

- Before any merge, rebase, sync, or continuation after interruption, re-check live state:
  - feature worktree: `git status --short`, `git branch --show-current`
  - main worktree: `git status --short`
  - in-progress state: `git status`, `.git/MERGE_HEAD`, `.git/rebase-merge`, `.git/rebase-apply`
  - remote/PR state: `git fetch origin`; when a PR may exist, `gh pr view --json number,state,mergeStateStatus,isDraft,headRefName,baseRefName,url`
  - branch delta: `git diff --stat main...HEAD` and `git log --oneline main..HEAD`
- Keep both worktrees clean before merge/rebase. Checkpoint local changes in main with `git add -A && git commit -m "temp-before-merge-<branch>"`; skip only if main is clean.
- Prefer GitHub PR update/rebase/merge when a PR or GitHub merge path exists. Use local `main` merge only when no PR/GitHub path exists or the user explicitly asks for a local merge.
- Standard path: commit task, create/switch feature branch, rebase on `main`, then use the chosen PR/local merge path.
- Never use automatic conflict-bias strategies blindly (`-X theirs`, `-X ours`, `git checkout --theirs .`, `git checkout --ours .`). Inspect conflicts intentionally.
- Avoid rebasing long-lived mixed-history branches if it pulls broad unrelated conflicts. Abort and use a fresh branch from `main` plus task-relevant cherry-picks.
- If `package.json`, `tests.md`, or files under `tests/` conflict during merge/rebase, start from the local/checkpoint version, then explicitly compare incoming changes and reconcile required updates before continuing.
- Before local `main` merge, diff-compare all branch changes against `main`.
- After merge/sync, verify the target really contains the commit with `git branch --contains <commit>`, `git log --oneline origin/main -10`, or a file-level diff against `origin/main`.

## Commits

- Commit after each discrete task or sub-task.
- Do not batch unrelated tasks into one commit.
- Use a specific commit message describing the change.

## PR Review Bots

- Treat Qodo/CodeRabbit comments as advisory, not authoritative.
- For PR update + review requests: push branch, update PR summary/verification notes when changed, then post a plain PR comment containing exactly `/review`.
- Do not use draft reviews or batch review APIs to trigger Qodo.
- Before applying a bot fix, inspect the current code path and classify the comment as real, stale/resolved, rejected, or docs-only.
- Prefer a focused regression test for accepted bugs. After fixing, run the narrow test plus relevant build/typecheck, push, and re-check PR comments/status.
- Completion reports must distinguish confirmed fixes from stale or rejected bot comments.

## Performance

- Every feature/behavior change needs a performance audit before completion.
- Ground the audit in measurements, profiler output, traces, request counts, bundle/build output, or concrete code-path analysis. If live measurement is infeasible, say what was not measured.
- Documentation-only changes do not require a performance audit.
- For startup, thread loading, realtime rendering, routing, API, filesystem, git, or module-loading changes, explicitly check duplicate requests, blocking work, unbounded fanout, large payloads, and cache invalidation risk.
- Prefer profiler helpers for browser/startup/thread work: `pnpm run profile:browser` and `pnpm run profile:thread`; reports land under `output/playwright/`.
- Profiler server setup:
  1. Ensure `node_modules` exists. In side worktrees, reuse a compatible shared dependency tree instead of installing from scratch.
  2. Before reusing `127.0.0.1:4173`, inspect the listener with `lsof -nP -iTCP:4173 -sTCP:LISTEN` and `lsof -a -p <PID> -d cwd`.
  3. If `4173` belongs to another worktree, old main checkout, or stale Vite state, stop only that `4173` process and restart from the current cwd.
  4. Never stop the persistent tmux server on `5173`.
  5. Start/current server command: `pnpm run dev --host 127.0.0.1 --port 4173`.
  6. Reject profiler output from an error page, stale worktree, indefinite `Loading threads...`, or zero API traffic caused by failed app boot. Fix readiness and rerun.
- General profile command: `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_WAIT_MS=7000 pnpm run profile:browser`.
- Thread route profile command: `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE='#/thread/<thread-id>' PROFILE_WAIT_MS=7000 pnpm run profile:browser`; use `pnpm run profile:thread` when appropriate.
- Inspect `duplicateCounts`, `warnings`, `totalApiKB`, `topApiSummary`, and `slowestApiRows`; open the matching trace zip with `npx playwright show-trace` when deeper request/render timing is needed.

## Tests And Verification

- Test changes before reporting completion when feasible.
- Update the relevant manual test doc under `tests/<domain>/` after feature work. Keep `tests.md` as the root index only. Add/adjust only the relevant section and preserve existing cases.
- Manual test entries must include feature/change name, prerequisites/setup, exact actions, expected results, and rollback/cleanup notes when applicable.
- For new/changed UI, verify light and dark themes. If dark screenshots show light surfaces on a dark page, fix CSS/theme wiring.
- Run Browser Use or Playwright only when the user explicitly asks for browser automation testing, or when a repo-specific rule below requires it.
- CJS smoke test is required for package/runtime/module-loading changes: build first, run `node -e "require(...)"` or the closest public CJS entry, confirm expected exports, and report the exact command/result.

## Browser And Playwright

- Prefer Browser Use for navigation, clicking, typing, screenshots, snapshots, and visible local UI checks.
- Use Playwright CLI directly when verification needs request interception/route stubbing, synthetic network failures, modifying `localStorage`/session storage, or other page-context mutation that the in-app Browser bridge cannot perform reliably.
- If falling back from Browser Use, state the exact limitation, keep the same target/viewport, and save screenshots under `output/playwright/`.
- Playwright scripts should default to CJS: `const { chromium } = require('playwright')`.
- Playwright sequence: use `127.0.0.1:4173`, verify the server is current, exercise the changed flow, capture light/dark screenshots for UI work, include 375x812 and 768x1024 for responsive/mobile changes, wait 2-3 seconds before final screenshots, and leave `4173` running unless asked to stop.
- Screenshot reports must include tested URL, viewport, assertion/result summary, absolute screenshot path(s), and inline Markdown image(s).
- If Playwright assertions fail, fix and rerun before reporting completion.
- For chat parsing/file-link/browse-link changes, TestChat validation is mandatory: send a unique marker with representative markdown/link content, inspect the rendered row, assert `hrefOk`, `titleOk`, and `textOk`, and save `output/playwright/testchat-<feature>-cjs.png`.

## Dev Servers

- In worktrees, reuse an existing compatible `node_modules` tree when available. Do not prompt to remove/recreate a shared dependency directory just to run dev commands.
- Pass Vite flags directly to this repo's wrapper: `pnpm run dev --host 127.0.0.1 --port 5173`; do not insert an extra `--`.
- For dev-server fixes, verify the exact user-requested command afterward.
- Never kill or restart the tmux-managed `5173` server unless the user explicitly asks.
- Treat `4173` as reusable/disposable verification infrastructure. Verify its cwd before using it; restart only stale `4173` processes.

## UI Rules

- For shared route surfaces and large feature UIs, put decisive dark-theme overrides in `src/style.css` instead of relying only on component-scoped `:global(:root.dark)` blocks.
- Browser assertions must inspect the real changed UI, not sidebar previews or base page load.
- For refresh-persistence fixes, include post-refresh evidence that the state persisted.

## Provider/Auth Docker Workflow

- Use this only when changes touch Docker startup, Codex auth detection, OpenCode Zen/OpenRouter/custom providers, provider model loading, app-server config, chat send/reply handling, or failed-turn error rendering.
- Build/package first: `pnpm run build`, `pnpm pack --pack-destination /tmp`, then build an OrbStack/Docker image installing the packed `codexapp` tarball plus `@openai/codex`, using `CODEX_HOME=/codex-home` and command `codexapp --port ${PORT:-4190} --no-password --no-open --no-tunnel --no-login`.
- Test isolated containers on unique localhost ports for: no auth Zen fallback, invalid/expired auth Codex error persistence after reload, malformed auth fallback, and provider switch from Zen to OpenRouter.
- Before success, report tested ports, provider/config summary, exact commands, screenshot paths, whether invalid auth persisted after reload, and whether duplicate live overlay count was zero.

## NPX / A1 Validation

- For `npx` package behavior tests, publish first and test the published `@latest`.
- Run `npx` validation on the Oracle host unless the user explicitly asks otherwise.
- For Oracle A1 UI validation from Mac, start the A1 server with Codex CLI in `PATH` using `pnpm run dev --host 0.0.0.0 --port 4173`, use the Tailscale URL such as `http://100.127.77.25:4173`, verify both UI and filesystem effects, and save screenshot evidence.

## LLM Wiki

- `llm-wiki/raw/` is immutable source material; never edit raw files after creation.
- Prefer updating existing pages under `llm-wiki/wiki/` over creating duplicates.
- Keep factual wiki claims tied to one or more raw source files.
- For ingest: add raw source, update/create topic pages, update `llm-wiki/wiki/index.md`, append `llm-wiki/wiki/log.md`.
- For query: read `llm-wiki/wiki/index.md` first, then relevant pages.
- For lint: check orphans, stale/contradictory claims, and add follow-up questions to the log.
