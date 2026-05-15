<template>
  <section class="conversation-root" @contextmenu.capture="onConversationContextMenu">
    <p v-if="isLoading" class="conversation-loading">Loading messages...</p>

    <p
      v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay"
      class="conversation-empty"
    >
      No messages in this thread yet.
    </p>

    <ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
      <li v-if="hasMoreAbove" class="conversation-load-more">
        <button
          type="button"
          class="load-more-button"
          :disabled="isLoadingMore || isLoadingPersistedAbove"
          @click="loadMoreAbove"
        >
          {{ isLoadingMore || isLoadingPersistedAbove ? 'Loading…' : 'Load earlier messages' }}
        </button>
      </li>
      <template v-for="message in visibleMessages" :key="message.id">
      <li
        v-if="!hiddenGroupedCommandIds.has(message.id) && !hiddenFileChangeMessageIds.has(message.id)"
        class="conversation-item"
        :data-role="message.role"
        :data-message-type="message.messageType || ''"
      >
        <div v-if="isCommandMessage(message)" class="message-row" data-role="system">
          <div class="message-stack" data-role="system">
            <button
              v-if="getGroupedCommandsForLatest(message).length > 0"
              type="button"
              class="cmd-row cmd-row-group cmd-compact"
              :class="[commandStatusClass(message), { 'cmd-expanded': isCommandGroupExpanded(message) }]"
              @click="toggleCommandGroup(message)"
            >
              <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandGroupExpanded(message) }">▶</span>
              <span class="cmd-group-label">{{ commandGroupSummaryLabel(message) }}</span>
              <span class="cmd-status">{{ commandGroupSummaryStatus(message) }}</span>
            </button>
            <div
              v-if="getGroupedCommandsForLatest(message).length > 0"
              class="cmd-group-wrap"
              :class="{ 'cmd-group-visible': isCommandGroupExpanded(message) }"
            >
              <div class="cmd-group-inner">
                <div
                  v-for="cmd in getCommandBlockForLatest(message)"
                  :key="`grouped-cmd-${cmd.id}`"
                  class="worked-cmd-item"
                >
                  <button
                    type="button"
                    class="cmd-row"
                    :class="[
                      commandStatusClass(cmd),
                      {
                        'cmd-expanded': isCommandExpanded(cmd),
                        'cmd-compact': true,
                      },
                    ]"
                    @click="toggleCommandExpand(cmd)"
                  >
                    <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandExpanded(cmd) }">▶</span>
                    <code class="cmd-label">{{ cmd.commandExecution?.command || '(command)' }}</code>
                    <span class="cmd-status">{{ commandStatusLabel(cmd) }}</span>
                  </button>
                  <div
                    class="cmd-output-wrap"
                    :class="{ 'cmd-output-visible': isCommandExpanded(cmd) }"
                  >
                    <div class="cmd-output-inner">
                      <pre
                        class="cmd-output"
                        :class="{ 'cmd-output-condensed': isCommandOutputCondensed(cmd) }"
                        v-text="cmd.commandExecution?.aggregatedOutput || '(no output)'"
                      ></pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <template v-else>
              <button
                type="button"
                class="cmd-row"
                :class="[
                  commandStatusClass(message),
                  {
                    'cmd-expanded': isCommandExpanded(message),
                    'cmd-compact': isCommandCompact(message),
                  },
                ]"
                @click="toggleCommandExpand(message)"
              >
                <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandExpanded(message) }">▶</span>
                <code class="cmd-label">{{ message.commandExecution?.command || '(command)' }}</code>
                <span class="cmd-status">{{ commandStatusLabel(message) }}</span>
              </button>
              <div
                class="cmd-output-wrap"
                :class="{ 'cmd-output-visible': isCommandExpanded(message) }"
              >
                <div class="cmd-output-inner">
                  <pre
                    class="cmd-output"
                    :class="{ 'cmd-output-condensed': isCommandOutputCondensed(message) }"
                    v-text="message.commandExecution?.aggregatedOutput || '(no output)'"
                  ></pre>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div
          v-else-if="isFileChangeMessage(message)"
          class="message-row"
          :data-role="message.role"
          :data-message-type="message.messageType || ''"
        >
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <section v-if="readStandaloneFileChangeSummary(message)" class="file-change-summary-block">
                <button
                  type="button"
                  class="cmd-row cmd-row-group cmd-compact file-change-summary-row"
                  :class="{ 'cmd-expanded': isFileChangeSummaryExpanded(message) }"
                  @click="toggleFileChangeSummary(message)"
                >
                  <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isFileChangeSummaryExpanded(message) }">▶</span>
                  <span class="file-change-summary-label">
                    {{ fileChangeSummaryLabel(readStandaloneFileChangeSummary(message)) }}
                  </span>
                  <span class="file-change-summary-status">
                    <span
                      v-for="part in fileChangeSummaryStatusParts(readStandaloneFileChangeSummary(message))"
                      :key="`summary-status:${message.id}:${part.tone}:${part.label}`"
                      class="file-change-signed-count"
                      :data-tone="part.tone"
                    >
                      {{ part.label }}
                    </span>
                  </span>
                </button>
                <div class="cmd-group-wrap" :class="{ 'cmd-group-visible': isFileChangeSummaryExpanded(message) }">
                  <div class="file-change-panel-inner">
                    <ul class="file-change-list">
                      <li
                        v-for="change in readStandaloneFileChangeSummary(message)?.changes ?? []"
                        :key="`file-change:${message.id}:${change.path}:${change.movedToPath || ''}`"
                        class="file-change-item"
                      >
                        <span class="file-change-badge" :data-operation="fileChangeOperationTone(change)">
                          {{ fileChangeOperationLabel(change) }}
                        </span>
                        <button
                          type="button"
                          class="file-change-path-button"
                          :title="change.path"
                          @click="openDiffViewer(readStandaloneFileChangeSummary(message), change)"
                        >
                          {{ displayFileChangePath(change.path) }}
                        </button>
                        <span v-if="change.movedToPath" class="file-change-arrow">→</span>
                        <button
                          v-if="change.movedToPath"
                          type="button"
                          class="file-change-path-button"
                          :title="change.movedToPath"
                          @click="openDiffViewer(readStandaloneFileChangeSummary(message), change)"
                        >
                          {{ displayFileChangePath(change.movedToPath) }}
                        </button>
                        <span v-if="change.addedLineCount > 0 || change.removedLineCount > 0" class="file-change-delta">
                          <span
                            v-for="part in fileChangeDeltaParts(change)"
                            :key="`change-delta:${message.id}:${change.path}:${part.tone}:${part.label}`"
                            class="file-change-signed-count"
                            :data-tone="part.tone"
                          >
                            {{ part.label }}
                          </span>
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </article>
          </div>
        </div>

        <div v-else class="message-row" :data-role="message.role" :data-message-type="message.messageType || ''">
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <ul
                v-if="message.images && message.images.length > 0"
                class="message-image-list"
                :class="{ 'message-generated-image-list': message.messageType === 'imageView' }"
                :data-role="message.role"
              >
                <li v-for="imageUrl in message.images" :key="imageUrl" class="message-image-item">
                  <button class="message-image-button" type="button" @click="openImageModal(imageUrl)">
                    <img
                      class="message-image-preview"
                      :class="{ 'message-generated-image-preview': message.messageType === 'imageView' }"
                      :src="imageUrl"
                      :alt="message.messageType === 'imageView' ? 'Generated image' : 'Message image preview'"
                      loading="lazy"
                    />
                  </button>
                </li>
              </ul>

              <div v-if="message.fileAttachments && message.fileAttachments.length > 0" class="message-file-attachments">
                <span v-for="att in message.fileAttachments" :key="`${message.id}:${att.path}`" class="message-file-chip">
                  <span class="message-file-chip-icon">📄</span>
                  <a
                    class="message-file-link message-file-chip-name"
                    :href="toBrowseUrl(att.path)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="att.path"
                  >
                    {{ att.label }}
                  </a>
                </span>
              </div>

              <div v-if="message.skills && message.skills.length > 0" class="message-skill-attachments">
                <a
                  v-for="skill in message.skills"
                  :key="`${message.id}:${skill.path}`"
                  class="message-skill-chip"
                  :href="toBrowseUrl(skill.path)"
                  :title="skill.path"
                >
                  <span class="message-skill-chip-prefix">Skill</span>
                  <span class="message-skill-chip-name">{{ skill.name }}</span>
                </a>
              </div>

              <article v-if="message.text.length > 0" class="message-card" :data-role="message.role">
                <div v-if="message.isAutomationRun" class="automation-message-label">
                  <span>Sent via automation</span>
                  <code v-if="message.automationDisplayName">{{ message.automationDisplayName }}</code>
                </div>
                <div v-if="message.messageType === 'worked'" class="worked-separator-wrap" aria-live="polite">
                  <button type="button" class="worked-separator" @click="toggleWorkedExpand(message)">
                    <span class="worked-separator-line" aria-hidden="true" />
                    <span class="worked-chevron" :class="{ 'worked-chevron-open': isWorkedExpanded(message) }">▶</span>
                    <p class="worked-separator-text">{{ message.text }}</p>
                    <span class="worked-separator-line" aria-hidden="true" />
                  </button>
                  <div v-if="isWorkedExpanded(message)" class="worked-details">
                    <div
                      v-for="cmd in getCommandsForWorked(messages, messages.indexOf(message))"
                      :key="`worked-cmd-${cmd.id}`"
                      class="worked-cmd-item"
                    >
                      <button
                        type="button"
                        class="cmd-row"
                        :class="[
                          commandStatusClass(cmd),
                          {
                            'cmd-expanded': isCommandExpanded(cmd),
                            'cmd-compact': isCommandCompact(cmd),
                          },
                        ]"
                        @click="toggleCommandExpand(cmd)"
                      >
                        <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isCommandExpanded(cmd) }">▶</span>
                        <code class="cmd-label">{{ cmd.commandExecution?.command || '(command)' }}</code>
                        <span class="cmd-status">{{ commandStatusLabel(cmd) }}</span>
                      </button>
                      <div
                        class="cmd-output-wrap"
                        :class="{ 'cmd-output-visible': isCommandExpanded(cmd) }"
                      >
                        <div class="cmd-output-inner">
                          <pre
                            class="cmd-output"
                            :class="{ 'cmd-output-condensed': isCommandOutputCondensed(cmd) }"
                            v-text="cmd.commandExecution?.aggregatedOutput || '(no output)'"
                          ></pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else-if="isPlanMessage(message)" class="plan-card" :data-streaming="message.messageType === 'plan.live'">
                  <div class="plan-card-header">
                    <p class="plan-card-title">Plan</p>
                    <span v-if="message.messageType === 'plan.live'" class="plan-card-badge">Updating</span>
                  </div>
                  <div
                    v-if="readPlanExplanation(message)"
                    class="plan-card-explanation plan-card-markdown"
                    v-html="renderMarkdownBlocksAsHtml(readPlanExplanation(message))"
                  />
                  <ol v-if="readPlanSteps(message).length > 0" class="plan-step-list">
                    <li
                      v-for="(step, stepIndex) in readPlanSteps(message)"
                      :key="`${message.id}:plan-step:${stepIndex}`"
                      class="plan-step-item"
                      :data-status="step.status"
                    >
                      <span class="plan-step-status" :data-status="step.status">{{ planStepStatusIcon(step.status) }}</span>
                      <div class="plan-step-text plan-card-markdown" v-html="renderMarkdownBlocksAsHtml(step.step)" />
                    </li>
                  </ol>
                  <div v-else class="plan-card-markdown" v-html="renderMarkdownBlocksAsHtml(message.text)" />
                  <div v-if="showImplementPlanButton(message)" class="plan-card-actions">
                    <button
                      type="button"
                      class="plan-card-implement-button"
                      @click="implementPlan(message)"
                    >
                      Implement plan
                    </button>
                  </div>
                </div>
                <div
                  v-else
                  class="message-text-flow"
                  v-memo="[message.id, message.text, props.cwd, highlightCacheVersion, markdownImageFailureVersion]"
                >
                  <template v-for="(block, blockIndex) in getMessageBlocks(message)" :key="`block-${blockIndex}`">
                    <p v-if="block.kind === 'paragraph'" class="message-text">
                      <template v-for="(segment, segmentIndex) in getInlineSegments(block.value)" :key="`seg-${blockIndex}-${segmentIndex}`">
                        <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                        <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
                        <em v-else-if="segment.kind === 'italic'" class="message-italic-text">{{ segment.value }}</em>
                        <s v-else-if="segment.kind === 'strikethrough'" class="message-strikethrough-text">{{ segment.value }}</s>
                        <a
                          v-else-if="segment.kind === 'file'"
                          class="message-file-link"
                          :href="toBrowseUrl(segment.path)"
                          target="_blank"
                          rel="noopener noreferrer"
                          :title="segment.path"
                        >
                          {{ segment.displayPath }}
                        </a>
                        <a
                          v-else-if="segment.kind === 'url'"
                          class="message-file-link"
                          :href="segment.href"
                          target="_blank"
                          rel="noopener noreferrer"
                          :title="segment.href"
                        >
                          {{ segment.value }}
                        </a>
                        <code v-else class="message-inline-code">{{ segment.value }}</code>
                      </template>
                    </p>
                    <component
                      :is="headingTag(block.level)"
                      v-else-if="block.kind === 'heading'"
                      class="message-heading"
                      :class="headingClass(block.level)"
                    >
                      <template v-for="(segment, segmentIndex) in getInlineSegments(block.value)" :key="`heading-seg-${blockIndex}-${segmentIndex}`">
                        <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                        <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
                        <em v-else-if="segment.kind === 'italic'" class="message-italic-text">{{ segment.value }}</em>
                        <s v-else-if="segment.kind === 'strikethrough'" class="message-strikethrough-text">{{ segment.value }}</s>
                        <a
                          v-else-if="segment.kind === 'file'"
                          class="message-file-link"
                          :href="toBrowseUrl(segment.path)"
                          target="_blank"
                          rel="noopener noreferrer"
                          :title="segment.path"
                        >
                          {{ segment.displayPath }}
                        </a>
                        <a
                          v-else-if="segment.kind === 'url'"
                          class="message-file-link"
                          :href="segment.href"
                          target="_blank"
                          rel="noopener noreferrer"
                          :title="segment.href"
                        >
                          {{ segment.value }}
                        </a>
                        <code v-else class="message-inline-code">{{ segment.value }}</code>
                      </template>
                    </component>
                    <blockquote v-else-if="block.kind === 'blockquote'" class="message-blockquote">
                      <template v-for="(segment, segmentIndex) in getInlineSegments(block.value)" :key="`quote-seg-${blockIndex}-${segmentIndex}`">
                        <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                        <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
                        <em v-else-if="segment.kind === 'italic'" class="message-italic-text">{{ segment.value }}</em>
                        <s v-else-if="segment.kind === 'strikethrough'" class="message-strikethrough-text">{{ segment.value }}</s>
                        <a
                          v-else-if="segment.kind === 'file'"
                          class="message-file-link"
                          :href="toBrowseUrl(segment.path)"
                          target="_blank"
                          rel="noopener noreferrer"
                          :title="segment.path"
                        >
                          {{ segment.displayPath }}
                        </a>
                        <a
                          v-else-if="segment.kind === 'url'"
                          class="message-file-link"
                          :href="segment.href"
                          target="_blank"
                          rel="noopener noreferrer"
                          :title="segment.href"
                        >
                          {{ segment.value }}
                        </a>
                        <code v-else class="message-inline-code">{{ segment.value }}</code>
                      </template>
                    </blockquote>
                    <ul v-else-if="block.kind === 'unorderedList'" class="message-list message-list-unordered">
                      <li v-for="(item, itemIndex) in block.items" :key="`ul-${blockIndex}-${itemIndex}`" class="message-list-item">
                        <div class="message-list-item-content" v-html="renderListItemContentAsHtml(item)" />
                      </li>
                    </ul>
                    <ul v-else-if="block.kind === 'taskList'" class="message-list message-task-list">
                      <li v-for="(item, itemIndex) in block.items" :key="`task-${blockIndex}-${itemIndex}`" class="message-task-item">
                        <span class="message-task-checkbox" :data-checked="item.checked">{{ item.checked ? '☑' : '☐' }}</span>
                        <div class="message-list-item-text">
                          <template v-for="(segment, segmentIndex) in getInlineSegments(item.text)" :key="`task-seg-${blockIndex}-${itemIndex}-${segmentIndex}`">
                            <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                            <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
                            <em v-else-if="segment.kind === 'italic'" class="message-italic-text">{{ segment.value }}</em>
                            <s v-else-if="segment.kind === 'strikethrough'" class="message-strikethrough-text">{{ segment.value }}</s>
                            <a
                              v-else-if="segment.kind === 'file'"
                              class="message-file-link"
                              :href="toBrowseUrl(segment.path)"
                              target="_blank"
                              rel="noopener noreferrer"
                              :title="segment.path"
                            >
                              {{ segment.displayPath }}
                            </a>
                            <a
                              v-else-if="segment.kind === 'url'"
                              class="message-file-link"
                              :href="segment.href"
                              target="_blank"
                              rel="noopener noreferrer"
                              :title="segment.href"
                            >
                              {{ segment.value }}
                            </a>
                            <code v-else class="message-inline-code">{{ segment.value }}</code>
                          </template>
                        </div>
                      </li>
                    </ul>
                    <ol
                      v-else-if="block.kind === 'orderedList'"
                      class="message-list message-list-ordered"
                      :start="block.start"
                    >
                      <li v-for="(item, itemIndex) in block.items" :key="`ol-${blockIndex}-${itemIndex}`" class="message-list-item">
                        <div class="message-list-item-content" v-html="renderListItemContentAsHtml(item)" />
                      </li>
                    </ol>
                    <div v-else-if="block.kind === 'table'" class="message-table-wrap">
                      <table class="message-table">
                        <thead>
                          <tr>
                            <th
                              v-for="(cell, cellIndex) in block.headers"
                              :key="`th-${blockIndex}-${cellIndex}`"
                              class="message-table-head-cell"
                              :style="{ textAlign: block.alignments[cellIndex] ?? 'left' }"
                            >
                              <template v-for="(segment, segmentIndex) in getInlineSegments(cell)" :key="`th-seg-${blockIndex}-${cellIndex}-${segmentIndex}`">
                                <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                                <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
                                <em v-else-if="segment.kind === 'italic'" class="message-italic-text">{{ segment.value }}</em>
                                <s v-else-if="segment.kind === 'strikethrough'" class="message-strikethrough-text">{{ segment.value }}</s>
                                <a
                                  v-else-if="segment.kind === 'file'"
                                  class="message-file-link"
                                  :href="toBrowseUrl(segment.path)"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  :title="segment.path"
                                >
                                  {{ segment.displayPath }}
                                </a>
                                <a
                                  v-else-if="segment.kind === 'url'"
                                  class="message-file-link"
                                  :href="segment.href"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  :title="segment.href"
                                >
                                  {{ segment.value }}
                                </a>
                                <code v-else class="message-inline-code">{{ segment.value }}</code>
                              </template>
                            </th>
                          </tr>
                        </thead>
                        <tbody v-if="block.rows.length > 0">
                          <tr v-for="(row, rowIndex) in block.rows" :key="`tr-${blockIndex}-${rowIndex}`" class="message-table-body-row">
                            <td
                              v-for="(cell, cellIndex) in row"
                              :key="`td-${blockIndex}-${rowIndex}-${cellIndex}`"
                              class="message-table-cell"
                              :style="{ textAlign: block.alignments[cellIndex] ?? 'left' }"
                            >
                              <template v-for="(segment, segmentIndex) in getInlineSegments(cell)" :key="`td-seg-${blockIndex}-${rowIndex}-${cellIndex}-${segmentIndex}`">
                                <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
                                <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
                                <em v-else-if="segment.kind === 'italic'" class="message-italic-text">{{ segment.value }}</em>
                                <s v-else-if="segment.kind === 'strikethrough'" class="message-strikethrough-text">{{ segment.value }}</s>
                                <a
                                  v-else-if="segment.kind === 'file'"
                                  class="message-file-link"
                                  :href="toBrowseUrl(segment.path)"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  :title="segment.path"
                                >
                                  {{ segment.displayPath }}
                                </a>
                                <a
                                  v-else-if="segment.kind === 'url'"
                                  class="message-file-link"
                                  :href="segment.href"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  :title="segment.href"
                                >
                                  {{ segment.value }}
                                </a>
                                <code v-else class="message-inline-code">{{ segment.value }}</code>
                              </template>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div v-else-if="block.kind === 'codeBlock'" class="message-code-block">
                      <div v-if="block.language" class="message-code-language">{{ block.language }}</div>
                      <pre class="message-code-pre"><code class="hljs" v-html="renderCachedHighlightedCodeAsHtml(block.language, block.value)"></code></pre>
                    </div>
                    <hr v-else-if="block.kind === 'thematicBreak'" class="message-divider" />
                    <p v-else-if="isMarkdownImageFailed(message.id, blockIndex)" class="message-text">{{ block.markdown }}</p>
                    <button
                      v-else
                      class="message-image-button"
                      type="button"
                      @click="openImageModal(block.url)"
                    >
                      <img
                        class="message-image-preview message-markdown-image"
                        :src="block.url"
                        :alt="block.alt || 'Embedded message image'"
                        loading="lazy"
                        @error="onMarkdownImageError(message.id, blockIndex)"
                      />
                    </button>
                  </template>
                </div>
                <a
                  v-if="isTurnErrorMessage(message)"
                  class="turn-error-feedback"
                  :href="feedbackMailto"
                  @click="prepareTurnErrorFeedback($event, message.text)"
                >
                  Send feedback
                </a>
              </article>

              <section v-if="readAnchoredFileChangeSummary(message)" class="file-change-summary-block file-change-summary-block-inline">
                <button
                  type="button"
                  class="cmd-row cmd-row-group cmd-compact file-change-summary-row"
                  :class="{ 'cmd-expanded': isFileChangeSummaryExpanded(message) }"
                  @click="toggleFileChangeSummary(message)"
                >
                  <span class="cmd-chevron" :class="{ 'cmd-chevron-open': isFileChangeSummaryExpanded(message) }">▶</span>
                  <span class="file-change-summary-label">
                    {{ fileChangeSummaryLabel(readAnchoredFileChangeSummary(message)) }}
                  </span>
                  <span class="file-change-summary-status">
                    <span
                      v-for="part in fileChangeSummaryStatusParts(readAnchoredFileChangeSummary(message))"
                      :key="`summary-status:${message.id}:${part.tone}:${part.label}`"
                      class="file-change-signed-count"
                      :data-tone="part.tone"
                    >
                      {{ part.label }}
                    </span>
                  </span>
                </button>
                <div class="cmd-group-wrap" :class="{ 'cmd-group-visible': isFileChangeSummaryExpanded(message) }">
                  <div class="file-change-panel-inner">
                    <ul class="file-change-list">
                      <li
                        v-for="change in readAnchoredFileChangeSummary(message)?.changes ?? []"
                        :key="`file-change:inline:${message.id}:${change.path}:${change.movedToPath || ''}`"
                        class="file-change-item"
                      >
                        <span class="file-change-badge" :data-operation="fileChangeOperationTone(change)">
                          {{ fileChangeOperationLabel(change) }}
                        </span>
                        <button
                          type="button"
                          class="file-change-path-button"
                          :title="change.path"
                          @click="openDiffViewer(readAnchoredFileChangeSummary(message), change)"
                        >
                          {{ displayFileChangePath(change.path) }}
                        </button>
                        <span v-if="change.movedToPath" class="file-change-arrow">→</span>
                        <button
                          v-if="change.movedToPath"
                          type="button"
                          class="file-change-path-button"
                          :title="change.movedToPath"
                          @click="openDiffViewer(readAnchoredFileChangeSummary(message), change)"
                        >
                          {{ displayFileChangePath(change.movedToPath) }}
                        </button>
                        <span v-if="change.addedLineCount > 0 || change.removedLineCount > 0" class="file-change-delta">
                          <span
                            v-for="part in fileChangeDeltaParts(change)"
                            :key="`change-delta:inline:${message.id}:${change.path}:${part.tone}:${part.label}`"
                            class="file-change-signed-count"
                            :data-tone="part.tone"
                          >
                            {{ part.label }}
                          </span>
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              <div
                v-if="showCopyResponseButton(message) || showEditMessageButton(message)"
                class="message-toolbar"
                :data-role="message.role"
              >
                <button
                  v-if="showEditMessageButton(message)"
                  type="button"
                  class="message-edit-button"
                  aria-label="Edit this message"
                  title="Edit this message"
                  @click="editMessage(message.id)"
                >
                  <IconTablerFilePencil class="icon-svg message-edit-icon" />
                  <span class="message-edit-label">Edit message</span>
                </button>
                <button
                  v-if="showForkResponseButton(message)"
                  type="button"
                  class="message-fork-button"
                  aria-label="Fork thread from this response"
                  title="Fork thread from this response"
                  @click="forkResponse(message.id)"
                >
                  <IconTablerGitFork class="icon-svg message-fork-icon" />
                  <span class="message-fork-label">Fork</span>
                </button>
                <button
                  v-if="showCopyResponseButton(message)"
                  type="button"
                  class="message-copy-button"
                  :data-copied="copiedResponseAnchorId === message.id"
                  :aria-label="copiedResponseAnchorId === message.id ? 'Response copied' : 'Copy response'"
                  :title="copiedResponseAnchorId === message.id ? 'Response copied' : 'Copy response'"
                  @click="copyResponse(message.id)"
                >
                  <IconTablerCopy class="icon-svg message-copy-icon" />
                  <span class="message-copy-label">{{ copiedResponseAnchorId === message.id ? 'Copied' : 'Copy' }}</span>
                </button>
              </div>
            </article>
          </div>
        </div>
      </li>
      </template>
      <li v-if="liveOverlay" class="conversation-item conversation-item-overlay">
        <div class="message-row">
          <div class="message-stack">
            <article class="live-overlay-inline" aria-live="polite">
              <p class="live-overlay-label">{{ liveOverlay.activityLabel }}</p>
              <p
                v-if="liveOverlay.reasoningText"
                class="live-overlay-reasoning"
              >
                {{ liveOverlay.reasoningText }}
              </p>
              <div v-if="liveOverlay.errorText" class="live-overlay-error">
                <span>{{ liveOverlay.errorText }}</span>
                <a class="live-overlay-feedback" :href="feedbackMailto" @click="prepareLiveErrorFeedback($event, liveOverlay.errorText)">Send feedback</a>
              </div>
            </article>
          </div>
        </div>
      </li>
      <li ref="bottomAnchorRef" class="conversation-bottom-anchor" />
    </ul>

    <button
      v-if="showJumpToLatestButton"
      type="button"
      class="jump-to-latest-button"
      title="Jump to latest"
      aria-label="Jump to latest output"
      @click="jumpToLatest"
    >
      <IconTablerArrowUp class="icon-svg jump-to-latest-icon" />
    </button>

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" aria-label="Close image preview" @click="closeImageModal">
          <IconTablerX class="icon-svg" />
        </button>
        <img class="image-modal-image" :src="modalImageUrl" alt="Expanded message image" />
      </div>
    </div>

    <div
      v-if="isFileLinkContextMenuVisible"
      ref="fileLinkContextMenuRef"
      class="file-link-context-menu"
      :style="fileLinkContextMenuStyle"
      @click.stop
    >
      <button type="button" class="file-link-context-menu-item" @click="openFileLinkContextBrowse">
        Open link
      </button>
      <button type="button" class="file-link-context-menu-item" @click="copyFileLinkContextLink">
        Copy link
      </button>
      <button
        v-if="fileLinkContextEditUrl"
        type="button"
        class="file-link-context-menu-item"
        @click="openFileLinkContextEdit"
      >
        Edit file
      </button>
    </div>

    <div v-if="activeDiffViewerChange" class="diff-viewer-backdrop" @click="closeDiffViewer">
      <div class="diff-viewer-shell" @click.stop>
        <aside v-if="!isMobile" class="diff-viewer-sidebar">
          <div class="diff-viewer-sidebar-header">
            <p class="diff-viewer-sidebar-title">Changed files</p>
            <p class="diff-viewer-sidebar-count">{{ formatFileChangeCountLabel(diffViewerChanges.length) }}</p>
          </div>
          <div class="diff-viewer-sidebar-list">
            <button
              v-for="change in diffViewerChanges"
              :key="`diff-viewer:${fileChangeKey(change)}`"
              type="button"
              class="diff-viewer-file-button"
              :data-active="fileChangeKey(change) === fileChangeKey(activeDiffViewerChange)"
              @click="selectDiffViewerChange(change)"
            >
              <span class="file-change-badge" :data-operation="fileChangeOperationTone(change)">
                {{ fileChangeOperationLabel(change) }}
              </span>
              <span class="diff-viewer-file-label">
                {{ displayFileChangePath(change.path) }}
                <template v-if="change.movedToPath"> → {{ displayFileChangePath(change.movedToPath) }}</template>
              </span>
              <span v-if="formatFileChangeDelta(change)" class="diff-viewer-file-delta">{{ formatFileChangeDelta(change) }}</span>
            </button>
          </div>
        </aside>

        <section class="diff-viewer-main">
          <div class="diff-viewer-toolbar">
            <div class="diff-viewer-title-wrap">
              <p class="diff-viewer-title">
                {{ displayFileChangePath(activeDiffViewerChange.path) }}
                <template v-if="activeDiffViewerChange.movedToPath"> → {{ displayFileChangePath(activeDiffViewerChange.movedToPath) }}</template>
              </p>
              <p class="diff-viewer-subtitle">
                {{ fileChangeOperationLabel(activeDiffViewerChange) }}
                <span v-if="formatFileChangeDelta(activeDiffViewerChange)"> · {{ formatFileChangeDelta(activeDiffViewerChange) }}</span>
              </p>
            </div>
            <div class="diff-viewer-toolbar-actions">
              <button
                v-if="isMobile"
                type="button"
                class="diff-viewer-mobile-files-button"
                @click="toggleDiffViewerFileList"
              >
                {{ formatFileChangeCountLabel(diffViewerChanges.length) }}
              </button>
              <button class="image-modal-close diff-viewer-close" type="button" aria-label="Close diff viewer" @click="closeDiffViewer">
                <IconTablerX class="icon-svg" />
              </button>
            </div>
          </div>

          <div v-if="!hasDiffViewerContent(activeDiffViewerChange)" class="diff-viewer-empty">
            <p class="diff-viewer-empty-title">No diff available</p>
            <p class="diff-viewer-empty-text">This summary was restored from the final answer text, but the thread history does not include patch diff content for this file.</p>
          </div>

          <div v-else class="diff-viewer-panel">
            <div class="diff-viewer-meta">
              <span class="diff-viewer-language">{{ inferDiffViewerLanguage(activeDiffViewerChange) || 'diff' }}</span>
            </div>
            <div class="diff-viewer-lines">
              <div
                v-for="line in activeDiffViewerLines"
                :key="line.key"
                class="diff-viewer-line"
                :data-kind="line.kind"
              >
                <span class="diff-viewer-line-number">{{ line.oldLine ?? '' }}</span>
                <span class="diff-viewer-line-number">{{ line.newLine ?? '' }}</span>
                <span class="diff-viewer-line-marker">{{ diffViewerMarker(line) }}</span>
                <code class="diff-viewer-line-code" v-html="escapeHtml(line.text) || '&nbsp;'"></code>
              </div>
            </div>
          </div>
        </section>

        <Transition name="diff-viewer-sheet">
          <div
            v-if="isMobile && isDiffViewerFileListOpen"
            class="diff-viewer-mobile-sheet-backdrop"
            @click="closeDiffViewerFileList"
          >
            <div class="diff-viewer-mobile-sheet" @click.stop>
              <div class="diff-viewer-mobile-sheet-handle" aria-hidden="true"></div>
              <div class="diff-viewer-mobile-sheet-header">
                <p class="diff-viewer-sidebar-title">Changed files</p>
                <p class="diff-viewer-sidebar-count">{{ formatFileChangeCountLabel(diffViewerChanges.length) }}</p>
              </div>
              <div class="diff-viewer-mobile-sheet-list">
                <button
                  v-for="change in diffViewerChanges"
                  :key="`diff-viewer-sheet:${fileChangeKey(change)}`"
                  type="button"
                  class="diff-viewer-file-button"
                  :data-active="fileChangeKey(change) === fileChangeKey(activeDiffViewerChange)"
                  @click="selectDiffViewerChange(change)"
                >
                  <span class="file-change-badge" :data-operation="fileChangeOperationTone(change)">
                    {{ fileChangeOperationLabel(change) }}
                  </span>
                  <span class="diff-viewer-file-label">
                    {{ displayFileChangePath(change.path) }}
                    <template v-if="change.movedToPath"> → {{ displayFileChangePath(change.movedToPath) }}</template>
                  </span>
                  <span v-if="formatFileChangeDelta(change)" class="diff-viewer-file-delta">{{ formatFileChangeDelta(change) }}</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { UiFileChange, UiLiveOverlay, UiMessage, UiPlanStep, UiServerRequest } from '../../types/codex'
import { useFeedbackDiagnostics } from '../../composables/useFeedbackDiagnostics'
import { useMobile } from '../../composables/useMobile'

import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerCopy from '../icons/IconTablerCopy.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'
import IconTablerX from '../icons/IconTablerX.vue'

type HighlightJsModule = (typeof import('highlight.js/lib/common'))['default']

const expandedCommandIds = ref<Set<string>>(new Set())
const collapsedAutoCommandIds = ref<Set<string>>(new Set())
const expandedCommandGroupIds = ref<Set<string>>(new Set())
const expandedWorkedIds = ref<Set<string>>(new Set())
const expandedFileChangeSummaryIds = ref<Set<string>>(new Set())
const activeDiffViewerSummary = ref<TurnFileChangeSummary | null>(null)
const activeDiffViewerChangeKey = ref('')
const isDiffViewerFileListOpen = ref(false)
const fileLinkContextMenuRef = ref<HTMLElement | null>(null)
const isFileLinkContextMenuVisible = ref(false)
const fileLinkContextMenuX = ref(0)
const fileLinkContextMenuY = ref(0)
const fileLinkContextBrowseUrl = ref('')
const fileLinkContextEditUrl = ref('')
const { isMobile } = useMobile()
const { buildFeedbackMailto, feedbackMailtoBase, recordVisibleFailure } = useFeedbackDiagnostics()
const feedbackMailto = feedbackMailtoBase()

function prepareLiveErrorFeedback(event: MouseEvent, message: string): void {
  recordVisibleFailure(message)
  const target = event.currentTarget
  if (target instanceof HTMLAnchorElement) {
    target.href = buildFeedbackMailto()
  }
}

function prepareTurnErrorFeedback(event: MouseEvent, message: string): void {
  recordVisibleFailure(message)
  const target = event.currentTarget
  if (target instanceof HTMLAnchorElement) {
    target.href = buildFeedbackMailto()
  }
}

function parsePlanFromMessageText(text: string): { explanation: string; steps: UiPlanStep[] } | null {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const steps: UiPlanStep[] = []
  const explanationLines: string[] = []

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (steps.length === 0) explanationLines.push('')
      continue
    }

    const match = trimmed.match(/^[-*]\s+\[([ xX~>|-])\]\s+(.+)$/)
    if (match) {
      const marker = (match[1] ?? ' ').toLowerCase()
      let status: UiPlanStep['status'] = 'pending'
      if (marker === 'x') status = 'completed'
      if (marker === '~' || marker === '>' || marker === '-') status = 'inProgress'
      steps.push({
        step: match[2]?.trim() ?? '',
        status,
      })
      continue
    }

    explanationLines.push(trimmed)
  }

  if (steps.length === 0) return null
  return {
    explanation: explanationLines.join('\n').trim(),
    steps: steps.filter((step) => step.step.length > 0),
  }
}

function readPlanData(message: UiMessage): { explanation: string; steps: UiPlanStep[] } | null {
  if (message.plan && message.plan.steps.length > 0) {
    return {
      explanation: message.plan.explanation?.trim() ?? '',
      steps: message.plan.steps,
    }
  }
  return parsePlanFromMessageText(message.text)
}

function isCommandMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' && !!message.commandExecution
}

function isPlanMessage(message: UiMessage): boolean {
  return message.messageType === 'plan' || message.messageType === 'plan.live'
}

function isTurnErrorMessage(message: UiMessage): boolean {
  return message.messageType === 'turnError'
}

function buildPlanMessageText(explanation: string, steps: UiPlanStep[]): string {
  const lines: string[] = []
  if (explanation.trim()) {
    lines.push(explanation.trim())
  }
  for (const step of steps) {
    const marker = step.status === 'completed' ? 'x' : step.status === 'inProgress' ? '~' : ' '
    lines.push(`- [${marker}] ${step.step}`)
  }
  return lines.join('\n').trim()
}

function showImplementPlanButton(message: UiMessage): boolean {
  return isPlanMessage(message)
    && message.messageType !== 'plan.live'
    && message.role === 'assistant'
    && Boolean(message.turnId)
}

function implementPlan(message: UiMessage): void {
  const turnId = message.turnId?.trim() ?? ''
  if (!turnId) return
  emit('implementPlan', { turnId })
}

function isFileChangeMessage(message: UiMessage): boolean {
  return message.messageType === 'fileChange'
    && message.fileChangeStatus === 'completed'
    && Array.isArray(message.fileChanges)
    && message.fileChanges.length > 0
}

function isCopyableAssistantMessage(message: UiMessage): boolean {
  return message.role === 'assistant'
    && !isCommandMessage(message)
    && message.messageType !== 'worked'
    && !(message.messageType ?? '').endsWith('.live')
}

const activeCommandMessageId = computed(() => {
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    const message = props.messages[index]
    if (message.messageType === 'commandExecution' && message.commandExecution?.status === 'inProgress') {
      return message.id
    }
  }
  return ''
})

const hasLiveAssistantText = computed(() =>
  props.messages.some((message) =>
    message.role === 'assistant' &&
    message.messageType === 'agentMessage.live' &&
    message.text.trim().length > 0,
  ),
)

const isLiveTurnRuntime = computed(() =>
  Boolean(props.liveOverlay) || activeCommandMessageId.value.length > 0 || hasLiveAssistantText.value,
)

const groupedCommandsByLatestId = computed<Record<string, UiMessage[]>>(() => {
  const next: Record<string, UiMessage[]> = {}
  for (let index = 0; index < props.messages.length;) {
    const message = props.messages[index]
    if (!isCommandMessage(message)) {
      index += 1
      continue
    }

    const block: UiMessage[] = []
    while (index < props.messages.length && isCommandMessage(props.messages[index])) {
      block.push(props.messages[index])
      index += 1
    }

    if (block.length <= 1) continue
    const latest = block[block.length - 1]
    next[latest.id] = block.slice(0, -1)
  }
  return next
})

const hiddenGroupedCommandIds = computed(() => {
  const next = new Set<string>()
  for (const commands of Object.values(groupedCommandsByLatestId.value)) {
    for (const command of commands) {
      next.add(command.id)
    }
  }
  return next
})

function readPlanExplanation(message: UiMessage): string {
  return readPlanData(message)?.explanation ?? ''
}

function readPlanSteps(message: UiMessage): UiPlanStep[] {
  return readPlanData(message)?.steps ?? []
}

function planStepStatusIcon(status: UiPlanStep['status']): string {
  switch (status) {
    case 'completed':
      return '✓'
    case 'inProgress':
      return '•'
    default:
      return '○'
  }
}

function isCommandAutoExpanded(message: UiMessage): boolean {
  return !hasLiveAssistantText.value && message.id === activeCommandMessageId.value
}

function isCommandExpanded(message: UiMessage): boolean {
  if (!isCommandMessage(message)) return false
  return expandedCommandIds.value.has(message.id)
    || (!collapsedAutoCommandIds.value.has(message.id) && isCommandAutoExpanded(message))
}

function isCommandCompact(message: UiMessage): boolean {
  return isCommandMessage(message) && isLiveTurnRuntime.value
}

function isCommandOutputCondensed(message: UiMessage): boolean {
  return isCommandMessage(message) && (isLiveTurnRuntime.value || message.commandExecution?.status === 'inProgress')
}

function toggleCommandExpand(message: UiMessage): void {
  if (!isCommandMessage(message)) return

  const nextExpanded = new Set(expandedCommandIds.value)
  const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
  const isAutoExpanded = isCommandAutoExpanded(message)
  const isManuallyExpanded = nextExpanded.has(message.id)

  if (isManuallyExpanded) {
    nextExpanded.delete(message.id)
    if (isAutoExpanded) nextCollapsedAuto.add(message.id)
  } else if (isAutoExpanded && !nextCollapsedAuto.has(message.id)) {
    nextCollapsedAuto.add(message.id)
  } else {
    nextExpanded.add(message.id)
    nextCollapsedAuto.delete(message.id)
  }

  expandedCommandIds.value = nextExpanded
  collapsedAutoCommandIds.value = nextCollapsedAuto
}

function getGroupedCommandsForLatest(message: UiMessage): UiMessage[] {
  return groupedCommandsByLatestId.value[message.id] ?? []
}

function getCommandBlockForLatest(message: UiMessage): UiMessage[] {
  if (!isCommandMessage(message)) return []
  return [...getGroupedCommandsForLatest(message), message]
}

function toggleCommandGroup(message: UiMessage): void {
  const groupedCommands = getGroupedCommandsForLatest(message)
  if (groupedCommands.length === 0) return
  const next = new Set(expandedCommandGroupIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedCommandGroupIds.value = next
}

function isCommandGroupExpanded(message: UiMessage): boolean {
  return expandedCommandGroupIds.value.has(message.id)
}

function commandGroupSummaryLabel(message: UiMessage): string {
  const commands = getCommandBlockForLatest(message)
  const count = commands.length
  const latestCommand = message.commandExecution?.command?.trim() || '(command)'
  const countLabel = count === 1 ? '1 command' : `${count} commands`
  return `${countLabel} · latest: ${latestCommand}`
}

function commandGroupSummaryStatus(message: UiMessage): string {
  return commandStatusLabel(message)
}

function toggleWorkedExpand(message: UiMessage): void {
  const next = new Set(expandedWorkedIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedWorkedIds.value = next
}

function isWorkedExpanded(message: UiMessage): boolean {
  return expandedWorkedIds.value.has(message.id)
}

function toggleFileChangeSummary(message: UiMessage): void {
  const next = new Set(expandedFileChangeSummaryIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedFileChangeSummaryIds.value = next
}

function isFileChangeSummaryExpanded(message: UiMessage): boolean {
  return expandedFileChangeSummaryIds.value.has(message.id)
}

function fileChangeKey(change: UiFileChange): string {
  return `${change.path}\u0000${change.movedToPath ?? ''}`
}

function openDiffViewer(summary: TurnFileChangeSummary | null, change: UiFileChange): void {
  if (!summary) return
  activeDiffViewerSummary.value = summary
  activeDiffViewerChangeKey.value = fileChangeKey(change)
  isDiffViewerFileListOpen.value = false
}

function closeDiffViewer(): void {
  activeDiffViewerSummary.value = null
  activeDiffViewerChangeKey.value = ''
  isDiffViewerFileListOpen.value = false
}

function toggleDiffViewerFileList(): void {
  isDiffViewerFileListOpen.value = !isDiffViewerFileListOpen.value
}

function closeDiffViewerFileList(): void {
  isDiffViewerFileListOpen.value = false
}

function selectDiffViewerChange(change: UiFileChange): void {
  activeDiffViewerChangeKey.value = fileChangeKey(change)
  if (isMobile.value) {
    isDiffViewerFileListOpen.value = false
  }
}

function commandStatusLabel(message: UiMessage): string {
  const ce = message.commandExecution
  if (!ce) return ''
  const compact = isCommandCompact(message)
  switch (ce.status) {
    case 'inProgress': return compact ? 'Running' : '⟳ Running'
    case 'completed': return ce.exitCode === 0 ? (compact ? 'Done' : '✓ Completed') : `Exit ${ce.exitCode ?? '?'}`
    case 'failed': return compact ? 'Failed' : '✗ Failed'
    case 'declined': return compact ? 'Declined' : '⊘ Declined'
    case 'interrupted': return compact ? 'Stopped' : '⊘ Interrupted'
    default: return ''
  }
}

function commandStatusClass(message: UiMessage): string {
  const s = message.commandExecution?.status
  if (s === 'inProgress') return 'cmd-status-running'
  if (s === 'completed' && message.commandExecution?.exitCode === 0) return 'cmd-status-ok'
  return 'cmd-status-error'
}

function pruneCommandIdSet(source: Set<string>, validIds: Set<string>): Set<string> {
  if (source.size === 0) return source
  const next = new Set<string>()
  for (const id of source) {
    if (validIds.has(id)) next.add(id)
  }
  return next.size === source.size ? source : next
}

function getCommandsForWorked(messages: UiMessage[], workedIndex: number): UiMessage[] {
  const result: UiMessage[] = []
  for (let i = workedIndex - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.messageType === 'commandExecution') result.unshift(m)
    else if (m.role === 'user' || m.messageType === 'worked') break
  }
  return result
}

const props = defineProps<{
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  liveOverlay: UiLiveOverlay | null
  isLoading: boolean
  activeThreadId: string
  cwd: string
  hasMorePersistedAbove?: boolean
  isLoadingPersistedAbove?: boolean
  loadEarlierMessages?: (threadId: string) => Promise<void>
}>()

const emit = defineEmits<{
  forkThread: [payload: { threadId: string; turnIndex: number }]
  rollback: [payload: { turnId: string }]
  implementPlan: [payload: { turnId: string }]
  respondServerRequest: [payload: { id: number; result?: unknown; error?: { code?: number; message: string } }]
}>()

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const copiedResponseAnchorId = ref('')
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const mcpElicitationAnswers = ref<Record<string, string | number | boolean | string[]>>({})
const autoFollowOutput = ref(true)
const BOTTOM_THRESHOLD_PX = 16
const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'c#': 'csharp',
  ps1: 'powershell',
}
type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'strikethrough'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'url'; value: string; href: string }
  | { kind: 'file'; value: string; path: string; displayPath: string; downloadName: string }
type TaskListItem = {
  text: string
  checked: boolean
}
type TableAlignment = 'left' | 'center' | 'right' | null
type ListItem = {
  paragraphs: string[]
  children?: MessageBlock[]
}
type MessageBlock =
  | { kind: 'paragraph'; value: string }
  | { kind: 'heading'; level: number; value: string }
  | { kind: 'blockquote'; value: string }
  | { kind: 'unorderedList'; items: ListItem[] }
  | { kind: 'taskList'; items: TaskListItem[] }
  | { kind: 'orderedList'; items: ListItem[]; start: number }
  | { kind: 'table'; headers: string[]; rows: string[][]; alignments: TableAlignment[] }
  | { kind: 'codeBlock'; language: string; value: string }
  | { kind: 'thematicBreak' }
  | { kind: 'image'; url: string; alt: string; markdown: string }

let conversationScrollFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let copiedMessageResetTimer: ReturnType<typeof setTimeout> | null = null
let conversationScrollPromise: Promise<void> | null = null
const trackedPendingImages = new WeakSet<HTMLImageElement>()
const highlightJsModule = ref<HighlightJsModule | null>(null)
const highlightCacheVersion = ref(0)
const markdownImageFailureVersion = ref(0)
let highlightJsLoader: Promise<void> | null = null
const MESSAGE_BLOCK_CACHE_LIMIT = 300
const INLINE_SEGMENT_CACHE_LIMIT = 1200
const MARKDOWN_HTML_CACHE_LIMIT = 300
const HIGHLIGHT_HTML_CACHE_LIMIT = 250

type MessageBlockCacheEntry = {
  text: string
  cwd: string
  blocks: MessageBlock[]
}

type MarkdownHtmlCacheEntry = {
  text: string
  cwd: string
  highlightVersion: number
  html: string
}

const messageBlockCache = new Map<string, MessageBlockCacheEntry>()
const inlineSegmentCache = new Map<string, InlineSegment[]>()
const markdownHtmlCache = new Map<string, MarkdownHtmlCacheEntry>()
const highlightHtmlCache = new Map<string, string>()

function setBoundedCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value as K | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
  return value
}

const RENDER_WINDOW_SIZE = 50
const LOAD_MORE_CHUNK = 30
const LOAD_MORE_SCROLL_THRESHOLD_PX = 200

const renderWindowStart = ref(0)
const isLoadingMore = ref(false)

const visibleMessages = computed(() => props.messages.slice(renderWindowStart.value))
const hasMoreAbove = computed(() => renderWindowStart.value > 0 || props.hasMorePersistedAbove === true)

const showJumpToLatestButton = computed(
  () => !autoFollowOutput.value && (props.messages.length > 0 || props.pendingRequests.length > 0 || Boolean(props.liveOverlay)),
)

function ensureHighlightJsLoaded(): Promise<void> {
  if (highlightJsModule.value) return Promise.resolve()
  if (!highlightJsLoader) {
    highlightJsLoader = import('highlight.js/lib/common')
      .then((module) => {
        highlightJsModule.value = module.default
        highlightHtmlCache.clear()
        markdownHtmlCache.clear()
        highlightCacheVersion.value += 1
      })
      .finally(() => {
        highlightJsLoader = null
      })
  }
  return highlightJsLoader
}

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isSecret: boolean
  isOther: boolean
  options: Array<{ label: string; description: string }>
}
type McpElicitationFieldOption = {
  value: string
  label: string
}
type McpElicitationField = {
  key: string
  label: string
  description: string
  required: boolean
  kind: 'string' | 'number' | 'boolean' | 'singleEnum' | 'multiEnum'
  inputType: string
  options: McpElicitationFieldOption[]
  defaultValue: string | number | boolean | string[]
}
type TurnFileChangeSummary = {
  changes: UiFileChange[]
  sourceMessageIds: string[]
  source: 'assistant' | 'metadata'
}
type DiffViewerLineKind = 'meta' | 'hunk' | 'add' | 'remove' | 'context'
type DiffViewerLine = {
  key: string
  kind: DiffViewerLineKind
  oldLine: number | null
  newLine: number | null
  text: string
}

function isFilePath(value: string): boolean {
  if (!value || /[\r\n]/u.test(value)) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false

  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  if (looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeRelative) return true

  const looksLikeBareFilename = /^[A-Za-z0-9._@() -]+\.[A-Za-z0-9]{1,12}$/u.test(value)
  if (looksLikeBareFilename) return true

  // Bare relative paths should look like actual path segments, not arbitrary prose containing "/".
  return /^[A-Za-z0-9._@() -]+(?:[\\/][A-Za-z0-9._@() -]+)+$/u.test(value)
}

function getBasename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/')
  const name = normalized.split('/').filter(Boolean).pop()
  return name || pathValue
}

function normalizePathSeparators(pathValue: string): string {
  return pathValue.replace(/\\/gu, '/')
}

function normalizeFileUrlToPath(pathValue: string): string {
  if (!pathValue.startsWith('file://')) return pathValue
  let stripped = pathValue.replace(/^file:\/\//u, '')
  try {
    stripped = decodeURIComponent(stripped)
  } catch {
    // Keep best-effort path if decoding fails.
  }
  if (/^\/[A-Za-z]:\//u.test(stripped)) {
    stripped = stripped.slice(1)
  }
  return stripped
}

function inferHomeFromCwd(cwd: string): string {
  const normalized = normalizePathSeparators(cwd)
  const userMatch = normalized.match(/^\/Users\/([^/]+)/u)
  if (userMatch) return `/Users/${userMatch[1]}`
  const homeMatch = normalized.match(/^\/home\/([^/]+)/u)
  if (homeMatch) return `/home/${homeMatch[1]}`
  return ''
}

function normalizePathDots(pathValue: string): string {
  const normalized = normalizePathSeparators(pathValue)
  if (!normalized) return normalized

  let root = ''
  let rest = normalized
  const driveMatch = rest.match(/^([A-Za-z]:)(\/.*)?$/u)
  if (driveMatch) {
    root = `${driveMatch[1]}/`
    rest = (driveMatch[2] ?? '').replace(/^\/+/u, '')
  } else if (rest.startsWith('/')) {
    root = '/'
    rest = rest.slice(1)
  }

  const parts = rest.split('/').filter(Boolean)
  const stack: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      if (stack.length > 0) stack.pop()
      continue
    }
    stack.push(part)
  }

  const joined = stack.join('/')
  if (root) return `${root}${joined}`.replace(/\/+$/u, '') || root
  return joined || normalized
}

function resolveRelativePath(pathValue: string, cwd: string): string {
  const normalizedPath = normalizePathSeparators(normalizeFileUrlToPath(pathValue.trim()))
  if (!normalizedPath) return ''

  const looksLikeAbsolute = normalizedPath.startsWith('/') || /^[A-Za-z]:\//u.test(normalizedPath)
  if (looksLikeAbsolute) return normalizePathDots(normalizedPath)

  if (normalizedPath.startsWith('~/')) {
    const homeBase = inferHomeFromCwd(cwd)
    if (homeBase) {
      return normalizePathDots(`${homeBase}/${normalizedPath.slice(2)}`)
    }
  }

  const base = normalizePathSeparators(cwd.trim())
  if (!base) return normalizePathDots(normalizedPath)
  return normalizePathDots(`${base.replace(/\/+$/u, '')}/${normalizedPath}`)
}

function parseFileReference(value: string): { path: string; line: number | null } | null {
  if (!value) return null

  let pathValue = value.trim()
  const wrapped = trimLinkWrappers(pathValue)
  pathValue = wrapped.core.trim()
  let line: number | null = null

  const hashLineMatch = pathValue.match(/^(.*)#L(\d+)(?:C\d+)?$/u)
  if (hashLineMatch) {
    pathValue = hashLineMatch[1]
    line = Number(hashLineMatch[2])
  } else {
    const colonLineMatch = pathValue.match(/^(.*):(\d+)(?::\d+)?$/u)
    if (colonLineMatch) {
      pathValue = colonLineMatch[1]
      line = Number(colonLineMatch[2])
    }
  }

  pathValue = normalizeFileUrlToPath(pathValue)
  if (!isFilePath(pathValue)) return null
  return { path: pathValue, line }
}

function trimLinkWrappers(value: string): { core: string; leading: string; trailing: string } {
  let core = value
  let leading = ''
  let trailing = ''

  const wrapperPairs: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
    '"': '"',
    '\'': '\'',
    '`': '`',
    '“': '”',
    '‘': '’',
  }

  while (core.length > 0) {
    const opening = core[0]
    const closing = Object.prototype.hasOwnProperty.call(wrapperPairs, opening) ? wrapperPairs[opening] : ''
    if (!closing || !core.endsWith(closing)) break
    leading += opening
    trailing += closing
    core = core.slice(1, -1)
  }

  return { core, leading, trailing }
}

function countAsterisksBefore(value: string, endIndex: number, minIndex: number): number {
  let count = 0
  let index = endIndex - 1
  while (index >= minIndex && value[index] === '*') {
    count += 1
    index -= 1
  }
  return count
}

function countAsterisksAfter(value: string, startIndex: number): number {
  let count = 0
  let index = startIndex
  while (index < value.length && value[index] === '*') {
    count += 1
    index += 1
  }
  return count
}

function readAsteriskLinkWrapper(
  source: string,
  matchStart: number,
  matchEnd: number,
  cursor: number,
  matchedToken: string,
): { segmentStart: number; segmentEnd: number; tokenEndTrim: number } | null {
  const leadingCount = countAsterisksBefore(source, matchStart, cursor)
  if (leadingCount < 2) return null

  const trailingOutsideCount = countAsterisksAfter(source, matchEnd)
  if (trailingOutsideCount >= leadingCount) {
    return {
      segmentStart: matchStart - leadingCount,
      segmentEnd: matchEnd + leadingCount,
      tokenEndTrim: 0,
    }
  }

  const trailingInsideCount = countAsterisksBefore(matchedToken, matchedToken.length, 0)
  if (trailingInsideCount >= leadingCount) {
    return {
      segmentStart: matchStart - leadingCount,
      segmentEnd: matchEnd,
      tokenEndTrim: leadingCount,
    }
  }

  return null
}

function parseMarkdownLinkToken(value: string): { label: string; target: string } | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(')')) return null
  const labelCloseIndex = trimmed.indexOf(']')
  if (labelCloseIndex <= 1) return null
  if (trimmed[labelCloseIndex + 1] !== '(') return null
  const labelRaw = trimmed.slice(1, labelCloseIndex).trim()
  const targetRaw = trimmed.slice(labelCloseIndex + 2, -1).trim()
  if (labelRaw.includes('\n') || targetRaw.includes('\n')) return null
  const label = trimLinkWrappers(labelRaw).core.trim() || labelRaw
  const target = trimLinkWrappers(targetRaw).core.trim()
  if (!target) return null
  return { label, target }
}

function toLocalThreadUrl(value: string): string | null {
  const match = value.trim().match(/^codex:\/\/threads\/([A-Za-z0-9-]+)$/u)
  if (!match) return null
  if (typeof window === 'undefined') return `/#/thread/${match[1]}`
  const basePath = window.location.pathname.replace(/\/?$/u, '/')
  return `${window.location.origin}${basePath}#/thread/${match[1]}`
}

function headingTag(level: number): string {
  const normalizedLevel = Math.min(6, Math.max(1, Math.trunc(level)))
  return `h${String(normalizedLevel)}`
}

function headingClass(level: number): string {
  switch (Math.min(6, Math.max(1, Math.trunc(level)))) {
    case 1:
      return 'message-heading-h1'
    case 2:
      return 'message-heading-h2'
    case 3:
      return 'message-heading-h3'
    case 4:
      return 'message-heading-h4'
    case 5:
      return 'message-heading-h5'
    default:
      return 'message-heading-h6'
  }
}

function planStepCopyMarker(status: UiPlanStep['status']): string {
  switch (status) {
    case 'completed':
      return '[x]'
    case 'inProgress':
      return '[~]'
    default:
      return '[ ]'
  }
}

function buildPlanCopyText(message: UiMessage): string {
  const planData = readPlanData(message)
  if (!planData) return ''

  const sections: string[] = []
  if (planData.explanation?.trim()) {
    sections.push(planData.explanation.trim())
  }

  if (planData.steps.length > 0) {
    sections.push(planData.steps.map((step) => `- ${planStepCopyMarker(step.status)} ${step.step}`.trim()).join('\n'))
  }

  return sections.join('\n\n').trim()
}

function buildCopyableMessageContent(message: UiMessage): string {
  const sections: string[] = []
  const rawTextContent = message.text.trim() || buildPlanCopyText(message)
  const textContent = isPlanMessage(message) && rawTextContent
    ? `Plan\n${rawTextContent}`
    : rawTextContent
  if (textContent) {
    sections.push(textContent)
  }

  const attachmentLines = (message.fileAttachments ?? [])
    .map((attachment) => attachment.path.trim())
    .filter((pathValue) => pathValue.length > 0)
  if (attachmentLines.length > 0) {
    sections.push(`Files:\n${attachmentLines.join('\n')}`)
  }

  const imageLines = (message.images ?? [])
    .map((imageUrl) => imageUrl.trim())
    .filter((imageUrl) => imageUrl.length > 0)
  if (imageLines.length > 0) {
    sections.push(`Images:\n${imageLines.join('\n')}`)
  }

  return sections.join('\n\n').trim()
}

const copyableResponseContentByAnchorId = computed<Record<string, string>>(() => {
  const groupedResponses = new Map<string, { anchorMessageId: string; parts: string[] }>()

  for (const message of props.messages) {
    if (!isCopyableAssistantMessage(message)) continue

    const content = buildCopyableMessageContent(message)
    if (!content) continue

    const responseKey = typeof message.turnIndex === 'number'
      ? `turn:${message.turnIndex}`
      : `message:${message.id}`
    const existing = groupedResponses.get(responseKey)
    if (existing) {
      existing.anchorMessageId = message.id
      existing.parts.push(content)
      continue
    }

    groupedResponses.set(responseKey, {
      anchorMessageId: message.id,
      parts: [content],
    })
  }

  const next: Record<string, string> = {}
  for (const response of groupedResponses.values()) {
    const content = response.parts.join('\n\n').trim()
    if (!content) continue
    next[response.anchorMessageId] = content
  }

  for (const [anchorMessageId, summary] of Object.entries(anchoredFileChangeSummaryByAnchorId.value)) {
    if (summary.source !== 'metadata') continue
    const fileChangeCopy = buildFileChangeCopyText(summary)
    if (!fileChangeCopy) continue
    const existing = next[anchorMessageId]?.trim()
    next[anchorMessageId] = existing ? `${existing}\n\n${fileChangeCopy}` : fileChangeCopy
  }
  return next
})

const forkableTurnIndexByAnchorId = computed<Record<string, number>>(() => {
  const groupedTurns = new Map<string, { anchorMessageId: string; turnIndex: number }>()

  for (const message of props.messages) {
    if (!isCopyableAssistantMessage(message) || typeof message.turnIndex !== 'number') continue

    const responseKey = `turn:${message.turnIndex}`
    const existing = groupedTurns.get(responseKey)
    if (existing) {
      existing.anchorMessageId = message.id
      existing.turnIndex = message.turnIndex
      continue
    }

    groupedTurns.set(responseKey, {
      anchorMessageId: message.id,
      turnIndex: message.turnIndex,
    })
  }

  const next: Record<string, number> = {}
  for (const groupedTurn of groupedTurns.values()) {
    next[groupedTurn.anchorMessageId] = groupedTurn.turnIndex
  }
  return next
})

function showCopyResponseButton(message: UiMessage): boolean {
  return typeof copyableResponseContentByAnchorId.value[message.id] === 'string'
}

function showForkResponseButton(message: UiMessage): boolean {
  return typeof forkableTurnIndexByAnchorId.value[message.id] === 'number'
}

function mergeFileChangeDiff(first: string, second: string): string {
  if (!first) return second
  if (!second || first === second) return first
  return `${first}\n${second}`.trim()
}

function mergeFileChangeEntry(first: UiFileChange, second: UiFileChange): UiFileChange {
  const operation = first.operation === 'add' || second.operation === 'add'
    ? 'add'
    : first.operation === 'delete' || second.operation === 'delete'
      ? 'delete'
      : 'update'
  return {
    path: second.path || first.path,
    operation,
    movedToPath: second.movedToPath ?? first.movedToPath ?? null,
    diff: mergeFileChangeDiff(first.diff, second.diff),
    addedLineCount: first.addedLineCount + second.addedLineCount,
    removedLineCount: first.removedLineCount + second.removedLineCount,
  }
}

function compareFileChanges(first: UiFileChange, second: UiFileChange): number {
  const firstRank = first.operation === 'add' ? 0 : first.operation === 'update' ? 1 : 2
  const secondRank = second.operation === 'add' ? 0 : second.operation === 'update' ? 1 : 2
  if (firstRank !== secondRank) return firstRank - secondRank
  const firstPath = `${first.path}\u0000${first.movedToPath ?? ''}`
  const secondPath = `${second.path}\u0000${second.movedToPath ?? ''}`
  return firstPath.localeCompare(secondPath)
}

function aggregateFileChanges(changes: UiFileChange[]): UiFileChange[] {
  const byPath = new Map<string, UiFileChange>()
  for (const change of changes) {
    const key = `${change.path}\u0000${change.movedToPath ?? ''}`
    const previous = byPath.get(key)
    byPath.set(key, previous ? mergeFileChangeEntry(previous, change) : { ...change })
  }
  return Array.from(byPath.values()).sort(compareFileChanges)
}

const anchoredFileChangeSummaryByAnchorId = computed<Record<string, TurnFileChangeSummary>>(() => {
  const assistantAnchorIdByTurnKey = new Map<string, string>()
  const assistantSummaryByAnchorId = new Map<string, TurnFileChangeSummary>()
  const fileChangeMessagesByTurnKey = new Map<string, UiMessage[]>()

  for (const message of props.messages) {
    if (isCopyableAssistantMessage(message) && typeof message.turnIndex === 'number') {
      assistantAnchorIdByTurnKey.set(`turn:${message.turnIndex}`, message.id)
      if (Array.isArray(message.fileChanges) && message.fileChanges.length > 0) {
        assistantSummaryByAnchorId.set(message.id, {
          changes: aggregateFileChanges(message.fileChanges),
          sourceMessageIds: [],
          source: 'assistant',
        })
      }
    }

    if (!isFileChangeMessage(message)) continue
    const turnKey = typeof message.turnIndex === 'number' ? `turn:${message.turnIndex}` : `message:${message.id}`
    const current = fileChangeMessagesByTurnKey.get(turnKey)
    if (current) current.push(message)
    else fileChangeMessagesByTurnKey.set(turnKey, [message])
  }

  const summaries: Record<string, TurnFileChangeSummary> = {}
  for (const [turnKey, messages] of fileChangeMessagesByTurnKey.entries()) {
    const anchorId = assistantAnchorIdByTurnKey.get(turnKey)
    if (!anchorId) continue
    summaries[anchorId] = {
      changes: aggregateFileChanges(messages.flatMap((message) => message.fileChanges ?? [])),
      sourceMessageIds: messages.map((message) => message.id),
      source: 'metadata',
    }
  }

  for (const [anchorId, summary] of assistantSummaryByAnchorId.entries()) {
    if (!summaries[anchorId]) {
      summaries[anchorId] = summary
    }
  }

  return summaries
})

const standaloneFileChangeSummaryByMessageId = computed<Record<string, TurnFileChangeSummary>>(() => {
  const assistantAnchorIdByTurnKey = new Map<string, string>()
  const fileChangeMessagesByTurnKey = new Map<string, UiMessage[]>()

  for (const message of props.messages) {
    if (isCopyableAssistantMessage(message) && typeof message.turnIndex === 'number') {
      assistantAnchorIdByTurnKey.set(`turn:${message.turnIndex}`, message.id)
    }

    if (!isFileChangeMessage(message)) continue
    const turnKey = typeof message.turnIndex === 'number' ? `turn:${message.turnIndex}` : `message:${message.id}`
    const current = fileChangeMessagesByTurnKey.get(turnKey)
    if (current) current.push(message)
    else fileChangeMessagesByTurnKey.set(turnKey, [message])
  }

  const summaries: Record<string, TurnFileChangeSummary> = {}
  for (const [turnKey, messages] of fileChangeMessagesByTurnKey.entries()) {
    if (assistantAnchorIdByTurnKey.has(turnKey)) continue
    const visibleMessage = messages[messages.length - 1]
    if (!visibleMessage) continue
    summaries[visibleMessage.id] = {
      changes: aggregateFileChanges(messages.flatMap((message) => message.fileChanges ?? [])),
      sourceMessageIds: messages.map((message) => message.id),
      source: 'metadata',
    }
  }

  return summaries
})

const hiddenFileChangeMessageIds = computed(() => {
  const next = new Set<string>()
  for (const summary of Object.values(anchoredFileChangeSummaryByAnchorId.value)) {
    for (const messageId of summary.sourceMessageIds) {
      next.add(messageId)
    }
  }
  for (const [messageId, summary] of Object.entries(standaloneFileChangeSummaryByMessageId.value)) {
    for (const sourceMessageId of summary.sourceMessageIds) {
      if (sourceMessageId !== messageId) {
        next.add(sourceMessageId)
      }
    }
  }
  return next
})

function readAnchoredFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
  return anchoredFileChangeSummaryByAnchorId.value[message.id] ?? null
}

function readStandaloneFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
  return standaloneFileChangeSummaryByMessageId.value[message.id] ?? null
}

function fileChangeOperationLabel(change: UiFileChange): string {
  if (change.operation === 'update' && change.movedToPath) {
    return change.addedLineCount > 0 || change.removedLineCount > 0 ? 'Moved + edited' : 'Moved'
  }
  if (change.operation === 'add') return 'Added'
  if (change.operation === 'delete') return 'Deleted'
  return 'Edited'
}

function fileChangeOperationTone(change: UiFileChange): 'add' | 'delete' | 'update' | 'move' {
  if (change.operation === 'update' && change.movedToPath) return 'move'
  return change.operation
}

function formatFileChangeDelta(change: UiFileChange): string {
  const parts: string[] = []
  if (change.addedLineCount > 0) parts.push(`+${change.addedLineCount}`)
  if (change.removedLineCount > 0) parts.push(`-${change.removedLineCount}`)
  return parts.join(' ')
}

type FileChangeDeltaTone = 'add' | 'remove' | 'neutral'

type FileChangeDeltaPart = {
  tone: FileChangeDeltaTone
  label: string
}

function buildFileChangeDeltaParts(addedCount: number, removedCount: number, fallbackLabel = ''): FileChangeDeltaPart[] {
  const parts: FileChangeDeltaPart[] = []
  if (addedCount > 0) parts.push({ tone: 'add', label: `+${addedCount}` })
  if (removedCount > 0) parts.push({ tone: 'remove', label: `-${removedCount}` })
  if (parts.length > 0) return parts
  return fallbackLabel ? [{ tone: 'neutral', label: fallbackLabel }] : []
}

function fileChangeDeltaParts(change: UiFileChange): FileChangeDeltaPart[] {
  return buildFileChangeDeltaParts(change.addedLineCount, change.removedLineCount)
}

function formatFileChangeCountLabel(count: number): string {
  return count === 1 ? '1 file changed' : `${count} files changed`
}

function summarizeFileChangeKinds(summary: TurnFileChangeSummary | null): string {
  if (!summary || summary.changes.length === 0) return ''
  let added = 0
  let deleted = 0
  let edited = 0
  let moved = 0

  for (const change of summary.changes) {
    if (change.operation === 'add') {
      added += 1
      continue
    }
    if (change.operation === 'delete') {
      deleted += 1
      continue
    }
    if (change.movedToPath) {
      moved += 1
      continue
    }
    edited += 1
  }

  const parts: string[] = []
  if (edited > 0) parts.push(`${edited} edited`)
  if (added > 0) parts.push(`${added} added`)
  if (deleted > 0) parts.push(`${deleted} deleted`)
  if (moved > 0) parts.push(`${moved} moved`)
  return parts.join(', ')
}

function fileChangeSummaryLabel(summary: TurnFileChangeSummary | null): string {
  if (!summary || summary.changes.length === 0) return 'Modified files'
  const countLabel = formatFileChangeCountLabel(summary.changes.length)
  const kindSummary = summarizeFileChangeKinds(summary)
  return kindSummary ? `${countLabel} · ${kindSummary}` : countLabel
}

function fileChangeSummaryStatusParts(summary: TurnFileChangeSummary | null): FileChangeDeltaPart[] {
  if (!summary || summary.changes.length === 0) return []
  const totalAdded = summary.changes.reduce((sum, change) => sum + change.addedLineCount, 0)
  const totalRemoved = summary.changes.reduce((sum, change) => sum + change.removedLineCount, 0)
  const fallbackLabel = summary.changes.some((change) => change.movedToPath) ? 'Moved' : 'Ready'
  return buildFileChangeDeltaParts(totalAdded, totalRemoved, fallbackLabel)
}

function displayFileChangePath(pathValue: string): string {
  const resolved = resolveRelativePath(pathValue, props.cwd)
  const normalizedCwd = normalizePathDots(normalizePathSeparators(props.cwd.trim()))
  const normalizedResolved = normalizePathDots(normalizePathSeparators(resolved))
  if (normalizedCwd && normalizedResolved.startsWith(`${normalizedCwd}/`)) {
    return normalizedResolved.slice(normalizedCwd.length + 1)
  }
  return pathValue
}

function buildFileChangeCopyText(summary: TurnFileChangeSummary | null): string {
  if (!summary || summary.changes.length === 0) return ''
  const lines = summary.changes.map((change) => {
    const pathLabel = displayFileChangePath(change.path)
    const movedLabel = change.movedToPath ? ` -> ${displayFileChangePath(change.movedToPath)}` : ''
    const delta = formatFileChangeDelta(change)
    return `- ${fileChangeOperationLabel(change)}: ${pathLabel}${movedLabel}${delta ? ` (${delta})` : ''}`
  })
  return `Modified files:\n${lines.join('\n')}`.trim()
}

const diffViewerChanges = computed<UiFileChange[]>(() => activeDiffViewerSummary.value?.changes ?? [])

const activeDiffViewerChange = computed<UiFileChange | null>(() => {
  const changes = diffViewerChanges.value
  if (changes.length === 0) return null
  return changes.find((change) => fileChangeKey(change) === activeDiffViewerChangeKey.value) ?? changes[0]
})

function inferDiffViewerLanguage(change: UiFileChange): string {
  const targetPath = change.movedToPath || change.path
  const extension = targetPath.split('.').pop()?.toLowerCase() ?? ''
  return CODE_LANGUAGE_ALIASES[extension] ?? extension ?? ''
}

function hasStructuredUnifiedDiff(change: UiFileChange): boolean {
  return change.operation === 'update' && /^diff --git |^@@ |^--- |^\+\+\+ |^[ +-]|^\*\*\* (Move to:|End of File)/mu.test(change.diff)
}

function buildSyntheticDiffLines(change: UiFileChange): DiffViewerLine[] {
  const normalized = change.diff.replace(/\r\n/g, '\n')
  const lines = normalized.length > 0 ? normalized.split('\n') : []
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.map((line, index) => ({
    key: `${fileChangeKey(change)}:synthetic:${index}`,
    kind: change.operation === 'delete' ? 'remove' : 'add',
    oldLine: change.operation === 'delete' ? index + 1 : null,
    newLine: change.operation === 'delete' ? null : index + 1,
    text: line,
  }))
}

function buildUnifiedDiffLines(change: UiFileChange): DiffViewerLine[] {
  const normalized = change.diff.replace(/\r\n/g, '\n')
  const lines = normalized.length > 0 ? normalized.split('\n') : []
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  const output: DiffViewerLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const [index, line] of lines.entries()) {
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/u)
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1])
      newLine = Number(hunkMatch[2])
      output.push({
        key: `${fileChangeKey(change)}:hunk:${index}`,
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        text: line,
      })
      continue
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      output.push({
        key: `${fileChangeKey(change)}:add:${index}`,
        kind: 'add',
        oldLine: null,
        newLine,
        text: line.slice(1),
      })
      newLine += 1
      continue
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      output.push({
        key: `${fileChangeKey(change)}:remove:${index}`,
        kind: 'remove',
        oldLine,
        newLine: null,
        text: line.slice(1),
      })
      oldLine += 1
      continue
    }

    if (line.startsWith(' ')) {
      output.push({
        key: `${fileChangeKey(change)}:context:${index}`,
        kind: 'context',
        oldLine,
        newLine,
        text: line.slice(1),
      })
      oldLine += 1
      newLine += 1
      continue
    }

    output.push({
      key: `${fileChangeKey(change)}:meta:${index}`,
      kind: 'meta',
      oldLine: null,
      newLine: null,
      text: line,
    })
  }

  return output
}

function buildDiffViewerLines(change: UiFileChange | null): DiffViewerLine[] {
  if (!change || !change.diff.trim()) return []
  if (hasStructuredUnifiedDiff(change)) {
    return buildUnifiedDiffLines(change)
  }
  return buildSyntheticDiffLines(change)
}

const activeDiffViewerLines = computed<DiffViewerLine[]>(() => buildDiffViewerLines(activeDiffViewerChange.value))

function hasDiffViewerContent(change: UiFileChange | null): boolean {
  return Boolean(change?.diff.trim())
}

function diffViewerMarker(line: DiffViewerLine): string {
  if (line.kind === 'add') return '+'
  if (line.kind === 'remove') return '-'
  if (line.kind === 'hunk') return '@@'
  return ''
}

function copyTextWithSelectionFallback(text: string): boolean {
  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

async function copyResponse(anchorMessageId: string): Promise<void> {
  const content = copyableResponseContentByAnchorId.value[anchorMessageId] ?? ''
  if (!content) return

  let copied = false
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content)
      copied = true
    } catch {
      copied = false
    }
  }

  if (!copied) {
    copied = copyTextWithSelectionFallback(content)
  }

  if (!copied) return

  copiedResponseAnchorId.value = anchorMessageId
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
  }
  copiedMessageResetTimer = setTimeout(() => {
    if (copiedResponseAnchorId.value === anchorMessageId) {
      copiedResponseAnchorId.value = ''
    }
    copiedMessageResetTimer = null
  }, 1800)
}

function forkResponse(anchorMessageId: string): void {
  const turnIndex = forkableTurnIndexByAnchorId.value[anchorMessageId]
  if (typeof turnIndex !== 'number') return
  if (!props.activeThreadId) return
  emit('forkThread', {
    threadId: props.activeThreadId,
    turnIndex,
  })
}

const editableTurnIdByMessageId = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {}
  for (const message of props.messages) {
    if (message.role !== 'user' || typeof message.turnIndex !== 'number') continue
    const turnId = typeof message.turnId === 'string' && message.turnId.length > 0 ? message.turnId : ''
    if (!turnId || message.text.trim().length === 0) continue
    next[message.id] = turnId
  }
  return next
})

function showEditMessageButton(message: UiMessage): boolean {
  return typeof editableTurnIdByMessageId.value[message.id] === 'string'
}

function editMessage(messageId: string): void {
  const turnId = editableTurnIdByMessageId.value[messageId]
  if (!turnId) return
  emit('rollback', { turnId })
}

function splitPlainTextByLinks(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const pattern = /codex:\/\/threads\/[A-Za-z0-9-]+|https?:\/\/[^\s<>"'`，。；：！？、()[\]{}「」『』《》]+|file:\/\/[^\n<>"'`，。；：！？、[\]{}「」『』《》]+|["'](?:[A-Za-z]:[\\/]|~\/|\.{1,2}\/|\/)[^\n"']+["']|`(?:[A-Za-z]:[\\/]|~\/|\.{1,2}\/|\/)[^`\n]+`/gu
  let cursor = 0

  for (const match of text.matchAll(pattern)) {
    if (typeof match.index !== 'number') continue
    const start = match.index
    const end = start + match[0].length
    const asteriskWrapper = readAsteriskLinkWrapper(text, start, end, cursor, match[0])
    const segmentStart = asteriskWrapper?.segmentStart ?? start
    const segmentEnd = asteriskWrapper?.segmentEnd ?? end

    if (segmentStart > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, segmentStart) })
    }

    let token = asteriskWrapper?.tokenEndTrim
      ? match[0].slice(0, -asteriskWrapper.tokenEndTrim)
      : match[0]
    let trailingPunctuation = ''
    while (/[.,;:!?，。；：！？、]$/u.test(token)) {
      trailingPunctuation = token.slice(-1) + trailingPunctuation
      token = token.slice(0, -1)
    }
    const wrapped = trimLinkWrappers(token)
    token = wrapped.core
    const leading = wrapped.leading
    const trailing = wrapped.trailing + trailingPunctuation

    if (leading) {
      segments.push({ kind: 'text', value: leading })
    }

    const localThreadUrl = toLocalThreadUrl(token)

    if (localThreadUrl) {
      segments.push({ kind: 'url', value: localThreadUrl, href: localThreadUrl })
      if (trailing) {
        segments.push({ kind: 'text', value: trailing })
      }
    } else if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      segments.push({ kind: 'bold', value: token.slice(2, -2) })
      if (trailing) {
        segments.push({ kind: 'text', value: trailing })
      }
    } else if (/^https?:\/\//u.test(token)) {
      segments.push({ kind: 'url', value: token, href: token })
      if (trailing) {
        segments.push({ kind: 'text', value: trailing })
      }
    } else {
      const ref = parseFileReference(token)
      if (ref) {
        segments.push({
          kind: 'file',
          value: token,
          path: ref.path,
          displayPath: token,
          downloadName: getBasename(ref.path),
        })
        if (trailing) {
          segments.push({ kind: 'text', value: trailing })
        }
      } else {
        segments.push({ kind: 'text', value: match[0] })
      }
    }

    cursor = segmentEnd
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) })
  }

  return applyInlineMarkdownMarkers(segments)
}

function applyDelimitedMarkersAcrossTextSegments(
  segments: InlineSegment[],
  options: {
    marker: string
    kind: Extract<InlineSegment['kind'], 'bold' | 'italic' | 'strikethrough'>
    isValidContent?: (value: string) => boolean
  },
): InlineSegment[] {
  const output: InlineSegment[] = []
  let isOpen = false
  let buffer = ''

  const pushText = (value: string): void => {
    if (!value) return
    output.push({ kind: 'text', value })
  }

  for (const segment of segments) {
    if (segment.kind !== 'text') {
      if (isOpen) {
        pushText(`${options.marker}${buffer}`)
        isOpen = false
        buffer = ''
      }
      output.push(segment)
      continue
    }

    let remaining = segment.value
    while (remaining.length > 0) {
      const markerIndex = remaining.indexOf(options.marker)
      if (markerIndex < 0) {
        if (isOpen) buffer += remaining
        else pushText(remaining)
        break
      }

      const before = remaining.slice(0, markerIndex)
      if (isOpen) buffer += before
      else pushText(before)

      remaining = remaining.slice(markerIndex + options.marker.length)
      if (isOpen) {
        const content = buffer
        if (
          content.length > 0 &&
          (options.isValidContent ? options.isValidContent(content) : true)
        ) {
          output.push({ kind: options.kind, value: content })
        } else {
          pushText(`${options.marker}${content}${options.marker}`)
        }
        buffer = ''
        isOpen = false
      } else {
        isOpen = true
      }
    }
  }

  if (isOpen) {
    pushText(`${options.marker}${buffer}`)
  }

  return output
}

function applyInlineMarkdownMarkers(segments: InlineSegment[]): InlineSegment[] {
  const nonWhitespaceWrapped = (value: string): boolean => (
    value.trim().length > 0 &&
    !/^\s/u.test(value) &&
    !/\s$/u.test(value)
  )

  let next = applyDelimitedMarkersAcrossTextSegments(segments, {
    marker: '**',
    kind: 'bold',
    isValidContent: nonWhitespaceWrapped,
  })

  next = applyDelimitedMarkersAcrossTextSegments(next, {
    marker: '~~',
    kind: 'strikethrough',
    isValidContent: nonWhitespaceWrapped,
  })

  next = applyDelimitedMarkersAcrossTextSegments(next, {
    marker: '*',
    kind: 'italic',
    isValidContent: nonWhitespaceWrapped,
  })

  return next
}

function splitTextByFileUrls(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let cursor = 0
  let scanFrom = 0

  const findNextMarkdownLink = (
    source: string,
    fromIndex: number,
  ): { start: number; end: number; token: string } | null => {
    let linkStart = source.indexOf('[', fromIndex)
    while (linkStart >= 0) {
      const labelEnd = source.indexOf(']', linkStart + 1)
      if (labelEnd < 0) return null
      if (source[labelEnd + 1] !== '(') {
        linkStart = source.indexOf('[', linkStart + 1)
        continue
      }

      let depth = 1
      let index = labelEnd + 2
      let hasNewLine = false
      while (index < source.length) {
        const char = source[index]
        if (char === '\n') {
          hasNewLine = true
          break
        }
        if (char === '(') depth += 1
        if (char === ')') {
          depth -= 1
          if (depth === 0) {
            const token = source.slice(linkStart, index + 1)
            if (parseMarkdownLinkToken(token)) {
              return { start: linkStart, end: index + 1, token }
            }
            break
          }
        }
        index += 1
      }

      if (hasNewLine) {
        linkStart = source.indexOf('[', linkStart + 1)
        continue
      }
      linkStart = source.indexOf('[', linkStart + 1)
    }
    return null
  }

  while (scanFrom < text.length) {
    const match = findNextMarkdownLink(text, scanFrom)
    if (!match) break
    const { start, end, token } = match
    const asteriskWrapper = readAsteriskLinkWrapper(text, start, end, cursor, token)
    const segmentStart = asteriskWrapper?.segmentStart ?? start
    const segmentEnd = asteriskWrapper?.segmentEnd ?? end

    if (segmentStart > cursor) {
      segments.push(...splitPlainTextByLinks(text.slice(cursor, segmentStart)))
    }

    const markdownToken = parseMarkdownLinkToken(token)
    if (!markdownToken) {
      segments.push(...splitPlainTextByLinks(text.slice(segmentStart, segmentEnd)))
      cursor = segmentEnd
      scanFrom = segmentEnd
      continue
    }
    const label = markdownToken.label
    const target = markdownToken.target
    const localThreadUrl = toLocalThreadUrl(target)

    if (localThreadUrl) {
      segments.push({ kind: 'url', value: label || localThreadUrl, href: localThreadUrl })
    } else if (/^https?:\/\//u.test(target)) {
      segments.push({ kind: 'url', value: label || target, href: target })
    } else {
      const ref = parseFileReference(target)
      if (ref) {
        segments.push({
          kind: 'file',
          value: target,
          path: ref.path,
          displayPath: label || target,
          downloadName: getBasename(ref.path),
        })
      } else {
        segments.push({ kind: 'text', value: token })
      }
    }

    cursor = segmentEnd
    scanFrom = segmentEnd
  }

  if (cursor < text.length) {
    segments.push(...splitPlainTextByLinks(text.slice(cursor)))
  }

  return segments
}

function parseInlineSegmentsUncached(text: string): InlineSegment[] {
  const linkFirstSegments = splitTextByFileUrls(text)
  if (!text.includes('`')) return linkFirstSegments
  if (!linkFirstSegments.some((segment) => segment.kind === 'text' && segment.value.includes('`'))) {
    return linkFirstSegments
  }

  const parseCodeAwareTextSegments = (value: string): InlineSegment[] => {
    if (!value.includes('`')) return splitPlainTextByLinks(value)

    const segments: InlineSegment[] = []
    let cursor = 0
    let textStart = 0

    while (cursor < value.length) {
      if (value[cursor] !== '`') {
        cursor += 1
        continue
      }

      let openLength = 1
      while (cursor + openLength < value.length && value[cursor + openLength] === '`') {
        openLength += 1
      }
      const delimiter = '`'.repeat(openLength)

      let searchFrom = cursor + openLength
      let closingStart = -1
      while (searchFrom < value.length) {
        const candidate = value.indexOf(delimiter, searchFrom)
        if (candidate < 0) break

        const hasBacktickBefore = candidate > 0 && value[candidate - 1] === '`'
        const hasBacktickAfter =
          candidate + openLength < value.length && value[candidate + openLength] === '`'
        const hasNewLineInside = value.slice(cursor + openLength, candidate).includes('\n')

        if (!hasBacktickBefore && !hasBacktickAfter && !hasNewLineInside) {
          closingStart = candidate
          break
        }
        searchFrom = candidate + 1
      }

      if (closingStart < 0) {
        cursor += openLength
        continue
      }

      if (cursor > textStart) {
        segments.push(...splitPlainTextByLinks(value.slice(textStart, cursor)))
      }

      const token = value.slice(cursor + openLength, closingStart)
      if (token.length > 0) {
        const markdownLink = parseMarkdownLinkToken(token)
        if (markdownLink) {
          const localThreadUrl = toLocalThreadUrl(markdownLink.target)
          if (localThreadUrl) {
            segments.push({
              kind: 'url',
              value: markdownLink.label || localThreadUrl,
              href: localThreadUrl,
            })
          } else if (/^https?:\/\//u.test(markdownLink.target)) {
            segments.push({
              kind: 'url',
              value: markdownLink.label || markdownLink.target,
              href: markdownLink.target,
            })
          } else {
            const markdownFileReference = parseFileReference(markdownLink.target)
            if (markdownFileReference) {
              segments.push({
                kind: 'file',
                value: markdownLink.target,
                path: markdownFileReference.path,
                displayPath: markdownLink.label || markdownLink.target,
                downloadName: getBasename(markdownFileReference.path),
              })
            } else {
              segments.push({ kind: 'code', value: token })
            }
          }
        } else {
          const localThreadUrl = toLocalThreadUrl(token)
          if (localThreadUrl) {
            segments.push({
              kind: 'url',
              value: localThreadUrl,
              href: localThreadUrl,
            })
          } else if (/^https?:\/\/[^\s]+$/u.test(token)) {
            segments.push({
              kind: 'url',
              value: token,
              href: token,
            })
          } else {
            const fileReference = parseFileReference(token)
            if (fileReference) {
              const displayPath = fileReference.line
                ? `${fileReference.path}:${String(fileReference.line)}`
                : fileReference.path
              segments.push({
                kind: 'file',
                value: token,
                path: fileReference.path,
                displayPath,
                downloadName: getBasename(fileReference.path),
              })
            } else {
              segments.push({ kind: 'code', value: token })
            }
          }
        }
      } else {
        segments.push({ kind: 'text', value: `${delimiter}${delimiter}` })
      }

      cursor = closingStart + openLength
      textStart = cursor
    }

    if (textStart < value.length) {
      segments.push(...splitPlainTextByLinks(value.slice(textStart)))
    }

    return segments
  }

  return linkFirstSegments.flatMap((segment) => (
    segment.kind === 'text'
      ? parseCodeAwareTextSegments(segment.value)
      : [segment]
  ))
}

function getInlineSegments(text: string): InlineSegment[] {
  const cached = inlineSegmentCache.get(text)
  if (cached) {
    inlineSegmentCache.delete(text)
    inlineSegmentCache.set(text, cached)
    return cached
  }
  return setBoundedCacheEntry(inlineSegmentCache, text, parseInlineSegmentsUncached(text), INLINE_SEGMENT_CACHE_LIMIT)
}

function toRenderableImageUrl(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''
  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/codex-local-image?')
  ) {
    return normalized
  }

  if (normalized.startsWith('file://')) {
    return `/codex-local-image?path=${encodeURIComponent(normalized)}`
  }

  const looksLikeUnixAbsolute = normalized.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(normalized)
  if (looksLikeUnixAbsolute || looksLikeWindowsAbsolute) {
    return `/codex-local-image?path=${encodeURIComponent(normalized)}`
  }

  return normalized
}

function toBrowseUrl(pathValue: string): string {
  const normalized = pathValue.trim()
  if (!normalized) return '#'
  const looksLikeAbsolutePath = (candidate: string): boolean => (
    candidate.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(candidate)
  )

  const parsed = parseFileReference(normalized)
  const candidatePath = parsed?.path ?? normalized
  const resolved = resolveRelativePath(candidatePath, props.cwd)

  if (looksLikeAbsolutePath(resolved)) {
    const normalizedResolved = resolved.startsWith('/') ? resolved : `/${resolved}`
    return `/codex-local-browse${encodeURI(normalizedResolved)}`
  }

  return '#'
}

const fileLinkContextMenuStyle = computed(() => ({
  left: `${String(fileLinkContextMenuX.value)}px`,
  top: `${String(fileLinkContextMenuY.value)}px`,
}))

function toEditUrlFromBrowseHref(href: string): string {
  const normalizedHref = href.trim()
  if (!normalizedHref) return ''
  try {
    const resolved = new URL(normalizedHref, window.location.href)
    if (!resolved.pathname.startsWith('/codex-local-browse')) return ''
    const editPath = `/codex-local-edit${resolved.pathname.slice('/codex-local-browse'.length)}`
    return `${editPath}${resolved.search}${resolved.hash}`
  } catch {
    return ''
  }
}

function onConversationContextMenu(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const anchor = target.closest('a.message-file-link')
  if (!(anchor instanceof HTMLAnchorElement)) return

  const href = (anchor.getAttribute('href') ?? '').trim()
  if (!href || href === '#') return

  event.preventDefault()
  event.stopPropagation()

  fileLinkContextBrowseUrl.value = href
  fileLinkContextEditUrl.value = toEditUrlFromBrowseHref(href)
  fileLinkContextMenuX.value = event.clientX
  fileLinkContextMenuY.value = event.clientY
  isFileLinkContextMenuVisible.value = true
}

function closeFileLinkContextMenu(): void {
  if (!isFileLinkContextMenuVisible.value) return
  isFileLinkContextMenuVisible.value = false
}

function openFileLinkContextBrowse(): void {
  const href = fileLinkContextBrowseUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

function openFileLinkContextEdit(): void {
  const href = fileLinkContextEditUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

async function copyFileLinkContextLink(): Promise<void> {
  const href = fileLinkContextBrowseUrl.value
  closeFileLinkContextMenu()
  if (!href || href === '#') return

  try {
    await navigator.clipboard.writeText(href)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = href
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

function onWindowPointerDownForFileLinkContextMenu(event: PointerEvent): void {
  if (!isFileLinkContextMenuVisible.value) return
  const menu = fileLinkContextMenuRef.value
  if (!menu) {
    closeFileLinkContextMenu()
    return
  }
  const target = event.target
  if (target instanceof Node && menu.contains(target)) return
  closeFileLinkContextMenu()
}

function onWindowBlurForFileLinkContextMenu(): void {
  closeFileLinkContextMenu()
}

function onWindowKeydownForFileLinkContextMenu(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  closeFileLinkContextMenu()
}

function normalizeMarkdownText(text: string): string {
  return text.replace(/\r\n/gu, '\n')
}

function leadingIndentWidth(line: string): number {
  const leadingWhitespace = line.match(/^\s*/u)?.[0] ?? ''
  return leadingWhitespace.replace(/\t/gu, '    ').length
}

function stripIndentedContent(line: string, baseIndent: number): string {
  if (baseIndent <= 0) return line.trimStart()

  let index = 0
  let width = 0
  while (index < line.length && width < baseIndent) {
    const character = line[index]
    width += character === '\t' ? 4 : 1
    index += 1
  }

  return line.slice(index)
}

function isBlankMarkdownLine(line: string): boolean {
  return line.trim().length === 0
}

function readHeading(line: string): { level: number; value: string } | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/u)
  if (!match) return null
  return {
    level: match[1].length,
    value: match[2].trim(),
  }
}

function readBlockquoteLine(line: string): string | null {
  const match = line.match(/^\s{0,3}>\s?(.*)$/u)
  if (!match) return null
  return match[1] ?? ''
}

function readUnorderedListItem(line: string): string | null {
  const match = line.match(/^\s*[-*+]\s+(.+)$/u)
  return match?.[1]?.trim() ?? null
}

function readUnorderedListItemMatch(line: string): { indent: number; text: string } | null {
  const match = line.match(/^(\s*)[-*+]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    text: match[2]?.trim() ?? '',
  }
}

function readTaskListItem(line: string): TaskListItem | null {
  const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/u)
  if (!match) return null
  return {
    checked: (match[1] ?? ' ').toLowerCase() === 'x',
    text: match[2]?.trim() ?? '',
  }
}

function readTaskListItemMatch(line: string): { indent: number; item: TaskListItem } | null {
  const match = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    item: {
      checked: (match[2] ?? ' ').toLowerCase() === 'x',
      text: match[3]?.trim() ?? '',
    },
  }
}

function readOrderedListItemData(line: string): { indent: number; text: string; start: number } | null {
  const match = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    start: Number.parseInt(match[2] ?? '1', 10) || 1,
    text: match[3]?.trim() ?? '',
  }
}

function readOrderedListItem(line: string): string | null {
  return readOrderedListItemData(line)?.text ?? null
}

function readOrderedListItemMatch(line: string): { indent: number; text: string; start: number } | null {
  return readOrderedListItemData(line)
}

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return null

  let content = trimmed
  if (content.startsWith('|')) content = content.slice(1)
  if (content.endsWith('|')) content = content.slice(0, -1)

  const cells: string[] = []
  let current = ''
  let codeFenceLength = 0

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (character === '\\' && content[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }

    if (character === '`') {
      let runLength = 1
      while (content[index + runLength] === '`') runLength += 1
      current += content.slice(index, index + runLength)
      if (codeFenceLength === 0) codeFenceLength = runLength
      else if (codeFenceLength === runLength) codeFenceLength = 0
      index += runLength - 1
      continue
    }

    if (character === '|' && codeFenceLength === 0) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells.some((cell) => cell.length > 0) ? cells : null
}

function readTableAlignmentRow(line: string): TableAlignment[] | null {
  const cells = splitMarkdownTableRow(line)
  if (!cells || cells.length === 0) return null

  const alignments = cells.map((cell) => {
    const trimmed = cell.replace(/\s+/gu, '')
    if (!/^:?-{3,}:?$/u.test(trimmed)) return null
    const startsWithColon = trimmed.startsWith(':')
    const endsWithColon = trimmed.endsWith(':')
    if (startsWithColon && endsWithColon) return 'center'
    if (endsWithColon) return 'right'
    if (startsWithColon) return 'left'
    return null
  })

  return alignments.every((alignment, index) => alignment !== null || /^-+$/u.test(cells[index].replace(/\s+/gu, '')))
    ? alignments
    : null
}

function normalizeTableCells(cells: string[], width: number): string[] {
  if (cells.length === width) return cells
  if (cells.length > width) return cells.slice(0, width)
  return [...cells, ...Array.from({ length: width - cells.length }, () => '')]
}

function readTableBlock(lines: string[], startIndex: number): Extract<MessageBlock, { kind: 'table' }> | null {
  if (startIndex + 1 >= lines.length) return null

  const headerLine = lines[startIndex]
  const separatorLine = lines[startIndex + 1]
  const headers = splitMarkdownTableRow(headerLine)
  const alignments = readTableAlignmentRow(separatorLine)
  if (!headers || !alignments) return null
  if (headers.length !== alignments.length) return null

  const trimmedHeader = headerLine.trim()
  if (!trimmedHeader.startsWith('|') && (trimmedHeader.match(/\|/gu)?.length ?? 0) < 2) return null

  const width = headers.length
  const rows: string[][] = []
  let index = startIndex + 2
  while (index < lines.length) {
    if (isBlankMarkdownLine(lines[index])) break
    const row = splitMarkdownTableRow(lines[index])
    if (!row) break
    rows.push(normalizeTableCells(row, width))
    index += 1
  }

  return {
    kind: 'table',
    headers: normalizeTableCells(headers, width),
    rows,
    alignments,
  }
}

function isParagraphBreakingLine(line: string): boolean {
  return (
    isBlankMarkdownLine(line) ||
    readFenceStart(line) !== null ||
    isThematicBreakLine(line) ||
    readHeading(line) !== null ||
    readBlockquoteLine(line) !== null ||
    readTaskListItem(line) !== null ||
    readUnorderedListItem(line) !== null ||
    readOrderedListItem(line) !== null
  )
}

function readListParagraph(
  lines: string[],
  startIndex: number,
  baseIndent = -1,
): { value: string; nextIndex: number } | null {
  const paragraphLines: string[] = []
  let index = startIndex

  while (index < lines.length) {
    if (isParagraphBreakingLine(lines[index])) break
    if (baseIndent >= 0 && leadingIndentWidth(lines[index]) <= baseIndent) break

    paragraphLines.push(baseIndent >= 0 ? stripIndentedContent(lines[index], baseIndent + 1) : lines[index])
    index += 1
  }

  const value = paragraphLines.join('\n').trim()
  return value ? { value, nextIndex: index } : null
}

function findNextNonBlankLineIndex(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!isBlankMarkdownLine(lines[index])) return index
  }
  return -1
}

function readNestedListBlocks(
  lines: string[],
  startIndex: number,
  parentIndent: number,
  stopAtItem: ((line: string) => { indent: number; text: string } | null) | null = null,
  allowLooseChildLists = false,
): { blocks: MessageBlock[]; nextIndex: number } | null {
  const nestedLines: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    if (isBlankMarkdownLine(line)) {
      const nextNonBlankIndex = findNextNonBlankLineIndex(lines, index + 1)
      if (nextNonBlankIndex === -1) {
        nestedLines.push('')
        index = lines.length
        break
      }
      const nextStopItem = stopAtItem?.(lines[nextNonBlankIndex])
      if (nextStopItem && nextStopItem.indent === parentIndent) break
      if (leadingIndentWidth(lines[nextNonBlankIndex]) <= parentIndent) break
      nestedLines.push('')
      index += 1
      continue
    }

    const stopItem = stopAtItem?.(line)
    if (stopItem && stopItem.indent === parentIndent) break

    const lineIndent = leadingIndentWidth(line)
    const isLooseChildList = allowLooseChildLists && (
      readTaskListItem(line) !== null ||
      readUnorderedListItem(line) !== null
    )
    if (lineIndent <= parentIndent && !isLooseChildList) break

    nestedLines.push(
      lineIndent > parentIndent
        ? stripIndentedContent(line, parentIndent + 1)
        : line.trimStart(),
    )
    index += 1
  }

  while (nestedLines.length > 0 && isBlankMarkdownLine(nestedLines[0])) nestedLines.shift()
  while (nestedLines.length > 0 && isBlankMarkdownLine(nestedLines[nestedLines.length - 1])) nestedLines.pop()

  if (nestedLines.length === 0) return null

  return {
    blocks: parseTextBlocks(nestedLines.join('\n')),
    nextIndex: index,
  }
}

function readListItems(
  lines: string[],
  startIndex: number,
  readItem: (line: string) => { indent: number; text: string } | null,
  allowLooseChildLists = false,
): { items: ListItem[]; nextIndex: number } | null {
  const items: ListItem[] = []
  let index = startIndex
  const firstItem = readItem(lines[startIndex])
  if (!firstItem) return null
  const baseIndent = firstItem.indent

  while (index < lines.length) {
    const itemValue = readItem(lines[index])
    if (itemValue === null || itemValue.indent !== baseIndent) break

    const paragraphs = [itemValue.text]
    const children: MessageBlock[] = []
    index += 1

    while (index < lines.length) {
      if (isBlankMarkdownLine(lines[index])) {
        const nextNonBlankIndex = findNextNonBlankLineIndex(lines, index + 1)
        if (nextNonBlankIndex === -1) {
          index = lines.length
          break
        }
        const nextSameLevelItem = readItem(lines[nextNonBlankIndex])
        if (nextSameLevelItem && nextSameLevelItem.indent === baseIndent) {
          index = nextNonBlankIndex
          break
        }
        if (leadingIndentWidth(lines[nextNonBlankIndex]) <= baseIndent) {
          index = nextNonBlankIndex
          break
        }
        index += 1
        continue
      }

      const nextSameLevelItem = readItem(lines[index])
      if (nextSameLevelItem && nextSameLevelItem.indent === baseIndent) break

      const hasIndentedChildren = leadingIndentWidth(lines[index]) > baseIndent
      const hasLooseChildList = allowLooseChildLists && (
        readTaskListItem(lines[index]) !== null ||
        readUnorderedListItem(lines[index]) !== null
      )
      if (hasIndentedChildren || hasLooseChildList) {
        const nestedBlocks = readNestedListBlocks(lines, index, baseIndent, readItem, allowLooseChildLists)
        if (nestedBlocks) {
          children.push(...nestedBlocks.blocks)
          index = nestedBlocks.nextIndex
          continue
        }
      }

      if (leadingIndentWidth(lines[index]) <= baseIndent) break

      const continuation = readListParagraph(lines, index, baseIndent)
      if (!continuation) break
      paragraphs.push(continuation.value)
      index = continuation.nextIndex
    }

    items.push(children.length > 0 ? { paragraphs, children } : { paragraphs })
  }

  return items.length > 0 ? { items, nextIndex: index } : null
}

function isThematicBreakLine(line: string): boolean {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line.trim())
}

function readFenceStart(line: string): { marker: string; language: string } | null {
  const match = line.match(/^\s{0,3}(```+|~~~+)\s*([^\s`~][^`]*)?\s*$/u)
  if (!match) return null
  return {
    marker: match[1],
    language: (match[2] ?? '').trim(),
  }
}

function parseTextBlocks(text: string): MessageBlock[] {
  const normalizedText = normalizeMarkdownText(text)
  const lines = normalizedText.split('\n')
  const blocks: MessageBlock[] = []
  let index = 0

  while (index < lines.length) {
    if (isBlankMarkdownLine(lines[index])) {
      index += 1
      continue
    }

    const fence = readFenceStart(lines[index])
    if (fence) {
      index += 1
      const codeLines: string[] = []
      while (index < lines.length) {
        if (lines[index].trim() === fence.marker) {
          index += 1
          break
        }
        codeLines.push(lines[index])
        index += 1
      }
      blocks.push({
        kind: 'codeBlock',
        language: fence.language,
        value: codeLines.join('\n'),
      })
      continue
    }

    if (isThematicBreakLine(lines[index])) {
      blocks.push({ kind: 'thematicBreak' })
      index += 1
      continue
    }

    const heading = readHeading(lines[index])
    if (heading) {
      blocks.push({ kind: 'heading', level: heading.level, value: heading.value })
      index += 1
      continue
    }

    const quoteLine = readBlockquoteLine(lines[index])
    if (quoteLine !== null) {
      const quoteLines: string[] = []
      while (index < lines.length) {
        const nextQuoteLine = readBlockquoteLine(lines[index])
        if (nextQuoteLine === null) break
        quoteLines.push(nextQuoteLine)
        index += 1
      }
      blocks.push({ kind: 'blockquote', value: quoteLines.join('\n').trim() })
      continue
    }

    const table = readTableBlock(lines, index)
    if (table) {
      blocks.push(table)
      index += 2 + table.rows.length
      continue
    }

    const taskItem = readTaskListItem(lines[index])
    if (taskItem !== null) {
      const items: TaskListItem[] = []
      const baseIndent = readTaskListItemMatch(lines[index])?.indent ?? 0
      while (index < lines.length) {
        const nextItem = readTaskListItemMatch(lines[index])
        if (nextItem === null || nextItem.indent !== baseIndent) break
        items.push(nextItem.item)
        index += 1
      }
      if (items.length > 0) {
        blocks.push({ kind: 'taskList', items })
        continue
      }
    }

    const unorderedItem = readUnorderedListItem(lines[index])
    if (unorderedItem !== null) {
      const parsedList = readListItems(lines, index, readUnorderedListItemMatch)
      if (parsedList) {
        blocks.push({ kind: 'unorderedList', items: parsedList.items })
        index = parsedList.nextIndex
        continue
      }
      if (unorderedItem.length > 0) {
        blocks.push({ kind: 'unorderedList', items: [{ paragraphs: [unorderedItem] }] })
        index += 1
        continue
      }
    }

    const orderedItem = readOrderedListItem(lines[index])
    if (orderedItem !== null) {
      const orderedItemMatch = readOrderedListItemMatch(lines[index])
      const parsedList = readListItems(lines, index, readOrderedListItemMatch, true)
      if (parsedList) {
        blocks.push({
          kind: 'orderedList',
          items: parsedList.items,
          start: orderedItemMatch?.start ?? 1,
        })
        index = parsedList.nextIndex
        continue
      }
      if (orderedItem.length > 0) {
        blocks.push({
          kind: 'orderedList',
          items: [{ paragraphs: [orderedItem] }],
          start: orderedItemMatch?.start ?? 1,
        })
        index += 1
        continue
      }
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      if (isBlankMarkdownLine(lines[index])) break
      if (
        readFenceStart(lines[index]) ||
        isThematicBreakLine(lines[index]) ||
        readHeading(lines[index]) ||
        readTableBlock(lines, index) ||
        readBlockquoteLine(lines[index]) !== null ||
        readTaskListItem(lines[index]) !== null ||
        readUnorderedListItem(lines[index]) !== null ||
        readOrderedListItem(lines[index]) !== null
      ) break
      paragraphLines.push(lines[index])
      index += 1
    }

    const value = paragraphLines.join('\n').trim()
    if (value) {
      blocks.push({ kind: 'paragraph', value })
    }
  }

  return blocks
}

function parseNonCodeMessageBlocks(text: string): MessageBlock[] {
  if (!text.includes('![') || !text.includes('](')) {
    return parseTextBlocks(text)
  }

  const blocks: MessageBlock[] = []
  const imagePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/gu
  let cursor = 0

  for (const match of text.matchAll(imagePattern)) {
    const [fullMatch, altRaw, urlRaw] = match
    if (typeof match.index !== 'number') continue

    const start = match.index
    const end = start + fullMatch.length
    const imageUrl = toRenderableImageUrl(urlRaw.trim())
    if (!imageUrl) continue

    if (start > cursor) {
      blocks.push(...parseTextBlocks(text.slice(cursor, start)))
    }

    blocks.push({ kind: 'image', url: imageUrl, alt: altRaw.trim(), markdown: fullMatch })
    cursor = end
  }

  if (cursor < text.length) {
    blocks.push(...parseTextBlocks(text.slice(cursor)))
  }

  return blocks
}

function parseMessageBlocks(text: string): MessageBlock[] {
  const normalizedText = normalizeMarkdownText(text)
  const lines = normalizedText.split('\n')
  const blocks: MessageBlock[] = []
  let index = 0
  let chunkStart = 0

  const flushChunk = (endExclusive: number): void => {
    if (endExclusive <= chunkStart) return
    const chunk = lines.slice(chunkStart, endExclusive).join('\n')
    blocks.push(...parseNonCodeMessageBlocks(chunk))
  }

  while (index < lines.length) {
    const fence = readFenceStart(lines[index])
    if (!fence) {
      index += 1
      continue
    }

    flushChunk(index)

    index += 1
    const codeLines: string[] = []
    while (index < lines.length) {
      if (lines[index].trim() === fence.marker) {
        index += 1
        break
      }
      codeLines.push(lines[index])
      index += 1
    }

    blocks.push({
      kind: 'codeBlock',
      language: fence.language,
      value: codeLines.join('\n'),
    })
    chunkStart = index
  }

  flushChunk(lines.length)
  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', value: text }]
}

function getMessageBlocks(message: UiMessage): MessageBlock[] {
  const cached = messageBlockCache.get(message.id)
  if (cached && cached.text === message.text && cached.cwd === props.cwd) {
    messageBlockCache.delete(message.id)
    messageBlockCache.set(message.id, cached)
    return cached.blocks
  }
  const blocks = parseMessageBlocks(message.text)
  return setBoundedCacheEntry(
    messageBlockCache,
    message.id,
    { text: message.text, cwd: props.cwd, blocks },
    MESSAGE_BLOCK_CACHE_LIMIT,
  ).blocks
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function normalizeCodeLanguage(language: string): string {
  const token = language.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
  if (!token) return ''
  return CODE_LANGUAGE_ALIASES[token] ?? token
}

function renderHighlightedCodeAsHtmlUncached(language: string, value: string): string {
  const normalizedLanguage = normalizeCodeLanguage(language)
  if (!normalizedLanguage) return escapeHtml(value)
  const highlighter = highlightJsModule.value
  if (!highlighter) return escapeHtml(value)

  try {
    if (highlighter.getLanguage(normalizedLanguage)) {
      return highlighter.highlight(value, {
        language: normalizedLanguage,
        ignoreIllegals: true,
      }).value
    }
  } catch {
    // Fall back to plain escaped code when highlighting fails.
  }

  return escapeHtml(value)
}

function renderCachedHighlightedCodeAsHtml(language: string, value: string): string {
  const cacheKey = `${highlightCacheVersion.value}\u0000${normalizeCodeLanguage(language)}\u0000${language}\u0000${value}`
  const cached = highlightHtmlCache.get(cacheKey)
  if (cached !== undefined) {
    highlightHtmlCache.delete(cacheKey)
    highlightHtmlCache.set(cacheKey, cached)
    return cached
  }
  return setBoundedCacheEntry(
    highlightHtmlCache,
    cacheKey,
    renderHighlightedCodeAsHtmlUncached(language, value),
    HIGHLIGHT_HTML_CACHE_LIMIT,
  )
}

function renderInlineSegmentsAsHtml(text: string): string {
  return getInlineSegments(text)
    .map((segment) => {
      if (segment.kind === 'text') {
        return escapeHtml(segment.value)
      }
      if (segment.kind === 'bold') {
        return `<strong class="message-bold-text">${escapeHtml(segment.value)}</strong>`
      }
      if (segment.kind === 'italic') {
        return `<em class="message-italic-text">${escapeHtml(segment.value)}</em>`
      }
      if (segment.kind === 'strikethrough') {
        return `<s class="message-strikethrough-text">${escapeHtml(segment.value)}</s>`
      }
      if (segment.kind === 'file') {
        return `<a class="message-file-link" href="${escapeHtml(toBrowseUrl(segment.path))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(segment.path)}">${escapeHtml(segment.displayPath)}</a>`
      }
      if (segment.kind === 'url') {
        return `<a class="message-file-link" href="${escapeHtml(segment.href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(segment.href)}">${escapeHtml(segment.value)}</a>`
      }
      return `<code class="message-inline-code">${escapeHtml(segment.value)}</code>`
    })
    .join('')
}

function renderListItemParagraphsAsHtml(item: ListItem): string {
  return item.paragraphs
    .map((paragraph) => `<div class="message-list-item-text message-list-item-paragraph">${renderInlineSegmentsAsHtml(paragraph)}</div>`)
    .join('')
}

function renderListItemContentAsHtml(item: ListItem): string {
  const paragraphsHtml = renderListItemParagraphsAsHtml(item)
  const childrenHtml = item.children?.map((block) => renderMessageBlockAsHtml(block)).join('') ?? ''
  return paragraphsHtml + childrenHtml
}

function tableCellAlignmentStyle(alignment: TableAlignment): string {
  if (!alignment) return ''
  return ` style="text-align:${alignment}"`
}

function renderMessageBlockAsHtml(block: MessageBlock): string {
  if (block.kind === 'paragraph') {
    return `<p class="message-text">${renderInlineSegmentsAsHtml(block.value)}</p>`
  }
  if (block.kind === 'heading') {
    const level = Math.min(6, Math.max(1, Math.trunc(block.level)))
    const tag = headingTag(level)
    const classes = `message-heading ${headingClass(level)}`
    return `<${tag} class="${classes}">${renderInlineSegmentsAsHtml(block.value)}</${tag}>`
  }
  if (block.kind === 'blockquote') {
    return `<blockquote class="message-blockquote">${renderInlineSegmentsAsHtml(block.value)}</blockquote>`
  }
  if (block.kind === 'unorderedList') {
    const items = block.items
      .map((item) => `<li class="message-list-item"><div class="message-list-item-content">${renderListItemContentAsHtml(item)}</div></li>`)
      .join('')
    return `<ul class="message-list message-list-unordered">${items}</ul>`
  }
  if (block.kind === 'taskList') {
    const items = block.items
      .map((item) => (
        `<li class="message-task-item">` +
        `<span class="message-task-checkbox" data-checked="${item.checked ? 'true' : 'false'}">${item.checked ? '☑' : '☐'}</span>` +
        `<div class="message-list-item-text">${renderInlineSegmentsAsHtml(item.text)}</div>` +
        `</li>`
      ))
      .join('')
    return `<ul class="message-list message-task-list">${items}</ul>`
  }
  if (block.kind === 'orderedList') {
    const items = block.items
      .map((item) => `<li class="message-list-item"><div class="message-list-item-content">${renderListItemContentAsHtml(item)}</div></li>`)
      .join('')
    return `<ol class="message-list message-list-ordered" start="${block.start}">${items}</ol>`
  }
  if (block.kind === 'table') {
    const headerCells = block.headers
      .map((cell, index) => `<th class="message-table-head-cell"${tableCellAlignmentStyle(block.alignments[index] ?? null)}>${renderInlineSegmentsAsHtml(cell)}</th>`)
      .join('')
    const rows = block.rows
      .map((row) => (
        `<tr class="message-table-body-row">` +
        row.map((cell, index) => `<td class="message-table-cell"${tableCellAlignmentStyle(block.alignments[index] ?? null)}>${renderInlineSegmentsAsHtml(cell)}</td>`).join('') +
        `</tr>`
      ))
      .join('')
    const body = rows ? `<tbody>${rows}</tbody>` : ''
    return `<div class="message-table-wrap"><table class="message-table"><thead><tr>${headerCells}</tr></thead>${body}</table></div>`
  }
  if (block.kind === 'codeBlock') {
    const language = block.language
      ? `<div class="message-code-language">${escapeHtml(block.language)}</div>`
      : ''
    return `<div class="message-code-block">${language}<pre class="message-code-pre"><code class="hljs">${renderCachedHighlightedCodeAsHtml(block.language, block.value)}</code></pre></div>`
  }
  if (block.kind === 'thematicBreak') {
    return '<hr class="message-divider">'
  }
  return `<img class="message-image-preview message-markdown-image" src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || 'Embedded message image')}" loading="lazy">`
}

function renderMarkdownBlocksAsHtml(text: string): string {
  const cacheKey = `${props.cwd}\u0000${highlightCacheVersion.value}\u0000${text}`
  const cached = markdownHtmlCache.get(cacheKey)
  if (cached && cached.text === text && cached.cwd === props.cwd && cached.highlightVersion === highlightCacheVersion.value) {
    markdownHtmlCache.delete(cacheKey)
    markdownHtmlCache.set(cacheKey, cached)
    return cached.html
  }
  const html = parseMessageBlocks(text)
    .map((block) => renderMessageBlockAsHtml(block))
    .join('')
  return setBoundedCacheEntry(
    markdownHtmlCache,
    cacheKey,
    {
      text,
      cwd: props.cwd,
      highlightVersion: highlightCacheVersion.value,
      html,
    },
    MARKDOWN_HTML_CACHE_LIMIT,
  ).html
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const reason = typeof params?.reason === 'string' ? params.reason.trim() : ''
  if (reason) return reason
  const message = typeof params?.message === 'string' ? params.message.trim() : ''
  if (message) return message
  return typeof params?.prompt === 'string' ? params.prompt.trim() : ''
}

function requestDisplayTitle(request: UiServerRequest): string {
  if (request.method === 'item/commandExecution/requestApproval') return 'Command approval required'
  if (request.method === 'item/fileChange/requestApproval') return 'File change approval required'
  if (request.method === 'item/permissions/requestApproval') return 'Permissions approval required'
  if (request.method === 'mcpServer/elicitation/request') return 'MCP server input required'
  if (request.method === 'item/tool/requestUserInput') return 'Input required'
  if (request.method === 'item/tool/call') return 'Tool call waiting for response'
  return request.method
}

function readMcpElicitationServerName(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return typeof params?.serverName === 'string' ? params.serverName.trim() : ''
}

function readMcpElicitationUrl(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return typeof params?.url === 'string' ? params.url.trim() : ''
}

function mcpElicitationAnswerKey(requestId: number, fieldKey: string): string {
  return `${String(requestId)}:${fieldKey}`
}

function readMcpElicitationFields(request: UiServerRequest): McpElicitationField[] {
  const params = asRecord(request.params)
  const requestedSchema = asRecord(params?.requestedSchema)
  const properties = asRecord(requestedSchema?.properties)
  if (!properties) return []

  const required = new Set(
    Array.isArray(requestedSchema?.required)
      ? requestedSchema.required.filter((entry): entry is string => typeof entry === 'string')
      : [],
  )

  return Object.entries(properties)
    .map(([key, value]) => parseMcpElicitationField(key, asRecord(value), required.has(key)))
    .filter((field): field is McpElicitationField => field !== null)
}

function parseMcpElicitationField(
  key: string,
  schema: Record<string, unknown> | null,
  required: boolean,
): McpElicitationField | null {
  if (!schema) return null

  const label = typeof schema.title === 'string' && schema.title.trim().length > 0 ? schema.title.trim() : key
  const description = typeof schema.description === 'string' ? schema.description.trim() : ''
  const type = typeof schema.type === 'string' ? schema.type.trim() : ''

  if (type === 'boolean') {
    return { key, label, description, required, kind: 'boolean', inputType: 'checkbox', options: [], defaultValue: schema.default === true }
  }

  if (type === 'number' || type === 'integer') {
    return {
      key,
      label,
      description,
      required,
      kind: 'number',
      inputType: 'number',
      options: [],
      defaultValue: typeof schema.default === 'number' ? schema.default : '',
    }
  }

  const options = readMcpElicitationOptions(schema)
  if (type === 'array') {
    return {
      key,
      label,
      description,
      required,
      kind: 'multiEnum',
      inputType: 'checkbox',
      options,
      defaultValue: Array.isArray(schema.default)
        ? schema.default.filter((entry): entry is string => typeof entry === 'string')
        : [],
    }
  }

  if (options.length > 0) {
    return {
      key,
      label,
      description,
      required,
      kind: 'singleEnum',
      inputType: 'select',
      options,
      defaultValue: (typeof schema.default === 'string' ? schema.default : '') || options[0]?.value || '',
    }
  }

  return {
    key,
    label,
    description,
    required,
    kind: 'string',
    inputType: readMcpElicitationInputType(schema),
    options: [],
    defaultValue: typeof schema.default === 'string' ? schema.default : '',
  }
}

function readMcpElicitationOptions(schema: Record<string, unknown>): McpElicitationFieldOption[] {
  const titledSource = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : []
  const titledOptions = titledSource
    .map((option) => asRecord(option))
    .map((option) => ({
      value: typeof option?.const === 'string' ? option.const : '',
      label: typeof option?.title === 'string' && option.title.trim().length > 0 ? option.title : (typeof option?.const === 'string' ? option.const : ''),
    }))
    .filter((option) => option.value.length > 0)
  if (titledOptions.length > 0) return titledOptions

  const items = asRecord(schema.items)
  if (items) {
    const nestedOptions = readMcpElicitationOptions(items)
    if (nestedOptions.length > 0) return nestedOptions
  }

  const values = Array.isArray(schema.enum) ? schema.enum.filter((entry): entry is string => typeof entry === 'string') : []
  const names = Array.isArray(schema.enumNames) ? schema.enumNames.filter((entry): entry is string => typeof entry === 'string') : []
  return values.map((value, index) => ({ value, label: names[index] || value }))
}

function readMcpElicitationInputType(schema: Record<string, unknown>): string {
  const format = typeof schema.format === 'string' ? schema.format.trim() : ''
  if (format === 'email') return 'email'
  if (format === 'uri') return 'url'
  if (format === 'date') return 'date'
  if (format === 'date-time') return 'datetime-local'
  return 'text'
}

function readMcpElicitationFieldValue(requestId: number, field: McpElicitationField): string | number | boolean | string[] {
  const saved = mcpElicitationAnswers.value[mcpElicitationAnswerKey(requestId, field.key)]
  return saved === undefined ? field.defaultValue : saved
}

function readMcpElicitationMultiValue(requestId: number, field: McpElicitationField): string[] {
  const value = readMcpElicitationFieldValue(requestId, field)
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => ({
          label: typeof option?.label === 'string' ? option.label : '',
          description: typeof option?.description === 'string' ? option.description : '',
        }))
        .filter((option) => option.label.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isSecret: question.isSecret === true,
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function onQuestionAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function readQuestionOptionDescription(requestId: number, question: ParsedToolQuestion): string {
  const selected = readQuestionAnswer(requestId, question.id, question.options[0]?.label || '')
  const match = question.options.find((option) => option.label === selected)
  return match?.description ?? ''
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  const key = toolQuestionKey(requestId, questionId)
  return toolQuestionOtherAnswers.value[key] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function onMcpElicitationFieldInput(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: target.value,
  }
}

function onMcpElicitationBooleanToggle(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: target.checked,
  }
}

function onMcpElicitationMultiToggle(
  requestId: number,
  field: McpElicitationField,
  optionValue: string,
  event: Event,
): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const next = new Set(readMcpElicitationMultiValue(requestId, field))
  if (target.checked) next.add(optionValue)
  else next.delete(optionValue)
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: Array.from(next),
  }
}

function onRespondApproval(requestId: number, decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel'): void {
  emit('respondServerRequest', {
    id: requestId,
    result: { decision },
  })
}

function onRespondPermissionsApproval(request: UiServerRequest, scope: 'turn' | 'session'): void {
  const params = asRecord(request.params)
  const permissions = asRecord(params?.permissions) ?? {}
  emit('respondServerRequest', {
    id: request.id,
    result: {
      permissions,
      scope,
    },
  })
}

function buildMcpElicitationContent(request: UiServerRequest): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  for (const field of readMcpElicitationFields(request)) {
    const value = readMcpElicitationFieldValue(request.id, field)
    if (field.kind === 'multiEnum') {
      const arrayValue = Array.isArray(value) ? value : []
      if (arrayValue.length > 0 || field.required) content[field.key] = arrayValue
      continue
    }
    if (field.kind === 'boolean') {
      content[field.key] = Boolean(value)
      continue
    }
    if (field.kind === 'number') {
      const numberValue = typeof value === 'number' ? value : Number(String(value).trim())
      if (!Number.isNaN(numberValue)) content[field.key] = numberValue
      continue
    }
    const textValue = String(value ?? '').trim()
    if (textValue.length > 0 || field.required) content[field.key] = textValue
  }
  return content
}

function onRespondMcpElicitation(request: UiServerRequest, action: 'accept' | 'decline' | 'cancel'): void {
  const params = asRecord(request.params)
  const result: Record<string, unknown> = { action }
  if (action === 'accept' && typeof params?.mode === 'string' && params.mode === 'form') {
    result.content = buildMcpElicitationContent(request)
  }
  emit('respondServerRequest', {
    id: request.id,
    result,
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0]?.label || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from codex-web-local UI.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectUnknownRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from codex-web-local UI.',
    },
  })
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function applyConversationScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  if (autoFollowOutput.value) {
    enforceBottomState()
    return
  }
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
}

function shouldLockToBottom(): boolean {
  return autoFollowOutput.value
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = Math.max(frames, 1)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function jumpToLatest(): void {
  autoFollowOutput.value = true
  enforceBottomState()
  scheduleBottomLock(4)
}

async function loadMoreAbove(): Promise<void> {
  const container = conversationListRef.value
  if (!container || !hasMoreAbove.value || isLoadingMore.value || props.isLoadingPersistedAbove === true) return

  isLoadingMore.value = true
  const threadIdAtStart = props.activeThreadId

  const prevScrollHeight = container.scrollHeight
  const prevScrollTop = container.scrollTop

  try {
    if (renderWindowStart.value > 0) {
      renderWindowStart.value = Math.max(0, renderWindowStart.value - LOAD_MORE_CHUNK)
    } else if (props.hasMorePersistedAbove === true) {
      await props.loadEarlierMessages?.(threadIdAtStart)
    }

    await nextTick()

    // Discard scroll restoration if the thread changed while we were awaiting.
    if (props.activeThreadId === threadIdAtStart) {
      container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
    }
  } finally {
    isLoadingMore.value = false
  }
}

defineExpose({
  jumpToLatest,
})

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleConversationScroll(): Promise<void> {
  if (conversationScrollPromise) return conversationScrollPromise

  conversationScrollPromise = nextTick().then(() => new Promise<void>((resolve) => {
    if (conversationScrollFrame) {
      cancelAnimationFrame(conversationScrollFrame)
    }
    conversationScrollFrame = requestAnimationFrame(() => {
      conversationScrollFrame = 0
      conversationScrollPromise = null
      applyConversationScrollState()
      bindPendingImageHandlers()
      scheduleBottomLock()
      resolve()
    })
  }))

  return conversationScrollPromise
}

function clearRenderCaches(): void {
  messageBlockCache.clear()
  inlineSegmentCache.clear()
  markdownHtmlCache.clear()
  highlightHtmlCache.clear()
}

watch(
  () => props.messages,
  async (next) => {
    if (props.isLoading) return

    const commandIds = new Set(
      next
        .filter((message) => message.messageType === 'commandExecution' && message.commandExecution)
        .map((message) => message.id),
    )
    expandedCommandIds.value = pruneCommandIdSet(expandedCommandIds.value, commandIds)
    collapsedAutoCommandIds.value = pruneCommandIdSet(collapsedAutoCommandIds.value, commandIds)
    expandedCommandGroupIds.value = pruneCommandIdSet(
      expandedCommandGroupIds.value,
      new Set(Object.keys(groupedCommandsByLatestId.value)),
    )
    expandedFileChangeSummaryIds.value = pruneCommandIdSet(
      expandedFileChangeSummaryIds.value,
      new Set([
        ...Object.keys(anchoredFileChangeSummaryByAnchorId.value),
        ...Object.keys(standaloneFileChangeSummaryByMessageId.value),
      ]),
    )

    // Keep renderWindowStart in bounds whenever the message list changes length.
    // Following output: always pin the window to the last RENDER_WINDOW_SIZE messages so
    //   the rendered count stays bounded (handles both growth and shrink/rollback).
    // Scrolled up: only clamp downward so renderWindowStart never exceeds the list length
    //   (prevents visibleMessages from becoming empty after a rollback).
    if (autoFollowOutput.value) {
      renderWindowStart.value = Math.max(0, next.length - RENDER_WINDOW_SIZE)
    } else {
      renderWindowStart.value = Math.min(renderWindowStart.value, Math.max(0, next.length - 1))
    }

    await scheduleConversationScroll()
  },
)

watch(
  () => props.messages.some((message) => message.text.includes('```')),
  (hasCodeBlocks) => {
    if (!hasCodeBlocks || highlightJsModule.value) return
    void ensureHighlightJsLoaded()
  },
  { immediate: true },
)

watch(
  activeCommandMessageId,
  (nextId, prevId) => {
    if (!prevId || prevId === nextId) return
    if (!collapsedAutoCommandIds.value.has(prevId)) return
    const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
    nextCollapsedAuto.delete(prevId)
    collapsedAutoCommandIds.value = nextCollapsedAuto
  },
)

watch(
  () => props.pendingRequests,
  async () => {
    if (props.isLoading) return
    await scheduleConversationScroll()
  },
  { deep: true },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    if (!autoFollowOutput.value) return
    await nextTick()
    enforceBottomState()
    scheduleBottomLock(8)
  },
  { deep: true },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    renderWindowStart.value = Math.max(0, props.messages.length - RENDER_WINDOW_SIZE)
    await scheduleConversationScroll()
  },
)

watch(
  () => props.activeThreadId,
  async () => {
    autoFollowOutput.value = true
    modalImageUrl.value = ''
    isLoadingMore.value = false
    // Apply immediately for cached threads where isLoading never toggles.
    renderWindowStart.value = Math.max(0, props.messages.length - RENDER_WINDOW_SIZE)
    await scheduleConversationScroll()
  },
  { flush: 'post' },
)

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  autoFollowOutput.value = isAtBottom(container)
  if (hasMoreAbove.value && !isLoadingMore.value && container.scrollTop < LOAD_MORE_SCROLL_THRESHOLD_PX) {
    void loadMoreAbove()
  }
}

const failedMarkdownImages = ref(new Set<string>())

function markdownImageKey(messageId: string, blockIndex: number): string {
  return `${messageId}:${blockIndex}`
}

function isMarkdownImageFailed(messageId: string, blockIndex: number): boolean {
  return failedMarkdownImages.value.has(markdownImageKey(messageId, blockIndex))
}

function onMarkdownImageError(messageId: string, blockIndex: number): void {
  const next = new Set(failedMarkdownImages.value)
  next.add(markdownImageKey(messageId, blockIndex))
  failedMarkdownImages.value = next
  markdownImageFailureVersion.value += 1
}

function openImageModal(imageUrl: string): void {
  modalImageUrl.value = imageUrl
}

function closeImageModal(): void {
  modalImageUrl.value = ''
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu)
  window.addEventListener('blur', onWindowBlurForFileLinkContextMenu)
  window.addEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
})

onBeforeUnmount(() => {
  clearRenderCaches()
  if (conversationScrollFrame) {
    cancelAnimationFrame(conversationScrollFrame)
    conversationScrollFrame = 0
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
    copiedMessageResetTimer = null
  }
  window.removeEventListener('pointerdown', onWindowPointerDownForFileLinkContextMenu)
  window.removeEventListener('blur', onWindowBlurForFileLinkContextMenu)
  window.removeEventListener('keydown', onWindowKeydownForFileLinkContextMenu)
})
</script>

<style scoped>
@reference "tailwindcss";

.conversation-root {
  @apply relative h-full min-h-0 min-w-0 p-0 flex flex-col overflow-y-hidden overflow-x-hidden bg-transparent border-none rounded-none;
}

.conversation-loading {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-empty {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-2 sm:px-6 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-2 sm:gap-3;
}

.conversation-load-more {
  @apply flex justify-center py-3 m-0;
}

.load-more-button {
  @apply px-4 py-1.5 text-xs rounded-full border border-slate-300 dark:border-slate-600
         text-slate-500 dark:text-slate-400 bg-transparent
         hover:bg-slate-100 dark:hover:bg-slate-800
         disabled:opacity-40 disabled:cursor-not-allowed
         transition-colors cursor-pointer;
}

.conversation-item {
  @apply m-0 w-full min-w-0 flex;
}

.conversation-item-request {
  @apply justify-center;
}

.conversation-item-overlay {
  @apply justify-center;
}

.message-row {
  @apply relative w-full min-w-0 max-w-[min(var(--chat-column-max,45rem),100%)] mx-auto flex;
}

.message-row[data-role='user'] {
  @apply justify-end;
}

.message-row[data-role='assistant'],
.message-row[data-role='system'] {
  @apply justify-start;
}

.conversation-bottom-anchor {
  @apply h-px;
}

.jump-to-latest-button {
  @apply absolute left-1/2 bottom-4 z-20 inline-flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/96 text-slate-700 shadow-lg shadow-slate-900/10 transition hover:-translate-x-1/2 hover:-translate-y-0.5 hover:bg-white hover:text-slate-900;
}

.jump-to-latest-icon {
  transform: rotate(180deg);
}

.message-stack {
  @apply flex flex-col w-full min-w-0;
}

.request-card {
  @apply w-full max-w-[min(var(--chat-column-max,45rem),100%)] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col gap-2;
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-amber-900;
}

.request-meta {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-reason {
  @apply m-0 text-sm leading-5 text-amber-900 whitespace-pre-wrap break-words;
  overflow-wrap: anywhere;
}

.request-actions {
  @apply flex flex-wrap gap-2;
}

.request-button {
  @apply rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.request-user-input {
  @apply flex flex-col gap-3;
}

.request-question {
  @apply flex flex-col gap-1;
}

.request-question-title {
  @apply m-0 text-sm leading-5 font-medium text-amber-900;
}

.request-question-text {
  @apply m-0 text-xs leading-4 text-amber-800;
}

.request-question-option-description {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-link {
  @apply inline-flex w-fit rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-select {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900;
}

.request-input {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900 placeholder:text-amber-500;
}

.request-checkbox-list {
  @apply flex flex-col gap-1.5;
}

.request-checkbox-row {
  @apply flex items-center gap-2 text-sm text-amber-900;
}

.live-overlay-inline {
  @apply w-full max-w-[min(var(--chat-column-max,45rem),100%)] px-0 py-1 flex flex-col gap-1;
}

.live-overlay-label {
  @apply m-0 text-sm leading-5 font-medium text-zinc-600;
}

.live-overlay-reasoning {
  @apply m-0 text-sm leading-5 text-zinc-500 whitespace-pre-wrap break-words;
  display: block;
  max-height: calc(1.25rem * 5);
  overflow: auto;
  overflow-wrap: anywhere;
  scrollbar-width: none;
  mask-image: linear-gradient(to top, black 75%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, black 75%, transparent 100%);
}

.live-overlay-reasoning::-webkit-scrollbar {
  display: none;
}

.live-overlay-error {
  @apply m-0 flex items-start justify-between gap-3 text-sm leading-5 text-rose-600 whitespace-pre-wrap;
}

.live-overlay-feedback {
  @apply shrink-0 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold leading-none text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300;
}

.turn-error-feedback {
  @apply mt-3 inline-flex w-fit rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold leading-none text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300;
}

.message-body {
  @apply flex flex-col min-w-0 max-w-full;
  width: fit-content;
}

.message-body[data-role='user'] {
  @apply ml-auto items-end;
  align-self: flex-end;
}

.message-toolbar {
  @apply mt-1 self-start flex items-center gap-1 opacity-[0.01] transition-opacity duration-200;
}

.message-row:hover .message-toolbar {
  @apply opacity-100;
}

.message-copy-button {
  @apply inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/90 px-1.25 py-0.5 text-[9px] font-medium leading-none text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900;
}

.message-fork-button {
  @apply inline-flex items-center gap-0.5 px-0.5 py-0 text-[9px] font-medium leading-none text-slate-500 transition hover:text-slate-900;
}


.message-copy-button[data-copied='true'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.message-edit-button {
  @apply inline-flex items-center gap-0.5 px-0.5 py-0 text-[9px] font-medium leading-none text-amber-600/70 transition hover:text-amber-700;
}

.message-fork-icon,
.message-copy-icon,
.message-edit-icon {
  @apply text-[10px];
}

.message-fork-label,
.message-copy-label,
.message-edit-label {
  @apply leading-none;
}

.message-image-list {
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-generated-image-list {
  @apply gap-3;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-xl overflow-hidden border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  @apply block w-16 h-16 object-cover;
}

.message-generated-image-preview {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)] object-contain bg-white;
}

.message-file-attachments {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.message-skill-attachments {
  @apply mb-2 flex flex-wrap justify-end gap-1.5;
}

.message-file-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700;
}

.message-skill-chip {
  @apply inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 no-underline transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-900;
}

.message-skill-chip-prefix {
  @apply shrink-0 font-medium text-emerald-700;
}

.message-skill-chip-name {
  @apply min-w-0 max-w-48 truncate font-mono;
}

.message-file-chip-icon {
  @apply text-[10px] leading-none;
}

.message-file-chip-name {
  @apply truncate max-w-48 font-mono;
}

.message-card {
  @apply max-w-[min(var(--chat-card-max,76ch),100%)] px-0 py-0 bg-transparent border-none rounded-none;
}

.message-text-flow {
  @apply flex flex-col gap-2;
}

.plan-card {
  @apply flex max-w-[min(var(--chat-card-max,76ch),100%)] flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-slate-900;
}

.plan-card-header {
  @apply flex items-center justify-between gap-3;
}

.plan-card-title {
  @apply m-0 text-sm font-semibold leading-5 text-sky-900;
}

.plan-card-badge {
  @apply inline-flex items-center rounded-full bg-sky-200 px-2 py-0.5 text-[11px] font-medium leading-4 text-sky-900;
}

.plan-card-explanation {
  @apply text-slate-700;
}

.plan-card-markdown {
  @apply flex flex-col gap-2;
}

.plan-card-markdown :deep(.message-text),
.plan-card-markdown :deep(.message-heading),
.plan-card-markdown :deep(.message-blockquote),
.plan-card-markdown :deep(.message-list),
.plan-card-markdown :deep(.message-table-wrap),
.plan-card-markdown :deep(.message-code-block),
.plan-card-markdown :deep(.message-divider) {
  @apply m-0;
}

.plan-card-markdown :deep(.message-text) {
  @apply text-sm leading-relaxed whitespace-pre-wrap text-slate-800;
}

.plan-card-markdown :deep(.message-heading) {
  @apply text-slate-900 tracking-tight;
}

.plan-card-markdown :deep(.message-heading-h1) {
  @apply text-2xl font-semibold leading-tight;
}

.plan-card-markdown :deep(.message-heading-h2) {
  @apply text-xl font-semibold leading-tight;
}

.plan-card-markdown :deep(.message-heading-h3) {
  @apply text-lg font-semibold leading-snug;
}

.plan-card-markdown :deep(.message-heading-h4) {
  @apply text-base font-semibold leading-snug;
}

.plan-card-markdown :deep(.message-heading-h5) {
  @apply text-sm font-semibold leading-snug uppercase tracking-[0.02em];
}

.plan-card-markdown :deep(.message-heading-h6) {
  @apply text-xs font-semibold leading-snug uppercase tracking-[0.04em] text-slate-600;
}

.plan-card-markdown :deep(.message-blockquote) {
  @apply border-l-4 border-slate-300 pl-4 py-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-700 bg-slate-50/70 rounded-r-lg;
}

.plan-card-markdown :deep(.message-list) {
  @apply pl-5 text-sm leading-relaxed text-slate-800 flex flex-col gap-1.5;
}

.plan-card-markdown :deep(.message-list-unordered) {
  @apply list-disc;
}

.plan-card-markdown :deep(.message-list-ordered) {
  @apply list-decimal;
}

.plan-card-markdown :deep(.message-list-item) {
  @apply pl-1;
}

.plan-card-markdown :deep(.message-list-item-text) {
  @apply whitespace-pre-wrap;
}

.plan-card-markdown :deep(.message-list-item-paragraph + .message-list-item-paragraph) {
  @apply mt-2;
}

.plan-card-markdown :deep(.message-task-list) {
  @apply list-none pl-0;
}

.plan-card-markdown :deep(.message-task-item) {
  @apply flex items-start gap-2;
}

.plan-card-markdown :deep(.message-task-checkbox) {
  @apply mt-0.5 text-sm leading-none text-slate-500 select-none;
}

.plan-card-markdown :deep(.message-code-block) {
  @apply overflow-hidden rounded-xl border border-slate-200 bg-slate-950/95 text-slate-100;
}

.plan-card-markdown :deep(.message-code-language) {
  @apply border-b border-slate-800 bg-slate-900/90 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400;
}

.plan-card-markdown :deep(.message-code-pre) {
  @apply m-0 overflow-x-auto px-3 py-3 text-[13px] leading-6;
}

.plan-card-markdown :deep(.message-inline-code) {
  @apply rounded-md bg-slate-200/80 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-900;
}

.plan-card-markdown :deep(.message-file-link) {
  @apply text-sky-700 underline decoration-sky-300 underline-offset-2;
}

.plan-card-markdown :deep(.message-table) {
  @apply bg-white/90;
}

.plan-step-list {
  @apply m-0 flex list-none flex-col gap-2 p-0;
}

.plan-step-item {
  @apply flex items-start gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm leading-relaxed text-slate-800;
}

.plan-step-item[data-status='completed'] {
  @apply border-emerald-200 bg-emerald-50/80;
}

.plan-step-item[data-status='inProgress'] {
  @apply border-amber-200 bg-amber-50/80;
}

.plan-step-status {
  @apply mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700;
}

.plan-step-status[data-status='completed'] {
  @apply bg-emerald-200 text-emerald-900;
}

.plan-step-status[data-status='inProgress'] {
  @apply bg-amber-200 text-amber-900;
}

.plan-step-text {
  @apply min-w-0 flex-1;
}

.plan-card-actions {
  @apply mt-3 flex justify-end;
}

.plan-card-implement-button {
  @apply inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50;
}

.message-text {
  @apply m-0 text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-800;
  overflow-wrap: anywhere;
}

.message-heading {
  @apply m-0 text-slate-900 tracking-tight;
}

.message-heading-h1 {
  @apply text-2xl font-semibold leading-tight;
}

.message-heading-h2 {
  @apply text-xl font-semibold leading-tight;
}

.message-heading-h3 {
  @apply text-lg font-semibold leading-snug;
}

.message-heading-h4 {
  @apply text-base font-semibold leading-snug;
}

.message-heading-h5 {
  @apply text-sm font-semibold leading-snug uppercase tracking-[0.02em];
}

.message-heading-h6 {
  @apply text-xs font-semibold leading-snug uppercase tracking-[0.04em] text-slate-600;
}

.message-blockquote {
  @apply m-0 border-l-4 border-slate-300 pl-4 py-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-700 bg-slate-50/70 rounded-r-lg;
  overflow-wrap: anywhere;
}

.message-list {
  @apply m-0 pl-5 text-sm leading-relaxed text-slate-800 flex flex-col gap-1.5;
}

.message-list-unordered {
  @apply list-disc;
}

.message-list-ordered {
  @apply list-decimal;
}

.message-list-item {
  @apply pl-1;
}

.message-list-item-content {
  @apply flex flex-col gap-1.5;
}

.message-list-item-text {
  @apply whitespace-pre-wrap break-words;
  overflow-wrap: anywhere;
}

.message-list-item-paragraph + .message-list-item-paragraph {
  @apply mt-2;
}

.message-task-list {
  @apply list-none pl-0;
}

.message-task-item {
  @apply flex items-start gap-2;
}

.message-task-checkbox {
  @apply mt-0.5 text-sm leading-none text-slate-500 select-none;
}

.message-table-wrap {
  @apply w-full overflow-x-auto;
}

.message-table {
  @apply min-w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800;
}

.message-table-head-cell,
.message-table-cell {
  @apply border-b border-l border-slate-200 px-3 py-2 align-top whitespace-pre-wrap break-words;
  overflow-wrap: anywhere;
}

.message-table-head-cell:first-child,
.message-table-cell:first-child {
  @apply border-l-0;
}

.message-table-head-cell {
  @apply bg-slate-100 font-semibold text-slate-900;
}

.message-table-body-row:last-child .message-table-cell {
  @apply border-b-0;
}

.message-bold-text {
  @apply font-semibold text-slate-900;
}

.message-italic-text {
  @apply italic;
}

.message-strikethrough-text {
  @apply line-through text-slate-500;
}

.message-markdown-image {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)] object-contain bg-white;
}

.message-inline-code {
  @apply rounded-md border border-slate-200 bg-slate-100/60 px-1.5 py-0.5 text-[0.875em] leading-[1.4] text-slate-900 font-mono;
}

.message-code-block {
  @apply overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100;
}

.message-code-language {
  @apply border-b border-slate-800 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.08em] text-slate-400;
}

.message-code-pre {
  @apply m-0 overflow-x-auto px-3 py-3 text-[13px] leading-relaxed font-mono whitespace-pre;
}

.message-code-pre :deep(.hljs) {
  @apply block bg-transparent p-0 text-inherit;
}

.message-file-link {
  @apply text-sm leading-relaxed text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.file-link-context-menu {
  @apply fixed z-50 min-w-36 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl;
}

.file-link-context-menu-item {
  @apply block w-full rounded-md px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100;
}

.message-divider {
  @apply m-0 border-0 h-px bg-slate-300/80;
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-card[data-role='user'] {
  @apply rounded-2xl bg-slate-200 px-4 py-3 max-w-[min(560px,100%)];
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.automation-message-label {
  @apply mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500;
}

.automation-message-label code {
  @apply rounded-full bg-white/70 px-2 py-0.5 text-[10px] normal-case tracking-normal text-slate-600;
}

.message-card[data-role='assistant'],
.message-card[data-role='system'] {
  @apply px-0 py-0 bg-transparent border-none rounded-none;
}

:global(.dark) .message-file-chip {
  @apply border-zinc-700 bg-zinc-900 text-zinc-200;
}

:global(.dark) .message-skill-chip {
  @apply border-emerald-800/70 bg-emerald-950/50 text-emerald-100;
}

:global(.dark) .message-skill-chip-prefix {
  @apply text-emerald-300;
}

.conversation-item[data-message-type='worked'] .message-stack,
.conversation-item[data-message-type='worked'] .message-body,
.conversation-item[data-message-type='worked'] .message-card {
  @apply w-full max-w-full;
}

.worked-separator-wrap {
  @apply w-full flex flex-col gap-0;
}

.worked-separator {
  @apply w-full flex items-center gap-3 bg-transparent border-none cursor-pointer p-0;
}

.worked-chevron {
  @apply text-[9px] text-zinc-400 transition-transform duration-200 flex-shrink-0;
}

.worked-chevron-open {
  transform: rotate(90deg);
}

.worked-separator-line {
  @apply h-px bg-zinc-300/80 flex-1;
}

.worked-separator-text {
  @apply m-0 text-sm leading-relaxed font-normal text-slate-800;
}

.worked-details {
  @apply flex flex-col gap-1.5 pt-2;
}

.worked-cmd-item {
  @apply flex flex-col;
}

.image-modal-backdrop {
  @apply fixed inset-0 z-50 bg-black/40 p-6 flex items-center justify-center;
}

.image-modal-content {
  @apply relative max-w-[min(92vw,1100px)] max-h-[92vh];
}

.image-modal-close {
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/90 text-slate-900 border border-slate-300 flex items-center justify-center;
}

.image-modal-image {
  @apply block max-w-full max-h-[90vh] rounded-2xl shadow-2xl bg-white;
}

.icon-svg {
  @apply w-5 h-5;
}

.cmd-row {
  @apply w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 cursor-pointer transition text-left hover:bg-zinc-100;
}

.cmd-row.cmd-row-group {
  @apply border-dashed border-zinc-300 bg-zinc-100/90 text-zinc-600;
}

.cmd-row.cmd-compact {
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.625rem;
}

.cmd-row.cmd-compact .cmd-chevron {
  font-size: 9px;
}

.cmd-row.cmd-compact .cmd-label {
  font-size: 0.75rem;
}

.cmd-row.cmd-compact .cmd-status {
  max-width: 4.5rem;
  font-size: 0.75rem;
}

.cmd-row.cmd-expanded {
  @apply rounded-b-none;
}

.cmd-chevron {
  @apply text-[10px] text-zinc-400 transition-transform duration-150 flex-shrink-0;
}

.cmd-chevron-open {
  transform: rotate(90deg);
}

.cmd-label {
  @apply flex-1 min-w-0 truncate text-xs font-mono text-zinc-700;
}

.cmd-group-label {
  @apply flex-1 min-w-0 truncate text-xs font-medium text-zinc-600;
}

.cmd-status {
  @apply max-w-24 truncate text-right text-[11px] font-medium flex-shrink-0;
}

.cmd-status-running .cmd-status {
  @apply text-amber-600;
}

.cmd-status-ok .cmd-status {
  @apply text-emerald-600;
}

.cmd-status-error .cmd-status {
  @apply text-rose-600;
}

.cmd-output-wrap {
  @apply rounded-b-lg bg-zinc-900;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out, border-color 300ms ease-out;
  border: 1px solid transparent;
  border-top: none;
}

.cmd-output-wrap.cmd-output-visible {
  grid-template-rows: 1fr;
  border-color: #e4e4e7;
}

.cmd-group-wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 220ms ease-out;
}

.cmd-group-wrap.cmd-group-visible {
  grid-template-rows: 1fr;
}

.cmd-group-inner {
  @apply mb-1 flex min-h-0 flex-col gap-1 overflow-hidden pl-2;
}

.cmd-output-inner {
  overflow: hidden;
  min-height: 0;
}

.cmd-output {
  @apply m-0 px-3 py-2 text-xs font-mono text-zinc-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto;
}

.cmd-output.cmd-output-condensed {
  max-height: 9rem;
}

.file-change-summary-block {
  @apply mt-3 flex flex-col gap-0;
}

.file-change-summary-block-inline {
  @apply mt-4;
}

.file-change-summary-row {
  @apply border-dashed;
}

.file-change-summary-label {
  @apply flex-1 min-w-0 truncate text-xs font-medium text-zinc-700;
}

.file-change-summary-status {
  @apply inline-flex max-w-28 items-center justify-end gap-1.5 text-right text-[11px] font-semibold text-zinc-500 flex-shrink-0;
}

.file-change-panel-inner {
  @apply mb-1 min-h-0 overflow-hidden pl-2;
}

.file-change-list {
  @apply m-0 flex list-none flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white/80 p-1.5;
}

.file-change-item {
  @apply flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-700;
}

.file-change-badge {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em];
}

.file-change-badge[data-operation='add'] {
  @apply bg-emerald-50 text-emerald-700;
}

.file-change-badge[data-operation='update'] {
  @apply bg-sky-50 text-sky-700;
}

.file-change-badge[data-operation='delete'] {
  @apply bg-rose-50 text-rose-700;
}

.file-change-badge[data-operation='move'] {
  @apply bg-amber-50 text-amber-700;
}

.file-change-path {
  @apply min-w-0 break-all font-mono text-[13px];
}

.file-change-path-button {
  @apply min-w-0 border-0 bg-transparent p-0 text-left font-mono text-[13px] text-[#0969da] hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.file-change-arrow {
  @apply text-zinc-400;
}

.file-change-delta {
  @apply ml-auto inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600;
}

.file-change-signed-count {
  @apply inline-flex items-center whitespace-nowrap;
}

.file-change-signed-count[data-tone='add'] {
  @apply text-emerald-600;
}

.file-change-signed-count[data-tone='remove'] {
  @apply text-rose-600;
}

.diff-viewer-backdrop {
  @apply fixed inset-0 z-50 bg-black/45 p-3 sm:p-6 flex items-center justify-center;
}

.diff-viewer-shell {
  @apply relative grid h-[min(88vh,920px)] w-[min(96vw,1320px)] grid-cols-1 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl lg:grid-cols-[320px_minmax(0,1fr)];
}

.diff-viewer-sidebar {
  @apply flex min-h-0 flex-col border-b border-zinc-200 bg-zinc-50 lg:border-b-0 lg:border-r;
}

.diff-viewer-sidebar-header {
  @apply flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4;
}

.diff-viewer-sidebar-title {
  @apply m-0 text-sm font-semibold text-zinc-900;
}

.diff-viewer-sidebar-count {
  @apply m-0 text-xs font-medium text-zinc-500;
}

.diff-viewer-sidebar-list {
  @apply flex min-h-0 flex-col gap-2 overflow-y-auto p-3;
}

.diff-viewer-file-button {
  @apply flex w-full flex-col items-start gap-2 rounded-2xl border border-transparent bg-transparent px-3 py-3 text-left transition hover:border-zinc-200 hover:bg-white;
}

.diff-viewer-file-button[data-active='true'] {
  @apply border-sky-200 bg-white shadow-sm;
}

.diff-viewer-file-label {
  @apply break-all font-mono text-[13px] text-zinc-700;
}

.diff-viewer-file-delta {
  @apply inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600;
}

.diff-viewer-main {
  @apply flex min-h-0 flex-col bg-white;
}

.diff-viewer-toolbar {
  @apply flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4;
}

.diff-viewer-toolbar-actions {
  @apply flex items-center gap-2 shrink-0;
}

.diff-viewer-title-wrap {
  @apply min-w-0;
}

.diff-viewer-title {
  @apply m-0 break-all text-base font-semibold text-zinc-900;
}

.diff-viewer-subtitle {
  @apply mt-1 mb-0 text-sm text-zinc-500;
}

.diff-viewer-close {
  @apply static shrink-0 border-zinc-200 bg-zinc-100 text-zinc-700;
}

.diff-viewer-mobile-files-button {
  @apply inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700;
}

.diff-viewer-empty {
  @apply flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center;
}

.diff-viewer-empty-title {
  @apply m-0 text-base font-semibold text-zinc-900;
}

.diff-viewer-empty-text {
  @apply mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500;
}

.diff-viewer-panel {
  @apply flex min-h-0 flex-1 flex-col;
}

.diff-viewer-meta {
  @apply border-b border-zinc-200 bg-zinc-50 px-5 py-2;
}

.diff-viewer-language {
  @apply inline-flex items-center rounded-full bg-zinc-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-700;
}

.diff-viewer-lines {
  @apply min-h-0 flex-1 overflow-auto bg-zinc-950;
}

.diff-viewer-line {
  display: grid;
  grid-template-columns: 4rem 4rem 2rem minmax(0, 1fr);
  align-items: stretch;
  min-width: fit-content;
}

.diff-viewer-line-number {
  @apply border-r border-zinc-800 px-3 py-1.5 text-right font-mono text-xs text-zinc-500 select-none;
}

.diff-viewer-line-marker {
  @apply border-r border-zinc-800 px-2 py-1.5 text-center font-mono text-xs text-zinc-500 select-none;
}

.diff-viewer-line-code {
  @apply block whitespace-pre px-3 py-1.5 font-mono text-[12px] leading-5 text-zinc-100;
}

.diff-viewer-line[data-kind='meta'] {
  @apply bg-zinc-900;
}

.diff-viewer-line[data-kind='meta'] .diff-viewer-line-code,
.diff-viewer-line[data-kind='meta'] .diff-viewer-line-marker {
  @apply text-sky-300;
}

.diff-viewer-line[data-kind='hunk'] {
  @apply bg-sky-950/40;
}

.diff-viewer-line[data-kind='hunk'] .diff-viewer-line-code,
.diff-viewer-line[data-kind='hunk'] .diff-viewer-line-marker {
  @apply text-sky-300;
}

.diff-viewer-line[data-kind='add'] {
  background: rgba(20, 83, 45, 0.38);
}

.diff-viewer-line[data-kind='add'] .diff-viewer-line-marker,
.diff-viewer-line[data-kind='add'] .diff-viewer-line-code {
  @apply text-emerald-200;
}

.diff-viewer-line[data-kind='remove'] {
  background: rgba(127, 29, 29, 0.32);
}

.diff-viewer-line[data-kind='remove'] .diff-viewer-line-marker,
.diff-viewer-line[data-kind='remove'] .diff-viewer-line-code {
  @apply text-rose-200;
}

.diff-viewer-line[data-kind='context'] {
  @apply bg-zinc-950;
}

.diff-viewer-line[data-kind='context'] .diff-viewer-line-code {
  @apply text-zinc-100;
}

.diff-viewer-mobile-sheet-backdrop {
  @apply absolute inset-0 z-20 bg-black/35 flex items-end;
}

.diff-viewer-mobile-sheet {
  @apply w-full max-h-[70vh] rounded-t-3xl bg-white shadow-2xl border-t border-zinc-200 flex flex-col overflow-hidden;
}

.diff-viewer-mobile-sheet-handle {
  @apply mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-300;
}

.diff-viewer-mobile-sheet-header {
  @apply flex items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-zinc-200;
}

.diff-viewer-mobile-sheet-list {
  @apply flex min-h-0 flex-col gap-2 overflow-y-auto px-3 py-3;
}

.diff-viewer-sheet-enter-active,
.diff-viewer-sheet-leave-active {
  @apply transition-opacity duration-200;
}

.diff-viewer-sheet-enter-active .diff-viewer-mobile-sheet,
.diff-viewer-sheet-leave-active .diff-viewer-mobile-sheet {
  transition: transform 200ms ease;
}

.diff-viewer-sheet-enter-from,
.diff-viewer-sheet-leave-to {
  @apply opacity-0;
}

.diff-viewer-sheet-enter-from .diff-viewer-mobile-sheet,
.diff-viewer-sheet-leave-to .diff-viewer-mobile-sheet {
  transform: translateY(100%);
}

@media (max-width: 767px) {
  .diff-viewer-backdrop {
    @apply p-0 items-stretch;
  }

  .diff-viewer-shell {
    @apply h-[100dvh] w-screen rounded-none border-0 shadow-none;
  }

  .diff-viewer-main {
    @apply min-w-0;
  }

  .diff-viewer-toolbar {
    @apply sticky top-0 z-10 bg-white px-3 py-3;
  }

  .diff-viewer-title {
    @apply text-sm leading-5;
  }

  .diff-viewer-subtitle {
    @apply text-xs;
  }

  .diff-viewer-meta {
    @apply px-3 py-2;
  }

  .diff-viewer-language {
    @apply text-[10px];
  }

  .diff-viewer-line {
    grid-template-columns: 2.75rem 2.75rem 1.5rem minmax(0, 1fr);
  }

  .diff-viewer-line-number {
    @apply px-1.5 py-1 text-[10px];
  }

  .diff-viewer-line-marker {
    @apply px-1 py-1 text-[10px];
  }

  .diff-viewer-line-code {
    @apply px-2 py-1 text-[11px] leading-5;
  }
}
</style>
