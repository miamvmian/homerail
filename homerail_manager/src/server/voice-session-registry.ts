/**
 * Voice session runtime registry.
 *
 * Tracks in-flight voice agent turns so that:
 * - Multiple sessions can run in parallel (no global lock).
 * - The same session's turns are serialized (per-session mutex) to avoid
 *   last-writer-wins saveWorkspace races.
 * - Status transitions are emitted via the event bus so any connected client
 *   (cross-device, cross-tab) sees live updates without polling.
 * - Stale "running" sessions are detected and reset on manager startup.
 */

import { emit, type VoiceSessionStatusPayload } from "../events/bus.js";
import { getDb, parseJsonRow } from "../persistence/db.js";

export interface VoiceTurnHandle {
  sessionId: string;
  startedAt: number;
  status: string;
  controller: AbortController;
}

// In-memory registry of currently-executing voice turns, keyed by session id.
// Survives only within the manager process lifetime; stale recovery handles
// the post-restart case.
const activeTurns = new Map<string, VoiceTurnHandle>();

// Per-session serialization chains. Each session gets a promise that the next
// turn awaits, ensuring turns on the same session run one-at-a-time.
const sessionLocks = new Map<string, Promise<unknown>>();

function emitStatus(sessionId: string, status: string, phase?: string): void {
  const payload: VoiceSessionStatusPayload = {
    voiceSessionId: sessionId,
    status,
    phase,
    timestamp: new Date().toISOString(),
  };
  emit("voice:session_status", payload);
}

/**
 * Register a turn as in-flight and broadcast its status.
 * Returns the handle so the caller can later complete/abort it.
 */
export function registerTurn(sessionId: string, status: string): VoiceTurnHandle {
  const controller = new AbortController();
  const handle: VoiceTurnHandle = {
    sessionId,
    startedAt: Date.now(),
    status,
    controller,
  };
  activeTurns.set(sessionId, handle);
  emitStatus(sessionId, status);
  return handle;
}

/**
 * Update the status of an in-flight turn (without re-registering).
 */
export function updateTurnStatus(sessionId: string, status: string, phase?: string): void {
  const handle = activeTurns.get(sessionId);
  if (handle) handle.status = status;
  emitStatus(sessionId, status, phase);
}

/**
 * Complete a turn: remove from registry and broadcast final status.
 */
export function completeTurn(sessionId: string, status: string): void {
  activeTurns.delete(sessionId);
  emitStatus(sessionId, status);
}

/**
 * Abort a turn (e.g. user clicked stop). Signals the AbortController and
 * removes from registry.
 */
export function abortTurn(sessionId: string): void {
  const handle = activeTurns.get(sessionId);
  if (handle) {
    handle.controller.abort();
    activeTurns.delete(sessionId);
    emitStatus(sessionId, "aborted");
  }
}

export function isTurnActive(sessionId: string): boolean {
  return activeTurns.has(sessionId);
}

export function getTurnStatus(sessionId: string): string | null {
  return activeTurns.get(sessionId)?.status ?? null;
}

/** Test helper: whether a session lock chain currently exists in the map. */
export function _hasSessionLock(sessionId: string): boolean {
  return sessionLocks.has(sessionId);
}

/**
 * Serialize turns within a single session. Different sessions run in parallel.
 *
 * Usage:
 *   await withSessionLock(sessionId, async () => { ... });
 */
export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = sessionLocks.get(sessionId) ?? Promise.resolve();
  let release: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  // 用同一个引用存入 map 和做清理比较，避免 .then() 创建新对象导致 === 永不匹配。
  const chain = previous.then(() => next);
  sessionLocks.set(sessionId, chain);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    // 如果没有后续 turn 排队，清理锁条目防止 Map 无限增长。
    if (sessionLocks.get(sessionId) === chain) {
      sessionLocks.delete(sessionId);
    }
  }
}

interface VoiceWorkspaceRow {
  session_id: string;
  data: string;
}

interface VoiceProgressBrief {
  status?: string;
  updated_at?: string;
}

interface VoiceWorkspaceBlob {
  session_id: string;
  progress_brief?: VoiceProgressBrief;
  updated_at?: string;
}

/**
 * On manager startup, scan for sessions stuck in a "running"/"submitted"
 * status that have no live turn in the registry (because the process
 * restarted). Reset them to "interrupted" so the UI doesn't show a
 * perpetually-running ghost session.
 */
export function recoverStaleVoiceSessions(): { recovered: string[] } {
  const recovered: string[] = [];
  try {
    const rows = getDb()
      .prepare("SELECT session_id, data FROM voice_agent_sessions")
      .all() as VoiceWorkspaceRow[];
    for (const row of rows) {
      if (activeTurns.has(row.session_id)) continue;
      let workspace: VoiceWorkspaceBlob;
      try {
        workspace = parseJsonRow<VoiceWorkspaceBlob>(row.data);
      } catch {
        continue;
      }
      const status = workspace.progress_brief?.status;
      if (status === "running" || status === "submitted") {
        const interruptedAt = new Date().toISOString();
        workspace.progress_brief = {
          ...workspace.progress_brief,
          status: "interrupted",
          updated_at: interruptedAt,
        };
        workspace.updated_at = interruptedAt;
        const data = JSON.stringify(workspace);
        const db = getDb();
        // 同步更新 voice_agent_sessions（JSON blob，voice UI 读这里）和
        // sessions 表（统一 session 列表读这里），保持两表一致。
        db.transaction(() => {
          db.prepare("UPDATE voice_agent_sessions SET updated_at = ?, data = ? WHERE session_id = ?")
            .run(interruptedAt, data, row.session_id);
          db.prepare("UPDATE sessions SET status = 'interrupted', updated_at = ?, data = ? WHERE session_id = ? AND session_type = 'voice_agent'")
            .run(interruptedAt, data, row.session_id);
        })();
        recovered.push(row.session_id);
        emitStatus(row.session_id, "interrupted");
      }
    }
  } catch {
    // DB not ready or table missing during early startup — non-fatal.
  }
  return { recovered };
}
