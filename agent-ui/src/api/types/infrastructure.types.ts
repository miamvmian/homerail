/**
 * ============================================================================
 * Infrastructure Types - 基础设施相关类型定义
 * ============================================================================
 *
 * 定义基础设施相关的所有类型，包括节点、存储、Git仓库等
 * Git相关类型已更新为使用新的GitServer单表设计
 */

import type {
  ID,
  Timestamp,
  Status
} from './common.types'

// ============================================================================
// Node Types
// ============================================================================

export interface Node {
  id: NodeID
  name: string
  region: string
  status: 'connected' | 'disconnected' | 'error'
  version: string
  capabilities: string[]
  tags: string[]
  last_seen: string
  ip: string
  is_local?: boolean
  display_label?: string
  display_type?: 'local' | 'remote'
  manager_host?: string
  metadata?: Record<string, unknown>
}

export interface NodeCreateRequest {
  name: string
  region: string
  capabilities?: string[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface NodeUpdateRequest {
  name?: string
  region?: string
  capabilities?: string[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

// ============================================================================
// Storage Types
// ============================================================================

export interface Storage {
  id: StorageID
  name: string
  type: 'nfs' | 'local'
  storage_path: string
  server_address: string
  status: 'mounted' | 'unmounted' | 'error' | 'connecting'
  active_projects: number
  capacity?: string
  used_space?: string
  metadata?: Record<string, unknown>
}

export interface StorageCreateRequest {
  storage_path: string
  type?: 'nfs' | 'local'
  metadata?: Record<string, unknown>
}

export interface StorageUpdateRequest {
  name?: string
  storage_path?: string
  server_address?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Git Repository Types - 已更新为GitServer单表设计
// ============================================================================

/**
 * GitServer - Git凭据配置（单表设计）
 *
 * 设计原则：
 * - 只存储访问凭据，不存储仓库元数据
 * - 支持多平台：GitHub、GitLab、Gitea
 * - Token加密存储
 * - SSH密钥可选配置
 * - 仓库在项目级别配置（实时获取）
 */
export interface GitServer {
  server_id: string          // GitServer ID
  name: string               // 配置名称（如"公司Gitea"）
  platform_type: 'github' | 'gitlab' | 'gitea'  // 平台类型
  api_endpoint: string       // API地址
  git_user_name: string | null   // Git用户名（用于提交）
  git_user_email: string | null  // Git邮箱（用于提交）
  is_active: boolean         // 是否启用
  token_valid: boolean       // Token是否有效
  last_verified: string | null  // 最后验证时间
  description: string        // 备注
  created_at: string         // 创建时间
  updated_at: string         // 更新时间

  // 实时数据（不存储，从API获取）
  user_info?: GitUserInfo    // 用户信息（实时获取）
}

/**
 * Git用户信息（从API实时获取）
 */
export interface GitUserInfo {
  login: string       // 登录名
  name: string        // 显示名称
  email: string       // 邮箱
  id: number          // 用户ID
  avatar_url: string  // 头像URL
  html_url: string    // 个人主页
}

/**
 * Git仓库信息（从API实时获取）
 */
export interface GitRepositoryInfo {
  name: string            // 仓库名称
  full_name: string       // 完整名称 (owner/repo)
  description: string     // 描述
  clone_url: string       // HTTPS克隆URL
  ssh_url: string         // SSH克隆URL
  html_url: string        // 仓库主页
  default_branch: string  // 默认分支
  private: boolean        // 是否私有
  language: string | null // 编程语言
}

/**
 * Git分支信息（从API实时获取）
 */
export interface GitBranchInfo {
  name: string      // 分支名称
  sha: string       // 最新提交SHA
  is_default: boolean // 是否默认分支
}

/**
 * 创建GitServer配置请求
 */
export interface GitServerCreateRequest {
  name: string                    // 配置名称
  platform_type: string           // 平台类型
  api_endpoint: string            // API地址
  token: string                   // 访问Token
  git_user_name?: string          // Git用户名
  git_user_email?: string         // Git邮箱
  description?: string            // 备注
  setup_ssh?: boolean             // 是否自动配置SSH密钥
}

/**
 * 更新GitServer配置请求
 */
export interface GitServerUpdateRequest {
  name?: string
  token?: string
  git_user_name?: string
  git_user_email?: string
  description?: string
  is_active?: boolean
}

// ============================================================================
// 旧的Git Repo类型（兼容旧API）
// ============================================================================

/**
 * @deprecated 已废弃 - 使用GitServer替代
 */
export interface GitRepo {
  id: GitRepoID
  name: string
  url: string
  description: string
  user_login?: string      // 登录名 (如 git_worker)
  user_name?: string       // 显示名称 (如 Omni Worker Test User)
  user_email?: string      // 邮箱
  token_valid?: boolean    // Token是否有效
  verification_status: 'verified' | 'failed' | 'pending' | 'unknown'
  auth_type: 'token' | 'ssh-key' | 'username-password' | 'none'
  last_verified: string
  default_branch?: string
  last_commit?: string
  metadata?: Record<string, unknown>
}

/**
 * @deprecated 已废弃 - 使用GitServerCreateRequest替代
 */
export interface GitRepoCreateRequest {
  url: string
  credentials: {
    token: string
  }
  description?: string
  metadata?: Record<string, unknown>
}

/**
 * @deprecated 已废弃 - 使用GitServerUpdateRequest替代
 */
export interface GitRepoUpdateRequest {
  name?: string
  description?: string
  verification_status?: 'verified' | 'failed' | 'pending' | 'unknown'
  last_verified?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Request/Response Types
// ============================================================================

export type InfrastructureResponse<T> = {
  success: boolean
  message?: string
  data: T
}

export type InfrastructureListResponse<T> = {
  success: boolean
  message?: string
  data: {
    items: T[]
    total: number
  }
}

// ============================================================================
// Combined Infrastructure Types
// ============================================================================

export interface InfrastructureOverview {
  nodes: {
    total: number
    connected: number
    disconnected: number
    error: number
  }
  storage: {
    total: number
    mounted: number
    unmounted: number
    error: number
  }
  git_repos: {
    total: number
    verified: number
    failed: number
    pending: number
  }
}

// ============================================================================
// Query Parameters
// ============================================================================

export interface NodeListParams {
  status?: string
  region?: string
  search?: string
  limit?: number
  offset?: number
}

export interface StorageListParams {
  type?: string
  status?: string
  search?: string
  limit?: number
  offset?: number
}

export interface GitRepoListParams {
  verification_status?: string
  auth_type?: string
  search?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Actions and Operations
// ============================================================================

export interface NodeActionRequest {
  action: 'restart' | 'shutdown' | 'update' | 'reconnect'
}

export interface StorageActionRequest {
  action: 'mount' | 'unmount' | 'check' | 'format'
}

export interface GitRepoActionRequest {
  action: 'verify' | 'clone' | 'pull' | 'update_auth'
  credentials?: {
    username?: string
    password?: string
    token?: string
    ssh_key?: string
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isNode(item: Node | Storage | GitRepo): item is Node {
  return 'capabilities' in item && 'ip' in item
}

export function isStorage(item: Node | Storage | GitRepo): item is Storage {
  return 'storage_path' in item && 'mount_point' in item
}

export function isGitRepo(item: Node | Storage | GitRepo): item is GitRepo {
  return 'verification_status' in item && 'auth_type' in item && 'url' in item
}

// ============================================================================
// Export all types
// ============================================================================

export type NodeID = ID
export type StorageID = ID
export type GitRepoID = ID
