import { getDb } from "./db.js";
import { assertStatus, type ExperienceIngestStatus } from "./status.js";
import { nowIso } from "./time.js";

export interface ExperienceIngestJob {
  id: string;
  run_id: string;
  status: ExperienceIngestStatus;
  trigger_event: string | null;
  terminal_status: string | null;
  mode: string;
  summary_provider: string | null;
  summary_model: string | null;
  attempts: number;
  exit_code: number | null;
  error_message: string | null;
  output: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MarkExperienceIngestJobFields {
  trigger_event?: string | null;
  terminal_status?: string | null;
  mode?: string | null;
  summary_provider?: string | null;
  summary_model?: string | null;
  attempts?: number;
  exit_code?: number | null;
  error_message?: string | null;
  output?: string | null;
  metadata_json?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

function rowToJob(row: ExperienceIngestJob | undefined): ExperienceIngestJob | undefined {
  if (!row) return undefined;
  assertStatus("experience_ingest", row.status);
  return row;
}

function defaultJob(runId: string, now: string): ExperienceIngestJob {
  return {
    id: `experience-ingest:${runId}`,
    run_id: runId,
    status: "pending",
    trigger_event: null,
    terminal_status: null,
    mode: "hybrid",
    summary_provider: null,
    summary_model: null,
    attempts: 0,
    exit_code: null,
    error_message: null,
    output: null,
    metadata_json: null,
    created_at: now,
    updated_at: now,
    started_at: null,
    completed_at: null,
  };
}

export function getExperienceIngestJobByRunId(runId: string): ExperienceIngestJob | undefined {
  const row = getDb()
    .prepare("SELECT * FROM experience_ingest_jobs WHERE run_id = ?")
    .get(runId) as ExperienceIngestJob | undefined;
  return rowToJob(row);
}

export function markExperienceIngestJob(
  runId: string,
  status: ExperienceIngestStatus,
  fields: MarkExperienceIngestJobFields = {},
): ExperienceIngestJob {
  assertStatus("experience_ingest", status);
  const db = getDb();
  const existing = getExperienceIngestJobByRunId(runId);
  const now = nowIso();
  const next: ExperienceIngestJob = {
    ...(existing ?? defaultJob(runId, now)),
    status,
    updated_at: now,
  };

  if ("trigger_event" in fields) next.trigger_event = fields.trigger_event ?? null;
  if ("terminal_status" in fields) next.terminal_status = fields.terminal_status ?? null;
  if ("mode" in fields) next.mode = fields.mode || "hybrid";
  if ("summary_provider" in fields) next.summary_provider = fields.summary_provider ?? null;
  if ("summary_model" in fields) next.summary_model = fields.summary_model ?? null;
  if ("attempts" in fields && fields.attempts !== undefined) {
    next.attempts = Math.max(0, Math.trunc(fields.attempts));
  }
  if ("exit_code" in fields) next.exit_code = fields.exit_code ?? null;
  if ("error_message" in fields) next.error_message = fields.error_message ?? null;
  if ("output" in fields) next.output = fields.output ?? null;
  if ("metadata_json" in fields) next.metadata_json = fields.metadata_json ?? null;
  if ("started_at" in fields) next.started_at = fields.started_at ?? null;
  if ("completed_at" in fields) next.completed_at = fields.completed_at ?? null;

  db.prepare(`
    INSERT INTO experience_ingest_jobs(
      id, run_id, status, trigger_event, terminal_status, mode,
      summary_provider, summary_model, attempts, exit_code, error_message,
      output, metadata_json, created_at, updated_at, started_at, completed_at
    )
    VALUES (
      @id, @run_id, @status, @trigger_event, @terminal_status, @mode,
      @summary_provider, @summary_model, @attempts, @exit_code, @error_message,
      @output, @metadata_json, @created_at, @updated_at, @started_at, @completed_at
    )
    ON CONFLICT(run_id) DO UPDATE SET
      status = excluded.status,
      trigger_event = excluded.trigger_event,
      terminal_status = excluded.terminal_status,
      mode = excluded.mode,
      summary_provider = excluded.summary_provider,
      summary_model = excluded.summary_model,
      attempts = excluded.attempts,
      exit_code = excluded.exit_code,
      error_message = excluded.error_message,
      output = excluded.output,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at
  `).run(next);

  const saved = getExperienceIngestJobByRunId(runId);
  if (!saved) throw new Error(`Failed to save experience ingest job for run ${runId}`);
  return saved;
}
