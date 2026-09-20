import { describe, expect, it, vi } from 'vitest'
import { createFrameCoalescer } from './frameCoalescer'

describe('createFrameCoalescer', () => {
  it('runs a burst of updates at most once in the next frame', () => {
    const queuedFrames = new Map<number, () => void>()
    const callback = vi.fn()
    let nextFrameId = 1
    const coalescer = createFrameCoalescer(
      callback,
      (frameCallback) => {
        const frameId = nextFrameId
        nextFrameId += 1
        queuedFrames.set(frameId, frameCallback)
        return frameId
      },
      (frameId) => queuedFrames.delete(frameId),
    )

    coalescer.schedule()
    coalescer.schedule()
    coalescer.schedule()

    expect(queuedFrames.size).toBe(1)
    const firstFrame = queuedFrames.get(1)
    queuedFrames.delete(1)
    firstFrame?.()
    expect(callback).toHaveBeenCalledTimes(1)

    coalescer.schedule()
    expect(queuedFrames.size).toBe(1)
  })

  it('cancels a pending update before teardown', () => {
    const queuedFrames = new Map<number, () => void>()
    const callback = vi.fn()
    const coalescer = createFrameCoalescer(
      callback,
      (frameCallback) => {
        queuedFrames.set(7, frameCallback)
        return 7
      },
      (frameId) => queuedFrames.delete(frameId),
    )

    coalescer.schedule()
    coalescer.cancel()

    expect(queuedFrames.size).toBe(0)
    expect(callback).not.toHaveBeenCalled()
  })
})
