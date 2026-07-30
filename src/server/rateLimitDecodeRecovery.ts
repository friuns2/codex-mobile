type RpcExecutor = {
  rpc(method: string, params: unknown): Promise<unknown>
}

type RateLimitWindow = {
  usedPercent: number
  windowDurationMins: number | null
  windowMinutes: number | null
  resetsAt: number | null
}

type RateLimitSnapshot = {
  limitId: string | null
  limitName: string | null
  primary: RateLimitWindow | null
  secondary: RateLimitWindow | null
  credits: {
    hasCredits: boolean
    unlimited: boolean
    balance: string | null
  } | null
  planType: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseJsonObjectAt(text: string, startIndex: number): unknown {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return JSON.parse(text.slice(startIndex, index + 1))
      }
    }
  }

  return null
}

function extractResponseBodyFromDecodeError(error: unknown): Record<string, unknown> | null {
  const message = getErrorMessage(error)
  if (!message.includes('unknown variant') || !message.includes('plan_type') || !message.includes('body=')) {
    return null
  }

  const bodyMarkerIndex = message.indexOf('body=')
  const bodyStartIndex = message.indexOf('{', bodyMarkerIndex)
  if (bodyStartIndex < 0) return null

  try {
    return asRecord(parseJsonObjectAt(message, bodyStartIndex))
  } catch {
    return null
  }
}

function normalizeWindow(value: unknown): RateLimitWindow | null {
  const record = asRecord(value)
  if (!record) return null

  const usedPercent = readNumber(record.used_percent)
  if (usedPercent === null) return null

  const limitWindowSeconds = readNumber(record.limit_window_seconds)
  const windowMinutes = limitWindowSeconds === null ? null : Math.round(limitWindowSeconds / 60)
  return {
    usedPercent,
    windowDurationMins: windowMinutes,
    windowMinutes,
    resetsAt: readNumber(record.reset_at),
  }
}

function normalizeCredits(value: unknown): RateLimitSnapshot['credits'] {
  const record = asRecord(value)
  if (!record) return null

  const hasCredits = readBoolean(record.has_credits)
  const unlimited = readBoolean(record.unlimited)
  if (hasCredits === null || unlimited === null) return null

  return {
    hasCredits,
    unlimited,
    balance: readString(record.balance),
  }
}

function buildSnapshot(
  limitId: string | null,
  limitName: string | null,
  rateLimit: unknown,
  planType: string | null,
  credits: unknown,
): RateLimitSnapshot | null {
  const record = asRecord(rateLimit)
  if (!record) return null

  const primary = normalizeWindow(record.primary_window)
  const secondary = normalizeWindow(record.secondary_window)
  const normalizedCredits = normalizeCredits(credits)
  if (!primary && !secondary && !normalizedCredits) return null

  return {
    limitId,
    limitName,
    primary,
    secondary,
    credits: normalizedCredits,
    planType,
  }
}

export function recoverRateLimitsFromPlanTypeDecodeError(error: unknown): unknown | null {
  const body = extractResponseBodyFromDecodeError(error)
  if (!body) return null

  const planType = readString(body.plan_type)
  const primarySnapshot = buildSnapshot('codex', null, body.rate_limit, planType, body.credits)
  if (!primarySnapshot) return null

  const rateLimitsByLimitId: Record<string, RateLimitSnapshot> = {
    codex: primarySnapshot,
  }

  const additionalRateLimits = Array.isArray(body.additional_rate_limits) ? body.additional_rate_limits : []
  for (const entry of additionalRateLimits) {
    const entryRecord = asRecord(entry)
    if (!entryRecord) continue
    const limitId = readString(entryRecord.metered_feature) ?? readString(entryRecord.limit_name)
    if (!limitId) continue
    const snapshot = buildSnapshot(
      limitId,
      readString(entryRecord.limit_name),
      entryRecord.rate_limit,
      planType,
      null,
    )
    if (snapshot) {
      rateLimitsByLimitId[limitId] = snapshot
    }
  }

  const resetCredits = asRecord(body.rate_limit_reset_credits ?? body.rateLimitResetCredits)
  return {
    rateLimits: primarySnapshot,
    rateLimitsByLimitId,
    ...(resetCredits ? { rateLimitResetCredits: resetCredits } : {}),
  }
}

export async function callRpcWithRateLimitDecodeRecovery(
  appServer: RpcExecutor,
  method: string,
  params: unknown,
): Promise<unknown> {
  try {
    return await appServer.rpc(method, params ?? null)
  } catch (error) {
    if (method === 'account/rateLimits/read') {
      const recovered = recoverRateLimitsFromPlanTypeDecodeError(error)
      if (recovered) return recovered
    }
    throw error
  }
}
