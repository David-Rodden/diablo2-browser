/**
 * D2GS S->C Game Loading, Act, Room, and Session Lifecycle Packet Decoders (1.13c).
 * Verified against D2Client.dll handler table at 0x6fb8de60 and system dispatch at 0x6fb5d450.
 */

import { ByteReader } from '../../core/byte-reader.ts'
import { wireUnitTypeId } from '../../domain/ids.ts'
import type { ServerEvent } from '../../domain/server-event.ts'
import { requirePacketLength, unitLookupMiss } from './packet-length.ts'

/** 0x00 GameLoading (1B, D2Client.dll 0x6fb5c520) */
export function decode0x00GameLoading(_pkt: Uint8Array): ServerEvent {
  return { type: 'GameLoading' }
}

/**
 * 0x01 GameFlags / GameLogonReceipt (8B, D2Client.dll 0x6fb5fa90; built by D2Game 0x6fcac420, called with
 * `mov cl,0x1` from 0x6fc4ac64): `@1` difficulty = pGame+0x6D, `@2` dword = the game's arena flags
 * (pGame+0x1D28 -> +8, i.e. the create flags & 0x3179C7 stored at 0x6fcd258c..0x6fcd2598), `@6` = expansion
 * (pGame+0x70 != 0), `@7` = ladder (pGame+0x74 != 0).
 *
 * D2Client stores `@1` without clamping (0x6fbcc390), so an out-of-range difficulty is a protocol error here
 * instead of being folded to Normal (#1660). Arena flag 0x800 is the hardcore game flag: D2Game refuses a
 * hardcore character in a game without it and a softcore character in a game with it (character status 0x04
 * vs `test ah,0x8` at 0x6fc6bdc2 / 0x6fc6bde1 and 0x6fd0bb9d / 0x6fd0bbdb, #1665).
 */
export function decode0x01GameFlags(pkt: Uint8Array): ServerEvent {
  requirePacketLength(pkt, '0x01 GameFlags', 8)
  const r = new ByteReader(pkt)
  r.u8() // 0x01
  const difficultyRaw = r.u8()
  if (difficultyRaw > 2) {
    throw new RangeError(`0x01 GameFlags: difficulty ${String(difficultyRaw)} is outside 0..2`)
  }
  const difficulty = difficultyRaw as 0 | 1 | 2
  const arenaFlags = r.u32LE()
  const expansionByte = r.u8()
  const ladderByte = r.u8()
  return {
    type: 'GameFlags',
    difficulty,
    hardcore: (arenaFlags & 0x0800) !== 0,
    expansion: expansionByte !== 0,
    ladder: ladderByte !== 0,
    arenaFlags,
  }
}

/** 0x02 GameLogonSuccess (1B, D2Client.dll 0x6fb5c4f0) */
export function decode0x02GameLogonSuccess(_pkt: Uint8Array): ServerEvent {
  return { type: 'GameLoading' }
}

/** 0x03 LoadAct (12B, D2Client.dll 0x6fb5db50) */
export function decode0x03LoadAct(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0x03
  const act = r.u8()
  const mapSeed = r.u32LE()
  const areaId = r.u16LE()
  const objectSeed = r.u32LE()
  return {
    type: 'LoadAct',
    act,
    mapSeed,
    areaId,
    objectSeed,
  }
}

/** 0x04 LoadDone (1B, D2Client.dll 0x6fb5dfe0) */
export function decode0x04LoadDone(_pkt: Uint8Array): ServerEvent {
  return { type: 'LoadComplete' }
}

/** 0x05 UnloadDone (1B, D2Client.dll 0x6fb5cb70) */
export function decode0x05UnloadDone(_pkt: Uint8Array): ServerEvent {
  return { type: 'UnloadComplete' }
}

/** 0x06 GameLogoutSuccess (1B, D2Client.dll 0x6fb5caa0) */
export function decode0x06GameLogout(_pkt: Uint8Array): ServerEvent {
  return { type: 'GameLogout' }
}

/** 0x07 MapAdd / RoomReveal (6B, D2Client.dll 0x6fb5c440) */
export function decode0x07RoomReveal(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0x07
  const tileX = r.u16LE()
  const tileY = r.u16LE()
  const areaId = r.u8()
  return {
    type: 'RoomReveal',
    areaId,
    tileX,
    tileY,
  }
}

/** 0x08 MapRemove / RoomHide (6B, D2Client.dll 0x6fb5c3d0) */
export function decode0x08RoomHide(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0x08
  const tileX = r.u16LE()
  const tileY = r.u16LE()
  const areaId = r.u8()
  return {
    type: 'RoomHide',
    areaId,
    tileX,
    tileY,
  }
}

/** 0x0B GameHandshake (6B, D2Client.dll 0x6fb5d6e0) */
export function decode0x0BGameHandshake(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0x0B
  // D2Client 0x6fb5d6e0 looks the unit up with the raw type byte (no mask); outside 0..5 it fails (#1656).
  const unitType = wireUnitTypeId(r.u8())
  if (unitType === undefined) return unitLookupMiss(pkt)
  const id = r.u32LE()
  return {
    type: 'UnitAssign',
    classId: -1,
    unit: {
      unitType,
      id,
      classId: -1,
      x: 0,
      y: 0,
    },
    isSelf: true,
  }
}

/** 0xB0 ConnectionTerminated (1B, D2Client.dll 0x6fb5d450) */
export function decode0xB0ConnectionTerminated(_pkt: Uint8Array): ServerEvent {
  return { type: 'GameLogout' }
}

/** 0xB3 SaveChunk (variable pkt[1], D2Client.dll 0x6fb5cd70) */
export function decode0xB3SaveChunk(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0xB3
  const chunkLen = r.u8()
  const isFirst = r.u8() === 0
  const totalSize = r.u32LE()
  const payloadLen = Math.max(0, Math.min(pkt.byteLength - 7, chunkLen))
  const chunk = r.bytes(payloadLen)
  return {
    type: 'SaveChunk',
    isFirst,
    totalSize,
    chunk,
  }
}

/** 0xB4 TimeoutReason / CantEnterGame (5B, D2Client.dll 0x6fb5cbf0) */
export function decode0xB4TimeoutReason(pkt: Uint8Array): ServerEvent {
  if (pkt.byteLength >= 5) {
    const r = new ByteReader(pkt)
    r.u8() // 0xB4
    const reason = r.u32LE()
    return { type: 'GameLogout', reason }
  }
  return { type: 'GameLogout' }
}
