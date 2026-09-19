# OpenCode Zen Public Client Headers

## Feature / Change

Send keyless OpenCode Zen requests through the local Zen proxy with the complete public-client admission contract.

## Prerequisites / Setup

- Start the app with no Codex auth available so OpenCode Zen fallback is active.
- Confirm `config/read` reports `model_provider = "opencode_zen"` and `model = "muse-spark-1.3-contributor-free"`.

## Actions

1. Send `hi` from a new thread using `muse-spark-1.3-contributor-free`.
2. Inspect the app response and server logs.
3. Optionally enable `CODEXUI_PROXY_DEBUG=1` and repeat if an upstream error occurs.

## Expected Result

- The assistant responds successfully.
- The upstream error is not `FreeUsageLimitError`.
- Send `Authorization: Bearer public`, `Accept: text/event-stream`, the OpenCode 1.18.30 user agent, and canonical `X-Opencode-*` IDs.
- Send `stream: true`, `tool_choice: "auto"`, and distinct `bash` and `read` function tools.

## Performance / Risk Audit

- Measured local no-auth UI smoke responses completed successfully for `hi` and `write create todo list app` through the Zen proxy without `FreeUsageLimitError`.
- Code-path audit: add one synchronous header-object callback, two bounded random-ID generations, and one bounded tool-list normalization per Zen request. Add no network requests, retries, polling, cache reads/writes, or extra request fanout.
- Duplicate request risk: unchanged. The proxy still creates exactly one upstream request for each inbound proxy request.
- Blocking work risk: bound random generation to 20 bytes per ID and normalize only the request's existing tool array.
- Large payload risk: unchanged. Only small static headers and two short IDs are added; request body construction is unchanged.
- Cache invalidation risk: none. The proxy path does not introduce or mutate caches.
- Not measured: end-to-end profiler traces were not rerun because the behavior change is server-side header generation only and existing build/unit coverage plus no-auth UI smoke covered the affected path.

## Rollback / Cleanup

- Stop the local app server.
- Remove any temporary no-auth `CODEX_HOME` used for the test.
