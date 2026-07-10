import { describe, expect, it } from 'vitest'

import { mapManagerSessionMessages } from './message-mapper'

describe('Manager session message mapper', () => {
  it('maps conversation, thinking, tool, error, and fallback records', () => {
    const mapped = mapManagerSessionMessages(
      [
        { message_type: 'user', content: { text: 'Review this PR' }, timestamp: 't1' },
        { message_type: 'text', content: { content: 'Starting review' }, timestamp: 't2' },
        { message_type: 'thinking', content: {}, timestamp: 't3' },
        {
          message_type: 'tool_usage',
          content: {
            tool_id: 'tool-1',
            name: 'mcp__dag-tools__handoff',
            input: { run_id: 'run-1', artifact: 'review', extra: true }
          },
          timestamp: 't4'
        },
        {
          message_type: 'tool_result',
          content: { tool_id: 'tool-1', output: { ok: true }, is_error: true },
          timestamp: 't5'
        },
        {
          message_type: 'tool_result',
          content: { tool_id: 'orphan', tool_name: 'mcp__tools__read', content: 'fallback' },
          timestamp: 't6'
        },
        { message_type: 'error', content: { message: 'Manager failed' }, timestamp: 't7' },
        { message_type: 'unknown', content: { state: 'custom' }, timestamp: 't8' }
      ],
      'session-1'
    )

    expect(mapped).toHaveLength(7)
    expect(mapped[0]).toMatchObject({ role: 'user', content: 'Review this PR', type: 'text' })
    expect(mapped[1]).toMatchObject({ role: 'assistant', content: 'Starting review' })
    expect(mapped[2]).toMatchObject({ type: 'thinking', content: 'Manager Agent 已分析请求' })
    expect(mapped[3]).toMatchObject({
      id: 'db-session-1-3',
      type: 'tool_call',
      toolId: 'tool-1',
      toolName: 'handoff',
      toolSummary: 'run_id, artifact, extra',
      toolResult: '{\n  "ok": true\n}',
      status: 'failed'
    })
    expect(mapped[4]).toMatchObject({
      type: 'tool_call',
      toolId: 'orphan',
      toolName: 'read',
      toolResult: 'fallback',
      status: 'completed'
    })
    expect(mapped[5]).toMatchObject({ type: 'status', content: 'Manager failed' })
    expect(mapped[6]).toMatchObject({ content: '{"state":"custom"}' })
  })

  it('supports string content and supplies timestamps when records omit them', () => {
    const mapped = mapManagerSessionMessages(
      [
        { message_type: 'user', content: 'hello' },
        { message_type: 'thinking', content: 'reasoning' },
        { message_type: 'error', content: 'failed' }
      ],
      'session-2'
    )

    expect(mapped.map(message => message.content)).toEqual(['hello', 'reasoning', 'failed'])
    expect(mapped.every(message => typeof message.timestamp === 'string')).toBe(true)
  })
})
