### Feature: Inline thread image payloads are rewritten to renderable local file URLs

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Have a thread that includes a user inline image block originally stored as a `data:` payload.
- Install repository dependencies so Vitest can run the deterministic server fixtures in `src/server/codexAppServerBridge.inlinePayload.test.ts`.
- The automated fixture file contains exact PNG, JPEG, WebP, GIF, AVIF, and BMP payloads. It injects notifications through `emitNotification`, uses promise gates to block persistence, and supplies a throwing sanitizer to simulate a temporary write failure; no external fixture files are required.

#### Steps
1. Open the thread in the chat UI.
2. Confirm the message area where the inline image appears.
3. Open Network tab and inspect `POST /codex-api/rpc` `thread/read` response.
4. Verify the image block now has `type: "image"` and a `/codex-local-image?path=...` URL instead of a `data:` URL.
5. Start an image-generation turn. After its `item/completed` notification appears in the Network stream, reload before the next materialized `thread/read` includes that turn. Confirm the reloaded chat still shows the image, its URL starts with `/codex-local-image?path=`, and the recovered `thread/read` item is an `imageView` without `result`, `b64_json`, `image`, `url`, `image_url`, or `images` payload fields.
6. Run `pnpm vitest run src/server/codexAppServerBridge.inlinePayload.test.ts` from the repository root. The command must report every test in that file as passed.
7. To reproduce fallback selection alone, run `pnpm vitest run src/server/codexAppServerBridge.inlinePayload.test.ts -t "fallback"`. Confirm the output includes the malformed-first-candidate cases for generic headers, PNG checksums, JPEG scan data, WebP raster data, GIF dimensions, BMP raster data, and unavailable local paths.
8. To reproduce live replacement and write-failure behavior, run `pnpm vitest run src/server/codexAppServerBridge.inlinePayload.test.ts -t "shares live image cleanup|same-id image notification|cleanup failures|media directory"`. Confirm all four named cases pass.
9. To reproduce bounded retention and queue resets, run `pnpm vitest run src/server/codexAppServerBridge.inlinePayload.test.ts -t "bounds captured|bounds eager image|bounded queue capacity"`. Confirm the queue never exceeds 32 waiting jobs, physical sanitation concurrency never exceeds two, and captured state reaches the asserted count/byte limits.
10. To reproduce pre-materialization response recovery, run `pnpm vitest run src/server/codexAppServerBridge.inlinePayload.test.ts -t "pending thread recovery|successful response before its turn materializes"`. Confirm the returned synthetic turn contains a payload-free `imageView`.

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
- A read that needs an image waits for space in the bounded sanitation queue instead of omitting the preview; a full state reset preserves slots held by physically running work so restarted processing never exceeds two concurrent jobs.
- Empty or materialization-pending `thread/read` recovery responses merge current captured images, including a synthetic pending turn when no materialized turn exists yet.
- Generated images recover scalar `url` and `image_url` fallbacks plus string or object entries in `images`; concurrent reads share the same job even after waiting for capacity, and evicted generation entries cannot make stale responses current again.
- Generated fallback recovery examines at most 32 candidates and 32 MiB of candidate text, accepts parameterized Base64 image data URLs, and strips unusable payloads from normal responses. Captured images are marked sanitized only after producing a payload-free `imageView` with a renderable path; failed cleanup is omitted and retried.
- PNG checksum or decompression failures, header-only lossless WebP, and invalid GIF dimensions or LZW data do not mask a later complete fallback. PNG inflation uses asynchronous zlib; GIF validation periodically yields the event loop; decode-and-persist work is globally limited to two active jobs and 32 queued jobs. An unavailable temporary media directory omits that image without rejecting the containing thread response.
- Captured-item size estimation traverses at most 10,000 nodes without variadic array expansion; wider structures are treated as over-limit and are not retained.

#### Rollback/Cleanup
- Stop the disposable development server if one was started. Vitest writes image fixtures only under the system temporary directory.
