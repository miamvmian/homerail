export const VOICE_GAMEPAD_BUTTON = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  share: 8,
  menu: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  ps: 16,
  touchpad: 17
} as const

export type VoiceGamepadDirection = 'up' | 'down' | 'left' | 'right'
export type VoiceGamepadFocusMode = 'widgets' | 'sessions'
export type VoiceGamepadInputContext =
  | 'artifact_preview'
  | 'sessions'
  | 'canvas'
  | 'dag_run_list'
  | 'dag_graph'
  | 'dag_detail'

export type VoiceGamepadContextState = {
  artifactPreviewOpen: boolean
  sessionPanelOpen: boolean
  sessionFocusActive: boolean
}

export type VoiceGamepadButtonIntent =
  | 'none'
  | 'system_preview'
  | 'system_cancel'
  | 'voice_toggle'
  | 'widget_previous'
  | 'widget_next'
  | 'session_panel_toggle'
  | 'details_panel_toggle'
  | 'preview_previous'
  | 'preview_next'
  | 'widget_confirm'
  | 'session_up'
  | 'session_down'
  | 'session_confirm'
  | 'session_toggle_project_sessions'
  // 全局快捷键（任意 context 下生效，由 overlay/cockpit 拦截）
  | 'open_runtime'
  | 'open_settings'
  // DAG Runtime overlay intents
  | 'run_previous'
  | 'run_next'
  | 'run_confirm'
  | 'node_confirm'
  | 'node_navigate_up'
  | 'node_navigate_down'
  | 'node_navigate_left'
  | 'node_navigate_right'
  | 'detail_close'
  | 'runtime_exit'
  | 'panel_toggle'
  | 'panel_up'
  | 'panel_down'

export type VoiceGamepadDirectionIntent =
  | 'none'
  | 'widget_internal_direction'
  | 'session_up'
  | 'session_down'
  | 'preview_previous'
  | 'preview_next'
  | 'run_previous'
  | 'run_next'
  | 'node_direction'

const SYSTEM_RESERVED_BUTTONS = new Set<number>([
  VOICE_GAMEPAD_BUTTON.square,
  VOICE_GAMEPAD_BUTTON.circle
])

export function isVoiceGamepadSystemReservedButton(index: number): boolean {
  return SYSTEM_RESERVED_BUTTONS.has(index)
}

export function resolveVoiceGamepadContext(
  state: VoiceGamepadContextState
): VoiceGamepadInputContext {
  if (state.artifactPreviewOpen) return 'artifact_preview'
  if (state.sessionPanelOpen || state.sessionFocusActive) return 'sessions'
  return 'canvas'
}

export function resolveVoiceGamepadButtonIntent(
  context: VoiceGamepadInputContext,
  index: number
): VoiceGamepadButtonIntent {
  // 全局快捷键：优先级最高，任何 context 下都生效。
  // 手柄 touchpad 按下 → 打开 DAG Runtime；menu(Create) → 打开设置。
  // 这些是系统级入口，不应被具体视图的 context 吞掉。
  if (index === VOICE_GAMEPAD_BUTTON.touchpad) return 'open_runtime'
  if (index === VOICE_GAMEPAD_BUTTON.menu) return 'open_settings'

  if (context === 'artifact_preview') {
    if (index === VOICE_GAMEPAD_BUTTON.circle) return 'system_cancel'
    if (index === VOICE_GAMEPAD_BUTTON.l1) return 'preview_previous'
    if (index === VOICE_GAMEPAD_BUTTON.r1) return 'preview_next'
    return 'none'
  }

  if (context === 'sessions') {
    if (index === VOICE_GAMEPAD_BUTTON.circle) return 'system_cancel'
    if (index === VOICE_GAMEPAD_BUTTON.cross) return 'session_confirm'
    if (index === VOICE_GAMEPAD_BUTTON.square) return 'session_toggle_project_sessions'
    if (index === VOICE_GAMEPAD_BUTTON.l2) return 'session_panel_toggle'
    if (index === VOICE_GAMEPAD_BUTTON.r2) return 'details_panel_toggle'
    if (index === VOICE_GAMEPAD_BUTTON.dpadUp) return 'session_up'
    if (index === VOICE_GAMEPAD_BUTTON.dpadDown) return 'session_down'
    if (index === VOICE_GAMEPAD_BUTTON.triangle) return 'voice_toggle'
    return 'none'
  }

  // ── DAG Runtime overlay contexts ───────────────────────────────
  // These are handled before the canvas fallback so DAG-specific buttons
  // are not swallowed by the generic canvas mapping.
  if (context === 'dag_run_list') {
    if (index === VOICE_GAMEPAD_BUTTON.circle) return 'runtime_exit'
    if (index === VOICE_GAMEPAD_BUTTON.triangle) return 'runtime_exit'
    if (index === VOICE_GAMEPAD_BUTTON.cross) return 'run_confirm'
    if (index === VOICE_GAMEPAD_BUTTON.l1 || index === VOICE_GAMEPAD_BUTTON.l2)
      return 'run_previous'
    if (index === VOICE_GAMEPAD_BUTTON.r1 || index === VOICE_GAMEPAD_BUTTON.r2) return 'run_next'
    if (index === VOICE_GAMEPAD_BUTTON.dpadUp) return 'run_previous'
    if (index === VOICE_GAMEPAD_BUTTON.dpadDown) return 'run_next'
    return 'none'
  }

  if (context === 'dag_graph') {
    if (index === VOICE_GAMEPAD_BUTTON.circle) return 'runtime_exit'
    if (index === VOICE_GAMEPAD_BUTTON.triangle) return 'runtime_exit'
    if (index === VOICE_GAMEPAD_BUTTON.cross) return 'node_confirm'
    if (index === VOICE_GAMEPAD_BUTTON.dpadUp) return 'node_navigate_up'
    if (index === VOICE_GAMEPAD_BUTTON.dpadDown) return 'node_navigate_down'
    if (index === VOICE_GAMEPAD_BUTTON.dpadLeft) return 'node_navigate_left'
    if (index === VOICE_GAMEPAD_BUTTON.dpadRight) return 'node_navigate_right'
    return 'none'
  }

  if (context === 'dag_detail') {
    if (index === VOICE_GAMEPAD_BUTTON.circle) return 'detail_close'
    if (index === VOICE_GAMEPAD_BUTTON.triangle) return 'detail_close'
    // 抽屉内双面板：↑↓ 切面板焦点，■ 展开折叠，←→ 按 DAG 遍历序列切节点
    if (index === VOICE_GAMEPAD_BUTTON.square) return 'panel_toggle'
    if (index === VOICE_GAMEPAD_BUTTON.dpadUp) return 'panel_up'
    if (index === VOICE_GAMEPAD_BUTTON.dpadDown) return 'panel_down'
    if (index === VOICE_GAMEPAD_BUTTON.dpadLeft) return 'node_navigate_left'
    if (index === VOICE_GAMEPAD_BUTTON.dpadRight) return 'node_navigate_right'
    return 'none'
  }

  if (index === VOICE_GAMEPAD_BUTTON.square) return 'system_preview'
  if (index === VOICE_GAMEPAD_BUTTON.circle) return 'system_cancel'
  if (index === VOICE_GAMEPAD_BUTTON.triangle) return 'voice_toggle'
  if (index === VOICE_GAMEPAD_BUTTON.cross) return 'widget_confirm'
  if (index === VOICE_GAMEPAD_BUTTON.l1) return 'widget_previous'
  if (index === VOICE_GAMEPAD_BUTTON.r1) return 'widget_next'
  if (index === VOICE_GAMEPAD_BUTTON.l2) return 'session_panel_toggle'
  if (index === VOICE_GAMEPAD_BUTTON.r2) return 'details_panel_toggle'
  return 'none'
}

export function resolveVoiceGamepadDirectionIntent(
  context: VoiceGamepadInputContext,
  direction: VoiceGamepadDirection
): VoiceGamepadDirectionIntent {
  if (context === 'artifact_preview') {
    if (direction === 'left') return 'preview_previous'
    if (direction === 'right') return 'preview_next'
    return 'none'
  }
  if (context === 'sessions') {
    if (direction === 'up') return 'session_up'
    if (direction === 'down') return 'session_down'
    return 'none'
  }
  if (context === 'dag_run_list') {
    if (direction === 'up') return 'run_previous'
    if (direction === 'down') return 'run_next'
    return 'none'
  }
  if (context === 'dag_graph') {
    return 'node_direction'
  }
  return 'widget_internal_direction'
}
