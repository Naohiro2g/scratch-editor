import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

interface DisplayAliasFixture {
  version: number
  words: string[]
  separator: string
  suffix_digits: number
  example: string
}

const fixturePath = fileURLToPath(new URL('./fixtures/display-alias-v1.json', import.meta.url))
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as DisplayAliasFixture

describe('display alias vocabulary v1', () => {
  test('fixes sixteen distinct uppercase words and the shared display shape', () => {
    expect(fixture.version).toBe(1)
    expect(fixture.words).toHaveLength(16)
    expect(new Set(fixture.words)).toHaveLength(16)
    expect(fixture.words.every((word) => /^[A-Z]+$/.test(word))).toBe(true)
    expect(fixture.separator).toBe('-')
    expect(fixture.suffix_digits).toBe(6)

    const [first, second, suffix, ...rest] = fixture.example.split(fixture.separator)
    expect(rest).toHaveLength(0)
    expect(fixture.words).toContain(first)
    expect(fixture.words).toContain(second)
    expect(suffix).toMatch(/^\d{6}$/)
  })
})
