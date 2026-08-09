export interface AgentState {
  id: string
  name: string
  description: string
  status: 'idle' | 'monitoring' | 'alert' | 'error'
  mode: 'auto' | 'manual'
  alertCount: number
  lastTriggered: string | null
  enabled: boolean
}

export interface AlertEntry {
  id: string
  agentId: string
  agentName: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: string
  acknowledged: boolean
}

export interface SystemMetrics {
  uptime: number
  activeConnections: number
  memoryUsageMB: number
  totalAlerts: number
  agentsOnline: number
  agentsTotal: number
}

export interface SentinelStatus {
  masterMode: 'auto' | 'manual'
  agents: AgentState[]
  metrics: SystemMetrics
  unacknowledgedAlerts: number
}

export async function sentinelGetStatus(): Promise<SentinelStatus> {
  const res = await fetch('/codex-api/sentinel/status')
  if (!res.ok) throw new Error('Failed to fetch sentinel status')
  return res.json()
}

export async function sentinelGetAlerts(limit = 50, unacknowledgedOnly = false): Promise<AlertEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (unacknowledgedOnly) params.set('unacknowledged', 'true')
  const res = await fetch(`/codex-api/sentinel/alerts?${params}`)
  if (!res.ok) throw new Error('Failed to fetch alerts')
  return res.json()
}

export async function sentinelAcknowledgeAlert(alertId?: string): Promise<void> {
  const res = await fetch('/codex-api/sentinel/alerts/acknowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alertId ? { alertId } : {}),
  })
  if (!res.ok) throw new Error('Failed to acknowledge alert')
}

export async function sentinelSetMasterMode(mode: 'auto' | 'manual'): Promise<void> {
  const res = await fetch('/codex-api/sentinel/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!res.ok) throw new Error('Failed to set sentinel mode')
}

export async function sentinelSetAgentMode(agentId: string, mode: 'auto' | 'manual'): Promise<void> {
  const res = await fetch('/codex-api/sentinel/agent/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, mode }),
  })
  if (!res.ok) throw new Error('Failed to set agent mode')
}

export async function sentinelToggleAgent(agentId: string, enabled: boolean): Promise<void> {
  const res = await fetch('/codex-api/sentinel/agent/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, enabled }),
  })
  if (!res.ok) throw new Error('Failed to toggle agent')
}
