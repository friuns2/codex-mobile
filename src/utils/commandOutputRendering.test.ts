import { describe, expect, it } from 'vitest'
import { resolveCommandOutputText } from './commandOutputRendering'

describe('resolveCommandOutputText', () => {
  it('keeps collapsed command output out of the rendered tree', () => {
    expect(resolveCommandOutputText(false, 'very large command output')).toBeNull()
  })

  it('returns expanded output and preserves the empty-output fallback', () => {
    expect(resolveCommandOutputText(true, 'command output')).toBe('command output')
    expect(resolveCommandOutputText(true, '')).toBe('(no output)')
  })
})
