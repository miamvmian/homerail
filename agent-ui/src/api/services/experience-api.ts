import { http } from '../clients/http-client'
import type { BaseResponse } from '../types/common.types'
import type {
  ExperienceDagContext,
  ExperienceDagContextRequest,
  ExperienceGraphDetail,
  ExperienceGraphQuery,
  ExperienceGraphSummary,
} from '../types/experience.types'

export async function getExperienceGraphSummary(
  limit = 12,
): Promise<BaseResponse<ExperienceGraphSummary>> {
  return http.get<BaseResponse<ExperienceGraphSummary>>(
    `/api/experience/graph/summary?limit=${limit}`,
  ) as unknown as Promise<BaseResponse<ExperienceGraphSummary>>
}

export async function getExperienceGraph(
  params: ExperienceGraphQuery = {},
): Promise<BaseResponse<ExperienceGraphDetail>> {
  const query = new URLSearchParams()
  if (params.query) query.set('query', params.query)
  query.set('limit', String(params.limit ?? 500))
  query.set('include_neighbors', String(params.include_neighbors ?? true))
  for (const type of params.node_type ?? []) {
    query.append('node_type', type)
  }
  return http.get<BaseResponse<ExperienceGraphDetail>>(
    `/api/experience/graph?${query.toString()}`,
  ) as unknown as Promise<BaseResponse<ExperienceGraphDetail>>
}

export async function getExperienceDagContext(
  params: ExperienceDagContextRequest,
): Promise<BaseResponse<ExperienceDagContext>> {
  const query = new URLSearchParams()
  query.set('query', params.query)
  query.set('limit', String(params.limit ?? 8))
  for (const template of params.candidate_templates ?? []) {
    query.append('candidate_template', template)
  }
  return http.get<BaseResponse<ExperienceDagContext>>(
    `/api/experience/dag-context?${query.toString()}`,
  ) as unknown as Promise<BaseResponse<ExperienceDagContext>>
}

export async function postExperienceDagContext(
  request: ExperienceDagContextRequest,
): Promise<BaseResponse<ExperienceDagContext>> {
  return http.post<BaseResponse<ExperienceDagContext>>(
    '/api/experience/dag-context',
    {
      query: request.query,
      candidate_templates: request.candidate_templates ?? [],
      limit: request.limit ?? 8,
    },
  ) as unknown as Promise<BaseResponse<ExperienceDagContext>>
}
