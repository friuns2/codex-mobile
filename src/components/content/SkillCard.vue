<template>
  <button
    class="skill-card"
    type="button"
    :class="{ 'is-disabled': skill.installed && skill.enabled === false }"
    @click="$emit('select', skill)"
  >
    <div class="skill-card-top">
      <img
        v-if="skill.avatarUrl"
        class="skill-card-avatar"
        :src="skill.avatarUrl"
        :alt="skill.owner"
        loading="lazy"
        @error="onAvatarError"
      />
      <div class="skill-card-avatar-fallback" v-else>{{ skill.owner.charAt(0) }}</div>
      <div class="skill-card-info">
        <div class="skill-card-header">
          <span class="skill-card-name">{{ skill.displayName || skill.name }}</span>
          <template v-if="showStatusBadge">
            <span v-if="skill.installed && skill.enabled === false" class="skill-card-badge-disabled">{{ t('Disabled') }}</span>
            <span v-else-if="skill.installed" class="skill-card-badge">{{ t('Installed') }}</span>
          </template>
        </div>
        <span v-if="showOwner" class="skill-card-owner">{{ skill.owner }}</span>
      </div>
      <button
        v-if="showBrowseAction && skill.installed && skillDirPath"
        class="skill-card-browse"
        type="button"
        :title="t('Browse files')"
        @click.stop="onBrowse"
      >
        <IconTablerFolder class="skill-card-browse-icon" />
      </button>
    </div>
    <p v-if="skill.description" class="skill-card-desc">{{ skill.description }}</p>
    <div v-if="metaLabels.length > 0" class="skill-card-meta-row">
      <span v-for="label in metaLabels" :key="label" class="skill-card-meta">{{ label }}</span>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import { appPath } from '../../basePath'

const props = withDefaults(defineProps<{
  skill: {
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
  showStatusBadge?: boolean
  showBrowseAction?: boolean
  showOwner?: boolean
}>(), {
  showStatusBadge: true,
  showBrowseAction: true,
  showOwner: true,
})

defineEmits<{ select: [skill: unknown] }>()
const { t } = useUiLanguage()
const showStatusBadge = computed(() => props.showStatusBadge !== false)
const showBrowseAction = computed(() => props.showBrowseAction !== false)
const showOwner = computed(() => props.showOwner !== false)

const skillDirPath = computed(() => {
  const p = props.skill.path
  if (!p) return ''
  return p.endsWith('/SKILL.md') ? p.slice(0, -'/SKILL.md'.length) : p
})

function onBrowse(): void {
  const dir = skillDirPath.value
  if (!dir) return
  window.open(appPath(`/codex-local-browse${encodeURI(dir)}`), '_blank', 'noopener,noreferrer')
}

const publishedLabel = computed(() => {
  const ts = props.skill.publishedAt
  if (!ts) return ''
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  if (diff < 2592000_000) return `${Math.floor(diff / 86400_000)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})

const metaLabels = computed(() => {
  const labels: string[] = []
  if (props.skill.installCountLabel) labels.push(props.skill.installCountLabel)
  if (publishedLabel.value) labels.push(publishedLabel.value)
  return labels
})

function onAvatarError(e: Event): void {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
@reference "tailwindcss";

.skill-card {
  @apply flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300 hover:shadow-sm cursor-pointer;
}

.skill-card.is-disabled {
  @apply opacity-50;
}

.skill-card-top {
  @apply flex items-start gap-2.5;
}

.skill-card-avatar {
  @apply w-8 h-8 rounded-full shrink-0 bg-zinc-100;
}

.skill-card-avatar-fallback {
  @apply w-8 h-8 rounded-full shrink-0 bg-zinc-200 text-zinc-500 flex items-center justify-center text-xs font-medium uppercase;
}

.skill-card-info {
  @apply flex flex-col gap-0.5 min-w-0 flex-1;
}

.skill-card-header {
  @apply flex items-center gap-2;
}

.skill-card-name {
  @apply text-sm font-medium text-zinc-900 truncate;
}

.skill-card-badge {
  @apply shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 leading-none;
}

.skill-card-badge-disabled {
  @apply shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 leading-none;
}

.skill-card-owner {
  @apply text-xs text-zinc-400;
}

.skill-card-browse {
  @apply shrink-0 ml-auto h-7 w-7 rounded-lg border-0 bg-transparent text-zinc-300 flex items-center justify-center transition hover:bg-zinc-100 hover:text-zinc-600;
}

.skill-card-browse-icon {
  @apply w-4 h-4;
}

.skill-card-desc {
  @apply m-0 text-xs text-zinc-500 line-clamp-2;
}

.skill-card-meta-row {
  @apply flex flex-wrap gap-1.5;
}

.skill-card-meta {
  @apply text-[10px] text-zinc-300;
}
</style>
