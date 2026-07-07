/**
 * ============================================================================
 * Agent Voice-Text Bridge - Voice Agent text-mode facade helper
 * ============================================================================
 *
 * Source Issue: #922
 *
 * Provides convenience helpers for the voice-agent text-mode path.
 * These functions call the native Agent Session API with voice_mode
 * metadata, proving the voice/text paths share the same session
 * infrastructure without depending on Python Manager 8999 or
 * microphone/ASR/TTS.
 *
 * Hard refusals:
 *   - No LLM SDK import is permitted in this module.
 *   - No microphone, ASR, or TTS import.
 *   - No call to Python Manager endpoints.
 */

import { agentSessionApi } from './agent-session-api'
import type {
  AgentSession,
  AgentNativeTextTurnResponse,
} from './agent.types'

/**
 * Options for submitting a voice-mode text turn.
 */
export interface VoiceTextTurnOptions {
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Create a voice-mode Agent Session.
 *
 * Calls the native Agent Session API with voice_mode=true metadata,
 * exercising the same POST /api/agent/sessions path that the
 * AgentChatPanel uses when in voice mode.
 */
export async function createVoiceModeSession(
  extraMeta?: Record<string, unknown>,
): Promise<AgentSession> {
  return agentSessionApi.createNativeSession({
    metadata: {
      voice_mode: true,
      source: 'voice-text-bridge',
      ...extraMeta,
    },
  })
}

/**
 * Submit a text turn to an existing voice-mode session.
 *
 * Calls the native Agent Session turns API:
 *   POST /api/agent/sessions/:sessionId/turns
 */
export async function submitVoiceTextTurn(
  sessionId: string,
  message: string,
): Promise<AgentNativeTextTurnResponse> {
  return agentSessionApi.submitNativeTextTurn(sessionId, { message })
}

/**
 * Convenience: create a voice-mode session and submit a text turn
 * in one call. Returns both the session and turn response.
 */
export async function runVoiceTextTurn(
  message: string,
): Promise<{ session: AgentSession; turn: AgentNativeTextTurnResponse }> {
  const session = await createVoiceModeSession()
  const turn = await submitVoiceTextTurn(session.id, message)
  return { session, turn }
}
