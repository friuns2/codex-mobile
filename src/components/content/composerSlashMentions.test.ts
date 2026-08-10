import { describe, expect, it } from 'vitest'
import { filterComposerSlashSuggestions } from './composerSlashMentions'

const skills = [
  { name: 'browser-use', displayName: 'Browser Use', description: 'Browser automation helper', path: '/skills/browser-use/SKILL.md' },
  { name: 'openai-docs', displayName: 'OpenAI Docs', description: 'Official docs helper', path: '/skills/openai-docs/SKILL.md' },
]

describe('composerSlashMentions', () => {
  it('shows skills before /goal and /plan for an empty slash query', () => {
    expect(filterComposerSlashSuggestions(skills, '').map((item) => item.kind === 'command' ? `/${item.name}` : `/${item.skill.name}`)).toEqual([
      '/browser-use',
      '/openai-docs',
      '/goal',
      '/plan',
    ])
  })

  it('filters commands and skills by the slash query', () => {
    expect(filterComposerSlashSuggestions(skills, 'go')).toEqual([
      { kind: 'command', name: 'goal', description: 'Set or manage the goal for this thread' },
    ])
    expect(filterComposerSlashSuggestions(skills, 'pl')).toEqual([
      { kind: 'command', name: 'plan', description: 'Toggle plan mode for this thread' },
    ])
    expect(filterComposerSlashSuggestions(skills, 'browser').map((item) => item.kind === 'skill' ? item.skill.name : item.name)).toEqual(['browser-use'])
  })

  it('matches skill descriptions and paths', () => {
    expect(filterComposerSlashSuggestions(skills, 'official').map((item) => item.kind === 'skill' ? item.skill.name : item.name)).toEqual(['openai-docs'])
    expect(filterComposerSlashSuggestions(skills, 'browser-use').map((item) => item.kind === 'skill' ? item.skill.name : item.name)).toEqual(['browser-use'])
  })
})
