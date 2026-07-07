/**
 * ============================================================================
 * Common Types - 通用类型定义
 * ============================================================================
 *
 * 定义全系统通用的类型，包括响应格式、分页参数、错误类型等
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * API基础响应格式
 * 对应后端 BaseResponse 模型
 */
export interface BaseResponse<T = unknown> {
  success: boolean
  message: string
  data: T
  error?: string
}

/**
 * 分页参数
 */
export interface PaginationParams {
  limit?: number
  offset?: number
}

/**
 * 分页响应数据
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

/**
 * 搜索参数
 */
export interface SearchParams extends PaginationParams {
  search?: string
}

/**
 * 排序参数
 */
export interface SortParams {
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

// ============================================================================
// Time Types
// ============================================================================

/**
 * 时间戳字符串 (ISO 8601 format)
 */
export type Timestamp = string

/**
 * 带时区的时间信息
 */
export interface TimeInfo {
  created_at: Timestamp
  updated_at: Timestamp
  completed_at?: Timestamp
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * 通用状态枚举
 */
export enum Status {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * 健康检查状态
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

/**
 * 连接状态
 */
export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  RECONNECTING = 'reconnecting'
}

// ============================================================================
// ID Types
// ============================================================================

/**
 * 通用ID类型 (TinyModel生成的16位十六进制字符串)
 */
export type ID = string

/**
 * 项目ID
 */
export type ProjectID = ID

/**
 * 变更ID
 */
export type ChangeID = ID

/**
 * 运行ID
 */
export type RunID = ID

/**
 * 节点ID
 */
export type NodeID = ID

/**
 * Worker ID
 */
export type WorkerID = ID

/**
 * 容器ID
 */
export type ContainerID = ID

/**
 * 镜像ID
 */
export type ImageID = ID

/**
 * 存储配置ID
 */
export type StorageID = ID

/**
 * 编排ID
 */
export type OrchestrationID = ID

// ============================================================================
// Error Types
// ============================================================================

/**
 * API错误详情
 */
export interface ApiErrorDetails {
  code?: number
  message: string
  details?: Record<string, unknown>
  stack?: string
}

/**
 * 验证错误
 */
export interface ValidationError {
  field: string
  message: string
  code?: string
}

/**
 * 业务异常
 */
export interface BusinessError extends ApiErrorDetails {
  type: 'business_error'
  validation_errors?: ValidationError[]
}

/**
 * 网络错误
 */
export interface NetworkError extends ApiErrorDetails {
  type: 'network_error'
  url?: string
  method?: string
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * 通用过滤器
 */
export interface BaseFilter {
  search?: string
  status?: string | string[]
  date_from?: Timestamp
  date_to?: Timestamp
}

/**
 * 项目过滤器
 */
export interface ProjectFilter extends BaseFilter {
  has_active_changes?: boolean
}

/**
 * 变更过滤器
 */
export interface ChangeFilter extends BaseFilter {
  project_id?: ProjectID
  status?: Status | Status[]
}

/**
 * 运行过滤器
 */
export interface RunFilter extends BaseFilter {
  project_id?: ProjectID
  change_id?: ChangeID
}

/**
 * 节点过滤器
 */
export interface NodeFilter extends BaseFilter {
  status?: ConnectionStatus
  region?: string
}

/**
 * Worker过滤器
 */
export interface WorkerFilter extends BaseFilter {
  node_id?: NodeID
  status?: ConnectionStatus
  container_id?: ContainerID
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * 元数据键值对
 */
export interface Metadata {
  [key: string]: unknown
}

/**
 * 标签
 */
export interface Tag {
  key: string
  value: string
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * LLM提供商配置
 */
export interface LLMProvider {
  name: string
  display_name: string
  base_url?: string
  models: LLMModel[]
  is_active: boolean
}

/**
 * LLM模型配置
 */
export interface LLMModel {
  name: string
  display_name: string
  context_length: number
  supports_streaming: boolean
  pricing?: {
    input: number
    output: number
  }
}

/**
 * 存储配置
 */
export interface StorageConfig {
  storage_type: 'nfs' | 'local' | 's3'
  storage_path: string
  mount_point: string
  server_address?: string
  export_path?: string
  options?: Record<string, unknown>
}

/**
 * 编排配置
 */
export interface OrchestrationConfig {
  image_name: string
  environment_vars?: Record<string, string>
  resources?: {
    cpu?: string
    memory?: string
    disk?: string
  }
  mounts?: Array<{
    source: string
    target: string
    type: 'bind' | 'volume'
  }>
}

// ============================================================================
// WebSocket Types
// ============================================================================

/**
 * WebSocket消息类型
 */
export enum WebSocketMessageType {
  PING = 'ping',
  PONG = 'pong',
  NOTIFICATION = 'notification',
  UPDATE = 'update',
  ERROR = 'error'
}

/**
 * WebSocket消息
 */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType
  data: T
  timestamp: Timestamp
  id?: string
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * 可选字段
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * 必需字段
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

/**
 * 只读类型
 */
export type Readonly<T> = {
  readonly [P in keyof T]: T[P]
}

// ============================================================================
// API Response Wrappers
// ============================================================================

/**
 * 成功响应包装器
 */
export type SuccessResponse<T> = {
  success: true
  message: string
  data: T
}

/**
 * 错误响应包装器
 */
export type ErrorResponse = {
  success: false
  message: string
  data: null
  error: string
}

/**
 * 完整响应类型
 */
export type ApiResponseType<T> = SuccessResponse<T> | ErrorResponse
