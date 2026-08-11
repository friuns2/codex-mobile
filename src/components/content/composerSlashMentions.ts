export type ComposerSlashSkill = {
  name: string
  displayName?: string
  description: string
  path: string
  scope?: string
  enabled?: boolean
}
export type ComposerSlashSuggestion =
  | {
      kind: 'command'
      name: 'goal' | 'plan'
      description: string
    }
  | {
      kind: 'skill'
      skill: ComposerSlashSkill
    }

export function buildComposerSubmitText(text: string, goalModeSelected: boolean): string {
  const normalizedText = text.trim()
  return goalModeSelected ? `/goal ${normalizedText}` : normalizedText
}

export function filterComposerSlashSuggestions(
  skills: ComposerSlashSkill[],
  query: string,
  limit = 20,
): ComposerSlashSuggestion[] {
  const normalizedQuery = query.trim().replace(/^\/+/, '').toLowerCase()
  const suggestions: ComposerSlashSuggestion[] = []
  const commands: Array<{ name: 'goal' | 'plan'; description: string }> = [
    { name: 'goal', description: 'Set or manage the goal for this thread' },
    { name: 'plan', description: 'Toggle plan mode for this thread' },
  ]
  const matchingCommands = commands.filter((command) => !normalizedQuery || command.name.includes(normalizedQuery))

  for (const command of matchingCommands) {
    if (suggestions.length >= limit) break
    suggestions.push({ kind: 'command', ...command })
  }

  const scored: Array<{ skill: ComposerSlashSkill; score: number; label: string }> = []
  for (const skill of skills) {
    const name = skill.name.trim()
    const displayName = (skill.displayName ?? '').trim()
    const description = skill.description.trim()
    const path = skill.path.trim()
    if (!name || !path) continue

    if (!normalizedQuery) {
      scored.push({ skill, score: 0, label: (displayName || name).toLowerCase() })
      continue
    }

    const aliases = [name, displayName].filter(Boolean).map((value) => value.toLowerCase())
    let score = Number.POSITIVE_INFINITY
    for (const alias of aliases) {
      if (alias === normalizedQuery) score = Math.min(score, 0)
      else if (alias.startsWith(normalizedQuery)) score = Math.min(score, 1)
      else if (alias.includes(normalizedQuery)) score = Math.min(score, 2)
    }
    if (description.toLowerCase().includes(normalizedQuery)) score = Math.min(score, 3)
    if (path.toLowerCase().includes(normalizedQuery)) score = Math.min(score, 4)
    if (!Number.isFinite(score)) continue
    scored.push({ skill, score, label: (displayName || name).toLowerCase() })
  }

  scored
    .sort((first, second) => first.score - second.score || first.label.localeCompare(second.label))
    .slice(0, Math.max(0, limit - suggestions.length))
    .forEach(({ skill }) => suggestions.push({ kind: 'skill', skill }))

  return suggestions.slice(0, Math.max(0, limit))
}
