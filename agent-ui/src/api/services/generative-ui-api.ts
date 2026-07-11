import { http, type ApiResponse } from '@/api/clients/http-client'
import type {
  GenerativeUiAttention,
  GenerativeUiDevice,
  GenerativeUiInputModality,
  GenerativeUiSurface,
  GenerativeUiViewport,
  GenerativeUiVisibility,
} from 'homerail-protocol'
import type { GenerativeUiProjectionV1 } from '@/generative-ui/types'

export interface GenerativeUiProjectionQuery {
  device: GenerativeUiDevice
  input: GenerativeUiInputModality
  viewport: GenerativeUiViewport
  attention: GenerativeUiAttention
  active_run_id?: string
}

export interface PutGenerativeUiOverrideRequest {
  visibility?: GenerativeUiVisibility
  pinned?: boolean
  preferred_surface?: GenerativeUiSurface
}

export async function getVoiceGenerativeUiProjection(
  sessionId: string,
  query: GenerativeUiProjectionQuery,
): Promise<ApiResponse<GenerativeUiProjectionV1>> {
  return http.get<GenerativeUiProjectionV1>(
    `/api/voice-agent/sessions/${encodeURIComponent(sessionId)}/generative-ui`,
    { params: query },
  )
}

export async function putVoiceGenerativeUiOverride(
  sessionId: string,
  nodeId: string,
  request: PutGenerativeUiOverrideRequest,
): Promise<ApiResponse<{ override: GenerativeUiProjectionV1['overrides'][number] }>> {
  return http.put<{ override: GenerativeUiProjectionV1['overrides'][number] }>(
    `/api/voice-agent/sessions/${encodeURIComponent(sessionId)}/generative-ui/overrides/${encodeURIComponent(nodeId)}`,
    request,
  )
}

export async function deleteVoiceGenerativeUiOverride(
  sessionId: string,
  nodeId: string,
): Promise<ApiResponse<{ document_id: string; node_id: string }>> {
  return http.delete<{ document_id: string; node_id: string }>(
    `/api/voice-agent/sessions/${encodeURIComponent(sessionId)}/generative-ui/overrides/${encodeURIComponent(nodeId)}`,
  )
}
