# OpenCode Zen request normalization

## Setup

- Start the current server with no Zen API key.
- Select OpenCode Zen. Refresh discovery before selecting a model.

## Actions

1. Select `muse-spark-1.3-contributor-free`. Send `hi`. Expect native Responses input at `/zen/v1/responses`.
2. Select a listed Chat model such as `mimo-v2.5-free`. Send `hi`. Expect translated input at `/zen/v1/chat/completions` without changing the API setting.
3. Request a harmless shell command. Expect executable tool schemas, stable call IDs, streamed arguments, a tool result, and a final answer.
4. Inspect both paths. Expect canonical OpenCode headers and streaming. Expect required admission tools to reuse real executable schemas and returned alias names to map back to the runtime tool.
5. Submit an unknown model. Expect an actionable routing error instead of endpoint guessing.

## Cleanup

- Restore the previous provider and model outside isolated test homes.
