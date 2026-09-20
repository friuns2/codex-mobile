### Feature: Inline thread image payloads are rewritten to renderable local file URLs

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Have a thread that includes a user inline image block originally stored as a `data:` payload.
- For fallback coverage, prepare an `imageView` fixture whose `path` points to an existing extensionless or unsupported-extension file and whose `result` contains valid image Base64.
- Prepare a generated-image fixture whose first fallback contains only a valid image header and whose later fallback contains a complete image.
- For live-state coverage, use an active thread that continues emitting item notifications while `/codex-api/thread-live-state` is polled.

#### Steps
1. Open the thread in the chat UI.
2. Confirm the message area where the inline image appears.
3. Open Network tab and inspect `POST /codex-api/rpc` `thread/read` response.
4. Verify the image block now has `type: "image"` and a `/codex-local-image?path=...` URL instead of a `data:` URL.
5. Load the fallback fixture and confirm its response replaces the unsupported `path` with a supported generated-image path, removes `result`, and still renders the image.
6. While the active thread continues emitting notifications, confirm each live-state request finishes without waiting for notifications to stop; a replacement received during cleanup appears on a later poll without exposing raw image data.
7. Reload the active thread before the generated image is materialized in the session file and inspect the ordinary `thread/read` response.
8. Resume the same thread through `thread/resume`, then load the truncated-first-fallback fixture.

#### Expected Results
- Inline `data:` image payload is not sent in RPC response.
- UI still renders the image from the generated local file URL.
- An existing path that `/codex-local-image` would reject does not suppress a valid inline fallback image.
- Each live-state request processes a bounded snapshot; newer or replaced notification items remain available for the next poll.
- The ordinary `thread/read` response merges the sanitized captured image, so reloading during the materialization window does not temporarily hide it.
- `thread/resume` includes the same sanitized capture, and a header-only candidate does not mask a later complete image fallback.

#### Rollback/Cleanup
- Remove the fallback fixture and any temporary unsupported-extension file.
