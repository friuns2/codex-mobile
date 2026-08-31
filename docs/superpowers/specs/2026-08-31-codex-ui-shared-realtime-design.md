# codex-ui Shared Realtime Host Design

Date: 2026-08-31
Status: Approved for implementation

## 1. Summary

`codex-ui` is a secondary development of
[`friuns2/codex-mobile`](https://github.com/friuns2/codex-mobile). It runs on one
Windows or macOS computer and exposes that computer's Codex environment to
multiple browser users. The host computer remains the only source of truth for
Codex sessions, project paths, and project files.

Every connected browser sees the same sessions and projects. Changes made by
the Codex desktop app, the web UI, or another browser are reflected in all
clients without a manual full-page reload. The existing shared-password access
model remains in place.

This design does not replicate data between computers and does not add
per-user accounts, permissions, or isolated workspaces.

## 2. Problem Statement

The current web UI can be opened by multiple users, but it does not reliably
show the host's existing Codex desktop projects and sessions. The important
failure modes are:

- The web server owns its own `codex app-server` subprocess and only forwards
  notifications produced by that subprocess.
- The Codex desktop app uses another process, so its live notifications never
  reach the web server's WebSocket clients.
- `startPolling()` opens the notification stream but does not independently
  observe desktop-originated state changes.
- If the managed app-server exits, requests such as `thread/list` fail and the
  UI falls back to an empty `No chats` state.
- The source development wrapper starts `vite.cmd` directly on Windows, which
  can fail with `EINVAL` and is not the production deployment path.

The result is a web UI that appears shared but can become disconnected from the
actual desktop state.

## 3. Goals

1. Use the host's active `CODEX_HOME` (normally `~/.codex`) as the canonical
   session and Codex state store.
2. Show sessions created or changed by the Codex desktop app in every connected
   browser.
3. Show sessions and project metadata changed through one browser in the other
   browsers and in the desktop app through their shared on-disk state.
4. Preserve Codex app-server's native streaming notifications for low-latency
   turns started through `codex-ui`.
5. Recover automatically when the managed app-server crashes or the Codex CLI
   is temporarily unavailable.
6. Support an equivalent install-and-start workflow on Windows and macOS.
7. Keep refresh work targeted and bounded when hundreds or thousands of
   sessions exist.
8. Preserve the current shared-password behavior and existing CLI command name
   `codexapp`.

## 4. Non-Goals

- Per-user accounts, roles, permissions, or private conversations.
- Copying Codex sessions or project files between host computers.
- Simultaneous multi-host write coordination.
- Character-level collaborative editing or cursor presence.
- Changing Codex desktop's internal storage format.
- Requiring the Codex desktop app to be open while `codex-ui` is running.
- Renaming the published npm package or executable from `codexapp` in this
  phase.

## 5. Source Of Truth And Sharing Semantics

### 5.1 Host ownership

The central host owns all state:

- Codex sessions and indexes under the resolved `CODEX_HOME`.
- Codex global state used for desktop project metadata.
- Project directories referenced by session working directories.
- Authentication and provider configuration already used by Codex on the host.

Browsers never maintain an authoritative copy. Client state is a cache that can
be invalidated and rebuilt from server responses.

### 5.2 Shared-user behavior

All authenticated browser clients share the same view and the same write
capabilities. If two users act on the same session, Codex and filesystem-level
serialization determine the final order. The UI must not imply user-specific
ownership.

The existing shared password protects the HTTP and WebSocket endpoints. This
deployment is intended for a trusted LAN, VPN, or tunnel rather than direct
unauthenticated internet exposure.

## 6. Architecture

The feature adds two server-side components around the existing HTTP bridge:

1. `CodexProcessManager`: owns one long-lived, supervised `codex app-server`
   process for `codex-ui`.
2. `DesktopStateCoordinator`: observes canonical host state and publishes
   semantic invalidations to every browser.

```text
Codex desktop process -----+
                          | writes
Browser A --+             v
Browser B --+--> codex-ui server --> host CODEX_HOME + project directories
Browser C --+          |       ^
                       | RPC   | reads/writes
                       v       |
                 managed codex app-server
                       |
                       +--> native Codex notifications

DesktopStateCoordinator watches host state changes
and broadcasts targeted invalidations to all browsers.
```

The existing HTTP API and WebSocket endpoint remain the public interface. The
coordinator augments native notifications; it does not replace them.

## 7. Managed Codex App-Server

### 7.1 Command discovery

Command resolution must be explicit and observable. Resolution order:

1. `CODEXUI_CODEX_COMMAND` when configured.
2. A `codex` executable found on `PATH`.
3. Platform-specific command shims already supported by the package install.

Windows resolution must correctly handle `.cmd` launchers without attempting
to execute them as native binaries. macOS resolution must work with npm global,
Homebrew, and application-provided PATH layouts when the command is visible to
the launching shell.

The UI health response reports the selected command source without leaking
tokens or unrelated environment variables.

### 7.2 Lifecycle

`CodexProcessManager` owns at most one active app-server process per `codex-ui`
server instance. Concurrent RPC calls share the same readiness promise instead
of starting duplicate processes.

State transitions:

```text
stopped -> starting -> ready
                 |       |
                 v       v
               failed <- exited
                  |
                  +-- backoff --> starting
```

Unexpected exits trigger bounded exponential restart backoff with jitter. A
successful stable start resets the retry counter. Explicit server shutdown
stops retries.

RPC calls made while the process is restarting receive a clear retryable error
or wait for the shared readiness promise within a fixed timeout. They must not
silently return an empty session list.

### 7.3 Diagnostics

The manager keeps a bounded stderr ring buffer and exposes sanitized health
information to authenticated clients:

- lifecycle state;
- last successful start time;
- restart attempt count;
- last exit code or spawn error;
- recent bounded stderr lines;
- resolved `CODEX_HOME` and command source.

Sensitive environment values and auth file contents are never returned.

## 8. Desktop State Coordinator

### 8.1 Observation targets

The coordinator resolves targets from the active `CODEX_HOME` instead of
hard-coding a user directory. It observes categories, not private storage
formats:

- session index and session directories;
- archived session directories;
- Codex global state and its atomic replacement events;
- relevant state database and WAL changes when present;
- registered active project roots for coarse project-state changes.

Filesystem events are treated only as invalidation signals. The coordinator
does not parse partially written JSON, JSONL, SQLite, or WAL files to construct
authoritative client data. Canonical data is re-read through existing server
and app-server APIs after writes settle.

### 8.2 Event normalization

Native filesystem watchers differ across Windows and macOS and may emit
duplicate, missing, rename, or directory-level events. The coordinator therefore:

- debounces events per category;
- coalesces duplicate paths;
- treats rename/create/delete sequences as one invalidation window;
- performs a low-frequency reconciliation check as a missed-event safety net;
- never starts one timer or watcher per session.

The fallback reconciliation compares lightweight metadata such as directory
timestamps, file size, and selected index fingerprints. It does not repeatedly
scan or parse all session contents.

### 8.3 Semantic invalidations

The coordinator emits internal notifications through the existing WebSocket
fanout:

```ts
type CodexUiInvalidation =
  | {
      method: 'codex-ui/state-invalidated'
      params: {
        scopes: Array<'threads' | 'projects' | 'workspace' | 'health'>
        threadIds?: string[]
        reason: 'app-server' | 'filesystem' | 'reconcile' | 'restart'
        revision: number
      }
      atIso: string
    }
```

`revision` is monotonically increasing for the lifetime of the server. It lets
clients ignore duplicates and detect gaps. Invalidations contain identifiers
and scopes only; they do not broadcast session bodies or project file content.

### 8.4 Self-write suppression

Changes initiated through the managed app-server often produce both native
notifications and filesystem events. A short-lived mutation ledger records
known thread IDs and state categories around server-originated mutations. The
coordinator still emits an invalidation, but coalesces the duplicate signals
into one refresh window. Correctness does not depend on perfect suppression.

## 9. Client Synchronization

Clients continue applying native token, item, turn, and terminal notifications
immediately. The new invalidation event triggers selective canonical refreshes:

| Invalidation | Client action |
| --- | --- |
| `threads` without IDs | Refresh the first thread-list page and project grouping |
| `threads` with IDs | Refresh list metadata and reload only an open affected thread |
| `projects` | Refresh project/workspace roots and regroup cached threads |
| `workspace` | Refresh active project status only |
| `health` | Refresh the app-server health indicator |

Refreshes are debounced and deduplicated across native and coordinator events.
Only one list refresh and one refresh per affected thread may be in flight.
When another invalidation arrives during a request, one trailing refresh runs
after the current request completes.

On WebSocket connect or reconnect, the server sends `ready` with the current
revision. The client performs one bounded recovery refresh because it may have
missed events while disconnected. A visibility-change recovery may use the same
path, with a minimum interval to prevent tab switching from causing request
bursts.

An app-server failure is displayed as an unavailable/restarting state. Existing
cached sessions remain visible and are not replaced with `No chats` solely
because a transient refresh failed.

## 10. Project State

Session working directories are the primary link between sessions and projects.
Project roots known to the server are watched coarsely. The system must avoid
recursive watchers across entire repositories, because large dependency and
build directories create unbounded event volume.

The initial implementation refreshes project identity, root availability, git
branch/status summaries already exposed by existing APIs, and thread grouping.
It does not live-stream every file change in a repository.

Project paths refer to the host filesystem. A remote browser user sees and acts
on those host paths; the path is not expected to exist on the user's own
computer.

## 11. Deployment

### 11.1 Production path

Shared deployments use the built CLI and bundled frontend, not the Vite
development server:

```text
codexapp --port <port>
```

The current CLI listens on `0.0.0.0`; existing password/tunnel flags remain
compatible. Startup prints the local URL, network URL when available, resolved
`CODEX_HOME`, and app-server health without printing credentials.

### 11.2 Windows

Provide PowerShell scripts that:

- check Node.js, pnpm/npm, Git, and Codex CLI prerequisites;
- install dependencies and build the frontend plus CLI;
- start the built `codexapp` server using PowerShell-safe process invocation;
- optionally create a user-level startup task only when explicitly requested;
- preserve user-selected host, port, password, and `CODEX_HOME` settings.

The development wrapper also receives a Windows-safe launcher fix, but it is
not documented as the production deployment mechanism.

### 11.3 macOS

Provide shell scripts with equivalent checks, build, and start behavior. The
scripts may document an optional `launchd` user agent, but must not install one
without an explicit flag.

### 11.4 Repository and branding

The GitHub repository is `ylwhlhp/codex-ui`. User-facing repository metadata,
UI branding, and README title use `codex-ui`. The npm package name and executable
remain `codexapp` for compatibility.

The README must prominently state that the project is a secondary development
of `friuns2/codex-mobile`, link to the original repository, retain the MIT
license notice, and distinguish upstream attribution from this fork's changes.

## 12. Failure Handling

- **Codex CLI missing:** health reports the missing command and installation
  guidance; the web server remains reachable.
- **App-server crash:** cached UI stays visible, manager restarts with backoff,
  and a `health` plus `threads` invalidation follows recovery.
- **Malformed/partial state write:** watcher waits for the debounce window and
  canonical APIs handle the final state; no partial file is broadcast.
- **Watcher overflow or missed event:** reconciliation produces a broad scoped
  invalidation.
- **WebSocket disconnect:** browser reconnects with backoff and performs one
  recovery refresh.
- **Project removed or unavailable:** project is marked unavailable without
  deleting its session history.
- **Two browser mutations:** requests are processed by the same app-server;
  both clients eventually converge through native events and invalidation.

## 13. Security And Privacy

This phase preserves the current shared-password authorization boundary. All
new health endpoints and WebSocket invalidations use the same authorization
checks as existing Codex APIs.

Invalidations contain no message bodies, file content, auth tokens, or command
environment. Diagnostic stderr is bounded and sanitized. Installation scripts
do not copy `CODEX_HOME` or project data to another machine.

Because every authenticated user has the host user's effective capabilities,
documentation must clearly describe this as a trusted shared environment.

## 14. Testing Strategy

Implementation follows test-driven development. Focused automated coverage
must include:

- Windows and POSIX command resolution, including `.cmd` shims and configured
  command overrides;
- single-flight app-server startup and RPC readiness;
- crash, bounded stderr, backoff, successful recovery, and explicit shutdown;
- watcher debounce, atomic rename sequences, duplicate events, and fallback
  reconciliation;
- semantic invalidation scopes, revisions, and WebSocket authorization;
- client refresh deduplication, trailing refresh, reconnect recovery, and cache
  preservation on transient failure;
- a desktop-originated session fixture becoming visible to two simulated
  browser clients;
- a browser-originated change reaching the second client;
- Windows PowerShell and macOS shell script smoke checks;
- README attribution and package/repository branding assertions where practical.

Manual verification covers light and dark themes, desktop and mobile browser
sizes, at least two simultaneous browser clients, a live Codex desktop-created
session, app-server restart, and a project path with spaces.

Build verification includes the frontend, CLI, CJS/public package smoke test,
and packed production startup. Existing upstream Windows-only baseline failures
must be separated from regressions introduced by this work.

## 15. Performance Constraints

The implementation must satisfy these constraints before completion:

- one app-server process per `codex-ui` server;
- a bounded number of watchers independent of session count;
- no recursive whole-repository watching;
- no full session-body reads during filesystem event handling;
- no more than one concurrent thread-list refresh per client;
- no duplicate selected-thread fetch for one coalesced invalidation;
- bounded invalidation payloads and stderr buffers;
- reconciliation frequency configurable and disabled when the server stops.

Performance verification records startup/thread profile request counts, duplicate
request warnings, API payload totals, watcher counts, and behavior against a
realistic large `CODEX_HOME`.

## 16. Delivery Slices

1. Repository branding, attribution, and cross-platform deployment entrypoints.
2. Windows-safe development launcher and cross-platform Codex command discovery.
3. Supervised single app-server lifecycle and authenticated health reporting.
4. Desktop state coordinator and semantic invalidation protocol.
5. Client-side selective refresh, cache preservation, and reconnect recovery.
6. End-to-end two-browser plus desktop synchronization verification.

Each slice is committed separately after its focused tests pass.

## 17. Acceptance Criteria

The work is complete when all of the following are demonstrated on the central
host:

1. Starting the production build on Windows or macOS uses the host's resolved
   Codex environment.
2. Existing Codex desktop sessions and project groupings appear in a newly
   connected browser.
3. A session created or changed in Codex desktop appears in two open browsers
   without a page reload.
4. A change initiated in one browser appears in the other browser in real time
   or after the bounded invalidation debounce.
5. A managed app-server crash produces a visible health transition, restarts
   automatically, and restores RPC service without clearing cached sessions.
6. Refresh request counts remain deduplicated during a burst of native and
   filesystem events.
7. Shared-password protection applies to HTTP health/state APIs and WebSocket
   connections.
8. README attribution, MIT licensing, `codex-ui` branding, and Windows/macOS
   deployment instructions are present.
