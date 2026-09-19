#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4196}"
NAME="${ZEN_TEST_NAME:-codexapp-zen-hybrid}"
if docker container inspect "$NAME" >/dev/null 2>&1; then
  echo "Container $NAME already exists. Choose ZEN_TEST_NAME and PORT for a new isolated run." >&2
  exit 1
fi
CONTEXT="$(mktemp -d /tmp/codexapp-zen-package.XXXXXX)"
trap 'rm -rf "$CONTEXT"' EXIT
cd "$ROOT"
pnpm run build
pnpm pack --pack-destination "$CONTEXT"
cat > "$CONTEXT/Dockerfile" <<'DOCKER'
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY *.tgz /tmp/
RUN npm install -g /tmp/*.tgz @openai/codex && rm /tmp/*.tgz
ENV CODEX_HOME=/codex-home
ENV PORT=4190
CMD ["sh", "-c", "codexapp --port ${PORT:-4190} --no-password --no-open --no-tunnel --no-login"]
DOCKER
docker build -t codexapp-zen-hybrid:latest "$CONTEXT"
docker volume create "$NAME-home" >/dev/null
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:4190" -v "$NAME-home:/codex-home" codexapp-zen-hybrid:latest
docker exec "$NAME" mkdir -p /codex-home/zen-hybrid-e2e
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/codex-api/free-mode/status" >/dev/null; then
    printf 'URL: http://127.0.0.1:%s\nContainer: %s\nVolume: %s-home\nTest folder: /codex-home/zen-hybrid-e2e\n' "$PORT" "$NAME" "$NAME"
    exit 0
  fi
  sleep 1
done
docker logs --tail 80 "$NAME" >&2
exit 1
