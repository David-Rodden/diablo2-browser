/**
 * Diablo II v1.13c `D2UnitStrc` & `D2ActiveRoomStrc` unit/room primitives.
 *
 * Binary evidence (`D2Common.dll`, image base `0x6FD50000`):
 * - `UNITS_AllocUnit` (`#11157` / `0x6FD849F0`): `D2UnitStrc` unified layout (`0x100` bytes in layout).
 * - `UNITS_GetX` (`0x6FD51050`, `ecx = pUnit`) / `UNITS_GetY` (`0x6FD51080`, `ecx = pUnit`):
 *   - `dwUnitType` in `{2, 4, 5}` (object, item, tile -> `D2StaticPathStrc` at `+0x2C`):
 *     X = `u32(pPath + 0x0C)`, Y = `u32(pPath + 0x10)`.
 *   - `dwUnitType` in `{0, 1, 3}` (player, monster, missile -> `D2DynamicPathStrc` at `+0x2C`):
 *     X = `u16(pPath + 0x02)` (`wPosX`), Y = `u16(pPath + 0x06)` (`wPosY`), or `0` if `pPath == 0`.
 * - `UNITROOM_RefreshUnit` (`#10158 0x6FDB65C0`): sets `unit.dwFlags |= 0x2000`, `*room.pActUpdateFlag = 1`,
 *   and head-inserts `unit` into `room.pUpdateList (+0x1C)` via `unit.pRoomUpdateNext (+0xE0)`.
 * - `UNITROOM_AddUnitToRoom` (`#10531 0x6FDB6800`): head-inserts `unit` into `room.pUnitFirst (+0x74)`
 *   via `unit.pRoomUnitNext (+0xE8)`, calls `UNITROOM_RefreshUnit`, increments `room.nPlayers (+0x28)` for players.
 * - `UNITROOM_RemoveUnitFromRoom` (`#11016 0x6FDB6700`): unlinks `unit` from `room.pUnitFirst (+0x74)`
 *   chain, decrements `room.nPlayers` for players, clears `unit.dwFlags &= ~0x2000`.
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import { D2ActiveRoomStrc, D2UnitStrc, D2UnitStrc_SIZE } from '../mem/layout.generated.ts'

export const UNIT_PLAYER = 0
export const UNIT_MONSTER = 1
export const UNIT_OBJECT = 2
export const UNIT_MISSILE = 3
export const UNIT_ITEM = 4
export const UNIT_TILE = 5

export const UNITFLAG_ISUPDATE = 0x00002000

const DYNPATH_SIZE = 0x40
const STATICPATH_SIZE = 0x20

export function UNITS_Create113c(
  m: Memory113c,
  unitType: number,
  classId: number,
  unitId: number,
  pGame = 0,
): number {
  const pUnit = m.alloc(D2UnitStrc_SIZE)
  m.set(pUnit, D2UnitStrc.dwUnitType, unitType >>> 0)
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

export function UNITS_GetRoom113c(m: Memory113c, pUnit: number): number {
  if (pUnit === 0) return 0
  const pPath = m.get(pUnit, D2UnitStrc.pPath)
  if (pPath === 0) return 0
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  const isStatic = unitType === UNIT_OBJECT || unitType === UNIT_ITEM || unitType === UNIT_TILE
  return isStatic ? m.u32(pPath + 0x00) : m.u32(pPath + 0x1c)
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
  if (pUnit === 0) return 0
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  const pPath = m.get(pUnit, D2UnitStrc.pPath)
  if (pPath === 0) return 0
  if (unitType === UNIT_OBJECT || unitType === UNIT_ITEM || unitType === UNIT_TILE) {
    return m.u32(pPath + 0x0c) | 0
  }
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

/** `D2Common.#10531` (`0x6FDB6800` `UNITROOM_AddUnitToRoom`). */
export function UNITROOM_AddUnitToRoom113c(m: Memory113c, pUnit: number, pRoom: number): void {
  if (pUnit === 0 || pRoom === 0) return
  UNITS_SetRoom113c(m, pUnit, pRoom)
  const prevFirst = m.get(pRoom, D2ActiveRoomStrc.pUnitFirst)
  m.set(pUnit, D2UnitStrc.pRoomUnitNext, prevFirst)
  m.set(pRoom, D2ActiveRoomStrc.pUnitFirst, pUnit)
  if (m.get(pUnit, D2UnitStrc.dwUnitType) === UNIT_PLAYER) {
    m.set(pRoom, D2ActiveRoomStrc.nPlayers, (m.get(pRoom, D2ActiveRoomStrc.nPlayers) + 1) >>> 0)
  }
  UNITROOM_RefreshUnit113c(m, pUnit)
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
    if (m.get(pUnit, D2UnitStrc.dwUnitType) === UNIT_PLAYER) {
      const n = m.get(pRoom, D2ActiveRoomStrc.nPlayers)
      if (n > 0) m.set(pRoom, D2ActiveRoomStrc.nPlayers, (n - 1) >>> 0)
    }
  }
  // Unlink from room update list if present (`0x6FDB6640`)
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
  UNITS_SetRoom113c(m, pUnit, 0)
}
