import { basename } from 'node:path'
import * as lark from '@larksuiteoapi/node-sdk'

type AppServerLike = {
  rpc: (method: string, params: unknown) => Promise<unknown>
  onNotification: (listener: (value: { method: string; params: unknown }) => void) => () => void
}

type FeishuThreadBridgeOptions = {
  onChatSeen?: (chatId: string) => void
}

export type FeishuBridgeStatus = {
  configured: boolean
  active: boolean
  mappedChats: number
  mappedThreads: number
  allowedUsers: number
  allowAllUsers: boolean
  lastError: string
}

type FeishuBotCommand = {
  command: string
  description: string
}

const FEISHU_MESSAGE_MAX_LENGTH = 3500
const FEISHU_BOT_COMMANDS: FeishuBotCommand[] = [
  { command: 'start', description: 'Show quick start and thread picker' },
  { command: 'threads', description: 'List recent threads to connect' },
  { command: 'newthread', description: 'Create and connect a new thread' },
  { command: 'thread', description: 'Connect existing thread: /thread <id>' },
  { command: 'current', description: 'Show currently connected thread' },
  { command: 'history', description: 'Show recent history for current thread' },
  { command: 'status', description: 'Show bridge and mapping status' },
  { command: 'whoami', description: 'Show your Feishu IDs' },
  { command: 'help', description: 'Show available commands' },
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }
  const record = asRecord(payload)
  if (!record) return fallback
  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error
  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) {
    return nestedError.message
  }
  return fallback
}

type NormalizedFeishuAllowlist = {
  allowAllUsers: boolean
  allowedUserIds: string[]
}

function normalizeFeishuAllowlist(values: unknown): NormalizedFeishuAllowlist {
  const rawValues = Array.isArray(values) ? values : []
  const allowAllUsers = rawValues.some((value) => typeof value === 'string' && value.trim() === '*')
  const allowedUserIds = Array.from(new Set(rawValues
    .map((value) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim()
      }
      return ''
    })
    .filter((value) => value.length > 0))).slice(0, 100)
  return { allowAllUsers, allowedUserIds }
}

function splitFeishuText(text: string, maxLength = FEISHU_MESSAGE_MAX_LENGTH): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  if (normalized.length <= maxLength) return [normalized]

  const chunks: string[] = []
  let remaining = normalized

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf('\n\n', maxLength)
    if (splitIndex < Math.floor(maxLength * 0.5)) {
      splitIndex = remaining.lastIndexOf('\n', maxLength)
    }
    if (splitIndex < Math.floor(maxLength * 0.5)) {
      splitIndex = remaining.lastIndexOf(' ', maxLength)
    }
    if (splitIndex <= 0) {
      splitIndex = maxLength
    }
    const chunk = remaining.slice(0, splitIndex).trim()
    if (chunk) chunks.push(chunk)
    remaining = remaining.slice(splitIndex).trim()
  }

  if (remaining) chunks.push(remaining)
  return chunks
}

export class FeishuThreadBridge {
  private appId: string
  private appSecret: string
  private readonly appServer: AppServerLike
  private readonly defaultCwd: string
  private allowAllUsers = false
  private allowedUserIds = new Set<string>()
  private readonly threadIdByChatId = new Map<string, string>()
  private readonly chatIdsByThreadId = new Map<string, Set<string>>()
  private readonly lastForwardedTurnByThreadId = new Map<string, string>()
  private active = false
  private lastError = ''
  private readonly onChatSeen?: (chatId: string) => void
  private client: lark.Client | null = null
  private wsClient: lark.WSClient | null = null
  private unsubscribeNotifications: (() => void) | null = null

  constructor(appServer: AppServerLike, options: FeishuThreadBridgeOptions = {}) {
    this.appServer = appServer
    this.appId = process.env.FEISHU_APP_ID?.trim() ?? ''
    this.appSecret = process.env.FEISHU_APP_SECRET?.trim() ?? ''
    this.defaultCwd = process.env.FEISHU_DEFAULT_CWD?.trim() ?? process.cwd()
    this.configureAllowedUserIds(
      (process.env.FEISHU_ALLOWED_USER_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    )
    this.onChatSeen = options.onChatSeen
  }

  start(): void {
    if (!this.appId || !this.appSecret || this.active) return
    this.active = true

    this.client = new lark.Client({
      appId: this.appId,
      appSecret: this.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    })

    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: unknown) => {
        await this.handleMessageEvent(data).catch((error) => {
          this.lastError = getErrorMessage(error, 'Failed to handle message event')
        })
      },
      'card.action.trigger': async (data: unknown) => {
        await this.handleCardAction(data).catch((error) => {
          this.lastError = getErrorMessage(error, 'Failed to handle card action')
        })
      },
    })

    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: lark.LoggerLevel.warn,
    })

    this.wsClient.start({ eventDispatcher })

    this.unsubscribeNotifications = this.appServer.onNotification((notification) => {
      void this.handleNotification(notification).catch(() => {})
    })

    void this.notifyOnlineForKnownChats().catch(() => {})
  }

  stop(): void {
    this.active = false
    this.unsubscribeNotifications?.()
    this.unsubscribeNotifications = null
    this.client = null
    this.wsClient = null
  }

  configureApp(appId: string, appSecret: string): void {
    const normalizedAppId = appId.trim()
    const normalizedAppSecret = appSecret.trim()
    if (!normalizedAppId) throw new Error('Feishu App ID is required')
    if (!normalizedAppSecret) throw new Error('Feishu App Secret is required')
    this.appId = normalizedAppId
    this.appSecret = normalizedAppSecret
  }

  getStatus(): FeishuBridgeStatus {
    return {
      configured: this.appId.length > 0 && this.appSecret.length > 0,
      active: this.active,
      mappedChats: this.threadIdByChatId.size,
      mappedThreads: this.chatIdsByThreadId.size,
      allowedUsers: this.allowedUserIds.size,
      allowAllUsers: this.allowAllUsers,
      lastError: this.lastError,
    }
  }

  configureAllowedUserIds(allowedUserIds: unknown): void {
    const normalized = normalizeFeishuAllowlist(allowedUserIds)
    this.allowAllUsers = normalized.allowAllUsers
    this.allowedUserIds = new Set(normalized.allowedUserIds)
  }

  connectThread(threadId: string, chatId: string): void {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) throw new Error('threadId is required')
    const normalizedChatId = chatId.trim()
    if (!normalizedChatId) throw new Error('chatId is required')
    if (!this.appId || !this.appSecret) throw new Error('Feishu app credentials are not configured')
    this.bindChatToThread(normalizedChatId, normalizedThreadId)
    this.markChatSeen(normalizedChatId)
    if (!this.active) this.start()
    void this.sendOnlineMessage(normalizedChatId).catch(() => {})
  }

  private markChatSeen(chatId: string): void {
    if (!chatId) return
    this.onChatSeen?.(chatId)
  }

  private async sendFeishuMessage(
    chatId: string,
    text: string,
    options: { buttons?: Array<{ text: string; value: string }> } = {},
  ): Promise<void> {
    if (!this.client) return
    const chunks = splitFeishuText(text)
    if (chunks.length === 0) return

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]
      const isLast = index === chunks.length - 1
      if (isLast && options.buttons && options.buttons.length > 0) {
        await this.sendCardMessage(chatId, chunk, options.buttons)
      } else {
        await this.sendTextMessage(chatId, chunk)
      }
    }
  }

  private async sendTextMessage(chatId: string, text: string): Promise<void> {
    if (!this.client) return
    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: JSON.stringify({
          header: {
            template: 'wathet',
            title: { content: '🤖 Codex', tag: 'plain_text' },
          },
          elements: [
            { tag: 'markdown', content: text },
          ],
        }),
        msg_type: 'interactive',
      },
    })
  }

  private async sendCardMessage(
    chatId: string,
    text: string,
    buttons: Array<{ text: string; value: string }>,
  ): Promise<void> {
    if (!this.client) return
    const elements: unknown[] = [
      { tag: 'markdown', content: text },
    ]
    if (buttons.length > 0) {
      elements.push({
        tag: 'action',
        actions: buttons.map((btn) => ({
          tag: 'button',
          text: { content: btn.text, tag: 'plain_text' },
          type: 'primary',
          value: { threadId: btn.value },
        })),
      })
    }
    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: JSON.stringify({
          header: {
            template: 'blue',
            title: { content: 'Codex Thread Bridge', tag: 'plain_text' },
          },
          elements,
        }),
        msg_type: 'interactive',
      },
    })
  }

  private async sendOnlineMessage(chatId: string): Promise<void> {
    await this.sendFeishuMessage(chatId, 'Codex thread bridge went online.')
  }

  private async notifyOnlineForKnownChats(): Promise<void> {
    const knownChatIds = Array.from(this.threadIdByChatId.keys())
    for (const chatId of knownChatIds) {
      await this.sendOnlineMessage(chatId)
    }
  }

  private async handleMessageEvent(data: unknown): Promise<void> {
    const record = asRecord(data)
    if (!record) return
    const message = asRecord(record.message)
    if (!message) return

    const chatId = typeof message.chat_id === 'string' ? message.chat_id : ''
    const sender = asRecord(record.sender)
    const senderId = typeof sender?.sender_id === 'object'
      ? (asRecord(sender.sender_id)?.open_id as string ?? '')
      : ''
    const msgType = typeof message.message_type === 'string' ? message.message_type : ''

    if (!chatId) return

    if (msgType === 'interactive') {
      return
    }

    if (msgType !== 'text') {
      await this.sendFeishuMessage(chatId, 'Only text messages are supported.')
      return
    }

    let text = ''
    try {
      const content = typeof message.content === 'string' ? JSON.parse(message.content) : {}
      text = typeof content.text === 'string' ? content.text.trim() : ''
    } catch {
      return
    }
    if (!text) return

    if (!this.isAllowedSender(senderId)) {
      await this.sendFeishuMessage(chatId, this.unauthorizedMessage(senderId))
      return
    }
    this.markChatSeen(chatId)

    const atMentionRegex = /@_user_\d+\s*/g
    text = text.replace(atMentionRegex, '').trim()

    if (text === '/start') {
      await this.sendFeishuMessage(chatId, this.helpMessage())
      await this.sendThreadPicker(chatId)
      return
    }

    if (text === '/threads') {
      await this.sendThreadPicker(chatId)
      return
    }

    if (text === '/newthread') {
      const threadId = await this.createThreadForChat(chatId)
      await this.sendFeishuMessage(chatId, `Mapped to new thread: ${threadId}`)
      return
    }

    const threadCommand = text.match(/^\/thread\s+(\S+)$/)
    if (threadCommand) {
      const threadId = threadCommand[1]
      this.bindChatToThread(chatId, threadId)
      await this.sendFeishuMessage(chatId, `Mapped to thread: ${threadId}`)
      return
    }

    if (text === '/current') {
      const threadId = this.threadIdByChatId.get(chatId)
      await this.sendFeishuMessage(chatId, threadId
        ? `Current thread: ${threadId}`
        : 'No thread is connected for this chat yet. Use /threads, /newthread, or /thread <id>.')
      return
    }

    if (text === '/history') {
      const threadId = this.threadIdByChatId.get(chatId)
      if (!threadId) {
        await this.sendFeishuMessage(chatId, 'No thread is connected for this chat yet. Use /threads or /newthread first.')
        return
      }
      await this.sendHistoryCard(chatId, threadId)
      return
    }

    if (text === '/status') {
      const status = this.getStatus()
      const mappedThreadId = this.threadIdByChatId.get(chatId) ?? 'none'
      await this.sendFeishuMessage(
        chatId,
        [
          '**Bridge status**',
          `configured: ${String(status.configured)}`,
          `active: ${String(status.active)}`,
          `mapped chats: ${String(status.mappedChats)}`,
          `mapped threads: ${String(status.mappedThreads)}`,
          `allowed users: ${String(status.allowedUsers)}`,
          `allow all users: ${String(status.allowAllUsers)}`,
          `chat ${chatId} thread: ${mappedThreadId}`,
          status.lastError ? `last error: ${status.lastError}` : '',
        ].filter(Boolean).join('\n'),
      )
      return
    }

    if (text === '/whoami') {
      const normalizedSenderId = senderId || 'unknown'
      await this.sendFeishuMessage(
        chatId,
        [
          '**Identity**',
          `feishu open_id: ${normalizedSenderId}`,
          `chat_id: ${chatId}`,
          `authorized: ${String(this.isAllowedSender(senderId))}`,
          this.allowAllUsers ? 'allowlist mode: *' : 'allowlist mode: explicit ids',
        ].join('\n'),
      )
      return
    }

    if (text === '/help') {
      await this.sendFeishuMessage(chatId, this.helpMessage())
      return
    }

    const threadId = await this.ensureThreadForChat(chatId)
    try {
      await this.appServer.rpc('turn/start', {
        threadId,
        input: [{ type: 'text', text }],
      })
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to forward message to thread')
      await this.sendFeishuMessage(chatId, `Forward failed: ${message}`)
    }
  }

  private async handleCardAction(data: unknown): Promise<void> {
    const record = asRecord(data)
    if (!record) return

    const operator = asRecord(record.operator)
    const senderId = typeof operator?.open_id === 'string' ? operator.open_id : ''
    if (!this.isAllowedSender(senderId)) return

    const action = asRecord(record.action)
    const value = asRecord(action?.value)
    const threadId = typeof value?.threadId === 'string' ? value.threadId.trim() : ''
    if (!threadId) return

    const context = asRecord(record.context)
    const chatId = typeof context?.open_chat_id === 'string' ? context.open_chat_id : ''
    if (!chatId) return

    this.bindChatToThread(chatId, threadId)
    this.markChatSeen(chatId)
    await this.sendFeishuMessage(chatId, `Connected to thread: ${threadId}`)
    await this.sendHistoryCard(chatId, threadId, 2)
  }

  private isAllowedSender(senderId: string): boolean {
    if (!senderId) return false
    if (this.allowAllUsers) return true
    return this.allowedUserIds.has(senderId)
  }

  private unauthorizedMessage(senderId: string): string {
    const normalizedSenderId = senderId || 'unknown'
    return `Unauthorized sender.\n\nYour Feishu open_id: ${normalizedSenderId}\nAdd this ID to the bot allowlist before using the bridge.`
  }

  private helpMessage(): string {
    const rows = FEISHU_BOT_COMMANDS.map((command) => `/${command.command} - ${command.description}`)
    return ['**Available commands**', ...rows].join('\n')
  }

  private async sendThreadPicker(chatId: string): Promise<void> {
    const groups = await this.listRecentThreadGroups()
    if (groups.length === 0) {
      await this.sendFeishuMessage(chatId, 'No threads found. Send /newthread to create one.')
      return
    }

    await this.sendGroupedThreadCard(chatId, groups)
  }

  private async listRecentThreadGroups(): Promise<Array<{ project: string; threads: Array<{ id: string; title: string }> }>> {
    const allRows: unknown[] = []
    let cursor: string | null = null

    do {
      const params: Record<string, unknown> = {
        archived: false,
        limit: 100,
        sortKey: 'updated_at',
        modelProviders: [],
      }
      if (cursor) params.cursor = cursor
      const payload = asRecord(await this.appServer.rpc('thread/list', params))
      const rows = Array.isArray(payload?.data) ? payload.data : []
      for (const row of rows) allRows.push(row)
      cursor = typeof payload?.nextCursor === 'string' && payload.nextCursor.length > 0
        ? payload.nextCursor
        : null
    } while (cursor)

    const groupMap = new Map<string, Array<{ id: string; title: string }>>()
    const groupOrder: string[] = []

    for (const row of allRows) {
      const record = asRecord(row)
      const id = typeof record?.id === 'string' ? record.id.trim() : ''
      if (!id) continue
      const name = typeof record?.name === 'string' ? record.name.trim() : ''
      const preview = typeof record?.preview === 'string' ? record.preview.trim() : ''
      const cwd = typeof record?.cwd === 'string' ? record.cwd.trim() : ''
      const projectName = cwd ? basename(cwd) : 'project'
      const threadTitle = (name || preview || id).replace(/\s+/g, ' ').trim()

      if (!groupMap.has(projectName)) {
        groupMap.set(projectName, [])
        groupOrder.push(projectName)
      }
      groupMap.get(projectName)!.push({ id, title: threadTitle.slice(0, 48) })
    }

    return groupOrder
      .map((project) => ({ project, threads: groupMap.get(project) ?? [] }))
      .filter((group) => group.threads.length > 0)
  }

  private async sendGroupedThreadCard(
    chatId: string,
    groups: Array<{ project: string; threads: Array<{ id: string; title: string }> }>,
  ): Promise<void> {
    if (!this.client) return
    const elements: unknown[] = []

    const MAX_THREADS_PER_GROUP = 6

    for (let gi = 0; gi < groups.length; gi += 1) {
      const group = groups[gi]
      if (gi > 0) {
        elements.push({ tag: 'hr' })
      }
      elements.push({
        tag: 'markdown',
        content: `📁 **${group.project}**`,
      })
      const visibleThreads = group.threads.slice(0, MAX_THREADS_PER_GROUP)
      for (const thread of visibleThreads) {
        elements.push({
          tag: 'action',
          actions: [{
            tag: 'button',
            text: { content: thread.title, tag: 'plain_text' },
            type: 'default',
            value: { threadId: thread.id },
          }],
        })
      }
      if (group.threads.length > MAX_THREADS_PER_GROUP) {
        elements.push({
          tag: 'markdown',
          content: `_…and ${group.threads.length - MAX_THREADS_PER_GROUP} more_`,
        })
      }
    }

    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: JSON.stringify({
          header: {
            template: 'indigo',
            title: { content: '🧵 Select a thread', tag: 'plain_text' },
          },
          elements,
        }),
        msg_type: 'interactive',
      },
    })
  }

  private async createThreadForChat(chatId: string): Promise<string> {
    const response = asRecord(await this.appServer.rpc('thread/start', { cwd: this.defaultCwd }))
    const thread = asRecord(response?.thread)
    const threadId = typeof thread?.id === 'string' ? thread.id : ''
    if (!threadId) {
      throw new Error('thread/start did not return thread id')
    }
    this.bindChatToThread(chatId, threadId)
    return threadId
  }

  private async ensureThreadForChat(chatId: string): Promise<string> {
    const existing = this.threadIdByChatId.get(chatId)
    if (existing) return existing
    return this.createThreadForChat(chatId)
  }

  private bindChatToThread(chatId: string, threadId: string): void {
    const previousThreadId = this.threadIdByChatId.get(chatId)
    if (previousThreadId && previousThreadId !== threadId) {
      const previousSet = this.chatIdsByThreadId.get(previousThreadId)
      previousSet?.delete(chatId)
      if (previousSet && previousSet.size === 0) {
        this.chatIdsByThreadId.delete(previousThreadId)
      }
    }
    this.threadIdByChatId.set(chatId, threadId)
    const chatIds = this.chatIdsByThreadId.get(threadId) ?? new Set<string>()
    chatIds.add(chatId)
    this.chatIdsByThreadId.set(threadId, chatIds)
  }

  private extractThreadId(notification: { method: string; params: unknown }): string {
    const params = asRecord(notification.params)
    if (!params) return ''
    const directThreadId = typeof params.threadId === 'string' ? params.threadId : ''
    if (directThreadId) return directThreadId
    const turn = asRecord(params.turn)
    const turnThreadId = typeof turn?.threadId === 'string' ? turn.threadId : ''
    return turnThreadId
  }

  private extractTurnId(notification: { method: string; params: unknown }): string {
    const params = asRecord(notification.params)
    if (!params) return ''
    const directTurnId = typeof params.turnId === 'string' ? params.turnId : ''
    if (directTurnId) return directTurnId
    const turn = asRecord(params.turn)
    const turnId = typeof turn?.id === 'string' ? turn.id : ''
    return turnId
  }

  private async handleNotification(notification: { method: string; params: unknown }): Promise<void> {
    if (notification.method !== 'turn/completed') return
    const threadId = this.extractThreadId(notification)
    if (!threadId) return
    const chatIds = this.chatIdsByThreadId.get(threadId)
    if (!chatIds || chatIds.size === 0) return

    const turnId = this.extractTurnId(notification)
    const lastForwardedTurnId = this.lastForwardedTurnByThreadId.get(threadId)
    if (turnId && lastForwardedTurnId === turnId) return

    const assistantReply = await this.readLatestAssistantMessage(threadId)
    if (!assistantReply) return
    const chatIdList = Array.from(chatIds)
    for (const chatId of chatIdList) {
      await this.sendFeishuMessage(chatId, assistantReply)
    }
    if (turnId) {
      this.lastForwardedTurnByThreadId.set(threadId, turnId)
    }
  }

  private async readLatestAssistantMessage(threadId: string): Promise<string> {
    const response = asRecord(await this.appServer.rpc('thread/read', { threadId, includeTurns: true }))
    const thread = asRecord(response?.thread)
    const turns = Array.isArray(thread?.turns) ? thread.turns : []

    for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
      const turn = asRecord(turns[turnIndex])
      const items = Array.isArray(turn?.items) ? turn.items : []
      for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
        const item = asRecord(items[itemIndex])
        if (item?.type === 'agentMessage') {
          const text = typeof item.text === 'string' ? item.text.trim() : ''
          if (text) return text
        }
      }
    }
    return ''
  }

  private async readThreadHistoryMessages(threadId: string): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
    const response = asRecord(await this.appServer.rpc('thread/read', { threadId, includeTurns: true }))
    const thread = asRecord(response?.thread)
    const turns = Array.isArray(thread?.turns) ? thread.turns : []
    const messages: Array<{ role: 'user' | 'assistant'; text: string }> = []

    for (const turn of turns) {
      const turnRecord = asRecord(turn)
      const items = Array.isArray(turnRecord?.items) ? turnRecord.items : []
      for (const item of items) {
        const itemRecord = asRecord(item)
        const type = typeof itemRecord?.type === 'string' ? itemRecord.type : ''
        if (type === 'userMessage') {
          const content = Array.isArray(itemRecord?.content) ? itemRecord.content : []
          for (const block of content) {
            const blockRecord = asRecord(block)
            if (blockRecord?.type === 'text' && typeof blockRecord.text === 'string' && blockRecord.text.trim()) {
              messages.push({ role: 'user', text: blockRecord.text.trim() })
            }
          }
        }
        if (type === 'agentMessage' && typeof itemRecord?.text === 'string' && itemRecord.text.trim()) {
          messages.push({ role: 'assistant', text: itemRecord.text.trim() })
        }
      }
    }

    return messages
  }

  private mergeConsecutiveMessages(messages: Array<{ role: 'user' | 'assistant'; text: string }>): Array<{ role: 'user' | 'assistant'; text: string }> {
    const merged: Array<{ role: 'user' | 'assistant'; text: string }> = []
    for (const msg of messages) {
      const last = merged[merged.length - 1]
      if (last && last.role === msg.role) {
        last.text = `${last.text}\n\n${msg.text}`
      } else {
        merged.push({ ...msg })
      }
    }
    return merged
  }

  private async sendHistoryCard(chatId: string, threadId: string, limit?: number): Promise<void> {
    if (!this.client) return
    const rawMessages = await this.readThreadHistoryMessages(threadId)
    if (rawMessages.length === 0) {
      await this.sendFeishuMessage(chatId, 'Thread has no message history yet.')
      return
    }

    const merged = this.mergeConsecutiveMessages(rawMessages)
    const messages = limit ? merged.slice(-limit) : merged

    for (const msg of messages) {
      if (msg.role === 'user') {
        await this.client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            content: JSON.stringify({
              header: {
                template: 'wathet',
                title: { content: '👤 User', tag: 'plain_text' },
              },
              elements: [{ tag: 'markdown', content: msg.text }],
            }),
            msg_type: 'interactive',
          },
        })
      } else {
        await this.client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            content: JSON.stringify({
              header: {
                template: 'grey',
                title: { content: '🤖 Assistant', tag: 'plain_text' },
              },
              elements: [{ tag: 'markdown', content: msg.text }],
            }),
            msg_type: 'interactive',
          },
        })
      }
    }
  }
}
