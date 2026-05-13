import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callRpcWithArchiveRecovery,
  ensureDefaultFreeModeStateForMissingAuthSync,
  hasUsableCodexAuth,
  isEmptyThreadReadError,
  isThreadMaterializationPendingError,
  isUnauthenticatedRateLimitError,
} from './codexAppServerBridge'

const originalCodexHome = process.env.CODEX_HOME

afterEach(() => {
  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME
  } else {
    process.env.CODEX_HOME = originalCodexHome
  }
})

describe('callRpcWithArchiveRecovery', () => {
  it('sets a fallback name and retries archive when Codex has not materialized a rollout', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    let archiveCalls = 0
    const appServer = {
      async rpc(method: string, params: unknown): Promise<unknown> {
        calls.push({ method, params })
        if (method === 'thread/archive') {
          archiveCalls += 1
          if (archiveCalls === 1) {
            throw new Error('no rollout found for thread test-thread')
          }
          return { ok: true }
        }
        if (method === 'thread/read') {
          return {
            thread: {
              id: 'test-thread',
              preview: 'Preview title',
              path: '/home/user/.codex/sessions/rollout-test-thread.jsonl',
            },
          }
        }
        return { ok: true }
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'test-thread' })).resolves.toEqual({ ok: true })
    expect(calls).toEqual([
      { method: 'thread/archive', params: { threadId: 'test-thread' } },
      { method: 'thread/read', params: { threadId: 'test-thread', includeTurns: false } },
      { method: 'thread/name/set', params: { threadId: 'test-thread', name: 'Preview title' } },
      { method: 'thread/archive', params: { threadId: 'test-thread' } },
    ])
  })

  it('treats no-rollout archive of an already archived thread as successful', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const appServer = {
      async rpc(method: string, params: unknown): Promise<unknown> {
        calls.push({ method, params })
        if (method === 'thread/archive') {
          throw new Error('no rollout found for thread archived-thread')
        }
        if (method === 'thread/read') {
          return {
            thread: {
              id: 'archived-thread',
              path: '/home/user/.codex/archived_sessions/rollout-archived-thread.jsonl',
            },
          }
        }
        throw new Error(`unexpected method ${method}`)
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'archived-thread' })).resolves.toBeNull()
    expect(calls).toEqual([
      { method: 'thread/archive', params: { threadId: 'archived-thread' } },
      { method: 'thread/read', params: { threadId: 'archived-thread', includeTurns: false } },
    ])
  })

  it('does not recover unrelated RPC failures', async () => {
    const appServer = {
      async rpc(): Promise<unknown> {
        throw new Error('network failed')
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'thread/archive', { threadId: 'test-thread' })).rejects.toThrow('network failed')
    await expect(callRpcWithArchiveRecovery(appServer, 'thread/read', { threadId: 'test-thread' })).rejects.toThrow('network failed')
  })
})

describe('isUnauthenticatedRateLimitError', () => {
  it('matches unauthenticated rate-limit failures from a fresh Codex home', () => {
    expect(isUnauthenticatedRateLimitError(new Error('codex account authentication required to read rate limits'))).toBe(true)
  })

  it('matches direct message fields from Codex stream errors', () => {
    expect(isUnauthenticatedRateLimitError({
      message: 'codex account authentication required to read rate limits',
      codexErrorInfo: 'other',
      additionalDetails: null,
    })).toBe(true)
  })

  it('does not match unrelated authentication failures', () => {
    expect(isUnauthenticatedRateLimitError(new Error('codex account authentication required to send messages'))).toBe(false)
    expect(isUnauthenticatedRateLimitError(new Error('failed to read rate limits'))).toBe(false)
  })
})

describe('isEmptyThreadReadError', () => {
  it('matches Codex empty rollout read failures during immediate thread startup', () => {
    expect(isEmptyThreadReadError(new Error(
      'failed to read thread: thread-store internal error: failed to read thread /tmp/codex-home/sessions/rollout-test.jsonl: rollout at /tmp/codex-home/sessions/rollout-test.jsonl is empty',
    ))).toBe(true)
  })

  it('does not match unrelated thread read failures', () => {
    expect(isEmptyThreadReadError(new Error('failed to read thread: permission denied'))).toBe(false)
    expect(isEmptyThreadReadError(new Error('rollout is empty'))).toBe(false)
  })
})

describe('isThreadMaterializationPendingError', () => {
  it('matches Codex live-state reads before the first message is materialized', () => {
    expect(isThreadMaterializationPendingError(new Error(
      'thread 019e1f04-dca4-7823-8b9a-554b9bd22f57 is not materialized yet; includeTurns is unavailable before first user message',
    ))).toBe(true)
  })

  it('does not match unrelated thread read failures', () => {
    expect(isThreadMaterializationPendingError(new Error('thread read failed: permission denied'))).toBe(false)
    expect(isThreadMaterializationPendingError(new Error('not materialized yet'))).toBe(false)
  })
})

describe('hasUsableCodexAuth', () => {
  it('returns false when auth.json is missing or does not contain usable tokens', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-no-token-'))
    process.env.CODEX_HOME = codexHome
    try {
      await expect(hasUsableCodexAuth()).resolves.toBe(false)
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: {} }))
      await expect(hasUsableCodexAuth()).resolves.toBe(false)
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('returns true when auth.json contains an access token or refresh token', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-with-token-'))
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { access_token: 'access-token' } }))
      await expect(hasUsableCodexAuth()).resolves.toBe(true)
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { refresh_token: 'refresh-token' } }))
      await expect(hasUsableCodexAuth()).resolves.toBe(true)
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('warns when auth.json exists but cannot be parsed', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-invalid-auth-'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'auth.json'), '{')
      await expect(hasUsableCodexAuth()).resolves.toBe(false)
      expect(warn).toHaveBeenCalledWith(
        '[codex-auth] Unable to read Codex auth state',
        expect.objectContaining({ path: join(codexHome, 'auth.json') }),
      )
    } finally {
      warn.mockRestore()
      await rm(codexHome, { recursive: true, force: true })
    }
  })
})

describe('ensureDefaultFreeModeStateForMissingAuthSync', () => {
  it('uses OpenCode Zen as a runtime fallback without creating a state file', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-runtime-zen-'))
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)

      expect(state?.enabled).toBe(true)
      expect(state?.provider).toBe('opencode-zen')
      await expect(stat(statePath)).rejects.toThrow()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('does not synthesize OpenCode Zen after Codex auth exists and no state file is present', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-auth-no-state-'))
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { access_token: 'access-token' } }))

      expect(ensureDefaultFreeModeStateForMissingAuthSync(statePath)).toBeNull()
      await expect(stat(statePath)).rejects.toThrow()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('ignores community provider state after Codex auth appears', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-auth-community-provider-'))
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { access_token: 'access-token' } }))
      await writeFile(statePath, JSON.stringify({
        enabled: true,
        apiKey: 'community-openrouter-key',
        model: 'openrouter/free',
        customKey: false,
        provider: 'openrouter',
        wireApi: 'responses',
      }))

      expect(ensureDefaultFreeModeStateForMissingAuthSync(statePath)).toBeNull()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('keeps user configured provider state after Codex auth appears', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-auth-custom-provider-'))
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { access_token: 'access-token' } }))
      const configuredState = {
        enabled: true,
        apiKey: 'user-openrouter-key',
        model: 'openrouter/model',
        customKey: true,
        provider: 'openrouter',
        wireApi: 'responses',
      }
      await writeFile(statePath, JSON.stringify(configuredState))

      expect(ensureDefaultFreeModeStateForMissingAuthSync(statePath)).toEqual(configuredState)
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('ignores the legacy free-mode state filename instead of migrating it', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-legacy-free-mode-'))
    const legacyStatePath = join(codexHome, 'webui-free-mode.json')
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(legacyStatePath, JSON.stringify({
        enabled: true,
        apiKey: null,
        model: 'legacy-model',
        provider: 'opencode-zen',
        wireApi: 'responses',
      }))
      await writeFile(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { access_token: 'access-token' } }))

      expect(ensureDefaultFreeModeStateForMissingAuthSync(statePath)).toBeNull()
      await expect(stat(statePath)).rejects.toThrow()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })
})
