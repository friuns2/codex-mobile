import { spawnSync } from 'node:child_process'
import { basename, extname } from 'node:path'

const WINDOWS_CMD_NAMES = new Set(['codex', 'npm', 'npx'])

function quoteCmdExeArg(value: string): string {
  const normalized = value.replace(/"/g, '""')
  if (!/[\s"]/u.test(normalized)) {
    return normalized
  }
  return `"${normalized}"`
}

function needsCmdExeWrapper(command: string, platform: NodeJS.Platform): boolean {
  if (platform !== 'win32') {
    return false
  }

  const lowerCommand = command.toLowerCase()
  const baseName = basename(lowerCommand)
  if (/\.(cmd|bat)$/i.test(baseName)) {
    return true
  }

  if (extname(baseName)) {
    return false
  }

  return WINDOWS_CMD_NAMES.has(baseName)
}

export function getSpawnInvocation(
  command: string,
  args: string[] = [],
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  if (needsCmdExeWrapper(command, platform)) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', [quoteCmdExeArg(command), ...args.map((arg) => quoteCmdExeArg(arg))].join(' ')],
    }
  }

  return { command, args }
}

export function spawnSyncCommand(
  command: string,
  args: string[] = [],
  options: Parameters<typeof spawnSync>[2] = {},
) {
  const invocation = getSpawnInvocation(command, args)
  return spawnSync(invocation.command, invocation.args, options)
}
