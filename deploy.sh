#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC} $1"; }

detect_pkg_manager() {
  for pm in apt dnf yum pacman zypper apk; do
    command -v "$pm" &>/dev/null && { echo "$pm"; return; }
  done
  echo ""
}

install_deps() {
  local pm; pm=$(detect_pkg_manager)
  if [ -z "$pm" ]; then
    warn "No supported package manager found. Install Node.js 18+ and pnpm manually."
    return
  fi

  info "Detected package manager: $pm"
  case "$pm" in
    apt)
      sudo apt update -qq
      sudo apt install -y -qq curl git openssl jq
      if ! command -v node &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
        sudo apt install -y -qq nodejs
      fi
      ;;
    dnf)
      sudo dnf install -y curl git openssl jq nodejs npm
      ;;
    yum)
      sudo yum install -y curl git openssl jq nodejs npm
      ;;
    pacman)
      sudo pacman -Sy --noconfirm curl git openssl jq nodejs npm
      ;;
    zypper)
      sudo zypper --non-interactive install curl git openssl jq nodejs npm
      ;;
    apk)
      apk add curl git openssl jq nodejs npm
      ;;
  esac
  ok "System dependencies installed"
}

install_pnpm() {
  if command -v pnpm &>/dev/null; then
    ok "pnpm already installed: $(pnpm --version)"
    return
  fi
  info "Installing pnpm..."
  curl -fsSL https://get.pnpm.io/install.sh | sh -
  export PNPM_HOME="$HOME/.local/share/pnpm"
  case "$SHELL" in
    */zsh) export PATH="$PNPM_HOME:$PATH" ;;
    */bash) export PATH="$PNPM_HOME:$PATH" ;;
  esac
  PATH="$PNPM_HOME:$PATH"
  if ! command -v pnpm &>/dev/null; then
    npm install -g pnpm
  fi
  ok "pnpm installed: $(pnpm --version)"
}

build_app() {
  info "Installing project dependencies..."
  pnpm install
  ok "Dependencies installed"

  info "Building frontend + CLI..."
  pnpm run build
  ok "Build complete (frontend + CLI)"
}

start_server() {
  local port="${1:-18923}"
  info "Starting server on port $port..."
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Codex Web UI is starting on:${NC}"
  echo -e "${GREEN}  http://localhost:$port${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
  echo ""
  node dist-cli/index.js --port "$port"
}

parse_args() {
  local cmd="${1:-all}"
  case "$cmd" in
    deps|dependencies)
      install_deps
      install_pnpm
      ;;
    build)
      install_pnpm
      build_app
      ;;
    start|run)
      build_app
      start_server "${2:-18923}"
      ;;
    no-build|quick)
      start_server "${2:-18923}"
      ;;
    all|"")
      install_deps
      install_pnpm
      build_app
      start_server "${2:-18923}"
      ;;
    *)
      echo "Usage: $0 [all|deps|build|start|quick] [port]"
      echo "  all       Full install, build, and start (default)"
      echo "  deps      Install system dependencies only"
      echo "  build     Install deps and build"
      echo "  start     Build and start server"
      echo "  quick     Start without rebuilding"
      exit 1
      ;;
  esac
}

parse_args "$@"
