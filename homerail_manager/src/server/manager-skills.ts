import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";

import { repoRoot } from "../assets/root.js";
import { getHomerailHome } from "../config/env.js";
import {
  assemblePluginTurnContext,
  readArchivedPluginSkill,
  readExactArchivedPluginSkill,
} from "../plugins/context-assembler.js";
import type { HomerailPluginTurnContextV1 } from "homerail-protocol";

export interface ManagerSkillSummary {
  id: string;
  name: string;
  description: string;
  relative_path: string;
  source: "home" | "repo" | "plugin";
  enabled: true;
  plugin_id?: string;
  plugin_version?: string;
  digest?: string;
}

export interface ManagerSkillDetail extends ManagerSkillSummary {
  content: string;
}

export interface ManagerSkillInstallResult {
  root: string;
  installed: string[];
  existing: string[];
  errors: Array<{ id: string; message: string }>;
}

const MAX_SKILL_BYTES = 256 * 1024;

function skillDescription(content: string): { name?: string; description?: string } {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end < 0) return {};
  try {
    const parsed = YAML.parse(content.slice(3, end)) as Record<string, unknown> | null;
    const name = typeof parsed?.name === "string" ? parsed.name.trim() : undefined;
    const description = typeof parsed?.description === "string"
      ? parsed.description.replace(/\s+/g, " ").trim()
      : undefined;
    return { name, description };
  } catch {
    return {};
  }
}

function readSkillFile(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) return undefined;
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function scanSkills(root: string, source: ManagerSkillSummary["source"]): ManagerSkillDetail[] {
  if (!fs.existsSync(root)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .flatMap((entry) => {
      const file = path.join(root, entry.name, "SKILL.md");
      const content = readSkillFile(file);
      if (content === undefined) return [];
      const metadata = skillDescription(content);
      return [{
        id: entry.name,
        name: metadata.name || entry.name,
        description: metadata.description || "HomeRail Manager Agent skill",
        relative_path: path.posix.join("skills", entry.name, "SKILL.md"),
        source,
        enabled: true as const,
        content,
      }];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getManagerSkillsRoot(): string {
  return path.join(getHomerailHome(), "skills");
}

export function ensureManagerSkillsInstalled(): ManagerSkillInstallResult {
  const destinationRoot = getManagerSkillsRoot();
  const sourceRoot = path.join(repoRoot(), "skills");
  const result: ManagerSkillInstallResult = { root: destinationRoot, installed: [], existing: [], errors: [] };
  fs.mkdirSync(destinationRoot, { recursive: true });
  if (!fs.existsSync(sourceRoot)) return result;

  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("homerail-")) continue;
    const source = path.join(sourceRoot, entry.name);
    if (!fs.existsSync(path.join(source, "SKILL.md"))) continue;
    const destination = path.join(destinationRoot, entry.name);
    try {
      const existing = fs.lstatSync(destination);
      if (existing.isSymbolicLink() && !fs.existsSync(destination)) {
        fs.unlinkSync(destination);
      } else {
        result.existing.push(entry.name);
        continue;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        result.errors.push({ id: entry.name, message: error instanceof Error ? error.message : String(error) });
        continue;
      }
    }
    try {
      fs.symlinkSync(source, destination, process.platform === "win32" ? "junction" : "dir");
      result.installed.push(entry.name);
    } catch (error) {
      result.errors.push({
        id: entry.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

export function listManagerSkills(
  pluginContext: HomerailPluginTurnContextV1 | null = assemblePluginTurnContext(),
): ManagerSkillSummary[] {
  ensureManagerSkillsInstalled();
  const homeSkills = scanSkills(getManagerSkillsRoot(), "home");
  const byId = new Map(homeSkills.map((skill) => [skill.id, skill]));
  for (const skill of scanSkills(path.join(repoRoot(), "skills"), "repo")) {
    if (!byId.has(skill.id)) byId.set(skill.id, skill);
  }
  const local = Array.from(byId.values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ content: _content, ...summary }) => summary);
  const plugin = (pluginContext?.skills ?? []).map((skill): ManagerSkillSummary => ({
    id: skill.qualified_id,
    name: skill.local_id,
    description: skill.description,
    relative_path: `plugin://${skill.plugin_id}@${skill.plugin_version}/skills/${skill.local_id}`,
    source: "plugin",
    enabled: true,
    plugin_id: skill.plugin_id,
    plugin_version: skill.plugin_version,
    digest: skill.digest,
  }));
  return [...local, ...plugin].sort((a, b) => a.id.localeCompare(b.id));
}

export function readManagerSkill(
  id: string,
  exactPlugin?: { plugin_version: string; digest: string },
): ManagerSkillDetail | undefined {
  const normalized = id.trim();
  if (!normalized || normalized.includes("/") || normalized.includes("\\") || normalized === "." || normalized === "..") {
    return undefined;
  }
  if (normalized.includes(":")) {
    const separator = normalized.lastIndexOf(":");
    const pluginId = normalized.slice(0, separator);
    const localId = normalized.slice(separator + 1);
    const plugin = exactPlugin
      ? readExactArchivedPluginSkill({
        plugin_id: pluginId,
        plugin_version: exactPlugin.plugin_version,
        local_id: localId,
        qualified_id: normalized,
        digest: exactPlugin.digest,
      })
      : readArchivedPluginSkill(normalized);
    if (!plugin) return undefined;
    return {
      id: plugin.descriptor.qualified_id,
      name: plugin.descriptor.local_id,
      description: plugin.descriptor.description,
      relative_path: `plugin://${plugin.descriptor.plugin_id}@${plugin.descriptor.plugin_version}/skills/${plugin.descriptor.local_id}`,
      source: "plugin",
      enabled: true,
      plugin_id: plugin.descriptor.plugin_id,
      plugin_version: plugin.descriptor.plugin_version,
      digest: plugin.descriptor.digest,
      content: plugin.content,
    };
  }
  ensureManagerSkillsInstalled();
  const home = scanSkills(getManagerSkillsRoot(), "home").find((skill) => skill.id === normalized);
  if (home) return home;
  return scanSkills(path.join(repoRoot(), "skills"), "repo").find((skill) => skill.id === normalized);
}
