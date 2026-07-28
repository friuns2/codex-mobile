import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createCodexBridgeMiddleware } from "./src/server/codexAppServerBridge";
import { createDirectoryListingHtml, createTextEditorHtml, decodeBrowsePath, getLocalDirectoryListing, isTextEditableFile, normalizeLocalPath } from "./src/server/localBrowseUi";
import tailwindcss from "@tailwindcss/vite";
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import pkg from "./package.json";

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function normalizeLocalImagePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ""));
    } catch {
      return trimmed.replace(/^file:\/\//u, "");
    }
  }
  return trimmed;
}

function getWorktreeName(): string {
  const normalizedCwd = process.cwd().replace(/\\/g, "/");
  const segments = normalizedCwd.split("/").filter(Boolean);
  const worktreesIndex = segments.lastIndexOf("worktrees");
  if (worktreesIndex >= 0 && worktreesIndex + 1 < segments.length) {
    return segments[worktreesIndex + 1];
  }

  const gitDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (gitDir.status === 0) {
    const resolvedGitDir = gitDir.stdout.trim().replace(/\\/g, "/");
    const worktreeMarker = "/.git/worktrees/";
    const markerIndex = resolvedGitDir.indexOf(worktreeMarker);
    if (markerIndex >= 0) {
      const worktreeSegments = resolvedGitDir.slice(markerIndex + worktreeMarker.length).split("/").filter(Boolean);
      if (worktreeSegments.length > 0) {
        return worktreeSegments[0] ?? "unknown";
      }
    }
  }

  const gitCommonDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (gitCommonDir.status === 0) {
    const resolvedGitCommonDir = gitCommonDir.stdout.trim().replace(/\\/g, "/");
    if (resolvedGitCommonDir.endsWith("/.git")) {
      const commonDirSegments = resolvedGitCommonDir.split("/").filter(Boolean);
      if (commonDirSegments.length >= 2) {
        return commonDirSegments[commonDirSegments.length - 2] ?? "unknown";
      }
    }
  }

  return segments[segments.length - 1] ?? "unknown";
}

const worktreeName = getWorktreeName();
const appVersion = typeof pkg.version === "string" ? pkg.version : "unknown";
const WS_UPGRADE_ATTACHED_KEY = "__codexBridgeWsAttached__";

function readEnvValueFromFile(filePath: string, key: string): string {
  if (!existsSync(filePath)) return "";
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const currentKey = trimmed.slice(0, separator).trim();
    if (currentKey !== key) continue;
    return trimmed.slice(separator + 1).trim();
  }
  return "";
}

function resolveViteRollbackDebugFallback(): string {
  const fromEnvLocal = readEnvValueFromFile(".env.local", "VITE_ROLLBACK_DEBUG");
  if (fromEnvLocal) return fromEnvLocal;
  return readEnvValueFromFile(".env", "VITE_ROLLBACK_DEBUG");
}

const viteRollbackDebugFallback = resolveViteRollbackDebugFallback();

export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_WORKTREE_NAME": JSON.stringify(worktreeName),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    "import.meta.env.VITE_ROLLBACK_DEBUG_FALLBACK": JSON.stringify(viteRollbackDebugFallback),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
    watch: {
      ignored: [
        '**/.omx/**',
        '**/.cursor/**',
        '**/.playwright-cli/**',
        '**/dist/**',
        '**/dist-cli/**',
      ],
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: "codex-bridge",
      configureServer(server) {
        process.env.CODEXUI_SERVER_PORT = String(server.config.server.port ?? 5173);
        const bridge = createCodexBridgeMiddleware();
        const httpServer = server.httpServer;
        if (httpServer) {
          httpServer.once("listening", () => {
            const addr = httpServer.address();
            if (addr && typeof addr === "object" && addr.port) {
              process.env.CODEXUI_SERVER_PORT = String(addr.port);
            }
          });
          const hostScope = httpServer as typeof httpServer & {
            [WS_UPGRADE_ATTACHED_KEY]?: boolean;
          };
          if (!hostScope[WS_UPGRADE_ATTACHED_KEY]) {
            hostScope[WS_UPGRADE_ATTACHED_KEY] = true;
            const wss = new WebSocketServer({ noServer: true });

            httpServer.on("upgrade", (req, socket, head) => {
              const requestUrl = new URL(req.url ?? "", "http://localhost");
              if (requestUrl.pathname !== "/codex-api/ws") return;
              wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
                wss.emit("connection", ws, req);
              });
            });

            wss.on("connection", (ws: WebSocket) => {
              ws.send(
                JSON.stringify({
                  method: "ready",
                  params: { ok: true },
                  atIso: new Date().toISOString(),
                }),
              );
              const unsubscribe = bridge.subscribeNotifications((notification) => {
                if (ws.readyState !== ws.OPEN) return;
                ws.send(JSON.stringify(notification));
              });

              ws.on("close", unsubscribe);
              ws.on("error", unsubscribe);
            });

            httpServer.once("close", () => {
              wss.close();
            });
          }
        }
        server.middlewares.use((req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/codex-local-image") return next();

          const localPath = normalizeLocalImagePath(url.searchParams.get("path") ?? "");
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }

          const contentType = IMAGE_CONTENT_TYPES[extname(localPath).toLowerCase()];
          if (!contentType) {
            res.statusCode = 415;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Unsupported image type." }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "private, max-age=300");
          const stream = createReadStream(localPath);
          stream.on("error", () => {
            if (res.headersSent) return;
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Image file not found." }));
          });
          stream.pipe(res);
        });
        server.middlewares.use((req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/codex-local-file") return next();

          const localPath = normalizeLocalPath(url.searchParams.get("path") ?? "");
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Cache-Control", "private, no-store");
          res.setHeader("Content-Disposition", `inline; filename="${basename(localPath)}"`);

          const stream = createReadStream(localPath);
          stream.on("error", () => {
            if (res.headersSent) return;
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "File not found." }));
          });
          stream.pipe(res);
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/codex-local-directories") return next();

          const showHidden = ["1", "true", "yes", "on"].includes((url.searchParams.get("showHidden") ?? "").toLowerCase());
          const localPath = normalizeLocalPath(url.searchParams.get("path") ?? "");
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local directory path." }));
            return;
          }

          try {
            const fileStat = await stat(localPath);
            if (!fileStat.isDirectory()) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Expected directory path." }));
              return;
            }

            const data = await getLocalDirectoryListing(localPath, { showHidden });
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ data }));
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Directory not found." }));
          }
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (!url.pathname.startsWith("/codex-local-browse/")) return next();

          const localPath = decodeBrowsePath(url.pathname.slice("/codex-local-browse".length));
          const newProjectName = url.searchParams.get("newProjectName") ?? "";
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }

          try {
            const fileStat = await stat(localPath);
            res.setHeader("Cache-Control", "private, no-store");
            if (fileStat.isDirectory()) {
              const html = await createDirectoryListingHtml(localPath, { newProjectName });
              res.statusCode = 200;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(html);
              return;
            }

            res.statusCode = 200;
            const stream = createReadStream(localPath);
            stream.on("error", () => {
              if (res.headersSent) return;
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "File not found." }));
            });
            stream.pipe(res);
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "File not found." }));
          }
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) return next();
          const url = new URL(req.url, "http://localhost");
          if (!url.pathname.startsWith("/codex-local-edit/")) return next();
          const localPath = decodeBrowsePath(url.pathname.slice("/codex-local-edit".length));
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }
          try {
            const fileStat = await stat(localPath);
            if (!fileStat.isFile()) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Expected file path." }));
              return;
            }
            const html = await createTextEditorHtml(localPath);
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(html);
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "File not found." }));
          }
        });
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || req.method !== "PUT") return next();
          const url = new URL(req.url, "http://localhost");
          if (!url.pathname.startsWith("/codex-local-edit/")) return next();
          const localPath = decodeBrowsePath(url.pathname.slice("/codex-local-edit".length));
          if (!localPath || !isAbsolute(localPath)) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Expected absolute local file path." }));
            return;
          }
          if (!(await isTextEditableFile(localPath))) {
            res.statusCode = 415;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Only text-like files are editable." }));
            return;
          }
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          req.on("end", async () => {
            try {
              await writeFile(localPath, Buffer.concat(chunks).toString("utf8"), "utf8");
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "File not found." }));
            }
          });
          req.on("error", () => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Write failed." }));
          });
        });
        server.middlewares.use(bridge);
        server.httpServer?.once("close", () => {
          bridge.dispose();
        });
      },
    },
  ],
});
