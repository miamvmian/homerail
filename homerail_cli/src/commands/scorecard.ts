/**
 * scorecard command — Show scorecard for a run
 */

import type { HomeRailClient } from "../client.js";

interface ScoreCheck {
  name: string;
  passed: boolean;
  severity: string;
  gate: string;
  source_type: string;
  detail: string;
}

interface ScorecardResponse {
  run_id: string;
  is_selfdev: boolean;
  enforcement?: string;
  passed: boolean;
  verdict: string;
  gate_verdict?: string;
  score: number;
  total: number;
  hard_error_count: number;
  soft_warning_count: number;
  blind_spot_count: number;
  checks: ScoreCheck[];
  intervention: {
    total: number;
    by_node: Record<string, number>;
    by_mode: Record<string, number>;
    by_direction: Record<string, number>;
  };
  quality_gate: {
    applicable: boolean;
    categories: Record<string, boolean>;
    aggregate: { name: string; passed: boolean; status: string };
  };
}

export function renderScorecardText(result: ScorecardResponse): string {
  const lines: string[] = [`Scorecard: ${result.run_id}`];

  for (const c of result.checks) {
    const icon = c.passed ? "+" : "-";
    lines.push(
      `  ${icon} [${c.severity} ${c.gate} source=${c.source_type}] ${c.name}: ${c.detail}`,
    );
  }

  lines.push(`Result: ${result.passed ? "PASS" : "FAIL"}`);
  lines.push(`Enforcement: ${result.enforcement ?? "strict"}`);
  lines.push(`Gate Verdict: ${result.gate_verdict ?? result.verdict}`);
  lines.push(`Findings Verdict: ${result.verdict}`);
  lines.push(`Score: ${result.score}/${result.total}`);
  lines.push(
    `Hard Errors: ${result.hard_error_count}  Soft Warnings: ${result.soft_warning_count}  Blind Spots: ${result.blind_spot_count}`,
  );

  // Intervention summary
  const intervention = result.intervention;
  if (intervention.total === 0) {
    lines.push("Interventions: 0");
  } else {
    const byNodeStr = formatMap(intervention.by_node);
    const byModeStr = formatMap(intervention.by_mode);
    const byDirectionStr = formatMap(intervention.by_direction);
    lines.push(
      `Interventions: total=${intervention.total}, by_node=${byNodeStr}, by_mode=${byModeStr}, by_direction=${byDirectionStr}`,
    );
  }

  // Quality Gate Categories
  const cats = result.quality_gate.categories;
  const catEntries = Object.entries(cats);
  if (catEntries.length > 0) {
    lines.push("Quality Gate Categories:");
    catEntries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, passed] of catEntries) {
      lines.push(`  ${name}: ${passed ? "PASS" : "FAIL"}`);
    }
  }

  return lines.join("\n");
}

function formatMap(m: Record<string, number>): string {
  const entries = Object.entries(m);
  if (entries.length === 0) return "{}";
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return `{${entries.map(([k, v]) => `${k}:${v}`).join(",")}}`;
}

export async function cmdScorecard(
  client: HomeRailClient,
  runId: string,
  json: boolean,
  opts: { sourceIssue?: string } = {},
): Promise<number> {
  let resp;
  try {
    resp = await client.getScorecardWithOptions(runId, opts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    return 1;
  }
  if (!resp.success) {
    console.error(`Error: ${resp.message}`);
    return 1;
  }

  const result = resp.data as ScorecardResponse;

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderScorecardText(result));
  }

  return result.passed ? 0 : 1;
}
