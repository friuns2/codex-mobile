<template>
  <div ref="rootRef" class="search-dropdown">
    <button
      class="search-dropdown-trigger"
      type="button"
      :disabled="disabled"
      @click="onToggle"
    >
      <span class="search-dropdown-value">{{ displayLabel }}</span>
      <IconTablerChevronDown class="search-dropdown-chevron" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="search-dropdown-menu-wrap"
        :class="{
          'search-dropdown-menu-wrap-up': openDirection === 'up',
          'search-dropdown-menu-wrap-down': openDirection === 'down',
        }"
        :style="menuStyle"
      >
        <div class="search-dropdown-search-wrap">
          <div class="search-dropdown-search-row">
            <input
              ref="searchRef"
              v-model="searchQuery"
              class="search-dropdown-search"
              type="text"
              :placeholder="searchPlaceholder"
              @keydown.escape.prevent="isOpen = false"
              @keydown.enter.prevent="selectHighlighted"
              @keydown.arrow-down.prevent="moveHighlight(1)"
              @keydown.arrow-up.prevent="moveHighlight(-1)"
            />
            <button
              v-if="createLabel"
              class="search-dropdown-create-icon"
              type="button"
              :aria-label="createLabel"
              :title="createLabel"
              @click="emit('create')"
            >
              +
            </button>
          </div>
          <button
            v-if="createLabel"
            class="search-dropdown-create"
            type="button"
            @click="emit('create')"
          >
            {{ createLabel }}
          </button>
        </div>
        <ul v-if="filtered.length > 0" class="search-dropdown-list" role="listbox">
          <li v-for="(opt, idx) in filtered" :key="opt.value">
            <div
              class="search-dropdown-option"
              :class="{
                'is-selected': selected.has(opt.value),
                'is-highlighted': idx === highlightIdx,
              }"
              @pointerenter="highlightIdx = idx"
            >
              <button
                class="search-dropdown-option-main"
                type="button"
                @click="onSelect(opt)"
              >
                <span class="search-dropdown-option-check">{{ selected.has(opt.value) ? '✓' : '' }}</span>
                <span
                  v-if="opt.badge"
                  class="search-dropdown-option-badge"
                  :class="opt.badgeTone ? `is-${opt.badgeTone}` : ''"
                  :title="opt.badgeLabel || opt.badge"
                  aria-hidden="true"
                >
                  {{ opt.badge }}
                </span>
                <span class="search-dropdown-option-copy">
                  <span class="search-dropdown-option-label-row">
                    <span class="search-dropdown-option-label">{{ opt.label }}</span>
                    <span v-if="opt.badgeLabel" class="search-dropdown-option-type">{{ opt.badgeLabel }}</span>
                  </span>
                  <span v-if="opt.description" class="search-dropdown-option-desc">{{ opt.description }}</span>
                </span>
              </button>
              <button
                v-if="allowRemove && opt.removable"
                class="search-dropdown-option-remove"
                type="button"
                :aria-label="`${removeLabel} ${opt.label}`"
                :title="`${removeLabel} ${opt.label}`"
                @click.stop="emit('remove', opt.value)"
              >
                ×
              </button>
            </div>
          </li>
        </ul>
        <div v-else class="search-dropdown-empty">{{ t('No results') }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'

export type SearchDropdownOption = {
  value: string
  label: string
  description?: string
  badge?: string
  badgeLabel?: string
  badgeTone?: 'repo' | 'system' | 'plugin' | 'user' | 'prompt'
  removable?: boolean
}

const props = defineProps<{
  options: SearchDropdownOption[]
  selectedValues: string[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  openDirection?: 'up' | 'down'
  createLabel?: string
  allowRemove?: boolean
  removeLabel?: string
  displayLabelOverride?: string
}>()

const emit = defineEmits<{
  toggle: [value: string, checked: boolean]
  create: []
  remove: [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const highlightIdx = ref(0)
const menuStyle = ref<Record<string, string>>({})
const { t } = useUiLanguage()

const openDirection = computed(() => props.openDirection ?? 'down')
const selected = computed(() => new Set(props.selectedValues))

const displayLabel = computed(() => {
  if (props.displayLabelOverride?.trim()) return props.displayLabelOverride.trim()
  if (props.selectedValues.length === 0) return props.placeholder || t('Select...')
  if (props.selectedValues.length === 1) {
    const opt = props.options.find((o) => o.value === props.selectedValues[0])
    return opt?.label || props.placeholder || t('Select...')
  }
  return `${props.selectedValues.length} ${t('selected')}`
})

const filtered = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return props.options
  return props.options.filter(
    (o) =>
      o.label.toLowerCase().includes(q) ||
      (o.description?.toLowerCase().includes(q) ?? false),
  )
})

function updateMenuPosition(): void {
  const menu = menuRef.value
  const root = rootRef.value
  if (!menu || !root) return
  const rect = root.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const desiredWidth = Math.min(384, viewportWidth - 16)
  const left = Math.max(8, Math.min(rect.right - desiredWidth, viewportWidth - desiredWidth - 8))

  if (viewportWidth < 640) {
    menuStyle.value = {
      position: 'fixed',
      left: '0.5rem',
      right: '0.5rem',
      width: 'auto',
      top: openDirection.value === 'up' ? 'auto' : `${rect.bottom + 8}px`,
      bottom: openDirection.value === 'up' ? `${viewportHeight - rect.top + 8}px` : 'auto',
      zIndex: '120',
    }
    return
  }

  menuStyle.value = {
    position: 'fixed',
    width: `${desiredWidth}px`,
    left: `${left}px`,
    top: openDirection.value === 'up' ? 'auto' : `${rect.bottom + 8}px`,
    bottom: openDirection.value === 'up' ? `${viewportHeight - rect.top + 8}px` : 'auto',
    zIndex: '120',
  }
}

function onToggle(): void {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
    highlightIdx.value = 0
    nextTick(() => {
      nextTick(() => {
        updateMenuPosition()
      })
      searchRef.value?.focus()
    })
  }
}

function onSelect(opt: SearchDropdownOption): void {
  emit('toggle', opt.value, !selected.value.has(opt.value))
  searchRef.value?.focus()
}

function moveHighlight(delta: number): void {
  if (filtered.value.length === 0) return
  highlightIdx.value = (highlightIdx.value + delta + filtered.value.length) % filtered.value.length
}

function selectHighlighted(): void {
  const opt = filtered.value[highlightIdx.value]
  if (opt) onSelect(opt)
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  const menu = menuRef.value
  if (!root) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  if (menu?.contains(target)) return
  isOpen.value = false
}

watch(searchQuery, () => { highlightIdx.value = 0 })

function onWindowLayoutChange(): void {
  if (!isOpen.value) return
  updateMenuPosition()
}

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('resize', onWindowLayoutChange)
  window.addEventListener('scroll', onWindowLayoutChange, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('resize', onWindowLayoutChange)
  window.removeEventListener('scroll', onWindowLayoutChange, true)
})
</script>

<style scoped>
@reference "tailwindcss";

.search-dropdown {
  @apply relative inline-flex min-w-0;
}

.search-dropdown-trigger {
  @apply inline-flex min-h-7 min-w-0 items-center gap-1 border-0 bg-transparent px-0 py-0.5 text-sm leading-tight text-zinc-500 outline-none transition;
}

.search-dropdown-trigger:disabled {
  @apply cursor-not-allowed text-zinc-500;
}

.search-dropdown-value {
  @apply whitespace-nowrap text-left truncate pb-px;
}

.search-dropdown-chevron {
  @apply mt-px h-3.5 w-3.5 shrink-0 text-zinc-500;
}

.search-dropdown-menu-wrap {
  @apply z-[120];
}

@media (max-width: 639px) {
  .search-dropdown-menu-wrap {
    max-width: none;
  }
}

.search-dropdown-search-wrap {
  @apply p-2 border-b border-zinc-100;
}

.search-dropdown-search-row {
  @apply flex items-center gap-2;
}

.search-dropdown-create {
  @apply hidden;
}

.search-dropdown-create-icon {
  @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-lg leading-none text-zinc-700 transition hover:bg-zinc-50;
}

.search-dropdown-search {
  @apply min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-800 outline-none placeholder-zinc-400 transition focus:border-zinc-300 focus:bg-white;
}

.search-dropdown-list {
  @apply m-0 max-h-64 list-none overflow-y-auto p-1;
}

.search-dropdown-option {
  @apply relative flex min-w-0 items-start gap-1 rounded-lg text-zinc-700 transition;
}

.search-dropdown-option.is-highlighted {
  @apply bg-zinc-100;
}

.search-dropdown-option.is-selected {
  @apply text-zinc-900;
}

.search-dropdown-option-main {
  @apply flex min-w-0 flex-1 items-start gap-2 rounded-lg border-0 bg-transparent px-2.5 py-1.5 pr-8 text-left hover:bg-zinc-50;
}

.search-dropdown-option-check {
  @apply mt-0.5 w-4 shrink-0 text-center text-[10px] leading-4 text-emerald-600;
}

.search-dropdown-option-badge {
  @apply mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-100 text-[9px] font-semibold leading-none text-zinc-600;
}

.search-dropdown-option-badge.is-repo {
  @apply border-sky-200 bg-sky-50 text-sky-700;
}

.search-dropdown-option-badge.is-system {
  @apply border-zinc-300 bg-zinc-100 text-zinc-700;
}

.search-dropdown-option-badge.is-plugin {
  @apply border-amber-200 bg-amber-50 text-amber-700;
}

.search-dropdown-option-badge.is-user {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.search-dropdown-option-badge.is-prompt {
  @apply border-violet-200 bg-violet-50 text-violet-700;
}

.search-dropdown-option-copy {
  @apply flex min-w-0 flex-1 flex-col overflow-hidden pr-1;
}

.search-dropdown-option-label-row {
  @apply flex min-w-0 items-center gap-2;
}

.search-dropdown-option-label {
  @apply block min-w-0 truncate text-sm font-medium text-zinc-800;
}

.search-dropdown-option-type {
  @apply shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400;
}

.search-dropdown-option-desc {
  @apply mt-0.5 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-zinc-500;
}

.search-dropdown-option-remove {
  @apply absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md border-0 bg-transparent text-lg font-medium leading-none text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800;
}

.search-dropdown-empty {
  @apply p-3 text-center text-sm text-zinc-400;
}

.search-dropdown-menu-wrap-up,
.search-dropdown-menu-wrap-down {
  @apply rounded-xl border border-zinc-200 bg-white shadow-lg;
}

:global(:root.dark) .search-dropdown-trigger,
:global(:root.dark) .search-dropdown-trigger:disabled,
:global(:root.dark) .search-dropdown-value,
:global(:root.dark) .search-dropdown-chevron {
  @apply text-zinc-400;
}

:global(:root.dark) .search-dropdown-menu-wrap-up,
:global(:root.dark) .search-dropdown-menu-wrap-down {
  @apply border-zinc-700 bg-zinc-900 shadow-[0_18px_48px_rgba(0,0,0,0.45)];
}

:global(:root.dark) .search-dropdown-search-wrap {
  @apply border-zinc-800;
}

:global(:root.dark) .search-dropdown-search,
:global(:root.dark) .search-dropdown-create {
  @apply border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500;
}

:global(:root.dark) .search-dropdown-create:hover {
  @apply bg-zinc-900;
}

:global(:root.dark) .search-dropdown-option {
  @apply text-zinc-200;
}

:global(:root.dark) .search-dropdown-option.is-highlighted,
:global(:root.dark) .search-dropdown-option-main:hover {
  @apply bg-zinc-800;
}

:global(:root.dark) .search-dropdown-option-label {
  @apply text-zinc-100;
}

:global(:root.dark) .search-dropdown-option-badge {
  @apply border-zinc-700 bg-zinc-800 text-zinc-300;
}

:global(:root.dark) .search-dropdown-option-badge.is-repo {
  @apply border-sky-900/70 bg-sky-950 text-sky-300;
}

:global(:root.dark) .search-dropdown-option-badge.is-system {
  @apply border-zinc-600 bg-zinc-800 text-zinc-300;
}

:global(:root.dark) .search-dropdown-option-badge.is-plugin {
  @apply border-amber-900/70 bg-amber-950 text-amber-300;
}

:global(:root.dark) .search-dropdown-option-badge.is-user {
  @apply border-emerald-900/70 bg-emerald-950 text-emerald-300;
}

:global(:root.dark) .search-dropdown-option-badge.is-prompt {
  @apply border-violet-900/70 bg-violet-950 text-violet-300;
}

:global(:root.dark) .search-dropdown-option-type {
  @apply text-zinc-500;
}

:global(:root.dark) .search-dropdown-option-desc {
  @apply text-zinc-400;
}

:global(:root.dark) .search-dropdown-option-remove {
  @apply text-zinc-400;
}

:global(:root.dark) .search-dropdown-option-remove:hover {
  @apply bg-zinc-700 text-zinc-200;
}

:global(:root.dark) .search-dropdown-empty {
  @apply text-zinc-500;
}
</style>
