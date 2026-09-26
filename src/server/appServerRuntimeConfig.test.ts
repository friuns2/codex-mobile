import { describe, expect, it } from 'vitest'
import { buildAppServerArgs, resolveAppServerRuntimeConfig } from './appServerRuntimeConfig'

describe('app-server runtime config', () => {
  it('enables Codex memories by default for spawned app-server processes', () => {
    const args = buildAppServerArgs()
    const featureIndex = args.indexOf('features.memories=true')

    expect(featureIndex).toBeGreaterThan(0)
    expect(args[featureIndex - 1]).toBe('-c')
  })

  it('can disable Codex memories through runtime configuration', () => {
    process.env.CODEXUI_MEMORIES = 'false'
    try {
      const args = buildAppServerArgs()
      const featureIndex = args.indexOf('features.memories=false')

      expect(featureIndex).toBeGreaterThan(0)
      expect(args[featureIndex - 1]).toBe('-c')
      expect(args).not.toContain('features.memories=true')
    } finally {
      delete process.env.CODEXUI_MEMORIES
    }
  })

  it('uses a spawned app-server by default', () => {
    const config = resolveAppServerRuntimeConfig()

    expect(config.transportMode).toBe('spawn')
    expect(config.socketPath).toMatch(/app-server-control[\\/]app-server-control\.sock$/)
  })

  it('resolves an explicitly configured shared app-server socket', () => {
    process.env.CODEXUI_APP_SERVER_MODE = 'shared'
    process.env.CODEXUI_APP_SERVER_SOCKET = '/tmp/codex-shared.sock'
    try {
      const config = resolveAppServerRuntimeConfig()

      expect(config.transportMode).toBe('shared')
      expect(config.socketPath).toBe('/tmp/codex-shared.sock')
    } finally {
      delete process.env.CODEXUI_APP_SERVER_MODE
      delete process.env.CODEXUI_APP_SERVER_SOCKET
    }
  })
})
