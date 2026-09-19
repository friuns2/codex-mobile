import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { handleUnifiedResponsesProxyRequest } from './unifiedResponsesProxy.js'

const ZEN_RESPONSES_ENDPOINT = 'https://opencode.ai/zen/v1/responses'
const ZEN_CHAT_COMPLETIONS_ENDPOINT = 'https://opencode.ai/zen/v1/chat/completions'
const OPENCODE_ZEN_PUBLIC_TOKEN = 'public'
// Mirrors the public OpenCode CLI identity that Zen accepts for unauthenticated free-model calls.
const OPENCODE_ZEN_USER_AGENT = 'opencode/1.18.30 ai-sdk/provider-utils/4.0.40 runtime/bun/1.3.14'
const OPENCODE_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function createOpenCodeId(prefix: 'msg' | 'ses'): string {
  const hex = randomBytes(6).toString('hex')
  const suffix = Array.from(randomBytes(14), (byte) => OPENCODE_ID_ALPHABET[byte % OPENCODE_ID_ALPHABET.length]).join('')
  return `${prefix}_${hex}${suffix}`
}

function createZenUpstreamHeaders(bearerToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${bearerToken || OPENCODE_ZEN_PUBLIC_TOKEN}`,
    'User-Agent': OPENCODE_ZEN_USER_AGENT,
    'Accept': 'text/event-stream',
    'X-Opencode-Client': 'cli',
    'X-Opencode-Project': 'global',
    'X-Opencode-Request': createOpenCodeId('msg'),
    'X-Opencode-Session': createOpenCodeId('ses'),
  }
}

type ZenTool = Record<string, unknown> & { name?: unknown; type?: unknown }

function createRequiredZenTool(name: 'bash' | 'read'): ZenTool {
  return {
    type: 'function',
    name,
    description: `OpenCode built-in ${name} tool`,
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  }
}

export function normalizeZenResponsesRequest(payload: Record<string, unknown>): Record<string, unknown> {
  const tools = Array.isArray(payload.tools)
    ? payload.tools.filter((tool): tool is ZenTool => Boolean(tool) && typeof tool === 'object')
    : []
  const toolNames = new Set(tools.map((tool) => typeof tool.name === 'string' ? tool.name : ''))
  for (const name of ['bash', 'read'] as const) {
    if (!toolNames.has(name)) tools.push(createRequiredZenTool(name))
  }
  return {
    ...payload,
    store: false,
    stream: true,
    tools,
    tool_choice: 'auto',
  }
}

export function handleZenProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bearerToken: string,
  wireApi: 'responses' | 'chat',
): void {
  handleUnifiedResponsesProxyRequest(req, res, {
    bearerToken,
    wireApi,
    responsesEndpoint: ZEN_RESPONSES_ENDPOINT,
    chatCompletionsEndpoint: ZEN_CHAT_COMPLETIONS_ENDPOINT,
    missingKeyMessage: 'Missing OpenCode Zen API key',
    requireBearerToken: false,
    allowToolFallbackToResponses: false,
    responsesPayloadFormat: 'raw',
    sanitizeResponsesRequest: normalizeZenResponsesRequest,
    upstreamHeaders: () => createZenUpstreamHeaders(bearerToken),
  })
}
