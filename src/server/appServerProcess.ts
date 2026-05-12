import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildAppServerArgs } from './appServerRuntimeConfig.js'
import {
  FREE_MODE_STATE_FILE,
  createDefaultOpenCodeZenFreeModeState,
  getFreeModeConfigArgs,
  getFreeModeEnvVars,
  shouldCreateDefaultFreeModeStateForMissingAuth,
  type FreeModeState,
} from './freeMode.js'
import { refreshChatgptAuthTokensForExternalAuth } from './authRefresh.js'
import { resolveCodexCommand } from '../commandResolution.js'
import { getSpawnInvocation } from '../utils/commandInvocation.js'

const THREAD_TURN_PAGE_READ_CACHE_TTL_MS = 30_000

type JsonRpcCall = {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: { code: number; message: string }
  method?: string
  params?: unknown
}

type ServerRequestReply = {
  result?: unknown
  error?: { code?: number; message: string }
}

type PendingServerRequest = {
  id: number
  method: string
  params: unknown
  receivedAtIso: string
}

type ChatgptAuthTokensRefreshParams = {
  reason?: string
  previousAccountId?: string
}

type ChatgptAuthTokensRefreshResponse = {
  accessToken: string
  chatgptAccountId: string
  chatgptPlanType: string | null
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getCodexAuthPath(): string {
  return join(getCodexHomeDir(), 'auth.json')
}

function readFreeModeStateSync(statePath: string): FreeModeState | null {
  try {
    const raw = readFileSync(statePath, 'utf8')
    return JSON.parse(raw) as FreeModeState
  } catch {
    return null
  }
}

function hasUsableCodexAuthSync(): boolean {
  try {
    const raw = readFileSync(getCodexAuthPath(), 'utf8')
    const auth = JSON.parse(raw) as { tokens?: { access_token?: string } }
    return Boolean(auth.tokens?.access_token?.trim())
  } catch {
    return false
  }
}

function ensureDefaultFreeModeStateForMissingAuthSync(statePath: string): FreeModeState | null {
  const current = readFreeModeStateSync(statePath)
  if (!shouldCreateDefaultFreeModeStateForMissingAuth(current, hasUsableCodexAuthSync())) {
    return current
  }
  const next = createDefaultOpenCodeZenFreeModeState()
  writeFileSync(statePath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) return payload.message
  const record = asRecord(payload)
  if (!record) return fallback
  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error
  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) return nestedError.message
  return fallback
}

const STREAM_EVENT_BUFFER_LIMIT = 400

export type StreamEventFrame = {
  method: string
  params: unknown
  atIso: string
}

type CapturedItem = {
  id: string
  type: string
  turnId: string
  data: Record<string, unknown>
  completed: boolean
}

const MERGEABLE_ITEM_TYPES = new Set([
  'commandExecution',
  'fileChange',
])

export class AppServerProcess {
  private process: ChildProcessWithoutNullStreams | null = null
  private initialized = false
  private initializePromise: Promise<void> | null = null
  private readBuffer = ''
  private nextId = 1
  private stopping = false
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()
  private readonly notificationListeners = new Set<(value: { method: string; params: unknown }) => void>()
  private readonly pendingServerRequests = new Map<number, PendingServerRequest>()
  private readonly appServerArgs = buildAppServerArgs()
  private readonly streamEventsByThreadId = new Map<string, StreamEventFrame[]>()
  private readonly lastThreadReadSnapshotByThreadId = new Map<string, unknown>()
  private readonly threadTurnPageReadCacheByThreadId = new Map<string, { result: unknown; expiresAt: number }>()
  private readonly threadTurnPageReadPromiseByThreadId = new Map<string, Promise<unknown>>()
  private readonly capturedItemsByThreadId = new Map<string, Map<string, CapturedItem>>()
  private readonly liveStateCache = new Map<string, { data: unknown; turnCount: number; sessionSize: number }>()
  private chatgptAuthRefreshPromise: Promise<ChatgptAuthTokensRefreshResponse> | null = null


  private getCodexCommand(): string {
    const codexCommand = resolveCodexCommand()
    if (!codexCommand) {
      throw new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.')
    }
    return codexCommand
  }

  private buildAppServerConfig(): { args: string[]; env: Record<string, string> } {
    const args = [
      'app-server',
      '-c', 'approval_policy="never"',
      '-c', 'sandbox_mode="danger-full-access"',
    ]
    let extraEnv: Record<string, string> = {}
    const serverPort = parseInt(process.env.CODEXUI_SERVER_PORT ?? '', 10) || undefined
    const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
    try {
      const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)
      if (state) {
        args.push(...getFreeModeConfigArgs(state, serverPort))
        extraEnv = getFreeModeEnvVars(state)
      }
    } catch {
      // No free-mode state or invalid — use defaults
    }
    return { args, env: extraEnv }
  }

  private start(): void {
    if (this.process) return

    this.stopping = false
    const config = this.buildAppServerConfig()
    const invocation = getSpawnInvocation(this.getCodexCommand(), config.args)
    const spawnEnv = Object.keys(config.env).length > 0
      ? { ...process.env, ...config.env }
      : undefined
    const proc = spawn(invocation.command, invocation.args, { stdio: ['pipe', 'pipe', 'pipe'], ...(spawnEnv ? { env: spawnEnv } : {}) })
    this.process = proc

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      this.readBuffer += chunk

      let lineEnd = this.readBuffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = this.readBuffer.slice(0, lineEnd).trim()
        this.readBuffer = this.readBuffer.slice(lineEnd + 1)

        if (line.length > 0) {
          this.handleLine(line)
        }

        lineEnd = this.readBuffer.indexOf('\n')
      }
    })

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', () => {
      // Keep stderr silent in dev middleware; JSON-RPC errors are forwarded via responses.
    })

    proc.on('exit', () => {
      if (this.process !== proc) {
        return
      }

      const failure = new Error(this.stopping ? 'codex app-server stopped' : 'codex app-server exited unexpectedly')
      for (const request of this.pending.values()) {
        request.reject(failure)
      }

      this.pending.clear()
      this.pendingServerRequests.clear()
      this.process = null
      this.initialized = false
      this.initializePromise = null
      this.readBuffer = ''
    })
  }

  private sendLine(payload: Record<string, unknown>): void {
    if (!this.process) {
      throw new Error('codex app-server is not running')
    }

    this.process.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse
    try {
      message = JSON.parse(line) as JsonRpcResponse
    } catch {
      return
    }

    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pendingRequest = this.pending.get(message.id)
      this.pending.delete(message.id)

      if (!pendingRequest) return

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message))
      } else {
        pendingRequest.resolve(message.result)
      }
      return
    }

    if (typeof message.method === 'string' && typeof message.id !== 'number') {
      this.emitNotification({
        method: message.method,
        params: message.params ?? null,
      })
      return
    }

    // Handle server-initiated JSON-RPC requests (approvals, dynamic tool calls, etc.).
    if (typeof message.id === 'number' && typeof message.method === 'string') {
      this.handleServerRequest(message.id, message.method, message.params ?? null)
    }
  }

  private emitNotification(notification: { method: string; params: unknown }): void {
    this.recordStreamEvent(notification)
    this.captureItemFromNotification(notification)
    const nThreadId = this.extractThreadIdFromParams(notification.params)
    if (nThreadId) {
      this.invalidateLiveStateCache(nThreadId)
      this.threadTurnPageReadCacheByThreadId.delete(nThreadId)
    }
    for (const listener of this.notificationListeners) {
      listener(notification)
    }
  }

  private extractThreadIdFromParams(params: unknown): string {
    const record = asRecord(params)
    if (!record) return ''
    const threadId =
      (typeof record.threadId === 'string' ? record.threadId : '') ||
      (typeof record.thread_id === 'string' ? record.thread_id : '') ||
      (typeof record.conversationId === 'string' ? record.conversationId : '') ||
      (typeof record.conversation_id === 'string' ? record.conversation_id : '')
    if (threadId) return threadId
    const thread = asRecord(record.thread)
    if (thread && typeof thread.id === 'string') return thread.id
    const turn = asRecord(record.turn)
    if (turn) {
      const turnThreadId =
        (typeof turn.threadId === 'string' ? turn.threadId : '') ||
        (typeof turn.thread_id === 'string' ? turn.thread_id : '')
      if (turnThreadId) return turnThreadId
    }
    return ''
  }

  private recordStreamEvent(notification: { method: string; params: unknown }): void {
    const threadId = this.extractThreadIdFromParams(notification.params)
    if (!threadId) return
    const frame: StreamEventFrame = {
      method: notification.method,
      params: notification.params,
      atIso: new Date().toISOString(),
    }
    let buffer = this.streamEventsByThreadId.get(threadId)
    if (!buffer) {
      buffer = []
      this.streamEventsByThreadId.set(threadId, buffer)
    }
    buffer.push(frame)
    if (buffer.length > STREAM_EVENT_BUFFER_LIMIT) {
      buffer.splice(0, buffer.length - STREAM_EVENT_BUFFER_LIMIT)
    }
  }

  getStreamEvents(threadId: string, limit: number): StreamEventFrame[] {
    const buffer = this.streamEventsByThreadId.get(threadId)
    if (!buffer || buffer.length === 0) return []
    return buffer.slice(-limit)
  }

  storeThreadReadSnapshot(threadId: string, snapshot: unknown): void {
    this.lastThreadReadSnapshotByThreadId.set(threadId, snapshot)
    this.threadTurnPageReadCacheByThreadId.delete(threadId)
  }

  getLastThreadReadSnapshot(threadId: string): unknown | null {
    return this.lastThreadReadSnapshotByThreadId.get(threadId) ?? null
  }

  async readThreadForTurnPage(threadId: string): Promise<unknown> {
    const now = Date.now()
    const cached = this.threadTurnPageReadCacheByThreadId.get(threadId)
    if (cached && cached.expiresAt > now) return cached.result
    if (cached) this.threadTurnPageReadCacheByThreadId.delete(threadId)

    const pending = this.threadTurnPageReadPromiseByThreadId.get(threadId)
    if (pending) return pending

    const promise = this.rpc('thread/read', {
      threadId,
      includeTurns: true,
    }).then((result) => {
      this.threadTurnPageReadCacheByThreadId.set(threadId, {
        result,
        expiresAt: Date.now() + THREAD_TURN_PAGE_READ_CACHE_TTL_MS,
      })
      return result
    }).finally(() => {
      this.threadTurnPageReadPromiseByThreadId.delete(threadId)
    })

    this.threadTurnPageReadPromiseByThreadId.set(threadId, promise)
    return promise
  }

  cacheLiveState(threadId: string, data: unknown, turnCount: number, sessionSize: number): void {
    this.liveStateCache.set(threadId, { data, turnCount, sessionSize })
  }

  getCachedLiveState(threadId: string, turnCount: number, sessionSize: number): unknown | null {
    const cached = this.liveStateCache.get(threadId)
    if (!cached) return null
    if (cached.turnCount !== turnCount || cached.sessionSize !== sessionSize) return null
    return cached.data
  }

  invalidateLiveStateCache(threadId: string): void {
    this.liveStateCache.delete(threadId)
  }

  private captureItemFromNotification(notification: { method: string; params: unknown }): void {
    if (notification.method !== 'item/started' && notification.method !== 'item/completed') return

    const params = asRecord(notification.params)
    if (!params) return
    const item = asRecord(params.item)
    if (!item) return
    const itemType = typeof item.type === 'string' ? item.type : ''
    if (!MERGEABLE_ITEM_TYPES.has(itemType)) return

    const itemId = typeof item.id === 'string' ? item.id : ''
    if (!itemId) return

    const threadId = this.extractThreadIdFromParams(params)
    if (!threadId) return

    const turnId =
      (typeof params.turnId === 'string' ? params.turnId : '') ||
      (typeof params.turn_id === 'string' ? params.turn_id : '')
    if (!turnId) return

    let threadItems = this.capturedItemsByThreadId.get(threadId)
    if (!threadItems) {
      threadItems = new Map()
      this.capturedItemsByThreadId.set(threadId, threadItems)
    }

    const isCompleted = notification.method === 'item/completed'
    const existing = threadItems.get(itemId)

    if (existing && existing.completed && !isCompleted) return

    threadItems.set(itemId, {
      id: itemId,
      type: itemType,
      turnId,
      data: item as Record<string, unknown>,
      completed: isCompleted,
    })
  }

  mergeItemsIntoTurns(threadId: string, turns: unknown[]): unknown[] {
    const capturedMap = this.capturedItemsByThreadId.get(threadId)
    if (!capturedMap || capturedMap.size === 0) return turns

    const itemsByTurnId = new Map<string, CapturedItem[]>()
    for (const captured of capturedMap.values()) {
      let group = itemsByTurnId.get(captured.turnId)
      if (!group) {
        group = []
        itemsByTurnId.set(captured.turnId, group)
      }
      group.push(captured)
    }

    return turns.map((turn) => {
      const turnRecord = asRecord(turn)
      if (!turnRecord) return turn
      const turnId = typeof turnRecord.id === 'string' ? turnRecord.id : ''
      if (!turnId) return turn

      const captured = itemsByTurnId.get(turnId)
      if (!captured || captured.length === 0) return turn

      const existingItems = Array.isArray(turnRecord.items) ? (turnRecord.items as Record<string, unknown>[]) : []
      const existingIds = new Set(existingItems.map((it) => (typeof it.id === 'string' ? it.id : '')).filter(Boolean))

      const newItems = captured
        .filter((c) => !existingIds.has(c.id))
        .map((c) => c.data)

      if (newItems.length === 0) return turn

      return {
        ...turnRecord,
        items: [...existingItems, ...newItems],
      }
    })
  }

  private sendServerRequestReply(requestId: number, reply: ServerRequestReply): void {
    if (reply.error) {
      this.sendLine({
        jsonrpc: '2.0',
        id: requestId,
        error: reply.error,
      })
      return
    }

    this.sendLine({
      jsonrpc: '2.0',
      id: requestId,
      result: reply.result ?? {},
    })
  }

  private resolvePendingServerRequest(requestId: number, reply: ServerRequestReply): void {
    const pendingRequest = this.pendingServerRequests.get(requestId)
    if (!pendingRequest) {
      throw new Error(`No pending server request found for id ${String(requestId)}`)
    }
    this.pendingServerRequests.delete(requestId)

    this.sendServerRequestReply(requestId, reply)
    const requestParams = asRecord(pendingRequest.params)
    const threadId =
      typeof requestParams?.threadId === 'string' && requestParams.threadId.length > 0
        ? requestParams.threadId
        : ''
    this.emitNotification({
      method: 'server/request/resolved',
      params: {
        id: requestId,
        method: pendingRequest.method,
        threadId,
        mode: 'manual',
        resolvedAtIso: new Date().toISOString(),
      },
    })
  }

  private async refreshChatgptAuthTokens(params: ChatgptAuthTokensRefreshParams): Promise<ChatgptAuthTokensRefreshResponse> {
    if (!this.chatgptAuthRefreshPromise) {
      this.chatgptAuthRefreshPromise = refreshChatgptAuthTokensForExternalAuth(params).finally(() => {
        this.chatgptAuthRefreshPromise = null
      })
    }
    return await this.chatgptAuthRefreshPromise
  }

  private async handleChatgptAuthTokensRefreshRequest(requestId: number, params: unknown): Promise<void> {
    const requestParams = asRecord(params)
    const previousAccountId = readNonEmptyString(requestParams?.previousAccountId ?? requestParams?.previous_account_id)
    try {
      const result = await this.refreshChatgptAuthTokens({
        reason: readNonEmptyString(requestParams?.reason) || undefined,
        previousAccountId: previousAccountId || undefined,
      })
      this.sendServerRequestReply(requestId, { result })
      this.emitNotification({
        method: 'server/request/resolved',
        params: {
          id: requestId,
          method: 'account/chatgptAuthTokens/refresh',
          mode: 'automatic',
          resolvedAtIso: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.sendServerRequestReply(requestId, {
        error: {
          code: -32001,
          message: getErrorMessage(error, 'Failed to refresh ChatGPT auth tokens'),
        },
      })
    }
  }

  private handleServerRequest(requestId: number, method: string, params: unknown): void {
    if (method === 'account/chatgptAuthTokens/refresh') {
      void this.handleChatgptAuthTokensRefreshRequest(requestId, params)
      return
    }

    const pendingRequest: PendingServerRequest = {
      id: requestId,
      method,
      params,
      receivedAtIso: new Date().toISOString(),
    }
    this.pendingServerRequests.set(requestId, pendingRequest)

    this.emitNotification({
      method: 'server/request',
      params: pendingRequest,
    })
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    this.start()
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      this.sendLine({
        jsonrpc: '2.0',
        id,
        method,
        params,
      } satisfies JsonRpcCall)
    })
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    if (this.initializePromise) {
      await this.initializePromise
      return
    }

    this.initializePromise = this.call('initialize', {
      clientInfo: {
        name: 'codex-web-local',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    }).then(() => {
      this.sendLine({
        jsonrpc: '2.0',
        method: 'initialized',
      })
      this.initialized = true
    }).finally(() => {
      this.initializePromise = null
    })

    await this.initializePromise
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    await this.ensureInitialized()
    return this.call(method, params)
  }

  onNotification(listener: (value: { method: string; params: unknown }) => void): () => void {
    this.notificationListeners.add(listener)
    return () => {
      this.notificationListeners.delete(listener)
    }
  }

  async respondToServerRequest(payload: unknown): Promise<void> {
    await this.ensureInitialized()

    const body = asRecord(payload)
    if (!body) {
      throw new Error('Invalid response payload: expected object')
    }

    const id = body.id
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error('Invalid response payload: "id" must be an integer')
    }

    const rawError = asRecord(body.error)
    if (rawError) {
      const message = typeof rawError.message === 'string' && rawError.message.trim().length > 0
        ? rawError.message.trim()
        : 'Server request rejected by client'
      const code = typeof rawError.code === 'number' && Number.isFinite(rawError.code)
        ? Math.trunc(rawError.code)
        : -32000
      this.resolvePendingServerRequest(id, { error: { code, message } })
      return
    }

    if (!('result' in body)) {
      throw new Error('Invalid response payload: expected "result" or "error"')
    }

    this.resolvePendingServerRequest(id, { result: body.result })
  }

  listPendingServerRequests(): PendingServerRequest[] {
    return Array.from(this.pendingServerRequests.values())
  }

  dispose(): void {
    if (!this.process) return

    const proc = this.process
    this.stopping = true
    this.process = null
    this.initialized = false
    this.initializePromise = null
    this.readBuffer = ''

    const failure = new Error('codex app-server stopped')
    for (const request of this.pending.values()) {
      request.reject(failure)
    }
    this.pending.clear()
    this.pendingServerRequests.clear()

    try {
      proc.stdin.end()
    } catch {
      // ignore close errors on shutdown
    }

    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore kill errors on shutdown
    }

    const forceKillTimer = setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL')
        } catch {
          // ignore kill errors on shutdown
        }
      }
    }, 1500)
    forceKillTimer.unref()
  }
}
