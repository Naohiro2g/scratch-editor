import { describe, expect, it } from 'vitest'
import { parseSandboxQuery } from '../src/routing.ts'

describe('parseSandboxQuery', () => {
  it('reads the sandbox hint from the WSS request URL', () => {
    expect(parseSandboxQuery('/?sandbox=sb2.mc-remote.com')).toBe('sb2.mc-remote.com')
  })

  it('decodes URL-encoded sandbox names', () => {
    expect(parseSandboxQuery('/?sandbox=sb%2Ddev.mc%2Dremote.com')).toBe('sb-dev.mc-remote.com')
  })

  it('returns undefined when no sandbox is present', () => {
    expect(parseSandboxQuery('/')).toBeUndefined()
  })

  it('returns undefined for an empty sandbox query', () => {
    expect(parseSandboxQuery('/?sandbox=')).toBeUndefined()
  })

  it('returns undefined for an absent request URL', () => {
    expect(parseSandboxQuery(undefined)).toBeUndefined()
  })
})
