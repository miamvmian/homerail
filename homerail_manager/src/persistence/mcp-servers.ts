/**
 * - SQLite-backed MCP Server persistence (CRUD).
 *
 * Source Issue: #950
 *
 * Provides CRUD for MCPServerRecord rows stored in Manager SQLite.
 * Environment variable values are encrypted before storage and exposed through
 * masked public views.
 */

import * as crypto from "node:crypto";
import { clearTables, encodeJson, getDb, parseJsonRow } from "./db.js";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  type EncryptedSecret,
} from "./secret-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MCPServerType = "STDIO" | "SSE";

export interface MCPServerRecord {
  id: string;
  name: string;
  description: string;
  type: MCPServerType;
  url: string | null;
  command: string | null;
  arguments: string[] | null;
  environment_variables: Record<string, string> | null;
  enabled: boolean;
  build_in: boolean;
  create_time: number;
  runtime_status: string;
  runtime_message: string;
}

interface StoredMCPServerRecord extends Omit<MCPServerRecord, "environment_variables"> {
  environment_variables_encrypted?: Record<string, EncryptedSecret> | null;
  environment_variables?: Record<string, string> | null;
  secret_storage?: "manager_encrypted" | "legacy_plaintext";
}

export type MCPServerPublic = Omit<MCPServerRecord, "environment_variables"> & {
  environment_variables: Record<string, string> | null;
};

export interface CreateMCPServerInput {
  name: string;
  description?: string;
  type: MCPServerType;
  url?: string;
  command?: string;
  arguments?: string;
  environment_variables?: string;
  enabled?: boolean;
}

export interface UpdateMCPServerInput {
  id: string;
  name?: string;
  description?: string;
  type?: MCPServerType;
  url?: string;
  command?: string;
  arguments?: string;
  environment_variables?: string;
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _stringRecord(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      out[key] = raw;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function _decryptEnvVars(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isEncryptedSecret(raw)) {
      out[key] = decryptSecret(raw);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function _normalizeStoredRecord(raw: unknown): { record?: MCPServerRecord; legacyPlaintext: boolean } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { legacyPlaintext: false };
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string") return { legacyPlaintext: false };
  if (typeof rec.name !== "string") return { legacyPlaintext: false };
  const type = typeof rec.type === "string" && rec.type.toUpperCase() === "SSE" ? "SSE" : "STDIO";

  let legacyPlaintext = false;
  let environmentVariables = _decryptEnvVars(rec.environment_variables_encrypted);
  if (!environmentVariables) {
    environmentVariables = _stringRecord(rec.environment_variables);
    legacyPlaintext = environmentVariables !== null;
  }

  return {
    legacyPlaintext,
    record: {
      id: rec.id,
      name: rec.name,
      description: typeof rec.description === "string" ? rec.description : "",
      type,
      url: typeof rec.url === "string" ? rec.url : null,
      command: typeof rec.command === "string" ? rec.command : null,
      arguments: Array.isArray(rec.arguments) ? rec.arguments.map(String) : null,
      environment_variables: environmentVariables,
      enabled: typeof rec.enabled === "boolean" ? rec.enabled : true,
      build_in: typeof rec.build_in === "boolean" ? rec.build_in : false,
      create_time: typeof rec.create_time === "number" ? rec.create_time : Date.now(),
      runtime_status: typeof rec.runtime_status === "string" ? rec.runtime_status : "configured",
      runtime_message: typeof rec.runtime_message === "string"
        ? rec.runtime_message
        : "Configured in TS Manager; worker runtime load not yet verified",
    },
  };
}

function _readAll(): MCPServerRecord[] {
  const rows = getDb()
    .prepare("SELECT data FROM mcp_servers ORDER BY updated_at DESC, id")
    .all() as Array<{ data: string }>;
  let legacyPlaintext = false;
  const records = rows
    .map((row) => {
      try {
        const normalized = _normalizeStoredRecord(parseJsonRow<unknown>(row.data));
        legacyPlaintext = legacyPlaintext || normalized.legacyPlaintext;
        return normalized.record;
      } catch {
        return undefined;
      }
    })
    .filter((record): record is MCPServerRecord => record !== undefined);
  if (legacyPlaintext) {
    _writeAll(records);
  }
  return records;
}

function _writeAll(records: MCPServerRecord[]): void {
  const stored: StoredMCPServerRecord[] = records.map(({ environment_variables, ...record }) => ({
    ...record,
    environment_variables_encrypted: environment_variables
      ? Object.fromEntries(
          Object.entries(environment_variables).map(([key, value]) => [key, encryptSecret(value)]),
        )
      : null,
    secret_storage: environment_variables ? "manager_encrypted" : undefined,
  }));
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM mcp_servers").run();
    const stmt = db.prepare("INSERT INTO mcp_servers(id, updated_at, data) VALUES (?, ?, ?)");
    const now = new Date().toISOString();
    for (const record of stored) {
      stmt.run(record.id, now, encodeJson(record));
    }
  })();
}

function _generateId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function _parseArguments(raw: string | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // treat as single argument
  }
  return raw.split(/\s+/).filter(Boolean);
}

function _parseEnvVars(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listServers(): MCPServerRecord[] {
  return _readAll();
}

export function getServer(id: string): MCPServerRecord | undefined {
  return _readAll().find((r) => r.id === id);
}

function _maskEnvValue(key: string, value: string): string {
  if (!/(api[_-]?key|token|secret|password|credential|auth)/i.test(key)) return value;
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function toPublicServer(record: MCPServerRecord): MCPServerPublic {
  return {
    ...record,
    environment_variables: record.environment_variables
      ? Object.fromEntries(
          Object.entries(record.environment_variables).map(([key, value]) => [key, _maskEnvValue(key, value)]),
        )
      : null,
  };
}

export function createServer(input: CreateMCPServerInput): MCPServerRecord {
  if (!input.name?.trim()) throw new Error("Missing required field: name");

  const serverType = input.type?.trim().toUpperCase();
  if (serverType !== "STDIO" && serverType !== "SSE") {
    throw new Error(`Invalid type: ${input.type}. Must be STDIO or SSE`);
  }

  if (serverType === "STDIO" && !input.command?.trim()) {
    throw new Error("STDIO servers require a command");
  }

  if (serverType === "SSE") {
    const url = input.url?.trim() || "";
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error("SSE servers require a url starting with http:// or https://");
    }
  }

  const now = Date.now();
  const record: MCPServerRecord = {
    id: _generateId(),
    name: input.name.trim(),
    description: input.description?.trim() || "",
    type: serverType as MCPServerType,
    url: input.url?.trim() || null,
    command: input.command?.trim() || null,
    arguments: _parseArguments(input.arguments),
    environment_variables: _parseEnvVars(input.environment_variables),
    enabled: input.enabled !== false,
    build_in: false,
    create_time: now,
    runtime_status: "configured",
    runtime_message: "Configured in TS Manager; worker runtime load not yet verified",
  };

  const records = _readAll();
  records.push(record);
  _writeAll(records);
  return record;
}

export function updateServer(input: UpdateMCPServerInput): MCPServerRecord {
  if (!input.id?.trim()) throw new Error("Missing required field: id");

  const records = _readAll();
  const idx = records.findIndex((r) => r.id === input.id);
  if (idx === -1) throw new Error(`MCP server not found: ${input.id}`);

  const existing = records[idx];

  // Validate type if provided
  if (input.type !== undefined) {
    const serverType = input.type.trim().toUpperCase();
    if (serverType !== "STDIO" && serverType !== "SSE") {
      throw new Error(`Invalid type: ${input.type}. Must be STDIO or SSE`);
    }
  }

  const effectiveType = (input.type?.trim().toUpperCase() || existing.type) as MCPServerType;

  if (effectiveType === "STDIO") {
    const cmd = input.command !== undefined ? input.command : existing.command;
    if (!cmd?.trim()) {
      throw new Error("STDIO servers require a command");
    }
  }

  if (effectiveType === "SSE") {
    const url = input.url !== undefined ? input.url : existing.url;
    const urlStr = url?.trim() || "";
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      throw new Error("SSE servers require a url starting with http:// or https://");
    }
  }

  const newEnabled = input.enabled !== undefined ? input.enabled : existing.enabled;
  const enabledChanged = input.enabled !== undefined && input.enabled !== existing.enabled;

  let runtimeStatus = existing.runtime_status;
  let runtimeMessage = existing.runtime_message;

  // Update runtime status when enabled state changes
  if (enabledChanged) {
    if (newEnabled) {
      runtimeStatus = "enabled";
      runtimeMessage = "Server enabled; awaiting worker runtime probe";
    } else {
      runtimeStatus = "configured";
      runtimeMessage = "Configured in TS Manager; worker runtime load not yet verified";
    }
  }

  records[idx] = {
    ...existing,
    name: input.name !== undefined ? input.name.trim() : existing.name,
    description: input.description !== undefined ? input.description.trim() : existing.description,
    type: effectiveType,
    url: input.url !== undefined ? (input.url.trim() || null) : existing.url,
    command: input.command !== undefined ? (input.command.trim() || null) : existing.command,
    arguments: input.arguments !== undefined ? _parseArguments(input.arguments) : existing.arguments,
    environment_variables: input.environment_variables !== undefined
      ? _parseEnvVars(input.environment_variables)
      : existing.environment_variables,
    enabled: newEnabled,
    runtime_status: runtimeStatus,
    runtime_message: runtimeMessage,
  };

  _writeAll(records);
  return records[idx];
}

export function deleteServer(id: string): boolean {
  const records = _readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  records.splice(idx, 1);
  _writeAll(records);
  return true;
}

export function _clearAllServers(): void {
  clearTables(["mcp_servers"]);
}

// ---------------------------------------------------------------------------
// - Runtime status computation
// Source Issue: #955
// ---------------------------------------------------------------------------

export type MCPRuntimeStatus =
  | "configured"
  | "enabled"
  | "runtime_available"
  | "unavailable_with_reason";

/**
 * Compute the runtime status for an MCP server record.
 *
 * - !enabled → "configured"
 * - enabled, no worker ever confirmed → "unavailable_with_reason"
 * - enabled, previously confirmed → "runtime_available"
 * - enabled, newly enabled (transitional) → "enabled"
 */
export function computeMCPRuntimeStatus(record: MCPServerRecord): {
  status: MCPRuntimeStatus;
  message: string;
} {
  if (!record.enabled) {
    return {
      status: "configured",
      message: "Configured in TS Manager; worker runtime load not yet verified",
    };
  }

  // If runtime_status was previously set to runtime_available, preserve it
  if (record.runtime_status === "runtime_available") {
    return {
      status: "runtime_available",
      message: record.runtime_message || "MCP server tools loaded by worker runtime",
    };
  }

  // Enabled but no worker has confirmed loading.
  // The "enabled" transitional state is treated the same as "configured"
  // because computeMCPRuntimeStatus is only called during a refresh/probe,
  // at which point the transitional "enabled" state should resolve to
  // "unavailable_with_reason" when no worker is connected.
  if (
    record.runtime_status === "configured" ||
    !record.runtime_status ||
    record.runtime_status === "enabled"
  ) {
    return {
      status: "unavailable_with_reason",
      message: "Worker MCP tool-load probe is not implemented in TS Manager yet; server is enabled but runtime availability is unverified",
    };
  }

  // Preserve unavailable_with_reason if already set
  if (record.runtime_status === "unavailable_with_reason") {
    return {
      status: "unavailable_with_reason",
      message: record.runtime_message || "MCP server unavailable",
    };
  }

  // Fallback
  return {
    status: "enabled",
    message: "Server enabled; runtime status unknown",
  };
}

/**
 * Attempt to refresh runtime status for a given MCP server.
 * In the current TS Manager (no connected worker by default),
 * this will transition "configured" → "unavailable_with_reason" for enabled servers,
 * or confirm "runtime_available" if already confirmed.
 *
 * Returns the updated record.
 */
export function refreshMCPRuntimeStatus(id: string): MCPServerRecord | undefined {
  const records = _readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;

  const record = records[idx];
  const computed = computeMCPRuntimeStatus(record);

  records[idx] = {
    ...record,
    runtime_status: computed.status,
    runtime_message: computed.message,
  };

  _writeAll(records);
  return records[idx];
}

/**
 * Update runtime status when enabled state changes.
 * When enabling: set to "enabled" (transitional).
 * When disabling: set to "configured".
 */
export function updateRuntimeStatusForToggle(
  id: string,
  enabled: boolean,
): MCPServerRecord | undefined {
  const records = _readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;

  const record = records[idx];
  if (enabled) {
    records[idx] = {
      ...record,
      enabled: true,
      runtime_status: "enabled",
      runtime_message: "Server enabled; awaiting worker runtime probe",
    };
  } else {
    records[idx] = {
      ...record,
      enabled: false,
      runtime_status: "configured",
      runtime_message: "Configured in TS Manager; worker runtime load not yet verified",
    };
  }

  _writeAll(records);
  return records[idx];
}
