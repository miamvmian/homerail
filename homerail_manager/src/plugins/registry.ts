import type {
  HomerailResolvedPluginDescriptorV1,
} from "homerail-protocol";
import {
  getPluginRegistryState,
  setPluginEnabled,
  syncPluginPackage,
  type ActivePluginRecord,
  type PluginActivationRecord,
  type PluginRegistryState,
} from "../persistence/plugins.js";
import {
  getBuiltinPluginRoot,
  listBuiltinPluginPackageRoots,
  loadPluginPackage,
} from "./manifest-loader.js";

export const CORE_PLUGIN_ID = "com.homerail.core" as const;

/** Precompiled components are a finite host catalog, never manifest imports. */
export const M3_BUILTIN_RENDERER_IDS: ReadonlySet<string> = new Set([
  "core-legacy-widget",
  "topic-outline",
]);

const TRUSTED_BUILTIN_IDS: ReadonlySet<string> = new Set([CORE_PLUGIN_ID]);

export interface SyncBuiltinPluginsResult {
  root: string;
  plugins: ActivePluginRecord[];
}

export function syncBuiltinPlugins(root = getBuiltinPluginRoot()): SyncBuiltinPluginsResult {
  const descriptors: HomerailResolvedPluginDescriptorV1[] = listBuiltinPluginPackageRoots(root)
    .map((packageRoot) => loadPluginPackage(packageRoot, {
      source: "builtin",
      trusted_builtin_ids: TRUSTED_BUILTIN_IDS,
      builtin_renderer_ids: M3_BUILTIN_RENDERER_IDS,
    }))
    .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
  const seen = new Set<string>();
  const plugins = descriptors.map((descriptor) => {
    if (seen.has(descriptor.manifest.id)) {
      throw new Error(`Multiple bundled packages declare plugin id: ${descriptor.manifest.id}`);
    }
    seen.add(descriptor.manifest.id);
    return syncPluginPackage({
      descriptor,
      source: "builtin",
      locked: descriptor.manifest.id === CORE_PLUGIN_ID,
      default_enabled: true,
    });
  });
  if (!seen.has(CORE_PLUGIN_ID)) {
    throw new Error(`Missing locked builtin plugin: ${CORE_PLUGIN_ID}`);
  }
  return { root, plugins };
}

export class HomerailPluginRegistry {
  readonly #builtinRoot: string;

  constructor(builtinRoot = getBuiltinPluginRoot()) {
    this.#builtinRoot = builtinRoot;
  }

  syncBuiltins(): SyncBuiltinPluginsResult {
    return syncBuiltinPlugins(this.#builtinRoot);
  }

  snapshot(): PluginRegistryState {
    this.syncBuiltins();
    return getPluginRegistryState();
  }

  setEnabled(pluginId: string, enabled: boolean): PluginActivationRecord {
    this.syncBuiltins();
    return setPluginEnabled(pluginId, enabled);
  }
}
