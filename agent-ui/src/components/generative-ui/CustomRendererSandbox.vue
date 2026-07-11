<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import type {
  GenerativeUiCompositionItemV1,
  GenerativeUiStoredNodeV1,
  GenerativeUiSurfaceContextV1,
} from 'homerail-protocol'
import { getCustomRendererSource } from '@/api/services/custom-renderer-api'
import type {
  GenerativeUiCustomRendererSourceV1,
  GenerativeUiRendererRegistrationV1,
} from '@/generative-ui/renderer-registry'
import {
  buildCustomRendererSrcdoc,
  createCustomRendererNonce,
  customRendererInitEnvelope,
  readCustomRendererBridgeMessage,
  sha256Utf8,
  type CustomRendererIdentityV1,
} from '@/generative-ui/custom-renderer-bridge'

const props = defineProps<{
  node: GenerativeUiStoredNodeV1
  placement: GenerativeUiCompositionItemV1
  context: GenerativeUiSurfaceContextV1
  registration: GenerativeUiRendererRegistrationV1
  source: GenerativeUiCustomRendererSourceV1
  actionIds: string[]
}>()

const emit = defineEmits<{
  (event: 'action', actionId: string): void
  (event: 'renderer-error', payload: { message: string }): void
}>()

const iframe = ref<HTMLIFrameElement | null>(null)
const srcdoc = ref<string>()
const frameHeight = ref(160)
let generation = 0
let loaded = false
let failed = false
let nonce = ''
let identity: CustomRendererIdentityV1 | undefined

const sourceKey = computed(() => [
  props.registration.plugin_id,
  props.registration.plugin_version,
  props.registration.renderer_id,
  props.source.file,
  props.source.digest,
  props.node.id,
  props.node.revision,
].join('\0'))

function fail(cause: unknown): void {
  if (failed) return
  failed = true
  srcdoc.value = undefined
  const message = cause instanceof Error ? cause.message : String(cause || 'Custom Renderer failed')
  emit('renderer-error', { message: message.slice(0, 500) })
}

async function load(): Promise<void> {
  const current = ++generation
  loaded = false
  failed = false
  srcdoc.value = undefined
  identity = undefined
  try {
    nonce = createCustomRendererNonce()
    const response = await getCustomRendererSource({
      plugin_id: props.registration.plugin_id,
      plugin_version: props.registration.plugin_version,
      manifest_digest: props.registration.manifest_digest!,
      renderer_id: props.registration.renderer_id,
      file: props.source.file,
      digest: props.source.digest,
    })
    if (current !== generation) return
    if (await sha256Utf8(response.content) !== props.source.digest) {
      throw new Error('Custom Renderer source digest mismatch')
    }
    if (current !== generation) return
    identity = {
      plugin_id: props.registration.plugin_id,
      plugin_version: props.registration.plugin_version,
      renderer_id: props.registration.renderer_id,
      renderer_digest: props.source.digest,
      node_id: props.node.id,
      node_revision: props.node.revision,
    }
    srcdoc.value = buildCustomRendererSrcdoc({
      source: response.content,
      nonce,
      identity,
      parent_origin: window.location.origin,
    })
  } catch (cause) {
    if (current === generation) fail(cause)
  }
}

function initializeFrame(): void {
  if (!iframe.value?.contentWindow || !identity || !srcdoc.value || failed) return
  if (loaded) {
    fail(new Error('Custom Renderer attempted to navigate its sandbox'))
    return
  }
  loaded = true
  iframe.value.contentWindow.postMessage(customRendererInitEnvelope(identity, nonce, {
    node: structuredClone(toRaw(props.node)),
    placement: structuredClone(toRaw(props.placement)),
    context: structuredClone(toRaw(props.context)),
  }, props.actionIds), window.location.origin)
}

function handleMessage(event: MessageEvent): void {
  if (!identity || !iframe.value?.contentWindow || failed) return
  const message = readCustomRendererBridgeMessage(event, {
    source: iframe.value.contentWindow,
    origin: window.location.origin,
    identity,
    nonce,
    action_ids: new Set(props.actionIds),
  })
  if (!message) return
  if (message.type === 'homerail.custom-renderer.resize') {
    frameHeight.value = message.height
  } else if (message.type === 'homerail.custom-renderer.error') {
    fail(new Error(message.message))
  } else if (message.type === 'homerail.custom-renderer.action') {
    // Chromium propagates transient user activation from a sandboxed child to
    // its ancestor. Fail closed where that signal is unavailable.
    if (navigator.userActivation?.isActive !== true) return
    emit('action', message.action_id)
  }
}

watch(sourceKey, () => { void load() })

onMounted(() => {
  window.addEventListener('message', handleMessage)
  void load()
})

onUnmounted(() => {
  generation += 1
  window.removeEventListener('message', handleMessage)
})
</script>

<template>
  <iframe
    v-if="srcdoc"
    ref="iframe"
    class="custom-renderer-sandbox"
    data-testid="generative-ui-custom-renderer"
    sandbox="allow-scripts allow-same-origin"
    credentialless
    referrerpolicy="no-referrer"
    allow="camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; clipboard-read 'none'; clipboard-write 'none'; fullscreen 'none'; payment 'none'; usb 'none'; serial 'none'; hid 'none'"
    :srcdoc="srcdoc"
    :style="{ height: `${frameHeight}px` }"
    :title="`Custom Renderer ${registration.plugin_id}:${registration.renderer_id}`"
    @load="initializeFrame"
  />
</template>

<style scoped>
.custom-renderer-sandbox {
  display: block;
  width: 100%;
  min-height: 48px;
  border: 0;
  background: transparent;
}
</style>
