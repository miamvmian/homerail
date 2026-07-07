import type { Component } from 'vue'
import {
  Code2,
  TestTube2,
  ShieldCheck,
  Target,
  Rocket,
  Command,
  Bot,
} from 'lucide-vue-next'

export interface AgentPersona {
  name: string
  role: string
  icon: Component
  color: string
}

export const AGENT_PERSONAS: Record<string, AgentPersona> = {
  coder: { name: '工程师', role: '代码开发者', icon: Code2, color: '#3b82f6' },
  tester: { name: '质检师', role: '测试专家', icon: TestTube2, color: '#f59e0b' },
  reviewer: { name: '督导', role: '代码审查员', icon: ShieldCheck, color: '#10b981' },
  triage: { name: '侦察兵', role: '需求分析员', icon: Target, color: '#a855f7' },
  committer: { name: '发布官', role: '代码提交员', icon: Rocket, color: '#ef4444' },
  manager: { name: '指挥官', role: '编排调度', icon: Command, color: '#06b6d4' },
}

export function getAgentPersona(agentName: string): AgentPersona {
  const key = agentName.toLowerCase()
  for (const [k, v] of Object.entries(AGENT_PERSONAS)) {
    if (key.includes(k)) return v
  }
  return { name: agentName, role: '智能体', icon: Bot, color: '#8a8a8a' }
}

export const STATUS_LABELS: Record<string, string> = {
  pending: '等待',
  ready: '就绪',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  skipped: '跳过',
}

export function contextBarColor(pct: number): string {
  if (pct < 50) return 'bg-emerald-500'
  if (pct < 80) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function contextUsageText(pct: number): string {
  if (pct < 50) return 'text-emerald-400'
  if (pct < 80) return 'text-yellow-400'
  return 'text-red-400'
}

export function fmtTokens(n: number | undefined): string {
  if (n == null) return '-'
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1000000).toFixed(1)}M`
}
