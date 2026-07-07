import * as http from "node:http";
import { encodeJson, getDb, parseJsonRow } from "../persistence/db.js";

interface BaseResponse {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

interface MemoryRecord {
  id: number;
  content: string;
  kind: string;
  weight: number;
  access_count: number;
  created_at: string;
  last_accessed: string;
  topics: string[];
  user_id: string;
}

function json(res: http.ServerResponse, status: number, body: BaseResponse): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function ok(res: http.ServerResponse, message: string, data?: unknown): void {
  json(res, 200, { success: true, message, data });
}

function created(res: http.ServerResponse, message: string, data?: unknown): void {
  json(res, 201, { success: true, message, data });
}

function badRequest(res: http.ServerResponse, message: string): void {
  json(res, 400, { success: false, message, error: message });
}

function notFound(res: http.ServerResponse, message: string): void {
  json(res, 404, { success: false, message, error: message });
}

function readAll(): MemoryRecord[] {
  return (getDb()
    .prepare("SELECT data FROM memories ORDER BY id")
    .all() as Array<{ data: string }>)
    .map((row) => parseJsonRow<MemoryRecord>(row.data));
}

function writeAll(records: MemoryRecord[]): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM memories").run();
    const stmt = db.prepare("INSERT INTO memories(id, user_id, kind, last_accessed, data) VALUES (?, ?, ?, ?, ?)");
    for (const record of records) {
      stmt.run(record.id, record.user_id, record.kind, record.last_accessed, encodeJson(record));
    }
  })();
}

function nextId(records: MemoryRecord[]): number {
  return records.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function parseTopic(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function filterMemories(records: MemoryRecord[], url: URL): MemoryRecord[] {
  const userId = url.searchParams.get("user_id") || "";
  const query = (url.searchParams.get("query") || "").toLowerCase();
  const kind = url.searchParams.get("kind") || "";
  const topic = url.searchParams.get("topic") || "";
  const topKRaw = url.searchParams.get("top_k");
  const topK = topKRaw ? Number.parseInt(topKRaw, 10) : undefined;

  let out = records;
  if (userId) out = out.filter((item) => item.user_id === userId);
  if (query) out = out.filter((item) => item.content.toLowerCase().includes(query));
  if (kind) out = out.filter((item) => item.kind === kind);
  if (topic) out = out.filter((item) => item.topics.includes(topic));
  if (topK !== undefined && Number.isFinite(topK) && topK >= 0) out = out.slice(0, topK);
  return out;
}

export function memoryRoutesHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname.replace(/\/$/, "");

  if (pathname === "/api/memory/memories" && req.method === "GET") {
    const userId = url.searchParams.get("user_id") || "default";
    const memories = filterMemories(readAll(), url);
    ok(res, "Memories retrieved", {
      memories,
      total: memories.length,
      user_id: userId,
    });
    return true;
  }

  if (pathname === "/api/memory/stats" && req.method === "GET") {
    const userId = url.searchParams.get("user_id") || "default";
    const records = userId === "default"
      ? readAll()
      : readAll().filter((item) => item.user_id === userId);
    const byKind: Record<string, number> = {};
    for (const record of records) {
      byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    }
    const avgWeight = records.length
      ? records.reduce((sum, item) => sum + item.weight, 0) / records.length
      : 0;
    ok(res, "Memory stats retrieved", {
      total_memories: records.length,
      by_kind: byKind,
      avg_weight: avgWeight,
      user_id: userId,
    });
    return true;
  }

  if (pathname === "/api/memory/memories" && req.method === "POST") {
    const content = url.searchParams.get("content")?.trim() || "";
    if (!content) {
      badRequest(res, "Missing required field: content");
      return true;
    }
    const records = readAll();
    const now = new Date().toISOString();
    const record: MemoryRecord = {
      id: nextId(records),
      content,
      kind: url.searchParams.get("kind")?.trim() || "note",
      weight: 1,
      access_count: 0,
      created_at: now,
      last_accessed: now,
      topics: parseTopic(url.searchParams.get("topic")),
      user_id: url.searchParams.get("user_id")?.trim() || "default",
    };
    records.push(record);
    writeAll(records);
    created(res, "Memory created", {
      id: record.id,
      content: record.content,
      kind: record.kind,
    });
    return true;
  }

  const deleteMatch = pathname.match(/^\/api\/memory\/(\d+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const id = Number.parseInt(deleteMatch[1], 10);
    const userId = url.searchParams.get("user_id") || "";
    const records = readAll();
    const idx = records.findIndex((item) => item.id === id && (!userId || item.user_id === userId));
    if (idx === -1) {
      notFound(res, `Memory not found: ${id}`);
      return true;
    }
    records.splice(idx, 1);
    writeAll(records);
    ok(res, "Memory deleted", { deleted_id: id });
    return true;
  }

  return false;
}
