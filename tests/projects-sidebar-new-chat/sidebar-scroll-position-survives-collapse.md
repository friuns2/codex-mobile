# Sidebar scroll position survives collapse

## Feature/Change Name
Sidebar scroll position is restored after closing and reopening the sidebar.

## Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 127.0.0.1 --port 4173`.
2. Use a workspace with enough sidebar projects or threads for the sidebar list to scroll.

## Steps
1. In light theme, open `http://127.0.0.1:4173/#/`.
2. Scroll the sidebar list downward until a lower project or thread row is near the top of the sidebar.
3. Collapse the sidebar with the sidebar toggle or `Command+B`.
4. Reopen the sidebar with the header/sidebar toggle or `Command+B`.
5. Confirm the same lower project or thread row is still near the top and the sidebar did not jump back to the top.
6. Repeat collapse/reopen twice quickly and confirm the restored position is not clobbered to the top while collapsed.
7. Repeat the collapse and reopen flow in dark theme.

## Expected Results
- Closing and reopening the sidebar restores the previous vertical scroll offset.
- The remembered scroll position remains stable while the sidebar content is remounted.
- Mobile drawer restore retries after reopen until the full list height is available, so transition/teleport timing does not leave the sidebar at the top or a partial intermediate offset.
- Scroll events emitted after collapse do not overwrite the saved offset.
- Light and dark theme sidebar rows remain readable after restore.

## Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
