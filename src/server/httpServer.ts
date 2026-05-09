import { fileURLToPath } from 'node:url'
import { dirname, extname, isAbsolute, join } from 'node:path'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { existsSync } from 'node:fs'
import { writeFile, stat } from 'node:fs/promises'
import express, { type Express } from 'express'
import { createCodexBridgeMiddleware } from './codexAppServerBridge.js'
import { createAuthSession } from './authMiddleware.js'
import { createDirectoryListingHtml, createTextEditorHtml, decodeBrowsePath, getLocalDirectoryListing, isTextEditableFile, normalizeLocalPath } from './localBrowseUi.js'
import { WebSocketServer, type WebSocket } from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
const spaEntryFile = join(distDir, 'index.html')

export type ServerOptions = {
  password?: string
  deferBridgeBackgroundServices?: boolean
}

export type ServerInstance = {
  app: Express
  dispose: () => void
  attachWebSocket: (server: HttpServer) => void
  startBridgeBackgroundServices: () => void
}

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function renderFrontendMissingHtml(message: string, details?: string[]): string {
  const lines = details && details.length > 0 ? `<pre>${details.join('\n')}</pre>` : ''
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Codex Web UI Error</title></head>',
    '<body>',
    `<h1>${message}</h1>`,
    lines,
    '<p>Redirecting to chat in 3 seconds...</p>',
    '<p><a href="/">Back to chat</a></p>',
    '<script>',
    'setTimeout(() => { window.location.assign("/") }, 3000)',
    '</script>',
    '</body>',
    '</html>',
  ].join('')
}

function normalizeLocalImagePath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ''))
    } catch {
      return trimmed.replace(/^file:\/\//u, '')
    }
  }
  return trimmed
}

function readWildcardPathParam(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join('/')
  return ''
}

export function createServer(options: ServerOptions = {}): ServerInstance {
  const app = express()
  const bridge = createCodexBridgeMiddleware({
    startBackgroundServices: options.deferBridgeBackgroundServices !== true,
  })
  const authSession = options.password ? createAuthSession(options.password) : null

  // 1. Auth middleware (if password is set)
  if (authSession) {
    app.use(authSession.middleware)
  }

  // 2. Bridge middleware for /codex-api/*
  app.use(bridge)

  // 3. Serve local images referenced in markdown (desktop parity for absolute image paths)
  app.get('/codex-local-image', (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const localPath = normalizeLocalImagePath(rawPath)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    const contentType = IMAGE_CONTENT_TYPES[extname(localPath).toLowerCase()]
    if (!contentType) {
      res.status(415).json({ error: 'Unsupported image type.' })
      return
    }

    res.type(contentType)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
      if (!error) return
      if (!res.headersSent) res.status(404).json({ error: 'Image file not found.' })
    })
  })

  // 4. Serve local files inline for direct file open.
  app.get('/codex-local-file', (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const localPath = normalizeLocalPath(rawPath)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Disposition', 'inline')
    res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
      if (!error) return
      if (!res.headersSent) res.status(404).json({ error: 'File not found.' })
    })
  })

  // 5. Return JSON directory listings for the integrated folder picker.
  app.get('/codex-local-directories', async (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const showHidden = typeof req.query.showHidden === 'string'
      && ['1', 'true', 'yes', 'on'].includes(req.query.showHidden.toLowerCase())
    const localPath = normalizeLocalPath(rawPath)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local directory path.' })
      return
    }

    try {
      const fileStat = await stat(localPath)
      if (!fileStat.isDirectory()) {
        res.status(400).json({ error: 'Expected directory path.' })
        return
      }
      const data = await getLocalDirectoryListing(localPath, { showHidden })
      res.status(200).json({ data })
    } catch {
      res.status(404).json({ error: 'Directory not found.' })
    }
  })

  // 6. Serve local files by path to preserve relative asset loading for HTML.
  app.get('/codex-local-browse/*path', async (req, res) => {
    const rawPath = readWildcardPathParam(req.params.path)
    const localPath = decodeBrowsePath(`/${rawPath}`)
    const newProjectName = typeof req.query.newProjectName === 'string' ? req.query.newProjectName : ''
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    try {
      const fileStat = await stat(localPath)
      res.setHeader('Cache-Control', 'private, no-store')
      if (fileStat.isDirectory()) {
        const html = await createDirectoryListingHtml(localPath, { newProjectName })
        res.status(200).type('text/html; charset=utf-8').send(html)
        return
      }

      res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
        if (!error) return
        if (!res.headersSent) res.status(404).json({ error: 'File not found.' })
      })
    } catch {
      res.status(404).json({ error: 'File not found.' })
    }
  })

  // 7. Edit text-like local files.
  app.get('/codex-local-edit/*path', async (req, res) => {
    const rawPath = readWildcardPathParam(req.params.path)
    const localPath = decodeBrowsePath(`/${rawPath}`)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }
    try {
      const fileStat = await stat(localPath)
      if (!fileStat.isFile()) {
        res.status(400).json({ error: 'Expected file path.' })
        return
      }
      const html = await createTextEditorHtml(localPath)
      res.status(200).type('text/html; charset=utf-8').send(html)
    } catch {
      res.status(404).json({ error: 'File not found.' })
    }
  })

  app.put('/codex-local-edit/*path', express.text({ type: '*/*', limit: '10mb' }), async (req, res) => {
    const rawPath = readWildcardPathParam(req.params.path)
    const localPath = decodeBrowsePath(`/${rawPath}`)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }
    if (!(await isTextEditableFile(localPath))) {
      res.status(415).json({ error: 'Only text-like files are editable.' })
      return
    }
    const body = typeof req.body === 'string' ? req.body : ''
    try {
      await writeFile(localPath, body, 'utf8')
      res.status(200).json({ ok: true })
    } catch {
      res.status(404).json({ error: 'File not found.' })
    }
  })

  const hasFrontendAssets = existsSync(spaEntryFile)

  // 8. Static files from Vue build
  if (hasFrontendAssets) {
    app.use(express.static(distDir))
  }

  // 9. SPA fallback
  app.use((_req, res) => {
    if (!hasFrontendAssets) {
      res
        .status(503)
        .type('text/html; charset=utf-8')
        .send(
          renderFrontendMissingHtml('Codex web UI assets are missing.', [
            `Expected: ${spaEntryFile}`,
            'If running from source, build frontend assets with: pnpm run build:frontend',
            'If running with npx, clear the npx cache and reinstall codexapp.',
          ]),
        )
      return
    }

    res.sendFile(spaEntryFile, (error) => {
      if (!error) return
      if (!res.headersSent) {
        res.status(404).type('text/html; charset=utf-8').send(renderFrontendMissingHtml('Frontend entry file not found.'))
      }
    })
  })

  return {
    app,
    dispose: () => bridge.dispose(),
    startBridgeBackgroundServices: () => bridge.startBackgroundServices(),
    attachWebSocket: (server: HttpServer) => {
      const wss = new WebSocketServer({ noServer: true })

      server.on('upgrade', (req: IncomingMessage, socket, head) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        if (url.pathname !== '/codex-api/ws') {
          return
        }

        if (authSession && !authSession.isRequestAuthorized(req)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }

        wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          wss.emit('connection', ws, req)
        })
      })

      wss.on('connection', (ws: WebSocket) => {
        ws.send(JSON.stringify({ method: 'ready', params: { ok: true }, atIso: new Date().toISOString() }))
        const unsubscribe = bridge.subscribeNotifications((notification) => {
          if (ws.readyState !== 1) return
          ws.send(JSON.stringify(notification))
        })

        ws.on('close', unsubscribe)
        ws.on('error', unsubscribe)
      })
    },
  }
}
