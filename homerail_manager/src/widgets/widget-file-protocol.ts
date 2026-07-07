import * as fs from "node:fs";
import * as path from "node:path";
import { getDataRoot } from "../config/env.js";
import {
  MANAGER_AGENT_WIDGET_FILE_TYPES,
  type ManagerAgentWidgetFileType,
} from "homerail-protocol";

export type WidgetFileType = ManagerAgentWidgetFileType;

export interface WidgetValidationError {
  path: string;
  message: string;
}

export interface WidgetValidationOk {
  ok: true;
  widget_type: WidgetFileType;
  widget: Record<string, unknown>;
  toml: Record<string, unknown>;
}

export interface WidgetValidationFailure {
  ok: false;
  widget_type?: WidgetFileType;
  errors: WidgetValidationError[];
}

export type WidgetValidationResult = WidgetValidationOk | WidgetValidationFailure;

export interface WidgetFileWriteOk extends WidgetValidationOk {
  file: string;
}

export interface WidgetFileWriteFailure extends WidgetValidationFailure {
  file: string;
}

export type WidgetFileWriteResult = WidgetFileWriteOk | WidgetFileWriteFailure;

export interface VoiceMemoWidgetInput {
  title: string;
  status: "listening" | "clarifying" | "ready" | "executing" | "done";
  summary: string;
  known_facts: string[];
  open_questions: string[];
  todos: Array<{ text: string; done: boolean }>;
  next_action: string;
  ready_to_execute: boolean;
}

const WIDGET_TYPES: WidgetFileType[] = [...MANAGER_AGENT_WIDGET_FILE_TYPES];

const MEMO_STATUSES = new Set(["listening", "clarifying", "ready", "executing", "done"]);
const CHECKLIST_STATUSES = new Set(["todo", "doing", "blocked", "done"]);
const PROGRESS_STATUSES = new Set(["idle", "running", "blocked", "done", "failed"]);

function safeSlug(value: unknown, fallback: string): string {
  const text = String(value || "").trim().toLowerCase();
  const slug = text.replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || fallback;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function normalizeLine(raw: string): string {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (char === "#" && !inString) return raw.slice(0, i).trim();
  }
  return raw.trim();
}

function splitKeyValue(line: string): [string, string] {
  const index = line.indexOf("=");
  if (index < 0) throw new Error(`expected key/value assignment: ${line}`);
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}

function splitArrayItems(raw: string): string[] {
  const items: string[] = [];
  let current = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "\"") {
      current += char;
      inString = !inString;
      continue;
    }
    if (char === "," && !inString) {
      const item = current.trim();
      if (item) items.push(item);
      current = "";
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail) items.push(tail);
  return items;
}

function parseTomlValue(raw: string): unknown {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return splitArrayItems(inner).map(parseTomlValue);
  }
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return JSON.parse(value) as string;
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  throw new Error(`unsupported TOML value: ${value}`);
}

export function parseWidgetToml(content: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let current: Record<string, unknown> = root;
  let pendingArray:
    | { target: Record<string, unknown>; key: string; lines: string[] }
    | null = null;

  for (const raw of content.split(/\r?\n/)) {
    const line = normalizeLine(raw);
    if (!line) continue;

    if (pendingArray) {
      const endIndex = line.indexOf("]");
      const chunk = endIndex >= 0 ? line.slice(0, endIndex) : line;
      if (chunk.trim()) pendingArray.lines.push(chunk.trim());
      if (endIndex >= 0) {
        pendingArray.target[pendingArray.key] = parseTomlValue(`[${pendingArray.lines.join("\n")}]`);
        pendingArray = null;
      }
      continue;
    }

    if (line.startsWith("[[") && line.endsWith("]]")) {
      const tableName = line.slice(2, -2).trim();
      if (!tableName) throw new Error("array table name is empty");
      const existing = root[tableName];
      if (existing !== undefined && !Array.isArray(existing)) {
        throw new Error(`cannot append table to scalar field: ${tableName}`);
      }
      const next: Record<string, unknown> = {};
      const tables = Array.isArray(existing) ? existing as Record<string, unknown>[] : [];
      tables.push(next);
      root[tableName] = tables;
      current = next;
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      const tableName = line.slice(1, -1).trim();
      if (!tableName) throw new Error("table name is empty");
      const next: Record<string, unknown> = {};
      root[tableName] = next;
      current = next;
      continue;
    }

    const [key, value] = splitKeyValue(line);
    if (!key) throw new Error(`key is empty: ${line}`);
    if (value === "[") {
      pendingArray = { target: current, key, lines: [] };
      continue;
    }
    current[key] = parseTomlValue(value);
  }

  if (pendingArray) throw new Error(`unterminated array for ${pendingArray.key}`);
  return root;
}

function addError(errors: WidgetValidationError[], fieldPath: string, message: string): void {
  errors.push({ path: fieldPath, message });
}

function stringField(
  data: Record<string, unknown>,
  field: string,
  errors: WidgetValidationError[],
  required = true,
): string {
  const value = data[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required) addError(errors, field, "must be a non-empty string");
  return "";
}

function boolField(data: Record<string, unknown>, field: string, errors: WidgetValidationError[], fallback = false): boolean {
  const value = data[field];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  addError(errors, field, "must be a boolean");
  return fallback;
}

function numberField(data: Record<string, unknown>, field: string, errors: WidgetValidationError[], fallback = 1): number {
  const value = data[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  addError(errors, field, "must be a number");
  return fallback;
}

function stringArrayField(data: Record<string, unknown>, field: string, errors: WidgetValidationError[], maxItems: number): string[] {
  const value = data[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    addError(errors, field, "must be an array");
    return [];
  }
  const items: string[] = [];
  value.slice(0, maxItems).forEach((item, index) => {
    if (typeof item === "string" && item.trim()) items.push(item.trim());
    else addError(errors, `${field}[${index}]`, "must be a non-empty string");
  });
  return items;
}

function tableArray(data: Record<string, unknown>, field: string, errors: WidgetValidationError[], required = false): Record<string, unknown>[] {
  const value = data[field];
  if (value === undefined) {
    if (required) addError(errors, field, "must include at least one table");
    return [];
  }
  if (!Array.isArray(value)) {
    addError(errors, field, "must be an array of tables");
    return [];
  }
  const tables = value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (required && !tables.length) addError(errors, field, "must include at least one table");
  if (tables.length !== value.length) addError(errors, field, "must only contain tables");
  return tables;
}

function inferWidgetType(data: Record<string, unknown>, requested?: WidgetFileType): WidgetFileType | undefined {
  if (requested) return requested;
  const raw = data.widget_type;
  return typeof raw === "string" && WIDGET_TYPES.includes(raw as WidgetFileType)
    ? raw as WidgetFileType
    : undefined;
}

function validateBase(
  data: Record<string, unknown>,
  requestedType?: WidgetFileType,
): { errors: WidgetValidationError[]; widgetType?: WidgetFileType; id: string; title: string } {
  const errors: WidgetValidationError[] = [];
  const schemaVersion = numberField(data, "schema_version", errors);
  if (schemaVersion < 1) addError(errors, "schema_version", "must be >= 1");
  const widgetType = inferWidgetType(data, requestedType);
  if (!widgetType) addError(errors, "widget_type", `must be one of ${WIDGET_TYPES.join(", ")}`);
  if (requestedType && data.widget_type !== requestedType) {
    addError(errors, "widget_type", `must equal ${requestedType}`);
  }
  return {
    errors,
    widgetType,
    id: stringField(data, "widget_id", errors),
    title: stringField(data, "title", errors),
  };
}

function shortItem(prefix: string, value: string, max = 42): string {
  const compact = value.replace(/\s+/g, " ").trim();
  const text = compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
  return `${prefix} ${text}`;
}

function memoWidget(data: Record<string, unknown>, id: string, title: string, errors: WidgetValidationError[], filePath?: string): Record<string, unknown> {
  const rawStatus = stringField(data, "status", errors);
  const status = MEMO_STATUSES.has(rawStatus) ? rawStatus : "listening";
  if (rawStatus && !MEMO_STATUSES.has(rawStatus)) addError(errors, "status", "must be listening, clarifying, ready, executing, or done");
  const summary = stringField(data, "summary", errors);
  const nextAction = stringField(data, "next_action", errors, false);
  const ready = boolField(data, "ready_to_execute", errors);
  const knownFacts = stringArrayField(data, "known_facts", errors, 8);
  const openQuestions = stringArrayField(data, "open_questions", errors, 8);
  const todos = tableArray(data, "todo", errors).slice(0, 10).map((item, index) => {
    const text = stringField(item, "text", errors, true);
    const done = boolField(item, "done", errors);
    if (!text) addError(errors, `todo[${index}].text`, "must be a non-empty string");
    return { text, done };
  }).filter((item) => item.text);
  const facts = knownFacts.slice(0, 2).map((item) => shortItem("已知", item));
  const questions = openQuestions.slice(0, 3).map((item) => shortItem("待确认", item));
  const openTodos = todos.filter((todo) => !todo.done).slice(0, 2).map((todo) => shortItem("TODO", todo.text));
  const doneTodos = todos.filter((todo) => todo.done).slice(0, 2).map((todo) => shortItem("DONE", todo.text));
  return {
    id,
    type: "note",
    title,
    body: summary || nextAction || "正在记录你的需求。",
    priority: status === "ready" ? "high" : "normal",
    status,
    items: [...facts, ...questions, ...openTodos, ...doneTodos].slice(0, 6),
    data: {
      ui_state: status === "done" ? "minimized" : "visible",
      visual: "memo",
      width: "wide",
      memo_status: status,
      ready_to_execute: ready,
      memo_path: filePath ?? null,
      next_action: nextAction,
    },
  };
}

function checklistWidget(data: Record<string, unknown>, id: string, title: string, errors: WidgetValidationError[], filePath?: string): Record<string, unknown> {
  const summary = stringField(data, "summary", errors, false);
  const rawStatus = stringField(data, "status", errors, false) || "todo";
  const status = CHECKLIST_STATUSES.has(rawStatus) ? rawStatus : "todo";
  if (rawStatus && !CHECKLIST_STATUSES.has(rawStatus)) addError(errors, "status", "must be todo, doing, blocked, or done");
  const items = tableArray(data, "item", errors, true).slice(0, 12).map((item, index) => {
    const text = stringField(item, "text", errors, true);
    const done = boolField(item, "done", errors);
    if (!text) addError(errors, `item[${index}].text`, "must be a non-empty string");
    return { text, done };
  }).filter((item) => item.text);
  return {
    id,
    type: "list",
    title,
    body: summary,
    priority: "normal",
    status,
    items: items.slice(0, 8).map((item) => `${item.done ? "DONE" : "TODO"} ${item.text}`),
    data: {
      visual: "checklist",
      widget_file: filePath ?? null,
      checklist_items: items,
    },
  };
}

function taskDraftWidget(data: Record<string, unknown>, id: string, title: string, errors: WidgetValidationError[], filePath?: string): Record<string, unknown> {
  const request = stringField(data, "request", errors, false);
  const summary = stringField(data, "summary", errors, false);
  if (!request && !summary) addError(errors, "request", "request or summary is required");
  const acceptance = stringArrayField(data, "acceptance", errors, 8);
  const constraints = stringArrayField(data, "constraints", errors, 8);
  return {
    id,
    type: "task_draft",
    title,
    body: summary || request,
    status: stringField(data, "status", errors, false) || "draft",
    items: [...acceptance.map((item) => shortItem("验收", item)), ...constraints.map((item) => shortItem("约束", item))].slice(0, 8),
    data: { visual: "task_draft", widget_file: filePath ?? null, request, acceptance, constraints },
  };
}

function progressWidget(data: Record<string, unknown>, id: string, title: string, errors: WidgetValidationError[], filePath?: string): Record<string, unknown> {
  const rawStatus = stringField(data, "status", errors, false) || "running";
  const status = PROGRESS_STATUSES.has(rawStatus) ? rawStatus : "running";
  if (rawStatus && !PROGRESS_STATUSES.has(rawStatus)) addError(errors, "status", "must be idle, running, blocked, done, or failed");
  const body = stringField(data, "summary", errors, false) || stringField(data, "short_text", errors, false);
  const runId = stringField(data, "run_id", errors, false);
  const blockedReason = stringField(data, "blocked_reason", errors, false);
  const toolResultRef = stringField(data, "tool_result_ref", errors, false);
  if (!runId && !blockedReason && !toolResultRef) {
    addError(errors, "run_id", "run_id, blocked_reason, or tool_result_ref is required");
  }
  const steps = tableArray(data, "step", errors).map((item) => stringField(item, "text", errors)).filter(Boolean);
  return {
    id,
    type: "progress",
    title,
    body,
    status,
    steps,
    active_step: Math.max(0, Number(data.active_step ?? 0)),
    data: { visual: "progress_status", widget_file: filePath ?? null, run_id: runId, blocked_reason: blockedReason, tool_result_ref: toolResultRef },
  };
}

function artifactWidget(data: Record<string, unknown>, id: string, title: string, errors: WidgetValidationError[], filePath?: string): Record<string, unknown> {
  const artifactPath = stringField(data, "artifact_path", errors, false);
  const previewPath = stringField(data, "preview_path", errors, false);
  if (!artifactPath && !previewPath) addError(errors, "artifact_path", "artifact_path or preview_path is required");
  for (const [field, value] of [["artifact_path", artifactPath], ["preview_path", previewPath]] as const) {
    if (value.includes("..")) addError(errors, field, "must not contain path traversal");
  }
  return {
    id,
    type: "artifact",
    title,
    body: stringField(data, "summary", errors, false),
    status: stringField(data, "status", errors, false) || "ready",
    data: { visual: "artifact_ref", widget_file: filePath ?? null, artifact_path: artifactPath, preview_path: previewPath },
  };
}

function timelineWidget(data: Record<string, unknown>, id: string, title: string, errors: WidgetValidationError[], filePath?: string): Record<string, unknown> {
  const events = tableArray(data, "event", errors, true).slice(0, 12).map((item, index) => {
    const text = stringField(item, "text", errors, true);
    if (!text) addError(errors, `event[${index}].text`, "must be a non-empty string");
    return { text, time: stringField(item, "time", errors, false), status: stringField(item, "status", errors, false) };
  }).filter((item) => item.text);
  return {
    id,
    type: "timeline",
    title,
    body: stringField(data, "summary", errors, false),
    items: events.map((event) => [event.time, event.text].filter(Boolean).join(" ")),
    data: { visual: "timeline", widget_file: filePath ?? null, events },
  };
}

function renderWidget(
  type: WidgetFileType,
  data: Record<string, unknown>,
  id: string,
  title: string,
  errors: WidgetValidationError[],
  filePath?: string,
): Record<string, unknown> {
  switch (type) {
    case "memo":
      return memoWidget(data, id, title, errors, filePath);
    case "checklist":
      return checklistWidget(data, id, title, errors, filePath);
    case "task_draft":
      return taskDraftWidget(data, id, title, errors, filePath);
    case "progress_status":
      return progressWidget(data, id, title, errors, filePath);
    case "artifact_ref":
      return artifactWidget(data, id, title, errors, filePath);
    case "timeline":
      return timelineWidget(data, id, title, errors, filePath);
  }
}

export function validateWidgetToml(
  content: string,
  requestedType?: WidgetFileType,
  options: { filePath?: string } = {},
): WidgetValidationResult {
  let data: Record<string, unknown>;
  try {
    data = parseWidgetToml(content);
  } catch (err) {
    return { ok: false, widget_type: requestedType, errors: [{ path: "$", message: err instanceof Error ? err.message : String(err) }] };
  }
  const base = validateBase(data, requestedType);
  if (!base.widgetType) return { ok: false, errors: base.errors };
  const widget = renderWidget(base.widgetType, data, base.id, base.title, base.errors, options.filePath);
  if (base.errors.length) return { ok: false, widget_type: base.widgetType, errors: base.errors };
  return { ok: true, widget_type: base.widgetType, widget, toml: data };
}

export function widgetFilePath(projectId: unknown, sessionId: unknown, widgetId: unknown): string {
  return path.join(
    getDataRoot(),
    "voice-agent-projects",
    safeSlug(projectId, "default"),
    "assets",
    "widgets",
    safeSlug(sessionId, "session"),
    `${safeSlug(widgetId, "widget")}.toml`,
  );
}

export function writeWidgetFile(params: {
  projectId?: unknown;
  sessionId?: unknown;
  widgetId?: unknown;
  widgetType?: WidgetFileType;
  tomlContent: string;
}): WidgetFileWriteResult {
  let data: Record<string, unknown> = {};
  try {
    data = parseWidgetToml(params.tomlContent);
  } catch {
    // The validator below will return the structured parse error. Keep the target path stable.
  }
  const widgetId = params.widgetId || data.widget_id || "widget";
  const file = widgetFilePath(params.projectId, params.sessionId, widgetId);
  const validation = validateWidgetToml(params.tomlContent, params.widgetType, { filePath: file });
  if (!validation.ok) return { ...validation, file };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmpFile = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmpFile, params.tomlContent, "utf8");
  try {
    fs.chmodSync(tmpFile, 0o600);
  } catch {
    // Best effort only; chmod can fail on some mounted volumes.
  }
  fs.renameSync(tmpFile, file);
  return { ...validation, file };
}

export function readWidgetFile(params: {
  projectId?: unknown;
  sessionId?: unknown;
  widgetId: unknown;
  widgetType?: WidgetFileType;
}): WidgetFileWriteResult {
  const file = widgetFilePath(params.projectId, params.sessionId, params.widgetId);
  try {
    const content = fs.readFileSync(file, "utf8");
    const validation = validateWidgetToml(content, params.widgetType, { filePath: file });
    return validation.ok ? { ...validation, file } : { ...validation, file };
  } catch (err) {
    return {
      ok: false,
      widget_type: params.widgetType,
      file,
      errors: [{ path: "$", message: err instanceof Error ? err.message : String(err) }],
    };
  }
}

export function removeWidgetFile(params: { projectId?: unknown; sessionId?: unknown; widgetId: unknown }): { widget_id: string; file: string; removed: boolean } {
  const widgetId = safeSlug(params.widgetId, "widget");
  const file = widgetFilePath(params.projectId, params.sessionId, widgetId);
  const existed = fs.existsSync(file);
  if (existed) fs.rmSync(file, { force: true });
  return { widget_id: widgetId, file, removed: existed };
}

export function listWidgetFileTypes(): WidgetFileType[] {
  return [...WIDGET_TYPES];
}

export function voiceMemoToWidgetToml(memo: VoiceMemoWidgetInput): string {
  const lines = [
    'widget_id = "voice-memo"',
    'widget_type = "memo"',
    "schema_version = 1",
    `title = ${tomlString(memo.title)}`,
    `status = ${tomlString(memo.status)}`,
    `summary = ${tomlString(memo.summary)}`,
    `next_action = ${tomlString(memo.next_action)}`,
    `ready_to_execute = ${memo.ready_to_execute ? "true" : "false"}`,
    "",
    "known_facts = [",
    ...memo.known_facts.map((item) => `  ${tomlString(item)},`),
    "]",
    "",
    "open_questions = [",
    ...memo.open_questions.map((item) => `  ${tomlString(item)},`),
    "]",
  ];
  for (const todo of memo.todos) {
    lines.push("", "[[todo]]", `text = ${tomlString(todo.text)}`, `done = ${todo.done ? "true" : "false"}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function widgetTomlExample(type: WidgetFileType): string {
  switch (type) {
    case "memo":
      return voiceMemoToWidgetToml({
        title: "任务记录",
        status: "clarifying",
        summary: "用户想调查过去 24 小时的 AI 新闻。",
        known_facts: ["时间范围是过去 24 小时"],
        open_questions: ["交付形式是口头摘要还是文档"],
        todos: [
          { text: "确认范围", done: true },
          { text: "确认交付形式", done: false },
        ],
        next_action: "询问交付形式",
        ready_to_execute: false,
      });
    case "checklist":
      return [
        'widget_id = "review-checklist"',
        'widget_type = "checklist"',
        "schema_version = 1",
        'title = "PR 审查清单"',
        'status = "doing"',
        'summary = "用于跟踪当前审查任务的关键步骤。"',
        "",
        "[[item]]",
        'text = "读取 diff"',
        "done = true",
        "",
        "[[item]]",
        'text = "运行测试"',
        "done = false",
        "",
      ].join("\n");
    case "task_draft":
      return [
        'widget_id = "task-draft"',
        'widget_type = "task_draft"',
        "schema_version = 1",
        'title = "任务草稿"',
        'request = "调查最近 24 小时的 AI 新闻"',
        'summary = "先查资料，再给出口头摘要。"',
        'acceptance = ["列出 5 条新闻", "附来源"]',
        "",
      ].join("\n");
    case "progress_status":
      return [
        'widget_id = "manager-progress"',
        'widget_type = "progress_status"',
        "schema_version = 1",
        'title = "执行进度"',
        'status = "running"',
        'run_id = "run-local-001"',
        'summary = "正在汇总节点结果。"',
        "",
        "[[step]]",
        'text = "启动 DAG"',
        "",
      ].join("\n");
    case "artifact_ref":
      return [
        'widget_id = "report-artifact"',
        'widget_type = "artifact_ref"',
        "schema_version = 1",
        'title = "报告预览"',
        'artifact_path = "artifacts/report.md"',
        'summary = "已生成 Markdown 报告。"',
        "",
      ].join("\n");
    case "timeline":
      return [
        'widget_id = "run-timeline"',
        'widget_type = "timeline"',
        "schema_version = 1",
        'title = "运行事件"',
        'summary = "最近事件"',
        "",
        "[[event]]",
        'time = "10:30"',
        'text = "节点开始执行"',
        'status = "running"',
        "",
      ].join("\n");
  }
}
