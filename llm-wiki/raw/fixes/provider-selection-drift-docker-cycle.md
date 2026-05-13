# Provider Selection Drift Docker Cycle

Captured on 2026-05-13 from branch `codex/provider-model-selection-drift`.

## Scope

This source records the packaged Docker provider validation for provider/model selection drift, thread continuity during provider switches, and custom provider behavior.

## Build and Containers

The test used a freshly packaged artifact from the current branch:

- `pnpm run build`
- `pnpm pack --pack-destination /tmp`
- Temporary Docker image `codexapp-provider-cycle:local`
- Image installed packed `codexapp-0.1.87.tgz` plus `@openai/codex@latest`
- Docker context: OrbStack/Docker CLI

Containers:

- No-auth: empty `CODEX_HOME`, port `4191`
- Auth-mounted: host `/Users/igor/.codex/auth.json` copied into isolated `CODEX_HOME`, port `4192`

## Confirmed Fixes

Two frontend changes were made before or during this cycle:

- Model selections are now stored as provider-tagged objects such as `{ "providerId": "opencode-zen", "modelId": "big-pickle" }`.
- Provider switching no longer runs `router.push({ name: 'home' })` after refresh, so a routed thread URL can remain stable through provider changes.

Related commits in this branch:

- `51bff49c` - provider-scoped model selection storage and validation.
- `cc6ddde9` - route sync no longer redirects home merely because the current sidebar list omits the routed thread.
- `dcffe94c` - provider switch handler no longer forces home navigation.

## Passing Evidence

No-auth Docker startup on `4191`:

- Settings provider was `OpenCode Zen`.
- Accounts badge was `0`.
- `/codex-api/free-mode/status` reported `provider=opencode-zen` and `hasCodexAuth=false`.
- `/codex-api/provider-models` reported `exclusive=true`, `source=opencode-zen`, and included `big-pickle`.
- Sending `hi` produced an assistant reply.

Auth-mounted Docker startup on `4192`:

- Settings provider was `Codex`.
- Accounts badge was `1`.
- Model dropdown contained Codex models only, including `GPT-5.5`, `GPT-5.4`, `GPT-5.4-mini`, `GPT-5.3-codex`, `GPT-5.3-codex-spark`, and `GPT-5.2`.
- The Codex model dropdown did not include `big-pickle`.
- Sending `hi` produced an assistant reply.

Thread continuity after provider switch:

- Starting URL: `http://localhost:4192/#/thread/019e2109-aacb-7612-a6cc-3740757594e0`
- After switching Codex to OpenCode Zen, the URL remained the same thread route.
- The existing conversation remained visible.

## Failing Evidence

Historical thread send after provider switch:

- With the URL preserved after switching Codex to OpenCode Zen, sending `hi provider opencode zen` failed in chat.
- Visible error: `RPC turn/start failed with HTTP 502: thread not found: 019e2109-aacb-7612-a6cc-3740757594e0`.
- This shows UI route continuity was fixed, but the backend session could not run that historical thread after provider switch.

OpenRouter selection mismatch:

- Settings could show `OpenRouter` selected while `/codex-api/free-mode/status` reported `enabled=false`, `hasCodexAuth=true`, and `provider=openrouter`.
- `/codex-api/provider-models` returned `source=provider`, `providerId=""`, and no models.
- The composer dropdown still showed Codex models.
- Expected behavior is either an activated OpenRouter model list or a clear blocking state, not Codex models under an OpenRouter selection.

NVIDIA NIM custom provider mismatch:

- Custom provider was set through `/codex-api/free-mode/custom-provider`.
- Config was `baseUrl=https://integrate.api.nvidia.com/v1` and `wireApi=chat`.
- `/codex-api/free-mode/status` reported `enabled=true`, `provider=custom`, `customBaseUrl=https://integrate.api.nvidia.com/v1`, and `wireApi=chat`.
- `/codex-api/provider-models` reported `source=custom`, `exclusive=true`, and 123 models.
- UI dropdown still showed Codex models.
- Searching `moonshotai/kimi-k2.5` in the UI model dropdown returned no results, despite successful NIM model discovery.
- Sending `hi provider nvidia nim` failed with `unexpected status 404 Not Found: 404 page not found, url: http://127.0.0.1:4192/codex-api/custom-proxy/v1/responses`.
- Expected behavior is for chat-completions providers to send through the chat proxy path with non-empty `messages`.

Groq custom provider:

- The local KeePass registry had OpenRouter and NVIDIA keys but no Groq key entry.
- A valid Groq send test was not completed.

## Screenshot Artifacts

Screenshots were captured under `output/playwright/`, including:

- `docker-noauth-settings.png`
- `docker-noauth-model-dropdown.png`
- `docker-noauth-hi-result.png`
- `docker-auth-settings.png`
- `docker-auth-model-dropdown.png`
- `docker-auth-hi-result.png`
- `docker-provider-switch-zen-result-fixed.png`
- `docker-provider-switch-openrouter-settings.png`
- `docker-provider-switch-custom-nim-result.png`

## Follow-up Test Inventory

The unresolved failures were copied into `whatToTest.md`:

- Provider-switched historical thread cannot send.
- OpenRouter provider can show selected while backend remains Codex.
- Custom NVIDIA NIM chat provider does not drive the UI model dropdown and sends to the Responses path.
- Groq custom provider was not completed due to missing key.
