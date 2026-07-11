import { createHash } from "node:crypto";
import {
  type HomerailPluginResolvedHandlerV1,
  type HomerailPluginSkillDescriptorV1,
  type HomerailPluginToolDescriptorV1,
  type HomerailPluginTurnContextV1,
  validateHomerailPluginTurnContext,
} from "homerail-protocol";
import {
  getPluginRegistryState,
  type ActivePluginRecord,
  type PluginRegistryState,
} from "../persistence/plugins.js";
import { pluginJsonDigest } from "./descriptor.js";
import { syncBuiltinPlugins } from "./registry.js";

function qualified(pluginId: string, localId: string): string {
  return `${pluginId}:${localId}`;
}

function collisionWireId(pluginId: string, localId: string): string {
  const digest = createHash("sha256").update(qualified(pluginId, localId)).digest("hex").slice(0, 10);
  const suffixBudget = 64 - 2 - digest.length - 1;
  return `p_${digest}_${localId.slice(0, suffixBudget)}`;
}

function archivedProjectionHandler(
  plugin: ActivePluginRecord,
  file: string,
): HomerailPluginResolvedHandlerV1 {
  const archived = plugin.descriptor.referenced_files.find((entry) => entry.path === file);
  if (!archived) throw new Error(`Missing archived projection: ${plugin.plugin_id}:${file}`);
  let document: unknown;
  try {
    document = JSON.parse(Buffer.from(archived.content, "base64").toString("utf8"));
  } catch (cause) {
    throw new Error(`Invalid archived projection ${plugin.plugin_id}:${file}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`Archived projection must be an object: ${plugin.plugin_id}:${file}`);
  }
  return {
    type: "projection",
    file,
    digest: archived.digest,
    document: document as Record<string, unknown>,
  };
}

function resolvedHandler(
  plugin: ActivePluginRecord,
  handler: ActivePluginRecord["descriptor"]["manifest"]["tools"][number]["handler"],
): HomerailPluginResolvedHandlerV1 {
  if (handler.type === "projection") return archivedProjectionHandler(plugin, handler.file);
  return structuredClone(handler);
}

function enabledPlugins(state: PluginRegistryState): ActivePluginRecord[] {
  return state.plugins
    .filter((plugin) => plugin.activation.enabled)
    .sort((left, right) => left.plugin_id.localeCompare(right.plugin_id));
}

export function assemblePluginTurnContext(
  state?: PluginRegistryState,
): HomerailPluginTurnContextV1 {
  if (!state) syncBuiltinPlugins();
  const registry = state ?? getPluginRegistryState();
  const plugins = enabledPlugins(registry);
  const localToolCounts = new Map<string, number>();
  for (const plugin of plugins) {
    for (const tool of plugin.descriptor.manifest.tools) {
      localToolCounts.set(tool.id, (localToolCounts.get(tool.id) ?? 0) + 1);
    }
  }

  const skills: HomerailPluginSkillDescriptorV1[] = [];
  const tools: HomerailPluginToolDescriptorV1[] = [];
  const actions: HomerailPluginTurnContextV1["actions"] = [];
  for (const plugin of plugins) {
    const { manifest } = plugin.descriptor;
    const schemas = new Map(plugin.descriptor.schemas.map((schema) => [schema.id, schema.schema]));
    for (const skill of plugin.descriptor.skills) {
      const declaration = manifest.skills.find((entry) => entry.id === skill.id);
      if (!declaration) throw new Error(`Missing Skill declaration: ${manifest.id}:${skill.id}`);
      skills.push({
        plugin_id: manifest.id,
        plugin_version: manifest.version,
        local_id: skill.id,
        qualified_id: qualified(manifest.id, skill.id),
        capability_ids: manifest.capabilities
          .filter((capability) => capability.skill === skill.id)
          .map((capability) => qualified(manifest.id, capability.id))
          .sort(),
        description: declaration.description,
        digest: skill.digest,
      });
    }
    for (const tool of manifest.tools) {
      // M3 has no Permission Broker. A permission-bearing Tool is deliberately
      // unavailable until effective grants can be bound into this snapshot.
      if (tool.permissions.length) continue;
      const inputSchema = schemas.get(tool.input_schema);
      const outputSchema = tool.output_schema ? schemas.get(tool.output_schema) : undefined;
      if (!inputSchema || (tool.output_schema && !outputSchema)) {
        throw new Error(`Missing resolved Tool schema: ${manifest.id}:${tool.id}`);
      }
      tools.push({
        plugin_id: manifest.id,
        plugin_version: manifest.version,
        local_id: tool.id,
        qualified_id: qualified(manifest.id, tool.id),
        wire_id: localToolCounts.get(tool.id) === 1 ? tool.id : collisionWireId(manifest.id, tool.id),
        capability_ids: manifest.capabilities
          .filter((capability) => capability.tools.includes(tool.id))
          .map((capability) => qualified(manifest.id, capability.id))
          .sort(),
        description: tool.description,
        input_schema: structuredClone(inputSchema),
        ...(outputSchema ? { output_schema: structuredClone(outputSchema) } : {}),
        effect: tool.effect,
        permissions: [],
        confirmation: tool.confirmation,
        handler: resolvedHandler(plugin, tool.handler),
      });
    }
    for (const action of manifest.actions) {
      actions.push({
        plugin_id: manifest.id,
        plugin_version: manifest.version,
        local_id: action.id,
        qualified_id: qualified(manifest.id, action.id),
        capability_ids: manifest.capabilities
          .filter((capability) => capability.actions.includes(action.id))
          .map((capability) => qualified(manifest.id, capability.id))
          .sort(),
        intent: action.intent,
      });
    }
  }
  skills.sort((left, right) => left.qualified_id.localeCompare(right.qualified_id));
  tools.sort((left, right) => left.qualified_id.localeCompare(right.qualified_id));
  actions.sort((left, right) => left.qualified_id.localeCompare(right.qualified_id));
  const unsigned = {
    context_version: 1 as const,
    registry_revision: registry.revision,
    enabled_plugins: plugins.map((plugin) => ({
      id: plugin.plugin_id,
      version: plugin.plugin_version,
      manifest_digest: plugin.descriptor.manifest_digest,
    })),
    skills,
    tools,
    actions,
    permission_revision: 0,
  };
  const context: HomerailPluginTurnContextV1 = {
    ...unsigned,
    context_digest: pluginJsonDigest(unsigned),
  };
  const validation = validateHomerailPluginTurnContext(context);
  if (!validation.valid) throw new Error(`Invalid assembled Plugin Context: ${JSON.stringify(validation.errors)}`);
  return validation.value ?? context;
}

export interface ArchivedPluginSkill {
  descriptor: HomerailPluginSkillDescriptorV1;
  content: string;
  registry_fingerprint: string;
}

export function readArchivedPluginSkill(
  qualifiedId: string,
  state?: PluginRegistryState,
): ArchivedPluginSkill | undefined {
  if (!state) syncBuiltinPlugins();
  const registry = state ?? getPluginRegistryState();
  const plugin = registry.plugins.find((entry) => (
    entry.activation.enabled && qualifiedId.startsWith(`${entry.plugin_id}:`)
  ));
  if (!plugin) return undefined;
  const localId = qualifiedId.slice(plugin.plugin_id.length + 1);
  const skill = plugin.descriptor.skills.find((entry) => entry.id === localId);
  const declaration = plugin.descriptor.manifest.skills.find((entry) => entry.id === localId);
  if (!skill || !declaration) return undefined;
  return {
    descriptor: {
      plugin_id: plugin.plugin_id,
      plugin_version: plugin.plugin_version,
      local_id: localId,
      qualified_id: qualifiedId,
      capability_ids: plugin.descriptor.manifest.capabilities
        .filter((capability) => capability.skill === localId)
        .map((capability) => qualified(plugin.plugin_id, capability.id))
        .sort(),
      description: declaration.description,
      digest: skill.digest,
    },
    content: skill.content,
    registry_fingerprint: registry.fingerprint,
  };
}
