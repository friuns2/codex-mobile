import { describe, expect, it } from 'vitest'
import { normalizeSeverity, summarize } from './sentinealRouter'

describe('sentineal severity normalization', () => {
  it('maps npm severity strings to the canonical union', () => {
    expect(normalizeSeverity('critical')).toBe('critical')
    expect(normalizeSeverity('high')).toBe('high')
    expect(normalizeSeverity('moderate')).toBe('moderate')
    expect(normalizeSeverity('low')).toBe('low')
  })

  it('falls back to moderate for unknown severities', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('critical')
    expect(normalizeSeverity('severe')).toBe('moderate')
    expect(normalizeSeverity('')).toBe('moderate')
  })
})

describe('sentineal scan summary', () => {
  it('counts clean and vulnerable dependencies across severities', () => {
    const summary = summarize([
      { name: 'clean-pkg', version: '1.0.0', dev: false, advisories: [] },
      {
        name: 'critical-pkg',
        version: '2.0.0',
        dev: false,
        advisories: [
          { id: 1, title: 'x', severity: 'critical', cves: [], vulnerableVersions: '', patchedVersions: '', recommendation: '', url: '', source: 'npm' },
          { id: 2, title: 'y', severity: 'high', cves: [], vulnerableVersions: '', patchedVersions: '', recommendation: '', url: '', source: 'npm' },
        ],
      },
      {
        name: 'low-pkg',
        version: '3.0.0',
        dev: true,
        advisories: [
          { id: 3, title: 'z', severity: 'low', cves: [], vulnerableVersions: '', patchedVersions: '', recommendation: '', url: '', source: 'socket' },
        ],
      },
    ])
    expect(summary).toEqual({
      total: 3,
      vulnerable: 2,
      critical: 1,
      high: 1,
      moderate: 0,
      low: 1,
    })
  })

  it('returns zeros for an empty dependency list', () => {
    expect(summarize([])).toEqual({
      total: 0,
      vulnerable: 0,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
    })
  })
})
