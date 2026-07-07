import * as path from "node:path";
import type { PersistedRunSnapshot, PersistedEvent } from "../persistence/types.js";
import { loadRunSnapshot } from "../persistence/store.js";
import { encodeJson, getDb, parseJsonRow } from "../persistence/db.js";
import { computeScorecard } from "./scorecard.js";
import { getHomerailHome } from "../config/env.js";

// Allowed node types matching homerail_cli ALLOWED_NODE_TYPES
const ALLOWED_NODE_TYPES = new Set([
  "UserGoal",
  "Issue",
  "Run",
  "PullRequest",
  "OrchestrationTemplate",
  "RuntimeProfile",
  "Provider",
  "Model",
  "WorkerAgent",
  "Tool",
  "Skill",
  "Hook",
  "ArtifactContract",
  "ScorecardResult",
  "FailureRootCause",
  "Lesson",
  "RunSignal",
]);

export interface ExperienceNode {
  type: string;
  id: string;
  [key: string]: unknown;
}

export interface ExperienceRelationship {
  type: string;
  source_id: string;
  target_id: string;
  [key: string]: unknown;
}

export interface ExperienceDelta {
  source_run_id: string;
  extraction: {
    extractor: string;
    extracted_at: string;
    schema_version: string;
  };
  promoted: boolean;
  evidence: string[];
  upsert_nodes: ExperienceNode[];
  upsert_relationships: ExperienceRelationship[];
}

export interface IngestionSummary {
  run_id: string;
  delta_summary: {
    nodes: number;
    relationships: number;
    signals: number;
    failures: number;
    lessons: number;
  };
  graph_path: string;
}

function _isoNow(): string {
  return new Date().toISOString();
}

function _safeNodeType(type: string): string {
  if (ALLOWED_NODE_TYPES.has(type)) return type;
  return "RunSignal";
}

function _extractInterventionSignals(events: PersistedEvent[]): ExperienceNode[] {
  const signals: ExperienceNode[] = [];
  const injectedEvents = events.filter((e) => e.type === "dag:instruction_injected");
  const deliveredEvents = events.filter((e) => e.type === "dag:instruction_delivered");
  const failedEvents = events.filter((e) => e.type === "dag:instruction_delivery_failed");

  const totalInterventions = injectedEvents.length;
  if (totalInterventions > 0) {
    signals.push({
      type: "RunSignal",
      id: `signal-intervention-total`,
      name: "intervention.total",
      value: totalInterventions,
      scope: "run",
    });
  }

  if (deliveredEvents.length > 0) {
    signals.push({
      type: "RunSignal",
      id: `signal-intervention-delivered`,
      name: "intervention.delivered",
      value: deliveredEvents.length,
      scope: "run",
    });
  }

  if (failedEvents.length > 0) {
    signals.push({
      type: "RunSignal",
      id: `signal-intervention-failed`,
      name: "intervention.delivery_failed",
      value: failedEvents.length,
      scope: "run",
    });
  }

  // Per-node intervention counts
  const byNode: Record<string, number> = {};
  for (const ev of injectedEvents) {
    const p = ev.payload as unknown as Record<string, unknown>;
    const nodeId = typeof p.nodeId === "string" ? p.nodeId : "unknown";
    byNode[nodeId] = (byNode[nodeId] || 0) + 1;
  }
  for (const [nodeId, count] of Object.entries(byNode)) {
    signals.push({
      type: "RunSignal",
      id: `signal-intervention-node-${nodeId}`,
      name: `intervention.node.${nodeId}.count`,
      value: count,
      scope: "run",
    });
  }

  return signals;
}

export function buildExperienceDelta(snapshot: PersistedRunSnapshot): ExperienceDelta {
  const runId = snapshot.metadata.runId;
  const nodes: ExperienceNode[] = [];
  const rels: ExperienceRelationship[] = [];
  const evidenceItems: string[] = [];

  // Run node
  const runNodeId = `run-${runId}`;
  const runNode: ExperienceNode = {
    type: "Run",
    id: runNodeId,
    run_id: runId,
    status: snapshot.metadata.status,
    template: snapshot.metadata.workflowName || "",
    workflow_id: snapshot.metadata.workflowId || "",
  };
  nodes.push(runNode);

  // WorkerAgent nodes from graph
  const graphNodes = snapshot.metadata.graph?.nodes ?? [];
  for (const graphNode of graphNodes) {
    const nodeId = graphNode.node_id;
    const agentId = `agent-${runId}-${nodeId}`;
    const agentNode: ExperienceNode = {
      type: "WorkerAgent",
      id: agentId,
      role: graphNode.agent || nodeId,
      node_id: nodeId,
      status: snapshot.metadata.nodeStates[nodeId] || "PENDING",
    };
    nodes.push(agentNode);
    rels.push({
      type: "ExecutedBy",
      source_id: runNodeId,
      target_id: agentId,
    });
  }

  // ScorecardResult node
  const scorecard = computeScorecard(snapshot);
  const scorecardId = `scorecard-${runId}`;
  const scorecardNode: ExperienceNode = {
    type: "ScorecardResult",
    id: scorecardId,
    passed: scorecard.passed,
    verdict: scorecard.verdict,
    score: scorecard.score,
    total: scorecard.total,
  };
  nodes.push(scorecardNode);
  rels.push({
    type: "ScoredBy",
    source_id: runNodeId,
    target_id: scorecardId,
  });

  // FailureRootCause + Lesson nodes from failed scorecard checks
  let failureCount = 0;
  let lessonCount = 0;
  for (const check of scorecard.checks) {
    if (!check.passed) {
      failureCount++;
      lessonCount++;
      const nameSlug = check.name.replace(/\s+/g, "-");
      const failureId = `failure-${runId}-${nameSlug}`;
      const lessonId = `lesson-${runId}-${nameSlug}`;

      nodes.push({
        type: "FailureRootCause",
        id: failureId,
        description: check.detail,
        category: check.severity,
      });
      rels.push({
        type: "HasFailure",
        source_id: scorecardId,
        target_id: failureId,
      });

      nodes.push({
        type: "Lesson",
        id: lessonId,
        summary: check.detail,
        category: `scorecard.${check.name}`,
        action: check.detail,
      });
      rels.push({
        type: "HasLesson",
        source_id: failureId,
        target_id: lessonId,
      });
    }
  }

  // RunSignal nodes
  const signalNodes: ExperienceNode[] = [
    {
      type: "RunSignal",
      id: `signal-${runId}-events`,
      name: "dag.events.total",
      value: snapshot.events.length,
      scope: runId,
    },
    {
      type: "RunSignal",
      id: `signal-${runId}-handoffs`,
      name: "dag.handoffs.total",
      value: snapshot.handoffs.length,
      scope: runId,
    },
    {
      type: "RunSignal",
      id: `signal-${runId}-status`,
      name: "outcome.status",
      value: snapshot.metadata.status,
      scope: runId,
    },
  ];

  // Intervention signals from events
  const interventionSignals = _extractInterventionSignals(snapshot.events);
  signalNodes.push(...interventionSignals);

  nodes.push(...signalNodes);

  evidenceItems.push(`manager-ts://runs/${runId}`);

  return {
    source_run_id: runId,
    extraction: {
      extractor: "homerail-manager-ts",
      extracted_at: _isoNow(),
      schema_version: "0.1",
    },
    promoted: false,
    evidence: evidenceItems,
    upsert_nodes: nodes,
    upsert_relationships: rels,
  };
}

export interface ExperienceGraphSnapshot {
  nodes: ExperienceNode[];
  relationships: ExperienceRelationship[];
  updatedAt: string | null;
}

function graphStorageUri(): string {
  return "sqlite://manager/experience_graph";
}

export function listExperienceGraphFromDb(): ExperienceGraphSnapshot {
  const db = getDb();
  const nodeRows = db
    .prepare("SELECT data, updated_at FROM experience_nodes ORDER BY updated_at DESC, id")
    .all() as Array<{ data: string; updated_at: string }>;
  const relRows = db
    .prepare("SELECT data, updated_at FROM experience_relationships ORDER BY updated_at DESC, rel_key")
    .all() as Array<{ data: string; updated_at: string }>;
  const nodes = nodeRows
    .map((row) => {
      try {
        return parseJsonRow<ExperienceNode>(row.data);
      } catch {
        return undefined;
      }
    })
    .filter((node): node is ExperienceNode => Boolean(node?.id));
  const relationships = relRows
    .map((row) => {
      try {
        return parseJsonRow<ExperienceRelationship>(row.data);
      } catch {
        return undefined;
      }
    })
    .filter((rel): rel is ExperienceRelationship => Boolean(rel?.source_id && rel?.target_id));
  const updatedAt = [...nodeRows, ...relRows]
    .map((row) => row.updated_at)
    .sort()
    .at(-1) ?? null;
  return { nodes, relationships, updatedAt };
}

export function applyExperienceDelta(
  delta: ExperienceDelta,
  _experienceDir: string,
): IngestionSummary {
  let nodesUpserted = 0;
  let relsUpserted = 0;
  const updatedAt = _isoNow();
  const db = getDb();
  db.transaction(() => {
    const nodeStmt = db.prepare(`
      INSERT INTO experience_nodes(id, node_type, updated_at, data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        node_type = excluded.node_type,
        updated_at = excluded.updated_at,
        data = excluded.data
    `);
    for (const node of delta.upsert_nodes) {
      const safeNode = { ...node, type: _safeNodeType(String(node.type || "")) };
      nodeStmt.run(safeNode.id, safeNode.type, updatedAt, encodeJson(safeNode));
      nodesUpserted++;
    }
    const relStmt = db.prepare(`
      INSERT INTO experience_relationships(rel_key, rel_type, source_id, target_id, updated_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(rel_key) DO UPDATE SET
        rel_type = excluded.rel_type,
        source_id = excluded.source_id,
        target_id = excluded.target_id,
        updated_at = excluded.updated_at,
        data = excluded.data
    `);
    for (const rel of delta.upsert_relationships) {
      const key = `${rel.type}:${rel.source_id}:${rel.target_id}`;
      relStmt.run(key, rel.type, rel.source_id, rel.target_id, updatedAt, encodeJson(rel));
      relsUpserted++;
    }
  })();

  const signalCount = delta.upsert_nodes.filter((n) => n.type === "RunSignal").length;
  const failureCount = delta.upsert_nodes.filter((n) => n.type === "FailureRootCause").length;
  const lessonCount = delta.upsert_nodes.filter((n) => n.type === "Lesson").length;

  return {
    run_id: delta.source_run_id,
    delta_summary: {
      nodes: nodesUpserted,
      relationships: relsUpserted,
      signals: signalCount,
      failures: failureCount,
      lessons: lessonCount,
    },
    graph_path: graphStorageUri(),
  };
}

export function getExperienceDir(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.HOMERAIL_EXPERIENCE_DIR) return process.env.HOMERAIL_EXPERIENCE_DIR;
  const assetRoot = process.env.HOMERAIL_ASSET_DIR?.trim() || path.join(getHomerailHome(), "asset");
  return path.join(path.resolve(assetRoot), "run-experience-memory");
}

export function ingestRunExperience(
  runId: string,
  experienceDir?: string,
): IngestionSummary {
  const snapshot = loadRunSnapshot(runId);
  if (!snapshot) {
    throw new Error(`Run not found: ${runId}`);
  }
  const delta = buildExperienceDelta(snapshot);

  return applyExperienceDelta(delta, getExperienceDir(experienceDir));
}
