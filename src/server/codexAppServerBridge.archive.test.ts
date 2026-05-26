import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildProjectlessFolderName,
  callRpcWithArchiveRecovery,
  canonicalizeThreadListResponseForRead,
  canonicalizeWorkspaceRootsStateForRead,
  ensureDefaultFreeModeStateForMissingAuthSync,
  hasUsableCodexAuth,
  isEmptyThreadReadError,
  isThreadMaterializationPendingError,
  isThreadNotFoundError,
  isUnauthenticatedRateLimitError,
  writeFreeModeStateFile,
  writeWorkspaceRootsState,
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

  it('resumes and retries turn/start when a restarted app-server has not materialized the thread', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    let startCalls = 0
    const appServer = {
      async rpc(method: string, params: unknown): Promise<unknown> {
        calls.push({ method, params })
        if (method === 'turn/start') {
          startCalls += 1
          if (startCalls === 1) {
            throw new Error('thread not found: test-thread')
          }
          return { turn: { id: 'turn-2' } }
        }
        if (method === 'thread/resume') {
          return { thread: { id: 'test-thread', turns: [] } }
        }
        throw new Error(`unexpected method ${method}`)
      },
    }

    await expect(callRpcWithArchiveRecovery(appServer, 'turn/start', {
      threadId: 'test-thread',
      input: [{ type: 'text', text: 'hi' }],
    })).resolves.toEqual({ turn: { id: 'turn-2' } })
    expect(calls).toEqual([
      {
        method: 'turn/start',
        params: { threadId: 'test-thread', input: [{ type: 'text', text: 'hi' }] },
      },
      { method: 'thread/resume', params: { threadId: 'test-thread' } },
      {
        method: 'turn/start',
        params: { threadId: 'test-thread', input: [{ type: 'text', text: 'hi' }] },
      },
    ])
  })
})

describe('buildProjectlessFolderName', () => {
  it('falls back to unique suffixes after the readable collision range', () => {
    expect(buildProjectlessFolderName('hi', 0, 'ignored')).toBe('hi')
    expect(buildProjectlessFolderName('hi', 1, 'ignored')).toBe('hi-2')
    expect(buildProjectlessFolderName('hi', 19, 'ignored')).toBe('hi-20')
    expect(buildProjectlessFolderName('hi', 20, 'mabc1234-deadbeef')).toBe('hi-mabc1234-deadbeef')
  })

  it('keeps long unique fallback names within the slug length limit', () => {
    const slug = 'a'.repeat(80)
    const folderName = buildProjectlessFolderName(slug, 20, 'mabc1234-deadbeef')
    expect(folderName).toHaveLength(80)
    expect(folderName).toMatch(/-mabc1234-deadbeef$/)
  })
})

describe('canonicalizeWorkspaceRootsStateForRead', () => {
  it('realpaths existing local roots so symlink cwd sessions remain visible', async () => {
    const state = await canonicalizeWorkspaceRootsStateForRead({
      order: ['/workspace-link/projects/demo', 'remote-project-id'],
      labels: {
        '/storage/projects/demo': 'Canonical Demo',
        '/workspace-link/projects/demo': 'Symlink Demo',
        'remote-project-id': 'Remote Demo',
      },
      active: ['/workspace-link/projects/demo'],
      projectOrder: ['remote-project-id', '/workspace-link/projects/demo'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:host',
        remotePath: '/remote/projects/demo',
        label: 'remote-demo',
      }],
    }, async (value) => value.replace('/workspace-link/', '/storage/'))

    expect(state.order).toEqual([
      '/storage/projects/demo',
      'remote-project-id',
    ])
    expect(state.active).toEqual(['/storage/projects/demo'])
    expect(state.projectOrder).toEqual([
      'remote-project-id',
      '/storage/projects/demo',
    ])
    expect(state.labels).toEqual({
      '/storage/projects/demo': 'Canonical Demo',
      'remote-project-id': 'Remote Demo',
    })
    expect(state.remoteProjects[0]?.id).toBe('remote-project-id')
  })
})

describe('writeWorkspaceRootsState', () => {
  it('persists workspace roots in canonical form', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-workspace-roots-'))
    const canonicalRoot = join(codexHome, 'storage', 'projects', 'demo')
    const symlinkParent = join(codexHome, 'workspace-link', 'projects')
    const symlinkRoot = join(symlinkParent, 'demo')
    process.env.CODEX_HOME = codexHome

    try {
      await mkdir(canonicalRoot, { recursive: true })
      await mkdir(symlinkParent, { recursive: true })
      await symlink(canonicalRoot, symlinkRoot)
      await writeWorkspaceRootsState({
        order: [symlinkRoot, 'remote-project-id', canonicalRoot],
        labels: {
          [canonicalRoot]: 'Canonical Demo',
          [symlinkRoot]: 'Symlink Demo',
          'remote-project-id': 'Remote Demo',
        },
        active: [symlinkRoot, canonicalRoot],
        projectOrder: ['remote-project-id', symlinkRoot, canonicalRoot],
        remoteProjects: [{
          id: 'remote-project-id',
          hostId: 'remote-ssh-discovered:host',
          remotePath: '/remote/projects/demo',
          label: 'remote-demo',
        }],
      })

      const rawState = JSON.parse(await readFile(join(codexHome, '.codex-global-state.json'), 'utf8')) as Record<string, unknown>
      expect(rawState['electron-saved-workspace-roots']).toEqual([
        canonicalRoot,
        'remote-project-id',
      ])
      expect(rawState['active-workspace-roots']).toEqual([canonicalRoot])
      expect(rawState['project-order']).toEqual([
        'remote-project-id',
        canonicalRoot,
      ])
      expect(rawState['electron-workspace-root-labels']).toEqual({
        [canonicalRoot]: 'Canonical Demo',
        'remote-project-id': 'Remote Demo',
      })
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })
})

describe('canonicalizeThreadListResponseForRead', () => {
  it('realpaths thread cwd values to match canonicalized workspace roots', async () => {
    const payload = await canonicalizeThreadListResponseForRead({
      data: [
        { id: 'symlink-cwd-thread', cwd: '/workspace-link/projects/demo' },
        { id: 'canonical-cwd-thread', cwd: '/storage/projects/demo' },
        { id: 'remote-thread', cwd: 'remote-project-id' },
      ],
      nextCursor: null,
    }, async (value) => value.replace('/workspace-link/', '/storage/'))

    expect(payload).toEqual({
      data: [
        { id: 'symlink-cwd-thread', cwd: '/storage/projects/demo' },
        { id: 'canonical-cwd-thread', cwd: '/storage/projects/demo' },
        { id: 'remote-thread', cwd: 'remote-project-id' },
      ],
      nextCursor: null,
    })
  })

  it('reuses cwd realpath results within one thread list response', async () => {
    const calls: string[] = []
    const payload = await canonicalizeThreadListResponseForRead({
      data: [
        { id: 'first-symlink-thread', cwd: '/workspace-link/projects/demo' },
        { id: 'second-symlink-thread', cwd: '/workspace-link/projects/demo' },
        { id: 'canonical-cwd-thread', cwd: '/storage/projects/demo' },
        { id: 'remote-thread', cwd: 'remote-project-id' },
      ],
      nextCursor: null,
    }, async (value) => {
      calls.push(value)
      return value.replace('/workspace-link/', '/storage/')
    })

    expect(payload).toEqual({
      data: [
        { id: 'first-symlink-thread', cwd: '/storage/projects/demo' },
        { id: 'second-symlink-thread', cwd: '/storage/projects/demo' },
        { id: 'canonical-cwd-thread', cwd: '/storage/projects/demo' },
        { id: 'remote-thread', cwd: 'remote-project-id' },
      ],
      nextCursor: null,
    })
    expect(calls).toEqual([
      '/workspace-link/projects/demo',
      '/storage/projects/demo',
    ])
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

describe('isThreadNotFoundError', () => {
  it('matches app-server thread lookup failures after restart', () => {
    expect(isThreadNotFoundError(new Error('thread not found: 019e2180-6ad7'))).toBe(true)
    expect(isThreadNotFoundError(new Error('no rollout found for thread id 019e2180-6ad7'))).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(isThreadNotFoundError(new Error('network failed'))).toBe(false)
    expect(isThreadNotFoundError(new Error('thread read failed: permission denied'))).toBe(false)
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
  it('creates CODEX_HOME before writing free-mode state', async () => {
    const codexHome = join(tmpdir(), `codex-home-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const statePath = join(codexHome, 'webui-custom-providers.json')
    try {
      await writeFreeModeStateFile(statePath, {
        enabled: true,
        apiKey: 'community-key',
        model: 'openrouter/free',
        customKey: false,
        provider: 'openrouter',
        wireApi: 'responses',
      })

      const info = await stat(statePath)
      expect(info.isFile()).toBe(true)
      expect(info.mode & 0o777).toBe(0o600)
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

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

  it('does not synthesize OpenCode Zen when config.toml explicitly selects a model provider', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-config-provider-'))
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'config.toml'), [
        'model = "gpt-5.5"',
        'model_provider = "azure"',
        '',
        '[model_providers.azure]',
        'base_url = "https://example.openai.azure.com/openai/v1"',
        'wire_api = "responses"',
      ].join('\n'))

      expect(ensureDefaultFreeModeStateForMissingAuthSync(statePath)).toBeNull()
      await expect(stat(statePath)).rejects.toThrow()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('detects quoted top-level model_provider keys in config.toml', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-quoted-config-provider-'))
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'config.toml'), [
        '"model_provider" = "azure"',
        '',
        '[model_providers.azure]',
        'base_url = "https://example.openai.azure.com/openai/v1"',
        'wire_api = "responses"',
      ].join('\n'))

      expect(ensureDefaultFreeModeStateForMissingAuthSync(statePath)).toBeNull()
      await expect(stat(statePath)).rejects.toThrow()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('ignores commented and nested model_provider keys when deciding the runtime fallback', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-nested-provider-config-'))
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'config.toml'), [
        '# model_provider = "azure"',
        '',
        '[profiles.work]',
        'model_provider = "azure"',
      ].join('\n'))

      const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)

      expect(state?.enabled).toBe(true)
      expect(state?.provider).toBe('opencode-zen')
      await expect(stat(statePath)).rejects.toThrow()
    } finally {
      await rm(codexHome, { recursive: true, force: true })
    }
  })

  it('ignores model_provider text inside multiline TOML strings', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-home-multiline-provider-config-'))
    const statePath = join(codexHome, 'webui-custom-providers.json')
    process.env.CODEX_HOME = codexHome
    try {
      await writeFile(join(codexHome, 'config.toml'), [
        'banner = """',
        'model_provider = "azure"',
        '"""',
      ].join('\n'))

      const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)

      expect(state?.enabled).toBe(true)
      expect(state?.provider).toBe('opencode-zen')
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
