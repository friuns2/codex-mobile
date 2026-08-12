#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${CODEX_APP_PATH:-/Applications/Codex.app}"
ELECTRON_PATH="${CODEX_ELECTRON_BIN:-}"
ELECTRON_PACKAGE="${CODEX_ELECTRON_PACKAGE:-electron@41.2.0}"
REMOTE_DEBUG_PORT="${CODEX_ELECTRON_REMOTE_DEBUG_PORT:-9229}"
INSPECT_PORT="${CODEX_NODE_INSPECT_PORT:-9222}"
DRY_RUN=0
EXTRA_ARGS=()
VERIFY_ONLY=0
EXTERNAL_ELECTRON=0
TARGET_PREFIX="${CODEX_CDP_TARGET_PREFIX:-app://-/index.html}"
RENDERER_TIMEOUT="${CODEX_CDP_RENDERER_TIMEOUT:-30}"

find_free_port() {
  local port="$1"
  while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
  done
  printf '%s' "$port"
}

wait_for_http_json() {
  local port="$1"
  local path="$2"
  local timeout="${3:-15}"
  local waited=0
  while (( waited < timeout )); do
    if curl -fsS "http://127.0.0.1:${port}${path}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 1
}

find_cdp_page_target() {
  local port="$1"
  local target_prefix="$2"
  curl -fsS "http://127.0.0.1:${port}/json/list" 2>/dev/null | python3 -c '
import json, sys
prefix = sys.argv[1]
try:
    targets = json.load(sys.stdin)
except json.JSONDecodeError:
    raise SystemExit(1)
page = next((target for target in targets
             if target.get("type") == "page"
             and str(target.get("url", "")).startswith(prefix)), None)
if page:
    print(page.get("webSocketDebuggerUrl", ""))
' "$target_prefix"
}

wait_for_cdp_page_target() {
  local port="$1"
  local target_prefix="$2"
  local timeout="$3"
  local waited=0
  local target=""
  while (( waited < timeout )); do
    target="$(find_cdp_page_target "$port" "$target_prefix" || true)"
    if [[ -n "$target" ]]; then
      printf '%s' "$target"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 1
}

prepare_external_electron_native_shims() {
  local app_resources="$1"
  local electron_package="$2"
  local pkg_name="$electron_package"
  local pkg_version=""
  local electron_resources=""

  if [[ "$electron_package" == *@* ]]; then
    pkg_name="${electron_package%@*}"
    pkg_version="${electron_package##*@}"
  fi

  if [[ "$pkg_name" != "electron" || -z "$pkg_version" ]]; then
    return 0
  fi

  # Warm the dlx cache so the Electron bundle path exists before launch.
  pnpm dlx "$electron_package" --version >/dev/null 2>&1 || true

  electron_resources="$(find "$HOME/Library/Caches/pnpm/dlx" \
    -path "*node_modules/.pnpm/electron@${pkg_version}*/node_modules/electron/dist/Electron.app/Contents/Resources" \
    | tail -n 1)"

  if [[ -z "$electron_resources" ]]; then
    return 0
  fi

  mkdir -p "$electron_resources/native"

  if [[ -e "$app_resources/native/sparkle.node" && ! -e "$electron_resources/native/sparkle.node" ]]; then
    ln -snf "$app_resources/native/sparkle.node" "$electron_resources/native/sparkle.node"
  fi
}

usage() {
  cat <<'USAGE'
Usage:
  run-codex-unpacked-debug.sh [options] [-- <extra app args>]

Options:
  --app <path>             Codex.app path (default: /Applications/Codex.app)
  --external-electron       Launch app.asar with Electron (diagnostic opt-in only)
  --electron <path>         Electron binary for --external-electron
  --electron-package <pkg> Package to use with pnpm dlx for --external-electron
  --remote-debugging-port N Set Chromium remote debugging port (default: 9229)
  --inspect-port N          Set Node.js inspector port (default: 9222)
  --target-prefix <url>     Expected renderer URL prefix (default: app://-/index.html)
  --renderer-timeout N      Seconds to wait for the renderer target (default: 30)
  --verify-only             Only check whether the configured debug endpoints are live
  --dry-run                 Print command only
  -h, --help               Show this help

Examples:
  ./run-codex-unpacked-debug.sh
  ./run-codex-unpacked-debug.sh
  ./run-codex-unpacked-debug.sh --external-electron
USAGE
}

while (( $# )); do
  case "$1" in
    --app)
      APP_PATH="${2:?missing value for --app}"
      shift 2
      ;;
    --electron)
      ELECTRON_PATH="${2:?missing value for --electron}"
      shift 2
      ;;
    --external-electron)
      EXTERNAL_ELECTRON=1
      shift
      ;;
    --electron-package)
      ELECTRON_PACKAGE="${2:?missing value for --electron-package}"
      shift 2
      ;;
    --remote-debugging-port)
      REMOTE_DEBUG_PORT="${2:?missing value for --remote-debugging-port}"
      shift 2
      ;;
    --inspect-port)
      INSPECT_PORT="${2:?missing value for --inspect-port}"
      shift 2
      ;;
    --target-prefix)
      TARGET_PREFIX="${2:?missing value for --target-prefix}"
      shift 2
      ;;
    --renderer-timeout)
      RENDERER_TIMEOUT="${2:?missing value for --renderer-timeout}"
      shift 2
      ;;
    --verify-only)
      VERIFY_ONLY=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

if (( VERIFY_ONLY )); then
  echo "Verifying Codex debug endpoints"
  echo "CDP:     http://127.0.0.1:${REMOTE_DEBUG_PORT}/json/version"
  if wait_for_http_json "$REMOTE_DEBUG_PORT" "/json/version" 1; then
    curl -fsS "http://127.0.0.1:${REMOTE_DEBUG_PORT}/json/version"
    echo
  else
    echo "CDP endpoint is not reachable on port ${REMOTE_DEBUG_PORT}" >&2
    exit 1
  fi

  if target="$(wait_for_cdp_page_target "$REMOTE_DEBUG_PORT" "$TARGET_PREFIX" 1)"; then
    echo "Renderer: ${target}"
  else
    echo "No usable renderer target (${TARGET_PREFIX}*) is reachable on port ${REMOTE_DEBUG_PORT}" >&2
    exit 3
  fi

  echo
  echo "Inspector: http://127.0.0.1:${INSPECT_PORT}/json/list"
  if wait_for_http_json "$INSPECT_PORT" "/json/list" 1; then
    curl -fsS "http://127.0.0.1:${INSPECT_PORT}/json/list"
    echo
  else
    echo "Node inspector endpoint is not reachable on port ${INSPECT_PORT}" >&2
    exit 2
  fi
  exit 0
fi

APP_ENTRY="$APP_PATH/Contents/Resources/app.asar"
CLI_PATH="$APP_PATH/Contents/Resources/codex"
APP_RESOURCES_DIR="$APP_PATH/Contents/Resources"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: app not found: $APP_PATH" >&2
  exit 1
fi
if [[ ! -f "$APP_ENTRY" ]]; then
  echo "Error: app.asar missing: $APP_ENTRY" >&2
  exit 1
fi
if [[ ! -x "$CLI_PATH" ]]; then
  echo "Error: codex CLI missing or not executable: $CLI_PATH" >&2
  exit 1
fi

REMOTE_DEBUG_PORT="$(find_free_port "$REMOTE_DEBUG_PORT")"
INSPECT_PORT="$(find_free_port "$INSPECT_PORT")"

if (( EXTERNAL_ELECTRON )); then
  if [[ -n "$ELECTRON_PATH" ]]; then
  if [[ ! -x "$ELECTRON_PATH" ]]; then
    echo "Error: specified electron is not executable: $ELECTRON_PATH" >&2
    exit 1
  fi
  ELECTRON_CMD=("$ELECTRON_PATH")
elif command -v electron >/dev/null 2>&1; then
  ELECTRON_BIN="$(command -v electron)"
  ELECTRON_CMD=("$ELECTRON_BIN")
else
  ELECTRON_CMD=("pnpm" "dlx" "$ELECTRON_PACKAGE")
  prepare_external_electron_native_shims "$APP_RESOURCES_DIR" "$ELECTRON_PACKAGE"
fi

  ELECTRON_FLAGS=(
    "--enable-logging"
    "--remote-debugging-port=$REMOTE_DEBUG_PORT"
    "--inspect=$INSPECT_PORT"
  )
  export ELECTRON_FORCE_IS_PACKAGED=true
  export CODEX_CLI_PATH="$CLI_PATH"
  export CUSTOM_CLI_PATH="$CLI_PATH"
  CMD=("${ELECTRON_CMD[@]}" "${ELECTRON_FLAGS[@]}" "$APP_ENTRY")
  if ((${#EXTRA_ARGS[@]})); then CMD+=("${EXTRA_ARGS[@]}"); fi
  LAUNCH_LABEL="external Electron diagnostic"
else
  CMD=(open -na "$APP_PATH" --args "--remote-debugging-port=$REMOTE_DEBUG_PORT" "--user-data-dir=/tmp/codex-cdp-$REMOTE_DEBUG_PORT")
  if ((${#EXTRA_ARGS[@]})); then CMD+=("${EXTRA_ARGS[@]}"); fi
  LAUNCH_LABEL="native Codex.app"
fi

echo "Launching ${LAUNCH_LABEL} with CDP"
echo "App: $APP_PATH"
echo "CDP port: $REMOTE_DEBUG_PORT"
echo "Inspector port: $INSPECT_PORT"
echo "Command:"
printf '  %q' "${CMD[@]}"
echo

if (( DRY_RUN )); then
  exit 0
fi

"${CMD[@]}" &
APP_PID=$!

if ! wait_for_http_json "$REMOTE_DEBUG_PORT" "/json/version" 20; then
  echo "Error: CDP endpoint did not come up on port ${REMOTE_DEBUG_PORT}" >&2
  wait "$APP_PID" || true
  exit 1
fi

echo
echo "CDP endpoint is live:"
curl -fsS "http://127.0.0.1:${REMOTE_DEBUG_PORT}/json/version"
echo

if ! RENDERER_TARGET="$(wait_for_cdp_page_target "$REMOTE_DEBUG_PORT" "$TARGET_PREFIX" "$RENDERER_TIMEOUT")"; then
  echo "Error: CDP opened, but no renderer target (${TARGET_PREFIX}*) appeared within ${RENDERER_TIMEOUT}s." >&2
  echo "Launch did not meet the parity debug contract." >&2
  if (( EXTERNAL_ELECTRON )); then kill "$APP_PID" 2>/dev/null || true; fi
  wait "$APP_PID" 2>/dev/null || true
  exit 3
fi

echo "Renderer target is live:"
echo "$RENDERER_TARGET"

if (( EXTERNAL_ELECTRON )) && wait_for_http_json "$INSPECT_PORT" "/json/list" 5; then
  echo
  echo "Node inspector endpoint is live:"
  curl -fsS "http://127.0.0.1:${INSPECT_PORT}/json/list"
  echo
elif (( EXTERNAL_ELECTRON )); then
  echo
  echo "Warning: Node inspector endpoint did not come up on port ${INSPECT_PORT}" >&2
fi

if (( EXTERNAL_ELECTRON )); then wait "$APP_PID"; fi
