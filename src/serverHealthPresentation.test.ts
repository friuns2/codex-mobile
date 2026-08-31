import { describe, expect, it } from 'vitest'
import { presentServerHealth } from './serverHealthPresentation'

describe('presentServerHealth', () => {
  it('presents a healthy managed app-server', () => {
    expect(presentServerHealth({ state: 'ready', restartAttempts: 0 })).toEqual({
      label: 'Codex connected',
      tone: 'ok',
    })
  })

  it('presents a managed app-server restart without exposing attempt details', () => {
    expect(presentServerHealth({ state: 'restarting', restartAttempts: 2 })).toEqual({
      label: 'Codex reconnecting',
      tone: 'warning',
    })
  })

  it('presents an unavailable managed app-server', () => {
    expect(presentServerHealth({ state: 'failed', restartAttempts: 3 })).toEqual({
      label: 'Codex unavailable',
      tone: 'error',
    })
  })

  it('distinguishes startup from an unknown host state', () => {
    expect(presentServerHealth({ state: 'starting', restartAttempts: 0 }).label).toBe('Codex connecting')
    expect(presentServerHealth(null).label).toBe('Codex status unknown')
  })
})
