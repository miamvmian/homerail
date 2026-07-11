import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GENERATIVE_UI_IR_VERSION,
  type GenerativeUiStoredNodeV1,
} from "homerail-protocol";
import { GenerativeUiKindRegistry } from "../src/generative-ui/kind-registry.js";
import { closeDb } from "../src/persistence/db.js";
import {
  assemblePluginTurnContext,
  readArchivedPluginSkill,
} from "../src/plugins/context-assembler.js";
import { syncBuiltinPlugins } from "../src/plugins/registry.js";

function coreNode(): GenerativeUiStoredNodeV1 {
  return {
    ir_version: GENERATIVE_UI_IR_VERSION,
    id: "memo",
    kind: "com.homerail.core/task_summary",
    kind_version: 1,
    owner: { id: "com.homerail.core", version: "0.1.0" },
    surface: "task",
    importance: "primary",
    content: {
      legacy_widget: { id: "memo", type: "memo", title: "Current task" },
    },
    presentation: { density: "summary", preferred_visual: "memo" },
    fallback: { title: "Current task" },
    revision: 1,
    updated_at: "2026-07-11T12:00:00.000Z",
  };
}

describe("Plugin Context and Kind Registry", () => {
  let previousHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    closeDb();
    previousHome = process.env.HOMERAIL_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-plugin-context-"));
    process.env.HOMERAIL_HOME = tmpHome;
    syncBuiltinPlugins();
  });

  afterEach(() => {
    closeDb();
    if (previousHome === undefined) delete process.env.HOMERAIL_HOME;
    else process.env.HOMERAIL_HOME = previousHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("assembles one deterministic immutable context before harness selection", () => {
    const first = assemblePluginTurnContext();
    const second = assemblePluginTurnContext();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      context_version: 1,
      registry_revision: 1,
      enabled_plugins: [{ id: "com.homerail.core", version: "0.1.0" }],
      skills: [{
        local_id: "voice-generative-ui",
        qualified_id: "com.homerail.core:voice-generative-ui",
      }],
      tools: [],
      actions: [],
      permission_revision: 0,
    });
    expect(first.context_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reads a Skill only through the enabled exact plugin snapshot", () => {
    const skill = readArchivedPluginSkill("com.homerail.core:voice-generative-ui");
    expect(skill).toMatchObject({
      descriptor: {
        plugin_id: "com.homerail.core",
        plugin_version: "0.1.0",
        local_id: "voice-generative-ui",
      },
    });
    expect(skill?.content).toContain("Use only the tools present in the current turn's catalog");
    expect(readArchivedPluginSkill("com.homerail.core:missing")).toBeUndefined();
  });

  it("keeps archived Kind validation separate from active projections", () => {
    const registry = new GenerativeUiKindRegistry();
    expect(registry.validateHistoricalNode(coreNode())).toEqual([]);
    const invalid = coreNode();
    invalid.content = { unknown: true };
    expect(registry.validateHistoricalNode(invalid)).toContainEqual(expect.objectContaining({
      path: "/content",
      keyword: "required",
    }));
    const unknown = coreNode();
    unknown.owner.version = "9.0.0";
    expect(registry.validateHistoricalNode(unknown)).toContainEqual(expect.objectContaining({
      keyword: "kindRegistry",
    }));

    expect(registry.compositionMetadata()).toHaveLength(9);
    expect(registry.uiProjection()).toMatchObject({
      registry_revision: 1,
      kinds: expect.arrayContaining([expect.objectContaining({
        kind: "com.homerail.core/task_summary",
        enabled: true,
      })]),
      renderers: expect.arrayContaining([expect.objectContaining({
        renderer_id: "core-task-summary",
        enabled: true,
      })]),
    });
  });
});
