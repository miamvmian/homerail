import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import type {
  GenerativeUiCompositionItemV1,
  GenerativeUiStoredNodeV1,
  GenerativeUiSurfaceContextV1,
} from 'homerail-protocol'
import { getCustomRendererSource } from '@/api/services/custom-renderer-api'
import type { GenerativeUiRendererRegistrationV1 } from '@/generative-ui/renderer-registry'
import CustomRendererSandbox from './CustomRendererSandbox.vue'

vi.mock('@/api/services/custom-renderer-api', () => ({
  getCustomRendererSource: vi.fn(),
}))

const source = 'export function render(payload) { return { view_version: 1, root: { type: "text", text: String(payload?.node?.id || "safe") } } }'
const digest = '8fc92d1105e182fb1b3980494b1ad64caa58cda5b65054546e3be9920c73e7b7'
const manifestDigest = 'b'.repeat(64)

const node: GenerativeUiStoredNodeV1 = {
  ir_version: 1,
  id: 'node-one',
  kind: 'com.example.cards/card',
  kind_version: 1,
  owner: { id: 'com.example.cards', version: '1.0.0' },
  surface: 'task',
  importance: 'secondary',
  content: { title: 'Sandboxed' },
  fallback: { title: 'Portable card' },
  actions: [{ id: 'approve', label: 'Approve', intent: 'com.example.cards:approve' }],
  revision: 4,
  updated_at: '2026-07-12T00:00:00.000Z',
}
const placement: GenerativeUiCompositionItemV1 = {
  node_id: node.id,
  node_revision: node.revision,
  surface: 'task',
  variant: 'summary',
  rank: 0,
  placement: 'primary',
  pinned: false,
  visibility: 'visible',
}
const context: GenerativeUiSurfaceContextV1 = {
  device: 'desktop', input: 'mouse', viewport: 'wide', attention: 'focused',
}
const registration: GenerativeUiRendererRegistrationV1 = {
  renderer_api_version: 1,
  plugin_id: node.owner.id,
  plugin_version: node.owner.version,
  manifest_digest: manifestDigest,
  renderer_id: 'card-custom',
  kind: node.kind,
  kind_version: node.kind_version,
  surface: 'task',
  device: 'desktop',
  mode: 'custom',
  custom_source: { type: 'custom', file: 'ui/card.mjs', digest },
}

let app: App<Element> | undefined
let root: HTMLElement | undefined
let originalCrypto: Crypto

async function flush(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  originalCrypto = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  })
  vi.mocked(getCustomRendererSource).mockResolvedValue({
    bridge_api: 1,
    renderer_api: 1,
    plugin_id: registration.plugin_id,
    plugin_version: registration.plugin_version,
    manifest_digest: manifestDigest,
    renderer_id: registration.renderer_id,
    file: 'ui/card.mjs',
    digest,
    media_type: 'text/javascript',
    content: source,
  })
})

afterEach(() => {
  app?.unmount()
  root?.remove()
  app = undefined
  root = undefined
  Object.defineProperty(globalThis, 'crypto', {
    value: originalCrypto,
    configurable: true,
  })
  vi.clearAllMocks()
})

describe('CustomRendererSandbox', () => {
  it('creates a trusted same-origin bootstrap iframe with no plugin DOM or network authority', async () => {
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp(CustomRendererSandbox, {
      node,
      placement,
      context,
      registration,
      source: registration.custom_source,
      actionIds: ['approve'],
    })
    app.mount(root)
    await flush()
    await vi.waitFor(() => expect(root!.querySelector('iframe')).toBeTruthy())

    const frame = root.querySelector<HTMLIFrameElement>('iframe')
    expect(frame).toBeTruthy()
    expect(frame!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(frame!.getAttribute('sandbox')).not.toContain('allow-top-navigation')
    expect(frame!.getAttribute('sandbox')).not.toContain('allow-popups')
    expect(frame!.getAttribute('sandbox')).not.toContain('allow-forms')
    expect(frame!.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(frame!.hasAttribute('credentialless')).toBe(true)
    expect(frame!.getAttribute('allow')).not.toContain("camera *")
    expect(frame!.srcdoc).toContain("default-src 'none'")
    expect(frame!.srcdoc).toContain("connect-src 'none'")
    expect(frame!.srcdoc).toContain('worker-src blob:')
    expect(frame!.srcdoc).toContain('new Worker(workerUrl')
    expect(frame!.srcdoc).not.toContain('moduleRender({ root')
    expect(frame!.srcdoc).toContain('event.source !== parent')
    expect(frame!.srcdoc).toContain('event.origin !== parentOrigin')
    expect(getCustomRendererSource).toHaveBeenCalledWith(expect.objectContaining({
      plugin_id: node.owner.id,
      plugin_version: node.owner.version,
      manifest_digest: manifestDigest,
      renderer_id: registration.renderer_id,
      digest,
    }))
  })

  it('fails closed before creating an iframe when source bytes do not match the projection digest', async () => {
    vi.mocked(getCustomRendererSource).mockResolvedValueOnce({
      ...(await getCustomRendererSource({
        plugin_id: registration.plugin_id,
        plugin_version: registration.plugin_version,
        manifest_digest: manifestDigest,
        renderer_id: registration.renderer_id,
        file: 'ui/card.mjs',
        digest,
      })),
      content: `${source}\n// tampered`,
    })
    const onRendererError = vi.fn()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp(CustomRendererSandbox, {
      node,
      placement,
      context,
      registration,
      source: registration.custom_source,
      actionIds: ['approve'],
      onRendererError,
    })
    app.mount(root)
    await flush()
    await vi.waitFor(() => expect(onRendererError).toHaveBeenCalled())
    expect(root.querySelector('iframe')).toBeNull()
    expect(onRendererError).toHaveBeenCalledWith({ message: 'Custom Renderer source digest mismatch' })
  })
})
