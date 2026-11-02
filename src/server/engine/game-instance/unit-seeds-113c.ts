/**
 * 1.13c game and unit RNG seeds (`D2SeedStrc`), Act monster component palettes, and `MONSTER_InitStats`
 * rolls (oracle P4 iterations 5–6).
 *
 * Evidence (`kb/monsters/d2game-monster-initstats-seeds-113c.md`, `D2Game.dll` `0x6FC20000` /
 * `D2Common.dll` `0x6FD50000`):
 * - `GAME_InitSeed` (`0x6FC4A900`): `SEED_InitSeed` + `SEED_InitLowSeed(seed)` + 4 game-creation draws.
 * - `SUNIT_AllocUnitData` (`0x6FD01D90` -> `0x6FD00110` / `0x6FD000C0`): 1 draw per non-item unit, 2 draws per item.
 * - `0x6FCEA5F0` -> `0x6FCFF1A0` + `MONSTER_ChooseOutfit` (`0x6FCCF730`): 13-slot per-Act monster outfit palette
 *   when `MonStats2.nTotalPieces > 2` (excluding `{195, 196, 294, 296}`), followed by per-unit outfit selection.
 * - `MONSTER_InitStats` (`0x6FCCFDB0`) + `D2Common #11089` (`0x6FDA4A00`): Normal `MonStats.Level[0]` preserved
 *   without clamping `0` to `1`, `MonLvl[level].lHp[diff]` scaling, and inclusive `+1` HP roll (`0x6FCD0043`).
 */

import {
  D2SEED_AdvanceInline,
  SEED_InitLowSeed,
  SEED_InitSeed,
  newD2Seed,
  type D2SeedStrc,
} from '../../../common/rng/d2-rng.ts'
import { getMonLvl113c, type MonsterKind } from '../../../common/units/monsters-data.ts'
import { MONSTATS2_OUTFIT_META_113C } from '../../../common/units/monstats2-outfit-113c.ts'
import { UNIT_TYPE_113C, type UnitType113c } from './constants-and-helpers.ts'

/** Game-creation draws observed in the oracle before the first player joins (`GAME_InitSeed` -> frame 1). */
export const GAME_CREATION_SEED_DRAWS_113C = 4

/** Maximum distinct monster classes cached per Act in `pGame->pMonReg[nAct]` (`0x6FCEA67D`). */
export const MAX_ACT_MONSTER_PALETTE_SLOTS_113C = 13

/** Monster `hcIdx` skipped by `0x6FCEA5F0` (`0x6FCEA620..0x6FCEA63D`, jump table `0x6FCEA6F8`). */
const OUTFIT_PALETTE_SKIP_HCIDX_113C = new Set<number>([195, 196, 294, 296])

export interface ActMonsterOutfitPalette113c {
  /** Cached `hcIdx -> 0..3` pre-rolled 16-component outfits (`nTotalPieces > 2`, up to 13 slots per Act). */
  readonly byHcIdx: Map<number, readonly (readonly number[])[]>
}

export function createActMonsterOutfitPalettes113c(): ActMonsterOutfitPalette113c[] {
  return [
    { byHcIdx: new Map() },
    { byHcIdx: new Map() },
    { byHcIdx: new Map() },
    { byHcIdx: new Map() },
    { byHcIdx: new Map() },
  ]
}

/** One inline game-seed step (`0x6FD00142..0x6FD00159`); returns the new low word (`uint32`). */
export function drawGameSeed113c(gameSeed: D2SeedStrc): number {
  D2SEED_AdvanceInline(gameSeed)
  return gameSeed.lo >>> 0
}

/** `GAME_InitSeed` override path (`0x6FC4A96A..0x6FC4A98C`), followed by the 4 game-creation draws. */
export function initGameSeed113c(gameSeed: D2SeedStrc, initSeed: number): void {
  SEED_InitSeed(gameSeed)
  SEED_InitLowSeed(gameSeed, initSeed >>> 0)
  for (let i = 0; i < GAME_CREATION_SEED_DRAWS_113C; i++) drawGameSeed113c(gameSeed)
}

/** Allocates the `D2SeedStrc` of a new unit of `unitType` from the game seed (`0x6FD00110` / `0x6FD000C0`). */
export function allocUnitSeed113c(gameSeed: D2SeedStrc, unitType: UnitType113c): D2SeedStrc {
  const seed = newD2Seed()
  SEED_InitSeed(seed)
  SEED_InitLowSeed(seed, drawGameSeed113c(gameSeed))
  if (unitType === UNIT_TYPE_113C.item) drawGameSeed113c(gameSeed)
  return seed
}

/**
 * Bounded 1.13c `D2SeedStrc` draw (`D2Game.dll` `0x6FC21180` / `0x6FC211D0`):
 * - `limit <= 0` returns `0` without advancing `seed`.
 * - Power-of-two `limit > 0` masks `lo & (limit - 1)`; otherwise `(lo >>> 0) % limit`.
 */
export function rollLimitedSeed113c(seed: D2SeedStrc, limit: number): number {
  const n = Math.trunc(limit)
  if (n <= 0) return 0
  D2SEED_AdvanceInline(seed)
  const lo = seed.lo >>> 0
  return (n & (n - 1)) === 0 ? (lo & (n - 1)) >>> 0 : lo % n
}

function sameOutfit16(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < 16; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Exact 1.13c `0x6FCEA5F0` (`0x6FCFF1A0`) + `MONSTER_ChooseOutfit` (`0x6FCCF730`) roll on `unitSeed`.
 * Returns the 16-component variant array (`0..15`), or `undefined` when `hcIdx` is outside `MonStats`.
 */
export function rollMonsterOutfit113c(
  palette: ActMonsterOutfitPalette113c,
  hcIdx: number,
  unitSeed: D2SeedStrc,
): number[] | undefined {
  const meta = MONSTATS2_OUTFIT_META_113C[hcIdx]
  if (meta === undefined) return undefined
  const totalPieces = meta[0] ?? 0
  const variants = new Array<number>(16)
  for (let i = 0; i < 16; i++) variants[i] = meta[i + 1] ?? 0

  let outfits: readonly (readonly number[])[] | null = null
  if (!OUTFIT_PALETTE_SKIP_HCIDX_113C.has(hcIdx)) {
    const cached = palette.byHcIdx.get(hcIdx)
    if (cached !== undefined) {
      outfits = cached
    } else if (palette.byHcIdx.size < MAX_ACT_MONSTER_PALETTE_SLOTS_113C) {
      if (totalPieces <= 2) {
        outfits = []
      } else {
        const multi: number[] = []
        for (let i = 0; i < 16; i++) {
          if (variants[i]! > 1) multi.push(i)
        }
        const generated: number[][] = []
        let req = Math.min(3, multi.length >= 2 ? 3 : 1 << multi.length)
        const baseOutfit = new Array<number>(16)
        for (let i = 0; i < 16; i++) {
          baseOutfit[i] = variants[i]! > 1 ? rollLimitedSeed113c(unitSeed, variants[i]!) : 0
        }
        generated.push(baseOutfit)
        req -= 1
        if (req > 0 && multi.length > 0) {
          let c1: number
          let c2: number
          if (multi.length === 1) {
            c1 = multi[0]!
            c2 = multi[0]!
          } else {
            const pool = [...multi]
            const i1 = rollLimitedSeed113c(unitSeed, pool.length)
            c1 = pool[i1]!
            pool[i1] = pool[pool.length - 1]!
            pool.pop()
            const i2 = rollLimitedSeed113c(unitSeed, pool.length)
            c2 = pool[i2]!
          }
          for (let r = 0; r < req; r++) {
            const cand = [...baseOutfit]
            let retries = 3
            let dup = false
            do {
              cand[c1] = rollLimitedSeed113c(unitSeed, variants[c1]!)
              if (c1 !== c2) {
                cand[c2] = rollLimitedSeed113c(unitSeed, variants[c2]!)
              }
              dup = false
              for (const prev of generated) {
                if (sameOutfit16(cand, prev)) {
                  retries -= 1
                  dup = true
                  break
                }
              }
            } while (dup && retries !== 0)
            generated.push(cand)
          }
        }
        palette.byHcIdx.set(hcIdx, generated)
        outfits = generated
      }
    }
  }

  // `MONSTER_ChooseOutfit` (`0x6FCCF730`):
  if (outfits !== null && outfits.length > 0) {
    const idx = rollLimitedSeed113c(unitSeed, outfits.length)
    return [...outfits[idx]!]
  }
  const chosen = new Array<number>(16)
  for (let i = 0; i < 16; i++) {
    chosen[i] = variants[i]! > 0 ? rollLimitedSeed113c(unitSeed, variants[i]!) : 0
  }
  return chosen
}

/**
 * Exact 1.13c `MONSTER_InitStats` (`0x6FCCFDB0`) + `D2Common #11089` (`0x6FDA4A00`) level and base HP roll
 * on `unitSeed` (`0x6FCD0043`). Always advances `unitSeed` once for the HP roll (`maxHP - minHP + 1 >= 1`).
 */
export function rollMonsterInitStats113c(params: {
  readonly kind: MonsterKind
  readonly difficulty: 0 | 1 | 2
  readonly effectiveAreaLevel?: number | undefined
  readonly isBoss: boolean
  readonly noRatio: boolean
  readonly isExpansion?: boolean | undefined
  readonly unitSeed: D2SeedStrc
}): { readonly level: number; readonly rolledHp: number } {
  const { kind, difficulty, effectiveAreaLevel, isBoss, noRatio, unitSeed } = params
  const monStatsLvl = Math.max(0, Math.trunc(kind.level?.[difficulty] ?? 0))
  const level =
    difficulty > 0 && !isBoss && !noRatio && effectiveAreaLevel !== undefined && effectiveAreaLevel > 0
      ? Math.trunc(effectiveAreaLevel)
      : monStatsLvl

  const rawMinHp = Math.max(0, Math.trunc(kind.minHpByDifficulty?.[difficulty] ?? kind.minHp ?? 0))
  const rawMaxHp = Math.max(
    rawMinHp,
    Math.trunc(kind.maxHpByDifficulty?.[difficulty] ?? kind.maxHp ?? rawMinHp),
  )

  let minHp: number
  let maxHp: number
  if (noRatio) {
    minHp = rawMinHp
    maxHp = rawMaxHp
  } else {
    const monLvlRow = getMonLvl113c(level)
    const hpRatio =
      params.isExpansion === false
        ? (monLvlRow?.hp?.[difficulty] ?? 1)
        : (monLvlRow?.lHp?.[difficulty] ?? 1)
    minHp = Math.trunc((rawMinHp * hpRatio) / 100)
    maxHp = Math.max(minHp, Math.trunc((rawMaxHp * hpRatio) / 100))
  }

  const rolledHp = minHp + rollLimitedSeed113c(unitSeed, maxHp - minHp + 1)
  return { level, rolledHp }
}
