# OpenCode Zen Public Client Headers

## Feature / Change

OpenCode Zen no-auth requests sent through the local Zen proxy include OpenCode-style public client headers so `big-pickle` requests do not hit the unauthenticated free usage limiter.

## Prerequisites / Setup

- Start the app with no Codex auth available so OpenCode Zen fallback is active.
- Confirm `config/read` reports `model_provider = "opencode_zen"` and `model = "big-pickle"`.

## Actions

1. Send `hi` from a new thread using the default `big-pickle` model.
2. Inspect the app response and server logs.
3. Optionally enable `CODEXUI_PROXY_DEBUG=1` and repeat if an upstream error occurs.

## Expected Result

- The assistant responds successfully.
- The upstream error is not `FreeUsageLimitError`.
- Zen proxy requests include `Authorization: Bearer public`, `User-Agent: opencode/...`, and `X-Opencode-*` client/session/request headers when no user Zen key is configured.

## Performance / Risk Audit

- Measured local no-auth UI smoke responses completed successfully for `hi` and `write create todo list app` through the Zen proxy without `FreeUsageLimitError`.
- Code-path audit: the change adds one synchronous header-object callback per Zen upstream request plus two `randomBytes(24)` calls. It does not add network requests, retries, polling, cache reads/writes, or extra request fanout.
- Duplicate request risk: unchanged. The proxy still creates exactly one upstream request for each inbound proxy request.
- Blocking work risk: bounded to 48 random bytes and string formatting per Zen request; no filesystem, subprocess, or blocking network work was added.
- Large payload risk: unchanged. Only small static headers and two short IDs are added; request body construction is unchanged.
- Cache invalidation risk: none. The proxy path does not introduce or mutate caches.
- Not measured: end-to-end profiler traces were not rerun because the behavior change is server-side header generation only and existing build/unit coverage plus no-auth UI smoke covered the affected path.

## Rollback / Cleanup

- Stop the local app server.
- Remove any temporary no-auth `CODEX_HOME` used for the test.
