/**
 * 协议显示名映射。
 *
 * 协议是凭证的附属属性，不参与选择，只在底部信息区显示。
 * 命名按 API 风格而非厂商：openai_compatible → "Chat Completions"。
 */

export type ProtocolId = 'openai_compatible' | 'anthropic_compatible' | 'dashscope_native' | 'volcengine_doubao_voice' | 'volcengine_ark_voice' | 'volcengine_openspeech' | 'custom'

const PROTOCOL_LABELS: Record<string, string> = {
  openai_compatible: 'Chat Completions',
  anthropic_compatible: 'Anthropic',
  dashscope_native: 'DashScope',
  volcengine_doubao_voice: '火山语音（兼容）',
  volcengine_ark_voice: '火山语音 openspeech',
  volcengine_openspeech: '火山语音 openspeech',
  custom: '自定义',
}

export function protocolLabel(protocol?: string): string {
  if (!protocol) return '—'
  return PROTOCOL_LABELS[protocol] ?? protocol
}

/** 计费计划显示名 */
export function planLabel(plan?: string): string {
  if (plan === 'api_billing') return 'API 计费'
  if (plan === 'token_plan') return 'Token Plan'
  if (plan === 'coding_plan') return 'Coding Plan'
  if (plan === 'agent_plan') return 'Agent Plan'
  if (plan === 'subscription') return 'Subscription'
  return 'Custom'
}
