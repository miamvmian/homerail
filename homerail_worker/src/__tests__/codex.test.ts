/**
 * Tests for Codex adapter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodexAdapter } from "../agent/codex.js";
import type { AgentEvent, AgentRunContext, DagToolDefinition } from "../agent/types.js";

describe("CodexAdapter", () => {
  const ctx: AgentRunContext = {
    model: "codex-model",
    apiKey: "test-key",
    baseUrl: "https://codex.example.com/v1",
    maxIterations: 3,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits text and done on simple response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "hello from codex" } }],
          }),
      }),
    );

    const client = new CodexAdapter();
    const events: AgentEvent[] = [];
    for await (const e of client.run("hi", [], ctx)) {
      events.push(e);
    }

    expect(events).toEqual([
      { type: "text", text: "hello from codex" },
      { type: "done" },
    ]);
  });

  it("normalizes Codex function_call to tool_use/tool_result", async () => {
    const toolDef: DagToolDefinition = {
      name: "echo",
      description: "echo tool",
      input_schema: { type: "object", properties: { msg: { type: "string" } } },
      handler: async (args) => ({
        content: [{ type: "text" as const, text: `echo: ${args.msg}` }],
      }),
    };

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content: "calling echo",
                      function_call: { name: "echo", arguments: '{"msg":"hi"}' },
                    },
                  },
                ],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: "all done" } }],
            }),
        });
      }),
    );

    const client = new CodexAdapter();
    const events: AgentEvent[] = [];
    for await (const e of client.run("test", [toolDef], ctx)) {
      events.push(e);
    }

    expect(events.map((e) => e.type)).toEqual([
      "text",
      "tool_use",
      "tool_result",
      "text",
      "done",
    ]);
  });

  it("handles API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve("service unavailable"),
      }),
    );

    const client = new CodexAdapter();
    const events: AgentEvent[] = [];
    for await (const e of client.run("hi", [], { ...ctx, maxIterations: 1 })) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
  });

  it("handles unparseable tool arguments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  function_call: { name: "bad", arguments: "not json" },
                },
              },
            ],
          }),
      }),
    );

    const client = new CodexAdapter();
    const events: AgentEvent[] = [];
    for await (const e of client.run("test", [], { ...ctx, maxIterations: 1 })) {
      events.push(e);
    }

    expect(events[0].type).toBe("error");
    expect((events[0] as { message: string }).message).toContain("unparseable");
  });
});
