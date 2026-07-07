/**
 * useDagRuntime — 拉取 DAG 运行时指标（工具调用/失败/token）并轮询刷新。
 *
 * 用于 DagRuntimeOverlay 全屏覆盖层。指标数据来自后端
 * GET /api/dag-status/:runId/metrics。节点状态/拓扑仍由 useAgentStore
 * 管理（实时 WS 更新），这里只负责 metrics 维度。
 */

import { ref, watch, onUnmounted, type Ref } from 'vue'
import { dagApi } from '@/api/services/dag-api'
import type { DAGRunMetrics } from '@/api/types/dag.types'

export function useDagRuntime(runId: Ref<string | null>) {
  const metrics = ref<DAGRunMetrics | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let pollTimer: number | undefined
  const POLL_INTERVAL = 4000

  async function refresh(): Promise<void> {
    const id = runId.value
    if (!id) {
      metrics.value = null
      stopPolling()
      return
    }
    const requestRunId = id
    try {
      loading.value = metrics.value === null
      const result = await dagApi.getDagRunMetrics(requestRunId)
      if (runId.value !== requestRunId) return
      metrics.value = result
      error.value = null
    } catch (e: any) {
      if (runId.value !== requestRunId) return
      error.value = e?.message || 'metrics unavailable'
      // 保持上次成功的数据，不清空，避免覆盖层闪烁
    } finally {
      loading.value = false
    }
    schedulePoll()
  }

  function schedulePoll(): void {
    stopPolling()
    if (!runId.value) return
    pollTimer = window.setTimeout(() => {
      void refresh()
    }, POLL_INTERVAL)
  }

  function stopPolling(): void {
    if (pollTimer !== undefined) {
      window.clearTimeout(pollTimer)
      pollTimer = undefined
    }
  }

  watch(runId, () => {
    stopPolling()
    metrics.value = null
    void refresh()
  }, { immediate: true })

  onUnmounted(stopPolling)

  return { metrics, loading, error, refresh }
}
