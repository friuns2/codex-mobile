<template>
  <Teleport to="body">
    <div v-if="visible" class="sdm-overlay" @click.self="$emit('close')">
      <div class="sdm-panel">
        <div class="sdm-header">
          <div class="sdm-title-area">
            <img
              v-if="skill.avatarUrl"
              class="sdm-avatar"
              :src="skill.avatarUrl"
              :alt="skill.owner"
              loading="lazy"
            />
            <div class="sdm-title-col">
              <div class="sdm-title-row">
                <h3 class="sdm-title">{{ skill.displayName || skill.name }}</h3>
                <span v-if="skill.installed && !effectiveEnabled" class="sdm-badge-disabled">{{ t('Disabled') }}</span>
              </div>
              <span class="sdm-owner">{{ skill.owner }}</span>
            </div>
          </div>
          <button class="sdm-close" type="button" :aria-label="t('Close')" @click="$emit('close')">
            <IconTablerX class="sdm-close-icon" />
          </button>
        </div>

        <div class="sdm-body">
          <p v-if="effectiveDescription" class="sdm-desc">{{ effectiveDescription }}</p>

          <div v-if="isLoadingReadme" class="sdm-readme-loading">{{ t('Loading skill contents...') }}</div>
          <div v-else-if="readmeContent" class="sdm-readme" v-html="renderedReadme"></div>

          <a v-if="skill.url" class="sdm-link" :href="skill.url" target="_blank" rel="noopener noreferrer">{{ t('View on GitHub') }}</a>
        </div>

        <div class="sdm-footer">
          <div class="sdm-footer-actions">
            <button
              v-if="skill.installed"
              class="sdm-btn sdm-btn-danger"
              type="button"
              :disabled="isActing"
              @click="onUninstall"
            >
              {{ props.isUninstalling ? t('Uninstalling...') : t('Uninstall') }}
            </button>
            <button
              v-else
              class="sdm-btn sdm-btn-primary"
              type="button"
              :disabled="isActing"
              @click="onInstall"
            >
              {{ props.isInstalling ? t('Installing...') : t('Install') }}
            </button>

            <button
              v-if="skill.installed"
              class="sdm-btn sdm-btn-secondary"
              type="button"
              :disabled="isActing"
              @click="onToggleEnabled"
            >
              {{ effectiveEnabled ? t('Disable') : t('Enable') }}
            </button>

            <button
              v-if="skill.installed && effectiveEnabled"
              class="sdm-btn sdm-btn-primary"
              type="button"
              :disabled="isActing || props.isTrying"
              @click="onTry"
            >
              {{ props.isTrying ? 'Starting...' : 'Try it!' }}
            </button>

            <button
              v-if="skill.installed && skillDirPath"
              class="sdm-btn sdm-btn-secondary"
              type="button"
              @click="onBrowseFiles"
            >
              {{ t('Browse files') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerX from '../icons/IconTablerX.vue'

export type HubSkill = {
  name: string
  owner: string
  description: string
  displayName?: string
  publishedAt?: number
  avatarUrl?: string
  url: string
  installed: boolean
  source?: string
  path?: string
  enabled?: boolean
  installCountLabel?: string
}

const props = defineProps<{
  skill: HubSkill
  visible: boolean
  isInstalling?: boolean
  isUninstalling?: boolean
  isTrying?: boolean
}>()

const emit = defineEmits<{
  close: []
  install: [skill: HubSkill]
  uninstall: [skill: HubSkill]
  'toggle-enabled': [skill: HubSkill, enabled: boolean]
  try: [skill: HubSkill]
}>()

const localEnabled = ref<boolean | null>(null)
const localDescription = ref('')
const readmeContent = ref('')
const isLoadingReadme = ref(false)
const { t } = useUiLanguage()

const effectiveEnabled = computed(() => localEnabled.value ?? props.skill.enabled ?? true)
const isActing = computed(() => (props.isInstalling === true) || (props.isUninstalling === true))
const effectiveDescription = computed(() => localDescription.value || props.skill.description)
const skillDirPath = computed(() => {
  const p = props.skill.path
  if (!p) return ''
  return p.endsWith('/SKILL.md') ? p.slice(0, -'/SKILL.md'.length) : p
})

const renderedReadme = computed(() => {
  const raw = readmeContent.value
  if (!raw) return ''
  const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '')
  return sanitizeHtml(simpleMarkdown(withoutFrontmatter))
})

function simpleMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

async function fetchReadme(): Promise<void> {
  if (!props.skill.owner || !props.skill.name) return
  isLoadingReadme.value = true
  localDescription.value = ''
  readmeContent.value = ''
  try {
    const params = new URLSearchParams({ owner: props.skill.owner, name: props.skill.name })
    if (props.skill.installed) params.set('installed', 'true')
    if (props.skill.path) params.set('path', props.skill.path)
    const resp = await fetch(`/codex-api/skills-hub/readme?${params}`)
    if (!resp.ok) return
    const data = (await resp.json()) as { content?: string; description?: string }
    readmeContent.value = data.content ?? ''
    localDescription.value = data.description ?? ''
  } catch {
    // silently fail
  } finally {
    isLoadingReadme.value = false
  }
}

watch(() => props.visible, (v) => {
  if (v) {
    localEnabled.value = null
    localDescription.value = ''
    readmeContent.value = ''
    void fetchReadme()
  }
})

function onInstall(): void {
  emit('install', props.skill)
}

function onUninstall(): void {
  emit('uninstall', props.skill)
}

function onToggleEnabled(): void {
  const next = !effectiveEnabled.value
  localEnabled.value = next
  emit('toggle-enabled', props.skill, next)
}

function onTry(): void {
  if (props.isTrying) return
  emit('try', props.skill)
}

function onBrowseFiles(): void {
  const dir = skillDirPath.value
  if (!dir) return
  window.open(`/codex-local-browse${encodeURI(dir)}`, '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
@reference "tailwindcss";

.sdm-overlay {
  @apply fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40;
}

.sdm-panel {
  @apply w-full max-w-lg max-h-[90vh] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden;
}

.sdm-header {
  @apply flex items-start justify-between gap-3 p-4 sm:p-5 pb-3 shrink-0;
}

.sdm-title-area {
  @apply flex items-center gap-3 min-w-0;
}

.sdm-avatar {
  @apply w-10 h-10 rounded-full shrink-0 bg-zinc-100;
}

.sdm-title-col {
  @apply flex flex-col gap-0.5 min-w-0;
}

.sdm-title-row {
  @apply flex items-center gap-2 min-w-0;
}

.sdm-title {
  @apply text-lg font-semibold text-zinc-900 m-0 truncate;
}

.sdm-badge-disabled {
  @apply shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 leading-none;
}

.sdm-owner {
  @apply text-xs text-zinc-400;
}

.sdm-close {
  @apply shrink-0 h-7 w-7 rounded-lg border-0 bg-transparent text-zinc-400 flex items-center justify-center transition hover:bg-zinc-100 hover:text-zinc-700;
}

.sdm-close-icon {
  @apply w-4 h-4;
}

.sdm-body {
  @apply p-4 sm:p-5 pt-0 flex flex-col gap-3 overflow-y-auto flex-1 min-h-0;
}

.sdm-desc {
  @apply m-0 text-sm text-zinc-600 leading-relaxed;
}

.sdm-readme-loading {
  @apply text-xs text-zinc-400;
}

.sdm-readme {
  @apply text-xs text-zinc-700 leading-relaxed border-t border-zinc-100 pt-3;
}

.sdm-readme :deep(h2) {
  @apply text-sm font-semibold text-zinc-800 mt-3 mb-1;
}

.sdm-readme :deep(h3) {
  @apply text-xs font-semibold text-zinc-700 mt-2 mb-1;
}

.sdm-readme :deep(h4) {
  @apply text-xs font-medium text-zinc-600 mt-2 mb-0.5;
}

.sdm-readme :deep(code) {
  @apply bg-zinc-100 rounded px-1 py-0.5 text-[11px] font-mono;
}

.sdm-readme :deep(ul) {
  @apply m-0 pl-4 list-disc;
}

.sdm-readme :deep(li) {
  @apply mb-0.5;
}

.sdm-readme :deep(strong) {
  @apply font-semibold;
}

.sdm-link {
  @apply text-xs text-blue-600 hover:text-blue-700 no-underline hover:underline shrink-0;
}

.sdm-footer {
  @apply p-4 sm:p-5 pt-3 border-t border-zinc-100 shrink-0;
}

.sdm-footer-actions {
  @apply flex items-center gap-2;
}

.sdm-btn {
  @apply rounded-lg px-3 py-1.5 text-sm font-medium transition border-0 disabled:opacity-50 disabled:cursor-not-allowed;
}

.sdm-btn-primary {
  @apply bg-zinc-900 text-white hover:bg-black;
}

.sdm-btn-danger {
  @apply bg-rose-600 text-white hover:bg-rose-700;
}

.sdm-btn-secondary {
  @apply bg-zinc-100 text-zinc-700 hover:bg-zinc-200;
}
</style>
