import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decodePcm16Base64,
  nativeVoiceCaptureAvailable,
  nativeTtsPlaybackAvailable,
  parseNativeVoiceResponse,
  playNativeTtsBlob,
  startNativeVoiceCapture,
  stopNativeTtsPlayback,
  type NativeVoiceWindow,
} from './android-tv-native-voice'

function base64FromBytes(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

describe('Android TV native voice bridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('detects bridge availability only on Android TV with native capture methods', () => {
    const hostWindow: NativeVoiceWindow = {
      HomeRailBridge: {
        isAndroidTV: () => true,
        isNativeVoiceCaptureAvailable: () => true,
        startPreferredMicCapture: () => '{"ok":true}',
        stopPreferredMicCapture: () => '{"ok":true}',
      },
    }

    expect(nativeVoiceCaptureAvailable(hostWindow)).toBe(true)
    expect(nativeVoiceCaptureAvailable({ HomeRailBridge: { isAndroidTV: () => false } })).toBe(false)
  })

  it('parses bridge JSON responses defensively', () => {
    expect(parseNativeVoiceResponse('{"ok":true,"running":true}')).toMatchObject({
      ok: true,
      running: true,
    })
    expect(parseNativeVoiceResponse('not-json')).toMatchObject({ ok: false, message: 'not-json' })
  })

  it('decodes little-endian PCM16 chunks to Float32 samples', () => {
    const samples = decodePcm16Base64(base64FromBytes([
      0x00, 0x00,
      0xff, 0x7f,
      0x00, 0x80,
    ]))

    expect(Array.from(samples)).toEqual([0, 1, -1])
  })

  it('starts native capture and forwards chunk events', () => {
    const stopPreferredMicCapture = vi.fn(() => '{"ok":true}')
    const hostWindow = window as Window & NativeVoiceWindow
    Object.defineProperty(hostWindow, 'HomeRailBridge', {
      configurable: true,
      value: {
        isAndroidTV: () => true,
        isNativeVoiceCaptureAvailable: () => true,
        startPreferredMicCapture: vi.fn(() => '{"ok":true,"running":true}'),
        stopPreferredMicCapture,
      },
    })
    const onSamples = vi.fn()

    const session = startNativeVoiceCapture({ hostWindow, onSamples })
    window.dispatchEvent(new CustomEvent('homerail:native-audio-chunk', {
      detail: {
        sequence: 1,
        sampleRate: 16000,
        channelCount: 1,
        encoding: 'pcm16le',
        pcmBase64: base64FromBytes([0x00, 0x00, 0xff, 0x7f]),
      },
    }))
    session.stop()

    expect(onSamples).toHaveBeenCalledTimes(1)
    expect(Array.from(onSamples.mock.calls[0][0])).toEqual([0, 1])
    expect(stopPreferredMicCapture).toHaveBeenCalledTimes(1)
  })

  it('plays TTS through the native bridge and resolves on ended status', async () => {
    const stopTtsAudio = vi.fn(() => '{"ok":true}')
    const playTtsAudio = vi.fn(() => {
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent('homerail:native-tts-status', {
          detail: { ok: true, event: 'ended', playing: false },
        }))
      })
      return '{"ok":true,"playing":true}'
    })
    const hostWindow = window as Window & NativeVoiceWindow
    Object.defineProperty(hostWindow, 'HomeRailBridge', {
      configurable: true,
      value: {
        isAndroidTV: () => true,
        isNativeTtsPlaybackAvailable: () => true,
        playTtsAudio,
        stopTtsAudio,
      },
    })

    expect(nativeTtsPlaybackAvailable(hostWindow)).toBe(true)
    await playNativeTtsBlob(new Blob([new Uint8Array([0, 1, 2])], { type: 'audio/wav' }), hostWindow)
    stopNativeTtsPlayback(hostWindow)

    expect(playTtsAudio).toHaveBeenCalledWith('AAEC', 'audio/wav')
    expect(stopTtsAudio).toHaveBeenCalledTimes(1)
  })

  it('uses Blob.arrayBuffer for native TTS even when FileReader is unavailable', async () => {
    const originalFileReader = globalThis.FileReader
    vi.stubGlobal('FileReader', undefined)
    const playTtsAudio = vi.fn(() => {
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent('homerail:native-tts-status', {
          detail: { ok: true, event: 'ended', playing: false },
        }))
      })
      return '{"ok":true,"playing":true}'
    })
    const hostWindow = window as Window & NativeVoiceWindow
    Object.defineProperty(hostWindow, 'HomeRailBridge', {
      configurable: true,
      value: {
        isAndroidTV: () => true,
        isNativeTtsPlaybackAvailable: () => true,
        playTtsAudio,
        stopTtsAudio: vi.fn(),
      },
    })

    try {
      const blobLike = {
        type: 'audio/wav',
        size: 3,
        arrayBuffer: async () => new Uint8Array([3, 4, 5]).buffer,
      } as Blob
      await playNativeTtsBlob(blobLike, hostWindow)
    } finally {
      vi.stubGlobal('FileReader', originalFileReader)
    }

    expect(playTtsAudio).toHaveBeenCalledWith('AwQF', 'audio/wav')
  })

  it('invokes native TTS methods on the injected bridge object', async () => {
    const bridge = {
      isAndroidTV: () => true,
      isNativeTtsPlaybackAvailable: () => true,
      playTtsAudio(this: unknown) {
        expect(this).toBe(bridge)
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('homerail:native-tts-status', {
            detail: { ok: true, event: 'ended', playing: false },
          }))
        })
        return '{"ok":true,"playing":true}'
      },
      stopTtsAudio: vi.fn(),
      getTtsPlaybackStatus(this: unknown) {
        expect(this).toBe(bridge)
        return '{"ok":true,"event":"started","playing":true}'
      },
    }
    const playTtsAudio = vi.spyOn(bridge, 'playTtsAudio')
    const hostWindow = window as Window & NativeVoiceWindow
    Object.defineProperty(hostWindow, 'HomeRailBridge', {
      configurable: true,
      value: bridge,
    })

    await playNativeTtsBlob(new Blob([new Uint8Array([6, 7, 8])], { type: 'audio/wav' }), hostWindow)

    expect(playTtsAudio).toHaveBeenCalledTimes(1)
  })
})
