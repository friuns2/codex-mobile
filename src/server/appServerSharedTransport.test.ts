import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket, { WebSocketServer } from 'ws'
import { expect, it, vi } from 'vitest'
import { AppServerProcess } from './codexAppServerBridge'

it('initializes a replacement when a request arrives while the old socket is closing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-close-window-'))
  const socketPath = join(root, 'control.sock')
  const http = createServer()
  const ws = new WebSocketServer({ server: http })
  const app = new AppServerProcess()
  let connections = 0
  let initializations = 0
  ws.on('connection', (peer) => {
    connections++
    let initialized = false
    peer.on('message', (raw) => {
      const message = JSON.parse(raw.toString())
      if (message.method === 'initialized') { initialized = true; return }
      if (message.id === undefined) return
      if (message.method === 'initialize') initializations++
      peer.send(JSON.stringify({ id: message.id,
        ...(message.method === 'initialize' || initialized
          ? { result: message.method === 'initialize' ? {} : message.params }
          : { error: { code: -32000, message: 'initialize required' } }),
      }))
    })
  })
  vi.stubEnv('CODEXUI_APP_SERVER_MODE', 'shared')
  vi.stubEnv('CODEXUI_APP_SERVER_SOCKET', socketPath)
  vi.stubEnv('CODEX_HOME', root)
  try {
    http.listen(socketPath)
    await once(http, 'listening')
    expect(await app.rpc('test/echo', { first: true })).toEqual({ first: true })
    // Pause the peer so close cannot finish before the next request: exercise
    // CLOSING deterministically instead of waiting for an ordinary disconnect.
    for (const peer of ws.clients) {
      ;(peer as unknown as { _socket: { pause(): void } })._socket.pause()
    }
    const client = (app as unknown as { webSocket: WebSocket }).webSocket
    client.close()
    expect(client.readyState).toBe(WebSocket.CLOSING)
    expect(await app.rpc('test/echo', { replacement: true })).toEqual({ replacement: true })
    expect(connections).toBe(2)
    expect(initializations).toBe(2)
  } finally {
    app.dispose()
    for (const peer of ws.clients) peer.terminate()
    await new Promise<void>((done) => ws.close(() => done()))
    await new Promise<void>((done) => http.close(() => done()))
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  }
})
