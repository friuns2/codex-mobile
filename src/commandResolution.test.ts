import { afterEach, describe, expect, it, vi } from 'vitest'

const MACOS_CODEX_APP_COMMAND = '/Applications/Codex.app/Contents/Resources/codex'

async function loadWithMocks(options: {
  platform: NodeJS.Platform
  existingPaths: string[]
  runnableCommands: string[]
  explicitCommand?: string
}) {
  vi.resetModules()
  vi.unstubAllEnvs()

  if (options.explicitCommand !== undefined) {
    vi.stubEnv('CODEXUI_CODEX_COMMAND', options.explicitCommand)
  }

  vi.doMock('node:fs', () => ({
    existsSync: (path: string) => options.existingPaths.includes(path),
  }))
  vi.doMock('node:os', () => ({
    homedir: () => '/Users/tester',
  }))
  vi.doMock('node:child_process', () => ({
    spawnSync: (command: string, args: string[] = []) => ({
      error: undefined,
      status: options.runnableCommands.includes(command) && args.includes('--version') ? 0 : 1,
    }),
  }))
  vi.stubGlobal('process', {
    ...process,
    platform: options.platform,
    env: process.env,
  })

  return import('./commandResolution')
}

describe('resolveCodexCommand', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.doUnmock('node:fs')
    vi.doUnmock('node:os')
    vi.doUnmock('node:child_process')
  })

  it('prefers the bundled Codex.app command on macOS before PATH codex', async () => {
    const { resolveCodexCommand } = await loadWithMocks({
      platform: 'darwin',
      existingPaths: [MACOS_CODEX_APP_COMMAND],
      runnableCommands: [MACOS_CODEX_APP_COMMAND, 'codex'],
    })

    expect(resolveCodexCommand()).toBe(MACOS_CODEX_APP_COMMAND)
  })

  it('keeps CODEXUI_CODEX_COMMAND as the highest-priority override', async () => {
    const { resolveCodexCommand } = await loadWithMocks({
      platform: 'darwin',
      existingPaths: ['/custom/codex', MACOS_CODEX_APP_COMMAND],
      runnableCommands: ['/custom/codex', MACOS_CODEX_APP_COMMAND, 'codex'],
      explicitCommand: '/custom/codex',
    })

    expect(resolveCodexCommand()).toBe('/custom/codex')
  })
})
