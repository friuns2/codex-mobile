import { spawn } from 'node:child_process'
import { readFile, readdir, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

function getSharedSkillsInstallDir(): string {
  return join(getSkillsInstallDir(), 'shared_skills')
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
      try { await withTimeout(appServer.rpc('skills/list', { forceReload: true }), 10_000, 'skills/list reload') } catch {}
      setJson(res, 200, { ok: true, deletedPath: target })
    } catch (error) {
      setJson(res, 502, { error: getErrorMessage(error, 'Failed to uninstall skill') })
    }
    return true
  }

  return false
}
