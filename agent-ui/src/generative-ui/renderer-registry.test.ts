import { defineComponent, h, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import type { GenerativeUiStoredNodeV1 } from 'homerail-protocol'
import { coreGenerativeUiRendererRegistry } from './core-renderer-registry'
import { legacyWidgetFromGenerativeUiNode } from './legacy-widget-adapter'
import {
  GenerativeUiRendererRegistry,
  type GenerativeUiRendererRegistrationV1,
} from './renderer-registry'

const Core = defineComponent({ name: 'CoreProjection', render: () => h('div', 'core') })
const Specialized = defineComponent({ name: 'SpecializedRenderer', render: () => h('div', 'specialized') })

function node(input: Partial<GenerativeUiStoredNodeV1> = {}): GenerativeUiStoredNodeV1 {
  return {
    ir_version: 1,
    id: 'registry-node',
    kind: 'com.example.plugin/card',
    kind_version: 1,
    owner: { id: 'com.example.plugin', version: '1.0.0' },
    surface: 'task',
    importance: 'secondary',
    content: {},
    fallback: { title: 'Portable card', summary: 'Readable without the plugin.' },
    revision: 1,
    updated_at: '2026-07-11T19:00:00.000Z',
    ...input,
  }
}

function registration(
  mode: GenerativeUiRendererRegistrationV1['mode'],
  component = Core,
): GenerativeUiRendererRegistrationV1 {
  return {
    renderer_api_version: 1,
    kind: 'com.example.plugin/card',
    kind_version: 1,
    surface: 'task',
    device: 'desktop',
    mode,
    component,
  }
}

describe('GenerativeUiRendererRegistry', () => {
  it('resolves exact specialized renderer before an exact Core projection', () => {
    const registry = new GenerativeUiRendererRegistry([
      registration('core_projection'),
      registration('specialized', Specialized),
    ])
    expect(registry.resolve(node(), 'task', 'desktop')).toMatchObject({
      mode: 'specialized',
      component: Specialized,
    })
    expect(Object.isFrozen(registry)).toBe(true)
    expect(Object.isFrozen(registry.registrations)).toBe(true)
  })

  it('never fuzzily matches kind version, surface or device', () => {
    const registry = new GenerativeUiRendererRegistry([registration('specialized', Specialized)])
    expect(registry.resolve(node({ kind_version: 2 }), 'task', 'desktop').mode).toBe('fallback')
    expect(registry.resolve(node(), 'result', 'desktop').mode).toBe('fallback')
    expect(registry.resolve(node(), 'task', 'phone').mode).toBe('fallback')
  })

  it('returns the portable fallback for unknown kinds and an explicit diagnostic for corrupt fallback', () => {
    const registry = new GenerativeUiRendererRegistry([])
    expect(registry.resolve(node({ kind: 'com.unknown.plugin/result' }), 'task', 'tv')).toEqual({
      mode: 'fallback',
      reason: 'renderer_not_registered',
    })
    expect(registry.resolve(node({ fallback: { title: '' } }), 'task', 'tv')).toEqual({
      mode: 'unavailable',
      reason: 'portable_fallback_invalid',
    })
  })

  it('rejects duplicate exact registrations within one trust tier', () => {
    expect(() => new GenerativeUiRendererRegistry([
      registration('specialized'),
      registration('specialized', Specialized),
    ])).toThrow('Duplicate specialized renderer')
  })

  it.each(['phone', 'desktop', 'tv'] as const)('statically registers the topic-outline renderer for %s', device => {
    const topic = node({
      kind: 'com.homerail.content/topic_outline',
      owner: { id: 'com.homerail.content', version: '0.1.0' },
      content: { legacy_widget: legacyWidget() },
    })
    expect(coreGenerativeUiRendererRegistry.resolve(topic, 'task', device).mode).toBe('specialized')
    expect(coreGenerativeUiRendererRegistry.resolve({ ...topic, kind_version: 2 }, 'task', device).mode)
      .toBe('fallback')
  })
})

function legacyWidget(): Record<string, unknown> {
  return {
    id: 'registry-node',
    type: 'topic_outline',
    title: 'Topic outline',
    body: 'Brief',
    priority: 'normal',
    status: 'ready',
    items: [],
    steps: [],
    active_step: null,
    data: { outline: [] },
  }
}

describe('legacyWidgetFromGenerativeUiNode', () => {
  it('materializes a defensive legacy compatibility value without routing on widget.type', () => {
    const source = node({ content: { legacy_widget: legacyWidget() } })
    const widget = legacyWidgetFromGenerativeUiNode(source)
    expect(widget).toMatchObject({ id: source.id, type: 'topic_outline', data: { outline: [] } })
    widget.data.outline = ['mutated']
    expect((source.content.legacy_widget as { data: { outline: unknown[] } }).data.outline).toEqual([])
  })

  it('unwraps Vue projection proxies before cloning legacy JSON data', () => {
    const source = reactive(node({ content: { legacy_widget: legacyWidget() } }))
    expect(legacyWidgetFromGenerativeUiNode(source)).toMatchObject({
      id: 'registry-node',
      data: { outline: [] },
    })
  })

  it('rejects identity mismatches and malformed compatibility payloads', () => {
    expect(() => legacyWidgetFromGenerativeUiNode(node({
      content: { legacy_widget: { ...legacyWidget(), id: 'other' } },
    }))).toThrow('does not match')
    expect(() => legacyWidgetFromGenerativeUiNode(node({ content: {} }))).toThrow('no legacy widget payload')
  })
})
