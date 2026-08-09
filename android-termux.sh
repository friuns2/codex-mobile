#!/usr/bin/env bash
# ============================================================
# Codex Web UI — Android Termux One-Click Deploy
# ============================================================
# Run this script in Termux on your Android phone.
# It installs everything and starts the server on localhost.
# Then open Chrome → http://localhost:18923
# or use "Add to Home Screen" for app-like experience.
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC} $1"; }

ARCH=$(uname -m)
case "$ARCH" in
  aarch64|arm64)  ARCH_SUFFIX="arm64";;
  armv7l|armv8l)  ARCH_SUFFIX="arm";;
  x86_64)         ARCH_SUFFIX="x86_64";;
  *)              err "Unsupported architecture: $ARCH"; exit 1;;
esac
info "Architecture: $ARCH ($ARCH_SUFFIX)"

# ── 1. Update Termux packages ──
info "Updating Termux packages..."
pkg update -y -q
pkg upgrade -y -q

# ── 2. Install dependencies ──
info "Installing dependencies..."
pkg install -y -q \
  curl git jq openssl-tool \
  nodejs-lts pnpm \
  build-essential python binutils
ok "System dependencies installed"

# ── 3. Grant storage access (first run) ──
if [ ! -d ~/storage ]; then
  info "Requesting storage access (accept on screen)..."
  termux-setup-storage
fi

# ── 4. Clone or pull the repo ──
REPO_URL="${1:-https://github.com/motherskitchenblr2/Upgraded-codex-mobile}"
INSTALL_DIR="$HOME/codexui"

if [ -d "$INSTALL_DIR" ]; then
  info "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  info "Cloning repository..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ── 5. Install Node deps and build ──
info "Installing npm dependencies..."
pnpm install

info "Building frontend + CLI..."
pnpm run build
ok "Build complete"

# ── 6. Start server ──
PORT="${2:-18923}"
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Codex Web UI is starting on:${NC}"
echo -e "${GREEN}  http://localhost:$PORT${NC}"
echo -e "${GREEN}  ${NC}"
echo -e "${GREEN}  Open in Chrome → 'Add to Home Screen' for app-like mode${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""

node dist-cli/index.js --port "$PORT" --no-open --no-tunnel
