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
