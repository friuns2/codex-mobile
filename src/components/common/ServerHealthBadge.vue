<template>
  <div
    class="server-health-badge"
    :data-tone="presentation.tone"
    role="status"
    aria-live="polite"
    :aria-label="presentation.label"
    :title="presentation.label"
  >
    <span class="server-health-indicator" aria-hidden="true">
      <span class="server-health-dot" />
    </span>
    <span class="server-health-label">{{ presentation.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CodexAppServerHealth } from '../../realtimeProtocol'
import { presentServerHealth } from '../../serverHealthPresentation'

const props = defineProps<{
  health: CodexAppServerHealth | null
}>()

const presentation = computed(() => presentServerHealth(props.health))
</script>
