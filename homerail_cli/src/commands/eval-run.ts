/**
 * eval-run command — Show eval report for a run
 */

import type { HomeRailClient } from "../client.js";

interface EvalRunResponse {
  run_id: string;
  verdict: string;
  scorecard_enforcement?: string;
  scorecard_gate_verdict?: string;
  dag_health: {
    run_status: string;
    node_counts: string;
    failed_nodes: string[];
    event_count: number;
    stalled_hint: string;
  };
  worker_behavior: {
    passed: boolean;
    score: number;
    total: number;
    hard_errors: number;
    soft_warnings: number;
    blind_spots: number;
    errors: string[];
    warnings: string[];
  };
  artifact_contracts: {
    handoff_count: number;
    empty_handoff_count: number;
  };
  chat_activity: {
    message_count: number;
    tool_call_count: number;
  };
  triage_activity?: {
    tool_count: number;
    handoff_count: number;
    budget_threshold: number;
    budget_exceeded: boolean;
    intervention_count: number;
    intervention_ignored: boolean;
  };
  interventions: {
    total: number;
    by_node: Record<string, number>;
    by_mode: Record<string, number>;
    by_direction: Record<string, number>;
  };
  quality_gate: {
    status: string;
    passed: boolean;
    detail: string;
    categories: Record<string, boolean>;
    category_details: Record<string, string>;
  };
  scorecard_failures: string[];
}

function formatMap(m: Record<string, number>): string {
  const entries = Object.entries(m);
  if (entries.length === 0) return "{}";
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return `{${entries.map(([k, v]) => `${k}:${v}`).join(",")}}`;
}

export function renderEvalText(report: EvalRunResponse): string {
  const lines: string[] = [`=== Eval Report: ${report.run_id} ===`];

  // DAG Health
  lines.push("DAG Health:");
  lines.push(`  Status: ${report.dag_health.run_status}`);
  lines.push(`  Nodes: ${report.dag_health.node_counts}`);
  if (report.dag_health.failed_nodes.length > 0) {
    lines.push(`  Failed: ${report.dag_health.failed_nodes.join(", ")}`);
  }
  lines.push(`  Events: ${report.dag_health.event_count}`);
  lines.push(`  Hint: ${report.dag_health.stalled_hint}`);

  // Worker Behavior
  lines.push("Worker Behavior:");
  lines.push(
    `  Scorecard: ${report.worker_behavior.score}/${report.worker_behavior.total} (${report.worker_behavior.passed ? "PASS" : "FAIL"})`,
  );
  if (report.scorecard_enforcement || report.scorecard_gate_verdict) {
    lines.push(
      `  Scorecard gate: ${(report.scorecard_gate_verdict ?? "unknown").toUpperCase()} (${report.scorecard_enforcement ?? "strict"})`,
    );
  }
  lines.push(
    `  Hard errors: ${report.worker_behavior.hard_errors}  Soft warnings: ${report.worker_behavior.soft_warnings}  Blind spots: ${report.worker_behavior.blind_spots}`,
  );
  if (report.worker_behavior.errors.length > 0) {
    lines.push(`  Errors: ${report.worker_behavior.errors.join(", ")}`);
  }

  // Artifacts
  lines.push("Artifacts:");
  lines.push(
    `  Handoffs: ${report.artifact_contracts.handoff_count} (${report.artifact_contracts.empty_handoff_count} empty)`,
  );

  // Quality Gate
  lines.push("Quality Gate:");
  lines.push(
    `  Status: ${report.quality_gate.status.toUpperCase()} (${report.quality_gate.passed ? "PASS" : "FAIL"})`,
  );
  const catEntries = Object.entries(report.quality_gate.categories);
  if (catEntries.length > 0) {
    lines.push("  Categories:");
    catEntries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, passed] of catEntries) {
      lines.push(`    ${name}: ${passed ? "PASS" : "FAIL"}`);
    }
  }
  lines.push(`  Detail: ${report.quality_gate.detail}`);

  // Chat Activity
  lines.push("Chat Activity:");
  lines.push(
    `  Messages: ${report.chat_activity.message_count}  Tool calls: ${report.chat_activity.tool_call_count}`,
  );

  // Triage Activity
  if (report.triage_activity) {
    lines.push("Triage Activity:");
    lines.push(
      `  Tools: ${report.triage_activity.tool_count}  Handoffs: ${report.triage_activity.handoff_count}  Budget exceeded: ${report.triage_activity.budget_exceeded}  Interventions: ${report.triage_activity.intervention_count}  Ignored: ${report.triage_activity.intervention_ignored}`,
    );
  }

  // Interventions
  const iv = report.interventions;
  lines.push("Interventions:");
  lines.push(`  Total: ${iv.total}`);
  if (Object.keys(iv.by_node).length > 0) {
    lines.push(`  By node: ${formatMap(iv.by_node)}`);
  }
  if (Object.keys(iv.by_mode).length > 0) {
    lines.push(`  By mode: ${formatMap(iv.by_mode)}`);
  }
  if (Object.keys(iv.by_direction).length > 0) {
    lines.push(`  By direction: ${formatMap(iv.by_direction)}`);
  }

  // Scorecard Findings
  if (report.scorecard_failures.length === 0) {
    lines.push("Scorecard Findings: none");
  } else {
    lines.push("Scorecard Findings:");
    for (const f of report.scorecard_failures) {
      lines.push(`  - ${f}`);
    }
  }

  // Verdict
  lines.push(`Verdict: ${report.verdict.toUpperCase()}`);

  // Next Steps
  lines.push("Next Steps:");
  if (report.verdict === "pass") {
    lines.push("  All checks passed.");
  } else if (report.verdict === "fail") {
    lines.push(
      `  ${report.scorecard_failures.length} gating check(s) failed — review and address above.`,
    );
  } else {
    lines.push(
      `  ${report.scorecard_failures.length} advisory finding(s) reported — review when relevant.`,
    );
  }

  return lines.join("\n");
}

export async function cmdEvalRun(
  client: HomeRailClient,
  runId: string,
  json: boolean,
  opts: {
    events?: number;
    tools?: number;
    contentLimit?: number;
    sourceIssue?: string;
  } = {},
): Promise<number> {
  let resp;
  try {
    resp = await client.getEvalRun(runId, opts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    return 1;
  }
  if (!resp.success) {
    console.error(`Error: ${resp.message}`);
    return 1;
  }

  const report = resp.data as EvalRunResponse;

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderEvalText(report));
  }

  return report.verdict === "fail" ? 1 : 0;
}
