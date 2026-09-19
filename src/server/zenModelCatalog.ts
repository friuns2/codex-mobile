import type { ZenModelMetadata } from '../types/zenModels.js'

const TTL_MS = 5 * 60_000
const FAILURE_TTL_MS = 30_000
const MAX_STALE_MS = 24 * 60 * 60_000
const entries = new Map<string, { at: number; retryAt: number; data: ZenModelMetadata[]; pending?: Promise<ZenModelMetadata[]> }>()

type CatalogModel = {
  name?: string
  status?: string
  provider?: { npm?: string }
  cost?: { input?: number; output?: number }
  tool_call?: boolean
  modalities?: { input?: string[] }
  reasoning_options?: unknown[]
}

export function buildZenModelCatalog(live: unknown, metadata: unknown, now = Date.now()): ZenModelMetadata[] {
  const rows = (live as { data?: Array<{ id?: string }> })?.data
  const provider = (metadata as { opencode?: { npm?: string; models?: Record<string, CatalogModel> } })?.opencode
  if (!Array.isArray(rows) || !provider?.models) throw new Error('Invalid Zen model catalog')
  return [...new Set(rows.map(row => row?.id).filter((id): id is string => typeof id === 'string' && !!id))].flatMap(id => {
    const model = provider.models![id]
    if (model?.status === 'deprecated') return []
    const sdk = model?.provider?.npm ?? provider.npm
    // Never infer an unknown model's endpoint solely from the provider default.
    const upstreamApi = !model ? 'unknown' : sdk === '@ai-sdk/openai' ? 'responses'
      : sdk === '@ai-sdk/openai-compatible' ? 'chat-completions' : 'unknown'
    return [{
      id, name: model?.name ?? id, upstreamApi, routingSource: 'sdk-metadata' as const,
      supportsTools: typeof model?.tool_call === 'boolean' ? model.tool_call : null,
      inputModalities: model?.modalities?.input ?? null,
      reasoningOptions: model?.reasoning_options ?? [],
      free: model?.cost?.input === 0 && model?.cost?.output === 0,
      discoveredAt: new Date(now).toISOString(),
    }]
  })
}

export async function getZenModelCatalog(apiKey = ''): Promise<ZenModelMetadata[]> {
  // Bound per-credential caches; never expose credentials in diagnostics or responses.
  const key = apiKey && apiKey !== 'dummy' ? apiKey : 'public'
  let entry = entries.get(key)
  const now = Date.now()
  if (entry?.pending) return entry.pending
  if (entry && now < entry.retryAt) {
    if (entry.data.length && now - entry.at < MAX_STALE_MS) return entry.data
    throw new Error('Zen model discovery unavailable; retry shortly')
  }
  if (!entry) {
    if (entries.size >= 8) entries.delete(entries.keys().next().value!)
    entry = { at: 0, retryAt: 0, data: [] }
    entries.set(key, entry)
  }
  const current = entry
  current.pending = (async () => {
    try {
      const [live, metadata] = await Promise.all([
        fetch('https://opencode.ai/zen/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) }),
        fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(4000) }),
      ])
      if (!live.ok || !metadata.ok) throw new Error('Zen model discovery returned a non-success status')
      current.data = buildZenModelCatalog(await live.json(), await metadata.json())
      current.at = Date.now()
      current.retryAt = current.at + TTL_MS
      return current.data
    } catch (error) {
      current.retryAt = Date.now() + FAILURE_TTL_MS
      if (current.data.length && Date.now() - current.at < MAX_STALE_MS) return current.data
      throw error
    } finally { current.pending = undefined }
  })()
  return current.pending
}

export function clearZenModelCatalogCache(): void { entries.clear() }
