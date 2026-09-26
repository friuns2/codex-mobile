import { describe, expect, it, vi } from 'vitest'
import { jumpConversationToLatestOnMobile } from './mobileConversationJump'

describe('jumpConversationToLatestOnMobile', () => {
  it('requests exactly one bottom jump for a mobile thread submission', () => {
    const jumpToLatest = vi.fn(() => true)

    const didJump = jumpConversationToLatestOnMobile(true, false, jumpToLatest)

    expect(jumpToLatest).toHaveBeenCalledTimes(1)
    expect(didJump).toBe(true)
  })

  it('does not jump on desktop or the mobile home composer', () => {
    const jumpToLatest = vi.fn(() => true)

    expect(jumpConversationToLatestOnMobile(false, false, jumpToLatest)).toBe(false)
    expect(jumpConversationToLatestOnMobile(true, true, jumpToLatest)).toBe(false)

    expect(jumpToLatest).not.toHaveBeenCalled()
  })

  it('reports a mobile jump that runs before the conversation ref is mounted', () => {
    const jumpToLatest = vi.fn(() => false)

    expect(jumpConversationToLatestOnMobile(true, false, jumpToLatest)).toBe(false)
    expect(jumpToLatest).toHaveBeenCalledTimes(1)
  })
})
