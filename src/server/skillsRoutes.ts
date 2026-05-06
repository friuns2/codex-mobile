import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, mkdir, stat, lstat, readlink, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { resolvePythonCommand, resolveSkillInstallerScriptPath } from '../commandResolution.js'
import { getSpawnInvocation } from '../utils/commandInvocation.js'

type AppServerLike = {
  rpc(method: string, params: unknown): Promise<unknown>
}

type ReadJsonBody = (req: IncomingMessage) => Promise<unknown>

type SkillRouteContext = {
  appServer: AppServerLike
  readJsonBody: ReadJsonBody
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function splitAbsolutePath(pathValue: string): string[] {
  return pathValue.split('/').filter(Boolean)
}

function buildAbsolutePath(parts: string[]): string {
  return `/${parts.join('/')}`
}

function normalizeSkillMarkdownPath(skillPath: string): string {
  if (!skillPath) return ''
  return skillPath.endsWith('/SKILL.md') ? skillPath : `${skillPath}/SKILL.md`
}

function deriveSkillPathInfo(
  skillPath: string,
  knownPaths: Set<string> = new Set(),
): {
  normalizedPath: string
  rootSkillPath: string
  rootSkillName: string
  installDir: string
  isNestedSkill: boolean
} | null {
  const normalizedPath = normalizeSkillMarkdownPath(skillPath)
  const parts = splitAbsolutePath(normalizedPath)
  if (parts.length < 2) return null

  const pluginSkillsIndex = parts.lastIndexOf('skills')
  if (pluginSkillsIndex >= 2) {
    const pluginName = parts[pluginSkillsIndex - 2] ?? ''
    if (pluginName) {
      const rootSkillPath = buildAbsolutePath([...parts.slice(0, pluginSkillsIndex + 1), pluginName, 'SKILL.md'])
      if (knownPaths.has(rootSkillPath)) {
        return {
          normalizedPath,
          rootSkillPath,
          rootSkillName: pluginName,
          installDir: buildAbsolutePath(parts.slice(0, pluginSkillsIndex + 1)),
          isNestedSkill: normalizedPath !== rootSkillPath,
        }
      }
    }
  }

  const firstSkillsIndex = parts.indexOf('skills')
  if (firstSkillsIndex < 0 || firstSkillsIndex + 1 >= parts.length - 1) return null
  const rootSkillName = parts[firstSkillsIndex + 1] ?? ''
  if (!rootSkillName) return null
  const rootParts = parts.slice(0, firstSkillsIndex + 2)
  const installDirParts = parts.slice(0, firstSkillsIndex + 1)
  return {
    normalizedPath,
    rootSkillPath: buildAbsolutePath([...rootParts, 'SKILL.md']),
    rootSkillName,
    installDir: buildAbsolutePath(installDirParts),
    isNestedSkill: normalizedPath !== buildAbsolutePath([...rootParts, 'SKILL.md']),
  }
}

function getSkillsInstallDir(): string {
  return join(getCodexHomeDir(), 'skills')
}

const DEFAULT_COMMAND_TIMEOUT_MS = 120_000
const SKILL_SEARCH_METADATA_LIMIT = 20
const SKILL_SEARCH_METADATA_CONCURRENCY = 4

async function runCommand(command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<void> {
  const timeout = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  await new Promise<void>((resolve, reject) => {
    const invocation = getSpawnInvocation(command, args)
    const proc = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGKILL')
      reject(new Error(`Command timed out after ${timeout}ms (${command} ${args.join(' ')})`))
    }, timeout)
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
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

async function runCommandWithOutput(command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<string> {
  const timeout = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  return await new Promise<string>((resolve, reject) => {
    const invocation = getSpawnInvocation(command, args)
    const proc = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGKILL')
      reject(new Error(`Command timed out after ${timeout}ms (${command} ${args.join(' ')})`))
    }, timeout)
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

async function detectUserSkillsDir(appServer: AppServerLike): Promise<string> {
  try {
    const result = (await appServer.rpc('skills/list', {})) as {
      data?: Array<{ skills?: Array<{ scope?: string; path?: string }> }>
    }
    for (const entry of result.data ?? []) {
      for (const skill of entry.skills ?? []) {
        if (skill.scope !== 'user' || !skill.path) continue
        const skillInfo = deriveSkillPathInfo(skill.path)
        if (!skillInfo) continue
        return skillInfo.installDir
      }
    }
  } catch {}
  return getSkillsInstallDir()
}

async function ensureInstalledSkillIsValid(appServer: AppServerLike, skillPath: string): Promise<void> {
  const result = (await appServer.rpc('skills/list', { forceReload: true })) as {
    data?: Array<{ errors?: Array<{ path?: string; message?: string }> }>
  }
  const normalized = skillPath.endsWith('/SKILL.md') ? skillPath : `${skillPath}/SKILL.md`
  for (const entry of result.data ?? []) {
    for (const error of entry.errors ?? []) {
      if (error.path === normalized) {
        throw new Error(error.message || 'Installed skill is invalid')
      }
    }
  }
}

type SkillHubEntry = {
  name: string
  owner: string
  description: string
  displayName: string
  publishedAt: number
  avatarUrl: string
  url: string
  installed: boolean
  source?: string
  path?: string
  enabled?: boolean
  installCountLabel?: string
}

async function runGitFetchWithRefLockRetry(repoDir: string, args: string[] = ['fetch', 'origin']): Promise<void> {
  try {
    await runCommand('git', args, { cwd: repoDir })
  } catch (error) {
    const message = getErrorMessage(error, '')
    if (!message.includes("cannot lock ref 'refs/remotes/origin/")) throw error
    const branchMatch = message.match(/refs\/remotes\/origin\/([^\s':]+)/)
    if (!branchMatch?.[1]) throw error
    const refPath = join(repoDir, '.git', 'refs', 'remotes', 'origin', branchMatch[1])
    try { await rm(refPath, { force: true }) } catch {}
    await runCommand('git', args, { cwd: repoDir })
  }
}

async function buildLocalHubEntry(info: InstalledSkillInfo): Promise<SkillHubEntry> {
  let description = ''
  if (info.path) {
    try {
      description = extractSkillDescriptionFromMarkdown(await readFile(info.path, 'utf8'))
    } catch {}
  }
  return {
    name: info.name,
    owner: 'local',
    description,
    displayName: '',
    publishedAt: 0,
    avatarUrl: '',
    url: '',
    installed: true,
    path: info.path,
    enabled: info.enabled,
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/gu, '')
}

function parseNpxSkillsFindOutput(output: string, installedMap: Map<string, InstalledSkillInfo>): SkillHubEntry[] {
  const lines = stripAnsi(output).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  const results: SkillHubEntry[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const match = line.match(/^(.+?@[^@\s]+)\s+([\d.]+[KMB]?)\s+installs$/iu)
    if (!match) continue
    const source = match[1]?.trim() ?? ''
    const installs = match[2]?.trim() ?? ''
    const atIndex = source.lastIndexOf('@')
    if (atIndex <= 0 || atIndex >= source.length - 1) continue
    const owner = source.slice(0, atIndex)
    const name = source.slice(atIndex + 1)
    let url = ''
    const next = lines[index + 1] ?? ''
    const urlMatch = next.match(/(?:^└\s*)?(https?:\/\/\S+)$/u)
    if (urlMatch?.[1]) {
      url = urlMatch[1]
      index += 1
    }
    const installedInfo = installedMap.get(name)
    results.push({
      name,
      owner,
      displayName: name,
      description: installs ? `${installs} installs` : '',
      installCountLabel: installs ? `${installs} installs` : '',
      publishedAt: 0,
      avatarUrl: '',
      url,
      installed: Boolean(installedInfo),
      source,
      path: installedInfo?.path,
      enabled: installedInfo?.enabled,
    })
  }
  return results
}

function parseGithubSkillSource(source: string): { ownerRepo: string; skillName: string } | null {
  const atIndex = source.lastIndexOf('@')
  if (atIndex <= 0 || atIndex >= source.length - 1) return null
  const ownerRepo = source.slice(0, atIndex).trim()
  const skillName = source.slice(atIndex + 1).trim()
  const ownerRepoParts = ownerRepo.split('/').filter(Boolean)
  if (ownerRepoParts.length !== 2 || skillName.length === 0) return null
  if (ownerRepoParts.some((part) => part.includes(':') || part.includes(' '))) return null
  return { ownerRepo, skillName }
}

function getGithubOwnerAvatarUrl(source: string): string {
  const parsed = parseGithubSkillSource(source)
  if (!parsed) return ''
  const owner = parsed.ownerRepo.split('/')[0] ?? ''
  return owner ? `https://github.com/${encodeURIComponent(owner)}.png?size=64` : ''
}

function buildGithubSkillRawCandidates(source: string): string[] {
  const parsed = parseGithubSkillSource(source)
  if (!parsed) return []
  const ownerRepo = parsed.ownerRepo.split('/').map(encodeURIComponent).join('/')
  const skillName = encodeURIComponent(parsed.skillName)
  const branches = ['main', 'master']
  const paths = [
    `skills/${skillName}/SKILL.md`,
    `${skillName}/SKILL.md`,
    'SKILL.md',
  ]
  return branches.flatMap((branch) => paths.map((path) => `https://raw.githubusercontent.com/${ownerRepo}/${branch}/${path}`))
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'codex-web-local' },
      signal: controller.signal,
    })
    if (!resp.ok) return ''
    return await resp.text()
  } finally {
    clearTimeout(timeout)
  }
}

function resolveSkillIconUrl(icon: string, markdownUrl: string): string {
  const value = icon.trim().replace(/^['"]|['"]$/gu, '')
  if (!value) return ''
  if (/^https?:\/\//iu.test(value)) return value
  try {
    return new URL(value, markdownUrl).toString()
  } catch {
    return ''
  }
}

async function fetchGithubSkillMetadata(source: string): Promise<Partial<Pick<SkillHubEntry, 'avatarUrl' | 'description'>>> {
  for (const candidate of buildGithubSkillRawCandidates(source)) {
    try {
      const markdown = await fetchTextWithTimeout(candidate, 4_000)
      if (!markdown) continue
      const description = extractSkillDescriptionFromMarkdown(markdown)
      const icon = extractSkillFrontmatterField(markdown, 'icon')
      const avatarUrl = icon ? resolveSkillIconUrl(icon, candidate) : getGithubOwnerAvatarUrl(source)
      if (description || avatarUrl) return { description, avatarUrl }
    } catch {}
  }
  return { avatarUrl: getGithubOwnerAvatarUrl(source) }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index] as T, index)
    }
  }))
  return results
}

async function enrichSkillSearchDescriptions(results: SkillHubEntry[]): Promise<SkillHubEntry[]> {
  const enrichedHead = await mapWithConcurrency(
    results.slice(0, SKILL_SEARCH_METADATA_LIMIT),
    SKILL_SEARCH_METADATA_CONCURRENCY,
    async (result) => {
    if (!result.source) return result
    const metadata = await fetchGithubSkillMetadata(result.source)
    return {
      ...result,
      description: metadata.description || result.description,
      avatarUrl: metadata.avatarUrl || result.avatarUrl,
    }
    },
  )
  return [...enrichedHead, ...results.slice(SKILL_SEARCH_METADATA_LIMIT)]
}

type RpcSkillRecord = {
  name?: string
  description?: string
  shortDescription?: string
  path?: string
  scope?: string
  enabled?: boolean
}

function groupRpcSkillRecords<T extends RpcSkillRecord>(skills: T[]): T[] {
  const normalizedPathSet = new Set(
    skills
      .map((skill) => normalizeSkillMarkdownPath(typeof skill.path === 'string' ? skill.path : ''))
      .filter(Boolean),
  )
  const grouped = new Map<string, { preferred: T; hasRoot: boolean; anyEnabled: boolean }>()

  for (const skill of skills) {
    const rawPath = typeof skill.path === 'string' ? skill.path : ''
    const pathInfo = rawPath ? deriveSkillPathInfo(rawPath, normalizedPathSet) : null
    const groupingKey = pathInfo && pathInfo.isNestedSkill && normalizedPathSet.has(pathInfo.rootSkillPath)
      ? pathInfo.rootSkillPath
      : (pathInfo?.normalizedPath || rawPath || `${skill.scope ?? ''}:${skill.name ?? ''}`)
    const existing = grouped.get(groupingKey)
    const isRootEntry = pathInfo?.normalizedPath === groupingKey
    const groupedName = pathInfo && groupingKey === pathInfo.rootSkillPath
      ? pathInfo.rootSkillName
      : skill.name

    if (!existing) {
      grouped.set(groupingKey, {
        preferred: isRootEntry
          ? {
              ...skill,
              name: groupedName,
              path: groupingKey,
            }
          : {
              ...skill,
              name: groupedName,
              path: groupingKey,
            },
        hasRoot: isRootEntry,
        anyEnabled: skill.enabled !== false,
      })
      continue
    }

    existing.anyEnabled = existing.anyEnabled || skill.enabled !== false
    if (!existing.hasRoot && isRootEntry) {
      existing.preferred = {
        ...skill,
        name: groupedName,
        path: groupingKey,
      }
      existing.hasRoot = true
      continue
    }
    if (!existing.preferred.description && skill.description) {
      existing.preferred = { ...existing.preferred, description: skill.description }
    }
    if (!existing.preferred.shortDescription && skill.shortDescription) {
      existing.preferred = { ...existing.preferred, shortDescription: skill.shortDescription }
    }
  }

  return Array.from(grouped.values()).map(({ preferred, anyEnabled }) => ({
    ...preferred,
    enabled: preferred.enabled ?? anyEnabled,
  }))
}

type InstalledSkillInfo = { name: string; path: string; enabled: boolean }

type SkillsSyncState = {
  githubToken?: string
  githubUsername?: string
  repoOwner?: string
  repoName?: string
  lastPullCommitSha?: string
  lastPushCommitSha?: string
  lastSyncAttemptCount?: number
  lastSyncError?: string
  lastSyncAtIso?: string
}

type GithubDeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

type GithubTokenResponse = { access_token?: string; error?: string }

const GITHUB_DEVICE_CLIENT_ID = 'Iv1.b507a08c87ecfe98'
const DEFAULT_SKILLS_SYNC_REPO_NAME = 'codexskills'
const SYNC_UPSTREAM_SKILLS_OWNER = 'OpenClawAndroid'
const SYNC_UPSTREAM_SKILLS_REPO = 'skills'
const PRIVATE_SYNC_BRANCH = 'main'
const PUBLIC_UPSTREAM_BRANCH_ANDROID = 'android'
const PUBLIC_UPSTREAM_BRANCH_DEFAULT = 'main'
let startupSkillsSyncInitialized = false

type StartupSyncStatus = {
  inProgress: boolean
  mode: 'unauthenticated-bootstrap' | 'authenticated-fork-sync' | 'idle'
  branch: string
  lastAction: string
  lastRunAtIso: string
  lastSuccessAtIso: string
  lastError: string
}

const startupSyncStatus: StartupSyncStatus = {
  inProgress: false,
  mode: 'idle',
  branch: PRIVATE_SYNC_BRANCH,
  lastAction: 'not-started',
  lastRunAtIso: '',
  lastSuccessAtIso: '',
  lastError: '',
}

async function scanInstalledSkillsFromDisk(): Promise<Map<string, InstalledSkillInfo>> {
  const map = new Map<string, InstalledSkillInfo>()
  const skillsDir = getSkillsInstallDir()
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const skillMd = join(skillsDir, entry.name, 'SKILL.md')
      try {
        await stat(skillMd)
        map.set(entry.name, { name: entry.name, path: skillMd, enabled: true })
      } catch {}
    }
  } catch {}
  return map
}

async function collectInstalledSkillsMap(appServer: AppServerLike): Promise<Map<string, InstalledSkillInfo>> {
  const installedMap = await scanInstalledSkillsFromDisk()
  try {
    const result = await appServer.rpc('skills/list', {}) as { data?: Array<{ skills?: RpcSkillRecord[] }> }
    for (const entry of result.data ?? []) {
      for (const skill of groupRpcSkillRecords(entry.skills ?? [])) {
        if (skill.name) {
          installedMap.set(skill.name, { name: skill.name, path: skill.path ?? '', enabled: skill.enabled !== false })
        }
      }
    }
  } catch {}
  return installedMap
}

function extractSkillFrontmatterField(markdown: string, fieldName: string): string {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return ''
  const frontmatter: string[] = []
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trim() === '---') break
    frontmatter.push(line)
  }
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const fieldPattern = new RegExp(`^${escapedFieldName}\\s*:`, 'iu')
  const valuePattern = new RegExp(`^${escapedFieldName}\\s*:\\s*`, 'iu')
  const fieldLine = frontmatter.find((line) => fieldPattern.test(line.trim()))
  if (!fieldLine) return ''
  return fieldLine.replace(valuePattern, '').replace(/^['"]|['"]$/gu, '').trim()
}

function extractSkillDescriptionFromMarkdown(markdown: string): string {
  const frontmatterDescription = extractSkillFrontmatterField(markdown, 'description')
  if (frontmatterDescription) return frontmatterDescription
  const lines = markdown.split(/\r?\n/)
  let inCodeFence = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence || line.length === 0) continue
    if (line.startsWith('#')) continue
    if (line.startsWith('>')) continue
    if (line.startsWith('- ') || line.startsWith('* ')) continue
    return line
  }
  return ''
}

function getSkillsSyncStatePath(): string {
  return join(getCodexHomeDir(), 'skills-sync.json')
}

async function readSkillsSyncState(): Promise<SkillsSyncState> {
  try {
    const raw = await readFile(getSkillsSyncStatePath(), 'utf8')
    const parsed = JSON.parse(raw) as SkillsSyncState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeSkillsSyncState(state: SkillsSyncState): Promise<void> {
  await writeFile(getSkillsSyncStatePath(), JSON.stringify(state), 'utf8')
}

async function getGithubJson<T>(url: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const resp = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'codex-web-local',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`GitHub API ${method} ${url} failed (${resp.status}): ${text}`)
  }
  return await resp.json() as T
}

async function startGithubDeviceLogin(): Promise<GithubDeviceCodeResponse> {
  const resp = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'codex-web-local',
    },
    body: new URLSearchParams({
      client_id: GITHUB_DEVICE_CLIENT_ID,
      scope: 'repo read:user',
    }),
  })
  if (!resp.ok) {
    throw new Error(`GitHub device flow init failed (${resp.status})`)
  }
  return await resp.json() as GithubDeviceCodeResponse
}

async function completeGithubDeviceLogin(deviceCode: string): Promise<{ token: string | null; error: string | null }> {
  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'codex-web-local',
    },
    body: new URLSearchParams({
      client_id: GITHUB_DEVICE_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  if (!resp.ok) {
    throw new Error(`GitHub token exchange failed (${resp.status})`)
  }
  const payload = await resp.json() as GithubTokenResponse
  if (!payload.access_token) return { token: null, error: payload.error || 'unknown_error' }
  return { token: payload.access_token, error: null }
}

function isAndroidLikeRuntime(): boolean {
  if (process.platform === 'android') return true
  if (existsSync('/data/data/com.termux')) return true
  if (process.env.TERMUX_VERSION) return true
  const prefix = process.env.PREFIX?.toLowerCase() ?? ''
  if (prefix.includes('/com.termux/')) return true
  const proot = process.env.PROOT_TMP_DIR?.toLowerCase() ?? ''
  return proot.length > 0
}

function getPreferredPublicUpstreamBranch(): string {
  return isAndroidLikeRuntime() ? PUBLIC_UPSTREAM_BRANCH_ANDROID : PUBLIC_UPSTREAM_BRANCH_DEFAULT
}

function isUpstreamSkillsRepo(repoOwner: string, repoName: string): boolean {
  return repoOwner.toLowerCase() === SYNC_UPSTREAM_SKILLS_OWNER.toLowerCase()
    && repoName.toLowerCase() === SYNC_UPSTREAM_SKILLS_REPO.toLowerCase()
}

async function resolveGithubUsername(token: string): Promise<string> {
  const user = await getGithubJson<{ login: string }>('https://api.github.com/user', token)
  return user.login
}

async function ensurePrivateForkFromUpstream(token: string, username: string, repoName: string): Promise<void> {
  const repoUrl = `https://api.github.com/repos/${username}/${repoName}`
  let created = false
  const existing = await fetch(repoUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'codex-web-local',
    },
  })
  if (existing.ok) {
    const details = await existing.json() as { private?: boolean }
    if (details.private === true) return
    await getGithubJson(repoUrl, token, 'PATCH', { private: true })
    return
  }
  if (existing.status !== 404) {
    throw new Error(`Failed to check personal repo existence (${existing.status})`)
  }

  await getGithubJson(
    'https://api.github.com/user/repos',
    token,
    'POST',
    { name: repoName, private: true, auto_init: false, description: 'Codex skills private mirror sync' },
  )
  created = true

  let ready = false
  for (let i = 0; i < 20; i++) {
    const check = await fetch(repoUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'codex-web-local',
      },
    })
    if (check.ok) {
      ready = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Private mirror repo was created but is not available yet')
  if (!created) return

  const tmp = await mkdtemp(join(tmpdir(), 'codex-skills-seed-'))
  try {
    const upstreamUrl = `https://github.com/${SYNC_UPSTREAM_SKILLS_OWNER}/${SYNC_UPSTREAM_SKILLS_REPO}.git`
    const branch = PRIVATE_SYNC_BRANCH
    try {
      await runCommand('git', ['clone', '--depth', '1', '--single-branch', '--branch', branch, upstreamUrl, tmp])
    } catch {
      await runCommand('git', ['clone', '--depth', '1', upstreamUrl, tmp])
    }
    const privateRemote = toGitHubTokenRemote(username, repoName, token)
    await runCommand('git', ['remote', 'set-url', 'origin', privateRemote], { cwd: tmp })
    try { await runCommand('git', ['checkout', '-B', branch], { cwd: tmp }) } catch {}
    await runCommand('git', ['push', '-u', 'origin', `HEAD:${branch}`], { cwd: tmp })
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

function toGitHubTokenRemote(repoOwner: string, repoName: string, token: string): string {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${repoOwner}/${repoName}.git`
}

async function ensureSkillsWorkingTreeRepo(repoUrl: string, branch: string): Promise<string> {
  const localDir = getSkillsInstallDir()
  await mkdir(localDir, { recursive: true })
  const gitDir = join(localDir, '.git')
  let hasGitDir = false
  try { hasGitDir = (await stat(gitDir)).isDirectory() } catch { hasGitDir = false }

  if (!hasGitDir) {
    await runCommand('git', ['init'], { cwd: localDir })
    await runCommand('git', ['config', 'user.email', 'skills-sync@local'], { cwd: localDir })
    await runCommand('git', ['config', 'user.name', 'Skills Sync'], { cwd: localDir })
    await runCommand('git', ['add', '-A'], { cwd: localDir })
    try { await runCommand('git', ['commit', '-m', 'Local skills snapshot before sync'], { cwd: localDir }) } catch {}
    await runCommand('git', ['branch', '-M', branch], { cwd: localDir })
    try { await runCommand('git', ['remote', 'add', 'origin', repoUrl], { cwd: localDir }) } catch {
      await runCommand('git', ['remote', 'set-url', 'origin', repoUrl], { cwd: localDir })
    }
    await runGitFetchWithRefLockRetry(localDir)
    try {
      await runCommand('git', ['merge', '--allow-unrelated-histories', '--no-edit', `origin/${branch}`], { cwd: localDir })
    } catch {}
    return localDir
  }

  await runCommand('git', ['remote', 'set-url', 'origin', repoUrl], { cwd: localDir })
  await runGitFetchWithRefLockRetry(localDir)
  const hasLocalChangesBeforeSync = await hasLocalUncommittedChanges(localDir)
  const localMtimesBeforeSync = hasLocalChangesBeforeSync ? await snapshotFileMtimes(localDir) : new Map<string, number>()
  await resolveMergeConflictsByNewerCommit(localDir, branch, localMtimesBeforeSync)
  try {
    await runCommand('git', ['checkout', branch], { cwd: localDir })
  } catch {
    await resolveMergeConflictsByNewerCommit(localDir, branch, localMtimesBeforeSync)
    await runCommand('git', ['checkout', '-B', branch], { cwd: localDir })
  }
  await resolveMergeConflictsByNewerCommit(localDir, branch, localMtimesBeforeSync)
  await checkpointLocalSkillsChanges(localDir)
  await runGitFetchWithRefLockRetry(localDir, ['fetch', 'origin', branch])
  try {
    await runCommand('git', ['rebase', `origin/${branch}`], { cwd: localDir })
  } catch {
    await resolveMergeConflictsByNewerCommit(localDir, branch, localMtimesBeforeSync)
  }
  return localDir
}

async function checkpointLocalSkillsChanges(repoDir: string): Promise<void> {
  await runCommand('git', ['add', '-A'], { cwd: repoDir })
  try {
    await runCommand('git', ['diff', '--cached', '--quiet', '--exit-code'], { cwd: repoDir })
    return
  } catch {}
  await runCommand('git', ['commit', '-m', 'Local skills checkpoint before sync'], { cwd: repoDir })
}

async function resolveMergeConflictsByNewerCommit(
  repoDir: string,
  branch: string,
  localMtimesBeforeSync: Map<string, number> = new Map<string, number>(),
): Promise<void> {
  // Keep resolving until merge/rebase no longer reports unmerged paths.
  for (let i = 0; i < 20; i++) {
    const unmerged = (await runCommandWithOutput('git', ['diff', '--name-only', '--diff-filter=U'], { cwd: repoDir }))
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean)
    if (unmerged.length === 0) return
    for (const path of unmerged) {
      const localMtimeMs = localMtimesBeforeSync.get(path) ?? 0
      const localMtimeSec = Math.floor(localMtimeMs / 1000)
      const remoteCommitTime = await getCommitTime(repoDir, `origin/${branch}`, path)
      if (remoteCommitTime > localMtimeSec) {
        await checkoutConflictSideWithFallback(repoDir, path, '--theirs')
      } else {
        await checkoutConflictSideWithFallback(repoDir, path, '--ours')
      }
      await runCommand('git', ['add', '--', path], { cwd: repoDir })
    }
    const rebaseHead = await readOptionalGitRef(repoDir, 'REBASE_HEAD')
    if (rebaseHead) {
      try {
        await runCommand('git', ['rebase', '--continue'], { cwd: repoDir })
        continue
      } catch {
        // Continue loop and resolve next rebase-conflict batch.
        continue
      }
    }
    const mergeHead = await readOptionalGitRef(repoDir, 'MERGE_HEAD')
    if (mergeHead) {
      await runCommand('git', ['commit', '-m', 'Auto-resolve skills merge by mtime policy'], { cwd: repoDir })
      continue
    }
  }
  throw new Error('Auto-resolve exceeded retry limit while reconciling sync conflicts')
}

async function readOptionalGitRef(repoDir: string, ref: string): Promise<string> {
  try {
    return (await runCommandWithOutput('git', ['rev-parse', '-q', '--verify', ref], { cwd: repoDir })).trim()
  } catch {
    return ''
  }
}

async function listUnmergedStages(repoDir: string, path: string): Promise<Set<number>> {
  const raw = (await runCommandWithOutput('git', ['ls-files', '-u', '--', path], { cwd: repoDir })).trim()
  const stages = new Set<number>()
  if (!raw) return stages
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    const stage = Number.parseInt(parts[2] ?? '', 10)
    if (Number.isInteger(stage)) stages.add(stage)
  }
  return stages
}

async function checkoutConflictSideWithFallback(
  repoDir: string,
  path: string,
  preferredSide: '--ours' | '--theirs',
): Promise<void> {
  const stages = await listUnmergedStages(repoDir, path)
  const hasOurs = stages.has(2)
  const hasTheirs = stages.has(3)
  if (!hasOurs && !hasTheirs) return
  if (preferredSide === '--ours') {
    if (hasOurs) {
      await runCommand('git', ['checkout', '--ours', '--', path], { cwd: repoDir })
      return
    }
    await runCommand('git', ['checkout', '--theirs', '--', path], { cwd: repoDir })
    return
  }
  if (hasTheirs) {
    await runCommand('git', ['checkout', '--theirs', '--', path], { cwd: repoDir })
    return
  }
  await runCommand('git', ['checkout', '--ours', '--', path], { cwd: repoDir })
}

async function getCommitTime(repoDir: string, ref: string, path: string): Promise<number> {
  try {
    const output = (await runCommandWithOutput('git', ['log', '-1', '--format=%ct', ref, '--', path], { cwd: repoDir })).trim()
    return output ? Number.parseInt(output, 10) : 0
  } catch {
    return 0
  }
}

async function snapshotFileMtimes(dir: string): Promise<Map<string, number>> {
  const mtimes = new Map<string, number>()
  await walkFileMtimes(dir, dir, mtimes)
  return mtimes
}

async function hasLocalUncommittedChanges(repoDir: string): Promise<boolean> {
  const status = (await runCommandWithOutput('git', ['status', '--porcelain'], { cwd: repoDir })).trim()
  return status.length > 0
}

async function hasCommittableWorkingTreeChanges(repoDir: string): Promise<boolean> {
  const unstaged = (await runCommandWithOutput('git', ['diff', '--name-only', '--ignore-submodules=dirty'], { cwd: repoDir })).trim()
  if (unstaged.length > 0) return true
  const staged = (await runCommandWithOutput('git', ['diff', '--cached', '--name-only', '--ignore-submodules=dirty'], { cwd: repoDir })).trim()
  if (staged.length > 0) return true
  const untracked = (await runCommandWithOutput('git', ['ls-files', '--others', '--exclude-standard'], { cwd: repoDir })).trim()
  return untracked.length > 0
}

async function walkFileMtimes(rootDir: string, currentDir: string, out: Map<string, number>): Promise<void> {
  let entries: Array<{ name: string | Buffer; isDirectory: () => boolean; isFile: () => boolean }>
  try {
    entries = (await readdir(currentDir, { withFileTypes: true })) as Array<{ name: string | Buffer; isDirectory: () => boolean; isFile: () => boolean }>
  } catch {
    return
  }
  for (const entry of entries) {
    const entryName = String(entry.name)
    if (entryName === '.git') continue
    const absolutePath = join(currentDir, entryName)
    const relativePath = absolutePath.slice(rootDir.length + 1)
    if (entry.isDirectory()) {
      await walkFileMtimes(rootDir, absolutePath, out)
      continue
    }
    if (!entry.isFile()) continue
    try {
      const info = await stat(absolutePath)
      out.set(relativePath, info.mtimeMs)
    } catch {}
  }
}

async function syncInstalledSkillsFolderToRepo(
  token: string,
  repoOwner: string,
  repoName: string,
  _installedMap: Map<string, InstalledSkillInfo>,
): Promise<void> {
  async function hasTrackedLocalFileChanges(repoDir: string, filePath: string): Promise<boolean> {
    const diffHead = (await runCommandWithOutput('git', ['diff', '--name-only', 'HEAD', '--', filePath], { cwd: repoDir })).trim()
    if (diffHead.length > 0) return true
    const diffCached = (await runCommandWithOutput('git', ['diff', '--cached', '--name-only', '--', filePath], { cwd: repoDir })).trim()
    return diffCached.length > 0
  }

  async function restoreProtectedFilesFromOrigin(repoDir: string, branch: string): Promise<void> {
    const protectedFiles = ['AGENTS.md']
    for (const filePath of protectedFiles) {
      const hasLocalEdits = await hasTrackedLocalFileChanges(repoDir, filePath)
      if (hasLocalEdits) continue
      try {
        await runCommand('git', ['cat-file', '-e', `origin/${branch}:${filePath}`], { cwd: repoDir })
      } catch {
        continue
      }
      await runCommand('git', ['checkout', `origin/${branch}`, '--', filePath], { cwd: repoDir })
    }
    try {
      await runCommand('git', ['cat-file', '-e', `origin/${branch}:shared_skills`], { cwd: repoDir })
      await runCommand('git', ['checkout', `origin/${branch}`, '--', 'shared_skills'], { cwd: repoDir })
    } catch {
      // Ignore when the branch does not track the nested shared_skills gitlink.
    }
  }

  function isNonFastForwardPushError(error: unknown): boolean {
    const text = getErrorMessage(error, '').toLowerCase()
    return text.includes('non-fast-forward')
      || text.includes('fetch first')
      || (text.includes('rejected') && text.includes('push'))
  }

  async function pushWithNonFastForwardRetry(repoDir: string, branch: string): Promise<void> {
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const hasLocalChangesBeforeReconcile = await hasLocalUncommittedChanges(repoDir)
      const localMtimesBeforeReconcile = hasLocalChangesBeforeReconcile ? await snapshotFileMtimes(repoDir) : new Map<string, number>()
      await runGitFetchWithRefLockRetry(repoDir)
      try {
        await runCommand('git', ['rebase', `origin/${branch}`], { cwd: repoDir })
      } catch {
        try { await runCommand('git', ['rebase', '--abort'], { cwd: repoDir }) } catch {}
        try {
          await runCommand('git', ['pull', '--rebase', '--autostash', 'origin', branch], { cwd: repoDir })
        } catch {
          await resolveMergeConflictsByNewerCommit(repoDir, branch, localMtimesBeforeReconcile)
          await runCommand('git', ['pull', '--rebase', '--autostash', 'origin', branch], { cwd: repoDir })
        }
      }
      try {
        await runCommand('git', ['push', '--no-recurse-submodules', 'origin', `HEAD:${branch}`], { cwd: repoDir })
        const state = await readSkillsSyncState()
        const pushedHead = await runCommandWithOutput('git', ['rev-parse', 'HEAD'], { cwd: repoDir })
        await writeSkillsSyncState({
          ...state,
          lastPushCommitSha: pushedHead.trim(),
          lastSyncAttemptCount: attempt,
          lastSyncError: '',
          lastSyncAtIso: new Date().toISOString(),
        })
        return
      } catch (error) {
        if (!isNonFastForwardPushError(error) || attempt >= maxAttempts) {
          const state = await readSkillsSyncState()
          await writeSkillsSyncState({
            ...state,
            lastSyncAttemptCount: attempt,
            lastSyncError: getErrorMessage(error, 'push failed'),
            lastSyncAtIso: new Date().toISOString(),
          })
          throw error
        }
      }
    }
    throw new Error('Failed to push after non-fast-forward retries')
  }

  const remoteUrl = toGitHubTokenRemote(repoOwner, repoName, token)
  const branch = PRIVATE_SYNC_BRANCH
  const repoDir = await ensureSkillsWorkingTreeRepo(remoteUrl, branch)
  void _installedMap
  await runCommand('git', ['config', 'user.email', 'skills-sync@local'], { cwd: repoDir })
  await runCommand('git', ['config', 'user.name', 'Skills Sync'], { cwd: repoDir })
  await restoreProtectedFilesFromOrigin(repoDir, branch)
  await runCommand('git', ['add', '.'], { cwd: repoDir })
  let hasStagedChanges = true
  try {
    await runCommand('git', ['diff', '--cached', '--quiet', '--exit-code'], { cwd: repoDir })
    hasStagedChanges = false
  } catch {}
  if (!hasStagedChanges) {
    const head = (await runCommandWithOutput('git', ['rev-parse', 'HEAD'], { cwd: repoDir })).trim()
    const originHead = (await runCommandWithOutput('git', ['rev-parse', `origin/${branch}`], { cwd: repoDir })).trim()
    if (head !== originHead) {
      await pushWithNonFastForwardRetry(repoDir, branch)
    }
    return
  }
  await runCommand('git', ['commit', '-m', 'Sync installed skills folder and manifest'], { cwd: repoDir })
  await pushWithNonFastForwardRetry(repoDir, branch)
}

async function pullInstalledSkillsFolderFromRepo(token: string, repoOwner: string, repoName: string): Promise<void> {
  const remoteUrl = toGitHubTokenRemote(repoOwner, repoName, token)
  const branch = PRIVATE_SYNC_BRANCH
  await ensureSkillsWorkingTreeRepo(remoteUrl, branch)
}

async function bootstrapSkillsFromUpstreamIntoLocal(): Promise<void> {
  const repoUrl = `https://github.com/${SYNC_UPSTREAM_SKILLS_OWNER}/${SYNC_UPSTREAM_SKILLS_REPO}.git`
  const branch = getPreferredPublicUpstreamBranch()
  await ensureSkillsWorkingTreeRepo(repoUrl, branch)
}

async function autoPushSyncedSkills(_appServer: AppServerLike): Promise<void> {
  const state = await readSkillsSyncState()
  if (!state.githubToken || !state.repoOwner || !state.repoName) return
  if (isUpstreamSkillsRepo(state.repoOwner, state.repoName)) {
    throw new Error('Refusing to push to upstream skills repository')
  }
  const repoDir = getSkillsInstallDir()
  await runCommand('git', ['fetch', 'origin', PRIVATE_SYNC_BRANCH], { cwd: repoDir })
  const head = (await runCommandWithOutput('git', ['rev-parse', 'HEAD'], { cwd: repoDir })).trim()
  const originHead = (await runCommandWithOutput('git', ['rev-parse', `origin/${PRIVATE_SYNC_BRANCH}`], { cwd: repoDir })).trim()
  const hasCommittableChanges = await hasCommittableWorkingTreeChanges(repoDir)
  // After a successful pull, if local tree is already clean and equal to remote,
  // skip push entirely to avoid rewriting/deleting remote-only updates.
  if (!hasCommittableChanges && head === originHead) return
  const installedMap = await scanInstalledSkillsFromDisk()
  await syncInstalledSkillsFolderToRepo(state.githubToken, state.repoOwner, state.repoName, installedMap)
}

async function ensureCodexAgentsSymlinkToSkillsAgents(): Promise<void> {
  const codexHomeDir = getCodexHomeDir()
  const skillsAgentsPath = join(codexHomeDir, 'skills', 'AGENTS.md')
  const codexAgentsPath = join(codexHomeDir, 'AGENTS.md')
  await mkdir(join(codexHomeDir, 'skills'), { recursive: true })
  let copiedFromCodex = false
  try {
    const codexAgentsStat = await lstat(codexAgentsPath)
    if (codexAgentsStat.isFile() || codexAgentsStat.isSymbolicLink()) {
      const content = await readFile(codexAgentsPath, 'utf8')
      await writeFile(skillsAgentsPath, content, 'utf8')
      copiedFromCodex = true
    } else {
      await rm(codexAgentsPath, { force: true, recursive: true })
    }
  } catch {}
  if (!copiedFromCodex) {
    try {
      const skillsAgentsStat = await stat(skillsAgentsPath)
      if (!skillsAgentsStat.isFile()) {
        await rm(skillsAgentsPath, { force: true, recursive: true })
        await writeFile(skillsAgentsPath, '', 'utf8')
      }
    } catch {
      await writeFile(skillsAgentsPath, '', 'utf8')
    }
  }
  const relativeTarget = join('skills', 'AGENTS.md')
  try {
    const current = await lstat(codexAgentsPath)
    if (current.isSymbolicLink()) {
      const existingTarget = await readlink(codexAgentsPath)
      if (existingTarget === relativeTarget) return
    }
    await rm(codexAgentsPath, { force: true, recursive: true })
  } catch {}
  await symlink(relativeTarget, codexAgentsPath)
}

async function runSkillsSyncStartup(appServer: AppServerLike): Promise<void> {
  if (startupSyncStatus.inProgress) return
  startupSyncStatus.inProgress = true
  startupSyncStatus.lastRunAtIso = new Date().toISOString()
  startupSyncStatus.lastError = ''
  startupSyncStatus.branch = PRIVATE_SYNC_BRANCH
  try {
    const state = await readSkillsSyncState()
    if (!state.githubToken) {
      await ensureCodexAgentsSymlinkToSkillsAgents()
      if (!isAndroidLikeRuntime()) {
        startupSyncStatus.mode = 'idle'
        startupSyncStatus.lastAction = 'skip-upstream-non-android'
        startupSyncStatus.lastSuccessAtIso = new Date().toISOString()
        return
      }
      startupSyncStatus.mode = 'unauthenticated-bootstrap'
      startupSyncStatus.branch = getPreferredPublicUpstreamBranch()
      startupSyncStatus.lastAction = 'pull-upstream'
      await bootstrapSkillsFromUpstreamIntoLocal()
      try { await appServer.rpc('skills/list', { forceReload: true }) } catch {}
      startupSyncStatus.lastSuccessAtIso = new Date().toISOString()
      startupSyncStatus.lastAction = 'pull-upstream-complete'
      return
    }
    startupSyncStatus.mode = 'authenticated-fork-sync'
    startupSyncStatus.branch = PRIVATE_SYNC_BRANCH
    startupSyncStatus.lastAction = 'ensure-private-fork'
    const username = state.githubUsername || await resolveGithubUsername(state.githubToken)
    const repoName = DEFAULT_SKILLS_SYNC_REPO_NAME
    await ensurePrivateForkFromUpstream(state.githubToken, username, repoName)
    await writeSkillsSyncState({ ...state, githubUsername: username, repoOwner: username, repoName })
    startupSyncStatus.lastAction = 'pull-private-fork'
    await pullInstalledSkillsFolderFromRepo(state.githubToken, username, repoName)
    try { await appServer.rpc('skills/list', { forceReload: true }) } catch {}
    startupSyncStatus.lastAction = 'push-private-fork'
    await autoPushSyncedSkills(appServer)
    startupSyncStatus.lastSuccessAtIso = new Date().toISOString()
    startupSyncStatus.lastAction = 'startup-sync-complete'
  } catch (error) {
    startupSyncStatus.lastError = getErrorMessage(error, 'startup-sync-failed')
    startupSyncStatus.lastAction = 'startup-sync-failed'
  } finally {
    startupSyncStatus.inProgress = false
  }
}

export async function initializeSkillsSyncOnStartup(appServer: AppServerLike): Promise<void> {
  if (startupSkillsSyncInitialized) return
  startupSkillsSyncInitialized = true
  await runSkillsSyncStartup(appServer)
}

async function finalizeGithubLoginAndSync(token: string, username: string, appServer: AppServerLike): Promise<void> {
  const repoName = DEFAULT_SKILLS_SYNC_REPO_NAME
  await ensurePrivateForkFromUpstream(token, username, repoName)
  const current = await readSkillsSyncState()
  await writeSkillsSyncState({ ...current, githubToken: token, githubUsername: username, repoOwner: username, repoName })
  await pullInstalledSkillsFolderFromRepo(token, username, repoName)
  try { await appServer.rpc('skills/list', { forceReload: true }) } catch {}
  await autoPushSyncedSkills(appServer)
}

export async function handleSkillsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: SkillRouteContext,
): Promise<boolean> {
  const { appServer, readJsonBody } = context
  if (req.method === 'GET' && url.pathname === '/codex-api/skills-hub') {
    try {
      const installedMap = await collectInstalledSkillsMap(appServer)
      const installed = await Promise.all([...installedMap.values()].map((info) => buildLocalHubEntry(info)))
      installed.sort((a, b) => a.name.localeCompare(b.name))
      setJson(res, 200, { installed })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to fetch skills hub') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/skills-hub/search') {
    try {
      const query = (url.searchParams.get('q') || '').trim()
      if (query.length < 2) {
        setJson(res, 200, { results: [] })
        return true
      }
      const installedMap = await collectInstalledSkillsMap(appServer)
      const output = await runCommandWithOutput('npx', ['--yes', 'skills', 'find', query], { timeoutMs: 60_000 })
      const results = await enrichSkillSearchDescriptions(parseNpxSkillsFindOutput(output, installedMap))
      setJson(res, 200, { results })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to search skills') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/skills-sync/status') {
    const state = await readSkillsSyncState()
    setJson(res, 200, {
      data: {
        loggedIn: Boolean(state.githubToken),
        githubUsername: state.githubUsername ?? '',
        repoOwner: state.repoOwner ?? '',
        repoName: state.repoName ?? '',
        configured: Boolean(state.githubToken && state.repoOwner && state.repoName),
        telemetry: {
          lastPullCommitSha: state.lastPullCommitSha ?? '',
          lastPushCommitSha: state.lastPushCommitSha ?? '',
          lastSyncAttemptCount: state.lastSyncAttemptCount ?? 0,
          lastSyncError: state.lastSyncError ?? '',
          lastSyncAtIso: state.lastSyncAtIso ?? '',
        },
        startup: {
          inProgress: startupSyncStatus.inProgress,
          mode: startupSyncStatus.mode,
          branch: startupSyncStatus.branch,
          lastAction: startupSyncStatus.lastAction,
          lastRunAtIso: startupSyncStatus.lastRunAtIso,
          lastSuccessAtIso: startupSyncStatus.lastSuccessAtIso,
          lastError: startupSyncStatus.lastError,
        },
      },
    })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-sync/github/start-login') {
    try {
      const started = await startGithubDeviceLogin()
      setJson(res, 200, { data: started })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to start GitHub login') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-sync/github/token-login') {
    try {
      const payload = asRecord(await readJsonBody(req))
      const token = typeof payload?.token === 'string' ? payload.token.trim() : ''
      if (!token) {
        setJson(res, 400, { error: 'Missing GitHub token' })
        return true
      }
      const username = await resolveGithubUsername(token)
      await finalizeGithubLoginAndSync(token, username, appServer)
      setJson(res, 200, { ok: true, data: { githubUsername: username } })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to login with GitHub token') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-sync/github/logout') {
    try {
      const state = await readSkillsSyncState()
      await writeSkillsSyncState({
        ...state,
        githubToken: undefined,
        githubUsername: undefined,
        repoOwner: undefined,
        repoName: undefined,
      })
      setJson(res, 200, { ok: true })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to logout GitHub') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-sync/github/complete-login') {
    try {
      const payload = asRecord(await readJsonBody(req))
      const deviceCode = typeof payload?.deviceCode === 'string' ? payload.deviceCode : ''
      if (!deviceCode) {
        setJson(res, 400, { error: 'Missing deviceCode' })
        return true
      }
      const result = await completeGithubDeviceLogin(deviceCode)
      if (!result.token) {
        setJson(res, 200, { ok: false, pending: result.error === 'authorization_pending', error: result.error || 'login_failed' })
        return true
      }
      const token = result.token
      const username = await resolveGithubUsername(token)
      await finalizeGithubLoginAndSync(token, username, appServer)
      setJson(res, 200, { ok: true, data: { githubUsername: username } })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to complete GitHub login') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-sync/push') {
    try {
      const state = await readSkillsSyncState()
      if (!state.githubToken || !state.repoOwner || !state.repoName) {
        setJson(res, 400, { error: 'Skills sync is not configured yet' })
        return true
      }
      if (isUpstreamSkillsRepo(state.repoOwner, state.repoName)) {
        setJson(res, 400, { error: 'Refusing to push to upstream repository' })
        return true
      }
      const installedMap = await collectInstalledSkillsMap(appServer)
      await syncInstalledSkillsFolderToRepo(state.githubToken, state.repoOwner, state.repoName, installedMap)
      setJson(res, 200, { ok: true, data: { synced: installedMap.size } })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to push synced skills') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-sync/startup-sync') {
    try {
      await runSkillsSyncStartup(appServer)
      setJson(res, 200, { ok: true })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to run startup sync') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-sync/pull') {
    try {
      const state = await readSkillsSyncState()
      if (!state.githubToken || !state.repoOwner || !state.repoName) {
        await bootstrapSkillsFromUpstreamIntoLocal()
        try { await appServer.rpc('skills/list', { forceReload: true }) } catch {}
        setJson(res, 200, { ok: true, data: { synced: 0, source: 'upstream' } })
        return true
      }
      await pullInstalledSkillsFolderFromRepo(state.githubToken, state.repoOwner, state.repoName)
      const localSkills = await scanInstalledSkillsFromDisk()
      const pulledHead = await runCommandWithOutput('git', ['rev-parse', 'HEAD'], { cwd: getSkillsInstallDir() }).catch(() => '')
      await writeSkillsSyncState({
        ...state,
        lastPullCommitSha: pulledHead.trim(),
        lastSyncAttemptCount: 1,
        lastSyncError: '',
        lastSyncAtIso: new Date().toISOString(),
      })
      try { await appServer.rpc('skills/list', { forceReload: true }) } catch {}
      setJson(res, 200, { ok: true, data: { synced: localSkills.size } })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to pull synced skills') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/skills-hub/readme') {
    try {
      const owner = url.searchParams.get('owner') || ''
      const name = url.searchParams.get('name') || ''
      const installed = url.searchParams.get('installed') === 'true'
      const skillPath = url.searchParams.get('path') || ''
      if (!owner || !name) {
        setJson(res, 400, { error: 'Missing owner or name' })
        return true
      }
      if (installed) {
        const installedMap = await scanInstalledSkillsFromDisk()
        const installedInfo = installedMap.get(name)
        const localSkillPath = installedInfo?.path
          || (skillPath ? (skillPath.endsWith('/SKILL.md') ? skillPath : `${skillPath}/SKILL.md`) : '')
        if (localSkillPath) {
          const content = await readFile(localSkillPath, 'utf8')
          const description = extractSkillDescriptionFromMarkdown(content)
          setJson(res, 200, { content, description, source: 'local' })
          return true
        }
      }
      setJson(res, 404, { error: 'Only installed local skills are available in Skills Hub.' })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to fetch SKILL.md') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-hub/install') {
    try {
      const payload = asRecord(await readJsonBody(req))
      const source = typeof payload?.source === 'string' ? payload.source.trim() : ''
      const owner = typeof payload?.owner === 'string' ? payload.owner.trim() : ''
      const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
      const installSource = source || (owner && name ? `${owner}@${name}` : '')
      if (!installSource || !/^[A-Za-z0-9._/-]+@[A-Za-z0-9._-]+$/u.test(installSource)) {
        setJson(res, 400, { error: 'Missing or invalid skill source' })
        return true
      }
      await runCommand('npx', ['--yes', 'skills', 'add', installSource, '--yes', '--global'], { timeoutMs: 120_000 })
      try { await withTimeout(appServer.rpc('skills/list', { forceReload: true }), 10_000, 'skills/list reload') } catch {}
      const installedMap = await collectInstalledSkillsMap(appServer)
      const installed = installedMap.get(name || installSource.slice(installSource.lastIndexOf('@') + 1))
      if (!installed?.path) {
        throw new Error(`Skill install completed but ${installSource} was not found in local installed skills`)
      }
      await ensureInstalledSkillIsValid(appServer, installed.path)
      autoPushSyncedSkills(appServer).catch(() => {})
      setJson(res, 200, { ok: true, path: installed.path })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to install skill') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/skills-hub/uninstall') {
    try {
      const payload = asRecord(await readJsonBody(req))
      const name = typeof payload?.name === 'string' ? payload.name : ''
      const path = typeof payload?.path === 'string' ? payload.path : ''
      const normalizedPath = path.endsWith('/SKILL.md') ? path.slice(0, -'/SKILL.md'.length) : path
      const target = normalizedPath || (name ? join(getSkillsInstallDir(), name) : '')
      if (!target) {
        setJson(res, 400, { error: 'Missing name or path' })
        return true
      }
      await rm(target, { recursive: true, force: true })
      autoPushSyncedSkills(appServer).catch(() => {})
      try { await withTimeout(appServer.rpc('skills/list', { forceReload: true }), 10_000, 'skills/list reload') } catch {}
      setJson(res, 200, { ok: true, deletedPath: target })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to uninstall skill') })
    }
    return true
  }

  return false
}
