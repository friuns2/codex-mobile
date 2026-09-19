### Zen Proxy Port Resolution When Vite Auto-Increments

#### Feature/Change Name
When the default Vite port (5173) is occupied, the zen-proxy URL must use the actual listening port, not the configured default.

#### Prerequisites/Setup
1. Another process already occupying port 5173
2. Dev server started (will auto-bind to 5174 or next available)
3. OpenCode Zen provider configured with API key

#### Steps
1. Start any process on port 5173 (e.g., another dev server)
2. Run `pnpm run dev` — Vite auto-binds to 5174
3. Open the app at `http://localhost:5174`
4. Switch to "OpenCode Zen" provider, enter API key, save
5. Send a message using `muse-spark-1.3-contributor-free`

#### Expected Results
- The zen-proxy request goes to `http://127.0.0.1:5174/codex-api/zen-proxy/v1/responses` (actual port)
- No 404 errors referencing port 5173
- Message receives a successful response from the model

#### Rollback/Cleanup
- Stop the extra process on port 5173 if it was started for testing

---
