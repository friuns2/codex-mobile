import type {
  DirectoryAppInfo,
  DirectoryMcpServerStatus,
  DirectoryPluginAppSummary,
  DirectoryPluginSkillSummary,
  DirectoryPluginSummary,
} from './codexGateway'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

export function normalizeDirectoryPluginApp(value: unknown): DirectoryPluginAppSummary | null {
  const record = asRecord(value)
  if (!record) return null
  const id = readString(record.id)
  const name = readString(record.name)
  if (!id || !name) return null
  return {
    id,
    name,
    description: readString(record.description) ?? '',
    installUrl: readString(record.installUrl ?? record.install_url) ?? '',
    needsAuth: readBoolean(record.needsAuth ?? record.needs_auth) ?? false,
  }
}

export function normalizeDirectoryPluginSkill(value: unknown): DirectoryPluginSkillSummary | null {
  const record = asRecord(value)
  if (!record) return null
  const name = readString(record.name)
  const path = readString(record.path)
  if (!name || !path) return null
  const iface = asRecord(record.interface)
  return {
    name,
    path,
    description: readString(record.description) ?? '',
    enabled: readBoolean(record.enabled) ?? true,
    displayName: readString(iface?.displayName ?? iface?.display_name) ?? name,
    shortDescription: readString(record.shortDescription ?? record.short_description) ?? '',
  }
}

export function normalizeDirectoryPluginSummary(
  value: unknown,
  marketplace: { name?: string; displayName?: string; path?: string | null } = {},
): DirectoryPluginSummary | null {
  const record = asRecord(value)
  if (!record) return null
  const id = readString(record.id)
  const name = readString(record.name)
  if (!id || !name) return null
  const iface = asRecord(record.interface)
  const source = asRecord(record.source)
  const sourceType = readString(source?.type) ?? ''
  const sourcePath = readString(source?.path)
  const sourceUrl = readString(source?.url) ?? ''
  const remoteMarketplaceName = sourceType === 'remote' ? marketplace.name ?? null : null
  const marketplacePath = marketplace.path ?? (sourceType === 'local' ? sourcePath : null)
  const displayName = readString(iface?.displayName ?? iface?.display_name) ?? name
  const shortDescription = readString(iface?.shortDescription ?? iface?.short_description)
  const longDescription = readString(iface?.longDescription ?? iface?.long_description) ?? ''

  return {
    id,
    name,
    displayName,
    description: shortDescription ?? longDescription,
    longDescription,
    developerName: readString(iface?.developerName ?? iface?.developer_name) ?? '',
    category: readString(iface?.category) ?? '',
    marketplaceName: marketplace.name ?? '',
    marketplaceDisplayName: marketplace.displayName ?? marketplace.name ?? '',
    marketplacePath,
    remoteMarketplaceName,
    sourceType,
    sourceUrl,
    installed: readBoolean(record.installed) ?? false,
    enabled: readBoolean(record.enabled) ?? true,
    installPolicy: readString(record.installPolicy ?? record.install_policy) ?? '',
    authPolicy: readString(record.authPolicy ?? record.auth_policy) ?? '',
    logoUrl: readString(iface?.logoUrl ?? iface?.logo_url) ?? '',
    logoPath: readString(iface?.logo) ?? '',
    composerIconUrl: readString(iface?.composerIconUrl ?? iface?.composer_icon_url) ?? '',
    composerIconPath: readString(iface?.composerIcon ?? iface?.composer_icon) ?? '',
    brandColor: readString(iface?.brandColor ?? iface?.brand_color) ?? '',
    capabilities: readStringArray(iface?.capabilities),
    defaultPrompt: readStringArray(iface?.defaultPrompt ?? iface?.default_prompt),
    screenshotUrls: readStringArray(iface?.screenshotUrls ?? iface?.screenshot_urls),
    screenshots: readStringArray(iface?.screenshots),
    websiteUrl: readString(iface?.websiteUrl ?? iface?.website_url) ?? '',
    privacyPolicyUrl: readString(iface?.privacyPolicyUrl ?? iface?.privacy_policy_url) ?? '',
    termsOfServiceUrl: readString(iface?.termsOfServiceUrl ?? iface?.terms_of_service_url) ?? '',
  }
}

export function normalizeDirectoryApp(value: unknown, catalogRank = 0): DirectoryAppInfo | null {
  const record = asRecord(value)
  if (!record) return null
  const id = readString(record.id)
  const name = readString(record.name)
  if (!id || !name) return null
  const branding = asRecord(record.branding)
  const metadata = asRecord(record.appMetadata ?? record.app_metadata)
  return {
    id,
    name,
    description: readString(record.description) ?? readString(metadata?.seoDescription ?? metadata?.seo_description) ?? '',
    logoUrl: readString(record.logoUrl ?? record.logo_url) ?? '',
    logoUrlDark: readString(record.logoUrlDark ?? record.logo_url_dark) ?? '',
    distributionChannel: readString(record.distributionChannel ?? record.distribution_channel) ?? '',
    installUrl: readString(record.installUrl ?? record.install_url) ?? '',
    isAccessible: readBoolean(record.isAccessible ?? record.is_accessible) ?? false,
    isEnabled: readBoolean(record.isEnabled ?? record.is_enabled) ?? true,
    pluginDisplayNames: readStringArray(record.pluginDisplayNames ?? record.plugin_display_names),
    category: readString(branding?.category) ?? '',
    developer: readString(branding?.developer) ?? readString(metadata?.developer) ?? '',
    website: readString(branding?.website) ?? '',
    privacyPolicy: readString(branding?.privacyPolicy ?? branding?.privacy_policy) ?? '',
    termsOfService: readString(branding?.termsOfService ?? branding?.terms_of_service) ?? '',
    catalogRank,
  }
}

export function normalizeDirectoryMcpServer(value: unknown): DirectoryMcpServerStatus | null {
  const record = asRecord(value)
  if (!record) return null
  const name = readString(record.name)
  if (!name) return null
  const toolsRecord = asRecord(record.tools) ?? {}
  const tools = Object.entries(toolsRecord).map(([fallbackName, raw]) => {
    const tool = asRecord(raw)
    return {
      name: readString(tool?.name) ?? fallbackName,
      title: readString(tool?.title) ?? '',
      description: readString(tool?.description) ?? '',
    }
  })
  const resources = Array.isArray(record.resources)
    ? record.resources.map((raw) => {
      const resource = asRecord(raw)
      return {
        name: readString(resource?.name) ?? '',
        title: readString(resource?.title) ?? '',
        uri: readString(resource?.uri) ?? '',
        description: readString(resource?.description) ?? '',
      }
    }).filter((resource) => resource.name || resource.uri)
    : []
  const rawResourceTemplates = record.resourceTemplates ?? record.resource_templates
  const resourceTemplates = Array.isArray(rawResourceTemplates)
    ? rawResourceTemplates.map((raw: unknown) => {
      const template = asRecord(raw)
      return {
        name: readString(template?.name) ?? '',
        title: readString(template?.title) ?? '',
        uriTemplate: readString(template?.uriTemplate ?? template?.uri_template) ?? '',
        description: readString(template?.description) ?? '',
      }
    }).filter((template) => template.name || template.uriTemplate)
    : []

  return {
    name,
    authStatus: readString(record.authStatus ?? record.auth_status) ?? 'unsupported',
    tools,
    resources,
    resourceTemplates,
  }
}
