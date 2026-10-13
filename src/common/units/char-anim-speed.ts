/**
 * Diablo II v1.13c Character Animation Speed & One-Shot Lifecycle Math.
 *
 * Ground Truth (`D2Common.dll` / `D2Client.dll` + `data/global/AnimData.d2` + `Weapons.txt`):
 * - Engine simulation rate is 25Hz (40ms per tick).
 * - `AnimData.d2` stores per-clip `frames` (frames per direction) and `speed` in 8.8 fixed-point
 *   where `256` = 1.0 frame per 40ms tick.
 * - Diminishing returns on item FCR / IAS / FHR:
 *     `diminished = floor(120 * rate / (120 + rate))` (for `rate > 0`; clamped to `[-85, 75]`).
 * - Spell casting (`SC`, mode 10):
 *     `EFCR = clamp(diminished(fcr), -85, 75)`
 * - Weapon attacks (`A1` / `A2`, modes 7 / 8):
 *     `EIAS = clamp(diminished(itemIas) + skillIas - weaponWsm, -85, 75)`
 *   where `weaponWsm` is the equipped weapon's `speed` column from 1.13c `Weapons.txt`.
 * - Get Hit recovery (`GH`, mode 4):
 *     `EFHR = clamp(diminished(fhr), -85, 75)`
 * - Effective 8.8 fixed-point step speed:
 *     `stepSpeed256 = max(32, floor(baseSpeed * (100 + effRate) / 100))`
 * - Locomotion exception (wl/tw/rn, `UNITS_UpdateRunWalkAnimRateAndVelocity` 0x6FD83331):
 *     bases are the hardcoded 213 (walk) / 101 (run); the scale is the move velocity
 *     percent `max(25, EFRW + STAT_VELOCITYPERCENT)` (run +50% via CharStats 9/6) with
 *     `stepSpeed256 = trunc(base × pct / 100)` and NO 32 floor (the 25 floor is on the
 *     percent), e.g. naked walk 213 / naked run 151 (issue #869).
 * - One-shot animation duration:
 *     `ticks = ceil(frames * 256 / stepSpeed256)`
 *     `durationMs = ticks * 40`
 */

import { RAW_ARMOR, RAW_WEAPONS } from '../data/canonical-drop-data.ts'
import { parseWeaponsTable, type WeaponBase, type WeaponTable } from '../items/weapons.ts'
import { getMonsterPathRecord } from '../path/units.ts'
import { getSkillAnimModes, resolveSkillSequenceFrame } from '../skills/skill-anim-modes.ts'

/** 1.13c simulation tick duration in milliseconds (25Hz). */
export const D2_TICK_MS = 40

/** 1.13c `ItemStatCost.txt` stat IDs for animation rate and light radius modifiers. */
export const STAT_SKILL_IAS = 68
export const STAT_LIGHTRADIUS = 89
/** `item_lightcolor` (0xRRGGBB); 0 keeps the player light white (issue #830). */
export const STAT_LIGHTCOLOR = 90
export const STAT_FASTERATTACKRATE = 93
export const STAT_FASTERMOVEVELOCITY = 96
export const STAT_FASTERHITRECOVERY = 99
export const STAT_FASTERBLOCKRATE = 102
export const STAT_FASTERCASTRATE = 105

export type CharAnimClipKey =
  | 'wl'
  | 'nu'
  | 'rn'
  | 'a1'
  | 'a2'
  | 'bl'
  | 'sc'
  | 'th'
  | 'kk'
  | 's1'
  | 's2'
  | 's3'
  | 's4'
  | 'gh'
  | 'dt'
  | 'dd'
  | 'tn'
  | 'tw'

export interface CharAnimClip113c {
  readonly frames: number
  readonly framesPerDir: number
  readonly speed: number
  readonly animSpeed: number
  readonly actionFrame: number
  readonly loop: boolean
  readonly events: readonly { readonly f: number; readonly c: number }[]
}

function makeClip113c(
  frames: number,
  speed: number,
  loop: boolean,
  events: readonly { readonly f: number; readonly c: number }[],
): CharAnimClip113c {
  return {
    frames,
    framesPerDir: frames,
    speed,
    animSpeed: speed,
    actionFrame: events[0]?.f ?? 0,
    loop,
    events,
  }
}

/**
 * Canonical 1.13c `AnimData.d2` clip metadata for all 7 playable classes (`0..6`:
 * `am, so, ne, pa, ba, dz, ai`), matching `public/entities/char-*.json`.
 */
export const CHAR_ANIM_CLIPS_113C: Readonly<
  Record<number, Readonly<Record<CharAnimClipKey, CharAnimClip113c>>>
> = {
  // 0: Amazon (am)
  0: {
    wl: makeClip113c(8, 256, true, []),
    nu: makeClip113c(8, 128, true, []),
    rn: makeClip113c(8, 256, true, []),
    a1: makeClip113c(13, 256, false, [{ f: 6, c: 1 }]),
    a2: makeClip113c(13, 256, false, [{ f: 6, c: 1 }]),
    bl: makeClip113c(3, 256, false, []),
    sc: makeClip113c(20, 256, false, [{ f: 13, c: 1 }]),
    th: makeClip113c(16, 256, false, [{ f: 9, c: 2 }]),
    kk: makeClip113c(12, 256, false, [{ f: 5, c: 1 }]),
    s1: makeClip113c(9, 256, false, [{ f: 2, c: 1 }]),
    s2: makeClip113c(9, 256, false, [{ f: 2, c: 1 }]),
    s3: makeClip113c(9, 256, false, [{ f: 2, c: 1 }]),
    s4: makeClip113c(9, 256, false, [{ f: 2, c: 1 }]),
    gh: makeClip113c(6, 256, false, []),
    dt: makeClip113c(23, 256, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(16, 80, true, []),
    tw: makeClip113c(8, 256, true, []),
  },
  // 1: Sorceress (so)
  1: {
    wl: makeClip113c(8, 256, true, []),
    nu: makeClip113c(8, 128, true, []),
    rn: makeClip113c(8, 256, true, []),
    a1: makeClip113c(16, 256, false, [{ f: 9, c: 1 }]),
    a2: makeClip113c(16, 256, false, [{ f: 8, c: 1 }]),
    bl: makeClip113c(5, 256, false, []),
    sc: makeClip113c(14, 256, false, [{ f: 7, c: 1 }]),
    th: makeClip113c(20, 256, false, [{ f: 10, c: 2 }]),
    kk: makeClip113c(12, 256, false, [{ f: 6, c: 1 }]),
    s1: makeClip113c(14, 256, false, [{ f: 7, c: 1 }]),
    s2: makeClip113c(14, 256, false, [{ f: 7, c: 1 }]),
    s3: makeClip113c(14, 256, false, [{ f: 7, c: 1 }]),
    s4: makeClip113c(14, 256, false, [{ f: 7, c: 1 }]),
    gh: makeClip113c(8, 256, false, []),
    dt: makeClip113c(24, 256, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(16, 80, true, []),
    tw: makeClip113c(8, 256, true, []),
  },
  // 2: Necromancer (ne)
  2: {
    wl: makeClip113c(8, 256, true, []),
    nu: makeClip113c(8, 128, true, []),
    rn: makeClip113c(8, 256, true, []),
    a1: makeClip113c(15, 256, false, [{ f: 9, c: 1 }]),
    a2: makeClip113c(15, 256, false, [{ f: 9, c: 1 }]),
    bl: makeClip113c(6, 256, false, []),
    sc: makeClip113c(16, 256, false, [{ f: 8, c: 1 }]),
    th: makeClip113c(20, 256, false, [{ f: 10, c: 2 }]),
    kk: makeClip113c(12, 256, false, [{ f: 6, c: 1 }]),
    s1: makeClip113c(16, 256, false, [{ f: 8, c: 1 }]),
    s2: makeClip113c(16, 256, false, [{ f: 8, c: 1 }]),
    s3: makeClip113c(16, 256, false, [{ f: 8, c: 1 }]),
    s4: makeClip113c(16, 256, false, [{ f: 8, c: 1 }]),
    gh: makeClip113c(7, 256, false, []),
    dt: makeClip113c(27, 176, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(16, 80, true, []),
    tw: makeClip113c(8, 256, true, []),
  },
  // 3: Paladin (pa)
  3: {
    wl: makeClip113c(10, 288, true, []),
    nu: makeClip113c(8, 184, true, []),
    rn: makeClip113c(8, 256, true, []),
    a1: makeClip113c(14, 256, false, [{ f: 7, c: 1 }]),
    a2: makeClip113c(14, 256, false, [{ f: 8, c: 1 }]),
    bl: makeClip113c(3, 256, false, []),
    sc: makeClip113c(16, 256, false, [{ f: 9, c: 1 }]),
    th: makeClip113c(12, 256, false, [{ f: 6, c: 2 }]),
    kk: makeClip113c(12, 256, false, [{ f: 5, c: 1 }]),
    s1: makeClip113c(12, 256, false, [{ f: 7, c: 1 }]),
    s2: makeClip113c(12, 256, false, [{ f: 7, c: 1 }]),
    s3: makeClip113c(12, 256, false, [{ f: 7, c: 1 }]),
    s4: makeClip113c(12, 256, false, [{ f: 7, c: 1 }]),
    gh: makeClip113c(5, 256, false, []),
    dt: makeClip113c(28, 256, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(16, 128, true, []),
    tw: makeClip113c(10, 288, true, []),
  },
  // 4: Barbarian (ba)
  4: {
    wl: makeClip113c(8, 168, true, []),
    nu: makeClip113c(8, 96, true, []),
    rn: makeClip113c(8, 216, true, []),
    a1: makeClip113c(12, 256, false, [{ f: 7, c: 1 }]),
    a2: makeClip113c(12, 256, false, [{ f: 7, c: 1 }]),
    bl: makeClip113c(4, 256, false, []),
    sc: makeClip113c(14, 256, false, [{ f: 9, c: 1 }]),
    th: makeClip113c(16, 256, false, [{ f: 8, c: 2 }]),
    kk: makeClip113c(12, 256, false, [{ f: 4, c: 1 }]),
    s1: makeClip113c(15, 256, false, []),
    s2: makeClip113c(15, 256, false, []),
    s3: makeClip113c(12, 256, false, [{ f: 7, c: 1 }]),
    s4: makeClip113c(16, 256, false, [{ f: 9, c: 2 }]),
    gh: makeClip113c(5, 256, false, []),
    dt: makeClip113c(27, 240, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(16, 80, true, []),
    tw: makeClip113c(8, 256, true, []),
  },
  // 5: Druid (dz)
  5: {
    wl: makeClip113c(8, 136, true, []),
    nu: makeClip113c(6, 120, true, []),
    rn: makeClip113c(8, 168, true, []),
    a1: makeClip113c(16, 256, false, [{ f: 8, c: 1 }]),
    a2: makeClip113c(16, 256, false, [{ f: 8, c: 1 }]),
    bl: makeClip113c(6, 256, false, []),
    sc: makeClip113c(15, 208, false, [{ f: 8, c: 1 }]),
    th: makeClip113c(18, 256, false, [{ f: 9, c: 2 }]),
    kk: makeClip113c(12, 256, false, [{ f: 5, c: 1 }]),
    s1: makeClip113c(15, 256, false, [{ f: 8, c: 1 }]),
    s2: makeClip113c(15, 256, false, [{ f: 8, c: 1 }]),
    s3: makeClip113c(15, 256, false, [{ f: 8, c: 1 }]),
    s4: makeClip113c(15, 256, false, [{ f: 8, c: 1 }]),
    gh: makeClip113c(7, 256, false, []),
    dt: makeClip113c(25, 176, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(16, 96, true, []),
    tw: makeClip113c(8, 128, true, []),
  },
  // 6: Assassin (ai)
  6: {
    wl: makeClip113c(8, 256, true, []),
    nu: makeClip113c(8, 128, true, []),
    rn: makeClip113c(8, 256, true, []),
    a1: makeClip113c(11, 256, false, [{ f: 6, c: 1 }]),
    a2: makeClip113c(12, 256, false, [{ f: 6, c: 1 }]),
    bl: makeClip113c(3, 256, false, []),
    sc: makeClip113c(17, 256, false, [{ f: 9, c: 1 }]),
    th: makeClip113c(16, 256, false, [{ f: 7, c: 2 }]),
    kk: makeClip113c(13, 256, false, [{ f: 4, c: 1 }]),
    s1: makeClip113c(17, 256, false, [{ f: 10, c: 1 }]),
    s2: makeClip113c(8, 128, false, [{ f: 4, c: 2 }]),
    s3: makeClip113c(10, 256, false, []),
    s4: makeClip113c(12, 208, false, [{ f: 6, c: 1 }]),
    gh: makeClip113c(5, 256, false, []),
    dt: makeClip113c(20, 208, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(12, 64, true, []),
    tw: makeClip113c(8, 256, true, []),
  },
}

const TOKEN_TO_CLASS_ID: Readonly<Record<string, number>> = {
  am: 0,
  ama: 0,
  amazon: 0,
  so: 1,
  sor: 1,
  sorceress: 1,
  ne: 2,
  nec: 2,
  necromancer: 2,
  pa: 3,
  pal: 3,
  paladin: 3,
  ba: 4,
  bar: 4,
  barbarian: 4,
  dz: 5,
  dru: 5,
  druid: 5,
  ai: 6,
  ass: 6,
  asn: 6,
  assassin: 6,
}

export const PLAYER_MODE_NUM_TO_CLIP: Readonly<Record<number, CharAnimClipKey>> = {
  0: 'dt',
  1: 'nu',
  2: 'wl',
  3: 'rn',
  4: 'gh',
  5: 'tn',
  6: 'tw',
  7: 'a1',
  8: 'a2',
  9: 'bl',
  10: 'sc',
  11: 'th', // TH (Throw)
  12: 'kk', // KK (Kick)
  13: 's1', // S1 (Skill 1)
  14: 's2', // S2 (Skill 2)
  15: 's3', // S3 (Skill 3)
  16: 's4', // S4 (Skill 4)
  17: 'dd',
  18: 'a1', // SQ (Sequence)
  19: 'gh', // KB (Knock back, token GH)
}

const VAMPIRE_MORPH_CLIPS_113C: Readonly<Partial<Record<CharAnimClipKey, CharAnimClip113c>>> = {
  wl: makeClip113c(8, 176, true, []),
  nu: makeClip113c(10, 176, true, []),
  rn: makeClip113c(8, 176, true, []),
  a1: makeClip113c(14, 240, false, [{ f: 4, c: 1 }]),
  a2: makeClip113c(14, 176, false, [{ f: 6, c: 2 }]),
  sc: makeClip113c(15, 160, false, [{ f: 3, c: 2 }]),
  s1: makeClip113c(15, 160, false, [{ f: 3, c: 2 }]),
  s2: makeClip113c(15, 160, false, [{ f: 3, c: 2 }]),
  s3: makeClip113c(15, 160, false, [{ f: 3, c: 2 }]),
  s4: makeClip113c(15, 160, false, [{ f: 3, c: 2 }]),
  gh: makeClip113c(6, 176, false, []),
  dt: makeClip113c(18, 240, false, []),
  dd: makeClip113c(1, 256, false, []),
  tn: makeClip113c(10, 176, true, []),
  tw: makeClip113c(8, 176, true, []),
}

/**
 * Canonical 1.13c `AnimData.d2` clip metadata for player shapeshift morphs
 * (`D2COMMON_11013_ConvertMode`: Werewolf state 139 -> 430 `40`, Werebear state 140 -> 431 `TG`,
 * Vampire state 176 `monsterset` -> `MonStats.txt` 135 `vampire5` token `VA`, or legacy 200 alias).
 */
export const MORPH_ANIM_CLIPS_113C: Readonly<
  Record<number, Readonly<Partial<Record<CharAnimClipKey, CharAnimClip113c>>>>
> = {
  // 430: Werewolf (token 40)
  430: {
    wl: makeClip113c(8, 224, true, []),
    nu: makeClip113c(8, 128, true, []),
    rn: makeClip113c(8, 240, true, []),
    a1: makeClip113c(13, 192, false, [{ f: 7, c: 1 }]),
    a2: makeClip113c(13, 216, false, [{ f: 9, c: 1 }]),
    sc: makeClip113c(11, 168, false, [{ f: 5, c: 1 }]),
    s1: makeClip113c(12, 232, false, [{ f: 7, c: 1 }]),
    s2: makeClip113c(12, 232, false, [{ f: 7, c: 1 }]),
    s3: makeClip113c(10, 144, false, [{ f: 6, c: 1 }]),
    s4: makeClip113c(16, 256, false, []),
    gh: makeClip113c(7, 296, false, []),
    dt: makeClip113c(19, 256, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(8, 128, true, []),
    tw: makeClip113c(8, 224, true, []),
  },
  // 431: Werebear (token TG)
  431: {
    wl: makeClip113c(8, 136, true, []),
    nu: makeClip113c(8, 96, true, []),
    rn: makeClip113c(8, 200, true, []),
    a1: makeClip113c(12, 160, false, [{ f: 7, c: 1 }]),
    a2: makeClip113c(12, 176, false, [{ f: 7, c: 1 }]),
    sc: makeClip113c(10, 152, false, [{ f: 5, c: 1 }]),
    s1: makeClip113c(10, 152, false, [{ f: 5, c: 1 }]),
    s2: makeClip113c(10, 152, false, [{ f: 5, c: 1 }]),
    s3: makeClip113c(10, 152, false, [{ f: 5, c: 1 }]),
    s4: makeClip113c(16, 256, false, []),
    gh: makeClip113c(8, 152, false, []),
    dt: makeClip113c(13, 256, false, []),
    dd: makeClip113c(1, 256, false, []),
    tn: makeClip113c(8, 96, true, []),
    tw: makeClip113c(8, 136, true, []),
  },
  // 135: Vampire (`vampire5` in MonStats.txt, States.txt row 176 `monsterset` gfxclass=135, token VA)
  135: VAMPIRE_MORPH_CLIPS_113C,
  // 200: Legacy Vampire morph alias
  200: VAMPIRE_MORPH_CLIPS_113C,
}

/**
 * Resolves the canonical 1.13c `AnimData.d2` clip metadata for a given character class
 * (`0..6` or token `'am'|'so'|'ne'|'pa'|'ba'|'dz'|'ai'`) and mode (`0..18` or clip key),
 * honoring shapeshift morph records (`430` Werewolf, `431` Werebear, `200` Vampire) and
 * weapon-class (`wclass`) variations in `AnimData.d2`.
 */
export function getCharAnimClip113c(
  classIdOrToken: number | string,
  modeOrClipKey: number | string,
  options?: {
    readonly weaponClass?: string | null | undefined
    readonly morphMonsterClassId?: number | null | undefined
  },
): CharAnimClip113c {
  const classId =
    typeof classIdOrToken === 'number'
      ? classIdOrToken >= 0 && classIdOrToken <= 6
        ? Math.trunc(classIdOrToken)
        : 1
      : (TOKEN_TO_CLASS_ID[classIdOrToken.trim().toLowerCase()] ?? 1)
  const classClips = CHAR_ANIM_CLIPS_113C[classId] ?? CHAR_ANIM_CLIPS_113C[1]!

  const clipKey: CharAnimClipKey =
    typeof modeOrClipKey === 'number'
      ? (PLAYER_MODE_NUM_TO_CLIP[Math.trunc(modeOrClipKey)] ?? 'nu')
      : ((modeOrClipKey.trim().toLowerCase() as CharAnimClipKey) in classClips
          ? (modeOrClipKey.trim().toLowerCase() as CharAnimClipKey)
          : 'nu')

  if (options?.morphMonsterClassId !== undefined && options.morphMonsterClassId !== null) {
    const morphClips = MORPH_ANIM_CLIPS_113C[Math.trunc(options.morphMonsterClassId)]
    if (morphClips?.[clipKey]) {
      return morphClips[clipKey]!
    }
  }

  const baseClip = classClips[clipKey] ?? classClips.nu
  const wclass = options?.weaponClass ? options.weaponClass.trim().toLowerCase() : ''
  if (wclass) {
    // Amazon SC actionFrame varies by wclass in 1.13c AnimData.d2:
    // 2hs/2ht -> 10, stf -> 11, bow -> 12, hth/1hs/1ht/xbw -> 13
    if (classId === 0 && clipKey === 'sc') {
      if (wclass === '2hs' || wclass === '2ht') {
        return makeClip113c(20, 256, false, [{ f: 10, c: 1 }])
      }
      if (wclass === 'stf') {
        return makeClip113c(20, 256, false, [{ f: 11, c: 1 }])
      }
      if (wclass === 'bow') {
        return makeClip113c(20, 256, false, [{ f: 12, c: 1 }])
      }
    }
    // Druid S1 speed is 208 for 2hs/2ht/bow/stf in 1.13c AnimData.d2 (DZS12HS/2HT/BOW/STF)
    if (classId === 5 && clipKey === 's1') {
      if (wclass === '2hs' || wclass === '2ht' || wclass === 'bow' || wclass === 'stf') {
        return makeClip113c(15, 208, false, [{ f: 8, c: 1 }])
      }
    }
    // Assassin S1 has 15 frames (actionFrame 7) for non-hth/ht1/ht2 weapons in 1.13c AnimData.d2
    if (classId === 6 && clipKey === 's1') {
      if (
        wclass === '1hs' ||
        wclass === '1ht' ||
        wclass === '2hs' ||
        wclass === '2ht' ||
        wclass === 'bow' ||
        wclass === 'stf' ||
        wclass === 'xbw'
      ) {
        return makeClip113c(15, 256, false, [{ f: 7, c: 1 }])
      }
    }
  }

  return baseClip
}

/**
 * 1.13c diminishing returns formula (`D2Common.dll`):
 * `floor(120 * rate / (120 + rate))` for `rate > 0`.
 */
export function computeDiminishingRate113c(rate: number): number {
  if (!Number.isFinite(rate)) return 0
  if (rate <= 0) return Math.max(-85, Math.trunc(rate))
  return Math.trunc((120 * rate) / (120 + rate))
}

/**
 * Effective Faster Cast Rate (`EFCR = clamp(diminished(fcr), -85, 75)`).
 */
export function computeEffectiveFcr(fcr: number): number {
  return Math.max(-85, Math.min(75, computeDiminishingRate113c(fcr)))
}

/**
 * Effective Increased Attack Speed (`EIAS = clamp(diminished(itemIas) + skillIas - weaponWsm, -85, 75)`).
 * Accepts either an options object `{ itemIas, skillIas, weaponWsm }` or positional `(itemIas, skillIas, weaponWsm)`.
 */
export function computeEffectiveIas(
  input:
    | {
        readonly itemIas: number
        readonly skillIas?: number | undefined
        readonly weaponWsm?: number | undefined
      }
    | number,
  skillIasArg = 0,
  weaponWsmArg = 0,
): number {
  const itemIas = typeof input === 'number' ? input : input.itemIas
  const skillIas = typeof input === 'number' ? skillIasArg : (input.skillIas ?? 0)
  const weaponWsm = typeof input === 'number' ? weaponWsmArg : (input.weaponWsm ?? 0)
  const dimIas = computeDiminishingRate113c(itemIas)
  const safeSkillIas = Number.isFinite(skillIas) ? Math.trunc(skillIas) : 0
  const safeWsm = Number.isFinite(weaponWsm) ? Math.trunc(weaponWsm) : 0
  return Math.max(-85, Math.min(75, dimIas + safeSkillIas - safeWsm))
}

/**
 * Effective Faster Hit Recovery (`EFHR = clamp(diminished(fhr), -85, 75)`).
 */
export function computeEffectiveFhr(fhr: number): number {
  return Math.max(-85, Math.min(75, computeDiminishingRate113c(fhr)))
}

/**
 * Effective 8.8 fixed-point animation step speed:
 * `stepSpeed256 = max(32, floor(baseSpeed * (100 + effRate) / 100))`.
 */
export function computeStepSpeed256(baseSpeed: number, effRate = 0): number {
  const safeBase = Number.isFinite(baseSpeed) && baseSpeed > 0 ? baseSpeed : 256
  const safeRate = Number.isFinite(effRate) ? effRate : 0
  return Math.max(32, Math.floor((safeBase * (100 + safeRate)) / 100))
}

/** 1.13c `STAT_VELOCITYPERCENT` (ItemStatCost.txt id 67): total move velocity percent (base 100). */
export const STAT_VELOCITYPERCENT = 67

/** Player walk/town-walk base anim speed hardcode (`UNITS_GetBaseAnimSpeed`, 0x6FD7FB10). */
export const PLAYER_WALK_BASE_ANIM_SPEED_113C = 213

/** Player run base anim speed hardcode (`UNITS_GetBaseAnimSpeed`, 0x6FD7FB10). */
export const PLAYER_RUN_BASE_ANIM_SPEED_113C = 101

/**
 * D2Common.dll `UNITS_GetBaseAnimSpeed` (1.13c 0x6FD7FB10, D2MOO Units.cpp:1256): player
 * locomotion animation BASE speeds are HARDCODED for all 7 classes and IGNORE the per-COF
 * AnimData.d2 speeds:
 * - run (`PLRMODE_RUN` 3): 101 (0x65)
 * - every other player mode (walk 2 / town-walk 6 / neutral / attack / cast / …): 213 (0xD5)
 *
 * The run bonus is NOT baked into the base: the engine writes a temporary
 * `STAT_VELOCITYPERCENT` stat when a character enters run mode
 * (`UNITS_CharacterStartRunningOrKnockback`, Units.cpp:701:
 * `100 * RunVelocity / WalkVelocity - 100`), then scales the base by the total move velocity
 * percent (`UNITS_UpdateRunWalkAnimRateAndVelocity`, 0x6FD83331):
 * `trunc(base × max(25, EFRW + stat67) / 100)`. With the effective 1.13c
 * `CharStats.txt` (`Patch_D2.mpq`, all 7 classes `WalkVelocity=6` / `RunVelocity=9`) the
 * run bonus is +50%, so naked locomotion resolves to walk 213 / run 151.
 *
 * NOTE (issue #869): the previously baked `rn = 158` came from `100×157/100` with the
 * classic `d2data.mpq` `CharStats.txt` (`WalkVelocity=7` / `RunVelocity=11`, +57%) — a
 * pre-LoD table that `Patch_D2.mpq` overrides at MPQ-load time, so it is not the 1.13c
 * runtime truth (verified against the staged vanilla 1.13c MPQs and the SOE mod MPQs,
 * which all ship 6/9).
 *
 * AnimData per-COF speeds apply only to monsters/objects/missiles and to the player's
 * non-locomotion modes (cast/attack/gethit use `pAnimData->dwAnimSpeed` via the
 * mode-specific rate formulas). Using AnimData's 256/288/168 for player walk made
 * locomotion play ~1.2x (walk) to ~1.6x (run) faster than the native client (issue #852).
 */
export function resolvePlayerLocomotionBaseSpeed256(
  clipKey: string,
  animDataBaseSpeed: number,
): number {
  if (clipKey === 'rn') return PLAYER_RUN_BASE_ANIM_SPEED_113C
  if (clipKey === 'wl' || clipKey === 'tw') return PLAYER_WALK_BASE_ANIM_SPEED_113C
  return animDataBaseSpeed
}

/**
 * Diminishing-returns base for `STAT_ITEM_FASTERMOVEVELOCITY` (96)
 * (`gaAnimModeStatBasePercentage[ANIMMODESTAT_MOVEVELOCITY]` @ 0x6FDE4608: `{TRUE, 150, 96}`).
 */
export const MOVE_VELOCITY_DIMINISHING_BASE_113C = 150

/**
 * Effective item FRW: `trunc(150 × frw / (150 + frw))` for `frw > 0` (negative totals pass
 * through unchanged; `UNITS_GetAnimStatBasePercentage` skips the formula for zero).
 */
export function computeFrwDiminishing113c(frw: number): number {
  if (!Number.isFinite(frw)) return 0
  const v = Math.trunc(frw)
  if (v <= 0) return v
  return Math.trunc((MOVE_VELOCITY_DIMINISHING_BASE_113C * v) / (MOVE_VELOCITY_DIMINISHING_BASE_113C + v))
}

export interface MoveVelocityPercentSources113c {
  /**
   * Complete `STAT_VELOCITYPERCENT` (67) total for the unit — base 100 plus skill velocity
   * (Vigor/Burst of Speed), minus the armor items' implicit `-Armor.txt speed` stat and
   * chill/slow. When provided (nonzero) it is used as-is and neither the run bonus nor the
   * armor penalty is applied again; when absent the client synthesizes
   * `100 + run bonus − armorSpeedPenalty` (the native engine posts the run temp stat
   * client-side as well, `UNITS_SetAnimStartFrame` → `CharacterStartRunningOrKnockback`,
   * and the armor penalty is an implicit item stat).
   *
   * Armor penalty note (vanilla vs SOE): vanilla 1.13c ships medium 5 / heavy 10 torso
   * rows in `Armor.txt` (36 nonzero rows in Patch_D2.mpq); the SOE mod zeroes the whole
   * column. This port replicates vanilla 1.13c, so the penalty IS applied from the
   * canonical table when the server total is unavailable.
   */
  readonly stat67?: number | undefined
  /** Raw `STAT_ITEM_FASTERMOVEVELOCITY` (96) total from equipped items (diminishing base 150). */
  readonly itemFrw?: number | undefined
  /**
   * Sum of `Armor.txt` `speed` for equipped armor items (positive percent). Only used when
   * `stat67` is not provided; a server-provided total already contains the implicit
   * item stats.
   */
  readonly armorSpeedPenalty?: number | undefined
  /**
   * Skill velocity bonus (`STAT_VELOCITYPERCENT = 67`, e.g. Barbarian `#148 Increased Speed`
   * `dm12(7, 50)`, Paladin `#115 Vigor`, Assassin `#258 Burst of Speed`) added directly to
   * `stat67` without the 150-base item FRW diminishing returns when `stat67` is synthesized.
   */
  readonly skillVelocityPercent?: number | undefined
  /** Run mode active (`PLRMODE_RUN` 3): applies the CharStats run bonus (+50% at 9/6). */
  readonly running?: boolean | undefined
  /** `CharStats.txt` `WalkVelocity` (default 6, the effective 1.13c value). */
  readonly walkVelocity?: number | undefined
  /** `CharStats.txt` `RunVelocity` (default 9, the effective 1.13c value). */
  readonly runVelocity?: number | undefined
}

/**
 * Total move velocity percent (`UNITS_UpdateRunWalkAnimRateAndVelocity`, 0x6FD83331):
 * `max(25, EFRW + STAT_VELOCITYPERCENT)` — the 25 floor applies to the percent, NOT to the
 * resulting anim speed (so a floored run animates at `trunc(101×25/100) = 25`, not 32).
 */
export function computeMoveVelocityPercent113c(sources: MoveVelocityPercentSources113c = {}): number {
  const walk = sources.walkVelocity ?? 6
  const run = sources.runVelocity ?? 9
  const efrw = computeFrwDiminishing113c(sources.itemFrw ?? 0)
  let stat67: number
  if (Number.isFinite(sources.stat67) && Math.trunc(sources.stat67 as number) !== 0) {
    stat67 = Math.trunc(sources.stat67 as number)
  } else {
    const runBonus = sources.running && walk > 0 ? Math.trunc((100 * run) / walk) - 100 : 0
    const armorPenalty = Math.max(0, Math.trunc(sources.armorSpeedPenalty ?? 0))
    const skillVel = Number.isFinite(sources.skillVelocityPercent)
      ? Math.trunc(sources.skillVelocityPercent as number)
      : 0
    stat67 = 100 + runBonus + skillVel - armorPenalty
  }
  return Math.max(25, stat67 + efrw)
}

/**
 * Locomotion step speed (`UNITS_UpdateRunWalkAnimRateAndVelocity`, 0x6FD83331):
 * `trunc(base × velocityPercent / 100)` clamped to `[0, 32767]` with NO 32 floor — unlike
 * {@link computeStepSpeed256}, whose floor exists for the one-shot rate formulas only.
 */
export function computeLocomotionStepSpeed256(baseSpeed: number, velocityPercent: number): number {
  const safeBase = Number.isFinite(baseSpeed) && baseSpeed > 0 ? Math.trunc(baseSpeed) : 0
  const pct = Number.isFinite(velocityPercent) ? Math.trunc(velocityPercent) : 100
  const raw = Math.trunc((safeBase * pct) / 100)
  return Math.max(0, Math.min(32767, raw))
}

/**
 * Total 25Hz simulation ticks for a standard non-sequence one-shot animation
 * (`D2Common.dll` `#10426` `UNITS_IsAtEndOfFrameCycle`, `0x6FD7EF30` at `0x6FD7EF6D`:
 * `dwFrame + wAnimSpeed >= dwFrameCount` where `dwFrameCount = frames << 8`):
 * `max(1, ceil(frames * 256 / stepSpeed256) - 1)`.
 */
export function computeOneShotTicks(frames: number, stepSpeed256: number): number {
  const safeFrames = Math.max(1, Math.trunc(Number.isFinite(frames) ? frames : 1))
  const safeSpeed = Math.max(32, Math.trunc(Number.isFinite(stepSpeed256) ? stepSpeed256 : 256))
  if (safeFrames <= 1) return 1
  return Math.max(1, Math.ceil((safeFrames * 256) / safeSpeed) - 1)
}

/**
 * Total duration in milliseconds for a standard non-sequence one-shot animation at 25Hz (40ms per tick):
 * `computeOneShotTicks(frames, stepSpeed256) * 40`.
 */
export function computeOneShotDurationMs(frames: number, stepSpeed256: number): number {
  return computeOneShotTicks(frames, stepSpeed256) * D2_TICK_MS
}

/**
 * Total 25Hz simulation ticks for a `PLRMODE_SEQUENCE` (`SQ` mode 18) animation
 * (`D2Common.dll` `#10426` `0x6FD7EF57` when `pSeqRecord != NULL`: `dwFrame >= dwFrameCount`):
 * `max(1, ceil(totalSequenceFrames * 256 / stepSpeed256))`.
 */
export function computeSequenceTicks(totalSequenceFrames: number, stepSpeed256: number): number {
  const safeFrames = Math.max(
    1,
    Math.trunc(Number.isFinite(totalSequenceFrames) ? totalSequenceFrames : 1),
  )
  const safeSpeed = Math.max(32, Math.trunc(Number.isFinite(stepSpeed256) ? stepSpeed256 : 256))
  return Math.max(1, Math.ceil((safeFrames * 256) / safeSpeed))
}

/**
 * Total duration in milliseconds for a `PLRMODE_SEQUENCE` (`SQ` mode 18) animation at 25Hz (40ms per tick).
 */
export function computeSequenceDurationMs(
  totalSequenceFrames: number,
  stepSpeed256: number,
): number {
  return computeSequenceTicks(totalSequenceFrames, stepSpeed256) * D2_TICK_MS
}

/**
 * Simulation ticks from animation start (frame 0) until `dwFrame >= actionFrame << 8`:
 * `max(1, ceil(actionFrame * 256 / stepSpeed256))`.
 */
export function computeActionFrameTicks(actionFrame: number, stepSpeed256: number): number {
  return computeSequenceTicks(actionFrame, stepSpeed256)
}

let cachedWeaponsTable: WeaponTable | null = null

/**
 * Lazily parses and memoizes the canonical 1.13c `Weapons.txt` table (`RAW_WEAPONS`).
 */
export function getCanonicalWeaponsTable(): WeaponTable {
  if (!cachedWeaponsTable) {
    cachedWeaponsTable = parseWeaponsTable(RAW_WEAPONS)
  }
  return cachedWeaponsTable
}

/**
 * Resolves a weapon record from canonical 1.13c `Weapons.txt` by item code.
 */
export function resolveWeaponBase113c(code: string | undefined | null): WeaponBase | undefined {
  if (!code) return undefined
  const trimmed = code.trim()
  if (!trimmed) return undefined
  return getCanonicalWeaponsTable().get(trimmed)
}

/**
 * Resolves the 1.13c Weapon Speed Modifier (`WSM`, `speed` column in `Weapons.txt`) for an item code.
 * Unarmed (`hth`) or non-weapon codes return `0`.
 */
export function resolveWeaponWsm(code: string | undefined | null): number {
  const weapon = resolveWeaponBase113c(code)
  return weapon ? weapon.speed : 0
}

let cachedArmorSpeedsByCode: Map<string, number> | null = null

/**
 * Canonical 1.13c `Armor.txt` `speed` column by item code (vanilla values: medium torso
 * armors 5, heavy 10 — 36 nonzero rows; the SOE mod zeroes the column, but this port
 * replicates vanilla 1.13c).
 */
function getCanonicalArmorSpeeds(): Map<string, number> {
  if (!cachedArmorSpeedsByCode) {
    const map = new Map<string, number>()
    const lines = RAW_ARMOR.split(/\r?\n/).filter((l) => l.trim() !== '')
    const header = lines[0]?.split('\t') ?? []
    const codeIdx = header.indexOf('code')
    const speedIdx = header.indexOf('speed')
    if (codeIdx >= 0 && speedIdx >= 0) {
      for (const line of lines.slice(1)) {
        const cells = line.split('\t')
        const code = (cells[codeIdx] ?? '').trim()
        if (!code || code === 'Expansion') continue
        const raw = (cells[speedIdx] ?? '').trim()
        const val = raw === '' ? 0 : Number(raw)
        map.set(code.toLowerCase(), Number.isFinite(val) ? val : 0)
      }
    }
    cachedArmorSpeedsByCode = map
  }
  return cachedArmorSpeedsByCode
}

/**
 * Resolves the 1.13c `Armor.txt` `speed` value for an item code (0 for non-armor codes).
 * The engine bakes this into every armor item as an implicit
 * `STAT_VELOCITYPERCENT = -speed` stat (D2MOO `Items.cpp:5365`,
 * `ITEMS_CheckItemTypeId(pItem, ITEMTYPE_ANY_ARMOR)`), so the penalty applies to walk,
 * run and town-walk alike through the shared move velocity percent.
 */
export function resolveArmorSpeed113c(code: string | undefined | null): number {
  if (!code) return 0
  const trimmed = code.trim()
  if (!trimmed) return 0
  return getCanonicalArmorSpeeds().get(trimmed.toLowerCase()) ?? 0
}

export interface EquippedItemStatLike {
  readonly statId?: number | undefined
  readonly id?: number | undefined
  readonly param?: number | undefined
  readonly value: number
}

export interface EquippedItemLike {
  readonly id?: number | undefined
  readonly code?: string | undefined
  readonly equippedSlot?: number | undefined
  readonly equipSlot?: number | undefined
  readonly bodyLoc?: number | undefined
  readonly broken?: boolean | undefined
  readonly inSocket?: boolean | undefined
  readonly stats?: readonly EquippedItemStatLike[] | undefined
  readonly runewordStats?: readonly EquippedItemStatLike[] | undefined
  // Item-specific set lists are deliberately absent: they are only active per SetItems.txt
  // `add func` gating, so callers pass the already-gated `setBonusStats` source instead
  // (`computeSetBonusStats` in `src/client/ui-model/set-bonuses.ts`, PROJECT.md rule 18).
}

export interface StatListReaderLike {
  get(statId: number, param?: number): number
  has?(statId: number, param?: number): boolean
}

/**
 * Resolves the effective Weapon Speed Modifier (`WSM`) across equipped items.
 * Prefers primary/secondary weapon arm slots (4 = right arm, 5 = left arm); if dual-wielding two
 * weapons in slots 4 and 5, averages their WSM (`trunc((wsm4 + wsm5) / 2)`).
 */
export function resolveEquippedWeaponWsm(
  equipment?: Iterable<EquippedItemLike> | null,
): number {
  if (!equipment) return 0
  let slot4Wsm: number | undefined
  let slot5Wsm: number | undefined
  let fallbackWsm: number | undefined

  for (const item of equipment) {
    if (!item || item.broken || item.inSocket) continue
    const weapon = resolveWeaponBase113c(item.code)
    if (!weapon) continue
    const slot = item.equippedSlot ?? item.equipSlot ?? item.bodyLoc ?? 0
    if (slot === 4 && slot4Wsm === undefined) {
      slot4Wsm = weapon.speed
    } else if (slot === 5 && slot5Wsm === undefined) {
      slot5Wsm = weapon.speed
    } else if (fallbackWsm === undefined) {
      fallbackWsm = weapon.speed
    }
  }

  if (slot4Wsm !== undefined && slot5Wsm !== undefined) {
    return Math.trunc((slot4Wsm + slot5Wsm) / 2)
  }
  if (slot4Wsm !== undefined) return slot4Wsm
  if (slot5Wsm !== undefined) return slot5Wsm
  return fallbackWsm ?? 0
}

function sumItemStatList(
  stats: readonly EquippedItemStatLike[] | undefined,
  targetStatId: number,
): number {
  if (!stats || stats.length === 0) return 0
  let total = 0
  for (const s of stats) {
    const id = s.statId ?? s.id
    if (id === targetStatId && Number.isFinite(s.value)) {
      total += s.value
    }
  }
  return total
}

/**
 * Resolves the total value of `statId` for a character from both `StatList` (`unitStats` / `selfStats`)
 * and equipped items (`equipment` + socketed children in `sockets`), plus the already-gated set bonus
 * stats (`setBonusStats`, from `computeSetBonusStats`; omitted → set bonuses are excluded, never summed
 * from the items' raw set lists).
 */
export function resolveCharacterStatTotal(
  statId: number,
  sources: {
    readonly unitStats?: StatListReaderLike | null | undefined
    readonly selfStats?: StatListReaderLike | null | undefined
    readonly equipment?: Iterable<EquippedItemLike> | null | undefined
    readonly sockets?: ReadonlyMap<number, readonly EquippedItemLike[]> | null | undefined
    readonly setBonusStats?: readonly EquippedItemStatLike[] | null | undefined
  },
): number {
  const unitVal = sources.unitStats ? sources.unitStats.get(statId) : 0
  const selfVal = sources.selfStats ? sources.selfStats.get(statId) : 0
  // `StatSet` writes the same wire value to both `self.stats` and `selfUnit.stats`.
  // Use `unitVal` if non-zero, otherwise `selfVal` (e.g., if `StatSet` arrived before `UnitAssign`).
  const baseStatVal = unitVal !== 0 ? unitVal : selfVal

  let equipTotal = 0
  const visitedIds = new Set<number>()

  const addFromItem = (item: EquippedItemLike, includeRuneword: boolean): void => {
    if (!item || item.broken) return
    if (item.id !== undefined) {
      if (visitedIds.has(item.id)) return
      visitedIds.add(item.id)
    }
    equipTotal += sumItemStatList(item.stats, statId)
    if (includeRuneword) {
      equipTotal += sumItemStatList(item.runewordStats, statId)
    }
  }

  if (sources.equipment) {
    for (const item of sources.equipment) {
      if (!item || item.broken || item.inSocket) continue
      addFromItem(item, true)
      if (item.id !== undefined && sources.sockets) {
        const children = sources.sockets.get(item.id)
        if (children) {
          for (const child of children) {
            addFromItem(child, false)
          }
        }
      }
    }
  }

  equipTotal += sumItemStatList(sources.setBonusStats ?? undefined, statId)

  return baseStatVal + equipTotal
}

export interface CharacterAnimSpeedParams {
  readonly clipKey: CharAnimClipKey
  readonly frames: number
  readonly baseSpeed: number
  readonly loop: boolean
  readonly effRate: number
  readonly stepSpeed256: number
  readonly durationMs: number
  /** Locomotion clips only (`wl`/`tw`/`rn`): the move velocity percent driving `stepSpeed256`. */
  readonly velocityPercent?: number | undefined
  readonly fcr: number
  readonly itemIas: number
  readonly skillIas: number
  readonly weaponWsm: number
  readonly fhr: number
}

/**
 * Effective animation rate modifier (`[-85, 75]`) for a given player mode / clip key in 1.13c:
 * - `sc` (mode 10) uses `EFCR` (`fcr`).
 * - `sq` (mode 18): per `D2Common.dll` `UNITS_IsCastAnimMode` (`0x6FD80B80`) and
 *   `UNITS_UpdateAnimRateAndVelocity` (`0x6FD834CD`), if the skill's `seqTrans` is `'SC'` or `'SQ'`
 *   (`#41 Inferno`, `#49 Lightning`, `#53 Chain Lightning`, `#229 Molten Boulder`,
 *   `#230 Arctic Blast`, `#234 Fissure`, `#244 Volcano`), it uses `EFCR`; otherwise (`seqTrans === 'A1'`),
 *   it uses `EIAS` with the `-30` sequence penalty (`0x6FD834CD: sub esi, 0x1E`).
 * - `a1`, `a2`, `th`, `kk`, `s1`, `s2` (Assassin trap-laying `#261, #262, #271, #272, #276`),
 *   `s3`, `s4` use `EIAS` (`itemIas + skillIas - weaponWsm`).
 * - `gh` (mode 4) and `bl` (mode 9) use `EFHR` / `EFBR` (`fhr` / `fbr`).
 */
export function computeEffectiveAnimRate113c(
  modeOrClipKey: number | string,
  stats: {
    readonly fcr?: number | undefined
    readonly itemIas?: number | undefined
    readonly ias?: number | undefined
    readonly skillIas?: number | undefined
    readonly weaponWsm?: number | undefined
    readonly wsm?: number | undefined
    readonly fhr?: number | undefined
    readonly fbr?: number | undefined
    readonly skillId?: number | undefined
    readonly seqTrans?: string | undefined
  } = {},
): number {
  const isSequenceMode =
    modeOrClipKey === 18 ||
    (typeof modeOrClipKey === 'string' && modeOrClipKey.trim().toLowerCase() === 'sq')
  if (isSequenceMode) {
    const seqTrans = (
      stats.seqTrans ??
      (stats.skillId !== undefined ? getSkillAnimModes(stats.skillId).seqTrans : 'A1')
    )
      .trim()
      .toUpperCase()
    if (seqTrans === 'SC' || seqTrans === 'SQ') {
      return computeEffectiveFcr(stats.fcr ?? 0)
    }
    return computeEffectiveIas({
      itemIas: stats.itemIas ?? stats.ias ?? 0,
      skillIas: (stats.skillIas ?? 0) - 30,
      weaponWsm: stats.weaponWsm ?? stats.wsm ?? 0,
    })
  }
  const clipKey: CharAnimClipKey =
    typeof modeOrClipKey === 'number'
      ? (PLAYER_MODE_NUM_TO_CLIP[Math.trunc(modeOrClipKey)] ?? 'nu')
      : ((modeOrClipKey.trim().toLowerCase() as CharAnimClipKey) || 'nu')
  if (clipKey === 'sc') {
    return computeEffectiveFcr(stats.fcr ?? 0)
  }
  if (
    clipKey === 'a1' ||
    clipKey === 'a2' ||
    clipKey === 'th' ||
    clipKey === 'kk' ||
    clipKey === 's1' ||
    clipKey === 's2' ||
    clipKey === 's3' ||
    clipKey === 's4'
  ) {
    return computeEffectiveIas({
      itemIas: stats.itemIas ?? stats.ias ?? 0,
      skillIas: stats.skillIas ?? 0,
      weaponWsm: stats.weaponWsm ?? stats.wsm ?? 0,
    })
  }
  if (clipKey === 'gh') {
    return computeEffectiveFhr(stats.fhr ?? 0)
  }
  if (clipKey === 'bl') {
    return computeEffectiveFhr(stats.fbr ?? stats.fhr ?? 0)
  }
  return 0
}

/**
 * Resolves the effective weapon animation class (`wclass`, e.g. `'hth'`, `'1hs'`, `'1ht'`, `'2hs'`,
 * `'2ht'`, `'bow'`, `'xbw'`, `'stf'`, `'ht1'`, `'ht2'`) from equipped items or weapon code.
 */
export function resolveEquippedWeaponClass(
  equipment?: Iterable<EquippedItemLike> | null,
  weaponCode?: string | null,
): string {
  if (weaponCode) {
    const base = resolveWeaponBase113c(weaponCode)
    if (base?.wclass) return base.wclass.toLowerCase()
  }
  if (equipment) {
    let slot4Weapon: WeaponBase | undefined
    let slot5Weapon: WeaponBase | undefined
    let fallbackWeapon: WeaponBase | undefined
    for (const item of equipment) {
      if (!item || item.broken || item.inSocket) continue
      const w = resolveWeaponBase113c(item.code)
      if (!w) continue
      const slot = item.equippedSlot ?? item.equipSlot ?? item.bodyLoc ?? 0
      if (slot === 4 && !slot4Weapon) slot4Weapon = w
      else if (slot === 5 && !slot5Weapon) slot5Weapon = w
      else if (!fallbackWeapon) fallbackWeapon = w
    }
    if (slot4Weapon && slot5Weapon) {
      if (slot4Weapon.wclass === 'ht1' && slot5Weapon.wclass === 'ht1') return 'ht2'
      return '1hs'
    }
    const primary = slot4Weapon ?? slot5Weapon ?? fallbackWeapon
    if (primary?.wclass) return primary.wclass.toLowerCase()
  }
  return 'hth'
}

/**
 * Resolves full 1.13c animation speed parameters (`frames`, `baseSpeed`, `effRate`, `stepSpeed256`,
 * `durationMs`) for a character class and animation mode given their stats and equipped items.
 */
export function resolveCharacterAnimSpeedParams(
  classIdOrToken: number | string,
  modeOrClipKey: number | string,
  sources: {
    readonly unitStats?: StatListReaderLike | null | undefined
    readonly selfStats?: StatListReaderLike | null | undefined
    readonly equipment?: Iterable<EquippedItemLike> | null | undefined
    readonly sockets?: ReadonlyMap<number, readonly EquippedItemLike[]> | null | undefined
    readonly setBonusStats?: readonly EquippedItemStatLike[] | null | undefined
    readonly weaponCode?: string | null | undefined
    readonly weaponClass?: string | null | undefined
    readonly weaponWsmOverride?: number | null | undefined
    readonly skillId?: number | null | undefined
    /**
     * Complete `STAT_VELOCITYPERCENT` (67) total as tracked for the unit by the caller
     * (e.g. the server-reported move velocity percent). Overrides the stat-list lookup for
     * locomotion clips; when neither is present the base 100 (+50 run) is synthesized.
     */
    readonly stat67VelocityPercent?: number | null | undefined
    /**
     * Skill velocity bonus (`STAT_VELOCITYPERCENT = 67`, e.g. Barbarian `#148 Increased Speed`
     * `dm12(7, 50)`) added directly to `stat67` when `stat67` is synthesized.
     */
    readonly skillVelocityPercent?: number | null | undefined
    /**
     * Shapeshift monster class id (`D2COMMON_11013_ConvertMode`: Werewolf state 139 → 430,
     * Werebear state 140 → 431, Vampire state 65 → 200). For locomotion clips (`wl`/`tw`/`rn`),
     * `UNITS_GetBaseAnimSpeed` takes the monster's `MonStats` `WalkAnimSpeed` / `RunAnimSpeed`
     * instead of the human player's hardcoded `213` / `101`, while for non-locomotion modes
     * (`sc`, `a1`, `a2`, `s1`..`s4`, `gh`) `AnimData.d2` supplies the morph token's (`40`/`TG`/`VA`)
     * frame count, base speed, and action frame.
     */
    readonly morphMonsterClassId?: number | null | undefined
  } = {},
): CharacterAnimSpeedParams {
  const equipmentList = sources.equipment ? Array.from(sources.equipment) : undefined
  const normalizedSources = {
    ...sources,
    equipment: equipmentList,
  }
  const resolvedWClass =
    sources.weaponClass && sources.weaponClass.trim() !== ''
      ? sources.weaponClass.trim().toLowerCase()
      : resolveEquippedWeaponClass(equipmentList, sources.weaponCode)

  const isSequenceMode =
    modeOrClipKey === 18 ||
    (typeof modeOrClipKey === 'string' && modeOrClipKey.trim().toLowerCase() === 'sq')

  const fcr = resolveCharacterStatTotal(STAT_FASTERCASTRATE, normalizedSources)
  const itemIas = resolveCharacterStatTotal(STAT_FASTERATTACKRATE, normalizedSources)
  const skillIas = resolveCharacterStatTotal(STAT_SKILL_IAS, normalizedSources)
  const fhr = resolveCharacterStatTotal(STAT_FASTERHITRECOVERY, normalizedSources)
  const fbr = resolveCharacterStatTotal(STAT_FASTERBLOCKRATE, normalizedSources)
  const weaponWsm =
    sources.weaponWsmOverride !== undefined && sources.weaponWsmOverride !== null
      ? sources.weaponWsmOverride
      : sources.weaponCode
        ? resolveWeaponWsm(sources.weaponCode)
        : resolveEquippedWeaponWsm(equipmentList)

  if (isSequenceMode) {
    const animModes =
      sources.skillId !== undefined && sources.skillId !== null
        ? getSkillAnimModes(sources.skillId)
        : undefined
    const seq0 =
      sources.skillId !== undefined && sources.skillId !== null
        ? resolveSkillSequenceFrame(sources.skillId, resolvedWClass, 0, 256)
        : null
    const subClipKey: CharAnimClipKey = (seq0?.clipKey ??
      (animModes?.seqTrans && animModes.seqTrans !== 'SQ'
        ? animModes.seqTrans.toLowerCase()
        : 'a1')) as CharAnimClipKey
    const subClip = getCharAnimClip113c(classIdOrToken, subClipKey, {
      weaponClass: resolvedWClass,
      morphMonsterClassId: sources.morphMonsterClassId,
    })
    const effRate = computeEffectiveAnimRate113c('sq', {
      fcr,
      itemIas,
      skillIas,
      weaponWsm,
      fhr,
      fbr,
      skillId: sources.skillId ?? undefined,
      seqTrans: animModes?.seqTrans,
    })
    const baseSpeed = subClip.speed
    const stepSpeed256 = computeStepSpeed256(baseSpeed, effRate)
    const frames = seq0 ? seq0.totalSequenceFrames : subClip.frames
    const durationMs = seq0
      ? computeSequenceDurationMs(frames, stepSpeed256)
      : computeOneShotDurationMs(frames, stepSpeed256)
    return {
      clipKey: subClipKey,
      frames,
      baseSpeed,
      loop: false,
      effRate,
      stepSpeed256,
      durationMs,
      fcr,
      itemIas,
      skillIas,
      weaponWsm,
      fhr,
    }
  }

  const clip = getCharAnimClip113c(classIdOrToken, modeOrClipKey, {
    weaponClass: resolvedWClass,
    morphMonsterClassId: sources.morphMonsterClassId,
  })
  const clipKey: CharAnimClipKey =
    typeof modeOrClipKey === 'number'
      ? (PLAYER_MODE_NUM_TO_CLIP[Math.trunc(modeOrClipKey)] ?? 'nu')
      : ((modeOrClipKey.trim().toLowerCase() as CharAnimClipKey) || 'nu')

  const effRate = computeEffectiveAnimRate113c(clipKey, {
    fcr,
    itemIas,
    skillIas,
    weaponWsm,
    fhr,
    fbr,
  })

  // Engine hardcode (D2Common UNITS_GetBaseAnimSpeed) replaces AnimData speeds
  // for player locomotion — see resolvePlayerLocomotionBaseSpeed256 (issue #852).
  const baseSpeed = resolvePlayerLocomotionBaseSpeed256(clipKey, clip.speed)

  // Locomotion clips (wl/tw/rn) scale by the move velocity percent, not by the one-shot
  // effRate formulas: stepSpeed = trunc(base × max(25, EFRW + stat67) / 100) (issue #869).
  if (clipKey === 'wl' || clipKey === 'tw' || clipKey === 'rn') {
    const morphRec =
      sources.morphMonsterClassId !== undefined && sources.morphMonsterClassId !== null
        ? getMonsterPathRecord(sources.morphMonsterClassId)
        : null
    const locomotionBaseSpeed = morphRec
      ? clipKey === 'rn'
        ? morphRec.runAnimSpeed
        : morphRec.walkAnimSpeed
      : baseSpeed
    const itemFrw = resolveCharacterStatTotal(STAT_FASTERMOVEVELOCITY, normalizedSources)
    // Armor speed penalty: implicit item stat STAT_VELOCITYPERCENT = -Armor.txt speed for
    // every equipped armor item (D2MOO Items.cpp:5365); only the torso rows are nonzero in
    // vanilla data, but the engine applies the stat for ITEMTYPE_ANY_ARMOR, so sum over all
    // equipped armor bases.
    let armorSpeedPenalty = 0
    if (equipmentList) {
      for (const item of equipmentList) {
        if (!item || item.broken || item.inSocket) continue
        armorSpeedPenalty += resolveArmorSpeed113c(item.code)
      }
    }
    const explicitStat67 = sources.stat67VelocityPercent
    const stat67 =
      explicitStat67 !== undefined && explicitStat67 !== null && Math.trunc(explicitStat67) !== 0
        ? Math.trunc(explicitStat67)
        : normalizedSources.unitStats && normalizedSources.unitStats.get(STAT_VELOCITYPERCENT) !== 0
          ? normalizedSources.unitStats.get(STAT_VELOCITYPERCENT)
          : normalizedSources.selfStats && normalizedSources.selfStats.get(STAT_VELOCITYPERCENT) !== 0
            ? normalizedSources.selfStats.get(STAT_VELOCITYPERCENT)
            : undefined
    const velocityPercent = computeMoveVelocityPercent113c({
      stat67,
      itemFrw,
      armorSpeedPenalty,
      skillVelocityPercent: sources.skillVelocityPercent ?? undefined,
      running: clipKey === 'rn',
    })
    const stepSpeed256 = computeLocomotionStepSpeed256(locomotionBaseSpeed, velocityPercent)
    return {
      clipKey,
      frames: clip.frames,
      baseSpeed: locomotionBaseSpeed,
      loop: clip.loop,
      effRate: 0,
      stepSpeed256,
      durationMs: computeOneShotDurationMs(clip.frames, stepSpeed256),
      velocityPercent,
      fcr,
      itemIas,
      skillIas,
      weaponWsm,
      fhr,
    }
  }

  const stepSpeed256 = computeStepSpeed256(baseSpeed, effRate)
  const durationMs = computeOneShotDurationMs(clip.frames, stepSpeed256)

  return {
    clipKey,
    frames: clip.frames,
    baseSpeed,
    loop: clip.loop,
    effRate,
    stepSpeed256,
    durationMs,
    fcr,
    itemIas,
    skillIas,
    weaponWsm,
    fhr,
  }
}

/**
 * Computes the 0-based animation frame index at `nowMs` according to 1.13c 25Hz (40ms) fixed-point
 * progression (`stepSpeed256` where `256` = 1 frame per 40ms tick):
 * - For non-looping clips (`loop === false`, e.g. `sc`, `a1`, `a2`, `gh`, `dt`, `dd`), starts at
 *   frame `0` at `startedAtMs` and clamps at `frameCount - 1` (never wraps via `% frameCount`).
 * - For looping clips (`loop === true`, e.g. `nu`, `wl`, `rn`, `tn`, `tw`), wraps cleanly via `% frameCount`.
 */
export function computeAnimFrameIndex(params: {
  readonly frameCount: number
  readonly stepSpeed256: number
  readonly loop: boolean
  readonly nowMs: number
  readonly startedAtMs?: number | undefined
  /** Floor applied to `stepSpeed256` (default 32). Locomotion clips pass 0: their floor is the velocity-percent 25 (`trunc(101×25/100)=25`), not 32. */
  readonly minStepSpeed256?: number | undefined
}): number {
  const frameCount = Math.max(1, Math.trunc(params.frameCount || 1))
  if (frameCount <= 1) return 0
  const minStepSpeed256 = params.minStepSpeed256 ?? 32
  const stepSpeed256 = Math.max(minStepSpeed256, Math.trunc(params.stepSpeed256 || 256))
  const elapsedMs =
    params.startedAtMs !== undefined && Number.isFinite(params.startedAtMs)
      ? Math.max(0, params.nowMs - params.startedAtMs)
      : Math.max(0, params.nowMs)
  const rawFrame = Math.floor(((elapsedMs / D2_TICK_MS) * stepSpeed256) / 256)
  if (!params.loop) {
    return Math.max(0, Math.min(frameCount - 1, rawFrame))
  }
  return ((rawFrame % frameCount) + frameCount) % frameCount
}
