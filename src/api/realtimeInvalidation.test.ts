import { describe, expect, it } from 'vitest'
import { parseCodexUiInvalidation } from './realtimeInvalidation'

describe('parseCodexUiInvalidation', () => {
  it('parses a valid targeted invalidation', () => {
    expect(parseCodexUiInvalidation({
      method: 'codex-ui/state-invalidated',
      params: {
        scopes: ['threads', 'workspace'],
        threadIds: ['thread-1', 'thread-1'],
        reason: 'filesystem',
        revision: 3,
      },
      atIso: '2026-08-31T00:00:00.000Z',
    })).toEqual({
      scopes: ['threads', 'workspace'],
      threadIds: ['thread-1'],
      reason: 'filesystem',
      revision: 3,
    })
  })

  it.each([
    { scopes: ['unknown'], reason: 'filesystem', revision: 1 },
    { scopes: ['threads'], reason: 'unknown', revision: 1 },
    { scopes: ['threads'], reason: 'filesystem', revision: 0 },
    { scopes: ['threads'], threadIds: [''], reason: 'filesystem', revision: 1 },
    { scopes: ['threads'], threadIds: ['   '], reason: 'filesystem', revision: 1 },
  ])('rejects malformed params %#', (params) => {
    expect(parseCodexUiInvalidation({
      method: 'codex-ui/state-invalidated',
      params,
      atIso: '2026-08-31T00:00:00.000Z',
    })).toBe(null)
  })

  it('ignores other notification methods', () => {
    expect(parseCodexUiInvalidation({ method: 'turn/completed', params: {}, atIso: '' })).toBe(null)
  })
})
