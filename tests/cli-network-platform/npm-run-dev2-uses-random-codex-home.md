### Feature: npm run dev2 uses a random Codex home

#### Prerequisites / Setup
- Dependencies are installed.
- Port `4187` is available, or choose another free port.

#### Actions
1. Run `npm run dev2 -- --host 127.0.0.1 --port 4187`.
2. Read the startup output.
3. Stop the dev server after Vite reports the local URL.

#### Expected Results
- Startup prints `Using temporary CODEX_HOME:` with a unique directory under the system temp folder.
- The command forwards flags to the normal dev wrapper and starts Vite on the requested host and port.
- The normal `npm run dev` command remains unchanged and uses the caller's existing `CODEX_HOME`.

#### Rollback / Cleanup
- Delete the printed temporary `CODEX_HOME` directory if it is no longer needed.
