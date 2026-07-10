import { afterEach, describe, expect, it, vi } from 'vitest'

import { http } from '../clients/http-client'
import {
  agentSessionApi,
  closeManagerSession,
  deleteManagerSession,
  getManagerSession,
  getManagerSessionMessages,
  listManagerSessions
} from './agent-session-api'

const rawSession = {
  session_id: 'session/one',
  project_id: 'project-1',
  status: 'active',
  created_at: 'created',
  updated_at: 'updated',
  metadata: { source: 'test' }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('agent session API', () => {
  it('routes raw Manager session operations with encoded IDs and limits', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ success: true, data: {} })
    const post = vi.spyOn(http, 'post').mockResolvedValue({ success: true, data: {} })
    const remove = vi.spyOn(http, 'delete').mockResolvedValue({ success: true, data: {} })

    await listManagerSessions('project-1', 12)
    await getManagerSession('session/a b')
    await getManagerSessionMessages('session/a b', 45)
    await closeManagerSession('session/a b')
    await deleteManagerSession('session/a b')

    expect(get).toHaveBeenNthCalledWith(1, '/api/manager/sessions', {
      params: { project_id: 'project-1', limit: 12 }
    })
    expect(get).toHaveBeenNthCalledWith(2, '/api/manager/sessions/session%2Fa%20b')
    expect(get).toHaveBeenNthCalledWith(3, '/api/manager/sessions/session%2Fa%20b/messages', {
      params: { limit: 45 }
    })
    expect(post).toHaveBeenCalledWith('/api/manager/sessions/session%2Fa%20b/close')
    expect(remove).toHaveBeenCalledWith('/api/manager/sessions/session%2Fa%20b')
  })

  it('creates native sessions and normalizes native text turns', async () => {
    const post = vi
      .spyOn(http, 'post')
      .mockResolvedValueOnce({ success: true, data: rawSession })
      .mockResolvedValueOnce({
        success: true,
        data: {
          session_id: 'session/one',
          run_id: 'run-1',
          turn_id: 'turn-1',
          user_message: { type: 'user', content: 'hello', run_id: 'run-1' },
          assistant_message: {
            role: 'assistant',
            content: { answer: 'world' },
            evidence_id: 'evidence-1'
          }
        }
      })

    await expect(
      agentSessionApi.createNativeSession({ session_id: 'session/one' })
    ).resolves.toMatchObject({ id: 'session/one', metadata: { source: 'test' } })
    await expect(
      agentSessionApi.submitNativeTextTurn('session/one', { message: 'hello' })
    ).resolves.toEqual({
      session_id: 'session/one',
      run_id: 'run-1',
      turn_id: 'turn-1',
      user_message: {
        role: 'user',
        content: 'hello',
        timestamp: '',
        run_id: 'run-1',
        evidence_id: undefined
      },
      assistant_message: {
        role: 'assistant',
        content: '{"answer":"world"}',
        timestamp: '',
        run_id: undefined,
        evidence_id: 'evidence-1'
      }
    })
    expect(post).toHaveBeenNthCalledWith(1, '/api/agent/sessions', {
      session_id: 'session/one'
    })
    expect(post).toHaveBeenNthCalledWith(2, '/api/agent/sessions/session%2Fone/turns', {
      message: 'hello'
    })
  })

  it('normalizes native session details and messages', async () => {
    const get = vi
      .spyOn(http, 'get')
      .mockResolvedValueOnce({ success: true, data: rawSession })
      .mockResolvedValueOnce({
        success: true,
        data: { messages: [{ role: 'assistant', content: 'ready' }] }
      })

    await expect(agentSessionApi.getNativeSession('session/one')).resolves.toMatchObject({
      id: 'session/one',
      project_id: 'project-1'
    })
    await expect(agentSessionApi.getNativeSessionMessages('session/one')).resolves.toEqual([
      {
        role: 'assistant',
        content: 'ready',
        timestamp: '',
        run_id: undefined,
        evidence_id: undefined
      }
    ])
    expect(get).toHaveBeenNthCalledWith(1, '/api/agent/sessions/session%2Fone')
    expect(get).toHaveBeenNthCalledWith(2, '/api/agent/sessions/session%2Fone/messages')
  })

  it('supports wrapped and direct Manager session collections', async () => {
    vi.spyOn(http, 'get')
      .mockResolvedValueOnce({ success: true, data: { sessions: [rawSession] } })
      .mockResolvedValueOnce({ success: true, data: [rawSession] })
      .mockResolvedValueOnce({ success: true, data: rawSession })
      .mockResolvedValueOnce({
        success: true,
        data: { messages: [{ role: 'user', content: 'wrapped' }] }
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ role: 'assistant', content: 'direct' }]
      })

    await expect(agentSessionApi.listSessions('project-1')).resolves.toHaveLength(1)
    await expect(agentSessionApi.listSessions('project-1', 4)).resolves.toHaveLength(1)
    await expect(agentSessionApi.getSession('session/one')).resolves.toMatchObject({
      id: 'session/one'
    })
    await expect(agentSessionApi.getSessionMessages('session/one')).resolves.toEqual([
      expect.objectContaining({ content: 'wrapped' })
    ])
    await expect(agentSessionApi.getSessionMessages('session/one', 5)).resolves.toEqual([
      expect.objectContaining({ content: 'direct' })
    ])
  })

  it('closes and deletes sessions without returning transport responses', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({ success: true, data: {} })
    const remove = vi.spyOn(http, 'delete').mockResolvedValue({ success: true, data: {} })

    await expect(agentSessionApi.closeSession('session/one')).resolves.toBeUndefined()
    await expect(agentSessionApi.deleteSession('session/one')).resolves.toBeUndefined()
    expect(post).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
  })
})
