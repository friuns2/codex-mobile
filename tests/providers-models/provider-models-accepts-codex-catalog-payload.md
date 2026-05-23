### Provider models accept Codex catalog payloads

#### Feature/Change Name
Provider-backed model discovery accepts both OpenAI-compatible and Codex catalog `/models` payloads.

#### Prerequisites/Setup
1. Build the project with `pnpm run build`.
2. Start the app and open it in the browser.
3. In Settings, choose `Custom endpoint`, set API format to `Responses`, and point the endpoint URL at a test provider base URL such as `http://127.0.0.1:8666/v1`.
4. Have that provider return `{"models":[{"slug":"gpt-5.4"}]}` from `GET /v1/models`.

#### Steps
1. Open the model selector for the provider-backed thread or new-chat composer.
2. Confirm the selector includes model ids from the provider `models[].slug` payload.
3. Select one of the discovered models and start a new thread.

#### Expected Results
- `/codex-api/provider-models` returns model ids from either `data[].id` or `models[].slug`.
- The model selector is not reduced to only the configured fallback model when the provider returns a Codex catalog payload.
- Starting a thread passes the selected model id through to Codex.

#### Rollback/Cleanup
- Switch the provider back to the preferred default.

---
