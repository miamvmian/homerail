import { describe, expect, it } from 'vitest'
import {
  isAndroidTvCompactViewport,
  isAndroidTvShell,
  isMobileVoiceDevice,
  isMobileVoiceUserAgent,
  type HomeRailBridgeWindow
} from './voice-host-platform'

describe('voice host platform detection', () => {
  it('detects the Android TV shell via the bridge host name', () => {
    const bridgeWindow: HomeRailBridgeWindow = {
      HomeRailBridge: {
        getHost: () => 'android-tv'
      }
    }

    expect(isAndroidTvShell(bridgeWindow)).toBe(true)
  })

  it('detects the Android TV shell via the bridge boolean helper', () => {
    const bridgeWindow: HomeRailBridgeWindow = {
      HomeRailBridge: {
        isAndroidTV: () => true
      }
    }

    expect(isAndroidTvShell(bridgeWindow)).toBe(true)
  })

  it('excludes Android TV from the mobile voice device gate even with an Android user agent', () => {
    const bridgeWindow: HomeRailBridgeWindow = {
      HomeRailBridge: {
        getHost: () => 'android-tv',
        isAndroidTV: () => true
      }
    }

    expect(
      isMobileVoiceDevice({
        userAgent: 'Mozilla/5.0 (Linux; Android 11; SEI Robotics Box R 4K Plus) AppleWebKit/537.36',
        maxTouchPoints: 0,
        viewportWidth: 1920,
        viewportHeight: 1080,
        bridgeWindow
      })
    ).toBe(false)
  })

  it('keeps normal Android phones on the mobile fullscreen path', () => {
    expect(
      isMobileVoiceDevice({
        userAgent:
          'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36',
        maxTouchPoints: 5,
        viewportWidth: 412,
        viewportHeight: 915,
        bridgeWindow: {}
      })
    ).toBe(true)
    expect(isMobileVoiceUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel) Mobile')).toBe(true)
  })

  it('keeps the small touch-screen fallback for non-TV hosts', () => {
    expect(
      isMobileVoiceDevice({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        maxTouchPoints: 1,
        viewportWidth: 600,
        viewportHeight: 1024,
        bridgeWindow: {}
      })
    ).toBe(true)
  })

  it('detects Android TV 1080p WebView compact CSS viewport', () => {
    expect(
      isAndroidTvCompactViewport({
        androidTv: true,
        viewportWidth: 960,
        viewportHeight: 540
      })
    ).toBe(true)
  })

  it('does not treat large Android TV CSS viewports as compact', () => {
    expect(
      isAndroidTvCompactViewport({
        androidTv: true,
        viewportWidth: 1920,
        viewportHeight: 1080
      })
    ).toBe(false)
  })

  it('keeps non-TV 960px browser viewports out of compact TV mode', () => {
    expect(
      isAndroidTvCompactViewport({
        androidTv: false,
        viewportWidth: 960,
        viewportHeight: 540
      })
    ).toBe(false)
  })
})
