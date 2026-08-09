import type { IncomingMessage, ServerResponse } from 'node:http'

const SENTINEL_API_PREFIX = '/codex-api/sentinel'

interface AgentState {
  id: string
  name: string
  description: string
  status: 'idle' | 'monitoring' | 'alert' | 'error'
  mode: 'auto' | 'manual'
  alertCount: number
  lastTriggered: string | null
  enabled: boolean
}

interface AlertEntry {
  id: string
  agentId: string
  agentName: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: string
  acknowledged: boolean
}

interface SystemMetrics {
  uptime: number
  activeConnections: number
  memoryUsageMB: number
  totalAlerts: number
  agentsOnline: number
  agentsTotal: number
}

class SentinelAgentManager {
  private agents: Map<string, AgentState> = new Map()
  private alerts: AlertEntry[] = []
  private static readonly MAX_ALERTS = 500
  private masterMode: 'auto' | 'manual' = 'auto'
  private startTime = Date.now()
  private activeConnections = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private memoryUsageSample: number[] = []

  constructor() {
    this.registerDefaultAgents()
    this.startMonitoring()
  }

  private registerDefaultAgents(): void {
    this.registerAgent({
      id: 'auth-guard',
      name: 'Auth Guard',
      description: 'Monitors login attempts, detects brute force patterns, and rate-limits suspicious authentication traffic.',
      status: 'monitoring',
      mode: 'auto',
      alertCount: 0,
      lastTriggered: null,
      enabled: true,
    })
    this.registerAgent({
      id: 'key-watchdog',
      name: 'API Key Watchdog',
      description: 'Scans process arguments, environment variables, and log output for exposed API keys, tokens, and secrets.',
      status: 'monitoring',
      mode: 'auto',
      alertCount: 0,
      lastTriggered: null,
      enabled: true,
    })
    this.registerAgent({
      id: 'file-patrol',
      name: 'File Patrol',
      description: 'Monitors file system access patterns, detects path traversal attempts, and enforces directory allowlist boundaries.',
      status: 'monitoring',
      mode: 'auto',
      alertCount: 0,
      lastTriggered: null,
      enabled: true,
    })
    this.registerAgent({
      id: 'memory-sentinel',
      name: 'Memory Sentinel',
      description: 'Tracks heap usage, detects unbounded collection growth, and warns about potential memory leak patterns.',
      status: 'monitoring',
      mode: 'auto',
      alertCount: 0,
      lastTriggered: null,
      enabled: true,
    })
    this.registerAgent({
      id: 'network-monitor',
      name: 'Network Monitor',
      description: 'Watches SSE and WebSocket connection lifecycles, detects abandoned connections, and tracks request patterns.',
      status: 'monitoring',
      mode: 'auto',
      alertCount: 0,
      lastTriggered: null,
      enabled: true,
    })
    this.registerAgent({
      id: 'audit-logger',
      name: 'Audit Logger',
      description: 'Centralized structured logging with severity correlation, alert deduplication, and forensic trail generation.',
      status: 'monitoring',
      mode: 'auto',
      alertCount: 0,
      lastTriggered: null,
      enabled: true,
    })
  }

  registerAgent(state: AgentState): void {
    this.agents.set(state.id, state)
  }

  getAgent(id: string): AgentState | undefined {
    return this.agents.get(id)
  }

  getAllAgents(): AgentState[] {
    return Array.from(this.agents.values())
  }

  setAgentMode(id: string, mode: 'auto' | 'manual'): boolean {
    const agent = this.agents.get(id)
    if (!agent) return false
    agent.mode = mode
    return true
  }

  setAgentEnabled(id: string, enabled: boolean): boolean {
    const agent = this.agents.get(id)
    if (!agent) return false
    agent.enabled = enabled
    return true
  }

  setMasterMode(mode: 'auto' | 'manual'): void {
    this.masterMode = mode
    for (const agent of this.agents.values()) {
      agent.mode = mode
    }
  }

  getMasterMode(): 'auto' | 'manual' {
    return this.masterMode
  }

  triggerAlert(agentId: string, severity: AlertEntry['severity'], message: string): void {
    const agent = this.agents.get(agentId)
    if (!agent || !agent.enabled) return
    agent.status = 'alert'
    agent.alertCount++
    agent.lastTriggered = new Date().toISOString()
    this.alerts.unshift({
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      agentName: agent.name,
      severity,
      message,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    })
    if (this.alerts.length > SentinelAgentManager.MAX_ALERTS) {
      this.alerts.length = SentinelAgentManager.MAX_ALERTS
    }
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId)
    if (!alert) return false
    alert.acknowledged = true
    return true
  }

  acknowledgeAllAlerts(): void {
    for (const alert of this.alerts) {
      alert.acknowledged = true
    }
  }

  getAlerts(limit = 50, unacknowledgedOnly = false): AlertEntry[] {
    let result = this.alerts
    if (unacknowledgedOnly) {
      result = result.filter((a) => !a.acknowledged)
    }
    return result.slice(0, limit)
  }

  getUnacknowledgedAlertCount(): number {
    return this.alerts.filter((a) => !a.acknowledged).length
  }

  getMetrics(): SystemMetrics {
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      activeConnections: this.activeConnections,
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      totalAlerts: this.alerts.length,
      agentsOnline: Array.from(this.agents.values()).filter((a) => a.enabled && a.status !== 'error').length,
      agentsTotal: this.agents.size,
    }
  }

  incrementConnections(): void {
    this.activeConnections++
  }

  decrementConnections(): void {
    if (this.activeConnections > 0) this.activeConnections--
  }

  private startMonitoring(): void {
    this.intervalId = setInterval(() => {
      this.sampleMemory()
    }, 30_000)
    this.intervalId.unref()
  }

  private sampleMemory(): void {
    const usage = process.memoryUsage()
    this.memoryUsageSample.push(usage.heapUsed)
    if (this.memoryUsageSample.length > 10) {
      this.memoryUsageSample.shift()
    }
    if (this.memoryUsageSample.length >= 2) {
      const current = this.memoryUsageSample[this.memoryUsageSample.length - 1]
      const previous = this.memoryUsageSample[this.memoryUsageSample.length - 2]
      const growth = current - previous
      if (growth > 50 * 1024 * 1024) {
        this.triggerAlert('memory-sentinel', 'high', `Heap grew by ${Math.round(growth / 1024 / 1024)}MB in 30s — possible leak`)
      }
    }
    if (usage.heapUsed > 500 * 1024 * 1024) {
      this.triggerAlert('memory-sentinel', 'critical', `Heap usage at ${Math.round(usage.heapUsed / 1024 / 1024)}MB — threshold exceeded`)
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}

const manager = new SentinelAgentManager()

export function getSentinelManager(): SentinelAgentManager {
  return manager
}

export async function handleSentinelRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith(SENTINEL_API_PREFIX)) return false

  try {
    const path = url.pathname.slice(SENTINEL_API_PREFIX.length) || '/'

    if (req.method === 'GET' && path === '/status') {
      setJson(res, 200, {
        masterMode: manager.getMasterMode(),
        agents: manager.getAllAgents(),
        metrics: manager.getMetrics(),
        unacknowledgedAlerts: manager.getUnacknowledgedAlertCount(),
      })
      return true
    }

    if (req.method === 'GET' && path === '/alerts') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)
      const unacknowledgedOnly = url.searchParams.get('unacknowledged') === 'true'
      setJson(res, 200, manager.getAlerts(limit, unacknowledgedOnly))
      return true
    }

    if (req.method === 'POST' && path === '/alerts/acknowledge') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const alertId = readString(body.alertId)
      if (alertId) {
        manager.acknowledgeAlert(alertId)
      } else {
        manager.acknowledgeAllAlerts()
      }
      setJson(res, 200, { success: true })
      return true
    }

    if (req.method === 'POST' && path === '/mode') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const mode = readString(body.mode)
      if (mode !== 'auto' && mode !== 'manual') {
        setJson(res, 400, { error: 'Mode must be "auto" or "manual"' })
        return true
      }
      manager.setMasterMode(mode)
      setJson(res, 200, { success: true, masterMode: mode })
      return true
    }

    if (req.method === 'POST' && path === '/agent/mode') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const agentId = readString(body.agentId)
      const mode = readString(body.mode)
      if (!agentId || (mode !== 'auto' && mode !== 'manual')) {
        setJson(res, 400, { error: 'agentId and mode ("auto"|"manual") required' })
        return true
      }
      if (!manager.setAgentMode(agentId, mode)) {
        setJson(res, 404, { error: `Agent "${agentId}" not found` })
        return true
      }
      setJson(res, 200, { success: true })
      return true
    }

    if (req.method === 'POST' && path === '/agent/toggle') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const agentId = readString(body.agentId)
      const enabled = typeof body.enabled === 'boolean' ? body.enabled : null
      if (!agentId || enabled === null) {
        setJson(res, 400, { error: 'agentId and enabled required' })
        return true
      }
      if (!manager.setAgentEnabled(agentId, enabled)) {
        setJson(res, 404, { error: `Agent "${agentId}" not found` })
        return true
      }
      setJson(res, 200, { success: true })
      return true
    }

    setJson(res, 404, { error: 'Unknown sentinel endpoint' })
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setJson(res, 500, { error: `Sentinel error: ${message}` })
    return true
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const rawBody = await new Promise<string>((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
  return asRecord(rawBody.length > 0 ? JSON.parse(rawBody) : {})
}
