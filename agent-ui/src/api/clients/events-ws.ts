/**
 * Dedicated WebSocket client for the manager events channel (/ws/events).
 *
 * The manager's events-websocket.ts listens on /ws/events (NOT /ws) and
 * forwards DAG_* and voice:session_status events to all connected clients.
 * This shared singleton connects lazily and exposes a typed `on()`
 * subscription so components can react to live status updates without polling.
 */
import { createWebSocketClient } from './websocket-client'
import { defaultWebSocketUrl } from './runtime-url'

// defaultWebSocketUrl() returns a URL ending in /ws, but the events channel
// lives at /ws/events. Strip the trailing /ws and append /ws/events.
function eventsWebSocketUrl(): string {
  const base = defaultWebSocketUrl()
  return base.replace(/\/ws$/, '/ws/events')
}

const client = createWebSocketClient({ url: eventsWebSocketUrl() })

export const voiceWs = client
