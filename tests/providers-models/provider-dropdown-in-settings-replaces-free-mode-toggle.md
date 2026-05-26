### Feature: Provider dropdown in settings (replaces free mode toggle)

#### Prerequisites
- App is running from this repository (`pnpm run dev`).

#### Steps
1. Open Settings panel from the sidebar.
2. Verify the settings panel is scrollable when content overflows.
3. Verify the Accounts section does NOT have its own scrollbar — it flows naturally within the settings panel scroll.
4. Locate the **Provider** dropdown (default: "Codex").
5. Open the Provider dropdown and verify it renders as the app custom menu, not a native browser `<select>` control.
6. Change provider to **OpenRouter**.
7. Verify a "Get API key" link appears next to the OpenRouter API key label, pointing to `https://openrouter.ai/keys`.
8. Verify the API key input field is shown with placeholder `sk-or-v1-... (optional, uses free keys if empty)`.
9. Optionally enter an OpenRouter API key and click Set.
10. Change provider to **Custom endpoint**.
11. Verify URL and API key input fields appear.
12. Enter a valid endpoint URL and click Save.
13. Change provider back to **Codex**.
14. Verify the config is reset and no provider-specific fields are shown.
15. Repeat the Provider dropdown open/selection check in dark theme and confirm the trigger, menu, options, and selected state are readable.

#### Expected Results
- Provider dropdown shows Codex, OpenRouter, OpenCode Zen, and Custom endpoint.
- Provider dropdown uses the shared custom dropdown/menu component with consistent styling and dark-theme behavior.
- Selecting OpenRouter enables free mode with community keys (or custom key if provided).
- Selecting Custom endpoint allows setting a custom API base URL and bearer token.
- Selecting Codex disables external provider mode and uses the default Codex backend.
- Settings panel scrolls as a whole; accounts section has no independent scrollbar.
- OpenRouter option includes a "Get API key" link to openrouter.ai/keys.

#### Rollback/Cleanup
- Switch provider back to Codex to restore default behavior.
- Restore the preferred appearance setting if dark theme was only enabled for this check.
