### Feature: CLI host binding can be restricted to loopback

#### Prerequisites
- Build the CLI with `pnpm run build:cli`.
- Choose a free test port.

#### Steps
1. Start the built CLI with `node dist-cli/index.js --host 127.0.0.1 --port <port> --no-password --no-tunnel --no-open --no-login`.
2. Inspect the listening socket for `<port>`.
3. Request the home page through `http://127.0.0.1:<port>`.
4. Stop the test process.
5. Start it again without `--host` on another free port and inspect that socket.

#### Expected Results
- With `--host 127.0.0.1`, the process listens only on `127.0.0.1:<port>` and the home page responds locally.
- The startup summary reports the selected loopback bind address.
- Without `--host`, the existing default remains `0.0.0.0`.
- Selecting a host does not add requests, background work, or per-request processing.

#### Rollback/Cleanup
- Stop both test processes and release their ports.
