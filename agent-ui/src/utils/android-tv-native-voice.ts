import { isAndroidTvShell, type HomeRailBridgeWindow } from './voice-host-platform'

const EVENT_CHUNK = 'homerail:native-audio-chunk'
const EVENT_STATUS = 'homerail:native-audio-status'
const EVENT_TTS_STATUS = 'homerail:native-tts-status'

export interface NativeVoiceBridge {
  isNativeVoiceCaptureAvailable?: () => unknown
  startPreferredMicCapture?: (sampleRate: number) => unknown
  stopPreferredMicCapture?: () => unknown
  getPreferredMicCaptureStatus?: () => unknown
  isNativeTtsPlaybackAvailable?: () => unknown
  playTtsAudio?: (base64Audio: string, mimeType: string) => unknown
  stopTtsAudio?: () => unknown
  getTtsPlaybackStatus?: () => unknown
}

export interface NativeVoiceWindow extends HomeRailBridgeWindow {
  HomeRailBridge?: HomeRailBridgeWindow['HomeRailBridge'] & NativeVoiceBridge
}

export interface NativeVoiceChunk {
  sequence: number
  sampleRate: number
  channelCount: number
  encoding: 'pcm16le'
  pcmBase64: string
}

export interface NativeVoiceStatus {
  ok?: boolean
  running?: boolean
  event?: string
  message?: string
  selectedDeviceName?: string
  selectedDeviceType?: number
  selectedDeviceAddress?: string
  preferredDeviceApplied?: boolean
  sampleRate?: number
}

export interface NativeVoiceCaptureSession {
  stop: () => void
}

export interface NativeTtsStatus {
  ok?: boolean
  playing?: boolean
  event?: string
  message?: string
  bytes?: number
  mimeType?: string
  selectedDeviceName?: string
  selectedDeviceType?: number
  selectedDeviceAddress?: string
  preferredDeviceApplied?: boolean
}

export interface StartNativeVoiceCaptureOptions {
  sampleRate?: number
  onSamples: (samples: Float32Array, sampleRate: number, detail: NativeVoiceChunk) => void
  onStatus?: (status: NativeVoiceStatus) => void
  onError?: (error: Error) => void
  hostWindow?: NativeVoiceWindow | null
}

function currentWindow(): NativeVoiceWindow | null {
  if (typeof window === 'undefined') return null
  return window as Window & NativeVoiceWindow
}

function bridge(hostWindow: NativeVoiceWindow | null = currentWindow()): NativeVoiceBridge | null {
  return hostWindow?.HomeRailBridge ?? null
}

export function nativeVoiceCaptureAvailable(hostWindow: NativeVoiceWindow | null = currentWindow()): boolean {
  if (!isAndroidTvShell(hostWindow)) return false
  const hostBridge = bridge(hostWindow)
  if (!hostBridge?.startPreferredMicCapture || !hostBridge.stopPreferredMicCapture) return false
  try {
    return hostBridge.isNativeVoiceCaptureAvailable?.() === true
  } catch {
    return false
  }
}

export function nativeTtsPlaybackAvailable(hostWindow: NativeVoiceWindow | null = currentWindow()): boolean {
  if (!isAndroidTvShell(hostWindow)) return false
  const hostBridge = bridge(hostWindow)
  if (!hostBridge?.playTtsAudio || !hostBridge.stopTtsAudio) return false
  try {
    return hostBridge.isNativeTtsPlaybackAvailable?.() === true
  } catch {
    return false
  }
}

export function parseNativeVoiceResponse(value: unknown): NativeVoiceStatus {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as NativeVoiceStatus
    } catch {
      return { ok: false, message: value }
    }
  }
  if (value && typeof value === 'object') return value as NativeVoiceStatus
  return { ok: false, message: 'Native voice bridge returned an empty response' }
}

export function parseNativeTtsResponse(value: unknown): NativeTtsStatus {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as NativeTtsStatus
    } catch {
      return { ok: false, message: value }
    }
  }
  if (value && typeof value === 'object') return value as NativeTtsStatus
  return { ok: false, message: 'Native TTS bridge returned an empty response' }
}

export function decodePcm16Base64(base64: string): Float32Array {
  const binary = atob(base64)
  const samples = new Float32Array(Math.floor(binary.length / 2))
  for (let i = 0; i < samples.length; i += 1) {
    const lo = binary.charCodeAt(i * 2)
    const hi = binary.charCodeAt(i * 2 + 1)
    const value = (hi << 8) | lo
    const signed = value >= 0x8000 ? value - 0x10000 : value
    samples[i] = signed < 0 ? signed / 0x8000 : signed / 0x7fff
  }
  return samples
}

function eventDetail<T>(event: Event): T | null {
  return event instanceof CustomEvent && event.detail ? (event.detail as T) : null
}

function nativeTtsTrace(
  hostWindow: NativeVoiceWindow | null,
  code: string,
  message: string,
): void {
  if (!isAndroidTvShell(hostWindow)) return
  console.info('[HomeRailNativeTtsBridge]', code, message)
}

export function startNativeVoiceCapture(options: StartNativeVoiceCaptureOptions): NativeVoiceCaptureSession {
  const hostWindow = options.hostWindow ?? currentWindow()
  const hostBridge = bridge(hostWindow)
  if (!hostWindow || !hostBridge?.startPreferredMicCapture || !hostBridge.stopPreferredMicCapture) {
    throw new Error('Android TV native voice bridge is unavailable')
  }
  const eventTarget = hostWindow as unknown as Window

  const onChunk = (event: Event): void => {
    const detail = eventDetail<NativeVoiceChunk>(event)
    if (!detail?.pcmBase64 || detail.encoding !== 'pcm16le') return
    try {
      options.onSamples(decodePcm16Base64(detail.pcmBase64), detail.sampleRate, detail)
    } catch (err) {
      options.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }
  const onStatus = (event: Event): void => {
    const detail = eventDetail<NativeVoiceStatus>(event)
    if (detail) options.onStatus?.(detail)
    if (detail?.ok === false && detail.message) options.onError?.(new Error(detail.message))
  }

  eventTarget.addEventListener(EVENT_CHUNK, onChunk)
  eventTarget.addEventListener(EVENT_STATUS, onStatus)
  const response = parseNativeVoiceResponse(hostBridge.startPreferredMicCapture(options.sampleRate ?? 16000))
  options.onStatus?.(response)
  if (response.ok === false) {
    eventTarget.removeEventListener(EVENT_CHUNK, onChunk)
    eventTarget.removeEventListener(EVENT_STATUS, onStatus)
    throw new Error(response.message || 'Android TV native voice capture failed to start')
  }

  return {
    stop: () => {
      eventTarget.removeEventListener(EVENT_CHUNK, onChunk)
      eventTarget.removeEventListener(EVENT_STATUS, onStatus)
      try {
        hostBridge.stopPreferredMicCapture?.()
      } catch {
        // Ignore stop failures; capture teardown should be best effort.
      }
    },
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
  }
  if (typeof FileReader === 'undefined') {
    throw new Error('Blob arrayBuffer and FileReader are unavailable')
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('FileReader returned a non-data URL')
  return dataUrl.slice(comma + 1)
}

export async function playNativeTtsBlob(
  blob: Blob,
  hostWindow: NativeVoiceWindow | null = currentWindow(),
): Promise<void> {
  const hostBridge = bridge(hostWindow)
  if (!hostWindow || !hostBridge?.playTtsAudio || !hostBridge.stopTtsAudio) {
    throw new Error('Android TV native TTS bridge is unavailable')
  }
  const eventTarget = hostWindow as unknown as Window
  nativeTtsTrace(hostWindow, 'before_raf', `bytes=${blob.size} type=${blob.type || 'audio/wav'}`)
  await new Promise<void>(resolve => eventTarget.requestAnimationFrame(() => resolve()))
  nativeTtsTrace(hostWindow, 'after_raf', `bytes=${blob.size}`)
  let base64Audio = ''
  try {
    nativeTtsTrace(hostWindow, 'before_blob_to_base64', `bytes=${blob.size}`)
    base64Audio = await blobToBase64(blob)
    nativeTtsTrace(hostWindow, 'after_blob_to_base64', `base64Length=${base64Audio.length}`)
  } catch (error) {
    nativeTtsTrace(
      hostWindow,
      'blob_to_base64_failed',
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let started = false
    const startTimer = eventTarget.setTimeout(() => {
      if (started || settled) return
      const status = hostBridge.getTtsPlaybackStatus
        ? parseNativeTtsResponse(hostBridge.getTtsPlaybackStatus())
        : null
      nativeTtsTrace(
        hostWindow,
        'start_timeout',
        status ? JSON.stringify(status) : 'no getTtsPlaybackStatus',
      )
      finish(
        new Error(
          status?.message ||
            `Android TV native TTS playback did not start${status?.event ? ` (${status.event})` : ''}`
        )
      )
    }, 5000)
    const cleanup = () => {
      eventTarget.clearTimeout(startTimer)
      eventTarget.removeEventListener(EVENT_TTS_STATUS, onStatus)
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) {
        nativeTtsTrace(hostWindow, 'finish_error', error.message)
        reject(error)
      } else {
        nativeTtsTrace(hostWindow, 'finish_ok', started ? 'started=true' : 'started=false')
        resolve()
      }
    }
    const onStatus = (event: Event): void => {
      const detail = eventDetail<NativeTtsStatus>(event)
      if (!detail) return
      nativeTtsTrace(hostWindow, 'status_event', JSON.stringify(detail))
      if (detail.ok === false) finish(new Error(detail.message || 'Android TV native TTS playback failed'))
      else if (detail.event === 'started') started = true
      else if (detail.event === 'ended' || detail.event === 'stopped') finish()
    }
    eventTarget.addEventListener(EVENT_TTS_STATUS, onStatus)
    try {
      nativeTtsTrace(hostWindow, 'before_playTtsAudio', `base64Length=${base64Audio.length}`)
      const rawResponse = hostBridge.playTtsAudio?.(base64Audio, blob.type || 'audio/wav')
      if (rawResponse === undefined) {
        finish(new Error('Android TV native TTS bridge is unavailable'))
        return
      }
      nativeTtsTrace(
        hostWindow,
        'playTtsAudio_raw_response',
        typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse),
      )
      const response = parseNativeTtsResponse(rawResponse)
      nativeTtsTrace(hostWindow, 'playTtsAudio_response', JSON.stringify(response))
      if (response.ok === false) {
        finish(new Error(response.message || 'Android TV native TTS playback failed to start'))
      }
    } catch (error) {
      nativeTtsTrace(
        hostWindow,
        'playTtsAudio_throw',
        error instanceof Error ? error.message : String(error),
      )
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function stopNativeTtsPlayback(hostWindow: NativeVoiceWindow | null = currentWindow()): void {
  try {
    bridge(hostWindow)?.stopTtsAudio?.()
  } catch {
    // Stop is best-effort; callers also cancel local queues.
  }
}
