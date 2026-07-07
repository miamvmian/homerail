import { describe, expect, it } from 'vitest'
import { buildDagTraversalOrder, nextDagTraversalNodeId } from './dagTraversal'

describe('dag runtime traversal', () => {
  it('orders fan-out branches before their fan-in summary', () => {
    const nodes = [
      { id: 'commander' },
      { id: 'summary' },
      { id: 'runtime_review' },
      { id: 'persistence_review' },
    ]
    const edges = [
      { source: 'commander', target: 'runtime_review' },
      { source: 'commander', target: 'persistence_review' },
      { source: 'runtime_review', target: 'summary' },
      { source: 'persistence_review', target: 'summary' },
    ]

    expect(buildDagTraversalOrder(nodes, edges)).toEqual([
      'commander',
      'runtime_review',
      'persistence_review',
      'summary',
    ])
  })

  it('moves left and right through the traversal order with wraparound', () => {
    const nodes = [
      { id: 'commander' },
      { id: 'summary' },
      { id: 'runtime_review' },
      { id: 'persistence_review' },
    ]
    const edges = [
      { source: 'commander', target: 'runtime_review' },
      { source: 'commander', target: 'persistence_review' },
      { source: 'runtime_review', target: 'summary' },
      { source: 'persistence_review', target: 'summary' },
    ]

    expect(nextDagTraversalNodeId(nodes, edges, 'runtime_review', 1)).toBe('persistence_review')
    expect(nextDagTraversalNodeId(nodes, edges, 'summary', 1)).toBe('commander')
    expect(nextDagTraversalNodeId(nodes, edges, 'commander', -1)).toBe('summary')
  })

  it('uses node dependencies when explicit edges are missing', () => {
    const nodes = [
      { id: 'plan' },
      { id: 'implement', dependencies: ['plan'] },
      { id: 'verify', dependencies: ['implement'] },
    ]

    expect(buildDagTraversalOrder(nodes, [])).toEqual(['plan', 'implement', 'verify'])
  })
})
