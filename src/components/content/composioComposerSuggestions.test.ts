import { describe, expect, it } from 'vitest'
import type { DirectoryComposioConnector } from '../../api/codexGateway'
import {
  buildComposioConnectorDocument,
  composioConnectorDocumentFileName,
  getComposioSuggestionQuery,
  mergeComposioConnectors,
  rankComposioSuggestions,
  removeComposioConnectorMention,
  removeComposioSuggestionQuery,
} from './composioComposerSuggestions'

function connector(overrides: Partial<DirectoryComposioConnector>): DirectoryComposioConnector {
  return {
    slug: 'default',
    name: 'Default',
    description: '',
    logoUrl: '',
    latestVersion: '',
    toolsCount: 0,
    triggersCount: 0,
    isNoAuth: false,
    enabled: true,
    authModes: [],
    activeCount: 0,
    totalConnections: 0,
    connectionStatuses: [],
    ...overrides,
  }
}

describe('rankComposioSuggestions', () => {
  it('prefers connected connectors for matching text', () => {
    const rows = [
      connector({ slug: 'reddit', name: 'Reddit', activeCount: 1, toolsCount: 10 }),
      connector({ slug: 'reddit_org', name: 'Reddit Org', activeCount: 0, toolsCount: 50 }),
    ]
    expect(rankComposioSuggestions(rows, 'reddit')[0]?.slug).toBe('reddit')
  })

  it('returns empty results for too-short generic text', () => {
    expect(rankComposioSuggestions([connector({ slug: 'reddit', name: 'Reddit' })], 'r')).toEqual([])
  })

  it('matches the connector suffix before the active word', () => {
    const rows = [
      connector({ slug: 'gmail', name: 'Gmail', toolsCount: 10 }),
      connector({ slug: 'reddit', name: 'Reddit', toolsCount: 10 }),
    ]
    expect(rankComposioSuggestions(rows, getComposioSuggestionQuery('lets make reddit bett'))[0]?.slug).toBe('reddit')
    expect(rankComposioSuggestions(rows, getComposioSuggestionQuery('gmail reddit butt'))[0]?.slug).toBe('reddit')
    expect(rankComposioSuggestions(rows, getComposioSuggestionQuery('reddit first then GMAIL later'))[0]?.slug).toBe('gmail')
  })

  it('does not match connector names inside larger words', () => {
    const rows = [connector({ slug: 'reddit', name: 'Reddit' })]
    expect(rankComposioSuggestions(rows, getComposioSuggestionQuery('redditor'))).toEqual([])
  })

  it('requires exact connector aliases instead of partial multi-word aliases', () => {
    const rows = [
      connector({ slug: 'reddit', name: 'Reddit', toolsCount: 10 }),
      connector({ slug: 'reddit_ads', name: 'Reddit Ads', toolsCount: 83 }),
    ]
    expect(rankComposioSuggestions(rows, 'reddit').map((row) => row.slug)).toEqual(['reddit'])
    expect(rankComposioSuggestions(rows, 'reddit ads').map((row) => row.slug)).toEqual(['reddit_ads'])
    expect(rankComposioSuggestions(rows, getComposioSuggestionQuery('reddit ads butt')).map((row) => row.slug)).toEqual(['reddit_ads'])
  })
})

describe('getComposioSuggestionQuery', () => {
  it('uses the completed connector phrase before the active word', () => {
    expect(getComposioSuggestionQuery('Gmail calendar reddit')).toBe('gmail calendar')
    expect(getComposioSuggestionQuery('lets make reddit bett')).toBe('lets make reddit')
    expect(getComposioSuggestionQuery('gmail reddit butt')).toBe('gmail reddit')
    expect(getComposioSuggestionQuery('reddit ads butt')).toBe('reddit ads')
    expect(getComposioSuggestionQuery('reddit')).toBe('reddit')
    expect(getComposioSuggestionQuery('reddit ')).toBe('reddit')
  })

  it('removes the trailing connector word after selecting a suggestion', () => {
    expect(removeComposioSuggestionQuery('gmail calendar reddit')).toBe('gmail calendar')
    expect(removeComposioSuggestionQuery('gmail calendar reddit ')).toBe('gmail calendar')
    expect(removeComposioSuggestionQuery('reddit')).toBe('')
  })

  it('removes the matched connector mention instead of the last word', () => {
    const reddit = connector({ slug: 'reddit', name: 'Reddit' })
    expect(removeComposioConnectorMention('lets make reddit bett', reddit)).toBe('lets make bett')
    expect(removeComposioConnectorMention('redditor reddit', reddit)).toBe('redditor')
  })
})

describe('mergeComposioConnectors', () => {
  it('preserves catalog availability and overlays live fields by slug', () => {
    const merged = mergeComposioConnectors(
      [connector({ slug: 'reddit', name: 'Reddit', toolsCount: 12 })],
      [
        connector({ slug: 'reddit', name: 'Reddit', activeCount: 2, totalConnections: 2 }),
        connector({ slug: 'live_only', name: 'Live Only', activeCount: 1 }),
      ],
    )
    expect(merged[0]).toMatchObject({ slug: 'reddit', name: 'Reddit', activeCount: 2, totalConnections: 2 })
    expect(merged[1]).toMatchObject({ slug: 'live_only', name: 'Live Only', activeCount: 1 })
  })
})

describe('buildComposioConnectorDocument', () => {
  it('builds an attachment document with connector instructions and metadata', () => {
    const row = connector({
      slug: 'google-calendar',
      name: 'Google Calendar',
      description: 'Manage calendar events.',
      toolsCount: 3,
      activeCount: 1,
      authModes: ['OAUTH2'],
    })

    expect(composioConnectorDocumentFileName(row)).toBe('composio-google-calendar.md')
    expect(buildComposioConnectorDocument(row)).toContain('Use the connected Google Calendar Composio connector (google-calendar)')
    expect(buildComposioConnectorDocument(row)).toContain('Manage calendar events.')
    expect(buildComposioConnectorDocument(row)).toContain('- Auth modes: OAUTH2')
  })

  it('handles missing connector and tool descriptions', () => {
    const row = connector({
      slug: 'minimal',
      name: 'Minimal',
      description: undefined as unknown as string,
    })
    const document = buildComposioConnectorDocument(row, {
      connector: row,
      tools: [{ slug: 'minimal_tool', name: 'Minimal Tool', description: undefined as unknown as string }],
      connections: [],
      dashboardUrl: '',
    })

    expect(document).toContain('No connector description is available')
    expect(document).toContain('Minimal Tool (minimal_tool)')
  })
})
