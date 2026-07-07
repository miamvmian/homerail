import { describe, it, expect } from "vitest";
import { renderScorecardText } from "../src/commands/scorecard.js";

/**
 * Dedicated tests for scorecard rendering logic.
 * These exercise renderScorecardText directly with different scorecard shapes.
 */

describe("renderScorecardText", () => {
  it("renders PASS shape correctly", () => {
    const result = {
      run_id: "run-pass",
      is_selfdev: true,
      passed: true,
      verdict: "pass",
      score: 6,
      total: 6,
      hard_error_count: 0,
      soft_warning_count: 0,
      blind_spot_count: 0,
      checks: [
        { name: "run_terminal", passed: true, severity: "error", gate: "hard", source_type: "event", detail: "run status: completed" },
        { name: "all_nodes_completed", passed: true, severity: "error", gate: "hard", source_type: "event", detail: "3/3, 3 nodes total" },
        { name: "no_failed_nodes", passed: true, severity: "error", gate: "hard", source_type: "event", detail: "no failed nodes" },
        { name: "handoffs_nonempty", passed: true, severity: "error", gate: "hard", source_type: "handoff", detail: "5 handoff event(s)" },
        { name: "artifact.no_file_mode_changes", passed: true, severity: "error", gate: "hard", source_type: "handoff", detail: "no file mode changes" },
        { name: "artifact.tester_quality_gate", passed: true, severity: "error", gate: "hard", source_type: "handoff", detail: "quality gate with linter, type-check, and regression evidence" },
      ],
      intervention: { total: 0, by_node: {}, by_mode: {}, by_direction: {} },
      quality_gate: {
        applicable: true,
        categories: { linter: true, "type-check": true, regression: true },
        aggregate: { name: "artifact.tester_quality_gate", passed: true, status: "pass" },
      },
    };

    const text = renderScorecardText(result);
    expect(text).toContain("Scorecard: run-pass");
    expect(text).toContain("Result: PASS");
    expect(text).toContain("Gate Verdict: pass");
    expect(text).toContain("Score: 6/6");
    expect(text).toContain("Hard Errors: 0");
    expect(text).toContain("Soft Warnings: 0");
    expect(text).toContain("Blind Spots: 0");
    expect(text).toContain("Interventions: 0");
    expect(text).toContain("+");
    expect(text).not.toContain("  - [");
    // Quality gate categories
    expect(text).toContain("Quality Gate Categories:");
    expect(text).toContain("linter: PASS");
    expect(text).toContain("type-check: PASS");
    expect(text).toContain("regression: PASS");
  });

  it("renders warning shape (soft_warning_count > 0)", () => {
    const result = {
      run_id: "run-warn",
      is_selfdev: true,
      enforcement: "advisory",
      passed: true,
      verdict: "pass_with_warnings",
      gate_verdict: "pass",
      score: 5,
      total: 6,
      hard_error_count: 0,
      soft_warning_count: 1,
      blind_spot_count: 0,
      checks: [
        { name: "run_terminal", passed: true, severity: "error", gate: "hard", source_type: "event", detail: "run status: completed" },
        { name: "worker.triage.budget_ok", passed: false, severity: "warning", gate: "soft", source_type: "chat", detail: "triage tool_count=20; threshold=15" },
      ],
      intervention: { total: 1, by_node: { triage: 1 }, by_mode: { inbox: 1 }, by_direction: { stop_over_exploration: 1 } },
      quality_gate: {
        applicable: true,
        categories: { linter: true, "type-check": true, regression: false },
        aggregate: { name: "artifact.tester_quality_gate", passed: false, status: "fail" },
      },
    };

    const text = renderScorecardText(result);
    expect(text).toContain("Result: PASS");
    expect(text).toContain("Enforcement: advisory");
    expect(text).toContain("Gate Verdict: pass");
    expect(text).toContain("Findings Verdict: pass_with_warnings");
    expect(text).toContain("Score: 5/6");
    expect(text).toContain("Soft Warnings: 1");
    expect(text).toContain("- [warning soft source=chat] worker.triage.budget_ok:");
    expect(text).toContain("Interventions: total=1");
    expect(text).toContain("triage:1");
    expect(text).toContain("regression: FAIL");
  });

  it("renders hard-error shape (hard_error_count > 0)", () => {
    const result = {
      run_id: "run-fail",
      is_selfdev: false,
      passed: false,
      verdict: "fail",
      score: 3,
      total: 6,
      hard_error_count: 2,
      soft_warning_count: 1,
      blind_spot_count: 0,
      checks: [
        { name: "run_terminal", passed: true, severity: "error", gate: "hard", source_type: "event", detail: "run status: completed" },
        { name: "no_failed_nodes", passed: false, severity: "error", gate: "hard", source_type: "event", detail: "failed: coder" },
        { name: "all_nodes_completed", passed: false, severity: "error", gate: "hard", source_type: "event", detail: "2/3, 3 nodes total" },
        { name: "worker.triage.budget_ok", passed: false, severity: "warning", gate: "soft", source_type: "chat", detail: "triage tool_count=25" },
      ],
      intervention: { total: 2, by_node: { triage: 2 }, by_mode: { inbox: 1, interrupt: 1 }, by_direction: { scope_narrowing: 1, stop_over_exploration: 1 } },
      quality_gate: {
        applicable: false,
        categories: {},
        aggregate: { name: "artifact.tester_quality_gate", passed: true, status: "n/a" },
      },
    };

    const text = renderScorecardText(result);
    expect(text).toContain("Result: FAIL");
    expect(text).toContain("Gate Verdict: fail");
    expect(text).toContain("Score: 3/6");
    expect(text).toContain("Hard Errors: 2");
    expect(text).toContain("Soft Warnings: 1");
    expect(text).toContain("- [error hard source=event] no_failed_nodes: failed: coder");
    expect(text).toContain("- [error hard source=event] all_nodes_completed:");
    expect(text).toContain("Interventions: total=2");
    expect(text).toContain("triage:2");
    // No quality gate categories section since applicable is false and categories is empty
    expect(text).not.toContain("Quality Gate Categories:");
  });

  it("renders JSON output structure correctly", () => {
    // Verify the JSON path by checking what cmdScorecard would produce
    // We test this indirectly through the --json path in evidence-commands.test.ts
    // Here we just verify the text renderer doesn't produce JSON
    const result = {
      run_id: "run-json-check",
      is_selfdev: true,
      passed: true,
      verdict: "pass",
      score: 6,
      total: 6,
      hard_error_count: 0,
      soft_warning_count: 0,
      blind_spot_count: 0,
      checks: [
        { name: "run_terminal", passed: true, severity: "error", gate: "hard", source_type: "event", detail: "ok" },
      ],
      intervention: { total: 0, by_node: {}, by_mode: {}, by_direction: {} },
      quality_gate: { applicable: true, categories: { linter: true }, aggregate: { name: "artifact.tester_quality_gate", passed: true, status: "pass" } },
    };

    const text = renderScorecardText(result);
    // Text output should not start with { (not JSON)
    expect(text.startsWith("{")).toBe(false);
    expect(text).toContain("Scorecard: run-json-check");
  });

  it("renders quality gate categories", () => {
    const result = {
      run_id: "run-qg",
      is_selfdev: true,
      passed: true,
      verdict: "pass",
      score: 6,
      total: 6,
      hard_error_count: 0,
      soft_warning_count: 0,
      blind_spot_count: 0,
      checks: [],
      intervention: { total: 0, by_node: {}, by_mode: {}, by_direction: {} },
      quality_gate: {
        applicable: true,
        categories: { linter: true, "type-check": false, regression: true },
        aggregate: { name: "artifact.tester_quality_gate", passed: false, status: "fail" },
      },
    };

    const text = renderScorecardText(result);
    expect(text).toContain("Quality Gate Categories:");
    expect(text).toContain("linter: PASS");
    expect(text).toContain("type-check: FAIL");
    expect(text).toContain("regression: PASS");
  });

  it("renders intervention summary with multiple entries", () => {
    const result = {
      run_id: "run-iv",
      is_selfdev: false,
      passed: true,
      verdict: "pass",
      score: 6,
      total: 6,
      hard_error_count: 0,
      soft_warning_count: 0,
      blind_spot_count: 0,
      checks: [],
      intervention: {
        total: 3,
        by_node: { triage: 2, coder: 1 },
        by_mode: { inbox: 2, interrupt: 1 },
        by_direction: { scope_narrowing: 1, stop_over_exploration: 1, enforce_validation: 1 },
      },
      quality_gate: {
        applicable: false,
        categories: {},
        aggregate: { name: "artifact.tester_quality_gate", passed: true, status: "n/a" },
      },
    };

    const text = renderScorecardText(result);
    expect(text).toContain("Interventions: total=3");
    expect(text).toContain("by_node={coder:1,triage:2}");
    expect(text).toContain("by_mode={inbox:2,interrupt:1}");
    expect(text).toContain("by_direction={enforce_validation:1,scope_narrowing:1,stop_over_exploration:1}");
  });

  it("renders blind_spot checks", () => {
    const result = {
      run_id: "run-bs",
      is_selfdev: true,
      passed: true,
      verdict: "scorecard_blind_spot",
      score: 5,
      total: 6,
      hard_error_count: 0,
      soft_warning_count: 0,
      blind_spot_count: 1,
      checks: [
        { name: "run_terminal", passed: true, severity: "error", gate: "hard", source_type: "event", detail: "run status: completed" },
        { name: "artifact.no_file_mode_changes", passed: false, severity: "blind_spot", gate: "blind_spot", source_type: "source_snippet", detail: "mode-change text came from non-diff context" },
      ],
      intervention: { total: 0, by_node: {}, by_mode: {}, by_direction: {} },
      quality_gate: { applicable: true, categories: {}, aggregate: {} },
    };

    const text = renderScorecardText(result);
    expect(text).toContain("Blind Spots: 1");
    expect(text).toContain("Gate Verdict: scorecard_blind_spot");
    expect(text).toContain("- [blind_spot blind_spot source=source_snippet]");
  });
});
