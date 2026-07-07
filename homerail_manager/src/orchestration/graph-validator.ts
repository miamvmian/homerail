import type { DAGEdge, DAGGraphData } from "./graph.js";

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  node_count: number;
  edge_count: number;
  entry_nodes: string[];
  terminal_nodes: string[];
}

function _isFailureEdge(edge: DAGEdge): boolean {
  return edge.condition === "on_failure";
}

function _isTerminalEdge(edge: DAGEdge): boolean {
  return edge.to_node === "";
}

function _isLoopFeedbackEdge(graph: DAGGraphData, edge: DAGEdge): boolean {
  if (_isTerminalEdge(edge)) return false;
  return graph.nodes.find((node) => node.node_id === edge.to_node)?.node_type === "loop_gateway";
}

function _nodeIds(graph: DAGGraphData): string[] {
  return graph.nodes.map((node) => node.node_id);
}

function _adjacency(graph: DAGGraphData): Map<string, string[]> {
  const ids = _nodeIds(graph);
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of graph.edges) {
    if (_isFailureEdge(edge) || _isTerminalEdge(edge) || _isLoopFeedbackEdge(graph, edge)) continue;
    adjacency.get(edge.from_node)?.push(edge.to_node);
  }
  return adjacency;
}

function _entryNodes(graph: DAGGraphData): string[] {
  const ids = new Set(_nodeIds(graph));
  const incoming = new Set<string>();
  for (const edge of graph.edges) {
    if (_isFailureEdge(edge) || _isTerminalEdge(edge) || _isLoopFeedbackEdge(graph, edge)) continue;
    if (ids.has(edge.to_node)) incoming.add(edge.to_node);
  }
  return Array.from(ids).filter((id) => !incoming.has(id)).sort();
}

function _terminalNodes(graph: DAGGraphData): string[] {
  const ids = new Set(_nodeIds(graph));
  const outgoing = new Set<string>();
  for (const edge of graph.edges) {
    if (_isFailureEdge(edge) || _isTerminalEdge(edge)) continue;
    if (ids.has(edge.from_node)) outgoing.add(edge.from_node);
  }
  return Array.from(ids).filter((id) => !outgoing.has(id)).sort();
}

function _explicitTerminalNodes(graph: DAGGraphData): Set<string> {
  const terminal = new Set<string>();
  for (const edge of graph.edges) {
    if (_isTerminalEdge(edge)) terminal.add(edge.from_node);
  }
  return terminal;
}

function _detectCycles(graph: DAGGraphData): string[][] {
  const ids = _nodeIds(graph);
  const adjacency = _adjacency(graph);
  const color = new Map(ids.map((id) => [id, 0]));
  const path: string[] = [];
  const cycles: string[][] = [];

  function visit(nodeId: string): void {
    color.set(nodeId, 1);
    path.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (!color.has(next)) continue;
      const nextColor = color.get(next);
      if (nextColor === 1) {
        const idx = path.indexOf(next);
        cycles.push([...path.slice(idx), next]);
      } else if (nextColor === 0) {
        visit(next);
      }
    }
    path.pop();
    color.set(nodeId, 2);
  }

  for (const id of ids) {
    if (color.get(id) === 0) visit(id);
  }
  return cycles;
}

function _isReachable(adjacency: Map<string, string[]>, fromNode: string, toNode: string): boolean {
  const queue = [fromNode];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toNode) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}

function _unreachableNodes(graph: DAGGraphData, entryNodes: string[]): string[] {
  const ids = new Set(_nodeIds(graph));
  const adjacency = _adjacency(graph);
  const visited = new Set<string>(entryNodes);
  const queue = [...entryNodes];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return Array.from(ids).filter((id) => !visited.has(id)).sort();
}

function _maxRetries(edge: DAGEdge): number | undefined {
  const raw = edge.retry_policy?.max_retries;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function validateGraph(graph: DAGGraphData): GraphValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = _nodeIds(graph);
  const idSet = new Set(ids);

  if (ids.length === 0) {
    errors.push("Graph has no nodes");
  }

  for (const edge of graph.edges) {
    if (!idSet.has(edge.from_node)) {
      errors.push(`Edge references unknown from_node: ${edge.from_node}`);
    }
    if (!_isTerminalEdge(edge) && !idSet.has(edge.to_node)) {
      errors.push(`Edge references unknown to_node: ${edge.to_node}`);
    }
  }

  for (const cycle of _detectCycles(graph)) {
    errors.push(`Cycle detected: ${cycle.join(" -> ")}`);
  }

  if (ids.length > 1) {
    const connected = new Set<string>();
    for (const edge of graph.edges) {
      if (idSet.has(edge.from_node)) connected.add(edge.from_node);
      if (idSet.has(edge.to_node)) connected.add(edge.to_node);
    }
    for (const id of ids) {
      if (!connected.has(id)) warnings.push(`Orphan node (no edges): ${id}`);
    }
  }

  const entryNodes = _entryNodes(graph);
  for (const id of _unreachableNodes(graph, entryNodes)) {
    errors.push(`Unreachable node from entry: ${id}`);
  }

  const outgoing = new Set<string>();
  const explicitTerminal = _explicitTerminalNodes(graph);
  for (const edge of graph.edges) {
    if (idSet.has(edge.from_node) && !_isFailureEdge(edge)) outgoing.add(edge.from_node);
  }
  for (const id of ids) {
    if (!outgoing.has(id) && !explicitTerminal.has(id)) {
      warnings.push(`Dead-end node (no terminal or outgoing edges): ${id}`);
    }
  }

  const successAdjacency = _adjacency(graph);
  const nodeOrder = new Map(ids.map((id, index) => [id, index]));
  for (const edge of graph.edges) {
    const maxRetries = _maxRetries(edge);
    if (
      !_isFailureEdge(edge) ||
      _isTerminalEdge(edge) ||
      maxRetries === undefined ||
      maxRetries <= 10 ||
      !idSet.has(edge.from_node) ||
      !idSet.has(edge.to_node)
    ) {
      continue;
    }
    const isBackEdge =
      _isReachable(successAdjacency, edge.to_node, edge.from_node) ||
      (nodeOrder.get(edge.from_node) ?? -1) > (nodeOrder.get(edge.to_node) ?? -1);
    if (isBackEdge) {
      warnings.push(
        `Feedback-loop risk: on_failure edge ${edge.from_node}.${edge.from_port} -> ${edge.to_node}.${edge.to_port} has max_retries ${maxRetries}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    node_count: ids.length,
    edge_count: graph.edges.length,
    entry_nodes: entryNodes,
    terminal_nodes: _terminalNodes(graph),
  };
}

export function assertGraphValid(graph: DAGGraphData): void {
  const result = validateGraph(graph);
  if (result.valid) return;
  throw new TypeError(`Invalid DAG graph: ${result.errors.join("; ")}`);
}
