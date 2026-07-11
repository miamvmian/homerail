import {
  validateHomerailPluginManifest,
  type HomerailResolvedPluginDescriptorV1,
} from "homerail-protocol";
import { validateResolvedPluginDescriptor, pluginJsonDigest } from "../plugins/descriptor.js";
import { encodeJson, getDb, parseJsonRow } from "./db.js";
import { nowIso } from "./time.js";

export type PluginPackageSource = "builtin" | "installed" | "development";

interface PluginPackageRow {
  plugin_id: string;
  plugin_version: string;
  manifest_version: number;
  package_digest: string;
  manifest_json: string;
  resolved_descriptor_json: string;
  source: PluginPackageSource;
  installed_at: string;
}

interface PluginActivationRow {
  plugin_id: string;
  active_version: string;
  enabled: number;
  locked: number;
  revision: number;
  updated_at: string;
}

interface ActivePluginRow extends PluginPackageRow, PluginActivationRow {}

export interface PluginPackageRecord {
  plugin_id: string;
  plugin_version: string;
  package_digest: string;
  source: PluginPackageSource;
  installed_at: string;
  descriptor: HomerailResolvedPluginDescriptorV1;
}

export interface PluginActivationRecord {
  plugin_id: string;
  active_version: string;
  enabled: boolean;
  locked: boolean;
  revision: number;
  updated_at: string;
}

export interface ActivePluginRecord extends PluginPackageRecord {
  activation: PluginActivationRecord;
}

export interface PluginRegistryState {
  revision: number;
  fingerprint: string;
  plugins: ActivePluginRecord[];
}

function decodePackage(row: PluginPackageRow): PluginPackageRecord {
  const manifest = parseJsonRow<unknown>(row.manifest_json);
  const descriptor = parseJsonRow<HomerailResolvedPluginDescriptorV1>(row.resolved_descriptor_json);
  const manifestValidation = validateHomerailPluginManifest(manifest);
  const descriptorErrors = validateResolvedPluginDescriptor(descriptor);
  if (
    !manifestValidation.valid
    || !manifestValidation.value
    || descriptorErrors.length
    || descriptor.manifest.id !== row.plugin_id
    || descriptor.manifest.version !== row.plugin_version
    || descriptor.manifest.manifest_version !== row.manifest_version
    || descriptor.package_digest !== row.package_digest
    || descriptor.manifest_digest !== pluginJsonDigest(manifestValidation.value, 512 * 1024)
    || JSON.stringify(descriptor.manifest) !== JSON.stringify(manifestValidation.value)
  ) {
    throw new Error(`Invalid persisted plugin package: ${row.plugin_id}@${row.plugin_version}`);
  }
  return {
    plugin_id: row.plugin_id,
    plugin_version: row.plugin_version,
    package_digest: row.package_digest,
    source: row.source,
    installed_at: row.installed_at,
    descriptor: structuredClone(descriptor),
  };
}

function decodeActivation(row: PluginActivationRow): PluginActivationRecord {
  if (
    !Number.isInteger(row.revision)
    || row.revision < 1
    || (row.enabled !== 0 && row.enabled !== 1)
    || (row.locked !== 0 && row.locked !== 1)
    || (row.locked === 1 && row.enabled !== 1)
  ) {
    throw new Error(`Invalid persisted plugin activation: ${row.plugin_id}`);
  }
  return {
    plugin_id: row.plugin_id,
    active_version: row.active_version,
    enabled: row.enabled === 1,
    locked: row.locked === 1,
    revision: row.revision,
    updated_at: row.updated_at,
  };
}

function activeRow(pluginId: string): ActivePluginRow | undefined {
  return getDb().prepare(`
    SELECT p.plugin_id, p.plugin_version, p.manifest_version, p.package_digest,
           p.manifest_json, p.resolved_descriptor_json, p.source, p.installed_at,
           a.active_version, a.enabled, a.locked, a.revision, a.updated_at
    FROM plugin_activations a
    JOIN plugin_packages p
      ON p.plugin_id = a.plugin_id AND p.plugin_version = a.active_version
    WHERE a.plugin_id = ?
  `).get(pluginId) as ActivePluginRow | undefined;
}

function decodeActive(row: ActivePluginRow): ActivePluginRecord {
  return {
    ...decodePackage(row),
    activation: decodeActivation(row),
  };
}

export function syncPluginPackage(input: {
  descriptor: HomerailResolvedPluginDescriptorV1;
  source: PluginPackageSource;
  locked?: boolean;
  default_enabled?: boolean;
  timestamp?: string;
}): ActivePluginRecord {
  const errors = validateResolvedPluginDescriptor(input.descriptor);
  if (errors.length) throw new Error(`Cannot persist invalid plugin descriptor: ${JSON.stringify(errors)}`);
  const { manifest } = input.descriptor;
  const locked = input.locked ?? false;
  const defaultEnabled = locked || (input.default_enabled ?? false);
  if (locked && input.source !== "builtin") throw new Error("Only builtin plugins may be locked");
  const timestamp = input.timestamp ?? nowIso();

  return getDb().transaction(() => {
    const existingPackage = getDb().prepare(`
      SELECT plugin_id, plugin_version, manifest_version, package_digest,
             manifest_json, resolved_descriptor_json, source, installed_at
      FROM plugin_packages
      WHERE plugin_id = ? AND plugin_version = ?
    `).get(manifest.id, manifest.version) as PluginPackageRow | undefined;
    if (existingPackage) {
      const decoded = decodePackage(existingPackage);
      if (decoded.package_digest !== input.descriptor.package_digest) {
        throw new Error(`Plugin package digest collision: ${manifest.id}@${manifest.version}`);
      }
    } else {
      getDb().prepare(`
        INSERT INTO plugin_packages(
          plugin_id, plugin_version, manifest_version, package_digest,
          manifest_json, resolved_descriptor_json, source, installed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        manifest.id,
        manifest.version,
        manifest.manifest_version,
        input.descriptor.package_digest,
        encodeJson(manifest),
        encodeJson(input.descriptor),
        input.source,
        timestamp,
      );
    }

    const activation = getDb().prepare(`
      SELECT plugin_id, active_version, enabled, locked, revision, updated_at
      FROM plugin_activations WHERE plugin_id = ?
    `).get(manifest.id) as PluginActivationRow | undefined;
    if (!activation) {
      getDb().prepare(`
        INSERT INTO plugin_activations(
          plugin_id, active_version, enabled, locked, revision, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?)
      `).run(manifest.id, manifest.version, defaultEnabled ? 1 : 0, locked ? 1 : 0, timestamp);
    } else {
      const current = decodeActivation(activation);
      const nextLocked = current.locked || locked;
      const nextEnabled = nextLocked ? true : current.enabled;
      if (
        current.active_version !== manifest.version
        || current.locked !== nextLocked
        || current.enabled !== nextEnabled
      ) {
        getDb().prepare(`
          UPDATE plugin_activations
          SET active_version = ?, enabled = ?, locked = ?, revision = revision + 1, updated_at = ?
          WHERE plugin_id = ?
        `).run(manifest.version, nextEnabled ? 1 : 0, nextLocked ? 1 : 0, timestamp, manifest.id);
      }
    }
    return decodeActive(activeRow(manifest.id)!);
  }).immediate();
}

export function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
  timestamp = nowIso(),
): PluginActivationRecord {
  return getDb().transaction(() => {
    const row = getDb().prepare(`
      SELECT plugin_id, active_version, enabled, locked, revision, updated_at
      FROM plugin_activations WHERE plugin_id = ?
    `).get(pluginId) as PluginActivationRow | undefined;
    if (!row) throw new Error(`Plugin is not installed: ${pluginId}`);
    const current = decodeActivation(row);
    if (current.locked && !enabled) throw new Error(`Plugin is locked and cannot be disabled: ${pluginId}`);
    if (current.enabled === enabled) return current;
    getDb().prepare(`
      UPDATE plugin_activations
      SET enabled = ?, revision = revision + 1, updated_at = ?
      WHERE plugin_id = ? AND revision = ?
    `).run(enabled ? 1 : 0, timestamp, pluginId, current.revision);
    return decodeActivation(getDb().prepare(`
      SELECT plugin_id, active_version, enabled, locked, revision, updated_at
      FROM plugin_activations WHERE plugin_id = ?
    `).get(pluginId) as PluginActivationRow);
  }).immediate();
}

export function listPluginPackages(): PluginPackageRecord[] {
  const rows = getDb().prepare(`
    SELECT plugin_id, plugin_version, manifest_version, package_digest,
           manifest_json, resolved_descriptor_json, source, installed_at
    FROM plugin_packages
    ORDER BY plugin_id, plugin_version
  `).all() as PluginPackageRow[];
  return rows.map(decodePackage);
}

export function getPluginRegistryState(): PluginRegistryState {
  const rows = getDb().prepare(`
    SELECT p.plugin_id, p.plugin_version, p.manifest_version, p.package_digest,
           p.manifest_json, p.resolved_descriptor_json, p.source, p.installed_at,
           a.active_version, a.enabled, a.locked, a.revision, a.updated_at
    FROM plugin_activations a
    JOIN plugin_packages p
      ON p.plugin_id = a.plugin_id AND p.plugin_version = a.active_version
    ORDER BY p.plugin_id
  `).all() as ActivePluginRow[];
  const plugins = rows.map(decodeActive);
  return {
    revision: plugins.reduce((total, plugin) => total + plugin.activation.revision, 0),
    fingerprint: pluginJsonDigest(plugins.map((plugin) => ({
      id: plugin.plugin_id,
      version: plugin.plugin_version,
      digest: plugin.package_digest,
      enabled: plugin.activation.enabled,
      locked: plugin.activation.locked,
      revision: plugin.activation.revision,
    }))),
    plugins,
  };
}

export function getActivePlugin(pluginId: string): ActivePluginRecord | undefined {
  const row = activeRow(pluginId);
  return row ? decodeActive(row) : undefined;
}
