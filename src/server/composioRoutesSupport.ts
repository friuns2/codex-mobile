import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getSpawnInvocation } from '../utils/commandInvocation.js'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) return payload.message
  const record = asRecord(payload)
  if (!record) return fallback
  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error
  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) return nestedError.message
  return fallback
}

function quoteShellTokenIfNeeded(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : JSON.stringify(value)
}

export type ComposioUserData = {
  apiKey: string
  baseUrl: string
  webUrl: string
  orgId: string
  testUserId: string
}

const COMPOSIO_USER_DATA_PATH = join(homedir(), '.composio', 'user_data.json')

export type ComposioStatusResponse = {
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

export type ComposioConnectionSummary = {
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

export type ComposioConnectorSummary = {
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

export type ComposioToolSummary = {
  slug: string
  name: string
  description: string
}

export type ComposioConnectorDetail = {
  connector: ComposioConnectorSummary
  connections: ComposioConnectionSummary[]
  tools: ComposioToolSummary[]
  dashboardUrl: string
}

export type ComposioLinkResult = {
  status: string
  message: string
  connectedAccountId: string
  redirectUrl: string
  toolkit: string
  projectType: string
}

export type ComposioLoginResult = {
  status: string
  message: string
  loginUrl: string
  cliKey: string
  expiresAt: string
}

export type ComposioInstallResult = {
  ok: boolean
  command: string
  output: string
}

export type ComposioConnectorPage = {
  data: ComposioConnectorSummary[]
  nextCursor: string | null
  total: number
}

const COMPOSIO_CONNECTORS_PAGE_LIMIT_MAX = 1000

function readBoolean(value: unknown): boolean {
  return value === true
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export type ComposioCliInvocation = { command: string; args: string[]; displayCommand: string }

function buildComposioInvocation(args: string[]): ComposioCliInvocation | null {
  const overrideCommand = process.env.CODEXUI_COMPOSIO_COMMAND?.trim()
  if (overrideCommand) {
    const invocation = getSpawnInvocation(overrideCommand, args)
    return {
      command: invocation.command,
      args: invocation.args,
      displayCommand: `${overrideCommand} ${args.map(quoteShellTokenIfNeeded).join(' ')}`.trim(),
    }
  }
  return buildInstalledComposioInvocation(args)
}

function buildInstalledComposioInvocation(args: string[]): ComposioCliInvocation | null {
  const candidates = [
    join(homedir(), '.composio', 'composio'),
    'composio',
  ]
  for (const candidate of candidates) {
    if ((candidate.includes('/') || candidate.includes('\\')) && !existsSync(candidate)) continue
    const invocation = getSpawnInvocation(candidate, args)
    return {
      command: invocation.command,
      args: invocation.args,
      displayCommand: `${candidate} ${args.map(quoteShellTokenIfNeeded).join(' ')}`.trim(),
    }
  }
  return null
}

function probeComposioInvocation(invocation: ComposioCliInvocation): { available: boolean; cliVersion: string; output: string } {
  const probe = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  })
  const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.trim()
  return {
    available: !probe.error && probe.status === 0,
    cliVersion: probe.status === 0 ? (probe.stdout ?? '').trim() : '',
    output,
  }
}

function resolveComposioInvocation(args: string[]): ComposioCliInvocation | null {
  const invocation = buildComposioInvocation(args)
  const versionInvocation = buildComposioInvocation(['--version'])
  if (invocation && versionInvocation && probeComposioInvocation(versionInvocation).available) return invocation
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
  const invocation = resolveComposioInvocation(args)
  if (!invocation) {
    throw new Error('Composio CLI is not installed')
  }
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

export async function readComposioStatus(): Promise<ComposioStatusResponse> {
  const versionInvocation = buildComposioInvocation(['--version'])
  const probe = versionInvocation
    ? probeComposioInvocation(versionInvocation)
    : { available: false, cliVersion: '', output: '' }
  const available = probe.available
  const cliVersion = probe.cliVersion
  const userData = await readComposioUserData()
  if (!available) {
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

export async function listComposioConnectors(query: string, cursor: string | null = null, limit = 50): Promise<ComposioConnectorPage> {
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

export function parseComposioLimit(rawLimit: string | null): number {
  const parsed = Number.parseInt((rawLimit ?? '').trim(), 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) return 50
  return Math.max(1, Math.min(COMPOSIO_CONNECTORS_PAGE_LIMIT_MAX, parsed))
}

export async function readComposioConnectorDetail(slug: string): Promise<ComposioConnectorDetail> {
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

export async function startComposioLink(slug: string): Promise<ComposioLinkResult> {
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

export async function startComposioLogin(): Promise<ComposioLoginResult> {
  const invocation = resolveComposioInvocation(['login', '--no-browser', '-y'])
  if (!invocation) {
    throw new Error('Composio CLI is not installed')
  }
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

export async function installComposioCli(): Promise<ComposioInstallResult> {
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
