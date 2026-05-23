### Feature: Rollback undoes apply_patch file changes

#### Prerequisites
- App is running from this repository (`pnpm run dev`).
- A thread exists with at least one completed turn that applied file changes via `apply_patch`.
- The thread's `cwd` points to a git-tracked directory.

#### Steps
1. Open a thread with file changes visible in the conversation (file change cards with diffs).
2. Note the current state of a file that was modified by the agent in a recent turn.
3. Click the rollback button on a turn that has file changes.
4. After rollback completes, check the file on disk — it should be restored to the state before the agent modified it.
5. Verify the thread conversation no longer shows the rolled-back turns.
6. For turns that added new files: verify the added files are deleted from disk.
7. For turns that deleted files: verify the deleted files are restored (if they were tracked in git).

#### Expected Results
- Clicking rollback on a turn reverts both the thread history AND the file system changes from that turn and all subsequent turns.
- Files modified by `apply_patch` in rolled-back turns are restored via `git checkout HEAD -- <path>`.
- Files created by `apply_patch` in rolled-back turns are removed from disk.
- Files deleted by `apply_patch` in rolled-back turns are restored from git HEAD.
- File moves in rolled-back turns are reversed (moved file is renamed back to original path).
- If file revert fails (e.g., not a git repo), the thread rollback still proceeds — file revert is best-effort.
- The rollback-files endpoint (`POST /codex-api/thread/rollback-files`) can be called independently for testing.

#### Rollback/Cleanup
- No cleanup required — rolled-back files are already restored.

### Feature: Chat file-change undo and redo

#### Prerequisites
- App is running from this repository (`pnpm run dev`).
- A thread exists with at least one completed assistant turn that applied file changes via `apply_patch`.
- The thread's `cwd` points to a writable worktree.

#### Steps
1. Open a thread with a visible file-change summary under an assistant response.
2. Expand the file-change summary, identify one changed file, and save its current contents with `cat <file> > /tmp/file-before-undo.txt`.
3. Confirm the file-change action row shows `Undo` and does not show a separate `Redo` button.
4. Click `Undo` in the file-change action row.
5. Confirm the button enters an `Undoing` pending state and then changes to `Redo`.
6. Verify the file contents on disk are restored to the pre-turn state with `diff -u /tmp/file-before-undo.txt <file>`.
7. Click `Redo` in the same file-change action row.
8. Confirm the button enters a `Redoing` pending state and then changes back to `Undo`.
9. Verify the file contents on disk match the assistant turn's changes again with `cat <file>` or a diff against the assistant-modified snapshot.
10. Repeat steps 1-9 in light theme and dark theme.

#### Expected Results
- Undo reverts the file changes applied by the selected turn without changing chat history.
- Redo reapplies the previously run `apply_patch` input without changing chat history.
- The file-change action row shows exactly one action button at a time: `Undo` before rollback, `Redo` after undo, and `Undo` again after redo.
- If Undo fails, the inline error stays visible and the single action still switches to `Redo` so the user can reapply or recover the visible action state.
- Any backend error appears inline in the file-change panel.
- The action row uses themed controls that remain readable in light and dark theme.

#### Verification Evidence
- Light screenshot: `output/playwright/chat-file-changes-failed-undo-single-redo-light.jpg`.
- Dark screenshot: `output/playwright/chat-file-changes-failed-undo-single-redo-dark.jpg`.
- Browser runtime profile: `output/playwright/browser-runtime-profile-home-2026-05-20T03-11-53-121Z.json`.
- Profile result on `http://127.0.0.1:4173/`: `warnings: []`, `threadReadDuplicateKeys: 0`, `totalApiKB: 337.9`.
- Code-path audit: file-change action state is component-local and keyed by thread plus turn, so it does not add startup or thread-list requests. Undo/redo server work is request-scoped, bounded to collected patch inputs for the selected turn or explicit patch subset, and uses sequential filesystem operations without background fanout.

#### Rollback/Cleanup
- Click `Undo` again if the test should leave the worktree without the assistant's file changes.
