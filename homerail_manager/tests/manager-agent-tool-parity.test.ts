import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  managerAgentCommonToolCatalog,
  type AgentToolDefinition,
  type ManagerAgentResponseMode,
  type HomerailPluginToolExecutionEnvelopeV1,
  type HomerailPluginTurnContextV1,
} from "homerail-protocol";
import { createManagerTools as createHostCodexManagerTools } from "../src/server/host-codex-manager-agent.js";
import { createManagerTools as createWorkerManagerTools } from "../../homerail_worker/src/manager-agent/server.js";
import { closeDb } from "../src/persistence/db.js";
import { assemblePluginTurnContext } from "../src/plugins/context-assembler.js";
import { syncBuiltinPlugins } from "../src/plugins/registry.js";

interface VoiceSurfaceState {
  commentaryTexts: string[];
  progress: Record<string, unknown> | null;
  taskDraft: Record<string, unknown> | null;
  widgets: Record<string, unknown>[];
  removeWidgetIds: string[];
  pluginProjections: HomerailPluginToolExecutionEnvelopeV1[];
}

interface ComparableTool extends AgentToolDefinition {
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function createVoiceSurface(): VoiceSurfaceState {
  return {
    commentaryTexts: [],
    progress: null,
    taskDraft: null,
    widgets: [],
    removeWidgetIds: [],
    pluginProjections: [],
  };
}

function createHarnessTools(
  responseMode: ManagerAgentResponseMode,
  pluginContext?: HomerailPluginTurnContextV1,
) {
  const hostState = {
    restUrl: "http://127.0.0.1:1/api",
    workspace: "/tmp/homerail-tool-parity",
    projectId: "project-parity",
    sessionId: "session-parity",
    createdRunIds: [] as string[],
    finalNotes: [] as string[],
    objectiveToolCalls: [] as Array<{ name: string; success: boolean; error?: string }>,
    voiceSurface: createVoiceSurface(),
  };
  const workerState = {
    projectId: "project-parity",
    sessionId: "session-parity",
    createdRunIds: [] as string[],
    finalNotes: [] as string[],
    objectiveToolCalls: [] as Array<{
      name: string;
      success: boolean;
      error?: string;
      inferred?: boolean;
    }>,
    voiceSurface: createVoiceSurface(),
  };

  return {
    hostState,
    workerState,
    hostTools: createHostCodexManagerTools(hostState, responseMode, pluginContext) as ComparableTool[],
    workerTools: createWorkerManagerTools(workerState, responseMode, pluginContext) as ComparableTool[],
  };
}

let previousHome: string | undefined;
let tmpHome: string;

beforeEach(() => {
  closeDb();
  previousHome = process.env.HOMERAIL_HOME;
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-tool-parity-"));
  process.env.HOMERAIL_HOME = tmpHome;
  syncBuiltinPlugins();
});

afterEach(() => {
  closeDb();
  if (previousHome === undefined) delete process.env.HOMERAIL_HOME;
  else process.env.HOMERAIL_HOME = previousHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

function catalogProjection(tools: AgentToolDefinition[]): AgentToolDefinition[] {
  return tools
    .map(({ name, description, input_schema }) => ({ name, description, input_schema }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function expectUniqueNames(tools: AgentToolDefinition[]): void {
  const names = tools.map((tool) => tool.name);
  expect(new Set(names).size).toBe(names.length);
}

function requireTool(tools: ComparableTool[], name: string): ComparableTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing Manager Agent tool: ${name}`);
  return tool;
}

describe.each<ManagerAgentResponseMode>(["chat", "voice"])(
  "Manager Agent %s tool catalog parity",
  (responseMode) => {
    it("keeps Host Codex and Worker definitions equal to the protocol catalog", () => {
      const { hostTools, workerTools } = createHarnessTools(responseMode);
      const protocolTools = managerAgentCommonToolCatalog(responseMode);

      expectUniqueNames(hostTools);
      expectUniqueNames(workerTools);
      expectUniqueNames(protocolTools);

      const expected = catalogProjection(protocolTools);
      expect(catalogProjection(hostTools)).toEqual(expected);
      expect(catalogProjection(workerTools)).toEqual(expected);
      expect(catalogProjection(hostTools)).toEqual(catalogProjection(workerTools));
    });
  },
);

describe("Manager Agent deterministic result envelope parity", () => {
  it("keeps side-effect-free Host Codex and Worker handlers compatible", async () => {
    const { hostState, workerState, hostTools, workerTools } = createHarnessTools("voice");
    const fixtures = [
      {
        name: "finish",
        input: { text: "parity complete" },
        expected: { content: [{ type: "text", text: "finished" }] },
      },
      {
        name: "update_task_draft",
        input: { title: "Parity task", status: "draft" },
        expected: { content: [{ type: "text", text: "task draft updated" }] },
      },
      {
        name: "show_status_card",
        input: { id: "status-parity", title: "Parity", status: "ready" },
        expected: { content: [{ type: "text", text: "widget updated" }] },
      },
      {
        name: "show_dynamic_widget",
        input: { id: "dynamic-parity", type: "timeline", title: "Timeline" },
        expected: { content: [{ type: "text", text: "widget updated" }] },
      },
      {
        name: "remove_widget",
        input: { id: "status-parity" },
        expected: { content: [{ type: "text", text: "widget removed" }] },
      },
      {
        name: "update_voice_surface",
        input: {
          commentary_texts: ["checking parity"],
          progress: { status: "running", short_text: "checking" },
          remove_widget_ids: ["dynamic-parity"],
        },
        expected: { content: [{ type: "text", text: "voice surface updated" }] },
      },
    ] as const;

    for (const fixture of fixtures) {
      const hostResult = await requireTool(hostTools, fixture.name).handler(fixture.input);
      const workerResult = await requireTool(workerTools, fixture.name).handler(fixture.input);
      expect(hostResult).toEqual(fixture.expected);
      expect(workerResult).toEqual(fixture.expected);
      expect(hostResult).toEqual(workerResult);
    }

    expect(hostState.finalNotes).toEqual(workerState.finalNotes);
    expect(hostState.voiceSurface).toEqual(workerState.voiceSurface);
  });

  it("executes the same enabled plugin projection through both voice harnesses", async () => {
    const context = assemblePluginTurnContext(undefined, { modality: "voice" });
    const descriptor = context.tools.find((tool) => tool.plugin_id === "com.homerail.topic-outline")!;
    const { hostState, workerState, hostTools, workerTools } = createHarnessTools("voice", context);
    const input = {
      id: "com.homerail.topic-outline:topic-parity",
      title: "Plugin pipeline",
      brief: "One vertical path from Skill to Renderer.",
      thesis: "The DSL is the ABI.",
      outline: [{ title: "Manifest", status: "ready", points: ["Declare the scene"] }],
      questions: ["How is disable handled?"],
      sources: [{ title: "Architecture", url: "https://example.com/architecture", note: "Local design baseline" }],
      next_action: "Validate the fallback",
    };
    const hostResult = await requireTool(hostTools, descriptor.wire_id).handler(input);
    const workerResult = await requireTool(workerTools, descriptor.wire_id).handler(input);
    expect(hostResult).toEqual(workerResult);
    expect(hostState.voiceSurface).toEqual(workerState.voiceSurface);
    expect(hostState.voiceSurface.pluginProjections).toHaveLength(1);
    expect(hostState.voiceSurface.pluginProjections[0]).toMatchObject({
      committed: false,
      plugin: { id: "com.homerail.topic-outline", version: "1.0.0" },
      projection: {
        node: {
          id: "com.homerail.topic-outline:topic-parity",
          kind: "com.homerail.topic-outline/outline",
          content: { title: "Plugin pipeline" },
          fallback: {
            items: expect.arrayContaining([
              "Thesis: The DSL is the ABI.",
              "Section: Manifest: Declare the scene",
              "Question: How is disable handled?",
              "Source: Architecture: Local design baseline",
            ]),
          },
        },
      },
    });
    expect(hostState.voiceSurface.widgets).toHaveLength(0);
    expect(hostState.voiceSurface.pluginProjections[0].projection.legacy_widget).toMatchObject({
      id: "com.homerail.topic-outline:topic-parity",
      type: "topic_outline",
    });
  });

  it("never exposes voice-only plugin Tools in chat and rejects a tampered Context in both harnesses", () => {
    const context = assemblePluginTurnContext(undefined, { modality: "voice" });
    expect(createHarnessTools("chat", context).hostTools.some((tool) => tool.name === context.tools[0].wire_id)).toBe(false);
    const tampered = structuredClone(context);
    tampered.tools[0].description = "tampered";
    expect(() => createHostCodexManagerTools({
      restUrl: "http://127.0.0.1:1/api",
      workspace: "/tmp/homerail-tool-parity",
      createdRunIds: [],
      finalNotes: [],
      objectiveToolCalls: [],
      voiceSurface: createVoiceSurface(),
    }, "voice", tampered)).toThrow(/digest verification/);
    expect(() => createWorkerManagerTools({
      createdRunIds: [],
      finalNotes: [],
      objectiveToolCalls: [],
      voiceSurface: createVoiceSurface(),
    }, "voice", tampered)).toThrow(/digest verification/);
  });

  it("rejects plugin-owned scene writes through both Core widget entry points", async () => {
    const { hostTools, workerTools } = createHarnessTools(
      "voice",
      assemblePluginTurnContext(undefined, { modality: "voice" }),
    );
    for (const tools of [hostTools, workerTools]) {
      await expect(requireTool(tools, "show_dynamic_widget").handler({
        id: "topic-bypass",
        type: "topic_outline",
        title: "Bypass",
      })).rejects.toThrow(/enabled plugin Tool/);
      await expect(requireTool(tools, "update_voice_surface").handler({
        widgets: [{
          id: "topic-bypass-visual",
          type: "html",
          title: "Bypass",
          data: { visual: "topic_outline" },
        }],
      })).rejects.toThrow(/enabled plugin Tool/);
    }
  });
});
