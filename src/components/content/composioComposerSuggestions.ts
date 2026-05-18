import type { DirectoryComposioConnector, DirectoryComposioConnectorDetail } from '../../api/codexGateway'

export function mergeComposioConnectors(
  catalog: DirectoryComposioConnector[],
  liveRows: DirectoryComposioConnector[],
): DirectoryComposioConnector[] {
  const bySlug = new Map(liveRows.map((row) => [row.slug, row]))
  const catalogSlugs = new Set(catalog.map((row) => row.slug))
  const merged = catalog.map((row) => {
    const live = bySlug.get(row.slug)
    return live ? { ...row, ...live } : row
  })
  return [
    ...merged,
    ...liveRows.filter((row) => !catalogSlugs.has(row.slug)),
  ]
}

export function getComposioSuggestionQuery(value: string): string {
  const trimmed = value.trimEnd()
  const tokens = [...trimmed.matchAll(/[a-z0-9][a-z0-9_-]*/giu)].map((match) => match[0].toLowerCase())
  if (tokens.length === 0) return ''
  if (/\s$/u.test(value)) return tokens.join(' ')
  return tokens.length > 1 ? tokens.slice(0, -1).join(' ') : tokens[0] ?? ''
}

export function removeComposioSuggestionQuery(value: string): string {
  return value.replace(/(?:^|\s+)[a-z0-9][a-z0-9_-]*\s*$/iu, '')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function connectorAliases(connector: DirectoryComposioConnector): string[] {
  const aliases = [
    connector.slug,
    connector.name,
    connector.slug.replace(/[_-]+/gu, ' '),
    connector.name.replace(/[_-]+/gu, ' '),
  ]
  return [...new Set(aliases.map((alias) => alias.trim().toLowerCase()).filter((alias) => alias.length >= 2))]
}

function aliasPattern(alias: string): RegExp {
  const separatorAware = alias
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .map(escapeRegex)
    .join('[\\s_-]+')
  return new RegExp(`(^|[^a-z0-9])(${separatorAware})(?=$|[^a-z0-9])`, 'giu')
}

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .join(' ')
}

type ComposioMentionMatch = { index: number; length: number }

function findLatestExactAliasMatch(connector: DirectoryComposioConnector, fullQuery: string): ComposioMentionMatch | null {
  let latest: ComposioMentionMatch | null = null
  for (const alias of connectorAliases(connector)) {
    const pattern = aliasPattern(alias)
    for (const match of fullQuery.matchAll(pattern)) {
      const matched = match[2] ?? ''
      const index = (match.index ?? 0) + ((match[1] ?? '').length)
      if (!latest || index > latest.index || (index === latest.index && matched.length > latest.length)) {
        latest = { index, length: matched.length }
      }
    }
  }
  return latest
}

function scoreComposioSuggestion(connector: DirectoryComposioConnector, fullQuery: string): number {
  const normalizedQuery = normalizeAlias(fullQuery)
  const matchedAlias = connectorAliases(connector)
    .map(normalizeAlias)
    .filter((alias) => normalizedQuery === alias || normalizedQuery.endsWith(` ${alias}`))
    .sort((first, second) => second.length - first.length)[0]
  if (!matchedAlias) return 0
  let score = matchedAlias.length * 1_000
  if (connector.activeCount > 0) score += 500
  else if (connector.totalConnections > 0) score += 250
  else if (connector.isNoAuth) score += 100
  score += connector.toolsCount
  return score
}

export function rankComposioSuggestions(rows: DirectoryComposioConnector[], query: string): DirectoryComposioConnector[] {
  const fullQuery = query.trim().toLowerCase()
  if (fullQuery.length < 2) return []
  return rows
    .map((connector) => ({ connector, score: scoreComposioSuggestion(connector, fullQuery) }))
    .filter((row) => row.score > 0)
    .sort((first, second) => second.score - first.score || first.connector.name.localeCompare(second.connector.name))
    .map((row) => row.connector)
}

export function removeComposioConnectorMention(value: string, connector: DirectoryComposioConnector): string {
  const latestMatch = findLatestExactAliasMatch(connector, value)
  if (!latestMatch) return value
  const before = value.slice(0, latestMatch.index).replace(/\s+$/u, '')
  const after = value.slice(latestMatch.index + latestMatch.length).replace(/^\s+/u, '')
  if (!before) return after
  if (!after) return before
  return `${before} ${after}`
}

function sanitizeComposioFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    || 'connector'
}

function formatComposioList(items: string[]): string {
  const rows = items.map((item) => item.trim()).filter(Boolean)
  return rows.length > 0 ? rows.map((item) => `- ${item}`).join('\n') : '- None listed'
}

export function composioConnectorDocumentFileName(connector: DirectoryComposioConnector): string {
  return `composio-${sanitizeComposioFilePart(connector.slug || connector.name)}.md`
}

export function buildComposioConnectorDocument(
  connector: DirectoryComposioConnector,
  detail?: DirectoryComposioConnectorDetail | null,
): string {
  const resolvedConnector = detail?.connector ?? connector
  const connected = resolvedConnector.activeCount > 0
  const instruction = connected
    ? `Use the connected ${resolvedConnector.name} Composio connector (${resolvedConnector.slug}) for this request.`
    : `Use the ${resolvedConnector.name} Composio connector (${resolvedConnector.slug}) for this request.`
  const toolLines = (detail?.tools ?? []).map((tool) => {
    const description = (tool.description ?? '').trim()
    return description ? `${tool.name} (${tool.slug}): ${description}` : `${tool.name} (${tool.slug})`
  })
  const connectionLines = (detail?.connections ?? []).map((connection) => {
    const status = connection.status ? `, status: ${connection.status}` : ''
    const alias = connection.alias ? `, alias: ${connection.alias}` : ''
    const authScheme = connection.authScheme ? `, auth: ${connection.authScheme}` : ''
    return `${connection.id || connection.wordId || 'connection'}${status}${alias}${authScheme}`
  })

  return [
    `# ${resolvedConnector.name} Composio Connector`,
    '',
    '## Instruction',
    instruction,
    '',
    '## Description',
    (resolvedConnector.description ?? '').trim() || 'No connector description is available in the local Composio catalog.',
    '',
    '## Connector Metadata',
    `- Slug: ${resolvedConnector.slug}`,
    `- Tools: ${resolvedConnector.toolsCount}`,
    `- Triggers: ${resolvedConnector.triggersCount}`,
    `- Latest version: ${resolvedConnector.latestVersion || 'Not listed'}`,
    `- Auth modes: ${resolvedConnector.authModes.length > 0 ? resolvedConnector.authModes.join(', ') : 'Not listed'}`,
    `- No-auth connector: ${resolvedConnector.isNoAuth ? 'yes' : 'no'}`,
    `- Enabled: ${resolvedConnector.enabled ? 'yes' : 'no'}`,
    `- Active connections: ${resolvedConnector.activeCount}`,
    `- Total connections: ${resolvedConnector.totalConnections}`,
    `- Connection statuses: ${resolvedConnector.connectionStatuses.length > 0 ? resolvedConnector.connectionStatuses.join(', ') : 'None listed'}`,
    '',
    '## Available Tools',
    formatComposioList(toolLines),
    '',
    '## Connections',
    formatComposioList(connectionLines),
    '',
    '## Notes For Codex',
    '- Prefer this Composio connector when the user request matches the connector purpose above.',
    '- Use Composio connector tooling when it is available to inspect exact tool schemas before executing connector actions.',
    '- If authentication is required and no active connection is listed, ask the user to connect the connector before making authenticated calls.',
  ].join('\n')
}
