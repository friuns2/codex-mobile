# Zen hybrid model routing

- Keep Codex pointed at the local Responses endpoint. Resolve the upstream API from each request's model; never mutate a global wire API on model selection.
- Join Zen's live IDs with Models.dev's `opencode` metadata. Apply model SDK overrides before provider defaults. Treat unknown SDKs as unsupported. Filter keyless models using zero input and output prices, not names.
- Share the catalog between discovery and dispatch. Cache for five minutes, coalesce concurrent loads, back off failures for 30 seconds, and expire last-known-good data after 24 hours. Bound credential cache entries to eight.
- Show inferred API badges in the existing searchable composer dropdown. Disable models with no agent-tool support or an unknown route. Preserve existing selected-model persistence.
- Stream Responses directly. Translate Chat Completions text, reasoning, function arguments, finish state, and usage to Responses events. Preserve stable item/call IDs. Fail truncated streams instead of claiming success. Bound translated stream size to 32 MiB and individual Zen event frames to 4 MiB.
- Alias required Zen `bash` and `read` tools only to an existing shell function with its real schema. Restore executable names in upstream events. Reject requests without executable admission tools; never append dummy tools.
- Translate image parts when the selected model advertises image input. Reject unsupported attachment types, unsupported tools, opaque-only reasoning, and provider response IDs explicitly. Replay portable history rather than forwarding response IDs.
- Keep routing SDK-inferred until completion tests prove access. Do not retry a different API after errors or a partial response.
- Run the focused unit suite and packaged Docker provider checks before delivery. Inspect browser profiler duplicate counts, payload sizes, and request timing. Compare both light and dark model menus.
