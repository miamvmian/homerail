import { handoffActiveRun } from "../runtime/active-runs.js";

export type ResponseBridgeResult =
  | { status: "handoff_applied"; runId: string; nodeId: string; port: string }
  | { status: "malformed_payload"; reason: string }
  | { status: "unknown_run"; runId: string }
  | { status: "handoff_failed"; runId: string; nodeId: string; reason: string };

export function applyResponseHandoff(payload: unknown): ResponseBridgeResult {
  if (typeof payload !== "object" || payload === null) {
    return {
      status: "malformed_payload",
      reason: "payload is not an object",
    };
  }

  const obj = payload as Record<string, unknown>;

  if (typeof obj.runId !== "string") {
    return {
      status: "malformed_payload",
      reason: "runId must be a string",
    };
  }

  if (typeof obj.nodeId !== "string") {
    return {
      status: "malformed_payload",
      reason: "nodeId must be a string",
    };
  }

  if (typeof obj.port !== "string") {
    return {
      status: "malformed_payload",
      reason: "port must be a string",
    };
  }

  let run;
  try {
    run = handoffActiveRun(obj.runId, obj.nodeId, obj.port, obj.content);
  } catch (error) {
    return {
      status: "handoff_failed",
      runId: obj.runId,
      nodeId: obj.nodeId,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (!run) {
    return {
      status: "unknown_run",
      runId: obj.runId,
    };
  }

  return {
    status: "handoff_applied",
    runId: obj.runId,
    nodeId: obj.nodeId,
    port: obj.port,
  };
}
