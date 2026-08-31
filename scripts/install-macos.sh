#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$project_root"

for command_name in node pnpm codex; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command '$command_name' was not found in PATH." >&2
    exit 1
  fi
done

echo 'Checking prerequisites...'
node --version
pnpm --version
codex --version

echo 'Installing codex-ui dependencies...'
pnpm install

echo 'Building codex-ui...'
pnpm run build

echo "codex-ui is ready in $project_root"
echo 'Start it with: ./scripts/start-macos.sh'
