import { describe, expect, it } from 'vitest'
import type { CodexUiInvalidation } from '../realtimeProtocol'
import { DesktopStateCoordinator } from './desktopStateCoordinator'

type WatchListener = (eventType: string, filename: string | null) => void

function createHarness() {
  let nextTimerId = 1
  const timers = new Map<number, { callback: () => void; delayMs: number }>()
  const watchers = new Map<string, WatchListener>()
  const closed: string[] = []
  let fingerprint = 'initial'

  return {
    watchers,
    closed,
    setFingerprint(value: string) {
      fingerprint = value
    },
    dependencies: {
      exists: () => true,
      watch(path: string, listener: WatchListener) {
        watchers.set(path, listener)
        return { close: () => closed.push(path) }
      },
      schedule(callback: () => void, delayMs: number): number {
        const id = nextTimerId++
        timers.set(id, { callback, delayMs })
        return id
      },
      cancelSchedule(handle: unknown) {
        timers.delete(handle as number)
      },
      fingerprint: () => fingerprint,
      now: () => Date.parse('2026-08-31T00:00:00.000Z'),
    },
    delays() {
      return Array.from(timers.values()).map((timer) => timer.delayMs).sort((left, right) => left - right)
    },
    runDelay(delayMs: number) {
      const row = Array.from(timers.entries()).find(([, timer]) => timer.delayMs === delayMs)
      if (!row) throw new Error(`No timer scheduled for ${String(delayMs)}ms`)
      timers.delete(row[0])
      row[1].callback()
    },
  }
}

describe('DesktopStateCoordinator', () => {
  it('watches only the Codex root and two session directories', () => {
    const harness = createHarness()
    const coordinator = new DesktopStateCoordinator({
      codexHome: 'C:\\Users\\me\\.codex',
      ...harness.dependencies,
    })

    coordinator.start()

    expect(Array.from(harness.watchers.keys())).toEqual([
      'C:\\Users\\me\\.codex',
      'C:\\Users\\me\\.codex\\sessions',
      'C:\\Users\\me\\.codex\\archived_sessions',
    ])
    expect(harness.delays()).toEqual([30_000])
  })

  it('coalesces duplicate session changes into one scoped invalidation', () => {
    const harness = createHarness()
    const coordinator = new DesktopStateCoordinator({ codexHome: 'C:\\Codex', ...harness.dependencies })
    const events: CodexUiInvalidation[] = []
    coordinator.subscribe((event) => events.push(event))
    coordinator.start()

    harness.watchers.get('C:\\Codex\\sessions')?.('rename', 'rollout.jsonl')
    harness.watchers.get('C:\\Codex\\sessions')?.('change', 'rollout.jsonl')
    expect(harness.delays()).toEqual([250, 30_000])
    harness.runDelay(250)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      method: 'codex-ui/state-invalidated',
      params: { scopes: ['threads', 'projects'], reason: 'filesystem', revision: 1 },
      atIso: '2026-08-31T00:00:00.000Z',
    })
  })

  it('maps global state and native turn changes to targeted scopes', () => {
    const harness = createHarness()
    const coordinator = new DesktopStateCoordinator({ codexHome: 'C:\\Codex', ...harness.dependencies })
    const events: CodexUiInvalidation[] = []
    coordinator.subscribe((event) => events.push(event))
    coordinator.start()

    harness.watchers.get('C:\\Codex')?.('rename', '.codex-global-state.json')
    coordinator.noteNativeNotification({ method: 'turn/completed', params: { threadId: 'thread-1' } })
    harness.runDelay(250)

    expect(events[0]?.params).toEqual({
      scopes: ['threads', 'projects'],
      threadIds: ['thread-1'],
      reason: 'filesystem',
      revision: 1,
    })
  })

  it('emits a reconciliation invalidation when the fingerprint changes', () => {
    const harness = createHarness()
    const coordinator = new DesktopStateCoordinator({ codexHome: 'C:\\Codex', ...harness.dependencies })
    const events: CodexUiInvalidation[] = []
    coordinator.subscribe((event) => events.push(event))
    coordinator.start()

    harness.setFingerprint('changed')
    harness.runDelay(30_000)
    harness.runDelay(250)

    expect(events[0]?.params).toEqual({
      scopes: ['threads', 'projects'],
      reason: 'reconcile',
      revision: 1,
    })
    expect(harness.delays()).toEqual([30_000])
  })

  it('increments revisions and closes watchers and timers on stop', () => {
    const harness = createHarness()
    const coordinator = new DesktopStateCoordinator({ codexHome: 'C:\\Codex', ...harness.dependencies })
    const events: CodexUiInvalidation[] = []
    coordinator.subscribe((event) => events.push(event))
    coordinator.start()

    coordinator.noteNativeNotification({ method: 'thread/name/updated', params: { threadId: 'thread-1' } })
    harness.runDelay(250)
    coordinator.noteNativeNotification({ method: 'item/completed', params: { threadId: 'thread-1', item: { type: 'fileChange' } } })
    harness.runDelay(250)
    coordinator.stop()

    expect(events.map((event) => event.params.revision)).toEqual([1, 2])
    expect(events[1]?.params.scopes).toEqual(['threads', 'workspace'])
    expect(harness.closed).toHaveLength(3)
    expect(harness.delays()).toEqual([])
  })

  it('invalidates threads when the managed process recovers', () => {
    const harness = createHarness()
    const coordinator = new DesktopStateCoordinator({ codexHome: 'C:\\Codex', ...harness.dependencies })
    const events: CodexUiInvalidation[] = []
    coordinator.subscribe((event) => events.push(event))
    coordinator.start()

    coordinator.noteProcessHealth('restarting')
    harness.runDelay(250)
    coordinator.noteProcessHealth('ready')
    harness.runDelay(250)

    expect(events[0]?.params).toEqual({ scopes: ['health'], reason: 'app-server', revision: 1 })
    expect(events[1]?.params).toEqual({ scopes: ['health', 'threads'], reason: 'restart', revision: 2 })
  })
})
