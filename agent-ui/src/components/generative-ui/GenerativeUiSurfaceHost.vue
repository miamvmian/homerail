<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  GenerativeUiCompositionV1,
  GenerativeUiDocumentV1,
  GenerativeUiPlacement,
  GenerativeUiSurface,
} from 'homerail-protocol'
import {
  emptyGenerativeUiActionRegistry,
  GenerativeUiActionRegistry,
} from '@/generative-ui/action-registry'
import { resolveGenerativeUiFocusIndex, type GenerativeUiFocusDirection } from '@/generative-ui/focus-navigation'
import {
  emptyGenerativeUiRendererRegistry,
  GenerativeUiRendererRegistry,
} from '@/generative-ui/renderer-registry'
import type {
  GenerativeUiActionRequestV1,
  GenerativeUiPreviewRequestV1,
} from '@/generative-ui/types'
import GenerativeUiNodeHost from './GenerativeUiNodeHost.vue'

const props = withDefaults(defineProps<{
  document: GenerativeUiDocumentV1
  composition: GenerativeUiCompositionV1
  registry?: GenerativeUiRendererRegistry
  actionRegistry?: GenerativeUiActionRegistry
  surface?: GenerativeUiSurface
  placement?: GenerativeUiPlacement | 'all'
  interactive?: boolean
}>(), {
  surface: undefined,
  placement: 'all',
  interactive: true,
})

const emit = defineEmits<{
  (event: 'action', payload: GenerativeUiActionRequestV1): void
  (event: 'open-preview', payload: GenerativeUiPreviewRequestV1): void
  (event: 'renderer-error', payload: { node_id: string; message: string }): void
  (event: 'focus-node', payload: { node_id: string }): void
}>()

const root = ref<HTMLElement | null>(null)
const registry = computed(() => props.registry ?? emptyGenerativeUiRendererRegistry)
const actionRegistry = computed(() => props.actionRegistry ?? emptyGenerativeUiActionRegistry)
const nodesById = computed(() => new Map(props.document.nodes.map(node => [node.id, node])))
const rendered = computed(() => props.composition.items
  .filter(item => !props.surface || item.surface === props.surface)
  .filter(item => props.placement === 'all' || item.placement === props.placement)
  .map(item => ({ item, node: nodesById.value.get(item.node_id) }))
  .filter((entry): entry is { item: typeof entry.item; node: NonNullable<typeof entry.node> } => Boolean(entry.node)))

function focusableNodes(): HTMLElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLElement>('[data-generative-ui-node]') ?? [])
}

function focus(direction: GenerativeUiFocusDirection): void {
  const elements = focusableNodes()
  const currentIndex = elements.findIndex(element => element === document.activeElement)
  const index = resolveGenerativeUiFocusIndex(currentIndex, elements.length, direction)
  if (index < 0) return
  elements[index].focus()
  emit('focus-node', { node_id: elements[index].dataset.generativeUiNode || '' })
}

function focusNode(nodeId: string): boolean {
  const target = focusableNodes().find(element => element.dataset.generativeUiNode === nodeId)
  if (!target) return false
  target.focus()
  emit('focus-node', { node_id: nodeId })
  return true
}

function onKeydown(event: KeyboardEvent): void {
  const direction: GenerativeUiFocusDirection | null =
    event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 'next'
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 'previous'
        : event.key === 'Home' ? 'first'
          : event.key === 'End' ? 'last'
            : null
  if (!direction) return
  event.preventDefault()
  focus(direction)
}

defineExpose({ focus, focusNode })
</script>

<template>
  <section
    ref="root"
    class="generative-ui-surface-host"
    :data-device="composition.context.device"
    :data-viewport="composition.context.viewport"
    :data-surface="surface || 'all'"
    @keydown="onKeydown"
  >
    <GenerativeUiNodeHost
      v-for="entry in rendered"
      :key="`${entry.node.id}:${entry.node.revision}`"
      :document-id="document.document_id"
      :node="entry.node"
      :placement="entry.item"
      :context="composition.context"
      :registry="registry"
      :action-registry="actionRegistry"
      :interactive="interactive"
      @action="emit('action', $event)"
      @open-preview="emit('open-preview', $event)"
      @renderer-error="emit('renderer-error', $event)"
    />
  </section>
</template>

<style scoped>
.generative-ui-surface-host {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 14px;
  min-width: 0;
  min-height: 0;
}

.generative-ui-surface-host[data-device='phone'],
.generative-ui-surface-host[data-viewport='compact'] {
  grid-template-columns: minmax(0, 1fr);
}

.generative-ui-surface-host[data-device='tv'] {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.generative-ui-surface-host :deep([data-placement='overflow']) {
  opacity: 0.82;
}

.generative-ui-surface-host :deep(.generative-ui-node-host--glance) {
  min-height: 150px;
}

.generative-ui-surface-host :deep(.generative-ui-node-host--summary) {
  min-height: 220px;
}

.generative-ui-surface-host :deep(.generative-ui-node-host--detail) {
  grid-column: span 2;
  min-height: 360px;
}

.generative-ui-surface-host[data-device='phone'] :deep(.generative-ui-node-host--detail),
.generative-ui-surface-host[data-viewport='compact'] :deep(.generative-ui-node-host--detail) {
  grid-column: span 1;
  min-height: 320px;
}
</style>
