/**
 * Diablo II v1.13c `D2StatListStrc` (`0x3C` bytes), `D2StatListExStrc` (`0x64` bytes),
 * `EvalStatWithOps` (`0x6FD89530` `op 1..13`), and `STATES` bitvectors (`184` states).
 *
 * Binary evidence (`D2Common.dll`, image base `0x6FD50000`, `kb/stats/d2common-statlist-struct-113c.md`):
 * - `#11013` (`0x6FD88100`): `STATLIST_AllocStatList` (`0x3C` bytes)
 * - `#11166` (`0x6FD8AF00`): `STATLIST_AllocStatListEx` (`0x64` bytes + `48`-byte `pStateFlags`)
 * - `0x6FD88270` / `0x6FD882B0`: signed 32-bit binary search on `dwKey = (statId << 16) | (layer & 0xFFFF)`
 * - `0x6FD88640` / `0x6FD881A0`: `D2StatStrc` array growth (`+4`) and shrink (`-4` when `cap - count > 8`)
 * - `#10188` (`0x6FD8A7B0` -> `0x6FD8A280`): `STATLIST_SetBaseStat` (always removes `newValue == 0` from `BaseStats`)
 * - `#10887` (`0x6FD8A740`): `STATLIST_SetUnitStat`
 * - `#10973` (`0x6FD88B70` -> `0x6FD88A80`): `STATLIST_GetUnitStat` (with `fMin` floor clamp on player/monster)
 * - `#10587` (`0x6FD88C20` -> `0x6FD88B00`): `STATLIST_GetUnitBaseStat` (with `fMin` floor clamp on player/monster)
 * - `0x6FD89530`: `EvalStatWithOps` (`op 1..13` jump table at `0x6FD89AF0`)
 * - `#10494` (`0x6FD83CD0`): `STATES_CheckState` (`dwUnitType` in `{0, 1, 3}`, `0 <= stateId < 184`)
 * - `0x6FD88730`: `STATES_ToggleState` (active dwords `[0..5]` + dirty/gfx dwords `[6..11]`)
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import {
  D2StatListExStrc,
  D2StatListExStrc_SIZE,
  D2StatListStrc,
  D2StatListStrc_SIZE,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import { imul32, mulDiv113c, sar32, shl32 } from './int-math.ts'

export const STATLIST_FLAG_TIMED = 0x00000002
export const STATLIST_FLAG_SET = 0x00002000
export const STATLIST_FLAG_DYNAMIC_OP = 0x20000000
export const STATLIST_FLAG_MERGED = 0x40000000
export const STATLIST_FLAG_EXTENDED = 0x80000000

export const STATES_COUNT_113C = 184
export const STATE_DWORDS_113C = 6 // ceil(184 / 32) = 6 active dwords + 6 dirty/gfx dwords = 48 bytes

export interface StatOpEntry113c {
  readonly op: number // 1..13
  readonly opParam: number // shift parameter (`bOpParam`)
  readonly opBase: number // base stat ID (`wOpBase`, 0xFFFF if unused)
  readonly sourceStat: number // source stat ID (`wSourceStat`)
}

export interface ItemStatCostMeta113c {
  readonly statId: number
  readonly valShift?: number // `bValShift` (+0x18)
  readonly fMin?: boolean // `wFlags & 0x0400` (`byte +0x05 & 0x04`)
  readonly minAccr?: number // `dwMinAccr` (+0x2C, unshifted)
  readonly keepZero?: boolean // `bKeepZero` (+0x50)
  readonly op?: number // forward `bOp` (+0x54)
  readonly opParam?: number // forward `bOpParam` (+0x55)
  readonly opBase?: number // forward `wOpBase` (+0x56)
  readonly opStats?: readonly number[] // forward `wOpStat[0..2]` (+0x58..+0x5D)
  readonly evalByTime?: (pOwner: number, statVal: number) => number // optional `op 6/7` callback (`0x6FD893B0`)
}

export interface CharStatsGrowthMeta113c {
  readonly lifePerVitality: number // quarter-points (`CharStatsTxt + 0x46`, e.g. Barb=16 -> +4 HP/vit)
  readonly staminaPerVitality: number // quarter-points (`CharStatsTxt + 0x47`)
  readonly manaPerMagic: number // quarter-points (`CharStatsTxt + 0x48`)
}

const DEFAULT_CHAR_GROWTH_113C: readonly CharStatsGrowthMeta113c[] = [
  { lifePerVitality: 12, staminaPerVitality: 4, manaPerMagic: 6 }, // 0: Amazon (3, 1, 1.5)
  { lifePerVitality: 8, staminaPerVitality: 4, manaPerMagic: 8 }, // 1: Sorceress (2, 1, 2)
  { lifePerVitality: 8, staminaPerVitality: 4, manaPerMagic: 8 }, // 2: Necromancer (2, 1, 2)
  { lifePerVitality: 12, staminaPerVitality: 4, manaPerMagic: 6 }, // 3: Paladin (3, 1, 1.5)
  { lifePerVitality: 16, staminaPerVitality: 4, manaPerMagic: 4 }, // 4: Barbarian (4, 1, 1)
  { lifePerVitality: 8, staminaPerVitality: 4, manaPerMagic: 8 }, // 5: Druid (2, 1, 2)
  { lifePerVitality: 12, staminaPerVitality: 5, manaPerMagic: 7 }, // 6: Assassin (3, 1.25, 1.75)
]

export class StatTableRegistry113c {
  private readonly meta = new Map<number, ItemStatCostMeta113c>()
  private readonly reverseOps = new Map<number, StatOpEntry113c[]>()
  private readonly baseDeps = new Map<number, number[]>()
  private readonly charGrowth: readonly CharStatsGrowthMeta113c[]

  constructor(
    entries: readonly ItemStatCostMeta113c[] = CANONICAL_CORE_STATS_113C,
    charGrowth: readonly CharStatsGrowthMeta113c[] = DEFAULT_CHAR_GROWTH_113C,
  ) {
    this.charGrowth = charGrowth
    for (const e of entries) {
      this.register(e)
    }
  }

  register(entry: ItemStatCostMeta113c): void {
    this.meta.set(entry.statId, entry)
    const op = entry.op ?? 0
    if (op >= 1 && op <= 13) {
      // 0x6FDC3CE3..0x6FDC3D35: table[wOpBase].wBaseDepStats (+0x5E) stores `entry.statId` (NOT targetStat!)
      if (entry.opBase !== undefined && entry.opBase >= 0 && entry.opBase !== 0xffff) {
        let deps = this.baseDeps.get(entry.opBase)
        if (!deps) {
          deps = []
          this.baseDeps.set(entry.opBase, deps)
        }
        if (deps.length < 64 && !deps.includes(entry.statId)) {
          deps.push(entry.statId)
        }
      }
      if (entry.opStats) {
        for (const targetStat of entry.opStats) {
          if (targetStat < 0 || targetStat === 0xffff) continue
          let rev = this.reverseOps.get(targetStat)
          if (!rev) {
            rev = []
            this.reverseOps.set(targetStat, rev)
          }
          if (rev.length < 16) {
            rev.push({
              op,
              opParam: entry.opParam ?? 0,
              opBase: entry.opBase ?? 0xffff,
              sourceStat: entry.statId,
            })
          }
        }
      }
    }
  }

  get(statId: number): ItemStatCostMeta113c | undefined {
    return this.meta.get(statId)
  }

  getReverseOps(targetStatId: number): readonly StatOpEntry113c[] {
    return this.reverseOps.get(targetStatId) ?? []
  }

  /** `+0x5E..+0xDD` `wBaseDepStats[0..63]`: stats whose `wOpBase == baseStatId` (`0x6FDC3D06`). */
  getBaseDependents(baseStatId: number): readonly number[] {
    return this.baseDeps.get(baseStatId) ?? []
  }

  getDependents(changedStatId: number): readonly number[] {
    const entry = this.meta.get(changedStatId)
    const out: number[] = []
    if (entry?.opStats) {
      for (const t of entry.opStats) {
        if (t >= 0 && t !== 0xffff && !out.includes(t)) out.push(t)
      }
    }
    const bDeps = this.baseDeps.get(changedStatId)
    if (bDeps) {
      for (const t of bDeps) {
        if (!out.includes(t)) out.push(t)
      }
    }
    return out
  }

  getCharGrowth(classId: number): CharStatsGrowthMeta113c | undefined {
    return this.charGrowth[classId]
  }
}

/**
 * Core canonical 1.13c `ItemStatCost.txt` / `ItemStatCost.bin` (`Patch_D2.mpq`, 359 rows × `0x144` bytes)
 * definitions verified byte-for-byte against `ItemStatCost.bin`.
 */
export const CANONICAL_CORE_STATS_113C: readonly ItemStatCostMeta113c[] = [
  { statId: 0, fMin: true, minAccr: 1 }, // strength
  { statId: 1, fMin: true, minAccr: 1, op: 8, opBase: 0xffff, opStats: [9] }, // energy -> maxmana
  { statId: 2, fMin: true, minAccr: 1 }, // dexterity
  { statId: 3, fMin: true, minAccr: 1, op: 9, opBase: 0xffff, opStats: [7, 11] }, // vitality -> maxhp (7), maxstamina (11)
  { statId: 4 }, // statpts
  { statId: 5 }, // newskills
  { statId: 6, valShift: 8 }, // hitpoints (8.8 fixed, keepzero=0 in 1.13c ItemStatCost.bin)
  { statId: 7, valShift: 8, fMin: true, minAccr: 1 }, // maxhp (8.8 fixed, minAccr=1 -> 256 when present & < 1)
  { statId: 8, valShift: 8, keepZero: true }, // mana (8.8 fixed, keepzero=1)
  { statId: 9, valShift: 8, fMin: true, minAccr: 0 }, // maxmana (8.8 fixed, fMin=1, minAccr=0)
  { statId: 10, valShift: 8, keepZero: true }, // stamina (8.8 fixed, keepzero=1)
  { statId: 11, valShift: 8, fMin: true, minAccr: 0 }, // maxstamina (8.8 fixed, fMin=1, minAccr=0)
  { statId: 12 }, // level (fMin=0 in 1.13c ItemStatCost.bin)
  { statId: 13 }, // experience
  { statId: 16, op: 13, opStats: [31] }, // item_armor_percent -> armorclass (local item)
  { statId: 31 }, // armorclass
  { statId: 73 }, // maxdurability
  { statId: 75, op: 13, opStats: [73] }, // item_maxdurability_percent -> maxdurability
  { statId: 76, op: 11, opStats: [7] }, // item_maxhp_percent (op=11 in 1.13c ItemStatCost.bin) -> maxhp
  { statId: 77, op: 11, opStats: [9] }, // item_maxmana_percent (op=11 in 1.13c ItemStatCost.bin) -> maxmana
  { statId: 162, op: 1, opStats: [11] }, // skill_staminapercent (op=1) -> maxstamina
  { statId: 163, op: 1, opStats: [11] }, // skill_passive_staminapercent (op=1) -> maxstamina
  { statId: 214, op: 4, opParam: 3, opBase: 12, opStats: [31] }, // item_armor_perlevel
  { statId: 215, op: 5, opParam: 3, opBase: 12, opStats: [31] }, // item_armorpercent_perlevel
  { statId: 216, valShift: 8, op: 2, opParam: 3, opBase: 12, opStats: [7] }, // item_hp_perlevel
  { statId: 217, valShift: 8, op: 2, opParam: 3, opBase: 12, opStats: [9] }, // item_mana_perlevel
  { statId: 220, op: 2, opParam: 3, opBase: 12, opStats: [0] }, // item_strength_perlevel -> strength
  { statId: 221, op: 2, opParam: 3, opBase: 12, opStats: [2] }, // item_dexterity_perlevel -> dexterity
  { statId: 222, op: 2, opParam: 3, opBase: 12, opStats: [1] }, // item_energy_perlevel -> energy (chains op=8 -> maxmana)
  { statId: 223, op: 2, opParam: 3, opBase: 12, opStats: [3] }, // item_vitality_perlevel -> vitality (chains op=9 -> maxhp, maxstamina)
]

export const DEFAULT_STAT_REGISTRY_113C = new StatTableRegistry113c()

/** Pack `(statId, layer)` into 1.13c `D2StatStrc.dwKey` (`(statId << 16) | (layer & 0xFFFF)`). */
export function statKey113c(statId: number, layer = 0): number {
  return (((statId & 0xffff) << 16) | (layer & 0xffff)) | 0
}

/**
 * `D2Common 0x6FD882B0`: exact signed 32-bit binary search on a `D2StatsArrayStrc` (`pArrayHdr`: `+0 pStat`, `+4 wCount`, `+6 wCap`).
 * Returns index `>= 0` if found, `-1` if absent.
 */
export function STATLIST_FindStatIndex113c(m: Memory113c, pArrayHdr: number, dwKey: number): number {
  const count = (m.u16(pArrayHdr + 4) << 16) >> 16 // movsx ecx, word ptr [esi + 4]
  if (count <= 0) return -1
  const pStat = m.u32(pArrayHdr)
  const target = dwKey | 0
  let lo = 0
  let hi = count
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const curKey = m.u32(pStat + mid * 8) | 0
    if (target < curKey) {
      hi = mid
    } else if (target > curKey) {
      lo = mid + 1
    } else {
      return mid
    }
  }
  return -1
}

/** `D2Common 0x6FD88270`: lower-bound insertion index under signed 32-bit `dwKey` ordering. */
export function STATLIST_FindInsertPos113c(m: Memory113c, pArrayHdr: number, dwKey: number): number {
  const count = (m.u16(pArrayHdr + 4) << 16) >> 16
  if (count <= 0) return 0
  const pStat = m.u32(pArrayHdr)
  const target = dwKey | 0
  let lo = 0
  let hi = count
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const curKey = m.u32(pStat + mid * 8) | 0
    if (target <= curKey) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

/** `D2Common 0x6FD88640`: insert `dwKey` at `insertIdx` with initial value `0`, growing capacity in steps of `+4`. */
function insertStatSlot(m: Memory113c, pArrayHdr: number, insertIdx: number, dwKey: number): number {
  const count = (m.u16(pArrayHdr + 4) << 16) >> 16
  let cap = (m.u16(pArrayHdr + 6) << 16) >> 16
  let pStat = m.u32(pArrayHdr)
  if (count >= cap) {
    const newCap = cap + 4
    const nextBuf = m.alloc(newCap * 8)
    for (let i = 0; i < count * 8; i += 4) {
      m.setU32(nextBuf + i, m.u32(pStat + i))
    }
    pStat = nextBuf
    cap = newCap
    m.setU32(pArrayHdr, pStat)
    m.setU16(pArrayHdr + 6, cap & 0xffff)
  }
  for (let i = count; i > insertIdx; i--) {
    m.setU32(pStat + i * 8, m.u32(pStat + (i - 1) * 8))
    m.setU32(pStat + i * 8 + 4, m.u32(pStat + (i - 1) * 8 + 4))
  }
  m.setU32(pStat + insertIdx * 8, dwKey >>> 0)
  m.setU32(pStat + insertIdx * 8 + 4, 0)
  m.setU16(pArrayHdr + 4, (count + 1) & 0xffff)
  return pStat + insertIdx * 8
}

/** `D2Common 0x6FD881A0`: remove entry at `idx`, shrinking capacity by `-4` if `(cap - newCount) > 8`. */
function removeStatSlot(m: Memory113c, pArrayHdr: number, idx: number): void {
  const count = (m.u16(pArrayHdr + 4) << 16) >> 16
  if (idx < 0 || idx >= count) return
  let pStat = m.u32(pArrayHdr)
  for (let i = idx; i < count - 1; i++) {
    m.setU32(pStat + i * 8, m.u32(pStat + (i + 1) * 8))
    m.setU32(pStat + i * 8 + 4, m.u32(pStat + (i + 1) * 8 + 4))
  }
  const newCount = count - 1
  m.setU16(pArrayHdr + 4, newCount & 0xffff)
  const cap = (m.u16(pArrayHdr + 6) << 16) >> 16
  if (cap - newCount > 8) {
    const newCap = cap - 4
    const nextBuf = newCap > 0 ? m.alloc(newCap * 8) : 0
    for (let i = 0; i < newCount * 8; i += 4) {
      m.setU32(nextBuf + i, m.u32(pStat + i))
    }
    m.setU32(pArrayHdr, nextBuf)
    m.setU16(pArrayHdr + 6, newCap & 0xffff)
  }
}

function readStatFromArray(m: Memory113c, pArrayHdr: number, dwKey: number): number {
  const idx = STATLIST_FindStatIndex113c(m, pArrayHdr, dwKey)
  if (idx < 0) return 0
  const pStat = m.u32(pArrayHdr)
  return m.u32(pStat + idx * 8 + 4) | 0
}

function writeFullStat(
  m: Memory113c,
  pListEx: number,
  dwKey: number,
  value: number,
  keepZero: boolean,
): void {
  const pFullHdr = pListEx + D2StatListExStrc.pFullStat.off
  const idx = STATLIST_FindStatIndex113c(m, pFullHdr, dwKey)
  const val = value | 0
  if (val === 0 && !keepZero) {
    if (idx >= 0) removeStatSlot(m, pFullHdr, idx)
    return
  }
  if (idx >= 0) {
    const pStat = m.u32(pFullHdr)
    m.setU32(pStat + idx * 8 + 4, val >>> 0)
  } else {
    const ins = STATLIST_FindInsertPos113c(m, pFullHdr, dwKey)
    const entryPtr = insertStatSlot(m, pFullHdr, ins, dwKey)
    m.setU32(entryPtr + 4, val >>> 0)
  }
}

/** `D2Common.#11013` (`0x6FD88100`): allocate base `D2StatListStrc` (`0x3C` bytes). */
export function STATLIST_AllocList113c(
  m: Memory113c,
  flags = 0,
  ownerType = 6,
  ownerId = 0,
  stateNo = 0,
  expireFrame = 0,
): number {
  const pList = m.alloc(D2StatListStrc_SIZE)
  let fl = flags >>> 0
  if (expireFrame > 0) fl = (fl | STATLIST_FLAG_TIMED) >>> 0
  m.set(pList, D2StatListStrc.eOwnerType, ownerType >>> 0)
  m.set(pList, D2StatListStrc.dwOwnerId, ownerId >>> 0)
  m.set(pList, D2StatListStrc.dwFlags, fl)
  m.set(pList, D2StatListStrc.dwStateNo, stateNo >>> 0)
  m.set(pList, D2StatListStrc.dwExpireFrame, expireFrame >>> 0)
  return pList
}

/** `D2Common.#11166` (`0x6FD8AF00`): allocate `D2StatListExStrc` (`0x64` bytes + `48`-byte `pStateFlags`) and attach to `pOwner`. */
export function STATLIST_CreateEx113c(
  m: Memory113c,
  pOwner: number,
  argFlags = 0,
  pGame = 0,
): number {
  const pListEx = m.alloc(D2StatListExStrc_SIZE)
  const pStateFlags = m.alloc(STATE_DWORDS_113C * 2 * 4) // 48 bytes: [0..5] active, [6..11] dirty/gfx
  const ownerType = pOwner !== 0 ? m.get(pOwner, D2UnitStrc.dwUnitType) : 6
  const ownerId = pOwner !== 0 ? m.get(pOwner, D2UnitStrc.dwUnitId) : 0
  const dwFlags = ((argFlags & 1) | STATLIST_FLAG_EXTENDED) >>> 0

  m.set(pListEx, D2StatListExStrc.eOwnerType, ownerType)
  m.set(pListEx, D2StatListExStrc.dwOwnerId, ownerId)
  m.set(pListEx, D2StatListExStrc.dwFlags, dwFlags)
  m.set(pListEx, D2StatListExStrc.pOwner, pOwner)
  m.set(pListEx, D2StatListExStrc.pStateFlags, pStateFlags)
  m.set(pListEx, D2StatListExStrc.pGame, pGame)
  if (pOwner !== 0) {
    m.set(pOwner, D2UnitStrc.pStatListEx, pListEx)
  }
  return pListEx
}

/**
 * `D2Common 0x6FD88CD0`: sum `dwKey` across `pList`'s own `BaseStats` (`+0x24`) and, when extended,
 * all active sub-lists chained from `pMyLastList` (`+0x3C`) along `pPrevLink` (`+0x2C`).
 */
export function STATLIST_SumDirectAndSubLists113c(
  m: Memory113c,
  pList: number,
  dwKey: number,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): number {
  let sum = readStatFromArray(m, pList + D2StatListStrc.pStat.off, dwKey)
  const flags = m.get(pList, D2StatListStrc.dwFlags)
  if ((flags & STATLIST_FLAG_EXTENDED) === 0) {
    return sum | 0
  }
  // Walk sub-lists (`pMyLastList` via `pPrevLink` `+0x2C` per `0x6FD88CD6..0x6FD88CF8`)
  for (
    let sub = m.get(pList, D2StatListExStrc.pMyLastList);
    sub !== 0;
    sub = m.get(sub, D2StatListStrc.pPrevLink)
  ) {
    const subFlags = m.get(sub, D2StatListStrc.dwFlags)
    if ((subFlags & STATLIST_FLAG_EXTENDED) !== 0) {
      sum = (sum + EvalStatWithOps113c(m, sub, dwKey, registry)) | 0
    } else {
      sum = (sum + EvalSubListStat113c(m, sub, dwKey, registry)) | 0
    }
  }
  return sum | 0
}

/** Evaluate a non-extended attached sub-list (e.g. equipped item list with `pUnit` at `+0x04` for `op 4/5`). */
function EvalSubListStat113c(
  m: Memory113c,
  pSubList: number,
  dwKey: number,
  registry: StatTableRegistry113c,
): number {
  const statId = (dwKey >>> 16) & 0xffff
  const baseSum = readStatFromArray(m, pSubList + D2StatListStrc.pStat.off, dwKey)
  let total = baseSum | 0
  const revOps = registry.getReverseOps(statId)
  if (revOps.length === 0) return total

  const pAttachUnit = m.get(pSubList, D2StatListStrc.pUnit)
  for (const r of revOps) {
    if (r.op !== 4 && r.op !== 5) continue
    if (pAttachUnit === 0) continue
    const uType = m.get(pAttachUnit, D2UnitStrc.dwUnitType)
    if (uType !== 0 && uType !== 1) continue
    const opBaseVal = STATLIST_GetUnitStat113c(m, pAttachUnit, r.opBase, 0, registry)
    const opBaseShift = registry.get(r.opBase)?.valShift ?? 0
    const shiftedBase = sar32(opBaseVal, opBaseShift)
    if (shiftedBase <= 0) continue
    const srcVal = readStatFromArray(m, pSubList + D2StatListStrc.pStat.off, statKey113c(r.sourceStat, 0))
    if (srcVal === 0) continue
    const scaled = sar32(imul32(srcVal, shiftedBase), r.opParam)
    if (r.op === 4) {
      total = (total + scaled) | 0
    } else {
      total = (total + mulDiv113c(scaled, baseSum, 100)) | 0
    }
  }
  return total | 0
}

/**
 * `D2Common 0x6FD89530` (`EvalStatWithOps`): exact implementation of the 13-entry jump table
 * at `0x6FD89AF0` (`op 1..13`).
 */
export function EvalStatWithOps113c(
  m: Memory113c,
  pList: number,
  dwKey: number,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): number {
  const statId = (dwKey >>> 16) & 0xffff
  const rawBaseSum = STATLIST_SumDirectAndSubLists113c(m, pList, dwKey, registry)
  const revOps = registry.getReverseOps(statId)
  if (revOps.length === 0) {
    return rawBaseSum | 0
  }

  let total = rawBaseSum | 0
  let baseRef = rawBaseSum | 0
  const isEx = (m.get(pList, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) !== 0
  const pOwner = isEx ? m.get(pList, D2StatListExStrc.pOwner) : 0
  const ownerType = m.get(pList, D2StatListStrc.eOwnerType)

  for (const r of revOps) {
    const srcKey = statKey113c(r.sourceStat, 0)
    switch (r.op) {
      case 1: {
        // 0x6FD895D0: mulDiv113c(srcVal, baseRef, 100)
        if (pOwner === 0) break
        if (m.get(pOwner, D2UnitStrc.dwUnitType) === 4) {
          baseRef = STATLIST_GetUnitBaseStat113c(m, pOwner, statId, 0, registry)
        }
        if (baseRef === 0) break
        const srcVal = EvalStatWithOps113c(m, pList, srcKey, registry)
        if (srcVal !== 0) {
          total = (total + mulDiv113c(srcVal, baseRef, 100)) | 0
        }
        break
      }
      case 2:
      case 3: {
        // 0x6FD8960D / 0x6FD896AA: (srcVal * (opBase >> valShift)) >> opParam
        if ((ownerType !== 0 && ownerType !== 1) || r.opBase === 0xffff) break
        const pArr = isEx
          ? pList + D2StatListExStrc.pFullStat.off
          : pList + D2StatListStrc.pStat.off
        // Read opBase (evaluate if not yet materialized in FullStats)
        let opBaseRaw = readStatFromArray(m, pArr, statKey113c(r.opBase, 0))
        if (opBaseRaw === 0 && isEx) {
          opBaseRaw = EvalStatWithOps113c(m, pList, statKey113c(r.opBase, 0), registry)
        }
        const bValShift = registry.get(r.opBase)?.valShift ?? 0
        const opBaseShifted = sar32(opBaseRaw, bValShift)
        if (opBaseShifted <= 0) break
        const srcVal = EvalStatWithOps113c(m, pList, srcKey, registry)
        if (srcVal === 0) break
        const scaled = sar32(imul32(srcVal, opBaseShifted), r.opParam)
        if (r.op === 2) {
          total = (total + scaled) | 0
        } else if (baseRef !== 0) {
          total = (total + mulDiv113c(scaled, baseRef, 100)) | 0
        }
        break
      }
      case 4:
      case 5: {
        // 0x6FD8974B / 0x6FD897DD: item sub-list attached via `pList->pUnit (+0x04)`
        const pAttachUnit = m.get(pList, D2StatListStrc.pUnit)
        if (pAttachUnit === 0 || r.opBase === 0xffff) break
        const uType = m.get(pAttachUnit, D2UnitStrc.dwUnitType)
        if (uType !== 0 && uType !== 1) break
        const opBaseRaw = STATLIST_GetUnitStat113c(m, pAttachUnit, r.opBase, 0, registry)
        const bValShift = registry.get(r.opBase)?.valShift ?? 0
        const opBaseShifted = sar32(opBaseRaw, bValShift)
        if (opBaseShifted <= 0) break
        const srcVal = EvalStatWithOps113c(m, pList, srcKey, registry)
        if (srcVal === 0) break
        const scaled = sar32(imul32(srcVal, opBaseShifted), r.opParam)
        if (r.op === 4) {
          total = (total + scaled) | 0
        } else if (baseRef !== 0) {
          total = (total + mulDiv113c(scaled, baseRef, 100)) | 0
        }
        break
      }
      case 6:
      case 7: {
        // 0x6FD89873 / 0x6FD898D2: by-time scaling
        if (pOwner === 0) break
        const srcVal = EvalStatWithOps113c(m, pList, srcKey, registry)
        if (srcVal === 0) break
        const srcMeta = registry.get(r.sourceStat)
        const byTime = srcMeta?.evalByTime ? srcMeta.evalByTime(pOwner, srcVal) : srcVal
        if (r.op === 6) {
          total = (total + byTime) | 0
        } else if (baseRef !== 0) {
          total = (total + mulDiv113c(byTime, baseRef, 100)) | 0
        }
        break
      }
      case 8: {
        // 0x6FD89947: non-base energy -> maxmana (`(fullEnergy - baseEnergy) * ManaPerMagic << 6`)
        if (pOwner === 0 || m.get(pOwner, D2UnitStrc.dwUnitType) !== 0) break
        const growth = registry.getCharGrowth(m.get(pOwner, D2UnitStrc.dwClassId))
        if (!growth) break
        const baseEne = readStatFromArray(m, pList + D2StatListStrc.pStat.off, srcKey)
        const fullEne = EvalStatWithOps113c(m, pList, srcKey, registry)
        const nonBase = (fullEne - baseEne) | 0
        if (nonBase !== 0) {
          total = (total + shl32(imul32(growth.manaPerMagic, nonBase), 6)) | 0
        }
        break
      }
      case 9: {
        // 0x6FD899C3: non-base vitality -> maxstamina (statId==11) or maxhp (`<< 6`)
        if (pOwner === 0 || m.get(pOwner, D2UnitStrc.dwUnitType) !== 0) break
        const growth = registry.getCharGrowth(m.get(pOwner, D2UnitStrc.dwClassId))
        if (!growth) break
        const baseVit = readStatFromArray(m, pList + D2StatListStrc.pStat.off, srcKey)
        const fullVit = EvalStatWithOps113c(m, pList, srcKey, registry)
        const nonBase = (fullVit - baseVit) | 0
        if (nonBase !== 0) {
          const factor = statId === 11 ? growth.staminaPerVitality : growth.lifePerVitality
          total = (total + shl32(imul32(factor, nonBase), 6)) | 0
        }
        break
      }
      case 10:
      case 12:
        // 0x6FD89ACF: no-op in 1.13c
        break
      case 11: {
        // 0x6FD89A5C: player/monster percentage bonus
        if (baseRef === 0 || pOwner === 0) break
        const uType = m.get(pOwner, D2UnitStrc.dwUnitType)
        if (uType !== 0 && uType !== 1) break
        const srcVal = EvalStatWithOps113c(m, pList, srcKey, registry)
        if (srcVal !== 0) {
          total = (total + mulDiv113c(srcVal, baseRef, 100)) | 0
        }
        break
      }
      case 13: {
        // 0x6FD89A87: local item percentage bonus (`dwUnitType == 4`)
        if (pOwner === 0 || m.get(pOwner, D2UnitStrc.dwUnitType) !== 4) break
        baseRef = STATLIST_GetUnitBaseStat113c(m, pOwner, statId, 0, registry)
        if (baseRef === 0) break
        const srcVal = EvalStatWithOps113c(m, pList, srcKey, registry)
        if (srcVal !== 0) {
          total = (total + mulDiv113c(srcVal, baseRef, 100)) | 0
        }
        break
      }
    }
  }
  return total | 0
}

/**
 * `D2Common 0x6FD89CE0..0x6FD89F48` (`STATLIST_RecomputeExStat`):
 * Evaluates `dwKey` via `EvalStatWithOps` (`0x6FD89530`), propagates to `wOpStat[0..2]` (`+0x58`),
 * applies the exact carrier-suppression switch (`0x6FD89F48` / `0x6FD89F60`), and updates
 * `wBaseDepStats[0..63]` (`+0x5E`).
 */
export function STATLIST_RecomputeExStat113c(
  m: Memory113c,
  pListEx: number,
  statId: number,
  layer = 0,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
  visited = new Set<number>(),
): number {
  if ((m.get(pListEx, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) === 0) return 0
  const key = statKey113c(statId, layer)
  if (visited.has(key)) {
    return EvalStatWithOps113c(m, pListEx, key, registry)
  }
  visited.add(key)

  const val = EvalStatWithOps113c(m, pListEx, key, registry)
  const meta = registry.get(statId)
  const keepZero = meta?.keepZero ?? false
  const op = meta?.op ?? 0
  const opStats = meta?.opStats ?? []
  const baseDeps = registry.getBaseDependents(statId)
  const hasOpStat = (op >= 1 && op <= 13 && opStats.length > 0) || baseDeps.length > 0

  if (!hasOpStat) {
    // 0x6FD89CFD: byte [esi + 0x51] == 0 -> write directly to FullStats and return
    writeFullStat(m, pListEx, key, val, keepZero)
  } else {
    // 0x6FD89D1E: if evaluated carrier == 0, clear stale FullStats slot immediately
    if (val === 0) {
      writeFullStat(m, pListEx, key, 0, keepZero)
    }
    let keepCarrier = true // [esp + 0x10] = 1 at 0x6FD89D38
    const flags = m.get(pListEx, D2StatListStrc.dwFlags)
    const ownerType = m.get(pListEx, D2StatListStrc.eOwnerType)
    const selfRevOps = registry.getReverseOps(statId)

    for (let i = 0; i < 3 && i < opStats.length; i++) {
      const targetStat = opStats[i]!
      if (targetStat < 0 || targetStat === 0xffff) break
      const targetKey = statKey113c(targetStat, 0)
      const targetVal = STATLIST_RecomputeExStat113c(m, pListEx, targetStat, 0, registry, visited)
      const targetKeepZero = registry.get(targetStat)?.keepZero ?? false
      writeFullStat(m, pListEx, targetKey, targetVal, targetKeepZero)

      if (targetVal !== 0) {
        // 0x6FD89DBB..0x6FD89E65: jump table 0x6FD89F48 indexed by 0x6FD89F60[bOp]
        // Note 0x6FD89DEA / 0x6FD89E38: 1.13c reads `word [esi + 0xDE + i*6]` (`unk_DE[i].wOpBase`,
        // zero-initialized to stat 0 `strength` unless another stat targets this carrier).
        const unkDeBase = selfRevOps[i]?.opBase ?? 0
        switch (op) {
          case 1:
          case 12:
            keepCarrier = false
            break
          case 2:
          case 3: {
            if ((ownerType === 0 || ownerType === 1) && unkDeBase !== 0xffff) {
              const checkHdr =
                (flags & STATLIST_FLAG_EXTENDED) !== 0
                  ? pListEx + D2StatListExStrc.pFullStat.off
                  : pListEx + D2StatListStrc.pStat.off
              if (readStatFromArray(m, checkHdr, statKey113c(unkDeBase, 0)) > 0) {
                keepCarrier = false
              }
            }
            break
          }
          case 4:
          case 5: {
            const pEquipUnit = m.get(pListEx, D2StatListStrc.pUnit)
            if (pEquipUnit !== 0 && unkDeBase !== 0xffff) {
              const eqType = m.get(pEquipUnit, D2UnitStrc.dwUnitType)
              if (
                (eqType === 0 || eqType === 1) &&
                STATLIST_GetUnitStat113c(m, pEquipUnit, unkDeBase, 0, registry) > 0
              ) {
                keepCarrier = false
              }
            }
            break
          }
          case 6:
          case 7:
            if (ownerType === 0 || ownerType === 1) {
              keepCarrier = false
            }
            break
          case 13:
            if (ownerType === 4) {
              keepCarrier = false
            }
            break
        }
      }
    }

    // 0x6FD89E9D..0x6FD89F36: write carrier if unconsumed, then recompute wBaseDepStats[0..63] (+0x5E)
    if (keepCarrier && val !== 0) {
      writeFullStat(m, pListEx, key, val, keepZero)
      for (const depStat of baseDeps) {
        const depKey = statKey113c(depStat, 0)
        const depVal = STATLIST_RecomputeExStat113c(m, pListEx, depStat, 0, registry, visited)
        const depKeepZero = registry.get(depStat)?.keepZero ?? false
        writeFullStat(m, pListEx, depKey, depVal, depKeepZero)
      }
    }
  }

  // Propagate up `pParent` (`+0x34`) if this extended list is attached to an owner (`0x6FD89F70`)
  const pParent = m.get(pListEx, D2StatListStrc.pParent)
  if (pParent !== 0) {
    STATLIST_RecomputeExStat113c(m, pParent, statId, layer, registry, new Set<number>())
  }
  return val
}

function collectListStatKeys(m: Memory113c, pList: number, keys: Set<number>): void {
  const collectHdr = (pHdr: number): void => {
    const n = (m.u16(pHdr + 4) << 16) >> 16
    const p = m.u32(pHdr)
    for (let i = 0; i < n; i++) keys.add(m.u32(p + i * 8) | 0)
  }
  collectHdr(pList + D2StatListStrc.pStat.off)
  if ((m.get(pList, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) !== 0) {
    collectHdr(pList + D2StatListExStrc.pFullStat.off)
  }
}

/** Recompute all keys present on `pListEx` and its sub-lists (plus optional `extraKeys` from a detached sub-list). */
export function STATLIST_RebuildAllExStats113c(
  m: Memory113c,
  pListEx: number,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
  extraKeys?: Iterable<number>,
): void {
  if (pListEx === 0 || (m.get(pListEx, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) === 0) return
  const keys = new Set<number>(extraKeys)
  collectListStatKeys(m, pListEx, keys)
  for (
    let sub = m.get(pListEx, D2StatListExStrc.pMyLastList);
    sub !== 0;
    sub = m.get(sub, D2StatListStrc.pPrevLink)
  ) {
    collectListStatKeys(m, sub, keys)
  }
  for (const k of keys) {
    const statId = (k >>> 16) & 0xffff
    const layer = k & 0xffff
    STATLIST_RecomputeExStat113c(m, pListEx, statId, layer, registry, new Set<number>())
  }
}

/**
 * `D2Common.#10188` (`0x6FD8A7B0` -> `0x6FD8A280` `STATLIST_SetStatIfListIsValid`).
 * Returns `1` if the stat changed (`delta != 0`), `0` if unchanged.
 */
export function STATLIST_SetStat113c(
  m: Memory113c,
  pList: number,
  statId: number,
  value: number,
  layer = 0,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): number {
  if (pList === 0 || statId < 0) return 0
  const key = statKey113c(statId, layer)
  const pBaseHdr = pList + D2StatListStrc.pStat.off
  const newVal = value | 0
  const idx = STATLIST_FindStatIndex113c(m, pBaseHdr, key)

  let oldVal = 0
  if (idx >= 0) {
    const pStat = m.u32(pBaseHdr)
    oldVal = m.u32(pStat + idx * 8 + 4) | 0
    if (oldVal === newVal) return 0
    if (newVal === 0) {
      removeStatSlot(m, pBaseHdr, idx)
    } else {
      m.setU32(pStat + idx * 8 + 4, newVal >>> 0)
    }
  } else {
    if (newVal === 0) return 0
    const ins = STATLIST_FindInsertPos113c(m, pBaseHdr, key)
    const entryPtr = insertStatSlot(m, pBaseHdr, ins, key)
    m.setU32(entryPtr + 4, newVal >>> 0)
  }

  // Propagate to `FullStats` on self (if extended) or `pParent` (`0x6FD89F70`)
  const flags = m.get(pList, D2StatListStrc.dwFlags)
  if ((flags & STATLIST_FLAG_EXTENDED) !== 0) {
    STATLIST_RecomputeExStat113c(m, pList, statId, layer, registry)
  } else {
    const pParent = m.get(pList, D2StatListStrc.pParent)
    if (pParent !== 0) {
      STATLIST_RecomputeExStat113c(m, pParent, statId, layer, registry)
    }
  }
  return 1
}

/** `D2Common 0x6FD8A330` (`STATLIST_AddStat`). */
export function STATLIST_AddStat113c(
  m: Memory113c,
  pList: number,
  statId: number,
  delta: number,
  layer = 0,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): number {
  if (pList === 0 || (delta | 0) === 0) return 0
  const cur = readStatFromArray(m, pList + D2StatListStrc.pStat.off, statKey113c(statId, layer))
  return STATLIST_SetStat113c(m, pList, statId, (cur + (delta | 0)) | 0, layer, registry)
}

/**
 * `D2Common.#10887` (`0x6FD8A740` `STATLIST_SetUnitStat`).
 * Note: in native 1.13c `D2Common.dll`, `#10887` has C return type `void` (when `pUnit->dwUnitType == 0`
 * and `STATLIST_SetStat` returns `1`, `0x6FD8A775` calls `void 0x6FD88550` `STATLIST_RecordClientDirtyStat`
 * which clobbers `eax`); `#10188` (`0x6FD8A780` -> `0x6FD8A280`) returns `BOOL` (`0` or `1`).
 */
export function STATLIST_SetUnitStat113c(
  m: Memory113c,
  pUnit: number,
  statId: number,
  value: number,
  layer = 0,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): number {
  if (pUnit === 0) return 0
  let pList = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pList === 0) {
    pList = STATLIST_CreateEx113c(m, pUnit, 0, m.get(pUnit, D2UnitStrc.pGame))
  }
  return STATLIST_SetStat113c(m, pList, statId, value, layer, registry)
}

/** `D2Common.#10627` (`STATLIST_AddUnitStat`). */
export function STATLIST_AddUnitStat113c(
  m: Memory113c,
  pUnit: number,
  statId: number,
  delta: number,
  layer = 0,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): number {
  if (pUnit === 0 || (delta | 0) === 0) return 0
  let pList = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pList === 0) {
    pList = STATLIST_CreateEx113c(m, pUnit, 0, m.get(pUnit, D2UnitStrc.pGame))
  }
  return STATLIST_AddStat113c(m, pList, statId, delta, layer, registry)
}

/**
 * `D2Common 0x6FD88AB9..0x6FD88AED` / `0x6FD88B2B..0x6FD88B62`:
 * Clamps a PRESENT stat slot (`idx >= 0`) on an extended player/monster `StatListEx` (`pOwner->dwUnitType` in `{0, 1}`):
 * `if (rawVal < dwMinAccr) rawVal = dwMinAccr << bValShift;`
 * Absent slots (`idx < 0`) return `0` BEFORE reaching this clamp (`0x6FD88A9C` / `0x6FD88B12`).
 */
function clampPresentMinStat113c(
  m: Memory113c,
  pList: number,
  statId: number,
  rawVal: number,
  registry: StatTableRegistry113c,
): number {
  const flags = m.get(pList, D2StatListStrc.dwFlags)
  if ((flags & STATLIST_FLAG_EXTENDED) === 0) return rawVal | 0
  const pOwner = m.get(pList, D2StatListExStrc.pOwner)
  if (pOwner === 0) return rawVal | 0
  const ownerType = m.get(pOwner, D2UnitStrc.dwUnitType)
  if (ownerType !== 0 && ownerType !== 1) return rawVal | 0
  const meta = registry.get(statId)
  if (!meta?.fMin) return rawVal | 0
  const minAccr = (meta.minAccr ?? 0) | 0
  const val = rawVal | 0
  if (val < minAccr) {
    return shl32(minAccr, meta.valShift ?? 0)
  }
  return val
}

/** `D2Common.#10973` (`0x6FD88B70` -> `0x6FD88A80` `STATLIST_GetUnitStat`). */
export function STATLIST_GetUnitStat113c(
  m: Memory113c,
  pUnit: number,
  statId: number,
  layer = 0,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): number {
  if (pUnit === 0 || statId < 0) return 0
  const pList = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pList === 0) return 0
  const flags = m.get(pList, D2StatListStrc.dwFlags)
  const pHdr =
    (flags & STATLIST_FLAG_EXTENDED) !== 0
      ? pList + D2StatListExStrc.pFullStat.off
      : pList + D2StatListStrc.pStat.off
  const idx = STATLIST_FindStatIndex113c(m, pHdr, statKey113c(statId, layer))
  if (idx < 0) return 0
  const raw = m.u32(m.u32(pHdr) + idx * 8 + 4) | 0
  return clampPresentMinStat113c(m, pList, statId, raw, registry)
}

/** `D2Common.#10587` (`0x6FD88C20` -> `0x6FD88B00` `STATLIST_GetUnitBaseStat`). */
export function STATLIST_GetUnitBaseStat113c(
  m: Memory113c,
  pUnit: number,
  statId: number,
  layer = 0,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): number {
  if (pUnit === 0 || statId < 0) return 0
  const pList = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pList === 0) return 0
  const pHdr = pList + D2StatListStrc.pStat.off
  const idx = STATLIST_FindStatIndex113c(m, pHdr, statKey113c(statId, layer))
  if (idx < 0) return 0
  const raw = m.u32(m.u32(pHdr) + idx * 8 + 4) | 0
  return clampPresentMinStat113c(m, pList, statId, raw, registry)
}

/**
 * `D2Common 0x6FD8A600` (`STATLIST_MergeStatLists` / sub-list attach):
 * Links `pSubList` into `pParentEx->pMyLastList` (`+0x3C`, walked via `pPrevLink` `+0x2C`),
 * sets `pSubList->pParent = pParentEx` and `pSubList->pUnit = pParentEx->pOwner`, and recomputes `FullStats`.
 */
export function STATLIST_InsertSubList113c(
  m: Memory113c,
  pParentEx: number,
  pSubList: number,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): void {
  if (pParentEx === 0 || pSubList === 0) return
  if ((m.get(pParentEx, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) === 0) return
  const oldParent = m.get(pSubList, D2StatListStrc.pParent)
  if (oldParent === pParentEx) return
  if (oldParent !== 0) {
    STATLIST_RemoveSubList113c(m, pSubList, registry)
  }

  const oldLast = m.get(pParentEx, D2StatListExStrc.pMyLastList)
  m.set(pSubList, D2StatListStrc.pPrevLink, oldLast)
  m.set(pSubList, D2StatListStrc.pNextLink, 0)
  if (oldLast !== 0) {
    m.set(oldLast, D2StatListStrc.pNextLink, pSubList)
  }
  m.set(pParentEx, D2StatListExStrc.pMyLastList, pSubList)
  m.set(pSubList, D2StatListStrc.pParent, pParentEx)
  m.set(pSubList, D2StatListStrc.pUnit, m.get(pParentEx, D2StatListExStrc.pOwner))
  m.set(
    pSubList,
    D2StatListStrc.dwFlags,
    (m.get(pSubList, D2StatListStrc.dwFlags) | STATLIST_FLAG_MERGED) >>> 0,
  )

  STATLIST_RebuildAllExStats113c(m, pParentEx, registry)
}

/** Unlink `pSubList` from its parent `D2StatListExStrc` and recompute parent `FullStats`. */
export function STATLIST_RemoveSubList113c(
  m: Memory113c,
  pSubList: number,
  registry: StatTableRegistry113c = DEFAULT_STAT_REGISTRY_113C,
): void {
  if (pSubList === 0) return
  const pParentEx = m.get(pSubList, D2StatListStrc.pParent)
  if (pParentEx === 0) return

  const detachedKeys = new Set<number>()
  collectListStatKeys(m, pSubList, detachedKeys)

  const prev = m.get(pSubList, D2StatListStrc.pPrevLink)
  const next = m.get(pSubList, D2StatListStrc.pNextLink)
  if (prev !== 0) m.set(prev, D2StatListStrc.pNextLink, next)
  if (next !== 0) {
    m.set(next, D2StatListStrc.pPrevLink, prev)
  } else if (m.get(pParentEx, D2StatListExStrc.pMyLastList) === pSubList) {
    m.set(pParentEx, D2StatListExStrc.pMyLastList, prev)
  }

  m.set(pSubList, D2StatListStrc.pPrevLink, 0)
  m.set(pSubList, D2StatListStrc.pNextLink, 0)
  m.set(pSubList, D2StatListStrc.pParent, 0)
  m.set(pSubList, D2StatListStrc.pUnit, 0)
  m.set(
    pSubList,
    D2StatListStrc.dwFlags,
    (m.get(pSubList, D2StatListStrc.dwFlags) & ~STATLIST_FLAG_MERGED) >>> 0,
  )

  STATLIST_RebuildAllExStats113c(m, pParentEx, registry, detachedKeys)
}

/** `D2Common.#10871` (`0x6FD88520` `STATLIST_GetStatListFromUnitAndState`). */
export function STATLIST_GetStatListFromUnitAndState113c(
  m: Memory113c,
  pUnit: number,
  stateId: number,
): number {
  if (pUnit === 0) return 0
  const pListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pListEx === 0 || (m.get(pListEx, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) === 0) {
    return 0
  }
  const target = stateId >>> 0
  for (
    let sub = m.get(pListEx, D2StatListExStrc.pMyLastList);
    sub !== 0;
    sub = m.get(sub, D2StatListStrc.pPrevLink)
  ) {
    if (m.get(sub, D2StatListStrc.dwStateNo) === target) return sub
  }
  for (
    let sub = m.get(pListEx, D2StatListExStrc.pMyStats);
    sub !== 0;
    sub = m.get(sub, D2StatListStrc.pPrevLink)
  ) {
    if (m.get(sub, D2StatListStrc.dwStateNo) === target) return sub
  }
  return 0
}

/**
 * `D2Common.#10494` (`0x6FD83CD0` `STATES_CheckState`):
 * Valid only on `dwUnitType` in `{0, 1, 3}` (`player`, `monster`, `missile`) and `0 <= stateId < 184`.
 * Returns raw masked bit (`1 << (stateId & 31)` >>> 0) or `0`.
 */
export function STATES_CheckState113c(m: Memory113c, pUnit: number, stateId: number): number {
  if (pUnit === 0) return 0
  const uType = m.get(pUnit, D2UnitStrc.dwUnitType)
  if (uType !== 0 && uType !== 1 && uType !== 3) return 0
  if (stateId < 0 || stateId >= STATES_COUNT_113C) return 0
  const pListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pListEx === 0 || (m.get(pListEx, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) === 0) {
    return 0
  }
  const pStateFlags = m.get(pListEx, D2StatListExStrc.pStateFlags)
  if (pStateFlags === 0) return 0
  const wordIdx = stateId >> 5
  const mask = (1 << (stateId & 31)) >>> 0
  return (m.u32(pStateFlags + wordIdx * 4) & mask) >>> 0
}

/**
 * `D2Common 0x6FD88730` (`STATES_ToggleState`):
 * Sets or clears `stateId` in `pStateFlags[0..5]`; if the bit actually flipped, sets the
 * corresponding dirty/gfx bit in `pStateFlags[6..11]` (`wordIdx + 6`).
 */
export function STATES_ToggleState113c(
  m: Memory113c,
  pUnit: number,
  stateId: number,
  bSet: boolean,
): void {
  if (pUnit === 0 || stateId < 0 || stateId >= STATES_COUNT_113C) return
  const uType = m.get(pUnit, D2UnitStrc.dwUnitType)
  if (uType !== 0 && uType !== 1 && uType !== 3) return
  let pListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pListEx === 0) {
    pListEx = STATLIST_CreateEx113c(m, pUnit, 0, m.get(pUnit, D2UnitStrc.pGame))
  }
  if ((m.get(pListEx, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) === 0) return
  const pStateFlags = m.get(pListEx, D2StatListExStrc.pStateFlags)
  if (pStateFlags === 0) return

  const wordIdx = stateId >> 5
  const mask = (1 << (stateId & 31)) >>> 0
  const curWord = m.u32(pStateFlags + wordIdx * 4)
  const wasSet = (curWord & mask) !== 0
  if (wasSet === bSet) return

  const nextWord = bSet ? (curWord | mask) >>> 0 : (curWord & ~mask) >>> 0
  m.setU32(pStateFlags + wordIdx * 4, nextWord)

  // Dirty/gfx bitvector sits immediately after the 6 active dwords (`+6 * 4 = +0x18`)
  const dirtyAddr = pStateFlags + (wordIdx + STATE_DWORDS_113C) * 4
  m.setU32(dirtyAddr, (m.u32(dirtyAddr) | mask) >>> 0)
}

/** Read dirty/gfx state bit (`pStateFlags[(stateId >> 5) + 6] & (1 << (stateId & 31))`). */
export function STATES_CheckGfxStateFlag113c(m: Memory113c, pUnit: number, stateId: number): number {
  if (pUnit === 0 || stateId < 0 || stateId >= STATES_COUNT_113C) return 0
  const pListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pListEx === 0 || (m.get(pListEx, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) === 0) {
    return 0
  }
  const pStateFlags = m.get(pListEx, D2StatListExStrc.pStateFlags)
  if (pStateFlags === 0) return 0
  const wordIdx = (stateId >> 5) + STATE_DWORDS_113C
  const mask = (1 << (stateId & 31)) >>> 0
  return (m.u32(pStateFlags + wordIdx * 4) & mask) >>> 0
}

/** Clear dirty/gfx state bit (`pStateFlags[(stateId >> 5) + 6] &= ~mask`). */
export function STATES_ClearGfxStateFlag113c(m: Memory113c, pUnit: number, stateId: number): void {
  if (pUnit === 0 || stateId < 0 || stateId >= STATES_COUNT_113C) return
  const pListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pListEx === 0 || (m.get(pListEx, D2StatListStrc.dwFlags) & STATLIST_FLAG_EXTENDED) === 0) {
    return
  }
  const pStateFlags = m.get(pListEx, D2StatListExStrc.pStateFlags)
  if (pStateFlags === 0) return
  const wordIdx = (stateId >> 5) + STATE_DWORDS_113C
  const mask = (1 << (stateId & 31)) >>> 0
  m.setU32(pStateFlags + wordIdx * 4, (m.u32(pStateFlags + wordIdx * 4) & ~mask) >>> 0)
}
