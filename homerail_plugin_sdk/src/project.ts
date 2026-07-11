import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import AjvModule from "ajv";
import YAML from "yaml";
import {
  GENERATIVE_UI_IR_VERSION,
  HOMERAIL_PLUGIN_DESCRIPTOR_MAX_BYTES,
  HOMERAIL_PLUGIN_SCHEMA_MAX_BYTES,
  HOMERAIL_PLUGIN_SKILL_MAX_BYTES,
  HOMERAIL_PLUGIN_API_VERSION,
  HOMERAIL_RENDERER_API_VERSION,
  HomerailPluginRuntimeTrust,
  analyzeHomerailPluginSchemaPolicy,
  decodeHomerailPluginUtf8,
  collectHomerailPluginFileReferences,
  validateHomerailDeclarativeRenderer,
  validateHomerailDirectUiProjection,
  validateHomerailPluginCompatibility,
  validateHomerailPluginManifest,
  type HomerailPluginManifestV1,
} from "homerail-protocol";
import {
  DEFAULT_HRP_LIMITS,
  encodeHrpZip,
  HRP_LOCK_FILE,
  HRP_MANIFEST_FILE,
  HRP_SIGNATURE_FILE,
  normalizeHrpPath,
  verifyHrpArchive,
  type HrpSourceFile,
  type VerifiedHrpArchive,
} from "./archive.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass = (AjvModule as any).default || AjvModule;
const HOMERAIL_VERSION = "0.1.0";

export interface PluginValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface PluginSourceSnapshot {
  root?: string;
  manifest: HomerailPluginManifestV1;
  files: ReadonlyMap<string, Buffer>;
  file_digests: ReadonlyMap<string, string>;
  issues: PluginValidationIssue[];
  valid: boolean;
  m4_data_only_eligible: boolean;
}

function digest(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseJsonObject(content: Buffer, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(decodeHomerailPluginUtf8(content, label));
  } catch (cause) {
    throw new Error(`${label} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return value as Record<string, unknown>;
}

function expectedPayloadPaths(manifest: HomerailPluginManifestV1): string[] {
  return [HRP_MANIFEST_FILE, ...collectHomerailPluginFileReferences(manifest)]
    .map(normalizeHrpPath)
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

export function validatePluginSkill(skillId: string, contentValue: Buffer | string): void {
  const byteLength = Buffer.isBuffer(contentValue)
    ? contentValue.byteLength
    : Buffer.byteLength(contentValue, "utf8");
  if (byteLength > HOMERAIL_PLUGIN_SKILL_MAX_BYTES) {
    throw new Error(`Plugin Skill ${skillId} exceeds ${HOMERAIL_PLUGIN_SKILL_MAX_BYTES} bytes`);
  }
  const content = Buffer.isBuffer(contentValue)
    ? decodeHomerailPluginUtf8(contentValue, `Plugin Skill ${skillId}`)
    : contentValue;
  if (!content.startsWith("---")) throw new Error(`Plugin Skill ${skillId} is missing YAML frontmatter`);
  const end = content.indexOf("\n---", 3);
  if (end < 0) throw new Error(`Plugin Skill ${skillId} has unterminated YAML frontmatter`);
  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(content.slice(3, end));
  } catch (cause) {
    throw new Error(`Plugin Skill ${skillId} has invalid YAML frontmatter: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new Error(`Plugin Skill ${skillId} frontmatter must be an object`);
  }
  const metadata = frontmatter as Record<string, unknown>;
  const extra = Object.keys(metadata).filter((key) => key !== "name" && key !== "description");
  if (extra.length) throw new Error(`Plugin Skill ${skillId} has unsupported frontmatter keys: ${extra.join(", ")}`);
  if (metadata.name !== skillId) throw new Error(`Plugin Skill ${skillId} frontmatter name must match its manifest id`);
  if (typeof metadata.description !== "string" || !metadata.description.trim()) {
    throw new Error(`Plugin Skill ${skillId} needs a non-empty frontmatter description`);
  }
  if (!content.slice(end + 4).trim()) throw new Error(`Plugin Skill ${skillId} has no instructions`);
}

function validateSchema(content: Buffer, label: string): Record<string, unknown> {
  if (content.byteLength > HOMERAIL_PLUGIN_SCHEMA_MAX_BYTES) {
    throw new Error(`${label} exceeds ${HOMERAIL_PLUGIN_SCHEMA_MAX_BYTES} bytes`);
  }
  const schema = parseJsonObject(content, label);
  if (schema.type !== "object" || schema.additionalProperties !== false) {
    throw new Error(`${label} must be a closed object schema`);
  }
  const policyIssues = analyzeHomerailPluginSchemaPolicy(schema);
  if (policyIssues.length) throw new Error(`${label} violates schema policy: ${JSON.stringify(policyIssues)}`);
  const ajv = new AjvClass({ allErrors: true, strict: true, coerceTypes: false });
  try {
    ajv.compile(schema);
  } catch (cause) {
    throw new Error(`${label} does not compile: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return schema;
}

function policyEligible(manifest: HomerailPluginManifestV1): boolean {
  return manifest.runtime.trust === HomerailPluginRuntimeTrust.DATA_ONLY
    && manifest.runtime.entrypoint === undefined
    && manifest.renderers.every((renderer) => renderer.mode === "declarative")
    && manifest.tools.every((tool) => (
      tool.handler.type === "projection"
      && tool.effect === "write"
      && tool.permissions.length === 0
      && tool.confirmation === "never"
      && Boolean(tool.output_schema)
    ))
    && manifest.actions.length === 0
    && manifest.workflows.length === 0
    && manifest.kinds.every((kind) => kind.migrations.length === 0)
    && manifest.state.migrations.length === 0
    && manifest.permissions.required.length === 0
    && manifest.permissions.optional.length === 0;
}

export function validatePluginFiles(inputFiles: ReadonlyMap<string, Buffer>, root?: string): PluginSourceSnapshot {
  const issues: PluginValidationIssue[] = [];
  const files = new Map<string, Buffer>();
  for (const [rawPath, rawContent] of inputFiles) {
    try {
      const filePath = normalizeHrpPath(rawPath);
      if (files.has(filePath)) throw new Error(`duplicate file: ${filePath}`);
      files.set(filePath, Buffer.from(rawContent));
    } catch (cause) {
      issues.push({ path: rawPath, message: cause instanceof Error ? cause.message : String(cause), severity: "error" });
    }
  }
  try {
    encodeHrpZip([...files.entries()].map(([filePath, content]) => ({ path: filePath, content })));
  } catch (cause) {
    issues.push({
      path: "/",
      message: cause instanceof Error ? cause.message : String(cause),
      severity: "error",
    });
  }
  const rawManifest = files.get(HRP_MANIFEST_FILE);
  if (!rawManifest) throw new Error(`Plugin source is missing ${HRP_MANIFEST_FILE}`);
  const parsed = parseJsonObject(rawManifest, HRP_MANIFEST_FILE);
  const manifestValidation = validateHomerailPluginManifest(parsed);
  if (!manifestValidation.valid || !manifestValidation.value) {
    return {
      ...(root ? { root } : {}),
      manifest: parsed as unknown as HomerailPluginManifestV1,
      files,
      file_digests: new Map(),
      issues: manifestValidation.errors.map((entry) => ({
        path: `${HRP_MANIFEST_FILE}${entry.path}`,
        message: entry.message,
        severity: "error" as const,
      })),
      valid: false,
      m4_data_only_eligible: false,
    };
  }
  const manifest = manifestValidation.value;
  for (const entry of validateHomerailPluginCompatibility(manifest, {
    homerail: HOMERAIL_VERSION,
    plugin_api: HOMERAIL_PLUGIN_API_VERSION,
    ui_ir: GENERATIVE_UI_IR_VERSION,
    renderer_api: HOMERAIL_RENDERER_API_VERSION,
  })) {
    issues.push({ path: `${HRP_MANIFEST_FILE}${entry.path}`, message: entry.message, severity: "error" });
  }
  const expected = expectedPayloadPaths(manifest);
  const actual = [...files.keys()]
    .filter((filePath) => filePath !== HRP_LOCK_FILE && filePath !== HRP_SIGNATURE_FILE)
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    issues.push({
      path: "/",
      message: "Plugin payload must contain exactly the manifest and every declared referenced file",
      severity: "error",
    });
  }
  const schemas = new Map<string, Record<string, unknown>>();
  for (const declaration of manifest.schemas) {
    const content = files.get(declaration.file);
    if (!content) continue;
    try {
      schemas.set(declaration.id, validateSchema(content, declaration.file));
    } catch (cause) {
      issues.push({ path: declaration.file, message: cause instanceof Error ? cause.message : String(cause), severity: "error" });
    }
  }
  for (const skill of manifest.skills) {
    const content = files.get(skill.path);
    if (!content) continue;
    try {
      validatePluginSkill(skill.id, content);
    } catch (cause) {
      issues.push({ path: skill.path, message: cause instanceof Error ? cause.message : String(cause), severity: "error" });
    }
  }
  const handlers = [
    ...manifest.tools.map((tool) => ({ owner: `tool ${tool.id}`, handler: tool.handler, output_schema: tool.output_schema })),
    ...manifest.actions.map((action) => ({ owner: `action ${action.id}`, handler: action.handler, output_schema: undefined })),
  ];
  for (const entry of handlers) {
    if (entry.handler.type !== "projection") continue;
    const content = files.get(entry.handler.file);
    if (!content) continue;
    try {
      const document = parseJsonObject(content, entry.handler.file);
      const projection = validateHomerailDirectUiProjection(document);
      if (!projection.valid || !projection.value) throw new Error(JSON.stringify(projection.errors));
      const kind = manifest.kinds.find((candidate) => candidate.kind === projection.value!.kind);
      const version = kind?.versions.find((candidate) => candidate.version === projection.value!.kind_version);
      if (!version) throw new Error(`${entry.owner} targets an undeclared Kind version`);
      if (!version.allowed_surfaces.includes(projection.value.defaults.surface)) {
        throw new Error(`${entry.owner} targets a disallowed default surface`);
      }
      if (entry.output_schema && entry.output_schema !== version.content_schema) {
        throw new Error(`${entry.owner} output schema must match the projected Kind content schema`);
      }
      if (projection.value.legacy_bridge) throw new Error("External data-only projectors cannot declare a legacy bridge");
    } catch (cause) {
      issues.push({ path: entry.handler.file, message: cause instanceof Error ? cause.message : String(cause), severity: "error" });
    }
  }
  for (const renderer of manifest.renderers) {
    if (renderer.source.type !== "declarative") continue;
    const content = files.get(renderer.source.file);
    if (!content) continue;
    try {
      const document = parseJsonObject(content, renderer.source.file);
      const validation = validateHomerailDeclarativeRenderer(document);
      if (!validation.valid) throw new Error(JSON.stringify(validation.errors));
    } catch (cause) {
      issues.push({ path: renderer.source.file, message: cause instanceof Error ? cause.message : String(cause), severity: "error" });
    }
  }
  for (const workflow of manifest.workflows) {
    const content = files.get(workflow.file);
    if (content && !decodeHomerailPluginUtf8(content, workflow.file).trim()) {
      issues.push({ path: workflow.file, message: "Workflow file cannot be empty", severity: "error" });
    }
  }
  const fileDigests = new Map([...files.entries()].map(([filePath, content]) => [filePath, digest(content)]));
  if (issues.every((issue) => issue.severity !== "error")) {
    try {
      const referencedFiles = collectHomerailPluginFileReferences(manifest).map((filePath) => ({
        path: filePath,
        digest: fileDigests.get(filePath)!,
        encoding: "base64",
        content: files.get(filePath)!.toString("base64"),
      }));
      const descriptor = {
        descriptor_version: 1,
        manifest,
        manifest_digest: "0".repeat(64),
        package_digest: "0".repeat(64),
        schemas: manifest.schemas.map((declaration) => ({
          id: declaration.id,
          file: declaration.file,
          digest: fileDigests.get(declaration.file)!,
          schema: JSON.parse(decodeHomerailPluginUtf8(files.get(declaration.file)!, declaration.file)) as unknown,
        })),
        skills: manifest.skills.map((skill) => ({
          id: skill.id,
          path: skill.path,
          digest: fileDigests.get(skill.path)!,
          content: decodeHomerailPluginUtf8(files.get(skill.path)!, skill.path),
        })),
        referenced_files: referencedFiles,
      };
      const descriptorBytes = Buffer.byteLength(JSON.stringify(descriptor), "utf8");
      if (descriptorBytes > HOMERAIL_PLUGIN_DESCRIPTOR_MAX_BYTES) {
        issues.push({
          path: "/",
          message: `Resolved plugin descriptor exceeds ${HOMERAIL_PLUGIN_DESCRIPTOR_MAX_BYTES} bytes`,
          severity: "error",
        });
      }
    } catch (cause) {
      issues.push({ path: "/", message: `Cannot materialize bounded plugin descriptor: ${cause instanceof Error ? cause.message : String(cause)}`, severity: "error" });
    }
  }
  const eligible = policyEligible(manifest);
  if (!eligible) {
    issues.push({
      path: `${HRP_MANIFEST_FILE}/runtime`,
      message: "Package is valid but is not eligible for the M4 data-only execution policy",
      severity: "warning",
    });
  }
  return {
    ...(root ? { root } : {}),
    manifest,
    files,
    file_digests: fileDigests,
    issues,
    valid: issues.every((issue) => issue.severity !== "error"),
    m4_data_only_eligible: eligible,
  };
}

export function scanPluginSource(rootValue: string): PluginSourceSnapshot {
  const stat = fs.lstatSync(rootValue);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Plugin source root must be a real directory");
  const root = fs.realpathSync(rootValue);
  const resolveRegularFile = (relativePath: string): string => {
    const segments = relativePath.split("/");
    let cursor = root;
    for (let index = 0; index < segments.length; index += 1) {
      cursor = path.join(cursor, segments[index]);
      const entryStat = fs.lstatSync(cursor);
      if (entryStat.isSymbolicLink()) throw new Error(`Plugin reference traverses a symlink: ${relativePath}`);
      if (index < segments.length - 1 && !entryStat.isDirectory()) {
        throw new Error(`Plugin reference parent is not a directory: ${relativePath}`);
      }
      if (index === segments.length - 1 && !entryStat.isFile()) {
        throw new Error(`Plugin reference is not a regular file: ${relativePath}`);
      }
    }
    const resolved = fs.realpathSync(cursor);
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Plugin reference resolves outside the source root: ${relativePath}`);
    }
    return resolved;
  };
  const manifestPath = resolveRegularFile(HRP_MANIFEST_FILE);
  const manifestContent = fs.readFileSync(manifestPath);
  if (manifestContent.byteLength > DEFAULT_HRP_LIMITS.max_file_bytes) throw new Error("Plugin manifest exceeds size limit");
  const parsed = parseJsonObject(manifestContent, HRP_MANIFEST_FILE);
  const validation = validateHomerailPluginManifest(parsed);
  if (!validation.valid || !validation.value) {
    return validatePluginFiles(new Map([[HRP_MANIFEST_FILE, manifestContent]]), root);
  }
  const files = new Map<string, Buffer>([[HRP_MANIFEST_FILE, manifestContent]]);
  for (const relativePath of collectHomerailPluginFileReferences(validation.value)) {
    const portable = normalizeHrpPath(relativePath);
    const target = resolveRegularFile(portable);
    const targetStat = fs.lstatSync(target);
    if (targetStat.size > DEFAULT_HRP_LIMITS.max_file_bytes) throw new Error(`Plugin file exceeds size limit: ${portable}`);
    files.set(portable, fs.readFileSync(target));
  }
  return validatePluginFiles(files, root);
}

export function verifyPluginArchive(archive: Buffer): VerifiedHrpArchive & { snapshot: PluginSourceSnapshot } {
  const verified = verifyHrpArchive(archive);
  const snapshot = validatePluginFiles(verified.files);
  if (!snapshot.valid) {
    throw new Error(`HRP plugin source validation failed: ${JSON.stringify(snapshot.issues)}`);
  }
  if (
    snapshot.manifest.id !== verified.lock.plugin.id
    || snapshot.manifest.version !== verified.lock.plugin.version
  ) throw new Error("HRP verified plugin identity does not match lock");
  return { ...verified, snapshot };
}

export function sourceFilesForPack(snapshot: PluginSourceSnapshot): HrpSourceFile[] {
  if (!snapshot.valid) throw new Error(`Cannot pack invalid plugin source: ${JSON.stringify(snapshot.issues)}`);
  return [...snapshot.files.entries()]
    .filter(([filePath]) => filePath !== HRP_LOCK_FILE && filePath !== HRP_SIGNATURE_FILE)
    .map(([filePath, content]) => ({ path: filePath, content: Buffer.from(content) }));
}
