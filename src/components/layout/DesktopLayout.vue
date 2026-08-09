<template>
  <div class="desktop-layout" :class="{ 'is-mobile': isMobile }" :style="layoutStyle">
    <Teleport v-if="isMobile" to="body">
      <Transition name="drawer">
        <div v-if="!isSidebarCollapsed" class="mobile-drawer-backdrop" @click="$emit('close-sidebar')">
          <aside class="mobile-drawer" @click.stop>
            <slot name="sidebar" />
          </aside>
        </div>
      </Transition>
    </Teleport>

    <template v-if="!isMobile">
      <aside class="desktop-sidebar" :class="{ 'is-collapsed': isSidebarCollapsed }">
        <slot name="sidebar" />
      </aside>
      <button
        v-if="!isSidebarCollapsed"
        class="desktop-resize-handle"
        type="button"
        aria-label="Resize sidebar"
        @mousedown="onResizeHandleMouseDown"
      />
    </template>

    <section class="desktop-main">
      <slot name="content" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMobile } from '../../composables/useMobile'

const props = withDefaults(
  defineProps<{
    isSidebarCollapsed?: boolean
  }>(),
  {
    isSidebarCollapsed: false,
  },
)

defineEmits<{
  'close-sidebar': []
}>()

const { isMobile } = useMobile()

const COLLAPSED_SIDEBAR_WIDTH = 60
const SIDEBAR_WIDTH_KEY = 'codex-web-local.sidebar-width.v1'
const MIN_SIDEBAR_WIDTH = 260
const MAX_SIDEBAR_WIDTH = 620
const DEFAULT_SIDEBAR_WIDTH = 320

function clampSidebarWidth(value: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value))
}

function loadSidebarWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY)
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_WIDTH
  return clampSidebarWidth(parsed)
}

const sidebarWidth = ref(loadSidebarWidth())

const layoutStyle = computed(() => {
  if (isMobile.value) {
    return {
      '--sidebar-width': '0px',
      '--layout-columns': 'minmax(0, 1fr)',
    }
  }
  if (props.isSidebarCollapsed) {
    return {
      '--sidebar-width': `${COLLAPSED_SIDEBAR_WIDTH}px`,
      '--layout-columns': 'var(--sidebar-width) 0px minmax(0, 1fr)',
    }
  }
  return {
    '--sidebar-width': `${sidebarWidth.value}px`,
    '--layout-columns': 'var(--sidebar-width) 1px minmax(0, 1fr)',
  }
})

function saveSidebarWidth(value: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(value))
}

function onResizeHandleMouseDown(event: MouseEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = sidebarWidth.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    const delta = moveEvent.clientX - startX
    sidebarWidth.value = clampSidebarWidth(startWidth + delta)
  }

  const onMouseUp = () => {
    saveSidebarWidth(sidebarWidth.value)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
@reference "tailwindcss";

.desktop-layout {
  @apply isolate grid bg-slate-100 text-slate-900 overflow-hidden;
  height: 100vh;
  height: 100dvh;
  grid-template-columns: var(--layout-columns);
}

.desktop-sidebar {
  @apply relative z-0 bg-slate-100 min-h-0 overflow-hidden;
}

.desktop-sidebar.is-collapsed {
  @apply overflow-visible;
}

.desktop-sidebar.is-collapsed :deep(.sidebar-root) {
  @apply flex flex-col items-center pt-2 gap-1 overflow-y-auto;
  scrollbar-width: none;
}

.desktop-sidebar.is-collapsed :deep(.sidebar-root::-webkit-scrollbar) {
  display: none;
}

.desktop-sidebar.is-collapsed :deep(.sidebar-skills-link.is-collapsed) {
  @apply mx-0;
}

.desktop-resize-handle {
  @apply relative w-px cursor-col-resize bg-slate-300 hover:bg-slate-400 transition;
}

.desktop-resize-handle::before {
  content: '';
  @apply absolute -left-2 -right-2 top-0 bottom-0;
}

.desktop-main {
  @apply relative z-[100] bg-white min-h-0 overflow-y-hidden overflow-x-visible;
}

.mobile-drawer-backdrop {
  @apply fixed inset-0 z-40 bg-black/40;
}

.mobile-drawer {
  @apply absolute top-0 left-0 bottom-0 w-[85vw] max-w-80 bg-slate-100 overflow-hidden shadow-2xl;
}

.drawer-enter-active,
.drawer-leave-active {
  @apply transition-opacity duration-200;
}

.drawer-enter-active .mobile-drawer,
.drawer-leave-active .mobile-drawer {
  transition: transform 200ms ease;
}

.drawer-enter-from {
  @apply opacity-0;
}

.drawer-enter-from .mobile-drawer {
  transform: translateX(-100%);
}

.drawer-leave-to {
  @apply opacity-0;
}

.drawer-leave-to .mobile-drawer {
  transform: translateX(-100%);
}
</style>
