import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseDAGYaml } from "../src/orchestration/yaml-loader.js";
import { closeDb } from "../src/persistence/db.js";
import { _clearAllPersistence } from "../src/persistence/store.js";
import { _clearActiveRuns, createActiveRun } from "../src/runtime/active-runs.js";
import { createServer } from "../src/server/http.js";

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr !== "object") throw new Error("server did not bind");
  return addr.port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function createTestRun(runId: string): void {
  const dag = parseDAGYaml(`
name: audit-summary-test
workflow_id: audit-summary-test
agents:
  worker:
    agent_type: deterministic
    system: HANDOFF port=done content=ok
nodes:
  work:
    agent: worker
    after: []
    outputs:
      done:
        to: ""
`);
  createActiveRun(runId, dag);
}

describe("audit summary", () => {
  let server: http.Server;
  let tmpHome: string;
  let oldHome: string | undefined;

  beforeEach(() => {
    oldHome = process.env.HOMERAIL_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-audit-summary-"));
    process.env.HOMERAIL_HOME = tmpHome;
    _clearActiveRuns();
    _clearAllPersistence();
    server = createServer(0, undefined, undefined, false);
  });

  afterEach(async () => {
    _clearActiveRuns();
    _clearAllPersistence();
    await close(server);
    if (oldHome === undefined) {
      delete process.env.HOMERAIL_HOME;
    } else {
      process.env.HOMERAIL_HOME = oldHome;
    }
    closeDb();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("marks missing usage as unavailable instead of reporting fake zero cost", async () => {
    const port = await listen(server);
    createTestRun("audit-run-1");

    const response = await fetch(`http://127.0.0.1:${port}/api/runs/audit-run-1/audit/summary`);
    const body = await response.json() as {
      success: boolean;
      data: {
        total_cost_usd: number | null;
        usage_available: boolean;
        agents: Array<{
          token_usage: unknown;
          usage_available: boolean;
          cost_usd: number | null;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total_cost_usd).toBeNull();
    expect(body.data.usage_available).toBe(false);
    expect(body.data.agents[0].token_usage).toBeNull();
    expect(body.data.agents[0].usage_available).toBe(false);
    expect(body.data.agents[0].cost_usd).toBeNull();
  });
});
