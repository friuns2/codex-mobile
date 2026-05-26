### Feature: Projectless new chat folders

#### Prerequisites
- App server is running from this repository.
- Home directory is writable.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the app in light theme and select a project-backed thread so the new-thread composer would normally have a folder context.
2. Expand the sidebar `Chats` section and click its `New chat` action.
3. Confirm the home composer does not inherit the selected thread folder and the selected-folder line is absent.
4. Send a first message with a unique prompt such as `Projectless folder smoke test`.
5. Confirm the new thread starts in `~/Documents/Codex/<YYYY-MM-DD>/projectless-folder-smoke-test`.
6. Start another new chat with the same prompt and confirm the folder receives a numeric suffix.
7. Switch to dark theme and repeat steps 1-4 with a different unique prompt.

#### Expected Results
- `New chat` starts as a projectless chat instead of reusing the current thread cwd.
- The `Chats` section `New chat` action clears any selected folder even when a project-backed thread is selected.
- Sending the first message creates a real directory under `~/Documents/Codex/<YYYY-MM-DD>/`.
- Folder names are derived from the prompt using lowercase alphanumeric tokens, with suffixes for duplicates.
- Projectless chat rows appear in the `Chats` section and do not create a separate project group from the generated folder name.
- Short projectless prompts such as `hi` remain visible in `Chats` after the thread list refreshes and workspace-root filtering runs.
- If the selected model returns `requires a newer version of Codex`, the turn retries with `gpt-5.4-mini` instead of leaving the new chat failed on 5.5.
- Light and dark theme composer surfaces remain readable and unchanged apart from the folder behavior.

#### Rollback/Cleanup
- Delete only the test folders created under `~/Documents/Codex/<YYYY-MM-DD>/`.
