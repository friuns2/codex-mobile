# OpenCode Zen + Big Pickle Model Configuration

Big Pickle is a free stealth model available on [OpenCode Zen](https://opencode.ai/docs/zen/) during its beta period. It uses the Chat Completions API exclusively.

## Compatibility Matrix

| Tool | Version | Works? | Notes |
|------|---------|--------|-------|
| Codex CLI | v0.93.0 | Yes | Last version with `wire_api = "chat"` |
| Codex CLI | v0.118.0+ | No | Removed chat completions support |
| OpenCode CLI | v1.4.3 | Yes | Pipe empty stdin in non-TTY: `echo "" \| opencode run --pure "msg"` |
| Direct curl | - | Yes | POST to `/v1/chat/completions` |

## Config Recipes

### Codex CLI (`~/.codex/config.toml`)
```toml
[model_providers.opencode-zen]
name = "OpenCode Zen"
base_url = "https://opencode.ai/zen/v1"
env_key = "OPENCODE_ZEN_API_KEY"
wire_api = "chat"

[profiles.pickle]
model = "big-pickle"
model_provider = "opencode-zen"
```

### OpenCode CLI (`~/.config/opencode/opencode.json`)
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/big-pickle",
  "provider": {
    "opencode": {
      "options": { "apiKey": "sk-..." }
    }
  }
}
```

## Gotchas
- Big Pickle only supports `/v1/chat/completions`, NOT `/v1/responses`
- `opencode run` hangs without piped stdin in headless environments
- Codex CLI deprecation warning for `wire_api = "chat"` is safe to ignore on v0.93.0
- In Codex Web Local's Zen proxy, DeepSeek thinking-mode responses must round-trip `reasoning_content` into later Chat Completions messages. Missing this field can produce `The reasoning_content in the thinking mode must be passed back to the API`.
- Chat-shaped Zen proxy payloads must be posted to `/v1/chat/completions`, even when the incoming local request uses the Responses-shaped `/responses` route.
- In no-auth Docker mode, OpenCode Zen provider models are authoritative. Fetch `/codex-api/provider-models` before relying on Codex `model/list`, because `model/list` may return Codex catalog rows or fail independently.
- During authenticated Docker first-turn startup, `thread ... is not materialized yet; includeTurns is unavailable before first user message` is a transient in-progress state, not a chat error.

## Codex Web Local Proxy Behavior

Codex Web Local can expose OpenCode Zen through its local Responses-compatible proxy. The proxy translates between Codex-style Responses input and Zen's Chat Completions-only API.

For thinking-mode models behind `big-pickle`, the proxy must preserve assistant reasoning in both directions:
- Upstream Chat `message.reasoning_content` becomes a Responses `reasoning` output item.
- Later Responses `reasoning` input becomes assistant Chat `reasoning_content`.
- Reasoning that precedes function calls is attached to the assistant tool-call message.
- Streaming Chat `reasoning_content` deltas are emitted as synthetic Responses reasoning output.

This behavior was fixed in commit `47d52c8c` after a Docker repro using an empty `CODEX_HOME`, no login, and no Zen API key.

## Docker Auth and Model Loading

Codex Web Local's unauthenticated Docker path should use OpenCode Zen only as a runtime fallback. It should not permanently write fallback provider configuration, and it should not depend on Codex `model/list` for the Zen selector.

Validated Docker states:
- Empty `CODEX_HOME`: `config/read` reports `model = "big-pickle"` and `model_provider = "opencode-zen"`, the app-server command includes local Zen proxy flags, and the model selector loads provider models from `/codex-api/provider-models`.
- `auth.json` mounted into `CODEX_HOME`: `config/read` reports `model = null` and `model_provider = null`, the app-server command has no Zen flags, and sending `hi` uses the default Codex provider path.

The first authenticated turn may briefly make `thread/read includeTurns=true` fail with `not materialized yet; includeTurns is unavailable before first user message`. The bridge maps that exact response to an in-progress empty live state with no `liveStateError`; real `thread/read` failures still surface as errors.

## Copied Auth Promotion

If a container starts without auth and later receives a valid `auth.json`, Codex auth should take precedence over community fallback provider state. This matters when a user starts in no-auth Zen mode, switches to OpenRouter, then copies auth into `CODEX_HOME`.

Expected behavior after copying auth and reloading:
- Community fallback provider state (`openrouter` or `opencode-zen` without a custom key) is suppressed.
- Provider promotes to Codex.
- Accounts imports the copied active auth file and the badge updates from `0` to at least `1`.
- The new-thread composer shows a concrete Codex model, not a generic `Model` placeholder.
- Stale historical diagnostics do not show a `Send feedback / Issue detected` row unless a current visible error remains.

User-configured provider state is preserved: OpenRouter with `customKey: true`, OpenCode Zen with an explicit API key, and custom endpoint providers should not be suppressed merely because Codex auth exists.

This behavior was fixed in commit `7ee94f83` and validated in a packaged Docker image by running: no-auth Zen startup, switch to OpenRouter, copy host `auth.json`, reload, verify Codex provider + Accounts `1`, send `hi`, and wait for a Codex reply.

## Related
- Source: [opencode-zen-big-pickle-codex-cli.md](../../raw/fixes/opencode-zen-big-pickle-codex-cli.md)
- Source: [opencode-zen-reasoning-content-proxy.md](../../raw/fixes/opencode-zen-reasoning-content-proxy.md)
- Source: [opencode-zen-docker-auth-provider-models.md](../../raw/fixes/opencode-zen-docker-auth-provider-models.md)
- Source: [copied-auth-provider-promotion.md](../../raw/fixes/copied-auth-provider-promotion.md)
- [merge-to-main-workflow.md](./merge-to-main-workflow.md)
