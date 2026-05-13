# What To Test

## Open Docker Provider Tasks

These tasks come from packaged Docker Browser cycles. Keep each task here until a fresh packaged Docker run proves it passes with browser screenshots and network evidence.

Passed and removed on 2026-05-13: continuing a historical Codex thread after `Codex -> OpenCode Zen` provider switch. Fresh evidence showed the same `#/thread/019e2117-b1dc-7401-804f-b86fadc97604` route stayed visible and `hi provider opencode zen` returned an assistant reply without a raw `thread not found` error.

Passed and removed on 2026-05-13: OpenRouter selected state no longer falls back to stale `big-pickle`. Fresh packaged Docker evidence on `http://127.0.0.1:4492/#/` showed `currentModel=openrouter/free`, 26 exclusive OpenRouter models, no `big-pickle`, and screenshot `output/playwright/docker-fix-openrouter-dropdown.png`.

Passed and removed on 2026-05-13: custom NVIDIA NIM provider now drives the dropdown and sends without the empty-messages failure. Fresh packaged Docker evidence on `http://127.0.0.1:4492/#/` showed `currentModel=01-ai/yi-large`, 123 exclusive NIM models, no `big-pickle`, screenshot `output/playwright/docker-fix2-nim-dropdown.png`, and a final upstream NIM 404 rendered in chat without `messages field cannot be empty` in `output/playwright/docker-fix2-nim-send.png`.

Passed and removed on 2026-05-13: fresh no-auth Docker fallback still defaults to OpenCode Zen. Fresh evidence on `http://127.0.0.1:4591/#/` showed `provider=opencode-zen`, `enabled=true`, `hasCodexAuth=false`, `big-pickle` in the dropdown, and a reply to `hi no auth fallback` in `output/playwright/what-noauth-send.png`.

Passed and removed on 2026-05-13: fresh auth Docker startup still defaults to Codex-only models. Fresh evidence on `http://127.0.0.1:4592/#/` showed `hasCodexAuth=true`, Codex dropdown with `GPT-5.5`, no `big-pickle` or `openrouter/free`, and a reply to `hi auth codex` in `output/playwright/what-auth-send.png`.

### [ ] P0 - Provider switch chain keeps URL stable and provider models scoped

**Environment**

- Auth-mounted packaged Docker container on a fresh unique port.
- OpenRouter and NVIDIA NIM keys available.

**Current evidence**

- Fresh run: packaged image `codexapp-what-test:local`, auth-mounted container on `http://127.0.0.1:4592/#/`.
- OpenCode Zen step passed:
  - `/codex-api/free-mode/status` returned `provider=opencode-zen`, `currentModel=big-pickle`.
  - `/codex-api/provider-models` returned `exclusive=true`, `count=41`, including `big-pickle`.
  - Browser screenshots:
    - `output/playwright/what-chain-zen-dropdown.png`
    - `output/playwright/what-chain-zen-send.png`
- OpenRouter step failed:
  - After `OpenCode Zen -> OpenRouter`, `/codex-api/free-mode/status` returned `provider=openrouter`, `enabled=true`, but `currentModel=big-pickle`.
  - `/codex-api/provider-models` returned `exclusive=true`, `count=26`, and did not include `big-pickle`.
  - Browser did not show `openrouter/free`; the send attempt did not submit `hi provider openrouter` and the thread rendered `RPC turn/start failed with HTTP 502: thread not found: 019e212d-35ee-73f2-8724-75d3a006f445`.
  - Browser screenshots:
    - `output/playwright/what-chain-openrouter-dropdown.png`
    - `output/playwright/what-chain-openrouter-send.png`

**Repro**

1. Start on a Codex thread and record the full `#/thread/<thread-id>` URL.
2. Switch Settings provider `Codex -> OpenCode Zen`.
3. Open dropdown, send `hi provider opencode zen`, and wait for reply/error.
4. Switch `OpenCode Zen -> OpenRouter`.
5. Open dropdown, send `hi provider openrouter`, and wait for reply/error.
6. Switch `OpenRouter -> Custom endpoint` with `https://integrate.api.nvidia.com/v1`, `wireApi=chat`.
7. Open dropdown, send `hi provider nvidia nim`, and wait for reply/error.
8. Switch `Custom endpoint -> Codex`.
9. Open dropdown, send `hi provider codex`, and wait for reply/error.

**Pass criteria**

- The URL stays on the original `#/thread/<thread-id>` route after every switch.
- Visible conversation remains in place after every switch.
- OpenCode Zen dropdown includes `big-pickle`.
- OpenRouter dropdown contains OpenRouter models and excludes `big-pickle`, Codex-only, Groq, and NIM entries.
- NIM dropdown contains NIM models and excludes stale `big-pickle`, OpenRouter, Codex-only, and Groq entries.
- Codex dropdown contains Codex models only and excludes `big-pickle`, OpenRouter, Groq, and NIM entries.
- Every send returns an assistant reply or exact final provider error in chat.
- No send after switching uses a stale previous-provider model.

**Validation evidence to capture**

- Screenshot after each provider switch with the thread URL still visible.
- Screenshot of each provider dropdown.
- Screenshot of each final reply/error.
- Network evidence for provider setting calls, `provider-models`, and send payloads.

### [ ] P0 - OpenRouter send uses active OpenRouter model after stale-model guard

**Environment**

- Auth-mounted packaged Docker container.
- Valid OpenRouter key configured.

**Current evidence**

- Fresh run: packaged image `codexapp-what-test:local`, auth-mounted container on `http://127.0.0.1:4592/#/`.
- After configuring OpenRouter from an OpenCode Zen state:
  - `/codex-api/free-mode/status` returned `provider=openrouter`, `enabled=true`, `currentModel=big-pickle`.
  - `/codex-api/provider-models` returned `exclusive=true`, `count=26`, did not include `big-pickle`, and started with `openrouter/free`.
- The browser did not show `openrouter/free` as the composer model in the tested state.
- Browser screenshots:
  - `output/playwright/what-chain-openrouter-dropdown.png`
  - `output/playwright/what-chain-openrouter-send.png`

**Repro**

1. Configure OpenRouter through Settings or the equivalent app endpoint.
2. Confirm `/codex-api/free-mode/status` shows `provider=openrouter`, `enabled=true`, and `currentModel=openrouter/free` or another OpenRouter model.
3. Confirm `/codex-api/provider-models` is exclusive and does not include `big-pickle`.
4. Open the dropdown and select an OpenRouter model.
5. Send `hi provider openrouter fixed`.

**Pass criteria**

- Composer selected model is OpenRouter-scoped.
- Dropdown does not contain `big-pickle`.
- `turn/start` sends an OpenRouter model, not `big-pickle`, Codex, NIM, or Groq stale models.
- Chat shows assistant reply or exact final OpenRouter provider error.

**Validation evidence to capture**

- Screenshot of OpenRouter dropdown.
- Screenshot of final reply/error.
- Network evidence for status, model list, and send payload.

### [ ] P0 - NVIDIA NIM custom send should use a known working chat model

**Environment**

- Auth-mounted packaged Docker container.
- Valid NVIDIA API key configured.
- Custom provider base URL `https://integrate.api.nvidia.com/v1`, `wireApi=chat`.

**Current evidence**

- Fresh packaged Docker evidence on `http://127.0.0.1:4492/#/` showed dropdown scoping was fixed.
- Sending with default `01-ai/yi-large` reached the upstream and rendered a final upstream 404 for a missing NIM function.
- There was no `messages field cannot be empty` error.
- Fresh run on `http://127.0.0.1:4592/#/` after OpenRouter showed a regression:
  - `/codex-api/free-mode/status` returned `provider=custom`, `currentModel=01-ai/yi-large`, `wireApi=chat`.
  - `/codex-api/provider-models` returned `source=custom`, `exclusive=true`, `count=123`, first model `01-ai/yi-large`, and no `big-pickle`.
  - Browser composer still showed stale `big-pickle` and the dropdown did not show `01-ai/yi-large`.
  - Send rendered `unexpected status 404 Not Found: 404 page not found, url: http://127.0.0.1:4190/codex-api/custom-proxy/v1/responses`.
  - There was still no `messages field cannot be empty` error.
  - Browser screenshots:
    - `output/playwright/what-nim-dropdown.png`
    - `output/playwright/what-nim-send.png`

**Repro**

1. Configure NVIDIA NIM custom provider.
2. Inspect `/codex-api/provider-models` and pick a known working NIM chat model if available.
3. Select that model from the dropdown.
4. Send `hi provider nvidia nim working model`.

**Pass criteria**

- Dropdown is NIM-only and excludes stale models.
- Send reaches upstream through the custom proxy translation path.
- Request body sent upstream has a non-empty `messages` array.
- Chat shows an assistant reply, or an exact final upstream error that is not caused by empty messages or wrong `/responses` upstream routing.

**Validation evidence to capture**

- Screenshot of NIM dropdown with the selected model.
- Screenshot of final reply/error.
- Network evidence for custom proxy request path and translated payload.

### [ ] P1 - Run Groq custom chat provider packaged Docker validation

**Environment**

- Packaged Docker image built from the current branch.
- Auth-mounted or no-auth container on a unique port.
- Groq API key available to the container.

**Provider config**

- Base URL: `https://api.groq.com/openai/v1`
- Wire API: `chat`

**Current evidence**

- Local KeePass registry had OpenRouter and NVIDIA keys, but no Groq key entry was found during the 2026-05-13 run.
- A fresh 2026-05-13 key lookup still found no Groq key entry.
- No valid Groq send test has been completed.

**Repro**

1. Add or provide a Groq API key for the packaged Docker container.
2. Configure custom provider with the Groq base URL and `wireApi=chat`.
3. Refresh provider models.
4. Open the composer model dropdown and select a valid Groq chat model.
5. Send `hi provider groq`.

**Pass criteria**

- `/codex-api/free-mode/status` shows `provider=custom` and `wireApi=chat`.
- `/codex-api/provider-models` returns an exclusive Groq model list.
- The composer dropdown shows Groq models, not Codex/OpenRouter/NIM stale entries.
- Sending uses the chat-completions proxy path and sends a non-empty `messages` array.
- The final chat state is either an assistant reply or the exact upstream error rendered in the conversation.
- There is no `messages field cannot be empty` error.

**Validation evidence to capture**

- Browser screenshot of the custom provider settings.
- Browser screenshot of the Groq model dropdown.
- Browser screenshot of the reply or exact final error in the same thread.
- Network evidence for `/codex-api/free-mode/status`, `/codex-api/provider-models`, and the custom proxy send request body/path.
