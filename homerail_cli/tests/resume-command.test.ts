import { describe, expect, it, vi, afterEach } from "vitest";

import type { HomeRailClient } from "../src/client.js";
import { cmdResume } from "../src/commands/resume.js";

describe("cmdResume", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports scheduled checkpoint resume even when dispatch is pending", async () => {
    const client = {
      checkpointResume: vi.fn().mockResolvedValue({
        success: true,
        message: "Checkpoint resume scheduled",
        data: { scheduled: true, dispatched: false, dispatch_state: "pending", dispatch_count: 0 },
      }),
    } as unknown as HomeRailClient;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await cmdResume(
      client,
      "run-1",
      "node-a",
      { instruction: "resume here" },
      false,
    );

    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Checkpoint resume scheduled"));
    expect(logSpy).toHaveBeenCalledWith("  dispatched: false");
    expect(logSpy).toHaveBeenCalledWith("  dispatch_state: pending");
  });
});
