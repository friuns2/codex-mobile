### Desktop and browser shared realtime sync

#### Feature/Change Name
Synchronize the host Codex desktop with two authenticated browser clients while preserving cached sessions through a managed app-server restart.

#### Prerequisites/Setup
1. A built `codex-ui` host is running with a shared password on a recorded test port.
2. Codex desktop is running as the same operating-system user and uses the same resolved `CODEX_HOME`.
3. Browser A and Browser B are signed in to the same host URL.
4. Browser developer tools or the runtime profiler is available for request-count checks.
5. Record the `codex-ui` parent process and its single managed Codex app-server child before testing restart recovery.

#### Steps
1. Open the home route in Browser A and Browser B and confirm both show the existing host project/session list.
2. In Codex desktop, create a session named `shared-sync-<timestamp>` in a known project.
3. Wait at least 250 ms for coalescing and up to 2 seconds for transport/rendering; do not reload either browser.
4. Confirm the new session appears in both browser sidebars.
5. Open the new session in Browser A, then open the same session in Browser B.
6. Confirm Browser B loads the complete session through the read-only fallback without showing an `already has an active writer` or `thread/resume` error.
7. Start a turn containing the same unique timestamp in Browser A and keep Browser B open on that session.
8. Confirm Browser B receives the turn state and completed content without a manual reload.
9. Verify the coalesced update produces at most one forced first-page `thread/list` and one selected `thread/read` in each browser.
10. Terminate only the recorded managed Codex app-server child, leaving the `codex-ui` parent running.
11. While the child restarts, confirm both browsers keep their cached projects, sessions, and selected messages visible.
12. Confirm the header health state changes to reconnecting or unavailable, then returns to `Codex connected` after automatic recovery.
13. Create or rename one more desktop session and confirm both browsers converge again without reload.
14. Repeat the visible status and session checks in light and dark themes at `1440x900` and `375x812`.

#### Expected Results
- Desktop filesystem/native app-server signals converge in both authenticated browsers in real time.
- A second client can open a session already resumed by another client; only the explicit active-writer conflict falls back to `thread/read`.
- Duplicate/lower invalidation revisions do not cause duplicate list or selected-thread requests.
- A reconnect `ready` revision forces recovery when browser state may be stale.
- Only the open affected thread is re-read; unrelated thread histories and repositories are not scanned.
- A failed forced refresh never replaces cached project groups or messages with an empty state.
- The supervised app-server restarts with one active child, and the health badge reports the transition without moving adjacent controls.
- The coordinator uses no more than three Codex state watchers.
- Light/dark desktop and mobile layouts have no clipped status text, overlap, horizontal overflow, or duplicate live overlay.

#### Rollback/Cleanup
- Stop only the test host parent process and confirm its managed child exits.
- Close the two test browser sessions and remove the uniquely named test session only if it is no longer needed.
- Preserve profiler output needed as verification evidence; otherwise remove only the generated test artifacts.

---
