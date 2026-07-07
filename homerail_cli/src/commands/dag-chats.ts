/**
 * dag-chats command — Per-node chat/tool activity summaries
 */

import type { HomeRailClient } from "../client.js";
import { buildDagChats, renderChats } from "../dag.js";

export async function cmdDagChats(
  client: HomeRailClient,
  runId: string,
  nodes: string[] | undefined,
  tools: number,
  rawTools: boolean,
  json: boolean,
): Promise<number> {
  const summaries = await buildDagChats(
    client,
    runId,
    nodes,
    tools,
    rawTools,
  );

  if (json) {
    console.log(JSON.stringify({ run_id: runId, nodes: summaries }));
  } else {
    console.log(renderChats(runId, summaries));
  }
  return 0;
}
