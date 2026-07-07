import { describe, expect, it } from 'vitest'
import {
  androidTvWireGuardAvailable,
  clearAndroidTvWireGuardConfig,
  connectAndroidTvWireGuard,
  disconnectAndroidTvWireGuard,
  getAndroidTvWireGuardConfig,
  getAndroidTvWireGuardStatus,
  parseWireGuardRawConfig,
  saveAndroidTvWireGuardConfig,
  type AndroidTvWireGuardWindow
} from './android-tv-wireguard'

function androidTvWindow(bridge: AndroidTvWireGuardWindow['HomeRailBridge']): AndroidTvWireGuardWindow {
  return { HomeRailBridge: bridge }
}

describe('Android TV WireGuard bridge', () => {
  it('is available only on Android TV with the local WireGuard bridge methods', () => {
    const bridge = {
      isAndroidTV: () => true,
      getWireGuardConfig: () => '{"ok":true}',
      saveWireGuardConfig: () => '{"ok":true}',
      clearWireGuardConfig: () => '{"ok":true}',
      getWireGuardStatus: () => '{"ok":true}',
      connectWireGuard: () => '{"ok":true}',
      disconnectWireGuard: () => '{"ok":true}'
    }

    expect(androidTvWireGuardAvailable(androidTvWindow(bridge))).toBe(true)
    expect(androidTvWireGuardAvailable(androidTvWindow({ ...bridge, isAndroidTV: () => false }))).toBe(false)
    expect(androidTvWireGuardAvailable(androidTvWindow({ isAndroidTV: () => true }))).toBe(false)
  })

  it('loads WireGuard config from the Android TV bridge', () => {
    const hostWindow = androidTvWindow({
      isAndroidTV: () => true,
      getWireGuardConfig: () =>
        JSON.stringify({
          ok: true,
          configured: true,
          endpoint: 'vpn.example.com:51820',
          config: {
            name: 'wg-tv',
            endpoint: 'vpn.example.com:51820',
            allowedIps: '0.0.0.0/0, ::/0',
            persistentKeepalive: '25'
          }
        }),
      saveWireGuardConfig: () => '{"ok":true}',
      clearWireGuardConfig: () => '{"ok":true}',
      getWireGuardStatus: () => '{"ok":true}',
      connectWireGuard: () => '{"ok":true}',
      disconnectWireGuard: () => '{"ok":true}'
    })

    const response = getAndroidTvWireGuardConfig(hostWindow)

    expect(response.configured).toBe(true)
    expect(response.config.name).toBe('wg-tv')
    expect(response.config.endpoint).toBe('vpn.example.com:51820')
    expect(response.config.allowedIps).toBe('0.0.0.0/0, ::/0')
  })

  it('saves through the injected bridge object and reports failures', () => {
    const calls: string[] = []
    const hostWindow = androidTvWindow({
      isAndroidTV: () => true,
      getWireGuardConfig: () => '{"ok":true}',
      saveWireGuardConfig(json: string) {
        calls.push(json)
        return JSON.stringify({
          ok: true,
          configured: true,
          endpoint: '10.0.0.1:51820',
          config: JSON.parse(json).config
        })
      },
      clearWireGuardConfig: () => '{"ok":true}',
      getWireGuardStatus: () => '{"ok":true}',
      connectWireGuard: () => '{"ok":true}',
      disconnectWireGuard: () => '{"ok":true}'
    })

    const response = saveAndroidTvWireGuardConfig(
      {
        name: 'wg0',
        interfacePrivateKey: 'private',
        interfaceAddress: '10.9.0.2/32',
        dns: '1.1.1.1',
        peerPublicKey: 'public',
        peerPreSharedKey: 'psk',
        endpoint: '10.0.0.1:51820',
        allowedIps: '0.0.0.0/0',
        persistentKeepalive: '25',
        rawConfig: ''
      },
      hostWindow
    )

    expect(response.configured).toBe(true)
    expect(JSON.parse(calls[0] || '{}').config.endpoint).toBe('10.0.0.1:51820')

    const failingWindow = androidTvWindow({
      isAndroidTV: () => true,
      getWireGuardConfig: () => '{"ok":true}',
      saveWireGuardConfig: () =>
        JSON.stringify({ ok: false, code: 'invalid_config', message: 'endpoint is required' }),
      clearWireGuardConfig: () => '{"ok":true}',
      getWireGuardStatus: () => '{"ok":true}',
      connectWireGuard: () => '{"ok":true}',
      disconnectWireGuard: () => '{"ok":true}'
    })
    expect(() => saveAndroidTvWireGuardConfig(response.config, failingWindow)).toThrow(
      'endpoint is required'
    )
  })

  it('clears local config and reads placeholder status', () => {
    const hostWindow = androidTvWindow({
      isAndroidTV: () => true,
      getWireGuardConfig: () => '{"ok":true}',
      saveWireGuardConfig: () => '{"ok":true}',
      clearWireGuardConfig: () => JSON.stringify({ ok: true, configured: false }),
      getWireGuardStatus: () =>
        JSON.stringify({
          event: 'connected',
          connected: true,
          configured: true,
          vpnAuthorized: true,
          endpoint: 'vpn.example.com:51820',
          profileName: 'wg-tv',
          tunnelName: 'wg-tv',
          state: 'up',
          runningTunnels: ['wg-tv'],
          backendVersion: 'test-backend',
          rxBytes: 22,
          txBytes: 44,
          latestHandshakeEpochMillis: 123456789,
          lastError: ''
        }),
      connectWireGuard: () => '{"ok":true}',
      disconnectWireGuard: () => '{"ok":true}'
    })

    expect(clearAndroidTvWireGuardConfig(hostWindow).configured).toBe(false)
    const status = getAndroidTvWireGuardStatus(hostWindow)
    expect(status.connected).toBe(true)
    expect(status.runningTunnels).toEqual(['wg-tv'])
    expect(status.txBytes).toBe(44)
    expect(status.latestHandshakeEpochMillis).toBe(123456789)
  })

  it('connects and disconnects through the Android TV bridge', () => {
    const calls: string[] = []
    const hostWindow = androidTvWindow({
      isAndroidTV: () => true,
      getWireGuardConfig: () => '{"ok":true}',
      saveWireGuardConfig: () => '{"ok":true}',
      clearWireGuardConfig: () => '{"ok":true}',
      getWireGuardStatus: () => '{"ok":true}',
      connectWireGuard(profileName: string) {
        calls.push(profileName)
        return JSON.stringify({
          connected: true,
          configured: true,
          endpoint: 'vpn.example.com:51820',
          profileName,
          state: 'up',
          runningTunnels: [profileName]
        })
      },
      disconnectWireGuard: () =>
        JSON.stringify({ connected: false, configured: true, state: 'down', runningTunnels: [] })
    })

    expect(connectAndroidTvWireGuard('wg-tv', hostWindow).connected).toBe(true)
    expect(calls).toEqual(['wg-tv'])
    expect(disconnectAndroidTvWireGuard(hostWindow).connected).toBe(false)
  })

  it('parses pasted wg0.conf into editable fields', () => {
    const parsed = parseWireGuardRawConfig(`
[Interface]
PrivateKey = private-key
Address = 10.0.0.2/32
DNS = 223.5.5.5

[Peer]
PublicKey = public-key
PresharedKey = psk
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 15
`)

    expect(parsed.interfacePrivateKey).toBe('private-key')
    expect(parsed.interfaceAddress).toBe('10.0.0.2/32')
    expect(parsed.peerPublicKey).toBe('public-key')
    expect(parsed.endpoint).toBe('vpn.example.com:51820')
    expect(parsed.allowedIps).toBe('0.0.0.0/0, ::/0')
    expect(parsed.persistentKeepalive).toBe('15')
  })
})
