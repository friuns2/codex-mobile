import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CollaborationModeKind, ReasoningEffort } from '../types/codex.js'
import { normalizeStringArray } from './globalStateStore.js'
import { AppServerProcess } from './appServerProcess.js'
import type { ThreadAutomationRecord } from './threadAutomations.js'

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getCodexGlobalStatePath(): string {
  return join(getCodexHomeDir(), '.codex-global-state.json')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

const THREAD_QUEUE_STATE_KEY = 'thread-queue-state'

export type StoredQueuedMessage = {
  id: string
  text: string
  imageUrls: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  collaborationMode: 'default' | 'plan'
}

export type ThreadQueueState = Record<string, StoredQueuedMessage[]>

type BackendQueuedTurn = {
  threadId: string
  message: StoredQueuedMessage
}

export type ThreadQueueStateUpdate<T> = {
  nextState: ThreadQueueState
  result: T
}

type ResolvedCollaborationModeSettings = {
  model: string
  reasoningEffort: ReasoningEffort | null
}

function normalizeStoredQueuedMessage(value: unknown): StoredQueuedMessage | null {
  const record = asRecord(value)
  if (!record) return null

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return null

  const normalizeNamedPathItems = (items: unknown): Array<{ name: string; path: string }> => {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const itemRecord = asRecord(item)
      if (!itemRecord) return []
      const name = typeof itemRecord.name === 'string' ? itemRecord.name.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      return name && path ? [{ name, path }] : []
    })
  }

  const normalizeFileAttachments = (items: unknown): Array<{ label: string; path: string; fsPath: string }> => {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const itemRecord = asRecord(item)
      if (!itemRecord) return []
      const label = typeof itemRecord.label === 'string' ? itemRecord.label.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      const fsPath = typeof itemRecord.fsPath === 'string' ? itemRecord.fsPath.trim() : ''
      return label && path && fsPath ? [{ label, path, fsPath }] : []
    })
  }

  return {
    id,
    text: typeof record.text === 'string' ? record.text : '',
    imageUrls: normalizeStringArray(record.imageUrls),
    skills: normalizeNamedPathItems(record.skills),
    fileAttachments: normalizeFileAttachments(record.fileAttachments),
    collaborationMode: record.collaborationMode === 'plan' ? 'plan' : 'default',
  }
}

export function normalizeThreadQueueState(value: unknown): ThreadQueueState {
  const record = asRecord(value)
  if (!record) return {}

  const state: ThreadQueueState = {}
  for (const [threadId, rawMessages] of Object.entries(record)) {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId || !Array.isArray(rawMessages)) continue
    const messages = rawMessages.flatMap((item) => {
      const message = normalizeStoredQueuedMessage(item)
      return message ? [message] : []
    })
    if (messages.length > 0) {
      state[normalizedThreadId] = messages
    }
  }
  return state
}

let threadQueueMutationChain: Promise<unknown> = Promise.resolve()

export async function readThreadQueueState(): Promise<ThreadQueueState> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadQueueState(payload[THREAD_QUEUE_STATE_KEY])
  } catch {
    return {}
  }
}

export async function writeThreadQueueStateUnlocked(nextState: ThreadQueueState): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  const normalized = normalizeThreadQueueState(nextState)
  if (Object.keys(normalized).length > 0) {
    payload[THREAD_QUEUE_STATE_KEY] = normalized
  } else {
    delete payload[THREAD_QUEUE_STATE_KEY]
  }
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

async function withThreadQueueStateUpdate<T>(
  update: (state: ThreadQueueState) => ThreadQueueStateUpdate<T> | Promise<ThreadQueueStateUpdate<T>>,
): Promise<T> {
  const run = threadQueueMutationChain.then(async () => {
    const currentState = await readThreadQueueState()
    const { nextState, result } = await update(currentState)
    await writeThreadQueueStateUnlocked(nextState)
    return result
  })
  threadQueueMutationChain = run.catch(() => {})
  return run
}

export async function writeThreadQueueState(nextState: ThreadQueueState): Promise<void> {
  await withThreadQueueStateUpdate(() => ({
    nextState: normalizeThreadQueueState(nextState),
    result: undefined,
  }))
}

export async function appendThreadQueuedMessage(threadId: string, message: StoredQueuedMessage): Promise<void> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) throw new Error('threadId is required')
  await withThreadQueueStateUpdate((state) => ({
    nextState: {
      ...state,
      [normalizedThreadId]: [...(state[normalizedThreadId] ?? []), message],
    },
    result: undefined,
  }))
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  const allowed: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
  return typeof value === 'string' && allowed.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : ''
}

function normalizeCollaborationModeReasoningEffort(value: ReasoningEffort | '' | null | undefined): ReasoningEffort | null {
  return value && value.length > 0 ? value : null
}

function extractLocalImagePathFromUrl(value: string): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value, 'http://localhost')
    if (parsed.pathname !== '/codex-local-image') return null
    const path = parsed.searchParams.get('path')?.trim() ?? ''
    return path.length > 0 ? path : null
  } catch {
    return null
  }
}

function buildTextWithAttachments(prompt: string, files: StoredQueuedMessage['fileAttachments']): string {
  if (files.length === 0) return prompt
  let prefix = '# Files mentioned by the user:\n'
  for (const f of files) {
    prefix += `\n## ${f.label}: ${f.path}\n`
  }
  return `${prefix}\n## My request for Codex:\n\n${prompt}\n`
}

function escapeHeartbeatXmlText(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

export function buildHeartbeatQueuedMessage(automation: ThreadAutomationRecord): StoredQueuedMessage {
  return {
    id: `automation-${automation.id}-${Date.now()}-${randomBytes(3).toString('hex')}`,
    text: `<heartbeat>
<automation_id>${escapeHeartbeatXmlText(automation.id)}</automation_id>
<current_time_iso>${new Date().toISOString()}</current_time_iso>
<instructions>
${escapeHeartbeatXmlText(automation.prompt)}
</instructions>
</heartbeat>`,
    imageUrls: [],
    skills: [],
    fileAttachments: [],
    collaborationMode: 'default',
  }
}

function fileNameFromPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) ?? normalized
}

function extractThreadIdFromNotificationParams(params: unknown): string {
  const record = asRecord(params)
  if (!record) return ''
  const threadId =
    (typeof record.threadId === 'string' ? record.threadId : '') ||
    (typeof record.thread_id === 'string' ? record.thread_id : '') ||
    (typeof record.conversationId === 'string' ? record.conversationId : '') ||
    (typeof record.conversation_id === 'string' ? record.conversation_id : '')
  if (threadId) return threadId
  const thread = asRecord(record.thread)
  if (thread && typeof thread.id === 'string') return thread.id
  const turn = asRecord(record.turn)
  if (turn) {
    const turnThreadId =
      (typeof turn.threadId === 'string' ? turn.threadId : '') ||
      (typeof turn.thread_id === 'string' ? turn.thread_id : '')
    if (turnThreadId) return turnThreadId
  }
  return ''
}

function isTurnCompletedNotification(notification: { method: string; params: unknown }): boolean {
  return notification.method === 'turn/completed'
}

export class BackendQueueProcessor {
  private readonly processingThreadIds = new Set<string>()
  private readonly queueDrainTimersByThreadId = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly queueDrainDueAtByThreadId = new Map<string, number>()
  private readonly unsubscribe: () => void

  constructor(private readonly appServer: AppServerProcess) {
    this.unsubscribe = appServer.onNotification((notification) => {
      if (!isTurnCompletedNotification(notification)) return
      const threadId = extractThreadIdFromNotificationParams(notification.params)
      if (!threadId) return
      void this.processThreadQueue(threadId)
    })
    void this.scheduleAllQueuedThreads(1000)
  }

  dispose(): void {
    this.unsubscribe()
    for (const timer of this.queueDrainTimersByThreadId.values()) {
      clearTimeout(timer)
    }
    this.queueDrainTimersByThreadId.clear()
    this.queueDrainDueAtByThreadId.clear()
    this.processingThreadIds.clear()
  }

  async scheduleAllQueuedThreads(delayMs = 0): Promise<void> {
    try {
      const state = await readThreadQueueState()
      for (const threadId of Object.keys(state)) {
        this.scheduleThreadQueueDrain(threadId, delayMs)
      }
    } catch {
      // Queue recovery is best-effort; normal turn-completed events can still drain later.
    }
  }

  scheduleThreadQueueDrain(threadId: string, delayMs = 5000): void {
    if (!threadId) return
    const normalizedDelayMs = Math.max(0, delayMs)
    const nextDueAt = Date.now() + normalizedDelayMs
    const existingDueAt = this.queueDrainDueAtByThreadId.get(threadId)
    const existingTimer = this.queueDrainTimersByThreadId.get(threadId)
    if (existingTimer) {
      if (existingDueAt !== undefined && existingDueAt <= nextDueAt) return
      clearTimeout(existingTimer)
      this.queueDrainTimersByThreadId.delete(threadId)
      this.queueDrainDueAtByThreadId.delete(threadId)
    }
    const timer = setTimeout(() => {
      this.queueDrainTimersByThreadId.delete(threadId)
      this.queueDrainDueAtByThreadId.delete(threadId)
      void this.processThreadQueue(threadId)
    }, normalizedDelayMs)
    timer.unref?.()
    this.queueDrainTimersByThreadId.set(threadId, timer)
    this.queueDrainDueAtByThreadId.set(threadId, nextDueAt)
  }

  async processThreadQueue(threadId: string): Promise<void> {
    if (this.processingThreadIds.has(threadId)) return
    this.processingThreadIds.add(threadId)
    try {
      const canStart = await this.canStartQueuedTurn(threadId)
      if (!canStart) {
        if (await this.hasQueuedTurns(threadId)) {
          this.scheduleThreadQueueDrain(threadId)
        }
        return
      }
      const next = await this.popNextQueuedTurn(threadId)
      if (!next) return
      try {
        await this.startQueuedTurn(next)
        if (await this.hasQueuedTurns(threadId)) {
          this.scheduleThreadQueueDrain(threadId)
        }
      } catch {
        await this.restoreQueuedTurn(next)
        this.scheduleThreadQueueDrain(threadId)
      }
    } catch {
      // Queue processing is best-effort. Keep the bridge alive if app-server is unavailable.
      this.scheduleThreadQueueDrain(threadId)
    } finally {
      this.processingThreadIds.delete(threadId)
    }
  }

  private async hasQueuedTurns(threadId: string): Promise<boolean> {
    const state = await readThreadQueueState()
    const queue = state[threadId]
    return Array.isArray(queue) && queue.length > 0
  }

  private async canStartQueuedTurn(threadId: string): Promise<boolean> {
    const response = asRecord(await this.appServer.rpc('thread/read', { threadId, includeTurns: true }))
    const thread = asRecord(response?.thread)
    if (!thread) return false

    const status = asRecord(thread.status)
    const statusType = readNonEmptyString(status?.type)
    if (statusType === 'inProgress' || statusType === 'running' || statusType === 'active') return false

    const turns = Array.isArray(thread.turns) ? thread.turns : []
    return !turns.some((turn) => readNonEmptyString(asRecord(turn)?.status) === 'inProgress')
  }

  private async popNextQueuedTurn(threadId: string): Promise<BackendQueuedTurn | null> {
    return withThreadQueueStateUpdate((state) => {
      const queue = state[threadId]
      if (!queue || queue.length === 0) {
        return { nextState: state, result: null }
      }

      const [message, ...rest] = queue
      const nextState = { ...state }
      if (rest.length > 0) {
        nextState[threadId] = rest
      } else {
        delete nextState[threadId]
      }
      return { nextState, result: { threadId, message } }
    })
  }

  private async restoreQueuedTurn(turn: BackendQueuedTurn): Promise<void> {
    await withThreadQueueStateUpdate((state) => {
      const queue = state[turn.threadId] ?? []
      return {
        nextState: {
          ...state,
          [turn.threadId]: [turn.message, ...queue],
        },
        result: undefined,
      }
    })
  }

  private async resolveCollaborationModeSettings(mode: CollaborationModeKind): Promise<ResolvedCollaborationModeSettings> {
    let currentConfig: Record<string, unknown> | null = null
    try {
      const configPayload = asRecord(await this.appServer.rpc('config/read', {}))
      currentConfig = asRecord(configPayload?.config)
    } catch {
      currentConfig = null
    }

    const configuredModel = readNonEmptyString(currentConfig?.model)
    if (configuredModel) {
      return {
        model: configuredModel,
        reasoningEffort: normalizeCollaborationModeReasoningEffort(normalizeReasoningEffort(currentConfig?.model_reasoning_effort)),
      }
    }

    try {
      const modelsPayload = asRecord(await this.appServer.rpc('model/list', {}))
      const models = Array.isArray(modelsPayload?.data) ? modelsPayload.data : []
      for (const row of models) {
        const record = asRecord(row)
        const candidate = readNonEmptyString(record?.id) || readNonEmptyString(record?.model)
        if (candidate) {
          return {
            model: candidate,
            reasoningEffort: normalizeCollaborationModeReasoningEffort(normalizeReasoningEffort(currentConfig?.model_reasoning_effort)),
          }
        }
      }
    } catch {
      // Fall through to no collaboration-mode payload.
    }

    throw new Error(`${mode === 'plan' ? 'Plan' : 'Default'} mode requires an available model.`)
  }

  private async buildQueuedTurnParams(turn: BackendQueuedTurn): Promise<Record<string, unknown>> {
    const localImageAttachments: StoredQueuedMessage['fileAttachments'] = []
    for (const imageUrl of turn.message.imageUrls) {
      const localImagePath = extractLocalImagePathFromUrl(imageUrl.trim())
      if (!localImagePath) continue
      localImageAttachments.push({
        label: fileNameFromPath(localImagePath),
        path: localImagePath,
        fsPath: localImagePath,
      })
    }

    const allFileAttachments = [...turn.message.fileAttachments, ...localImageAttachments]
    const dedupedFileAttachments = allFileAttachments.filter((entry, index) =>
      allFileAttachments.findIndex((candidate) => candidate.fsPath === entry.fsPath) === index)

    const input: Array<Record<string, unknown>> = [{
      type: 'text',
      text: buildTextWithAttachments(turn.message.text, dedupedFileAttachments),
    }]

    for (const imageUrl of turn.message.imageUrls) {
      const normalizedUrl = imageUrl.trim()
      if (!normalizedUrl) continue
      const localImagePath = extractLocalImagePathFromUrl(normalizedUrl)
      if (localImagePath) {
        input.push({ type: 'localImage', path: localImagePath })
      } else {
        input.push({ type: 'image', url: normalizedUrl, image_url: normalizedUrl })
      }
    }

    for (const skill of turn.message.skills) {
      input.push({ type: 'skill', name: skill.name, path: skill.path })
    }

    const params: Record<string, unknown> = {
      threadId: turn.threadId,
      input,
    }
    if (dedupedFileAttachments.length > 0) {
      params.attachments = dedupedFileAttachments.map((f) => ({ label: f.label, path: f.path, fsPath: f.fsPath }))
    }

    try {
      const settings = await this.resolveCollaborationModeSettings(turn.message.collaborationMode)
      params.collaborationMode = {
        mode: turn.message.collaborationMode,
        settings: {
          model: settings.model,
          reasoning_effort: settings.reasoningEffort,
          developer_instructions: null,
        },
      }
    } catch {
      // Older app-server versions still accept a plain turn/start without collaborationMode.
    }

    return params
  }

  private async startQueuedTurn(turn: BackendQueuedTurn): Promise<void> {
    await this.appServer.rpc('thread/resume', { threadId: turn.threadId })
    await this.appServer.rpc('turn/start', await this.buildQueuedTurnParams(turn))
  }
}
