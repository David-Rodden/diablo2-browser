/**
 * Length-prefixed JSON framing for future TypeScript authoritative server (`src/netproto/ts/framing.ts`).
 */

import { ByteReader } from '../core/byte-reader.ts'
import { ByteWriter } from '../core/byte-writer.ts'
import { ProtocolError } from '../core/errors.ts'
import { decodeText, encodeText } from '../core/text-codec.ts'

export function encodeTsFrame(obj: unknown): Uint8Array {
  const json = encodeText(JSON.stringify(obj), 'utf-8')
  const w = new ByteWriter(4 + json.byteLength)
  w.u32LE(json.byteLength)
  w.bytes(json)
  return w.toUint8Array()
}

export class TsFramer {
  private buf: Uint8Array = new Uint8Array(0)

  push(chunk: Uint8Array): unknown[] {
    if (chunk.byteLength === 0) return []
    const merged = new Uint8Array(this.buf.byteLength + chunk.byteLength)
    merged.set(this.buf, 0)
    merged.set(chunk, this.buf.byteLength)
    this.buf = merged

    const out: unknown[] = []
    let offset = 0
    while (offset + 4 <= this.buf.byteLength) {
      const r = new ByteReader(this.buf.subarray(offset, offset + 4))
      const len = r.u32LE()
      if (len > 1024 * 1024) {
        throw new ProtocolError(`TS frame length ${len} exceeds 1MB limit`, { proto: 'ts' })
      }
      if (offset + 4 + len > this.buf.byteLength) break
      const jsonText = decodeText(this.buf.subarray(offset + 4, offset + 4 + len), 'utf-8')
      out.push(JSON.parse(jsonText))
      offset += 4 + len
    }
    if (offset > 0) {
      this.buf = this.buf.slice(offset)
    }
    return out
  }
}
