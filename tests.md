# Tests

This file tracks manual regression and feature verification steps.

## Template

### Feature: <name>

#### Prerequisites
- <required setup>

#### Steps
1. <action>
2. <action>

#### Expected Results
- <result>

#### Rollback/Cleanup
- <cleanup action, if any>

### Feature: Thread heartbeat automations

#### Prerequisites
- App is running from this repository.
- At least one local thread exists in the sidebar.
- Local Codex home is writable (`$CODEX_HOME` or `~/.codex`).

#### Steps
1. Open the sidebar thread menu for a thread without an attached automation.
2. Confirm the menu shows `Add automation…`.
3. Click `Add automation…`.
4. Fill name, prompt, RRULE schedule, and set status to `Paused`.
5. Save the automation and reopen the same thread menu.
6. Confirm the menu now shows `Edit automation…` and the thread row shows an automation chip.
7. Open `Edit automation…`, confirm the saved values are prefilled, then remove the automation.

#### Expected Results
- Thread-scoped heartbeat automations are created under the Codex automations store and attached by `target_thread_id`.
- The automation editor is hosted from the thread menu and uses Codex.app wording.
- Removing the automation removes the thread row automation chip and returns the menu to `Add automation…`.

#### Rollback/Cleanup
- Remove any test automation from the thread automation dialog or delete its folder under `$CODEX_HOME/automations/<automation-id>/`.

### Feature: Projectless new chat folders

#### Prerequisites
- App server is running from this repository.
- Home directory is writable.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the app in light theme and click the sidebar `New chat` action while an existing thread is selected.
2. Confirm the home composer does not inherit the selected thread folder.
3. Send a first message with a unique prompt such as `Projectless folder smoke test`.
4. Confirm the new thread starts in `~/Documents/Codex/<YYYY-MM-DD>/projectless-folder-smoke-test`.
5. Start another new chat with the same prompt and confirm the folder receives a numeric suffix.
6. Switch to dark theme and repeat steps 1-3 with a different unique prompt.

#### Expected Results
- `New chat` starts as a projectless chat instead of reusing the current thread cwd.
- Sending the first message creates a real directory under `~/Documents/Codex/<YYYY-MM-DD>/`.
- Folder names are derived from the prompt using lowercase alphanumeric tokens, with suffixes for duplicates.
- Projectless chat rows appear in the `Chats` section and do not create a separate project group from the generated folder name.
- Short projectless prompts such as `hi` remain visible in `Chats` after the thread list refreshes and workspace-root filtering runs.
- If the selected model returns `requires a newer version of Codex`, the turn retries with `gpt-5.4-mini` instead of leaving the new chat failed on 5.5.
- Light and dark theme composer surfaces remain readable and unchanged apart from the folder behavior.

#### Rollback/Cleanup
- Delete only the test folders created under `~/Documents/Codex/<YYYY-MM-DD>/`.

### Feature: Empty project new thread action

#### Prerequisites
- App server is running from this repository.
- At least one workspace root is registered that has no threads.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the app in light theme.
2. Find the empty project row in the sidebar that shows `No threads`.
3. Click that project's new thread icon.
4. Confirm the home composer opens and the folder dropdown is set to the empty project's workspace root.
5. Switch to dark theme and repeat steps 2-4.

#### Expected Results
- The new thread icon works for projects with zero threads.
- The new thread screen uses the clicked project's registered workspace root instead of leaving the folder blank or reusing another project.
- Light and dark theme sidebar and composer surfaces remain readable.

#### Rollback/Cleanup
- No cleanup is required unless a test message is sent; delete that test thread if created.

### Feature: Start new thread header Git branch dropdown

#### Prerequisites
- App server is running from this repository.
- At least one Git-backed workspace folder is available in the Start new thread folder dropdown.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the app in light theme.
2. Click the sidebar or header new thread icon to open Start new thread.
3. Select a Git-backed folder.
4. Confirm the header actions next to the terminal control show the Git checkout branch dropdown.
5. Open the branch dropdown and confirm branch search/options are available.
6. Switch to dark theme and repeat steps 2-5.

#### Expected Results
- Start new thread shows the same header Git checkout dropdown used by existing thread pages when the selected folder is a Git repository.
- Switching the selected folder updates the dropdown branch state for that folder.
- Non-Git folders do not show the Git checkout dropdown.
- Light and dark theme header controls remain readable and aligned.

#### Rollback/Cleanup
- If a branch was switched during testing, switch back to the original branch before continuing.

### Feature: Telegram bot token stored in dedicated global file

#### Prerequisites
- App server is running from this repository.
- A valid Telegram bot token is available.
- At least one Telegram user ID is available for allowlisting.
- Access to `~/.codex/` on the host machine.

#### Steps
1. In the app UI, open Telegram connection and submit a bot token plus one or more allowed Telegram user IDs.
2. Verify file `~/.codex/telegram-bridge.json` exists.
3. Open `~/.codex/telegram-bridge.json` and confirm it contains `botToken` and `allowedUserIds` fields.
4. Restart the app server and call Telegram status endpoint from UI to confirm it still reports configured.

#### Expected Results
- Telegram token is persisted in `~/.codex/telegram-bridge.json`.
- Telegram allowlisted user IDs are persisted in `~/.codex/telegram-bridge.json`.
- Telegram bridge remains configured after restart.

#### Rollback/Cleanup
- Remove `~/.codex/telegram-bridge.json` to clear saved Telegram token.

### Feature: Telegram chatIds persisted for bot DM sending

#### Prerequisites
- App server is running from this repository.
- Telegram bot already configured in the app.
- Access to `~/.codex/telegram-bridge.json`.

#### Steps
1. Send `/start` to the Telegram bot from your DM.
2. Wait for the app to process the update, then open `~/.codex/telegram-bridge.json`.
3. Confirm `chatIds` contains your DM chat id as the first element.
4. In the app, reconnect Telegram bot with the same token.
5. Re-open `~/.codex/telegram-bridge.json` and confirm `chatIds` remains present.

#### Expected Results
- `chatIds` is written after Telegram DM activity.
- `chatIds` persists across bot reconfiguration.
- `botToken`, `chatIds`, and `allowedUserIds` are all present in `~/.codex/telegram-bridge.json`.

#### Rollback/Cleanup
- Remove `chatIds` or delete `~/.codex/telegram-bridge.json` to clear persisted chat targets.

### Feature: Telegram bridge rejects unauthorized senders

#### Prerequisites
- App server is running from this repository.
- Telegram bot is configured with a known `allowedUserIds` entry.
- One Telegram account is allowlisted and one separate Telegram account is not.

#### Steps
1. From the allowlisted Telegram account, send `/start` to the bot.
2. Confirm the bot responds normally.
3. From the non-allowlisted Telegram account, send `/start` to the same bot.
4. From the non-allowlisted account, send a normal text prompt.

#### Expected Results
- The allowlisted account can use the Telegram bridge normally.
- The non-allowlisted account receives an unauthorized response.
- No thread is created or updated for the non-allowlisted account.

#### Rollback/Cleanup
- Remove test chat mappings from `~/.codex/telegram-bridge.json` if needed.

### Feature: Skills dropdown closes after selection in composer

#### Prerequisites
- App is running from this repository.
- At least one thread exists and can be selected.
- At least one installed skill is available.

#### Steps
1. Open an existing thread so the message composer is enabled.
2. Click the `Skills` dropdown in the composer footer.
3. Click any skill option in the dropdown list.
4. Re-open the `Skills` dropdown and click the same skill again to unselect it.

#### Expected Results
- The skills dropdown closes immediately after each selection click.
- Selected skill appears as a chip above the composer input when checked.
- Skill chip is removed when the skill is unchecked on the next selection.

#### Rollback/Cleanup
- Remove the selected skill chip(s) before leaving the thread, if needed.

### Feature: Skills Hub local-only installed skills

#### Prerequisites
- App is running from this repository.
- Open the `Skills Hub` view.

#### Steps
1. Open `Skills Hub`.
2. Confirm the page shows only locally installed skills.
3. Confirm there is no remote skill count such as `6818 skills`.
4. Confirm there are no remote browse cards from the OpenClaw catalog.

#### Expected Results
- Skills Hub does not fetch or display the OpenClaw remote skills catalog.
- Only locally installed skills are shown.
- No remote total-count badge is rendered.

#### Rollback/Cleanup
- None.

---

### Browser Use plugin runtime command

#### Feature/Change Name
codexui exposes Browser Use in chats by using the bundled Codex.app runtime, registering `node_repl`, and registering a session-scoped local Browser Use backend whose browser launches lazily on first tab use.

#### Prerequisites/Setup
1. macOS with `/Applications/Codex.app/Contents/Resources/codex` installed.
2. Browser Use plugin enabled in `~/.codex/config.toml`.
3. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`).
4. Light theme and dark theme are available from the appearance switcher.

#### Steps
1. Run `pnpm exec vitest run src/commandResolution.test.ts`.
2. Run `pnpm run build:cli`.
3. Run `node -e "require('node:fs').accessSync('/Applications/Codex.app/Contents/Resources/codex'); console.log('bundled codex available')"` before starting codexui.
4. Open `http://127.0.0.1:4173` in light theme.
5. Create or open a codexui chat and ask it to use Browser Use to open `https://example.com` and report the page title.
6. Confirm the chat produces `mcp__node_repl__js` Browser Use activity and returns `{"title":"Example Domain","url":"https://example.com/"}` without a missing-tool or IAB discovery error.
7. Temporarily point `CODEX_HOME` or `CODEXUI_BROWSER_USE_CLIENT_PATH` at a location without the Browser Use client and confirm a normal non-Browser Use chat still starts instead of returning a 502.
8. Switch to dark theme and repeat steps 5-7.

#### Expected Results
- On macOS, codexui launches the Codex.app bundled app-server by default.
- `CODEXUI_CODEX_COMMAND` still overrides the bundled command when set.
- `mcpServerStatus/list` includes `node_repl` with `js` and `js_reset`.
- Browser Use works inside codexui chats in both light and dark theme, and Chromium launches only after Browser Use requests a tab.
- Browser Use setup is best-effort: missing plugin files, changed client patch shape, or backend startup errors are logged and do not block normal `turn/start` or `thread/start` RPC calls.
- Browser Use socket names are derived from a bounded hash of the session id, malformed socket frames close the socket instead of throwing, unauthorized socket peers are closed, and backend cleanup runs during bridge disposal.
- The theme switch does not affect tool availability or pending tool-call rendering.

#### Rollback/Cleanup
- Stop any disposable dev server started only for this validation.

---

### Skills sync idempotent commits and nested shared skills handling

#### Feature/Change Name
Skills Sync skips unchanged manifest writes and does not fail parent commits when only nested `shared_skills` content is dirty.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 5173`)
2. GitHub Skills Sync is connected to a private skills sync repo
3. `/Users/igor/.codex/skills/shared_skills` exists as a nested Git repository
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open `#/skills`.
2. Click `Startup Sync` when no installed skills manifest content has changed.
3. Confirm the sync completes without adding a new `Update synced skills manifest` commit to the GitHub repo.
4. Modify a file inside `/Users/igor/.codex/skills/shared_skills` without committing it inside that nested repository.
5. Click `Push` or `Startup Sync` again.
6. Confirm the sync does not show `Command failed (git commit -m Sync installed skills folder and manifest)` for the parent `/Users/igor/.codex/skills` repository.
7. Confirm the startup auto-push path skips when the only local status is dirty nested `shared_skills` content and local `HEAD` equals `origin/main`.
8. Switch to dark theme and repeat steps 1, 2, and 5.

#### Expected Results
- Unchanged `installed-skills.json` content is not written back to GitHub, so repeated empty-looking manifest commits are not created.
- A dirty nested `shared_skills` repository does not make the parent skills sync fail with `no changes added to commit`.
- Dirty nested `shared_skills` content alone does not keep triggering no-op startup push work.
- Skills Sync status, errors, and action buttons remain readable in light theme and dark theme.

#### Rollback/Cleanup
- Revert or commit the intentional test edit inside `/Users/igor/.codex/skills/shared_skills`.

---

### Header Git branch dropdown with commit reset

#### Feature/Change Name
Thread header Git dropdown replaces the simple review action with branch search, Review access, safe branch switching, branch reset-to-commit, and reset-history commit preservation.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open a thread whose `cwd` is inside a Git repository with at least two branches and several commits
3. Use a disposable local branch with at least two commits ahead of its reset target.
4. Ensure the repository has no tracked uncommitted changes for successful branch switch/reset paths: `git -C <thread-cwd> status --porcelain`
5. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open the Git dropdown in the thread header.
2. Confirm the trigger shows the current branch, or the detached commit subject if the repository is already detached.
3. Click `Review` and confirm the review pane opens; click it again and confirm the pane toggles.
4. Type part of a branch name in search and confirm the branch list filters.
5. Select a different branch with a clean worktree and confirm the header updates to that branch.
6. Expand a branch row and confirm recent commits load with short SHA, subject, and date.
7. Expand a remote branch row and confirm its commit rows are disabled with a tooltip explaining remote branches cannot be reset.
8. Select an older commit on the disposable local branch and confirm the header stays on that branch instead of entering detached HEAD.
9. Confirm `git -C <thread-cwd> rev-parse --abbrev-ref HEAD` still prints the branch name and `git -C <thread-cwd> rev-parse --short HEAD` matches the selected commit.
10. Reopen/expand the same branch and confirm commits that were ahead of the reset target still appear, with the selected branch HEAD marked `current`.
11. Repeat reset on the same branch several times and confirm the dropdown still opens quickly and shows recent reset-history commits.
12. Create a tracked uncommitted change, try to switch branch or reset to a commit, and confirm the dropdown shows a dirty-worktree error instead of switching or resetting.
13. Create only an untracked file, try to reset to a commit, and confirm the reset proceeds unless Git reports the untracked file would be overwritten.
14. Switch to dark theme and repeat steps 1, 2, 4, 6, 7, 10, 12, and 13.

#### Expected Results
- The header dropdown exposes Review, current checkout state, searchable branches, and inline commits.
- Branch switching and branch reset-to-commit are blocked by tracked uncommitted changes, but untracked-only changes are allowed unless Git would overwrite them.
- Commit selection resets the local branch to that commit instead of detaching HEAD.
- Remote branch commit rows are inspectable but cannot trigger local branch reset.
- The branch commit list still shows commits that were ahead of the reset target by reading saved internal reset-history refs.
- Reset-history refs are bounded so repeated resets do not grow commit-list inputs without limit.
- The selected branch HEAD commit is marked `current` in expanded commit lists.
- Loading and error messages remain visible in the dropdown without using browser alerts.
- Dropdown surfaces, text, badges, and errors are readable in both light theme and dark theme.

#### Rollback/Cleanup
- Restore any dirty-worktree file changed for validation.
- Restore or delete the disposable branch used for reset validation.

---

### Termux install without native PTY build

#### Feature/Change Name
Android Termux installs can complete when `node-pty` has no compatible native build.

#### Prerequisites/Setup
1. Android device or emulator with Termux installed.
2. Node.js and npm available in Termux.
3. Network access to npm and GitHub.
4. A macOS or Linux desktop remains available for supported-host integrated terminal checks.
5. Light theme and dark theme are available from the appearance switcher on the desktop check.

#### Steps
1. In Termux, run `npm i -g codexapp@latest` after the fixed version is published.
2. Confirm installation does not fail if npm cannot build `node-pty` for `android-arm64`.
3. Run `codexapp --no-login` in Termux.
4. Open the printed URL and confirm the app loads.
5. Open a thread and confirm the integrated terminal reports unavailable instead of crashing the server if native PTY support is missing.
6. On macOS or Linux, run `npm i -g codexapp@latest`, then start `codexapp --no-login`.
7. Open a thread in light theme and confirm the integrated terminal still opens on the supported host.
8. Switch to dark theme and confirm the integrated terminal remains readable.

#### Expected Results
- Termux install completes even when `node-pty` cannot build on Android.
- The Termux app server starts and the browser UI loads.
- Missing native PTY support disables only the integrated terminal, not the whole app.
- Supported hosts still install `node-pty` and keep integrated terminal behavior in light theme and dark theme.

#### Rollback/Cleanup
- Remove test global installs with `npm rm -g codexapp`.

---

### Composer controls stay editable during responses

#### Feature/Change Name
Model, skill, thinking, and plan controls remain usable while a thread turn is in progress.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A thread that can produce a long enough response to interact with the composer while the assistant is responding
3. At least one installed skill or saved prompt
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, send a message that starts an assistant response.
2. While the response is still streaming, type a follow-up draft in the composer.
3. Open the model dropdown and select a different model.
4. Open the skills dropdown and select a skill or saved prompt.
5. Open the thinking dropdown and select a different value.
6. Open the attachment menu and toggle plan mode.
7. Verify the stop button and send/queue behavior still match the in-progress turn state.
8. Switch to dark theme and repeat steps 1 through 7.

#### Expected Results
- The message textarea remains editable while the assistant is responding.
- Model, skills, thinking, and plan controls are not disabled during the in-progress response.
- Selected controls update the composer state for the next submitted or queued message.
- Stop remains available while no draft content is present, and the submit button switches to the configured steer/queue behavior when draft content exists.
- Light-theme and dark-theme controls remain readable and do not overlap.

#### Rollback/Cleanup
- Remove any disposable queued messages or test skill selections from the thread.

### Feature: Remove GitHub trending projects from the new-thread screen

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- Any previously saved local storage value for `codex-web-local.github-trending-projects.v1` may still exist from older builds.

#### Steps
1. Open Settings and inspect the available rows.
2. Confirm there is no `GitHub trending projects` toggle.
3. Return to the home/new-thread screen and confirm no trending cards or scope dropdown are shown.
4. Refresh the page and confirm the UI stays unchanged even if the old local storage key exists.

#### Expected Results
- Settings no longer offers any GitHub trending projects preference.
- The home/new-thread screen no longer renders a trending projects section.
- Refreshing does not restore the removed feature from stale local storage.

#### Rollback/Cleanup
- None.

### Feature: Dark theme for worktree runtime selector and Skills Hub

#### Prerequisites
- App is running from this repository.
- Appearance is set to `Dark` in Settings.
- Skills Hub route is accessible.

#### Steps
1. Open the home/new-thread screen and inspect the `Local project / New worktree` runtime selector trigger.
2. Open the runtime selector and verify menu title, options, selected state, and checkmark visibility in dark mode.
3. Trigger a worktree action that shows worktree status and verify running/error status blocks remain readable in dark mode.
4. Open `Skills Hub` and verify header/subtitle, search bar, search/sort buttons, sync panel, badges, and status text.
5. Verify at least one skill card surface (title, owner, description, date, browse icon) in dark mode.
6. Open a skill detail modal and verify panel, title/owner, close button, README/body text, and footer actions in dark mode.

#### Expected Results
- Runtime dropdown trigger and menu use dark backgrounds, borders, and readable text/icons.
- Worktree status blocks use dark-friendly contrast for both running and error states.
- Skills Hub controls and sync panel are fully dark-themed with consistent hover/active states.
- Skill cards and the skill detail modal render with dark theme colors and accessible contrast.

#### Rollback/Cleanup
- Reset appearance to the previous user preference.

### Feature: Markdown file links with backticks and parentheses render correctly

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- Local file exists at `/root/New Project (1)/qwe.txt`.

#### Steps
1. Send a message containing: `Done. Created [`/root/New Project (1)/qwe.txt`](/root/New Project (1)/qwe.txt) with content:`.
2. In the rendered assistant message, click the `/root/New Project (1)/qwe.txt` link.
3. Right-click the same link and choose `Copy link` from the context menu.
4. Paste the copied link into a text field and inspect it.

#### Expected Results
- The markdown link renders as one clickable file link (not split into partial tokens).
- Clicking opens the local browse route for the full file path.
- Copied link includes the full encoded path and still resolves to the same file.

#### Rollback/Cleanup
- Delete `/root/New Project (1)/qwe.txt` if it was created only for this test.

### Feature: Deferred ancillary startup refreshes

#### Prerequisites
- App is running from this repository.
- At least one large existing thread is available in the sidebar.
- Browser runtime profiler can run with Playwright from this repository.

#### Steps
1. Open a large thread route directly, for example `#/thread/<thread-id>`.
2. Confirm the thread message history appears before non-critical metadata finishes refreshing.
3. Run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE="#/thread/<thread-id>" PROFILE_WAIT_MS=7000 node scripts/profile-browser-runtime.cjs`.
4. Open the generated JSON report under `output/playwright/`.
5. Inspect `slowestApiRows` and `duplicateCounts`.

#### Expected Results
- The selected thread uses exactly one `thread/resume` and zero `thread/read` calls during initial load.
- Direct thread route hydration has one owner and does not trigger duplicate selected-thread message loads from route watchers.
- Thread history loading is not blocked by waiting for `skills/list`, `account/rateLimits/read`, or `collaborationMode/list`.
- Skills, model metadata, rate limits, and collaboration modes still populate shortly after the thread is visible.
- The profiler report has no duplicate-load warnings.

#### Rollback/Cleanup
- Remove generated `output/playwright/browser-runtime-profile-*` artifacts if they are not needed for comparison evidence.

### Feature: Runtime selector uses a toggle-style control

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.

#### Steps
1. On the home/new-thread screen, locate the runtime control below `Choose folder`.
2. Verify both options (`Local project` and `New worktree`) are visible at once without opening a menu.
3. Click `New worktree` and confirm it becomes the selected option style.
4. Click `Local project` and confirm selection returns.
5. Set Appearance to `Dark` in Settings and verify selected/unselected contrast remains readable.

#### Expected Results
- Runtime mode is presented as a two-option toggle (segmented control), not a dropdown menu.
- Clicking each option immediately switches the selected state.
- Selected option has a distinct active background/border in both light and dark themes.

#### Rollback/Cleanup
- Leave runtime mode and appearance at the previous user preference.

### Feature: Dark theme states for runtime mode toggle

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- Appearance is set to `Dark` in Settings.

#### Steps
1. Locate the runtime mode toggle (`Local project` and `New worktree`) under `Choose folder`.
2. Hover each option and verify hover state is visible against dark backgrounds.
3. Select `New worktree`, then select `Local project` and compare active/inactive contrast.
4. Tab to the toggle options with keyboard navigation and verify the focus ring is visible.
5. Confirm icon color remains readable for selected and unselected options.

#### Expected Results
- Toggle container, options, and text/icons use dark-friendly colors.
- Hover and selected states are clearly distinguishable in dark mode.
- Keyboard focus ring is visible and does not blend into the background.

#### Rollback/Cleanup
- Return appearance and runtime selection to the previous user preference.

### Feature: Per-thread model selection

#### Prerequisites
- App is running from this repository against a Codex app-server that supports thread-scoped model persistence.
- At least two selectable models are available in the composer model picker.
- At least one existing thread is available, or you can create one during the test.

#### Steps
1. On the new-thread screen, choose model `A` in the composer.
2. Send a message to create a new thread.
3. In that thread, switch the composer model to model `B`.
4. Send another message in the same thread so the thread persists model `B`.
5. Create or open a different thread and set its model to model `A`.
6. Switch back and forth between the two threads.
7. Refresh the browser while one of the threads is selected.
8. Re-open both threads again after the refresh.
9. While thread `A` is selected, use the sidebar thread menu to fork thread `B`.
10. Open the forked thread and confirm the composer model matches thread `B`, not the currently selected thread.
11. Restart the app-server or otherwise force a model-list refresh that does not include one thread’s persisted model, then switch back to that thread.
12. Delete one of the test threads you changed, refresh the thread list, and continue switching between the remaining thread and the new-thread screen.

#### Expected Results
- Each thread restores its own last selected model when you switch threads.
- The new-thread screen keeps its own draft model selection instead of inheriting the last opened thread.
- After browser refresh, reopening a thread restores the model persisted for that thread.
- Forked or newly created threads keep the resolved model returned by Codex, including fallback to the supported default model when needed.
- Forking a nonselected thread from the sidebar uses that source thread’s persisted model.
- If the selected thread’s persisted model is not returned in the latest model list, the composer still shows that model as the active selection instead of falling back to the placeholder label.
- Removing a thread prunes its saved per-thread model state, and model selection continues to update normally for the remaining threads without runtime errors.

#### Rollback/Cleanup
- Reset each tested thread back to its original model selection if you changed an existing conversation for the test.

### Feature: Sandbox approval requests recognize newer Codex payloads

#### Prerequisites
- App is running from this repository with a Codex CLI/app-server version that can request approvals.
- `bubblewrap` is installed so sandboxed command approvals can be triggered.
- Approval policy is set to request approval on sandbox escalation.

#### Steps
1. Start a thread and ask Codex to run a command that requires approval outside the current sandbox.
2. Wait for the pending request panel to appear.
3. Confirm the request is shown as an approval prompt, not the generic fallback with `Return Empty Result` and `Reject Request`.
4. Verify the panel offers approval choices (`Yes`, `Yes for Session`, decline text field, `Skip`).
5. If the approval payload includes a command preview or writable root, verify that preview text is shown in the panel.

#### Expected Results
- Sandbox-related approval requests are classified as approvals even when Codex sends newer method or payload variants.
- The approval UI offers normal approval actions instead of the unknown-request fallback buttons.
- The request stays attached to the correct thread rather than only appearing as a global pending request.

#### Rollback/Cleanup
- Decline or skip the pending approval request after verification.

### Feature: MCP elicitation requests and thread status labels

#### Prerequisites
- App is running from this repository with a recent Codex CLI/app-server build.
- At least one configured MCP server can trigger `mcpServer/elicitation/request` or `item/permissions/requestApproval`.

#### Steps
1. Start a thread and trigger an MCP flow that asks for user input or permission approval.
2. Confirm the thread row status chip in the sidebar appears in English (`Awaiting approval` or `Awaiting response`).
3. Open the pending request panel for `mcpServer/elicitation/request`.
4. Confirm only the black pending-request panel is shown for the request; no duplicate yellow in-conversation request card should appear.
5. If the elicitation is `form` mode, verify the requested fields are rendered as inputs/selects/checkboxes based on the schema.
6. For a required form field that has no schema default, click `Continue` without answering it and verify the request stays open with a validation error instead of submitting a fabricated answer.
7. For an optional boolean or enum field that has no schema default, verify the control starts unselected rather than prefilled with `False` or the first enum option.
8. If the elicitation is `url` mode, verify an authorization link is shown only when the URL uses `http` or `https`.
9. Submit `Continue`, then repeat and verify `Decline` and `Cancel` are also available.
10. Trigger an `item/permissions/requestApproval` request and verify `Accept` and `Accept for Session` are shown instead of the generic fallback buttons.

#### Expected Results
- MCP elicitation requests no longer fall back to `Return Empty Result` / `Reject Request`.
- Pending requests are shown only once, in the dedicated black pending-request panel.
- Form-mode elicitation requests submit structured `{ action, content }` responses.
- Required MCP form fields without defaults must be answered explicitly before the request can be accepted.
- Optional MCP boolean/enum fields without defaults remain unset until the user chooses a value.
- URL-mode elicitation requests show an authorization link and submit a valid `{ action }` response.
- Non-HTTP(S) authorization URLs are not rendered as clickable links.
- Permissions approval requests submit proper permission grants with turn/session scope.
- Sidebar pending-request chips are displayed in English.

#### Rollback/Cleanup
- Decline or cancel the MCP request after verification, and close any opened authorization URL if it was only used for testing.

### Feature: pnpm dev script installs dependencies and starts Vite

### Feature: Tailscale CIDRs bypass password and Cloudflare tunnel is opt-in

#### Prerequisites
- App is running from this repository via CLI.
- A Tailscale client can reach the host over Tailscale IPv4 (`100.64.0.0/10`) or IPv6 (`fd7a:115c:a1e0::/48`).
- `cloudflared` is installed only if testing `--tunnel`.

#### Steps
1. Start CLI without tunnel flag: `npx codexapp --port 5900`.
2. From a Tailscale client, open `http://100.x.x.x:5900` using a host address in `100.64.0.0/10` (replace with host tailnet IP).
3. Confirm the app opens directly without the password login page.
4. (Optional IPv6 check) Open the same service using the host Tailscale IPv6 address in `fd7a:115c:a1e0::/48` and confirm it also bypasses password.
5. Stop the server and start again with tunnel enabled: `npx codexapp --port 5900 --tunnel`.
6. Confirm startup output now includes a `Tunnel:` URL only when `--tunnel` is provided.
7. Stop and restart once more without `--tunnel`, and verify no tunnel URL is printed.

#### Expected Results
- Requests from Tailscale IPv4 `100.64.0.0/10` are treated as trusted and do not require password sign-in.
- Requests from Tailscale IPv6 `fd7a:115c:a1e0::/48` are treated as trusted and do not require password sign-in.
- Cloudflare tunnel does not start by default.
- Cloudflare tunnel starts only when `--tunnel` is explicitly passed.

#### Rollback/Cleanup
- Stop the CLI process.
- If a cloudflared tunnel was started, ensure the tunnel child process has exited.

### Feature: Tunnel auto mode follows Tailscale IP detection

#### Prerequisites
- App is running from this repository via CLI.
- One environment with detected Tailscale IP (`100.64.0.0/10` or `fd7a:115c:a1e0::/48`) and one without (or simulated by disabling Tailscale).

#### Steps
1. Start server without explicit tunnel flags: `npx codexapp --port 5900`.
2. In a host where Tailscale IP is detected, verify startup output includes `Tunnel:`.
3. In a host where Tailscale IP is not detected, verify startup output does not include `Tunnel:`.
4. Start server with explicit override `--no-tunnel` and verify no `Tunnel:` output even when Tailscale IP is present.
5. Start server with explicit override `--tunnel` and verify `Tunnel:` output even when Tailscale IP is not present.

#### Expected Results
- Without explicit flags, tunnel enablement follows Tailscale IP detection.
- `--no-tunnel` always disables tunnel startup.
- `--tunnel` always enables tunnel startup.

#### Rollback/Cleanup
- Stop the CLI process after each verification run.
- Ensure cloudflared child process exits after shutdown.

### Feature: Reverse tunnel login is required unless request is trusted local or Tailscale

#### Prerequisites
- App is running with password enabled.
- One direct local browser session (`localhost`).
- One reverse tunnel path (for example SSH/Cloudflare forwarding) that reaches the same server.
- Optional Tailscale client in `100.64.0.0/10` or `fd7a:115c:a1e0::/48`.

#### Steps
1. Open app via `http://localhost:<port>` and confirm it opens without login when request is true local loopback.
2. Open app via reverse-tunnel URL and confirm login page is shown.
3. Enter correct password in reverse-tunnel URL and confirm session cookie allows access.
4. (Optional) Open app via Tailscale IP and confirm login is bypassed.

#### Expected Results
- Local loopback access is allowed without login prompt.
- Reverse-tunnel access does not bypass auth and requires password.
- Valid login on reverse-tunnel path creates session and grants access.
- Tailscale CIDR requests remain trusted.

#### Rollback/Cleanup
- Clear browser cookies for the app origin(s).
- Stop the CLI process.

### Feature: Cloudflare tunnel QR includes password auto-login path

#### Prerequisites
- App is running from this repository with password enabled.
- Cloudflare tunnel startup is enabled (`--tunnel` or auto-enabled path).

#### Steps
1. Start CLI and wait for tunnel output.
2. Verify the printed `Tunnel:` URL includes `/password=` suffix.
3. Scan the terminal QR code from a phone/browser.
4. Confirm first page load enters the app without showing password form.
5. Open the tunnel base URL without `/password=` in a private window and verify login prompt still appears.

#### Expected Results
- Tunnel URL shown in startup output uses `/password=<encoded-password>`.
- QR code encodes the same auto-login URL.
- Visiting the auto-login URL sets session cookie and redirects to `/`.
- Base tunnel URL still requires login when no trusted bypass applies.

#### Rollback/Cleanup
- Stop the CLI process.
- Clear cookies for the tunnel origin if needed.

### Feature: No automatic restore of last active thread on startup

#### Prerequisites
- App is running from this repository.
- At least one existing thread is available.
- Browser local storage is enabled.

#### Steps
1. Open the app in a regular browser tab (`http://localhost:<port>/`), select any thread, then navigate back to home route (`#/`).
2. Refresh the browser tab.
3. Confirm the app remains on home route and does not auto-switch to `#/thread/:threadId`.
4. Install/open the app in PWA standalone mode, select any thread, navigate to `#/`, and relaunch the PWA.

#### Expected Results
- In regular browser-tab mode, startup does not restore and redirect to the last active thread.
- In PWA standalone mode, startup also does not restore and redirect to the last active thread.
- Existing `openProjectPath` startup behavior still opens the requested project on home.

#### Rollback/Cleanup
- Clear app local storage state if you need to reset startup behavior for retesting.

#### Prerequisites
- `pnpm` is installed globally (`npm i -g pnpm` or via corepack).
- Repository is cloned and `node_modules/` does not exist (or may be stale).

#### Steps
1. Remove `node_modules/` if present: `rm -rf node_modules`.
2. Run `pnpm run dev`.
3. Wait for Vite dev server to start and display the local URL.
4. Open the displayed URL in a browser.

#### Expected Results
- `pnpm install` runs automatically before Vite starts (dependencies are installed).
- Vite dev server starts successfully and serves the app.
- No `npm` commands are invoked.

#### Rollback/Cleanup
- None.

### Feature: Stop button interrupts active turn without missing turnId

### Feature: Default runtime uses workspace-write sandbox with on-request approvals

#### Prerequisites
- App server is running from this repository.
- No `CODEXUI_SANDBOX_MODE` or `CODEXUI_APPROVAL_POLICY` environment overrides are set for the launch shell.

#### Steps
1. Start the app normally from this repository without passing `--sandbox-mode` or `--approval-policy`.
2. Open the startup logs or terminal output and find the runtime summary.
3. Confirm the reported sandbox mode is `workspace-write`.
4. Confirm the reported approval policy is `on-request`.
5. Restart the app with explicit overrides, for example `--sandbox-mode danger-full-access --approval-policy never`, and confirm those override the defaults.
6. With those overrides still active, trigger an account flow that uses the temporary app-server path (for example a quota/account inspection request).
7. Confirm the temporary app-server request succeeds under the active override settings and does not behave as if it were still using the original startup defaults.

#### Expected Results
- Default launch uses `workspace-write` sandbox mode.
- Default launch uses `on-request` approval policy.
- Explicit CLI flags still override the defaults when provided.
- Temporary app-server spawns in account routes use the current env-derived runtime args, including CLI overrides.

#### Rollback/Cleanup
- Remove any temporary CLI overrides before leaving the environment.

### Feature: Backticked HTTP(S) URL renders as clickable link

#### Prerequisites
- App is running from this repository.
- An active thread is open.

#### Steps
1. Send a message containing exactly: `` `https://github.com/marmeladema` ``.
2. Find the rendered message row and inspect the backticked URL token.
3. Click the rendered URL.

#### Expected Results
- The backticked URL is rendered as a clickable link, not plain inline code text.
- Clicking opens `https://github.com/marmeladema` in a new tab.

#### Rollback/Cleanup
- None.

### Feature: Stop button interrupts active turn without missing turnId

### Feature: Windows npx install no longer depends on legacy PTY package

#### Prerequisites
- A Windows machine with Node.js and npm installed.
- No globally installed `codexapp` package.
- Clear any previous temporary npm cache for `codexapp` if needed.

#### Steps
1. Run `npx codexapp --no-login` on Windows.
2. Confirm npm does not print deprecation warnings for `prebuild-install`, `npmlog`, `are-we-there-yet`, or `gauge` during package install.
3. Exit the app, then run `npx codexapp --no-login` again.
4. Run `npm i -g codexapp` on Windows.
5. Start the globally installed CLI with `codexapp --no-login`.
6. On macOS or Linux, start the app normally and confirm the integrated terminal still opens in a thread.
7. Repeat the integrated terminal check in both light theme and dark theme.

#### Expected Results
- Windows `npx` install no longer pulls `node-pty-prebuilt-multiarch` as a required install dependency.
- The deprecated `prebuild-install` dependency chain warnings no longer appear for `codexapp` installation.
- Re-running `npx codexapp --no-login` works without getting stuck in the same failed temporary install loop.
- Global installation succeeds on Windows.
- Integrated terminal continues to work through `node-pty` on supported hosts.
- Light theme and dark theme terminal surfaces remain readable and unchanged.

#### Rollback/Cleanup
- Remove the global package with `npm rm -g codexapp` if it was installed only for verification.

#### Prerequisites
- App is running from this repository.
- At least one thread can run a long response (for example, request a large code explanation).

#### Steps
1. Send a prompt that keeps the assistant generating for several seconds.
2. Immediately click the `Stop` button before the first assistant chunk fully completes.
3. Confirm generation halts.
4. Repeat with a resumed/existing in-progress thread (reload app while a turn is running, then click `Stop`).

#### Expected Results
- No error appears saying `turn/interrupt requires turnId`.
- Turn is interrupted successfully in both immediate-stop and resumed-thread scenarios.
- Thread state exits in-progress and the stop control returns to idle.

#### Rollback/Cleanup
- None.

### Feature: Revert PR #16 mobile viewport and chat scroll behavior changes

### Feature: Revert new-project folder-browser flow to inline add flow

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- At least one writable parent directory exists for creating a test project folder.

#### Steps
1. On the home/new-thread screen, open the `Choose folder` dropdown.
2. Click `+ Add new project`.
3. Enter a new folder name (for example `New Project Inline Test`) and click `Open`.
4. Confirm the app selects the newly created/opened project folder.
5. Repeat step 2, but enter an absolute path to an existing folder and click `Open`.

#### Expected Results
- Clicking `+ Add new project` opens inline input inside the dropdown instead of navigating to `/codex-local-browse...`.
- Entering a folder name creates/selects that project under the current base directory.
- Entering an absolute path opens that existing folder without creating a nested directory.

#### Rollback/Cleanup
- Delete the test folder created in step 3 if it was created only for verification.

### Feature: Disable auto-restore to last thread when opening home URL

#### Prerequisites
- App is running from this repository.
- At least one existing thread is available.
- Browser local storage may contain previous app state.

#### Steps
1. Open an existing thread route and confirm messages are visible.
2. Open `http://localhost:<port>/` (home route) in the same browser profile.
3. Refresh the home route once.
4. Close and re-open the app/tab at the home URL again.

#### Expected Results
- The app remains on the home/new-thread screen and does not auto-navigate to `/thread/<id>`.
- Refreshing home still keeps the user on home.

#### Rollback/Cleanup
- None.

#### Prerequisites
- App is running from this repository.
- A thread exists with enough messages to scroll.
- Test on a mobile-sized viewport (for example 375x812).

#### Steps
1. Open an existing thread and scroll up to the middle of the chat history.
2. Wait for an assistant response to stream while staying at the same scroll position.
3. Send a follow-up message and observe chat positioning when completion finishes.
4. Open the composer on mobile and drag within the composer area.
5. Open/close the on-screen keyboard on mobile and verify the page layout remains usable.

#### Expected Results
- Chat behavior matches pre-PR #16 baseline (no PR #16 scroll-preservation logic active).
- No regressions from reverting PR #16 changes in conversation rendering and composer behavior.
- Mobile layout no longer includes PR #16 visual-viewport sync changes.

#### Rollback/Cleanup
- Re-apply PR #16 commits if the reverted behavior is not desired.

### Feature: Thread load capped to latest 10 turns

#### Prerequisites
- App is running from this repository.
- At least one thread exists with more than 10 turns/messages.

#### Steps
1. Open a long thread that previously caused UI lag during initial load.
2. While the thread is loading, immediately click another thread in the sidebar.
3. Return to the long thread.
4. Count visible loaded history blocks and confirm only the newest portion is shown.
5. Call `/codex-api/rpc` with method `thread/read` for the same thread and inspect `result.thread.turns.length`.
6. Call `/codex-api/rpc` with method `thread/resume` for the same thread and inspect `result.thread.turns.length`.

#### Expected Results
- Initial thread load renders only the most recent 10 turns.
- UI remains responsive during thread load.
- You can switch to another thread without the UI freezing.
- `thread/read` and `thread/resume` RPC responses contain at most 10 turns.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Skills list request scoped to active thread cwd

#### Prerequisites
- App is running from this repository.
- Browser DevTools Network tab is open.
- At least two threads exist with different `cwd` values.

#### Steps
1. Reload the app and wait for initial data load.
2. In Network tab, inspect `/codex-api/rpc` requests with method `skills/list`.
3. Verify request params contain `cwds` with only the currently selected thread cwd.
4. Switch to another thread with a different cwd.
5. Inspect the next `skills/list` request and verify `cwds` now contains only the new selected thread cwd.

#### Expected Results

### Feature: Pinned threads persist across reload and prune removed threads

#### Prerequisites
- App is running from this repository.
- At least two threads exist in the sidebar.

#### Steps
1. Pin two threads from the sidebar using the pin button.
2. Refresh the app page.
3. Confirm the same threads are still shown in the `Pinned` section and in the same order.
4. Archive one of the pinned threads from the thread menu.
5. Refresh the app page again.

#### Expected Results
- Pinned threads are restored after reload from Codex app global state (`~/.codex/.codex-global-state.json` key `thread-pinned-ids`).
- Pin order is preserved between reloads.
- Archived/removed pinned thread is automatically pruned and no stale pinned row remains.

#### Rollback/Cleanup
- Unpin test threads if needed.
- `skills/list` no longer sends every thread cwd in one request.
- Each `skills/list` call includes at most one cwd for the active thread context.
- Skills list still updates when changing selected thread.

#### Rollback/Cleanup
- No cleanup required.

---

### Feature: GitHub Website Redesign — OpenClaw-Inspired Design + Web Demo Link

#### Prerequisites
- The `docs/index.html` file has been updated with the new design.
- A browser is available to view the page locally or via GitHub Pages.

#### Steps
1. Open `docs/index.html` in a browser (local file or via GitHub Pages).
2. Verify the fixed **navigation bar** at top with brand logo, section links, and "Get the App" CTA.
3. Verify the **announcement banner** below nav shows the XCodex WASM link.
4. Verify **hero section** displays lobster emoji, "AnyClaw" title with gradient, tagline, and four CTA buttons: "Try Web Demo", "Google Play", "Download APK", "GitHub".
5. Click **"Try Web Demo"** button — confirm it navigates to `https://xcodex.slrv.md/#/`.
6. Verify the **stats bar** shows key metrics (2 AI Agents, 1 APK, 0 Root Required, 73MB, infinity).
7. Scroll to **Live Demo** section — verify embedded iframe loads `https://xcodex.slrv.md/#/` with mock browser chrome.
8. Scroll to **Screenshots** section — verify four images render (2 desktop, 2 mobile).
9. Scroll to **Features** section — verify 6 feature cards in a 3-column grid.
10. Scroll to **Testimonials** section — verify two rows of auto-scrolling marquee cards (row 2 scrolls reverse). Hover to pause.
11. Scroll through **Architecture**, **Boot Sequence**, **Quick Start**, and **Tech Stack** sections — verify content renders.
12. Verify the **footer** includes a "Web Demo" link to `https://xcodex.slrv.md/#/`.
13. Test responsive at 768px and 480px — nav links collapse, grids single-column, buttons stack vertically.

#### Expected Results
- Page has a dark, premium feel with gradient accents, grain overlay, and smooth animations.
- All links to `https://xcodex.slrv.md/#/` work (announcement, hero CTA, demo section, quick start text, footer).
- Marquee testimonials scroll continuously and pause on hover.
- Embedded iframe demo loads successfully.
- Mobile responsive layout works at all breakpoints.

#### Rollback/Cleanup
- Revert `docs/index.html` to previous commit if needed.

### Feature: Keep manual chat scroll position during streaming

#### Prerequisites
- App is running from this repository.
- A thread exists with enough history to allow scrolling away from bottom.

#### Steps
1. Open the thread and scroll upward so latest messages are not visible.
2. Send a new message that produces a streaming assistant response.
3. During streaming, do not scroll and observe viewport position.
4. After streaming completes, verify the viewport remains at the same manual position.

#### Expected Results
- Streaming updates do not force auto-scroll to the bottom when user has manually scrolled away.
- User can continue reading older history while the response streams.
- If the thread is already at the bottom when streaming starts, the latest streaming overlay remains visible.

#### Rollback/Cleanup
- Revert the scroll-preservation change in `src/components/content/ThreadConversation.vue` if manual scroll locking needs to be removed.

### Feature: Rollback API/UI no longer requires turn index in rollback payload

#### Prerequisites
- App is running from this repository.
- A thread exists with at least 2 completed turns.
- Rollback control is visible in the thread conversation message actions.

#### Steps
1. Open any existing thread with multiple turns.
2. In DevTools Network tab, keep `/codex-api/rpc` requests visible.
3. Click rollback on a user or assistant message that is not the newest one.
4. Confirm rollback succeeds and the thread is truncated to the selected turn.
5. Inspect the UI event flow by repeating rollback from a different turn and confirm the selected message can rollback without relying on a numeric turn index.
6. Use dictation resend flow (or "rollback latest user turn" flow) and confirm the latest user turn is rolled back correctly.

#### Expected Results
- Rollback works when triggered from message actions using `turnId` as the identifier.
- No UI path depends on `turnIndex` in rollback event payloads.
- Latest-user-turn rollback flow still works and targets the latest user `turnId`.
- No TypeScript/runtime errors are introduced in rollback interaction.

#### Rollback/Cleanup
- Revert the updated files if this behavior is not desired:
  - `src/types/codex.ts`
  - `src/api/normalizers/v2.ts`
  - `src/components/content/ThreadConversation.vue`
  - `src/App.vue`
  - `src/composables/useDesktopState.ts`

### Feature: Rollback init commit includes `.codex/.gitignore`

#### Prerequisites
- App server is running from this repository.
- Use a fresh temporary project directory with no existing `.codex/rollbacks/.git` history.

#### Steps
1. In a fresh test project folder, trigger rollback automation init by calling `/codex-api/worktree/auto-commit` with a valid commit message.
2. Verify rollback repo exists at `.codex/rollbacks/.git`.
3. In that rollback repo, run `git --git-dir .codex/rollbacks/.git --work-tree . show --name-only --pretty=format: HEAD`.
4. Confirm `.codex/.gitignore` appears in the file list for the init commit.
5. Open `.codex/.gitignore` and verify `rollbacks/` exists.

#### Expected Results
- First rollback-history commit is `Initialize rollback history`.
- That commit includes `.codex/.gitignore`.
- `.codex/.gitignore` contains `rollbacks/`.

#### Rollback/Cleanup
- Remove the temporary test folder after verification.

### Feature: Deterministic rollback commit + exact lookup with debug logs

#### Prerequisites
- App server is running from this repository.
- `worktree git automation` is enabled in UI settings.
- Test thread available where you can send at least 3 user turns.

#### Steps
1. Send a user turn that changes files and completes.
2. Send a user turn that produces no file edits and completes.
3. Send a third user turn and complete it.
4. In rollback git history (`.codex/rollbacks/.git`), verify each completed turn created a commit, including the no-edit turn.
5. Inspect one rollback commit body and confirm it contains the user message text plus `Rollback-User-Message-SHA256: <hash>`.
6. Trigger rollback to the second turn message via UI rollback action.
7. Verify server logs contain `[rollback-debug]` entries for lookup, stash (if dirty), reset, and completion.
8. Temporarily test missing-commit path by calling `/codex-api/worktree/rollback-to-message` with a non-existent message text.

#### Expected Results
- Auto-commit creates a rollback commit for every completed turn (`--allow-empty` behavior).
- Commit body includes the user message and stable hash trailer.
- Rollback uses exact hash-based commit lookup only.
- If exact commit is missing, rollback returns error and does not continue.
- Server logs include `[rollback-debug]` records for commit creation, lookup, stash, reset, and error paths.
- Browser console includes `[rollback-debug]` client-side start/success/error logs for auto-commit and rollback API calls.
- Rollback init no longer fails when `.codex` is ignored globally; init force-adds `.codex/.gitignore`.

#### Rollback/Cleanup
- Revert the changed files if you want previous non-deterministic behavior back.

### Feature: Per-turn changed files panel with lazy diff loading

#### Prerequisites
- App server running from this repository.
- Worktree git automation enabled.
- A thread with at least one completed turn that touched files.

#### Steps
1. Open a thread and locate a `Worked for ...` separator message.
2. Expand the worked separator.
3. Verify a changed-files panel appears above command details.
4. Confirm file list entries show file path and `+/-` counts.
5. Click one changed file row to expand it.
6. Verify diff content loads only after expansion (lazy load behavior).
7. Collapse and re-expand the same file row; verify diff reuses loaded content.
8. Switch to another thread and back; verify panel reloads for the active thread context.

#### Expected Results
- Each worked message can show changed files for its turn.
- Diff for a file is fetched only on expand, not for all files upfront.
- Errors (missing commit/diff load failure) are shown inline in the panel.
- Existing command output expand/collapse behavior remains unchanged.
- Changed-files panel still resolves after page refresh or app-server restart.
- Changed-files panel appears at the end of the worked message block (after command rows).

#### Rollback/Cleanup
- No cleanup required.

### Feature: Worked separator is non-expandable

#### Prerequisites
- App server running from this repository.
- A thread with at least one `Worked for ...` separator.

#### Steps
1. Open a thread and locate a `Worked for ...` message.
2. Click the separator line/text area.
3. Verify no expand/collapse behavior is triggered on the separator itself.
4. Verify changed-files panel still appears below the separator when data exists.

#### Expected Results
- `Worked for ...` acts as a visual separator only (non-interactive).
- Changed-files and command sections are not gated by a worked-separator expand toggle.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Changed-files lookup fallback when turnId metadata is missing

#### Prerequisites
- App server running from this repository.
- Playwright CLI available.

#### Steps
1. Create/prepare a test workspace (example: `/tmp/rollback-pw`).
2. Call `/codex-api/worktree/auto-commit` with:
   - `cwd=/tmp/rollback-pw`
   - `message='pw-msg-turn-1'`
   - `turnId='turn-real-1'`
3. Call `/codex-api/worktree/message-changes` with:
   - same `cwd`
   - same `message`
   - mismatched `turnId='turn-wrong'`
4. Verify response is still `200` and returns the matching commit data (message-hash fallback).
5. Capture Playwright artifact screenshot.

#### Expected Results
- `message-changes` first attempts turnId lookup.
- If turnId lookup misses, it falls back to exact message-hash lookup.
- API returns commit data instead of `No matching commit found for this user message` when message matches.

#### Rollback/Cleanup
- Remove temporary test workspace if created.

### Feature: Changed-files panel persists across refresh (assistant message level)

#### Prerequisites
- App server running from this repository.
- Existing thread in `TestChat` project with completed assistant messages.
- Worktree rollback auto-commit enabled.

#### Steps
1. Open a `TestChat` thread and confirm assistant message cards render.
2. Verify changed-files panel is shown at the end of assistant messages that have rollback commit data.
3. Hard refresh the page.
4. Re-open the same `TestChat` thread.
5. Verify changed-files panel is still shown for the same assistant message(s).
6. Expand one file diff and verify diff content loads.

#### Expected Results
- Changed-files panel is attached to assistant messages (not transient worked separators).
- Changed-files panel appears only once per turn (on the last assistant message in that turn).
- Changed-files panel is hidden while a turn is still in progress.
- Panels remain available after refresh/restart because lookup is turnId/message-hash based.
- File diff expansion still lazy-loads and displays content.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Rollback debug logs controlled by `.env`

#### Prerequisites
- App server stopped.
- Edit `.env` directly, and use `.env.local` for private local overrides.

#### Steps
1. Set `ROLLBACK_DEBUG=0` and `VITE_ROLLBACK_DEBUG=0` in `.env`.
2. Start app and trigger rollback auto-commit/message-changes flow.
3. Verify `[rollback-debug]` logs are not emitted in terminal/browser console.
4. Set `ROLLBACK_DEBUG=1` and `VITE_ROLLBACK_DEBUG=1` in `.env`.
5. Restart app and trigger the same flow again.
6. Verify `[rollback-debug]` logs appear in terminal/browser console.

#### Expected Results
- Debug logs are disabled when env flags are `0`.
- Debug logs are enabled when env flags are `1`.

#### Rollback/Cleanup
- Restore `.env` values to preferred defaults.

### Feature: Auto-commit default is disabled for new preference state

#### Prerequisites
- App server running from this repository.
- Browser local storage key `codex-web-local.worktree-git-automation.v1` is absent (new user state).

#### Steps
1. Open the app in a fresh browser profile (or clear only `codex-web-local.worktree-git-automation.v1`).
2. Open Settings and inspect the `Rollback commits` toggle state.
3. Confirm it starts in the disabled/off state.
4. Enable the toggle manually.
5. Reload the page and confirm the toggle remains enabled.
6. Disable it again, reload, and confirm it remains disabled.

#### Expected Results
- Default state is disabled when no prior preference exists.
- User-selected state persists via local storage across reloads.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Skills sync pull live-reloads installed skills list

#### Prerequisites
- App running from this repository with Skills Hub available.
- GitHub skills sync configured and connected.
- At least one skill update available in the sync source (new or edited skill metadata).

#### Steps
1. Open the app and note the currently visible installed skills for the active thread cwd.
2. In Skills Hub, trigger `Pull` from GitHub sync.
3. Wait for the pull success toast.
4. Without restarting the app/server, navigate to thread composer skill picker and verify the installed skills list.
5. Switch to another thread and back to force a normal UI refresh path.

#### Expected Results
- Pull completes successfully.
- Installed skills list reflects pulled changes immediately without app/server restart.
- Thread switch keeps showing the updated skills list (no stale cache rollback).

#### Rollback/Cleanup
- If needed, run another sync pull/push to restore previous skill state in the sync repo.

### Feature: Force Refresh Skills button in Skills Sync panel

#### Prerequisites
- App running from this repository with Skills Hub route accessible.
- At least one installed skill is available for the current thread cwd.

#### Steps
1. Open `Skills Hub`.
2. In `Skills Sync (GitHub)`, click `Force Refresh Skills`.
3. Verify button text changes to `Refreshing...` during the request and returns after completion.
4. Verify success toast appears.
5. Open the thread composer skills picker and confirm installed skills list is present and current.
6. Switch to another thread and back to ensure refreshed list remains consistent.

#### Expected Results
- `Force Refresh Skills` triggers a manual refresh without requiring pull/push.
- Loading state prevents duplicate clicks while refresh is in progress.
- Installed skills list updates immediately and remains updated across thread switches.

#### Rollback/Cleanup
- No cleanup required.

### Feature: SkillHub shows detailed skill load errors

#### Prerequisites
- App running from this repository.
- At least one invalid installed skill file exists (for example unresolved merge markers in `SKILL.md`).

#### Steps
1. Open `Skills Hub`.
2. Trigger `Force Refresh Skills`.
3. Locate the `Some skills failed to load` panel above the skills sections.
4. Verify each row shows:
   - the failing `SKILL.md` path
   - the exact parser error message from app server (for example invalid YAML line/column details).
5. Fix the invalid skill file and trigger `Force Refresh Skills` again.

#### Expected Results
- SkillHub surfaces app-server load failures with detailed path and message.
- Messages are specific enough to identify the broken file and parser failure reason.
- Error panel disappears after invalid skills are fixed and refreshed.

#### Rollback/Cleanup
- Restore any intentionally broken local skill files used for testing.

### Feature: Startup sync preserves local skill edits when remote is ahead

#### Prerequisites
- Skills sync configured to a private GitHub fork.
- Local skills repo has a tracked edit in an existing skill file.
- Remote `main` has at least one newer commit than local (simulate from another machine or commit directly on GitHub).

#### Steps
1. Edit a local skill file (for example update description text in `SKILL.md`) and keep the change.
2. Trigger `Startup Sync` in Skills Hub.
3. If a non-fast-forward condition exists, allow startup sync to complete retry path.
4. Re-open the same local skill file and verify your edit remains.
5. Trigger `Force Refresh Skills` and verify no unexpected skill removals occurred.

#### Expected Results
- Startup sync no longer fails with non-fast-forward push due to missing remote integration.
- Local tracked skill edits remain after sync (not overwritten by remote state).
- Sync path rebases/pulls with autostash and auto-resolves conflicts by mtime policy:
  - choose remote (`theirs`) when remote file commit time is newer than local file mtime.
  - choose local (`ours`) otherwise.
- No manual conflict intervention is required during startup sync retries.

#### Rollback/Cleanup
- Revert test-only skill text changes if they were not intended to keep.

### Feature: Startup sync conflict fallback when one side is missing

#### Prerequisites
- Skills sync repo contains a conflict candidate where only one side exists for a path (for example delete/modify scenario).
- Skills Hub is accessible.

#### Steps
1. Open `Skills Hub`.
2. Click `Startup Sync`.
3. Wait for sync completion or error toast.
4. Verify no toast/error contains `does not have our version`.

#### Expected Results
- Sync conflict resolver handles missing `--ours`/`--theirs` versions safely.
- Startup sync does not fail with `git checkout --ours/--theirs` missing-version errors.

#### Rollback/Cleanup
- None.

### Feature: Remote changes win when no local uncommitted skill edits exist

#### Prerequisites
- Skills sync configured with GitHub.
- Local skills repo working tree is clean (`git status --porcelain` empty under skills dir).
- Remote skills repo has newer commits touching existing skill files.

#### Steps
1. Confirm no local uncommitted changes in skills directory.
2. Trigger `Startup Sync` in Skills Hub.
3. After sync, inspect the skill file changed remotely.
4. Trigger `Force Refresh Skills` and confirm loaded skill content matches remote update.

#### Expected Results
- Sync pull/reconcile does not preserve stale local file content when local tree is clean.
- Remote updates are applied locally and remain after startup sync completes.

#### Rollback/Cleanup
- None.

### Feature: Startup sync does not delete remote AGENTS.md

#### Prerequisites
- Skills sync configured to `friuns2/codexskills`.
- Remote `main` contains `AGENTS.md`.
- Local skills repo is clean before startup sync.

#### Steps
1. Confirm remote `AGENTS.md` exists on `main`.
2. Confirm local `~/.codex/skills` is clean.
3. Trigger `Startup Sync`.
4. After completion, inspect latest commit created by sync (if any).
5. Verify `AGENTS.md` still exists locally and in remote `origin/main`.

#### Expected Results
- Startup sync may update manifest, but must not delete `AGENTS.md`.
- If sync creates a commit, changed files do not include `D AGENTS.md`.
- Local and remote `AGENTS.md` hashes remain equal after sync.

#### Rollback/Cleanup
- None.

### Feature: Bidirectional AGENTS.md sync via Startup Sync

#### Prerequisites
- Skills sync configured to `friuns2/codexskills`.
- `~/.codex/skills` is a clean git working tree before each sub-test.
- Skills Hub startup sync endpoint is reachable.

#### Steps
1. Remote -> Local:
2. Add a unique marker to remote `AGENTS.md` on `main`.
3. Confirm local `HEAD` is behind `origin/main`.
4. Trigger `Startup Sync`.
5. Verify local `AGENTS.md` contains the remote marker and local `HEAD == origin/main`.
6. Local -> Remote:
7. Add a different unique marker to local `~/.codex/skills/AGENTS.md`.
8. Confirm local working tree shows `M AGENTS.md`.
9. Trigger `Startup Sync`.
10. Verify remote `origin/main:AGENTS.md` contains the local marker and local `HEAD == origin/main`.

#### Expected Results
- Remote-only AGENTS edits are pulled into local without deletion.
- Local AGENTS edits are pushed to remote after startup sync.
- After each sync direction, local and remote commit SHAs match.

#### Rollback/Cleanup
- Remove temporary test markers from `AGENTS.md` if required.

### Feature: Mixed local+remote AGENTS edits do not stall Startup Sync

#### Prerequisites
- Skills sync configured and working.
- Local skills repo clean before test start.

#### Steps
1. Add marker `A` to remote `AGENTS.md`.
2. Add marker `B` to local `AGENTS.md` before syncing.
3. Trigger `Startup Sync`.
4. Wait for startup status to finish (`inProgress=false`).
5. Verify sync outcome explicitly:
6. If sync succeeds, local/remote SHAs match and expected merged marker result is present.
7. If sync fails, status includes a concrete error message (not silent success).

#### Expected Results
- Startup sync must not report success while local remains behind remote.
- No stale stash side-effects are introduced (no unexpected conflict from old stash entries).
- Final state is either a valid synchronized result or an explicit failure status with actionable error.

#### Rollback/Cleanup
- Reset local skills repo to `origin/main` after test if needed.

### Feature: Startup sync uses deterministic pull reconcile (`fetch + reset --hard`) before local replay

#### Prerequisites
- Skills sync is logged in and targets `friuns2/codexskills`.
- Local repo path is `~/.codex/skills`.
- Startup Sync endpoint is reachable at `/codex-api/skills-sync/startup-sync`.

#### Steps
1. Remote-only case:
2. Commit a unique marker to remote `AGENTS.md` on `main`.
3. Ensure local repo is clean and reset to `origin/main`, then trigger `Startup Sync`.
4. Confirm marker appears locally and `HEAD == origin/main`.
5. Local-only case:
6. Add a unique local marker to `~/.codex/skills/AGENTS.md` (uncommitted), trigger `Startup Sync`.
7. Confirm marker is pushed and `HEAD == origin/main` with clean worktree.
8. Mixed case:
9. Add local marker first, then commit a newer remote marker.
10. Trigger `Startup Sync` and verify mtime policy result (newer remote marker wins, older local marker dropped).
11. Confirm final state is clean with `HEAD == origin/main`.

#### Expected Results
- Startup sync does not fail with missing merge refs (`MERGE_HEAD`/`REBASE_HEAD`) in this path.
- Remote-only changes are always pulled first and visible locally.
- Local-only changes are preserved and pushed during the same startup sync run.
- Mixed local+remote edits converge automatically with no manual conflict handling.

#### Rollback/Cleanup
- Remove temporary test markers from `AGENTS.md` if not needed.

### Feature: Revert Renat scrolling/input-layout behavior (without Fast mode changes)

#### Prerequisites
- App builds successfully (`pnpm run build`).
- Open a thread with enough messages to scroll.
- Composer is visible in the main chat view.

#### Steps
1. Open a long thread and scroll upward away from bottom.
2. Trigger live overlay updates (for example by sending a new prompt) and observe scroll behavior.
3. Confirm message list horizontal overflow behavior in conversation and desktop main area.
4. In composer, verify there is no drag/drop overlay UI when dragging files over the input.
5. In composer, paste an image from clipboard and verify it is not auto-attached through paste handler.
6. Use file picker/camera attach buttons and confirm attachments still work.
7. Confirm Fast mode UI/toggle remains present and unchanged.

#### Expected Results
- Scroll behavior follows reverted layout logic for conversation/desktop containers.
- Composer drag-active overlay is removed from the input field layout.
- Clipboard image paste no longer triggers drag/paste attachment flow.
- Standard picker-based attachments still work.
- Fast mode button and related controls are unchanged.

#### Rollback/Cleanup
- `git restore src/components/content/ThreadComposer.vue src/components/content/ThreadConversation.vue src/components/layout/DesktopLayout.vue src/style.css tests.md`

### Feature: Chat file-link context menu (open/copy/edit)

#### Prerequisites
- App server is running from this repository.
- Open a thread that contains rendered `.message-file-link` anchors (for example Markdown file links).

#### Steps
1. In a message with a file link, right-click the file link text.
2. Verify the custom context menu appears near the pointer.
3. Click `Open link` and confirm the link opens in a new tab.
4. Right-click the same file link again and click `Copy link`, then paste into a text input to verify copied value.
5. For links under `/codex-local-browse...`, right-click and click `Edit file`.
6. Click outside the menu and press `Escape` while the menu is open.

#### Expected Results
- Right-clicking any `.message-file-link` opens the custom context menu.
- Menu includes `Open link` and `Copy link` for all links.
- Menu includes `Edit file` only for browseable local file links.
- Pointer-down outside, blur, and `Escape` close the menu.

#### Rollback/Cleanup
- Close any tabs opened during the test.

### Feature: Dark theme command rows in chat remain readable

#### Prerequisites
- App is running from this repository.
- Open any thread that contains command execution entries.
- Appearance is set to `Dark` in Settings.

#### Steps
1. Open a thread with one or more command execution rows in the conversation.
2. Verify command label text, grouped command label text, and status text in collapsed rows.
3. Locate a file-change summary row (for example: `▶ 2 files changed · 2 edited`) and verify the chevron and summary text are readable.
4. Expand a command row to show output and inspect the output panel border contrast.
5. Confirm status colors for running/success/error command rows are distinguishable in dark mode.
6. Toggle back to `Light` theme and confirm command rows still use the existing light styling.

#### Expected Results
- Command labels and grouped command labels are readable against dark row backgrounds.
- File-change summary rows keep readable chevron and summary text in dark mode.
- Default status text is readable in dark mode.
- Running/success/error status colors remain visible in dark mode.
- Expanded command output border is visible without using a bright light-theme border.
- Light theme command row styling is unchanged.

#### Rollback/Cleanup
- Return appearance setting to the previous user preference.

### Feature: Home composer vertical alignment matches reference layout

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open the `New thread` (home) screen with a selected folder/project.
- Ensure desktop viewport width (for example >= 1280px).

#### Steps
1. Open the home screen and observe the hero block (`Let's build`) and composer placement.
2. Confirm the hero/settings block is vertically centered within the available content area.
3. Confirm the message composer sits in the lower area of the content column (not immediately below top content).
4. Resize window height taller/shorter and re-check vertical placement.
5. Open any thread route and verify thread composer layout remains unchanged.

#### Expected Results
- Home hero block is centered again (not top-anchored).
- Home composer aligns toward the bottom region similar to the reference screenshot.
- Resizing preserves the intended centered-hero + lower-composer structure.
- Thread route composer behavior is unchanged.

#### Rollback/Cleanup
- Revert the `.new-thread-empty` style in [src/App.vue](/Users/igor/.codex/worktrees/eaf8/codex-web-local/src/App.vue).

### Feature: Restore composer drag-and-drop file attach on input field

#### Prerequisites
- App is running with a selected thread and active composer.
- At least one local file is available to drag from Finder/File Explorer.

#### Steps
1. Drag a file over the composer input area.
2. Confirm drag highlight/overlay appears above the input.
3. Drop the file on the composer input field.
4. Verify the file is attached in composer chips.
5. Repeat with an image file and verify image preview appears.
6. In dark mode, repeat steps 1-2 and verify overlay remains readable.

#### Expected Results
- Composer shows drag-active visual state while file is hovering.
- Dropped files are attached through the same attachment pipeline as regular uploads.
- Image drops create image preview attachments.
- Dark mode drag overlay uses dark-theme colors and remains legible.

#### Rollback/Cleanup
- Remove attached files/images from the composer before closing the test thread.

### Feature: Restore clipboard image paste attachments in composer

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open any thread where the composer is enabled.
- Have an image copied to system clipboard (for example screenshot copy).

#### Steps
1. Focus the composer textarea.
2. Paste clipboard content that contains only an image file payload.
3. Confirm an image chip/preview is added to composer attachments.
4. Copy plain text only and paste into composer.
5. Copy mixed content (plain text + image, if source provides both) and paste once.
6. Copy long plain text (at least 2000 characters) and paste into composer.
7. Confirm the long text is attached as a `.txt` file instead of being inserted into the textarea.
8. Send the message with the pasted image/text attachment.

#### Expected Results
- Image-only clipboard paste adds an image attachment to composer.
- Plain-text paste still inserts text into the composer and does not create an attachment.
- Mixed payload paste attaches the image while preserving text paste behavior.
- Long plain-text paste (>= 2000 chars) creates a `.txt` attachment and does not insert raw text into the textarea.
- Sending proceeds with the attached pasted image.

#### Rollback/Cleanup
- Remove the attached image chip from composer if not needed.

### Feature: Show user file attachments as visible chips in chat

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open any thread with an active composer.
- Have at least one local file available to attach.

#### Steps
1. Attach one or more files via composer (file picker, paste long text as `.txt`, or other file attachment flow).
2. Send the message.
3. Locate the sent user message in conversation.
4. Verify file attachment chips are rendered above message text.
5. Click a file chip and confirm it opens the browse URL in a new tab/window.
6. Right-click the chip link and verify file-link context actions still appear (`Open link`, `Copy link`, and `Edit file` when applicable).

#### Expected Results
- Sent user messages with `fileAttachments` show visible file chips in chat.
- Chip labels match attachment labels from composer payload.
- Chip links resolve through browse URLs and remain clickable.
- Existing file-link context menu behavior works on the chip links.

#### Rollback/Cleanup
- Close any opened file tabs and remove temporary test messages if needed.

### Feature: Frontend missing-entry 404 page auto-redirects to chat

#### Prerequisites
- Build or runtime state where frontend entry cannot be served (for example missing `dist/index.html`).
- Start server and open the failing route in a browser.

#### Steps
1. Trigger the frontend missing-entry error page.
2. Confirm the page shows an error headline and a `Back to chat` link.
3. Wait 3 seconds without clicking the link.
4. Repeat and click `Back to chat` immediately.

#### Expected Results
- Error page still renders with the manual `Back to chat` link.
- Page automatically redirects to `/` after about 3 seconds.
- Manual link works instantly and is not blocked by the timer.

#### Rollback/Cleanup
- Restore frontend assets (`pnpm run build:frontend`) if they were intentionally removed for testing.

### Feature: Import 10 working DB accounts and keep Accounts section collapsed by default

#### Prerequisites
- Have a SQLite DB with `account_tokens.refresh_token` rows (default path: `/Users/igor/Git-projects/any-auto-register/account_manager.db`).
- Network access available for token exchange against OpenAI OAuth endpoint.
- Codex home available at `~/.codex` (or set `CODEX_HOME`).
- Start the app from this repository (`pnpm run dev`).

#### Steps
1. Run `scripts/import-working-accounts-from-db.sh`.
2. Verify script reports `imported` rows and ends with `done imported=<n>` where `n <= 10`.
3. Open `~/.codex/accounts.json` and verify new account entries were appended/updated.
4. Verify snapshot files exist under `~/.codex/accounts/<sha256(account_id)>/auth.json`.
5. Open app settings and check the `Accounts` section is collapsed on first load.
6. Click the chevron toggle in Accounts header to expand.
7. Confirm account list/error/empty state renders correctly after expanding.
8. Reload the page and confirm collapsed/expanded state persists.

#### Expected Results
- Script imports up to 10 valid (token-exchange-successful) accounts and skips invalid tokens.
- `accounts.json` and per-account snapshot `auth.json` files are created with secure file modes.
- Accounts panel in settings is collapsed by default when no saved preference exists.
- User can expand/collapse Accounts via header toggle, and the state persists in localStorage.

#### Rollback/Cleanup
- Remove imported snapshots from `~/.codex/accounts/` and corresponding rows in `~/.codex/accounts.json` if needed.
- Delete localStorage key `codex-web-local.accounts-section-collapsed.v1` to reset UI preference.

### Feature: Copy Codex accounts to Android via ssh helper script

#### Prerequisites
- Local Codex state exists at `~/.codex/accounts` and `~/.codex/accounts.json`.
- Android helper exists and is executable: `/Users/igor/Git-projects/codex-web-local-android/andclaw/ssh.sh`.
- Android target is reachable through helper SSH path.

#### Steps
1. Run `scripts/copy-accounts-to-android.sh`.
2. Confirm script prints local account count and upload/extract progress.
3. Confirm script prints remote account count.
4. Verify script exits successfully with `Copy complete: local and remote counts match.`
5. On Android host, verify `~/.codex/accounts.json` exists and snapshots under `~/.codex/accounts/*/auth.json` are present.

#### Expected Results
- Script packs `accounts/` and `accounts.json`, uploads and extracts on Android.
- Local and remote `auth.json` snapshot counts match.
- Script exits non-zero on mismatch or missing prerequisites.

#### Rollback/Cleanup
- Remove remote copied data if needed: delete `~/.codex/accounts` and `~/.codex/accounts.json` on Android host.

### Feature: Accounts no longer stuck on "Fetching account details…"

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Have at least one imported account in the Accounts section.

#### Steps
1. Open Settings and expand `Accounts`.
2. Ensure at least one account has no immediately available quota snapshot (for example right after import/refresh, or by waiting for quota read failure).
3. Observe the quota/status line for that account after the initial fetch completes.
4. Trigger `Reload` in the Accounts header and wait for account list update.
5. Re-check accounts that are not in `Loading quota…` state.

#### Expected Results
- `Fetching account details…` appears only while the entry is truly in transient loading.
- Accounts that are not loading and still have no quota snapshot show `Quota unavailable` instead of a perpetual fetching label.
- Existing `Loading quota…` and explicit error messages continue to render correctly.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Account quota background refresh recovers from stale loading and inspection hangs

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Have multiple imported accounts in `~/.codex/accounts.json`.
- At least one account previously left with `quotaStatus: "loading"` for longer than 2 minutes, or one account that causes quota inspection to hang.

#### Steps
1. Open Settings and expand `Accounts`.
2. Trigger account list refresh by loading the page or clicking `Reload`.
3. Monitor `~/.codex/accounts.json` and confirm stale `loading` accounts are re-picked for refresh (not ignored indefinitely).
4. Wait at least 30 seconds when one account is slow/hanging.
5. Verify other accounts continue progressing instead of all remaining blocked.
6. Re-open the Accounts section and inspect final status labels for previously stuck accounts.

#### Expected Results
- `loading` states older than 2 minutes are retried automatically.
- A single hanging account inspection times out (about 25 seconds) and transitions to `error` rather than blocking the whole queue forever.
- Remaining accounts continue refreshing to `ready` as data becomes available.
- UI no longer stays indefinitely stuck waiting on one blocked account refresh.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Account quota label uses primary snapshot when windowMinutes is missing

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Have accounts where `quotaSnapshot.primary` exists but `windowMinutes` can be null.

#### Steps
1. Open Settings and expand `Accounts`.
2. Click `Reload` and wait for account statuses to settle to `ready`.
3. Inspect account rows that previously showed `Quota unavailable` while backend had `quotaSnapshot.primary.usedPercent`.
4. Verify displayed quota labels in UI and account card titles.

#### Expected Results
- Accounts with `quotaSnapshot.primary` show a remaining-percent quota label.
- `Quota unavailable` appears only when there is truly no usable quota snapshot data.
- Team/free accounts both render quota labels consistently when primary snapshot is present.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Default runtime uses unrestricted sandbox and no approvals

#### Prerequisites
- Build artifacts are available (or run directly from source in this repo).
- No `CODEXUI_SANDBOX_MODE` or `CODEXUI_APPROVAL_POLICY` environment variables are exported in the shell.

#### Steps
1. Start the app from this repository without passing `--sandbox-mode` or `--approval-policy`.
2. Observe startup logs for the printed runtime config lines.
3. Confirm the logs show `Codex sandbox: danger-full-access` and `Approval policy: never`.
4. Stop the app and restart with explicit overrides, for example `--sandbox-mode workspace-write --approval-policy on-request`.
5. Confirm startup logs now show the override values.

#### Expected Results
- Default startup (no flags/env) uses `danger-full-access` sandbox and `never` approval policy.
- Explicit CLI overrides still take precedence and are applied correctly.

#### Rollback/Cleanup
- Unset any temporary env vars used for override checks.

### Feature: npm run dev exports unrestricted runtime defaults

#### Prerequisites
- Node and pnpm are installed.
- No shell-level `CODEXUI_SANDBOX_MODE` or `CODEXUI_APPROVAL_POLICY` overrides are set.

#### Steps
1. Run `npm run dev` from the repository root.
2. In a second terminal, run `ps eww -p $(pgrep -f "vite" | head -n 1)`.
3. Confirm the process environment contains `CODEXUI_SANDBOX_MODE=danger-full-access` and `CODEXUI_APPROVAL_POLICY=never`.
4. Stop dev server and run `CODEXUI_SANDBOX_MODE=workspace-write CODEXUI_APPROVAL_POLICY=on-request npm run dev`.
5. Re-check the Vite process environment values.

#### Expected Results
- Default `npm run dev` includes `CODEXUI_SANDBOX_MODE=danger-full-access` and `CODEXUI_APPROVAL_POLICY=never`.
- Explicit shell overrides still take precedence when provided.

#### Rollback/Cleanup
- Stop running dev servers and unset temporary env overrides.

### Feature: npm run dev uses CLI server on Android

#### Prerequisites
- Android SSH helper exists and is executable: `/Users/igor/Git-projects/codex-web-local-android/andClaw/ssh.sh`.
- Dependencies are installed on the Android clone.

#### Steps
1. On Android, run `npm run dev -- --port 4173`.
2. Confirm startup logs show `Codex Web Local is running!`.
3. In a second Android shell, run `curl -fsS http://127.0.0.1:4173/ | head -5`.
4. Stop the dev server.

#### Expected Results
- Android starts `node dist-cli/index.js`, not raw Vite.
- The server binds successfully and returns the app HTML.
- The Vite `uv_interface_addresses` Android error does not occur.

#### Rollback/Cleanup
- Stop the Android dev server.

### Feature: Approval request uses legacy in-conversation request card only

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open a thread where Codex can trigger an approval request (for example a command or file-change approval).

#### Steps
1. Trigger an approval request in an existing thread.
2. Observe the conversation timeline where server requests are rendered.
3. Observe the composer area at the bottom of the thread.
4. Confirm the approval controls are shown in the in-conversation request card.
5. Confirm no separate composer waiting-state approval panel is rendered.

#### Expected Results
- Exactly one approval UI is visible for the active pending request.
- The approval UI appears in the conversation request card.
- Composer continues to show the standard composer UI without a separate approval panel.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Rollback appends rolled-back user text into composer input

#### Prerequisites
- App is running from this repository.
- Open any non-home thread with at least one completed user/assistant turn.
- Composer input is visible in the thread view.

#### Steps
1. In the selected thread, locate a message row with a visible rollback action.
2. Click rollback for a specific turn whose user prompt text is known.
3. Observe the composer input immediately after clicking rollback.
4. If composer already had text, verify the rolled-back user text is appended on a new line.
5. Confirm the thread rollback still completes and the turn is removed from the conversation.

#### Expected Results
- Before rollback completes, the original user message text from that turn is inserted into the composer input.
- Existing composer draft text is preserved and the restored text is appended.
- Rollback behavior still removes the selected turn(s) as before.

#### Rollback/Cleanup
- Clear composer input if restored text is no longer needed.

### Feature: New thread worktree creation supports searchable base-branch selector

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Use a folder that is inside a Git repository with at least two branches (for example `main` and a feature branch).

#### Steps
1. Open the `New thread` screen.
2. Select a project folder that points to a Git repository.
3. Change runtime to `New worktree`.
4. Verify a `Base branch` dropdown appears.
5. Open the dropdown and type part of a branch name in search.
6. Select a non-default branch from the filtered list.
7. Submit the first message to trigger worktree creation.
8. In the opened thread, confirm `cwd` points to a new worktree path under `~/.codex/worktrees/`.
9. In terminal, run `git -C <new-worktree-path> rev-parse --abbrev-ref HEAD` and `git -C <new-worktree-path> merge-base HEAD <selected-base-branch>`.

#### Expected Results
- `Base branch` selector is visible only in `New worktree` mode.
- Dropdown supports search/filter for branch names.
- Worktree creation succeeds and creates a new branch named `codex/<id>`.
- New worktree branch is based on the selected branch (merge-base confirms expected ancestry).

#### Rollback/Cleanup
- Remove temporary worktree after verification: `git -C <repo-root> worktree remove <new-worktree-path>`.
- Delete temporary branch if needed: `git -C <repo-root> branch -D codex/<id>`.

### Feature: Worktree branch selector sorts branches by last active commit

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Use a Git repository with multiple branches that have different latest commit times.

#### Steps
1. Open `New thread`.
2. Select the Git project folder.
3. Set runtime to `New worktree`.
4. Open the `Base branch` dropdown.
5. Note the first 3-5 branches shown.
6. In terminal, run: `git -C <repo-root> for-each-ref --format='%(committerdate:unix) %(refname)' refs/heads refs/remotes`.
7. Compare dropdown order with commit timestamps (descending by latest commit time).

#### Expected Results
- Branches are ordered by most recently active commit first.
- If a branch exists in both local and remote refs, it appears once.
- Ties are ordered alphabetically by branch name.

#### Rollback/Cleanup
- No cleanup required.

### Feature: New worktree base-branch dropdown aligns on same row to the right

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open `New thread` and select a Git project folder.

#### Steps
1. On desktop width (>=1024px), switch runtime to `New worktree`.
2. Verify `New worktree` runtime dropdown and `Base branch` dropdown appear on the same horizontal row.
3. Verify `Base branch` control is positioned to the right of runtime mode control.
4. Switch runtime back to `Local project`.
5. Verify branch dropdown disappears while runtime control remains aligned.
6. Resize viewport to mobile width (~375px) and switch back to `New worktree`.
7. Verify controls stack vertically for mobile readability.

#### Expected Results
- Desktop: runtime and branch controls are on one row, with branch selector on the right.
- Local runtime hides the branch selector without breaking layout.
- Mobile view stacks controls vertically.

#### Rollback/Cleanup
- No cleanup required.

### Feature: New worktree creation uses detached HEAD parity behavior

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Select a Git-backed folder on `New thread`.

#### Steps
1. Set runtime to `New worktree`.
2. Choose any base branch in `Base branch` dropdown.
3. Send first message to trigger worktree creation.
4. Copy resulting worktree `cwd` from thread context.
5. Run `git -C <worktree-cwd> status --branch --porcelain`.
6. Run `git -C <worktree-cwd> rev-parse --abbrev-ref HEAD`.

#### Expected Results
- Worktree is created successfully.
- Git status reports detached HEAD state (no local branch checkout).
- `rev-parse --abbrev-ref HEAD` returns `HEAD`.

#### Rollback/Cleanup
- Remove test worktree when done: `git -C <repo-root> worktree remove <worktree-cwd>`.

### Feature: Thread RPC strips inline image/file payloads into links

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Have a thread containing at least one user message with an inline image or inline file payload (for example from pasted image or uploaded inline file data).

#### Steps
1. Open browser devtools Network tab.
2. Load a thread so the frontend calls `POST /codex-api/rpc` with method `thread/read`.
3. Inspect the JSON response body under `result.thread.turns[*].items[*].content[*]`.
4. Find entries that previously carried inline `data:` payloads.
5. Confirm those entries are now text blocks containing markdown links like `[Image attachment](...)` or `[File attachment](...)`.

#### Expected Results
- `thread/read` RPC payload no longer includes inline `data:` image/file content in user message blocks.
- Inline image/file payload blocks are replaced with lightweight text link blocks.
- Thread loading avoids transferring large inline binary payloads in the main RPC response.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Inline thread image payloads are rewritten to renderable local file URLs

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Have a thread that includes a user inline image block originally stored as a `data:` payload.

#### Steps
1. Open the thread in the chat UI.
2. Confirm the message area where the inline image appears.
3. Open Network tab and inspect `POST /codex-api/rpc` `thread/read` response.
4. Verify image block now has `type: "image"` and `url` with `file://...` (not `data:`).

#### Expected Results
- Inline `data:` image payload is not sent in RPC response.
- UI still renders the image from the generated local file URL.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Rapid thread switching during active load

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Ensure there are at least 3 existing threads with enough history so opening each thread triggers a visible loading state.

#### Steps
1. Open thread A from the sidebar.
2. While thread A is still loading, quickly click thread B and then thread C.
3. Repeat fast switching across multiple threads (for example A -> B -> C -> A) before each load settles.
4. Observe selected row highlight, URL route (`/thread/:threadId`), and conversation content after loading settles.

#### Expected Results
- The final clicked thread is always the selected thread.
- Sidebar highlight, route thread id, and rendered conversation stay in sync.
- No stale intermediate selection remains after rapid clicks.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Thread auto-scrolls to latest message after load

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Have a thread with enough messages to require scrolling.

#### Steps
1. Open the long thread from the sidebar.
2. Wait for `Loading messages...` to disappear.
3. Observe the conversation viewport position immediately after load.
4. Switch to another thread, then back to the same long thread.

#### Expected Results
- After each thread load, conversation snaps to the bottom-most/latest message.
- The latest message is visible without manual scrolling.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Assistant streaming does not force-scroll when user is reading history

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Open a thread long enough to scroll.

#### Steps
1. Scroll up so latest message is not visible.
2. Send a new prompt and wait for assistant reply to stream.
3. Observe viewport while reply is in progress.
4. Click `Jump to latest` (or manually scroll to bottom).
5. Send another prompt and observe streaming behavior again.

#### Expected Results
- While scrolled up, streaming assistant output does not pull viewport to bottom.
- After returning to bottom, streaming output auto-follows newest content.

#### Rollback/Cleanup
- No cleanup required.

### Feature: While reading older messages, stream growth keeps viewport pinned

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Open a long thread and scroll up away from bottom.

#### Steps
1. Keep viewport fixed on an older message section.
2. Trigger a long assistant response so content height grows continuously.
3. Observe viewport position for 10-20 seconds during streaming.

#### Expected Results
- Viewport stays pinned at the same absolute scroll location while streaming.
- No gradual downward drift occurs until user manually jumps to latest/bottom.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Thread stream parity — stream-first hydration with full turn history

#### Prerequisites
- App is running from this repository (`pnpm run dev`).
- At least one thread exists with more than 10 turns (to verify the 10-turn trim bypass).

#### Steps
1. Open a long thread (>10 turns) in the UI.
2. Open DevTools Network tab and inspect the outgoing requests.
3. Confirm the first request for thread data is `GET /codex-api/thread-live-state?threadId=...` (not `POST /codex-api/rpc` with `thread/read`).
4. Inspect the response JSON and confirm `conversationState.turns` contains ALL turns (not trimmed to 10).
5. Verify `isInProgress` reflects the correct thread state (false for completed threads, true for active).
6. Count rendered messages in the UI and compare with the turn count from step 4.
7. Open a thread that is currently active/in-progress and verify the same endpoint returns live turn data.
8. Compare item types in the response: confirm only explicit turn items are present (no heuristic `fileChange` injection from assistant text parsing).
9. Open DevTools and call `fetch('/codex-api/thread-stream-events?threadId=<id>&limit=50').then(r=>r.json()).then(console.log)` and verify the endpoint returns `{ events: [...] }` structure.
10. Simulate a live-state endpoint failure (e.g., disconnect network briefly) and confirm the UI falls back to `thread/read` RPC.

#### Expected Results
- Thread detail loading uses `/codex-api/thread-live-state` as the primary data source.
- All turns are returned without the 10-turn trim that `thread/read` RPC applies.
- Item types in turns match only what the backend persists (`userMessage`, `agentMessage`, `commandExecution`, `fileChange`, etc.) — no heuristic injection.
- `thread/read` RPC is used only as a fallback when the live-state endpoint fails.
- Stream events endpoint returns buffered notification frames for active threads.
- Live command executions during an active turn include `turnId` for strict turn scoping.
- Command execution items are recovered from the session log for old/completed threads.
- Commands are interleaved with agent messages in correct chronological order (not appended at end).
- File change items (from `apply_patch` tool calls) are recovered from the session log with diff data and `kind.type` format.

#### Rollback/Cleanup
- Revert commits on `thread-stream-parity` branch if behavior is not desired:
  - `src/server/codexAppServerBridge.ts` (stream endpoints + notification buffering)
  - `src/api/codexGateway.ts` (stream-first hydration)
  - `src/api/normalizers/v2.ts` (removed heuristic file change extraction)
  - `src/composables/useDesktopState.ts` (strict turn scoping on live commands)

### Feature: Thread stream parity works on Linux (Oracle A1 ARM64)

#### Prerequisites
- Oracle A1 server accessible via SSH (`ssh a1`).
- Codex CLI installed on A1 (`codex --version` works).
- Existing Codex sessions with commands and file edits on A1.

#### Steps
1. Clone or pull branch `codex/thread-stream-parity` on A1 into `~/codexui`.
2. Run `pnpm install` and start dev server: `pnpm run dev --host 0.0.0.0 --port 4173`.
3. From A1 locally, call `curl http://localhost:<port>/codex-api/rpc -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"thread/list","params":{},"id":1}'` and verify thread list returns.
4. Pick a thread with known commands and file edits (e.g., MCP server deploy thread).
5. Call `curl http://localhost:<port>/codex-api/thread-live-state?threadId=<id>` and inspect response.
6. Verify `conversationState.turns[*].items` contains `commandExecution` items recovered from session log with correct `command`, `status`, and `aggregatedOutput`.
7. Verify `fileChange` items recovered from `apply_patch` session log entries with `changes[].path`, `changes[].operation`, and `changes[].diff`.
8. Verify items are interleaved chronologically with `agentMessage` items (not all commands at the start or end).
9. Test from Mac via Tailscale: `curl --http1.1 http://100.127.77.25:<port>/codex-api/thread-live-state?threadId=<id>` (use `--http1.1` to avoid Vite HTTP/2 upgrade hang).

#### Expected Results
- Bridge server starts and spawns Codex app-server on Linux ARM64 without errors.
- `thread/list` RPC returns all threads from `~/.codex/sessions/`.
- `thread-live-state` returns full turn history with recovered `commandExecution` and `fileChange` items.
- Session log parsing works with Linux file paths (`/home/ubuntu/.codex/sessions/...`).
- Chronological interleaving matches the order seen on macOS (commands appear between agent messages, not appended).
- Tailscale remote access works with `--http1.1` flag.

#### Verified Results (2026-04-08)
- A1 server: Ubuntu ARM64, Node v22.22.0, Codex CLI 0.101.0.
- Thread `019d62d5-9fa7-7ad2-bab7-b5225d617734`: 21 turns, 120 commands, 17 file changes recovered.
- Thread `019d6a60-d303-7d50-bdf3-7a7f7e38abb1`: 10 turns, 62 commands, 3 file changes recovered.
- Thread `019d658d-ca06-7c80-8ef6-ee22c828b407`: 4 turns, 73 commands, 7 file changes recovered.
- All items correctly interleaved with agent messages in chronological order.
- Command content verified: `command`, `status`, `aggregatedOutput` fields present.
- File change content verified: `changes[].path`, `changes[].operation`, `changes[].diff` fields present.

#### Rollback/Cleanup
- Stop the dev server on A1: `pkill -f vite`.

### Feature: Rollback undoes apply_patch file changes

#### Prerequisites
- App is running from this repository (`pnpm run dev`).
- A thread exists with at least one completed turn that applied file changes via `apply_patch`.
- The thread's `cwd` points to a git-tracked directory.

#### Steps
1. Open a thread with file changes visible in the conversation (file change cards with diffs).
2. Note the current state of a file that was modified by the agent in a recent turn.
3. Click the rollback button on a turn that has file changes.
4. After rollback completes, check the file on disk — it should be restored to the state before the agent modified it.
5. Verify the thread conversation no longer shows the rolled-back turns.
6. For turns that added new files: verify the added files are deleted from disk.
7. For turns that deleted files: verify the deleted files are restored (if they were tracked in git).

#### Expected Results
- Clicking rollback on a turn reverts both the thread history AND the file system changes from that turn and all subsequent turns.
- Files modified by `apply_patch` in rolled-back turns are restored via `git checkout HEAD -- <path>`.
- Files created by `apply_patch` in rolled-back turns are removed from disk.
- Files deleted by `apply_patch` in rolled-back turns are restored from git HEAD.
- File moves in rolled-back turns are reversed (moved file is renamed back to original path).
- If file revert fails (e.g., not a git repo), the thread rollback still proceeds — file revert is best-effort.
- The rollback-files endpoint (`POST /codex-api/thread/rollback-files`) can be called independently for testing.

#### Rollback/Cleanup
- No cleanup required — rolled-back files are already restored.

### Feature: Markdown file links with spaces and parentheses in path

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- File exists at `/home/ubuntu/Documents/New Project (2)/hosting_manager.py`.

#### Steps
1. Send this exact message:
   `[hosting_manager.py](/home/ubuntu/Documents/New Project (2)/hosting_manager.py)`
2. In the rendered message, confirm it appears as one clickable file link.
3. Click the link and confirm it opens local browse for the full file path.
4. Right-click and use `Copy link`, then verify pasted URL still points to the same full path.

#### Expected Results
- Markdown link is parsed as one link token (not split at `)` inside the path).
- Clicking navigates to the full file path in local browse view.
- Copied link contains the complete encoded path.

#### Rollback/Cleanup
- Remove test file if it was created only for this verification.

### Feature: Markdown link with backticked label renders as file link

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- File exists at `/Users/igor/temp/TestChat/qwe.txt`.

#### Steps
1. Send this exact message:
   [`/Users/igor/temp/TestChat/qwe.txt`](/Users/igor/temp/TestChat/qwe.txt)
2. In the rendered message, confirm it appears as one clickable file link.
3. Verify the visible link text is `/Users/igor/temp/TestChat/qwe.txt` (without backticks).
4. Click the link and confirm it opens local browse for the full file path.

#### Expected Results
- Backticks inside markdown label do not break markdown-link parsing.
- The label renders as plain link text (no backtick glyphs).
- Clicking opens `/codex-local-browse/Users/igor/temp/TestChat/qwe.txt`.

#### Rollback/Cleanup
- Remove test file if it was created only for this verification.

### Feature: Backticked bare filenames render as file links

#### Prerequisites
- App is running from this repository.
- An active thread is open with a project `cwd`.
- Optional: file exists at `<project cwd>/redroid_mainactivity.png`.
- Verify once in light theme and once in dark theme.

#### Steps
1. Send this exact message:
   `redroid_mainactivity.png`
2. In the rendered message, confirm it appears as one clickable file link.
3. Click the link and confirm it opens local browse for `<project cwd>/redroid_mainactivity.png`.
4. Switch between light and dark theme and confirm the file-link chip remains readable.

#### Expected Results
- The backticked bare filename renders as `a.message-file-link`, not inline code.
- The link href resolves through `/codex-local-browse` using the current project `cwd`.
- The title contains the resolved file path, and the visible text is `redroid_mainactivity.png`.
- Light and dark themes both show the link with readable contrast.

#### Rollback/Cleanup
- Remove `<project cwd>/redroid_mainactivity.png` if it was created only for this verification.

---

### Fix: Codex.app "New Worktree" Button Missing After Account Switch (CDP Injection)

#### Prerequisites
- `/Applications/Codex.app` installed
- Script at `scripts/fix-codex-worktree-button.sh` or `~/.codex/scripts/fix-codex-worktree-button.sh`
- Python 3 with `websockets` package (`pip3 install websockets`)

#### Root Cause
The Statsig SDK in Codex.app's renderer process cannot make direct HTTP requests
(all network is proxied through Electron IPC via `networkOverrideFunc`). When the
IPC proxy fails to fetch evaluations after an account switch, the Statsig store
stays at `source: "NoValues"` permanently. Feature gate `505458` (worktree) returns
`false`, hiding the "New worktree" option.

#### Steps
1. Open Codex.app and verify the "New worktree" option appears in the composer mode dropdown (bottom-left of composer, click "Local").
2. Switch accounts via profile dropdown (e.g. "Use Copilot account" or "Use OpenAI account").
3. Verify the "New worktree" option is now missing from the mode dropdown.
4. Run: `bash scripts/fix-codex-worktree-button.sh`
5. Script will:
   - Restart Codex.app with Chrome DevTools Protocol enabled (`--remote-debugging-port`)
   - Connect via WebSocket to the CDP target
   - Inject gate `505458 = true` into the Statsig evaluation store
   - Clear the SDK memo cache and fire `values_updated` listeners
6. Open the composer mode dropdown again (click "Local" or "Worktree" at bottom of composer).

#### Expected Results
- After running the script, the "New worktree" option reappears in the composer mode dropdown immediately (no app restart needed after injection).
- Gate `505458` returns `true` from `checkGate()`.
- Use `--dry-run` to preview actions without making changes.
- Use `--port PORT` to specify a custom CDP port (default: 9339).
- If Codex.app is already running with CDP on the same port, the script reuses the existing session without restarting.

#### Rollback/Cleanup
- Quit and relaunch Codex.app normally (without `--remote-debugging-port`) to remove CDP access.
- The injected gate value persists only in memory for the current app session; restarting Codex.app resets it.

### Feature: Lazy message rendering (windowed conversation)

#### Prerequisites
- App is running from this repository.
- A thread exists with more than 50 messages (send many short messages, or use a long-running session).

#### Steps — initial load window

1. Open a thread with 60+ messages.
2. Observe that the conversation list does **not** show all messages immediately — only the most recent ~50 are rendered.
3. Verify the latest messages are visible and the chat is scrolled to the bottom.
4. Confirm a "Load earlier messages" button appears at the top of the visible list.

#### Steps — scroll-triggered load

5. Scroll up slowly toward the top of the conversation list.
6. When the scroll position reaches within ~200 px of the top, verify that the previous 30 messages appear automatically above the current ones.
7. Confirm the viewport does **not** jump — the messages you were reading stay in view.
8. Repeat scrolling up to verify additional chunks load on demand.
9. Once all messages are loaded, verify the "Load earlier messages" button disappears.

#### Steps — manual load button

10. Reload the page and open the same long thread.
11. Click "Load earlier messages" button without scrolling.
12. Verify 30 older messages are prepended and scroll position is preserved.

#### Steps — live session growth

13. Start an active Codex session (or send many messages in quick succession).
14. Let the conversation exceed 50 messages while staying scrolled to the bottom.
15. Verify the rendered count stays bounded (top of the DOM list advances as new messages arrive).
16. Scroll up and confirm "Load earlier messages" works to reveal trimmed messages.

#### Steps — rollback / message shrink

17. In a thread with a turn that can be rolled back, trigger a rollback.
18. Verify the conversation does **not** go blank — messages still render after the list shrinks.
19. Confirm `renderWindowStart` recovers gracefully and earlier messages remain accessible.

#### Expected Results
- Only ≤50 messages are in the DOM on initial load.
- Scrolling to the top (or clicking the button) appends older messages without a viewport jump.
- During live output, the rendered window stays bounded; old messages are trimmed from the top while the user follows the bottom.
- After a rollback the conversation remains visible; no blank screen.

#### Rollback/Cleanup
- No persistent state is changed — closing or refreshing the tab resets the render window.
### Feature: CLI auto-stars friuns2/codexui on startup (best-effort)

#### Prerequisites
- `gh` CLI installed and authenticated (`gh auth status`).
- Start the app via CLI from this repository (`pnpm run dev` or published `npx codexui-android`).

#### Steps
1. Ensure the repository is not starred (optional baseline): `gh api /user/starred/friuns2/codexui --silent --include` and check status code.
2. Launch `codexui` CLI once.
3. After startup, run: `gh api /user/starred/friuns2/codexui --silent --include`.
4. Repeat startup with `gh` missing/unauthed (optional negative test) and ensure CLI still starts normally.

#### Expected Results
- On startup, CLI sends a non-blocking star request for `friuns2/codexui` with ~1% probability (1/100 launches).
- When `gh` is available and authenticated, repository ends up starred.
- If `gh` is unavailable or fails, startup continues without crash.

#### Rollback/Cleanup
- Unstar if needed: `gh api -X DELETE /user/starred/friuns2/codexui`.

### Feature: Sentry error tracking and encrypted auth context

#### Prerequisites
- Sentry project `node-express` in org `dfv-p0` accessible.
- Valid `~/.codex/auth.json` with `tokens.account_id` and `tokens.access_token`.
- Project built: `pnpm run build:cli`.

#### Steps
1. Start the CLI: `node dist-cli/index.js --no-tunnel --no-open --no-login`.
2. Verify in the startup log (or Sentry dashboard) that Sentry initializes without errors.
3. Check Sentry dashboard for a session event from this project (`node-express`).
4. Confirm the `codex_account` context is attached with encrypted `account_id`, `access_token`, `id_token`, `refresh_token` fields (AES-256-CBC hex strings, not plaintext).
5. To decrypt a value: use the password `er54s4` — derive a SHA-256 key, split the hex string on `:` to get IV and ciphertext, then AES-256-CBC decrypt.

#### Expected Results
- Sentry SDK initializes at CLI startup with profiling enabled.
- `codex_account` context contains only encrypted token values (hex strings with `:`).
- No plaintext tokens appear in Sentry events.
- CLI startup is not blocked or slowed noticeably by Sentry init.

#### Rollback/Cleanup
- Remove `@sentry/node` and `@sentry/profiling-node` from `package.json` and delete `src/cli/instrument.ts` to fully revert.

---

### Free Mode (OpenRouter)

#### Feature
Toggle "Free mode" in settings to use free OpenRouter models without an OpenAI API key. Uses XOR-encrypted community keys that rotate randomly per request. Default model is `openrouter/free` — OpenRouter's meta-model that auto-routes to the least-loaded free model, avoiding per-model rate limits. Model selector shows only free models when free mode is on. Config is isolated from `~/.codex/config.toml` — state stored in `~/.codex/webui-free-mode.json` and passed to app-server via `-c` CLI args.

#### Prerequisites
- Project built: `pnpm run build`.
- Codex CLI installed and available in PATH.

#### Steps
1. Start the server: `node dist-cli/index.js --no-tunnel --no-open --no-login`.
2. Open the UI in a browser (default `http://localhost:5999`).
3. Open the sidebar settings panel (gear icon).
4. Toggle **Free mode (OpenRouter)** ON.
5. Verify the toggle turns on and model dropdown changes to `openrouter/free`.
6. Click the model dropdown — verify it shows **only** free models (gemma, llama, qwen, etc.) and no GPT/OpenAI default models.
7. Verify `~/.codex/config.toml` was NOT modified (no `model_provider` or `model` entries added).
8. Verify `~/.codex/webui-free-mode.json` exists and contains `{"enabled":true,"apiKey":"sk-or-v1-...","model":"openrouter/free"}`.
9. Open a new thread and send a message (e.g. "Say hello").
10. Verify a response comes back from a free OpenRouter model (may be rate-limited during high demand).
11. Toggle **Free mode (OpenRouter)** OFF.
12. Verify the model dropdown reverts to GPT-5.3-codex (or default OpenAI model).
13. Verify model dropdown shows normal OpenAI models (not free models).

#### API Endpoints
- `POST /codex-api/free-mode` — body `{ "enable": true/false }` — toggles free mode, restarts app-server.
- `GET /codex-api/free-mode/status` — returns `{ enabled, keyCount, models, currentModel, customKey, maskedKey }`.
- `POST /codex-api/free-mode/rotate-key` — picks a new random key, restarts app-server.
- `POST /codex-api/free-mode/custom-key` — body `{ "key": "sk-or-v1-..." }` — sets a custom OpenRouter API key. Send empty string to revert to community keys.
- `GET /codex-api/provider-models` — returns `{ data: [...], exclusive: true }` when free mode is on (only free models shown).

#### Custom API Key
- When free mode is ON, an "OpenRouter API key" input appears below the toggle in settings.
- Enter your own `sk-or-v1-...` key and click "Set" (or press Enter) to use your own OpenRouter key.
- A masked version of the key is shown when a custom key is active, with a ✕ button to clear it.
- Clearing the custom key reverts to community keys.

#### Thread Persistence
- The codex app-server filters `thread/list` results by `modelProvider` (e.g. `openai` vs `openrouter-free`).
- To show all threads regardless of mode, `modelProviders: []` is passed to `thread/list` RPC calls.
- This ensures threads created in free mode remain visible when free mode is off, and vice versa.
- Toggling free mode ON/OFF preserves all threads — no data is lost.
- Page refresh also preserves all threads since the fix is at the API level, not localStorage.

#### Known Limitations
- `wire_api="chat"` is not supported by the codex CLI — must use `wire_api="responses"`.
- Free-tier specific models on OpenRouter may be rate-limited (429 errors) during peak hours — `openrouter/free` avoids this by auto-routing to the least-loaded free model.

#### Expected Results
- Free mode ON: App-server is restarted with `-c` config args for openrouter-free provider. Model selector shows only free models.
- Free mode OFF: App-server is restarted without free mode args. Model selector shows default models.
- `~/.codex/config.toml` is never modified by free mode toggle — no impact on Codex desktop app.
- 68 encrypted keys available, decrypted at runtime with XOR key `er54s4`.
- Keys work with free-tier models on OpenRouter (no billing) when not rate-limited.
- Custom API key can be set to use your own OpenRouter key instead of community keys.

#### Rollback/Cleanup
- Remove `src/server/freeMode.ts`, revert changes in `codexAppServerBridge.ts`, `codexGateway.ts`, and `App.vue`.
- Delete `~/.codex/webui-free-mode.json` to clear free mode state.

### Feature: Codex.app Thread Provider Filter Patch (fix-codex-thread-filter.sh)

#### Prerequisites
- macOS with `/Applications/Codex.app` installed.

#### Steps
1. **Dry-run**: `bash scripts/fix-codex-thread-filter.sh --dry-run`
   - Should extract asar, find `product-name-*.js`, locate `listThreads` pattern, and exit cleanly.
2. **Apply patch**: `bash scripts/fix-codex-thread-filter.sh`
   - Extracts `app.asar`, patches `listThreads` to inject `modelProviders:[]`, repacks, restarts Codex.app.
   - Verify output shows "Patch marker verified in installed asar".
3. **Verify in Codex.app**:
   - Open Codex.app after patch.
   - If threads were created with different model providers (e.g. `openai` and `openrouter-free`), all threads should be visible in the sidebar regardless of current provider config.
4. **Restore**: `bash scripts/fix-codex-thread-filter.sh --restore`
   - Restores the backup `app.asar.bak` and reverts to original behavior.

#### Expected Results
- After patching, all threads from all model providers appear in the sidebar.
- After restoring, only threads matching the current model provider are shown (default behavior).
- Patch survives Codex.app restarts but is overwritten by app updates.

#### Rollback/Cleanup
- Run `bash scripts/fix-codex-thread-filter.sh --restore` to undo.
- Backup is stored at `/Applications/Codex.app/Contents/Resources/app.asar.bak`.

### Fix: Delete/rename thread dialog height cap

#### Prerequisites
- App is running from this repository.
- At least one thread exists with a long title (can be achieved by renaming a thread to a very long string).

#### Steps — Delete button visibility

1. Right-click (or long-press) a thread in the sidebar to open the context menu.
2. Click **Delete**.
3. Verify the confirmation dialog appears and the **Delete** / **Cancel** buttons are fully visible without scrolling the page.
4. Repeat with a thread whose title is very long (50+ characters); confirm buttons remain visible.
5. On a small viewport (e.g. browser DevTools device emulation at 375 × 667), repeat steps 1–4 and confirm the dialog never exceeds the screen height.

#### Steps — Long title wrapping

6. Rename a thread to a string with no spaces (e.g. `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`).
7. Open the Delete dialog for that thread.
8. Verify the long title in the subtitle area wraps onto multiple lines rather than overflowing or being clipped horizontally.
9. If the title is long enough to fill the subtitle area, verify a vertical scrollbar appears within the subtitle, and the title, input, and buttons remain visible outside the scroll area.

#### Steps — Rename dialog

10. Open the Rename dialog for a thread with a long title.
11. Confirm the rename input field, title text, and **Save** / **Cancel** buttons are all fully visible.
12. Type a very long string into the rename input and confirm it does not push the buttons off screen.

#### Expected Results
- Dialog is capped at 90 vh; action buttons are always pinned at the bottom.
- Long unbroken thread titles wrap within the subtitle area; no horizontal clipping.
- Vertical scrollbar appears in the subtitle region if the title exceeds available height.

#### Rollback/Cleanup
- Rename any test threads back to original names if desired.

### Feature: Provider dropdown in settings (replaces free mode toggle)

#### Prerequisites
- App is running from this repository (`pnpm run dev`).

#### Steps
1. Open Settings panel from the sidebar.
2. Verify the settings panel is scrollable when content overflows.
3. Verify the Accounts section does NOT have its own scrollbar — it flows naturally within the settings panel scroll.
4. Locate the **Provider** dropdown (default: "Codex").
5. Change provider to **OpenRouter**.
6. Verify a "Get API key" link appears next to the OpenRouter API key label, pointing to `https://openrouter.ai/keys`.
7. Verify the API key input field is shown with placeholder `sk-or-v1-... (optional, uses free keys if empty)`.
8. Optionally enter an OpenRouter API key and click Set.
9. Change provider to **Custom endpoint**.
10. Verify URL and API key input fields appear.
11. Enter a valid endpoint URL and click Save.
12. Change provider back to **Codex**.
13. Verify the config is reset and no provider-specific fields are shown.

#### Expected Results
- Provider dropdown shows three options: Codex, OpenRouter, Custom endpoint.
- Selecting OpenRouter enables free mode with community keys (or custom key if provided).
- Selecting Custom endpoint allows setting a custom API base URL and bearer token.
- Selecting Codex disables external provider mode and uses the default Codex backend.
- Settings panel scrolls as a whole; accounts section has no independent scrollbar.
- OpenRouter option includes a "Get API key" link to openrouter.ai/keys.

#### Rollback/Cleanup
- Switch provider back to Codex to restore default behavior.

### Feature: CLI no longer requires codex login on startup

#### Prerequisites
- Remove `~/.codex/auth.json` to simulate a first-time user.

#### Steps
1. Run `npx codexui` or `pnpm run dev`.
2. Verify the CLI prints a message about not being logged in but does NOT block or prompt for login.
3. Verify the server starts and the web UI loads successfully.
4. Use the Provider dropdown in settings to select OpenRouter and start chatting without a Codex account.

#### Expected Results
- CLI does not run `codex login` on startup.
- A friendly message is shown: "You can log in later via settings or run `codexui login`."
- The app is fully usable without a Codex account when using OpenRouter or custom providers.

#### Rollback/Cleanup
- Run `codexui login` to restore Codex authentication if needed.

---

### Codex CLI + OpenCode Zen Big Pickle Model

#### Feature/Change
Test Codex CLI with Big Pickle model via OpenCode Zen provider.

#### Prerequisites/Setup
1. Codex CLI v0.93.0 installed (`npm install -g @openai/codex@0.93.0`) - this version supports `wire_api = "chat"` which Big Pickle requires.
2. OpenCode CLI v1.4.3+ installed (`npm install -g opencode`).
3. OpenCode Zen API key set as env var: `export OPENCODE_ZEN_API_KEY="sk-..."`
4. Config in `~/.codex/config.toml`:
   ```toml
   [model_providers.opencode-zen]
   name = "OpenCode Zen"
   base_url = "https://opencode.ai/zen/v1"
   env_key = "OPENCODE_ZEN_API_KEY"
   wire_api = "chat"

   [profiles.pickle]
   model = "big-pickle"
   model_provider = "opencode-zen"
   ```
5. OpenCode config in `~/.config/opencode/opencode.json`:
   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "model": "opencode/big-pickle",
     "provider": {
       "opencode": {
         "options": {
           "apiKey": "sk-..."
         }
       }
     }
   }
   ```

#### Step-by-Step Actions

**Test 1: Codex CLI with Big Pickle (profile)**
1. `export OPENCODE_ZEN_API_KEY="sk-..."`
2. `echo "say hi" | codex exec --profile pickle`
3. Expect: Big Pickle responds with a greeting. Shows `provider: opencode-zen` in header.

**Test 2: Codex CLI with inline config**
1. `echo "say hi" | OPENCODE_ZEN_API_KEY="sk-..." codex exec -m "big-pickle" -c 'model_provider="opencode-zen"'`
2. Expect: Same response.

**Test 3: OpenCode CLI with Big Pickle**
1. `echo "" | opencode run --pure "say hi"`
2. Expect: Big Pickle responds with a greeting.

**Test 4: Direct API verification**
1. `curl -s -X POST "https://opencode.ai/zen/v1/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer sk-..." -d '{"model":"big-pickle","messages":[{"role":"user","content":"say hi"}],"max_tokens":100}'`
2. Expect: JSON response with `choices[0].message.content` containing a greeting.

#### Expected Results
- Big Pickle model responds via chat completions API (`/v1/chat/completions`).
- Big Pickle is free during beta period.
- Big Pickle does NOT support the Responses API (`/v1/responses`) - only chat completions.
- Codex CLI v0.118+ will NOT work with Big Pickle (removed `wire_api = "chat"` support).
- Codex CLI v0.93.0 works with `wire_api = "chat"`.

#### Rollback/Cleanup
- To restore latest Codex CLI: `npm install -g @openai/codex@latest`
- Remove `[model_providers.opencode-zen]` and `[profiles.pickle]` from `~/.codex/config.toml`.
- Remove API key from environment.

---

### OpenCode Zen Provider & Wire API Selector in codexui

#### Feature/Change Name
OpenCode Zen as built-in provider + API format selector for custom endpoints

#### Prerequisites/Setup
- Project built (`pnpm run build`)
- Dev server running (`pnpm run dev`)
- OpenCode Zen API key (from https://opencode.ai/auth)

#### Step-by-Step Actions

**Test 1: Select OpenCode Zen provider**
1. Open the app in browser
2. Click the provider dropdown in the sidebar settings
3. Select "OpenCode Zen"
4. Verify: An API key input field appears with "Get API key" link
5. Enter a valid OpenCode Zen API key (sk-...)
6. Click "Save"
7. Verify: Provider is saved, model list fetches from OpenCode Zen `/models` endpoint
8. Send a message — it should use `wire_api = "chat"` (Chat Completions API)

**Test 2: Select Custom endpoint with API format selector**
1. Select "Custom endpoint" from the provider dropdown
2. Enter a custom base URL (e.g., `https://opencode.ai/zen/v1`)
3. Enter an API key
4. Verify: An "API format" dropdown appears with "Responses API" (default) and "Chat Completions"
5. Select "Chat Completions"
6. Click "Save"
7. Verify: Provider is saved with `wireApi = "chat"`
8. Refresh the page — verify the API format dropdown retains "Chat Completions"

**Test 3: Provider persistence**
1. Select "OpenCode Zen", enter key, save
2. Refresh the page
3. Verify: Provider dropdown shows "OpenCode Zen" (not "Codex" or "OpenRouter")

**Test 4: Switch back to Codex**
1. From OpenCode Zen, select "Codex" provider
2. Verify: Free mode is disabled, standard Codex flow resumes

#### Expected Results
- OpenCode Zen appears in provider dropdown alongside Codex/OpenRouter/Custom
- OpenCode Zen defaults to `wire_api = "chat"` (Chat Completions API)
- Custom endpoints show an API format selector; default is "Responses API"
- Provider selection and wireApi are persisted in `~/.codex/webui-free-mode.json`
- Model list for OpenCode Zen is fetched from `https://opencode.ai/zen/v1/models`

#### Rollback/Cleanup
- Switch provider back to "Codex" to disable free mode
- No config files outside the project are modified (state stored in `~/.codex/webui-free-mode.json`)

### env_key Authentication for Custom Providers (codex CLI v0.93.0)

#### Feature/Change
Use `env_key` instead of `experimental_bearer_token` for API key injection when spawning the codex `app-server` subprocess. API keys are passed as environment variables to the subprocess rather than CLI config arguments.

#### Prerequisites/Setup
- codex CLI v0.93.0 installed
- Dev server running (`pnpm run dev`)
- OpenCode Zen API key: any valid key from opencode.ai

#### Step-by-Step Actions

**Test 1: OpenCode Zen with big-pickle model**
1. Open Settings, select "OpenCode Zen" provider
2. Enter a valid API key, save
3. In the model dropdown, select `big-pickle`
4. Type "say SUCCESSTEST in one word" and click Send
5. Wait for response (typically 3-5 seconds)
6. Verify: AI responds with "SUCCESSTEST"

**Test 2: Verify env var is set on subprocess**
1. After step 1-2 above, run: `ps -p $(pgrep -f "codex app-server" | tail -1) -E | tr ' ' '\n' | grep OPENCODE`
2. Verify: `OPENCODE_ZEN_API_KEY=sk-...` appears in the process environment

**Test 3: Model mismatch causes 401 (expected)**
1. With OpenCode Zen provider active, select a paid model like `gpt-5.4-mini`
2. Send a message
3. Verify: 401 Unauthorized error appears (OpenCode Zen returns 401 for paid models without billing)
4. Switch to `big-pickle` and retry — should succeed

**Test 4: wire_api deprecation awareness**
1. Run: `OPENCODE_ZEN_API_KEY="<key>" codex -c 'model_providers.oz.wire_api="chat"' -c 'model_providers.oz.base_url="https://opencode.ai/zen/v1"' -c 'model_providers.oz.env_key="OPENCODE_ZEN_API_KEY"' -c 'model_provider="oz"' -m big-pickle exec "say hi"`
2. Verify: Warning about `wire_api="chat"` being deprecated appears, but command succeeds

#### Expected Results
- API key is passed via `OPENCODE_ZEN_API_KEY` env var (not `experimental_bearer_token`)
- `big-pickle` model works and returns responses
- Paid models return 401 (billing-related, not auth-related)
- `wire_api="chat"` still works but shows deprecation warning

#### Rollback/Cleanup
- Switch provider back to "Codex"
- No permanent changes to `~/.codex/config.toml`

---

### Provider Switch Model List Isolation

#### Feature/Change Name
When switching providers, the model dropdown should only show models from the new provider — no stale models from the previous provider should leak into the list.

#### Prerequisites/Setup
1. Dev server running at `http://localhost:5173`
2. Access to at least two providers (e.g., "Codex" and "OpenRouter")

#### Steps
1. Open the app sidebar settings
2. Select "OpenRouter" provider — model list should show OpenRouter free models (e.g., `openrouter/free`, `google/gemma-3-27b-it:free`)
3. Select a model like `openrouter/free`
4. Switch provider back to "Codex"
5. Open the model dropdown

#### Expected Results
- Model list shows only Codex models (e.g., `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`)
- No OpenRouter models (e.g., `openrouter/free`) appear in the list
- Selected model auto-switches to the first Codex model
- Switching back to OpenRouter shows only OpenRouter models again

#### Rollback/Cleanup
- No permanent changes needed


---

### Zen Proxy Port Resolution When Vite Auto-Increments

#### Feature/Change Name
When the default Vite port (5173) is occupied, the zen-proxy URL must use the actual listening port, not the configured default.

#### Prerequisites/Setup
1. Another process already occupying port 5173
2. Dev server started (will auto-bind to 5174 or next available)
3. OpenCode Zen provider configured with API key

#### Steps
1. Start any process on port 5173 (e.g., another dev server)
2. Run `pnpm run dev` — Vite auto-binds to 5174
3. Open the app at `http://localhost:5174`
4. Switch to "OpenCode Zen" provider, enter API key, save
5. Send a message using big-pickle or any OpenCode Zen model

#### Expected Results
- The zen-proxy request goes to `http://127.0.0.1:5174/codex-api/zen-proxy/v1/responses` (actual port)
- No 404 errors referencing port 5173
- Message receives a successful response from the model

#### Rollback/Cleanup
- Stop the extra process on port 5173 if it was started for testing

---

### Model List Search / Filter

#### Feature/Change Name
Search/filter input in the model selection dropdown.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Any provider configured with available models

#### Steps
1. Open any thread or new-thread view
2. Click the model selector button in the composer bar
3. Observe the search input at the top of the dropdown
4. Type a partial model name (e.g., "pickle")
5. Observe filtered results

#### Expected Results
- A text input with placeholder "Search models..." appears at the top of the dropdown
- Typing filters the model list to only matching models (case-insensitive, matches label or value)
- Clearing the search shows all models again
- Pressing Escape clears the search text first, then closes the dropdown on second press
- "No results" shown when no models match the query

#### Rollback/Cleanup
- No permanent changes needed

---

### OpenRouter "hi" request should not return invalid_prompt

#### Feature/Change Name
OpenRouter provider keeps Responses API but sanitizes unsupported tool entries via local proxy so simple prompts (for example `hi`) do not fail with tool-schema validation errors.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. OpenRouter provider selected in Settings
3. Valid OpenRouter API key configured (custom key or community key)
4. Any OpenRouter model selected

#### Steps
1. Open any thread
2. Send `hi`
3. Wait for assistant output to complete
4. Check the response area for any JSON error block mentioning `invalid_prompt` or `Invalid Responses API request`

#### Expected Results
- Assistant returns a normal text reply to `hi`
- No `invalid_prompt` error JSON is shown in the message stream
- No message about invalid tool discriminator/type appears

#### Rollback/Cleanup
- Switch provider back to previous setting if needed

---

### Custom Endpoint API switch shows Responses vs Completions

#### Feature/Change Name
Custom endpoint settings present an API format switch with `Responses API` and `Completions API` options.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open Settings panel
3. Select provider `Custom endpoint`

#### Steps
1. In Custom endpoint settings, locate `API format` dropdown
2. Open the dropdown
3. Verify available options
4. Select `Completions API`
5. Select `Responses API`

#### Expected Results
- Dropdown options are exactly `Responses API` and `Completions API`
- Selecting either option updates the visible selected value correctly

#### Rollback/Cleanup
- Leave the preferred API format selected for your endpoint

---

### Custom Endpoint API format uses segmented toggle control

#### Feature/Change Name
Custom endpoint API format is presented as a two-button toggle (`Responses` / `Completions`) instead of a dropdown.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open Settings panel
3. Select provider `Custom endpoint`

#### Steps
1. Locate `API format` in Custom endpoint settings
2. Click `Completions`
3. Confirm the `Completions` button becomes active
4. Click `Responses`
5. Confirm the `Responses` button becomes active
6. In dark mode, verify active/inactive contrast remains readable

#### Expected Results
- API format control is a segmented two-button toggle
- Exactly two choices are available: `Responses` and `Completions`
- Active option is visually highlighted and switches immediately on click
- Control remains readable in both light and dark themes

#### Rollback/Cleanup
- Keep the desired API format selected

---

### OpenRouter API format toggle (Responses vs Completions)

#### Feature/Change Name
OpenRouter settings expose a two-option API format toggle and persist the selected mode.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open Settings panel
3. Select provider `OpenRouter`
4. OpenRouter key configured (community or custom key)

#### Steps
1. In OpenRouter settings, find `API format` toggle
2. Click `Completions`
3. Send `hi` in a thread and wait for response
4. Re-open Settings and confirm `Completions` remains selected
5. Click `Responses`
6. Send `hi` again and wait for response
7. Re-open Settings and confirm `Responses` remains selected

#### Expected Results
- OpenRouter API format control is a segmented toggle with `Responses` and `Completions`
- Both modes save successfully without provider switch errors
- Sending `hi` works in both modes (assistant reply, no `invalid_prompt` error block)
- Selected mode persists in status after refresh/reload

#### Rollback/Cleanup
- Leave OpenRouter on the preferred API format

---

### Provider-scoped model defaults + OpenRouter completions bash fallback

#### Feature/Change Name
Model defaults are stored per provider (no cross-provider leakage), and OpenRouter `Completions` mode preserves shell-tool execution by routing tool-capable requests through Responses compatibility.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open Settings panel
3. OpenRouter key configured

#### Steps
1. Switch provider to `OpenRouter` and choose a specific OpenRouter model in composer selector
2. Switch provider to `Codex`
3. Choose a Codex model different from the OpenRouter one
4. Switch back to `OpenRouter`
5. Verify previous OpenRouter model selection is restored
6. In OpenRouter settings, set API format to `Completions`
7. Send: `what codex cli version is? it should run bash commands`

#### Expected Results
- Provider switch restores the last model used for that provider
- OpenRouter model does not leak into Codex provider model list/selection, and vice versa
- In `Completions` mode, the assistant can still invoke bash/tool execution flow and return the CLI version result

#### Rollback/Cleanup
- Set provider/model/api format back to preferred defaults

---

### Unified provider proxy: OpenRouter + OpenCode Zen tool-capable completions

#### Feature/Change Name
Both OpenRouter and OpenCode Zen routes use a unified Responses proxy layer that preserves tool-capable behavior when using Completions mode.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Valid OpenRouter and/or OpenCode Zen API keys configured
3. Existing thread open

#### Steps
1. Select `OpenRouter`, set API format to `Completions`, and send: `what codex cli version is? it should run bash commands`
2. Confirm shell execution appears and includes `codex --version`
3. Select `OpenCode Zen`, set API format to `Completions`, and send the same prompt
4. Confirm shell execution appears and includes `codex --version`
5. Repeat each provider once with simple `hi` to verify non-tool path still returns assistant text normally

#### Expected Results
- Both providers work through a common proxy path without provider-specific regressions
- In Completions mode, tool-capable prompt triggers command execution for both providers
- `codex --version` output is returned in the assistant response flow
- Simple text prompt (`hi`) continues to work in Completions mode

#### Rollback/Cleanup
- Switch provider/API format back to preferred defaults

### OpenCode Zen Responses Payload Normalization

#### Feature/Change Name
OpenCode Zen `Responses` mode converts Codex Responses `input` payloads to Zen-compatible `messages` payloads.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. OpenCode Zen API key configured

#### Steps
1. Open Settings
2. Set Provider to `OpenCode Zen`
3. Set API format to `Responses`
4. Save
5. Select model `trinity-large-preview-free`
6. Send `hi`
7. Switch API format to `Completions`
8. Save
9. Select model `trinity-large-preview-free`
10. Send `hi`

#### Expected Results
- `Responses` mode posts to `/zen/v1/responses` with a `messages` payload derived from Codex Responses `input`
- `trinity-large-preview-free` returns a successful assistant greeting in `Responses` mode
- `Completions` mode still posts through `/zen/v1/chat/completions` and returns a successful assistant greeting
- Models unsupported by Zen for a chosen format, such as `minimax-m2.5-free` in `Responses` mode, surface the upstream error without being hidden

#### Rollback/Cleanup
- Switch provider/API format back to preferred defaults

---

### Raw auth/provider error messages

#### Feature/Change Name
Surface upstream auth/provider errors without rewriting them in the client normalizer.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A provider/backend request that can return an error

#### Steps
1. Trigger a provider/backend error, such as an auth refresh failure or invalid custom-provider response
2. Observe the surfaced error text in the UI/failed RPC path

#### Expected Results
- Error text matches the original upstream/backend error message
- No replacement copy like `Authentication session conflict detected...` is injected

#### Rollback/Cleanup
- Restore provider/session settings to the preferred state

---

### Custom endpoint Completions via local Responses proxy

#### Feature/Change Name
Custom endpoint `Completions` mode uses a local Responses-compatible proxy so current Codex CLI versions do not reject `wire_api="chat"`.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Local OpenAI-compatible endpoint running at `http://127.0.0.1:8666/v1`
3. API key `pwd`

#### Steps
1. Open Settings
2. Set Provider to `Custom endpoint`
3. Enter Custom endpoint URL `http://127.0.0.1:8666/v1`
4. Enter API key `pwd`
5. Set API format to `Completions`
6. Save
7. Select model `claude-sonnet-4.5`
8. Send `hi`
9. Select model `glm-5`
10. Send `hi`
11. In the same thread, ask `what is latest codex cli version?`

#### Expected Results
- The Codex app-server starts with `wire_api="responses"` against `/codex-api/custom-proxy/v1`
- The custom provider save records a usable default model from `/models` when available
- The Codex app-server receives the custom default model via runtime config
- The model list preserves endpoint-advertised models, including `auto-*` aliases
- The local proxy forwards the request to `/v1/chat/completions`
- The UI renders an assistant greeting such as `Hey! How can I help you today?`
- `glm-5` returns a successful assistant response
- Follow-up tool-output turns do not fail with Kiro Gateway's generic `payload size exceeded ~615KB` error when the payload is small

#### Rollback/Cleanup
- Switch provider/API format back to preferred defaults

---

### TestChat GLM-5 new-thread model selection

#### Feature/Change Name
New TestChat threads use the provider-scoped model selected in the new-thread composer.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Custom endpoint provider configured for `http://127.0.0.1:8666/v1`
3. Custom endpoint API format set to `Completions`
4. The local endpoint advertises model `glm-5`

#### Steps
1. Open the app home page
2. Select project `TestChat`
3. Select model `glm-5` in the new-thread composer
4. Send `create todo list app`
5. Inspect the created session metadata or UI model selector for the new thread

#### Expected Results
- The new thread starts with model `glm-5`, not the previous model from another provider or context
- The running turn uses the custom endpoint completions proxy
- The UI keeps `glm-5` selected after the thread is created

#### Rollback/Cleanup
- Switch provider/model settings back to preferred defaults if needed

---

### User message edit action replaces rollback button

#### Feature/Change Name
The old rollback button is replaced with an `Edit message` action under each eligible user message, while keeping the existing behavior that appends the original text into the composer and rolls the thread back from that turn.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. An existing thread with at least one completed user/assistant turn

#### Steps
1. Open a thread with multiple completed turns
2. Hover a completed user message
3. Confirm `Edit message` appears under that user message
4. Confirm assistant responses no longer show the old `Rollback` button
5. Click `Edit message` on an earlier user message with recognizable text
6. Observe the composer draft after the click
7. Confirm the thread rolls back from the selected turn

#### Expected Results
- The action under eligible user messages is labeled `Edit message`
- Assistant responses no longer render the old rollback action
- Clicking `Edit message` appends the original user text into the composer
- The existing rollback behavior still truncates the selected turn and later turns

#### Rollback/Cleanup
- Re-send the edited message if you want to recreate the conversation path

---

### API perf log bodyMB uses one decimal place

#### Feature/Change Name
`[codex-api-perf]` log entries format `bodyMB` with one decimal place instead of four.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A request large enough to trigger `[codex-api-perf]` logging

#### Steps
1. Trigger a `/codex-api/` request that exceeds the perf logging threshold
2. Inspect the server log line that includes `bodyMB=...`

#### Expected Results
- `bodyMB` is formatted with one decimal place, such as `bodyMB=3.4`
- The log does not print extra precision such as `bodyMB=3.4489`

#### Rollback/Cleanup
- None

---

### Integrated terminal mobile keyboard avoidance

#### Feature/Change Name
The integrated terminal stays inside the visible viewport when the mobile virtual keyboard opens.

#### Prerequisites/Setup
1. Dev server running on a phone-accessible URL
2. Open a thread or new-chat screen with a selected project folder
3. Integrated terminal available from the header terminal button

#### Steps
1. Open the terminal drawer
2. Tap inside the xterm terminal so the mobile keyboard opens
3. Type `echo terminal-keyboard-ok`
4. Rotate or resize the browser while the keyboard is still open
5. Repeat on a wide/tablet layout where the sidebar remains visible
6. Hide the keyboard, then tap the terminal again

#### Expected Results
- The terminal panel resizes into the visual viewport instead of being covered by the keyboard
- The xterm prompt and typed command remain visible above the keyboard
- The composer/terminal stack stays compact without overlapping the header or conversation
- On wide/tablet layouts, terminal focus still activates the protected keyboard layout even when the mobile breakpoint is not active
- The terminal remains usable after resize/orientation changes

#### Rollback/Cleanup
- Close the terminal tab if the test created a shell session that should not remain running

---

### Assistant generated image rendering

#### Feature/Change Name
Codex app-server generated image items render as assistant image previews.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A Codex thread that has completed an image generation turn, or a test app-server payload containing either `type: "imageGeneration"` with a base64 `result` or `type: "imageView"` with an absolute image `path`

#### Steps
1. Open the thread in CodexUI
2. Locate the completed image generation turn
3. Inspect the assistant response area where the generated image should appear
4. Click the generated image preview

#### Expected Results
- The generated image item appears as an assistant image preview instead of disappearing from the conversation
- The preview is rendered larger than normal user attachment thumbnails and keeps its aspect ratio
- Clicking the preview opens the existing image modal
- The image is served through `/codex-local-image?path=...`

#### Rollback/Cleanup
- Delete any temporary generated image files if they were created only for this test

---

### Codex.app-style integrated terminal

#### Feature/Change Name
Each local/worktree thread has an integrated xterm terminal that can be toggled from the header, uses the thread working directory, preserves recent output, and exposes a terminal snapshot endpoint.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. An existing local or worktree thread with a valid working directory
3. Browser focused on that thread

#### Steps
1. Click the terminal button in the top-right thread header
2. Confirm the bottom terminal drawer opens
3. Press `Cmd+J` on macOS or `Ctrl+J` on other platforms
4. Confirm the terminal drawer toggles closed/open
5. Run `pwd`
6. Confirm the printed path matches the thread/project working directory
7. Run `echo terminal-ok`
8. Confirm `terminal-ok` appears in the xterm output
9. Choose `npm run dev` from the `Run...` quick-command menu
10. Confirm the command is submitted to the active terminal
11. Choose `Add command...` from the `Run...` menu
12. Enter a custom command in the prompt and confirm it runs immediately
13. Fetch `/codex-api/thread-terminal-snapshot?threadId=<thread-id>`
14. Confirm the JSON `session.buffer` contains `terminal-ok`
15. Refresh the page and reopen the same thread
16. Toggle the terminal open again
17. Click `New`
18. Confirm a second terminal tab appears and becomes active
19. Click the first terminal tab
20. Confirm its previous output is restored
21. Resize the browser window
22. Click `Close`
23. Open the new-chat screen
24. Confirm a working folder is selected
25. Click the terminal button in the top-right header
26. Confirm the terminal opens below the new-chat composer before a thread exists
27. Run `pwd` and confirm it matches the selected folder

#### Expected Results
- The terminal button shows a pressed state when the drawer is open
- The terminal is scoped to the selected thread working directory
- The terminal button is also available on new-chat when a working folder is selected
- New-chat terminal sessions use the selected folder before a thread exists
- Recent output is restored after hiding/reopening or refreshing the thread
- The terminal resizes without clipping the prompt
- The snapshot endpoint returns `{ session: { cwd, shell, buffer, truncated } }` while a session exists
- The quick-command menu sends common project commands such as `npm run dev` into the current PTY
- Custom quick commands can be added from the `Run...` menu prompt and run immediately
- The `Run...` menu shows only the five most-used/recent commands before `Add command...`
- `New` adds another tab without killing the previous PTY
- `Close` terminates the active PTY and hides the drawer only after the last tab is closed

#### Rollback/Cleanup
- Close the terminal session with the `Close` button
- Stop any processes started inside the terminal before leaving the thread

---

### Integrated terminal manager edge cases

#### Feature/Change Name
Automated unit coverage for terminal manager edge cases that do not require a browser or real shell.

#### Prerequisites/Setup
1. Dependencies installed with `pnpm install`

#### Steps
1. Run `pnpm run test:unit`
2. Optionally run the focused test file with `pnpm run test:unit -- src/server/terminalManager.test.ts`

#### Expected Results
- Missing thread ids are rejected before spawning a PTY
- Invalid cwd falls back to home and then process cwd
- Initial and resize dimensions are clamped
- PTY env normalizes `TERM`, locale, and strips `TERMINFO` variables
- Output snapshots truncate to the last 16 KiB and set `truncated`
- Existing session reattach emits init/attached events and safely syncs changed cwd
- `New` adds a new tab without killing the previous session, and close/exit removes snapshots for the active session

#### Rollback/Cleanup
- None

---

### Startup welcome log uses repository GitHub URL

#### Feature/Change Name
Remove the legacy npm package reference from the startup welcome log and point users to the upstream GitHub repository.

#### Prerequisites/Setup
1. Run the app from this repository.

#### Steps
1. Start the app (for example via `pnpm run dev`).
2. Open the browser devtools console.
3. Locate the startup welcome message.

#### Expected Results
- The welcome log points to `https://github.com/friuns2/codexUI`.
- The welcome log does not contain the legacy npm package URL.

#### Rollback/Cleanup
- None

---

### Home route no longer crashes on dev startup

#### Feature/Change Name
Keep the home route mount path working in dev mode.

#### Prerequisites/Setup
1. Run the app from this repository with `npm run dev`.

#### Steps
1. Open `http://localhost:5173/#/`.
2. Wait for the app shell to finish loading.
3. Open the browser devtools console.

#### Expected Results
- The home screen renders instead of a black screen.
- The console does not show an app setup `ReferenceError` during initial mount.

#### Rollback/Cleanup
- None

---

### Thread list startup pagination and direct older-thread links

#### Feature/Change Name
Thread loading uses a smaller initial list page, hydrates later pages in the background, and direct thread URLs are not rejected just because the thread is outside the first page.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Browser dev tools Network panel open
3. More than 50 existing threads, including a valid older thread outside the first updated page

#### Steps
1. Open the app home route
2. Inspect the first `thread/list` RPC request
3. Keep the app open and watch subsequent `thread/list` RPC requests
4. Open `/thread/<older-thread-id>` directly for a valid thread outside the first page

#### Expected Results
- The first `thread/list` request uses a smaller initial limit instead of 100
- Later thread pages load in the background using `nextCursor`
- The sidebar gains older threads as background pages complete
- The direct older thread URL stays on the thread route and loads messages instead of redirecting home

#### Rollback/Cleanup
- None

---

### Thread detail load avoids duplicate live-state history fetch

#### Feature/Change Name
Normal thread detail loading calls `thread/read` directly instead of first calling `/codex-api/thread-live-state`, whose server path also reads full thread history.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Browser dev tools Network panel open
3. An existing thread with a large history

#### Steps
1. Open the existing thread
2. Inspect network/RPC calls during the message load

#### Expected Results
- The message load performs `thread/read` or `thread/resume` for the thread
- It does not first call `/codex-api/thread-live-state` for the same normal message load
- Messages and active/in-progress state still render correctly

#### Rollback/Cleanup
- None

---

### Thread message cache skips unchanged refetches

#### Feature/Change Name
Loaded thread messages are reused when the thread list version has not changed and the thread is not in progress.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Browser dev tools Network panel open
3. An existing completed thread

#### Steps
1. Open the completed thread and wait for messages to render
2. Switch to another thread or home
3. Return to the same completed thread without new turn or thread update events
4. Inspect network/RPC calls during the return

#### Expected Results
- The first open loads messages normally
- Returning to the unchanged completed thread reuses cached messages
- No additional `thread/read` or `thread/resume` call is made for that unchanged return
- If the thread version changes or the thread is in progress, messages still refresh from the server

#### Rollback/Cleanup
- None

---

### Thread selection keeps sidebar list stable during refresh

#### Feature/Change Name
Selecting a thread does not briefly hide older/sidebar threads while thread list refresh and background pagination run.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. More than one page of threads available in the sidebar
3. Background pagination has loaded older threads

#### Steps
1. Open the app and wait until older thread pages appear in the sidebar
2. Select a different thread
3. Watch the sidebar while the selected thread loads and any thread list refresh occurs
4. Repeat selection between recent and older threads

#### Expected Results
- The sidebar does not collapse to only the first page of recent threads
- Previously loaded older threads remain visible during refresh
- The selected thread stays highlighted and messages load normally
- Background pagination can still add newly loaded older threads without hiding existing ones

#### Rollback/Cleanup
- None

---

### Browser runtime profiling with Playwright

#### Feature/Change Name
Playwright browser runtime profiler captures route timing, Codex API network counts, screenshots, and trace files.

#### Prerequisites/Setup
1. Dev server running at `http://localhost:5173`
2. Dependencies installed (`pnpm install`)
3. Target route available, such as `#/thread/019da7c0-4e12-7a91-837c-f7c11cc8ab6c`

#### Steps
1. Run `pnpm run profile:browser`
2. Run `PROFILE_ROUTE='#/thread/019da7c0-4e12-7a91-837c-f7c11cc8ab6c' pnpm run profile:browser`
3. Inspect console output for duplicate counts and slowest API rows
4. Open the generated `output/playwright/browser-runtime-profile-*.json`
5. Open the generated `output/playwright/browser-runtime-profile-*-trace.zip` with `npx playwright show-trace`

#### Expected Results
- The profiler prints final URL, title, total observed time, duplicate request counts, and slowest Codex API calls
- JSON report includes raw API rows, grouped summaries, Performance API data, and artifact paths
- Screenshot is saved under `output/playwright/browser-runtime-profile-*.png`
- Trace is saved under `output/playwright/browser-runtime-profile-*-trace.zip`

#### Rollback/Cleanup
- Delete generated files under `output/playwright/` if local artifacts are no longer needed

---

### Codex.app-style Plugins Directory

#### Feature/Change Name
The `#/skills` route shows a full Skills & Apps directory with Plugins, Apps, Composio, and a Skills tab where an `MCPs(count)` section appears just before `Installed skills (count)`.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Codex CLI available in `PATH`
3. Optional: a Codex CLI version with `plugin/list`, `app/list`, and `mcpServerStatus/list` app-server APIs

#### Steps
1. Open `http://127.0.0.1:4173/#/skills`
2. Verify the page title is `Skills & Apps` and the tab row contains `Plugins`, `Apps`, `Composio`, and `Skills`
3. On `Plugins`, verify plugin cards load, the default sort is `Popular`, and `A-Z`, `Date`, and search controls work
4. Open a plugin card when one is available and verify description, capabilities, included apps/skills/MCPs, and install/uninstall or enable/disable actions are visible
5. For an installed plugin with bundled MCP servers, such as Cloudflare, verify each MCP row shows auth status (`Logged in`, `Bearer token`, `Login required`, `Auth unsupported`, or `Status unknown`)
6. If a bundled MCP server shows `Login required`, click `Authenticate` and verify the browser opens the returned MCP OAuth authorization URL
7. Switch to `Apps` and verify app cards load, or the unavailable/empty state appears without breaking the page
8. On `Apps`, verify the default sort control is `Popular`, app icons render, connected apps show `Manage`, and disconnected apps show `Login`
9. Click a disconnected app `Login` button and verify it opens the app login/manage URL
10. Click `Try it!` for a connected and enabled app and verify a new thread opens with an auto-submitted prompt asking what the app can do
11. While the app `Try it!` request is starting, click the button repeatedly and verify only one new thread is created
12. Open an installed/enabled plugin detail, click `Try it!`, and verify a new thread opens with an auto-submitted plugin test prompt
13. Open an installed/enabled skill detail, click `Try it!`, and verify a new thread opens with an auto-submitted skill test prompt and the skill attached
14. Install a plugin whose install response includes `appsNeedingAuth`, and verify the first required app login/manage URL opens automatically
15. Open a plugin whose detail lists a required app that is absent from the Apps catalog for the current account, such as Gmail on an account without Gmail app access, and verify the footer shows a disabled `ChatGPT Plus` action instead of `Install`
16. Switch Apps sorting to `A-Z` and verify apps reorder alphabetically; switch to `Date` and verify app-server catalog order is restored; switch back to `Popular` and verify casual-user relevant apps are prioritized and capped to 100 when no search is active
17. Search Apps and verify matching results are not capped to the Popular top 100 list
18. Switch to `Composio` and verify the workspace summary card shows the current installed Composio CLI login state, or a clear not-installed / not-authenticated message appears
19. If Composio CLI is not installed, click `Install Composio` and verify the app installs the CLI to `~/.composio/composio` using the official Composio installer
20. If Composio is available but not authenticated, click `Login` and verify the app opens a new tab, starts the installed `composio login --no-browser -y`, captures the returned auth URL, and navigates the new tab to that URL
21. Verify Composio connector cards show real connector details such as tool counts, trigger counts, auth mode, and connection state instead of only aggregate totals
22. In Composio search, type `instagram` and verify the Instagram connector appears first when it is returned by the connector source, ahead of description-only matches such as Meta Ads
23. Open a disconnected Composio connector and click `Connect` or `Reconnect`; verify the returned `connect.composio.dev` authorization URL opens
24. Open a connected Composio connector and verify connection rows show account identifiers and statuses such as `Active` or `Expired`
25. Click `Try it!` on a connected or no-auth Composio connector and verify a new thread opens with a Composio-specific prompt and the `composio-cli` skill attached
26. On Composio, verify that if more than one page exists, `Load more` appears and appends additional connectors while keeping prior results visible
27. In Composio search, verify the page state resets (the list returns to the first result page and stale pagination is cleared)
28. Switch to `Skills` and verify the view shows an `MCPs(count)` collapsible section immediately before the `Installed skills (count)` section
29. Expand `MCPs(count)` and verify server cards show auth status and tool/resource counts, or the unavailable/empty state appears without breaking the page
30. Click header `Refresh` while on `Skills` and verify MCP state reloads (it should perform MCP reload behavior on this tab instead of using a separate `Reload MCPs` button)
31. Verify no separate `Reload MCPs` button is shown in the header or inside the MCP section body
32. Verify the `MCPs(count)` section does not show its own search or sort controls
33. Verify MCP cards use the same visual card/grid layout pattern as Installed skills cards (avatar circle, title row, badge, secondary text)
34. Verify the `Installed skills (count)` section below MCPs still supports the existing Skills Hub behavior
35. Verify both light and dark themes render Composio cards and status/detail actions with readable contrast
36. In dark mode, verify MCP cards use the same dark card surface styling as Installed skills cards (not a light/white card)

#### Expected Results
- The directory tabs render without a full-page error
- Plugin/app/Composio API failures are isolated to their tab
- Existing Skills Hub behavior remains available under the `Skills` tab, with MCPs presented just before Installed skills
- App and plugin enable/disable actions update their local card state after a successful config write
- Plugin detail shows bundled MCP login state and can launch MCP OAuth for `notLoggedIn` servers
- Disconnected apps are labeled `Login`; connected apps are labeled `Manage`
- The Composio tab uses the installed Composio CLI, preferring `CODEXUI_COMPOSIO_COMMAND` when set and otherwise `~/.composio/composio` or `composio` on `PATH`
- The Composio install action uses the official installer and produces a working `~/.composio/composio` binary
- The Composio login action opens a new tab from the click, starts the installed `composio login --no-browser -y`, then navigates that tab to the returned auth URL
- Composio connector cards and detail views show concrete connector details, connection rows, and useful tool samples
- Composio search prioritizes exact slug/name matches above connectors that only mention the query in their description
- Unit coverage verifies that Composio exact query matches outrank description-only matches and that gateway connector search sends `query`, `cursor`, and `limit` params expected by the server
- Connected or no-auth Composio connectors expose `Try it!`, creating a new chat with the `composio-cli` skill attached
- Composio pagination supports page-by-page loading with a clear `Load more` path and cursor-based page continuation
- Plugin install opens the first required app login/manage page before falling back to bundled MCP OAuth login
- Plugin install is blocked with `ChatGPT Plus` when the plugin requires an app that is absent from the Apps catalog for the current account
- Connected and enabled apps, plus installed/enabled plugins/skills, expose `Try it!`, creating a new chat with an auto-submitted test prompt
- Repeated `Try it!` clicks during startup are ignored until the first request resolves, so duplicate threads are not created
- Plugins, Apps, and the Skills-tab MCP section default to local popularity-style ordering because app-server does not expose numeric popularity fields
- The Skills tab presents MCPs in the same section style as Installed skills, just above Installed skills, instead of using a separate top-level MCP tab
- `Date` uses the app-server/catalog order as the available freshness proxy because app/plugin/MCP APIs do not expose created or published timestamps
- Popular views show only the top 100 when no search is active; search results can show all matches

#### Rollback/Cleanup
- Re-enable any app or plugin disabled during testing
- Uninstall any plugin installed only for this test

---

### Skills tab npx skills search

#### Feature/Change Name
The Skills tab includes a registry search panel backed by `npx skills find`, shows matching skill cards, and installs selected registry results with `npx skills add`.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Network access available for `npx skills find`
3. `npx` can run the published `skills` package
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. Open `http://127.0.0.1:4173/#/skills`
2. Verify the `Skills` tab is selected by default; open `http://127.0.0.1:4173/#/skills?tab=plugins`, then click `Skills` and verify the URL updates to `?tab=skills`
3. Verify the `Find skills` header shows a `Skills directory` link on the right that opens `https://skills.anyclaw.store/` in a new tab
4. In `Find skills`, type a query such as `browser`
5. Click `Search`
6. Verify the app calls `/codex-api/skills-hub/search?q=browser`, which runs `npx --yes skills find browser`
7. Verify `Search results (count)` appears above `Installed skills (count)`
8. Verify each registry result card shows its install count metadata, such as `1.2K installs`, even when a GitHub `SKILL.md` description is shown
9. Open one GitHub-backed result and verify the detail modal shows the skill name, owner/repository, parsed `SKILL.md` description, GitHub-backed icon/avatar, and external link
10. Click `Install` for a result and verify the backend runs `npx --yes skills add <owner/repo@skill> --yes --global`
11. After install, verify the result becomes installed and the installed skills list refreshes from local installed skill data rather than appending the remote registry card
12. Switch to dark theme and repeat the search visibility check
13. Search for an already-installed skill and verify its search result shows `Installed`
14. Verify installed matches in search results keep their remote registry owner/details while showing the `Installed` badge
15. Open the installed search result and verify the modal reads the local installed `SKILL.md`, exposes `Uninstall`, and does not show the registry install flow
16. Open a local-only installed skill and verify the modal does not show a dead `View on GitHub` link when no external URL is available
17. Verify cards in the `Installed skills (count)` section do not show `Installed`, `Disabled`, or repeated `local` owner labels, while search result cards can still show installed state and registry owner details
18. Verify installed cards show local `SKILL.md` descriptions when the installed skill has frontmatter or readable markdown content
19. Verify Find skills result cards do not show the local folder browse icon; Browse files remains available inside the installed local modal

#### Expected Results
- Search results are parsed from the real `npx skills find` output, not a static catalog
- Skills search/install commands use the repo command invocation wrapper so `npx` starts reliably on Windows
- Skills search/install commands include outer `npx --yes` so first-run package prompts cannot hang with ignored stdin
- The Skills directory link is visible beside Find skills in light and dark theme and opens the public directory in a new tab
- Registry installs run noninteractively with `--yes --global`, so the process cannot stop at the agent-selection prompt and falsely report success
- Registry install responses only return `ok: true` when the local installed `SKILL.md` path is found and validates successfully
- The UI treats a missing returned path or missing post-refresh local skill as an install failure instead of showing the remote registry card as installed
- GitHub-backed results fetch the repository `SKILL.md` and show its `description` frontmatter when available, falling back to the install count when unavailable
- GitHub metadata enrichment is bounded to the first 20 results with limited concurrency, so broad searches still return without unbounded raw GitHub fetch fanout
- Search result cards keep the registry install count visible as card metadata even when GitHub enrichment replaces the fallback description
- GitHub-backed results show an explicit frontmatter `icon` when provided, otherwise they show the GitHub repository owner avatar instead of a generic letter fallback
- The search UI does not replace or hide local installed skills
- Installed matching results show the existing `Installed` badge and can be opened like local skills
- Installed detection uses the same installed skills source as the Skills Hub list, including RPC/plugin/shared skills and not only the base skills directory
- Installed search result cards keep remote registry ownership/content but include local installed state and path for actions
- Newly installed registry results are reloaded from the local installed skills source before appearing in the Installed skills section
- Opening an installed search result uses the local installed skill record/path, so local content, uninstall, enable/disable, browse, and try actions behave the same as the Installed skills section
- Local-only installed skills hide the external GitHub link when no URL is available
- Installed skills section cards hide redundant installed/disabled status labels
- Installed skills section cards hide the repeated local owner label; registry search cards keep owner/repository labels to distinguish remote results
- Installed skill descriptions come from the local installed `SKILL.md`, so installed cards are useful without opening each modal
- Installed entries are assembled concurrently so reading local `SKILL.md` descriptions does not add one file-read round trip per installed skill
- Opening or switching to the Skills tab lists MCP servers without forcing an MCP reload; the top-level Refresh button remains the explicit reload action
- The top-level Refresh button only shows `Refreshing...` for explicit user-triggered refreshes, not for ordinary initial tab loading
- Find skills cards hide local folder browse actions to avoid mixing remote registry cards with local-only card controls
- Light theme and dark theme keep the search panel, cards, and modal readable

#### Rollback/Cleanup
- Uninstall any skill installed only for this test

---

### Sidebar thread row edge click selects thread

#### Feature/Change Name
Thread rows now select when clicking anywhere on the highlighted row area (including left/right edge/time area), while pin/menu buttons keep their own actions.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar contains multiple threads
3. At least one thread has visible time text on the right

#### Steps
1. Hover a thread row and confirm the row highlight appears
2. Click near the left edge (outside the title text and not on pin icon)
3. Click near the right edge/time area (outside the menu button)
4. Click the thread title/body area
5. Click the pin button and menu button to verify their behavior

#### Expected Results
- Steps 2, 3, and 4 all select/open the clicked thread
- Hover highlight and click target area now match user expectations
- Pin button toggles pin state without selecting due to event bubbling
- Menu button opens thread menu without selecting due to event bubbling

#### Rollback/Cleanup
- None

---

### Content header actions remain right aligned

#### Feature/Change Name
Thread and new-chat header action buttons stay pinned to the right edge while long titles remain constrained and truncated.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Sidebar collapsed or viewport wide enough to show content header actions
3. Terminal toggle available in the header

#### Steps
1. Open `http://127.0.0.1:4173/#/`
2. Inspect the header row containing `Start new thread`
3. Verify the terminal toggle is aligned to the far right of the content header, not immediately after the title
4. Open a thread with a long title and repeat the alignment check
5. Confirm the title truncates with a tooltip and does not overlap the terminal or branch controls

#### Expected Results
- Header actions use the available right edge of the content header
- Long title truncation does not pull action buttons toward the center
- Terminal and branch controls remain visible and clickable

#### Rollback/Cleanup
- Remove generated screenshots under `output/playwright/` if they are not needed

---

### Stop button activates promptly for new threads

#### Feature/Change Name
The composer stop control switches from the temporary saving spinner to a real stop button as soon as the active turn id is available for a newly created thread.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Home route available with a writable project/folder selected
3. Codex can start a normal assistant turn

#### Steps
1. Open `http://127.0.0.1:4173/#/`
2. Send a short prompt from the new-thread composer
3. Immediately watch the right-side composer control after routing into the new thread
4. Before the full response finishes, verify the temporary saving spinner transitions into the stop icon/button
5. Click `Stop` while the turn is still running

#### Expected Results
- A new thread may briefly show the saving spinner while the turn starts
- The control becomes an actual stop button as soon as the active turn id is known, without waiting for thread-list persistence
- Clicking stop interrupts the running turn

#### Rollback/Cleanup
- Archive or delete the test thread if it was created only for this check

---

### New-thread plan mode persists and toggles correctly

#### Feature/Change Name
New threads started from the home composer honor the selected plan mode for the first turn, and turning plan mode off on the created thread switches later turns back to default mode.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Home route available with a writable project/folder selected
3. At least one model is available for plan mode

#### Steps
1. Open `http://127.0.0.1:4173/#/`
2. Enable `Plan mode` in the new-thread composer
3. Send a prompt that produces a visible plan response
4. After routing into the new thread, confirm the composer still shows `Plan mode` enabled
5. Toggle `Plan mode` off in that thread
6. Send another prompt in the same thread
7. Confirm the next turn runs in default mode rather than generating another plan-first response

#### Expected Results
- The very first turn of a newly created thread uses the plan-mode setting chosen on the home composer
- The newly created thread retains that plan-mode selection after route transition
- Turning plan mode off updates the thread-scoped mode, and later turns in that thread no longer use plan mode

#### Rollback/Cleanup
- Archive or delete any test thread created only for this check

---

### Completed plan cards expose implement action

#### Feature/Change Name
Completed plan cards show an `Implement plan` button that turns plan mode off and sends an implementation prompt built from the plan content.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. An existing thread contains a completed persisted plan card
3. The thread composer is available for follow-up messages

#### Steps
1. Open a thread containing a completed plan card
2. Verify the plan card shows `Implement plan` at the bottom
3. Click `Implement plan`
4. Confirm the composer thread switches back to default mode
5. Inspect the next `turn/start` request or the resulting assistant behavior

#### Expected Results
- Completed plan cards render the `Implement plan` action even when the plan body is structured as headings/lists instead of checkbox steps
- Clicking the button sends a simple implementation follow-up message instead of copying the whole plan body into chat
- The next turn runs in default mode rather than plan mode

#### Rollback/Cleanup
- Archive or delete any test thread created only for this check

---

### Dark theme plan card contrast

#### Feature/Change Name
Plan cards in dark mode keep readable contrast and a lighter surface than the surrounding page background, including the `Implement plan` action.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A thread contains a visible plan card
3. Appearance is set to `Dark`

#### Steps
1. Open a thread containing a plan card in dark mode
2. Inspect the card background, title, explanation text, headings, lists, inline code, and blockquote styling
3. Verify the `Implement plan` button is readable and visually distinct
4. Hover the `Implement plan` button and confirm the hover state remains visible

#### Expected Results
- The plan card surface is distinguishable from the page background without looking crushed into near-black
- Plan text and headings stay readable in dark mode
- Inline code, file links, and blockquotes keep enough contrast to scan comfortably
- The `Implement plan` button remains readable and clickable in dark mode

#### Rollback/Cleanup
- Reset appearance to the previous user preference

---

### Terminal focus does not fullscreen panel

#### Feature/Change Name
Terminal focus on mobile keeps the terminal as a bottom panel instead of expanding it to full screen.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A thread or new-chat project with the terminal toggle available
3. Mobile viewport or Android device browser

#### Steps
1. Open a thread or new chat with a valid project path
2. Tap the terminal toggle
3. Tap inside the terminal area
4. If the virtual keyboard appears, keep focus in the terminal
5. Hide and reopen the terminal

#### Expected Results
- Terminal remains a bottom panel and does not take over the full viewport
- Conversation/new-chat content is not forcibly hidden by terminal focus
- Composer keeps its normal compact placement instead of stretching above the terminal
- Terminal can still fit within the available viewport when the keyboard changes size

#### Rollback/Cleanup
- Close the terminal panel

---

### Feature: Nested skill bundles are grouped in discovery

#### Feature/Change Name
Composer skill discovery collapses nested `skills/<subskill>/SKILL.md` entries under their top-level bundle skill when the bundle root skill is also present, including curated plugin skill packs such as `cloudflare:*`.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open a thread whose cwd can access installed skills
3. At least one installed skill bundle or curated plugin pack contains a top-level/root `SKILL.md` plus additional subskills

#### Steps
1. Open the thread composer skill picker
2. Search for a grouped bundle or plugin root such as `cloudflare`
3. Confirm the grouped root appears once in the picker
4. Search for one nested subskill or prefixed plugin skill name such as `agents-sdk` or `cloudflare:workers-best-practices`
5. Refresh the page or switch threads and reopen the skill picker

#### Expected Results
- The picker shows a single top-level entry for the bundled skill or plugin root
- Nested subskill folder names and plugin-prefixed variants do not appear as separate skill discovery entries when the parent/root entry exists
- Grouped plugin roots render a clean label such as `cloudflare` instead of `cloudflare:cloudflare`
- The grouped result remains stable after refresh or thread switching

#### Rollback/Cleanup
- None

---

### Default mode can follow plan mode in the same thread

#### Feature/Change Name
Composer collaboration mode changes send `default` explicitly so a thread can leave plan mode without opening a new chat.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A Codex account/session with both Default and Plan collaboration modes available
3. A project folder selected for a new or existing thread

#### Steps
1. Select Plan mode in the composer
2. Send a prompt asking Codex to create a plan
3. After the turn completes, switch the composer back to Default mode
4. Send a follow-up prompt asking Codex to implement the plan in the same thread
5. Repeat the Default follow-up once more in the same thread

#### Expected Results
- The implementation prompts run in Default mode instead of staying in Plan mode
- The thread remains usable without opening a new chat
- The composer selection and the backend turn mode stay aligned across consecutive turns

#### Rollback/Cleanup
- Archive the test thread if it was created only for verification

---

### First-launch home card for Plugins and Apps

#### Feature/Change Name
The home route shows a dismissible first-launch card that introduces Plugins and Apps and opens the existing Skills & Apps directory on the Plugins tab.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Codex global-state preference `first-launch-plugins-card-dismissed` removed or set to `false` before the first check
3. App loaded on the home/new-thread route

#### Steps
1. Open the app on the home route with the local storage key removed
2. Verify the home screen shows a card with the heading `Plugins are here`
3. Verify the body copy mentions app examples such as Gmail and Calendar
4. Click `Explore Plugins & Apps`
5. Verify the app navigates to the `#/skills` route and the `Plugins` tab is active
6. Return to the home route and verify the card does not reappear
7. Remove the local storage key again, reload the home route, and click `Dismiss`
8. Reload the home route once more

#### Expected Results
- The card appears only when the server-backed dismissal preference is unset or `false`
- The primary CTA hides the card and opens the Skills & Apps directory
- The directory opens with `Plugins` selected by default
- Dismissing the card hides it immediately and keeps it hidden after reload

#### Rollback/Cleanup
- Remove or set `first-launch-plugins-card-dismissed` to `false` in Codex global state if you want to see the card again

---

### Composer prompts inside Skills dropdown

#### Feature/Change Name
The composer control row uses one `Skills` dropdown for both skills and saved prompts. The `+` action creates a prompt, prompt rows can be inserted or removed from the same menu, and there is no separate `Prompt` control.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Open any existing thread so the composer controls are enabled
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the composer controls and confirm `Skills` appears and no separate `Prompt` control is present
2. Open `Skills` and verify the popup matches the wider card-like layout with large stacked label/description rows
3. Confirm skill rows have compact source markers, such as `R` for repo, `U` for user, `S` for system, or `P` for plugin
4. Click the `+` action in the `Skills` dropdown, enter a unique prompt name such as `ui-test-prompt`, and enter sample content such as `Prompt dropdown smoke test`
5. Reopen `Skills` and confirm the new prompt appears with a `Prompt` marker and an inline `×` remove action
6. Click the prompt row and confirm the prompt text is inserted into the composer draft without toggling a skill
7. Reopen `Skills`, click the `×` button for `ui-test-prompt`, and confirm the removal dialog
8. Confirm the prompt disappears from the dropdown while skill rows remain available
9. Type `/` into the composer and verify no slash skill picker appears
10. Switch to dark theme and repeat the visibility check for the combined `Skills` dropdown contents

#### Expected Results
- The composer shows one `Skills` dropdown for skills and prompts; no standalone `Prompt` dropdown is rendered
- The combined `Skills` popup uses the wider rounded layout with vertically stacked label/description rows
- Skill rows show readable source markers that distinguish repo, user, system, and plugin-provided skills
- Prompt rows show a readable `Prompt` marker and are the only rows with an inline remove action
- Typing `/` in the composer does not open a skill picker
- The `+` action creates a markdown file in the Codex prompt store and adds it to the `Skills` dropdown immediately
- Selecting a saved prompt appends its content into the draft without sending the message
- Clicking `×` removes only the targeted prompt and updates the dropdown immediately
- Light theme and dark theme both keep the new control, menu, and remove action readable and usable

#### Rollback/Cleanup
- Delete any temporary verification prompt created during the test

---

### Editable current folder path in the folder picker

#### Feature/Change Name
The `Select folder` dialog now lets the user edit the current folder path directly, reload that folder on `Enter` or blur, and open the typed path without first clicking a child row.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open the home/new-thread route
3. Have at least two accessible local directories available for navigation
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the `Select folder` dialog from the new-thread folder chooser
2. Confirm the `Current folder` field is an editable text input instead of static text
3. Type a different absolute path and press `Enter`
4. Confirm the folder list reloads for the typed path
5. Edit the path again, click outside the input, and confirm blur also reloads the listing
6. Type a valid absolute path and click `Open`
7. Reopen the dialog, switch to dark theme, and confirm the editable current-folder input remains readable and focusable

#### Expected Results
- The current-folder path can be typed into directly
- Pressing `Enter` on a changed path reloads the folder listing for that path
- Blurring a changed path also reloads the folder listing for that path
- Clicking `Open` uses the typed path when it is valid
- The input remains readable and has visible focus treatment in both light theme and dark theme

#### Rollback/Cleanup
- Return the chooser to the original folder if the test changed the selected project path

---

### Expandable Projects, Pinned, and Chats sidebar sections

#### Feature/Change Name
The sidebar labels the grouped thread area as `Projects`, makes `Projects`, `Pinned`, and `Chats` independently expandable, and places `Chats` after `Projects` in the same scrollable sidebar area.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:5174` or the active Vite dev URL
2. At least one existing thread is available in the sidebar
3. At least one pinned thread exists to verify the `Pinned` section
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open the app with the sidebar expanded
2. Verify the grouped thread header reads `Projects` instead of `Threads`
3. Verify `Pinned`, `Projects`, and `Chats` each show a chevron when present
4. Collapse and expand `Pinned`, confirming pinned rows hide and return
5. Collapse and expand `Projects`, confirming project groups hide and return
6. Confirm `Chats` appears after `Projects` and scrolls with the same sidebar content, not as a fixed bottom shelf
7. Collapse and expand `Chats`, confirming recent chat rows hide and return
8. Click the `Chats` filter icon and verify the existing sidebar search field opens and the filter button shows active state
9. Click the `Chats` compose icon and verify the app navigates to the new-chat/home composer
10. Open the Projects organize menu, enable `Chats first`, and verify `Chats` moves above `Projects`
11. In the same menu, switch `Sort by` between `Created` and `Updated`, then verify the active checkmark moves and the chat rows reorder by the selected timestamp
12. Refresh the page and verify `Chats first` and the selected sort mode persist
13. Switch to dark theme and repeat the visibility checks for section headers, chevrons, active filter state, sort menu state, and row text

#### Expected Results
- The sidebar uses `Projects` for the grouped project/thread area
- `Pinned`, `Projects`, and `Chats` expansion state changes immediately and persists across reload
- `Chats` is appended after `Projects` in the same scroll space
- `Chats first` moves the `Chats` section before `Projects` and persists across reload
- `Created` and `Updated` sort options update only the `Chats` ordering and persist across reload
- The filter icon toggles the sidebar search without losing the `Chats` section
- The compose icon starts a new chat using the existing new-thread flow
- Light theme and dark theme both keep section headers, controls, and rows readable

#### Rollback/Cleanup
- Clear the sidebar search query if the filter step left it open

---

### Thread menu copy path action

#### Feature/Change Name
The thread overflow menu includes a `Copy path` item that copies the selected thread's working directory path.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:5174` or the active Vite dev URL
2. Open any existing thread with a known project path
3. Browser clipboard access is available
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, hover a thread row in the sidebar and open its overflow menu
2. Verify `Copy path` appears after `Browse files`
3. Click `Copy path`
4. Paste the clipboard contents into a text field or clipboard inspector
5. Reopen the same menu in dark theme and verify the item remains readable and in the same position

#### Expected Results
- The menu order is `Add automation...`, `Browse files`, `Copy path`, `Export chat`, `Create chat fork`, `Rename thread`, `Delete thread`
- Clicking `Copy path` closes the menu
- Clipboard contents equal the thread's `cwd` path
- Light theme and dark theme both keep the menu item readable

#### Rollback/Cleanup
- Restore any previous clipboard contents manually if needed

---

### Terminal quick commands from project files

#### Feature/Change Name
Terminal quick commands are discovered from the current project instead of using a static built-in npm list.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:5174` or the active Vite dev URL
2. Open a thread or new chat whose working directory has a `package.json` with scripts
3. Optionally create executable candidates under the project root and `scripts/`, such as `check.sh`, `scripts/check.sh`, or `scripts/build.cmd`
4. Optionally add `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, or `bun.lockb` to verify package-manager detection
5. Optionally add a `Makefile` with simple targets such as `test:` or `build:`

#### Steps
1. Open the terminal panel for that project
2. Open the `Run...` dropdown
3. Verify each `package.json` script appears with the detected package manager, such as `pnpm run <script>`, `yarn <script>`, `bun run <script>`, or `npm run <script>`
4. Verify simple `Makefile` targets appear as `make <target>`
5. Verify root-level `*.sh` / `*.cmd` files appear as `./<file>`
6. Verify `scripts/*.sh` and `scripts/*.cmd` files appear as `./scripts/<file>`
7. Select one discovered command and confirm it is sent to the terminal
8. Use `Add command...` to add a custom command
9. Reopen the dropdown after running commands multiple times

#### Expected Results
- The dropdown is based on the current project `cwd`
- Static defaults like `npm run dev` do not appear unless they exist in that project's `package.json`
- Package script commands use the lockfile-preferred package manager
- Make targets are listed after package scripts
- Root and `scripts/` script-file commands are listed after Make targets
- Only the top five commands are shown, sorted by most-used and then most-recent usage
- Custom commands still work and are included in the same usage sorting

#### Rollback/Cleanup
- Remove any temporary files created under the project root or `scripts/`
- Remove custom quick commands from browser local storage if needed

---

### Queue mode is default for in-progress messages

#### Feature/Change Name
When a turn is already running, the in-progress message path defaults to `Queue` for new sessions and existing users without a saved preference.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open any existing thread with message composer enabled
3. Start from a clean setting state by clearing localStorage key `codex-web-local.in-progress-send-mode` if present
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. Open a thread and ensure no previous turn is running
2. Confirm settings shows `When busy` line labeled as `Queue`
3. Send a message that triggers an in-progress response
4. While the response is running, submit a second message and observe submit mode label / destination behavior
5. Open the queue list and confirm the second message is queued
6. Switch to dark theme and repeat step 4 using another thread

#### Expected Results
- The in-progress setting defaults to `Queue` when no saved preference exists
- A second message sent during an active turn is queued, not used as steer
- Queue order and queued item actions remain functional in both light theme and dark theme

#### Rollback/Cleanup
- Clear the queue by sending/steering queued items or deleting queued rows

---

### Backend-persisted queued messages and drag reorder

#### Feature/Change Name
Queued messages are saved through the backend, survive page refresh, and can be reordered by dragging a queued row before another queued row.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open a thread where a turn is actively running
3. Queue at least three messages while the turn is running
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, confirm each queued row has a drag handle at the start of the row
2. Refresh the page and reopen the same thread
3. Confirm all queued rows are still visible in the same order
4. Drag the third queued message onto the first queued message
5. Confirm the third message moves to the first position and the remaining queued messages keep their relative order
6. Refresh again and confirm the reordered queue order is preserved
7. Let the active turn finish and confirm the next sent queued message is the first reordered item
8. Queue at least two more messages, switch to dark theme, and repeat the drag reorder check

#### Expected Results
- Queued rows survive a page refresh because they are restored from backend state
- Dragging a queued row onto another queued row immediately reorders the queue
- The reordered queue order survives page refresh
- The reordered queue order controls which message sends next after the active turn finishes
- Edit, Steer, and Delete actions still operate on the correct queued row after reordering
- Drag handle, hover/drop target, and row text remain readable in both light theme and dark theme

#### Rollback/Cleanup
- Delete any queued test messages that should not be sent

---

### Backend-drained queue UI refresh

#### Feature/Change Name
The queue panel refreshes when the backend starts and drains persisted queued messages.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open a `TestChat` thread
3. Queue at least three short messages while a turn is running
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, confirm queued rows are visible above the composer
2. Let the backend drain each queued message
3. Confirm the queue panel removes each row as its queued turn starts
4. Confirm the queue panel disappears when the final queued message is submitted
5. Refresh the thread after all queued turns complete
6. Switch to dark theme and repeat the visibility check after queue drain

#### Expected Results
- Queued messages execute in order after the active turn completes
- The queue panel reflects backend queue state after `turn/started` and `turn/completed`
- No already-executed queued rows remain visible after the queue is empty
- Queue row text, actions, and composer spacing remain readable in both light theme and dark theme

#### Rollback/Cleanup
- Delete any remaining queued test messages or let the queue drain

---

### Persisted idle queue recovery

#### Feature/Change Name
Backend queued messages are retried and drained for idle threads even if the original `turn/completed` notification was missed or the server starts with persisted queue state already present.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A thread exists with queued messages persisted in `/codex-api/thread-queue-state`
3. The thread's latest turn is completed/idle
4. Light theme and dark theme are both available

#### Steps
1. In light theme, open the thread with persisted queued rows
2. Confirm the queued rows are visible above the composer
3. Wait for backend queue recovery to start the first queued message
4. Confirm the first queued row is removed and a new turn starts
5. Wait for the queued turn to complete
6. Confirm the next queued row starts automatically
7. Repeat until `/codex-api/thread-queue-state` no longer includes the thread
8. Refresh the thread and confirm all queued messages completed in order
9. Switch to dark theme and confirm the completed conversation and empty queue state remain readable

#### Expected Results
- Idle persisted queues recover without requiring a new manual message
- Queued messages do not start while the thread has an in-progress turn
- Multiple queued messages drain one at a time and complete in order
- The queue panel disappears after the final queued message is started
- The recovered turns and empty queue state are visible in both light theme and dark theme

#### Rollback/Cleanup
- Delete any remaining queued test rows or let recovery drain them
- Remove temporary test projects/threads if they are no longer needed

---

### ChatGPT auth tokens refresh for external auth

#### Feature/Change Name
Codex app-server `account/chatgptAuthTokens/refresh` requests are handled automatically from `auth.json` so expired ChatGPT access tokens can be refreshed without a manual relogin.

#### Prerequisites/Setup
1. App server is running from this repository
2. `$CODEX_HOME/auth.json` contains ChatGPT auth with a valid `refresh_token`
3. The current ChatGPT `access_token` is expired or close enough to expiry that Codex app-server asks for token refresh

#### Steps
1. Open the app with the ChatGPT-authenticated account selected
2. Trigger an account operation such as loading account rate limits or starting a normal Codex turn
3. Watch the server logs for an `account/chatgptAuthTokens/refresh` server request
4. Reopen `$CODEX_HOME/auth.json`
5. Repeat the same account operation after the refresh completes

#### Expected Results
- The refresh request is answered automatically and does not appear as a manual pending request in the UI
- `auth.json` is updated with the fresh `access_token` and any rotated `refresh_token` or `id_token`
- The account operation succeeds without showing `token_expired`
- If no refresh token is available, the operation fails with a sign-in-again message instead of silently looping

#### Rollback/Cleanup
- None, unless a test-only `$CODEX_HOME` was used

---

### Project menu permanent worktree action

#### Feature/Change Name
Project rows open the same action menu from right-click and the dots button, and can create a permanent sibling Git worktree as a new project.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar has at least one Git-backed project
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, click the project row dots button.
2. Verify the menu shows `Browse files`, `New worktree`, `Rename project`, and `Remove`.
3. Close the menu, then right-click the same project row.
4. Verify the same menu opens.
5. Click `Browse files` and confirm the local file browser opens for the project cwd.
6. Reopen the project menu, click `Rename project`, and confirm the inline project name input still works.
7. Reopen the project menu, click `New worktree`, and confirm the prompt is prefilled with `<project name>-`.
8. Enter a unique folder name such as `<project name>-manual-test`.
9. Confirm a Git worktree is created at `../<worktree name>` relative to the source repo root.
10. Run `git -C ../<worktree name> branch --show-current` and confirm it prints a branch based on the worktree folder name.
11. Confirm the new worktree is added as a project and the app opens the new-chat composer with that cwd selected.
12. Rename the project to include a slash, reopen `New worktree`, and confirm the suggested folder name replaces the slash with `-`.
13. Switch to dark theme and repeat steps 1-4, verifying menu contrast and danger styling remain readable.

#### Expected Results
- Right-click and dots button expose the same project action menu.
- `Browse files`, `Rename project`, and `Remove` remain available from that menu.
- `New worktree` creates a permanent sibling worktree folder on its own branch, registers it as a project, and opens a new chat for it.
- Invalid path separator characters are not used in the default worktree folder suggestion.
- Menu text, hover states, and the remove action remain readable in light and dark themes.

#### Rollback/Cleanup
- Remove the test worktree with `git -C <source-repo-root> worktree remove ../<worktree name>`.
- Delete the test branch with `git -C <source-repo-root> branch -D <branch name>`.
- Remove the temporary project from the sidebar if it remains listed.

---

### Sidebar thread inline delete confirmation and menu pin action

#### Feature/Change Name
Thread rows show an inline delete button that morphs to `Confirm`, while pin/unpin moves to the thread context menu.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar contains at least two disposable test threads
3. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, hover a disposable thread row and verify the left-side action shows a delete icon instead of a pin icon
2. Click the delete icon once and verify it changes to a `Confirm` button without selecting the row
3. Click a different thread row and verify the pending `Confirm` state clears
4. Hover the disposable thread row again, click delete, then click `Confirm`
5. Verify the thread is removed from the sidebar immediately and, if it was pinned, removed from the `Pinned` section too
6. Open another thread row context menu and verify it contains `Pin thread` for an unpinned thread
7. Click `Pin thread`, reopen the same thread menu, and verify it now shows `Unpin thread`
8. Switch to dark theme and repeat steps 1 through 7 with another disposable thread

#### Expected Results
- The inline row action is delete, not pin
- Delete requires two clicks: delete icon, then `Confirm`
- Confirming archives/removes the correct thread immediately from the sidebar and clears any pinned state for that thread
- Pin/unpin is available from the thread context menu and updates the `Pinned` section immediately
- Delete icon, `Confirm` button, and context menu items are readable in both light theme and dark theme

#### Rollback/Cleanup
- Delete or unpin any disposable threads created only for this test

---

### Accounts panel Codex login callback modal

#### Feature/Change Name
Accounts settings includes an always-available `Login` button that starts `codex login`, opens the returned authorization URL, shows an in-app callback modal, requests the pasted localhost callback URL from the server, and imports the completed Codex account.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. `codex` CLI available in the server process `PATH`
3. Browser can open the authorization URL returned by the server
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. Open settings and expand `Accounts`.
2. In light theme, verify `Login` appears even when an active account is already listed.
3. Click `Login`.
4. Verify a new tab opens to the OpenAI authorization URL and an in-app `Complete Codex login` modal asks for the localhost callback URL.
5. Complete authorization in the browser until it redirects to a `http://localhost:<port>/auth/callback?...` URL.
6. Paste that full localhost callback URL into the modal input and click `Complete`.
7. Verify the account list refreshes, the new or refreshed account is active, and normal thread/account data reloads.
8. Click `Login` again, close the modal, and verify the Accounts panel keeps the `Open login URL` fallback link available.
9. Switch to dark theme and repeat steps 1-4, verifying the Login button, link, modal, input, and buttons have readable contrast.

#### Expected Results
- `Login` is available regardless of current login state.
- Starting login runs `codex login` on the server and exposes the generated OpenAI authorization URL.
- Completing login uses the modal input value, only accepts local callback URLs, and uses the server to request the pasted callback.
- After completion, `$CODEX_HOME/auth.json` is imported into the Accounts list and selected as the active account.
- Completion does not remain stuck waiting for the `codex login` process after the callback has updated `auth.json`.
- Light-theme and dark-theme controls are readable and do not overlap.

#### Rollback/Cleanup
- Remove any test-only account from the Accounts panel if needed.
- If a login is abandoned, restart the dev server to clear any in-memory pending login process.

---

### Active thread switches after delete

#### Feature/Change Name
Deleting the currently open thread immediately selects the next available thread.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar contains at least three disposable test threads
3. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open the middle disposable thread
2. Click that thread's delete icon, then click `Confirm`
3. Verify the content area immediately switches to the next thread in the sidebar list
4. Open the last disposable thread
5. Delete and confirm it
6. Verify the content area immediately switches to the previous thread
7. Repeat steps 1 through 6 in dark theme

#### Expected Results
- Deleting the active thread does not leave the deleted thread selected
- The next thread is selected immediately; when there is no next thread, the previous thread is selected
- The browser route updates to the newly selected thread without waiting for a manual click
- A stale deleted-thread URL does not switch the UI back to the archived thread
- Light-theme and dark-theme sidebar selection states remain readable after the automatic switch

#### Rollback/Cleanup
- Delete any disposable threads created only for this test

---

### Thread open always autoscrolls to latest

#### Feature/Change Name
Opening a thread always scrolls the conversation to the latest messages, with no per-thread scroll restore.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least one thread with enough messages to require scrolling
3. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open a thread and scroll to the middle of its history
2. Switch to another thread
3. Open the first thread again
4. Verify the viewport opens at the bottom (latest messages), not the previous middle position
5. Refresh the browser tab, open the same thread again, and verify it still opens at the bottom
6. Repeat steps 1 through 5 in dark theme

#### Expected Results
- Opening a thread always lands on the latest messages
- Previously viewed scroll positions are not restored when revisiting a thread
- Browser refresh does not restore a previously viewed conversation scroll position
- Behavior is the same in light theme and dark theme

#### Rollback/Cleanup
- None

---

### Hide worktree controls for non-Git folders

#### Feature/Change Name
Composer runtime options and project menu worktree actions are hidden when the selected folder is not a Git repository.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. One Git-backed project and one plain local folder without a `.git` directory are available in the folder picker/sidebar
3. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, select the plain local folder in the new-thread composer.
2. Confirm the `Local project` / `New worktree` runtime toggle is not shown.
3. Confirm the first message can still be sent as a normal local-folder chat.
4. Select a Git-backed folder and confirm the runtime toggle appears again.
5. Open the project action menu for a non-Git project and confirm `New worktree` is not shown.
6. Open the project action menu for a Git-backed project and confirm `New worktree` is shown.
7. Switch to dark theme and repeat steps 1, 2, 4, 5, and 6.

#### Expected Results
- Non-Git folders do not show `Local project` or `New worktree` runtime options.
- Non-Git project menus do not show `New worktree`.
- Git-backed folders continue to expose the runtime toggle and worktree action.
- The hidden/visible states are consistent and readable in both light and dark themes.

#### Rollback/Cleanup
- Remove any disposable plain folder or test chats created for this validation.

---

### Project worktree threads under canonical project

#### Feature/Change Name
Managed worktree threads remain visible under their matching canonical workspace-root project, and path-like project tooltips expose the full path.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Codex global workspace roots include `/Users/igor/Git-projects/codex-web-local`
3. Thread history contains at least one thread whose cwd is under `/Users/igor/.codex/worktrees/*/codex-web-local`
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the sidebar Projects section.
2. Scroll to the `codex-web-local` project.
3. Confirm the project includes the main-root thread and managed worktree threads.
4. Confirm worktree rows still show the worktree icon.
5. Confirm unrelated `.git/worktrees` rows with the same leaf folder name are not grouped into this project.
6. Hover any shortened path-like duplicate project title and confirm the tooltip shows the full project path, not only the friendly label.
7. Switch to dark theme and repeat steps 1-6.

#### Expected Results
- Managed worktree threads with the same leaf folder name are not split into hidden path-like project groups.
- Generic `.git/worktrees` rows are not treated as managed Codex worktrees for project-root grouping.
- The canonical `codex-web-local` project shows both main-root and worktree threads.
- Path-like project tooltips expose the full project path.
- Project rows and worktree icons remain readable in light and dark themes.

#### Rollback/Cleanup
- None.
