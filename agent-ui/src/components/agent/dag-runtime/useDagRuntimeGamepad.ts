/**
 * useDagRuntimeGamepad — DAG Runtime 覆盖层专用的手柄输入管道。
 *
 * 独立于 AgentVoiceCockpit 的 polling（覆盖层显示时 cockpit 已卸载，
 * gamepad 监听随之中断，所以覆盖层必须自带一套）。复用
 * voice-gamepad-router 的 intent 解析模型 + 同款 PS5/dualsense 优先
 * 选择 + 边沿检测 + 摇杆死区逻辑。
 *
 * 用法：
 *   const { gamepadConnected } = useDagRuntimeGamepad(
 *     contextRef,        // 当前输入上下文（dag_run_list/dag_graph/dag_detail）
 *     (intent, direction) => { ... },  // intent 分发回调
 *   )
 */

import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import {
  NATIVE_GAMEPAD_ANALOG_EVENT,
  NATIVE_GAMEPAD_BUTTON_EVENT,
  nativeGamepadEventDetail,
  type NativeGamepadAnalogDetail,
  type NativeGamepadButtonDetail,
} from '@/utils/native-gamepad-events'
import {
  VOICE_GAMEPAD_BUTTON,
  resolveVoiceGamepadButtonIntent,
  resolveVoiceGamepadDirectionIntent,
  type VoiceGamepadButtonIntent,
  type VoiceGamepadDirection,
  type VoiceGamepadDirectionIntent,
  type VoiceGamepadInputContext,
} from '@/components/agent/voice-gamepad-router'

export interface DagGamepadEvent {
  intent: VoiceGamepadButtonIntent | VoiceGamepadDirectionIntent
  direction?: VoiceGamepadDirection
}

/** 连续模拟量输出（每帧）。用于画布 pan、日志 scroll、画布 zoom。
 *  这些是摇杆/扳机的原始模拟值，不经过边沿检测。 */
export interface DagGamepadAnalog {
  /** 左摇杆 (axes[0], axes[1])：画布 pan，已应用死区。范围 [-1, 1]。 */
  panX: number
  panY: number
  /** 右摇杆 Y (axes[3])：日志纵向滚动，已应用死区。正值=向下滚。 */
  scrollY: number
  /** L2 扳机 (buttons[6].value)：缩小。范围 [0, 1]。 */
  zoomOut: number
  /** R2 扳机 (buttons[7].value)：放大。范围 [0, 1]。 */
  zoomIn: number
}

const PS5_PATTERN = /dualsense|dualshock|wireless controller|playstation|ps5/i

function pickGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null
  const gamepads = Array.from(navigator.getGamepads()).filter((g): g is Gamepad => Boolean(g))
  return (
    gamepads.find(g => PS5_PATTERN.test(g.id)) ||
    gamepads.find(g => g.mapping === 'standard') ||
    gamepads[0] ||
    null
  )
}

export function friendlyGamepadName(_gamepad: Gamepad): string {
  return '手柄'
}

// dpad 按钮索引 → 方向（用于 dag_graph 的 node_navigate 映射）
const DPAD_DIRECTION: Partial<Record<number, VoiceGamepadDirection>> = {
  [VOICE_GAMEPAD_BUTTON.dpadUp]: 'up',
  [VOICE_GAMEPAD_BUTTON.dpadDown]: 'down',
  [VOICE_GAMEPAD_BUTTON.dpadLeft]: 'left',
  [VOICE_GAMEPAD_BUTTON.dpadRight]: 'right',
}

export function useDagRuntimeGamepad(
  contextRef: Ref<VoiceGamepadInputContext>,
  onEvent: (event: DagGamepadEvent) => void,
  onAnalog?: (analog: DagGamepadAnalog) => void,
) {
  const gamepadConnected = ref(false)
  const gamepadName = ref('')
  let frame = 0
  let prevButtons = new Set<number>()
  const axisLocks = new Set<number>()
  let nativeAnalogAt = 0
  const AXIS_PRESS = 0.65
  const AXIS_RELEASE = 0.35
  const ANALOG_DEADZONE = 0.12

  function applyDeadzone(value: number): number {
    if (Math.abs(value) < ANALOG_DEADZONE) return 0
    // 归一化到 [0,1]，消除死区造成的中心跳跃
    return Math.sign(value) * (Math.abs(value) - ANALOG_DEADZONE) / (1 - ANALOG_DEADZONE)
  }

  function handleButtons(gamepad: Gamepad): void {
    const next = new Set<number>()
    gamepad.buttons.forEach((btn, index) => {
      if (!btn.pressed) return
      next.add(index)
      // 边沿触发：仅按下瞬间分发
      if (!prevButtons.has(index)) handleButton(index)
    })
    prevButtons = next
  }

  function handleButton(index: number): void {
    const context = contextRef.value
    const intent = resolveVoiceGamepadButtonIntent(context, index)
    if (intent !== 'none') {
      onEvent({ intent })
      return
    }
    // dag_graph 下 dpad 也通过 node_navigate_* intent 走（router 已映射）
    // 其它 context 的 dpad 兜底为方向事件
    const dir = DPAD_DIRECTION[index]
    if (dir) onEvent({ intent: resolveVoiceGamepadDirectionIntent(context, dir), direction: dir })
  }

  function markNativeGamepadConnected(): void {
    gamepadConnected.value = true
    gamepadName.value = '手柄'
  }

  function handleNativeButton(event: Event): void {
    const detail = nativeGamepadEventDetail<NativeGamepadButtonDetail>(event)
    if (!detail || !Number.isFinite(detail.index)) return
    markNativeGamepadConnected()
    if (!detail.pressed) {
      prevButtons.delete(detail.index)
      return
    }
    if (detail.repeat || prevButtons.has(detail.index)) return
    prevButtons.add(detail.index)
    handleButton(detail.index)
  }

  function handleNativeAnalog(event: Event): void {
    const detail = nativeGamepadEventDetail<NativeGamepadAnalogDetail>(event)
    if (!detail) return
    markNativeGamepadConnected()
    nativeAnalogAt = performance.now()
    handleAxis(detail.hatX ?? 0, 2, 'left', 'right')
    handleAxis(detail.hatY ?? 0, 3, 'up', 'down')
    if (onAnalog) {
      onAnalog({
        panX: applyDeadzone(detail.panX ?? 0),
        panY: applyDeadzone(detail.panY ?? 0),
        scrollY: applyDeadzone(detail.scrollY ?? 0),
        zoomOut: detail.zoomOut ?? 0,
        zoomIn: detail.zoomIn ?? 0,
      })
      return
    }
    handleAxis(detail.panX ?? 0, 0, 'left', 'right')
    handleAxis(detail.panY ?? 0, 1, 'up', 'down')
  }

  function handleAxes(gamepad: Gamepad): void {
    if (performance.now() - nativeAnalogAt <= 80) return
    // 左摇杆 (axes 0,1) → 画布 pan；右摇杆 Y (axis 3) → 日志 scroll；
    // L2/R2 (buttons 6/7) → zoom。全部连续值，每帧输出，不经边沿检测。
    // 方向键（dpad 按钮 12-15）由 handleButtons 处理，用于节点焦点导航。
    if (!onAnalog) {
      handleAxis(gamepad.axes[0] ?? 0, 0, 'left', 'right')
      handleAxis(gamepad.axes[1] ?? 0, 1, 'up', 'down')
      return
    }
    onAnalog({
      panX: applyDeadzone(gamepad.axes[0] ?? 0),
      panY: applyDeadzone(gamepad.axes[1] ?? 0),
      scrollY: applyDeadzone(gamepad.axes[3] ?? 0),
      zoomOut: gamepad.buttons[6]?.value ?? 0,
      zoomIn: gamepad.buttons[7]?.value ?? 0,
    })
  }

  function handleAxis(value: number, axisIndex: number, negative: VoiceGamepadDirection, positive: VoiceGamepadDirection): void {
    const context = contextRef.value
    if (value <= -AXIS_PRESS && !axisLocks.has(axisIndex)) {
      axisLocks.add(axisIndex)
      onEvent({ intent: resolveVoiceGamepadDirectionIntent(context, negative), direction: negative })
    } else if (value >= AXIS_PRESS && !axisLocks.has(axisIndex)) {
      axisLocks.add(axisIndex)
      onEvent({ intent: resolveVoiceGamepadDirectionIntent(context, positive), direction: positive })
    } else if (Math.abs(value) < AXIS_RELEASE) {
      axisLocks.delete(axisIndex)
    }
  }

  function poll(): void {
    const gamepad = pickGamepad()
    if (gamepad) {
      if (!gamepadConnected.value) {
        gamepadConnected.value = true
        gamepadName.value = friendlyGamepadName(gamepad)
      }
      handleButtons(gamepad)
      handleAxes(gamepad)
    } else if (gamepadConnected.value) {
      gamepadConnected.value = false
      gamepadName.value = ''
      prevButtons = new Set()
      axisLocks.clear()
      if (onAnalog) onAnalog({ panX: 0, panY: 0, scrollY: 0, zoomOut: 0, zoomIn: 0 })
    }
    frame = requestAnimationFrame(poll)
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    window.addEventListener(NATIVE_GAMEPAD_BUTTON_EVENT, handleNativeButton)
    window.addEventListener(NATIVE_GAMEPAD_ANALOG_EVENT, handleNativeAnalog)
    // 立即探测一次（手柄可能已连接）
    const g = pickGamepad()
    if (g) {
      gamepadConnected.value = true
      gamepadName.value = friendlyGamepadName(g)
    }
    frame = requestAnimationFrame(poll)
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(NATIVE_GAMEPAD_BUTTON_EVENT, handleNativeButton)
      window.removeEventListener(NATIVE_GAMEPAD_ANALOG_EVENT, handleNativeAnalog)
    }
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  })

  return { gamepadConnected, gamepadName }
}
