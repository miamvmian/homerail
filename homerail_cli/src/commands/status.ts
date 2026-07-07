import type { Command } from "commander";
import { getClient } from "../index.js";
import type { BaseResponse } from "../client.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status <run_id>")
    .description("Check run status")
    .action(async (runId: string) => {
      const globalOpts = program.opts() as { json?: boolean; baseUrl?: string };
      const client = getClient(globalOpts);

      try {
        const resp = await client.get<BaseResponse>(
          `/api/runs/${encodeURIComponent(runId)}/status`,
        );

        if (globalOpts.json) {
          console.log(JSON.stringify(resp.data ?? resp));
          return;
        }

        const data = resp.data as Record<string, unknown> | undefined;
        if (data) {
          console.log(`Run:      ${data.run_id ?? data.runId ?? runId}`);
          console.log(`Status:   ${data.status ?? "?"}`);
          if (data.current_phase) console.log(`Phase:    ${data.current_phase}`);
          if (data.created_at) console.log(`Created:  ${data.created_at}`);
          if (data.completed_at) console.log(`Finished: ${data.completed_at}`);
          const nodeStates = data.node_states as
            | Record<string, string>
            | undefined;
          if (nodeStates && Object.keys(nodeStates).length > 0) {
            console.log("\nNode States:");
            for (const [node, state] of Object.entries(nodeStates)) {
              console.log(`  ${node}: ${state}`);
            }
          }
        } else {
          console.log(resp.message || "No status available.");
        }
      } catch (err: unknown) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
