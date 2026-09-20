import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { getZenModelCatalog } from './zenModelCatalog.js'
import { createZenToolAliasStream } from './zenToolAliases.js'
import { handleUnifiedResponsesProxyRequest, type ResponsesApiRequest } from './unifiedResponsesProxy.js'

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

export function normalizeZenResponsesRequest(payload: Record<string, unknown>, aliases = new Map<string, string>()): Record<string, unknown> {
  const tools: ZenTool[] = []
  const flatten = (rows: unknown[], namespace = '') => {
    for (const value of rows) {
      if (!value || typeof value !== 'object') throw new Error('Invalid Zen tool declaration')
      const tool = value as ZenTool
      if (tool.type === 'namespace' && typeof tool.name === 'string' && Array.isArray(tool.tools)) {
        flatten(tool.tools, namespace ? `${namespace}.${tool.name}` : tool.name)
      } else if (tool.type === 'function' && typeof tool.name === 'string') {
        const name = namespace ? `${namespace.split('.').join('__')}__${tool.name}` : tool.name
        if (namespace) aliases.set(name, `${namespace}.${tool.name}`)
        tools.push({ ...tool, name })
      } else {
        throw new Error(`Zen cannot execute tool type "${tool.type}". Disable hosted web search or unsupported tools for this provider.`)
      }
    }
  }
  flatten(Array.isArray(payload.tools) ? payload.tools : [])
  const toolNames = new Set(tools.map(tool => tool.name))
  // Admission tools must be executable. Alias an existing shell function with its real schema.
  const executor = tools.find(tool => tool.type === 'function' && ['exec_command', 'shell_command', 'shell'].includes(String(tool.name)))
  for (const name of ['bash', 'read'] as const) {
    if (toolNames.has(name)) continue
    if (!executor) throw new Error('Zen requires bash/read tools or an executable shell function (exec_command, shell_command, shell). No dummy tools are advertised.')
    tools.push({ ...executor, name, description: name === 'read' ? 'Read files using the shell command schema.' : executor.description })
    aliases.set(name, String(executor.name))
  }
  const reverseNames = new Map([...aliases].filter(([wire]) => wire !== 'bash' && wire !== 'read').map(([wire, runtime]) => [runtime, wire]))
  const input = Array.isArray(payload.input) ? payload.input.map(value => {
    const item = value as Record<string, unknown>
    return item.type === 'function_call' && typeof item.name === 'string' && reverseNames.has(item.name)
      ? { ...item, name: reverseNames.get(item.name) } : item
  }) : payload.input
  return { ...payload, input, store: false, stream: true, tools, tool_choice: payload.tool_choice ?? 'auto' }
}

export async function resolveZenWireApi(payload: ResponsesApiRequest, bearerToken = ''): Promise<'responses' | 'chat'> {
  const catalog = await getZenModelCatalog(bearerToken)
  const model = catalog.find(row => row.id === payload.model)
  if (!model || model.upstreamApi === 'unknown') throw new Error(`No supported Zen API route for model "${payload.model}". Refresh the model list or select another model.`)
  if (model.supportsTools === false) throw new Error(`Zen model "${payload.model}" does not support agent tools. Select a tool-capable model.`)
  if (payload.previous_response_id) throw new Error('Zen model routing requires full conversation history, not previous_response_id.')
  for (const item of Array.isArray(payload.input) ? payload.input : []) {
    // Native Responses keeps its reasoning state; the Chat adapter replays only text/summary, never encrypted provider state.
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part.type && !['input_text', 'output_text', 'text'].includes(part.type)) {
        if (part.type !== 'input_image' || !model.inputModalities?.includes('image')) {
          throw new Error(`Content type "${part.type}" is not supported by the ${model.upstreamApi} adapter for ${model.id}. Remove the attachment or select a compatible model.`)
        }
      }
    }
  }
  return model.upstreamApi === 'responses' ? 'responses' : 'chat'
}

export function handleZenProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bearerToken: string,
  wireApi: 'responses' | 'chat',
): void {
  const aliases = new Map<string, string>()
  handleUnifiedResponsesProxyRequest(req, res, {
    bearerToken,
    wireApi, // Retain the argument for caller compatibility; route each request by its model.
    resolveWireApi: payload => resolveZenWireApi(payload, bearerToken),
    prepareRequest: payload => normalizeZenResponsesRequest(payload, aliases) as ResponsesApiRequest,
    streamToolCalls: true,
    createResponseTransform: () => createZenToolAliasStream(aliases),
    responsesEndpoint: ZEN_RESPONSES_ENDPOINT,
    chatCompletionsEndpoint: ZEN_CHAT_COMPLETIONS_ENDPOINT,
    missingKeyMessage: 'Missing OpenCode Zen API key',
    requireBearerToken: false,
    allowToolFallbackToResponses: false,
    responsesPayloadFormat: 'raw',

    upstreamHeaders: () => createZenUpstreamHeaders(bearerToken),
  })
}
