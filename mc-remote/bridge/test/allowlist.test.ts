import { describe, expect, it } from 'vitest'
import { isOriginAllowed, resolveSandbox } from '../src/allowlist.ts'
import { defaultConfig } from '../src/config.ts'

describe('isOriginAllowed', () => {
  it('admits a listed origin', () => {
    expect(isOriginAllowed('https://scratch.mc-remote.com', defaultConfig.originAllowlist)).toBe(true)
  })

  it('rejects an unlisted origin', () => {
    expect(isOriginAllowed('https://evil.example.com', defaultConfig.originAllowlist)).toBe(false)
  })

  it('rejects a missing origin', () => {
    expect(isOriginAllowed(undefined, defaultConfig.originAllowlist)).toBe(false)
  })
})

describe('resolveSandbox', () => {
  it('falls back to the default sandbox when no hint is given', () => {
    expect(resolveSandbox(undefined, defaultConfig)).toEqual({
      host: 'sb.mc-remote.com',
      port: 25575,
    })
  })

  it('resolves an allowlisted sandbox to its TCP target', () => {
    const config = { ...defaultConfig, sandboxAllowlist: ['sb.mc-remote.com', 'sb2.mc-remote.com'] }
    expect(resolveSandbox('sb2.mc-remote.com', config)).toEqual({
      host: 'sb2.mc-remote.com',
      port: 25575,
    })
  })

  it('refuses a sandbox outside the allowlist', () => {
    expect(resolveSandbox('attacker.example.com', defaultConfig)).toBeNull()
  })
})
