/**
 * ============================================================================
 * Skills API - Skills API服务
 * ============================================================================
 *
 * 提供技能包相关的所有API调用，包括文件上传
 */

import { http } from '../clients/http-client'
import type {
  BaseResponse
} from '../types/common.types'
import type {
  Skill,
  SkillListParams,
  SkillListResponse,
  UpdateSkillRequest
} from '../types/orchestration-v2.types'

// ============================================================================
// Skills CRUD Operations
// ============================================================================

/**
 * 获取 Skills 列表
 */
export async function listSkills(params?: SkillListParams): Promise<BaseResponse<SkillListResponse>> {
  const queryParams = new URLSearchParams()

  if (params?.search) {
    queryParams.append('search', params.search)
  }
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
  const url = `/api/skills${queryString ? `?${queryString}` : ''}`

  return http.get<BaseResponse<SkillListResponse>>(url)
}

/**
 * 获取单个 Skill
 */
export async function getSkill(skillId: string): Promise<BaseResponse<Skill>> {
  return http.get<BaseResponse<Skill>>(`/api/skills/${skillId}`)
}

/**
 * 上传新 Skill（支持文件上传）
 */
export async function uploadSkill(
  file: File,
  name?: string,
  description?: string
): Promise<BaseResponse<Skill>> {
  const formData = new FormData()
  formData.append('file', file)
  if (name) {
    formData.append('name', name)
  }
  if (description) {
    formData.append('description', description)
  }

  return http.post<BaseResponse<Skill>>('/api/skills', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

/**
 * 更新 Skill
 */
export async function updateSkill(
  skillId: string,
  data: UpdateSkillRequest
): Promise<BaseResponse<Skill>> {
  return http.put<BaseResponse<Skill>>(`/api/skills/${skillId}`, data)
}

/**
 * 删除 Skill
 */
export async function deleteSkill(skillId: string): Promise<BaseResponse<{ id: string }>> {
  return http.delete<BaseResponse<{ id: string }>>(`/api/skills/${skillId}`)
}

// Export API object
export const skillsApi = {
  listSkills,
  getSkill,
  uploadSkill,
  updateSkill,
  deleteSkill
}
