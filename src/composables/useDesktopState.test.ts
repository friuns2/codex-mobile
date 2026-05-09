import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildWorkspaceRootsProjectOrderState,
  collectWorkspaceRootPathsForProjectRemoval,
  filterGroupsByWorkspaceRoots,
  findAdjacentThreadId,
  removeThreadFromGroups,
  isThreadUnreadByLastRead,
  useDesktopState,
} from './useDesktopState'
import type { UiProjectGroup } from '../types/codex'
import type { WorkspaceRootsState } from '../api/codexGateway'

const gatewayMocks = vi.hoisted(() => ({
  archiveThread: vi.fn(),
  forkThread: vi.fn(),
  getAccountRateLimits: vi.fn(),
  getAvailableCollaborationModes: vi.fn(),
  getAvailableModelIds: vi.fn(),
  getCurrentModelConfig: vi.fn(),
  getPendingServerRequests: vi.fn(),
  getSkillsList: vi.fn(),
  getThreadDetail: vi.fn(),
  getThreadGroupsPage: vi.fn(),
  getThreadQueueState: vi.fn(),
  getThreadTitleCache: vi.fn(),
  getWorkspaceRootsState: vi.fn(),
  generateThreadTitle: vi.fn(),
  interruptThreadTurn: vi.fn(),
  persistThreadTitle: vi.fn(),
  renameThread: vi.fn(),
  replyToServerRequest: vi.fn(),
  resumeThread: vi.fn(),
  revertThreadFileChanges: vi.fn(),
  rollbackThread: vi.fn(),
  setCodexSpeedMode: vi.fn(),
  setThreadQueueState: vi.fn(),
  setWorkspaceRootsState: vi.fn(),
  startThread: vi.fn(),
  startThreadTurn: vi.fn(),
  subscribeCodexNotifications: vi.fn(),
}))

vi.mock('../api/codexGateway', () => ({
  ...gatewayMocks,
  getBackgroundThreadListLimit: vi.fn(() => 100),
  pickCodexRateLimitSnapshot: vi.fn(() => null),
}))

function thread(id: string, cwd: string, options: { hasWorktree?: boolean } = {}) {
  return {
    id,
    title: id,
    projectName: cwd ? cwd.split('/').at(-1) || cwd : 'Projectless',
    cwd,
    hasWorktree: options.hasWorktree ?? false,
    createdAtIso: '2026-04-28T00:00:00.000Z',
    updatedAtIso: '2026-04-28T00:00:00.000Z',
    preview: '',
    unread: false,
    inProgress: false,
  }
}

function installTestWindow(initialStorage: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialStorage))
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
    },
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  gatewayMocks.getThreadQueueState.mockResolvedValue({})
  gatewayMocks.getThreadTitleCache.mockResolvedValue({ titles: {} })
  gatewayMocks.getWorkspaceRootsState.mockRejectedValue(new Error('no workspace roots state'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('filterGroupsByWorkspaceRoots', () => {
  it('keeps projectless chats visible when workspace roots are configured', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'Projectless',
        threads: [thread('projectless-chat', '')],
      },
      {
        projectName: 'allowed-project',
        threads: [thread('allowed-chat', '/tmp/allowed-project')],
      },
      {
        projectName: 'other-project',
        threads: [thread('other-chat', '/tmp/other-project')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/allowed-project'],
      labels: {},
      active: ['/tmp/allowed-project'],
      projectOrder: [],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      'Projectless',
      'allowed-project',
    ])
  })

  it('keeps workspace roots with the same folder name as separate projects', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'api',
        threads: [
          thread('first-api-chat', '/tmp/first/api'),
          thread('second-api-chat', '/tmp/second/api'),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/first/api', '/tmp/second/api'],
      labels: {},
      active: ['/tmp/first/api', '/tmp/second/api'],
      projectOrder: [],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      '/tmp/first/api',
      '/tmp/second/api',
    ])
  })

  it('uses Codex project-order when workspace roots are hydrated', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('alpha-chat', '/tmp/alpha')],
      },
      {
        projectName: 'beta',
        threads: [thread('beta-chat', '/tmp/beta')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/alpha', '/tmp/beta'],
      labels: {},
      active: ['/tmp/alpha'],
      projectOrder: ['/tmp/beta', '/tmp/alpha'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      'beta',
      'alpha',
    ])
  })

  it('keeps empty duplicate workspace roots visible in Codex project order', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'TestChat',
        threads: [thread('testchat-chat', '/Users/igor/temp/TestChat')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
      labels: {},
      active: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
      projectOrder: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.length])).toEqual([
      ['/Users/igor/Documents/New project 2/TestChat', 0],
      ['/Users/igor/temp/TestChat', 1],
    ])
  })

  it('keeps remote projects from Codex project order visible as empty project rows', () => {
    const groups: UiProjectGroup[] = []
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/local-project'],
      labels: {},
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:a1',
        remotePath: '/home/ubuntu',
        label: 'ubuntu',
      }],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.length])).toEqual([
      ['remote-project-id', 0],
      ['local-project', 0],
    ])
  })

  it('keeps managed worktree threads under the matching workspace root project', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Git-projects/codex-web-local'],
      labels: {},
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['codex-web-local', ['main-chat', 'worktree-chat']],
    ])
  })

  it('keeps unregistered managed worktrees under the main root when another managed worktree root is registered', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('registered-worktree-chat', '/Users/igor/.codex/worktrees/a77f/codex-web-local', { hasWorktree: true }),
          thread('unregistered-worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: [
        '/Users/igor/Git-projects/codex-web-local',
        '/Users/igor/.codex/worktrees/a77f/codex-web-local',
      ],
      labels: {
        '/Users/igor/.codex/worktrees/a77f/codex-web-local': 'codex-web-local2',
      },
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat', 'unregistered-worktree-chat']],
      ['/Users/igor/.codex/worktrees/a77f/codex-web-local', ['registered-worktree-chat']],
    ])
  })

  it('does not group unrelated git worktrees under a same-leaf workspace root project', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('other-git-worktree-chat', '/tmp/other/.git/worktrees/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Git-projects/codex-web-local'],
      labels: {},
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat']],
    ])
  })
})

describe('removeThreadFromGroups', () => {
  it('removes an archived thread and drops the now-empty project group', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
      {
        projectName: 'archived-project',
        threads: [thread('archive-me', '/tmp/archived-project')],
      },
      {
        projectName: 'beta',
        threads: [thread('keep-beta', '/tmp/beta')],
      },
      {
        projectName: 'empty-workspace-root',
        threads: [],
      },
    ]

    expect(removeThreadFromGroups(groups, 'archive-me').map((group) => [
      group.projectName,
      group.threads.map((row) => row.id),
    ])).toEqual([
      ['alpha', ['keep-alpha']],
      ['beta', ['keep-beta']],
      ['empty-workspace-root', []],
    ])
  })

  it('preserves referential identity when the thread is absent', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
    ]

    expect(removeThreadFromGroups(groups, 'missing-thread')).toBe(groups)
  })
})

describe('workspace roots project persistence helpers', () => {
  it('collects duplicate-path project roots by full path when removing a project', () => {
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/first/api', '/tmp/second/api'],
      labels: {
        '/tmp/first/api': 'First API',
        '/tmp/second/api': 'Second API',
      },
      active: ['/tmp/first/api'],
      projectOrder: ['/tmp/first/api', '/tmp/second/api'],
    }

    expect([...collectWorkspaceRootPathsForProjectRemoval(rootsState, '/tmp/first/api')]).toEqual([
      '/tmp/first/api',
    ])
  })

  it('preserves remote project ids in explicit project order when persisting workspace roots', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'local-project',
        threads: [thread('local-chat', '/tmp/local-project')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/local-project'],
      labels: {},
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:a1',
        remotePath: '/home/ubuntu',
        label: 'ubuntu',
      }],
    }

    expect(buildWorkspaceRootsProjectOrderState(rootsState, ['remote-project-id', 'local-project'], groups)).toEqual({
      order: ['/tmp/local-project'],
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
    })
  })
})

describe('thread unread state helpers', () => {
  const cutoffIso = '2026-05-01T12:00:00.000Z'

  it('uses the initialization cutoff when a thread has no read state', () => {
    expect(isThreadUnreadByLastRead('2026-05-01T11:59:59.000Z', undefined, cutoffIso)).toBe(false)
    expect(isThreadUnreadByLastRead('2026-05-01T12:00:01.000Z', undefined, cutoffIso)).toBe(true)
  })

  it('uses per-thread read state instead of the global cutoff after a thread is read', () => {
    expect(isThreadUnreadByLastRead(
      '2026-05-01T12:30:00.000Z',
      '2026-05-01T12:45:00.000Z',
      cutoffIso,
    )).toBe(false)
    expect(isThreadUnreadByLastRead(
      '2026-05-01T12:50:00.000Z',
      '2026-05-01T12:45:00.000Z',
      cutoffIso,
    )).toBe(true)
  })
})

describe('collaboration mode selection', () => {
  it('does not carry plan mode from new chats into existing threads', () => {
    installTestWindow({
      'codex-web-local.collaboration-mode.v1': 'plan',
    })

    const state = useDesktopState()

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.setSelectedCollaborationMode('plan')

    expect(state.selectedCollaborationMode.value).toBe('plan')
    expect(window.localStorage.getItem('codex-web-local.collaboration-mode-by-context.v1')).toBe(null)

    state.primeSelectedThread('thread-a')

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.setSelectedCollaborationMode('plan')
    state.primeSelectedThread('thread-b')

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.primeSelectedThread('thread-a')

    expect(state.selectedCollaborationMode.value).toBe('plan')
  })
})

describe('model selection', () => {
  it('does not request provider model lists while Codex is the active provider', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-a', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: 'openai',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(gatewayMocks.getAvailableModelIds).toHaveBeenCalledWith({ includeProviderModels: false })
    expect(state.availableModelIds.value).toEqual(['gpt-5.5'])
  })

  it('uses the Codex provider namespace when the backend reports openai', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::codex': 'gpt-5.5',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-a', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: 'openai',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.selectedModelId.value).toBe('gpt-5.5')
    expect(state.readModelIdForThread('thread-a')).toBe('gpt-5.5')
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'codex-web-local.selected-model-by-context.v1',
      expect.stringContaining('__thread-provider__::codex::thread-a'),
    )
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(
      'codex-web-local.selected-model-by-context.v1',
      expect.stringContaining('__new-thread-provider__::openai'),
    )
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(
      'codex-web-local.selected-model-by-context.v1',
      expect.stringContaining('__thread-provider__::openai::thread-a'),
    )
  })

  it('stores existing-thread models per provider', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-a', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: 'openai',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.readModelIdForThread('thread-a')).toBe('gpt-5.5')

    gatewayMocks.getAvailableModelIds.mockResolvedValue(['big-pickle', 'zen-model'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })

    await state.refreshAll({
      includeSelectedThreadMessages: false,
      awaitAncillaryRefreshes: true,
      providerChanged: true,
    })

    expect(state.readModelIdForThread('thread-a')).toBe('big-pickle')

    state.setSelectedModelIdForThread('thread-a', 'zen-model')

    expect(state.readModelIdForThread('thread-a')).toBe('zen-model')

    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: 'openai',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })

    await state.refreshAll({
      includeSelectedThreadMessages: false,
      awaitAncillaryRefreshes: true,
      providerChanged: true,
    })

    expect(state.readModelIdForThread('thread-a')).toBe('gpt-5.5')
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'codex-web-local.selected-model-by-context.v1',
      expect.stringContaining('__thread-provider__::opencode-zen::thread-a'),
    )
  })

  it('does not fall back to a legacy thread model for a non-Codex provider on reload', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        'thread-a': 'gpt-5.5',
        '__new-thread-provider__::opencode-zen': 'big-pickle',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-a', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5', 'big-pickle'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.readModelIdForThread('thread-a')).toBe('big-pickle')
  })

  it('shows the active provider default when selecting a thread without a provider-scoped model', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        'thread-a': 'gpt-5.5',
        'thread-b': 'gpt-5.4',
        '__new-thread-provider__::opencode-zen': 'big-pickle',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [
            thread('thread-a', '/tmp/project'),
            thread('thread-b', '/tmp/project'),
          ],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['big-pickle', 'zen-model'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    state.primeSelectedThread('thread-b')

    expect(state.selectedModelId.value).toBe('big-pickle')
    expect(state.readModelIdForThread('thread-b')).toBe('')
  })

  it('does not save a resumed thread model under the active provider while switching chats', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::openrouter': 'openrouter/free',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [
            thread('thread-a', '/tmp/project'),
            thread('thread-b', '/tmp/project'),
          ],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['openrouter/free'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'openrouter/free',
      providerId: 'openrouter',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'big-pickle',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-1')

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    state.primeSelectedThread('thread-b')
    await state.ensureThreadMessagesLoaded('thread-b')

    expect(state.selectedModelId.value).toBe('openrouter/free')
    expect(state.readModelIdForThread('thread-b')).toBe('')
    expect(state.availableModelIds.value).toEqual(['openrouter/free'])
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(
      'codex-web-local.selected-model-by-context.v1',
      expect.stringContaining('__thread-provider__::openrouter::thread-b'),
    )

    await state.sendMessageToSelectedThread('hi')

    expect(gatewayMocks.startThreadTurn).toHaveBeenCalledWith(
      'thread-b',
      'hi',
      [],
      'openrouter/free',
      'high',
      undefined,
      [],
      'default',
    )
  })

  it('uses a resumed thread model when it belongs to the active provider list', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::openrouter': 'openrouter/free',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [
            thread('thread-a', '/tmp/project'),
            thread('thread-b', '/tmp/project'),
          ],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['openrouter/free', 'openrouter/other'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'openrouter/free',
      providerId: 'openrouter',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'openrouter/other',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-1')

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    state.primeSelectedThread('thread-b')
    await state.ensureThreadMessagesLoaded('thread-b')

    expect(state.selectedModelId.value).toBe('openrouter/other')
    expect(state.readModelIdForThread('thread-b')).toBe('openrouter/other')
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'codex-web-local.selected-model-by-context.v1',
      expect.stringContaining('__thread-provider__::openrouter::thread-b'),
    )

    await state.sendMessageToSelectedThread('hi')

    expect(gatewayMocks.startThreadTurn).toHaveBeenCalledWith(
      'thread-b',
      'hi',
      [],
      'openrouter/other',
      'high',
      undefined,
      [],
      'default',
    )
  })

  it('loads provider models before resuming selected thread on startup', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::openrouter': 'openrouter/free',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-a', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['openrouter/free', 'openrouter/other'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'openrouter/free',
      providerId: 'openrouter',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.resumeThread.mockImplementation(async () => {
      expect(state.availableModelIds.value).toEqual(['openrouter/free', 'openrouter/other'])
      return {
        model: 'openrouter/other',
        messages: [],
        inProgress: false,
        activeTurnId: '',
        turnIndexByTurnId: {},
      }
    })

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: true })

    expect(state.readModelIdForThread('thread-a')).toBe('openrouter/other')
    expect(state.selectedModelId.value).toBe('openrouter/other')
  })

  it('accepts gpt-prefixed model ids saved under a custom provider thread key', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        'thread-a': 'gpt-5.5',
        '__new-thread-provider__::custom-endpoint': 'gpt-custom-default',
        '__thread-provider__::custom-endpoint::thread-b': 'gpt-custom-thread',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [
            thread('thread-a', '/tmp/project'),
            thread('thread-b', '/tmp/project'),
          ],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-custom-default', 'gpt-custom-thread'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-custom-default',
      providerId: 'custom-endpoint',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    state.primeSelectedThread('thread-b')

    expect(state.selectedModelId.value).toBe('gpt-custom-thread')
    expect(state.readModelIdForThread('thread-b')).toBe('gpt-custom-thread')

    state.setSelectedModelIdForThread('thread-b', 'gpt-custom-default')

    expect(state.selectedModelId.value).toBe('gpt-custom-default')
    expect(state.readModelIdForThread('thread-b')).toBe('gpt-custom-default')
  })

  it('resumes the selected thread again after switching providers before sending', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-a', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: 'openai',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'gpt-5.5',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-1')

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    await state.ensureThreadMessagesLoaded('thread-a')

    expect(gatewayMocks.resumeThread).toHaveBeenCalledTimes(1)

    gatewayMocks.getAvailableModelIds.mockResolvedValue(['big-pickle'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })

    await state.refreshAll({
      includeSelectedThreadMessages: false,
      awaitAncillaryRefreshes: true,
      providerChanged: true,
    })

    gatewayMocks.resumeThread.mockClear()
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'big-pickle',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
    })
    gatewayMocks.startThreadTurn.mockClear()

    await state.sendMessageToSelectedThread('hi')

    expect(gatewayMocks.resumeThread).toHaveBeenCalledWith('thread-a')
    expect(gatewayMocks.startThreadTurn).toHaveBeenCalledWith(
      'thread-a',
      'hi',
      [],
      'big-pickle',
      'high',
      undefined,
      [],
      'default',
    )
    expect(gatewayMocks.resumeThread.mock.invocationCallOrder[0]).toBeLessThan(
      gatewayMocks.startThreadTurn.mock.invocationCallOrder[0],
    )
  })

  it('reloads selected thread messages after switching providers even when previously loaded', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-a', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['gpt-5.5'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: 'openai',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'gpt-5.5',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: true, awaitAncillaryRefreshes: true })
    expect(gatewayMocks.resumeThread).toHaveBeenCalledTimes(1)

    gatewayMocks.resumeThread.mockClear()
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['big-pickle'])

    await state.refreshAll({
      includeSelectedThreadMessages: false,
      awaitAncillaryRefreshes: true,
      providerChanged: true,
    })
    await state.ensureThreadMessagesLoaded('thread-a')

    expect(gatewayMocks.resumeThread).toHaveBeenCalledWith('thread-a')
  })

  it('previews provider-scoped model selection before provider refresh completes', async () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__thread-provider__::codex::thread-a': 'gpt-5.3-codex-spark',
        '__thread-provider__::opencode-zen::thread-a': 'big-pickle',
        '__new-thread-provider__::opencode-zen': 'big-pickle',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [
        {
          projectName: 'project',
          threads: [thread('thread-a', '/tmp/project')],
        },
      ],
      nextCursor: null,
    })
    gatewayMocks.getAvailableModelIds.mockResolvedValue(['big-pickle', 'zen-model'])
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'high',
      speedMode: 'standard',
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue([])
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([])
    gatewayMocks.getSkillsList.mockResolvedValue([])

    const state = useDesktopState()

    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.selectedModelId.value).toBe('big-pickle')
    expect(state.availableModelIds.value).toEqual(['big-pickle', 'zen-model'])

    state.previewProviderModelSelection('codex')

    expect(state.selectedModelId.value).toBe('gpt-5.3-codex-spark')
    expect(state.availableModelIds.value).toEqual(['gpt-5.3-codex-spark'])
  })
})

describe('findAdjacentThreadId', () => {
  it('selects the next thread after the archived thread', () => {
    const threads = [
      thread('first-thread', '/tmp/project'),
      thread('selected-thread', '/tmp/project'),
      thread('next-thread', '/tmp/project'),
    ]

    expect(findAdjacentThreadId(threads, 'selected-thread')).toBe('next-thread')
  })

  it('falls back to the previous thread when the last thread is archived', () => {
    const threads = [
      thread('previous-thread', '/tmp/project'),
      thread('selected-thread', '/tmp/project'),
    ]

    expect(findAdjacentThreadId(threads, 'selected-thread')).toBe('previous-thread')
  })

  it('returns no fallback when there is no adjacent thread', () => {
    expect(findAdjacentThreadId([thread('selected-thread', '/tmp/project')], 'selected-thread')).toBe('')
  })
})
