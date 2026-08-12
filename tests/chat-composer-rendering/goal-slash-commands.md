### Goal slash commands

#### Feature/Change Name
`/goal` slash-command support: `/goal <objective>` sets an active thread goal, `/goal` shows the current goal, `/goal pause` / `/goal resume` change goal status, and `/goal clear` removes the goal. Goal commands route to the `thread/goal/*` RPCs and never start or steer a normal turn.

#### Prerequisites/Setup
1. Dev server running at `http://100.107.32.83:4173`
2. App server running against a Codex build that exposes `thread/goal/get`, `thread/goal/set`, and `thread/goal/clear`
3. At least one existing thread is available
4. Light and dark themes are both available from Settings

#### Steps
1. Run `pnpm vitest run src/api/codexGateway.test.ts src/composables/useDesktopState.test.ts`
2. Run `pnpm run build:frontend`
3. Open an existing thread in light theme
4. Type `/` in the composer and confirm `/goal` and `/plan` are the first two rows, followed by available skills
5. Select `/goal` and confirm the slash token disappears and a Goal mode button appears after the Thinking control
6. Click the Goal mode button and confirm it disappears; select `/goal` again, type an objective, and submit it
7. Type `/plan`, select the `/plan` row, and confirm a Plan mode button appears after the Thinking control without submitting a turn
8. Click the Plan mode button and confirm it disappears and the composer returns to Default mode
9. Confirm no normal user prompt is appended and no new turn starts
10. Confirm the live overlay shows `Goal active` and includes the submitted objective
11. Type `/` again, select a skill, and confirm the slash token is removed and the skill appears as a selected chip
12. Submit `/goal $planning-with-files Track goal slash-command support`
13. Confirm the command still routes to the goal workflow, the live overlay shows `Goal active`, and no normal turn starts even though a skill is attached
14. Submit `/goal`
15. Confirm the current goal is shown without starting or steering a turn
16. Submit `/goal pause`, then confirm the overlay shows `Goal paused`
17. Submit `/goal resume`, then confirm the overlay returns to `Goal active`
18. Submit `/goal clear`, then confirm the goal notice disappears
19. From the new-thread composer, submit `/goal Validate new-thread goal setup`
20. Confirm a new thread is created, the goal notice appears, and no normal turn is started
21. From the new-thread composer, submit `/goal $planning-with-files Validate new-thread goal setup`
22. Confirm a new thread is created, the skill mention does not start a normal turn, and the goal notice appears
23. Repeat steps 3-22 in dark theme
24. While a goal-driven turn is running with the goal notice showing `Goal active`, press the Stop/interrupt button
25. Confirm the turn stops, the goal notice switches to `Goal paused`, and the agent does not auto-continue the turn
26. Submit `/goal resume`, then confirm the goal returns to `Goal active` (resume later or `/goal clear` when done)
27. Open an existing thread that already has a persisted goal and confirm its status/objective card appears above the composer without typing `/goal`
28. Click the goal card pencil or Goal composer pill, edit the objective and status, save, refresh, and confirm both changes persist
29. Repeat the persisted goal card and editor checks in dark theme, then restore or clear the test goal

#### Expected Results
- `/goal <objective>` routes to `thread/goal/set` with `status: active`
- `/goal` routes to `thread/goal/get`
- `/goal pause` and `/goal resume` route to `thread/goal/set` status updates
- `/goal clear` routes to `thread/goal/clear` and hides the goal notice
- Typing `/` opens a popup with `/goal` and `/plan` first, followed by available skills
- Selecting a skill from the `/` popup adds it to the selected skill chips
- Selecting `/goal` toggles a visible Goal mode button and leaves no command text in the draft
- Submitting in Goal mode routes the objective through `/goal <objective>` and clears the Goal mode button
- Selecting `/plan` toggles a visible Plan mode button without submitting a turn or leaving `/plan` in the draft
- Clicking either active mode button turns that mode off; Goal and Plan are mutually exclusive
- Slash rows, selected rows, and active mode buttons remain readable in light and dark themes
- Goal commands do not call `turn/start` or `turn/steer`
- Goal commands that include skill mentions still route to goal RPCs instead of normal turns
- New-thread `/goal <objective>` creates the thread, sets the goal, and does not show an interrupt-pending state
- Stopping an active goal-driven turn pauses the goal first so the agent does not auto-continue
- Interrupt works even when the active turn id is only known from the persisted thread detail
- Light and dark theme overlays remain readable
- Persisted goals hydrate on thread selection and remain editable after refresh

#### Rollback/Cleanup
- Use `/goal clear` on test threads after manual verification
- Archive or delete test threads created only for this check

---
