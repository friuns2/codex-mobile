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
- The menu order is `Add automation...` or `Manage automations...`, `Browse files`, `Copy path`, `Copy chat`, `Create chat fork`, `Pin thread` or `Unpin thread`, `Rename thread`, `Delete thread`
- Clicking `Copy path` closes the menu
- Clipboard contents equal the thread's `cwd` path
- Light theme and dark theme both keep the menu item readable

#### Rollback/Cleanup
- Restore any previous clipboard contents manually if needed

---
