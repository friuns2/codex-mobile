import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

const AEGIS_API_PREFIX = '/codex-api/aegis'
const NPM_AUDIT_BULK_URL = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
const SCAN_TIMEOUT_MS = 20_000

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

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getConfigPath(): string {
  return join(getCodexHomeDir(), 'aegis-config.json')
}

interface AegisConfig {
  socketApiKey?: string
  lastNpmScan?: string
  lastSocketScan?: string
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }
  const record = asRecord(payload)
  if (!record) return fallback
  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error
  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) {
    return nestedError.message
  }
  return fallback
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
  if (rawBody.trim().length === 0) return {}
  try {
    return asRecord(JSON.parse(rawBody))
  } catch {
    return null
  }
}

async function loadConfig(): Promise<AegisConfig> {
  try {
    const raw = await readFile(getConfigPath(), 'utf8')
    return asRecord(JSON.parse(raw)) as AegisConfig
  } catch {
    return {}
  }
}

async function saveConfig(config: AegisConfig): Promise<void> {
  const configPath = getConfigPath()
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
}

function resolveProjectPackageJson(): string | null {
  const candidates = [
    join(process.cwd(), 'package.json'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function tryReadJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, 'utf8')
    return asRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

async function resolveLockfileResolvedVersion(
  name: string,
  versionRange: string,
  packageJsonDir: string,
): Promise<string | null> {
  const lockCandidates = [
    join(packageJsonDir, 'package-lock.json'),
    join(packageJsonDir, 'npm-shrinkwrap.json'),
  ]
  for (const lockPath of lockCandidates) {
    const lock = await tryReadJson(lockPath)
    if (!lock) continue
    const packages = asRecord(lock.packages)
    if (packages) {
      const entry = asRecord(packages[`node_modules/${name}`])
      const resolvedVersion = readString(entry?.version)
      if (resolvedVersion) return resolvedVersion
    }
    const dependencies = asRecord(lock.dependencies)
    if (dependencies) {
      const entry = asRecord(dependencies[name])
      const resolvedVersion = readString(entry?.version)
      if (resolvedVersion) return resolvedVersion
    }
  }
  return null
}

interface RawDependency {
  name: string
  version: string
  dev: boolean
}

async function collectProjectDependencies(): Promise<{ packageJsonPath: string; dependencies: RawDependency[] } | null> {
  const packageJsonPath = resolveProjectPackageJson()
  if (!packageJsonPath) return null
  const packageJson = await tryReadJson(packageJsonPath)
  if (!packageJson) return null

  const dependencies: RawDependency[] = []
  const seen = new Set<string>()

  const depsMap = asRecord(packageJson.dependencies)
  const devDepsMap = asRecord(packageJson.devDependencies)
  if (depsMap) {
    for (const [name, rawVersion] of Object.entries(depsMap)) {
      if (seen.has(name)) continue
      seen.add(name)
      dependencies.push({ name, version: readString(rawVersion) ?? '', dev: false })
    }
  }
  if (devDepsMap) {
    for (const [name, rawVersion] of Object.entries(devDepsMap)) {
      if (seen.has(name)) continue
      seen.add(name)
      dependencies.push({ name, version: readString(rawVersion) ?? '', dev: true })
    }
  }

  const packageJsonDir = dirname(packageJsonPath)
  const resolvedDependencies: RawDependency[] = []
  for (const dependency of dependencies) {
    let version = dependency.version
    if (version.startsWith('^') || version.startsWith('~') || version.startsWith('>') || version === '*' || version.includes(' || ')) {
      const resolved = await resolveLockfileResolvedVersion(dependency.name, version, packageJsonDir)
      if (resolved) version = resolved
    }
    const cleanVersion = version.replace(/[^0-9a-zA-Z.-]/g, '').replace(/^[.-]+/, '')
    resolvedDependencies.push({ name: dependency.name, version: cleanVersion, dev: dependency.dev })
  }

  resolvedDependencies.sort((a, b) => a.name.localeCompare(b.name))
  return { packageJsonPath, dependencies: resolvedDependencies }
}

interface NpmAdvisoryRaw {
  id: number
  title: string
  severity: string
  cves?: string[]
  vulnerable_versions?: string
  patched_versions?: string
  recommendation?: string
  url?: string
}

function normalizeNpmAdvisory(raw: NpmAdvisoryRaw): AdvisoryEntry {
  const severity = normalizeSeverity(raw.severity)
  return {
    id: raw.id,
    title: raw.title,
    severity,
    cves: Array.isArray(raw.cves) ? raw.cves : [],
    vulnerableVersions: raw.vulnerable_versions ?? '',
    patchedVersions: raw.patched_versions ?? '',
    recommendation: raw.recommendation ?? '',
    url: raw.url ?? `https://www.npmjs.com/advisories/${raw.id}`,
    source: 'npm',
  }
}

export function normalizeSeverity(raw: string): VulnerabilitySeverity {
  const value = raw.trim().toLowerCase()
  if (value === 'critical' || value === 'high' || value === 'moderate' || value === 'low') {
    return value
  }
  return 'moderate'
}

export function summarize(dependencies: ScannedDependency[]): AegisScanResult['summary'] {
  const summary: AegisScanResult['summary'] = { total: 0, vulnerable: 0, critical: 0, high: 0, moderate: 0, low: 0 }
  summary.total = dependencies.length
  for (const dependency of dependencies) {
    if (dependency.advisories.length === 0) continue
    summary.vulnerable++
    for (const advisory of dependency.advisories) {
      summary[advisory.severity]++
    }
  }
  return summary
}

async function runNpmAdvisoryScan(dependencies: RawDependency[]): Promise<ScannedDependency[]> {
  const versionMap: Record<string, string[]> = {}
  const devSet = new Set<string>()
  for (const dependency of dependencies) {
    if (!dependency.version) continue
    if (!versionMap[dependency.name]) versionMap[dependency.name] = []
    versionMap[dependency.name].push(dependency.version)
    if (dependency.dev) devSet.add(dependency.name)
  }

  if (Object.keys(versionMap).length === 0) {
    return dependencies.map((d) => ({ name: d.name, version: d.version, dev: d.dev, advisories: [] }))
  }

  let rawAdvisories: Record<string, unknown> = {}
  try {
    const response = await fetch(NPM_AUDIT_BULK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(versionMap),
      signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    })
    if (response.ok) {
      rawAdvisories = asRecord(await response.json()) ?? {}
    }
  } catch {
    // offline or registry unreachable — advisories stay empty
  }

  const advisoryByPackage = new Map<string, AdvisoryEntry[]>()
  for (const [name, rawList] of Object.entries(rawAdvisories)) {
    if (!Array.isArray(rawList)) continue
    const entries: AdvisoryEntry[] = []
    for (const rawEntry of rawList) {
      const record = asRecord(rawEntry)
      if (!record) continue
      entries.push(normalizeNpmAdvisory(record as unknown as NpmAdvisoryRaw))
    }
    entries.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    advisoryByPackage.set(name, entries)
  }

  return dependencies.map((dependency) => ({
    name: dependency.name,
    version: dependency.version,
    dev: dependency.dev,
    advisories: advisoryByPackage.get(dependency.name) ?? [],
  }))
}

function severityRank(severity: VulnerabilitySeverity): number {
  const rank: Record<VulnerabilitySeverity, number> = { critical: 0, high: 1, moderate: 2, low: 3 }
  return rank[severity]
}

async function runSocketScan(dependencies: RawDependency[], config: AegisConfig): Promise<ScannedDependency[]> {
  const apiToken = readString(config.socketApiKey)
  if (!apiToken) {
    return dependencies.map((d) => ({ name: d.name, version: d.version, dev: d.dev, advisories: [] }))
  }

  type SocketSdkCtor = new (apiToken: string, options?: unknown) => {
    getIssuesByNpmPackage(pkgName: string, version: string): Promise<{ ok?: boolean; data?: unknown; error?: unknown }>
  }
  let SocketSdk: SocketSdkCtor | null = null
  try {
    const module = await import('@socketsecurity/sdk')
    SocketSdk = (module.SocketSdk as unknown) as SocketSdkCtor
  } catch {
    SocketSdk = null
  }

  const scanned: ScannedDependency[] = []
  for (const dependency of dependencies) {
    const advisories: AdvisoryEntry[] = []
    if (SocketSdk && dependency.version) {
      try {
        const sdk = new SocketSdk(apiToken)
        const result = await sdk.getIssuesByNpmPackage(dependency.name, dependency.version)
        const data = asRecord(result?.data)
        if (data) {
          const alerts = Array.isArray(data.alerts) ? data.alerts : []
          for (const alert of alerts) {
            const alertRecord = asRecord(alert)
            if (!alertRecord) continue
            const rule = asRecord(alertRecord.rule)
            const severity = normalizeSeverity(readString(rule?.severity) ?? readString(alertRecord.severity) ?? 'moderate')
            advisories.push({
              id: typeof alertRecord.uuid === 'number' ? alertRecord.uuid : 0,
              title: readString(rule?.title) ?? readString(alertRecord.title) ?? `Socket.dev alert on ${dependency.name}`,
              severity,
              cves: [],
              vulnerableVersions: dependency.version,
              patchedVersions: readString(rule?.solution) ?? '',
              recommendation: readString(alertRecord.suggestion) ?? readString(rule?.description) ?? '',
              url: `https://socket.dev/npm/package/${dependency.name}`,
              source: 'socket',
            })
          }
        }
      } catch {
        // individual package lookup failure is non-fatal
      }
    }
    advisories.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    scanned.push({ name: dependency.name, version: dependency.version, dev: dependency.dev, advisories })
  }
  return scanned
}

export async function handleAegisRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith(AEGIS_API_PREFIX)) return false

  try {
    const path = url.pathname.slice(AEGIS_API_PREFIX.length) || '/'

    if (req.method === 'GET' && path === '/status') {
      const config = await loadConfig()
      const project = await collectProjectDependencies()
      const lastNpmScan = readString(config.lastNpmScan)
      const lastSocketScan = readString(config.lastSocketScan)
      const status: AegisStatus = {
        hasSocketKey: Boolean(readString(config.socketApiKey)),
        projectFound: Boolean(project),
        dependencyCount: project?.dependencies.length ?? 0,
        vulnerableCount: 0,
        lastNpmScan,
        lastSocketScan,
      }
      if (project) {
        const scan = await runNpmAdvisoryScan(project.dependencies)
        status.vulnerableCount = scan.filter((d) => d.advisories.length > 0).length
      }
      setJson(res, 200, status)
      return true
    }

    if (req.method === 'GET' && path === '/dependencies') {
      const project = await collectProjectDependencies()
      if (!project) {
        setJson(res, 404, { error: 'No package.json found in the current working directory' })
        return true
      }
      const config = await loadConfig()
      const useSocket = url.searchParams.get('source') === 'socket'
      const scanned = useSocket
        ? await runSocketScan(project.dependencies, config)
        : await runNpmAdvisoryScan(project.dependencies)
      if (useSocket) config.lastSocketScan = new Date().toISOString()
      else config.lastNpmScan = new Date().toISOString()
      await saveConfig(config)
      const result: AegisScanResult = {
        scannedAt: new Date().toISOString(),
        dependencies: scanned,
        summary: summarize(scanned),
      }
      setJson(res, 200, result)
      return true
    }

    if (req.method === 'POST' && path === '/scan') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const project = await collectProjectDependencies()
      if (!project) {
        setJson(res, 404, { error: 'No package.json found in the current working directory' })
        return true
      }
      const config = await loadConfig()
      const source = readString(body.source) ?? 'npm'
      const scanned = source === 'socket'
        ? await runSocketScan(project.dependencies, config)
        : await runNpmAdvisoryScan(project.dependencies)
      if (source === 'socket') {
        config.lastSocketScan = new Date().toISOString()
      } else {
        config.lastNpmScan = new Date().toISOString()
      }
      await saveConfig(config)
      const result: AegisScanResult = {
        scannedAt: new Date().toISOString(),
        dependencies: scanned,
        summary: summarize(scanned),
      }
      setJson(res, 200, result)
      return true
    }

    if (req.method === 'POST' && path === '/key') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const config = await loadConfig()
      const apiKey = readString(body.apiKey)
      if (apiKey) {
        config.socketApiKey = apiKey
      } else {
        delete config.socketApiKey
      }
      await saveConfig(config)
      setJson(res, 200, { success: true, hasSocketKey: Boolean(apiKey) })
      return true
    }

    setJson(res, 404, { error: 'Unknown aegis endpoint' })
    return true
  } catch (error) {
    setJson(res, 500, { error: getErrorMessage(error, 'Aegis error') })
    return true
  }
}
