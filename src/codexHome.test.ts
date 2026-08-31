import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { resolveCodexHome } from './codexHome'

describe('resolveCodexHome', () => {
  it('uses a trimmed CODEX_HOME override', () => {
    expect(resolveCodexHome({ CODEX_HOME: ' D:\\Codex Data ' }, 'C:\\Users\\me')).toBe('D:\\Codex Data')
  })

  it('defaults to the user .codex directory', () => {
    expect(resolveCodexHome({}, '/Users/me')).toBe(join('/Users/me', '.codex'))
  })
})
