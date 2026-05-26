### Sidebar sessions survive symlinked workspace roots

#### Feature/Change Name
Workspace roots and thread-list cwd values are canonicalized through local `realpath` before the sidebar filters thread projects and before workspace-root state is written, so sessions remain visible whether they were recorded through a symlink path or its target.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A workspace root registered through a symlink path, for example `/workspace-link/projects/demo`
3. At least one session recorded with the canonical cwd, for example `/storage/projects/demo`
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the app and wait for the sidebar thread list to load.
2. Confirm a session recorded under the canonical cwd appears in the sidebar.
3. Confirm a session recorded under the symlink cwd also appears in the sidebar.
4. Search for both known session titles and confirm both rows remain findable.
5. Fetch `/codex-api/workspace-roots-state` and confirm local symlink roots are returned as their canonical real paths.
6. If both symlink and canonical forms have saved labels, confirm only the canonical path label is returned and displayed.
7. Add or update a workspace root through the UI using the symlink path, then reload `/codex-api/workspace-roots-state` and confirm the saved root remains in canonical form.
8. Fetch `thread/list` with multiple sessions that share the same cwd and confirm the rows still show under the canonical project.
9. Switch to dark theme and repeat steps 1-4.

#### Expected Results
- A registered symlink root and a session cwd pointing at the symlink target are treated as the same project.
- Sessions recorded through either path form are not filtered out as unregistered workspace roots.
- Duplicate symlink/canonical labels collapse deterministically to the canonical path label.
- Workspace-root writes do not reintroduce symlink/canonical duplicates into persisted state.
- Repeated cwd values in one `thread/list` response reuse the same canonical path result and do not change visible rows.
- Search and sidebar browsing both expose the session.
- Rows remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---
