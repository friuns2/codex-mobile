import type { CodexAppServerHealth } from './realtimeProtocol'

export type ServerHealthPresentation = {
  label: string
  tone: 'ok' | 'warning' | 'error'
}

type HealthSummary = Pick<CodexAppServerHealth, 'state' | 'restartAttempts'>

export function presentServerHealth(health: HealthSummary | null | undefined): ServerHealthPresentation {
  if (!health) return { label: 'Codex status unknown', tone: 'warning' }

  switch (health.state) {
    case 'ready':
      return { label: 'Codex connected', tone: 'ok' }
    case 'starting':
      return { label: 'Codex connecting', tone: 'warning' }
    case 'restarting':
      return { label: 'Codex reconnecting', tone: 'warning' }
    case 'stopped':
    case 'failed':
      return { label: 'Codex unavailable', tone: 'error' }
  }
}
