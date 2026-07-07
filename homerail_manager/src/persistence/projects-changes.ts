import * as crypto from "node:crypto";
import { clearTables, encodeJson, getDb, parseJsonRow } from "./db.js";
import { normalizeStatus, type ChangeStatus, type ProjectStatus } from "./status.js";
import { nowIso } from "./time.js";

export interface Project {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  workspace_path?: string;
  project_root?: string;
  git_server_id?: string;
  git_repository?: string;
  git_branch?: string;
  storage_configurations?: string[];
  metadata?: Record<string, unknown>;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface Change {
  id: string;
  change_id: string;
  title: string;
  task: string;
  project_id?: string;
  description?: string;
  source_issue?: string;
  metadata?: Record<string, unknown>;
  status: ChangeStatus;
  created_at: string;
  updated_at: string;
}

function _generateId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function _jsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = parseJsonRow<unknown>(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function _string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function _trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function _jsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = parseJsonRow<unknown>(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function _projectFromRow(row: Record<string, unknown>): Project {
  const raw = _jsonObject(_string(row.data));
  const id = _trimmed(row.id) ?? _trimmed(raw.id) ?? _generateId();
  const projectId = _trimmed(row.project_id) ?? _trimmed(raw.project_id) ?? id;
  return {
    ...raw,
    id,
    project_id: projectId,
    name: _string(row.name) ?? _string(raw.name) ?? projectId,
    description: _string(row.description) ?? _string(raw.description),
    workspace_path: _string(row.workspace_path) ?? _string(raw.workspace_path),
    project_root: _string(row.project_root) ?? _string(raw.project_root),
    git_server_id: _string(row.git_server_id) ?? _string(raw.git_server_id),
    git_repository: _string(row.git_repo_name) ?? _string(raw.git_repository),
    git_branch: _string(row.git_default_branch) ?? _string(raw.git_branch),
    storage_configurations: Array.isArray(raw.storage_configurations)
      ? raw.storage_configurations.filter((item): item is string => typeof item === "string")
      : undefined,
    metadata: _jsonRecord(row.metadata) ?? (typeof raw.metadata === "object" && raw.metadata !== null && !Array.isArray(raw.metadata)
      ? raw.metadata as Record<string, unknown>
      : undefined),
    status: normalizeStatus("project", _string(row.status) ?? _string(raw.status), "active"),
    created_at: _string(row.created_at) ?? _string(raw.created_at) ?? nowIso(),
    updated_at: _string(row.updated_at) ?? _string(raw.updated_at) ?? nowIso(),
  };
}

function _changeFromRow(row: Record<string, unknown>): Change {
  const raw = _jsonObject(_string(row.data));
  const id = _trimmed(row.id) ?? _trimmed(raw.id) ?? _generateId();
  const changeId = _trimmed(row.change_id) ?? _trimmed(raw.change_id) ?? id;
  const title = _string(row.title) ?? _string(raw.title) ?? _string(row.task) ?? _string(raw.task) ?? changeId;
  return {
    ...raw,
    id,
    change_id: changeId,
    title,
    task: _string(row.task) ?? _string(raw.task) ?? title,
    project_id: _string(row.project_id) ?? _string(raw.project_id),
    description: _string(row.description) ?? _string(raw.description),
    source_issue: _string(row.source_issue) ?? _string(raw.source_issue),
    metadata: _jsonRecord(row.metadata) ?? (typeof raw.metadata === "object" && raw.metadata !== null && !Array.isArray(raw.metadata)
      ? raw.metadata as Record<string, unknown>
      : undefined),
    status: normalizeStatus("change", _string(row.status) ?? _string(raw.status), "open"),
    created_at: _string(row.created_at) ?? _string(raw.created_at) ?? nowIso(),
    updated_at: _string(row.updated_at) ?? _string(raw.updated_at) ?? nowIso(),
  };
}

function _readProjects(): Project[] {
  return (getDb()
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC, id")
    .all() as Record<string, unknown>[])
    .map(_projectFromRow);
}

function _writeProjects(projects: Project[]): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM projects").run();
    const stmt = db.prepare(`
      INSERT INTO projects(
        id, project_id, name, description, status, workspace_path, project_root,
        git_server_id, git_repo_name, git_default_branch, metadata,
        created_at, updated_at, data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const project of projects) {
      stmt.run(
        project.id,
        project.project_id,
        project.name,
        project.description ?? null,
        project.status,
        project.workspace_path ?? null,
        project.project_root ?? null,
        project.git_server_id ?? null,
        project.git_repository ?? null,
        project.git_branch ?? null,
        project.metadata ? encodeJson(project.metadata) : null,
        project.created_at,
        project.updated_at,
        encodeJson(project),
      );
    }
  })();
}

function _readChanges(): Change[] {
  return (getDb()
    .prepare("SELECT * FROM changes ORDER BY updated_at DESC, id")
    .all() as Record<string, unknown>[])
    .map(_changeFromRow);
}

function _writeChanges(changes: Change[]): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM changes").run();
    const stmt = db.prepare(`
      INSERT INTO changes(
        id, change_id, project_id, title, task, description, content,
        source_issue, status, metadata, created_at, updated_at, data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const change of changes) {
      stmt.run(
        change.id,
        change.change_id,
        change.project_id ?? null,
        change.title,
        change.task,
        change.description ?? null,
        change.task,
        change.source_issue ?? null,
        change.status,
        change.metadata ? encodeJson(change.metadata) : null,
        change.created_at,
        change.updated_at,
        encodeJson(change),
      );
    }
  })();
}

export function listProjects(): Project[] {
  return _readProjects();
}

export function getProject(id: string): Project | undefined {
  return _readProjects().find((p) => p.id === id || p.project_id === id);
}

export function createProject(input: {
  name: string;
  description?: string;
  workspace_path?: string;
  project_root?: string;
  git_server_id?: string;
  git_repository?: string;
  git_branch?: string;
  storage_configurations?: string[];
  metadata?: Record<string, unknown>;
}): Project {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Missing required field: name");
  }
  const now = nowIso();
  const project: Project = {
    id: _generateId(),
    project_id: "",
    name,
    description: input.description,
    workspace_path: input.workspace_path,
    project_root: input.project_root,
    git_server_id: input.git_server_id,
    git_repository: input.git_repository,
    git_branch: input.git_branch,
    storage_configurations: input.storage_configurations ?? [],
    metadata: input.metadata,
    status: "active",
    created_at: now,
    updated_at: now,
  };
  project.project_id = project.id;

  const projects = _readProjects();
  projects.push(project);
  _writeProjects(projects);
  return project;
}

export function updateProject(
  id: string,
  input: Partial<Pick<Project, "name" | "description" | "workspace_path" | "project_root" | "git_server_id" | "git_repository" | "git_branch" | "metadata">> & { status?: string },
): Project | undefined {
  const projects = _readProjects();
  const idx = projects.findIndex((p) => p.id === id || p.project_id === id);
  if (idx < 0) return undefined;
  const existing = projects[idx];
  const next: Project = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ),
    id: existing.id,
    project_id: existing.project_id,
    status: input.status === undefined
      ? existing.status
      : normalizeStatus("project", input.status, existing.status),
    updated_at: nowIso(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Missing required field: name");
    next.name = name;
  }
  projects[idx] = next;
  _writeProjects(projects);
  return next;
}

export function deleteProject(id: string): Project | undefined {
  const projects = _readProjects();
  const idx = projects.findIndex((p) => p.id === id || p.project_id === id);
  if (idx < 0) return undefined;
  const [deleted] = projects.splice(idx, 1);
  getDb().transaction(() => {
    _writeProjects(projects);
  })();
  return deleted;
}

export function listProjectStorages(id: string): Array<{ id: string; name: string; storage_type: string; path?: string; enabled: boolean }> | undefined {
  const project = getProject(id);
  if (!project) return undefined;
  const ids = project.storage_configurations?.length ? project.storage_configurations : ["workspace"];
  return ids.map((storageId) => ({
    id: storageId,
    name: storageId === "workspace" ? "Workspace" : storageId,
    storage_type: storageId === "workspace" ? "local_directory" : "custom",
    path: project.workspace_path ?? project.project_root,
    enabled: true,
  }));
}

export function listChanges(project_id?: string): Change[] {
  const changes = _readChanges();
  if (project_id) {
    return changes.filter((c) => c.project_id === project_id);
  }
  return changes;
}

export function getChange(id: string): Change | undefined {
  return _readChanges().find((c) => c.id === id || c.change_id === id);
}

export function createChange(input: {
  title?: string;
  task?: string;
  project_id?: string;
  description?: string;
  source_issue?: string;
  metadata?: Record<string, unknown>;
}): Change {
  const title = (input.title || input.task || "").trim();
  if (!title) {
    throw new Error("Missing required field: title (or task)");
  }
  if (input.project_id) {
    const project = getProject(input.project_id);
    if (!project) {
      throw new Error(`Project not found: ${input.project_id}`);
    }
  }

  const now = nowIso();
  const change: Change = {
    id: _generateId(),
    change_id: "",
    title,
    task: title,
    project_id: input.project_id,
    description: input.description,
    source_issue: input.source_issue,
    metadata: input.metadata,
    status: "open",
    created_at: now,
    updated_at: now,
  };
  change.change_id = change.id;

  const changes = _readChanges();
  changes.push(change);
  _writeChanges(changes);
  return change;
}

export function _clearAllProjects(): void {
  clearTables(["projects"]);
}

export function _clearAllChanges(): void {
  clearTables(["changes"]);
}
