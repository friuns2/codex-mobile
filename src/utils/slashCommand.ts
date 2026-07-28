import {
  GOAL_COMMAND_OPTIONS,
  parseGoalCommand,
  type GoalCommand,
  type GoalCommandOption,
} from './goalCommand'

export type CodexSlashCommand =
  | { action: 'plan'; prompt: string }
  | { action: 'compact' }
  | { action: 'review' }
  | { action: 'model'; model: string }
  | { action: 'rename'; name: string }
  | { action: 'fork' }
  | { action: 'archive' }

export type ParsedSlashCommand =
  | { kind: 'goal'; command: GoalCommand }
  | { kind: 'codex'; command: CodexSlashCommand }

export type SlashCommandOption = GoalCommandOption | {
  id: 'plan' | 'compact' | 'review' | 'model' | 'rename' | 'fork' | 'archive'
  insertText: string
  command: string
  label: string
  description: string
  requiresArgument: boolean
}

export const CODEX_COMMAND_OPTIONS: SlashCommandOption[] = [
  {
    id: 'plan',
    insertText: '/plan ',
    command: '/plan [prompt]',
    label: 'Plan mode',
    description: 'Switch this chat to Plan mode, optionally starting with a prompt.',
    requiresArgument: false,
  },
  {
    id: 'review',
    insertText: '/review',
    command: '/review',
    label: 'Review changes',
    description: 'Ask the Codex reviewer to inspect uncommitted changes.',
    requiresArgument: false,
  },
  {
    id: 'compact',
    insertText: '/compact',
    command: '/compact',
    label: 'Compact chat',
    description: 'Summarize this chat to free space in the context window.',
    requiresArgument: false,
  },
  {
    id: 'model',
    insertText: '/model ',
    command: '/model <model>',
    label: 'Choose model',
    description: 'Set the model used by later turns in this chat.',
    requiresArgument: true,
  },
  {
    id: 'rename',
    insertText: '/rename ',
    command: '/rename <name>',
    label: 'Rename chat',
    description: 'Give the current chat a recognizable name.',
    requiresArgument: true,
  },
  {
    id: 'fork',
    insertText: '/fork',
    command: '/fork',
    label: 'Fork chat',
    description: 'Branch this chat into a new conversation.',
    requiresArgument: false,
  },
  {
    id: 'archive',
    insertText: '/archive',
    command: '/archive',
    label: 'Archive chat',
    description: 'Move this chat out of the active chat list.',
    requiresArgument: false,
  },
]

export const SLASH_COMMAND_OPTIONS: SlashCommandOption[] = [
  ...GOAL_COMMAND_OPTIONS,
  ...CODEX_COMMAND_OPTIONS,
]

export function getSlashCommandSuggestions(value: string): SlashCommandOption[] {
  const input = value.trimStart()
  if (!input.startsWith('/') || input.includes('\n') || input.includes('\r')) return []

  const normalized = input.toLowerCase()
  if (normalized === '/') return SLASH_COMMAND_OPTIONS

  return SLASH_COMMAND_OPTIONS.filter((option) => option.insertText.toLowerCase().startsWith(normalized))
}

export function describeSlashCommand(value: string): SlashCommandOption | null {
  const parsed = parseSlashCommand(value)
  if (!parsed) return null

  if (parsed.kind === 'goal') {
    if (parsed.command.action === 'set') return GOAL_COMMAND_OPTIONS[0]
    return GOAL_COMMAND_OPTIONS.find((option) => option.id === parsed.command.action) ?? null
  }

  return CODEX_COMMAND_OPTIONS.find((option) => option.id === parsed.command.action) ?? null
}

export function parseSlashCommand(value: string): ParsedSlashCommand | null {
  const goalCommand = parseGoalCommand(value)
  if (goalCommand) return { kind: 'goal', command: goalCommand }

  const match = value.trim().match(/^\/(plan|compact|review|model|rename|fork|archive)(?:\s+([\s\S]*))?$/iu)
  if (!match) return null

  const action = match[1].toLowerCase()
  const argument = (match[2] ?? '').trim()
  if (action === 'plan') return { kind: 'codex', command: { action: 'plan', prompt: argument } }
  if (action === 'model') return { kind: 'codex', command: { action: 'model', model: argument } }
  if (action === 'rename') return { kind: 'codex', command: { action: 'rename', name: argument } }
  if (action === 'compact') return { kind: 'codex', command: { action: 'compact' } }
  if (action === 'review') return { kind: 'codex', command: { action: 'review' } }
  if (action === 'fork') return { kind: 'codex', command: { action: 'fork' } }
  return { kind: 'codex', command: { action: 'archive' } }
}
