/**
 * Session resume — restores a paused/interrupted agent session from disk.
 * @version 0.1.0
 */

import { loadSession, type SessionState } from "./session-store.js";
import type { AgentRunContext } from "../agent/types.js";

export interface ResumeResult {
  context: AgentRunContext;
  messages: SessionState["messages"];
  /** True if the session had an in-flight tool call (crashed mid-tool). */
  wasInterrupted: boolean;
}

export function resumeSession(runId: string, baseDir?: string): ResumeResult | null {
  const state = loadSession(runId, baseDir);
  if (!state) return null;

  const wasInterrupted = state.toolCallState.inFlight;

  // If interrupted mid-tool, strip the in-flight tool_use from the
  // conversation so the agent can re-execute cleanly.
  let messages = state.messages;
  if (wasInterrupted && state.toolCallState.pendingToolCallId) {
    // Remove any tool_result that might have been partially written for
    // the pending call, and keep everything up to but not including the
    // pending assistant message.
    const pendingId = state.toolCallState.pendingToolCallId;
    messages = messages.filter(
      (m) => m.tool_call_id !== pendingId && !m.tool_calls?.some((tc) => tc.id === pendingId),
    );
  }

  return {
    context: {
      ...state.agentConfig,
      apiKey: "",
      baseUrl: "",
    },
    messages,
    wasInterrupted,
  };
}
