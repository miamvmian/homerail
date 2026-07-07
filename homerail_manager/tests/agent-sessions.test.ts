import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseDAGYaml } from "../src/orchestration/yaml-loader.js";
import {
  _clearAllSessions,
  appendMessage,
  createSession,
  loadMessages,
  loadSession,
} from "../src/persistence/agent-sessions.js";
import { getDb } from "../src/persistence/db.js";
import { _clearAllPersistence } from "../src/persistence/store.js";
import { _clearActiveRuns, createActiveRun, getActiveRunCount } from "../src/runtime/active-runs.js";
import { createServer } from "../src/server/http.js";

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr !== "object") throw new Error("server did not bind");
  return addr.port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function createTestRun(runId: string): void {
  const dag = parseDAGYaml(`
name: agent-session-test
workflow_id: agent-session-test
agents:
  recorder:
    agent_type: deterministic
    system: HANDOFF port=done content=ok
nodes:
  record:
    agent: recorder
    after: []
    outputs:
      done:
        to: ""
`);
  createActiveRun(runId, dag);
}

describe("/api/agent/sessions/:session_id/turns", () => {
  let server: http.Server;
  let tmpHome: string;
  let oldHome: string | undefined;

  beforeEach(() => {
    oldHome = process.env.HOMERAIL_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-agent-sessions-"));
    process.env.HOMERAIL_HOME = tmpHome;
    _clearActiveRuns();
    _clearAllSessions();
    _clearAllPersistence();
    server = createServer(0, undefined, undefined, false);
  });

  afterEach(async () => {
    _clearActiveRuns();
    _clearAllSessions();
    _clearAllPersistence();
    await close(server);
    if (oldHome === undefined) {
      delete process.env.HOMERAIL_HOME;
    } else {
      process.env.HOMERAIL_HOME = oldHome;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("writes Manager chat sessions only to unified session tables", () => {
    createSession("session-single-write", {}, "project-single-write");
    appendMessage("session-single-write", "user", "hello");

    const db = getDb();
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

    expect(count("SELECT COUNT(*) AS n FROM sessions WHERE session_id = 'session-single-write' AND session_type = 'manager_chat'")).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM session_messages WHERE session_id = 'session-single-write'")).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM agent_sessions WHERE session_id = 'session-single-write'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM agent_messages WHERE session_id = 'session-single-write'")).toBe(0);
  });

  it("keeps legacy Manager chat tables readable through lazy migration", () => {
    const now = new Date().toISOString();
    const db = getDb();
    db.prepare(`
      INSERT INTO agent_sessions(session_id, project_id, updated_at, data)
      VALUES (?, ?, ?, ?)
    `).run("legacy-session", "legacy-project", now, JSON.stringify({
      session_id: "legacy-session",
      created_at: now,
      updated_at: now,
      status: "active",
      project_id: "legacy-project",
      metadata: {},
    }));
    db.prepare(`
      INSERT INTO agent_messages(session_id, message_id, role, timestamp, data)
      VALUES (?, ?, ?, ?, ?)
    `).run("legacy-session", "legacy-message", "user", now, JSON.stringify({
      id: "legacy-message",
      role: "user",
      content: "legacy hello",
      timestamp: now,
    }));

    expect(loadSession("legacy-session")).toMatchObject({
      session_id: "legacy-session",
      project_id: "legacy-project",
    });
    expect(loadMessages("legacy-session")).toEqual([
      expect.objectContaining({ id: "legacy-message", role: "user", content: "legacy hello" }),
    ]);

    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    expect(count("SELECT COUNT(*) AS n FROM sessions WHERE session_id = 'legacy-session' AND session_type = 'manager_chat'")).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM session_messages WHERE session_id = 'legacy-session'")).toBe(1);
  });

  it("records a no-run Manager text turn without creating a synthetic run", async () => {
    const port = await listen(server);
    await fetch(`http://127.0.0.1:${port}/api/agent/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "session-a" }),
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/agent/sessions/session-a/turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    const body = await response.json() as {
      success: boolean;
      data: { run_id: string; assistant_message: { content: string } };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.run_id).toBe("");
    expect(body.data.assistant_message.content).toContain("Manager 会话历史");
    expect(getActiveRunCount()).toBe(0);

    const messages = loadMessages("session-a");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", content: "hello" });
    expect(messages[0].run_id).toBeUndefined();
  });

  it("records a turn for an existing run without creating a synthetic run", async () => {
    const port = await listen(server);
    createTestRun("existing-run");
    expect(getActiveRunCount()).toBe(1);

    await fetch(`http://127.0.0.1:${port}/api/agent/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "session-b" }),
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/agent/sessions/session-b/turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "summarize run",
        assistant_message: "summary recorded",
        run_id: "existing-run",
      }),
    });
    const body = await response.json() as {
      success: boolean;
      data: { run_id: string; assistant_message: { content: string } };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.run_id).toBe("existing-run");
    expect(body.data.assistant_message.content).toBe("summary recorded");
    expect(getActiveRunCount()).toBe(1);

    const messages = loadMessages("session-b");
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.run_id === "existing-run")).toBe(true);
  });
});
