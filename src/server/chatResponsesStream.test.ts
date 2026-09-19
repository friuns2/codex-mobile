import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { handleUnifiedResponsesProxyRequest } from './unifiedResponsesProxy'

const servers: Server[] = []
async function listen(server: Server): Promise<string> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()) }))) })
const events = (text: string) => text.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5)))
const frame = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`
async function setup(stream: string, requests: Array<{ url?: string; body: any }> = []) {
  const upstream = await listen(createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    requests.push({ url: req.url, body: JSON.parse(body) })
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    // Split arbitrary UTF-8 bytes and frames, including the emoji.
    const bytes = Buffer.from(stream)
    for (let i = 0; i < bytes.length; i += 7) res.write(bytes.subarray(i, i + 7))
    res.end()
  }))
  return listen(createServer((req, res) => handleUnifiedResponsesProxyRequest(req, res, {
    bearerToken: '', requireBearerToken: false, wireApi: 'responses',
    resolveWireApi: async payload => payload.model === 'muse' ? 'responses' : 'chat',
    streamToolCalls: true, allowToolFallbackToResponses: false, missingKeyMessage: '',
    responsesEndpoint: `${upstream}/responses`, chatCompletionsEndpoint: `${upstream}/chat/completions`,
  })))
}
const send = (url: string, model = 'pickle', extra = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }], stream: true, ...extra }) })
describe('hybrid Responses proxy', () => {
  it('streams tool arguments with stable IDs, reasoning, UTF-8 text and usage', async () => {
    const requests: Array<{ url?: string; body: any }> = []
    const url = await setup(frame({ reasoning_content: 'Think' }) + frame({ content: 'Hello 👋' }) + frame({ tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'exec_command', arguments: '{"cmd":' } }] }) + frame({ tool_calls: [{ index: 0, function: { arguments: '"pwd"}' } }] }, 'tool_calls') + 'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\ndata: [DONE]\n\n', requests)
    const response = await send(url, 'pickle', { tools: [{ type: 'function', name: 'exec_command', parameters: { type: 'object' } }] })
    const result = events(await response.text())
    expect(requests[0].url).toBe('/chat/completions')
    expect(requests[0].body.stream).toBe(true)
    expect(requests[0].body.messages[0].content).toBe('hi')
    const added = result.find(e => e.type === 'response.created')
    const completed = result.find(e => e.type === 'response.completed').response
    expect(completed.id).toBe(added.response.id)
    expect(completed.usage.total_tokens).toBe(15)
    expect(completed.output).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'function_call', call_id: 'call_a', name: 'exec_command', arguments: '{"cmd":"pwd"}' })]))
    expect(result.find(e => e.type === 'response.output_text.delta').delta).toBe('Hello 👋')
    expect(result.filter(e => e.type === 'response.function_call_arguments.delta')).toHaveLength(2)
    // Replay tool outputs through the same chat route.
    await (await send(url, 'pickle', { input: [...completed.output, { type: 'function_call_output', call_id: 'call_a', output: '/tmp' }] })).text()
    expect(requests[1].body.messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call_a', content: '/tmp' })
  })
  it('reports truncated and error streams as failures, never completed', async () => {
    for (const stream of [frame({ content: 'partial' }), 'data: {"error":{"message":"rate limited"}}\n\n']) {
      const result = events(await (await send(await setup(stream))).text())
      expect(result.some(e => e.type === 'response.failed')).toBe(true)
      expect(result.some(e => e.type === 'response.completed')).toBe(false)
    }
  })
  it('preserves token-limit finish status', async () => {
    const result = events(await (await send(await setup(frame({ content: 'partial' }, 'length')))).text())
    expect(result.at(-1).type).toBe('response.incomplete')
    expect(result.at(-1).response.incomplete_details.reason).toBe('max_output_tokens')
  })
  it('isolates concurrent routes and passes through Responses events', async () => {
    const requests: Array<{ url?: string; body: any }> = []
    const raw = 'data: {"type":"response.completed","response":{"status":"completed"}}\n\n'
    const url = await setup(raw, requests)
    await Promise.all(['muse', 'pickle', 'muse'].map(async model => (await send(url, model)).text()))
    expect(requests.filter(r => r.url === '/responses')).toHaveLength(2)
    expect(requests.filter(r => r.url === '/chat/completions')).toHaveLength(1)
    expect(await (await send(url, 'muse')).text()).toBe(raw)
  })
})
