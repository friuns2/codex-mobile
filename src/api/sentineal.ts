export type VulnerabilitySeverity = 'critical' | 'high' | 'moderate' | 'low'

export interface AdvisoryEntry {
  id: number
  title: string
  severity: VulnerabilitySeverity
  cves: string[]
  vulnerableVersions: string
  patchedVersions: string
  recommendation: string
  url: string
  source: 'npm' | 'socket'
}

export interface ScannedDependency {
  name: string
  version: string
  dev: boolean
  advisories: AdvisoryEntry[]
}

export interface SentinealStatus {
  hasSocketKey: boolean
  projectFound: boolean
  dependencyCount: number
  vulnerableCount: number
  lastNpmScan: string | null
  lastSocketScan: string | null
}

export interface SentinealScanResult {
  scannedAt: string
  dependencies: ScannedDependency[]
  summary: {
    total: number
    vulnerable: number
    critical: number
    high: number
    moderate: number
    low: number
  }
}

export async function sentinealGetStatus(): Promise<SentinealStatus> {
  const res = await fetch('/codex-api/sentineal/status')
  if (!res.ok) throw new Error('Failed to fetch Sentineal status')
  return res.json()
}

export async function sentinealScan(source: 'npm' | 'socket'): Promise<SentinealScanResult> {
  const res = await fetch('/codex-api/sentineal/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  })
  if (!res.ok) throw new Error('Failed to run Sentineal scan')
  return res.json()
}

export async function sentinealSetSocketKey(apiKey: string): Promise<void> {
  const res = await fetch('/codex-api/sentineal/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
  if (!res.ok) throw new Error('Failed to save Socket.dev API key')
}

export async function sentinealRemoveSocketKey(): Promise<void> {
  const res = await fetch('/codex-api/sentineal/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: '' }),
  })
  if (!res.ok) throw new Error('Failed to remove Socket.dev API key')
}
