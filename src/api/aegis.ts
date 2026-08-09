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

export interface AegisStatus {
  hasSocketKey: boolean
  projectFound: boolean
  dependencyCount: number
  vulnerableCount: number
  lastNpmScan: string | null
  lastSocketScan: string | null
}

export interface AegisScanResult {
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

export async function aegisGetStatus(): Promise<AegisStatus> {
  const res = await fetch('/codex-api/aegis/status')
  if (!res.ok) throw new Error('Failed to fetch Aegis status')
  return res.json()
}

export async function aegisScan(source: 'npm' | 'socket'): Promise<AegisScanResult> {
  const res = await fetch('/codex-api/aegis/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  })
  if (!res.ok) throw new Error('Failed to run Aegis scan')
  return res.json()
}

export async function aegisSetSocketKey(apiKey: string): Promise<void> {
  const res = await fetch('/codex-api/aegis/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
  if (!res.ok) throw new Error('Failed to save Socket.dev API key')
}

export async function aegisRemoveSocketKey(): Promise<void> {
  const res = await fetch('/codex-api/aegis/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: '' }),
  })
  if (!res.ok) throw new Error('Failed to remove Socket.dev API key')
}
