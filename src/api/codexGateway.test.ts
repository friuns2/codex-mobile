import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAgentInstructionsOptions, startThread, startThreadTurn } from './codexGateway'

function mockRpcFetch(): { requests: Array<{ method: string, params: Record<string, unknown>, url: string }> } {
  const requests: Array<{ method: string, params: Record<string, unknown>, url: string }> = []

  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(_input)
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as { method: string, params: Record<string, unknown>, model?: unknown, baseInstructions?: unknown }
      : { method: '', params: {} }

    requests.push({ ...body, url })

    const result = url.includes('/codex-api/thread/start-with-agent-instructions') || body.method === 'thread/start'
      ? { thread: { id: `thread-${requests.length}` }, model: body.params?.model ?? body.model ?? '' }
      : { turn: { id: `turn-${requests.length}` } }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }))

  return { requests }
}

describe('startThread instruction payloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('omits baseInstructions for the default AGENTS.md selection', async () => {
    const { requests } = mockRpcFetch()

    await startThread('/tmp/TestChat', 'gpt-5.4')

    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('thread/start')
    expect(requests[0].params).toEqual({
      cwd: '/tmp/TestChat',
      model: 'gpt-5.4',
    })
  })

  it('sends only the selected custom agent instructions as baseInstructions', async () => {
    const { requests } = mockRpcFetch()

    await startThread('/tmp/TestChat', 'gpt-5.4', 'CUSTOM_AGENT_ONLY', { deferCwdUntilTurn: true })

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('/codex-api/thread/start-with-agent-instructions')
    expect(requests[0]).toMatchObject({
      cwd: '/tmp/TestChat',
      model: 'gpt-5.4',
      baseInstructions: 'CUSTOM_AGENT_ONLY',
    })
    expect(JSON.stringify(requests[0])).not.toContain('ORIGINAL_AGENTS_MARKER')
  })
})

describe('getAgentInstructionsOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves project and global instruction scopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          value: 'project:AGENTS.md',
          label: 'Default AGENTS.md',
          path: '/tmp/TestChat/AGENTS.md',
          content: 'ORIGINAL_AGENTS_MARKER',
          isDefault: true,
          scope: 'project',
        },
        {
          value: 'global:AGENTS.review.md',
          label: 'Global: AGENTS.review.md',
          path: '/Users/igor/.codex/AGENTS.review.md',
          content: 'GLOBAL_REVIEW_MARKER',
          isDefault: false,
          scope: 'global',
        },
      ],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })))

    const options = await getAgentInstructionsOptions('/tmp/TestChat')

    expect(options).toEqual([
      {
        value: 'project:AGENTS.md',
        label: 'Default AGENTS.md',
        path: '/tmp/TestChat/AGENTS.md',
        content: 'ORIGINAL_AGENTS_MARKER',
        isDefault: true,
        scope: 'project',
      },
      {
        value: 'global:AGENTS.review.md',
        label: 'Global: AGENTS.review.md',
        path: '/Users/igor/.codex/AGENTS.review.md',
        content: 'GLOBAL_REVIEW_MARKER',
        isDefault: false,
        scope: 'global',
      },
    ])
  })
})

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
