/**
 * Tests for session store and resume.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveSession, loadSession, type SessionState } from "../session/session-store.js";
import { resumeSession } from "../session/resume.js";

function makeState(overrides?: Partial<SessionState>): SessionState {
  return {
    sessionId: "node-session-test",
    runId: "run-test",
    nodeId: "coder",
    messages: [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "ok",
        tool_calls: [{ id: "tc-1", type: "function", function: { name: "echo", arguments: "{}" } }],
      },
    ],
    toolCallState: { inFlight: false },
    agentConfig: {
      model: "test",
      provider: "fixture",
      workspace: "/tmp/workspace",
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("session store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "homerail-session-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("saves and loads session roundtrip", () => {
    const state = makeState();
    saveSession(state, dir);
    const loaded = loadSession("node-session-test", dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe("run-test");
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.toolCallState.inFlight).toBe(false);
  });

  it("returns null for missing session", () => {
    expect(loadSession("nonexistent", dir)).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    const sessionDir = join(dir, "bad");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), "not json");
    expect(loadSession("bad", dir)).toBeNull();
  });

  it("returns null for invalid shape", () => {
    const sessionDir = join(dir, "bad-shape");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({ not: "valid" }));
    expect(loadSession("bad-shape", dir)).toBeNull();
  });

  it("defaults to HOMERAIL_HOME/manager/session-store when baseDir is omitted", () => {
    const previous = process.env.HOMERAIL_HOME;
    process.env.HOMERAIL_HOME = dir;
    try {
      const state = makeState({ sessionId: "node-session-home", runId: "run-home" });
      saveSession(state);

      expect(existsSync(join(dir, "manager", "session-store", "node-session-home", "session.json"))).toBe(true);
      const loaded = loadSession("node-session-home");
      expect(loaded?.runId).toBe("run-home");
    } finally {
      if (previous === undefined) {
        delete process.env.HOMERAIL_HOME;
      } else {
        process.env.HOMERAIL_HOME = previous;
      }
    }
  });
});

describe("session resume", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "homerail-resume-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resumes a clean session", () => {
    const state = makeState();
    saveSession(state, dir);
    const result = resumeSession("node-session-test", dir);
    expect(result).not.toBeNull();
    expect(result!.wasInterrupted).toBe(false);
    expect(result!.messages).toHaveLength(2);
    expect(result!.context.model).toBe("test");
  });

  it("detects interrupted session (in-flight tool call)", () => {
    const state = makeState({
      toolCallState: { inFlight: true, pendingToolCallId: "tc-1" },
    });
    saveSession(state, dir);
    const result = resumeSession("node-session-test", dir);
    expect(result).not.toBeNull();
    expect(result!.wasInterrupted).toBe(true);
    // Strips in-flight tool messages
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0].role).toBe("user");
  });

  it("returns null for missing session", () => {
    expect(resumeSession("nonexistent", dir)).toBeNull();
  });
});
