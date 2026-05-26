<template>
  <div ref="rootRef" class="account-menu">
    <button class="account-menu-trigger" type="button" @click="isOpen = !isOpen">
      <span class="account-menu-trigger-label">{{ activeLabel }}</span>
      <span class="account-menu-trigger-chevron">{{ isOpen ? '▴' : '▾' }}</span>
    </button>

    <div v-if="isOpen" class="account-menu-panel">
      <div class="account-menu-header">
        <p class="account-menu-title">Accounts</p>
      </div>

      <p v-if="error" class="account-menu-error">{{ error }}</p>

      <p v-if="accounts.length === 0" class="account-menu-empty">
        No saved accounts yet. Run `codex login`, then click reload.
      </p>

      <div v-else class="account-menu-list">
        <article
          v-for="account in accounts"
          :key="account.storageId"
          class="account-menu-item"
          :class="{ 'is-active': account.isActive }"
        >
          <div class="account-menu-item-main">
            <p class="account-menu-item-email">{{ account.email || 'Account' }}</p>
            <p class="account-menu-item-meta">
              {{ formatMeta(account) }}
            </p>
          </div>
          <button
            class="account-menu-switch"
            type="button"
            :disabled="isSwitching || account.isActive"
            @click="emit('switch', account.storageId)"
          >
            {{ account.isActive ? 'Active' : isSwitching ? 'Switching…' : 'Switch' }}
          </button>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { UiAccountEntry } from '../../types/codex'

const props = defineProps<{
  accounts: UiAccountEntry[]
  isRefreshing: boolean
  isSwitching: boolean
  error: string
}>()

const emit = defineEmits<{
  switch: [storageId: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const activeLabel = computed(() => {
  const active = props.accounts.find((account) => account.isActive) ?? null
  if (!active) return 'Accounts'
  return active.email || shortAccountId(active.accountId)
})

function shortAccountId(accountId: string): string {
  return accountId.length > 8 ? accountId.slice(-8) : accountId
}

function formatMeta(account: UiAccountEntry): string {
  const segments = [account.planType || 'unknown', shortAccountId(account.accountId)]
  if (account.authMode) {
    segments.unshift(account.authMode)
  }
  return segments.join(' · ')
}

function onWindowPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  isOpen.value = false
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown)
})
</script>

<style scoped>
@reference "tailwindcss";

.account-menu {
  @apply relative;
}

.account-menu-trigger {
  @apply inline-flex h-8 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700 transition hover:bg-zinc-50;
}

.account-menu-trigger-label {
  @apply max-w-36 truncate;
}

.account-menu-trigger-chevron {
  @apply text-xs text-zinc-500;
}

.account-menu-panel {
  @apply absolute right-0 top-[calc(100%+8px)] z-50 flex w-80 max-w-[calc(100vw-24px)] flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg;
}

.account-menu-header {
  @apply flex items-center justify-between gap-3;
}

.account-menu-title {
  @apply text-sm font-medium text-zinc-900;
}

.account-menu-error {
  @apply rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700;
}

.account-menu-empty {
  @apply text-sm text-zinc-500;
}

.account-menu-list {
  @apply flex max-h-80 flex-col gap-2 overflow-y-auto;
}

.account-menu-item {
  @apply flex items-center gap-3 rounded-2xl border border-zinc-200 px-3 py-2;
}

.account-menu-item.is-active {
  @apply border-emerald-200 bg-emerald-50;
}

.account-menu-item-main {
  @apply min-w-0 flex-1;
}

.account-menu-item-email {
  @apply truncate text-sm font-medium text-zinc-900;
}

.account-menu-item-meta {
  @apply truncate text-xs text-zinc-500;
}

.account-menu-switch {
  @apply rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60;
}
</style>
