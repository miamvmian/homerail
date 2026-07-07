/**
 * €” Settings Storage Info Route.
 *
 * Source Issue: #956
 *
 * Returns real storage location and retention information for
 * persisted runs, sessions, events, and evidence.
 *
 * Read-only endpoint; no mutation.
 */

import * as http from "node:http";
import { getDataRoot, getDbPath, getSessionStoreRoot } from "../config/env.js";
import { listPersistedRunIds } from "../persistence/store.js";
import { sessionsDir } from "../persistence/agent-sessions.js";

interface StorageInfoData {
  data_root: string;
  db_path: string;
  runs_count: number;
  sessions_dir: string;
  session_store_root: string;
  retention_supported: boolean;
  cleanup_supported: boolean;
  cleanup_tracked_gap: boolean;
  cleanup_next_action: string;
  export_supported: boolean;
  export_tracked_gap: boolean;
  export_next_action: string;
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function settingsStorageInfoHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  if (req.method !== "GET") return false;

  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (pathname !== "/api/settings/storage-info") return false;

  const data: StorageInfoData = {
    data_root: getDataRoot(),
    db_path: getDbPath(),
    runs_count: listPersistedRunIds().length,
    sessions_dir: sessionsDir(),
    session_store_root: getSessionStoreRoot(),
    retention_supported: true,
    cleanup_supported: false,
    cleanup_tracked_gap: true,
    cleanup_next_action:
      "Implement run cleanup/retention API in TS Manager backend",
    export_supported: false,
    export_tracked_gap: true,
    export_next_action:
      "Implement run evidence export API in TS Manager backend",
  };

  json(res, 200, {
    success: true,
    message: "settings storage-info retrieved",
    data,
  });

  return true;
}
