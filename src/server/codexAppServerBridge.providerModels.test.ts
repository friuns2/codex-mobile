import { describe, expect, it } from 'vitest'
import { normalizeProviderModelsData } from './codexAppServerBridge'

describe('provider model discovery payload normalization', () => {
  it('reads OpenAI-compatible model ids from data rows', () => {
    expect(normalizeProviderModelsData({
      data: [
        { id: 'gpt-5.4' },
        { id: 'gpt-5.4-mini' },
      ],
    })).toEqual(['gpt-5.4', 'gpt-5.4-mini'])
  })

  it('reads Codex catalog model slugs from models rows', () => {
    expect(normalizeProviderModelsData({
      models: [
        { slug: 'gpt-5.4' },
        { slug: 'gpt-5.3-codex' },
      ],
    })).toEqual(['gpt-5.4', 'gpt-5.3-codex'])
  })

  it('falls back to models rows when data rows are empty', () => {
    expect(normalizeProviderModelsData({
      data: [],
      models: [
        { slug: 'gpt-5.4' },
        { slug: 'gpt-5.3-codex' },
      ],
    })).toEqual(['gpt-5.4', 'gpt-5.3-codex'])
  })

  it('accepts string rows and common model fields while preserving first-seen order', () => {
    expect(normalizeProviderModelsData({
      models: [
        'gpt-5.5',
        { model: 'gpt-5.4' },
        { id: 'gpt-5.5' },
        { slug: 'gpt-5.3-codex' },
      ],
    })).toEqual(['gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex'])
  })

  it('rejects payloads without a supported models array', () => {
    expect(() => normalizeProviderModelsData({ object: 'list' }))
      .toThrow('provider /models payload is missing a data/models array')
  })
})
