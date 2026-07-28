export type GoalCommand =
  | { action: 'view' }
  | { action: 'set'; objective: string }
  | { action: 'edit'; objective: string }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'clear' }

export type GoalCommandOption = {
  id: 'start' | 'view' | 'edit' | 'pause' | 'resume' | 'clear'
  insertText: string
  command: string
  label: string
  description: string
  requiresArgument: boolean
}

export const GOAL_COMMAND_OPTIONS: GoalCommandOption[] = [
  {
    id: 'start',
    insertText: '/goal ',
    command: '/goal <objective>',
    label: 'Start a goal',
    description: 'Give Codex a persistent objective and start autonomous work.',
    requiresArgument: true,
  },
  {
    id: 'view',
    insertText: '/goal',
    command: '/goal',
    label: 'View goal',
    description: 'Show the goal attached to this chat.',
    requiresArgument: false,
  },
  {
    id: 'edit',
    insertText: '/goal edit ',
    command: '/goal edit <objective>',
    label: 'Edit goal',
    description: 'Replace the current goal objective without starting another turn.',
    requiresArgument: true,
  },
  {
    id: 'pause',
    insertText: '/goal pause',
    command: '/goal pause',
    label: 'Pause goal',
    description: 'Stop autonomous continuation until you resume it.',
    requiresArgument: false,
  },
  {
    id: 'resume',
    insertText: '/goal resume',
    command: '/goal resume',
    label: 'Resume goal',
    description: 'Continue working toward a paused goal.',
    requiresArgument: false,
  },
  {
    id: 'clear',
    insertText: '/goal clear',
    command: '/goal clear',
    label: 'Clear goal',
    description: 'Remove the persistent goal from this chat.',
    requiresArgument: false,
  },
]

export function getGoalCommandSuggestions(value: string): GoalCommandOption[] {
  const input = value.trimStart()
  if (!input.startsWith('/') || input.includes('\n') || input.includes('\r')) return []

  const normalized = input.toLowerCase()
  if (normalized === '/') return GOAL_COMMAND_OPTIONS
  if (!'/goal'.startsWith(normalized) && !normalized.startsWith('/goal ')) return []

  if (!normalized.includes(' ')) {
    return GOAL_COMMAND_OPTIONS
  }

  return GOAL_COMMAND_OPTIONS.filter((option) => option.insertText.toLowerCase().startsWith(normalized))
}

export function describeGoalCommand(value: string): GoalCommandOption | null {
  const command = parseGoalCommand(value)
  if (!command) return null
  if (command.action === 'set') return GOAL_COMMAND_OPTIONS[0]
  return GOAL_COMMAND_OPTIONS.find((option) => option.id === command.action) ?? null
}

export function parseGoalCommand(value: string): GoalCommand | null {
  const match = value.trim().match(/^\/goal(?:\s+([\s\S]*))?$/iu)
  if (!match) return null

  const argument = (match[1] ?? '').trim()
  if (!argument) return { action: 'view' }

  const subcommand = argument.match(/^(edit|pause|resume|clear)(?:\s+([\s\S]*))?$/iu)
  if (!subcommand) return { action: 'set', objective: argument }

  const action = subcommand[1].toLowerCase()
  const remainder = (subcommand[2] ?? '').trim()
  if (action === 'edit') return { action: 'edit', objective: remainder }
  if (remainder) return { action: 'set', objective: argument }
  if (action === 'pause') return { action: 'pause' }
  if (action === 'resume') return { action: 'resume' }
  return { action: 'clear' }
}
