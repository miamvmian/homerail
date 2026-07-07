/**
 * resume command — Fork and resume a DAG node from a SessionStore checkpoint.
 */

import type { HomeRailClient } from "../client.js";

export interface ResumeOptions {
  uuid?: string;
  last?: string;
  instruction?: string;
  sessionId?: string;
}

export async function cmdResume(
  client: HomeRailClient,
  runId: string,
  nodeId: string,
  opts: ResumeOptions,
  jsonOutput: boolean,
): Promise<number> {
  const instruction = opts.instruction?.trim();
  if (!instruction) {
    const payload = {
      success: false,
      error: "missing_instruction",
      message: "Missing required option: --instruction",
      run_id: runId,
      node_id: nodeId,
    };
    if (jsonOutput) console.log(JSON.stringify(payload, null, 2));
    else console.error(`Error: ${payload.message}`);
    return 1;
  }

  const last = opts.last !== undefined ? Number(opts.last) : undefined;
  if (last !== undefined && !Number.isFinite(last)) {
    const payload = {
      success: false,
      error: "invalid_last",
      message: "--last must be a finite number",
      run_id: runId,
      node_id: nodeId,
    };
    if (jsonOutput) console.log(JSON.stringify(payload, null, 2));
    else console.error(`Error: ${payload.message}`);
    return 1;
  }

  const resp = await client.checkpointResume(runId, nodeId, {
    instruction,
    uuid: opts.uuid,
    last,
    sessionId: opts.sessionId,
  });
  if (!resp.success) {
    if (jsonOutput) console.log(JSON.stringify(resp, null, 2));
    else console.error(`Error: ${resp.message}`);
    return 1;
  }
  const data = resp.data as Record<string, unknown> | undefined;
  if (jsonOutput) {
    console.log(JSON.stringify(resp, null, 2));
  } else {
    console.log(`Checkpoint resume scheduled for ${nodeId} @ ${runId}`);
    if (typeof data?.sessionId === "string") console.log(`  session: ${data.sessionId}`);
    if (typeof data?.parentSessionId === "string") console.log(`  parent: ${data.parentSessionId}`);
    if (typeof data?.dispatched === "boolean") console.log(`  dispatched: ${data.dispatched ? "true" : "false"}`);
    if (typeof data?.dispatch_state === "string") console.log(`  dispatch_state: ${data.dispatch_state}`);
    if (typeof data?.dispatch_count === "number") console.log(`  dispatch_count: ${data.dispatch_count}`);
  }
  return 0;
}
