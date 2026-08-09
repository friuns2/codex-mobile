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

export interface AiModelsStatus {
  hardware: HardwareProfile
  ollama: {
    reachable: boolean
    baseUrl: string
    models: OllamaModel[]
  }
  providers: CloudModelProvider[]
  syncTimerRunning: boolean
  syncIntervalMs: number
}

export interface SuggestionsResponse {
  hardware: HardwareProfile
  suggestions: ModelSuggestion[]
  activeProviders: CloudModelProvider[]
}

export async function aiModelsGetStatus(): Promise<AiModelsStatus> {
  const res = await fetch('/codex-api/ai-models/status')
  if (!res.ok) throw new Error('Failed to fetch AI models status')
  return res.json()
}

export async function aiModelsGetSuggestions(): Promise<SuggestionsResponse> {
  const res = await fetch('/codex-api/ai-models/suggestions')
  if (!res.ok) throw new Error('Failed to fetch model suggestions')
  return res.json()
}

export async function aiModelsPullOllamaModel(name: string): Promise<void> {
  const res = await fetch('/codex-api/ai-models/ollama/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.error ?? 'Failed to pull Ollama model')
  }
}

export async function aiModelsSearchHuggingFace(
  query: string,
  limit = 20,
): Promise<{ query: string; results: ModelSuggestion[] }> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const res = await fetch(`/codex-api/ai-models/huggingface/search?${params}`)
  if (!res.ok) throw new Error('Failed to search HuggingFace')
  return res.json()
}

export async function aiModelsAddProvider(input: {
  name: string
  baseUrl: string
  apiKey: string
  wireApi?: string
}): Promise<{ provider: CloudModelProvider; activated: boolean }> {
  const res = await fetch('/codex-api/ai-models/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.error ?? 'Failed to add AI provider')
  }
  return res.json()
}

export async function aiModelsRefreshProvider(id: string): Promise<{ provider: CloudModelProvider; activated: boolean }> {
  const res = await fetch('/codex-api/ai-models/providers/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error('Failed to refresh provider')
  return res.json()
}

export async function aiModelsRemoveProvider(id: string): Promise<void> {
  const res = await fetch('/codex-api/ai-models/providers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error('Failed to remove provider')
}
