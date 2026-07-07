/**
 * ============================================================================
 * API Clients - Unified export for HTTP and WebSocket clients
 * ============================================================================
 */

export { http, default as HttpClient } from './http-client'
export type { ApiResponse, ApiError, HttpClientConfig } from './http-client'

export { ws, WebSocketClient, createWebSocketClient } from './websocket-client'
export type {
  WebSocketState,
  WebSocketMessage,
  WebSocketClientConfig,
  MessageHandler,
  StateHandler,
} from './websocket-client'
