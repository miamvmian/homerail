import { describe, expect, it } from 'vitest'
import {
  bridgeManagerUrl,
  defaultApiBaseUrl,
  defaultWebSocketUrl,
  type RuntimeConfigWindow
} from './runtime-url'

function testWindow(
  origin: string,
  extra: Omit<RuntimeConfigWindow, 'location'> = {},
): RuntimeConfigWindow {
  const url = new URL(origin)
  return {
    ...extra,
    location: {
      origin: url.origin,
      protocol: url.protocol,
      hostname: url.hostname,
    } as Location,
  }
}

describe('runtime URL resolution', () => {
  it('uses the Android TV bridge manager URL before runtime config, env, and appassets origin', () => {
    const hostWindow = testWindow('https://appassets.androidplatform.net/assets/web/index.html', {
      __HOMERAIL_RUNTIME_CONFIG__: { apiBaseUrl: 'https://wrong-runtime.example.test' },
      HomeRailBridge: {
        getManagerUrl: () => 'http://203.0.113.112:19191/'
      }
    })

    expect(bridgeManagerUrl(hostWindow)).toBe('http://203.0.113.112:19191')
    expect(
      defaultApiBaseUrl(hostWindow, {
        apiBaseUrl: 'https://wrong-env.example.test',
        managerPort: '19191',
        dev: false
      })
    ).toBe('http://203.0.113.112:19191')
  })

  it('derives WebSocket URL from the bridge manager URL unless runtime wsUrl is explicit', () => {
    const bridgeWindow = testWindow('https://appassets.androidplatform.net/assets/web/index.html', {
      HomeRailBridge: {
        getManagerUrl: () => 'http://203.0.113.112:19191'
      }
    })
    const runtimeWsWindow = testWindow('https://appassets.androidplatform.net/assets/web/index.html', {
      __HOMERAIL_RUNTIME_CONFIG__: { wsUrl: 'wss://runtime.example.test/custom' },
      HomeRailBridge: {
        getManagerUrl: () => 'http://203.0.113.112:19191'
      }
    })

    expect(defaultWebSocketUrl(bridgeWindow, { managerPort: '19191', dev: false })).toBe(
      'ws://203.0.113.112:19191/ws'
    )
    expect(defaultWebSocketUrl(runtimeWsWindow, { managerPort: '19191', dev: false })).toBe(
      'wss://runtime.example.test/custom/ws'
    )
  })

  it('keeps browser fallback behavior when no bridge is present', () => {
    const browserWindow = testWindow('https://203.0.113.112:19192/')
    const localWindow = testWindow('http://localhost:5173/')

    expect(defaultApiBaseUrl(browserWindow, { managerPort: '19191', dev: false })).toBe(
      'https://203.0.113.112:19191'
    )
    expect(defaultWebSocketUrl(browserWindow, { managerPort: '19191', dev: false })).toBe(
      'ws://localhost:19191/ws'
    )
    expect(defaultApiBaseUrl(localWindow, { managerPort: '19191', dev: false })).toBe(
      'http://localhost:19191'
    )
  })
})
