/**
 * ============================================================================
 * Memory Types - KuzuDB Memory API types
 * ============================================================================
 */

export interface MemoryItem {
  id: number
  content: string
  kind: string
  weight: number
  access_count: number
  created_at: string
  last_accessed: string
  topics: string[]
}

export interface MemoryListResponse {
  memories: MemoryItem[]
  total: number
  user_id: string
}

export interface MemoryStats {
  total_memories: number
  by_kind: Record<string, number>
  avg_weight: number
  user_id: string
}

export interface MemoryListParams {
  user_id?: string
  query?: string
  kind?: string
  topic?: string
  top_k?: number
}
