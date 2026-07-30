### Thread menu copy chat action

#### Feature/Change Name
The thread overflow menu includes a `Copy chat` item that copies the selected chat as Markdown instead of downloading an export file.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:5174` or the active Vite dev URL
2. Open any existing thread with at least one visible message
3. Browser clipboard access is available
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, hover the selected thread row in the sidebar and open its overflow menu
2. Verify `Copy chat` appears after `Copy path`
3. Click `Copy chat`
4. Paste the clipboard contents into a text field or clipboard inspector
5. Open a different, non-selected thread row menu and verify `Copy chat` is disabled
6. Reopen the selected thread menu in dark theme and verify the item remains readable and in the same position

#### Expected Results
- The menu closes after clicking `Copy chat`
- No Markdown file is downloaded
- Clipboard contents start with the thread title as a Markdown heading and include `Thread ID:`
- The copied body includes the visible chat messages in Markdown
- `Copy chat` is disabled for non-selected threads so clipboard writes keep the original click activation
- Light theme and dark theme both keep the menu item readable

#### Rollback/Cleanup
- Restore any previous clipboard contents manually if needed

---

### Continue in ChatGPT Pro handoff

#### Feature/Change Name
The selected thread menu includes `Continue in ChatGPT Pro…`, which packages the persisted thread and local repository state into a clipboard handoff and opens ChatGPT.

#### Prerequisites/Setup
1. App is running at the active local URL.
2. Open a persisted thread whose working directory is a Git repository.
3. The thread has an active Goal and at least one user/assistant turn.
4. Make a harmless uncommitted change in the repository.
5. Browser clipboard access and popups are allowed.

#### Steps
1. In light theme, open the selected thread's overflow menu.
2. Click `Continue in ChatGPT Pro…`.
3. Confirm a new tab opens at `https://chatgpt.com/`.
4. Paste the clipboard into a temporary editor without sending it.
5. Verify the handoff contains the thread ID, working directory, Goal, persisted user/assistant transcript, branch, status, recent commits, changed-file list, diff, and applicable `AGENTS.md`.
6. Verify raw reasoning items and excessively long command output are absent or explicitly truncated.
7. Open a non-selected thread's menu and verify the action is disabled.
8. Repeat the selected-thread menu check in dark theme.
9. Temporarily block popups and retry; confirm the handoff is still copied and the notice tells you to open ChatGPT manually.

#### Expected Results
- The menu closes immediately and a visible packaging notice appears.
- The clipboard contains a self-contained Markdown prompt beginning with `Codex → ChatGPT Pro handoff`.
- The prompt asks ChatGPT to switch to GPT-5.6 Sol Pro and continue without redoing completed work.
- Repository inspection occurs only after the explicit menu click.
- The new ChatGPT tab opens when popups are allowed; clipboard copy still succeeds when they are blocked.
- Failures close the blank tab and surface a visible error notice.
- The action and notice remain readable in light and dark themes.

#### Rollback/Cleanup
- Revert the harmless test change if it was created only for this check.
- Restore popup permissions and previous clipboard contents if needed.
