import { describe, expect, it } from 'vitest'
import { createLineDecoder, frameLine } from '../src/framing.ts'

describe('frameLine', () => {
  it('appends a single newline and leaves the payload untouched', () => {
    expect(frameLine('{"jsonrpc":"2.0","method":"chat.post","params":["hi"]}')).toBe(
      '{"jsonrpc":"2.0","method":"chat.post","params":["hi"]}\n',
    )
  })
})

describe('createLineDecoder', () => {
  it('splits a chunk into complete newline-delimited lines', () => {
    const decode = createLineDecoder()
    expect(decode(Buffer.from('a\nb\n'))).toEqual(['a', 'b'])
  })

  it('holds back a trailing partial line until the rest arrives', () => {
    const decode = createLineDecoder()
    expect(decode(Buffer.from('{"id":1'))).toEqual([])
    expect(decode(Buffer.from(',"result":"stone"}\n'))).toEqual(['{"id":1,"result":"stone"}'])
  })

  it('reassembles a line split across several chunks', () => {
    const decode = createLineDecoder()
    expect(decode(Buffer.from('he'))).toEqual([])
    expect(decode(Buffer.from('ll'))).toEqual([])
    expect(decode(Buffer.from('o\n'))).toEqual(['hello'])
  })

  it('drops empty lines', () => {
    const decode = createLineDecoder()
    expect(decode(Buffer.from('a\n\nb\n'))).toEqual(['a', 'b'])
  })
})
