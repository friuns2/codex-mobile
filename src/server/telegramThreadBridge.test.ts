import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TelegramThreadBridge } from './telegramThreadBridge.js'

describe('TelegramThreadBridge', () => {
  const originalTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN
  const originalTelegramAllowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_ALLOWED_USER_IDS = '*'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restoreEnvValue('TELEGRAM_BOT_TOKEN', originalTelegramBotToken)
    restoreEnvValue('TELEGRAM_ALLOWED_USER_IDS', originalTelegramAllowedUserIds)
  })

  it('resumes an existing thread before retrying turn/start', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    let startCalls = 0
    const appServer = {
      rpc: vi.fn(async (method: string, params: unknown) => {
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
        throw new Error(`Unexpected rpc method ${method}`)
      }),
      onNotification: vi.fn(() => () => {}),
    }

    const bridge = new TelegramThreadBridge(appServer)
    vi.spyOn(bridge as never as { sendTelegramMessage: (...args: unknown[]) => Promise<void> }, 'sendTelegramMessage')
      .mockResolvedValue(undefined)
    ;(bridge as unknown as { bindChatToThread: (chatId: number, threadId: string) => void })
      .bindChatToThread(42, 'test-thread')

    await (bridge as unknown as {
      handleIncomingUpdate: (update: unknown) => Promise<void>
    }).handleIncomingUpdate({
      message: {
        text: 'hello',
        from: { id: 7 },
        chat: { id: 42 },
      },
    })

    expect(calls).toEqual([
      {
        method: 'turn/start',
        params: {
          threadId: 'test-thread',
          input: [{ type: 'text', text: 'hello' }],
        },
      },
      {
        method: 'thread/resume',
        params: { threadId: 'test-thread' },
      },
      {
        method: 'turn/start',
        params: {
          threadId: 'test-thread',
          input: [{ type: 'text', text: 'hello' }],
        },
      },
    ])
  })

  it('resumes an existing thread before binding it from the /thread command', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const appServer = {
      rpc: vi.fn(async (method: string, params: unknown) => {
        calls.push({ method, params })
        if (method === 'thread/resume') {
          return { thread: { id: 'test-thread', turns: [] } }
        }
        if (method === 'thread/read') {
          return {
            thread: {
              id: 'test-thread',
              turns: [],
            },
          }
        }
        throw new Error(`Unexpected rpc method ${method}`)
      }),
      onNotification: vi.fn(() => () => {}),
    }

    const bridge = new TelegramThreadBridge(appServer)
    const sendTelegramMessage = vi.spyOn(
      bridge as never as { sendTelegramMessage: (...args: unknown[]) => Promise<void> },
      'sendTelegramMessage',
    ).mockResolvedValue(undefined)

    await (bridge as unknown as {
      handleIncomingUpdate: (update: unknown) => Promise<void>
    }).handleIncomingUpdate({
      message: {
        text: '/thread test-thread',
        from: { id: 7 },
        chat: { id: 42 },
      },
    })

    expect(calls).toEqual([
      {
        method: 'thread/resume',
        params: { threadId: 'test-thread' },
      },
      {
        method: 'thread/read',
        params: { threadId: 'test-thread', includeTurns: true },
      },
    ])
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('Connected to existing thread'))
  })
})

function restoreEnvValue(name: string, value: string | undefined): void {
  if (typeof value === 'undefined') {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
