import { describe, expect, it } from 'vitest'
import {
  VOICE_GAMEPAD_BUTTON,
  resolveVoiceGamepadButtonIntent,
  resolveVoiceGamepadContext,
  resolveVoiceGamepadDirectionIntent
} from './voice-gamepad-router'

describe('voice gamepad router', () => {
  it('maps the PS5 triangle button to voice toggle on the canvas', () => {
    const context = resolveVoiceGamepadContext({
      artifactPreviewOpen: false,
      sessionPanelOpen: false,
      sessionFocusActive: false
    })

    expect(resolveVoiceGamepadButtonIntent(context, VOICE_GAMEPAD_BUTTON.triangle)).toBe(
      'voice_toggle'
    )
  })

  it('maps shoulder buttons to widget navigation on the canvas', () => {
    expect(resolveVoiceGamepadButtonIntent('canvas', VOICE_GAMEPAD_BUTTON.l1)).toBe(
      'widget_previous'
    )
    expect(resolveVoiceGamepadButtonIntent('canvas', VOICE_GAMEPAD_BUTTON.r1)).toBe('widget_next')
  })

  it('uses circle to close previews and d-pad left/right to switch preview pages', () => {
    expect(resolveVoiceGamepadButtonIntent('artifact_preview', VOICE_GAMEPAD_BUTTON.circle)).toBe(
      'system_cancel'
    )
    expect(resolveVoiceGamepadDirectionIntent('artifact_preview', 'left')).toBe('preview_previous')
    expect(resolveVoiceGamepadDirectionIntent('artifact_preview', 'right')).toBe('preview_next')
  })

  it('maps session sidebar controls to list navigation and actions', () => {
    expect(resolveVoiceGamepadButtonIntent('sessions', VOICE_GAMEPAD_BUTTON.dpadUp)).toBe(
      'session_up'
    )
    expect(resolveVoiceGamepadButtonIntent('sessions', VOICE_GAMEPAD_BUTTON.dpadDown)).toBe(
      'session_down'
    )
    expect(resolveVoiceGamepadButtonIntent('sessions', VOICE_GAMEPAD_BUTTON.cross)).toBe(
      'session_confirm'
    )
    expect(resolveVoiceGamepadButtonIntent('sessions', VOICE_GAMEPAD_BUTTON.square)).toBe(
      'session_toggle_project_sessions'
    )
    expect(resolveVoiceGamepadButtonIntent('sessions', VOICE_GAMEPAD_BUTTON.triangle)).toBe(
      'voice_toggle'
    )
    expect(resolveVoiceGamepadDirectionIntent('sessions', 'up')).toBe('session_up')
    expect(resolveVoiceGamepadDirectionIntent('sessions', 'down')).toBe('session_down')
  })

  // ── DAG Runtime overlay ────────────────────────────────────────

  it('maps run list navigation: d-pad/L1/R1 switch runs, cross confirms, circle exits', () => {
    expect(resolveVoiceGamepadButtonIntent('dag_run_list', VOICE_GAMEPAD_BUTTON.dpadUp)).toBe(
      'run_previous'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_run_list', VOICE_GAMEPAD_BUTTON.dpadDown)).toBe(
      'run_next'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_run_list', VOICE_GAMEPAD_BUTTON.l1)).toBe(
      'run_previous'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_run_list', VOICE_GAMEPAD_BUTTON.r1)).toBe(
      'run_next'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_run_list', VOICE_GAMEPAD_BUTTON.cross)).toBe(
      'run_confirm'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_run_list', VOICE_GAMEPAD_BUTTON.circle)).toBe(
      'runtime_exit'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_run_list', VOICE_GAMEPAD_BUTTON.triangle)).toBe(
      'runtime_exit'
    )
    expect(resolveVoiceGamepadDirectionIntent('dag_run_list', 'up')).toBe('run_previous')
    expect(resolveVoiceGamepadDirectionIntent('dag_run_list', 'down')).toBe('run_next')
  })

  it('maps graph node focus navigation: d-pad moves focus, cross confirms, circle exits', () => {
    expect(resolveVoiceGamepadButtonIntent('dag_graph', VOICE_GAMEPAD_BUTTON.dpadUp)).toBe(
      'node_navigate_up'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_graph', VOICE_GAMEPAD_BUTTON.dpadDown)).toBe(
      'node_navigate_down'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_graph', VOICE_GAMEPAD_BUTTON.dpadLeft)).toBe(
      'node_navigate_left'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_graph', VOICE_GAMEPAD_BUTTON.dpadRight)).toBe(
      'node_navigate_right'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_graph', VOICE_GAMEPAD_BUTTON.cross)).toBe(
      'node_confirm'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_graph', VOICE_GAMEPAD_BUTTON.circle)).toBe(
      'runtime_exit'
    )
    expect(resolveVoiceGamepadDirectionIntent('dag_graph', 'up')).toBe('node_direction')
  })

  it('maps detail drawer: circle/triangle close, no exit from graph', () => {
    expect(resolveVoiceGamepadButtonIntent('dag_detail', VOICE_GAMEPAD_BUTTON.circle)).toBe(
      'detail_close'
    )
    expect(resolveVoiceGamepadButtonIntent('dag_detail', VOICE_GAMEPAD_BUTTON.triangle)).toBe(
      'detail_close'
    )
    // cross does nothing in detail (progressive back uses circle)
    expect(resolveVoiceGamepadButtonIntent('dag_detail', VOICE_GAMEPAD_BUTTON.cross)).toBe('none')
  })
})
