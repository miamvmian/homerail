import type { AgentChatMessage } from './types'

export function mapManagerSessionMessages(messages: any[], sessionId: string): AgentChatMessage[] {
  const mapped: AgentChatMessage[] = []

  messages.forEach((message: any, index: number) => {
    const mt = message.message_type
    let role: AgentChatMessage['role'] = 'assistant'
    let type: AgentChatMessage['type'] = 'text'
    let content = ''
    let toolName: string | undefined
    let toolSummary: string | undefined
    let toolResult: string | undefined
    let status: AgentChatMessage['status'] = 'completed'

    if (mt === 'user') {
      role = 'user'
      content = typeof message.content === 'string' ? message.content : message.content?.text || ''
    } else if (mt === 'text') {
      content = typeof message.content === 'string' ? message.content : message.content?.content || message.content?.text || ''
    } else if (mt === 'thinking') {
      type = 'thinking'
      content = typeof message.content === 'string'
        ? message.content
        : message.content?.summary || 'Manager Agent 已分析请求'
    } else if (mt === 'tool_usage') {
      type = 'tool_call'
      toolName = (message.content?.name || '').replace(/^mcp__[^_]+__/, '')
      toolSummary = message.content?.input ? Object.keys(message.content.input).slice(0, 4).join(', ') : undefined
      content = JSON.stringify(message.content?.input || message.content, null, 2)
    } else if (mt === 'tool_result') {
      const output = message.content?.output ?? message.content?.content ?? message.content
      const resultText = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
      const previousTool = mapped
        .slice()
        .reverse()
        .find(msg => msg.type === 'tool_call' && msg.toolId === message.content?.tool_id)
      if (previousTool) {
        previousTool.toolResult = resultText
        previousTool.status = message.content?.is_error ? 'failed' : 'completed'
        return
      }
      type = 'tool_call'
      content = ''
      toolResult = resultText
      toolName = message.content?.tool_name ? (message.content.tool_name).replace(/^mcp__[^_]+__/, '') : 'tool_result'
      status = message.content?.is_error ? 'failed' : 'completed'
    } else if (mt === 'error') {
      type = 'status'
      content = typeof message.content === 'string'
        ? message.content
        : message.content?.message || message.content?.text || JSON.stringify(message.content)
    } else {
      content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    }

    mapped.push({
      id: `db-${sessionId}-${index}`,
      role,
      content,
      type,
      timestamp: message.timestamp || new Date().toISOString(),
      toolId: message.content?.tool_id,
      toolName,
      toolSummary,
      toolResult,
      status,
    })
  })

  return mapped
}
