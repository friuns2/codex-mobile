# Copied Auth Provider Promotion Fix

Date: 2026-05-13

## Problem

In Docker no-auth mode, Codex Web Local starts with an OpenCode Zen runtime fallback. If the user switched the provider to OpenRouter while unauthenticated and then copied a valid `auth.json` into the mounted `CODEX_HOME`, the UI detected Codex auth but kept stale community-provider state.

Observed issues:
- Provider stayed on OpenRouter after valid Codex auth appeared.
- The Accounts badge stayed at `0` until a manual account refresh.
- The new-thread composer could show a generic `Model` label after provider promotion.
- The Settings feedback row could show stale `Send feedback / Issue detected` after recovery even when there was no visible current error.
- Sending on Codex worked after manually switching provider, proving the copied auth file was valid.

## Root Cause

The server read `webui-custom-providers.json` as authoritative whenever it existed. That file can contain community fallback provider state created during the unauthenticated phase. After `auth.json` appeared, the fallback provider state still supplied app-server provider flags and `/codex-api/free-mode/status` data.

The frontend also relied on the accounts snapshot for the Accounts count. A copied `auth.json` did not automatically import the active auth file into the accounts store.

Finally, provider-scoped new-thread model persistence applied to non-Codex providers but not to Codex. After provider promotion, the home composer could temporarily fall back to the generic `Model` placeholder instead of a concrete Codex model.

## Fix

Commit:
- `7ee94f83 Promote copied auth to Codex provider`

Implementation details:
- Added `shouldSuppressCommunityFreeModeForCodexAuth()` in `src/server/freeMode.ts`.
- `ensureDefaultFreeModeStateForMissingAuthSync()` now returns `null` when usable Codex auth exists and the existing provider state is only community fallback (`openrouter` or `opencode-zen` without a custom key).
- User-configured providers are preserved:
  - OpenRouter with `customKey: true`
  - OpenCode Zen with an explicit API key
  - Custom endpoint provider
- `/codex-api/free-mode/status` now reports `hasCodexAuth`.
- `App.vue` uses `hasCodexAuth` to import a copied active `auth.json` into Accounts via `refreshAccountsFromAuth()` once.
- New-thread model persistence now uses provider-scoped slots for Codex as well as non-Codex providers.
- The Settings feedback row is shown only when a current visible error exists, not merely because historical diagnostics exist.

## Docker Validation

Fresh packaged image:

```text
codexui-local:e5e9-auth-promote-final2
```

Flow:
1. Start a fresh container with empty mounted `CODEX_HOME`.
2. Confirm initial provider is `opencode-zen`.
3. Switch provider to `openrouter`.
4. Copy `/Users/igor/.codex/auth.json` into the mounted `CODEX_HOME`.
5. Reload the UI.
6. Confirm provider changes to `codex`.
7. Confirm Accounts count becomes `1`.
8. Confirm the composer shows a concrete Codex model, not generic `Model`.
9. Confirm no stale `Send feedback / Issue detected` row appears.
10. Send `hi`; wait for a Codex reply.

Final validation result:

```json
{
  "initialProvider": "opencode-zen",
  "afterSwitchProvider": "openrouter",
  "afterCopyProvider": "codex",
  "afterCopyAccounts": 1,
  "afterCopyHasIssue": false,
  "finalProvider": "codex",
  "finalHasIssue": false,
  "stillBusy": false
}
```

Screenshot artifacts:
- `output/playwright/auth-promote-final2-01-noauth.png`
- `output/playwright/auth-promote-final2-02-openrouter.png`
- `output/playwright/auth-promote-final2-03-after-copy.png`
- `output/playwright/auth-promote-final2-04-reply.png`

## Verification Commands

```bash
pnpm test:unit src/server/freeMode.test.ts src/server/codexAppServerBridge.archive.test.ts src/composables/useDesktopState.test.ts src/api/codexGateway.test.ts
pnpm run build
pnpm pack --pack-destination /tmp
```
