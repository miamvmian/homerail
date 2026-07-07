/**
 * Native Agent Session persistence for TS Manager.
 *
 * Manager chat sessions are stored in the unified SQLite tables:
 *   sessions(session_type = 'manager_chat')
 *   session_messages(session_id, sequence, data)
 *
 * Legacy agent_sessions/agent_messages rows are read for migration only; normal
 * writes must not double-write to those compatibility tables.
 */

import * as path from "node:path";
import { getDataRoot } from "../config/env.js";
import { clearTables, encodeJson, getDb, parseJsonRow } from "./db.js";
import { normalizeStatus, type SessionStatus } from "./status.js";
import { nowIso } from "./time.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentSession {
  session_id: string;
  created_at: string;
  updated_at: string;
  status: Extract<SessionStatus, "active" | "closed">;
  project_id?: string;
  metadata: Record<string, unknown>;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  id?: string;
  run_id?: string;
  evidence_id?: string;
}

export interface AgentTurn {
  turn_id: string;
  run_id: string;
  user_message: AgentMessage;
  assistant_message: AgentMessage;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeSessionId(id: string): string {
  if (!id || id.includes("/") || id.includes("\\")) {
    throw new Error("session_id must be a non-empty single-segment identifier");
  }
  if (id === "." || id === "..") {
    throw new Error("session_id contains an unsafe path segment");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error("session_id contains unsupported characters");
  }
  return id;
}

export function sessionsDir(): string {
  return path.join(getDataRoot(), "agent-sessions");
}

function _rowToSession(row: { data: string } | undefined): AgentSession | undefined {
  if (!row) return undefined;
  try {
    return parseJsonRow<AgentSession>(row.data);
  } catch {
    return undefined;
  }
}

function _messageCount(sessionId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM session_messages WHERE session_id = ?")
    .get(sessionId) as { count: number } | undefined;
  return row?.count ?? 0;
}

function _upsertUnifiedSession(session: AgentSession): void {
  const messageCount = _messageCount(session.session_id);
  getDb()
    .prepare(`
      INSERT INTO sessions(
        id, session_id, session_type, project_id, status, start_time, end_time,
        message_count, created_at, updated_at, data
      )
      VALUES (?, ?, 'manager_chat', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        project_id = excluded.project_id,
        status = excluded.status,
        end_time = excluded.end_time,
        message_count = excluded.message_count,
        updated_at = excluded.updated_at,
        data = excluded.data
    `)
    .run(
      session.session_id,
      session.session_id,
      session.project_id ?? (typeof session.metadata.project_id === "string" ? session.metadata.project_id : null),
      normalizeStatus("session", session.status, "active"),
      session.created_at,
      session.status === "closed" ? session.updated_at : null,
      messageCount,
      session.created_at,
      session.updated_at,
      encodeJson(session),
    );
}

function _upsertSession(session: AgentSession): void {
  _upsertUnifiedSession(session);
}

function _ensureSession(sessionId: string): AgentSession {
  const existing = loadSession(sessionId);
  if (existing) return existing;
  return createSession(sessionId);
}

function _migrateLegacySessions(): void {
  const rows = getDb()
    .prepare(`
      SELECT a.data
      FROM agent_sessions a
      LEFT JOIN sessions s ON s.session_id = a.session_id
      WHERE s.session_id IS NULL
    `)
    .all() as Array<{ data: string }>;
  for (const row of rows) {
    const session = _rowToSession(row);
    if (session) _upsertUnifiedSession(session);
  }
}

function _nextMessageSequence(sessionId: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM session_messages WHERE session_id = ?")
    .get(sessionId) as { next_sequence: number } | undefined;
  return row?.next_sequence ?? 1;
}

function _insertUnifiedMessage(sessionId: string, message: AgentMessage): void {
  getDb()
    .prepare(`
      INSERT INTO session_messages(id, session_id, sequence, message_type, content, metadata, timestamp, synced, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `)
    .run(
      message.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      _nextMessageSequence(sessionId),
      message.role,
      message.content,
      encodeJson({
        run_id: message.run_id,
        evidence_id: message.evidence_id,
      }),
      message.timestamp,
      encodeJson(message),
    );
}

function _migrateLegacyMessages(sessionId: string): void {
  const existing = getDb()
    .prepare("SELECT id FROM session_messages WHERE session_id = ? LIMIT 1")
    .get(sessionId);
  if (existing) return;
  const rows = getDb()
    .prepare("SELECT data FROM agent_messages WHERE session_id = ? ORDER BY seq")
    .all(sessionId) as Array<{ data: string }>;
  for (const row of rows) {
    try {
      _insertUnifiedMessage(sessionId, parseJsonRow<AgentMessage>(row.data));
    } catch {
      // Skip malformed legacy messages.
    }
  }
}

// ---------------------------------------------------------------------------
// Persistence operations
// ---------------------------------------------------------------------------

export function createSession(sessionId?: string, metadata?: Record<string, unknown>, projectId?: string): AgentSession {
  const id = sessionId ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  safeSessionId(id);
  const now = nowIso();
  const session: AgentSession = {
    session_id: id,
    created_at: now,
    updated_at: now,
    status: "active",
    project_id: projectId,
    metadata: metadata ?? {},
  };

  _upsertSession(session);
  return session;
}

export function listSessions(projectId?: string, limit = 30): AgentSession[] {
  _migrateLegacySessions();
  const rows = projectId
    ? getDb()
        .prepare("SELECT data FROM sessions WHERE session_type = 'manager_chat' AND project_id = ? ORDER BY updated_at DESC LIMIT ?")
        .all(projectId, Math.max(1, limit)) as Array<{ data: string }>
    : getDb()
        .prepare("SELECT data FROM sessions WHERE session_type = 'manager_chat' ORDER BY updated_at DESC LIMIT ?")
        .all(Math.max(1, limit)) as Array<{ data: string }>;
  return rows
    .map(_rowToSession)
    .filter((session): session is AgentSession => Boolean(session))
    .filter((session) => !projectId || session.project_id === projectId || session.metadata?.project_id === projectId);
}

export function loadSession(sessionId: string): AgentSession | undefined {
  try {
    safeSessionId(sessionId);
  } catch {
    return undefined;
  }
  const row = getDb()
    .prepare("SELECT data FROM sessions WHERE session_type = 'manager_chat' AND session_id = ?")
    .get(sessionId) as { data: string } | undefined;
  const session = _rowToSession(row);
  if (session) return session;
  const legacyRow = getDb()
    .prepare("SELECT data FROM agent_sessions WHERE session_id = ?")
    .get(sessionId) as { data: string } | undefined;
  const legacySession = _rowToSession(legacyRow);
  if (legacySession) _upsertUnifiedSession(legacySession);
  return legacySession;
}

export function appendTurn(
  sessionId: string,
  userContent: string,
  assistantContent: string,
  runId: string,
  evidenceId?: string,
): AgentTurn {
  safeSessionId(sessionId);
  const now = nowIso();
  const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const userMessage: AgentMessage = {
    role: "user",
    content: userContent,
    timestamp: now,
    run_id: runId,
    evidence_id: evidenceId,
  };

  const assistantMessage: AgentMessage = {
    role: "assistant",
    content: assistantContent,
    timestamp: now,
    run_id: runId,
    evidence_id: evidenceId,
  };

  const db = getDb();
  db.transaction(() => {
    const session = _ensureSession(sessionId);
    session.updated_at = now;
    _upsertSession(session);
    _insertUnifiedMessage(sessionId, userMessage);
    _insertUnifiedMessage(sessionId, assistantMessage);
    _upsertUnifiedSession(session);
  })();

  return {
    turn_id: turnId,
    run_id: runId,
    user_message: userMessage,
    assistant_message: assistantMessage,
    created_at: now,
  };
}

export function appendMessage(
  sessionId: string,
  role: AgentMessage["role"],
  content: string,
  extra?: Partial<AgentMessage>,
): AgentMessage {
  safeSessionId(sessionId);
  const now = nowIso();
  const message: AgentMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: now,
    ...extra,
  };
  const db = getDb();
  db.transaction(() => {
    const session = _ensureSession(sessionId);
    session.updated_at = now;
    _upsertSession(session);
    _insertUnifiedMessage(sessionId, message);
    _upsertUnifiedSession(session);
  })();
  return message;
}

export function loadMessages(sessionId: string): AgentMessage[] {
  try {
    safeSessionId(sessionId);
  } catch {
    return [];
  }
  _migrateLegacyMessages(sessionId);
  const rows = getDb()
    .prepare("SELECT data FROM session_messages WHERE session_id = ? ORDER BY sequence")
    .all(sessionId) as Array<{ data: string }>;
  return rows
    .map((row) => {
      try {
        return parseJsonRow<AgentMessage>(row.data);
      } catch {
        return undefined;
      }
    })
    .filter((message): message is AgentMessage => Boolean(message));
}

export function closeSession(sessionId: string): AgentSession | undefined {
  const session = loadSession(sessionId);
  if (!session) return undefined;
  session.status = "closed";
  session.updated_at = nowIso();
  _upsertSession(session);
  return session;
}

export function deleteSession(sessionId: string): boolean {
  try {
    safeSessionId(sessionId);
  } catch {
    return false;
  }
  const db = getDb();
  let changes = 0;
  db.transaction(() => {
    changes += db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId).changes;
    changes += db.prepare("DELETE FROM agent_sessions WHERE session_id = ?").run(sessionId).changes;
  })();
  return changes > 0;
}

export function validateSessionId(id: string): boolean {
  try {
    safeSessionId(id);
    return true;
  } catch {
    return false;
  }
}

export function _clearAllSessions(): void {
  clearTables(["session_messages", "sessions", "agent_messages", "agent_sessions"]);
}
