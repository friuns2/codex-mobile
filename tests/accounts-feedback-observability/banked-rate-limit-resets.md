### Banked rate-limit resets

#### Feature/Change Name
The Settings quota section shows earned banked resets and lets the user apply one to an eligible Codex rate-limit window.

#### Prerequisites/Setup
1. Sign in with ChatGPT-managed Codex authentication.
2. Use an account whose `account/rateLimits/read` response includes `rateLimitResetCredits`.
3. For the redemption path, use a disposable test credit or stub `account/rateLimitResetCredit/consume`; do not spend a real reset merely for visual testing.
4. Run the app at the active local URL and allow the initial quota refresh to finish.

#### Steps
1. Open Settings in light theme and scroll to the rate-limit cards.
2. Confirm the `Banked resets` card shows the authoritative available count.
3. When detail rows are present, verify each visible row shows its title, description, expiration date, and remaining days.
4. Click `Use reset` once and verify the button changes to `Click again to confirm` without calling the consume RPC.
5. Wait six seconds and verify the confirmation expires.
6. Click twice within six seconds and verify exactly one `account/rateLimitResetCredit/consume` request is sent with a non-empty idempotency key and the selected opaque credit ID.
7. Verify CodexApp fetches `account/rateLimits/read` after the consume response and updates both quota windows and the available reset count.
8. Exercise `reset`, `alreadyRedeemed`, `nothingToReset`, `noCredit`, and request-error responses and verify their status messages.
9. Repeat the card, confirmation, disabled/loading, and status-message checks in dark theme.
10. Repeat at 375×812 and 768×1024 and confirm the Settings panel remains usable without horizontal overflow.

#### Expected Results
- The card is absent when the service omits `rateLimitResetCredits`, shows `0 available` when the service explicitly returns zero, and treats `availableCount` as authoritative when detail rows are capped.
- A reset cannot be consumed with a single accidental click.
- While a consume request is active, all reset buttons are disabled and display `Using…`.
- The app never guesses the post-redemption count or quota; it refreshes from the app-server.
- Light and dark themes retain readable contrast, and narrow layouts remain scrollable.

#### Rollback/Cleanup
- Restore any RPC stubs used for outcome testing.
- If a disposable credit was intentionally consumed, record the account and outcome; banked resets cannot be restored by CodexApp.
