### Accounts panel Codex device login

#### Feature/Change Name
The sidebar account menu presents identity, subscription usage, saved accounts, and `codex login --device-auth` separately from application Settings. Device sign-in completes automatically without a localhost callback URL or manual reload.

#### Prerequisites/Setup
1. Dev server running with an isolated `CODEX_HOME` that has no `auth.json`
2. `codex` CLI available in the server process `PATH`
3. A ChatGPT account that can use Codex
4. Light and dark themes available from the appearance switcher

#### Steps
1. At a 375x812 viewport, open the sidebar and confirm a user/account button appears beside the Settings icon.
2. Open the account menu and verify the active email, auth/plan metadata, subscription quota card, saved accounts, Reload, and Add account actions are visible without opening Settings.
3. Open Settings separately and confirm account-management cards are absent while the upstream-compatible subscription quota card remains.
4. Click `Add account` (or `Sign in with ChatGPT` with no accounts) and verify a `Sign in to Codex` dialog displays a one-time code and waiting state.
5. Tap `Copy code & continue`, verify the OpenAI device page opens, and paste into its code field to confirm the displayed code was copied.
6. Complete ChatGPT authorization and return to the app without pasting a callback URL or clicking reload.
7. Verify the dialog closes automatically, the signed-in account becomes active, and Codex models become available.
8. Start login again, press `Cancel`, and verify a fresh login can be started without reusing the abandoned process.
9. Repeat steps 1-4 at 768x1024 and in dark theme.

#### Expected Results
- The server invokes `codex login --device-auth` and returns only the verification URL and one-time user code.
- Account identity and management live in a dedicated user menu; general Settings starts with preferences instead of account cards.
- The account menu includes the current Codex subscription/quota card, while Settings retains its existing quota card for upstream compatibility.
- `Copy code & continue` copies the code and opens the official OpenAI device page in one tap.
- A single bounded status poll runs at a time and stops after completion, failure, cancellation, or component teardown.
- Successful CLI completion imports `$CODEX_HOME/auth.json`, activates the account, refreshes account metadata, and closes the dialog automatically.
- No localhost callback URL, terminal access, manual account reload, or browser text selection is required.
- The code, waiting state, actions, and errors remain readable and tappable in light/dark mobile layouts.

#### Rollback/Cleanup
- Remove the test account from Accounts if needed.
- Cancel any unfinished login from the dialog before stopping the test server.

---
