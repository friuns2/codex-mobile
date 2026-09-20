# Zen automatic per-model routing

## Prerequisites

- Build with `pnpm run build`.
- Start isolated packaged servers with `scripts/run-zen-hybrid-docker.sh`. Select `/codex-home/zen-hybrid-e2e` so the test folder survives container replacement.
- Create invalid-auth fixtures with complete fake ChatGPT token fields and a structurally valid fake JWT. Include access token, ID token, refresh token and account ID. Do not use real credentials or mistake malformed-auth fallback for an invalid-token failure.
- Keep the persistent tmux server on port 5173 untouched.
- Refresh the Zen model catalog. Treat zero prices and inferred API routes as metadata, not access proof.

## Actions and expected results

1. Open the model dropdown in light and dark themes. Confirm Responses badges for Muse, Chat badges for compatible models, and disabled no-tool/unknown models. Search by model name.
2. Select Muse, send a unique greeting, and inspect a completed streamed reply. Reload and confirm model selection persists.
3. Select MiMo or Big Pickle in the same conversation. Request a harmless shell command such as `printf zen-hybrid-ok`. Confirm the command executes and the model reads its result before the final answer. Switch back to Muse and repeat.
4. Run simultaneous conversations on different protocols. Confirm the requests use their own selected models and do not change provider configuration.
5. Interrupt a streaming turn. Confirm the upstream connection closes and no completed overlay is synthesized.
6. Submit an unknown model and an unsupported attachment type. Confirm actionable errors appear without another-protocol retries.
7. Test isolated no-auth Zen fallback, malformed-auth fallback, invalid/expired Codex auth with error persistence after reload, and Zen-to-OpenRouter switching. Confirm no duplicate live overlays.
8. Run `pnpm exec vitest run src/server/zenModelCatalog.test.ts src/server/zenProxy.test.ts src/server/chatResponsesStream.test.ts src/server/unifiedResponsesProxy.test.ts src/server/codexAppServerBridge.providerModels.test.ts src/composables/useDesktopState.test.ts`.
9. Run the browser profiler against the verified server. Confirm warm catalog use adds no discovery requests per chat message and concurrent catalog loads produce one request per upstream source.

## Cleanup

- Remove only the test containers printed by the Docker script.
- Remove their named volumes only when discarding test conversations.
- Restore the previous provider/model when testing outside an isolated home.

## Hosted image generation compatibility

- Use Codex CLI 0.142.5 or newer with Zen selected.
- Start the server; inspect the child arguments for `features.image_generation=false`.
- Send a greeting and a shell-tool request; require successful replies without unsupported image-generation errors.
- Switch to OpenRouter; require the Zen-only image-generation override to be absent.
- Restore the previous provider after testing.
