import type { ScorecardResult, ToolActivity } from "./scorecard.js";
import type { PersistedRunSnapshot } from "../persistence/types.js";

export interface EvalReport {
  run_id: string;
  verdict: string;
  scorecard_enforcement: string;
  scorecard_gate_verdict: string;
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
    auto_handoff_count: number;
  };
  chat_activity: {
    message_count: number;
    tool_call_count: number;
    tool_activity: ToolActivity;
  };
  scorecard_failures: string[];
  interventions: {
    total: number;
    delivered: number;
    delivery_failed: number;
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
  source_issue: {
    inferred: number | null;
    consistent: boolean;
    detail: string;
  };
}

export function buildEvalReport(
  snapshot: PersistedRunSnapshot,
  scorecard: ScorecardResult,
): EvalReport {
  const states = Object.values(snapshot.metadata.nodeStates);
  const completed = states.filter((s) =>
    ["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(s) ||
    (snapshot.metadata.status === "completed" && s === "RUNNING"),
  ).length;
  const nodeCountsStr = `${completed}/${states.length}`;

  const emptyHandoffs = snapshot.handoffs.filter((h) => {
    if (h.content === undefined || h.content === null) return true;
    if (typeof h.content === "string") return h.content.trim() === "";
    return false;
  });

  const autoHandoffCount = snapshot.handoffs.filter((h) => hasAutoHandoffFlag(h.content)).length;

  const messageCount = Object.values(snapshot.chats)
    .flat()
    .length;

  const toolCallCount = scorecard.tool_activity.tool_call_total;

  const failures: string[] = scorecard.checks
    .filter((c) => !c.passed)
    .map((c) => `[${c.severity}] ${c.name}: ${c.detail}`);

  const errors = scorecard.checks
    .filter((c) => !c.passed && c.severity === "error")
    .map((c) => c.name);

  const warnings = scorecard.checks
    .filter((c) => !c.passed && c.severity !== "error")
    .map((c) => c.name);

  if (snapshot.metadata.status !== "completed") {
    warnings.push("run not yet terminal");
  }

  const dagHardFailure =
    snapshot.metadata.status !== "completed";
  const scorecardGateFailure = scorecard.gate_verdict === "fail";
  let verdict: string;
  if (dagHardFailure || scorecardGateFailure) {
    verdict = "fail";
  } else if (scorecard.blind_spot_count > 0) {
    verdict = "scorecard_blind_spot";
  } else if (scorecard.soft_warning_count > 0 || warnings.length > scorecard.soft_warning_count) {
    verdict = "pass_with_warnings";
  } else {
    verdict = "pass";
  }

  const qgAllPass = scorecard.quality_gate_applicable && Object.values(scorecard.quality_gate_categories).every(Boolean);
  const qgStatus = scorecard.quality_gate_applicable ? (qgAllPass ? "pass" : "fail") : "n/a";

  return {
    run_id: snapshot.metadata.runId,
    verdict,
    scorecard_enforcement: scorecard.enforcement,
    scorecard_gate_verdict: scorecard.gate_verdict,
    dag_health: {
      run_status: snapshot.metadata.status,
      node_counts: nodeCountsStr,
      failed_nodes: [],
      event_count: snapshot.events.length,
      stalled_hint: "",
    },
    worker_behavior: {
      passed: scorecard.passed,
      score: scorecard.score,
      total: scorecard.total,
      hard_errors: scorecard.hard_error_count,
      soft_warnings: scorecard.soft_warning_count,
      blind_spots: scorecard.blind_spot_count,
      errors,
      warnings,
    },
    artifact_contracts: {
      handoff_count: snapshot.handoffs.length,
      empty_handoff_count: emptyHandoffs.length,
      auto_handoff_count: autoHandoffCount,
    },
    chat_activity: {
      message_count: messageCount,
      tool_call_count: toolCallCount,
      tool_activity: scorecard.tool_activity,
    },
    scorecard_failures: failures,
    interventions: {
      total: scorecard.intervention_total,
      delivered: scorecard.intervention_delivered_total,
      delivery_failed: scorecard.intervention_delivery_failed_total,
      by_node: scorecard.intervention_by_node,
      by_mode: scorecard.intervention_by_mode,
      by_direction: scorecard.intervention_by_direction,
    },
    quality_gate: {
      status: qgStatus,
      passed: scorecard.quality_gate_applicable ? qgAllPass : true,
      detail: scorecard.quality_gate_applicable
        ? `quality gate categories: ${Object.entries(scorecard.quality_gate_categories).map(([k, v]) => `${k}=${v ? "PASS" : "FAIL"}`).join(", ")}`
        : "quality gate not applicable (no evidence found)",
      categories: scorecard.quality_gate_categories,
      category_details: scorecard.quality_gate_details,
    },
    source_issue: {
      inferred: scorecard.source_issue,
      consistent: scorecard.source_issue_consistent,
      detail: scorecard.source_issue !== null
        ? (scorecard.source_issue_consistent
          ? `all handoffs match ${scorecard.source_issue_label ?? "source issue"} #${scorecard.source_issue}`
          : "source issue mismatch detected")
        : "no source issue evidence found",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAutoHandoffFlag(value: unknown): boolean {
  if (isRecord(value)) return value.auto_handoff === true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    return hasAutoHandoffFlag(JSON.parse(trimmed));
  } catch {
    return false;
  }
}

export function renderEvalJson(report: EvalReport): string {
  return JSON.stringify({
    run_id: report.run_id,
    verdict: report.verdict,
    scorecard_enforcement: report.scorecard_enforcement,
    scorecard_gate_verdict: report.scorecard_gate_verdict,
    dag_health: report.dag_health,
    worker_behavior: report.worker_behavior,
    artifact_contracts: report.artifact_contracts,
    chat_activity: report.chat_activity,
    scorecard_failures: report.scorecard_failures,
    interventions: report.interventions,
    quality_gate: report.quality_gate,
    source_issue: report.source_issue,
  });
}
