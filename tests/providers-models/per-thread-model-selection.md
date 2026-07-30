### Feature: Per-thread model selection

#### Prerequisites
- App is running from this repository against a Codex app-server that supports thread-scoped model persistence.
- At least two selectable models are available in the composer model picker.
- At least one existing thread is available, or you can create one during the test.

#### Steps
1. On the new-thread screen, choose model `A` in the composer.
2. Send a message to create a new thread.
3. In that thread, switch the composer model to model `B`.
4. Send another message in the same thread so the thread persists model `B`.
5. Create or open a different thread and set its model to model `A`.
6. Switch back and forth between the two threads.
7. Refresh the browser while one of the threads is selected.
8. Re-open both threads again after the refresh.
9. While thread `A` is selected, use the sidebar thread menu to fork thread `B`.
10. Open the forked thread and confirm the composer model matches thread `B`, not the currently selected thread.
11. Restart the app-server or otherwise force a model-list refresh that does not include one thread’s persisted model, then switch back to that thread.
12. Delete one of the test threads you changed, refresh the thread list, and continue switching between the remaining thread and the new-thread screen.

#### Expected Results
- Each thread restores its own last selected model when you switch threads.
- The new-thread screen keeps its own draft model selection instead of inheriting the last opened thread.
- After browser refresh, reopening a thread restores the model persisted for that thread.
- Forked or newly created threads keep the resolved model returned by Codex, including fallback to the supported default model when needed.
- Forking a nonselected thread from the sidebar uses that source thread’s persisted model.
- If the selected thread’s persisted model is not returned in the latest model list, the composer still shows that model as the active selection instead of falling back to the placeholder label.
- Removing a thread prunes its saved per-thread model state, and model selection continues to update normally for the remaining threads without runtime errors.

#### Rollback/Cleanup
- Reset each tested thread back to its original model selection if you changed an existing conversation for the test.

---

### Feature: Model-aware reasoning effort picker

#### Prerequisites
- App is running against a Codex app-server whose `model/list` response includes `supportedReasoningEfforts`.
- `gpt-5.6-sol` is available with `max` and `ultra`.
- A second model without `ultra` is available.

#### Steps
1. In light theme, select `gpt-5.6-sol` in the composer model picker.
2. Open the Thinking picker and inspect the listed options.
3. Select `Ultra`, close the picker, and verify the trigger shows `Ultra`.
4. Switch to the second model that does not support `Ultra`.
5. Open the Thinking picker again.
6. Repeat steps 1–5 in dark theme.

#### Expected Results
- The Thinking picker preserves the effort order returned by the app-server.
- `Max` and `Ultra` appear for `gpt-5.6-sol`.
- Efforts not returned for the selected model are absent.
- Switching away from a model while an unsupported effort is selected changes the selection to that model's advertised default (or first supported effort).
- Provider-only models without effort metadata retain the conservative legacy choices and do not invent `Max` or `Ultra`.
- The custom picker is readable and correctly positioned in both themes.

#### Rollback/Cleanup
- Restore the original model and reasoning effort for any existing thread changed during the test.
