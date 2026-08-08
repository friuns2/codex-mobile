import { describe, expect, it } from 'vitest'
import { formatBytes, suggestModelsForHardware, buildSuggestionFromHfRow } from './aiModelsRouter'
import type { HardwareProfile } from './aiModelsRouter'

const baseHardware: HardwareProfile = {
  cpus: [{ model: 'Test CPU', cores: 8, speedMHz: 2000 }],
  totalRamBytes: 8 * 1024 ** 3,
  freeRamBytes: 4 * 1024 ** 3,
  platform: 'linux',
  arch: 'x64',
  release: 'test',
  hostname: 'test',
  tier: 'medium',
  canRunOfflineModels: true,
}

describe('ai models formatBytes', () => {
  it('formats byte counts with appropriate units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
    expect(formatBytes(4.7 * 1024 ** 3)).toBe('4.7 GB')
  })
})

describe('ai models hardware-based suggestions', () => {
  it('only suggests models that fit within available RAM', () => {
    const suggestions = suggestModelsForHardware(baseHardware, [])
    expect(suggestions.length).toBeGreaterThan(0)
    for (const suggestion of suggestions) {
      expect(suggestion.kind).toBe('ollama')
      expect(suggestion.ramHintBytes).toBeLessThanOrEqual(baseHardware.totalRamBytes * 0.9)
    }
  })

  it('does not suggest models that are already installed', () => {
    const suggestions = suggestModelsForHardware(baseHardware, [{ name: 'llama3.2:1b', sizeBytes: 0, digest: '', modifiedAt: '' }])
    expect(suggestions.find((s) => s.name === 'llama3.2:1b')).toBeUndefined()
  })

  it('guarantees at least the smallest model for low-tier devices', () => {
    const lowHardware: HardwareProfile = {
      ...baseHardware,
      totalRamBytes: 2 * 1024 ** 3,
      tier: 'low',
      canRunOfflineModels: false,
    }
    const suggestions = suggestModelsForHardware(lowHardware, [])
    expect(suggestions.find((s) => s.name === 'llama3.2:1b')).toBeDefined()
  })
})

describe('ai models HuggingFace row parsing', () => {
  it('builds a suggestion from a safetensors row with parameters', () => {
    const suggestion = buildSuggestionFromHfRow({
      id: 'meta-llama/Llama-3.1-8B',
      pipeline_tag: 'text-generation',
      downloads: 5_000_000,
      safetensors: { parameters: '8.03B' },
    })
    expect(suggestion).not.toBeNull()
    expect(suggestion?.kind).toBe('huggingface')
    expect(suggestion?.name).toBe('meta-llama/Llama-3.1-8B')
    expect(suggestion?.ramHintBytes).toBeGreaterThan(0)
    expect(suggestion?.description).toContain('downloads')
  })

  it('returns null for rows without an id', () => {
    expect(buildSuggestionFromHfRow({ pipeline_tag: 'text-generation' })).toBeNull()
  })
})
