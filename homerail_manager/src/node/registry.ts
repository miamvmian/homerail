import type WebSocket from "ws";

export interface PendingLifecycleRequest {
  request_id: string;
  resolve: (value: { status: string; resource_data?: Record<string, unknown>; error?: Record<string, unknown> }) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface NodeState {
  node_id: string;
  project_id: string;
  socket: WebSocket;
  status: string;
  capabilities: string[];
  registered_at: number;
  last_heartbeat: number;
  pending_requests: Map<string, PendingLifecycleRequest>;
}

const registry = new Map<string, NodeState>();

export function registerNode(state: NodeState): void {
  registry.set(state.node_id, state);
}

export function unregisterNode(node_id: string): void {
  registry.delete(node_id);
}

export function getNode(node_id: string): NodeState | undefined {
  return registry.get(node_id);
}

export function getAllNodes(): NodeState[] {
  return Array.from(registry.values());
}

export function isDockerCapableNode(node: NodeState): boolean {
  return node.capabilities.includes("docker-cli") || node.capabilities.includes("docker-api");
}

export function updateHeartbeat(node_id: string): void {
  const node = registry.get(node_id);
  if (node) {
    node.last_heartbeat = Date.now();
  }
}

export function updateCapabilities(node_id: string, capabilities: string[]): void {
  const node = registry.get(node_id);
  if (node) {
    node.capabilities = capabilities;
  }
}

export function _clearNodes(): void {
  registry.clear();
}
