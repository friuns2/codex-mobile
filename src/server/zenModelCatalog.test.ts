import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildZenModelCatalog, clearZenModelCatalogCache, getZenModelCatalog } from './zenModelCatalog'

const live = { data: [{ id: 'muse' }, { id: 'pickle' }, { id: 'no-tools' }, { id: 'unknown' }, { id: 'retired' }] }
const metadata = { opencode: { npm: '@ai-sdk/openai-compatible', models: {
  muse: { provider: { npm: '@ai-sdk/openai' }, cost: { input: 0, output: 0 }, tool_call: true },
  pickle: { cost: { input: 0, output: 0 }, tool_call: true },
  'no-tools': { tool_call: false }, retired: { status: 'deprecated' },
} } }
afterEach(() => { clearZenModelCatalogCache(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('Zen model catalog', () => {
  it('uses model SDK overrides, live intersection, real pricing and unknown capabilities', () => {
    const models = buildZenModelCatalog(live, metadata)
    expect(models.map(m => [m.id, m.upstreamApi, m.free, m.supportsTools])).toEqual([
      ['muse', 'responses', true, true], ['pickle', 'chat-completions', true, true],
      ['no-tools', 'chat-completions', false, false], ['unknown', 'unknown', false, null],
    ])
  })
  it('deduplicates concurrent refreshes and caches without per-message requests', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('models.dev') ? metadata : live)))
    vi.stubGlobal('fetch', fetcher)
    const results = await Promise.all(Array.from({ length: 20 }, () => getZenModelCatalog()))
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(results[0]).toBe(results[19])
    await getZenModelCatalog()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('uses bounded last-known-good data on failure and backs off cold failures', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('models.dev') ? metadata : live)))
    vi.stubGlobal('fetch', fetcher)
    await getZenModelCatalog()
    vi.advanceTimersByTime(300_001)
    fetcher.mockRejectedValue(new Error('offline'))
    expect(await getZenModelCatalog()).toHaveLength(4)
    await getZenModelCatalog()
    expect(fetcher).toHaveBeenCalledTimes(4)
    clearZenModelCatalogCache()
    await expect(getZenModelCatalog()).rejects.toThrow('offline')
    await expect(getZenModelCatalog()).rejects.toThrow('retry shortly')
    expect(fetcher).toHaveBeenCalledTimes(6)
  })
})
