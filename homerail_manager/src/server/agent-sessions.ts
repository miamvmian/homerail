/**
 * Native Agent Session route handler for TS Manager.
 *
 * Provides HTTP endpoints for agent session lifecycle:
 *   POST   /api/agent/sessions                   — create session
 *   POST   /api/agent/sessions/:session_id/turns  — append a text turn
 *   GET    /api/agent/sessions/:session_id        — get session metadata
 *   GET    /api/agent/sessions/:session_id/messages — get all messages
 */

import * as http from "node:http";
import {
  createSession,
  loadSession,
  listSessions,
  appendTurn,
  appendMessage,
  loadMessages,
  closeSession,
  deleteSession,
  validateSessionId,
} from "../persistence/agent-sessions.js";
import { loadRunMetadata } from "../persistence/store.js";
import { getActiveRun } from "../runtime/active-runs.js";

// ---------------------------------------------------------------------------
// Response helpers (same pattern as mutations.ts)
// ---------------------------------------------------------------------------

interface BaseResponse {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

function json(res: http.ServerResponse, status: number, body: BaseResponse) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function _badRequest(res: http.ServerResponse, message: string) {
  json(res, 400, { success: false, message, error: message });
}

function _notFound(res: http.ServerResponse, message: string) {
  json(res, 404, { success: false, message, error: message });
}

function _ok(res: http.ServerResponse, message: string, data?: unknown) {
  json(res, 200, { success: true, message, data });
}

function _created(res: http.ServerResponse, message: string, data: unknown) {
  json(res, 201, { success: true, message, data });
}

async function _readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function agentSessionRoutesHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;

  // POST /api/agent/sessions — create a new session
  if (pathname === "/api/agent/sessions" && req.method === "POST") {
    _readJsonBody(req)
      .then((body) => {
        const b = body as Record<string, unknown>;
        const sessionId = typeof b.session_id === "string" ? b.session_id : undefined;
        const metadata = typeof b.metadata === "object" && b.metadata !== null
          ? b.metadata as Record<string, unknown>
          : undefined;
        const projectId = typeof b.project_id === "string"
          ? b.project_id
          : typeof metadata?.project_id === "string"
            ? metadata.project_id
            : undefined;

        // Validate custom session_id if provided
        if (sessionId && !validateSessionId(sessionId)) {
          _badRequest(res, "Invalid session_id: must contain only alphanumeric characters, dots, dashes, and underscores");
          return;
        }

        try {
          const session = createSession(sessionId, metadata, projectId);
          _created(res, "Session created", {
            session_id: session.session_id,
            created_at: session.created_at,
            status: session.status,
            metadata: session.metadata,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          _badRequest(res, message);
        }
      })
      .catch((err) => {
        _badRequest(res, err instanceof Error ? err.message : "Invalid JSON body");
      });
    return true;
  }

  // GET /api/manager/sessions — list Manager chat sessions
  if (pathname === "/api/manager/sessions" && req.method === "GET") {
    const url = new URL(req.url || "/", "http://localhost");
    const projectId = url.searchParams.get("project_id") || undefined;
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || "30") || 30, 200));
    const sessions = listSessions(projectId, limit).map((session) => ({
      id: session.session_id,
      session_id: session.session_id,
      project_id: session.project_id ?? (typeof session.metadata.project_id === "string" ? session.metadata.project_id : ""),
      status: session.status,
      created_at: session.created_at,
      updated_at: session.updated_at,
      metadata: session.metadata,
    }));
    _ok(res, "Manager sessions retrieved", { sessions, total: sessions.length });
    return true;
  }

  // GET/POST/DELETE /api/manager/sessions/:session_id...
  const managerMessagesMatch = pathname.match(/^\/api\/manager\/sessions\/([^/]+)\/messages$/);
  if (managerMessagesMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(managerMessagesMatch[1]);
    const session = loadSession(sessionId);
    if (!session) {
      _notFound(res, `Session not found: ${sessionId}`);
      return true;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || "200") || 200, 1000));
    const messages = loadMessages(sessionId).slice(-limit);
    _ok(res, "Manager session messages retrieved", { session_id: sessionId, messages, total: messages.length });
    return true;
  }

  const managerCloseMatch = pathname.match(/^\/api\/manager\/sessions\/([^/]+)\/close$/);
  if (managerCloseMatch && req.method === "POST") {
    const sessionId = decodeURIComponent(managerCloseMatch[1]);
    const session = closeSession(sessionId);
    if (!session) {
      _notFound(res, `Session not found: ${sessionId}`);
      return true;
    }
    _ok(res, "Manager session closed", session);
    return true;
  }

  const managerSessionMatch = pathname.match(/^\/api\/manager\/sessions\/([^/]+)$/);
  if (managerSessionMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(managerSessionMatch[1]);
    const session = loadSession(sessionId);
    if (!session) {
      _notFound(res, `Session not found: ${sessionId}`);
      return true;
    }
    _ok(res, "Manager session retrieved", {
      id: session.session_id,
      session_id: session.session_id,
      project_id: session.project_id ?? (typeof session.metadata.project_id === "string" ? session.metadata.project_id : ""),
      status: session.status,
      created_at: session.created_at,
      updated_at: session.updated_at,
      metadata: session.metadata,
    });
    return true;
  }

  if (managerSessionMatch && req.method === "DELETE") {
    const sessionId = decodeURIComponent(managerSessionMatch[1]);
    if (!deleteSession(sessionId)) {
      _notFound(res, `Session not found: ${sessionId}`);
      return true;
    }
    _ok(res, "Manager session deleted", { session_id: sessionId });
    return true;
  }

  // POST /api/agent/sessions/:session_id/turns — append a text turn
  const turnsMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/turns$/);
  if (turnsMatch && req.method === "POST") {
    const sessionId = decodeURIComponent(turnsMatch[1]);
    if (!validateSessionId(sessionId)) {
      _badRequest(res, "Invalid session_id: must contain only alphanumeric characters, dots, dashes, and underscores");
      return true;
    }
    _readJsonBody(req)
      .then((body) => {
        const b = body as Record<string, unknown>;
        const message = typeof b.message === "string" ? b.message : "";
        if (!message) {
          _badRequest(res, "Missing required field: message");
          return;
        }

        // Verify session exists
        const session = loadSession(sessionId);
        if (!session) {
          _notFound(res, `Session not found: ${sessionId}`);
          return;
        }

        const assistantContent = typeof b.assistant_message === "string" ? b.assistant_message : "";
        const runId = typeof b.run_id === "string" ? b.run_id.trim() : "";
        if (!runId) {
          const responseText = assistantContent || "已收到。当前没有绑定 DAG run，此回合已记录到 Manager 会话历史；启动 DAG 后这里会继续展示进度和证据。";
          const userMessage = appendMessage(sessionId, "user", message);
          const assistantMessage = appendMessage(sessionId, "assistant", responseText);
          _ok(res, "Turn recorded", {
            session_id: sessionId,
            run_id: "",
            turn_id: assistantMessage.id ?? "",
            user_message: userMessage,
            assistant_message: assistantMessage,
          });
          return;
        }
        if (!getActiveRun(runId) && !loadRunMetadata(runId)) {
          _notFound(res, `Run not found: ${runId}`);
          return;
        }
        if (!assistantContent) {
          _badRequest(res, "Missing required field: assistant_message");
          return;
        }
        const evidenceId = typeof b.evidence_id === "string" ? b.evidence_id : runId;
        const turn = appendTurn(sessionId, message, assistantContent, runId, evidenceId);

        _ok(res, "Turn recorded", {
          session_id: sessionId,
          run_id: turn.run_id,
          turn_id: turn.turn_id,
          user_message: turn.user_message,
          assistant_message: turn.assistant_message,
        });
      })
      .catch((err) => {
        _badRequest(res, err instanceof Error ? err.message : "Invalid JSON body");
      });
    return true;
  }

  // GET /api/agent/sessions/:session_id — get session metadata
  const sessionMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)$/);
  if (sessionMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    if (!validateSessionId(sessionId)) {
      _badRequest(res, "Invalid session_id: must contain only alphanumeric characters, dots, dashes, and underscores");
      return true;
    }
    const session = loadSession(sessionId);
    if (!session) {
      _notFound(res, `Session not found: ${sessionId}`);
      return true;
    }
    _ok(res, "Session retrieved", session);
    return true;
  }

  // GET /api/agent/sessions/:session_id/messages — get all messages
  const messagesMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/);
  if (messagesMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(messagesMatch[1]);
    if (!validateSessionId(sessionId)) {
      _badRequest(res, "Invalid session_id: must contain only alphanumeric characters, dots, dashes, and underscores");
      return true;
    }
    const session = loadSession(sessionId);
    if (!session) {
      _notFound(res, `Session not found: ${sessionId}`);
      return true;
    }
    const messages = loadMessages(sessionId);
    _ok(res, `Messages retrieved (${messages.length} messages)`, {
      session_id: sessionId,
      messages,
      total: messages.length,
    });
    return true;
  }

  return false;
}
