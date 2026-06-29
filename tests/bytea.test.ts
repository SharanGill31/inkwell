import { describe, it, expect } from 'vitest'
import { byteaToDriver, byteaFromDriver } from '@/server/db/schema'

// Simulate what postgres.js actually sends to fromDriver: the '\x<hex>' string
// format that the text protocol returns for bytea columns.
function postgresHex(buf: Buffer): string {
  return '\\x' + buf.toString('hex')
}

describe('bytea toDriver / fromDriver round-trip', () => {
  // ── Buffer path (toDriver → Buffer → fromDriver) ──────────────────────────
  // These four cases guard that any Uint8Array survives the Drizzle toDriver /
  // fromDriver conversion without losing or corrupting bytes.

  it('round-trips an empty buffer', () => {
    const input = new Uint8Array(0)
    expect(byteaFromDriver(byteaToDriver(input))).toEqual(input)
  })

  it('round-trips a small buffer', () => {
    const input = new Uint8Array([1, 2, 3])
    expect(byteaFromDriver(byteaToDriver(input))).toEqual(input)
  })

  it('round-trips all 256 byte values', () => {
    const input = new Uint8Array(Array.from({ length: 256 }, (_, i) => i))
    expect(byteaFromDriver(byteaToDriver(input))).toEqual(input)
  })

  it('round-trips a 1 KB deterministic buffer', () => {
    const input = new Uint8Array(Array.from({ length: 1024 }, (_, i) => i % 256))
    expect(byteaFromDriver(byteaToDriver(input))).toEqual(input)
  })

  // ── String path (postgres.js hex format) ─────────────────────────────────
  // This is the exact shape fromDriver receives at runtime: postgres.js returns
  // bytea columns as '\x<hex>' strings via the text protocol, not as Buffers.
  // This test guards the \x hex decode bug found in Sessions 5/6.

  it('decodes a postgres.js \\x hex string back to the original bytes', () => {
    const input = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xff])
    const hexStr = postgresHex(byteaToDriver(input)) // e.g. '\x00017f80ff'
    expect(byteaFromDriver(hexStr as unknown as Buffer)).toEqual(input)
  })
})
