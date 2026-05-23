# Mobile terminal command dropdown stays on screen

## Feature/Change Name
Composer dropdown menus are viewport-clamped so the terminal command dropdown remains visible on mobile.

## Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 0.0.0.0 --port 4173`.
2. Open the app on a mobile viewport or mobile browser with a thread whose project exposes terminal quick commands.

## Steps
1. In light theme, open a thread at mobile width.
2. Tap the terminal command dropdown in the content header.
3. Confirm the menu is fully visible within the left and right viewport edges.
4. Confirm long command labels truncate inside the menu instead of pushing the menu off-screen.
5. Scroll or rotate the viewport while the menu is open and confirm it remains clamped to the visible viewport.
6. Repeat the dropdown check in dark theme.

## Expected Results
- The terminal command dropdown does not render off the left or right edge on mobile.
- Command rows remain tappable and readable.
- Resize and scroll repositioning only runs while the dropdown is open.
- Light and dark theme dropdown surfaces remain readable.

## Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
