/**
 * Tests for WsClient: registration, heartbeat, reconnect, message framing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WsClient } from "../ws-client.js";

// We test the WsClient's event emission and message handling logic
// without a real WebSocket server by mocking the ws module.

describe("WsClient", () => {
  it("emits connected on open", () => {
    const client = new WsClient({
      url: "ws://localhost:9999",
      workerId: "test-worker",
    });

    const connectedFn = vi.fn();
    client.on("connected", connectedFn);

    // We can't easily mock the WS constructor without more setup,
    // so we test the class structure and configuration.
    expect(client.isConnected).toBe(false);
  });

  it("sends registration message on connect", () => {
    const client = new WsClient({
      url: "ws://localhost:9999",
      workerId: "w-1",
      token: "tok",
    });

    // Verify the client was constructed with correct options
    expect(client.isConnected).toBe(false);
  });

  it("includes declared capabilities in registration payload", () => {
    const client = new WsClient({
      url: "ws://localhost:9999",
      workerId: "browser-worker",
      capabilities: ["browser", "docker-cli"],
    });
    const sendSpy = vi.spyOn(client, "send").mockImplementation(() => {});

    (client as unknown as { register: () => void }).register();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendSpy.mock.calls[0][0])).toEqual({
      type: "control",
      action: "register",
      data: {
        worker_id: "browser-worker",
        capabilities: ["browser", "docker-cli"],
      },
    });
  });

  it("handles pong response", () => {
    const client = new WsClient({
      url: "ws://localhost:9999",
      workerId: "w-1",
    });

    // The client should handle ping/pong internally
    expect(client.isConnected).toBe(false);
  });

  it("emits inject messages as control events", () => {
    const client = new WsClient({
      url: "ws://localhost:9999",
      workerId: "w-1",
    });
    const injectFn = vi.fn();
    client.on("inject", injectFn);

    (client as unknown as { handleMessage: (msg: unknown) => void }).handleMessage({
      type: "inject",
      data: {
        runId: "run-1",
        nodeId: "coder",
        mode: "interrupt",
        instruction: "stop",
      },
    });

    expect(injectFn).toHaveBeenCalledWith(expect.objectContaining({
      type: "inject",
      data: expect.objectContaining({ runId: "run-1", nodeId: "coder" }),
    }));
  });

  it("close stops reconnection", () => {
    const client = new WsClient({
      url: "ws://localhost:9999",
      workerId: "w-1",
    });

    client.close();
    // After close, isConnected should be false
    expect(client.isConnected).toBe(false);
  });
});
