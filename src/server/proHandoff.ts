type UnknownRecord = Record<string, unknown>

export type ProHandoffRepositorySnapshot = {
  root: string
  branch: string
  status: string
  recentCommits: string
  diffStat: string
  changedFiles: string
  diff: string
  diffTruncated: boolean
}

export type ProHandoffContextFile = {
  path: string
  content: string
  truncated: boolean
}

export type BuildProHandoffInput = {
  threadResult: unknown
  goalResult?: unknown
  repository?: ProHandoffRepositorySnapshot | null
  contextFiles?: ProHandoffContextFile[]
  exportedAt?: string
}

const TRANSCRIPT_CHARACTER_LIMIT = 360_000
const ITEM_OUTPUT_CHARACTER_LIMIT = 12_000

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function appendBounded(target: string[], value: string, state: { characters: number; truncated: boolean }): void {
  if (!value || state.truncated) return
  const remaining = TRANSCRIPT_CHARACTER_LIMIT - state.characters
  if (remaining <= 0) {
    state.truncated = true
    return
  }
  if (value.length > remaining) {
    target.push(`${value.slice(0, remaining)}\n\n_[Transcript truncated at ${TRANSCRIPT_CHARACTER_LIMIT.toLocaleString()} characters.]_`)
    state.characters += remaining
    state.truncated = true
    return
  }
  target.push(value)
  state.characters += value.length
}

function fencedText(value: string, limit = ITEM_OUTPUT_CHARACTER_LIMIT): string {
  const normalized = value.trim()
  if (!normalized) return ''
  const clipped = normalized.length > limit
    ? `${normalized.slice(0, limit)}\n… [output truncated]`
    : normalized
  return `\`\`\`text\n${clipped.split('```').join('``\\`')}\n\`\`\``
}

function formatUserMessage(item: UnknownRecord): string {
  const content = Array.isArray(item.content) ? item.content : []
  const blocks: string[] = []
  for (const entry of content) {
    const input = asRecord(entry)
    if (!input) continue
    const type = readString(input.type)
    if (type === 'text') {
      const text = readString(input.text)
      if (text) blocks.push(text)
    } else if (type === 'image') {
      blocks.push(`[Attached image: ${readString(input.url) || 'inline image'}]`)
    } else if (type === 'localImage') {
      blocks.push(`[Attached local image: ${readString(input.path)}]`)
    } else if (type === 'skill') {
      blocks.push(`[Selected skill: ${readString(input.name)} (${readString(input.path)})]`)
    } else if (type === 'mention') {
      blocks.push(`[Mentioned file: ${readString(input.name)} (${readString(input.path)})]`)
    }
  }
  return blocks.join('\n\n')
}

function formatThreadItem(value: unknown): string {
  const item = asRecord(value)
  if (!item) return ''
  const type = readString(item.type)
  if (type === 'userMessage') {
    const body = formatUserMessage(item)
    return body ? `### User\n\n${body}` : ''
  }
  if (type === 'agentMessage') {
    const text = readString(item.text)
    return text ? `### Assistant\n\n${text}` : ''
  }
  if (type === 'plan') {
    const text = readString(item.text)
    return text ? `### Assistant plan\n\n${text}` : ''
  }
  if (type === 'commandExecution') {
    const command = readString(item.command)
    const cwd = readString(item.cwd)
    const status = readString(item.status)
    const exitCode = typeof item.exitCode === 'number' ? String(item.exitCode) : ''
    const metadata = [
      command ? `Command: \`${command.split('`').join('\\`')}\`` : '',
      cwd ? `CWD: \`${cwd.split('`').join('\\`')}\`` : '',
      status ? `Status: ${status}` : '',
      exitCode ? `Exit code: ${exitCode}` : '',
    ].filter(Boolean).join('\n')
    const output = fencedText(typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '')
    return `### Tool · command\n\n${metadata}${output ? `\n\n${output}` : ''}`
  }
  if (type === 'fileChange') {
    const changes = Array.isArray(item.changes) ? item.changes : []
    const paths = changes
      .map((change) => readString(asRecord(change)?.path))
      .filter(Boolean)
      .map((path) => `- ${path}`)
    return paths.length > 0
      ? `### Tool · file changes (${readString(item.status) || 'unknown'})\n\n${paths.join('\n')}`
      : ''
  }
  if (type === 'mcpToolCall') {
    const server = readString(item.server)
    const tool = readString(item.tool)
    const status = readString(item.status)
    return `### Tool · ${[server, tool].filter(Boolean).join('/') || 'MCP'}\n\nStatus: ${status || 'unknown'}`
  }
  if (type === 'webSearch') {
    const query = readString(item.query)
    return query ? `### Tool · web search\n\nQuery: ${query}` : ''
  }
  if (type === 'imageView') {
    const path = readString(item.path)
    return path ? `### Tool · image viewed\n\n${path}` : ''
  }
  if (type === 'contextCompaction') {
    return '### Context event\n\nCodex compacted the conversation context at this point.'
  }
  return ''
}

function buildTranscript(thread: UnknownRecord): string {
  const turns = Array.isArray(thread.turns) ? thread.turns : []
  const lines: string[] = []
  const state = { characters: 0, truncated: false }
  for (let index = 0; index < turns.length && !state.truncated; index += 1) {
    const turn = asRecord(turns[index])
    if (!turn) continue
    const turnId = readString(turn.id)
    const turnStatus = readString(turn.status)
    appendBounded(
      lines,
      `## Turn ${index + 1}${turnId ? ` · ${turnId}` : ''}${turnStatus ? ` · ${turnStatus}` : ''}`,
      state,
    )
    const items = Array.isArray(turn.items) ? turn.items : []
    for (const item of items) {
      const formatted = formatThreadItem(item)
      if (formatted) appendBounded(lines, formatted, state)
    }
  }
  return lines.join('\n\n')
}

function buildGoalSection(goalResult: unknown): string {
  const result = asRecord(goalResult)
  const goal = asRecord(result?.goal ?? goalResult)
  if (!goal) return '_No active Codex goal was found._'
  const objective = readString(goal.objective)
  const status = readString(goal.status)
  const tokenBudget = typeof goal.tokenBudget === 'number' ? goal.tokenBudget : null
  const tokensUsed = typeof goal.tokensUsed === 'number' ? goal.tokensUsed : null
  const timeUsedSeconds = typeof goal.timeUsedSeconds === 'number' ? goal.timeUsedSeconds : null
  return [
    objective ? `- Objective: ${objective}` : '',
    status ? `- Status: ${status}` : '',
    tokenBudget !== null ? `- Token budget: ${tokenBudget.toLocaleString()}` : '',
    tokensUsed !== null ? `- Tokens used: ${tokensUsed.toLocaleString()}` : '',
    timeUsedSeconds !== null ? `- Time used: ${timeUsedSeconds.toLocaleString()} seconds` : '',
  ].filter(Boolean).join('\n') || '_No active Codex goal was found._'
}

function buildRepositorySection(repository: ProHandoffRepositorySnapshot | null | undefined): string {
  if (!repository) return '_The working directory is not inside a Git repository._'
  const sections = [
    `- Root: \`${repository.root}\``,
    `- Branch: \`${repository.branch || '(detached HEAD)'}\``,
    repository.status ? `\n### Status\n\n${fencedText(repository.status)}` : '',
    repository.recentCommits ? `\n### Recent commits\n\n${fencedText(repository.recentCommits)}` : '',
    repository.diffStat ? `\n### Diff stat\n\n${fencedText(repository.diffStat)}` : '',
    repository.changedFiles ? `\n### Changed files\n\n${fencedText(repository.changedFiles)}` : '',
    repository.diff
      ? `\n### Working-tree diff${repository.diffTruncated ? ' (truncated)' : ''}\n\n\`\`\`diff\n${repository.diff.split('```').join('``\\`')}\n\`\`\``
      : '',
  ]
  return sections.filter(Boolean).join('\n')
}

function buildContextSection(contextFiles: ProHandoffContextFile[]): string {
  if (contextFiles.length === 0) return '_No AGENTS.md instruction files were found between the working directory and repository root._'
  return contextFiles.map((file) => [
    `### ${file.path}${file.truncated ? ' (truncated)' : ''}`,
    '',
    '```markdown',
    file.content.split('```').join('``\\`'),
    '```',
  ].join('\n')).join('\n\n')
}

export function buildChatGptProHandoff(input: BuildProHandoffInput): string {
  const response = asRecord(input.threadResult)
  const thread = asRecord(response?.thread ?? input.threadResult) ?? {}
  const threadId = readString(thread.id)
  const cwd = readString(thread.cwd)
  const preview = readString(thread.preview)
  const modelProvider = readString(thread.modelProvider)
  const cliVersion = readString(thread.cliVersion)
  const exportedAt = input.exportedAt ?? new Date().toISOString()
  const transcript = buildTranscript(thread)

  return [
    '# Codex → ChatGPT Pro handoff',
    '',
    '> Switch this ChatGPT conversation to **GPT-5.6 Sol Pro**, then continue from the exact state below. Preserve existing decisions and do not redo completed work. Ask only if a genuinely blocking choice is missing.',
    '',
    '## Session',
    '',
    `- Exported: ${exportedAt}`,
    threadId ? `- Codex thread: \`${threadId}\`` : '',
    cwd ? `- Working directory: \`${cwd}\`` : '',
    modelProvider ? `- Model provider: ${modelProvider}` : '',
    cliVersion ? `- Codex CLI: ${cliVersion}` : '',
    preview ? `- Thread preview: ${preview}` : '',
    '',
    '## Goal',
    '',
    buildGoalSection(input.goalResult),
    '',
    '## Repository state',
    '',
    buildRepositorySection(input.repository),
    '',
    '## Applicable repository instructions',
    '',
    buildContextSection(input.contextFiles ?? []),
    '',
    '## Persisted transcript',
    '',
    transcript || '_No persisted turns were returned for this thread._',
    '',
    '## Continue',
    '',
    'Continue the user’s current request using this transcript, goal, repository state, changed-file list, diff, and repository instructions as context. Treat the local repository state as authoritative.',
    '',
  ].join('\n')
}
