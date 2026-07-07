export type DagTraversalNode = {
  id: string
  dependencies?: string[]
}

export type DagTraversalEdge = {
  source: string
  target: string
}

function insertSorted(items: string[], value: string, compare: (a: string, b: string) => number): void {
  const existing = items.indexOf(value)
  if (existing >= 0) items.splice(existing, 1)
  const index = items.findIndex(item => compare(value, item) < 0)
  if (index < 0) items.push(value)
  else items.splice(index, 0, value)
}

export function buildDagTraversalOrder(
  nodes: DagTraversalNode[],
  edges: DagTraversalEdge[],
): string[] {
  const nodeIds: string[] = []
  const seenIds = new Set<string>()
  for (const node of nodes) {
    if (!node.id || seenIds.has(node.id)) continue
    seenIds.add(node.id)
    nodeIds.push(node.id)
  }
  if (!nodeIds.length) return []

  const nodeIdSet = new Set(nodeIds)
  const nodeIndex = new Map(nodeIds.map((id, index) => [id, index]))
  const compareNode = (a: string, b: string) =>
    (nodeIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (nodeIndex.get(b) ?? Number.MAX_SAFE_INTEGER)
    || a.localeCompare(b)

  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  const edgeKeys = new Set<string>()
  for (const id of nodeIds) {
    outgoing.set(id, [])
    indegree.set(id, 0)
  }

  const addEdge = (source: string, target: string) => {
    if (!nodeIdSet.has(source) || !nodeIdSet.has(target) || source === target) return
    const key = `${source}\u0000${target}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    outgoing.get(source)?.push(target)
    indegree.set(target, (indegree.get(target) ?? 0) + 1)
  }

  for (const edge of edges) addEdge(edge.source, edge.target)
  for (const node of nodes) {
    for (const dependency of node.dependencies ?? []) addEdge(dependency, node.id)
  }
  for (const targets of outgoing.values()) targets.sort(compareNode)

  const ready = nodeIds.filter(id => (indegree.get(id) ?? 0) === 0).sort(compareNode)
  const visited = new Set<string>()
  const order: string[] = []

  while (ready.length) {
    const id = ready.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    order.push(id)
    for (const target of outgoing.get(id) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1)
      if ((indegree.get(target) ?? 0) === 0) insertSorted(ready, target, compareNode)
    }
  }

  for (const id of nodeIds.sort(compareNode)) {
    if (!visited.has(id)) order.push(id)
  }
  return order
}

export function nextDagTraversalNodeId(
  nodes: DagTraversalNode[],
  edges: DagTraversalEdge[],
  currentId: string | null | undefined,
  delta: -1 | 1,
): string | null {
  const order = buildDagTraversalOrder(nodes, edges)
  if (!order.length) return null
  const currentIndex = currentId ? order.indexOf(currentId) : -1
  if (currentIndex < 0) return order[0]
  return order[(currentIndex + delta + order.length) % order.length]
}
