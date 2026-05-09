# What To Test

## Provider And Model Switching

### Setup

- Start the app with `pnpm run dev --host 0.0.0.0 --port 5173`.
- Open `http://localhost:5173/#/thread/019e0a40-2aad-78e2-b99d-34c8f6b65e21` or any existing thread.
- Open Settings in the sidebar.

### OpenCode Zen

1. Change Provider to `OpenCode Zen`.
2. Confirm the thread URL stays on the same `/thread/<id>`.
3. Confirm the composer immediately shows `big-pickle`.
4. While the provider switch is loading, confirm composer config controls are disabled.
5. Open the model dropdown after loading completes.
6. Confirm the dropdown contains only:
   - `big-pickle`
   - `minimax-m2.5-free`
   - `hy3-preview-free`
   - `trinity-large-preview-free`
   - `nemotron-3-super-free`
7. Confirm GPT-labelled paid Zen models are not listed.

### Codex

1. Change Provider back to `Codex`.
2. Confirm the thread URL stays on the same `/thread/<id>`.
3. Confirm the composer immediately changes from `big-pickle` to a Codex model.
4. Open the model dropdown after loading completes.
5. Confirm the dropdown contains only Codex models, for example:
   - `GPT-5.5`
   - `GPT-5.4`
   - `GPT-5.4-mini`
   - `GPT-5.3-codex`
   - `GPT-5.3-codex-spark`
   - `GPT-5.2`
6. Confirm `big-pickle` and Zen `*-free` models are not listed.

### Thread Switching While Zen Is Active

1. Set Provider to `OpenCode Zen`.
2. Select several different sidebar threads.
3. Confirm each thread opens its own `/thread/<id>` URL.
4. Confirm the composer stays on `big-pickle`.
5. Confirm no stale Codex model appears after changing threads.

### Send Smoke Test

1. With Provider set to `OpenCode Zen`, send `hi` in a test thread.
2. Confirm a response appears in the same thread.
3. Switch Provider to `Codex` and send `hi`.
4. Confirm a response appears in the same thread.

### Light And Dark Theme

Repeat the provider/model dropdown checks in both light and dark theme.
