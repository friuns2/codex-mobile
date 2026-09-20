import { describe, expect, it } from 'vitest'
import {
  FREE_MODE_DEFAULT_MODEL,
  OPENCODE_ZEN_DEFAULT_MODEL,
  createDefaultOpenCodeZenFreeModeState,
  filterOpenCodeZenModelsForAuthState,
  getFreeModeConfigArgs,
  getProviderCompatibilityConfigArgs,
  shouldMarkOpenRouterKeyAsCustom,
  shouldCreateDefaultFreeModeStateForMissingAuth,
  shouldSuppressCommunityFreeModeForCodexAuth,
} from './freeMode'

describe('unauthenticated free mode defaults', () => {
  it('builds an enabled OpenCode Zen runtime fallback for unauthenticated startup', () => {
    const state = createDefaultOpenCodeZenFreeModeState()

    expect(state.enabled).toBe(true)
    expect(state.provider).toBe('opencode-zen')
    expect(state.model).toBe(OPENCODE_ZEN_DEFAULT_MODEL)
    expect(state.wireApi).toBe('responses')
    expect(state.apiKey).toBeNull()
    expect(state.providerKeys).toEqual({})
  })

  it('routes app-server through the local OpenCode Zen proxy when a server port is available', () => {
    const state = createDefaultOpenCodeZenFreeModeState()

    const args = getFreeModeConfigArgs(state, 4173)

    expect(args).toContain('model_provider="opencode_zen"')
    expect(args).toContain(`model="${OPENCODE_ZEN_DEFAULT_MODEL}"`)
    expect(args).toContain('model_providers.opencode_zen.base_url="http://127.0.0.1:4173/codex-api/zen-proxy/v1"')
    expect(args).toContain('model_providers.opencode_zen.wire_api="responses"')
    expect(args).toContain('model_providers.opencode_zen.experimental_bearer_token="zen-proxy-token"')
  })

  it('can register OpenCode Zen for legacy thread reads without selecting it as active provider', () => {
    const args = getProviderCompatibilityConfigArgs(4173)

    expect(args).toContain('model_providers.opencode_zen.base_url="http://127.0.0.1:4173/codex-api/zen-proxy/v1"')
    expect(args).toContain('model_providers.opencode_zen.wire_api="responses"')
    expect(args).toContain('model_providers.opencode_zen.experimental_bearer_token="zen-proxy-token"')
    expect(args).not.toContain('model_provider="opencode_zen"')
    expect(args.some((arg) => arg.startsWith('model="'))).toBe(false)
  })

  it('suppresses community fallback providers when Codex auth appears', () => {
    expect(shouldSuppressCommunityFreeModeForCodexAuth({
      enabled: true,
      apiKey: 'community-key',
      model: FREE_MODE_DEFAULT_MODEL,
      customKey: false,
      provider: 'openrouter',
      wireApi: 'responses',
    }, true)).toBe(true)

    expect(shouldSuppressCommunityFreeModeForCodexAuth({
      enabled: true,
      apiKey: 'user-key',
      model: FREE_MODE_DEFAULT_MODEL,
      customKey: true,
      provider: 'openrouter',
      wireApi: 'responses',
    }, true)).toBe(false)

    expect(shouldSuppressCommunityFreeModeForCodexAuth({
      enabled: true,
      apiKey: 'zen-user-key',
      model: OPENCODE_ZEN_DEFAULT_MODEL,
      customKey: false,
      provider: 'opencode-zen',
      wireApi: 'responses',
    }, true)).toBe(false)

    expect(shouldSuppressCommunityFreeModeForCodexAuth({
      enabled: false,
      apiKey: null,
      model: FREE_MODE_DEFAULT_MODEL,
      provider: 'openrouter',
      wireApi: 'responses',
    }, true)).toBe(false)

    expect(shouldSuppressCommunityFreeModeForCodexAuth({
      enabled: true,
      apiKey: 'community-key',
      model: FREE_MODE_DEFAULT_MODEL,
      customKey: false,
      provider: 'openrouter',
      wireApi: 'responses',
    }, false)).toBe(false)
  })

  it('does not treat remembered community OpenRouter keys as custom keys', () => {
    expect(shouldMarkOpenRouterKeyAsCustom({
      enabled: true,
      apiKey: 'community-key',
      model: FREE_MODE_DEFAULT_MODEL,
      customKey: false,
      provider: 'openrouter',
      wireApi: 'responses',
      providerKeys: {
        openrouter: 'community-key',
      },
    }, '')).toBe(false)

    expect(shouldMarkOpenRouterKeyAsCustom({
      enabled: true,
      apiKey: 'user-key',
      model: FREE_MODE_DEFAULT_MODEL,
      customKey: true,
      provider: 'openrouter',
      wireApi: 'responses',
      providerKeys: {
        openrouter: 'user-key',
      },
    }, '')).toBe(true)

    expect(shouldMarkOpenRouterKeyAsCustom({
      enabled: true,
      apiKey: 'community-key',
      model: FREE_MODE_DEFAULT_MODEL,
      customKey: false,
      provider: 'openrouter',
      wireApi: 'responses',
    }, 'explicit-user-key')).toBe(true)
  })

  it('uses the OpenCode Zen default model when persisted Zen state has an empty model', () => {
    const args = getFreeModeConfigArgs({
      ...createDefaultOpenCodeZenFreeModeState(),
      model: '',
    }, 4173)

    expect(args).toContain(`model="${OPENCODE_ZEN_DEFAULT_MODEL}"`)
  })

  it('keeps unauthenticated OpenCode Zen model lists limited to free models', () => {
    expect(filterOpenCodeZenModelsForAuthState([
      'big-pickle',
      'muse-spark-1.3-contributor-free',
      'deepseek-v4-flash-free',
      'GPT-5.5',
      'claude-opus-4-7',
      'nemotron-3-super-free',
    ], null)).toEqual([
      'muse-spark-1.3-contributor-free',
      'deepseek-v4-flash-free',
      'nemotron-3-super-free',
    ])
  })

  it('keeps paid OpenCode Zen models when a user Zen key is configured', () => {
    expect(filterOpenCodeZenModelsForAuthState([
      'big-pickle',
      'deepseek-v4-flash-free',
      'GPT-5.5',
    ], 'zen-user-key')).toEqual([
      'big-pickle',
      'deepseek-v4-flash-free',
      'GPT-5.5',
    ])
  })

  it('disables hosted tools unsupported by Zen', () => {
    const args = getFreeModeConfigArgs({
      enabled: true, apiKey: null, model: 'muse-spark-1.3-contributor-free',
      provider: 'opencode-zen', wireApi: 'responses',
    }, 4173)
    expect(args).toContain('web_search="disabled"')
    expect(args).toContain('features.image_generation=false')
    expect(getFreeModeConfigArgs({
      enabled: true, apiKey: 'test', model: FREE_MODE_DEFAULT_MODEL,
      provider: 'openrouter', wireApi: 'responses',
    }, 4173)).not.toContain('features.image_generation=false')
  })

  it('keeps OpenRouter config available for manual free mode', () => {
    const args = getFreeModeConfigArgs({
      enabled: true,
      apiKey: 'sk-or-test',
      model: FREE_MODE_DEFAULT_MODEL,
      provider: 'openrouter',
      wireApi: 'responses',
    }, 4173)

    expect(args).toContain('model_provider="openrouter_free"')
    expect(args).toContain(`model="${FREE_MODE_DEFAULT_MODEL}"`)
    expect(args).toContain('model_providers.openrouter_free.base_url="http://127.0.0.1:4173/codex-api/openrouter-proxy/v1"')
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

  it('uses the runtime default only when state is absent and Codex auth is missing', () => {
    expect(shouldCreateDefaultFreeModeStateForMissingAuth(null, false)).toBe(true)
    expect(shouldCreateDefaultFreeModeStateForMissingAuth(null, true)).toBe(false)
  })
})
