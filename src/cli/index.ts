import { createServer } from 'node:http'
import { chmodSync, createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { homedir, networkInterfaces } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { get as httpsGet } from 'node:https'
import { Command } from 'commander'
import qrcode from 'qrcode-terminal'
import {
  canRunCommand,
  getNpmGlobalBinDir,
  getUserNpmPrefix,
  prependPathEntry,
  resolveCodexCommand,
} from '../commandResolution.js'
import {
  parseApprovalPolicy,
  parseSandboxMode,
  resolveAppServerRuntimeConfig,
} from '../server/appServerRuntimeConfig.js'
import { createServer as createApp } from '../server/httpServer.js'
import { generatePassword } from '../server/password.js'
import { spawnSyncCommand } from '../utils/commandInvocation.js'

const program = new Command().name('codexui').description('Web interface for Codex app-server')
const __dirname = dirname(fileURLToPath(import.meta.url))
let hasPromptedCloudflaredInstall = false

function getCodexHomePath(): string {
  return process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
}

function getCloudflaredPromptMarkerPath(): string {
  return join(getCodexHomePath(), '.cloudflared-install-prompted')
}

function hasPromptedCloudflaredInstallPersisted(): boolean {
  return existsSync(getCloudflaredPromptMarkerPath())
}

async function persistCloudflaredInstallPrompted(): Promise<void> {
  const codexHome = getCodexHomePath()
  mkdirSync(codexHome, { recursive: true })
  await writeFile(getCloudflaredPromptMarkerPath(), `${Date.now()}\n`, 'utf8')
}

async function readCliVersion(): Promise<string> {
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json')
    const raw = await readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

function isTermuxRuntime(): boolean {
  return Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes('/com.termux/'))
}

function runOrFail(command: string, args: string[], label: string): void {
  const result = spawnSyncCommand(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${String(result.status ?? -1)}`)
  }
}

function runWithStatus(command: string, args: string[]): number {
  const result = spawnSyncCommand(command, args, { stdio: 'inherit' })
  return result.status ?? -1
}

function resolveCloudflaredCommand(): string | null {
  if (canRunCommand('cloudflared', ['--version'])) {
    return 'cloudflared'
  }
  const localCandidate = join(homedir(), '.local', 'bin', 'cloudflared')
  if (existsSync(localCandidate) && canRunCommand(localCandidate, ['--version'])) {
    return localCandidate
  }
  return null
}

function mapCloudflaredLinuxArch(arch: NodeJS.Architecture): string | null {
  if (arch === 'x64') {
    return 'amd64'
  }
  if (arch === 'arm64') {
    return 'arm64'
  }
  return null
}

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (currentUrl: string) => {
      httpsGet(currentUrl, (response) => {
        const code = response.statusCode ?? 0
        if (code >= 300 && code < 400 && response.headers.location) {
          response.resume()
          request(response.headers.location)
          return
        }
        if (code !== 200) {
          response.resume()
          reject(new Error(`Download failed with HTTP status ${String(code)}`))
          return
        }
        const file = createWriteStream(destination, { mode: 0o755 })
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
        file.on('error', reject)
      }).on('error', reject)
    }

    request(url)
  })
}

async function ensureCloudflaredInstalledLinux(): Promise<string | null> {
  const current = resolveCloudflaredCommand()
  if (current) {
    return current
  }
  if (process.platform !== 'linux') {
    return null
  }

  const mappedArch = mapCloudflaredLinuxArch(process.arch)
  if (!mappedArch) {
    throw new Error(`cloudflared auto-install is not supported for Linux architecture: ${process.arch}`)
  }

  const userBinDir = join(homedir(), '.local', 'bin')
  mkdirSync(userBinDir, { recursive: true })
  const destination = join(userBinDir, 'cloudflared')
  const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${mappedArch}`

  console.log('\ncloudflared not found. Installing to ~/.local/bin...\n')
  await downloadFile(downloadUrl, destination)
  chmodSync(destination, 0o755)
  process.env.PATH = prependPathEntry(process.env.PATH ?? '', userBinDir)

  const installed = resolveCloudflaredCommand()
  if (!installed) {
    throw new Error('cloudflared download completed but executable is still not available')
  }
  console.log('\ncloudflared installed.\n')
  return installed
}

async function shouldInstallCloudflaredInteractively(): Promise<boolean> {
  if (hasPromptedCloudflaredInstall || hasPromptedCloudflaredInstallPersisted()) {
    return false
  }
  hasPromptedCloudflaredInstall = true
  await persistCloudflaredInstallPrompted()

  if (process.platform === 'win32') {
    return false
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.warn('\n[cloudflared] cloudflared is missing and terminal is non-interactive, skipping install.')
    return false
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await prompt.question('cloudflared is not installed. Install it now to ~/.local/bin? [y/N] ')
    const normalized = answer.trim().toLowerCase()
    return normalized === 'y' || normalized === 'yes'
  } finally {
    prompt.close()
  }
}

async function resolveCloudflaredForTunnel(): Promise<string | null> {
  const current = resolveCloudflaredCommand()
  if (current) {
    return current
  }

  if (process.platform === 'win32') {
    return null
  }

  const installApproved = await shouldInstallCloudflaredInteractively()
  if (!installApproved) {
    return null
  }

  return ensureCloudflaredInstalledLinux()
}

function hasCodexAuth(): boolean {
  const codexHome = getCodexHomePath()
  return existsSync(join(codexHome, 'auth.json'))
}

function ensureCodexInstalled(): string | null {
  let codexCommand = resolveCodexCommand()
  if (!codexCommand) {
    const installWithFallback = (pkg: string, label: string): void => {
      const status = runWithStatus('npm', ['install', '-g', pkg])
      if (status === 0) {
        return
      }
      if (isTermuxRuntime()) {
        throw new Error(`${label} failed with exit code ${String(status)}`)
      }
      const userPrefix = getUserNpmPrefix()
      console.log(`\nGlobal npm install requires elevated permissions. Retrying with --prefix ${userPrefix}...\n`)
      runOrFail('npm', ['install', '-g', '--prefix', userPrefix, pkg], `${label} (user prefix)`)
      process.env.PATH = prependPathEntry(process.env.PATH ?? '', getNpmGlobalBinDir(userPrefix))
    }

    if (isTermuxRuntime()) {
      console.log('\nCodex CLI not found. Installing Termux-compatible Codex CLI from npm...\n')
      installWithFallback('@mmmbuto/codex-cli-termux', 'Codex CLI install')
      codexCommand = resolveCodexCommand()
      if (!codexCommand) {
        console.log('\nTermux npm package did not expose `codex`. Installing official CLI fallback...\n')
        installWithFallback('@openai/codex', 'Codex CLI fallback install')
      }
    } else {
      console.log('\nCodex CLI not found. Installing official Codex CLI from npm...\n')
      installWithFallback('@openai/codex', 'Codex CLI install')
    }

    codexCommand = resolveCodexCommand()
    if (!codexCommand && !isTermuxRuntime()) {
      // Non-Termux path should resolve after official package install.
      throw new Error('Official Codex CLI install completed but binary is still not available in PATH')
    }
    if (!codexCommand && isTermuxRuntime()) {
      codexCommand = resolveCodexCommand()
    }
    if (!codexCommand) {
      throw new Error('Codex CLI install completed but binary is still not available in PATH')
    }
    console.log('\nCodex CLI installed.\n')
  }
  return codexCommand
}

type PasswordResolution = {
  password: string | undefined
  generated: boolean
}

function resolvePassword(input: string | boolean): PasswordResolution {
  if (input === false) {
    return { password: undefined, generated: false }
  }
  if (typeof input === 'string') {
    return { password: input, generated: false }
  }
  return { password: generatePassword(), generated: true }
}

function getGeneratedPasswordPath(): string {
  return join(getCodexHomePath(), 'codexui-password')
}

async function persistGeneratedPassword(password: string): Promise<string> {
  const codexHome = getCodexHomePath()
  mkdirSync(codexHome, { recursive: true })
  const passwordPath = getGeneratedPasswordPath()
  await writeFile(passwordPath, `${password}\n`, { encoding: 'utf8', mode: 0o600 })
  chmodSync(passwordPath, 0o600)
  return passwordPath
}

function printTermuxKeepAlive(lines: string[]): void {
  if (!isTermuxRuntime()) {
    return
  }
  lines.push('')
  lines.push('  Android/Termux keep-alive:')
  lines.push('  1) Keep this Termux session open (do not swipe it away).')
  lines.push('  2) Disable battery optimization for Termux in Android settings.')
  lines.push('  3) Optional: run `termux-wake-lock` in another shell.')
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin'
    ? { cmd: 'open', args: [url] }
    : process.platform === 'win32'
      ? { cmd: 'cmd', args: ['/c', 'start', '', url] }
      : { cmd: 'xdg-open', args: [url] }

  const child = spawn(command.cmd, command.args, { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}

function buildTunnelAutologinUrl(tunnelUrl: string, _password: string | undefined): string {
  return tunnelUrl
}

function parseCloudflaredUrl(chunk: string): string | null {
  const urlMatch = chunk.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g)
  if (!urlMatch || urlMatch.length === 0) {
    return null
  }
  return urlMatch[urlMatch.length - 1] ?? null
}

function getAccessibleUrls(port: number): string[] {
  const urls = new Set<string>([`http://localhost:${String(port)}`])
  try {
    const interfaces = networkInterfaces()
    for (const entries of Object.values(interfaces)) {
      if (!entries) {
        continue
      }
      for (const entry of entries) {
        if (entry.internal) {
          continue
        }
        if (entry.family === 'IPv4') {
          urls.add(`http://${entry.address}:${String(port)}`)
        }
      }
    }
  } catch {}
  return Array.from(urls)
}

function isTailscaleIPv4Address(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((part) => Number.parseInt(part, 10))
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) return false
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
}

function isTailscaleIPv6Address(address: string): boolean {
  const normalized = address.toLowerCase()
  return normalized.startsWith('fd7a:115c:a1e0:')
}

function hasDetectedTailscaleIp(): boolean {
  try {
    const interfaces = networkInterfaces()
    for (const entries of Object.values(interfaces)) {
      if (!entries) continue
      for (const entry of entries) {
        if (entry.internal) continue
        if (entry.family === 'IPv4' && isTailscaleIPv4Address(entry.address)) return true
        if (entry.family === 'IPv6' && isTailscaleIPv6Address(entry.address)) return true
      }
    }
  } catch {}
  return false
}

async function startCloudflaredTunnel(command: string, localPort: number): Promise<{
  process: ReturnType<typeof spawn>
  url: string
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['tunnel', '--url', `http://localhost:${String(localPort)}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Timed out waiting for cloudflared tunnel URL'))
    }, 20000)

    const handleData = (value: Buffer | string) => {
      const text = String(value)
      const parsedUrl = parseCloudflaredUrl(text)
      if (!parsedUrl) {
        return
      }
      clearTimeout(timeout)
      child.stdout?.off('data', handleData)
      child.stderr?.off('data', handleData)
      resolve({ process: child, url: parsedUrl })
    }

    const onError = (error: Error) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to start cloudflared: ${error.message}`))
    }

    child.once('error', onError)
    child.stdout?.on('data', handleData)
    child.stderr?.on('data', handleData)

    child.once('exit', (code) => {
      if (code === 0) {
        return
      }
      clearTimeout(timeout)
      reject(new Error(`cloudflared exited before providing a URL (code ${String(code)})`))
    })
  })
}

function listenWithFallback(server: ReturnType<typeof createServer>, startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const attempt = (port: number) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('listening', onListening)
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
          attempt(port + 1)
          return
        }
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve(port)
      }

      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '0.0.0.0')
    }

    attempt(startPort)
  })
}

function getCodexGlobalStatePath(): string {
  const codexHome = getCodexHomePath()
  return join(codexHome, '.codex-global-state.json')
}

function normalizeUniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const next: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || next.includes(trimmed)) continue
    next.push(trimmed)
  }
  return next
}

async function persistLaunchProject(projectPath: string): Promise<void> {
  const trimmed = projectPath.trim()
  if (!trimmed) return
  const normalizedPath = isAbsolute(trimmed) ? trimmed : resolve(trimmed)
  const directoryInfo = await stat(normalizedPath)
  if (!directoryInfo.isDirectory()) {
    throw new Error(`Not a directory: ${normalizedPath}`)
  }

  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>
    }
  } catch {
    payload = {}
  }

  const roots = normalizeUniqueStrings(payload['electron-saved-workspace-roots'])
  const activeRoots = normalizeUniqueStrings(payload['active-workspace-roots'])
  payload['electron-saved-workspace-roots'] = [
    normalizedPath,
    ...roots.filter((value) => value !== normalizedPath),
  ]
  payload['active-workspace-roots'] = [
    normalizedPath,
    ...activeRoots.filter((value) => value !== normalizedPath),
  ]
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

async function addProjectOnly(projectPath: string): Promise<void> {
  const trimmed = projectPath.trim()
  if (!trimmed) {
    throw new Error('Missing project path')
  }
  await persistLaunchProject(trimmed)
}

async function startServer(options: {
  port: string
  password: string | boolean
  tunnel: boolean
  open: boolean
  login: boolean
  sandboxMode?: string
  approvalPolicy?: string
  projectPath?: string
}) {
  const version = await readCliVersion()
  const projectPath = options.projectPath?.trim() ?? ''
  if (projectPath.length > 0) {
    try {
      await persistLaunchProject(projectPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`\n[project] Could not open launch project: ${message}\n`)
    }
  }
  const codexCommand = ensureCodexInstalled() ?? resolveCodexCommand()
  if (codexCommand) {
    process.env.CODEXUI_CODEX_COMMAND = codexCommand
  }
  if (options.sandboxMode) {
    process.env.CODEXUI_SANDBOX_MODE = options.sandboxMode
  }
  if (options.approvalPolicy) {
    process.env.CODEXUI_APPROVAL_POLICY = options.approvalPolicy
  }
  const runtimeConfig = resolveAppServerRuntimeConfig()
  if (options.login && !hasCodexAuth()) {
    console.log('\nCodex is not logged in. You can log in later via settings or run `codexui login`.\n')
  }
  const requestedPort = parseInt(options.port, 10)
  const passwordResolution = resolvePassword(options.password)
  const password = passwordResolution.password
  const generatedPasswordPath = password && passwordResolution.generated
    ? await persistGeneratedPassword(password)
    : null
  const { app, dispose, attachWebSocket, startBridgeBackgroundServices } = createApp({
    password,
    deferBridgeBackgroundServices: true,
  })
  const server = createServer(app)
  attachWebSocket(server)
  const port = await listenWithFallback(server, requestedPort)
  process.env.CODEXUI_SERVER_PORT = String(port)
  startBridgeBackgroundServices()
  let tunnelChild: ReturnType<typeof spawn> | null = null
  let tunnelUrl: string | null = null

  if (options.tunnel) {
    try {
      const cloudflaredCommand = await resolveCloudflaredForTunnel()
      if (!cloudflaredCommand) {
        throw new Error('cloudflared is not installed')
      }
      const tunnel = await startCloudflaredTunnel(cloudflaredCommand, port)
      tunnelChild = tunnel.process
      tunnelUrl = tunnel.url
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`\n[cloudflared] Tunnel not started: ${message}`)
    }
  }

  const lines = [
    '',
    'Codex Web Local is running!',
    `  Version:  ${version}`,
    '  GitHub:   https://github.com/friuns2/codexui',
    '',
    `  Bind:     http://0.0.0.0:${String(port)}`,
    `  Codex sandbox: ${runtimeConfig.sandboxMode}`,
    `  Approval policy: ${runtimeConfig.approvalPolicy}`,
  ]
  const accessUrls = getAccessibleUrls(port)
  if (accessUrls.length > 0) {
    lines.push(`  Local:    ${accessUrls[0]}`)
    for (const accessUrl of accessUrls.slice(1)) {
      lines.push(`  Network:  ${accessUrl}`)
    }
  }

  if (port !== requestedPort) {
    lines.push(`  Requested port ${String(requestedPort)} was unavailable; using ${String(port)}.`)
  }

  if (generatedPasswordPath) {
    lines.push(`  Generated password file: ${generatedPasswordPath}`)
    lines.push('  Use that file to retrieve the password for untrusted origins.')
  }

  const tunnelQrUrl = tunnelUrl ? buildTunnelAutologinUrl(tunnelUrl, password) : null
  if (tunnelUrl) {
    lines.push(`  Tunnel:   ${tunnelQrUrl ?? tunnelUrl}`)
    lines.push('  Tunnel QR code below')
  }

  printTermuxKeepAlive(lines)
  lines.push('')
  console.log(lines.join('\n'))
  if (tunnelQrUrl) {
    qrcode.generate(tunnelQrUrl, { small: true })
    console.log('')
  }
  if (options.open) openBrowser(`http://localhost:${String(port)}`)

  function shutdown() {
    console.log('\nShutting down...')
    if (tunnelChild && !tunnelChild.killed) {
      tunnelChild.kill('SIGTERM')
    }
    server.close(() => {
      dispose()
      process.exit(0)
    })
    // Force exit after timeout
    setTimeout(() => {
      dispose()
      process.exit(1)
    }, 5000).unref()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

async function runLogin() {
  const codexCommand = ensureCodexInstalled() ?? 'codex'
  process.env.CODEXUI_CODEX_COMMAND = codexCommand
  console.log('\nStarting `codex login`...\n')
  runOrFail(codexCommand, ['login'], 'Codex login')
}

program
  .argument('[projectPath]', 'project directory to open on launch')
  .option('--open-project <path>', 'open project directory on launch (Codex desktop parity)')
  .option('-p, --port <port>', 'port to listen on', '5900')
  .option('--password <pass>', 'set a specific password')
  .option('--no-password', 'disable password protection')
  .option('--tunnel', 'start cloudflared tunnel (default is auto by Tailscale detection)', true)
  .option('--no-tunnel', 'disable cloudflared tunnel startup')
  .option('--open', 'open browser on startup', true)
  .option('--no-open', 'do not open browser on startup')
  .option('--login', 'run automatic Codex login bootstrap', true)
  .option('--no-login', 'skip automatic Codex login bootstrap')
  .option('--sandbox-mode <mode>', 'Codex sandbox mode: read-only, workspace-write, danger-full-access')
  .option('--approval-policy <policy>', 'Codex approval policy: untrusted, on-failure, on-request, never')
  .action(async (
    projectPath: string | undefined,
    opts: {
      port: string
      password: string | boolean
      tunnel: boolean
      open: boolean
      login: boolean
      sandboxMode?: string
      approvalPolicy?: string
      openProject?: string
    },
  ) => {
    const rawArgv = process.argv.slice(2)
    const openProjectFlagIndex = rawArgv.findIndex((arg) => arg === '--open-project' || arg.startsWith('--open-project='))
    const tunnelFlagExplicit = rawArgv.some((arg) => (
      arg === '--tunnel'
      || arg === '--no-tunnel'
      || arg.startsWith('--tunnel=')
      || arg.startsWith('--no-tunnel=')
    ))
    const effectiveTunnel = tunnelFlagExplicit ? opts.tunnel : hasDetectedTailscaleIp()

    let openProjectOnly = (opts.openProject ?? '').trim()
    if (!openProjectOnly && openProjectFlagIndex >= 0 && projectPath?.trim()) {
      // Commander may map "--open-project ." to the positional arg in this command layout.
      openProjectOnly = projectPath.trim()
    }
    if (openProjectOnly.length > 0) {
      await addProjectOnly(openProjectOnly)
      console.log(`Added project: ${openProjectOnly}`)
      return
    }

    const launchProject = (projectPath ?? '').trim()
    if (opts.sandboxMode) {
      const parsedSandboxMode = parseSandboxMode(opts.sandboxMode)
      if (!parsedSandboxMode) {
        throw new Error(`Invalid sandbox mode: ${opts.sandboxMode}`)
      }
      opts.sandboxMode = parsedSandboxMode
    }
    if (opts.approvalPolicy) {
      const parsedApprovalPolicy = parseApprovalPolicy(opts.approvalPolicy)
      if (!parsedApprovalPolicy) {
        throw new Error(`Invalid approval policy: ${opts.approvalPolicy}`)
      }
      opts.approvalPolicy = parsedApprovalPolicy
    }
    await startServer({ ...opts, tunnel: effectiveTunnel, projectPath: launchProject })
  })

program.command('login').description('Install/check Codex CLI and run `codex login`').action(runLogin)

program.command('help').description('Show codexui command help').action(() => {
  program.outputHelp()
})

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nFailed to run codexui: ${message}`)
  process.exit(1)
})
