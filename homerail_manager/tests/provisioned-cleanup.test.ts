import { afterEach, describe, expect, it } from "vitest";

import { _clearListeners, subscribe } from "../src/events/bus.js";
import {
  _clearAllProvisionedWorkers,
  deprovisionProvisionedForRun,
  registerProvisionedWorker,
} from "../src/orchestration/provisioned-cleanup.js";

describe("provisioned worker cleanup", () => {
  afterEach(() => {
    _clearAllProvisionedWorkers();
    _clearListeners();
  });

  it("emits cleanup lifecycle events without hard-coded issue identity", async () => {
    const requested: Record<string, unknown>[] = [];
    const completedPromise = new Promise<Record<string, unknown>>((resolve) => {
      subscribe("dag:cleanup_completed", (payload) => resolve(payload as Record<string, unknown>));
    });
    subscribe("dag:cleanup_requested", (payload) => {
      requested.push(payload as Record<string, unknown>);
    });

    registerProvisionedWorker({
      runId: "run-cleanup",
      nodeId: "coder",
      workerId: "worker-1",
      containerId: "container-1",
      dockerNodeId: "docker-node-1",
    });

    const started = deprovisionProvisionedForRun("run-cleanup", {
      deprovisionFn: async () => ({
        stopped: true,
        removed: true,
        dockerCleanupVerified: true,
      }),
    });
    const completed = await completedPromise;

    expect(started).toBe(true);
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({ runId: "run-cleanup", workerCount: 1 });
    expect(requested[0]).not.toHaveProperty("sourceIssue");
    expect(completed).toMatchObject({
      runId: "run-cleanup",
      workerId: "worker-1",
      nodeId: "coder",
      containerId: "container-1",
      stopped: true,
      removed: true,
    });
    expect(completed).not.toHaveProperty("sourceIssue");
  });
});
