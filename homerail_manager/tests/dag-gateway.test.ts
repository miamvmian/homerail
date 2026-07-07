import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DAGDispatcher, DispatchEnvelope, DispatchResult } from "../src/orchestration/dag-dispatcher.js";
import { FakeDAGDispatcher } from "../src/orchestration/dag-dispatcher.js";
import { parseDAGYaml } from "../src/orchestration/yaml-loader.js";
import { _clearListeners } from "../src/events/bus.js";
import { closeDb } from "../src/persistence/db.js";
import { _clearAllPersistence } from "../src/persistence/store.js";
import {
  _clearActiveRuns,
  createActiveRun,
  dispatchReadyNodes,
  getActiveRun,
  handoffActiveRun,
} from "../src/runtime/active-runs.js";

function conditionGatewayYaml(): string {
  return `
name: condition-gateway
agents:
  worker:
    agent_type: deterministic
nodes:
  start:
    agent: worker
    outputs:
      done:
        to: gate.in:decision
  gate:
    type: gateway
    gateway_config:
      type: condition
      field: status
      routes:
        pass: approved
        fail: rejected
      default_port: rejected
    after: [start]
    outputs:
      approved:
        to: good.in:task
      rejected:
        to: bad.in:task
  good:
    agent: worker
    after: [gate]
    outputs:
      done:
        to: ""
  bad:
    agent: worker
    after: [gate]
    outputs:
      done:
        to: ""
`;
}

function loopGatewayYaml(): string {
  return `
name: loop-gateway
agents:
  worker:
    agent_type: deterministic
nodes:
  loop:
    type: loop_gateway
    gateway_config:
      items: [alpha, beta]
      item_port: next_item
      done_port: done
    outputs:
      next_item:
        to: worker.in:task
      done:
        to: ""
  worker:
    agent: worker
    after: [loop]
    outputs:
      done:
        to: loop.in:worker_done
`;
}

class CollectingDispatcher implements DAGDispatcher {
  dispatched: DispatchEnvelope[] = [];

  dispatch(envelope: DispatchEnvelope): DispatchResult {
    this.dispatched.push(envelope);
    return { status: "dispatched", targetType: "fake", targetId: `fake-${this.dispatched.length}` };
  }
}

describe("DAG gateway nodes", () => {
  let tmpHome: string;
  let oldHome: string | undefined;

  beforeEach(() => {
    oldHome = process.env.HOMERAIL_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-dag-gateway-"));
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

  it("routes condition gateways to the selected output and skips untaken branches", () => {
    const parsed = parseDAGYaml(conditionGatewayYaml());
    createActiveRun("run-condition-gateway", parsed);
    handoffActiveRun("run-condition-gateway", "start", "done", { status: "pass" });

    expect(dispatchReadyNodes("run-condition-gateway", new FakeDAGDispatcher())).toBe(1);

    const run = getActiveRun("run-condition-gateway");
    expect(run?.dagRun.nodeStates.get("gate")).toBe("COMPLETED");
    expect(run?.dagRun.nodeStates.get("good")).toBe("READY");
    expect(run?.dagRun.nodeStates.get("bad")).toBe("SKIPPED");
  });

  it("iterates loop gateways over configured items and then opens the done branch", () => {
    const parsed = parseDAGYaml(loopGatewayYaml());
    createActiveRun("run-loop-gateway", parsed);
    const dispatcher = new CollectingDispatcher();

    expect(dispatchReadyNodes("run-loop-gateway", dispatcher)).toBe(1);
    expect(getActiveRun("run-loop-gateway")?.dagRun.nodeStates.get("worker")).toBe("READY");

    expect(dispatchReadyNodes("run-loop-gateway", dispatcher)).toBe(1);
    expect(dispatcher.dispatched[0].inputs.task[0]).toMatchObject({ item: "alpha", index: 0, total: 2 });
    handoffActiveRun("run-loop-gateway", "worker", "done", "first complete");

    expect(dispatchReadyNodes("run-loop-gateway", dispatcher)).toBe(1);
    expect(dispatchReadyNodes("run-loop-gateway", dispatcher)).toBe(1);
    expect(dispatcher.dispatched[1].inputs.task[0]).toMatchObject({ item: "beta", index: 1, total: 2 });
    handoffActiveRun("run-loop-gateway", "worker", "done", "second complete");

    expect(dispatchReadyNodes("run-loop-gateway", dispatcher)).toBe(1);
    const run = getActiveRun("run-loop-gateway");
    expect(run?.dagRun.nodeStates.get("loop")).toBe("COMPLETED");
  });
});
