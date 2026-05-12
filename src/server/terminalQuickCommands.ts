import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export type TerminalQuickCommand = {
  label: string
  value: string
  source: 'package' | 'script' | 'make'
}

export async function listTerminalQuickCommands(cwd: string): Promise<TerminalQuickCommand[]> {
  const normalizedCwd = isAbsolute(cwd) ? cwd : resolve(cwd)
  const info = await stat(normalizedCwd)
  if (!info.isDirectory()) {
    throw new Error('Terminal cwd is not a directory')
  }

  const commands: TerminalQuickCommand[] = []
  const seen = new Set<string>()
  const addCommand = (command: TerminalQuickCommand) => {
    if (!command.value || seen.has(command.value)) return
    seen.add(command.value)
    commands.push(command)
  }

  await addPackageJsonCommands(normalizedCwd, addCommand)
  await addMakefileCommands(normalizedCwd, addCommand)
  await addRootScriptCommands(normalizedCwd, addCommand)
  await addScriptsDirectoryCommands(normalizedCwd, addCommand)
  return commands
}

async function addPackageJsonCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const record = asRecord(parsed)
    const scripts = asRecord(record?.scripts)
    if (!scripts) return
    const packageManager = resolvePackageManager(cwd)
    for (const scriptName of Object.keys(scripts)) {
      if (typeof scripts[scriptName] !== 'string') continue
      const value = formatPackageScriptCommand(packageManager, scriptName)
      addCommand({
        label: value,
        value,
        source: 'package',
      })
    }
  } catch {
    // A project without package.json simply has no package quick commands.
  }
}

async function addMakefileCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  const makefilePath = existsSync(join(cwd, 'Makefile'))
    ? join(cwd, 'Makefile')
    : existsSync(join(cwd, 'makefile'))
      ? join(cwd, 'makefile')
      : ''
  if (!makefilePath) return

  try {
    const raw = await readFile(makefilePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_.@%/+~-][A-Za-z0-9_.@%/+~-]*)\s*:(?![=])/.exec(line)
      if (!match) continue
      const target = match[1]
      if (!target || target.startsWith('.')) continue
      const value = `make ${quoteShellTokenIfNeeded(target)}`
      addCommand({
        label: value,
        value,
        source: 'make',
      })
    }
  } catch {
    // Ignore unreadable Makefiles for quick-command discovery.
  }
}

async function addRootScriptCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  await addScriptFileCommands(cwd, '.', addCommand)
}

async function addScriptsDirectoryCommands(
  cwd: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  await addScriptFileCommands(join(cwd, 'scripts'), './scripts', addCommand)
}

async function addScriptFileCommands(
  directory: string,
  commandPrefix: string,
  addCommand: (command: TerminalQuickCommand) => void,
): Promise<void> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.sh') && !entry.name.endsWith('.cmd')) continue
      const value = `${commandPrefix}/${quoteShellTokenIfNeeded(entry.name)}`
      addCommand({
        label: value,
        value,
        source: 'script',
      })
    }
  } catch {
    // A project without script files simply has no script-file quick commands.
  }
}

function resolvePackageManager(cwd: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  return 'npm'
}

function formatPackageScriptCommand(packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun', scriptName: string): string {
  const quoted = quoteShellTokenIfNeeded(scriptName)
  if (packageManager === 'npm') return `npm run ${quoted}`
  if (packageManager === 'pnpm') return `pnpm run ${quoted}`
  if (packageManager === 'bun') return `bun run ${quoted}`
  return `yarn ${quoted}`
}

function quoteShellTokenIfNeeded(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}
