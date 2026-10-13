/**
 * Diablo II v1.13c Monster Unique Modifiers (`MonUMod.txt`), Innate Monster Death Mechanics
 * (`MonStats.txt` `deathDmg` / `SplEndDeath`), and Act/Quest Boss Death Sequences
 * (`D2Game.dll` `MonsterUnique.cpp` / `QuestsFX.cpp` & `D2Client.dll` `Missiles.txt` `pCltDoFunc`).
 */

import { MONSTATS2_FLAGINDEX, hasMonStats2Flag } from './monstats2-flags.ts'

/**
 * 2:1 isometric ground projection aspect ratio (`ORTHO_SUB_TILE_HEIGHT / ORTHO_SUB_TILE_WIDTH = 8 / 16 = 0.5`).
 * All radial ground-plane rings (Cold Enchanted Frost Nova, Andariel / Mephisto radial firewall makers)
 * expand on the sub-tile ground plane and project to a 2:1 ellipse in screen space.
 */
export const ISO_GROUND_ASPECT_RATIO = 0.5

/**
 * Canonical `MonUMod.txt` IDs (Diablo II v1.13c).
 */
export const MON_UMOD_ID = Object.freeze({
  NONE: 0,
  RNDNAME: 1,
  HPMULTIPLY: 2,
  LIGHT: 3,
  LEVELADD: 4,
  STRONG: 5,
  FAST: 6,
  CURSE: 7,
  RESIST: 8,
  FIRE: 9,
  POISONDEAD: 10,
  DURIELDEAD: 11,
  BLOODRAVEN: 12,
  RAGE: 13,
  SPCDAMAGE: 14,
   PARTYDEAD: 15,
  CHAMPION: 16,
  LIGHTNING: 17,
  COLD: 18,
  HIRESPCL: 19,
  SCARAB: 20,
  KILLSELF: 21,
  QUESTCOMPLETE: 22,
  POISONHIT: 23,
  THIEF: 24,
  MANahit: 25,
  TELEPORT: 26,
  SPECTRALHIT: 27,
  STONESKIN: 28,
  MULTISHOT: 29,
  AURA: 30,
  GOBOOM: 31,
  FIRESPIKE_EXPLODE: 32,
  SUICIDEMINION_EXPLODE: 33,
  AI_AFTER_DEATH: 34,
  SHATTER_ON_DEATH: 35,
  GHOSTLY: 36,
  FANATIC: 37,
  POSSESSED: 38,
  BERSERK: 39,
  WORMS_ON_DEATH: 40,
  ALWAYS_RUN_AI: 41,
  LIGHTNINGDEATH: 42,
  POISON: 10,
  KILL_MINIONS: 21,
  KILL_SELF: 21,
  BONEFETISH: 31,
  SUICIDEMINION: 33,
  SUICIDE: 33,
  CHARGED_BOLTS: 42,
  FIRE_ENCHANTED: 9,
  LIGHTNING_ENCHANTED: 17,
  COLD_ENCHANTED: 18,
} as const)

export const MON_UMOD = MON_UMOD_ID

/**
 * Map from canonical string names/aliases to `MonUMod.txt` numeric IDs.
 */
export const MON_UMOD_NAME_TO_ID: Readonly<Record<string, number>> = Object.freeze({
  rndname: 1,
  hpmultiply: 2,
  light: 3,
  leveladd: 4,
  strong: 5,
  'extra strong': 5,
  extrastrong: 5,
  fast: 6,
  'extra fast': 6,
  extrafast: 6,
  curse: 7,
  cursed: 7,
  resist: 8,
  'magic resistant': 8,
  magicresistant: 8,
  fire: 9,
  fireenchant: 9,
  fireenchanted: 9,
  'fire enchanted': 9,
  poison: 10,
  poisondead: 10,
  durieldead: 11,
  bloodraven: 12,
  rage: 13,
  spcdamage: 14,
  partydead: 15,
  champion: 16,
  lightning: 17,
  lightenchant: 17,
  lightningenchanted: 17,
  'lightning enchanted': 17,
  cold: 18,
  coldenchant: 18,
  coldenchanted: 18,
  'cold enchanted': 18,
  hirespcl: 19,
  scarab: 20,
  killself: 21,
  kill_minions: 21,
  questcomplete: 22,
  poisonhit: 23,
  thief: 24,
  manahit: 25,
  manaburn: 25,
  'mana burn': 25,
  teleport: 26,
  teleportation: 26,
  spectralhit: 27,
  'spectral hit': 27,
  stoneskin: 28,
  'stone skin': 28,
  multishot: 29,
  'multiple shot': 29,
  aura: 30,
  'aura enchanted': 30,
  goboom: 31,
  bonefetish: 31,
  firespike_explode: 32,
  suicideminion_explode: 33,
  suicideminion: 33,
  ai_after_death: 34,
  shatter_on_death: 35,
  ghostly: 36,
  fanatic: 37,
  possessed: 38,
  berserk: 39,
  worms_on_death: 40,
  always_run_ai: 41,
  lightningdeath: 42,
  charged_bolts: 42,
})

export type MonsterUModSource =
  | readonly (number | string)[]
  | {
      readonly monUMods?: readonly (number | string)[] | undefined
      readonly bossMods?: readonly (number | string)[] | undefined
      readonly mods?: readonly (number | string)[] | undefined
      readonly modifiers?: readonly (number | string)[] | undefined
    }
  | undefined
  | null

/**
 * Normalizes a monster modifier list (`bossMods` numbers, `mods` strings, or a unit object) into a deduplicated set of `MonUMod.txt` IDs.
 */
export function resolveMonsterUModIds(source: MonsterUModSource): Set<number> {
  const out = new Set<number>()
  if (!source) return out
  const lists: (readonly (number | string)[] | undefined)[] = Array.isArray(source)
    ? [source as readonly (number | string)[]]
    : [
        (source as { readonly monUMods?: readonly (number | string)[] }).monUMods,
        (source as { readonly bossMods?: readonly (number | string)[] }).bossMods,
        (source as { readonly mods?: readonly (number | string)[] }).mods,
        (source as { readonly modifiers?: readonly (number | string)[] }).modifiers,
      ]
  for (const mods of lists) {
    if (!mods) continue
    for (const raw of mods) {
      if (typeof raw === 'number') {
        if (Number.isInteger(raw) && raw > 0) {
          out.add(raw)
        }
      } else if (typeof raw === 'string') {
        const clean = raw.trim().toLowerCase()
        if (!clean) continue
        const asNum = Number(clean)
        if (Number.isInteger(asNum) && asNum > 0) {
          out.add(asNum)
          continue
        }
        const mapped = MON_UMOD_NAME_TO_ID[clean]
        if (mapped !== undefined) {
          out.add(mapped)
        }
      }
    }
  }
  return out
}

/**
 * Returns `true` if `source` contains the given `MonUMod.txt` ID or name.
 */
export function hasMonsterUMod(
  source: MonsterUModSource,
  targetMod: number | string,
): boolean {
  const set = resolveMonsterUModIds(source)
  if (typeof targetMod === 'number') {
    return set.has(targetMod)
  }
  const clean = targetMod.trim().toLowerCase()
  const mapped = MON_UMOD_NAME_TO_ID[clean] ?? Number(clean)
  return Number.isInteger(mapped) && mapped > 0 ? set.has(mapped) : false
}

function normalizeDifficultyIndex(difficulty: number | 'normal' | 'nightmare' | 'hell' = 0): 0 | 1 | 2 {
  if (typeof difficulty === 'string') {
    const clean = difficulty.trim().toLowerCase()
    if (clean === 'hell') return 2
    if (clean === 'nightmare') return 1
    return 0
  }
  return Math.max(0, Math.min(2, Math.trunc(difficulty))) as 0 | 1 | 2
}

/**
 * 1.13c `MonUMod.txt` `[constants]` for Fire Enchanted (`id=9`) corpse explosion:
 * - Row 10: `66` (`[unique]FireMinDam%` of monster base max HP)
 * - Row 11: `100` (`[unique]FireMaxDam%` of monster base max HP)
 * - 1.13c `MONSTERUNIQUE_UMod09_FireEnchantedDeath` difficulty scaling multipliers:
 *   Normal (`0`): `0.20` (1/5), Nightmare (`1`): `0.35`, Hell (`2`): `0.20` (1/5).
 *   Total damage is split 50% Physical + 50% Fire within a 4-subtile radius.
 */
export const FIRE_ENCHANT_MIN_HP_PCT = 66
export const FIRE_ENCHANT_MAX_HP_PCT = 100
export const FIRE_ENCHANT_DIFF_SCALE: readonly [number, number, number] = [0.2, 0.35, 0.2] as const
export const FIRE_ENCHANT_EXPLOSION_RADIUS = 4

export interface FireEnchantedExplosionDamage {
  readonly physDmg: number
  readonly fireDmg: number
  readonly totalDmg: number
  readonly minPhys: number
  readonly maxPhys: number
  readonly minFire: number
  readonly maxFire: number
  readonly radiusSubTiles: number
}

/**
 * Computes 1.13c Fire Enchanted (`MonUMod` #9) corpse explosion damage (50% physical + 50% fire).
 * Minions (`isMinion === true`) never trigger Fire Enchanted death explosions.
 */
export function calcFireEnchantedDeathDamage(
  baseMaxHp: number,
  difficulty: number | 'normal' | 'nightmare' | 'hell' = 0,
  rollOrIsMinion: number | boolean = 0.5,
  roll01 = 0.5,
): FireEnchantedExplosionDamage {
  const isMinion = typeof rollOrIsMinion === 'boolean' ? rollOrIsMinion : false
  if (isMinion) {
    return {
      physDmg: 0,
      fireDmg: 0,
      totalDmg: 0,
      minPhys: 0,
      maxPhys: 0,
      minFire: 0,
      maxFire: 0,
      radiusSubTiles: FIRE_ENCHANT_EXPLOSION_RADIUS,
    }
  }
  const safeHp = Math.max(1, baseMaxHp)
  const diffIdx = normalizeDifficultyIndex(difficulty)
  const diffScale = FIRE_ENCHANT_DIFF_SCALE[diffIdx]
  const effRoll = typeof rollOrIsMinion === 'number' ? rollOrIsMinion : roll01
  const clampedRoll = Math.max(0, Math.min(1, effRoll))
  const pct =
    FIRE_ENCHANT_MIN_HP_PCT +
    (FIRE_ENCHANT_MAX_HP_PCT - FIRE_ENCHANT_MIN_HP_PCT) * clampedRoll
  const rawTotal = Math.max(2, Math.round((safeHp * (pct / 100)) * diffScale))
  const half = Math.max(1, Math.round(rawTotal * 0.5))
  const minHalf = Math.max(1, Math.round(Math.max(2, Math.round((safeHp * (FIRE_ENCHANT_MIN_HP_PCT / 100)) * diffScale)) * 0.5))
  const maxHalf = Math.max(minHalf, Math.round(Math.max(2, Math.round((safeHp * (FIRE_ENCHANT_MAX_HP_PCT / 100)) * diffScale)) * 0.5))
  return {
    physDmg: half,
    fireDmg: half,
    totalDmg: half * 2,
    minPhys: minHalf,
    maxPhys: maxHalf,
    minFire: minHalf,
    maxFire: maxHalf,
    radiusSubTiles: FIRE_ENCHANT_EXPLOSION_RADIUS,
  }
}

/**
 * Computes 1.13c Bone Fetish (`MonUMod` #31 `goboom` / `MonStats.txt` `deathDmg=1`) death explosion damage.
 * Pure physical splash damage (`100% physical`, `0 fire`) within a 4-subtile radius, subject to armor/physical resist and 5% crit.
 */
export const BONE_FETISH_EXPLOSION_RADIUS = 4

export interface BoneFetishExplosionDamage {
  readonly physDmg: number
  readonly minPhys: number
  readonly maxPhys: number
  readonly minFire: 0
  readonly maxFire: 0
  readonly isCrit: boolean
  readonly radiusSubTiles: number
}

export function calcBoneFetishDeathDamage(
  baseMaxHp: number,
  difficulty: number | 'normal' | 'nightmare' | 'hell' = 0,
  rollOrIsMinion: number | boolean = 0.5,
  critRoll01 = 0.5,
): BoneFetishExplosionDamage {
  const isMinion = typeof rollOrIsMinion === 'boolean' ? rollOrIsMinion : false
  if (isMinion) {
    return {
      physDmg: 0,
      minPhys: 0,
      maxPhys: 0,
      minFire: 0,
      maxFire: 0,
      isCrit: false,
      radiusSubTiles: BONE_FETISH_EXPLOSION_RADIUS,
    }
  }
  const safeHp = Math.max(1, baseMaxHp)
  const diffIdx = normalizeDifficultyIndex(difficulty)
  const diffScale = FIRE_ENCHANT_DIFF_SCALE[diffIdx]
  const effRoll = typeof rollOrIsMinion === 'number' ? rollOrIsMinion : 0.5
  const clampedRoll = Math.max(0, Math.min(1, effRoll))
  const pct = 40 + 20 * clampedRoll
  const basePhys = Math.max(1, Math.round((safeHp * (pct / 100)) * diffScale))
  const minPhys = Math.max(1, Math.round((safeHp * 0.4) * diffScale))
  const maxPhys = Math.max(minPhys, Math.round((safeHp * 0.6) * diffScale))
  const isCrit = critRoll01 < 0.05
  return {
    physDmg: isCrit ? basePhys * 2 : basePhys,
    minPhys,
    maxPhys,
    minFire: 0,
    maxFire: 0,
    isCrit,
    radiusSubTiles: BONE_FETISH_EXPLOSION_RADIUS,
  }
}

/**
 * Computes 1.13c Cold Enchanted (`MonUMod` #18 `cold`) Frost Nova (`Skills.txt` #44) parameters on death.
 * Skill level = `max(1, floor(mlvl / 2))` (or `1` if `mlvl` is omitted).
 * Chill length (`ELen`) = `(8 + sLvl) * 25` frames (`40ms` per frame).
 */
export interface ColdEnchantedNovaSpec {
  readonly triggered: boolean
  readonly skillId: 44
  readonly skillLevel: number
  readonly sLvl: number
  readonly missileKey: 'frostnova'
  readonly uniqueMissileKey: 'coldunique'
  readonly boltCount: 32
  readonly directions: 32
  readonly rangeTicks: 14
  readonly radiusSubTiles: number
  readonly coldMinDmg: number
  readonly coldMaxDmg: number
  readonly chillFrames: number
  readonly chillDurationMs: number
}

export function calcColdEnchantedDeathNova(
  mlvl = 1,
  difficulty: number | 'normal' | 'nightmare' | 'hell' = 0,
  isMinion = false,
): ColdEnchantedNovaSpec {
  const diffIdx = normalizeDifficultyIndex(difficulty)
  const sLvl = Math.max(1, Math.floor(Math.max(1, mlvl) / 2))
  const diffPenalty = diffIdx === 2 ? 0.25 : diffIdx === 1 ? 0.5 : 1
  const coldMinDmg = isMinion ? 0 : Math.max(2, Math.floor((2 + (sLvl - 1) * 2) * (1 + diffIdx * 0.5)))
  const coldMaxDmg = isMinion ? 0 : Math.max(coldMinDmg + 2, Math.floor((4 + (sLvl - 1) * 3) * (1 + diffIdx * 0.5)))
  const baseChillFrames = (8 + sLvl) * 25
  const chillFrames = isMinion ? 0 : Math.max(25, Math.floor(baseChillFrames * diffPenalty))
  return {
    triggered: !isMinion,
    skillId: 44,
    skillLevel: sLvl,
    sLvl,
    missileKey: 'frostnova',
    uniqueMissileKey: 'coldunique',
    boltCount: 32,
    directions: 32,
    rangeTicks: 14,
    radiusSubTiles: 7.875,
    coldMinDmg,
    coldMaxDmg,
    chillFrames,
    chillDurationMs: chillFrames * 40,
  }
}

export interface IsoRadialVector {
  readonly index: number
  readonly angleRad: number
  readonly dirX: number
  readonly dirY: number
  readonly dx: number
  readonly dy: number
  readonly targetX: number
  readonly targetY: number
  /** Projected isometric screen-space offset (`(dirX - dirY) * 16`, `(dirX + dirY) * 8`), aspect ratio = 0.5. */
  readonly isoScreenDx: number
  readonly isoScreenDy: number
}

/**
 * Generates radial ring vectors on the sub-tile ground plane and their 2:1 isometric screen projections
 * (`ISO_GROUND_ASPECT_RATIO = 0.5`, `isoScreenDy / isoScreenDx` semi-axis ratio = `0.5`).
 * Supports either `(count, radiusSubTiles)` (centered at `(0, 0)`) or `(originX, originY, count, radiusSubTiles)`.
 */
export function computeIsoRadialRingVectors(
  arg1 = 32,
  arg2 = 16,
  arg3?: number,
  arg4?: number,
): IsoRadialVector[] {
  const hasOrigin = arg3 !== undefined
  const originX = hasOrigin ? arg1 : 0
  const originY = hasOrigin ? arg2 : 0
  const count = hasOrigin ? arg3 : arg1
  const radiusSubTiles = hasOrigin ? (arg4 ?? 16) : arg2
  const safeCount = Math.max(1, Math.trunc(count))
  const vectors: IsoRadialVector[] = []
  for (let i = 0; i < safeCount; i++) {
    const angleRad = (2 * Math.PI * i) / safeCount
    const dirX = Math.cos(angleRad)
    const dirY = Math.sin(angleRad)
    const dx = dirX * radiusSubTiles
    const dy = dirY * radiusSubTiles
    vectors.push({
      index: i,
      angleRad,
      dirX,
      dirY,
      dx,
      dy,
      targetX: originX + dx,
      targetY: originY + dy,
      isoScreenDx: (dx - dy) * 16,
      isoScreenDy: (dx + dy) * 16 * ISO_GROUND_ASPECT_RATIO,
    })
  }
  return vectors
}

/**
 * 8-direction Charged Bolt vectors for `MonUMod` #17 (`lightning` -> `lightunique` #195)
 * and `MonUMod` #20 (`scarab` -> `buglightning` #225).
 * Supports either `(radiusSubTiles)` or `(originX, originY, radiusSubTiles)`.
 */
export function computeChargedBolt8WayVectors(
  arg1 = 16,
  arg2?: number,
  arg3?: number,
): IsoRadialVector[] {
  if (arg2 === undefined) {
    return computeIsoRadialRingVectors(0, 0, 8, arg1)
  }
  return computeIsoRadialRingVectors(arg1, arg2, 8, arg3 ?? 16)
}

/**
 * Innate monster `hcIdx` (`classId`) sets from 1.13c `MonStats.txt`.
 */
export function isScarabMonster(classId: number, monType?: string): boolean {
  if (
    (classId >= 91 && classId <= 95) ||
    classId === 654 ||
    classId === 655 ||
    classId === 718
  ) {
    return true
  }
  if (monType) {
    const clean = monType.trim().toLowerCase()
    if (clean.startsWith('scarab')) return true
  }
  return false
}

export function isPoisonDeadMonster(classId: number, monType?: string): boolean {
  if (
    classId === 9 ||
    (classId >= 96 && classId <= 100) ||
    classId === 703
  ) {
    return true
  }
  if (monType) {
    const clean = monType.trim().toLowerCase()
    if (clean === 'zombie5' || clean.startsWith('mummy')) return true
  }
  return false
}

export function isBoneFetishMonster(classId: number, monType?: string): boolean {
  if ((classId >= 212 && classId <= 216) || classId === 690 || classId === 691) {
    return true
  }
  if (monType) {
    const clean = monType.trim().toLowerCase()
    if (clean.startsWith('bonefetish')) return true
  }
  return false
}

export function isSuicideMinionMonster(classId: number, monType?: string): boolean {
  if (classId >= 461 && classId <= 468) {
    return true
  }
  if (monType) {
    const clean = monType.trim().toLowerCase()
    if (clean.startsWith('suicideminion')) return true
  }
  return false
}

export function isFireTowerMonster(classId: number, monType?: string): boolean {
  if (classId === 372) return true
  if (monType && monType.trim().toLowerCase() === 'firetower') return true
  return false
}

export function isBaalCloneMonster(classId: number, monType?: string): boolean {
  if (classId === 570) return true
  if (monType && monType.trim().toLowerCase() === 'baalclone') return true
  return false
}

export function isDurielMonster(classId: number, monType?: string): boolean {
  if (classId === 211 || classId === 708) return true
  if (monType) {
    const clean = monType.trim().toLowerCase()
    if (clean === 'duriel' || clean === 'uberduriel') return true
  }
  return false
}

export function isMaggotSmallMonster(classId: number, monType?: string): boolean {
  if (classId === 227) return true
  if (monType && monType.trim().toLowerCase() === 'maggot') return true
  return false
}

/**
 * 5-maggot (`hcIdx=227`, `Code=MA`) spawn offsets around Duriel's corpse (`MonUMod` #11 `durieldead`).
 */
export const DURIEL_MAGGOT_HCIDX = 227
export const DURIEL_MAGGOT_OFFSETS: readonly { readonly dx: number; readonly dy: number }[] = [
  { dx: -1.5, dy: -1.0 },
  { dx: 1.5, dy: -1.0 },
  { dx: -1.5, dy: 1.0 },
  { dx: 1.5, dy: 1.0 },
  { dx: 0.0, dy: 1.6 },
] as const

/**
 * Resolves innate `Overlay.txt` tokens attached to a monster upon entering `MONMODE_DEATH` (`DT`).
 */
export function getInnateMonsterDeathOverlays(
  classId: number,
  monType?: string,
): readonly string[] {
  const clean = monType?.trim().toLowerCase() ?? ''
  if (isDurielMonster(classId, clean)) {
    return ['durieldead_fwd', 'durieldead_rear']
  }
  if (isBoneFetishMonster(classId, clean)) {
    return ['fetishdeath1', 'fetishdeath2']
  }
  if (isSuicideMinionMonster(classId, clean)) {
    return ['suicide_death']
  }
  if ((classId >= 238 && classId <= 241) || classId === 673 || classId === 674 || clean.startsWith('cantor')) {
    return ['zakarumpriest_death']
  }
  if ((classId >= 127 && classId <= 130) || classId === 609 || clean.startsWith('thornhulk')) {
    return ['thornedhulk_death']
  }
  if ((classId >= 247 && classId <= 249) || clean.startsWith('frogdemon')) {
    return ['frogdemon_death']
  }
  if ((classId >= 304 && classId <= 306) || classId === 692 || classId === 693 || clean.startsWith('fingermage')) {
    return ['fingermagespiderexplode']
  }
  if (
    (classId >= 118 && classId <= 121) ||
    (classId >= 639 && classId <= 641) ||
    classId === 733 ||
    clean.startsWith('willowisp')
  ) {
    return ['willowispdeath']
  }
  if (
    (classId >= 360 && classId <= 362) ||
    classId === 558 ||
    classId === 686 ||
    classId === 687 ||
    classId === 712 ||
    clean.startsWith('megademon') ||
    clean === 'venomlord'
  ) {
    return ['megademondeath']
  }
  if ((classId >= 101 && classId <= 105) || (classId >= 667 && classId <= 670) || clean.startsWith('unraveler')) {
    return ['undeadhorrordeath']
  }
  if ((classId >= 441 && classId <= 445) || clean.startsWith('siegebeast')) {
    return ['siege_beast_dust']
  }
  if (classId === 497 || clean === 'catapult1') {
    return ['catapult_death_s']
  }
  if ((classId >= 498 && classId <= 500) || (clean.startsWith('catapult') && clean !== 'catapult1')) {
    return ['catapult_death_e']
  }
  if (
    (classId >= 469 && classId <= 478) ||
    (classId >= 634 && classId <= 638) ||
    classId === 719 ||
    classId === 720 ||
    clean.startsWith('succubus')
  ) {
    return ['succubae_death']
  }
  return []
}

/**
 * Resolves the 1.13c freeze-shatter missile keys (`icebreaksmall` #272 vs `icebreaklarge` #274 + `icebreaksmoke` #275)
 * based on `MonStats2.txt` `LARGE` flag (`MONSTATS2_FLAGINDEX.LARGE`).
 */
export function getFreezeShatterMissiles(
  classId: number,
  sizeX?: number,
): readonly [string, 'icebreaksmoke'] {
  const isLarge =
    hasMonStats2Flag(classId, MONSTATS2_FLAGINDEX.LARGE) || (sizeX !== undefined && sizeX >= 2)
  return [isLarge ? 'icebreaklarge' : 'icebreaksmall', 'icebreaksmoke']
}

/**
 * Boss Death Sequence & Minion Purge specification (`QuestsFX.cpp` & `Missiles.txt`).
 */
export interface BossDeathFxSpec {
  readonly bossKey:
    | 'andariel'
    | 'duriel'
    | 'bloodraven'
    | 'radament'
    | 'coldworm'
    | 'summoner'
    | 'mephisto'
    | 'izual'
    | 'diablo'
    | 'shenk'
    | 'nihlathak'
    | 'ancient'
    | 'baal'
  readonly controllerMissileKey: string
  readonly controllerMissile: string
  readonly controllerClassId: number
  readonly rangeTicks: number
  readonly controllerRange: number
  readonly shakeAmplitude: number
  readonly shakeDurationMs: number
  readonly purgeSurroundingMonstersRadius: number
  /** Screen shake parameters (`sustainMs`, `amplitude`, `rampUpMs`, `rampDownMs`). */
  readonly screenShake?: {
    readonly sustainMs: number
    readonly amplitude: number
    readonly rampUpMs?: number
    readonly rampDownMs?: number
  }
  /** `QUESTSFX_MainHandler` surrounding monster purge parameters (`radiusSubTiles`, `minDelayFrames`, `maxDelayFrames`). */
  readonly minionPurge?: {
    readonly radiusSubTiles: number
    readonly minDelayFrames: number
    readonly maxDelayFrames: number
  }
}

function buildBossDeathSpec(
  base: Omit<
    BossDeathFxSpec,
    | 'controllerMissile'
    | 'controllerRange'
    | 'shakeAmplitude'
    | 'shakeDurationMs'
    | 'purgeSurroundingMonstersRadius'
  >,
): BossDeathFxSpec {
  return {
    ...base,
    controllerMissile: base.controllerMissileKey,
    controllerRange: base.rangeTicks,
    shakeAmplitude: base.screenShake?.amplitude ?? 0,
    shakeDurationMs: base.screenShake?.sustainMs ?? 0,
    purgeSurroundingMonstersRadius: base.minionPurge?.radiusSubTiles ?? 0,
  }
}

export function getBossDeathFxSpec(
  classId: number,
  monType?: string,
): BossDeathFxSpec | null {
  const clean = monType?.trim().toLowerCase() ?? ''
  if (classId === 156 || classId === 707 || clean === 'andariel' || clean === 'uberandariel') {
    return buildBossDeathSpec({
      bossKey: 'andariel',
      controllerMissileKey: 'andycontrol0',
      controllerClassId: 307,
      rangeTicks: 350,
      screenShake: {
        sustainMs: 350 * 40,
        amplitude: 8,
        rampUpMs: 200,
        rampDownMs: 800,
      },
      minionPurge: {
        radiusSubTiles: 35,
        minDelayFrames: 1,
        maxDelayFrames: 51,
      },
    })
  }
  if (classId === 211 || classId === 708 || clean === 'duriel' || clean === 'uberduriel') {
    return buildBossDeathSpec({
      bossKey: 'duriel',
      controllerMissileKey: 'durieldeathcontrol',
      controllerClassId: 363,
      rangeTicks: 400,
      screenShake: {
        sustainMs: 160 * 40,
        amplitude: 6,
        rampUpMs: 120,
        rampDownMs: 600,
      },
    })
  }
  if (classId === 267 || clean === 'bloodraven') {
    return buildBossDeathSpec({
      bossKey: 'bloodraven',
      controllerMissileKey: 'brdeathcontrol',
      controllerClassId: 284,
      rangeTicks: 100,
      minionPurge: {
        radiusSubTiles: 35,
        minDelayFrames: 25,
        maxDelayFrames: 125,
      },
    })
  }
  if (classId === 229 || clean === 'radament') {
    return buildBossDeathSpec({
      bossKey: 'radament',
      controllerMissileKey: 'radamentdeath',
      controllerClassId: 347,
      rangeTicks: 40,
      minionPurge: {
        radiusSubTiles: 35,
        minDelayFrames: 1,
        maxDelayFrames: 35,
      },
    })
  }
  if (classId === 284 || clean === 'maggotqueen1' || clean === 'coldworm') {
    return buildBossDeathSpec({
      bossKey: 'coldworm',
      controllerMissileKey: 'queendeathcenter',
      controllerClassId: 353,
      rangeTicks: 65,
    })
  }
  if (classId === 250 || clean === 'summoner') {
    return buildBossDeathSpec({
      bossKey: 'summoner',
      controllerMissileKey: 'orbmist',
      controllerClassId: 368,
      rangeTicks: 20,
    })
  }
  if (classId === 242 || classId === 704 || clean === 'mephisto' || clean === 'ubermephisto') {
    return buildBossDeathSpec({
      bossKey: 'mephisto',
      controllerMissileKey: 'mephistodeathcontrol',
      controllerClassId: 299,
      rangeTicks: 140,
      screenShake: {
        sustainMs: 100 * 40,
        amplitude: 5,
        rampUpMs: 120,
        rampDownMs: 400,
      },
    })
  }
  if (classId === 256 || classId === 706 || clean === 'izual' || clean === 'uberizual') {
    return buildBossDeathSpec({
      bossKey: 'izual',
      controllerMissileKey: 'izual control',
      controllerClassId: 379,
      rangeTicks: 100,
      minionPurge: {
        radiusSubTiles: 105,
        minDelayFrames: 1,
        maxDelayFrames: 2,
      },
    })
  }
  if (
    classId === 243 ||
    classId === 333 ||
    classId === 705 ||
    clean === 'diablo' ||
    clean === 'diabloclone' ||
    clean === 'uberdiablo'
  ) {
    return buildBossDeathSpec({
      bossKey: 'diablo',
      controllerMissileKey: 'diablo appears',
      controllerClassId: 372,
      rangeTicks: 160,
      screenShake: {
        sustainMs: 120 * 40,
        amplitude: 8,
        rampUpMs: 160,
        rampDownMs: 600,
      },
      minionPurge: {
        radiusSubTiles: 45,
        minDelayFrames: 1,
        maxDelayFrames: 50,
      },
    })
  }
  if (classId === 479 || clean === 'overseer1' || clean === 'shenk') {
    return buildBossDeathSpec({
      bossKey: 'shenk',
      controllerMissileKey: 'overseercontrol',
      controllerClassId: 602,
      rangeTicks: 650,
      screenShake: {
        sustainMs: 240 * 40,
        amplitude: 5,
        rampUpMs: 200,
        rampDownMs: 800,
      },
      minionPurge: {
        radiusSubTiles: 35,
        minDelayFrames: 25,
        maxDelayFrames: 125,
      },
    })
  }
  if (classId === 526 || clean === 'nihlathakboss' || clean === 'nihlathak') {
    return buildBossDeathSpec({
      bossKey: 'nihlathak',
      controllerMissileKey: 'nehlithakcontrol',
      controllerClassId: 606,
      rangeTicks: 148,
      screenShake: {
        sustainMs: 120 * 40,
        amplitude: 6,
        rampUpMs: 120,
        rampDownMs: 400,
      },
    })
  }
  if ((classId >= 540 && classId <= 542) || clean.startsWith('ancientbarb')) {
    return buildBossDeathSpec({
      bossKey: 'ancient',
      controllerMissileKey: 'ancient death center',
      controllerClassId: 541,
      rangeTicks: 40,
    })
  }
  if (classId === 544 || classId === 709 || clean === 'baalcrab' || clean === 'uberbaal') {
    return buildBossDeathSpec({
      bossKey: 'baal',
      controllerMissileKey: 'baalfx control',
      controllerClassId: 625,
      rangeTicks: 139,
      screenShake: {
        sustainMs: 139 * 40,
        amplitude: 7,
        rampUpMs: 160,
        rampDownMs: 600,
      },
    })
  }
  return null
}
