import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { handleUnifiedResponsesProxyRequest } from './unifiedResponsesProxy.js'

const ZEN_RESPONSES_ENDPOINT = 'https://opencode.ai/zen/v1/responses'
const ZEN_CHAT_COMPLETIONS_ENDPOINT = 'https://opencode.ai/zen/v1/chat/completions'
const OPENCODE_ZEN_PUBLIC_TOKEN = 'public'
// Mirrors the public OpenCode CLI identity that Zen accepts for unauthenticated free-model calls.
const OPENCODE_ZEN_USER_AGENT = `opencode/1.15.9 ai-sdk/provider-utils/4.0.23 runtime/node/${process.versions.node}`
const OPENCODE_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function createOpenCodeId(prefix: 'msg' | 'ses'): string {
  const bytes = randomBytes(24)
  let suffix = ''
  for (const byte of bytes) {
    suffix += OPENCODE_ID_ALPHABET[byte % OPENCODE_ID_ALPHABET.length]
  }
  return `${prefix}_${suffix}`
}

function createZenUpstreamHeaders(bearerToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${bearerToken || OPENCODE_ZEN_PUBLIC_TOKEN}`,
    'User-Agent': OPENCODE_ZEN_USER_AGENT,
    'Accept': '*/*',
    'X-Opencode-Client': 'cli',
    'X-Opencode-Project': 'global',
    'X-Opencode-Request': createOpenCodeId('msg'),
    'X-Opencode-Session': createOpenCodeId('ses'),
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
    responsesPayloadFormat: 'chat',
    upstreamHeaders: () => createZenUpstreamHeaders(bearerToken),
  })
}
