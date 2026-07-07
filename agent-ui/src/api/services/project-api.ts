/**
 * ============================================================================
 * Project API - 项目相关API服务
 * ============================================================================
 *
 * 提供项目相关的所有API调用，包括CRUD操作、关联数据管理等
 */

import { http } from '../clients/http-client'
import type {
  BaseResponse
} from '../types/common.types'
import type {
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectListParams,
  ProjectListResponse,
  ProjectResponse,
  ProjectSummaryResponse,
  ProjectProgressResponse,
  ProjectDirectoryBrowseResponse,
  ProjectDirectoryRootsResponse,
  GitAuthResponse,
  SetGitAuthRequest,
  ProjectStorageListResponse,
  AddStorageToProjectRequest,
  RemoveStorageFromProjectRequest,
  ProjectChangeListResponse,
  ProjectChangeListParams
} from '../types/project.types'

// ============================================================================
// Project CRUD Operations
// ============================================================================

/**
 * 获取项目列表
 */
export async function listProjects(params?: ProjectListParams): Promise<ProjectListResponse> {
  const queryParams = new URLSearchParams()

  if (params?.search) {
    queryParams.append('search', params.search)
  }
  if (params?.limit !== undefined) {
    queryParams.append('limit', params.limit.toString())
  }
  if (params?.offset !== undefined) {
    queryParams.append('offset', params.offset.toString())
  }

  const queryString = queryParams.toString()
  const url = `/api/projects${queryString ? `?${queryString}` : ''}`

  return http.get<ProjectListResponse>(url)
}

/**
 * 获取项目详情
 */
export async function getProject(projectId: string): Promise<ProjectResponse> {
  return http.get<ProjectResponse>(`/api/projects/${projectId}`)
}

/**
 * 创建项目
 */
export async function createProject(data: CreateProjectRequest): Promise<ProjectResponse> {
  return http.post<ProjectResponse>('/api/projects', data)
}

/**
 * 获取后端可浏览的目录根
 */
export async function listProjectDirectoryRoots(): Promise<ProjectDirectoryRootsResponse> {
  return http.get<ProjectDirectoryRootsResponse>('/api/projects/directories/roots')
}

/**
 * 浏览后端服务器目录
 */
export async function browseProjectDirectories(params: {
  path?: string
  server_id?: string
  show_hidden?: boolean
  limit?: number
}): Promise<ProjectDirectoryBrowseResponse> {
  const queryParams = new URLSearchParams()
  if (params.path) queryParams.append('path', params.path)
  if (params.server_id) queryParams.append('server_id', params.server_id)
  if (params.show_hidden !== undefined) queryParams.append('show_hidden', String(params.show_hidden))
  if (params.limit !== undefined) queryParams.append('limit', String(params.limit))
  const queryString = queryParams.toString()
  return http.get<ProjectDirectoryBrowseResponse>(`/api/projects/directories/browse${queryString ? `?${queryString}` : ''}`)
}

/**
 * 更新项目
 */
export async function updateProject(
  projectId: string,
  data: UpdateProjectRequest
): Promise<ProjectResponse> {
  return http.put<ProjectResponse>(`/api/projects/${projectId}`, data)
}

/**
 * 删除项目
 */
export async function deleteProject(projectId: string): Promise<BaseResponse<{
  id: string
  summary?: Record<string, unknown> | null
}>> {
  return http.delete<BaseResponse<{
    id: string
    summary?: Record<string, unknown> | null
  }>>(`/api/projects/${projectId}`)
}

// ============================================================================
// Project Analytics
// ============================================================================

/**
 * 获取项目摘要统计
 */
export async function getProjectSummary(projectId: string): Promise<ProjectSummaryResponse> {
  return http.get<ProjectSummaryResponse>(`/api/projects/${projectId}/summary`)
}

/**
 * 获取项目进度信息
 */
export async function getProjectProgress(projectId: string): Promise<ProjectProgressResponse> {
  return http.get<ProjectProgressResponse>(`/api/projects/${projectId}/progress`)
}

// ============================================================================
// Project Changes
// ============================================================================

/**
 * 获取项目变更列表
 */
export async function getProjectChanges(
  projectId: string,
  params?: ProjectChangeListParams
): Promise<ProjectChangeListResponse> {
  const queryParams = new URLSearchParams()

  if (params?.status) {
    queryParams.append('status', params.status)
  }
  if (params?.limit !== undefined) {
    queryParams.append('limit', params.limit.toString())
  }
  if (params?.offset !== undefined) {
    queryParams.append('offset', params.offset.toString())
  }

  const queryString = queryParams.toString()
  const url = `/api/projects/${projectId}/changes${queryString ? `?${queryString}` : ''}`

  return http.get<ProjectChangeListResponse>(url)
}

// ============================================================================
// Git Authentication
// ============================================================================

/**
 * 获取项目Git认证配置
 */
export async function getProjectGitAuth(projectId: string): Promise<GitAuthResponse> {
  return http.get<GitAuthResponse>(`/api/projects/${projectId}/git-auth`)
}

/**
 * 为项目设置Git认证配置
 */
export async function setProjectGitAuth(
  projectId: string,
  data: SetGitAuthRequest
): Promise<BaseResponse<{ project_id: string; git_auth_id: string }>> {
  const params = new URLSearchParams({
    git_auth_id: data.git_auth_id
  })

  return http.post<BaseResponse<{ project_id: string; git_auth_id: string }>>(
    `/api/projects/${projectId}/git-auth?${params.toString()}`
  )
}

/**
 * 移除项目Git认证配置
 */
export async function removeProjectGitAuth(
  projectId: string
): Promise<BaseResponse<{ project_id: string }>> {
  return http.delete<BaseResponse<{ project_id: string }>>(`/api/projects/${projectId}/git-auth`)
}

// ============================================================================
// Storage Configuration
// ============================================================================

/**
 * 为项目添加存储配置关联
 */
export async function addStorageToProject(
  projectId: string,
  storageId: string
): Promise<BaseResponse<{
  project_id: string
  storage_id: string
  storage_configurations: string[]
}>> {
  return http.put<BaseResponse<{
    project_id: string
    storage_id: string
    storage_configurations: string[]
  }>>(`/api/projects/${projectId}/storages/${storageId}`)
}

/**
 * 从项目移除存储配置关联
 */
export async function removeStorageFromProject(
  projectId: string,
  storageId: string
): Promise<BaseResponse<{
  project_id: string
  storage_id: string
  storage_configurations: string[]
}>> {
  return http.delete<BaseResponse<{
    project_id: string
    storage_id: string
    storage_configurations: string[]
  }>>(`/api/projects/${projectId}/storages/${storageId}`)
}

/**
 * 获取项目的所有存储配置
 */
export async function listProjectStorages(
  projectId: string
): Promise<ProjectStorageListResponse> {
  return http.get<ProjectStorageListResponse>(`/api/projects/${projectId}/storages`)
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * 批量删除项目
 */
export async function batchDeleteProjects(
  projectIds: string[]
): Promise<BaseResponse<{ deleted: string[]; failed: string[] }>> {
  return http.post<BaseResponse<{ deleted: string[]; failed: string[] }>>(
    '/api/projects/batch-delete',
    { project_ids: projectIds }
  )
}

/**
 * 批量更新项目
 */
export async function batchUpdateProjects(
  updates: Array<{ id: string; data: UpdateProjectRequest }>
): Promise<BaseResponse<{ updated: string[]; failed: string[] }>> {
  return http.post<BaseResponse<{ updated: string[]; failed: string[] }>>(
    '/api/projects/batch-update',
    { updates }
  )
}

// ============================================================================
// Search and Filter
// ============================================================================

/**
 * 搜索项目
 */
export async function searchProjects(
  searchTerm: string,
  options?: {
    limit?: number
    offset?: number
    include_metadata?: boolean
  }
): Promise<ProjectListResponse> {
  const queryParams = new URLSearchParams({
    search: searchTerm,
    ...(options?.limit && { limit: options.limit.toString() }),
    ...(options?.offset && { offset: options.offset.toString() }),
    ...(options?.include_metadata && { include_metadata: options.include_metadata.toString() })
  })

  return http.get<ProjectListResponse>(`/api/projects/search?${queryParams.toString()}`)
}

/**
 * 按状态过滤项目
 */
export async function filterProjectsByStatus(
  status: string | string[],
  options?: {
    limit?: number
    offset?: number
  }
): Promise<ProjectListResponse> {
  const queryParams = new URLSearchParams()

  if (Array.isArray(status)) {
    status.forEach(s => queryParams.append('status', s))
  } else {
    queryParams.append('status', status)
  }

  if (options?.limit !== undefined) {
    queryParams.append('limit', options.limit.toString())
  }
  if (options?.offset !== undefined) {
    queryParams.append('offset', options.offset.toString())
  }

  return http.get<ProjectListResponse>(`/api/projects/filter?${queryParams.toString()}`)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 检查项目是否存在
 */
export async function checkProjectExists(projectId: string): Promise<boolean> {
  try {
    await getProject(projectId)
    return true
  } catch (error) {
    return false
  }
}

/**
 * 获取项目统计信息
 */
export async function getProjectStats(): Promise<BaseResponse<{
  total_projects: number
  active_projects: number
  projects_with_changes: number
  projects_without_changes: number
  average_changes_per_project: number
}>> {
  return http.get<BaseResponse<{
    total_projects: number
    active_projects: number
    projects_with_changes: number
    projects_without_changes: number
    average_changes_per_project: number
  }>>('/api/projects/stats')
}

/**
 * 导出项目数据
 */
export async function exportProject(
  projectId: string,
  format: 'json' | 'csv' | 'yaml' = 'json'
): Promise<BaseResponse<{
  download_url: string
  expires_at: string
  format: string
}>> {
  return http.get<BaseResponse<{
    download_url: string
    expires_at: string
    format: string
  }>>(`/api/projects/${projectId}/export?format=${format}`)
}

/**
 * 导入项目数据
 */
export async function importProject(
  file: File,
  options?: {
    overwrite?: boolean
    validate_only?: boolean
  }
): Promise<BaseResponse<{
    project_id?: string
    validation_errors?: string[]
    import_summary?: {
      created: number
      updated: number
      skipped: number
    }
  }>> {
  const formData = new FormData()
  formData.append('file', file)

  if (options?.overwrite) {
    formData.append('overwrite', 'true')
  }
  if (options?.validate_only) {
    formData.append('validate_only', 'true')
  }

  return http.post<BaseResponse<{
    project_id?: string
    validation_errors?: string[]
    import_summary?: {
      created: number
      updated: number
      skipped: number
    }
  }>>('/api/projects/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

// ============================================================================
// Project API Object - 统一导出
// ============================================================================

export const projectApi = {
  list: listProjects,
  getById: getProject,
  get: getProject,
  create: createProject,
  directoryRoots: listProjectDirectoryRoots,
  browseDirectories: browseProjectDirectories,
  update: updateProject,
  delete: deleteProject,
  search: searchProjects,
  getStats: getProjectStats,
  configureGitAuth: setProjectGitAuth,
  associateStorage: addStorageToProject,
  batchDelete: batchDeleteProjects
}
