import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  baseVoiceAudioConstraints,
  createVoiceMediaStream,
  listVoiceAudioInputDevices,
  loadVoiceAudioInputDeviceId,
  resolveVoiceAudioInputDeviceId,
  saveVoiceAudioInputDeviceId,
} from './voice-audio-input'
import type { HomeRailBridgeWindow } from './voice-host-platform'

function audioInput(deviceId: string, label: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: `group-${deviceId}`,
    kind: 'audioinput',
    label,
    toJSON: () => ({}),
  } as MediaDeviceInfo
}

function fakeStream(): MediaStream {
  return {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream
}

function installLocalStorageMock(): void {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
    },
  })
}

describe('voice audio input selection', () => {
  beforeEach(() => {
    installLocalStorageMock()
    vi.restoreAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  it('persists and loads the selected input device id', () => {
    saveVoiceAudioInputDeviceId('usb-1')

    expect(loadVoiceAudioInputDeviceId()).toBe('usb-1')

    saveVoiceAudioInputDeviceId('')
    expect(loadVoiceAudioInputDeviceId()).toBe('')
  })

  it('resolves the persisted device before Android TV external mic preference', () => {
    const devices = [
      { ...audioInput('usb-1', 'Maono Wireless Mic RX'), isPreferredExternal: true, isSelected: false },
      { ...audioInput('internal-1', 'Built-in back mic'), isPreferredExternal: false, isSelected: true },
    ]

    expect(resolveVoiceAudioInputDeviceId(devices, { androidTv: true, persistedDeviceId: 'internal-1' })).toBe(
      'internal-1'
    )
  })

  it('uses the only available microphone directly', () => {
    const devices = [
      { ...audioInput('only-1', 'Default microphone'), isPreferredExternal: false, isSelected: false },
    ]

    expect(resolveVoiceAudioInputDeviceId(devices, { androidTv: false })).toBe('only-1')
  })

  it('prefers Maono or USB style labels on Android TV when no persisted device exists', () => {
    const devices = [
      { ...audioInput('internal-1', 'Built-in back mic'), isPreferredExternal: false, isSelected: false },
      { ...audioInput('usb-1', 'Maono Wireless Mic RX USB-Audio'), isPreferredExternal: true, isSelected: false },
    ]

    expect(resolveVoiceAudioInputDeviceId(devices, { androidTv: true })).toBe('usb-1')
  })

  it('unlocks labels on Android TV before opening the preferred microphone stream', async () => {
    const stream = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    const enumerateDevices = vi
      .fn()
      .mockResolvedValueOnce([audioInput('internal-1', ''), audioInput('usb-1', '')])
      .mockResolvedValueOnce([
        audioInput('internal-1', 'Built-in back mic'),
        audioInput('usb-1', 'Maono Wireless Mic RX USB-Audio'),
      ])
    const bridgeWindow: HomeRailBridgeWindow = {
      HomeRailBridge: {
        isAndroidTV: () => true,
      },
    }

    await createVoiceMediaStream({
      bridgeWindow,
      mediaDevices: { enumerateDevices, getUserMedia } as unknown as MediaDevices,
    })

    expect(enumerateDevices).toHaveBeenCalledTimes(2)
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(getUserMedia.mock.calls[0][0]).toEqual({ audio: baseVoiceAudioConstraints() })
    expect(getUserMedia.mock.calls[1][0]).toEqual({ audio: baseVoiceAudioConstraints('usb-1') })
  })

  it('marks the saved device when listing inputs for the settings page', async () => {
    saveVoiceAudioInputDeviceId('usb-1')
    const devices = await listVoiceAudioInputDevices({
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          audioInput('internal-1', 'Built-in back mic'),
          audioInput('usb-1', 'USB Headset microphone'),
        ]),
        getUserMedia: vi.fn(),
      } as unknown as MediaDevices,
    })

    expect(devices).toMatchObject([
      { deviceId: 'internal-1', isPreferredExternal: false, isSelected: false },
      { deviceId: 'usb-1', isPreferredExternal: true, isSelected: true },
    ])
  })

  it('does not silently fall back to the default mic when Android TV selected an external mic', async () => {
    const error = new DOMException('Requested device unavailable', 'NotReadableError')
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(fakeStream())
      .mockRejectedValueOnce(error)
    const enumerateDevices = vi
      .fn()
      .mockResolvedValueOnce([audioInput('internal-1', ''), audioInput('usb-1', '')])
      .mockResolvedValueOnce([
        audioInput('internal-1', 'Built-in back mic'),
        audioInput('usb-1', 'Maono Wireless Mic RX USB-Audio'),
      ])
    const bridgeWindow: HomeRailBridgeWindow = {
      HomeRailBridge: {
        getHost: () => 'android-tv',
      },
    }

    await expect(
      createVoiceMediaStream({
        bridgeWindow,
        mediaDevices: { enumerateDevices, getUserMedia } as unknown as MediaDevices,
      })
    ).rejects.toThrow('Requested device unavailable')

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(getUserMedia.mock.calls[1][0]).toEqual({ audio: baseVoiceAudioConstraints('usb-1') })
  })
})
