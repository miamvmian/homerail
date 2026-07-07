export interface RegisterMessage {
  type: "register";
  worker_id: string;
  capabilities?: string[];
}

export interface ControlRegisterMessage {
  type: "control";
  action: "register";
  data: { worker_id: string; capabilities?: string[] };
}

export interface StatusMessage {
  type: "status";
  data: { status: string };
}

export interface HeartbeatMessage {
  type: "heartbeat";
}

export interface ResponseMessage {
  type: "response";
  session_id?: string;
  data?: unknown;
}

export interface StreamMessage {
  type: "stream";
  data: Record<string, unknown>;
}

export interface ContentMessage {
  type: "content";
  data: {
    text: string;
    run_id?: string;
    node_id?: string;
    session_id?: string;
  };
}

export interface ManagerCommandMessage {
  type: "manager_command";
  data: Record<string, unknown>;
}

export interface NodeErrorMessage {
  type: "node_error";
  data: {
    runId: string;
    nodeId: string;
    message: string;
    session_id?: string;
  };
}

export interface PongMessage {
  type: "pong";
}

export type IncomingWorkerMessage =
  | RegisterMessage
  | ControlRegisterMessage
  | StatusMessage
  | HeartbeatMessage
  | ResponseMessage
  | StreamMessage
  | ContentMessage
  | ManagerCommandMessage
  | NodeErrorMessage
  | PongMessage;

export interface PingMessage {
  type: "ping";
}

export interface TaskMessage {
  type: "task";
  data: { task: string; sender: string };
}

export interface InjectMessage {
  type: "inject";
  data: {
    runId: string;
    nodeId: string;
    instruction: string;
    mode: string;
  };
}

export type OutgoingWorkerMessage = PingMessage | TaskMessage | InjectMessage;

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseIncomingMessage(raw: unknown): IncomingWorkerMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string") return null;

  switch (obj.type) {
    case "register":
      if (typeof obj.worker_id !== "string") return null;
      return {
        type: "register",
        worker_id: obj.worker_id,
        capabilities: stringList(obj.capabilities),
      };
    case "control":
      if (obj.action !== "register") return null;
      if (typeof obj.data !== "object" || obj.data === null) return null;
      if (typeof (obj.data as Record<string, unknown>).worker_id !== "string") return null;
      return {
        type: "control",
        action: "register",
        data: {
          worker_id: (obj.data as Record<string, unknown>).worker_id as string,
          capabilities: stringList((obj.data as Record<string, unknown>).capabilities),
        },
      };
    case "status":
      if (typeof obj.data === "object" && obj.data !== null) {
        const status = (obj.data as Record<string, unknown>).status;
        if (typeof status === "string") return { type: "status", data: { status } };
      }
      if (typeof obj.status === "string") return { type: "status", data: { status: obj.status } };
      return null;
    case "heartbeat":
      return { type: "heartbeat" };
    case "response":
      return {
        type: "response",
        session_id: typeof obj.session_id === "string" ? obj.session_id : undefined,
        data: obj.data,
      };
    case "stream":
      if (typeof obj.data !== "object" || obj.data === null || Array.isArray(obj.data)) return null;
      return {
        type: "stream",
        data: obj.data as Record<string, unknown>,
      };
    case "content": {
      if (typeof obj.data !== "object" || obj.data === null || Array.isArray(obj.data)) return null;
      const data = obj.data as Record<string, unknown>;
      if (typeof data.text !== "string") return null;
      return {
        type: "content",
        data: {
          text: data.text,
          run_id: typeof data.run_id === "string" ? data.run_id : undefined,
          node_id: typeof data.node_id === "string" ? data.node_id : undefined,
          session_id: typeof data.session_id === "string" ? data.session_id : undefined,
        },
      };
    }
    case "manager_command":
      if (typeof obj.data !== "object" || obj.data === null) return null;
      return {
        type: "manager_command",
        data: obj.data as Record<string, unknown>,
      };
    case "node_error": {
      if (typeof obj.data !== "object" || obj.data === null) return null;
      const data = obj.data as Record<string, unknown>;
      if (typeof data.runId !== "string") return null;
      if (typeof data.nodeId !== "string") return null;
      if (typeof data.message !== "string") return null;
      return {
        type: "node_error",
        data: {
          runId: data.runId,
          nodeId: data.nodeId,
          message: data.message,
          session_id: typeof data.session_id === "string" ? data.session_id : undefined,
        },
      };
    }
    case "pong":
      return { type: "pong" };
    default:
      return null;
  }
}
