/**
 * Structured error records — append JSONL to HOMERAIL_HOME/audit/errors.jsonl.
 * @version 0.1.0
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homerailPath } from "../platform/paths.js";

export interface ErrorRecord {
  timestamp: string;
  errorType: string;
  agentBackend: string;
  message: string;
  retryCount: number;
  finalStatus: "retry" | "fatal" | "recovered";
}

export function logError(record: ErrorRecord, baseDir?: string): void {
  const dir = baseDir ?? homerailPath("audit");
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "errors.jsonl"), JSON.stringify(record) + "\n");
}
