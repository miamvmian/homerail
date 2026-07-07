/**
 * ============================================================================
 * Project Types - 项目相关类型定义
 * ============================================================================
 *
 * 定义项目相关的所有类型，包括项目模型、请求/响应类型等
 */

import type {
  ID,
  Metadata,
  Timestamp,
  BaseResponse,
  ProjectID,
  StorageID,
  ProjectFilter
} from './common.types'

// ============================================================================
// Project Models
// ============================================================================

/**
 * 项目模型
 */
export interface Project {
  id: ProjectID
  name: string
  description: string
  metadata: Metadata
  active_changes: number
  storage_configurations: StorageID[]
  default_node_id?: ID | null
  git_server_id?: string | null
  git_repository?: string | null
  git_repo_name?: string | null
  git_default_branch?: string
  workspace_path?: string | null
  detected_git?: {
    is_git_repo: boolean
    origin?: string | null
    branch?: string | null
    repo_name?: string | null
  } | null
  created_at: Timestamp
  updated_at: Timestamp
}

/**
 * 项目摘要信息
 */
export interface ProjectSummary {
  project_id: ProjectID
  project_name: string
  total_changes: number
  completed_changes: number
  active_changes: number
  completion_rate: number
  status_breakdown: Record<string, number>
  created_at: Timestamp
  updated_at: Timestamp
}

/**
 * 项目进度信息
 */
export interface ProjectProgress {
  total: number
  completed: number
  in_progress: number
  pending: number
  failed: number
  cancelled: number
  completion_percentage: number
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * 创建项目请求
 */
export interface CreateProjectRequest {
  name: string
  description?: string
  metadata?: Metadata
  storage_config_id?: StorageID
  default_node_id?: ID
  project_root?: string
  workspace_path?: string
  // Git仓库配置（实时从Git服务器获取）
  git_server_id?: string
  git_owner?: string
  git_repo_name?: string
  git_repository?: string
}

/**
 * 更新项目请求
 */
export interface UpdateProjectRequest {
  name?: string
  description?: string
  metadata?: Metadata
  storage_configurations?: StorageID[]
  project_root?: string
  workspace_path?: string
  git_server_id?: string | null
  git_owner?: string | null
  git_repo_name?: string | null
  git_repository?: string | null
}

export interface ProjectDirectoryServer {
  id: string
  name: string
  kind: string
  can_browse: boolean
}

export interface ProjectDirectoryRoot {
  id: string
  name: string
  path: string
  writable: boolean
}

export interface ProjectDirectoryEntry {
  name: string
  path: string
  is_directory: boolean
  is_hidden: boolean
  is_git_repo: boolean
  writable: boolean
  updated_at?: number
}

export type ProjectDirectoryRootsResponse = BaseResponse<{
  servers: ProjectDirectoryServer[]
  roots: ProjectDirectoryRoot[]
  default_path: string
}>

export type ProjectDirectoryBrowseResponse = BaseResponse<{
  server_id: string
  path: string
  parent: string | null
  writable: boolean
  is_git_repo: boolean
  entries: ProjectDirectoryEntry[]
}>

/**
 * 项目列表查询参数
 */
export interface ProjectListParams extends ProjectFilter {
  limit?: number
  offset?: number
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * 项目列表响应
 */
export type ProjectListResponse = BaseResponse<{
  projects: Project[]
  total: number
  limit: number
  offset: number
}>

/**
 * 项目响应
 */
export type ProjectResponse = BaseResponse<Project>

/**
 * 项目摘要响应
 */
export type ProjectSummaryResponse = BaseResponse<ProjectSummary>

/**
 * 项目进度响应
 */
export type ProjectProgressResponse = BaseResponse<ProjectProgress>

// ============================================================================
// Git Auth Types
// ============================================================================

/**
 * Git认证信息
 */
export interface GitAuth {
  id: ID
  repository_url: string
  user_email: string
  user_name: string
  token_valid: boolean
  token_scopes: string[]
  token_type: string
  last_verified?: Timestamp
  description: string
  is_active: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

/**
 * Git认证响应
 */
export type GitAuthResponse = BaseResponse<GitAuth | null>

/**
 * 设置Git认证请求
 */
export interface SetGitAuthRequest {
  git_auth_id: string
}

// ============================================================================
// Storage Association Types
// ============================================================================

/**
 * 项目存储配置信息
 */
export interface ProjectStorage {
  id: StorageID
  name: string
  storage_path: string
  mount_point: string
  storage_type: string
  server_address?: string
  export_path?: string
  is_active: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

/**
 * 项目存储列表响应
 */
export type ProjectStorageListResponse = BaseResponse<{
  project_id: ProjectID
  storages: ProjectStorage[]
  total: number
}>

/**
 * 添加存储到项目请求
 */
export interface AddStorageToProjectRequest {
  storage_id: StorageID
}

/**
 * 移除项目存储请求
 */
export interface RemoveStorageFromProjectRequest {
  storage_id: StorageID
}

// ============================================================================
// Change Association Types
// ============================================================================

/**
 * 项目变更信息
 */
export interface ProjectChange {
  id: ID
  project_id: ProjectID
  title: string
  description: string
  orchestration_id: ID
  status: string
  progress: number
  created_at: Timestamp
  updated_at: Timestamp
  completed_at?: Timestamp
}

/**
 * 项目变更列表响应
 */
export type ProjectChangeListResponse = BaseResponse<{
  changes: ProjectChange[]
  total: number
  limit: number
  offset: number
  project_id: ProjectID
}>

/**
 * 项目变更查询参数
 */
export interface ProjectChangeListParams {
  status?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * 项目统计信息
 */
export interface ProjectStats {
  total_projects: number
  active_projects: number
  projects_with_changes: number
  projects_without_changes: number
  average_changes_per_project: number
}

/**
 * 项目活动信息
 */
export interface ProjectActivity {
  project_id: ProjectID
  project_name: string
  last_activity: Timestamp
  recent_changes: number
  active_runs: number
}

/**
 * 项目搜索结果
 */
export interface ProjectSearchResult {
  projects: Project[]
  total: number
  search_term: string
  search_time: number
}
