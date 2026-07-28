# Feature: Thread goal mode

## Prerequisites

- Run CodexApp against a Codex app-server version that exposes `thread/goal/get`, `thread/goal/set`, and `thread/goal/clear`.
- Open an existing idle chat.

## Steps

1. Type `/` and confirm the composer shows all six Goal commands plus the supported Codex commands: Plan, Review, Compact, Model, Rename, Fork, and Archive.
2. Use Arrow Up/Down to change the highlighted command, Tab to complete it, and Escape to dismiss the menu.
3. Type `/goal pa` and confirm the list filters to **Pause goal**; press Tab and confirm the composer contains `/goal pause` without submitting it.
4. Type `/goal Ship the goal-mode feature with tests` and confirm the picker becomes a **Start a goal** execution preview.
5. Send the command and confirm the objective appears in a goal bar above the composer and app-server starts the autonomous goal loop.
6. Send `/goal` and confirm the existing goal remains visible without adding a chat message.
7. Choose **Edit**, change the objective, save it, and reload the page.
8. Choose **Pause**, then **Resume**, and verify the status label changes each time.
9. Send `/goal edit Refined objective`, `/goal pause`, and `/goal resume`; verify each command updates the same bar without appearing as a user message.
10. Open the chat at 375x812 and 768x1024 in both light and dark themes; verify the picker, preview, objective, status, and actions remain legible without horizontal page overflow.
11. Choose **Clear**, accept the confirmation, and reload the page.
12. From Home, select **Start a goal** from the slash picker, enter an objective, and confirm a new chat is created with an active goal and its first turn starts.

## Expected Results

- Goal state is persisted by app-server, restored when selecting or reloading the thread, and updated immediately by goal notifications.
- Goal commands are handled as controls rather than ordinary chat messages.
- The slash picker makes Goal mode discoverable before submission and filters as a command prefix is typed.
- Codex commands execute through their native app-server actions; command text is not sent to the model as an ordinary prompt.
- Commands that require an objective complete their syntax instead of submitting an incomplete command.
- Goal loading is cached per thread; notifications update local state without triggering a thread-list or message reload.
- CodexApp does not issue a duplicate `turn/start`; app-server owns the autonomous goal loop.
- Editing, pausing, resuming, and clearing never start an extra agent turn.
- The goal bar is usable in light and dark themes at desktop, phone, and tablet widths.

## Rollback/Cleanup

- Clear any test goal with `/goal clear` or the **Clear** action.
