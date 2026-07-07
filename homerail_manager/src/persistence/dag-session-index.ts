import { clearTables, encodeJson, getDb } from "./db.js";

export interface DagSessionIndexEntry {
  run_id: string;
  node_id: string;
  project_key: string;
  session_id: string;
  attempt: number;
  parent_session_id?: string | null;
  forked_from_entry_uuid?: string | null;
  resume_instruction?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function _safeSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Missing required field: ${label}`);
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed === "." || trimmed === "..") {
    throw new Error(`${label} contains an unsafe path segment`);
  }
  return trimmed;
}

function _sessionStatus(status: string | undefined): string {
  switch (status) {
    case "running":
    case "active":
    case "failed":
    case "cancelled":
    case "blocked":
      return status;
    case "completed":
    case "done":
      return "done";
    default:
      return "active";
  }
}

function _upsertUnifiedDagSession(entry: DagSessionIndexEntry): void {
  const status = _sessionStatus(entry.status);
  getDb()
    .prepare(`
      INSERT INTO sessions(
        id, session_id, session_type, project_id, parent_session_id, worker_id,
        status, start_time, end_time, message_count, run_ids,
        created_at, updated_at, data
      )
      VALUES (?, ?, 'dag_node', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        session_type = excluded.session_type,
        project_id = excluded.project_id,
        parent_session_id = excluded.parent_session_id,
        worker_id = excluded.worker_id,
        status = excluded.status,
        end_time = excluded.end_time,
        run_ids = excluded.run_ids,
        updated_at = excluded.updated_at,
        data = excluded.data
    `)
    .run(
      entry.session_id,
      entry.session_id,
      entry.project_key,
      entry.parent_session_id ?? null,
      entry.node_id,
      status,
      entry.created_at,
      status === "done" || status === "failed" || status === "cancelled" ? entry.updated_at : null,
      encodeJson([entry.run_id]),
      entry.created_at,
      entry.updated_at,
      encodeJson(entry),
    );
}

export function upsertDagSessionIndex(input: {
  run_id: string;
  node_id: string;
  project_key: string;
  session_id: string;
  attempt?: number;
  parent_session_id?: string | null;
  forked_from_entry_uuid?: string | null;
  resume_instruction?: string | null;
  status?: string;
}): DagSessionIndexEntry {
  const now = new Date().toISOString();
  const existing = getDb()
    .prepare("SELECT created_at, attempt, parent_session_id, forked_from_entry_uuid, resume_instruction, status FROM dag_session_index WHERE run_id = ? AND node_id = ?")
    .get(input.run_id, input.node_id) as {
      created_at: string;
      attempt?: number;
      parent_session_id?: string | null;
      forked_from_entry_uuid?: string | null;
      resume_instruction?: string | null;
      status?: string;
    } | undefined;
  const entry: DagSessionIndexEntry = {
    run_id: _safeSegment(input.run_id, "run_id"),
    node_id: _safeSegment(input.node_id, "node_id"),
    project_key: _safeSegment(input.project_key, "project_key"),
    session_id: _safeSegment(input.session_id, "session_id"),
    attempt: Number.isFinite(input.attempt) && Number(input.attempt) > 0
      ? Math.floor(Number(input.attempt))
      : existing?.attempt ?? 1,
    parent_session_id: input.parent_session_id ?? existing?.parent_session_id ?? null,
    forked_from_entry_uuid: input.forked_from_entry_uuid ?? existing?.forked_from_entry_uuid ?? null,
    resume_instruction: input.resume_instruction ?? existing?.resume_instruction ?? null,
    status: input.status ?? existing?.status ?? "active",
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  getDb()
    .prepare(`
      INSERT INTO dag_session_index(
        run_id, node_id, project_key, session_id, attempt, parent_session_id,
        forked_from_entry_uuid, resume_instruction, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, node_id) DO UPDATE SET
        project_key = excluded.project_key,
        session_id = excluded.session_id,
        attempt = excluded.attempt,
        parent_session_id = excluded.parent_session_id,
        forked_from_entry_uuid = excluded.forked_from_entry_uuid,
        resume_instruction = excluded.resume_instruction,
        status = excluded.status,
        updated_at = excluded.updated_at
    `)
    .run(
      entry.run_id,
      entry.node_id,
      entry.project_key,
      entry.session_id,
      entry.attempt,
      entry.parent_session_id ?? null,
      entry.forked_from_entry_uuid ?? null,
      entry.resume_instruction ?? null,
      entry.status,
      entry.created_at,
      entry.updated_at,
    );
  _upsertUnifiedDagSession(entry);
  return entry;
}

export function getDagSessionIndex(runId: string, nodeId: string): DagSessionIndexEntry | undefined {
  const entry = getDb()
    .prepare("SELECT * FROM dag_session_index WHERE run_id = ? AND node_id = ?")
    .get(runId, nodeId) as DagSessionIndexEntry | undefined;
  if (entry) _upsertUnifiedDagSession(entry);
  return entry;
}

export function listDagSessionIndex(runId: string): DagSessionIndexEntry[] {
  const entries = getDb()
    .prepare("SELECT * FROM dag_session_index WHERE run_id = ? ORDER BY node_id")
    .all(runId) as DagSessionIndexEntry[];
  for (const entry of entries) _upsertUnifiedDagSession(entry);
  return entries;
}

export function deleteDagSessionIndexForRun(runId: string): number {
  return getDb().prepare("DELETE FROM dag_session_index WHERE run_id = ?").run(runId).changes;
}

export function _clearDagSessionIndex(): void {
  clearTables(["dag_session_index"]);
}
