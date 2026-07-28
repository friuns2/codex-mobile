import { describe, expect, it } from 'vitest'
import {
  describeSlashCommand,
  getSlashCommandSuggestions,
  parseSlashCommand,
} from './slashCommand'

describe('Codex slash command discovery', () => {
  it('shows Goal mode and app-server-supported Codex commands', () => {
    expect(getSlashCommandSuggestions('/').map((option) => option.id)).toEqual([
      'start',
      'view',
      'edit',
      'pause',
      'resume',
      'clear',
      'plan',
      'review',
      'compact',
      'model',
      'rename',
      'fork',
      'archive',
    ])
  })

  it('filters command prefixes and keeps argument text out of the menu', () => {
    expect(getSlashCommandSuggestions('/comp').map((option) => option.id)).toEqual(['compact'])
    expect(getSlashCommandSuggestions('/model').map((option) => option.id)).toEqual(['model'])
    expect(getSlashCommandSuggestions('/model gpt-5.4')).toEqual([])
    expect(getSlashCommandSuggestions('/goal e').map((option) => option.id)).toEqual(['edit'])
  })
})

describe('parseSlashCommand', () => {
  it('parses native controls without treating ordinary prompts as commands', () => {
    expect(parseSlashCommand('/plan Design the migration')).toEqual({
      kind: 'codex',
      command: { action: 'plan', prompt: 'Design the migration' },
    })
    expect(parseSlashCommand('/compact')).toEqual({
      kind: 'codex',
      command: { action: 'compact' },
    })
    expect(parseSlashCommand('/rename Release prep')).toEqual({
      kind: 'codex',
      command: { action: 'rename', name: 'Release prep' },
    })
    expect(parseSlashCommand('please /review this')).toBeNull()
  })

  it('provides execution previews for argument commands', () => {
    expect(describeSlashCommand('/plan Make a plan')).toMatchObject({ id: 'plan', label: 'Plan mode' })
    expect(describeSlashCommand('/model gpt-5.4')).toMatchObject({ id: 'model', label: 'Choose model' })
    expect(describeSlashCommand('/goal Ship it')).toMatchObject({ id: 'start', label: 'Start a goal' })
  })
})
