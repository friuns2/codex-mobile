export type CodexProcessState = 'stopped' | 'starting' | 'ready' | 'restarting' | 'failed'

export type CodexCommandSource = 'environment' | 'path' | 'package' | 'unavailable'

export type CodexAppServerHealth = {
  state: CodexProcessState
  commandSource: CodexCommandSource
  codexHome: string
  startedAtIso: string | null
  lastReadyAtIso: string | null
  restartAttempts: number
  lastExitCode: number | null
  lastError: string | null
  stderr: string[]
}

export type CodexUiInvalidationScope = 'threads' | 'projects' | 'workspace' | 'health'

export type CodexUiInvalidationReason = 'app-server' | 'filesystem' | 'reconcile' | 'restart'

export type CodexUiInvalidation = {
  method: 'codex-ui/state-invalidated'
  params: {
    scopes: CodexUiInvalidationScope[]
    threadIds?: string[]
    reason: CodexUiInvalidationReason
    revision: number
  }
  atIso: string
}

export type CodexAppServerHealthNotification = {
  method: 'codex-ui/app-server-health'
  params: CodexAppServerHealth
  atIso: string
}
