import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rename, rm, mkdir, stat, cp, lstat, readlink, symlink } from 'node:fs/promises'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
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
  getFreeModels,
  FREE_MODE_STATE_FILE,
  getFreeModeConfigArgs,
  getFreeModeEnvVars,
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

const customAgentThreadCwdById = new Map<string, string>()

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

type ThreadSearchDocument = {
  id: string
  title: string
  preview: string
  messageText: string
  searchableText: string
}

type ThreadSearchIndex = {
  docsById: Map<string, ThreadSearchDocument>
}

type ProviderModelsResponse = {
  data: string[]
  providerId: string
  source: 'provider'
}

type ComposioUserData = {
  apiKey: string
  baseUrl: string
  webUrl: string
  orgId: string
  testUserId: string
}

type ComposioStatusResponse = {
  available: boolean
  authenticated: boolean
  cliVersion: string
  email: string
  defaultOrgName: string
  defaultOrgId: string
  webUrl: string
  baseUrl: string
  testUserId: string
}

type ComposioConnectionSummary = {
  id: string
  wordId: string
  alias: string
  status: string
  authScheme: string
  createdAt: string
  updatedAt: string
  isComposioManaged: boolean
  isDisabled: boolean
}

type ComposioConnectorSummary = {
  slug: string
  name: string
  description: string
  logoUrl: string
  latestVersion: string
  toolsCount: number
  triggersCount: number
  isNoAuth: boolean
  enabled: boolean
  authModes: string[]
  activeCount: number
  totalConnections: number
  connectionStatuses: string[]
}

type ComposioToolSummary = {
  slug: string
  name: string
  description: string
}

type ComposioConnectorDetail = {
  connector: ComposioConnectorSummary
  connections: ComposioConnectionSummary[]
  tools: ComposioToolSummary[]
  dashboardUrl: string
}

type ComposioLinkResult = {
  status: string
  message: string
  connectedAccountId: string
  redirectUrl: string
  toolkit: string
  projectType: string
}

type ComposioLoginResult = {
  status: string
  message: string
  loginUrl: string
  cliKey: string
  expiresAt: string
}

type ComposioInstallResult = {
  ok: boolean
  command: string
  output: string
}

type ComposioConnectorPage = {
  data: ComposioConnectorSummary[]
  nextCursor: string | null
  total: number
}

const COMPOSIO_CONNECTORS_PAGE_LIMIT_MAX = 1000

const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000

const THREAD_RESPONSE_TURN_LIMIT = 10
const THREAD_METHODS_WITH_TURNS = new Set(['thread/read', 'thread/resume', 'thread/fork', 'thread/rollback'])
const THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT = 100
const PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS = 100
const PROJECTLESS_THREAD_SLUG_MAX_LENGTH = 80
const API_PERF_LOGGING_ENV_KEY = 'CODEXUI_API_PERF_LOGGING'
const API_PERF_MS_THRESHOLD_ENV_KEY = 'CODEXUI_API_PERF_MS_THRESHOLD'
const API_PERF_BODY_MB_THRESHOLD_ENV_KEY = 'CODEXUI_API_PERF_BODY_MB_THRESHOLD'
const DEFAULT_API_PERF_MS_THRESHOLD = 300
const DEFAULT_API_PERF_BODY_MB_THRESHOLD = 1
const MB_DIVISOR = 1024 * 1024
const COMPOSIO_USER_DATA_PATH = join(homedir(), '.composio', 'user_data.json')

type SessionRecoveredFileChange = {
  path: string
  operation: 'add' | 'delete' | 'update'
  movedToPath: string | null
  diff: string
  addedLineCount: number
  removedLineCount: number
}

type SessionRecoveredTurnFileChanges = {
  turnId: string
  turnIndex: number
  fileChanges: SessionRecoveredFileChange[]
}

function readEnvValueFromFile(filePath: string, key: string): string | null {
  try {
    const content = readFileSync(filePath, 'utf8')
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.+)\\s*$`, 'm'))
    if (!match) return null
    const rawValue = match[1]?.trim() ?? ''
    if (!rawValue) return null
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith('\'') && rawValue.endsWith('\''))) {
      return rawValue.slice(1, -1).trim()
    }
    return rawValue
  } catch {
    return null
  }
}

function parseBooleanEnvFlag(value: string | null | undefined): boolean | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}

function resolveApiPerfLoggingEnabled(): boolean {
  const explicitValue = parseBooleanEnvFlag(process.env[API_PERF_LOGGING_ENV_KEY])
  if (explicitValue !== null) return explicitValue

  const fromEnvLocal = parseBooleanEnvFlag(readEnvValueFromFile('.env.local', API_PERF_LOGGING_ENV_KEY))
  if (fromEnvLocal !== null) return fromEnvLocal

  const fromEnv = parseBooleanEnvFlag(readEnvValueFromFile('.env', API_PERF_LOGGING_ENV_KEY))
  if (fromEnv !== null) return fromEnv

  return false
}

const API_PERF_LOGGING_ENABLED = resolveApiPerfLoggingEnabled()

function parseNumberEnvFlag(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value.trim())
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function resolveNumericEnvConfig(envKey: string, fallback: number): number {
  const fromProcess = parseNumberEnvFlag(process.env[envKey])
  if (fromProcess !== null) return fromProcess

  const fromEnvLocal = parseNumberEnvFlag(readEnvValueFromFile('.env.local', envKey))
  if (fromEnvLocal !== null) return fromEnvLocal

  const fromEnv = parseNumberEnvFlag(readEnvValueFromFile('.env', envKey))
  if (fromEnv !== null) return fromEnv

  return fallback
}

const API_PERF_MS_THRESHOLD = resolveNumericEnvConfig(API_PERF_MS_THRESHOLD_ENV_KEY, DEFAULT_API_PERF_MS_THRESHOLD)
const API_PERF_BODY_MB_THRESHOLD = resolveNumericEnvConfig(API_PERF_BODY_MB_THRESHOLD_ENV_KEY, DEFAULT_API_PERF_BODY_MB_THRESHOLD)

function getChunkByteLength(chunk: unknown, encoding?: BufferEncoding): number {
  if (typeof chunk === 'string') {
    return Buffer.byteLength(chunk, encoding)
  }
  if (chunk instanceof Uint8Array) {
    return chunk.byteLength
  }
  if (ArrayBuffer.isView(chunk)) {
    return chunk.byteLength
  }
  if (chunk instanceof ArrayBuffer) {
    return chunk.byteLength
  }
  return 0
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function rewriteCustomAgentThreadCwd<T>(value: T): T {
  const record = asRecord(value)
  if (!record) return value

  const rewriteThread = (threadValue: unknown): void => {
    const thread = asRecord(threadValue)
    const threadId = typeof thread?.id === 'string' ? thread.id : ''
    const mappedCwd = threadId ? customAgentThreadCwdById.get(threadId) : undefined
    if (thread && mappedCwd) {
      thread.cwd = mappedCwd
    }
  }

  rewriteThread(record.thread)
  if (Array.isArray(record.threads)) {
    for (const thread of record.threads) rewriteThread(thread)
  }

  const thread = asRecord(record.thread)
  const threadId = typeof thread?.id === 'string' ? thread.id : ''
  const mappedCwd = threadId ? customAgentThreadCwdById.get(threadId) : undefined
  if (mappedCwd) {
    record.cwd = mappedCwd
  }

  return value
}

function isInlineDataUrl(value: string): boolean {
  return /^data:/iu.test(value.trim())
}

function inferImageMimeTypeFromBytes(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  return null
}

function inferImageMimeTypeFromBase64(value: string): string | null {
  const compact = value.trim().replace(/\s+/gu, '')
  if (compact.length < 32 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(compact)) return null
  try {
    return inferImageMimeTypeFromBytes(Buffer.from(compact.slice(0, 64), 'base64'))
  } catch {
    return null
  }
}

function normalizeBase64ImageDataUrl(value: string, mimeType: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isInlineDataUrl(trimmed)) {
    return /^data:image\//iu.test(trimmed) ? trimmed : null
  }
  const compact = trimmed.replace(/\s+/gu, '')
  const inferredMimeType = inferImageMimeTypeFromBase64(compact)
  if (!inferredMimeType) return null
  const normalizedMimeType = mimeType.trim().toLowerCase()
  const finalMimeType = normalizedMimeType.startsWith('image/') && normalizedMimeType !== 'image/*'
    ? normalizedMimeType
    : inferredMimeType
  return `data:${finalMimeType};base64,${compact}`
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase()
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/svg+xml') return '.svg'
  if (normalized === 'application/pdf') return '.pdf'
  return ''
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toAttachmentLinkTarget(block: Record<string, unknown>, fallback: string): string {
  const candidate = asNonEmptyString(block.path)
    ?? asNonEmptyString(block.file_path)
    ?? asNonEmptyString(block.filename)
    ?? asNonEmptyString(block.file_id)
    ?? fallback
  if (candidate.startsWith('file://')) return candidate
  if (candidate.startsWith('/')) return `file://${candidate}`
  return `attachment://${candidate}`
}

async function persistInlineDataUrlToLocalFile(dataUrl: string, baseName: string): Promise<string | null> {
  const trimmed = dataUrl.trim()
  const match = /^data:([^;,]*)(;base64)?,(.*)$/isu.exec(trimmed)
  if (!match) return null
  const mimeType = (match[1] ?? '').trim().toLowerCase()
  const encodedPayload = match[3] ?? ''
  let bytes: Buffer
  try {
    bytes = match[2]
      ? Buffer.from(encodedPayload, 'base64')
      : Buffer.from(decodeURIComponent(encodedPayload), 'utf8')
  } catch {
    return null
  }
  if (bytes.length === 0) return null

  const hash = createHash('sha1').update(bytes).digest('hex')
  const ext = extensionFromMimeType(mimeType)
  const mediaDir = join(tmpdir(), 'codex-web-inline-media')
  await mkdir(mediaDir, { recursive: true })
  const fileName = `${baseName}-${hash}${ext}`
  const filePath = join(mediaDir, fileName)
  try {
    await stat(filePath)
  } catch {
    await writeFile(filePath, bytes)
  }
  return filePath
}

function toLocalImageProxyUrl(path: string): string {
  return `/codex-local-image?path=${encodeURIComponent(path)}`
}

const INLINE_IMAGE_FIELD_NAMES = new Set([
  'b64_json',
  'image',
  'image_url',
  'images',
  'result',
  'url',
])

type InlinePayloadSanitizeContext = {
  turnId: string
  itemId: string
  blockIndex: number
  fieldName?: string
}

function isPotentialInlineImageField(fieldName: string | undefined): boolean {
  return typeof fieldName === 'string' && INLINE_IMAGE_FIELD_NAMES.has(fieldName)
}

async function sanitizeInlineImageString(
  value: string,
  context: InlinePayloadSanitizeContext,
): Promise<{ value: string; changed: boolean }> {
  if (!isPotentialInlineImageField(context.fieldName)) {
    return { value, changed: false }
  }

  const dataUrl = normalizeBase64ImageDataUrl(value, 'image/*')
  if (!dataUrl) return { value, changed: false }

  const localUrl = await persistInlineDataUrlToLocalFile(
    dataUrl,
    `inline-image-${context.turnId}-${context.itemId}-${context.fieldName}-${String(context.blockIndex)}`,
  )
  if (!localUrl) return { value, changed: false }

  return { value: toLocalImageProxyUrl(localUrl), changed: true }
}

async function sanitizeInlineUserContentBlock(
  block: unknown,
  context: InlinePayloadSanitizeContext,
): Promise<unknown> {
  const record = asRecord(block)
  if (!record) return block

  const type = asNonEmptyString(record.type) ?? ''
  const imageUrl = asNonEmptyString(record.url) ?? asNonEmptyString(record.image_url)
  if (imageUrl && isInlineDataUrl(imageUrl)) {
    const localUrl = await persistInlineDataUrlToLocalFile(imageUrl, `inline-image-${context.turnId}-${context.itemId}-${String(context.blockIndex)}`)
    if (localUrl) {
      const nextRecord = { ...record }
      if (typeof record.url === 'string') {
        nextRecord.url = toLocalImageProxyUrl(localUrl)
      }
      if (typeof record.image_url === 'string') {
        nextRecord.image_url = toLocalImageProxyUrl(localUrl)
      }
      return {
        ...nextRecord,
        type: 'image',
      }
    }
    const target = toAttachmentLinkTarget(record, `inline-image/${context.turnId}/${context.itemId}/${String(context.blockIndex)}`)
    return {
      type: 'text',
      text: `Image attachment: ${target}`,
    }
  }

  if (type === 'imageGeneration' || type === 'image_generation') {
    const rawResult = asNonEmptyString(record.result)
      ?? asNonEmptyString(record.b64_json)
      ?? asNonEmptyString(record.image)
    const mimeType = asNonEmptyString(record.mime_type)
      ?? asNonEmptyString(record.mimeType)
      ?? 'image/png'
    const dataUrl = rawResult ? normalizeBase64ImageDataUrl(rawResult, mimeType) : null
    if (dataUrl) {
      const localUrl = await persistInlineDataUrlToLocalFile(dataUrl, `generated-image-${context.turnId}-${context.itemId}`)
      if (localUrl) {
        return {
          ...record,
          type: 'imageView',
          path: localUrl,
        }
      }
    }
  }

  const inlineFileData = asNonEmptyString(record.file_data)
    ?? asNonEmptyString(record.data)
    ?? asNonEmptyString(record.base64)
  if ((type.includes('file') || type === 'input_file' || type === 'file') && inlineFileData) {
    const mimeType = asNonEmptyString(record.mime_type) ?? 'application/octet-stream'
    const fileDataUrl = `data:${mimeType};base64,${inlineFileData}`
    const localUrl = await persistInlineDataUrlToLocalFile(fileDataUrl, `inline-file-${context.turnId}-${context.itemId}-${String(context.blockIndex)}`)
    if (localUrl) {
      return {
        type: 'text',
        text: `File attachment: ${localUrl}`,
      }
    }
    const target = toAttachmentLinkTarget(record, `inline-file/${context.turnId}/${context.itemId}/${String(context.blockIndex)}`)
    return {
      type: 'text',
      text: `File attachment: ${target}`,
    }
  }

  return block
}

async function sanitizeInlinePayloadDeep(
  value: unknown,
  context: InlinePayloadSanitizeContext,
): Promise<{ value: unknown; changed: boolean }> {
  const maybeBlock = await sanitizeInlineUserContentBlock(value, context)
  if (maybeBlock !== value) {
    return { value: maybeBlock, changed: true }
  }

  if (typeof value === 'string') {
    return sanitizeInlineImageString(value, context)
  }

  if (Array.isArray(value)) {
    let changed = false
    const nextArray: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const nested = await sanitizeInlinePayloadDeep(value[index], {
        turnId: context.turnId,
        itemId: context.itemId,
        blockIndex: index,
        fieldName: context.fieldName,
      })
      if (nested.changed) changed = true
      nextArray.push(nested.value)
    }
    return changed ? { value: nextArray, changed: true } : { value, changed: false }
  }

  const record = asRecord(value)
  if (!record) return { value, changed: false }

  let changed = false
  const nextRecord: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(record)) {
    const nested = await sanitizeInlinePayloadDeep(nestedValue, {
      turnId: context.turnId,
      itemId: context.itemId,
      blockIndex: context.blockIndex,
      fieldName: key,
    })
    if (nested.changed) changed = true
    nextRecord[key] = nested.value
  }

  return changed ? { value: nextRecord, changed: true } : { value, changed: false }
}

export async function sanitizeThreadTurnsInlinePayloads(method: string, result: unknown): Promise<unknown> {
  if (!THREAD_METHODS_WITH_TURNS.has(method)) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !turns || turns.length === 0) return result

  let changed = false
  const nextTurns: unknown[] = []
  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turn = turns[turnIndex]
    const turnRecord = asRecord(turn)
    const turnId = asNonEmptyString(turnRecord?.id) ?? 'turn'
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : null
    if (!turnRecord || !items) {
      nextTurns.push(turn)
      continue
    }

    let itemChanged = false
    const nextItems: unknown[] = []
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]
      const itemRecord = asRecord(item)
      const itemId = asNonEmptyString(itemRecord?.id) ?? 'item'
      if (!itemRecord) {
        nextItems.push(item)
        continue
      }
      const sanitizedItem = await sanitizeInlinePayloadDeep(item, {
        turnId,
        itemId,
        blockIndex: itemIndex + turnIndex,
      })
      if (!sanitizedItem.changed) {
        nextItems.push(item)
        continue
      }
      itemChanged = true
      nextItems.push(sanitizedItem.value)
    }

    if (!itemChanged) {
      nextTurns.push(turn)
      continue
    }
    changed = true
    nextTurns.push({
      ...turnRecord,
      items: nextItems,
    })
  }

  if (!changed) return result
  return {
    ...record,
    thread: {
      ...thread,
      turns: nextTurns,
    },
  }
}

function trimThreadTurnsInRpcResult(method: string, result: unknown): unknown {
  if (!THREAD_METHODS_WITH_TURNS.has(method)) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !turns || turns.length <= THREAD_RESPONSE_TURN_LIMIT) return result

  return {
    ...record,
    thread: {
      ...thread,
      turns: turns.slice(-THREAD_RESPONSE_TURN_LIMIT),
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

function formatProjectlessDateSegment(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function buildProjectlessPromptSlug(prompt: string | null): string {
  const slug = prompt
    ?.toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 6)
    .join('-')
    .slice(0, PROJECTLESS_THREAD_SLUG_MAX_LENGTH)
  return slug && slug.length > 0 ? slug : 'new-chat'
}

async function ensureRealDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a real directory`)
  }
}

async function createProjectlessThreadDirectory(prompt: string | null): Promise<{ cwd: string; outputDirectory: string; workspaceRoot: string }> {
  const workspaceRoot = join(homedir(), 'Documents', 'Codex')
  await mkdir(workspaceRoot, { recursive: true })
  await ensureRealDirectory(workspaceRoot, 'Projectless workspace root')

  const dateDir = join(workspaceRoot, formatProjectlessDateSegment())
  await mkdir(dateDir, { recursive: true })
  await ensureRealDirectory(dateDir, 'Projectless thread date directory')

  const slug = buildProjectlessPromptSlug(prompt)
  for (let index = 0; index < PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS; index += 1) {
    const folderName = index === 0 ? slug : `${slug}-${index + 1}`
    const cwd = join(dateDir, folderName)
    try {
      await mkdir(cwd, { recursive: false })
      return { cwd, outputDirectory: cwd, workspaceRoot }
    } catch {
      try {
        await stat(cwd)
      } catch {
        throw new Error('Failed to create new chat folder')
      }
    }
  }

  throw new Error('Unable to create a unique new chat folder')
}

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function normalizeQueryParams(value: unknown): URLSearchParams {
  const params = new URLSearchParams()
  const record = asRecord(value)
  if (!record) return params

  for (const [key, rawValue] of Object.entries(record)) {
    const normalized = normalizeHeaderValue(rawValue)
    if (!normalized) continue
    params.set(key, normalized)
  }

  return params
}

function buildProviderModelsUrl(baseUrl: string, queryParams: unknown): URL {
  const url = new URL(baseUrl)
  url.pathname = url.pathname.endsWith('/') ? `${url.pathname}models` : `${url.pathname}/models`
  const extraParams = normalizeQueryParams(queryParams)
  for (const [key, value] of extraParams.entries()) {
    url.searchParams.set(key, value)
  }
  return url
}

function normalizeProviderModelsData(payload: unknown): string[] {
  const record = asRecord(payload)
  const rows = Array.isArray(record?.data) ? record.data : null
  if (!rows) {
    throw new Error('provider /models payload is missing a data array')
  }

  const ids: string[] = []
  for (const row of rows) {
    const entry = asRecord(row)
    const candidate = readNonEmptyString(entry?.id)
    if (!candidate || ids.includes(candidate)) continue
    ids.push(candidate)
  }
  return ids
}

async function fetchCustomEndpointDefaultModel(baseUrl: string, apiKey: string): Promise<string> {
  const normalizedBaseUrl = baseUrl.trim()
  if (!normalizedBaseUrl) return ''

  try {
    const modelsUrl = buildProviderModelsUrl(normalizedBaseUrl, null)
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    const response = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS) })
    if (!response.ok) return ''
    const payload = await response.json() as unknown
    const modelIds = normalizeProviderModelsData(payload)
    return modelIds[0] ?? ''
  } catch {
    return ''
  }
}

async function readProviderBackedModelIds(appServer: AppServerProcess): Promise<ProviderModelsResponse> {
  const configPayload = asRecord(await appServer.rpc('config/read', {}))
  const config = asRecord(configPayload?.config)
  const providerId = readNonEmptyString(config?.model_provider)
  if (!providerId) {
    return { data: [], providerId: '', source: 'provider' }
  }

  const providers = asRecord(config?.model_providers)
  const provider = asRecord(providers?.[providerId])
  if (!provider) {
    logProviderModelDiscoveryWarning('configured provider is missing from model_providers', { providerId })
    return { data: [], providerId, source: 'provider' }
  }

  const wireApi = readNonEmptyString(provider.wire_api)
  if (wireApi !== 'responses') {
    return { data: [], providerId, source: 'provider' }
  }

  const baseUrl = readNonEmptyString(provider.base_url)
  if (!baseUrl) {
    logProviderModelDiscoveryWarning('responses provider is missing base_url', { providerId })
    return { data: [], providerId, source: 'provider' }
  }

  const headers = new Headers()
  const configuredHeaders = asRecord(provider.http_headers)
  if (configuredHeaders) {
    for (const [key, rawValue] of Object.entries(configuredHeaders)) {
      const normalized = normalizeHeaderValue(rawValue)
      if (!normalized) continue
      headers.set(key, normalized)
    }
  }

  const bearerToken = readNonEmptyString(provider.experimental_bearer_token)
  if (bearerToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearerToken}`)
  }

  const envKey = readNonEmptyString(provider.env_key)
  const envHttpHeaders = asRecord(provider.env_http_headers)
  if (envKey || envHttpHeaders) {
    logProviderModelDiscoveryWarning('provider discovery skipped env-backed auth/header expansion', {
      providerId,
      hasEnvKey: Boolean(envKey),
      hasEnvHttpHeaders: Boolean(envHttpHeaders),
    })
  }

  let requestUrl: URL
  try {
    requestUrl = buildProviderModelsUrl(baseUrl, provider.query_params)
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models URL was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid url'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  let response: Response
  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models request failed', {
      providerId,
      error: isTimeoutError(error) ? `request timed out after ${PROVIDER_MODELS_FETCH_TIMEOUT_MS}ms` : getErrorMessage(error, 'network error'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models response was not valid JSON', {
      providerId,
      status: response.status,
      error: getErrorMessage(error, 'invalid json'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  if (!response.ok) {
    logProviderModelDiscoveryWarning('provider /models request returned non-2xx', {
      providerId,
      status: response.status,
      statusText: response.statusText,
    })
    return { data: [], providerId, source: 'provider' }
  }

  try {
    return {
      data: normalizeProviderModelsData(payload),
      providerId,
      source: 'provider',
    }
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models payload was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid payload'),
    })
    return { data: [], providerId, source: 'provider' }
  }
}

function extractThreadMessageText(threadReadPayload: unknown): string {
  const payload = asRecord(threadReadPayload)
  const thread = asRecord(payload?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const parts: string[] = []

  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : []
    for (const item of items) {
      const itemRecord = asRecord(item)
      const type = typeof itemRecord?.type === 'string' ? itemRecord.type : ''
      if (type === 'agentMessage' && typeof itemRecord?.text === 'string' && itemRecord.text.trim().length > 0) {
        parts.push(itemRecord.text.trim())
        continue
      }
      if (type === 'userMessage') {
        const content = Array.isArray(itemRecord?.content) ? itemRecord.content : []
        for (const block of content) {
          const blockRecord = asRecord(block)
          if (blockRecord?.type === 'text' && typeof blockRecord.text === 'string' && blockRecord.text.trim().length > 0) {
            parts.push(blockRecord.text.trim())
          }
        }
        continue
      }
      if (type === 'commandExecution') {
        const command = typeof itemRecord?.command === 'string' ? itemRecord.command.trim() : ''
        const output = typeof itemRecord?.aggregatedOutput === 'string' ? itemRecord.aggregatedOutput.trim() : ''
        if (command) parts.push(command)
        if (output) parts.push(output)
      }
    }
  }

  return parts.join('\n').trim()
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

type TerminalQuickCommand = {
  label: string
  value: string
  source: 'package' | 'script' | 'make'
}

async function listTerminalQuickCommands(cwd: string): Promise<TerminalQuickCommand[]> {
  const normalizedCwd = isAbsolute(cwd) ? cwd : resolve(cwd)
  const info = await stat(normalizedCwd)
  if (!info.isDirectory()) {
    throw new Error('Terminal cwd is not a directory')
  }

  const commands: TerminalQuickCommand[] = []
  const seen = new Set<string>()
  const addCommand = (command: TerminalQuickCommand) => {
    if (!command.value || seen.has(command.value)) return
    seen.add(command.value)
    commands.push(command)
  }

  await addPackageJsonCommands(normalizedCwd, addCommand)
  await addMakefileCommands(normalizedCwd, addCommand)
  await addRootScriptCommands(normalizedCwd, addCommand)
  await addScriptsDirectoryCommands(normalizedCwd, addCommand)
  return commands
}

async function addPackageJsonCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const record = asRecord(parsed)
    const scripts = asRecord(record?.scripts)
    if (!scripts) return
    const packageManager = resolvePackageManager(cwd)
    for (const scriptName of Object.keys(scripts)) {
      if (typeof scripts[scriptName] !== 'string') continue
      const value = formatPackageScriptCommand(packageManager, scriptName)
      addCommand({
        label: value,
        value,
        source: 'package',
      })
    }
  } catch {
    // A project without package.json simply has no package quick commands.
  }
}

async function addMakefileCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  const makefilePath = existsSync(join(cwd, 'Makefile'))
    ? join(cwd, 'Makefile')
    : existsSync(join(cwd, 'makefile'))
      ? join(cwd, 'makefile')
      : ''
  if (!makefilePath) return

  try {
    const raw = await readFile(makefilePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_.@%/+~-][A-Za-z0-9_.@%/+~-]*)\s*:(?![=])/.exec(line)
      if (!match) continue
      const target = match[1]
      if (!target || target.startsWith('.')) continue
      const value = `make ${quoteShellTokenIfNeeded(target)}`
      addCommand({
        label: value,
        value,
        source: 'make',
      })
    }
  } catch {
    // Ignore unreadable Makefiles for quick-command discovery.
  }
}

async function addRootScriptCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  await addScriptFileCommands(cwd, '.', addCommand)
}

async function addScriptsDirectoryCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  await addScriptFileCommands(join(cwd, 'scripts'), './scripts', addCommand)
}

async function addScriptFileCommands(
  directory: string,
  commandPrefix: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.sh') && !entry.name.endsWith('.cmd')) continue
      const value = `${commandPrefix}/${quoteShellTokenIfNeeded(entry.name)}`
      addCommand({
        label: value,
        value,
        source: 'script',
      })
    }
  } catch {
    // A project without script files simply has no script-file quick commands.
  }
}

function resolvePackageManager(cwd: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  return 'npm'
}

function formatPackageScriptCommand(packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun', scriptName: string): string {
  const quoted = quoteShellTokenIfNeeded(scriptName)
  if (packageManager === 'npm') return `npm run ${quoted}`
  if (packageManager === 'pnpm') return `pnpm run ${quoted}`
  if (packageManager === 'bun') return `bun run ${quoted}`
  return `yarn ${quoted}`
}

function quoteShellTokenIfNeeded(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function resolveComposioCommand(): string | null {
  const candidates = [
    process.env.CODEXUI_COMPOSIO_COMMAND?.trim() ?? '',
    join(homedir(), '.composio', 'composio'),
    'composio',
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    if ((candidate.includes('/') || candidate.includes('\\')) && !existsSync(candidate)) continue
    const invocation = getSpawnInvocation(candidate, ['--version'])
    const probe = spawnSync(invocation.command, invocation.args, {
      stdio: 'ignore',
      windowsHide: true,
    })
    if (!probe.error && probe.status === 0) {
      return candidate
    }
  }

  return null
}

function parseComposioJson<T>(stdout: string, fallback: string): T {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error(fallback)
  }
  return JSON.parse(trimmed) as T
}

async function runComposioJson<T>(args: string[], fallback: string): Promise<T> {
  const command = resolveComposioCommand()
  if (!command) {
    throw new Error('Composio CLI is not installed')
  }

  const invocation = getSpawnInvocation(command, args)
  const child = spawn(invocation.command, invocation.args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })

  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolveExit(code ?? 0))
  })

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || fallback)
  }

  try {
    return parseComposioJson<T>(stdout, fallback)
  } catch (error) {
    const details = stderr.trim() || stdout.trim()
    throw new Error(details || getErrorMessage(error, fallback))
  }
}

async function readComposioUserData(): Promise<ComposioUserData | null> {
  try {
    const raw = await readFile(COMPOSIO_USER_DATA_PATH, 'utf8')
    const payload = asRecord(JSON.parse(raw))
    if (!payload) return null
    return {
      apiKey: readNonEmptyString(payload.api_key),
      baseUrl: readNonEmptyString(payload.base_url),
      webUrl: readNonEmptyString(payload.web_url),
      orgId: readNonEmptyString(payload.org_id),
      testUserId: readNonEmptyString(payload.test_user_id),
    }
  } catch {
    return null
  }
}

function normalizeComposioConnection(value: unknown): ComposioConnectionSummary | null {
  const record = asRecord(value)
  if (!record) return null
  const authConfig = asRecord(record.auth_config)
  return {
    id: readNonEmptyString(record.id),
    wordId: readNonEmptyString(record.word_id),
    alias: readNonEmptyString(record.alias),
    status: readNonEmptyString(record.status),
    authScheme: readNonEmptyString(record.authScheme || authConfig?.auth_scheme),
    createdAt: readNonEmptyString(record.created_at),
    updatedAt: readNonEmptyString(record.updated_at),
    isComposioManaged: readBoolean(authConfig?.is_composio_managed),
    isDisabled: readBoolean(record.is_disabled),
  }
}

function normalizeComposioToolkit(value: unknown, connectionsBySlug: Map<string, ComposioConnectionSummary[]>): ComposioConnectorSummary | null {
  const record = asRecord(value)
  if (!record) return null
  const slug = readNonEmptyString(record.slug)
  if (!slug) return null
  const connectionRows = connectionsBySlug.get(slug) ?? []
  return {
    slug,
    name: readNonEmptyString(record.name),
    description: readNonEmptyString(record.description),
    logoUrl: readNonEmptyString(record.logo || record.meta && asRecord(record.meta)?.logo),
    latestVersion: readNonEmptyString(record.latest_version || record.latestVersion),
    toolsCount: readNumber(record.tools_count),
    triggersCount: readNumber(record.triggers_count),
    isNoAuth: readBoolean(record.is_no_auth),
    enabled: record.enabled !== false,
    authModes: Array.isArray(record.auth_modes) ? record.auth_modes.map(readNonEmptyString).filter(Boolean) : [],
    activeCount: connectionRows.filter((row) => row.status === 'ACTIVE' && !row.isDisabled).length,
    totalConnections: connectionRows.length,
    connectionStatuses: [...new Set(connectionRows.map((row) => row.status).filter(Boolean))],
  }
}

function normalizeComposioTool(value: unknown): ComposioToolSummary | null {
  const record = asRecord(value)
  if (!record) return null
  const slug = readNonEmptyString(record.slug)
  if (!slug) return null
  return {
    slug,
    name: readNonEmptyString(record.name),
    description: readNonEmptyString(record.description),
  }
}

async function readComposioConnectionsBySlug(): Promise<Map<string, ComposioConnectionSummary[]>> {
  const payload = asRecord(await runComposioJson<Record<string, unknown>>(['connections', 'list'], 'Failed to list Composio connections'))
  const bySlug = new Map<string, ComposioConnectionSummary[]>()
  for (const [slug, rawRows] of Object.entries(payload ?? {})) {
    if (!Array.isArray(rawRows)) continue
    const rows = rawRows.map(normalizeComposioConnection).filter((row): row is ComposioConnectionSummary => row !== null)
    bySlug.set(slug, rows)
  }
  return bySlug
}

async function readComposioStatus(): Promise<ComposioStatusResponse> {
  const cliVersion = (() => {
    const command = resolveComposioCommand()
    if (!command) return ''
    const invocation = getSpawnInvocation(command, ['--version'])
    const probe = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      windowsHide: true,
    })
    return probe.status === 0 ? probe.stdout.trim() : ''
  })()

  const userData = await readComposioUserData()
  if (!resolveComposioCommand()) {
    return {
      available: false,
      authenticated: false,
      cliVersion,
      email: '',
      defaultOrgName: '',
      defaultOrgId: userData?.orgId ?? '',
      webUrl: userData?.webUrl ?? '',
      baseUrl: userData?.baseUrl ?? '',
      testUserId: userData?.testUserId ?? '',
    }
  }

  try {
    const payload = asRecord(await runComposioJson<Record<string, unknown>>(['whoami'], 'Failed to read Composio account status'))
    return {
      available: true,
      authenticated: true,
      cliVersion,
      email: readNonEmptyString(payload?.email),
      defaultOrgName: readNonEmptyString(payload?.default_org_name),
      defaultOrgId: readNonEmptyString(payload?.default_org_id) || userData?.orgId || '',
      webUrl: userData?.webUrl || 'https://dashboard.composio.dev/',
      baseUrl: userData?.baseUrl || 'https://backend.composio.dev',
      testUserId: readNonEmptyString(payload?.test_user_id) || userData?.testUserId || '',
    }
  } catch {
    return {
      available: true,
      authenticated: false,
      cliVersion,
      email: '',
      defaultOrgName: '',
      defaultOrgId: userData?.orgId ?? '',
      webUrl: userData?.webUrl || 'https://dashboard.composio.dev/',
      baseUrl: userData?.baseUrl || 'https://backend.composio.dev',
      testUserId: userData?.testUserId ?? '',
    }
  }
}

async function listComposioConnectors(query: string, cursor: string | null = null, limit = 50): Promise<ComposioConnectorPage> {
  const args = ['dev', 'toolkits', 'list', '--limit', String(COMPOSIO_CONNECTORS_PAGE_LIMIT_MAX)]
  const trimmedQuery = query.trim()
  if (trimmedQuery) {
    args.push('--query', trimmedQuery)
  }
  const [payload, connectionsBySlug] = await Promise.all([
    runComposioJson<unknown[]>(args, 'Failed to list Composio toolkits'),
    readComposioConnectionsBySlug(),
  ])
  const allRows = payload
    .map((item) => normalizeComposioToolkit(item, connectionsBySlug))
    .filter((row): row is ComposioConnectorSummary => row !== null)
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(COMPOSIO_CONNECTORS_PAGE_LIMIT_MAX, Math.floor(limit))) : 50
  const safeCursor = parseComposioCursor(cursor, allRows.length)
  return {
    data: allRows.slice(safeCursor, safeCursor + safeLimit),
    nextCursor: safeCursor + safeLimit < allRows.length ? String(safeCursor + safeLimit) : null,
    total: allRows.length,
  }
}

function parseComposioCursor(cursor: string | null | undefined, maxLength: number): number {
  const trimmed = cursor?.trim() ?? ''
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) return 0
  if (parsed >= maxLength) return maxLength
  return parsed
}

function parseComposioLimit(rawLimit: string | null): number {
  const parsed = Number.parseInt((rawLimit ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) return 50
  return Math.max(1, Math.min(COMPOSIO_CONNECTORS_PAGE_LIMIT_MAX, parsed))
}

async function readComposioConnectorDetail(slug: string): Promise<ComposioConnectorDetail> {
  const normalizedSlug = slug.trim()
  if (!normalizedSlug) {
    throw new Error('Missing Composio connector slug')
  }

  const [infoPayload, toolsPayload, connectionsPayload, userData] = await Promise.all([
    runComposioJson<Record<string, unknown>>(['dev', 'toolkits', 'info', normalizedSlug], `Failed to load Composio toolkit ${normalizedSlug}`),
    runComposioJson<unknown[]>(['tools', 'list', normalizedSlug, '--limit', '10'], `Failed to list tools for ${normalizedSlug}`),
    runComposioJson<{ toolkit?: string; items?: unknown[] }>(['link', normalizedSlug, '--list'], `Failed to list connections for ${normalizedSlug}`),
    readComposioUserData(),
  ])

  const connections = Array.isArray(connectionsPayload.items)
    ? connectionsPayload.items.map(normalizeComposioConnection).filter((row): row is ComposioConnectionSummary => row !== null)
    : []
  const connector = normalizeComposioToolkit(infoPayload, new Map([[normalizedSlug, connections]]))
  if (!connector) {
    throw new Error(`Unknown Composio connector: ${normalizedSlug}`)
  }

  return {
    connector,
    connections,
    tools: Array.isArray(toolsPayload)
      ? toolsPayload.map(normalizeComposioTool).filter((row): row is ComposioToolSummary => row !== null)
      : [],
    dashboardUrl: userData?.webUrl || 'https://dashboard.composio.dev/',
  }
}

async function startComposioLink(slug: string): Promise<ComposioLinkResult> {
  const normalizedSlug = slug.trim()
  if (!normalizedSlug) {
    throw new Error('Missing Composio connector slug')
  }
  const payload = asRecord(await runComposioJson<Record<string, unknown>>(['link', normalizedSlug, '--no-wait'], `Failed to start Composio link for ${normalizedSlug}`))
  return {
    status: readNonEmptyString(payload?.status),
    message: readNonEmptyString(payload?.message),
    connectedAccountId: readNonEmptyString(payload?.connected_account_id),
    redirectUrl: readNonEmptyString(payload?.redirect_url),
    toolkit: readNonEmptyString(payload?.toolkit),
    projectType: readNonEmptyString(payload?.project_type),
  }
}

async function startComposioLogin(): Promise<ComposioLoginResult> {
  const command = resolveComposioCommand()
  if (!command) {
    throw new Error('Composio CLI is not installed')
  }
  const invocation = getSpawnInvocation(command, ['login', '--no-browser', '-y'])
  const proc = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  proc.unref()

  let stdout = ''
  let stderr = ''
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (chunk) => { stderr += chunk })

  const loginUrl = await new Promise<string>((resolveLoginUrl, reject) => {
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(stderr.trim() || stdout.trim() || 'Timed out waiting for Composio CLI login URL'))
    }, 10_000)
    const finish = (url: string) => {
      clearTimeout(timeout)
      proc.stdout.destroy()
      proc.stderr.destroy()
      resolveLoginUrl(url)
    }
    proc.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    proc.once('close', (code) => {
      clearTimeout(timeout)
      reject(new Error(stderr.trim() || stdout.trim() || `Composio CLI login exited with code ${code ?? 0}`))
    })
    proc.stdout.on('data', (chunk) => {
      stdout += chunk
      const url = stdout.match(/https?:\/\/\S+/)?.[0] ?? ''
      if (url) finish(url)
    })
  })

  const cliKey = loginUrl ? (new URL(loginUrl).searchParams.get('cliKey') ?? '') : ''
  return {
    status: 'started',
    message: 'Composio CLI login URL created',
    loginUrl,
    cliKey,
    expiresAt: '',
  }
}

async function installComposioCli(): Promise<ComposioInstallResult> {
  const command = 'bash'
  const installScriptUrl = 'https://composio.dev/install'
  const args = ['-lc', `curl -fsSL ${installScriptUrl} | bash`]
  const invocation = getSpawnInvocation(command, args)
  const env = {
    ...process.env,
    COMPOSIO_INSTALL_DIR: process.env.COMPOSIO_INSTALL_DIR?.trim() || join(homedir(), '.composio'),
  }
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    env,
    windowsHide: true,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (result.error || result.status !== 0) {
    throw new Error(output || result.error?.message || 'Failed to install Composio CLI')
  }
  return {
    ok: true,
    command: `curl -fsSL ${installScriptUrl} | bash`,
    output,
  }
}

function countRecoveredContentLines(value: string): number {
  if (!value) return 0
  const normalized = value.replace(/\r\n/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

function countRecoveredPatchLines(value: string): { addedLineCount: number; removedLineCount: number } {
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

function mergeRecoveredDiff(first: string, second: string): string {
  if (!first) return second
  if (!second || first === second) return first
  return `${first}\n${second}`.trim()
}

function mergeRecoveredFileChange(first: SessionRecoveredFileChange, second: SessionRecoveredFileChange): SessionRecoveredFileChange {
  const operation = first.operation === 'add' || second.operation === 'add'
    ? 'add'
    : first.operation === 'delete' || second.operation === 'delete'
      ? 'delete'
      : 'update'

  return {
    path: second.path || first.path,
    operation,
    movedToPath: second.movedToPath ?? first.movedToPath ?? null,
    diff: mergeRecoveredDiff(first.diff, second.diff),
    addedLineCount: first.addedLineCount + second.addedLineCount,
    removedLineCount: first.removedLineCount + second.removedLineCount,
  }
}

function isApplyPatchSectionBoundary(value: string): boolean {
  return value.startsWith('*** Update File: ')
    || value.startsWith('*** Add File: ')
    || value.startsWith('*** Delete File: ')
    || value === '*** End Patch'
}

function parseApplyPatchInput(input: string): SessionRecoveredFileChange[] {
  const normalized = input.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const changes: SessionRecoveredFileChange[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''

    if (line.startsWith('*** Add File: ')) {
      const path = line.slice('*** Add File: '.length).trim()
      const contentLines: string[] = []
      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? ''
        if (isApplyPatchSectionBoundary(nextLine)) {
          index -= 1
          break
        }
        contentLines.push(nextLine.startsWith('+') ? nextLine.slice(1) : nextLine)
      }
      const diff = contentLines.join('\n').trimEnd()
      if (path) {
        changes.push({
          path,
          operation: 'add',
          movedToPath: null,
          diff,
          addedLineCount: countRecoveredContentLines(diff),
          removedLineCount: 0,
        })
      }
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const path = line.slice('*** Delete File: '.length).trim()
      if (path) {
        changes.push({
          path,
          operation: 'delete',
          movedToPath: null,
          diff: '',
          addedLineCount: 0,
          removedLineCount: 0,
        })
      }
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const path = line.slice('*** Update File: '.length).trim()
      let movedToPath: string | null = null
      const diffLines: string[] = []

      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? ''
        if (nextLine.startsWith('*** Move to: ')) {
          const moved = nextLine.slice('*** Move to: '.length).trim()
          movedToPath = moved || null
          continue
        }
        if (isApplyPatchSectionBoundary(nextLine)) {
          index -= 1
          break
        }
        diffLines.push(nextLine)
      }

      const diff = diffLines.join('\n').trimEnd()
      const counts = countRecoveredPatchLines(diff)
      if (path) {
        changes.push({
          path,
          operation: 'update',
          movedToPath,
          diff,
          ...counts,
        })
      }
    }
  }

  return changes
}

function buildSessionFileChangeFallback(threadReadPayload: unknown, sessionLogRaw: string): SessionRecoveredTurnFileChanges[] {
  const payload = asRecord(threadReadPayload)
  const thread = asRecord(payload?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const turnIndexById = new Map<string, number>()

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turnRecord = asRecord(turns[turnIndex])
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) {
      turnIndexById.set(turnId, turnIndex)
    }
  }

  const collectedByTurnId = new Map<string, SessionRecoveredFileChange[]>()
  let currentTurnId = ''

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const payloadRecord = asRecord(row.payload)
      currentTurnId = readNonEmptyString(payloadRecord?.turn_id) || currentTurnId
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIndexById.has(currentTurnId)) {
      continue
    }

    const payloadRecord = asRecord(row.payload)
    if (
      payloadRecord?.type !== 'custom_tool_call'
      || payloadRecord.name !== 'apply_patch'
      || payloadRecord.status !== 'completed'
    ) {
      continue
    }

    const input = readNonEmptyString(payloadRecord.input)
    if (!input) continue

    const parsedChanges = parseApplyPatchInput(input)
    if (parsedChanges.length === 0) continue

    const previous = collectedByTurnId.get(currentTurnId) ?? []
    previous.push(...parsedChanges)
    collectedByTurnId.set(currentTurnId, previous)
  }

  const recovered: SessionRecoveredTurnFileChanges[] = []
  for (const [turnId, fileChanges] of collectedByTurnId.entries()) {
    const turnIndex = turnIndexById.get(turnId)
    if (typeof turnIndex !== 'number' || fileChanges.length === 0) continue

    const mergedByPath = new Map<string, SessionRecoveredFileChange>()
    for (const fileChange of fileChanges) {
      const key = `${fileChange.path}\u0000${fileChange.movedToPath ?? ''}`
      const previous = mergedByPath.get(key)
      mergedByPath.set(key, previous ? mergeRecoveredFileChange(previous, fileChange) : { ...fileChange })
    }

    recovered.push({
      turnId,
      turnIndex,
      fileChanges: Array.from(mergedByPath.values()),
    })
  }

  return recovered.sort((first, second) => first.turnIndex - second.turnIndex)
}

type SessionRecoveredCommand = {
  id: string
  type: 'commandExecution'
  command: string
  cwd: string | null
  status: 'completed' | 'failed'
  aggregatedOutput: string
  exitCode: number | null
  durationMs: number | null
}

function parseExecCommandOutput(output: string): { exitCode: number | null; wallTime: number | null; cleanOutput: string } {
  let exitCode: number | null = null
  let wallTime: number | null = null
  const outputLines: string[] = []
  let pastHeader = false

  for (const line of output.split('\n')) {
    if (!pastHeader) {
      const exitMatch = line.match(/^Process exited with code (\d+)/)
      if (exitMatch) {
        exitCode = Number.parseInt(exitMatch[1]!, 10)
        continue
      }
      const wallMatch = line.match(/^Wall time:\s+([\d.]+)\s+seconds/)
      if (wallMatch) {
        wallTime = Math.round(Number.parseFloat(wallMatch[1]!) * 1000)
        continue
      }
      if (line.startsWith('Command:') || line.startsWith('Chunk ID:') || line.startsWith('Original token count:')) {
        continue
      }
      if (line === 'Output:') {
        pastHeader = true
        continue
      }
    }
    outputLines.push(line)
  }

  return { exitCode, wallTime, cleanOutput: outputLines.join('\n').trimEnd() }
}

type SessionRecoveredFileChangeItem = {
  id: string
  type: 'fileChange'
  status: 'completed'
  changes: Record<string, unknown>[]
}

type SessionItemSlot = {
  type: 'agentMessage' | 'commandExecution' | 'fileChange'
  command?: SessionRecoveredCommand
  fileChange?: SessionRecoveredFileChangeItem
}

function buildSessionItemOrder(sessionLogRaw: string, turnIds: Set<string>): Map<string, SessionItemSlot[]> {
  let currentTurnId = ''
  const orderByTurnId = new Map<string, SessionItemSlot[]>()
  const callIdToCommand = new Map<string, SessionRecoveredCommand>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const p = asRecord(row.payload)
      currentTurnId = readNonEmptyString(p?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const p = asRecord(row.payload)
      if (p?.type === 'task_started') {
        currentTurnId = readNonEmptyString(p.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIds.has(currentTurnId)) continue
    const payload = asRecord(row.payload)
    if (!payload) continue

    let slots = orderByTurnId.get(currentTurnId)
    if (!slots) {
      slots = []
      orderByTurnId.set(currentTurnId, slots)
    }

    if (payload.type === 'message' && payload.role === 'assistant') {
      slots.push({ type: 'agentMessage' })
      continue
    }

    if (payload.type === 'function_call' && payload.name === 'exec_command') {
      const callId = readNonEmptyString(payload.call_id)
      if (!callId) continue
      let cmd = ''
      try {
        const args = JSON.parse(payload.arguments as string) as Record<string, unknown>
        cmd = typeof args.cmd === 'string' ? args.cmd : ''
      } catch { /* empty */ }
      const command: SessionRecoveredCommand = {
        id: `session-cmd-${callId}`,
        type: 'commandExecution',
        command: cmd,
        cwd: null,
        status: 'completed',
        aggregatedOutput: '',
        exitCode: null,
        durationMs: null,
      }
      callIdToCommand.set(callId, command)
      slots.push({ type: 'commandExecution', command })
      continue
    }

    if (payload.type === 'function_call_output') {
      const callId = readNonEmptyString(payload.call_id)
      if (!callId) continue
      const existing = callIdToCommand.get(callId)
      if (!existing) continue
      const rawOutput = typeof payload.output === 'string' ? payload.output : ''
      const parsed = parseExecCommandOutput(rawOutput)
      existing.aggregatedOutput = parsed.cleanOutput
      existing.exitCode = parsed.exitCode
      existing.durationMs = parsed.wallTime
      existing.status = parsed.exitCode === 0 || parsed.exitCode === null ? 'completed' : 'failed'
    }

    if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch' && payload.status === 'completed') {
      const input = typeof payload.input === 'string' ? payload.input : ''
      const callId = readNonEmptyString(payload.call_id)
      if (!input || !callId) continue
      const parsedChanges = parseApplyPatchInput(input)
      if (parsedChanges.length === 0) continue
      const fcItem: SessionRecoveredFileChangeItem = {
        id: `session-fc-${callId}`,
        type: 'fileChange',
        status: 'completed',
        changes: parsedChanges.map((fc) => ({
          ...fc,
          kind: { type: fc.operation, ...(fc.movedToPath ? { move_path: fc.movedToPath } : {}) },
        })),
      }
      slots.push({ type: 'fileChange', fileChange: fcItem })
    }
  }

  return orderByTurnId
}

function extractFilePathsFromCommand(cmd: string, cwd: string): string[] {
  const paths: string[] = []
  const absPathPattern = /(?:^|\s|>>|>|<)(\/?(?:Users|home|tmp|var|etc|root)\/[^\s;|&><"']+)/g
  let match: RegExpExecArray | null
  while ((match = absPathPattern.exec(cmd)) !== null) {
    const p = match[1]?.trim()
    if (p && !p.endsWith('/') && !p.startsWith('-')) paths.push(p)
  }

  const redirectPattern = /(?:>>?|cat\s*>\s*)([^\s;|&><"']+)/g
  while ((match = redirectPattern.exec(cmd)) !== null) {
    const p = match[1]?.trim()
    if (p && !p.startsWith('-') && !p.startsWith('/dev/')) {
      paths.push(isAbsolute(p) ? p : join(cwd, p))
    }
  }

  return [...new Set(paths)]
}

type CollectedTurnFileInfo = {
  patchInputs: { callId: string; input: string }[]
  commandFilePaths: string[]
}

function collectFileChangesForTurns(
  sessionLogRaw: string,
  turnIdsToRevert: Set<string>,
  cwd: string,
): Map<string, CollectedTurnFileInfo> {
  let currentTurnId = ''
  const infoByTurnId = new Map<string, CollectedTurnFileInfo>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const p = asRecord(row.payload)
      currentTurnId = readNonEmptyString(p?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const p = asRecord(row.payload)
      if (p?.type === 'task_started') {
        currentTurnId = readNonEmptyString(p.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIdsToRevert.has(currentTurnId)) continue
    const payload = asRecord(row.payload)
    if (!payload) continue

    let info = infoByTurnId.get(currentTurnId)
    if (!info) {
      info = { patchInputs: [], commandFilePaths: [] }
      infoByTurnId.set(currentTurnId, info)
    }

    if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch' && payload.status === 'completed') {
      const input = typeof payload.input === 'string' ? payload.input : ''
      const callId = readNonEmptyString(payload.call_id)
      if (input && callId) {
        info.patchInputs.push({ callId, input })
      }
    }

    if (payload.type === 'function_call' && payload.name === 'exec_command') {
      let cmd = ''
      try {
        const args = JSON.parse(payload.arguments as string) as Record<string, unknown>
        cmd = typeof args.cmd === 'string' ? args.cmd : ''
      } catch { /* empty */ }
      if (cmd) {
        const extracted = extractFilePathsFromCommand(cmd, cwd)
        for (const p of extracted) {
          if (!info.commandFilePaths.includes(p)) info.commandFilePaths.push(p)
        }
      }
    }
  }

  return infoByTurnId
}

function reverseV4aDiff(fileContent: string, diffText: string): string | null {
  const fileLines = fileContent.split('\n')
  const rawDiffLines = diffText.split('\n')
  while (rawDiffLines.length > 0 && rawDiffLines[rawDiffLines.length - 1]?.trim() === '') rawDiffLines.pop()
  const diffLines = rawDiffLines
  const result = [...fileLines]

  type DiffEntry = { type: 'context' | 'add' | 'remove'; text: string }
  const hunks: DiffEntry[][] = []
  let currentHunk: DiffEntry[] | null = null

  for (const dl of diffLines) {
    if (dl.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = []
      continue
    }
    if (!currentHunk) continue
    if (dl.startsWith('+')) {
      currentHunk.push({ type: 'add', text: dl.slice(1) })
    } else if (dl.startsWith('-')) {
      currentHunk.push({ type: 'remove', text: dl.slice(1) })
    } else if (dl.startsWith(' ')) {
      currentHunk.push({ type: 'context', text: dl.slice(1) })
    } else {
      currentHunk.push({ type: 'context', text: dl })
    }
  }
  if (currentHunk) hunks.push(currentHunk)

  for (let hi = hunks.length - 1; hi >= 0; hi--) {
    const hunk = hunks[hi]!
    const expectedSequence = hunk
      .filter((e) => e.type === 'context' || e.type === 'add')
      .map((e) => e.text)

    if (expectedSequence.length === 0) continue

    let seqStart = -1
    outer: for (let ri = result.length - expectedSequence.length; ri >= 0; ri--) {
      for (let si = 0; si < expectedSequence.length; si++) {
        if (result[ri + si] !== expectedSequence[si]) continue outer
      }
      seqStart = ri
      break
    }

    if (seqStart < 0) return null

    const newLines: string[] = []
    let seqIdx = 0
    for (const entry of hunk) {
      if (entry.type === 'context') {
        newLines.push(result[seqStart + seqIdx]!)
        seqIdx++
      } else if (entry.type === 'add') {
        seqIdx++
      } else if (entry.type === 'remove') {
        newLines.push(entry.text)
      }
    }

    result.splice(seqStart, expectedSequence.length, ...newLines)
  }

  return result.join('\n')
}

async function revertTurnFileChanges(
  cwd: string,
  turnInfos: Map<string, CollectedTurnFileInfo>,
): Promise<{ reverted: number; errors: string[] }> {
  if (turnInfos.size === 0) return { reverted: 0, errors: [] }

  let reverted = 0
  const errors: string[] = []

  const allEntries = [...turnInfos.values()]
  const allPatchInputs = allEntries.flatMap((info) => info.patchInputs).reverse()
  const allCommandPaths = new Set(allEntries.flatMap((info) => info.commandFilePaths))

  let isGitRepo = false
  let gitRoot = ''
  try {
    gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
    isGitRepo = !!gitRoot
  } catch { /* not a git repo */ }

  const trackedFiles = new Set<string>()
  if (isGitRepo) {
    try {
      const tracked = await runCommandCapture('git', ['ls-files', '--full-name'], { cwd: gitRoot })
      for (const f of tracked.split('\n')) {
        if (f.trim()) trackedFiles.add(join(gitRoot, f.trim()))
      }
    } catch { /* empty */ }
  }

  const patchRevertedPaths = new Set<string>()

  for (const patch of allPatchInputs) {
    const changes = parseApplyPatchInput(patch.input)
    for (let ci = changes.length - 1; ci >= 0; ci--) {
      const change = changes[ci]!
      const filePath = isAbsolute(change.path) ? change.path : join(cwd, change.path)

      try {
        if (change.operation === 'add') {
          const fileStat = await stat(filePath).catch(() => null)
          if (fileStat) {
            await rm(filePath, { force: true })
            reverted++
            patchRevertedPaths.add(filePath)
          }
        } else if (change.operation === 'update' && change.diff) {
          let reversed = false
          try {
            const currentContent = await readFile(filePath, 'utf8')
            const newContent = reverseV4aDiff(currentContent, change.diff)
            if (newContent !== null && newContent !== currentContent) {
              const { writeFile } = await import('node:fs/promises')
              await writeFile(filePath, newContent)
              reverted++
              patchRevertedPaths.add(filePath)
              reversed = true
            }
          } catch { /* file read/write failed */ }

          if (!reversed) {
            const isTracked = trackedFiles.has(filePath)
            if (isTracked && isGitRepo) {
              const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
              try {
                await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
                reverted++
                patchRevertedPaths.add(filePath)
              } catch {
                errors.push(`Could not revert: ${filePath}`)
              }
            } else {
              errors.push(`Could not reverse patch for untracked file: ${filePath}`)
            }
          }
        } else if (change.operation === 'delete') {
          const isTracked = trackedFiles.has(filePath)
          if (isTracked && isGitRepo) {
            const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
            try {
              await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
              reverted++
              patchRevertedPaths.add(filePath)
            } catch {
              errors.push(`Could not restore deleted file: ${filePath}`)
            }
          }
        }
      } catch (err) {
        errors.push(`Failed to revert patch for ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  for (const filePath of allCommandPaths) {
    if (patchRevertedPaths.has(filePath)) continue
    const isTracked = trackedFiles.has(filePath)
    if (isTracked && isGitRepo) {
      const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
      try {
        await runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
        reverted++
      } catch {
        errors.push(`Could not restore command-modified file: ${filePath}`)
      }
    }
  }

  return { reverted, errors }
}

function mergeSessionCommandsIntoTurns(turns: unknown[], sessionLogRaw: string): unknown[] {
  const turnIds = new Set<string>()
  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) turnIds.add(turnId)
  }

  if (turnIds.size === 0) return turns

  const orderByTurnId = buildSessionItemOrder(sessionLogRaw, turnIds)
  if (orderByTurnId.size === 0) return turns

  return turns.map((turn) => {
    const turnRecord = asRecord(turn)
    if (!turnRecord) return turn
    const turnId = readNonEmptyString(turnRecord.id)
    if (!turnId) return turn

    const slots = orderByTurnId.get(turnId)
    if (!slots || slots.length === 0) return turn

    const existingItems = Array.isArray(turnRecord.items) ? (turnRecord.items as Record<string, unknown>[]) : []
    const alreadyHasRecoveredItems = existingItems.some((it) => it.type === 'commandExecution' || it.type === 'fileChange')
    if (alreadyHasRecoveredItems) return turn

    const agentMessages = existingItems.filter((it) => it.type === 'agentMessage')
    const nonAgentNonUserItems = existingItems.filter((it) => it.type !== 'agentMessage' && it.type !== 'userMessage')
    const userMessages = existingItems.filter((it) => it.type === 'userMessage')

    let agentIdx = 0
    const interleaved: Record<string, unknown>[] = [...userMessages]

    for (const slot of slots) {
      if (slot.type === 'agentMessage') {
        if (agentIdx < agentMessages.length) {
          interleaved.push(agentMessages[agentIdx]!)
          agentIdx++
        }
      } else if (slot.type === 'commandExecution' && slot.command) {
        interleaved.push(slot.command as unknown as Record<string, unknown>)
      } else if (slot.type === 'fileChange' && slot.fileChange) {
        interleaved.push(slot.fileChange as unknown as Record<string, unknown>)
      }
    }

    while (agentIdx < agentMessages.length) {
      interleaved.push(agentMessages[agentIdx]!)
      agentIdx++
    }

    interleaved.push(...nonAgentNonUserItems)

    return {
      ...turnRecord,
      items: interleaved,
    }
  })
}

function isExactPhraseMatch(query: string, doc: ThreadSearchDocument): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return (
    doc.title.toLowerCase().includes(q) ||
    doc.preview.toLowerCase().includes(q) ||
    doc.messageText.toLowerCase().includes(q)
  )
}

function scoreFileCandidate(path: string, query: string): number {
  if (!query) return 0
  const lowerPath = path.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const baseName = lowerPath.slice(lowerPath.lastIndexOf('/') + 1)
  if (baseName === lowerQuery) return 0
  if (baseName.startsWith(lowerQuery)) return 1
  if (baseName.includes(lowerQuery)) return 2
  if (lowerPath.includes(`/${lowerQuery}`)) return 3
  if (lowerPath.includes(lowerQuery)) return 4
  return 10
}

async function listFilesWithRipgrep(cwd: string): Promise<string[]> {
  return await new Promise<string[]>((resolve, reject) => {
    const ripgrepCommand = resolveRipgrepCommand()
    if (!ripgrepCommand) {
      reject(new Error('ripgrep (rg) is not available'))
      return
    }

    const proc = spawn(ripgrepCommand, ['--files', '--hidden', '-g', '!.git', '-g', '!node_modules'], {
      cwd,
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
        const rows = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        resolve(rows)
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      reject(new Error(details || 'rg --files failed'))
    })
  })
}

async function listAgentInstructionFiles(cwd: string): Promise<Array<{
  value: string
  label: string
  path: string
  content: string
  isDefault: boolean
  scope: 'project' | 'global'
}>> {
  const normalizedCwd = isAbsolute(cwd) ? cwd : resolve(cwd)
  const info = await stat(normalizedCwd)
  if (!info.isDirectory()) {
    throw new Error('cwd is not a directory')
  }

  const projectEntries = await readdir(normalizedCwd, { withFileTypes: true })
  const projectCustomFiles = projectEntries
    .filter((entry) => entry.isFile() && /^AGENTS(?:\.[^.]+)+\.md$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
  const rows: Array<{
    value: string
    label: string
    path: string
    content: string
    isDefault: boolean
    scope: 'project' | 'global'
  }> = []

  for (const fileName of ['AGENTS.md', ...projectCustomFiles]) {
    const filePath = join(normalizedCwd, fileName)
    try {
      const content = await readFile(filePath, 'utf8')
      rows.push({
        value: `project:${fileName}`,
        label: fileName === 'AGENTS.md' ? 'Default AGENTS.md' : `Project: ${fileName}`,
        path: filePath,
        content,
        isDefault: fileName === 'AGENTS.md',
        scope: 'project',
      })
    } catch {
      if (fileName === 'AGENTS.md') {
        rows.push({
          value: 'project:AGENTS.md',
          label: 'Default AGENTS.md',
          path: filePath,
          content: '',
          isDefault: true,
          scope: 'project',
        })
      }
    }
  }

  const codexHome = getCodexHomeDir()
  try {
    const globalEntries = await readdir(codexHome, { withFileTypes: true })
    const globalCustomFiles = globalEntries
      .filter((entry) => entry.isFile() && /^AGENTS(?:\.[^.]+)+\.md$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
    for (const fileName of globalCustomFiles) {
      const filePath = join(codexHome, fileName)
      try {
        const content = await readFile(filePath, 'utf8')
        rows.push({
          value: `global:${fileName}`,
          label: `Global: ${fileName}`,
          path: filePath,
          content,
          isDefault: false,
          scope: 'global',
        })
      } catch {
        // Ignore unreadable global personality files so one bad file does not hide project options.
      }
    }
  } catch {
    // A missing CODEX_HOME should not prevent project-level AGENTS selection.
  }

  return rows
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

async function getNeutralInstructionsCwd(): Promise<string> {
  const neutralCwd = join(tmpdir(), 'codex-web-agent-instructions-neutral')
  await mkdir(neutralCwd, { recursive: true })
  if (existsSync(join(neutralCwd, 'AGENTS.md'))) {
    throw new Error(`Neutral instructions cwd unexpectedly contains AGENTS.md: ${neutralCwd}`)
  }
  return neutralCwd
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

async function runCommand(command: string, args: string[], options: { cwd?: string } = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
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

function extractBranchLockedWorktreePath(error: unknown, branchName: string): string {
  const message = getErrorMessage(error, '')
  if (!message || !branchName) return ''
  const escapedBranch = branchName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`'${escapedBranch}' is already checked out at '([^']+)'`, 'u')
  const match = pattern.exec(message)
  return match?.[1]?.trim() ?? ''
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


function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !normalized.includes(item)) {
      normalized.push(item)
    }
  }
  return normalized
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key === 'string' && key.length > 0 && typeof item === 'string') {
      next[key] = item
    }
  }
  return next
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

type ThreadAutomationStatus = 'ACTIVE' | 'PAUSED'

type ThreadAutomationRecord = {
  id: string
  kind: 'heartbeat' | 'cron'
  name: string
  prompt: string
  rrule: string
  status: ThreadAutomationStatus
  targetThreadId: string | null
  createdAtMs: number | null
  updatedAtMs: number | null
  nextRunAtMs: number | null
}

function readTomlString(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function serializeTomlString(value: string): string {
  return JSON.stringify(value)
}

function parseAutomationToml(raw: string): ThreadAutomationRecord | null {
  const values: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const separatorIndex = trimmed.indexOf('=')
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (key) values[key] = value
  }

  const id = readTomlString(values.id ?? '')
  const kindValue = readTomlString(values.kind ?? 'heartbeat')
  const name = readTomlString(values.name ?? '')
  const prompt = readTomlString(values.prompt ?? '')
  const rrule = readTomlString(values.rrule ?? '')
  const statusValue = readTomlString(values.status ?? 'ACTIVE')
  const targetThreadId = readTomlString(values.target_thread_id ?? '') || null
  const createdAtMs = Number.parseInt(values.created_at ?? '', 10)
  const updatedAtMs = Number.parseInt(values.updated_at ?? '', 10)

  if (!id || !name || !prompt || !rrule) return null
  if (kindValue !== 'heartbeat' && kindValue !== 'cron') return null
  if (statusValue !== 'ACTIVE' && statusValue !== 'PAUSED') return null

  return {
    id,
    kind: kindValue,
    name,
    prompt,
    rrule,
    status: statusValue,
    targetThreadId,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : null,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : null,
    nextRunAtMs: null,
  }
}

function serializeAutomationToml(record: ThreadAutomationRecord): string {
  const lines = [
    'version = 1',
    `id = ${serializeTomlString(record.id)}`,
    `kind = ${serializeTomlString(record.kind)}`,
    `name = ${serializeTomlString(record.name)}`,
    `prompt = ${serializeTomlString(record.prompt)}`,
    `status = ${serializeTomlString(record.status)}`,
    `rrule = ${serializeTomlString(record.rrule)}`,
    `target_thread_id = ${serializeTomlString(record.targetThreadId ?? '')}`,
    `created_at = ${String(record.createdAtMs ?? Date.now())}`,
    `updated_at = ${String(record.updatedAtMs ?? Date.now())}`,
  ]
  return `${lines.join('\n')}\n`
}

function slugifyAutomationId(threadId: string, name: string): string {
  const preferred = name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
  if (preferred) return preferred.slice(0, 48)
  const fallback = threadId.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
  return `heartbeat-${fallback.slice(0, 24) || randomBytes(4).toString('hex')}`
}

async function readAutomationRecordFromFile(filePath: string): Promise<ThreadAutomationRecord | null> {
  try {
    return parseAutomationToml(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function listThreadHeartbeatAutomations(): Promise<Record<string, ThreadAutomationRecord>> {
  const automationRoot = getCodexAutomationsDir()
  const next: Record<string, ThreadAutomationRecord> = {}
  let entries
  try {
    entries = await readdir(automationRoot, { withFileTypes: true })
  } catch {
    return next
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const automation = await readAutomationRecordFromFile(join(automationRoot, entry.name, 'automation.toml'))
    if (!automation || automation.kind !== 'heartbeat' || !automation.targetThreadId) continue
    next[automation.targetThreadId] = automation
  }

  return next
}

async function readThreadHeartbeatAutomation(threadId: string): Promise<ThreadAutomationRecord | null> {
  const all = await listThreadHeartbeatAutomations()
  return all[threadId] ?? null
}

async function writeThreadHeartbeatAutomation(input: {
  threadId: string
  name: string
  prompt: string
  rrule: string
  status: ThreadAutomationStatus
}): Promise<ThreadAutomationRecord> {
  const threadId = input.threadId.trim()
  const name = input.name.trim()
  const prompt = input.prompt.trim()
  const rrule = input.rrule.trim()
  if (!threadId || !name || !prompt || !rrule) {
    throw new Error('threadId, name, prompt, and rrule are required')
  }

  const automationRoot = getCodexAutomationsDir()
  await mkdir(automationRoot, { recursive: true })
  const existing = await readThreadHeartbeatAutomation(threadId)
  const id = existing?.id ?? slugifyAutomationId(threadId, name)
  const automationDir = join(automationRoot, id)
  const now = Date.now()
  const record: ThreadAutomationRecord = {
    id,
    kind: 'heartbeat',
    name,
    prompt,
    rrule,
    status: input.status,
    targetThreadId: threadId,
    createdAtMs: existing?.createdAtMs ?? now,
    updatedAtMs: now,
    nextRunAtMs: null,
  }

  await mkdir(automationDir, { recursive: true })
  await writeFile(join(automationDir, 'automation.toml'), serializeAutomationToml(record), 'utf8')
  const memoryPath = join(automationDir, 'memory.md')
  try {
    await stat(memoryPath)
  } catch {
    await writeFile(memoryPath, '', 'utf8')
  }
  return record
}

async function deleteThreadHeartbeatAutomation(threadId: string): Promise<boolean> {
  const automation = await readThreadHeartbeatAutomation(threadId.trim())
  if (!automation) return false
  await rm(join(getCodexAutomationsDir(), automation.id), { recursive: true, force: true })
  return true
}

type ThreadTitleCache = { titles: Record<string, string>; order: string[] }
const MAX_THREAD_TITLES = 500
const EMPTY_THREAD_TITLE_CACHE: ThreadTitleCache = { titles: {}, order: [] }
const PINNED_THREAD_IDS_KEY = 'pinned-thread-ids'

type SessionIndexThreadTitleCacheState = {
  fileSignature: string | null
  cache: ThreadTitleCache
}

let sessionIndexThreadTitleCacheState: SessionIndexThreadTitleCacheState = {
  fileSignature: null,
  cache: EMPTY_THREAD_TITLE_CACHE,
}

type TelegramBridgeConfigState = {
  botToken: string
  chatIds: number[]
  allowedUserIds: Array<number | '*'>
}

function normalizeThreadTitleCache(value: unknown): ThreadTitleCache {
  const record = asRecord(value)
  if (!record) return EMPTY_THREAD_TITLE_CACHE
  const rawTitles = asRecord(record.titles)
  const titles: Record<string, string> = {}
  if (rawTitles) {
    for (const [k, v] of Object.entries(rawTitles)) {
      if (typeof v === 'string' && v.length > 0) titles[k] = v
    }
  }
  const order = normalizeStringArray(record.order)
  return { titles, order }
}

function normalizePinnedThreadIds(value: unknown): string[] {
  return normalizeStringArray(value)
}

function updateThreadTitleCache(cache: ThreadTitleCache, id: string, title: string): ThreadTitleCache {
  const titles = { ...cache.titles, [id]: title }
  const order = [id, ...cache.order.filter((o) => o !== id)]
  while (order.length > MAX_THREAD_TITLES) {
    const removed = order.pop()
    if (removed) delete titles[removed]
  }
  return { titles, order }
}

function removeFromThreadTitleCache(cache: ThreadTitleCache, id: string): ThreadTitleCache {
  const { [id]: _, ...titles } = cache.titles
  return { titles, order: cache.order.filter((o) => o !== id) }
}

type SessionIndexThreadTitle = {
  id: string
  title: string
  updatedAtMs: number
}

function normalizeSessionIndexThreadTitle(value: unknown): SessionIndexThreadTitle | null {
  const record = asRecord(value)
  if (!record) return null

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const title = typeof record.thread_name === 'string' ? record.thread_name.trim() : ''
  const updatedAtIso = typeof record.updated_at === 'string' ? record.updated_at.trim() : ''
  const updatedAtMs = updatedAtIso ? Date.parse(updatedAtIso) : Number.NaN

  if (!id || !title) return null
  return {
    id,
    title,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
  }
}

function trimThreadTitleCache(cache: ThreadTitleCache): ThreadTitleCache {
  const titles = { ...cache.titles }
  const order = cache.order.filter((id) => {
    if (!titles[id]) return false
    return true
  }).slice(0, MAX_THREAD_TITLES)

  for (const id of Object.keys(titles)) {
    if (!order.includes(id)) {
      delete titles[id]
    }
  }

  return { titles, order }
}

function mergeThreadTitleCaches(base: ThreadTitleCache, overlay: ThreadTitleCache): ThreadTitleCache {
  const titles = { ...base.titles, ...overlay.titles }
  const order: string[] = []

  for (const id of [...overlay.order, ...base.order]) {
    if (!titles[id] || order.includes(id)) continue
    order.push(id)
  }

  for (const id of Object.keys(titles)) {
    if (!order.includes(id)) {
      order.push(id)
    }
  }

  return trimThreadTitleCache({ titles, order })
}

async function readThreadTitleCache(): Promise<ThreadTitleCache> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadTitleCache(payload['thread-titles'])
  } catch {
    return EMPTY_THREAD_TITLE_CACHE
  }
}

async function writeThreadTitleCache(cache: ThreadTitleCache): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  payload['thread-titles'] = cache
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

async function readPinnedThreadIds(): Promise<string[]> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizePinnedThreadIds(payload[PINNED_THREAD_IDS_KEY])
  } catch {
    return []
  }
}

async function writePinnedThreadIds(threadIds: string[]): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }

  payload[PINNED_THREAD_IDS_KEY] = normalizePinnedThreadIds(threadIds)
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

const FIRST_LAUNCH_PLUGINS_CARD_DISMISSED_KEY = 'first-launch-plugins-card-dismissed'
const THREAD_QUEUE_STATE_KEY = 'thread-queue-state'

type StoredQueuedMessage = {
  id: string
  text: string
  imageUrls: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  collaborationMode: 'default' | 'plan'
}

type ThreadQueueState = Record<string, StoredQueuedMessage[]>

type BackendQueuedTurn = {
  threadId: string
  message: StoredQueuedMessage
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

function normalizeThreadQueueState(value: unknown): ThreadQueueState {
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

async function readThreadQueueState(): Promise<ThreadQueueState> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadQueueState(payload[THREAD_QUEUE_STATE_KEY])
  } catch {
    return {}
  }
}

async function writeThreadQueueState(nextState: ThreadQueueState): Promise<void> {
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

async function readFirstLaunchPluginsCardDismissed(): Promise<boolean> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return payload[FIRST_LAUNCH_PLUGINS_CARD_DISMISSED_KEY] === true
  } catch {
    return false
  }
}

async function writeFirstLaunchPluginsCardDismissed(dismissed: boolean): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  payload[FIRST_LAUNCH_PLUGINS_CARD_DISMISSED_KEY] = dismissed === true
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

function getSessionIndexFileSignature(stats: { mtimeMs: number; size: number }): string {
  return `${String(stats.mtimeMs)}:${String(stats.size)}`
}

async function parseThreadTitlesFromSessionIndex(sessionIndexPath: string): Promise<ThreadTitleCache> {
  const latestById = new Map<string, SessionIndexThreadTitle>()
  const input = createReadStream(sessionIndexPath, { encoding: 'utf8' })
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const entry = normalizeSessionIndexThreadTitle(JSON.parse(trimmed) as unknown)
        if (!entry) continue

        const previous = latestById.get(entry.id)
        if (!previous || entry.updatedAtMs >= previous.updatedAtMs) {
          latestById.set(entry.id, entry)
        }
      } catch {
        // Skip malformed lines and keep scanning the rest of the index.
      }
    }
  } finally {
    lines.close()
    input.close()
  }

  const entries = Array.from(latestById.values()).sort((first, second) => second.updatedAtMs - first.updatedAtMs)
  const titles: Record<string, string> = {}
  const order: string[] = []
  for (const entry of entries) {
    titles[entry.id] = entry.title
    order.push(entry.id)
  }

  return trimThreadTitleCache({ titles, order })
}

async function readThreadTitlesFromSessionIndex(): Promise<ThreadTitleCache> {
  const sessionIndexPath = getCodexSessionIndexPath()

  try {
    const stats = await stat(sessionIndexPath)
    const fileSignature = getSessionIndexFileSignature(stats)
    if (sessionIndexThreadTitleCacheState.fileSignature === fileSignature) {
      return sessionIndexThreadTitleCacheState.cache
    }

    const cache = await parseThreadTitlesFromSessionIndex(sessionIndexPath)
    sessionIndexThreadTitleCacheState = { fileSignature, cache }
    return cache
  } catch {
    sessionIndexThreadTitleCacheState = {
      fileSignature: 'missing',
      cache: EMPTY_THREAD_TITLE_CACHE,
    }
    return sessionIndexThreadTitleCacheState.cache
  }
}

async function readMergedThreadTitleCache(): Promise<ThreadTitleCache> {
  const [sessionIndexCache, persistedCache] = await Promise.all([
    readThreadTitlesFromSessionIndex(),
    readThreadTitleCache(),
  ])
  return mergeThreadTitleCaches(persistedCache, sessionIndexCache)
}

async function readWorkspaceRootsState(): Promise<WorkspaceRootsState> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}

  try {
    const raw = await readFile(statePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    payload = asRecord(parsed) ?? {}
  } catch {
    payload = {}
  }

  return {
    order: normalizeStringArray(payload['electron-saved-workspace-roots']),
    labels: normalizeStringRecord(payload['electron-workspace-root-labels']),
    active: normalizeStringArray(payload['active-workspace-roots']),
  }
}

async function writeWorkspaceRootsState(nextState: WorkspaceRootsState): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }

  payload['electron-saved-workspace-roots'] = normalizeStringArray(nextState.order)
  payload['electron-workspace-root-labels'] = normalizeStringRecord(nextState.labels)
  payload['active-workspace-roots'] = normalizeStringArray(nextState.active)

  await writeFile(statePath, JSON.stringify(payload), 'utf8')
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

function bufferIndexOf(buf: Buffer, needle: Buffer, start = 0): number {
  for (let i = start; i <= buf.length - needle.length; i++) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) { match = false; break }
    }
    if (match) return i
  }
  return -1
}

function handleFileUpload(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks)
      const contentType = req.headers['content-type'] ?? ''
      const boundaryMatch = contentType.match(/boundary=(.+)/i)
      if (!boundaryMatch) { setJson(res, 400, { error: 'Missing multipart boundary' }); return }
      const boundary = boundaryMatch[1]
      const boundaryBuf = Buffer.from(`--${boundary}`)
      const parts: Buffer[] = []
      let searchStart = 0
      while (searchStart < body.length) {
        const idx = body.indexOf(boundaryBuf, searchStart)
        if (idx < 0) break
        if (searchStart > 0) parts.push(body.subarray(searchStart, idx))
        searchStart = idx + boundaryBuf.length
        if (body[searchStart] === 0x0d && body[searchStart + 1] === 0x0a) searchStart += 2
      }
      let fileName = 'uploaded-file'
      let fileData: Buffer | null = null
      const headerSep = Buffer.from('\r\n\r\n')
      for (const part of parts) {
        const headerEnd = bufferIndexOf(part, headerSep)
        if (headerEnd < 0) continue
        const headers = part.subarray(0, headerEnd).toString('utf8')
        const fnMatch = headers.match(/filename="([^"]+)"/i)
        if (!fnMatch) continue
        fileName = fnMatch[1].replace(/[/\\]/g, '_')
        let end = part.length
        if (end >= 2 && part[end - 2] === 0x0d && part[end - 1] === 0x0a) end -= 2
        fileData = part.subarray(headerEnd + 4, end)
        break
      }
      if (!fileData) { setJson(res, 400, { error: 'No file in request' }); return }
      const uploadDir = join(tmpdir(), 'codex-web-uploads')
      await mkdir(uploadDir, { recursive: true })
      const destDir = await mkdtemp(join(uploadDir, 'f-'))
      const destPath = join(destDir, fileName)
      await writeFile(destPath, fileData)
      setJson(res, 200, { path: destPath })
    } catch (err) {
      setJson(res, 500, { error: getErrorMessage(err, 'Upload failed') })
    }
  })
  req.on('error', (err: Error) => {
    setJson(res, 500, { error: getErrorMessage(err, 'Upload stream error') })
  })
}

function httpPost(
  url: string,
  headers: Record<string, string | number>,
  body: Buffer,
): Promise<{ status: number; body: string }> {
  const doRequest = url.startsWith('http://') ? httpRequest : httpsRequest
  return new Promise((resolve, reject) => {
    const req = doRequest(url, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

let curlImpersonateAvailable: boolean | null = null

function curlImpersonatePost(
  url: string,
  headers: Record<string, string | number>,
  body: Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-w', '\n%{http_code}', '-X', 'POST', url]
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'content-length') continue
      args.push('-H', `${k}: ${String(v)}`)
    }
    args.push('--data-binary', '@-')
    const proc = spawn('curl-impersonate-chrome', args, {
      env: { ...process.env, CURL_IMPERSONATE: 'chrome116' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    proc.stdout.on('data', (c: Buffer) => chunks.push(c))
    proc.on('error', (e) => {
      curlImpersonateAvailable = false
      reject(e)
    })
    proc.on('close', (code) => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const lastNewline = raw.lastIndexOf('\n')
      const statusStr = lastNewline >= 0 ? raw.slice(lastNewline + 1).trim() : ''
      const responseBody = lastNewline >= 0 ? raw.slice(0, lastNewline) : raw
      const status = parseInt(statusStr, 10) || (code === 0 ? 200 : 500)
      curlImpersonateAvailable = true
      resolve({ status, body: responseBody })
    })
    proc.stdin.write(body)
    proc.stdin.end()
  })
}

async function proxyTranscribe(
  body: Buffer,
  contentType: string,
  authToken: string,
  accountId?: string,
): Promise<{ status: number; body: string }> {
  const chatgptHeaders: Record<string, string | number> = {
    'Content-Type': contentType,
    'Content-Length': body.length,
    Authorization: `Bearer ${authToken}`,
    originator: 'Codex Desktop',
    'User-Agent': `Codex Desktop/0.1.0 (${process.platform}; ${process.arch})`,
  }
  if (accountId) chatgptHeaders['ChatGPT-Account-Id'] = accountId

  const postFn = curlImpersonateAvailable !== false ? curlImpersonatePost : httpPost
  let result: { status: number; body: string }
  try {
    result = await postFn('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
  } catch {
    result = await httpPost('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
  }

  if (result.status === 403 && result.body.includes('cf_chl')) {
    if (curlImpersonateAvailable !== false && postFn !== curlImpersonatePost) {
      try {
        const ciResult = await curlImpersonatePost('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
        if (ciResult.status !== 403) return ciResult
      } catch {}
    }
    return { status: 503, body: JSON.stringify({ error: 'Transcription blocked by Cloudflare. Install curl-impersonate-chrome.' }) }
  }

  return result
}

function parseConnectorLogoUrl(rawUrl: string): { connectorId: string; theme: 'light' | 'dark' } | null {
  const trimmed = rawUrl.trim()
  if (!trimmed.startsWith('connectors://')) return null
  const rest = trimmed.slice('connectors://'.length)
  const connectorId = (rest.split(/[/?#]/u)[0] ?? '').trim()
  if (!connectorId) return null
  const query = rest.includes('?') ? rest.slice(rest.indexOf('?') + 1).split('#')[0] ?? '' : ''
  const theme = new URLSearchParams(query).get('theme')?.toLowerCase() === 'dark' ? 'dark' : 'light'
  return { connectorId, theme }
}

async function fetchConnectorLogo(rawUrl: string): Promise<{ contentType: string; body: Buffer }> {
  const parsed = parseConnectorLogoUrl(rawUrl)
  if (!parsed) throw new Error('Unsupported connector logo URL')
  const auth = await readCodexAuth()
  if (!auth) throw new Error('No auth token available for connector logo')

  const endpoint = `https://chatgpt.com/backend-api/aip/connectors/${encodeURIComponent(parsed.connectorId)}/logo?theme=${parsed.theme}`
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      originator: 'Codex Desktop',
      'User-Agent': `Codex Desktop/0.1.0 (${process.platform}; ${process.arch})`,
      ...(auth.accountId ? { 'ChatGPT-Account-Id': auth.accountId } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Connector logo fetch failed (${response.status})`)

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = asRecord(await response.json())
    const body = asRecord(payload?.body)
    const base64 = readNonEmptyString(body?.base64)
    const nestedContentType = readNonEmptyString(body?.contentType) ?? readNonEmptyString(body?.content_type)
    if (!base64 || !nestedContentType) throw new Error('Connector logo response was missing image data')
    return { contentType: nestedContentType, body: Buffer.from(base64, 'base64') }
  }

  return {
    contentType: contentType || 'image/png',
    body: Buffer.from(await response.arrayBuffer()),
  }
}

const STREAM_EVENT_BUFFER_LIMIT = 400

type StreamEventFrame = {
  method: string
  params: unknown
  atIso: string
}

type CapturedItem = {
  id: string
  type: string
  turnId: string
  data: Record<string, unknown>
  completed: boolean
}

const MERGEABLE_ITEM_TYPES = new Set([
  'commandExecution',
  'fileChange',
])

class AppServerProcess {
  private process: ChildProcessWithoutNullStreams | null = null
  private initialized = false
  private initializePromise: Promise<void> | null = null
  private readBuffer = ''
  private nextId = 1
  private stopping = false
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()
  private readonly notificationListeners = new Set<(value: { method: string; params: unknown }) => void>()
  private readonly pendingServerRequests = new Map<number, PendingServerRequest>()
  private readonly appServerArgs = buildAppServerArgs()
  private readonly streamEventsByThreadId = new Map<string, StreamEventFrame[]>()
  private readonly lastThreadReadSnapshotByThreadId = new Map<string, unknown>()
  private readonly capturedItemsByThreadId = new Map<string, Map<string, CapturedItem>>()
  private readonly liveStateCache = new Map<string, { data: unknown; turnCount: number; sessionSize: number }>()
  private chatgptAuthRefreshPromise: Promise<ChatgptAuthTokensRefreshResponse> | null = null


  private getCodexCommand(): string {
    const codexCommand = resolveCodexCommand()
    if (!codexCommand) {
      throw new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.')
    }
    return codexCommand
  }

  private buildAppServerConfig(): { args: string[]; env: Record<string, string> } {
    const args = [
      'app-server',
      '-c', 'approval_policy="never"',
      '-c', 'sandbox_mode="danger-full-access"',
    ]
    let extraEnv: Record<string, string> = {}
    const serverPort = parseInt(process.env.CODEXUI_SERVER_PORT ?? '', 10) || undefined
    const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
    try {
      const raw = readFileSync(statePath, 'utf8')
      const state = JSON.parse(raw) as FreeModeState
      args.push(...getFreeModeConfigArgs(state, serverPort))
      extraEnv = getFreeModeEnvVars(state)
    } catch {
      // No free-mode state or invalid — use defaults
    }
    return { args, env: extraEnv }
  }

  private start(): void {
    if (this.process) return

    this.stopping = false
    const config = this.buildAppServerConfig()
    const invocation = getSpawnInvocation(this.getCodexCommand(), config.args)
    const spawnEnv = Object.keys(config.env).length > 0
      ? { ...process.env, ...config.env }
      : undefined
    const proc = spawn(invocation.command, invocation.args, { stdio: ['pipe', 'pipe', 'pipe'], ...(spawnEnv ? { env: spawnEnv } : {}) })
    this.process = proc

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      this.readBuffer += chunk

      let lineEnd = this.readBuffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = this.readBuffer.slice(0, lineEnd).trim()
        this.readBuffer = this.readBuffer.slice(lineEnd + 1)

        if (line.length > 0) {
          this.handleLine(line)
        }

        lineEnd = this.readBuffer.indexOf('\n')
      }
    })

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', () => {
      // Keep stderr silent in dev middleware; JSON-RPC errors are forwarded via responses.
    })

    proc.on('exit', () => {
      if (this.process !== proc) {
        return
      }

      const failure = new Error(this.stopping ? 'codex app-server stopped' : 'codex app-server exited unexpectedly')
      for (const request of this.pending.values()) {
        request.reject(failure)
      }

      this.pending.clear()
      this.pendingServerRequests.clear()
      this.process = null
      this.initialized = false
      this.initializePromise = null
      this.readBuffer = ''
    })
  }

  private sendLine(payload: Record<string, unknown>): void {
    if (!this.process) {
      throw new Error('codex app-server is not running')
    }

    this.process.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse
    try {
      message = JSON.parse(line) as JsonRpcResponse
    } catch {
      return
    }

    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pendingRequest = this.pending.get(message.id)
      this.pending.delete(message.id)

      if (!pendingRequest) return

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message))
      } else {
        pendingRequest.resolve(message.result)
      }
      return
    }

    if (typeof message.method === 'string' && typeof message.id !== 'number') {
      this.emitNotification({
        method: message.method,
        params: message.params ?? null,
      })
      return
    }

    // Handle server-initiated JSON-RPC requests (approvals, dynamic tool calls, etc.).
    if (typeof message.id === 'number' && typeof message.method === 'string') {
      this.handleServerRequest(message.id, message.method, message.params ?? null)
    }
  }

  private emitNotification(notification: { method: string; params: unknown }): void {
    this.recordStreamEvent(notification)
    this.captureItemFromNotification(notification)
    const nThreadId = this.extractThreadIdFromParams(notification.params)
    if (nThreadId) this.invalidateLiveStateCache(nThreadId)
    for (const listener of this.notificationListeners) {
      listener(notification)
    }
  }

  private extractThreadIdFromParams(params: unknown): string {
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

  private recordStreamEvent(notification: { method: string; params: unknown }): void {
    const threadId = this.extractThreadIdFromParams(notification.params)
    if (!threadId) return
    const frame: StreamEventFrame = {
      method: notification.method,
      params: notification.params,
      atIso: new Date().toISOString(),
    }
    let buffer = this.streamEventsByThreadId.get(threadId)
    if (!buffer) {
      buffer = []
      this.streamEventsByThreadId.set(threadId, buffer)
    }
    buffer.push(frame)
    if (buffer.length > STREAM_EVENT_BUFFER_LIMIT) {
      buffer.splice(0, buffer.length - STREAM_EVENT_BUFFER_LIMIT)
    }
  }

  getStreamEvents(threadId: string, limit: number): StreamEventFrame[] {
    const buffer = this.streamEventsByThreadId.get(threadId)
    if (!buffer || buffer.length === 0) return []
    return buffer.slice(-limit)
  }

  storeThreadReadSnapshot(threadId: string, snapshot: unknown): void {
    this.lastThreadReadSnapshotByThreadId.set(threadId, snapshot)
  }

  getLastThreadReadSnapshot(threadId: string): unknown | null {
    return this.lastThreadReadSnapshotByThreadId.get(threadId) ?? null
  }

  cacheLiveState(threadId: string, data: unknown, turnCount: number, sessionSize: number): void {
    this.liveStateCache.set(threadId, { data, turnCount, sessionSize })
  }

  getCachedLiveState(threadId: string, turnCount: number, sessionSize: number): unknown | null {
    const cached = this.liveStateCache.get(threadId)
    if (!cached) return null
    if (cached.turnCount !== turnCount || cached.sessionSize !== sessionSize) return null
    return cached.data
  }

  invalidateLiveStateCache(threadId: string): void {
    this.liveStateCache.delete(threadId)
  }

  private captureItemFromNotification(notification: { method: string; params: unknown }): void {
    if (notification.method !== 'item/started' && notification.method !== 'item/completed') return

    const params = asRecord(notification.params)
    if (!params) return
    const item = asRecord(params.item)
    if (!item) return
    const itemType = typeof item.type === 'string' ? item.type : ''
    if (!MERGEABLE_ITEM_TYPES.has(itemType)) return

    const itemId = typeof item.id === 'string' ? item.id : ''
    if (!itemId) return

    const threadId = this.extractThreadIdFromParams(params)
    if (!threadId) return

    const turnId =
      (typeof params.turnId === 'string' ? params.turnId : '') ||
      (typeof params.turn_id === 'string' ? params.turn_id : '')
    if (!turnId) return

    let threadItems = this.capturedItemsByThreadId.get(threadId)
    if (!threadItems) {
      threadItems = new Map()
      this.capturedItemsByThreadId.set(threadId, threadItems)
    }

    const isCompleted = notification.method === 'item/completed'
    const existing = threadItems.get(itemId)

    if (existing && existing.completed && !isCompleted) return

    threadItems.set(itemId, {
      id: itemId,
      type: itemType,
      turnId,
      data: item as Record<string, unknown>,
      completed: isCompleted,
    })
  }

  mergeItemsIntoTurns(threadId: string, turns: unknown[]): unknown[] {
    const capturedMap = this.capturedItemsByThreadId.get(threadId)
    if (!capturedMap || capturedMap.size === 0) return turns

    const itemsByTurnId = new Map<string, CapturedItem[]>()
    for (const captured of capturedMap.values()) {
      let group = itemsByTurnId.get(captured.turnId)
      if (!group) {
        group = []
        itemsByTurnId.set(captured.turnId, group)
      }
      group.push(captured)
    }

    return turns.map((turn) => {
      const turnRecord = asRecord(turn)
      if (!turnRecord) return turn
      const turnId = typeof turnRecord.id === 'string' ? turnRecord.id : ''
      if (!turnId) return turn

      const captured = itemsByTurnId.get(turnId)
      if (!captured || captured.length === 0) return turn

      const existingItems = Array.isArray(turnRecord.items) ? (turnRecord.items as Record<string, unknown>[]) : []
      const existingIds = new Set(existingItems.map((it) => (typeof it.id === 'string' ? it.id : '')).filter(Boolean))

      const newItems = captured
        .filter((c) => !existingIds.has(c.id))
        .map((c) => c.data)

      if (newItems.length === 0) return turn

      return {
        ...turnRecord,
        items: [...existingItems, ...newItems],
      }
    })
  }

  private sendServerRequestReply(requestId: number, reply: ServerRequestReply): void {
    if (reply.error) {
      this.sendLine({
        jsonrpc: '2.0',
        id: requestId,
        error: reply.error,
      })
      return
    }

    this.sendLine({
      jsonrpc: '2.0',
      id: requestId,
      result: reply.result ?? {},
    })
  }

  private resolvePendingServerRequest(requestId: number, reply: ServerRequestReply): void {
    const pendingRequest = this.pendingServerRequests.get(requestId)
    if (!pendingRequest) {
      throw new Error(`No pending server request found for id ${String(requestId)}`)
    }
    this.pendingServerRequests.delete(requestId)

    this.sendServerRequestReply(requestId, reply)
    const requestParams = asRecord(pendingRequest.params)
    const threadId =
      typeof requestParams?.threadId === 'string' && requestParams.threadId.length > 0
        ? requestParams.threadId
        : ''
    this.emitNotification({
      method: 'server/request/resolved',
      params: {
        id: requestId,
        method: pendingRequest.method,
        threadId,
        mode: 'manual',
        resolvedAtIso: new Date().toISOString(),
      },
    })
  }

  private async refreshChatgptAuthTokens(params: ChatgptAuthTokensRefreshParams): Promise<ChatgptAuthTokensRefreshResponse> {
    if (!this.chatgptAuthRefreshPromise) {
      this.chatgptAuthRefreshPromise = refreshChatgptAuthTokensForExternalAuth(params).finally(() => {
        this.chatgptAuthRefreshPromise = null
      })
    }
    return await this.chatgptAuthRefreshPromise
  }

  private async handleChatgptAuthTokensRefreshRequest(requestId: number, params: unknown): Promise<void> {
    const requestParams = asRecord(params)
    const previousAccountId = readNonEmptyString(requestParams?.previousAccountId ?? requestParams?.previous_account_id)
    try {
      const result = await this.refreshChatgptAuthTokens({
        reason: readNonEmptyString(requestParams?.reason) || undefined,
        previousAccountId: previousAccountId || undefined,
      })
      this.sendServerRequestReply(requestId, { result })
      this.emitNotification({
        method: 'server/request/resolved',
        params: {
          id: requestId,
          method: 'account/chatgptAuthTokens/refresh',
          mode: 'automatic',
          resolvedAtIso: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.sendServerRequestReply(requestId, {
        error: {
          code: -32001,
          message: getErrorMessage(error, 'Failed to refresh ChatGPT auth tokens'),
        },
      })
    }
  }

  private handleServerRequest(requestId: number, method: string, params: unknown): void {
    if (method === 'account/chatgptAuthTokens/refresh') {
      void this.handleChatgptAuthTokensRefreshRequest(requestId, params)
      return
    }

    const pendingRequest: PendingServerRequest = {
      id: requestId,
      method,
      params,
      receivedAtIso: new Date().toISOString(),
    }
    this.pendingServerRequests.set(requestId, pendingRequest)

    this.emitNotification({
      method: 'server/request',
      params: pendingRequest,
    })
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    this.start()
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      this.sendLine({
        jsonrpc: '2.0',
        id,
        method,
        params,
      } satisfies JsonRpcCall)
    })
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    if (this.initializePromise) {
      await this.initializePromise
      return
    }

    this.initializePromise = this.call('initialize', {
      clientInfo: {
        name: 'codex-web-local',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    }).then(() => {
      this.sendLine({
        jsonrpc: '2.0',
        method: 'initialized',
      })
      this.initialized = true
    }).finally(() => {
      this.initializePromise = null
    })

    await this.initializePromise
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    await this.ensureInitialized()
    return this.call(method, params)
  }

  onNotification(listener: (value: { method: string; params: unknown }) => void): () => void {
    this.notificationListeners.add(listener)
    return () => {
      this.notificationListeners.delete(listener)
    }
  }

  async respondToServerRequest(payload: unknown): Promise<void> {
    await this.ensureInitialized()

    const body = asRecord(payload)
    if (!body) {
      throw new Error('Invalid response payload: expected object')
    }

    const id = body.id
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error('Invalid response payload: "id" must be an integer')
    }

    const rawError = asRecord(body.error)
    if (rawError) {
      const message = typeof rawError.message === 'string' && rawError.message.trim().length > 0
        ? rawError.message.trim()
        : 'Server request rejected by client'
      const code = typeof rawError.code === 'number' && Number.isFinite(rawError.code)
        ? Math.trunc(rawError.code)
        : -32000
      this.resolvePendingServerRequest(id, { error: { code, message } })
      return
    }

    if (!('result' in body)) {
      throw new Error('Invalid response payload: expected "result" or "error"')
    }

    this.resolvePendingServerRequest(id, { result: body.result })
  }

  listPendingServerRequests(): PendingServerRequest[] {
    return Array.from(this.pendingServerRequests.values())
  }

  dispose(): void {
    if (!this.process) return

    const proc = this.process
    this.stopping = true
    this.process = null
    this.initialized = false
    this.initializePromise = null
    this.readBuffer = ''

    const failure = new Error('codex app-server stopped')
    for (const request of this.pending.values()) {
      request.reject(failure)
    }
    this.pending.clear()
    this.pendingServerRequests.clear()

    try {
      proc.stdin.end()
    } catch {
      // ignore close errors on shutdown
    }

    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore kill errors on shutdown
    }

    const forceKillTimer = setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL')
        } catch {
          // ignore kill errors on shutdown
        }
      }
    }, 1500)
    forceKillTimer.unref()
  }
}

class BackendQueueProcessor {
  private readonly processingThreadIds = new Set<string>()
  private readonly unsubscribe: () => void

  constructor(private readonly appServer: AppServerProcess) {
    this.unsubscribe = appServer.onNotification((notification) => {
      if (!isTurnCompletedNotification(notification)) return
      const threadId = extractThreadIdFromNotificationParams(notification.params)
      if (!threadId) return
      void this.processThreadQueue(threadId)
    })
  }

  dispose(): void {
    this.unsubscribe()
    this.processingThreadIds.clear()
  }

  private async processThreadQueue(threadId: string): Promise<void> {
    if (this.processingThreadIds.has(threadId)) return
    this.processingThreadIds.add(threadId)
    try {
      const next = await this.popNextQueuedTurn(threadId)
      if (!next) return
      try {
        await this.startQueuedTurn(next)
      } catch {
        await this.restoreQueuedTurn(next)
      }
    } catch {
      // Queue processing is best-effort. Keep the bridge alive if app-server is unavailable.
    } finally {
      this.processingThreadIds.delete(threadId)
    }
  }

  private async popNextQueuedTurn(threadId: string): Promise<BackendQueuedTurn | null> {
    const state = await readThreadQueueState()
    const queue = state[threadId]
    if (!queue || queue.length === 0) return null

    const [message, ...rest] = queue
    const nextState = { ...state }
    if (rest.length > 0) {
      nextState[threadId] = rest
    } else {
      delete nextState[threadId]
    }
    await writeThreadQueueState(nextState)
    return { threadId, message }
  }

  private async restoreQueuedTurn(turn: BackendQueuedTurn): Promise<void> {
    const state = await readThreadQueueState()
    const queue = state[turn.threadId] ?? []
    await writeThreadQueueState({
      ...state,
      [turn.threadId]: [turn.message, ...queue],
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

class MethodCatalog {
  private methodCache: string[] | null = null
  private notificationCache: string[] | null = null

  private async runGenerateSchemaCommand(outDir: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const codexCommand = resolveCodexCommand()
      if (!codexCommand) {
        reject(new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.'))
        return
      }

      const invocation = getSpawnInvocation(codexCommand, ['app-server', 'generate-json-schema', '--out', outDir])
      const process = spawn(invocation.command, invocation.args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''

      process.stderr.setEncoding('utf8')
      process.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })

      process.on('error', reject)
      process.on('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(stderr.trim() || `generate-json-schema exited with code ${String(code)}`))
      })
    })
  }

  private extractMethodsFromClientRequest(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  private extractMethodsFromServerNotification(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  async listMethods(): Promise<string[]> {
    if (this.methodCache) {
      return this.methodCache
    }

    const outDir = await mkdtemp(join(tmpdir(), 'codex-web-local-schema-'))
    await this.runGenerateSchemaCommand(outDir)

    const clientRequestPath = join(outDir, 'ClientRequest.json')
    const raw = await readFile(clientRequestPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const methods = this.extractMethodsFromClientRequest(parsed)

    this.methodCache = methods
    return methods
  }

  async listNotificationMethods(): Promise<string[]> {
    if (this.notificationCache) {
      return this.notificationCache
    }

    const outDir = await mkdtemp(join(tmpdir(), 'codex-web-local-schema-'))
    await this.runGenerateSchemaCommand(outDir)

    const serverNotificationPath = join(outDir, 'ServerNotification.json')
    const raw = await readFile(serverNotificationPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const methods = this.extractMethodsFromServerNotification(parsed)

    this.notificationCache = methods
    return methods
  }
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

async function loadAllThreadsForSearch(appServer: AppServerProcess): Promise<ThreadSearchDocument[]> {
  const threads: Array<{ id: string; title: string; preview: string }> = []
  let cursor: string | null = null

  do {
    const response = asRecord(await appServer.rpc('thread/list', {
      archived: false,
      limit: 100,
      sortKey: 'updated_at',
      modelProviders: [],
      cursor,
    }))
    const data = Array.isArray(response?.data) ? response.data : []
    for (const row of data) {
      const record = asRecord(row)
      const id = typeof record?.id === 'string' ? record.id : ''
      if (!id) continue
      const title = typeof record?.name === 'string' && record.name.trim().length > 0
        ? record.name.trim()
        : (typeof record?.preview === 'string' && record.preview.trim().length > 0 ? record.preview.trim() : 'Untitled thread')
      const preview = typeof record?.preview === 'string' ? record.preview : ''
      threads.push({ id, title, preview })
    }
    cursor = typeof response?.nextCursor === 'string' && response.nextCursor.length > 0 ? response.nextCursor : null
  } while (cursor)

  const docs: ThreadSearchDocument[] = threads.map((thread) => {
    const searchableText = [thread.title, thread.preview].filter(Boolean).join('\n')
    return {
      id: thread.id,
      title: thread.title,
      preview: thread.preview,
      messageText: '',
      searchableText,
    } satisfies ThreadSearchDocument
  })

  const docsById = new Map<string, ThreadSearchDocument>(docs.map((doc) => [doc.id, doc]))
  const fullTextThreads = threads.slice(0, THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT)
  const concurrency = 4
  for (let offset = 0; offset < fullTextThreads.length; offset += concurrency) {
    const batch = fullTextThreads.slice(offset, offset + concurrency)
    const loaded = await Promise.all(batch.map(async (thread) => {
      try {
        const readResponse = await appServer.rpc('thread/read', {
          threadId: thread.id,
          includeTurns: true,
        })
        const messageText = extractThreadMessageText(readResponse)
        const searchableText = [thread.title, thread.preview, messageText].filter(Boolean).join('\n')
        return [thread.id, {
          id: thread.id,
          title: thread.title,
          preview: thread.preview,
          messageText,
          searchableText,
        } satisfies ThreadSearchDocument] as const
      } catch {
        return null
      }
    }))
    for (const row of loaded) {
      if (!row) continue
      docsById.set(row[0], row[1])
    }
  }

  return Array.from(docsById.values())
}

async function buildThreadSearchIndex(appServer: AppServerProcess): Promise<ThreadSearchIndex> {
  const docs = await loadAllThreadsForSearch(appServer)
  const docsById = new Map<string, ThreadSearchDocument>(docs.map((doc) => [doc.id, doc]))
  return { docsById }
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
          const state = JSON.parse(readFileSync(statePath, 'utf8')) as FreeModeState
          bearerToken = state.apiKey ?? ''
          wireApi = state.wireApi === 'chat' ? 'chat' : 'responses'
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
          try {
            return JSON.parse(readFileSync(statePath, 'utf8')) as FreeModeState
          } catch {
            return { enabled: false, apiKey: null, model: FREE_MODE_DEFAULT_MODEL }
          }
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
            const freeModels = await getFreeModels()
            const maskedKey = state.apiKey && state.customKey
              ? state.apiKey.substring(0, 12) + '...' + state.apiKey.substring(state.apiKey.length - 4)
              : null
            setJson(res, 200, {
              enabled: state.enabled,
              keyCount: getFreeKeyCount(),
              models: freeModels,
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

        const rpcResult = await appServer.rpc(body.method, body.params ?? null)
        const trimmedResult = trimThreadTurnsInRpcResult(body.method, rpcResult)
        const sanitizedResult = await sanitizeThreadTurnsInlinePayloads(body.method, trimmedResult)
        const result = rewriteCustomAgentThreadCwd(sanitizedResult)

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

      if (req.method === 'POST' && url.pathname === '/codex-api/thread/start-with-agent-instructions') {
        const payload = asRecord(await readJsonBody(req))
        const targetCwd = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
        const model = typeof payload?.model === 'string' ? payload.model.trim() : ''
        const baseInstructions = typeof payload?.baseInstructions === 'string' ? payload.baseInstructions : ''
        if (!baseInstructions.trim()) {
          setJson(res, 400, { error: 'Missing baseInstructions' })
          return
        }
        try {
          const neutralCwd = await getNeutralInstructionsCwd()
          const params: Record<string, unknown> = {
            cwd: neutralCwd,
            baseInstructions,
          }
          if (model) params.model = model
          const rpcResult = await appServer.rpc('thread/start', params)
          const rpcRecord = asRecord(rpcResult)
          const thread = asRecord(rpcRecord?.thread)
          const threadId = typeof thread?.id === 'string' ? thread.id : ''
          if (threadId && targetCwd) {
            customAgentThreadCwdById.set(threadId, targetCwd)
          }
          setJson(res, 200, { result: rewriteCustomAgentThreadCwd(rpcResult) })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to start thread with custom agent instructions') })
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

          const result = await revertTurnFileChanges(cwd, turnInfos)
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
          const fmState = JSON.parse(readFileSync(join(getCodexHomeDir(), FREE_MODE_STATE_FILE), 'utf8')) as FreeModeState
          if (fmState.enabled) {
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

          const currentBranchRaw = await runCommandCapture('git', ['branch', '--show-current'], { cwd: gitRoot })
          const currentBranch = currentBranchRaw.trim() || null
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
          if (currentBranch && !branchActivityByName.has(currentBranch)) {
            branchActivityByName.set(currentBranch, Number.MAX_SAFE_INTEGER)
          }
          const options = Array.from(branchActivityByName.entries())
            .map(([value]) => ({ value, label: value }))
            .sort((a, b) => {
              const aActivity = branchActivityByName.get(a.value) ?? 0
              const bActivity = branchActivityByName.get(b.value) ?? 0
              if (bActivity !== aActivity) return bActivity - aActivity
              return a.value.localeCompare(b.value)
            })
          setJson(res, 200, {
            data: {
              currentBranch,
              options,
            },
          })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Git branches') })
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
          try {
            await runCommand('git', ['checkout', targetBranch], { cwd: gitRoot })
          } catch (checkoutError) {
            const blockingWorktreePath = extractBranchLockedWorktreePath(checkoutError, targetBranch)
            if (!blockingWorktreePath) {
              throw checkoutError
            }
            await runCommand('git', ['checkout', '--detach'], { cwd: blockingWorktreePath })
            await runCommand('git', ['checkout', targetBranch], { cwd: gitRoot })
          }
          const currentBranch = (await runCommandCapture('git', ['branch', '--show-current'], { cwd: gitRoot })).trim() || null
          setJson(res, 200, { data: { currentBranch } })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to switch branch') })
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
        const nextState: WorkspaceRootsState = {
          order: normalizeStringArray(record.order),
          labels: normalizeStringRecord(record.labels),
          active: normalizeStringArray(record.active),
        }
        await writeWorkspaceRootsState(nextState)
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

        const existingState = await readWorkspaceRootsState()
        const nextOrder = [normalizedPath, ...existingState.order.filter((item) => item !== normalizedPath)]
        const nextActive = [normalizedPath, ...existingState.active.filter((item) => item !== normalizedPath)]
        const nextLabels = { ...existingState.labels }
        if (label.trim().length > 0) {
          nextLabels[normalizedPath] = label.trim()
        }
        await writeWorkspaceRootsState({
          order: nextOrder,
          labels: nextLabels,
          active: nextActive,
        })
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

      if (req.method === 'GET' && url.pathname === '/codex-api/agent-instructions') {
        const rawCwd = url.searchParams.get('cwd')?.trim() ?? ''
        if (!rawCwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        try {
          const rows = await listAgentInstructionFiles(rawCwd)
          setJson(res, 200, { data: rows })
        } catch (error) {
          setJson(res, 400, { error: getErrorMessage(error, 'Failed to load agent instructions') })
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

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-automation') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        const automation = await readThreadHeartbeatAutomation(threadId)
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
        const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
        const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : ''
        const rrule = typeof payload?.rrule === 'string' ? payload.rrule.trim() : ''
        const status = payload?.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
        if (!threadId || !name || !prompt || !rrule) {
          setJson(res, 400, { error: 'threadId, name, prompt, and rrule are required' })
          return
        }
        const automation = await writeThreadHeartbeatAutomation({ threadId, name, prompt, rrule, status })
        setJson(res, 200, { data: automation })
        return
      }

      if (req.method === 'DELETE' && url.pathname === '/codex-api/thread-automation') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        const removed = await deleteThreadHeartbeatAutomation(threadId)
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
