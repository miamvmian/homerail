import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomerailPluginManifestV1 } from "homerail-protocol";
import { repoRoot } from "../src/assets/root.js";
import { closeDb, getDb } from "../src/persistence/db.js";
import {
  getPluginRegistryState,
  listPluginPackages,
  setPluginEnabled,
  syncPluginPackage,
} from "../src/persistence/plugins.js";
import { pluginDescriptorPackageDigest } from "../src/plugins/descriptor.js";
import { loadPluginPackage } from "../src/plugins/manifest-loader.js";
import {
  CORE_PLUGIN_ID,
  HomerailPluginRegistry,
  M3_BUILTIN_RENDERER_IDS,
} from "../src/plugins/registry.js";

const corePackage = () => path.join(repoRoot(), "plugins", "builtin", "core-generative-ui");

function writeMinimalPlugin(root: string, id = "com.example.notes", version = "1.0.0"): string {
  const packageRoot = path.join(root, `${id}-${version}`);
  fs.mkdirSync(path.join(packageRoot, "skills", "notes"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "schemas"), { recursive: true });
  const manifest: HomerailPluginManifestV1 = {
    manifest_version: 1,
    id,
    version,
    name: "Notes",
    publisher: { id: "com.example", name: "Example" },
    license: "MIT",
    compatibility: {
      homerail: { min: "0.1.0", max_exclusive: "0.2.0" },
      plugin_api: [1], ui_ir: [1], renderer_api: [1],
    },
    capabilities: [{
      id: "notes", summary: "Keep notes.", intents: ["keep a note"],
      modalities: ["text"], required_inputs: [], skill: "notes",
      tools: [], workflows: [], actions: [],
    }],
    skills: [{ id: "notes", path: "skills/notes/SKILL.md", description: "Keep notes." }],
    schemas: [{ id: "notes-v1", file: "schemas/notes.v1.schema.json" }],
    kinds: [], tools: [], workflows: [], renderers: [], actions: [],
    runtime: { trust: "data_only", plugin_api: 1 },
    permissions: { required: [], optional: [] },
    state: { schema_version: 1, migrations: [] },
  };
  fs.writeFileSync(path.join(packageRoot, "homerail.plugin.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(packageRoot, "skills", "notes", "SKILL.md"), [
    "---", "name: notes", "description: Keep concise notes.", "---", "", "# Notes", "", "Keep only useful notes.", "",
  ].join("\n"));
  fs.writeFileSync(path.join(packageRoot, "schemas", "notes.v1.schema.json"), JSON.stringify({
    type: "object", properties: { note: { type: "string" } }, required: ["note"], additionalProperties: false,
  }, null, 2));
  return packageRoot;
}

describe("HomeRail plugin archive and activation registry", () => {
  let previousHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    closeDb();
    previousHome = process.env.HOMERAIL_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-plugin-registry-"));
    process.env.HOMERAIL_HOME = tmpHome;
  });

  afterEach(() => {
    closeDb();
    if (previousHome === undefined) delete process.env.HOMERAIL_HOME;
    else process.env.HOMERAIL_HOME = previousHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("loads the bundled Core package into a deterministic immutable descriptor", () => {
    const options = {
      source: "builtin" as const,
      trusted_builtin_ids: new Set([CORE_PLUGIN_ID]),
      builtin_renderer_ids: M3_BUILTIN_RENDERER_IDS,
    };
    const first = loadPluginPackage(corePackage(), options);
    const second = loadPluginPackage(corePackage(), options);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      descriptor_version: 1,
      manifest: { id: CORE_PLUGIN_ID, version: "0.1.0" },
      schemas: [{ id: "legacy-widget-content-v1" }],
      skills: [{ id: "voice-generative-ui" }],
    });
    expect(first.package_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects symlink escapes and non-local schema references", () => {
    const copy = path.join(tmpHome, "core-copy");
    fs.cpSync(corePackage(), copy, { recursive: true });
    const skill = path.join(copy, "skills", "voice-generative-ui", "SKILL.md");
    fs.rmSync(skill);
    fs.symlinkSync(path.join(corePackage(), "skills", "voice-generative-ui", "SKILL.md"), skill);
    expect(() => loadPluginPackage(copy, {
      source: "builtin",
      builtin_renderer_ids: M3_BUILTIN_RENDERER_IDS,
    })).toThrow(/symlink/i);

    const minimal = writeMinimalPlugin(tmpHome);
    fs.writeFileSync(path.join(minimal, "schemas", "notes.v1.schema.json"), JSON.stringify({
      type: "object",
      properties: { note: { $ref: "https://example.invalid/schema.json" } },
      additionalProperties: false,
    }));
    expect(() => loadPluginPackage(minimal, { source: "development" })).toThrow(/non-local \$ref/i);
  });

  it("keeps Core locked and preserves an optional plugin disable across resync", () => {
    const registry = new HomerailPluginRegistry();
    const first = registry.snapshot();
    expect(first.plugins).toHaveLength(1);
    expect(first.plugins[0].activation).toMatchObject({ enabled: true, locked: true, revision: 1 });
    expect(() => registry.setEnabled(CORE_PLUGIN_ID, false)).toThrow(/locked/);
    expect(registry.snapshot()).toMatchObject({ revision: first.revision, fingerprint: first.fingerprint });

    const descriptor = loadPluginPackage(writeMinimalPlugin(tmpHome), { source: "development" });
    syncPluginPackage({ descriptor, source: "development", default_enabled: true, timestamp: "2026-07-11T12:00:00.000Z" });
    expect(setPluginEnabled(descriptor.manifest.id, false, "2026-07-11T12:01:00.000Z"))
      .toMatchObject({ enabled: false, revision: 2 });
    syncPluginPackage({ descriptor, source: "development", default_enabled: true, timestamp: "2026-07-11T12:02:00.000Z" });
    expect(getPluginRegistryState().plugins.find((plugin) => plugin.plugin_id === descriptor.manifest.id)?.activation)
      .toMatchObject({ enabled: false, revision: 2 });
  });

  it("archives versions side by side and rejects same-version content drift", () => {
    const firstRoot = writeMinimalPlugin(tmpHome, "com.example.notes", "1.0.0");
    const first = loadPluginPackage(firstRoot, { source: "development" });
    syncPluginPackage({ descriptor: first, source: "development", default_enabled: true });

    const driftRoot = path.join(tmpHome, "drift");
    fs.cpSync(firstRoot, driftRoot, { recursive: true });
    fs.appendFileSync(path.join(driftRoot, "skills", "notes", "SKILL.md"), "\nUse a stable id.\n");
    const drift = loadPluginPackage(driftRoot, { source: "development" });
    expect(drift.package_digest).not.toBe(first.package_digest);
    expect(() => syncPluginPackage({ descriptor: drift, source: "development" })).toThrow(/digest collision/);

    const second = loadPluginPackage(writeMinimalPlugin(tmpHome, "com.example.notes", "1.1.0"), {
      source: "development",
    });
    const activated = syncPluginPackage({ descriptor: second, source: "development" });
    expect(activated.activation).toMatchObject({ active_version: "1.1.0", enabled: true, revision: 2 });
    expect(listPluginPackages().map((entry) => entry.plugin_version)).toEqual(["1.0.0", "1.1.0"]);
    expect(() => getDb().prepare(`
      DELETE FROM plugin_packages WHERE plugin_id = ? AND plugin_version = ?
    `).run("com.example.notes", "1.1.0")).toThrow(/foreign key/i);
  });

  it("fails closed when a persisted descriptor is corrupted", () => {
    const descriptor = loadPluginPackage(writeMinimalPlugin(tmpHome), { source: "development" });
    syncPluginPackage({ descriptor, source: "development", default_enabled: true });
    const broken = structuredClone(descriptor);
    broken.schemas[0].schema = { type: "object", additionalProperties: true };
    const { package_digest: _digest, ...unsigned } = broken;
    broken.package_digest = pluginDescriptorPackageDigest(unsigned);
    getDb().prepare(`
      UPDATE plugin_packages SET resolved_descriptor_json = ? WHERE plugin_id = ?
    `).run(JSON.stringify(broken), descriptor.manifest.id);
    expect(() => getPluginRegistryState()).toThrow(/Invalid persisted plugin package/);
  });
});
