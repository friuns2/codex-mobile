import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { CodexProcessManager } from './codexProcessManager'

class FakeChildProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly pid = 1234
  killed = false

  kill(): boolean {
    this.killed = true
    return true
  }
}

type TimerEntry = {
  callback: () => void
  delayMs: number
}

function createTimerHarness() {
  let nextId = 1
  const entries = new Map<number, TimerEntry>()

  return {
    schedule(callback: () => void, delayMs: number): number {
      const id = nextId++
      entries.set(id, { callback, delayMs })
      return id
    },
    cancel(id: unknown): void {
      entries.delete(id as number)
    },
    delays(): number[] {
      return Array.from(entries.values()).map((entry) => entry.delayMs).sort((left, right) => left - right)
    },
    runDelay(delayMs: number): void {
      const row = Array.from(entries.entries()).find(([, entry]) => entry.delayMs === delayMs)
      if (!row) throw new Error(`No timer scheduled for ${String(delayMs)}ms`)
      entries.delete(row[0])
      row[1].callback()
    },
    runAll(): void {
      for (const [id, entry] of Array.from(entries.entries())) {
        entries.delete(id)
        entry.callback()
      }
    },
  }
}

function asChild(value: FakeChildProcess): ChildProcessWithoutNullStreams {
  return value as unknown as ChildProcessWithoutNullStreams
}

function launchSpec() {
  return {
    command: 'codex',
    args: ['app-server'],
    commandSource: 'path' as const,
    codexHome: 'C:\\Users\\me\\.codex',
  }
}

describe('CodexProcessManager', () => {
  it('starts only one process and becomes ready', () => {
    const child = new FakeChildProcess()
    let spawnCount = 0
    const manager = new CodexProcessManager({
      spawn: () => {
        spawnCount += 1
        return asChild(child)
      },
    })

    manager.start(launchSpec(), () => {})
    manager.start(launchSpec(), () => {})

    expect(spawnCount).toBe(1)
    expect(manager.getHealth()).toMatchObject({
      state: 'starting',
      commandSource: 'path',
      codexHome: 'C:\\Users\\me\\.codex',
    })

    manager.markReady()
    expect(manager.getHealth().state).toBe('ready')
  })

  it('restarts crashes with bounded exponential backoff', () => {
    const timers = createTimerHarness()
    const children = [new FakeChildProcess(), new FakeChildProcess(), new FakeChildProcess()]
    let spawnIndex = 0
    const manager = new CodexProcessManager({
      spawn: () => asChild(children[spawnIndex++]!),
      random: () => 0,
      schedule: timers.schedule,
      cancelSchedule: timers.cancel,
    })

    manager.start(launchSpec(), () => {})
    children[0]!.emit('exit', 1, null)

    expect(manager.getHealth()).toMatchObject({ state: 'restarting', restartAttempts: 1, lastExitCode: 1 })
    expect(timers.delays()).toEqual([500])

    timers.runDelay(500)
    expect(manager.getHealth().state).toBe('starting')
    children[1]!.emit('exit', 2, null)

    expect(manager.getHealth()).toMatchObject({ state: 'restarting', restartAttempts: 2, lastExitCode: 2 })
    expect(timers.delays()).toEqual([1000])
  })

  it('resets restart attempts only after the ready process stays stable', () => {
    const timers = createTimerHarness()
    const children = [new FakeChildProcess(), new FakeChildProcess()]
    let spawnIndex = 0
    const manager = new CodexProcessManager({
      spawn: () => asChild(children[spawnIndex++]!),
      random: () => 0,
      schedule: timers.schedule,
      cancelSchedule: timers.cancel,
      stableReadyMs: 2_000,
    })

    manager.start(launchSpec(), () => {})
    children[0]!.emit('exit', 1, null)
    timers.runDelay(500)
    manager.markReady()

    expect(manager.getHealth().restartAttempts).toBe(1)
    timers.runDelay(2_000)
    expect(manager.getHealth()).toMatchObject({ state: 'ready', restartAttempts: 0 })
  })

  it('lets callers wait across a restart window', async () => {
    const timers = createTimerHarness()
    const children = [new FakeChildProcess(), new FakeChildProcess()]
    let spawnIndex = 0
    const manager = new CodexProcessManager({
      spawn: () => asChild(children[spawnIndex++]!),
      random: () => 0,
      schedule: timers.schedule,
      cancelSchedule: timers.cancel,
    })

    manager.start(launchSpec(), () => {})
    children[0]!.emit('exit', 1, null)
    const waiting = manager.waitForProcess(2_000)

    expect(timers.delays()).toEqual([500, 2_000])
    timers.runDelay(500)
    await expect(waiting).resolves.toBe(asChild(children[1]!))
  })

  it('bounds and redacts captured stderr', () => {
    const child = new FakeChildProcess()
    const manager = new CodexProcessManager({ spawn: () => asChild(child) })
    manager.start(launchSpec(), () => {})

    child.stderr.write('Authorization: Bearer secret-access-token\n')
    child.stderr.write('{"access_token":"private-token","message":"failed"}\n')
    child.stderr.write(Array.from({ length: 45 }, (_, index) => `line-${String(index)}`).join('\n'))

    const stderr = manager.getHealth().stderr
    expect(stderr.length).toBeLessThanOrEqual(40)
    expect(stderr.join('\n')).not.toContain('secret-access-token')
    expect(stderr.join('\n')).not.toContain('private-token')
    expect(stderr.at(-1)).toBe('line-44')
  })

  it('does not restart after an explicit stop', () => {
    const timers = createTimerHarness()
    const child = new FakeChildProcess()
    let spawnCount = 0
    const manager = new CodexProcessManager({
      spawn: () => {
        spawnCount += 1
        return asChild(child)
      },
      random: () => 0,
      schedule: timers.schedule,
      cancelSchedule: timers.cancel,
    })

    manager.start(launchSpec(), () => {})
    child.emit('error', new Error('spawn failed'))
    expect(manager.getHealth()).toMatchObject({ state: 'restarting', lastError: 'spawn failed' })

    manager.stop()
    timers.runAll()

    expect(manager.getHealth().state).toBe('stopped')
    expect(child.killed).toBe(true)
    expect(spawnCount).toBe(1)
  })
})
