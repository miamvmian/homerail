import * as http from "node:http";
import { getGenerativeUiKindRegistry } from "../generative-ui/kind-registry.js";
import { assemblePluginTurnContext } from "../plugins/context-assembler.js";
import { HomerailPluginRegistry } from "../plugins/registry.js";
import { emit } from "../events/bus.js";

const MAX_BODY_BYTES = 8 * 1024;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function cacheableJson(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  etag: string,
  body: unknown,
): void {
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304);
    res.end();
    return;
  }
  json(res, 200, body);
}

function registryUnavailable(res: http.ServerResponse, cause: unknown): void {
  console.error("plugin registry request failed", cause);
  json(res, 500, { success: false, error: "Plugin registry is unavailable" });
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("Plugin request body is too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (bytes > MAX_BODY_BYTES) return;
      try {
        const value = JSON.parse(body || "{}") as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("body must be an object");
        resolve(value as Record<string, unknown>);
      } catch (cause) {
        reject(cause);
      }
    });
    req.on("error", reject);
  });
}

function listResponse(registry: HomerailPluginRegistry): Record<string, unknown> {
  const state = registry.snapshot();
  return {
    registry_revision: state.revision,
    registry_fingerprint: state.fingerprint,
    plugins: state.plugins.map((plugin) => ({
      id: plugin.plugin_id,
      name: plugin.descriptor.manifest.name,
      version: plugin.plugin_version,
      package_digest: plugin.package_digest,
      manifest_digest: plugin.descriptor.manifest_digest,
      source: plugin.source,
      enabled: plugin.activation.enabled,
      locked: plugin.activation.locked,
      activation_revision: plugin.activation.revision,
      capabilities: plugin.descriptor.manifest.capabilities.map((entry) => entry.id),
      skills: plugin.descriptor.manifest.skills.map((entry) => entry.id),
      tools: plugin.descriptor.manifest.tools.map((entry) => entry.id),
      kinds: plugin.descriptor.manifest.kinds.map((entry) => entry.kind),
      renderers: plugin.descriptor.manifest.renderers.map((entry) => entry.id),
      actions: plugin.descriptor.manifest.actions.map((entry) => entry.id),
    })),
  };
}

export function pluginRoutesHandler(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = new URL(req.url || "/", "http://localhost");
  const registry = new HomerailPluginRegistry();
  if (url.pathname === "/api/plugins" && req.method === "GET") {
    try {
      const data = listResponse(registry);
      cacheableJson(req, res, `"plugins-${String(data.registry_fingerprint)}"`, { success: true, data });
    } catch (cause) {
      registryUnavailable(res, cause);
    }
    return true;
  }
  if (url.pathname === "/api/plugins/context" && req.method === "GET") {
    try {
      const data = assemblePluginTurnContext(registry.snapshot());
      cacheableJson(req, res, `"plugin-context-${data.context_digest}"`, { success: true, data });
    } catch (cause) {
      registryUnavailable(res, cause);
    }
    return true;
  }
  if (url.pathname === "/api/plugins/ui-registry" && req.method === "GET") {
    try {
      registry.syncBuiltins();
      const data = getGenerativeUiKindRegistry().uiProjection();
      cacheableJson(req, res, `"plugin-ui-${data.registry_fingerprint}"`, { success: true, data });
    } catch (cause) {
      registryUnavailable(res, cause);
    }
    return true;
  }
  const match = url.pathname.match(/^\/api\/plugins\/([^/]+)\/enabled$/);
  if (!match) return false;
  if (req.method !== "PUT") {
    json(res, 405, { success: false, error: "Plugin activation requires PUT" });
    return true;
  }
  let pluginId: string;
  try {
    pluginId = decodeURIComponent(match[1]);
  } catch {
    json(res, 400, { success: false, error: "Invalid plugin id" });
    return true;
  }
  readBody(req).then((body) => {
    if (typeof body.enabled !== "boolean" || Object.keys(body).some((key) => key !== "enabled")) {
      json(res, 400, { success: false, error: "Plugin activation body must contain only boolean enabled" });
      return;
    }
    const before = registry.snapshot();
    const activation = registry.setEnabled(pluginId, body.enabled);
    const after = registry.snapshot();
    if (before.fingerprint !== after.fingerprint) {
      emit("plugin:registry_changed", {
        plugin_id: pluginId,
        enabled: activation.enabled,
        registry_revision: after.revision,
        registry_fingerprint: after.fingerprint,
      });
    }
    json(res, 200, {
      success: true,
      data: {
        activation,
        registry: listResponse(registry),
      },
    });
  }).catch((cause) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    json(res, message.includes("not installed") ? 404 : message.includes("locked") ? 409 : 400, {
      success: false,
      error: message,
    });
  });
  return true;
}
