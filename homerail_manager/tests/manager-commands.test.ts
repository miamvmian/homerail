import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _clearActiveRuns } from "../src/runtime/active-runs.js";
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

describe("/api/runs/:run_id/manager/commands", () => {
  let server: http.Server;

  beforeEach(() => {
    _clearActiveRuns();
    server = createServer(0, undefined, undefined, false);
  });

  afterEach(async () => {
    _clearActiveRuns();
    await close(server);
  });

  it("rejects runtime manager commands instead of mutating the run graph", async () => {
    const port = await listen(server);
    const response = await fetch(`http://127.0.0.1:${port}/api/runs/run-1/manager/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "append_node",
        append: { node_id: "observer", after: ["coder"] },
      }),
    });
    const body = await response.json() as {
      success: boolean;
      data?: { code?: string; supported_paths?: string[] };
    };

    expect(response.status).toBe(410);
    expect(body.success).toBe(false);
    expect(body.data?.code).toBe("MANAGER_RUN_COMMAND_UNSUPPORTED");
    expect(body.data?.supported_paths).toContain("Edit the DAG template before creating the run");
  });
});
