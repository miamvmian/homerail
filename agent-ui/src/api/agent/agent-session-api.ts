/**
 * ============================================================================
 * Agent Session API - Agent 会话 Facade
 * ============================================================================
 *
 * 封装 run-api 中与 Manager Chat 会话管理相关的调用，
 * 包括会话的列表、详情、消息历史、关闭和删除。
 *
 * Agent UI 组件应通过本模块而非直接引用 run-api。
 */

import { http } from '../clients/http-client'
import type {
  AgentSession,
  AgentChatMessage,
  AgentNativeSessionRequest,
  AgentNativeTextTurnRequest,
  AgentNativeTextTurnResponse,
} from './agent.types'
import {
  asAgentRecord,
  getAgentArray,
  getAgentDataPayload,
  normalizeChatMessage,
  normalizeNativeTextTurn,
  normalizeSession,
} from './agent.types'

interface AgentRawResponse {
  success?: boolean
  data?: unknown
  message?: string
}

export async function listManagerSessions(projectId: string, limit = 30): Promise<AgentRawResponse> {
  return http.get('/api/manager/sessions', { params: { project_id: projectId, limit } })
}

export async function getManagerSession(sessionId: string): Promise<AgentRawResponse> {
  return http.get(`/api/manager/sessions/${encodeURIComponent(sessionId)}`)
}

export async function getManagerSessionMessages(sessionId: string, limit = 200): Promise<AgentRawResponse> {
  return http.get(`/api/manager/sessions/${encodeURIComponent(sessionId)}/messages`, { params: { limit } })
}

export async function closeManagerSession(sessionId: string): Promise<AgentRawResponse> {
  return http.post(`/api/manager/sessions/${encodeURIComponent(sessionId)}/close`)
}

export async function deleteManagerSession(sessionId: string): Promise<AgentRawResponse> {
  return http.delete(`/api/manager/sessions/${encodeURIComponent(sessionId)}`)
}

/**
 * Agent Session API facade
 */
export const agentSessionApi = {
  /**
   * 创建 native TS Agent Session
   * 委托给 TS Manager /api/agent/sessions
   */
  async createNativeSession(request: AgentNativeSessionRequest = {}): Promise<AgentSession> {
    const raw = await http.post('/api/agent/sessions', request)
    return normalizeSession(getAgentDataPayload(raw))
  },

  /**
   * 提交 native TS Agent text turn
   * 委托给 TS Manager /api/agent/sessions/{session_id}/turns
   */
  async submitNativeTextTurn(
    sessionId: string,
    request: AgentNativeTextTurnRequest,
  ): Promise<AgentNativeTextTurnResponse> {
    const raw = await http.post(`/api/agent/sessions/${encodeURIComponent(sessionId)}/turns`, request)
    return normalizeNativeTextTurn(getAgentDataPayload(raw))
  },

  /**
   * 获取 native TS Agent Session
   * 委托给 TS Manager /api/agent/sessions/{session_id}
   */
  async getNativeSession(sessionId: string): Promise<AgentSession> {
    const raw = await http.get(`/api/agent/sessions/${encodeURIComponent(sessionId)}`)
    return normalizeSession(getAgentDataPayload(raw))
  },

  /**
   * 获取 native TS Agent Session messages
   * 委托给 TS Manager /api/agent/sessions/{session_id}/messages
   */
  async getNativeSessionMessages(sessionId: string): Promise<AgentChatMessage[]> {
    const raw = await http.get(`/api/agent/sessions/${encodeURIComponent(sessionId)}/messages`)
    const data = asAgentRecord(getAgentDataPayload(raw))
    return getAgentArray(data.messages).map((message) => normalizeChatMessage(message))
  },

  /**
   * 列出项目的 Manager Chat 会话
   * 委托给 run-api.listManagerSessions
   */
  async listSessions(projectId: string, limit?: number): Promise<AgentSession[]> {
    const raw = await listManagerSessions(projectId, limit ?? 30)
    const data = getAgentDataPayload(raw)
    const dataRecord = asAgentRecord(data)
    const sessions = Object.prototype.hasOwnProperty.call(dataRecord, 'sessions')
      ? dataRecord.sessions
      : data
    return getAgentArray(sessions).map((session) => normalizeSession(session))
  },

  /**
   * 获取会话详情
   * 委托给 run-api.getManagerSession
   */
  async getSession(sessionId: string): Promise<AgentSession> {
    const raw = await getManagerSession(sessionId)
    return normalizeSession(getAgentDataPayload(raw))
  },

  /**
   * 获取会话消息历史
   * 委托给 run-api.getManagerSessionMessages
   */
  async getSessionMessages(sessionId: string, limit?: number): Promise<AgentChatMessage[]> {
    const raw = await getManagerSessionMessages(sessionId, limit ?? 200)
    const data = getAgentDataPayload(raw)
    const dataRecord = asAgentRecord(data)
    const messages = Object.prototype.hasOwnProperty.call(dataRecord, 'messages')
      ? dataRecord.messages
      : data
    return getAgentArray(messages).map((message) => {
      return normalizeChatMessage(message)
    })
  },

  /**
   * 关闭会话
   * 委托给 run-api.closeManagerSession
   */
  async closeSession(sessionId: string): Promise<void> {
    await closeManagerSession(sessionId)
  },

  /**
   * 删除会话
   * 委托给 run-api.deleteManagerSession
   */
  async deleteSession(sessionId: string): Promise<void> {
    await deleteManagerSession(sessionId)
  },
}
