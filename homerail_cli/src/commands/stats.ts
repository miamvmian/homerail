/**
 * stats command — Show CLI usage statistics (local-only)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function statsFile(): string {
  const homerailHome = process.env.HOMERAIL_HOME?.trim() || path.join(os.homedir(), ".homerail");
  return path.join(homerailHome, "cli", "stats.jsonl");
}

interface StatRecord {
  timestamp?: string;
  template?: string;
  agents?: string[];
  [key: string]: unknown;
}

function loadStats(): StatRecord[] {
  const filePath = statsFile();
  if (!fs.existsSync(filePath)) return [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  const records: StatRecord[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as StatRecord);
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

function getSummary(records: StatRecord[]): { total: number; earliest: string | null; latest: string | null } {
  if (records.length === 0) return { total: 0, earliest: null, latest: null };
  const timestamps = records
    .map((r) => r.timestamp)
    .filter((t): t is string => typeof t === "string");
  return {
    total: records.length,
    earliest: timestamps.length > 0 ? timestamps.reduce((a, b) => (a < b ? a : b)) : null,
    latest: timestamps.length > 0 ? timestamps.reduce((a, b) => (a > b ? a : b)) : null,
  };
}

function getTopOrchestrations(records: StatRecord[], limit: number): { template: string; count: number; pct: number }[] {
  const counter = new Map<string, number>();
  for (const r of records) {
    if (typeof r.template === "string") {
      counter.set(r.template, (counter.get(r.template) ?? 0) + 1);
    }
  }
  const total = [...counter.values()].reduce((a, b) => a + b, 0);
  const items = [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
  return items.map(([tpl, cnt]) => ({
    template: tpl,
    count: cnt,
    pct: total > 0 ? Math.round((cnt / total) * 1000) / 10 : 0,
  }));
}

function getTopAgents(records: StatRecord[], limit: number): { agent: string; count: number }[] {
  const counter = new Map<string, number>();
  for (const r of records) {
    if (Array.isArray(r.agents)) {
      for (const agent of r.agents) {
        if (typeof agent === "string") {
          counter.set(agent, (counter.get(agent) ?? 0) + 1);
        }
      }
    }
  }
  const items = [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
  return items.map(([agent, cnt]) => ({ agent, count: cnt }));
}

function getCombos(records: StatRecord[], limit: number): { template: string; agents: string[]; agent_count: number; count: number }[] {
  const counter = new Map<string, { template: string; agents: string[]; count: number }>();
  for (const r of records) {
    const tpl = typeof r.template === "string" ? r.template : "?";
    const agents = Array.isArray(r.agents)
      ? r.agents.filter((a): a is string => typeof a === "string")
      : [];
    const key = `${tpl}\0${agents.join(",")}`;
    const existing = counter.get(key);
    if (existing) {
      existing.count++;
    } else {
      counter.set(key, { template: tpl, agents, count: 1 });
    }
  }
  return [...counter.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => ({
      template: item.template,
      agents: item.agents,
      agent_count: item.agents.length,
      count: item.count,
    }));
}

function clearStats(): number {
  const records = loadStats();
  const filePath = statsFile();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return records.length;
}

function truncate(s: string, maxChars: number): string {
  return [...s].slice(0, maxChars).join("");
}

export function cmdStats(
  top: boolean,
  byOrchestration: boolean,
  byAgent: boolean,
  clean: boolean,
  limit: number,
  verbose: boolean,
  json: boolean,
): number {
  const effectiveLimit = Math.max(limit, 1);

  if (clean) {
    const count = clearStats();
    console.log(`Cleared ${count} stat record(s).`);
    return 0;
  }

  const records = loadStats();
  const summary = getSummary(records);

  if (json) {
    const output: Record<string, unknown> = { summary };
    const topOrchestrations = getTopOrchestrations(records, effectiveLimit);
    const topAgents = getTopAgents(records, effectiveLimit);
    const combos = getCombos(records, effectiveLimit);

    if (byOrchestration || !byAgent) {
      output.top_orchestrations = topOrchestrations;
    }
    if (byAgent || !byOrchestration) {
      output.top_agents = topAgents;
    }
    if (!byOrchestration && !byAgent) {
      output.combos = combos;
    }
    console.log(JSON.stringify(output, null, 2));
    return 0;
  }

  if (summary.total === 0) {
    console.log("No stats recorded yet. Run `hr run <template> --prompt <prompt>` to start tracking.");
    return 0;
  }

  const earliest = summary.earliest ?? "";
  if (earliest) {
    console.log(`Total calls: ${summary.total}`);
    console.log(`Earliest: ${truncate(earliest, 10)}`);
    console.log();
  }

  const topOrchestrations = getTopOrchestrations(records, effectiveLimit);
  const topAgents = getTopAgents(records, effectiveLimit);
  const combos = getCombos(records, effectiveLimit);

  if (byOrchestration || !byAgent) {
    console.log(`${"Top orchestrations".padEnd(30)} ${"Count".padStart(6)} ${"Pct".padStart(6)}`);
    console.log("-".repeat(50));
    for (const item of topOrchestrations) {
      console.log(
        `${truncate(item.template, 30).padEnd(30)} ${String(item.count).padStart(6)} (${item.pct.toFixed(1).padStart(5)}%)`,
      );
    }
    console.log();
  }

  if (byAgent || !byOrchestration) {
    console.log(`${"Top agents".padEnd(30)} ${"Count".padStart(6)}`);
    console.log("-".repeat(40));
    for (const item of topAgents) {
      console.log(`${truncate(item.agent, 30).padEnd(30)} ${String(item.count).padStart(6)}`);
    }
    console.log();
  }

  if (!byOrchestration && !byAgent) {
    console.log("Orchestration + Agent combos:");
    console.log("-".repeat(50));
    for (const item of combos) {
      console.log(`  ${item.template} -> ${item.count}x`);
      if (verbose && item.agents.length > 0) {
        console.log(`    agents: ${item.agents.join(",")}`);
      }
    }
    console.log();
  }

  if (top) {
    console.log(`Top orchestrations (limit ${effectiveLimit}):`);
    console.log("-".repeat(50));
    for (const item of topOrchestrations) {
      console.log(`  ${item.template}: ${item.count} (${item.pct.toFixed(1)}%)`);
    }
    console.log();
  }

  return 0;
}
