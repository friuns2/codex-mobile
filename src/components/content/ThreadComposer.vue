<template>
  <form class="thread-composer" @submit.prevent="onSubmit(isTurnInProgress ? activeInProgressMode : 'steer')">
    <p v-if="dictationErrorText" class="thread-composer-dictation-error">
      {{ dictationErrorText }}
    </p>

    <div
      class="thread-composer-shell"
      :class="{
        'thread-composer-shell--no-top-radius': hasQueueAbove,
        'thread-composer-shell--drag-active': isDragActive,
      }"
    >
      <div v-if="selectedImages.length > 0" class="thread-composer-attachments">
        <div v-for="image in selectedImages" :key="image.id" class="thread-composer-attachment">
          <img class="thread-composer-attachment-image" :src="image.url" :alt="image.name || 'Selected image'" />
          <button
            class="thread-composer-attachment-remove"
            type="button"
            :aria-label="`Remove ${image.name || 'image'}`"
            :disabled="isInteractionDisabled"
            @click="removeImage(image.id)"
          >
            x
          </button>
        </div>
      </div>

      <div v-if="folderUploadGroups.length > 0" class="thread-composer-folder-chips">
        <span v-for="group in folderUploadGroups" :key="group.id" class="thread-composer-folder-chip">
          <IconTablerFolder class="thread-composer-folder-chip-icon" />
          <span class="thread-composer-folder-chip-name" :title="group.name">{{ group.name }}</span>
          <span class="thread-composer-folder-chip-meta">
            <template v-if="group.isUploading">
              {{ getFolderUploadPercent(group) }}% uploading ({{ group.processed }}/{{ group.total }})
            </template>
            <template v-else>
              {{ group.filePaths.length }} file{{ group.filePaths.length === 1 ? '' : 's' }}
            </template>
          </span>
          <button
            class="thread-composer-folder-chip-remove"
            type="button"
            :aria-label="`Remove folder ${group.name}`"
            :disabled="isInteractionDisabled"
            @click="removeFolderAttachment(group.id)"
          >×</button>
        </span>
      </div>

      <div v-if="standaloneFileAttachments.length > 0" class="thread-composer-file-chips">
        <span v-for="att in standaloneFileAttachments" :key="att.fsPath" class="thread-composer-file-chip">
          <IconTablerFilePencil class="thread-composer-file-chip-icon" />
          <span class="thread-composer-file-chip-name" :title="att.fsPath">{{ att.label }}</span>
          <button
            class="thread-composer-file-chip-remove"
            type="button"
            :aria-label="`Remove ${att.label}`"
            :disabled="isInteractionDisabled"
            @click="removeFileAttachment(att.fsPath)"
          >×</button>
        </span>
      </div>

      <div v-if="selectedSkills.length > 0" class="thread-composer-skill-chips">
        <span v-for="skill in selectedSkills" :key="skill.path" class="thread-composer-skill-chip">
          <button
            class="thread-composer-skill-chip-name"
            type="button"
            :title="skillMarkdownPath(skill.path)"
            :aria-label="`Open ${skill.displayName || skill.name} SKILL.md`"
            @click="openSkillMarkdown(skill)"
          >
            {{ skill.displayName || skill.name }}
          </button>
          <button
            class="thread-composer-skill-chip-remove"
            type="button"
            :aria-label="`Remove skill ${skill.displayName || skill.name}`"
            @click="removeSkill(skill.path)"
          >×</button>
        </span>
      </div>

      <div
        class="thread-composer-input-wrap"
        :class="{ 'thread-composer-input-wrap--drag-active': isDragActive }"
        @dragenter="onInputDragEnter"
        @dragover="onInputDragOver"
        @dragleave="onInputDragLeave"
        @drop="onInputDrop"
      >
        <div v-if="isDragActive" class="thread-composer-drop-overlay" aria-hidden="true">
          <span class="thread-composer-drop-overlay-copy">Drop images or files</span>
        </div>
        <div v-if="isFileMentionOpen" class="thread-composer-file-mentions">
          <template v-if="fileMentionSuggestions.length > 0">
            <button
              v-for="(item, index) in fileMentionSuggestions"
              :key="item.path"
              class="thread-composer-file-mention-row"
              :class="{ 'is-active': index === fileMentionHighlightedIndex }"
              type="button"
              @mousedown.prevent="applyFileMention(item)"
            >
              <span
                v-if="getMentionBadgeText(item.path)"
                class="thread-composer-file-mention-icon-badge"
                :class="`is-${getMentionBadgeClass(item.path)}`"
              >
                {{ getMentionBadgeText(item.path) }}
              </span>
              <span v-else-if="isMarkdownFile(item.path)" class="thread-composer-file-mention-icon-markdown">↓</span>
              <IconTablerFilePencil v-else class="thread-composer-file-mention-icon-file" />
              <span class="thread-composer-file-mention-text">
                <span class="thread-composer-file-mention-name">{{ getMentionFileName(item.path) }}</span>
                <span v-if="getMentionDirName(item.path)" class="thread-composer-file-mention-dir">{{ getMentionDirName(item.path) }}</span>
              </span>
            </button>
          </template>
          <div v-else class="thread-composer-file-mention-empty">{{ t('No matching files') }}</div>
        </div>
        <textarea
          ref="inputRef"
          v-model="draft"
          class="thread-composer-input"
          :placeholder="placeholderText"
          :disabled="isInteractionDisabled"
          @input="onInputChange"
          @keydown="onInputKeydown"
          @paste="onInputPaste"
        />
      </div>

      <div
        class="thread-composer-controls"
        :class="{ 'thread-composer-controls--recording': isDictationRecording }"
      >
        <div ref="attachMenuRootRef" class="thread-composer-attach">
          <button
            class="thread-composer-attach-trigger"
            type="button"
            :aria-label="t('Add photos & files')"
            :disabled="isInteractionDisabled"
            @click="toggleAttachMenu"
          >
            +
          </button>

          <div v-if="isAttachMenuOpen" class="thread-composer-attach-menu">
            <button
              class="thread-composer-attach-item"
              type="button"
              :disabled="isInteractionDisabled"
              @click="triggerPhotoLibrary"
            >
              {{ t('Add photos & files') }}
            </button>
            <button
              class="thread-composer-attach-item"
              type="button"
              :disabled="isInteractionDisabled"
              @click="triggerFolderPicker"
            >
              {{ t('Add folder') }}
            </button>
            <button
              class="thread-composer-attach-item"
              type="button"
              :disabled="isInteractionDisabled"
              @click="triggerCameraCapture"
            >
              {{ t('Take photo') }}
            </button>
            <div class="thread-composer-attach-separator" />
            <div class="thread-composer-attach-mode">
              <span class="thread-composer-attach-mode-label">{{ t('In-progress send') }}</span>
              <div class="thread-composer-attach-mode-buttons">
                <button
                  class="thread-composer-attach-mode-button"
                  :class="{ 'is-active': activeInProgressMode === 'steer' }"
                  type="button"
                  :disabled="isInteractionDisabled"
                  @click="setActiveInProgressMode('steer')"
                >
                  {{ t('Steer') }}
                </button>
                <button
                  class="thread-composer-attach-mode-button"
                  :class="{ 'is-active': activeInProgressMode === 'queue' }"
                  type="button"
                  :disabled="isInteractionDisabled"
                  @click="setActiveInProgressMode('queue')"
                >
                  {{ t('Queue') }}
                </button>
              </div>
            </div>
            <div class="thread-composer-attach-separator" />
            <button
              v-if="isFastModeSupported"
              class="thread-composer-attach-setting"
              type="button"
              role="switch"
              :aria-checked="selectedSpeedMode === 'fast'"
              :aria-label="`${t('Fast mode')} ${selectedSpeedMode === 'fast' ? t('enabled') : t('disabled')}`"
              :disabled="isSpeedToggleDisabled"
              @click="onToggleSpeedMode"
            >
              <span class="thread-composer-attach-setting-copy">
                <span class="thread-composer-attach-setting-label">{{ t('Fast mode') }}</span>
                <span class="thread-composer-attach-setting-description">{{ speedModeDescription }}</span>
              </span>
              <span
                class="thread-composer-attach-switch"
                :class="{
                  'is-on': selectedSpeedMode === 'fast',
                  'is-busy': isUpdatingSpeedMode,
                  'is-disabled': isSpeedToggleDisabled,
                }"
              />
            </button>
            <button
              class="thread-composer-attach-setting"
              type="button"
              role="switch"
              :aria-checked="isPlanModeSelected"
              :aria-label="isPlanModeSelected ? t('Disable plan mode') : t('Enable plan mode')"
              :disabled="isComposerConfigDisabled"
              @click="toggleCollaborationMode"
            >
              <span class="thread-composer-attach-setting-copy">
                <span class="thread-composer-attach-setting-label">{{ t('Plan mode') }}</span>
                <span class="thread-composer-attach-setting-description">{{ t('Agent proposes a plan before acting') }}</span>
              </span>
              <span
                class="thread-composer-attach-switch"
                :class="{ 'is-on': isPlanModeSelected }"
              />
            </button>
          </div>
        </div>

        <template v-if="!isDictationRecording">
          <ComposerDropdown
            class="thread-composer-control"
            :model-value="selectedModel"
            :options="modelOptions"
            :selected-prefix-icon="showFastModeModelIcon ? IconTablerBolt : null"
            :placeholder="t('Model')"
            open-direction="up"
            :disabled="isComposerConfigDisabled || models.length === 0"
            enable-search
            :search-placeholder="t('Search models...')"
            @update:model-value="onModelSelect"
          />

          <ComposerSearchDropdown
            class="thread-composer-control"
            :options="skillDropdownOptions"
            :selected-values="selectedSkillPaths"
            :placeholder="t('Skills')"
            :search-placeholder="t('Search skills and prompts...')"
            :create-label="t('Add new prompt')"
            :allow-remove="true"
            :remove-label="t('Remove prompt')"
            open-direction="up"
            :disabled="isComposerConfigDisabled"
            @toggle="onSkillDropdownToggle"
            @create="onCreatePrompt"
            @remove="onRemovePrompt"
          />

          <ComposerDropdown
            class="thread-composer-control"
            :model-value="selectedReasoningEffort"
            :options="reasoningOptions"
            :placeholder="t('Thinking')"
            open-direction="up"
            :disabled="isComposerConfigDisabled"
            @update:model-value="onReasoningEffortSelect"
          />
        </template>

        <div
          class="thread-composer-actions"
          :class="{ 'thread-composer-actions--recording': isDictationRecording }"
        >
          <div v-if="dictationState === 'recording'" class="thread-composer-dictation-waveform-wrap" aria-hidden="true">
            <canvas ref="dictationWaveformCanvasRef" class="thread-composer-dictation-waveform" />
          </div>

          <span v-if="dictationState === 'recording'" class="thread-composer-dictation-timer">
            {{ dictationDurationLabel }}
          </span>

          <button
            v-if="isDictationSupported"
            class="thread-composer-mic"
            :class="{
              'thread-composer-mic--active': dictationState === 'recording',
            }"
            type="button"
            :aria-label="dictationButtonLabel"
            :title="dictationButtonLabel"
            :disabled="isInteractionDisabled"
            @click="onDictationToggle"
            @pointerdown="onDictationPressStart"
            @pointerup="onDictationPressEnd"
            @pointercancel="onDictationPressEnd"
          >
            <IconTablerPlayerStopFilled
              v-if="dictationState === 'recording'"
              class="thread-composer-mic-icon thread-composer-mic-icon--stop"
            />
            <IconTablerMicrophone v-else class="thread-composer-mic-icon" />
          </button>

          <button
            v-if="isTurnInProgress && !hasSubmitContent"
            class="thread-composer-stop"
            type="button"
            :aria-label="isStopPending ? t('Saving thread before stop is available') : t('Stop')"
            :title="isStopPending ? t('Saving thread before stop is available') : t('Stop')"
            :disabled="disabled || !activeThreadId || isInterruptingTurn || isStopPending"
            @click="onInterrupt"
          >
            <span v-if="isStopPending" class="thread-composer-stop-spinner" aria-hidden="true" />
            <IconTablerPlayerStopFilled v-else class="thread-composer-stop-icon" />
          </button>
          <button
            v-else
            class="thread-composer-submit"
            :class="{ 'thread-composer-submit--queue': isTurnInProgress && activeInProgressMode === 'queue' }"
            type="button"
            :aria-label="isTurnInProgress && activeInProgressMode === 'queue' ? t('Queue message') : t('Send message')"
            :title="isTurnInProgress ? `${t('Send')} ${activeInProgressMode === 'queue' ? t('Queue') : t('Steer')}` : t('Send')"
            :disabled="!canSubmit"
            @click="onSubmit(isTurnInProgress ? activeInProgressMode : 'steer')"
          >
            <IconTablerArrowUp class="thread-composer-submit-icon" />
          </button>
        </div>
      </div>

    </div>
    <input
      ref="photoLibraryInputRef"
      class="thread-composer-hidden-input"
      type="file"
      multiple
      :disabled="isInteractionDisabled"
      @change="onPhotoLibraryChange"
    />
    <input
      ref="cameraCaptureInputRef"
      class="thread-composer-hidden-input"
      type="file"
      accept="image/*"
      capture="environment"
      :disabled="isInteractionDisabled"
      @change="onCameraCaptureChange"
    />
    <input
      ref="folderPickerInputRef"
      class="thread-composer-hidden-input"
      type="file"
      multiple
      webkitdirectory
      directory
      :disabled="isInteractionDisabled"
      @change="onFolderPickerChange"
    />
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  CollaborationModeKind,
  CollaborationModeOption,
  ReasoningEffort,
  SpeedMode,
  UiRateLimitSnapshot,
  UiRateLimitWindow,
  UiThreadTokenUsage,
  UiTokenUsageBreakdown,
} from '../../types/codex'
import { useDictation } from '../../composables/useDictation'
import { useMobile } from '../../composables/useMobile'
import { useUiLanguage } from '../../composables/useUiLanguage'
import {
  createComposerPrompt,
  getComposerPrompts,
  removeComposerPrompt,
  searchComposerFiles,
  uploadFile,
  type ComposerFileSuggestion,
  type ComposerPromptInfo,
} from '../../api/codexGateway'
import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerBolt from '../icons/IconTablerBolt.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerMicrophone from '../icons/IconTablerMicrophone.vue'
import IconTablerPlayerStopFilled from '../icons/IconTablerPlayerStopFilled.vue'
import ComposerDropdown from './ComposerDropdown.vue'
import ComposerSearchDropdown from './ComposerSearchDropdown.vue'

type SkillSourceBadge = {
  badge: string
  badgeLabel: string
  badgeTone: 'repo' | 'system' | 'plugin' | 'user' | 'prompt'
}

type SkillItem = { name: string; displayName?: string; description: string; path: string; scope?: string; enabled?: boolean }

const props = defineProps<{
  activeThreadId: string
  cwd?: string
  collaborationModes?: CollaborationModeOption[]
  selectedCollaborationMode: CollaborationModeKind
  models: string[]
  selectedModel: string
  selectedReasoningEffort: ReasoningEffort | ''
  selectedSpeedMode: SpeedMode
  skills?: SkillItem[]
  threadTokenUsage?: UiThreadTokenUsage | null
  codexQuota?: UiRateLimitSnapshot | null
  isTurnInProgress?: boolean
  isStopPending?: boolean
  isInterruptingTurn?: boolean
  isUpdatingSpeedMode?: boolean
  disabled?: boolean
  hasQueueAbove?: boolean
  sendWithEnter?: boolean
  inProgressSubmitMode?: 'steer' | 'queue'
  dictationClickToToggle?: boolean
  dictationAutoSend?: boolean
  dictationLanguage?: string
}>()

export type FileAttachment = { label: string; path: string; fsPath: string }

export type ComposerDraftPayload = {
  text: string
  imageUrls: string[]
  fileAttachments: FileAttachment[]
  skills: Array<{ name: string; path: string }>
}

export type SubmitPayload = {
  text: string
  imageUrls: string[]
  fileAttachments: FileAttachment[]
  skills: Array<{ name: string; path: string }>
  mode: 'steer' | 'queue'
}

export type ThreadComposerExposed = {
  hydrateDraft: (payload: ComposerDraftPayload) => void
  appendTextToDraft: (text: string) => void
  hasUnsavedDraft: () => boolean
}

const emit = defineEmits<{
  submit: [payload: SubmitPayload]
  interrupt: []
  'update:selected-collaboration-mode': [mode: CollaborationModeKind]
  'update:selected-model': [modelId: string]
  'update:selected-reasoning-effort': [effort: ReasoningEffort | '']
  'update:selected-speed-mode': [mode: SpeedMode]
}>()
const { t } = useUiLanguage()

type SelectedImage = {
  id: string
  name: string
  url: string
}

type FolderUploadGroup = {
  id: string
  name: string
  total: number
  processed: number
  filePaths: string[]
  isUploading: boolean
}

type AttachmentBatchStats = {
  total: number
  succeeded: number
  failed: number
}

const CONTEXT_WINDOW_BASELINE_TOKENS = 12000
const PASTED_TEXT_FILE_THRESHOLD = 2000
const PROMPT_OPTION_PREFIX = 'prompt:'

const draft = ref('')
const selectedImages = ref<SelectedImage[]>([])
const selectedSkills = ref<SkillItem[]>([])
const savedPrompts = ref<ComposerPromptInfo[]>([])
const fileAttachments = ref<FileAttachment[]>([])
const folderUploadGroups = ref<FolderUploadGroup[]>([])

const dictationFeedback = ref('')
const pendingAttachmentCount = ref(0)
const attachmentBatchStats = ref<AttachmentBatchStats | null>(null)
const isDragActive = ref(false)
const {
  state: dictationState,
  isSupported: isDictationSupported,
  recordingDurationMs,
  waveformCanvasRef: dictationWaveformCanvasRef,
  startRecording,
  stopRecording,
  toggleRecording,
  cancel: cancelDictation,
} = useDictation({
  getLanguage: () => props.dictationLanguage ?? 'auto',
  onTranscript: (text) => {
    draft.value = draft.value ? `${draft.value}\n${text}` : text
    dictationFeedback.value = ''
    if (props.dictationAutoSend !== false) {
      const mode = props.isTurnInProgress ? activeInProgressMode.value : 'steer'
      onSubmit(mode)
      return
    }
    nextTick(() => inputRef.value?.focus())
  },
  onEmpty: () => {
    dictationFeedback.value = props.dictationClickToToggle
      ? 'No speech detected. Click again after speaking.'
      : 'No speech detected. Hold the mic and speak.'
  },
  onError: (error) => {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      dictationFeedback.value = 'Microphone access was denied.'
      return
    }
    dictationFeedback.value = error instanceof Error ? error.message : 'Dictation failed.'
  },
})
const attachMenuRootRef = ref<HTMLElement | null>(null)
const photoLibraryInputRef = ref<HTMLInputElement | null>(null)
const cameraCaptureInputRef = ref<HTMLInputElement | null>(null)
const folderPickerInputRef = ref<HTMLInputElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const { isMobile } = useMobile()
const isAttachMenuOpen = ref(false)
const mentionStartIndex = ref<number | null>(null)
const mentionQuery = ref('')
const fileMentionSuggestions = ref<ComposerFileSuggestion[]>([])
const isFileMentionOpen = ref(false)
const fileMentionHighlightedIndex = ref(0)
const draftGeneration = ref(0)
let fileMentionSearchToken = 0
let fileMentionDebounceTimer: ReturnType<typeof setTimeout> | null = null
let isHoldPressActive = false
let dragDepth = 0
let attachmentSessionToken = 0
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
const DRAFT_STORAGE_PREFIX = 'codex-web-local.thread-draft.v1.'
let lastActiveThreadId = ''

const reasoningOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
]
function formatModelLabel(modelId: string): string {
  return modelId.trim().replace(/^gpt/i, 'GPT')
}

const modelOptions = computed(() =>
  props.models.map((modelId) => ({ value: modelId, label: formatModelLabel(modelId) })),
)
const isPlanModeSelected = computed(() => props.selectedCollaborationMode === 'plan')

const isPlanModeWaitingForModel = computed(() =>
  props.selectedCollaborationMode === 'plan' && props.selectedModel.trim().length === 0,
)

const selectedSkillPaths = computed(() => selectedSkills.value.map((s) => s.path))
const skillDropdownOptions = computed(() =>
  [
    ...(props.skills ?? []).map((s) => {
      const source = skillSourceBadge(s)
      return {
        value: s.path,
        label: s.name,
        description: s.description,
        badge: source.badge,
        badgeLabel: source.badgeLabel,
        badgeTone: source.badgeTone,
        removable: false,
      }
    }),
    ...savedPrompts.value.map((prompt) => ({
      value: promptOptionValue(prompt.path),
      label: prompt.name,
      description: prompt.description,
      badge: 'T',
      badgeLabel: 'Prompt',
      badgeTone: 'prompt' as const,
      removable: true,
    })),
  ],
)

const canSubmit = computed(() => {
  if (props.disabled) return false
  if (props.isUpdatingSpeedMode) return false
  if (!props.activeThreadId) return false
  if (isPlanModeWaitingForModel.value) return false
  if (pendingAttachmentCount.value > 0) return false
  return draft.value.trim().length > 0 || selectedImages.value.length > 0 || fileAttachments.value.length > 0
})
const hasUnsavedDraft = computed(() =>
  draft.value.trim().length > 0
  || selectedImages.value.length > 0
  || selectedSkills.value.length > 0
  || fileAttachments.value.length > 0
  || folderUploadGroups.value.length > 0,
)
const standaloneFileAttachments = computed(() => {
  const grouped = new Set<string>()
  for (const group of folderUploadGroups.value) {
    for (const path of group.filePaths) grouped.add(path)
  }
  return fileAttachments.value.filter((att) => !grouped.has(att.fsPath))
})
const isInteractionDisabled = computed(() => props.disabled || !props.activeThreadId)
const isComposerConfigDisabled = computed(() => props.disabled || !props.activeThreadId)
const isFastModeSupported = computed(() => props.selectedModel.trim() === 'gpt-5.4')
const showFastModeModelIcon = computed(() =>
  props.selectedSpeedMode === 'fast' && isFastModeSupported.value,
)
const isSpeedToggleDisabled = computed(() =>
  isInteractionDisabled.value || props.isUpdatingSpeedMode === true,
)
const speedModeDescription = computed(() => {
  if (props.isUpdatingSpeedMode) {
    return t('Saving speed setting...')
  }
  return props.selectedSpeedMode === 'fast'
    ? t('About 1.5x faster, with credits used at 2x')
    : t('Default speed with normal credit usage')
})
const inProgressMode = computed<'steer' | 'queue'>(() =>
  props.inProgressSubmitMode === 'steer' ? 'steer' : 'queue',
)
const activeInProgressMode = ref<'steer' | 'queue'>(inProgressMode.value)
const isDictationRecording = computed(() => dictationState.value === 'recording')
const dictationButtonLabel = computed(() => {
  if (dictationState.value === 'recording') return t('Stop dictation')
  return props.dictationClickToToggle ? t('Click to dictate') : t('Hold to dictate')
})
const dictationErrorText = computed(() =>
  dictationState.value === 'idle' ? dictationFeedback.value.trim() : '',
)
const attachmentFeedbackText = computed(() => {
  const stats = attachmentBatchStats.value
  if (stats) {
    const completed = stats.succeeded + stats.failed
    const remaining = Math.max(0, stats.total - completed)
    if (remaining > 0) {
      if (stats.failed > 0) {
        return `${stats.failed} ${t('failed')}, ${t('attaching')} ${formatAttachmentFileCount(remaining)}...`
      }
      return remaining === 1 ? t('Attaching file...') : `${t('Attaching')} ${remaining} ${t('files...')}`
    }
    if (stats.failed > 0) {
      if (stats.succeeded > 0) {
        return `${stats.succeeded} ${t('attached')}, ${stats.failed} ${t('failed')}.`
      }
      return stats.failed === 1 ? t('Could not attach file.') : `${t('Could not attach')} ${stats.failed} ${t('files.')}`
    }
  }
  if (pendingAttachmentCount.value <= 0) return ''
  return pendingAttachmentCount.value === 1
    ? t('Attaching file...')
    : `${t('Attaching')} ${pendingAttachmentCount.value} ${t('files...')}`
})
const dictationDurationLabel = computed(() => {
  const totalSeconds = Math.max(0, Math.floor(recordingDurationMs.value / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
})

const placeholderText = computed(() =>
  !props.activeThreadId
    ? t('Select a thread to send a message')
    : isPlanModeWaitingForModel.value
      ? t('Loading models for plan mode...')
      : t('Type a message... (@ for files)'),
)
const hasSubmitContent = computed(() =>
  draft.value.trim().length > 0 || selectedImages.value.length > 0 || fileAttachments.value.length > 0,
)
const quotaSummaryText = computed(() => buildQuotaSummaryText(props.codexQuota ?? null))
const quotaWeeklyRefreshText = computed(() => '')
const quotaTooltipText = computed(() => buildQuotaTooltipText(props.codexQuota ?? null))
const contextUsageView = computed(() => buildContextUsageView(props.threadTokenUsage ?? null))
const contextUsageSummaryText = computed(() => contextUsageView.value?.summaryText ?? '')
const contextUsageTooltipText = computed(() => contextUsageView.value?.tooltipText ?? '')
const contextUsageRemainingPercent = computed(() => contextUsageView.value?.percentRemaining ?? 0)
const contextUsageTone = computed(() => contextUsageView.value?.tone ?? 'healthy')

function formatPlanType(planType: string | null | undefined): string {
  if (!planType || planType === 'unknown') return ''
  if (planType === 'edu') return 'Education'
  return `${planType.slice(0, 1).toUpperCase()}${planType.slice(1)}`
}

function formatWindowSpan(windowMinutes: number | null): string {
  if (typeof windowMinutes !== 'number' || !Number.isFinite(windowMinutes) || windowMinutes <= 0) return ''
  if (windowMinutes % 1440 === 0) return `${windowMinutes / 1440}d`
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`
  return `${windowMinutes}m`
}

function formatResetTime(resetsAt: number | null): string {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return ''
  const resetMs = resetsAt * 1000
  const diffMs = resetMs - Date.now()
  if (diffMs <= 0) return 'resetting now'

  const totalMinutes = Math.round(diffMs / 60000)
  if (totalMinutes < 60) return `resets in ${Math.max(1, totalMinutes)}m`

  const totalHours = Math.round(totalMinutes / 60)
  if (totalHours < 48) return `resets in ${Math.max(1, totalHours)}h`

  const totalDays = Math.round(totalHours / 24)
  return `resets in ${Math.max(1, totalDays)}d`
}

function formatResetDate(resetsAt: number | null): string {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return ''
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(resetsAt * 1000))
}

function formatResetDateCompact(resetsAt: number | null): string {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return ''
  const date = new Date(resetsAt * 1000)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function pickWeeklyQuotaWindow(quota: UiRateLimitSnapshot): UiRateLimitWindow | null {
  const windows = [quota.primary, quota.secondary].filter((window): window is UiRateLimitWindow => window !== null)
  const exactWeekly = windows.find((window) => window.windowMinutes === 7 * 24 * 60)
  if (exactWeekly) return exactWeekly

  const longerWindows = windows
    .filter((window) => typeof window.windowMinutes === 'number' && window.windowMinutes >= 7 * 24 * 60)
    .sort((first, second) => (first.windowMinutes ?? 0) - (second.windowMinutes ?? 0))

  if (longerWindows[0]) return longerWindows[0]
  return quota.secondary ?? null
}

function formatWindowSummary(window: UiRateLimitWindow): string {
  const remainingPercent = Math.max(0, Math.min(100, 100 - Math.round(window.usedPercent)))
  const span = formatWindowSpan(window.windowMinutes)
  return span ? `${remainingPercent}% / ${span}` : `${remainingPercent}%`
}

function buildQuotaSummaryText(quota: UiRateLimitSnapshot | null): string {
  if (!quota) return ''

  const segments: string[] = []
  const plan = formatPlanType(quota.planType)
  if (plan) segments.push(plan)
  if (quota.primary) segments.push(formatWindowSummary(quota.primary))
  if (quota.secondary) segments.push(formatWindowSummary(quota.secondary))

  const weeklyWindow = pickWeeklyQuotaWindow(quota)
  const weeklyRefreshDate = formatResetDateCompact(weeklyWindow?.resetsAt ?? null)
  if (weeklyRefreshDate) {
    segments.push(weeklyRefreshDate)
  }

  if (segments.length === 0 && quota.credits?.unlimited) {
    segments.push('Unlimited credits')
  } else if (segments.length === 0 && quota.credits?.hasCredits && quota.credits.balance) {
    segments.push(`${quota.credits.balance} credits`)
  }

  return segments.join(' · ')
}

function buildQuotaTooltipText(quota: UiRateLimitSnapshot | null): string {
  if (!quota) return ''

  const lines: string[] = []
  const plan = formatPlanType(quota.planType)
  if (plan) {
    lines.push(`Plan: ${plan}`)
  }

  if (quota.primary) {
    const reset = formatResetTime(quota.primary.resetsAt)
    lines.push(`Primary window: ${formatWindowSummary(quota.primary)}${reset ? `, ${reset}` : ''}`)
  }

  if (quota.secondary) {
    const reset = formatResetTime(quota.secondary.resetsAt)
    lines.push(`Secondary window: ${formatWindowSummary(quota.secondary)}${reset ? `, ${reset}` : ''}`)
  }

  if (quota.credits?.unlimited) {
    lines.push('Credits: unlimited')
  } else if (quota.credits?.hasCredits && quota.credits.balance) {
    lines.push(`Credits: ${quota.credits.balance}`)
  }

  const weeklyWindow = pickWeeklyQuotaWindow(quota)
  if (weeklyWindow) {
    const weeklyRefreshDate = formatResetDate(weeklyWindow.resetsAt)
    if (weeklyRefreshDate) {
      lines.push(`Weekly refresh: ${weeklyRefreshDate}`)
    }
  }

  return lines.join('\n')
}

function buildQuotaWeeklyRefreshText(quota: UiRateLimitSnapshot | null): string {
  if (!quota) return ''
  const weeklyWindow = pickWeeklyQuotaWindow(quota)
  if (!weeklyWindow) return ''
  const weeklyRefreshDate = formatResetDate(weeklyWindow.resetsAt)
  return weeklyRefreshDate ? `Weekly refresh ${weeklyRefreshDate}` : ''
}

function formatCompactTokenCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const absValue = Math.abs(value)
  if (absValue >= 1_000_000) {
    const compact = absValue >= 10_000_000 ? (value / 1_000_000).toFixed(0) : (value / 1_000_000).toFixed(1)
    return `${compact.replace(/\.0$/, '')}M`
  }
  if (absValue >= 1_000) {
    const compact = absValue >= 100_000 ? (value / 1_000).toFixed(0) : (value / 1_000).toFixed(1)
    return `${compact.replace(/\.0$/, '')}k`
  }
  return String(Math.round(value))
}

function formatBreakdownSummary(breakdown: UiTokenUsageBreakdown): string {
  const nonCachedInput = Math.max(0, breakdown.inputTokens - breakdown.cachedInputTokens)
  const parts = [
    `${formatCompactTokenCount(breakdown.totalTokens)} total`,
    `${formatCompactTokenCount(nonCachedInput)} input`,
  ]
  if (breakdown.cachedInputTokens > 0) {
    parts.push(`${formatCompactTokenCount(breakdown.cachedInputTokens)} cached`)
  }
  if (breakdown.outputTokens > 0) {
    parts.push(`${formatCompactTokenCount(breakdown.outputTokens)} output`)
  }
  if (breakdown.reasoningOutputTokens > 0) {
    parts.push(`${formatCompactTokenCount(breakdown.reasoningOutputTokens)} reasoning`)
  }
  return parts.join(' · ')
}

function calculateContextPercentRemaining(tokensInContext: number, contextWindow: number): number {
  // Mirror official Codex normalization so the first prompt does not look artificially "used".
  if (!Number.isFinite(tokensInContext) || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return 0
  }
  if (contextWindow <= CONTEXT_WINDOW_BASELINE_TOKENS) {
    const remaining = Math.max(0, contextWindow - Math.max(0, tokensInContext))
    return Math.max(0, Math.min(100, Math.round((remaining / contextWindow) * 100)))
  }
  const effectiveWindow = contextWindow - CONTEXT_WINDOW_BASELINE_TOKENS
  const used = Math.max(0, tokensInContext - CONTEXT_WINDOW_BASELINE_TOKENS)
  const remaining = Math.max(0, effectiveWindow - used)
  return Math.max(0, Math.min(100, Math.round((remaining / effectiveWindow) * 100)))
}

function buildContextUsageView(
  usage: UiThreadTokenUsage | null,
): {
    summaryText: string
    tooltipText: string
    percentRemaining: number
    tone: 'healthy' | 'warning' | 'danger'
  } | null {
  if (!usage) return null

  const contextWindow = usage.modelContextWindow ?? null
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0) return null

  const tokensInContext = Math.max(0, usage.last.totalTokens)
  const percentRemaining = calculateContextPercentRemaining(tokensInContext, contextWindow)
  const percentUsed = Math.max(0, Math.min(100, 100 - percentRemaining))
  const tone: 'healthy' | 'warning' | 'danger' = percentRemaining <= 15
    ? 'danger'
    : percentRemaining <= 35
      ? 'warning'
      : 'healthy'

  return {
    summaryText: `${percentRemaining}% · ${formatCompactTokenCount(tokensInContext)} / ${formatCompactTokenCount(contextWindow)}`,
    tooltipText: [
      `Context window: ${percentRemaining}% left (${percentUsed}% used)`,
      `In context: ${tokensInContext.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`,
      `Last turn: ${formatBreakdownSummary(usage.last)}`,
      `Session total: ${formatBreakdownSummary(usage.total)}`,
    ].join('\n'),
    percentRemaining,
    tone,
  }
}

function onSubmit(mode: 'steer' | 'queue' = 'steer'): void {
  const text = draft.value.trim()
  if (!canSubmit.value) return
  emit('submit', {
    text,
    imageUrls: selectedImages.value.map((image) => image.url),
    fileAttachments: [...fileAttachments.value],
    skills: selectedSkills.value.map((s) => ({ name: s.name, path: s.path })),
    mode,
  })
  clearPersistedDraftForThread(props.activeThreadId)
  clearDraftState()
  folderUploadGroups.value = []
  isAttachMenuOpen.value = false
  closeFileMention()
  if (isAndroid || isMobile.value) {
    inputRef.value?.blur()
    return
  }
  nextTick(() => inputRef.value?.focus())
}

function setActiveInProgressMode(mode: 'steer' | 'queue'): void {
  activeInProgressMode.value = mode
}

function replaceDraftState(payload: ComposerDraftPayload): void {
  draftGeneration.value += 1
  draft.value = payload.text
  selectedImages.value = payload.imageUrls.map((url, index) => ({
    id: `queued-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Image ${index + 1}`,
    url,
  }))
  selectedSkills.value = payload.skills.map((skill) => (
    (props.skills ?? []).find((item) => item.path === skill.path)
    ?? { name: skill.name, displayName: undefined, description: '', path: skill.path }
  ))
  fileAttachments.value = payload.fileAttachments.map((attachment) => ({ ...attachment }))
  folderUploadGroups.value = []
  dictationFeedback.value = ''
  attachmentBatchStats.value = null
  pendingAttachmentCount.value = 0
  isAttachMenuOpen.value = false
  closeFileMention()
  attachmentSessionToken += 1
}

function clearDraftState(): void {
  replaceDraftState({
    text: '',
    imageUrls: [],
    fileAttachments: [],
    skills: [],
  })
}

function getDraftStorageKey(threadId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${threadId}`
}

function loadPersistedDraftForThread(threadId: string): ComposerDraftPayload | null {
  if (typeof window === 'undefined') return null
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return null
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(normalizedThreadId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ComposerDraftPayload> | string
    if (typeof parsed === 'string') {
      return {
        text: parsed,
        imageUrls: [],
        fileAttachments: [],
        skills: [],
      }
    }
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      imageUrls: Array.isArray(parsed.imageUrls)
        ? parsed.imageUrls.filter((url): url is string => typeof url === 'string')
        : [],
      fileAttachments: Array.isArray(parsed.fileAttachments)
        ? parsed.fileAttachments.filter((attachment): attachment is FileAttachment => (
          Boolean(attachment)
          && typeof attachment.label === 'string'
          && typeof attachment.path === 'string'
          && typeof attachment.fsPath === 'string'
        ))
        : [],
      skills: Array.isArray(parsed.skills)
        ? parsed.skills.filter((skill): skill is { name: string; path: string } => (
          Boolean(skill)
          && typeof skill.name === 'string'
          && typeof skill.path === 'string'
        ))
        : [],
    }
  } catch {
    return null
  }
}

function persistDraftForThread(threadId: string, payload: ComposerDraftPayload): void {
  if (typeof window === 'undefined') return
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return
  try {
    const hasContent = payload.text.trim().length > 0
      || payload.imageUrls.length > 0
      || payload.fileAttachments.length > 0
      || payload.skills.length > 0
    if (hasContent) {
      window.localStorage.setItem(getDraftStorageKey(normalizedThreadId), JSON.stringify(payload))
      return
    }
    window.localStorage.removeItem(getDraftStorageKey(normalizedThreadId))
  } catch {
    // Ignore localStorage failures (quota/private mode).
  }
}

function clearPersistedDraftForThread(threadId: string): void {
  persistDraftForThread(threadId, {
    text: '',
    imageUrls: [],
    fileAttachments: [],
    skills: [],
  })
}

function getCurrentDraftPayload(): ComposerDraftPayload {
  return {
    text: draft.value,
    imageUrls: selectedImages.value.map((image) => image.url),
    fileAttachments: fileAttachments.value.map((attachment) => ({ ...attachment })),
    skills: selectedSkills.value.map((skill) => ({ name: skill.name, path: skill.path })),
  }
}

function onInterrupt(): void {
  emit('interrupt')
}

function onModelSelect(value: string): void {
  emit('update:selected-model', value)
}

function toggleCollaborationMode(): void {
  emit('update:selected-collaboration-mode', isPlanModeSelected.value ? 'default' : 'plan')
}

function onReasoningEffortSelect(value: string): void {
  emit('update:selected-reasoning-effort', value as ReasoningEffort)
}

function onToggleSpeedMode(): void {
  if (isSpeedToggleDisabled.value) return
  emit('update:selected-speed-mode', props.selectedSpeedMode === 'fast' ? 'standard' : 'fast')
}

function onDictationToggle(): void {
  if (!props.dictationClickToToggle) return
  if (dictationFeedback.value) {
    dictationFeedback.value = ''
  }
  toggleRecording()
}

function onDictationPressStart(event: PointerEvent): void {
  if (props.dictationClickToToggle) return
  event.preventDefault()
  if (isHoldPressActive) return
  isHoldPressActive = true
  const target = event.currentTarget as HTMLElement | null
  if (target) {
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // Ignore if pointer cannot be captured in the current environment.
    }
  }
  if (dictationFeedback.value) {
    dictationFeedback.value = ''
  }
  window.addEventListener('pointerup', onDictationPressEnd)
  window.addEventListener('pointercancel', onDictationPressEnd)
  window.addEventListener('blur', onDictationPressEnd)
  void startRecording()
}

function onDictationPressEnd(): void {
  if (props.dictationClickToToggle) return
  if (!isHoldPressActive) return
  isHoldPressActive = false
  window.removeEventListener('pointerup', onDictationPressEnd)
  window.removeEventListener('pointercancel', onDictationPressEnd)
  window.removeEventListener('blur', onDictationPressEnd)
  stopRecording()
}

function toggleAttachMenu(): void {
  if (isInteractionDisabled.value) return
  isAttachMenuOpen.value = !isAttachMenuOpen.value
}

function triggerPhotoLibrary(): void {
  photoLibraryInputRef.value?.click()
}

function triggerCameraCapture(): void {
  cameraCaptureInputRef.value?.click()
}

function triggerFolderPicker(): void {
  folderPickerInputRef.value?.click()
}

function removeImage(id: string): void {
  selectedImages.value = selectedImages.value.filter((image) => image.id !== id)
}

function removeSkill(path: string): void {
  selectedSkills.value = selectedSkills.value.filter((s) => s.path !== path)
}

function skillMarkdownPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/SKILL.md') ? trimmed : `${trimmed.replace(/\/+$/, '')}/SKILL.md`
}

function openSkillMarkdown(skill: SkillItem): void {
  const markdownPath = skillMarkdownPath(skill.path)
  if (!markdownPath || typeof window === 'undefined') return
  window.open(`/codex-local-browse${encodeURI(markdownPath)}`, '_blank', 'noopener,noreferrer')
}

function removeFileAttachment(fsPath: string): void {
  fileAttachments.value = fileAttachments.value.filter((a) => a.fsPath !== fsPath)
}

function removeFolderAttachment(groupId: string): void {
  const group = folderUploadGroups.value.find((item) => item.id === groupId)
  if (!group) return
  const toRemove = new Set(group.filePaths)
  fileAttachments.value = fileAttachments.value.filter((a) => !toRemove.has(a.fsPath))
  folderUploadGroups.value = folderUploadGroups.value.filter((item) => item.id !== groupId)
}

function getFolderUploadPercent(group: FolderUploadGroup): number {
  if (group.total <= 0) return 0
  return Math.round((group.processed / group.total) * 100)
}

function addFileAttachment(filePath: string, customLabel?: string): void {
  const normalized = filePath.replace(/\\/g, '/')
  if (fileAttachments.value.some((a) => a.fsPath === normalized)) return
  const parts = normalized.split('/').filter(Boolean)
  const label = customLabel?.trim() || parts[parts.length - 1] || normalized
  fileAttachments.value = [...fileAttachments.value, { label, path: normalized, fsPath: normalized }]
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp)$/i.test(file.name)
}

function normalizeSelectedFiles(files: FileList | File[] | null | undefined): File[] {
  if (!files) return []
  return Array.from(files)
}

function formatAttachmentFileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

function beginAttachmentWork(sessionToken: number): boolean {
  if (sessionToken !== attachmentSessionToken) return false
  pendingAttachmentCount.value += 1
  return true
}

function finishAttachmentWork(sessionToken: number): void {
  if (sessionToken !== attachmentSessionToken) return
  pendingAttachmentCount.value = Math.max(0, pendingAttachmentCount.value - 1)
}

function beginAttachmentBatch(total: number): void {
  if (total <= 0) return
  const current = attachmentBatchStats.value
  const completed = current ? current.succeeded + current.failed : 0
  if (!current || completed >= current.total) {
    attachmentBatchStats.value = { total, succeeded: 0, failed: 0 }
    return
  }
  attachmentBatchStats.value = {
    ...current,
    total: current.total + total,
  }
}

function recordAttachmentBatchResult(result: 'success' | 'failure'): void {
  const current = attachmentBatchStats.value
  if (!current) return
  attachmentBatchStats.value = {
    ...current,
    succeeded: current.succeeded + (result === 'success' ? 1 : 0),
    failed: current.failed + (result === 'failure' ? 1 : 0),
  }
}

function createAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createPastedImageName(file: File): string {
  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('-')
  const ext = file.type.startsWith('image/')
    ? file.type.slice('image/'.length).replace(/[^a-z0-9]+/gi, '') || 'png'
    : 'png'
  return `pasted-image-${timestamp}.${ext}`
}

function createPastedTextFileName(): string {
  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('-')
  return `pasted-text-${timestamp}.txt`
}

function ensureFileName(file: File): File {
  if (file.name.trim()) return file
  return new File([file], createPastedImageName(file), {
    type: file.type || 'image/png',
    lastModified: Date.now(),
  })
}

async function attachImageFile(file: File, sessionToken: number): Promise<void> {
  if (!beginAttachmentWork(sessionToken)) return
  try {
    const normalizedFile = ensureFileName(file)
    const serverPath = await uploadFile(normalizedFile)
    if (sessionToken !== attachmentSessionToken) return
    if (!serverPath) {
      recordAttachmentBatchResult('failure')
      return
    }
    selectedImages.value = [
      ...selectedImages.value,
      {
        id: createAttachmentId(),
        name: normalizedFile.name,
        url: `/codex-local-image?path=${encodeURIComponent(serverPath)}`,
      },
    ]
    recordAttachmentBatchResult('success')
  } catch {
    if (sessionToken === attachmentSessionToken) {
      recordAttachmentBatchResult('failure')
    }
  } finally {
    finishAttachmentWork(sessionToken)
  }
}

async function attachUploadedFile(file: File, sessionToken: number): Promise<void> {
  if (!beginAttachmentWork(sessionToken)) return
  try {
    const serverPath = await uploadFile(file)
    if (sessionToken !== attachmentSessionToken) return
    if (!serverPath) {
      recordAttachmentBatchResult('failure')
      return
    }
    addFileAttachment(serverPath)
    recordAttachmentBatchResult('success')
  } catch {
    if (sessionToken === attachmentSessionToken) {
      recordAttachmentBatchResult('failure')
    }
  } finally {
    finishAttachmentWork(sessionToken)
  }
}

function attachIncomingFiles(files: FileList | File[] | null | undefined): void {
  const normalizedFiles = normalizeSelectedFiles(files)
  if (normalizedFiles.length === 0) return
  beginAttachmentBatch(normalizedFiles.length)
  isAttachMenuOpen.value = false
  closeFileMention()
  const sessionToken = attachmentSessionToken
  for (const file of normalizedFiles) {
    if (isImageFile(file)) {
      void attachImageFile(file, sessionToken)
    } else {
      void attachUploadedFile(file, sessionToken)
    }
  }
}

function resetDragState(): void {
  dragDepth = 0
  isDragActive.value = false
}

function hasFilePayload(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types ?? []).includes('Files')
}

async function addFolderFiles(files: FileList | null): Promise<void> {
  if (!files || files.length === 0) return
  const generation = draftGeneration.value
  const rows = Array.from(files)
  const firstRelativePath = (rows[0] as File & { webkitRelativePath?: string }).webkitRelativePath || rows[0].name
  const folderName = firstRelativePath.split('/').filter(Boolean)[0] || 'Folder'
  const groupId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  folderUploadGroups.value = [
    ...folderUploadGroups.value,
    {
      id: groupId,
      name: folderName,
      total: rows.length,
      processed: 0,
      filePaths: [],
      isUploading: true,
    },
  ]

  const updateGroup = (updater: (group: FolderUploadGroup) => FolderUploadGroup): void => {
    if (generation !== draftGeneration.value) return
    folderUploadGroups.value = folderUploadGroups.value.map((group) => (
      group.id === groupId ? updater(group) : group
    ))
  }

  for (const file of rows) {
    try {
      const serverPath = await uploadFile(file)
      if (generation !== draftGeneration.value) return
      if (serverPath) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        addFileAttachment(serverPath, relativePath)
        updateGroup((group) => ({
          ...group,
          processed: group.processed + 1,
          filePaths: [...group.filePaths, serverPath],
        }))
        continue
      }
      updateGroup((group) => ({ ...group, processed: group.processed + 1 }))
    } catch {
      updateGroup((group) => ({ ...group, processed: group.processed + 1 }))
    }
  }

  updateGroup((group) => ({ ...group, isUploading: false }))
}

function clearInputValue(inputRefEl: HTMLInputElement | null): void {
  if (inputRefEl) inputRefEl.value = ''
}

function onPhotoLibraryChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  attachIncomingFiles(input?.files ?? null)
  clearInputValue(input)
  isAttachMenuOpen.value = false
}

function onCameraCaptureChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  attachIncomingFiles(input?.files ?? null)
  clearInputValue(input)
  isAttachMenuOpen.value = false
}

function onFolderPickerChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  void addFolderFiles(input?.files ?? null)
  clearInputValue(input)
  isAttachMenuOpen.value = false
}

function onInputDragEnter(event: DragEvent): void {
  if (isInteractionDisabled.value || !hasFilePayload(event.dataTransfer)) return
  event.preventDefault()
  dragDepth += 1
  isDragActive.value = true
}

function onInputDragOver(event: DragEvent): void {
  if (isInteractionDisabled.value || !hasFilePayload(event.dataTransfer)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
  isDragActive.value = true
}

function onInputDragLeave(event: DragEvent): void {
  if (!isDragActive.value) return
  event.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    resetDragState()
  }
}

function onInputDrop(event: DragEvent): void {
  if (isInteractionDisabled.value || !hasFilePayload(event.dataTransfer)) return
  event.preventDefault()
  resetDragState()
  attachIncomingFiles(event.dataTransfer?.files ?? null)
}

function onWindowDragCleanup(): void {
  if (!isDragActive.value && dragDepth === 0) return
  resetDragState()
}

function onInputPaste(event: ClipboardEvent): void {
  if (isInteractionDisabled.value) return
  const plainText = event.clipboardData?.getData('text/plain') ?? ''
  if (plainText.length >= PASTED_TEXT_FILE_THRESHOLD) {
    event.preventDefault()
    const textFile = new File([plainText], createPastedTextFileName(), {
      type: 'text/plain',
      lastModified: Date.now(),
    })
    attachIncomingFiles([textFile])
    return
  }
  const items = Array.from(event.clipboardData?.items ?? [])
  if (items.length === 0) return
  const hasPlainText = plainText.length > 0
  const imageFiles = items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File)
  if (imageFiles.length === 0) return
  if (!hasPlainText) {
    event.preventDefault()
  }
  attachIncomingFiles(imageFiles)
}

function onInputChange(): void {
  if (dictationFeedback.value) {
    dictationFeedback.value = ''
  }
  updateFileMentionState()
}

function onInputKeydown(event: KeyboardEvent): void {
  if (isFileMentionOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeFileMention()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (fileMentionSuggestions.value.length > 0) {
        fileMentionHighlightedIndex.value =
          (fileMentionHighlightedIndex.value + 1) % fileMentionSuggestions.value.length
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (fileMentionSuggestions.value.length > 0) {
        const size = fileMentionSuggestions.value.length
        fileMentionHighlightedIndex.value = (fileMentionHighlightedIndex.value + size - 1) % size
      }
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const selected = fileMentionSuggestions.value[fileMentionHighlightedIndex.value]
      if (selected) {
        applyFileMention(selected)
      } else {
        closeFileMention()
      }
      return
    }
  }

  const shouldSend = props.sendWithEnter !== false
    ? event.key === 'Enter' && !event.shiftKey
    : event.key === 'Enter' && (event.metaKey || event.ctrlKey)
  if (shouldSend) {
    event.preventDefault()
    onSubmit(props.isTurnInProgress ? activeInProgressMode.value : 'steer')
    return
  }
}

function closeFileMention(): void {
  isFileMentionOpen.value = false
  mentionStartIndex.value = null
  mentionQuery.value = ''
  fileMentionSuggestions.value = []
  fileMentionHighlightedIndex.value = 0
}

function updateFileMentionState(): void {
  const input = inputRef.value
  if (!input) {
    closeFileMention()
    return
  }
  const cursor = input.selectionStart ?? draft.value.length
  const beforeCursor = draft.value.slice(0, cursor)
  const match = beforeCursor.match(/(^|\s)(@[^\s@]*)$/)
  if (!match) {
    closeFileMention()
    return
  }

  const mentionToken = match[2] ?? ''
  const mentionOffset = mentionToken.length
  const startIndex = cursor - mentionOffset
  mentionStartIndex.value = startIndex
  mentionQuery.value = mentionToken.slice(1)
  isFileMentionOpen.value = true
  void queueFileMentionSearch()
}

async function queueFileMentionSearch(): Promise<void> {
  if (!isFileMentionOpen.value) return
  const cwd = (props.cwd ?? '').trim()
  if (!cwd) {
    fileMentionSuggestions.value = []
    return
  }
  if (fileMentionDebounceTimer) {
    clearTimeout(fileMentionDebounceTimer)
  }
  const token = ++fileMentionSearchToken
  fileMentionDebounceTimer = setTimeout(async () => {
    try {
      const rows = await searchComposerFiles(cwd, mentionQuery.value, 20)
      if (!isFileMentionOpen.value || token !== fileMentionSearchToken) return
      fileMentionSuggestions.value = rows
      fileMentionHighlightedIndex.value = 0
    } catch {
      if (!isFileMentionOpen.value || token !== fileMentionSearchToken) return
      fileMentionSuggestions.value = []
    }
  }, 120)
}

function applyFileMention(suggestion: ComposerFileSuggestion): void {
  const input = inputRef.value
  const start = mentionStartIndex.value
  if (start !== null && input) {
    const cursor = input.selectionStart ?? draft.value.length
    draft.value = `${draft.value.slice(0, start)}${draft.value.slice(cursor)}`.trimEnd()
  }
  addFileAttachment(suggestion.path)
  closeFileMention()
  nextTick(() => input?.focus())
}

function hydrateDraft(payload: ComposerDraftPayload): void {
  cancelDictation()
  replaceDraftState(payload)
  nextTick(() => inputRef.value?.focus())
}

function appendTextToDraft(text: string): void {
  const nextText = text.trim()
  if (!nextText) return
  cancelDictation()
  if (draft.value.trim().length > 0) {
    draft.value = `${draft.value.trimEnd()}\n${nextText}`
  } else {
    draft.value = nextText
  }
  nextTick(() => inputRef.value?.focus())
}

async function reloadPrompts(): Promise<void> {
  savedPrompts.value = await getComposerPrompts()
}

function promptOptionValue(path: string): string {
  return `${PROMPT_OPTION_PREFIX}${path}`
}

function promptPathFromOptionValue(value: string): string | null {
  return value.startsWith(PROMPT_OPTION_PREFIX) ? value.slice(PROMPT_OPTION_PREFIX.length) : null
}

async function onCreatePrompt(): Promise<void> {
  const name = window.prompt(t('Prompt name'))?.trim() ?? ''
  if (!name) return
  const content = window.prompt(t('Prompt content')) ?? ''
  if (!content.trim()) return
  const created = await createComposerPrompt(name, content)
  if (!created) return
  await reloadPrompts()
  appendTextToDraft(created.content)
}

async function onRemovePrompt(path: string): Promise<void> {
  const promptPath = promptPathFromOptionValue(path) ?? path
  const target = savedPrompts.value.find((prompt) => prompt.path === promptPath)
  const confirmed = window.confirm(target ? `${t('Remove prompt')} "${target.name}"?` : t('Remove prompt'))
  if (!confirmed) return
  const removed = await removeComposerPrompt(promptPath)
  if (!removed) return
  await reloadPrompts()
}

function onPromptDropdownToggle(path: string): void {
  const prompt = savedPrompts.value.find((entry) => entry.path === path)
  if (!prompt) return
  appendTextToDraft(prompt.content)
}

function getMentionFileName(path: string): string {
  const idx = path.lastIndexOf('/')
  if (idx < 0) return path
  return path.slice(idx + 1)
}

function getMentionDirName(path: string): string {
  const idx = path.lastIndexOf('/')
  if (idx <= 0) return ''
  return path.slice(0, idx)
}

function getFileExtension(path: string): string {
  const base = getMentionFileName(path)
  const idx = base.lastIndexOf('.')
  if (idx <= 0) return ''
  return base.slice(idx + 1).toLowerCase()
}

function getMentionBadgeText(path: string): string {
  const ext = getFileExtension(path)
  if (ext === 'ts') return 'TS'
  if (ext === 'tsx') return 'TSX'
  if (ext === 'js') return 'JS'
  if (ext === 'jsx') return 'JSX'
  if (ext === 'json') return '{}'
  return ''
}

function getMentionBadgeClass(path: string): string {
  const ext = getFileExtension(path)
  if (ext.startsWith('ts')) return 'ts'
  if (ext.startsWith('js')) return 'js'
  if (ext === 'json') return 'json'
  return 'default'
}

function isMarkdownFile(path: string): boolean {
  const ext = getFileExtension(path)
  return ext === 'md' || ext === 'mdx'
}

function skillSourceBadge(skill: SkillItem): SkillSourceBadge {
  const path = skill.path.toLowerCase()
  if (path.includes('/plugins/cache/')) {
    return { badge: 'P', badgeLabel: 'Plugin', badgeTone: 'plugin' }
  }
  if (skill.scope === 'repo') {
    return { badge: 'R', badgeLabel: 'Repo', badgeTone: 'repo' }
  }
  if (skill.scope === 'system') {
    return { badge: 'S', badgeLabel: 'System', badgeTone: 'system' }
  }
  return { badge: 'U', badgeLabel: 'User', badgeTone: 'user' }
}

function onSkillDropdownToggle(path: string, checked: boolean): void {
  const promptPath = promptPathFromOptionValue(path)
  if (promptPath) {
    onPromptDropdownToggle(promptPath)
    return
  }

  if (checked) {
    const skill = (props.skills ?? []).find((s) => s.path === path)
    if (skill && !selectedSkills.value.some((s) => s.path === path)) {
      selectedSkills.value = [...selectedSkills.value, skill]
    }
  } else {
    selectedSkills.value = selectedSkills.value.filter((s) => s.path !== path)
  }
}

function onDocumentClick(event: MouseEvent): void {
  if (!isAttachMenuOpen.value) return
  const root = attachMenuRootRef.value
  if (!root) return
  const target = event.target as Node | null
  if (!target || root.contains(target)) return
  isAttachMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('drop', onWindowDragCleanup)
  window.addEventListener('dragend', onWindowDragCleanup)
  window.addEventListener('blur', onWindowDragCleanup)
  void reloadPrompts()
})

defineExpose<ThreadComposerExposed>({
  hydrateDraft,
  appendTextToDraft,
  hasUnsavedDraft: () => hasUnsavedDraft.value,
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('drop', onWindowDragCleanup)
  window.removeEventListener('dragend', onWindowDragCleanup)
  window.removeEventListener('blur', onWindowDragCleanup)
  window.removeEventListener('pointerup', onDictationPressEnd)
  window.removeEventListener('pointercancel', onDictationPressEnd)
  window.removeEventListener('blur', onDictationPressEnd)
  if (fileMentionDebounceTimer) {
    clearTimeout(fileMentionDebounceTimer)
  }
})

watch(
  () => props.activeThreadId,
  (nextThreadId) => {
    cancelDictation()
    if (lastActiveThreadId) {
      persistDraftForThread(lastActiveThreadId, getCurrentDraftPayload())
    }
    clearDraftState()
    const restored = loadPersistedDraftForThread(nextThreadId)
    if (restored) {
      replaceDraftState(restored)
      onInputChange()
    }
    lastActiveThreadId = nextThreadId.trim()
  },
  { immediate: true },
)

watch([draft, selectedImages, fileAttachments, selectedSkills], () => {
  if (!lastActiveThreadId) return
  persistDraftForThread(lastActiveThreadId, getCurrentDraftPayload())
}, { deep: true })

watch(
  () => props.cwd,
  () => {
    if (isFileMentionOpen.value) {
      void queueFileMentionSearch()
    }
  },
)

watch(
  inProgressMode,
  (nextMode) => {
    activeInProgressMode.value = nextMode
  },
)


</script>

<style scoped>
@reference "tailwindcss";

.thread-composer {
  @apply w-full max-w-[min(var(--chat-column-max,72rem),100%)] mx-auto;
}

.thread-composer-shell {
  @apply relative rounded-2xl border border-zinc-300 bg-white p-2 sm:p-3 shadow-sm;
}

.thread-composer-shell--drag-active {
  @apply border-zinc-900 shadow-md;
}

.thread-composer-shell--no-top-radius {
  @apply rounded-t-none border-t-0;
}

.thread-composer-attachments {
  @apply mb-2 flex flex-wrap gap-2;
}

.thread-composer-attachment {
  @apply relative h-14 w-14 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50;
}

.thread-composer-attachment-image {
  @apply h-full w-full object-cover;
}

.thread-composer-attachment-remove {
  @apply absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border-0 bg-black/70 text-xs leading-none text-white;
}

.thread-composer-file-chips {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.thread-composer-folder-chips {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.thread-composer-folder-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800;
}

.thread-composer-folder-chip-icon {
  @apply h-3.5 w-3.5 text-amber-600 shrink-0;
}

.thread-composer-folder-chip-name {
  @apply truncate max-w-40 font-medium;
}

.thread-composer-folder-chip-meta {
  @apply text-amber-700/90;
}

.thread-composer-folder-chip-remove {
  @apply ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-0 bg-transparent text-amber-600 transition hover:bg-amber-200 hover:text-amber-800 text-xs leading-none p-0;
}

.thread-composer-file-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700;
}

.thread-composer-file-chip-icon {
  @apply h-3.5 w-3.5 text-zinc-400 shrink-0;
}

.thread-composer-file-chip-name {
  @apply truncate max-w-40 font-mono;
}

.thread-composer-file-chip-remove {
  @apply ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-0 bg-transparent text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 text-xs leading-none p-0;
}

.thread-composer-skill-chips {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.thread-composer-skill-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700;
}

.thread-composer-skill-chip-name {
  @apply min-w-0 max-w-[12rem] truncate border-0 bg-transparent p-0 text-left font-medium text-inherit underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500;
}

.thread-composer-skill-chip-remove {
  @apply ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-0 bg-transparent text-emerald-500 transition hover:bg-emerald-200 hover:text-emerald-700 text-xs leading-none p-0;
}

.thread-composer-rate-limit {
  @apply mb-1.5 px-1 text-[11px] leading-5 text-zinc-500;
}

.thread-composer-rate-limit-row {
  @apply flex min-w-0 items-center gap-x-1.5 gap-y-1;
}

.thread-composer-rate-limit-value {
  @apply min-w-0 flex-1 truncate;
}

.thread-composer-context-usage-inline {
  --context-usage-accent: rgb(34 197 94);
  @apply ml-auto inline-flex min-w-0 max-w-[56%] items-center gap-2 text-right;
}

.thread-composer-context-usage-inline.is-warning {
  --context-usage-accent: rgb(245 158 11);
}

.thread-composer-context-usage-inline.is-danger {
  --context-usage-accent: rgb(239 68 68);
}

.thread-composer-context-usage-inline-value {
  @apply min-w-0 truncate font-medium tabular-nums;
  color: var(--context-usage-accent);
}

.thread-composer-context-usage-inline-bar {
  @apply block h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-zinc-200/80;
}

.thread-composer-context-usage-inline-bar-fill {
  @apply block h-full rounded-full transition-[width] duration-200 ease-out;
  background: var(--context-usage-accent);
}

.thread-composer-input-wrap {
  @apply relative;
}

.thread-composer-input-wrap--drag-active {
  @apply rounded-xl bg-zinc-50;
}

.thread-composer-drop-overlay {
  @apply pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border border-dashed border-zinc-900 bg-white/90;
}

.thread-composer-drop-overlay-copy {
  @apply rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white shadow-sm;
}

.thread-composer-file-mentions {
  @apply absolute left-0 right-0 bottom-[calc(100%+8px)] z-40 max-h-52 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.thread-composer-file-mention-row {
  @apply flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-100;
}

.thread-composer-file-mention-row.is-active {
  @apply bg-zinc-100;
}

.thread-composer-file-mention-icon-badge {
  @apply inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[9px] font-semibold leading-none;
}

.thread-composer-file-mention-icon-badge.is-ts {
  @apply bg-zinc-700 text-white;
}

.thread-composer-file-mention-icon-badge.is-js {
  @apply bg-zinc-600 text-white;
}

.thread-composer-file-mention-icon-badge.is-json {
  @apply bg-zinc-600 text-white;
}

.thread-composer-file-mention-icon-markdown {
  @apply inline-flex h-5 min-w-5 items-center justify-center text-sm leading-none text-zinc-700;
}

.thread-composer-file-mention-icon-file {
  @apply h-4 w-4 text-zinc-600;
}

.thread-composer-file-mention-text {
  @apply min-w-0 flex items-baseline gap-2;
}

.thread-composer-file-mention-name {
  @apply truncate text-zinc-900;
}

.thread-composer-file-mention-dir {
  @apply truncate text-zinc-400;
}

.thread-composer-file-mention-empty {
  @apply px-2 py-1.5 text-xs text-zinc-500;
}

.thread-composer-input {
  @apply w-full min-w-0 min-h-10 sm:min-h-11 max-h-40 rounded-xl border-0 bg-transparent px-1 py-2 text-sm text-zinc-900 outline-none transition resize-none overflow-y-auto;
}

.thread-composer-input:focus {
  @apply ring-0;
}

.thread-composer-input:disabled {
  @apply bg-zinc-100 text-zinc-500 cursor-not-allowed;
}

.thread-composer-controls {
  @apply relative mt-2 sm:mt-3 flex items-center gap-2 sm:gap-4 overflow-visible pb-px;
}

.thread-composer-controls--recording {
  @apply gap-1 sm:gap-2;
}

.thread-composer-attach {
  @apply relative shrink-0;
}

.thread-composer-attach-trigger {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border-0 bg-transparent pb-px text-xl leading-tight text-zinc-700 transition hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.thread-composer-attach-menu {
  @apply absolute bottom-11 left-0 z-20 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.thread-composer-attach-item {
  @apply block w-full rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.thread-composer-attach-separator {
  @apply my-1 h-px bg-zinc-100;
}

.thread-composer-attach-mode {
  @apply px-3 py-2 flex items-center justify-between gap-2;
}

.thread-composer-attach-mode-label {
  @apply text-sm text-zinc-800;
}

.thread-composer-attach-mode-buttons {
  @apply inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5;
}

.thread-composer-attach-mode-button {
  @apply rounded-full border-0 bg-transparent px-2 py-1 text-xs text-zinc-600 transition hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.thread-composer-attach-mode-button.is-active {
  @apply bg-zinc-900 text-white hover:text-white;
}

.thread-composer-attach-setting {
  @apply flex w-full items-center justify-between gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-left transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400;
}

.thread-composer-attach-setting-copy {
  @apply min-w-0 flex flex-col;
}

.thread-composer-attach-setting-label {
  @apply text-sm text-zinc-800;
}

.thread-composer-attach-setting-description {
  @apply mt-0.5 text-xs text-zinc-500;
}

.thread-composer-attach-switch {
  @apply relative h-5 w-9 shrink-0 rounded-full bg-zinc-300 transition-colors;
}

.thread-composer-attach-switch::after {
  content: '';
  @apply absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform shadow-sm;
}

.thread-composer-attach-switch.is-on {
  @apply bg-emerald-600;
}

.thread-composer-attach-switch.is-on::after {
  transform: translateX(16px);
}

.thread-composer-attach-switch.is-busy {
  @apply opacity-70;
}

.thread-composer-attach-switch.is-disabled {
  @apply opacity-50;
}

.thread-composer-control {
  @apply shrink-1 min-w-0;
}

.thread-composer-control :deep(.composer-dropdown-value) {
  @apply truncate;
}


.thread-composer-actions {
  @apply ml-auto flex min-w-0 items-center gap-2;
}

.thread-composer-actions--recording {
  @apply ml-0 flex-1;
}

.thread-composer-mic {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-100 text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-400;
  touch-action: none;
}

.thread-composer-mic--active {
  @apply bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700;
}

.thread-composer-mic-icon {
  @apply h-5 w-5;
}

.thread-composer-dictation-waveform-wrap {
  @apply min-w-0 flex-1;
}

.thread-composer-dictation-waveform {
  @apply block h-9 w-full text-zinc-500;
}

.thread-composer-dictation-timer {
  @apply shrink-0 text-sm text-zinc-500 tabular-nums;
}

.thread-composer-dictation-error {
  @apply mb-2 px-1 text-xs text-amber-700;
}

.thread-composer-submit {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500;
}

.thread-composer-submit--queue {
  @apply bg-amber-600 hover:bg-amber-700;
}

.thread-composer-submit-icon {
  @apply h-5 w-5;
}

.thread-composer-stop {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500;
}

.thread-composer-stop-icon {
  @apply h-5 w-5;
}

.thread-composer-stop-spinner {
  @apply h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin;
}

.thread-composer-hidden-input {
  @apply hidden;
}
</style>
