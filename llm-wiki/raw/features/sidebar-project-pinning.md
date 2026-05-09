# Source: Sidebar Project Pinning

Date: 2026-05-09

The sidebar now mirrors Codex.app project pinning. Codex.app exposes `Pin project` from each project row action menu and persists the selection in `~/.codex/.codex-global-state.json` under `pinned-project-ids`.

The web bridge reads and writes this key through `/codex-api/workspace-roots-state` as `pinnedProjectIds`. Existing workspace root fields remain preserved when pinning changes: `electron-saved-workspace-roots`, `electron-workspace-root-labels`, `active-workspace-roots`, `project-order`, and `remote-projects`.

Pinned projects are rendered before regular projects while preserving the pinned order. Non-pinned projects continue to follow Codex `project-order`. Duplicate leaf-name projects are resolved through the same full-path disambiguation used for workspace roots, and remote projects keep their remote project id as the pinned id.

The project action menu now shows `Pin project` or `Unpin project` depending on the current pinned state. Pinning does not rewrite manual project order; it only updates `pinned-project-ids`.
