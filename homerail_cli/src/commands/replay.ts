/**
 * replay command — Show replay plan for a run
 */

import type { HomeRailClient } from "../client.js";

interface ReplayResponse {
  run_id: string;
  source_issue: string | null;
  summary: string;
  score_passed: boolean;
  score: number;
  total: number;
  categories: Record<string, string[]>;
  next_steps: string[];
  acceptance: string[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function categoriesRecord(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, items] of Object.entries(value as Record<string, unknown>)) {
    result[key] = stringArray(items);
  }
  return result;
}

function normalizeReplayResponse(plan: ReplayResponse): ReplayResponse {
  return {
    run_id: String(plan.run_id || "unknown"),
    source_issue: plan.source_issue === null || plan.source_issue === undefined ? null : String(plan.source_issue),
    summary: typeof plan.summary === "string" && plan.summary.trim() ? plan.summary.trim() : "No replay summary available.",
    score_passed: Boolean(plan.score_passed),
    score: Number.isFinite(Number(plan.score)) ? Number(plan.score) : 0,
    total: Number.isFinite(Number(plan.total)) ? Number(plan.total) : 0,
    categories: categoriesRecord(plan.categories),
    next_steps: stringArray(plan.next_steps),
    acceptance: stringArray(plan.acceptance),
  };
}

export function renderReplayText(plan: ReplayResponse): string {
  const normalized = normalizeReplayResponse(plan);
  const lines: string[] = [`=== Replay Plan: ${normalized.run_id} ===`];

  if (normalized.source_issue) {
    lines.push(`Source Issue: #${normalized.source_issue}`);
  }

  lines.push(`Summary: ${normalized.summary}`);
  lines.push(
    `Scorecard: ${normalized.score}/${normalized.total} (${normalized.score_passed ? "PASS" : "FAIL"})`,
  );

  const catEntries = Object.entries(normalized.categories);
  if (catEntries.length === 0) {
    lines.push("Categories: none (all checks passed)");
  } else {
    lines.push("Categories:");
    catEntries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [key, items] of catEntries) {
      lines.push(`  [${key}] (${items.length}): ${items.join(", ")}`);
    }
  }

  lines.push("Next Steps:");
  const nextSteps = normalized.next_steps.length ? normalized.next_steps : ["No replay next steps provided by this run."];
  for (const step of nextSteps) {
    lines.push(`  - ${step}`);
  }

  lines.push("Acceptance Criteria:");
  const acceptance = normalized.acceptance.length ? normalized.acceptance : ["No replay acceptance criteria were recorded for this run."];
  for (const crit of acceptance) {
    lines.push(`  - ${crit}`);
  }

  return lines.join("\n");
}

export async function cmdReplay(
  client: HomeRailClient,
  runId: string,
  json: boolean,
  opts: { sourceIssue?: string } = {},
): Promise<number> {
  let resp;
  try {
    resp = await client.getReplay(runId, opts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    return 1;
  }
  if (!resp.success) {
    console.error(`Error: ${resp.message}`);
    return 1;
  }

  const plan = resp.data as ReplayResponse;

  if (json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(renderReplayText(plan));
  }

  return plan.score_passed ? 0 : 1;
}
