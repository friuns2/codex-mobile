# Project ZIP portability source

Date: 2026-05-26

Project portability adds local project export/import flows to `codex-web-local`.

Implementation facts:
- Project and thread context menus expose `Export Project`, opening an export modal that prepares the selected project folder as a ZIP file and then offers explicit `Download` and `Share` actions.
- The new-thread home actions expose `Import Project` next to `Create Project`.
- Import supports exported ZIP files.
- Exported archives include project files and matching Codex chat JSONL history under `.codex-project/chats/`.
- The export manifest records portable project metadata, including project name and export time, but does not include the source machine's absolute project path.
- Exported archives include matching thread title metadata under `.codex-project/chats/thread-titles.json`.
- Project ZIP export skips generated dependency/cache/build folders, including `.git`, `node_modules`, standard Python virtualenv/cache folders, JS framework caches, Gradle/Rust/.NET outputs, coverage folders, `build`, `dist`, and `target`.
- Project ZIP export also skips Git-ignored files when the source folder is inside a Git repository.
- Imported chat JSONL is rewritten into the active `CODEX_HOME` with the imported project path as `cwd`.
- Imported chats preserve exported title metadata in the destination state database and title cache.
- Imported chat provider/model metadata is rewritten to the current local provider/model so resumed imported threads use the destination app configuration.
- Imported project roots are persisted and forced into the sidebar refresh path so projects with no imported threads still appear under Projects.
- Existing non-chat files under a project's `.codex-project/` folder are restored as normal project files; `.codex-project/chats/` remains the reserved chat-import namespace.

Local-only security posture:
- The app server is local-user facing and is not designed as a public internet service.
- Local project import/export intentionally trusts user-selected local paths.
- Review-bot hardening suggestions that assume a hostile remote caller should be rejected for this feature unless they show a concrete path where the local server becomes remotely reachable or bypasses existing authentication.
- Rejected local-only hardening examples include saved-root export allowlists, import parent restrictions, and ZIP upload caps.

Verification facts:
- `pnpm run build` passed after the project import/export changes.
- ZIP import was verified in an isolated `CODEX_HOME` and showed the imported project and chats in the sidebar.
- Docker endpoint validation should use the fast reusable base image workflow for project import/export: build once from `scripts/docker-fast-test-base.Dockerfile`, then mount the current repo and run `node /repo/dist-cli/index.js`.
- Packaged Docker images are only needed when testing package install, postinstall, auth/provider startup, or published runtime behavior.
- Manual coverage lives in `tests/projects-sidebar-new-chat/project-menu-save-project-zip.md`.
