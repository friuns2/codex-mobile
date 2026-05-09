import { describe, expect, it } from 'vitest'
import {
  FREE_MODE_DEFAULT_MODEL,
  FREE_MODE_PROVIDER_ID,
  OPENCODE_ZEN_DEFAULT_MODEL,
  OPENCODE_ZEN_PROVIDER_ID,
  createDefaultOpenCodeZenFreeModeState,
  getFreeModeConfigArgs,
  getOpenCodeZenFreeModelIds,
  shouldCreateDefaultFreeModeStateForMissingAuth,
} from './freeMode'

describe('unauthenticated free mode defaults', () => {
  it('creates an enabled OpenCode Zen state for unauthenticated startup', () => {
    const state = createDefaultOpenCodeZenFreeModeState()

    expect(state.enabled).toBe(true)
    expect(state.provider).toBe('opencode-zen')
    expect(state.model).toBe(OPENCODE_ZEN_DEFAULT_MODEL)
    expect(state.wireApi).toBe('chat')
    expect(state.apiKey).toBeNull()
    expect(state.providerKeys).toEqual({})
  })

  it('routes app-server through the local OpenCode Zen proxy when a server port is available', () => {
    const state = createDefaultOpenCodeZenFreeModeState()

    const args = getFreeModeConfigArgs(state, 4173)

    expect(args).toContain(`model_provider="${OPENCODE_ZEN_PROVIDER_ID}"`)
    expect(args).toContain(`model="${OPENCODE_ZEN_DEFAULT_MODEL}"`)
    expect(args).toContain(`model_providers.${OPENCODE_ZEN_PROVIDER_ID}.base_url="http://127.0.0.1:4173/codex-api/zen-proxy/v1"`)
    expect(args).toContain(`model_providers.${OPENCODE_ZEN_PROVIDER_ID}.experimental_bearer_token="zen-proxy-token"`)
  })

  it('keeps OpenRouter config available for manual free mode', () => {
    const args = getFreeModeConfigArgs({
      enabled: true,
      apiKey: 'sk-or-test',
      model: FREE_MODE_DEFAULT_MODEL,
      provider: 'openrouter',
      wireApi: 'responses',
    }, 4173)

    expect(args).toContain(`model_provider="${FREE_MODE_PROVIDER_ID}"`)
    expect(args).toContain(`model="${FREE_MODE_DEFAULT_MODEL}"`)
  })

  it('does not replace an intentionally disabled free mode state', () => {
    expect(shouldCreateDefaultFreeModeStateForMissingAuth({
      enabled: false,
      apiKey: null,
      model: FREE_MODE_DEFAULT_MODEL,
      provider: 'opencode-zen',
      wireApi: 'chat',
    }, false)).toBe(false)
  })

  it('creates the default only when state is absent and Codex auth is missing', () => {
    expect(shouldCreateDefaultFreeModeStateForMissingAuth(null, false)).toBe(true)
    expect(shouldCreateDefaultFreeModeStateForMissingAuth(null, true)).toBe(false)
  })

  it('limits OpenCode Zen models to free/default choices without an API key', () => {
    expect(getOpenCodeZenFreeModelIds([
      'gpt-5.5',
      'big-pickle',
      'minimax-m2.5-free',
      'gpt-5.4-mini',
      'hy3-preview-free',
    ])).toEqual([
      'big-pickle',
      'minimax-m2.5-free',
      'hy3-preview-free',
    ])
  })

  it('keeps the built-in OpenCode Zen dropdown on free/default choices even with an API key', () => {
    expect(getOpenCodeZenFreeModelIds([
      'gpt-5.5',
      'big-pickle',
      'minimax-m2.5-free',
      'gpt-5.4-mini',
    ])).toEqual([
      'big-pickle',
      'minimax-m2.5-free',
    ])
  })
})
