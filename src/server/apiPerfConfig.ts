import { readFileSync } from 'node:fs'

const API_PERF_LOGGING_ENV_KEY = 'CODEXUI_API_PERF_LOGGING'
export const API_PERF_MS_THRESHOLD_ENV_KEY = 'CODEXUI_API_PERF_MS_THRESHOLD'
export const API_PERF_BODY_MB_THRESHOLD_ENV_KEY = 'CODEXUI_API_PERF_BODY_MB_THRESHOLD'
const DEFAULT_API_PERF_MS_THRESHOLD = 300
const DEFAULT_API_PERF_BODY_MB_THRESHOLD = 1
export const MB_DIVISOR = 1024 * 1024
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

export const API_PERF_LOGGING_ENABLED = resolveApiPerfLoggingEnabled()

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

export const API_PERF_MS_THRESHOLD = resolveNumericEnvConfig(API_PERF_MS_THRESHOLD_ENV_KEY, DEFAULT_API_PERF_MS_THRESHOLD)
export const API_PERF_BODY_MB_THRESHOLD = resolveNumericEnvConfig(API_PERF_BODY_MB_THRESHOLD_ENV_KEY, DEFAULT_API_PERF_BODY_MB_THRESHOLD)

export function getChunkByteLength(chunk: unknown, encoding?: BufferEncoding): number {
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
