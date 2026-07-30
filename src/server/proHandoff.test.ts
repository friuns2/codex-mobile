import { describe, expect, it } from 'vitest'
import { buildChatGptProHandoff } from './proHandoff'

describe('buildChatGptProHandoff', () => {
  it('packages the goal, transcript, repository state, and repository instructions', () => {
    const markdown = buildChatGptProHandoff({
      exportedAt: '2026-07-30T10:00:00.000Z',
      threadResult: {
        thread: {
          id: 'thread-1',
          cwd: 'C:\\repo',
          preview: 'Ship the picker',
          modelProvider: 'openai',
          cliVersion: '0.145.0',
          turns: [{
            id: 'turn-1',
            status: 'completed',
            items: [
              { type: 'userMessage', content: [{ type: 'text', text: 'Please implement this.' }] },
              { type: 'agentMessage', text: 'Implemented the first part.' },
              {
                type: 'commandExecution',
                command: 'pnpm test',
                cwd: 'C:\\repo',
                status: 'completed',
                exitCode: 0,
                aggregatedOutput: '42 tests passed',
              },
              {
                type: 'fileChange',
                status: 'completed',
                changes: [{ path: 'src/App.vue' }],
              },
            ],
          }],
        },
      },
      goalResult: {
        goal: {
          objective: 'Finish the CodexApp handoff',
          status: 'active',
          tokenBudget: 20_000,
          tokensUsed: 4_000,
          timeUsedSeconds: 120,
        },
      },
      repository: {
        root: 'C:\\repo',
        branch: 'agent/pro-handoff',
        status: '## agent/pro-handoff\n M src/App.vue',
        recentCommits: 'abc123 Add goal mode',
        diffStat: 'src/App.vue | 10 +++++',
        changedFiles: 'M\tsrc/App.vue',
        diff: 'diff --git a/src/App.vue b/src/App.vue',
        diffTruncated: false,
      },
      contextFiles: [{
        path: 'C:\\repo\\AGENTS.md',
        content: 'Run focused tests.',
        truncated: false,
      }],
    })

    expect(markdown).toContain('GPT-5.6 Sol Pro')
    expect(markdown).toContain('Finish the CodexApp handoff')
    expect(markdown).toContain('Please implement this.')
    expect(markdown).toContain('42 tests passed')
    expect(markdown).toContain('src/App.vue')
    expect(markdown).toContain('Run focused tests.')
    expect(markdown).not.toContain('[object Object]')
  })

  it('does not include raw reasoning items', () => {
    const markdown = buildChatGptProHandoff({
      threadResult: {
        thread: {
          turns: [{
            items: [{
              type: 'reasoning',
              summary: ['Safe summary'],
              content: ['private chain of thought'],
            }],
          }],
        },
      },
    })

    expect(markdown).not.toContain('private chain of thought')
    expect(markdown).not.toContain('Safe summary')
  })
})
