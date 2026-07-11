import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOMERAIL_PLUGIN_SCHEMA_MAX_BYTES,
  HOMERAIL_PLUGIN_SKILL_MAX_BYTES,
} from "homerail-protocol";
import {
  buildHrpArchive,
  generatePluginTypes,
  runPluginFixtureMatrix,
  scaffoldPluginProject,
  scanPluginSource,
  sourceFilesForPack,
  validatePluginFiles,
  verifyPluginArchive,
} from "../src/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function temp(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

describe("HomeRail plugin project SDK", () => {
  it("runs empty directory -> scaffold -> codegen -> fixture matrix -> pack -> verify", () => {
    const root = temp("homerail-plugin-scaffold");
    const scaffold = scaffoldPluginProject(root, "com.example.release-notes", { name: "Release Notes" });
    expect(scaffold.files).toContain("homerail.plugin.json");

    const snapshot = scanPluginSource(root);
    expect(snapshot).toMatchObject({ valid: true, m4_data_only_eligible: true });
    expect(snapshot.issues).toEqual([]);

    expect(() => generatePluginTypes(root, { check: true })).toThrow(/types are stale/);
    expect(fs.existsSync(path.join(root, ".homerail"))).toBe(false);
    const generated = generatePluginTypes(root);
    expect(generated.changed).toBe(true);
    expect(fs.readFileSync(generated.output, "utf8")).toContain("export type CardInputV1");
    expect(fs.readdirSync(path.dirname(generated.output))).toEqual(["plugin-types.d.ts"]);
    expect(generatePluginTypes(root, { check: true }).changed).toBe(false);

    const matrix = runPluginFixtureMatrix(root);
    expect(matrix.valid).toBe(true);
    expect(matrix.fixtures).toEqual([expect.objectContaining({ passed: true, tool: "upsert_card" })]);
    expect(matrix.renderer_matrix).toHaveLength(2 * 3 * 6);

    const first = buildHrpArchive(sourceFilesForPack(snapshot));
    fs.utimesSync(path.join(root, "homerail.plugin.json"), new Date(2030, 1, 1), new Date(2030, 1, 1));
    const second = buildHrpArchive(sourceFilesForPack(scanPluginSource(root)));
    expect(first.archive.equals(second.archive)).toBe(true);
    expect(verifyPluginArchive(first.archive).snapshot).toMatchObject({
      valid: true,
      m4_data_only_eligible: true,
      manifest: { id: "com.example.release-notes", version: "0.1.0" },
    });
  });

  it("rejects symbolic-link and non-directory codegen parents component by component", () => {
    const root = temp("homerail-plugin-codegen-parent");
    const outside = temp("homerail-plugin-codegen-outside");
    scaffoldPluginProject(root, "com.example.codegen-parent");

    fs.symlinkSync(outside, path.join(root, ".homerail"), "dir");
    expect(() => generatePluginTypes(root)).toThrow(/output parent must not be a symbolic link/);
    expect(() => generatePluginTypes(root, { check: true })).toThrow(/output parent must not be a symbolic link/);
    expect(fs.readdirSync(outside)).toEqual([]);

    fs.rmSync(path.join(root, ".homerail"));
    fs.mkdirSync(path.join(root, ".homerail"));
    fs.symlinkSync(outside, path.join(root, ".homerail", "generated"), "dir");
    expect(() => generatePluginTypes(root)).toThrow(/output parent must not be a symbolic link/);
    expect(fs.readdirSync(outside)).toEqual([]);

    fs.rmSync(path.join(root, ".homerail", "generated"));
    fs.writeFileSync(path.join(root, ".homerail", "generated"), "not a directory");
    expect(() => generatePluginTypes(root)).toThrow(/output parent must be a directory/);
  });

  it("never follows an existing codegen target symlink for check or write", () => {
    const root = temp("homerail-plugin-codegen-target");
    const outside = temp("homerail-plugin-codegen-victim");
    scaffoldPluginProject(root, "com.example.codegen-target");
    const generatedDirectory = path.join(root, ".homerail", "generated");
    fs.mkdirSync(generatedDirectory, { recursive: true });
    const victim = path.join(outside, "victim.d.ts");
    const output = path.join(generatedDirectory, "plugin-types.d.ts");
    fs.writeFileSync(victim, "do not overwrite\n");
    fs.symlinkSync(victim, output, "file");

    expect(() => generatePluginTypes(root, { check: true }))
      .toThrow(/output file must not be a symbolic link/);
    expect(() => generatePluginTypes(root))
      .toThrow(/output file must not be a symbolic link/);
    expect(fs.readFileSync(victim, "utf8")).toBe("do not overwrite\n");
    expect(fs.lstatSync(output).isSymbolicLink()).toBe(true);
  });

  it("refuses to scaffold into non-empty or aliased roots", () => {
    const root = temp("homerail-plugin-nonempty");
    fs.writeFileSync(path.join(root, "keep.txt"), "mine");
    expect(() => scaffoldPluginProject(root, "com.example.card")).toThrow(/empty directory/);
    expect(() => scaffoldPluginProject(path.join(root, "child"), "invalid")).toThrow(/Invalid/);
  });

  it("prevalidates scaffold identities and leaves an empty destination untouched on failure", () => {
    const valid = temp("homerail-plugin-short-publisher");
    scaffoldPluginProject(valid, "com.plugin");
    expect(scanPluginSource(valid)).toMatchObject({ valid: true, m4_data_only_eligible: true });

    const invalid = temp("homerail-plugin-invalid-version");
    expect(() => scaffoldPluginProject(invalid, "com.example.invalid", { version: "not-semver" }))
      .toThrow(/scaffold is invalid/);
    expect(fs.readdirSync(invalid)).toEqual([]);
  });

  it("rejects manifest and parent-directory symlinks before reading source bytes", () => {
    const root = temp("homerail-plugin-symlink-source");
    const outside = temp("homerail-plugin-symlink-outside");
    scaffoldPluginProject(root, "com.example.symlinks");

    fs.renameSync(path.join(root, "schemas"), path.join(outside, "schemas"));
    fs.symlinkSync(path.join(outside, "schemas"), path.join(root, "schemas"), "dir");
    expect(() => scanPluginSource(root)).toThrow(/traverses a symlink/);

    fs.rmSync(path.join(root, "schemas"));
    fs.renameSync(path.join(outside, "schemas"), path.join(root, "schemas"));
    fs.renameSync(path.join(root, "homerail.plugin.json"), path.join(outside, "manifest.json"));
    fs.symlinkSync(path.join(outside, "manifest.json"), path.join(root, "homerail.plugin.json"), "file");
    expect(() => scanPluginSource(root)).toThrow(/traverses a symlink/);
  });

  it("rejects undeclared payloads and malformed declarative renderer documents", () => {
    const root = temp("homerail-plugin-invalid-renderer");
    scaffoldPluginProject(root, "com.example.cards");
    const snapshot = scanPluginSource(root);
    const files = new Map(snapshot.files);
    files.set("hidden/code.js", Buffer.from("process.exit(0)"));
    expect(validatePluginFiles(files).issues).toContainEqual(expect.objectContaining({
      message: expect.stringContaining("exactly the manifest"),
      severity: "error",
    }));

    const rendererPath = "ui/views/card.v1.json";
    files.delete("hidden/code.js");
    files.set(rendererPath, Buffer.from(JSON.stringify({
      renderer_version: 1,
      type: "card",
      title_pointer: "/title",
      sections: [
        { id: "same", type: "text", pointer: "/summary" },
        { id: "same", type: "text", pointer: "/summary" },
      ],
    })));
    expect(validatePluginFiles(files).issues).toContainEqual(expect.objectContaining({
      path: rendererPath,
      severity: "error",
    }));
  });

  it("applies the same strict Skill and local-schema policy used by installation", () => {
    const root = temp("homerail-plugin-static-policy");
    scaffoldPluginProject(root, "com.example.static-policy");
    const snapshot = scanPluginSource(root);
    const files = new Map(snapshot.files);
    files.set("skills/compose-card/SKILL.md", Buffer.from(`---\nname: another-skill\ndescription: Invalid identity.\n---\n\n# Instructions\n`));
    expect(validatePluginFiles(files)).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ message: expect.stringContaining("name must match") })],
    });

    const schemaPath = "schemas/card-input.v1.schema.json";
    const schema = JSON.parse(snapshot.files.get(schemaPath)!.toString("utf8")) as Record<string, unknown>;
    schema.properties = {
      ...(schema.properties as Record<string, unknown>),
      remote: { $ref: "https://example.com/untrusted.schema.json" },
    };
    files.set("skills/compose-card/SKILL.md", snapshot.files.get("skills/compose-card/SKILL.md")!);
    files.set(schemaPath, Buffer.from(JSON.stringify(schema)));
    expect(validatePluginFiles(files)).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ message: expect.stringContaining("$ref") })],
    });

    const migrationFiles = new Map(snapshot.files);
    const manifest = JSON.parse(snapshot.files.get("homerail.plugin.json")!.toString("utf8")) as {
      kinds: Array<{
        current_version: number;
        versions: Array<Record<string, unknown>>;
        migrations: Array<Record<string, unknown>>;
      }>;
    };
    manifest.kinds[0].current_version = 2;
    manifest.kinds[0].versions.push({ ...manifest.kinds[0].versions[0], version: 2 });
    manifest.kinds[0].migrations.push({ from: 1, to: 2, file: "migrations/card-1-2.json" });
    migrationFiles.set("homerail.plugin.json", Buffer.from(JSON.stringify(manifest)));
    migrationFiles.set("migrations/card-1-2.json", Buffer.from("arbitrary executable semantics are not an M4 DSL"));
    expect(validatePluginFiles(migrationFiles)).toMatchObject({
      valid: true,
      m4_data_only_eligible: false,
      issues: [expect.objectContaining({ severity: "warning" })],
    });
  });

  it("rejects invalid UTF-8 consistently in source validation and packed archives", () => {
    const root = temp("homerail-plugin-invalid-utf8");
    scaffoldPluginProject(root, "com.example.invalid-utf8");
    const files = new Map(scanPluginSource(root).files);
    files.set("skills/compose-card/SKILL.md", Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff]));
    expect(validatePluginFiles(files)).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ message: expect.stringContaining("valid UTF-8") })],
    });
    const archive = buildHrpArchive([...files.entries()].map(([filePath, content]) => ({ path: filePath, content }))).archive;
    expect(() => verifyPluginArchive(archive)).toThrow(/valid UTF-8/);
  });

  it("aligns per-file and resolved-descriptor budgets with Manager installation", () => {
    const root = temp("homerail-plugin-static-budgets");
    scaffoldPluginProject(root, "com.example.static-budgets");
    const snapshot = scanPluginSource(root);

    const skillFiles = new Map(snapshot.files);
    const skillPrefix = Buffer.from("---\nname: compose-card\ndescription: Bounded Skill.\n---\n\n");
    skillFiles.set("skills/compose-card/SKILL.md", Buffer.concat([
      skillPrefix,
      Buffer.alloc(HOMERAIL_PLUGIN_SKILL_MAX_BYTES - skillPrefix.byteLength, 0x61),
    ]));
    expect(validatePluginFiles(skillFiles).valid).toBe(true);
    skillFiles.set("skills/compose-card/SKILL.md", Buffer.concat([
      skillPrefix,
      Buffer.alloc(HOMERAIL_PLUGIN_SKILL_MAX_BYTES - skillPrefix.byteLength + 1, 0x61),
    ]));
    expect(validatePluginFiles(skillFiles).issues).toContainEqual(expect.objectContaining({
      message: expect.stringContaining(`exceeds ${HOMERAIL_PLUGIN_SKILL_MAX_BYTES} bytes`),
    }));

    const schemaFiles = new Map(snapshot.files);
    const schemaBase = Buffer.from('{"type":"object","properties":{},"additionalProperties":false}');
    schemaFiles.set("schemas/card-input.v1.schema.json", Buffer.concat([
      schemaBase,
      Buffer.alloc(HOMERAIL_PLUGIN_SCHEMA_MAX_BYTES - schemaBase.byteLength, 0x20),
    ]));
    expect(validatePluginFiles(schemaFiles).valid).toBe(true);
    schemaFiles.set("schemas/card-input.v1.schema.json", Buffer.concat([
      schemaBase,
      Buffer.alloc(HOMERAIL_PLUGIN_SCHEMA_MAX_BYTES - schemaBase.byteLength + 1, 0x20),
    ]));
    expect(validatePluginFiles(schemaFiles).issues).toContainEqual(expect.objectContaining({
      message: expect.stringContaining(`exceeds ${HOMERAIL_PLUGIN_SCHEMA_MAX_BYTES} bytes`),
    }));

    const descriptorFiles = new Map(snapshot.files);
    const manifest = JSON.parse(snapshot.files.get("homerail.plugin.json")!.toString("utf8")) as {
      schemas: Array<{ id: string; file: string }>;
    };
    for (let index = 0; index < 13; index += 1) {
      const file = `schemas/padding-${index}.schema.json`;
      manifest.schemas.push({ id: `padding-${index}`, file });
      descriptorFiles.set(file, Buffer.concat([
        schemaBase,
        Buffer.alloc(250 * 1024 - schemaBase.byteLength, 0x20),
      ]));
    }
    descriptorFiles.set("homerail.plugin.json", Buffer.from(JSON.stringify(manifest)));
    expect(validatePluginFiles(descriptorFiles).issues).toContainEqual(expect.objectContaining({
      message: expect.stringContaining("Resolved plugin descriptor exceeds"),
    }));
  });
});
