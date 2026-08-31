import { request as httpRequest, createServer as createHttpServer, type Server as NodeHttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import type { CodexAppServerHealth } from '../realtimeProtocol'
import { createServer, type ServerInstance } from './httpServer'

type HttpResult = {
  statusCode: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

function createFakeBridge(revision = 7) {
  const health: CodexAppServerHealth = {
    state: 'ready',
    commandSource: 'path',
    codexHome: 'C:\\Users\\me\\.codex',
    startedAtIso: '2026-08-31T00:00:00.000Z',
    lastReadyAtIso: '2026-08-31T00:00:01.000Z',
    restartAttempts: 0,
    lastExitCode: null,
    lastError: null,
    stderr: [],
  }
  const bridge = Object.assign(
    async (_req: unknown, _res: unknown, next: () => void) => next(),
    {
      dispose: vi.fn(),
      subscribeNotifications: () => () => {},
      getHealth: () => health,
      getRealtimeRevision: () => revision,
    },
  )
  return bridge
}

async function startTestServer(instance: ServerInstance) {
  const server = createHttpServer(instance.app)
  instance.attachWebSocket(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const port = (server.address() as AddressInfo).port

  return {
    port,
    request(options: { method?: string; path: string; host?: string; body?: string; cookie?: string }): Promise<HttpResult> {
      return new Promise((resolve, reject) => {
        const headers: Record<string, string> = { Host: options.host ?? '127.0.0.1' }
        if (options.body !== undefined) {
          headers['Content-Type'] = 'application/json'
          headers['Content-Length'] = String(Buffer.byteLength(options.body))
        }
        if (options.cookie) headers.Cookie = options.cookie
        const req = httpRequest({
          host: '127.0.0.1',
          port,
          path: options.path,
          method: options.method ?? 'GET',
          headers,
        }, (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }))
        })
        req.once('error', reject)
        if (options.body !== undefined) req.write(options.body)
        req.end()
      })
    },
    async close(): Promise<void> {
      instance.dispose()
      await new Promise<void>((resolve) => (server as NodeHttpServer).close(() => resolve()))
    },
  }
}

describe('createServer realtime host endpoints', () => {
  it('returns managed app-server health', async () => {
    const running = await startTestServer(createServer({ bridge: createFakeBridge() }))
    try {
      const response = await running.request({ path: '/codex-api/health' })
      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toMatchObject({ data: { state: 'ready', commandSource: 'path' } })
    } finally {
      await running.close()
    }
  })

  it('includes the current state revision in websocket ready', async () => {
    const running = await startTestServer(createServer({ bridge: createFakeBridge(9) }))
    const socket = new WebSocket(`ws://127.0.0.1:${String(running.port)}/codex-api/ws`)
    try {
      const message = await new Promise<unknown>((resolve, reject) => {
        socket.once('message', (value) => resolve(JSON.parse(String(value))))
        socket.once('error', reject)
      })
      expect(message).toMatchObject({ method: 'ready', params: { ok: true, revision: 9 } })
    } finally {
      socket.close()
      await running.close()
    }
  })

  it('uses the shared password for health and websocket access', async () => {
    const running = await startTestServer(createServer({ password: 'secret', bridge: createFakeBridge() }))
    try {
      const unauthenticated = await running.request({ path: '/codex-api/health', host: 'shared-host.local' })
      expect(unauthenticated.headers['content-type']).toContain('text/html')

      const login = await running.request({
        method: 'POST',
        path: '/auth/login',
        host: 'shared-host.local',
        body: JSON.stringify({ password: 'secret' }),
      })
      const cookie = login.headers['set-cookie']?.[0]?.split(';')[0]
      const health = await running.request({ path: '/codex-api/health', host: 'shared-host.local', cookie })
      expect(health.statusCode).toBe(200)
      expect(JSON.parse(health.body)).toMatchObject({ data: { state: 'ready' } })

      const websocketStatus = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${String(running.port)}/codex-api/ws`, {
          headers: { Host: 'shared-host.local' },
        })
        socket.once('unexpected-response', (_request, response) => {
          const statusCode = response.statusCode ?? 0
          response.resume()
          resolve(statusCode)
        })
        socket.once('open', () => reject(new Error('Unauthenticated websocket opened')))
        socket.once('error', () => {})
      })
      expect(websocketStatus).toBe(401)
    } finally {
      await running.close()
    }
  })

  it('closes connected websockets when disposed', async () => {
    const running = await startTestServer(createServer({ bridge: createFakeBridge() }))
    const socket = new WebSocket(`ws://127.0.0.1:${String(running.port)}/codex-api/ws`)
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve())
      socket.once('error', reject)
    })

    const closed = new Promise<'closed'>((resolve) => socket.once('close', () => resolve('closed')))
    const closing = running.close()
    const outcome = await Promise.race([closed, delay(100).then(() => 'timeout' as const)])
    if (outcome === 'timeout') socket.terminate()
    await closing

    expect(outcome).toBe('closed')
  })
})
