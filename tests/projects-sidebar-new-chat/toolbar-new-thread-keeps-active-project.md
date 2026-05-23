# Toolbar new thread keeps active project

## Feature/Change Name
The global Start new thread action opens the new-thread composer with the active thread's project selected.

## Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 127.0.0.1 --port 4173`.
2. Use a workspace with at least one project-backed thread.

## Steps
1. In light theme, open `http://127.0.0.1:4173/#/`.
2. Select a thread inside a project from the sidebar.
3. Click the toolbar Start new thread button.
4. Confirm the home/new-thread composer opens with the same project folder selected, not an empty or projectless selection.
5. Send a first message and confirm the new thread appears under the same project in the sidebar.
6. While already on the home/new-thread route with a folder selected, click Start new thread again and confirm the selected folder is not cleared.
7. Repeat the selection and Start new thread flow in dark theme.

## Expected Results
- The toolbar Start new thread action preserves the active thread's project context.
- The new-thread folder dropdown shows the project folder immediately after navigation.
- Existing home-route folder selection is preserved when no active thread project resolves.
- New threads created from that composer are grouped under the same project.
- Light and dark theme controls remain readable.

## Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
