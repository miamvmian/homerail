/**
 * ============================================================================
 * Agent Facade Types - Agent UI Facade 类型定义
 * ============================================================================
 *
 * 定义 Agent UI 层专用的轻量类型。
 * 这些类型与底层 project/change/run API 类型解耦，
 * 避免底层 API 类型变更直接影响 Agent UI。
 *
 * 注意：不引用 project.types / change.types / run.types 中的类型。
 */

// ============================================================================
// Project Related Types
// ============================================================================

/**
 * Agent UI 所需的项目信息（精简版）
 */
export interface AgentProject {
  id: string
  name: string
  description: string
  status?: string
  created_at: string
  updated_at: string
}

/**
 * 项目列表查询参数
 */
export interface AgentProjectListParams {
  search?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Chat / Runtime Types
// ============================================================================

/**
 * Agent 聊天消息
 */
export interface AgentChatMessage {
  role: string
  content: string
  timestamp?: string
  run_id?: string
  evidence_id?: string
}

/**
 * Agent 聊天请求
 */
export interface AgentChatRequest {
  project_id: string
  message: string
  session_id?: string
  context?: Record<string, unknown>
}

/**
 * Agent 聊天响应
 */
export interface AgentChatResponse {
  reply: string
  session_id: string
  status: string
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Agent 会话信息
 */
export interface AgentSession {
  id: string
  project_id: string
  status: string
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown>
}

export interface AgentNativeSessionRequest {
  session_id?: string
  metadata?: Record<string, unknown>
}

export interface AgentNativeTextTurnRequest {
  message: string
}

export interface AgentNativeTextTurnResponse {
  session_id: string
  run_id: string
  turn_id: string
  user_message: AgentChatMessage
  assistant_message: AgentChatMessage
}

/**
 * 会话列表查询参数
 */
export interface AgentSessionListParams {
  project_id?: string
  limit?: number
}

// ============================================================================
// Run Summary Types
// ============================================================================

/**
 * Agent 运行摘要
 */
export interface AgentRunSummary {
  id: string
  status: string
  created_at: string
  completed_at?: string
}

/**
 * 运行审计数据
 */
export interface AgentRunAuditData {
  run_id: string
  summary: string
  details: Record<string, unknown>
}

// ============================================================================
// Evidence / Change Types
// ============================================================================

/**
 * Agent 变更证据
 */
export interface AgentChangeEvidence {
  id: string
  project_id: string
  title: string
  status: string
  diff_summary?: string
  created_at: string
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Agent 存储信息
 */
export interface AgentStorageInfo {
  id: string
  name: string
  type: string
}

// ============================================================================
// Normalization Helpers
// ============================================================================

type AgentRecord = Record<string, unknown>

export function asAgentRecord(raw: unknown): AgentRecord {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as AgentRecord
    : {}
}

export function getAgentDataPayload(raw: unknown): unknown {
  const record = asAgentRecord(raw)
  return Object.prototype.hasOwnProperty.call(record, 'data') ? record.data : raw
}

export function getAgentArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

export function getAgentString(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

export function getOptionalAgentString(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}

/**
 * 将原始 API 响应数据归一化为 AgentProject
 */
export function normalizeProject(raw: unknown): AgentProject {
  const record = asAgentRecord(raw)
  return {
    id: getAgentString(record.id),
    name: getAgentString(record.name),
    description: getAgentString(record.description),
    status: getOptionalAgentString(record.status),
    created_at: getAgentString(record.created_at),
    updated_at: getAgentString(record.updated_at),
  }
}

/**
 * 将原始 API 响应数据归一化为 AgentSession
 */
export function normalizeSession(raw: unknown): AgentSession {
  const record = asAgentRecord(raw)
  return {
    id: getAgentString(record.id) || getAgentString(record.session_id),
    project_id: getAgentString(record.project_id),
    status: getAgentString(record.status),
    created_at: getAgentString(record.created_at),
    updated_at: getAgentString(record.updated_at),
    metadata: asAgentRecord(record.metadata),
  }
}

export function normalizeChatMessage(raw: unknown): AgentChatMessage {
  const record = asAgentRecord(raw)
  return {
    role: getAgentString(record.role) || getAgentString(record.type),
    content: typeof record.content === 'string'
      ? record.content
      : JSON.stringify(record.content ?? ''),
    timestamp: getAgentString(record.timestamp) || getAgentString(record.created_at),
    run_id: getOptionalAgentString(record.run_id),
    evidence_id: getOptionalAgentString(record.evidence_id),
  }
}

export function normalizeNativeTextTurn(raw: unknown): AgentNativeTextTurnResponse {
  const record = asAgentRecord(raw)
  return {
    session_id: getAgentString(record.session_id),
    run_id: getAgentString(record.run_id),
    turn_id: getAgentString(record.turn_id),
    user_message: normalizeChatMessage(record.user_message),
    assistant_message: normalizeChatMessage(record.assistant_message),
  }
}

/**
 * 将原始 API 响应数据归一化为 AgentRunSummary
 */
export function normalizeRunSummary(raw: unknown): AgentRunSummary {
  const record = asAgentRecord(raw)
  return {
    id: getAgentString(record.run_id) || getAgentString(record.id),
    status: getAgentString(record.status),
    created_at: getAgentString(record.created_at),
    completed_at: getOptionalAgentString(record.completed_at),
  }
}

/**
 * 将原始 API 响应数据归一化为 AgentChangeEvidence
 */
export function normalizeChangeEvidence(raw: unknown): AgentChangeEvidence {
  const record = asAgentRecord(raw)
  return {
    id: getAgentString(record.id),
    project_id: getAgentString(record.project_id),
    title: getAgentString(record.title),
    status: getAgentString(record.status),
    diff_summary: getOptionalAgentString(record.diff_summary),
    created_at: getAgentString(record.created_at),
  }
}
