import { existsSync, readdirSync, statSync, watch as watchFs } from 'node:fs'
import { join } from 'node:path'
import type {
  CodexProcessState,
  CodexUiInvalidation,
  CodexUiInvalidationReason,
  CodexUiInvalidationScope,
} from '../realtimeProtocol.js'

const DEFAULT_DEBOUNCE_MS = 250
const DEFAULT_RECONCILE_MS = 30_000
const ROOT_STATE_FILE_PATTERN = /^(?:\.codex-global-state\.json|session_index\.jsonl|state_.*\.sqlite(?:-(?:shm|wal))?|thread_history_.*\.sqlite(?:-(?:shm|wal))?)$/u

type ScheduleHandle = unknown
type WatchListener = (eventType: string, filename: string | null) => void

type ClosableWatcher = {
  close: () => void
}

export type DesktopStateCoordinatorDependencies = {
  codexHome: string
  exists?: (path: string) => boolean
  watch?: (path: string, listener: WatchListener) => ClosableWatcher
  schedule?: (callback: () => void, delayMs: number) => ScheduleHandle
  cancelSchedule?: (handle: ScheduleHandle) => void
  fingerprint?: () => string
  now?: () => number
  debounceMs?: number
  reconcileMs?: number
}

type NativeNotification = {
  method: string
  params: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function extractThreadId(params: unknown): string {
  const record = asRecord(params)
  if (!record) return ''
  const direct = [record.threadId, record.thread_id, record.conversationId, record.conversation_id]
    .find((value) => typeof value === 'string' && value.length > 0)
  if (typeof direct === 'string') return direct
  const thread = asRecord(record.thread)
  return typeof thread?.id === 'string' ? thread.id : ''
}

function isFileChangeNotification(notification: NativeNotification): boolean {
  if (notification.method === 'item/fileChange/outputDelta') return true
  const params = asRecord(notification.params)
  const item = asRecord(params?.item)
  return item?.type === 'fileChange'
}

function defaultWatch(path: string, listener: WatchListener): ClosableWatcher {
  const watcher = watchFs(path, { persistent: false }, (eventType, filename) => {
    listener(eventType, filename === null ? null : String(filename))
  })
  return { close: () => watcher.close() }
}

function statFingerprint(path: string): string {
  try {
    const value = statSync(path)
    return `${path}:${String(value.size)}:${String(value.mtimeMs)}`
  } catch {
    return `${path}:missing`
  }
}

function createDefaultFingerprint(codexHome: string): () => string {
  return () => {
    const paths = [
      codexHome,
      join(codexHome, 'sessions'),
      join(codexHome, 'archived_sessions'),
      join(codexHome, '.codex-global-state.json'),
      join(codexHome, 'session_index.jsonl'),
    ]
    try {
      for (const name of readdirSync(codexHome)) {
        if (ROOT_STATE_FILE_PATTERN.test(name)) paths.push(join(codexHome, name))
      }
    } catch {
      // A missing CODEX_HOME is represented by the root fingerprint.
    }
    return Array.from(new Set(paths)).sort().map(statFingerprint).join('|')
  }
}

export class DesktopStateCoordinator {
  private readonly codexHome: string
  private readonly exists: (path: string) => boolean
  private readonly watch: (path: string, listener: WatchListener) => ClosableWatcher
  private readonly schedule: (callback: () => void, delayMs: number) => ScheduleHandle
  private readonly cancelSchedule: (handle: ScheduleHandle) => void
  private readonly fingerprint: () => string
  private readonly now: () => number
  private readonly debounceMs: number
  private readonly reconcileMs: number
  private readonly listeners = new Set<(event: CodexUiInvalidation) => void>()
  private readonly watchers: ClosableWatcher[] = []
  private readonly pendingScopes = new Set<CodexUiInvalidationScope>()
  private readonly pendingThreadIds = new Set<string>()
  private debounceTimer: ScheduleHandle | null = null
  private reconcileTimer: ScheduleHandle | null = null
  private pendingReason: CodexUiInvalidationReason | null = null
  private lastFingerprint = ''
  private revision = 0
  private started = false
  private lastProcessState: CodexProcessState | null = null

  constructor(dependencies: DesktopStateCoordinatorDependencies) {
    this.codexHome = dependencies.codexHome
    this.exists = dependencies.exists ?? existsSync
    this.watch = dependencies.watch ?? defaultWatch
    this.schedule = dependencies.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.cancelSchedule = dependencies.cancelSchedule ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
    this.fingerprint = dependencies.fingerprint ?? createDefaultFingerprint(this.codexHome)
    this.now = dependencies.now ?? Date.now
    this.debounceMs = dependencies.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.reconcileMs = dependencies.reconcileMs ?? DEFAULT_RECONCILE_MS
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.lastFingerprint = this.fingerprint()

    const targets = [
      { path: this.codexHome, root: true },
      { path: join(this.codexHome, 'sessions'), root: false },
      { path: join(this.codexHome, 'archived_sessions'), root: false },
    ]
    for (const target of targets) {
      if (!this.exists(target.path)) continue
      try {
        this.watchers.push(this.watch(target.path, (_eventType, filename) => {
          if (target.root && (!filename || !ROOT_STATE_FILE_PATTERN.test(filename))) return
          this.queueInvalidation(['threads', 'projects'], 'filesystem')
        }))
      } catch {
        // Reconciliation remains active when a native watcher is unavailable.
      }
    }

    this.scheduleReconciliation()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    for (const watcher of this.watchers.splice(0)) {
      try {
        watcher.close()
      } catch {
        // Ignore watcher close errors during shutdown.
      }
    }
    if (this.debounceTimer !== null) {
      this.cancelSchedule(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.reconcileTimer !== null) {
      this.cancelSchedule(this.reconcileTimer)
      this.reconcileTimer = null
    }
    this.pendingScopes.clear()
    this.pendingThreadIds.clear()
    this.pendingReason = null
  }

  subscribe(listener: (event: CodexUiInvalidation) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  noteNativeNotification(notification: NativeNotification): void {
    const method = notification.method
    const scopes: CodexUiInvalidationScope[] = []
    if (method.startsWith('thread/') || method.startsWith('turn/') || method.startsWith('item/')) {
      scopes.push('threads')
    }
    if (isFileChangeNotification(notification)) scopes.push('workspace')
    if (scopes.length === 0) return
    const threadId = extractThreadId(notification.params)
    this.queueInvalidation(scopes, 'app-server', threadId ? [threadId] : [])
  }

  noteProcessHealth(state: CodexProcessState): void {
    const recovered = this.lastProcessState === 'restarting' && state === 'ready'
    this.lastProcessState = state
    this.queueInvalidation(recovered ? ['health', 'threads'] : ['health'], recovered ? 'restart' : 'app-server')
  }

  getRevision(): number {
    return this.revision
  }

  private queueInvalidation(
    scopes: CodexUiInvalidationScope[],
    reason: CodexUiInvalidationReason,
    threadIds: string[] = [],
  ): void {
    if (!this.started) return
    for (const scope of scopes) this.pendingScopes.add(scope)
    for (const threadId of threadIds) {
      if (threadId) this.pendingThreadIds.add(threadId)
    }
    this.pendingReason ??= reason
    if (this.debounceTimer !== null) return
    this.debounceTimer = this.schedule(() => {
      this.debounceTimer = null
      this.flushInvalidation()
    }, this.debounceMs)
  }

  private flushInvalidation(): void {
    if (!this.started || this.pendingScopes.size === 0 || !this.pendingReason) return
    this.revision += 1
    const threadIds = Array.from(this.pendingThreadIds)
    const event: CodexUiInvalidation = {
      method: 'codex-ui/state-invalidated',
      params: {
        scopes: Array.from(this.pendingScopes),
        ...(threadIds.length > 0 ? { threadIds } : {}),
        reason: this.pendingReason,
        revision: this.revision,
      },
      atIso: new Date(this.now()).toISOString(),
    }
    this.pendingScopes.clear()
    this.pendingThreadIds.clear()
    this.pendingReason = null
    for (const listener of this.listeners) listener(event)
  }

  private scheduleReconciliation(): void {
    if (!this.started || this.reconcileTimer !== null) return
    this.reconcileTimer = this.schedule(() => {
      this.reconcileTimer = null
      if (!this.started) return
      const nextFingerprint = this.fingerprint()
      if (nextFingerprint !== this.lastFingerprint) {
        this.lastFingerprint = nextFingerprint
        this.queueInvalidation(['threads', 'projects'], 'reconcile')
      }
      this.scheduleReconciliation()
    }, this.reconcileMs)
  }
}
