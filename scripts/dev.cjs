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

function extractBasePath(args) {
  let basePath = ''
  const passthrough = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--base-path') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --base-path')
      }
      basePath = value
      index += 1
      continue
    }
    if (arg.startsWith('--base-path=')) {
      basePath = arg.slice('--base-path='.length)
      if (!basePath) throw new Error('Missing value for --base-path')
      continue
    }
    passthrough.push(arg)
  }
  return { basePath, passthrough }
}

const passthroughArgs = process.argv.slice(2)
const viteBinPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
const vueTscBinPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vue-tsc.cmd' : 'vue-tsc')

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

if (!existsSync(viteBinPath) || !existsSync(vueTscBinPath)) {
  const install = spawnSync('pnpm', ['install'], { stdio: 'inherit', env: process.env })
  if (install.error) {
    throw install.error
  }
  if (install.status !== 0) {
    process.exit(install.status ?? 1)
  }
}

const { basePath, passthrough } = extractBasePath(passthroughArgs)
run(viteBinPath, passthrough, {
  env: {
    ...process.env,
    VITE_CODEXUI_BASE_PATH: basePath,
  },
})
