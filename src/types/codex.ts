export type RpcEnvelope<T> = {
  result: T
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type SpeedMode = 'standard' | 'fast'
export type CollaborationModeKind = 'default' | 'plan'

export type RpcMethodCatalog = {
  data: string[]
}

export type ThreadListResult = {
  data: ThreadSummary[]
  nextCursor?: string | null
}

export type ThreadSummary = {
  id: string
  preview: string
  title?: string
  name?: string
  cwd: string
  updatedAt: number
  createdAt: number
  source?: unknown
}

export type ThreadReadResult = {
  thread: ThreadDetail
}

export type ThreadDetail = {
  id: string
  cwd: string
  preview: string
  turns: ThreadTurn[]
  updatedAt: number
  createdAt: number
}

export type ThreadTurn = {
  id: string
  status: string
  items: ThreadItem[]
}

export type ThreadItem = {
  id: string
  type: string
  text?: string
  content?: unknown
  summary?: string[]
}

export type UserInput = {
  type: string
  text?: string
  path?: string
  url?: string
}

export type UiThread = {
  id: string
  title: string
  projectName: string
  cwd: string
  hasWorktree: boolean
  createdAtIso: string
  updatedAtIso: string
  preview: string
  unread: boolean
  inProgress: boolean
  pendingRequestState?: UiPendingRequestState | null
}

export type UiPendingRequestState = 'approval' | 'response'

export type UiThreadAutomationStatus = 'ACTIVE' | 'PAUSED'

export type UiThreadAutomation = {
  id: string
  kind: 'heartbeat' | 'cron'
  name: string
  prompt: string
  rrule: string
  status: UiThreadAutomationStatus
  targetThreadId: string | null
  cwds: string[]
  createdAtMs: number | null
  updatedAtMs: number | null
  nextRunAtMs: number | null
}

export type CommandExecutionData = {
  command: string
  cwd: string | null
  status: 'inProgress' | 'completed' | 'failed' | 'declined' | 'interrupted'
  aggregatedOutput: string
  exitCode: number | null
}

export type UiFileAttachment = { label: string; path: string }
export type UiFileChangeOperation = 'add' | 'delete' | 'update'
export type UiFileChangeStatus = 'inProgress' | 'completed' | 'failed' | 'declined'
export type UiFileChange = {
  path: string
  operation: UiFileChangeOperation
  movedToPath?: string | null
  diff: string
  addedLineCount: number
  removedLineCount: number
}

export type UiReviewScope = 'workspace' | 'baseBranch' | 'commit'
export type UiReviewWorkspaceView = 'unstaged' | 'staged'
export type UiReviewAction = 'stage' | 'unstage' | 'revert'
export type UiReviewActionLevel = 'all' | 'file' | 'hunk'
export type UiReviewFileOperation = 'add' | 'delete' | 'update' | 'rename'

export type UiReviewLine = {
  key: string
  kind: 'meta' | 'hunk' | 'add' | 'remove' | 'context'
  text: string
  oldLine: number | null
  newLine: number | null
}

export type UiReviewHunk = {
  id: string
  header: string
  patch: string
  addedLineCount: number
  removedLineCount: number
  oldStart: number | null
  oldLineCount: number
  newStart: number | null
  newLineCount: number
  lines: UiReviewLine[]
}

export type UiReviewFile = {
  id: string
  path: string
  absolutePath: string
  previousPath: string | null
  previousAbsolutePath: string | null
  operation: UiReviewFileOperation
  addedLineCount: number
  removedLineCount: number
  diff: string
  hunks: UiReviewHunk[]
}

export type UiReviewSnapshot = {
  cwd: string
  gitRoot: string | null
  isGitRepo: boolean
  scope: UiReviewScope
  workspaceView: UiReviewWorkspaceView
  baseBranch: string | null
  baseBranchOptions: string[]
  commitSha: string | null
  headBranch: string | null
  mergeBaseSha: string | null
  generatedAtIso: string
  summary: {
    fileCount: number
    addedLineCount: number
    removedLineCount: number
  }
  files: UiReviewFile[]
}

export type UiReviewSummary = UiReviewSnapshot['summary']

export type UiReviewFinding = {
  id: string
  title: string
  body: string
  path: string | null
  absolutePath: string | null
  startLine: number | null
  endLine: number | null
  rawText: string
}

export type UiReviewResult = {
  reviewText: string
  summary: string
  findings: UiReviewFinding[]
}

export type UiPlanStepStatus = 'pending' | 'inProgress' | 'completed'

export type UiPlanStep = {
  step: string
  status: UiPlanStepStatus
}

export type UiPlanData = {
  explanation?: string
  steps: UiPlanStep[]
  isStreaming?: boolean
}

export type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  images?: string[]
  skills?: Array<{ name: string; path: string }>
  fileAttachments?: UiFileAttachment[]
  fileChanges?: UiFileChange[]
  fileChangeStatus?: UiFileChangeStatus
  messageType?: string
  rawPayload?: string
  isUnhandled?: boolean
  commandExecution?: CommandExecutionData
  plan?: UiPlanData
  turnId?: string
  turnIndex?: number
  isAutomationRun?: boolean
  automationDisplayName?: string | null
}

export type UiServerRequest = {
  id: number
  method: string
  threadId: string
  turnId: string
  itemId: string
  receivedAtIso: string
  params: unknown
}

export type UiServerRequestReply = {
  id: number
  result?: unknown
  followUpMessageText?: string
  error?: {
    code?: number
    message: string
  }
}

export type UiLiveOverlay = {
  activityLabel: string
  activityDetails: string[]
  reasoningText: string
  errorText: string
}

export type UiCreditsSnapshot = {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

export type UiRateLimitWindow = {
  usedPercent: number
  windowDurationMins: number | null
  windowMinutes: number | null
  resetsAt: number | null
}

export type UiRateLimitSnapshot = {
  limitId: string | null
  limitName: string | null
  primary: UiRateLimitWindow | null
  secondary: UiRateLimitWindow | null
  credits: UiCreditsSnapshot | null
  planType: string | null
}

export type UiTokenUsageBreakdown = {
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
}

export type UiThreadTokenUsage = {
  total: UiTokenUsageBreakdown
  last: UiTokenUsageBreakdown
  modelContextWindow: number | null
  currentContextTokens: number
  remainingContextTokens: number | null
  remainingContextPercent: number | null
}

export type UiProjectGroup = {
  projectName: string
  threads: UiThread[]
}

export type UiAccountQuotaStatus = 'idle' | 'loading' | 'ready' | 'error'
export type UiAccountUnavailableReason = 'payment_required'

export type UiAccountEntry = {
  accountId: string
  storageId: string
  userId: string | null
  authMode: string | null
  email: string | null
  planType: string | null
  lastRefreshedAtIso: string
  lastActivatedAtIso: string | null
  quotaSnapshot: UiRateLimitSnapshot | null
  quotaUpdatedAtIso: string | null
  quotaStatus: UiAccountQuotaStatus
  quotaError: string | null
  unavailableReason: UiAccountUnavailableReason | null
  isActive: boolean
}

export type ChatMessage = {
  id: string
  role: string
  text: string
  createdAt: string | null
}

export type ChatThread = {
  id: string
  title: string
  projectName: string
  updatedAt: string | null
  messages: ChatMessage[]
}

export type CollaborationModeOption = {
  value: CollaborationModeKind
  label: string
}
