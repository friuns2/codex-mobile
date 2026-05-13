<template>
  <div class="directory-hub">
    <div class="directory-header">
      <div>
        <h2 class="directory-title">Skills & Apps</h2>
        <p class="directory-subtitle">{{ activeCopy.subtitle }}</p>
      </div>
      <div class="directory-header-actions">
        <button class="directory-refresh" type="button" :disabled="isManualRefreshInFlight" @click="manualRefreshActiveTab">
          {{ isManualRefreshInFlight ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div class="directory-tabs" role="tablist" aria-label="Directory sections">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="directory-tab"
        :class="{ 'is-active': activeTab === tab.id }"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="toast" class="directory-toast" :class="{ 'is-error': toast.type === 'error' }">{{ toast.text }}</div>

    <section v-if="activeTab === 'plugins'" class="directory-section">
      <div class="directory-toolbar">
        <input
          v-model="pluginSearchQuery"
          class="directory-search"
          type="search"
          placeholder="Search plugins..."
          aria-label="Search plugins"
        />
        <div class="directory-sort-group" role="group" aria-label="Sort plugins">
          <button
            class="directory-sort-button"
            :class="{ 'is-active': pluginSortMode === 'popular' }"
            type="button"
            @click="pluginSortMode = 'popular'"
          >
            Popular
          </button>
          <button
            class="directory-sort-button"
            :class="{ 'is-active': pluginSortMode === 'name' }"
            type="button"
            @click="pluginSortMode = 'name'"
          >
            A-Z
          </button>
          <button
            class="directory-sort-button"
            :class="{ 'is-active': pluginSortMode === 'date' }"
            type="button"
            @click="pluginSortMode = 'date'"
          >
            Date
          </button>
        </div>
      </div>
      <div v-if="!supportsPlugins" class="directory-empty">
        Plugin APIs unavailable in this Codex CLI. Update Codex CLI to use plugin catalog features.
      </div>
      <div v-else-if="pluginError" class="directory-error">{{ pluginError }}</div>
      <div v-else-if="isLoadingPlugins" class="directory-loading">Loading plugins...</div>
      <div v-else-if="visiblePlugins.length === 0" class="directory-empty">No plugins found.</div>
      <div v-else class="directory-grid">
        <article
          v-for="plugin in visiblePlugins"
          :key="plugin.id"
          class="directory-card"
          :class="{ 'is-disabled': plugin.installed && !plugin.enabled }"
        >
          <div class="directory-card-top">
            <img
              v-if="pluginIconSrc(plugin)"
              class="directory-card-icon"
              :src="pluginIconSrc(plugin)"
              :alt="plugin.displayName"
              loading="lazy"
            />
            <div v-else class="directory-card-fallback" :style="fallbackStyle(plugin)">
              {{ plugin.displayName.charAt(0) }}
            </div>
            <div class="directory-card-main">
              <div class="directory-card-title-row">
                <span class="directory-card-title">{{ plugin.displayName }}</span>
                <span v-if="plugin.installed && !plugin.enabled" class="directory-badge is-muted">Disabled</span>
                <span v-else-if="plugin.installed" class="directory-badge">Installed</span>
              </div>
              <span class="directory-card-meta">{{ plugin.developerName || plugin.marketplaceDisplayName || plugin.marketplaceName || 'Plugin' }}</span>
            </div>
          </div>
          <p v-if="plugin.description" class="directory-card-description">{{ plugin.description }}</p>
          <div class="directory-chip-row directory-example-chip-row" aria-label="Try example prompts">
            <button
              v-for="example in pluginExampleChips(plugin)"
              :key="example"
              class="directory-chip directory-example-chip"
              type="button"
              :disabled="!canTryPlugin(plugin) || isTryActionInFlight"
              :title="canTryPlugin(plugin) ? `Start: ${example}` : 'Install and enable this plugin to run examples'"
              @click.stop="tryPlugin(plugin, example)"
            >
              {{ props.tryInFlightKey === pluginTryKey(plugin, example) ? 'Starting...' : example }}
            </button>
          </div>
          <div class="directory-card-actions">
            <button class="directory-action" type="button" @click="openPluginDetail(plugin)">
              Details
            </button>
            <button
              v-if="!plugin.installed"
              class="directory-action primary"
              type="button"
              @click="openPluginDetail(plugin)"
            >
              Install to run
            </button>
            <button
              v-else-if="!plugin.enabled"
              class="directory-action"
              type="button"
              @click="openPluginDetail(plugin)"
            >
              Enable examples
            </button>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'apps'" class="directory-section">
      <div class="directory-toolbar">
        <input
          v-model="appSearchQuery"
          class="directory-search"
          type="search"
          placeholder="Search apps..."
          aria-label="Search apps"
        />
        <div class="directory-sort-group" role="group" aria-label="Sort apps">
          <button
            class="directory-sort-button"
            :class="{ 'is-active': appSortMode === 'popular' }"
            type="button"
            @click="appSortMode = 'popular'"
          >
            Popular
          </button>
          <button
            class="directory-sort-button"
            :class="{ 'is-active': appSortMode === 'name' }"
            type="button"
            @click="appSortMode = 'name'"
          >
            A-Z
          </button>
          <button
            class="directory-sort-button"
            :class="{ 'is-active': appSortMode === 'date' }"
            type="button"
            @click="appSortMode = 'date'"
          >
            Date
          </button>
        </div>
      </div>
      <div v-if="!supportsApps" class="directory-empty">
        Apps APIs unavailable in this Codex CLI. Update Codex CLI to manage apps.
      </div>
      <div v-else-if="appError" class="directory-error">{{ appError }}</div>
      <div v-else-if="isLoadingApps" class="directory-loading">Loading apps...</div>
      <div v-else-if="visibleApps.length === 0" class="directory-empty">No apps found.</div>
      <div v-else class="directory-grid">
        <article v-for="app in visibleApps" :key="app.id" class="directory-card">
          <div class="directory-card-top">
            <img v-if="appLogoSrc(app)" class="directory-card-icon" :src="appLogoSrc(app)" :alt="app.name" loading="lazy" />
            <div v-else class="directory-card-fallback">{{ app.name.charAt(0) }}</div>
            <div class="directory-card-main">
              <div class="directory-card-title-row">
                <span class="directory-card-title">{{ app.name }}</span>
                <span v-if="!app.isEnabled" class="directory-badge is-muted">Disabled</span>
                <span v-else-if="app.isAccessible" class="directory-badge">Connected</span>
              </div>
              <span class="directory-card-meta">{{ appMetaLabel(app) }}</span>
            </div>
          </div>
          <p v-if="app.description" class="directory-card-description">{{ app.description }}</p>
          <div class="directory-chip-row directory-example-chip-row" aria-label="Try example prompts">
            <button
              v-for="example in appExampleChips(app)"
              :key="example"
              class="directory-chip directory-example-chip"
              type="button"
              :disabled="!canTryApp(app) || isTryActionInFlight"
              :title="canTryApp(app) ? `Start: ${example}` : 'Connect and enable this app to run examples'"
              @click="tryApp(app, example)"
            >
              {{ props.tryInFlightKey === appTryKey(app, example) ? 'Starting...' : example }}
            </button>
          </div>
          <div class="directory-card-actions">
            <button class="directory-action" type="button" :disabled="appActionId === app.id" @click="toggleApp(app)">
              {{ app.isEnabled ? 'Disable' : 'Enable' }}
            </button>
            <button v-if="app.installUrl" class="directory-action-link" type="button" @click="openExternalUrl(app.installUrl)">
              {{ app.isAccessible ? 'Manage' : 'Login' }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'composio'" class="directory-section">
      <div class="directory-toolbar">
        <input
          v-model="composioSearchQuery"
          class="directory-search"
          type="search"
          placeholder="Search Composio connectors..."
          aria-label="Search Composio connectors"
        />
        <div class="directory-sort-group" role="group" aria-label="Sort Composio connectors">
          <button
            class="directory-sort-button"
            :class="{ 'is-active': composioSortMode === 'popular' }"
            type="button"
            @click="composioSortMode = 'popular'"
          >
            Popular
          </button>
          <button
            class="directory-sort-button"
            :class="{ 'is-active': composioSortMode === 'name' }"
            type="button"
            @click="composioSortMode = 'name'"
          >
            A-Z
          </button>
          <button
            class="directory-sort-button"
            :class="{ 'is-active': composioSortMode === 'date' }"
            type="button"
            @click="composioSortMode = 'date'"
          >
            Date
          </button>
        </div>
      </div>
      <div v-if="composioError" class="directory-error">{{ composioError }}</div>
      <div v-else-if="isLoadingComposio" class="directory-loading">Loading Composio connectors...</div>
      <div v-else-if="!composioStatus?.available" class="directory-empty">
        <div class="directory-empty-copy">
          <p class="directory-empty-text">Composio CLI is not installed in this environment.</p>
          <div class="directory-card-actions">
            <button class="directory-action primary" type="button" :disabled="isInstallingComposio" @click="installComposioCli">
              {{ isInstallingComposio ? 'Installing...' : 'Install Composio' }}
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="!composioStatus.authenticated" class="composio-preview">
        <article class="composio-preview-hero">
          <div class="composio-preview-copy">
            <div class="directory-card-fallback composio-fallback">C</div>
            <div>
              <p class="composio-preview-kicker">Connector catalog preview</p>
              <h3 class="composio-preview-title">Connect everyday apps like Gmail, Calendar, Reddit, YouTube, and Drive.</h3>
              <p class="composio-preview-text">
                Composio is installed locally. Login to browse the live catalog, connect your accounts, and try simple actions from this machine.
              </p>
            </div>
          </div>
          <div class="composio-preview-actions">
            <button class="directory-action primary" type="button" :disabled="isStartingComposioLogin" @click="startComposioCliLogin">
              {{ isStartingComposioLogin ? 'Opening...' : 'Login to Composio' }}
            </button>
            <button class="directory-action-link" type="button" @click="openExternalUrl(composioStatus.webUrl || 'https://dashboard.composio.dev/')">
              Open dashboard
            </button>
          </div>
        </article>
        <div class="composio-preview-grid">
          <article v-for="connector in visibleComposioPreviewConnectors" :key="connector.slug" class="directory-card composio-preview-card">
            <div class="directory-card-top">
              <div class="directory-card-fallback composio-fallback">{{ connector.initial }}</div>
              <div class="directory-card-main">
                <div class="directory-card-title-row">
                  <span class="directory-card-title">{{ connector.name }}</span>
                  <span class="directory-badge is-muted">Preview</span>
                </div>
                <span class="directory-card-meta">{{ connector.meta }}</span>
              </div>
            </div>
            <p class="directory-card-description">{{ connector.description }}</p>
            <div class="directory-chip-row">
              <span v-for="chip in connector.chips" :key="chip" class="directory-chip">{{ chip }}</span>
            </div>
          </article>
        </div>
      </div>
      <div v-else class="directory-section composio-section">
        <article class="directory-card directory-card-wide composio-status-card">
          <div class="directory-card-top">
            <div class="directory-card-fallback composio-fallback">C</div>
            <div class="directory-card-main">
              <div class="directory-card-title-row">
                <span class="directory-card-title">Composio workspace</span>
                <span class="directory-badge">Connected</span>
              </div>
              <span class="directory-card-meta">{{ composioStatus.email || composioStatus.defaultOrgName || 'Authenticated' }}</span>
            </div>
          </div>
          <p class="directory-card-description">
            {{ composioWorkspaceSummary }}
          </p>
            <div class="directory-chip-row">
              <span v-if="composioStatus.defaultOrgName" class="directory-chip">{{ composioStatus.defaultOrgName }}</span>
              <span v-if="composioStatus.cliVersion" class="directory-chip">CLI {{ composioStatus.cliVersion }}</span>
              <span v-if="composioConnectors.length" class="directory-chip">
                Showing {{ composioConnectors.length }}{{ composioTotal ? ` / ${composioTotal}` : '' }} connectors
              </span>
            </div>
          <div class="directory-card-actions">
            <button class="directory-action-link" type="button" @click="openExternalUrl(composioStatus.webUrl)">
              Open dashboard
            </button>
          </div>
        </article>

        <div v-if="visibleComposioConnectors.length === 0" class="directory-empty">No Composio connectors found.</div>
        <div v-else class="directory-grid">
          <article v-for="connector in visibleComposioConnectors" :key="connector.slug" class="directory-card">
            <div class="directory-card-top">
              <img v-if="connector.logoUrl" class="directory-card-icon" :src="connector.logoUrl" :alt="connector.name" loading="lazy" />
              <div v-else class="directory-card-fallback composio-fallback">{{ connector.name.charAt(0) }}</div>
              <div class="directory-card-main">
                <div class="directory-card-title-row">
                  <span class="directory-card-title">{{ connector.name }}</span>
                  <span v-if="connector.activeCount > 0" class="directory-badge">Connected</span>
                  <span v-else-if="connector.isNoAuth" class="directory-badge">No auth</span>
                </div>
                <span class="directory-card-meta">{{ composioMetaLabel(connector) }}</span>
              </div>
            </div>
            <p v-if="connector.description" class="directory-card-description">{{ connector.description }}</p>
            <div class="directory-chip-row directory-example-chip-row" aria-label="Try example prompts">
              <button
                v-for="example in composioExampleChips(connector)"
                :key="example"
                class="directory-chip directory-example-chip"
                type="button"
                :disabled="!canTryComposio(connector) || isTryActionInFlight"
                :title="canTryComposio(connector) ? `Start: ${example}` : 'Connect this connector to run examples'"
                @click="tryComposio(connector, [], example)"
              >
                {{ props.tryInFlightKey === composioTryKey(connector.slug, example) ? 'Starting...' : example }}
              </button>
            </div>
            <div class="directory-card-actions">
              <button class="directory-action" type="button" @click="openComposioDetail(connector.slug)">
                Details
              </button>
              <button
                v-if="composioPrimaryActionLabel(connector)"
                class="directory-action-link"
                type="button"
                :disabled="composioActionSlug === connector.slug"
                @click="runComposioPrimaryAction(connector)"
              >
                {{ composioActionSlug === connector.slug ? 'Opening...' : composioPrimaryActionLabel(connector) }}
              </button>
            </div>
          </article>
        </div>
        <div v-if="hasMoreComposioConnectors" class="directory-section-actions">
          <button
            class="directory-action"
            type="button"
            :disabled="isLoadingComposio"
            @click="loadMoreComposio"
          >
            {{ isLoadingComposio ? 'Loading...' : 'Load more' }}
          </button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'skills'" class="directory-section">
      <SkillsHub
        :try-in-flight-key="props.tryInFlightKey"
        @skills-changed="emit('skills-changed')"
        @try-item="(payload) => emit('try-item', payload)"
      >
        <template #before-installed>
          <div class="skills-embedded-section">
            <button class="skills-embedded-toggle" type="button" @click="isMcpSectionOpen = !isMcpSectionOpen">
              <span class="skills-embedded-title">MCPs({{ visibleMcpServers.length }})</span>
              <span class="skills-embedded-chevron" :class="{ 'is-open': isMcpSectionOpen }">›</span>
            </button>
            <div v-if="isMcpSectionOpen" class="skills-embedded-body">
              <div v-if="!supportsMcps" class="directory-empty">
                MCP status APIs unavailable in this Codex CLI. Update Codex CLI to inspect MCP servers.
              </div>
              <div v-else-if="mcpError" class="directory-error">{{ mcpError }}</div>
              <div v-else-if="isLoadingMcps" class="directory-loading">Loading MCP servers...</div>
              <div v-else-if="visibleMcpServers.length === 0" class="directory-empty">No MCP servers configured.</div>
              <div v-else class="mcp-skill-grid">
                <article v-for="server in visibleMcpServers" :key="server.name">
                  <button class="mcp-skill-card skill-card" type="button" @click="toggleMcpExpanded(server.name)">
                    <div class="mcp-skill-card-top">
                      <div class="mcp-skill-avatar-fallback">{{ server.name.charAt(0) }}</div>
                      <div class="mcp-skill-info">
                        <div class="mcp-skill-header">
                          <span class="mcp-skill-name">{{ server.name }}</span>
                          <span class="mcp-skill-badge" :class="mcpCardBadgeClass(server.authStatus)">{{ formatMcpAuthStatus(server.name) }}</span>
                        </div>
                        <span class="mcp-skill-owner">mcp</span>
                      </div>
                      <span class="mcp-skill-chevron" :class="{ 'is-open': expandedMcpNames.has(server.name) }">›</span>
                    </div>
                    <p class="mcp-skill-meta">{{ server.tools.length }} tools · {{ server.resources.length + server.resourceTemplates.length }} resources</p>
                    <div v-if="expandedMcpNames.has(server.name)" class="directory-mcp-detail">
                      <div v-if="server.tools.length > 0">
                        <h3 class="directory-mini-heading">Tools</h3>
                        <p class="directory-mini-list">{{ server.tools.map((tool) => tool.title || tool.name).join(', ') }}</p>
                      </div>
                      <div v-if="server.resources.length > 0 || server.resourceTemplates.length > 0">
                        <h3 class="directory-mini-heading">Resources</h3>
                        <p class="directory-mini-list">
                          {{ [...server.resources.map((r) => r.title || r.name || r.uri), ...server.resourceTemplates.map((r) => r.title || r.name || r.uriTemplate)].join(', ') }}
                        </p>
                      </div>
                    </div>
                  </button>
                </article>
              </div>
            </div>
          </div>
        </template>
      </SkillsHub>
    </section>

    <Teleport to="body">
      <div v-if="isPluginDetailOpen" class="directory-modal-overlay" @click.self="closePluginDetail">
        <article class="directory-modal">
          <div class="directory-modal-header">
            <div class="directory-card-top">
              <img
                v-if="selectedPlugin && pluginIconSrc(selectedPlugin)"
                class="directory-card-icon"
                :src="pluginIconSrc(selectedPlugin)"
                :alt="selectedPlugin.displayName"
                loading="lazy"
              />
              <div v-else class="directory-card-fallback">{{ selectedPlugin?.displayName.charAt(0) }}</div>
              <div class="directory-card-main">
                <h3 class="directory-modal-title">{{ selectedPlugin?.displayName || 'Plugin' }}</h3>
                <span class="directory-card-meta">{{ selectedPlugin?.developerName || selectedPlugin?.marketplaceDisplayName || selectedPlugin?.marketplaceName }}</span>
              </div>
            </div>
            <button class="directory-modal-close" type="button" aria-label="Close plugin detail" @click="closePluginDetail">Close</button>
          </div>

          <div class="directory-modal-body">
            <div v-if="pluginDetailError" class="directory-error">{{ pluginDetailError }}</div>
            <div v-else-if="isLoadingPluginDetail" class="directory-loading">Loading plugin...</div>
            <template v-else-if="selectedPluginDetail">
              <p v-if="selectedPluginDescription" class="directory-detail-description">{{ selectedPluginDescription }}</p>

              <div v-if="selectedPlugin" class="directory-detail-block">
                <h4 class="directory-detail-heading">Examples</h4>
                <div class="directory-chip-row directory-example-chip-row">
                  <button
                    v-for="example in pluginExampleChips(selectedPlugin)"
                    :key="example"
                    class="directory-chip directory-example-chip"
                    type="button"
                    :disabled="!canTryPlugin(selectedPlugin) || isTryActionInFlight"
                    :title="canTryPlugin(selectedPlugin) ? `Start: ${example}` : 'Install and enable this plugin to run examples'"
                    @click="tryPlugin(selectedPlugin, example)"
                  >
                    {{ props.tryInFlightKey === pluginTryKey(selectedPlugin, example) ? 'Starting...' : example }}
                  </button>
                </div>
              </div>

              <div v-if="selectedPluginDetail.summary.capabilities.length > 0" class="directory-detail-block">
                <h4 class="directory-detail-heading">Capabilities</h4>
                <div class="directory-chip-row">
                  <span v-for="capability in selectedPluginDetail.summary.capabilities" :key="capability" class="directory-chip">{{ capability }}</span>
                </div>
              </div>

              <div class="directory-detail-grid">
                <div v-if="selectedPluginDetail.apps.length > 0" class="directory-detail-block">
                  <h4 class="directory-detail-heading">Apps</h4>
                  <div v-for="app in selectedPluginDetail.apps" :key="app.id" class="directory-include-row">
                    <span>{{ app.name }}</span>
                    <span v-if="isPluginDetailAppUnavailable(app)" class="directory-auth-status is-warning">GPT Plus account required</span>
                    <button v-else-if="app.installUrl" type="button" @click="openExternalUrl(app.installUrl)">{{ app.needsAuth ? 'Login' : 'Manage' }}</button>
                  </div>
                </div>
                <div v-if="selectedPluginDetail.skills.length > 0" class="directory-detail-block">
                  <h4 class="directory-detail-heading">Skills</h4>
                  <p class="directory-mini-list">{{ selectedPluginDetail.skills.map((skill) => skill.displayName || skill.name).join(', ') }}</p>
                </div>
                <div v-if="selectedPluginDetail.mcpServers.length > 0" class="directory-detail-block">
                  <h4 class="directory-detail-heading">MCP servers</h4>
                  <div v-for="serverName in selectedPluginDetail.mcpServers" :key="serverName" class="directory-include-row">
                    <span>
                      {{ serverName }}
                      <span class="directory-auth-status" :class="mcpAuthStatusClass(serverName)">
                        {{ formatMcpAuthStatus(serverName) }}
                      </span>
                    </span>
                    <button
                      v-if="shouldShowMcpLogin(serverName)"
                      type="button"
                      :disabled="mcpLoginServerName === serverName"
                      @click="loginMcpServer(serverName)"
                    >
                      {{ mcpLoginServerName === serverName ? 'Opening...' : 'Authenticate' }}
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="selectedPluginScreenshots.length > 0" class="directory-screenshots">
                <img v-for="src in selectedPluginScreenshots" :key="src" :src="src" alt="" loading="lazy" />
              </div>

              <div v-if="installAuthApps.length > 0" class="directory-auth-panel">
                <strong>Apps needing auth</strong>
                <div v-for="app in installAuthApps" :key="app.id" class="directory-include-row">
                  <span>{{ app.name }}</span>
                  <button v-if="app.installUrl" type="button" @click="openExternalUrl(app.installUrl)">Login</button>
                </div>
              </div>
            </template>
          </div>

          <div class="directory-modal-footer">
            <button
              v-if="selectedPlugin && selectedPlugin.installed"
              class="directory-action danger"
              type="button"
              :disabled="isPluginActionInFlight"
              @click="uninstallSelectedPlugin"
            >
              {{ isPluginActionInFlight ? 'Uninstalling...' : 'Uninstall' }}
            </button>
            <button
              v-else-if="selectedPlugin && !selectedPluginInstallUnavailable"
              class="directory-action primary"
              type="button"
              :disabled="isPluginActionInFlight || selectedPlugin.installPolicy === 'NOT_AVAILABLE' || selectedPluginRequiresMissingApp"
              @click="installSelectedPlugin"
            >
              {{ selectedPluginRequiresMissingApp ? 'ChatGPT Plus' : isPluginActionInFlight ? 'Installing...' : 'Install' }}
            </button>
            <button
              v-else-if="selectedPlugin"
              class="directory-action"
              type="button"
              disabled
            >
              GPT Plus account required
            </button>
            <button
              v-if="selectedPlugin && selectedPlugin.installed"
              class="directory-action"
              type="button"
              :disabled="isPluginActionInFlight"
              @click="toggleSelectedPlugin"
            >
              {{ selectedPlugin.enabled ? 'Disable' : 'Enable' }}
            </button>
          </div>
        </article>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="isComposioDetailOpen" class="directory-modal-overlay" @click.self="closeComposioDetail">
        <article class="directory-modal">
          <div class="directory-modal-header">
            <div class="directory-card-top">
              <img
                v-if="selectedComposioDetail?.connector.logoUrl"
                class="directory-card-icon"
                :src="selectedComposioDetail.connector.logoUrl"
                :alt="selectedComposioDetail.connector.name"
                loading="lazy"
              />
              <div v-else class="directory-card-fallback composio-fallback">{{ selectedComposioDetail?.connector.name.charAt(0) }}</div>
              <div class="directory-card-main">
                <h3 class="directory-modal-title">{{ selectedComposioDetail?.connector.name || 'Composio' }}</h3>
                <span class="directory-card-meta">{{ selectedComposioDetail ? composioMetaLabel(selectedComposioDetail.connector) : 'Connector' }}</span>
              </div>
            </div>
            <button class="directory-modal-close" type="button" aria-label="Close Composio detail" @click="closeComposioDetail">Close</button>
          </div>

          <div class="directory-modal-body">
            <div v-if="composioDetailError" class="directory-error">{{ composioDetailError }}</div>
            <div v-else-if="isLoadingComposioDetail" class="directory-loading">Loading connector...</div>
            <template v-else-if="selectedComposioDetail">
              <p v-if="selectedComposioDetail.connector.description" class="directory-detail-description">
                {{ selectedComposioDetail.connector.description }}
              </p>

              <div class="directory-detail-block">
                <h4 class="directory-detail-heading">Examples</h4>
                <div class="directory-chip-row directory-example-chip-row">
                  <button
                    v-for="example in composioExampleChips(selectedComposioDetail.connector)"
                    :key="example"
                    class="directory-chip directory-example-chip"
                    type="button"
                    :disabled="!canTryComposio(selectedComposioDetail.connector) || isTryActionInFlight"
                    :title="canTryComposio(selectedComposioDetail.connector) ? `Start: ${example}` : 'Connect this connector to run examples'"
                    @click="tryComposio(selectedComposioDetail.connector, selectedComposioDetail.connections, example)"
                  >
                    {{ props.tryInFlightKey === composioTryKey(selectedComposioDetail.connector.slug, example) ? 'Starting...' : example }}
                  </button>
                </div>
              </div>

              <div class="directory-detail-grid">
                <div class="directory-detail-block">
                  <h4 class="directory-detail-heading">Overview</h4>
                  <div class="directory-chip-row">
                    <span class="directory-chip">{{ selectedComposioDetail.connector.toolsCount }} tools</span>
                    <span v-if="selectedComposioDetail.connector.triggersCount > 0" class="directory-chip">{{ selectedComposioDetail.connector.triggersCount }} triggers</span>
                    <span v-if="selectedComposioDetail.connector.latestVersion" class="directory-chip">v{{ selectedComposioDetail.connector.latestVersion }}</span>
                    <span v-if="selectedComposioDetail.connector.authModes.length > 0" class="directory-chip">{{ selectedComposioDetail.connector.authModes.join(', ') }}</span>
                  </div>
                </div>

                <div class="directory-detail-block">
                  <h4 class="directory-detail-heading">Connections</h4>
                  <div v-if="selectedComposioDetail.connections.length === 0" class="directory-mini-list">
                    No linked accounts yet.
                  </div>
                  <div v-else>
                    <div v-for="connection in selectedComposioDetail.connections" :key="connection.id" class="directory-include-row">
                      <span>
                        {{ connection.alias || connection.wordId || connection.id }}
                        <span class="directory-auth-status" :class="composioConnectionStatusClass(connection.status)">
                          {{ composioConnectionStatusLabel(connection.status) }}
                        </span>
                      </span>
                      <span class="directory-card-meta">{{ connection.authScheme || 'Auth' }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="selectedComposioDetail.tools.length > 0" class="directory-detail-block">
                <h4 class="directory-detail-heading">Useful tools</h4>
                <div v-for="tool in selectedComposioDetail.tools.slice(0, 8)" :key="tool.slug" class="directory-include-row">
                  <span>{{ tool.name || tool.slug }}</span>
                  <span class="directory-card-meta">{{ tool.slug }}</span>
                </div>
              </div>
            </template>
          </div>

          <div class="directory-modal-footer">
            <button
              v-if="selectedComposioDetail"
              class="directory-action-link"
              type="button"
              @click="openExternalUrl(selectedComposioDetail.dashboardUrl)"
            >
              Open dashboard
            </button>
            <button
              v-if="selectedComposioDetail && composioPrimaryActionLabel(selectedComposioDetail.connector)"
              class="directory-action"
              type="button"
              :disabled="composioActionSlug === selectedComposioDetail.connector.slug"
              @click="runComposioPrimaryAction(selectedComposioDetail.connector)"
            >
              {{ composioActionSlug === selectedComposioDetail?.connector.slug ? 'Opening...' : composioPrimaryActionLabel(selectedComposioDetail.connector) }}
            </button>
          </div>
        </article>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getDirectoryComposioStatus,
  getMethodCatalog,
  installDirectoryPlugin,
  installDirectoryComposioCli,
  listDirectoryComposioConnectors,
  listDirectoryApps,
  listDirectoryMcpServers,
  listDirectoryPlugins,
  readDirectoryComposioConnector,
  readDirectoryPlugin,
  reloadDirectoryMcpServers,
  setDirectoryAppEnabled,
  setDirectoryPluginEnabled,
  startDirectoryComposioCliLogin,
  startDirectoryComposioLogin,
  startDirectoryMcpLogin,
  uninstallDirectoryPlugin,
  type DirectoryAppInfo,
  type DirectoryComposioConnection,
  type DirectoryComposioConnector,
  type DirectoryComposioConnectorDetail,
  type DirectoryComposioStatus,
  type DirectoryMcpServerStatus,
  type DirectoryPluginAppSummary,
  type DirectoryPluginDetail,
  type DirectoryPluginSummary,
} from '../../api/codexGateway'
import { sortComposioConnectors, type DirectorySortMode } from './directoryHubUtils'
import SkillsHub from './SkillsHub.vue'

type DirectoryTab = 'plugins' | 'apps' | 'composio' | 'skills'
const COMPOSIO_SKILL_PATH = '/Users/igor/.codex/skills/shared_skills/composio-cli/SKILL.md'
const COMPOSIO_PAGE_LIMIT = 50

const POPULAR_LIMIT = 100
const POPULAR_PLUGIN_TOP_20: Array<[RegExp, number]> = [
  [/^gmail$/i, 20],
  [/^google calendar$/i, 19],
  [/^google drive$/i, 18],
  [/^google docs$/i, 17],
  [/^google sheets$/i, 16],
  [/^notion$/i, 15],
  [/^obsidian$/i, 14],
  [/^reddit$/i, 13],
  [/^(x|twitter)$/i, 12],
  [/^youtube$/i, 11],
  [/^instagram$/i, 10],
  [/^tiktok$/i, 9],
  [/^facebook$/i, 8],
  [/^linkedin$/i, 7],
  [/^slack$/i, 6],
  [/^canva$/i, 5],
  [/^figma$/i, 4],
  [/^dropbox$/i, 3],
  [/^outlook email$/i, 2],
  [/^spotify$/i, 1],
]
const POPULAR_APP_TOP_20: Array<[RegExp, number]> = [
  [/^gmail$/i, 20],
  [/^google calendar$/i, 19],
  [/^google drive$/i, 18],
  [/^google docs$/i, 17],
  [/^google sheets$/i, 16],
  [/^notion$/i, 15],
  [/^obsidian$/i, 14],
  [/^reddit$/i, 13],
  [/^(x|twitter)$/i, 12],
  [/^youtube$/i, 11],
  [/^instagram$/i, 10],
  [/^tiktok$/i, 9],
  [/^facebook$/i, 8],
  [/^linkedin$/i, 7],
  [/^slack$/i, 6],
  [/^canva$/i, 5],
  [/^figma$/i, 4],
  [/^dropbox$/i, 3],
  [/^outlook email$/i, 2],
  [/^spotify$/i, 1],
]
const POPULAR_APP_NAME_BONUSES: Array<[RegExp, number]> = [
  [/^gmail$/i, 30_000],
  [/^google calendar$/i, 29_500],
  [/^outlook( email| calendar)?$/i, 29_000],
  [/^google drive$/i, 28_500],
  [/^google docs$/i, 28_000],
  [/^google sheets$/i, 27_500],
  [/^dropbox$/i, 27_000],
  [/^box$/i, 26_500],
  [/^slack$/i, 26_000],
  [/^notion$/i, 25_500],
  [/^canva$/i, 25_000],
  [/^figma$/i, 24_500],
  [/^github$/i, 24_000],
  [/^trello$/i, 23_500],
  [/^asana$/i, 23_000],
  [/^basecamp$/i, 22_500],
  [/^clickup$/i, 22_000],
  [/^linear$/i, 21_500],
  [/^gitlab( issues)?$/i, 21_000],
  [/^jira$/i, 20_500],
  [/^zapier$/i, 20_000],
  [/^hubspot$/i, 19_500],
  [/^salesforce$/i, 19_000],
  [/^netlify$/i, 18_500],
  [/^vercel$/i, 18_000],
  [/^(spotify|youtube|netflix|hulu|disney|booking|expedia|uber|airbnb)$/i, 17_500],
]
const POPULAR_APP_KEYWORD_BONUSES: Array<[RegExp, number]> = [
  [/(email|mail|inbox|calendar|event|availability|contact|message|chat)/i, 450],
  [/(drive|document|docs|sheet|slide|file|storage|pdf|note|page)/i, 380],
  [/(image|design|presentation|diagram|video|audio|photo|media|music)/i, 320],
  [/(travel|flight|hotel|restaurant|recipe|food|shopping|delivery|map|weather)/i, 260],
  [/(learn|education|study|language|health|fitness|finance|budget)/i, 220],
  [/(task|project|issue|repository|deploy|database|crm|sales|support)/i, 120],
]
const POPULAR_PLUGIN_NAME_BONUSES: Array<[RegExp, number]> = [
  [/(browser|chrome|computer use|github|gitlab|linear|slack|notion|gmail|email|calendar|drive|figma|canva|cloudflare|terminal|filesystem)/i, 180],
  [/(web|docs|design|deploy|project|issue|search|database|outlook|teams|sharepoint|jira|vercel|netlify)/i, 75],
]
const PLUGIN_EXAMPLE_RULES: Array<{ pattern: RegExp; examples: string[] }> = [
  {
    pattern: /(gmail|email|outlook|mail|inbox)/i,
    examples: ['Make a VIP reply queue', 'Find invoices due this week', 'Draft no-thanks politely', 'List flight email changes', 'Archive promo clutter'],
  },
  {
    pattern: /(calendar|event|availability|meeting)/i,
    examples: ['Protect 3 focus blocks', 'Prep my 2pm meeting', 'Find lunch with Alex', 'Move double-booked calls', 'Show meetings without notes'],
  },
  {
    pattern: /(google drive|drive|dropbox|box|sharepoint|file|storage)/i,
    examples: ['Find Q4 budget files', 'Brief from client folder', 'Compare latest contract edits', 'List stale shared docs', 'Find deck with churn chart'],
  },
  {
    pattern: /(google docs|docs|document)/i,
    examples: ['Turn notes into PRD', 'Make a one-page brief', 'Extract decisions table', 'Rewrite as customer email', 'Add crisp section titles'],
  },
  {
    pattern: /(google sheets|sheets|spreadsheet|excel)/i,
    examples: ['Clean duplicate leads', 'Flag spend outliers', 'Build revenue pivot', 'Write margin formulas', 'Draft 3-line KPI readout'],
  },
  {
    pattern: /(notion|wiki|page)/i,
    examples: ['Make launch task board', 'Find stale onboarding pages', 'Turn meeting notes to tasks', 'Draft product spec page', 'Summarize open decisions'],
  },
  {
    pattern: /(obsidian|vault|second brain|pkm|notes)/i,
    examples: ['Roll up weekly daily notes', 'Link orphan notes to projects', 'Turn YouTube link into note', 'Extract task log entries', 'Create insight index'],
  },
  {
    pattern: /(reddit|subreddit)/i,
    examples: ['Find 10 SaaS complaints', 'Mine r/productivity questions', 'Spot pricing objections', 'Draft non-salesy reply', 'Track competitor pain posts'],
  },
  {
    pattern: /(x|twitter)/i,
    examples: ['Find angry launch replies', 'Draft 8-tweet teardown', 'Monitor brand mentions today', 'Turn blog into thread', 'Compare influencer takes'],
  },
  {
    pattern: /(youtube|tiktok|instagram|facebook|linkedin|shorts|reels)/i,
    examples: ['Turn video into X thread', 'Pull 20 comment hooks', 'Draft Reels caption set', 'Make LinkedIn carousel outline', 'Plan 7 Shorts ideas'],
  },
  {
    pattern: /(browser|web)/i,
    examples: ['Open a local URL', 'Click through a flow', 'Capture a screenshot', 'Inspect visible text', 'Verify mobile layout'],
  },
  {
    pattern: /(chrome)/i,
    examples: ['Use my Chrome session', 'Inspect current tab', 'Test logged-in page', 'Capture page state', 'Check extension UI'],
  },
  {
    pattern: /(computer use|desktop)/i,
    examples: ['Control a desktop app', 'Read window state', 'Click a toolbar', 'Fill a form', 'Verify a dialog'],
  },
  {
    pattern: /(github|gitlab|repository|pull request|issue)/i,
    examples: ['Review a pull request', 'Triage open issues', 'Check CI failures', 'Summarize commits', 'Draft a PR comment'],
  },
  {
    pattern: /(linear|jira|asana|trello|clickup|project|task)/i,
    examples: ['Find assigned issues', 'Summarize blockers', 'Create a task', 'Update issue status', 'Plan next sprint'],
  },
  {
    pattern: /(slack|teams|chat|message)/i,
    examples: ['Summarize a channel', 'Find mentions', 'Draft a reply', 'Search a thread', 'Post an update'],
  },
  {
    pattern: /(figma|canva|design|image|slide|presentation)/i,
    examples: ['Inspect a design', 'Create a mockup', 'Export assets', 'Compare variants', 'Draft presentation copy'],
  },
  {
    pattern: /(cloudflare|vercel|netlify|deploy|worker|hosting)/i,
    examples: ['Check deploy status', 'List recent builds', 'Inspect DNS records', 'Review logs', 'Publish an update'],
  },
  {
    pattern: /(terminal|shell|filesystem|file system|database|postgres|sqlite)/i,
    examples: ['Run a safe command', 'Search project files', 'Inspect database rows', 'Check disk usage', 'Summarize logs'],
  },
]
const POPULAR_MCP_NAME_BONUSES: Array<[RegExp, number]> = [
  [/(github|gitlab|linear|slack|notion|filesystem|browser|computer|web|postgres|sqlite|database)/i, 120],
  [/(search|drive|docs|calendar|terminal|shell|deploy|cloud|memory)/i, 55],
]
const props = defineProps<{
  cwd?: string
  threadId?: string
  tryInFlightKey?: string
}>()

export type DirectoryTryItemPayload = {
  kind: 'app' | 'plugin' | 'skill' | 'composio'
  name: string
  displayName: string
  skillPath?: string
  prompt?: string
  tryKey?: string
  attachedSkills?: Array<{ name: string; path: string }>
}

const emit = defineEmits<{
  'skills-changed': []
  'try-item': [payload: DirectoryTryItemPayload]
}>()

const route = useRoute()
const router = useRouter()

const tabs: Array<{ id: DirectoryTab; label: string; subtitle: string }> = [
  { id: 'plugins', label: 'Plugins', subtitle: 'Plugins make Codex work your way.' },
  { id: 'apps', label: 'Apps', subtitle: 'Connect Codex to external apps and services.' },
  { id: 'composio', label: 'Composio', subtitle: 'Browse Composio connectors, auth state, and ready-to-try integrations.' },
  { id: 'skills', label: 'Skills', subtitle: 'MCPs first, then installed skills and GitHub sync state.' },
]

const composioPreviewConnectors = [
  {
    name: 'Gmail',
    slug: 'gmail',
    initial: 'G',
    meta: 'Inbox, drafts, attachments',
    description: 'Find emails, summarize threads, draft replies, and pull attachment context into a chat.',
    chips: ['Email', 'Search', 'Drafts'],
  },
  {
    name: 'Google Calendar',
    slug: 'google-calendar',
    initial: 'C',
    meta: 'Events and availability',
    description: 'Check what is next, find open time, and turn follow-ups into calendar blocks.',
    chips: ['Events', 'Availability', 'Reminders'],
  },
  {
    name: 'Reddit',
    slug: 'reddit',
    initial: 'R',
    meta: 'Posts, comments, communities',
    description: 'Search communities, inspect posts, and prepare natural replies before posting.',
    chips: ['Search', 'Comments', 'Posts'],
  },
  {
    name: 'YouTube',
    slug: 'youtube',
    initial: 'Y',
    meta: 'Videos, channels, comments',
    description: 'Look up channel details, inspect video metadata, and help manage comment workflows.',
    chips: ['Videos', 'Channels', 'Comments'],
  },
  {
    name: 'Google Drive',
    slug: 'google-drive',
    initial: 'D',
    meta: 'Files, docs, folders',
    description: 'Find files, read shared docs, and bring Drive context into a Codex thread.',
    chips: ['Files', 'Docs', 'Search'],
  },
  {
    name: 'X',
    slug: 'x',
    initial: 'X',
    meta: 'Posts, replies, profiles',
    description: 'Research public posts, draft replies, and keep social workflows reviewable.',
    chips: ['Posts', 'Replies', 'Profiles'],
  },
]

function isDirectoryTab(value: unknown): value is DirectoryTab {
  return value === 'plugins' || value === 'apps' || value === 'composio' || value === 'skills'
}

function tabFromRoute(): DirectoryTab {
  return isDirectoryTab(route.query.tab) ? route.query.tab : 'skills'
}

const activeTab = ref<DirectoryTab>(tabFromRoute())
const methodSet = ref<Set<string>>(new Set())
const methodsLoaded = ref(false)
const plugins = ref<DirectoryPluginSummary[]>([])
const apps = ref<DirectoryAppInfo[]>([])
const composioStatus = ref<DirectoryComposioStatus | null>(null)
const composioConnectors = ref<DirectoryComposioConnector[]>([])
const composioNextCursor = ref<string | null>(null)
const composioTotal = ref(0)
const mcpServers = ref<DirectoryMcpServerStatus[]>([])
const pluginSortMode = ref<DirectorySortMode>('popular')
const appSortMode = ref<DirectorySortMode>('popular')
const composioSortMode = ref<DirectorySortMode>('popular')
const pluginSearchQuery = ref('')
const appSearchQuery = ref('')
const composioSearchQuery = ref('')
const isLoadingPlugins = ref(false)
const isLoadingApps = ref(false)
const isLoadingComposio = ref(false)
const isLoadingMcps = ref(false)
const isReloadingMcps = ref(false)
const isManualRefreshInFlight = ref(false)
const isMcpSectionOpen = ref(true)
const pluginError = ref('')
const appError = ref('')
const composioError = ref('')
const mcpError = ref('')
const selectedPlugin = ref<DirectoryPluginSummary | null>(null)
const selectedPluginDetail = ref<DirectoryPluginDetail | null>(null)
const isPluginDetailOpen = ref(false)
const isLoadingPluginDetail = ref(false)
const pluginDetailError = ref('')
const selectedComposioDetail = ref<DirectoryComposioConnectorDetail | null>(null)
const isComposioDetailOpen = ref(false)
const isLoadingComposioDetail = ref(false)
const composioDetailError = ref('')
const isInstallingComposio = ref(false)
const isStartingComposioLogin = ref(false)
const isPluginActionInFlight = ref(false)
const appActionId = ref('')
const composioActionSlug = ref('')
const installAuthApps = ref<DirectoryPluginAppSummary[]>([])
const mcpLoginServerName = ref('')
const expandedMcpNames = ref<Set<string>>(new Set())
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let composioSearchTimer: ReturnType<typeof setTimeout> | null = null
let isComposioLoadQueued = false
let pluginsLoadPromise: Promise<void> | null = null
let appsLoadPromise: Promise<void> | null = null
let pluginsLoadedKey = ''
let appsLoadedKey = ''

const activeCopy = computed(() => tabs.find((tab) => tab.id === activeTab.value) ?? tabs[0])
const supportsPlugins = computed(() =>
  !methodsLoaded.value ||
  ['plugin/list', 'plugin/read', 'plugin/install', 'plugin/uninstall'].every((method) => methodSet.value.has(method)),
)
const supportsApps = computed(() => !methodsLoaded.value || methodSet.value.has('app/list'))
const supportsMcps = computed(() => !methodsLoaded.value || methodSet.value.has('mcpServerStatus/list'))
const supportsMcpReload = computed(() => methodSet.value.has('config/mcpServer/reload'))
const supportsMcpLogin = computed(() => methodSet.value.has('mcpServer/oauth/login'))
const isTryActionInFlight = computed(() => (props.tryInFlightKey ?? '').length > 0)
const selectedPluginDescription = computed(() =>
  selectedPluginDetail.value?.description ||
  selectedPluginDetail.value?.summary.longDescription ||
  selectedPluginDetail.value?.summary.description ||
  '',
)
const selectedPluginScreenshots = computed(() => {
  const summary = selectedPluginDetail.value?.summary
  if (!summary) return []
  return [...summary.screenshotUrls, ...summary.screenshots.map(localAssetSrc)].filter(Boolean)
})
const selectedPluginRequiresMissingApp = computed(() => {
  const detailApps = selectedPluginDetail.value?.apps ?? []
  if (detailApps.length === 0) return false
  const availableApps = new Set<string>()
  for (const app of apps.value) {
    availableApps.add(app.id.trim().toLowerCase())
    availableApps.add(normalizePluginAppName(app.name))
  }
  return detailApps.some((app) => {
    const id = app.id.trim().toLowerCase()
    const name = normalizePluginAppName(app.name)
    const hasMatchingId = id.length > 0 && availableApps.has(id)
    const hasMatchingName = name.length > 0 && availableApps.has(name)
    return !hasMatchingId && !hasMatchingName
  })
})
const selectedPluginInstallUnavailable = computed(() =>
  selectedPlugin.value?.installPolicy === 'NOT_AVAILABLE' ||
  (selectedPluginDetail.value?.apps.some((app) => isPluginDetailAppUnavailable(app)) ?? false),
)
const visiblePlugins = computed(() => limitPopularRows(sortPlugins(filterPlugins(plugins.value, pluginSearchQuery.value), pluginSortMode.value), pluginSortMode.value, pluginSearchQuery.value))
const visibleApps = computed(() => limitPopularApps(sortApps(filterApps(apps.value, appSearchQuery.value), appSortMode.value), appSortMode.value, appSearchQuery.value))
const visibleComposioConnectors = computed(() => sortComposioConnectors(
  filterComposioConnectors(composioConnectors.value, composioSearchQuery.value),
  composioSortMode.value,
  composioSearchQuery.value,
))
const visibleComposioPreviewConnectors = computed(() => {
  const query = normalizeSearch(composioSearchQuery.value)
  if (!query) return composioPreviewConnectors
  return composioPreviewConnectors.filter((connector) => includesSearch([
    connector.name,
    connector.slug,
    connector.meta,
    connector.description,
    ...connector.chips,
  ], query))
})
const visibleMcpServers = computed(() => sortMcpServers(mcpServers.value, 'popular'))
const hasMoreComposioConnectors = computed(() => composioNextCursor.value !== null)
const mcpStatusByName = computed(() => new Map(mcpServers.value.map((server) => [server.name, server])))
const composioWorkspaceSummary = computed(() => {
  const status = composioStatus.value
  if (!status) return 'Composio CLI shares the login and connections from this machine.'
  const parts = [
    status.email || status.defaultOrgName,
    status.defaultOrgId ? `org ${status.defaultOrgId}` : '',
    status.baseUrl || '',
  ].filter(Boolean)
  return parts.join(' · ') || 'Composio CLI shares the login and connections from this machine.'
})

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

function normalizePluginAssociationKey(value: string): string {
  return normalizeSearch(value)
    .replace(/\s+\((synced|legacy)\)\s*$/iu, '')
    .replace(/\s+\(.*?\)\s*$/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\s+plugin$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function pluginAssociationKeys(...values: string[]): string[] {
  const keys = new Set<string>()
  for (const value of values) {
    const normalized = normalizePluginAssociationKey(value)
    if (!normalized) continue
    keys.add(normalized)
    keys.add(normalized.replace(/\s+/gu, ''))
  }
  return Array.from(keys)
}

function isUnavailableApp(app: DirectoryAppInfo): boolean {
  return !app.isAccessible && app.installUrl.trim().length === 0
}

function findDirectoryAppForPluginApp(app: DirectoryPluginAppSummary): DirectoryAppInfo | null {
  const id = app.id.trim()
  if (id) {
    const byId = apps.value.find((row) => row.id === id)
    if (byId) return byId
  }
  const appKeys = pluginAssociationKeys(app.name)
  return apps.value.find((row) => pluginAssociationKeys(row.name).some((key) => appKeys.includes(key))) ?? null
}

function isPluginDetailAppUnavailable(app: DirectoryPluginAppSummary): boolean {
  const directoryApp = findDirectoryAppForPluginApp(app)
  if (directoryApp) return isUnavailableApp(directoryApp)
  return app.needsAuth && app.installUrl.trim().length === 0
}

function includesSearch(parts: Array<string | null | undefined>, query: string): boolean {
  const normalized = normalizeSearch(query)
  if (!normalized) return true
  return parts.some((part) => part?.toLowerCase().includes(normalized))
}

function addExampleChip(chips: string[], seen: Set<string>, value: string): void {
  const chip = value.trim()
  if (!chip) return
  const key = chip.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  chips.push(chip)
}

function pluginExampleSource(plugin: DirectoryPluginSummary): string {
  return [
    plugin.displayName,
    plugin.name,
    plugin.description,
    plugin.longDescription,
    plugin.category,
    plugin.developerName,
    plugin.capabilities.join(' '),
  ].join(' ')
}

function exampleChipsFromSource(source: string, fallbackLabel: string, fallbackValues: string[] = []): string[] {
  const chips: string[] = []
  const seen = new Set<string>()

  for (const rule of PLUGIN_EXAMPLE_RULES) {
    if (!rule.pattern.test(source)) continue
    for (const example of rule.examples) addExampleChip(chips, seen, example)
    if (chips.length >= 5) return chips.slice(0, 5)
  }

  for (const value of fallbackValues) {
    addExampleChip(chips, seen, value.replace(/[.!?]\s*$/u, ''))
    if (chips.length >= 5) return chips.slice(0, 5)
  }

  addExampleChip(chips, seen, `Explore ${fallbackLabel}`)
  addExampleChip(chips, seen, 'Show available actions')
  addExampleChip(chips, seen, 'Run a safe check')
  addExampleChip(chips, seen, 'Summarize current state')
  addExampleChip(chips, seen, 'Suggest next steps')
  return chips.slice(0, 5)
}

function pluginExampleChips(plugin: DirectoryPluginSummary): string[] {
  const chips = exampleChipsFromSource(pluginExampleSource(plugin), plugin.displayName, plugin.defaultPrompt)
  if (chips.length >= 5) return chips
  const seen = new Set(chips.map((chip) => chip.toLowerCase()))
  for (const capability of plugin.capabilities) {
    addExampleChip(chips, seen, `Try ${capability}`)
    if (chips.length >= 5) return chips.slice(0, 5)
  }
  return chips.slice(0, 5)
}

function appExampleChips(app: DirectoryAppInfo): string[] {
  return exampleChipsFromSource([
    app.name,
    app.description,
    app.category,
    app.developer,
    app.distributionChannel,
    app.pluginDisplayNames.join(' '),
  ].join(' '), app.name)
}

function composioExampleChips(connector: DirectoryComposioConnector): string[] {
  return exampleChipsFromSource([
    connector.name,
    connector.slug,
    connector.description,
    connector.authModes.join(' '),
    connector.connectionStatuses.join(' '),
  ].join(' '), connector.name)
}

function bonusForName(name: string, rows: Array<[RegExp, number]>): number {
  return rows.reduce((score, [pattern, bonus]) => score + (pattern.test(name) ? bonus : 0), 0)
}

function normalizePopularRankName(name: string): string {
  return normalizeAppNameForRanking(name)
    .replace(/[-_]+/gu, ' ')
    .replace(/\s+plugin$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function pinnedPopularRank(name: string, rows: Array<[RegExp, number]>): number {
  const normalized = normalizePopularRankName(name)
  const match = rows.find(([pattern]) => pattern.test(normalized))
  return match?.[1] ?? 0
}

function normalizeAppNameForRanking(name: string): string {
  return name
    .replace(/\s+\((synced|legacy)\)\s*$/iu, '')
    .replace(/\s+\(.*?\)\s*$/u, '')
    .trim()
}

function normalizePluginAppName(name: string): string {
  return normalizeAppNameForRanking(name).toLowerCase()
}

function formatDistributionChannel(value: string): string {
  if (value === 'DEFAULT_OAI_CATALOG') return 'OpenAI catalog'
  if (value === 'ECOSYSTEM_DIRECTORY') return 'Ecosystem directory'
  return value ? value.replace(/_/gu, ' ').toLowerCase().replace(/\b\w/gu, (char) => char.toUpperCase()) : ''
}

function appMetaLabel(app: DirectoryAppInfo): string {
  return app.developer || formatDistributionChannel(app.distributionChannel) || 'App'
}

function getMcpAuthStatus(serverName: string): string {
  return mcpStatusByName.value.get(serverName)?.authStatus ?? 'unknown'
}

function formatMcpAuthStatus(serverName: string): string {
  const status = getMcpAuthStatus(serverName)
  if (status === 'oAuth') return 'Logged in'
  if (status === 'bearerToken') return 'Bearer token'
  if (status === 'notLoggedIn') return 'Login required'
  if (status === 'unsupported') return 'Auth unsupported'
  return 'Status unknown'
}

function mcpAuthStatusClass(serverName: string): string {
  const status = getMcpAuthStatus(serverName)
  if (status === 'oAuth' || status === 'bearerToken') return 'is-ok'
  if (status === 'notLoggedIn') return 'is-warning'
  return 'is-muted'
}

function mcpCardBadgeClass(status: string): string {
  if (status === 'oAuth' || status === 'bearerToken') return 'mcp-skill-badge-ok'
  if (status === 'notLoggedIn') return 'mcp-skill-badge-warning'
  return 'mcp-skill-badge-muted'
}

function shouldShowMcpLogin(serverName: string): boolean {
  return supportsMcpLogin.value && getMcpAuthStatus(serverName) === 'notLoggedIn'
}

function limitPopularRows<T>(rows: T[], sortMode: DirectorySortMode, query: string): T[] {
  return sortMode === 'popular' && normalizeSearch(query).length === 0 ? rows.slice(0, POPULAR_LIMIT) : rows
}

function limitPopularApps(rows: DirectoryAppInfo[], sortMode: DirectorySortMode, query: string): DirectoryAppInfo[] {
  if (sortMode !== 'popular' || normalizeSearch(query).length > 0) return rows
  const seen = new Set<string>()
  const uniqueRows: DirectoryAppInfo[] = []
  for (const app of rows) {
    const key = normalizeAppNameForRanking(app.name).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    uniqueRows.push(app)
    if (uniqueRows.length >= POPULAR_LIMIT) break
  }
  return uniqueRows
}

function filterPlugins(rows: DirectoryPluginSummary[], query: string): DirectoryPluginSummary[] {
  return rows.filter((plugin) => includesSearch([
    plugin.displayName,
    plugin.name,
    plugin.description,
    plugin.developerName,
    plugin.category,
    plugin.marketplaceDisplayName,
    ...plugin.capabilities,
    ...plugin.defaultPrompt,
    ...pluginExampleChips(plugin),
  ], query))
}

function filterApps(rows: DirectoryAppInfo[], query: string): DirectoryAppInfo[] {
  return rows.filter((app) => includesSearch([
    app.name,
    app.description,
    app.developer,
    app.category,
    app.distributionChannel,
    ...app.pluginDisplayNames,
    ...appExampleChips(app),
  ], query))
}

function filterComposioConnectors(rows: DirectoryComposioConnector[], query: string): DirectoryComposioConnector[] {
  return rows.filter((connector) => includesSearch([
    connector.name,
    connector.slug,
    connector.description,
    ...connector.authModes,
    ...connector.connectionStatuses,
    ...composioExampleChips(connector),
  ], query))
}

function pluginPopularScore(plugin: DirectoryPluginSummary): number {
  const pinnedRank = Math.max(
    pinnedPopularRank(plugin.displayName, POPULAR_PLUGIN_TOP_20),
    pinnedPopularRank(plugin.name, POPULAR_PLUGIN_TOP_20),
  )
  if (pinnedRank > 0) return 1_000_000 + pinnedRank
  return (
    (plugin.installed ? 500 : 0) +
    (plugin.enabled ? 40 : 0) +
    (plugin.developerName.toLowerCase().includes('openai') ? 140 : 0) +
    (plugin.sourceType === 'local' ? 80 : 0) +
    (plugin.capabilities.length * 12) +
    bonusForName(`${plugin.displayName} ${plugin.name} ${plugin.description} ${plugin.category}`, POPULAR_PLUGIN_NAME_BONUSES)
  )
}

function appPopularScore(app: DirectoryAppInfo): number {
  const normalizedName = normalizeAppNameForRanking(app.name)
  const pinnedRank = pinnedPopularRank(normalizedName, POPULAR_APP_TOP_20)
  if (pinnedRank > 0) return 1_000_000 + pinnedRank
  return (
    (app.isAccessible ? 10_000 : 0) +
    bonusForName(normalizedName, POPULAR_APP_NAME_BONUSES) +
    (app.pluginDisplayNames.length > 0 ? 260 : 0) +
    (app.distributionChannel === 'DEFAULT_OAI_CATALOG' ? 120 : 0) +
    (app.isEnabled ? 40 : 0) +
    (app.installUrl ? 20 : 0) +
    bonusForName(`${app.name} ${app.description} ${app.category} ${app.pluginDisplayNames.join(' ')}`, POPULAR_APP_KEYWORD_BONUSES) -
    (app.catalogRank * 0.001)
  )
}

function mcpPopularScore(server: DirectoryMcpServerStatus): number {
  return (
    (server.authStatus === 'oAuth' ? 180 : 0) +
    (server.authStatus === 'bearerToken' ? 140 : 0) +
    Math.min(server.tools.length, 50) * 6 +
    Math.min(server.resources.length + server.resourceTemplates.length, 30) * 3 +
    bonusForName(server.name, POPULAR_MCP_NAME_BONUSES)
  )
}

function sortPlugins(rows: DirectoryPluginSummary[], sortMode: DirectorySortMode): DirectoryPluginSummary[] {
  if (sortMode === 'name') return [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName))
  if (sortMode === 'date') return [...rows]
  return [...rows].sort((a, b) => (pluginPopularScore(b) - pluginPopularScore(a)) || a.displayName.localeCompare(b.displayName))
}

function sortApps(rows: DirectoryAppInfo[], sortMode: DirectorySortMode): DirectoryAppInfo[] {
  if (sortMode === 'name') return [...rows].sort((a, b) => a.name.localeCompare(b.name))
  if (sortMode === 'date') return [...rows].sort((a, b) => a.catalogRank - b.catalogRank)
  return [...rows].sort((a, b) => (appPopularScore(b) - appPopularScore(a)) || a.name.localeCompare(b.name))
}

function sortMcpServers(rows: DirectoryMcpServerStatus[], sortMode: DirectorySortMode): DirectoryMcpServerStatus[] {
  if (sortMode === 'name') return [...rows].sort((a, b) => a.name.localeCompare(b.name))
  if (sortMode === 'date') return [...rows]
  return [...rows].sort((a, b) => (mcpPopularScore(b) - mcpPopularScore(a)) || a.name.localeCompare(b.name))
}

function showToast(text: string, type: 'success' | 'error' = 'success'): void {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

function localAssetSrc(path: string): string {
  if (!path) return ''
  if (path.startsWith('connectors://')) return `/codex-api/connector-logo?src=${encodeURIComponent(path)}`
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  if (!path.startsWith('/')) return ''
  return `/codex-local-image?path=${encodeURIComponent(path)}`
}

function pluginIconSrc(plugin: DirectoryPluginSummary | null): string {
  if (!plugin) return ''
  return plugin.logoUrl || localAssetSrc(plugin.logoPath) || plugin.composerIconUrl || localAssetSrc(plugin.composerIconPath)
}

function appLogoSrc(app: DirectoryAppInfo): string {
  return localAssetSrc(app.logoUrlDark || app.logoUrl)
}

function composioMetaLabel(connector: DirectoryComposioConnector): string {
  if (connector.activeCount > 0) {
    return `${connector.activeCount} connected ${connector.activeCount === 1 ? 'account' : 'accounts'}`
  }
  if (connector.isNoAuth) return 'No auth required'
  if (connector.connectionStatuses.length > 0) return connector.connectionStatuses.join(', ')
  return connector.authModes.join(', ') || 'Connection required'
}

function composioHasUsableConnection(connector: DirectoryComposioConnector): boolean {
  return connector.isNoAuth || connector.activeCount > 0
}

function composioPrimaryActionLabel(connector: DirectoryComposioConnector): string {
  if (connector.isNoAuth) return ''
  if (connector.activeCount > 0) return 'Manage'
  if (connector.totalConnections > 0) return 'Reconnect'
  return 'Connect'
}

function composioConnectionStatusLabel(status: string): string {
  const normalized = status.trim().toUpperCase()
  if (normalized === 'ACTIVE') return 'Active'
  if (normalized === 'EXPIRED') return 'Expired'
  if (normalized === 'FAILED') return 'Failed'
  if (normalized === 'INITIATED') return 'Pending'
  return normalized || 'Unknown'
}

function composioConnectionStatusClass(status: string): string {
  const normalized = status.trim().toUpperCase()
  if (normalized === 'ACTIVE') return 'is-ok'
  if (normalized === 'INITIATED') return 'is-warning'
  if (normalized === 'EXPIRED' || normalized === 'FAILED') return 'is-error'
  return 'is-muted'
}

function appTryKey(app: DirectoryAppInfo, example = ''): string {
  return `app:${app.id}:${example}`
}

function canTryApp(app: DirectoryAppInfo): boolean {
  return app.isAccessible && app.isEnabled
}

function buildExamplePrompt(displayName: string, itemType: string, example: string): string {
  const label = displayName.trim()
  const task = example.trim()
  if (!task) return `Test ${label} ${itemType}. Give me a list of what it can do and one useful example.`
  return `Use ${label} ${itemType} to do this concrete task: ${task}. Do not ask me to fill in placeholders first; inspect what is available, make reasonable assumptions, and show the result or the exact next action you took.`
}

function tryApp(app: DirectoryAppInfo, example = ''): void {
  if (isTryActionInFlight.value) return
  if (!canTryApp(app)) return
  emit('try-item', {
    kind: 'app',
    name: app.id,
    displayName: app.name,
    prompt: buildExamplePrompt(app.name, 'app', example),
    tryKey: appTryKey(app, example),
  })
}

function pluginTryKey(plugin: DirectoryPluginSummary, example = ''): string {
  return `plugin:${plugin.name}:${example}`
}

function composioTryKey(slug: string, example = ''): string {
  return `composio:${slug}:${example}`
}

function canTryPlugin(plugin: DirectoryPluginSummary): boolean {
  return plugin.installed && plugin.enabled
}

function tryPlugin(plugin: DirectoryPluginSummary, example = ''): void {
  if (isTryActionInFlight.value) return
  if (!canTryPlugin(plugin)) return
  emit('try-item', {
    kind: 'plugin',
    name: plugin.name,
    displayName: plugin.displayName,
    prompt: buildExamplePrompt(plugin.displayName, 'plugin', example),
    tryKey: pluginTryKey(plugin, example),
  })
}

function canTryComposio(connector: DirectoryComposioConnector): boolean {
  return composioHasUsableConnection(connector)
}

function buildComposioTryPrompt(connector: DirectoryComposioConnector, connections: DirectoryComposioConnection[] = [], example = ''): string {
  const firstActive = connections.find((connection) => connection.status === 'ACTIVE' && !connection.isDisabled)
  const accountHint = firstActive?.wordId
    ? ` If there are multiple accounts, prefer \`${firstActive.wordId}\`.`
    : ''
  const task = example.trim()
  if (task) {
    return `Use the Composio CLI skill with the ${connector.name} connector (${connector.slug}) to do this concrete task: ${task}. Do not ask me to fill in placeholders first; inspect available tools/connections, make reasonable assumptions, and show the result or the exact next action you took.${accountHint}`
  }
  return `Use the Composio CLI skill with the ${connector.name} connector (${connector.slug}). Start by listing what it can do here, mention the current connection status, and suggest one safe command I can run now.${accountHint}`
}

function tryComposio(connector: DirectoryComposioConnector, connections: DirectoryComposioConnection[] = [], example = ''): void {
  if (isTryActionInFlight.value) return
  if (!canTryComposio(connector)) return
  emit('try-item', {
    kind: 'composio',
    name: connector.slug,
    displayName: connector.name,
    prompt: buildComposioTryPrompt(connector, connections, example),
    tryKey: composioTryKey(connector.slug, example),
    attachedSkills: [{ name: 'composio-cli', path: COMPOSIO_SKILL_PATH }],
  })
}

function openExternalUrl(rawUrl: string): void {
  const url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) return
  window.location.assign(url)
}

function openFirstAppLoginIfNeeded(apps: DirectoryPluginAppSummary[]): boolean {
  const app = apps.find((row) => row.needsAuth && row.installUrl.trim().length > 0)
  if (!app) return false
  openExternalUrl(app.installUrl)
  return true
}

function fallbackStyle(plugin: DirectoryPluginSummary): Record<string, string> {
  return plugin.brandColor ? { backgroundColor: plugin.brandColor, color: '#fff' } : {}
}

async function loadMethods(): Promise<void> {
  try {
    methodSet.value = new Set(await getMethodCatalog())
  } catch {
    methodSet.value = new Set()
  } finally {
    methodsLoaded.value = true
  }
}

async function loadPlugins(force = false): Promise<void> {
  if (!supportsPlugins.value) return
  const key = props.cwd?.trim() || ''
  if (!force && pluginsLoadedKey === key && plugins.value.length > 0 && !pluginError.value) return
  if (pluginsLoadPromise) return pluginsLoadPromise
  pluginsLoadPromise = (async () => {
    isLoadingPlugins.value = true
    pluginError.value = ''
    try {
      const [nextPlugins] = await Promise.all([
        listDirectoryPlugins(key ? [key] : undefined, { force }),
        supportsApps.value ? loadApps(force) : Promise.resolve(),
      ])
      plugins.value = nextPlugins
      pluginsLoadedKey = key
    } catch (error) {
      pluginError.value = error instanceof Error ? error.message : 'Failed to load plugins'
    } finally {
      isLoadingPlugins.value = false
      pluginsLoadPromise = null
    }
  })()
  return pluginsLoadPromise
}

async function loadApps(force = false): Promise<void> {
  if (!supportsApps.value) return
  const key = props.threadId?.trim() || ''
  if (!force && appsLoadedKey === key && apps.value.length > 0 && !appError.value) return
  if (appsLoadPromise) return appsLoadPromise
  appsLoadPromise = (async () => {
    isLoadingApps.value = true
    appError.value = ''
    try {
      apps.value = await listDirectoryApps(key || undefined, { force })
      appsLoadedKey = key
    } catch (error) {
      appError.value = error instanceof Error ? error.message : 'Failed to load apps'
    } finally {
      isLoadingApps.value = false
      appsLoadPromise = null
    }
  })()
  return appsLoadPromise
}

async function loadComposio(append = false, force = false): Promise<void> {
  if (isLoadingComposio.value) {
    isComposioLoadQueued = true
    return
  }

  isLoadingComposio.value = true
  composioError.value = ''
  try {
    const status = await getDirectoryComposioStatus({ force })
    composioStatus.value = status
    if (!status.available || !status.authenticated) {
      composioConnectors.value = []
      composioNextCursor.value = null
      composioTotal.value = 0
      return
    }
    const cursor = append ? composioNextCursor.value : null
    const page = await listDirectoryComposioConnectors(composioSearchQuery.value, cursor, COMPOSIO_PAGE_LIMIT, { force })
    composioConnectors.value = append ? [...composioConnectors.value, ...page.data] : page.data
    composioNextCursor.value = page.nextCursor
    composioTotal.value = page.total
  } catch (error) {
    composioError.value = error instanceof Error ? error.message : 'Failed to load Composio connectors'
    composioConnectors.value = []
    composioNextCursor.value = null
    composioTotal.value = 0
  } finally {
    isLoadingComposio.value = false
    if (isComposioLoadQueued) {
      isComposioLoadQueued = false
      void loadComposio()
    }
  }
}

async function loadMoreComposio(): Promise<void> {
  if (!hasMoreComposioConnectors.value || isLoadingComposio.value) return
  await loadComposio(true)
}

async function loadMcps(): Promise<void> {
  if (!supportsMcps.value) return
  isLoadingMcps.value = true
  mcpError.value = ''
  try {
    mcpServers.value = await listDirectoryMcpServers()
  } catch (error) {
    mcpError.value = error instanceof Error ? error.message : 'Failed to load MCP servers'
  } finally {
    isLoadingMcps.value = false
  }
}

async function refreshMcpStatusesForPluginDetail(): Promise<void> {
  if (!supportsMcps.value || !selectedPluginDetail.value?.mcpServers.length) return
  try {
    mcpServers.value = await listDirectoryMcpServers()
  } catch {
    // Keep plugin detail usable even if status lookup is temporarily unavailable.
  }
}

function refreshActiveTab(forceReload = false): void {
  if (activeTab.value === 'plugins') void loadPlugins(forceReload)
  if (activeTab.value === 'apps') void loadApps(forceReload)
  if (activeTab.value === 'composio') void loadComposio(false, forceReload)
  if (activeTab.value === 'skills') {
    if (forceReload && supportsMcpReload.value) void reloadMcps()
    else void loadMcps()
  }
}

async function manualRefreshActiveTab(): Promise<void> {
  isManualRefreshInFlight.value = true
  try {
    if (activeTab.value === 'plugins') await loadPlugins(true)
    else if (activeTab.value === 'apps') await loadApps(true)
    else if (activeTab.value === 'composio') await loadComposio(false, true)
    else if (activeTab.value === 'skills' && supportsMcpReload.value) await reloadMcps()
    else if (activeTab.value === 'skills') await loadMcps()
  } finally {
    isManualRefreshInFlight.value = false
  }
}

async function openPluginDetail(plugin: DirectoryPluginSummary): Promise<void> {
  selectedPlugin.value = plugin
  selectedPluginDetail.value = null
  pluginDetailError.value = ''
  installAuthApps.value = []
  isPluginDetailOpen.value = true
  isLoadingPluginDetail.value = true
  try {
    selectedPluginDetail.value = await readDirectoryPlugin(plugin)
    selectedPlugin.value = selectedPluginDetail.value.summary
    if (supportsApps.value && apps.value.length === 0) await loadApps()
    await refreshMcpStatusesForPluginDetail()
  } catch (error) {
    pluginDetailError.value = error instanceof Error ? error.message : 'Failed to load plugin'
  } finally {
    isLoadingPluginDetail.value = false
  }
}

async function loginMcpServer(serverName: string): Promise<boolean> {
  if (!supportsMcpLogin.value) return false
  mcpLoginServerName.value = serverName
  try {
    const result = await startDirectoryMcpLogin(serverName)
    if (!result.authorizationUrl) {
      showToast(`No login URL returned for ${serverName}`, 'error')
      return false
    }
    openExternalUrl(result.authorizationUrl)
    return true
  } catch (error) {
    showToast(error instanceof Error ? error.message : `Failed to start login for ${serverName}`, 'error')
    return false
  } finally {
    mcpLoginServerName.value = ''
  }
}

async function openFirstMcpLoginIfNeeded(detail: DirectoryPluginDetail): Promise<void> {
  await refreshMcpStatusesForPluginDetail()
  const serverName = detail.mcpServers.find((name) => shouldShowMcpLogin(name))
  if (serverName) {
    await loginMcpServer(serverName)
  }
}

function closePluginDetail(): void {
  isPluginDetailOpen.value = false
}

async function openComposioDetail(slug: string): Promise<void> {
  isComposioDetailOpen.value = true
  isLoadingComposioDetail.value = true
  composioDetailError.value = ''
  selectedComposioDetail.value = null
  try {
    selectedComposioDetail.value = await readDirectoryComposioConnector(slug)
  } catch (error) {
    composioDetailError.value = error instanceof Error ? error.message : 'Failed to load Composio connector'
  } finally {
    isLoadingComposioDetail.value = false
  }
}

function closeComposioDetail(): void {
  isComposioDetailOpen.value = false
}

async function startComposioConnect(connector: DirectoryComposioConnector): Promise<void> {
  composioActionSlug.value = connector.slug
  try {
    const result = await startDirectoryComposioLogin(connector.slug)
    if (!result.redirectUrl) {
      showToast(`No login URL returned for ${connector.name}`, 'error')
      return
    }
    openExternalUrl(result.redirectUrl)
    showToast(`Opened ${connector.name} authorization`)
    await loadComposio(false, true)
    if (isComposioDetailOpen.value && selectedComposioDetail.value?.connector.slug === connector.slug) {
      await openComposioDetail(connector.slug)
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : `Failed to connect ${connector.name}`, 'error')
  } finally {
    composioActionSlug.value = ''
  }
}

async function runComposioPrimaryAction(connector: DirectoryComposioConnector): Promise<void> {
  if (connector.activeCount > 0 && composioStatus.value?.webUrl) {
    openExternalUrl(composioStatus.value.webUrl)
    return
  }
  await startComposioConnect(connector)
}

async function startComposioCliLogin(): Promise<void> {
  isStartingComposioLogin.value = true
  const loginTab = window.open('about:blank', '_blank')
  if (loginTab) {
    loginTab.opener = null
  }
  try {
    const result = await startDirectoryComposioCliLogin()
    if (result.loginUrl && loginTab) {
      loginTab.location.href = result.loginUrl
    } else if (result.loginUrl) {
      openExternalUrl(result.loginUrl)
    } else {
      loginTab?.close()
    }
    showToast('Composio CLI login started')
  } catch (error) {
    loginTab?.close()
    showToast(error instanceof Error ? error.message : 'Failed to start Composio login', 'error')
  } finally {
    isStartingComposioLogin.value = false
  }
}

async function installComposioCli(): Promise<void> {
  isInstallingComposio.value = true
  try {
    await installDirectoryComposioCli()
    showToast('Composio CLI installed')
    await loadComposio()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Failed to install Composio CLI', 'error')
  } finally {
    isInstallingComposio.value = false
  }
}

async function installSelectedPlugin(): Promise<void> {
  if (!selectedPlugin.value) return
  if (selectedPluginRequiresMissingApp.value) return
  isPluginActionInFlight.value = true
  try {
    const result = await installDirectoryPlugin(selectedPlugin.value)
    installAuthApps.value = result.appsNeedingAuth
    showToast(`${selectedPlugin.value.displayName} plugin installed`)
    const openedAppLogin = openFirstAppLoginIfNeeded(result.appsNeedingAuth)
    await loadPlugins(true)
    const updated = plugins.value.find((plugin) => plugin.id === selectedPlugin.value?.id)
    if (updated) {
      await openPluginDetail(updated)
      if (!openedAppLogin && selectedPluginDetail.value) {
        await openFirstMcpLoginIfNeeded(selectedPluginDetail.value)
      }
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Failed to install plugin', 'error')
  } finally {
    isPluginActionInFlight.value = false
  }
}

async function uninstallSelectedPlugin(): Promise<void> {
  if (!selectedPlugin.value) return
  isPluginActionInFlight.value = true
  try {
    const name = selectedPlugin.value.displayName
    await uninstallDirectoryPlugin(selectedPlugin.value.id)
    showToast(`${name} plugin uninstalled`)
    closePluginDetail()
    await loadPlugins(true)
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Failed to uninstall plugin', 'error')
  } finally {
    isPluginActionInFlight.value = false
  }
}

async function toggleSelectedPlugin(): Promise<void> {
  if (!selectedPlugin.value) return
  isPluginActionInFlight.value = true
  try {
    const next = !selectedPlugin.value.enabled
    await setDirectoryPluginEnabled(selectedPlugin.value.id, next)
    selectedPlugin.value = { ...selectedPlugin.value, enabled: next }
    if (selectedPluginDetail.value) {
      selectedPluginDetail.value = {
        ...selectedPluginDetail.value,
        summary: { ...selectedPluginDetail.value.summary, enabled: next },
      }
    }
    showToast(`${selectedPlugin.value.displayName} plugin ${next ? 'enabled' : 'disabled'}`)
    await loadPlugins(true)
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Failed to update plugin', 'error')
  } finally {
    isPluginActionInFlight.value = false
  }
}

async function toggleApp(app: DirectoryAppInfo): Promise<void> {
  appActionId.value = app.id
  try {
    const next = !app.isEnabled
    await setDirectoryAppEnabled(app.id, next)
    apps.value = apps.value.map((row) => row.id === app.id ? { ...row, isEnabled: next } : row)
    showToast(`${app.name} app ${next ? 'enabled' : 'disabled'}`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Failed to update app', 'error')
  } finally {
    appActionId.value = ''
  }
}

async function reloadMcps(): Promise<void> {
  isReloadingMcps.value = true
  try {
    await reloadDirectoryMcpServers()
    await loadMcps()
    showToast('MCP servers reloaded')
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Failed to reload MCP servers', 'error')
  } finally {
    isReloadingMcps.value = false
  }
}

function toggleMcpExpanded(name: string): void {
  const next = new Set(expandedMcpNames.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expandedMcpNames.value = next
}

watch(activeTab, (tab) => {
  if (route.name === 'skills' && route.query.tab !== tab) {
    void router.replace({ name: 'skills', query: { ...route.query, tab } })
  }
  refreshActiveTab()
})
watch(() => route.query.tab, () => {
  if (route.name !== 'skills') return
  const tab = tabFromRoute()
  if (activeTab.value !== tab) activeTab.value = tab
})
watch(composioSearchQuery, () => {
  if (activeTab.value !== 'composio') return
  composioConnectors.value = []
  composioNextCursor.value = null
  composioTotal.value = 0
  if (composioSearchTimer) {
    clearTimeout(composioSearchTimer)
  }
  composioSearchTimer = setTimeout(() => {
    void loadComposio()
  }, 250)
})
watch(() => props.cwd, () => {
  if (activeTab.value === 'plugins') void loadPlugins(true)
})
watch(() => props.threadId, () => {
  if (activeTab.value === 'apps' || activeTab.value === 'plugins') void loadApps()
})

onMounted(async () => {
  await loadMethods()
  refreshActiveTab()
})
</script>

<style scoped>
@reference "tailwindcss";

.directory-hub {
  @apply flex h-full w-full flex-col gap-3 overflow-y-auto p-3 sm:p-6;
}

.directory-header {
  @apply mx-auto flex w-full max-w-5xl items-start justify-between gap-3;
}

.directory-header-actions {
  @apply flex items-center gap-2;
}

.directory-title {
  @apply m-0 text-xl font-semibold text-zinc-900 sm:text-2xl;
}

.directory-subtitle {
  @apply m-0 mt-1 text-sm text-zinc-500;
}

.directory-refresh,
.directory-action,
.directory-action-link,
.directory-modal-close {
  @apply shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 no-underline transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50;
}

.directory-action.primary {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-black;
}

.directory-action.danger {
  @apply border-rose-600 bg-rose-600 text-white hover:bg-rose-700;
}

.directory-tabs {
  @apply mx-auto grid w-full max-w-5xl grid-cols-4 rounded-lg border border-zinc-200 bg-zinc-100 p-1;
}

.directory-tab {
  @apply rounded-md border-0 bg-transparent px-2 py-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-800;
}

.directory-tab.is-active {
  @apply bg-white text-zinc-900 shadow-sm;
}

.directory-section {
  @apply mx-auto flex w-full max-w-5xl flex-col gap-3;
}

.directory-section-group {
  @apply flex flex-col gap-3;
}

.skills-embedded-section {
  @apply flex flex-col gap-2;
}

.skills-embedded-toggle {
  @apply flex items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 cursor-pointer;
}

.skills-embedded-title {
  @apply text-sm font-medium;
}

.skills-embedded-chevron {
  @apply inline-block text-base leading-none transition-transform;
}

.skills-embedded-chevron.is-open {
  @apply rotate-90;
}

.skills-embedded-body {
  @apply flex flex-col gap-3;
}

.mcp-skill-grid {
  @apply grid grid-cols-1 gap-3 md:grid-cols-2;
}

.mcp-skill-card {
  @apply flex w-full flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300 hover:shadow-sm cursor-pointer;
}

.mcp-skill-card-top {
  @apply flex items-start gap-2.5;
}

.mcp-skill-avatar-fallback {
  @apply w-8 h-8 rounded-full shrink-0 bg-zinc-200 text-zinc-500 flex items-center justify-center text-xs font-medium uppercase;
}

.mcp-skill-info {
  @apply flex flex-col gap-0.5 min-w-0 flex-1;
}

.mcp-skill-header {
  @apply flex items-center gap-2;
}

.mcp-skill-name {
  @apply text-sm font-medium text-zinc-900 truncate;
}

.mcp-skill-owner {
  @apply text-xs text-zinc-400;
}

.mcp-skill-meta {
  @apply m-0 text-xs text-zinc-500;
}

.mcp-skill-chevron {
  @apply inline-block text-base leading-none text-zinc-400 transition-transform;
}

.mcp-skill-chevron.is-open {
  @apply rotate-90;
}

.mcp-skill-badge {
  @apply shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none border;
}

.mcp-skill-badge-ok {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.mcp-skill-badge-warning {
  @apply border-amber-200 bg-amber-50 text-amber-700;
}

.mcp-skill-badge-muted {
  @apply border-zinc-200 bg-zinc-100 text-zinc-500;
}

.directory-section-actions {
  @apply flex justify-end;
}

.directory-toolbar {
  @apply flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between;
}

.directory-search {
  @apply min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400;
}

.directory-sort-group {
  @apply inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-1;
}

.directory-sort-button {
  @apply rounded-md border-0 bg-transparent px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-800;
}

.directory-sort-button.is-active {
  @apply bg-white text-zinc-900 shadow-sm;
}

.directory-grid {
  @apply grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3;
}

.directory-list {
  @apply flex flex-col gap-3;
}

.directory-card {
  @apply flex min-h-36 flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300 hover:shadow-sm;
}

button.directory-card {
  @apply cursor-pointer;
}

.directory-card.is-disabled {
  @apply opacity-60;
}

.directory-card-wide {
  @apply min-h-0;
}

.directory-card-top {
  @apply flex min-w-0 items-start gap-3;
}

.directory-card-icon,
.directory-card-fallback {
  @apply flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 object-cover text-sm font-semibold uppercase text-zinc-500;
}

.directory-card-main {
  @apply min-w-0 flex-1;
}

.directory-card-title-row {
  @apply flex min-w-0 items-center gap-2;
}

.directory-card-title {
  @apply truncate text-sm font-semibold text-zinc-900;
}

.directory-card-meta {
  @apply mt-0.5 block truncate text-xs text-zinc-400;
}

.directory-card-description {
  @apply m-0 line-clamp-3 text-xs leading-relaxed text-zinc-500;
}

.directory-badge {
  @apply shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-700;
}

.directory-badge.is-muted {
  @apply border-zinc-200 bg-zinc-100 text-zinc-500;
}

.directory-chip-row {
  @apply flex flex-wrap gap-1.5;
}

.directory-chip {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500;
}

.directory-example-chip-row {
  @apply mt-auto;
}

.directory-example-chip {
  @apply cursor-pointer border-blue-100 bg-blue-50 text-blue-700 transition hover:border-blue-200 hover:bg-blue-100 hover:text-blue-800 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:opacity-70;
}

.directory-card-actions {
  @apply mt-auto flex items-center gap-2 pt-1;
}

.directory-loading,
.directory-empty,
.directory-error {
  @apply rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500;
}

.directory-empty-copy {
  @apply flex flex-col gap-3;
}

.directory-empty-text {
  @apply m-0;
}

.directory-error,
.directory-toast.is-error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.directory-auth-status.is-error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.directory-toast {
  @apply mx-auto w-full max-w-5xl rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700;
}

.directory-card-toggle {
  @apply flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left;
}

.directory-mcp-detail {
  @apply flex flex-col gap-3 border-t border-zinc-100 pt-3;
}

.directory-mini-heading,
.directory-detail-heading {
  @apply m-0 text-xs font-semibold text-zinc-700;
}

.directory-mini-list {
  @apply m-0 text-xs leading-relaxed text-zinc-500;
}

.directory-modal-overlay {
  @apply fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center;
}

.directory-modal {
  @apply flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[82vh] sm:rounded-2xl;
}

.directory-modal-header,
.directory-modal-footer {
  @apply flex shrink-0 items-center justify-between gap-3 p-4 sm:p-5;
}

.directory-modal-header {
  @apply border-b border-zinc-100;
}

.directory-modal-footer {
  @apply justify-end border-t border-zinc-100;
}

.directory-modal-title {
  @apply m-0 truncate text-lg font-semibold text-zinc-900;
}

.directory-modal-body {
  @apply flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5;
}

.directory-detail-description {
  @apply m-0 text-sm leading-relaxed text-zinc-600;
}

.directory-detail-grid {
  @apply grid grid-cols-1 gap-3 sm:grid-cols-2;
}

.directory-detail-block,
.directory-auth-panel {
  @apply rounded-xl border border-zinc-200 bg-zinc-50 p-3;
}

.directory-include-row {
  @apply mt-2 flex items-center justify-between gap-3 text-xs text-zinc-600;
}

.directory-auth-status {
  @apply ml-2 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none;
}

.directory-auth-status.is-ok {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.directory-auth-status.is-warning {
  @apply border-amber-200 bg-amber-50 text-amber-700;
}

.directory-auth-status.is-muted {
  @apply border-zinc-200 bg-white text-zinc-500;
}

.directory-include-row button {
  @apply border-0 bg-transparent p-0 text-xs font-medium text-blue-600 hover:underline;
}

.directory-screenshots {
  @apply grid grid-cols-1 gap-3 sm:grid-cols-2;
}

.directory-screenshots img {
  @apply max-h-56 w-full rounded-xl border border-zinc-200 object-cover;
}

.composio-status-card {
  @apply min-h-0;
}

.composio-preview {
  @apply flex flex-col gap-3;
}

.composio-preview-hero {
  @apply flex flex-col gap-4 overflow-hidden rounded-xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between;
}

.composio-preview-copy {
  @apply flex min-w-0 items-start gap-3;
}

.composio-preview-kicker {
  @apply m-0 text-xs font-semibold uppercase text-sky-700;
}

.composio-preview-title {
  @apply m-0 mt-1 max-w-2xl text-lg font-semibold leading-snug text-zinc-950;
}

.composio-preview-text {
  @apply m-0 mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600;
}

.composio-preview-actions {
  @apply flex shrink-0 flex-wrap items-center gap-2;
}

.composio-preview-grid {
  @apply grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3;
}

.composio-preview-card {
  @apply border-sky-100 bg-white;
}

.composio-fallback {
  @apply bg-sky-100 text-sky-700;
}

:global(:root.dark) .directory-title,
:global(:root.dark) .directory-card-title,
:global(:root.dark) .directory-modal-title,
:global(:root.dark) .directory-mini-heading,
:global(:root.dark) .directory-detail-heading {
  @apply text-zinc-100;
}

:global(:root.dark) .directory-subtitle,
:global(:root.dark) .directory-card-meta,
:global(:root.dark) .directory-card-description,
:global(:root.dark) .directory-mini-list,
:global(:root.dark) .directory-detail-description {
  @apply text-zinc-400;
}

:global(:root.dark) .skills-embedded-toggle,
:global(:root.dark) .skills-embedded-title {
  @apply text-zinc-300 hover:text-zinc-100;
}

:global(:root.dark) .mcp-skill-card {
  @apply border-zinc-700 bg-zinc-900 hover:border-zinc-600;
}

:global(.dark) .mcp-skill-card {
  @apply border-zinc-700 bg-zinc-900 hover:border-zinc-600;
}

:global(:root.dark) .mcp-skill-avatar-fallback {
  @apply bg-zinc-700 text-zinc-300;
}

:global(.dark) .mcp-skill-avatar-fallback {
  @apply bg-zinc-700 text-zinc-300;
}

:global(:root.dark) .mcp-skill-name {
  @apply text-zinc-100;
}

:global(.dark) .mcp-skill-name {
  @apply text-zinc-100;
}

:global(:root.dark) .mcp-skill-owner {
  @apply text-zinc-400;
}

:global(.dark) .mcp-skill-owner {
  @apply text-zinc-400;
}

:global(:root.dark) .mcp-skill-meta {
  @apply text-zinc-300;
}

:global(.dark) .mcp-skill-meta {
  @apply text-zinc-300;
}

:global(:root.dark) .mcp-skill-chevron {
  @apply text-zinc-500;
}

:global(.dark) .mcp-skill-chevron {
  @apply text-zinc-500;
}

@media (prefers-color-scheme: dark) {
  .mcp-skill-card {
    @apply border-zinc-700 bg-zinc-900 hover:border-zinc-600;
  }

  .mcp-skill-avatar-fallback {
    @apply bg-zinc-700 text-zinc-300;
  }

  .mcp-skill-name {
    @apply text-zinc-100;
  }

  .mcp-skill-owner {
    @apply text-zinc-400;
  }

  .mcp-skill-meta {
    @apply text-zinc-300;
  }

  .mcp-skill-chevron {
    @apply text-zinc-500;
  }
}

:global(:root.dark) .directory-tabs,
:global(:root.dark) .directory-search,
:global(:root.dark) .directory-card,
:global(:root.dark) .directory-loading,
:global(:root.dark) .directory-empty,
:global(:root.dark) .directory-modal,
:global(:root.dark) .directory-refresh,
:global(:root.dark) .directory-action,
:global(:root.dark) .directory-action-link,
:global(:root.dark) .directory-modal-close {
  @apply border-zinc-700 bg-zinc-900;
}

:global(:root.dark) .directory-search {
  @apply text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500;
}

:global(:root.dark) .directory-tab.is-active,
:global(:root.dark) .directory-sort-button.is-active,
:global(:root.dark) .directory-detail-block,
:global(:root.dark) .directory-auth-panel,
:global(:root.dark) .directory-chip {
  @apply border-zinc-700 bg-zinc-800 text-zinc-100;
}

:global(:root.dark) .directory-example-chip {
  @apply border-blue-900/60 bg-blue-950/40 text-blue-200;
}

:global(:root.dark) .directory-sort-group {
  @apply border-zinc-700 bg-zinc-950;
}

:global(:root.dark) .directory-auth-status.is-muted {
  @apply border-zinc-700 bg-zinc-900 text-zinc-400;
}

:global(:root.dark) .composio-preview-hero {
  @apply border-sky-900/70 bg-sky-950/40;
}

:global(:root.dark) .composio-preview-card {
  @apply border-sky-900/60 bg-zinc-900;
}

:global(:root.dark) .composio-preview-kicker {
  @apply text-sky-300;
}

:global(:root.dark) .composio-preview-title {
  @apply text-zinc-100;
}

:global(:root.dark) .composio-preview-text {
  @apply text-zinc-400;
}

:global(:root.dark) .directory-auth-status.is-error,
:global(:root.dark) .directory-error,
:global(:root.dark) .directory-toast.is-error {
  @apply border-rose-900/60 bg-rose-950/60 text-rose-300;
}

:global(:root.dark) .composio-fallback {
  @apply bg-sky-950 text-sky-300;
}
</style>
