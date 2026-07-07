/**
 * ============================================================================
 * Node Types - 节点相关类型定义
 * ============================================================================
 */

import type {
  ID,
  Timestamp,
  ConnectionStatus,
  BaseResponse,
  Metadata
} from './common.types'

/**
 * 节点模型
 */
export interface Node {
  node_id: ID
  name: string
  region: string
  status: ConnectionStatus
  is_alive: boolean
  last_heartbeat: Timestamp
  docker_host: string
  capabilities: string[]
  resources: {
    cpu_cores: number
    memory_gb: number
    disk_gb: number
  }
  metadata: Metadata
  created_at: Timestamp
  updated_at: Timestamp
}

/**
 * 节点列表响应
 */
export type NodeListResponse = BaseResponse<{
  nodes: Node[]
  total: number
  connected: number
  disconnected: number
}>

/**
 * 节点响应
 */
export type NodeResponse = BaseResponse<Node>

/**
 * 创建节点请求
 */
export interface CreateNodeRequest {
  name: string
  region?: string
  docker_host?: string
  metadata?: Metadata
}

/**
 * 更新节点请求
 */
export interface UpdateNodeRequest {
  name?: string
  region?: string
  metadata?: Metadata
}

/**
 * 节点统计信息
 */
export interface NodeStats {
  total_nodes: number
  connected_nodes: number
  disconnected_nodes: number
  regions: Record<string, number>
  total_cpu_cores: number
  total_memory_gb: number
  total_disk_gb: number
}
