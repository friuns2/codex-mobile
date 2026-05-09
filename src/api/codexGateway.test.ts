import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentModelConfig, listDirectoryComposioConnectors, startThreadTurn } from './codexGateway'

function mockRpcFetch(): { requests: Array<{ method: string, params: Record<string, unknown> }> } {
  const requests: Array<{ method: string, params: Record<string, unknown> }> = []

  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as { method: string, params: Record<string, unknown> }
      : { method: '', params: {} }

    requests.push(body)

    return new Response(JSON.stringify({
      result: {
        turn: {
          id: `turn-${requests.length}`,
        },
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }))

  return { requests }
}

describe('startThreadTurn collaboration mode payloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends default collaboration mode explicitly after a plan turn', async () => {
    const { requests } = mockRpcFetch()

    await startThreadTurn('thread-1', 'make a plan', [], 'gpt-5.4', 'medium', undefined, [], 'plan')
    await startThreadTurn('thread-1', 'implement it', [], 'gpt-5.4', 'medium', undefined, [], 'default')

    expect(requests).toHaveLength(2)
    expect(requests[0].method).toBe('turn/start')
    expect(requests[0].params.collaborationMode).toEqual({
      mode: 'plan',
      settings: {
        model: 'gpt-5.4',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    })
    expect(requests[1].method).toBe('turn/start')
    expect(requests[1].params.collaborationMode).toEqual({
      mode: 'default',
      settings: {
        model: 'gpt-5.4',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    })
  })
})

describe('listDirectoryComposioConnectors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends search queries as query params expected by the server', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      return new Response(JSON.stringify({
        data: [],
        nextCursor: null,
        total: 0,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }))

    await listDirectoryComposioConnectors('instagram', '50', 25)

    expect(requests).toEqual(['/codex-api/composio/connectors?query=instagram&cursor=50&limit=25'])
  })
})

describe('getCurrentModelConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses enabled free-mode provider and model over stale Codex config values', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/codex-api/free-mode/status') {
        return new Response(JSON.stringify({
          enabled: true,
          provider: 'opencode-zen',
          currentModel: 'big-pickle',
          wireApi: 'chat',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method: string }
        : { method: '' }
      expect(body.method).toBe('config/read')
      return new Response(JSON.stringify({
        result: {
          config: {
            model: 'gpt-5.4-mini',
            model_provider: 'openai',
            model_reasoning_effort: 'high',
            service_tier: 'auto',
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    await expect(getCurrentModelConfig()).resolves.toMatchObject({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'high',
    })
  })
})
