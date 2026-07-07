import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _clearDagMessageRouter,
  handleDagMessageResponse,
} from "../src/orchestration/dag-message-router.js";
import { _clearAllDispatches, recordDispatch } from "../src/orchestration/dispatch-tracker.js";
import { _clearListeners } from "../src/events/bus.js";
import { _clearNodes } from "../src/node/registry.js";
import { registerWorker, _clearWorkers } from "../src/worker/registry.js";

function makeSocket() {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

function registerTestWorker(workerId: string, socket = makeSocket()) {
  registerWorker({
    worker_id: workerId,
    project_id: "p1",
    socket,
    status: "idle",
    capabilities: [],
    registered_at: Date.now(),
    last_heartbeat: Date.now(),
  });
  return socket;
}

function sentInbox(socket: WebSocket & { send: ReturnType<typeof vi.fn> }) {
  expect(socket.send).toHaveBeenCalledTimes(1);
  return JSON.parse(socket.send.mock.calls[0][0]) as {
    type: string;
    data: Record<string, unknown>;
  };
}

describe("DAG point-to-point message router", () => {
  beforeEach(() => {
    _clearDagMessageRouter();
    _clearAllDispatches();
    _clearWorkers();
    _clearNodes();
    _clearListeners();
  });

  afterEach(() => {
    _clearDagMessageRouter();
    _clearAllDispatches();
    _clearWorkers();
    _clearNodes();
    _clearListeners();
  });

  it("delivers send_message to the dispatched target node", () => {
    const targetSocket = registerTestWorker("worker-target");
    recordDispatch("run-1", "reviewer", "worker", "worker-target");

    const result = handleDagMessageResponse("worker", "worker-sender", {
      type: "node_send_message",
      run_id: "run-1",
      from_node: "planner",
      to_node: "reviewer",
      content: { ask: "check this" },
    });

    expect(result).toMatchObject({
      status: "message_delivered",
      runId: "run-1",
      nodeId: "planner",
      toNode: "reviewer",
    });
    const sent = sentInbox(targetSocket);
    expect(sent.type).toBe("dag_inbox");
    expect(sent.data).toMatchObject({
      type: "node_message",
      runId: "run-1",
      fromNode: "planner",
      toNode: "reviewer",
      content: { ask: "check this" },
    });
  });

  it("wakes a receive_message waiter when a later send_message arrives", () => {
    const targetSocket = registerTestWorker("worker-target");
    const waiting = handleDagMessageResponse("worker", "worker-target", {
      type: "node_receive_message",
      run_id: "run-1",
      from_node: "reviewer",
    });
    expect(waiting).toMatchObject({
      status: "receive_registered",
      runId: "run-1",
      nodeId: "reviewer",
    });

    const sentResult = handleDagMessageResponse("worker", "worker-sender", {
      type: "node_send_message",
      run_id: "run-1",
      from_node: "planner",
      to_node: "reviewer",
      content: "hello",
    });

    expect(sentResult).toMatchObject({
      status: "message_delivered",
      runId: "run-1",
      nodeId: "planner",
      toNode: "reviewer",
    });
    const sent = sentInbox(targetSocket);
    expect(sent.data).toMatchObject({
      type: "node_message",
      runId: "run-1",
      fromNode: "planner",
      toNode: "reviewer",
      content: "hello",
    });
  });

  it("queues send_message until the target calls receive_message", () => {
    const queued = handleDagMessageResponse("worker", "worker-sender", {
      type: "node_send_message",
      run_id: "run-1",
      from_node: "planner",
      to_node: "reviewer",
      content: "queued hello",
    });
    expect(queued).toMatchObject({
      status: "message_queued",
      runId: "run-1",
      nodeId: "planner",
      toNode: "reviewer",
    });

    const targetSocket = registerTestWorker("worker-target");
    const delivered = handleDagMessageResponse("worker", "worker-target", {
      type: "node_receive_message",
      run_id: "run-1",
      from_node: "reviewer",
    });

    expect(delivered).toMatchObject({
      status: "pending_delivered",
      runId: "run-1",
      nodeId: "reviewer",
      fromNode: "planner",
    });
    const sent = sentInbox(targetSocket);
    expect(sent.data.content).toBe("queued hello");
  });

  it("ignores normal handoff payloads", () => {
    const result = handleDagMessageResponse("worker", "worker-sender", {
      type: "node_handoff",
      runId: "run-1",
      nodeId: "planner",
      port: "done",
      content: "ok",
    });

    expect(result).toEqual({ status: "not_dag_message" });
  });
});
