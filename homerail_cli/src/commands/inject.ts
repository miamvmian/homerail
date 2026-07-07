/**
 * inject command — Inject an instruction into a DAG node
 */

import type { HomeRailClient } from "../client.js";

export async function cmdInject(
  client: HomeRailClient,
  runId: string,
  nodeId: string,
  instruction: string,
  mode: string,
): Promise<number> {
  const resp = await client.inject(runId, nodeId, instruction, mode);
  if (!resp.success) {
    console.error(`Error: ${resp.message}`);
    return 1;
  }
  console.log(`Injected to ${nodeId} @ ${runId}`);
  if (resp.message) {
    console.log(`  ${resp.message}`);
  }
  return 0;
}
