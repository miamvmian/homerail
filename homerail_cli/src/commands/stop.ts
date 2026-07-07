import type { Command } from "commander";
import { getClient } from "../index.js";
import type { BaseResponse } from "../client.js";

export function registerStopCommand(program: Command): void {
  program
    .command("stop <run_id>")
    .description("Stop a running DAG run")
    .action(async (runId: string) => {
      const globalOpts = program.opts() as { json?: boolean; baseUrl?: string };
      const client = getClient(globalOpts);

      try {
        const resp = await client.post<BaseResponse>(
          `/api/runs/${encodeURIComponent(runId)}/cancel`,
        );

        if (globalOpts.json) {
          console.log(JSON.stringify(resp));
          return;
        }

        console.log(`Run ${runId} stopped.`);
        if (resp.message) console.log(`  ${resp.message}`);
      } catch (err: unknown) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
