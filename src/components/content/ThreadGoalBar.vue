<template>
  <section class="thread-goal-bar" :class="`is-${goal.status}`" aria-label="Thread goal">
    <div class="thread-goal-marker" aria-hidden="true">◎</div>
    <div class="thread-goal-content">
      <div class="thread-goal-heading">
        <strong>Goal</strong>
        <span class="thread-goal-status">{{ statusLabel }}</span>
        <span v-if="usageLabel" class="thread-goal-usage">{{ usageLabel }}</span>
      </div>
      <form v-if="isEditing" class="thread-goal-edit" @submit.prevent="saveEdit">
        <input
          ref="editInputRef"
          v-model="editedObjective"
          class="thread-goal-input"
          aria-label="Goal objective"
          :disabled="disabled"
          @keydown.escape.prevent="cancelEdit"
        >
        <button type="submit" class="thread-goal-action is-primary" :disabled="disabled || !editedObjective.trim()">Save</button>
        <button type="button" class="thread-goal-action" :disabled="disabled" @click="cancelEdit">Cancel</button>
      </form>
      <p v-else class="thread-goal-objective" :title="goal.objective">{{ goal.objective }}</p>
    </div>
    <div v-if="!isEditing" class="thread-goal-actions">
      <button type="button" class="thread-goal-action" :disabled="disabled" @click="beginEdit">Edit</button>
      <button
        v-if="goal.status === 'active' || goal.status === 'paused'"
        type="button"
        class="thread-goal-action"
        :disabled="disabled"
        @click="$emit('toggle-paused')"
      >
        {{ goal.status === 'paused' ? 'Resume' : 'Pause' }}
      </button>
      <button type="button" class="thread-goal-action is-danger" :disabled="disabled" @click="$emit('clear')">Clear</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { UiThreadGoal } from '../../types/codex'

const props = defineProps<{
  goal: UiThreadGoal
  disabled?: boolean
}>()

const emit = defineEmits<{
  edit: [objective: string]
  'toggle-paused': []
  clear: []
}>()

const isEditing = ref(false)
const editedObjective = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

const statusLabel = computed(() => ({
  active: 'Active',
  paused: 'Paused',
  blocked: 'Blocked',
  usageLimited: 'Usage limited',
  budgetLimited: 'Budget limited',
  complete: 'Complete',
}[props.goal.status]))

const usageLabel = computed(() => {
  if (props.goal.tokenBudget === null) return ''
  return `${formatTokens(props.goal.tokensUsed)} / ${formatTokens(props.goal.tokenBudget)} tokens`
})

watch(() => props.goal.objective, (objective) => {
  if (!isEditing.value) editedObjective.value = objective
})

function formatTokens(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${Math.round(value / 100) / 10}k`
  return `${Math.round(value / 100_000) / 10}m`
}

function beginEdit(): void {
  editedObjective.value = props.goal.objective
  isEditing.value = true
  void nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function cancelEdit(): void {
  editedObjective.value = props.goal.objective
  isEditing.value = false
}

function saveEdit(): void {
  const objective = editedObjective.value.trim()
  if (!objective || props.disabled) return
  emit('edit', objective)
  isEditing.value = false
}
</script>

<style scoped>
.thread-goal-bar {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
  margin: 0 0.75rem 0.45rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid rgb(217 119 6 / 20%);
  border-radius: 0.7rem;
  background: rgb(255 251 235 / 86%);
  color: #3f3f46;
}

.thread-goal-marker {
  flex: 0 0 auto;
  color: #d97706;
  font-size: 1.2rem;
  line-height: 1;
}

.thread-goal-content {
  min-width: 0;
  flex: 1 1 auto;
}

.thread-goal-heading {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #71717a;
  font-size: 0.68rem;
  line-height: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.thread-goal-heading strong {
  color: #a16207;
}

.thread-goal-status {
  padding: 0 0.3rem;
  border-radius: 999px;
  background: rgb(217 119 6 / 10%);
}

.thread-goal-usage {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-goal-objective {
  overflow: hidden;
  margin: 0.1rem 0 0;
  color: #27272a;
  font-size: 0.8rem;
  line-height: 1.1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-goal-actions,
.thread-goal-edit {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.thread-goal-edit {
  margin-top: 0.2rem;
}

.thread-goal-input {
  min-width: 8rem;
  flex: 1 1 auto;
  border: 1px solid rgb(161 98 7 / 25%);
  border-radius: 0.4rem;
  background: rgb(255 255 255 / 75%);
  padding: 0.25rem 0.4rem;
  color: #27272a;
  font-size: 0.8rem;
  outline: none;
}

.thread-goal-input:focus {
  border-color: rgb(217 119 6 / 55%);
  box-shadow: 0 0 0 2px rgb(245 158 11 / 12%);
}

.thread-goal-action {
  flex: 0 0 auto;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  padding: 0.22rem 0.35rem;
  color: #71717a;
  font-size: 0.7rem;
  line-height: 1rem;
  cursor: pointer;
}

.thread-goal-action:hover:not(:disabled) {
  background: rgb(217 119 6 / 9%);
  color: #92400e;
}

.thread-goal-action.is-primary {
  color: #a16207;
}

.thread-goal-action.is-danger:hover:not(:disabled) {
  background: rgb(220 38 38 / 8%);
  color: #b91c1c;
}

.thread-goal-action:disabled,
.thread-goal-input:disabled {
  cursor: default;
  opacity: 0.5;
}

.thread-goal-bar.is-paused,
.thread-goal-bar.is-blocked,
.thread-goal-bar.is-usageLimited,
.thread-goal-bar.is-budgetLimited {
  border-color: rgb(113 113 122 / 20%);
  background: rgb(244 244 245 / 86%);
}

.thread-goal-bar.is-complete {
  border-color: rgb(22 163 74 / 20%);
  background: rgb(240 253 244 / 86%);
}

:global(:root.dark .thread-goal-bar) {
  border-color: rgb(245 158 11 / 18%);
  background: rgb(120 53 15 / 13%);
  color: #d4d4d8;
}

:global(:root.dark .thread-goal-heading),
:global(:root.dark .thread-goal-action) {
  color: #a1a1aa;
}

:global(:root.dark .thread-goal-heading strong),
:global(:root.dark .thread-goal-action.is-primary),
:global(:root.dark .thread-goal-action:hover:not(:disabled)) {
  color: #fbbf24;
}

:global(:root.dark .thread-goal-objective),
:global(:root.dark .thread-goal-input) {
  color: #f4f4f5;
}

:global(:root.dark .thread-goal-input) {
  border-color: rgb(245 158 11 / 25%);
  background: rgb(24 24 27 / 70%);
}

:global(:root.dark .thread-goal-bar.is-paused),
:global(:root.dark .thread-goal-bar.is-blocked),
:global(:root.dark .thread-goal-bar.is-usageLimited),
:global(:root.dark .thread-goal-bar.is-budgetLimited) {
  border-color: rgb(161 161 170 / 16%);
  background: rgb(39 39 42 / 70%);
}

:global(:root.dark .thread-goal-bar.is-complete) {
  border-color: rgb(74 222 128 / 18%);
  background: rgb(20 83 45 / 20%);
}

@media (max-width: 640px) {
  .thread-goal-bar {
    align-items: flex-start;
    flex-wrap: wrap;
    margin-inline: 0.5rem;
  }

  .thread-goal-actions {
    width: 100%;
    justify-content: flex-end;
    padding-left: 1.8rem;
  }

  .thread-goal-edit {
    flex-wrap: wrap;
  }

  .thread-goal-input {
    width: 100%;
    flex-basis: 100%;
  }
}
</style>
