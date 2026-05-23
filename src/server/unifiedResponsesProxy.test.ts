import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import {
  chatCompletionToResponsesFormat,
  handleUnifiedResponsesProxyRequest,
  responsesInputToMessages,
} from './unifiedResponsesProxy'

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        resolve(address.port)
      } else {
        reject(new Error('test server did not bind to a TCP port'))
      }
    })
  })
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

describe('unified responses proxy reasoning_content translation', () => {
  it('preserves DeepSeek reasoning_content in translated Responses output', () => {
    const response = chatCompletionToResponsesFormat({
      id: 'chatcmpl-test',
      created: 123,
      choices: [{
        message: {
          role: 'assistant',
          reasoning_content: 'thinking trace',
          content: 'Hello.',
        },
      }],
    }, 'big-pickle')

    expect(response.output).toEqual([
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hello.' }],
        status: 'completed',
      },
      {
        type: 'reasoning',
        id: expect.stringMatching(/^rs_/),
        summary: [],
        content: [{ type: 'reasoning_text', text: 'thinking trace' }],
      },
    ])
  })

  it('passes prior reasoning items back as assistant reasoning_content', () => {
    const messages = responsesInputToMessages([
      {
        type: 'reasoning',
        id: 'rs_test',
        summary: [],
        content: [{ type: 'reasoning_text', text: 'thinking trace' }],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hello.' }],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'again' }],
      },
    ])

    expect(messages).toEqual([
      { role: 'assistant', content: 'Hello.', reasoning_content: 'thinking trace' },
      { role: 'user', content: 'again' },
    ])
  })

  it('passes reasoning_content back on assistant tool-call messages', () => {
    const messages = responsesInputToMessages([
      {
        type: 'reasoning',
        id: 'rs_test',
        summary: [],
        content: [{ type: 'reasoning_text', text: 'thinking before tool' }],
      },
      {
        type: 'function_call',
        call_id: 'call_test',
        name: 'exec_command',
        arguments: '{"cmd":"pwd"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_test',
        output: 'ok',
      },
    ])

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'thinking before tool',
        tool_calls: [{
          id: 'call_test',
          type: 'function',
          function: { name: 'exec_command', arguments: '{"cmd":"pwd"}' },
        }],
      },
      {
        role: 'tool',
        tool_call_id: 'call_test',
        content: 'ok',
      },
    ])
  })

  it('forces non-stream upstream requests when chat-formatted tool requests cannot be streamed', async () => {
    let upstreamRequest: Record<string, unknown> | null = null
    const upstream = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        upstreamRequest = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 'chatcmpl-test',
          created: 123,
          choices: [{ message: { role: 'assistant', content: 'ok' } }],
        }))
      })
    })
    const upstreamPort = await listen(upstream)

    const proxy = createServer((req, res) => {
      handleUnifiedResponsesProxyRequest(req, res, {
        bearerToken: '',
        requireBearerToken: false,
        wireApi: 'responses',
        responsesEndpoint: `http://127.0.0.1:${upstreamPort}/v1/responses`,
        chatCompletionsEndpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`,
        missingKeyMessage: 'missing',
        allowToolFallbackToResponses: false,
        responsesPayloadFormat: 'chat',
      })
    })
    const proxyPort = await listen(proxy)

    try {
      const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'big-pickle',
          stream: true,
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
          tools: [{ type: 'function', name: 'exec_command', parameters: { type: 'object' } }],
        }),
      })

      expect(response.status).toBe(200)
      expect((upstreamRequest as Record<string, unknown> | null)?.stream).toBe(false)
    } finally {
      await close(proxy)
      await close(upstream)
    }
  })

  it('applies provider-specific upstream headers', async () => {
    let upstreamHeaders: Record<string, string | string[] | undefined> | null = null
    const upstream = createServer((req, res) => {
      upstreamHeaders = req.headers
      req.resume()
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 'chatcmpl-test',
          created: 123,
          choices: [{ message: { role: 'assistant', content: 'ok' } }],
        }))
      })
    })
    const upstreamPort = await listen(upstream)

    const proxy = createServer((req, res) => {
      handleUnifiedResponsesProxyRequest(req, res, {
        bearerToken: '',
        requireBearerToken: false,
        wireApi: 'responses',
        responsesEndpoint: `http://127.0.0.1:${upstreamPort}/v1/responses`,
        chatCompletionsEndpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`,
        missingKeyMessage: 'missing',
        allowToolFallbackToResponses: false,
        responsesPayloadFormat: 'chat',
        upstreamHeaders: () => ({
          'Authorization': 'Bearer public',
          'User-Agent': 'opencode/1.15.9 ai-sdk/provider-utils/4.0.23 runtime/node/22.22.3',
          'X-Opencode-Client': 'cli',
          'X-Opencode-Request': 'msg_test',
          'X-Opencode-Session': 'ses_test',
        }),
      })
    })
    const proxyPort = await listen(proxy)

    try {
      const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'big-pickle',
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      })

      expect(response.status).toBe(200)
      const capturedHeaders = upstreamHeaders as Record<string, string | string[] | undefined> | null
      expect(capturedHeaders?.authorization).toBe('Bearer public')
      expect(capturedHeaders?.['user-agent']).toBe('opencode/1.15.9 ai-sdk/provider-utils/4.0.23 runtime/node/22.22.3')
      expect(capturedHeaders?.['x-opencode-client']).toBe('cli')
      expect(capturedHeaders?.['x-opencode-request']).toBe('msg_test')
      expect(capturedHeaders?.['x-opencode-session']).toBe('ses_test')
    } finally {
      await close(proxy)
      await close(upstream)
    }
  })

  it('returns 500 when provider-specific upstream headers fail', async () => {
    const proxy = createServer((req, res) => {
      handleUnifiedResponsesProxyRequest(req, res, {
        bearerToken: '',
        requireBearerToken: false,
        wireApi: 'responses',
        responsesEndpoint: 'http://127.0.0.1:1/v1/responses',
        chatCompletionsEndpoint: 'http://127.0.0.1:1/v1/chat/completions',
        missingKeyMessage: 'missing',
        allowToolFallbackToResponses: false,
        responsesPayloadFormat: 'chat',
        upstreamHeaders: () => {
          throw new Error('header failure')
        },
      })
    })
    const proxyPort = await listen(proxy)

    try {
      const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'big-pickle',
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        }),
      })
      const body = await response.json() as { error?: { message?: string } }

      expect(response.status).toBe(500)
      expect(body.error?.message).toBe('Upstream header hook error')
    } finally {
      await close(proxy)
    }
  })
})
