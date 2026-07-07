/**
 * ============================================================================
 * Memory API - KuzuDB memory query service
 * ============================================================================
 */

import { http } from '../clients/http-client'
import type {
  MemoryListResponse,
  MemoryStats,
  MemoryListParams,
} from '../types/memory.types'
import type { BaseResponse } from '../types/common.types'

/**
 * List memories with optional filters
 */
export async function listMemories(
  params?: MemoryListParams
): Promise<BaseResponse<MemoryListResponse>> {
  const queryParams = new URLSearchParams()

  if (params?.user_id) {
    queryParams.append('user_id', params.user_id)
  }
  if (params?.query) {
    queryParams.append('query', params.query)
  }
  if (params?.kind) {
    queryParams.append('kind', params.kind)
  }
  if (params?.topic) {
    queryParams.append('topic', params.topic)
  }
  if (params?.top_k !== undefined) {
    queryParams.append('top_k', params.top_k.toString())
  }

  const queryString = queryParams.toString()
  const url = `/api/memory/memories${queryString ? `?${queryString}` : ''}`

  return http.get<BaseResponse<MemoryListResponse>>(url) as unknown as Promise<BaseResponse<MemoryListResponse>>
}

/**
 * Get memory statistics
 */
export async function getMemoryStats(
  userId?: string
): Promise<BaseResponse<MemoryStats>> {
  const queryString = userId ? `?user_id=${userId}` : ''
  return http.get<BaseResponse<MemoryStats>>(`/api/memory/stats${queryString}`) as unknown as Promise<BaseResponse<MemoryStats>>
}

/**
 * Delete a memory by ID
 */
export async function deleteMemory(
  memoryId: number,
  userId?: string
): Promise<BaseResponse<{ deleted_id: number }>> {
  const queryString = userId ? `?user_id=${userId}` : ''
  return http.delete<BaseResponse<{ deleted_id: number }>>(`/api/memory/${memoryId}${queryString}`) as unknown as Promise<BaseResponse<{ deleted_id: number }>>
}

/**
 * Create a memory. Backend currently accepts fields as query params.
 */
export async function createMemory(params: {
  user_id?: string
  content: string
  kind?: string
  topic?: string
}): Promise<BaseResponse<{ id: number; content: string; kind: string }>> {
  const queryParams = new URLSearchParams()
  if (params.user_id) queryParams.append('user_id', params.user_id)
  queryParams.append('content', params.content)
  if (params.kind) queryParams.append('kind', params.kind)
  if (params.topic) queryParams.append('topic', params.topic)
  return http.post<BaseResponse<{ id: number; content: string; kind: string }>>(
    `/api/memory/memories?${queryParams.toString()}`,
  ) as unknown as Promise<BaseResponse<{ id: number; content: string; kind: string }>>
}

// ============================================================================
// Memory API Object
// ============================================================================

export const memoryApi = {
  list: listMemories,
  getStats: getMemoryStats,
  create: createMemory,
  delete: deleteMemory,
}
