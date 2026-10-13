/**
 * D2GS C->S Chat (0x15) and Overhead Chat (0x14) Packet Builders (1.13c).
 */

import { ByteWriter } from '../../core/byte-writer.ts'
import type { TextEncoding } from '../../core/text-codec.ts'
import { validateC2sPacket } from '../framing-c2s.ts'

/** 0x15 Chat (variable: u8 0x15 | u8 type | u8 0 | string msg\0 | string whisperTo\0 | u8 0) */
export function encodeC2sChat(
  text: string,
  whisperTo?: string,
  encoding: TextEncoding = 'gbk',
): Uint8Array {
  const w = new ByteWriter(64)
  w.u8(0x15)
  w.u8(whisperTo ? 0x02 : 0x01)
  w.u8(0x00)
  w.cString(text, encoding)
  w.cString(whisperTo ?? '', encoding)
  w.u8(0x00)
  return validateC2sPacket(w.toUint8Array())
}

/** 0x14 OverheadChat (variable: u8 0x14 | u8 0 | u8 0 | string msg\0 | u8 0 | u8 0) */
export function encodeC2sOverheadChat(
  text: string,
  encoding: TextEncoding = 'gbk',
): Uint8Array {
  const w = new ByteWriter(64)
  w.u8(0x14)
  w.u8(0x00)
  w.u8(0x00)
  w.cString(text, encoding)
  w.u8(0x00)
  w.u8(0x00)
  return validateC2sPacket(w.toUint8Array())
}
