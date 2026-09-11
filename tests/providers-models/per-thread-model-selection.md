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

### Feature: Per-thread reasoning effort

#### Prerequisites
- Global reasoning effort is `low`; thread A resumes with `reasoningEffort: "medium"`, and thread B with `"high"`.
- Use isolated test threads or intercept app-server responses and outgoing `turn/start` requests to avoid changing real conversations.
- For browser coverage, use light/dark themes at 375x812 and 768x1024.

#### Steps
1. Open thread A. Verify the composer shows Medium, then reload and verify Medium again.
2. Open thread B and verify High; return to A and verify Medium.
3. Send a test message in A and inspect `turn/start.params.effort`.
4. Manually choose XHigh in A, switch to B and back, and refresh thread metadata without reloading the page.
5. Delay A's resume response, switch to B, then release A's response.
6. In a fresh page state, delay A's resume response and manually choose High or the automatic/empty option before releasing the response.
7. Open a thread whose resume response has no recognized effort.
8. Select Medium in the new-thread composer; delay thread creation, switch to B, then release creation and inspect the new thread's first `turn/start` request.

#### Expected Results
- A restores Medium across reopening and page reload, and sends `effort: "medium"` despite global Low.
- B keeps High; late A responses do not change B's composer.
- Manual choices survive thread switching and metadata refresh, including choices made during resume. Reload restores server-persisted effort; unsent choices are only retained within the current page.
- Missing/unrecognized server effort falls back to the global default without inheriting another thread's selection.
- The new thread sends its captured composer effort even if selection changes while creation is pending.
- Selecting A and sending needs one resume, with no additional API call to fetch reasoning effort. Cached switching does not add resumes.

#### Rollback/Cleanup
- Remove isolated test threads or close the intercepted browser context. Restore any test-only global config changes.
