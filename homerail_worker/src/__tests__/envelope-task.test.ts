import { describe, expect, it } from "vitest";
import { envelopeInputsToTaskText } from "../envelope-task.js";

describe("envelope task text", () => {
  it("serializes object handoff inputs as readable JSON sections", () => {
    const text = envelopeInputsToTaskText({
      source_audit: [
        {
          source_audit: "PASS",
          evidence: { public_head: "abc123", failures: [] },
        },
      ],
      build_audit: ["build ok"],
    });

    expect(text).toContain("## input:source_audit");
    expect(text).toContain('"source_audit": "PASS"');
    expect(text).toContain('"public_head": "abc123"');
    expect(text).toContain("## input:build_audit\nbuild ok");
    expect(text).not.toContain("[object Object]");
  });
});
