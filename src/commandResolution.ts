import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export type CommandInvocation = {
  command: string
  args: string[]
}

export type ResolvedCommand = {
  command: string
  source: 'environment' | 'path' | 'package'
}

export type CommandResolutionOptions = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
  canRun?: (command: string, args: string[]) => boolean
  exists?: (path: string) => boolean
  findOnPath?: (name: string) => string[]
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const unique: string[] = []
  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized || unique.includes(normalized)) continue
    unique.push(normalized)
  }
  return unique
}

function isPathLike(command: string): boolean {
  return command.includes('/') || command.includes('\\') || /^[a-zA-Z]:/.test(command)
}

function isRunnableCommand(
  command: string,
  args: string[] = [],
  canRun: (command: string, args: string[]) => boolean = canRunCommand,
  exists: (path: string) => boolean = existsSync,
): boolean {
  if (isPathLike(command) && !exists(command)) {
    return false
  }
  return canRun(command, args)
}

function getWindowsAppDataNpmPrefix(env: NodeJS.ProcessEnv = process.env): string | null {
  const appData = env.APPDATA?.trim()
  return appData ? join(appData, 'npm') : null
}

function getPotentialNpmPrefixes(): string[] {
  return uniqueStrings([
    process.env.npm_config_prefix,
    process.env.PREFIX,
    getUserNpmPrefix(),
    process.platform === 'win32' ? getWindowsAppDataNpmPrefix() : null,
  ])
}

function getPotentialNpmPrefixesFor(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homeDirectory: string,
): string[] {
  return uniqueStrings([
    env.npm_config_prefix,
    env.PREFIX,
    join(homeDirectory, '.npm-global'),
    platform === 'win32' ? getWindowsAppDataNpmPrefix(env) : null,
  ])
}

function getPotentialCodexPackageDirs(prefix: string, platform: NodeJS.Platform = process.platform): string[] {
  const dirs = [join(prefix, 'node_modules', '@openai', 'codex')]
  if (platform !== 'win32') {
    dirs.push(join(prefix, 'lib', 'node_modules', '@openai', 'codex'))
  }
  return dirs
}

function getPotentialCodexExecutables(prefix: string, platform: NodeJS.Platform = process.platform): string[] {
  return getPotentialCodexPackageDirs(prefix, platform).flatMap((packageDir) => {
    if (platform !== 'win32') return [join(packageDir, 'bin', 'codex')]
    const vendorRoot = join(
      packageDir,
      'node_modules',
      '@openai',
      'codex-win32-x64',
      'vendor',
      'x86_64-pc-windows-msvc',
    )
    return [
      join(vendorRoot, 'bin', 'codex.exe'),
      join(vendorRoot, 'codex', 'codex.exe'),
    ]
  })
}

function findCommandsOnPath(name: string, platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') return [name]
  const result = spawnSync('where.exe', [name], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) return []
  return result.stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean)
}

function getPotentialRipgrepExecutables(prefix: string): string[] {
  return getPotentialCodexPackageDirs(prefix).map((packageDir) => (
    process.platform === 'win32'
      ? join(
          packageDir,
          'node_modules',
          '@openai',
          'codex-win32-x64',
          'vendor',
          'x86_64-pc-windows-msvc',
          'path',
          'rg.exe',
        )
      : join(packageDir, 'bin', 'rg')
  ))
}

export function canRunCommand(command: string, args: string[] = []): boolean {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    windowsHide: true,
  })
  return !result.error && result.status === 0
}

export function getUserNpmPrefix(): string {
  return join(homedir(), '.npm-global')
}

export function getNpmGlobalBinDir(prefix: string): string {
  return process.platform === 'win32' ? prefix : join(prefix, 'bin')
}

export function prependPathEntry(existingPath: string, entry: string): string {
  const normalizedEntry = entry.trim()
  if (!normalizedEntry) return existingPath

  const parts = existingPath
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean)

  if (parts.includes(normalizedEntry)) {
    return existingPath
  }

  return existingPath ? `${normalizedEntry}${delimiter}${existingPath}` : normalizedEntry
}

export function resolveCodexCommand(): string | null {
  return resolveCodexCommandInfo()?.command ?? null
}

export function resolveCodexCommandInfo(options: CommandResolutionOptions = {}): ResolvedCommand | null {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const homeDirectory = options.homeDirectory ?? homedir()
  const canRun = options.canRun ?? canRunCommand
  const exists = options.exists ?? existsSync
  const findOnPath = options.findOnPath ?? ((name: string) => findCommandsOnPath(name, platform))
  const explicit = env.CODEXUI_CODEX_COMMAND?.trim()
  const pathCandidates = platform === 'win32'
    ? [...findOnPath('codex.exe'), ...findOnPath('codex.cmd')]
    : findOnPath('codex')
  const packageCandidates = getPotentialNpmPrefixesFor(env, platform, homeDirectory)
    .flatMap((prefix) => getPotentialCodexExecutables(prefix, platform))
  const candidates: ResolvedCommand[] = [
    ...(explicit ? [{ command: explicit, source: 'environment' as const }] : []),
    ...pathCandidates.map((command) => ({ command, source: 'path' as const })),
    ...packageCandidates.map((command) => ({ command, source: 'package' as const })),
  ]

  for (const candidate of candidates) {
    if (isRunnableCommand(candidate.command, ['--version'], canRun, exists)) {
      return candidate
    }
  }

  return null
}

export function resolveRipgrepCommand(): string | null {
  const explicit = process.env.CODEXUI_RG_COMMAND?.trim()
  const packageCandidates = getPotentialNpmPrefixes().flatMap(getPotentialRipgrepExecutables)
  const fallbackCandidates = process.platform === 'win32'
    ? [...packageCandidates, 'rg']
    : ['rg', ...packageCandidates]

  for (const candidate of uniqueStrings([explicit, ...fallbackCandidates])) {
    if (isRunnableCommand(candidate, ['--version'])) {
      return candidate
    }
  }

  return null
}

export function resolvePythonCommand(): CommandInvocation | null {
  const candidates: CommandInvocation[] = process.platform === 'win32'
    ? [
        { command: 'python', args: [] },
        { command: 'py', args: ['-3'] },
        { command: 'python3', args: [] },
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] },
      ]

  for (const candidate of candidates) {
    if (isRunnableCommand(candidate.command, [...candidate.args, '--version'])) {
      return candidate
    }
  }

  return null
}

export function resolveSkillInstallerScriptPath(codexHome?: string): string | null {
  const normalizedCodexHome = codexHome?.trim()
  const candidates = uniqueStrings([
    normalizedCodexHome
      ? join(normalizedCodexHome, 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py')
      : null,
    process.env.CODEX_HOME?.trim()
      ? join(process.env.CODEX_HOME.trim(), 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py')
      : null,
    join(homedir(), '.codex', 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
    join(homedir(), '.cursor', 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
  ])

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}
