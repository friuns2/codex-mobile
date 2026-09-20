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
9. Load an older turn through `/codex-api/thread-turn-page` while its image exists only in a completion notification, and simulate one temporary image-file write failure alongside another valid captured image.
10. Keep an active thread emitting more than 100 unmaterialized items without reading it, then leave it idle for more than five minutes.
11. Emit a burst of generated-image notifications across many threads while image persistence is deliberately blocked.
12. Trigger empty-thread and materialization-pending recovery responses after a generated-image notification arrives.

#### Expected Results
- Inline `data:` image payload is not sent in RPC response.
- UI still renders the image from the generated local file URL.
- An existing path that `/codex-local-image` would reject does not suppress a valid inline fallback image.
- Each live-state request processes a bounded snapshot; newer or replaced notification items remain available for the next poll.
- The ordinary `thread/read` response merges the sanitized captured image, so reloading during the materialization window does not temporarily hide it.
- `thread/resume` includes the same sanitized capture, and a header-only candidate does not mask a later complete image fallback.
- A completed notification replaces an incomplete same-ID placeholder in normal and paged turns; one image cleanup failure is omitted for that response and retried later without blocking other images or the thread response.
- Active notification state retains at most 100 items or 64 MiB per thread, expires after five minutes without a read, and is cleared when the app-server process is disposed.
- Across threads, captured notification state retains at most 100 active thread IDs or 128 MiB in aggregate, evicting the least recently updated thread and its queued jobs first.
- A container header without raster data does not suppress a later valid fallback, and normalized image views omit duplicate `url`, `image_url`, and `images` payload fields.
- Background image persistence runs at most two jobs concurrently, retains at most 32 queued jobs, skips captures that have already been replaced or pruned, and clears queued work during disposal.
- Notification generation state retains at most 1,000 recently active thread IDs and is cleared during full process-state cleanup.
- A read that needs an image waits for space in the bounded sanitation queue instead of omitting the preview; a full state reset releases old-generation slots so restarted processing can continue immediately.
- Empty or materialization-pending `thread/read` recovery responses merge current captured images, including a synthetic pending turn when no materialized turn exists yet.
- Generated images recover scalar `url` and `image_url` fallbacks plus string or object entries in `images`; concurrent reads share the same job even after waiting for capacity, and evicted generation entries cannot make stale responses current again.

#### Rollback/Cleanup
- Remove the fallback fixture and any temporary unsupported-extension file.
