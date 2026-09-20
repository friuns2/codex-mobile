### Assistant generated image rendering

#### Feature/Change Name
Codex app-server generated image items render as assistant image previews.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A Codex thread that has completed an image generation turn, or a test app-server payload containing either `type: "imageGeneration"` with a base64 `result` or `type: "imageView"` with an absolute image `path`

#### Steps
1. Open the thread in CodexUI
2. Locate the completed image generation turn
3. Inspect the `thread/read` or `thread/resume` response for the generated image item
4. Confirm a generated image with a valid local `path` does not retain top-level `result`, `b64_json`, or `image` fields
5. For a multi-image thread, compare the response size with the Base64 payload size and confirm the response remains bounded by non-image thread content
6. Inspect the assistant response area where the generated image should appear
7. Click the generated image preview
8. Repeat with an `imageView` whose `path` does not exist and confirm its inline fallback is persisted and promoted to a valid absolute `path`

#### Expected Results
- The generated image item appears as an assistant image preview instead of disappearing from the conversation
- The preview is rendered larger than normal user attachment thumbnails and keeps its aspect ratio
- Clicking the preview opens the existing image modal
- The image is served through `/codex-local-image?path=...`
- Once the local image file exists, the thread response contains the local `path` without duplicate Base64 payload fields
- A missing local path is recovered from the remaining image payload, and the recovered image renders through the local image route

#### Rollback/Cleanup
- Delete any temporary generated image files and missing-path fixtures created only for this test

---
