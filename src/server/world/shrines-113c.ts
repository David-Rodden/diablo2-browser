/**
 * 1.13c Shrine Effect Helpers (`D2Game.dll` `0x6FC89EE0`, `0x6FC8ABB0`, `0x6FC8ACE0`,
 * `0x6FC8C200`, `0x6FC8C580`, `0x6FC8C798`, #1919, #1920).
 */

/**
 * Six distinct radial target coordinate offsets `(dx, dy)` in `D2Game.dll` `0x6FC8C798..0x6FC8C7C4`
 * used by `SHRINES_Exploding` (`Code 21`, `0x6FC8C580`, missile `45`) and
 * `SHRINES_Poison` (`Code 22`, `0x6FC8C200`, missile `48`).
 */
export const EXPLODING_POISON_SHRINE_OFFSETS_113C: readonly (readonly [number, number])[] = [
  [-6, 6],
  [-6, -6],
  [0, 6],
  [0, -6],
  [6, 6],
  [6, -6],
] as const

/**
 * 1.13c shrine projectile skill level: `clamp(trunc(clvl / 5), 1, 8)`.
 */
export function computeShrineMissileSlvl113c(clvl: number): number {
  return Math.max(1, Math.min(8, Math.trunc(clvl / 5)))
}

/**
 * 1.13c `SHRINES_Armor` (`Code 6`, `state 128`, `D2Game.dll` `0x6FC8ABB0`):
 * Attaches ONLY `STAT_SKILL_ARMOR_PERCENT` (`171`) = `+arg0` (`+100%`), never `item_armor_percent` (`16`).
 */
export function buildArmorShrineStats113c(arg0: number): Record<string, number> {
  return {
    skill_armor_percent: Math.trunc(arg0),
  }
}

export interface CombatShrineSnapshotInput113c {
  /** Touch-time total Attack Rating of the activating player (`0x6FC89F1A -> 0x6FC89B00`). */
  readonly currentAttackRating: number
  /** `Shrines.txt` `Arg0` (`200` = `+200%` Attack Rating). */
  readonly arg0: number
  /** `Shrines.txt` `Arg1` (`200` = `+200%` physical damage via `STAT_DAMAGEPERCENT = 25`). */
  readonly arg1: number
}

export interface CombatShrineSnapshotStats113c {
  readonly tohit: number
  readonly damagepercent: number
  readonly [key: string]: number
}

/**
 * 1.13c `SHRINES_Combat` (`Code 7`, `state 129`, `D2Game.dll` `0x6FC8ACE0` / `0x6FC89EE0`):
 * - Calls `0x6FC89EE0(STAT_TOHIT = 0x13)` to snapshot `arBonus = trunc(currentAR * Arg0 / 100)`
 *   at shrine activation time (`0x6FC8AD23..0x6FC8AD29`), then attaches `STAT_TOHIT (19) = arBonus`
 *   (`0x6FC8AD4F..0x6FC8AD55`, never `item_tohit_percent` `119` or literal `tohit: 200`).
 * - Attaches `STAT_DAMAGEPERCENT (25) = Arg1` (`200`) via `SHRINES_AllocClearPreviousShrineStats`
 *   (`0x6FC8AD3F..0x6FC8AD4A`).
 */
export function buildCombatShrineSnapshot113c(
  input: CombatShrineSnapshotInput113c,
): CombatShrineSnapshotStats113c {
  const arBonus = Math.max(
    0,
    Math.trunc((Math.max(0, Math.trunc(input.currentAttackRating)) * input.arg0) / 100),
  )
  return {
    tohit: arBonus,
    damagepercent: Math.trunc(input.arg1),
  }
}
