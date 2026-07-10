import { describe, expect, it } from 'vitest'

import {
  asAgentRecord,
  getAgentArray,
  getAgentDataPayload,
  normalizeChatMessage,
  normalizeProject,
  normalizeRunSummary,
  normalizeSession
} from './agent.types'

describe('agent facade normalization', () => {
  it('rejects arrays and primitives as records and arrays only real arrays', () => {
    expect(asAgentRecord(null)).toEqual({})
    expect(asAgentRecord(['not', 'a', 'record'])).toEqual({})
    expect(asAgentRecord({ id: 'record' })).toEqual({ id: 'record' })
    expect(getAgentArray({ 0: 'not-an-array' })).toEqual([])
    expect(getAgentArray(['message'])).toEqual(['message'])
  })

  it('unwraps data payloads without discarding unwrapped responses', () => {
    expect(getAgentDataPayload({ data: { id: 'wrapped' } })).toEqual({ id: 'wrapped' })
    expect(getAgentDataPayload({ id: 'direct' })).toEqual({ id: 'direct' })
  })

  it('normalizes projects and sessions with stable empty defaults', () => {
    expect(normalizeProject({ id: 'p1', name: 'HomeRail', status: 'active' })).toEqual({
      id: 'p1',
      name: 'HomeRail',
      description: '',
      status: 'active',
      created_at: '',
      updated_at: ''
    })
    expect(normalizeSession({ session_id: 's1', metadata: null })).toEqual({
      id: 's1',
      project_id: '',
      status: '',
      created_at: '',
      updated_at: '',
      metadata: {}
    })
  })

  it('normalizes text and structured chat content without losing evidence fields', () => {
    expect(
      normalizeChatMessage({
        type: 'assistant',
        content: { answer: 42 },
        created_at: '2026-07-10T00:00:00Z',
        run_id: 'run-1',
        evidence_id: 'evidence-1'
      })
    ).toEqual({
      role: 'assistant',
      content: '{"answer":42}',
      timestamp: '2026-07-10T00:00:00Z',
      run_id: 'run-1',
      evidence_id: 'evidence-1'
    })
  })

  it('accepts both run_id and id when normalizing run summaries', () => {
    expect(normalizeRunSummary({ run_id: 'run-1', status: 'completed' })).toEqual({
      id: 'run-1',
      status: 'completed',
      created_at: '',
      completed_at: undefined
    })
    expect(normalizeRunSummary({ id: 'run-2', completed_at: 'later' }).id).toBe('run-2')
  })
})
