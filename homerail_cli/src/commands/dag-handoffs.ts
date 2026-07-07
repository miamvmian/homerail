/**
 * dag-handoffs command — Show handoff content and contract hook checks
 */

import type { HomeRailClient } from "../client.js";
import { fetchAllEvents, extractHandoffs, renderHandoffs } from "../dag.js";

interface HandoffRecord {
  fromNode?: string;
  from_node?: string;
  port?: string;
  content?: unknown;
}

export async function cmdDagHandoffs(
  client: HomeRailClient,
  runId: string,
  contentLimit: number,
  json: boolean,
): Promise<number> {
  const persisted = await fetchPersistedHandoffs(client, runId, contentLimit);
  const handoffs =
    persisted.length > 0
      ? persisted
      : extractHandoffs(await fetchAllEvents(client, runId), contentLimit);

  if (json) {
    console.log(JSON.stringify({ run_id: runId, handoffs }));
  } else {
    console.log(renderHandoffs(runId, handoffs));
  }
  return 0;
}

async function fetchPersistedHandoffs(
  client: HomeRailClient,
  runId: string,
  contentLimit: number,
): Promise<unknown[]> {
  try {
    const resp = await client.get(
      `/api/runs/${encodeURIComponent(runId)}/handoffs`,
    );
    const data = (resp as { data?: { handoffs?: unknown[] } }).data;
    if (!Array.isArray(data?.handoffs)) return [];
    return data.handoffs.map((raw) => {
      const h = raw as HandoffRecord;
      const content = extractContent(h.content);
      return {
        kind: "handoff",
        type: "handoff",
        node: h.fromNode ?? h.from_node ?? "",
        port: h.port ?? "",
        content: contentLimit > 0 ? truncateChars(content, contentLimit) : content,
      };
    });
  } catch {
    return [];
  }
}

function extractContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

function truncateChars(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
