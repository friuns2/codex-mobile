import { describe, expect, it } from 'vitest'
import { getSpawnInvocation } from './commandInvocation'

describe('getSpawnInvocation', () => {
  it('wraps Windows command shims with cmd.exe', () => {
    expect(getSpawnInvocation(
      'C:\\Program Files\\nodejs\\codex.cmd',
      ['app-server'],
      'win32',
    )).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', '"C:\\Program Files\\nodejs\\codex.cmd" app-server'],
    })
  })

  it('runs a command shim directly on macOS', () => {
    expect(getSpawnInvocation('/opt/homebrew/bin/codex.cmd', ['--version'], 'darwin')).toEqual({
      command: '/opt/homebrew/bin/codex.cmd',
      args: ['--version'],
    })
  })
})
