import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _clearAllServers as clearGitServers,
  createServer as createGitServer,
  getServerRaw as getGitServerRaw,
  listServers as listGitServers,
} from "../src/persistence/git-servers.js";
import {
  _clearAllServers as clearMcpServers,
  createServer as createMcpServer,
  listServers as listMcpServers,
  toPublicServer,
} from "../src/persistence/mcp-servers.js";
import { getDb } from "../src/persistence/db.js";
import { createServer as createHttpServer } from "../src/server/http.js";

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr !== "object") throw new Error("server did not bind");
  return addr.port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function tableText(table: "git_servers" | "mcp_servers"): string {
  return JSON.stringify(getDb().prepare(`SELECT data FROM ${table}`).all());
}

describe("Manager encrypted secret storage", () => {
  let tmpHome: string;
  let oldHome: string | undefined;
  let oldManagerSecretKey: string | undefined;
  let oldSecretKey: string | undefined;

  beforeEach(() => {
    oldHome = process.env.HOMERAIL_HOME;
    oldManagerSecretKey = process.env.HOMERAIL_MANAGER_SECRET_KEY;
    oldSecretKey = process.env.HOMERAIL_SECRET_KEY;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-manager-secrets-"));
    process.env.HOMERAIL_HOME = tmpHome;
    delete process.env.HOMERAIL_MANAGER_SECRET_KEY;
    delete process.env.HOMERAIL_SECRET_KEY;
    clearGitServers();
    clearMcpServers();
  });

  afterEach(() => {
    clearGitServers();
    clearMcpServers();
    restoreEnv("HOMERAIL_HOME", oldHome);
    restoreEnv("HOMERAIL_MANAGER_SECRET_KEY", oldManagerSecretKey);
    restoreEnv("HOMERAIL_SECRET_KEY", oldSecretKey);
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("encrypts Git server tokens at rest while keeping raw tokens internal", () => {
    const created = createGitServer({
      name: "local-gitea",
      platform_type: "gitea",
      api_endpoint: "http://gitea.example.test",
      token: "gitea-token-secret-123456",
    });

    expect(created.token_masked).toBe("gite****3456");
    expect(JSON.stringify(listGitServers())).not.toContain("gitea-token-secret-123456");
    expect(getGitServerRaw(created.server_id)?.token).toBe("gitea-token-secret-123456");

    const stored = tableText("git_servers");
    expect(stored).not.toContain("gitea-token-secret-123456");
    expect(stored).toContain("token_encrypted");
    expect(stored).toContain("manager_encrypted");
  });

  it("migrates legacy plaintext Git server DB rows to encrypted storage", () => {
    getDb().prepare("INSERT INTO git_servers(server_id, updated_at, data) VALUES (?, ?, ?)").run(
      "legacy-git",
      "2026-01-01T00:00:00.000Z",
      JSON.stringify({
        server_id: "legacy-git",
        name: "legacy",
        platform_type: "gitea",
        api_endpoint: "http://gitea.example.test",
        token: "legacy-git-token-secret",
        git_user_name: null,
        git_user_email: null,
        is_active: true,
        token_valid: false,
        last_verified: null,
        user_info: null,
        description: "",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
    );

    expect(getGitServerRaw("legacy-git")?.token).toBe("legacy-git-token-secret");
    const migrated = tableText("git_servers");
    expect(migrated).not.toContain("legacy-git-token-secret");
    expect(migrated).toContain("token_encrypted");
  });

  it("encrypts MCP environment values at rest and masks secret-looking public values", () => {
    const server = createMcpServer({
      name: "stdio-tools",
      type: "STDIO",
      command: "node",
      environment_variables: JSON.stringify({
        API_TOKEN: "mcp-token-secret-123456",
        LOG_LEVEL: "debug",
      }),
    });

    const raw = listMcpServers().find((entry) => entry.id === server.id);
    expect(raw?.environment_variables?.API_TOKEN).toBe("mcp-token-secret-123456");
    expect(raw?.environment_variables?.LOG_LEVEL).toBe("debug");

    const publicServer = toPublicServer(server);
    expect(publicServer.environment_variables).toEqual({
      API_TOKEN: "mcp-****3456",
      LOG_LEVEL: "debug",
    });

    const stored = tableText("mcp_servers");
    expect(stored).not.toContain("mcp-token-secret-123456");
    expect(stored).not.toContain("debug");
    expect(stored).toContain("environment_variables_encrypted");
  });

  it("returns masked MCP environment values from the HTTP API", async () => {
    const httpServer = createHttpServer(0, undefined, undefined, false);
    try {
      const port = await listen(httpServer);
      const response = await fetch(`http://127.0.0.1:${port}/api/api/mcp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "stdio-tools",
          type: "STDIO",
          command: "node",
          environment_variables: JSON.stringify({
            PASSWORD: "super-secret-password",
            MODE: "test",
          }),
        }),
      });
      const body = await response.json() as {
        success: boolean;
        data: { environment_variables: Record<string, string> };
      };

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.environment_variables).toEqual({
        PASSWORD: "supe****word",
        MODE: "test",
      });
      expect(JSON.stringify(body)).not.toContain("super-secret-password");
    } finally {
      await close(httpServer);
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
