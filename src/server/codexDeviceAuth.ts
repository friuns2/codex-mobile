const ANSI_ESCAPE_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/gu
const DEVICE_AUTH_URL_PATTERN = /https:\/\/auth\.openai\.com\/codex\/device\b[^\s]*/u
const DEVICE_CODE_PATTERN = /\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/u

export type CodexDeviceAuthDetails = {
  verificationUrl: string
  userCode: string
}

export function stripTerminalFormatting(output: string): string {
  return output.replace(ANSI_ESCAPE_PATTERN, '')
}

export function extractCodexDeviceAuthDetails(output: string): CodexDeviceAuthDetails | null {
  const plainOutput = stripTerminalFormatting(output)
  const verificationUrl = plainOutput.match(DEVICE_AUTH_URL_PATTERN)?.[0] ?? null
  const userCode = plainOutput.match(DEVICE_CODE_PATTERN)?.[0] ?? null
  if (!verificationUrl || !userCode) return null
  return { verificationUrl, userCode }
}
