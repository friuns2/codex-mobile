### Feature: Share the running official Codex app-server control socket

#### Prerequisites
- A Codex app-server daemon is running with its control socket at `$CODEX_HOME/app-server-control/app-server-control.sock`.
- An existing Codex thread can be opened in the official client.
- The Codex Mobile build under test is available locally.

#### Steps
0. Run `pnpm run build` followed by `node scripts/test-shared-app-server.cjs`.
   The harness uses temporary Codex homes and a mock Unix WebSocket daemon. It
   checks concurrent RPC calls share one connection and initialization, pending
   calls fail on disconnect, subsequent calls reconnect, missing sockets can
   recover, and stopping the UI leaves the daemon listening. No model calls are made.
1. Start Codex Mobile with `--shared-app-server`, or pass `--app-server-socket <absolute-socket-path>` for a non-default socket.
2. Confirm the startup summary reports `App server: shared` and the expected socket path.
3. Open the same existing thread in Codex Mobile and in the official client.
4. Confirm `thread/read` and `thread/resume` succeed in Codex Mobile without an `already has an active writer` response.
5. Send a short prompt from Codex Mobile and confirm its turn appears in the official client after refresh.
6. Stop Codex Mobile, then confirm the official app-server daemon is still running.
7. Start Codex Mobile without either shared-server flag and confirm the startup summary returns to `App server: spawned`.

#### Expected Results
- Shared mode connects over the official Unix control socket using WebSocket frames without compression.
- Existing threads can be read, resumed, and continued through the same app-server process.
- Stopping Codex Mobile closes only its WebSocket connection and does not terminate the official daemon.
- The default launch behavior remains an independently spawned app-server.
- A missing or inaccessible socket produces a clear connection error containing the socket path.

#### Rollback/Cleanup
- Stop the Codex Mobile process started for this test.
- Remove `CODEXUI_APP_SERVER_MODE` and `CODEXUI_APP_SERVER_SOCKET` overrides, if set.
- No official Codex process or thread data should be removed.
- The automated harness removes its temporary homes, sockets and child processes.
