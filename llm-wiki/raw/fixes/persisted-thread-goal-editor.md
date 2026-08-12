# Persisted thread goal editor

Source: Codex.app parity follow-up on 2026-08-12.

Existing thread goals are stored by the app-server and must be loaded with `thread/goal/get` when selecting a thread. The web composer previously only showed a temporary local Goal mode selected from `/goal`, so existing goals were invisible even though the RPC returned them.

The parity surface now shows a compact status/objective card above the composer, keeps the Goal composer pill visible while a persisted goal exists, and opens an editor from either the card pencil or pill. Saving calls `thread/goal/set`; clearing calls `thread/goal/clear`. Supported statuses are `active`, `paused`, `blocked`, `usageLimited`, `budgetLimited`, and `complete`.

The editor uses server state rather than localStorage. Thread selection refreshes the goal so edits survive reload and remain consistent with Codex.app.
