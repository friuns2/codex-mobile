# AGENTS.md

## Git Workflow (Compact)

- Keep both worktrees clean before merge/rebase:
  - feature worktree: `git status --short`
  - main worktree: `git status --short`
- If any merge/rebase is already in progress, abort it first in that worktree:
  - merge: `git merge --abort`
  - rebase: `git rebase --abort`
- Always checkpoint local changes in main worktree before merge/rebase:
  - `git add -A && git commit -m "temp-before-merge-<branch>"`
  - skip only if there are no local changes.
- Standard merge path:
  1. commit task in feature worktree
  2. create/switch feature branch
  3. rebase feature branch on `main`
  4. from main worktree: `git checkout main && git merge --no-ff <feature-branch>`
- If user explicitly asks for a single merge commit, use:
  - `git checkout main`
  - `git reset --hard <pre-merge-main-commit>`
  - `git checkout <feature-branch>`
  - `git rebase main`
  - `git checkout main`
  - `git merge --no-ff <feature-branch> -m "Merge branch '<feature-branch>' into main"`

## Never Blindly Merge (MANDATORY)

- Never use automatic conflict-bias strategies blindly (for example: `git merge -X theirs`, `git merge -X ours`, `git checkout --theirs .`, `git checkout --ours .`).
- If conflicts occur, inspect each conflicted file and resolve intentionally.
- After conflict resolution, run required verification/tests before pushing.

## Conflict Avoidance and Recovery (MANDATORY)

- Do not rebase long-lived mixed-history branches directly onto `main` if it creates broad unrelated conflicts.
- Prefer a fresh branch from `main` + cherry-pick only task-relevant commits.
- If a branch is already checked out in another worktree, rebase/commit there, then merge by branch name from main worktree.
- If merge pulls unrelated conflicts, abort and retry with a narrower commit set.

## package.json / tests.md Conflict Rule

- For any merge/rebase conflict involving `package.json`, always resolve by taking the current local/checkpoint `package.json` entirely (full file replacement) without additional review, then continue merge.
- Treat `package.json` as generated/low-priority for conflict resolution and do not block merge completion on its conflicts.
- If `package.json` has uncommitted changes during merge/rebase workflow, always discard those uncommitted changes and keep the current local/checkpoint `package.json` version.
- For any merge/rebase conflict involving `tests.md`, always resolve by taking the current local/checkpoint `tests.md` entirely (full file replacement) without additional review, then continue merge.
- Treat `tests.md` as low-priority for conflict resolution and do not block merge completion on its conflicts.

## Commit After Each Task

- Always create a commit after completing each discrete task or sub-task.
- Do not batch multiple tasks into a single commit.
- Each commit message should describe the specific change made.

## Pre-Merge Squash Review (MANDATORY)

- Before merging to local `main`, diff-compare all changes on the current branch against `main`.

## PR Review Bot Workflow (MANDATORY)

- Treat Qodo and other review-bot comments as advisory findings, not authoritative fix instructions.
- When the user asks to update a PR and request review, first push the current branch, update the PR summary/verification notes when they changed, then post a plain PR comment containing exactly `/review`.
- Do not use a draft review, pending review, or batch review technique to trigger Qodo; Qodo review requests should be ordinary PR comments.
- After posting `/review`, wait for or re-check bot comments/status when the user asks to wait, continue, or check comments.
- Before applying a suggested review-bot fix, inspect the relevant code path and decide whether the reported behavior is technically correct.
- Reproduce the issue with a focused test when feasible; if direct reproduction is impractical, document the exact reasoning and code evidence used to accept or reject the finding.
- Prefer adding or updating a regression test for every accepted review-bot bug before or alongside the fix.
- Do not patch purely to satisfy a bot comment if the behavior is correct, stale, already fixed, or the proposed change would make the implementation worse.
- After fixing an accepted review-bot finding, run the narrow regression test plus the relevant build/typecheck command, push the commit, and re-check the PR comments/status.
- In the completion report, distinguish confirmed fixes from stale or rejected bot comments.

## Performance Audit Rule (MANDATORY)

- When implementing any feature or behavior change, always audit performance before marking the task complete.
- Ground the audit in measurements, profiler output, traces, request counts, bundle/build output, or concrete code-path analysis when live measurement is not feasible.
- For startup, thread loading, realtime rendering, routing, API, filesystem, git, or module-loading changes, explicitly check for duplicate requests, unnecessary blocking work, unbounded fanout, large payloads, and cache invalidation risks.
- For browser, startup, and thread-loading performance audits, prefer the built-in profiler helpers: `pnpm run profile:browser` and `pnpm run profile:thread`, which use `scripts/profile-browser-runtime.cjs` and write reports under `output/playwright/`.
- Exact post-task profiling workflow:
  1. Start or confirm the app server on `http://127.0.0.1:4173` with `pnpm run dev --host 127.0.0.1 --port 4173`; do not stop the persistent `5173` tmux server.
  2. For general browser/startup changes, run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_WAIT_MS=7000 pnpm run profile:browser`.
  3. For thread-loading or conversation-route changes, also run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE='#/thread/<thread-id>' PROFILE_WAIT_MS=7000 pnpm run profile:browser` or `pnpm run profile:thread` when the default thread id is appropriate.
  4. Open the generated `output/playwright/browser-runtime-profile-*.json` and inspect `duplicateCounts`, `warnings`, `totalApiKB`, `topApiSummary`, and `slowestApiRows`.
  5. For traces, open the matching `output/playwright/browser-runtime-profile-*-trace.zip` with `npx playwright show-trace` when request timing or rendering behavior needs deeper inspection.
  6. Compare against the pre-change profile when available; otherwise record the current numbers as the baseline and state that no prior measurement was available.
  7. If profiling exposes duplicate requests, large payloads, slow API rows, or warnings related to the changed path, fix them or explicitly document why they are acceptable before completion.
- If live measurement is not feasible, state what was not measured and what should be measured next.
- Include the performance audit result in the completion report.

## Tests Documentation Rule (MANDATORY)

- After every feature implementation, update `tests.md` in the repository root.
- Add a new section describing how to test the feature manually.
- For any new or changed UI, include both light-theme and dark-theme verification steps/results in that test section.
- Each test section must include:
  - feature/change name
  - prerequisites/setup
  - exact step-by-step actions
  - expected result(s)
  - rollback/cleanup notes (if applicable)
- Keep existing test cases; append or update only what is needed for the new feature.
- Do not mark a feature task complete until `tests.md` is updated.

## Completion Verification Requirement (MANDATORY)

- Test changes before reporting completion when feasible.
- For any new or changed UI, always verify both light theme and dark theme before reporting completion.
- Do not treat dark theme as optional polish; dark-theme support is part of the feature being complete.
- When a user asks to "test it" for UI work and a local dev server is available, prefer actually loading the changed route and checking the rendered result instead of stopping at static analysis.
- If a dark-theme screenshot shows light-theme surfaces on a dark page, fix the actual CSS/theme wiring first; do not treat "text is visible" as sufficient.
- Run Browser Use or Playwright verification only when the user explicitly asks for browser automation testing.
- If a change affects package/runtime/module loading behavior, also run a CJS smoke test before completion.
- CJS smoke test requirement:
  1. Build the project/artifact first (if needed).
  2. Run a Node `require(...)` check against the changed entry (or closest public CJS entry).
  3. Confirm the module loads without runtime errors and expected exported symbol(s) exist.
  4. Include the exact CJS command and result summary in the completion report.
- For Playwright automation scripts, CJS (`const { chromium } = require('playwright')`) is the default style unless ESM is explicitly required.
- Preferred Playwright verification pattern for chat parsing changes (when Playwright is requested):
  - send a message with a unique marker (for selecting the correct rendered row)
  - include mixed content in one message (for example: plain text, `**bold**`, and `` `code` ``)
  - inspect row HTML and count expected rendered nodes (for example `strong.message-bold-text`)
  - save screenshot to `output/playwright/<task-name>.png`
- Playwright test sequence (when Playwright is requested):
  1. Start or confirm a single dev server instance (`pnpm run dev --host 0.0.0.0 --port 4173`).
  2. If there are stale servers on the same port, stop them first to avoid false test results.
  3. Run Playwright CLI against `http://127.0.0.1:4173` (or required test URL) and exercise the changed flow.
  4. For visual/UI changes, capture both light-theme and dark-theme results.
  5. For responsive/mobile changes, run checks at 375x812 and 768x1024.
  6. Wait 2-3 seconds before capturing final screenshot(s).
  7. Save screenshots under `output/playwright/` with task-specific names.
- Capture screenshots only when Playwright verification is requested.
- If the dev server fails to start due to pre-existing errors, fix them first or work around them before testing.
- If requested Playwright assertions fail, do not report completion; fix and re-run until passing.

## Browser Automation: Prefer Browser Use, Fallback To Playwright CLI

- For browser interactions (navigation, clicking, typing, screenshots, snapshots), prefer the Browser Use plugin first when it is available.
- Use Browser Use through its in-app browser backend for local UI testing, screenshots, and visible-route checks so evidence matches what the user can see in Codex.
- Fall back to the previous Playwright CLI approach when Browser Use is unavailable, blocked, cannot reach the target, or when the user explicitly asks for Playwright CLI/headless evidence.
- Do not run Browser Use or Playwright for routine task completion unless the user explicitly asks for browser automation testing.
- In the Playwright CLI fallback path, use headless mode by default; only add `--headed` when a live visual check is explicitly needed.
- Playwright fallback skill location: `~/.codex/skills/playwright/SKILL.md` (wrapper script: `~/.codex/skills/playwright/scripts/playwright_cli.sh`).
- Minimum reporting format in completion messages:
  - tested URL
  - viewport(s)
  - assertion/result summary
  - screenshot absolute path(s)
  - inline screenshot image(s) rendered in chat with Markdown image syntax using absolute local paths
  - CJS command/result (when module-loading behavior was changed)

## Worktree Dev Server Rule

- When working in a git worktree, prefer reusing an existing compatible `node_modules` tree when it is already available instead of triggering a fresh install by default.
- If `node_modules` is symlinked to a shared dependency directory, avoid workflows that prompt to remove and recreate that shared directory just to run `npm run dev` or `pnpm run dev`.
- For this repo's `pnpm run dev` wrapper, pass Vite flags directly, for example `pnpm run dev --host 127.0.0.1 --port 5173`; do not insert an extra `--` before `--host`.
- For dev-server fixes, verify the exact user-requested command afterwards (for example `npm run dev`), not only a fallback Vite invocation.
- Never kill or stop the tmux-managed dev server bound to port `5173`.
- Treat the `5173` tmux dev process as persistent infrastructure; restart it only when the user explicitly requests a restart.

## Dark Theme CSS Rule

- For shared route surfaces and large feature UIs, prefer putting the decisive dark-theme overrides in the global theme stylesheet (`src/style.css`) instead of relying only on component-scoped `:global(:root.dark)` blocks.
- Scoped dark overrides are fine for truly local elements, but if a full route still looks like light theme in dark mode, add or strengthen the global selectors for that surface.

## NPX Testing Rule

- For any `npx` package behavior test, **publish first**, then test the published `@latest` package.
- Do not rely on local unpublished changes when validating `npx` behavior.
- Run `npx` validation on the Oracle host (not local machine) unless user explicitly asks otherwise.
- For Playwright verification of `npx` behavior, use the Oracle host Tailscale URL (for example `http://100.127.77.25:<port>`) instead of `localhost`.

## A1 Playwright Verification (From Mac via Tailscale)

- Use this flow when validating UI behavior on Oracle A1 from the local Mac machine.
- On A1, start the app server with Codex CLI available in `PATH`:
  - `export PATH="$HOME/.npm-global/bin:$PATH"`
  - `pnpm run dev --host 0.0.0.0 --port 4173`
- From Mac, run Playwright against Tailscale URL (`http://100.127.77.25:4173`), not localhost.
- Verify success with both checks:
  - UI assertion in Playwright (new project/folder appears in sidebar or selector).
  - Filesystem assertion on A1 (`test -d /home/ubuntu/<project-name>`).
- Save screenshot artifact under `output/playwright/` and include it in the report.

## Playwright Evidence For UI Fixes

- When the user asks to test with Playwright, run the verification on the explicitly requested project/thread context (for example `TestChat`).
- Screenshot artifacts must show complete passing evidence for the tested feature, not only the base page load.
- Always show captured screenshots inline in the chat, not only as links or filesystem paths. Use Markdown image tags with absolute local paths, for example `![light verification](/absolute/path/output/playwright/example.png)`.
- For UI work, include dark-theme evidence in addition to the default/light-theme evidence unless the task is explicitly light-only.
- For refresh-persistence fixes, include a post-refresh screenshot that still shows the expected UI state.

## Docker Provider/Auth Regression Workflow

- Use this workflow when a change touches Docker startup, Codex auth detection, OpenCode Zen/OpenRouter/custom providers, provider model loading, app-server config, chat send/reply handling, or failed-turn error rendering.
- Build and test a packaged Docker image, not only the Vite dev server:
  1. Run `pnpm run build`.
  2. Run `pnpm pack --pack-destination /tmp`.
  3. Build a local image that installs the packed `codexapp` tarball plus `@openai/codex`, with `CODEX_HOME=/codex-home` and command `codexapp --port ${PORT:-4190} --no-password --no-open --no-tunnel --no-login`.
  4. Use OrbStack/Docker CLI. Do not rely on Docker Desktop.
- Start fresh isolated containers on unique localhost ports for at least these cases:
  - no auth file: no `/codex-home/auth.json`; expect runtime OpenCode Zen fallback, `model_provider="opencode-zen"`, `model="big-pickle"`, send `hi`, wait for an assistant reply.
  - invalid/expired auth file: mount an `auth.json` with token fields containing invalid/expired strings; expect Codex provider path, send `hi`, wait for final 401/auth error rendered in chat, verify `Send feedback`, reload the thread, verify the error persists, and verify no duplicate live `Thinking` overlay remains after persistence.
  - malformed auth file: mount invalid JSON as `/codex-home/auth.json`; expect it to be treated as unusable auth and fall back to Zen, then send `hi` and wait for a reply.
  - provider switch: start from OpenCode Zen, send `hi` and wait for a reply, switch the Provider settings selector to OpenRouter (do not change the model dropdown directly), send `hi` again and wait for a reply.
- Browser assertions must inspect conversation rows, not sidebar previews. A test is not passing just because the sidebar contains the sent text.
- Save screenshots under `output/playwright/` for all Docker browser cases and show them inline in the completion report.
- Before reporting success, include:
  - tested URLs/ports,
  - provider/config summary for each container,
  - exact build/test commands,
  - screenshot absolute paths,
  - whether invalid auth persisted after reload and whether duplicate live overlay count was zero.
- If any Docker edge case fails, fix it before requesting PR review or merge.

## Mandatory CJS + TestChat Validation For Markdown/File-Link Features

- For any markdown parsing, link parsing, file-link rendering, or browse-link encoding change, verification in `TestChat` is mandatory before reporting completion.
- Use CJS Playwright scripts as the default verification implementation:
  - `const { chromium } = require('playwright')`
  - run from repository working directory so local `node_modules` resolves correctly.
- Required validation flow:
  1. Start dev server at `http://127.0.0.1:4173`.
  2. Open project `TestChat`.
  3. Open an existing TestChat thread, or create one if none exists.
  4. Send a message with a unique marker plus target markdown link (example: ``<MARKER> [hosting_manager.py](/home/ubuntu/Documents/New Project (2)/hosting_manager.py)``).
  5. Locate the rendered row by marker.
  6. Assert a parsed file link exists (`a.message-file-link`) in that row.
  7. Assert link metadata is correct:
     - `href` includes encoded full path (example: `/codex-local-browse/home/ubuntu/Documents/New%20Project%20(2)/hosting_manager.py`)
     - `title` equals the original full file path
     - visible link text contains expected filename.
  8. Save screenshot to `output/playwright/testchat-<feature>-cjs.png`.
- Completion report must include:
  - tested URL
  - thread context (`TestChat`)
  - viewport
  - exact CJS command/script path
  - assertion summary (`hrefOk`, `titleOk`, `textOk`)
  - screenshot absolute path
  - inline screenshot image rendered in chat with Markdown image syntax using the absolute screenshot path

## LLM Wiki Schema

This repository includes a persistent wiki under `llm-wiki/` maintained by an LLM agent.

### Structure
- `llm-wiki/raw/`: immutable source notes and captured material.
- `llm-wiki/wiki/`: synthesized, interlinked markdown pages.
- `llm-wiki/wiki/index.md`: catalog of pages.
- `llm-wiki/wiki/log.md`: append-only operation log.

### Conventions
- Never edit files under `llm-wiki/raw/` after creation.
- Prefer updating existing wiki pages over creating duplicates.
- Add wiki links using relative markdown links.
- Keep factual claims tied to one or more source files in `llm-wiki/raw/`.

### Operations
- Ingest:
  1. Add a source under `llm-wiki/raw/`.
  2. Create or update topic/entity pages under `llm-wiki/wiki/`.
  3. Update `llm-wiki/wiki/index.md`.
  4. Append one entry in `llm-wiki/wiki/log.md`.
- Query:
  1. Read `llm-wiki/wiki/index.md` first.
  2. Read relevant linked pages.
  3. Synthesize an answer and optionally file it back as a page.
- Lint:
  1. Check for orphan pages.
  2. Check for stale or contradictory claims.
  3. Add follow-up questions to the log.
