import type { PersistedRunSnapshot, PersistedEvent } from "../persistence/types.js";
import { computeScorecard } from "./scorecard.js";

export interface ReplayReport {
  run_id: string;
  summary: string;
  scorecard: {
    passed: boolean;
    score: number;
    total: number;
    errors: number;
    warnings: number;
  };
  categories: Record<string, Array<{ name: string; severity: string; detail: string }>>;
  event_timeline: Array<{
    event_type: string;
    node_id: string;
    timestamp: number;
    details: unknown;
  }>;
  node_states: Record<string, string>;
  handoff_summary: { total: number; nonempty: number; empty: number };
  verdict: "pass" | "needs_replay";
  next_steps: string[];
}

function _normalizeEvent(event: PersistedEvent) {
  const payload = event.payload as unknown as Record<string, unknown>;
  const rawType = event.type;
  const eventType = rawType.startsWith("dag:") ? rawType.slice(4) : rawType;
  const nodeId =
    (typeof payload.fromNode === "string" && payload.fromNode) ||
    (typeof payload.from_node === "string" && payload.from_node) ||
    (typeof payload.nodeId === "string" && payload.nodeId) ||
    (typeof payload.node_id === "string" && payload.node_id) ||
    (typeof payload.runId === "string" && payload.runId) ||
    "";
  return {
    type: rawType,
    timestamp: event.timestamp,
    event_type: eventType,
    node_id: nodeId,
    details: payload,
  };
}

function _categorizeFailure(name: string): string[] {
  const lower = name.toLowerCase();
  const cats: string[] = [];

  if (lower.includes("timeout") || lower.includes("inject") || lower.includes("stall")) {
    cats.push("engine");
  }
  if (lower.includes("artifact") || lower.includes("handoff")) {
    cats.push("template");
    cats.push("harness");
  }
  if (lower.includes("pr_api") || lower.includes("api") || lower.includes("tool")) {
    cats.push("tool");
  }
  if (lower.includes("triage")) {
    cats.push("prompt");
  }

  if (cats.length === 0) {
    cats.push("prompt");
  }

  return cats;
}

function _suggestionForCategory(cat: string): string {
  switch (cat) {
    case "prompt":
      return "Refine node system prompt or handoff contract for clarity";
    case "tool":
      return "Check tool definitions, MCP registration, or API endpoint availability";
    case "engine":
      return "Review timeout limits, dispatch logic, or container lifecycle";
    case "template":
      return "Update DAG YAML handoff contract or artifact standards";
    case "harness":
      return "Improve test fixtures, mock responses, or workspace setup";
    default:
      return "Investigate failure root cause";
  }
}

export function buildReplayReport(snapshot: PersistedRunSnapshot): ReplayReport {
  const scorecard = computeScorecard(snapshot);

  const failures = scorecard.checks.filter((c) => !c.passed);
  const categories: Record<string, Array<{ name: string; severity: string; detail: string }>> = {};

  for (const f of failures) {
    const cats = _categorizeFailure(f.name);
    for (const cat of cats) {
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ name: f.name, severity: f.severity, detail: f.detail });
    }
  }

  const eventTimeline = snapshot.events.map(_normalizeEvent).map((e) => ({
    event_type: e.event_type,
    node_id: e.node_id,
    timestamp: e.timestamp,
    details: e.details,
  }));

  const nonemptyHandoffs = snapshot.handoffs.filter((h) => {
    if (h.content === undefined || h.content === null) return false;
    if (typeof h.content === "string") return h.content.trim() !== "";
    return true;
  });

  const nodeStates = { ...snapshot.metadata.nodeStates };

  const nextSteps: string[] = [];
  const sortedCats = Object.keys(categories).sort();
  for (const cat of sortedCats) {
    nextSteps.push(`[${cat}] ${_suggestionForCategory(cat)}`);
  }

  if (scorecard.intervention_total > 0) {
    const directions = Object.entries(scorecard.intervention_by_direction)
      .map(([dir, count]) => `${dir}:${count}`)
      .sort();
    nextSteps.push(
      `[prompt] Reduce need for Manager intervention — directions: ${directions.join(", ") || "unknown"}; consider strengthening node system prompts, validation rules, or handoff contracts (${scorecard.intervention_total} intervention${scorecard.intervention_total === 1 ? "" : "s"} detected)`,
    );
  }

  if (nextSteps.length === 0) {
    nextSteps.push("No failures to address.");
  }

  const verdict = scorecard.passed && scorecard.hard_error_count === 0 ? "pass" : "needs_replay";

  return {
    run_id: snapshot.metadata.runId,
    summary:
      failures.length === 0
        ? `All ${scorecard.total} checks passed — no improvements needed.`
        : `${failures.length} of ${scorecard.total} checks failed across ${sortedCats.length} category(ies).`,
    scorecard: {
      passed: scorecard.passed,
      score: scorecard.score,
      total: scorecard.total,
      errors: scorecard.hard_error_count,
      warnings: scorecard.soft_warning_count,
    },
    categories,
    event_timeline: eventTimeline,
    node_states: nodeStates,
    handoff_summary: {
      total: snapshot.handoffs.length,
      nonempty: nonemptyHandoffs.length,
      empty: snapshot.handoffs.length - nonemptyHandoffs.length,
    },
    verdict,
    next_steps: nextSteps,
  };
}
