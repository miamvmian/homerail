/**
 * dag-quick command — Show compact DAG status snapshot
 */

import type { HomeRailClient } from "../client.js";
import {
  buildDagSnapshot,
  renderSnapshot,
  renderSnapshotJson,
} from "../dag.js";

export async function cmdDagQuick(
  client: HomeRailClient,
  runId: string,
  events: number,
  json: boolean,
): Promise<number> {
  const snap = await buildDagSnapshot(client, runId, Math.max(events, 1));
  if (json) {
    console.log(renderSnapshotJson(snap));
  } else {
    console.log(renderSnapshot(snap));
  }
  return 0;
}
