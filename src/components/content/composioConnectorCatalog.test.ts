import { describe, expect, it } from 'vitest'
import { HARDCODED_COMPOSIO_CONNECTORS } from './composioConnectorCatalog'

describe('HARDCODED_COMPOSIO_CONNECTORS', () => {
  it('ships a searchable non-empty catalog', () => {
    expect(HARDCODED_COMPOSIO_CONNECTORS.length).toBeGreaterThan(500)
    expect(HARDCODED_COMPOSIO_CONNECTORS.some((connector) => connector.slug === 'gmail')).toBe(true)
    expect(HARDCODED_COMPOSIO_CONNECTORS.some((connector) => connector.slug === 'github')).toBe(true)
  })

  it('keeps slugs unique for client-side merge lookups', () => {
    const slugs = HARDCODED_COMPOSIO_CONNECTORS.map((connector) => connector.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
