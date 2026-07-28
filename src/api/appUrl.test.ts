import { afterEach, describe, expect, it, vi } from 'vitest'
import { appFetch, appHttpUrl, appWebSocketUrl } from './appUrl'

function setBrowserLocation(baseURI: string, protocol = 'https:'): void {
  vi.stubGlobal('document', { baseURI })
  vi.stubGlobal('location', { protocol })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app URL helpers', () => {
  it('resolves HTTP paths below the JupyterHub application base', () => {
    setBrowserLocation('https://host/user/alice/codex/')

    expect(appHttpUrl('codex-api/rpc')).toBe(
      'https://host/user/alice/codex/codex-api/rpc',
    )
  })

  it('removes leading slashes and document query/hash state', () => {
    setBrowserLocation('https://host/user/alice/codex?from=hub#/thread/123')

    expect(appHttpUrl('/codex-api/rpc')).toBe(
      'https://host/user/alice/codex/codex-api/rpc',
    )
  })

  it('uses the same base path for secure WebSockets', () => {
    setBrowserLocation('https://host/user/alice/codex/')

    expect(appWebSocketUrl('/codex-api/ws')).toBe(
      'wss://host/user/alice/codex/codex-api/ws',
    )
  })

  it('keeps root-relative paths when no browser document exists', () => {
    expect(appHttpUrl('/codex-api/rpc')).toBe('/codex-api/rpc')
    expect(appWebSocketUrl('/codex-api/ws')).toBe('ws://localhost/codex-api/ws')
  })

  it('routes root-relative fetches through the application base', async () => {
    setBrowserLocation('http://host/user/alice/codex/', 'http:')
    const fetchMock = vi.fn().mockResolvedValue(new Response())
    vi.stubGlobal('fetch', fetchMock)

    await appFetch('/codex-api/rpc', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://host/user/alice/codex/codex-api/rpc',
      { method: 'POST' },
    )
  })
})
