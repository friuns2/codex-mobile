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
6. Start with `--host ::1 --password test-only-password`; confirm the printed URL uses `[::1]`, opens the app directly, and a request with a public `Host` header still requires login.
7. Run `pnpm exec vitest run src/cli/listenHost.test.ts` to verify browser/tunnel targets follow a specific IPv4/IPv6 address and use loopback for wildcard binds.

#### Expected Results
- With `--host 127.0.0.1`, the process listens only on `127.0.0.1:<port>` and the home page responds locally.
- The startup summary reports the selected loopback bind address.
- Without `--host`, the existing default remains `0.0.0.0`.
- Selecting a host does not add requests, background work, or per-request processing.
- Browser and cloudflared targets use the selected address, with valid IPv6 brackets.

#### Rollback/Cleanup
- Stop both test processes and release their ports.
