/**
 * Diablo II v1.13c `D2GameStrc` initialization, game PRNG seed, and `SUNIT` unit hash tables.
 *
 * Binary evidence (`D2Game.dll`, image base `0x6FC20000`, `kb/stats/d2common-statlist-struct-113c.md` §2):
 * - `GAME_Create` (`0x6FC4A900`): allocates `0x1D28` (7,464) bytes; initializes `seedLo` (`+0xD0`) /
 *   `seedHi` (`+0xD4` = `0x0000029A` = `666` default carry in `SEED_InitGameSeed`), `nDifficulty` (`+0x6D`).
 * - `SUNIT_GetNewUnitId` (`0x6FCFF9C0`, `edx = pGame`, `ecx = dwUnitType`):
 *   increments `pGame->dwLastUnitId[dwUnitType]` (`+0x90 + type*4`); wraps `-1` (`0xFFFFFFFF`) to `1`.
 * - `0x6FD1B014` server unit hash offset table:
 *   - `0` (player):  `+0x1120` (128 buckets, `dwUnitId & 0x7F`)
 *   - `1` (monster): `+0x1320` (128 buckets, `dwUnitId & 0x7F`)
 *   - `2` (object):  `+0x1520` (128 buckets, `dwUnitId & 0x7F`)
 *   - `3` (missile): `+0x1920` (128 buckets, `dwUnitId & 0x7F`)  <-- swapped with item in D2Game!
 *   - `4` (item):    `+0x1720` (128 buckets, `dwUnitId & 0x7F`)  <-- swapped with missile in D2Game!
 *   - `5` (tile):    `+0x1B20` (1 single list head, NOT bucketed by `& 0x7F`!)
 * - `SUNIT_InsertServerUnit` (`0x6FD00310`): inserts along `pUnit + 0xE4` (`pGameHashNext`) in
 *   strictly descending `dwUnitId` order (`cmp [eax+0x0C], edi; jbe insert`).
 * - `SUNIT_GetServerUnit` (`0x6FD003A0`) / `SUNIT_RemoveServerUnit` (`0x6FD002A0`).
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import { D2GameStrc, D2GameStrc_SIZE, D2UnitStrc } from '../mem/layout.generated.ts'
import { seedNext, seedRoll, type D2SeedStrc } from '../prng.ts'
import { EVENT_InitTimerQueue113c } from './timer-wheel.ts'

/** `D2Game 0x6FD1B014[unitType]` byte offset from `pGame`. */
export const SUNIT_HASH_OFFSET_BY_TYPE_113C: readonly number[] = [
  0x1120, // 0: UNIT_PLAYER
  0x1320, // 1: UNIT_MONSTER
  0x1520, // 2: UNIT_OBJECT
  0x1920, // 3: UNIT_MISSILE
  0x1720, // 4: UNIT_ITEM
  0x1b20, // 5: UNIT_TILE (single list head)
]

export interface CreateGameOptions113c {
  readonly initSeed?: number
  readonly seedHi?: number
  readonly difficulty?: number
  readonly expansion?: boolean
  readonly initTimerQueue?: boolean
}

export function GAME_Create113c(m: Memory113c, opts: CreateGameOptions113c = {}): number {
  const pGame = m.alloc(D2GameStrc_SIZE)
  const seedLo = (opts.initSeed ?? 1) >>> 0
  const seedHi = (opts.seedHi ?? 666) >>> 0
  m.set(pGame, D2GameStrc.nDifficulty, (opts.difficulty ?? 0) & 0xff)
  m.set(pGame, D2GameStrc.bExpansion, (opts.expansion ?? true) ? 1 : 0)
  m.set(pGame, D2GameStrc.dwInitSeed, seedLo)
  m.set(pGame, D2GameStrc.seedLo, seedLo)
  m.set(pGame, D2GameStrc.seedHi, seedHi)
  if (opts.initTimerQueue !== false) {
    EVENT_InitTimerQueue113c(m, pGame)
  }
  return pGame
}

/** Advance `pGame`'s embedded `D2SeedStrc` (`+0xD0 / +0xD4`) by one LCG step (`SEED_Next`). */
export function GAME_SeedNext113c(m: Memory113c, pGame: number): number {
  const s: D2SeedStrc = {
    lo: m.get(pGame, D2GameStrc.seedLo),
    hi: m.get(pGame, D2GameStrc.seedHi),
  }
  const ret = seedNext(s)
  m.set(pGame, D2GameStrc.seedLo, s.lo)
  m.set(pGame, D2GameStrc.seedHi, s.hi)
  return ret
}

/** Roll `[0, nMax)` on `pGame`'s embedded `D2SeedStrc` (`+0xD0 / +0xD4`). */
export function GAME_SeedRoll113c(m: Memory113c, pGame: number, nMax: number): number {
  const s: D2SeedStrc = {
    lo: m.get(pGame, D2GameStrc.seedLo),
    hi: m.get(pGame, D2GameStrc.seedHi),
  }
  const ret = seedRoll(s, nMax)
  m.set(pGame, D2GameStrc.seedLo, s.lo)
  m.set(pGame, D2GameStrc.seedHi, s.hi)
  return ret
}

/** `D2Game 0x6FCFF9C0` (`SUNIT_GetNewUnitId`, `edx = pGame`, `ecx = dwUnitType`). */
export function SUNIT_GetNewUnitId113c(m: Memory113c, pGame: number, unitType: number): number {
  if ((unitType >>> 0) >= 6) return 0xffffffff
  let next = (m.get(pGame, D2GameStrc.dwLastUnitId, unitType) + 1) >>> 0
  if (next === 0xffffffff) {
    next = 1
  }
  m.set(pGame, D2GameStrc.dwLastUnitId, next, unitType)
  return next
}

function hashHeadAddr(pGame: number, unitType: number, unitId: number): number {
  const baseOff = SUNIT_HASH_OFFSET_BY_TYPE_113C[unitType]
  if (baseOff === undefined) return 0
  if (unitType === 5) return (pGame + baseOff) >>> 0
  return (pGame + baseOff + ((unitId & 0x7f) << 2)) >>> 0
}

/**
 * `D2Game 0x6FD00310` (`SUNIT_InsertServerUnit`, `edx = pGame`, `esi = pUnit`).
 * Keeps bucket chain sorted in descending `dwUnitId` (`cmp [eax + 0x0C], edi; jbe`).
 */
export function SUNIT_InsertServerUnit113c(m: Memory113c, pGame: number, pUnit: number): void {
  if (pGame === 0 || pUnit === 0) return
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  if ((unitType >>> 0) >= 6) return
  const unitId = m.get(pUnit, D2UnitStrc.dwUnitId) >>> 0
  const headAddr = hashHeadAddr(pGame, unitType, unitId)
  if (headAddr === 0) return

  let prev = 0
  let cur = m.u32(headAddr)
  while (cur !== 0 && (m.get(cur, D2UnitStrc.dwUnitId) >>> 0) > unitId) {
    prev = cur
    cur = m.get(cur, D2UnitStrc.pGameHashNext)
  }
  m.set(pUnit, D2UnitStrc.pGameHashNext, cur)
  if (prev === 0) {
    m.setU32(headAddr, pUnit)
  } else {
    m.set(prev, D2UnitStrc.pGameHashNext, pUnit)
  }
}

/** `D2Game 0x6FD003A0` (`SUNIT_GetServerUnit`, `ecx = pGame`, `eax = dwUnitType`, `edx = dwUnitId`). */
export function SUNIT_GetServerUnit113c(
  m: Memory113c,
  pGame: number,
  unitType: number,
  unitId: number,
): number {
  if (pGame === 0 || (unitType >>> 0) >= 6) return 0
  const targetId = unitId >>> 0
  const headAddr = hashHeadAddr(pGame, unitType, targetId)
  if (headAddr === 0) return 0

  for (let cur = m.u32(headAddr); cur !== 0; cur = m.get(cur, D2UnitStrc.pGameHashNext)) {
    const id = m.get(cur, D2UnitStrc.dwUnitId) >>> 0
    if (id === targetId) return cur
    if (id < targetId) return 0 // bucket is sorted descending!
  }
  return 0
}

/** `D2Game 0x6FD002A0` (`SUNIT_RemoveServerUnit`, `edx = pGame`, `esi = pUnit`). */
export function SUNIT_RemoveServerUnit113c(m: Memory113c, pGame: number, pUnit: number): void {
  if (pGame === 0 || pUnit === 0) return
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  if ((unitType >>> 0) >= 6) return
  const unitId = m.get(pUnit, D2UnitStrc.dwUnitId) >>> 0
  const headAddr = hashHeadAddr(pGame, unitType, unitId)
  if (headAddr === 0) return

  let prev = 0
  let cur = m.u32(headAddr)
  while (cur !== 0 && cur !== pUnit) {
    prev = cur
    cur = m.get(cur, D2UnitStrc.pGameHashNext)
  }
  if (cur === pUnit) {
    const next = m.get(pUnit, D2UnitStrc.pGameHashNext)
    if (prev === 0) m.setU32(headAddr, next)
    else m.set(prev, D2UnitStrc.pGameHashNext, next)
    m.set(pUnit, D2UnitStrc.pGameHashNext, 0)
  }
}
