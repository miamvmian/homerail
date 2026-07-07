import { isAndroidTvShell, type HomeRailBridgeWindow } from './voice-host-platform'

export interface AndroidTvWireGuardConfig {
  name: string
  interfacePrivateKey: string
  interfaceAddress: string
  dns: string
  peerPublicKey: string
  peerPreSharedKey: string
  endpoint: string
  allowedIps: string
  persistentKeepalive: string
  rawConfig: string
}

export interface AndroidTvWireGuardStatus {
  event: string
  connected: boolean
  configured: boolean
  vpnAuthorized: boolean
  endpoint: string
  profileName: string
  tunnelName: string
  state: string
  runningTunnels: string[]
  backendVersion: string
  rxBytes: number
  txBytes: number
  latestHandshakeEpochMillis: number
  lastError: string
  code?: string
  message?: string
}

export interface AndroidTvWireGuardResponse {
  ok: boolean
  configured: boolean
  endpoint: string
  config: AndroidTvWireGuardConfig
  code?: string
  message?: string
}

interface AndroidTvWireGuardBridge {
  getWireGuardConfig?: () => unknown
  saveWireGuardConfig?: (json: string) => unknown
  setWireGuardConfig?: (json: string) => unknown
  clearWireGuardConfig?: () => unknown
  getWireGuardStatus?: () => unknown
  connectWireGuard?: (profileName: string) => unknown
  disconnectWireGuard?: () => unknown
}

export interface AndroidTvWireGuardWindow extends HomeRailBridgeWindow {
  HomeRailBridge?: HomeRailBridgeWindow['HomeRailBridge'] & AndroidTvWireGuardBridge
}

function currentWindow(): AndroidTvWireGuardWindow | null {
  if (typeof window === 'undefined') return null
  return window as Window & AndroidTvWireGuardWindow
}

export function createEmptyWireGuardConfig(): AndroidTvWireGuardConfig {
  return {
    name: 'wg0',
    interfacePrivateKey: '',
    interfaceAddress: '',
    dns: '',
    peerPublicKey: '',
    peerPreSharedKey: '',
    endpoint: '',
    allowedIps: '',
    persistentKeepalive: '25',
    rawConfig: ''
  }
}

export function createEmptyWireGuardStatus(): AndroidTvWireGuardStatus {
  return {
    event: 'stopped',
    connected: false,
    configured: false,
    vpnAuthorized: false,
    endpoint: '',
    profileName: '',
    tunnelName: '',
    state: 'down',
    runningTunnels: [],
    backendVersion: '',
    rxBytes: 0,
    txBytes: 0,
    latestHandshakeEpochMillis: 0,
    lastError: ''
  }
}

function bridgeFor(
  hostWindow: AndroidTvWireGuardWindow | null = currentWindow()
): AndroidTvWireGuardBridge | null {
  if (!isAndroidTvShell(hostWindow)) return null
  return hostWindow?.HomeRailBridge ?? null
}

export function androidTvWireGuardAvailable(
  hostWindow: AndroidTvWireGuardWindow | null = currentWindow()
): boolean {
  const bridge = bridgeFor(hostWindow)
  return Boolean(
    bridge?.getWireGuardConfig &&
      (bridge.saveWireGuardConfig || bridge.setWireGuardConfig) &&
      bridge.clearWireGuardConfig &&
      bridge.getWireGuardStatus &&
      bridge.connectWireGuard &&
      bridge.disconnectWireGuard
  )
}

function parseBridgePayload(raw: unknown): any {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return {}
    return JSON.parse(trimmed)
  }
  if (raw && typeof raw === 'object') return raw
  return {}
}

function stringValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function numberValue(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function normalizeWireGuardStatus(payload: unknown): AndroidTvWireGuardStatus {
  const source = parseBridgePayload(payload)
  const empty = createEmptyWireGuardStatus()
  const runningTunnels = Array.isArray(source.runningTunnels)
    ? source.runningTunnels.map((item: unknown) => stringValue(item)).filter(Boolean)
    : []
  return {
    event: stringValue(source.event, source.connected ? 'connected' : empty.event),
    connected: Boolean(source.connected),
    configured: Boolean(source.configured),
    vpnAuthorized: Boolean(source.vpnAuthorized),
    endpoint: stringValue(source.endpoint),
    profileName: stringValue(source.profileName),
    tunnelName: stringValue(source.tunnelName),
    state: stringValue(source.state, source.connected ? 'up' : empty.state),
    runningTunnels,
    backendVersion: stringValue(source.backendVersion),
    rxBytes: numberValue(source.rxBytes),
    txBytes: numberValue(source.txBytes),
    latestHandshakeEpochMillis: numberValue(source.latestHandshakeEpochMillis),
    lastError: stringValue(source.lastError),
    code: source.code ? String(source.code) : undefined,
    message: source.message ? String(source.message) : undefined
  }
}

export function normalizeWireGuardConfig(input: unknown): AndroidTvWireGuardConfig {
  const source = (input && typeof input === 'object' ? input : {}) as Partial<AndroidTvWireGuardConfig>
  const empty = createEmptyWireGuardConfig()
  return {
    name: stringValue(source.name, empty.name) || empty.name,
    interfacePrivateKey: stringValue(source.interfacePrivateKey),
    interfaceAddress: stringValue(source.interfaceAddress),
    dns: stringValue(source.dns),
    peerPublicKey: stringValue(source.peerPublicKey),
    peerPreSharedKey: stringValue(source.peerPreSharedKey),
    endpoint: stringValue(source.endpoint),
    allowedIps: stringValue(source.allowedIps),
    persistentKeepalive: stringValue(source.persistentKeepalive, empty.persistentKeepalive) || empty.persistentKeepalive,
    rawConfig: stringValue(source.rawConfig)
  }
}

function normalizeWireGuardResponse(raw: unknown): AndroidTvWireGuardResponse {
  const payload = parseBridgePayload(raw)
  const config = normalizeWireGuardConfig(payload.config)
  const endpoint = stringValue(payload.endpoint, config.endpoint)
  return {
    ok: payload.ok !== false,
    configured: Boolean(payload.configured),
    endpoint,
    config: { ...config, endpoint: config.endpoint || endpoint },
    code: payload.code ? String(payload.code) : undefined,
    message: payload.message ? String(payload.message) : undefined
  }
}

export function getAndroidTvWireGuardConfig(
  hostWindow: AndroidTvWireGuardWindow | null = currentWindow()
): AndroidTvWireGuardResponse {
  const bridge = bridgeFor(hostWindow)
  if (!bridge?.getWireGuardConfig) {
    throw new Error('Android TV WireGuard bridge is unavailable')
  }
  return normalizeWireGuardResponse(bridge.getWireGuardConfig())
}

export function saveAndroidTvWireGuardConfig(
  config: AndroidTvWireGuardConfig,
  hostWindow: AndroidTvWireGuardWindow | null = currentWindow()
): AndroidTvWireGuardResponse {
  const bridge = bridgeFor(hostWindow)
  const save = bridge?.saveWireGuardConfig ? 'saveWireGuardConfig' : 'setWireGuardConfig'
  if (!bridge?.[save]) {
    throw new Error('Android TV WireGuard bridge is unavailable')
  }
  const response = normalizeWireGuardResponse(
    bridge[save]?.(JSON.stringify({ config: normalizeWireGuardConfig(config) }))
  )
  if (!response.ok) {
    throw new Error(response.message || response.code || 'WireGuard 配置保存失败')
  }
  return response
}

export function clearAndroidTvWireGuardConfig(
  hostWindow: AndroidTvWireGuardWindow | null = currentWindow()
): AndroidTvWireGuardResponse {
  const bridge = bridgeFor(hostWindow)
  if (!bridge?.clearWireGuardConfig) {
    throw new Error('Android TV WireGuard bridge is unavailable')
  }
  const response = normalizeWireGuardResponse(bridge.clearWireGuardConfig())
  if (!response.ok) {
    throw new Error(response.message || response.code || 'WireGuard 配置清除失败')
  }
  return response
}

export function getAndroidTvWireGuardStatus(
  hostWindow: AndroidTvWireGuardWindow | null = currentWindow()
): AndroidTvWireGuardStatus {
  const bridge = bridgeFor(hostWindow)
  if (!bridge?.getWireGuardStatus) return createEmptyWireGuardStatus()
  return normalizeWireGuardStatus(bridge.getWireGuardStatus())
}

export function connectAndroidTvWireGuard(
  profileName: string,
  hostWindow: AndroidTvWireGuardWindow | null = currentWindow()
): AndroidTvWireGuardStatus {
  const bridge = bridgeFor(hostWindow)
  if (!bridge?.connectWireGuard) {
    throw new Error('Android TV WireGuard bridge is unavailable')
  }
  const status = normalizeWireGuardStatus(bridge.connectWireGuard(profileName))
  if (!status.connected && status.code !== 'vpn_authorization_requested') {
    throw new Error(status.message || status.code || status.lastError || 'WireGuard 连接失败')
  }
  return status
}

export function disconnectAndroidTvWireGuard(
  hostWindow: AndroidTvWireGuardWindow | null = currentWindow()
): AndroidTvWireGuardStatus {
  const bridge = bridgeFor(hostWindow)
  if (!bridge?.disconnectWireGuard) {
    throw new Error('Android TV WireGuard bridge is unavailable')
  }
  const status = normalizeWireGuardStatus(bridge.disconnectWireGuard())
  if (status.code) {
    throw new Error(status.message || status.code || status.lastError || 'WireGuard 断开失败')
  }
  return status
}

export function parseWireGuardRawConfig(
  rawConfig: string,
  base: AndroidTvWireGuardConfig = createEmptyWireGuardConfig()
): AndroidTvWireGuardConfig {
  const next = { ...base, rawConfig }
  let section = ''
  for (const rawLine of rawConfig.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const sectionMatch = line.match(/^\[(.+)]$/)
    if (sectionMatch) {
      section = sectionMatch[1]?.trim().toLowerCase() || ''
      continue
    }
    const separator = line.indexOf('=')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (section === 'interface') {
      if (key === 'privatekey') next.interfacePrivateKey = value
      else if (key === 'address') next.interfaceAddress = value
      else if (key === 'dns') next.dns = value
    } else if (section === 'peer') {
      if (key === 'publickey') next.peerPublicKey = value
      else if (key === 'presharedkey') next.peerPreSharedKey = value
      else if (key === 'endpoint') next.endpoint = value
      else if (key === 'allowedips') next.allowedIps = value
      else if (key === 'persistentkeepalive') next.persistentKeepalive = value
    }
  }
  return normalizeWireGuardConfig(next)
}
