<template src="./App.template.html"></template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopLayout from './components/layout/DesktopLayout.vue'
import SidebarThreadTree from './components/sidebar/SidebarThreadTree.vue'
import ContentHeader from './components/content/ContentHeader.vue'
import ThreadComposer from './components/content/ThreadComposer.vue'
import ThreadPendingRequestPanel from './components/content/ThreadPendingRequestPanel.vue'
import QueuedMessages from './components/content/QueuedMessages.vue'
import RateLimitStatus from './components/content/RateLimitStatus.vue'
import ComposerDropdown from './components/content/ComposerDropdown.vue'
import HeaderGitBranchDropdown from './components/content/HeaderGitBranchDropdown.vue'
import ComposerRuntimeDropdown from './components/content/ComposerRuntimeDropdown.vue'
import SidebarThreadControls from './components/sidebar/SidebarThreadControls.vue'
import IconTablerBolt from './components/icons/IconTablerBolt.vue'
import IconTablerSearch from './components/icons/IconTablerSearch.vue'
import IconTablerSettings from './components/icons/IconTablerSettings.vue'
import IconTablerTerminal from './components/icons/IconTablerTerminal.vue'
import IconTablerX from './components/icons/IconTablerX.vue'
import { useDesktopState } from './composables/useDesktopState'
import { useMobile } from './composables/useMobile'
import { useUiLanguage } from './composables/useUiLanguage'
import {
  checkoutGitBranch,
  cloneGithubRepository,
  configureTelegramBot,
  createPermanentWorktree,
  createWorktree,
  createProjectlessThreadDirectory,
  getGitBranchState,
  getGitBranchCommits,
  getGitRepositoryStatus,
  getWorktreeBranchOptions,
  getAccounts,
  completeCodexLogin,
  createLocalDirectory,
  getFirstLaunchPluginsCardPreference,
  getHomeDirectory,
  getTelegramConfig,
  getProjectRootSuggestion,
  getTelegramStatus,
  getThreadTerminalQuickCommands,
  getThreadTerminalStatus,
  getWorkspaceRootsState,
  listLocalDirectories,
  openProjectRoot,
  persistFirstLaunchPluginsCardPreference,
  removeAccount,
  refreshAccountsFromAuth,
  resetGitBranchToCommit,
  startCodexLogin,
  searchThreads,
  switchAccount,
} from './api/codexGateway'
import type { ReasoningEffort, SpeedMode, UiAccountEntry, UiRateLimitWindow, UiServerRequest, UiServerRequestReply, UiThreadAutomation, UiThreadTokenUsage } from './types/codex'
import type { ComposerDraftPayload, ThreadComposerExposed } from './components/content/ThreadComposer.vue'
import type { GitCommitOption, LocalDirectoryEntry, TelegramStatus, ThreadTerminalQuickCommand, WorktreeBranchOption } from './api/codexGateway'
import { getFreeModeStatus, setFreeMode, setFreeModeCustomKey, setCustomProvider } from './api/codexGateway'
import { buildExportFileName, buildThreadMarkdown } from './appExportMarkdown'
import { applyDarkMode, buildDictationLanguageOptions, buildTerminalHeaderQuickCommands, CHAT_WIDTH_PRESETS, loadBoolPref, loadChatWidthPref, loadDarkModePref, loadDictationLanguagePref, loadInProgressSendModePref, loadTerminalStoredQuickCommands, normalizeTerminalQuickCommandValue, normalizeToWhisperLanguage, saveTerminalStoredQuickCommands, type ChatWidthMode, type DirectoryTryItemPayload, type TerminalHeaderQuickCommand, type ThreadTerminalPanelExposed } from './appSettingsSupport'
import { getPathLeafName, getPathParent, isProjectlessChatPath, normalizePathForUi } from './pathUtils.js'

const ThreadConversation = defineAsyncComponent(() => import('./components/content/ThreadConversation.vue'))
const ThreadTerminalPanel = defineAsyncComponent(() => import('./components/content/ThreadTerminalPanel.vue'))
const ReviewPane = defineAsyncComponent(() => import('./components/content/ReviewPane.vue'))
const DirectoryHub = defineAsyncComponent(() => import('./components/content/DirectoryHub.vue'))
const AutomationsPanel = defineAsyncComponent(() => import('./components/content/AutomationsPanel.vue'))
const { t, uiLanguage, uiLanguageOptions, setUiLanguage } = useUiLanguage()

function readSelectValue(event: Event): string {
  return event.target instanceof HTMLSelectElement ? event.target.value : ''
}

function onUiLanguageSelectChange(event: Event): void {
  const value = readSelectValue(event)
  if (value === 'en' || value === 'zh-CN') setUiLanguage(value)
}

function onProviderSelectChange(event: Event): void {
  void onProviderChange(readSelectValue(event))
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'codex-web-local.sidebar-collapsed.v1'
const ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY = 'codex-web-local.accounts-section-collapsed.v1'
const TOGGLE_TERMINAL_COMMAND_VALUE = '__toggle_terminal__'
const worktreeName = import.meta.env.VITE_WORKTREE_NAME ?? 'unknown'
const appVersion = import.meta.env.VITE_APP_VERSION ?? 'unknown'
const SETTINGS_HELP = {
  sendWithEnter: t('When enabled, press Enter to send. When disabled, use Command+Enter to send.'),
  inProgressSendMode: t('If a turn is still running, choose whether a new prompt should steer the current turn or be queued.'),
  appearance: t('Switch between system theme, light mode, and dark mode.'),
  chatWidth: t('Choose how wide the conversation column and composer can grow on desktop screens.'),
  dictationClickToToggle: t('Use click-to-start and click-to-stop dictation instead of hold-to-talk.'),
  dictationAutoSend: t('Automatically send transcribed dictation when recording stops.'),
  dictationLanguage: t('Choose transcription language or keep auto-detect.'),
} as const


const {
  projectGroups,
  projectDisplayNameById,
  selectedThread,
  selectedThreadTokenUsage,
  selectedThreadTerminalOpen,
  selectedThreadServerRequests,
  selectedLiveOverlay,
  codexQuota,
  selectedThreadId,
  availableCollaborationModes,
  availableModelIds,
  selectedCollaborationMode,
  selectedModelId,
  selectedReasoningEffort,
  selectedSpeedMode,
  installedSkills,
  accountRateLimitSnapshots,
  messages,
  hasMoreOlderMessages,
  isLoadingThreads,
  isThreadListFullyLoaded,
  isLoadingMessages,
  isLoadingOlderMessages,
  isSendingMessage,
  isInterruptingTurn,
  isSelectedThreadInterruptPending,
  isUpdatingSpeedMode,
  refreshAll,
  refreshSkills,
  selectThread,
  ensureThreadMessagesLoaded,
  loadOlderMessages,
  setThreadTerminalOpen,
  toggleSelectedThreadTerminal,
  archiveThreadById,
  forkThreadById,
  renameThreadById,
  forkThreadFromTurn,
  sendMessageToSelectedThread,
  sendMessageToNewThread,
  interruptSelectedThreadTurn,
  selectedThreadQueuedMessages,
  removeQueuedMessage,
  reorderQueuedMessage,
  steerQueuedMessage,
  setSelectedCollaborationMode,
  readModelIdForThread,
  setSelectedModelIdForThread,

  setSelectedReasoningEffort,
  updateSelectedSpeedMode,
  respondToPendingServerRequest,
  renameProject,
  removeProject,
  reorderProject,
  pinProjectToTop,
  startPolling,
  stopPolling,
  primeSelectedThread,
  rollbackSelectedThread,
} = useDesktopState()

const route = useRoute()
const router = useRouter()
const { isMobile } = useMobile()
type SidebarThreadTreeExposed = {
  openAutomationEditorFromPanel: (payload: AutomationEditRequest) => void
  openAutomationCreatorFromPanel: () => void
}
type AutomationsPanelExposed = {
  loadAutomations: () => Promise<void>
}
type AutomationEditRequest = {
  scope: 'thread' | 'project'
  target: string
  automation: UiThreadAutomation
}
const sidebarThreadTreeRef = ref<SidebarThreadTreeExposed | null>(null)
const automationsPanelRef = ref<AutomationsPanelExposed | null>(null)
const homeThreadComposerRef = ref<ThreadComposerExposed | null>(null)
const threadComposerRef = ref<ThreadComposerExposed | null>(null)
const threadConversationRef = ref<{ jumpToLatest: () => void } | null>(null)
const homeTerminalPanelRef = ref<ThreadTerminalPanelExposed | null>(null)
const threadTerminalPanelRef = ref<ThreadTerminalPanelExposed | null>(null)
const homeTerminalOpen = ref(false)
const isTerminalInputFocused = ref(false)
const isTerminalKeyboardFocusFallbackActive = ref(false)
const isThreadTerminalAvailable = ref(true)
const terminalProjectQuickCommands = ref<ThreadTerminalQuickCommand[]>([])
const terminalStoredQuickCommands = ref<TerminalHeaderQuickCommand[]>(loadTerminalStoredQuickCommands())
const terminalHeaderDropdownValue = ref('')
const editingQueuedMessageState = ref<{ threadId: string; queueIndex: number } | null>(null)
const isRouteSyncInProgress = ref(false)
const directoryTryInFlightKey = ref('')
let hasPendingRouteSync = false
const hasInitialized = ref(false)
const newThreadCwd = ref('')
const newThreadRuntime = ref<'local' | 'worktree'>('local')
const gitRepoStatusByCwd = ref<Record<string, boolean>>({})
const gitRepoStatusRequestByCwd = new Map<string, Promise<boolean>>()
const newWorktreeBaseBranch = ref('')
const worktreeBranchOptions = ref<WorktreeBranchOption[]>([])
const isLoadingWorktreeBranches = ref(false)
const workspaceRootOptionsState = ref<{ order: string[]; labels: Record<string, string>; projectOrder: string[] }>({
  order: [],
  labels: {},
  projectOrder: [],
})
const worktreeInitStatus = ref<{ phase: 'idle' | 'running' | 'error'; title: string; message: string }>({
  phase: 'idle',
  title: '',
  message: '',
})
const isSidebarCollapsed = ref(loadSidebarCollapsed())
const sidebarSearchQuery = ref('')
const isSidebarSearchVisible = ref(false)
const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)
const settingsAreaRef = ref<HTMLElement | null>(null)
const settingsPanelRef = ref<HTMLElement | null>(null)
const settingsButtonRef = ref<HTMLElement | null>(null)
const serverMatchedThreadIds = ref<string[] | null>(null)
let threadSearchTimer: ReturnType<typeof setTimeout> | null = null
let terminalKeyboardFocusFallbackTimer: ReturnType<typeof setTimeout> | null = null
let threadBranchesRequestId = 0
let threadBranchCommitsRequestId = 0
const defaultNewProjectName = ref('New Project (1)')
const homeDirectory = ref('')
const isSettingsOpen = ref(false)
const isAccountsSectionCollapsed = ref(loadAccountsSectionCollapsed())
const isReviewPaneOpen = ref(false)
const threadBranchOptions = ref<WorktreeBranchOption[]>([])
const currentThreadBranch = ref<string | null>(null)
const currentThreadHeadSha = ref<string | null>(null)
const currentThreadHeadSubject = ref<string | null>(null)
const currentThreadHeadDate = ref<string | null>(null)
const isThreadDetachedHead = ref(false)
const isThreadWorktreeDirty = ref(false)
const threadBranchError = ref('')
const threadBranchCommitsByBranch = ref<Record<string, GitCommitOption[]>>({})
const threadBranchCommitsLoadingFor = ref('')
const threadBranchCommitsError = ref('')
const isLoadingThreadBranches = ref(false)
const isSwitchingThreadBranch = ref(false)
const createFolderInputRef = ref<HTMLInputElement | null>(null)
const accounts = ref<UiAccountEntry[]>([])
const isRefreshingAccounts = ref(false)
const isSwitchingAccounts = ref(false)
const isStartingCodexLogin = ref(false)
const isCompletingCodexLogin = ref(false)
const isCodexLoginModalOpen = ref(false)
const codexLoginUrl = ref('')
const codexLoginCallbackUrl = ref('')
const codexLoginCallbackInputRef = ref<HTMLInputElement | null>(null)
const removingAccountId = ref('')
const confirmingRemoveAccountId = ref('')
const hoveredAccountId = ref('')
const accountActionError = ref('')
const SEND_WITH_ENTER_KEY = 'codex-web-local.send-with-enter.v1'
const IN_PROGRESS_SEND_MODE_KEY = 'codex-web-local.in-progress-send-mode.v1'
const DARK_MODE_KEY = 'codex-web-local.dark-mode.v1'
const DICTATION_CLICK_TO_TOGGLE_KEY = 'codex-web-local.dictation-click-to-toggle.v1'
const DICTATION_AUTO_SEND_KEY = 'codex-web-local.dictation-auto-send.v1'
const DICTATION_LANGUAGE_KEY = 'codex-web-local.dictation-language.v1'

const CHAT_WIDTH_KEY = 'codex-web-local.chat-width.v1'
const MOBILE_RESUME_RELOAD_MIN_HIDDEN_MS = 400
const sendWithEnter = ref(loadBoolPref(SEND_WITH_ENTER_KEY, true))
const inProgressSendMode = ref<'steer' | 'queue'>(loadInProgressSendModePref())
const darkMode = ref<'system' | 'light' | 'dark'>(loadDarkModePref())
const chatWidth = ref<ChatWidthMode>(loadChatWidthPref())
const dictationClickToToggle = ref(loadBoolPref(DICTATION_CLICK_TO_TOGGLE_KEY, false))
const dictationAutoSend = ref(loadBoolPref(DICTATION_AUTO_SEND_KEY, true))
const dictationLanguage = ref(loadDictationLanguagePref())
const dictationLanguageOptions = computed(() => buildDictationLanguageOptions(t, dictationLanguage.value, typeof navigator !== 'undefined' ? (navigator.languages ?? []) : []))
const showFirstLaunchPluginsCard = ref(false)
const freeModeEnabled = ref(false)
const freeModeLoading = ref(false)
const freeModeCustomKey = ref('')
const freeModeHasCustomKey = ref(false)
const freeModeCustomKeyMasked = ref<string | null>(null)
const freeModeCustomKeySaving = ref(false)
const providerError = ref('')
const selectedProvider = ref<'codex' | 'openrouter' | 'opencode-zen' | 'custom'>('codex')
const customEndpointUrl = ref('')
const customEndpointKey = ref('')
const customEndpointWireApi = ref<'responses' | 'chat'>('responses')
const openRouterWireApi = ref<'responses' | 'chat'>('responses')
const opencodeZenKey = ref('')
const isTelegramConfigOpen = ref(false)
const telegramBotTokenDraft = ref('')
const telegramAllowedUserIdsDraft = ref('')
const telegramConfigError = ref('')
const isTelegramSaving = ref(false)
const isCreateFolderOpen = ref(false)
const createFolderDraft = ref('')
const createFolderError = ref('')
const isCreatingFolder = ref(false)
const isProjectSetupModalOpen = ref(false)
const projectSetupMode = ref<'create' | 'clone'>('create')
const projectSetupBaseDir = ref('')
const projectNameDraft = ref('')
const githubCloneUrlDraft = ref('')
const projectSetupError = ref('')
const isProjectSetupSubmitting = ref(false)
const projectSetupPrimaryInputRef = ref<HTMLInputElement | null>(null)
const isExistingFolderPickerOpen = ref(false)
const existingFolderPathInputRef = ref<HTMLInputElement | null>(null)
const existingFolderFilterInputRef = ref<HTMLInputElement | null>(null)
const existingFolderPathDraft = ref('')
const existingFolderBrowsePath = ref('')
const existingFolderParentPath = ref('')
const existingFolderEntries = ref<LocalDirectoryEntry[]>([])
const existingFolderError = ref('')
const isExistingFolderLoading = ref(false)
const isOpeningExistingFolder = ref(false)
const showHiddenFolders = ref(false)
const existingFolderFilter = ref('')
const telegramStatus = ref<TelegramStatus>({
  configured: false,
  active: false,
  mappedChats: 0,
  mappedThreads: 0,
  allowedUsers: 0,
  allowAllUsers: false,
  lastError: '',
})
const mobileHiddenAtMs = ref<number | null>(null)
const mobileResumeReloadTriggered = ref(false)
const mobileResumeSyncInProgress = ref(false)
const visualViewportHeight = ref(typeof window !== 'undefined' ? window.visualViewport?.height ?? window.innerHeight : 0)
const visualViewportOffsetTop = ref(typeof window !== 'undefined' ? window.visualViewport?.offsetTop ?? 0 : 0)
const layoutViewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
let accountStatePollTimer: number | null = null
let isAccountStatePollInFlight = false
let existingFolderBrowseRequestId = 0

const routeThreadId = computed(() => {
  const rawThreadId = route.params.threadId
  return typeof rawThreadId === 'string' ? rawThreadId : ''
})

const isHomeRoute = computed(() => route.name === 'home')
const isSkillsRoute = computed(() => route.name === 'skills')
const isAutomationsRoute = computed(() => route.name === 'automations')
const routeAutomationId = computed(() => {
  const raw = route.query.automationId
  return typeof raw === 'string' ? raw : ''
})
const contentTitle = computed(() => {
  if (isAutomationsRoute.value) return t('Automations')
  if (isSkillsRoute.value) return t('Skills')
  if (isHomeRoute.value) return t('Start new thread')
  return selectedThread.value?.title ?? t('Choose a thread')
})
const browserHostName =
  typeof window !== 'undefined'
    ? (window.location.hostname || window.location.host || 'codexui')
    : 'codexui'
const pageTitle = computed(() => {
  const threadTitle = selectedThread.value?.title?.trim() ?? ''
  return threadTitle || browserHostName
})
const filteredMessages = computed(() =>
  messages.value.filter((message) => {
    const type = normalizeMessageType(message.messageType, message.role)
    if (type === 'worked') return true
    if (type === 'turnActivity.live' || type === 'turnError.live' || type === 'agentReasoning.live') return false
    return true
  }),
)
const latestUserTurnId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index]
    if (message.role !== 'user') continue
    const turnId = message.turnId?.trim() ?? ''
    if (turnId.length > 0) return turnId
  }
  return ''
})
const liveOverlay = computed(() => selectedLiveOverlay.value)
const composerThreadContextId = computed(() => (isHomeRoute.value ? '__new-thread__' : selectedThreadId.value))
const composerSelectedModelId = computed(() => readModelIdForThread(composerThreadContextId.value))
const selectedThreadPendingRequest = computed<UiServerRequest | null>(() => {
  const rows = selectedThreadServerRequests.value
  return rows.length > 0 ? rows[rows.length - 1] : null
})
const composerCwd = computed(() => {
  if (isHomeRoute.value) return newThreadCwd.value.trim()
  return selectedThread.value?.cwd?.trim() ?? ''
})
const canShowTerminalToggle = computed(() => (
  isThreadTerminalAvailable.value && (
    (isHomeRoute.value && composerCwd.value.length > 0) ||
    (route.name === 'thread' && selectedThreadId.value.length > 0)
  )
))
const canShowContentHeaderBranchDropdown = computed(() => (
  (route.name === 'thread' && selectedThreadId.value.length > 0) ||
  (isHomeRoute.value && isNewThreadCwdGitRepo.value)
))
const isComposerTerminalOpen = computed(() => (
  isHomeRoute.value ? homeTerminalOpen.value : selectedThreadTerminalOpen.value
))
const isVirtualKeyboardOpen = computed(() => {
  if (!isMobile.value) return false
  if (visualViewportHeight.value <= 0 || layoutViewportHeight.value <= 0) return false
  return layoutViewportHeight.value - visualViewportHeight.value > 120
})
const isTerminalKeyboardLayoutActive = computed(() => (
  isVirtualKeyboardOpen.value ||
  (isComposerTerminalOpen.value && isTerminalKeyboardFocusFallbackActive.value)
))
const directoryCwd = computed(() => selectedThread.value?.cwd?.trim() ?? newThreadCwd.value.trim())
const isSelectedThreadInProgress = computed(() => !isHomeRoute.value && selectedThread.value?.inProgress === true)
const showThreadContextBadge = computed(() => !isHomeRoute.value && !isSkillsRoute.value && !isAutomationsRoute.value && selectedThreadId.value.trim().length > 0)
const isAccountSwitchBlocked = computed(() =>
  isSendingMessage.value ||
  isInterruptingTurn.value ||
  isSelectedThreadInProgress.value ||
  selectedThreadServerRequests.value.length > 0,
)

function formatCompactTokenCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100000 ? 0 : 1,
  }).format(Math.max(0, Math.trunc(value)))
}

function buildThreadContextTooltip(usage: UiThreadTokenUsage | null): string {
  if (!usage) {
    return t('Waiting for Codex thread/tokenUsage/updated events for this thread.')
  }

  const lines = [
    `${t('Current context usage')}: ${usage.currentContextTokens.toLocaleString()} ${t('tokens')}`,
    `${t('Cumulative thread usage')}: ${usage.total.totalTokens.toLocaleString()} ${t('tokens')}`,
  ]

  if (typeof usage.modelContextWindow === 'number') {
    lines.unshift(`${t('Model context window')}: ${usage.modelContextWindow.toLocaleString()} ${t('tokens')}`)
    lines.push(`${t('Remaining context')}: ${(usage.remainingContextTokens ?? 0).toLocaleString()} ${t('tokens')}`)
  } else {
    lines.push(t('Model context window is unavailable in the latest usage event.'))
  }

  return lines.join('\n')
}

function dismissFirstLaunchPluginsCard(): void {
  if (!showFirstLaunchPluginsCard.value) return
  showFirstLaunchPluginsCard.value = false
  void persistFirstLaunchPluginsCardPreference(true)
}

function onOpenPluginsHomeCard(): void {
  dismissFirstLaunchPluginsCard()
  void router.push({ name: 'skills', query: { tab: 'plugins' } })
}

const threadContextBadgeState = computed(() => {
  const remainingPercent = selectedThreadTokenUsage.value?.remainingContextPercent
  if (remainingPercent === null || typeof remainingPercent !== 'number') return 'pending'
  if (remainingPercent <= 10) return 'danger'
  if (remainingPercent <= 25) return 'warning'
  return 'ok'
})

const threadContextPrimaryText = computed(() => {
  const usage = selectedThreadTokenUsage.value
  if (!usage) return t('Awaiting data')
  if (typeof usage.remainingContextTokens === 'number') {
    return `${formatCompactTokenCount(usage.remainingContextTokens)} ${t('left')}`
  }
  return `${formatCompactTokenCount(usage.currentContextTokens)} ${t('used')}`
})

const threadContextSecondaryText = computed(() => {
  const usage = selectedThreadTokenUsage.value
  if (!usage) return t('Updates after the next token usage event')
  if (typeof usage.modelContextWindow === 'number') {
    return `${formatCompactTokenCount(usage.currentContextTokens)} ${t('used')} / ${formatCompactTokenCount(usage.modelContextWindow)}`
  }
  return t('Window size unavailable')
})

const threadContextTooltip = computed(() => buildThreadContextTooltip(selectedThreadTokenUsage.value))

function hasDuplicateFolderLeaf(path: string, knownPaths: string[]): boolean {
  const normalizedPath = normalizePathForUi(path).trim()
  const leafName = getPathLeafName(normalizedPath)
  if (!normalizedPath || !leafName) return false
  return knownPaths.some((knownPath) => {
    const normalizedKnownPath = normalizePathForUi(knownPath).trim()
    return normalizedKnownPath !== normalizedPath && getPathLeafName(normalizedKnownPath) === leafName
  })
}

function getFolderOptionLabel(path: string, fallbackLabel = ''): string {
  const normalizedPath = normalizePathForUi(path).trim()
  const explicitLabel = fallbackLabel.trim()
  if (explicitLabel) return explicitLabel
  const leafName = getPathLeafName(normalizedPath)
  const knownPaths = [
    ...workspaceRootOptionsState.value.order,
    ...projectGroups.value.map((group) => group.threads[0]?.cwd?.trim() ?? '').filter(Boolean),
  ]
  return hasDuplicateFolderLeaf(normalizedPath, knownPaths) ? normalizedPath : leafName
}

function getOrderedWorkspaceRootOptions(): string[] {
  const savedRoots = new Set(workspaceRootOptionsState.value.order)
  const orderedRoots = workspaceRootOptionsState.value.projectOrder.filter((item) => savedRoots.has(item))
  for (const rootPath of workspaceRootOptionsState.value.order) {
    if (!orderedRoots.includes(rootPath)) orderedRoots.push(rootPath)
  }
  return orderedRoots
}

function getProjectOrderNameForPath(path: string): string {
  const normalizedPath = normalizePathForUi(path).trim()
  const knownPaths = [
    ...workspaceRootOptionsState.value.order,
    ...projectGroups.value.map((group) => group.threads[0]?.cwd?.trim() ?? '').filter(Boolean),
  ]
  return hasDuplicateFolderLeaf(normalizedPath, knownPaths) ? normalizedPath : getPathLeafName(normalizedPath)
}

function resolveWorkspaceRootCwd(projectName: string): string {
  const normalizedProjectName = normalizePathForUi(projectName).trim()
  if (!normalizedProjectName) return ''
  const knownPaths = [
    ...workspaceRootOptionsState.value.order,
    ...projectGroups.value.map((group) => group.threads[0]?.cwd?.trim() ?? '').filter(Boolean),
  ]
  for (const cwdRaw of workspaceRootOptionsState.value.order) {
    const cwd = normalizePathForUi(cwdRaw).trim()
    if (!cwd) continue
    const leafName = getPathLeafName(cwd)
    const orderName = hasDuplicateFolderLeaf(cwd, knownPaths) ? cwd : leafName
    if (cwd === normalizedProjectName || orderName === normalizedProjectName || leafName === normalizedProjectName) {
      return cwd
    }
  }
  return ''
}

const newThreadFolderOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = []
  const seenCwds = new Set<string>()

  for (const cwdRaw of getOrderedWorkspaceRootOptions()) {
    const cwd = cwdRaw.trim()
    if (!cwd || seenCwds.has(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: getFolderOptionLabel(cwd, workspaceRootOptionsState.value.labels[cwd]),
    })
  }

  for (const group of projectGroups.value) {
    const cwd = group.threads[0]?.cwd?.trim() ?? ''
    if (!cwd || seenCwds.has(cwd) || isProjectlessChatPath(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: getFolderOptionLabel(cwd, projectDisplayNameById.value[group.projectName]),
    })
  }

  const selectedCwd = newThreadCwd.value.trim()
  if (selectedCwd && !seenCwds.has(selectedCwd)) {
    options.unshift({
      value: selectedCwd,
      label: getFolderOptionLabel(selectedCwd),
    })
  }

  return options
})
const isNewThreadCwdGitRepo = computed(() => {
  const cwd = newThreadCwd.value.trim()
  return cwd ? gitRepoStatusByCwd.value[cwd] === true : false
})
const projectGitRepoByName = computed<Record<string, boolean>>(() => {
  const result: Record<string, boolean> = {}
  for (const group of projectGroups.value) {
    const cwd = resolvePreferredLocalCwd(group.projectName, group.threads[0]?.cwd?.trim() ?? '')
    result[group.projectName] = cwd ? gitRepoStatusByCwd.value[cwd] === true : false
  }
  return result
})
const newWorktreeBranchDropdownOptions = computed<Array<{ value: string; label: string }>>(() => {
  const selectedBranch = newWorktreeBaseBranch.value.trim()
  const options = [...worktreeBranchOptions.value]
  if (selectedBranch && !options.some((option) => option.value === selectedBranch)) {
    options.unshift({ value: selectedBranch, label: selectedBranch })
  }
  return options
})
const selectedWorktreeBranchLabel = computed(() => {
  const selectedBranch = newWorktreeBaseBranch.value.trim()
  if (!selectedBranch) return ''
  const selected = newWorktreeBranchDropdownOptions.value.find((option) => option.value === selectedBranch)
  return selected?.label ?? selectedBranch
})
const createFolderParentPath = computed(() => existingFolderBrowsePath.value.trim())
const isCreateFolderNameValid = computed(() => {
  const draft = createFolderDraft.value.trim()
  if (!draft) return false
  if (draft === '.' || draft === '..') return false
  return !/[\\/]/u.test(draft)
})
const canCreateFolder = computed(() => {
  return isCreateFolderNameValid.value && createFolderParentPath.value.trim().length > 0 && !existingFolderError.value
})
const isProjectNameDraftValid = computed(() => {
  const draft = projectNameDraft.value.trim()
  if (!draft) return false
  if (draft === '.' || draft === '..') return false
  return !/[\\/]/u.test(draft)
})
const canSubmitProjectSetup = computed(() => {
  const baseDir = projectSetupBaseDir.value.trim()
  if (!baseDir) return false
  if (projectSetupMode.value === 'create') return isProjectNameDraftValid.value
  return githubCloneUrlDraft.value.trim().length > 0
})
const resolvedExistingFolderPath = computed(() => {
  const draftedPath = normalizePathForUi(existingFolderPathDraft.value).trim()
  if (draftedPath) return draftedPath
  return existingFolderBrowsePath.value.trim()
})
const createFolderSubmitLabel = computed(() => {
  if (isCreatingFolder.value) return 'Creating…'
  return 'Create'
})
const projectSetupSubmitLabel = computed(() => {
  if (isProjectSetupSubmitting.value) {
    return projectSetupMode.value === 'clone' ? t('Cloning…') : t('Creating…')
  }
  return projectSetupMode.value === 'clone' ? t('Clone repository') : t('Create project')
})
const canBrowseExistingFolderParent = computed(() => {
  const current = existingFolderBrowsePath.value.trim()
  const parent = existingFolderParentPath.value.trim()
  return Boolean(current && parent && current !== parent)
})
const existingFolderDisplayEntries = computed(() => {
  const entries: Array<{ key: string; name: string; path: string; kind: 'parent' | 'directory' }> = []
  if (canBrowseExistingFolderParent.value) {
    entries.push({
      key: `parent:${existingFolderParentPath.value}`,
      name: '..',
      path: existingFolderParentPath.value,
      kind: 'parent',
    })
  }
  for (const entry of existingFolderEntries.value) {
    entries.push({
      key: `directory:${entry.path}`,
      name: entry.name,
      path: entry.path,
      kind: 'directory',
    })
  }
  return entries
})
const existingFolderFilteredEntries = computed(() => {
  const filter = existingFolderFilter.value.trim().toLowerCase()
  if (!filter) return existingFolderDisplayEntries.value
  return existingFolderDisplayEntries.value.filter((entry) =>
    entry.kind === 'parent' || entry.name.toLowerCase().includes(filter),
  )
})
const darkModeMediaQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const handleDarkModeMediaChange = (): void => applyDarkMode(darkMode.value)
const chatWidthLabel = computed(() => t(CHAT_WIDTH_PRESETS[chatWidth.value].label))
const terminalShortcutLabel = computed(() => {
  if (typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform)) {
    return '⌘J'
  }
  return 'Ctrl+J'
})
const terminalCommandPlaceholder = computed(() => (
  isComposerTerminalOpen.value ? t('Terminal') : t('Open terminal')
))
const terminalHeaderQuickCommands = computed<TerminalHeaderQuickCommand[]>(() => buildTerminalHeaderQuickCommands(terminalProjectQuickCommands.value, terminalStoredQuickCommands.value))
const terminalHeaderDropdownOptions = computed(() => [
  { label: isComposerTerminalOpen.value ? t('Hide terminal') : t('Open terminal'), value: TOGGLE_TERMINAL_COMMAND_VALUE },
  ...terminalHeaderQuickCommands.value.map((command) => ({ label: command.label, value: command.value })),
])
const contentStyle = computed(() => {
  const preset = CHAT_WIDTH_PRESETS[chatWidth.value]
  const keyboardInset = Math.max(
    0,
    layoutViewportHeight.value - visualViewportHeight.value - visualViewportOffsetTop.value,
  )
  return {
    '--chat-column-max': preset.columnMax,
    '--chat-card-max': preset.cardMax,
    '--visual-viewport-height': visualViewportHeight.value > 0 ? `${visualViewportHeight.value}px` : '100dvh',
    '--visual-viewport-offset-top': `${Math.max(0, visualViewportOffsetTop.value)}px`,
    '--virtual-keyboard-inset': `${keyboardInset}px`,
  }
})
const telegramStatusText = computed(() => {
  if (!telegramStatus.value.configured) return t('Not configured')
  const base = telegramStatus.value.active ? t('Online') : t('Configured (offline)')
  const allowlist = telegramStatus.value.allowAllUsers
    ? t('allow all users')
    : `${telegramStatus.value.allowedUsers} ${t('allowed user(s)')}`
  const mapped = `${telegramStatus.value.mappedChats} ${t('chat(s)')}, ${telegramStatus.value.mappedThreads} ${t('thread(s)')}, ${allowlist}`
  const error = telegramStatus.value.lastError ? `, ${t('error')}: ${telegramStatus.value.lastError}` : ''
  return `${base}, ${mapped}${error}`
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onWindowKeyDown)
  document.addEventListener('visibilitychange', onDocumentVisibilityChange)
  window.addEventListener('pageshow', onWindowPageShow)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('resize', updateVisualViewportState)
  window.visualViewport?.addEventListener('resize', updateVisualViewportState)
  window.visualViewport?.addEventListener('scroll', updateVisualViewportState)
  updateVisualViewportState()
  applyDarkMode(darkMode.value)
  darkModeMediaQuery?.addEventListener('change', handleDarkModeMediaChange)
  void initialize()
  void loadHomeDirectory()
  void loadFirstLaunchPluginsCardPreference()
  void loadWorkspaceRootOptionsState()
  void refreshDefaultProjectName()
  void refreshTelegramConfig()
  void refreshTelegramStatus()
  void loadFreeModeStatus()
  void refreshThreadTerminalStatus()
  void refreshTerminalQuickCommands()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onWindowKeyDown)
  document.removeEventListener('visibilitychange', onDocumentVisibilityChange)
  window.removeEventListener('pageshow', onWindowPageShow)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('resize', updateVisualViewportState)
  window.visualViewport?.removeEventListener('resize', updateVisualViewportState)
  window.visualViewport?.removeEventListener('scroll', updateVisualViewportState)
  darkModeMediaQuery?.removeEventListener('change', handleDarkModeMediaChange)
  if (accountStatePollTimer !== null) {
    window.clearInterval(accountStatePollTimer)
    accountStatePollTimer = null
  }
  if (threadSearchTimer) {
    clearTimeout(threadSearchTimer)
    threadSearchTimer = null
  }
  clearTerminalKeyboardFocusFallbackTimer()
  stopPolling()
})

function updateVisualViewportState(): void {
  if (typeof window === 'undefined') return
  layoutViewportHeight.value = Math.max(layoutViewportHeight.value, window.innerHeight)
  visualViewportHeight.value = window.visualViewport?.height ?? window.innerHeight
  visualViewportOffsetTop.value = window.visualViewport?.offsetTop ?? 0
}

watch(sidebarSearchQuery, (value) => {
  const query = value.trim()
  if (threadSearchTimer) {
    clearTimeout(threadSearchTimer)
    threadSearchTimer = null
  }
  if (!query) {
    serverMatchedThreadIds.value = null
    return
  }

  threadSearchTimer = setTimeout(() => {
    void searchThreads(query, 1000)
      .then((result) => {
        if (sidebarSearchQuery.value.trim() !== query) return
        serverMatchedThreadIds.value = result.threadIds
      })
      .catch(() => {
        if (sidebarSearchQuery.value.trim() !== query) return
        serverMatchedThreadIds.value = null
      })
  }, 220)
})

watch(isVirtualKeyboardOpen, (open) => {
  if (open) return
  isTerminalKeyboardFocusFallbackActive.value = false
})

watch(accounts, () => {
  if (typeof window === 'undefined') return
  const shouldPoll = accounts.value.some((account) => account.quotaStatus === 'loading')
  if (!shouldPoll) {
    if (accountStatePollTimer !== null) {
      window.clearInterval(accountStatePollTimer)
      accountStatePollTimer = null
    }
    return
  }
  if (accountStatePollTimer !== null) return
  accountStatePollTimer = window.setInterval(() => {
    if (isAccountStatePollInFlight) return
    isAccountStatePollInFlight = true
    void loadAccountsState({ silent: true }).finally(() => {
      isAccountStatePollInFlight = false
    })
  }, 1500)
}, { deep: true })

function onSkillsChanged(): void {
  void refreshSkills()
}

async function refreshTelegramStatus(): Promise<void> {
  try {
    telegramStatus.value = await getTelegramStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Telegram status'
    telegramStatus.value = {
      configured: false,
      active: false,
      mappedChats: 0,
      mappedThreads: 0,
      allowedUsers: 0,
      allowAllUsers: false,
      lastError: message,
    }
  }
}

async function refreshTelegramConfig(): Promise<void> {
  try {
    const config = await getTelegramConfig()
    telegramBotTokenDraft.value = config.botToken
    telegramAllowedUserIdsDraft.value = config.allowedUserIds.map((value) => String(value)).join('\n')
    telegramConfigError.value = ''
  } catch (error) {
    telegramConfigError.value = error instanceof Error ? error.message : 'Failed to load Telegram configuration'
  }
}

async function loadFirstLaunchPluginsCardPreference(): Promise<void> {
  const preference = await getFirstLaunchPluginsCardPreference()
  showFirstLaunchPluginsCard.value = preference.dismissed !== true
}

function parseTelegramAllowedUserIdsInput(value: string): Array<number | '*'> {
  const rawEntries = value
    .split(/[\n,]/)
    .map((entry) => entry.trim().replace(/^(telegram|tg):/i, '').trim())
    .filter(Boolean)
  const allowAllUsers = rawEntries.includes('*')
  const normalizedUserIds = Array.from(new Set(rawEntries
    .filter((entry) => /^-?\d+$/.test(entry))
    .map((entry) => Number.parseInt(entry, 10))))
  return allowAllUsers ? ['*', ...normalizedUserIds] : normalizedUserIds
}

async function saveTelegramConfig(): Promise<void> {
  const botToken = telegramBotTokenDraft.value.trim()
  const allowedUserIds = parseTelegramAllowedUserIdsInput(telegramAllowedUserIdsDraft.value)
  if (!botToken) {
    telegramConfigError.value = t('Telegram bot token is required.')
    return
  }
  if (allowedUserIds.length === 0) {
    telegramConfigError.value = t('At least one allowed Telegram user ID or * is required.')
    return
  }

  isTelegramSaving.value = true
  telegramConfigError.value = ''
  try {
    await configureTelegramBot(botToken, allowedUserIds)
    telegramAllowedUserIdsDraft.value = allowedUserIds.map((value) => String(value)).join('\n')
    await Promise.all([
      refreshTelegramConfig(),
      refreshTelegramStatus(),
    ])
    window.alert(t('Telegram bot configured. Only allowlisted Telegram users can use the bridge.'))
  } catch (error) {
    telegramConfigError.value = error instanceof Error ? error.message : t('Failed to connect Telegram bot')
    void refreshTelegramStatus()
  } finally {
    isTelegramSaving.value = false
  }
}

function toggleSidebarSearch(): void {
  isSidebarSearchVisible.value = !isSidebarSearchVisible.value
  if (isSidebarSearchVisible.value) {
    nextTick(() => sidebarSearchInputRef.value?.focus())
  } else {
    sidebarSearchQuery.value = ''
  }
}

function clearSidebarSearch(): void {
  sidebarSearchQuery.value = ''
  sidebarSearchInputRef.value?.focus()
}

function onSidebarSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    isSidebarSearchVisible.value = false
    sidebarSearchQuery.value = ''
  }
}

function onSelectThread(threadId: string): void {
  if (!threadId) return
  if (route.name === 'thread' && routeThreadId.value === threadId) return
  void router.push({ name: 'thread', params: { threadId } })
  if (isMobile.value) setSidebarCollapsed(true)
}

function onSelectAutomationInPanel(automationId: string): void {
  if (route.name !== 'automations') return
  if (routeAutomationId.value === automationId) return
  void router.replace({ name: 'automations', query: automationId ? { automationId } : {} })
}

async function onEditAutomationFromPanel(payload: AutomationEditRequest): Promise<void> {
  if (isSidebarCollapsed.value) {
    setSidebarCollapsed(false)
    await nextTick()
  }
  sidebarThreadTreeRef.value?.openAutomationEditorFromPanel(payload)
}

async function onCreateAutomationFromPanel(): Promise<void> {
  if (isSidebarCollapsed.value) {
    setSidebarCollapsed(false)
    await nextTick()
  }
  sidebarThreadTreeRef.value?.openAutomationCreatorFromPanel()
}

function onAutomationsChanged(): void {
  if (route.name !== 'automations') return
  void automationsPanelRef.value?.loadAutomations()
}

async function onExportThread(threadId: string): Promise<void> {
  if (!threadId) return
  if (selectedThreadId.value !== threadId) {
    await selectThread(threadId)
    await router.push({ name: 'thread', params: { threadId } })
  }
  await nextTick()
  onExportChat()
}

function shortAccountId(accountId: string): string {
  return accountId.length > 8 ? accountId.slice(-8) : accountId
}

function formatAccountMeta(account: UiAccountEntry): string {
  const segments = [account.planType || t('unknown')]
  if (account.authMode) {
    segments.unshift(account.authMode)
  }
  return segments.join(' · ')
}

function isPaymentRequiredErrorMessage(value: string | null): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized.includes('payment required') || /\b402\b/.test(normalized)
}

function isAccountUnavailable(account: UiAccountEntry): boolean {
  return account.unavailableReason === 'payment_required' || isPaymentRequiredErrorMessage(account.quotaError)
}

function isAccountActionDisabled(account: UiAccountEntry): boolean {
  return isRefreshingAccounts.value || isSwitchingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value || removingAccountId.value.length > 0
    || (account.isActive && removingAccountId.value !== account.accountId && isAccountSwitchBlocked.value)
}

function isRemoveConfirmationActive(account: UiAccountEntry): boolean {
  return confirmingRemoveAccountId.value === account.accountId
}

function isRemoveVisible(account: UiAccountEntry): boolean {
  return hoveredAccountId.value === account.accountId || isRemoveConfirmationActive(account)
}

function getAccountSwitchLabel(account: UiAccountEntry): string {
  if (isAccountUnavailable(account)) return t('Unavailable')
  if (account.isActive) return t('Active')
  if (isSwitchingAccounts.value) return t('Switching…')
  return t('Switch')
}

function getAccountRemoveLabel(account: UiAccountEntry): string {
  if (removingAccountId.value === account.accountId) return t('Removing…')
  if (isRemoveConfirmationActive(account)) return t('Click again to remove')
  return t('Remove')
}

function onAccountCardPointerEnter(accountId: string): void {
  hoveredAccountId.value = accountId
}

function onAccountCardPointerLeave(accountId: string): void {
  if (hoveredAccountId.value === accountId) {
    hoveredAccountId.value = ''
  }
  if (removingAccountId.value === accountId) return
  if (confirmingRemoveAccountId.value === accountId) {
    confirmingRemoveAccountId.value = ''
  }
}

function pickWeeklyQuotaWindow(account: UiAccountEntry) {
  const quota = account.quotaSnapshot
  if (!quota) return null
  const windows = [quota?.primary, quota?.secondary].filter((quotaWindow): quotaWindow is UiRateLimitWindow => quotaWindow !== null)
  const exactWeekly = windows.find((quotaWindow) => quotaWindow.windowMinutes === 7 * 24 * 60)
  if (exactWeekly) {
    return exactWeekly
  }
  const longerWindow = windows
    .filter((quotaWindow) => typeof quotaWindow.windowMinutes === 'number' && quotaWindow.windowMinutes >= 7 * 24 * 60)
    .sort((first, second) => (first.windowMinutes ?? 0) - (second.windowMinutes ?? 0))[0] ?? null
  if (longerWindow) {
    return longerWindow
  }
  return quota.secondary ?? null
}

function formatResetDateCompact(resetsAt: number | null): string {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return ''
  const date = new Date(resetsAt * 1000)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function formatAccountQuota(account: UiAccountEntry): string {
  if (isAccountUnavailable(account)) {
    return account.quotaError || t('402 Payment Required')
  }
  const quota = account.quotaSnapshot
  const window = pickWeeklyQuotaWindow(account)
  const fallbackWindow = quota?.primary ?? quota?.secondary ?? null
  const displayWindow = window ?? fallbackWindow
  if (displayWindow) {
    const remainingPercent = Math.max(0, Math.min(100, 100 - Math.round(displayWindow.usedPercent)))
    const refreshDate = formatResetDateCompact(displayWindow.resetsAt)
    return refreshDate
      ? `${remainingPercent}% ${t('weekly remaining')} · ${refreshDate}`
      : `${remainingPercent}% ${t('weekly remaining')}`
  }
  if (quota?.credits?.unlimited) {
    return t('Unlimited credits')
  }
  if (quota?.credits?.hasCredits && quota.credits.balance) {
    return `${quota.credits.balance} ${t('credits')}`
  }
  if (account.quotaStatus === 'loading') {
    return t('Loading quota…')
  }
  if (account.quotaStatus === 'error') {
    return account.quotaError || t('Quota unavailable')
  }
  if (account.quotaStatus === 'ready' || account.quotaStatus === 'idle') {
    return t('Quota unavailable')
  }
  return t('Fetching account details…')
}

function buildAccountTitle(account: UiAccountEntry): string {
  return [
    account.email || t('Account'),
    formatAccountMeta(account),
    isAccountUnavailable(account) ? t('Unavailable account') : null,
    formatAccountQuota(account),
    `${t('Workspace')} ${account.accountId}`,
  ].filter(Boolean).join('\n')
}

async function loadAccountsState(options: { silent?: boolean } = {}): Promise<void> {
  try {
    const result = await getAccounts()
    accounts.value = result.accounts
    if (!result.accounts.some((account) => account.accountId === hoveredAccountId.value)) {
      hoveredAccountId.value = ''
    }
    if (!result.accounts.some((account) => account.accountId === confirmingRemoveAccountId.value)) {
      confirmingRemoveAccountId.value = ''
    }
  } catch (error) {
    if (options.silent === true) return
    accountActionError.value = error instanceof Error ? error.message : t('Failed to load accounts')
  }
}

async function onRefreshAccounts(): Promise<void> {
  if (isRefreshingAccounts.value || isSwitchingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value) return
  accountActionError.value = ''
  hoveredAccountId.value = ''
  confirmingRemoveAccountId.value = ''
  isRefreshingAccounts.value = true
  try {
    const result = await refreshAccountsFromAuth()
    accounts.value = result.accounts
    stopPolling()
    startPolling()
    void refreshAll({
      includeSelectedThreadMessages: true,
    })
  } catch (error) {
    accountActionError.value = error instanceof Error ? error.message : t('Failed to refresh accounts')
  } finally {
    isRefreshingAccounts.value = false
  }
}

async function onStartCodexLogin(): Promise<void> {
  if (isRefreshingAccounts.value || isSwitchingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value) return
  accountActionError.value = ''
  codexLoginCallbackUrl.value = ''
  isStartingCodexLogin.value = true
  try {
    const loginUrl = await startCodexLogin()
    codexLoginUrl.value = loginUrl
    isCodexLoginModalOpen.value = true
    window.open(loginUrl, '_blank', 'noopener,noreferrer')
    await nextTick()
    codexLoginCallbackInputRef.value?.focus()
  } catch (error) {
    accountActionError.value = error instanceof Error ? error.message : t('Failed to start Codex login')
  } finally {
    isStartingCodexLogin.value = false
  }
}

function onCancelCodexLoginModal(): void {
  if (isCompletingCodexLogin.value) return
  isCodexLoginModalOpen.value = false
  codexLoginCallbackUrl.value = ''
}

async function onSubmitCodexLoginCallback(): Promise<void> {
  const callbackUrl = codexLoginCallbackUrl.value.trim()
  if (!callbackUrl) return
  await completeCodexLoginFromCallback(callbackUrl)
}

async function completeCodexLoginFromCallback(callbackUrl: string): Promise<void> {
  if (isCompletingCodexLogin.value || callbackUrl.length === 0) return
  accountActionError.value = ''
  isCompletingCodexLogin.value = true
  try {
    const result = await completeCodexLogin(callbackUrl)
    accounts.value = result.accounts
    codexLoginUrl.value = ''
    codexLoginCallbackUrl.value = ''
    isCodexLoginModalOpen.value = false
    stopPolling()
    startPolling()
    void refreshAll({
      includeSelectedThreadMessages: true,
    })
  } catch (error) {
    accountActionError.value = error instanceof Error ? error.message : t('Failed to complete Codex login')
  } finally {
    isCompletingCodexLogin.value = false
  }
}

async function onSwitchAccount(accountId: string): Promise<void> {
  if (isSwitchingAccounts.value || isRefreshingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value) return
  if (isAccountSwitchBlocked.value) {
    accountActionError.value = t('Finish the current turn and pending requests before switching accounts.')
    return
  }
  accountActionError.value = ''
  hoveredAccountId.value = ''
  confirmingRemoveAccountId.value = ''
  isSwitchingAccounts.value = true
  try {
    const nextActiveAccount = await switchAccount(accountId)
    accounts.value = accounts.value.map((account) => (
      account.accountId === accountId
        ? nextActiveAccount
        : { ...account, isActive: false }
    ))
    stopPolling()
    startPolling()
    void refreshAll({
      includeSelectedThreadMessages: true,
    })
    void loadAccountsState({ silent: true })
  } catch (error) {
    accountActionError.value = error instanceof Error ? error.message : t('Failed to switch account')
  } finally {
    isSwitchingAccounts.value = false
  }
}

async function onRemoveAccount(accountId: string): Promise<void> {
  if (isRefreshingAccounts.value || isSwitchingAccounts.value || isStartingCodexLogin.value || isCompletingCodexLogin.value || removingAccountId.value.length > 0) return
  const targetAccount = accounts.value.find((account) => account.accountId === accountId) ?? null
  if (!targetAccount) return
  if (confirmingRemoveAccountId.value !== accountId) {
    confirmingRemoveAccountId.value = accountId
    return
  }
  if (targetAccount.isActive && isAccountSwitchBlocked.value) {
    accountActionError.value = t('Finish the current turn and pending requests before removing the active account.')
    return
  }

  const removedWasActive = targetAccount.isActive
  accountActionError.value = ''
  confirmingRemoveAccountId.value = ''
  removingAccountId.value = accountId
  try {
    const result = await removeAccount(accountId)
    accounts.value = result.accounts
    stopPolling()
    startPolling()
    if (removedWasActive) {
      void refreshAll({
        includeSelectedThreadMessages: true,
      })
    }
    void loadAccountsState({ silent: true })
  } catch (error) {
    accountActionError.value = error instanceof Error ? error.message : t('Failed to remove account')
  } finally {
    removingAccountId.value = ''
  }
}

function onArchiveThread(threadId: string): void {
  void archiveThreadById(threadId)
}

async function onForkThread(threadId: string): Promise<void> {
  const nextThreadId = await forkThreadById(threadId)
  if (!nextThreadId) return
  if (!isHomeRoute.value) {
    await router.push({ name: 'thread', params: { threadId: nextThreadId } })
  } else {
    await router.replace({ name: 'thread', params: { threadId: nextThreadId } })
  }
  if (isMobile.value) setSidebarCollapsed(true)
}

function isWorktreePath(cwdRaw: string): boolean {
  const cwd = cwdRaw.trim().replace(/\\/gu, '/')
  if (!cwd) return false
  return cwd.includes('/.codex/worktrees/') || cwd.includes('/.git/worktrees/')
}

function resolvePreferredLocalCwd(projectName: string, fallbackCwd = ''): string {
  const group = projectGroups.value.find((row) => row.projectName === projectName)
  if (!group) return resolveWorkspaceRootCwd(projectName) || fallbackCwd.trim()
  const nonWorktreeThread = group.threads.find((thread) => !isWorktreePath(thread.cwd))
  const candidate = nonWorktreeThread?.cwd?.trim() ?? group.threads[0]?.cwd?.trim() ?? ''
  return candidate || resolveWorkspaceRootCwd(projectName) || fallbackCwd.trim()
}

function onStartNewThread(projectName: string): void {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  const projectCwd = resolvePreferredLocalCwd(projectName, projectGroup?.threads[0]?.cwd?.trim() ?? '')
  if (projectCwd) {
    newThreadCwd.value = projectCwd
  }
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

function onBrowseThreadFiles(threadId: string): void {
  let targetCwd = ''
  for (const group of projectGroups.value) {
    const thread = group.threads.find((row) => row.id === threadId)
    if (thread?.cwd?.trim()) {
      targetCwd = thread.cwd.trim()
      break
    }
  }
  if (!targetCwd || typeof window === 'undefined') return
  window.open(`/codex-local-browse${encodeURI(targetCwd)}`, '_blank', 'noopener,noreferrer')
}

function getProjectCwd(projectName: string): string {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  return resolvePreferredLocalCwd(projectName, projectGroup?.threads[0]?.cwd?.trim() ?? '')
}

const projectCwdByName = computed<Record<string, string>>(() =>
  Object.fromEntries(
    projectGroups.value
      .map((group) => [group.projectName, getProjectCwd(group.projectName).trim()] as const)
      .filter(([, cwd]) => cwd.length > 0),
  ),
)

function getProjectDisplayNameForWorktree(projectName: string): string {
  return (projectDisplayNameById.value[projectName] ?? projectName).trim() || projectName
}

function toWorktreeFolderNameDraft(projectName: string): string {
  const displayName = getProjectDisplayNameForWorktree(projectName)
  const sanitized = displayName
    .replace(/[\\/]+/gu, '-')
    .replace(/[\u0000-\u001f]+/gu, '')
    .trim()
  return sanitized || 'worktree'
}

function onBrowseProjectFiles(projectName: string): void {
  const targetCwd = getProjectCwd(projectName)
  if (!targetCwd || typeof window === 'undefined') return
  window.open(`/codex-local-browse${encodeURI(targetCwd)}`, '_blank', 'noopener,noreferrer')
}

async function onCreateProjectWorktree(projectName: string): Promise<void> {
  const sourceCwd = getProjectCwd(projectName)
  if (!sourceCwd || typeof window === 'undefined') return
  await loadGitRepoStatus(sourceCwd)
  if (gitRepoStatusByCwd.value[sourceCwd] !== true) return

  const suggestedName = `${toWorktreeFolderNameDraft(projectName)}-`
  const worktreeName = window.prompt('New worktree folder name', suggestedName)
  if (worktreeName === null) return

  const normalizedWorktreeName = worktreeName.trim()
  if (!normalizedWorktreeName) return
  if (normalizedWorktreeName.includes('/') || normalizedWorktreeName.includes('\\') || normalizedWorktreeName === '.' || normalizedWorktreeName === '..') {
    window.alert('Worktree name must be a single folder name.')
    return
  }

  try {
    const created = await createPermanentWorktree(sourceCwd, normalizedWorktreeName)
    const normalizedPath = await openProjectRoot(created.cwd, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) return

    newThreadCwd.value = normalizedPath
    newThreadRuntime.value = 'local'
    pinProjectToTop(getProjectOrderNameForPath(normalizedPath))
    await loadWorkspaceRootOptionsState()
    await refreshDefaultProjectName()
    if (isMobile.value) setSidebarCollapsed(true)
    if (!isHomeRoute.value) {
      await router.push({ name: 'home' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create worktree.'
    window.alert(message)
  }
}

function onStartNewThreadFromToolbar(): void {
  newThreadCwd.value = ''
  newThreadRuntime.value = 'local'
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

async function loadGitRepoStatus(cwdRaw: string): Promise<void> {
  const cwd = cwdRaw.trim()
  if (!cwd || Object.prototype.hasOwnProperty.call(gitRepoStatusByCwd.value, cwd)) return

  const existingRequest = gitRepoStatusRequestByCwd.get(cwd)
  if (existingRequest) {
    const isGitRepo = await existingRequest
    if (!Object.prototype.hasOwnProperty.call(gitRepoStatusByCwd.value, cwd)) {
      gitRepoStatusByCwd.value = {
        ...gitRepoStatusByCwd.value,
        [cwd]: isGitRepo,
      }
    }
    return
  }

  const request = getGitRepositoryStatus(cwd)
    .then((status) => status.isGitRepo)
    .catch(() => false)
    .finally(() => {
      gitRepoStatusRequestByCwd.delete(cwd)
    })
  gitRepoStatusRequestByCwd.set(cwd, request)

  const isGitRepo = await request
  if (Object.prototype.hasOwnProperty.call(gitRepoStatusByCwd.value, cwd)) return
  gitRepoStatusByCwd.value = {
    ...gitRepoStatusByCwd.value,
    [cwd]: isGitRepo,
  }
}

function onRenameProject(payload: { projectName: string; displayName: string }): void {
  renameProject(payload.projectName, payload.displayName)
}

function onRenameThread(payload: { threadId: string; title: string }): void {
  void renameThreadById(payload.threadId, payload.title)
}

async function onRemoveProject(projectName: string): Promise<void> {
  await removeProject(projectName)
  await loadWorkspaceRootOptionsState()
  void refreshDefaultProjectName()
}

function onReorderProject(payload: { projectName: string; toIndex: number }): void {
  reorderProject(payload.projectName, payload.toIndex)
}

function onRequestProjectGitStatus(projectName: string): void {
  const group = projectGroups.value.find((entry) => entry.projectName === projectName)
  const cwd = resolvePreferredLocalCwd(projectName, group?.threads[0]?.cwd?.trim() ?? '')
  void loadGitRepoStatus(cwd)
}

function onRespondServerRequest(payload: UiServerRequestReply): void {
  void handleServerRequestResponse(payload)
}

async function handleServerRequestResponse(payload: UiServerRequestReply): Promise<void> {
  const responded = await respondToPendingServerRequest(payload)
  const followUpMessageText = payload.followUpMessageText?.trim() ?? ''
  if (!responded || !followUpMessageText || isHomeRoute.value) return

  try {
    await sendMessageToSelectedThread(followUpMessageText, [], [], 'steer', [])
  } catch {
    // sendMessageToSelectedThread already surfaces the error through shared state.
  }
}

async function onForkThreadFromMessage(payload: { threadId: string; turnIndex: number }): Promise<void> {
  const forkedThreadId = await forkThreadFromTurn(payload.threadId, payload.turnIndex)
  if (!forkedThreadId) return
  await router.push({ name: 'thread', params: { threadId: forkedThreadId } })
  if (selectedThreadId.value !== forkedThreadId) {
    await selectThread(forkedThreadId)
  }
  if (isMobile.value) setSidebarCollapsed(true)
}

function setSidebarCollapsed(nextValue: boolean): void {
  if (isSidebarCollapsed.value === nextValue) return
  isSidebarCollapsed.value = nextValue
  saveSidebarCollapsed(nextValue)
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (event.key === 'Escape' && isSettingsOpen.value) {
    isSettingsOpen.value = false
    return
  }
  if (!event.ctrlKey && !event.metaKey) return
  if (event.shiftKey || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'b') {
    event.preventDefault()
    setSidebarCollapsed(!isSidebarCollapsed.value)
    return
  }
  if (key === 'j' && route.name === 'thread' && selectedThreadId.value) {
    event.preventDefault()
    toggleComposerTerminal()
    return
  }
  if (key === 'j' && isHomeRoute.value && composerCwd.value) {
    event.preventDefault()
    toggleComposerTerminal()
  }
}

function toggleComposerTerminal(): void {
  if (!isThreadTerminalAvailable.value) return
  if (isHomeRoute.value) {
    if (!composerCwd.value) return
    homeTerminalOpen.value = !homeTerminalOpen.value
    if (!homeTerminalOpen.value) {
      resetTerminalKeyboardFocusState()
    }
    return
  }
  toggleSelectedThreadTerminal()
  if (!selectedThreadTerminalOpen.value) {
    resetTerminalKeyboardFocusState()
  }
}

function onSelectHeaderTerminalCommand(command: string): void {
  terminalHeaderDropdownValue.value = ''
  if (!command) return
  if (command === TOGGLE_TERMINAL_COMMAND_VALUE) {
    toggleComposerTerminal()
    return
  }
  void openTerminalAndRunCommand(command)
}

async function openTerminalAndRunCommand(command: string): Promise<void> {
  if (!isThreadTerminalAvailable.value || !composerCwd.value) return
  if (isHomeRoute.value) {
    homeTerminalOpen.value = true
  } else if (selectedThreadId.value) {
    setThreadTerminalOpen(selectedThreadId.value, true)
  } else {
    return
  }
  const panel = await waitForTerminalPanel()
  if (!panel) return
  try {
    await panel.runQuickCommand(command)
    recordHeaderTerminalCommandUse(command)
  } catch {
    // ThreadTerminalPanel renders the terminal-specific error in place.
  }
}

async function waitForTerminalPanel(): Promise<ThreadTerminalPanelExposed | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await nextTick()
    const panel = isHomeRoute.value ? homeTerminalPanelRef.value : threadTerminalPanelRef.value
    if (panel) return panel
    await new Promise((resolve) => window.setTimeout(resolve, 25))
  }
  return null
}

async function refreshTerminalQuickCommands(): Promise<void> {
  const cwd = composerCwd.value.trim()
  if (!cwd) {
    terminalProjectQuickCommands.value = []
    return
  }
  try {
    terminalProjectQuickCommands.value = await getThreadTerminalQuickCommands(cwd)
  } catch {
    terminalProjectQuickCommands.value = []
  }
}

function recordHeaderTerminalCommandUse(command: string): void {
  const normalized = normalizeTerminalQuickCommandValue(command)
  if (!normalized) return
  const existing = terminalStoredQuickCommands.value.find((row) => row.value === normalized)
  const projectCommandIndex = terminalProjectQuickCommands.value.findIndex((row) => row.value === normalized)
  const projectCommand = projectCommandIndex >= 0 ? terminalProjectQuickCommands.value[projectCommandIndex] : null
  if (!projectCommand) return
  const nextCommand: TerminalHeaderQuickCommand = {
    label: existing?.label || projectCommand?.label || normalized,
    value: normalized,
    custom: false,
    usageCount: (existing?.usageCount ?? 0) + 1,
    lastUsedAt: Date.now(),
    sourceIndex: projectCommandIndex >= 0 ? projectCommandIndex : undefined,
  }
  const next = [
    ...terminalStoredQuickCommands.value.filter((row) => row.value !== normalized),
    nextCommand,
  ]
  terminalStoredQuickCommands.value = next
  saveTerminalStoredQuickCommands(next)
}


function onTerminalFocusChange(focused: boolean): void {
  isTerminalInputFocused.value = focused
  if (!focused) {
    isTerminalKeyboardFocusFallbackActive.value = false
    clearTerminalKeyboardFocusFallbackTimer()
    return
  }
  isTerminalKeyboardFocusFallbackActive.value = true
  clearTerminalKeyboardFocusFallbackTimer()
  terminalKeyboardFocusFallbackTimer = setTimeout(() => {
    terminalKeyboardFocusFallbackTimer = null
    if (!isVirtualKeyboardOpen.value) {
      isTerminalKeyboardFocusFallbackActive.value = false
    }
  }, 1500)
}

function onHideHomeTerminal(): void {
  homeTerminalOpen.value = false
  resetTerminalKeyboardFocusState()
}

function onHideSelectedThreadTerminal(): void {
  if (selectedThreadId.value) {
    setThreadTerminalOpen(selectedThreadId.value, false)
  }
  resetTerminalKeyboardFocusState()
}

function resetTerminalKeyboardFocusState(): void {
  isTerminalInputFocused.value = false
  isTerminalKeyboardFocusFallbackActive.value = false
  clearTerminalKeyboardFocusFallbackTimer()
}

function clearTerminalKeyboardFocusFallbackTimer(): void {
  if (!terminalKeyboardFocusFallbackTimer) return
  clearTimeout(terminalKeyboardFocusFallbackTimer)
  terminalKeyboardFocusFallbackTimer = null
}

async function refreshThreadTerminalStatus(): Promise<void> {
  try {
    const status = await getThreadTerminalStatus()
    isThreadTerminalAvailable.value = status.available
    if (!status.available) {
      homeTerminalOpen.value = false
      if (selectedThreadId.value) {
        setThreadTerminalOpen(selectedThreadId.value, false)
      }
    }
  } catch {
    isThreadTerminalAvailable.value = false
    homeTerminalOpen.value = false
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (isTerminalInputFocused.value) {
    const targetElement = target instanceof Element ? target : target.parentElement
    if (!targetElement?.closest('.thread-terminal-panel')) {
      resetTerminalKeyboardFocusState()
    }
  }
  if (!isSettingsOpen.value) return
  if (settingsPanelRef.value?.contains(target)) return
  if (settingsButtonRef.value?.contains(target)) return
  isSettingsOpen.value = false
}

function onSettingsAreaClick(event: MouseEvent): void {
  if (!isSettingsOpen.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (settingsPanelRef.value?.contains(target)) return
  if (settingsButtonRef.value?.contains(target)) return
  isSettingsOpen.value = false
}

function onDocumentVisibilityChange(): void {
  if (typeof document === 'undefined') return
  if (!isMobile.value) return

  if (document.visibilityState === 'hidden') {
    mobileHiddenAtMs.value = Date.now()
    mobileResumeReloadTriggered.value = false
    return
  }

  maybeSyncAfterMobileResume()
}

function onWindowPageShow(event: PageTransitionEvent): void {
  if (!event.persisted) return
  maybeSyncAfterMobileResume()
}

function onWindowFocus(): void {
  if (route.name === 'home') {
    void loadWorkspaceRootOptionsState()
    void refreshDefaultProjectName()
  }
  maybeSyncAfterMobileResume()
}

function maybeSyncAfterMobileResume(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!isMobile.value) return
  if (document.visibilityState !== 'visible') return
  if (mobileResumeReloadTriggered.value) return
  if (mobileHiddenAtMs.value === null) return

  const hiddenForMs = Date.now() - mobileHiddenAtMs.value
  if (hiddenForMs < MOBILE_RESUME_RELOAD_MIN_HIDDEN_MS) return

  mobileResumeReloadTriggered.value = true
  mobileHiddenAtMs.value = null
  void syncAfterMobileResume()
}

async function syncAfterMobileResume(): Promise<void> {
  if (mobileResumeSyncInProgress.value) return
  mobileResumeSyncInProgress.value = true

  try {
    await refreshAll({
      includeSelectedThreadMessages: true,
      awaitAncillaryRefreshes: true,
    })
    await syncThreadSelectionWithRoute()
  } finally {
    mobileResumeSyncInProgress.value = false
  }
}

function onSubmitThreadMessage(payload: { text: string; imageUrls: string[]; fileAttachments: Array<{ label: string; path: string; fsPath: string }>; skills: Array<{ name: string; path: string }>; mode: 'steer' | 'queue' }): void {
  const text = payload.text
  scheduleMobileConversationJumpToLatest()
  const editingState = editingQueuedMessageState.value
  const queueInsertIndex =
    payload.mode === 'queue'
    && editingState
    && editingState.threadId === selectedThreadId.value
      ? editingState.queueIndex
      : undefined
  editingQueuedMessageState.value = null
  if (isHomeRoute.value) {
    void submitFirstMessageForNewThread(text, payload.imageUrls, payload.skills, payload.fileAttachments)
    return
  }
  void sendMessageToSelectedThread(text, payload.imageUrls, payload.skills, payload.mode, payload.fileAttachments, queueInsertIndex)
}

function onEditQueuedMessage(messageId: string): void {
  const queueIndex = selectedThreadQueuedMessages.value.findIndex((item) => item.id === messageId)
  const message = queueIndex >= 0 ? selectedThreadQueuedMessages.value[queueIndex] : undefined
  const composer = threadComposerRef.value
  if (!message || !composer) return

  if (composer.hasUnsavedDraft()) {
    const shouldReplace = window.confirm('Replace the current draft with this queued message for editing?')
    if (!shouldReplace) return
  }

  editingQueuedMessageState.value = selectedThreadId.value
    ? { threadId: selectedThreadId.value, queueIndex }
    : null
  const payload: ComposerDraftPayload = {
    text: message.text,
    imageUrls: [...message.imageUrls],
    fileAttachments: message.fileAttachments.map((attachment) => ({ ...attachment })),
    skills: message.skills.map((skill) => ({ ...skill })),
  }
  composer.hydrateDraft(payload)
  removeQueuedMessage(messageId)
}

function scheduleMobileConversationJumpToLatest(): void {
  if (!isMobile.value || isHomeRoute.value) return

  const jumpToLatest = () => {
    threadConversationRef.value?.jumpToLatest()
  }

  jumpToLatest()
  void nextTick(() => {
    jumpToLatest()
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      jumpToLatest()
      window.requestAnimationFrame(jumpToLatest)
    })
  })
}

function onSelectNewThreadFolder(cwd: string): void {
  newThreadCwd.value = cwd.trim()
  createFolderError.value = ''
}

function onSelectNewWorktreeBranch(branch: string): void {
  newWorktreeBaseBranch.value = branch.trim()
}

function canLoadBranchStateForCwd(cwd: string): boolean {
  const currentCwd = composerCwd.value.trim()
  if (!cwd || currentCwd !== cwd) return false
  return route.name === 'thread' || (route.name === 'home' && isNewThreadCwdGitRepo.value)
}

function resetThreadBranchState(): void {
  threadBranchesRequestId += 1
  threadBranchCommitsRequestId += 1
  threadBranchOptions.value = []
  currentThreadBranch.value = null
  currentThreadHeadSha.value = null
  currentThreadHeadSubject.value = null
  currentThreadHeadDate.value = null
  isThreadDetachedHead.value = false
  isThreadWorktreeDirty.value = false
  threadBranchCommitsByBranch.value = {}
  threadBranchCommitsLoadingFor.value = ''
  threadBranchCommitsError.value = ''
  threadBranchError.value = ''
  isLoadingThreadBranches.value = false
}

async function loadThreadBranches(cwd: string): Promise<void> {
  const targetCwd = cwd.trim()
  if (!targetCwd) {
    resetThreadBranchState()
    return
  }
  const requestId = ++threadBranchesRequestId
  isLoadingThreadBranches.value = true
  threadBranchError.value = ''
  try {
    const state = await getGitBranchState(targetCwd)
    if (requestId !== threadBranchesRequestId || !canLoadBranchStateForCwd(targetCwd)) return
    threadBranchOptions.value = state.options
    currentThreadBranch.value = state.currentBranch
    currentThreadHeadSha.value = state.headSha
    currentThreadHeadSubject.value = state.headSubject
    currentThreadHeadDate.value = state.headDate
    isThreadDetachedHead.value = state.detached
    isThreadWorktreeDirty.value = state.dirty
  } catch {
    if (requestId !== threadBranchesRequestId || !canLoadBranchStateForCwd(targetCwd)) return
    threadBranchOptions.value = []
    currentThreadBranch.value = null
    currentThreadHeadSha.value = null
    currentThreadHeadSubject.value = null
    currentThreadHeadDate.value = null
    isThreadDetachedHead.value = false
    isThreadWorktreeDirty.value = false
  } finally {
    if (requestId === threadBranchesRequestId) {
      isLoadingThreadBranches.value = false
    }
  }
}

function applyThreadGitState(state: { currentBranch: string | null; headSha: string | null; headSubject: string | null; headDate: string | null; detached: boolean; dirty: boolean }): void {
  currentThreadBranch.value = state.currentBranch
  currentThreadHeadSha.value = state.headSha
  currentThreadHeadSubject.value = state.headSubject
  currentThreadHeadDate.value = state.headDate
  isThreadDetachedHead.value = state.detached
  isThreadWorktreeDirty.value = state.dirty
}

function onCheckoutContentHeaderBranch(value: string): void {
  if (isSwitchingThreadBranch.value) return
  const targetBranch = value.trim()
  if (!targetBranch || targetBranch === (currentThreadBranch.value ?? '')) return
  const cwd = composerCwd.value.trim()
  if (!cwd) return

  isSwitchingThreadBranch.value = true
  threadBranchError.value = ''
  void checkoutGitBranch(cwd, targetBranch)
    .then((branch) => {
      currentThreadBranch.value = branch || targetBranch
      currentThreadHeadSha.value = null
      currentThreadHeadSubject.value = null
      currentThreadHeadDate.value = null
      isThreadDetachedHead.value = false
      isReviewPaneOpen.value = false
      return loadThreadBranches(cwd)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to switch branch'
      void loadThreadBranches(cwd).finally(() => {
        threadBranchError.value = message
      })
    })
    .finally(() => {
      isSwitchingThreadBranch.value = false
    })
}

function onResetContentHeaderBranchToCommit(payload: { branch: string; sha: string }): void {
  if (isSwitchingThreadBranch.value) return
  const targetBranch = payload.branch.trim()
  const targetSha = payload.sha.trim()
  const cwd = composerCwd.value.trim()
  if (!targetBranch || !targetSha || !cwd) return
  isSwitchingThreadBranch.value = true
  threadBranchError.value = ''
  void resetGitBranchToCommit(cwd, targetBranch, targetSha)
    .then((state) => {
      applyThreadGitState(state)
      isReviewPaneOpen.value = false
      return loadThreadBranches(cwd)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to reset branch to commit'
      void loadThreadBranches(cwd).finally(() => {
        threadBranchError.value = message
      })
    })
    .finally(() => {
      isSwitchingThreadBranch.value = false
    })
}

function loadThreadBranchCommits(branch: string): void {
  const targetBranch = branch.trim()
  const cwd = composerCwd.value.trim()
  if (!targetBranch || !cwd || threadBranchCommitsLoadingFor.value === targetBranch) return
  if (threadBranchCommitsByBranch.value[targetBranch]) return
  const requestId = ++threadBranchCommitsRequestId
  threadBranchCommitsLoadingFor.value = targetBranch
  threadBranchCommitsError.value = ''
  void getGitBranchCommits(cwd, targetBranch)
    .then((commits) => {
      if (requestId !== threadBranchCommitsRequestId || !canLoadBranchStateForCwd(cwd)) return
      threadBranchCommitsByBranch.value = {
        ...threadBranchCommitsByBranch.value,
        [targetBranch]: commits,
      }
    })
    .catch((error: unknown) => {
      if (requestId !== threadBranchCommitsRequestId || !canLoadBranchStateForCwd(cwd)) return
      threadBranchCommitsError.value = error instanceof Error ? error.message : 'Failed to load branch commits'
    })
    .finally(() => {
      if (requestId === threadBranchCommitsRequestId && threadBranchCommitsLoadingFor.value === targetBranch) {
        threadBranchCommitsLoadingFor.value = ''
      }
    })
}

async function onOpenProjectSetupModal(): Promise<void> {
  const baseDir = await resolveProjectBaseDirectory()
  if (!baseDir) return

  await refreshDefaultProjectName()
  projectSetupBaseDir.value = baseDir
  projectNameDraft.value = defaultNewProjectName.value.trim() || 'New Project (1)'
  githubCloneUrlDraft.value = ''
  projectSetupError.value = ''
  projectSetupMode.value = 'create'
  isProjectSetupModalOpen.value = true
  void nextTick(() => projectSetupPrimaryInputRef.value?.focus())
}

function onCloseProjectSetupModal(): void {
  if (isProjectSetupSubmitting.value) return
  isProjectSetupModalOpen.value = false
  projectSetupError.value = ''
}

async function createProjectFromSetupModal(): Promise<string> {
  const baseDir = projectSetupBaseDir.value.trim()
  const normalizedProjectName = projectNameDraft.value.trim()
  if (!isProjectNameDraftValid.value) {
    throw new Error('Enter a single project folder name.')
  }
  const targetPath = normalizeAbsolutePath(joinPath(baseDir, normalizedProjectName))
  if (!targetPath) return ''

  return openProjectRoot(targetPath, {
    createIfMissing: true,
    label: '',
  })
}

async function cloneGithubRepositoryFromSetupModal(): Promise<string> {
  const baseDir = projectSetupBaseDir.value.trim()
  const normalizedRepoUrl = githubCloneUrlDraft.value.trim()
  if (!normalizedRepoUrl) return ''

  return cloneGithubRepository(normalizedRepoUrl, baseDir)
}

async function onSubmitProjectSetup(): Promise<void> {
  if (!canSubmitProjectSetup.value || isProjectSetupSubmitting.value) return

  projectSetupError.value = ''
  isProjectSetupSubmitting.value = true
  try {
    const normalizedPath =
      projectSetupMode.value === 'clone'
        ? await cloneGithubRepositoryFromSetupModal()
        : await createProjectFromSetupModal()
    if (!normalizedPath) return

    newThreadCwd.value = normalizedPath
    pinProjectToTop(getProjectOrderNameForPath(normalizedPath))
    await loadWorkspaceRootOptionsState()
    await refreshDefaultProjectName()
    isProjectSetupModalOpen.value = false
  } catch (error) {
    projectSetupError.value = error instanceof Error ? error.message : 'Failed to create or clone project.'
  } finally {
    isProjectSetupSubmitting.value = false
  }
}

async function onOpenExistingFolder(): Promise<void> {
  const startPath = newThreadCwd.value.trim() || await resolveProjectBaseDirectory()
  if (!startPath) return
  isCreateFolderOpen.value = false
  isExistingFolderPickerOpen.value = true
  existingFolderFilter.value = ''
  await loadExistingFolderListing(startPath)
  if (!existingFolderError.value) {
    void nextTick(() => existingFolderPathInputRef.value?.focus())
  }
}

function onCloseExistingFolderPanel(): void {
  existingFolderBrowseRequestId += 1
  isExistingFolderPickerOpen.value = false
  isExistingFolderLoading.value = false
  existingFolderError.value = ''
  existingFolderFilter.value = ''
  existingFolderPathDraft.value = ''
  onCloseCreateFolderPanel()
}

async function onBrowseExistingFolder(path: string): Promise<void> {
  if (!path || isExistingFolderLoading.value) return
  existingFolderFilter.value = ''
  await loadExistingFolderListing(path)
}

function onToggleHiddenFolders(): void {
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!isExistingFolderPickerOpen.value || !currentPath) return
  void loadExistingFolderListing(currentPath)
}

function onRetryExistingFolderBrowse(): void {
  const currentPath = resolvedExistingFolderPath.value
  if (!isExistingFolderPickerOpen.value || !currentPath || isExistingFolderLoading.value) return
  void loadExistingFolderListing(currentPath)
}

function onExistingFolderPathBlur(): void {
  if (!isExistingFolderPickerOpen.value || isExistingFolderLoading.value || isOpeningExistingFolder.value) return
  const draftedPath = resolvedExistingFolderPath.value
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!draftedPath || draftedPath === currentPath) return
  void loadExistingFolderListing(draftedPath)
}

function onSubmitExistingFolderPath(): void {
  const draftedPath = resolvedExistingFolderPath.value
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!draftedPath) return
  if (draftedPath !== currentPath) {
    void loadExistingFolderListing(draftedPath)
    return
  }
  void onConfirmExistingFolder(draftedPath)
}

async function onConfirmExistingFolder(path = resolvedExistingFolderPath.value): Promise<void> {
  const targetPath = normalizePathForUi(path).trim()
  if (!targetPath) return

  existingFolderError.value = ''
  isOpeningExistingFolder.value = true
  try {
    const normalizedPath = await openProjectRoot(targetPath, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) {
      existingFolderError.value = 'Failed to open the selected folder.'
      return
    }

    newThreadCwd.value = normalizedPath
    pinProjectToTop(getProjectOrderNameForPath(normalizedPath))
    await loadWorkspaceRootOptionsState()
    await refreshDefaultProjectName()
    onCloseExistingFolderPanel()
  } catch (error) {
    existingFolderError.value = error instanceof Error ? error.message : 'Failed to open the selected folder.'
  } finally {
    isOpeningExistingFolder.value = false
  }
}

async function onOpenCreateFolderPanel(): Promise<void> {
  createFolderError.value = ''
  if (isCreateFolderOpen.value) {
    onCloseCreateFolderPanel()
    return
  }
  if (!isExistingFolderPickerOpen.value) {
    const startPath = newThreadCwd.value.trim() || await resolveProjectBaseDirectory()
    if (!startPath) return
    isExistingFolderPickerOpen.value = true
    existingFolderFilter.value = ''
    await loadExistingFolderListing(startPath)
    if (existingFolderError.value) return
  }
  if (existingFolderError.value) return
  createFolderDraft.value = defaultNewProjectName.value
  isCreateFolderOpen.value = true
  void nextTick(() => createFolderInputRef.value?.focus())
}

function onCloseCreateFolderPanel(): void {
  createFolderError.value = ''
  createFolderDraft.value = ''
  isCreateFolderOpen.value = false
}

async function onCreateFolder(): Promise<void> {
  const normalizedInput = createFolderDraft.value.trim()
  if (!normalizedInput) return

  createFolderError.value = ''
  if (existingFolderError.value) {
    createFolderError.value = 'Reload the current folder before creating a new one.'
    return
  }
  isCreatingFolder.value = true

  const baseDir = createFolderParentPath.value.trim()
  const targetPath = normalizeAbsolutePath(joinPath(baseDir, normalizedInput))

  if (!targetPath) {
    createFolderError.value = 'Unable to determine where the new folder should be created.'
    isCreatingFolder.value = false
    return
  }

  if (!isCreateFolderNameValid.value) {
    createFolderError.value = 'Enter a single folder name.'
    isCreatingFolder.value = false
    return
  }

  try {
    const normalizedPath = await createLocalDirectory(targetPath)
    if (!normalizedPath) {
      createFolderError.value = 'Failed to create the folder.'
      return
    }

    createFolderError.value = ''
    existingFolderFilter.value = ''
    await loadExistingFolderListing(normalizedPath)
    onCloseCreateFolderPanel()
  } catch (error) {
    createFolderError.value = error instanceof Error ? error.message : 'Failed to create folder.'
  } finally {
    isCreatingFolder.value = false
  }
}

async function applyLaunchProjectPathFromUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const launchProjectPath = new URLSearchParams(window.location.search).get('openProjectPath')?.trim() ?? ''
  if (!launchProjectPath) return false
  try {
    const normalizedPath = await openProjectRoot(launchProjectPath, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) return false
    newThreadCwd.value = normalizedPath
    pinProjectToTop(getProjectOrderNameForPath(normalizedPath))
    await router.replace({ name: 'home' })
    await loadWorkspaceRootOptionsState()
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('openProjectPath')
    window.history.replaceState({}, '', nextUrl.toString())
    return true
  } catch {
    // If launch path is invalid, keep normal startup behavior.
    return false
  }
}

async function resolveProjectBaseDirectory(): Promise<string> {
  const baseDir = getProjectBaseDirectory()
  if (baseDir) return baseDir
  try {
    const loadedHomeDirectory = await getHomeDirectory()
    if (loadedHomeDirectory) {
      homeDirectory.value = loadedHomeDirectory
      return loadedHomeDirectory
    }
  } catch {
    // Fallback handled by empty return.
  }
  return ''
}

async function refreshDefaultProjectName(): Promise<void> {
  const baseDir = getProjectBaseDirectory()
  if (!baseDir) {
    defaultNewProjectName.value = 'New Project (1)'
    return
  }

  try {
    const suggestion = await getProjectRootSuggestion(baseDir)
    defaultNewProjectName.value = suggestion.name || 'New Project (1)'
  } catch {
    defaultNewProjectName.value = 'New Project (1)'
  }
}

function getProjectBaseDirectory(): string {
  const selected = newThreadCwd.value.trim()
  if (selected) return getPathParent(selected)
  const first = newThreadFolderOptions.value[0]?.value?.trim() ?? ''
  if (first) return getPathParent(first)
  return homeDirectory.value.trim()
}

async function loadHomeDirectory(): Promise<void> {
  try {
    homeDirectory.value = await getHomeDirectory()
  } catch {
    homeDirectory.value = ''
  }
}

async function loadWorkspaceRootOptionsState(): Promise<void> {
  try {
    const state = await getWorkspaceRootsState()
    workspaceRootOptionsState.value = {
      order: [...state.order],
      labels: { ...state.labels },
      projectOrder: [...state.projectOrder],
    }
  } catch {
    workspaceRootOptionsState.value = { order: [], labels: {}, projectOrder: [] }
  }
}

async function loadExistingFolderListing(path: string): Promise<void> {
  const requestId = ++existingFolderBrowseRequestId
  const normalizedRequestedPath = normalizePathForUi(path).trim()
  existingFolderPathDraft.value = normalizedRequestedPath
  existingFolderBrowsePath.value = normalizedRequestedPath
  existingFolderError.value = ''
  isExistingFolderLoading.value = true

  try {
    const listing = await listLocalDirectories(path, { showHidden: showHiddenFolders.value })
    if (requestId !== existingFolderBrowseRequestId) return
    existingFolderPathDraft.value = listing.path
    existingFolderBrowsePath.value = listing.path
    existingFolderParentPath.value = listing.parentPath
    existingFolderEntries.value = listing.entries
  } catch (error) {
    if (requestId !== existingFolderBrowseRequestId) return
    existingFolderError.value = error instanceof Error ? error.message : 'Failed to load local folders.'
    existingFolderParentPath.value = getPathParent(existingFolderBrowsePath.value)
    existingFolderEntries.value = []
    onCloseCreateFolderPanel()
  } finally {
    if (requestId === existingFolderBrowseRequestId) {
      isExistingFolderLoading.value = false
    }
  }
}

function joinPath(parent: string, child: string): string {
  const rawParent = normalizePathForUi(parent).trim()
  const normalizedChild = normalizePathForUi(child).trim().replace(/^[\\/]+/u, '')
  if (!rawParent || !normalizedChild) return ''
  const separator = rawParent.includes('\\') && !rawParent.includes('/') ? '\\' : '/'
  if (/^[a-zA-Z]:[\\/]?$/u.test(rawParent)) {
    return `${rawParent.slice(0, 2)}${separator}${normalizedChild}`
  }
  if (/^\/+$/u.test(rawParent)) {
    return `/${normalizedChild}`
  }
  const normalizedParent = rawParent.replace(/[\\/]+$/u, '')
  if (!normalizedParent) return ''
  return `${normalizedParent}${separator}${normalizedChild}`
}

function normalizeAbsolutePath(value: string): string {
  const normalizedValue = normalizePathForUi(value).trim()
  if (!normalizedValue) return ''

  const uncMatch = normalizedValue.match(/^\\\\([^\\/]+)[\\/]+([^\\/]+)([\\/].*)?$/u)
  if (uncMatch) {
    const [, server, share, suffix = ''] = uncMatch
    const segments = collapsePathSegments(suffix.split(/[\\/]+/u))
    return segments.length > 0
      ? `\\\\${server}\\${share}\\${segments.join('\\')}`
      : `\\\\${server}\\${share}`
  }

  const driveMatch = normalizedValue.match(/^([a-zA-Z]:)([\\/].*)?$/u)
  if (driveMatch) {
    const [, drive, suffix = ''] = driveMatch
    const separator = normalizedValue.includes('\\') && !normalizedValue.includes('/') ? '\\' : '/'
    const segments = collapsePathSegments(suffix.split(/[\\/]+/u))
    return segments.length > 0 ? `${drive}${separator}${segments.join(separator)}` : `${drive}${separator}`
  }

  if (normalizedValue.startsWith('/')) {
    const segments = collapsePathSegments(normalizedValue.split('/'))
    return segments.length > 0 ? `/${segments.join('/')}` : '/'
  }

  return normalizedValue
}

function collapsePathSegments(rawSegments: readonly string[]): string[] {
  const segments: string[] = []
  for (const rawSegment of rawSegments) {
    const segment = rawSegment.trim()
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length > 0) {
        segments.pop()
      }
      continue
    }
    segments.push(segment)
  }
  return segments
}

function onReorderQueuedMessage(payload: { draggedId: string; targetId: string }): void {
  reorderQueuedMessage(payload.draggedId, payload.targetId)
}

function onSelectModel(modelId: string): void {
  setSelectedModelIdForThread(composerThreadContextId.value, modelId)
}

function onSelectReasoningEffort(effort: ReasoningEffort | ''): void {
  setSelectedReasoningEffort(effort)
}

function onSelectSpeedMode(mode: SpeedMode): void {
  void updateSelectedSpeedMode(mode)
}

function onInterruptTurn(): void {
  void interruptSelectedThreadTurn()
}

function onRollback(payload: { turnId: string }): void {
  const targetTurnId = payload.turnId.trim()
  if (targetTurnId.length > 0) {
    const rollbackUserMessage = [...filteredMessages.value]
      .reverse()
      .find((message) => (
        message.role === 'user'
        && (message.turnId?.trim() ?? '') === targetTurnId
        && message.text.trim().length > 0
      ))
    if (rollbackUserMessage?.text && threadComposerRef.value) {
      threadComposerRef.value.appendTextToDraft(rollbackUserMessage.text)
    }
  }
  void rollbackSelectedThread(payload.turnId)
}

function onImplementPlan(payload: { turnId: string }): void {
  if (isHomeRoute.value || !selectedThreadId.value) return
  setSelectedCollaborationMode('default')
  scheduleMobileConversationJumpToLatest()
  void sendMessageToSelectedThread('Implement', [], [], 'steer', [], undefined, 'default')
}

function onExportChat(): void {
  if (isHomeRoute.value || isSkillsRoute.value || isAutomationsRoute.value || typeof document === 'undefined') return
  if (!selectedThread.value || filteredMessages.value.length === 0) return
  const markdown = buildThreadMarkdown(selectedThread.value, filteredMessages.value)
  const fileName = buildExportFileName(selectedThread.value)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}


function toggleSendWithEnter(): void {
  sendWithEnter.value = !sendWithEnter.value
  window.localStorage.setItem(SEND_WITH_ENTER_KEY, sendWithEnter.value ? '1' : '0')
}

function cycleInProgressSendMode(): void {
  inProgressSendMode.value = inProgressSendMode.value === 'steer' ? 'queue' : 'steer'
  window.localStorage.setItem(IN_PROGRESS_SEND_MODE_KEY, inProgressSendMode.value)
}

function cycleDarkMode(): void {
  const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark']
  const idx = order.indexOf(darkMode.value)
  darkMode.value = order[(idx + 1) % order.length]
  window.localStorage.setItem(DARK_MODE_KEY, darkMode.value)
  applyDarkMode(darkMode.value)
}

function cycleChatWidth(): void {
  const order: ChatWidthMode[] = ['standard', 'wide', 'extra-wide']
  const idx = order.indexOf(chatWidth.value)
  chatWidth.value = order[(idx + 1) % order.length]
  window.localStorage.setItem(CHAT_WIDTH_KEY, chatWidth.value)
}

function toggleDictationClickToToggle(): void {
  dictationClickToToggle.value = !dictationClickToToggle.value
  window.localStorage.setItem(DICTATION_CLICK_TO_TOGGLE_KEY, dictationClickToToggle.value ? '1' : '0')
}

function toggleDictationAutoSend(): void {
  dictationAutoSend.value = !dictationAutoSend.value
  window.localStorage.setItem(DICTATION_AUTO_SEND_KEY, dictationAutoSend.value ? '1' : '0')
}

async function onProviderChange(provider: string): Promise<void> {
  if (freeModeLoading.value) return
  freeModeLoading.value = true
  try {
    if (provider === 'codex') {
      selectedProvider.value = 'codex'
      const result = await setFreeMode(false)
      freeModeEnabled.value = result.enabled
    } else if (provider === 'openrouter') {
      selectedProvider.value = 'openrouter'
      const result = await setFreeMode(true)
      freeModeEnabled.value = result.enabled
      await setCustomProvider('', '', {
        wireApi: openRouterWireApi.value,
        provider: 'openrouter',
      })
    } else if (provider === 'opencode-zen') {
      selectedProvider.value = 'opencode-zen'
      await setCustomProvider('', opencodeZenKey.value.trim(), {
        wireApi: 'chat',
        provider: 'opencode-zen',
      })
      freeModeEnabled.value = true
    } else if (provider === 'custom') {
      selectedProvider.value = 'custom'
      if (customEndpointUrl.value.trim() && customEndpointKey.value.trim()) {
        await setCustomProvider(customEndpointUrl.value.trim(), customEndpointKey.value.trim(), {
          wireApi: customEndpointWireApi.value,
        })
        freeModeEnabled.value = true
      }
    }
    providerError.value = ''
    await refreshAll({ includeSelectedThreadMessages: false, providerChanged: true, awaitAncillaryRefreshes: true })
    if (route.name === 'thread') {
      void router.push({ name: 'home' })
    }
  } catch (err) {
    providerError.value = err instanceof Error ? err.message : 'Failed to switch provider'
  } finally {
    freeModeLoading.value = false
  }
}

async function saveCustomEndpoint(): Promise<void> {
  if (freeModeCustomKeySaving.value) return
  const url = customEndpointUrl.value.trim()
  if (!url) return
  freeModeCustomKeySaving.value = true
  try {
    providerError.value = ''
    await setCustomProvider(url, customEndpointKey.value.trim(), {
      wireApi: customEndpointWireApi.value,
    })
    freeModeEnabled.value = true
    await refreshAll({ includeSelectedThreadMessages: false, providerChanged: true, awaitAncillaryRefreshes: true })
  } catch (err) {
    providerError.value = err instanceof Error ? err.message : 'Failed to save custom endpoint'
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function setOpenRouterWireApi(nextWireApi: 'responses' | 'chat'): Promise<void> {
  if (freeModeCustomKeySaving.value || freeModeLoading.value) return
  if (openRouterWireApi.value === nextWireApi) return
  const previousWireApi = openRouterWireApi.value
  openRouterWireApi.value = nextWireApi
  freeModeCustomKeySaving.value = true
  try {
    providerError.value = ''
    await setCustomProvider('', '', {
      wireApi: nextWireApi,
      provider: 'openrouter',
    })
    freeModeEnabled.value = true
    await refreshAll({ includeSelectedThreadMessages: false, providerChanged: true, awaitAncillaryRefreshes: true })
  } catch (err) {
    openRouterWireApi.value = previousWireApi
    providerError.value = err instanceof Error ? err.message : 'Failed to save OpenRouter API format'
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function saveOpencodeZen(): Promise<void> {
  if (freeModeCustomKeySaving.value) return
  const key = opencodeZenKey.value.trim()
  if (!key) return
  freeModeCustomKeySaving.value = true
  try {
    providerError.value = ''
    await setCustomProvider('', key, {
      wireApi: 'chat',
      provider: 'opencode-zen',
    })
    freeModeEnabled.value = true
    await refreshAll({ includeSelectedThreadMessages: false, providerChanged: true, awaitAncillaryRefreshes: true })
  } catch (err) {
    providerError.value = err instanceof Error ? err.message : 'Failed to save OpenCode Zen config'
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function saveFreeModeCustomKey(): Promise<void> {
  if (freeModeCustomKeySaving.value) return
  freeModeCustomKeySaving.value = true
  try {
    const key = freeModeCustomKey.value.trim()
    await setFreeModeCustomKey(key)
    freeModeCustomKey.value = ''
    await loadFreeModeStatus()
    await refreshAll({ includeSelectedThreadMessages: false })
  } catch {
    // Silently fail
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function clearFreeModeCustomKey(): Promise<void> {
  if (freeModeCustomKeySaving.value) return
  freeModeCustomKeySaving.value = true
  try {
    await setFreeModeCustomKey('')
    freeModeCustomKey.value = ''
    await loadFreeModeStatus()
    await refreshAll({ includeSelectedThreadMessages: false })
  } catch {
    // Silently fail
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function loadFreeModeStatus(): Promise<void> {
  try {
    const status = await getFreeModeStatus()
    freeModeEnabled.value = status.enabled
    freeModeHasCustomKey.value = status.customKey ?? false
    freeModeCustomKeyMasked.value = status.maskedKey ?? null
    if (status.enabled) {
      if (status.provider === 'opencode-zen') {
        selectedProvider.value = 'opencode-zen'
      } else if (status.provider === 'custom') {
        selectedProvider.value = 'custom'
        customEndpointUrl.value = status.customBaseUrl ?? ''
        customEndpointWireApi.value = status.wireApi === 'chat' ? 'chat' : 'responses'
      } else {
        selectedProvider.value = 'openrouter'
        openRouterWireApi.value = status.wireApi === 'chat' ? 'chat' : 'responses'
      }
    } else {
      selectedProvider.value = 'codex'
    }
  } catch {
    // Ignore — free mode status unknown
  }
}

function onDictationLanguageChange(nextValue: string): void {
  const normalized = normalizeToWhisperLanguage(nextValue.trim())
  const value = normalized || 'auto'
  dictationLanguage.value = value
  window.localStorage.setItem(DICTATION_LANGUAGE_KEY, value)
}



function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
}

function saveSidebarCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, value ? '1' : '0')
}

function loadAccountsSectionCollapsed(): boolean {
  if (typeof window === 'undefined') return true
  const value = window.localStorage.getItem(ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY)
  if (value === null) return true
  return value === '1'
}

function toggleAccountsSectionCollapsed(): void {
  isAccountsSectionCollapsed.value = !isAccountsSectionCollapsed.value
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY,
    isAccountsSectionCollapsed.value ? '1' : '0',
  )
}

function normalizeMessageType(rawType: string | undefined, role: string): string {
  const normalized = (rawType ?? '').trim()
  if (normalized.length > 0) {
    return normalized
  }
  return role.trim() || 'message'
}

function onSelectCollaborationMode(mode: 'default' | 'plan'): void {
  setSelectedCollaborationMode(mode)
}

async function initialize(): Promise<void> {
  await router.isReady()

  if (route.name === 'thread' && routeThreadId.value) {
    primeSelectedThread(routeThreadId.value)
  }

  await refreshAll({
    includeSelectedThreadMessages: route.name === 'thread',
  })
  void loadAccountsState({ silent: true })
  await applyLaunchProjectPathFromUrl()
  hasInitialized.value = true
  await syncThreadSelectionWithRoute()
  startPolling()
}

function threadExistsInSidebar(threadId: string): boolean {
  if (!threadId) return false
  return projectGroups.value.some((group) => group.threads.some((thread) => thread.id === threadId))
}

async function syncThreadSelectionWithRoute(): Promise<void> {
  if (isRouteSyncInProgress.value) {
    hasPendingRouteSync = true
    return
  }
  isRouteSyncInProgress.value = true

  try {
    do {
      hasPendingRouteSync = false

      if (route.name === 'home' || route.name === 'skills' || route.name === 'automations') {
        if (selectedThreadId.value !== '') {
          await selectThread('')
        }
        continue
      }

      if (route.name === 'thread') {
        const threadId = routeThreadId.value
        if (!threadId) continue

        if (selectedThreadId.value !== threadId) {
          if (!threadExistsInSidebar(threadId)) {
            if (selectedThreadId.value) {
              await router.replace({ name: 'thread', params: { threadId: selectedThreadId.value } })
            } else {
              await router.replace({ name: 'home' })
            }
            continue
          }
          await selectThread(threadId)
        } else {
          void ensureThreadMessagesLoaded(threadId, { silent: true })
        }
      }
    } while (hasPendingRouteSync)

  } finally {
    isRouteSyncInProgress.value = false
  }
}

watch(
  () =>
    [
      route.name,
      routeThreadId.value,
      isLoadingThreads.value,
      selectedThreadId.value,
    ] as const,
  async () => {
    if (!hasInitialized.value) return
    await syncThreadSelectionWithRoute()
  },
)

watch(
  () => composerCwd.value,
  () => {
    void refreshTerminalQuickCommands()
  },
)

watch(
  () => [route.name, composerCwd.value] as const,
  ([routeName, cwd]) => {
    if (routeName !== 'thread') return
    void loadGitRepoStatus(cwd)
  },
  { immediate: true },
)

watch(
  () => selectedThreadId.value,
  async (threadId) => {
    if (!hasInitialized.value) return
    if (isRouteSyncInProgress.value) return
    if (isHomeRoute.value || isSkillsRoute.value || isAutomationsRoute.value) return

    if (!threadId) {
      if (route.name !== 'home') {
        await router.replace({ name: 'home' })
      }
      return
    }

    if (route.name === 'thread' && routeThreadId.value === threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  },
)

watch(
  () => newThreadFolderOptions.value,
  (options) => {
    if (options.length === 0) {
      newThreadCwd.value = ''
      void refreshDefaultProjectName()
      return
    }
    const selected = newThreadCwd.value.trim()
    if (selected) {
      const hasSelected = options.some((option) => option.value === selected)
      if (!hasSelected) {
        newThreadCwd.value = ''
      }
    }
    void refreshDefaultProjectName()
  },
  { immediate: true },
)

watch(
  () => newThreadCwd.value,
  () => {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    void refreshDefaultProjectName()
  },
)

watch(
  () => [route.name, newThreadCwd.value] as const,
  ([routeName, cwd]) => {
    if (routeName !== 'home') return
    void loadGitRepoStatus(cwd)
  },
  { immediate: true },
)

watch(
  isNewThreadCwdGitRepo,
  (isGitRepo) => {
    if (!isGitRepo && newThreadRuntime.value === 'worktree') {
      newThreadRuntime.value = 'local'
    }
  },
  { immediate: true },
)

watch(
  () => [newThreadRuntime.value, newThreadCwd.value] as const,
  ([runtime, cwd]) => {
    if (runtime !== 'worktree' || !isNewThreadCwdGitRepo.value) return
    void loadWorktreeBranches(cwd)
  },
  { immediate: true },
)

watch(
  () => newThreadRuntime.value,
  (runtime) => {
    if (runtime === 'local') {
      worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
      const current = newThreadCwd.value.trim()
      if (current && isWorktreePath(current)) {
        const fallbackProjectName = selectedThread.value?.projectName ?? getPathLeafName(current)
        const localCwd = resolvePreferredLocalCwd(fallbackProjectName, '')
        if (localCwd) {
          newThreadCwd.value = localCwd
        }
      }
      return
    }
    if (isNewThreadCwdGitRepo.value) {
      void loadWorktreeBranches(newThreadCwd.value)
    }
  },
)

watch(
  () => route.name,
  (name) => {
    if (name !== 'home') {
      worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    }
    if (name !== 'thread') {
      isReviewPaneOpen.value = false
    }
  },
)

watch(
  () => selectedThreadId.value,
  () => {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
  },
)

watch(
  () => [route.name, composerCwd.value, isNewThreadCwdGitRepo.value] as const,
  ([routeName, cwd, isNewThreadGitRepo]) => {
    const shouldLoadBranches = routeName === 'thread' || (routeName === 'home' && isNewThreadGitRepo)
    if (!shouldLoadBranches) {
      resetThreadBranchState()
      return
    }
    threadBranchCommitsRequestId += 1
    threadBranchCommitsByBranch.value = {}
    threadBranchCommitsLoadingFor.value = ''
    threadBranchCommitsError.value = ''
    void loadThreadBranches(cwd)
  },
  { immediate: true },
)

watch(
  pageTitle,
  (value) => {
    if (typeof document === 'undefined') return
    document.title = value
  },
  { immediate: true },
)

watch(isMobile, (mobile) => {
  if (mobile && !isSidebarCollapsed.value) {
    setSidebarCollapsed(true)
  }
}, { immediate: true })

async function submitFirstMessageForNewThread(
  text: string,
  imageUrls: string[] = [],
  skills: Array<{ name: string; path: string }> = [],
  fileAttachments: Array<{ label: string; path: string; fsPath: string }> = [],
): Promise<void> {
  try {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    let targetCwd = newThreadCwd.value
    if (newThreadRuntime.value === 'worktree') {
      worktreeInitStatus.value = {
        phase: 'running',
        title: t('Creating worktree'),
        message: t('Creating a worktree and running setup.'),
      }
      try {
        const created = await createWorktree(newThreadCwd.value, newWorktreeBaseBranch.value)
        targetCwd = created.cwd
        newThreadCwd.value = created.cwd
        worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
      } catch {
        worktreeInitStatus.value = {
          phase: 'error',
          title: t('Worktree setup failed'),
          message: t('Unable to create worktree. Try again or switch to Local project.'),
        }
        return
      }
    } else if (!targetCwd.trim()) {
      const directory = await createProjectlessThreadDirectory(text)
      targetCwd = directory.cwd
      newThreadCwd.value = directory.cwd
    }
    const threadId = await sendMessageToNewThread(text, targetCwd, imageUrls, skills, fileAttachments)
    if (!threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
    scheduleMobileConversationJumpToLatest()
  } catch {
    // Error is already reflected in state.
  }
}

function buildDirectoryTryPrompt(payload: DirectoryTryItemPayload): string {
  if (payload.prompt?.trim()) return payload.prompt.trim()
  const label = payload.displayName.trim() || payload.name.trim()
  const itemType = payload.kind === 'skill'
    ? 'skill'
    : payload.kind === 'plugin'
      ? 'plugin'
      : payload.kind === 'composio'
        ? 'Composio connector'
        : 'app'
  return `Test ${label} ${itemType}. Give me a list of what it can do and one useful example.`
}

function getDirectoryTryItemKey(payload: DirectoryTryItemPayload): string {
  return `${payload.kind}:${payload.name}:${payload.skillPath ?? ''}`
}

async function onTryDirectoryItem(payload: DirectoryTryItemPayload): Promise<void> {
  if (directoryTryInFlightKey.value) return
  directoryTryInFlightKey.value = getDirectoryTryItemKey(payload)
  const text = buildDirectoryTryPrompt(payload)
  const skills = payload.attachedSkills?.length
    ? payload.attachedSkills
    : payload.kind === 'skill' && payload.skillPath
    ? [{ name: payload.name, path: payload.skillPath }]
    : []
  try {
    const targetCwd = directoryCwd.value.trim() || composerCwd.value.trim()
    const threadId = await sendMessageToNewThread(text, targetCwd, [], skills, [])
    if (!threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
    scheduleMobileConversationJumpToLatest()
  } catch {
    // Error is already reflected in shared thread state.
  } finally {
    directoryTryInFlightKey.value = ''
  }
}

async function loadWorktreeBranches(sourceCwd: string): Promise<void> {
  const normalizedSourceCwd = sourceCwd.trim()
  if (!normalizedSourceCwd) {
    worktreeBranchOptions.value = []
    newWorktreeBaseBranch.value = ''
    return
  }

  isLoadingWorktreeBranches.value = true
  try {
    const options = await getWorktreeBranchOptions(normalizedSourceCwd)
    worktreeBranchOptions.value = options
    const currentSelection = newWorktreeBaseBranch.value.trim()
    const hasCurrentSelection = currentSelection.length > 0 && options.some((option) => option.value === currentSelection)
    if (!hasCurrentSelection) {
      const preferredMainOption = options.find((option) => option.value.trim() === 'main')
      newWorktreeBaseBranch.value = preferredMainOption?.value ?? options[0]?.value ?? ''
    }
  } catch {
    worktreeBranchOptions.value = []
    newWorktreeBaseBranch.value = ''
  } finally {
    isLoadingWorktreeBranches.value = false
  }
}
</script>

<style scoped src="./App.scoped.css"></style>
