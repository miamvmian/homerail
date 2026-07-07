export type DispatchState = "provisioning" | "dispatched" | "failed";

export interface DispatchTarget {
  state: DispatchState;
  targetType?: "worker" | "node";
  targetId?: string;
  dispatchedAt: number;
}

const dispatches = new Map<string, DispatchTarget>();

function key(runId: string, nodeId: string): string {
  return `${runId}:${nodeId}`;
}

export function recordDispatch(
  runId: string,
  nodeId: string,
  targetType: "worker" | "node",
  targetId: string,
): void {
  dispatches.set(key(runId, nodeId), {
    state: "dispatched",
    targetType,
    targetId,
    dispatchedAt: Date.now(),
  });
}

export function recordProvisioning(runId: string, nodeId: string): void {
  dispatches.set(key(runId, nodeId), {
    state: "provisioning",
    dispatchedAt: Date.now(),
  });
}

export function recordDispatchFailed(runId: string, nodeId: string): void {
  dispatches.set(key(runId, nodeId), {
    state: "failed",
    dispatchedAt: Date.now(),
  });
}

export function isProvisioning(runId: string, nodeId: string): boolean {
  const entry = dispatches.get(key(runId, nodeId));
  return entry?.state === "provisioning";
}

export function findDispatchTarget(
  runId: string,
  nodeId: string,
): DispatchTarget | undefined {
  return dispatches.get(key(runId, nodeId));
}

export function clearDispatchTarget(runId: string, nodeId: string): void {
  dispatches.delete(key(runId, nodeId));
}

export function clearByTargetId(targetId: string): void {
  for (const [k, target] of dispatches.entries()) {
    if (target.targetId && target.targetId === targetId) {
      dispatches.delete(k);
    }
  }
}

export function _clearAllDispatches(): void {
  dispatches.clear();
}
