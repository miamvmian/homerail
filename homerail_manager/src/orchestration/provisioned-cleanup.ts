/**
 * provisioned worker cleanup registry.
 *
 * Tracks `(runId, nodeId) -> (workerId, containerId, dockerNodeId)` tuples
 * that were created by the async worker provisioner () and provides
 * a `deprovisionProvisionedForRun` that iterates the entries, calls
 * `deprovisionWorkerContainer` for each, and emits the
 * `dag:cleanup_requested` / `dag:cleanup_completed` / `dag:cleanup_failed`
 * events.
 *
 * Concurrency: a per-run `Set<string>` guard prevents re-entry if
 * `completeActiveRun` and `cancelActiveRun` race for the same runId.
 */

import { emit } from "../events/bus.js";
import {
  deprovisionWorkerContainer,
  type ProvisionerOptions,
} from "../node/worker-provisioner.js";

export interface ProvisionedWorkerEntry {
  runId: string;
  nodeId: string;
  workerId: string;
  containerId: string;
  dockerNodeId: string;
  provisionedAt: number;
}

const registry = new Map<string, ProvisionedWorkerEntry[]>();
const inflightCleanups = new Set<string>();

export function registerProvisionedWorker(
  entry: Omit<ProvisionedWorkerEntry, "provisionedAt">,
): ProvisionedWorkerEntry {
  const full: ProvisionedWorkerEntry = {
    ...entry,
    provisionedAt: Date.now(),
  };
  const existing = registry.get(entry.runId) ?? [];
  existing.push(full);
  registry.set(entry.runId, existing);
  return full;
}

export function listProvisionedForRun(
  runId: string,
): ProvisionedWorkerEntry[] {
  return [...(registry.get(runId) ?? [])];
}

export function clearProvisionedForRun(runId: string): void {
  registry.delete(runId);
}

export function _clearAllProvisionedWorkers(): void {
  registry.clear();
  inflightCleanups.clear();
}

export function _isCleanupInflight(runId: string): boolean {
  return inflightCleanups.has(runId);
}

export interface DeprovisionOptions {
  deprovisionerOpts?: ProvisionerOptions;
  /** Test-only: override deprovisionWorkerContainer */
  deprovisionFn?: typeof deprovisionWorkerContainer;
}

/**
 * Trigger async deprovisioning of all registered workers for a runId.
 * Returns immediately; the actual stop/remove is fire-and-forget.
 * Subsequent calls for the same runId while a cleanup is in-flight are
 * no-ops (returns `false`).
 */
export function deprovisionProvisionedForRun(
  runId: string,
  options: DeprovisionOptions = {},
): boolean {
  if (inflightCleanups.has(runId)) return false;
  const entries = listProvisionedForRun(runId);
  if (entries.length === 0) {
    return false;
  }
  inflightCleanups.add(runId);
  const deprovisionFn = options.deprovisionFn ?? deprovisionWorkerContainer;
  emit("dag:cleanup_requested", {
    runId,
    workerCount: entries.length,
  });

  void (async () => {
    try {
      for (const entry of entries) {
        try {
          const result = await deprovisionFn(
            entry.dockerNodeId,
            entry.containerId,
            options.deprovisionerOpts,
          );
          emit("dag:cleanup_completed", {
            runId,
            workerId: entry.workerId,
            nodeId: entry.nodeId,
            containerId: entry.containerId,
            stopped: result.stopped,
            removed: result.removed,
          });
        } catch (err) {
          emit("dag:cleanup_failed", {
            runId,
            workerId: entry.workerId,
            nodeId: entry.nodeId,
            containerId: entry.containerId,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      clearProvisionedForRun(runId);
      inflightCleanups.delete(runId);
    }
  })();

  return true;
}
