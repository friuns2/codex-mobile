import { describe, expect, it, vi } from 'vitest'
import { jumpConversationToLatestOnMobile } from './mobileConversationJump'

describe('jumpConversationToLatestOnMobile', () => {
  it('requests exactly one bottom jump for a mobile thread submission', () => {
    const jumpToLatest = vi.fn()

    jumpConversationToLatestOnMobile(true, false, jumpToLatest)

    expect(jumpToLatest).toHaveBeenCalledTimes(1)
  })

  it('does not jump on desktop or the mobile home composer', () => {
    const jumpToLatest = vi.fn()

    jumpConversationToLatestOnMobile(false, false, jumpToLatest)
    jumpConversationToLatestOnMobile(true, true, jumpToLatest)

    expect(jumpToLatest).not.toHaveBeenCalled()
  })
})
