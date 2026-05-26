#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${CODEXAPP_DOCKER_FAST_IMAGE:-codexapp-fast-test-base:latest}"
CONTAINER_NAME="${CODEXAPP_DOCKER_FAST_CONTAINER:-codexapp-fast-test}"
PORT="${PORT:-4191}"
CODEX_HOME_VOLUME="${CODEXAPP_DOCKER_FAST_HOME:-codexapp-fast-test-home}"

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/scripts/docker-fast-test-base.Dockerfile" "$ROOT_DIR"
fi

pnpm --dir "$ROOT_DIR" run build

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker volume create "$CODEX_HOME_VOLUME" >/dev/null

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "127.0.0.1:${PORT}:4191" \
  -e CODEX_HOME=/codex-home \
  -v "$ROOT_DIR:/repo:ro" \
  -v "$CODEX_HOME_VOLUME:/codex-home" \
  "$IMAGE_NAME" >/dev/null

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    echo "Docker fast test server: http://127.0.0.1:${PORT}/"
    echo "Container: $CONTAINER_NAME"
    echo "CODEX_HOME volume: $CODEX_HOME_VOLUME"
    exit 0
  fi
  sleep 1
done

docker logs --tail 120 "$CONTAINER_NAME" >&2 || true
exit 1
