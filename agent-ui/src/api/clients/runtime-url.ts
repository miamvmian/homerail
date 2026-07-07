const DEFAULT_MANAGER_PORT = import.meta.env.VITE_HOMERAIL_MANAGER_PORT || '19191'

export interface RuntimeConfigWindow {
  __HOMERAIL_RUNTIME_CONFIG__?: unknown
  HomeRailBridge?: {
    getManagerUrl?: () => unknown
  }
  location?: Location
}

export interface HomeRailRuntimeConfig {
  apiBaseUrl?: string
  wsUrl?: string
}

export interface RuntimeUrlEnv {
  apiBaseUrl?: string
  apiUrl?: string
  wsUrl?: string
  managerPort?: string
  dev?: boolean
}

function currentWindow(): RuntimeConfigWindow | null {
  if (typeof window === 'undefined') return null
  return window as Window & RuntimeConfigWindow
}

function runtimeConfig(hostWindow: RuntimeConfigWindow | null): HomeRailRuntimeConfig | null {
  const raw = hostWindow?.__HOMERAIL_RUNTIME_CONFIG__
  return raw && typeof raw === 'object' ? (raw as HomeRailRuntimeConfig) : null
}

function normalizeBaseUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

export function bridgeManagerUrl(hostWindow: RuntimeConfigWindow | null = currentWindow()): string {
  try {
    return normalizeBaseUrl(hostWindow?.HomeRailBridge?.getManagerUrl?.())
  } catch {
    return ''
  }
}

function browserHostname(hostWindow: RuntimeConfigWindow | null): string {
  return hostWindow?.location?.hostname || 'localhost'
}

function browserProtocol(hostWindow: RuntimeConfigWindow | null): string {
  return hostWindow?.location?.protocol === 'https:' ? 'https:' : 'http:'
}

function browserOrigin(hostWindow: RuntimeConfigWindow | null): string {
  return hostWindow?.location?.origin || 'http://localhost'
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function derivedApiBaseUrl(
  hostWindow: RuntimeConfigWindow | null = currentWindow(),
  managerPort = DEFAULT_MANAGER_PORT,
): string {
  const hostname = browserHostname(hostWindow)
  const protocol = isLocalHostname(hostname) ? 'http:' : browserProtocol(hostWindow)
  const host = isLocalHostname(hostname) ? 'localhost' : hostname
  return `${protocol}//${host}:${managerPort}`
}

function isHttpsDevWithHttpApi(
  hostWindow: RuntimeConfigWindow | null,
  env: RuntimeUrlEnv,
  configured: string,
): boolean {
  return Boolean(env.dev && hostWindow?.location?.protocol === 'https:' && configured.startsWith('http://'))
}

export function defaultApiBaseUrl(
  hostWindow: RuntimeConfigWindow | null = currentWindow(),
  env: RuntimeUrlEnv = {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    apiUrl: import.meta.env.VITE_API_URL,
    managerPort: DEFAULT_MANAGER_PORT,
    dev: import.meta.env.DEV,
  },
): string {
  const bridgeUrl = bridgeManagerUrl(hostWindow)
  if (bridgeUrl) return bridgeUrl

  const runtime = runtimeConfig(hostWindow)
  if (runtime && Object.prototype.hasOwnProperty.call(runtime, 'apiBaseUrl')) {
    return normalizeBaseUrl(runtime.apiBaseUrl)
  }

  const configured = normalizeBaseUrl(env.apiBaseUrl || env.apiUrl)
  if (
    env.dev &&
    hostWindow?.location?.protocol === 'https:' &&
    (!configured || configured.startsWith('http://'))
  ) {
    return ''
  }
  return configured || derivedApiBaseUrl(hostWindow, env.managerPort || DEFAULT_MANAGER_PORT)
}

export function webSocketUrlFromHttpBase(baseUrl: string, path = '/ws'): string {
  return `${normalizeBaseUrl(baseUrl)
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:')}${path}`
}

export function sameOriginWebSocketUrl(
  hostWindow: RuntimeConfigWindow | null = currentWindow(),
  path = '/ws',
): string {
  return `${browserOrigin(hostWindow)
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:')}${path}`
}

export function defaultWebSocketUrl(
  hostWindow: RuntimeConfigWindow | null = currentWindow(),
  env: RuntimeUrlEnv = {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    apiUrl: import.meta.env.VITE_API_URL,
    wsUrl: import.meta.env.VITE_WS_URL,
    managerPort: DEFAULT_MANAGER_PORT,
    dev: import.meta.env.DEV,
  },
): string {
  const runtime = runtimeConfig(hostWindow)
  if (runtime && Object.prototype.hasOwnProperty.call(runtime, 'wsUrl')) {
    const wsUrl = normalizeBaseUrl(runtime.wsUrl)
    return wsUrl ? `${wsUrl}/ws` : sameOriginWebSocketUrl(hostWindow)
  }

  const bridgeUrl = bridgeManagerUrl(hostWindow)
  if (bridgeUrl) return webSocketUrlFromHttpBase(bridgeUrl)

  if (runtime && Object.prototype.hasOwnProperty.call(runtime, 'apiBaseUrl')) {
    const apiBaseUrl = normalizeBaseUrl(runtime.apiBaseUrl)
    return apiBaseUrl ? webSocketUrlFromHttpBase(apiBaseUrl) : sameOriginWebSocketUrl(hostWindow)
  }

  const explicitWsUrl = normalizeBaseUrl(env.wsUrl)
  if (explicitWsUrl) return explicitWsUrl

  const apiBaseUrl = normalizeBaseUrl(env.apiBaseUrl || env.apiUrl)
  if (apiBaseUrl && !isHttpsDevWithHttpApi(hostWindow, env, apiBaseUrl)) {
    return webSocketUrlFromHttpBase(apiBaseUrl)
  }

  if (env.dev && hostWindow?.location?.protocol === 'https:') {
    return sameOriginWebSocketUrl(hostWindow)
  }

  return `ws://localhost:${env.managerPort || DEFAULT_MANAGER_PORT}/ws`
}
