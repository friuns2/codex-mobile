<template>
  <section class="thread-tree-root" :class="{ 'chats-first': showChatsFirst }">
    <section v-if="pinnedThreads.length > 0" class="pinned-section">
      <SidebarMenuRow
        as="button"
        class="section-toggle-row"
        type="button"
        :aria-expanded="isPinnedSectionExpanded"
        @click="togglePinnedSection"
      >
        <template #left>
          <IconTablerChevronRight v-if="!isPinnedSectionExpanded" class="thread-icon" />
          <IconTablerChevronDown v-else class="thread-icon" />
        </template>
        <span class="thread-tree-header">{{ t('Pinned') }}</span>
      </SidebarMenuRow>

      <ul v-if="isPinnedSectionExpanded" class="thread-list">
        <li
          v-for="thread in pinnedThreads"
          :key="thread.id"
          class="thread-row-item"
          :data-menu-open="isThreadMenuOpen(thread.id) ? 'true' : 'false'"
        >
          <SidebarMenuRow
            class="thread-row"
            :data-active="thread.id === selectedThreadId"
            :data-pinned="isPinned(thread.id)"
            :data-menu-open="isThreadMenuOpen(thread.id) ? 'true' : 'false'"
            :force-right-hover="isThreadMenuOpen(thread.id)"
            @click="onSelect(thread.id)"
            @mouseleave="onThreadRowLeave(thread.id, $event)"
            @contextmenu="onThreadRowContextMenu($event, thread.id)"
          >
            <template #left>
              <span class="thread-left-stack">
                <span v-if="shouldShowThreadIndicator(thread)" class="thread-status-indicator" :data-state="getThreadState(thread)" />
                <button
                  class="thread-delete-button"
                  type="button"
                  :data-confirming="isInlineDeleteConfirming(thread.id)"
                  :title="isInlineDeleteConfirming(thread.id) ? 'Confirm delete' : t('Delete thread')"
                  @click.stop="onInlineDeleteClick(thread.id)"
                >
                  <span v-if="isInlineDeleteConfirming(thread.id)" class="thread-delete-confirm-label">Confirm</span>
                  <IconTablerTrash v-else class="thread-icon" />
                </button>
              </span>
            </template>
            <button class="thread-main-button" type="button" @click.stop="onSelect(thread.id)">
              <span class="thread-row-title-wrap">
                <span class="thread-row-title-line">
                  <span class="thread-row-title">{{ thread.title }}</span>
                  <IconTablerGitFork v-if="thread.hasWorktree" class="thread-row-worktree-icon" :title="t('Worktree thread')" />
                  <span
                    v-if="threadHasAutomation(thread.id)"
                    class="thread-row-automation-chip"
                    :title="threadAutomationTooltip(thread.id)"
                  >
                    <IconTablerBolt class="thread-row-automation-icon" />
                    <span v-if="threadAutomationCount(thread.id) > 1" class="thread-row-automation-count">
                      {{ threadAutomationCount(thread.id) }}
                    </span>
                  </span>
                  <span
                    v-if="thread.pendingRequestState"
                    class="thread-row-request-chip"
                    :data-state="thread.pendingRequestState"
                  >
                    {{ threadRequestLabel(thread) }}
                  </span>
                </span>
              </span>
            </button>
            <template #right>
              <span class="thread-row-time">{{ formatRelativeThread(thread) }}</span>
            </template>
            <template #right-hover>
              <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                <button
                  class="thread-menu-trigger"
                  type="button"
                  title="thread_menu"
                  @click.stop="toggleThreadMenu(thread.id)"
                >
                  <IconTablerDots class="thread-icon" />
                </button>
              </div>
            </template>
          </SidebarMenuRow>
        </li>
      </ul>
    </section>

    <section class="projects-section">
      <SidebarMenuRow
        as="button"
        class="thread-tree-header-row section-toggle-row"
        type="button"
        :aria-expanded="isProjectsSectionExpanded"
        @click="toggleProjectsSection"
      >
        <template #left>
          <IconTablerChevronRight v-if="!isProjectsSectionExpanded" class="thread-icon" />
          <IconTablerChevronDown v-else class="thread-icon" />
        </template>
        <span class="thread-tree-header">{{ t('Projects') }}</span>
        <template #right>
          <div ref="organizeMenuWrapRef" class="organize-menu-wrap">
            <button
              class="organize-menu-trigger"
              type="button"
              :aria-expanded="isOrganizeMenuOpen"
              :aria-label="t('Organize threads')"
              :title="t('Organize threads')"
              @click.stop="toggleOrganizeMenu"
            >
              <IconTablerDots class="thread-icon" />
            </button>

            <div v-if="isOrganizeMenuOpen" class="organize-menu-panel" @click.stop>
              <p class="organize-menu-title">{{ t('Organize') }}</p>
              <button
                class="organize-menu-item"
                :data-active="threadViewMode === 'project'"
                type="button"
                @click="setThreadViewMode('project')"
              >
                <span>{{ t('By project') }}</span>
                <span v-if="threadViewMode === 'project'">✓</span>
              </button>
              <button
                class="organize-menu-item"
                :data-active="threadViewMode === 'chronological'"
                type="button"
                @click="setThreadViewMode('chronological')"
              >
                <span>{{ t('Chronological list') }}</span>
                <span v-if="threadViewMode === 'chronological'">✓</span>
              </button>
              <button
                class="organize-menu-item"
                :data-active="showChatsFirst"
                type="button"
                @click="toggleShowChatsFirst"
              >
                <span>{{ t('Chats first') }}</span>
                <span v-if="showChatsFirst">✓</span>
              </button>
              <div class="organize-menu-separator" />
              <p class="organize-menu-title">{{ t('Sort by') }}</p>
              <button
                class="organize-menu-item"
                :data-active="chatSortMode === 'created'"
                type="button"
                @click="setChatSortMode('created')"
              >
                <span>{{ t('Created') }}</span>
                <span v-if="chatSortMode === 'created'">✓</span>
              </button>
              <button
                class="organize-menu-item"
                :data-active="chatSortMode === 'updated'"
                type="button"
                @click="setChatSortMode('updated')"
              >
                <span>{{ t('Updated') }}</span>
                <span v-if="chatSortMode === 'updated'">✓</span>
              </button>
            </div>
          </div>
        </template>
      </SidebarMenuRow>

      <template v-if="isProjectsSectionExpanded">
      <p v-if="projectAutomationActionError" class="thread-tree-action-error">{{ projectAutomationActionError }}</p>

      <p v-if="isSearchActive && filteredGroups.length === 0" class="thread-tree-no-results">{{ t('No matching threads') }}</p>

      <p v-else-if="isLoading && groups.length === 0" class="thread-tree-loading">{{ t('Loading threads...') }}</p>

      <ul v-else-if="isChronologicalView" class="thread-list thread-list-global">
      <li
        v-for="thread in globalThreads"
        :key="thread.id"
        class="thread-row-item"
        :data-menu-open="isThreadMenuOpen(thread.id) ? 'true' : 'false'"
      >
        <SidebarMenuRow
          class="thread-row"
          :data-active="thread.id === selectedThreadId"
          :data-pinned="isPinned(thread.id)"
          :data-menu-open="isThreadMenuOpen(thread.id) ? 'true' : 'false'"
          :force-right-hover="isThreadMenuOpen(thread.id)"
          @click="onSelect(thread.id)"
          @mouseleave="onThreadRowLeave(thread.id, $event)"
          @contextmenu="onThreadRowContextMenu($event, thread.id)"
        >
          <template #left>
            <span class="thread-left-stack">
              <span
                v-if="shouldShowThreadIndicator(thread)"
                class="thread-status-indicator"
                :data-state="getThreadState(thread)"
              />
              <button
                class="thread-delete-button"
                type="button"
                :data-confirming="isInlineDeleteConfirming(thread.id)"
                :title="isInlineDeleteConfirming(thread.id) ? 'Confirm delete' : t('Delete thread')"
                @click.stop="onInlineDeleteClick(thread.id)"
              >
                <span v-if="isInlineDeleteConfirming(thread.id)" class="thread-delete-confirm-label">Confirm</span>
                <IconTablerTrash v-else class="thread-icon" />
              </button>
            </span>
          </template>
          <button class="thread-main-button" type="button" @click.stop="onSelect(thread.id)">
            <span class="thread-row-title-wrap">
              <span class="thread-row-title-line">
                <span class="thread-row-title">{{ thread.title }}</span>
                <IconTablerGitFork v-if="thread.hasWorktree" class="thread-row-worktree-icon" :title="t('Worktree thread')" />
                <span
                  v-if="threadHasAutomation(thread.id)"
                  class="thread-row-automation-chip"
                  :title="threadAutomationTooltip(thread.id)"
                >
                  <IconTablerBolt class="thread-row-automation-icon" />
                  <span v-if="threadAutomationCount(thread.id) > 1" class="thread-row-automation-count">
                    {{ threadAutomationCount(thread.id) }}
                  </span>
                </span>
                <span
                  v-if="thread.pendingRequestState"
                  class="thread-row-request-chip"
                  :data-state="thread.pendingRequestState"
                >
                  {{ threadRequestLabel(thread) }}
                </span>
              </span>
            </span>
          </button>
          <template #right>
            <span class="thread-row-time">{{ formatRelativeThread(thread) }}</span>
          </template>
          <template #right-hover>
            <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
              <button
                class="thread-menu-trigger"
                type="button"
                title="thread_menu"
                @click.stop="toggleThreadMenu(thread.id)"
              >
                <IconTablerDots class="thread-icon" />
              </button>
            </div>
          </template>
        </SidebarMenuRow>
      </li>
    </ul>

    <div v-else ref="groupsContainerRef" class="thread-tree-groups" :style="groupsContainerStyle">
      <article
        v-for="group in filteredGroups"
        :key="group.projectName"
        :ref="(el) => setProjectGroupRef(group.projectName, el)"
        class="project-group"
        :data-project-name="group.projectName"
        :data-expanded="!isCollapsed(group.projectName)"
        :data-dragging="isDraggingProject(group.projectName)"
        :style="projectGroupStyle(group.projectName)"
      >
          <SidebarMenuRow
            as="div"
            class="project-header-row"
            role="button"
            tabindex="0"
            @click="toggleProjectCollapse(group.projectName)"
            @contextmenu.prevent="openProjectContextMenu(group.projectName)"
            @keydown="onProjectHeaderKeyDown($event, group.projectName)"
            @keydown.enter.prevent="toggleProjectCollapse(group.projectName)"
            @keydown.space.prevent="toggleProjectCollapse(group.projectName)"
          >
            <template #left>
              <span class="project-icon-stack">
                <span class="project-icon-folder">
                  <IconTablerFolder v-if="isCollapsed(group.projectName)" class="thread-icon" />
                  <IconTablerFolderOpen v-else class="thread-icon" />
                </span>
                <span class="project-icon-chevron">
                  <IconTablerChevronRight v-if="isCollapsed(group.projectName)" class="thread-icon" />
                  <IconTablerChevronDown v-else class="thread-icon" />
                </span>
              </span>
            </template>
            <span
              class="project-main-button"
              :data-dragging-handle="isDraggingProject(group.projectName)"
              @mousedown.left="onProjectHandleMouseDown($event, group.projectName)"
            >
              <span class="project-title" :title="getProjectTooltipTitle(group.projectName)">
                {{ getProjectVisibleName(group) }}
              </span>
              <span
                v-if="projectHasAutomation(group.projectName)"
                class="thread-row-automation-chip"
                :title="projectAutomationTooltip(group.projectName)"
              >
                <IconTablerBolt class="thread-row-automation-icon" />
                <span v-if="projectAutomationCount(group.projectName) > 1" class="thread-row-automation-count">
                  {{ projectAutomationCount(group.projectName) }}
                </span>
              </span>
            </span>
            <template #right>
              <div class="project-hover-controls">
                <div :ref="(el) => setProjectMenuWrapRef(group.projectName, el)" class="project-menu-wrap">
                  <button
                    class="project-menu-trigger"
                    type="button"
                    title="project_menu"
                    @click.stop="toggleProjectMenu(group.projectName)"
                  >
                    <IconTablerDots class="thread-icon" />
                  </button>

                  <div
                    v-if="isProjectMenuOpen(group.projectName)"
                    class="project-menu-panel"
                    :data-open-direction="projectMenuDirectionById[group.projectName] ?? 'down'"
                    @click.stop
                  >
                    <template v-if="projectMenuMode === 'actions'">
                      <button class="project-menu-item" type="button" @click="onBrowseProjectFiles(group.projectName)">
                        Browse files
                      </button>
                      <button class="project-menu-item" type="button" @click="onSaveProject(group.projectName)">
                        Export Project
                      </button>
                      <button class="project-menu-item" type="button" @click="openProjectAutomationDialog(group.projectName)">
                        {{ projectHasAutomation(group.projectName) ? 'Manage automations…' : 'Add automation…' }}
                      </button>
                      <button
                        v-if="projectGitRepoByName[group.projectName]"
                        class="project-menu-item"
                        type="button"
                        @click="onCreateProjectWorktree(group.projectName)"
                      >
                        New worktree
                      </button>
                      <button class="project-menu-item" type="button" @click="openRenameProjectMenu(group)">
                        Rename project
                      </button>
                      <button
                        class="project-menu-item project-menu-item-danger"
                        type="button"
                        @click="onRemoveProject(group.projectName)"
                      >
                        Remove
                      </button>
                    </template>
                    <template v-else>
                      <label class="project-menu-label">{{ t('Project name') }}</label>
                      <input
                        v-model="projectRenameDraft"
                        class="project-menu-input"
                        type="text"
                        @input="onProjectNameInput(group.projectName)"
                      />
                    </template>
                  </div>
                </div>

                <button
                  class="thread-start-button"
                  type="button"
                  :aria-label="getNewThreadButtonAriaLabel(group.projectName)"
                  :title="getNewThreadButtonAriaLabel(group.projectName)"
                  @click.stop="onStartNewThread(group.projectName)"
                >
                  <IconTablerFilePencil class="thread-icon" />
                </button>
              </div>
            </template>
          </SidebarMenuRow>

          <ul v-if="hasThreads(group)" class="thread-list">
            <li
              v-for="thread in visibleThreads(group)"
              :key="thread.id"
              class="thread-row-item"
              :data-menu-open="isThreadMenuOpen(thread.id) ? 'true' : 'false'"
            >
              <SidebarMenuRow
                class="thread-row"
                :data-active="thread.id === selectedThreadId"
                :data-pinned="isPinned(thread.id)"
                :data-menu-open="isThreadMenuOpen(thread.id) ? 'true' : 'false'"
                :force-right-hover="isThreadMenuOpen(thread.id)"
                @click="onSelect(thread.id)"
                @mouseleave="onThreadRowLeave(thread.id, $event)"
                @contextmenu="onThreadRowContextMenu($event, thread.id)"
              >
                <template #left>
                  <span class="thread-left-stack">
                    <span
                      v-if="shouldShowThreadIndicator(thread)"
                      class="thread-status-indicator"
                      :data-state="getThreadState(thread)"
                    />
                    <button
                      class="thread-delete-button"
                      type="button"
                      :data-confirming="isInlineDeleteConfirming(thread.id)"
                      :title="isInlineDeleteConfirming(thread.id) ? 'Confirm delete' : t('Delete thread')"
                      @click.stop="onInlineDeleteClick(thread.id)"
                    >
                      <span v-if="isInlineDeleteConfirming(thread.id)" class="thread-delete-confirm-label">Confirm</span>
                      <IconTablerTrash v-else class="thread-icon" />
                    </button>
                  </span>
                </template>
                <button class="thread-main-button" type="button" @click.stop="onSelect(thread.id)">
                  <span class="thread-row-title-wrap">
                    <span class="thread-row-title-line">
                      <span class="thread-row-title">{{ thread.title }}</span>
                      <IconTablerGitFork v-if="thread.hasWorktree" class="thread-row-worktree-icon" :title="t('Worktree thread')" />
                      <span
                        v-if="threadHasAutomation(thread.id)"
                        class="thread-row-automation-chip"
                        :title="threadAutomationTooltip(thread.id)"
                      >
                        <IconTablerBolt class="thread-row-automation-icon" />
                        <span v-if="threadAutomationCount(thread.id) > 1" class="thread-row-automation-count">
                          {{ threadAutomationCount(thread.id) }}
                        </span>
                      </span>
                      <span
                        v-if="thread.pendingRequestState"
                        class="thread-row-request-chip"
                        :data-state="thread.pendingRequestState"
                      >
                        {{ threadRequestLabel(thread) }}
                      </span>
                    </span>
                  </span>
                </button>
                <template #right>
                  <span class="thread-row-time">{{ formatRelativeThread(thread) }}</span>
                </template>
                <template #right-hover>
                  <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                    <button
                      class="thread-menu-trigger"
                      type="button"
                      title="thread_menu"
                      @click.stop="toggleThreadMenu(thread.id)"
                    >
                      <IconTablerDots class="thread-icon" />
                    </button>
                  </div>
                </template>
              </SidebarMenuRow>
            </li>
          </ul>

          <SidebarMenuRow v-else as="p" class="project-empty-row">
            <template #left>
              <span class="project-empty-spacer" />
            </template>
            <span class="project-empty">{{ t('No threads') }}</span>
          </SidebarMenuRow>

          <SidebarMenuRow v-if="hasHiddenThreads(group)" class="thread-show-more-row">
            <template #left>
              <span class="thread-show-more-spacer" />
            </template>
            <button class="thread-show-more-button" type="button" @click="toggleProjectExpansion(group.projectName)">
              {{ isExpanded(group.projectName) ? 'Show less' : 'Show more' }}
            </button>
          </SidebarMenuRow>
      </article>
    </div>
      </template>
    </section>

    <section class="chats-section">
      <SidebarMenuRow
        as="button"
        class="section-toggle-row"
        type="button"
        :aria-expanded="isChatsSectionExpanded"
        @click="toggleChatsSection"
      >
        <template #left>
          <IconTablerChevronRight v-if="!isChatsSectionExpanded" class="thread-icon" />
          <IconTablerChevronDown v-else class="thread-icon" />
        </template>
        <span class="thread-tree-header">{{ t('Chats') }}</span>
        <template #right>
          <div class="chats-section-actions">
            <button
              class="chats-section-action"
              type="button"
              :aria-label="t('New chat')"
              :title="t('New chat')"
              @click.stop="$emit('start-new-chat')"
            >
              <IconTablerFilePencil class="thread-icon" />
            </button>
          </div>
        </template>
      </SidebarMenuRow>

      <p v-if="isChatsSectionExpanded && chatThreads.length === 0" class="thread-tree-no-results">{{ t('No chats') }}</p>
      <ul v-else-if="isChatsSectionExpanded" class="thread-list thread-list-global">
        <li
          v-for="thread in visibleChatThreads"
          :key="thread.id"
          class="thread-row-item"
          :data-menu-open="isThreadMenuOpen(thread.id) ? 'true' : 'false'"
        >
          <SidebarMenuRow
            class="thread-row"
            :data-active="thread.id === selectedThreadId"
            :data-pinned="isPinned(thread.id)"
            :data-menu-open="isThreadMenuOpen(thread.id) ? 'true' : 'false'"
            :force-right-hover="isThreadMenuOpen(thread.id)"
            @click="onSelect(thread.id)"
            @mouseleave="onThreadRowLeave(thread.id, $event)"
            @contextmenu="onThreadRowContextMenu($event, thread.id)"
          >
            <template #left>
              <span class="thread-left-stack">
                <span
                  v-if="shouldShowThreadIndicator(thread)"
                  class="thread-status-indicator"
                  :data-state="getThreadState(thread)"
                />
                <button
                  class="thread-delete-button"
                  type="button"
                  :data-confirming="isInlineDeleteConfirming(thread.id)"
                  :title="isInlineDeleteConfirming(thread.id) ? 'Confirm delete' : t('Delete thread')"
                  @click.stop="onInlineDeleteClick(thread.id)"
                >
                  <span v-if="isInlineDeleteConfirming(thread.id)" class="thread-delete-confirm-label">Confirm</span>
                  <IconTablerTrash v-else class="thread-icon" />
                </button>
              </span>
            </template>
            <button class="thread-main-button" type="button" @click.stop="onSelect(thread.id)">
              <span class="thread-row-title-wrap">
                <span class="thread-row-title-line">
                  <span class="thread-row-title">{{ thread.title }}</span>
                  <IconTablerGitFork v-if="thread.hasWorktree" class="thread-row-worktree-icon" :title="t('Worktree thread')" />
                  <span
                    v-if="threadHasAutomation(thread.id)"
                    class="thread-row-automation-chip"
                    :title="threadAutomationTooltip(thread.id)"
                  >
                    <IconTablerBolt class="thread-row-automation-icon" />
                    <span v-if="threadAutomationCount(thread.id) > 1" class="thread-row-automation-count">
                      {{ threadAutomationCount(thread.id) }}
                    </span>
                  </span>
                  <span
                    v-if="thread.pendingRequestState"
                    class="thread-row-request-chip"
                    :data-state="thread.pendingRequestState"
                  >
                    {{ threadRequestLabel(thread) }}
                  </span>
                </span>
              </span>
            </button>
            <template #right>
              <span class="thread-row-time">{{ formatRelativeThread(thread) }}</span>
            </template>
            <template #right-hover>
              <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                <button
                  class="thread-menu-trigger"
                  type="button"
                  title="thread_menu"
                  @click.stop="toggleThreadMenu(thread.id)"
                >
                  <IconTablerDots class="thread-icon" />
                </button>
              </div>
            </template>
          </SidebarMenuRow>
        </li>
      </ul>

      <SidebarMenuRow v-if="isChatsSectionExpanded && hasHiddenChatThreads" class="thread-show-more-row">
        <template #left>
          <span class="thread-show-more-spacer" />
        </template>
        <button class="thread-show-more-button" type="button" @click="toggleChatsListExpansion">
          {{ isChatsListExpanded ? 'Show less' : 'Show more' }}
        </button>
      </SidebarMenuRow>
    </section>

    <Teleport to="body">
      <div
        v-if="openThreadMenuThread"
        ref="openThreadMenuPanelRef"
        class="thread-menu-panel thread-menu-panel-fixed"
        :style="openThreadMenuStyle"
        :data-open-direction="getThreadMenuDirection(openThreadMenuThread.id)"
        @click.stop
      >
        <button class="thread-menu-item" type="button" @click="openAutomationDialog(openThreadMenuThread.id)">
          {{ threadHasAutomation(openThreadMenuThread.id) ? 'Manage automations…' : 'Add automation…' }}
        </button>
        <button class="thread-menu-item" type="button" @click="onBrowseThreadFiles(openThreadMenuThread.id)">
          Browse files
        </button>
        <button class="thread-menu-item" type="button" @click="onSaveThreadProject(openThreadMenuThread.id)">
          Export Project
        </button>
        <button class="thread-menu-item" type="button" @click="onCopyThreadPath(openThreadMenuThread.id)">
          Copy path
        </button>
        <button
          class="thread-menu-item"
          type="button"
          :disabled="openThreadMenuThread.id !== selectedThreadId"
          :title="openThreadMenuThread.id === selectedThreadId ? 'Copy chat' : 'Open this chat before copying'"
          @click="onCopyThreadChat(openThreadMenuThread.id)"
        >
          Copy chat
        </button>
        <button class="thread-menu-item" type="button" @click="onForkThread(openThreadMenuThread.id)">
          Create chat fork
        </button>
        <button class="thread-menu-item" type="button" @click="onTogglePinFromMenu(openThreadMenuThread.id)">
          {{ isPinned(openThreadMenuThread.id) ? 'Unpin thread' : 'Pin thread' }}
        </button>
        <button class="thread-menu-item" type="button" @click="openRenameThreadDialog(openThreadMenuThread.id, openThreadMenuThread.title)">
          {{ t('Rename thread') }}
        </button>
        <button class="thread-menu-item thread-menu-item-danger" type="button" @click="openDeleteThreadDialog(openThreadMenuThread.id, openThreadMenuThread.title)">
          {{ t('Delete thread') }}
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="renameThreadDialogVisible" class="rename-thread-overlay" @click.self="closeRenameThreadDialog">
        <div class="rename-thread-panel" role="dialog" aria-modal="true" aria-label="Thread title">
          <h3 class="rename-thread-title">{{ t('Rename thread') }}</h3>
          <p class="rename-thread-subtitle">Make it short and recognizable.</p>
          <input
            ref="renameThreadInputRef"
            v-model="renameThreadDraft"
            class="rename-thread-input"
            type="text"
            placeholder="Add title..."
            @keydown.enter.prevent="submitRenameThread"
            @keydown.esc.prevent="closeRenameThreadDialog"
          />
          <div class="rename-thread-actions">
            <button class="rename-thread-button" type="button" @click="closeRenameThreadDialog">{{ t('Cancel') }}</button>
            <button class="rename-thread-button rename-thread-button-primary" type="button" @click="submitRenameThread">{{ t('Save') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="deleteThreadDialogVisible" class="rename-thread-overlay" @click.self="closeDeleteThreadDialog">
        <div class="rename-thread-panel" role="dialog" aria-modal="true" aria-label="Delete thread">
          <h3 class="rename-thread-title">{{ deleteThreadHasAutomation ? 'Archive chat and remove automations?' : 'Delete thread?' }}</h3>
          <p class="rename-thread-subtitle">
            <template v-if="deleteThreadHasAutomation">
              This will archive the thread "{{ deleteThreadTitle }}" and remove the attached heartbeat automations.
            </template>
            <template v-else>
              This will archive the thread "{{ deleteThreadTitle }}". You can find it later in archived threads.
            </template>
          </p>
          <div class="rename-thread-actions">
            <button class="rename-thread-button" type="button" @click="closeDeleteThreadDialog">Cancel</button>
            <button class="rename-thread-button rename-thread-button-danger" type="button" @click="submitDeleteThread">
              {{ deleteThreadHasAutomation ? 'Archive and remove' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="automationDialogVisible" class="rename-thread-overlay" @click.self="closeAutomationDialog">
        <div class="rename-thread-panel automation-thread-panel" role="dialog" aria-modal="true" :aria-label="automationDialogScope === 'project' ? 'Project automation' : 'Thread automation'">
          <h3 class="rename-thread-title">{{ automationDialogMode === 'edit' ? 'Edit automation' : 'Add automation' }}</h3>
          <p class="rename-thread-subtitle">{{ automationDialogSubtitle }}</p>

          <div v-if="automationTargetPickerVisible && automationDialogMode === 'create'" class="automation-target-picker">
            <span class="automation-thread-label">Target</span>
            <div class="automation-target-mode-group" role="radiogroup" aria-label="Automation target type">
              <button
                class="automation-target-mode"
                :class="{ 'is-active': automationTargetMode === 'thread' }"
                type="button"
                @click="setAutomationTargetMode('thread')"
              >
                Existing chat
              </button>
              <button
                class="automation-target-mode"
                :class="{ 'is-active': automationTargetMode === 'project' }"
                type="button"
                @click="setAutomationTargetMode('project')"
              >
                Project
              </button>
            </div>

            <div class="automation-target-dropdown">
              <ComposerDropdown
                v-model="automationTargetValue"
                class="automation-thread-dropdown"
                :options="automationTargetDropdownOptions"
                :placeholder="automationTargetMode === 'project' ? 'Select project' : 'Select chat'"
                enable-search
                :search-placeholder="automationTargetMode === 'project' ? 'Search projects' : 'Search chats'"
              />
            </div>
          </div>

          <div v-if="automationDialogAutomations.length > 0" class="automation-thread-list" :aria-label="automationDialogScope === 'project' ? 'Project automations' : 'Thread automations'">
            <button
              v-for="automation in automationDialogAutomations"
              :key="automation.id"
              class="automation-thread-list-item"
              :class="{ 'is-active': automation.id === automationDialogAutomationId }"
              type="button"
              @click="selectAutomationForEditing(automation.id)"
            >
              <span>{{ automation.name }}</span>
              <small>{{ automation.status === 'PAUSED' ? 'Paused' : 'Active' }}</small>
            </button>
            <button class="automation-thread-list-item automation-thread-list-add" type="button" @click="startNewAutomationDraft">
              Add another automation
            </button>
          </div>

          <label class="automation-thread-field">
            <span class="automation-thread-label">Name</span>
            <input v-model="automationDraft.name" class="rename-thread-input" type="text" placeholder="Automation name" />
          </label>

          <label class="automation-thread-field">
            <span class="automation-thread-label">Prompt</span>
            <textarea v-model="automationDraft.prompt" class="automation-thread-textarea" rows="6" placeholder="Describe what the automation should do"></textarea>
          </label>

          <div class="automation-thread-field">
            <span class="automation-thread-label">Schedule</span>
            <div class="automation-schedule-mode-group" role="radiogroup" aria-label="Automation schedule type">
              <button
                class="automation-schedule-mode"
                :class="{ 'is-active': automationScheduleDraft.mode === 'daily' }"
                type="button"
                @click="setAutomationScheduleMode('daily')"
              >
                Daily
              </button>
              <button
                class="automation-schedule-mode"
                :class="{ 'is-active': automationScheduleDraft.mode === 'interval' }"
                type="button"
                @click="setAutomationScheduleMode('interval')"
              >
                Interval
              </button>
              <button
                class="automation-schedule-mode"
                :class="{ 'is-active': automationScheduleDraft.mode === 'advanced' }"
                type="button"
                @click="setAutomationScheduleMode('advanced')"
              >
                RRULE
              </button>
            </div>

            <div v-if="automationScheduleDraft.mode === 'daily'" class="automation-schedule-row">
              <span class="automation-schedule-copy">Run every day at</span>
              <input
                v-model="automationScheduleDraft.dailyTime"
                class="automation-schedule-time"
                type="time"
                @input="syncAutomationRruleFromScheduleDraft"
              />
            </div>

            <div v-else-if="automationScheduleDraft.mode === 'interval'" class="automation-schedule-row">
              <span class="automation-schedule-copy">Run every</span>
              <input
                v-model.number="automationScheduleDraft.interval"
                class="automation-schedule-number"
                type="number"
                min="1"
                step="1"
                @input="syncAutomationRruleFromScheduleDraft"
              />
              <ComposerDropdown
                class="automation-schedule-unit-dropdown"
                :model-value="automationScheduleDraft.intervalUnit"
                :options="automationIntervalUnitOptions"
                placeholder="Unit"
                @update:model-value="onAutomationIntervalUnitChange"
              />
            </div>

            <input
              v-if="automationScheduleDraft.mode === 'advanced'"
              v-model="automationDraft.rrule"
              class="rename-thread-input"
              type="text"
              placeholder="FREQ=DAILY;BYHOUR=9;BYMINUTE=0"
              @input="syncAutomationScheduleDraftFromRrule"
            />
            <p class="automation-schedule-preview">{{ automationSchedulePreview }}</p>
          </div>

          <div class="automation-thread-field">
            <span class="automation-thread-label">Status</span>
            <ComposerDropdown
              class="automation-thread-dropdown"
              :model-value="automationDraft.status"
              :options="automationStatusOptions"
              :placeholder="t('Status')"
              @update:model-value="onAutomationStatusChange"
            />
          </div>

          <p v-if="automationDialogError" class="rename-thread-subtitle automation-thread-error">{{ automationDialogError }}</p>
          <p v-else-if="automationDialogNotice" class="rename-thread-subtitle automation-thread-notice">{{ automationDialogNotice }}</p>

          <div class="rename-thread-actions">
            <button
              v-if="automationDialogMode === 'edit' && automationDialogScope === 'thread'"
              class="rename-thread-button"
              type="button"
              :disabled="isSavingAutomation || isRunningAutomation"
              @click="onRunAutomationFromDialog"
            >
              {{ isRunningAutomation ? 'Running…' : 'Run now' }}
            </button>
            <button
              v-if="automationDialogMode === 'edit'"
              class="rename-thread-button rename-thread-button-danger"
              type="button"
              :disabled="isSavingAutomation || isRunningAutomation"
              @click="onDeleteAutomationFromDialog"
            >
              Remove
            </button>
            <button class="rename-thread-button" type="button" :disabled="isSavingAutomation || isRunningAutomation" @click="closeAutomationDialog">
              {{ t('Cancel') }}
            </button>
            <button class="rename-thread-button rename-thread-button-primary" type="button" :disabled="isSavingAutomation || isRunningAutomation" @click="submitAutomationDialog">
              {{ isSavingAutomation ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import {
  deleteThreadAutomation,
  deleteProjectAutomation,
  getProjectAutomationMap,
  getPinnedThreadState,
  getThreadAutomationMap,
  getThreadSummary,
  persistPinnedThreadIds,
  runThreadAutomationNow,
  upsertProjectAutomation,
  upsertThreadAutomation,
} from '../../api/codexGateway'
import type { UiProjectGroup, UiThread, UiThreadAutomation, UiThreadAutomationStatus } from '../../types/codex'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import IconTablerDots from '../icons/IconTablerDots.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerFolderOpen from '../icons/IconTablerFolderOpen.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'
import IconTablerBolt from '../icons/IconTablerBolt.vue'
import IconTablerTrash from '../icons/IconTablerTrash.vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { useFeedbackDiagnostics } from '../../composables/useFeedbackDiagnostics'
import { getPathLeafName, getPathParent, isAbsoluteLikePath, isProjectlessChatPath } from '../../pathUtils.js'
import ComposerDropdown from '../content/ComposerDropdown.vue'
import SidebarMenuRow from './SidebarMenuRow.vue'
import { reconcilePinnedThreadIds } from './pinnedThreadUtils'

const props = defineProps<{
  groups: UiProjectGroup[]
  projectDisplayNameById: Record<string, string>
  projectGitRepoByName: Record<string, boolean>
  projectCwdByName: Record<string, string>
  selectedThreadId: string
  isLoading: boolean
  isThreadListFullyLoaded: boolean
  searchQuery: string
  searchMatchedThreadIds: string[] | null
}>()

const { t } = useUiLanguage()
const { recordVisibleFailure } = useFeedbackDiagnostics()

const emit = defineEmits<{
  select: [threadId: string]
  archive: [threadId: string]
  'start-new-thread': [projectName: string]
  'browse-thread-files': [threadId: string]
  'save-thread-project': [threadId: string]
  'browse-project-files': [projectName: string]
  'save-project': [projectName: string]
  'request-project-git-status': [projectName: string]
  'create-project-worktree': [projectName: string]
  'rename-project': [payload: { projectName: string; displayName: string }]
  'rename-thread': [payload: { threadId: string; title: string }]
  'remove-project': [projectName: string]
  'reorder-project': [payload: { projectName: string; toIndex: number }]
  'copy-thread-chat': [threadId: string]
  'fork-thread': [threadId: string]
  'start-new-chat': []
  'automations-changed': []
}>()

type PendingProjectDrag = {
  projectName: string
  fromIndex: number
  startClientX: number
  startClientY: number
  pointerOffsetY: number
  groupLeft: number
  groupWidth: number
  groupHeight: number
  groupOuterHeight: number
}

type ActiveProjectDrag = {
  projectName: string
  fromIndex: number
  pointerOffsetY: number
  groupLeft: number
  groupWidth: number
  groupHeight: number
  groupOuterHeight: number
  ghostTop: number
  dropTargetIndexFull: number | null
}

type DragPointerSample = {
  clientX: number
  clientY: number
}

type MenuDirection = 'up' | 'down'
type ChatSortMode = 'created' | 'updated'
type AutomationScheduleMode = 'daily' | 'interval' | 'advanced'
type AutomationIntervalUnit = 'minutes' | 'hours' | 'days'
type AutomationTargetMode = 'thread' | 'project'

type AutomationScheduleDraft = {
  mode: AutomationScheduleMode
  dailyTime: string
  interval: number
  intervalUnit: AutomationIntervalUnit
}

const DRAG_START_THRESHOLD_PX = 4
const PROJECT_GROUP_EXPANDED_GAP_PX = 6
const SECTION_EXPANSION_STORAGE_KEY = 'codex-web-local.sidebar-section-expansion.v1'
const CHATS_FIRST_STORAGE_KEY = 'codex-web-local.sidebar-chats-first.v1'
const CHAT_SORT_MODE_STORAGE_KEY = 'codex-web-local.sidebar-chat-sort-mode.v1'
const expandedProjects = ref<Record<string, boolean>>({})
const collapsedProjects = ref<Record<string, boolean>>({})
const isPinnedSectionExpanded = ref(true)
const isProjectsSectionExpanded = ref(true)
const isChatsSectionExpanded = ref(true)
const isChatsListExpanded = ref(false)
const showChatsFirst = ref(loadBooleanStorage(CHATS_FIRST_STORAGE_KEY, false))
const chatSortMode = ref<ChatSortMode>(loadChatSortMode())
let hasLoadedPinnedThreadState = false
const pinnedThreadIds = ref<string[]>([])
const hydratedPinnedThreadById = ref<Record<string, UiThread>>({})
const inlineDeleteConfirmThreadId = ref('')
const optimisticallyArchivedThreadIds = ref<string[]>([])
const openProjectMenuId = ref('')
const openThreadMenuId = ref('')
const projectMenuDirectionById = ref<Record<string, MenuDirection>>({})
const threadMenuDirectionById = ref<Record<string, MenuDirection>>({})
const openThreadMenuStyle = ref<Record<string, string>>({})
const projectMenuMode = ref<'actions' | 'rename'>('actions')
const projectRenameDraft = ref('')
const renameThreadDialogVisible = ref(false)
const renameThreadDialogThreadId = ref('')
const renameThreadDraft = ref('')
const renameThreadInputRef = ref<HTMLInputElement | null>(null)
const deleteThreadDialogVisible = ref(false)
const deleteThreadDialogThreadId = ref('')
const deleteThreadTitle = ref('')
const automationByThreadId = ref<Record<string, UiThreadAutomation[]>>({})
const automationByProjectName = ref<Record<string, UiThreadAutomation[]>>({})
const automationDialogVisible = ref(false)
const automationDialogScope = ref<'thread' | 'project'>('thread')
const automationDialogThreadId = ref('')
const automationDialogProjectName = ref('')
const automationDialogAutomationId = ref('')
const automationDialogMode = ref<'create' | 'edit'>('create')
const automationTargetPickerVisible = ref(false)
const automationTargetMode = ref<AutomationTargetMode>('thread')
const automationTargetValue = ref('')
const automationDialogError = ref('')
const automationDialogNotice = ref('')
const projectAutomationActionError = ref('')
const isSavingAutomation = ref(false)
const isRunningAutomation = ref(false)
const automationDraft = ref<{
  name: string
  prompt: string
  rrule: string
  status: UiThreadAutomationStatus
}>({
  name: '',
  prompt: '',
  rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
  status: 'ACTIVE',
})
const automationScheduleDraft = ref<AutomationScheduleDraft>({
  mode: 'daily',
  dailyTime: '09:00',
  interval: 1,
  intervalUnit: 'hours',
})
const automationDialogAutomations = computed(() => {
  if (automationDialogScope.value === 'project') {
    const projectName = automationDialogProjectName.value
    return projectName ? (automationByProjectName.value[projectName] ?? []) : []
  }
  const threadId = automationDialogThreadId.value
  return threadId ? (automationByThreadId.value[threadId] ?? []) : []
})
const automationSchedulePreview = computed(() => describeAutomationSchedule(automationDraft.value.rrule))
const automationDialogSubtitle = computed(() => {
  if (automationTargetPickerVisible.value && automationDialogMode.value === 'create') {
    if (automationTargetMode.value === 'thread') return 'This creates a heartbeat automation attached to the selected chat.'
    return 'This creates a project automation attached to the selected project folder.'
  }
  return automationDialogScope.value === 'project'
    ? 'This creates project automations attached to the selected project folder.'
    : 'This creates heartbeat automations attached to the selected thread.'
})
const automationThreadTargetOptions = computed(() => {
  const rows: Array<{ value: string; label: string; searchText: string }> = []
  for (const group of props.groups) {
    for (const thread of group.threads) {
      const title = thread.title?.trim() || thread.id
      const project = getProjectDisplayName(group.projectName)
      rows.push({
        value: thread.id,
        label: `${title} · ${project}`,
        searchText: `${title} ${project} ${thread.id}`.toLowerCase(),
      })
    }
  }
  return rows
})
const automationProjectTargetOptions = computed(() => {
  const rows: Array<{ value: string; label: string; searchText: string }> = []
  for (const group of props.groups) {
    const cwd = getProjectAutomationKey(group.projectName)
    if (!cwd) continue
    const label = getProjectDisplayName(group.projectName)
    rows.push({
      value: cwd,
      label,
      searchText: `${label} ${cwd}`.toLowerCase(),
    })
  }
  return rows
})
const automationTargetDropdownOptions = computed(() => {
  const source = automationTargetMode.value === 'project'
    ? automationProjectTargetOptions.value
    : automationThreadTargetOptions.value
  return source.map((option) => ({ value: option.value, label: option.label }))
})
const automationIntervalUnitOptions = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
]
const automationStatusOptions = computed(() => [
  { value: 'ACTIVE', label: t('Active') },
  { value: 'PAUSED', label: t('Paused') },
])
watch(automationTargetDropdownOptions, (options) => {
  if (!automationTargetPickerVisible.value) return
  if (options.some((option) => option.value === automationTargetValue.value)) return
  automationTargetValue.value = options[0]?.value ?? ''
})
const groupsContainerRef = ref<HTMLElement | null>(null)
const pendingProjectDrag = ref<PendingProjectDrag | null>(null)
const activeProjectDrag = ref<ActiveProjectDrag | null>(null)
let pendingDragPointerSample: DragPointerSample | null = null
let dragPointerRafId: number | null = null
const suppressNextProjectToggleId = ref('')
const measuredHeightByProject = ref<Record<string, number>>({})
const projectGroupElementByName = new Map<string, HTMLElement>()
const projectMenuWrapElementByName = new Map<string, HTMLElement>()
const threadMenuWrapElementById = new Map<string, HTMLElement>()
const projectNameByElement = new WeakMap<HTMLElement, string>()
const organizeMenuWrapRef = ref<HTMLElement | null>(null)
const openThreadMenuPanelRef = ref<HTMLElement | null>(null)
const isOrganizeMenuOpen = ref(false)
const THREAD_VIEW_MODE_STORAGE_KEY = 'codex-web-local.thread-view-mode.v1'
const threadViewMode = ref<'project' | 'chronological'>(loadThreadViewMode())
const projectGroupResizeObserver =
  typeof window !== 'undefined'
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement
          const projectName = projectNameByElement.get(element)
          if (!projectName) continue
          updateMeasuredProjectHeight(projectName, element)
        }
      })
    : null
const COLLAPSED_STORAGE_KEY = 'codex-web-local.collapsed-projects.v1'

function loadCollapsedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

function loadThreadViewMode(): 'project' | 'chronological' {
  if (typeof window === 'undefined') return 'project'

  const raw = window.localStorage.getItem(THREAD_VIEW_MODE_STORAGE_KEY)
  return raw === 'chronological' ? 'chronological' : 'project'
}

function loadBooleanStorage(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}

function loadChatSortMode(): ChatSortMode {
  if (typeof window === 'undefined') return 'updated'
  return window.localStorage.getItem(CHAT_SORT_MODE_STORAGE_KEY) === 'created' ? 'created' : 'updated'
}

collapsedProjects.value = loadCollapsedState()

function loadSectionExpansionState(): void {
  if (typeof window === 'undefined') return

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SECTION_EXPANSION_STORAGE_KEY) || '{}') as {
      pinned?: unknown
      projects?: unknown
      chats?: unknown
    }
    if (typeof parsed.pinned === 'boolean') isPinnedSectionExpanded.value = parsed.pinned
    if (typeof parsed.projects === 'boolean') isProjectsSectionExpanded.value = parsed.projects
    if (typeof parsed.chats === 'boolean') isChatsSectionExpanded.value = parsed.chats
  } catch {
    // Keep default expanded state when saved state is invalid.
  }
}

function persistSectionExpansionState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    SECTION_EXPANSION_STORAGE_KEY,
    JSON.stringify({
      pinned: isPinnedSectionExpanded.value,
      projects: isProjectsSectionExpanded.value,
      chats: isChatsSectionExpanded.value,
    }),
  )
}

loadSectionExpansionState()

watch(
  collapsedProjects,
  (value) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true },
)

watch(threadViewMode, (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THREAD_VIEW_MODE_STORAGE_KEY, value)
})

watch(showChatsFirst, (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CHATS_FIRST_STORAGE_KEY, String(value))
})

watch(chatSortMode, (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CHAT_SORT_MODE_STORAGE_KEY, value)
})

watch([isPinnedSectionExpanded, isProjectsSectionExpanded, isChatsSectionExpanded], persistSectionExpansionState)

const normalizedSearchQuery = computed(() => props.searchQuery.trim().toLowerCase())

const isSearchActive = computed(() => normalizedSearchQuery.value.length > 0)
const matchedThreadIdSet = computed(() => {
  if (!props.searchMatchedThreadIds) return null
  return new Set(props.searchMatchedThreadIds)
})
const pinnedThreadIdSet = computed(() => new Set(pinnedThreadIds.value))
const optimisticallyArchivedThreadIdSet = computed(() => new Set(optimisticallyArchivedThreadIds.value))

function threadMatchesSearch(thread: UiThread): boolean {
  if (optimisticallyArchivedThreadIdSet.value.has(thread.id)) return false
  if (!isSearchActive.value) return true
  if (matchedThreadIdSet.value) {
    return matchedThreadIdSet.value.has(thread.id)
  }
  const q = normalizedSearchQuery.value
  return thread.title.toLowerCase().includes(q) || thread.preview.toLowerCase().includes(q)
}

const filteredGroups = computed<UiProjectGroup[]>(() => {
  return props.groups.flatMap((group) => {
    const threads = group.threads.filter((thread) => !isProjectlessChatPath(thread.cwd) && threadMatchesSearch(thread))
    if (threads.length > 0) return [{ ...group, threads }]
    return !isSearchActive.value && group.threads.length === 0 ? [{ ...group, threads }] : []
  })
})

const isChronologicalView = computed(() => threadViewMode.value === 'chronological')

const globalThreads = computed<UiThread[]>(() => {
  const rows: UiThread[] = []

  for (const group of props.groups) {
    for (const thread of group.threads) {
      if (pinnedThreadIdSet.value.has(thread.id)) continue
      if (!threadMatchesSearch(thread)) continue
      rows.push(thread)
    }
  }

  return rows.sort((first, second) => {
    const firstTimestamp = new Date(first.updatedAtIso || first.createdAtIso).getTime()
    const secondTimestamp = new Date(second.updatedAtIso || second.createdAtIso).getTime()
    return secondTimestamp - firstTimestamp
  })
})

const chatThreads = computed(() => {
  const rows = globalThreads.value.filter((thread) => isProjectlessChatPath(thread.cwd))
  const timestampKey = chatSortMode.value === 'created' ? 'createdAtIso' : 'updatedAtIso'
  return rows
    .sort((first, second) => {
      const firstTimestamp = new Date(first[timestampKey] || first.updatedAtIso || first.createdAtIso).getTime()
      const secondTimestamp = new Date(second[timestampKey] || second.updatedAtIso || second.createdAtIso).getTime()
      return secondTimestamp - firstTimestamp
    })
})

const visibleChatThreads = computed(() => {
  if (isSearchActive.value) return chatThreads.value
  return isChatsListExpanded.value ? chatThreads.value : chatThreads.value.slice(0, 10)
})

const hasHiddenChatThreads = computed(() => {
  if (isSearchActive.value) return false
  return chatThreads.value.length > 10
})

const threadById = computed(() => {
  const map = new Map<string, UiThread>()

  for (const group of props.groups) {
    for (const thread of group.threads) {
      if (optimisticallyArchivedThreadIdSet.value.has(thread.id)) continue
      map.set(thread.id, thread)
    }
  }

  return map
})

watch(
  pinnedThreadIds,
  (threadIds) => {
    if (!hasLoadedPinnedThreadState) return
    void persistPinnedThreadIds(threadIds)
  },
)

watch([threadById, () => props.isThreadListFullyLoaded], ([threadsById]) => {
  const filtered = reconcilePinnedThreadIds(pinnedThreadIds.value, new Set(threadsById.keys()), {
    canPruneMissing: props.isThreadListFullyLoaded,
  })
  if (filtered.length === pinnedThreadIds.value.length) return
  const filteredIdSet = new Set(filtered)
  const nextHydratedPinnedThreads = Object.fromEntries(
    Object.entries(hydratedPinnedThreadById.value).filter(([threadId]) => filteredIdSet.has(threadId)),
  )
  hydratedPinnedThreadById.value = nextHydratedPinnedThreads
  pinnedThreadIds.value = filtered
})

let pinnedThreadHydrationVersion = 0

async function hydrateMissingPinnedThreads(): Promise<void> {
  if (props.isLoading) return
  const missingThreadIds = pinnedThreadIds.value.filter((threadId) => !threadById.value.has(threadId) && !hydratedPinnedThreadById.value[threadId])
  if (missingThreadIds.length === 0) return

  const version = (pinnedThreadHydrationVersion += 1)
  const loadedThreads = await Promise.all(
    missingThreadIds.map(async (threadId) => {
      try {
        return await getThreadSummary(threadId)
      } catch {
        return null
      }
    }),
  )
  if (version !== pinnedThreadHydrationVersion) return

  const next = { ...hydratedPinnedThreadById.value }
  for (const thread of loadedThreads) {
    if (thread) next[thread.id] = thread
  }
  hydratedPinnedThreadById.value = next
}

watch([pinnedThreadIds, threadById, () => props.isLoading], () => {
  if (!hasLoadedPinnedThreadState) return
  void hydrateMissingPinnedThreads()
})

onMounted(async () => {
  const { threadIds } = await getPinnedThreadState()
  const normalized = Array.isArray(threadIds)
    ? threadIds
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item, index, rows) => item.length > 0 && rows.indexOf(item) === index)
    : []

  if (normalized.length > 0) {
    pinnedThreadIds.value = normalized
  }
  try {
    automationByThreadId.value = await getThreadAutomationMap()
  } catch {
    automationByThreadId.value = {}
  }
  try {
    await reloadProjectAutomations()
  } catch {
    automationByProjectName.value = {}
  }
  hasLoadedPinnedThreadState = true
  void hydrateMissingPinnedThreads()
})

const deleteThreadHasAutomation = computed(() => threadHasAutomation(deleteThreadDialogThreadId.value))

const threadProjectNameById = computed(() => {
  const map = new Map<string, string>()
  for (const group of props.groups) {
    for (const thread of group.threads) {
      map.set(thread.id, group.projectName)
    }
  }
  return map
})
const unpinnedThreadsByProjectName = computed(() => {
  const map = new Map<string, UiThread[]>()
  for (const group of props.groups) {
    const rows = group.threads.filter((thread) => !pinnedThreadIdSet.value.has(thread.id) && !optimisticallyArchivedThreadIdSet.value.has(thread.id))
    map.set(group.projectName, rows)
  }
  return map
})
const threadTimestampById = computed(() => {
  const map = new Map<string, number>()
  for (const group of props.groups) {
    for (const thread of group.threads) {
      const timestamp = new Date(thread.updatedAtIso || thread.createdAtIso).getTime()
      map.set(thread.id, timestamp)
    }
  }
  return map
})

const openThreadMenuThread = computed(() => {
  const threadId = openThreadMenuId.value
  return threadId ? (threadById.value.get(threadId) ?? null) : null
})

const pinnedThreads = computed(() =>
  pinnedThreadIds.value
    .map((threadId) => threadById.value.get(threadId) ?? hydratedPinnedThreadById.value[threadId] ?? null)
    .filter((thread): thread is UiThread => thread !== null)
    .filter(threadMatchesSearch),
)

function togglePinnedSection(): void {
  isPinnedSectionExpanded.value = !isPinnedSectionExpanded.value
}

function toggleProjectsSection(): void {
  isProjectsSectionExpanded.value = !isProjectsSectionExpanded.value
}

function toggleChatsSection(): void {
  isChatsSectionExpanded.value = !isChatsSectionExpanded.value
}

const projectedDropProjectIndex = computed<number | null>(() => {
  const drag = activeProjectDrag.value
  if (!drag || drag.dropTargetIndexFull === null || props.groups.length === 0) return null

  const boundedDropIndex = Math.max(0, Math.min(drag.dropTargetIndexFull, props.groups.length))
  const projectedIndex = boundedDropIndex > drag.fromIndex ? boundedDropIndex - 1 : boundedDropIndex
  const boundedProjectedIndex = Math.max(0, Math.min(projectedIndex, props.groups.length - 1))
  return boundedProjectedIndex === drag.fromIndex ? null : boundedProjectedIndex
})

const layoutProjectOrder = computed<string[]>(() => {
  const sourceGroups = isSearchActive.value ? filteredGroups.value : props.groups
  const names = sourceGroups.map((group) => group.projectName)
  const drag = activeProjectDrag.value
  const projectedIndex = projectedDropProjectIndex.value

  if (!drag || projectedIndex === null) {
    return names
  }

  const next = [...names]
  const [movedProject] = next.splice(drag.fromIndex, 1)
  if (!movedProject) {
    return names
  }
  next.splice(projectedIndex, 0, movedProject)
  return next
})

const layoutTopByProject = computed<Record<string, number>>(() => {
  const topByProject: Record<string, number> = {}
  let currentTop = 0

  for (const projectName of layoutProjectOrder.value) {
    topByProject[projectName] = currentTop
    currentTop += getProjectOuterHeight(projectName)
  }

  return topByProject
})

const groupsContainerStyle = computed<Record<string, string>>(() => {
  let totalHeight = 0
  for (const projectName of layoutProjectOrder.value) {
    totalHeight += getProjectOuterHeight(projectName)
  }

  return {
    height: `${Math.max(0, totalHeight)}px`,
  }
})

function formatRelative(timestamp: number): string {
  if (Number.isNaN(timestamp)) return 'n/a'

  const diffMs = Math.abs(Date.now() - timestamp)
  if (diffMs < 60000) return 'now'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatRelativeThread(thread: UiThread): string {
  const timestamp = threadTimestampById.value.get(thread.id)
  if (typeof timestamp === 'number') {
    return formatRelative(timestamp)
  }
  return formatRelative(new Date(thread.updatedAtIso || thread.createdAtIso).getTime())
}

function isPinned(threadId: string): boolean {
  return pinnedThreadIdSet.value.has(threadId)
}

function togglePin(threadId: string): void {
  if (isPinned(threadId)) {
    pinnedThreadIds.value = pinnedThreadIds.value.filter((id) => id !== threadId)
    return
  }

  pinnedThreadIds.value = [threadId, ...pinnedThreadIds.value]
}

function onTogglePinFromMenu(threadId: string): void {
  togglePin(threadId)
  closeThreadMenu()
}

function onSelect(threadId: string): void {
  inlineDeleteConfirmThreadId.value = ''
  emit('select', threadId)
}

function threadHasAutomation(threadId: string): boolean {
  return threadAutomationCount(threadId) > 0
}

function threadAutomationCount(threadId: string): number {
  return automationByThreadId.value[threadId]?.length ?? 0
}

function projectHasAutomation(projectName: string): boolean {
  return projectAutomationCount(projectName) > 0
}

function projectAutomationCount(projectName: string): number {
  const key = getProjectAutomationKey(projectName)
  return key ? (automationByProjectName.value[key]?.length ?? 0) : 0
}

function automationTooltip(automations: UiThreadAutomation[]): string {
  if (automations.length === 0) return ''
  if (automations.length > 1) {
    const activeCount = automations.filter((automation) => automation.status === 'ACTIVE').length
    return `${automations.length} automations • ${activeCount} active`
  }
  const [automation] = automations
  const nextRunLabel = automation.status === 'PAUSED'
    ? '-'
    : automation.nextRunAtMs
      ? new Date(automation.nextRunAtMs).toLocaleString()
      : 'Not scheduled'
  return `${automation.name} • Next run: ${nextRunLabel}`
}

function threadAutomationTooltip(threadId: string): string {
  return automationTooltip(automationByThreadId.value[threadId] ?? [])
}

function projectAutomationTooltip(projectName: string): string {
  const key = getProjectAutomationKey(projectName)
  return automationTooltip(key ? (automationByProjectName.value[key] ?? []) : [])
}

function padRruleNumber(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0')
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.floor(parsed))
}

function buildDailyRrule(time: string): string {
  const [rawHour, rawMinute] = time.split(':')
  const hour = Math.min(23, Math.max(0, Number(rawHour) || 0))
  const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0))
  return `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute}`
}

function buildIntervalRrule(interval: number, unit: AutomationIntervalUnit): string {
  const normalizedInterval = parsePositiveInteger(interval, 1)
  if (unit === 'minutes') return `FREQ=MINUTELY;INTERVAL=${normalizedInterval}`
  if (unit === 'hours') return `FREQ=HOURLY;INTERVAL=${normalizedInterval}`
  return `FREQ=DAILY;INTERVAL=${normalizedInterval}`
}

function parseRruleParts(rrule: string): Record<string, string> {
  return Object.fromEntries(
    rrule
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split('=')
        return [key.toUpperCase(), rest.join('=').trim()]
      })
      .filter(([key, value]) => key && value),
  )
}

function createScheduleDraftFromRrule(rrule: string): AutomationScheduleDraft {
  const parts = parseRruleParts(rrule)
  const frequency = parts.FREQ?.toUpperCase()
  const interval = parsePositiveInteger(parts.INTERVAL, 1)
  if (frequency === 'DAILY' && parts.BYHOUR !== undefined && parts.BYMINUTE !== undefined && interval === 1) {
    const hour = Math.min(23, Math.max(0, Number(parts.BYHOUR) || 0))
    const minute = Math.min(59, Math.max(0, Number(parts.BYMINUTE) || 0))
    return {
      mode: 'daily',
      dailyTime: `${padRruleNumber(hour)}:${padRruleNumber(minute)}`,
      interval: 1,
      intervalUnit: 'hours',
    }
  }
  if (frequency === 'MINUTELY' || frequency === 'HOURLY' || (frequency === 'DAILY' && parts.INTERVAL !== undefined)) {
    return {
      mode: 'interval',
      dailyTime: '09:00',
      interval,
      intervalUnit: frequency === 'MINUTELY' ? 'minutes' : frequency === 'HOURLY' ? 'hours' : 'days',
    }
  }
  return {
    mode: 'advanced',
    dailyTime: '09:00',
    interval: 1,
    intervalUnit: 'hours',
  }
}

function describeAutomationSchedule(rrule: string): string {
  const parts = parseRruleParts(rrule)
  const frequency = parts.FREQ?.toUpperCase()
  const interval = parsePositiveInteger(parts.INTERVAL, 1)
  if (frequency === 'DAILY' && parts.BYHOUR !== undefined && parts.BYMINUTE !== undefined && interval === 1) {
    const hour = Math.min(23, Math.max(0, Number(parts.BYHOUR) || 0))
    const minute = Math.min(59, Math.max(0, Number(parts.BYMINUTE) || 0))
    return `RRULE: ${rrule} · runs daily at ${padRruleNumber(hour)}:${padRruleNumber(minute)}`
  }
  if (frequency === 'MINUTELY') return `RRULE: ${rrule} · runs every ${interval} minute${interval === 1 ? '' : 's'}`
  if (frequency === 'HOURLY') return `RRULE: ${rrule} · runs every ${interval} hour${interval === 1 ? '' : 's'}`
  if (frequency === 'DAILY' && parts.INTERVAL !== undefined) return `RRULE: ${rrule} · runs every ${interval} day${interval === 1 ? '' : 's'}`
  return rrule ? `RRULE: ${rrule}` : 'RRULE is required.'
}

function syncAutomationRruleFromScheduleDraft(): void {
  const draft = automationScheduleDraft.value
  if (draft.mode === 'daily') {
    automationDraft.value.rrule = buildDailyRrule(draft.dailyTime)
  } else if (draft.mode === 'interval') {
    automationDraft.value.rrule = buildIntervalRrule(draft.interval, draft.intervalUnit)
  }
}

function onAutomationIntervalUnitChange(value: string): void {
  if (value !== 'minutes' && value !== 'hours' && value !== 'days') return
  automationScheduleDraft.value = {
    ...automationScheduleDraft.value,
    intervalUnit: value,
  }
  syncAutomationRruleFromScheduleDraft()
}

function onAutomationStatusChange(value: string): void {
  if (value !== 'ACTIVE' && value !== 'PAUSED') return
  automationDraft.value = {
    ...automationDraft.value,
    status: value,
  }
}

function syncAutomationScheduleDraftFromRrule(): void {
  automationScheduleDraft.value = createScheduleDraftFromRrule(automationDraft.value.rrule)
}

function setAutomationScheduleMode(mode: AutomationScheduleMode): void {
  automationScheduleDraft.value = {
    ...automationScheduleDraft.value,
    mode,
  }
  syncAutomationRruleFromScheduleDraft()
}

function onCopyThreadChat(threadId: string): void {
  if (threadId !== props.selectedThreadId) return
  emit('copy-thread-chat', threadId)
  closeThreadMenu()
}

function onForkThread(threadId: string): void {
  emit('fork-thread', threadId)
  closeThreadMenu()
}

function getNewThreadButtonAriaLabel(projectName: string): string {
  return `start new thread ${getProjectDisplayName(projectName)}`
}

function onStartNewThread(projectName: string): void {
  emit('start-new-thread', projectName)
}

function onBrowseThreadFiles(threadId: string): void {
  emit('browse-thread-files', threadId)
  closeThreadMenu()
}

function onSaveThreadProject(threadId: string): void {
  emit('save-thread-project', threadId)
  closeThreadMenu()
}

async function onCopyThreadPath(threadId: string): Promise<void> {
  const path = threadById.value.get(threadId)?.cwd?.trim() ?? ''
  closeThreadMenu()
  if (!path || typeof navigator === 'undefined' || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(path)
  } catch {
    // Clipboard writes can be blocked by browser permissions; the menu action is best-effort.
  }
}

function onThreadRowLeave(threadId: string, event?: MouseEvent): void {
  if (openThreadMenuId.value !== threadId) return
  if (event) {
    const relatedTarget = event.relatedTarget
    const panelElement = openThreadMenuPanelRef.value
    if (relatedTarget instanceof Node && panelElement && panelElement.contains(relatedTarget)) return
  }
  closeThreadMenu()
}

function isThreadMenuOpen(threadId: string): boolean {
  return openThreadMenuId.value === threadId
}

function closeThreadMenu(): void {
  openThreadMenuId.value = ''
  openThreadMenuStyle.value = {}
}

function toggleThreadMenu(threadId: string): void {
  inlineDeleteConfirmThreadId.value = ''
  if (openThreadMenuId.value === threadId) {
    closeThreadMenu()
    return
  }

  closeProjectMenu()
  isOrganizeMenuOpen.value = false
  openThreadMenuId.value = threadId
  nextTick(() => {
    updateOpenThreadMenuPlacement(threadId)
  })
}

function onThreadRowContextMenu(event: MouseEvent, threadId: string): void {
  event.preventDefault()
  inlineDeleteConfirmThreadId.value = ''
  openThreadMenuId.value = threadId
}

function openRenameThreadDialog(threadId: string, currentTitle: string): void {
  renameThreadDialogThreadId.value = threadId
  renameThreadDraft.value = currentTitle
  renameThreadDialogVisible.value = true
  closeThreadMenu()
  nextTick(() => {
    renameThreadInputRef.value?.focus()
    renameThreadInputRef.value?.select()
  })
}

function closeRenameThreadDialog(): void {
  renameThreadDialogVisible.value = false
  renameThreadDialogThreadId.value = ''
  renameThreadDraft.value = ''
}

function submitRenameThread(): void {
  const threadId = renameThreadDialogThreadId.value
  const title = renameThreadDraft.value.trim()
  if (!threadId || !title) return
  emit('rename-thread', { threadId, title })
  closeRenameThreadDialog()
}

function openDeleteThreadDialog(threadId: string, currentTitle: string): void {
  inlineDeleteConfirmThreadId.value = ''
  deleteThreadDialogThreadId.value = threadId
  deleteThreadTitle.value = currentTitle
  deleteThreadDialogVisible.value = true
  closeThreadMenu()
}

function closeDeleteThreadDialog(): void {
  deleteThreadDialogVisible.value = false
  deleteThreadDialogThreadId.value = ''
  deleteThreadTitle.value = ''
}

async function submitDeleteThread(): Promise<void> {
  const threadId = deleteThreadDialogThreadId.value
  if (!threadId) return
  deleteThreadById(threadId)
  closeDeleteThreadDialog()
}

function isInlineDeleteConfirming(threadId: string): boolean {
  return inlineDeleteConfirmThreadId.value === threadId
}

function onInlineDeleteClick(threadId: string): void {
  if (inlineDeleteConfirmThreadId.value !== threadId) {
    inlineDeleteConfirmThreadId.value = threadId
    closeThreadMenu()
    return
  }

  deleteThreadById(threadId)
  inlineDeleteConfirmThreadId.value = ''
}

function deleteThreadById(threadId: string): void {
  if (!optimisticallyArchivedThreadIdSet.value.has(threadId)) {
    optimisticallyArchivedThreadIds.value = [threadId, ...optimisticallyArchivedThreadIds.value]
  }
  inlineDeleteConfirmThreadId.value = ''
  closeThreadMenu()
  pinnedThreadIds.value = pinnedThreadIds.value.filter((id) => id !== threadId)
  emit('archive', threadId)

  if (threadHasAutomation(threadId)) {
    void deleteThreadAutomation(threadId).catch(() => undefined)
    automationByThreadId.value = omitAutomationThread(automationByThreadId.value, threadId)
  }
}

function openAutomationDialog(threadId: string): void {
  automationDialogScope.value = 'thread'
  automationDialogThreadId.value = threadId
  automationDialogProjectName.value = ''
  automationTargetPickerVisible.value = false
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  const existing = automationByThreadId.value[threadId]?.[0]
  if (existing) {
    selectAutomationForEditing(existing.id)
  } else {
    startNewAutomationDraft()
  }
  automationDialogVisible.value = true
  closeThreadMenu()
}

function openProjectAutomationDialog(projectName: string): void {
  const projectCwd = getProjectAutomationKey(projectName)
  if (!projectCwd) {
    automationDialogScope.value = 'project'
    automationDialogThreadId.value = ''
    automationDialogProjectName.value = ''
    automationTargetPickerVisible.value = false
    automationDialogError.value = 'Project automation requires a resolved absolute project path.'
    automationDialogNotice.value = ''
    automationDialogVisible.value = true
    closeProjectMenu()
    return
  }
  automationDialogScope.value = 'project'
  automationDialogThreadId.value = ''
  automationDialogProjectName.value = projectCwd
  automationTargetPickerVisible.value = false
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  const existing = automationByProjectName.value[projectCwd]?.[0]
  if (existing) {
    selectAutomationForEditing(existing.id)
  } else {
    startNewAutomationDraft()
  }
  automationDialogVisible.value = true
  closeProjectMenu()
}

function openAutomationEditorFromPanel(payload: {
  scope: 'thread' | 'project'
  target: string
  automation: UiThreadAutomation
}): void {
  automationDialogScope.value = payload.scope
  automationDialogThreadId.value = payload.scope === 'thread' ? payload.target : ''
  automationDialogProjectName.value = payload.scope === 'project' ? payload.target : ''
  automationTargetPickerVisible.value = false
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  if (payload.scope === 'project') {
    automationByProjectName.value = updateAutomationForProject(automationByProjectName.value, payload.target, payload.automation)
  } else {
    automationByThreadId.value = updateAutomationForThread(automationByThreadId.value, payload.target, payload.automation)
  }
  selectAutomationForEditing(payload.automation.id)
  automationDialogVisible.value = true
  closeProjectMenu()
  closeThreadMenu()
}

function openAutomationCreatorFromPanel(): void {
  automationTargetPickerVisible.value = true
  automationTargetMode.value = 'thread'
  automationTargetValue.value = automationThreadTargetOptions.value[0]?.value ?? ''
  automationDialogScope.value = 'thread'
  automationDialogThreadId.value = ''
  automationDialogProjectName.value = ''
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  startNewAutomationDraft()
  automationDialogVisible.value = true
  closeProjectMenu()
  closeThreadMenu()
}

function setAutomationTargetMode(mode: AutomationTargetMode): void {
  automationTargetMode.value = mode
  automationTargetValue.value = ''
  automationDialogScope.value = mode === 'project' ? 'project' : 'thread'
  automationTargetValue.value = automationTargetDropdownOptions.value[0]?.value ?? ''
}

function startNewAutomationDraft(): void {
  automationDialogAutomationId.value = ''
  automationDialogMode.value = 'create'
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  automationDraft.value = {
    name: automationDialogScope.value === 'project' ? 'Project automation' : 'Thread automation',
    prompt: '',
    rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
    status: 'ACTIVE',
  }
  automationScheduleDraft.value = createScheduleDraftFromRrule(automationDraft.value.rrule)
}

function selectAutomationForEditing(automationId: string): void {
  const existing = automationDialogAutomations.value.find((automation) => automation.id === automationId)
  if (!existing) return
  automationDialogAutomationId.value = existing.id
  automationDialogMode.value = 'edit'
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  automationDraft.value = {
    name: existing.name,
    prompt: existing.prompt,
    rrule: existing.rrule,
    status: existing.status,
  }
  automationScheduleDraft.value = createScheduleDraftFromRrule(existing.rrule)
}

function closeAutomationDialog(): void {
  automationDialogVisible.value = false
  automationDialogScope.value = 'thread'
  automationDialogThreadId.value = ''
  automationDialogProjectName.value = ''
  automationDialogAutomationId.value = ''
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  isSavingAutomation.value = false
  isRunningAutomation.value = false
}

function omitAutomationThread(state: Record<string, UiThreadAutomation[]>, threadId: string): Record<string, UiThreadAutomation[]> {
  return Object.fromEntries(Object.entries(state).filter(([id]) => id !== threadId))
}

function updateAutomationForThread(
  state: Record<string, UiThreadAutomation[]>,
  threadId: string,
  saved: UiThreadAutomation,
): Record<string, UiThreadAutomation[]> {
  const existing = state[threadId] ?? []
  const index = existing.findIndex((automation) => automation.id === saved.id)
  const next = [...existing]
  if (index >= 0) {
    next.splice(index, 1, saved)
  } else {
    next.push(saved)
  }
  return { ...state, [threadId]: next }
}

function removeAutomationForThread(
  state: Record<string, UiThreadAutomation[]>,
  threadId: string,
  automationId: string,
): Record<string, UiThreadAutomation[]> {
  const next = (state[threadId] ?? []).filter((automation) => automation.id !== automationId)
  return next.length > 0 ? { ...state, [threadId]: next } : omitAutomationThread(state, threadId)
}

function omitAutomationProject(state: Record<string, UiThreadAutomation[]>, projectName: string): Record<string, UiThreadAutomation[]> {
  return Object.fromEntries(Object.entries(state).filter(([name]) => name !== projectName))
}

function updateAutomationForProject(
  state: Record<string, UiThreadAutomation[]>,
  projectName: string,
  saved: UiThreadAutomation,
): Record<string, UiThreadAutomation[]> {
  const existing = state[projectName] ?? []
  const index = existing.findIndex((automation) => automation.id === saved.id)
  const next = [...existing]
  if (index >= 0) {
    next.splice(index, 1, saved)
  } else {
    next.push(saved)
  }
  return { ...state, [projectName]: next }
}

async function reloadProjectAutomations(): Promise<void> {
  automationByProjectName.value = await getProjectAutomationMap()
}

async function submitAutomationDialog(): Promise<void> {
  let threadId = automationDialogThreadId.value
  let projectName = automationDialogProjectName.value
  isSavingAutomation.value = true
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  try {
    syncAutomationRruleFromScheduleDraft()
    if (automationTargetPickerVisible.value && automationDialogMode.value === 'create') {
      if (automationTargetMode.value === 'thread') {
        threadId = automationTargetValue.value
        projectName = ''
        automationDialogScope.value = 'thread'
        automationDialogThreadId.value = threadId
        automationDialogProjectName.value = ''
      } else {
        projectName = automationTargetValue.value
        threadId = ''
        automationDialogScope.value = 'project'
        automationDialogThreadId.value = ''
        automationDialogProjectName.value = projectName
      }
    }
    if (automationDialogScope.value === 'thread' && !threadId) {
      throw new Error('Select a chat target for this automation')
    }
    if (automationDialogScope.value === 'project' && !projectName) {
      throw new Error('Select a project target for this automation')
    }
    const input = {
      id: automationDialogAutomationId.value || undefined,
      name: automationDraft.value.name,
      prompt: automationDraft.value.prompt,
      rrule: automationDraft.value.rrule,
      status: automationDraft.value.status,
    }
    const saved = automationDialogScope.value === 'project'
      ? await upsertProjectAutomation({ ...input, projectName })
      : await upsertThreadAutomation({ ...input, threadId })
    if (automationDialogScope.value === 'project') {
      await reloadProjectAutomations()
    } else {
      automationByThreadId.value = updateAutomationForThread(automationByThreadId.value, threadId, saved)
    }
    emit('automations-changed')
    selectAutomationForEditing(saved.id)
    automationDialogNotice.value = 'Automation saved.'
    isSavingAutomation.value = false
  } catch (error) {
    automationDialogError.value = error instanceof Error ? error.message : 'Failed to save automation'
    isSavingAutomation.value = false
  }
}

async function onDeleteAutomationFromDialog(): Promise<void> {
  const threadId = automationDialogThreadId.value
  const projectName = automationDialogProjectName.value
  const automationId = automationDialogAutomationId.value
  if (!automationId) return
  if (automationDialogScope.value === 'thread' && !threadId) return
  if (automationDialogScope.value === 'project' && !projectName) return
  isSavingAutomation.value = true
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  try {
    if (automationDialogScope.value === 'project') {
      await deleteProjectAutomation(projectName, automationId)
      await reloadProjectAutomations()
    } else {
      await deleteThreadAutomation(threadId, automationId)
      automationByThreadId.value = removeAutomationForThread(automationByThreadId.value, threadId, automationId)
    }
    const nextAutomation = automationDialogAutomations.value[0]
    if (nextAutomation) {
      selectAutomationForEditing(nextAutomation.id)
    } else {
      startNewAutomationDraft()
    }
    emit('automations-changed')
    isSavingAutomation.value = false
  } catch (error) {
    automationDialogError.value = error instanceof Error ? error.message : 'Failed to remove automation'
    isSavingAutomation.value = false
  }
}

async function onRunAutomationFromDialog(): Promise<void> {
  const threadId = automationDialogThreadId.value
  const automationId = automationDialogAutomationId.value
  if (!threadId || !automationId) return
  isRunningAutomation.value = true
  automationDialogError.value = ''
  automationDialogNotice.value = ''
  try {
    await runThreadAutomationNow(threadId, automationId)
    automationDialogNotice.value = 'Automation run queued.'
  } catch (error) {
    automationDialogError.value = error instanceof Error ? error.message : 'Failed to run automation'
  } finally {
    isRunningAutomation.value = false
  }
}

function getProjectDisplayName(projectName: string): string {
  return props.projectDisplayNameById[projectName] ?? projectName
}

defineExpose({
  openAutomationEditorFromPanel,
  openAutomationCreatorFromPanel,
})

function isPathLikeProjectName(value: string): boolean {
  return value.includes('/') || value.includes('\\')
}

function getProjectTooltipTitle(projectName: string): string {
  return isPathLikeProjectName(projectName) ? projectName : getProjectDisplayName(projectName)
}

function isDuplicatePathLeafName(value: string): boolean {
  const leafName = getPathLeafName(value)
  if (!leafName) return false
  let matchingCount = 0
  for (const group of props.groups) {
    if (!isPathLikeProjectName(group.projectName)) continue
    if (getPathLeafName(group.projectName) !== leafName) continue
    matchingCount += 1
    if (matchingCount > 1) return true
  }
  return false
}

function getProjectVisibleName(group: UiProjectGroup): string {
  const customDisplayName = props.projectDisplayNameById[group.projectName]
  const displayName = getProjectDisplayName(group.projectName)
  const projectName = group.projectName
  if (customDisplayName && !isPathLikeProjectName(projectName) && projectName !== displayName) {
    if (displayName.includes(projectName) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(projectName)) return displayName
    return `${displayName} ${projectName}`
  }
  if (customDisplayName && isPathLikeProjectName(projectName)) {
    const leafName = getPathLeafName(projectName)
    const parentLeafName = getPathLeafName(getPathParent(projectName))
    const contextName = isDuplicatePathLeafName(projectName) ? parentLeafName : leafName
    return contextName && contextName !== displayName ? `${displayName} ${contextName}` : displayName
  }
  if (!displayName.includes('/') && !displayName.includes('\\')) return displayName
  const leafName = getPathLeafName(displayName) || displayName
  const parentLeafName = getPathLeafName(getPathParent(displayName))
  if (parentLeafName.startsWith('.') && parentLeafName !== leafName) return `${leafName} ${parentLeafName}`
  if (group.threads.length > 0 || !isDuplicatePathLeafName(projectName)) return leafName
  return parentLeafName ? `${leafName} ${parentLeafName}` : leafName
}

function isProjectMenuOpen(projectName: string): boolean {
  return openProjectMenuId.value === projectName
}

function closeProjectMenu(): void {
  openProjectMenuId.value = ''
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = ''
}

function toggleOrganizeMenu(): void {
  const nextValue = !isOrganizeMenuOpen.value
  if (nextValue) {
    closeProjectMenu()
    closeThreadMenu()
  }
  isOrganizeMenuOpen.value = nextValue
}

function setThreadViewMode(mode: 'project' | 'chronological'): void {
  threadViewMode.value = mode
  isOrganizeMenuOpen.value = false
}

function toggleShowChatsFirst(): void {
  showChatsFirst.value = !showChatsFirst.value
}

function setChatSortMode(mode: ChatSortMode): void {
  chatSortMode.value = mode
}

function requestProjectGitStatusAndUpdateMenuDirection(projectName: string): void {
  emit('request-project-git-status', projectName)
  nextTick(() => {
    updateProjectMenuDirection(projectName)
  })
}

function toggleProjectMenu(projectName: string): void {
  if (openProjectMenuId.value === projectName) {
    closeProjectMenu()
    return
  }

  closeThreadMenu()
  isOrganizeMenuOpen.value = false
  openProjectMenuId.value = projectName
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = getProjectDisplayName(projectName)
  requestProjectGitStatusAndUpdateMenuDirection(projectName)
}

function openProjectContextMenu(projectName: string): void {
  closeThreadMenu()
  isOrganizeMenuOpen.value = false
  openProjectMenuId.value = projectName
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = getProjectDisplayName(projectName)
  requestProjectGitStatusAndUpdateMenuDirection(projectName)
}

function getProjectRenameDraftName(group: UiProjectGroup): string {
  return props.projectDisplayNameById[group.projectName] ?? getProjectVisibleName(group)
}

function openRenameProjectMenu(group: UiProjectGroup): void {
  closeThreadMenu()
  const projectName = group.projectName
  openProjectMenuId.value = projectName
  projectMenuMode.value = 'rename'
  projectRenameDraft.value = getProjectRenameDraftName(group)
  nextTick(() => {
    updateProjectMenuDirection(projectName)
  })
}

function onBrowseProjectFiles(projectName: string): void {
  emit('browse-project-files', projectName)
  closeProjectMenu()
}

function onSaveProject(projectName: string): void {
  emit('save-project', projectName)
  closeProjectMenu()
}

function onCreateProjectWorktree(projectName: string): void {
  emit('create-project-worktree', projectName)
  closeProjectMenu()
}

function onProjectNameInput(projectName: string): void {
  emit('rename-project', {
    projectName,
    displayName: projectRenameDraft.value,
  })
}

function onRemoveProject(projectName: string): void {
  const projectCwd = getProjectAutomationKey(projectName)
  emit('remove-project', projectName)
  if (projectCwd && projectHasAutomation(projectName)) {
    projectAutomationActionError.value = ''
    const previousAutomationByProjectName = automationByProjectName.value
    automationByProjectName.value = omitAutomationProject(automationByProjectName.value, projectCwd)
    void deleteProjectAutomation(projectCwd)
      .then(reloadProjectAutomations)
      .catch(async (error) => {
        automationByProjectName.value = previousAutomationByProjectName
        const message = error instanceof Error ? error.message : 'Failed to delete project automation'
        projectAutomationActionError.value = message
        recordVisibleFailure(message)
        try {
          await reloadProjectAutomations()
        } catch {
          automationByProjectName.value = previousAutomationByProjectName
        }
      })
      .finally(() => {
        emit('automations-changed')
      })
  }
  closeProjectMenu()
}

function getProjectAutomationKey(projectName: string): string {
  const projectCwd = props.projectCwdByName[projectName]?.trim() ?? ''
  return isAbsoluteLikePath(projectCwd) ? projectCwd : ''
}

function onProjectHeaderKeyDown(event: KeyboardEvent, projectName: string): void {
  if (!event.altKey) return
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

  const currentIndex = props.groups.findIndex((group) => group.projectName === projectName)
  if (currentIndex < 0) return

  const delta = event.key === 'ArrowUp' ? -1 : 1
  const targetIndex = Math.max(0, Math.min(currentIndex + delta, props.groups.length - 1))
  if (targetIndex === currentIndex) return

  event.preventDefault()
  emit('reorder-project', {
    projectName,
    toIndex: targetIndex,
  })
}

function isExpanded(projectName: string): boolean {
  return expandedProjects.value[projectName] === true
}

function isCollapsed(projectName: string): boolean {
  return collapsedProjects.value[projectName] === true
}

function toggleProjectExpansion(projectName: string): void {
  expandedProjects.value = {
    ...expandedProjects.value,
    [projectName]: !isExpanded(projectName),
  }
}

function toggleChatsListExpansion(): void {
  isChatsListExpanded.value = !isChatsListExpanded.value
}

function toggleProjectCollapse(projectName: string): void {
  if (suppressNextProjectToggleId.value === projectName) {
    suppressNextProjectToggleId.value = ''
    return
  }

  collapsedProjects.value = {
    ...collapsedProjects.value,
    [projectName]: !isCollapsed(projectName),
  }
}

function getProjectOuterHeight(projectName: string): number {
  const measuredHeight = measuredHeightByProject.value[projectName] ?? 0
  const drag = activeProjectDrag.value
  const dragHeight = drag?.projectName === projectName ? drag.groupHeight : null
  const baseHeight = dragHeight ?? measuredHeight
  const gap = isCollapsed(projectName) ? 0 : PROJECT_GROUP_EXPANDED_GAP_PX
  return Math.max(0, baseHeight + gap)
}

function setProjectMenuWrapRef(projectName: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement =
    element instanceof HTMLElement
      ? element
      : element && '$el' in element && element.$el instanceof HTMLElement
        ? element.$el
        : null

  if (htmlElement) {
    projectMenuWrapElementByName.set(projectName, htmlElement)
    return
  }

  projectMenuWrapElementByName.delete(projectName)
}

function setThreadMenuWrapRef(threadId: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement =
    element instanceof HTMLElement
      ? element
      : element && '$el' in element && element.$el instanceof HTMLElement
        ? element.$el
        : null

  if (htmlElement) {
    threadMenuWrapElementById.set(threadId, htmlElement)
    return
  }

  threadMenuWrapElementById.delete(threadId)
}

function findMenuBoundaryRect(element: HTMLElement): DOMRect {
  let parent: HTMLElement | null = element.parentElement
  while (parent) {
    const styles = window.getComputedStyle(parent)
    const overflowY = styles.overflowY || styles.overflow
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden' || overflowY === 'clip') {
      return parent.getBoundingClientRect()
    }
    parent = parent.parentElement
  }

  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}

function resolveMenuDirection(menuWrapElement: HTMLElement, panelHeight: number): MenuDirection {
  const wrapRect = menuWrapElement.getBoundingClientRect()
  const boundaryRect = findMenuBoundaryRect(menuWrapElement)
  const panelGap = 6
  const spaceBelow = boundaryRect.bottom - wrapRect.bottom
  const spaceAbove = wrapRect.top - boundaryRect.top

  if (spaceBelow >= panelHeight + panelGap) return 'down'
  if (spaceAbove > spaceBelow) return 'up'
  return 'down'
}

function updateThreadMenuDirection(threadId: string, panelHeight: number): MenuDirection {
  const menuWrapElement = threadMenuWrapElementById.get(threadId)
  if (!menuWrapElement) return 'down'

  const direction = resolveMenuDirection(menuWrapElement, panelHeight)

  threadMenuDirectionById.value = {
    ...threadMenuDirectionById.value,
    [threadId]: direction,
  }
  return direction
}

function getThreadMenuDirection(threadId: string): MenuDirection {
  return threadMenuDirectionById.value[threadId] ?? 'down'
}

function updateProjectMenuDirection(projectName: string): void {
  const menuWrapElement = projectMenuWrapElementByName.get(projectName)
  if (!menuWrapElement) return
  const menuPanelElement = menuWrapElement.querySelector<HTMLElement>('.project-menu-panel')
  const panelHeight = menuPanelElement?.getBoundingClientRect().height ?? 0

  projectMenuDirectionById.value = {
    ...projectMenuDirectionById.value,
    [projectName]: resolveMenuDirection(menuWrapElement, panelHeight),
  }
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue)
}

function updateOpenThreadMenuPlacement(threadId: string): void {
  const menuWrapElement = threadMenuWrapElementById.get(threadId)
  if (!menuWrapElement) return

  const panelElement = openThreadMenuPanelRef.value
  const panelRect = panelElement?.getBoundingClientRect()
  const panelHeight = panelRect?.height || panelElement?.offsetHeight || 112
  const panelWidth = panelRect?.width || panelElement?.offsetWidth || 160
  const direction = updateThreadMenuDirection(threadId, panelHeight)
  const wrapRect = menuWrapElement.getBoundingClientRect()
  const viewportGap = 8
  const offset = 4
  const maxLeft = Math.max(viewportGap, window.innerWidth - panelWidth - viewportGap)
  const left = clamp(wrapRect.right - panelWidth, viewportGap, maxLeft)
  const top =
    direction === 'up'
      ? clamp(wrapRect.top - panelHeight - offset, viewportGap, Math.max(viewportGap, window.innerHeight - panelHeight - viewportGap))
      : clamp(wrapRect.bottom + offset, viewportGap, Math.max(viewportGap, window.innerHeight - panelHeight - viewportGap))

  openThreadMenuStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
  }
}

function onThreadMenuViewportChange(): void {
  const threadId = openThreadMenuId.value
  if (!threadId) return
  updateOpenThreadMenuPlacement(threadId)
}

function bindThreadMenuPositionListeners(): void {
  window.addEventListener('resize', onThreadMenuViewportChange)
  document.addEventListener('scroll', onThreadMenuViewportChange, true)
}

function unbindThreadMenuPositionListeners(): void {
  window.removeEventListener('resize', onThreadMenuViewportChange)
  document.removeEventListener('scroll', onThreadMenuViewportChange, true)
}

function isEventInsideOpenProjectMenu(event: Event): boolean {
  const projectName = openProjectMenuId.value
  if (!projectName) return false

  const openMenuWrapElement = projectMenuWrapElementByName.get(projectName)
  if (!openMenuWrapElement) return false

  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (eventPath.includes(openMenuWrapElement)) return true

  const target = event.target
  return target instanceof Node ? openMenuWrapElement.contains(target) : false
}

function isEventInsideOpenThreadMenu(event: Event): boolean {
  const threadId = openThreadMenuId.value
  if (!threadId) return false

  const openMenuWrapElement = threadMenuWrapElementById.get(threadId)
  if (!openMenuWrapElement) return false

  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (eventPath.includes(openMenuWrapElement)) return true

  const panelElement = openThreadMenuPanelRef.value
  if (panelElement && eventPath.includes(panelElement)) return true

  const target = event.target
  if (!(target instanceof Node)) return false
  if (openMenuWrapElement.contains(target)) return true
  if (panelElement && panelElement.contains(target)) return true
  return false
}

function onProjectMenuPointerDown(event: PointerEvent): void {
  if (isOrganizeMenuOpen.value) {
    const organizeElement = organizeMenuWrapRef.value
    const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
    const isInsideOrganizeMenu =
      !!organizeElement &&
      (eventPath.includes(organizeElement) || (event.target instanceof Node && organizeElement.contains(event.target)))

    if (!isInsideOrganizeMenu) {
      isOrganizeMenuOpen.value = false
    }
  }

  if (!openProjectMenuId.value) return
  if (!isEventInsideOpenProjectMenu(event)) {
    closeProjectMenu()
  }

  if (!openThreadMenuId.value) return
  if (isEventInsideOpenThreadMenu(event)) return
  closeThreadMenu()
}

function onProjectMenuFocusIn(event: FocusEvent): void {
  if (openProjectMenuId.value && !isEventInsideOpenProjectMenu(event)) {
    closeProjectMenu()
  }
  if (openThreadMenuId.value && !isEventInsideOpenThreadMenu(event)) {
    closeThreadMenu()
  }
}

function onWindowBlurForProjectMenu(): void {
  if (isOrganizeMenuOpen.value) {
    isOrganizeMenuOpen.value = false
  }
  if (openProjectMenuId.value) {
    closeProjectMenu()
  }
  if (openThreadMenuId.value) {
    closeThreadMenu()
  }
}

function bindProjectMenuDismissListeners(): void {
  window.addEventListener('pointerdown', onProjectMenuPointerDown, { capture: true })
  window.addEventListener('focusin', onProjectMenuFocusIn, { capture: true })
  window.addEventListener('blur', onWindowBlurForProjectMenu)
}

function unbindProjectMenuDismissListeners(): void {
  window.removeEventListener('pointerdown', onProjectMenuPointerDown, { capture: true })
  window.removeEventListener('focusin', onProjectMenuFocusIn, { capture: true })
  window.removeEventListener('blur', onWindowBlurForProjectMenu)
}

function updateMeasuredProjectHeight(projectName: string, element: HTMLElement): void {
  const nextHeight = element.getBoundingClientRect().height
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) return

  const previousHeight = measuredHeightByProject.value[projectName]
  if (previousHeight !== undefined && Math.abs(previousHeight - nextHeight) < 0.5) {
    return
  }

  measuredHeightByProject.value = {
    ...measuredHeightByProject.value,
    [projectName]: nextHeight,
  }
}

function setProjectGroupRef(projectName: string, element: Element | ComponentPublicInstance | null): void {
  const previousElement = projectGroupElementByName.get(projectName)
  if (previousElement && previousElement !== element && projectGroupResizeObserver) {
    projectGroupResizeObserver.unobserve(previousElement)
  }

  const htmlElement =
    element instanceof HTMLElement
      ? element
      : element && '$el' in element && element.$el instanceof HTMLElement
        ? element.$el
        : null

  if (htmlElement) {
    projectGroupElementByName.set(projectName, htmlElement)
    projectNameByElement.set(htmlElement, projectName)
    updateMeasuredProjectHeight(projectName, htmlElement)
    projectGroupResizeObserver?.observe(htmlElement)
    return
  }

  if (previousElement) {
    projectGroupResizeObserver?.unobserve(previousElement)
  }

  projectGroupElementByName.delete(projectName)
}

function onProjectHandleMouseDown(event: MouseEvent, projectName: string): void {
  if (event.button !== 0) return
  if (isSearchActive.value) return
  if (pendingProjectDrag.value || activeProjectDrag.value) return

  const fromIndex = props.groups.findIndex((group) => group.projectName === projectName)
  const projectGroupElement = projectGroupElementByName.get(projectName)
  if (fromIndex < 0 || !projectGroupElement) return

  const groupRect = projectGroupElement.getBoundingClientRect()
  const groupGap = isCollapsed(projectName) ? 0 : PROJECT_GROUP_EXPANDED_GAP_PX
  pendingProjectDrag.value = {
    projectName,
    fromIndex,
    startClientX: event.clientX,
    startClientY: event.clientY,
    pointerOffsetY: event.clientY - groupRect.top,
    groupLeft: groupRect.left,
    groupWidth: groupRect.width,
    groupHeight: groupRect.height,
    groupOuterHeight: groupRect.height + groupGap,
  }

  event.preventDefault()
  bindProjectDragListeners()
}

function bindProjectDragListeners(): void {
  window.addEventListener('mousemove', onProjectDragMouseMove)
  window.addEventListener('mouseup', onProjectDragMouseUp)
  window.addEventListener('keydown', onProjectDragKeyDown)
}

function unbindProjectDragListeners(): void {
  window.removeEventListener('mousemove', onProjectDragMouseMove)
  window.removeEventListener('mouseup', onProjectDragMouseUp)
  window.removeEventListener('keydown', onProjectDragKeyDown)
}

function onProjectDragMouseMove(event: MouseEvent): void {
  pendingDragPointerSample = {
    clientX: event.clientX,
    clientY: event.clientY,
  }
  scheduleProjectDragPointerFrame()
}

function onProjectDragMouseUp(event: MouseEvent): void {
  processProjectDragPointerSample({
    clientX: event.clientX,
    clientY: event.clientY,
  })

  const drag = activeProjectDrag.value
  if (drag && projectedDropProjectIndex.value !== null) {
    const currentProjectIndex = props.groups.findIndex((group) => group.projectName === drag.projectName)
    if (currentProjectIndex >= 0) {
      const toIndex = projectedDropProjectIndex.value
      if (toIndex !== currentProjectIndex) {
        emit('reorder-project', {
          projectName: drag.projectName,
          toIndex,
        })
      }
    }
  }

  resetProjectDragState({ preserveToggleSuppression: Boolean(drag) })
}

function onProjectDragKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (!pendingProjectDrag.value && !activeProjectDrag.value) return

  event.preventDefault()
  resetProjectDragState()
}

function resetProjectDragState(options: { preserveToggleSuppression?: boolean } = {}): void {
  if (dragPointerRafId !== null) {
    window.cancelAnimationFrame(dragPointerRafId)
    dragPointerRafId = null
  }
  pendingDragPointerSample = null
  pendingProjectDrag.value = null
  activeProjectDrag.value = null
  if (!options.preserveToggleSuppression) {
    suppressNextProjectToggleId.value = ''
  }
  unbindProjectDragListeners()
}

function scheduleProjectDragPointerFrame(): void {
  if (dragPointerRafId !== null) return

  dragPointerRafId = window.requestAnimationFrame(() => {
    dragPointerRafId = null
    if (!pendingDragPointerSample) return

    const sample = pendingDragPointerSample
    pendingDragPointerSample = null
    processProjectDragPointerSample(sample)
  })
}

function processProjectDragPointerSample(sample: DragPointerSample): void {
  const pending = pendingProjectDrag.value
  if (!activeProjectDrag.value && pending) {
    const deltaX = sample.clientX - pending.startClientX
    const deltaY = sample.clientY - pending.startClientY
    const distance = Math.hypot(deltaX, deltaY)
    if (distance < DRAG_START_THRESHOLD_PX) {
      return
    }

    closeProjectMenu()
    suppressNextProjectToggleId.value = pending.projectName
    activeProjectDrag.value = {
      projectName: pending.projectName,
      fromIndex: pending.fromIndex,
      pointerOffsetY: pending.pointerOffsetY,
      groupLeft: pending.groupLeft,
      groupWidth: pending.groupWidth,
      groupHeight: pending.groupHeight,
      groupOuterHeight: pending.groupOuterHeight,
      ghostTop: sample.clientY - pending.pointerOffsetY,
      dropTargetIndexFull: null,
    }
  }

  if (!activeProjectDrag.value) return
  updateProjectDropTarget(sample)
}

function updateProjectDropTarget(sample: DragPointerSample): void {
  const drag = activeProjectDrag.value
  if (!drag) return

  drag.ghostTop = sample.clientY - drag.pointerOffsetY
  if (!isPointerInProjectDropZone(sample)) {
    drag.dropTargetIndexFull = null
    return
  }

  const cursorY = sample.clientY
  const groupsContainer = groupsContainerRef.value
  if (!groupsContainer) {
    drag.dropTargetIndexFull = null
    return
  }

  const containerRect = groupsContainer.getBoundingClientRect()
  const projectIndexByName = new Map(props.groups.map((group, index) => [group.projectName, index]))
  const nonDraggedProjectNames = props.groups
    .map((group) => group.projectName)
    .filter((projectName) => projectName !== drag.projectName)

  let accumulatedTop = 0
  let nextDropTarget = props.groups.length

  for (const projectName of nonDraggedProjectNames) {
    const originalIndex = projectIndexByName.get(projectName)
    if (originalIndex === undefined) continue

    const groupOuterHeight = getProjectOuterHeight(projectName)
    const groupMiddleY = containerRect.top + accumulatedTop + groupOuterHeight / 2
    if (cursorY < groupMiddleY) {
      nextDropTarget = originalIndex
      break
    }

    accumulatedTop += groupOuterHeight
  }

  drag.dropTargetIndexFull = nextDropTarget
}

function isPointerInProjectDropZone(sample: DragPointerSample): boolean {
  const groupsContainer = groupsContainerRef.value
  if (!groupsContainer) return false

  const bounds = groupsContainer.getBoundingClientRect()
  const xInBounds = sample.clientX >= bounds.left && sample.clientX <= bounds.right
  const yInBounds = sample.clientY >= bounds.top - 32 && sample.clientY <= bounds.bottom + 32
  return xInBounds && yInBounds
}

function isDraggingProject(projectName: string): boolean {
  return activeProjectDrag.value?.projectName === projectName
}

function projectGroupStyle(projectName: string): Record<string, string> | undefined {
  const drag = activeProjectDrag.value
  const targetTop = layoutTopByProject.value[projectName] ?? 0
  const openThreadMenuProjectName = openThreadMenuId.value
    ? (threadProjectNameById.value.get(openThreadMenuId.value) ?? '')
    : ''
  const shouldElevateForMenu =
    openProjectMenuId.value === projectName || openThreadMenuProjectName === projectName

  if (!drag || drag.projectName !== projectName) {
    return {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      zIndex: shouldElevateForMenu ? '40' : '1',
      transform: `translate3d(0, ${targetTop}px, 0)`,
      willChange: 'transform',
      transition: 'transform 180ms ease',
    }
  }

  return {
    position: 'fixed',
    top: '0',
    left: `${drag.groupLeft}px`,
    width: `${drag.groupWidth}px`,
    height: `${drag.groupHeight}px`,
    zIndex: '50',
    pointerEvents: 'none',
    transform: `translate3d(0, ${drag.ghostTop}px, 0)`,
    willChange: 'transform',
    transition: 'transform 0ms linear',
  }
}

function projectThreads(group: UiProjectGroup): UiThread[] {
  return unpinnedThreadsByProjectName.value.get(group.projectName) ?? []
}

function visibleThreads(group: UiProjectGroup): UiThread[] {
  if (isSearchActive.value) return projectThreads(group)
  if (isCollapsed(group.projectName)) return []

  const rows = projectThreads(group)
  return isExpanded(group.projectName) ? rows : rows.slice(0, 10)
}

function hasHiddenThreads(group: UiProjectGroup): boolean {
  if (isSearchActive.value) return false
  return !isCollapsed(group.projectName) && projectThreads(group).length > 10
}

function hasThreads(group: UiProjectGroup): boolean {
  return projectThreads(group).length > 0
}

function shouldShowThreadIndicator(thread: UiThread): boolean {
  return Boolean(thread.pendingRequestState) || thread.inProgress || thread.unread
}

function threadRequestLabel(thread: UiThread): string {
  return thread.pendingRequestState === 'approval' ? 'Awaiting approval' : 'Awaiting response'
}

function getThreadState(thread: UiThread): 'awaiting-approval' | 'awaiting-response' | 'working' | 'unread' | 'idle' {
  if (thread.pendingRequestState === 'approval') return 'awaiting-approval'
  if (thread.pendingRequestState === 'response') return 'awaiting-response'
  if (thread.inProgress) return 'working'
  if (thread.unread) return 'unread'
  return 'idle'
}

watch(
  () => props.groups.map((group) => group.projectName),
  (projectNames) => {
    const dragProjectName = activeProjectDrag.value?.projectName ?? pendingProjectDrag.value?.projectName ?? ''
    if (dragProjectName && !props.groups.some((group) => group.projectName === dragProjectName)) {
      resetProjectDragState()
    }

    const projectNameSet = new Set(projectNames)
    const nextMeasuredHeights = Object.fromEntries(
      Object.entries(measuredHeightByProject.value).filter(([projectName]) => projectNameSet.has(projectName)),
    ) as Record<string, number>

    if (Object.keys(nextMeasuredHeights).length !== Object.keys(measuredHeightByProject.value).length) {
      measuredHeightByProject.value = nextMeasuredHeights
    }
  },
)

watch(
  () => {
    const projectName = openProjectMenuId.value
    return projectName ? props.projectGitRepoByName[projectName] : undefined
  },
  () => {
    const projectName = openProjectMenuId.value
    if (!projectName) return
    nextTick(() => {
      if (openProjectMenuId.value === projectName) {
        updateProjectMenuDirection(projectName)
      }
    })
  },
)

const hasOpenDismissableMenu = computed(
  () => isOrganizeMenuOpen.value || openProjectMenuId.value !== '' || openThreadMenuId.value !== '',
)

watch(hasOpenDismissableMenu, (isOpen) => {
  if (isOpen) {
    bindProjectMenuDismissListeners()
    return
  }

  unbindProjectMenuDismissListeners()
})

watch(openThreadMenuId, (threadId) => {
  if (!threadId) {
    unbindThreadMenuPositionListeners()
    return
  }

  bindThreadMenuPositionListeners()
  nextTick(() => {
    updateOpenThreadMenuPlacement(threadId)
  })
})

onBeforeUnmount(() => {
  for (const element of projectGroupElementByName.values()) {
    projectGroupResizeObserver?.unobserve(element)
  }
  projectGroupElementByName.clear()
  projectMenuWrapElementByName.clear()
  unbindThreadMenuPositionListeners()
  unbindProjectMenuDismissListeners()
  resetProjectDragState()
})
</script>

<style scoped>
@reference "tailwindcss";

.thread-tree-root {
  @apply flex flex-col;
}

.pinned-section {
  @apply order-1 mb-1;
}

.projects-section {
  @apply order-2;
}

.chats-section {
  @apply order-3 mt-1;
}

.thread-tree-root.chats-first .chats-section {
  @apply order-2;
}

.thread-tree-root.chats-first .projects-section {
  @apply order-3;
}

.thread-tree-header-row {
  @apply cursor-pointer;
}

.section-toggle-row {
  @apply hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400;
}

.thread-tree-header {
  @apply text-sm font-normal text-zinc-500 select-none;
}

.chats-section-actions {
  @apply flex items-center gap-1;
}

.chats-section-action {
  @apply h-5 w-5 rounded text-zinc-500 flex items-center justify-center transition hover:bg-zinc-200 hover:text-zinc-700;
}

.chats-section-action[aria-pressed='true'] {
  @apply bg-zinc-200 text-zinc-800;
}

.organize-menu-wrap {
  @apply relative;
}

.organize-menu-trigger {
  @apply h-5 w-5 rounded text-zinc-500 flex items-center justify-center transition hover:bg-zinc-200 hover:text-zinc-700;
}

.organize-menu-panel {
  @apply absolute right-0 top-full mt-1 z-30 min-w-44 rounded-xl border border-zinc-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm;
}

.organize-menu-title {
  @apply px-2 py-1 text-xs text-zinc-500;
}

.organize-menu-separator {
  @apply my-1 h-px bg-zinc-200;
}

.organize-menu-item {
  @apply w-full rounded-lg px-2 py-1.5 text-sm text-zinc-700 flex items-center justify-between hover:bg-zinc-100;
}

.organize-menu-item[data-active='true'] {
  @apply bg-zinc-100 text-zinc-900;
}

.thread-start-button {
  @apply h-5 w-5 rounded text-zinc-500 flex items-center justify-center transition hover:bg-zinc-200 hover:text-zinc-700;
}

.thread-tree-loading {
  @apply px-3 py-2 text-sm text-zinc-500;
}

.thread-tree-no-results {
  @apply px-3 py-2 text-sm text-zinc-400;
}

.thread-tree-action-error {
  @apply mx-2 my-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700;
}

.thread-tree-groups {
  @apply pr-0.5 relative;
}

.project-group {
  @apply m-0 transition-shadow;
}

.project-group[data-dragging='true'] {
  @apply shadow-lg;
}

.project-header-row {
  @apply hover:bg-zinc-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400;
}

.project-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center gap-1.5 min-h-5 cursor-grab;
}

.project-main-button[data-dragging-handle='true'] {
  @apply cursor-grabbing;
}

.project-icon-stack {
  @apply relative w-4 h-4 flex items-center justify-center text-zinc-500;
}

.project-icon-folder {
  @apply absolute inset-0 flex items-center justify-center opacity-100;
}

.project-icon-chevron {
  @apply absolute inset-0 items-center justify-center opacity-0 hidden;
}

.project-title {
  @apply min-w-0 flex-1 text-sm font-normal text-zinc-700 truncate select-none;
}

.project-menu-wrap {
  @apply relative;
}

.project-hover-controls {
  @apply flex items-center gap-1;
}

.project-menu-trigger {
  @apply h-4 w-4 rounded p-0 text-zinc-600 flex items-center justify-center;
}

.project-menu-panel {
  @apply absolute right-0 top-full mt-1 z-20 min-w-36 rounded-md border border-zinc-200 bg-white p-1 shadow-md flex flex-col gap-0.5;
}

.project-menu-panel[data-open-direction='up'] {
  top: auto;
  bottom: calc(100% + 0.25rem);
  margin-top: 0;
}

.project-menu-item {
  @apply rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100;
}

.project-menu-item-danger {
  @apply text-rose-700 hover:bg-rose-50;
}

.project-menu-label {
  @apply px-2 pt-1 text-xs text-zinc-500;
}

.project-menu-input {
  @apply px-2 py-1 text-sm text-zinc-800 bg-transparent border-none outline-none;
}

.project-empty-row {
  @apply cursor-default;
}

.project-empty-spacer {
  @apply block w-4 h-4;
}

.project-empty {
  @apply text-sm text-zinc-400;
}

.thread-list {
  @apply list-none m-0 p-0 flex flex-col gap-0.5;
}

.thread-list-global {
  @apply pr-0.5;
}

.project-group > .thread-list {
  @apply mt-0.5;
}

.thread-row-item {
  @apply m-0;
}

.thread-row-item[data-menu-open='true'] {
  @apply relative z-40;
}

.thread-row {
  @apply hover:bg-zinc-200;
}

.thread-row[data-menu-open='true'] {
  @apply relative z-30;
}

.thread-left-stack {
  @apply relative w-4 h-4 flex items-center justify-center;
}

.thread-delete-button {
  @apply absolute left-0 top-1/2 -translate-y-1/2 h-4 min-w-4 rounded text-zinc-500 opacity-0 pointer-events-none transition flex items-center justify-center;
}

.thread-delete-button[data-confirming='true'] {
  @apply z-10 h-5 min-w-16 px-1.5 bg-rose-600 text-white opacity-100 pointer-events-auto shadow-sm;
}

.thread-delete-confirm-label {
  @apply text-[11px] font-medium leading-none;
}

.thread-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center min-h-5;
}

.thread-row-title-wrap {
  @apply min-w-0 inline-flex w-full items-center;
}

.thread-row-title-line {
  @apply min-w-0 inline-flex w-full items-center gap-1.5;
}

.thread-row-title {
  @apply min-w-0 block flex-1 text-sm leading-5 font-normal text-zinc-800 truncate whitespace-nowrap;
}

.thread-row-worktree-icon {
  @apply w-3 h-3 text-zinc-500 shrink-0;
}

.thread-row-request-chip {
  @apply inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none;
}

.thread-row-request-chip[data-state='approval'] {
  @apply border-emerald-500/20 bg-emerald-500/15 text-emerald-700;
}

.thread-row-request-chip[data-state='response'] {
  @apply border-sky-200 bg-sky-50 text-sky-700;
}

.thread-status-indicator {
  @apply w-2.5 h-2.5 rounded-full;
}

.thread-row-time {
  @apply block text-sm font-normal text-zinc-500;
}

.thread-menu-wrap {
  @apply relative;
}

.thread-menu-trigger {
  @apply h-4 w-4 rounded p-0 text-xs text-zinc-600 flex items-center justify-center;
}

.thread-menu-panel {
  @apply absolute right-0 top-full mt-1 z-20 min-w-36 rounded-md border border-zinc-200 bg-white p-1 shadow-md flex flex-col gap-0.5;
}

.thread-menu-panel-fixed {
  @apply fixed top-0 right-auto bottom-auto left-0 mt-0 z-50;
}

.thread-menu-panel:not(.thread-menu-panel-fixed)[data-open-direction='up'] {
  top: auto;
  bottom: calc(100% + 0.25rem);
  margin-top: 0;
}

.thread-menu-item {
  @apply rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100;
}

.thread-menu-item:disabled {
  @apply cursor-not-allowed text-zinc-400 hover:bg-transparent;
}

.thread-menu-item-danger {
  @apply text-rose-700 hover:bg-rose-50;
}

.thread-icon {
  @apply w-4 h-4;
}

.thread-show-more-row {
  @apply mt-1;
}

.thread-show-more-spacer {
  @apply block w-4 h-4;
}

.thread-show-more-button {
  @apply block mx-auto rounded-lg px-2 py-0.5 text-sm font-normal text-zinc-600 transition hover:text-zinc-800 hover:bg-zinc-200;
}

.thread-row-automation-chip {
  @apply inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full bg-amber-100 px-1 text-amber-800;
}

.thread-row-automation-icon {
  @apply h-3 w-3 shrink-0;
}

.thread-row-automation-count {
  @apply text-[10px] font-semibold leading-none tabular-nums;
}

.project-header-row:hover .project-icon-folder {
  @apply opacity-0;
}

.project-header-row:hover .project-icon-chevron {
  @apply flex opacity-100;
}

.thread-row[data-active='true'] {
  @apply bg-zinc-200;
}

.thread-row:hover .thread-delete-button,
.thread-row:focus-within .thread-delete-button,
.thread-delete-button[data-confirming='true'] {
  @apply opacity-100 pointer-events-auto;
}

.thread-status-indicator[data-state='unread'] {
  width: 6.6667px;
  height: 6.6667px;
  @apply bg-blue-600;
}

.thread-status-indicator[data-state='working'] {
  @apply border-2 border-zinc-500 border-t-transparent bg-transparent animate-spin;
}

.thread-status-indicator[data-state='awaiting-approval'] {
  @apply bg-emerald-500;
}

.thread-status-indicator[data-state='awaiting-response'] {
  @apply bg-sky-500;
}

.thread-row:hover .thread-status-indicator[data-state='unread'],
.thread-row:hover .thread-status-indicator[data-state='working'],
.thread-row:hover .thread-status-indicator[data-state='awaiting-approval'],
.thread-row:hover .thread-status-indicator[data-state='awaiting-response'],
.thread-row:focus-within .thread-status-indicator[data-state='unread'],
.thread-row:focus-within .thread-status-indicator[data-state='working'],
.thread-row:focus-within .thread-status-indicator[data-state='awaiting-approval'],
.thread-row:focus-within .thread-status-indicator[data-state='awaiting-response'] {
  @apply opacity-0;
}

.rename-thread-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4;
}

.rename-thread-panel {
  @apply w-full max-w-sm rounded-xl bg-white p-4 shadow-xl
         max-h-[90vh] flex flex-col overflow-hidden;
}

.rename-thread-title {
  @apply m-0 text-base font-semibold text-zinc-900 shrink-0;
}

.rename-thread-subtitle {
  @apply mt-1 mb-3 text-sm text-zinc-500 overflow-y-auto flex-1 min-h-0 min-w-0 break-words;
}

.rename-thread-input {
  @apply w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 shrink-0;
}

.rename-thread-actions {
  @apply mt-3 flex items-center justify-end gap-2 shrink-0;
}

.rename-thread-button {
  @apply rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100;
}

.rename-thread-button-primary {
  @apply bg-zinc-900 text-white hover:bg-black;
}

.rename-thread-button-danger {
  @apply bg-rose-600 text-white hover:bg-rose-700;
}

.automation-thread-panel {
  @apply max-w-lg overflow-y-auto;
  max-height: min(90vh, calc(100dvh - 2rem));
  overscroll-behavior: contain;
}

.automation-thread-panel .rename-thread-subtitle {
  @apply flex-none overflow-visible;
}

.automation-thread-panel .rename-thread-actions {
  @apply sticky bottom-0 -mx-4 -mb-4 border-t border-zinc-200 bg-white px-4 py-3;
}

:global(:root.dark) .automation-thread-panel .rename-thread-actions {
  @apply border-zinc-700 bg-zinc-800;
}

.automation-thread-field {
  @apply mb-3 flex flex-col gap-1;
}

.automation-target-picker {
  @apply mb-3 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2;
}

.automation-target-mode-group {
  @apply grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-white p-1;
}

.automation-target-mode {
  @apply rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100;
}

.automation-target-mode.is-active {
  @apply bg-zinc-900 text-white shadow-sm hover:bg-zinc-900;
}

.automation-target-dropdown {
  @apply flex flex-col gap-2;
}

.automation-thread-list {
  @apply mb-3 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-1;
}

.automation-thread-list-item {
  @apply flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-white;
}

.automation-thread-list-item.is-active {
  @apply bg-white font-medium text-zinc-950 shadow-sm;
}

.automation-thread-list-item small {
  @apply text-xs font-normal text-zinc-500;
}

.automation-thread-list-add {
  @apply justify-center border border-dashed border-zinc-300 text-zinc-500;
}

.automation-thread-label {
  @apply text-xs font-medium uppercase tracking-wide text-zinc-500;
}

.automation-thread-textarea {
  @apply w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500;
}

.automation-thread-dropdown :deep(.composer-dropdown-trigger) {
  @apply w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900;
}

.automation-thread-dropdown :deep(.composer-dropdown-value) {
  @apply min-w-0 flex-1 text-left;
}

.automation-schedule-mode-group {
  @apply grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1;
}

.automation-schedule-mode {
  @apply rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white;
}

.automation-schedule-mode.is-active {
  @apply bg-white text-zinc-950 shadow-sm;
}

.automation-schedule-row {
  @apply mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2;
}

.automation-schedule-copy {
  @apply text-sm text-zinc-600;
}

.automation-schedule-time,
.automation-schedule-number,
.automation-schedule-unit {
  @apply rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500;
}

.automation-schedule-unit-dropdown :deep(.composer-dropdown-trigger) {
  @apply min-h-8 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900;
}

.automation-schedule-number {
  @apply w-20;
}

.automation-schedule-preview {
  @apply mt-1 text-xs text-zinc-500;
}

.automation-thread-error {
  @apply mb-0 text-rose-600;
}

.automation-thread-notice {
  @apply mb-0 text-emerald-600;
}

@media (max-height: 640px) {
  .automation-thread-panel {
    @apply p-3;
  }

  .automation-thread-panel .rename-thread-actions {
    @apply -mx-3 -mb-3 px-3 py-2;
  }

  .automation-thread-field,
  .automation-target-picker,
  .automation-thread-list {
    @apply mb-2;
  }

  .automation-thread-textarea {
    min-height: 7rem;
  }
}
</style>
