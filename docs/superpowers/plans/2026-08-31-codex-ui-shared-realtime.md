# codex-ui Shared Realtime Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one Windows or macOS `codex-ui` host expose its Codex desktop sessions and projects to all authenticated browsers with targeted realtime convergence and automatic app-server recovery.

**Architecture:** Keep the host's resolved `CODEX_HOME` and project directories as the sole source of truth. Add a supervised app-server lifecycle module and a bounded desktop-state coordinator, merge their semantic events into the existing authenticated WebSocket/SSE stream, and make clients deduplicate targeted refreshes while retaining cached data during failures.

**Tech Stack:** Node.js 18+, TypeScript 5.7, Express 5, `ws`, Vue 3, Vitest 4, Vite 6, PowerShell, POSIX shell.

**Spec:** `docs/superpowers/specs/2026-08-31-codex-ui-shared-realtime-design.md`

## Global Constraints

- The central host is the only source of Codex sessions, projects, authentication, and project files.
- Keep the existing shared-password model; do not add per-user identities or permissions.
- Keep npm package and executable compatibility under `codexapp`; repository and visible product branding use `codex-ui`.
- Support Windows and macOS production deployment from the built CLI, which listens on `0.0.0.0`.
- Use a bounded number of filesystem watchers independent of session count; never recursively watch whole repositories.
- Filesystem events only invalidate caches; canonical session/project data continues to come from app-server and existing HTTP APIs.
- Preserve native app-server streaming events and add semantic invalidation events rather than replacing the stream.
- Keep cached sessions visible when an app-server refresh fails.
- Every behavior change is written test-first and committed as a discrete task.
- Update only relevant manual test documents under `tests/`; `tests.md` remains an index.

## Recorded Windows Baseline

Before feature implementation on Node `18.20.8` and pnpm `11.19.0`, `pnpm run test:unit` reports 141 passing and 6 failing tests. The known failures are the stalled-resume fake-timer cleanup, backend-queue fake-timer cleanup, two unified proxy timeouts, Windows symlink canonicalization, and Windows POSIX permission-bit assertion. New work must not increase this failure set.

---

## File Map

### New production modules

- `src/codexHome.ts`: resolves the active `CODEX_HOME` consistently for CLI, bridge, and coordinator.
- `src/server/codexProcessManager.ts`: owns child-process lifecycle state, restart backoff, bounded stderr, and health subscriptions.
- `src/realtimeProtocol.ts`: defines and validates app-server health and state-invalidation notification payloads shared by server and client without importing Node-only server modules into the frontend.
- `src/server/desktopStateCoordinator.ts`: watches bounded Codex state locations, coalesces signals, increments revisions, and emits semantic invalidations.
- `src/components/common/ServerHealthBadge.vue`: compact visible app-server status for the shared host.

### Existing production modules to modify

- `src/commandResolution.ts`: return the selected Codex command and source in a testable form.
- `src/utils/commandInvocation.ts`: make Windows `.cmd` wrapping testable without mutating `process.platform`.
- `src/server/codexAppServerBridge.ts`: delegate process lifecycle, expose health, start the state coordinator, and fan out internal events.
- `src/server/httpServer.ts`: include coordinator revision in `ready` and close WebSocket infrastructure during disposal.
- `src/api/codexRpcClient.ts`: type realtime notifications and preserve `ready` metadata.
- `src/api/codexGateway.ts`: expose the authenticated app-server health request.
- `src/composables/useDesktopState.ts`: consume invalidations, deduplicate refreshes, recover after reconnect, and expose health state.
- `src/App.vue`: render the compact health badge without moving existing navigation or chat layout.
- `src/style.css`: add decisive light/dark styles for the shared health state.
- `src/cli/index.ts`: print `codex-ui` repository branding and resolved host-state diagnostics.
- `scripts/dev.cjs`: start Vite through Node on Windows instead of spawning `vite.cmd` directly.
- `package.json`, `README.md`, `src/main.ts`: repository identity, attribution, and compatible command documentation.

### New scripts and test documents

- `scripts/install-windows.ps1`, `scripts/start-windows.ps1`: repository install/build and production startup on Windows.
- `scripts/install-macos.sh`, `scripts/start-macos.sh`: equivalent macOS flow.
- `tests/cli-network-platform/windows-macos-shared-host-deployment.md`: exact deployment manual test.
- `tests/thread-loading-state/desktop-and-browser-shared-realtime-sync.md`: desktop plus two-browser convergence manual test.

---

### Task 1: Repository Identity, Attribution, And Cross-Platform Entrypoints

**Files:**
- Create: `scripts/install-windows.ps1`
- Create: `scripts/start-windows.ps1`
- Create: `scripts/install-macos.sh`
- Create: `scripts/start-macos.sh`
- Modify: `README.md`
- Modify: `package.json`
- Create: `pnpm-workspace.yaml`
- Modify: `src/main.ts`
- Modify: `src/cli/index.ts`
- Modify: `scripts/dev.cjs`
- Test: `src/utils/commandInvocation.test.ts`
- Test: `src/utils/devScript.test.ts`

**Interfaces:**
- Consumes: existing CLI flags `--port`, `--password`, `--no-password`, `--no-open`, `--no-tunnel`, and `--no-login`.
- Produces: production launch scripts that call `node dist-cli/index.js`; repository metadata points to `https://github.com/ylwhlhp/codex-ui`; `getSpawnInvocation(command, args, platform)` is platform-testable.

- [x] **Step 1: Write the failing Windows invocation test**

```ts
// src/utils/commandInvocation.test.ts
import { describe, expect, it } from 'vitest'
import { getSpawnInvocation } from './commandInvocation'

it('wraps Windows command shims with cmd.exe', () => {
  expect(getSpawnInvocation('C:\\Users\\me\\AppData\\Roaming\\npm\\vite.cmd', ['--port', '4202'], 'win32')).toEqual({
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'C:\\Users\\me\\AppData\\Roaming\\npm\\vite.cmd --port 4202'],
  })
})
```

- [x] **Step 2: Run the focused tests and confirm the expected failures**

Run: `pnpm exec vitest run src/utils/commandInvocation.test.ts`

Expected: TypeScript compilation fails because `getSpawnInvocation` does not accept the third platform parameter.

- [x] **Step 3: Implement repository identity and Windows-safe development launch**

Change `getSpawnInvocation` to accept `platform: NodeJS.Platform = process.platform`. In `scripts/dev.cjs`, resolve `vite/bin/vite.js` and invoke it through `process.execPath`:

```js
const viteEntry = require.resolve('vite/bin/vite.js')
run(process.execPath, [viteEntry, ...passthroughArgs])
```

Keep `package.json.name`, `bin.codexapp`, and `bin.codexui` unchanged. Replace repository/homepage/bugs URLs and visible welcome log URLs with `ylwhlhp/codex-ui`. Pin `tailwindcss` and `@tailwindcss/vite` to exact `4.1.18`, the build-verified version for this fork. Move the existing `@firebase/util`, `esbuild`, `node-pty`, and `protobufjs` build allowlist from the obsolete `package.json.pnpm.onlyBuiltDependencies` field to `pnpm-workspace.yaml` with each package explicitly set to `true`, so pnpm 11 installation is non-interactive without broadening the allowlist.

- [x] **Step 4: Add deterministic install and start scripts**

PowerShell install contract:

```powershell
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot
node --version
pnpm --version
codex --version
pnpm install
pnpm run build
```

PowerShell start contract:

```powershell
param([int]$Port = 5900, [string]$Password = '')
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Arguments = @((Join-Path $ProjectRoot 'dist-cli/index.js'), '--port', "$Port", '--no-open', '--no-tunnel')
if ($Password) { $Arguments += @('--password', $Password) }
& node @Arguments
```

The macOS scripts use `set -euo pipefail`, resolve the repository root from the script directory, run the same prerequisite/build checks, and forward `CODEX_UI_PORT` plus optional `CODEX_UI_PASSWORD` to `node dist-cli/index.js`.

- [x] **Step 5: Rewrite the README opening and deployment section**

The first screen identifies `codex-ui`, states that it is secondary development of `friuns2/codex-mobile` under MIT, explains that one trusted host shares its Codex data with all authenticated users, documents Windows/macOS scripts, and retains `npx codexapp` compatibility notes.

- [x] **Step 6: Run focused tests and script syntax checks**

Run:

```text
pnpm exec vitest run src/utils/commandInvocation.test.ts src/utils/devScript.test.ts
[scriptblock]::Create((Get-Content -Raw scripts/install-windows.ps1)) | Out-Null
[scriptblock]::Create((Get-Content -Raw scripts/start-windows.ps1)) | Out-Null
bash -n scripts/install-macos.sh scripts/start-macos.sh
```

Expected: all tests and syntax checks exit `0`.

- [x] **Step 7: Commit Task 1**

```text
git add README.md package.json pnpm-workspace.yaml src/main.ts src/cli/index.ts src/utils/commandInvocation.ts src/utils/commandInvocation.test.ts src/utils/devScript.test.ts scripts/dev.cjs scripts/install-windows.ps1 scripts/start-windows.ps1 scripts/install-macos.sh scripts/start-macos.sh
git commit -m "feat: brand codex-ui and add host deployment scripts"
```

### Task 2: Supervised Codex App-Server Process

**Files:**
- Create: `src/server/codexProcessManager.ts`
- Create: `src/server/codexProcessManager.test.ts`
- Create: `src/realtimeProtocol.ts`
- Modify: `src/commandResolution.ts`
- Modify: `src/server/codexAppServerBridge.ts`

**Interfaces:**
- Consumes: `getSpawnInvocation(command, args, platform)` and `buildAppServerArgs()`.
- Produces: `CodexProcessManager.start(spec, attach)`, `stop()`, `markReady()`, `getHealth()`, and `subscribeHealth(listener)`; `CodexAppServerHealth` is the stable API payload.

- [x] **Step 1: Define health and lifecycle tests with a fake child process**

```ts
const manager = new CodexProcessManager({
  spawn: () => fakeChild,
  now: () => 1_000,
  random: () => 0,
  schedule: (callback, delayMs) => fakeTimers.add(callback, delayMs),
  cancelSchedule: (handle) => fakeTimers.delete(handle),
})

manager.start({ command: 'codex', args: ['app-server'], commandSource: 'path' }, () => {})
expect(manager.getHealth().state).toBe('starting')
manager.markReady()
expect(manager.getHealth()).toMatchObject({ state: 'ready', commandSource: 'path' })
fakeChild.emit('exit', 1, null)
expect(manager.getHealth().state).toBe('restarting')
expect(fakeTimers.onlyDelay()).toBe(500)
```

Add cases for single active process, stderr capped at 40 lines/16 KiB, bearer/token text redaction, spawn `error`, exponential delays capped at 10 seconds, stable readiness resetting attempts, and `stop()` preventing restart. Add command-resolution cases proving environment override, PATH, and package source classification.

- [x] **Step 2: Run the manager test and confirm module-not-found failure**

Run: `pnpm exec vitest run src/server/codexProcessManager.test.ts`

Expected: FAIL because `codexProcessManager.ts` does not exist.

- [x] **Step 3: Implement protocol types and the process manager**

```ts
export type CodexProcessState = 'stopped' | 'starting' | 'ready' | 'restarting' | 'failed'

export type CodexAppServerHealth = {
  state: CodexProcessState
  commandSource: 'environment' | 'path' | 'package' | 'unavailable'
  codexHome: string
  startedAtIso: string | null
  lastReadyAtIso: string | null
  restartAttempts: number
  lastExitCode: number | null
  lastError: string | null
  stderr: string[]
}

export type CodexLaunchSpec = {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
  commandSource: 'environment' | 'path' | 'package'
  codexHome: string
}

export type AttachCodexProcess = (process: ChildProcessWithoutNullStreams) => void
```

`CodexProcessManager` stores the most recent launch spec for restarts, emits a new child through the attach callback, and never creates another child while one is active. Backoff is `min(500 * 2 ** attempt, 10000) + jitter`, with jitter bounded to 20 percent.

Before storing stderr, replace bearer credentials, JSON token fields, and query-string token/password values with `[redacted]`. Keep only the newest 40 lines and no more than 16 KiB.

- [x] **Step 4: Return command source with resolution**

Add:

```ts
export type ResolvedCommand = {
  command: string
  source: 'environment' | 'path' | 'package'
}

export function resolveCodexCommandInfo(): ResolvedCommand | null
```

Retain `resolveCodexCommand(): string | null` as a compatibility wrapper returning `.command`.

- [x] **Step 5: Integrate the manager into `AppServerProcess`**

Replace direct `spawn()` ownership with one `CodexProcessManager`. The bridge's existing stdout parsing, pending JSON-RPC map, server-request map, and stream caches remain in `AppServerProcess`. Its attach callback wires stdout and lifecycle events for each spawned child; on exit it rejects pending RPCs and resets initialization before the manager restarts.

`ensureInitialized()` waits on the existing shared initialization promise. `initialize` success calls `manager.markReady()`. A restarting process never converts `thread/list` to an empty result.

- [x] **Step 6: Run process and existing bridge tests**

Run:

```text
pnpm exec vitest run src/server/codexProcessManager.test.ts src/server/appServerRuntimeConfig.test.ts src/server/codexAppServerBridge.archive.test.ts src/server/codexAppServerBridge.authRefresh.test.ts src/server/codexAppServerBridge.providerModels.test.ts
```

Expected: all new tests pass. On the recorded Windows baseline, the existing symlink canonicalization and POSIX permission-bit assertions remain the only failures in this focused set.

- [x] **Step 7: Commit Task 2**

```text
git add src/commandResolution.ts src/realtimeProtocol.ts src/server/codexProcessManager.ts src/server/codexProcessManager.test.ts src/server/codexAppServerBridge.ts
git commit -m "feat: supervise the Codex app-server process"
```

### Task 3: Bounded Desktop State Coordinator

**Files:**
- Create: `src/codexHome.ts`
- Create: `src/codexHome.test.ts`
- Create: `src/server/desktopStateCoordinator.ts`
- Create: `src/server/desktopStateCoordinator.test.ts`
- Modify: `src/realtimeProtocol.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/cli/index.ts`

**Interfaces:**
- Consumes: `resolveCodexHome(env, homeDirectory)` and native app-server notifications.
- Produces: `DesktopStateCoordinator.start()`, `stop()`, `subscribe(listener)`, `noteNativeNotification(notification)`, `getRevision()`; event method is `codex-ui/state-invalidated`.

- [x] **Step 1: Write Codex home resolution and invalidation coalescing tests**

```ts
expect(resolveCodexHome({ CODEX_HOME: ' D:\\Codex Data ' }, 'C:\\Users\\me')).toBe('D:\\Codex Data')
expect(resolveCodexHome({}, '/Users/me')).toBe('/Users/me/.codex')
```

```ts
const coordinator = new DesktopStateCoordinator({
  codexHome: '/tmp/codex-home',
  watch: fakeWatch,
  schedule: fakeTimers.schedule,
  cancelSchedule: fakeTimers.cancel,
  now: () => 1_000,
})
const events: CodexUiInvalidation[] = []
coordinator.subscribe((event) => events.push(event))
fakeWatch.emit('/tmp/codex-home/sessions', 'rename', 'session-a.jsonl')
fakeWatch.emit('/tmp/codex-home/sessions', 'change', 'session-a.jsonl')
fakeTimers.advanceBy(250)
expect(events).toHaveLength(1)
expect(events[0].params).toMatchObject({ scopes: ['threads', 'projects'], reason: 'filesystem', revision: 1 })
```

Add cases for root global-state changes, archived sessions, SQLite/WAL signals, native notification thread IDs, monotonically increasing revisions, reconciliation, missing directories, and `stop()` closing all watchers/timers.

- [x] **Step 2: Run focused tests and confirm failures**

Run: `pnpm exec vitest run src/codexHome.test.ts src/server/desktopStateCoordinator.test.ts`

Expected: FAIL because both modules are absent.

- [x] **Step 3: Implement the shared home resolver**

```ts
export function resolveCodexHome(
  env: Pick<NodeJS.ProcessEnv, 'CODEX_HOME'> = process.env,
  homeDirectory = homedir(),
): string {
  const configured = env.CODEX_HOME?.trim()
  return configured || join(homeDirectory, '.codex')
}
```

Replace bridge and CLI duplicate home-path implementations only where behavior is identical.

- [x] **Step 4: Implement the coordinator with bounded observation**

Watch at most the `CODEX_HOME` root, `sessions`, and `archived_sessions`. Root events for `.codex-global-state.json`, `session_index.jsonl`, `state_*.sqlite*`, and `thread_history_*.sqlite*` map to `threads` plus `projects`; session directory events map to the same scopes. Native `item/*` and `turn/*` events with a thread ID add that ID and `workspace` where file changes are involved.

Define the shared invalidation contract in `src/realtimeProtocol.ts`:

```ts
export type CodexUiInvalidationScope = 'threads' | 'projects' | 'workspace' | 'health'
export type CodexUiInvalidationReason = 'app-server' | 'filesystem' | 'reconcile' | 'restart'

export type CodexUiInvalidation = {
  method: 'codex-ui/state-invalidated'
  params: {
    scopes: CodexUiInvalidationScope[]
    threadIds?: string[]
    reason: CodexUiInvalidationReason
    revision: number
  }
  atIso: string
}
```

Use one 250 ms debounce timer and one 30 second reconciliation timer. Reconciliation fingerprints watched targets using existence, `mtimeMs`, and size; it never reads session bodies.

- [x] **Step 5: Connect native notifications and coordinator lifecycle**

Create one coordinator in shared bridge state. Start it once, call `noteNativeNotification()` before forwarding each native app-server event, merge its invalidations into `subscribeNotifications`, and stop it from bridge disposal.

- [x] **Step 6: Run focused and bridge tests**

Run:

```text
pnpm exec vitest run src/codexHome.test.ts src/server/desktopStateCoordinator.test.ts src/server/codexAppServerBridge.archive.test.ts src/server/codexAppServerBridge.inlinePayload.test.ts
```

Expected: all new tests pass and watcher-count assertions never exceed three. The recorded backend queue fake-timer cleanup remains the only Windows baseline failure in this focused bridge set.

- [x] **Step 7: Commit Task 3**

```text
git add src/codexHome.ts src/codexHome.test.ts src/realtimeProtocol.ts src/server/desktopStateCoordinator.ts src/server/desktopStateCoordinator.test.ts src/server/codexAppServerBridge.ts src/cli/index.ts
git commit -m "feat: observe shared Codex desktop state"
```

### Task 4: Authenticated Health And Realtime Server Fanout

**Files:**
- Create: `src/server/httpServer.test.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/server/httpServer.ts`
- Modify: `src/realtimeProtocol.ts`

**Interfaces:**
- Consumes: `CodexAppServerHealth`, `CodexUiInvalidation`, coordinator revision, and existing password middleware.
- Produces: authenticated `GET /codex-api/health`, WebSocket/SSE `ready` payload `{ ok: true, revision }`, and one shared event fanout.

- [x] **Step 1: Write HTTP/WebSocket contract tests**

```ts
it('protects health with the shared password', async () => {
  const running = await startTestServer(createServer({ password: 'secret', bridge: fakeBridge }))
  const unauthenticated = await running.request({ path: '/codex-api/health', host: 'shared-host.local' })
  expect(unauthenticated.headers['content-type']).toContain('text/html')

  const login = await running.request({
    method: 'POST',
    path: '/auth/login',
    host: 'shared-host.local',
    body: JSON.stringify({ password: 'secret' }),
  })
  const cookie = login.headers['set-cookie']?.[0].split(';')[0]
  const health = await running.request({ path: '/codex-api/health', host: 'shared-host.local', cookie })
  expect(health.statusCode).toBe(200)
})

it('includes current revision in ready', async () => {
  fakeBridge.getRealtimeRevision.mockReturnValue(7)
  const firstMessage = await connectWebSocket(server)
  expect(firstMessage).toEqual(expect.objectContaining({ method: 'ready', params: { ok: true, revision: 7 } }))
})
```

Define `startTestServer(instance)` in the test with Node's `createServer`, `listen(0, '127.0.0.1')`, and a Promise wrapper around `http.request`; its returned `close()` calls both HTTP close and `instance.dispose()`. Use the `ws` client already in dependencies for the ready assertion; do not add Supertest.

- [x] **Step 2: Run the server test and confirm interface failures**

Run: `pnpm exec vitest run src/server/httpServer.test.ts`

Expected: FAIL because bridge injection, health, and revision interfaces do not exist.

- [x] **Step 3: Add bridge dependency injection and health methods**

Extend `ServerOptions` with an internal optional `bridge` for tests. Extend `CodexBridgeMiddleware`:

```ts
getHealth: () => CodexAppServerHealth
getRealtimeRevision: () => number
```

Handle `GET /codex-api/health` inside the authenticated bridge route and return `{ data: bridge.getHealth() }`.

Subscribe to `CodexProcessManager` health changes and fan them out as `codex-ui/app-server-health` notifications. A transition back to `ready` also publishes one `threads` invalidation with reason `restart`.

- [x] **Step 4: Make WebSocket attachment disposable**

Track the upgrade handler and `WebSocketServer`. `ServerInstance.dispose()` unsubscribes listeners, closes client sockets, closes the WebSocket server, disposes the bridge, and is idempotent. Both WebSocket and SSE ready messages include the current revision.

- [x] **Step 5: Run server and auth tests**

Run:

```text
pnpm exec vitest run src/server/httpServer.test.ts src/server/codexAppServerBridge.authRefresh.test.ts src/server/freeMode.test.ts
```

Expected: all selected tests pass.

- [x] **Step 6: Commit Task 4**

```text
git add src/realtimeProtocol.ts src/server/codexAppServerBridge.ts src/server/httpServer.ts src/server/httpServer.test.ts
git commit -m "feat: expose authenticated realtime host health"
```

### Task 5: Client Invalidation, Reconnect Recovery, And Cache Preservation

**Files:**
- Create: `src/api/realtimeInvalidation.ts`
- Create: `src/api/realtimeInvalidation.test.ts`
- Modify: `src/api/codexRpcClient.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/composables/useDesktopState.test.ts`

**Interfaces:**
- Consumes: `codex-ui/state-invalidated`, `codex-ui/app-server-health`, and `ready.params.revision`.
- Produces: `parseCodexUiInvalidation()`, `getAppServerHealth()`, reactive `appServerHealth`, and deduplicated forced thread refreshes.

- [x] **Step 1: Write parser and composable regression tests**

```ts
expect(parseCodexUiInvalidation({
  method: 'codex-ui/state-invalidated',
  params: { scopes: ['threads'], threadIds: ['thread-1'], reason: 'filesystem', revision: 3 },
  atIso: '2026-08-31T00:00:00.000Z',
})).toEqual({ scopes: ['threads'], threadIds: ['thread-1'], reason: 'filesystem', revision: 3 })
```

In `useDesktopState.test.ts`, emit two revision-3 invalidations plus one native `turn/completed`; assert one forced first-page list request and one selected-thread read. Reject the refresh and assert existing `projectGroups` and cached messages remain unchanged. Emit `ready` with revision 8 after revision 3 and assert one recovery refresh.

- [x] **Step 2: Run focused client tests and confirm failures**

Run:

```text
pnpm exec vitest run src/api/realtimeInvalidation.test.ts src/composables/useDesktopState.test.ts
```

Expected: parser module is absent and new invalidation cases fail.

- [x] **Step 3: Implement strict invalidation parsing and health fetching**

Accept only known scopes, reasons, finite positive revisions, and non-empty string thread IDs. Unknown notification methods return `null`. Add:

```ts
export async function getAppServerHealth(): Promise<CodexAppServerHealth> {
  const response = await fetch('/codex-api/health')
  const payload = await response.json()
  if (!response.ok) throw new CodexApiError('App-server health unavailable', { code: 'http_error', status: response.status })
  return payload.data
}
```

- [x] **Step 4: Queue selective refreshes in the composable**

Maintain `lastRealtimeRevision`. Ignore duplicate/lower revisions. A revision gap or `ready` after a disconnected stream queues a forced list refresh. `threads` queues the list plus only an open affected thread; `projects` queues the list/root state; `workspace` queues the selected project status path without scanning all projects; `health` refreshes health.

Reuse the existing `loadThreadsPromise`, `isPolling`, `pendingThreadsRefresh`, and trailing timer. Do not introduce a second refresh scheduler.

- [x] **Step 5: Preserve cached thread groups on list failure**

Keep `loadedThreadListGroups`, `projectGroups`, `hasLoadedThreads`, and selected cached messages unchanged when a forced list request throws. Set health/error state without applying an empty page.

- [x] **Step 6: Run focused and full composable tests**

Run:

```text
pnpm exec vitest run src/api/realtimeInvalidation.test.ts src/api/codexGateway.test.ts src/composables/useDesktopState.test.ts
```

Expected: all selected tests pass with no duplicate request assertions.

- [x] **Step 7: Commit Task 5**

```text
git add src/api/realtimeInvalidation.ts src/api/realtimeInvalidation.test.ts src/api/codexRpcClient.ts src/api/codexGateway.ts src/composables/useDesktopState.ts src/composables/useDesktopState.test.ts
git commit -m "feat: synchronize shared browser clients selectively"
```

### Task 6: Visible Host Health Without Layout Churn

**Files:**
- Create: `src/components/common/ServerHealthBadge.vue`
- Create: `src/serverHealthPresentation.ts`
- Create: `src/serverHealthPresentation.test.ts`
- Modify: `src/App.vue`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: reactive `appServerHealth` from `useDesktopState()`.
- Produces: stable label/tone mapping and an accessible compact badge shown only outside the healthy steady state or in the existing utility header area.

- [x] **Step 1: Write health presentation tests**

```ts
expect(presentServerHealth({ state: 'ready', restartAttempts: 0 })).toEqual({ label: 'Codex connected', tone: 'ok' })
expect(presentServerHealth({ state: 'restarting', restartAttempts: 2 })).toEqual({ label: 'Codex reconnecting', tone: 'warning' })
expect(presentServerHealth({ state: 'failed', restartAttempts: 3 })).toEqual({ label: 'Codex unavailable', tone: 'error' })
```

- [x] **Step 2: Run the presentation test and confirm failure**

Run: `pnpm exec vitest run src/serverHealthPresentation.test.ts`

Expected: FAIL because the module is absent.

- [x] **Step 3: Implement the mapping and badge**

The badge uses a fixed 20 px status dot/icon area and short text, `role="status"`, and `aria-live="polite"`. It does not resize adjacent tool buttons as status changes. Use the project's existing icon package if a connection/server icon is already available; otherwise use the status dot already established by sidebar thread states.

- [x] **Step 4: Wire light and dark styles**

Add shared styles in `src/style.css` for `ok`, `warning`, and `error`. Use neutral surface colors plus green/amber/red state accents; do not introduce a large banner or card.

- [x] **Step 5: Run unit and frontend type/build checks**

Run:

```text
pnpm exec vitest run src/serverHealthPresentation.test.ts
pnpm run build:frontend
```

Expected: unit test passes and Vue/TypeScript/Vite build exits `0`.

- [x] **Step 6: Commit Task 6**

```text
git add src/components/common/ServerHealthBadge.vue src/serverHealthPresentation.ts src/serverHealthPresentation.test.ts src/App.vue src/style.css
git commit -m "feat: show shared Codex host health"
```

### Task 7: Manual Coverage, Packaging, Realtime Verification, And Performance Audit

**Files:**
- Create: `tests/cli-network-platform/windows-macos-shared-host-deployment.md`
- Create: `tests/thread-loading-state/desktop-and-browser-shared-realtime-sync.md`
- Modify: `tests/cli-network-platform/index.md`
- Modify: `tests/thread-loading-state/index.md`
- Modify: `docs/superpowers/plans/2026-08-31-codex-ui-shared-realtime.md` (check completed steps only)

**Interfaces:**
- Consumes: all preceding production behavior.
- Produces: reproducible manual checks, verified build/package, two-client convergence evidence, and measured request/watcher bounds.

- [x] **Step 1: Add exact manual deployment coverage**

Document prerequisites, `scripts/install-windows.ps1`/`scripts/start-windows.ps1` actions, the equivalent macOS scripts, expected bind URL, shared-password login from another computer, project path with spaces, and cleanup that stops only the test server.

- [x] **Step 2: Add exact realtime convergence coverage**

Document two simultaneous browsers plus Codex desktop, creating a uniquely named desktop session, waiting through the 250 ms debounce, verifying both browsers show it without reload, starting a turn in Browser A, verifying Browser B, terminating only the managed app-server child, and verifying cached sessions remain while health changes and recovery completes.

- [x] **Step 3: Run the complete automated suite and classify baseline failures**

Run: `pnpm run test:unit`

Expected: all new tests pass. Any pre-existing Windows path/permission/timeouts are listed separately with their exact test names and compared to the baseline recorded before implementation.

- [x] **Step 4: Build and perform package smoke checks**

Run:

```text
pnpm run build
pnpm pack --pack-destination output
node dist-cli/index.js --help
```

Expected: build and pack exit `0`; CLI help includes `codexapp`-compatible options and no runtime module error.

- [x] **Step 5: Run the built server against the host Codex environment**

Choose an unused port above the Windows excluded range, start `node dist-cli/index.js --port <port> --no-open --no-tunnel --no-login`, authenticate, and confirm `thread/list` returns existing host sessions rather than `No chats`. Record the chosen port and stop only this server when verification is complete.

- [x] **Step 6: Verify two browser clients and themes**

At desktop `1440x900` and mobile `375x812`, exercise the real changed status UI and shared session refresh in light and dark themes. Save screenshots under `output/playwright/` and assert no overlap, clipped status text, duplicate live overlays, or empty session replacement during restart.

- [x] **Step 7: Run the required performance audit**

Run `pnpm run profile:browser` and `pnpm run profile:thread` against the current verification server. Record `duplicateCounts`, `warnings`, `totalApiKB`, first-page `thread/list` count, selected `thread/read` count, and the coordinator watcher count. Confirm one app-server process, at most three Codex state watchers, one concurrent list refresh, and one selected-thread refresh per coalesced invalidation.

- [x] **Step 8: Update manual indexes and commit verification docs**

```text
git add tests/cli-network-platform/windows-macos-shared-host-deployment.md tests/cli-network-platform/index.md tests/thread-loading-state/desktop-and-browser-shared-realtime-sync.md tests/thread-loading-state/index.md docs/superpowers/plans/2026-08-31-codex-ui-shared-realtime.md
git commit -m "test: document shared realtime host verification"
```

- [x] **Step 9: Final branch verification and push**

Run:

```text
git status --short
git diff --stat main...HEAD
git log --oneline main..HEAD
git push origin codex-ui/shared-realtime-sync
```

Expected: clean worktree, only planned feature commits in the branch delta, and the remote branch contains the final commit.
