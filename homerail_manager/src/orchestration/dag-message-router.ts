import { WebSocket } from "ws";

import { emit } from "../events/bus.js";
import { getNode } from "../node/registry.js";
import { getWorker } from "../worker/registry.js";
import { findDispatchTarget } from "./dispatch-tracker.js";

type MessageSource = "worker" | "node";
type DeliveryTarget = { targetType: "worker" | "node"; targetId: string };

export interface RoutedNodeMessage {
  type: "node_message";
  runId: string;
  fromNode: string;
  toNode: string;
  content: unknown;
  timestamp: number;
}

export type DagMessageRouteResult =
  | { status: "not_dag_message" }
  | { status: "malformed_payload"; reason: string; runId?: string; nodeId?: string }
  | { status: "message_delivered"; runId: string; nodeId: string; toNode: string }
  | { status: "message_queued"; runId: string; nodeId: string; toNode: string }
  | { status: "receive_registered"; runId: string; nodeId: string }
  | { status: "pending_delivered"; runId: string; nodeId: string; fromNode: string };

const pendingInbox = new Map<string, RoutedNodeMessage[]>();
const waiters = new Map<string, DeliveryTarget>();

function key(runId: string, nodeId: string): string {
  return `${runId}:${nodeId}`;
}

function stringField(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const name of keys) {
    const value = obj[name];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function targetSocket(target: DeliveryTarget): WebSocket | undefined {
  if (target.targetType === "worker") return getWorker(target.targetId)?.socket;
  return getNode(target.targetId)?.socket;
}

function sendInbox(target: DeliveryTarget, message: RoutedNodeMessage): boolean {
  const socket = targetSocket(target);
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type: "dag_inbox", data: message }));
  return true;
}

function enqueue(message: RoutedNodeMessage): void {
  const inboxKey = key(message.runId, message.toNode);
  const messages = pendingInbox.get(inboxKey) ?? [];
  messages.push(message);
  pendingInbox.set(inboxKey, messages);
}

function shiftPending(runId: string, nodeId: string): RoutedNodeMessage | undefined {
  const inboxKey = key(runId, nodeId);
  const messages = pendingInbox.get(inboxKey);
  if (!messages || messages.length === 0) return undefined;
  const message = messages.shift();
  if (messages.length === 0) {
    pendingInbox.delete(inboxKey);
  }
  return message;
}

function unshiftPending(message: RoutedNodeMessage): void {
  const inboxKey = key(message.runId, message.toNode);
  const messages = pendingInbox.get(inboxKey) ?? [];
  messages.unshift(message);
  pendingInbox.set(inboxKey, messages);
}

function dispatchTarget(runId: string, nodeId: string): DeliveryTarget | undefined {
  const target = findDispatchTarget(runId, nodeId);
  if (target?.state !== "dispatched" || !target.targetType || !target.targetId) {
    return undefined;
  }
  return { targetType: target.targetType, targetId: target.targetId };
}

function handleSendMessage(
  source: MessageSource,
  sourceId: string,
  obj: Record<string, unknown>,
): DagMessageRouteResult {
  const runId = stringField(obj, "run_id", "runId");
  const fromNode = stringField(obj, "from_node", "fromNode");
  const toNode = stringField(obj, "to_node", "toNode");
  if (!runId) return { status: "malformed_payload", reason: "run_id must be a string" };
  if (!fromNode) return { status: "malformed_payload", reason: "from_node must be a string", runId };
  if (!toNode) return { status: "malformed_payload", reason: "to_node must be a string", runId, nodeId: fromNode };

  const message: RoutedNodeMessage = {
    type: "node_message",
    runId,
    fromNode,
    toNode,
    content: obj.content,
    timestamp: Date.now(),
  };

  const waiter = waiters.get(key(runId, toNode));
  if (waiter) {
    waiters.delete(key(runId, toNode));
    if (sendInbox(waiter, message)) {
      emit("dag:message_sent", {
        runId,
        fromNode,
        toNode,
        source,
        sourceId,
        delivery: "delivered",
      });
      return { status: "message_delivered", runId, nodeId: fromNode, toNode };
    }
  }

  const target = dispatchTarget(runId, toNode);
  if (target && sendInbox(target, message)) {
    emit("dag:message_sent", {
      runId,
      fromNode,
      toNode,
      source,
      sourceId,
      delivery: "delivered",
    });
    return { status: "message_delivered", runId, nodeId: fromNode, toNode };
  }

  enqueue(message);
  emit("dag:message_sent", {
    runId,
    fromNode,
    toNode,
    source,
    sourceId,
    delivery: "queued",
  });
  return { status: "message_queued", runId, nodeId: fromNode, toNode };
}

function handleReceiveMessage(
  source: MessageSource,
  sourceId: string,
  obj: Record<string, unknown>,
): DagMessageRouteResult {
  const runId = stringField(obj, "run_id", "runId");
  const nodeId = stringField(obj, "from_node", "fromNode", "node_id", "nodeId");
  if (!runId) return { status: "malformed_payload", reason: "run_id must be a string" };
  if (!nodeId) return { status: "malformed_payload", reason: "from_node must be a string", runId };

  const target: DeliveryTarget = { targetType: source, targetId: sourceId };
  const pending = shiftPending(runId, nodeId);
  if (pending) {
    if (!sendInbox(target, pending)) {
      unshiftPending(pending);
      return {
        status: "malformed_payload",
        reason: `active ${source} ${sourceId} is not available for dag_inbox delivery`,
        runId,
        nodeId,
      };
    }
    emit("dag:message_received", {
      runId,
      nodeId,
      source,
      sourceId,
      delivery: "delivered",
    });
    return {
      status: "pending_delivered",
      runId,
      nodeId,
      fromNode: pending.fromNode,
    };
  }

  waiters.set(key(runId, nodeId), target);
  emit("dag:message_received", {
    runId,
    nodeId,
    source,
    sourceId,
    delivery: "waiting",
  });
  return { status: "receive_registered", runId, nodeId };
}

export function handleDagMessageResponse(
  source: MessageSource,
  sourceId: string,
  payload: unknown,
): DagMessageRouteResult {
  if (typeof payload !== "object" || payload === null) {
    return { status: "not_dag_message" };
  }

  const obj = payload as Record<string, unknown>;
  if (obj.type === "node_send_message") {
    return handleSendMessage(source, sourceId, obj);
  }
  if (obj.type === "node_receive_message") {
    return handleReceiveMessage(source, sourceId, obj);
  }
  return { status: "not_dag_message" };
}

export function _clearDagMessageRouter(): void {
  pendingInbox.clear();
  waiters.clear();
}
