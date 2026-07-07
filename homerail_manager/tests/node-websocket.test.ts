import * as http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { _clearNodes, getAllNodes } from "../src/node/registry.js";
import { isLoopbackNodeRemoteAddress, setupNodeWebSocket } from "../src/node/websocket.js";

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("server did not bind");
  return address.port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error("timed out waiting for condition"));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

async function openNode(port: number, nodeId: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/projects/project-1/nodes/${nodeId}`);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return ws;
}

describe("node websocket", () => {
  afterEach(() => {
    _clearNodes();
  });

  it("recognizes loopback node addresses only", () => {
    expect(isLoopbackNodeRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackNodeRemoteAddress("127.1.2.3")).toBe(true);
    expect(isLoopbackNodeRemoteAddress("::1")).toBe(true);
    expect(isLoopbackNodeRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackNodeRemoteAddress("203.0.113.12")).toBe(false);
    expect(isLoopbackNodeRemoteAddress("10.0.0.2")).toBe(false);
    expect(isLoopbackNodeRemoteAddress(undefined)).toBe(false);
  });

  it("rejects a second registered node", async () => {
    const server = http.createServer();
    setupNodeWebSocket(server, { registrationTimeoutMs: 500, pingIntervalMs: 1000 });
    const port = await listen(server);
    const first = await openNode(port, "node-a");

    try {
      first.send(JSON.stringify({ type: "register", node_id: "node-a" }));
      await waitFor(() => getAllNodes().length === 1);

      const second = await openNode(port, "node-b");
      const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        second.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
      });
      second.send(JSON.stringify({ type: "register", node_id: "node-b" }));

      await expect(closed).resolves.toEqual({
        code: 4003,
        reason: "only one local node is supported",
      });
      expect(getAllNodes().map((node) => node.node_id)).toEqual(["node-a"]);
    } finally {
      first.close();
      await close(server);
    }
  });
});
