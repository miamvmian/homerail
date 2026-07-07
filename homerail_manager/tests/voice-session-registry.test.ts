import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  withSessionLock,
  registerTurn,
  completeTurn,
  isTurnActive,
  getTurnStatus,
  _hasSessionLock,
  recoverStaleVoiceSessions,
} from "../src/server/voice-session-registry.js";
import { _clearStoredConfig } from "../src/server/voice-agent-bootstrap.js";
import { _clearStoredVoiceSettings } from "../src/server/voice.js";
import { getDb } from "../src/persistence/db.js";
import { _clearAllSettings } from "../src/persistence/llm-settings.js";
import { _clearNodes } from "../src/node/registry.js";

function setupTmpHome(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-voice-registry-"));
  process.env.HOMERAIL_HOME = tmp;
  return tmp;
}

function seedSession(sessionId: string, status: string): void {
  const db = getDb();
  const timestamp = new Date().toISOString();
  const data = JSON.stringify({
    session_id: sessionId,
    progress_brief: { status, updated_at: timestamp },
    updated_at: timestamp,
  });
  db.prepare(
    "INSERT INTO voice_agent_sessions(session_id, project_id, updated_at, data) VALUES (?, NULL, ?, ?)",
  ).run(sessionId, timestamp, data);
  db.prepare(
    "INSERT INTO sessions(id, session_id, session_type, status, message_count, created_at, updated_at, data) VALUES (?, ?, 'voice_agent', ?, 0, ?, ?, ?)",
  ).run(sessionId, sessionId, status, timestamp, timestamp, data);
}

describe("voice session registry", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = setupTmpHome();
    _clearStoredConfig();
    _clearStoredVoiceSettings();
    _clearAllSettings();
    _clearNodes();
    // initEventLogging subscribes; ensure DB is initialized via getDb
    getDb();
  });

  afterEach(() => {
    _clearStoredConfig();
    _clearStoredVoiceSettings();
    _clearAllSettings();
    _clearNodes();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("serializes turns within the same session", async () => {
    const order: string[] = [];
    const slow = withSessionLock("s1", async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push("slow-done");
    });
    const fast = withSessionLock("s1", async () => {
      order.push("fast-done");
    });
    await Promise.all([slow, fast]);
    // slow started first, so it must complete before fast runs
    expect(order).toEqual(["slow-done", "fast-done"]);
  });

  it("runs turns on different sessions in parallel", async () => {
    let aRunning = false;
    let bRunning = false;
    let overlap = false;
    const a = withSessionLock("sess-a", async () => {
      aRunning = true;
      await new Promise((r) => setTimeout(r, 30));
      if (bRunning) overlap = true;
      aRunning = false;
    });
    const b = withSessionLock("sess-b", async () => {
      bRunning = true;
      await new Promise((r) => setTimeout(r, 30));
      if (aRunning) overlap = true;
      bRunning = false;
    });
    await Promise.all([a, b]);
    expect(overlap).toBe(true);
  });

  it("cleans up the lock map entry after the last turn completes", async () => {
    await withSessionLock("cleanup-test", async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    // 锁条目应在最后一个 turn 完成后被清理，避免 Map 无限增长。
    expect(_hasSessionLock("cleanup-test")).toBe(false);
  });

  it("tracks active turns via register/complete", () => {
    expect(isTurnActive("s2")).toBe(false);
    registerTurn("s2", "running");
    expect(isTurnActive("s2")).toBe(true);
    expect(getTurnStatus("s2")).toBe("running");
    completeTurn("s2", "done");
    expect(isTurnActive("s2")).toBe(false);
    expect(getTurnStatus("s2")).toBeNull();
  });

  it("resets stale running sessions on recovery", () => {
    seedSession("stale-running", "running");
    seedSession("stale-submitted", "submitted");
    seedSession("healthy-idle", "idle");

    const { recovered } = recoverStaleVoiceSessions();
    expect(recovered).toContain("stale-running");
    expect(recovered).toContain("stale-submitted");
    expect(recovered).not.toContain("healthy-idle");

    // Verify DB was updated
    const db = getDb();
    const staleRow = db
      .prepare("SELECT data FROM voice_agent_sessions WHERE session_id = ?")
      .get("stale-running") as { data: string };
    const stale = JSON.parse(staleRow.data);
    expect(stale.progress_brief.status).toBe("interrupted");
    expect(stale.updated_at).toBe(stale.progress_brief.updated_at);

    const staleSessionRow = db
      .prepare("SELECT status, updated_at, data FROM sessions WHERE session_id = ? AND session_type = 'voice_agent'")
      .get("stale-running") as { status: string; updated_at: string; data: string };
    const staleSession = JSON.parse(staleSessionRow.data);
    expect(staleSessionRow.status).toBe("interrupted");
    expect(staleSessionRow.updated_at).toBe(stale.updated_at);
    expect(staleSession.progress_brief.status).toBe("interrupted");
    expect(staleSession.updated_at).toBe(stale.updated_at);

    const healthyRow = db
      .prepare("SELECT data FROM voice_agent_sessions WHERE session_id = ?")
      .get("healthy-idle") as { data: string };
    const healthy = JSON.parse(healthyRow.data);
    expect(healthy.progress_brief.status).toBe("idle");
  });

  it("does not reset sessions with live turns during recovery", () => {
    seedSession("live-running", "running");
    registerTurn("live-running", "running");
    const { recovered } = recoverStaleVoiceSessions();
    expect(recovered).not.toContain("live-running");
    completeTurn("live-running", "done");
  });
});
