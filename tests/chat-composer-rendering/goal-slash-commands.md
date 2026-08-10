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
4. Type `/` in the composer and confirm the popup lists available skills first, followed by `/goal` and `/plan`
5. Type `/goal`, select the `/goal` row with Enter or click, and confirm `/goal ` is inserted with the cursor ready for an objective
6. Type `/plan`, select the `/plan` row, and confirm Plan mode toggles without submitting a turn; select it again to return to Default mode
7. Submit `/goal Ship goal slash-command support`
7. Confirm no normal user prompt is appended and no new turn starts
8. Confirm the live overlay shows `Goal active` and includes `Ship goal slash-command support`
9. Type `/` again, select a skill, and confirm the slash token is removed and the skill appears as a selected chip
10. Submit `/goal $planning-with-files Track goal slash-command support`
11. Confirm the command still routes to the goal workflow, the live overlay shows `Goal active`, and no normal turn starts even though a skill is attached
12. Submit `/goal`
13. Confirm the current goal is shown without starting or steering a turn
14. Submit `/goal pause`, then confirm the overlay shows `Goal paused`
15. Submit `/goal resume`, then confirm the overlay returns to `Goal active`
16. Submit `/goal clear`, then confirm the goal notice disappears
17. From the new-thread composer, submit `/goal Validate new-thread goal setup`
18. Confirm a new thread is created, the goal notice appears, and no normal turn is started
19. From the new-thread composer, submit `/goal $planning-with-files Validate new-thread goal setup`
20. Confirm a new thread is created, the skill mention does not start a normal turn, and the goal notice appears
21. Repeat steps 3-20 in dark theme
22. While a goal-driven turn is running with the goal notice showing `Goal active`, press the Stop/interrupt button
23. Confirm the turn stops, the goal notice switches to `Goal paused`, and the agent does not auto-continue the turn
24. Submit `/goal resume`, then confirm the goal returns to `Goal active` (resume later or `/goal clear` when done)

#### Expected Results
- `/goal <objective>` routes to `thread/goal/set` with `status: active`
- `/goal` routes to `thread/goal/get`
- `/goal pause` and `/goal resume` route to `thread/goal/set` status updates
- `/goal clear` routes to `thread/goal/clear` and hides the goal notice
- Typing `/` opens a popup with available skills first, followed by `/goal` and `/plan`
- Selecting a skill from the `/` popup adds it to the selected skill chips
- Selecting `/goal` from the popup inserts `/goal ` without submitting a turn
- Selecting `/plan` toggles Plan mode without submitting a turn or leaving `/plan` in the draft
- Goal commands do not call `turn/start` or `turn/steer`
- Goal commands that include skill mentions still route to goal RPCs instead of normal turns
- New-thread `/goal <objective>` creates the thread, sets the goal, and does not show an interrupt-pending state
- Stopping an active goal-driven turn pauses the goal first so the agent does not auto-continue
- Interrupt works even when the active turn id is only known from the persisted thread detail
- Light and dark theme overlays remain readable

#### Rollback/Cleanup
- Use `/goal clear` on test threads after manual verification
- Archive or delete test threads created only for this check

---
