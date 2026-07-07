import { http } from '../clients/http-client'
import type { BaseResponse } from '../types/common.types'

export type MCPServerType = 'SSE' | 'STDIO'

export interface MCPServer {
  id: string
  name: string
  description?: string | null
  type: MCPServerType
  url?: string | null
  command?: string | null
  arguments?: string[] | string | null
  environment_variables?: Record<string, string> | string | null
  enabled: boolean
  build_in?: boolean
  create_time?: number | null
  runtime_status?: string
  runtime_message?: string
}

export interface AddMCPServerRequest {
  name: string
  type: MCPServerType
  url?: string
  command?: string
  arguments?: string
  environment_variables?: string
  enabled?: boolean
}

export interface UpdateMCPServerRequest extends Partial<AddMCPServerRequest> {
  id: string
}

export async function listMCPServers(): Promise<BaseResponse<{ servers: MCPServer[] }>> {
  return http.get<BaseResponse<{ servers: MCPServer[] }>>('/api/api/mcp/') as unknown as Promise<BaseResponse<{ servers: MCPServer[] }>>
}

export async function addMCPServer(
  request: AddMCPServerRequest,
): Promise<BaseResponse<MCPServer | null>> {
  return http.post<BaseResponse<MCPServer | null>>('/api/api/mcp/', request) as unknown as Promise<BaseResponse<MCPServer | null>>
}

export async function updateMCPServer(
  request: UpdateMCPServerRequest,
): Promise<BaseResponse<MCPServer>> {
  return http.put<BaseResponse<MCPServer>>('/api/api/mcp/', request) as unknown as Promise<BaseResponse<MCPServer>>
}

export async function refreshMCPServerRuntime(id: string): Promise<BaseResponse<MCPServer>> {
  return http.post<BaseResponse<MCPServer>>('/api/api/mcp/runtime-refresh', { id }) as unknown as Promise<BaseResponse<MCPServer>>
}

export async function deleteMCPServer(id: string): Promise<BaseResponse<null>> {
  return http.delete<BaseResponse<null>>('/api/api/mcp/', { data: { id } }) as unknown as Promise<BaseResponse<null>>
}

export const mcpApi = {
  list: listMCPServers,
  add: addMCPServer,
  update: updateMCPServer,
  refreshRuntime: refreshMCPServerRuntime,
  delete: deleteMCPServer,
}
