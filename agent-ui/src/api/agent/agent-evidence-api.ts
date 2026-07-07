/**
 * ============================================================================
 * Agent Evidence API - Agent 证据 Facade
 * ============================================================================
 *
 * 封装 change-api 和 run-api 中与 Agent 证据收集相关的调用，
 * 包括变更证据和运行摘要。
 *
 * Agent UI 组件应通过本模块而非直接引用 change-api / run-api。
 */

import { http } from '../clients/http-client'
import type {
  AgentChangeEvidence,
  AgentRunSummary,
} from './agent.types'
import {
  getAgentDataPayload,
  normalizeChangeEvidence,
  normalizeRunSummary,
} from './agent.types'

/**
 * ============================================================================
 * Raw re-exports for backward-compatible migration
 * ============================================================================
 *
 * Components importing directly from @/api/services/change-api or
 * @/api/services/run-api should migrate to these wrappers via @/api/agent.
 */
export async function getChange(projectId: string, changeId: string): Promise<unknown> {
  return http.get(`/api/projects/${encodeURIComponent(projectId)}/changes/${encodeURIComponent(changeId)}`)
}

export async function getRun(runId: string): Promise<unknown> {
  return http.get(`/api/runs/${encodeURIComponent(runId)}`)
}

/**
 * Agent Evidence API facade
 */
export const agentEvidenceApi = {
  /**
   * 获取变更证据
   * 委托给 change-api.getChange
   */
  async getChangeEvidence(projectId: string, changeId: string): Promise<AgentChangeEvidence> {
    const raw = await getChange(projectId, changeId)
    return normalizeChangeEvidence(getAgentDataPayload(raw))
  },

  /**
   * 获取运行摘要
   * 委托给 run-api.getRun
   */
  async getRunSummary(runId: string): Promise<AgentRunSummary> {
    const raw = await getRun(runId)
    return normalizeRunSummary(getAgentDataPayload(raw))
  },

  /**
   * 获取运行详情（与 getRunSummary 使用相同底层 API）
   * 委托给 run-api.getRun
   */
  async getRunDetail(runId: string): Promise<AgentRunSummary> {
    const raw = await getRun(runId)
    return normalizeRunSummary(getAgentDataPayload(raw))
  },
}
