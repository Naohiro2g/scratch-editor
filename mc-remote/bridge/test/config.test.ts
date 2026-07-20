import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'

describe('loadConfig', () => {
  it('loads a beta channel profile whose sandbox allowlist matches the editor targets', () => {
    const config = loadConfig({
      BRIDGE_ORIGIN_ALLOWLIST: 'https://scratch-beta.mc-remote.com',
      BRIDGE_SANDBOX_ALLOWLIST: 'sb.mc-remote.com,sb-beta.mc-remote.com',
      BRIDGE_DEFAULT_SANDBOX: 'sb-beta.mc-remote.com',
    })

    expect(config.originAllowlist).toEqual(['https://scratch-beta.mc-remote.com'])
    expect(config.sandboxAllowlist).toEqual(['sb.mc-remote.com', 'sb-beta.mc-remote.com'])
    expect(config.defaultSandbox).toBe('sb-beta.mc-remote.com')
  })

  it('rejects a default sandbox outside the deployment allowlist', () => {
    expect(() =>
      loadConfig({
        BRIDGE_SANDBOX_ALLOWLIST: 'sb.mc-remote.com',
        BRIDGE_DEFAULT_SANDBOX: 'sb-beta.mc-remote.com',
      }),
    ).toThrow(/BRIDGE_DEFAULT_SANDBOX/)
  })
})
