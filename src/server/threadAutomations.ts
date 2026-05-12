import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAbsoluteLikePath } from '../pathUtils.js'

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getCodexAutomationsDir(): string {
  return join(getCodexHomeDir(), 'automations')
}

export type ThreadAutomationStatus = 'ACTIVE' | 'PAUSED'

export type ThreadAutomationRecord = {
  id: string
  kind: 'heartbeat' | 'cron'
  name: string
  prompt: string
  rrule: string
  status: ThreadAutomationStatus
  targetThreadId: string | null
  cwds: string[]
  extraTomlLines: string[]
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

function parseTomlStringArray(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return []
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch {
    return []
  }
}

function serializeTomlStringArray(values: string[]): string {
  return `[${values.map((value) => serializeTomlString(value)).join(', ')}]`
}

function parseAutomationToml(raw: string): ThreadAutomationRecord | null {
  const values: Record<string, string> = {}
  const extraTomlLines: string[] = []
  const knownKeys = new Set([
    'version',
    'id',
    'kind',
    'name',
    'prompt',
    'status',
    'rrule',
    'target_thread_id',
    'cwds',
    'created_at',
    'updated_at',
  ])
  let isInsideExtraTable = false
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      isInsideExtraTable = true
      extraTomlLines.push(trimmed)
      continue
    }
    if (isInsideExtraTable) {
      extraTomlLines.push(trimmed)
      continue
    }
    if (!trimmed.includes('=')) {
      extraTomlLines.push(trimmed)
      continue
    }
    const separatorIndex = trimmed.indexOf('=')
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (!key) continue
    if (knownKeys.has(key)) {
      values[key] = value
    } else {
      extraTomlLines.push(trimmed)
    }
  }

  const id = readTomlString(values.id ?? '')
  const kindValue = readTomlString(values.kind ?? (values.cwds ? 'cron' : 'heartbeat'))
  const name = readTomlString(values.name ?? '')
  const prompt = readTomlString(values.prompt ?? '')
  const rrule = readTomlString(values.rrule ?? '')
  const statusValue = readTomlString(values.status ?? 'ACTIVE')
  const targetThreadId = readTomlString(values.target_thread_id ?? '') || null
  const cwds = parseTomlStringArray(values.cwds ?? '')
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
    cwds,
    extraTomlLines,
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
  ]
  if (record.targetThreadId) {
    lines.push(`target_thread_id = ${serializeTomlString(record.targetThreadId)}`)
  }
  if (record.cwds.length > 0) {
    lines.push(`cwds = ${serializeTomlStringArray(record.cwds)}`)
  }
  lines.push(
    `created_at = ${String(record.createdAtMs ?? Date.now())}`,
    `updated_at = ${String(record.updatedAtMs ?? Date.now())}`,
  )
  lines.push(...record.extraTomlLines)
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

export async function listThreadHeartbeatAutomations(): Promise<Record<string, ThreadAutomationRecord[]>> {
  const automationRoot = getCodexAutomationsDir()
  const next: Record<string, ThreadAutomationRecord[]> = {}
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
    next[automation.targetThreadId] = [...(next[automation.targetThreadId] ?? []), automation]
  }

  for (const automations of Object.values(next)) {
    automations.sort((first, second) => {
      const firstCreatedAt = first.createdAtMs ?? 0
      const secondCreatedAt = second.createdAtMs ?? 0
      if (firstCreatedAt !== secondCreatedAt) return firstCreatedAt - secondCreatedAt
      return first.id.localeCompare(second.id)
    })
  }

  return next
}

export async function readThreadHeartbeatAutomations(threadId: string): Promise<ThreadAutomationRecord[]> {
  const all = await listThreadHeartbeatAutomations()
  return all[threadId] ?? []
}

export async function readThreadHeartbeatAutomation(threadId: string, automationId = ''): Promise<ThreadAutomationRecord | null> {
  const automations = await readThreadHeartbeatAutomations(threadId)
  if (automationId) return automations.find((automation) => automation.id === automationId) ?? null
  return automations[0] ?? null
}

function resolveUniqueAutomationId(existingIds: Set<string>, threadId: string, name: string): string {
  const baseId = slugifyAutomationId(threadId, name)
  if (!existingIds.has(baseId)) return baseId
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseId}-${index}`
    if (!existingIds.has(candidate)) return candidate
  }
  return `${baseId}-${randomBytes(4).toString('hex')}`
}

export async function writeThreadHeartbeatAutomation(input: {
  threadId: string
  id?: string
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
  const existing = input.id ? await readThreadHeartbeatAutomation(threadId, input.id.trim()) : null
  const entries = await readdir(automationRoot, { withFileTypes: true }).catch(() => [])
  const existingIds = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  const id = existing?.id ?? resolveUniqueAutomationId(existingIds, threadId, name)
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
    cwds: [],
    extraTomlLines: existing?.extraTomlLines ?? [],
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

export async function deleteThreadHeartbeatAutomation(threadId: string, automationId = ''): Promise<boolean> {
  const normalizedThreadId = threadId.trim()
  const normalizedAutomationId = automationId.trim()
  if (normalizedAutomationId) {
    const automation = await readThreadHeartbeatAutomation(normalizedThreadId, normalizedAutomationId)
    if (!automation) return false
    await rm(join(getCodexAutomationsDir(), automation.id), { recursive: true, force: true })
    return true
  }

  const automations = await readThreadHeartbeatAutomations(normalizedThreadId)
  if (automations.length === 0) return false
  await Promise.all(automations.map((automation) => rm(join(getCodexAutomationsDir(), automation.id), { recursive: true, force: true })))
  return true
}

export async function listProjectCronAutomations(): Promise<Record<string, ThreadAutomationRecord[]>> {
  const automationRoot = getCodexAutomationsDir()
  const next: Record<string, ThreadAutomationRecord[]> = {}
  let entries
  try {
    entries = await readdir(automationRoot, { withFileTypes: true })
  } catch {
    return next
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const automation = await readAutomationRecordFromFile(join(automationRoot, entry.name, 'automation.toml'))
    if (!automation || automation.kind !== 'cron' || automation.cwds.length === 0) continue
    for (const cwd of automation.cwds) {
      next[cwd] = [...(next[cwd] ?? []), automation]
    }
  }

  for (const automations of Object.values(next)) {
    automations.sort((first, second) => {
      const firstCreatedAt = first.createdAtMs ?? 0
      const secondCreatedAt = second.createdAtMs ?? 0
      if (firstCreatedAt !== secondCreatedAt) return firstCreatedAt - secondCreatedAt
      return first.id.localeCompare(second.id)
    })
  }

  return next
}

export async function readProjectCronAutomations(projectName: string): Promise<ThreadAutomationRecord[]> {
  const all = await listProjectCronAutomations()
  return all[projectName] ?? []
}

export async function readProjectCronAutomation(projectName: string, automationId = ''): Promise<ThreadAutomationRecord | null> {
  const automations = await readProjectCronAutomations(projectName)
  if (automationId) return automations.find((automation) => automation.id === automationId) ?? null
  return automations[0] ?? null
}

export async function writeProjectCronAutomation(input: {
  projectName: string
  id?: string
  name: string
  prompt: string
  rrule: string
  status: ThreadAutomationStatus
}): Promise<ThreadAutomationRecord> {
  const projectName = input.projectName.trim()
  const name = input.name.trim()
  const prompt = input.prompt.trim()
  const rrule = input.rrule.trim()
  if (!projectName || !name || !prompt || !rrule) {
    throw new Error('projectName, name, prompt, and rrule are required')
  }
  if (!isAbsoluteLikePath(projectName)) {
    throw new Error('Project automation cwd must be an absolute path')
  }

  const automationRoot = getCodexAutomationsDir()
  await mkdir(automationRoot, { recursive: true })
  const existing = input.id ? await readProjectCronAutomation(projectName, input.id.trim()) : null
  const entries = await readdir(automationRoot, { withFileTypes: true }).catch(() => [])
  const existingIds = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  const id = existing?.id ?? resolveUniqueAutomationId(existingIds, projectName, name)
  const automationDir = join(automationRoot, id)
  const now = Date.now()
  const record: ThreadAutomationRecord = {
    id,
    kind: 'cron',
    name,
    prompt,
    rrule,
    status: input.status,
    targetThreadId: null,
    cwds: Array.from(new Set([...(existing?.cwds ?? []), projectName])),
    extraTomlLines: existing?.extraTomlLines ?? [],
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

export async function deleteProjectCronAutomation(projectName: string, automationId = ''): Promise<boolean> {
  const normalizedProjectName = projectName.trim()
  const normalizedAutomationId = automationId.trim()
  if (!normalizedProjectName || !isAbsoluteLikePath(normalizedProjectName)) return false
  if (normalizedAutomationId) {
    const automation = await readProjectCronAutomation(normalizedProjectName, normalizedAutomationId)
    if (!automation) return false
    const remainingCwds = automation.cwds.filter((cwd) => cwd !== normalizedProjectName)
    if (remainingCwds.length > 0) {
      const record = { ...automation, cwds: remainingCwds, updatedAtMs: Date.now() }
      await writeFile(join(getCodexAutomationsDir(), automation.id, 'automation.toml'), serializeAutomationToml(record), 'utf8')
    } else {
      await rm(join(getCodexAutomationsDir(), automation.id), { recursive: true, force: true })
    }
    return true
  }

  const automations = await readProjectCronAutomations(normalizedProjectName)
  if (automations.length === 0) return false
  await Promise.all(automations.map(async (automation) => {
    const remainingCwds = automation.cwds.filter((cwd) => cwd !== normalizedProjectName)
    if (remainingCwds.length > 0) {
      const record = { ...automation, cwds: remainingCwds, updatedAtMs: Date.now() }
      await writeFile(join(getCodexAutomationsDir(), automation.id, 'automation.toml'), serializeAutomationToml(record), 'utf8')
      return
    }
    await rm(join(getCodexAutomationsDir(), automation.id), { recursive: true, force: true })
  }))
  return true
}
