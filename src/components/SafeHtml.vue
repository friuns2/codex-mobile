<template>
  <component :is="tag" v-if="sanitizedHtml" v-html="sanitizedHtml" />
  <slot v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeHtml } from '../utils/sanitizeHtml'

const props = withDefaults(
  defineProps<{
    html?: string
    tag?: string
  }>(),
  {
    html: '',
    tag: 'div',
  },
)

const sanitizedHtml = computed(() => {
  if (!props.html) return ''
  return sanitizeHtml(props.html)
})
</script>
