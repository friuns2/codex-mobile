### GPT-5.6 Max and Ultra thinking levels

#### Feature/Change Name
GPT-5.6 reasoning-level selection supports the new `max` and `ultra` values.

#### Prerequisites/Setup
1. Install a Codex CLI version whose model catalog includes GPT-5.6 and its new reasoning levels.
2. Sign in with an account that can use a GPT-5.6 model.
3. Build and start the app.

#### Steps
1. Start a new chat and select `GPT-5.6-Sol` or another available GPT-5.6 model.
2. Open the Thinking selector in light theme and confirm `Max` and `Ultra` are present.
3. Select `Max`, send a prompt, and confirm the turn starts without an invalid reasoning-effort error.
4. Select `Ultra`, send a second prompt, and confirm the turn starts without an invalid reasoning-effort error.
5. Switch to dark theme and repeat the selector visibility check.
6. Reload the page while `Ultra` is configured and confirm the selector still displays `Ultra`.

#### Expected Results
- The Thinking selector includes `Max` and `Ultra` after `Extra high`.
- Selecting either value passes the exact lowercase `max` or `ultra` value to Codex.
- A configured `max` or `ultra` value survives config normalization and appears selected after refresh.
- The options remain readable in light and dark themes.

#### Rollback/Cleanup
- Restore the preferred model and thinking level.

---
