import type {
  CodexUiInvalidation,
  CodexUiInvalidationReason,
  CodexUiInvalidationScope,
} from '../realtimeProtocol'

const SCOPES = new Set<CodexUiInvalidationScope>(['threads', 'projects', 'workspace', 'health'])
const REASONS = new Set<CodexUiInvalidationReason>(['app-server', 'filesystem', 'reconcile', 'restart'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function parseCodexUiInvalidation(value: unknown): CodexUiInvalidation['params'] | null {
  const notification = asRecord(value)
  if (notification?.method !== 'codex-ui/state-invalidated') return null
  const params = asRecord(notification.params)
  if (!params) return null

  if (!Array.isArray(params.scopes) || params.scopes.length === 0) return null
  if (!params.scopes.every((scope) => typeof scope === 'string' && SCOPES.has(scope as CodexUiInvalidationScope))) {
    return null
  }
  const scopes = Array.from(new Set(params.scopes as CodexUiInvalidationScope[]))

  if (typeof params.reason !== 'string' || !REASONS.has(params.reason as CodexUiInvalidationReason)) return null
  if (typeof params.revision !== 'number' || !Number.isSafeInteger(params.revision) || params.revision <= 0) return null

  let threadIds: string[] | undefined
  if (params.threadIds !== undefined) {
    if (!Array.isArray(params.threadIds) || !params.threadIds.every((id) => typeof id === 'string' && id.trim().length > 0)) {
      return null
    }
    threadIds = Array.from(new Set(params.threadIds))
  }

  return {
    scopes,
    ...(threadIds ? { threadIds } : {}),
    reason: params.reason as CodexUiInvalidationReason,
    revision: params.revision,
  }
}
