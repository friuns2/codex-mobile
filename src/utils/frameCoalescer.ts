export type FrameRequest = (callback: () => void) => number
export type FrameCancel = (frameId: number) => void

export function createFrameCoalescer(
  callback: () => void,
  requestFrame: FrameRequest,
  cancelFrame: FrameCancel,
): { schedule: () => void; cancel: () => void } {
  let pendingFrameId: number | null = null

  return {
    schedule(): void {
      if (pendingFrameId !== null) return
      pendingFrameId = requestFrame(() => {
        pendingFrameId = null
        callback()
      })
    },
    cancel(): void {
      if (pendingFrameId === null) return
      cancelFrame(pendingFrameId)
      pendingFrameId = null
    },
  }
}
