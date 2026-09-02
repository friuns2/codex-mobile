# Configurable reverse-proxy base path

## Feature/change

The `--base-path` CLI option scopes frontend assets, API requests, local-file links, SSE, and WebSocket traffic below a workspace-specific URL prefix.

## Prerequisites/setup

- A production build of the app
- A test workspace id such as `workspace-a`
- An unused local port

## Actions

1. Start the built CLI with `--base-path /codex/workspace-a` on the unused port.
2. Open `/codex/workspace-a/` and inspect the loaded document, manifest, icons, JavaScript, and CSS requests.
3. Trigger an RPC call and inspect its HTTP URL.
4. Inspect the realtime connection URL; if WebSocket is unavailable, inspect the SSE fallback URL.
5. Open a rendered local image and a local file-browser link.
6. Request `/codex/workspace-a` without a trailing slash.
7. Repeat one API request against the unprefixed upstream route to model an ingress that strips the workspace prefix.

## Expected results

- Assets and PWA resources load below `/codex/workspace-a/` without requests escaping to the hostname root.
- RPC uses `/codex/workspace-a/codex-api/rpc`.
- Realtime uses `/codex/workspace-a/codex-api/ws` or `/codex/workspace-a/codex-api/events`.
- Local image, browser, editor, and directory-picker URLs retain the prefix.
- The path without a trailing slash redirects to `/codex/workspace-a/`.
- The server also accepts the unprefixed API request after ingress-style prefix stripping.
- Existing root deployment behavior remains unchanged when `--base-path` is omitted.

## Rollback/cleanup

Stop the test server.
