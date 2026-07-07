import * as crypto from "node:crypto";
import { clearTables, encodeJson, getDb, parseJsonRow } from "./db.js";
import { getChange, getProject } from "./projects-changes.js";
import { normalizeStatus, type ChangeRunStatus } from "./status.js";
import { nowIso } from "./time.js";

export interface ChangeRun {
  id: string;
  change_id: string;
  project_id: string;
  worker_container_id?: string;
  workspace_id?: string;
  name?: string;
  description?: string;
  created_at: string;
  orchestration_id?: string;
  orchestration_yaml_snapshot?: string;
  orchestration_version?: string;
  run_number?: number;
  git_branch?: string;
  worktree_path?: string;
  storage_backend?: string;
  manager_agent_config?: Record<string, unknown>;
  worker_model_config?: Record<string, unknown>;
  manager_provider_name?: string;
  manager_model_name?: string;
  worker_provider_name?: string;
  worker_model_name?: string;
  runtime_profile?: string;
  model_map?: Record<string, unknown>;
  status: ChangeRunStatus;
  current_phase?: string;
  phases?: unknown[];
  started_at?: string;
  completed_at?: string;
  result_summary?: string;
  error_message?: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface ChangeRunInput {
  change_id: string;
  project_id?: string;
  worker_container_id?: string;
  workspace_id?: string;
  name?: string;
  description?: string;
  orchestration_id?: string;
  orchestration_yaml_snapshot?: string;
  orchestration_version?: string;
  run_number?: number;
  git_branch?: string;
  worktree_path?: string;
  storage_backend?: string;
  manager_agent_config?: Record<string, unknown>;
  worker_model_config?: Record<string, unknown>;
  manager_provider_name?: string;
  manager_model_name?: string;
  worker_provider_name?: string;
  worker_model_name?: string;
  runtime_profile?: string;
  model_map?: Record<string, unknown>;
  status?: string;
  current_phase?: string;
  phases?: unknown[];
  started_at?: string;
  completed_at?: string;
  result_summary?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

function _generateId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function _jsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = parseJsonRow<unknown>(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function _jsonRecord(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const parsed = _jsonObject(raw);
  return Object.keys(parsed).length ? parsed : undefined;
}

function _jsonArray(raw: unknown): unknown[] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = parseJsonRow<unknown>(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function _string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function _number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function _changeRunFromRow(row: Record<string, unknown>): ChangeRun {
  const raw = _jsonObject(row.data);
  const id = _string(row.id) ?? _string(raw.id) ?? _generateId();
  const changeId = _string(row.change_id) ?? _string(raw.change_id) ?? "";
  const projectId = _string(row.project_id) ?? _string(raw.project_id) ?? "";
  return {
    ...raw,
    id,
    change_id: changeId,
    project_id: projectId,
    worker_container_id: _string(row.worker_container_id) ?? _string(raw.worker_container_id),
    workspace_id: _string(row.workspace_id) ?? _string(raw.workspace_id),
    name: _string(row.name) ?? _string(raw.name),
    description: _string(row.description) ?? _string(raw.description),
    created_at: _string(row.created_at) ?? _string(raw.created_at) ?? nowIso(),
    orchestration_id: _string(row.orchestration_id) ?? _string(raw.orchestration_id),
    orchestration_yaml_snapshot: _string(row.orchestration_yaml_snapshot) ?? _string(raw.orchestration_yaml_snapshot),
    orchestration_version: _string(row.orchestration_version) ?? _string(raw.orchestration_version),
    run_number: _number(row.run_number) ?? _number(raw.run_number),
    git_branch: _string(row.git_branch) ?? _string(raw.git_branch),
    worktree_path: _string(row.worktree_path) ?? _string(raw.worktree_path),
    storage_backend: _string(row.storage_backend) ?? _string(raw.storage_backend),
    manager_agent_config: _jsonRecord(row.manager_agent_config) ?? _jsonRecord(raw.manager_agent_config),
    worker_model_config: _jsonRecord(row.worker_model_config) ?? _jsonRecord(raw.worker_model_config),
    manager_provider_name: _string(row.manager_provider_name) ?? _string(raw.manager_provider_name),
    manager_model_name: _string(row.manager_model_name) ?? _string(raw.manager_model_name),
    worker_provider_name: _string(row.worker_provider_name) ?? _string(raw.worker_provider_name),
    worker_model_name: _string(row.worker_model_name) ?? _string(raw.worker_model_name),
    runtime_profile: _string(row.runtime_profile) ?? _string(raw.runtime_profile),
    model_map: _jsonRecord(row.model_map) ?? _jsonRecord(raw.model_map),
    status: normalizeStatus("change_run", _string(row.status) ?? _string(raw.status), "created"),
    current_phase: _string(row.current_phase) ?? _string(raw.current_phase),
    phases: _jsonArray(row.phases) ?? (Array.isArray(raw.phases) ? raw.phases : undefined),
    started_at: _string(row.started_at) ?? _string(raw.started_at),
    completed_at: _string(row.completed_at) ?? _string(raw.completed_at),
    result_summary: _string(row.result_summary) ?? _string(raw.result_summary),
    error_message: _string(row.error_message) ?? _string(raw.error_message),
    updated_at: _string(raw.updated_at) ?? _string(row.updated_at) ?? nowIso(),
    metadata: _jsonRecord(raw.metadata),
  };
}

function _writeChangeRun(run: ChangeRun): void {
  getDb().prepare(`
    INSERT INTO change_runs(
      id, change_id, project_id, worker_container_id, workspace_id, name,
      description, created_at, orchestration_id, orchestration_yaml_snapshot,
      orchestration_version, run_number, git_branch, worktree_path,
      storage_backend, manager_agent_config, worker_model_config,
      manager_provider_name, manager_model_name, worker_provider_name,
      worker_model_name, runtime_profile, model_map, status, current_phase,
      phases, started_at, completed_at, result_summary, error_message, data
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      change_id = excluded.change_id,
      project_id = excluded.project_id,
      worker_container_id = excluded.worker_container_id,
      workspace_id = excluded.workspace_id,
      name = excluded.name,
      description = excluded.description,
      orchestration_id = excluded.orchestration_id,
      orchestration_yaml_snapshot = excluded.orchestration_yaml_snapshot,
      orchestration_version = excluded.orchestration_version,
      run_number = excluded.run_number,
      git_branch = excluded.git_branch,
      worktree_path = excluded.worktree_path,
      storage_backend = excluded.storage_backend,
      manager_agent_config = excluded.manager_agent_config,
      worker_model_config = excluded.worker_model_config,
      manager_provider_name = excluded.manager_provider_name,
      manager_model_name = excluded.manager_model_name,
      worker_provider_name = excluded.worker_provider_name,
      worker_model_name = excluded.worker_model_name,
      runtime_profile = excluded.runtime_profile,
      model_map = excluded.model_map,
      status = excluded.status,
      current_phase = excluded.current_phase,
      phases = excluded.phases,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      result_summary = excluded.result_summary,
      error_message = excluded.error_message,
      data = excluded.data
  `).run(
    run.id,
    run.change_id,
    run.project_id,
    run.worker_container_id ?? null,
    run.workspace_id ?? null,
    run.name ?? null,
    run.description ?? null,
    run.created_at,
    run.orchestration_id ?? null,
    run.orchestration_yaml_snapshot ?? null,
    run.orchestration_version ?? null,
    run.run_number ?? null,
    run.git_branch ?? null,
    run.worktree_path ?? null,
    run.storage_backend ?? null,
    run.manager_agent_config ? encodeJson(run.manager_agent_config) : null,
    run.worker_model_config ? encodeJson(run.worker_model_config) : null,
    run.manager_provider_name ?? null,
    run.manager_model_name ?? null,
    run.worker_provider_name ?? null,
    run.worker_model_name ?? null,
    run.runtime_profile ?? null,
    run.model_map ? encodeJson(run.model_map) : null,
    run.status,
    run.current_phase ?? null,
    run.phases ? encodeJson(run.phases) : null,
    run.started_at ?? null,
    run.completed_at ?? null,
    run.result_summary ?? null,
    run.error_message ?? null,
    encodeJson(run),
  );
}

function _nextRunNumber(changeId: string): number {
  const row = getDb()
    .prepare("SELECT MAX(run_number) AS max_run_number FROM change_runs WHERE change_id = ?")
    .get(changeId) as { max_run_number?: number | null } | undefined;
  return (row?.max_run_number ?? 0) + 1;
}

export function listChangeRuns(filter?: { change_id?: string; project_id?: string }): ChangeRun[] {
  const clauses: string[] = [];
  const args: string[] = [];
  if (filter?.change_id) {
    clauses.push("change_id = ?");
    args.push(filter.change_id);
  }
  if (filter?.project_id) {
    clauses.push("project_id = ?");
    args.push(filter.project_id);
  }
  const sql = `SELECT * FROM change_runs${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC, id`;
  return (getDb().prepare(sql).all(...args) as Record<string, unknown>[]).map(_changeRunFromRow);
}

export function getChangeRun(id: string): ChangeRun | undefined {
  const row = getDb().prepare("SELECT * FROM change_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? _changeRunFromRow(row) : undefined;
}

export function createChangeRun(input: ChangeRunInput): ChangeRun {
  const changeId = input.change_id.trim();
  if (!changeId) throw new Error("Missing required field: change_id");
  const change = getChange(changeId);
  if (!change) throw new Error(`Change not found: ${changeId}`);
  const projectId = input.project_id?.trim() || change.project_id;
  if (!projectId) throw new Error("Missing required field: project_id");
  if (!getProject(projectId)) throw new Error(`Project not found: ${projectId}`);
  const now = nowIso();
  const run: ChangeRun = {
    ...input,
    id: _generateId(),
    change_id: change.id,
    project_id: projectId,
    run_number: input.run_number ?? _nextRunNumber(change.id),
    status: normalizeStatus("change_run", input.status, "created"),
    created_at: now,
    updated_at: now,
  };
  _writeChangeRun(run);
  return run;
}

export function updateChangeRun(id: string, patch: Partial<ChangeRunInput>): ChangeRun | undefined {
  const existing = getChangeRun(id);
  if (!existing) return undefined;
  const next: ChangeRun = {
    ...existing,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    id: existing.id,
    change_id: existing.change_id,
    project_id: existing.project_id,
    created_at: existing.created_at,
    updated_at: nowIso(),
  };
  if (patch.status !== undefined) {
    next.status = normalizeStatus("change_run", patch.status, existing.status);
  }
  _writeChangeRun(next);
  return next;
}

export function deleteChangeRun(id: string): boolean {
  const info = getDb().prepare("DELETE FROM change_runs WHERE id = ?").run(id);
  return info.changes > 0;
}

export function _clearAllChangeRuns(): void {
  clearTables(["change_runs"]);
}
