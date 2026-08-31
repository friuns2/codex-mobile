import { describe, expect, it } from 'vitest'
import { resolveCodexCommandInfo } from './commandResolution'

describe('resolveCodexCommandInfo', () => {
  it('prefers an explicit environment command', () => {
    const result = resolveCodexCommandInfo({
      env: { CODEXUI_CODEX_COMMAND: '/custom/codex' },
      platform: 'linux',
      homeDirectory: '/home/test',
      canRun: (command) => command === '/custom/codex',
      exists: () => true,
    })

    expect(result).toEqual({ command: '/custom/codex', source: 'environment' })
  })

  it('identifies a command resolved from PATH', () => {
    const result = resolveCodexCommandInfo({
      env: {},
      platform: 'darwin',
      homeDirectory: '/Users/test',
      canRun: (command) => command === 'codex',
      exists: () => false,
    })

    expect(result).toEqual({ command: 'codex', source: 'path' })
  })

  it('falls back to the installed platform package executable', () => {
    const result = resolveCodexCommandInfo({
      env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
      platform: 'win32',
      homeDirectory: 'C:\\Users\\test',
      findOnPath: () => [],
      canRun: (command) => command.includes('@openai') && command.endsWith('codex.exe'),
      exists: () => true,
    })

    expect(result?.source).toBe('package')
    expect(result?.command).toContain('codex-win32-x64')
  })

  it('returns the concrete Windows native executable instead of a command shim', () => {
    const result = resolveCodexCommandInfo({
      env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
      platform: 'win32',
      homeDirectory: 'C:\\Users\\test',
      findOnPath: (name) => name === 'codex.exe'
        ? ['C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex\\bin\\current\\codex.exe']
        : ['D:\\nvm\\nodejs\\codex.cmd'],
      canRun: (command) => command.includes('OpenAI\\Codex') && command.endsWith('codex.exe'),
      exists: () => true,
    })

    expect(result).toEqual({
      command: 'C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex\\bin\\current\\codex.exe',
      source: 'path',
    })
  })
})
