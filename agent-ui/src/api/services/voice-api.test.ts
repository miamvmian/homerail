import { afterEach, describe, expect, it, vi } from 'vitest'

import { http } from '@/api/clients/http-client'
import { speechStream } from './voice-api'

describe('voice api', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('throws the server message from speech failures instead of raw JSON', async () => {
    http.setBaseURL('http://manager.test')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      message: 'Invalid X-Api-Key',
      error: 'Invalid X-Api-Key',
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(speechStream('你好')).rejects.toThrow('Invalid X-Api-Key')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://manager.test/api/voice/speech',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: '你好', stream: false }),
      }),
    )
  })
})
