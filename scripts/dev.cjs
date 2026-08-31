const { execFileSync, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

function isAndroidRuntime() {
  if (process.platform === 'android') return true
  if (process.env.TERMUX_VERSION) return true
  if (process.env.PREFIX?.includes('/com.termux/')) return true
  if (existsSync('/system/build.prop')) return true
  try {
    return execFileSync('uname', ['-r'], { encoding: 'utf8' }).toLowerCase().includes('android')
  } catch {
    return false
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      CODEXUI_SANDBOX_MODE: process.env.CODEXUI_SANDBOX_MODE || 'danger-full-access',
      CODEXUI_APPROVAL_POLICY: process.env.CODEXUI_APPROVAL_POLICY || 'never',
    },
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
}

const passthroughArgs = process.argv.slice(2)
let viteEntryPath = ''

function resolveViteEntry() {
  const candidate = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js')
  return existsSync(candidate) ? candidate : ''
}

viteEntryPath = resolveViteEntry()

if (isAndroidRuntime()) {
  const cliPath = join(process.cwd(), 'dist-cli', 'index.js')
  if (!existsSync(cliPath)) {
    run('pnpm', ['run', 'build:cli'])
  }
  run('node', [
    cliPath,
    '--no-open',
    '--no-tunnel',
    '--no-login',
    '--no-password',
    ...passthroughArgs,
  ])
}

if (!viteEntryPath) {
  const install = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm install'], { stdio: 'inherit', env: process.env })
    : spawnSync('pnpm', ['install'], { stdio: 'inherit', env: process.env })
  if (install.error) {
    throw install.error
  }
  if (install.status !== 0) {
    process.exit(install.status ?? 1)
  }
  viteEntryPath = resolveViteEntry()
  if (!viteEntryPath) {
    throw new Error('Vite entry point is unavailable after dependency installation')
  }
}

run(process.execPath, [viteEntryPath, ...passthroughArgs])
