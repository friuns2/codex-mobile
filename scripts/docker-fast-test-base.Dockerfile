FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    sqlite3 \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex \
  && npm cache clean --force

ENV CODEX_HOME=/codex-home
RUN mkdir -p /codex-home /projects /imports

WORKDIR /repo
EXPOSE 4191

CMD ["node", "/repo/dist-cli/index.js", "--port", "4191", "--no-password", "--no-open", "--no-tunnel", "--no-login"]
