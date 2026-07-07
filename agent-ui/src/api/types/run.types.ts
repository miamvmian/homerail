/**
 * ============================================================================
 * Run Types - 运行相关类型定义
 * ============================================================================
 *
 * 定义运行相关的所有类型，包括运行模型、请求/响应类型等
 */

import type {
  ID,
  Timestamp,
  ProjectID,
  ChangeID,
  ContainerID,
  NodeID,
  BaseResponse
} from './common.types'

// ============================================================================
// Run Models
// ============================================================================

/**
 * 运行模型
 */
export interface Run {
  run_id: ID
  change_id: ChangeID
  project_id: ProjectID
  storage_backend: string
  workspace_id?: ID
  created_at: Timestamp
  updated_at: Timestamp
  worker_container_id?: string
  manager_agent_config?: Record<string, unknown>
  worker_model_config?: Record<string, unknown>
  // Run 名称和描述
  name?: string
  description?: string
  // 状态管理字段
  status?: RunStatus
  orchestration_id?: string
  orchestration_version?: string
  started_at?: string
  completed_at?: string
  result_summary?: string
  error_message?: string
  // Flow 相关字段
  current_phase?: string
  current_flow_index?: number
  total_flows?: number
  phases?: Array<{
    id: string
    name: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    index: number
  }>
}

/**
 * 运行详情
 */
export interface RunDetail extends Run {
  change_title: string
  project_name: string
  container?: RunContainer
  workspace?: RunWorkspace
  manager_agent?: ManagerAgentInfo
}

/**
 * 运行容器信息
 */
export interface RunContainer {
  worker_container_id: string
  container_name: string
  container_id?: string
  image_id: string
  node_id: NodeID
  status: string
  is_alive: boolean
  created_at: Timestamp
  last_heartbeat: Timestamp
}

/**
 * 工作空间信息
 */
export interface RunWorkspace {
  workspace_id: ID
  host_path: string
  mount_point: string
  backend_type: string
  size?: number
  created_at: Timestamp
}

/**
 * Manager Agent信息
 */
export interface ManagerAgentInfo {
  instance_id: ID
  status: 'idle' | 'running' | 'completed' | 'error'
  last_activity: Timestamp
  total_invocations: number
  version: 'v1' | 'v2'
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * 创建运行请求
 */
export interface CreateRunRequest {
  change_id: ChangeID
  project_id: ProjectID
  collaboration_enabled?: boolean
  manager_provider_name?: string
  manager_model_name?: string
  worker_provider_name?: string
  worker_model_name?: string
  image?: string
  storage_config?: {
    storage_id: string
    mount_point: string
  }
  manager_agent_config?: Record<string, unknown>
  worker_model_config?: Record<string, unknown>
  // Run 名称和描述
  name?: string
  description?: string
  // 编排覆盖（可选，不指定则使用 Change 的默认编排）
  orchestration_id?: string
}

/**
 * 调用Manager Agent请求
 */
export interface InvokeManagerAgentRequest {
  prompt: string
}

/**
 * 存储操作请求
 */
export interface StorageOperationRequest {
  node_id: NodeID
  container_id?: ContainerID
  mount_type?: 'manager' | 'worker'
}

/**
 * 开发操作请求
 */
export interface DevelopmentOperationRequest {
  command?: string
  parameters?: Record<string, unknown>
}

/**
 * 指导请求
 */
export interface GuidanceRequest {
  content: string
  next_steps?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * 运行列表响应
 */
export type RunListResponse = BaseResponse<{
  runs: Run[]
  total: number
  limit: number
  offset: number
  filters: {
    project_id?: ProjectID
    change_id?: ChangeID
  }
}>

/**
 * 运行响应（包含完整的运行信息，包括 phases）
 */
export interface RunResponseData extends Run {
  // 状态字段（用于事件驱动架构）
  status?: RunStatus
  // Flow 相关字段（创建时返回）
  current_phase?: string
  current_flow_index?: number
  total_flows?: number
  phases?: Array<{
    id: string
    name: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    index: number
  }>
}

export type RunResponse = BaseResponse<RunResponseData>

/**
 * 运行详情响应
 */
export type RunDetailResponse = BaseResponse<RunDetail>

/**
 * 运行状态响应
 */
export type RunStatusResponse = BaseResponse<{
  run_id: ID
  change_id: ChangeID
  project_id: ProjectID
  workspace_id?: ID
  workspace_path?: string
  created_at: Timestamp
  worker_container_id?: string
  // 状态字段（用于事件驱动架构）
  status?: RunStatus
  // Flow 相关字段
  current_phase?: string
  current_flow_index?: number
  total_flows?: number
  phases?: Array<{
    id: string
    name: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    index: number
  }>
  container?: {
    container_name: string
    container_id?: string
    image_id: string
    node_id: NodeID
    status: string
    is_alive: boolean
    created_at: Timestamp
    last_heartbeat: Timestamp
  }
}>

/**
 * Manager Agent调用响应
 */
export type InvokeManagerAgentResponse = BaseResponse<{
  run_id: ID
  worker_container_id?: string
  instance_id: ID
  prompt: string
  status: string
  workspace_path?: string
  result?: Record<string, unknown>
  version: 'v1' | 'v2'
}>

// ============================================================================
// Storage Operation Types
// ============================================================================

/**
 * 存储准备响应
 */
export type StoragePreparationResponse = BaseResponse<{
  workspace_path: string
  mount_point: string
  backend_type: string
}>

/**
 * 工作空间信息响应
 */
export type WorkspaceInfoResponse = BaseResponse<{
  workspace_id: ID
  host_path: string
  mount_point: string
  backend_type: string
  size?: number
  files?: Array<{
    name: string
    path: string
    size: number
    type: 'file' | 'directory'
    modified_at: Timestamp
  }>
}>

/**
 * 协作指标响应
 */
export type CollaborationMetricsResponse = BaseResponse<{
  metrics: {
    total_collaborations: number
    active_collaborations: number
    completed_collaborations: number
    average_session_duration: number
    last_activity: Timestamp
  }
}>

// ============================================================================
// Container Operation Types
// ============================================================================

/**
 * 容器启动响应
 */
export type StartContainerResponse = BaseResponse<{
  worker_container_id: string
  container_name: string
  status: string
}>

/**
 * 容器停止响应
 */
export type StopContainerResponse = BaseResponse<{
  worker_container_id: string
  container_name: string
  status: string
}>

/**
 * 容器列表响应
 */
export type ContainerListResponse = BaseResponse<{
  run_id: ID
  containers: Array<{
    worker_container_id: string
    container_name: string
    container_id?: string
    image_id: string
    node_id: NodeID
    status: string
    is_alive: boolean
    created_at: Timestamp
  }>
  total: number
}>

// ============================================================================
// List and Filter Types
// ============================================================================

/**
 * 运行列表查询参数
 */
export interface RunListParams {
  project_id?: ProjectID
  change_id?: ChangeID
  status?: string
  limit?: number
  offset?: number
  sort_by?: 'created_at' | 'updated_at' | 'status'
  sort_order?: 'asc' | 'desc'
}

/**
 * 活动运行列表响应
 */
export type ActiveRunListResponse = BaseResponse<{
  runs: Run[]
  total: number
}>

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * 运行统计信息
 */
export interface RunStats {
  total_runs: number
  active_runs: number
  completed_runs: number
  failed_runs: number
  average_duration: number
  runs_this_week: number
  runs_last_week: number
  most_active_changes: Array<{
    change_id: ChangeID
    change_title: string
    run_count: number
  }>
}

/**
 * 运行趋势数据
 */
export interface RunTrendData {
  date: string
  created: number
  completed: number
  active: number
  failed: number
}

// ============================================================================
// Error and Exception Types
// ============================================================================

/**
 * 运行错误信息
 */
export interface RunError {
  code: string
  message: string
  details?: Record<string, unknown>
  timestamp: Timestamp
  run_id?: ID
}

/**
 * 容器错误信息
 */
export interface ContainerError {
  code: string
  message: string
  container_id?: string
  node_id?: NodeID
  timestamp: Timestamp
}

// ============================================================================
// Run Message Types - 运行消息类型
// ============================================================================
//
// 统一消息格式规范 (Unified Message Format)
//
// 基础结构:
// {
//   "type": "claude_response",      // 消息类型标识
//   "response_type": MessageType,   // 消息子类型 (system | text | tool_use | tool_result)
//   "timestamp": number,            // Unix 时间戳（秒）
//   "session_id": string,           // 会话 ID
//   "content": ClaudeContent,       // 消息内容（类型相关）
//   "metadata": MessageMetadata     // 元数据
// }
//
// 显示格式映射:
// | response_type | 图标  | 颜色  | 用途            |
// |---------------|-------|-------|-----------------|
// | system        | ⚙️    | 灰色  | 系统初始化      |
// | text          | 💬    | 绿色  | 文本响应        |
// | tool_use      | 🔧    | 蓝色  | 工具调用        |
// | tool_result   | ✅/❌ | 绿/红 | 工具结果        |
//

// ============================================================================
// Message Type Definitions
// ============================================================================

/**
 * 消息类型枚举
 */
export type MessageType = 'system' | 'text' | 'tool_use' | 'tool_result' | 'round_start'

/**
 * 轮次开始消息
 * Manager Agent 每次启动新轮次时发送
 */
export interface RoundStartMessage {
  type: 'round_start'
  round_id: number
  timestamp: string  // ISO 格式时间戳
  instance_id: string
  run_id: string
  [key: string]: unknown
}

/**
 * 消息类型配置（用于 UI 显示）
 * 使用圆点符号表示消息类型
 */
export const MESSAGE_TYPE_CONFIG: Record<MessageType, {
  color: string
  bgClass: string
  textClass: string
}> = {
  system: {
    color: '#6b7280',
    bgClass: 'bg-gray-100 dark:bg-gray-800',
    textClass: 'text-gray-600 dark:text-gray-400'
  },
  text: {
    color: '#10b981',
    bgClass: 'bg-green-100 dark:bg-green-900/30',
    textClass: 'text-green-600 dark:text-green-400'
  },
  tool_use: {
    color: '#3b82f6',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-600 dark:text-blue-400'
  },
  tool_result: {
    color: '#22c55e',
    bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
    textClass: 'text-emerald-600 dark:text-emerald-400'
  },
  round_start: {
    color: '#f59e0b',
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    textClass: 'text-amber-600 dark:text-amber-400'
  }
}

/**
 * 统一消息内容类型
 */
export type ClaudeContent =
  | SystemContent
  | TextContent
  | ToolUseContent
  | ToolResultContent

/**
 * 系统初始化内容
 */
export interface SystemContent {
  type: 'system'
  subtype: 'init'
  cwd: string
  session_id: string
  tools: string[]
  model: string
  mcp_servers?: Array<{ name: string; status: string }>
  permissionMode?: string
  [key: string]: unknown
}

/**
 * 文本消息内容
 */
export interface TextContent {
  type: 'text'
  [key: string]: unknown
}

/**
 * 工具调用内容
 */
export interface ToolUseContent {
  tool_id: string
  name: string
  input: Record<string, unknown>
  [key: string]: unknown
}

/**
 * 工具执行结果内容
 */
export interface ToolResultContent {
  tool_use_id: string
  content: string | Record<string, unknown>
  is_error: boolean | null
  [key: string]: unknown
}

/**
 * 消息元数据
 */
export interface MessageMetadata {
  original_type: string
  message_class: string
  model?: string
  parent_tool_use_id?: string | null
  has_content: boolean
  content_block_types?: string[]
  [key: string]: unknown
}

/**
 * 统一消息格式
 * 对应后端 JSONL 日志文件的格式
 */
export interface UnifiedMessage {
  type: 'claude_response'
  response_type: MessageType
  timestamp: number
  session_id: string
  prompt?: string
  content: ClaudeContent
  metadata: MessageMetadata
  instance_id?: string
  sequence?: number
  [key: string]: unknown
}

/**
 * 从 UnifiedMessage 提取的工具调用信息
 */
export interface ExtractedToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'success' | 'failed' | 'pending'
  result?: string | Record<string, unknown>
  is_error?: boolean | null
}

// ============================================================================
// Legacy Types (for backward compatibility)
// ============================================================================

/**
 * Claude 消息类型（旧版）
 * @deprecated Use UnifiedMessage instead
 */
export type ClaudeMessageType =
  | 'assistant_message'
  | 'user_message'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'

/**
 * Claude 消息内容（旧版）
 * @deprecated Use UnifiedMessage instead
 * @deprecated 对应后端 SessionRecorder 写入的 JSONL 文件中的消息格式
 */
export interface ClaudeMessage {
  id: string
  type: ClaudeMessageType
  timestamp: string
  content?: string
  tool_calls?: ClaudeToolCall[]
  status?: 'success' | 'failed' | 'pending'
  // 兼容后端不同格式的消息
  [key: string]: unknown
}

/**
 * Claude 工具调用（旧版）
 * @deprecated Use UnifiedMessage content fields instead
 */
export interface ClaudeToolCall {
  id: string
  name: string
  summary?: string
  input: Record<string, unknown>
  result?: Record<string, unknown>
  status?: 'success' | 'failed'
  [key: string]: unknown
}

/**
 * 获取所有消息响应
 */
export type GetAllMessagesResponse = BaseResponse<{
  run_id: string
  manager: UnifiedMessage[]
  workers: Record<string, UnifiedMessage[]>
  worker_names: string[]
  total_manager_messages: number
  total_workers: number
}>

/**
 * 获取 Manager 消息响应
 */
export type GetManagerMessagesResponse = BaseResponse<{
  run_id: string
  messages: ClaudeMessage[]
  total: number
  limit: number | null
  offset: number
  has_more: boolean
}>

/**
 * 获取 Worker 消息响应
 */
export type GetWorkerMessagesResponse = BaseResponse<{
  run_id: string
  worker_name: string
  messages: ClaudeMessage[]
  total: number
  limit: number | null
  offset: number
  has_more: boolean
}>

/**
 * Worker 列表响应
 */
export type WorkerListResponse = BaseResponse<{
  run_id: string
  workers: Array<{
    worker_name: string
    message_count: number
  }>
  total: number
}>

/**
 * Worker 消息发送响应
 */
export type SendMessageToWorkerResponse = BaseResponse<{
  run_id: string
  worker_name: string
  worker_id: string
  instance_id: string
  session_id: string | null
  prompt: string
  status: string
}>

/**
 * WebSocket 消息事件
 * 对应后端 WebSocket 端点发送的消息格式
 */
export interface RunMessageEvent {
  type: 'connected' | 'history' | 'history_complete' | 'message' | 'heartbeat' | 'error' | 'pong'
  source: 'manager' | 'worker'
  worker_name?: string
  data?: ClaudeMessage | ClaudeMessage[]
  count?: number
  timestamp?: string
  connection_id?: string
  error?: string
  [key: string]: unknown
}

// ============================================================================
// Run Store Types - 运行商店专用类型
// ============================================================================

/**
 * Run 运行状态
 */
export type RunStatus = 'created' | 'starting' | 'running' | 'completed' | 'failed'

/**
 * 待确认的用户消息
 * 用户发送的消息在获得序号之前的状态
 */
export interface PendingUserMessage {
  temp_id: string          // 临时消息 ID
  content: string          // 消息内容
  timestamp: number        // 发送时间戳
  status: 'pending'        // 状态：等待确认
}

/**
 * 单个 Flow 的消息缓存
 * 用于存储特定 Flow 的 Manager 和 Worker 消息
 */
export interface FlowMessagesCache {
  flow_id: string          // Flow ID（格式：flow-{flow_name}）
  flow_name: string        // Flow 名称
  flow_index: number       // Flow 索引
  managerMessages: ClaudeMessage[]
  workerMessages: Record<string, ClaudeMessage[]>
  workerNames: string[]
}

/**
 * Run 消息缓存（按 Flow 组织）
 * 用于缓存多个 Run 的消息，按 Flow 分组存储
 */
export interface RunMessagesCache {
  run_id: string
  flows: Record<string, FlowMessagesCache>  // 按 flow_id 组织
  currentFlowId: string | null  // 当前显示的 flow_id
  lastUpdated: number
  isLoading: boolean
  wsConnected: boolean
  pendingUserMessages: PendingUserMessage[]  // 待确认的用户消息队列
  managerMessages?: ClaudeMessage[]
  workerMessages?: Record<string, ClaudeMessage[]>
  workerNames?: string[]
}

/**
 * 带状态的 Run 信息
 */
export interface RunWithStatus extends Run {
  status: RunStatus
  hasStarted: boolean
}

/**
 * Run 选择项（用于 UI 下拉选择）
 */
export interface RunSelectOption {
  id: string
  label: string
  status: RunStatus
  created_at: string
  isCurrent: boolean
  name?: string
  description?: string
  current_phase?: string
  current_flow_index?: number
  total_flows?: number
  phases?: Array<{
    id: string
    name: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    index: number
  }>
}

// ============================================================================
// Manager Chat Types
// ============================================================================

export interface ManagerChatRequest {
  message: string
  project_id?: string
  session_id?: string
  continue_chat?: boolean
  manager_provider_name?: string
  manager_model_name?: string
  manager_agent_config?: Record<string, unknown>
  voice_mode?: boolean
}

export interface ManagerChatResponseData {
  text: string
  tool_calls: Array<{
    tool_id: string
    name: string
    input: Record<string, unknown>
  }>
  tool_results?: Array<{
    tool_id: string
    content: string
    is_error?: boolean
  }>
  run_id?: string | null
  session_id: string
  project_id: string
  worker_id: string
  manager_provider_name?: string
  manager_model_name?: string
  manager_agent_config?: Record<string, unknown>
  forked_from_session_id?: string | null
}

export type ManagerChatResponse = BaseResponse<ManagerChatResponseData>
