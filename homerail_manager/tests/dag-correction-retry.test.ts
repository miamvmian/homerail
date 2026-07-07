import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DAGDispatcher, DispatchEnvelope, DispatchResult } from "../src/orchestration/dag-dispatcher.js";
import { parseDAGYaml } from "../src/orchestration/yaml-loader.js";
import { _clearListeners } from "../src/events/bus.js";
import { closeDb } from "../src/persistence/db.js";
import { _clearAllPersistence } from "../src/persistence/store.js";
import {
  _clearActiveRuns,
  autoHandoffAfterCorrectionExhausted,
  createActiveRun,
  dispatchReadyNodes,
  getActiveRun,
  requestNodeCorrection,
} from "../src/runtime/active-runs.js";

function correctionYaml(maxCorrections = 1): string {
  return `
name: correction-retry
limits:
  max_corrections_per_node: ${maxCorrections}
agents:
  worker:
    agent_type: deterministic
nodes:
  start:
    agent: worker
    outputs:
      done:
        to: ""
`;
}

class FlakyDispatcher implements DAGDispatcher {
  calls: DispatchEnvelope[] = [];

  constructor(private firstResult: DispatchResult) {}

  dispatch(envelope: DispatchEnvelope): DispatchResult {
    this.calls.push(envelope);
    if (this.calls.length === 1) return this.firstResult;
    return { status: "dispatched", targetType: "fake", targetId: "retry-ok" };
  }
}

describe("DAG correction and dispatch retry", () => {
  let tmpHome: string;
  let oldHome: string | undefined;

  beforeEach(() => {
    oldHome = process.env.HOMERAIL_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-dag-correction-"));
    process.env.HOMERAIL_HOME = tmpHome;
    closeDb();
    _clearActiveRuns();
    _clearAllPersistence();
    _clearListeners();
  });

  afterEach(() => {
    _clearActiveRuns();
    _clearAllPersistence();
    _clearListeners();
    closeDb();
    if (oldHome === undefined) {
      delete process.env.HOMERAIL_HOME;
    } else {
      process.env.HOMERAIL_HOME = oldHome;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("reschedules a node with a correction prompt before failing the run", () => {
    const parsed = parseDAGYaml(correctionYaml(1));
    createActiveRun("run-correction", parsed);
    const dispatcher = new FlakyDispatcher({ status: "dispatched", targetType: "fake", targetId: "first" });

    expect(dispatchReadyNodes("run-correction", dispatcher)).toBe(1);
    expect(getActiveRun("run-correction")?.dagRun.nodeStates.get("start")).toBe("RUNNING");

    const correction = requestNodeCorrection("run-correction", "start", "agent ended without DAG handoff");
    expect(correction.status).toBe("scheduled");
    expect(getActiveRun("run-correction")?.dagRun.nodeStates.get("start")).toBe("READY");

    expect(dispatchReadyNodes("run-correction", dispatcher)).toBe(1);
    expect(dispatcher.calls).toHaveLength(2);
    expect(dispatcher.calls[1].inputs.correction?.[0]).toContain("agent ended without DAG handoff");
  });

  it("auto-handoffs on a success port after correction attempts are exhausted", () => {
    const parsed = parseDAGYaml(correctionYaml(1));
    createActiveRun("run-auto-handoff", parsed);
    const dispatcher = new FlakyDispatcher({ status: "dispatched", targetType: "fake", targetId: "first" });
    dispatchReadyNodes("run-auto-handoff", dispatcher);

    expect(requestNodeCorrection("run-auto-handoff", "start", "missing handoff").status).toBe("scheduled");
    dispatchReadyNodes("run-auto-handoff", dispatcher);
    expect(requestNodeCorrection("run-auto-handoff", "start", "missing handoff again").status).toBe("exhausted");

    const run = autoHandoffAfterCorrectionExhausted("run-auto-handoff", "start", "missing handoff again");
    expect(run?.status).toBe("completed");
    expect(run?.dagRun.nodeStates.get("start")).toBe("COMPLETED");
  });

  it("retries retryable dispatch failures once before marking the node running", () => {
    const parsed = parseDAGYaml(correctionYaml());
    createActiveRun("run-dispatch-retry", parsed);
    const dispatcher = new FlakyDispatcher({ status: "failed", reason: "socket send failed", retryable: true });

    expect(dispatchReadyNodes("run-dispatch-retry", dispatcher)).toBe(1);

    const run = getActiveRun("run-dispatch-retry");
    expect(dispatcher.calls).toHaveLength(2);
    expect(dispatcher.calls[1].inputs.dispatch_retry?.[0]).toContain("socket send failed");
    expect(run?.counters.dispatch_retries.start).toBe(1);
    expect(run?.dagRun.nodeStates.get("start")).toBe("RUNNING");
  });

  it("does not retry non-retryable dispatch failures", () => {
    const parsed = parseDAGYaml(correctionYaml());
    createActiveRun("run-dispatch-nonretry", parsed);
    const dispatcher = new FlakyDispatcher({
      status: "failed",
      reason: "no available worker satisfies required capabilities",
      retryable: false,
    });

    expect(dispatchReadyNodes("run-dispatch-nonretry", dispatcher)).toBe(0);

    const run = getActiveRun("run-dispatch-nonretry");
    expect(dispatcher.calls).toHaveLength(1);
    expect(run?.status).toBe("failed");
    expect(run?.dagRun.nodeStates.get("start")).toBe("FAILED");
  });
});
