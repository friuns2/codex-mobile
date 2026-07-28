### Feature: Windows absolute file links open through local browse

## Prerequisites

- Run CodexApp on Windows.
- Open TestChat with a project that contains an existing text file and MP4 file on a drive-letter path.

## Steps

1. Send a message containing Markdown links to `C:/path/to/file.ps1` and `C:/path/to/video.mp4`.
2. Inspect both rendered links and confirm their `href`, title, and visible text preserve the complete drive-letter paths.
3. Open the text-file link and confirm the request returns the existing file instead of a 404 response.
4. Open the MP4 link and seek within the video.
5. Inspect the MP4 request and confirm byte-range requests return `206 Partial Content` with `Accept-Ranges: bytes`.
6. Open a directory through local browse and click a nested folder plus the parent (`..`) link.

## Expected Results

- Windows drive paths are decoded as `C:/...`, not `/C:/...` or `C:\\C:\\...`.
- Existing files return successfully through `/codex-local-browse/C:/...`.
- MP4 files use the correct media content type and support browser range requests.
- Directory, parent, and edit links use `/codex-local-browse/C:/...` or `/codex-local-edit/C:/...` with forward slashes and a separator after the route prefix.
- Unix absolute paths and UNC paths retain their existing behavior.

## Rollback / Cleanup

- Close the opened file and video tabs. No files are modified by this test.
