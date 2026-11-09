/**
 * Diablo II v1.13c `D2UnitStrc` & `D2ActiveRoomStrc` unit/room primitives.
 *
 * Binary evidence (`D2Common.dll`, image base `0x6FD50000`):
 * - `UNIT_Alloc` (`#11153` @ `0x6FD7F370`): `D2UnitStrc` unified layout (`0xF4` bytes: `mov edx, 0xF4` at `0x6FD7F383`).
 * - `UNITS_GetX` (`0x6FD51050`, `ecx = pUnit`) / `UNITS_GetY` (`0x6FD51080`, `ecx = pUnit`):
 *   - `dwUnitType` in `{2, 4, 5}` (object, item, tile -> `D2StaticPathStrc` at `+0x2C`):
 *     X = `u32(pPath + 0x0C)`, Y = `u32(pPath + 0x10)`.
 *   - `dwUnitType` in `{0, 1, 3}` (player, monster, missile -> `D2DynamicPathStrc` at `+0x2C`):
 *     X = `u16(pPath + 0x02)` (`wPosX`), Y = `u16(pPath + 0x06)` (`wPosY`), or `0` if `pPath == 0`.
 * - `UNITROOM_RefreshUnit` (`#10158 0x6FDB65C0`): sets `unit.dwFlags |= 0x2000`, `*room.pActUpdateFlag = 1`,
 *   and head-inserts `unit` into `room.pUpdateList (+0x1C)` via `unit.pRoomUpdateNext (+0xE0)`.
 * - `UNITROOM_ClearUpdateQueue` (`#10796 0x6FDB63B0`): walks `room.pUpdateList (+0x1C)`, clearing
 *   `unit.dwFlags &= ~0x2000` and `unit.pRoomUpdateNext = 0`, then sets `room.pUpdateList = 0`.
 * - `UNITROOM_AddUnitToRoom` (`#10531 0x6FDB6800`): head-inserts `unit` into `room.pUnitFirst (+0x74)`
 *   via `unit.pRoomUnitNext (+0xE8)` (does NOT write `pPath->pRoom`!), calls `UNITROOM_RefreshUnit`,
 *   and increments `room.nAlliedCount (+0x28)` for players (`dwUnitType == 0`) or alignment-2 monsters (`0x6FDB687B..89`).
 * - `UNITROOM_RemoveUnitFromRoom` (`#11016 0x6FDB6700`): unlinks `unit` from `room.pUnitFirst (+0x74)`
 *   chain, decrements `room.nAlliedCount (+0x28)` for players or alignment-2 monsters (`0x6FDB67B0..C6`),
 *   unlinks from `room.pUpdateList (+0x1C)`, clears `unit.dwFlags &= ~0x2000`, and zeroes `pPath->pRoom`.
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import type { D2SeedStrc } from '../prng.ts'
import {
  D2ActiveRoomStrc,
  D2CharStatsTxt,
  D2CharStatsTxt_SIZE,
  D2DynamicPathStrc,
  D2MonStatsTxt,
  D2MonStatsTxt_SIZE,
  D2ObjectDataStrc,
  D2ObjectsTxt,
  D2PlayerDataStrc,
  D2StatListExStrc,
  D2StatListStrc,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import { SKILLS_GetUsedSkill113c } from '../game/fallen-ai-113c.ts'
import {
  D2COMMON_GDWBITMASKS_IAT_VA_113C,
  D2COMMON_SGPT_DATATABLES_VA_113C,
  D2CommonAssertError,
  DATATABLES_OFF_113C,
} from './inline-helpers.ts'
import { imul32, sar32 } from './int-math.ts'
import {
  STATES_CheckState113c,
  STATLIST_FLAG_EXTENDED,
  STATLIST_GetUnitStat113c,
} from './statlist.ts'

export const UNIT_PLAYER = 0
export const UNIT_MONSTER = 1
export const UNIT_OBJECT = 2
export const UNIT_MISSILE = 3
export const UNIT_ITEM = 4
export const UNIT_TILE = 5

export const UNITFLAG_ISUPDATE = 0x00002000

/** `D2Common.#11153` (`0x6FD7F370`): `sizeof(D2UnitStrc) = 0xF4` (`244` bytes). */
export const D2UNIT_ALLOC_SIZE_113C = 0xf4

const DYNPATH_SIZE = 0x40
const STATICPATH_SIZE = 0x20
const UNITS_CPP_FILE_113C = '..\\Source\\D2Common\\UNITS\\Units.cpp'

/** `@va D2Common:0x6FD7F370` (`D2Common.#11153` `UNIT_Alloc`): allocate a `0xF4`-byte `D2UnitStrc`. */
export function UNIT_Alloc113c(m: Memory113c, unitType = 0): number {
  const pUnit = m.alloc(D2UNIT_ALLOC_SIZE_113C)
  m.set(pUnit, D2UnitStrc.dwUnitType, unitType >>> 0)
  return pUnit
}

export function UNITS_Create113c(
  m: Memory113c,
  unitType: number,
  classId: number,
  unitId: number,
  pGame = 0,
): number {
  const pUnit = UNIT_Alloc113c(m, unitType)
  m.set(pUnit, D2UnitStrc.dwClassId, classId >>> 0)
  m.set(pUnit, D2UnitStrc.dwUnitId, unitId >>> 0)
  m.set(pUnit, D2UnitStrc.pGame, pGame >>> 0)
  return pUnit
}

/** Allocate and attach an isomorphic path (`D2DynamicPathStrc` for `0,1,3` or `D2StaticPathStrc` for `2,4,5`). */
export function UNITS_InitPath113c(m: Memory113c, pUnit: number, x: number, y: number, pRoom = 0): number {
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  const isStatic = unitType === UNIT_OBJECT || unitType === UNIT_ITEM || unitType === UNIT_TILE
  const pPath = m.alloc(isStatic ? STATICPATH_SIZE : DYNPATH_SIZE)
  m.set(pUnit, D2UnitStrc.pPath, pPath)
  if (isStatic) {
    // D2StaticPathStrc: +0x00 pRoom, +0x0C dwPosX, +0x10 dwPosY
    m.setU32(pPath + 0x00, pRoom >>> 0)
    m.setU32(pPath + 0x0c, x >>> 0)
    m.setU32(pPath + 0x10, y >>> 0)
  } else {
    // D2DynamicPathStrc: +0x00 wOffsetX, +0x02 wPosX, +0x04 wOffsetY, +0x06 wPosY, +0x1C pRoom
    m.setU16(pPath + 0x02, x & 0xffff)
    m.setU16(pPath + 0x06, y & 0xffff)
    m.setU32(pPath + 0x1c, pRoom >>> 0)
  }
  return pPath
}

/**
 * `@va D2Common:0x6FD7FE10` (`D2Common.#10331` `UNITS_GetRoom`, 82 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4` -> `D2ActiveRoomStrc*`).
 */
export function UNITS_GetRoom113c(m: Memory113c, pUnit: number): number {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x896)
  }
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType) | 0
  if (unitType === 2 || (unitType > 3 && unitType <= 5)) {
    const pStaticPath = m.get(pUnit, D2UnitStrc.pPath)
    return m.u32(pStaticPath + 0x00)
  }
  const pDynamicPath = m.get(pUnit, D2UnitStrc.pPath)
  if (pDynamicPath === 0) return 0
  return m.get(pDynamicPath, D2DynamicPathStrc.pRoom)
}

export function UNITS_SetRoom113c(m: Memory113c, pUnit: number, pRoom: number): void {
  const pPath = m.get(pUnit, D2UnitStrc.pPath)
  if (pPath === 0) return
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  const isStatic = unitType === UNIT_OBJECT || unitType === UNIT_ITEM || unitType === UNIT_TILE
  m.setU32(pPath + (isStatic ? 0x00 : 0x1c), pRoom >>> 0)
}

/** `D2Common 0x6FD51050` (`UNITS_GetX`, `ecx = pUnit`). */
export function UNITS_GetX113c(m: Memory113c, pUnit: number): number {
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  const pPath = m.get(pUnit, D2UnitStrc.pPath)
  if (unitType === UNIT_OBJECT || unitType === UNIT_ITEM || unitType === UNIT_TILE) {
    return m.u32(pPath + 0x0c) | 0
  }
  if (pPath === 0) return 0
  return m.u16(pPath + 0x02)
}

/** `D2Common 0x6FD51080` (`UNITS_GetY`, `ecx = pUnit`). */
export function UNITS_GetY113c(m: Memory113c, pUnit: number): number {
  if (pUnit === 0) return 0
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  const pPath = m.get(pUnit, D2UnitStrc.pPath)
  if (pPath === 0) return 0
  if (unitType === UNIT_OBJECT || unitType === UNIT_ITEM || unitType === UNIT_TILE) {
    return m.u32(pPath + 0x10) | 0
  }
  return m.u16(pPath + 0x06)
}

/** `D2Common.#10158` (`0x6FDB65C0` `UNITROOM_RefreshUnit`). */
export function UNITROOM_RefreshUnit113c(m: Memory113c, pUnit: number): void {
  if (pUnit === 0) return
  const pRoom = UNITS_GetRoom113c(m, pUnit)
  if (pRoom === 0) return
  if ((m.get(pRoom, D2ActiveRoomStrc.dwFlags) & 0x04) !== 0) return
  const flags = m.get(pUnit, D2UnitStrc.dwFlags)
  if ((flags & UNITFLAG_ISUPDATE) !== 0) return

  m.set(pUnit, D2UnitStrc.dwFlags, (flags | UNITFLAG_ISUPDATE) >>> 0)
  const pActFlag = m.get(pRoom, D2ActiveRoomStrc.pActUpdateFlag)
  if (pActFlag !== 0) {
    m.setU32(pActFlag, 1)
  }
  const prevHead = m.get(pRoom, D2ActiveRoomStrc.pUpdateList)
  m.set(pUnit, D2UnitStrc.pRoomUpdateNext, prevHead)
  m.set(pRoom, D2ActiveRoomStrc.pUpdateList, pUnit)
}

/**
 * `D2Common.#10830` (`0x6FD891F0` -> `0x6FD8B650` `STATLIST_GetUnitAlignment`):
 * Returns `2` (allied/player) for `UNIT_PLAYER`, or for `UNIT_MONSTER` when state `17` (`conversion`)
 * is active (`0x6FD8920F`) or `pStatListEx->dwFlags` has bit `0x200` set (`0x6FD8B685`);
 * returns `1` when bit `0x400` is set; otherwise `0` (evil).
 */
export function UNIT_GetAlignment113c(m: Memory113c, pUnit: number): number {
  if (pUnit === 0) return 2
  const uType = m.get(pUnit, D2UnitStrc.dwUnitType)
  if (uType !== UNIT_MONSTER) return 2
  if (STATES_CheckState113c(m, pUnit, 17) !== 0) return 2
  const pListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pListEx === 0) return 0
  const fl = m.get(pListEx, D2StatListStrc.dwFlags)
  if ((fl & STATLIST_FLAG_EXTENDED) === 0) return 0
  if ((fl & 0x0700) === 0) return 0
  if ((fl & 0x0100) !== 0) return 0
  if ((fl & 0x0400) !== 0) return 1
  return (fl & 0x0200) !== 0 ? 2 : 0
}

/**
 * `@va D2Common:0x6FDB63B0` (`D2Common.#10796` `UNITROOM_ClearUpdateQueue`):
 * Walks `pRoom->pUpdateList (+0x1C)`, clearing `UNITFLAG_ISUPDATE` (`0x2000`) and
 * `pRoomUpdateNext (+0xE0)` on each unit, then zeroes `pRoom->pUpdateList`.
 */
export function UNITROOM_ClearUpdateQueue113c(m: Memory113c, pRoom: number): void {
  if (pRoom === 0) return
  let cur = m.get(pRoom, D2ActiveRoomStrc.pUpdateList)
  while (cur !== 0) {
    const next = m.get(cur, D2UnitStrc.pRoomUpdateNext)
    m.set(cur, D2UnitStrc.dwFlags, (m.get(cur, D2UnitStrc.dwFlags) & ~UNITFLAG_ISUPDATE) >>> 0)
    m.set(cur, D2UnitStrc.pRoomUpdateNext, 0)
    cur = next
  }
  m.set(pRoom, D2ActiveRoomStrc.pUpdateList, 0)
}

/** `D2Common.#10531` (`0x6FDB6800` `UNITROOM_AddUnitToRoom`). */
export function UNITROOM_AddUnitToRoom113c(m: Memory113c, pUnit: number, pRoom: number): void {
  if (pUnit === 0 || pRoom === 0) return
  const prevFirst = m.get(pRoom, D2ActiveRoomStrc.pUnitFirst)
  m.set(pUnit, D2UnitStrc.pRoomUnitNext, prevFirst)
  m.set(pRoom, D2ActiveRoomStrc.pUnitFirst, pUnit)
  UNITROOM_RefreshUnit113c(m, pUnit)
  const uType = m.get(pUnit, D2UnitStrc.dwUnitType)
  if (uType === UNIT_PLAYER || (uType === UNIT_MONSTER && UNIT_GetAlignment113c(m, pUnit) === 2)) {
    m.setU32(pRoom + 0x28, (m.u32(pRoom + 0x28) + 1) >>> 0)
  }
}

/** `D2Common.#11016` (`0x6FDB6700` `UNITROOM_RemoveUnitFromRoom`). */
export function UNITROOM_RemoveUnitFromRoom113c(m: Memory113c, pUnit: number): void {
  if (pUnit === 0) return
  const pRoom = UNITS_GetRoom113c(m, pUnit)
  if (pRoom === 0) return

  let prev = 0
  let cur = m.get(pRoom, D2ActiveRoomStrc.pUnitFirst)
  while (cur !== 0 && cur !== pUnit) {
    prev = cur
    cur = m.get(cur, D2UnitStrc.pRoomUnitNext)
  }
  if (cur === pUnit) {
    const next = m.get(pUnit, D2UnitStrc.pRoomUnitNext)
    if (prev === 0) m.set(pRoom, D2ActiveRoomStrc.pUnitFirst, next)
    else m.set(prev, D2UnitStrc.pRoomUnitNext, next)
    m.set(pUnit, D2UnitStrc.pRoomUnitNext, 0)
    const uType = m.get(pUnit, D2UnitStrc.dwUnitType)
    if (uType === UNIT_PLAYER || (uType === UNIT_MONSTER && UNIT_GetAlignment113c(m, pUnit) === 2)) {
      m.setU32(pRoom + 0x28, (m.u32(pRoom + 0x28) - 1) >>> 0)
    }
  }
  // Unlink from room update list if present (`0x6FDB6410`)
  const flags = m.get(pUnit, D2UnitStrc.dwFlags)
  if ((flags & UNITFLAG_ISUPDATE) !== 0) {
    let uPrev = 0
    let uCur = m.get(pRoom, D2ActiveRoomStrc.pUpdateList)
    while (uCur !== 0 && uCur !== pUnit) {
      uPrev = uCur
      uCur = m.get(uCur, D2UnitStrc.pRoomUpdateNext)
    }
    if (uCur === pUnit) {
      const uNext = m.get(pUnit, D2UnitStrc.pRoomUpdateNext)
      if (uPrev === 0) m.set(pRoom, D2ActiveRoomStrc.pUpdateList, uNext)
      else m.set(uPrev, D2UnitStrc.pRoomUpdateNext, uNext)
    }
    m.set(pUnit, D2UnitStrc.pRoomUpdateNext, 0)
    m.set(pUnit, D2UnitStrc.dwFlags, (flags & ~UNITFLAG_ISUPDATE) >>> 0)
  }
  if (cur === pUnit) {
    UNITS_SetRoom113c(m, pUnit, 0)
  }
}

/** Read `pUnit->sSeed` (`+0x20` `lo`, `+0x24` `hi`). */
export function UNITS_GetSeed113c(m: Memory113c, pUnit: number): D2SeedStrc {
  if (pUnit === 0) return { lo: 0, hi: 0 }
  return {
    lo: m.get(pUnit, D2UnitStrc.seedLo) >>> 0,
    hi: m.get(pUnit, D2UnitStrc.seedHi) >>> 0,
  }
}

/** Write `pUnit->sSeed` (`+0x20` `lo`, `+0x24` `hi`). */
export function UNITS_SetSeed113c(m: Memory113c, pUnit: number, lo: number, hi: number): void {
  if (pUnit === 0) return
  m.set(pUnit, D2UnitStrc.seedLo, lo >>> 0)
  m.set(pUnit, D2UnitStrc.seedHi, hi >>> 0)
}

/** `.rdata` weapon speed animation rate tables read by `0x6FD7FAC0` (`UNITS_GetWeaponSpeedAnimRate`). */
export const D2COMMON_PLAYER_WEAP_ANIM_RATE_TABLE_VA_113C = 0x6fddc608
export const D2COMMON_MON_WEAP_ANIM_RATE_TABLE_CLASSIC_VA_113C = 0x6fddc788
export const D2COMMON_MON_WEAP_ANIM_RATE_TABLE_EXP_VA_113C = 0x6fddc8c8

/**
 * `@va D2Common:0x6FD7EE60` (`D2Common.#10582` `UNITS_GetFrameAndFrameCount`,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pFrame`, `[esp+0xC] = pFrameCount`, `ret 0xC`, void).
 *
 * When `pUnit == 0`, zeroes `*pFrame` and `*pFrameCount`.
 * When `pUnit->dwUnitType == 2` (`UNIT_OBJECT`), writes `*pFrame = pUnit->dwFramePrecise (+0x44)`
 * and `*pFrameCount = pUnit->pUnitData->pObjectsTxt->dwFrameCnt[pUnit->dwAnimMode] (+0xD8 + mode*4)`.
 * Otherwise writes `*pFrame = pUnit->dwFramePrecise (+0x44)` and `*pFrameCount = pUnit->dwFrameCountPrecise (+0x48)`.
 */
export function UNITS_GetFrameAndFrameCount113c(
  m: Memory113c,
  pUnit: number,
  pFrame: number,
  pFrameCount: number,
): void {
  const u = pUnit >>> 0
  if (u === 0) {
    m.setU32(pFrame >>> 0, 0)
    m.setU32(pFrameCount >>> 0, 0)
    return
  }
  if (m.get(u, D2UnitStrc.dwUnitType) === 2) {
    m.setU32(pFrame >>> 0, m.get(u, D2UnitStrc.dwFramePrecise))
    const nMode = m.get(u, D2UnitStrc.dwAnimMode) | 0
    const pObjectData = m.get(u, D2UnitStrc.pUnitData)
    const pObjectsTxt = m.get(pObjectData, D2ObjectDataStrc.pObjectTxt)
    const frameCntAddr = (pObjectsTxt + imul32(nMode, 4) + D2ObjectsTxt.dwFrameCnt.off) >>> 0
    m.setU32(pFrameCount >>> 0, m.u32(frameCntAddr))
    return
  }
  m.setU32(pFrame >>> 0, m.get(u, D2UnitStrc.dwFramePrecise))
  m.setU32(pFrameCount >>> 0, m.get(u, D2UnitStrc.dwFrameCountPrecise))
}

/**
 * `@va D2Common:0x6FD7EF90` (`UNITS_IsWalkModeForType`,
 * custom LTCG `eax = nUnitType`, `ecx = nMode`, plain `ret` -> `1` or `0`).
 */
export function UNITS_IsWalkModeForType113c(
  _m: Memory113c,
  nUnitType: number,
  nMode: number,
): number {
  const t = nUnitType | 0
  const mode = nMode | 0
  if (t === 0) return mode === 9 ? 1 : 0
  if (t === 1) return mode === 6 ? 1 : 0
  return 0
}

/**
 * `@va D2Common:0x6FD7EFC0` (`UNITS_IsGetHitModeForType`,
 * custom LTCG `eax = nUnitType`, `ecx = nMode`, plain `ret` -> `1` or `0`).
 */
export function UNITS_IsGetHitModeForType113c(
  _m: Memory113c,
  nUnitType: number,
  nMode: number,
): number {
  const t = nUnitType | 0
  const mode = nMode | 0
  if (t === 0) return mode === 4 ? 1 : 0
  if (t === 1) return mode === 3 ? 1 : 0
  return 0
}

/**
 * `@va D2Common:0x6FD7F010` (`UNITS_IsRunModeForType`,
 * custom LTCG `eax = nUnitType`, `ecx = nMode`, plain `ret` -> `1` or `0`).
 */
export function UNITS_IsRunModeForType113c(
  _m: Memory113c,
  nUnitType: number,
  nMode: number,
): number {
  const t = nUnitType | 0
  const mode = nMode | 0
  if (t === 0) return mode === 0x13 ? 1 : 0
  if (t === 1) return mode === 0x0d ? 1 : 0
  return 0
}

/**
 * `@va D2Common:0x6FD7F1B0` (`D2Common.#10175` `UNITS_GetAnimOrSeqMode`,
 * stdcall `[esp+4] = pUnit`, `ret 4` -> `dwSeqMode (+0x40)` or `dwAnimMode (+0x10)`).
 */
export function UNITS_GetAnimOrSeqMode113c(m: Memory113c, pUnit: number): number {
  const u = pUnit >>> 0
  if (u === 0) return 0
  const uType = m.get(u, D2UnitStrc.dwUnitType)
  if ((uType === 0 || uType === 1) && m.get(u, D2UnitStrc.pAnimSeq) !== 0) {
    return m.get(u, D2UnitStrc.dwSeqMode) | 0
  }
  return m.get(u, D2UnitStrc.dwAnimMode) | 0
}

/**
 * `@va D2Common:0x6FD7FAC0` (`UNITS_GetWeaponSpeedAnimRate`,
 * custom LTCG `eax = nUnitType`, `ecx = nWeapClass`, `[esp+4] = nClassId`, `ret 4`).
 *
 * Unconditionally reads `.rdata` weapon animation rate tables at `0x6FDDC608` (player),
 * `0x6FDDC788` (monster `nClassId < 0x19A`), or `0x6FDDC8C8` (expansion monster `nClassId >= 0x19A`).
 */
export function UNITS_GetWeaponSpeedAnimRate113c(
  m: Memory113c,
  nUnitType: number,
  nWeapClass: number,
  nClassId: number,
): number {
  const t = nUnitType | 0
  const wc = nWeapClass | 0
  const cid = nClassId | 0
  if (t === 0) {
    const addr = (D2COMMON_PLAYER_WEAP_ANIM_RATE_TABLE_VA_113C + imul32(wc, 20)) >>> 0
    return m.u32(addr) | 0
  }
  if (t === 1) {
    const base =
      cid < 0x19a
        ? D2COMMON_MON_WEAP_ANIM_RATE_TABLE_CLASSIC_VA_113C
        : D2COMMON_MON_WEAP_ANIM_RATE_TABLE_EXP_VA_113C
    const addr = (base + imul32(wc, 20) + 0x10) >>> 0
    return m.u32(addr) | 0
  }
  return 0
}

/**
 * `@va D2Common:0x6FD7FB10` (`UNITS_GetBaseAnimSpeed`,
 * custom LTCG `ecx = nUnitType`, `eax = nClassId`, `edx = nAnimMode`, plain `ret`).
 */
export function UNITS_GetBaseAnimSpeed113c(
  m: Memory113c,
  nUnitType: number,
  nClassId: number,
  nAnimMode: number,
): number {
  const t = nUnitType | 0
  const cid = nClassId | 0
  const mode = nAnimMode | 0
  if (t === 0) {
    return mode === 3 ? 0x65 : 0xd5
  }
  if (t === 1) {
    let pRecord = 0
    if (cid >= 0) {
      const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
      if (cid < (m.u32((dt + DATATABLES_OFF_113C.nMonStatsTxtRecordCount) >>> 0) | 0)) {
        const pMonStats = m.u32((dt + DATATABLES_OFF_113C.pMonStatsTxt) >>> 0)
        pRecord = (pMonStats + imul32(cid, D2MonStatsTxt_SIZE)) >>> 0
      }
    }
    if (mode === 0x0f) {
      return (m.get(pRecord, D2MonStatsTxt.wRun) << 16) >> 16
    }
    return (m.get(pRecord, D2MonStatsTxt.wSeqVelocity) << 16) >> 16
  }
  return 0
}

/**
 * `@va D2Common:0x6FD80D50` (`UNITS_GetBaseWalkVelocity`,
 * custom LTCG `ecx = nUnitType`, `eax = nClassId`, plain `ret`).
 */
export function UNITS_GetBaseWalkVelocity113c(
  m: Memory113c,
  nUnitType: number,
  nClassId: number,
): number {
  const t = nUnitType | 0
  const cid = nClassId | 0
  if (t === 0) {
    let pRecord = 0
    if (cid >= 0) {
      const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
      if (cid < (m.u32((dt + DATATABLES_OFF_113C.nCharStatsTxtRecordCount) >>> 0) | 0)) {
        const pCharStats = m.u32((dt + DATATABLES_OFF_113C.pCharStatsTxt) >>> 0)
        pRecord = (pCharStats + imul32(cid, D2CharStatsTxt_SIZE)) >>> 0
      }
    }
    return ((m.get(pRecord, D2CharStatsTxt.nWalkSpeed) & 0xff) << 8) | 0
  }
  if (t === 1) {
    let pRecord = 0
    if (cid >= 0) {
      const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
      if (cid < (m.u32((dt + DATATABLES_OFF_113C.nMonStatsTxtRecordCount) >>> 0) | 0)) {
        const pMonStats = m.u32((dt + DATATABLES_OFF_113C.pMonStatsTxt) >>> 0)
        pRecord = (pMonStats + imul32(cid, D2MonStatsTxt_SIZE)) >>> 0
      }
    }
    const wVel = (m.get(pRecord, D2MonStatsTxt.wVelocity) << 16) >> 16
    return (wVel << 8) | 0
  }
  return 0
}

/**
 * `@va D2Common:0x6FD83A70` (`D2Common.#10226` `UNITS_CheckStateMaskOnCurse`,
 * stdcall `[esp+4] = nState`, `ret 4` -> masked bit word or `0`).
 */
export function UNITS_CheckStateMaskOnCurse113c(m: Memory113c, nState: number): number {
  const state = nState | 0
  if (state < 0) return 0
  const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
  if (state >= (m.u32((dt + DATATABLES_OFF_113C.nStatesTxtRecordCount) >>> 0) | 0)) return 0
  const pMaskArray = m.u32((dt + DATATABLES_OFF_113C.fStateMasksOnCurse) >>> 0)
  const wordVal = m.u32((pMaskArray + (sar32(state, 5) << 2)) >>> 0)
  const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
  const bitMask = m.u32((pBitMasks + ((state & 0x1f) << 2)) >>> 0)
  return (wordVal & bitMask) | 0
}

/**
 * `@va D2Common:0x6FD83B00` (`D2Common.#10590` `UNITS_CheckStateMaskExp`,
 * stdcall `[esp+4] = nState`, `ret 4` -> masked bit word or `0`).
 */
export function UNITS_CheckStateMaskExp113c(m: Memory113c, nState: number): number {
  const state = nState | 0
  if (state < 0) return 0
  const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
  if (state >= (m.u32((dt + DATATABLES_OFF_113C.nStatesTxtRecordCount) >>> 0) | 0)) return 0
  const pMaskArray = m.u32((dt + DATATABLES_OFF_113C.fStateMasksExp) >>> 0)
  const wordVal = m.u32((pMaskArray + (sar32(state, 5) << 2)) >>> 0)
  const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
  const bitMask = m.u32((pBitMasks + ((state & 0x1f) << 2)) >>> 0)
  return (wordVal & bitMask) | 0
}

/**
 * `@va D2Common:0x6FD83B40` (`D2Common.#10033` `UNITS_CheckStateMaskAura`,
 * stdcall `[esp+4] = nState`, `ret 4` -> masked bit word or `0`).
 */
export function UNITS_CheckStateMaskAura113c(m: Memory113c, nState: number): number {
  const state = nState | 0
  if (state < 0) return 0
  const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
  if (state >= (m.u32((dt + DATATABLES_OFF_113C.nStatesTxtRecordCount) >>> 0) | 0)) return 0
  const pMaskArray = m.u32((dt + DATATABLES_OFF_113C.fStateMasksAura) >>> 0)
  const wordVal = m.u32((pMaskArray + (sar32(state, 5) << 2)) >>> 0)
  const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
  const bitMask = m.u32((pBitMasks + ((state & 0x1f) << 2)) >>> 0)
  return (wordVal & bitMask) | 0
}

/**
 * `@va D2Common:0x6FD83B80` (`D2Common.#10683` `UNITS_IsShapeshifted`,
 * stdcall `[esp+4] = pUnit`, `ret 4` -> `(pUnit->dwFlags2 >> 3) & 1` or `0`).
 */
export function UNITS_IsShapeshifted113c(m: Memory113c, pUnit: number): number {
  const u = pUnit >>> 0
  if (u === 0) return 0
  return (m.get(u, D2UnitStrc.dwFlags2) >>> 3) & 1
}

/**
 * `@va D2Common:0x6FD83CA0` (`D2Common.#11150` `UNITS_GetStateFlagsPtr`,
 * stdcall `[esp+4] = pUnit`, `ret 4` -> `pStatListEx->pStateFlags (+0x58)` or `0`).
 */
export function UNITS_GetStateFlagsPtr113c(m: Memory113c, pUnit: number): number {
  const u = pUnit >>> 0
  if (u === 0) return 0
  const pStatListEx = m.get(u, D2UnitStrc.pStatListEx)
  if (pStatListEx === 0) return 0
  if ((m.get(pStatListEx, D2StatListStrc.dwFlags) | 0) >= 0) return 0
  return m.get(pStatListEx, D2StatListExStrc.pStateFlags) >>> 0
}

/**
 * `@va D2Common:0x6FD84330` (`D2Common.#11149` `UNITS_HasAnyGfxStateFlag`,
 * stdcall `[esp+4] = pUnit`, `ret 4` -> `1` if any dirty/gfx state word is non-zero, else `0`).
 */
export function UNITS_HasAnyGfxStateFlag113c(m: Memory113c, pUnit: number): number {
  const u = pUnit >>> 0
  if (u === 0) return 0
  const pStatListEx = m.get(u, D2UnitStrc.pStatListEx)
  if (pStatListEx === 0) return 0
  if ((m.get(pStatListEx, D2StatListStrc.dwFlags) | 0) >= 0) return 0
  const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
  const nStates = m.u32((dt + DATATABLES_OFF_113C.nStatesTxtRecordCount) >>> 0) | 0
  const pStateFlags = m.get(pStatListEx, D2StatListExStrc.pStateFlags)
  const plus31 = (nStates + 31) | 0
  const bias = (plus31 >> 31) & 0x1f
  const nDwords = ((plus31 + bias) | 0) >> 5
  const pGfxFlags = (pStateFlags + (nDwords << 2)) >>> 0
  if (pGfxFlags === 0 || nDwords <= 0) return 0
  for (let i = 0; i < nDwords; i++) {
    if (m.u32((pGfxFlags + i * 4) >>> 0) !== 0) return 1
  }
  return 0
}

/**
 * `@va D2Common:0x6FD84390` (`D2Common.#10960` `UNITS_ClearGfxStateFlags`,
 * stdcall `[esp+4] = pUnit`, `ret 4`, void).
 */
export function UNITS_ClearGfxStateFlags113c(m: Memory113c, pUnit: number): void {
  const u = pUnit >>> 0
  if (u === 0) return
  const pStatListEx = m.get(u, D2UnitStrc.pStatListEx)
  if (pStatListEx === 0) return
  if ((m.get(pStatListEx, D2StatListStrc.dwFlags) | 0) >= 0) return
  const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
  const nStates = m.u32((dt + DATATABLES_OFF_113C.nStatesTxtRecordCount) >>> 0) | 0
  const plus31 = (nStates + 31) | 0
  const bias = (plus31 >> 31) & 0x1f
  const nDwords = ((plus31 + bias) | 0) >> 5
  const pStateFlags = m.get(pStatListEx, D2StatListExStrc.pStateFlags)
  const nBytes = (nDwords << 2) >>> 0
  const pGfxFlags = (pStateFlags + nBytes) >>> 0
  if (pGfxFlags === 0) return
  const dwordCount = nBytes >>> 2
  for (let i = 0; i < dwordCount; i++) {
    m.setU32((pGfxFlags + i * 4) >>> 0, 0)
  }
}

const PLAYER_MODE_SWITCH_TABLE_VA_113C = 0x6fddc5f8
const MONSTER_MODE_SWITCH_TABLE_LOW_VA_113C = 0x6fddc788
const MONSTER_MODE_SWITCH_TABLE_HIGH_VA_113C = 0x6fddc8c8
const SGPT_OBJECTS_TXT_PTR_VA_113C = 0x6fdf0b94
const SGPT_OBJECTS_TXT_COUNT_VA_113C = 0x6fdf0b98

/**
 * `@va D2Common:0x6FD7EDA0` (`D2Common.#11020` `UNITS_IsDoor`, 64 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4` -> `number`).
 */
export function UNITS_IsDoor113c(m: Memory113c, pUnit: number): number {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xe10)
  }
  if (m.get(pUnit, D2UnitStrc.dwUnitType) !== 2) {
    return 0
  }
  const pObjectData = m.get(pUnit, D2UnitStrc.pUnitData)
  const pObjectTxt = m.get(pObjectData, D2ObjectDataStrc.pObjectTxt)
  return m.get(pObjectTxt, D2ObjectsTxt.nOperateFn)
}

/**
 * `@va D2Common:0x6FD7EEC0` (`D2Common.#10569` `UNITS_GetShiftedFrameMetrics`, 102 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pOutFrame`, `[esp+0xC] = pOutFrameCount`, `ret 0xC`, void).
 */
export function UNITS_GetShiftedFrameMetrics113c(
  m: Memory113c,
  pUnit: number,
  pOutFrame: number,
  pOutFrameCount: number,
): void {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xd8f)
  }
  const dwUnitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  const nFrame = sar32(m.get(pUnit, D2UnitStrc.dwFramePrecise) | 0, 8)
  if (dwUnitType === 2) {
    m.setU32(pOutFrame >>> 0, nFrame >>> 0)
    const pObjectData = m.get(pUnit, D2UnitStrc.pUnitData)
    const nMode = m.get(pUnit, D2UnitStrc.dwAnimMode) | 0
    const pObjectTxt = m.get(pObjectData, D2ObjectDataStrc.pObjectTxt)
    const dwFrameCnt = m.u32(
      (pObjectTxt + D2ObjectsTxt.dwFrameCnt.off + imul32(nMode, 4)) >>> 0,
    )
    m.setU32(pOutFrameCount >>> 0, dwFrameCnt >>> 0)
  } else {
    m.setU32(pOutFrame >>> 0, nFrame >>> 0)
    const nFrameCount = sar32(m.get(pUnit, D2UnitStrc.dwFrameCountPrecise) | 0, 8)
    m.setU32(pOutFrameCount >>> 0, nFrameCount >>> 0)
  }
}

/**
 * `@va D2Common:0x6FD7EF30` (`D2Common.#10426` `UNITS_HasAnimFinished`, 87 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4` -> `1` or `0`).
 */
export function UNITS_HasAnimFinished113c(m: Memory113c, pUnit: number): number {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xd81)
  }
  const pAnimSeq = m.get(pUnit, D2UnitStrc.pAnimSeq)
  if (pAnimSeq !== 0) {
    const nFrameCountPrecise = m.get(pUnit, D2UnitStrc.dwFrameCountPrecise) | 0
    return nFrameCountPrecise <= 0 ? 1 : 0
  }
  const wAnimSpeed = (m.get(pUnit, D2UnitStrc.wAnimSpeed) << 16) >> 16
  const nFramePrecise = m.get(pUnit, D2UnitStrc.dwFramePrecise) | 0
  const nFrameCountPrecise = m.get(pUnit, D2UnitStrc.dwFrameCountPrecise) | 0
  return ((wAnimSpeed + nFramePrecise) | 0) >= nFrameCountPrecise ? 1 : 0
}

/**
 * `@va D2Common:0x6FD7F0C0` (`D2Common.#10542` `UNITS_SetSeqFrameFromLowByte`, 63 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = nFrame`, `ret 0x8`, void).
 */
export function UNITS_SetSeqFrameFromLowByte113c(
  m: Memory113c,
  pUnit: number,
  nFrame: number,
): void {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xace)
  }
  const lowByte = m.get(pUnit, D2UnitStrc.dwSeqFramePrecise) & 0xff
  m.set(pUnit, D2UnitStrc.dwSeqFramePrecise, (lowByte + (nFrame << 8)) >>> 0)
}

/**
 * `@va D2Common:0x6FD7F3E0` (`D2Common.#10234` `UNITS_FreeStaticPath`, 34 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4`, void).
 */
export function UNITS_FreeStaticPath113c(m: Memory113c, pUnit: number): void {
  const pStaticPath = m.get(pUnit, D2UnitStrc.pPath)
  if (pStaticPath !== 0) {
    m.get(pUnit, D2UnitStrc.pMemPool)
    ;(m as { free?: (p: number) => void }).free?.(pStaticPath)
  }
}

/**
 * `@va D2Common:0x6FD7F410` (`D2Common.#10445` `UNITS_AllocStaticPath`, 69 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4`, void).
 */
export function UNITS_AllocStaticPath113c(m: Memory113c, pUnit: number): void {
  const existing = m.get(pUnit, D2UnitStrc.pPath)
  if (existing === 0) {
    m.get(pUnit, D2UnitStrc.pMemPool)
    const pStaticPath = m.alloc(0x20)
    m.set(pUnit, D2UnitStrc.pPath, pStaticPath >>> 0)
    if (pStaticPath !== 0) {
      for (let i = 0; i < 0x20; i += 4) {
        m.setU32((pStaticPath + i) >>> 0, 0)
      }
    }
  }
}

/**
 * `@va D2Common:0x6FD7F460` (`D2Common.#10829` `UNITS_GetInteractItemGuid`, 74 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4` -> `number`).
 */
export function UNITS_GetInteractItemGuid113c(m: Memory113c, pUnit: number): number {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xfb4)
  }
  if (m.get(pUnit, D2UnitStrc.dwUnitType) !== 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xfb6)
  }
  const pPlayerData = m.get(pUnit, D2UnitStrc.pUnitData)
  if (pPlayerData === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x14d7)
  }
  return m.get(pPlayerData, D2PlayerDataStrc.dwInteractItemGuid)
}

/**
 * `@va D2Common:0x6FD7F4B0` (`D2Common.#11055` `UNITS_SetInteractItem`, 97 bytes,
 * stdcall `[esp+4] = pPlayer`, `[esp+8] = pItem`, `ret 0x8`, void).
 */
export function UNITS_SetInteractItem113c(
  m: Memory113c,
  pPlayer: number,
  pItem: number,
): void {
  if (pPlayer >>> 0 === 0 || m.get(pPlayer, D2UnitStrc.dwUnitType) !== 0) {
    return
  }
  const pPlayerData = m.get(pPlayer, D2UnitStrc.pUnitData)
  if (pPlayerData === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x14c5)
  }
  if (pItem >>> 0 === 0) {
    m.set(pPlayerData, D2PlayerDataStrc.dwInteractItemGuid, 0)
    return
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== 4) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x14c9)
  }
  m.set(
    pPlayerData,
    D2PlayerDataStrc.dwInteractItemGuid,
    m.get(pItem, D2UnitStrc.dwUnitId),
  )
}

/**
 * `@va D2Common:0x6FD7F5C0` (`D2Common.#10756` `UNITS_GetPlayerSubtargetLeft`, 102 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pOutType`, `[esp+0xC] = pOutGuid`, `ret 0xC`, void).
 */
export function UNITS_GetPlayerSubtargetLeft113c(
  m: Memory113c,
  pUnit: number,
  pOutType: number,
  pOutGuid: number,
): void {
  if (pUnit >>> 0 === 0 || m.get(pUnit, D2UnitStrc.dwUnitType) !== 0) {
    m.setU32(pOutType >>> 0, 0)
    m.setU32(pOutGuid >>> 0, 0xffffffff)
    return
  }
  const pPlayerData = m.get(pUnit, D2UnitStrc.pUnitData)
  if (pPlayerData === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x1499)
  }
  m.setU32(pOutType >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwLeftSubtargetType))
  m.setU32(pOutGuid >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwLeftSubtargetGuid))
}

/**
 * `@va D2Common:0x6FD7F630` (`D2Common.#10878` `UNITS_GetPlayerSubtargetRight`, 102 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pOutType`, `[esp+0xC] = pOutGuid`, `ret 0xC`, void).
 */
export function UNITS_GetPlayerSubtargetRight113c(
  m: Memory113c,
  pUnit: number,
  pOutType: number,
  pOutGuid: number,
): void {
  if (pUnit >>> 0 === 0 || m.get(pUnit, D2UnitStrc.dwUnitType) !== 0) {
    m.setU32(pOutType >>> 0, 0)
    m.setU32(pOutGuid >>> 0, 0xffffffff)
    return
  }
  const pPlayerData = m.get(pUnit, D2UnitStrc.pUnitData)
  if (pPlayerData === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x1487)
  }
  m.setU32(pOutType >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwRightSubtargetType))
  m.setU32(pOutGuid >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwRightSubtargetGuid))
}

/**
 * `@va D2Common:0x6FD7F6A0` (`D2Common.#10265` `UNITS_PopPlayerSubtargetRight`, 123 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pOutType`, `[esp+0xC] = pOutGuid`, `ret 0xC`, void).
 */
export function UNITS_PopPlayerSubtargetRight113c(
  m: Memory113c,
  pUnit: number,
  pOutType: number,
  pOutGuid: number,
): void {
  if (pUnit >>> 0 === 0 || m.get(pUnit, D2UnitStrc.dwUnitType) !== 0) {
    m.setU32(pOutType >>> 0, 0)
    m.setU32(pOutGuid >>> 0, 0xffffffff)
    return
  }
  const pPlayerData = m.get(pUnit, D2UnitStrc.pUnitData)
  if (pPlayerData === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x1470)
  }
  m.setU32(pOutType >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwRightSubtargetType))
  m.setU32(pOutGuid >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwRightSubtargetGuid))
  m.set(pPlayerData, D2PlayerDataStrc.dwRightTargetVal, 0)
  m.set(pPlayerData, D2PlayerDataStrc.dwRightTargetGuid, 0xffffffff)
  m.set(pPlayerData, D2PlayerDataStrc.dwInteractItemGuid, 0xffffffff)
  m.set(pPlayerData, D2PlayerDataStrc.dwInteractType, 0)
}

/**
 * `@va D2Common:0x6FD7F720` (`D2Common.#10472` `UNITS_PopPlayerSubtargetLeft`, 123 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pOutType`, `[esp+0xC] = pOutGuid`, `ret 0xC`, void).
 */
export function UNITS_PopPlayerSubtargetLeft113c(
  m: Memory113c,
  pUnit: number,
  pOutType: number,
  pOutGuid: number,
): void {
  if (pUnit >>> 0 === 0 || m.get(pUnit, D2UnitStrc.dwUnitType) !== 0) {
    m.setU32(pOutType >>> 0, 0)
    m.setU32(pOutGuid >>> 0, 0xffffffff)
    return
  }
  const pPlayerData = m.get(pUnit, D2UnitStrc.pUnitData)
  if (pPlayerData === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x145a)
  }
  m.setU32(pOutType >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwLeftSubtargetType))
  m.setU32(pOutGuid >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwLeftSubtargetGuid))
  m.set(pPlayerData, D2PlayerDataStrc.dwLeftTargetVal, 0)
  m.set(pPlayerData, D2PlayerDataStrc.dwLeftTargetGuid, 0xffffffff)
  m.set(pPlayerData, D2PlayerDataStrc.dwInteractItemGuid, 0xffffffff)
  m.set(pPlayerData, D2PlayerDataStrc.dwInteractType, 0)
}

/**
 * `@va D2Common:0x6FD7F7A0` (`D2Common.#10289` `UNITS_GetPlayerTargetRight`, 96 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pOutVal`, `[esp+0xC] = pOutGuid`, `ret 0xC`, void).
 */
export function UNITS_GetPlayerTargetRight113c(
  m: Memory113c,
  pUnit: number,
  pOutVal: number,
  pOutGuid: number,
): void {
  if (pUnit >>> 0 === 0 || m.get(pUnit, D2UnitStrc.dwUnitType) !== 0) {
    m.setU32(pOutVal >>> 0, 0)
    m.setU32(pOutGuid >>> 0, 0xffffffff)
    return
  }
  const pPlayerData = m.get(pUnit, D2UnitStrc.pUnitData)
  if (pPlayerData === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x1449)
  }
  m.setU32(pOutVal >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwRightTargetVal))
  m.setU32(pOutGuid >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwRightTargetGuid))
}

/**
 * `@va D2Common:0x6FD7F800` (`D2Common.#10180` `UNITS_GetPlayerTargetLeft`, 96 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pOutVal`, `[esp+0xC] = pOutGuid`, `ret 0xC`, void).
 */
export function UNITS_GetPlayerTargetLeft113c(
  m: Memory113c,
  pUnit: number,
  pOutVal: number,
  pOutGuid: number,
): void {
  if (pUnit >>> 0 === 0 || m.get(pUnit, D2UnitStrc.dwUnitType) !== 0) {
    m.setU32(pOutVal >>> 0, 0)
    m.setU32(pOutGuid >>> 0, 0xffffffff)
    return
  }
  const pPlayerData = m.get(pUnit, D2UnitStrc.pUnitData)
  if (pPlayerData === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x1438)
  }
  m.setU32(pOutVal >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwLeftTargetVal))
  m.setU32(pOutGuid >>> 0, m.get(pPlayerData, D2PlayerDataStrc.dwLeftTargetGuid))
}

/**
 * `@va D2Common:0x6FD7F9B0` (`D2Common.#10009` `UNITS_SetOwner`, 112 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pOwner`, `ret 0x8`, void).
 */
export function UNITS_SetOwner113c(m: Memory113c, pUnit: number, pOwner: number): void {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xee7)
  }
  if (pOwner >>> 0 !== 0) {
    m.set(pUnit, D2UnitStrc.dwOwnerType, m.get(pOwner, D2UnitStrc.dwUnitType))
    m.set(pUnit, D2UnitStrc.dwOwnerId, m.get(pOwner, D2UnitStrc.dwUnitId))
    const dwFlags2 = m.get(pUnit, D2UnitStrc.dwFlags2)
    m.set(pUnit, D2UnitStrc.dwFlags2, (dwFlags2 | 0x20000) >>> 0)
  } else {
    const dwFlags2 = m.get(pUnit, D2UnitStrc.dwFlags2)
    m.set(pUnit, D2UnitStrc.dwOwnerType, 0)
    m.set(pUnit, D2UnitStrc.dwOwnerId, 0)
    m.set(pUnit, D2UnitStrc.dwFlags2, (dwFlags2 & 0xfffdffff) >>> 0)
  }
}

/**
 * `@va D2Common:0x6FD7FC50` (`D2Common.#10067` `UNITS_SetPathRoomRefreshFlag`, 106 bytes,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = bSet`, `ret 0x8`, void).
 */
export function UNITS_SetPathRoomRefreshFlag113c(
  m: Memory113c,
  pUnit: number,
  bSet: number,
): void {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x9fe)
  }
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType) | 0
  if (unitType === 2 || (unitType > 3 && unitType <= 5)) {
    const pStaticPath = m.get(pUnit, D2UnitStrc.pPath)
    m.setU8((pStaticPath + 0x1d) >>> 0, bSet !== 0 ? 1 : 0)
  } else {
    const pDynamicPath = m.get(pUnit, D2UnitStrc.pPath)
    const dwFlags = m.get(pDynamicPath, D2DynamicPathStrc.dwFlags)
    m.set(
      pDynamicPath,
      D2DynamicPathStrc.dwFlags,
      (bSet !== 0 ? dwFlags | 2 : dwFlags & ~2) >>> 0,
    )
  }
}

/**
 * `@va D2Common:0x6FD7FCC0` (`D2Common.#10596` `UNITS_GetPathRoomRefreshFlag`, 73 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4` -> `number`).
 */
export function UNITS_GetPathRoomRefreshFlag113c(m: Memory113c, pUnit: number): number {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x9ec)
  }
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  if (unitType === 2 || unitType === 4) {
    const pStaticPath = m.get(pUnit, D2UnitStrc.pPath)
    return m.u8((pStaticPath + 0x1d) >>> 0)
  }
  const pDynamicPath = m.get(pUnit, D2UnitStrc.pPath)
  return (m.get(pDynamicPath, D2DynamicPathStrc.dwFlags) & 2) >>> 0
}

/**
 * `@va D2Common:0x6FD7FE70` (`D2Common.#10481` `UNITS_ClearRoom`, 85 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4`, void).
 */
export function UNITS_ClearRoom113c(m: Memory113c, pUnit: number): void {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x87d)
  }
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType) | 0
  if (unitType === 2 || (unitType > 3 && unitType <= 5)) {
    const pStaticPath = m.get(pUnit, D2UnitStrc.pPath)
    m.setU32(pStaticPath >>> 0, 0)
  } else {
    const pDynamicPath = m.get(pUnit, D2UnitStrc.pPath)
    if (pDynamicPath !== 0) {
      m.set(pDynamicPath, D2DynamicPathStrc.pRoom, 0)
    }
  }
}

/**
 * `@va D2Common:0x6FD7FF30` (`D2Common.#10997` `UNITS_GetCollisionMask`, 168 bytes,
 * fastcall `ecx = pUnit`, `ret` -> `number`).
 */
export function UNITS_GetCollisionMask113c(m: Memory113c, pUnit: number): number {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x80e)
  }
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  if (unitType === 2) {
    const pObjectData = m.get(pUnit, D2UnitStrc.pUnitData)
    const pObjectTxt = m.get(pObjectData, D2ObjectDataStrc.pObjectTxt)
    if (m.get(pObjectTxt, D2ObjectsTxt.nOperateFn) !== 0) {
      if (m.get(pObjectTxt, D2ObjectsTxt.bBlocksVis) !== 0) {
        return 0x806
      }
      return m.get(pObjectTxt, D2ObjectsTxt.bBlocksLight) !== 0 ? 0x804 : 0x400
    }
    if ((m.get(pObjectTxt, D2ObjectsTxt.nSubClass) & 4) !== 0) {
      return 0x8000
    }
    return m.get(pObjectTxt, D2ObjectsTxt.bBlocksLight) !== 0 ? 0x404 : 0x400
  }
  if (unitType === 4) {
    return 0x200
  }
  if (unitType === 5) {
    return 0x1
  }
  const pDynamicPath = m.get(pUnit, D2UnitStrc.pPath)
  if (pDynamicPath === 0) {
    return 0xffff
  }
  return m.get(pDynamicPath, D2DynamicPathStrc.nFootprintCollisionMask)
}

/**
 * `@va D2Common:0x6FD80C70` (internal LTCG `UNITS_CanSwitchToModeDuringAnim`, 222 bytes,
 * custom LTCG `edx = dwUnitType`, `ecx = nMode`, `esi = dwClassId`, `[esp+4] = pUnit`, `ret 0x4` -> `number`).
 */
export function UNITS_CanSwitchToModeDuringAnim113c(
  m: Memory113c,
  dwUnitType: number,
  nMode: number,
  dwClassId: number,
  pUnit: number,
): number {
  let pEntry = 0
  if (dwUnitType === 0) {
    pEntry = (PLAYER_MODE_SWITCH_TABLE_VA_113C + imul32(nMode | 0, 20)) >>> 0
  } else if (dwUnitType === 1) {
    const classId = dwClassId | 0
    if (classId >= 0) {
      const sgpt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
      if (classId < (m.u32((sgpt + DATATABLES_OFF_113C.nMonStatsTxtRecordCount) >>> 0) | 0)) {
        const pMonStats =
          (m.u32((sgpt + DATATABLES_OFF_113C.pMonStatsTxt) >>> 0) +
            imul32(classId, D2MonStatsTxt_SIZE)) >>>
          0
        if (pMonStats !== 0) {
          const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
          const flagBit = m.get(pMonStats, D2MonStatsTxt.nBitField2) & m.u32(pBitMasks)
          if (flagBit !== 0) {
            return nMode === 2 || nMode === 15 ? 1 : 0
          }
        }
      }
    }
    const tableBase =
      classId < 0x19a ? MONSTER_MODE_SWITCH_TABLE_LOW_VA_113C : MONSTER_MODE_SWITCH_TABLE_HIGH_VA_113C
    pEntry = (tableBase + imul32(nMode | 0, 20)) >>> 0
  } else {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xbd2)
  }

  if (m.u32((pEntry + 0x04) >>> 0) !== 0) {
    return 1
  }
  if (m.u32(pEntry) === 0) {
    return 0
  }
  const pSkill = SKILLS_GetUsedSkill113c(m, pUnit)
  if (pSkill === 0) {
    return 0
  }
  const dwSkillFlags = m.u32((pSkill + 0x0c) >>> 0)
  if ((dwSkillFlags & 0x01) === 0) {
    return 0
  }
  return (dwSkillFlags & 0x1000) === 0 ? 1 : 0
}

/**
 * `@va D2Common:0x6FD81EA0` (`D2Common.#10621` `UNITS_GetPlayerBaseToHit`, 236 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4` -> `number`).
 */
export function UNITS_GetPlayerBaseToHit113c(m: Memory113c, pUnit: number): number {
  if (pUnit >>> 0 === 0 || m.get(pUnit, D2UnitStrc.dwUnitType) !== 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x107f)
  }
  const pStatListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  const sgpt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
  let nToHit = 0
  if (
    pStatListEx !== 0 &&
    (m.u32((sgpt + DATATABLES_OFF_113C.nItemStatCostTxtRecordCount) >>> 0) | 0) > 0x13
  ) {
    const pIsc19 = (m.u32((sgpt + DATATABLES_OFF_113C.pItemStatCostTxt) >>> 0) + 0x180c) >>> 0
    if (pIsc19 !== 0) {
      nToHit = STATLIST_GetUnitStat113c(m, pUnit, 0x13, 0) | 0
    }
  }
  let nDex = 0
  if (
    pStatListEx !== 0 &&
    (m.u32((sgpt + DATATABLES_OFF_113C.nItemStatCostTxtRecordCount) >>> 0) | 0) > 2
  ) {
    const pIsc2 = (m.u32((sgpt + DATATABLES_OFF_113C.pItemStatCostTxt) >>> 0) + 0x288) >>> 0
    if (pIsc2 !== 0) {
      nDex = STATLIST_GetUnitStat113c(m, pUnit, 2, 0) | 0
    }
  }
  const base = (nToHit + imul32(nDex, 5) - 35) | 0
  const nClassId = m.get(pUnit, D2UnitStrc.dwClassId) | 0
  if (
    nClassId >= 0 &&
    nClassId < (m.u32((sgpt + DATATABLES_OFF_113C.nCharStatsTxtRecordCount) >>> 0) | 0)
  ) {
    const pCharStats =
      (m.u32((sgpt + DATATABLES_OFF_113C.pCharStatsTxt) >>> 0) +
        imul32(nClassId, D2CharStatsTxt_SIZE)) >>>
      0
    if (pCharStats !== 0) {
      return ((m.get(pCharStats, D2CharStatsTxt.nToHitFactor) | 0) + base) >>> 0
    }
  }
  return base >>> 0
}

/**
 * `@va D2Common:0x6FD842D0` (`D2Common.#10315` `UNITS_GetGfxStateFlagsPtr`, 90 bytes,
 * stdcall `[esp+4] = pUnit`, `ret 0x4` -> `number`).
 */
export function UNITS_GetGfxStateFlagsPtr113c(m: Memory113c, pUnit: number): number {
  if (pUnit >>> 0 === 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0x99)
  }
  const pStatListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pStatListEx === 0) {
    return 0
  }
  const dwFlags = m.get(pStatListEx, D2StatListExStrc.dwFlags) | 0
  if (dwFlags >= 0) {
    return 0
  }
  const sgpt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
  const nStates = m.u32((sgpt + DATATABLES_OFF_113C.nStatesTxtRecordCount) >>> 0)
  const pStateFlags = m.get(pStatListEx, D2StatListExStrc.pStateFlags)
  const nDwords = ((nStates + 0x1f) >>> 0) >>> 5
  return (pStateFlags + (nDwords << 2)) >>> 0
}

/**
 * `@va D2Common:0x6FD8E980` (`D2Common.#10688` `DATATBLS_GetObjectsTxtRecord`, 71 bytes,
 * stdcall `[esp+4] = nObjectId`, `ret 0x4` -> `D2ObjectsTxt*`).
 */
export function DATATBLS_GetObjectsTxtRecord113c(m: Memory113c, nObjectId: number): number {
  const id = nObjectId | 0
  const count = m.u32(SGPT_OBJECTS_TXT_COUNT_VA_113C) | 0
  if (id >= count) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xdd)
  }
  if (id < 0) {
    throw new D2CommonAssertError(UNITS_CPP_FILE_113C, 0xde)
  }
  const pObjectsTxt = m.u32(SGPT_OBJECTS_TXT_PTR_VA_113C)
  return (pObjectsTxt + imul32(id, 0x1c0)) >>> 0
}
