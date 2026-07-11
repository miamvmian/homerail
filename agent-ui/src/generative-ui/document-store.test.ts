import { describe, expect, it } from 'vitest'
import type {
  GenerativeUiCompositionV1,
  GenerativeUiDocumentV1,
  GenerativeUiStoredNodeV1,
  GenerativeUiTransactionV1,
} from 'homerail-protocol'
import { GenerativeUiProjectionCache } from './document-store'
import type {
  GenerativeUiProjectionV1,
  GenerativeUiSnapshotStreamEventV1,
  GenerativeUiTransactionStreamEventV1,
} from './types'

const updatedAt = '2026-07-11T19:00:00.000Z'

function node(id = 'note'): GenerativeUiStoredNodeV1 {
  return {
    ir_version: 1,
    id,
    kind: 'com.homerail.core/notice',
    kind_version: 1,
    owner: { id: 'com.homerail.core', version: '0.1.0' },
    surface: 'task',
    importance: 'secondary',
    content: {},
    fallback: { title: `Fallback ${id}` },
    revision: 1,
    updated_at: updatedAt,
  }
}

function document(): GenerativeUiDocumentV1 {
  return {
    ir_version: 1,
    document_id: 'projection-document',
    scope: { type: 'voice_session', id: 'voice-session-1' },
    revision: 1,
    nodes: [node()],
    updated_at: updatedAt,
  }
}

function composition(): GenerativeUiCompositionV1 {
  return {
    composition_version: 1,
    document_id: 'projection-document',
    document_revision: 1,
    context: {
      device: 'desktop',
      input: 'mouse',
      viewport: 'wide',
      attention: 'focused',
      active_session_id: 'voice-session-1',
    },
    items: [{
      node_id: 'note',
      node_revision: 1,
      surface: 'task',
      variant: 'summary',
      rank: 1,
      placement: 'primary',
      pinned: false,
      visibility: 'visible',
    }],
    hidden_node_ids: [],
  }
}

function projection(): GenerativeUiProjectionV1 {
  return {
    stream_version: 1,
    mode: 'shadow',
    authoritative: false,
    purpose: 'legacy_widget_shadow',
    document: document(),
    cursor: 1,
    overrides: [],
    composition: composition(),
    ui_registry: {
      registry_revision: 1,
      registry_fingerprint: '0'.repeat(64),
      kinds: [],
      renderers: [],
      actions: [],
    },
  }
}

function transaction(baseRevision: number, transactionId: string): GenerativeUiTransactionV1 {
  const { revision: _revision, updated_at: _updatedAt, ...unstoredNode } = node()
  void _revision
  void _updatedAt
  return {
    ir_version: 1,
    transaction_id: transactionId,
    document_id: 'projection-document',
    base_revision: baseRevision,
    actor: { type: 'system', id: 'legacy-widget-shadow' },
    operations: [{
      op: 'put',
      node: unstoredNode,
    }],
    created_at: updatedAt,
  }
}

function transactionEvent(seq: number, baseRevision: number): GenerativeUiTransactionStreamEventV1 {
  const input = transaction(baseRevision, `transaction-${seq}`)
  return {
    type: 'generative_ui',
    event: 'transaction',
    stream_version: 1,
    authoritative: false,
    purpose: 'legacy_widget_shadow',
    seq,
    document_id: input.document_id,
    transaction_id: input.transaction_id,
    committed_revision: baseRevision + 1,
    committed_at: updatedAt,
    revision: baseRevision + 1,
    transaction: input,
  }
}

describe('GenerativeUiProjectionCache', () => {
  it('accepts an atomic projection and never exposes mutable canonical references', () => {
    const cache = new GenerativeUiProjectionCache()
    cache.acceptProjection(projection())
    const first = cache.current()!
    first.document.nodes[0].fallback.title = 'mutated'
    first.ui_registry.registry_fingerprint = 'f'.repeat(64)
    expect(cache.current()?.document.nodes[0].fallback.title).toBe('Fallback note')
    expect(cache.current()?.ui_registry.registry_fingerprint).toBe('0'.repeat(64))
    expect(cache.cursor).toBe(1)
    expect(cache.stale).toBe(false)
  })

  it('accepts a registry-only revision without requiring a document revision', () => {
    const cache = new GenerativeUiProjectionCache()
    cache.acceptProjection(projection())
    const updated = projection()
    updated.ui_registry.registry_revision = 2
    updated.ui_registry.registry_fingerprint = '1'.repeat(64)
    cache.acceptProjection(updated)
    expect(cache.current()?.document.revision).toBe(1)
    expect(cache.current()?.ui_registry.registry_revision).toBe(2)
  })

  it('accepts snapshot stream events and ignores ledger rows already covered by the snapshot cursor', () => {
    const cache = new GenerativeUiProjectionCache()
    const current = projection()
    const snapshot: GenerativeUiSnapshotStreamEventV1 = {
      type: 'generative_ui',
      event: 'snapshot',
      stream_version: 1,
      authoritative: false,
      purpose: 'legacy_widget_shadow',
      document: current.document,
      cursor: current.cursor,
      overrides: current.overrides,
      composition: current.composition,
      ui_registry: current.ui_registry,
    }
    expect(cache.acceptStreamEvent(snapshot)).toBe('applied_snapshot')
    expect(cache.acceptStreamEvent(transactionEvent(1, 0))).toBe('ignored_replay')
    expect(cache.stale).toBe(false)
  })

  it('invalidates instead of locally composing when a new transaction arrives', () => {
    const cache = new GenerativeUiProjectionCache()
    cache.acceptProjection(projection())
    expect(cache.acceptStreamEvent(transactionEvent(2, 1))).toBe('refresh_required')
    expect(cache.stale).toBe(true)
    expect(cache.current()?.document.revision).toBe(1)
  })

  it('rejects stale composition partitions and malformed transaction metadata', () => {
    const cache = new GenerativeUiProjectionCache()
    const invalid = projection()
    invalid.composition.items[0].node_revision = 2
    expect(() => cache.acceptProjection(invalid)).toThrow('stale node')

    const invalidContext = projection()
    invalidContext.composition.context.device = 'watch' as never
    expect(() => cache.acceptProjection(invalidContext)).toThrow('composition context')

    const invalidRegistry = projection()
    invalidRegistry.ui_registry.registry_fingerprint = 'not-a-digest'
    expect(() => cache.acceptProjection(invalidRegistry)).toThrow('plugin registry projection')

    cache.acceptProjection(projection())
    const invalidEvent = transactionEvent(2, 1)
    invalidEvent.committed_revision = 9
    expect(() => cache.acceptStreamEvent(invalidEvent)).toThrow('Invalid Generative UI transaction')
  })

  it('clears projection and invalidation state together', () => {
    const cache = new GenerativeUiProjectionCache()
    cache.acceptProjection(projection())
    cache.acceptStreamEvent(transactionEvent(2, 1))
    cache.clear()
    expect(cache.current()).toBeNull()
    expect(cache.cursor).toBe(0)
    expect(cache.stale).toBe(false)
  })
})
