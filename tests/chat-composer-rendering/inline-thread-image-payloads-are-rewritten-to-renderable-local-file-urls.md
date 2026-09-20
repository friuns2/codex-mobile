### Feature: Inline thread image payloads are rewritten to renderable local file URLs

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Have a thread that includes a user inline image block originally stored as a `data:` payload.
- For fallback coverage, prepare an `imageView` fixture whose `path` points to an existing extensionless or unsupported-extension file and whose `result` contains valid image Base64.

#### Steps
1. Open the thread in the chat UI.
2. Confirm the message area where the inline image appears.
3. Open Network tab and inspect `POST /codex-api/rpc` `thread/read` response.
4. Verify the image block now has `type: "image"` and a `/codex-local-image?path=...` URL instead of a `data:` URL.
5. Load the fallback fixture and confirm its response replaces the unsupported `path` with a supported generated-image path, removes `result`, and still renders the image.

#### Expected Results
- Inline `data:` image payload is not sent in RPC response.
- UI still renders the image from the generated local file URL.
- An existing path that `/codex-local-image` would reject does not suppress a valid inline fallback image.

#### Rollback/Cleanup
- Remove the fallback fixture and any temporary unsupported-extension file.
