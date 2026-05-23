<template>
  <div ref="rootRef" class="composer-dropdown">
    <button
      class="composer-dropdown-trigger"
      type="button"
      :title="triggerAccessibleLabel"
      :aria-label="triggerAccessibleLabel"
      :disabled="disabled"
      @click="onToggle"
    >
      <component :is="selectedPrefixIcon" v-if="selectedPrefixIcon" class="composer-dropdown-prefix-icon" />
      <span v-if="!iconOnly" class="composer-dropdown-value">{{ selectedLabel }}</span>
      <IconTablerChevronDown class="composer-dropdown-chevron" />
    </button>

    <div
      v-if="isOpen"
      ref="menuWrapRef"
      class="composer-dropdown-menu-wrap"
      :class="{
        'composer-dropdown-menu-wrap-up': openDirection === 'up',
        'composer-dropdown-menu-wrap-down': openDirection === 'down',
      }"
      :style="menuWrapStyle"
    >
      <div ref="menuRef" class="composer-dropdown-menu">
        <div v-if="enableSearch" class="composer-dropdown-search-wrap">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="composer-dropdown-search-input"
            type="text"
            :placeholder="searchPlaceholderText"
            @keydown.esc.prevent="onEscapeSearch"
          />
        </div>

        <ul class="composer-dropdown-options" role="listbox">
          <li v-for="option in filteredOptions" :key="option.value">
            <button
              class="composer-dropdown-option"
              :class="{ 'is-selected': option.value === modelValue }"
              type="button"
              @click="onSelect(option.value)"
            >
              {{ option.label }}
            </button>
          </li>
          <li v-if="filteredOptions.length === 0" class="composer-dropdown-empty">
            {{ emptyText }}
          </li>
        </ul>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'

type DropdownOption = {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string
  options: DropdownOption[]
  placeholder?: string
  disabled?: boolean
  selectedPrefixIcon?: Component | null
  iconOnly?: boolean
  openDirection?: 'up' | 'down'
  menuAlign?: 'start' | 'end'
  enableSearch?: boolean
  searchPlaceholder?: string
  emptyLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const menuWrapRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const menuWrapStyle = ref<Record<string, string>>({})
let isLayoutListenerAttached = false

const selectedLabel = computed(() => {
  const selected = props.options.find((option) => option.value === props.modelValue)
  if (selected) return selected.label
  return props.placeholder?.trim() || ''
})

const openDirection = computed(() => props.openDirection ?? 'down')
const menuAlign = computed(() => props.menuAlign ?? 'start')
const iconOnly = computed(() => props.iconOnly === true)
const enableSearch = computed(() => props.enableSearch === true)
const searchPlaceholderText = computed(() => props.searchPlaceholder?.trim() || 'Quick search projects')
const emptyText = computed(() => props.emptyLabel?.trim() || 'No results')
const triggerAccessibleLabel = computed(() => selectedLabel.value || props.placeholder?.trim() || 'Select option')
const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.options
  return props.options.filter((option) => {
    return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
  })
})

function onToggle(): void {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function updateMenuPosition(): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root || typeof window === 'undefined') return

  const rect = root.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const viewportPadding = 8
  const gap = 8
  const maxMenuWidth = Math.max(0, viewportWidth - viewportPadding * 2)
  const measuredWidth = menuRef.value?.offsetWidth ?? menuWrapRef.value?.offsetWidth ?? 224
  const measuredHeight = menuRef.value?.offsetHeight ?? menuWrapRef.value?.offsetHeight ?? 0
  const menuWidth = Math.min(measuredWidth, maxMenuWidth)
  const maxLeft = Math.max(viewportPadding, viewportWidth - menuWidth - viewportPadding)
  const desiredLeft = menuAlign.value === 'end' ? rect.right - menuWidth : rect.left
  const left = clamp(desiredLeft, viewportPadding, maxLeft)

  let top = openDirection.value === 'up'
    ? rect.top - measuredHeight - gap
    : rect.bottom + gap
  if (measuredHeight > 0 && top + measuredHeight > viewportHeight - viewportPadding) {
    top = viewportHeight - measuredHeight - viewportPadding
  }
  top = Math.max(viewportPadding, top)

  menuWrapStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    right: 'auto',
    top: `${top}px`,
    bottom: 'auto',
    width: `${menuWidth}px`,
  }
}

function addLayoutListeners(): void {
  if (isLayoutListenerAttached || typeof window === 'undefined') return
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
  isLayoutListenerAttached = true
}

function removeLayoutListeners(): void {
  if (!isLayoutListenerAttached || typeof window === 'undefined') return
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
  isLayoutListenerAttached = false
}

function onSelect(value: string): void {
  emit('update:modelValue', value)
  isOpen.value = false
  searchQuery.value = ''
}

function onEscapeSearch(): void {
  if (searchQuery.value.length > 0) {
    searchQuery.value = ''
    return
  }
  isOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root) return

  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  isOpen.value = false
  searchQuery.value = ''
}

watch(isOpen, (open) => {
  if (!open) {
    removeLayoutListeners()
    menuWrapStyle.value = {}
    return
  }
  addLayoutListeners()
  nextTick(() => {
    updateMenuPosition()
    window.requestAnimationFrame(updateMenuPosition)
    if (enableSearch.value) searchInputRef.value?.focus()
  })
})

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
  removeLayoutListeners()
})
</script>

<style scoped>
@reference "tailwindcss";

.composer-dropdown {
  @apply relative inline-flex min-w-0;
}

.composer-dropdown-trigger {
  @apply inline-flex min-h-7 min-w-0 items-center gap-1 border-0 bg-transparent px-0 py-0.5 text-sm leading-tight text-zinc-500 outline-none transition;
}

.composer-dropdown-prefix-icon {
  @apply h-3.5 w-3.5 shrink-0 text-amber-500;
}

.composer-dropdown-trigger:disabled {
  @apply cursor-not-allowed text-zinc-500;
}

.composer-dropdown-value {
  @apply whitespace-nowrap text-left truncate pb-px;
}

.composer-dropdown-chevron {
  @apply mt-px h-3.5 w-3.5 shrink-0 text-zinc-500;
}

.composer-dropdown-menu-wrap {
  @apply absolute left-0 z-50;
}

.composer-dropdown-menu-wrap-down {
  @apply top-[calc(100%+8px)];
}

.composer-dropdown-menu-wrap-up {
  @apply bottom-[calc(100%+8px)];
}

.composer-dropdown-menu {
  @apply m-0 min-w-56 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.composer-dropdown-search-wrap {
  @apply px-1 pb-1;
}

.composer-dropdown-search-input {
  @apply w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none transition focus:border-zinc-400;
}

.composer-dropdown-options {
  @apply m-0 max-h-56 list-none overflow-y-auto p-0;
}

.composer-dropdown-option {
  @apply flex w-full items-center rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-sm text-zinc-700 transition hover:bg-zinc-100;
}

.composer-dropdown-option.is-selected {
  @apply bg-zinc-100;
}

.composer-dropdown-empty {
  @apply px-2 py-1.5 text-xs text-zinc-500;
}
</style>
