import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeZenResponsesRequest, resolveZenWireApi } from './zenProxy'
import { clearZenModelCatalogCache } from './zenModelCatalog'
import { createZenToolAliasStream } from './zenToolAliases'

const shell = { type: 'function', name: 'exec_command', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } }
afterEach(() => { vi.unstubAllGlobals(); clearZenModelCatalogCache() })
describe('OpenCode Zen normalization', () => {
  it('aliases required tools to an executable shell with its real schema, without mutating input', () => {
    const tools = [shell]
    const aliases = new Map<string, string>()
    const normalized = normalizeZenResponsesRequest({ tools, stream: false }, aliases)
    expect(normalized.stream).toBe(true)
    expect(normalized.store).toBe(false)
    expect(normalized.tool_choice).toBe('auto')
    expect(normalized.tools).toEqual(expect.arrayContaining(['bash', 'read'].map(name => expect.objectContaining({ name, parameters: shell.parameters }))))
    expect(tools).toHaveLength(1)
    expect([...aliases]).toEqual([['bash', 'exec_command'], ['read', 'exec_command']])
  })
  it('does not duplicate supplied tools and rejects dummy tools', () => {
    expect((normalizeZenResponsesRequest({ tools: [{ type: 'function', name: 'bash' }, { type: 'function', name: 'read' }] }).tools as unknown[])).toHaveLength(2)
    expect(() => normalizeZenResponsesRequest({})).toThrow('No dummy tools')
  })
  it('restores executable names in both protocol streams', async () => {
    const stream = createZenToolAliasStream(new Map([['read', 'exec_command']]))
    stream.end('data: {"item":{"type":"function_call","name":"read"}}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"read"}}]}}]}\n\n')
    let text = ''
    for await (const chunk of stream) text += chunk
    expect(text.match(/exec_command/g)).toHaveLength(2)
  })
  it('routes by model and rejects unknown routes, incompatible tools and opaque history', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('models.dev') ? {
      opencode: { npm: '@ai-sdk/openai-compatible', models: { muse: { provider: { npm: '@ai-sdk/openai' }, tool_call: true }, pickle: { tool_call: true }, jev: { tool_call: false } } },
    } : { data: [{ id: 'muse' }, { id: 'pickle' }, { id: 'jev' }] }))))
    expect(await resolveZenWireApi({ model: 'muse', input: 'hi' })).toBe('responses')
    expect(await resolveZenWireApi({ model: 'pickle', input: 'hi' })).toBe('chat')
    await expect(resolveZenWireApi({ model: 'missing', input: 'hi' })).rejects.toThrow('No supported')
    await expect(resolveZenWireApi({ model: 'jev', input: 'hi' })).rejects.toThrow('does not support')
    await expect(resolveZenWireApi({ model: 'muse', input: 'hi', previous_response_id: 'resp_old' })).rejects.toThrow('full conversation')
    await expect(resolveZenWireApi({ model: 'pickle', input: [{ type: 'message', role: 'user', content: [{ type: 'input_audio' }] }] })).rejects.toThrow('Content type')
  })
})
