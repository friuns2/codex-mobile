import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { cpus, totalmem, freemem, platform, arch, homedir, release, hostname } from 'node:os'
import { join, dirname } from 'node:path'

const AI_MODELS_API_PREFIX = '/codex-api/ai-models'
const MODEL_SYNC_INTERVAL_MS = 10 * 60 * 1000
const PROVIDER_FETCH_TIMEOUT_MS = 15_000
const OLLAMA_BASE_URL = process.env.OLLAMA_HOST?.trim() || 'http://127.0.0.1:11434'
const HF_SEARCH_URL = 'https://huggingface.co/api/models'

export interface HardwareProfile {
  cpus: Array<{ model: string; cores: number; speedMHz: number }>
  totalRamBytes: number
  freeRamBytes: number
  platform: string
  arch: string
  release: string
  hostname: string
  tier: 'low' | 'medium' | 'high' | 'server'
  canRunOfflineModels: boolean
}

export interface OllamaModel {
  name: string
  sizeBytes: number
  digest: string
  modifiedAt: string
}

export interface CloudModelProvider {
  id: string
  name: string
  baseUrl: string
  wireApi: string
  hasApiKey: boolean
  active: boolean
  lastSyncedAt: string | null
  modelIds: string[]
  activationError: string | null
}

export interface ModelSuggestion {
  name: string
  kind: 'ollama' | 'huggingface'
  source: string
  sizeLabel: string
  ramHintBytes: number
  description: string
}

interface ProviderRecord {
  id: string
  name: string
  baseUrl: string
  wireApi: string
  apiKey: string
  active: boolean
  lastSyncedAt: string | null
  modelIds: string[]
  activationError: string | null
}

interface AiModelsConfig {
  providers: ProviderRecord[]
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getConfigPath(): string {
  return join(getCodexHomeDir(), 'ai-models-config.json')
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

function loadConfig(): AiModelsConfig {
  try {
    const raw = JSON.parse(readFileSync(getConfigPath(), 'utf8')) as unknown
    const record = asRecord(raw)
    const providers = Array.isArray(record?.providers) ? record.providers : []
    return { providers: providers as ProviderRecord[] }
  } catch {
    return { providers: [] }
  }
}

function saveConfig(config: AiModelsConfig): void {
  const configPath = getConfigPath()
  const dir = dirname(configPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
}

function sanitizeProvider(provider: ProviderRecord): CloudModelProvider {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    wireApi: provider.wireApi,
    hasApiKey: Boolean(provider.apiKey),
    active: provider.active,
    lastSyncedAt: provider.lastSyncedAt ?? null,
    modelIds: provider.modelIds,
    activationError: provider.activationError ?? null,
  }
}

function scanHardware(): HardwareProfile {
  const cpuList = cpus()
  const totalRamBytes = totalmem()
  const freeRamBytes = freemem()
  const tier: HardwareProfile['tier'] = totalRamBytes < 4 * 1024 ** 3
    ? 'low'
    : totalRamBytes < 8 * 1024 ** 3
      ? 'medium'
      : totalRamBytes < 16 * 1024 ** 3
        ? 'high'
        : 'server'

  return {
    cpus: cpuList.map((cpu) => ({ model: cpu.model, cores: cpu.times ? 1 : 1, speedMHz: cpu.speed })),
    totalRamBytes,
    freeRamBytes,
    platform: platform(),
    arch: arch(),
    release: release(),
    hostname: hostname(),
    tier,
    canRunOfflineModels: totalRamBytes >= 3 * 1024 ** 3,
  }
}

async function fetchOllamaTags(): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return []
    const payload = asRecord(await response.json())
    const models = Array.isArray(payload?.models) ? payload.models : []
    return models.map((raw) => {
      const model = asRecord(raw) ?? {}
      const name = readString(model.name) ?? ''
      const sizeBytes = typeof model.size === 'number' ? model.size : 0
      const digest = readString(model.digest) ?? ''
      const modifiedAt = readString(model.modified_at) ?? ''
      return { name, sizeBytes, digest, modifiedAt }
    }).filter((m) => m.name.length > 0)
  } catch {
    return []
  }
}

async function isOllamaReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return response.ok
  } catch {
    return false
  }
}

async function pullOllamaModel(name: string): Promise<{ started: boolean; error?: string }> {
  if (!name.trim()) return { started: false, error: 'Model name is required' }
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), stream: false }),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      return { started: false, error: readString(asRecord(payload)?.error) ?? `Ollama pull failed (${response.status})` }
    }
    return { started: true }
  } catch (error) {
    return { started: false, error: getErrorMessage(error, 'Ollama pull failed') }
  }
}

async function searchHuggingFaceModels(query: string, limit: number): Promise<Array<Record<string, unknown>>> {
  if (!query.trim()) return []
  const params = new URLSearchParams({ search: query.trim(), limit: String(Math.min(Math.max(limit, 1), 25)) })
  params.set('sort', 'downloads')
  params.set('direction', '-1')
  try {
    const response = await fetch(`${HF_SEARCH_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'codexapp/0.1' },
    })
    if (!response.ok) return []
    const rows = await response.json() as unknown
    if (!Array.isArray(rows)) return []
    return rows
  } catch {
    return []
  }
}

export function buildSuggestionFromHfRow(row: Record<string, unknown>): ModelSuggestion | null {
  const id = readString(row.id)
  if (!id) return null
  const sizeInfo = asRecord(row.safetensors)
  const paramsText = readString(sizeInfo?.parameters) ?? readString(row.params) ?? ''
  let ramHintBytes = 0
  let sizeLabel = 'unknown size'
  if (paramsText) {
    const match = /([\d.]+)([KMGT]?)B/i.exec(paramsText)
    if (match) {
      const value = parseFloat(match[1])
      const unit = match[2].toUpperCase()
      const multiplier = unit === 'T' ? 1000 : unit === 'G' ? 1 : unit === 'M' ? 0.001 : 1
      const billons = value * multiplier
      ramHintBytes = Math.round(billons * 2 * 1024 ** 3)
      sizeLabel = `~${formatBytes(ramHintBytes)} RAM`
    }
  }
  const gated = readString(row.gated) === 'true'
  const downloads = typeof row.downloads === 'number' ? row.downloads : 0
  return {
    name: id,
    kind: 'huggingface',
    source: 'HuggingFace',
    sizeLabel: gated ? `${sizeLabel} · gated` : sizeLabel,
    ramHintBytes,
    description: `${formatDownloads(downloads)} downloads · ${readString(row.pipeline_tag) ?? 'text-generation'}`,
  }
}

const DEFAULT_OLLAMA_MODELS = [
  { name: 'llama3.2:1b', sizeLabel: '~0.7 GB', ramHintBytes: 1 * 1024 ** 3, description: 'Fastest small model for low-end devices' },
  { name: 'llama3.2:3b', sizeLabel: '~2 GB', ramHintBytes: 3 * 1024 ** 3, description: 'Balanced small model for casual chat' },
  { name: 'qwen2.5:1.5b', sizeLabel: '~1 GB', ramHintBytes: 2 * 1024 ** 3, description: 'Efficient multilingual small model' },
  { name: 'phi3:mini', sizeLabel: '~2 GB', ramHintBytes: 3 * 1024 ** 3, description: 'Reasoning-focused small model' },
  { name: 'llama3.1:8b', sizeLabel: '~4.7 GB', ramHintBytes: 6 * 1024 ** 3, description: 'Strong general-purpose model' },
  { name: 'mistral:7b', sizeLabel: '~4.1 GB', ramHintBytes: 6 * 1024 ** 3, description: 'Fast, widely compatible 7B model' },
  { name: 'qwen2.5:7b', sizeLabel: '~4.4 GB', ramHintBytes: 6 * 1024 ** 3, description: 'High-quality multilingual 7B model' },
  { name: 'gemma2:9b', sizeLabel: '~5.5 GB', ramHintBytes: 8 * 1024 ** 3, description: 'Google Gemma 2, strong quality' },
  { name: 'codellama:7b', sizeLabel: '~4 GB', ramHintBytes: 6 * 1024 ** 3, description: 'Code-focused 7B model' },
  { name: 'deepseek-coder-v2:16b', sizeLabel: '~9 GB', ramHintBytes: 14 * 1024 ** 3, description: 'Code + reasoning for bigger machines' },
  { name: 'llama3.1:70b', sizeLabel: '~40 GB', ramHintBytes: 48 * 1024 ** 3, description: 'Large model for powerful servers' },
]

export function suggestModelsForHardware(hardware: HardwareProfile, ollamaModels: OllamaModel[]): ModelSuggestion[] {
  const installed = new Set(ollamaModels.map((m) => m.name))
  const totalRam = hardware.totalRamBytes
  const suggestions: ModelSuggestion[] = []

  for (const model of DEFAULT_OLLAMA_MODELS) {
    if (installed.has(model.name)) continue
    if (model.ramHintBytes <= totalRam * 0.9) {
      suggestions.push({ ...model, kind: 'ollama', source: 'Ollama' })
    }
  }

  // Always offer at least the smallest model on low-tier devices
  if (hardware.tier === 'low' && !installed.has('llama3.2:1b')) {
    const smallest = DEFAULT_OLLAMA_MODELS[0]
    if (!suggestions.find((s) => s.name === smallest.name)) {
      suggestions.unshift({ ...smallest, kind: 'ollama', source: 'Ollama' })
    }
  }

  return suggestions
}

async function fetchProviderModelIds(provider: ProviderRecord): Promise<string[]> {
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  const modelsUrl = `${baseUrl}/models`
  const headers: Record<string, string> = {}
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`
  }
  const response = await fetch(modelsUrl, {
    headers,
    signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Provider returned ${response.status}`)
  const payload = asRecord(await response.json())
  const dataRows = Array.isArray(payload?.data) ? payload.data : null
  const modelRows = Array.isArray(payload?.models) ? payload.models : null
  const rows = dataRows?.length ? dataRows : modelRows?.length ? modelRows : dataRows ?? modelRows
  if (!rows) throw new Error('Provider /models payload is missing a data/models array')

  const ids: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const entry = asRecord(row)
    const candidate = readString(row)
      ?? readString(entry?.id)
      ?? readString(entry?.model)
      ?? readString(entry?.slug)
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    ids.push(candidate)
  }
  return ids
}

async function activateProvider(record: ProviderRecord): Promise<void> {
  try {
    const modelIds = await fetchProviderModelIds(record)
    record.modelIds = modelIds
    record.active = true
    record.activationError = null
    record.lastSyncedAt = new Date().toISOString()
  } catch (error) {
    record.active = false
    record.activationError = getErrorMessage(error, 'Activation failed')
    record.modelIds = []
  }
}

async function syncProviderModels(record: ProviderRecord): Promise<void> {
  if (!record.active) return
  try {
    record.modelIds = await fetchProviderModelIds(record)
    record.lastSyncedAt = new Date().toISOString()
    record.activationError = null
  } catch (error) {
    record.activationError = getErrorMessage(error, 'Sync failed')
  }
}

async function syncAllProviders(): Promise<void> {
  const config = loadConfig()
  await Promise.all(config.providers.map(syncProviderModels))
  saveConfig(config)
}

let syncTimer: ReturnType<typeof setInterval> | null = null

function ensureSyncTimer(): void {
  if (syncTimer) return
  syncTimer = setInterval(() => {
    void syncAllProviders().catch(() => {})
  }, MODEL_SYNC_INTERVAL_MS)
  if (typeof syncTimer.unref === 'function') syncTimer.unref()
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`
}

function formatDownloads(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

export function getAiModelSyncTimerStatus(): { running: boolean } {
  return { running: Boolean(syncTimer) }
}

export function runAiModelsPeriodicSyncNow(): Promise<void> {
  ensureSyncTimer()
  return syncAllProviders()
}

export async function handleAiModelsRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith(AI_MODELS_API_PREFIX)) return false

  try {
    const path = url.pathname.slice(AI_MODELS_API_PREFIX.length) || '/'

    if (req.method === 'GET' && path === '/status') {
      ensureSyncTimer()
      const config = loadConfig()
      const hardware = scanHardware()
      const [ollamaReachable, ollamaModels] = await Promise.all([isOllamaReachable(), fetchOllamaTags()])
      setJson(res, 200, {
        hardware,
        ollama: {
          reachable: ollamaReachable,
          baseUrl: OLLAMA_BASE_URL,
          models: ollamaModels,
        },
        providers: config.providers.map(sanitizeProvider),
        syncTimerRunning: Boolean(syncTimer),
        syncIntervalMs: MODEL_SYNC_INTERVAL_MS,
      })
      return true
    }

    if (req.method === 'GET' && path === '/hardware') {
      setJson(res, 200, scanHardware())
      return true
    }

    if (req.method === 'GET' && path === '/suggestions') {
      const config = loadConfig()
      const hardware = scanHardware()
      const ollamaModels = await fetchOllamaTags()
      const suggestions = suggestModelsForHardware(hardware, ollamaModels)
      const activeProviders = config.providers.filter((p) => p.active)
      setJson(res, 200, { hardware, suggestions, activeProviders: activeProviders.map(sanitizeProvider) })
      return true
    }

    if (req.method === 'GET' && path === '/ollama/models') {
      setJson(res, 200, { reachable: await isOllamaReachable(), models: await fetchOllamaTags() })
      return true
    }

    if (req.method === 'POST' && path === '/ollama/pull') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const name = readString(body.name)
      if (!name) {
        setJson(res, 400, { error: 'Missing model name' })
        return true
      }
      const result = await pullOllamaModel(name)
      setJson(res, result.started ? 200 : 502, result)
      return true
    }

    if (req.method === 'GET' && path === '/huggingface/search') {
      const query = url.searchParams.get('q') ?? ''
      const limit = parseInt(url.searchParams.get('limit') ?? '20', 10)
      const rows = await searchHuggingFaceModels(query, limit)
      const results = rows
        .map((row) => buildSuggestionFromHfRow(row))
        .filter((s): s is ModelSuggestion => s !== null)
      setJson(res, 200, { query, results })
      return true
    }

    if (req.method === 'GET' && path === '/providers') {
      const config = loadConfig()
      setJson(res, 200, { providers: config.providers.map(sanitizeProvider) })
      return true
    }

    if (req.method === 'POST' && path === '/providers') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const name = readString(body.name)
      const baseUrl = readString(body.baseUrl)
      if (!name || !baseUrl) {
        setJson(res, 400, { error: 'Name and base URL are required' })
        return true
      }
      const apiKey = readString(body.apiKey)
      if (!apiKey) {
        setJson(res, 400, { error: 'An API key is required to activate the provider' })
        return true
      }
      const config = loadConfig()
      const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`
      const record: ProviderRecord = {
        id,
        name,
        baseUrl,
        wireApi: readString(body.wireApi) ?? 'chat',
        apiKey,
        active: false,
        lastSyncedAt: null,
        modelIds: [],
        activationError: null,
      }
      await activateProvider(record)
      config.providers.push(record)
      saveConfig(config)
      ensureSyncTimer()
      setJson(res, 200, { provider: sanitizeProvider(record), activated: record.active })
      return true
    }

    if (req.method === 'POST' && path === '/providers/refresh') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const id = readString(body.id)
      const config = loadConfig()
      const record = config.providers.find((p) => p.id === id)
      if (!record) {
        setJson(res, 404, { error: `Provider "${id}" not found` })
        return true
      }
      await activateProvider(record)
      saveConfig(config)
      setJson(res, 200, { provider: sanitizeProvider(record), activated: record.active })
      return true
    }

    if (req.method === 'DELETE' && path === '/providers') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const id = readString(body.id)
      const config = loadConfig()
      const index = config.providers.findIndex((p) => p.id === id)
      if (index === -1) {
        setJson(res, 404, { error: `Provider "${id}" not found` })
        return true
      }
      config.providers.splice(index, 1)
      saveConfig(config)
      setJson(res, 200, { success: true })
      return true
    }

    setJson(res, 404, { error: 'Unknown ai-models endpoint' })
    return true
  } catch (error) {
    setJson(res, 500, { error: getErrorMessage(error, 'AI models error') })
    return true
  }
}
