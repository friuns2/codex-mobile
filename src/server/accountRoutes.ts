import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAppServerArgs } from './appServerRuntimeConfig.js'
import { callRpcWithRateLimitDecodeRecovery } from './rateLimitDecodeRecovery.js'

type AppServerLike = {
  rpc(method: string, params: unknown): Promise<unknown>
  listPendingServerRequests(): unknown[]
  dispose(): void
}

type AccountRouteContext = {
  appServer: AppServerLike
}

type StoredRateLimitWindow = {
  usedPercent: number
  windowMinutes: number | null
  resetsAt: number | null
}

type StoredCreditsSnapshot = {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

type StoredRateLimitSnapshot = {
  limitId: string | null
  limitName: string | null
  primary: StoredRateLimitWindow | null
  secondary: StoredRateLimitWindow | null
  credits: StoredCreditsSnapshot | null
  planType: string | null
}

type AccountQuotaStatus = 'idle' | 'loading' | 'ready' | 'error'
type AccountUnavailableReason = 'payment_required'

type StoredAccountEntry = {
  accountId: string
  storageId: string
  userId: string | null
  authMode: string | null
  email: string | null
  planType: string | null
  lastRefreshedAtIso: string
  lastActivatedAtIso: string | null
  quotaSnapshot: StoredRateLimitSnapshot | null
  quotaUpdatedAtIso: string | null
  quotaStatus: AccountQuotaStatus
  quotaError: string | null
  unavailableReason: AccountUnavailableReason | null
}

type StoredAccountsState = {
  activeAccountId: string | null
  activeStorageId: string | null
  accounts: StoredAccountEntry[]
}

type SnapshotMigrationResult = {
  accounts: StoredAccountEntry[]
  storageIdMap: Map<string, string>
  changed: boolean
}

type AuthFile = {
  auth_mode?: string
  tokens?: {
    access_token?: string
    account_id?: string
  }
}

type TokenMetadata = {
  email: string | null
  userId: string | null
  planType: string | null
}

type AccountInspection = {
  metadata: TokenMetadata
  quotaSnapshot: StoredRateLimitSnapshot | null
}

const ACCOUNT_QUOTA_REFRESH_TTL_MS = 5 * 60 * 1000
const ACCOUNT_QUOTA_LOADING_STALE_MS = 2 * 60 * 1000
const ACCOUNT_INSPECTION_TIMEOUT_MS = 25 * 1000
const LOGIN_URL_TIMEOUT_MS = 15 * 1000
const LOGIN_CALLBACK_TIMEOUT_MS = 20 * 1000
const LOGIN_AUTH_FILE_TIMEOUT_MS = 10 * 1000

let backgroundRefreshPromise: Promise<void> | null = null
let activeLogin: {
  proc: ChildProcessWithoutNullStreams
  loginUrl: string | null
  output: string
  exited: boolean
  exitCode: number | null
  exitSignal: NodeJS.Signals | null
  exitPromise: Promise<void>
} | null = null

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function normalizeAccountUnavailableReason(value: unknown): AccountUnavailableReason | null {
  return value === 'payment_required' ? value : null
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const rawBody = await new Promise<string>((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
  return asRecord(rawBody.length > 0 ? JSON.parse(rawBody) : {})
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }
  const record = asRecord(payload)
  const error = record?.error
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }
  if (typeof record?.message === 'string' && record.message.trim().length > 0) {
    return record.message.trim()
  }
  return fallback
}

function isPaymentRequiredErrorMessage(value: string | null): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized.includes('payment required') || /\b402\b/.test(normalized)
}

function detectAccountUnavailableReason(error: unknown): AccountUnavailableReason | null {
  return isPaymentRequiredErrorMessage(getErrorMessage(error, '')) ? 'payment_required' : null
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getActiveAuthPath(): string {
  return join(getCodexHomeDir(), 'auth.json')
}

function getAccountsStatePath(): string {
  return join(getCodexHomeDir(), 'accounts.json')
}

function getAccountsSnapshotRoot(): string {
  return join(getCodexHomeDir(), 'accounts')
}

function toStorageId(accountId: string): string {
  return createHash('sha256').update(accountId).digest('hex')
}

function toAccountStorageKey(accountId: string, metadata: TokenMetadata): string {
  return metadata.userId ? `${accountId}\u0000${metadata.userId}` : accountId
}

function toAccountStorageId(accountId: string, metadata: TokenMetadata): string {
  return toStorageId(toAccountStorageKey(accountId, metadata))
}

function pickLatestIso(left: string | null, right: string | null): string | null {
  if (!left) return right
  if (!right) return left
  return left.localeCompare(right) >= 0 ? left : right
}

function normalizeRateLimitWindow(value: unknown): StoredRateLimitWindow | null {
  const record = asRecord(value)
  if (!record) return null

  const usedPercent = readNumber(record.usedPercent ?? record.used_percent)
  if (usedPercent === null) return null

  return {
    usedPercent,
    windowMinutes: readNumber(record.windowDurationMins ?? record.window_minutes),
    resetsAt: readNumber(record.resetsAt ?? record.resets_at),
  }
}

function normalizeCreditsSnapshot(value: unknown): StoredCreditsSnapshot | null {
  const record = asRecord(value)
  if (!record) return null

  const hasCredits = readBoolean(record.hasCredits ?? record.has_credits)
  const unlimited = readBoolean(record.unlimited)
  if (hasCredits === null || unlimited === null) return null

  return {
    hasCredits,
    unlimited,
    balance: readString(record.balance),
  }
}

function normalizeRateLimitSnapshot(value: unknown): StoredRateLimitSnapshot | null {
  const record = asRecord(value)
  if (!record) return null

  const primary = normalizeRateLimitWindow(record.primary)
  const secondary = normalizeRateLimitWindow(record.secondary)
  const credits = normalizeCreditsSnapshot(record.credits)

  if (!primary && !secondary && !credits) return null

  return {
    limitId: readString(record.limitId ?? record.limit_id),
    limitName: readString(record.limitName ?? record.limit_name),
    primary,
    secondary,
    credits,
    planType: readString(record.planType ?? record.plan_type),
  }
}

function pickCodexRateLimitSnapshot(payload: unknown): StoredRateLimitSnapshot | null {
  const record = asRecord(payload)
  if (!record) return null

  const rateLimitsByLimitId = asRecord(record.rateLimitsByLimitId ?? record.rate_limits_by_limit_id)
  const codexBucket = normalizeRateLimitSnapshot(rateLimitsByLimitId?.codex)
  if (codexBucket) return codexBucket

  return normalizeRateLimitSnapshot(record.rateLimits ?? record.rate_limits)
}

function normalizeStoredAccountEntry(value: unknown): StoredAccountEntry | null {
  const record = asRecord(value)
  const accountId = readString(record?.accountId)
  const storageId = readString(record?.storageId)
  const lastRefreshedAtIso = readString(record?.lastRefreshedAtIso)
  const quotaStatusRaw = readString(record?.quotaStatus)
  const quotaStatus: AccountQuotaStatus =
    quotaStatusRaw === 'loading' || quotaStatusRaw === 'ready' || quotaStatusRaw === 'error' ? quotaStatusRaw : 'idle'
  if (!accountId || !storageId || !lastRefreshedAtIso) return null

  return {
    accountId,
    storageId,
    userId: readString(record?.userId),
    authMode: readString(record?.authMode),
    email: readString(record?.email),
    planType: readString(record?.planType),
    lastRefreshedAtIso,
    lastActivatedAtIso: readString(record?.lastActivatedAtIso),
    quotaSnapshot: normalizeRateLimitSnapshot(record?.quotaSnapshot),
    quotaUpdatedAtIso: readString(record?.quotaUpdatedAtIso),
    quotaStatus,
    quotaError: readString(record?.quotaError),
    unavailableReason: normalizeAccountUnavailableReason(record?.unavailableReason)
      ?? (isPaymentRequiredErrorMessage(readString(record?.quotaError)) ? 'payment_required' : null),
  }
}

async function resolveActiveStorageId(
  accounts: StoredAccountEntry[],
  activeStorageId: string | null,
  activeAccountId: string | null,
): Promise<string | null> {
  if (activeStorageId && accounts.some((entry) => entry.storageId === activeStorageId)) {
    return activeStorageId
  }

  const activeAuthStorageId = await readActiveAuthStorageId()
  if (activeAuthStorageId && accounts.some((entry) => entry.storageId === activeAuthStorageId)) {
    return activeAuthStorageId
  }

  if (!activeAccountId) return null
  const matchingAccounts = accounts.filter((entry) => entry.accountId === activeAccountId)
  return matchingAccounts.length === 1 ? matchingAccounts[0]?.storageId ?? null : null
}

function resolveActiveState(accounts: StoredAccountEntry[], activeStorageId: string | null): Pick<StoredAccountsState, 'activeAccountId' | 'activeStorageId'> {
  const active = activeStorageId ? accounts.find((entry) => entry.storageId === activeStorageId) ?? null : null
  return {
    activeAccountId: active?.accountId ?? null,
    activeStorageId: active?.storageId ?? null,
  }
}

async function readStoredAccountsState(): Promise<StoredAccountsState> {
  let activeAccountId: string | null = null
  let rawActiveStorageId: string | null = null
  let accounts: StoredAccountEntry[] = []
  try {
    const raw = await readFile(getAccountsStatePath(), 'utf8')
    const parsed = asRecord(JSON.parse(raw))
    activeAccountId = readString(parsed?.activeAccountId)
    rawActiveStorageId = readString(parsed?.activeStorageId)
    const rawAccounts = Array.isArray(parsed?.accounts) ? parsed.accounts : []
    accounts = rawAccounts
      .map((entry) => normalizeStoredAccountEntry(entry))
      .filter((entry): entry is StoredAccountEntry => entry !== null)
  } catch {
    accounts = []
  }

  try {
    const migration = await migrateStoredAccountSnapshots(accounts)
    const migratedActiveStorageId = rawActiveStorageId ? migration.storageIdMap.get(rawActiveStorageId) ?? rawActiveStorageId : null
    const activeStorageId = await resolveActiveStorageId(migration.accounts, migratedActiveStorageId, activeAccountId)
    const nextState = {
      ...resolveActiveState(migration.accounts, activeStorageId),
      accounts: migration.accounts,
    }
    if (migration.changed || nextState.activeStorageId !== rawActiveStorageId || nextState.activeAccountId !== activeAccountId) {
      await writeStoredAccountsState(nextState).catch(() => undefined)
    }
    return nextState
  } catch {
    try {
      await writeStoredAccountsState({ activeAccountId: null, activeStorageId: null, accounts })
    } catch {
      // ignore
    }
    return { activeAccountId: null, activeStorageId: null, accounts }
  }
}

async function writeStoredAccountsState(state: StoredAccountsState): Promise<void> {
  await writeFile(getAccountsStatePath(), JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function withUpsertedAccount(state: StoredAccountsState, nextEntry: StoredAccountEntry): StoredAccountsState {
  const rest = state.accounts.filter((entry) => entry.storageId !== nextEntry.storageId)
  const accounts = [nextEntry, ...rest]
  return {
    ...resolveActiveState(accounts, state.activeStorageId),
    accounts,
  }
}

function sortAccounts(accounts: StoredAccountEntry[], activeStorageId: string | null): StoredAccountEntry[] {
  return [...accounts].sort((left, right) => {
    const leftActive = left.storageId === activeStorageId ? 1 : 0
    const rightActive = right.storageId === activeStorageId ? 1 : 0
    if (leftActive !== rightActive) return rightActive - leftActive
    return right.lastRefreshedAtIso.localeCompare(left.lastRefreshedAtIso)
  })
}

function toPublicAccountEntry(entry: StoredAccountEntry, activeStorageId: string | null): StoredAccountEntry & { isActive: boolean } {
  return {
    ...entry,
    isActive: entry.storageId === activeStorageId,
  }
}

function decodeBase64UrlJson(input: string): Record<string, unknown> | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    const raw = Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
    const parsed = JSON.parse(raw) as unknown
    return asRecord(parsed)
  } catch {
    return null
  }
}

function extractTokenMetadata(accessToken: string | undefined): TokenMetadata {
  if (!accessToken || typeof accessToken !== 'string') {
    return { email: null, userId: null, planType: null }
  }
  const parts = accessToken.split('.')
  if (parts.length < 2) {
    return { email: null, userId: null, planType: null }
  }
  const payload = decodeBase64UrlJson(parts[1] ?? '')
  const profile = asRecord(payload?.['https://api.openai.com/profile'])
  const auth = asRecord(payload?.['https://api.openai.com/auth'])
  return {
    email: typeof profile?.email === 'string' && profile.email.trim().length > 0 ? profile.email.trim() : null,
    userId: readString(auth?.user_id ?? auth?.userId),
    planType:
      typeof auth?.chatgpt_plan_type === 'string' && auth.chatgpt_plan_type.trim().length > 0
        ? auth.chatgpt_plan_type.trim()
        : null,
  }
}

async function readAuthFileFromPath(path: string): Promise<{ raw: string; parsed: AuthFile; accountId: string; authMode: string | null; metadata: TokenMetadata }> {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as AuthFile
  const accountId = parsed.tokens?.account_id?.trim() ?? ''
  if (!accountId) {
    throw new Error('missing_account_id')
  }
  return {
    raw,
    parsed,
    accountId,
    authMode: typeof parsed.auth_mode === 'string' && parsed.auth_mode.trim().length > 0 ? parsed.auth_mode.trim() : null,
    metadata: extractTokenMetadata(parsed.tokens?.access_token),
  }
}

async function readActiveAuthStorageId(): Promise<string | null> {
  try {
    const activeAuth = await readAuthFileFromPath(getActiveAuthPath())
    return toAccountStorageId(activeAuth.accountId, activeAuth.metadata)
  } catch {
    return null
  }
}

async function listSnapshotStorageIds(): Promise<string[]> {
  try {
    const entries = await readdir(getAccountsSnapshotRoot(), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function createStoredAccountEntryFromSnapshot(storageId: string, auth: Awaited<ReturnType<typeof readAuthFileFromPath>>, lastRefreshedAtIso: string): StoredAccountEntry {
  return {
    accountId: auth.accountId,
    storageId,
    userId: auth.metadata.userId,
    authMode: auth.authMode,
    email: auth.metadata.email,
    planType: auth.metadata.planType,
    lastRefreshedAtIso,
    lastActivatedAtIso: null,
    quotaSnapshot: null,
    quotaUpdatedAtIso: null,
    quotaStatus: 'idle',
    quotaError: null,
    unavailableReason: null,
  }
}

function mergeStoredAccountEntries(current: StoredAccountEntry, next: StoredAccountEntry): StoredAccountEntry {
  return {
    accountId: next.accountId,
    storageId: next.storageId,
    userId: next.userId ?? current.userId,
    authMode: next.authMode ?? current.authMode,
    email: next.email ?? current.email,
    planType: next.planType ?? current.planType,
    lastRefreshedAtIso: pickLatestIso(current.lastRefreshedAtIso, next.lastRefreshedAtIso) ?? next.lastRefreshedAtIso,
    lastActivatedAtIso: pickLatestIso(current.lastActivatedAtIso, next.lastActivatedAtIso),
    quotaSnapshot: current.quotaSnapshot ?? next.quotaSnapshot,
    quotaUpdatedAtIso: pickLatestIso(current.quotaUpdatedAtIso, next.quotaUpdatedAtIso),
    quotaStatus: current.quotaStatus !== 'idle' ? current.quotaStatus : next.quotaStatus,
    quotaError: current.quotaError ?? next.quotaError,
    unavailableReason: current.unavailableReason ?? next.unavailableReason,
  }
}

function upsertMigratedAccount(accountsByStorageId: Map<string, StoredAccountEntry>, next: StoredAccountEntry): void {
  const current = accountsByStorageId.get(next.storageId)
  accountsByStorageId.set(next.storageId, current ? mergeStoredAccountEntries(current, next) : next)
}

function hasStoredAccountMetadataChanged(current: StoredAccountEntry, next: StoredAccountEntry): boolean {
  return current.accountId !== next.accountId
    || current.userId !== next.userId
    || current.authMode !== next.authMode
    || current.email !== next.email
    || current.planType !== next.planType
}

async function canUseExistingSnapshotTarget(storageId: string, auth: Awaited<ReturnType<typeof readAuthFileFromPath>>): Promise<boolean> {
  try {
    const existing = await readAuthFileFromPath(getSnapshotPath(storageId))
    return existing.accountId === auth.accountId
      && (existing.metadata.userId ?? null) === (auth.metadata.userId ?? null)
  } catch {
    return false
  }
}

async function migrateStoredAccountSnapshots(accounts: StoredAccountEntry[]): Promise<SnapshotMigrationResult> {
  const accountsByStorageId = new Map<string, StoredAccountEntry>()
  const storageIdMap = new Map<string, string>()
  let changed = false

  for (const account of accounts) {
    upsertMigratedAccount(accountsByStorageId, account)
  }

  const storageIds = new Set([
    ...accounts.map((account) => account.storageId),
    ...await listSnapshotStorageIds(),
  ])

  for (const storageId of storageIds) {
    const snapshotPath = getSnapshotPath(storageId)
    let auth: Awaited<ReturnType<typeof readAuthFileFromPath>>
    try {
      auth = await readAuthFileFromPath(snapshotPath)
    } catch {
      continue
    }

    const snapshotStat = await stat(snapshotPath).catch(() => null)
    const currentEntry = accountsByStorageId.get(storageId)
    const baseEntry = currentEntry ?? createStoredAccountEntryFromSnapshot(
      storageId,
      auth,
      snapshotStat?.mtime.toISOString() ?? new Date().toISOString(),
    )
    const nextStorageId = toAccountStorageId(auth.accountId, auth.metadata)
    const nextEntry: StoredAccountEntry = {
      ...baseEntry,
      accountId: auth.accountId,
      storageId: nextStorageId,
      userId: auth.metadata.userId ?? baseEntry.userId,
      authMode: auth.authMode ?? baseEntry.authMode,
      email: auth.metadata.email ?? baseEntry.email,
      planType: auth.metadata.planType ?? baseEntry.planType,
    }

    if (nextStorageId === storageId) {
      if (!currentEntry || hasStoredAccountMetadataChanged(currentEntry, nextEntry)) {
        accountsByStorageId.delete(storageId)
        upsertMigratedAccount(accountsByStorageId, nextEntry)
        changed = true
      }
      continue
    }

    const sourceDir = join(getAccountsSnapshotRoot(), storageId)
    const targetDir = join(getAccountsSnapshotRoot(), nextStorageId)
    if (!await fileExists(targetDir)) {
      try {
        await rename(sourceDir, targetDir)
      } catch {
        continue
      }
    } else if (!await canUseExistingSnapshotTarget(nextStorageId, auth)) {
      continue
    }

    accountsByStorageId.delete(storageId)
    storageIdMap.set(storageId, nextStorageId)
    upsertMigratedAccount(accountsByStorageId, nextEntry)
    changed = true
  }

  return {
    accounts: [...accountsByStorageId.values()],
    storageIdMap,
    changed,
  }
}

function getSnapshotPath(storageId: string): string {
  return join(getAccountsSnapshotRoot(), storageId, 'auth.json')
}

async function writeSnapshot(storageId: string, raw: string): Promise<void> {
  const dir = join(getAccountsSnapshotRoot(), storageId)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(getSnapshotPath(storageId), raw, { encoding: 'utf8', mode: 0o600 })
}

async function removeSnapshot(storageId: string): Promise<void> {
  await rm(join(getAccountsSnapshotRoot(), storageId), { recursive: true, force: true })
}

async function readRuntimeAccountMetadata(appServer: AppServerLike): Promise<TokenMetadata> {
  const payload = asRecord(await appServer.rpc('account/read', { refreshToken: false }))
  const account = asRecord(payload?.account)
  return {
    email: typeof account?.email === 'string' && account.email.trim().length > 0 ? account.email.trim() : null,
    userId: null,
    planType: typeof account?.planType === 'string' && account.planType.trim().length > 0 ? account.planType.trim() : null,
  }
}

async function validateSwitchedAccount(appServer: AppServerLike): Promise<AccountInspection> {
  const metadata = await readRuntimeAccountMetadata(appServer)
  const quotaPayload = await callRpcWithRateLimitDecodeRecovery(appServer, 'account/rateLimits/read', null)
  return {
    metadata,
    quotaSnapshot: pickCodexRateLimitSnapshot(quotaPayload),
  }
}

async function restoreActiveAuth(raw: string | null): Promise<void> {
  const path = getActiveAuthPath()
  if (raw === null) {
    await rm(path, { force: true })
    return
  }
  await writeFile(path, raw, { encoding: 'utf8', mode: 0o600 })
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function withTemporaryCodexAppServer<T>(
  authRaw: string,
  run: (rpc: (method: string, params: unknown) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codexui-account-'))
  const authPath = join(tempCodexHome, 'auth.json')
  await writeFile(authPath, authRaw, { encoding: 'utf8', mode: 0o600 })

  const proc = spawn('codex', buildAppServerArgs(), {
    env: { ...process.env, CODEX_HOME: tempCodexHome },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let disposed = false
  let initialized = false
  let initializePromise: Promise<void> | null = null
  let readBuffer = ''
  let nextId = 1
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

  const rejectAllPending = (error: Error) => {
    for (const request of pending.values()) {
      request.reject(error)
    }
    pending.clear()
  }

  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk: string) => {
    readBuffer += chunk
    let lineEnd = readBuffer.indexOf('\n')
    while (lineEnd !== -1) {
      const line = readBuffer.slice(0, lineEnd).trim()
      readBuffer = readBuffer.slice(lineEnd + 1)
      if (line.length > 0) {
        try {
          const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } }
          if (typeof message.id === 'number' && pending.has(message.id)) {
            const current = pending.get(message.id)
            pending.delete(message.id)
            if (!current) {
              lineEnd = readBuffer.indexOf('\n')
              continue
            }
            if (message.error?.message) {
              current.reject(new Error(message.error.message))
            } else {
              current.resolve(message.result)
            }
          }
        } catch {
          // Ignore malformed lines and unrelated notifications.
        }
      }
      lineEnd = readBuffer.indexOf('\n')
    }
  })

  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', () => {
    // JSON-RPC errors are surfaced through stdout responses.
  })

  proc.on('error', (error) => {
    rejectAllPending(error instanceof Error ? error : new Error('codex app-server failed to start'))
  })

  proc.on('exit', () => {
    if (disposed) return
    rejectAllPending(new Error('codex app-server exited unexpectedly'))
  })

  const sendLine = (payload: Record<string, unknown>) => {
    proc.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  const call = async (method: string, params: unknown): Promise<unknown> => {
    const id = nextId++
    return await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      sendLine({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })
    })
  }

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) return
    if (initializePromise) {
      await initializePromise
      return
    }

    initializePromise = call('initialize', {
      clientInfo: {
        name: 'codexui-account-refresh',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    }).then(() => {
      sendLine({
        jsonrpc: '2.0',
        method: 'initialized',
      })
      initialized = true
    }).finally(() => {
      initializePromise = null
    })

    await initializePromise
  }

  const dispose = async () => {
    if (disposed) return
    disposed = true
    rejectAllPending(new Error('codex app-server stopped'))
    try {
      proc.stdin.end()
    } catch {
      // ignore
    }
    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }

  try {
    await ensureInitialized()
    return await run(call)
  } finally {
    await dispose()
  }
}

async function inspectStoredAccount(entry: StoredAccountEntry): Promise<AccountInspection> {
  const snapshotPath = getSnapshotPath(entry.storageId)
  const authRaw = await readFile(snapshotPath, 'utf8')
  return await withTemporaryCodexAppServer(authRaw, async (rpc) => {
    const accountPayload = asRecord(await rpc('account/read', { refreshToken: false }))
    const account = asRecord(accountPayload?.account)
    const quotaPayload = await callRpcWithRateLimitDecodeRecovery({ rpc }, 'account/rateLimits/read', null)
    return {
      metadata: {
        email: typeof account?.email === 'string' && account.email.trim().length > 0 ? account.email.trim() : entry.email,
        userId: entry.userId,
        planType: typeof account?.planType === 'string' && account.planType.trim().length > 0 ? account.planType.trim() : entry.planType,
      },
      quotaSnapshot: pickCodexRateLimitSnapshot(quotaPayload),
    }
  })
}

async function inspectStoredAccountWithTimeout(entry: StoredAccountEntry): Promise<AccountInspection> {
  let timeoutHandle: NodeJS.Timeout | null = null
  try {
    return await Promise.race<AccountInspection>([
      inspectStoredAccount(entry),
      new Promise<AccountInspection>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Account quota inspection timed out after ${ACCOUNT_INSPECTION_TIMEOUT_MS}ms`))
        }, ACCOUNT_INSPECTION_TIMEOUT_MS)
        timeoutHandle.unref?.()
      }),
    ])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

function shouldRefreshAccountQuota(entry: StoredAccountEntry): boolean {
  if (entry.quotaStatus === 'loading') {
    const updatedAtMs = entry.quotaUpdatedAtIso ? Date.parse(entry.quotaUpdatedAtIso) : Number.NaN
    if (!Number.isFinite(updatedAtMs)) return true
    return Date.now() - updatedAtMs >= ACCOUNT_QUOTA_LOADING_STALE_MS
  }
  if (!entry.quotaUpdatedAtIso) return true
  const updatedAtMs = Date.parse(entry.quotaUpdatedAtIso)
  if (!Number.isFinite(updatedAtMs)) return true
  return Date.now() - updatedAtMs >= ACCOUNT_QUOTA_REFRESH_TTL_MS
}

async function replaceStoredAccount(nextEntry: StoredAccountEntry): Promise<void> {
  const state = await readStoredAccountsState()
  const nextState = withUpsertedAccount(state, nextEntry)
  await writeStoredAccountsState(nextState)
}

async function pickReplacementActiveAccount(accounts: StoredAccountEntry[]): Promise<StoredAccountEntry | null> {
  const sorted = sortAccounts(accounts, null)
  for (const entry of sorted) {
    if (entry.unavailableReason === 'payment_required') continue
    if (await fileExists(getSnapshotPath(entry.storageId))) {
      return entry
    }
  }
  return null
}

async function refreshAccountsInBackground(storageIds: string[]): Promise<void> {
  for (const storageId of storageIds) {
    const state = await readStoredAccountsState()
    const entry = state.accounts.find((item) => item.storageId === storageId)
    if (!entry) continue

    try {
      const inspected = await inspectStoredAccountWithTimeout(entry)
      await replaceStoredAccount({
        ...entry,
        email: inspected.metadata.email ?? entry.email,
        planType: inspected.metadata.planType ?? entry.planType,
        quotaSnapshot: inspected.quotaSnapshot ?? entry.quotaSnapshot,
        quotaUpdatedAtIso: new Date().toISOString(),
        quotaStatus: 'ready',
        quotaError: null,
        unavailableReason: null,
      })
    } catch (error) {
      await replaceStoredAccount({
        ...entry,
        quotaUpdatedAtIso: new Date().toISOString(),
        quotaStatus: 'error',
        quotaError: getErrorMessage(error, 'Failed to refresh account quota'),
        unavailableReason: detectAccountUnavailableReason(error),
      })
    }
  }
}

async function scheduleAccountsBackgroundRefresh(
  options: { force?: boolean; prioritizeStorageId?: string; storageIds?: string[] } = {},
): Promise<StoredAccountsState> {
  const state = await readStoredAccountsState()
  if (state.accounts.length === 0) return state
  if (backgroundRefreshPromise) return state

  const allowedIds = options.storageIds ? new Set(options.storageIds) : null
  const candidates = state.accounts
    .filter((entry) => !allowedIds || allowedIds.has(entry.storageId))
    .filter((entry) => options.force === true || shouldRefreshAccountQuota(entry))
    .sort((left, right) => {
      const prioritize = options.prioritizeStorageId ?? ''
      const leftPriority = left.storageId === prioritize ? 1 : 0
      const rightPriority = right.storageId === prioritize ? 1 : 0
      if (leftPriority !== rightPriority) return rightPriority - leftPriority
      return 0
    })

  if (candidates.length === 0) return state

  const candidateIds = new Set(candidates.map((entry) => entry.storageId))
  const markedState: StoredAccountsState = {
    activeAccountId: state.activeAccountId,
    activeStorageId: state.activeStorageId,
    accounts: state.accounts.map((entry) => (
      candidateIds.has(entry.storageId)
        ? {
          ...entry,
          quotaStatus: 'loading',
          quotaError: null,
        }
        : entry
    )),
  }

  await writeStoredAccountsState(markedState)

  backgroundRefreshPromise = refreshAccountsInBackground(
    candidates.map((entry) => entry.storageId),
  ).finally(() => {
    backgroundRefreshPromise = null
  })

  return markedState
}

async function importAccountFromAuthPath(path: string): Promise<{
  activeAccountId: string | null
  activeStorageId: string | null
  importedAccountId: string
  importedStorageId: string
  accounts: Array<StoredAccountEntry & { isActive: boolean }>
}> {
  const imported = await readAuthFileFromPath(path)
  const storageId = toAccountStorageId(imported.accountId, imported.metadata)
  await writeSnapshot(storageId, imported.raw)

  const state = await readStoredAccountsState()
  const legacyStorageId = toStorageId(imported.accountId)
  const existing = state.accounts.find((entry) => entry.storageId === storageId)
    ?? (storageId !== legacyStorageId
      ? state.accounts.find((entry) => entry.storageId === legacyStorageId && entry.accountId === imported.accountId && entry.userId === null)
      : null)
    ?? null
  const nextEntry: StoredAccountEntry = {
    accountId: imported.accountId,
    storageId,
    userId: imported.metadata.userId ?? existing?.userId ?? null,
    authMode: imported.authMode,
    email: imported.metadata.email ?? existing?.email ?? null,
    planType: imported.metadata.planType ?? existing?.planType ?? null,
    lastRefreshedAtIso: new Date().toISOString(),
    lastActivatedAtIso: existing?.lastActivatedAtIso ?? null,
    quotaSnapshot: existing?.quotaSnapshot ?? null,
    quotaUpdatedAtIso: existing?.quotaUpdatedAtIso ?? null,
    quotaStatus: existing?.quotaStatus ?? 'idle',
    quotaError: existing?.quotaError ?? null,
    unavailableReason: existing?.unavailableReason ?? null,
  }
  const nextState = withUpsertedAccount({
    ...state,
    activeStorageId: existing && existing.storageId !== storageId && state.activeStorageId === existing.storageId
      ? storageId
      : state.activeStorageId,
    accounts: existing && existing.storageId !== storageId
      ? state.accounts.filter((entry) => entry.storageId !== existing.storageId)
      : state.accounts,
  }, nextEntry)
  await writeStoredAccountsState(nextState)

  return {
    activeAccountId: nextState.activeAccountId,
    activeStorageId: nextState.activeStorageId,
    importedAccountId: imported.accountId,
    importedStorageId: storageId,
    accounts: sortAccounts(nextState.accounts, nextState.activeStorageId).map((entry) => toPublicAccountEntry(entry, nextState.activeStorageId)),
  }
}

function extractLoginUrl(output: string): string | null {
  const match = output.match(/https:\/\/auth\.openai\.com\/oauth\/authorize\?\S+/u)
  return match?.[0] ?? null
}

function isLocalCallbackUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:') return false
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]' || parsed.hostname === '::1'
  } catch {
    return false
  }
}

async function waitForLoginUrl(): Promise<string> {
  if (activeLogin?.loginUrl) return activeLogin.loginUrl

  return await new Promise<string>((resolve, reject) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (!activeLogin) {
        clearInterval(timer)
        reject(new Error('Login process is not running.'))
        return
      }
      if (activeLogin.loginUrl) {
        clearInterval(timer)
        resolve(activeLogin.loginUrl)
        return
      }
      if (activeLogin.exited) {
        clearInterval(timer)
        reject(new Error(activeLogin.output.trim() || 'codex login exited before returning a login URL.'))
        return
      }
      if (Date.now() - startedAt > LOGIN_URL_TIMEOUT_MS) {
        clearInterval(timer)
        reject(new Error('Timed out waiting for codex login URL.'))
      }
    }, 100)
  })
}

async function startCodexLogin(): Promise<string> {
  if (activeLogin && !activeLogin.exited) {
    return await waitForLoginUrl()
  }

  const proc = spawn('codex', ['login'], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  proc.stdin.end()

  activeLogin = {
    proc,
    loginUrl: null,
    output: '',
    exited: false,
    exitCode: null,
    exitSignal: null,
    exitPromise: new Promise<void>((resolve) => {
      proc.once('exit', (code, signal) => {
        if (activeLogin?.proc === proc) {
          activeLogin.exited = true
          activeLogin.exitCode = code
          activeLogin.exitSignal = signal
        }
        resolve()
      })
    }),
  }

  const appendOutput = (chunk: Buffer | string) => {
    if (!activeLogin || activeLogin.proc !== proc) return
    activeLogin.output += chunk.toString()
    activeLogin.loginUrl = activeLogin.loginUrl ?? extractLoginUrl(activeLogin.output)
  }

  proc.stdout.on('data', appendOutput)
  proc.stderr.on('data', appendOutput)
  proc.once('error', (error) => {
    if (!activeLogin || activeLogin.proc !== proc) return
    activeLogin.exited = true
    activeLogin.output += error.message
  })

  try {
    return await waitForLoginUrl()
  } catch (error) {
    if (activeLogin?.proc === proc && !activeLogin.exited) {
      proc.kill('SIGTERM')
    }
    activeLogin = null
    throw error
  }
}

async function curlLoginCallback(callbackUrl: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOGIN_CALLBACK_TIMEOUT_MS)
  try {
    const response = await fetch(callbackUrl, {
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.status >= 400) {
      throw new Error(`Login callback returned HTTP ${response.status}.`)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function getActiveAuthMtimeMs(): Promise<number | null> {
  try {
    return (await stat(getActiveAuthPath())).mtimeMs
  } catch {
    return null
  }
}

async function waitForAuthFileUpdate(previousMtimeMs: number | null): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= LOGIN_AUTH_FILE_TIMEOUT_MS) {
    const nextMtimeMs = await getActiveAuthMtimeMs()
    if (nextMtimeMs !== null && (previousMtimeMs === null || nextMtimeMs > previousMtimeMs)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

function stopActiveLogin(): void {
  if (!activeLogin) return
  if (!activeLogin.exited) {
    activeLogin.proc.kill('SIGTERM')
  }
  activeLogin = null
}

export async function handleAccountRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: AccountRouteContext,
): Promise<boolean> {
  const { appServer } = context

  if (req.method === 'GET' && url.pathname === '/codex-api/accounts') {
    const state = await scheduleAccountsBackgroundRefresh()
    setJson(res, 200, {
      data: {
        activeAccountId: state.activeAccountId,
        activeStorageId: state.activeStorageId,
        accounts: sortAccounts(state.accounts, state.activeStorageId).map((entry) => toPublicAccountEntry(entry, state.activeStorageId)),
      },
    })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/accounts/active') {
    const state = await readStoredAccountsState()
    const active = state.activeStorageId
      ? state.accounts.find((entry) => entry.storageId === state.activeStorageId) ?? null
      : null
    setJson(res, 200, {
      data: active ? toPublicAccountEntry(active, state.activeStorageId) : null,
    })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/accounts/refresh') {
    try {
      const imported = await importAccountFromAuthPath(getActiveAuthPath())

      try {
        appServer.dispose()
        const inspection = await validateSwitchedAccount(appServer)
        const state = await readStoredAccountsState()
        const importedAccountId = imported.importedAccountId
        const importedStorageId = imported.importedStorageId
        const target = state.accounts.find((entry) => entry.storageId === importedStorageId) ?? null
        if (!target) {
          throw new Error('account_not_found')
        }

        const nextEntry: StoredAccountEntry = {
          ...target,
          email: inspection.metadata.email ?? target.email,
          planType: inspection.metadata.planType ?? target.planType,
          lastActivatedAtIso: new Date().toISOString(),
          quotaSnapshot: inspection.quotaSnapshot ?? target.quotaSnapshot,
          quotaUpdatedAtIso: new Date().toISOString(),
          quotaStatus: 'ready',
          quotaError: null,
          unavailableReason: null,
        }
        const nextState = withUpsertedAccount({
          activeAccountId: importedAccountId,
          activeStorageId: importedStorageId,
          accounts: state.accounts,
        }, nextEntry)
        await writeStoredAccountsState(nextState)

        const backgroundState = await scheduleAccountsBackgroundRefresh({
          force: true,
          prioritizeStorageId: importedStorageId,
          storageIds: nextState.accounts.filter((entry) => entry.storageId !== importedStorageId).map((entry) => entry.storageId),
        })

        setJson(res, 200, {
          data: {
            activeAccountId: importedAccountId,
            activeStorageId: importedStorageId,
            importedAccountId,
            importedStorageId,
            accounts: sortAccounts(backgroundState.accounts, importedStorageId).map((entry) => toPublicAccountEntry(entry, importedStorageId)),
          },
        })
      } catch (error) {
        setJson(res, 502, {
          error: 'account_refresh_failed',
          message: getErrorMessage(error, 'Failed to refresh account'),
        })
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to refresh account')
      if (message === 'missing_account_id') {
        setJson(res, 400, { error: 'missing_account_id', message: 'Current auth.json is missing tokens.account_id.' })
        return true
      }
      setJson(res, 400, { error: 'invalid_auth_json', message: 'Failed to parse the current auth.json file.' })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/accounts/login/start') {
    try {
      const loginUrl = await startCodexLogin()
      setJson(res, 200, {
        ok: true,
        data: {
          loginUrl,
        },
      })
    } catch (error) {
      setJson(res, 500, {
        error: 'account_login_start_failed',
        message: getErrorMessage(error, 'Failed to start codex login'),
      })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/accounts/login/complete') {
    try {
      const payload = await readJsonBody(req)
      const callbackUrl = typeof payload?.callbackUrl === 'string' ? payload.callbackUrl.trim() : ''
      if (!callbackUrl) {
        setJson(res, 400, { error: 'missing_callback_url', message: 'Paste the localhost callback URL from the browser.' })
        return true
      }
      if (!isLocalCallbackUrl(callbackUrl)) {
        setJson(res, 400, { error: 'invalid_callback_url', message: 'The callback URL must use http://localhost or http://127.0.0.1.' })
        return true
      }
      if (!activeLogin || activeLogin.exited) {
        setJson(res, 409, { error: 'login_not_running', message: 'Start Codex login before submitting the callback URL.' })
        return true
      }

      const previousAuthMtimeMs = await getActiveAuthMtimeMs()
      await curlLoginCallback(callbackUrl)
      await waitForAuthFileUpdate(previousAuthMtimeMs)

      const imported = await importAccountFromAuthPath(getActiveAuthPath())
      stopActiveLogin()
      appServer.dispose()
      const inspection = await validateSwitchedAccount(appServer)
      const state = await readStoredAccountsState()
      const importedAccountId = imported.importedAccountId
      const importedStorageId = imported.importedStorageId
      const target = state.accounts.find((entry) => entry.storageId === importedStorageId) ?? null
      if (!target) {
        throw new Error('account_not_found')
      }

      const nextEntry: StoredAccountEntry = {
        ...target,
        email: inspection.metadata.email ?? target.email,
        planType: inspection.metadata.planType ?? target.planType,
        lastActivatedAtIso: new Date().toISOString(),
        quotaSnapshot: inspection.quotaSnapshot ?? target.quotaSnapshot,
        quotaUpdatedAtIso: new Date().toISOString(),
        quotaStatus: 'ready',
        quotaError: null,
        unavailableReason: null,
      }
      const nextState = withUpsertedAccount({
        activeAccountId: importedAccountId,
        activeStorageId: importedStorageId,
        accounts: state.accounts,
      }, nextEntry)
      await writeStoredAccountsState(nextState)

      const backgroundState = await scheduleAccountsBackgroundRefresh({
        force: true,
        prioritizeStorageId: importedStorageId,
        storageIds: nextState.accounts.filter((entry) => entry.storageId !== importedStorageId).map((entry) => entry.storageId),
      })

      setJson(res, 200, {
        ok: true,
        data: {
          activeAccountId: importedAccountId,
          activeStorageId: importedStorageId,
          importedAccountId,
          importedStorageId,
          accounts: sortAccounts(backgroundState.accounts, importedStorageId).map((entry) => toPublicAccountEntry(entry, importedStorageId)),
        },
      })
    } catch (error) {
      setJson(res, 500, {
        error: 'account_login_complete_failed',
        message: getErrorMessage(error, 'Failed to complete Codex login'),
      })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/accounts/switch') {
    try {
      if (appServer.listPendingServerRequests().length > 0) {
        setJson(res, 409, {
          error: 'account_switch_blocked',
          message: 'Finish pending approval requests before switching accounts.',
        })
        return true
      }

      const payload = await readJsonBody(req)
      const accountId = typeof payload?.accountId === 'string' ? payload.accountId.trim() : ''
      const storageId = typeof payload?.storageId === 'string' ? payload.storageId.trim() : ''
      if (!accountId && !storageId) {
        setJson(res, 400, { error: 'account_not_found', message: 'Missing account identifier.' })
        return true
      }

      const state = await readStoredAccountsState()
      const target = storageId
        ? state.accounts.find((entry) => entry.storageId === storageId) ?? null
        : state.accounts.find((entry) => entry.accountId === accountId) ?? null
      if (!target) {
        setJson(res, 404, { error: 'account_not_found', message: 'The requested account was not found.' })
        return true
      }

      const snapshotPath = getSnapshotPath(target.storageId)
      if (!(await fileExists(snapshotPath))) {
        setJson(res, 404, { error: 'account_not_found', message: 'The requested account snapshot is missing.' })
        return true
      }

      let previousRaw: string | null = null
      try {
        previousRaw = await readFile(getActiveAuthPath(), 'utf8')
      } catch {
        previousRaw = null
      }

      const targetRaw = await readFile(snapshotPath, 'utf8')
      await writeFile(getActiveAuthPath(), targetRaw, { encoding: 'utf8', mode: 0o600 })

      try {
        appServer.dispose()
        const inspection = await validateSwitchedAccount(appServer)
        const nextEntry: StoredAccountEntry = {
          ...target,
          email: inspection.metadata.email ?? target.email,
          planType: inspection.metadata.planType ?? target.planType,
          lastActivatedAtIso: new Date().toISOString(),
          quotaSnapshot: inspection.quotaSnapshot ?? target.quotaSnapshot,
          quotaUpdatedAtIso: new Date().toISOString(),
          quotaStatus: 'ready',
          quotaError: null,
          unavailableReason: null,
        }
        const nextState = withUpsertedAccount({
          activeAccountId: target.accountId,
          activeStorageId: target.storageId,
          accounts: state.accounts,
        }, nextEntry)
        await writeStoredAccountsState(nextState)
        void scheduleAccountsBackgroundRefresh({
          force: true,
          prioritizeStorageId: target.storageId,
          storageIds: nextState.accounts.filter((entry) => entry.storageId !== target.storageId).map((entry) => entry.storageId),
        })
        setJson(res, 200, {
          ok: true,
          data: {
            activeAccountId: target.accountId,
            activeStorageId: target.storageId,
            account: toPublicAccountEntry(nextEntry, target.storageId),
          },
        })
      } catch (error) {
        await restoreActiveAuth(previousRaw)
        appServer.dispose()
        await replaceStoredAccount({
          ...target,
          quotaUpdatedAtIso: new Date().toISOString(),
          quotaStatus: 'error',
          quotaError: getErrorMessage(error, 'Failed to switch account'),
          unavailableReason: detectAccountUnavailableReason(error),
        })
        setJson(res, 502, {
          error: 'account_switch_failed',
          message: getErrorMessage(error, 'Failed to switch account'),
        })
      }
    } catch (error) {
      setJson(res, 400, {
        error: 'invalid_auth_json',
        message: getErrorMessage(error, 'Failed to switch account'),
      })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/accounts/remove') {
    try {
      const payload = await readJsonBody(req)
      const accountId = typeof payload?.accountId === 'string' ? payload.accountId.trim() : ''
      const storageId = typeof payload?.storageId === 'string' ? payload.storageId.trim() : ''
      if (!accountId && !storageId) {
        setJson(res, 400, { error: 'account_not_found', message: 'Missing account identifier.' })
        return true
      }

      const state = await readStoredAccountsState()
      const target = storageId
        ? state.accounts.find((entry) => entry.storageId === storageId) ?? null
        : state.accounts.find((entry) => entry.accountId === accountId) ?? null
      if (!target) {
        setJson(res, 404, { error: 'account_not_found', message: 'The requested account was not found.' })
        return true
      }

      const remainingAccounts = state.accounts.filter((entry) => entry.storageId !== target.storageId)
      if (state.activeStorageId !== target.storageId) {
        await removeSnapshot(target.storageId)
        const activeState = resolveActiveState(remainingAccounts, state.activeStorageId)
        await writeStoredAccountsState({
          ...activeState,
          accounts: remainingAccounts,
        })
        setJson(res, 200, {
          ok: true,
          data: {
            activeAccountId: activeState.activeAccountId,
            activeStorageId: activeState.activeStorageId,
            accounts: sortAccounts(remainingAccounts, activeState.activeStorageId).map((entry) => toPublicAccountEntry(entry, activeState.activeStorageId)),
          },
        })
        return true
      }

      if (appServer.listPendingServerRequests().length > 0) {
        setJson(res, 409, {
          error: 'account_remove_blocked',
          message: 'Finish pending approval requests before removing the active account.',
        })
        return true
      }

      let previousRaw: string | null = null
      try {
        previousRaw = await readFile(getActiveAuthPath(), 'utf8')
      } catch {
        previousRaw = null
      }

      const replacement = await pickReplacementActiveAccount(remainingAccounts)
      if (!replacement) {
        await restoreActiveAuth(null)
        appServer.dispose()
        await removeSnapshot(target.storageId)
        await writeStoredAccountsState({
          activeAccountId: null,
          activeStorageId: null,
          accounts: remainingAccounts,
        })
        void scheduleAccountsBackgroundRefresh({
          force: true,
          storageIds: remainingAccounts.map((entry) => entry.storageId),
        })
        setJson(res, 200, {
          ok: true,
          data: {
            activeAccountId: null,
            activeStorageId: null,
            accounts: sortAccounts(remainingAccounts, null).map((entry) => toPublicAccountEntry(entry, null)),
          },
        })
        return true
      }

      const replacementSnapshotPath = getSnapshotPath(replacement.storageId)
      if (!(await fileExists(replacementSnapshotPath))) {
        setJson(res, 404, {
          error: 'account_not_found',
          message: 'The replacement account snapshot is missing.',
        })
        return true
      }

      const replacementRaw = await readFile(replacementSnapshotPath, 'utf8')
      await writeFile(getActiveAuthPath(), replacementRaw, { encoding: 'utf8', mode: 0o600 })

      try {
        appServer.dispose()
        const inspection = await validateSwitchedAccount(appServer)
        const activatedReplacement: StoredAccountEntry = {
          ...replacement,
          email: inspection.metadata.email ?? replacement.email,
          planType: inspection.metadata.planType ?? replacement.planType,
          lastActivatedAtIso: new Date().toISOString(),
          quotaSnapshot: inspection.quotaSnapshot ?? replacement.quotaSnapshot,
          quotaUpdatedAtIso: new Date().toISOString(),
          quotaStatus: 'ready',
          quotaError: null,
          unavailableReason: null,
        }
        const nextAccounts = remainingAccounts.map((entry) => (
          entry.storageId === activatedReplacement.storageId ? activatedReplacement : entry
        ))
        await removeSnapshot(target.storageId)
        await writeStoredAccountsState({
          activeAccountId: activatedReplacement.accountId,
          activeStorageId: activatedReplacement.storageId,
          accounts: nextAccounts,
        })
        void scheduleAccountsBackgroundRefresh({
          force: true,
          prioritizeStorageId: activatedReplacement.storageId,
          storageIds: nextAccounts
            .filter((entry) => entry.storageId !== activatedReplacement.storageId)
            .map((entry) => entry.storageId),
        })
        setJson(res, 200, {
          ok: true,
          data: {
            activeAccountId: activatedReplacement.accountId,
            activeStorageId: activatedReplacement.storageId,
            accounts: sortAccounts(nextAccounts, activatedReplacement.storageId)
              .map((entry) => toPublicAccountEntry(entry, activatedReplacement.storageId)),
          },
        })
      } catch (error) {
        await restoreActiveAuth(previousRaw)
        appServer.dispose()
        await replaceStoredAccount({
          ...replacement,
          quotaUpdatedAtIso: new Date().toISOString(),
          quotaStatus: 'error',
          quotaError: getErrorMessage(error, 'Failed to switch account'),
          unavailableReason: detectAccountUnavailableReason(error),
        })
        setJson(res, 502, {
          error: 'account_remove_failed',
          message: getErrorMessage(error, 'Failed to remove account'),
        })
      }
    } catch (error) {
      setJson(res, 400, {
        error: 'invalid_auth_json',
        message: getErrorMessage(error, 'Failed to remove account'),
      })
    }
    return true
  }

  return false
}
