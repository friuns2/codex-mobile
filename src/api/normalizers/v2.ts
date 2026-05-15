import type {
  Thread,
  ThreadItem,
  ThreadReadResponse,
  ThreadListResponse,
  Turn,
  UserInput,
} from '../appServerDtos'
import type {
  CommandExecutionData,
  UiFileAttachment,
  UiFileChange,
  UiFileChangeStatus,
  UiMessage,
  UiPlanData,
  UiPlanStep,
  UiProjectGroup,
  UiThread,
} from '../../types/codex'
import { normalizePathForComparison, normalizePathForUi, toProjectName } from '../../pathUtils.js'

function toIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function toRawPayload(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function readTurnErrorText(turn: Turn): string {
  const error = turn.error as { message?: unknown } | null
  return typeof error?.message === 'string' ? error.message.trim() : ''
}

const FILE_ATTACHMENT_LINE = /^##\s+(.+?):\s+(.+?)\s*$/
const FILES_MENTIONED_MARKER = /^#\s*files mentioned by the user\s*:?\s*$/i
const ASSISTANT_FILE_CHANGE_HEADING = /^(?:#{1,6}\s*)?(?:本次修改文件(?:和操作)?(?:如下)?|修改文件和操作)\s*[:：]?\s*$/u

function extractFileAttachments(value: string): UiFileAttachment[] {
  const markerIdx = value.split('\n').findIndex((line) => FILES_MENTIONED_MARKER.test(line.trim()))
  if (markerIdx < 0) return []
  const lines = value.split('\n').slice(markerIdx + 1)
  const attachments: UiFileAttachment[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(FILE_ATTACHMENT_LINE)
    if (!m) break
    const label = m[1]?.trim()
    const path = m[2]?.trim().replace(/\s+\((?:lines?\s+\d+(?:-\d+)?)\)\s*$/, '')
    if (label && path) attachments.push({ label, path })
  }
  return attachments
}

function extractCodexUserRequestText(value: string): string {
  const markerRegex = /(?:^|\n)\s{0,3}#{0,6}\s*my request for codex\s*:?\s*/giu
  const matches = Array.from(value.matchAll(markerRegex))
  if (matches.length === 0) {
    return value.trim()
  }

  const lastMatch = matches.at(-1)
  if (!lastMatch || typeof lastMatch.index !== 'number') {
    return value.trim()
  }

  const markerOffset = lastMatch.index + lastMatch[0].length
  return value.slice(markerOffset).trim()
}

function toLocalImageUrl(path: string): string {
  return `/codex-local-image?path=${encodeURIComponent(path)}`
}

function toImageGenerationUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/codex-local-image?')
  ) {
    return trimmed
  }
  const compact = trimmed.replace(/\s+/gu, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(compact)) return ''
  return `data:image/png;base64,${compact}`
}

function decodeHeartbeatXmlText(value: string): string {
  return value
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&amp;/giu, '&')
}

function readHeartbeatField(value: string, field: string): string {
  const match = new RegExp(`<${field}>\\s*([\\s\\S]*?)\\s*</${field}>`, 'iu').exec(value)
  return match?.[1] ? decodeHeartbeatXmlText(match[1].trim()) : ''
}

function parseHeartbeatEnvelope(value: string): { automationId: string; currentTimeIso: string; instructions: string } | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('<heartbeat>') || !trimmed.endsWith('</heartbeat>')) return null
  const currentTimeIso = readHeartbeatField(trimmed, 'current_time_iso')
  const instructions = readHeartbeatField(trimmed, 'instructions')
  if (!currentTimeIso || !instructions) return null
  return {
    automationId: readHeartbeatField(trimmed, 'automation_id'),
    currentTimeIso,
    instructions,
  }
}

function parseUserMessageContent(
  itemId: string,
  content: UserInput[] | undefined,
): {
  text: string
  images: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: UiFileAttachment[]
  rawBlocks: UiMessage[]
  isAutomationRun: boolean
  automationDisplayName: string | null
} {
  if (!Array.isArray(content)) {
    return { text: '', images: [], skills: [], fileAttachments: [], rawBlocks: [], isAutomationRun: false, automationDisplayName: null }
  }

  const textChunks: string[] = []
  const images: string[] = []
  const skills: Array<{ name: string; path: string }> = []
  const rawBlocks: UiMessage[] = []

  for (const [index, block] of content.entries()) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      textChunks.push(block.text)
    }
    if (block.type === 'image' && typeof block.url === 'string' && block.url.trim().length > 0) {
      images.push(block.url.trim())
    }
    if (block.type === 'localImage' && typeof block.path === 'string' && block.path.trim().length > 0) {
      images.push(toLocalImageUrl(block.path.trim()))
    }
    if (block.type === 'skill') {
      const name = typeof block.name === 'string' ? block.name.trim() : ''
      const path = typeof block.path === 'string' ? block.path.trim() : ''
      if (name && path) {
        skills.push({ name, path })
      }
    }

    if (block.type !== 'text' && block.type !== 'image' && block.type !== 'localImage' && block.type !== 'skill') {
      rawBlocks.push({
        id: `${itemId}:user-content:${index}`,
        role: 'user',
        text: '',
        messageType: `userContent.${block.type}`,
        rawPayload: toRawPayload(block),
        isUnhandled: true,
      })
    }
  }

  const fullText = textChunks.join('\n')
  const fileAttachments = extractFileAttachments(fullText)
  const heartbeat = parseHeartbeatEnvelope(fullText)

  return {
    text: heartbeat?.instructions ?? extractCodexUserRequestText(fullText),
    images,
    skills,
    fileAttachments,
    rawBlocks,
    isAutomationRun: heartbeat !== null,
    automationDisplayName: heartbeat?.automationId || null,
  }
}

function parsePlanText(value: string): UiPlanData | null {
  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const lines = normalized.split('\n')
  const steps: UiPlanStep[] = []
  const explanationLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (steps.length === 0) explanationLines.push('')
      continue
    }

    const match = trimmed.match(/^[-*]\s+\[([ xX~>|-])\]\s+(.+)$/)
    if (match) {
      const marker = (match[1] ?? ' ').toLowerCase()
      const step = match[2]?.trim()
      if (!step) continue
      let status: UiPlanStep['status'] = 'pending'
      if (marker === 'x') status = 'completed'
      if (marker === '~' || marker === '>' || marker === '-') status = 'inProgress'
      steps.push({ step, status })
      continue
    }

    explanationLines.push(trimmed)
  }

  if (steps.length === 0) return null

  return {
    explanation: explanationLines.join('\n').trim() || undefined,
    steps,
  }
}

function inferAssistantFileChangeOperation(detailLines: string[]): UiFileChange['operation'] {
  const detailText = detailLines.join(' ').toLowerCase()
  if (
    detailText.includes('重命名') ||
    detailText.includes('移动') ||
    detailText.includes('rename') ||
    detailText.includes('renamed') ||
    detailText.includes('move') ||
    detailText.includes('moved')
  ) {
    return 'update'
  }
  if (
    detailText.includes('删除') ||
    detailText.includes('移除') ||
    detailText.includes('delete') ||
    detailText.includes('deleted') ||
    detailText.includes('remove') ||
    detailText.includes('removed')
  ) {
    return 'delete'
  }
  if (
    detailText.includes('新增') ||
    detailText.includes('添加') ||
    detailText.includes('增加') ||
    detailText.includes('add') ||
    detailText.includes('added') ||
    detailText.includes('create') ||
    detailText.includes('created')
  ) {
    return 'add'
  }
  return 'update'
}

function extractAssistantFilePath(value: string): string {
  const backtickMatch = value.match(/`([^`]+)`/u)
  if (backtickMatch?.[1]) {
    return backtickMatch[1].trim()
  }
  return value.replace(/^[-*]\s+/u, '').trim()
}

function looksLikeAssistantFilePath(value: string): boolean {
  return /[\\/]/u.test(value) || /[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+$/u.test(value)
}

function extractAssistantFileChanges(value: string): UiFileChange[] {
  const lines = value.replace(/\r\n/g, '\n').split('\n')
  const headingIndex = lines.findIndex((line) => ASSISTANT_FILE_CHANGE_HEADING.test(line.trim()))
  if (headingIndex < 0) return []

  const collected: Array<{ path: string; details: string[] }> = []
  let current: { path: string; details: string[] } | null = null

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      if (current) {
        collected.push(current)
        current = null
      }
      break
    }

    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/u)
    if (!bulletMatch) {
      if (current) {
        collected.push(current)
        current = null
      }
      break
    }

    const indent = bulletMatch[1]?.length ?? 0
    const bulletText = bulletMatch[2]?.trim() ?? ''
    if (indent <= 1) {
      if (current) {
        collected.push(current)
      }
      const path = extractAssistantFilePath(bulletText)
      current = looksLikeAssistantFilePath(path)
        ? { path, details: [] }
        : null
      continue
    }

    if (current && bulletText) {
      current.details.push(bulletText)
    }
  }

  if (current) {
    collected.push(current)
  }

  return collected.map((entry) => ({
    path: entry.path,
    operation: inferAssistantFileChangeOperation(entry.details),
    movedToPath: null,
    diff: '',
    addedLineCount: 0,
    removedLineCount: 0,
  }))
}

function countContentLines(value: string): number {
  if (!value) return 0
  const normalized = value.replace(/\r\n/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

function countUnifiedDiffLines(value: string): { addedLineCount: number; removedLineCount: number } {
  let addedLineCount = 0
  let removedLineCount = 0

  for (const line of value.replace(/\r\n/g, '\n').split('\n')) {
    if (!line) continue
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) {
      addedLineCount += 1
      continue
    }
    if (line.startsWith('-')) {
      removedLineCount += 1
    }
  }

  return { addedLineCount, removedLineCount }
}

export function normalizeFileChangeStatus(value: unknown): UiFileChangeStatus {
  if (value === 'failed' || value === 'declined' || value === 'completed') return value
  return 'inProgress'
}

export function toUiFileChanges(changes: unknown): UiFileChange[] {
  const rows = Array.isArray(changes) ? changes : []
  const normalized: UiFileChange[] = []

  for (const row of rows) {
    const change = row as Record<string, unknown>
    const path = typeof change.path === 'string' ? change.path : ''
    const diff = typeof change.diff === 'string' ? change.diff : ''
    const kind = change.kind as Record<string, unknown> | undefined
    const operationType = kind?.type
    if (!path || (operationType !== 'add' && operationType !== 'delete' && operationType !== 'update')) {
      continue
    }

    const movedToPath =
      operationType === 'update' && typeof kind?.move_path === 'string'
        ? kind.move_path
        : null

    const counts = operationType === 'update'
      ? countUnifiedDiffLines(diff)
      : operationType === 'add'
        ? { addedLineCount: countContentLines(diff), removedLineCount: 0 }
        : { addedLineCount: 0, removedLineCount: countContentLines(diff) }

    normalized.push({
      path,
      operation: operationType,
      movedToPath,
      diff,
      ...counts,
    })
  }

  return normalized
}

function toUiMessages(item: ThreadItem): UiMessage[] {
  if (item.type === 'agentMessage') {
    return [
      {
        id: item.id,
        role: 'assistant',
        text: item.text,
        messageType: item.type,
      },
    ]
  }

  if (item.type === 'userMessage') {
    const parsed = parseUserMessageContent(item.id, item.content as UserInput[] | undefined)
    const messages: UiMessage[] = []
    const hasRenderableUserContent = parsed.text.length > 0 || parsed.images.length > 0 || parsed.fileAttachments.length > 0 || parsed.skills.length > 0

    if (hasRenderableUserContent) {
      messages.push({
        id: item.id,
        role: 'user',
        text: parsed.text,
        images: parsed.images,
        skills: parsed.skills.length > 0 ? parsed.skills : undefined,
        fileAttachments: parsed.fileAttachments.length > 0 ? parsed.fileAttachments : undefined,
        messageType: item.type,
        isAutomationRun: parsed.isAutomationRun,
        automationDisplayName: parsed.automationDisplayName,
      })
    }

    messages.push(...parsed.rawBlocks)
    if (messages.length === 0) {
      return []
    }

    return messages
  }

  if (item.type === 'imageView') {
    const path = typeof item.path === 'string' ? item.path.trim() : ''
    if (!path) return []
    return [
      {
        id: item.id,
        role: 'assistant',
        text: '',
        images: [toLocalImageUrl(path)],
        messageType: 'imageView',
      },
    ]
  }

  {
    const rawItem = item as unknown as Record<string, unknown>
    if (rawItem.type === 'imageGeneration' || rawItem.type === 'image_generation') {
      const result = typeof rawItem.result === 'string' ? toImageGenerationUrl(rawItem.result) : ''
      if (!result) return []
      return [
        {
          id: item.id,
          role: 'assistant',
          text: '',
          images: [result],
          messageType: 'imageView',
        },
      ]
    }
  }

  if (item.type === 'reasoning') {
    return []
  }


  if (item.type === 'plan') {
    const text = typeof item.text === 'string' ? item.text : ''
    return [
      {
        id: item.id,
        role: 'assistant',
        text,
        messageType: 'plan',
        plan: parsePlanText(text) ?? undefined,
      },
    ]
  }

  if (item.type === 'commandExecution') {
    const raw = item as Record<string, unknown>
    const status = normalizeCommandStatus(raw.status)
    const cmd = typeof raw.command === 'string' ? raw.command : ''
    const cwd = typeof raw.cwd === 'string' ? raw.cwd : null
    const aggregatedOutput = typeof raw.aggregatedOutput === 'string' ? raw.aggregatedOutput : ''
    const exitCode = typeof raw.exitCode === 'number' ? raw.exitCode : null
    return [
      {
        id: item.id,
        role: 'system' as const,
        text: cmd,
        messageType: 'commandExecution',
        commandExecution: { command: cmd, cwd, status, aggregatedOutput, exitCode },
      },
    ]
  }

  if (item.type === 'fileChange') {
    const fileChanges = toUiFileChanges(item.changes)
    const fileChangeStatus = normalizeFileChangeStatus(item.status)
    if (fileChanges.length === 0 || fileChangeStatus !== 'completed') {
      return []
    }
    return [
      {
        id: item.id,
        role: 'system',
        text: '',
        messageType: 'fileChange',
        fileChangeStatus,
        fileChanges,
      },
    ]
  }

  return []
}

function normalizeCommandStatus(value: unknown): CommandExecutionData['status'] {
  if (value === 'completed' || value === 'failed' || value === 'declined' || value === 'interrupted') return value
  if (value === 'inProgress' || value === 'in_progress') return 'inProgress'
  return 'completed'
}

function pickThreadName(summary: Thread): string {
  const rawSummary = summary as Record<string, unknown>
  const direct = [
    rawSummary.name,
    rawSummary.title,
    summary.preview,
  ]
  for (const candidate of direct) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return ''
}

function toThreadTitle(summary: Thread): string {
  const named = pickThreadName(summary)
  return named.length > 0 ? named : 'Untitled thread'
}

function isTurnInProgress(turn: Turn | null | undefined): boolean {
  return turn?.status === 'inProgress'
}

function readThreadInProgress(summary: Thread): boolean {
  const rawSummary = summary as Record<string, unknown>
  if (rawSummary.inProgress === true) return true
  if (rawSummary.status === 'inProgress' || rawSummary.turnStatus === 'inProgress') return true

  const turns = Array.isArray(summary.turns) ? summary.turns : []
  const lastTurn = turns.at(-1)
  return isTurnInProgress(lastTurn)
}

function toUiThread(summary: Thread): UiThread {
  const rawSummary = summary as Record<string, unknown>
  const cwd = normalizePathForUi(typeof rawSummary.cwd === 'string' ? rawSummary.cwd : summary.cwd)
  const comparableCwd = normalizePathForComparison(cwd)
  const hasWorktree =
    rawSummary.isWorktree === true ||
    rawSummary.worktree === true ||
    rawSummary.worktreeId !== undefined ||
    rawSummary.worktreePath !== undefined ||
    comparableCwd.includes('/.codex/worktrees/') ||
    comparableCwd.includes('/.git/worktrees/')

  return {
    id: summary.id,
    title: toThreadTitle(summary),
    projectName: toProjectName(cwd),
    cwd,
    hasWorktree,
    createdAtIso: toIso(summary.createdAt),
    updatedAtIso: toIso(summary.updatedAt),
    preview: summary.preview,
    unread: false,
    inProgress: readThreadInProgress(summary),
  }
}

export function normalizeThreadSummaryV2(payload: ThreadReadResponse): UiThread {
  return toUiThread(payload.thread)
}

function groupThreadsByProject(threads: UiThread[]): UiProjectGroup[] {
  const grouped = new Map<string, UiThread[]>()
  for (const thread of threads) {
    const rows = grouped.get(thread.projectName)
    if (rows) rows.push(thread)
    else grouped.set(thread.projectName, [thread])
  }

  return Array.from(grouped.entries())
    .map(([projectName, projectThreads]) => ({
      projectName,
      threads: projectThreads.sort(
        (a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime(),
      ),
    }))
    .sort((a, b) => {
      const aLast = new Date(a.threads[0]?.updatedAtIso ?? 0).getTime()
      const bLast = new Date(b.threads[0]?.updatedAtIso ?? 0).getTime()
      return bLast - aLast
    })
}

export function normalizeThreadGroupsV2(payload: ThreadListResponse): UiProjectGroup[] {
  const uiThreads = payload.data.map(toUiThread)
  return groupThreadsByProject(uiThreads)
}

export function normalizeThreadMessagesV2(payload: ThreadReadResponse, baseTurnIndex = 0): UiMessage[] {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  const messages: UiMessage[] = []
  for (let turnOffset = 0; turnOffset < turns.length; turnOffset++) {
    const turnIndex = baseTurnIndex + turnOffset
    const turn = turns[turnOffset]
    const rawTurnId = typeof turn?.id === 'string' ? turn.id.trim() : ''
    const turnId = rawTurnId.length > 0 ? rawTurnId : undefined
    const items = Array.isArray(turn.items) ? turn.items : []
    for (const item of items) {
      for (const msg of toUiMessages(item)) {
        messages.push({ ...msg, turnId, turnIndex })
      }
    }
    const errorText = readTurnErrorText(turn)
    if (turn.status === 'failed' && errorText) {
      const errorIdBase = turnId ?? `turn-${turnIndex}`
      messages.push({
        id: `${errorIdBase}-error`,
        role: 'system',
        text: errorText,
        messageType: 'turnError',
        turnId,
        turnIndex,
      })
    }
  }
  return messages
}

export function readThreadInProgressFromResponse(payload: ThreadReadResponse): boolean {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  return isTurnInProgress(turns.at(-1))
}

export function readActiveTurnIdFromResponse(payload: ThreadReadResponse): string {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (isTurnInProgress(turn) && typeof turn.id === 'string' && turn.id.trim().length > 0) {
      return turn.id.trim()
    }
  }
  return ''
}
