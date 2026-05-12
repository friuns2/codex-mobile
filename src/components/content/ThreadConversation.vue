<template src="./ThreadConversation.template.html"></template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { UiFileChange, UiLiveOverlay, UiMessage, UiPlanStep, UiServerRequest } from '../../types/codex'
import { useMobile } from '../../composables/useMobile'
import { getBasename, headingClass, headingTag, inferHomeFromCwd, isFilePath, normalizeFileUrlToPath, normalizePathDots, normalizePathSeparators, parseFileReference, parseMarkdownLinkToken, resolveRelativePath, trimLinkWrappers } from './threadConversationPathHelpers'
import {
  aggregateFileChanges,
  buildDiffViewerLines,
  fileChangeDeltaParts,
  fileChangeKey,
  fileChangeOperationLabel,
  fileChangeOperationTone,
  fileChangeSummaryLabel,
  fileChangeSummaryStatusParts,
  formatFileChangeDelta,
  formatFileChangeCountLabel,
  type DiffViewerLine,
  type TurnFileChangeSummary,
} from './threadConversationFileChanges'

import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerCopy from '../icons/IconTablerCopy.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'
import IconTablerX from '../icons/IconTablerX.vue'

type HighlightJsModule = (typeof import('highlight.js/lib/common'))['default']

const expandedCommandIds = ref<Set<string>>(new Set())
const collapsedAutoCommandIds = ref<Set<string>>(new Set())
const expandedCommandGroupIds = ref<Set<string>>(new Set())
const expandedWorkedIds = ref<Set<string>>(new Set())
const expandedFileChangeSummaryIds = ref<Set<string>>(new Set())
const activeDiffViewerSummary = ref<TurnFileChangeSummary | null>(null)
const activeDiffViewerChangeKey = ref('')
const isDiffViewerFileListOpen = ref(false)
const fileLinkContextMenuRef = ref<HTMLElement | null>(null)
const isFileLinkContextMenuVisible = ref(false)
const fileLinkContextMenuX = ref(0)
const fileLinkContextMenuY = ref(0)
const fileLinkContextBrowseUrl = ref('')
const fileLinkContextEditUrl = ref('')
const { isMobile } = useMobile()

function parsePlanFromMessageText(text: string): { explanation: string; steps: UiPlanStep[] } | null {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const steps: UiPlanStep[] = []
  const explanationLines: string[] = []

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (steps.length === 0) explanationLines.push('')
      continue
    }

    const match = trimmed.match(/^[-*]\s+\[([ xX~>|-])\]\s+(.+)$/)
    if (match) {
      const marker = (match[1] ?? ' ').toLowerCase()
      let status: UiPlanStep['status'] = 'pending'
      if (marker === 'x') status = 'completed'
      if (marker === '~' || marker === '>' || marker === '-') status = 'inProgress'
      steps.push({
        step: match[2]?.trim() ?? '',
        status,
      })
      continue
    }

    explanationLines.push(trimmed)
  }

  if (steps.length === 0) return null
  return {
    explanation: explanationLines.join('\n').trim(),
    steps: steps.filter((step) => step.step.length > 0),
  }
}

function readPlanData(message: UiMessage): { explanation: string; steps: UiPlanStep[] } | null {
  if (message.plan && message.plan.steps.length > 0) {
    return {
      explanation: message.plan.explanation?.trim() ?? '',
      steps: message.plan.steps,
    }
  }
  return parsePlanFromMessageText(message.text)
}

function isCommandMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' && !!message.commandExecution
}

function isPlanMessage(message: UiMessage): boolean {
  return message.messageType === 'plan' || message.messageType === 'plan.live'
}

function buildPlanMessageText(explanation: string, steps: UiPlanStep[]): string {
  const lines: string[] = []
  if (explanation.trim()) {
    lines.push(explanation.trim())
  }
  for (const step of steps) {
    const marker = step.status === 'completed' ? 'x' : step.status === 'inProgress' ? '~' : ' '
    lines.push(`- [${marker}] ${step.step}`)
  }
  return lines.join('\n').trim()
}

function showImplementPlanButton(message: UiMessage): boolean {
  return isPlanMessage(message)
    && message.messageType !== 'plan.live'
    && message.role === 'assistant'
    && Boolean(message.turnId)
}

function implementPlan(message: UiMessage): void {
  const turnId = message.turnId?.trim() ?? ''
  if (!turnId) return
  emit('implementPlan', { turnId })
}

function isFileChangeMessage(message: UiMessage): boolean {
  return message.messageType === 'fileChange'
    && message.fileChangeStatus === 'completed'
    && Array.isArray(message.fileChanges)
    && message.fileChanges.length > 0
}

function isCopyableAssistantMessage(message: UiMessage): boolean {
  return message.role === 'assistant'
    && !isCommandMessage(message)
    && message.messageType !== 'worked'
    && !(message.messageType ?? '').endsWith('.live')
}

const activeCommandMessageId = computed(() => {
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    const message = props.messages[index]
    if (message.messageType === 'commandExecution' && message.commandExecution?.status === 'inProgress') {
      return message.id
    }
  }
  return ''
})

const hasLiveAssistantText = computed(() =>
  props.messages.some((message) =>
    message.role === 'assistant' &&
    message.messageType === 'agentMessage.live' &&
    message.text.trim().length > 0,
  ),
)

const isLiveTurnRuntime = computed(() =>
  Boolean(props.liveOverlay) || activeCommandMessageId.value.length > 0 || hasLiveAssistantText.value,
)

const groupedCommandsByLatestId = computed<Record<string, UiMessage[]>>(() => {
  const next: Record<string, UiMessage[]> = {}
  for (let index = 0; index < props.messages.length;) {
    const message = props.messages[index]
    if (!isCommandMessage(message)) {
      index += 1
      continue
    }

    const block: UiMessage[] = []
    while (index < props.messages.length && isCommandMessage(props.messages[index])) {
      block.push(props.messages[index])
      index += 1
    }

    if (block.length <= 1) continue
    const latest = block[block.length - 1]
    next[latest.id] = block.slice(0, -1)
  }
  return next
})

const hiddenGroupedCommandIds = computed(() => {
  const next = new Set<string>()
  for (const commands of Object.values(groupedCommandsByLatestId.value)) {
    for (const command of commands) {
      next.add(command.id)
    }
  }
  return next
})

function readPlanExplanation(message: UiMessage): string {
  return readPlanData(message)?.explanation ?? ''
}

function readPlanSteps(message: UiMessage): UiPlanStep[] {
  return readPlanData(message)?.steps ?? []
}

function planStepStatusIcon(status: UiPlanStep['status']): string {
  switch (status) {
    case 'completed':
      return '✓'
    case 'inProgress':
      return '•'
    default:
      return '○'
  }
}

function isCommandAutoExpanded(message: UiMessage): boolean {
  return !hasLiveAssistantText.value && message.id === activeCommandMessageId.value
}

function isCommandExpanded(message: UiMessage): boolean {
  if (!isCommandMessage(message)) return false
  return expandedCommandIds.value.has(message.id)
    || (!collapsedAutoCommandIds.value.has(message.id) && isCommandAutoExpanded(message))
}

function isCommandCompact(message: UiMessage): boolean {
  return isCommandMessage(message) && isLiveTurnRuntime.value
}

function isCommandOutputCondensed(message: UiMessage): boolean {
  return isCommandMessage(message) && (isLiveTurnRuntime.value || message.commandExecution?.status === 'inProgress')
}

function toggleCommandExpand(message: UiMessage): void {
  if (!isCommandMessage(message)) return

  const nextExpanded = new Set(expandedCommandIds.value)
  const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
  const isAutoExpanded = isCommandAutoExpanded(message)
  const isManuallyExpanded = nextExpanded.has(message.id)

  if (isManuallyExpanded) {
    nextExpanded.delete(message.id)
    if (isAutoExpanded) nextCollapsedAuto.add(message.id)
  } else if (isAutoExpanded && !nextCollapsedAuto.has(message.id)) {
    nextCollapsedAuto.add(message.id)
  } else {
    nextExpanded.add(message.id)
    nextCollapsedAuto.delete(message.id)
  }

  expandedCommandIds.value = nextExpanded
  collapsedAutoCommandIds.value = nextCollapsedAuto
}

function getGroupedCommandsForLatest(message: UiMessage): UiMessage[] {
  return groupedCommandsByLatestId.value[message.id] ?? []
}

function getCommandBlockForLatest(message: UiMessage): UiMessage[] {
  if (!isCommandMessage(message)) return []
  return [...getGroupedCommandsForLatest(message), message]
}

function toggleCommandGroup(message: UiMessage): void {
  const groupedCommands = getGroupedCommandsForLatest(message)
  if (groupedCommands.length === 0) return
  const next = new Set(expandedCommandGroupIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedCommandGroupIds.value = next
}

function isCommandGroupExpanded(message: UiMessage): boolean {
  return expandedCommandGroupIds.value.has(message.id)
}

function commandGroupSummaryLabel(message: UiMessage): string {
  const commands = getCommandBlockForLatest(message)
  const count = commands.length
  const latestCommand = message.commandExecution?.command?.trim() || '(command)'
  const countLabel = count === 1 ? '1 command' : `${count} commands`
  return `${countLabel} · latest: ${latestCommand}`
}

function commandGroupSummaryStatus(message: UiMessage): string {
  return commandStatusLabel(message)
}

function toggleWorkedExpand(message: UiMessage): void {
  const next = new Set(expandedWorkedIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedWorkedIds.value = next
}

function isWorkedExpanded(message: UiMessage): boolean {
  return expandedWorkedIds.value.has(message.id)
}

function toggleFileChangeSummary(message: UiMessage): void {
  const next = new Set(expandedFileChangeSummaryIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedFileChangeSummaryIds.value = next
}

function isFileChangeSummaryExpanded(message: UiMessage): boolean {
  return expandedFileChangeSummaryIds.value.has(message.id)
}

function openDiffViewer(summary: TurnFileChangeSummary | null, change: UiFileChange): void {
  if (!summary) return
  activeDiffViewerSummary.value = summary
  activeDiffViewerChangeKey.value = fileChangeKey(change)
  isDiffViewerFileListOpen.value = false
}

function closeDiffViewer(): void {
  activeDiffViewerSummary.value = null
  activeDiffViewerChangeKey.value = ''
  isDiffViewerFileListOpen.value = false
}

function toggleDiffViewerFileList(): void {
  isDiffViewerFileListOpen.value = !isDiffViewerFileListOpen.value
}

function closeDiffViewerFileList(): void {
  isDiffViewerFileListOpen.value = false
}

function selectDiffViewerChange(change: UiFileChange): void {
  activeDiffViewerChangeKey.value = fileChangeKey(change)
  if (isMobile.value) {
    isDiffViewerFileListOpen.value = false
  }
}

function commandStatusLabel(message: UiMessage): string {
  const ce = message.commandExecution
  if (!ce) return ''
  const compact = isCommandCompact(message)
  switch (ce.status) {
    case 'inProgress': return compact ? 'Running' : '⟳ Running'
    case 'completed': return ce.exitCode === 0 ? (compact ? 'Done' : '✓ Completed') : `Exit ${ce.exitCode ?? '?'}`
    case 'failed': return compact ? 'Failed' : '✗ Failed'
    case 'declined': return compact ? 'Declined' : '⊘ Declined'
    case 'interrupted': return compact ? 'Stopped' : '⊘ Interrupted'
    default: return ''
  }
}

function commandStatusClass(message: UiMessage): string {
  const s = message.commandExecution?.status
  if (s === 'inProgress') return 'cmd-status-running'
  if (s === 'completed' && message.commandExecution?.exitCode === 0) return 'cmd-status-ok'
  return 'cmd-status-error'
}

function pruneCommandIdSet(source: Set<string>, validIds: Set<string>): Set<string> {
  if (source.size === 0) return source
  const next = new Set<string>()
  for (const id of source) {
    if (validIds.has(id)) next.add(id)
  }
  return next.size === source.size ? source : next
}

function getCommandsForWorked(messages: UiMessage[], workedIndex: number): UiMessage[] {
  const result: UiMessage[] = []
  for (let i = workedIndex - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.messageType === 'commandExecution') result.unshift(m)
    else if (m.role === 'user' || m.messageType === 'worked') break
  }
  return result
}

const props = defineProps<{
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  liveOverlay: UiLiveOverlay | null
  isLoading: boolean
  activeThreadId: string
  cwd: string
  hasMorePersistedAbove?: boolean
  isLoadingPersistedAbove?: boolean
  loadEarlierMessages?: (threadId: string) => Promise<void>
}>()

const emit = defineEmits<{
  forkThread: [payload: { threadId: string; turnIndex: number }]
  rollback: [payload: { turnId: string }]
  implementPlan: [payload: { turnId: string }]
  respondServerRequest: [payload: { id: number; result?: unknown; error?: { code?: number; message: string } }]
}>()

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const copiedResponseAnchorId = ref('')
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const mcpElicitationAnswers = ref<Record<string, string | number | boolean | string[]>>({})
const autoFollowOutput = ref(true)
const BOTTOM_THRESHOLD_PX = 16
const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'c#': 'csharp',
  ps1: 'powershell',
}
type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'strikethrough'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'url'; value: string; href: string }
  | { kind: 'file'; value: string; path: string; displayPath: string; downloadName: string }
type TaskListItem = {
  text: string
  checked: boolean
}
type TableAlignment = 'left' | 'center' | 'right' | null
type ListItem = {
  paragraphs: string[]
  children?: MessageBlock[]
}
type MessageBlock =
  | { kind: 'paragraph'; value: string }
  | { kind: 'heading'; level: number; value: string }
  | { kind: 'blockquote'; value: string }
  | { kind: 'unorderedList'; items: ListItem[] }
  | { kind: 'taskList'; items: TaskListItem[] }
  | { kind: 'orderedList'; items: ListItem[]; start: number }
  | { kind: 'table'; headers: string[]; rows: string[][]; alignments: TableAlignment[] }
  | { kind: 'codeBlock'; language: string; value: string }
  | { kind: 'thematicBreak' }
  | { kind: 'image'; url: string; alt: string; markdown: string }

let conversationScrollFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let copiedMessageResetTimer: ReturnType<typeof setTimeout> | null = null
let conversationScrollPromise: Promise<void> | null = null
const trackedPendingImages = new WeakSet<HTMLImageElement>()
const highlightJsModule = ref<HighlightJsModule | null>(null)
const highlightCacheVersion = ref(0)
const markdownImageFailureVersion = ref(0)
let highlightJsLoader: Promise<void> | null = null
const MESSAGE_BLOCK_CACHE_LIMIT = 300
const INLINE_SEGMENT_CACHE_LIMIT = 1200
const MARKDOWN_HTML_CACHE_LIMIT = 300
const HIGHLIGHT_HTML_CACHE_LIMIT = 250

type MessageBlockCacheEntry = {
  text: string
  cwd: string
  blocks: MessageBlock[]
}

type MarkdownHtmlCacheEntry = {
  text: string
  cwd: string
  highlightVersion: number
  html: string
}

const messageBlockCache = new Map<string, MessageBlockCacheEntry>()
const inlineSegmentCache = new Map<string, InlineSegment[]>()
const markdownHtmlCache = new Map<string, MarkdownHtmlCacheEntry>()
const highlightHtmlCache = new Map<string, string>()

function setBoundedCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value as K | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
  return value
}

const RENDER_WINDOW_SIZE = 50
const LOAD_MORE_CHUNK = 30
const LOAD_MORE_SCROLL_THRESHOLD_PX = 200

const renderWindowStart = ref(0)
const isLoadingMore = ref(false)

const visibleMessages = computed(() => props.messages.slice(renderWindowStart.value))
const hasMoreAbove = computed(() => renderWindowStart.value > 0 || props.hasMorePersistedAbove === true)

const showJumpToLatestButton = computed(
  () => !autoFollowOutput.value && (props.messages.length > 0 || props.pendingRequests.length > 0 || Boolean(props.liveOverlay)),
)

function ensureHighlightJsLoaded(): Promise<void> {
  if (highlightJsModule.value) return Promise.resolve()
  if (!highlightJsLoader) {
    highlightJsLoader = import('highlight.js/lib/common')
      .then((module) => {
        highlightJsModule.value = module.default
        highlightHtmlCache.clear()
        markdownHtmlCache.clear()
        highlightCacheVersion.value += 1
      })
      .finally(() => {
        highlightJsLoader = null
      })
  }
  return highlightJsLoader
}

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isSecret: boolean
  isOther: boolean
  options: Array<{ label: string; description: string }>
}
type McpElicitationFieldOption = {
  value: string
  label: string
}
type McpElicitationField = {
  key: string
  label: string
  description: string
  required: boolean
  kind: 'string' | 'number' | 'boolean' | 'singleEnum' | 'multiEnum'
  inputType: string
  options: McpElicitationFieldOption[]
  defaultValue: string | number | boolean | string[]
}
function planStepCopyMarker(status: UiPlanStep['status']): string {
  switch (status) {
    case 'completed':
      return '[x]'
    case 'inProgress':
      return '[~]'
    default:
      return '[ ]'
  }
}

function buildPlanCopyText(message: UiMessage): string {
  const planData = readPlanData(message)
  if (!planData) return ''

  const sections: string[] = []
  if (planData.explanation?.trim()) {
    sections.push(planData.explanation.trim())
  }

  if (planData.steps.length > 0) {
    sections.push(planData.steps.map((step) => `- ${planStepCopyMarker(step.status)} ${step.step}`.trim()).join('\n'))
  }

  return sections.join('\n\n').trim()
}

function buildCopyableMessageContent(message: UiMessage): string {
  const sections: string[] = []
  const rawTextContent = message.text.trim() || buildPlanCopyText(message)
  const textContent = isPlanMessage(message) && rawTextContent
    ? `Plan\n${rawTextContent}`
    : rawTextContent
  if (textContent) {
    sections.push(textContent)
  }

  const attachmentLines = (message.fileAttachments ?? [])
    .map((attachment) => attachment.path.trim())
    .filter((pathValue) => pathValue.length > 0)
  if (attachmentLines.length > 0) {
    sections.push(`Files:\n${attachmentLines.join('\n')}`)
  }

  const imageLines = (message.images ?? [])
    .map((imageUrl) => imageUrl.trim())
    .filter((imageUrl) => imageUrl.length > 0)
  if (imageLines.length > 0) {
    sections.push(`Images:\n${imageLines.join('\n')}`)
  }

  return sections.join('\n\n').trim()
}

const copyableResponseContentByAnchorId = computed<Record<string, string>>(() => {
  const groupedResponses = new Map<string, { anchorMessageId: string; parts: string[] }>()

  for (const message of props.messages) {
    if (!isCopyableAssistantMessage(message)) continue

    const content = buildCopyableMessageContent(message)
    if (!content) continue

    const responseKey = typeof message.turnIndex === 'number'
      ? `turn:${message.turnIndex}`
      : `message:${message.id}`
    const existing = groupedResponses.get(responseKey)
    if (existing) {
      existing.anchorMessageId = message.id
      existing.parts.push(content)
      continue
    }

    groupedResponses.set(responseKey, {
      anchorMessageId: message.id,
      parts: [content],
    })
  }

  const next: Record<string, string> = {}
  for (const response of groupedResponses.values()) {
    const content = response.parts.join('\n\n').trim()
    if (!content) continue
    next[response.anchorMessageId] = content
  }

  for (const [anchorMessageId, summary] of Object.entries(anchoredFileChangeSummaryByAnchorId.value)) {
    if (summary.source !== 'metadata') continue
    const fileChangeCopy = buildFileChangeCopyText(summary)
    if (!fileChangeCopy) continue
    const existing = next[anchorMessageId]?.trim()
    next[anchorMessageId] = existing ? `${existing}\n\n${fileChangeCopy}` : fileChangeCopy
  }
  return next
})

const forkableTurnIndexByAnchorId = computed<Record<string, number>>(() => {
  const groupedTurns = new Map<string, { anchorMessageId: string; turnIndex: number }>()

  for (const message of props.messages) {
    if (!isCopyableAssistantMessage(message) || typeof message.turnIndex !== 'number') continue

    const responseKey = `turn:${message.turnIndex}`
    const existing = groupedTurns.get(responseKey)
    if (existing) {
      existing.anchorMessageId = message.id
      existing.turnIndex = message.turnIndex
      continue
    }

    groupedTurns.set(responseKey, {
      anchorMessageId: message.id,
      turnIndex: message.turnIndex,
    })
  }

  const next: Record<string, number> = {}
  for (const groupedTurn of groupedTurns.values()) {
    next[groupedTurn.anchorMessageId] = groupedTurn.turnIndex
  }
  return next
})

function showCopyResponseButton(message: UiMessage): boolean {
  return typeof copyableResponseContentByAnchorId.value[message.id] === 'string'
}

function showForkResponseButton(message: UiMessage): boolean {
  return typeof forkableTurnIndexByAnchorId.value[message.id] === 'number'
}

const anchoredFileChangeSummaryByAnchorId = computed<Record<string, TurnFileChangeSummary>>(() => {
  const assistantAnchorIdByTurnKey = new Map<string, string>()
  const assistantSummaryByAnchorId = new Map<string, TurnFileChangeSummary>()
  const fileChangeMessagesByTurnKey = new Map<string, UiMessage[]>()

  for (const message of props.messages) {
    if (isCopyableAssistantMessage(message) && typeof message.turnIndex === 'number') {
      assistantAnchorIdByTurnKey.set(`turn:${message.turnIndex}`, message.id)
      if (Array.isArray(message.fileChanges) && message.fileChanges.length > 0) {
        assistantSummaryByAnchorId.set(message.id, {
          changes: aggregateFileChanges(message.fileChanges),
          sourceMessageIds: [],
          source: 'assistant',
        })
      }
    }

    if (!isFileChangeMessage(message)) continue
    const turnKey = typeof message.turnIndex === 'number' ? `turn:${message.turnIndex}` : `message:${message.id}`
    const current = fileChangeMessagesByTurnKey.get(turnKey)
    if (current) current.push(message)
    else fileChangeMessagesByTurnKey.set(turnKey, [message])
  }

  const summaries: Record<string, TurnFileChangeSummary> = {}
  for (const [turnKey, messages] of fileChangeMessagesByTurnKey.entries()) {
    const anchorId = assistantAnchorIdByTurnKey.get(turnKey)
    if (!anchorId) continue
    summaries[anchorId] = {
      changes: aggregateFileChanges(messages.flatMap((message) => message.fileChanges ?? [])),
      sourceMessageIds: messages.map((message) => message.id),
      source: 'metadata',
    }
  }

  for (const [anchorId, summary] of assistantSummaryByAnchorId.entries()) {
    if (!summaries[anchorId]) {
      summaries[anchorId] = summary
    }
  }

  return summaries
})

const standaloneFileChangeSummaryByMessageId = computed<Record<string, TurnFileChangeSummary>>(() => {
  const assistantAnchorIdByTurnKey = new Map<string, string>()
  const fileChangeMessagesByTurnKey = new Map<string, UiMessage[]>()

  for (const message of props.messages) {
    if (isCopyableAssistantMessage(message) && typeof message.turnIndex === 'number') {
      assistantAnchorIdByTurnKey.set(`turn:${message.turnIndex}`, message.id)
    }

    if (!isFileChangeMessage(message)) continue
    const turnKey = typeof message.turnIndex === 'number' ? `turn:${message.turnIndex}` : `message:${message.id}`
    const current = fileChangeMessagesByTurnKey.get(turnKey)
    if (current) current.push(message)
    else fileChangeMessagesByTurnKey.set(turnKey, [message])
  }

  const summaries: Record<string, TurnFileChangeSummary> = {}
  for (const [turnKey, messages] of fileChangeMessagesByTurnKey.entries()) {
    if (assistantAnchorIdByTurnKey.has(turnKey)) continue
    const visibleMessage = messages[messages.length - 1]
    if (!visibleMessage) continue
    summaries[visibleMessage.id] = {
      changes: aggregateFileChanges(messages.flatMap((message) => message.fileChanges ?? [])),
      sourceMessageIds: messages.map((message) => message.id),
      source: 'metadata',
    }
  }

  return summaries
})

const hiddenFileChangeMessageIds = computed(() => {
  const next = new Set<string>()
  for (const summary of Object.values(anchoredFileChangeSummaryByAnchorId.value)) {
    for (const messageId of summary.sourceMessageIds) {
      next.add(messageId)
    }
  }
  for (const [messageId, summary] of Object.entries(standaloneFileChangeSummaryByMessageId.value)) {
    for (const sourceMessageId of summary.sourceMessageIds) {
      if (sourceMessageId !== messageId) {
        next.add(sourceMessageId)
      }
    }
  }
  return next
})

function readAnchoredFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
  return anchoredFileChangeSummaryByAnchorId.value[message.id] ?? null
}

function readStandaloneFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
  return standaloneFileChangeSummaryByMessageId.value[message.id] ?? null
}

function displayFileChangePath(pathValue: string): string {
  const resolved = resolveRelativePath(pathValue, props.cwd)
  const normalizedCwd = normalizePathDots(normalizePathSeparators(props.cwd.trim()))
  const normalizedResolved = normalizePathDots(normalizePathSeparators(resolved))
  if (normalizedCwd && normalizedResolved.startsWith(`${normalizedCwd}/`)) {
    return normalizedResolved.slice(normalizedCwd.length + 1)
  }
  return pathValue
}

function buildFileChangeCopyText(summary: TurnFileChangeSummary | null): string {
  if (!summary || summary.changes.length === 0) return ''
  const lines = summary.changes.map((change) => {
    const pathLabel = displayFileChangePath(change.path)
    const movedLabel = change.movedToPath ? ` -> ${displayFileChangePath(change.movedToPath)}` : ''
    const delta = formatFileChangeDelta(change)
    return `- ${fileChangeOperationLabel(change)}: ${pathLabel}${movedLabel}${delta ? ` (${delta})` : ''}`
  })
  return `Modified files:\n${lines.join('\n')}`.trim()
}

const diffViewerChanges = computed<UiFileChange[]>(() => activeDiffViewerSummary.value?.changes ?? [])

const activeDiffViewerChange = computed<UiFileChange | null>(() => {
  const changes = diffViewerChanges.value
  if (changes.length === 0) return null
  return changes.find((change) => fileChangeKey(change) === activeDiffViewerChangeKey.value) ?? changes[0]
})

function inferDiffViewerLanguage(change: UiFileChange): string {
  const targetPath = change.movedToPath || change.path
  const extension = targetPath.split('.').pop()?.toLowerCase() ?? ''
  return CODE_LANGUAGE_ALIASES[extension] ?? extension ?? ''
}

const activeDiffViewerLines = computed<DiffViewerLine[]>(() => buildDiffViewerLines(activeDiffViewerChange.value))

function hasDiffViewerContent(change: UiFileChange | null): boolean {
  return Boolean(change?.diff.trim())
}

function diffViewerMarker(line: DiffViewerLine): string {
  if (line.kind === 'add') return '+'
  if (line.kind === 'remove') return '-'
  if (line.kind === 'hunk') return '@@'
  return ''
}

function copyTextWithSelectionFallback(text: string): boolean {
  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

async function copyResponse(anchorMessageId: string): Promise<void> {
  const content = copyableResponseContentByAnchorId.value[anchorMessageId] ?? ''
  if (!content) return

  let copied = false
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content)
      copied = true
    } catch {
      copied = false
    }
  }

  if (!copied) {
    copied = copyTextWithSelectionFallback(content)
  }

  if (!copied) return

  copiedResponseAnchorId.value = anchorMessageId
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
  }
  copiedMessageResetTimer = setTimeout(() => {
    if (copiedResponseAnchorId.value === anchorMessageId) {
      copiedResponseAnchorId.value = ''
    }
    copiedMessageResetTimer = null
  }, 1800)
}

function forkResponse(anchorMessageId: string): void {
  const turnIndex = forkableTurnIndexByAnchorId.value[anchorMessageId]
  if (typeof turnIndex !== 'number') return
  if (!props.activeThreadId) return
  emit('forkThread', {
    threadId: props.activeThreadId,
    turnIndex,
  })
}

const editableTurnIdByMessageId = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {}
  for (const message of props.messages) {
    if (message.role !== 'user' || typeof message.turnIndex !== 'number') continue
    const turnId = typeof message.turnId === 'string' && message.turnId.length > 0 ? message.turnId : ''
    if (!turnId || message.text.trim().length === 0) continue
    next[message.id] = turnId
  }
  return next
})

function showEditMessageButton(message: UiMessage): boolean {
  return typeof editableTurnIdByMessageId.value[message.id] === 'string'
}

function editMessage(messageId: string): void {
  const turnId = editableTurnIdByMessageId.value[messageId]
  if (!turnId) return
  emit('rollback', { turnId })
}

function splitPlainTextByLinks(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const pattern = /https?:\/\/[^\s<>"'`，。；：！？、()[\]{}「」『』《》]+|file:\/\/[^\n<>"'`，。；：！？、[\]{}「」『』《》]+|["'](?:[A-Za-z]:[\\/]|~\/|\.{1,2}\/|\/)[^\n"']+["']|`(?:[A-Za-z]:[\\/]|~\/|\.{1,2}\/|\/)[^`\n]+`/gu
  let cursor = 0

  for (const match of text.matchAll(pattern)) {
    if (typeof match.index !== 'number') continue
    const start = match.index
    const end = start + match[0].length

    if (start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, start) })
    }

    let token = match[0]
    let trailingPunctuation = ''
    while (/[.,;:!?，。；：！？、]$/u.test(token)) {
      trailingPunctuation = token.slice(-1) + trailingPunctuation
      token = token.slice(0, -1)
    }
    const wrapped = trimLinkWrappers(token)
    token = wrapped.core
    const leading = wrapped.leading
    const trailing = wrapped.trailing + trailingPunctuation

    if (leading) {
      segments.push({ kind: 'text', value: leading })
    }

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      segments.push({ kind: 'bold', value: token.slice(2, -2) })
      if (trailing) {
        segments.push({ kind: 'text', value: trailing })
      }
    } else if (/^https?:\/\//u.test(token)) {
      segments.push({ kind: 'url', value: token, href: token })
      if (trailing) {
        segments.push({ kind: 'text', value: trailing })
      }
    } else {
      const ref = parseFileReference(token)
      if (ref) {
        segments.push({
          kind: 'file',
          value: token,
          path: ref.path,
          displayPath: token,
          downloadName: getBasename(ref.path),
        })
        if (trailing) {
          segments.push({ kind: 'text', value: trailing })
        }
      } else {
        segments.push({ kind: 'text', value: match[0] })
      }
    }

    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) })
  }

  return applyInlineMarkdownMarkers(segments)
}

function applyDelimitedMarkersAcrossTextSegments(
  segments: InlineSegment[],
  options: {
    marker: string
    kind: Extract<InlineSegment['kind'], 'bold' | 'italic' | 'strikethrough'>
    isValidContent?: (value: string) => boolean
  },
): InlineSegment[] {
  const output: InlineSegment[] = []
  let isOpen = false
  let buffer = ''

  const pushText = (value: string): void => {
    if (!value) return
    output.push({ kind: 'text', value })
  }

  for (const segment of segments) {
    if (segment.kind !== 'text') {
      if (isOpen) {
        pushText(`${options.marker}${buffer}`)
        isOpen = false
        buffer = ''
      }
      output.push(segment)
      continue
    }

    let remaining = segment.value
    while (remaining.length > 0) {
      const markerIndex = remaining.indexOf(options.marker)
      if (markerIndex < 0) {
        if (isOpen) buffer += remaining
        else pushText(remaining)
        break
      }

      const before = remaining.slice(0, markerIndex)
      if (isOpen) buffer += before
      else pushText(before)

      remaining = remaining.slice(markerIndex + options.marker.length)
      if (isOpen) {
        const content = buffer
        if (
          content.length > 0 &&
          (options.isValidContent ? options.isValidContent(content) : true)
        ) {
          output.push({ kind: options.kind, value: content })
        } else {
          pushText(`${options.marker}${content}${options.marker}`)
        }
        buffer = ''
        isOpen = false
      } else {
        isOpen = true
      }
    }
  }

  if (isOpen) {
    pushText(`${options.marker}${buffer}`)
  }

  return output
}

function applyInlineMarkdownMarkers(segments: InlineSegment[]): InlineSegment[] {
  const nonWhitespaceWrapped = (value: string): boolean => (
    value.trim().length > 0 &&
    !/^\s/u.test(value) &&
    !/\s$/u.test(value)
  )

  let next = applyDelimitedMarkersAcrossTextSegments(segments, {
    marker: '**',
    kind: 'bold',
    isValidContent: nonWhitespaceWrapped,
  })

  next = applyDelimitedMarkersAcrossTextSegments(next, {
    marker: '~~',
    kind: 'strikethrough',
    isValidContent: nonWhitespaceWrapped,
  })

  next = applyDelimitedMarkersAcrossTextSegments(next, {
    marker: '*',
    kind: 'italic',
    isValidContent: nonWhitespaceWrapped,
  })

  return next
}

function splitTextByFileUrls(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let cursor = 0
  let scanFrom = 0

  const findNextMarkdownLink = (
    source: string,
    fromIndex: number,
  ): { start: number; end: number; token: string } | null => {
    let linkStart = source.indexOf('[', fromIndex)
    while (linkStart >= 0) {
      const labelEnd = source.indexOf(']', linkStart + 1)
      if (labelEnd < 0) return null
      if (source[labelEnd + 1] !== '(') {
        linkStart = source.indexOf('[', linkStart + 1)
        continue
      }

      let depth = 1
      let index = labelEnd + 2
      let hasNewLine = false
      while (index < source.length) {
        const char = source[index]
        if (char === '\n') {
          hasNewLine = true
          break
        }
        if (char === '(') depth += 1
        if (char === ')') {
          depth -= 1
          if (depth === 0) {
            const token = source.slice(linkStart, index + 1)
            if (parseMarkdownLinkToken(token)) {
              return { start: linkStart, end: index + 1, token }
            }
            break
          }
        }
        index += 1
      }

      if (hasNewLine) {
        linkStart = source.indexOf('[', linkStart + 1)
        continue
      }
      linkStart = source.indexOf('[', linkStart + 1)
    }
    return null
  }

  while (scanFrom < text.length) {
    const match = findNextMarkdownLink(text, scanFrom)
    if (!match) break
    const { start, end, token } = match

    if (start > cursor) {
      segments.push(...splitPlainTextByLinks(text.slice(cursor, start)))
    }

    const markdownToken = parseMarkdownLinkToken(token)
    if (!markdownToken) {
      segments.push(...splitPlainTextByLinks(text.slice(start, end)))
      cursor = end
      scanFrom = end
      continue
    }
    const label = markdownToken.label
    const target = markdownToken.target

    if (/^https?:\/\//u.test(target)) {
      segments.push({ kind: 'url', value: label || target, href: target })
    } else {
      const ref = parseFileReference(target)
      if (ref) {
        segments.push({
          kind: 'file',
          value: target,
          path: ref.path,
          displayPath: label || target,
          downloadName: getBasename(ref.path),
        })
      } else {
        segments.push({ kind: 'text', value: token })
      }
    }

    cursor = end
    scanFrom = end
  }

  if (cursor < text.length) {
    segments.push(...splitPlainTextByLinks(text.slice(cursor)))
  }

  return segments
}

function parseInlineSegmentsUncached(text: string): InlineSegment[] {
  const linkFirstSegments = splitTextByFileUrls(text)
  if (!text.includes('`')) return linkFirstSegments
  if (!linkFirstSegments.some((segment) => segment.kind === 'text' && segment.value.includes('`'))) {
    return linkFirstSegments
  }

  const parseCodeAwareTextSegments = (value: string): InlineSegment[] => {
    if (!value.includes('`')) return splitPlainTextByLinks(value)

    const segments: InlineSegment[] = []
    let cursor = 0
    let textStart = 0

    while (cursor < value.length) {
      if (value[cursor] !== '`') {
        cursor += 1
        continue
      }

      let openLength = 1
      while (cursor + openLength < value.length && value[cursor + openLength] === '`') {
        openLength += 1
      }
      const delimiter = '`'.repeat(openLength)

      let searchFrom = cursor + openLength
      let closingStart = -1
      while (searchFrom < value.length) {
        const candidate = value.indexOf(delimiter, searchFrom)
        if (candidate < 0) break

        const hasBacktickBefore = candidate > 0 && value[candidate - 1] === '`'
        const hasBacktickAfter =
          candidate + openLength < value.length && value[candidate + openLength] === '`'
        const hasNewLineInside = value.slice(cursor + openLength, candidate).includes('\n')

        if (!hasBacktickBefore && !hasBacktickAfter && !hasNewLineInside) {
          closingStart = candidate
          break
        }
        searchFrom = candidate + 1
      }

      if (closingStart < 0) {
        cursor += openLength
        continue
      }

      if (cursor > textStart) {
        segments.push(...splitPlainTextByLinks(value.slice(textStart, cursor)))
      }

      const token = value.slice(cursor + openLength, closingStart)
      if (token.length > 0) {
        const markdownLink = parseMarkdownLinkToken(token)
        if (markdownLink) {
          if (/^https?:\/\//u.test(markdownLink.target)) {
            segments.push({
              kind: 'url',
              value: markdownLink.label || markdownLink.target,
              href: markdownLink.target,
            })
          } else {
            const markdownFileReference = parseFileReference(markdownLink.target)
            if (markdownFileReference) {
              segments.push({
                kind: 'file',
                value: markdownLink.target,
                path: markdownFileReference.path,
                displayPath: markdownLink.label || markdownLink.target,
                downloadName: getBasename(markdownFileReference.path),
              })
            } else {
              segments.push({ kind: 'code', value: token })
            }
          }
        } else if (/^https?:\/\/[^\s]+$/u.test(token)) {
          segments.push({
            kind: 'url',
            value: token,
            href: token,
          })
        } else {
          const fileReference = parseFileReference(token)
          if (fileReference) {
            const displayPath = fileReference.line
              ? `${fileReference.path}:${String(fileReference.line)}`
              : fileReference.path
            segments.push({
              kind: 'file',
              value: token,
              path: fileReference.path,
              displayPath,
              downloadName: getBasename(fileReference.path),
            })
          } else {
            segments.push({ kind: 'code', value: token })
          }
        }
      } else {
        segments.push({ kind: 'text', value: `${delimiter}${delimiter}` })
      }

      cursor = closingStart + openLength
      textStart = cursor
    }

    if (textStart < value.length) {
      segments.push(...splitPlainTextByLinks(value.slice(textStart)))
    }

    return segments
  }

  return linkFirstSegments.flatMap((segment) => (
    segment.kind === 'text'
      ? parseCodeAwareTextSegments(segment.value)
      : [segment]
  ))
}

function getInlineSegments(text: string): InlineSegment[] {
  const cached = inlineSegmentCache.get(text)
  if (cached) {
    inlineSegmentCache.delete(text)
    inlineSegmentCache.set(text, cached)
    return cached
  }
  return setBoundedCacheEntry(inlineSegmentCache, text, parseInlineSegmentsUncached(text), INLINE_SEGMENT_CACHE_LIMIT)
}

function toRenderableImageUrl(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''
  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/codex-local-image?')
  ) {
    return normalized
  }

  if (normalized.startsWith('file://')) {
    return `/codex-local-image?path=${encodeURIComponent(normalized)}`
  }

  const looksLikeUnixAbsolute = normalized.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(normalized)
  if (looksLikeUnixAbsolute || looksLikeWindowsAbsolute) {
    return `/codex-local-image?path=${encodeURIComponent(normalized)}`
  }

  return normalized
}

function toBrowseUrl(pathValue: string): string {
  const normalized = pathValue.trim()
  if (!normalized) return '#'
  const looksLikeAbsolutePath = (candidate: string): boolean => (
    candidate.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(candidate)
  )

  const parsed = parseFileReference(normalized)
  const candidatePath = parsed?.path ?? normalized
  const resolved = resolveRelativePath(candidatePath, props.cwd)

  if (looksLikeAbsolutePath(resolved)) {
    const normalizedResolved = resolved.startsWith('/') ? resolved : `/${resolved}`
    return `/codex-local-browse${encodeURI(normalizedResolved)}`
  }

  return '#'
}

const fileLinkContextMenuStyle = computed(() => ({
  left: `${String(fileLinkContextMenuX.value)}px`,
  top: `${String(fileLinkContextMenuY.value)}px`,
}))

function toEditUrlFromBrowseHref(href: string): string {
  const normalizedHref = href.trim()
  if (!normalizedHref) return ''
  try {
    const resolved = new URL(normalizedHref, window.location.href)
    if (!resolved.pathname.startsWith('/codex-local-browse')) return ''
    const editPath = `/codex-local-edit${resolved.pathname.slice('/codex-local-browse'.length)}`
    return `${editPath}${resolved.search}${resolved.hash}`
  } catch {
    return ''
  }
}

function onConversationContextMenu(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const anchor = target.closest('a.message-file-link')
  if (!(anchor instanceof HTMLAnchorElement)) return

  const href = (anchor.getAttribute('href') ?? '').trim()
  if (!href || href === '#') return

  event.preventDefault()
  event.stopPropagation()

  fileLinkContextBrowseUrl.value = href
  fileLinkContextEditUrl.value = toEditUrlFromBrowseHref(href)
  fileLinkContextMenuX.value = event.clientX
  fileLinkContextMenuY.value = event.clientY
  isFileLinkContextMenuVisible.value = true
}

function closeFileLinkContextMenu(): void {
  if (!isFileLinkContextMenuVisible.value) return
  isFileLinkContextMenuVisible.value = false
}

function openFileLinkContextBrowse(): void {
  const href = fileLinkContextBrowseUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

function openFileLinkContextEdit(): void {
  const href = fileLinkContextEditUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

async function copyFileLinkContextLink(): Promise<void> {
  const href = fileLinkContextBrowseUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return

  try {
    await navigator.clipboard.writeText(href)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = href
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

function onWindowPointerDownForFileLinkContextMenu(event: PointerEvent): void {
  if (!isFileLinkContextMenuVisible.value) return
  const menu = fileLinkContextMenuRef.value
  if (!menu) {
    closeFileLinkContextMenu()
    return
  }
  const target = event.target
  if (target instanceof Node && menu.contains(target)) return
  closeFileLinkContextMenu()
}

function onWindowBlurForFileLinkContextMenu(): void {
  closeFileLinkContextMenu()
}

function onWindowKeydownForFileLinkContextMenu(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  closeFileLinkContextMenu()
}

function normalizeMarkdownText(text: string): string {
  return text.replace(/\r\n/gu, '\n')
}

function leadingIndentWidth(line: string): number {
  const leadingWhitespace = line.match(/^\s*/u)?.[0] ?? ''
  return leadingWhitespace.replace(/\t/gu, '    ').length
}

function stripIndentedContent(line: string, baseIndent: number): string {
  if (baseIndent <= 0) return line.trimStart()

  let index = 0
  let width = 0
  while (index < line.length && width < baseIndent) {
    const character = line[index]
    width += character === '\t' ? 4 : 1
    index += 1
  }

  return line.slice(index)
}

function isBlankMarkdownLine(line: string): boolean {
  return line.trim().length === 0
}

function readHeading(line: string): { level: number; value: string } | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/u)
  if (!match) return null
  return {
    level: match[1].length,
    value: match[2].trim(),
  }
}

function readBlockquoteLine(line: string): string | null {
  const match = line.match(/^\s{0,3}>\s?(.*)$/u)
  if (!match) return null
  return match[1] ?? ''
}

function readUnorderedListItem(line: string): string | null {
  const match = line.match(/^\s*[-*+]\s+(.+)$/u)
  return match?.[1]?.trim() ?? null
}

function readUnorderedListItemMatch(line: string): { indent: number; text: string } | null {
  const match = line.match(/^(\s*)[-*+]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    text: match[2]?.trim() ?? '',
  }
}

function readTaskListItem(line: string): TaskListItem | null {
  const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/u)
  if (!match) return null
  return {
    checked: (match[1] ?? ' ').toLowerCase() === 'x',
    text: match[2]?.trim() ?? '',
  }
}

function readTaskListItemMatch(line: string): { indent: number; item: TaskListItem } | null {
  const match = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    item: {
      checked: (match[2] ?? ' ').toLowerCase() === 'x',
      text: match[3]?.trim() ?? '',
    },
  }
}

function readOrderedListItemData(line: string): { indent: number; text: string; start: number } | null {
  const match = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    start: Number.parseInt(match[2] ?? '1', 10) || 1,
    text: match[3]?.trim() ?? '',
  }
}

function readOrderedListItem(line: string): string | null {
  return readOrderedListItemData(line)?.text ?? null
}

function readOrderedListItemMatch(line: string): { indent: number; text: string; start: number } | null {
  return readOrderedListItemData(line)
}

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return null

  let content = trimmed
  if (content.startsWith('|')) content = content.slice(1)
  if (content.endsWith('|')) content = content.slice(0, -1)

  const cells: string[] = []
  let current = ''
  let codeFenceLength = 0

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (character === '\\' && content[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }

    if (character === '`') {
      let runLength = 1
      while (content[index + runLength] === '`') runLength += 1
      current += content.slice(index, index + runLength)
      if (codeFenceLength === 0) codeFenceLength = runLength
      else if (codeFenceLength === runLength) codeFenceLength = 0
      index += runLength - 1
      continue
    }

    if (character === '|' && codeFenceLength === 0) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells.some((cell) => cell.length > 0) ? cells : null
}

function readTableAlignmentRow(line: string): TableAlignment[] | null {
  const cells = splitMarkdownTableRow(line)
  if (!cells || cells.length === 0) return null

  const alignments = cells.map((cell) => {
    const trimmed = cell.replace(/\s+/gu, '')
    if (!/^:?-{3,}:?$/u.test(trimmed)) return null
    const startsWithColon = trimmed.startsWith(':')
    const endsWithColon = trimmed.endsWith(':')
    if (startsWithColon && endsWithColon) return 'center'
    if (endsWithColon) return 'right'
    if (startsWithColon) return 'left'
    return null
  })

  return alignments.every((alignment, index) => alignment !== null || /^-+$/u.test(cells[index].replace(/\s+/gu, '')))
    ? alignments
    : null
}

function normalizeTableCells(cells: string[], width: number): string[] {
  if (cells.length === width) return cells
  if (cells.length > width) return cells.slice(0, width)
  return [...cells, ...Array.from({ length: width - cells.length }, () => '')]
}

function readTableBlock(lines: string[], startIndex: number): Extract<MessageBlock, { kind: 'table' }> | null {
  if (startIndex + 1 >= lines.length) return null

  const headerLine = lines[startIndex]
  const separatorLine = lines[startIndex + 1]
  const headers = splitMarkdownTableRow(headerLine)
  const alignments = readTableAlignmentRow(separatorLine)
  if (!headers || !alignments) return null
  if (headers.length !== alignments.length) return null

  const trimmedHeader = headerLine.trim()
  if (!trimmedHeader.startsWith('|') && (trimmedHeader.match(/\|/gu)?.length ?? 0) < 2) return null

  const width = headers.length
  const rows: string[][] = []
  let index = startIndex + 2
  while (index < lines.length) {
    if (isBlankMarkdownLine(lines[index])) break
    const row = splitMarkdownTableRow(lines[index])
    if (!row) break
    rows.push(normalizeTableCells(row, width))
    index += 1
  }

  return {
    kind: 'table',
    headers: normalizeTableCells(headers, width),
    rows,
    alignments,
  }
}

function isParagraphBreakingLine(line: string): boolean {
  return (
    isBlankMarkdownLine(line) ||
    readFenceStart(line) !== null ||
    isThematicBreakLine(line) ||
    readHeading(line) !== null ||
    readBlockquoteLine(line) !== null ||
    readTaskListItem(line) !== null ||
    readUnorderedListItem(line) !== null ||
    readOrderedListItem(line) !== null
  )
}

function readListParagraph(
  lines: string[],
  startIndex: number,
  baseIndent = -1,
): { value: string; nextIndex: number } | null {
  const paragraphLines: string[] = []
  let index = startIndex

  while (index < lines.length) {
    if (isParagraphBreakingLine(lines[index])) break
    if (baseIndent >= 0 && leadingIndentWidth(lines[index]) <= baseIndent) break

    paragraphLines.push(baseIndent >= 0 ? stripIndentedContent(lines[index], baseIndent + 1) : lines[index])
    index += 1
  }

  const value = paragraphLines.join('\n').trim()
  return value ? { value, nextIndex: index } : null
}

function findNextNonBlankLineIndex(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!isBlankMarkdownLine(lines[index])) return index
  }
  return -1
}

function readNestedListBlocks(
  lines: string[],
  startIndex: number,
  parentIndent: number,
  stopAtItem: ((line: string) => { indent: number; text: string } | null) | null = null,
  allowLooseChildLists = false,
): { blocks: MessageBlock[]; nextIndex: number } | null {
  const nestedLines: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    if (isBlankMarkdownLine(line)) {
      const nextNonBlankIndex = findNextNonBlankLineIndex(lines, index + 1)
      if (nextNonBlankIndex === -1) {
        nestedLines.push('')
        index = lines.length
        break
      }
      const nextStopItem = stopAtItem?.(lines[nextNonBlankIndex])
      if (nextStopItem && nextStopItem.indent === parentIndent) break
      if (leadingIndentWidth(lines[nextNonBlankIndex]) <= parentIndent) break
      nestedLines.push('')
      index += 1
      continue
    }

    const stopItem = stopAtItem?.(line)
    if (stopItem && stopItem.indent === parentIndent) break

    const lineIndent = leadingIndentWidth(line)
    const isLooseChildList = allowLooseChildLists && (
      readTaskListItem(line) !== null ||
      readUnorderedListItem(line) !== null
    )
    if (lineIndent <= parentIndent && !isLooseChildList) break

    nestedLines.push(
      lineIndent > parentIndent
        ? stripIndentedContent(line, parentIndent + 1)
        : line.trimStart(),
    )
    index += 1
  }

  while (nestedLines.length > 0 && isBlankMarkdownLine(nestedLines[0])) nestedLines.shift()
  while (nestedLines.length > 0 && isBlankMarkdownLine(nestedLines[nestedLines.length - 1])) nestedLines.pop()

  if (nestedLines.length === 0) return null

  return {
    blocks: parseTextBlocks(nestedLines.join('\n')),
    nextIndex: index,
  }
}

function readListItems(
  lines: string[],
  startIndex: number,
  readItem: (line: string) => { indent: number; text: string } | null,
  allowLooseChildLists = false,
): { items: ListItem[]; nextIndex: number } | null {
  const items: ListItem[] = []
  let index = startIndex
  const firstItem = readItem(lines[startIndex])
  if (!firstItem) return null
  const baseIndent = firstItem.indent

  while (index < lines.length) {
    const itemValue = readItem(lines[index])
    if (itemValue === null || itemValue.indent !== baseIndent) break

    const paragraphs = [itemValue.text]
    const children: MessageBlock[] = []
    index += 1

    while (index < lines.length) {
      if (isBlankMarkdownLine(lines[index])) {
        const nextNonBlankIndex = findNextNonBlankLineIndex(lines, index + 1)
        if (nextNonBlankIndex === -1) {
          index = lines.length
          break
        }
        const nextSameLevelItem = readItem(lines[nextNonBlankIndex])
        if (nextSameLevelItem && nextSameLevelItem.indent === baseIndent) {
          index = nextNonBlankIndex
          break
        }
        if (leadingIndentWidth(lines[nextNonBlankIndex]) <= baseIndent) {
          index = nextNonBlankIndex
          break
        }
        index += 1
        continue
      }

      const nextSameLevelItem = readItem(lines[index])
      if (nextSameLevelItem && nextSameLevelItem.indent === baseIndent) break

      const hasIndentedChildren = leadingIndentWidth(lines[index]) > baseIndent
      const hasLooseChildList = allowLooseChildLists && (
        readTaskListItem(lines[index]) !== null ||
        readUnorderedListItem(lines[index]) !== null
      )
      if (hasIndentedChildren || hasLooseChildList) {
        const nestedBlocks = readNestedListBlocks(lines, index, baseIndent, readItem, allowLooseChildLists)
        if (nestedBlocks) {
          children.push(...nestedBlocks.blocks)
          index = nestedBlocks.nextIndex
          continue
        }
      }

      if (leadingIndentWidth(lines[index]) <= baseIndent) break

      const continuation = readListParagraph(lines, index, baseIndent)
      if (!continuation) break
      paragraphs.push(continuation.value)
      index = continuation.nextIndex
    }

    items.push(children.length > 0 ? { paragraphs, children } : { paragraphs })
  }

  return items.length > 0 ? { items, nextIndex: index } : null
}

function isThematicBreakLine(line: string): boolean {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line.trim())
}

function readFenceStart(line: string): { marker: string; language: string } | null {
  const match = line.match(/^\s{0,3}(```+|~~~+)\s*([^\s`~][^`]*)?\s*$/u)
  if (!match) return null
  return {
    marker: match[1],
    language: (match[2] ?? '').trim(),
  }
}

function parseTextBlocks(text: string): MessageBlock[] {
  const normalizedText = normalizeMarkdownText(text)
  const lines = normalizedText.split('\n')
  const blocks: MessageBlock[] = []
  let index = 0

  while (index < lines.length) {
    if (isBlankMarkdownLine(lines[index])) {
      index += 1
      continue
    }

    const fence = readFenceStart(lines[index])
    if (fence) {
      index += 1
      const codeLines: string[] = []
      while (index < lines.length) {
        if (lines[index].trim() === fence.marker) {
          index += 1
          break
        }
        codeLines.push(lines[index])
        index += 1
      }
      blocks.push({
        kind: 'codeBlock',
        language: fence.language,
        value: codeLines.join('\n'),
      })
      continue
    }

    if (isThematicBreakLine(lines[index])) {
      blocks.push({ kind: 'thematicBreak' })
      index += 1
      continue
    }

    const heading = readHeading(lines[index])
    if (heading) {
      blocks.push({ kind: 'heading', level: heading.level, value: heading.value })
      index += 1
      continue
    }

    const quoteLine = readBlockquoteLine(lines[index])
    if (quoteLine !== null) {
      const quoteLines: string[] = []
      while (index < lines.length) {
        const nextQuoteLine = readBlockquoteLine(lines[index])
        if (nextQuoteLine === null) break
        quoteLines.push(nextQuoteLine)
        index += 1
      }
      blocks.push({ kind: 'blockquote', value: quoteLines.join('\n').trim() })
      continue
    }

    const table = readTableBlock(lines, index)
    if (table) {
      blocks.push(table)
      index += 2 + table.rows.length
      continue
    }

    const taskItem = readTaskListItem(lines[index])
    if (taskItem !== null) {
      const items: TaskListItem[] = []
      const baseIndent = readTaskListItemMatch(lines[index])?.indent ?? 0
      while (index < lines.length) {
        const nextItem = readTaskListItemMatch(lines[index])
        if (nextItem === null || nextItem.indent !== baseIndent) break
        items.push(nextItem.item)
        index += 1
      }
      if (items.length > 0) {
        blocks.push({ kind: 'taskList', items })
        continue
      }
    }

    const unorderedItem = readUnorderedListItem(lines[index])
    if (unorderedItem !== null) {
      const parsedList = readListItems(lines, index, readUnorderedListItemMatch)
      if (parsedList) {
        blocks.push({ kind: 'unorderedList', items: parsedList.items })
        index = parsedList.nextIndex
        continue
      }
      if (unorderedItem.length > 0) {
        blocks.push({ kind: 'unorderedList', items: [{ paragraphs: [unorderedItem] }] })
        index += 1
        continue
      }
    }

    const orderedItem = readOrderedListItem(lines[index])
    if (orderedItem !== null) {
      const orderedItemMatch = readOrderedListItemMatch(lines[index])
      const parsedList = readListItems(lines, index, readOrderedListItemMatch, true)
      if (parsedList) {
        blocks.push({
          kind: 'orderedList',
          items: parsedList.items,
          start: orderedItemMatch?.start ?? 1,
        })
        index = parsedList.nextIndex
        continue
      }
      if (orderedItem.length > 0) {
        blocks.push({
          kind: 'orderedList',
          items: [{ paragraphs: [orderedItem] }],
          start: orderedItemMatch?.start ?? 1,
        })
        index += 1
        continue
      }
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      if (isBlankMarkdownLine(lines[index])) break
      if (
        readFenceStart(lines[index]) ||
        isThematicBreakLine(lines[index]) ||
        readHeading(lines[index]) ||
        readTableBlock(lines, index) ||
        readBlockquoteLine(lines[index]) !== null ||
        readTaskListItem(lines[index]) !== null ||
        readUnorderedListItem(lines[index]) !== null ||
        readOrderedListItem(lines[index]) !== null
      ) break
      paragraphLines.push(lines[index])
      index += 1
    }

    const value = paragraphLines.join('\n').trim()
    if (value) {
      blocks.push({ kind: 'paragraph', value })
    }
  }

  return blocks
}

function parseNonCodeMessageBlocks(text: string): MessageBlock[] {
  if (!text.includes('![') || !text.includes('](')) {
    return parseTextBlocks(text)
  }

  const blocks: MessageBlock[] = []
  const imagePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/gu
  let cursor = 0

  for (const match of text.matchAll(imagePattern)) {
    const [fullMatch, altRaw, urlRaw] = match
    if (typeof match.index !== 'number') continue

    const start = match.index
    const end = start + fullMatch.length
    const imageUrl = toRenderableImageUrl(urlRaw.trim())
    if (!imageUrl) continue

    if (start > cursor) {
      blocks.push(...parseTextBlocks(text.slice(cursor, start)))
    }

    blocks.push({ kind: 'image', url: imageUrl, alt: altRaw.trim(), markdown: fullMatch })
    cursor = end
  }

  if (cursor < text.length) {
    blocks.push(...parseTextBlocks(text.slice(cursor)))
  }

  return blocks
}

function parseMessageBlocks(text: string): MessageBlock[] {
  const normalizedText = normalizeMarkdownText(text)
  const lines = normalizedText.split('\n')
  const blocks: MessageBlock[] = []
  let index = 0
  let chunkStart = 0

  const flushChunk = (endExclusive: number): void => {
    if (endExclusive <= chunkStart) return
    const chunk = lines.slice(chunkStart, endExclusive).join('\n')
    blocks.push(...parseNonCodeMessageBlocks(chunk))
  }

  while (index < lines.length) {
    const fence = readFenceStart(lines[index])
    if (!fence) {
      index += 1
      continue
    }

    flushChunk(index)

    index += 1
    const codeLines: string[] = []
    while (index < lines.length) {
      if (lines[index].trim() === fence.marker) {
        index += 1
        break
      }
      codeLines.push(lines[index])
      index += 1
    }

    blocks.push({
      kind: 'codeBlock',
      language: fence.language,
      value: codeLines.join('\n'),
    })
    chunkStart = index
  }

  flushChunk(lines.length)
  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', value: text }]
}

function getMessageBlocks(message: UiMessage): MessageBlock[] {
  const cached = messageBlockCache.get(message.id)
  if (cached && cached.text === message.text && cached.cwd === props.cwd) {
    messageBlockCache.delete(message.id)
    messageBlockCache.set(message.id, cached)
    return cached.blocks
  }
  const blocks = parseMessageBlocks(message.text)
  return setBoundedCacheEntry(
    messageBlockCache,
    message.id,
    { text: message.text, cwd: props.cwd, blocks },
    MESSAGE_BLOCK_CACHE_LIMIT,
  ).blocks
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function normalizeCodeLanguage(language: string): string {
  const token = language.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
  if (!token) return ''
  return CODE_LANGUAGE_ALIASES[token] ?? token
}

function renderHighlightedCodeAsHtmlUncached(language: string, value: string): string {
  const normalizedLanguage = normalizeCodeLanguage(language)
  if (!normalizedLanguage) return escapeHtml(value)
  const highlighter = highlightJsModule.value
  if (!highlighter) return escapeHtml(value)

  try {
    if (highlighter.getLanguage(normalizedLanguage)) {
      return highlighter.highlight(value, {
        language: normalizedLanguage,
        ignoreIllegals: true,
      }).value
    }
  } catch {
    // Fall back to plain escaped code when highlighting fails.
  }

  return escapeHtml(value)
}

function renderCachedHighlightedCodeAsHtml(language: string, value: string): string {
  const cacheKey = `${highlightCacheVersion.value}\u0000${normalizeCodeLanguage(language)}\u0000${language}\u0000${value}`
  const cached = highlightHtmlCache.get(cacheKey)
  if (cached !== undefined) {
    highlightHtmlCache.delete(cacheKey)
    highlightHtmlCache.set(cacheKey, cached)
    return cached
  }
  return setBoundedCacheEntry(
    highlightHtmlCache,
    cacheKey,
    renderHighlightedCodeAsHtmlUncached(language, value),
    HIGHLIGHT_HTML_CACHE_LIMIT,
  )
}

function renderInlineSegmentsAsHtml(text: string): string {
  return getInlineSegments(text)
    .map((segment) => {
      if (segment.kind === 'text') {
        return escapeHtml(segment.value)
      }
      if (segment.kind === 'bold') {
        return `<strong class="message-bold-text">${escapeHtml(segment.value)}</strong>`
      }
      if (segment.kind === 'italic') {
        return `<em class="message-italic-text">${escapeHtml(segment.value)}</em>`
      }
      if (segment.kind === 'strikethrough') {
        return `<s class="message-strikethrough-text">${escapeHtml(segment.value)}</s>`
      }
      if (segment.kind === 'file') {
        return `<a class="message-file-link" href="${escapeHtml(toBrowseUrl(segment.path))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(segment.path)}">${escapeHtml(segment.displayPath)}</a>`
      }
      if (segment.kind === 'url') {
        return `<a class="message-file-link" href="${escapeHtml(segment.href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(segment.href)}">${escapeHtml(segment.value)}</a>`
      }
      return `<code class="message-inline-code">${escapeHtml(segment.value)}</code>`
    })
    .join('')
}

function renderListItemParagraphsAsHtml(item: ListItem): string {
  return item.paragraphs
    .map((paragraph) => `<div class="message-list-item-text message-list-item-paragraph">${renderInlineSegmentsAsHtml(paragraph)}</div>`)
    .join('')
}

function renderListItemContentAsHtml(item: ListItem): string {
  const paragraphsHtml = renderListItemParagraphsAsHtml(item)
  const childrenHtml = item.children?.map((block) => renderMessageBlockAsHtml(block)).join('') ?? ''
  return paragraphsHtml + childrenHtml
}

function tableCellAlignmentStyle(alignment: TableAlignment): string {
  if (!alignment) return ''
  return ` style="text-align:${alignment}"`
}

function renderMessageBlockAsHtml(block: MessageBlock): string {
  if (block.kind === 'paragraph') {
    return `<p class="message-text">${renderInlineSegmentsAsHtml(block.value)}</p>`
  }
  if (block.kind === 'heading') {
    const level = Math.min(6, Math.max(1, Math.trunc(block.level)))
    const tag = headingTag(level)
    const classes = `message-heading ${headingClass(level)}`
    return `<${tag} class="${classes}">${renderInlineSegmentsAsHtml(block.value)}</${tag}>`
  }
  if (block.kind === 'blockquote') {
    return `<blockquote class="message-blockquote">${renderInlineSegmentsAsHtml(block.value)}</blockquote>`
  }
  if (block.kind === 'unorderedList') {
    const items = block.items
      .map((item) => `<li class="message-list-item"><div class="message-list-item-content">${renderListItemContentAsHtml(item)}</div></li>`)
      .join('')
    return `<ul class="message-list message-list-unordered">${items}</ul>`
  }
  if (block.kind === 'taskList') {
    const items = block.items
      .map((item) => (
        `<li class="message-task-item">` +
        `<span class="message-task-checkbox" data-checked="${item.checked ? 'true' : 'false'}">${item.checked ? '☑' : '☐'}</span>` +
        `<div class="message-list-item-text">${renderInlineSegmentsAsHtml(item.text)}</div>` +
        `</li>`
      ))
      .join('')
    return `<ul class="message-list message-task-list">${items}</ul>`
  }
  if (block.kind === 'orderedList') {
    const items = block.items
      .map((item) => `<li class="message-list-item"><div class="message-list-item-content">${renderListItemContentAsHtml(item)}</div></li>`)
      .join('')
    return `<ol class="message-list message-list-ordered" start="${block.start}">${items}</ol>`
  }
  if (block.kind === 'table') {
    const headerCells = block.headers
      .map((cell, index) => `<th class="message-table-head-cell"${tableCellAlignmentStyle(block.alignments[index] ?? null)}>${renderInlineSegmentsAsHtml(cell)}</th>`)
      .join('')
    const rows = block.rows
      .map((row) => (
        `<tr class="message-table-body-row">` +
        row.map((cell, index) => `<td class="message-table-cell"${tableCellAlignmentStyle(block.alignments[index] ?? null)}>${renderInlineSegmentsAsHtml(cell)}</td>`).join('') +
        `</tr>`
      ))
      .join('')
    const body = rows ? `<tbody>${rows}</tbody>` : ''
    return `<div class="message-table-wrap"><table class="message-table"><thead><tr>${headerCells}</tr></thead>${body}</table></div>`
  }
  if (block.kind === 'codeBlock') {
    const language = block.language
      ? `<div class="message-code-language">${escapeHtml(block.language)}</div>`
      : ''
    return `<div class="message-code-block">${language}<pre class="message-code-pre"><code class="hljs">${renderCachedHighlightedCodeAsHtml(block.language, block.value)}</code></pre></div>`
  }
  if (block.kind === 'thematicBreak') {
    return '<hr class="message-divider">'
  }
  return `<img class="message-image-preview message-markdown-image" src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || 'Embedded message image')}" loading="lazy">`
}

function renderMarkdownBlocksAsHtml(text: string): string {
  const cacheKey = `${props.cwd}\u0000${highlightCacheVersion.value}\u0000${text}`
  const cached = markdownHtmlCache.get(cacheKey)
  if (cached && cached.text === text && cached.cwd === props.cwd && cached.highlightVersion === highlightCacheVersion.value) {
    markdownHtmlCache.delete(cacheKey)
    markdownHtmlCache.set(cacheKey, cached)
    return cached.html
  }
  const html = parseMessageBlocks(text)
    .map((block) => renderMessageBlockAsHtml(block))
    .join('')
  return setBoundedCacheEntry(
    markdownHtmlCache,
    cacheKey,
    {
      text,
      cwd: props.cwd,
      highlightVersion: highlightCacheVersion.value,
      html,
    },
    MARKDOWN_HTML_CACHE_LIMIT,
  ).html
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const reason = typeof params?.reason === 'string' ? params.reason.trim() : ''
  if (reason) return reason
  const message = typeof params?.message === 'string' ? params.message.trim() : ''
  if (message) return message
  return typeof params?.prompt === 'string' ? params.prompt.trim() : ''
}

function requestDisplayTitle(request: UiServerRequest): string {
  if (request.method === 'item/commandExecution/requestApproval') return 'Command approval required'
  if (request.method === 'item/fileChange/requestApproval') return 'File change approval required'
  if (request.method === 'item/permissions/requestApproval') return 'Permissions approval required'
  if (request.method === 'mcpServer/elicitation/request') return 'MCP server input required'
  if (request.method === 'item/tool/requestUserInput') return 'Input required'
  if (request.method === 'item/tool/call') return 'Tool call waiting for response'
  return request.method
}

function readMcpElicitationServerName(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return typeof params?.serverName === 'string' ? params.serverName.trim() : ''
}

function readMcpElicitationUrl(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return typeof params?.url === 'string' ? params.url.trim() : ''
}

function mcpElicitationAnswerKey(requestId: number, fieldKey: string): string {
  return `${String(requestId)}:${fieldKey}`
}

function readMcpElicitationFields(request: UiServerRequest): McpElicitationField[] {
  const params = asRecord(request.params)
  const requestedSchema = asRecord(params?.requestedSchema)
  const properties = asRecord(requestedSchema?.properties)
  if (!properties) return []

  const required = new Set(
    Array.isArray(requestedSchema?.required)
      ? requestedSchema.required.filter((entry): entry is string => typeof entry === 'string')
      : [],
  )

  return Object.entries(properties)
    .map(([key, value]) => parseMcpElicitationField(key, asRecord(value), required.has(key)))
    .filter((field): field is McpElicitationField => field !== null)
}

function parseMcpElicitationField(
  key: string,
  schema: Record<string, unknown> | null,
  required: boolean,
): McpElicitationField | null {
  if (!schema) return null

  const label = typeof schema.title === 'string' && schema.title.trim().length > 0 ? schema.title.trim() : key
  const description = typeof schema.description === 'string' ? schema.description.trim() : ''
  const type = typeof schema.type === 'string' ? schema.type.trim() : ''

  if (type === 'boolean') {
    return { key, label, description, required, kind: 'boolean', inputType: 'checkbox', options: [], defaultValue: schema.default === true }
  }

  if (type === 'number' || type === 'integer') {
    return {
      key,
      label,
      description,
      required,
      kind: 'number',
      inputType: 'number',
      options: [],
      defaultValue: typeof schema.default === 'number' ? schema.default : '',
    }
  }

  const options = readMcpElicitationOptions(schema)
  if (type === 'array') {
    return {
      key,
      label,
      description,
      required,
      kind: 'multiEnum',
      inputType: 'checkbox',
      options,
      defaultValue: Array.isArray(schema.default)
        ? schema.default.filter((entry): entry is string => typeof entry === 'string')
        : [],
    }
  }

  if (options.length > 0) {
    return {
      key,
      label,
      description,
      required,
      kind: 'singleEnum',
      inputType: 'select',
      options,
      defaultValue: (typeof schema.default === 'string' ? schema.default : '') || options[0]?.value || '',
    }
  }

  return {
    key,
    label,
    description,
    required,
    kind: 'string',
    inputType: readMcpElicitationInputType(schema),
    options: [],
    defaultValue: typeof schema.default === 'string' ? schema.default : '',
  }
}

function readMcpElicitationOptions(schema: Record<string, unknown>): McpElicitationFieldOption[] {
  const titledSource = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : []
  const titledOptions = titledSource
    .map((option) => asRecord(option))
    .map((option) => ({
      value: typeof option?.const === 'string' ? option.const : '',
      label: typeof option?.title === 'string' && option.title.trim().length > 0 ? option.title : (typeof option?.const === 'string' ? option.const : ''),
    }))
    .filter((option) => option.value.length > 0)
  if (titledOptions.length > 0) return titledOptions

  const items = asRecord(schema.items)
  if (items) {
    const nestedOptions = readMcpElicitationOptions(items)
    if (nestedOptions.length > 0) return nestedOptions
  }

  const values = Array.isArray(schema.enum) ? schema.enum.filter((entry): entry is string => typeof entry === 'string') : []
  const names = Array.isArray(schema.enumNames) ? schema.enumNames.filter((entry): entry is string => typeof entry === 'string') : []
  return values.map((value, index) => ({ value, label: names[index] || value }))
}

function readMcpElicitationInputType(schema: Record<string, unknown>): string {
  const format = typeof schema.format === 'string' ? schema.format.trim() : ''
  if (format === 'email') return 'email'
  if (format === 'uri') return 'url'
  if (format === 'date') return 'date'
  if (format === 'date-time') return 'datetime-local'
  return 'text'
}

function readMcpElicitationFieldValue(requestId: number, field: McpElicitationField): string | number | boolean | string[] {
  const saved = mcpElicitationAnswers.value[mcpElicitationAnswerKey(requestId, field.key)]
  return saved === undefined ? field.defaultValue : saved
}

function readMcpElicitationMultiValue(requestId: number, field: McpElicitationField): string[] {
  const value = readMcpElicitationFieldValue(requestId, field)
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => ({
          label: typeof option?.label === 'string' ? option.label : '',
          description: typeof option?.description === 'string' ? option.description : '',
        }))
        .filter((option) => option.label.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isSecret: question.isSecret === true,
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function onQuestionAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function readQuestionOptionDescription(requestId: number, question: ParsedToolQuestion): string {
  const selected = readQuestionAnswer(requestId, question.id, question.options[0]?.label || '')
  const match = question.options.find((option) => option.label === selected)
  return match?.description ?? ''
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  const key = toolQuestionKey(requestId, questionId)
  return toolQuestionOtherAnswers.value[key] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function onMcpElicitationFieldInput(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: target.value,
  }
}

function onMcpElicitationBooleanToggle(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: target.checked,
  }
}

function onMcpElicitationMultiToggle(
  requestId: number,
  field: McpElicitationField,
  optionValue: string,
  event: Event,
): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const next = new Set(readMcpElicitationMultiValue(requestId, field))
  if (target.checked) next.add(optionValue)
  else next.delete(optionValue)
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: Array.from(next),
  }
}

function onRespondApproval(requestId: number, decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel'): void {
  emit('respondServerRequest', {
    id: requestId,
    result: { decision },
  })
}

function onRespondPermissionsApproval(request: UiServerRequest, scope: 'turn' | 'session'): void {
  const params = asRecord(request.params)
  const permissions = asRecord(params?.permissions) ?? {}
  emit('respondServerRequest', {
    id: request.id,
    result: {
      permissions,
      scope,
    },
  })
}

function buildMcpElicitationContent(request: UiServerRequest): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  for (const field of readMcpElicitationFields(request)) {
    const value = readMcpElicitationFieldValue(request.id, field)
    if (field.kind === 'multiEnum') {
      const arrayValue = Array.isArray(value) ? value : []
      if (arrayValue.length > 0 || field.required) content[field.key] = arrayValue
      continue
    }
    if (field.kind === 'boolean') {
      content[field.key] = Boolean(value)
      continue
    }
    if (field.kind === 'number') {
      const numberValue = typeof value === 'number' ? value : Number(String(value).trim())
      if (!Number.isNaN(numberValue)) content[field.key] = numberValue
      continue
    }
    const textValue = String(value ?? '').trim()
    if (textValue.length > 0 || field.required) content[field.key] = textValue
  }
  return content
}

function onRespondMcpElicitation(request: UiServerRequest, action: 'accept' | 'decline' | 'cancel'): void {
  const params = asRecord(request.params)
  const result: Record<string, unknown> = { action }
  if (action === 'accept' && typeof params?.mode === 'string' && params.mode === 'form') {
    result.content = buildMcpElicitationContent(request)
  }
  emit('respondServerRequest', {
    id: request.id,
    result,
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0]?.label || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from codex-web-local UI.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectUnknownRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from codex-web-local UI.',
    },
  })
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function applyConversationScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  if (autoFollowOutput.value) {
    enforceBottomState()
    return
  }
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
}

function shouldLockToBottom(): boolean {
  return autoFollowOutput.value
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = Math.max(frames, 1)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function jumpToLatest(): void {
  autoFollowOutput.value = true
  enforceBottomState()
  scheduleBottomLock(4)
}

async function loadMoreAbove(): Promise<void> {
  const container = conversationListRef.value
  if (!container || !hasMoreAbove.value || isLoadingMore.value || props.isLoadingPersistedAbove === true) return

  isLoadingMore.value = true
  const threadIdAtStart = props.activeThreadId

  const prevScrollHeight = container.scrollHeight
  const prevScrollTop = container.scrollTop

  try {
    if (renderWindowStart.value > 0) {
      renderWindowStart.value = Math.max(0, renderWindowStart.value - LOAD_MORE_CHUNK)
    } else if (props.hasMorePersistedAbove === true) {
      await props.loadEarlierMessages?.(threadIdAtStart)
    }

    await nextTick()

    // Discard scroll restoration if the thread changed while we were awaiting.
    if (props.activeThreadId === threadIdAtStart) {
      container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
    }
  } finally {
    isLoadingMore.value = false
  }
}

defineExpose({
  jumpToLatest,
})

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleConversationScroll(): Promise<void> {
  if (conversationScrollPromise) return conversationScrollPromise

  conversationScrollPromise = nextTick().then(() => new Promise<void>((resolve) => {
    if (conversationScrollFrame) {
      cancelAnimationFrame(conversationScrollFrame)
    }
    conversationScrollFrame = requestAnimationFrame(() => {
      conversationScrollFrame = 0
      conversationScrollPromise = null
      applyConversationScrollState()
      bindPendingImageHandlers()
      scheduleBottomLock()
      resolve()
    })
  }))

  return conversationScrollPromise
}

function clearRenderCaches(): void {
  messageBlockCache.clear()
  inlineSegmentCache.clear()
  markdownHtmlCache.clear()
  highlightHtmlCache.clear()
}

watch(
  () => props.messages,
  async (next) => {
    if (props.isLoading) return

    const commandIds = new Set(
      next
        .filter((message) => message.messageType === 'commandExecution' && message.commandExecution)
        .map((message) => message.id),
    )
    expandedCommandIds.value = pruneCommandIdSet(expandedCommandIds.value, commandIds)
    collapsedAutoCommandIds.value = pruneCommandIdSet(collapsedAutoCommandIds.value, commandIds)
    expandedCommandGroupIds.value = pruneCommandIdSet(
      expandedCommandGroupIds.value,
      new Set(Object.keys(groupedCommandsByLatestId.value)),
    )
    expandedFileChangeSummaryIds.value = pruneCommandIdSet(
      expandedFileChangeSummaryIds.value,
      new Set([
        ...Object.keys(anchoredFileChangeSummaryByAnchorId.value),
        ...Object.keys(standaloneFileChangeSummaryByMessageId.value),
      ]),
    )

    // Keep renderWindowStart in bounds whenever the message list changes length.
    // Following output: always pin the window to the last RENDER_WINDOW_SIZE messages so
    //   the rendered count stays bounded (handles both growth and shrink/rollback).
    // Scrolled up: only clamp downward so renderWindowStart never exceeds the list length
    //   (prevents visibleMessages from becoming empty after a rollback).
    if (autoFollowOutput.value) {
      renderWindowStart.value = Math.max(0, next.length - RENDER_WINDOW_SIZE)
    } else {
      renderWindowStart.value = Math.min(renderWindowStart.value, Math.max(0, next.length - 1))
    }

    await scheduleConversationScroll()
  },
)

watch(
  () => props.messages.some((message) => message.text.includes('```')),
  (hasCodeBlocks) => {
    if (!hasCodeBlocks || highlightJsModule.value) return
    void ensureHighlightJsLoaded()
  },
  { immediate: true },
)

watch(
  activeCommandMessageId,
  (nextId, prevId) => {
    if (!prevId || prevId === nextId) return
    if (!collapsedAutoCommandIds.value.has(prevId)) return
    const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
    nextCollapsedAuto.delete(prevId)
    collapsedAutoCommandIds.value = nextCollapsedAuto
  },
)

watch(
  () => props.pendingRequests,
  async () => {
    if (props.isLoading) return
    await scheduleConversationScroll()
  },
  { deep: true },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    if (!autoFollowOutput.value) return
    await nextTick()
    enforceBottomState()
    scheduleBottomLock(8)
  },
  { deep: true },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    renderWindowStart.value = Math.max(0, props.messages.length - RENDER_WINDOW_SIZE)
    await scheduleConversationScroll()
  },
)

watch(
  () => props.activeThreadId,
  async () => {
    autoFollowOutput.value = true
    modalImageUrl.value = ''
    isLoadingMore.value = false
    // Apply immediately for cached threads where isLoading never toggles.
    renderWindowStart.value = Math.max(0, props.messages.length - RENDER_WINDOW_SIZE)
    await scheduleConversationScroll()
  },
  { flush: 'post' },
)

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  autoFollowOutput.value = isAtBottom(container)
  if (hasMoreAbove.value && !isLoadingMore.value && container.scrollTop < LOAD_MORE_SCROLL_THRESHOLD_PX) {
    void loadMoreAbove()
  }
}

const failedMarkdownImages = ref(new Set<string>())

function markdownImageKey(messageId: string, blockIndex: number): string {
  return `${messageId}:${blockIndex}`
}

function isMarkdownImageFailed(messageId: string, blockIndex: number): boolean {
  return failedMarkdownImages.value.has(markdownImageKey(messageId, blockIndex))
}

function onMarkdownImageError(messageId: string, blockIndex: number): void {
  const next = new Set(failedMarkdownImages.value)
  next.add(markdownImageKey(messageId, blockIndex))
  failedMarkdownImages.value = next
  markdownImageFailureVersion.value += 1
}

function openImageModal(imageUrl: string): void {
  modalImageUrl.value = imageUrl
}

function closeImageModal(): void {
  modalImageUrl.value = ''
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu)
  window.addEventListener('blur', onWindowBlurForFileLinkContextMenu)
  window.addEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
})

onBeforeUnmount(() => {
  clearRenderCaches()
  if (conversationScrollFrame) {
    cancelAnimationFrame(conversationScrollFrame)
    conversationScrollFrame = 0
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
    copiedMessageResetTimer = null
  }
  window.removeEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu)
  window.removeEventListener('blur', onWindowBlurForFileLinkContextMenu)
  window.removeEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
})
</script>

<style scoped src="./ThreadConversation.scoped.css"></style>
