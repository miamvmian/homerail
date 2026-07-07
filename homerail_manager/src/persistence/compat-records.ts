import { encodeJson, getDb, parseJsonRow } from "./db.js";
import {
  normalizeStatus,
  type PersistenceStatusDomain,
} from "./status.js";
import { nowIso } from "./time.js";

type CompatConfig = {
  columns: readonly string[];
  required?: readonly string[];
  defaults?: Record<string, unknown>;
  jsonColumns?: readonly string[];
  timestampColumns?: readonly string[];
  statusDomain?: PersistenceStatusDomain;
  defaultStatus?: string;
};

const JSON_OBJECT = "{}";
const JSON_ARRAY = "[]";

export const COMPAT_RECORD_TABLES = {
  session_activity_logs: {
    columns: ["id", "session_id", "activity_type", "activity_data", "message", "level", "timestamp"],
    required: ["id", "session_id", "activity_type", "message", "level", "timestamp"],
    defaults: { activity_type: "record", message: "", level: "info" },
    jsonColumns: ["activity_data"],
    timestampColumns: ["timestamp"],
  },
  event_records: {
    columns: [
      "id", "event_id", "event_type", "timestamp", "project_id", "worker_id",
      "change_id", "claude_session_id", "event_data", "priority",
      "is_persistent", "is_processed", "retry_count", "created_at", "processed_at",
    ],
    required: ["id", "event_id", "event_type", "timestamp", "created_at"],
    defaults: { event_type: "unknown", priority: 0, is_persistent: 1, is_processed: 0, retry_count: 0 },
    jsonColumns: ["event_data"],
    timestampColumns: ["timestamp", "created_at", "processed_at"],
  },
  worker_container_mappings: {
    columns: [
      "id", "session_id", "change_id", "run_id", "orchestration_id", "container_id",
      "node_id", "container_name", "image_id", "status", "port_mappings",
      "ssh_keys", "active_instance_ids", "flows", "current_flow", "change_context",
      "created_at", "last_heartbeat",
    ],
    required: ["id", "node_id", "container_name", "image_id", "status", "created_at", "last_heartbeat"],
    defaults: { status: "created", port_mappings: JSON_OBJECT, ssh_keys: JSON_ARRAY, active_instance_ids: JSON_ARRAY, flows: JSON_ARRAY },
    jsonColumns: ["port_mappings", "ssh_keys", "active_instance_ids", "flows", "change_context"],
    timestampColumns: ["created_at", "last_heartbeat"],
    statusDomain: "worker_container",
    defaultStatus: "created",
  },
  nodes: {
    columns: [
      "id", "name", "description", "status", "capabilities", "region", "tags",
      "version", "created_at", "updated_at", "last_seen", "config", "metadata",
      "runtime_info", "system_resources", "is_local", "manager_host",
    ],
    required: ["id", "status", "capabilities", "tags", "created_at", "updated_at", "config", "metadata", "runtime_info", "system_resources"],
    defaults: { status: "idle", capabilities: JSON_ARRAY, tags: JSON_ARRAY, config: JSON_OBJECT, metadata: JSON_OBJECT, runtime_info: JSON_OBJECT, system_resources: JSON_OBJECT, is_local: 0 },
    jsonColumns: ["capabilities", "tags", "config", "metadata", "runtime_info", "system_resources"],
    timestampColumns: ["created_at", "updated_at", "last_seen"],
    statusDomain: "node",
    defaultStatus: "idle",
  },
  node_sessions: {
    columns: [
      "id", "node_id", "status", "connected_at", "last_heartbeat",
      "websocket_connection_id", "client_address", "capabilities", "metadata",
      "version", "system_info",
    ],
    required: ["id", "node_id", "status", "connected_at", "last_heartbeat", "capabilities", "metadata", "system_info"],
    defaults: { status: "connected", capabilities: JSON_ARRAY, metadata: JSON_OBJECT, system_info: JSON_OBJECT },
    jsonColumns: ["capabilities", "metadata", "system_info"],
    timestampColumns: ["connected_at", "last_heartbeat"],
    statusDomain: "node_session",
    defaultStatus: "connected",
  },
  orchestrations: {
    columns: ["id", "name", "description", "category", "version", "image_name", "graph", "flows", "worker_definitions", "created_at", "updated_at"],
    required: ["id", "name", "category", "version", "created_at", "updated_at"],
    defaults: { category: "primary", version: "1", graph: JSON_OBJECT, flows: JSON_ARRAY, worker_definitions: JSON_ARRAY },
    jsonColumns: ["graph", "flows", "worker_definitions"],
    timestampColumns: ["created_at", "updated_at"],
  },
  agents: {
    columns: ["id", "name", "description", "data", "created_at", "updated_at"],
    required: ["id", "name", "data", "created_at", "updated_at"],
    defaults: { data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["created_at", "updated_at"],
  },
  prompts: {
    columns: ["id", "name", "data", "created_at", "updated_at"],
    required: ["id", "name", "data", "created_at", "updated_at"],
    defaults: { data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["created_at", "updated_at"],
  },
  skills: {
    columns: ["id", "name", "data", "created_at", "updated_at"],
    required: ["id", "name", "data", "created_at", "updated_at"],
    defaults: { data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["created_at", "updated_at"],
  },
  storages: {
    columns: ["id", "name", "storage_type", "data", "created_at", "updated_at"],
    required: ["id", "name", "storage_type", "data", "created_at", "updated_at"],
    defaults: { storage_type: "local_directory", data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["created_at", "updated_at"],
  },
  storage_node_statuses: {
    columns: ["id", "storage_id", "node_id", "status", "data", "updated_at"],
    required: ["id", "storage_id", "node_id", "status", "data", "updated_at"],
    defaults: { status: "unmounted", data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["updated_at"],
    statusDomain: "storage_node",
    defaultStatus: "unmounted",
  },
  container_volumes: {
    columns: ["id", "storage_id", "container_id", "data", "created_at", "updated_at"],
    required: ["id", "data", "created_at", "updated_at"],
    defaults: { data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["created_at", "updated_at"],
  },
  storage_usage_trackers: {
    columns: ["id", "storage_id", "data", "updated_at"],
    required: ["id", "storage_id", "data", "updated_at"],
    defaults: { data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["updated_at"],
  },
  encrypted_credentials: {
    columns: ["id", "credential_type", "name", "encrypted_payload", "metadata", "created_at", "updated_at"],
    required: ["id", "credential_type", "name", "encrypted_payload", "created_at", "updated_at"],
    jsonColumns: ["metadata"],
    timestampColumns: ["created_at", "updated_at"],
  },
  temporary_keys: {
    columns: ["id", "key_type", "encrypted_payload", "expires_at", "created_at"],
    required: ["id", "key_type", "encrypted_payload", "created_at"],
    timestampColumns: ["expires_at", "created_at"],
  },
  security_policies: {
    columns: ["id", "name", "data", "created_at", "updated_at"],
    required: ["id", "name", "data", "created_at", "updated_at"],
    defaults: { data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["created_at", "updated_at"],
  },
  security_audit_logs: {
    columns: ["id", "event_type", "actor", "target", "data", "created_at"],
    required: ["id", "event_type", "data", "created_at"],
    defaults: { event_type: "unknown", data: JSON_OBJECT },
    jsonColumns: ["data"],
    timestampColumns: ["created_at"],
  },
} as const satisfies Record<string, CompatConfig>;

export type CompatRecordTable = keyof typeof COMPAT_RECORD_TABLES;
export type CompatRecord = Record<string, unknown> & { id: string };

function configFor(table: CompatRecordTable): CompatConfig {
  return COMPAT_RECORD_TABLES[table];
}

function _isJsonColumn(config: CompatConfig, column: string): boolean {
  return Boolean(config.jsonColumns?.includes(column));
}

function _isTimestampColumn(config: CompatConfig, column: string): boolean {
  return Boolean(config.timestampColumns?.includes(column));
}

function _normalizeJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : encodeJson(value);
}

function _decodeJsonValue(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return value;
  try {
    return parseJsonRow<unknown>(value);
  } catch {
    return value;
  }
}

function normalizeRecord(table: CompatRecordTable, input: CompatRecord): Record<string, unknown> {
  const config = configFor(table);
  const now = nowIso();
  const record: Record<string, unknown> = {};

  for (const column of config.columns) {
    let value = input[column];
    if (value === undefined && column === "event_id" && table === "event_records") value = input.id;
    if (value === undefined && (column === "name" || column === "node_id" || column === "container_name" || column === "storage_id")) value = input.id;
    if (value === undefined && _isTimestampColumn(config, column)) value = now;
    if (value === undefined && config.defaults && column in config.defaults) value = config.defaults[column];
    if (column === "status" && config.statusDomain) {
      value = normalizeStatus(config.statusDomain, typeof value === "string" ? value : undefined, config.defaultStatus as never);
    }
    if (_isJsonColumn(config, column)) value = _normalizeJsonValue(value);
    record[column] = value ?? null;
  }

  for (const required of config.required ?? []) {
    if (record[required] === null || record[required] === "") {
      throw new Error(`Missing required ${table}.${required}`);
    }
  }

  return record;
}

function decodeRecord(table: CompatRecordTable, row: Record<string, unknown>): CompatRecord {
  const config = configFor(table);
  const result: Record<string, unknown> = {};
  for (const column of config.columns) {
    const value = row[column];
    result[column] = _isJsonColumn(config, column) ? _decodeJsonValue(value) : value;
  }
  return result as CompatRecord;
}

export function upsertCompatRecord(table: CompatRecordTable, input: CompatRecord): CompatRecord {
  const config = configFor(table);
  const record = normalizeRecord(table, input);
  const columns = [...config.columns];
  const placeholders = columns.map((column) => `@${column}`).join(", ");
  const updateSet = columns
    .filter((column) => column !== "id")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  getDb().prepare(`
    INSERT INTO ${table}(${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updateSet}
  `).run(record);
  const saved = getCompatRecord(table, String(record.id));
  if (!saved) throw new Error(`Failed to save ${table} record: ${record.id}`);
  return saved;
}

export function getCompatRecord(table: CompatRecordTable, id: string): CompatRecord | undefined {
  const row = getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? decodeRecord(table, row) : undefined;
}

export function listCompatRecords(table: CompatRecordTable, limit = 100): CompatRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM ${table} ORDER BY id LIMIT ?`)
    .all(Math.max(1, limit)) as Record<string, unknown>[];
  return rows.map((row) => decodeRecord(table, row));
}

export function deleteCompatRecord(table: CompatRecordTable, id: string): boolean {
  return getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
}
