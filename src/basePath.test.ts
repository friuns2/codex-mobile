import { describe, expect, it } from 'vitest'
import { appPath, getAppBasePath, normalizeBasePath, stripAppBasePath } from './basePath'

describe('configurable base path', () => {
  it('normalizes optional leading and trailing slashes', () => {
    expect(normalizeBasePath('codex/workspace-1/')).toBe('/codex/workspace-1')
    expect(normalizeBasePath('/')).toBe('')
  })

  it('prefixes application routes exactly once', () => {
    expect(appPath('/codex-api/rpc', '/codex/workspace-1')).toBe('/codex/workspace-1/codex-api/rpc')
    expect(appPath('/codex/workspace-1/codex-api/rpc', '/codex/workspace-1')).toBe('/codex/workspace-1/codex-api/rpc')
  })

  it('strips the configured prefix when inspecting application URLs', () => {
    expect(stripAppBasePath('/codex/workspace-1/codex-local-image?path=x', '/codex/workspace-1'))
      .toBe('/codex-local-image?path=x')
  })

  it('resolves the ambient prefix once and reuses it for default arguments', () => {
    const first = getAppBasePath()
    expect(getAppBasePath()).toBe(first)
    expect(appPath('/codex-api/rpc')).toBe(appPath('/codex-api/rpc', first))
    expect(stripAppBasePath('/codex-api/rpc')).toBe(stripAppBasePath('/codex-api/rpc', first))
  })

  it('rejects traversal and non-path delimiters', () => {
    expect(() => normalizeBasePath('/codex/../other')).toThrow()
    expect(() => normalizeBasePath('/codex/workspace?active=1')).toThrow()
  })
})
