import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribe, type PluginRegistryChangedPayload } from "../src/events/bus.js";
import { closeDb, getDb } from "../src/persistence/db.js";
import { HomerailPluginRegistry } from "../src/plugins/registry.js";
import { createServer } from "../src/server/http.js";

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("server did not bind");
  return address.port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("plugin registry routes", () => {
  let server: http.Server;
  let baseUrl: string;
  let tmpHome: string;
  let previousHome: string | undefined;
  let previousAutostart: string | undefined;

  beforeEach(async () => {
    closeDb();
    previousHome = process.env.HOMERAIL_HOME;
    previousAutostart = process.env.HOMERAIL_LOCAL_NODE_AUTOSTART;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-plugin-routes-"));
    process.env.HOMERAIL_HOME = tmpHome;
    process.env.HOMERAIL_LOCAL_NODE_AUTOSTART = "0";
    server = createServer(0, undefined, undefined, false);
    baseUrl = `http://127.0.0.1:${await listen(server)}`;
  });

  afterEach(async () => {
    if (server.listening) await close(server);
    closeDb();
    if (previousHome === undefined) delete process.env.HOMERAIL_HOME;
    else process.env.HOMERAIL_HOME = previousHome;
    if (previousAutostart === undefined) delete process.env.HOMERAIL_LOCAL_NODE_AUTOSTART;
    else process.env.HOMERAIL_LOCAL_NODE_AUTOSTART = previousAutostart;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("lists, caches, disables, persists, and re-enables an optional builtin", async () => {
    const first = await fetch(`${baseUrl}/api/plugins`);
    const firstEtag = first.headers.get("etag")!;
    const firstBody = await first.json() as { data: { registry_fingerprint: string; plugins: Array<Record<string, unknown>> } };
    expect(first.status).toBe(200);
    expect(firstBody.data.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "com.homerail.core", enabled: true, locked: true }),
      expect.objectContaining({ id: "com.homerail.topic-outline", enabled: true, locked: false }),
    ]));
    expect((await fetch(`${baseUrl}/api/plugins`, { headers: { "If-None-Match": firstEtag } })).status).toBe(304);

    const enabledContextResponse = await fetch(`${baseUrl}/api/plugins/context`);
    const enabledContext = await enabledContextResponse.json() as {
      data: { skills: Array<{ plugin_id: string; plugin_version: string; qualified_id: string; digest: string }> };
    };
    const topicSkill = enabledContext.data.skills.find((skill) => skill.plugin_id === "com.homerail.topic-outline")!;
    const localOnly = await (await fetch(`${baseUrl}/api/skills?local_only=1`)).json() as {
      data: { skills: Array<{ source: string }> };
    };
    expect(localOnly.data.skills.some((skill) => skill.source === "plugin")).toBe(false);

    const events: PluginRegistryChangedPayload[] = [];
    const unsubscribe = subscribe("plugin:registry_changed", (payload) => {
      events.push(payload as PluginRegistryChangedPayload);
    });
    const disabled = await fetch(`${baseUrl}/api/plugins/com.homerail.topic-outline/enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    unsubscribe();
    expect(disabled.status).toBe(200);
    expect(events).toEqual([expect.objectContaining({
      plugin_id: "com.homerail.topic-outline",
      enabled: false,
    })]);

    const changed = await fetch(`${baseUrl}/api/plugins`, { headers: { "If-None-Match": firstEtag } });
    const changedEtag = changed.headers.get("etag")!;
    const changedBody = await changed.json() as { data: { registry_fingerprint: string; plugins: Array<Record<string, unknown>> } };
    expect(changed.status).toBe(200);
    expect(changedEtag).not.toBe(firstEtag);
    expect(changedBody.data.registry_fingerprint).not.toBe(firstBody.data.registry_fingerprint);
    expect(changedBody.data.plugins).toContainEqual(expect.objectContaining({
      id: "com.homerail.topic-outline",
      enabled: false,
      activation_revision: 2,
    }));
    expect((await fetch(`${baseUrl}/api/plugins`, { headers: { "If-None-Match": changedEtag } })).status).toBe(304);

    const context = await (await fetch(`${baseUrl}/api/plugins/context`)).json() as {
      data: { skills: Array<{ plugin_id: string }>; tools: Array<{ plugin_id: string }> };
    };
    expect(context.data.skills.some((skill) => skill.plugin_id === "com.homerail.topic-outline")).toBe(false);
    expect(context.data.tools.some((tool) => tool.plugin_id === "com.homerail.topic-outline")).toBe(false);
    expect((await fetch(`${baseUrl}/api/skills/${encodeURIComponent(topicSkill.qualified_id)}`)).status).toBe(404);
    const exactSkill = await fetch(
      `${baseUrl}/api/skills/${encodeURIComponent(topicSkill.qualified_id)}`
      + `?plugin_version=${encodeURIComponent(topicSkill.plugin_version)}&digest=${topicSkill.digest}`,
    );
    const exactSkillBody = await exactSkill.json() as { data: { content: string; digest: string } };
    expect(exactSkill.status).toBe(200);
    expect(exactSkillBody.data.digest).toBe(topicSkill.digest);
    expect(exactSkillBody.data.content).toContain("# Topic Outline");
    expect((await fetch(
      `${baseUrl}/api/skills/${encodeURIComponent(topicSkill.qualified_id)}`
      + `?plugin_version=1.0.0-beta.1&digest=${topicSkill.digest}`,
    )).status).toBe(404);
    expect((await fetch(
      `${baseUrl}/api/skills/${encodeURIComponent(topicSkill.qualified_id)}`
      + `?plugin_version=1.0&digest=${topicSkill.digest}`,
    )).status).toBe(400);

    const uiResponse = await fetch(`${baseUrl}/api/plugins/ui-registry`);
    const uiEtag = uiResponse.headers.get("etag")!;
    const ui = await uiResponse.json() as {
      data: { kinds: Array<Record<string, unknown>>; renderers: Array<Record<string, unknown>> };
    };
    expect(ui.data.kinds).toContainEqual(expect.objectContaining({
      kind: "com.homerail.topic-outline/outline",
      enabled: false,
    }));
    expect(ui.data.renderers).toContainEqual(expect.objectContaining({
      renderer_id: "topic-outline-main",
      enabled: false,
    }));
    expect((await fetch(`${baseUrl}/api/plugins/ui-registry`, { headers: { "If-None-Match": uiEtag } })).status)
      .toBe(304);

    closeDb();
    expect(new HomerailPluginRegistry().snapshot().plugins.find((plugin) => (
      plugin.plugin_id === "com.homerail.topic-outline"
    ))?.activation).toMatchObject({ enabled: false, revision: 2 });

    const enabled = await fetch(`${baseUrl}/api/plugins/com.homerail.topic-outline/enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(enabled.status).toBe(200);
  });

  it("rejects locked, unknown, malformed, and unsupported activation requests", async () => {
    expect((await fetch(`${baseUrl}/api/plugins/com.homerail.core/enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    })).status).toBe(409);
    expect((await fetch(`${baseUrl}/api/plugins/com.example.missing/enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    })).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/plugins/com.homerail.topic-outline/enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: "no" }),
    })).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/plugins/com.homerail.topic-outline/enabled`, {
      method: "POST",
    })).status).toBe(405);
  });

  it("commits activation and notifies later subscribers when one event listener fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const delivered: PluginRegistryChangedPayload[] = [];
    const unsubscribeThrowing = subscribe("plugin:registry_changed", () => {
      throw new Error("broken event sink");
    });
    const unsubscribeHealthy = subscribe("plugin:registry_changed", (payload) => {
      delivered.push(payload as PluginRegistryChangedPayload);
    });
    try {
      const response = await fetch(`${baseUrl}/api/plugins/com.homerail.topic-outline/enabled`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      expect(response.status).toBe(200);
      expect(delivered).toEqual([expect.objectContaining({
        plugin_id: "com.homerail.topic-outline",
        enabled: false,
      })]);
      expect(error).toHaveBeenCalledWith(
        "event listener failed for plugin:registry_changed",
        expect.any(Error),
      );
      expect(new HomerailPluginRegistry().snapshot().plugins.find((plugin) => (
        plugin.plugin_id === "com.homerail.topic-outline"
      ))?.activation.enabled).toBe(false);
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    } finally {
      unsubscribeThrowing();
      unsubscribeHealthy();
      error.mockRestore();
    }
  });

  it("returns a structured 500 for corrupted registry state without terminating the server", async () => {
    expect((await fetch(`${baseUrl}/api/plugins`)).status).toBe(200);
    getDb().prepare(`
      UPDATE plugin_packages SET resolved_descriptor_json = ? WHERE plugin_id = ?
    `).run("{}", "com.homerail.topic-outline");

    const failed = await fetch(`${baseUrl}/api/plugins`);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      success: false,
      error: "Plugin registry is unavailable",
    });
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
  });
});
