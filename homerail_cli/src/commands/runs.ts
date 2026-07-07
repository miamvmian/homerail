import type { Command } from "commander";
import { getClient } from "../index.js";
import type { BaseResponse } from "../client.js";

export function registerRunsCommand(program: Command): void {
  program
    .command("runs")
    .description("List DAG runs")
    .option("--status <status>", "Filter by status (pending, running, completed, failed, cancelled)")
    .option("--limit <n>", "Max runs to show", "50")
    .option("--offset <n>", "Offset", "0")
    .action(
      async (opts: { status?: string; limit: string; offset: string }) => {
        const globalOpts = program.opts() as {
          json?: boolean;
          baseUrl?: string;
          requestTimeout?: number;
        };
        const client = getClient(globalOpts);

        const params = new URLSearchParams();
        params.set("limit", opts.limit);
        params.set("offset", opts.offset);
        if (opts.status) params.set("status", opts.status);

        try {
          const resp = await client.get<BaseResponse>(
            `/api/runs?${params.toString()}`,
          );

          const data = resp.data as Record<string, unknown> | undefined;
          const runs = (data?.runs ?? []) as Array<Record<string, unknown>>;

          if (globalOpts.json) {
            console.log(JSON.stringify(runs));
            return;
          }

          if (runs.length === 0) {
            console.log("No runs found.");
            return;
          }

          console.log(
            `${"Run ID".padEnd(26)} ${"Status".padEnd(12)} ${"Template".padEnd(26)} Created`,
          );
          console.log("-".repeat(82));
          for (const run of runs) {
            const runId = String(
              run.runId ?? run.run_id ?? run.id ?? "?",
            ).slice(0, 26);
            const status = String(run.status ?? "?");
            const template = truncate(
              String(
                run.template ??
                  run.orchestrationName ??
                  run.workflowName ??
                  "-",
              ),
              26,
            );
            const created = String(run.createdAt ?? run.created_at ?? "-");
            console.log(
              `${runId.padEnd(26)} ${status.padEnd(12)} ${template.padEnd(26)} ${created}`,
            );
          }
        } catch (err: unknown) {
          console.error(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exitCode = 1;
        }
      },
    );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}
