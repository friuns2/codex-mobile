import { describe, expect, it } from 'vitest'
import { normalizeZenResponsesRequest } from './zenProxy'

describe('OpenCode Zen request normalization', () => {
  it('adds the free-tier admission shape without dropping existing tools', () => {
    const normalized = normalizeZenResponsesRequest({
      model: 'muse-spark-1.3-contributor-free',
      stream: false,
      tools: [{ type: 'function', name: 'shell', parameters: { type: 'object' } }],
      tool_choice: 'none',
    })

    expect(normalized.stream).toBe(true)
    expect(normalized.store).toBe(false)
    expect(normalized.tool_choice).toBe('auto')
    expect(normalized.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'function', name: 'shell' }),
      expect.objectContaining({ type: 'function', name: 'bash' }),
      expect.objectContaining({ type: 'function', name: 'read' }),
    ]))
  })

  it('does not duplicate required OpenCode tools', () => {
    const normalized = normalizeZenResponsesRequest({
      tools: [
        { type: 'function', name: 'bash' },
        { type: 'function', name: 'read' },
      ],
    })
    const names = (normalized.tools as Array<{ name: string }>).map((tool) => tool.name)

    expect(names.filter((name) => name === 'bash')).toHaveLength(1)
    expect(names.filter((name) => name === 'read')).toHaveLength(1)
  })
})
