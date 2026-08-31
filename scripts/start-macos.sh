#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd -P)"
cli_entry="$project_root/dist-cli/index.js"
port="${CODEX_UI_PORT:-5900}"

if [[ ! -f "$cli_entry" ]]; then
  echo 'Built CLI not found. Run ./scripts/install-macos.sh first.' >&2
  exit 1
fi

args=("$cli_entry" --port "$port" --no-open --no-tunnel)
if [[ -n "${CODEX_UI_PASSWORD:-}" ]]; then
  args+=(--password "$CODEX_UI_PASSWORD")
fi

cd "$project_root"
exec node "${args[@]}"
