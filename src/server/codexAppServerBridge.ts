import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rename, rm, mkdir, stat, cp, lstat, readlink, symlink } from 'node:fs/promises'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { homedir } from 'node:os'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { writeFile } from 'node:fs/promises'
import { handleAccountRoutes } from './accountRoutes.js'
import { buildAppServerArgs } from './appServerRuntimeConfig.js'
import { handleReviewRoutes } from './reviewGit.js'
import { handleSkillsRoutes, initializeSkillsSyncOnStartup } from './skillsRoutes.js'
import { TelegramThreadBridge } from './telegramThreadBridge.js'
import {
  getRandomFreeKey,
  getFreeKeyCount,
  FREE_MODE_PROVIDER_ID,
  FREE_MODE_DEFAULT_MODEL,
  getCachedFreeModels,
  getFreeModels,
  refreshFreeModelsInBackground,
  FREE_MODE_STATE_FILE,
  createDefaultOpenCodeZenFreeModeState,
  getFreeModeConfigArgs,
  getFreeModeEnvVars,
  shouldCreateDefaultFreeModeStateForMissingAuth,
  type FreeModeState,
} from './freeMode.js'
import { handleOpenRouterProxyRequest } from './openRouterProxy.js'
import { handleZenProxyRequest } from './zenProxy.js'
import { handleCustomEndpointProxyRequest } from './customEndpointProxy.js'
import { ThreadTerminalManager } from './terminalManager.js'
import { getSpawnInvocation } from '../utils/commandInvocation.js'
import {
  resolveCodexCommand,
  resolveRipgrepCommand,
} from '../commandResolution.js'
import type { CollaborationModeKind, ReasoningEffort } from '../types/codex.js'
import { isAbsoluteLikePath } from '../pathUtils.js'
import {
  installComposioCli,
  listComposioConnectors,
  parseComposioLimit,
  readComposioConnectorDetail,
  readComposioStatus,
  startComposioLink,
  startComposioLogin,
} from './composioRoutesSupport.js'
import { listTerminalQuickCommands } from './terminalQuickCommands.js'
import {
  buildSessionFileChangeFallback,
  collectFileChangesForTurns,
  mergeSessionCommandsIntoTurns,
  revertTurnFileChanges,
} from './sessionRecovery.js'
import {
  deleteProjectCronAutomation,
  deleteThreadHeartbeatAutomation,
  listProjectCronAutomations,
  listThreadHeartbeatAutomations,
  readProjectCronAutomation,
  readProjectCronAutomations,
  readThreadHeartbeatAutomation,
  readThreadHeartbeatAutomations,
  writeProjectCronAutomation,
  writeThreadHeartbeatAutomation,
  type ThreadAutomationRecord,
} from './threadAutomations.js'
import {
  normalizePinnedThreadIds,
  normalizeStringArray,
  normalizeStringRecord,
  persistWorkspaceRoot,
  readFirstLaunchPluginsCardDismissed,
  readMergedThreadTitleCache,
  readPinnedThreadIds,
  readThreadTitleCache,
  readWorkspaceRootsState,
  removeFromThreadTitleCache,
  updateThreadTitleCache,
  updateWorkspaceRootsState,
  writeFirstLaunchPluginsCardDismissed,
  writePinnedThreadIds,
  writeThreadTitleCache,
} from './globalStateStore.js'
import { AppServerProcess, type StreamEventFrame } from './appServerProcess.js'
import {
  BackendQueueProcessor,
  appendThreadQueuedMessage,
  buildHeartbeatQueuedMessage,
  normalizeThreadQueueState,
  readThreadQueueState,
  writeThreadQueueState,
} from './backendQueueProcessor.js'
export { BackendQueueProcessor } from './backendQueueProcessor.js'
import { MethodCatalog } from './methodCatalog.js'
import { fetchConnectorLogo, handleFileUpload, proxyTranscribe } from './mediaProxyRoutes.js'
import { fetchCustomEndpointDefaultModel, normalizeProviderModelsData, readProviderBackedModelIds } from './providerModelDiscovery.js'
import { cloneGithubRepositoryIntoBase, createProjectlessThreadDirectory } from './projectCreation.js'
import { API_PERF_BODY_MB_THRESHOLD, API_PERF_LOGGING_ENABLED, API_PERF_MS_THRESHOLD, MB_DIVISOR, getChunkByteLength } from './apiPerfConfig.js'
import { buildThreadSearchIndex, isExactPhraseMatch, listFilesWithRipgrep, scoreFileCandidate, type ThreadSearchIndex } from './threadSearchIndex.js'
import { mergeSessionSkillInputsIntoThreadResult, sanitizeThreadTurnsInlinePayloads } from './threadInlinePayloads.js'
export { mergeSessionSkillInputsIntoTurns, sanitizeThreadTurnsInlinePayloads } from './threadInlinePayloads.js'

type JsonRpcCall = {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: {
    code: number
    message: string
  }
  method?: string
  params?: unknown
}

type RpcProxyRequest = {
  method: string
  params?: unknown
}

type RpcExecutor = {
  rpc: (method: string, params: unknown) => Promise<unknown>
}

type TelegramBridgeConfigState = {
  botToken: string
  chatIds: number[]
  allowedUserIds: Array<number | '*'>
}

type ServerRequestReply = {
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

type WorkspaceRootsState = {
  order: string[]
  labels: Record<string, string>
  active: string[]
  projectOrder: string[]
  remoteProjects: Array<{
    id: string
    hostId: string
    remotePath: string
    label: string
  }>
}

type PendingServerRequest = {
  id: number
  method: string
  params: unknown
  receivedAtIso: string
}

type ChatgptAuthTokensRefreshParams = {
  reason?: string
  previousAccountId?: string | null
}

type ChatgptAuthTokensRefreshResponse = {
  accessToken: string
  chatgptAccountId: string
  chatgptPlanType: string | null
}

const THREAD_RESPONSE_TURN_LIMIT = 10
const THREAD_TURN_PAGE_READ_CACHE_TTL_MS = 30_000
const THREAD_METHODS_WITH_TURNS = new Set(['thread/read', 'thread/resume', 'thread/fork', 'thread/rollback'])
const THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT = 100
const PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS = 100
const PROJECTLESS_THREAD_SLUG_MAX_LENGTH = 80
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function trimThreadTurnsInRpcResult(method: string, result: unknown): unknown {
  if (!THREAD_METHODS_WITH_TURNS.has(method)) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !turns || turns.length <= THREAD_RESPONSE_TURN_LIMIT) return result
  const startTurnIndex = Math.max(0, turns.length - THREAD_RESPONSE_TURN_LIMIT)

  return {
    ...record,
    threadTurnStartIndex: startTurnIndex,
    thread: {
      ...thread,
      turns: turns.slice(startTurnIndex),
    },
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }

  const record = asRecord(payload)
  if (!record) return fallback

  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error

  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) {
    return nestedError.message
  }

  return fallback
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function logProviderModelDiscoveryWarning(message: string, details: Record<string, unknown>): void {
  console.warn('[codex-provider-models]', message, details)
}

function isTimeoutError(payload: unknown): boolean {
  return payload instanceof Error && (payload.name === 'AbortError' || payload.name === 'TimeoutError')
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

function readThreadArchiveFallbackName(threadReadResult: unknown): string {
  const record = asRecord(threadReadResult)
  const thread = asRecord(record?.thread)
  return (
    readNonEmptyString(thread?.name)
    || readNonEmptyString(thread?.title)
    || readNonEmptyString(thread?.preview)
    || 'Untitled thread'
  )
}

function isArchivedThreadReadResult(threadReadResult: unknown): boolean {
  const record = asRecord(threadReadResult)
  const thread = asRecord(record?.thread)
  const sessionPath = readNonEmptyString(thread?.path)
  return sessionPath.split(/[\\/]+/u).includes('archived_sessions')
}

export async function callRpcWithArchiveRecovery(
  appServer: RpcExecutor,
  method: string,
  params: unknown,
): Promise<unknown> {
  try {
    return await appServer.rpc(method, params ?? null)
  } catch (error) {
    if (method !== 'thread/archive') {
      throw error
    }

    const paramsRecord = asRecord(params)
    const threadId = readNonEmptyString(paramsRecord?.threadId)
    const errorMessage = getErrorMessage(error, '')
    if (!threadId || !errorMessage.includes('no rollout found')) {
      throw error
    }

    let threadReadResult: unknown = null
    try {
      threadReadResult = await appServer.rpc('thread/read', {
        threadId,
        includeTurns: false,
      })
      if (isArchivedThreadReadResult(threadReadResult)) {
        return null
      }
    } catch {
      // If metadata cannot be read, still try materializing a title before retrying archive.
    }

    await appServer.rpc('thread/name/set', {
      threadId,
      name: readThreadArchiveFallbackName(threadReadResult),
    })
    return appServer.rpc(method, params ?? null)
  }
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getSkillsInstallDir(): string {
  return join(getCodexHomeDir(), 'skills')
}

function getPromptsDir(): string {
  return join(getCodexHomeDir(), 'prompts')
}

type ComposerPromptRecord = {
  name: string
  path: string
  content: string
  description: string
}

function promptNameToFileName(name: string): string {
  const trimmed = name.trim()
  const withoutExtension = trimmed.replace(/\.md$/i, '')
  const sanitized = withoutExtension
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${sanitized || 'prompt'}.md`
}

function buildPromptDescription(content: string): string {
  const firstNonEmptyLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''
  return firstNonEmptyLine.slice(0, 120)
}

async function listComposerPrompts(): Promise<ComposerPromptRecord[]> {
  const promptsDir = getPromptsDir()
  try {
    const entries = await readdir(promptsDir, { withFileTypes: true })
    const prompts = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map(async (entry) => {
        const promptPath = join(promptsDir, entry.name)
        const content = await readFile(promptPath, 'utf8')
        return {
          name: entry.name.replace(/\.md$/i, ''),
          path: promptPath,
          content,
          description: buildPromptDescription(content),
        } satisfies ComposerPromptRecord
      }))
    return prompts.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw error
  }
}

async function createComposerPromptFile(name: string, content: string): Promise<ComposerPromptRecord> {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Prompt name is required')
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Prompt content is required')
  const promptsDir = getPromptsDir()
  await mkdir(promptsDir, { recursive: true })

  const baseFileName = promptNameToFileName(trimmedName)
  let targetPath = join(promptsDir, baseFileName)
  let suffix = 2
  while (existsSync(targetPath)) {
    const nextFileName = `${baseFileName.replace(/\.md$/i, '')}-${suffix}.md`
    targetPath = join(promptsDir, nextFileName)
    suffix += 1
  }

  await writeFile(targetPath, `${trimmedContent}\n`, 'utf8')
  return {
    name: basename(targetPath).replace(/\.md$/i, ''),
    path: targetPath,
    content: `${trimmedContent}\n`,
    description: buildPromptDescription(trimmedContent),
  }
}

async function removeComposerPromptFile(promptPath: string): Promise<boolean> {
  const resolvedPath = resolve(promptPath)
  const promptsDir = resolve(getPromptsDir())
  const relative = resolvedPath.startsWith(`${promptsDir}/`) ? resolvedPath.slice(promptsDir.length + 1) : ''
  if (!relative || relative.includes('..') || !resolvedPath.toLowerCase().endsWith('.md')) {
    throw new Error('Invalid prompt path')
  }
  try {
    await rm(resolvedPath, { force: false })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false
    throw error
  }
}

async function runCommand(command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let closed = false
    const timeout =
      typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? setTimeout(() => {
          timedOut = true
          proc.kill('SIGTERM')
          setTimeout(() => {
            if (!closed) proc.kill('SIGKILL')
          }, 5_000).unref()
        }, options.timeoutMs)
        : null
    timeout?.unref()
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', (error) => {
      if (timeout) clearTimeout(timeout)
      reject(error)
    })
    proc.on('close', (code) => {
      closed = true
      if (timeout) clearTimeout(timeout)
      if (timedOut) {
        reject(new Error(`Command timed out after ${options.timeoutMs}ms (${command} ${args.join(' ')})`))
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      const suffix = details.length > 0 ? `: ${details}` : ''
      reject(new Error(`Command failed (${command} ${args.join(' ')})${suffix}`))
    })
  })
}

function isMissingHeadError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return (
    message.includes("not a valid object name: 'head'") ||
    message.includes('not a valid object name: head') ||
    message.includes('invalid reference: head')
  )
}

function isNotGitRepositoryError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('not a git repository') || message.includes('fatal: not a git repository')
}

async function ensureRepoHasInitialCommit(repoRoot: string): Promise<void> {
  const agentsPath = join(repoRoot, 'AGENTS.md')
  try {
    await stat(agentsPath)
  } catch {
    await writeFile(agentsPath, '', 'utf8')
  }

  await runCommand('git', ['add', 'AGENTS.md'], { cwd: repoRoot })
  await runCommand(
    'git',
    ['-c', 'user.name=Codex', '-c', 'user.email=codex@local', 'commit', '-m', 'Initialize repository for worktree support'],
    { cwd: repoRoot },
  )
}

async function runCommandCapture(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      const suffix = details.length > 0 ? `: ${details}` : ''
      reject(new Error(`Command failed (${command} ${args.join(' ')})${suffix}`))
    })
  })
}

function normalizeBranchRefName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('refs/heads/')) return trimmed.slice('refs/heads/'.length)
  if (trimmed.startsWith('refs/remotes/')) return trimmed.slice('refs/remotes/'.length)
  return trimmed
}

function toHeaderGitResetHistoryRef(branchName: string, commitSha: string): string {
  return `refs/codex/header-git-reset-history/${branchName}/${commitSha}`
}

const HEADER_GIT_RESET_HISTORY_REF_LIMIT = 25

async function assertLocalGitBranch(repoRoot: string, branchName: string): Promise<void> {
  await runCommandCapture('git', ['show-ref', '--verify', `refs/heads/${branchName}`], { cwd: repoRoot })
}

async function checkoutGitBranchWithWorktreeRecovery(repoRoot: string, branchName: string): Promise<void> {
  try {
    await runCommand('git', ['checkout', branchName], { cwd: repoRoot })
  } catch (checkoutError) {
    const blockingWorktreePath = extractBranchLockedWorktreePath(checkoutError, branchName)
    if (!blockingWorktreePath) {
      throw checkoutError
    }
    await runCommand('git', ['checkout', '--detach'], { cwd: blockingWorktreePath })
    await runCommand('git', ['checkout', branchName], { cwd: repoRoot })
  }
}

async function pruneHeaderGitResetHistoryRefs(repoRoot: string, branchName: string): Promise<void> {
  const resetHistoryRefPrefix = `refs/codex/header-git-reset-history/${branchName}/`
  const refsRaw = await runCommandCapture(
    'git',
    ['for-each-ref', '--sort=-creatordate', '--format=%(refname)', resetHistoryRefPrefix],
    { cwd: repoRoot },
  ).catch(() => '')
  const refs = refsRaw
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const staleRefs = refs.slice(HEADER_GIT_RESET_HISTORY_REF_LIMIT)
  for (const refName of staleRefs) {
    await runCommand('git', ['update-ref', '-d', refName], { cwd: repoRoot })
  }
}

async function readGitHeaderState(cwd: string): Promise<{
  currentBranch: string | null
  headSha: string | null
  headSubject: string | null
  headDate: string | null
  detached: boolean
  dirty: boolean
  gitRoot: string
}> {
  const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
  const currentBranchRaw = await runCommandCapture('git', ['branch', '--show-current'], { cwd: gitRoot })
  const currentBranch = currentBranchRaw.trim() || null
  const headShaRaw = await runCommandCapture('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: gitRoot })
  const headCommitRaw = await runCommandCapture('git', ['show', '-s', '--date=short', '--format=%cd%x09%s', 'HEAD'], { cwd: gitRoot })
  const [headDate = '', ...headSubjectParts] = headCommitRaw.split('\t')
  const statusRaw = await runCommandCapture('git', ['status', '--porcelain'], { cwd: gitRoot })
  return {
    currentBranch,
    headSha: headShaRaw.trim() || null,
    headSubject: headSubjectParts.join('\t').trim() || null,
    headDate: headDate.trim() || null,
    detached: !currentBranch,
    dirty: statusRaw.trim().length > 0,
    gitRoot,
  }
}

async function assertNoTrackedGitChanges(repoRoot: string): Promise<void> {
  const statusRaw = await runCommandCapture('git', ['status', '--porcelain'], { cwd: repoRoot })
  const trackedChanges = statusRaw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith('?? '))
  if (trackedChanges.length > 0) {
    throw new Error('Cannot switch branches or reset with tracked uncommitted changes. Commit, stash, or discard tracked changes first. Untracked files are allowed unless Git would overwrite them.')
  }
}

function extractBranchLockedWorktreePath(error: unknown, branchName: string): string {
  const message = getErrorMessage(error, '')
  if (!message || !branchName) return ''
  const escapedBranch = branchName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`'${escapedBranch}' is already checked out at '([^']+)'`, 'u')
  const match = pattern.exec(message)
  return match?.[1]?.trim() ?? ''
}

function toPermanentWorktreeBranchNameDraft(worktreeName: string): string {
  const sanitized = worktreeName
    .trim()
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/\.+/gu, '.')
    .replace(/-+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
  return sanitized || 'worktree'
}

async function isValidGitBranchName(gitRoot: string, branchName: string): Promise<boolean> {
  try {
    await runCommand('git', ['check-ref-format', '--branch', branchName], { cwd: gitRoot })
    return true
  } catch {
    return false
  }
}

async function doesLocalGitBranchExist(gitRoot: string, branchName: string): Promise<boolean> {
  try {
    await runCommand('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd: gitRoot })
    return true
  } catch {
    return false
  }
}

async function allocatePermanentWorktreeBranchName(gitRoot: string, worktreeName: string): Promise<string> {
  const base = toPermanentWorktreeBranchNameDraft(worktreeName)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    if (!await isValidGitBranchName(gitRoot, candidate)) continue
    if (!await doesLocalGitBranchExist(gitRoot, candidate)) return candidate
  }
  throw new Error('Failed to allocate a unique branch name for worktree')
}

async function runCommandWithOutput(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      const suffix = details.length > 0 ? `: ${details}` : ''
      reject(new Error(`Command failed (${command} ${args.join(' ')})${suffix}`))
    })
  })
}


function getCodexAuthPath(): string {
  return join(getCodexHomeDir(), 'auth.json')
}

type CodexAuth = {
  auth_mode?: string
  last_refresh?: number
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
    account_id?: string
  }
}

const CODEX_CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const DEFAULT_CODEX_REFRESH_TOKEN_URL = 'https://auth.openai.com/oauth/token'

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const parsed = JSON.parse(decoded) as unknown
    return asRecord(parsed)
  } catch {
    return null
  }
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  return decodeBase64UrlJson(parts[1] ?? '')
}

function extractChatgptTokenMetadata(accessToken: string | undefined): {
  chatgptAccountId: string | null
  chatgptPlanType: string | null
} {
  const payload = decodeJwtPayload(accessToken)
  const auth = asRecord(payload?.['https://api.openai.com/auth'])
  return {
    chatgptAccountId: readNonEmptyString(auth?.chatgpt_account_id) || null,
    chatgptPlanType: readNonEmptyString(auth?.chatgpt_plan_type) || null,
  }
}

function readTokenErrorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload)
  const message = readNonEmptyString(record?.message)
  if (message) return message
  const error = record?.error
  if (typeof error === 'string' && error.trim().length > 0) return error.trim()
  const nestedError = asRecord(error)
  return readNonEmptyString(nestedError?.message)
    || readNonEmptyString(nestedError?.error_description)
    || readNonEmptyString(record?.error_description)
    || fallback
}

function readTokenResponseString(payload: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!payload) return null
  for (const key of keys) {
    const value = readNonEmptyString(payload[key])
    if (value) return value
  }
  return null
}

export async function refreshChatgptAuthTokensForExternalAuth(
  params: ChatgptAuthTokensRefreshParams = {},
): Promise<ChatgptAuthTokensRefreshResponse> {
  const authPath = getCodexAuthPath()
  const raw = await readFile(authPath, 'utf8')
  const auth = JSON.parse(raw) as CodexAuth
  const currentRefreshToken = auth.tokens?.refresh_token?.trim() ?? ''
  if (!currentRefreshToken) {
    throw new Error('No ChatGPT refresh token is available. Please sign in again.')
  }

  const refreshUrl = process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE?.trim() || DEFAULT_CODEX_REFRESH_TOKEN_URL
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: currentRefreshToken,
    client_id: CODEX_CHATGPT_CLIENT_ID,
  })

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(25_000),
  })

  const text = await response.text()
  let payload: Record<string, unknown> | null = null
  try {
    payload = asRecord(JSON.parse(text))
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(readTokenErrorMessage(payload, `ChatGPT token refresh failed with HTTP ${String(response.status)}`))
  }

  const accessToken = readTokenResponseString(payload, 'access_token', 'accessToken')
  if (!accessToken) {
    throw new Error('ChatGPT token refresh response did not include an access token.')
  }

  const nextRefreshToken = readTokenResponseString(payload, 'refresh_token', 'refreshToken') ?? currentRefreshToken
  const nextIdToken = readTokenResponseString(payload, 'id_token', 'idToken') ?? auth.tokens?.id_token
  const metadata = extractChatgptTokenMetadata(accessToken)
  const chatgptAccountId =
    metadata.chatgptAccountId
    || readTokenResponseString(payload, 'chatgpt_account_id', 'chatgptAccountId')
    || readNonEmptyString(params.previousAccountId)
    || readNonEmptyString(auth.tokens?.account_id)
  if (!chatgptAccountId) {
    throw new Error('ChatGPT token refresh response did not include account metadata.')
  }

  const nextAuth: CodexAuth = {
    ...auth,
    auth_mode: auth.auth_mode || 'chatgpt',
    last_refresh: Date.now(),
    tokens: {
      ...auth.tokens,
      access_token: accessToken,
      refresh_token: nextRefreshToken,
      account_id: chatgptAccountId,
      ...(nextIdToken ? { id_token: nextIdToken } : {}),
    },
  }
  await writeFile(authPath, JSON.stringify(nextAuth, null, 2), { encoding: 'utf8', mode: 0o600 })

  return {
    accessToken,
    chatgptAccountId,
    chatgptPlanType: metadata.chatgptPlanType,
  }
}

async function readCodexAuth(): Promise<{ accessToken: string; accountId?: string } | null> {
  try {
    const raw = await readFile(getCodexAuthPath(), 'utf8')
    const auth = JSON.parse(raw) as CodexAuth
    const token = auth.tokens?.access_token
    if (!token) return null
    return { accessToken: token, accountId: auth.tokens?.account_id ?? undefined }
  } catch {
    return null
  }
}

function hasUsableCodexAuthSync(): boolean {
  try {
    const raw = readFileSync(getCodexAuthPath(), 'utf8')
    const auth = JSON.parse(raw) as CodexAuth
    return Boolean(auth.tokens?.access_token?.trim())
  } catch {
    return false
  }
}

function readFreeModeStateSync(statePath: string): FreeModeState | null {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as FreeModeState
  } catch {
    return null
  }
}

function ensureDefaultFreeModeStateForMissingAuthSync(statePath: string): FreeModeState | null {
  const current = readFreeModeStateSync(statePath)
  if (!shouldCreateDefaultFreeModeStateForMissingAuth(current, hasUsableCodexAuthSync())) {
    return current
  }

  const fallback = createDefaultOpenCodeZenFreeModeState()

  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, JSON.stringify(fallback), { encoding: 'utf8', mode: 0o600 })
  return fallback
}

function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false
  const normalized = remoteAddress.startsWith('::ffff:')
    ? remoteAddress.slice('::ffff:'.length)
    : remoteAddress
  return normalized === '127.0.0.1' || normalized === '::1'
}

function getCodexGlobalStatePath(): string {
  return join(getCodexHomeDir(), '.codex-global-state.json')
}

function getTelegramBridgeConfigPath(): string {
  return join(getCodexHomeDir(), 'telegram-bridge.json')
}

function getCodexSessionIndexPath(): string {
  return join(getCodexHomeDir(), 'session_index.jsonl')
}

function getCodexAutomationsDir(): string {
  return join(getCodexHomeDir(), 'automations')
}

async function rollbackCreatedWorktree(
  gitRoot: string,
  worktreeCwd: string,
  cleanupDirectory?: string,
  branchName?: string,
): Promise<void> {
  try {
    await runCommand('git', ['worktree', 'remove', '--force', worktreeCwd], { cwd: gitRoot })
  } catch {
    await rm(worktreeCwd, { recursive: true, force: true }).catch(() => undefined)
  }

  if (cleanupDirectory && cleanupDirectory !== worktreeCwd) {
    await rm(cleanupDirectory, { recursive: true, force: true }).catch(() => undefined)
  }

  if (branchName) {
    await runCommand('git', ['branch', '-D', branchName], { cwd: gitRoot }).catch(() => undefined)
  }
}

function normalizeTelegramBridgeConfig(value: unknown): TelegramBridgeConfigState {
  const record = asRecord(value)
  if (!record) return { botToken: '', chatIds: [], allowedUserIds: [] }
  const botToken = typeof record.botToken === 'string' ? record.botToken.trim() : ''
  const rawChatIds = Array.isArray(record.chatIds) ? record.chatIds : []
  const chatIds = Array.from(new Set(rawChatIds
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((value) => Math.trunc(value)))).slice(0, 50)
  const rawAllowedUserIds = Array.isArray(record.allowedUserIds) ? record.allowedUserIds : []
  const allowAllUsers = rawAllowedUserIds.some((value) => typeof value === 'string' && value.trim() === '*')
  const normalizedAllowedUserIds = Array.from(new Set(rawAllowedUserIds
    .map((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
      if (typeof value === 'string') {
        const normalized = value.trim().replace(/^(telegram|tg):/i, '').trim()
        if (/^-?\d+$/.test(normalized)) {
          return Number.parseInt(normalized, 10)
        }
      }
      return Number.NaN
    })
    .filter((value) => Number.isFinite(value)))).slice(0, 100)
  const allowedUserIds: Array<number | '*'> = allowAllUsers
    ? ['*' as const, ...normalizedAllowedUserIds]
    : normalizedAllowedUserIds
  return { botToken, chatIds, allowedUserIds }
}

async function readTelegramBridgeConfig(): Promise<TelegramBridgeConfigState> {
  const telegramConfigPath = getTelegramBridgeConfigPath()
  try {
    const raw = await readFile(telegramConfigPath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeTelegramBridgeConfig(payload)
  } catch {
    return { botToken: '', chatIds: [], allowedUserIds: [] }
  }
}

async function writeTelegramBridgeConfig(nextState: TelegramBridgeConfigState): Promise<void> {
  const normalized = normalizeTelegramBridgeConfig(nextState)
  const telegramConfigPath = getTelegramBridgeConfigPath()
  await writeFile(telegramConfigPath, JSON.stringify({
    botToken: normalized.botToken,
    chatIds: normalized.chatIds,
    allowedUserIds: normalized.allowedUserIds,
  }), 'utf8')
}

let telegramBridgeConfigMutation: Promise<void> = Promise.resolve()

function rememberTelegramChatId(chatId: number): Promise<void> {
  const normalizedChatId = Math.trunc(chatId)
  if (!Number.isFinite(normalizedChatId)) return Promise.resolve()

  telegramBridgeConfigMutation = telegramBridgeConfigMutation.then(async () => {
    const current = await readTelegramBridgeConfig()
    if (current.chatIds.includes(normalizedChatId)) return
    const next = {
      ...current,
      chatIds: [normalizedChatId, ...current.chatIds].slice(0, 50),
    }
    await writeTelegramBridgeConfig(next)
  })
  return telegramBridgeConfigMutation
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req)
  if (raw.length === 0) return null
  const text = raw.toString('utf8').trim()
  if (text.length === 0) return null
  return JSON.parse(text) as unknown
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

type CodexBridgeMiddleware = ((req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>) & {
  dispose: () => void
  subscribeNotifications: (listener: (value: { method: string; params: unknown; atIso: string }) => void) => () => void
}

type SharedBridgeState = {
  version: string
  appServer: AppServerProcess
  terminalManager: ThreadTerminalManager
  methodCatalog: MethodCatalog
  telegramBridge: TelegramThreadBridge
  backendQueueProcessor: BackendQueueProcessor
}

const SHARED_BRIDGE_KEY = '__codexRemoteSharedBridge__'
const SHARED_BRIDGE_VERSION = 'experimental-api-v2'

function getSharedBridgeState(): SharedBridgeState {
  const globalScope = globalThis as typeof globalThis & {
    [SHARED_BRIDGE_KEY]?: SharedBridgeState
  }

  const existing = globalScope[SHARED_BRIDGE_KEY]
  if (existing) {
    if (existing.version === SHARED_BRIDGE_VERSION && existing.terminalManager) {
      return existing
    }
    existing.appServer.dispose()
    existing.backendQueueProcessor?.dispose()
    existing.terminalManager?.dispose()
  }

  const appServer = new AppServerProcess()
  const terminalManager = new ThreadTerminalManager()
  const backendQueueProcessor = new BackendQueueProcessor(appServer)
  const created: SharedBridgeState = {
    version: SHARED_BRIDGE_VERSION,
    appServer,
    terminalManager,
    methodCatalog: new MethodCatalog(),
    backendQueueProcessor,
    telegramBridge: new TelegramThreadBridge(appServer, {
      onChatSeen: (chatId) => {
        void rememberTelegramChatId(chatId).catch(() => {})
      },
    }),
  }
  globalScope[SHARED_BRIDGE_KEY] = created
  return created
}

export function createCodexBridgeMiddleware(): CodexBridgeMiddleware {
  const { appServer, terminalManager, methodCatalog, telegramBridge, backendQueueProcessor } = getSharedBridgeState()
  let threadSearchIndex: ThreadSearchIndex | null = null
  let threadSearchIndexPromise: Promise<ThreadSearchIndex> | null = null

  async function getThreadSearchIndex(): Promise<ThreadSearchIndex> {
    if (threadSearchIndex) return threadSearchIndex
    if (!threadSearchIndexPromise) {
      threadSearchIndexPromise = buildThreadSearchIndex(appServer)
        .then((index) => {
          threadSearchIndex = index
          return index
        })
        .finally(() => {
          threadSearchIndexPromise = null
        })
    }
    return threadSearchIndexPromise
  }
  void initializeSkillsSyncOnStartup(appServer)
  void readTelegramBridgeConfig()
    .then((config) => {
      if (!config.botToken) return
      telegramBridge.configureToken(config.botToken)
      telegramBridge.configureAllowedUserIds(config.allowedUserIds)
      telegramBridge.start()
    })
    .catch(() => {})

  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const requestStartNs = process.hrtime.bigint()
    const rawUrl = req.url ?? ''
    const parsedRequestUrl = rawUrl ? new URL(rawUrl, 'http://localhost') : null
    const requestPath = parsedRequestUrl?.pathname ?? ''
    const requestMethod = req.method ?? 'UNKNOWN'
    const rawContentLength = Array.isArray(req.headers['content-length'])
      ? req.headers['content-length'][0]
      : req.headers['content-length']
    const parsedContentLength = rawContentLength ? Number.parseInt(rawContentLength, 10) : NaN
    let requestBodyBytes: number | null = Number.isFinite(parsedContentLength) && parsedContentLength >= 0
      ? parsedContentLength
      : null
    let responseBodyBytes = 0
    let rpcMethod: string | null = null
    const originalWrite = res.write.bind(res)
    const originalEnd = res.end.bind(res)
    res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
      const resolvedEncoding = typeof encoding === 'string' ? encoding as BufferEncoding : undefined
      responseBodyBytes += getChunkByteLength(chunk, resolvedEncoding)
      return originalWrite(chunk as never, encoding as never, cb as never)
    }) as typeof res.write
    res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
      const resolvedEncoding = typeof encoding === 'string' ? encoding as BufferEncoding : undefined
      responseBodyBytes += getChunkByteLength(chunk, resolvedEncoding)
      return originalEnd(chunk as never, encoding as never, cb as never)
    }) as typeof res.end
    let didLog = false
    const logApiRequestDuration = () => {
      if (!API_PERF_LOGGING_ENABLED || didLog || !requestPath.startsWith('/codex-api/')) return
      const durationMs = Number((process.hrtime.bigint() - requestStartNs) / 1_000_000n)
      const requestBytes = requestBodyBytes ?? 0
      const bodyMbValue = (requestBytes + responseBodyBytes) / MB_DIVISOR
      const shouldLog = durationMs > API_PERF_MS_THRESHOLD || bodyMbValue > API_PERF_BODY_MB_THRESHOLD
      if (!shouldLog) return
      didLog = true
      const rpcPart = rpcMethod ? `, rpcMethod=${rpcMethod}` : ''
      console.info(`[codex-api-perf] ${requestMethod} ${requestPath} -> ${res.statusCode} (${durationMs}ms, bodyMB=${bodyMbValue.toFixed(1)}${rpcPart})`)
    }
    res.once('finish', logApiRequestDuration)
    res.once('close', logApiRequestDuration)

    try {
      if (!req.url) {
        next()
        return
      }

      const url = new URL(req.url, 'http://localhost')

      if (url.pathname === '/codex-api/zen-proxy/v1/responses' && req.method === 'POST') {
        if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
          setJson(res, 403, { error: 'Zen proxy is only available from localhost' })
          return
        }
        const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
        let bearerToken = ''
        let wireApi: 'responses' | 'chat' = 'chat'
        try {
          const state = JSON.parse(readFileSync(statePath, 'utf8')) as FreeModeState
          bearerToken = state.apiKey ?? ''
          wireApi = state.wireApi === 'responses' ? 'responses' : 'chat'
        } catch { /* use empty */ }
        handleZenProxyRequest(req, res, bearerToken, wireApi)
        return
      }

      if (url.pathname === '/codex-api/openrouter-proxy/v1/responses' && req.method === 'POST') {
        const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
        let bearerToken = ''
        let wireApi: 'responses' | 'chat' = 'responses'
        try {
          const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)
          bearerToken = state?.apiKey ?? ''
          wireApi = state?.wireApi === 'chat' ? 'chat' : 'responses'
        } catch { /* use empty */ }
        handleOpenRouterProxyRequest(req, res, bearerToken, wireApi)
        return
      }

      if (url.pathname === '/codex-api/custom-proxy/v1/responses' && req.method === 'POST') {
        const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
        let bearerToken = ''
        let wireApi: 'responses' | 'chat' = 'responses'
        let baseUrl = ''
        try {
          const state = JSON.parse(readFileSync(statePath, 'utf8')) as FreeModeState
          bearerToken = state.apiKey ?? ''
          wireApi = state.wireApi === 'chat' ? 'chat' : 'responses'
          baseUrl = state.customBaseUrl ?? ''
        } catch { /* use empty */ }
        handleCustomEndpointProxyRequest(req, res, { baseUrl, bearerToken, wireApi })
        return
      }

      if (url.pathname.startsWith('/codex-api/free-mode')) {
        const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)

        function readFreeModeState(): FreeModeState {
          return ensureDefaultFreeModeStateForMissingAuthSync(statePath)
            ?? { enabled: false, apiKey: null, model: FREE_MODE_DEFAULT_MODEL }
        }

        if (req.method === 'POST' && url.pathname === '/codex-api/free-mode') {
          try {
            const body = await readJsonBody(req) as Record<string, unknown> | null
            const enable = Boolean(body?.enable)

            if (enable) {
              const apiKey = getRandomFreeKey()
              if (!apiKey) {
                setJson(res, 500, { error: 'No free keys available' })
                return
              }

              const prev = readFreeModeState()
              const prevKeys = prev.providerKeys ?? {}
              if (prev.provider && prev.apiKey) {
                prevKeys[prev.provider] = prev.apiKey
              }
              const state: FreeModeState = {
                enabled: true,
                apiKey,
                model: FREE_MODE_DEFAULT_MODEL,
                provider: 'openrouter',
                wireApi: prev.wireApi === 'chat' ? 'chat' : 'responses',
                providerKeys: prevKeys,
              }
              await writeFile(statePath, JSON.stringify(state), 'utf8')
              appServer.dispose()
              const freeModels = await getFreeModels()
              setJson(res, 200, {
                ok: true,
                enabled: true,
                model: FREE_MODE_DEFAULT_MODEL,
                keyCount: getFreeKeyCount(),
                models: freeModels,
              })
            } else {
              const prev = readFreeModeState()
              const prevKeys = prev.providerKeys ?? {}
              if (prev.provider && prev.apiKey) {
                prevKeys[prev.provider] = prev.apiKey
              }
              const state: FreeModeState = {
                enabled: false,
                apiKey: null,
                model: FREE_MODE_DEFAULT_MODEL,
                wireApi: prev.wireApi === 'chat' ? 'chat' : 'responses',
                providerKeys: prevKeys,
              }
              await writeFile(statePath, JSON.stringify(state), 'utf8')
              appServer.dispose()
              setJson(res, 200, { ok: true, enabled: false })
            }
          } catch (error) {
            setJson(res, 500, { error: getErrorMessage(error, 'Failed to toggle free mode') })
          }
          return
        }

        if (req.method === 'GET' && url.pathname === '/codex-api/free-mode/status') {
          try {
            const state = readFreeModeState()
            const maskedKey = state.apiKey && state.customKey
              ? state.apiKey.substring(0, 12) + '...' + state.apiKey.substring(state.apiKey.length - 4)
              : null
            refreshFreeModelsInBackground()
            setJson(res, 200, {
              enabled: state.enabled,
              keyCount: getFreeKeyCount(),
              models: getCachedFreeModels(),
              currentModel: state.enabled ? state.model : null,
              customKey: Boolean(state.customKey),
              maskedKey,
              provider: state.provider ?? 'openrouter',
              customBaseUrl: state.customBaseUrl ?? null,
              wireApi: state.wireApi ?? null,
            })
          } catch (error) {
            setJson(res, 500, { error: getErrorMessage(error, 'Failed to read free mode status') })
          }
          return
        }

        if (req.method === 'POST' && url.pathname === '/codex-api/free-mode/rotate-key') {
          try {
            const apiKey = getRandomFreeKey()
            if (!apiKey) {
              setJson(res, 500, { error: 'No free keys available' })
              return
            }
            const current = readFreeModeState()
            const state: FreeModeState = { ...current, apiKey, customKey: false }
            await writeFile(statePath, JSON.stringify(state), 'utf8')
            appServer.dispose()
            setJson(res, 200, { ok: true })
          } catch (error) {
            setJson(res, 500, { error: getErrorMessage(error, 'Failed to rotate key') })
          }
          return
        }

        if (req.method === 'POST' && url.pathname === '/codex-api/free-mode/custom-key') {
          try {
            const body = await readJsonBody(req) as Record<string, unknown> | null
            const key = typeof body?.key === 'string' ? body.key.trim() : ''
            const current = readFreeModeState()

            if (key.length > 0) {
              const state: FreeModeState = {
                ...current,
                enabled: true,
                apiKey: key,
                customKey: true,
                provider: 'openrouter',
                wireApi: current.wireApi === 'chat' ? 'chat' : 'responses',
              }
              await writeFile(statePath, JSON.stringify(state), 'utf8')
              appServer.dispose()
              setJson(res, 200, { ok: true, customKey: true })
            } else {
              const communityKey = getRandomFreeKey()
              const state: FreeModeState = {
                ...current,
                apiKey: communityKey,
                customKey: false,
                provider: 'openrouter',
                wireApi: current.wireApi === 'chat' ? 'chat' : 'responses',
              }
              await writeFile(statePath, JSON.stringify(state), 'utf8')
              appServer.dispose()
              setJson(res, 200, { ok: true, customKey: false })
            }
          } catch (error) {
            setJson(res, 500, { error: getErrorMessage(error, 'Failed to set custom key') })
          }
          return
        }

        if (req.method === 'POST' && url.pathname === '/codex-api/free-mode/custom-provider') {
          try {
            const body = await readJsonBody(req) as Record<string, unknown> | null
            const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : ''
            const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
            const wireApi = body?.wireApi === 'chat' ? 'chat' as const : 'responses' as const
            const providerType = body?.provider === 'opencode-zen'
              ? 'opencode-zen' as const
              : body?.provider === 'openrouter'
                ? 'openrouter' as const
                : 'custom' as const
            if (providerType === 'custom' && !baseUrl) {
              setJson(res, 400, { error: 'baseUrl is required' })
              return
            }
            const current = readFreeModeState()
            const prevKeys = current.providerKeys ?? {}
            if (current.provider && current.apiKey) {
              prevKeys[current.provider] = current.apiKey
            }
            const resolvedKey = apiKey || prevKeys[providerType] || ''
            if (resolvedKey) {
              prevKeys[providerType] = resolvedKey
            }
            const resolvedModel = providerType === 'openrouter'
              ? (current.model || FREE_MODE_DEFAULT_MODEL)
              : providerType === 'custom'
                ? await fetchCustomEndpointDefaultModel(baseUrl, resolvedKey)
                : ''
            const state: FreeModeState = {
              enabled: true,
              apiKey: resolvedKey,
              model: resolvedModel,
              customKey: providerType === 'openrouter' ? current.customKey : true,
              provider: providerType,
              customBaseUrl: providerType === 'custom' ? baseUrl : undefined,
              wireApi,
              providerKeys: prevKeys,
            }
            await writeFile(statePath, JSON.stringify(state), 'utf8')
            appServer.dispose()
            setJson(res, 200, { ok: true })
          } catch (error) {
            setJson(res, 500, { error: getErrorMessage(error, 'Failed to set custom provider') })
          }
          return
        }

        next()
        return
      }

      if (await handleAccountRoutes(req, res, url, { appServer })) {
        return
      }

      if (await handleSkillsRoutes(req, res, url, { appServer, readJsonBody })) {
        return
      }

      if (await handleReviewRoutes(req, res, url, { readJsonBody })) {
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-terminal/status') {
        setJson(res, 200, terminalManager.getAvailability())
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-terminal/quick-commands') {
        const cwd = url.searchParams.get('cwd')?.trim() ?? ''
        if (!cwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        try {
          setJson(res, 200, { commands: await listTerminalQuickCommands(cwd) })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to load terminal quick commands') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-terminal/attach') {
        const availability = terminalManager.getAvailability()
        if (!availability.available) {
          setJson(res, 503, { error: availability.reason || 'Integrated terminal is unavailable on this host' })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const threadId = readNonEmptyString(body?.threadId)
        const cwd = readNonEmptyString(body?.cwd)
        if (!threadId || !cwd) {
          setJson(res, 400, { error: 'Missing threadId or cwd' })
          return
        }
        const session = terminalManager.attach({
          threadId,
          cwd,
          sessionId: readNonEmptyString(body?.sessionId) || undefined,
          cols: typeof body?.cols === 'number' ? body.cols : undefined,
          rows: typeof body?.rows === 'number' ? body.rows : undefined,
          newSession: body?.newSession === true,
        })
        setJson(res, 200, { session })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-terminal/input') {
        const availability = terminalManager.getAvailability()
        if (!availability.available) {
          setJson(res, 503, { error: availability.reason || 'Integrated terminal is unavailable on this host' })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const sessionId = readNonEmptyString(body?.sessionId)
        const data = typeof body?.data === 'string' ? body.data : ''
        if (!sessionId) {
          setJson(res, 400, { error: 'Missing sessionId' })
          return
        }
        terminalManager.write(sessionId, data)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-terminal/resize') {
        const availability = terminalManager.getAvailability()
        if (!availability.available) {
          setJson(res, 503, { error: availability.reason || 'Integrated terminal is unavailable on this host' })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const sessionId = readNonEmptyString(body?.sessionId)
        if (!sessionId) {
          setJson(res, 400, { error: 'Missing sessionId' })
          return
        }
        terminalManager.resize(sessionId, body?.cols, body?.rows)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-terminal/close') {
        const availability = terminalManager.getAvailability()
        if (!availability.available) {
          setJson(res, 503, { error: availability.reason || 'Integrated terminal is unavailable on this host' })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const sessionId = readNonEmptyString(body?.sessionId)
        if (!sessionId) {
          setJson(res, 400, { error: 'Missing sessionId' })
          return
        }
        terminalManager.close(sessionId)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-terminal-snapshot') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        setJson(res, 200, { session: terminalManager.getSnapshotForThread(threadId) })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/upload-file') {
        handleFileUpload(req, res)
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/rpc') {
        const payload = await readJsonBody(req)
        const body = asRecord(payload) as RpcProxyRequest | null
        if (payload !== null && payload !== undefined) {
          requestBodyBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
        }
        rpcMethod = body?.method && typeof body.method === 'string' ? body.method : null

        if (!body || typeof body.method !== 'string' || body.method.length === 0) {
          setJson(res, 400, { error: 'Invalid body: expected { method, params? }' })
          return
        }

        const rpcResult = await callRpcWithArchiveRecovery(appServer, body.method, body.params ?? null)
        const trimmedResult = trimThreadTurnsInRpcResult(body.method, rpcResult)
        const sanitizedResult = await sanitizeThreadTurnsInlinePayloads(body.method, trimmedResult)
        const result = THREAD_METHODS_WITH_TURNS.has(body.method)
          ? await mergeSessionSkillInputsIntoThreadResult(sanitizedResult)
          : sanitizedResult

        if (THREAD_METHODS_WITH_TURNS.has(body.method)) {
          const rpcRecord = asRecord(result)
          const rpcThread = asRecord(rpcRecord?.thread)
          const rpcThreadId = typeof rpcThread?.id === 'string' ? rpcThread.id : ''
          if (rpcThreadId) {
            appServer.storeThreadReadSnapshot(rpcThreadId, result)
          }
        }

        setJson(res, 200, { result })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-turn-page') {
        try {
          const threadId = url.searchParams.get('threadId')?.trim() ?? ''
          const beforeTurnId = url.searchParams.get('beforeTurnId')?.trim() ?? ''
          const limitRaw = url.searchParams.get('limit')?.trim() ?? String(THREAD_RESPONSE_TURN_LIMIT)
          const limit = Math.max(1, Math.min(50, Number.parseInt(limitRaw, 10) || THREAD_RESPONSE_TURN_LIMIT))
          if (!threadId) {
            setJson(res, 400, { error: 'Missing threadId' })
            return
          }

          const threadReadResult = await appServer.readThreadForTurnPage(threadId)
          const record = asRecord(threadReadResult)
          const thread = asRecord(record?.thread)
          if (!record || !thread) {
            setJson(res, 502, { error: 'thread/read returned an invalid thread response' })
            return
          }

          const turns = Array.isArray(thread.turns) ? thread.turns : []
          const beforeIndex = beforeTurnId
            ? turns.findIndex((turn) => asRecord(turn)?.id === beforeTurnId)
            : turns.length
          if (beforeTurnId && beforeIndex < 0) {
            setJson(res, 200, {
              result: {
                ...record,
                thread: {
                  ...thread,
                  turns: [],
                },
              },
              startTurnIndex: 0,
              hasMoreOlder: false,
            })
            return
          }

          const endIndex = beforeIndex
          const startIndex = Math.max(0, endIndex - limit)
          const pageTurns = turns.slice(startIndex, endIndex)
          const pagedResult = {
            ...record,
            thread: {
              ...thread,
              turns: pageTurns,
            },
          }
          const sanitized = await sanitizeThreadTurnsInlinePayloads('thread/read', pagedResult)
          const result = await mergeSessionSkillInputsIntoThreadResult(sanitized)

          setJson(res, 200, {
            result,
            startTurnIndex: startIndex,
            hasMoreOlder: startIndex > 0,
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to load earlier thread messages') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-file-change-fallback') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }

        const threadReadResult = await appServer.rpc('thread/read', {
          threadId,
          includeTurns: true,
        })
        const threadReadRecord = asRecord(threadReadResult)
        const threadRecord = asRecord(threadReadRecord?.thread)
        const sessionPath = readNonEmptyString(threadRecord?.path)
        if (!sessionPath || !isAbsolute(sessionPath)) {
          setJson(res, 200, { data: [] })
          return
        }

        try {
          const sessionLogRaw = await readFile(sessionPath, 'utf8')
          setJson(res, 200, { data: buildSessionFileChangeFallback(threadReadResult, sessionLogRaw) })
        } catch {
          setJson(res, 200, { data: [] })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-stream-events') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        const limitRaw = url.searchParams.get('limit')?.trim() ?? '80'
        const limit = Math.max(1, Math.min(400, Number.parseInt(limitRaw, 10) || 80))
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        const events = appServer.getStreamEvents(threadId, limit)
        setJson(res, 200, { events })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-live-state') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }

        try {
          const threadReadResult = await appServer.rpc('thread/read', {
            threadId,
            includeTurns: true,
          })
          const sanitized = await sanitizeThreadTurnsInlinePayloads('thread/read', threadReadResult)
          appServer.storeThreadReadSnapshot(threadId, sanitized)

          const record = asRecord(sanitized)
          const thread = asRecord(record?.thread)
          const rawTurns = Array.isArray(thread?.turns) ? thread.turns : []

          const sessionPath = readNonEmptyString(thread?.path)
          let sessionSize = 0
          if (sessionPath && isAbsolute(sessionPath)) {
            try {
              const s = await stat(sessionPath)
              sessionSize = s.size
            } catch { /* missing */ }
          }

          const cached = appServer.getCachedLiveState(threadId, rawTurns.length, sessionSize)
          if (cached) {
            setJson(res, 200, cached)
            return
          }

          let turns = appServer.mergeItemsIntoTurns(threadId, rawTurns)

          if (sessionPath && isAbsolute(sessionPath) && sessionSize > 0) {
            try {
              const sessionLogRaw = await readFile(sessionPath, 'utf8')
              turns = mergeSessionCommandsIntoTurns(turns, sessionLogRaw)
            } catch {
              // Session log not available — continue without command recovery
            }
          }

          const lastTurn = turns.length > 0 ? asRecord(turns[turns.length - 1]) : null
          const isInProgress = lastTurn?.status === 'inProgress'

          const responseData = {
            threadId,
            conversationState: {
              turns,
            },
            ownerClientId: null,
            liveStateError: null,
            isInProgress,
          }

          if (!isInProgress) {
            appServer.cacheLiveState(threadId, responseData, rawTurns.length, sessionSize)
          }

          setJson(res, 200, responseData)
        } catch (error) {
          const snapshot = appServer.getLastThreadReadSnapshot(threadId)
          if (snapshot) {
            const record = asRecord(snapshot)
            const thread = asRecord(record?.thread)
            const rawTurns = Array.isArray(thread?.turns) ? thread.turns : []
            const turns = appServer.mergeItemsIntoTurns(threadId, rawTurns)
            setJson(res, 200, {
              threadId,
              conversationState: { turns },
              ownerClientId: null,
              liveStateError: {
                kind: 'readFailed',
                message: getErrorMessage(error, 'thread/read failed'),
              },
              isInProgress: false,
            })
          } else {
            setJson(res, 200, {
              threadId,
              conversationState: null,
              ownerClientId: null,
              liveStateError: {
                kind: 'readFailed',
                message: getErrorMessage(error, 'thread/read failed'),
              },
              isInProgress: false,
            })
          }
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread/rollback-files') {
        try {
          const body = asRecord(await readJsonBody(req))
          const threadId = readNonEmptyString(body?.threadId)
          const turnId = readNonEmptyString(body?.turnId)
          const cwd = readNonEmptyString(body?.cwd)
          if (!threadId || !turnId || !cwd) {
            setJson(res, 400, { error: 'Missing threadId, turnId, or cwd' })
            return
          }

          const threadReadResult = await appServer.rpc('thread/read', { threadId, includeTurns: true })
          const record = asRecord(threadReadResult)
          const thread = asRecord(record?.thread)
          const turns = Array.isArray(thread?.turns) ? thread.turns : []
          const sessionPath = readNonEmptyString(thread?.path)

          if (!sessionPath || !isAbsolute(sessionPath)) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No session log available' })
            return
          }

          let foundTurnIndex = -1
          const turnIdsToRevert = new Set<string>()
          for (let i = 0; i < turns.length; i++) {
            const turnRecord = asRecord(turns[i])
            const id = readNonEmptyString(turnRecord?.id)
            if (id === turnId) {
              foundTurnIndex = i
            }
            if (foundTurnIndex >= 0 && id) {
              turnIdsToRevert.add(id)
            }
          }

          if (turnIdsToRevert.size === 0) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No turns to revert' })
            return
          }

          let sessionLogRaw: string
          try {
            sessionLogRaw = await readFile(sessionPath, 'utf8')
          } catch {
            setJson(res, 200, { reverted: 0, errors: ['Could not read session log'], message: 'Session log unreadable' })
            return
          }

          const turnInfos = collectFileChangesForTurns(sessionLogRaw, turnIdsToRevert, cwd)
          if (turnInfos.size === 0) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No file changes to revert' })
            return
          }

          const result = await revertTurnFileChanges(cwd, turnInfos, { runCommand, runCommandCapture })
          setJson(res, 200, { ...result, message: `Reverted ${result.reverted} file change(s)` })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to revert file changes') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/transcribe') {
        const auth = await readCodexAuth()
        if (!auth) {
          setJson(res, 401, { error: 'No auth token available for transcription' })
          return
        }

        const rawBody = await readRawBody(req)
        const incomingCt = req.headers['content-type'] ?? 'application/octet-stream'
        const upstream = await proxyTranscribe(rawBody, incomingCt, auth.accessToken, auth.accountId)

        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(upstream.body)
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/composio/status') {
        try {
          setJson(res, 200, await readComposioStatus())
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Composio status') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/composio/connectors') {
        try {
          const query = url.searchParams.get('query') ?? ''
          const cursor = url.searchParams.get('cursor')?.trim() ?? null
          const limit = parseComposioLimit(url.searchParams.get('limit'))
          setJson(res, 200, await listComposioConnectors(query, cursor, limit))
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to list Composio connectors') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/composio/connector') {
        try {
          const slug = url.searchParams.get('slug') ?? ''
          setJson(res, 200, await readComposioConnectorDetail(slug))
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to load Composio connector') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/composio/link') {
        try {
          const payload = asRecord(await readJsonBody(req))
          const slug = readNonEmptyString(payload?.slug)
          setJson(res, 200, await startComposioLink(slug))
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to start Composio login') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/composio/login') {
        try {
          setJson(res, 200, await startComposioLogin())
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to start Composio CLI login') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/composio/install') {
        try {
          setJson(res, 200, await installComposioCli())
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to install Composio CLI') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/connector-logo') {
        const src = url.searchParams.get('src')?.trim() ?? ''
        if (!src) {
          setJson(res, 400, { error: 'Missing src' })
          return
        }
        try {
          const logo = await fetchConnectorLogo(src)
          res.statusCode = 200
          res.setHeader('Content-Type', logo.contentType)
          res.setHeader('Cache-Control', 'private, max-age=3600')
          res.end(logo.body)
        } catch (error) {
          setJson(res, 502, { error: getErrorMessage(error, 'Failed to fetch connector logo') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/server-requests/respond') {
        const payload = await readJsonBody(req)
        await appServer.respondToServerRequest(payload)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/server-requests/pending') {
        setJson(res, 200, { data: appServer.listPendingServerRequests() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/meta/methods') {
        const methods = await methodCatalog.listMethods()
        setJson(res, 200, { data: methods })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/meta/notifications') {
        const methods = await methodCatalog.listNotificationMethods()
        setJson(res, 200, { data: methods })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/provider-models') {
        try {
          const fmState = ensureDefaultFreeModeStateForMissingAuthSync(join(getCodexHomeDir(), FREE_MODE_STATE_FILE))
          if (fmState?.enabled) {
            if (fmState.provider === 'opencode-zen') {
              try {
                const modelsUrl = 'https://opencode.ai/zen/v1/models'
                const headers: Record<string, string> = {}
                if (fmState.apiKey && fmState.apiKey !== 'dummy') {
                  headers['Authorization'] = `Bearer ${fmState.apiKey}`
                }
                const resp = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(8000) })
                if (resp.ok) {
                  const json = await resp.json() as { data?: Array<{ id: string }> }
                  const allIds = (json.data ?? []).map(m => m.id).filter(Boolean)
                  const freeIds = allIds.filter(id => id.endsWith('-free') || id === 'big-pickle')
                  const paidIds = allIds.filter(id => !id.endsWith('-free') && id !== 'big-pickle')
                  setJson(res, 200, { data: [...freeIds, ...paidIds], exclusive: true, source: 'opencode-zen' })
                  return
                }
              } catch {
                // OpenCode Zen model fetch failed
              }
              setJson(res, 200, { data: ['big-pickle', 'minimax-m2.5-free', 'nemotron-3-super-free', 'trinity-large-preview-free'], exclusive: true, source: 'opencode-zen' })
              return
            }
            if (fmState.provider === 'custom' && fmState.customBaseUrl) {
              try {
                const modelsUrl = fmState.customBaseUrl.replace(/\/+$/, '') + '/models'
                const headers: Record<string, string> = {}
                if (fmState.apiKey && fmState.apiKey !== 'dummy') {
                  headers['Authorization'] = `Bearer ${fmState.apiKey}`
                }
                const resp = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(8000) })
                if (resp.ok) {
                  const json = await resp.json() as unknown
                  const ids = normalizeProviderModelsData(json)
                  const currentModel = fmState.model?.trim() ?? ''
                  const orderedIds = currentModel && ids.includes(currentModel)
                    ? [currentModel, ...ids.filter((id) => id !== currentModel)]
                    : ids
                  setJson(res, 200, { data: orderedIds, exclusive: true, source: 'custom' })
                  return
                }
              } catch {
                // Custom endpoint model fetch failed — return empty list
              }
              setJson(res, 200, { data: [], exclusive: true, source: 'custom' })
              return
            }
            const freeModels = await getFreeModels()
            setJson(res, 200, { data: freeModels, exclusive: true })
            return
          }
        } catch {
          // No free-mode state — proceed normally
        }
        const data = await readProviderBackedModelIds(appServer)
        setJson(res, 200, data)
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/workspace-roots-state') {
        const state = await readWorkspaceRootsState()
        setJson(res, 200, { data: state })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-queue-state') {
        const state = await readThreadQueueState()
        setJson(res, 200, { data: state })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/home-directory') {
        setJson(res, 200, { data: { path: homedir() } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/worktree/create') {
        const payload = asRecord(await readJsonBody(req))
        const rawSourceCwd = typeof payload?.sourceCwd === 'string' ? payload.sourceCwd.trim() : ''
        const baseBranch = typeof payload?.baseBranch === 'string' ? payload.baseBranch.trim() : ''
        if (!rawSourceCwd) {
          setJson(res, 400, { error: 'Missing sourceCwd' })
          return
        }

        const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
        try {
          const sourceInfo = await stat(sourceCwd)
          if (!sourceInfo.isDirectory()) {
            setJson(res, 400, { error: 'sourceCwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'sourceCwd does not exist' })
          return
        }

        try {
          let gitRoot = ''
          try {
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          } catch (error) {
            if (!isNotGitRepositoryError(error)) throw error
            await runCommand('git', ['init'], { cwd: sourceCwd })
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          }
          const repoName = basename(gitRoot) || 'repo'
          const worktreesRoot = join(getCodexHomeDir(), 'worktrees')
          await mkdir(worktreesRoot, { recursive: true })

          // Match Codex desktop layout so project grouping resolves to repo name:
          // ~/.codex/worktrees/<id>/<repoName>
          let worktreeId = ''
          let worktreeParent = ''
          let worktreeCwd = ''
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const candidate = randomBytes(2).toString('hex')
            const parent = join(worktreesRoot, candidate)
            try {
              await stat(parent)
              continue
            } catch {
              worktreeId = candidate
              worktreeParent = parent
              worktreeCwd = join(parent, repoName)
              break
            }
          }
          if (!worktreeId || !worktreeParent || !worktreeCwd) {
            throw new Error('Failed to allocate a unique worktree id')
          }
          const startPoint = baseBranch || 'HEAD'

          await mkdir(worktreeParent, { recursive: true })
          try {
            await runCommand('git', ['worktree', 'add', '--detach', worktreeCwd, startPoint], { cwd: gitRoot })
          } catch (error) {
            if (!isMissingHeadError(error)) throw error
            await ensureRepoHasInitialCommit(gitRoot)
            await runCommand('git', ['worktree', 'add', '--detach', worktreeCwd, startPoint], { cwd: gitRoot })
          }
          try {
            await persistWorkspaceRoot(worktreeCwd)
          } catch (error) {
            await rollbackCreatedWorktree(gitRoot, worktreeCwd, worktreeParent)
            throw error
          }

          setJson(res, 200, {
            data: {
              cwd: worktreeCwd,
              branch: null,
              gitRoot,
            },
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to create worktree') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/worktree/create-permanent') {
        const payload = asRecord(await readJsonBody(req))
        const rawSourceCwd = typeof payload?.sourceCwd === 'string' ? payload.sourceCwd.trim() : ''
        const rawWorktreeName = typeof payload?.worktreeName === 'string' ? payload.worktreeName.trim() : ''
        if (!rawSourceCwd) {
          setJson(res, 400, { error: 'Missing sourceCwd' })
          return
        }
        if (!rawWorktreeName) {
          setJson(res, 400, { error: 'Missing worktreeName' })
          return
        }
        if (rawWorktreeName.includes('/') || rawWorktreeName.includes('\\') || rawWorktreeName === '.' || rawWorktreeName === '..') {
          setJson(res, 400, { error: 'Worktree name must be a single folder name' })
          return
        }

        const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
        try {
          const sourceInfo = await stat(sourceCwd)
          if (!sourceInfo.isDirectory()) {
            setJson(res, 400, { error: 'sourceCwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'sourceCwd does not exist' })
          return
        }

        try {
          let gitRoot = ''
          try {
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          } catch (error) {
            if (!isNotGitRepositoryError(error)) throw error
            await runCommand('git', ['init'], { cwd: sourceCwd })
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          }
          const worktreeCwd = join(dirname(gitRoot), rawWorktreeName)
          try {
            await stat(worktreeCwd)
            setJson(res, 409, { error: 'Worktree folder already exists' })
            return
          } catch {
            // Expected for a new worktree path.
          }

          const branchName = await allocatePermanentWorktreeBranchName(gitRoot, rawWorktreeName)
          try {
            await runCommand('git', ['worktree', 'add', '-b', branchName, worktreeCwd, 'HEAD'], { cwd: gitRoot })
          } catch (error) {
            if (!isMissingHeadError(error)) throw error
            await ensureRepoHasInitialCommit(gitRoot)
            await runCommand('git', ['worktree', 'add', '-b', branchName, worktreeCwd, 'HEAD'], { cwd: gitRoot })
          }
          try {
            await persistWorkspaceRoot(worktreeCwd)
          } catch (error) {
            await rollbackCreatedWorktree(gitRoot, worktreeCwd, undefined, branchName)
            throw error
          }

          setJson(res, 200, {
            data: {
              cwd: worktreeCwd,
              branch: branchName,
              gitRoot,
            },
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to create worktree') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/worktree/branches') {
        const rawSourceCwd = (url.searchParams.get('sourceCwd') ?? '').trim()
        if (!rawSourceCwd) {
          setJson(res, 400, { error: 'Missing sourceCwd' })
          return
        }
        const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
        try {
          const sourceInfo = await stat(sourceCwd)
          if (!sourceInfo.isDirectory()) {
            setJson(res, 400, { error: 'sourceCwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'sourceCwd does not exist' })
          return
        }

        try {
          let gitRoot = ''
          try {
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
          } catch (error) {
            if (!isNotGitRepositoryError(error)) throw error
            setJson(res, 200, { data: [] })
            return
          }
          const output = await runCommandCapture(
            'git',
            ['for-each-ref', '--format=%(committerdate:unix)\t%(refname)', 'refs/heads', 'refs/remotes'],
            { cwd: gitRoot },
          )
          const branchActivityByName = new Map<string, number>()
          for (const line of output.split('\n')) {
            const [rawTimestamp = '', rawRefName = ''] = line.split('\t')
            const normalized = normalizeBranchRefName(rawRefName)
            if (!normalized || normalized === 'origin/HEAD') continue
            const parsedTimestamp = Number.parseInt(rawTimestamp.trim(), 10)
            const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
            const current = branchActivityByName.get(normalized) ?? Number.MIN_SAFE_INTEGER
            if (timestamp > current) {
              branchActivityByName.set(normalized, timestamp)
            }
          }

          const branches = Array.from(branchActivityByName.entries())
            .map(([value]) => ({ value, label: value }))
            .sort((a, b) => {
              const aActivity = branchActivityByName.get(a.value) ?? 0
              const bActivity = branchActivityByName.get(b.value) ?? 0
              if (bActivity !== aActivity) return bActivity - aActivity
              return a.value.localeCompare(b.value)
            })
          setJson(res, 200, { data: branches })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to list branches') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/branches') {
        const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const cwdInfo = await stat(cwd)
          if (!cwdInfo.isDirectory()) {
            setJson(res, 400, { error: 'cwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'cwd does not exist' })
          return
        }

        try {
          let gitRoot = ''
          try {
            gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          } catch (error) {
            if (!isNotGitRepositoryError(error)) throw error
            setJson(res, 200, {
              data: {
                currentBranch: null,
                options: [],
              },
            })
            return
          }

          const state = await readGitHeaderState(gitRoot)
          const currentBranch = state.currentBranch
          const output = await runCommandCapture(
            'git',
            ['for-each-ref', '--format=%(committerdate:unix)\t%(refname)\t%(objectname)', 'refs/heads', 'refs/remotes'],
            { cwd: gitRoot },
          )
          const branchActivityByName = new Map<string, { timestamp: number; isRemote: boolean }>()
          for (const line of output.split('\n')) {
            const [rawTimestamp = '', rawRefName = ''] = line.split('\t')
            const normalized = normalizeBranchRefName(rawRefName)
            if (!normalized || normalized === 'origin/HEAD') continue
            const parsedTimestamp = Number.parseInt(rawTimestamp.trim(), 10)
            const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
            const isRemote = rawRefName.trim().startsWith('refs/remotes/')
            const current = branchActivityByName.get(normalized)
            if (!current || timestamp > current.timestamp) {
              branchActivityByName.set(normalized, { timestamp, isRemote })
            }
          }
          if (currentBranch && !branchActivityByName.has(currentBranch)) {
            branchActivityByName.set(currentBranch, { timestamp: Number.MAX_SAFE_INTEGER, isRemote: false })
          }
          const options = Array.from(branchActivityByName.entries())
            .map(([value, metadata]) => ({
              value,
              label: value,
              isCurrent: value === currentBranch,
              isRemote: metadata.isRemote,
            }))
            .sort((a, b) => {
              const aActivity = branchActivityByName.get(a.value)?.timestamp ?? 0
              const bActivity = branchActivityByName.get(b.value)?.timestamp ?? 0
              if (bActivity !== aActivity) return bActivity - aActivity
              return a.value.localeCompare(b.value)
            })
          setJson(res, 200, {
            data: {
              ...state,
              options,
            },
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Git branches') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/repository-status') {
        const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const cwdInfo = await stat(cwd)
          if (!cwdInfo.isDirectory()) {
            setJson(res, 400, { error: 'cwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'cwd does not exist' })
          return
        }

        try {
          const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          setJson(res, 200, {
            data: {
              isGitRepo: true,
              gitRoot,
            },
          })
        } catch (error) {
          if (!isNotGitRepositoryError(error)) {
            setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Git repository status') })
            return
          }
          setJson(res, 200, {
            data: {
              isGitRepo: false,
              gitRoot: '',
            },
          })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/git/checkout') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        const rawCwd = readNonEmptyString(record.cwd)
        const targetBranch = readNonEmptyString(record.branch)
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        if (!targetBranch) {
          setJson(res, 400, { error: 'Missing branch' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const cwdInfo = await stat(cwd)
          if (!cwdInfo.isDirectory()) {
            setJson(res, 400, { error: 'cwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'cwd does not exist' })
          return
        }
        try {
          const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          await assertNoTrackedGitChanges(gitRoot)
          await checkoutGitBranchWithWorktreeRecovery(gitRoot, targetBranch)
          setJson(res, 200, { data: await readGitHeaderState(gitRoot) })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to switch branch') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/branch-commits') {
        const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
        const branch = (url.searchParams.get('branch') ?? '').trim()
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        if (!branch) {
          setJson(res, 400, { error: 'Missing branch' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          await runCommandCapture('git', ['rev-parse', '--verify', `${branch}^{commit}`], { cwd: gitRoot })
          const resetHistoryRefPrefix = `refs/codex/header-git-reset-history/${branch}/`
          const resetHistoryRefsRaw = await runCommandCapture(
            'git',
            ['for-each-ref', '--sort=-creatordate', '--format=%(refname)', resetHistoryRefPrefix],
            { cwd: gitRoot },
          ).catch(() => '')
          const resetHistoryRefs = resetHistoryRefsRaw
            .split('\n')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .slice(0, HEADER_GIT_RESET_HISTORY_REF_LIMIT)
          const output = await runCommandCapture(
            'git',
            ['log', '-n', '12', '--date=short', '--format=%H%x09%h%x09%cd%x09%s', branch, ...resetHistoryRefs],
            { cwd: gitRoot },
          )
          const commits = output.split('\n').flatMap((line) => {
            const [sha = '', shortSha = '', date = '', ...subjectParts] = line.split('\t')
            const subject = subjectParts.join('\t').trim()
            return sha.trim() && shortSha.trim()
              ? [{ sha: sha.trim(), shortSha: shortSha.trim(), date: date.trim(), subject: subject || shortSha.trim() }]
              : []
          })
          setJson(res, 200, { data: commits })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to load branch commits') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/git/reset-to-commit') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        const rawCwd = readNonEmptyString(record.cwd)
        const branch = readNonEmptyString(record.branch)
        const sha = readNonEmptyString(record.sha)
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        if (!branch) {
          setJson(res, 400, { error: 'Missing branch' })
          return
        }
        if (!sha) {
          setJson(res, 400, { error: 'Missing commit' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
          await assertNoTrackedGitChanges(gitRoot)
          await assertLocalGitBranch(gitRoot, branch)
          const currentBranch = (await runCommandCapture('git', ['branch', '--show-current'], { cwd: gitRoot })).trim()
          if (currentBranch && currentBranch !== branch) {
            await checkoutGitBranchWithWorktreeRecovery(gitRoot, branch)
          } else if (!currentBranch) {
            await checkoutGitBranchWithWorktreeRecovery(gitRoot, branch)
          }
          const previousTip = await runCommandCapture('git', ['rev-parse', 'HEAD'], { cwd: gitRoot })
          const targetSha = await runCommandCapture('git', ['rev-parse', '--verify', `${sha}^{commit}`], { cwd: gitRoot })
          await runCommand('git', ['update-ref', toHeaderGitResetHistoryRef(branch, previousTip.trim()), previousTip.trim()], { cwd: gitRoot })
          await pruneHeaderGitResetHistoryRefs(gitRoot, branch)
          await runCommand('git', ['reset', '--hard', targetSha.trim()], { cwd: gitRoot })
          setJson(res, 200, { data: await readGitHeaderState(gitRoot) })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to reset branch to commit') })
        }
        return
      }



      if (req.method === 'PUT' && url.pathname === '/codex-api/workspace-roots-state') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        await updateWorkspaceRootsState((existingState) => ({
          order: normalizeStringArray(record.order),
          labels: normalizeStringRecord(record.labels),
          active: normalizeStringArray(record.active),
          projectOrder: Array.isArray(record.projectOrder)
            ? normalizeStringArray(record.projectOrder)
            : existingState.projectOrder,
          remoteProjects: existingState.remoteProjects,
        }))
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/thread-queue-state') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        await writeThreadQueueState(normalizeThreadQueueState(record))
        void backendQueueProcessor.scheduleAllQueuedThreads()
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/project-root') {
        const payload = asRecord(await readJsonBody(req))
        const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
        const createIfMissing = payload?.createIfMissing === true
        const label = typeof payload?.label === 'string' ? payload.label : ''
        if (!rawPath) {
          setJson(res, 400, { error: 'Missing path' })
          return
        }

        const normalizedPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
        let pathExists = true
        try {
          const info = await stat(normalizedPath)
          if (!info.isDirectory()) {
            setJson(res, 400, { error: 'Path exists but is not a directory' })
            return
          }
        } catch {
          pathExists = false
        }

        if (!pathExists && createIfMissing) {
          await mkdir(normalizedPath, { recursive: true })
        } else if (!pathExists) {
          setJson(res, 404, { error: 'Directory does not exist' })
          return
        }

        await persistWorkspaceRoot(normalizedPath, label)
        setJson(res, 200, { data: { path: normalizedPath } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/local-directory') {
        const payload = asRecord(await readJsonBody(req))
        const rawPath = typeof payload?.path === 'string' ? payload.path.trim() : ''
        if (!rawPath) {
          setJson(res, 400, { error: 'Missing path' })
          return
        }

        const normalizedPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
        try {
          const info = await stat(normalizedPath)
          if (!info.isDirectory()) {
            setJson(res, 400, { error: 'Path exists but is not a directory' })
            return
          }
        } catch {
          await mkdir(normalizedPath, { recursive: true })
        }

        setJson(res, 200, { data: { path: normalizedPath } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/github-clone') {
        const payload = asRecord(await readJsonBody(req))
        const repoUrl = typeof payload?.url === 'string' ? payload.url.trim() : ''
        const basePath = typeof payload?.basePath === 'string' ? payload.basePath.trim() : ''
        try {
          const clonedPath = await cloneGithubRepositoryIntoBase(repoUrl, basePath, { runCommand, persistWorkspaceRoot })
          setJson(res, 200, { data: { path: clonedPath } })
        } catch (error) {
          setJson(res, 400, { error: error instanceof Error ? error.message : 'Failed to clone GitHub repository' })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/projectless-thread-cwd') {
        const payload = asRecord(await readJsonBody(req))
        const prompt = typeof payload?.prompt === 'string' ? payload.prompt : null
        try {
          const directory = await createProjectlessThreadDirectory(prompt)
          setJson(res, 200, { data: directory })
        } catch (error) {
          setJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to create new chat folder' })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/project-root-suggestion') {
        const basePath = url.searchParams.get('basePath')?.trim() ?? ''
        if (!basePath) {
          setJson(res, 400, { error: 'Missing basePath' })
          return
        }
        const normalizedBasePath = isAbsolute(basePath) ? basePath : resolve(basePath)
        try {
          const baseInfo = await stat(normalizedBasePath)
          if (!baseInfo.isDirectory()) {
            setJson(res, 400, { error: 'basePath is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'basePath does not exist' })
          return
        }

        let index = 1
        while (index < 100000) {
          const candidateName = `New Project (${String(index)})`
          const candidatePath = join(normalizedBasePath, candidateName)
          try {
            await stat(candidatePath)
            index += 1
            continue
          } catch {
            setJson(res, 200, { data: { name: candidateName, path: candidatePath } })
            return
          }
        }

        setJson(res, 500, { error: 'Failed to compute project name suggestion' })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/composer-file-search') {
        const payload = asRecord(await readJsonBody(req))
        const rawCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
        const query = typeof payload?.query === 'string' ? payload.query.trim() : ''
        const limitRaw = typeof payload?.limit === 'number' ? payload.limit : 20
        const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)))
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
        try {
          const info = await stat(cwd)
          if (!info.isDirectory()) {
            setJson(res, 400, { error: 'cwd is not a directory' })
            return
          }
        } catch {
          setJson(res, 404, { error: 'cwd does not exist' })
          return
        }

        try {
          const files = await listFilesWithRipgrep(cwd)
          const scored = files
            .map((path) => ({ path, score: scoreFileCandidate(path, query) }))
            .filter((row) => query.length === 0 || row.score < 10)
            .sort((a, b) => (a.score - b.score) || a.path.localeCompare(b.path))
            .slice(0, limit)
            .map((row) => ({ path: row.path }))
          setJson(res, 200, { data: scored })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to search files') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/prompts') {
        setJson(res, 200, { data: await listComposerPrompts() })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/prompts') {
        const payload = asRecord(await readJsonBody(req))
        const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
        const content = typeof payload?.content === 'string' ? payload.content : ''
        if (!name || !content.trim()) {
          setJson(res, 400, { error: 'Prompt name and content are required' })
          return
        }
        try {
          const prompt = await createComposerPromptFile(name, content)
          setJson(res, 200, { data: prompt })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to create prompt') })
        }
        return
      }

      if (req.method === 'DELETE' && url.pathname === '/codex-api/prompts') {
        const promptPath = url.searchParams.get('path')?.trim() ?? ''
        if (!promptPath) {
          setJson(res, 400, { error: 'Missing path' })
          return
        }
        try {
          const removed = await removeComposerPromptFile(promptPath)
          setJson(res, 200, { data: { removed } })
        } catch (error) {
          setJson(res, 400, { error: getErrorMessage(error, 'Failed to remove prompt') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-titles') {
        const cache = await readMergedThreadTitleCache()
        setJson(res, 200, { data: cache })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-pins') {
        const threadIds = await readPinnedThreadIds()
        setJson(res, 200, { data: { threadIds } })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/preferences/first-launch-plugins-card') {
        const dismissed = await readFirstLaunchPluginsCardDismissed()
        setJson(res, 200, { data: { dismissed } })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-automations') {
        const automationsByThreadId = await listThreadHeartbeatAutomations()
        setJson(res, 200, { data: automationsByThreadId })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/project-automations') {
        const automationsByProjectName = await listProjectCronAutomations()
        setJson(res, 200, { data: automationsByProjectName })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-automation') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        const automationId = url.searchParams.get('automationId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        const automation = automationId
          ? await readThreadHeartbeatAutomation(threadId, automationId)
          : await readThreadHeartbeatAutomations(threadId)
        setJson(res, 200, { data: automation })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/project-automation') {
        const projectName = url.searchParams.get('projectName')?.trim() ?? ''
        const automationId = url.searchParams.get('automationId')?.trim() ?? ''
        if (!projectName) {
          setJson(res, 400, { error: 'Missing projectName' })
          return
        }
        const automation = automationId
          ? await readProjectCronAutomation(projectName, automationId)
          : await readProjectCronAutomations(projectName)
        setJson(res, 200, { data: automation })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-search') {
        const payload = asRecord(await readJsonBody(req))
        const query = typeof payload?.query === 'string' ? payload.query.trim() : ''
        const limitRaw = typeof payload?.limit === 'number' ? payload.limit : 200
        const limit = Math.max(1, Math.min(1000, Math.floor(limitRaw)))
        if (!query) {
          setJson(res, 200, { data: { threadIds: [], indexedThreadCount: 0 } })
          return
        }

        const index = await getThreadSearchIndex()
        const matchedIds = Array.from(index.docsById.entries())
          .filter(([, doc]) => isExactPhraseMatch(query, doc))
          .slice(0, limit)
          .map(([id]) => id)

        setJson(res, 200, { data: { threadIds: matchedIds, indexedThreadCount: index.docsById.size } })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/thread-titles') {
        const payload = asRecord(await readJsonBody(req))
        const id = typeof payload?.id === 'string' ? payload.id : ''
        const title = typeof payload?.title === 'string' ? payload.title : ''
        if (!id) {
          setJson(res, 400, { error: 'Missing id' })
          return
        }
        const cache = await readThreadTitleCache()
        const next = title ? updateThreadTitleCache(cache, id, title) : removeFromThreadTitleCache(cache, id)
        await writeThreadTitleCache(next)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/thread-pins') {
        const payload = asRecord(await readJsonBody(req))
        const threadIds = normalizePinnedThreadIds(payload?.threadIds)
        await writePinnedThreadIds(threadIds)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/preferences/first-launch-plugins-card') {
        const payload = asRecord(await readJsonBody(req))
        const dismissed = payload?.dismissed === true
        await writeFirstLaunchPluginsCardDismissed(dismissed)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/thread-automation') {
        const payload = asRecord(await readJsonBody(req))
        const threadId = typeof payload?.threadId === 'string' ? payload.threadId.trim() : ''
        const id = typeof payload?.id === 'string' ? payload.id.trim() : ''
        const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
        const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : ''
        const rrule = typeof payload?.rrule === 'string' ? payload.rrule.trim() : ''
        const status = payload?.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
        if (!threadId || !name || !prompt || !rrule) {
          setJson(res, 400, { error: 'threadId, name, prompt, and rrule are required' })
          return
        }
        const automation = await writeThreadHeartbeatAutomation({ threadId, id, name, prompt, rrule, status })
        setJson(res, 200, { data: automation })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/project-automation') {
        const payload = asRecord(await readJsonBody(req))
        const projectName = typeof payload?.projectName === 'string' ? payload.projectName.trim() : ''
        const id = typeof payload?.id === 'string' ? payload.id.trim() : ''
        const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
        const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : ''
        const rrule = typeof payload?.rrule === 'string' ? payload.rrule.trim() : ''
        const status = payload?.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
        if (!projectName || !name || !prompt || !rrule) {
          setJson(res, 400, { error: 'projectName, name, prompt, and rrule are required' })
          return
        }
        if (!isAbsoluteLikePath(projectName)) {
          setJson(res, 400, { error: 'Project automation cwd must be an absolute path' })
          return
        }
        const automation = await writeProjectCronAutomation({ projectName, id, name, prompt, rrule, status })
        setJson(res, 200, { data: automation })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-automation/run') {
        const payload = asRecord(await readJsonBody(req))
        const threadId = typeof payload?.threadId === 'string' ? payload.threadId.trim() : ''
        const automationId = typeof payload?.automationId === 'string' ? payload.automationId.trim() : ''
        if (!threadId || !automationId) {
          setJson(res, 400, { error: 'threadId and automationId are required' })
          return
        }
        const automation = await readThreadHeartbeatAutomation(threadId, automationId)
        if (!automation) {
          setJson(res, 404, { error: 'Automation not found for thread' })
          return
        }
        await appendThreadQueuedMessage(threadId, buildHeartbeatQueuedMessage(automation))
        backendQueueProcessor.scheduleThreadQueueDrain(threadId, 0)
        setJson(res, 200, { data: { queued: true } })
        return
      }

      if (req.method === 'DELETE' && url.pathname === '/codex-api/thread-automation') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        const automationId = url.searchParams.get('automationId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        const removed = await deleteThreadHeartbeatAutomation(threadId, automationId)
        setJson(res, 200, { data: { removed } })
        return
      }

      if (req.method === 'DELETE' && url.pathname === '/codex-api/project-automation') {
        const projectName = url.searchParams.get('projectName')?.trim() ?? ''
        const automationId = url.searchParams.get('automationId')?.trim() ?? ''
        if (!projectName) {
          setJson(res, 400, { error: 'Missing projectName' })
          return
        }
        const removed = await deleteProjectCronAutomation(projectName, automationId)
        setJson(res, 200, { data: { removed } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/telegram/configure-bot') {
        const payload = asRecord(await readJsonBody(req))
        const botToken = typeof payload?.botToken === 'string' ? payload.botToken.trim() : ''
        const rawAllowedUserIds = Array.isArray(payload?.allowedUserIds) ? payload.allowedUserIds : []
        if (!botToken) {
          setJson(res, 400, { error: 'Missing botToken' })
          return
        }
        const config = normalizeTelegramBridgeConfig({
          botToken,
          allowedUserIds: rawAllowedUserIds,
        })
        if (config.allowedUserIds.length === 0) {
          setJson(res, 400, { error: 'At least one allowed Telegram user ID is required' })
          return
        }

        telegramBridge.configureToken(config.botToken)
        telegramBridge.configureAllowedUserIds(config.allowedUserIds)
        telegramBridge.start()
        const existingConfig = await readTelegramBridgeConfig()
        await writeTelegramBridgeConfig({
          botToken: config.botToken,
          chatIds: existingConfig.chatIds,
          allowedUserIds: config.allowedUserIds,
        })
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/telegram/config') {
        const config = await readTelegramBridgeConfig()
        setJson(res, 200, {
          data: {
            botToken: config.botToken,
            allowedUserIds: config.allowedUserIds,
          },
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/telegram/status') {
        setJson(res, 200, { data: telegramBridge.getStatus() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/events') {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')

        const unsubscribe = middleware.subscribeNotifications((notification: { method: string; params: unknown; atIso: string }) => {
          if (res.writableEnded || res.destroyed) return
          res.write(`data: ${JSON.stringify(notification)}\n\n`)
        })

        res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
        const keepAlive = setInterval(() => {
          res.write(': ping\n\n')
        }, 15000)

        const close = () => {
          clearInterval(keepAlive)
          unsubscribe()
          if (!res.writableEnded) {
            res.end()
          }
        }

        req.on('close', close)
        req.on('aborted', close)
        return
      }

      next()
    } catch (error) {
      const message = getErrorMessage(error, 'Unknown bridge error')
      setJson(res, 502, { error: message })
    }
  }

  middleware.dispose = () => {
    threadSearchIndex = null
    telegramBridge.stop()
    terminalManager.dispose()
    backendQueueProcessor.dispose()
    appServer.dispose()
  }
  middleware.subscribeNotifications = (
    listener: (value: { method: string; params: unknown; atIso: string }) => void,
  ) => {
    const unsubscribeAppServer = appServer.onNotification((notification: { method: string; params: unknown }) => {
      listener({
        ...notification,
        atIso: new Date().toISOString(),
      })
    })
    const unsubscribeTerminal = terminalManager.subscribe((notification) => {
      listener({
        ...notification,
        atIso: new Date().toISOString(),
      })
    })
    return () => {
      unsubscribeAppServer()
      unsubscribeTerminal()
    }
  }

  return middleware
}
