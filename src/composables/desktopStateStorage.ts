import type { CollaborationModeKind, UiThreadTokenUsage } from '../types/codex'
import { toProjectName } from '../pathUtils.js'

const READ_STATE_STORAGE_KEY = 'codex-web-local.thread-read-state.v1'
const UNREAD_CUTOFF_STORAGE_KEY = 'codex-web-local.thread-unread-cutoff.v1'
const THREAD_TOKEN_USAGE_STORAGE_KEY = 'codex-web-local.thread-token-usage.v1'
const THREAD_TERMINAL_OPEN_STORAGE_KEY = 'codex-web-local.thread-terminal-open.v1'
const SELECTED_THREAD_STORAGE_KEY = 'codex-web-local.selected-thread-id.v1'
const SELECTED_MODEL_BY_CONTEXT_STORAGE_KEY = 'codex-web-local.selected-model-by-context.v1'
const LEGACY_SELECTED_MODEL_STORAGE_KEY = 'codex-web-local.selected-model-id.v1'
const PROJECT_ORDER_STORAGE_KEY = 'codex-web-local.project-order.v1'
const PROJECT_DISPLAY_NAME_STORAGE_KEY = 'codex-web-local.project-display-name.v1'
const COLLABORATION_MODE_STORAGE_KEY = 'codex-web-local.collaboration-mode-by-context.v1'
const LEGACY_COLLABORATION_MODE_STORAGE_KEY = 'codex-web-local.collaboration-mode.v1'
export const NEW_THREAD_COLLABORATION_MODE_CONTEXT = '__new-thread__'
const NEW_THREAD_PROVIDER_MODEL_CONTEXT_PREFIX = '__new-thread-provider__::'

export function loadReadStateMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(READ_STATE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function saveReadStateMap(state: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(READ_STATE_STORAGE_KEY, JSON.stringify(state))
}

export function loadUnreadCutoffIso(): string {
  if (typeof window === 'undefined') return ''

  const existing = window.localStorage.getItem(UNREAD_CUTOFF_STORAGE_KEY)
  if (existing) return existing

  const initialCutoff = new Date().toISOString()
  window.localStorage.setItem(UNREAD_CUTOFF_STORAGE_KEY, initialCutoff)
  return initialCutoff
}

export function saveUnreadCutoffIso(cutoffIso: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UNREAD_CUTOFF_STORAGE_KEY, cutoffIso)
}

export function isThreadUpdatedAfterCutoff(updatedAtIso: string, cutoffIso: string): boolean {
  if (!updatedAtIso || !cutoffIso) return false
  const updatedAtMs = new Date(updatedAtIso).getTime()
  const cutoffMs = new Date(cutoffIso).getTime()
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(cutoffMs)) return false
  return updatedAtMs > cutoffMs
}

export function isThreadUnreadByLastRead(
  updatedAtIso: string,
  threadReadStateIso: string | undefined,
  unreadCutoffIso: string,
): boolean {
  const effectiveLastReadIso = threadReadStateIso ?? unreadCutoffIso
  return isThreadUpdatedAfterCutoff(updatedAtIso, effectiveLastReadIso)
}

export function normalizeCollaborationMode(value: unknown): CollaborationModeKind {
  return value === 'plan' ? 'plan' : 'default'
}

export function normalizeStoredModelId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createStringKeyedRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

export function cloneStringKeyedRecord<T>(record: Record<string, T>): Record<string, T> {
  const next = createStringKeyedRecord<T>()
  for (const [key, value] of Object.entries(record)) {
    next[key] = value
  }
  return next
}

export function omitStringKeyedRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = createStringKeyedRecord<T>()
  for (const [entryKey, value] of Object.entries(record)) {
    if (entryKey !== key) {
      next[entryKey] = value
    }
  }
  return next
}

export function pruneThreadContextStateMap<T>(
  stateMap: Record<string, T>,
  threadIds: Set<string>,
): Record<string, T> {
  let changed = false
  const next = createStringKeyedRecord<T>()
  for (const [contextId, value] of Object.entries(stateMap)) {
    if (
      contextId === NEW_THREAD_COLLABORATION_MODE_CONTEXT
      || contextId.startsWith(NEW_THREAD_PROVIDER_MODEL_CONTEXT_PREFIX)
      || threadIds.has(contextId)
    ) {
      next[contextId] = value
      continue
    }
    changed = true
  }
  return changed ? next : stateMap
}

export function normalizeProviderContextId(providerId: string): string {
  const normalized = providerId.trim().toLowerCase()
  return normalized || 'codex'
}

export function isNewThreadContextId(contextId: string): boolean {
  return contextId === NEW_THREAD_COLLABORATION_MODE_CONTEXT
}

export function toProviderModelContextId(providerId: string): string {
  const normalizedProviderId = normalizeProviderContextId(providerId)
  if (!normalizedProviderId) return ''
  return `${NEW_THREAD_PROVIDER_MODEL_CONTEXT_PREFIX}${normalizedProviderId}`
}

export function toThreadContextId(threadId: string): string {
  const normalizedThreadId = threadId.trim()
  return normalizedThreadId || NEW_THREAD_COLLABORATION_MODE_CONTEXT
}

export function loadSelectedModelMap(): Record<string, string> {
  if (typeof window === 'undefined') return createStringKeyedRecord<string>()

  try {
    const raw = window.localStorage.getItem(SELECTED_MODEL_BY_CONTEXT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return createStringKeyedRecord<string>()

      const next = createStringKeyedRecord<string>()
      for (const [contextId, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof contextId !== 'string' || contextId.length === 0) continue
        const normalizedModelId = normalizeStoredModelId(value)
        if (normalizedModelId) {
          next[contextId] = normalizedModelId
        }
      }
      return next
    }
  } catch {
    // Fall back to the legacy global preference below.
  }

  const legacyModelId = normalizeStoredModelId(window.localStorage.getItem(LEGACY_SELECTED_MODEL_STORAGE_KEY))
  const next = createStringKeyedRecord<string>()
  if (legacyModelId) {
    next[NEW_THREAD_COLLABORATION_MODE_CONTEXT] = legacyModelId
  }
  return next
}

export function readSelectedModel(
  state: Record<string, string>,
  threadId: string,
): string {
  const contextId = toThreadContextId(threadId)
  const contextModelId = normalizeStoredModelId(state[contextId])
  if (contextModelId) return contextModelId
  return normalizeStoredModelId(state[NEW_THREAD_COLLABORATION_MODE_CONTEXT])
}

export function saveSelectedModelMap(state: Record<string, string>): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(SELECTED_MODEL_BY_CONTEXT_STORAGE_KEY)
    } else {
      window.localStorage.setItem(SELECTED_MODEL_BY_CONTEXT_STORAGE_KEY, JSON.stringify(state))
    }
    window.localStorage.removeItem(LEGACY_SELECTED_MODEL_STORAGE_KEY)
  } catch {
    // Keep in-memory selection working even if localStorage writes fail.
  }
}

export function loadSelectedCollaborationModeMap(): Record<string, CollaborationModeKind> {
  if (typeof window === 'undefined') return createStringKeyedRecord<CollaborationModeKind>()

  try {
    const raw = window.localStorage.getItem(COLLABORATION_MODE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return createStringKeyedRecord<CollaborationModeKind>()
      }

      const next = createStringKeyedRecord<CollaborationModeKind>()
      for (const [contextId, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof contextId !== 'string' || contextId.length === 0) continue
        const normalizedMode = normalizeCollaborationMode(value)
        if (normalizedMode === 'plan') {
          next[contextId] = normalizedMode
        }
      }
      return next
    }
  } catch {
    // Fall back to the legacy global preference below.
  }

  return createStringKeyedRecord<CollaborationModeKind>()
}

export function readSelectedCollaborationMode(
  state: Record<string, CollaborationModeKind>,
  threadId: string,
): CollaborationModeKind {
  const contextId = toThreadContextId(threadId)
  return normalizeCollaborationMode(state[contextId])
}

export function writeSelectedCollaborationModeForContext(
  state: Record<string, CollaborationModeKind>,
  threadId: string,
  mode: CollaborationModeKind,
): Record<string, CollaborationModeKind> {
  const contextId = toThreadContextId(threadId)
  if (isNewThreadContextId(contextId)) {
    return omitStringKeyedRecordKey(state, contextId)
  }
  if (mode === 'plan') {
    const next = cloneStringKeyedRecord(state)
    next[contextId] = 'plan'
    return next
  }
  return omitStringKeyedRecordKey(state, contextId)
}

export function saveSelectedCollaborationModeMap(state: Record<string, CollaborationModeKind>): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(COLLABORATION_MODE_STORAGE_KEY)
    } else {
      window.localStorage.setItem(COLLABORATION_MODE_STORAGE_KEY, JSON.stringify(state))
    }
    window.localStorage.removeItem(LEGACY_COLLABORATION_MODE_STORAGE_KEY)
  } catch {
    // Keep in-memory mode selection working even if localStorage writes fail.
  }
}

export function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue)
}

export function normalizeStoredTokenCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value))
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed))
    }
  }

  return null
}

export function normalizeTokenUsageBreakdown(value: unknown): UiThreadTokenUsage['last'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  return {
    totalTokens: normalizeStoredTokenCount(record.totalTokens) ?? 0,
    inputTokens: normalizeStoredTokenCount(record.inputTokens) ?? 0,
    cachedInputTokens: normalizeStoredTokenCount(record.cachedInputTokens) ?? 0,
    outputTokens: normalizeStoredTokenCount(record.outputTokens) ?? 0,
    reasoningOutputTokens: normalizeStoredTokenCount(record.reasoningOutputTokens) ?? 0,
  }
}

export function normalizeThreadTokenUsage(value: unknown): UiThreadTokenUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const total = normalizeTokenUsageBreakdown(record.total)
  const last = normalizeTokenUsageBreakdown(record.last)
  if (!total || !last) return null

  const modelContextWindow = normalizeStoredTokenCount(record.modelContextWindow)
  const currentContextTokens = last.totalTokens
  const remainingContextTokens = typeof modelContextWindow === 'number'
    ? Math.max(modelContextWindow - currentContextTokens, 0)
    : null
  const remainingContextPercent = typeof modelContextWindow === 'number' && modelContextWindow > 0
    ? clamp(Math.round((remainingContextTokens ?? 0) / modelContextWindow * 100), 0, 100)
    : null

  return {
    total,
    last,
    modelContextWindow,
    currentContextTokens,
    remainingContextTokens,
    remainingContextPercent,
  }
}

export function loadThreadTokenUsageMap(): Record<string, UiThreadTokenUsage> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(THREAD_TOKEN_USAGE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalizedMap: Record<string, UiThreadTokenUsage> = {}
    for (const [threadId, usage] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId) continue
      const normalizedUsage = normalizeThreadTokenUsage(usage)
      if (normalizedUsage) {
        normalizedMap[threadId] = normalizedUsage
      }
    }
    return normalizedMap
  } catch {
    return {}
  }
}

export function saveThreadTokenUsageMap(state: Record<string, UiThreadTokenUsage>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THREAD_TOKEN_USAGE_STORAGE_KEY, JSON.stringify(state))
}

export function loadThreadTerminalOpenMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(THREAD_TERMINAL_OPEN_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalizedMap: Record<string, boolean> = {}
    for (const [threadId, isOpen] of Object.entries(parsed as Record<string, unknown>)) {
      if (threadId && typeof isOpen === 'boolean') {
        normalizedMap[threadId] = isOpen
      }
    }
    return normalizedMap
  } catch {
    return {}
  }
}

export function saveThreadTerminalOpenMap(state: Record<string, boolean>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THREAD_TERMINAL_OPEN_STORAGE_KEY, JSON.stringify(state))
}

export function loadSelectedThreadId(): string {
  if (typeof window === 'undefined') return ''
  const raw = window.localStorage.getItem(SELECTED_THREAD_STORAGE_KEY)
  return raw ?? ''
}

export function saveSelectedThreadId(threadId: string): void {
  if (typeof window === 'undefined') return
  if (!threadId) {
    window.localStorage.removeItem(SELECTED_THREAD_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SELECTED_THREAD_STORAGE_KEY, threadId)
}

export function loadProjectOrder(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(PROJECT_ORDER_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const order: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string' || item.length === 0) continue
      const normalizedItem = toProjectName(item)
      if (normalizedItem.length > 0 && !order.includes(normalizedItem)) {
        order.push(normalizedItem)
      }
    }
    return order
  } catch {
    return []
  }
}

export function saveProjectOrder(order: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_ORDER_STORAGE_KEY, JSON.stringify(order))
}

export function loadProjectDisplayNames(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(PROJECT_DISPLAY_NAME_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const displayNames: Record<string, string> = {}
    for (const [projectName, displayName] of Object.entries(parsed as Record<string, unknown>)) {
      const normalizedProjectName = typeof projectName === 'string' ? toProjectName(projectName) : ''
      if (normalizedProjectName.length > 0 && typeof displayName === 'string') {
        displayNames[normalizedProjectName] = displayName
      }
    }
    return displayNames
  } catch {
    return {}
  }
}

export function saveProjectDisplayNames(displayNames: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_DISPLAY_NAME_STORAGE_KEY, JSON.stringify(displayNames))
}
