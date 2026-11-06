import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  D2TV_MAGIC,
  parseVectorHeader,
  writeVectorHeader,
} from '../../tools/oracle/vectors/vector-format.ts'
import {
  generatePrngVectors,
  verifyPrngVectors,
  PRNG_RECORD_SIZE,
} from '../../tools/oracle/vectors/prng-vector.ts'
import {
  EVTWHEEL_RECORD_SIZE,
  generateEventWheelVectors,
  verifyEventWheelVectors,
} from '../../tools/oracle/vectors/eventwheel-vector.ts'

describe('Vector Header Format (D2TV)', () => {
  it('encodes and decodes vector header identically', () => {
    const headerBytes = writeVectorHeader('PRNG', 16, 100, 123456789n, 1)
    expect(headerBytes.length).toBe(32)

    const payload = new Uint8Array(16 * 100)
    const combined = new Uint8Array(32 + payload.length)
    combined.set(headerBytes, 0)
    combined.set(payload, 32)

    const parsed = parseVectorHeader(combined)
    expect(parsed.magic).toBe(D2TV_MAGIC)
    expect(parsed.version).toBe(1)
    expect(parsed.flags).toBe(0)
    expect(parsed.kind).toBe('PRNG')
    expect(parsed.recordSize).toBe(16)
    expect(parsed.recordCount).toBe(100)
    expect(parsed.seed).toBe(123456789n)
  })

  it('rejects invalid magic', () => {
    const raw = new Uint8Array(32)
    expect(() => parseVectorHeader(raw)).toThrow(/Invalid D2TV magic/)
  })

  it('detects truncated payload', () => {
    const headerBytes = writeVectorHeader('TEST', 8, 10)
    const truncated = new Uint8Array(32 + 50)
    truncated.set(headerBytes, 0)
    expect(() => parseVectorHeader(truncated)).toThrow(/Truncated vector file/)
  })
})

describe('PRNG Subsystem Vectors (D2TV kind = PRNG)', () => {
  it('generates and verifies 10,000 PRNG test vectors with zero mismatch (TS emitter)', () => {
    const vectorBytes = generatePrngVectors(10_000, 987654)
    expect(vectorBytes.length).toBe(32 + 10_000 * PRNG_RECORD_SIZE)

    const res = verifyPrngVectors(vectorBytes)
    expect(res.errors).toEqual([])
    expect(res.passed).toBe(10_000)
    expect(res.total).toBe(10_000)
  })

  it('verifies 10,000 PRNG test vectors collected from C + original D2Game.dll / D2Common.dll with 0 errors', () => {
    const cVectorPath = path.resolve(__dirname, '../../tools/oracle/vectors/prng-10k.d2tv')
    expect(fs.existsSync(cVectorPath)).toBe(true)
    const bytes = fs.readFileSync(cVectorPath)
    const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const res = verifyPrngVectors(u8)
    expect(res.errors).toEqual([])
    expect(res.passed).toBe(10_000)
    expect(res.total).toBe(10_000)

    // Negative control: corrupt one rolledVal byte and verify failure detection
    const corrupted = new Uint8Array(u8)
    corrupted[32 + 20] = (corrupted[32 + 20]! ^ 1) & 0xff
    const bad = verifyPrngVectors(corrupted)
    expect(bad.errors.length).toBeGreaterThan(0)
  })
})

describe('Event Wheel Subsystem Vectors (D2TV kind = EVTWHEEL)', () => {
  it('verifies 256 EVTWHEEL scenarios (45,101 fired events: 64-slot wrap, FIFO+LIFO, in-exec delete, >600 pool growth) collected from original D2Game.dll with 0 errors', () => {
    const cVectorPath = path.resolve(__dirname, '../../tools/oracle/vectors/eventwheel-113c.d2tv')
    expect(fs.existsSync(cVectorPath)).toBe(true)
    const bytes = fs.readFileSync(cVectorPath)
    const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(u8.length).toBe(32 + 256 * EVTWHEEL_RECORD_SIZE)

    const res = verifyEventWheelVectors(u8)
    expect(res.errors).toEqual([])
    expect(res.passed).toBe(256)
    expect(res.total).toBe(256)
    expect(res.totalFired).toBe(45_101)

    // Byte-for-byte parity between C/D2Game.dll .d2tv and TS generator
    const tsGenerated = generateEventWheelVectors(256)
    expect(Buffer.compare(Buffer.from(u8), Buffer.from(tsGenerated))).toBe(0)

    // Negative control: flip one bit in scenario #128 checksum
    const corrupted = new Uint8Array(u8)
    corrupted[32 + 128 * EVTWHEEL_RECORD_SIZE + 24] ^= 0x01
    const bad = verifyEventWheelVectors(corrupted)
    expect(bad.errors.length).toBe(1)
  })
})
