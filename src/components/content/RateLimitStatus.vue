<template>
  <aside
    v-if="snapshots.length > 0 || resetCredits !== null || resetNotice !== null"
    class="rate-limit-status"
    aria-live="polite"
  >
    <div
      v-for="snapshot in snapshots"
      :key="getSnapshotKey(snapshot)"
      class="rate-limit-card"
      :title="buildTooltip(snapshot)"
    >
      <div class="rate-limit-card-header">
        <span class="rate-limit-card-title">{{ getSnapshotTitle(snapshot) }}</span>
        <span v-if="snapshot.planType" class="rate-limit-card-plan">{{ formatPlanType(snapshot.planType) }}</span>
      </div>

      <div class="rate-limit-card-metrics">
        <span
          v-for="metric in getWindowMetrics(snapshot)"
          :key="metric.key"
          class="rate-limit-card-metric"
        >
          {{ metric.label }}
        </span>
      </div>

      <div v-if="getFooterParts(snapshot).length > 0" class="rate-limit-card-footer">
        {{ getFooterParts(snapshot).join(' | ') }}
      </div>
    </div>

    <section
      v-if="resetCredits !== null"
      class="banked-reset-card"
      aria-label="Banked rate-limit resets"
    >
      <div class="banked-reset-header">
        <div>
          <span class="banked-reset-eyebrow">Banked resets</span>
          <strong class="banked-reset-count">
            {{ resetCredits.availableCount }} available
          </strong>
        </div>
        <span class="banked-reset-icon" aria-hidden="true">↻</span>
      </div>

      <p class="banked-reset-explanation">
        Use one reset on an eligible Codex rate-limit window. Using a reset cannot be undone.
      </p>

      <div v-if="visibleResetCredits.length > 0" class="banked-reset-list">
        <article
          v-for="credit in visibleResetCredits"
          :key="credit.id"
          class="banked-reset-entry"
        >
          <div class="banked-reset-entry-copy">
            <strong>{{ credit.title || 'Rate-limit reset' }}</strong>
            <span v-if="credit.description">{{ credit.description }}</span>
            <span v-if="formatCreditExpiry(credit.expiresAt)" class="banked-reset-expiry">
              {{ formatCreditExpiry(credit.expiresAt) }}
            </span>
          </div>
          <button
            class="banked-reset-use"
            type="button"
            :disabled="isConsumingReset || resetCredits.availableCount <= 0"
            @click="onUseReset(credit.id)"
          >
            {{ getUseResetLabel(credit.id) }}
          </button>
        </article>
      </div>

      <button
        v-else-if="resetCredits.availableCount > 0"
        class="banked-reset-use banked-reset-use-generic"
        type="button"
        :disabled="isConsumingReset"
        @click="onUseReset()"
      >
        {{ getUseResetLabel() }}
      </button>

      <p v-else class="banked-reset-empty">No banked resets available.</p>
      <p v-if="hiddenResetCreditCount > 0" class="banked-reset-hidden">
        +{{ hiddenResetCreditCount }} additional reset{{ hiddenResetCreditCount === 1 ? '' : 's' }}
      </p>
      <p
        v-if="resetNotice"
        class="banked-reset-notice"
        :data-type="resetNotice.type"
        :role="resetNotice.type === 'error' ? 'alert' : 'status'"
      >
        {{ resetNotice.text }}
      </p>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type {
  UiRateLimitResetCredit,
  UiRateLimitResetCredits,
  UiRateLimitSnapshot,
  UiRateLimitWindow,
} from '../../types/codex'

const props = defineProps<{
  snapshots: UiRateLimitSnapshot[]
  resetCredits: UiRateLimitResetCredits | null
  isConsumingReset: boolean
  resetNotice: { type: 'success' | 'info' | 'error'; text: string } | null
}>()

const emit = defineEmits<{
  'consume-reset': [creditId?: string]
}>()

const confirmingCreditId = ref('')
let confirmationTimer: ReturnType<typeof setTimeout> | null = null
const visibleResetCredits = computed<UiRateLimitResetCredit[]>(() => props.resetCredits?.credits ?? [])
const hiddenResetCreditCount = computed(() => Math.max(
  0,
  (props.resetCredits?.availableCount ?? 0) - visibleResetCredits.value.length,
))

type RateLimitMetric = {
  key: string
  label: string
}

function getSnapshotKey(snapshot: UiRateLimitSnapshot): string {
  return snapshot.limitId?.trim() || snapshot.limitName?.trim() || '__default__'
}

function getSnapshotTitle(snapshot: UiRateLimitSnapshot): string {
  return snapshot.limitName?.trim() || snapshot.limitId?.trim() || 'Rate limits'
}

function formatPlanType(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatWindowDuration(windowDurationMins: number | null): string {
  if (!windowDurationMins || windowDurationMins <= 0) return 'Window'
  if (windowDurationMins % 1440 === 0) return `${windowDurationMins / 1440}d`
  if (windowDurationMins % 60 === 0) return `${windowDurationMins / 60}h`
  if (windowDurationMins < 60) return `${windowDurationMins}m`
  return `${Math.round((windowDurationMins / 60) * 10) / 10}h`
}

function formatRemainingPercent(value: number): string {
  const remaining = Math.max(0, Math.min(100, 100 - value))
  return `${Math.round(remaining)}% left`
}

function formatUsedPercent(value: number): string {
  return `${Math.round(value)}%`
}

function formatWindowMetric(window: UiRateLimitWindow, key: string): RateLimitMetric {
  return {
    key,
    label: `${formatWindowDuration(window.windowDurationMins)} ${formatRemainingPercent(window.usedPercent)}`,
  }
}

function getWindowMetrics(snapshot: UiRateLimitSnapshot): RateLimitMetric[] {
  const metrics: RateLimitMetric[] = []
  if (snapshot.primary) metrics.push(formatWindowMetric(snapshot.primary, 'primary'))
  if (snapshot.secondary) metrics.push(formatWindowMetric(snapshot.secondary, 'secondary'))
  return metrics
}

function formatAbsoluteResetDate(resetsAt: number | null): string {
  if (!resetsAt) return ''

  const resetDate = new Date(resetsAt * 1000)
  const month = resetDate.getMonth() + 1
  const day = String(resetDate.getDate()).padStart(2, '0')
  const hours = String(resetDate.getHours()).padStart(2, '0')
  const minutes = String(resetDate.getMinutes()).padStart(2, '0')
  return `${month}.${day} ${hours}:${minutes}`
}

function formatRelativeResetText(window: UiRateLimitWindow | null): string {
  if (!window?.resetsAt) return ''

  const diffMs = window.resetsAt * 1000 - Date.now()
  if (diffMs <= 0) return 'Resetting now'

  const diffMinutes = Math.round(diffMs / 60000)
  if (diffMinutes < 60) {
    return `Resets in ${diffMinutes}m`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `Resets in ${diffHours}h`
  }

  const diffDays = Math.round(diffHours / 24)
  return `Resets in ${diffDays}d`
}

function getResetWindows(snapshot: UiRateLimitSnapshot): UiRateLimitWindow[] {
  return [snapshot.primary, snapshot.secondary].filter((window): window is UiRateLimitWindow => window !== null)
}

function getPrimaryResetWindow(snapshot: UiRateLimitSnapshot): UiRateLimitWindow | null {
  const windows = getResetWindows(snapshot)
  if (windows.length === 0) return null

  return [...windows].sort((first, second) => {
    const firstDuration = first.windowDurationMins ?? Number.MAX_SAFE_INTEGER
    const secondDuration = second.windowDurationMins ?? Number.MAX_SAFE_INTEGER
    if (firstDuration !== secondDuration) return firstDuration - secondDuration
    return (first.resetsAt ?? Number.MAX_SAFE_INTEGER) - (second.resetsAt ?? Number.MAX_SAFE_INTEGER)
  })[0]
}

function getWeeklyResetText(snapshot: UiRateLimitSnapshot): string {
  const windows = getResetWindows(snapshot)
  if (windows.length === 0) return ''

  const weeklyWindow = [...windows].sort((first, second) => {
    const firstDuration = first.windowDurationMins ?? -1
    const secondDuration = second.windowDurationMins ?? -1
    if (firstDuration !== secondDuration) return secondDuration - firstDuration
    return (second.resetsAt ?? -1) - (first.resetsAt ?? -1)
  })[0]

  const absoluteText = formatAbsoluteResetDate(weeklyWindow.resetsAt)
  if (!absoluteText) return ''

  return absoluteText
}

function getCreditsText(snapshot: UiRateLimitSnapshot): string {
  const credits = snapshot.credits
  if (!credits) return ''
  if (credits.unlimited) return 'Unlimited credits'
  if (credits.balance) return `Credits ${credits.balance}`
  if (credits.hasCredits) return 'Credits available'
  return ''
}

function getFooterParts(snapshot: UiRateLimitSnapshot): string[] {
  return [
    formatRelativeResetText(getPrimaryResetWindow(snapshot)),
    getWeeklyResetText(snapshot),
    getCreditsText(snapshot),
  ].filter((value) => value.length > 0)
}

function buildTooltip(snapshot: UiRateLimitSnapshot): string {
  const lines = [getSnapshotTitle(snapshot)]
  for (const metric of getWindowMetrics(snapshot)) {
    lines.push(metric.label)
  }
  for (const window of getResetWindows(snapshot)) {
    lines.push(`${formatWindowDuration(window.windowDurationMins)} used ${formatUsedPercent(window.usedPercent)}`)
  }
  for (const footer of getFooterParts(snapshot)) {
    lines.push(footer)
  }
  return lines.join('\n')
}

function confirmationKey(creditId?: string): string {
  return creditId?.trim() || '__next_available__'
}

function clearResetConfirmation(): void {
  confirmingCreditId.value = ''
  if (confirmationTimer) {
    clearTimeout(confirmationTimer)
    confirmationTimer = null
  }
}

function onUseReset(creditId?: string): void {
  if (props.isConsumingReset) return
  const key = confirmationKey(creditId)
  if (confirmingCreditId.value !== key) {
    clearResetConfirmation()
    confirmingCreditId.value = key
    confirmationTimer = setTimeout(clearResetConfirmation, 6000)
    return
  }
  clearResetConfirmation()
  emit('consume-reset', creditId)
}

function getUseResetLabel(creditId?: string): string {
  if (props.isConsumingReset) return 'Using…'
  return confirmingCreditId.value === confirmationKey(creditId)
    ? 'Click again to confirm'
    : 'Use reset'
}

function formatCreditExpiry(expiresAt: number | null): string {
  if (!expiresAt) return ''
  const date = new Date(expiresAt * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = date.getTime() - Date.now()
  if (diffMs <= 0) return 'Expired'
  const diffDays = Math.max(1, Math.ceil(diffMs / 86_400_000))
  return `Expires ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })} · ${diffDays}d left`
}

watch(() => props.resetCredits?.availableCount, clearResetConfirmation)
onUnmounted(clearResetConfirmation)
</script>

<style scoped>
@reference "tailwindcss";

.rate-limit-status {
  @apply flex w-full flex-col items-end gap-2;
}

.rate-limit-card {
  @apply w-full rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-right shadow-sm backdrop-blur;
  max-width: 22rem;
}

.rate-limit-card-header {
  @apply flex items-center justify-end gap-2;
}

.rate-limit-card-title {
  @apply text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500;
}

.rate-limit-card-plan {
  @apply rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600;
}

.rate-limit-card-metrics {
  @apply mt-1 flex flex-wrap justify-end gap-1;
}

.rate-limit-card-metric {
  @apply rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800;
}

.rate-limit-card-footer {
  @apply mt-1 text-[11px] text-zinc-500;
}

.banked-reset-card {
  @apply w-full rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-3 text-left shadow-sm;
  max-width: 22rem;
}

.banked-reset-header {
  @apply flex items-start justify-between gap-3;
}

.banked-reset-eyebrow {
  @apply block text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-600;
}

.banked-reset-count {
  @apply mt-0.5 block text-sm font-semibold text-violet-950;
}

.banked-reset-icon {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-200 text-base font-semibold text-violet-800;
}

.banked-reset-explanation {
  @apply mt-2 text-[11px] leading-4 text-violet-800;
}

.banked-reset-list {
  @apply mt-2 space-y-2;
}

.banked-reset-entry {
  @apply rounded-lg border border-violet-200 bg-white/80 p-2;
}

.banked-reset-entry-copy {
  @apply flex min-w-0 flex-col gap-0.5;
}

.banked-reset-entry-copy strong {
  @apply text-xs font-semibold text-zinc-900;
}

.banked-reset-entry-copy span {
  @apply text-[11px] leading-4 text-zinc-600;
}

.banked-reset-entry-copy .banked-reset-expiry {
  @apply font-medium text-violet-700;
}

.banked-reset-use {
  @apply mt-2 w-full rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50;
}

.banked-reset-use-generic {
  @apply mt-3;
}

.banked-reset-empty,
.banked-reset-hidden {
  @apply mt-2 text-[11px] text-violet-700;
}

.banked-reset-notice {
  @apply mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] leading-4 text-emerald-800;
}

.banked-reset-notice[data-type='info'] {
  @apply border-amber-200 bg-amber-50 text-amber-800;
}

.banked-reset-notice[data-type='error'] {
  @apply border-rose-200 bg-rose-50 text-rose-800;
}
</style>
