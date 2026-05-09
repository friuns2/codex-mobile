# Sidebar Project Pinning

Sidebar project pinning follows Codex.app global state instead of treating pinning as a local-only reorder.

## Behavior

- Project row actions include `Pin project` for unpinned projects and `Unpin project` for pinned projects.
- Pinned projects render before regular projects.
- Pinned project order follows `pinned-project-ids`.
- Regular project order continues to follow `project-order`.
- Pinning preserves the existing workspace-root state fields and only changes `pinned-project-ids`.

## State

Codex.app stores pinned project ids in `~/.codex/.codex-global-state.json` under `pinned-project-ids`. The web bridge exposes that key as `pinnedProjectIds` in `/codex-api/workspace-roots-state`.

Local projects use the workspace root path as the durable pinned id. Remote projects use the remote project id. Duplicate folder names keep using the existing full-path project disambiguation before matching pinned rows.

## Verification Notes

Manual verification should check both light and dark themes because this feature changes the project row action menu. A focused unit test should assert that a pinned project appears before the rest of the Codex `project-order`.

## Sources

- [Sidebar project pinning source](../../raw/features/sidebar-project-pinning.md)
