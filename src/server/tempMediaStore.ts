import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const TEMP_MEDIA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const TEMP_MEDIA_ROOT_SEGMENT = join('tmp', 'codex-web-media')

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

export function getManagedTempMediaRoot(codexHome = getCodexHomeDir()): string {
  return join(codexHome, TEMP_MEDIA_ROOT_SEGMENT)
}

function isMissingFileSystemEntryError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function sanitizeTempMediaFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[\\/]+/g, '_')
  return normalized.length > 0 ? normalized : 'uploaded-file'
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

async function ensureTempMediaRoot(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
}

export async function pruneManagedTempMedia(
  root = getManagedTempMediaRoot(),
  nowMs = Date.now(),
): Promise<void> {
  const cutoffMs = nowMs - TEMP_MEDIA_RETENTION_MS
  await ensureTempMediaRoot(root)

  try {
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = join(root, entry.name)
      try {
        const info = await stat(entryPath)
        if (info.mtimeMs >= cutoffMs) continue
        await rm(entryPath, { recursive: true, force: true })
      } catch (error) {
        if (isMissingFileSystemEntryError(error)) continue
        throw error
      }
    }
  } catch (error) {
    if (isMissingFileSystemEntryError(error)) return
    throw error
  }
}

export async function storeManagedTempMediaFile(
  fileName: string,
  bytes: Buffer,
  options: { root?: string } = {},
): Promise<string> {
  const root = options.root ?? getManagedTempMediaRoot()
  await pruneManagedTempMedia(root)
  const uploadDir = await mkdtemp(join(root, 'asset-'))
  const filePath = join(uploadDir, sanitizeTempMediaFileName(fileName))
  await writeFile(filePath, bytes)
  return filePath
}

export async function storeManagedTempMediaDataUrl(
  dataUrl: string,
  baseName: string,
  options: { root?: string } = {},
): Promise<string | null> {
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
  const extension = extensionFromMimeType(mimeType)
  const safeBaseName = sanitizeTempMediaFileName(baseName)
  const fileName = `${safeBaseName}-${hash}${extension}`
  return await storeManagedTempMediaFile(fileName, bytes, options)
}
