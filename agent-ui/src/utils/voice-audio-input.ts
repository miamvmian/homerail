import { isAndroidTvShell, type HomeRailBridgeWindow } from './voice-host-platform'

const STORAGE_KEY = 'homerail.voice.audioInputDeviceId'
const PREFERRED_EXTERNAL_MIC_RE = /USB|Headset|Maono|Mic RX|Wireless Mic|External/i
const LOG_PREFIX = '[HomeRailVoiceAudio]'

export interface VoiceAudioInputDevice {
  deviceId: string
  groupId: string
  label: string
  isPreferredExternal: boolean
  isSelected: boolean
}

export interface ListVoiceAudioInputOptions {
  ensurePermission?: boolean
  mediaDevices?: MediaDevices
}

export interface CreateVoiceMediaStreamOptions {
  bridgeWindow?: HomeRailBridgeWindow | null
  mediaDevices?: MediaDevices
}

interface VoiceAudioInputSelection {
  deviceId: string
  reason: 'none' | 'persisted' | 'single' | 'android_tv_preferred' | 'browser_default'
  device?: VoiceAudioInputDevice
}

function voiceAudioDiagnosticsEnabled(androidTv = false): boolean {
  if (androidTv) return true
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('homerail.voice.audioInputDiagnostics') === '1'
  } catch {
    return false
  }
}

function safeJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(item => safeJsonValue(item))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === 'function') continue
      out[key] = safeJsonValue(item)
    }
    return out
  }
  return String(value)
}

function logVoiceAudioDiagnostic(androidTv: boolean, event: string, payload: Record<string, unknown> = {}): void {
  if (!voiceAudioDiagnosticsEnabled(androidTv)) return
  const safePayload = safeJsonValue(payload)
  try {
    console.info(`${LOG_PREFIX} ${event}`, JSON.stringify(safePayload))
  } catch {
    console.info(`${LOG_PREFIX} ${event}`, safePayload)
  }
}

function describeMediaDevice(device: MediaDeviceInfo): Record<string, unknown> {
  return {
    kind: device.kind,
    label: device.label || '',
    deviceId: device.deviceId || '',
    groupId: device.groupId || '',
  }
}

function describeVoiceInputDevice(device: VoiceAudioInputDevice): Record<string, unknown> {
  return {
    label: device.label,
    deviceId: device.deviceId,
    groupId: device.groupId,
    isPreferredExternal: device.isPreferredExternal,
    isSelected: device.isSelected,
  }
}

function describeTrack(track: MediaStreamTrack): Record<string, unknown> {
  const details: Record<string, unknown> = {
    id: track.id,
    kind: track.kind,
    label: track.label,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
  }
  try {
    details.settings = track.getSettings?.()
  } catch (err) {
    details.settingsError = err instanceof Error ? err.message : String(err)
  }
  try {
    details.constraints = track.getConstraints?.()
  } catch (err) {
    details.constraintsError = err instanceof Error ? err.message : String(err)
  }
  try {
    details.capabilities = track.getCapabilities?.()
  } catch (err) {
    details.capabilitiesError = err instanceof Error ? err.message : String(err)
  }
  return details
}

export function loadVoiceAudioInputDeviceId(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function saveVoiceAudioInputDeviceId(deviceId: string): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = deviceId.trim()
    if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures; capture can still use browser defaults.
  }
}

export function clearVoiceAudioInputDeviceId(): void {
  saveVoiceAudioInputDeviceId('')
}

export function stopVoiceMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach(track => track.stop())
}

export function baseVoiceAudioConstraints(deviceId?: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }
  if (deviceId) constraints.deviceId = { exact: deviceId }
  return constraints
}

function mediaDevicesApi(explicit?: MediaDevices): MediaDevices | null {
  if (explicit) return explicit
  if (typeof navigator === 'undefined') return null
  return navigator.mediaDevices ?? null
}

async function unlockDeviceLabels(mediaDevices: MediaDevices, androidTv = false): Promise<void> {
  if (!mediaDevices.getUserMedia) return
  let stream: MediaStream | null = null
  try {
    logVoiceAudioDiagnostic(androidTv, 'permission-unlock:start', {
      constraints: { audio: baseVoiceAudioConstraints() },
    })
    stream = await mediaDevices.getUserMedia({ audio: baseVoiceAudioConstraints() })
    logVoiceAudioDiagnostic(androidTv, 'permission-unlock:success', {
      tracks: stream.getAudioTracks?.().map(track => describeTrack(track)) ?? [],
    })
  } catch (err) {
    logVoiceAudioDiagnostic(androidTv, 'permission-unlock:failed', {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
    })
    throw err
  } finally {
    stopVoiceMediaStream(stream)
  }
}

function mapAudioInputDevices(devices: MediaDeviceInfo[], selectedDeviceId = ''): VoiceAudioInputDevice[] {
  let audioInputIndex = 0
  return devices
    .filter(device => device.kind === 'audioinput')
    .map(device => {
      audioInputIndex += 1
      const label = device.label || (audioInputIndex === 1 ? '默认麦克风' : `麦克风 ${audioInputIndex}`)
      return {
        deviceId: device.deviceId,
        groupId: device.groupId,
        label,
        isPreferredExternal: PREFERRED_EXTERNAL_MIC_RE.test(label),
        isSelected: Boolean(selectedDeviceId && device.deviceId === selectedDeviceId),
      }
    })
}

export async function listVoiceAudioInputDevices(
  options: ListVoiceAudioInputOptions = {},
): Promise<VoiceAudioInputDevice[]> {
  const mediaDevices = mediaDevicesApi(options.mediaDevices)
  if (!mediaDevices?.enumerateDevices) return []
  const androidTv = isAndroidTvShell()

  const selectedDeviceId = loadVoiceAudioInputDeviceId()
  let devices = await mediaDevices.enumerateDevices()
  logVoiceAudioDiagnostic(androidTv, 'enumerate:initial', {
    ensurePermission: Boolean(options.ensurePermission),
    supportedConstraints: mediaDevices.getSupportedConstraints?.() ?? null,
    devices: devices.map(device => describeMediaDevice(device)),
  })
  let audioInputs = mapAudioInputDevices(devices, selectedDeviceId)
  const rawAudioInputs = devices.filter(device => device.kind === 'audioinput')
  const labelsAreHidden = rawAudioInputs.length > 0 && rawAudioInputs.every(device => !device.label)

  if (options.ensurePermission && labelsAreHidden) {
    await unlockDeviceLabels(mediaDevices, androidTv)
    devices = await mediaDevices.enumerateDevices()
    logVoiceAudioDiagnostic(androidTv, 'enumerate:after-permission', {
      devices: devices.map(device => describeMediaDevice(device)),
    })
    audioInputs = mapAudioInputDevices(devices, selectedDeviceId)
  }

  logVoiceAudioDiagnostic(androidTv, 'enumerate:audio-inputs', {
    audioInputs: audioInputs.map(device => describeVoiceInputDevice(device)),
  })
  return audioInputs
}

function resolveVoiceAudioInputSelection(
  devices: VoiceAudioInputDevice[],
  options: { androidTv?: boolean; persistedDeviceId?: string } = {},
): VoiceAudioInputSelection {
  if (devices.length === 0) return { deviceId: '', reason: 'none' }
  const persistedDeviceId = options.persistedDeviceId ?? loadVoiceAudioInputDeviceId()
  const persistedDevice = persistedDeviceId ? devices.find(device => device.deviceId === persistedDeviceId) : undefined
  if (persistedDevice) return { deviceId: persistedDevice.deviceId, reason: 'persisted', device: persistedDevice }
  if (devices.length === 1) return { deviceId: devices[0].deviceId, reason: 'single', device: devices[0] }
  if (options.androidTv) {
    const preferredDevice = devices.find(device => device.isPreferredExternal)
    if (preferredDevice) {
      return { deviceId: preferredDevice.deviceId, reason: 'android_tv_preferred', device: preferredDevice }
    }
  }
  return { deviceId: '', reason: 'browser_default' }
}

export function resolveVoiceAudioInputDeviceId(
  devices: VoiceAudioInputDevice[],
  options: { androidTv?: boolean; persistedDeviceId?: string } = {},
): string {
  return resolveVoiceAudioInputSelection(devices, options).deviceId
}

export async function createVoiceMediaStream(
  options: CreateVoiceMediaStreamOptions = {},
): Promise<MediaStream> {
  const mediaDevices = mediaDevicesApi(options.mediaDevices)
  if (!mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持实时语音采集')
  }

  const androidTv = isAndroidTvShell(options.bridgeWindow)
  const persistedDeviceId = loadVoiceAudioInputDeviceId()
  let selectedDeviceId = persistedDeviceId
  let selection: VoiceAudioInputSelection = {
    deviceId: persistedDeviceId,
    reason: persistedDeviceId ? 'persisted' : 'browser_default',
  }

  logVoiceAudioDiagnostic(androidTv, 'create:start', {
    androidTv,
    persistedDeviceId,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  })

  if (!selectedDeviceId || androidTv) {
    const devices = await listVoiceAudioInputDevices({
      ensurePermission: androidTv,
      mediaDevices,
    })
    selection = resolveVoiceAudioInputSelection(devices, { androidTv, persistedDeviceId })
    selectedDeviceId = selection.deviceId
    logVoiceAudioDiagnostic(androidTv, 'select', {
      selection: {
        deviceId: selectedDeviceId,
        reason: selection.reason,
        device: selection.device ? describeVoiceInputDevice(selection.device) : null,
      },
      persistedDeviceId,
    })
    if (persistedDeviceId && selectedDeviceId !== persistedDeviceId) clearVoiceAudioInputDeviceId()
  }

  if (selectedDeviceId) {
    const constraints = { audio: baseVoiceAudioConstraints(selectedDeviceId) }
    try {
      logVoiceAudioDiagnostic(androidTv, 'getUserMedia:selected:start', { constraints, reason: selection.reason })
      const stream = await mediaDevices.getUserMedia(constraints)
      logVoiceAudioDiagnostic(androidTv, 'getUserMedia:selected:success', {
        reason: selection.reason,
        tracks: stream.getAudioTracks?.().map(track => describeTrack(track)) ?? [],
      })
      return stream
    } catch (err) {
      logVoiceAudioDiagnostic(androidTv, 'getUserMedia:selected:failed', {
        reason: selection.reason,
        constraints,
        message: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : undefined,
      })
      if (persistedDeviceId && selectedDeviceId === persistedDeviceId) clearVoiceAudioInputDeviceId()
      if (androidTv && (selection.reason === 'android_tv_preferred' || selection.reason === 'persisted')) {
        throw err
      }
    }
  }

  const fallbackConstraints = { audio: baseVoiceAudioConstraints() }
  logVoiceAudioDiagnostic(androidTv, 'getUserMedia:default:start', { constraints: fallbackConstraints })
  const stream = await mediaDevices.getUserMedia(fallbackConstraints)
  logVoiceAudioDiagnostic(androidTv, 'getUserMedia:default:success', {
    tracks: stream.getAudioTracks?.().map(track => describeTrack(track)) ?? [],
  })
  return stream
}
