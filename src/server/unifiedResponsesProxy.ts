import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

type ResponsesApiInput = {
  id?: string
  type: string
  role?: string
  content?: string | Array<{ type?: string; text?: string }>
  summary?: Array<{ type?: string; text?: string }>
  text?: string
  name?: string
  arguments?: string
  call_id?: string
  output?: unknown
}

type ResponsesApiRequest = {
  model: string
  input: string | ResponsesApiInput[]
  instructions?: string
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  stream?: boolean
  tools?: unknown
  tool_choice?: unknown
  [key: string]: unknown
}

type ChatMessage = {
  role: string
  content?: string
  reasoning_content?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

type ChatCompletionsRequest = {
  model: string
  messages: ChatMessage[]
  temperature?: number
  top_p?: number
  max_tokens?: number
  stream?: boolean
  tools?: Array<{
    type: 'function'
    function: { name: string; description?: string; parameters?: unknown }
  }>
  tool_choice?: string | { type: 'function'; function: { name: string } }
}

export type UnifiedProxyOptions = {
  bearerToken: string
  requireBearerToken?: boolean
  wireApi: 'responses' | 'chat'
  responsesEndpoint: string
  chatCompletionsEndpoint: string
  missingKeyMessage: string
  allowToolFallbackToResponses: boolean
  responsesPayloadFormat?: 'raw' | 'chat'
  sanitizeResponsesRequest?: (payload: Record<string, unknown>) => Record<string, unknown>
  upstreamHeaders?: (payload: string) => Record<string, string>
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function safeStringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? '')
  } catch {
    return String(value ?? '')
  }
}

function appendAssistantText(messages: ChatMessage[], text: string, reasoningContent?: string): void {
  const trimmedText = text.trim()
  const trimmedReasoningContent = reasoningContent?.trim() ?? ''
  if (!trimmedText && !trimmedReasoningContent) return

  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === 'assistant' && Array.isArray(lastMessage.tool_calls)) {
    lastMessage.content = lastMessage.content
      ? `${lastMessage.content}\n${trimmedText}`
      : trimmedText
    if (trimmedReasoningContent) {
      lastMessage.reasoning_content = lastMessage.reasoning_content
        ? `${lastMessage.reasoning_content}\n${trimmedReasoningContent}`
        : trimmedReasoningContent
    }
    return
  }

  messages.push({
    role: 'assistant',
    content: trimmedText,
    ...(trimmedReasoningContent ? { reasoning_content: trimmedReasoningContent } : {}),
  })
}

function appendAssistantToolCall(
  messages: ChatMessage[],
  toolCall: NonNullable<ChatMessage['tool_calls']>[number],
  reasoningContent?: string,
): void {
  const trimmedReasoningContent = reasoningContent?.trim() ?? ''
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === 'assistant' && !lastMessage.tool_call_id) {
    lastMessage.tool_calls = [...(lastMessage.tool_calls ?? []), toolCall]
    if (trimmedReasoningContent) {
      lastMessage.reasoning_content = lastMessage.reasoning_content
        ? `${lastMessage.reasoning_content}\n${trimmedReasoningContent}`
        : trimmedReasoningContent
    }
    return
  }

  messages.push({
    role: 'assistant',
    content: '',
    tool_calls: [toolCall],
    ...(trimmedReasoningContent ? { reasoning_content: trimmedReasoningContent } : {}),
  })
}

function extractTextParts(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
      ? (part as { text: string }).text
      : ''))
    .filter((part) => part.length > 0)
    .join('\n')
}

export function responsesInputToMessages(input: string | ResponsesApiInput[], instructions?: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  let pendingReasoningContent = ''
  if (instructions) {
    messages.push({ role: 'system', content: instructions })
  }
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input })
    return messages
  }

  for (const item of input) {
    if (!item || typeof item !== 'object') continue

    if (item.type === 'reasoning') {
      const content = extractTextParts(item.content)
      const summary = extractTextParts(item.summary)
      const text = content || summary
      if (text) {
        const lastMessage = messages[messages.length - 1]
        if (lastMessage?.role === 'assistant') {
          lastMessage.reasoning_content = lastMessage.reasoning_content
            ? `${lastMessage.reasoning_content}\n${text}`
            : text
        } else {
          pendingReasoningContent = pendingReasoningContent
            ? `${pendingReasoningContent}\n${text}`
            : text
        }
      }
      continue
    }

    if (item.type === 'message' && item.role) {
      const content = item.content
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .map((part) => (typeof part?.text === 'string' ? part.text : ''))
              .filter((part) => part.length > 0)
              .join('\n')
          : (typeof item.text === 'string' ? item.text : '')
      const role = item.role === 'developer' ? 'system' : item.role
      if (role === 'assistant') {
        appendAssistantText(messages, text, pendingReasoningContent)
        pendingReasoningContent = ''
      } else {
        messages.push({ role, content: text })
      }
      continue
    }

    if ((item.type === 'function_call_output' || item.type === 'computer_call_output') && item.call_id) {
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id,
        content: safeStringifyUnknown(item.output),
      })
      continue
    }

    if (item.type === 'function_call' && item.call_id && item.name) {
      appendAssistantToolCall(messages, {
        id: item.call_id,
        type: 'function',
        function: {
          name: item.name,
          arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
        },
      }, pendingReasoningContent)
      pendingReasoningContent = ''
    }
  }

  return messages
}

function responsesToolsToChatTools(tools: unknown): ChatCompletionsRequest['tools'] {
  if (!Array.isArray(tools)) return undefined
  const mapped = tools
    .map((tool) => {
      if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return null
      const row = tool as Record<string, unknown>
      if (row.type !== 'function') return null
      const name = typeof row.name === 'string' ? row.name : ''
      if (!name) return null
      const description = typeof row.description === 'string' ? row.description : undefined
      return {
        type: 'function' as const,
        function: {
          name,
          ...(description ? { description } : {}),
          ...(row.parameters !== undefined ? { parameters: row.parameters } : {}),
        },
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
  return mapped.length > 0 ? mapped : undefined
}

function responsesToolChoiceToChatToolChoice(toolChoice: unknown): ChatCompletionsRequest['tool_choice'] {
  if (typeof toolChoice === 'string') return toolChoice
  if (!toolChoice || typeof toolChoice !== 'object' || Array.isArray(toolChoice)) return undefined
  const row = toolChoice as Record<string, unknown>
  if (row.type !== 'function') return undefined
  const name = typeof row.name === 'string'
    ? row.name
    : (row.function && typeof row.function === 'object' && typeof (row.function as Record<string, unknown>).name === 'string')
      ? String((row.function as Record<string, unknown>).name)
      : ''
  if (!name) return undefined
  return { type: 'function', function: { name } }
}

export function chatCompletionToResponsesFormat(chatResponse: Record<string, unknown>, model: string): Record<string, unknown> {
  const choices = (chatResponse.choices ?? []) as Array<{
    message?: {
      content?: string
      reasoning_content?: string
      tool_calls?: Array<{
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
  const output: Array<Record<string, unknown>> = []

  for (const choice of choices) {
    const message = choice.message
    if (!message) continue

    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        if (!toolCall || toolCall.type !== 'function') continue
        const callId = typeof toolCall.id === 'string' && toolCall.id ? toolCall.id : `call_${Date.now()}`
        const name = typeof toolCall.function?.name === 'string' ? toolCall.function.name : ''
        if (!name) continue
        output.push({
          type: 'function_call',
          name,
          call_id: callId,
          arguments: typeof toolCall.function?.arguments === 'string' ? toolCall.function.arguments : '{}',
          status: 'completed',
        })
      }
    }

    if (message.content) {
      output.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: message.content }],
        status: 'completed',
      })
    }

    if (message.reasoning_content) {
      output.push({
        type: 'reasoning',
        id: `rs_${Date.now()}`,
        summary: [],
        content: [{ type: 'reasoning_text', text: message.reasoning_content }],
      })
    }
  }

  const usage = chatResponse.usage as Record<string, number> | undefined
  return {
    id: chatResponse.id ?? `resp_${Date.now()}`,
    object: 'response',
    created_at: chatResponse.created ?? Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output,
    usage: usage ? {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
    } : undefined,
  }
}

function forwardStreamingTextResponse(
  upstreamRes: IncomingMessage,
  res: ServerResponse,
  model: string,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  let buffer = ''
  const contentParts: string[] = []
  const reasoningParts: string[] = []
  let responseId = `resp_${Date.now()}`

  res.write(`data: {"type":"response.created","response":{"id":"${responseId}","object":"response","status":"in_progress","model":"${model}","output":[]}}\n\n`)
  res.write('data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","role":"assistant","content":[],"status":"in_progress"}}\n\n')
  res.write('data: {"type":"response.content_part.added","output_index":0,"content_index":0,"part":{"type":"output_text","text":""}}\n\n')

  upstreamRes.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data) as {
          id?: string
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>
        }
        if (parsed.id) responseId = `resp_${parsed.id}`
        const delta = parsed.choices?.[0]?.delta
        if (delta?.reasoning_content) {
          reasoningParts.push(delta.reasoning_content)
        }
        if (delta?.content) {
          contentParts.push(delta.content)
          const escaped = JSON.stringify(delta.content).slice(1, -1)
          res.write(`data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"${escaped}"}\n\n`)
        }
      } catch {
        // ignore malformed chunks
      }
    }
  })

  upstreamRes.on('end', () => {
    const fullText = contentParts.join('')
    const fullReasoningText = reasoningParts.join('')
    const escapedFull = JSON.stringify(fullText).slice(1, -1)
    const messageItem = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: fullText }], status: 'completed' }
    const output: Array<Record<string, unknown>> = [messageItem]
    if (fullReasoningText) {
      output.push({
        type: 'reasoning',
        id: `rs_${Date.now()}`,
        summary: [],
        content: [{ type: 'reasoning_text', text: fullReasoningText }],
      })
    }
    res.write(`data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"${escapedFull}"}\n\n`)
    res.write(`data: {"type":"response.content_part.done","output_index":0,"content_index":0,"part":{"type":"output_text","text":"${escapedFull}"}}\n\n`)
    res.write(`data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"${escapedFull}"}],"status":"completed"}}\n\n`)
    if (fullReasoningText) {
      const reasoningIndex = output.length - 1
      const reasoningItem = output[reasoningIndex]
      res.write(`data: ${JSON.stringify({ type: 'response.output_item.added', output_index: reasoningIndex, item: reasoningItem })}\n\n`)
      res.write(`data: ${JSON.stringify({ type: 'response.output_item.done', output_index: reasoningIndex, item: reasoningItem })}\n\n`)
    }
    res.write(`data: ${JSON.stringify({ type: 'response.completed', response: { id: responseId, object: 'response', status: 'completed', model, output } })}\n\n`)
    res.end()
  })

  upstreamRes.on('error', () => {
    if (!res.writableEnded) res.end()
  })
}

function sendSyntheticStreamingCompletion(
  res: ServerResponse,
  response: Record<string, unknown>,
): void {
  const responseId = typeof response.id === 'string' && response.id ? response.id : `resp_${Date.now()}`
  const model = typeof response.model === 'string' ? response.model : ''
  const output = Array.isArray(response.output) ? response.output : []
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  const createdPayload = {
    type: 'response.created',
    response: {
      id: responseId,
      object: 'response',
      status: 'in_progress',
      model,
      output: [],
    },
  }
  const completedPayload = {
    type: 'response.completed',
    response: {
      id: responseId,
      object: 'response',
      status: 'completed',
      model,
      output,
      usage: response.usage,
    },
  }
  res.write(`data: ${JSON.stringify(createdPayload)}\n\n`)
  output.forEach((item, index) => {
    res.write(`data: ${JSON.stringify({ type: 'response.output_item.added', output_index: index, item })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'response.output_item.done', output_index: index, item })}\n\n`)
  })
  res.write(`data: ${JSON.stringify(completedPayload)}\n\n`)
  res.end()
}

function copyProxyHeaders(upstreamHeaders: IncomingMessage['headers']): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    if (!value) continue
    const lower = key.toLowerCase()
    if (lower === 'transfer-encoding' || lower === 'content-length' || lower === 'connection') continue
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return headers
}

function hasToolOutputsInInput(input: string | ResponsesApiInput[]): boolean {
  if (!Array.isArray(input)) return false
  return input.some((item) => item?.type === 'function_call_output' || item?.type === 'computer_call_output')
}

export function handleUnifiedResponsesProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: UnifiedProxyOptions,
): void {
  void (async () => {
    try {
      if (options.requireBearerToken !== false && !options.bearerToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: options.missingKeyMessage } }))
        return
      }

      const rawBody = await readRequestBody(req)
      const parsedBody = JSON.parse(rawBody.toString()) as ResponsesApiRequest
      const hasTools = Array.isArray(parsedBody.tools) && parsedBody.tools.length > 0
      const hasToolOutputs = hasToolOutputsInInput(parsedBody.input)
      const useResponsesFallback = options.allowToolFallbackToResponses && (hasTools || hasToolOutputs)
      const useChatCompletions = options.wireApi === 'chat' && !useResponsesFallback
      const useChatPayload = useChatCompletions || options.responsesPayloadFormat === 'chat'
      const isStreaming = parsedBody.stream === true
      const effectiveStreaming = useChatPayload && isStreaming && !(hasTools || hasToolOutputs)

      let payload = ''
      let upstreamUrl: URL

      if (useChatPayload) {
        const chatReq: ChatCompletionsRequest = {
          model: parsedBody.model,
          messages: responsesInputToMessages(parsedBody.input, parsedBody.instructions),
          stream: effectiveStreaming,
        }
        if (parsedBody.temperature != null) chatReq.temperature = parsedBody.temperature
        if (parsedBody.top_p != null) chatReq.top_p = parsedBody.top_p
        if (parsedBody.max_output_tokens != null) chatReq.max_tokens = parsedBody.max_output_tokens
        const chatTools = responsesToolsToChatTools(parsedBody.tools)
        const chatToolChoice = responsesToolChoiceToChatToolChoice(parsedBody.tool_choice)
        if (chatTools) chatReq.tools = chatTools
        if (chatToolChoice) chatReq.tool_choice = chatToolChoice
        payload = JSON.stringify(chatReq)
        upstreamUrl = new URL(options.chatCompletionsEndpoint)
      } else {
        const requestBody =
          parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
            ? { ...(parsedBody as Record<string, unknown>) }
            : {}
        const sanitized = options.sanitizeResponsesRequest ? options.sanitizeResponsesRequest(requestBody) : requestBody
        payload = JSON.stringify(sanitized)
        upstreamUrl = new URL(options.responsesEndpoint)
      }

      const requestFn = upstreamUrl.protocol === 'http:' ? httpRequest : httpsRequest
      let upstreamHeaders: Record<string, string>
      try {
        upstreamHeaders = options.upstreamHeaders?.(payload) ?? {}
      } catch (error) {
        if (process.env.CODEXUI_PROXY_DEBUG === '1') {
          console.warn('[unified-responses-proxy] upstream header hook failed', error)
        }
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Upstream header hook error' } }))
        return
      }
      const proxyReq = requestFn({
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (upstreamUrl.protocol === 'http:' ? 80 : 443),
        path: upstreamUrl.pathname,
        method: 'POST',
        headers: {
          ...upstreamHeaders,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(options.bearerToken ? { 'Authorization': `Bearer ${options.bearerToken}` } : {}),
        },
      }, (upstreamRes) => {
        const status = upstreamRes.statusCode ?? 502
        if (useChatPayload && effectiveStreaming && status >= 200 && status < 300) {
          forwardStreamingTextResponse(upstreamRes, res, parsedBody.model)
          return
        }

        const chunks: Buffer[] = []
        upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk))
        upstreamRes.on('end', () => {
          const rawResponseBody = Buffer.concat(chunks).toString()
          if (!useChatPayload) {
            res.writeHead(status, copyProxyHeaders(upstreamRes.headers))
            res.end(rawResponseBody)
            return
          }

          try {
            const upstreamPayload = JSON.parse(rawResponseBody) as Record<string, unknown>
            if (upstreamPayload.error || status >= 400) {
              if (process.env.CODEXUI_PROXY_DEBUG === '1') {
                console.warn('[unified-responses-proxy]', JSON.stringify({
                  status,
                  upstreamUrl: upstreamUrl.toString(),
                  request: JSON.parse(payload) as unknown,
                  response: upstreamPayload,
                }))
              }
              res.writeHead(status, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(upstreamPayload))
              return
            }
            const translated = chatCompletionToResponsesFormat(upstreamPayload, parsedBody.model)
            if (isStreaming) {
              sendSyntheticStreamingCompletion(res, translated)
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(translated))
            }
          } catch {
            const detail = rawResponseBody.slice(0, 500).trim()
            res.writeHead(status >= 400 ? status : 502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: { message: detail || 'Bad gateway: failed to parse upstream response' } }))
          }
        })
      })

      proxyReq.on('error', (error) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: `Proxy error: ${error.message}` } }))
        }
      })

      proxyReq.write(payload)
      proxyReq.end()
    } catch (error) {
      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message } }))
      }
    }
  })()
}
