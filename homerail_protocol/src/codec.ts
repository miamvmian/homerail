/**
 * JSON codec with type-dispatch and deterministic serialization.
 *
 * stableStringify must produce byte-for-byte identical output to Python's
 * model_dump_json(exclude_none=True): sorted keys, no undefined values,
 * compact format (no spaces after : or ,).
 *
 * @version 0.1.0
 */

import type {
  Message,
  Request,
  Response,
  Event,
  StreamMessage,
  AsyncRequest,
  AsyncResponse,
  AsyncProgress,
  AsyncControl,
  AsyncResult,
} from "./types.js";

/**
 * Recursively sort object keys and omit undefined values.
 * Returns the value with keys sorted and undefined removed.
 */
function stableValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      result[key] = stableValue(v);
    }
    return result;
  }

  return value;
}

/**
 * Deterministic JSON serialization:
 * 1. Recursively sort object keys alphabetically
 * 2. Omit properties with undefined values
 * 3. Compact format (no spaces after : or ,)
 */
export function stableStringify(obj: unknown): string {
  const stable = stableValue(obj);
  return JSON.stringify(stable);
}

/** Encode any value to a deterministic JSON string */
export function encode(obj: unknown): string {
  return stableStringify(obj);
}

/** Decode a JSON string to a typed object */
export function decode<T = unknown>(data: string): T {
  return JSON.parse(data) as T;
}

/** Map of message type strings to constructor-like factory functions */
export type MessageConstructor<T extends Message = Message> = (data: Record<string, unknown>) => T;

function buildMessage(data: Record<string, unknown>): Message {
  return {
    id: data.id as string,
    type: data.type as string,
    timestamp: data.timestamp as string,
    data: (data.data as Record<string, unknown>) || {},
  };
}

function buildRequest(data: Record<string, unknown>): Request {
  return {
    ...buildMessage(data),
    type: "request",
    resource_type: data.resource_type as string,
    operation: data.operation as string,
    resource_id: data.resource_id as string | undefined,
    spec: (data.spec as Record<string, unknown>) || {},
    timeout: data.timeout as number | undefined,
  };
}

function buildResponse(data: Record<string, unknown>): Response {
  return {
    ...buildMessage(data),
    type: "response",
    request_id: data.request_id as string,
    status: data.status as string,
    resource_data: data.resource_data as Record<string, unknown> | undefined,
    error: data.error as Record<string, unknown> | undefined,
    execution_time: data.execution_time as number | undefined,
  };
}

function buildEvent(data: Record<string, unknown>): Event {
  return {
    ...buildMessage(data),
    type: "event",
    event_type: data.event_type as string | undefined,
    resource_type: data.resource_type as string | undefined,
    resource_id: data.resource_id as string | undefined,
    metadata: (data.metadata as Record<string, unknown>) || {},
  };
}

function buildStreamMessage(data: Record<string, unknown>): StreamMessage {
  return {
    ...buildMessage(data),
    type: "stream",
    request_id: data.request_id as string,
    sequence: data.sequence as number,
    finished: (data.finished as boolean) || false,
    chunk: data.chunk as Record<string, unknown> | undefined,
    error: data.error as Record<string, unknown> | undefined,
  };
}

function buildAsyncRequest(data: Record<string, unknown>): AsyncRequest {
  return {
    ...buildMessage(data),
    type: "async_request",
    resource_type: data.resource_type as string,
    operation: data.operation as string,
    resource_id: data.resource_id as string | undefined,
    spec: (data.spec as Record<string, unknown>) || {},
    target_node_id: data.target_node_id as string | undefined,
    timeout: data.timeout as number | undefined,
    priority: (data.priority as string) || "normal",
    callback_url: data.callback_url as string | undefined,
    parameters: (data.parameters as Record<string, unknown>) || {},
  };
}

function buildAsyncResponse(data: Record<string, unknown>): AsyncResponse {
  return {
    ...buildMessage(data),
    type: "async_response",
    request_id: data.request_id as string,
    operation_id: data.operation_id as string,
    status: data.status as string,
    estimated_duration: data.estimated_duration as number | undefined,
    queue_position: data.queue_position as number | undefined,
    error: data.error as Record<string, unknown> | undefined,
  };
}

function buildAsyncProgress(data: Record<string, unknown>): AsyncProgress {
  return {
    ...buildMessage(data),
    type: "async_progress",
    operation_id: data.operation_id as string,
    progress_percentage: data.progress_percentage as number,
    current_stage: data.current_stage as string,
    message: data.message as string | undefined,
    details: (data.details as Record<string, unknown>) || {},
    estimated_remaining: data.estimated_remaining as number | undefined,
  };
}

function buildAsyncControl(data: Record<string, unknown>): AsyncControl {
  return {
    ...buildMessage(data),
    type: "async_control",
    operation_id: data.operation_id as string,
    control_action: data.control_action as string,
    reason: data.reason as string | undefined,
    force: (data.force as boolean) || false,
  };
}

function buildAsyncResult(data: Record<string, unknown>): AsyncResult {
  return {
    ...buildMessage(data),
    type: "event",
    event_type: (data.event_type as string) || "operation_completed",
    operation_id: data.operation_id as string,
    request_id: data.request_id as string,
    status: data.status as string,
    result_data: (data.result_data as Record<string, unknown>) || {},
    error: data.error as Record<string, unknown> | undefined,
    execution_time: data.execution_time as number | undefined,
    metrics: (data.metrics as Record<string, unknown>) || {},
  };
}

/**
 * Message type → constructor mapping for type-dispatched decode.
 */
export const MessageClassMap: Record<string, MessageConstructor> = {
  request: buildRequest,
  response: buildResponse,
  event: buildEvent,
  stream: buildStreamMessage,
  async_request: buildAsyncRequest,
  async_response: buildAsyncResponse,
  async_progress: buildAsyncProgress,
  async_control: buildAsyncControl,
};

/**
 * Decode a JSON string and dispatch to the correct message type.
 * Falls back to base Message for unknown types.
 */
export function decodeMessage(data: string): Message {
  const obj = JSON.parse(data) as Record<string, unknown>;
  const msgType = obj.type as string;
  const builder = MessageClassMap[msgType];
  if (builder) {
    return builder(obj);
  }
  return buildMessage(obj);
}
