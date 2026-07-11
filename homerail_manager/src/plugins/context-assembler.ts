import { createHash } from "node:crypto";
import {
  type HomerailPluginResolvedHandlerV1,
  type HomerailPluginSkillDescriptorV1,
  type HomerailPluginModality,
  type HomerailPluginToolDescriptorV1,
  type HomerailPluginTurnContextV1,
  validateHomerailDirectUiProjection,
  validateHomerailPluginTurnContext,
} from "homerail-protocol";
import {
  getPluginRegistryState,
  listPluginPackages,
  type ActivePluginRecord,
  type PluginPackageRecord,
  type PluginRegistryState,
} from "../persistence/plugins.js";
import { pluginJsonDigest } from "./descriptor.js";
import { CORE_PLUGIN_ID, ensureBuiltinPluginsSynced } from "./registry.js";

function qualified(pluginId: string, localId: string): string {
  return `${pluginId}:${localId}`;
}

function stableWireId(pluginId: string, localId: string): string {
  const digest = createHash("sha256").update(qualified(pluginId, localId)).digest("hex").slice(0, 10);
  const suffixBudget = 64 - 2 - digest.length - 1;
  return `p_${digest}_${localId.slice(0, suffixBudget)}`;
}

function archivedProjectionHandler(
  plugin: PluginPackageRecord,
  file: string,
): Extract<HomerailPluginResolvedHandlerV1, { type: "projection" }> {
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

export function assembleLegacyWidgetReservations(): Array<{ plugin_id: string; legacy_types: string[] }> {
  const byPlugin = new Map<string, Set<string>>();
  const ownerByType = new Map<string, string>();
  for (const plugin of listPluginPackages()) {
    for (const tool of plugin.descriptor.manifest.tools) {
      if (tool.handler.type !== "projection") continue;
      const handler = archivedProjectionHandler(plugin, tool.handler.file);
      const validation = validateHomerailDirectUiProjection(handler.document);
      if (!validation.valid || !validation.value) {
        throw new Error(`Archived plugin projection is invalid: ${plugin.plugin_id}:${tool.id}`);
      }
      const bridge = validation.value.legacy_bridge;
      if (!bridge) continue;
      const owned = byPlugin.get(plugin.plugin_id) ?? new Set<string>();
      for (const legacyType of new Set([bridge.widget_type, bridge.visual])) {
        const existingOwner = ownerByType.get(legacyType);
        if (existingOwner && existingOwner !== plugin.plugin_id) {
          throw new Error(`Legacy Widget type ${legacyType} is reserved by both ${existingOwner} and ${plugin.plugin_id}`);
        }
        ownerByType.set(legacyType, plugin.plugin_id);
        owned.add(legacyType);
      }
      byPlugin.set(plugin.plugin_id, owned);
    }
  }
  return [...byPlugin.entries()]
    .map(([plugin_id, legacyTypes]) => ({ plugin_id, legacy_types: [...legacyTypes].sort() }))
    .sort((left, right) => left.plugin_id.localeCompare(right.plugin_id));
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
  options: { modality?: HomerailPluginModality; legacy_compatibility_mode?: boolean } = {},
): HomerailPluginTurnContextV1 {
  if (!state) ensureBuiltinPluginsSynced();
  const registry = state ?? getPluginRegistryState();
  const plugins = enabledPlugins(registry);
  const skills: HomerailPluginSkillDescriptorV1[] = [];
  const tools: HomerailPluginToolDescriptorV1[] = [];
  const actions: HomerailPluginTurnContextV1["actions"] = [];
  for (const plugin of plugins) {
    const { manifest } = plugin.descriptor;
    const capabilities = options.legacy_compatibility_mode && manifest.id !== CORE_PLUGIN_ID
      ? []
      : manifest.capabilities.filter((capability) => (
        !options.modality || capability.modalities.includes(options.modality)
      ));
    const schemas = new Map(plugin.descriptor.schemas.map((schema) => [schema.id, schema.schema]));
    for (const skill of plugin.descriptor.skills) {
      const skillCapabilities = capabilities.filter((capability) => capability.skill === skill.id);
      if (!skillCapabilities.length) continue;
      const declaration = manifest.skills.find((entry) => entry.id === skill.id);
      if (!declaration) throw new Error(`Missing Skill declaration: ${manifest.id}:${skill.id}`);
      skills.push({
        plugin_id: manifest.id,
        plugin_version: manifest.version,
        local_id: skill.id,
        qualified_id: qualified(manifest.id, skill.id),
        capability_ids: skillCapabilities
          .map((capability) => qualified(manifest.id, capability.id))
          .sort(),
        description: declaration.description,
        digest: skill.digest,
      });
    }
    for (const tool of manifest.tools) {
      const toolCapabilities = capabilities.filter((capability) => capability.tools.includes(tool.id));
      if (!toolCapabilities.length) continue;
      // M3 exposes only the policy subset implemented by the shared executor.
      if (
        tool.handler.type !== "projection"
        || tool.effect !== "write"
        || tool.permissions.length
        || tool.confirmation !== "never"
        || !tool.output_schema
      ) continue;
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
        wire_id: stableWireId(manifest.id, tool.id),
        capability_ids: toolCapabilities
          .map((capability) => qualified(manifest.id, capability.id))
          .sort(),
        // The harness exposes wire_id as the callable name. Keep the qualified
        // identity in the visible description so a Skill can map its stable
        // reference to that turn's exact Tool without guessing the wire name.
        description: `Plugin Tool ${qualified(manifest.id, tool.id)}. ${tool.description}`,
        input_schema: structuredClone(inputSchema),
        ...(outputSchema ? { output_schema: structuredClone(outputSchema) } : {}),
        effect: tool.effect,
        permissions: [],
        confirmation: tool.confirmation,
        handler: resolvedHandler(plugin, tool.handler),
      });
    }
    for (const action of manifest.actions) {
      const actionCapabilities = capabilities.filter((capability) => capability.actions.includes(action.id));
      if (!actionCapabilities.length) continue;
      actions.push({
        plugin_id: manifest.id,
        plugin_version: manifest.version,
        local_id: action.id,
        qualified_id: qualified(manifest.id, action.id),
        capability_ids: actionCapabilities
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

export interface ExactArchivedPluginSkillRef {
  plugin_id: string;
  plugin_version: string;
  local_id: string;
  qualified_id: string;
  digest: string;
}

export function readExactArchivedPluginSkill(
  reference: ExactArchivedPluginSkillRef,
): ArchivedPluginSkill | undefined {
  if (reference.qualified_id !== qualified(reference.plugin_id, reference.local_id)) return undefined;
  const plugin = listPluginPackages().find((entry) => (
    entry.plugin_id === reference.plugin_id && entry.plugin_version === reference.plugin_version
  ));
  if (!plugin) return undefined;
  const skill = plugin.descriptor.skills.find((entry) => (
    entry.id === reference.local_id && entry.digest === reference.digest
  ));
  const declaration = plugin.descriptor.manifest.skills.find((entry) => entry.id === reference.local_id);
  if (!skill || !declaration) return undefined;
  return {
    descriptor: {
      plugin_id: plugin.plugin_id,
      plugin_version: plugin.plugin_version,
      local_id: reference.local_id,
      qualified_id: reference.qualified_id,
      capability_ids: plugin.descriptor.manifest.capabilities
        .filter((capability) => capability.skill === reference.local_id)
        .map((capability) => qualified(plugin.plugin_id, capability.id))
        .sort(),
      description: declaration.description,
      digest: skill.digest,
    },
    content: skill.content,
    registry_fingerprint: getPluginRegistryState().fingerprint,
  };
}

export function readArchivedPluginSkill(
  qualifiedId: string,
  state?: PluginRegistryState,
): ArchivedPluginSkill | undefined {
  if (!state) ensureBuiltinPluginsSynced();
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
