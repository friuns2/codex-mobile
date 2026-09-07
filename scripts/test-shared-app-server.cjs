// Run after pnpm run build. Uses the public ESM CLI from a CJS harness.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { mkdtemp, rm } = require('node:fs/promises')
const { createServer } = require('node:http')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { WebSocketServer } = require('ws')

const entry = resolve(process.env.CODEXUI_TEST_CLI || 'dist-cli/index.js')
const children = new Set()
const servers = new Set()
let root

async function until(check, label) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await delay(50)
  }
  throw new Error(`Timed out: ${label}`)
}

async function mockServer(socketPath) {
  const http = createServer()
  const ws = new WebSocketServer({ server: http, perMessageDeflate: false })
  const state = { http, ws, connections: 0, initialized: 0, held: 0 }
  servers.add(state)
  ws.on('connection', (client, req) => {
    state.connections++
    assert.equal(req.headers['sec-websocket-extensions'], undefined)
    client.on('message', (raw) => {
      const message = JSON.parse(raw.toString())
      if (message.method === 'initialized') state.initialized++
      if (message.id === undefined) return
      if (message.method === 'test/hold') { state.held++; return }
      const result = message.method === 'initialize'
        ? { userAgent: 'codex-mobile-test' }
        : message.method === 'test/echo' ? message.params : { data: [], nextCursor: null }
      client.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
    })
  })
  http.listen(socketPath)
  await once(http, 'listening')
  return state
}

async function launch(args, name) {
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((done) => reservation.close(done))
  const env = { ...process.env, CODEX_HOME: join(root, name),
    CODEXUI_CODEX_COMMAND: join(root, 'must-not-spawn-codex') }
  delete env.CODEXUI_APP_SERVER_MODE
  delete env.CODEXUI_APP_SERVER_SOCKET
  const child = spawn(process.execPath, [entry, '--port', String(port),
    '--no-password', '--no-open', '--no-tunnel', '--no-login', ...args],
  { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: root })
  children.add(child)
  let output = ''
  child.stdout.on('data', (data) => { output += data })
  child.stderr.on('data', (data) => { output += data })
  const base = `http://127.0.0.1:${port}`
  await until(async () => {
    if (child.exitCode !== null) throw new Error(output)
    try { return (await fetch(base, { signal: AbortSignal.timeout(500) })).ok } catch { return false }
  }, `CLI startup: ${name}`)
  return { child, base, output: () => output }
}

async function rpc(app, method, params = {}) {
  const response = await fetch(`${app.base}/codex-api/rpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }), signal: AbortSignal.timeout(8000),
  })
  return { status: response.status, body: await response.json() }
}

async function stop(app) {
  const exited = once(app.child, 'exit')
  app.child.kill('SIGTERM')
  await Promise.race([exited, delay(5000).then(() => { throw new Error('CLI failed to stop') })])
  children.delete(app.child)
}

async function main() {
  root = await mkdtemp(join(tmpdir(), 'codex-mobile-shared-'))
  const socket = join(root, 'control.sock')
  const mock = await mockServer(socket)
  const app = await launch(['--host', '127.0.0.1', '--app-server-socket', socket], 'shared')
  assert.match(app.output(), /Bind: +http:\/\/127\.0\.0\.1:/)
  assert.match(app.output(), /App server: shared/)

  const responses = await Promise.all(Array.from({ length: 12 }, (_, n) => rpc(app, 'test/echo', { n })))
  responses.forEach((response, n) => {
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.result, { n })
  })
  assert.equal(mock.connections, 1, 'concurrent calls share one connection')
  await until(() => mock.initialized === 1, 'single initialization')

  const pending = rpc(app, 'test/hold')
  await until(() => mock.held === 1, 'pending RPC')
  for (const client of mock.ws.clients) client.terminate()
  assert.equal((await pending).status, 502, 'disconnect rejects pending RPC')
  const recovered = await rpc(app, 'test/echo', { recovered: true })
  assert.deepEqual(recovered.body.result, { recovered: true })
  assert.equal(mock.connections, 2)
  await until(() => mock.initialized === 2, 'reinitialization after reconnect')
  await stop(app)
  await until(() => mock.ws.clients.size === 0, 'client disconnect on shutdown')
  assert.equal(mock.http.listening, true, 'stopping the UI preserves the shared daemon')

  const missing = join(root, 'missing.sock')
  const retryApp = await launch(['--host', '127.0.0.1', '--app-server-socket', missing], 'missing')
  const failed = await rpc(retryApp, 'test/echo')
  assert.equal(failed.status, 502)
  assert.ok(JSON.stringify(failed.body).includes(missing), 'error identifies missing socket')
  await mockServer(missing)
  assert.deepEqual((await rpc(retryApp, 'test/echo', { retry: true })).body.result, { retry: true })
  await stop(retryApp)

  const defaultApp = await launch([], 'default')
  assert.match(defaultApp.output(), /Bind: +http:\/\/0\.0\.0\.0:/)
  assert.match(defaultApp.output(), /App server: spawned/)
  await stop(defaultApp)
  console.log('PASS: public CLI startup, bind host, custom socket, concurrent RPC, one initialization, disconnect rejection, reconnect, missing-socket retry, daemon preservation, default spawn mode')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  for (const child of children) {
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
  }
  for (const { ws, http } of servers) {
    for (const client of ws.clients) client.terminate()
    await new Promise((done) => ws.close(done))
    await new Promise((done) => http.close(done))
  }
  if (root) await rm(root, { recursive: true, force: true })
})
