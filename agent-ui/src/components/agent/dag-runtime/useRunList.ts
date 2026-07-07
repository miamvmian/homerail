/**
 * useRunList — 拉取持久化的 DAG run 列表（GET /api/runs）。
 *
 * 进入覆盖层时刷新一次；活跃 run 完成后外部可调 refresh() 再次拉取。
 * 列表按 createdAt 倒序（最新在前）。
 */

import { ref, onMounted } from 'vue'
import { http } from '@/api/clients/http-client'

export interface RunListItem {
  runId: string
  workflowId?: string
  workflowName?: string
  nodeCount?: number
  status: string
  createdAt: number
  completedAt?: number
}

interface RunsResponse {
  runs: RunListItem[]
  total: number
}

export function useRunList() {
  const runs = ref<RunListItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await http.get<any>('/api/runs')
      const data = (res.data ?? res) as RunsResponse
      const list = (data?.runs ?? []) as RunListItem[]
      // 倒序：最新在前
      runs.value = list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    } catch (e: any) {
      error.value = e?.message || '无法加载 run 列表'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void refresh()
  })

  return { runs, loading, error, refresh }
}
