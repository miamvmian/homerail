import { afterEach, describe, expect, it, vi } from 'vitest'

import { http } from '../clients/http-client'
import { agentEvidenceApi, getChange, getRun } from './agent-evidence-api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('agent evidence API', () => {
  it('encodes project, change, and run identifiers in raw requests', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ success: true, data: {} })

    await getChange('project/a b', 'change/a b')
    await getRun('run/a b')

    expect(get).toHaveBeenNthCalledWith(1, '/api/projects/project%2Fa%20b/changes/change%2Fa%20b')
    expect(get).toHaveBeenNthCalledWith(2, '/api/runs/run%2Fa%20b')
  })

  it('normalizes change evidence without leaking transport response fields', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({
      success: true,
      data: {
        id: 'change-1',
        project_id: 'project-1',
        title: 'CI foundation',
        status: 'ready',
        diff_summary: 'Adds deterministic checks',
        created_at: 'created'
      },
      message: 'ignored transport message'
    })

    await expect(agentEvidenceApi.getChangeEvidence('project-1', 'change-1')).resolves.toEqual({
      id: 'change-1',
      project_id: 'project-1',
      title: 'CI foundation',
      status: 'ready',
      diff_summary: 'Adds deterministic checks',
      created_at: 'created'
    })
  })

  it('uses the same normalized run contract for summaries and details', async () => {
    vi.spyOn(http, 'get')
      .mockResolvedValueOnce({
        success: true,
        data: { run_id: 'run-1', status: 'completed', created_at: 'created' }
      })
      .mockResolvedValueOnce({
        success: true,
        data: { id: 'run-2', status: 'failed', completed_at: 'completed' }
      })

    await expect(agentEvidenceApi.getRunSummary('run-1')).resolves.toEqual({
      id: 'run-1',
      status: 'completed',
      created_at: 'created',
      completed_at: undefined
    })
    await expect(agentEvidenceApi.getRunDetail('run-2')).resolves.toEqual({
      id: 'run-2',
      status: 'failed',
      created_at: '',
      completed_at: 'completed'
    })
  })
})
