---
name: "codex-app-parity"
description: "Use only when the user explicitly mentions Codex parity, codex-app-parity, Codex.app parity, or asks to compare against the installed Codex desktop app."
---

# Codex App Parity Skill

Use this skill only when the user explicitly asks for Codex parity work, names `codex-app-parity`, mentions Codex.app parity, or asks to compare behavior against the installed Codex desktop app.
Do not auto-trigger this skill for ordinary feature work, UI changes, or user-visible behavior changes unless the user explicitly requests that parity workflow.

## Objective

Ensure behavior is implemented with Codex.app as the source of truth, then verified with headless Playwright and screenshots.

## Project Instructions

## Repo Knowledge Maintenance

For user-visible Directory, Skills, Apps, Plugins, MCP, or Composio changes in this repo:

- Update the relevant manual test doc under `tests/<domain>/...` with verification steps, including light and dark theme checks. Update `tests.md` only when adding, renaming, or removing a domain folder.
- If the change creates or changes durable behavior/architecture, add or update an `llm-wiki/raw/...` source and corresponding `llm-wiki/wiki/...` concept page.
- Keep `whatToTest.md` as a short pending-only checklist; remove items that were actually executed successfully.
- Prefer assertions plus screenshots for browser validation; screenshots alone are not enough.

## Codex.app-First Development Policy

For every **new feature** and every **behavior/UI change**, treat the installed desktop app as the source of truth:

- App path: `/Applications/Codex.app`
- Primary bundle to inspect: `/Applications/Codex.app/Contents/Resources/app.asar`

Do not implement first and compare later. Compare first, then implement.

## How to Search for Features in Codex.app

### Extraction

Extract the app bundle once (reuse if already extracted):

```bash
mkdir -p /tmp/codex-app-extracted
npx asar extract "/Applications/Codex.app/Contents/Resources/app.asar" /tmp/codex-app-extracted
```

### Key Directories

| Directory | Contents |
|-----------|----------|
| `/tmp/codex-app-extracted/webview/assets/` | Main frontend bundle (`index-*.js`) + locale files |
| `/tmp/codex-app-extracted/.vite/build/` | Electron main process (`main.js`, `main-*.js`, `preload.js`, `worker.js`) |
| `/tmp/codex-app-extracted/package.json` | App metadata, version, entry point |

### Searching the Minified Bundle

The main UI bundle is a single large minified JS file at `webview/assets/index-*.js`. Use Python to search since `grep -o` with large repeat counts fails on macOS:

```python
python3 -c "
with open('/tmp/codex-app-extracted/webview/assets/index-<hash>.js', 'r') as f:
    content = f.read()
idx = content.find('YOUR_SEARCH_TERM')
if idx >= 0:
    print(content[max(0, idx-200):idx+500])
"
```

### What to Search For

1. **i18n keys**: Search locale files (`webview/assets/zh-TW-*.js`, `webview/assets/en-*.js`, etc.) for human-readable labels. Keys follow the pattern `component.feature.property` (e.g., `composer.dictation.tooltip`).

2. **Component functions**: Minified React components follow patterns like `function X4n({prop1:t,prop2:e,...})`. Search for the feature's i18n key to find the component that renders it.

3. **API calls and endpoints**: Search main process files (`.vite/build/main-*.js`) for endpoint URLs, auth handling, and IPC channels. Key patterns:
   - `prodApiBaseUrl` → production API base (e.g., `https://chatgpt.com/backend-api`)
   - `devApiBaseUrl` → dev API base (e.g., `http://localhost:8000/api`)
   - `fetch-request` / `fetch-response` → IPC-proxied HTTP calls from renderer to main process

4. **Icon names**: Search for icon imports like `audiowave-dark.svg`, `book-open-dark.svg`. Icon mapping is in the main bundle around the `Hwn=Object.assign({` pattern.

5. **Keyboard shortcuts**: Search for `CmdOrCtrl+`, `Cmd+`, `keydown`, `keyCode`, or specific key names.

### Search Strategy

1. Start with **i18n locale files** — they have human-readable labels that identify features.
2. Use the i18n key to find the **component** in the main bundle.
3. Trace the component to find **hooks/composables**, **API calls**, and **event handlers**.
4. Check the **main process** bundle for any server-side proxying or Electron IPC handling.

## Mandatory CDP Frontend Inspection

For every feature UI or user-visible fix, inspect the live Codex.app frontend over Chrome DevTools Protocol before implementing. Bundle search is still useful, but it is not enough by itself when a visual/interaction surface exists.

### Required CDP Evidence

- Connect to Codex.app over CDP.
- Navigate or interact until the relevant feature UI, closest equivalent UI, or broken/fixed state is visible.
- Capture a screenshot under `output/playwright/` with a task-specific filename.
- Record in the final response:
  - CDP endpoint/port
  - Codex.app target URL/title
  - screenshot absolute path
  - what was visually confirmed

If the exact UI cannot be reached, capture the closest relevant Codex.app surface and state the gap.

## Mandatory Comparison and Fix Iteration

For every feature UI or user-visible fix, compare Codex.app against the web UI **before and after implementation**.

Required artifacts:

- `codex-reference`: Codex.app CDP screenshot of the target feature UI or closest equivalent.
- `web-before`: current web UI screenshot before code changes, showing the existing gap or missing behavior.
- `web-after`: web UI screenshot after implementation, showing the proposed parity result.

Required comparison notes:

- Before coding, write a short parity gap list from `codex-reference` vs `web-before`.
- After coding, compare `web-after` against `codex-reference`.
- Classify every notable mismatch as:
  - `fixed`: matched or acceptably aligned
  - `intentional deviation`: documented reason
  - `needs follow-up`: not fixed in this task
- If `web-after` reveals a fixable mismatch in layout, copy, visibility, interaction, or state handling, do another implementation iteration and capture a new `web-after` screenshot.
- Do not report completion until the iteration has either resolved the mismatch or documented why it remains.

Use task-specific screenshot names under `output/playwright/`, for example:

- `output/playwright/<task>-codex-reference.png`
- `output/playwright/<task>-web-before.png`
- `output/playwright/<task>-web-after.png`

### Reliable CDP Launch Pattern

Before launching anything new, first check whether a Codex.app CDP endpoint is already available and reusable. Avoid creating additional Codex instances when an existing CDP-enabled instance already exposes a usable `app://-/index.html` page target.

Preferred reuse check:

```bash
for port in 3434 3435 9222 9223; do
  if curl -fsS "http://127.0.0.1:$port/json/list" >/tmp/codex-cdp-list.json 2>/dev/null; then
    python3 - <<'PY'
import json
from pathlib import Path
rows = json.loads(Path('/tmp/codex-cdp-list.json').read_text())
page = next((row for row in rows if row.get('type') == 'page' and str(row.get('url', '')).startswith('app://-/index.html')), None)
if page:
    print(page['webSocketDebuggerUrl'])
PY
    if [ -s /tmp/codex-cdp-list.json ]; then
      echo "Reusing CDP on port $port"
      break
    fi
  fi
done
```

If a usable target is found, reuse it and do not launch another Codex instance.

Only if no reusable CDP target exists, prefer running a separate Codex.app debug instance so the user's normal Codex session is not interrupted and the CDP target can stay alive after tests.

In this repo, prefer the maintained helper script first:

```bash
bash /Users/igor/Git-projects/codex-web-local/scripts/run-codex-unpacked-debug.sh
```

The script:

- launches Codex.app from the installed `app.asar` under external Electron
- pins the external runtime to `electron@41.2.0`
- auto-picks free CDP and Node inspector ports
- verifies the endpoints after launch
- prepares the required native Sparkle shim for external-Electron runs

If the helper script fails, treat the failure as a skill maintenance signal, not just a one-off launch error:

- Inspect the failing shell script and its nearby helper scripts before using a manual fallback.
- Fix durable launcher bugs in the `.sh` scripts when the cause is clear and local to the script.
- Re-run the helper after the fix and update this skill with any new reliable launch finding.
- Use a manual launch fallback only when the script cannot be repaired safely in the current task.

Use `--verify-only` when you only need to confirm whether the current endpoints are still alive.

Use a fresh app instance with its own profile directory:

```bash
CDP_PORT=3434
while lsof -i :"$CDP_PORT" >/dev/null 2>&1; do
  CDP_PORT=$((CDP_PORT + 1))
done

CDP_PROFILE_DIR="/tmp/codex-cdp-$CDP_PORT"
mkdir -p "$CDP_PROFILE_DIR"

open -na "Codex" --args \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$CDP_PROFILE_DIR"

until curl -fsS "http://127.0.0.1:$CDP_PORT/json/list" >/tmp/codex-cdp-list.json; do
  sleep 1
done
```

If Codex.app is already running without CDP, `open -a "Codex" --args --remote-debugging-port=3434` usually does **not** enable CDP because Electron reuses the existing app instance. Restart Codex.app with the port enabled.
Fallback only when a separate instance cannot be used: restart all Codex.app processes and launch the binary with `nohup`.

```bash
pkill -TERM -f "/Applications/Codex.app" 2>/dev/null || true
sleep 2
if pgrep -f "/Applications/Codex.app" >/dev/null 2>&1; then
  pkill -KILL -f "/Applications/Codex.app" 2>/dev/null || true
  sleep 1
fi

nohup "/Applications/Codex.app/Contents/MacOS/Codex" \
  --remote-debugging-port="$CDP_PORT" \
  >/tmp/codex-cdp.log 2>&1 &
```

Pick the page target from `/json/list` where `type == "page"` and `url` starts with `app://-/index.html`. For Playwright screenshots, prefer `chromium.connectOverCDP("http://127.0.0.1:$CDP_PORT")`, select that page, wait briefly for React/app-server hydration, and save the screenshot.

Important caveats:

- Reuse any already-running Codex.app CDP endpoint when possible; do not spawn a second or third debug instance just because the default example uses `3434`.
- `open -na "Codex"` is required for a true separate instance; `open -a "Codex"` reuses an existing app process and often does not enable CDP flags.
- Always pass an isolated `--user-data-dir` for the debug instance to avoid profile lock contention and cross-session side effects.
- If launched via raw binary, use `nohup` or a long-lived shell; short one-shot launches can drop the CDP listener when the shell exits.
- Do not call `browser.close()` when the Codex.app session should remain open.
- In Playwright builds where `browser.disconnect()` is unavailable for CDP sessions, connect, inspect/capture, and exit the test process without `close()`; this preserves the running Codex.app instance.
- Existing helper processes can keep stale non-CDP state alive; killing all `/Applications/Codex.app` processes is more reliable than only `pkill -x Codex`.
- CDP inspection can expose local thread titles and workspace names. Avoid pasting sensitive screenshot contents into public artifacts.

## Findings: CDP Instance Reuse (2026-04-26)

- In this workspace, parity work often happens repeatedly in the same session, so a previously launched Codex.app debug instance may already be listening on a local CDP port.
- Before using `open -na "Codex"` or starting a fresh debug profile, probe common local ports and reuse an existing endpoint when it already serves a valid `app://-/index.html` page target.
- Creating unnecessary extra Codex.app instances makes parity work noisier and can leave behind multiple stale debug profiles under `/tmp/codex-cdp-*`.

## Findings: External Electron Debug Launcher (2026-05-06)

- In this workspace, the most reliable parity-debug launch path is now:
  - `bash /Users/igor/Git-projects/codex-web-local/scripts/run-codex-unpacked-debug.sh`
- The helper intentionally uses external Electron instead of `/Applications/Codex.app/Contents/MacOS/Codex`, because that preserves the generic Electron-style process/icon behavior some parity workflows expect while still launching the installed Codex `app.asar`.
- Using an unpinned external Electron such as `pnpm dlx electron` can break startup because Codex.app expects Electron-41-era native resources; the current helper pins the runtime to `electron@41.2.0`.
- External-Electron startup also needs Codex’s bundled Sparkle native addon available at the external Electron resource path. The helper now prepares a shim by linking:
  - `/Applications/Codex.app/Contents/Resources/native/sparkle.node`
  - into the matching `pnpm dlx` Electron bundle before launch.
- Verified-good external debug state from this environment:
  - browser/CDP endpoint exposed from `--remote-debugging-port`
  - Node inspector endpoint exposed from `--inspect`
  - WebSocket connection to the Node inspector target succeeds, not just `json/list`
- When validating a parity session, do not stop at `curl /json/list`; also confirm a real WebSocket connect to the returned `webSocketDebuggerUrl`.

### Architecture Notes

- **Renderer → Main Process**: The renderer uses a `Uu` HTTP client class that sends `fetch-request` IPC messages to the main process. The main process class `tle` handles these, adds auth tokens, and uses `electron.net.fetch` to make actual HTTP calls.
- **Auth**: Auth tokens come from the app-server's `getAuthStatus` RPC method (ChatGPT backend auth).
- **App-server**: A `codex app-server` child process communicating via JSON-RPC over stdin/stdout. Our bridge middleware proxies RPC calls to it.
- **Config constants**: `R7` = prodApiBaseUrl (`https://chatgpt.com/backend-api`), `I7` = devApiBaseUrl (`http://localhost:8000/api`), `C7` = originator (`Codex Desktop`).

## Required Workflow (Feature Work)

1. Identify target behavior:
- Restate what behavior is being added/changed.
- Define whether it is: data mapping, runtime event handling, UX text, visual treatment, interaction model, or all of these.

2. Inspect Codex.app before coding:
- Locate the implementation in `app.asar` (extract and search built assets as needed).
- Find relevant strings/keys/functions/components for the feature (status labels, event names, item types, summaries, collapse/expand behavior, etc.).
- Capture the closest equivalent pattern if exact parity is not present.
- Connect to the live Codex.app frontend over CDP and capture a screenshot of the target UI or closest equivalent before coding.
- Capture the current web UI before screenshot and list concrete gaps versus Codex.app.

3. Build a parity checklist from Codex.app:
- Data model shape (fields used by UI).
- Realtime event sources and transitions.
- Rendering structure (what is shown collapsed vs expanded).
- Copy/text behavior (phrasing and status wording).
- Interaction behavior (auto-expand, auto-collapse, click/keyboard handling).
- Visibility rules (when elements appear/disappear).

4. Implement against that checklist:
- Prefer Codex.app behavior over novel design.
- Keep deviations minimal and intentional.
- If deviating, include a short reason in the final response.

5. Verify parity after implementation:
- Confirm each checklist item.
- Run local build/tests.
- Re-check UI behavior against Codex.app reference.
- Compare the implemented web UI screenshot against the Codex.app CDP reference screenshot.
- Iterate on fixable mismatches, then recapture the web UI after screenshot.

## Response Requirements (When delivering feature changes)

For feature tasks, include:

- `Codex.app analysis`: what was inspected (files/areas/patterns).
- `Codex.app CDP evidence`: target URL/title, screenshot path, and visual behavior confirmed.
- `Before/after comparison`: screenshot paths, gap list, and fix iteration result.
- `Parity result`: matched items and any explicit deviations.
- `Fallback note` only if Codex.app could not be inspected or had no equivalent.

## Fallback Rules

If Codex.app cannot be inspected (missing app, extraction/search failure) or has no equivalent pattern:

- State the blocker explicitly.
- Use best local implementation consistent with existing repository patterns.
- Keep behavior conservative and avoid speculative UX innovations.

## Scope and Safety

- This policy applies to **feature behavior and UX decisions**, not just styling.
- Bug fixes should still check Codex.app when they affect user-visible behavior.
- Prefer minimal patches that align with app behavior rather than large refactors.

## Completion Verification Requirement

- After completing a task that changes behavior or UI, always run a Playwright verification in **headless** mode.
- Always capture a screenshot of the changed web result and display that screenshot in chat when reporting completion.
- Also keep the Codex.app CDP reference screenshot path in the completion report for user-visible feature/fix work.
- Include web-before and web-after screenshot paths, plus a short comparison result.

## Self-Improvement Protocol

After each feature implementation session that uses this skill:

1. **Record new findings**: Append a dated `## Findings:` section documenting any newly discovered Codex.app internals (state keys, API endpoints, component patterns, auth flows, etc.).
2. **Update search instructions**: If new search techniques were used (e.g., a better way to extract minified code, new file locations), update the "How to Search for Features" section.
3. **Update architecture notes**: If new IPC channels, API endpoints, or data flows were discovered, add them to the Architecture Notes.
4. **Keep findings actionable**: Each finding should include enough detail that a future session can reuse it without re-discovering.

## Findings: Workspace Root Ordering (2026-02-25)

- Codex.app persists workspace root ordering/labels in global state JSON keys:
  - `electron-saved-workspace-roots` (order source of truth)
  - `electron-workspace-root-labels`
  - `active-workspace-roots`
- In this environment, persisted file path is:
  - `~/.codex/.codex-global-state.json`
- In packaged desktop runs, equivalent userData path is typically:
  - `~/Library/Application Support/Codex/.codex-global-state.json`
- For folder/project reorder parity, prefer reading these keys over browser LocalStorage-only ordering.
- Validation requirement for reorder changes:
  - Run build/typecheck.
  - Run Playwright in headless mode and capture a screenshot showing sidebar order.

## Findings: Approval Request Payload Compatibility (2026-04-07)

- This workspace bundles app-server schemas that still expose JSON-RPC server request methods such as `item/commandExecution/requestApproval` and `item/fileChange/requestApproval`, but the generated event typings also include newer approval event names such as `exec_approval_request` and `apply_patch_approval_request`.
- Newer approval payloads may carry snake_case fields (`turn_id`, `call_id`, `grant_root`) or camelCase fields (`conversationId`, `callId`, `grantRoot`) instead of the older `threadId` / `itemId` request metadata.
- For CodexUI parity work involving approvals, normalize both method aliases and payload field aliases before rendering the pending-request UI; otherwise valid approval requests can fall through to the generic unknown-request actions.
- Live schema generated from `codex-cli 0.118.0` also includes JSON-RPC server requests for `mcpServer/elicitation/request` and `item/permissions/requestApproval`. The checked-in schema snapshot in this repo can lag behind the installed CLI, so for approval/request UI bugs it is worth generating fresh schemas locally via `codex app-server generate-json-schema --out <dir>` before deciding the app-server contract.
- In live MCP elicitation schemas, required fields without defaults should remain unset until the user provides a value; preselecting `false` or the first enum option changes the meaning of the user’s response.
- For MCP `url` elicitation mode, treat the server-provided URL as untrusted input and only render clickable links for safe schemes such as `http:` and `https:`.

## Findings: Pinned Thread Persistence (2026-04-07)

- This workspace now persists pinned sidebar threads in Codex global state (`~/.codex/.codex-global-state.json`) under key `thread-pinned-ids`.
- Bridge API endpoints added for web/client parity wiring:
  - `GET /codex-api/thread-pins` -> `{ data: { threadIds: string[] } }`
  - `PUT /codex-api/thread-pins` with body `{ threadIds: string[] }`
- Frontend behavior:
  - Sidebar bootstraps pins from `thread-pinned-ids` via the bridge endpoint.
  - No `localStorage` persistence is used for pinned-thread state.

## Findings: Context Usage Meter (2026-04-01)

- Official `openai/codex` app-server protocol exposes per-thread context telemetry via `thread/tokenUsage/updated` with:
  - `tokenUsage.total`
  - `tokenUsage.last`
  - `tokenUsage.modelContextWindow`
- In the official TUI, context-window percentage is derived from `last_token_usage`, not cumulative `total_token_usage`.
- Official normalization subtracts a fixed `BASELINE_TOKENS = 12000` before computing remaining context percentage, so early turns do not look artificially "used".
- Official status/context copy found in the TUI favors:
  - `X% left`
  - `Y used`
  - `Z window`
- When docs are blocked, the quickest parity trace for this feature is:
  - `codex-rs/app-server-protocol/schema/typescript/v2/ThreadTokenUsage*.ts`
  - `codex-rs/tui/src/chatwidget.rs`
  - `codex-rs/protocol/src/protocol.rs`

## Findings: File Change Turn Summaries (2026-03-30)

- Official app-server docs in `openai/codex` confirm that:
  - `turn/diff/updated` carries `{ threadId, turnId, diff }` as the latest aggregated unified diff for the whole turn.
  - `fileChange` thread items carry `{ id, changes, status }`.
  - Each `changes` entry is `{ path, kind, diff }`.
- For persisted/history-backed UI summaries, prefer `fileChange` thread items over reconstructing state from deltas:
  - `kind` maps to add/delete/update.
  - `update` may include `move_path` for rename/move handling.
  - `item/completed` is the authoritative final state for whether edits actually applied.
- For user-facing file summaries, treat `turn/diff/updated` as a supplemental aggregated diff source, not the only source:
  - pure rename/move flows may not emit a meaningful turn diff payload for summary text.
  - `fileChange` items are the more reliable source for per-file operation labels.

## Findings: Mobile Composer Submit Stabilization (2026-03-28)

- In this workspace, mobile web send UX is more reliable when submit does two things together:

## Findings: Header Branch Switcher Includes Review Action (2026-04-08)

- Codex.app locale bundle includes explicit branch-search copy (`codex.composer.searchBranches`), which aligns with searchable branch selection controls in header/composer surfaces.
- For parity in this repo, header-level branch control now combines:
  - current branch display,
  - branch switching via searchable dropdown,
  - review-pane toggle action inside the same menu instead of a separate header button.
- Detached HEAD should be represented explicitly in the dropdown trigger when no branch name is available.
  - blur the composer textarea immediately so the virtual keyboard dismisses
  - trigger the conversation `jumpToLatest()` immediately and again over the next animation frames so the viewport stays pinned after the keyboard resize
- Relying on conversation auto-follow alone is not enough for the mobile keyboard-close transition because the viewport height change can land after the first bottom-lock pass.

## Findings: Thread Forking (2026-03-28)

- The bundled app-server protocol in this repo already exposes stable `thread/fork` support in v2, so UI work should call the RPC directly instead of simulating a new thread locally.
- `ThreadForkParams.path` is documented as an unstable rollout-path override, while `threadId` remains the preferred stable entry point for IDE clients.
- When implementing “fork from this answer” in the UI, a safe repo-local strategy is:
  - call `thread/fork` for the source thread
  - then call `thread/rollback` on the new thread for trailing turns after the chosen answer
- Verification can assert real branching, not just button presence:
  - fork from a non-final response in Playwright
  - confirm URL changes to a new thread id
  - confirm the new thread has fewer turns than the source thread
- Thread title rendering in this fork must prefer server-provided `name`/`title` over `preview`; otherwise renamed forked threads will still look identical to the source thread in the header and sidebar.

## Findings: Ordered List Numbering (2026-03-27)

- `ThreadConversation.vue` uses a custom Markdown block parser rather than a standard Markdown library.
- Ordered-list items separated by non-indented paragraphs are parsed into multiple `orderedList` blocks.
- To preserve author-visible numbering in that case, each `orderedList` block needs the original marker value persisted and rendered via the HTML `<ol start=\"...\">` attribute.
## Findings: Dictation / Microphone Feature (2026-02-26)

- **i18n keys**: `composer.dictation.*` — tooltip is "Hold to dictate", aria is "Dictate".
- **Component**: `M4n` React hook handles recording state, audio capture, and transcription.
- **Audio pipeline**: `navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })` → `MediaRecorder` → chunks → `Blob` → multipart POST.
- **Transcription endpoint**: The renderer sends audio to `/transcribe` via the IPC fetch proxy. The main process (`tle` class) prepends the `prodApiBaseUrl` (`https://chatgpt.com/backend-api`) and attaches ChatGPT auth bearer tokens. Full URL: `https://chatgpt.com/backend-api/transcribe`.
- **Request format**: Multipart form-data with boundary `----codex-transcribe-<uuid>`, fields: `file` (audio blob) and optional `language`. Body is base64-encoded and sent with `X-Codex-Base64: 1` header.
- **Response**: `{ text: "transcribed text" }`.
- **Interaction model**: Press-and-hold to record → release to stop and transcribe → text inserted into composer. Has "insert" and "send" modes.
- **Icon**: `audiowave-dark.svg` / `audiowave-light.svg` (custom SVG, not from icon library).
- **Web app implementation**: Our bridge proxies `/codex-api/transcribe` to the ChatGPT backend using auth tokens from the app-server `getAuthStatus` RPC. Frontend uses `useDictation` composable with `MediaRecorder` API.

## Findings: Chat Markdown Image Embeds (2026-03-04)

- Codex.app renderer bundle includes markdown-to-HTML image handling (`image({href,title,text})` emits `<img src="...">`), consistent with inline markdown image rendering in assistant/user text.
- In web parity mode, absolute local paths in markdown image URLs need explicit server mediation; browser runtime does not resolve `/Users/...` as local files.
- A dedicated local image endpoint (`/codex-local-image?path=...`) is required for parity-like rendering of absolute filesystem image paths in browser-delivered UI.
- Express `sendFile` must allow dot-directory segments (`dotfiles: 'allow'`) or paths under `~/.codex/...` return 404 despite existing files.

## Findings: Composer Enter Behavior (2026-03-05)

- Codex.app composer input is rich-text/multiline (`ProseMirror`-based), not single-line.
- Enter handling is configurable (`enterBehavior`):
  - `enter` submits by default.
  - `newline` inserts a newline on Enter.
  - `cmdIfMultiline` inserts newline when multiline, otherwise submits.
- Newline shortcuts are explicitly bound:
  - `Shift-Enter` inserts newline.
  - `Alt-Enter` inserts newline.
  - `Mod-Enter` submits.
- This confirms multiline composition parity requires newline-capable input plus explicit Enter-vs-newline key handling.

## Findings: Composer `@` Mentions (2026-03-05)

- Codex.app uses a dedicated mention trigger plugin for `@` with pattern `/(^|\s)(@[^\s@]*)$/`, so mentions activate at word boundaries and stop on whitespace or a second `@`.
- Mention entries are stored as an inline `mention-ui` node with attrs `{ label, path, fsPath }`, rendered with data attributes `at-mention-label`, `at-mention-path`, and `at-mention-fs-path`.
- Mention picker keyboard behavior includes:
  - `Escape` closes mention UI.
  - `Enter` and `Tab` commit the highlighted mention.
- Composer placeholder copy in local mode explicitly documents this affordance: `Ask Codex anything, @ to add files, / for commands`.

## Findings: Thread Rename Flow (2026-03-12)

- Codex.app locale keys confirm sidebar rename flow is dialog-based, not inline:
  - `sidebarElectron.renameThread`
  - `sidebarElectron.renameThreadDialogTitle`
  - `sidebarElectron.renameThreadDialogSubtitle`
  - `sidebarElectron.renameThreadDialogPlaceholder`
  - `sidebarElectron.renameThreadDialogSave`
  - `sidebarElectron.renameThreadDialogCancel`
  - `sidebarElectron.renameThreadDialogAriaLabel`
- App-server RPC for rename uses method `thread/name/set` with params `{ threadId, name }` (not `threadName`).
- `thread/name/updated` realtime notification carries `{ threadId, threadName }`, so parity implementations should handle both request/response naming differences (`name` on write, `threadName` on notification).

## Findings: Local Parity Fallback (2026-03-27)

- In this workspace, `/Applications/Codex.app/Contents/Resources/app.asar` was not present, so Codex.app-first inspection could not run.
- For user-visible changes under this constraint, use the skill's fallback path explicitly: preserve existing repository interaction patterns, keep the UX conservative, and call out the parity blocker in the completion report.

## Findings: Settings Account Labels (2026-03-24)

- No equivalent multi-account switcher UI was found in the installed Codex.app bundle for Settings/account list behavior, so parity work should follow the existing local Settings visual language instead of inventing a separate header menu.
- When showing multiple saved accounts that share the same email, account/workspace identity needs its own dedicated label line; folding the workspace identifier into secondary metadata and truncating it makes entries indistinguishable in narrow sidebars.

## Findings: Mobile Install Icons (2026-03-23)

- In this web workspace, mobile home-screen installation depends on both `link[rel="apple-touch-icon"]` in `index.html` and the PNG entries in `public/manifest.webmanifest`; updating only the manifest is not enough for iPhone-style add-to-home-screen flows.
- Small PNGs generated from SVG via headless Chrome can silently degrade to all-white images when the SVG is loaded indirectly during screenshot capture. Rendering a reliable large PNG first and deriving smaller sizes from that output avoids blank icon assets.
- For non-transparent exported PNG icons, any transparent margin around the SVG is rasterized against the page background. Set an explicit dark page background during capture or use full-bleed icon artwork to avoid white edges that make installed icons look washed out.
- A more reliable fix than screenshot capture is to rasterize SVGs through a browser canvas (`Image` + `drawImage` + `canvas.toDataURL()`), which preserves the real SVG bounds and avoids dark corner contamination from the page background.

## Findings: PWA Packaging Fallback (2026-03-23)

- This repository can be made installable as a browser app without changing runtime behavior by adding standard PWA assets:
  - HTML manifest link + theme color metadata
  - production-only service worker registration in `src/main.ts`
  - static `manifest.webmanifest`
  - static icons under `public/icons/`
- Codex.app desktop parity could not be inspected in this environment because `/Applications/Codex.app` was unavailable, so PWA packaging should follow the fallback path and avoid speculative UX changes.
- A conservative service worker strategy for this repo is:
  - bypass `/codex-api/*` and local file proxy endpoints
  - use navigation fallback to cached `/`
  - use runtime caching for same-origin static assets and manifest

## Findings: Plan Mode Turn Start (2026-03-22)

- App-server rejects `turn/start.collaborationMode` unless the client advertises `initialize.capabilities.experimentalApi = true`.
- `turn/start.collaborationMode.settings.model` must be a non-empty concrete model id. Sending `""` can leave a plan-mode thread stuck or fail without rendering plan output.
- In this environment, `collaborationMode/list` returns `Plan` with `mode: "plan"` and `reasoning_effort: "medium"`, but `model` is `null`, so the client must source the actual model from current config or available models before starting the turn.

## Findings: Account Rate Limits Protocol (2026-03-21)

- App-server exposes quota state via `account/rateLimits/read` and pushes live updates with `account/rateLimits/updated`.
- Read responses can include `rateLimitsByLimitId.codex`; if absent, fall back to the legacy top-level `rateLimits` bucket.
- Runtime payloads use camelCase fields:
  - snapshot: `limitId`, `limitName`, `planType`, `primary`, `secondary`, `credits`
  - window: `usedPercent`, `windowDurationMins`, `resetsAt`
  - credits: `hasCredits`, `unlimited`, `balance`
- For compact composer display, a conservative summary can be derived from `primary`/`secondary` windows without forcing a full account panel.
- Weekly refresh copy can be derived entirely client-side by selecting the quota window whose `windowDurationMins` is `10080` (or the nearest longer weekly-like window) and formatting its `resetsAt` timestamp into a calendar date for the tooltip.
- On touch/mobile surfaces, quota details hidden only in a `title` attribute are effectively invisible. Weekly refresh information needs to be rendered as visible text in the composer quota badge, not only in hover-only tooltip content.
- For compact inline display, the weekly refresh segment should be date-only (for example `Mar 28` / `3月28日`) and appended on the same line as the quota summary instead of using a separate explanatory label.

## Findings: Empty Project Removal Persistence (2026-03-21)

- In this web UI, empty project groups can be recreated purely from persisted workspace-root state, even when no threads exist for that project.

## Findings: Mobile Foreground Resume (2026-03-23)

- In this web workspace, a conservative mobile-only freshness policy can be implemented at the app shell level (`App.vue`) by combining:
  - `document.visibilitychange` to record background entry
  - `window.pageshow` to catch BFCache restores
  - `window.focus` as a final foreground fallback
- Restricting the behavior to the existing `<768px` mobile breakpoint avoids forcing reloads on tablet/desktop layouts during tab focus changes.
- A small hidden-duration threshold helps avoid accidental reloads from transient overlays while still reloading after real app switches.
- The persistence source of truth is still the global state keys:
  - `electron-saved-workspace-roots`
  - `electron-workspace-root-labels`
  - `active-workspace-roots`
- Removing a project must delete matching workspace-root entries from all three persisted collections; updating in-memory order alone is insufficient because hydration will rebuild an empty placeholder group on refresh.
- The placeholder group is produced by `orderGroupsByProjectOrder(...)`, which materializes `{ projectName, threads: [] }` when a persisted project name has no matching incoming thread group.

## Findings: Markdown Block Rendering Fallback (2026-03-21)

- Codex.app could not be inspected in this Linux environment because `/Applications/Codex.app` is unavailable.
- Conservative fallback for message markdown rendering is to keep the existing inline parser and add a lightweight block parser in `ThreadConversation.vue`.
- A low-risk split that matches existing web UI structure is:
  - block-level parsing for paragraphs, unordered lists, ordered lists, and inline markdown images
  - inline parsing reused for bold, inline code, URLs, and file links
- This avoids introducing a full markdown dependency while fixing the most visible raw-markup regressions (`- item`, `1. item`, `**bold**`).
- Expanded fallback block support that still fits this local parser architecture:
  - headings (`#` ... `######`)
  - blockquotes (`> quote`)
  - task lists (`- [ ]`, `- [x]`)
  - thematic breaks (`---`, `***`, `___`)
  - fenced code blocks (``` / ~~~)
- To avoid breaking local-image rendering and file-link handling, code-fence splitting should happen before inline image token splitting, otherwise `![...](...)` inside fenced code can be misparsed as a real image block.

## Findings: Mobile Composer Auto-Zoom Fallback (2026-03-21)

- Codex.app could not be inspected in this environment, so mobile zoom behavior was handled with a browser-level fallback.

## Findings: Plan Mode Fallback Wiring (2026-03-22)

- Codex.app could not be inspected in this Linux environment because `/Applications/Codex.app` is unavailable, so plan-mode behavior was aligned to the shipped app-server protocol instead of renderer-bundle parity.
- App-server protocol already exposes the full plan-mode surface needed by the web UI:
  - `TurnStartParams.collaborationMode`
  - `ModeKind = "plan" | "default"`
  - `turn/plan/updated`
  - `item/plan/delta`
  - `ThreadItem.type = "plan"`
  - `item/tool/requestUserInput`
- Conservative web fallback for plan mode:
  - persist the selected collaboration mode locally under `codex-web-local.collaboration-mode.v1`
  - send `collaborationMode: { mode: "plan", settings: { model, reasoning_effort, developer_instructions: null } }` only when plan mode is selected
  - omit `collaborationMode` entirely for default mode to disable plan mode cleanly
- `collaborationMode/list` can be treated as advisory rather than authoritative for web fallback:
  - when available, use server labels for `default` / `plan`
  - still keep static `Default` and `Plan` options available so the feature remains usable against servers that lag the preset-list endpoint
- `request_user_input` questions need broader handling than the original approval-like UI:
  - support selectable options with descriptions
  - support free-text questions when `options` is `null` or empty
  - support secret answers via password inputs when `isSecret` is true
- On mobile browsers, especially iOS Safari, focusing text inputs below `16px` commonly triggers viewport auto-zoom.
- In this repo, the main composer textarea used `text-sm` (`14px` computed on mobile), which is sufficient to trigger that browser behavior.
- Conservative fix: keep viewport meta unchanged and raise focusable text input font-size to `16px` on mobile widths, instead of disabling pinch zoom globally.

## Findings: Dark Markdown Theme Coverage Fallback (2026-03-21)

- Codex.app could not be inspected in this environment, so dark-mode markdown behavior was aligned using existing web theme conventions.
- When adding new markdown block renderers in `ThreadConversation.vue`, matching `:root.dark` overrides must also be added in `style.css`; otherwise the new nodes inherit light-theme slate colors and become low-contrast in dark mode.
- The markdown-specific classes that require explicit dark coverage in the current UI are:
  - headings (`.message-heading`, `.message-heading-h6`)
  - emphasis (`.message-bold-text`, `.message-italic-text`, `.message-strikethrough-text`)
  - blockquote/list/task styles (`.message-blockquote`, `.message-list`, `.message-task-checkbox`)
  - fenced code and divider styles (`.message-code-block`, `.message-code-language`, `.message-divider`)
- A safe fallback pattern is to keep foreground text near existing dark message colors (`zinc-100`/`zinc-200`) and move structural surfaces to darker zinc backgrounds, so markdown blocks remain legible without deviating from the current dark theme.

## Findings: Web Title Branding Fallback (2026-03-21)

- Codex.app could not be inspected in this environment, so title branding was aligned using the existing web entry points.
- The browser tab title for the main app comes from `index.html`.
- The unauthenticated/login page has its own inline HTML template in `authMiddleware.ts`, so branding changes need to update both places to stay consistent.

## Findings: Sidebar Thread Menu Clickability Fallback (2026-03-21)

- Codex.app could not be inspected in this environment, so thread-menu behavior was aligned using stable web popover patterns.
- In this sidebar implementation, thread menus are rendered inside the `right-hover` slot of `SidebarMenuRow`; if the row stops being hovered and no explicit open-state override is applied, that slot can collapse and make the menu hard to interact with.
- Outside-click dismissal must include `openThreadMenuId` in the shared dismiss-listener condition. Otherwise thread menus fall back to ad-hoc closing logic and can behave inconsistently.
- For rows near the bottom of the scrollable sidebar, the menu should choose its open direction based on available space in the nearest overflow-clipping ancestor rather than always opening downward.
- A low-risk fallback is:
  - keep the row in `forceRightHover` mode while its menu is open
  - raise the open row above siblings with a higher z-index
  - auto-flip the menu upward when the scroll container has less space below than above

## Findings: Thread Delete Semantics (2026-03-12)

- In this app-server API surface there is no `thread/delete` method in v2 docs/schemas; thread removal from active list is handled through `thread/archive`.
- For delete-like UI parity in sidebar menus, implement a destructive confirmation dialog and route confirmation to `thread/archive`.

## Findings: Build Badge (2026-03-16)

- Searched extracted Codex.app webview assets for `build-badge`, `WT`, and `worktree` UI markers; no explicit build badge or worktree/version label found in renderer bundle.

## Findings: Parity Extraction Sanity Check (2026-03-27)

- In this environment, `/Applications/Codex.app` may be absent while `/tmp/codex-app-extracted` still exists as an empty directory from a prior session.
- Before relying on extracted bundle searches, verify both the app bundle path and that the extraction target actually contains files.
- When both checks fail for a UI change, treat parity inspection as blocked, use existing repository behavior as the fallback baseline, and report that gap explicitly in the final response.

## Findings: Message Action Removal Fallback (2026-03-27)

- With Codex.app unavailable for inspection, message-action removals should be implemented as full UI deletion, not partial hiding.
- In this codebase, message actions span both template nodes in `ThreadConversation.vue` and shared dark-theme overrides in `style.css`; removing only the button markup leaves dead hover/dark styles behind.
- A safe fallback cleanup is to remove the template block, the helper functions/imports that feed it, and the corresponding `.message-action*` selectors together in the same change.

## Findings: Detached HEAD Worktree Creation (2026-04-08)

- Codex.app worker bundle creates new worktrees with detached HEAD semantics:
  - `git worktree add --detach <worktreePath> <startRef>`
- Evidence location in extracted app bundle:
  - `/tmp/codex-app-extracted/.vite/build/worker.js` (`Xq(...)` flow)
- Parity implication for this repo:
  - New worktree creation should not create/switch to a new local branch by default.
  - API responses should treat branch as nullable/absent for detached worktrees.

## Findings: Desktop-visible Parity Surfaces (2026-04-22)

- Codex.app `26.417.41555` renderer bundle contains first-class automation UI strings and routes:
  - automation list labels under `inbox.automations.*`
  - automation side panel navigation to `/automations?automationId=<id>`
  - missing automation fallback copy: `Automation unavailable`
- Codex.app archive confirmation is automation-aware:
  - `threadHeader.archiveConfirmHeartbeatTitle`
  - named/unnamed heartbeat subtitles explain that archiving the chat also removes the active heartbeat automation.
- Codex.app thread file command menu exposes workspace file search:
  - key: `thread.fileCommandMenu.searchFiles`
  - group label: `thread.fileCommandMenu.filesGroup`
  - implementation pairs command-menu entry with workspace file results rather than only passive text autocomplete.
- Codex.app composer has a background terminal panel:
  - `composer.backgroundTerminals.runningLabel`
  - `composer.backgroundTerminals.stop`
  - `composer.backgroundTerminals.stopTooltip`
  - Web parity should expose `thread/backgroundTerminals/clean` near the composer/header and disable while pending.
- Codex.app handles app-server app list updates from `app/list/updated` by refreshing cached app list data.
- Useful protocol-backed parity surfaces for web implementation:
  - `app/list`
  - `mcpServerStatus/list`
  - `config/mcpServer/reload`
  - `mcpServer/oauth/login`
  - `thread/compact/start`
  - `feedback/upload`
  - `fuzzyFileSearch`

## Findings: Thread Heartbeat Automations (2026-04-21)

- Codex.app exposes thread heartbeat automation affordances in the sidebar:
  - thread menu copy: `Add automation…` and `Edit automation…`
  - attached heartbeat rows show a next-run tooltip via `sidebarTaskRow.heartbeatAutomation.nextRun`
  - archive confirmation copy changes to `Archive chat and remove automation?`
- Desktop heartbeat automation payloads use:
  - `<heartbeat>`
  - `<automation_id>`
  - `<current_time_iso>`
  - `<instructions>`
- Local automation storage uses `$CODEX_HOME/automations/<id>/automation.toml`; heartbeat records include `kind = "heartbeat"` and `target_thread_id`.

## Findings: Integrated Terminal (2026-04-22)

- Codex.app `26.417.41555` ships `node-pty@1.1.0` in `/tmp/codex-app-extracted/package.json`.
- Renderer bundle terminal UI strings:
  - `threadPage.toggleTerminal` -> `Toggle terminal`
  - `terminal.bottomPanel.new` -> `New terminal`
  - `terminal.bottomPanel.close` -> `Close`
  - `codex.command.toggleTerminal` -> `Toggle terminal`
- Shortcut mapping in packaged build includes `toggleTerminal: CmdOrCtrl+J`.
- Main process terminal manager in `/tmp/codex-app-extracted/.vite/build/main-CUDSf52Z.js`:
  - creates local terminal sessions with `node-pty.spawn`
  - maps sessions by window/conversation id
  - keeps a rolling terminal buffer capped at `16 * 1024` bytes
  - uses `TERM=xterm-256color`
  - exposes a conversation snapshot shape `{ cwd, shell, buffer, truncated }`
  - emits renderer messages including `terminal-data`, `terminal-init-log`, `terminal-attached`, `terminal-exit`, and `terminal-error`
- Web parity implementation should use `/codex-api/ws` and HTTP endpoints instead of Electron IPC, but preserve the same event names and snapshot shape where practical.
- Web implementation lessons from screenshot review and edge-case tests:
  - Keep the terminal panel outside the pending-request/composer `v-if` / `v-else` pair; otherwise the composer can disappear when the terminal is open.
  - Collapse the mobile sidebar immediately on first render for direct thread routes; otherwise the drawer can cover terminal screenshots.
  - Normalize PTY locale (`en_US.UTF-8` on macOS) and remove `TERMINFO` / `TERMINFO_DIRS` to avoid visible shell startup warnings.
  - Restore executable permissions on `node-pty` `spawn-helper` at runtime when pnpm ignores native package build scripts.
  - Unit-test terminal manager behavior through dependency injection instead of spawning real shells for every edge case.
  - Edge cases worth preserving in tests: missing thread id rejection, cwd fallback, dimension clamping, 16 KiB buffer truncation, reattach init-log emission, shell-quoted cwd sync, new-session tab creation without killing previous PTYs, and close/exit snapshot cleanup.
## Findings: Plugins Directory API Surface (2026-04-22)

- Codex.app plugin directory UI lives in extracted renderer chunks named like:
  - `plugins-page-*.js`
  - `plugins-cards-grid-*.js`
  - `plugins-settings-*.js`
- Desktop copy and tab structure use a full “Skills & Apps” surface with Plugins, Apps, MCPs, and Skills tabs; plugin copy includes “Plugins make Codex work your way.”
- Live `codex app-server generate-json-schema` exposes slash-style methods for this surface:
  - `plugin/list`, `plugin/read`, `plugin/install`, `plugin/uninstall`
  - `app/list`
  - `mcpServerStatus/list`
  - `config/mcpServer/reload`
- Plugin list responses are grouped by marketplace; each plugin summary carries `id`, `name`, `installed`, `enabled`, `installPolicy`, `authPolicy`, `source`, and an optional `interface`.
- Plugin detail responses include `summary`, `apps`, `skills`, and `mcpServers`. Install responses include `authPolicy` and `appsNeedingAuth`.
- For web parity, feature-detect these methods through `/codex-api/meta/methods` and degrade gracefully when older Codex CLI versions do not expose them.

## Findings: Plugin MCP Authentication (2026-04-23)

- Codex.app MCP settings renders an `Authenticate` action when an MCP server `authStatus` is `notLoggedIn`.
- The renderer starts login through app-server method `mcpServer/oauth/login` with `{ name }`; the response is `{ authorizationUrl }`.
- Codex.app opens the returned URL in the browser via its `open-in-browser` bridge.
- `mcpServer/oauth/login/completed` notifications carry `{ name, success, error? }`; after success, invalidate/refetch MCP status.
- For plugin detail parity, bundled `mcpServers` from `plugin/read` should be cross-referenced with `mcpServerStatus/list` and display auth state:
  - `oAuth` -> logged in
  - `bearerToken` -> bearer token
  - `notLoggedIn` -> login required + authenticate action
  - `unsupported` -> auth unsupported

## Findings: Chat Stream Rendering Performance (2026-04-22)

- Codex.app `26.417.41555` renderer derives chat content into renderable turn entries such as `visibleTurnEntries` before rendering, rather than parsing every message directly in JSX on each stream tick.
- Stream deltas update only the active item text (`item/agentMessage/delta`, `item/plan/delta`, reasoning deltas), while unchanged turn/item render output is protected by React memo-cache patterns.
- Code highlighting is lazy-loaded through a Shiki highlight provider, with the provider imported separately from the main renderer bundle.
- Parity implication for this Vue repo: keep chat rows derived and cacheable, memoize unchanged markdown/text-flow rows during streaming, and invalidate code-highlight HTML only when the highlighter becomes available or the code/language changes.

## Findings: Inline Media Sanitization For Thread Loads (2026-04-23)

- Large local Codex JSONL sessions can be dominated by inline image/base64 strings rather than text chat content.
- Observed heavy fields include `payload.output[].image_url`, `payload.result`, `payload.content[].image_url`, `payload.images[]`, and `payload.replacement_history[].content[].image_url`.
- Browser thread loads should never pass those raw strings through directly; bridge responses for `thread/read`, `thread/resume`, `thread/fork`, and `thread/rollback` should sanitize turns before returning JSON to the client.
- Safe sanitizer behavior:
  - persist inline image data to local temp files
  - rewrite UI-facing image fields to `/codex-local-image?path=...`
  - infer bare base64 image MIME only from byte signatures such as PNG/JPEG/WebP/GIF
  - leave non-image base64 and non-image data URLs untouched
- This is a read-path/UI-payload mitigation. Historical `.jsonl` files written by Codex app-server remain unchanged unless a separate compaction tool is introduced.

## Findings: Projectless New Chat Folders (2026-04-28)

- Codex.app creates projectless new-chat folders through the `projectless-thread-cwd` main-process handler before starting the conversation.
- The created root is `~/Documents/Codex`, with one date subdirectory per local date formatted as `YYYY-MM-DD`.
- The leaf directory slug comes from the first six lowercase alphanumeric prompt tokens, joined with `-`, capped at 80 characters, and falls back to `new-chat`.
- Duplicate slugs retry as `slug-2`, `slug-3`, and so on for up to 100 attempts.
- Both the workspace root and date directory are created recursively and verified as real directories, not symlinks.
- The app-server start payload for projectless chats uses the created directory as `cwd` and `outputDirectory`, with `workspaceRoot` set to `~/Documents/Codex`.

## Findings: Projectless Chats Sidebar Visibility (2026-04-28)

- Codex.app keeps projectless chats separate from Projects; when there are no projectless chats, the sidebar Chats section renders `No chats` even if many project threads exist.
- Web parity needs two filters working together:
  - workspace-root/project filtering must preserve projectless thread groups from `thread/list`, otherwise they disappear after the optimistic row is replaced by server state
  - the rendered Projects section must still hide those projectless groups, while the Chats section lists them
- A projectless thread cwd under `~/Documents/Codex/YYYY-MM-DD/<slug>` should remain in the sidebar Chats section after title generation and thread-list refreshes.
