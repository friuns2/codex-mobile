import { existsSync } from 'node:fs'
import { writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BackendQueueProcessor,
  AppServerProcess,
  mergeCapturedItemsIntoThreadResult,
  mergeSessionSkillInputsIntoTurns,
  parseAutomationToml,
  sanitizeCapturedItemsForMerge,
  sanitizeThreadTurnsInlinePayloads,
  sanitizeThreadItemsForTurn,
  toAutomationApiRecord,
} from './codexAppServerBridge'

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const pngDataUrl = `data:image/png;base64,${pngBase64}`
const gifBase64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
const jpegBase64 = '/9j/4AAQSkZJRgABAgAAAQABAAD//gARTGF2YzU4LjEzNC4xMDAA/9sAQwAIBAQEBAQFBQUFBQUGBgYGBgYGBgYGBgYGBwcHCAgIBwcHBgYHBwgICAgJCQkICAgICQkKCgoMDAsLDg4OEREU/8QATAABAQAAAAAAAAAAAAAAAAAAAAYBAQEAAAAAAAAAAAAAAAAAAAYHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAAgACAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AiwBRf3//2Q=='
const webpBase64 = 'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAgA0JaACdLoB+AADsAD+8Oj3/yC5YXXI1/8gP+QH/ID/+PIAAAA='
const avifBase64 = 'AAAAGGZ0eXBhdmlmAAAAAGF2aWZtaWYxAAAALG1ldGEAAAAAAAAACHBpdG0AAAAIaWxvYwAAAAhpaW5mAAAACGlwcnAAAAAMbWRhdAECAwQ='
const webpExtendedHeaderOnlyBase64 = 'UklGRhYAAABXRUJQVlA4WAoAAAAAAAAAAAAAAAAA'
const animatedWebpContainerBase64 = 'UklGRkYAAABXRUJQVlA4WAoAAAACAAAAAAAAAAAAQU5JTQYAAAAAAAAAAABBTk1GGgAAAAAAAAAAAAAAAAAAAAAAAABWUDggAQAAAAAA'
const bmpBase64 = 'Qk1GAAAAAAAAADYAAAAoAAAAAgAAAAIAAAABABgAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAD9AAD9AAAAAP0AAP0AAA=='

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function localImagePathFromProxyUrl(value: string): string {
  const parsed = new URL(value, 'http://localhost')
  expect(parsed.pathname).toBe('/codex-local-image')
  const imagePath = parsed.searchParams.get('path')
  expect(imagePath).toBeTruthy()
  return imagePath ?? ''
}

describe('thread inline media sanitization', () => {
  it('bounds captured-item sanitization to the request snapshot', async () => {
    type Captured = { id: string; sanitized: boolean }
    const original: Captured = { id: 'generated-1', sanitized: false }
    const replacement: Captured = { id: 'generated-1', sanitized: false }
    const capturedMap = new Map([[original.id, original]])
    const sanitizedIds: string[] = []

    const currentItems = await sanitizeCapturedItemsForMerge(capturedMap, async (captured) => {
      sanitizedIds.push(captured.id)
      capturedMap.set(replacement.id, replacement)
      captured.sanitized = true
    })

    expect(sanitizedIds).toEqual(['generated-1'])
    expect(currentItems).toEqual([])
    expect(capturedMap.get(replacement.id)).toBe(replacement)
    expect(replacement.sanitized).toBe(false)
  })

  it('bounds captured notification state and expires it without a thread read', () => {
    vi.useFakeTimers()
    const appServer = new AppServerProcess()
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      capturedItemsByThreadId: Map<string, Map<string, unknown>>
    }

    for (let index = 0; index < 105; index += 1) {
      internals.emitNotification({
        method: 'item/completed',
        params: {
          threadId: 'thread-bounded',
          turnId: 'turn-live',
          item: { id: `command-${index}`, type: 'commandExecution', command: `echo ${index}` },
        },
      })
    }

    expect(internals.capturedItemsByThreadId.get('thread-bounded')?.size).toBe(100)
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(internals.capturedItemsByThreadId.has('thread-bounded')).toBe(false)

    internals.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-bounded',
        turnId: 'turn-live',
        item: { id: 'command-after-expiry', type: 'commandExecution', command: 'echo retained' },
      },
    })
    expect(internals.capturedItemsByThreadId.has('thread-bounded')).toBe(true)
    appServer.dispose()
    expect(internals.capturedItemsByThreadId.has('thread-bounded')).toBe(false)
  })

  it('bounds captured notification state across active thread ids', () => {
    const appServer = new AppServerProcess()
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      capturedItemsByThreadId: Map<string, Map<string, unknown>>
      capturedItemEstimatedBytesTotal: number
    }

    for (let index = 0; index < 105; index += 1) {
      internals.emitNotification({
        method: 'item/completed',
        params: {
          threadId: `thread-global-${index}`,
          turnId: 'turn-live',
          item: { id: `command-${index}`, type: 'commandExecution', command: `echo ${index}` },
        },
      })
    }

    expect(internals.capturedItemsByThreadId.size).toBe(100)
    expect(internals.capturedItemsByThreadId.has('thread-global-0')).toBe(false)
    expect(internals.capturedItemsByThreadId.has('thread-global-104')).toBe(true)
    expect(internals.capturedItemEstimatedBytesTotal).toBeGreaterThan(0)
    appServer.dispose()
    expect(internals.capturedItemEstimatedBytesTotal).toBe(0)
  })

  it('rejects an over-wide captured notification without variadic traversal', () => {
    const appServer = new AppServerProcess()
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      capturedItemsByThreadId: Map<string, Map<string, unknown>>
    }

    expect(() => internals.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-wide',
        turnId: 'turn-live',
        item: {
          id: 'command-wide',
          type: 'commandExecution',
          output: Array.from({ length: 200_000 }, () => 0),
        },
      },
    })).not.toThrow()
    expect(internals.capturedItemsByThreadId.has('thread-wide')).toBe(false)
    appServer.dispose()
  })

  it('bounds eager image sanitization concurrency and queued work', async () => {
    let activeSanitizers = 0
    let maxActiveSanitizers = 0
    const releases: Array<() => void> = []
    const sanitizer = vi.fn(async (turnId: string, items: unknown[]) => {
      activeSanitizers += 1
      maxActiveSanitizers = Math.max(maxActiveSanitizers, activeSanitizers)
      await new Promise<void>((resolve) => {
        releases.push(() => {
          activeSanitizers -= 1
          resolve()
        })
      })
      return sanitizeThreadItemsForTurn(turnId, items)
    })
    const appServer = new AppServerProcess(sanitizer)
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      capturedItemSanitizeQueue: unknown[]
      activeCapturedItemSanitizations: number
    }

    for (let index = 0; index < 40; index += 1) {
      internals.emitNotification({
        method: 'item/completed',
        params: {
          threadId: `thread-image-${index}`,
          turnId: 'turn-live',
          item: { id: `image-${index}`, type: 'imageGeneration', result: pngBase64 },
        },
      })
    }

    expect(sanitizer).toHaveBeenCalledTimes(2)
    expect(internals.capturedItemSanitizeQueue).toHaveLength(32)
    expect(maxActiveSanitizers).toBe(2)

    appServer.dispose()
    expect(internals.capturedItemSanitizeQueue).toHaveLength(0)
    expect(internals.activeCapturedItemSanitizations).toBe(0)

    internals.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-after-restart',
        turnId: 'turn-live',
        item: { id: 'image-after-restart', type: 'imageGeneration', result: pngBase64 },
      },
    })
    expect(sanitizer).toHaveBeenCalledTimes(3)
    for (const release of releases) release()
    await vi.waitFor(() => expect(activeSanitizers).toBe(0))
    expect(sanitizer).toHaveBeenCalledTimes(3)
  })

  it('waits for bounded queue capacity when a read needs an unqueued image', async () => {
    let releaseSanitizers: (() => void) | undefined
    const sanitizerGate = new Promise<void>((resolve) => {
      releaseSanitizers = resolve
    })
    const sanitizer = vi.fn(async (turnId: string, items: unknown[]) => {
      await sanitizerGate
      return sanitizeThreadItemsForTurn(turnId, items)
    })
    const appServer = new AppServerProcess(sanitizer)
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      capturedItemSanitizeQueue: unknown[]
    }

    for (let index = 0; index < 35; index += 1) {
      internals.emitNotification({
        method: 'item/completed',
        params: {
          threadId: `thread-image-${index}`,
          turnId: 'turn-live',
          item: { id: `image-${index}`, type: 'imageGeneration', result: pngBase64 },
        },
      })
    }
    expect(sanitizer).toHaveBeenCalledTimes(2)
    expect(internals.capturedItemSanitizeQueue).toHaveLength(32)

    const mergedPromises = [
      appServer.mergeItemsIntoTurns('thread-image-34', [{ id: 'turn-live', items: [] }]),
      appServer.mergeItemsIntoTurns('thread-image-34', [{ id: 'turn-live', items: [] }]),
    ]
    await Promise.resolve()
    expect(internals.capturedItemSanitizeQueue).toHaveLength(32)
    releaseSanitizers?.()

    const mergedResults = await Promise.all(mergedPromises) as Array<Array<{ items: Array<Record<string, unknown>> }>>
    for (const merged of mergedResults) {
      expect(merged[0].items[0].type).toBe('imageView')
      expect(merged[0].items[0]).not.toHaveProperty('result')
      expect(existsSync(merged[0].items[0].path as string)).toBe(true)
    }
    expect(sanitizer).toHaveBeenCalledTimes(35)
    expect(internals.capturedItemSanitizeQueue.length).toBeLessThanOrEqual(32)
    appServer.dispose()
  })

  it('can append captured images to a pending thread recovery with no materialized turns', async () => {
    const appServer = new AppServerProcess()
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
    }
    internals.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-pending',
        turnId: 'turn-pending',
        item: { id: 'image-pending', type: 'imageGeneration', result: pngBase64 },
      },
    })

    const merged = await mergeCapturedItemsIntoThreadResult(appServer, {
      thread: { id: 'thread-pending', turns: [], status: { type: 'inProgress' } },
    }, true) as { thread: { turns: Array<{ id: string; items: Array<Record<string, unknown>> }> } }

    expect(merged.thread.turns).toHaveLength(1)
    expect(merged.thread.turns[0].id).toBe('turn-pending')
    expect(merged.thread.turns[0].items[0].type).toBe('imageView')
    expect(merged.thread.turns[0].items[0]).not.toHaveProperty('result')
  })

  it('bounds notification generations and clears them on disposal', () => {
    const appServer = new AppServerProcess()
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      notificationGenerationByThreadId: Map<string, number>
    }

    const staleGeneration = appServer.getNotificationGeneration('thread-stale')
    internals.emitNotification({ method: 'turn/started', params: { threadId: 'thread-stale' } })
    for (let index = 0; index < 1005; index += 1) {
      internals.emitNotification({
        method: 'turn/started',
        params: { threadId: `thread-generation-${index}` },
      })
    }

    expect(internals.notificationGenerationByThreadId.size).toBe(1000)
    expect(internals.notificationGenerationByThreadId.has('thread-stale')).toBe(false)
    expect(internals.notificationGenerationByThreadId.has('thread-generation-0')).toBe(false)
    expect(internals.notificationGenerationByThreadId.get('thread-generation-1004')).toBe(1006)
    expect(appServer.cacheLiveStateIfCurrent('thread-stale', staleGeneration, { stale: true }, 1, 1)).toBe(false)
    expect(appServer.storeThreadReadSnapshotIfCurrent('thread-stale', staleGeneration, { stale: true })).toBe(false)
    appServer.dispose()
    expect(internals.notificationGenerationByThreadId.size).toBe(0)
  })

  it('shares live image cleanup, defers replacements, and merges them into thread reads', async () => {
    let releaseSanitizer: (() => void) | undefined
    const sanitizerGate = new Promise<void>((resolve) => {
      releaseSanitizer = resolve
    })
    const sanitizer = vi.fn(async (turnId: string, items: unknown[]) => {
      await sanitizerGate
      return sanitizeThreadItemsForTurn(turnId, items)
    })
    const appServer = new AppServerProcess(sanitizer)
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      capturedItemsByThreadId: Map<string, Map<string, { data: Record<string, unknown>; sanitized: boolean }>>
    }
    const turns = [{ id: 'turn-live', items: [] }]

    internals.emitNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-live',
        turnId: 'turn-live',
        item: { id: 'generated-live', type: 'imageGeneration', result: pngBase64 },
      },
    })
    const firstRead = appServer.mergeItemsIntoTurns('thread-live', turns)
    const concurrentRead = appServer.mergeItemsIntoTurns('thread-live', turns)
    const notificationGeneration = appServer.getNotificationGeneration('thread-live')
    expect(sanitizer).toHaveBeenCalledTimes(1)

    internals.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-live',
        turnId: 'turn-live',
        item: { id: 'generated-live', type: 'imageGeneration', result: pngBase64 },
      },
    })
    releaseSanitizer?.()

    for (const mergedTurns of await Promise.all([firstRead, concurrentRead])) {
      expect((mergedTurns[0] as { items: unknown[] }).items).toEqual([])
    }
    expect(sanitizer).toHaveBeenCalledTimes(2)

    const mergedResult = await mergeCapturedItemsIntoThreadResult(appServer, {
      thread: { id: 'thread-live', turns },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }
    const imageView = mergedResult.thread.turns[0].items[0]
    expect(sanitizer).toHaveBeenCalledTimes(2)
    expect(imageView.type).toBe('imageView')
    expect(imageView).not.toHaveProperty('result')
    expect(existsSync(imageView.path as string)).toBe(true)

    const cachedCapture = internals.capturedItemsByThreadId.get('thread-live')?.get('generated-live')
    expect(cachedCapture?.sanitized).toBe(true)
    expect(cachedCapture?.data).not.toHaveProperty('result')
    expect(appServer.cacheLiveStateIfCurrent('thread-live', notificationGeneration, { stale: true }, 1, 1)).toBe(false)
    expect(appServer.getCachedLiveState('thread-live', 1, 1)).toBeNull()
    expect(appServer.storeThreadReadSnapshotIfCurrent('thread-live', notificationGeneration, { stale: true })).toBe(false)
    expect(appServer.getLastThreadReadSnapshot('thread-live')).toBeNull()

    await mergeCapturedItemsIntoThreadResult(appServer, mergedResult)
    expect(internals.capturedItemsByThreadId.has('thread-live')).toBe(false)
  })

  it('replaces a materialized image placeholder with its completed capture', async () => {
    const [persistedPlaceholder] = await sanitizeThreadItemsForTurn('turn-placeholder', [{
      id: 'placeholder-source',
      type: 'imageGeneration',
      result: pngBase64,
    }]) as Array<Record<string, unknown>>
    const appServer = new AppServerProcess()
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      capturedItemsByThreadId: Map<string, Map<string, unknown>>
    }
    internals.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-live',
        turnId: 'turn-live',
        item: { id: 'generated-live', type: 'imageGeneration', result: pngBase64 },
      },
    })

    const merged = await appServer.mergeItemsIntoTurns('thread-live', [{
      id: 'turn-live',
      items: [{
        id: 'generated-live',
        type: 'imageGeneration',
        status: 'inProgress',
        path: persistedPlaceholder.path,
      }],
    }]) as Array<{ items: Array<Record<string, unknown>> }>

    expect(merged[0].items).toHaveLength(1)
    expect(merged[0].items[0].type).toBe('imageView')
    expect(merged[0].items[0]).not.toHaveProperty('result')
    expect(existsSync(merged[0].items[0].path as string)).toBe(true)
    expect(internals.capturedItemsByThreadId.has('thread-live')).toBe(true)
  })

  it('isolates captured-image cleanup failures and retries the failed item later', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sanitizer = vi.fn(async (turnId: string, items: unknown[]) => {
      const item = items[0] as { id?: string }
      if (item.id === 'failed-image') throw new Error('temporary write failure')
      return sanitizeThreadItemsForTurn(turnId, items)
    })
    const appServer = new AppServerProcess(sanitizer)
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
    }
    for (const itemId of ['failed-image', 'valid-image']) {
      internals.emitNotification({
        method: 'item/completed',
        params: {
          threadId: 'thread-live',
          turnId: 'turn-live',
          item: { id: itemId, type: 'imageGeneration', result: pngBase64 },
        },
      })
    }

    const first = await appServer.mergeItemsIntoTurns('thread-live', [{ id: 'turn-live', items: [] }]) as Array<{ items: Array<Record<string, unknown>> }>
    expect(first[0].items.map((item) => item.id)).toEqual(['valid-image'])
    expect(sanitizer).toHaveBeenCalledTimes(2)
    expect(logSpy).toHaveBeenCalledTimes(1)

    const second = await appServer.mergeItemsIntoTurns('thread-live', [{ id: 'turn-live', items: [] }]) as Array<{ items: Array<Record<string, unknown>> }>
    expect(second[0].items.map((item) => item.id)).toEqual(['valid-image'])
    expect(sanitizer).toHaveBeenCalledTimes(3)
    expect(logSpy).toHaveBeenCalledTimes(2)
  })

  it('externalizes inline image data from common thread payload fields', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'user-1',
                type: 'userMessage',
                content: [{ type: 'image', url: pngDataUrl }],
                images: [pngDataUrl],
              },
              {
                id: 'generated-1',
                type: 'imageGeneration',
                result: pngBase64,
              },
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: pngBase64,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<Record<string, unknown>>
        }>
      }
    }

    const [userMessage, generatedImage, toolOutput] = result.thread.turns[0].items
    const content = userMessage.content as Array<Record<string, unknown>>
    const images = userMessage.images as string[]

    expect(content[0].url).toMatch(/^\/codex-local-image\?path=/)
    expect(images[0]).toMatch(/^\/codex-local-image\?path=/)
    expect(generatedImage.type).toBe('imageView')
    expect(generatedImage.path).toEqual(expect.any(String))
    expect(generatedImage).not.toHaveProperty('result')
    expect(JSON.stringify(generatedImage).length).toBeLessThan(512)
    expect(toolOutput.result).toMatch(/^\/codex-local-image\?path=/)

    expect(existsSync(localImagePathFromProxyUrl(content[0].url as string))).toBe(true)
    expect(existsSync(localImagePathFromProxyUrl(images[0]))).toBe(true)
    expect(existsSync(generatedImage.path as string)).toBe(true)
    expect(existsSync(localImagePathFromProxyUrl(toolOutput.result as string))).toBe(true)
  })

  it('removes duplicate generated-image payload fields when an image view already has a valid local path', async () => {
    const generated = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{ id: 'generated-1', type: 'imageGeneration', result: pngBase64 }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }
    const imagePath = generated.thread.turns[0].items[0].path

    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{
            id: 'generated-1',
            type: 'imageView',
            path: imagePath,
            result: pngBase64,
            b64_json: pngBase64,
            image: pngBase64,
          }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const imageView = result.thread.turns[0].items[0]
    expect(imageView.path).toBe(imagePath)
    expect(imageView).not.toHaveProperty('result')
    expect(imageView).not.toHaveProperty('b64_json')
    expect(imageView).not.toHaveProperty('image')
    expect(JSON.stringify(imageView).length).toBeLessThan(512)
  })

  it('restores an image view from inline fallback data when its path is unavailable', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{
            id: 'generated-1',
            type: 'imageView',
            path: '/tmp/codex-web-inline-media/missing-image.png',
            result: pngBase64,
          }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const imageView = result.thread.turns[0].items[0]
    expect(imageView).not.toHaveProperty('result')
    expect(imageView.path).toEqual(expect.any(String))
    expect(existsSync(imageView.path as string)).toBe(true)
  })

  it('uses the first valid image fallback when an earlier payload field is malformed', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [
            {
              id: 'generated-1',
              type: 'imageView',
              path: '/tmp/codex-web-inline-media/missing-image.png',
              result: 'stale-image-result',
              b64_json: pngBase64,
            },
            {
              id: 'generated-2',
              type: 'imageView',
              path: '/tmp/codex-web-inline-media/also-missing.png',
              result: 'stale-image-result',
              b64_json: 'also-stale',
              image: pngBase64,
            },
          ],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const imageViews = result.thread.turns[0].items
    for (const imageView of imageViews) {
      expect(imageView).not.toHaveProperty('result')
      expect(imageView).not.toHaveProperty('b64_json')
      expect(imageView).not.toHaveProperty('image')
      expect(imageView.path).toEqual(expect.any(String))
      expect(existsSync(imageView.path as string)).toBe(true)
    }
  })

  it('uses the first valid fallback for an unnormalized image generation item', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [
            {
              id: 'generated-1',
              type: 'imageGeneration',
              result: 'stale-image-result',
              b64_json: jpegBase64,
              mime_type: 'image/png',
            },
            {
              id: 'generated-2',
              type: 'image_generation',
              result: 'stale-image-result',
              b64_json: 'also-stale',
              image: gifBase64,
            },
          ],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const [jpegView, gifView] = result.thread.turns[0].items
    for (const imageView of [jpegView, gifView]) {
      expect(imageView.type).toBe('imageView')
      expect(imageView).not.toHaveProperty('result')
      expect(imageView).not.toHaveProperty('b64_json')
      expect(imageView).not.toHaveProperty('image')
      expect(existsSync(imageView.path as string)).toBe(true)
    }
    expect(jpegView.path).toMatch(/\.jpg$/u)
    expect(gifView.path).toMatch(/\.gif$/u)
  })

  it('recovers generated images whose only fallback is in URL or image-list fields', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [
            { id: 'url-only', type: 'imageGeneration', url: `data:image/png;charset=utf-8;base64,${pngBase64}` },
            { id: 'image-url-only', type: 'imageGeneration', image_url: jpegBase64 },
            { id: 'images-only', type: 'imageGeneration', images: ['invalid', { url: `data:image/gif;base64,${gifBase64}` }] },
          ],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const [pngView, jpegView, gifView] = result.thread.turns[0].items
    expect(pngView.path).toMatch(/\.png$/u)
    expect(jpegView.path).toMatch(/\.jpg$/u)
    expect(gifView.path).toMatch(/\.gif$/u)
    for (const imageView of [pngView, jpegView, gifView]) {
      expect(imageView.type).toBe('imageView')
      expect(existsSync(imageView.path as string)).toBe(true)
      expect(imageView).not.toHaveProperty('url')
      expect(imageView).not.toHaveProperty('image_url')
      expect(imageView).not.toHaveProperty('images')
    }
  })

  it('bounds generated-image list fallback scanning', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{
            id: 'images-over-budget',
            type: 'imageGeneration',
            images: [...Array.from({ length: 32 }, () => 'invalid'), pngBase64],
          }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const image = result.thread.turns[0].items[0]
    expect(image.type).toBe('imageGeneration')
    expect(image).not.toHaveProperty('path')
    expect(image).not.toHaveProperty('images')
  })

  it('omits an invalid captured image and leaves it retryable', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const appServer = new AppServerProcess()
    const internals = appServer as unknown as {
      emitNotification: (notification: { method: string; params: unknown }) => void
      capturedItemsByThreadId: Map<string, Map<string, { sanitized: boolean; data: Record<string, unknown> }>>
    }
    internals.emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-invalid-image',
        turnId: 'turn-live',
        item: { id: 'invalid-image', type: 'imageGeneration', result: 'iVBORw0KGgoAAAAA' },
      },
    })

    const merged = await appServer.mergeItemsIntoTurns('thread-invalid-image', [{ id: 'turn-live', items: [] }]) as Array<{ items: unknown[] }>
    const captured = internals.capturedItemsByThreadId.get('thread-invalid-image')?.get('invalid-image')
    expect(merged[0].items).toEqual([])
    expect(captured?.sanitized).toBe(false)
    expect(captured?.data).toHaveProperty('result')
    expect(logSpy).toHaveBeenCalledTimes(1)
    appServer.dispose()
  })

  it('skips a truncated image header before a complete fallback', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/resume', {
      thread: {
        id: 'thread-1',
        turns: [{
          id: 'turn-1',
          items: [{
            id: 'generated-1',
            type: 'imageGeneration',
            result: 'Qk0AAAAA',
            b64_json: pngBase64,
          }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const imageView = result.thread.turns[0].items[0]
    expect(imageView.path).toMatch(/\.png$/u)
    expect(existsSync(imageView.path as string)).toBe(true)
    expect(imageView).not.toHaveProperty('result')
    expect(imageView).not.toHaveProperty('b64_json')
  })

  it('skips a WebP extended header without image data before a complete fallback', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{
            id: 'generated-1',
            type: 'imageGeneration',
            result: webpExtendedHeaderOnlyBase64,
            b64_json: pngBase64,
          }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const imageView = result.thread.turns[0].items[0]
    expect(imageView.path).toMatch(/\.png$/u)
    expect(existsSync(imageView.path as string)).toBe(true)
    expect(imageView).not.toHaveProperty('result')
    expect(imageView).not.toHaveProperty('b64_json')
  })

  it('accepts an animated WebP whose raster chunk is nested in a frame', async () => {
    const [imageView] = await sanitizeThreadItemsForTurn('turn-animated', [{
      id: 'generated-animated',
      type: 'imageGeneration',
      result: animatedWebpContainerBase64,
    }]) as Array<Record<string, unknown>>

    expect(imageView.path).toMatch(/\.webp$/u)
    expect(existsSync(imageView.path as string)).toBe(true)
    expect(imageView).not.toHaveProperty('result')
  })

  it('sanitizes generated images captured after the materialized thread read', async () => {
    const items = await sanitizeThreadItemsForTurn('turn-live', [{
      id: 'generated-live',
      type: 'imageGeneration',
      result: pngBase64,
    }]) as Array<Record<string, unknown>>

    expect(items[0].type).toBe('imageView')
    expect(items[0]).not.toHaveProperty('result')
    expect(items[0].path).toEqual(expect.any(String))
    expect(existsSync(items[0].path as string)).toBe(true)
  })

  it('persists raw AVIF and BMP fallbacks with extensions accepted by the image route', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [
            { id: 'avif-1', type: 'imageView', path: '/missing.avif', result: avifBase64 },
            { id: 'bmp-1', type: 'imageView', path: '/missing.bmp', result: bmpBase64 },
          ],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const [avifView, bmpView] = result.thread.turns[0].items
    expect(avifView.path).toMatch(/\.avif$/u)
    expect(bmpView.path).toMatch(/\.bmp$/u)
    expect(existsSync(avifView.path as string)).toBe(true)
    expect(existsSync(bmpView.path as string)).toBe(true)
  })

  it('normalizes a local image proxy path before returning an image view', async () => {
    const generated = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{ id: 'generated-1', type: 'imageGeneration', result: pngBase64 }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }
    const imagePath = generated.thread.turns[0].items[0].path as string

    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{
            id: 'generated-1',
            type: 'imageView',
            path: `/codex-local-image?path=${encodeURIComponent(imagePath)}`,
            result: pngBase64,
            url: pngDataUrl,
            image_url: pngDataUrl,
            images: [pngDataUrl],
          }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const imageView = result.thread.turns[0].items[0]
    expect(imageView.path).toBe(imagePath)
    expect(imageView).not.toHaveProperty('result')
    expect(imageView).not.toHaveProperty('url')
    expect(imageView).not.toHaveProperty('image_url')
    expect(imageView).not.toHaveProperty('images')
  })

  it('normalizes a local file URL before removing duplicate image payloads', async () => {
    const generated = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{ id: 'generated-1', type: 'imageGeneration', result: pngBase64 }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }
    const imagePath = generated.thread.turns[0].items[0].path as string

    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [{
          id: 'turn-1',
          items: [{
            id: 'generated-1',
            type: 'imageView',
            path: pathToFileURL(imagePath).href,
            result: pngBase64,
          }],
        }],
      },
    }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

    const imageView = result.thread.turns[0].items[0]
    expect(imageView.path).toBe(imagePath)
    expect(imageView).not.toHaveProperty('result')
  })

  it('uses an inline fallback when an existing image path cannot be served', async () => {
    const unsupportedPath = join(tmpdir(), `codex-image-${randomUUID()}.bin`)
    await writeFile(unsupportedPath, Buffer.from(pngBase64, 'base64'))

    try {
      const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
        thread: {
          turns: [{
            id: 'turn-1',
            items: [{
              id: 'generated-1',
              type: 'imageView',
              path: unsupportedPath,
              result: pngBase64,
            }],
          }],
        },
      }) as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }

      const imageView = result.thread.turns[0].items[0]
      expect(imageView.path).not.toBe(unsupportedPath)
      expect(imageView.path).toMatch(/\.png$/u)
      expect(existsSync(imageView.path as string)).toBe(true)
      expect(imageView).not.toHaveProperty('result')
    } finally {
      await rm(unsupportedPath, { force: true })
    }
  })

  it('leaves non-image result strings untouched', async () => {
    const textResult = 'a'.repeat(128)
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: textResult,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ result: string }>
        }>
      }
    }

    expect(result.thread.turns[0].items[0].result).toBe(textResult)
  })

  it('leaves non-image data URLs untouched in image-like fields', async () => {
    const dataUrl = 'data:text/plain;base64,aGVsbG8='
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: dataUrl,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ result: string }>
        }>
      }
    }

    expect(result.thread.turns[0].items[0].result).toBe(dataUrl)
  })

  it('externalizes supported bare base64 image signatures with matching extensions', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                images: [jpegBase64, webpBase64, gifBase64],
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ images: string[] }>
        }>
      }
    }

    const images = result.thread.turns[0].items[0].images
    expect(images).toHaveLength(3)
    expect(images.every((image) => image.startsWith('/codex-local-image?path='))).toBe(true)

    const [jpegPath, webpPath, gifPath] = images.map(localImagePathFromProxyUrl)
    expect(jpegPath.endsWith('.jpg')).toBe(true)
    expect(webpPath.endsWith('.webp')).toBe(true)
    expect(gifPath.endsWith('.gif')).toBe(true)
    expect(existsSync(jpegPath)).toBe(true)
    expect(existsSync(webpPath)).toBe(true)
    expect(existsSync(gifPath)).toBe(true)
  })

  it('externalizes nested replacement history image URLs', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'message-1',
                type: 'message',
                replacement_history: [
                  {
                    content: [
                      {
                        type: 'image',
                        image_url: pngDataUrl,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{
            replacement_history: Array<{
              content: Array<{ image_url: string }>
            }>
          }>
        }>
      }
    }

    const imageUrl = result.thread.turns[0].items[0].replacement_history[0].content[0].image_url
    expect(imageUrl).toMatch(/^\/codex-local-image\?path=/)
    expect(existsSync(localImagePathFromProxyUrl(imageUrl))).toBe(true)
  })

  it('does not sanitize inline images for methods without thread turns', async () => {
    const payload = {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: pngBase64,
              },
            ],
          },
        ],
      },
    }

    const result = await sanitizeThreadTurnsInlinePayloads('thread/list', payload)

    expect(result).toBe(payload)
  })
})

describe('thread session skill recovery', () => {
  it('adds selected skill inputs from session JSONL to matching user messages', () => {
    const turns = [{
      id: 'turn-1',
      items: [{
        id: 'item-1',
        type: 'userMessage',
        content: [{ type: 'text', text: 'use a skill', text_elements: [] }],
      }],
    }]
    const sessionLog = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'use a skill' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: '<skill>\n<name>browser-use:browser</name>\n<path>/Users/igor/.codex/plugins/browser/SKILL.md</path>\n---\n# Browser\n</skill>',
          }],
        },
      }),
    ].join('\n')

    const merged = mergeSessionSkillInputsIntoTurns(turns, sessionLog) as typeof turns
    expect(merged[0].items[0].content).toEqual([
      { type: 'text', text: 'use a skill', text_elements: [] },
      { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/plugins/browser/SKILL.md' },
    ])
  })

  it('does not duplicate skill inputs that are already present', () => {
    const turns = [{
      id: 'turn-1',
      items: [{
        id: 'item-1',
        type: 'userMessage',
        content: [
          { type: 'text', text: 'use a skill', text_elements: [] },
          { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/plugins/browser/SKILL.md' },
        ],
      }],
    }]
    const sessionLog = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: '<skill>\n<name>browser-use:browser</name>\n<path>/Users/igor/.codex/plugins/browser/SKILL.md</path>\n</skill>',
          }],
        },
      }),
    ].join('\n')

    expect(mergeSessionSkillInputsIntoTurns(turns, sessionLog)).toBe(turns)
  })

  it('adds selected skill inputs to the last user message in a multi-message turn', () => {
    const turns = [{
      id: 'turn-1',
      items: [
        {
          id: 'item-1',
          type: 'userMessage',
          content: [{ type: 'text', text: 'first message', text_elements: [] }],
        },
        {
          id: 'item-2',
          type: 'agentMessage',
          content: [{ type: 'text', text: 'assistant reply', text_elements: [] }],
        },
        {
          id: 'item-3',
          type: 'userMessage',
          content: [{ type: 'text', text: 'second message', text_elements: [] }],
        },
      ],
    }]
    const sessionLog = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: '<skill>\n<name>browser-use:browser</name>\n<path>/Users/igor/.codex/plugins/browser/SKILL.md</path>\n</skill>',
          }],
        },
      }),
    ].join('\n')

    const merged = mergeSessionSkillInputsIntoTurns(turns, sessionLog) as typeof turns
    expect(merged[0].items[0].content).toEqual([{ type: 'text', text: 'first message', text_elements: [] }])
    expect(merged[0].items[2].content).toEqual([
      { type: 'text', text: 'second message', text_elements: [] },
      { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/plugins/browser/SKILL.md' },
    ])
  })
})

describe('backend queue scheduling', () => {
  it('reschedules a pending drain when a run-now request needs an earlier drain', async () => {
    vi.useFakeTimers()
    const processor = new BackendQueueProcessor({
      onNotification: () => () => undefined,
    } as never)
    const processThreadQueue = vi
      .spyOn(processor as unknown as { processThreadQueue: (threadId: string) => Promise<void> }, 'processThreadQueue')
      .mockResolvedValue(undefined)

    processor.scheduleThreadQueueDrain('thread-1', 5000)
    processor.scheduleThreadQueueDrain('thread-1', 0)

    await vi.advanceTimersByTimeAsync(0)
    expect(processThreadQueue).toHaveBeenCalledTimes(1)
    expect(processThreadQueue).toHaveBeenCalledWith('thread-1')

    await vi.advanceTimersByTimeAsync(5000)
    expect(processThreadQueue).toHaveBeenCalledTimes(1)

    processor.dispose()
  })
})

describe('automation TOML handling', () => {
  it('parses TOML string arrays without requiring JSON-only syntax', () => {
    const automation = parseAutomationToml([
      'version = 1',
      'id = "cron-smoke"',
      'kind = "cron"',
      'name = "Cron Smoke"',
      'prompt = "run"',
      'status = "ACTIVE"',
      'rrule = "FREQ=DAILY"',
      "cwds = ['/tmp/project-one', '/tmp/project,two']",
      'created_at = 111',
      'updated_at = 222',
      '[scheduler]',
      'execution_environment = "local"',
    ].join('\n'))

    expect(automation?.cwds).toEqual(['/tmp/project-one', '/tmp/project,two'])
    expect(automation?.createdAtMs).toBe(111)
    expect(automation?.extraTomlLines).toContain('[scheduler]')
  })

  it('omits preserved TOML internals from automation API records', () => {
    const automation = parseAutomationToml([
      'version = 1',
      'id = "cron-smoke"',
      'kind = "cron"',
      'name = "Cron Smoke"',
      'prompt = "run"',
      'status = "ACTIVE"',
      'rrule = "FREQ=DAILY"',
      'cwds = ["/tmp/project-one"]',
      '[scheduler]',
      'execution_environment = "local"',
    ].join('\n'))

    expect(automation).toBeTruthy()
    expect(toAutomationApiRecord(automation as NonNullable<typeof automation>)).not.toHaveProperty('extraTomlLines')
  })
})
