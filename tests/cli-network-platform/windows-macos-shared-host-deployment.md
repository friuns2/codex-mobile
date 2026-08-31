### Windows and macOS shared-host deployment

#### Feature/Change Name
Deploy one `codex-ui` host on Windows or macOS so authenticated users on other computers share that host user's Codex projects and sessions.

#### Prerequisites/Setup
1. Node.js 18 or newer, pnpm, Git, and the Codex CLI are installed on the host.
2. `codex login` has completed for the same operating-system user that will run `codex-ui`.
3. The host and client computers can reach each other on a trusted network.
4. Choose an unused test port and a temporary shared password.
5. Use a checkout path containing a space, such as `D:\github\codex ui test` or `/Users/test/codex ui test`.

#### Steps
1. On Windows, clone the repository into the path with spaces and run `powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1`.
2. Start the Windows host with `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -Port <port> -Password '<password>'`.
3. Confirm the process stays running and listens on the selected port without opening a tunnel.
4. From another computer, open `http://<host-lan-ip>:<port>` and enter the shared password.
5. Confirm the sidebar contains projects and sessions from the host user's Codex desktop data.
6. Stop only the Windows test server.
7. On macOS, clone the repository into the path with spaces and run `bash scripts/install-macos.sh`.
8. Start the macOS host with `CODEX_UI_PORT=<port> CODEX_UI_PASSWORD='<password>' bash scripts/start-macos.sh`.
9. Repeat the remote login and host project/session checks from another computer.

#### Expected Results
- Both install scripts verify Node.js, pnpm, and Codex before installing dependencies and building the project.
- Both start scripts work when the repository path contains spaces.
- The production server accepts connections from another computer on the selected host port.
- Unauthenticated users see the shared-password login boundary; authenticated users share the same host projects and sessions.
- The browser does not depend on a Codex installation or local project checkout on the client computer.
- `codexapp` and `codexui` CLI compatibility remains available after packaging.

#### Rollback/Cleanup
- Stop only the server started for this test with `Ctrl+C` or its recorded parent process ID.
- Remove the temporary checkout only after confirming it is the test path.
- Do not stop the Codex desktop app or unrelated Node/Codex processes.

---
