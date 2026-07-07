import { http } from '../clients/http-client'
import type { BaseResponse } from '../types/common.types'

export interface SubdirStatus {
  exists: boolean
  path: string
}

export interface AssetDiagnostics {
  status?: 'healthy' | 'degraded'
  asset_root: string
  repo_asset_root?: string
  source?: string
  exists: boolean
  is_symlink: boolean
  symlink_target: string | null
  repo_seed_path: string
  env_source: string
  subdirs: Record<string, SubdirStatus>
  catalog_path: string | null
  experience_graph_path: string | null
  checks?: Array<{ name: string; passed: boolean; detail: string }>
  seeded?: string[]
  existing?: string[]
  missing_sources?: string[]
  expected_dirs?: string[]
}

export interface OrchestrationTemplate {
  id: string
  name: string
  path: string
  description: string
  category: 'primary' | 'compat' | 'test' | 'legacy'
  node_count: number
  supported_profiles?: string[]
  canonical?: string
  profile?: string
  deprecation_message?: string
}

export interface OrchestrationTemplateList {
  orchestrations: OrchestrationTemplate[]
  total: number
}

export async function getAssetDiagnostics(): Promise<BaseResponse<AssetDiagnostics>> {
  return http.get<BaseResponse<AssetDiagnostics>>('/api/assets/diagnostics') as unknown as Promise<BaseResponse<AssetDiagnostics>>
}

export async function getOrchestrationTemplates(all = false): Promise<BaseResponse<OrchestrationTemplateList>> {
  const query = all ? '?all=true' : ''
  return http.get<BaseResponse<OrchestrationTemplateList>>(`/api/manage/orchestrations${query}`) as unknown as Promise<BaseResponse<OrchestrationTemplateList>>
}
