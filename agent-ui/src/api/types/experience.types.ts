export interface ExperienceStructureCoverage {
  status: 'healthy' | 'partial' | 'empty'
  checks: Record<string, boolean>
  message: string
}

export interface ExperienceTemplateStat {
  template: string
  runs: number
  successes: number
  failures: number
  scorecard_passes: number
  success_rate: number
  recent_run_ids: string[]
  problem_categories: string[]
}

export interface ExperienceProblem {
  category: string
  severity: string
  count: number
  description: string
  run_ids: string[]
  lesson_actions: string[]
}

export interface ExperienceLesson {
  id: string
  summary: string
  category: string
  action: string
  updated_at: string
}

export interface ExperienceRecentRun {
  id: string
  run_id: string
  status: string
  template: string
  workflow_id: string
  profile_id: string
  summary: string
  updated_at: string
}

export interface ExperienceGraphPreview {
  nodes: Array<{ id: string; type: string; label: string }>
  edges: Array<{ source_id: string; target_id: string; type: string }>
}

export interface ExperienceGraphSummary {
  available: boolean
  reason: string
  asset_root: string
  graph_path: string
  updated_at: string | null
  node_count: number
  relationship_count: number
  node_counts: Record<string, number>
  relationship_counts: Record<string, number>
  run_count: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  structure_coverage: ExperienceStructureCoverage
  template_stats: ExperienceTemplateStat[]
  problems: ExperienceProblem[]
  lessons: ExperienceLesson[]
  recent_runs: ExperienceRecentRun[]
  graph: ExperienceGraphPreview
}

export interface ExperienceMatchedItem {
  score: number
  node: Record<string, unknown>
}

export interface ExperienceMemoryRef {
  id: string
  title: string
  summary: string
  source: string
}

export interface ExperienceDagContextRequest {
  query: string
  candidate_templates?: string[]
  limit?: number
}

export interface ExperienceDagContext {
  query: string
  prompt_context: string
  memory_refs: ExperienceMemoryRef[]
  template_stats: ExperienceTemplateStat[]
  matched_items: ExperienceMatchedItem[]
}

export interface ExperienceGraphNode {
  id: string
  type: string
  label: string
  summary: string
  properties: Record<string, unknown>
}

export interface ExperienceGraphEdge {
  id: string
  source_id: string
  target_id: string
  type: string
  label: string
  properties: Record<string, unknown>
}

export interface ExperienceGraphDetail {
  available: boolean
  reason: string
  asset_root: string
  graph_path: string
  updated_at: string | null
  total_node_count: number
  total_relationship_count: number
  node_count: number
  relationship_count: number
  node_counts: Record<string, number>
  relationship_counts: Record<string, number>
  query: string
  node_types: string[]
  selected_node_types: string[]
  nodes: ExperienceGraphNode[]
  edges: ExperienceGraphEdge[]
}

export interface ExperienceGraphQuery {
  query?: string
  node_type?: string[]
  limit?: number
  include_neighbors?: boolean
}
