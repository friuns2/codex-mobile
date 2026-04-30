<template>
  <DesktopLayout :is-sidebar-collapsed="isSidebarCollapsed" @close-sidebar="setSidebarCollapsed(true)">
    <template #sidebar>
      <section class="sidebar-root">
        <div class="sidebar-scrollable">
          <SidebarThreadControls
            v-if="!isSidebarCollapsed"
            class="sidebar-thread-controls-host"
            :is-sidebar-collapsed="isSidebarCollapsed"
            :show-new-thread-button="true"
            @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
            @start-new-thread="onStartNewThreadFromToolbar"
          >
            <button
              class="sidebar-search-toggle"
              type="button"
              :aria-pressed="isSidebarSearchVisible"
              :aria-label="t('Search threads')"
              :title="t('Search threads')"
              @click="toggleSidebarSearch"
            >
              <IconTablerSearch class="sidebar-search-toggle-icon" />
            </button>
          </SidebarThreadControls>

          <div v-if="!isSidebarCollapsed && isSidebarSearchVisible" class="sidebar-search-bar">
            <IconTablerSearch class="sidebar-search-bar-icon" />
            <input
              ref="sidebarSearchInputRef"
              v-model="sidebarSearchQuery"
              class="sidebar-search-input"
              type="text"
              :placeholder="t('Filter threads...')"
              @keydown="onSidebarSearchKeydown"
            />
            <button
              v-if="sidebarSearchQuery.length > 0"
              class="sidebar-search-clear"
              type="button"
              :aria-label="t('Clear search')"
              @click="clearSidebarSearch"
            >
              <IconTablerX class="sidebar-search-clear-icon" />
            </button>
          </div>

          <button
            v-if="!isSidebarCollapsed"
            class="sidebar-skills-link"
            :class="{ 'is-active': isSkillsRoute }"
            type="button"
            @click="router.push({ name: 'skills' }); isMobile && setSidebarCollapsed(true)"
          >
            <span class="sidebar-skills-link-icon" aria-hidden="true">
              <IconTablerBolt />
            </span>
            <span class="sidebar-skills-link-copy">
              <span class="sidebar-skills-link-title">{{ t('Skills') }}</span>
              <span class="sidebar-skills-link-subtitle">{{ t('Plugins, apps, MCPs') }}</span>
            </span>
          </button>

          <SidebarThreadTree :groups="projectGroups" :project-display-name-by-id="projectDisplayNameById"
            v-if="!isSidebarCollapsed"
            :selected-thread-id="selectedThreadId" :is-loading="isLoadingThreads"
            :search-query="sidebarSearchQuery"
            :search-matched-thread-ids="serverMatchedThreadIds"
            :filter-active="isSidebarSearchVisible"
            @select="onSelectThread"
            @archive="onArchiveThread" @start-new-thread="onStartNewThread" @rename-project="onRenameProject"
            @browse-thread-files="onBrowseThreadFiles"
            @rename-thread="onRenameThread"
            @fork-thread="onForkThread"
            @remove-project="onRemoveProject" @reorder-project="onReorderProject"
            @export-thread="onExportThread"
            @start-new-chat="onStartNewThreadFromToolbar"
            @toggle-filter="toggleSidebarSearch" />
        </div>

        <div
          v-if="!isSidebarCollapsed"
          ref="settingsAreaRef"
          class="sidebar-settings-area"
          @click="onSettingsAreaClick"
        >
          <Transition name="settings-panel">
            <div
              v-if="isSettingsOpen"
              ref="settingsPanelRef"
              class="sidebar-settings-panel"
              @click.stop
            >
              <div class="sidebar-settings-account-section">
                <div class="sidebar-settings-account-header">
                  <div class="sidebar-settings-account-header-main">
                    <button
                      class="sidebar-settings-account-collapse"
                      type="button"
                      :aria-expanded="!isAccountsSectionCollapsed"
                      :title="isAccountsSectionCollapsed ? t('Expand accounts') : t('Collapse accounts')"
                      @click="toggleAccountsSectionCollapsed"
                    >
                      <span class="sidebar-settings-account-collapse-icon">{{ isAccountsSectionCollapsed ? '▸' : '▾' }}</span>
                    </button>
                    <span class="sidebar-settings-account-title">{{ t('Accounts') }}</span>
                    <span class="sidebar-settings-account-count">{{ accounts.length }}</span>
                  </div>
                  <button
                    class="sidebar-settings-account-refresh"
                    type="button"
                    :disabled="isRefreshingAccounts || isSwitchingAccounts"
                    @click="onRefreshAccounts"
                  >
                    {{ isRefreshingAccounts ? t('Reloading…') : t('Reload') }}
                  </button>
                </div>
                <template v-if="!isAccountsSectionCollapsed">
                  <p v-if="accountActionError" class="sidebar-settings-account-error">{{ accountActionError }}</p>
                  <p v-if="accounts.length === 0" class="sidebar-settings-account-empty">
                    {{ t('Run `codex login`, then click reload.') }}
                  </p>
                  <div v-else class="sidebar-settings-account-list">
                  <article
                    v-for="account in accounts"
                    :key="account.accountId"
                    class="sidebar-settings-account-item"
                    :class="{
                      'is-active': account.isActive,
                      'is-unavailable': isAccountUnavailable(account),
                      'is-confirming-remove': isRemoveConfirmationActive(account),
                      'is-remove-visible': isRemoveVisible(account),
                    }"
                    :title="buildAccountTitle(account)"
                    @mouseenter="onAccountCardPointerEnter(account.accountId)"
                    @mouseleave="onAccountCardPointerLeave(account.accountId)"
                  >
                    <div class="sidebar-settings-account-main">
                      <p class="sidebar-settings-account-email">{{ account.email || t('Account') }}</p>
                      <p class="sidebar-settings-account-meta">
                        {{ formatAccountMeta(account) }}
                      </p>
                      <p class="sidebar-settings-account-quota">
                        {{ formatAccountQuota(account) }}
                      </p>
                      <p class="sidebar-settings-account-id">
                        Workspace {{ shortAccountId(account.accountId) }}
                      </p>
                    </div>
                    <div class="sidebar-settings-account-actions">
                      <button
                        class="sidebar-settings-account-switch"
                        type="button"
                        :disabled="isAccountActionDisabled(account) || account.isActive || isAccountUnavailable(account)"
                        @click="onSwitchAccount(account.accountId)"
                      >
                        {{ getAccountSwitchLabel(account) }}
                      </button>
                      <button
                        class="sidebar-settings-account-remove"
                        :class="{
                          'is-visible': isRemoveVisible(account),
                          'is-confirming': isRemoveConfirmationActive(account),
                        }"
                        type="button"
                        :disabled="isAccountActionDisabled(account)"
                        @click="onRemoveAccount(account.accountId)"
                      >
                        {{ getAccountRemoveLabel(account) }}
                      </button>
                    </div>
                  </article>
                  </div>
                </template>
              </div>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.sendWithEnter" @click="toggleSendWithEnter">
                <span class="sidebar-settings-label">{{ t('Require ⌘ + enter to send') }}</span>
                <span class="sidebar-settings-toggle" :class="{ 'is-on': !sendWithEnter }" />
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.inProgressSendMode" @click="cycleInProgressSendMode">
                <span class="sidebar-settings-label">{{ t('When busy, send as') }}</span>
                <span class="sidebar-settings-value">{{ inProgressSendMode === 'steer' ? t('Steer') : t('Queue') }}</span>
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.appearance" @click="cycleDarkMode">
                <span class="sidebar-settings-label">{{ t('Appearance') }}</span>
                <span class="sidebar-settings-value">{{ darkMode === 'system' ? t('System') : darkMode === 'dark' ? t('Dark') : t('Light') }}</span>
              </button>
              <div class="sidebar-settings-row sidebar-settings-row--select" :title="t('Choose the interface language for the app.')">
                <span class="sidebar-settings-label">{{ t('UI language') }}</span>
                <select
                  class="sidebar-settings-provider-select"
                  :value="uiLanguage"
                  @change="setUiLanguage(($event.target as HTMLSelectElement).value as 'en' | 'zh-CN')"
                >
                  <option v-for="option in uiLanguageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.chatWidth" @click="cycleChatWidth">
                <span class="sidebar-settings-label">{{ t('Chat width') }}</span>
                <span class="sidebar-settings-value">{{ chatWidthLabel }}</span>
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.dictationClickToToggle" @click="toggleDictationClickToToggle">
                <span class="sidebar-settings-label">{{ t('Click to toggle dictation') }}</span>
                <span class="sidebar-settings-toggle" :class="{ 'is-on': dictationClickToToggle }" />
              </button>
              <button class="sidebar-settings-row" type="button" :title="SETTINGS_HELP.dictationAutoSend" @click="toggleDictationAutoSend">
                <span class="sidebar-settings-label">{{ t('Auto send dictation') }}</span>
                <span class="sidebar-settings-toggle" :class="{ 'is-on': dictationAutoSend }" />
              </button>

              <div class="sidebar-settings-row sidebar-settings-row--select" :title="t('Choose the API provider for the Codex backend')">
                <span class="sidebar-settings-label">{{ t('Provider') }}</span>
                <select
                  class="sidebar-settings-provider-select"
                  :value="selectedProvider"
                  :disabled="freeModeLoading"
                  @change="onProviderChange(($event.target as HTMLSelectElement).value)"
                >
                  <option value="codex">Codex</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="opencode-zen">OpenCode Zen</option>
                  <option value="custom">Custom endpoint</option>
                </select>
              </div>
              <div v-if="providerError" class="sidebar-settings-row sidebar-settings-error">
                {{ providerError }}
              </div>
              <div v-if="selectedProvider === 'openrouter'" class="sidebar-settings-row sidebar-settings-row--input">
                <div class="sidebar-settings-provider-info">
                  <span class="sidebar-settings-label">{{ t('OpenRouter API key') }}</span>
                  <a
                    class="sidebar-settings-provider-link"
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ t('Get API key') }}</a>
                </div>
                <div class="sidebar-settings-key-group">
                  <template v-if="freeModeHasCustomKey && !freeModeCustomKey">
                    <span class="sidebar-settings-key-masked">{{ freeModeCustomKeyMasked }}</span>
                    <button
                      class="sidebar-settings-key-clear"
                      type="button"
                      :disabled="freeModeCustomKeySaving"
                      :title="t('Remove custom key, use community keys')"
                      @click="clearFreeModeCustomKey"
                    >&#x2715;</button>
                  </template>
                  <template v-else>
                    <input
                      v-model="freeModeCustomKey"
                      class="sidebar-settings-key-input"
                      type="password"
                      :placeholder="t('sk-or-v1-... (optional, uses free keys if empty)')"
                      @keydown.enter="saveFreeModeCustomKey"
                    />
                    <button
                      class="sidebar-settings-key-save"
                      type="button"
                      :disabled="freeModeCustomKeySaving || !freeModeCustomKey.trim()"
                      @click="saveFreeModeCustomKey"
                    >{{ freeModeCustomKeySaving ? '...' : t('Set') }}</button>
                  </template>
                </div>
                <div class="sidebar-settings-row sidebar-settings-row--select" style="margin-top: 4px; padding: 0">
                  <span class="sidebar-settings-label">{{ t('API format') }}</span>
                  <div class="sidebar-settings-segmented" role="group" :aria-label="t('OpenRouter API format')">
                    <button
                      type="button"
                      class="sidebar-settings-segmented-option"
                      :class="{ 'is-active': openRouterWireApi === 'responses' }"
                      :disabled="freeModeCustomKeySaving || freeModeLoading"
                      @click="setOpenRouterWireApi('responses')"
                    >
                      Responses
                    </button>
                    <button
                      type="button"
                      class="sidebar-settings-segmented-option"
                      :class="{ 'is-active': openRouterWireApi === 'chat' }"
                      :disabled="freeModeCustomKeySaving || freeModeLoading"
                      @click="setOpenRouterWireApi('chat')"
                    >
                      Completions
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="selectedProvider === 'opencode-zen'" class="sidebar-settings-row sidebar-settings-row--input">
                <div class="sidebar-settings-provider-info">
                  <span class="sidebar-settings-label">{{ t('OpenCode Zen API key') }}</span>
                  <a
                    class="sidebar-settings-provider-link"
                    href="https://opencode.ai/auth"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ t('Get API key') }}</a>
                </div>
                <div class="sidebar-settings-key-group">
                  <input
                    v-model="opencodeZenKey"
                    class="sidebar-settings-key-input"
                    type="password"
                    :placeholder="t('sk-...')"
                    @keydown.enter="saveOpencodeZen"
                  />
                  <button
                    class="sidebar-settings-key-save"
                    type="button"
                    :disabled="freeModeCustomKeySaving || !opencodeZenKey.trim()"
                    @click="saveOpencodeZen"
                  >{{ freeModeCustomKeySaving ? '...' : t('Save') }}</button>
                </div>
              </div>
              <div v-if="selectedProvider === 'custom'" class="sidebar-settings-row sidebar-settings-row--input">
                <span class="sidebar-settings-label">{{ t('Custom endpoint URL') }}</span>
                <div class="sidebar-settings-key-group">
                  <input
                    v-model="customEndpointUrl"
                    class="sidebar-settings-key-input"
                    type="url"
                    :placeholder="t('https://api.example.com/v1')"
                    @keydown.enter="saveCustomEndpoint"
                  />
                </div>
                <span class="sidebar-settings-label" style="margin-top: 4px">{{ t('API key') }}</span>
                <div class="sidebar-settings-key-group">
                  <input
                    v-model="customEndpointKey"
                    class="sidebar-settings-key-input"
                    type="password"
                    :placeholder="t('Bearer token (optional)')"
                    @keydown.enter="saveCustomEndpoint"
                  />
                  <button
                    class="sidebar-settings-key-save"
                    type="button"
                    :disabled="freeModeCustomKeySaving || !customEndpointUrl.trim()"
                    @click="saveCustomEndpoint"
                  >{{ freeModeCustomKeySaving ? '...' : t('Save') }}</button>
                </div>
                <div class="sidebar-settings-row sidebar-settings-row--select" style="margin-top: 4px; padding: 0">
                  <span class="sidebar-settings-label">{{ t('API format') }}</span>
                  <div class="sidebar-settings-segmented" role="group" :aria-label="t('Custom endpoint API format')">
                    <button
                      type="button"
                      class="sidebar-settings-segmented-option"
                      :class="{ 'is-active': customEndpointWireApi === 'responses' }"
                      @click="customEndpointWireApi = 'responses'"
                    >
                      Responses
                    </button>
                    <button
                      type="button"
                      class="sidebar-settings-segmented-option"
                      :class="{ 'is-active': customEndpointWireApi === 'chat' }"
                      @click="customEndpointWireApi = 'chat'"
                    >
                      Completions
                    </button>
                  </div>
                </div>
              </div>
              <div class="sidebar-settings-row sidebar-settings-row--select" :title="SETTINGS_HELP.dictationLanguage">
                <span class="sidebar-settings-label">{{ t('Dictation language') }}</span>
                <ComposerDropdown
                  class="sidebar-settings-language-dropdown"
                  :model-value="dictationLanguage"
                  :options="dictationLanguageOptions"
                  :placeholder="t('Auto-detect')"
                  open-direction="up"
                  :enable-search="true"
                  :search-placeholder="t('Search language...')"
                  @update:model-value="onDictationLanguageChange"
                />
              </div>
              <button class="sidebar-settings-row" type="button" aria-live="polite" @click="isTelegramConfigOpen = !isTelegramConfigOpen">
                <span class="sidebar-settings-label">{{ t('Telegram') }}</span>
                <span class="sidebar-settings-value">{{ telegramStatusText }}</span>
              </button>
              <div v-if="isTelegramConfigOpen" class="sidebar-settings-telegram-panel">
                <label class="sidebar-settings-field">
                  <span class="sidebar-settings-field-label">{{ t('Bot token') }}</span>
                  <input
                    v-model="telegramBotTokenDraft"
                    class="sidebar-settings-input"
                    type="password"
                    placeholder="123456:ABCDEF"
                    autocomplete="off"
                    spellcheck="false"
                  >
                </label>
                <label class="sidebar-settings-field">
                  <span class="sidebar-settings-field-label">{{ t('Allowed Telegram user IDs') }}</span>
                  <textarea
                    v-model="telegramAllowedUserIdsDraft"
                    class="sidebar-settings-textarea"
                    rows="3"
                    placeholder="123456789&#10;987654321"
                    spellcheck="false"
                  />
                </label>
                <div class="sidebar-settings-field-help">
                  {{ t('Put one Telegram user ID per line or separate them with commas. Use `*` to allow all Telegram users. Unauthorized users will see their own ID in the rejection message so they can copy it here.') }}
                </div>
                <div v-if="telegramConfigError" class="sidebar-settings-telegram-error">
                  {{ telegramConfigError }}
                </div>
                <div class="sidebar-settings-telegram-actions">
                  <button
                    class="sidebar-settings-telegram-save"
                    type="button"
                    :disabled="isTelegramSaving"
                    @click="saveTelegramConfig"
                  >
                    {{ isTelegramSaving ? t('Saving…') : t('Save Telegram config') }}
                  </button>
                </div>
              </div>
              <div
                v-if="showThreadContextBadge"
                class="sidebar-settings-row sidebar-settings-context-row"
                :data-state="threadContextBadgeState"
                :title="threadContextTooltip"
              >
                <span class="sidebar-settings-label">{{ t('Context') }}</span>
                <span class="sidebar-settings-context-value" :data-state="threadContextBadgeState">
                  {{ threadContextPrimaryText }}
                  <span class="sidebar-settings-context-meta">{{ threadContextSecondaryText }}</span>
                </span>
              </div>
              <div class="sidebar-settings-rate-limits">
                <RateLimitStatus :snapshots="accountRateLimitSnapshots" />
              </div>
              <div class="sidebar-settings-build-label" :aria-label="t('Worktree name and version')">
                WT {{ worktreeName }} · v{{ appVersion }}
              </div>
            </div>
          </Transition>
          <button
            ref="settingsButtonRef"
            class="sidebar-settings-button"
            type="button"
            @click.stop="isSettingsOpen = !isSettingsOpen"
          >
            <IconTablerSettings class="sidebar-settings-icon" />
            <span>{{ t('Settings') }}</span>
            <span class="sidebar-settings-button-version">
              {{ worktreeName }} · v{{ appVersion }}
            </span>
          </button>
        </div>
      </section>
    </template>

    <template #content>
      <section
        class="content-root"
        :class="{
          'is-virtual-keyboard-open': isTerminalKeyboardLayoutActive,
          'is-terminal-open': isComposerTerminalOpen,
        }"
        :style="contentStyle"
      >
        <span v-if="isVirtualKeyboardOpen" class="content-keyboard-spacer" aria-hidden="true" />
        <ContentHeader :title="contentTitle" :accent="isSkillsRoute">
          <template #leading>
            <SidebarThreadControls
              v-if="isSidebarCollapsed || isMobile"
              class="sidebar-thread-controls-header-host"
              :is-sidebar-collapsed="isSidebarCollapsed"
              :show-new-thread-button="true"
              @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
              @start-new-thread="onStartNewThreadFromToolbar"
            />
            <span v-if="isSkillsRoute" class="skills-route-header-icon" aria-hidden="true">
              <IconTablerBolt />
            </span>
          </template>
          <template #actions>
            <button
              v-if="canShowTerminalToggle"
              class="content-header-terminal-toggle"
              type="button"
              :aria-pressed="isComposerTerminalOpen"
              :title="`${t('Toggle terminal')} (${terminalShortcutLabel})`"
              :aria-label="t('Toggle terminal')"
              @click="toggleComposerTerminal"
            >
              <IconTablerTerminal class="content-header-terminal-toggle-icon" />
              <span class="content-header-terminal-shortcut">{{ terminalShortcutLabel }}</span>
            </button>
            <ComposerDropdown
              v-if="route.name === 'thread' && selectedThreadId"
              class="content-header-branch-dropdown"
              :class="{ 'is-review-open': isReviewPaneOpen }"
              :model-value="contentHeaderBranchDropdownValue"
              :options="contentHeaderBranchDropdownOptions"
              :disabled="isLoadingThreadBranches || isSwitchingThreadBranch"
              :enable-search="true"
              :search-placeholder="t('Search branches...')"
              @update:model-value="onSelectContentHeaderBranch"
            />
          </template>
        </ContentHeader>

        <section class="content-body">
          <template v-if="isSkillsRoute">
            <DirectoryHub
              :cwd="directoryCwd"
              :thread-id="routeThreadId"
              :try-in-flight-key="directoryTryInFlightKey"
              @skills-changed="onSkillsChanged"
              @try-item="onTryDirectoryItem"
            />
          </template>
          <template v-else-if="isHomeRoute">
            <div class="content-grid content-grid-home">
              <div class="new-thread-empty">
                <p class="new-thread-hero">{{ t("Let's build") }}</p>
                <ComposerDropdown class="new-thread-folder-dropdown" :model-value="newThreadCwd"
                  :options="newThreadFolderOptions" :placeholder="t('Choose folder')"
                  :enable-search="true"
                  :search-placeholder="t('Quick search project')"
                  :disabled="false" @update:model-value="onSelectNewThreadFolder" />
                <p v-if="newThreadCwd" class="new-thread-folder-selected" :title="newThreadCwd">
                  {{ t('Selected folder') }}: {{ newThreadCwd }}
                </p>
                <div v-if="newThreadAgentOptions.length > 1" class="new-thread-agents-select">
                  <p class="new-thread-agents-select-label">{{ t('Instructions') }}</p>
                  <ComposerDropdown
                    class="new-thread-agents-dropdown"
                    :model-value="selectedNewThreadAgentFile"
                    :options="newThreadAgentDropdownOptions"
                    :placeholder="t('Select instructions')"
                    :disabled="isLoadingNewThreadAgents"
                    @update:model-value="onSelectNewThreadAgentFile"
                  />
                </div>
                <div class="new-thread-folder-actions">
                  <button class="new-thread-folder-action new-thread-folder-action-primary" type="button" @click="onOpenExistingFolder">
                    {{ t('Select folder') }}
                  </button>
                  <button class="new-thread-folder-action" type="button" @click="onCreateProject">
                    {{ t('Create Project') }}
                  </button>
                </div>
                <section v-if="showFirstLaunchPluginsCard" class="new-thread-launch-card" aria-label="Plugins and Apps announcement">
                  <div class="new-thread-launch-card-copy">
                    <div class="new-thread-launch-card-topline">
                      <span class="new-thread-launch-card-badge" aria-hidden="true">
                        <IconTablerBolt />
                      </span>
                      <p class="new-thread-launch-card-eyebrow">{{ t('New in Codex') }}</p>
                    </div>
                    <h2 class="new-thread-launch-card-title">{{ t('Plugins are here') }}</h2>
                    <p class="new-thread-launch-card-text">
                      {{ t('Hook Codex up to Gmail, Calendar, GitHub, Slack, Browser Use, and more so it can actually help with real work right away.') }}
                    </p>
                    <div class="new-thread-launch-card-pills" aria-label="Example integrations">
                      <span class="new-thread-launch-card-pill">Gmail</span>
                      <span class="new-thread-launch-card-pill">Calendar</span>
                      <span class="new-thread-launch-card-pill">GitHub</span>
                      <span class="new-thread-launch-card-pill">Slack</span>
                      <span class="new-thread-launch-card-pill">Browser Use</span>
                    </div>
                  </div>
                  <div class="new-thread-launch-card-actions">
                    <button class="new-thread-launch-card-button new-thread-launch-card-button-primary" type="button" @click="onOpenPluginsHomeCard">
                      {{ t('Explore Plugins & Apps') }}
                    </button>
                    <button class="new-thread-launch-card-button" type="button" @click="dismissFirstLaunchPluginsCard">
                      {{ t('Dismiss') }}
                    </button>
                  </div>
                </section>
                <Teleport to="body">
                  <div v-if="isExistingFolderPickerOpen" class="new-thread-open-folder-overlay" @click.self="onCloseExistingFolderPanel">
                    <div class="new-thread-open-folder" role="dialog" aria-modal="true" :aria-label="t('Select folder')" @keydown.esc.prevent="onCloseExistingFolderPanel">
                      <div class="new-thread-open-folder-header">
                        <p class="new-thread-open-folder-title">{{ t('Select folder') }}</p>
                        <button class="new-thread-open-folder-close" type="button" @click="onCloseExistingFolderPanel">
                          {{ t('Cancel') }}
                        </button>
                      </div>
                      <p class="new-thread-open-folder-label">{{ t('Current folder') }}</p>
                      <div class="new-thread-open-folder-current">
                        <input
                          ref="existingFolderPathInputRef"
                          v-model="existingFolderPathDraft"
                          class="new-thread-open-folder-path"
                          type="text"
                          :placeholder="t('Current folder')"
                          :title="existingFolderPathDraft || t('Unavailable')"
                          :disabled="isExistingFolderLoading || isOpeningExistingFolder"
                          @blur="onExistingFolderPathBlur"
                          @keydown.enter.prevent="onSubmitExistingFolderPath"
                          @keydown.esc.prevent="onCloseExistingFolderPanel"
                        />
                        <button
                          class="new-thread-folder-action new-thread-folder-action-primary"
                          type="button"
                          :disabled="!resolvedExistingFolderPath || isExistingFolderLoading || isOpeningExistingFolder"
                          @click="onConfirmExistingFolder()"
                        >
                          {{ isOpeningExistingFolder ? t('Opening…') : t('Open') }}
                        </button>
                      </div>
                      <div class="new-thread-open-folder-actions">
                        <label class="new-thread-open-folder-toggle">
                          <input
                            v-model="showHiddenFolders"
                            class="new-thread-open-folder-toggle-input"
                            type="checkbox"
                            @change="onToggleHiddenFolders"
                          />
                          <span>{{ t('Show hidden folders') }}</span>
                        </label>
                        <button
                          class="new-thread-folder-action"
                          :class="{ 'new-thread-folder-action-primary': isCreateFolderOpen }"
                          type="button"
                          :aria-pressed="isCreateFolderOpen"
                          :disabled="!existingFolderBrowsePath || isExistingFolderLoading || isOpeningExistingFolder || isCreatingFolder || (!!existingFolderError && !isCreateFolderOpen)"
                          @click="onOpenCreateFolderPanel"
                        >
                          {{ t('New folder') }}
                        </button>
                      </div>
                      <div v-if="isCreateFolderOpen" class="new-thread-open-folder-create">
                        <div class="new-thread-open-folder-create-composer">
                          <input
                            ref="createFolderInputRef"
                            v-model="createFolderDraft"
                            class="new-thread-open-folder-create-input"
                            type="text"
                            :placeholder="t('Folder name')"
                            @keydown.enter.prevent="onCreateFolder"
                            @keydown.esc.prevent="onCloseCreateFolderPanel"
                          />
                          <button
                            class="new-thread-folder-action new-thread-folder-action-primary new-thread-open-folder-create-submit"
                            type="button"
                            :disabled="!canCreateFolder || isCreatingFolder"
                            @click="onCreateFolder"
                          >
                            {{ createFolderSubmitLabel }}
                          </button>
                        </div>
                        <p v-if="createFolderError" class="new-thread-open-folder-error">{{ createFolderError }}</p>
                      </div>
                      <input
                        ref="existingFolderFilterInputRef"
                        v-model="existingFolderFilter"
                        class="new-thread-open-folder-filter"
                        type="text"
                        :placeholder="t('Filter folders...')"
                        @keydown.esc.prevent="onCloseExistingFolderPanel"
                      />
                      <div v-if="existingFolderError" class="new-thread-open-folder-error-actions">
                        <p class="new-thread-open-folder-error">{{ existingFolderError }}</p>
                        <button
                          class="new-thread-folder-action"
                          type="button"
                          :disabled="isExistingFolderLoading || isOpeningExistingFolder"
                          @click="onRetryExistingFolderBrowse"
                        >
                          {{ t('Retry') }}
                        </button>
                      </div>
                      <p v-if="isExistingFolderLoading" class="new-thread-open-folder-status">{{ t('Loading folders…') }}</p>
                      <p v-else-if="!existingFolderError && existingFolderFilteredEntries.length === 0" class="new-thread-open-folder-status">
                        {{ existingFolderFilter.trim() ? t('No folders match this filter.') : t('No subfolders found here.') }}
                      </p>
                      <ul v-else-if="existingFolderFilteredEntries.length > 0" class="new-thread-open-folder-list">
                        <li v-for="entry in existingFolderFilteredEntries" :key="entry.key" class="new-thread-open-folder-item">
                          <button
                            class="new-thread-open-folder-item-main"
                            type="button"
                            :title="entry.path"
                            :disabled="isExistingFolderLoading || isOpeningExistingFolder"
                            @click="onBrowseExistingFolder(entry.path)"
                          >
                            <span class="new-thread-open-folder-item-name">{{ entry.name }}</span>
                          </button>
                          <button
                            v-if="entry.kind === 'directory'"
                            class="new-thread-open-folder-item-open"
                            type="button"
                            :disabled="isExistingFolderLoading || isOpeningExistingFolder"
                            @click="onConfirmExistingFolder(entry.path)"
                          >
                            {{ t('Open') }}
                          </button>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Teleport>
                <ComposerRuntimeDropdown
                  class="new-thread-runtime-dropdown"
                  v-model="newThreadRuntime"
                />
                <div v-if="newThreadRuntime === 'worktree'" class="new-thread-branch-select">
                  <p class="new-thread-branch-select-label">{{ t('Base branch') }}</p>
                  <ComposerDropdown
                    class="new-thread-branch-dropdown"
                    :model-value="newWorktreeBaseBranch"
                    :options="newWorktreeBranchDropdownOptions"
                    :placeholder="t('Select branch')"
                    :enable-search="true"
                    :search-placeholder="t('Search branches...')"
                    :disabled="isLoadingWorktreeBranches || newWorktreeBranchDropdownOptions.length === 0"
                    @update:model-value="onSelectNewWorktreeBranch"
                  />
                  <p class="new-thread-branch-select-help">
                    {{
                      isLoadingWorktreeBranches
                        ? t('Loading branches…')
                        : selectedWorktreeBranchLabel
                          ? t('New worktree branch will start from {branch}.', { branch: selectedWorktreeBranchLabel })
                          : t('No Git branches found for this folder.')
                    }}
                  </p>
                </div>
                <p class="new-thread-runtime-help">
                  {{ t('Local project uses the selected folder directly. New worktree creates an isolated Git worktree before the first prompt.') }}
                </p>
                <div
                  v-if="worktreeInitStatus.phase !== 'idle'"
                  class="worktree-init-status"
                  :class="{
                    'is-running': worktreeInitStatus.phase === 'running',
                    'is-error': worktreeInitStatus.phase === 'error',
                  }"
                >
                  <strong class="worktree-init-status-title">{{ worktreeInitStatus.title }}</strong>
                  <span class="worktree-init-status-message">{{ worktreeInitStatus.message }}</span>
                </div>
              </div>

              <div class="composer-with-queue">
                <ThreadTerminalPanel
                  v-if="homeTerminalOpen && composerCwd"
                  class="content-thread-terminal-panel"
                  :thread-id="composerThreadContextId"
                  :cwd="composerCwd"
                  @hide="onHideHomeTerminal"
                  @terminal-focus-change="onTerminalFocusChange"
                />
                <ThreadComposer ref="homeThreadComposerRef" :active-thread-id="composerThreadContextId"
                  :cwd="composerCwd"
                  :collaboration-modes="availableCollaborationModes"
                  :selected-collaboration-mode="selectedCollaborationMode"
                  :models="availableModelIds" :selected-model="composerSelectedModelId"
                  :selected-reasoning-effort="selectedReasoningEffort"
                  :selected-speed-mode="selectedSpeedMode"
                  :is-updating-speed-mode="isUpdatingSpeedMode"
                  :skills="installedSkills"
                  :thread-token-usage="selectedThreadTokenUsage"
                  :codex-quota="codexQuota"
                  :is-turn-in-progress="false"
                  :is-stop-pending="false"
                  :is-interrupting-turn="false" :send-with-enter="sendWithEnter" :in-progress-submit-mode="inProgressSendMode"
                  :dictation-click-to-toggle="dictationClickToToggle" :dictation-auto-send="dictationAutoSend"
                  :dictation-language="dictationLanguage"
                  @submit="onSubmitThreadMessage"
                  @update:selected-collaboration-mode="onSelectCollaborationMode"
                  @update:selected-model="onSelectModel"
                  @update:selected-reasoning-effort="onSelectReasoningEffort"
                  @update:selected-speed-mode="onSelectSpeedMode" />
              </div>
            </div>
          </template>
          <template v-else>
            <div class="content-grid">
              <ReviewPane
                v-if="isReviewPaneOpen && selectedThreadId && composerCwd"
                :thread-id="selectedThreadId"
                :cwd="composerCwd"
                :is-thread-in-progress="isSelectedThreadInProgress"
                @close="isReviewPaneOpen = false"
              />

              <template v-else>
                <div class="content-thread">
                  <ThreadConversation ref="threadConversationRef" :messages="filteredMessages" :is-loading="isLoadingMessages"
                    :active-thread-id="composerThreadContextId" :cwd="composerCwd" :scroll-state="selectedThreadScrollState"
                    :live-overlay="liveOverlay"
                    :pending-requests="selectedThreadServerRequests"
                    @update-scroll-state="onUpdateThreadScrollState"
                    @fork-thread="onForkThreadFromMessage"
                    @rollback="onRollback"
                    @implement-plan="onImplementPlan"
                    @respond-server-request="onRespondServerRequest" />
                </div>

                <div class="composer-with-queue">
                  <QueuedMessages
                    :messages="selectedThreadQueuedMessages"
                    @edit="onEditQueuedMessage"
                    @steer="steerQueuedMessage"
                    @delete="removeQueuedMessage"
                    @reorder="onReorderQueuedMessage"
                  />
                  <ThreadTerminalPanel
                    v-if="selectedThreadTerminalOpen && selectedThreadId && composerCwd"
                    class="content-thread-terminal-panel"
                    :thread-id="selectedThreadId"
                    :cwd="composerCwd"
                    @hide="onHideSelectedThreadTerminal"
                    @terminal-focus-change="onTerminalFocusChange"
                  />
                  <ThreadPendingRequestPanel
                    v-if="selectedThreadPendingRequest"
                    :request="selectedThreadPendingRequest"
                    :request-count="selectedThreadServerRequests.length"
                    :has-queue-above="selectedThreadQueuedMessages.length > 0"
                    @respond-server-request="onRespondServerRequest"
                  />
                  <ThreadComposer
                    v-else
                    ref="threadComposerRef"
                    :active-thread-id="composerThreadContextId"
                    :cwd="composerCwd"
                    :collaboration-modes="availableCollaborationModes"
                    :selected-collaboration-mode="selectedCollaborationMode"
                    :models="availableModelIds"
                    :selected-model="composerSelectedModelId"
                    :selected-reasoning-effort="selectedReasoningEffort"
                    :selected-speed-mode="selectedSpeedMode"
                    :is-updating-speed-mode="isUpdatingSpeedMode"
                    :skills="installedSkills"
                    :thread-token-usage="selectedThreadTokenUsage"
                    :codex-quota="codexQuota"
                    :is-turn-in-progress="isSelectedThreadInProgress"
                    :is-stop-pending="isSelectedThreadInterruptPending"
                    :is-interrupting-turn="isInterruptingTurn"
                    :has-queue-above="selectedThreadQueuedMessages.length > 0"
                    :send-with-enter="sendWithEnter" :in-progress-submit-mode="inProgressSendMode"
                    :dictation-click-to-toggle="dictationClickToToggle" :dictation-auto-send="dictationAutoSend"
                    :dictation-language="dictationLanguage"
                    @update:selected-collaboration-mode="onSelectCollaborationMode"
                    @submit="onSubmitThreadMessage" @update:selected-model="onSelectModel"
                    @update:selected-reasoning-effort="onSelectReasoningEffort"
                    @update:selected-speed-mode="onSelectSpeedMode"
                    @interrupt="onInterruptTurn" />
                </div>
              </template>
            </div>
          </template>
        </section>
      </section>
    </template>
  </DesktopLayout>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopLayout from './components/layout/DesktopLayout.vue'
import SidebarThreadTree from './components/sidebar/SidebarThreadTree.vue'
import ContentHeader from './components/content/ContentHeader.vue'
import ThreadComposer from './components/content/ThreadComposer.vue'
import ThreadPendingRequestPanel from './components/content/ThreadPendingRequestPanel.vue'
import QueuedMessages from './components/content/QueuedMessages.vue'
import RateLimitStatus from './components/content/RateLimitStatus.vue'
import ComposerDropdown from './components/content/ComposerDropdown.vue'
import ComposerRuntimeDropdown from './components/content/ComposerRuntimeDropdown.vue'
import SidebarThreadControls from './components/sidebar/SidebarThreadControls.vue'
import IconTablerBolt from './components/icons/IconTablerBolt.vue'
import IconTablerSearch from './components/icons/IconTablerSearch.vue'
import IconTablerSettings from './components/icons/IconTablerSettings.vue'
import IconTablerTerminal from './components/icons/IconTablerTerminal.vue'
import IconTablerX from './components/icons/IconTablerX.vue'
import { useDesktopState } from './composables/useDesktopState'
import { useMobile } from './composables/useMobile'
import { useUiLanguage } from './composables/useUiLanguage'
import {
  checkoutGitBranch,
  configureTelegramBot,
  createWorktree,
  createProjectlessThreadDirectory,
  getGitBranchState,
  getWorktreeBranchOptions,
  getAccounts,
  createLocalDirectory,
  getFirstLaunchPluginsCardPreference,
  getAgentInstructionsOptions,
  getHomeDirectory,
  getTelegramConfig,
  getProjectRootSuggestion,
  getTelegramStatus,
  getThreadTerminalStatus,
  getWorkspaceRootsState,
  listLocalDirectories,
  openProjectRoot,
  persistFirstLaunchPluginsCardPreference,
  removeAccount,
  refreshAccountsFromAuth,
  searchThreads,
  switchAccount,
} from './api/codexGateway'
import type { ReasoningEffort, SpeedMode, ThreadScrollState, UiAccountEntry, UiRateLimitWindow, UiServerRequest, UiServerRequestReply, UiThreadTokenUsage } from './types/codex'
import type { ComposerDraftPayload, ThreadComposerExposed } from './components/content/ThreadComposer.vue'
import type { AgentInstructionsOption, LocalDirectoryEntry, TelegramStatus, WorktreeBranchOption } from './api/codexGateway'
import { getFreeModeStatus, setFreeMode, setFreeModeCustomKey, setCustomProvider } from './api/codexGateway'
import { getPathLeafName, getPathParent, isProjectlessChatPath, normalizePathForUi } from './pathUtils.js'

const ThreadConversation = defineAsyncComponent(() => import('./components/content/ThreadConversation.vue'))
const ThreadTerminalPanel = defineAsyncComponent(() => import('./components/content/ThreadTerminalPanel.vue'))
const ReviewPane = defineAsyncComponent(() => import('./components/content/ReviewPane.vue'))
const DirectoryHub = defineAsyncComponent(() => import('./components/content/DirectoryHub.vue'))
const { t, uiLanguage, uiLanguageOptions, setUiLanguage } = useUiLanguage()

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'codex-web-local.sidebar-collapsed.v1'
const ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY = 'codex-web-local.accounts-section-collapsed.v1'
const worktreeName = import.meta.env.VITE_WORKTREE_NAME ?? 'unknown'
const appVersion = import.meta.env.VITE_APP_VERSION ?? 'unknown'
const SETTINGS_HELP = {
  sendWithEnter: t('When enabled, press Enter to send. When disabled, use Command+Enter to send.'),
  inProgressSendMode: t('If a turn is still running, choose whether a new prompt should steer the current turn or be queued.'),
  appearance: t('Switch between system theme, light mode, and dark mode.'),
  chatWidth: t('Choose how wide the conversation column and composer can grow on desktop screens.'),
  dictationClickToToggle: t('Use click-to-start and click-to-stop dictation instead of hold-to-talk.'),
  dictationAutoSend: t('Automatically send transcribed dictation when recording stops.'),
  dictationLanguage: t('Choose transcription language or keep auto-detect.'),
} as const

type ChatWidthMode = 'standard' | 'wide' | 'extra-wide'

type DirectoryTryItemPayload = {
  kind: 'app' | 'plugin' | 'skill' | 'composio'
  name: string
  displayName: string
  skillPath?: string
  prompt?: string
  attachedSkills?: Array<{ name: string; path: string }>
}

type ChatWidthPreset = {
  label: string
  columnMax: string
  cardMax: string
}

const CHAT_WIDTH_PRESETS: Record<ChatWidthMode, ChatWidthPreset> = {
  standard: {
    label: 'Standard',
    columnMax: '45rem',
    cardMax: '76ch',
  },
  wide: {
    label: 'Wide',
    columnMax: '72rem',
    cardMax: '88ch',
  },
  'extra-wide': {
    label: 'Extra wide',
    columnMax: '96rem',
    cardMax: '96ch',
  },
}

const WHISPER_LANGUAGES: Record<string, string> = {
  en: 'english',
  zh: 'chinese',
  de: 'german',
  es: 'spanish',
  ru: 'russian',
  ko: 'korean',
  fr: 'french',
  ja: 'japanese',
  pt: 'portuguese',
  tr: 'turkish',
  pl: 'polish',
  ca: 'catalan',
  nl: 'dutch',
  ar: 'arabic',
  sv: 'swedish',
  it: 'italian',
  id: 'indonesian',
  hi: 'hindi',
  fi: 'finnish',
  vi: 'vietnamese',
  he: 'hebrew',
  uk: 'ukrainian',
  el: 'greek',
  ms: 'malay',
  cs: 'czech',
  ro: 'romanian',
  da: 'danish',
  hu: 'hungarian',
  ta: 'tamil',
  no: 'norwegian',
  th: 'thai',
  ur: 'urdu',
  hr: 'croatian',
  bg: 'bulgarian',
  lt: 'lithuanian',
  la: 'latin',
  mi: 'maori',
  ml: 'malayalam',
  cy: 'welsh',
  sk: 'slovak',
  te: 'telugu',
  fa: 'persian',
  lv: 'latvian',
  bn: 'bengali',
  sr: 'serbian',
  az: 'azerbaijani',
  sl: 'slovenian',
  kn: 'kannada',
  et: 'estonian',
  mk: 'macedonian',
  br: 'breton',
  eu: 'basque',
  is: 'icelandic',
  hy: 'armenian',
  ne: 'nepali',
  mn: 'mongolian',
  bs: 'bosnian',
  kk: 'kazakh',
  sq: 'albanian',
  sw: 'swahili',
  gl: 'galician',
  mr: 'marathi',
  pa: 'punjabi',
  si: 'sinhala',
  km: 'khmer',
  sn: 'shona',
  yo: 'yoruba',
  so: 'somali',
  af: 'afrikaans',
  oc: 'occitan',
  ka: 'georgian',
  be: 'belarusian',
  tg: 'tajik',
  sd: 'sindhi',
  gu: 'gujarati',
  am: 'amharic',
  yi: 'yiddish',
  lo: 'lao',
  uz: 'uzbek',
  fo: 'faroese',
  ht: 'haitian creole',
  ps: 'pashto',
  tk: 'turkmen',
  nn: 'nynorsk',
  mt: 'maltese',
  sa: 'sanskrit',
  lb: 'luxembourgish',
  my: 'myanmar',
  bo: 'tibetan',
  tl: 'tagalog',
  mg: 'malagasy',
  as: 'assamese',
  tt: 'tatar',
  haw: 'hawaiian',
  ln: 'lingala',
  ha: 'hausa',
  ba: 'bashkir',
  jw: 'javanese',
  su: 'sundanese',
  yue: 'cantonese',
}

const {
  projectGroups,
  projectDisplayNameById,
  selectedThread,
  selectedThreadTokenUsage,
  selectedThreadScrollState,
  selectedThreadTerminalOpen,
  selectedThreadServerRequests,
  selectedLiveOverlay,
  codexQuota,
  selectedThreadId,
  availableCollaborationModes,
  availableModelIds,
  selectedCollaborationMode,
  selectedModelId,
  selectedReasoningEffort,
  selectedSpeedMode,
  installedSkills,
  accountRateLimitSnapshots,
  messages,
  isLoadingThreads,
  isLoadingMessages,
  isSendingMessage,
  isInterruptingTurn,
  isSelectedThreadInterruptPending,
  isUpdatingSpeedMode,
  refreshAll,
  refreshSkills,
  selectThread,
  ensureThreadMessagesLoaded,
  setThreadScrollState,
  setThreadTerminalOpen,
  toggleSelectedThreadTerminal,
  archiveThreadById,
  forkThreadById,
  renameThreadById,
  forkThreadFromTurn,
  sendMessageToSelectedThread,
  sendMessageToNewThread,
  interruptSelectedThreadTurn,
  selectedThreadQueuedMessages,
  removeQueuedMessage,
  reorderQueuedMessage,
  steerQueuedMessage,
  setSelectedCollaborationMode,
  readModelIdForThread,
  setSelectedModelIdForThread,

  setSelectedReasoningEffort,
  updateSelectedSpeedMode,
  respondToPendingServerRequest,
  renameProject,
  removeProject,
  reorderProject,
  pinProjectToTop,
  startPolling,
  stopPolling,
  primeSelectedThread,
  rollbackSelectedThread,
} = useDesktopState()

const route = useRoute()
const router = useRouter()
const { isMobile } = useMobile()
const homeThreadComposerRef = ref<ThreadComposerExposed | null>(null)
const threadComposerRef = ref<ThreadComposerExposed | null>(null)
const threadConversationRef = ref<{ jumpToLatest: () => void } | null>(null)
const homeTerminalOpen = ref(false)
const isTerminalInputFocused = ref(false)
const isTerminalKeyboardFocusFallbackActive = ref(false)
const isThreadTerminalAvailable = ref(true)
const editingQueuedMessageState = ref<{ threadId: string; queueIndex: number } | null>(null)
const isRouteSyncInProgress = ref(false)
const directoryTryInFlightKey = ref('')
let hasPendingRouteSync = false
const hasInitialized = ref(false)
const newThreadCwd = ref('')
const newThreadRuntime = ref<'local' | 'worktree'>('local')
const newWorktreeBaseBranch = ref('')
const worktreeBranchOptions = ref<WorktreeBranchOption[]>([])
const isLoadingWorktreeBranches = ref(false)
const newThreadAgentOptions = ref<AgentInstructionsOption[]>([])
const selectedNewThreadAgentFile = ref('project:AGENTS.md')
const isLoadingNewThreadAgents = ref(false)
const workspaceRootOptionsState = ref<{ order: string[]; labels: Record<string, string> }>({ order: [], labels: {} })
const worktreeInitStatus = ref<{ phase: 'idle' | 'running' | 'error'; title: string; message: string }>({
  phase: 'idle',
  title: '',
  message: '',
})
const isSidebarCollapsed = ref(loadSidebarCollapsed())
const sidebarSearchQuery = ref('')
const isSidebarSearchVisible = ref(false)
const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)
const settingsAreaRef = ref<HTMLElement | null>(null)
const settingsPanelRef = ref<HTMLElement | null>(null)
const settingsButtonRef = ref<HTMLElement | null>(null)
const serverMatchedThreadIds = ref<string[] | null>(null)
let threadSearchTimer: ReturnType<typeof setTimeout> | null = null
let terminalKeyboardFocusFallbackTimer: ReturnType<typeof setTimeout> | null = null
const defaultNewProjectName = ref('New Project (1)')
const homeDirectory = ref('')
const isSettingsOpen = ref(false)
const isAccountsSectionCollapsed = ref(loadAccountsSectionCollapsed())
const isReviewPaneOpen = ref(false)
const threadBranchOptions = ref<WorktreeBranchOption[]>([])
const currentThreadBranch = ref<string | null>(null)
const isLoadingThreadBranches = ref(false)
const isSwitchingThreadBranch = ref(false)
const createFolderInputRef = ref<HTMLInputElement | null>(null)
const accounts = ref<UiAccountEntry[]>([])
const isRefreshingAccounts = ref(false)
const isSwitchingAccounts = ref(false)
const removingAccountId = ref('')
const confirmingRemoveAccountId = ref('')
const hoveredAccountId = ref('')
const accountActionError = ref('')
const SEND_WITH_ENTER_KEY = 'codex-web-local.send-with-enter.v1'
const IN_PROGRESS_SEND_MODE_KEY = 'codex-web-local.in-progress-send-mode.v1'
const DARK_MODE_KEY = 'codex-web-local.dark-mode.v1'
const DICTATION_CLICK_TO_TOGGLE_KEY = 'codex-web-local.dictation-click-to-toggle.v1'
const DICTATION_AUTO_SEND_KEY = 'codex-web-local.dictation-auto-send.v1'
const DICTATION_LANGUAGE_KEY = 'codex-web-local.dictation-language.v1'

const CHAT_WIDTH_KEY = 'codex-web-local.chat-width.v1'
const MOBILE_RESUME_RELOAD_MIN_HIDDEN_MS = 400
const sendWithEnter = ref(loadBoolPref(SEND_WITH_ENTER_KEY, true))
const inProgressSendMode = ref<'steer' | 'queue'>(loadInProgressSendModePref())
const darkMode = ref<'system' | 'light' | 'dark'>(loadDarkModePref())
const chatWidth = ref<ChatWidthMode>(loadChatWidthPref())
const dictationClickToToggle = ref(loadBoolPref(DICTATION_CLICK_TO_TOGGLE_KEY, false))
const dictationAutoSend = ref(loadBoolPref(DICTATION_AUTO_SEND_KEY, true))
const dictationLanguage = ref(loadDictationLanguagePref())
const dictationLanguageOptions = computed(() => buildDictationLanguageOptions())
const showFirstLaunchPluginsCard = ref(false)
const freeModeEnabled = ref(false)
const freeModeLoading = ref(false)
const freeModeCustomKey = ref('')
const freeModeHasCustomKey = ref(false)
const freeModeCustomKeyMasked = ref<string | null>(null)
const freeModeCustomKeySaving = ref(false)
const providerError = ref('')
const selectedProvider = ref<'codex' | 'openrouter' | 'opencode-zen' | 'custom'>('codex')
const customEndpointUrl = ref('')
const customEndpointKey = ref('')
const customEndpointWireApi = ref<'responses' | 'chat'>('responses')
const openRouterWireApi = ref<'responses' | 'chat'>('responses')
const opencodeZenKey = ref('')
const isTelegramConfigOpen = ref(false)
const telegramBotTokenDraft = ref('')
const telegramAllowedUserIdsDraft = ref('')
const telegramConfigError = ref('')
const isTelegramSaving = ref(false)
const isCreateFolderOpen = ref(false)
const createFolderDraft = ref('')
const createFolderError = ref('')
const isCreatingFolder = ref(false)
const isExistingFolderPickerOpen = ref(false)
const existingFolderPathInputRef = ref<HTMLInputElement | null>(null)
const existingFolderFilterInputRef = ref<HTMLInputElement | null>(null)
const existingFolderPathDraft = ref('')
const existingFolderBrowsePath = ref('')
const existingFolderParentPath = ref('')
const existingFolderEntries = ref<LocalDirectoryEntry[]>([])
const existingFolderError = ref('')
const isExistingFolderLoading = ref(false)
const isOpeningExistingFolder = ref(false)
const showHiddenFolders = ref(false)
const existingFolderFilter = ref('')
const telegramStatus = ref<TelegramStatus>({
  configured: false,
  active: false,
  mappedChats: 0,
  mappedThreads: 0,
  allowedUsers: 0,
  allowAllUsers: false,
  lastError: '',
})
const mobileHiddenAtMs = ref<number | null>(null)
const mobileResumeReloadTriggered = ref(false)
const mobileResumeSyncInProgress = ref(false)
const visualViewportHeight = ref(typeof window !== 'undefined' ? window.visualViewport?.height ?? window.innerHeight : 0)
const visualViewportOffsetTop = ref(typeof window !== 'undefined' ? window.visualViewport?.offsetTop ?? 0 : 0)
const layoutViewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
let accountStatePollTimer: number | null = null
let isAccountStatePollInFlight = false
let existingFolderBrowseRequestId = 0

const routeThreadId = computed(() => {
  const rawThreadId = route.params.threadId
  return typeof rawThreadId === 'string' ? rawThreadId : ''
})

const isHomeRoute = computed(() => route.name === 'home')
const isSkillsRoute = computed(() => route.name === 'skills')
const contentTitle = computed(() => {
  if (isSkillsRoute.value) return t('Skills')
  if (isHomeRoute.value) return t('Start new thread')
  return selectedThread.value?.title ?? t('Choose a thread')
})
const browserHostName =
  typeof window !== 'undefined'
    ? (window.location.hostname || window.location.host || 'codexui')
    : 'codexui'
const pageTitle = computed(() => {
  const threadTitle = selectedThread.value?.title?.trim() ?? ''
  return threadTitle || browserHostName
})
const filteredMessages = computed(() =>
  messages.value.filter((message) => {
    const type = normalizeMessageType(message.messageType, message.role)
    if (type === 'worked') return true
    if (type === 'turnActivity.live' || type === 'turnError.live' || type === 'agentReasoning.live') return false
    return true
  }),
)
const latestUserTurnId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index]
    if (message.role !== 'user') continue
    const turnId = message.turnId?.trim() ?? ''
    if (turnId.length > 0) return turnId
  }
  return ''
})
const liveOverlay = computed(() => selectedLiveOverlay.value)
const composerThreadContextId = computed(() => (isHomeRoute.value ? '__new-thread__' : selectedThreadId.value))
const composerSelectedModelId = computed(() => readModelIdForThread(composerThreadContextId.value))
const selectedThreadPendingRequest = computed<UiServerRequest | null>(() => {
  const rows = selectedThreadServerRequests.value
  return rows.length > 0 ? rows[rows.length - 1] : null
})
const composerCwd = computed(() => {
  if (isHomeRoute.value) return newThreadCwd.value.trim()
  return selectedThread.value?.cwd?.trim() ?? ''
})
const canShowTerminalToggle = computed(() => (
  isThreadTerminalAvailable.value && (
    (isHomeRoute.value && composerCwd.value.length > 0) ||
    (route.name === 'thread' && selectedThreadId.value.length > 0)
  )
))
const isComposerTerminalOpen = computed(() => (
  isHomeRoute.value ? homeTerminalOpen.value : selectedThreadTerminalOpen.value
))
const isVirtualKeyboardOpen = computed(() => {
  if (!isMobile.value) return false
  if (visualViewportHeight.value <= 0 || layoutViewportHeight.value <= 0) return false
  return layoutViewportHeight.value - visualViewportHeight.value > 120
})
const isTerminalKeyboardLayoutActive = computed(() => (
  isVirtualKeyboardOpen.value ||
  (isComposerTerminalOpen.value && isTerminalKeyboardFocusFallbackActive.value)
))
const directoryCwd = computed(() => selectedThread.value?.cwd?.trim() ?? newThreadCwd.value.trim())
const isSelectedThreadInProgress = computed(() => !isHomeRoute.value && selectedThread.value?.inProgress === true)
const showThreadContextBadge = computed(() => !isHomeRoute.value && !isSkillsRoute.value && selectedThreadId.value.trim().length > 0)
const isAccountSwitchBlocked = computed(() =>
  isSendingMessage.value ||
  isInterruptingTurn.value ||
  isSelectedThreadInProgress.value ||
  selectedThreadServerRequests.value.length > 0,
)

function formatCompactTokenCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100000 ? 0 : 1,
  }).format(Math.max(0, Math.trunc(value)))
}

function buildThreadContextTooltip(usage: UiThreadTokenUsage | null): string {
  if (!usage) {
    return t('Waiting for Codex thread/tokenUsage/updated events for this thread.')
  }

  const lines = [
    `${t('Current context usage')}: ${usage.currentContextTokens.toLocaleString()} ${t('tokens')}`,
    `${t('Cumulative thread usage')}: ${usage.total.totalTokens.toLocaleString()} ${t('tokens')}`,
  ]

  if (typeof usage.modelContextWindow === 'number') {
    lines.unshift(`${t('Model context window')}: ${usage.modelContextWindow.toLocaleString()} ${t('tokens')}`)
    lines.push(`${t('Remaining context')}: ${(usage.remainingContextTokens ?? 0).toLocaleString()} ${t('tokens')}`)
  } else {
    lines.push(t('Model context window is unavailable in the latest usage event.'))
  }

  return lines.join('\n')
}

function dismissFirstLaunchPluginsCard(): void {
  if (!showFirstLaunchPluginsCard.value) return
  showFirstLaunchPluginsCard.value = false
  void persistFirstLaunchPluginsCardPreference(true)
}

function onOpenPluginsHomeCard(): void {
  dismissFirstLaunchPluginsCard()
  void router.push({ name: 'skills' })
}

const threadContextBadgeState = computed(() => {
  const remainingPercent = selectedThreadTokenUsage.value?.remainingContextPercent
  if (remainingPercent === null || typeof remainingPercent !== 'number') return 'pending'
  if (remainingPercent <= 10) return 'danger'
  if (remainingPercent <= 25) return 'warning'
  return 'ok'
})

const threadContextPrimaryText = computed(() => {
  const usage = selectedThreadTokenUsage.value
  if (!usage) return t('Awaiting data')
  if (typeof usage.remainingContextTokens === 'number') {
    return `${formatCompactTokenCount(usage.remainingContextTokens)} ${t('left')}`
  }
  return `${formatCompactTokenCount(usage.currentContextTokens)} ${t('used')}`
})

const threadContextSecondaryText = computed(() => {
  const usage = selectedThreadTokenUsage.value
  if (!usage) return t('Updates after the next token usage event')
  if (typeof usage.modelContextWindow === 'number') {
    return `${formatCompactTokenCount(usage.currentContextTokens)} ${t('used')} / ${formatCompactTokenCount(usage.modelContextWindow)}`
  }
  return t('Window size unavailable')
})

const threadContextTooltip = computed(() => buildThreadContextTooltip(selectedThreadTokenUsage.value))
const newThreadFolderOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = []
  const seenCwds = new Set<string>()

  for (const cwdRaw of workspaceRootOptionsState.value.order) {
    const cwd = cwdRaw.trim()
    if (!cwd || seenCwds.has(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: workspaceRootOptionsState.value.labels[cwd] || getPathLeafName(cwd),
    })
  }

  for (const group of projectGroups.value) {
    const cwd = group.threads[0]?.cwd?.trim() ?? ''
    if (!cwd || seenCwds.has(cwd) || isProjectlessChatPath(cwd)) continue
    seenCwds.add(cwd)
    options.push({
      value: cwd,
      label: projectDisplayNameById.value[group.projectName] ?? group.projectName,
    })
  }

  const selectedCwd = newThreadCwd.value.trim()
  if (selectedCwd && !seenCwds.has(selectedCwd)) {
    options.unshift({
      value: selectedCwd,
      label: getPathLeafName(selectedCwd),
    })
  }

  return options
})
const newWorktreeBranchDropdownOptions = computed<Array<{ value: string; label: string }>>(() => {
  const selectedBranch = newWorktreeBaseBranch.value.trim()
  const options = [...worktreeBranchOptions.value]
  if (selectedBranch && !options.some((option) => option.value === selectedBranch)) {
    options.unshift({ value: selectedBranch, label: selectedBranch })
  }
  return options
})
const newThreadAgentDropdownOptions = computed<Array<{ value: string; label: string }>>(() =>
  newThreadAgentOptions.value.map((option) => ({ value: option.value, label: option.label })),
)
const selectedNewThreadAgentOption = computed(() =>
  newThreadAgentOptions.value.find((option) => option.value === selectedNewThreadAgentFile.value) ?? null,
)
const selectedWorktreeBranchLabel = computed(() => {
  const selectedBranch = newWorktreeBaseBranch.value.trim()
  if (!selectedBranch) return ''
  const selected = newWorktreeBranchDropdownOptions.value.find((option) => option.value === selectedBranch)
  return selected?.label ?? selectedBranch
})
const contentHeaderBranchDropdownValue = computed(() => currentThreadBranch.value ?? '__detached_head__')
const contentHeaderBranchDropdownOptions = computed<Array<{ value: string; label: string }>>(() => {
  const options: Array<{ value: string; label: string }> = [
    {
      value: '__review__',
      label: isReviewPaneOpen.value ? 'Review (Open)' : 'Review',
    },
  ]
  const seen = new Set<string>()
  const currentBranch = currentThreadBranch.value?.trim() ?? ''
  if (currentBranch) {
    options.push({ value: currentBranch, label: currentBranch })
    seen.add(currentBranch)
  } else {
    options.push({ value: '__detached_head__', label: 'Detached HEAD' })
    seen.add('__detached_head__')
  }
  for (const option of threadBranchOptions.value) {
    if (!option.value || seen.has(option.value)) continue
    seen.add(option.value)
    options.push(option)
  }
  return options
})
const createFolderParentPath = computed(() => existingFolderBrowsePath.value.trim())
const isCreateFolderNameValid = computed(() => {
  const draft = createFolderDraft.value.trim()
  if (!draft) return false
  if (draft === '.' || draft === '..') return false
  return !/[\\/]/u.test(draft)
})
const canCreateFolder = computed(() => {
  return isCreateFolderNameValid.value && createFolderParentPath.value.trim().length > 0 && !existingFolderError.value
})
const resolvedExistingFolderPath = computed(() => {
  const draftedPath = normalizePathForUi(existingFolderPathDraft.value).trim()
  if (draftedPath) return draftedPath
  return existingFolderBrowsePath.value.trim()
})
const createFolderSubmitLabel = computed(() => {
  if (isCreatingFolder.value) return 'Creating…'
  return 'Create'
})
const canBrowseExistingFolderParent = computed(() => {
  const current = existingFolderBrowsePath.value.trim()
  const parent = existingFolderParentPath.value.trim()
  return Boolean(current && parent && current !== parent)
})
const existingFolderDisplayEntries = computed(() => {
  const entries: Array<{ key: string; name: string; path: string; kind: 'parent' | 'directory' }> = []
  if (canBrowseExistingFolderParent.value) {
    entries.push({
      key: `parent:${existingFolderParentPath.value}`,
      name: '..',
      path: existingFolderParentPath.value,
      kind: 'parent',
    })
  }
  for (const entry of existingFolderEntries.value) {
    entries.push({
      key: `directory:${entry.path}`,
      name: entry.name,
      path: entry.path,
      kind: 'directory',
    })
  }
  return entries
})
const existingFolderFilteredEntries = computed(() => {
  const filter = existingFolderFilter.value.trim().toLowerCase()
  if (!filter) return existingFolderDisplayEntries.value
  return existingFolderDisplayEntries.value.filter((entry) =>
    entry.kind === 'parent' || entry.name.toLowerCase().includes(filter),
  )
})
const darkModeMediaQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const chatWidthLabel = computed(() => t(CHAT_WIDTH_PRESETS[chatWidth.value].label))
const terminalShortcutLabel = computed(() => {
  if (typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform)) {
    return '⌘J'
  }
  return 'Ctrl+J'
})
const contentStyle = computed(() => {
  const preset = CHAT_WIDTH_PRESETS[chatWidth.value]
  const keyboardInset = Math.max(
    0,
    layoutViewportHeight.value - visualViewportHeight.value - visualViewportOffsetTop.value,
  )
  return {
    '--chat-column-max': preset.columnMax,
    '--chat-card-max': preset.cardMax,
    '--visual-viewport-height': visualViewportHeight.value > 0 ? `${visualViewportHeight.value}px` : '100dvh',
    '--visual-viewport-offset-top': `${Math.max(0, visualViewportOffsetTop.value)}px`,
    '--virtual-keyboard-inset': `${keyboardInset}px`,
  }
})
const telegramStatusText = computed(() => {
  if (!telegramStatus.value.configured) return t('Not configured')
  const base = telegramStatus.value.active ? t('Online') : t('Configured (offline)')
  const allowlist = telegramStatus.value.allowAllUsers
    ? t('allow all users')
    : `${telegramStatus.value.allowedUsers} ${t('allowed user(s)')}`
  const mapped = `${telegramStatus.value.mappedChats} ${t('chat(s)')}, ${telegramStatus.value.mappedThreads} ${t('thread(s)')}, ${allowlist}`
  const error = telegramStatus.value.lastError ? `, ${t('error')}: ${telegramStatus.value.lastError}` : ''
  return `${base}, ${mapped}${error}`
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onWindowKeyDown)
  document.addEventListener('visibilitychange', onDocumentVisibilityChange)
  window.addEventListener('pageshow', onWindowPageShow)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('resize', updateVisualViewportState)
  window.visualViewport?.addEventListener('resize', updateVisualViewportState)
  window.visualViewport?.addEventListener('scroll', updateVisualViewportState)
  updateVisualViewportState()
  applyDarkMode()
  darkModeMediaQuery?.addEventListener('change', applyDarkMode)
  void initialize()
  void loadHomeDirectory()
  void loadFirstLaunchPluginsCardPreference()
  void loadWorkspaceRootOptionsState()
  void refreshDefaultProjectName()
  void refreshTelegramConfig()
  void refreshTelegramStatus()
  void loadFreeModeStatus()
  void refreshThreadTerminalStatus()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onWindowKeyDown)
  document.removeEventListener('visibilitychange', onDocumentVisibilityChange)
  window.removeEventListener('pageshow', onWindowPageShow)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('resize', updateVisualViewportState)
  window.visualViewport?.removeEventListener('resize', updateVisualViewportState)
  window.visualViewport?.removeEventListener('scroll', updateVisualViewportState)
  darkModeMediaQuery?.removeEventListener('change', applyDarkMode)
  if (accountStatePollTimer !== null) {
    window.clearInterval(accountStatePollTimer)
    accountStatePollTimer = null
  }
  if (threadSearchTimer) {
    clearTimeout(threadSearchTimer)
    threadSearchTimer = null
  }
  clearTerminalKeyboardFocusFallbackTimer()
  stopPolling()
})

function updateVisualViewportState(): void {
  if (typeof window === 'undefined') return
  layoutViewportHeight.value = Math.max(layoutViewportHeight.value, window.innerHeight)
  visualViewportHeight.value = window.visualViewport?.height ?? window.innerHeight
  visualViewportOffsetTop.value = window.visualViewport?.offsetTop ?? 0
}

watch(sidebarSearchQuery, (value) => {
  const query = value.trim()
  if (threadSearchTimer) {
    clearTimeout(threadSearchTimer)
    threadSearchTimer = null
  }
  if (!query) {
    serverMatchedThreadIds.value = null
    return
  }

  threadSearchTimer = setTimeout(() => {
    void searchThreads(query, 1000)
      .then((result) => {
        if (sidebarSearchQuery.value.trim() !== query) return
        serverMatchedThreadIds.value = result.threadIds
      })
      .catch(() => {
        if (sidebarSearchQuery.value.trim() !== query) return
        serverMatchedThreadIds.value = null
      })
  }, 220)
})

watch(isVirtualKeyboardOpen, (open) => {
  if (open) return
  isTerminalKeyboardFocusFallbackActive.value = false
})

watch(accounts, () => {
  if (typeof window === 'undefined') return
  const shouldPoll = accounts.value.some((account) => account.quotaStatus === 'loading')
  if (!shouldPoll) {
    if (accountStatePollTimer !== null) {
      window.clearInterval(accountStatePollTimer)
      accountStatePollTimer = null
    }
    return
  }
  if (accountStatePollTimer !== null) return
  accountStatePollTimer = window.setInterval(() => {
    if (isAccountStatePollInFlight) return
    isAccountStatePollInFlight = true
    void loadAccountsState({ silent: true }).finally(() => {
      isAccountStatePollInFlight = false
    })
  }, 1500)
}, { deep: true })

function onSkillsChanged(): void {
  void refreshSkills()
}

async function refreshTelegramStatus(): Promise<void> {
  try {
    telegramStatus.value = await getTelegramStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Telegram status'
    telegramStatus.value = {
      configured: false,
      active: false,
      mappedChats: 0,
      mappedThreads: 0,
      allowedUsers: 0,
      allowAllUsers: false,
      lastError: message,
    }
  }
}

async function refreshTelegramConfig(): Promise<void> {
  try {
    const config = await getTelegramConfig()
    telegramBotTokenDraft.value = config.botToken
    telegramAllowedUserIdsDraft.value = config.allowedUserIds.map((value) => String(value)).join('\n')
    telegramConfigError.value = ''
  } catch (error) {
    telegramConfigError.value = error instanceof Error ? error.message : 'Failed to load Telegram configuration'
  }
}

async function loadFirstLaunchPluginsCardPreference(): Promise<void> {
  const preference = await getFirstLaunchPluginsCardPreference()
  showFirstLaunchPluginsCard.value = preference.dismissed !== true
}

function parseTelegramAllowedUserIdsInput(value: string): Array<number | '*'> {
  const rawEntries = value
    .split(/[\n,]/)
    .map((entry) => entry.trim().replace(/^(telegram|tg):/i, '').trim())
    .filter(Boolean)
  const allowAllUsers = rawEntries.includes('*')
  const normalizedUserIds = Array.from(new Set(rawEntries
    .filter((entry) => /^-?\d+$/.test(entry))
    .map((entry) => Number.parseInt(entry, 10))))
  return allowAllUsers ? ['*', ...normalizedUserIds] : normalizedUserIds
}

async function saveTelegramConfig(): Promise<void> {
  const botToken = telegramBotTokenDraft.value.trim()
  const allowedUserIds = parseTelegramAllowedUserIdsInput(telegramAllowedUserIdsDraft.value)
  if (!botToken) {
    telegramConfigError.value = t('Telegram bot token is required.')
    return
  }
  if (allowedUserIds.length === 0) {
    telegramConfigError.value = t('At least one allowed Telegram user ID or * is required.')
    return
  }

  isTelegramSaving.value = true
  telegramConfigError.value = ''
  try {
    await configureTelegramBot(botToken, allowedUserIds)
    telegramAllowedUserIdsDraft.value = allowedUserIds.map((value) => String(value)).join('\n')
    await Promise.all([
      refreshTelegramConfig(),
      refreshTelegramStatus(),
    ])
    window.alert(t('Telegram bot configured. Only allowlisted Telegram users can use the bridge.'))
  } catch (error) {
    telegramConfigError.value = error instanceof Error ? error.message : t('Failed to connect Telegram bot')
    void refreshTelegramStatus()
  } finally {
    isTelegramSaving.value = false
  }
}

function toggleSidebarSearch(): void {
  isSidebarSearchVisible.value = !isSidebarSearchVisible.value
  if (isSidebarSearchVisible.value) {
    nextTick(() => sidebarSearchInputRef.value?.focus())
  } else {
    sidebarSearchQuery.value = ''
  }
}

function clearSidebarSearch(): void {
  sidebarSearchQuery.value = ''
  sidebarSearchInputRef.value?.focus()
}

function onSidebarSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    isSidebarSearchVisible.value = false
    sidebarSearchQuery.value = ''
  }
}

function onSelectThread(threadId: string): void {
  if (!threadId) return
  if (route.name === 'thread' && routeThreadId.value === threadId) return
  void router.push({ name: 'thread', params: { threadId } })
  if (isMobile.value) setSidebarCollapsed(true)
}

async function onExportThread(threadId: string): Promise<void> {
  if (!threadId) return
  if (selectedThreadId.value !== threadId) {
    await selectThread(threadId)
    await router.push({ name: 'thread', params: { threadId } })
  }
  await nextTick()
  onExportChat()
}

function shortAccountId(accountId: string): string {
  return accountId.length > 8 ? accountId.slice(-8) : accountId
}

function formatAccountMeta(account: UiAccountEntry): string {
  const segments = [account.planType || t('unknown')]
  if (account.authMode) {
    segments.unshift(account.authMode)
  }
  return segments.join(' · ')
}

function isPaymentRequiredErrorMessage(value: string | null): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized.includes('payment required') || /\b402\b/.test(normalized)
}

function isAccountUnavailable(account: UiAccountEntry): boolean {
  return account.unavailableReason === 'payment_required' || isPaymentRequiredErrorMessage(account.quotaError)
}

function isAccountActionDisabled(account: UiAccountEntry): boolean {
  return isRefreshingAccounts.value || isSwitchingAccounts.value || removingAccountId.value.length > 0
    || (account.isActive && removingAccountId.value !== account.accountId && isAccountSwitchBlocked.value)
}

function isRemoveConfirmationActive(account: UiAccountEntry): boolean {
  return confirmingRemoveAccountId.value === account.accountId
}

function isRemoveVisible(account: UiAccountEntry): boolean {
  return hoveredAccountId.value === account.accountId || isRemoveConfirmationActive(account)
}

function getAccountSwitchLabel(account: UiAccountEntry): string {
  if (isAccountUnavailable(account)) return t('Unavailable')
  if (account.isActive) return t('Active')
  if (isSwitchingAccounts.value) return t('Switching…')
  return t('Switch')
}

function getAccountRemoveLabel(account: UiAccountEntry): string {
  if (removingAccountId.value === account.accountId) return t('Removing…')
  if (isRemoveConfirmationActive(account)) return t('Click again to remove')
  return t('Remove')
}

function onAccountCardPointerEnter(accountId: string): void {
  hoveredAccountId.value = accountId
}

function onAccountCardPointerLeave(accountId: string): void {
  if (hoveredAccountId.value === accountId) {
    hoveredAccountId.value = ''
  }
  if (removingAccountId.value === accountId) return
  if (confirmingRemoveAccountId.value === accountId) {
    confirmingRemoveAccountId.value = ''
  }
}

function pickWeeklyQuotaWindow(account: UiAccountEntry) {
  const quota = account.quotaSnapshot
  if (!quota) return null
  const windows = [quota?.primary, quota?.secondary].filter((quotaWindow): quotaWindow is UiRateLimitWindow => quotaWindow !== null)
  const exactWeekly = windows.find((quotaWindow) => quotaWindow.windowMinutes === 7 * 24 * 60)
  if (exactWeekly) {
    return exactWeekly
  }
  const longerWindow = windows
    .filter((quotaWindow) => typeof quotaWindow.windowMinutes === 'number' && quotaWindow.windowMinutes >= 7 * 24 * 60)
    .sort((first, second) => (first.windowMinutes ?? 0) - (second.windowMinutes ?? 0))[0] ?? null
  if (longerWindow) {
    return longerWindow
  }
  return quota.secondary ?? null
}

function formatResetDateCompact(resetsAt: number | null): string {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return ''
  const date = new Date(resetsAt * 1000)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function formatAccountQuota(account: UiAccountEntry): string {
  if (isAccountUnavailable(account)) {
    return account.quotaError || t('402 Payment Required')
  }
  const quota = account.quotaSnapshot
  const window = pickWeeklyQuotaWindow(account)
  const fallbackWindow = quota?.primary ?? quota?.secondary ?? null
  const displayWindow = window ?? fallbackWindow
  if (displayWindow) {
    const remainingPercent = Math.max(0, Math.min(100, 100 - Math.round(displayWindow.usedPercent)))
    const refreshDate = formatResetDateCompact(displayWindow.resetsAt)
    return refreshDate
      ? `${remainingPercent}% ${t('weekly remaining')} · ${refreshDate}`
      : `${remainingPercent}% ${t('weekly remaining')}`
  }
  if (quota?.credits?.unlimited) {
    return t('Unlimited credits')
  }
  if (quota?.credits?.hasCredits && quota.credits.balance) {
    return `${quota.credits.balance} ${t('credits')}`
  }
  if (account.quotaStatus === 'loading') {
    return t('Loading quota…')
  }
  if (account.quotaStatus === 'error') {
    return account.quotaError || t('Quota unavailable')
  }
  if (account.quotaStatus === 'ready' || account.quotaStatus === 'idle') {
    return t('Quota unavailable')
  }
  return t('Fetching account details…')
}

function buildAccountTitle(account: UiAccountEntry): string {
  return [
    account.email || t('Account'),
    formatAccountMeta(account),
    isAccountUnavailable(account) ? t('Unavailable account') : null,
    formatAccountQuota(account),
    `${t('Workspace')} ${account.accountId}`,
  ].filter(Boolean).join('\n')
}

async function loadAccountsState(options: { silent?: boolean } = {}): Promise<void> {
  try {
    const result = await getAccounts()
    accounts.value = result.accounts
    if (!result.accounts.some((account) => account.accountId === hoveredAccountId.value)) {
      hoveredAccountId.value = ''
    }
    if (!result.accounts.some((account) => account.accountId === confirmingRemoveAccountId.value)) {
      confirmingRemoveAccountId.value = ''
    }
  } catch (error) {
    if (options.silent === true) return
    accountActionError.value = error instanceof Error ? error.message : t('Failed to load accounts')
  }
}

async function onRefreshAccounts(): Promise<void> {
  if (isRefreshingAccounts.value || isSwitchingAccounts.value) return
  accountActionError.value = ''
  hoveredAccountId.value = ''
  confirmingRemoveAccountId.value = ''
  isRefreshingAccounts.value = true
  try {
    const result = await refreshAccountsFromAuth()
    accounts.value = result.accounts
    stopPolling()
    startPolling()
    void refreshAll({
      includeSelectedThreadMessages: true,
    })
  } catch (error) {
    accountActionError.value = error instanceof Error ? error.message : t('Failed to refresh accounts')
  } finally {
    isRefreshingAccounts.value = false
  }
}

async function onSwitchAccount(accountId: string): Promise<void> {
  if (isSwitchingAccounts.value || isRefreshingAccounts.value) return
  if (isAccountSwitchBlocked.value) {
    accountActionError.value = t('Finish the current turn and pending requests before switching accounts.')
    return
  }
  accountActionError.value = ''
  hoveredAccountId.value = ''
  confirmingRemoveAccountId.value = ''
  isSwitchingAccounts.value = true
  try {
    const nextActiveAccount = await switchAccount(accountId)
    accounts.value = accounts.value.map((account) => (
      account.accountId === accountId
        ? nextActiveAccount
        : { ...account, isActive: false }
    ))
    stopPolling()
    startPolling()
    void refreshAll({
      includeSelectedThreadMessages: true,
    })
    void loadAccountsState({ silent: true })
  } catch (error) {
    accountActionError.value = error instanceof Error ? error.message : t('Failed to switch account')
  } finally {
    isSwitchingAccounts.value = false
  }
}

async function onRemoveAccount(accountId: string): Promise<void> {
  if (isRefreshingAccounts.value || isSwitchingAccounts.value || removingAccountId.value.length > 0) return
  const targetAccount = accounts.value.find((account) => account.accountId === accountId) ?? null
  if (!targetAccount) return
  if (confirmingRemoveAccountId.value !== accountId) {
    confirmingRemoveAccountId.value = accountId
    return
  }
  if (targetAccount.isActive && isAccountSwitchBlocked.value) {
    accountActionError.value = t('Finish the current turn and pending requests before removing the active account.')
    return
  }

  const removedWasActive = targetAccount.isActive
  accountActionError.value = ''
  confirmingRemoveAccountId.value = ''
  removingAccountId.value = accountId
  try {
    const result = await removeAccount(accountId)
    accounts.value = result.accounts
    stopPolling()
    startPolling()
    if (removedWasActive) {
      void refreshAll({
        includeSelectedThreadMessages: true,
      })
    }
    void loadAccountsState({ silent: true })
  } catch (error) {
    accountActionError.value = error instanceof Error ? error.message : t('Failed to remove account')
  } finally {
    removingAccountId.value = ''
  }
}

function onArchiveThread(threadId: string): void {
  void archiveThreadById(threadId)
}

async function onForkThread(threadId: string): Promise<void> {
  const nextThreadId = await forkThreadById(threadId)
  if (!nextThreadId) return
  if (!isHomeRoute.value) {
    await router.push({ name: 'thread', params: { threadId: nextThreadId } })
  } else {
    await router.replace({ name: 'thread', params: { threadId: nextThreadId } })
  }
  if (isMobile.value) setSidebarCollapsed(true)
}

function isWorktreePath(cwdRaw: string): boolean {
  const cwd = cwdRaw.trim().replace(/\\/gu, '/')
  if (!cwd) return false
  return cwd.includes('/.codex/worktrees/') || cwd.includes('/.git/worktrees/')
}

function resolvePreferredLocalCwd(projectName: string, fallbackCwd = ''): string {
  const group = projectGroups.value.find((row) => row.projectName === projectName)
  if (!group) return fallbackCwd.trim()
  const nonWorktreeThread = group.threads.find((thread) => !isWorktreePath(thread.cwd))
  const candidate = nonWorktreeThread?.cwd?.trim() ?? group.threads[0]?.cwd?.trim() ?? ''
  return candidate || fallbackCwd.trim()
}

function onStartNewThread(projectName: string): void {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  const projectCwd = resolvePreferredLocalCwd(projectName, projectGroup?.threads[0]?.cwd?.trim() ?? '')
  if (projectCwd) {
    newThreadCwd.value = projectCwd
  }
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

function onBrowseThreadFiles(threadId: string): void {
  let targetCwd = ''
  for (const group of projectGroups.value) {
    const thread = group.threads.find((row) => row.id === threadId)
    if (thread?.cwd?.trim()) {
      targetCwd = thread.cwd.trim()
      break
    }
  }
  if (!targetCwd || typeof window === 'undefined') return
  window.open(`/codex-local-browse${encodeURI(targetCwd)}`, '_blank', 'noopener,noreferrer')
}

function onStartNewThreadFromToolbar(): void {
  newThreadCwd.value = ''
  newThreadRuntime.value = 'local'
  if (isMobile.value) setSidebarCollapsed(true)
  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

function onRenameProject(payload: { projectName: string; displayName: string }): void {
  renameProject(payload.projectName, payload.displayName)
}

function onRenameThread(payload: { threadId: string; title: string }): void {
  void renameThreadById(payload.threadId, payload.title)
}

async function onRemoveProject(projectName: string): Promise<void> {
  await removeProject(projectName)
  await loadWorkspaceRootOptionsState()
  void refreshDefaultProjectName()
}

function onReorderProject(payload: { projectName: string; toIndex: number }): void {
  reorderProject(payload.projectName, payload.toIndex)
}

function onUpdateThreadScrollState(payload: { threadId: string; state: ThreadScrollState }): void {
  setThreadScrollState(payload.threadId, payload.state)
}

function onRespondServerRequest(payload: UiServerRequestReply): void {
  void handleServerRequestResponse(payload)
}

async function handleServerRequestResponse(payload: UiServerRequestReply): Promise<void> {
  const responded = await respondToPendingServerRequest(payload)
  const followUpMessageText = payload.followUpMessageText?.trim() ?? ''
  if (!responded || !followUpMessageText || isHomeRoute.value) return

  try {
    await sendMessageToSelectedThread(followUpMessageText, [], [], 'steer', [])
  } catch {
    // sendMessageToSelectedThread already surfaces the error through shared state.
  }
}

async function onForkThreadFromMessage(payload: { threadId: string; turnIndex: number }): Promise<void> {
  const forkedThreadId = await forkThreadFromTurn(payload.threadId, payload.turnIndex)
  if (!forkedThreadId) return
  await router.push({ name: 'thread', params: { threadId: forkedThreadId } })
  if (selectedThreadId.value !== forkedThreadId) {
    await selectThread(forkedThreadId)
  }
  if (isMobile.value) setSidebarCollapsed(true)
}

function setSidebarCollapsed(nextValue: boolean): void {
  if (isSidebarCollapsed.value === nextValue) return
  isSidebarCollapsed.value = nextValue
  saveSidebarCollapsed(nextValue)
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (event.key === 'Escape' && isSettingsOpen.value) {
    isSettingsOpen.value = false
    return
  }
  if (!event.ctrlKey && !event.metaKey) return
  if (event.shiftKey || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'b') {
    event.preventDefault()
    setSidebarCollapsed(!isSidebarCollapsed.value)
    return
  }
  if (key === 'j' && route.name === 'thread' && selectedThreadId.value) {
    event.preventDefault()
    toggleComposerTerminal()
    return
  }
  if (key === 'j' && isHomeRoute.value && composerCwd.value) {
    event.preventDefault()
    toggleComposerTerminal()
  }
}

function toggleComposerTerminal(): void {
  if (!isThreadTerminalAvailable.value) return
  if (isHomeRoute.value) {
    if (!composerCwd.value) return
    homeTerminalOpen.value = !homeTerminalOpen.value
    if (!homeTerminalOpen.value) {
      resetTerminalKeyboardFocusState()
    }
    return
  }
  toggleSelectedThreadTerminal()
  if (!selectedThreadTerminalOpen.value) {
    resetTerminalKeyboardFocusState()
  }
}

function onTerminalFocusChange(focused: boolean): void {
  isTerminalInputFocused.value = focused
  if (!focused) {
    isTerminalKeyboardFocusFallbackActive.value = false
    clearTerminalKeyboardFocusFallbackTimer()
    return
  }
  isTerminalKeyboardFocusFallbackActive.value = true
  clearTerminalKeyboardFocusFallbackTimer()
  terminalKeyboardFocusFallbackTimer = setTimeout(() => {
    terminalKeyboardFocusFallbackTimer = null
    if (!isVirtualKeyboardOpen.value) {
      isTerminalKeyboardFocusFallbackActive.value = false
    }
  }, 1500)
}

function onHideHomeTerminal(): void {
  homeTerminalOpen.value = false
  resetTerminalKeyboardFocusState()
}

function onHideSelectedThreadTerminal(): void {
  if (selectedThreadId.value) {
    setThreadTerminalOpen(selectedThreadId.value, false)
  }
  resetTerminalKeyboardFocusState()
}

function resetTerminalKeyboardFocusState(): void {
  isTerminalInputFocused.value = false
  isTerminalKeyboardFocusFallbackActive.value = false
  clearTerminalKeyboardFocusFallbackTimer()
}

function clearTerminalKeyboardFocusFallbackTimer(): void {
  if (!terminalKeyboardFocusFallbackTimer) return
  clearTimeout(terminalKeyboardFocusFallbackTimer)
  terminalKeyboardFocusFallbackTimer = null
}

async function refreshThreadTerminalStatus(): Promise<void> {
  try {
    const status = await getThreadTerminalStatus()
    isThreadTerminalAvailable.value = status.available
    if (!status.available) {
      homeTerminalOpen.value = false
      if (selectedThreadId.value) {
        setThreadTerminalOpen(selectedThreadId.value, false)
      }
    }
  } catch {
    isThreadTerminalAvailable.value = false
    homeTerminalOpen.value = false
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (isTerminalInputFocused.value) {
    const targetElement = target instanceof Element ? target : target.parentElement
    if (!targetElement?.closest('.thread-terminal-panel')) {
      resetTerminalKeyboardFocusState()
    }
  }
  if (!isSettingsOpen.value) return
  if (settingsPanelRef.value?.contains(target)) return
  if (settingsButtonRef.value?.contains(target)) return
  isSettingsOpen.value = false
}

function onSettingsAreaClick(event: MouseEvent): void {
  if (!isSettingsOpen.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (settingsPanelRef.value?.contains(target)) return
  if (settingsButtonRef.value?.contains(target)) return
  isSettingsOpen.value = false
}

function onDocumentVisibilityChange(): void {
  if (typeof document === 'undefined') return
  if (!isMobile.value) return

  if (document.visibilityState === 'hidden') {
    mobileHiddenAtMs.value = Date.now()
    mobileResumeReloadTriggered.value = false
    return
  }

  maybeSyncAfterMobileResume()
}

function onWindowPageShow(event: PageTransitionEvent): void {
  if (!event.persisted) return
  maybeSyncAfterMobileResume()
}

function onWindowFocus(): void {
  if (route.name === 'home') {
    void loadWorkspaceRootOptionsState()
    void refreshDefaultProjectName()
  }
  maybeSyncAfterMobileResume()
}

function maybeSyncAfterMobileResume(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!isMobile.value) return
  if (document.visibilityState !== 'visible') return
  if (mobileResumeReloadTriggered.value) return
  if (mobileHiddenAtMs.value === null) return

  const hiddenForMs = Date.now() - mobileHiddenAtMs.value
  if (hiddenForMs < MOBILE_RESUME_RELOAD_MIN_HIDDEN_MS) return

  mobileResumeReloadTriggered.value = true
  mobileHiddenAtMs.value = null
  void syncAfterMobileResume()
}

async function syncAfterMobileResume(): Promise<void> {
  if (mobileResumeSyncInProgress.value) return
  mobileResumeSyncInProgress.value = true

  try {
    await refreshAll({
      includeSelectedThreadMessages: true,
      awaitAncillaryRefreshes: true,
    })
    await syncThreadSelectionWithRoute()
  } finally {
    mobileResumeSyncInProgress.value = false
  }
}

function onSubmitThreadMessage(payload: { text: string; imageUrls: string[]; fileAttachments: Array<{ label: string; path: string; fsPath: string }>; skills: Array<{ name: string; path: string }>; mode: 'steer' | 'queue' }): void {
  const text = payload.text
  scheduleMobileConversationJumpToLatest()
  const editingState = editingQueuedMessageState.value
  const queueInsertIndex =
    payload.mode === 'queue'
    && editingState
    && editingState.threadId === selectedThreadId.value
      ? editingState.queueIndex
      : undefined
  editingQueuedMessageState.value = null
  if (isHomeRoute.value) {
    void submitFirstMessageForNewThread(text, payload.imageUrls, payload.skills, payload.fileAttachments)
    return
  }
  void sendMessageToSelectedThread(text, payload.imageUrls, payload.skills, payload.mode, payload.fileAttachments, queueInsertIndex)
}

function onEditQueuedMessage(messageId: string): void {
  const queueIndex = selectedThreadQueuedMessages.value.findIndex((item) => item.id === messageId)
  const message = queueIndex >= 0 ? selectedThreadQueuedMessages.value[queueIndex] : undefined
  const composer = threadComposerRef.value
  if (!message || !composer) return

  if (composer.hasUnsavedDraft()) {
    const shouldReplace = window.confirm('Replace the current draft with this queued message for editing?')
    if (!shouldReplace) return
  }

  editingQueuedMessageState.value = selectedThreadId.value
    ? { threadId: selectedThreadId.value, queueIndex }
    : null
  const payload: ComposerDraftPayload = {
    text: message.text,
    imageUrls: [...message.imageUrls],
    fileAttachments: message.fileAttachments.map((attachment) => ({ ...attachment })),
    skills: message.skills.map((skill) => ({ ...skill })),
  }
  composer.hydrateDraft(payload)
  removeQueuedMessage(messageId)
}


function scheduleMobileConversationJumpToLatest(): void {
  if (!isMobile.value || isHomeRoute.value) return

  const jumpToLatest = () => {
    threadConversationRef.value?.jumpToLatest()
  }

  jumpToLatest()
  void nextTick(() => {
    jumpToLatest()
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      jumpToLatest()
      window.requestAnimationFrame(jumpToLatest)
    })
  })
}

function onSelectNewThreadFolder(cwd: string): void {
  newThreadCwd.value = cwd.trim()
  createFolderError.value = ''
}

function onSelectNewThreadAgentFile(value: string): void {
  selectedNewThreadAgentFile.value = value.trim() || 'project:AGENTS.md'
}

function onSelectNewWorktreeBranch(branch: string): void {
  newWorktreeBaseBranch.value = branch.trim()
}

async function loadThreadBranches(cwd: string): Promise<void> {
  const targetCwd = cwd.trim()
  if (!targetCwd || route.name !== 'thread') {
    threadBranchOptions.value = []
    currentThreadBranch.value = null
    return
  }
  isLoadingThreadBranches.value = true
  try {
    const state = await getGitBranchState(targetCwd)
    threadBranchOptions.value = state.options
    currentThreadBranch.value = state.currentBranch
  } catch {
    threadBranchOptions.value = []
    currentThreadBranch.value = null
  } finally {
    isLoadingThreadBranches.value = false
  }
}

function onSelectContentHeaderBranch(value: string): void {
  if (value === '__review__') {
    isReviewPaneOpen.value = !isReviewPaneOpen.value
    return
  }
  if (value === '__detached_head__') return
  if (isSwitchingThreadBranch.value) return
  const targetBranch = value.trim()
  if (!targetBranch || targetBranch === (currentThreadBranch.value ?? '')) return
  const cwd = composerCwd.value.trim()
  if (!cwd) return

  isSwitchingThreadBranch.value = true
  void checkoutGitBranch(cwd, targetBranch)
    .then((branch) => {
      currentThreadBranch.value = branch || targetBranch
      isReviewPaneOpen.value = false
      return loadThreadBranches(cwd)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to switch branch'
      window.alert(message)
    })
    .finally(() => {
      isSwitchingThreadBranch.value = false
    })
}

async function onCreateProject(): Promise<void> {
  const baseDir = await resolveProjectBaseDirectory()
  if (!baseDir) return

  await refreshDefaultProjectName()
  const suggestedName = defaultNewProjectName.value.trim() || 'New Project (1)'
  const projectName = window.prompt(`Create project in ${baseDir}`, suggestedName)
  if (projectName === null) return

  const normalizedProjectName = projectName.trim()
  if (!normalizedProjectName) return

  const targetPath = normalizeAbsolutePath(joinPath(baseDir, normalizedProjectName))
  if (!targetPath) return

  try {
    const normalizedPath = await openProjectRoot(targetPath, {
      createIfMissing: true,
      label: '',
    })
    if (!normalizedPath) return

    newThreadCwd.value = normalizedPath
    pinProjectToTop(getPathLeafName(normalizedPath))
    await loadWorkspaceRootOptionsState()
    await refreshDefaultProjectName()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create the project.'
    window.alert(message)
  }
}

async function onOpenExistingFolder(): Promise<void> {
  const startPath = newThreadCwd.value.trim() || await resolveProjectBaseDirectory()
  if (!startPath) return
  isCreateFolderOpen.value = false
  isExistingFolderPickerOpen.value = true
  existingFolderFilter.value = ''
  await loadExistingFolderListing(startPath)
  if (!existingFolderError.value) {
    void nextTick(() => existingFolderPathInputRef.value?.focus())
  }
}

function onCloseExistingFolderPanel(): void {
  existingFolderBrowseRequestId += 1
  isExistingFolderPickerOpen.value = false
  isExistingFolderLoading.value = false
  existingFolderError.value = ''
  existingFolderFilter.value = ''
  existingFolderPathDraft.value = ''
  onCloseCreateFolderPanel()
}

async function onBrowseExistingFolder(path: string): Promise<void> {
  if (!path || isExistingFolderLoading.value) return
  existingFolderFilter.value = ''
  await loadExistingFolderListing(path)
}

function onToggleHiddenFolders(): void {
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!isExistingFolderPickerOpen.value || !currentPath) return
  void loadExistingFolderListing(currentPath)
}

function onRetryExistingFolderBrowse(): void {
  const currentPath = resolvedExistingFolderPath.value
  if (!isExistingFolderPickerOpen.value || !currentPath || isExistingFolderLoading.value) return
  void loadExistingFolderListing(currentPath)
}

function onExistingFolderPathBlur(): void {
  if (!isExistingFolderPickerOpen.value || isExistingFolderLoading.value || isOpeningExistingFolder.value) return
  const draftedPath = resolvedExistingFolderPath.value
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!draftedPath || draftedPath === currentPath) return
  void loadExistingFolderListing(draftedPath)
}

function onSubmitExistingFolderPath(): void {
  const draftedPath = resolvedExistingFolderPath.value
  const currentPath = existingFolderBrowsePath.value.trim()
  if (!draftedPath) return
  if (draftedPath !== currentPath) {
    void loadExistingFolderListing(draftedPath)
    return
  }
  void onConfirmExistingFolder(draftedPath)
}

async function onConfirmExistingFolder(path = resolvedExistingFolderPath.value): Promise<void> {
  const targetPath = normalizePathForUi(path).trim()
  if (!targetPath) return

  existingFolderError.value = ''
  isOpeningExistingFolder.value = true
  try {
    const normalizedPath = await openProjectRoot(targetPath, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) {
      existingFolderError.value = 'Failed to open the selected folder.'
      return
    }

    newThreadCwd.value = normalizedPath
    pinProjectToTop(getPathLeafName(normalizedPath))
    await loadWorkspaceRootOptionsState()
    await refreshDefaultProjectName()
    onCloseExistingFolderPanel()
  } catch (error) {
    existingFolderError.value = error instanceof Error ? error.message : 'Failed to open the selected folder.'
  } finally {
    isOpeningExistingFolder.value = false
  }
}

async function onOpenCreateFolderPanel(): Promise<void> {
  createFolderError.value = ''
  if (isCreateFolderOpen.value) {
    onCloseCreateFolderPanel()
    return
  }
  if (!isExistingFolderPickerOpen.value) {
    const startPath = newThreadCwd.value.trim() || await resolveProjectBaseDirectory()
    if (!startPath) return
    isExistingFolderPickerOpen.value = true
    existingFolderFilter.value = ''
    await loadExistingFolderListing(startPath)
    if (existingFolderError.value) return
  }
  if (existingFolderError.value) return
  createFolderDraft.value = defaultNewProjectName.value
  isCreateFolderOpen.value = true
  void nextTick(() => createFolderInputRef.value?.focus())
}

function onCloseCreateFolderPanel(): void {
  createFolderError.value = ''
  createFolderDraft.value = ''
  isCreateFolderOpen.value = false
}

async function onCreateFolder(): Promise<void> {
  const normalizedInput = createFolderDraft.value.trim()
  if (!normalizedInput) return

  createFolderError.value = ''
  if (existingFolderError.value) {
    createFolderError.value = 'Reload the current folder before creating a new one.'
    return
  }
  isCreatingFolder.value = true

  const baseDir = createFolderParentPath.value.trim()
  const targetPath = normalizeAbsolutePath(joinPath(baseDir, normalizedInput))

  if (!targetPath) {
    createFolderError.value = 'Unable to determine where the new folder should be created.'
    isCreatingFolder.value = false
    return
  }

  if (!isCreateFolderNameValid.value) {
    createFolderError.value = 'Enter a single folder name.'
    isCreatingFolder.value = false
    return
  }

  try {
    const normalizedPath = await createLocalDirectory(targetPath)
    if (!normalizedPath) {
      createFolderError.value = 'Failed to create the folder.'
      return
    }

    createFolderError.value = ''
    existingFolderFilter.value = ''
    await loadExistingFolderListing(normalizedPath)
    onCloseCreateFolderPanel()
  } catch (error) {
    createFolderError.value = error instanceof Error ? error.message : 'Failed to create folder.'
  } finally {
    isCreatingFolder.value = false
  }
}

async function applyLaunchProjectPathFromUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const launchProjectPath = new URLSearchParams(window.location.search).get('openProjectPath')?.trim() ?? ''
  if (!launchProjectPath) return false
  try {
    const normalizedPath = await openProjectRoot(launchProjectPath, {
      createIfMissing: false,
      label: '',
    })
    if (!normalizedPath) return false
    newThreadCwd.value = normalizedPath
    pinProjectToTop(getPathLeafName(normalizedPath))
    await router.replace({ name: 'home' })
    await loadWorkspaceRootOptionsState()
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('openProjectPath')
    window.history.replaceState({}, '', nextUrl.toString())
    return true
  } catch {
    // If launch path is invalid, keep normal startup behavior.
    return false
  }
}

async function resolveProjectBaseDirectory(): Promise<string> {
  const baseDir = getProjectBaseDirectory()
  if (baseDir) return baseDir
  try {
    const loadedHomeDirectory = await getHomeDirectory()
    if (loadedHomeDirectory) {
      homeDirectory.value = loadedHomeDirectory
      return loadedHomeDirectory
    }
  } catch {
    // Fallback handled by empty return.
  }
  return ''
}

async function refreshDefaultProjectName(): Promise<void> {
  const baseDir = getProjectBaseDirectory()
  if (!baseDir) {
    defaultNewProjectName.value = 'New Project (1)'
    return
  }

  try {
    const suggestion = await getProjectRootSuggestion(baseDir)
    defaultNewProjectName.value = suggestion.name || 'New Project (1)'
  } catch {
    defaultNewProjectName.value = 'New Project (1)'
  }
}

function getProjectBaseDirectory(): string {
  const selected = newThreadCwd.value.trim()
  if (selected) return getPathParent(selected)
  const first = newThreadFolderOptions.value[0]?.value?.trim() ?? ''
  if (first) return getPathParent(first)
  return homeDirectory.value.trim()
}

async function loadHomeDirectory(): Promise<void> {
  try {
    homeDirectory.value = await getHomeDirectory()
  } catch {
    homeDirectory.value = ''
  }
}

async function loadWorkspaceRootOptionsState(): Promise<void> {
  try {
    const state = await getWorkspaceRootsState()
    workspaceRootOptionsState.value = {
      order: [...state.order],
      labels: { ...state.labels },
    }
  } catch {
    workspaceRootOptionsState.value = { order: [], labels: {} }
  }
}

async function loadExistingFolderListing(path: string): Promise<void> {
  const requestId = ++existingFolderBrowseRequestId
  const normalizedRequestedPath = normalizePathForUi(path).trim()
  existingFolderPathDraft.value = normalizedRequestedPath
  existingFolderBrowsePath.value = normalizedRequestedPath
  existingFolderError.value = ''
  isExistingFolderLoading.value = true

  try {
    const listing = await listLocalDirectories(path, { showHidden: showHiddenFolders.value })
    if (requestId !== existingFolderBrowseRequestId) return
    existingFolderPathDraft.value = listing.path
    existingFolderBrowsePath.value = listing.path
    existingFolderParentPath.value = listing.parentPath
    existingFolderEntries.value = listing.entries
  } catch (error) {
    if (requestId !== existingFolderBrowseRequestId) return
    existingFolderError.value = error instanceof Error ? error.message : 'Failed to load local folders.'
    existingFolderParentPath.value = getPathParent(existingFolderBrowsePath.value)
    existingFolderEntries.value = []
    onCloseCreateFolderPanel()
  } finally {
    if (requestId === existingFolderBrowseRequestId) {
      isExistingFolderLoading.value = false
    }
  }
}

function joinPath(parent: string, child: string): string {
  const rawParent = normalizePathForUi(parent).trim()
  const normalizedChild = normalizePathForUi(child).trim().replace(/^[\\/]+/u, '')
  if (!rawParent || !normalizedChild) return ''
  const separator = rawParent.includes('\\') && !rawParent.includes('/') ? '\\' : '/'
  if (/^[a-zA-Z]:[\\/]?$/u.test(rawParent)) {
    return `${rawParent.slice(0, 2)}${separator}${normalizedChild}`
  }
  if (/^\/+$/u.test(rawParent)) {
    return `/${normalizedChild}`
  }
  const normalizedParent = rawParent.replace(/[\\/]+$/u, '')
  if (!normalizedParent) return ''
  return `${normalizedParent}${separator}${normalizedChild}`
}

function normalizeAbsolutePath(value: string): string {
  const normalizedValue = normalizePathForUi(value).trim()
  if (!normalizedValue) return ''

  const uncMatch = normalizedValue.match(/^\\\\([^\\/]+)[\\/]+([^\\/]+)([\\/].*)?$/u)
  if (uncMatch) {
    const [, server, share, suffix = ''] = uncMatch
    const segments = collapsePathSegments(suffix.split(/[\\/]+/u))
    return segments.length > 0
      ? `\\\\${server}\\${share}\\${segments.join('\\')}`
      : `\\\\${server}\\${share}`
  }

  const driveMatch = normalizedValue.match(/^([a-zA-Z]:)([\\/].*)?$/u)
  if (driveMatch) {
    const [, drive, suffix = ''] = driveMatch
    const separator = normalizedValue.includes('\\') && !normalizedValue.includes('/') ? '\\' : '/'
    const segments = collapsePathSegments(suffix.split(/[\\/]+/u))
    return segments.length > 0 ? `${drive}${separator}${segments.join(separator)}` : `${drive}${separator}`
  }

  if (normalizedValue.startsWith('/')) {
    const segments = collapsePathSegments(normalizedValue.split('/'))
    return segments.length > 0 ? `/${segments.join('/')}` : '/'
  }

  return normalizedValue
}

function collapsePathSegments(rawSegments: readonly string[]): string[] {
  const segments: string[] = []
  for (const rawSegment of rawSegments) {
    const segment = rawSegment.trim()
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length > 0) {
        segments.pop()
      }
      continue
    }
    segments.push(segment)
  }
  return segments
}

function onReorderQueuedMessage(payload: { draggedId: string; targetId: string }): void {
  reorderQueuedMessage(payload.draggedId, payload.targetId)
}

function onSelectModel(modelId: string): void {
  setSelectedModelIdForThread(composerThreadContextId.value, modelId)
}

function onSelectReasoningEffort(effort: ReasoningEffort | ''): void {
  setSelectedReasoningEffort(effort)
}

function onSelectSpeedMode(mode: SpeedMode): void {
  void updateSelectedSpeedMode(mode)
}

function onInterruptTurn(): void {
  void interruptSelectedThreadTurn()
}

function onRollback(payload: { turnId: string }): void {
  const targetTurnId = payload.turnId.trim()
  if (targetTurnId.length > 0) {
    const rollbackUserMessage = [...filteredMessages.value]
      .reverse()
      .find((message) => (
        message.role === 'user'
        && (message.turnId?.trim() ?? '') === targetTurnId
        && message.text.trim().length > 0
      ))
    if (rollbackUserMessage?.text && threadComposerRef.value) {
      threadComposerRef.value.appendTextToDraft(rollbackUserMessage.text)
    }
  }
  void rollbackSelectedThread(payload.turnId)
}

function onImplementPlan(payload: { turnId: string }): void {
  if (isHomeRoute.value || !selectedThreadId.value) return
  setSelectedCollaborationMode('default')
  scheduleMobileConversationJumpToLatest()
  void sendMessageToSelectedThread('Implement', [], [], 'steer', [], undefined, 'default')
}


function onExportChat(): void {
  if (isHomeRoute.value || isSkillsRoute.value || typeof document === 'undefined') return
  if (!selectedThread.value || filteredMessages.value.length === 0) return
  const markdown = buildThreadMarkdown()
  const fileName = buildExportFileName()
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function buildThreadMarkdown(): string {
  const lines: string[] = []
  const threadTitle = selectedThread.value?.title?.trim() || 'Untitled thread'
  lines.push(`# ${escapeMarkdownText(threadTitle)}`)
  lines.push('')
  lines.push(`- Exported: ${new Date().toISOString()}`)
  lines.push(`- Thread ID: ${selectedThread.value?.id ?? ''}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const message of filteredMessages.value) {
    const roleLabel = message.role ? message.role.toUpperCase() : 'MESSAGE'
    lines.push(`## ${roleLabel}`)
    lines.push('')

    const normalizedText = message.text.trim()
    if (normalizedText) {
      lines.push(normalizedText)
      lines.push('')
    }

    if (message.commandExecution) {
      lines.push('```text')
      lines.push(`command: ${message.commandExecution.command}`)
      lines.push(`status: ${message.commandExecution.status}`)
      if (message.commandExecution.cwd) {
        lines.push(`cwd: ${message.commandExecution.cwd}`)
      }
      if (message.commandExecution.exitCode !== null) {
        lines.push(`exitCode: ${message.commandExecution.exitCode}`)
      }
      lines.push(message.commandExecution.aggregatedOutput || '(no output)')
      lines.push('```')
      lines.push('')
    }

    if (message.fileAttachments && message.fileAttachments.length > 0) {
      lines.push('Attachments:')
      for (const attachment of message.fileAttachments) {
        lines.push(`- ${attachment.path}`)
      }
      lines.push('')
    }

    if (message.images && message.images.length > 0) {
      lines.push('Images:')
      for (const imageUrl of message.images) {
        lines.push(`- ${imageUrl}`)
      }
      lines.push('')
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function buildExportFileName(): string {
  const threadTitle = selectedThread.value?.title?.trim() || 'chat'
  const sanitized = threadTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = sanitized || 'chat'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${base}-${stamp}.md`
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!])/g, '\\$1')
}

function loadBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  if (v === null) return fallback
  return v === '1'
}

function loadDarkModePref(): 'system' | 'light' | 'dark' {
  if (typeof window === 'undefined') return 'system'
  const v = window.localStorage.getItem(DARK_MODE_KEY)
  if (v === 'light' || v === 'dark') return v
  return 'system'
}

function loadInProgressSendModePref(): 'steer' | 'queue' {
  if (typeof window === 'undefined') return 'steer'
  const v = window.localStorage.getItem(IN_PROGRESS_SEND_MODE_KEY)
  if (v === 'steer' || v === 'queue') return v
  return 'queue'
}

function loadChatWidthPref(): ChatWidthMode {
  if (typeof window === 'undefined') return 'standard'
  const value = window.localStorage.getItem(CHAT_WIDTH_KEY)
  return value === 'standard' || value === 'wide' || value === 'extra-wide' ? value : 'standard'
}

function toggleSendWithEnter(): void {
  sendWithEnter.value = !sendWithEnter.value
  window.localStorage.setItem(SEND_WITH_ENTER_KEY, sendWithEnter.value ? '1' : '0')
}

function cycleInProgressSendMode(): void {
  inProgressSendMode.value = inProgressSendMode.value === 'steer' ? 'queue' : 'steer'
  window.localStorage.setItem(IN_PROGRESS_SEND_MODE_KEY, inProgressSendMode.value)
}

function cycleDarkMode(): void {
  const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark']
  const idx = order.indexOf(darkMode.value)
  darkMode.value = order[(idx + 1) % order.length]
  window.localStorage.setItem(DARK_MODE_KEY, darkMode.value)
  applyDarkMode()
}

function cycleChatWidth(): void {
  const order: ChatWidthMode[] = ['standard', 'wide', 'extra-wide']
  const idx = order.indexOf(chatWidth.value)
  chatWidth.value = order[(idx + 1) % order.length]
  window.localStorage.setItem(CHAT_WIDTH_KEY, chatWidth.value)
}

function toggleDictationClickToToggle(): void {
  dictationClickToToggle.value = !dictationClickToToggle.value
  window.localStorage.setItem(DICTATION_CLICK_TO_TOGGLE_KEY, dictationClickToToggle.value ? '1' : '0')
}

function toggleDictationAutoSend(): void {
  dictationAutoSend.value = !dictationAutoSend.value
  window.localStorage.setItem(DICTATION_AUTO_SEND_KEY, dictationAutoSend.value ? '1' : '0')
}


async function onProviderChange(provider: string): Promise<void> {
  if (freeModeLoading.value) return
  freeModeLoading.value = true
  try {
    if (provider === 'codex') {
      selectedProvider.value = 'codex'
      const result = await setFreeMode(false)
      freeModeEnabled.value = result.enabled
    } else if (provider === 'openrouter') {
      selectedProvider.value = 'openrouter'
      const result = await setFreeMode(true)
      freeModeEnabled.value = result.enabled
      await setCustomProvider('', '', {
        wireApi: openRouterWireApi.value,
        provider: 'openrouter',
      })
    } else if (provider === 'opencode-zen') {
      selectedProvider.value = 'opencode-zen'
      await setCustomProvider('', opencodeZenKey.value.trim(), {
        wireApi: 'chat',
        provider: 'opencode-zen',
      })
      freeModeEnabled.value = true
    } else if (provider === 'custom') {
      selectedProvider.value = 'custom'
      if (customEndpointUrl.value.trim() && customEndpointKey.value.trim()) {
        await setCustomProvider(customEndpointUrl.value.trim(), customEndpointKey.value.trim(), {
          wireApi: customEndpointWireApi.value,
        })
        freeModeEnabled.value = true
      }
    }
    providerError.value = ''
    await refreshAll({ includeSelectedThreadMessages: false, providerChanged: true, awaitAncillaryRefreshes: true })
    if (route.name === 'thread') {
      void router.push({ name: 'home' })
    }
  } catch (err) {
    providerError.value = err instanceof Error ? err.message : 'Failed to switch provider'
  } finally {
    freeModeLoading.value = false
  }
}

async function saveCustomEndpoint(): Promise<void> {
  if (freeModeCustomKeySaving.value) return
  const url = customEndpointUrl.value.trim()
  if (!url) return
  freeModeCustomKeySaving.value = true
  try {
    providerError.value = ''
    await setCustomProvider(url, customEndpointKey.value.trim(), {
      wireApi: customEndpointWireApi.value,
    })
    freeModeEnabled.value = true
    await refreshAll({ includeSelectedThreadMessages: false, providerChanged: true, awaitAncillaryRefreshes: true })
  } catch (err) {
    providerError.value = err instanceof Error ? err.message : 'Failed to save custom endpoint'
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function setOpenRouterWireApi(nextWireApi: 'responses' | 'chat'): Promise<void> {
  if (freeModeCustomKeySaving.value || freeModeLoading.value) return
  if (openRouterWireApi.value === nextWireApi) return
  const previousWireApi = openRouterWireApi.value
  openRouterWireApi.value = nextWireApi
  freeModeCustomKeySaving.value = true
  try {
    providerError.value = ''
    await setCustomProvider('', '', {
      wireApi: nextWireApi,
      provider: 'openrouter',
    })
    freeModeEnabled.value = true
    await refreshAll({ includeSelectedThreadMessages: false, providerChanged: true, awaitAncillaryRefreshes: true })
  } catch (err) {
    openRouterWireApi.value = previousWireApi
    providerError.value = err instanceof Error ? err.message : 'Failed to save OpenRouter API format'
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function saveOpencodeZen(): Promise<void> {
  if (freeModeCustomKeySaving.value) return
  const key = opencodeZenKey.value.trim()
  if (!key) return
  freeModeCustomKeySaving.value = true
  try {
    providerError.value = ''
    await setCustomProvider('', key, {
      wireApi: 'chat',
      provider: 'opencode-zen',
    })
    freeModeEnabled.value = true
    await refreshAll({ includeSelectedThreadMessages: false, providerChanged: true, awaitAncillaryRefreshes: true })
  } catch (err) {
    providerError.value = err instanceof Error ? err.message : 'Failed to save OpenCode Zen config'
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function saveFreeModeCustomKey(): Promise<void> {
  if (freeModeCustomKeySaving.value) return
  freeModeCustomKeySaving.value = true
  try {
    const key = freeModeCustomKey.value.trim()
    await setFreeModeCustomKey(key)
    freeModeCustomKey.value = ''
    await loadFreeModeStatus()
    await refreshAll({ includeSelectedThreadMessages: false })
  } catch {
    // Silently fail
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function clearFreeModeCustomKey(): Promise<void> {
  if (freeModeCustomKeySaving.value) return
  freeModeCustomKeySaving.value = true
  try {
    await setFreeModeCustomKey('')
    freeModeCustomKey.value = ''
    await loadFreeModeStatus()
    await refreshAll({ includeSelectedThreadMessages: false })
  } catch {
    // Silently fail
  } finally {
    freeModeCustomKeySaving.value = false
  }
}

async function loadFreeModeStatus(): Promise<void> {
  try {
    const status = await getFreeModeStatus()
    freeModeEnabled.value = status.enabled
    freeModeHasCustomKey.value = status.customKey ?? false
    freeModeCustomKeyMasked.value = status.maskedKey ?? null
    if (status.enabled) {
      if (status.provider === 'opencode-zen') {
        selectedProvider.value = 'opencode-zen'
      } else if (status.provider === 'custom') {
        selectedProvider.value = 'custom'
        customEndpointUrl.value = status.customBaseUrl ?? ''
        customEndpointWireApi.value = status.wireApi === 'chat' ? 'chat' : 'responses'
      } else {
        selectedProvider.value = 'openrouter'
        openRouterWireApi.value = status.wireApi === 'chat' ? 'chat' : 'responses'
      }
    } else {
      selectedProvider.value = 'codex'
    }
  } catch {
    // Ignore — free mode status unknown
  }
}

function onDictationLanguageChange(nextValue: string): void {
  const normalized = normalizeToWhisperLanguage(nextValue.trim())
  const value = normalized || 'auto'
  dictationLanguage.value = value
  window.localStorage.setItem(DICTATION_LANGUAGE_KEY, value)
}

function loadDictationLanguagePref(): string {
  if (typeof window === 'undefined') return 'auto'
  const value = window.localStorage.getItem(DICTATION_LANGUAGE_KEY)?.trim() || 'auto'
  const normalized = normalizeToWhisperLanguage(value)
  return normalized || 'auto'
}

function buildDictationLanguageOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [{ value: 'auto', label: t('Auto-detect') }]
  const seen = new Set<string>(['auto'])
  function formatLanguageLabel(value: string): string {
    const languageName = WHISPER_LANGUAGES[value] || value
    const title = languageName.charAt(0).toUpperCase() + languageName.slice(1)
    return `${title} (${value})`
  }

  for (const raw of typeof navigator !== 'undefined' ? (navigator.languages ?? []) : []) {
    const value = normalizeToWhisperLanguage(raw)
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: `Preferred: ${formatLanguageLabel(value)}`,
    })
  }

  for (const value of Object.keys(WHISPER_LANGUAGES)) {
    if (seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: formatLanguageLabel(value),
    })
  }

  const current = dictationLanguage.value.trim()
  if (current && !seen.has(current)) {
    options.push({
      value: current,
      label: formatLanguageLabel(current),
    })
  }

  return options
}

function normalizeToWhisperLanguage(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value || value === 'auto') return ''
  if (value in WHISPER_LANGUAGES) return value
  const base = value.split('-')[0] ?? value
  if (base in WHISPER_LANGUAGES) return base
  return ''
}

function applyDarkMode(): void {
  const root = document.documentElement
  if (darkMode.value === 'dark') {
    root.classList.add('dark')
  } else if (darkMode.value === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
}

function saveSidebarCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, value ? '1' : '0')
}

function loadAccountsSectionCollapsed(): boolean {
  if (typeof window === 'undefined') return true
  const value = window.localStorage.getItem(ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY)
  if (value === null) return true
  return value === '1'
}

function toggleAccountsSectionCollapsed(): void {
  isAccountsSectionCollapsed.value = !isAccountsSectionCollapsed.value
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    ACCOUNTS_SECTION_COLLAPSED_STORAGE_KEY,
    isAccountsSectionCollapsed.value ? '1' : '0',
  )
}

function normalizeMessageType(rawType: string | undefined, role: string): string {
  const normalized = (rawType ?? '').trim()
  if (normalized.length > 0) {
    return normalized
  }
  return role.trim() || 'message'
}

function onSelectCollaborationMode(mode: 'default' | 'plan'): void {
  setSelectedCollaborationMode(mode)
}

async function initialize(): Promise<void> {
  await router.isReady()

  if (route.name === 'thread' && routeThreadId.value) {
    primeSelectedThread(routeThreadId.value)
  }

  await refreshAll({
    includeSelectedThreadMessages: route.name === 'thread',
  })
  void loadAccountsState({ silent: true })
  await applyLaunchProjectPathFromUrl()
  hasInitialized.value = true
  await syncThreadSelectionWithRoute()
  startPolling()
}

async function syncThreadSelectionWithRoute(): Promise<void> {
  if (isRouteSyncInProgress.value) {
    hasPendingRouteSync = true
    return
  }
  isRouteSyncInProgress.value = true

  try {
    do {
      hasPendingRouteSync = false

      if (route.name === 'home' || route.name === 'skills') {
        if (selectedThreadId.value !== '') {
          await selectThread('')
        }
        continue
      }

      if (route.name === 'thread') {
        const threadId = routeThreadId.value
        if (!threadId) continue

        if (selectedThreadId.value !== threadId) {
          await selectThread(threadId)
        } else {
          void ensureThreadMessagesLoaded(threadId, { silent: true })
        }
      }
    } while (hasPendingRouteSync)

  } finally {
    isRouteSyncInProgress.value = false
  }
}

watch(
  () =>
    [
      route.name,
      routeThreadId.value,
      isLoadingThreads.value,
      selectedThreadId.value,
    ] as const,
  async () => {
    if (!hasInitialized.value) return
    await syncThreadSelectionWithRoute()
  },
)

watch(
  () => selectedThreadId.value,
  async (threadId) => {
    if (!hasInitialized.value) return
    if (isRouteSyncInProgress.value) return
    if (isHomeRoute.value || isSkillsRoute.value) return

    if (!threadId) {
      if (route.name !== 'home') {
        await router.replace({ name: 'home' })
      }
      return
    }

    if (route.name === 'thread' && routeThreadId.value === threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  },
)

watch(
  () => newThreadFolderOptions.value,
  (options) => {
    if (options.length === 0) {
      newThreadCwd.value = ''
      void refreshDefaultProjectName()
      return
    }
    const selected = newThreadCwd.value.trim()
    if (selected) {
      const hasSelected = options.some((option) => option.value === selected)
      if (!hasSelected) {
        newThreadCwd.value = ''
      }
    }
    void refreshDefaultProjectName()
  },
  { immediate: true },
)

watch(
  () => newThreadCwd.value,
  () => {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    void loadNewThreadAgentOptions()
    void refreshDefaultProjectName()
  },
)

async function loadNewThreadAgentOptions(): Promise<void> {
  const cwd = newThreadCwd.value.trim()
  selectedNewThreadAgentFile.value = 'project:AGENTS.md'
  newThreadAgentOptions.value = []
  if (!cwd) return

  isLoadingNewThreadAgents.value = true
  try {
    const options = await getAgentInstructionsOptions(cwd)
    newThreadAgentOptions.value = options
    if (!options.some((option) => option.value === selectedNewThreadAgentFile.value)) {
      selectedNewThreadAgentFile.value = options[0]?.value ?? 'project:AGENTS.md'
    }
  } catch {
    newThreadAgentOptions.value = []
    selectedNewThreadAgentFile.value = 'project:AGENTS.md'
  } finally {
    isLoadingNewThreadAgents.value = false
  }
}

watch(
  () => [newThreadRuntime.value, newThreadCwd.value] as const,
  ([runtime, cwd]) => {
    if (runtime !== 'worktree') return
    void loadWorktreeBranches(cwd)
  },
  { immediate: true },
)

watch(
  () => newThreadRuntime.value,
  (runtime) => {
    if (runtime === 'local') {
      worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
      const current = newThreadCwd.value.trim()
      if (current && isWorktreePath(current)) {
        const fallbackProjectName = selectedThread.value?.projectName ?? getPathLeafName(current)
        const localCwd = resolvePreferredLocalCwd(fallbackProjectName, '')
        if (localCwd) {
          newThreadCwd.value = localCwd
        }
      }
      return
    }
    void loadWorktreeBranches(newThreadCwd.value)
  },
)

watch(
  () => route.name,
  (name) => {
    if (name !== 'home') {
      worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    }
    if (name !== 'thread') {
      isReviewPaneOpen.value = false
    }
  },
)

watch(
  () => selectedThreadId.value,
  () => {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
  },
)

watch(
  () => [route.name, composerCwd.value] as const,
  ([routeName, cwd]) => {
    if (routeName !== 'thread') {
      threadBranchOptions.value = []
      currentThreadBranch.value = null
      return
    }
    void loadThreadBranches(cwd)
  },
  { immediate: true },
)

watch(
  pageTitle,
  (value) => {
    if (typeof document === 'undefined') return
    document.title = value
  },
  { immediate: true },
)


watch(isMobile, (mobile) => {
  if (mobile && !isSidebarCollapsed.value) {
    setSidebarCollapsed(true)
  }
}, { immediate: true })

async function submitFirstMessageForNewThread(
  text: string,
  imageUrls: string[] = [],
  skills: Array<{ name: string; path: string }> = [],
  fileAttachments: Array<{ label: string; path: string; fsPath: string }> = [],
): Promise<void> {
  try {
    worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
    let targetCwd = newThreadCwd.value
    if (newThreadRuntime.value === 'worktree') {
      worktreeInitStatus.value = {
        phase: 'running',
        title: t('Creating worktree'),
        message: t('Creating a worktree and running setup.'),
      }
      try {
        const created = await createWorktree(newThreadCwd.value, newWorktreeBaseBranch.value)
        targetCwd = created.cwd
        newThreadCwd.value = created.cwd
        worktreeInitStatus.value = { phase: 'idle', title: '', message: '' }
      } catch {
        worktreeInitStatus.value = {
          phase: 'error',
          title: t('Worktree setup failed'),
          message: t('Unable to create worktree. Try again or switch to Local project.'),
        }
        return
      }
    } else if (!targetCwd.trim()) {
      const directory = await createProjectlessThreadDirectory(text)
      targetCwd = directory.cwd
      newThreadCwd.value = directory.cwd
    }
    const selectedAgent = selectedNewThreadAgentOption.value
    const baseInstructions = selectedAgent && !selectedAgent.isDefault ? selectedAgent.content : undefined
    const threadId = await sendMessageToNewThread(text, targetCwd, imageUrls, skills, fileAttachments, baseInstructions)
    if (!threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
    scheduleMobileConversationJumpToLatest()
  } catch {
    // Error is already reflected in state.
  }
}

function buildDirectoryTryPrompt(payload: DirectoryTryItemPayload): string {
  if (payload.prompt?.trim()) return payload.prompt.trim()
  const label = payload.displayName.trim() || payload.name.trim()
  const itemType = payload.kind === 'skill'
    ? 'skill'
    : payload.kind === 'plugin'
      ? 'plugin'
      : payload.kind === 'composio'
        ? 'Composio connector'
        : 'app'
  return `Test ${label} ${itemType}. Give me a list of what it can do and one useful example.`
}

function getDirectoryTryItemKey(payload: DirectoryTryItemPayload): string {
  return `${payload.kind}:${payload.name}:${payload.skillPath ?? ''}`
}

async function onTryDirectoryItem(payload: DirectoryTryItemPayload): Promise<void> {
  if (directoryTryInFlightKey.value) return
  directoryTryInFlightKey.value = getDirectoryTryItemKey(payload)
  const text = buildDirectoryTryPrompt(payload)
  const skills = payload.attachedSkills?.length
    ? payload.attachedSkills
    : payload.kind === 'skill' && payload.skillPath
    ? [{ name: payload.name, path: payload.skillPath }]
    : []
  try {
    const targetCwd = directoryCwd.value.trim() || composerCwd.value.trim()
    const threadId = await sendMessageToNewThread(text, targetCwd, [], skills, [])
    if (!threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
    scheduleMobileConversationJumpToLatest()
  } catch {
    // Error is already reflected in shared thread state.
  } finally {
    directoryTryInFlightKey.value = ''
  }
}

async function loadWorktreeBranches(sourceCwd: string): Promise<void> {
  const normalizedSourceCwd = sourceCwd.trim()
  if (!normalizedSourceCwd) {
    worktreeBranchOptions.value = []
    newWorktreeBaseBranch.value = ''
    return
  }

  isLoadingWorktreeBranches.value = true
  try {
    const options = await getWorktreeBranchOptions(normalizedSourceCwd)
    worktreeBranchOptions.value = options
    const currentSelection = newWorktreeBaseBranch.value.trim()
    const hasCurrentSelection = currentSelection.length > 0 && options.some((option) => option.value === currentSelection)
    if (!hasCurrentSelection) {
      const preferredMainOption = options.find((option) => option.value.trim() === 'main')
      newWorktreeBaseBranch.value = preferredMainOption?.value ?? options[0]?.value ?? ''
    }
  } catch {
    worktreeBranchOptions.value = []
    newWorktreeBaseBranch.value = ''
  } finally {
    isLoadingWorktreeBranches.value = false
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-root {
  @apply h-full flex flex-col select-none;
}

.sidebar-root input,
.sidebar-root textarea {
  @apply select-text;
}

.sidebar-scrollable {
  @apply flex-1 min-h-0 overflow-y-auto py-4 px-2 flex flex-col gap-2;
}

.content-root {
  @apply h-full min-h-0 min-w-0 w-full flex flex-col overflow-y-hidden overflow-x-hidden bg-white;
}

.content-root.is-virtual-keyboard-open {
  height: var(--visual-viewport-height);
  max-height: var(--visual-viewport-height);
  transform: translateY(var(--visual-viewport-offset-top));
}

.sidebar-thread-controls-host {
  @apply mt-1 -translate-y-px px-2 pb-1;
}

.sidebar-search-toggle {
  @apply h-6.75 w-6.75 rounded-md border border-transparent bg-transparent text-zinc-600 flex items-center justify-center transition hover:border-zinc-200 hover:bg-zinc-50;
}

.sidebar-search-toggle[aria-pressed='true'] {
  @apply border-zinc-300 bg-zinc-100 text-zinc-700;
}

.sidebar-search-toggle-icon {
  @apply w-4 h-4;
}

.sidebar-search-bar {
  @apply flex items-center gap-1.5 mx-2 px-2 py-1 rounded-md border border-zinc-200 bg-white transition-colors focus-within:border-zinc-400;
}

.sidebar-search-bar-icon {
  @apply w-3.5 h-3.5 text-zinc-400 shrink-0;
}

.sidebar-search-input {
  @apply flex-1 min-w-0 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 outline-none border-none p-0;
}

.sidebar-search-clear {
  @apply w-4 h-4 rounded text-zinc-400 flex items-center justify-center transition hover:text-zinc-600;
}

.sidebar-search-clear-icon {
  @apply w-3.5 h-3.5;
}

.sidebar-skills-link {
  @apply mx-2 flex items-center gap-3 rounded-2xl border border-transparent bg-transparent px-3 py-2.5 text-left text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 cursor-pointer;
}

.sidebar-skills-link.is-active {
  @apply border-transparent bg-zinc-100 text-zinc-950;
}

.sidebar-skills-link-icon {
  @apply flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white;
}

.sidebar-skills-link-icon :deep(svg) {
  @apply h-5 w-5;
}

.sidebar-skills-link-copy {
  @apply flex min-w-0 flex-col;
}

.sidebar-skills-link-title {
  @apply truncate text-sm font-semibold leading-5 tracking-[-0.01em];
}

.sidebar-skills-link-subtitle {
  @apply truncate text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500;
}

.sidebar-thread-controls-header-host {
  @apply ml-1;
}

.skills-route-header-icon {
  @apply flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-[0_16px_32px_-20px_rgba(5,150,105,0.9)];
}

.skills-route-header-icon :deep(svg) {
  @apply h-4.5 w-4.5;
}

:global(:root.dark) .sidebar-skills-link-title {
  @apply text-zinc-50;
}

:global(:root.dark) .sidebar-skills-link-subtitle {
  @apply text-zinc-400;
}

.content-body {
  @apply flex-1 min-h-0 min-w-0 w-full flex flex-col gap-2 sm:gap-3 pt-1 pb-2 sm:pb-4 overflow-x-hidden;
}

.content-root.is-virtual-keyboard-open .content-body {
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
}

.content-root.is-virtual-keyboard-open .content-grid {
  gap: 0.5rem;
}

.content-root.is-virtual-keyboard-open .content-thread {
  min-height: 0;
}

.content-root.is-virtual-keyboard-open .composer-with-queue {
  gap: 0.375rem;
  padding-bottom: max(0.25rem, env(safe-area-inset-bottom));
}

.content-root.is-virtual-keyboard-open .content-thread-terminal-panel {
  min-height: 0;
}

.content-root.is-virtual-keyboard-open .content-keyboard-spacer {
  display: none;
}



.content-error {
  @apply m-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.content-grid {
  @apply flex-1 min-h-0 flex flex-col gap-3;
}

.content-grid-home {
  @apply overflow-y-auto;
}

.content-thread {
  @apply flex-1 min-h-0;
}

.composer-with-queue {
  @apply w-full shrink-0 px-2 sm:px-6 flex flex-col gap-2;
}

.content-thread-terminal-panel {
  @apply w-full;
}

.content-header-terminal-toggle {
  @apply flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 transition hover:bg-zinc-50;
}

.content-header-terminal-toggle[aria-pressed='true'] {
  @apply border-zinc-300 bg-zinc-100 text-zinc-950;
}

.content-header-terminal-toggle-icon {
  @apply h-4 w-4;
}

.content-header-terminal-shortcut {
  @apply hidden text-[11px] text-zinc-500 sm:inline;
}

.content-header-branch-dropdown :deep(.composer-dropdown-trigger) {
  @apply rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50;
}

.content-header-branch-dropdown :deep(.composer-dropdown-value) {
  @apply max-w-40 truncate;
}

.content-header-branch-dropdown :deep(.composer-dropdown-menu-wrap) {
  left: auto;
  right: 0;
}

.content-header-branch-dropdown.is-review-open :deep(.composer-dropdown-trigger) {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800;
}

.content-header-branch-dropdown.is-review-open :deep(.composer-dropdown-chevron) {
  @apply text-white;
}

.new-thread-empty {
  @apply flex-1 min-h-0 flex flex-col items-center justify-center gap-0.5 px-3 sm:px-6;
}

.new-thread-hero {
  @apply m-0 text-2xl sm:text-[2.5rem] font-normal leading-[1.05] text-zinc-900;
}

.new-thread-folder-dropdown {
  @apply text-2xl sm:text-[2.5rem] text-zinc-500;
}

.new-thread-folder-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto p-0 text-2xl sm:text-[2.5rem] leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-value) {
  @apply leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-chevron) {
  @apply h-4 w-4 sm:h-5 sm:w-5 mt-0;
}

.new-thread-folder-selected {
  @apply mt-2 mb-0 max-w-3xl text-center text-xs text-zinc-500 break-all;
}

.new-thread-agents-select {
  @apply mt-3 w-full max-w-3xl;
}

.new-thread-agents-select-label {
  @apply m-0 mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500;
}

.new-thread-agents-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700;
}

:global(:root.dark) .new-thread-agents-select-label {
  @apply text-zinc-500;
}

.new-thread-folder-actions {
  @apply mt-3 flex w-full max-w-3xl flex-wrap items-center justify-center gap-2;
}

.new-thread-launch-card {
  @apply mt-4 w-full max-w-3xl rounded-[28px] border border-emerald-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.2),_transparent_42%),linear-gradient(135deg,_#f4fff8,_#ffffff_58%)] px-5 py-5 text-left shadow-[0_18px_50px_-28px_rgba(5,150,105,0.45)];
}

.new-thread-launch-card-copy {
  @apply flex flex-col gap-2;
}

.new-thread-launch-card-topline {
  @apply flex items-center gap-2;
}

.new-thread-launch-card-badge {
  @apply flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-[0_12px_28px_-18px_rgba(5,150,105,0.9)];
}

.new-thread-launch-card-badge :deep(svg) {
  @apply h-4 w-4;
}

.new-thread-launch-card-eyebrow {
  @apply m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700;
}

.new-thread-launch-card-title {
  @apply m-0 text-xl font-semibold leading-tight text-zinc-950 sm:text-2xl;
}

.new-thread-launch-card-text {
  @apply m-0 max-w-2xl text-sm leading-6 text-zinc-700 sm:text-[15px];
}

.new-thread-launch-card-actions {
  @apply mt-4 flex flex-wrap items-center gap-2;
}

.new-thread-launch-card-pills {
  @apply mt-1 flex flex-wrap gap-2;
}

.new-thread-launch-card-pill {
  @apply inline-flex items-center rounded-full border border-emerald-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700;
}

.new-thread-launch-card-button {
  @apply inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50;
}

.new-thread-launch-card-button-primary {
  @apply border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-600;
}

:global(:root.dark) .new-thread-launch-card {
  @apply border-emerald-900/80 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.2),_transparent_38%),linear-gradient(135deg,_rgba(6,78,59,0.32),_rgba(24,24,27,0.96)_58%)] shadow-[0_24px_64px_-34px_rgba(16,185,129,0.35)];
}

:global(:root.dark) .new-thread-launch-card-eyebrow {
  @apply text-emerald-300;
}

:global(:root.dark) .new-thread-launch-card-badge {
  @apply bg-emerald-500 text-white;
}

:global(:root.dark) .new-thread-launch-card-title {
  @apply text-zinc-50;
}

:global(:root.dark) .new-thread-launch-card-text {
  @apply text-zinc-300;
}

:global(:root.dark) .new-thread-launch-card-pill {
  @apply border-emerald-900 bg-zinc-900/70 text-emerald-300;
}

:global(:root.dark) .new-thread-launch-card-button {
  @apply border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800;
}

:global(:root.dark) .new-thread-launch-card-button-primary {
  @apply border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500;
}

.new-thread-folder-action {
  @apply inline-flex h-9 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60;
}

.new-thread-folder-action-primary {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800;
}

.new-thread-open-folder-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4;
}

.new-thread-open-folder {
  @apply flex w-full max-w-3xl max-h-[90vh] flex-col gap-2 overflow-y-auto rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-left shadow-xl;
}

.new-thread-open-folder-header {
  @apply flex items-center justify-between gap-3;
}

.new-thread-open-folder-title {
  @apply m-0 text-sm font-semibold text-zinc-900;
}

.new-thread-open-folder-close {
  @apply border-0 bg-transparent p-0 text-sm text-zinc-500 transition hover:text-zinc-800;
}

.new-thread-open-folder-label {
  @apply m-0 text-xs font-medium uppercase tracking-wide text-zinc-500;
}

.new-thread-open-folder-current {
  @apply flex items-start gap-2;
}

.new-thread-open-folder-path {
  @apply min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-700 outline-none transition focus:border-zinc-400;
}

.new-thread-open-folder-actions {
  @apply flex flex-wrap items-center gap-2;
}

.new-thread-open-folder-toggle {
  @apply inline-flex items-center gap-2 text-sm text-zinc-600;
}

.new-thread-open-folder-toggle-input {
  @apply relative h-4 w-4 shrink-0 appearance-none rounded-[4px] border border-zinc-300 bg-white outline-none transition;
}

.new-thread-open-folder-toggle-input:focus-visible {
  box-shadow: 0 0 0 3px rgb(228 228 231);
}

.new-thread-open-folder-toggle-input:checked {
  border-color: rgb(24 24 27);
  background-color: rgb(255 255 255);
}

.new-thread-open-folder-toggle-input::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border-right: 2px solid rgb(24 24 27);
  border-bottom: 2px solid rgb(24 24 27);
  transform: rotate(45deg);
  opacity: 0;
}

.new-thread-open-folder-toggle-input:checked::after {
  opacity: 1;
}

.new-thread-open-folder-filter {
  @apply w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400;
}

.new-thread-open-folder-create {
  @apply flex flex-col gap-2;
}

.new-thread-open-folder-create-composer {
  @apply flex items-center gap-2;
}

.new-thread-open-folder-create-input {
  @apply w-full min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400;
}

.new-thread-open-folder-create-submit {
  @apply shrink-0;
}

.new-thread-folder-action[aria-pressed='true'] {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800;
}

.new-thread-open-folder-status {
  @apply m-0 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600;
}

.new-thread-open-folder-error {
  @apply m-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.new-thread-open-folder-error-actions {
  @apply flex flex-wrap items-start gap-2;
}

.new-thread-open-folder-list {
  @apply m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0 pr-3;
  scrollbar-gutter: stable;
  scrollbar-color: rgb(161 161 170) rgb(244 244 245);
  scrollbar-width: thin;
}

.new-thread-open-folder-list::-webkit-scrollbar {
  width: 10px;
}

.new-thread-open-folder-list::-webkit-scrollbar-track {
  background: rgb(244 244 245);
  border-radius: 9999px;
}

.new-thread-open-folder-list::-webkit-scrollbar-thumb {
  background: rgb(161 161 170);
  border-radius: 9999px;
  border: 2px solid rgb(244 244 245);
}

.new-thread-open-folder-list::-webkit-scrollbar-thumb:hover {
  background: rgb(113 113 122);
}

.new-thread-open-folder-item {
  @apply grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1;
}

.new-thread-open-folder-item-main {
  @apply min-w-0 truncate rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-left text-sm font-medium leading-5 text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-100;
}

.new-thread-open-folder-item-main:disabled,
.new-thread-open-folder-item-open:disabled {
  @apply cursor-default opacity-60;
}

.new-thread-open-folder-item-name {
  @apply block truncate;
}

.new-thread-open-folder-item-open {
  @apply inline-flex h-7 items-center justify-center rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50;
}

.new-thread-runtime-dropdown {
  @apply mt-3;
}

.new-thread-branch-select {
  @apply mt-3 w-full max-w-3xl;
}

.new-thread-branch-select-label {
  @apply m-0 mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500;
}

.new-thread-branch-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700;
}

.new-thread-branch-select-help {
  @apply mt-1 mb-0 text-xs text-zinc-500;
}

.new-thread-runtime-help {
  @apply mt-2 mb-0 max-w-3xl text-center text-xs text-zinc-500;
}

.worktree-init-status {
  @apply mt-3 flex w-full max-w-xl flex-col gap-1 rounded-xl border px-3 py-2 text-sm;
}

.worktree-init-status.is-running {
  @apply border-zinc-300 bg-zinc-50 text-zinc-700;
}

.worktree-init-status.is-error {
  @apply border-rose-300 bg-rose-50 text-rose-800;
}

.worktree-init-status-title {
  @apply font-medium;
}

.worktree-init-status-message {
  @apply break-all;
}

.sidebar-settings-area {
  @apply shrink-0 bg-slate-100 pt-2 px-2 pb-2 border-t border-zinc-200;
}

.sidebar-settings-button {
  @apply flex items-center gap-2 w-full rounded-lg border-0 bg-transparent px-2 py-2 text-sm text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900 cursor-pointer;
}

.sidebar-settings-button-version {
  @apply ml-auto min-w-0 truncate text-right text-xs;
}

.sidebar-settings-icon {
  @apply w-4.5 h-4.5;
}

.sidebar-settings-panel {
  @apply mb-1 max-h-[min(70vh,36rem)] overflow-y-auto rounded-lg border border-zinc-200 bg-white;
}

.sidebar-settings-row {
  @apply flex items-center justify-between w-full px-3 py-2.5 text-sm text-zinc-700 border-0 bg-transparent transition hover:bg-zinc-50 cursor-pointer;
}

.sidebar-settings-row--select {
  @apply cursor-default items-center gap-2;
}

.sidebar-settings-language-dropdown {
  @apply min-w-0 max-w-52;
}

.sidebar-settings-language-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-auto rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700;
}

.sidebar-settings-language-dropdown :deep(.composer-dropdown-value) {
  @apply max-w-32;
}

.sidebar-settings-row + .sidebar-settings-row {
  @apply border-t border-zinc-100;
}

.sidebar-settings-telegram-panel {
  @apply border-t border-zinc-100 bg-zinc-50/70 px-3 py-3;
}

.sidebar-settings-field {
  @apply flex flex-col gap-1.5;
}

.sidebar-settings-field + .sidebar-settings-field {
  @apply mt-3;
}

.sidebar-settings-field-label {
  @apply text-xs font-medium text-zinc-700;
}

.sidebar-settings-input,
.sidebar-settings-textarea {
  @apply w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-800 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200;
}

.sidebar-settings-textarea {
  @apply min-h-20 resize-y font-mono text-xs;
}

.sidebar-settings-field-help {
  @apply mt-2 text-xs leading-5 text-zinc-500;
}

.sidebar-settings-telegram-error {
  @apply mt-2 rounded-md bg-rose-50 px-2.5 py-2 text-xs text-rose-700;
}

.sidebar-settings-telegram-actions {
  @apply mt-3 flex items-center justify-end;
}

.sidebar-settings-telegram-save {
  @apply rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-section {
  @apply border-t border-zinc-100 bg-zinc-50/60 px-3 py-3;
}

.sidebar-settings-account-header {
  @apply mb-2 flex items-center justify-between gap-2;
}

.sidebar-settings-account-header-main {
  @apply flex items-center gap-2;
}

.sidebar-settings-account-collapse {
  @apply inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-100;
}

.sidebar-settings-account-collapse-icon {
  @apply text-[11px] leading-none;
}

.sidebar-settings-account-title {
  @apply text-sm font-medium text-zinc-800;
}

.sidebar-settings-account-count {
  @apply rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600;
}

.sidebar-settings-account-error {
  @apply mb-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700;
}

.sidebar-settings-account-refresh {
  @apply shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-empty {
  @apply text-xs text-zinc-500;
}

.sidebar-settings-account-list {
  @apply flex flex-col gap-2;
}

.sidebar-settings-account-item {
  @apply flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2;
}

.sidebar-settings-account-item.is-active {
  @apply border-emerald-200 bg-emerald-50;
}

.sidebar-settings-account-item.is-unavailable {
  @apply border-rose-200 bg-rose-50;
}

.sidebar-settings-account-main {
  @apply min-w-0 flex-1;
}

.sidebar-settings-account-actions {
  @apply flex w-24 shrink-0 flex-col items-end gap-1.5;
}

.sidebar-settings-account-email {
  @apply truncate text-sm text-zinc-800;
}

.sidebar-settings-account-meta {
  @apply truncate text-[11px] text-zinc-500;
}

.sidebar-settings-account-quota {
  @apply truncate text-[11px] text-zinc-600;
}

.sidebar-settings-account-id {
  @apply mt-1 inline-flex max-w-full rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700;
}

.sidebar-settings-account-item.is-active .sidebar-settings-account-id {
  @apply bg-emerald-100 text-emerald-800;
}

.sidebar-settings-account-item.is-unavailable .sidebar-settings-account-id {
  @apply bg-rose-100 text-rose-800;
}

.sidebar-settings-account-switch {
  @apply min-w-[4.75rem] shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-center text-xs text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-remove {
  @apply invisible shrink-0 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] leading-4 text-zinc-500 opacity-0 pointer-events-none transition-colors hover:bg-amber-50 disabled:cursor-default disabled:opacity-60;
}

.sidebar-settings-account-remove.is-visible {
  @apply visible opacity-100 pointer-events-auto;
}

.sidebar-settings-account-remove.is-confirming {
  @apply border-amber-300 bg-amber-50 text-amber-700 font-medium;
}

.sidebar-settings-label {
  @apply text-left;
}

.sidebar-settings-value {
  @apply text-xs text-zinc-500 bg-zinc-100 rounded px-1.5 py-0.5;
}


.sidebar-settings-toggle {
  @apply relative w-9 h-5 rounded-full bg-zinc-300 transition-colors shrink-0;
}

.sidebar-settings-toggle::after {
  content: '';
  @apply absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm;
}

.sidebar-settings-toggle.is-on {
  @apply bg-zinc-800;
}

.sidebar-settings-toggle.is-on::after {
  transform: translateX(16px);
}

.sidebar-settings-row--input {
  @apply flex flex-col gap-1 py-1.5;
}

.sidebar-settings-error {
  @apply text-xs text-red-600 bg-red-50 rounded px-2 py-1.5 break-words;
}

.sidebar-settings-key-group {
  @apply flex items-center gap-1.5 w-full;
}

.sidebar-settings-key-input {
  @apply flex-1 min-w-0 text-xs rounded border border-zinc-200 bg-white px-2 py-1 outline-none transition-colors placeholder:text-zinc-400;
}

.sidebar-settings-key-input:focus {
  @apply border-zinc-400;
}

.sidebar-settings-key-save {
  @apply shrink-0 rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-default;
}

.sidebar-settings-key-masked {
  @apply flex-1 min-w-0 text-xs text-zinc-500 font-mono truncate;
}

.sidebar-settings-key-clear {
  @apply shrink-0 w-6 h-6 flex items-center justify-center rounded-full border border-zinc-200 text-xs text-zinc-400 transition-colors hover:text-zinc-600 hover:border-zinc-300 disabled:opacity-40;
}

.sidebar-settings-provider-select {
  @apply min-w-0 max-w-40 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none transition-colors cursor-pointer;
}

.sidebar-settings-provider-select:focus {
  @apply border-zinc-400 ring-2 ring-zinc-200;
}

.sidebar-settings-segmented {
  @apply inline-flex items-center rounded-md border border-zinc-200 bg-white p-0.5;
}

.sidebar-settings-segmented-option {
  @apply rounded px-2 py-1 text-xs text-zinc-600 transition-colors;
}

.sidebar-settings-segmented-option.is-active {
  @apply bg-zinc-800 text-white;
}

.sidebar-settings-provider-info {
  @apply flex items-center justify-between w-full;
}

.sidebar-settings-provider-link {
  @apply text-xs text-blue-600 hover:text-blue-700 underline shrink-0;
}

:root.dark .sidebar-settings-provider-select {
  @apply border-zinc-600 bg-zinc-800 text-zinc-200;
}

:root.dark .sidebar-settings-provider-select:focus {
  @apply border-zinc-500 ring-zinc-700;
}

:root.dark .sidebar-settings-segmented {
  @apply border-zinc-600 bg-zinc-800;
}

:root.dark .sidebar-settings-segmented-option {
  @apply text-zinc-300;
}

:root.dark .sidebar-settings-segmented-option.is-active {
  @apply bg-zinc-100 text-zinc-900;
}

:root.dark .sidebar-settings-provider-link {
  @apply text-blue-400 hover:text-blue-300;
}

:root.dark .sidebar-settings-key-input {
  @apply border-zinc-600 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500;
}

:root.dark .sidebar-settings-key-input:focus {
  @apply border-zinc-500;
}

:root.dark .sidebar-settings-key-save {
  @apply border-zinc-600 bg-zinc-700 text-zinc-200 hover:bg-zinc-600;
}

:root.dark .sidebar-settings-key-masked {
  @apply text-zinc-400;
}

:root.dark .sidebar-settings-key-clear {
  @apply border-zinc-600 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500;
}

.settings-panel-enter-active,
.settings-panel-leave-active {
  transition: all 150ms ease;
}

.settings-panel-enter-from,
.settings-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.sidebar-settings-context-row {
  @apply cursor-default;
}

.sidebar-settings-context-value {
  @apply text-xs font-semibold text-zinc-700 text-right;
}

.sidebar-settings-context-value[data-state='ok'] {
  @apply text-emerald-700;
}

.sidebar-settings-context-value[data-state='warning'] {
  @apply text-amber-700;
}

.sidebar-settings-context-value[data-state='danger'] {
  @apply text-rose-700;
}

.sidebar-settings-context-meta {
  @apply block text-[11px] font-normal text-zinc-500;
}

.sidebar-settings-rate-limits {
  @apply border-t border-zinc-200 px-2 pt-2;
}

.sidebar-settings-build-label {
  @apply border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-500;
}

</style>
