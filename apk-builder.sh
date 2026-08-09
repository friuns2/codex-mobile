#!/usr/bin/env bash
# ============================================================
# Codex Web UI — APK Builder for Android
# ============================================================
# Builds a standalone Android APK that wraps the web app
# in a fullscreen WebView. Two methods available:
#   1. bubblewrap (TWA) — Google's official PWA-to-APK tool
#   2. androidjs     — Node.js APK builder
#
# Prerequisites:
#   - Node.js 18+
#   - Java 11+ (JDK) for method 1
#   - Internet connection
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC} $1"; }

OUTPUT_DIR="$SCRIPT_DIR/dist-apk"
mkdir -p "$OUTPUT_DIR"

# ── Method 1: Bubblewrap (TWA) ──
build_bubblewrap() {
  info "Method 1: Building with Bubblewrap (Trusted Web Activity)..."
  command -v java &>/dev/null || { warn "Java not found — skipping bubblewrap"; return 1; }

  local url="${1:-http://localhost:18923}"
  local app_name="${2:-Codex Web}"
  local package_name="${3:-com.codexweb.app}"

  npm install -g @bubblewrap/cli 2>/dev/null

  mkdir -p "$OUTPUT_DIR/twa"
  cd "$OUTPUT_DIR/twa"

  npx @bubblewrap/cli init \
    --manifest "$url/manifest.webmanifest" \
    --directory "$OUTPUT_DIR/twa" \
    --host "localhost" \
    2>&1 || {
      warn "Bubblewrap init failed. Trying AndroidJS fallback..."
      cd "$SCRIPT_DIR"
      return 1
    }

  npx @bubblewrap/cli build --directory "$OUTPUT_DIR/twa" 2>&1 || {
    warn "Bubblewrap build failed."
    cd "$SCRIPT_DIR"
    return 1
  }

  cp "$OUTPUT_DIR/twa/app-release-signed.apk" "$OUTPUT_DIR/codex-web-twa.apk" 2>/dev/null
  cd "$SCRIPT_DIR"
  ok "APK built: $OUTPUT_DIR/codex-web-twa.apk"
}

# ── Method 2: AndroidJS (Node.js WebView) ──
build_androidjs() {
  info "Method 2: Building with AndroidJS (Node.js WebView wrapper)..."
  local url="${1:-http://localhost:18923}"
  local app_name="${2:-Codex Web}"

  local workdir="$OUTPUT_DIR/androidjs"
  mkdir -p "$workdir"
  cd "$workdir"

  cat > package.json << 'JSON'
{
  "name": "codex-web-android",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "build": "androidjs build"
  },
  "dependencies": {
    "androidjs": "^2.0.3"
  }
}
JSON

  cat > index.js << 'JS'
const { app } = require('androidjs');
const { BrowserWindow } = require('androidjs');

app.on('ready', () => {
  const win = new BrowserWindow({
    fullscreen: true,
    webviewOptions: {
      allowFileAccess: true,
      allowContentAccess: true,
      domStorageEnabled: true,
      javaScriptEnabled: true,
    }
  });
  win.loadURL('APP_URL');
});
JS

  # Replace placeholder with actual URL
  sed -i "s|APP_URL|$url|g" index.js

  npm install --legacy-peer-deps 2>&1 || npm install 2>&1

  npx androidjs build 2>&1 || {
    err "AndroidJS build failed. See $workdir for logs."
    cd "$SCRIPT_DIR"
    return 1
  }

  cp -r build/*.apk "$OUTPUT_DIR/" 2>/dev/null
  cd "$SCRIPT_DIR"
  ok "APK built via AndroidJS — check $OUTPUT_DIR"
}

# ── Method 3: Create APK from local dev server URL ──
build_from_local() {
  info "Method 3: Building APK pointed at local dev server..."

  # First ensure the app is built and running
  if ! curl -s -o /dev/null -w "" http://localhost:18923 2>/dev/null; then
    info "Local server not running. Building and starting..."
    pnpm run build 2>/dev/null
    node dist-cli/index.js --port 18923 --no-open --no-tunnel &
    SERVER_PID=$!
    sleep 3
  fi

  build_androidjs "http://localhost:18923" || build_bubblewrap "http://localhost:18923" || {
    err "All APK build methods failed."
    [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
    exit 1
  }

  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
}

# ── Usage ──
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           Codex Web — APK Builder                      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Methods available:"
echo "  1. bubblewrap  — Google TWA (requires Java JDK 11+)"
echo "  2. androidjs   — Node.js WebView wrapper"
echo "  3. auto        — Try androidjs first, fallback to bubblewrap"
echo "  4. local       — Build pointing at localhost:18923"
echo ""

METHOD="${1:-auto}"
case "$METHOD" in
  bubblewrap|1)
    build_bubblewrap "${2:-http://localhost:18923}" "${3:-Codex Web}" "${4:-com.codexweb.app}"
    ;;
  androidjs|2)
    build_androidjs "${2:-http://localhost:18923}" "${3:-Codex Web}"
    ;;
  auto|3|"")
    build_androidjs "${2:-http://localhost:18923}" "${3:-Codex Web}" \
      || build_bubblewrap "${2:-http://localhost:18923}" "${3:-Codex Web}" "${4:-com.codexweb.app}" \
      || { err "All methods failed"; exit 1; }
    ;;
  local|4)
    build_from_local
    ;;
  *)
    echo "Usage: $0 [method] [url] [app-name] [package]"
    echo "  method: bubblewrap | androidjs | auto (default) | local"
    exit 1
    ;;
esac

ok "Done. APK files in: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"/*.apk 2>/dev/null || echo "(no APK found — check output above)"
