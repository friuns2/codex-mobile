import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

const THREAD_METHODS_WITH_TURNS = new Set(['thread/read', 'thread/resume', 'thread/fork', 'thread/rollback'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

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

type SessionRecoveredSkillInput = {
  name: string
  path: string
}

type SessionSkillInputCacheEntry = {
  size: number
  mtimeMs: number
  skillsByTurnId: Map<string, SessionRecoveredSkillInput[]>
}

const SESSION_SKILL_INPUT_CACHE_LIMIT = 64
const sessionSkillInputCache = new Map<string, SessionSkillInputCacheEntry>()

function parseSessionSkillText(value: string): SessionRecoveredSkillInput | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('<skill>')) return null
  const name = trimmed.match(/<name>\s*([\s\S]*?)\s*<\/name>/u)?.[1]?.trim() ?? ''
  const path = trimmed.match(/<path>\s*([\s\S]*?)\s*<\/path>/u)?.[1]?.trim() ?? ''
  if (!name || !path) return null
  return { name, path }
}

function buildSessionSkillInputsByTurn(sessionLogRaw: string): Map<string, SessionRecoveredSkillInput[]> {
  let currentTurnId = ''
  const skillsByTurnId = new Map<string, SessionRecoveredSkillInput[]>()

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
    if (row.type === 'event_msg') {
      const payloadRecord = asRecord(row.payload)
      if (payloadRecord?.type === 'task_started') {
        currentTurnId = readNonEmptyString(payloadRecord.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId) continue
    const payloadRecord = asRecord(row.payload)
    if (payloadRecord?.type !== 'message' || payloadRecord.role !== 'user') continue
    const content = Array.isArray(payloadRecord.content) ? payloadRecord.content : []

    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem)
      if (contentRecord?.type !== 'input_text' || typeof contentRecord.text !== 'string') continue
      const skill = parseSessionSkillText(contentRecord.text)
      if (!skill) continue
      const existing = skillsByTurnId.get(currentTurnId) ?? []
      if (!existing.some((item) => item.path === skill.path)) {
        existing.push(skill)
        skillsByTurnId.set(currentTurnId, existing)
      }
    }
  }

  return skillsByTurnId
}

async function readCachedSessionSkillInputsByTurn(sessionPath: string): Promise<Map<string, SessionRecoveredSkillInput[]>> {
  const sessionStat = await stat(sessionPath)
  const cached = sessionSkillInputCache.get(sessionPath)
  if (cached && cached.size === sessionStat.size && cached.mtimeMs === sessionStat.mtimeMs) {
    return cached.skillsByTurnId
  }

  const sessionLogRaw = await readFile(sessionPath, 'utf8')
  const skillsByTurnId = buildSessionSkillInputsByTurn(sessionLogRaw)
  sessionSkillInputCache.set(sessionPath, {
    size: sessionStat.size,
    mtimeMs: sessionStat.mtimeMs,
    skillsByTurnId,
  })
  if (sessionSkillInputCache.size > SESSION_SKILL_INPUT_CACHE_LIMIT) {
    const oldestKey = sessionSkillInputCache.keys().next().value
    if (oldestKey) sessionSkillInputCache.delete(oldestKey)
  }
  return skillsByTurnId
}

function mergeSessionSkillInputsIntoTurnsFromMap(
  turns: unknown[],
  skillsByTurnId: Map<string, SessionRecoveredSkillInput[]>,
): unknown[] {
  const turnIds = new Set<string>()
  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) turnIds.add(turnId)
  }
  if (turnIds.size === 0) return turns

  if (skillsByTurnId.size === 0) return turns

  let changed = false
  const nextTurns = turns.map((turn) => {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    const skills = turnId ? skillsByTurnId.get(turnId) : undefined
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : null
    if (!turnRecord || !skills || skills.length === 0 || !items) return turn

    let targetUserMessageIndex = -1
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const itemRecord = asRecord(items[index])
      if (itemRecord?.type === 'userMessage' && Array.isArray(itemRecord.content)) {
        targetUserMessageIndex = index
        break
      }
    }
    if (targetUserMessageIndex < 0) return turn

    let addedToMessage = false
    const nextItems = items.map((item, index) => {
      const itemRecord = asRecord(item)
      const content = Array.isArray(itemRecord?.content) ? itemRecord.content : null
      if (index !== targetUserMessageIndex || itemRecord?.type !== 'userMessage' || !content) return item

      const existingSkillPaths = new Set(
        content.flatMap((contentItem) => {
          const contentRecord = asRecord(contentItem)
          const path = typeof contentRecord?.path === 'string' ? contentRecord.path.trim() : ''
          return contentRecord?.type === 'skill' && path ? [path] : []
        }),
      )
      const missingSkills = skills.filter((skill) => !existingSkillPaths.has(skill.path))
      if (missingSkills.length === 0) return item

      addedToMessage = true
      changed = true
      return {
        ...itemRecord,
        content: [
          ...content,
          ...missingSkills.map((skill) => ({ type: 'skill', name: skill.name, path: skill.path })),
        ],
      }
    })

    return addedToMessage ? { ...turnRecord, items: nextItems } : turn
  })

  return changed ? nextTurns : turns
}

export function mergeSessionSkillInputsIntoTurns(turns: unknown[], sessionLogRaw: string): unknown[] {
  return mergeSessionSkillInputsIntoTurnsFromMap(turns, buildSessionSkillInputsByTurn(sessionLogRaw))
}

export async function mergeSessionSkillInputsIntoThreadResult(result: unknown): Promise<unknown> {
  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  const sessionPath = readNonEmptyString(thread?.path)
  if (!record || !thread || !turns || turns.length === 0 || !sessionPath || !isAbsolute(sessionPath)) {
    return result
  }

  try {
    const skillsByTurnId = await readCachedSessionSkillInputsByTurn(sessionPath)
    const mergedTurns = mergeSessionSkillInputsIntoTurnsFromMap(turns, skillsByTurnId)
    if (mergedTurns === turns) return result
    return {
      ...record,
      thread: {
        ...thread,
        turns: mergedTurns,
      },
    }
  } catch {
    return result
  }
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
