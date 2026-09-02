import type { RpcEnvelope, RpcMethodCatalog } from '../types/codex'
import { CodexApiError, extractErrorMessage } from './codexErrors'
import { appFetch, appPath, appWebSocketUrl } from '../basePath'

type RpcRequestBody = {
  method: string
  params?: unknown
}

export type RpcNotification = {
  method: string
  params: unknown
  atIso: string
}

type ServerRequestReplyBody = {
  id: number
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function rpcCall<T>(method: string, params?: unknown): Promise<T> {
  const body: RpcRequestBody = { method, params: params ?? null }

  let response: Response
  try {
    response = await appFetch('/codex-api/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : `RPC ${method} failed before request was sent`,
      { code: 'network_error', method },
    )
  }

  let payload: unknown = null
  let rawText: string | null = null
  try {
    rawText = await response.text()
    payload = JSON.parse(rawText)
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = extractErrorMessage(payload, '') || rawText?.slice(0, 500) || ''
    const prefix = `RPC ${method} failed with HTTP ${response.status}`
    throw new CodexApiError(
      detail ? `${prefix}: ${detail}` : prefix,
      {
        code: 'http_error',
        method,
        status: response.status,
      },
    )
  }

  const envelope = payload as RpcEnvelope<T> | null
  if (!envelope || typeof envelope !== 'object' || !('result' in envelope)) {
    throw new CodexApiError(`RPC ${method} returned malformed envelope`, {
      code: 'invalid_response',
      method,
      status: response.status,
    })
  }
  return envelope.result
}

export async function fetchRpcMethodCatalog(): Promise<string[]> {
  const response = await appFetch('/codex-api/meta/methods')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Method catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/methods',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

export async function fetchRpcNotificationCatalog(): Promise<string[]> {
  const response = await appFetch('/codex-api/meta/notifications')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Notification catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/notifications',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

function toNotification(value: unknown): RpcNotification | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.method !== 'string' || record.method.length === 0) return null

  const atIso = typeof record.atIso === 'string' && record.atIso.length > 0
    ? record.atIso
    : new Date().toISOString()

  return {
    method: record.method,
    params: record.params ?? null,
    atIso,
  }
}

function emitReadyNotification(
  onNotification: (value: RpcNotification) => void,
  params: unknown = { ok: true },
): void {
  onNotification({
    method: 'ready',
    params,
    atIso: new Date().toISOString(),
  })
}

export function subscribeRpcNotifications(onNotification: (value: RpcNotification) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  let cleanup: (() => void) | null = null
  let closed = false
  let reconnectTimer: number | null = null

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const scheduleReconnect = (attach: () => void, attempt: number) => {
    if (closed || reconnectTimer !== null) return
    const delayMs = Math.min(1000 * (2 ** attempt), 10000)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      if (closed) return
      attach()
    }, delayMs)
  }

  const handleNotificationPayload = (payload: unknown) => {
    const notification = toNotification(payload)
    if (notification) {
      onNotification(notification)
    }
  }

  const attachSse = (attempt = 0) => {
    if (typeof EventSource === 'undefined' || closed) return
    cleanup?.()
    const source = new EventSource(appPath('/codex-api/events'))
    let isConnectionClosed = false

    source.onmessage = (event) => {
      try {
        handleNotificationPayload(JSON.parse(event.data) as unknown)
      } catch {
        // Ignore malformed event payloads and keep stream alive.
      }
    }

    source.addEventListener('ready', (event: MessageEvent<string>) => {
      try {
        const parsed = event.data ? JSON.parse(event.data) as unknown : { ok: true }
        emitReadyNotification(onNotification, parsed)
      } catch {
        emitReadyNotification(onNotification)
      }
    })

    source.onerror = () => {
      if (closed || isConnectionClosed) return
      if (source.readyState === EventSource.CLOSED) {
        isConnectionClosed = true
        source.close()
        scheduleReconnect(() => attachSse(attempt + 1), attempt)
      }
    }

    cleanup = () => {
      isConnectionClosed = true
      source.close()
    }
  }

  const attachWebSocket = (attempt = 0) => {
    if (typeof WebSocket === 'undefined' || closed) {
      attachSse()
      return
    }

    cleanup?.()
    const socket = new WebSocket(appWebSocketUrl('/codex-api/ws'))
    let didOpen = false
    let intentionallyClosed = false
    let fallbackTimer: number | null = window.setTimeout(() => {
      if (didOpen || closed || intentionallyClosed) return
      intentionallyClosed = true
      socket.close()
      attachSse()
    }, 2500)

    socket.onopen = () => {
      didOpen = true
      clearReconnectTimer()
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
    }

    socket.onmessage = (event) => {
      try {
        handleNotificationPayload(JSON.parse(String(event.data)) as unknown)
      } catch {
        // Ignore malformed event payloads and keep stream alive.
      }
    }

    socket.onerror = () => {
      // Wait for close so we do not race duplicate reconnect/fallback paths.
    }

    socket.onclose = () => {
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      if (closed || intentionallyClosed) {
        return
      }
      if (!didOpen) {
        attachSse()
        return
      }
      scheduleReconnect(() => attachWebSocket(attempt + 1), attempt)
    }

    cleanup = () => {
      intentionallyClosed = true
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      socket.close()
    }
  }

  if (typeof WebSocket !== 'undefined') {
    attachWebSocket()
  } else {
    attachSse()
  }

  return () => {
    closed = true
    clearReconnectTimer()
    cleanup?.()
  }
}

export async function respondServerRequest(body: ServerRequestReplyBody): Promise<void> {
  let response: Response
  try {
    response = await appFetch('/codex-api/server-requests/respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Failed to reply to server request',
      { code: 'network_error', method: 'server-requests/respond' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Server request reply failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'server-requests/respond',
        status: response.status,
      },
    )
  }
}

export async function fetchPendingServerRequests(): Promise<unknown[]> {
  const response = await appFetch('/codex-api/server-requests/pending')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Pending server requests failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'server-requests/pending',
        status: response.status,
      },
    )
  }

  const record = asRecord(payload)
  const data = record?.data
  return Array.isArray(data) ? data : []
}
