import type { DAGNodeStatus } from '@/api/types/dag.types'

export type AgentInspectorTab =
  | 'progress'
  | 'artifacts'
  | 'evidence'
  | 'settings'
  | 'nodes'
  | 'topology'
  | 'logs'

export interface AgentCardInfo {
  id: string
  name: string
  status: DAGNodeStatus
  agentName: string
  startedAt?: string
  completedAt?: string
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  type: 'text' | 'thinking' | 'tool_call' | 'status'
  timestamp: string
  toolId?: string
  toolName?: string
  toolSummary?: string
  toolResult?: string
  status?: 'pending' | 'completed' | 'failed'
}

export interface ManagerSessionItem {
  session_id: string
  project_id: string | null
  parent_session_id?: string | null
  worker_id?: string | null
  status: string
  prompt: string | null
  start_time: string | null
  end_time: string | null
  message_count: number
  run_ids: string[]
  duration_seconds: number | null
  manager_provider_name?: string | null
  manager_model_name?: string | null
  manager_agent_config?: Record<string, unknown>
}
