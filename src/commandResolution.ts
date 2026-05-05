import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const MACOS_CODEX_APP_COMMAND = '/Applications/Codex.app/Contents/Resources/codex'

export type CommandInvocation = {
  command: string
  args: string[]
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

function isRunnableCommand(command: string, args: string[] = []): boolean {
  if (isPathLike(command) && !existsSync(command)) {
    return false
  }
  return canRunCommand(command, args)
}

function getWindowsAppDataNpmPrefix(): string | null {
  const appData = process.env.APPDATA?.trim()
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

function getPotentialCodexPackageDirs(prefix: string): string[] {
  const dirs = [join(prefix, 'node_modules', '@openai', 'codex')]
  if (process.platform !== 'win32') {
    dirs.push(join(prefix, 'lib', 'node_modules', '@openai', 'codex'))
  }
  return dirs
}

function getPotentialCodexExecutables(prefix: string): string[] {
  return getPotentialCodexPackageDirs(prefix).map((packageDir) => (
    process.platform === 'win32'
      ? join(
          packageDir,
          'node_modules',
          '@openai',
          'codex-win32-x64',
          'vendor',
          'x86_64-pc-windows-msvc',
          'codex',
          'codex.exe',
        )
      : join(packageDir, 'bin', 'codex')
  ))
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
  const explicit = process.env.CODEXUI_CODEX_COMMAND?.trim()
  const packageCandidates = getPotentialNpmPrefixes().flatMap(getPotentialCodexExecutables)
  const appBundleCandidates = process.platform === 'darwin' ? [MACOS_CODEX_APP_COMMAND] : []
  const fallbackCandidates = process.platform === 'win32'
    ? [...packageCandidates, 'codex']
    : [...appBundleCandidates, 'codex', ...packageCandidates]

  for (const candidate of uniqueStrings([explicit, ...fallbackCandidates])) {
    if (isRunnableCommand(candidate, ['--version'])) {
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
