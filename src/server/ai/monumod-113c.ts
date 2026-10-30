/**
 * 1.13c Monster Unique Modifier (`MonUMod`) & Champion Subtype Combat/AI Helpers
 * (`D2Game.dll` `0x6FC41C09..0x6FC469F0`, `0x6FC38A90`, `0x6FCBCDE0`).
 *
 * Covers P1 parity issues:
 * - `#1890`: `MonUMod #9` (Fire Enchanted) & `#17` (Lightning Enchanted) melee/attack bonus damage
 * - `#1899`: `MonUMod #26` (`Teleport` / `#184 MonTeleport`) low-HP blink, 25% heal roll & `STATE_PREVENTHEAL (52)` gate
 * - `#1900`: `MonUMod #29` (`Multishot`) `+2` angled fan projectiles (`ev5 = 0x6FC45AD0`)
 * - `#1901`: `MonUMod #34` (`ai_after_death` / `#293 Self-resurrect`) Act 5 Reanimated Horde self-resurrection
 * - `#1903`: Champion sub-types (`#36..#39`), `Possessed` curse immunity (`0x20`), and `WillOWisp` (`hcIdx 118`) halved bonus
 * - `#1904`: `MonUMod #7` (`Cursed`) `75%` chance `#66 Amplify Damage` at `slvl = floor(mlvl / 5) + 1`
 * - `#1905`: `MonUMod #25` (`Mana Burn`) damage-scaled mana drain (`<< 8` melee shift) + `+20%` magic res & `+75%` AR
 * - `#1906`: `MonUMod #41` (`always_run_ai`) vs `MonStats.txt` `killminions` (`Blood Raven`, `Shenk`, `SplEndDeath`)
 */

/** Cooldown frames between `MonUMod #26` (`Teleport`) casts (`~2.4s` at 25 fps, within `50..75` frames). */
export const TELEPORT_UMOD_COOLDOWN_FRAMES_113C = 60

/** Low-HP threshold (`30%`) in `D2Game.dll` `0x6FCBCEB5` (`cmp eax, 0x1e`). */
export const TELEPORT_UMOD_LOW_HP_PCT_113C = 30

/** Probability (`25%`) of healing on `MonTeleport` (`D2Game.dll` `0x6FCBCF61`: `cmp eax, 0x19`). */
export const TELEPORT_UMOD_HEAL_CHANCE_PCT_113C = 25

/** Side-fan deflection angle (`~8°` = `0.14 rad`) for `MonUMod #29` (`Multishot`, `0x6FC45AD0`). */
export const MULTISHOT_FAN_ANGLE_RAD_113C = 0.14

/** `MonUMod #7` (`Cursed`, `0x6FC44250`): `75%` proc probability on hit. */
export const CURSED_PROC_CHANCE_PCT_113C = 75

/**
 * All `States.txt` curse state IDs blocked by `MonUMod #38` (`Possessed`, `pMonsterData->nTypeFlags |= 0x20`
 * at `D2Game.dll` `0x6FC437E5`).
 */
export const ALL_CURSE_STATE_IDS_113C: ReadonlySet<number> = new Set([
  9, // Amplify Damage
  19, // Weaken
  23, // Dim Vision
  27, // Taunt
  55, // Iron Maiden
  56, // Terror
  57, // Attract
  58, // Life Tap
  59, // Confuse
  60, // Decrepify
  61, // Lower Resist
  113, // Defense Curse
  114, // Blood Mana
])

/**
 * Missiles excluded from `MonUMod #29` (`Multishot`) fan duplication (stationary death/controller FX
 * and radial death novas). Note: `#195` (`lightunique` Charged Bolt on struck) IS eligible (classic MSLE).
 */
const MULTISHOT_EXCLUDED_MISSILE_IDS_113C: ReadonlySet<number> = new Set([
  82, // Fire Enchanted corpse explosion visual
  194, // Cold Enchanted death Frost Nova ring (already 64-way)
  284, // Blood Raven death controller (`brdeathcontrol`)
  426, // SuicideMinion explosion
  427, // SuicideMinion fire explosion
  428, // SuicideMinion ice explosion
])

export interface EnchantedAttackBonusInput113c {
  readonly umodIds: readonly number[]
  readonly isMinion: boolean
  readonly baseMinDmg: number
  readonly baseMaxDmg: number
  /** Inclusive integer roll in `[min, max]`. */
  readonly rollInt: (min: number, max: number) => number
}

export interface EnchantedAttackBonusResult113c {
  readonly fireDmg: number
  readonly lightDmg: number
  readonly coldDmg: number
  readonly chillFrames: number
}

/**
 * 1.13c melee/physical attack elemental rider damage from `MonUMod`:
 * - `#9 Fire Enchanted` (`0x6FC42740`): `+66%..+100%` fire damage (`+33%..+50%` for minions).
 * - `#17 Lightning Enchanted` (`0x6FC42600`): `+66%..+100%` lightning damage (`+33%..+50%` for minions).
 * - `#36 Ghostly` (`0x6FC43850` / `0x6FC43917..0x6FC43975`): `+20%..+30%` cold damage + `150` frames chill.
 */
export function rollEnchantedAttackBonus113c(
  input: EnchantedAttackBonusInput113c,
): EnchantedAttackBonusResult113c {
  const loBase = Math.max(1, Math.trunc(input.baseMinDmg))
  const hiBase = Math.max(loBase, Math.trunc(input.baseMaxDmg))
  const minPctEnchant = input.isMinion ? 33 : 66
  const maxPctEnchant = input.isMinion ? 50 : 100

  let fireDmg = 0
  if (input.umodIds.includes(9)) {
    const minFire = Math.max(1, Math.trunc((loBase * minPctEnchant) / 100))
    const maxFire = Math.max(minFire, Math.trunc((hiBase * maxPctEnchant) / 100))
    fireDmg += input.rollInt(minFire, maxFire)
  }

  let lightDmg = 0
  if (input.umodIds.includes(17)) {
    const minLight = Math.max(1, Math.trunc((loBase * minPctEnchant) / 100))
    const maxLight = Math.max(minLight, Math.trunc((hiBase * maxPctEnchant) / 100))
    lightDmg += input.rollInt(minLight, maxLight)
  }

  let coldDmg = 0
  let chillFrames = 0
  if (input.umodIds.includes(36)) {
    const minCold = Math.max(1, Math.trunc((loBase * 20) / 100))
    const maxCold = Math.max(minCold, Math.trunc((hiBase * 30) / 100))
    coldDmg += input.rollInt(minCold, maxCold)
    chillFrames = Math.max(chillFrames, 150)
  }

  return { fireDmg, lightDmg, coldDmg, chillFrames }
}

export interface TeleportUModEvalInput113c {
  readonly hp: number
  readonly maxHp: number
  readonly distanceToTarget: number
  readonly meleeBlocked?: boolean | undefined
  readonly hasPreventHeal: boolean
  readonly hasActiveDamageOverTime: boolean
}

/**
 * 1.13c `MonUMod #26` (`Teleport`, `0x6FC441B0` / `0x6FCBCDE0`):
 * Evaluates whether the monster should cast `#184 MonTeleport` and whether it is eligible for the `25%` heal roll.
 */
export function evaluateTeleportUMod113c(input: TeleportUModEvalInput113c): {
  readonly shouldTeleport: boolean
  readonly isLowHp: boolean
  readonly canRollHeal: boolean
  readonly healAmount: number
} {
  if (input.hp <= 0 || input.maxHp <= 0) {
    return { shouldTeleport: false, isLowHp: false, canRollHeal: false, healAmount: 0 }
  }
  const isLowHp = input.hp * 100 < input.maxHp * TELEPORT_UMOD_LOW_HP_PCT_113C
  const shouldTeleport =
    isLowHp || input.distanceToTarget >= 12 || input.meleeBlocked === true
  const canRollHeal =
    isLowHp && !input.hasPreventHeal && !input.hasActiveDamageOverTime
  const healAmount = canRollHeal ? Math.max(1, Math.floor(input.maxHp / 4)) : 0
  return { shouldTeleport, isLowHp, canRollHeal, healAmount }
}

/**
 * Whether a monster projectile should spawn `+2` side projectiles for `MonUMod #29` (`Multishot`, `0x6FC45AD0`).
 */
export function isMissileEligibleForMultishot113c(
  missileClassId: number,
  options?: {
    readonly guaranteed?: boolean | undefined
    readonly hitMonsters?: boolean | undefined
    readonly stationary?: boolean | undefined
  },
): boolean {
  if (options?.guaranteed === true || options?.hitMonsters === true || options?.stationary === true) {
    return false
  }
  return !MULTISHOT_EXCLUDED_MISSILE_IDS_113C.has(missileClassId)
}

/**
 * Computes the `+2` side fan target coordinates `(targetX, targetY)` rotated by `±angleRad` around `(originX, originY)`.
 */
export function computeMultishotFanTargets113c(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  angleRad: number = MULTISHOT_FAN_ANGLE_RAD_113C,
): readonly [readonly [number, number], readonly [number, number]] {
  const dx = targetX - originX
  const dy = targetY - originY
  const baseAngle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx)
  const dist = Math.max(6, Math.hypot(dx, dy))
  const leftX = originX + Math.cos(baseAngle - angleRad) * dist
  const leftY = originY + Math.sin(baseAngle - angleRad) * dist
  const rightX = originX + Math.cos(baseAngle + angleRad) * dist
  const rightY = originY + Math.sin(baseAngle + angleRad) * dist
  return [
    [leftX, leftY],
    [rightX, rightY],
  ]
}

/**
 * Canonical `MonStats.txt` `aip1` self-resurrect probabilities (`%`) for Act 5 `reanimatedhorde1..6`
 * (`hcIdx 436..440, 698`, plus alias range `511..515`).
 */
const REANIMATED_HORDE_SELF_RES_PCT_BY_HCIDX_113C: Readonly<Record<number, number>> = {
  436: 30, // reanimatedhorde1 (Rot Walker)
  437: 40, // reanimatedhorde2 (Reanimated Horde)
  438: 50, // reanimatedhorde3 (Prowling Dead — Pindleskin's pack)
  439: 60, // reanimatedhorde4 (Unholy Corpse)
  440: 70, // reanimatedhorde5 (Defiled Warrior)
  698: 70, // reanimatedhorde6
  511: 30,
  512: 40,
  513: 50,
  514: 60,
  515: 70,
}

/**
 * 1.13c `MonUMod #34` (`ai_after_death`, `0x6FC43570` / `0x6FC43E20`) & `#293 Self-resurrect` (`0x6FC38A90`):
 * Act 5 `reanimatedhorde` zombies inherently carry `umod 34`, EXCEPT unique/superunique boss leaders
 * (such as Pindleskin himself: `rank === 'unique'` or `superUniqueId !== undefined`).
 */
export function hasImplicitSelfResurrectUMod113c(params: {
  readonly hcIdx: number
  readonly defId: string
  readonly rank: string
  readonly superUniqueId?: string | undefined
  readonly isNpc?: boolean | undefined
  readonly skills?:
    | readonly { readonly skillId?: number | undefined; readonly skill?: string | undefined }[]
    | undefined
}): boolean {
  if (params.isNpc === true) return false
  if (params.rank === 'unique' || params.superUniqueId !== undefined) return false
  if (REANIMATED_HORDE_SELF_RES_PCT_BY_HCIDX_113C[params.hcIdx] !== undefined) return true
  const normDef = params.defId.trim().toLowerCase()
  if (normDef.startsWith('reanimatedhorde')) return true
  if (
    params.skills?.some(
      (s) => s.skillId === 293 || s.skill?.trim().toLowerCase() === 'self-resurrect',
    )
  ) {
    return true
  }
  return false
}

/**
 * Resolves the per-tick self-resurrect probability (`%`) for a `MonUMod #34` corpse.
 */
export function resolveSelfResurrectChancePct113c(hcIdx: number, aiParam0?: number): number {
  const byHcIdx = REANIMATED_HORDE_SELF_RES_PCT_BY_HCIDX_113C[hcIdx]
  if (byHcIdx !== undefined) return byHcIdx
  if (aiParam0 !== undefined && aiParam0 > 0 && aiParam0 <= 100) {
    return Math.trunc(aiParam0)
  }
  return 50
}

/**
 * 1.13c `D2Game.dll` `0x6FC42D70` & `0x6FC42EE4` (`cmp eax, 0x76` = `118` `willowisp1` `BaseId`):
 * All `WillOWisp` / Gloam / Burning Soul variants (`hcIdx 118..122, 639..641, 733`, `baseId = 'willowisp1'`)
 * halve their Champion `%Damage` bonus (`+50%` in Normal instead of `+100%`; `+150%` on Berserk instead of `+300%`).
 */
export function isWillOWispChampion113c(params: {
  readonly hcIdx?: number | undefined
  readonly id?: string | undefined
  readonly baseId?: string | undefined
}): boolean {
  const hc = params.hcIdx
  if (
    hc !== undefined &&
    ((hc >= 118 && hc <= 122) || (hc >= 639 && hc <= 641) || hc === 733)
  ) {
    return true
  }
  const base = params.baseId?.trim().toLowerCase() ?? ''
  if (base === 'willowisp1' || base.startsWith('willowisp')) return true
  const id = params.id?.trim().toLowerCase() ?? ''
  return id.startsWith('willowisp')
}

/**
 * 1.13c `MonUMod #38` (`Possessed`, `0x6FC437E5`: `pMonsterData->nTypeFlags |= 0x20`):
 * Possessed champions cannot be cursed by any player, mercenary, monster, or CtC skill.
 */
export function isMonsterUncursable113c(
  umodIds: readonly number[],
  uncursableFlag?: boolean,
): boolean {
  return uncursableFlag === true || umodIds.includes(38)
}

/**
 * 1.13c `MonUMod #7` (`Cursed`, `0x6FC44250`):
 * Computes `#66 Amplify Damage` `slvl = floor(mlvl / 5) + 1` and `Skills.txt` duration
 * `200 + 75 * (slvl - 1)` frames (`8s + 3s * (slvl - 1)`), scaled by target `curse_resistance`.
 */
export function computeCursedAmplifyDamage113c(
  mlvl: number,
  curseResistancePct = 0,
): {
  readonly slvl: number
  readonly rawDurationFrames: number
  readonly durationFrames: number
} {
  const slvl = Math.floor(Math.max(1, Math.trunc(mlvl)) / 5) + 1
  const rawDurationFrames = 200 + 75 * (slvl - 1)
  if (curseResistancePct >= 100) {
    return { slvl, rawDurationFrames, durationFrames: 0 }
  }
  const durationFrames = Math.max(
    1,
    Math.floor((rawDurationFrames * (100 - curseResistancePct)) / 100),
  )
  return { slvl, rawDurationFrames, durationFrames }
}

/**
 * 1.13c `MonUMod #25` (`Mana Burn`, `0x6FC421D0` / `0x6FC422DD: shl esi, 0x8`):
 * - Rolls `66%..100%` (`33%..50%` for minions) of monster physical base damage (`rawDrain`).
 * - Melee attacks suffer the classic 1.13c double `<< 8` Q8.8 fixed-point shift (`rawDrain * 256 * 256`
 *   in 256-fixed mana = `rawDrain * 256` whole mana points!), whereas ranged missiles drain `rawDrain * 256`
 *   in 256-fixed mana (`rawDrain` whole mana points).
 */
export function computeManaBurnDrainFixed113c(params: {
  readonly isMinion: boolean
  readonly isMelee: boolean
  readonly baseMinDmg: number
  readonly baseMaxDmg: number
  readonly rollInt: (min: number, max: number) => number
}): number {
  const loBase = Math.max(1, Math.trunc(params.baseMinDmg))
  const hiBase = Math.max(loBase, Math.trunc(params.baseMaxDmg))
  const minPct = params.isMinion ? 33 : 66
  const maxPct = params.isMinion ? 50 : 100
  const minDrain = Math.max(1, Math.trunc((loBase * minPct) / 100))
  const maxDrain = Math.max(minDrain, Math.trunc((hiBase * maxPct) / 100))
  const rolledDrain = params.rollInt(minDrain, maxDrain)
  // Q8.8 mana units (256 = 1 whole mana point): melee applies an extra << 8 (x256).
  return params.isMelee ? rolledDrain * 256 * 256 : rolledDrain * 256
}

/**
 * 1.13c `MonUMod #41` (`always_run_ai`, `0x6FC469F0`):
 * Keeps quest/event monsters active even outside normal room/radius AOI culling.
 * NEVER triggers minion death wave on death!
 */
export function isAlwaysRunAiMonster113c(
  umodIds: readonly number[],
  alwaysRunAiFlag?: boolean,
): boolean {
  return alwaysRunAiFlag === true || umodIds.includes(41)
}

/**
 * 1.13c minion-purge on boss death (`MonStats.txt` `killminions` / `SplEndDeath` / `partydead` `umod 15`,
 * Blood Raven `#267`, Shenk the Overseer `#479`):
 * Strictly driven by monster table flags (`killMinions`, `splEndDeath === 1`, `umod 15`, Blood Raven, Shenk),
 * NEVER by `MonUMod #41` (`always_run_ai`).
 */
export function shouldKillMinionsOnDeath113c(params: {
  readonly hcIdx: number
  readonly defId: string
  readonly superUniqueId?: string | undefined
  readonly killMinions?: boolean | undefined
  readonly splEndDeath?: number | undefined
  readonly umodIds: readonly number[]
}): { readonly purge: boolean; readonly radiusSubTiles: number } {
  const normDef = params.defId.trim().toLowerCase()
  const normSu = (params.superUniqueId ?? '').trim().toLowerCase()
  if (params.hcIdx === 267 || normDef === 'bloodraven') {
    return { purge: true, radiusSubTiles: 35 }
  }
  const isShenk =
    (params.hcIdx === 479 || normDef === 'overseer1' || normDef === 'shenk') &&
    (params.killMinions === true ||
      normSu.includes('shenk') ||
      normSu.includes('siege boss') ||
      params.umodIds.includes(22) ||
      params.umodIds.includes(15))
  if (isShenk) {
    return { purge: true, radiusSubTiles: 35 }
  }
  const isInnateSplEndDeath1 =
    (params.hcIdx >= 278 && params.hcIdx <= 282) ||
    (params.hcIdx >= 662 && params.hcIdx <= 664) ||
    normDef.startsWith('fetishshaman')
  if (
    params.killMinions === true ||
    params.splEndDeath === 1 ||
    isInnateSplEndDeath1 ||
    params.umodIds.includes(15)
  ) {
    return { purge: true, radiusSubTiles: 25 }
  }
  return { purge: false, radiusSubTiles: 0 }
}
