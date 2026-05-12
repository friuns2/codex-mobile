import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

type WorkspaceRootsState = {
  order: string[]
  labels: Record<string, string>
  active: string[]
  projectOrder: string[]
  remoteProjects?: Array<{ id: string; hostId: string; remotePath: string; label?: string }>
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getCodexGlobalStatePath(): string {
  return join(getCodexHomeDir(), '.codex-global-state.json')
}

function getCodexSessionIndexPath(): string {
  return join(getCodexHomeDir(), 'session_index.jsonl')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !normalized.includes(item)) {
      normalized.push(item)
    }
  }
  return normalized
}

export function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key === 'string' && key.length > 0 && typeof item === 'string') {
      next[key] = item
    }
  }
  return next
}

export function normalizeRemoteProjects(value: unknown): WorkspaceRootsState['remoteProjects'] {
  if (!Array.isArray(value)) return []
  const next: WorkspaceRootsState['remoteProjects'] = []
  const seen = new Set<string>()
  for (const item of value) {
    const record = asRecord(item)
    if (!record) continue
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push({
      id,
      hostId: typeof record.hostId === 'string' ? record.hostId.trim() : '',
      remotePath: typeof record.remotePath === 'string' ? record.remotePath.trim() : '',
      label: typeof record.label === 'string' ? record.label.trim() : '',
    })
  }
  return next
}

export type ThreadTitleCache = { titles: Record<string, string>; order: string[] }
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

export function normalizePinnedThreadIds(value: unknown): string[] {
  return normalizeStringArray(value)
}

export function updateThreadTitleCache(cache: ThreadTitleCache, id: string, title: string): ThreadTitleCache {
  const titles = { ...cache.titles, [id]: title }
  const order = [id, ...cache.order.filter((o) => o !== id)]
  while (order.length > MAX_THREAD_TITLES) {
    const removed = order.pop()
    if (removed) delete titles[removed]
  }
  return { titles, order }
}

export function removeFromThreadTitleCache(cache: ThreadTitleCache, id: string): ThreadTitleCache {
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

export async function readThreadTitleCache(): Promise<ThreadTitleCache> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadTitleCache(payload['thread-titles'])
  } catch {
    return EMPTY_THREAD_TITLE_CACHE
  }
}

export async function writeThreadTitleCache(cache: ThreadTitleCache): Promise<void> {
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

export async function readPinnedThreadIds(): Promise<string[]> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizePinnedThreadIds(payload[PINNED_THREAD_IDS_KEY])
  } catch {
    return []
  }
}

export async function writePinnedThreadIds(threadIds: string[]): Promise<void> {
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

export async function readFirstLaunchPluginsCardDismissed(): Promise<boolean> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return payload[FIRST_LAUNCH_PLUGINS_CARD_DISMISSED_KEY] === true
  } catch {
    return false
  }
}

export async function writeFirstLaunchPluginsCardDismissed(dismissed: boolean): Promise<void> {
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

export async function readMergedThreadTitleCache(): Promise<ThreadTitleCache> {
  const [sessionIndexCache, persistedCache] = await Promise.all([
    readThreadTitlesFromSessionIndex(),
    readThreadTitleCache(),
  ])
  return mergeThreadTitleCaches(persistedCache, sessionIndexCache)
}

export async function readWorkspaceRootsState(): Promise<WorkspaceRootsState> {
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
    projectOrder: normalizeStringArray(payload['project-order']),
    remoteProjects: normalizeRemoteProjects(payload['remote-projects']),
  }
}

export async function writeWorkspaceRootsState(nextState: WorkspaceRootsState): Promise<void> {
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
  payload['project-order'] = normalizeStringArray(nextState.projectOrder)

  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

let workspaceRootsMutation: Promise<void> = Promise.resolve()

function queueWorkspaceRootsMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const run = workspaceRootsMutation.catch(() => undefined).then(mutation)
  workspaceRootsMutation = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function prependUniqueString(value: string, items: string[]): string[] {
  return [value, ...items.filter((item) => item !== value)]
}

export async function updateWorkspaceRootsState(
  updater: (existingState: WorkspaceRootsState) => WorkspaceRootsState,
): Promise<void> {
  await queueWorkspaceRootsMutation(async () => {
    const existingState = await readWorkspaceRootsState()
    await writeWorkspaceRootsState(updater(existingState))
  })
}

export async function persistWorkspaceRoot(workspaceRoot: string, label = ''): Promise<void> {
  const normalizedRoot = workspaceRoot.trim()
  if (!normalizedRoot) return

  await updateWorkspaceRootsState((existingState) => {
    const nextLabels = { ...existingState.labels }
    const trimmedLabel = label.trim()
    if (trimmedLabel.length > 0) {
      nextLabels[normalizedRoot] = trimmedLabel
    }
    return {
      order: prependUniqueString(normalizedRoot, existingState.order),
      labels: nextLabels,
      active: prependUniqueString(normalizedRoot, existingState.active),
      projectOrder: prependUniqueString(normalizedRoot, existingState.projectOrder),
      remoteProjects: existingState.remoteProjects,
    }
  })
}
