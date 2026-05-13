# OpenCode Zen Docker Auth and Provider Models Fix

Date: 2026-05-13

## Problem

Codex Web Local had two Docker startup edge cases around OpenCode Zen fallback and Codex auth:

1. In an authenticated Docker container, immediately polling `/codex-api/thread-live-state` after `turn/start` could return:

```text
thread <id> is not materialized yet; includeTurns is unavailable before first user message
```

The turn completed normally, but the bridge exposed this transient Codex state as `liveStateError.kind = "readFailed"`, making the chat look broken during first-turn startup.

2. In an unauthenticated Docker container, the model selector could appear empty or stale because frontend model loading called Codex `model/list` before `/codex-api/provider-models`. In OpenCode Zen fallback mode, provider models are authoritative; `model/list` can be slow, return Codex models, or fail independently.

## Root Cause

The live-state endpoint treated every `thread/read includeTurns=true` failure as a real read failure. Codex can briefly create a thread before the first user message is materialized, so that exact error is a pending state, not a terminal failure.

The model-loading helper fetched `model/list` first and only then attempted provider model discovery. This made no-auth Zen startup depend on a Codex model-list call that is not the source of truth for Zen models.

## Fix

Commits:
- `545c0dec Handle pending first-turn live state`
- `2eaf4bd3 Load provider models before Codex model list`

Implementation details:
- Added `isThreadMaterializationPendingError()` in `src/server/codexAppServerBridge.ts`.
- `/codex-api/thread-live-state` now maps that specific pending-materialization error to:
  - `conversationState: { turns: [] }`
  - `liveStateError: null`
  - `isInProgress: true`
- Real `thread/read` failures still surface through `liveStateError`.
- `getAvailableModelIds()` now fetches `/codex-api/provider-models` first when provider models are included.
- If provider models are `exclusive` or `requireProviderModels` is true, it returns provider models without waiting on Codex `model/list`.
- Optional provider-model loading still falls back to `model/list` if provider models are unavailable.

## Docker Validation

Fresh image:

```text
codexui-local:e5e9-current
```

No-auth container:
- URL: `http://127.0.0.1:4191/#/`
- `config/read`: `model = "big-pickle"`, `model_provider = "opencode-zen"`
- App-server command includes Zen proxy flags.
- Sending `hi` returns an assistant reply.
- Model selector includes `big-pickle`, `deepseek-v4-flash-free`, and other Zen provider models.

Auth-mounted container:
- URL: `http://127.0.0.1:4192/#/`
- Mounted `/Users/igor/.codex/auth.json` to `/codex-home/auth.json`.
- `config/read`: `model = null`, `model_provider = null`
- App-server command has no Zen proxy flags.
- Sending `hi` returns an assistant reply.
- First-turn live-state polling does not expose the transient materialization error as `liveStateError`.

## Operational Notes

- For Docker validation, install the packed `codexapp` artifact during image build instead of using `pnpm dlx` at container runtime. Runtime `pnpm dlx` can re-download and extract dependencies on every start and can be killed under memory pressure.
- When validating no-auth Zen mode, trust `/codex-api/provider-models` and `/codex-api/free-mode/status` for provider models; `model/list` may still return Codex catalog rows from the Codex CLI.
- Browser verification should include a screenshot of the opened model selector after loading `http://127.0.0.1:4191/#/`.

## Verification Commands

```bash
pnpm test:unit src/server/codexAppServerBridge.archive.test.ts
pnpm test:unit src/api/codexGateway.test.ts src/composables/useDesktopState.test.ts
pnpm run build
```

