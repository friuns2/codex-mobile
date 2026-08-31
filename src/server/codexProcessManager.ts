import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import { getSpawnInvocation } from '../utils/commandInvocation.js'
import type { CodexAppServerHealth, CodexCommandSource } from '../realtimeProtocol.js'

const MAX_STDERR_LINES = 40
const MAX_STDERR_BYTES = 16 * 1024
const MAX_RESTART_DELAY_MS = 10_000
const DEFAULT_STABLE_READY_MS = 30_000

type ScheduleHandle = unknown

type ProcessSpawner = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio & { stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams

export type CodexLaunchSpec = {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
  commandSource: Exclude<CodexCommandSource, 'unavailable'>
  codexHome: string
}

export type CodexProcessManagerDependencies = {
  spawn?: ProcessSpawner
  now?: () => number
  random?: () => number
  schedule?: (callback: () => void, delayMs: number) => ScheduleHandle
  cancelSchedule?: (handle: ScheduleHandle) => void
  stableReadyMs?: number
  platform?: NodeJS.Platform
}

function sanitizeDiagnosticLine(line: string): string {
  return line
    .replace(/(Bearer\s+)[^\s"',}]+/giu, '$1[redacted]')
    .replace(/("(?:access_token|refresh_token|id_token|token|password)"\s*:\s*")[^"]*(")/giu, '$1[redacted]$2')
    .replace(/([?&](?:access_token|refresh_token|token|password|api_key)=)[^&\s]+/giu, '$1[redacted]')
}

export class CodexProcessManager {
  private readonly spawnProcess: ProcessSpawner
  private readonly now: () => number
  private readonly random: () => number
  private readonly schedule: (callback: () => void, delayMs: number) => ScheduleHandle
  private readonly cancelSchedule: (handle: ScheduleHandle) => void
  private readonly stableReadyMs: number
  private readonly platform: NodeJS.Platform
  private readonly healthListeners = new Set<(health: CodexAppServerHealth) => void>()
  private child: ChildProcessWithoutNullStreams | null = null
  private launchSpec: CodexLaunchSpec | null = null
  private attachProcess: ((process: ChildProcessWithoutNullStreams) => void) | null = null
  private restartTimer: ScheduleHandle | null = null
  private stableTimer: ScheduleHandle | null = null
  private stopping = false
  private health: CodexAppServerHealth = {
    state: 'stopped',
    commandSource: 'unavailable',
    codexHome: '',
    startedAtIso: null,
    lastReadyAtIso: null,
    restartAttempts: 0,
    lastExitCode: null,
    lastError: null,
    stderr: [],
  }

  constructor(dependencies: CodexProcessManagerDependencies = {}) {
    this.spawnProcess = dependencies.spawn ?? ((command, args, options) => spawn(command, args, options))
    this.now = dependencies.now ?? Date.now
    this.random = dependencies.random ?? Math.random
    this.schedule = dependencies.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.cancelSchedule = dependencies.cancelSchedule ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
    this.stableReadyMs = dependencies.stableReadyMs ?? DEFAULT_STABLE_READY_MS
    this.platform = dependencies.platform ?? process.platform
  }

  start(spec: CodexLaunchSpec, attach: (process: ChildProcessWithoutNullStreams) => void): void {
    this.launchSpec = spec
    this.attachProcess = attach
    this.stopping = false
    if (this.child || this.restartTimer !== null) return
    this.spawnNow()
  }

  markReady(): void {
    if (!this.child || this.stopping) return
    this.clearStableTimer()
    const readyChild = this.child
    this.health = {
      ...this.health,
      state: 'ready',
      lastReadyAtIso: new Date(this.now()).toISOString(),
      lastError: null,
    }
    this.emitHealth()
    this.stableTimer = this.schedule(() => {
      this.stableTimer = null
      if (this.stopping || this.child !== readyChild || this.health.state !== 'ready') return
      if (this.health.restartAttempts === 0) return
      this.health = { ...this.health, restartAttempts: 0 }
      this.emitHealth()
    }, this.stableReadyMs)
  }

  reportUnavailable(codexHome: string, message: string): void {
    this.stopProcessAndTimers()
    this.health = {
      ...this.health,
      state: 'failed',
      commandSource: 'unavailable',
      codexHome,
      lastError: message,
    }
    this.emitHealth()
  }

  getHealth(): CodexAppServerHealth {
    return {
      ...this.health,
      stderr: [...this.health.stderr],
    }
  }

  subscribeHealth(listener: (health: CodexAppServerHealth) => void): () => void {
    this.healthListeners.add(listener)
    listener(this.getHealth())
    return () => {
      this.healthListeners.delete(listener)
    }
  }

  getProcess(): ChildProcessWithoutNullStreams | null {
    return this.child
  }

  waitForProcess(timeoutMs = 15_000): Promise<ChildProcessWithoutNullStreams> {
    if (this.child) return Promise.resolve(this.child)
    if (this.stopping || !this.launchSpec) {
      return Promise.reject(new Error(this.health.lastError || 'codex app-server is not available'))
    }

    return new Promise((resolve, reject) => {
      let settled = false
      let timeoutHandle: ScheduleHandle | null = null
      const cleanup = () => {
        this.healthListeners.delete(onHealth)
        if (timeoutHandle !== null) {
          this.cancelSchedule(timeoutHandle)
          timeoutHandle = null
        }
      }
      const onHealth = (health: CodexAppServerHealth) => {
        if (settled) return
        if (this.child) {
          settled = true
          const child = this.child
          cleanup()
          resolve(child)
          return
        }
        if (health.state === 'failed' || health.state === 'stopped') {
          settled = true
          cleanup()
          reject(new Error(health.lastError || 'codex app-server is not available'))
        }
      }

      this.healthListeners.add(onHealth)
      timeoutHandle = this.schedule(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(`Timed out waiting ${String(timeoutMs)}ms for codex app-server`))
      }, timeoutMs)
      onHealth(this.getHealth())
    })
  }

  stop(): void {
    this.stopping = true
    this.stopProcessAndTimers()
    this.launchSpec = null
    this.attachProcess = null
    this.health = {
      ...this.health,
      state: 'stopped',
      restartAttempts: 0,
    }
    this.emitHealth()
  }

  private spawnNow(): void {
    const spec = this.launchSpec
    const attach = this.attachProcess
    if (!spec || !attach || this.stopping || this.child) return

    const invocation = getSpawnInvocation(spec.command, spec.args, this.platform)
    let child: ChildProcessWithoutNullStreams
    try {
      child = this.spawnProcess(invocation.command, invocation.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(spec.env ? { env: spec.env } : {}),
      })
    } catch (error) {
      this.handleSpawnFailure(error)
      return
    }

    this.child = child
    this.health = {
      ...this.health,
      state: 'starting',
      commandSource: spec.commandSource,
      codexHome: spec.codexHome,
      startedAtIso: new Date(this.now()).toISOString(),
      lastExitCode: null,
      lastError: null,
    }
    this.emitHealth()

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string | Buffer) => {
      this.captureStderr(String(chunk))
    })
    child.once('error', (error) => {
      if (this.child !== child || this.stopping) return
      try {
        child.kill('SIGTERM')
      } catch {
        // The failed spawn may not have an operating-system process to kill.
      }
      this.child = null
      this.handleSpawnFailure(error)
    })
    child.once('exit', (code) => {
      if (this.child !== child) return
      this.child = null
      this.clearStableTimer()
      if (this.stopping) return
      this.health = {
        ...this.health,
        lastExitCode: typeof code === 'number' ? code : null,
        lastError: code === 0 ? 'codex app-server exited unexpectedly' : `codex app-server exited with code ${String(code)}`,
      }
      this.scheduleRestart()
    })

    try {
      attach(child)
    } catch (error) {
      try {
        child.kill('SIGTERM')
      } catch {
        // Ignore cleanup failure and report the attach error.
      }
      if (this.child === child) this.child = null
      this.handleSpawnFailure(error)
    }
  }

  private handleSpawnFailure(error: unknown): void {
    this.clearStableTimer()
    this.health = {
      ...this.health,
      lastError: error instanceof Error ? error.message : String(error),
    }
    this.scheduleRestart()
  }

  private scheduleRestart(): void {
    if (this.stopping || this.restartTimer !== null || !this.launchSpec) return
    const restartAttempts = this.health.restartAttempts + 1
    const baseDelay = Math.min(500 * (2 ** (restartAttempts - 1)), MAX_RESTART_DELAY_MS)
    const jitter = Math.floor(baseDelay * 0.2 * Math.max(0, Math.min(1, this.random())))
    this.health = {
      ...this.health,
      state: 'restarting',
      restartAttempts,
    }
    this.emitHealth()
    this.restartTimer = this.schedule(() => {
      this.restartTimer = null
      this.spawnNow()
    }, baseDelay + jitter)
  }

  private captureStderr(chunk: string): void {
    const nextLines = chunk
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(sanitizeDiagnosticLine)
    if (nextLines.length === 0) return

    const stderr = [...this.health.stderr, ...nextLines]
    while (stderr.length > MAX_STDERR_LINES || Buffer.byteLength(stderr.join('\n'), 'utf8') > MAX_STDERR_BYTES) {
      stderr.shift()
    }
    this.health = { ...this.health, stderr }
    this.emitHealth()
  }

  private stopProcessAndTimers(): void {
    if (this.restartTimer !== null) {
      this.cancelSchedule(this.restartTimer)
      this.restartTimer = null
    }
    this.clearStableTimer()
    const child = this.child
    this.child = null
    if (!child) return
    try {
      child.stdin.end()
    } catch {
      // Ignore close errors during shutdown.
    }
    try {
      child.kill('SIGTERM')
    } catch {
      // Ignore process cleanup errors during shutdown.
    }
  }

  private clearStableTimer(): void {
    if (this.stableTimer === null) return
    this.cancelSchedule(this.stableTimer)
    this.stableTimer = null
  }

  private emitHealth(): void {
    const snapshot = this.getHealth()
    for (const listener of this.healthListeners) {
      listener(snapshot)
    }
  }
}
