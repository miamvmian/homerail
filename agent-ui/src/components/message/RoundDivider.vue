<script setup lang="ts">
import { computed } from 'vue'
import type { RoundStartMessage } from '@/api/types/run.types'

// ============================================================================
// Props
// ============================================================================

const props = defineProps<{
  round: RoundStartMessage
  isFirst?: boolean
}>()

// ============================================================================
// Computed
// ============================================================================

const roundLabel = computed(() => {
  return `第 ${props.round.round_id} 轮`
})
</script>

<template>
  <div class="round-divider" :class="{ 'is-first': isFirst }">
    <div class="round-line"></div>
    <div class="round-badge">
      <span class="round-number">{{ roundLabel }}</span>
    </div>
    <div class="round-line"></div>
  </div>
</template>

<style scoped>
.round-divider {
  @apply flex items-center gap-3 py-3 my-3;
}

.round-divider.is-first {
  @apply mt-0;
}

.round-line {
  @apply flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent;
}

.round-badge {
  @apply px-3 py-1 bg-slate-100 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm;
}

.round-number {
  @apply font-medium text-slate-600 dark:text-slate-400 text-xs tracking-wide;
}
</style>
