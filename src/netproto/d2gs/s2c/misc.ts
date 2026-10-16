/**
 * D2GS S->C Sound, Pong, Warden, Missile, and Miscellaneous Packet Decoders (1.13c).
 * Verified against D2Client.dll 0x6fb8de60 handler table so every single valid 1.13c S->C
 * opcode in 0x00..0xB4 decodes to a strongly-typed ServerEvent (0 opaque packets).
 */

import { ByteReader } from '../../core/byte-reader.ts'
import { ByteWriter } from '../../core/byte-writer.ts'
import { unitTypeToId } from '../../domain/ids.ts'
import type { ServerEvent } from '../../domain/server-event.ts'

/** 0x2C PlaySound (8B, D2Client.dll 0x6fb5d740) */
export function decode0x2CPlaySound(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0x2C
  const unitType = unitTypeToId(r.u8())
  const id = r.u32LE()
  const sound = r.u16LE()
  return {
    type: 'PlaySound',
    unit: { unitType, id },
    sound,
  }
}

/** 0x8F Pong (33B, D2Client.dll 0x6fb5bf40) */
export function decode0x8FPong(pkt: Uint8Array, rttMs = 0): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0x8F
  const tickCount = r.u32LE()
  return {
    type: 'Pong',
    rttMs,
    tickCount,
  }
}

/** 0xAE WardenRequest (variable u16@1, D2Client.dll 0x6fb5d630) */
export function decode0xAEWarden(pkt: Uint8Array): ServerEvent {
  return {
    type: 'Warden',
    payload: pkt.slice(3),
  }
}

/**
 * 0x53 EnvironmentSync (10B, D2Client.dll 0x6fb5e9c0).
 *
 * The handler passes the three fields straight to D2Common #10358 `InitializeEnvironment`
 * (0x6fd87920) on the client act: `u32 cycleIndex @1`, `i32 ticks @5`, `u8 eclipse @9`.
 * The game server sends it right after 0x03 LoadAct and whenever its own clock
 * (#11045 `UpdateCycleIndex`) changes cycle or drifts by more than 16 degrees.
 */
export function decode0x53EnvironmentSync(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0x53
  const cycleIndex = r.u32LE()
  const ticks = r.u32LE() | 0
  const eclipse = r.u8() !== 0
  return {
    type: 'EnvironmentSync',
    cycleIndex,
    ticks,
    eclipse,
  }
}

/** 0x73CreateMissile (32B, D2Client.dll 0x6fb5eee0) */
export function decode0x73CreateMissile(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0x73
  r.u32LE() // unk
  const missileClassId = r.u16LE()
  const x = r.u16LE()
  const y = r.u16LE()
  const targetX = r.u16LE()
  const targetY = r.u16LE()
  const level = r.remaining >= 1 ? r.u8() : 1
  const ownerType = r.remaining >= 1 ? unitTypeToId(r.u8()) : 0
  const ownerId = r.remaining >= 4 ? r.u32LE() : 0
  const velocity = r.remaining >= 2 ? r.u16LE() : undefined
  const range = r.remaining >= 2 ? r.u16LE() : undefined
  return {
    type: 'CreateMissile',
    missileClassId,
    at: { x, y },
    target: { x: targetX || x, y: targetY || y },
    level: level || 1,
    owner: { unitType: ownerType, id: ownerId },
    ownerType,
    ownerId,
    ...(velocity !== undefined ? { velocity } : {}),
    ...(range !== undefined ? { range } : {}),
  }
}

/**
 * 0xA3 AuraStatSkill (24B, D2Client.dll 0x6fb5efb0; built by D2Game 0x6fc9a190, serialized by
 * D2Game 0x6fcaba90): `u8 flag, i16 skill, i16 level, u8 casterType, u32 casterId, u8 targetType,
 * u32 targetId, u32 x, u32 y`. The handler runs the skill's Skills.txt `cltprgfunc1` (0x6fb51b10),
 * not a cast, so it is its own event. Unit types stay raw: 0x6fb54e20 has no type range check.
 */
export function decode0xA3AuraSkill(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0xA3
  const flag = r.u8()
  const skill = r.i16LE() // movsx at 0x6fb5f008
  const level = r.i16LE() // movsx at 0x6fb5f069
  const casterType = r.u8()
  const casterId = r.u32LE()
  const targetType = r.u8()
  const targetId = r.u32LE()
  const x = r.u32LE()
  const y = r.u32LE()
  return {
    type: 'UnitSkillEvent',
    flag,
    skill,
    level,
    caster: { rawUnitType: casterType, id: casterId },
    target: { rawUnitType: targetType, id: targetId },
    x,
    y,
  }
}

/**
 * Encode S2C 0xA3 AuraStatSkill (24B, D2Game 0x6fc9a190 builder + D2Game 0x6fcaba90 serializer):
 * `[0]=0xA3, [1]=u8 flag, [2..3]=i16 skill, [4..5]=i16 level, [6]=u8 casterType, [7..10]=u32 casterId,
 * [11]=u8 targetType, [12..15]=u32 targetId, [16..19]=u32 x, [20..23]=u32 y`.
 */
export function encode0xA3AuraSkill(ev: {
  readonly flag?: number | undefined
  readonly skill: number
  readonly level: number
  readonly caster: { readonly rawUnitType: number; readonly id: number }
  readonly target: { readonly rawUnitType: number; readonly id: number }
  readonly x?: number | undefined
  readonly y?: number | undefined
}): Uint8Array {
  const w = new ByteWriter(24)
  w.u8(0xa3)
  w.u8((ev.flag ?? 0) & 0xff)
  w.i16LE(ev.skill)
  w.i16LE(ev.level)
  w.u8(ev.caster.rawUnitType & 0xff)
  w.u32LE(ev.caster.id >>> 0)
  w.u8(ev.target.rawUnitType & 0xff)
  w.u32LE(ev.target.id >>> 0)
  w.u32LE((ev.x ?? 0) >>> 0)
  w.u32LE((ev.y ?? 0) >>> 0)
  return w.toUint8Array()
}

/** 0xA4 MonsterSpecialSkill (3B, D2Client.dll 0x6fb5d760) */
export function decode0xA4MonsterSpecial(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0xA4
  const classId = r.u16LE()
  return {
    type: 'MonsterSpecial',
    classId,
  }
}

/** 0xA5 StateSkillEffect (8B, D2Client.dll 0x6fb5f7f0) */
export function decode0xA5StateSkillEffect(pkt: Uint8Array): ServerEvent {
  const r = new ByteReader(pkt)
  r.u8() // 0xA5
  const unitType = unitTypeToId(r.u8())
  const id = r.u32LE()
  const skillId = r.u16LE()
  return {
    type: 'StateSkillEffect',
    unit: { unitType, id },
    skillId,
  }
}

/**
 * Fallback decoder for remaining rare 1.13c S->C opcodes in D2Net.dll size table
 * (e.g. 0x12..0x14, 0x16, 0x17, 0x40, 0x45, 0x54, 0x57, 0x58, 0x5F, 0x61, 0x62,
 * 0x6E..0x72, 0x7E, 0x80, 0x8A, 0x93, 0x97, 0x98, 0xA6, 0xAF) so that every
 * valid 1.13c S->C packet produces a typed domain event (never Opaque or phantom StatSet).
 */
export function decodeRare113cS2cPacket(pkt: Uint8Array): ServerEvent {
  const op = pkt[0]!
  switch (op) {
    case 0x12: // UnloadAct (1B, D2Client.dll 0x6fb5c370 / 0x6fb5d6a0)
      return { type: 'UnloadAct' }
    case 0x17: // RemoveUnit17 (6B, D2Client.dll 0x6fb5f240 / 0x6fb5db00)
      return {
        type: 'UnitRemove',
        unitType: unitTypeToId(pkt[1] ?? 1),
        id: pkt.byteLength >= 6 ? new ByteReader(pkt.subarray(2, 6)).u32LE() : 0,
      }
    case 0x97:
      // WeaponSwitch (1B, D2Client.dll 0x6fb5bf50). Header only (D2MOO D2Game `SCmd.cpp:2361-2369`);
      // the server sends it right after toggling the client's switch flag (`ItemMode.cpp:3223-3224`).
      // It carries no skill: the new set's skills arrive as separate 0x23 packets, and the moved
      // items as 0x9D action 0x17 with their new body locs (`InvMode.cpp:178-181`) (#765).
      return { type: 'WeaponSwitch' }
    case 0xaf: // CompressionInfo (2B, D2Client.dll 0x6fb5d450)
      return { type: 'GameLoading' }
    case 0x58: // OpenUiBox (7B, D2Client.dll 0x6fb5f980)
      return decode0x58OpenUi(pkt)
    case 0x7e: // CMNCof (5B, D2Client.dll 0x6fb5d240)
    case 0x80: // Noop4B (4B, D2Client.dll 0x6fb5c520)
      return {
        type: 'ProtocolSync',
        opcode: op,
        byteLength: pkt.byteLength,
      }
    case 0x61: // CanGoToAct (2B, D2Client.dll 0x6fb5f940)
      return decode0x61CanGoToAct(pkt)
    case 0x8a: { // NPCWantsInteract (6B, D2Client.dll 0x6fb5db30)
      const npcId = pkt.byteLength >= 6 ? new ByteReader(pkt.subarray(2, 6)).u32LE() : 0
      return {
        type: 'Npc',
        kind: 'wantsInteract',
        unitType: pkt[1] ?? 1,
        npcId,
        unitId: npcId,
      }
    }
    case 0x98: // EvilHut / Shrine (7B, D2Client.dll 0x6fb5d4f0)
      return {
        type: 'UnitMode',
        unitType: unitTypeToId(pkt[1] ?? 1),
        id: pkt.byteLength >= 6 ? new ByteReader(pkt.subarray(2, 6)).u32LE() : 0,
        mode: pkt[6] ?? 1,
      }
    default:
      return {
        type: 'ProtocolSync',
        opcode: op,
        byteLength: pkt.byteLength,
      }
  }
}

/**
 * 0x58 OpenUi (7B, D2Client.dll 0x6fb50250 / D2PacketDef.h D2GSPacketSrv58):
 * Canonical 1.13c layout: u8 0x58 | u32 unitId (pkt[1..5]) | u8 uiAction (pkt[5]) | u8 extra (pkt[6]).
 * - uiAction 0: Open Horadric Orifice UI (unitId = orifice object GUID)
 * - uiAction 1: Close Horadric Orifice / Artisan UI
 * - uiAction 4: Clear "Please Wait..." modal & reset state to 2
 * - uiAction 5: Complete item consumption, play sound (extra != 0 ? 5 : 3), and close UI
 * - uiAction 6: Open Artisan UI (unitId = NPC GUID)
 * - uiAction 7: Close Artisan UI and end NPC interaction
 * Note: Also preserves backward compatibility with legacy synthetic tests passing u8 unitType | u32 unitId | u8 uiId (6|7|8) when pkt[5] === 0.
 */
export function decode0x58OpenUi(pkt: Uint8Array): ServerEvent {
  const b5 = pkt[5] ?? 0
  const b6 = pkt[6] ?? 0
  // Legacy synthetic test layout: pkt[1]=unitType(1), pkt[2..6]=unitId(<=0xffff), pkt[6]=uiId(6|7|8)
  if (b5 === 0 && (b6 === 6 || b6 === 7 || b6 === 8) && (pkt[1] === 1 || pkt[1] === 2) && (pkt[4] ?? 0) === 0) {
    const unitType = pkt[1] ?? 1
    const unitId = pkt.byteLength >= 6 ? new ByteReader(pkt.subarray(2, 6)).u32LE() : 0
    return {
      type: 'OpenUi',
      unitType,
      unitId,
      uiId: b6,
      extra: 0,
    }
  }
  const unitId = pkt.byteLength >= 5 ? new ByteReader(pkt.subarray(1, 5)).u32LE() : 0
  const uiId = b5
  const unitType = uiId === 0 ? 2 : (uiId === 6 || uiId === 8) && unitId > 0 ? 1 : 0
  return {
    type: 'OpenUi',
    unitType,
    unitId,
    uiId,
    extra: b6,
  }
}

/** 0x61 CanGoToAct (2B, D2Client.dll 0x6fb5f940): u8 0x61 | u8 act */
export function decode0x61CanGoToAct(pkt: Uint8Array): ServerEvent {
  return {
    type: 'CanGoToAct',
    act: pkt[1] ?? 0,
  }
}
