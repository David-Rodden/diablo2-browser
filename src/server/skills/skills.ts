/**
 * Skills: table-driven definitions, casting, and projectiles.
 *
 * Diablo II skills are rows in `Skills.txt`: a mana cost, a cooldown, a range,
 * and damage that scales with the skill's level in bands. This module reads that
 * shape and turns it into something castable, in three parts:
 *
 * - a **definition** read from a table row (never a constant in code, so a real
 *   `Skills.txt` changes the game without touching this file);
 * - a **cast** step that checks mana and cooldown and produces either an instant
 *   effect or a projectile;
 * - a **projectile** step that flies at the simulation rate, dies on walls,
 *   expires on its own timer, and reports what it hit.
 *
 * Damage progression is the one place where a simplification is visible in the
 * code: the real table scales damage through five level bands
 * (`MinLevDam1..5`), and this reads a single `PerLevel` slope instead. The band
 * columns are a mapping-layer problem — they carry no new mechanics, only a
 * different interpolation — so the formula is isolated in {@link skillDamageAt}
 * where the bands can replace it.
 */
import type { Rng } from '../../common/rng/d2-rng.ts'
import type { CharacterClassCode } from '../../common/units/classes.ts'
import type { CombatPlayer } from '../engine/combat.ts'
import { FACING_VECTORS, parseColorChannel, type Caster, type CastResult } from '../../common/skills/missiles-data.ts'
export { parseColorChannel }
import {
  FROZEN_ORB_X_POSITIONS,
  FROZEN_ORB_Y_POSITIONS,
  calculateFrostNovaDamage,
  calculateFrostNovaChillLength,
  calculateFrostNovaSynergyMultiplier,
  spawnFrostNovaRing,
  calculateNovaDamage,
  calculateStaticFieldDamage,
  calculateStaticFieldRadiusYards,
  calculateStaticFieldRadiusPx,
  hasLineOfSight,
  spawnNovaRing,
  executeStaticField,
  calculateLightningDamage,
  calculateLightningSynergyMultiplier,
  calculateChainLightningDamage,
  calculateChainLightningSynergyMultiplier,
  calculateChainLightningJumps,
  type StaticFieldResult,
  type StaticFieldTarget,
  GAT_CHARGED_BOLT_OFFSETS,
  calculateChargedBoltCount,
  calculateChargedBoltSynergyMultiplier,
  calculateChargedBoltDamage,
  calculateEnergyShieldManaRatio,
  calculateEnergyShieldDuration,
  calculateEnergyShieldAbsorbPct,
  calculateThunderStormDuration,
  calculateThunderStormInterval,
  calculateThunderStormDamage,
  calculateLightningMasteryBonusPct,
  calculateTelekinesisDamage,
  isTelekinesisItemAllowed,
  isTelekinesisObjectAllowed,
  calculateFrozenArmorDefense,
  calculateFrozenArmorDuration,
  calculateFrozenArmorFreezeLength,
  calculateShiverArmorDefense,
  calculateShiverArmorDuration,
  calculateShiverArmorDamage,
  calculateShiverArmorChillLength,
  calculateChillingArmorDefense,
  calculateChillingArmorDuration,
  calculateChillingArmorDamage,
  calculateChillingArmorChillLength,
  calculateColdArmorDuration,
  calculateIceBlastDamage,
  calculateIceBlastFreezeLength,
  calculateGlacialSpikeDamage,
  calculateGlacialSpikeFreezeLength,
  calculateColdMasteryPierce,
  calculateFireWallDamage,
  calculateBlazeDamage,
  calculateInfernoDamage,
  calculateBlazeDuration,
  calculateBlazePatchDuration,
  calculateInfernoRange,
  calculateInfernoRangePx,
  calculateInfernoContinuousMana256,
  calculateFireWallPatches,
  calculateEnchantDamage,
  calculateEnchantAttackRating,
  calculateEnchantDuration,
  calculateFireMasteryBonus,
  calculateEnchantAttackDamage,
  calculateTeethDamage,
  calculateTeethSynergyMultiplier,
  calculateTeethCount,
  calculateBoneArmorCapacity,
  calculateBoneArmorSynergyBonus,
  calculatePoisonDaggerDamage,
  calculatePoisonDaggerSynergyMultiplier,
  calculatePoisonDaggerAttackRatingBonus,
  calculateCorpseExplosionDamage,
  calculateCorpseExplosionRadiusYards,
  calculateCorpseExplosionRadiusPx,
  calculateBoneWallStats,
  calculatePoisonExplosionDamage,
  calculatePoisonExplosionSynergyMultiplier,
  calculateBoneSpearDamage,
  calculateBoneSpearSynergyMultiplier,
  calculateBonePrisonStats,
  calculatePoisonNovaDamage,
  calculatePoisonNovaSynergyMultiplier,
  calculateBoneSpiritDamage,
  calculateBoneSpiritSynergyMultiplier,
  spawnPoisonNovaRing,
  calculateCurseRadiusYards,
  calculateCurseRadiusPx,
  calculateCurseDurationFrames,
  calculateAmplifyDamageDebuff,
  calculateWeakenDebuff,
  calculateIronMaidenReturnPct,
  calculateTerrorDistance,
  calculateDecrepifyDebuff,
  calculateLowerResistReduction,
  computeImmunityBreak,
  calculateCurseEffect,
  calculateSkeletonMaxCount,
  calculateSkeletalMageMaxCount,
  calculateReviveMaxCount,
  calculateSkeletonMasteryStats,
  calculateGolemMasteryStats,
  calculateSummonResistPct,
  calculateClayGolemStats,
  calculateBloodGolemStats,
  calculateIronGolemStats,
  calculateFireGolemStats,
  calculateReviveStats,
  calculateRaiseSkeletonStats,
  calculateSkeletalMageStats,
  calculateNecromageMissileDamage,
  type SkeletonMasteryStats,
  type GolemMasteryStats,
  type GolemSynergies,
  type ClayGolemStats,
  type BloodGolemStats,
  type IronGolemItemProps,
  type IronGolemStats,
  type FireGolemStats,
  type ReviveStats,
  type RaiseSkeletonStats,
  type SkeletalMageStats,
  type NecromageMissileStats,
  type CurseOpts,
  type CurseSpec,
  type DamageRange,
  type PoisonDamageSpec,
  type SynergyState,
} from '../engine/missile-engine.ts'
export {
  calculateFrostNovaDamage,
  calculateFrostNovaChillLength,
  calculateFrostNovaSynergyMultiplier,
  spawnFrostNovaRing,
  calculateNovaDamage,
  calculateStaticFieldDamage,
  calculateStaticFieldRadiusYards,
  calculateStaticFieldRadiusPx,
  hasLineOfSight,
  spawnNovaRing,
  executeStaticField,
  calculateLightningDamage,
  calculateLightningSynergyMultiplier,
  calculateChainLightningDamage,
  calculateChainLightningSynergyMultiplier,
  calculateChainLightningJumps,
  type StaticFieldResult,
  type StaticFieldTarget,
  GAT_CHARGED_BOLT_OFFSETS,
  calculateChargedBoltCount,
  calculateChargedBoltSynergyMultiplier,
  calculateChargedBoltDamage,
  calculateEnergyShieldManaRatio,
  calculateEnergyShieldDuration,
  calculateEnergyShieldAbsorbPct,
  calculateThunderStormDuration,
  calculateThunderStormInterval,
  calculateThunderStormDamage,
  calculateLightningMasteryBonusPct,
  calculateTelekinesisDamage,
  isTelekinesisItemAllowed,
  isTelekinesisObjectAllowed,
  calculateFrozenArmorDefense,
  calculateFrozenArmorDuration,
  calculateFrozenArmorFreezeLength,
  calculateShiverArmorDefense,
  calculateShiverArmorDuration,
  calculateShiverArmorDamage,
  calculateShiverArmorChillLength,
  calculateChillingArmorDefense,
  calculateChillingArmorDuration,
  calculateChillingArmorDamage,
  calculateChillingArmorChillLength,
  calculateColdArmorDuration,
  calculateIceBlastDamage,
  calculateIceBlastFreezeLength,
  calculateGlacialSpikeDamage,
  calculateGlacialSpikeFreezeLength,
  calculateColdMasteryPierce,
  calculateFireWallDamage,
  calculateBlazeDamage,
  calculateInfernoDamage,
  calculateBlazeDuration,
  calculateBlazePatchDuration,
  calculateInfernoRange,
  calculateInfernoRangePx,
  calculateInfernoContinuousMana256,
  calculateFireWallPatches,
  calculateEnchantDamage,
  calculateEnchantAttackRating,
  calculateEnchantDuration,
  calculateFireMasteryBonus,
  calculateEnchantAttackDamage,
  calculateTeethDamage,
  calculateTeethSynergyMultiplier,
  calculateTeethCount,
  calculateBoneArmorCapacity,
  calculateBoneArmorSynergyBonus,
  calculatePoisonDaggerDamage,
  calculatePoisonDaggerSynergyMultiplier,
  calculatePoisonDaggerAttackRatingBonus,
  calculateCorpseExplosionDamage,
  calculateCorpseExplosionRadiusYards,
  calculateCorpseExplosionRadiusPx,
  calculateBoneWallStats,
  calculatePoisonExplosionDamage,
  calculatePoisonExplosionSynergyMultiplier,
  calculateBoneSpearDamage,
  calculateBoneSpearSynergyMultiplier,
  calculateBonePrisonStats,
  calculatePoisonNovaDamage,
  calculatePoisonNovaSynergyMultiplier,
  calculateBoneSpiritDamage,
  calculateBoneSpiritSynergyMultiplier,
  spawnPoisonNovaRing,
  calculateCurseRadiusYards,
  calculateCurseRadiusPx,
  calculateCurseDurationFrames,
  calculateAmplifyDamageDebuff,
  calculateWeakenDebuff,
  calculateIronMaidenReturnPct,
  calculateTerrorDistance,
  calculateDecrepifyDebuff,
  calculateLowerResistReduction,
  computeImmunityBreak,
  calculateCurseEffect,
  calculateSkeletonMaxCount,
  calculateSkeletalMageMaxCount,
  calculateReviveMaxCount,
  calculateSkeletonMasteryStats,
  calculateGolemMasteryStats,
  calculateSummonResistPct,
  calculateClayGolemStats,
  calculateBloodGolemStats,
  calculateIronGolemStats,
  calculateFireGolemStats,
  calculateReviveStats,
  calculateRaiseSkeletonStats,
  calculateSkeletalMageStats,
  calculateNecromageMissileDamage,
  type SkeletonMasteryStats,
  type GolemMasteryStats,
  type GolemSynergies,
  type ClayGolemStats,
  type BloodGolemStats,
  type IronGolemItemProps,
  type IronGolemStats,
  type FireGolemStats,
  type ReviveStats,
  type RaiseSkeletonStats,
  type SkeletalMageStats,
  type NecromageMissileStats,
  type CurseOpts,
  type CurseSpec,
  type DamageRange,
  type PoisonDamageSpec,
  type SynergyState,
} from '../engine/missile-engine.ts'
import {
  BLIZZARD_CIRCLE_X,
  BLIZZARD_CIRCLE_Y,
  getBlizzardDropOffset,
} from '../../common/data/blizzard-table.ts'
export { BLIZZARD_CIRCLE_X, BLIZZARD_CIRCLE_Y, getBlizzardDropOffset } from '../../common/data/blizzard-table.ts'
import {
  METEOR_FIRE_SUBTILE_OFFSETS,
  type MeteorFireSubtileOffset,
} from '../../common/data/meteor-table.ts'
export {
  METEOR_FIRE_SUBTILE_OFFSETS,
  type MeteorFireSubtileOffset,
} from '../../common/data/meteor-table.ts'
import {
  calculateMagicArrowStats,
  calculateFireArrowStats,
  calculateColdArrowStats,
  calculateMultipleShotStats,
  calculateExplodingArrowStats,
  calculateIceArrowStats,
  calculateGuidedArrowStats,
  calculateStrafeStats,
  calculateImmolationArrowStats,
  calculateFreezingArrowStats,
  generateMultipleShotAngles,
  isMultipleShotCenterArrow,
  type MagicArrowStats,
  type FireArrowStats,
  type ColdArrowStats,
  type MultipleShotStats,
  type ExplodingArrowStats,
  type IceArrowStats,
  type GuidedArrowStats,
  type StrafeStats,
  type ImmolationArrowStats,
  type FreezingArrowStats,
} from '../../common/skills/amazon-bow.ts'
export {
  calculateMagicArrowStats,
  calculateFireArrowStats,
  calculateColdArrowStats,
  calculateMultipleShotStats,
  calculateExplodingArrowStats,
  calculateIceArrowStats,
  calculateGuidedArrowStats,
  calculateStrafeStats,
  calculateImmolationArrowStats,
  calculateFreezingArrowStats,
  generateMultipleShotAngles,
  isMultipleShotCenterArrow,
  type MagicArrowStats,
  type FireArrowStats,
  type ColdArrowStats,
  type MultipleShotStats,
  type ExplodingArrowStats,
  type IceArrowStats,
  type GuidedArrowStats,
  type StrafeStats,
  type ImmolationArrowStats,
  type FreezingArrowStats,
} from '../../common/skills/amazon-bow.ts'
import {
  calculateInnerSightStats,
  calculateCriticalStrikeStats,
  calculateDodgeStats,
  calculateSlowMissilesStats,
  calculateAvoidStats,
  calculatePenetrateStats,
  calculateDecoyStats,
  calculateEvadeStats,
  calculateValkyrieStats,
  calculatePierceStats,
  type InnerSightStats,
  type CriticalStrikeStats,
  type DodgeStats,
  type SlowMissilesStats,
  type AvoidStats,
  type PenetrateStats,
  type DecoyStats,
  type EvadeStats,
  type ValkyrieStats,
  type ValkyrieEquipmentTier,
  type PierceStats,
} from '../../common/skills/amazon-passive.ts'
export {
  calculateInnerSightStats,
  calculateCriticalStrikeStats,
  calculateDodgeStats,
  calculateSlowMissilesStats,
  calculateAvoidStats,
  calculatePenetrateStats,
  calculateDecoyStats,
  calculateEvadeStats,
  calculateValkyrieStats,
  calculatePierceStats,
  type InnerSightStats,
  type CriticalStrikeStats,
  type DodgeStats,
  type SlowMissilesStats,
  type AvoidStats,
  type PenetrateStats,
  type DecoyStats,
  type EvadeStats,
  type ValkyrieStats,
  type ValkyrieEquipmentTier,
} from '../../common/skills/amazon-passive.ts'
import {
  calculateJabStats,
  calculatePowerStrikeStats,
  calculatePoisonJavelinStats,
  calculateImpaleStats,
  calculateLightningBoltStats,
  calculateChargedStrikeStats,
  calculatePlagueJavelinStats,
  calculateFendStats,
  calculateLightningStrikeStats,
  calculateLightningFuryStats,
  type JabStats,
  type PowerStrikeStats,
  type PoisonJavelinStats,
  type ImpaleStats,
  type LightningBoltStats,
  type ChargedStrikeStats,
  type PlagueJavelinStats,
  type FendStats,
  type LightningStrikeStats,
  type LightningFuryStats,
  type PowerStrikeSynergies,
  type PoisonJavelinSynergies,
  type LightningBoltSynergies,
  type ChargedStrikeSynergies,
  type PlagueJavelinSynergies,
  type LightningStrikeSynergies,
  type LightningFurySynergies,
} from '../../common/skills/amazon-javelin-spear.ts'
export {
  calculateJabStats,
  calculatePowerStrikeStats,
  calculatePoisonJavelinStats,
  calculateImpaleStats,
  calculateLightningBoltStats,
  calculateChargedStrikeStats,
  calculatePlagueJavelinStats,
  calculateFendStats,
  calculateLightningStrikeStats,
  calculateLightningFuryStats,
  type JabStats,
  type PowerStrikeStats,
  type PoisonJavelinStats,
  type ImpaleStats,
  type LightningBoltStats,
  type ChargedStrikeStats,
  type PlagueJavelinStats,
  type FendStats,
  type LightningStrikeStats,
  type LightningFuryStats,
  type PowerStrikeSynergies,
  type PoisonJavelinSynergies,
  type LightningBoltSynergies,
  type ChargedStrikeSynergies,
  type PlagueJavelinSynergies,
  type LightningStrikeSynergies,
  type LightningFurySynergies,
} from '../../common/skills/amazon-javelin-spear.ts'
export {
  calculateRavenStats,
  calculatePoisonCreeperStats,
  calculateOakSageStats,
  calculateSummonSpiritWolfStats,
  calculateSpiritWolfStats,
  calculateCarrionVineStats,
  calculateHeartOfWolverineStats,
  calculateSummonDireWolfStats,
  calculateDireWolfStats,
  calculateSolarCreeperStats,
  calculateSpiritOfBarbsStats,
  calculateSummonGrizzlyStats,
  calculateGrizzlyStats,
  calculateSpiritWolfTeleportStats,
  calculateVineAttackStats,
  calculateCorpseCyclerStats,
  calculateFenrisRageStats,
  calculateVineCyclerStats,
  calculateBearSmiteStats,
  resolveDruidTotemResistances,
  type DruidTotemResistances,
  type RavenStats,
  type PoisonCreeperStats,
  type OakSageStats,
  type SummonSpiritWolfStats,
  type CarrionVineStats,
  type HeartOfWolverineStats,
  type SummonDireWolfStats,
  type SolarCreeperStats,
  type SpiritOfBarbsStats,
  type SummonGrizzlyStats,
  type SpiritWolfTeleportStats,
  type VineAttackStats,
  type CorpseCyclerStats,
  type FenrisRageStats,
  type VineCyclerStats,
  type BearSmiteStats,
} from './druid-summoning.ts'


import {
  type SkillDef,
  type Projectile,
  type MissileTxtData,
  CANONICAL_113C_MISSILES,
  ISO_GROUND_ASPECT_RATIO,
  parseMissilesTxt,
  getMissileTxtData,
  type OverlayTxtData,
  CANONICAL_113C_OVERLAYS,
  parseOverlayTxt,
  getOverlayTxtData,
  type ActiveOverlay,
  type CreateActiveOverlayOptions,
  resetOverlaySeqCounter,
  createActiveOverlay,
  PALADIN_AURA_OVERLAYS,
  PALADIN_AURA_OVERLAY_PARTS,
  PALADIN_AURA_SKILL_IDS,
  isAuraSkill,
  getAuraOverlayName,
  getAuraOverlayNames,
  SORCERESS_SKILL_CAST_OVERLAYS,
  getSkillCastOverlay,
  type SkillExecutionContext,
  type SkillType,
  type Batch1SkillDef,
  BATCH1_SKILLS,
  getBatch1SkillDef,
  isBatch1Skill,
  getSkillManaCost,
  getSkillCooldownTicks,
} from '../../common/skills/missiles-data.ts'
export {
  type SkillDef,
  type Projectile,
  type MissileTxtData,
  CANONICAL_113C_MISSILES,
  ISO_GROUND_ASPECT_RATIO,
  parseMissilesTxt,
  getMissileTxtData,
  type OverlayTxtData,
  CANONICAL_113C_OVERLAYS,
  parseOverlayTxt,
  getOverlayTxtData,
  type ActiveOverlay,
  type CreateActiveOverlayOptions,
  resetOverlaySeqCounter,
  createActiveOverlay,
  PALADIN_AURA_OVERLAYS,
  PALADIN_AURA_OVERLAY_PARTS,
  PALADIN_AURA_SKILL_IDS,
  isAuraSkill,
  getAuraOverlayName,
  getAuraOverlayNames,
  SORCERESS_SKILL_CAST_OVERLAYS,
  getSkillCastOverlay,
  type SkillExecutionContext,
  type SkillType,
  type Batch1SkillDef,
  BATCH1_SKILLS,
  getBatch1SkillDef,
  isBatch1Skill,
  getSkillManaCost,
  getSkillCooldownTicks,
} from '../../common/skills/missiles-data.ts'

/**
 * Damage of a skill at a level.
 *
 * @param skill - the definition.
 * @param level - skill level, 1-based.
 * @param rng - random source for the roll inside the damage range.
 * @returns the damage.
 */
function skillDamageAt(skill: SkillDef, level: number, rng: Rng): number {
  const steps = Math.max(0, level - 1)
  const min = skill.baseMinDamage + skill.damagePerLevel * steps
  const max = skill.baseMaxDamage + skill.damagePerLevel * steps
  return rng.int(Math.round(min), Math.round(Math.max(min, max)))
}

/**
 * Cast a skill.
 *
 * Mana and cooldown are checked here rather than by the caller so that every
 * route to casting (a hotkey, an AI, a script) obeys the same rules.
 *
 * @param skill - the definition.
 * @param caster - position and facing.
 * @param level - skill level.
 * @param rng - random source.
 * @param cooldownLeft - ticks of cooldown still owed.
 * @param mana - mana available.
 * @param aim - optional aim point; defaults to straight ahead of the facing.
 * @returns what the cast produced.
 */
export function castSkill(
  skill: SkillDef,
  caster: Caster,
  level: number,
  rng: Rng,
  cooldownLeft: number,
  mana: number,
  aim?: { readonly x: number; readonly y: number },
): CastResult {
  if (cooldownLeft > 0) return { kind: 'cooldown', ticksLeft: cooldownLeft }
  if (mana < skill.manaCost) return { kind: 'mana', cost: skill.manaCost }
  const damage = skillDamageAt(skill, level, rng)
  if (!skill.projectile) return { kind: 'instant', radius: skill.radius, damage }

  let dx: number
  let dy: number
  if (aim !== undefined) {
    dx = aim.x - caster.x
    dy = aim.y - caster.y
  } else {
    const vector = FACING_VECTORS[caster.facing] ?? FACING_VECTORS[0]!
    dx = vector[0]
    dy = vector[1]
  }
  const length = Math.hypot(dx, dy)
  if (length === 0) return { kind: 'instant', radius: skill.radius, damage }
  const perTick = skill.speed / 25
  const ttl = Math.max(1, Math.round(skill.range / perTick))
  return {
    kind: 'projectile',
    projectile: {
      skillId: skill.id,
      x: caster.x,
      y: caster.y,
      vx: (dx / length) * perTick,
      vy: (dy / length) * perTick,
      damage,
      ttl,
      fromPlayer: true,
      missileType: skill.id === '36' || skill.id === 'firebolt' ? 'firebolt' : undefined,
    },
  }
}

/** A body a projectile can hit. */
export interface ProjectileTarget {
  /** Stable identity, echoed back on a hit. */
  readonly index: number
  /** World x. */
  readonly x: number
  /** World y. */
  readonly y: number
  /** Radius for hit testing. */
  readonly radius: number
  /** Whether the target is alive; dead targets are not hit. */
  readonly alive: boolean
}

/** What happened to projectiles during a tick. */
export interface ProjectileOutcome {
  /** Projectiles still in flight. */
  readonly alive: readonly Projectile[]
  /** Hits, one per projectile that struck. */
  readonly hits: readonly {
    readonly targetIndex: number
    readonly damage: number
    readonly x: number
    readonly y: number
    readonly skillId?: string | undefined
    readonly missileType?: string | undefined
    readonly aoeRadius?: number | undefined
    readonly aoeDamage?: number | undefined
    readonly statusEffect?: 'chill' | 'freeze' | 'poison' | undefined
    readonly statusDuration?: number | undefined
    readonly stunDuration?: number | undefined
    readonly knockback?: boolean | undefined
    readonly isUndeadOnly?: boolean | undefined
  }[]
  /** Projectiles that died on a wall or expired. */
  readonly expired: number
  /** Projectiles that stopped against terrain. */
  readonly wallHits: number
  /** Terrain wall collision events for visual impacts/explosions. */
  readonly wallHitEvents?: readonly {
    readonly x: number
    readonly y: number
    readonly skillId?: string | undefined
    readonly missileType?: string | undefined
    readonly aoeRadius?: number | undefined
    readonly damage?: number | undefined
    readonly statusEffect?: 'chill' | 'freeze' | 'poison' | undefined
    readonly statusDuration?: number | undefined
  }[] | undefined
  /** Newly spawned child projectiles during this tick (e.g. Frozen Orb bolts / nova). */
  readonly spawnedProjectiles?: readonly Projectile[] | undefined
}

function getBlizzardExplosionMissile(missileType: string): string {
  switch (missileType) {
    case 'blizzard1':
      return 'blizzardexplode1'
    case 'blizzard2':
      return 'blizzardexplode2'
    case 'blizzard3':
      return 'blizzardexplode3'
    case 'blizzard4':
      return 'blizzardexplode1'
    default:
      return 'blizzardexplode1'
  }
}

function isBlizzardShard(missileType?: string): boolean {
  return (
    missileType === 'blizzard1' ||
    missileType === 'blizzard2' ||
    missileType === 'blizzard3' ||
    missileType === 'blizzard4'
  )
}

/**
 * Advance every projectile one tick.
 *
 * @param projectiles - projectiles in flight.
 * @param targets - candidate targets.
 * @param options - terrain overlap test and projectile radius.
 * @returns the surviving projectiles and what they hit.
 */
export function tickProjectiles(
  projectiles: readonly Projectile[],
  targets: readonly ProjectileTarget[],
  options: {
    readonly overlap: (x: number, y: number) => number
    readonly isMissileBlocked?: ((x: number, y: number, fromX?: number, fromY?: number) => boolean) | undefined
    readonly radius?: number
    readonly nextDelayByTarget?: Map<number | string, number> | Map<number, number> | undefined
    readonly currentTick?: number | undefined
    readonly onMissileStep?: ((missileType: string, prevX: number, prevY: number, curX: number, curY: number, projectile: Projectile) => void) | undefined
    readonly rng?: (() => number) | undefined
  },
): ProjectileOutcome {
  const radius = options.radius ?? 8
  const alive: Projectile[] = []
  const spawned: Projectile[] = []
  const waveNextDelayHits = new Set<number>()
  const hits: {
    targetIndex: number
    damage: number
    x: number
    y: number
    skillId?: string | undefined
    missileType?: string | undefined
    aoeRadius?: number | undefined
    aoeDamage?: number | undefined
    statusEffect?: 'chill' | 'freeze' | 'poison' | undefined
    statusDuration?: number | undefined
    stunDuration?: number | undefined
    knockback?: boolean | undefined
    isUndeadOnly?: boolean | undefined
  }[] = []
  const wallHitEvents: {
    x: number
    y: number
    skillId?: string | undefined
    missileType?: string | undefined
    aoeRadius?: number | undefined
    damage?: number | undefined
    statusEffect?: 'chill' | 'freeze' | 'poison' | undefined
    statusDuration?: number | undefined
  }[] = []
  let expired = 0
  let wallHits = 0

  for (const projectile of projectiles) {
    const isExpired = projectile.missileType === 'meteorcenter' ? projectile.ttl <= 1 : projectile.ttl <= 0
    if (isExpired) {
      expired += 1
      if (projectile.missileType === 'frozenorb') {
        // Authentic D2 1.13c MISSMODE_SrvHit29_FrozenOrb (0x6FC5CE10):
        // Detonates into 16 frozenorbnova missiles + frozenorbexplode explosion at expiry
        for (let i = 0; i < 64; i += 4) {
          const offX = FROZEN_ORB_X_POSITIONS[i]!
          const offY = FROZEN_ORB_Y_POSITIONS[i]! * ISO_GROUND_ASPECT_RATIO
          const angle = Math.atan2(offY, offX)
          const speed = 24
          spawned.push({
            skillId: projectile.skillId,
            x: projectile.x,
            y: projectile.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage: projectile.damage > 0 ? projectile.damage : 40,
            ttl: 25,
            fromPlayer: projectile.fromPlayer,
            missileType: 'frozenorbnova',
            statusEffect: 'chill',
            statusDuration: 100,
            isNovaCurl: true,
            pierce: false,
          })
        }
        wallHitEvents.push({
          x: projectile.x,
          y: projectile.y,
          skillId: projectile.skillId,
          missileType: 'frozenorb',
          aoeRadius: 24,
        })
      } else if (isBlizzardShard(projectile.missileType)) {
        const expType = getBlizzardExplosionMissile(projectile.missileType!)
        spawned.push({
          skillId: projectile.skillId,
          x: projectile.x,
          y: projectile.y,
          vx: 0,
          vy: 0,
          damage: projectile.damage,
          ttl: 6,
          fromPlayer: projectile.fromPlayer,
          missileType: expType,
          statusEffect: 'chill',
          statusDuration: 100,
          aoeRadius: 32,
          pierce: false,
        })
      } else if (projectile.missileType === 'fireball') {
        const blastRadius = projectile.aoeRadius ?? 80
        for (const target of targets) {
          if (!target.alive) continue
          const inRange =
            Math.hypot(target.x - projectile.x, (target.y - projectile.y) / ISO_GROUND_ASPECT_RATIO) <= blastRadius
          if (inRange) {
            hits.push({
              targetIndex: target.index,
              damage: projectile.damage,
              x: target.x,
              y: target.y,
              skillId: projectile.skillId,
              missileType: 'fireball',
              aoeRadius: blastRadius,
            })
          }
        }
        spawned.push({
          skillId: projectile.skillId,
          x: projectile.x,
          y: projectile.y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 16,
          fromPlayer: projectile.fromPlayer,
          missileType: 'explodingarrowexp',
          aoeRadius: blastRadius,
          pierce: true,
        })
        wallHitEvents.push({
          x: projectile.x,
          y: projectile.y,
          skillId: projectile.skillId,
          missileType: 'explodingarrowexp',
          aoeRadius: blastRadius,
        })
      } else if (
        projectile.missileType === 'explodingarrow' ||
        projectile.missileType === 'immolationarrow' ||
        projectile.missileType === 'freezingarrow'
      ) {
        // Authentic 1.13c AlwaysExplode = 1 for Exploding Arrow (#16), Immolation Arrow (#27), Freezing Arrow (#31):
        const blastRadius = projectile.aoeRadius ?? 80
        const blastDamage = projectile.aoeDamage ?? projectile.damage
        for (const target of targets) {
          if (!target.alive) continue
          const inRange =
            Math.hypot(target.x - projectile.x, (target.y - projectile.y) / ISO_GROUND_ASPECT_RATIO) <= blastRadius
          if (inRange) {
            hits.push({
              targetIndex: target.index,
              damage: blastDamage,
              x: target.x,
              y: target.y,
              skillId: projectile.skillId,
              missileType: projectile.missileType,
              aoeRadius: 0,
              statusEffect: projectile.statusEffect,
              statusDuration: projectile.statusDuration,
            })
          }
        }
        if (projectile.missileType === 'freezingarrow') {
          spawned.push({
            skillId: projectile.skillId,
            x: projectile.x,
            y: projectile.y,
            vx: 0,
            vy: 0,
            damage: 0,
            ttl: 15,
            fromPlayer: projectile.fromPlayer,
            missileType: 'freezingarrowexp1',
            aoeRadius: blastRadius,
            pierce: true,
          })
          spawned.push({
            skillId: projectile.skillId,
            x: projectile.x,
            y: projectile.y,
            vx: 0,
            vy: 0,
            damage: 0,
            ttl: 15,
            fromPlayer: projectile.fromPlayer,
            missileType: 'freezingarrowexp2',
            aoeRadius: blastRadius,
            pierce: true,
          })
          wallHitEvents.push({
            x: projectile.x,
            y: projectile.y,
            skillId: projectile.skillId,
            missileType: 'freezingarrowexp1',
            aoeRadius: blastRadius,
          })
        } else {
          spawned.push({
            skillId: projectile.skillId,
            x: projectile.x,
            y: projectile.y,
            vx: 0,
            vy: 0,
            damage: 0,
            ttl: 16,
            fromPlayer: projectile.fromPlayer,
            missileType: 'explodingarrowexp',
            aoeRadius: blastRadius,
            pierce: true,
          })
          wallHitEvents.push({
            x: projectile.x,
            y: projectile.y,
            skillId: projectile.skillId,
            missileType: 'explodingarrowexp',
            aoeRadius: blastRadius,
          })
          if (projectile.missileType === 'immolationarrow') {
            const fireDuration = projectile.fireDuration ?? 75
            spawned.push({
              skillId: projectile.skillId,
              x: projectile.x,
              y: projectile.y,
              vx: 0,
              vy: 0,
              damage: projectile.residualDamage ?? 2,
              ttl: fireDuration,
              fireDuration,
              fromPlayer: projectile.fromPlayer,
              missileType: 'immolationfire',
              aoeRadius: 48,
              pierce: true,
            })
          }
        }
      } else if (projectile.missileType === 'plaguejavelin') {
        // Authentic 1.13c AlwaysExplode = 1 for Plague Javelin (#25) -> MISSMODE_SrvHit08_PoisonCloud:
        // Spawns radial expanding ring of plaguejavcloud missiles
        const cloudTtl = Math.min(18, 12 + Math.floor(Math.max(1, projectile.slvl ?? 1) / 3))
        const cloudDmg = projectile.residualDamage ?? projectile.aoeDamage ?? Math.max(1, Math.floor(projectile.damage / 6))
        for (let i = 0; i < 64; i += 4) {
          const offX = FROZEN_ORB_X_POSITIONS[i]!
          const offY = FROZEN_ORB_Y_POSITIONS[i]! * ISO_GROUND_ASPECT_RATIO
          const angle = Math.atan2(offY, offX)
          const speed = 8
          spawned.push({
            skillId: projectile.skillId,
            x: projectile.x,
            y: projectile.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage: cloudDmg,
            ttl: cloudTtl,
            fromPlayer: projectile.fromPlayer,
            missileType: 'plaguejavcloud',
            statusEffect: 'poison',
            statusDuration: projectile.statusDuration ?? 75,
            aoeRadius: 24,
            pierce: true,
          })
        }
      } else if (projectile.missileType === 'meteorcenter') {
        // Authentic D2 1.13c MISSMODE_SrvHit14_MeteorCenter (0x6FC5DEF0) & 0x6FC5CEC0:
        // 1. Primary explosion AOE damage (Radius = 6 subtiles = 120px) in 2:1 isometric ground perspective
        const blastRadius = projectile.aoeRadius ?? 120
        for (const target of targets) {
          if (!target.alive) continue
          const inRange =
            Math.hypot(target.x - projectile.x, (target.y - projectile.y) / ISO_GROUND_ASPECT_RATIO) <= blastRadius
          if (inRange) {
            hits.push({
              targetIndex: target.index,
              damage: projectile.damage,
              x: target.x,
              y: target.y,
              skillId: projectile.skillId,
              missileType: 'meteorexplode',
              aoeRadius: blastRadius,
            })
          }
        }

        // 2. Spawn explosion missile: meteorexplode (ID 103, Range 16)
        spawned.push({
          skillId: projectile.skillId,
          x: projectile.x,
          y: projectile.y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 16,
          fromPlayer: projectile.fromPlayer,
          missileType: 'meteorexplode',
          aoeRadius: blastRadius,
          pierce: true,
        })
        wallHitEvents.push({
          x: projectile.x,
          y: projectile.y,
          skillId: projectile.skillId,
          missileType: 'meteorexplode',
          aoeRadius: blastRadius,
        })

        // 3. Spawn 18 meteorfire submissiles using 18-offset table
        const slvl = Math.max(1, projectile.slvl ?? 1)
        const fireDuration = projectile.fireDuration ?? (90 + (slvl - 1) * 15)
        const residualDmg = projectile.residualDamage ?? calculateMeteorResidualFireDamage(slvl).min
        for (const off of METEOR_FIRE_SUBTILE_OFFSETS) {
          const fx = projectile.x + off.x * 20
          const fy = projectile.y + off.y * 10
          const blocked =
            options.isMissileBlocked !== undefined
              ? options.isMissileBlocked(fx, fy, projectile.x, projectile.y)
              : options.overlap(fx, fy) > 0
          if (!blocked) {
            spawned.push({
              skillId: projectile.skillId,
              x: fx,
              y: fy,
              vx: 0,
              vy: 0,
              damage: residualDmg,
              ttl: fireDuration,
              fromPlayer: projectile.fromPlayer,
              missileType: 'meteorfire',
              aoeRadius: 16,
              pierce: true,
              slvl,
              fireDuration,
            })
          }
        }
      } else if (projectile.missileType === 'moltenboulder') {
        const blastRadius = projectile.aoeRadius ?? 80
        const blastDamage = projectile.aoeDamage ?? projectile.damage
        for (const target of targets) {
          if (!target.alive) continue
          const inRange =
            Math.hypot(target.x - projectile.x, (target.y - projectile.y) / ISO_GROUND_ASPECT_RATIO) <= blastRadius
          if (inRange) {
            hits.push({
              targetIndex: target.index,
              damage: blastDamage,
              x: target.x,
              y: target.y,
              skillId: projectile.skillId,
              missileType: 'moltenboulderemerge',
              aoeRadius: 0,
            })
          }
        }
        spawned.push({
          skillId: projectile.skillId,
          x: projectile.x,
          y: projectile.y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 12,
          fromPlayer: projectile.fromPlayer,
          missileType: 'moltenboulderemerge',
          aoeRadius: blastRadius,
          pierce: true,
        })
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4
          spawned.push({
            skillId: projectile.skillId,
            x: projectile.x,
            y: projectile.y,
            vx: Math.cos(angle) * 8,
            vy: Math.sin(angle) * 8 * ISO_GROUND_ASPECT_RATIO,
            damage: 0,
            ttl: 15,
            fromPlayer: projectile.fromPlayer,
            missileType: 'moltenboulderflyingrocks',
            aoeRadius: 32,
            pierce: true,
          })
        }
        wallHitEvents.push({
          x: projectile.x,
          y: projectile.y,
          skillId: projectile.skillId,
          missileType: 'moltenboulderemerge',
          aoeRadius: blastRadius,
        })
      } else if (projectile.missileType === 'armageddonrock') {
        const blastRadius = projectile.aoeRadius ?? 40
        for (const target of targets) {
          if (!target.alive) continue
          const inRange =
            Math.hypot(target.x - projectile.x, (target.y - projectile.y) / ISO_GROUND_ASPECT_RATIO) <= blastRadius
          if (inRange) {
            hits.push({
              targetIndex: target.index,
              damage: projectile.damage,
              x: target.x,
              y: target.y,
              skillId: projectile.skillId,
              missileType: 'armageddonrock',
              aoeRadius: 0,
            })
          }
        }
        spawned.push({
          skillId: projectile.skillId,
          x: projectile.x,
          y: projectile.y,
          vx: 0,
          vy: 0,
          damage: projectile.residualDamage ?? Math.max(1, Math.floor(projectile.damage / 6)),
          ttl: 38,
          fromPlayer: projectile.fromPlayer,
          missileType: 'armageddonfire',
          aoeRadius: 24,
          pierce: true,
          nextHit: 1,
          nextDelay: 4,
        })
        wallHitEvents.push({
          x: projectile.x,
          y: projectile.y,
          skillId: projectile.skillId,
          missileType: 'armageddonground',
          aoeRadius: blastRadius,
        })
      }
      continue
    }

    let vx = projectile.vx
    let vy = projectile.vy
    let x = projectile.x + vx
    let y = projectile.y + vy
    let spiral = projectile.spiral
    let subMissileIdx = projectile.subMissileIdx
    let jitterIndex = projectile.jitterIndex ?? (projectile.seed !== undefined ? Math.abs(projectile.seed) % 32 : undefined)

    // 0. Frozen Orb Nova affine rotation & damping curl in final frames
    // Authentic D2 1.13c MISSMODE_SrvDo16_FrozenOrbNova (0x6FC58340):
    // In final 6 frames before expiry, every 2 frames apply: x' = (x - y) / 2, y' = (x + y) / 2
    if (
      (projectile.isNovaCurl || projectile.missileType === 'frozenorbnova') &&
      projectile.ttl <= 6 &&
      projectile.ttl % 2 === 0
    ) {
      const diff = vx - vy
      const sum = vx + vy
      vx = diff / 2
      vy = sum / 2
      x = projectile.x + vx
      y = projectile.y + vy
    } else if (spiral !== undefined) {
      // 1. Archimedean spiral trajectory (e.g. Blessed Hammer)
      // The hammer traces an Archimedean spiral on the map ground plane. In oblique/isometric
      // perspective (2:1 projection), a circular ground expansion projects to an ellipse with a 2:1 aspect ratio.
      const nextAngle = spiral.angle + 0.22
      const nextRadius = spiral.radius + 3.2
      spiral = { ...spiral, angle: nextAngle, radius: nextRadius }
      x = spiral.originX + Math.cos(nextAngle) * nextRadius
      y = spiral.originY + Math.sin(nextAngle) * (nextRadius * ISO_GROUND_ASPECT_RATIO)
      vx = -Math.sin(nextAngle) * 18
      vy = Math.cos(nextAngle) * (18 * ISO_GROUND_ASPECT_RATIO)
    } else if (projectile.homing) {
      // 2. Homing trajectory (e.g. Bone Spirit) - smoothly steer towards closest living enemy
      let nearestDist = Number.POSITIVE_INFINITY
      let targetX = 0
      let targetY = 0
      let foundTarget = false
      for (const t of targets) {
        if (!t.alive) continue
        const d = Math.hypot(t.x - projectile.x, t.y - projectile.y)
        if (d < nearestDist && d > 4) {
          nearestDist = d
          targetX = t.x
          targetY = t.y
          foundTarget = true
        }
      }
      if (foundTarget) {
        const curAngle = Math.atan2(vy, vx)
        const targetAngle = Math.atan2(targetY - projectile.y, targetX - projectile.x)
        let diff = targetAngle - curAngle
        while (diff > Math.PI) diff -= 2 * Math.PI
        while (diff < -Math.PI) diff += 2 * Math.PI
        const maxTurn = 0.14
        const turn = Math.max(-maxTurn, Math.min(maxTurn, diff))
        const newAngle = curAngle + turn
        const speed = Math.hypot(vx, vy)
        vx = Math.cos(newAngle) * speed
        vy = Math.sin(newAngle) * speed
        x = projectile.x + vx
        y = projectile.y + vy
      }
    } else if (projectile.jitter !== false && (projectile.jitter || projectile.missileType === 'chargedbolt' || projectile.skillId === '38' || projectile.skillId === 'chargedbolt')) {
      // 3. Jitter trajectory (e.g. Charged Bolt) - discrete orthogonal jitter lookup table
      // Authentic D2 1.13c PATH_ComputePathChargedBolt (0x6FD85470):
      // 32-entry lookup table gatChargedBoltOffsets applied perpendicularly to main propagation vector per step.
      let flatVx = vx
      let flatVy = vy / ISO_GROUND_ASPECT_RATIO
      const currentSpeed = Math.hypot(flatVx, flatVy)
      if (currentSpeed > 0) {
        const perpX = -flatVy / currentSpeed
        const perpY = flatVx / currentSpeed
        const idx = Math.abs((jitterIndex ?? (projectile.seed !== undefined ? projectile.seed : projectile.ttl)) % 32)
        const offset = GAT_CHARGED_BOLT_OFFSETS[idx]! * 3
        flatVx += perpX * offset
        flatVy += perpY * offset
        const newSpeed = Math.hypot(flatVx, flatVy)
        if (newSpeed > 0) {
          const scaleDown = currentSpeed / newSpeed
          flatVx *= scaleDown
          flatVy *= scaleDown
        }
        vx = flatVx
        vy = flatVy * ISO_GROUND_ASPECT_RATIO
        x = projectile.x + vx
        y = projectile.y + vy
        jitterIndex = (idx + 1) % 32
      }
    }

    // 4. Frozen Orb sub-missile emitter (pSrvDoFunc = 15, frequency = 1, step = 19)
    // Authentic D2 1.13c MISSMODE_SrvDo15_FrozenOrb (0x6FC581F0):
    // Emits 1 radial frozenorbbolt along 64-point circle table, advancing by step 19
    if (projectile.missileType === 'frozenorb') {
      const idx = Math.abs((subMissileIdx ?? 0) % 64)
      const offX = FROZEN_ORB_X_POSITIONS[idx]!
      const offY = FROZEN_ORB_Y_POSITIONS[idx]! * ISO_GROUND_ASPECT_RATIO
      const angle = Math.atan2(offY, offX)
      const speed = 18 // vel = 18 in 1.13c Missiles.txt (450 px/s)
      spawned.push({
        skillId: projectile.skillId,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: projectile.damage > 0 ? projectile.damage : 40,
        ttl: 25,
        fromPlayer: projectile.fromPlayer,
        missileType: 'frozenorbbolt',
        statusEffect: 'chill',
        statusDuration: 100,
        pierce: false,
      })
      subMissileIdx = (idx + 19) % 64
    }

    // 5. Stationary Turret Emitter (e.g. Hydra, Skill 62)
    const isTurretEmitter =
      projectile.isTurret === true ||
      projectile.missileType === 'hydra_turret' ||
      (projectile.missileType === 'hydra' && projectile.vx === 0 && projectile.vy === 0)

    if (isTurretEmitter) {
      x = projectile.x
      y = projectile.y
      vx = 0
      vy = 0
      const currentAge = (projectile.ageTicks ?? 0) + 1
      const cadence = projectile.fireCadenceTicks ?? 25
      if (currentAge % cadence === 0) {
        let targetX: number | undefined
        let targetY: number | undefined
        let minDistance = Infinity
        const maxRangePx = 480 // 1.13c Range = 30, Vel = 16 -> 480 px

        for (const target of targets) {
          if (!target.alive) continue
          const dx = target.x - x
          const dy = (target.y - y) / ISO_GROUND_ASPECT_RATIO
          const dist = Math.hypot(dx, dy)
          if (dist <= maxRangePx && dist < minDistance) {
            minDistance = dist
            targetX = target.x
            targetY = target.y
          }
        }

        if (targetX !== undefined && targetY !== undefined) {
          const dx = targetX - x
          const dy = targetY - y
          const angle = Math.atan2(dy, dx)
          const speed = 16 // 1.13c Missiles.txt: vel = 16 (400 px/s)
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage: projectile.damage > 0 ? projectile.damage : 28,
            ttl: 30, // 1.13c Missiles.txt: range = 30
            fromPlayer: projectile.fromPlayer,
            missileType: projectile.spawnMissileType ?? 'hydra',
            statusEffect: projectile.statusEffect,
            statusDuration: projectile.statusDuration,
            pierce: false,
          })
        }
      }
    }

    // 6. Blizzard Center Emitter (pSrvDoFunc = 10, Skill 59)
    // Authentic D2 1.13c MISSMODE_SrvDo10_blizzardcenter (0x6FC60CA0):
    // Emits 1 falling shard every 4 ticks (Param3 = 4) across 64-entry circle table (Radius 7)
    // with step 13, for a total of exactly 25 shards over 100 ticks.
    if (projectile.missileType === 'blizzardcenter') {
      const currentAge = (projectile.ageTicks ?? 0) + 1
      if (currentAge % 4 === 0) {
        const idx = Math.abs((subMissileIdx ?? 0) % 64)
        const offset = getBlizzardDropOffset(idx, 7)
        const shardVariants = ['blizzard1', 'blizzard2', 'blizzard3', 'blizzard4'] as const
        const shardType = shardVariants[Math.floor((currentAge / 4) - 1) % shardVariants.length]!
        spawned.push({
          skillId: projectile.skillId,
          x: projectile.x + offset.dx,
          y: projectile.y + offset.dy,
          vx: 0,
          vy: 0,
          altitude: 120,
          damage: projectile.damage,
          ttl: 9,
          fromPlayer: projectile.fromPlayer,
          missileType: shardType,
          statusEffect: 'chill',
          statusDuration: 100,
          pierce: false,
        })
        subMissileIdx = (idx + 13) % 64
      }
    }

    // 7. Poison Javelin (#15) & Plague Javelin (#25) trailing poison cloud (pSrvDoFunc = 6: MISSMODE_SrvDo06_Trail)
    if (projectile.missileType === 'poisonjav' || projectile.missileType === 'plaguejavelin') {
      spawned.push({
        skillId: projectile.skillId,
        x: projectile.x,
        y: projectile.y,
        vx: 0,
        vy: 0,
        damage: projectile.residualDamage ?? Math.max(1, Math.floor(projectile.damage / 6)),
        ttl: 75,
        fromPlayer: projectile.fromPlayer,
        missileType: 'poisonjavcloud',
        statusEffect: 'poison',
        statusDuration: projectile.statusDuration ?? 200,
        aoeRadius: 24,
        pierce: true,
      })
    }

    // 8. Druid Elemental controllers & wavy trajectories (#225, #229, #234, #240, #244, #245)
    const nextAge = (projectile.ageTicks ?? 0) + 1
    if (projectile.missileType === 'firestormmaker') {
      const speed = Math.hypot(vx, vy)
      if (speed > 0) {
        const perpX = -vy / speed
        const perpY = vx / speed
        const phase = ((projectile.headIndex ?? 0) * Math.PI * 2) / 3
        const wave = Math.sin(nextAge * 0.45 + phase) * 5
        x = projectile.x + vx + perpX * wave
        y = projectile.y + vy + perpY * wave
      }
      spawned.push({
        skillId: projectile.skillId,
        x: projectile.x,
        y: projectile.y,
        vx: 0,
        vy: 0,
        damage: projectile.damage,
        ttl: 18,
        fromPlayer: projectile.fromPlayer,
        missileType: 'firestorm',
        aoeRadius: 20,
        pierce: true,
        nextHit: 1,
        nextDelay: 4,
      })
    } else if (projectile.missileType === 'moltenboulder') {
      spawned.push({
        skillId: projectile.skillId,
        x: projectile.x,
        y: projectile.y,
        vx: 0,
        vy: 0,
        damage: projectile.residualDamage ?? Math.max(1, Math.floor(projectile.damage / 5)),
        ttl: projectile.fireDuration ?? 125,
        fromPlayer: projectile.fromPlayer,
        missileType: 'moltenboulderfirepath',
        aoeRadius: 24,
        pierce: true,
        nextHit: 1,
        nextDelay: 4,
      })
    } else if (projectile.missileType === 'eruptioncenter') {
      x = projectile.x
      y = projectile.y
      vx = 0
      vy = 0
      if (nextAge % 5 === 0) {
        const step = Math.floor(nextAge / 5)
        const angle = step * 2.39996
        const dist = ((step * 17) % 60)
        spawned.push({
          skillId: projectile.skillId,
          x: projectile.x + Math.cos(angle) * dist,
          y: projectile.y + Math.sin(angle) * dist * ISO_GROUND_ASPECT_RATIO,
          vx: 0,
          vy: 0,
          damage: projectile.damage,
          ttl: 20,
          fromPlayer: projectile.fromPlayer,
          missileType: 'eruption crack 1',
          aoeRadius: 24,
          pierce: true,
          nextHit: 1,
          nextDelay: 5,
        })
      }
    } else if (projectile.missileType === 'volcanobase') {
      x = projectile.x
      y = projectile.y
      vx = 0
      vy = 0
      if (nextAge % 5 === 0) {
        const step = Math.floor(nextAge / 5)
        const angle = step * 2.39996
        const speed = 6
        spawned.push({
          skillId: projectile.skillId,
          x: projectile.x,
          y: projectile.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * ISO_GROUND_ASPECT_RATIO,
          damage: projectile.damage,
          ttl: 25,
          fromPlayer: projectile.fromPlayer,
          missileType: 'volcano small fire',
          aoeRadius: 24,
          pierce: false,
          nextHit: 1,
          nextDelay: 5,
        })
      }
    } else if (projectile.missileType === 'twister' || projectile.missileType === 'tornado') {
      const speed = Math.hypot(vx, vy)
      if (speed > 0) {
        const perpX = -vy / speed
        const perpY = vx / speed
        const phase = (projectile.headIndex ?? 0) * 1.5
        const wave = Math.sin(nextAge * 0.5 + phase) * (projectile.missileType === 'tornado' ? 3.5 : 4.5)
        x = projectile.x + vx + perpX * wave
        y = projectile.y + vy + perpY * wave
      }
    }

    let altitude = projectile.altitude
    if (isBlizzardShard(projectile.missileType)) {
      if (altitude === undefined) altitude = 120
      altitude = Math.max(0, altitude - (120 / 9))
    } else if (projectile.missileType === 'meteor' || projectile.missileType === 'meteortail' || projectile.missileType === 'armageddonrock') {
      if (altitude === undefined) altitude = 60 * 25
      altitude = Math.max(0, altitude - 25)
    }

    const hitTargets = projectile.hitTargets ?? new Set<number>()
    const currentAge = (projectile.ageTicks ?? 0) + 1
    if (
      (projectile.missileType === 'meteorfire' && currentAge % 5 === 0) ||
      (projectile.missileType === 'immolationfire' && currentAge % 5 === 0) ||
      (projectile.missileType === 'poisonjavcloud' && currentAge % 5 === 0) ||
      (projectile.missileType === 'plaguejavcloud' && currentAge % 5 === 0) ||
      (projectile.missileType === 'firestorm' && currentAge % 4 === 0) ||
      (projectile.missileType === 'moltenboulderfirepath' && currentAge % 4 === 0) ||
      (projectile.missileType === 'eruption crack 1' && currentAge % 5 === 0) ||
      (projectile.missileType === 'armageddonfire' && currentAge % 4 === 0) ||
      (projectile.missileType === 'tornado' && currentAge % 25 === 0) ||
      projectile.missileType === 'firewall' ||
      projectile.missileType === 'blaze' ||
      projectile.missileType === 'groundfirebig' ||
      projectile.missileType === 'infernoflame1' ||
      projectile.missileType === 'infernoflame2'
    ) {
      hitTargets.clear()
    }
    if (options.onMissileStep !== undefined && (projectile.x !== x || projectile.y !== y)) {
      options.onMissileStep(projectile.missileType ?? '', projectile.x, projectile.y, x, y, projectile)
    }
    const moved: Projectile = {
      ...projectile,
      x,
      y,
      vx,
      vy,
      prevX: projectile.x,
      prevY: projectile.y,
      spiral,
      subMissileIdx,
      jitterIndex,
      altitude,
      hitTargets,
      ageTicks: currentAge,
      ttl: projectile.ttl - 1,
    }

    // Walls first: a projectile dies against missile barriers (solid walls, closed doors)
    const isAirborne =
      (projectile.missileType === 'meteor' || projectile.missileType === 'meteortail' || projectile.missileType === 'armageddonrock') &&
      altitude !== undefined &&
      altitude > 0
    let blockedByTerrain = false
    if (!isAirborne) {
      const moveDist = Math.hypot(x - projectile.x, y - projectile.y)
      const stepSize = 8
      const steps = Math.max(1, Math.ceil(moveDist / stepSize))
      let checkPrevX = projectile.x
      let checkPrevY = projectile.y
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const curX = projectile.x + (x - projectile.x) * t
        const curY = projectile.y + (y - projectile.y) * t
        if (options.isMissileBlocked !== undefined) {
          if (options.isMissileBlocked(curX, curY, checkPrevX, checkPrevY)) {
            blockedByTerrain = true
            break
          }
        } else if (options.overlap(curX, curY) > 0) {
          blockedByTerrain = true
          break
        }
        checkPrevX = curX
        checkPrevY = curY
      }
    }
    if (blockedByTerrain) {
      wallHits += 1
      wallHitEvents.push({
        x,
        y,
        skillId: projectile.skillId,
        missileType: projectile.missileType,
        aoeRadius: projectile.aoeRadius,
        damage: projectile.aoeDamage ?? projectile.damage,
        statusEffect: projectile.statusEffect,
        statusDuration: projectile.statusDuration,
      })
      if (projectile.missileType === 'frozenorb') {
        for (let i = 0; i < 64; i += 4) {
          const offX = FROZEN_ORB_X_POSITIONS[i]!
          const offY = FROZEN_ORB_Y_POSITIONS[i]! * ISO_GROUND_ASPECT_RATIO
          const angle = Math.atan2(offY, offX)
          const speed = 24
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage: projectile.damage > 0 ? projectile.damage : 40,
            ttl: 25,
            fromPlayer: projectile.fromPlayer,
            missileType: 'frozenorbnova',
            statusEffect: 'chill',
            statusDuration: 100,
            isNovaCurl: true,
            pierce: false,
          })
        }
      } else if (projectile.missileType === 'glacialspike') {
        spawned.push({
          skillId: projectile.skillId,
          x,
          y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 15,
          fromPlayer: projectile.fromPlayer,
          missileType: 'freezeexplode',
          aoeRadius: projectile.aoeRadius ?? 64,
          pierce: true,
        })
        spawned.push({
          skillId: projectile.skillId,
          x,
          y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 15,
          fromPlayer: projectile.fromPlayer,
          missileType: 'glacialspikeejecta',
          aoeRadius: projectile.aoeRadius ?? 64,
          pierce: true,
        })
      } else if (isBlizzardShard(projectile.missileType)) {
        const expType = getBlizzardExplosionMissile(projectile.missileType!)
        spawned.push({
          skillId: projectile.skillId,
          x,
          y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 6,
          fromPlayer: projectile.fromPlayer,
          missileType: expType,
          statusEffect: 'chill',
          statusDuration: 100,
          aoeRadius: 32,
          pierce: false,
        })
      } else if (
        projectile.missileType === 'fireball' ||
        projectile.missileType === 'explodingarrow' ||
        projectile.missileType === 'immolationarrow'
      ) {
        spawned.push({
          skillId: projectile.skillId,
          x,
          y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 16,
          fromPlayer: projectile.fromPlayer,
          missileType: 'explodingarrowexp',
          aoeRadius: projectile.aoeRadius ?? 80,
          pierce: true,
        })
        if (projectile.missileType === 'immolationarrow') {
          const fireDuration = projectile.fireDuration ?? 75
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: 0,
            vy: 0,
            damage: projectile.residualDamage ?? 2,
            ttl: fireDuration,
            fireDuration,
            fromPlayer: projectile.fromPlayer,
            missileType: 'immolationfire',
            aoeRadius: 48,
            pierce: true,
          })
        }
      } else if (projectile.missileType === 'freezingarrow') {
        spawned.push({
          skillId: projectile.skillId,
          x,
          y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 15,
          fromPlayer: projectile.fromPlayer,
          missileType: 'freezingarrowexp1',
          aoeRadius: projectile.aoeRadius ?? 80,
          pierce: true,
        })
        spawned.push({
          skillId: projectile.skillId,
          x,
          y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 15,
          fromPlayer: projectile.fromPlayer,
          missileType: 'freezingarrowexp2',
          aoeRadius: projectile.aoeRadius ?? 80,
          pierce: true,
        })
      } else if (projectile.missileType === 'plaguejavelin') {
        const cloudTtl = Math.min(18, 12 + Math.floor(Math.max(1, projectile.slvl ?? 1) / 3))
        const cloudDmg = projectile.residualDamage ?? projectile.aoeDamage ?? Math.max(1, Math.floor(projectile.damage / 6))
        for (let i = 0; i < 64; i += 4) {
          const offX = FROZEN_ORB_X_POSITIONS[i]!
          const offY = FROZEN_ORB_Y_POSITIONS[i]! * ISO_GROUND_ASPECT_RATIO
          const angle = Math.atan2(offY, offX)
          const speed = 8
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage: cloudDmg,
            ttl: cloudTtl,
            fromPlayer: projectile.fromPlayer,
            missileType: 'plaguejavcloud',
            statusEffect: 'poison',
            statusDuration: projectile.statusDuration ?? 75,
            aoeRadius: 24,
            pierce: true,
          })
        }
      } else if (projectile.missileType === 'lightningfury') {
        const searchRadiusPx = projectile.aoeRadius ?? 300
        const maxBolts = 1 + Math.max(1, projectile.slvl ?? 1)
        const boltDamage = projectile.aoeDamage ?? projectile.damage
        const nearby = targets.filter(t => t.alive && Math.hypot(t.x - x, t.y - y) <= searchRadiusPx)
        const count = nearby.length > 0 ? Math.min(nearby.length, maxBolts) : 1
        for (let i = 0; i < count; i++) {
          const tgt = nearby[i]
          const angle = tgt ? Math.atan2(tgt.y - y, tgt.x - x) : 0
          const speed = 30
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage: boltDamage,
            ttl: 40,
            fromPlayer: projectile.fromPlayer,
            missileType: 'furylightning',
            pierce: true,
          })
        }
      } else if (projectile.missileType === 'moltenboulder') {
        const blastRadius = projectile.aoeRadius ?? 80
        spawned.push({
          skillId: projectile.skillId,
          x,
          y,
          vx: 0,
          vy: 0,
          damage: 0,
          ttl: 12,
          fromPlayer: projectile.fromPlayer,
          missileType: 'moltenboulderemerge',
          aoeRadius: blastRadius,
          pierce: true,
        })
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: Math.cos(angle) * 8,
            vy: Math.sin(angle) * 8 * ISO_GROUND_ASPECT_RATIO,
            damage: 0,
            ttl: 15,
            fromPlayer: projectile.fromPlayer,
            missileType: 'moltenboulderflyingrocks',
            aoeRadius: 32,
            pierce: true,
          })
        }
      }
      continue
    }

    let struck = false
    const isHarmlessEmitter =
      projectile.missileType === 'frozenorb' ||
      projectile.missileType === 'blizzardcenter' ||
      projectile.missileType === 'meteorcenter' ||
      projectile.missileType === 'meteor' ||
      projectile.missileType === 'meteortail' ||
      projectile.missileType === 'firewallmaker' ||
      projectile.missileType === 'firestormmaker' ||
      projectile.missileType === 'eruptioncenter' ||
      projectile.missileType === 'volcanobase' ||
      projectile.missileType === 'armageddonrock' ||
      projectile.missileType === 'moltenboulderemerge' ||
      projectile.missileType === 'moltenboulderflyingrocks' ||
      projectile.missileType === 'freezeexplode' ||
      projectile.missileType === 'glacialspikeejecta' ||
      projectile.missileType === 'explodingarrowexp' ||
      projectile.missileType === 'freezingarrowexp1' ||
      projectile.missileType === 'freezingarrowexp2' ||
      projectile.missileType === 'icearrowexplode' ||
      projectile.missileType === 'iceexplode' ||
      projectile.missileType === 'fireexplode' ||
      projectile.missileType === 'thunderstorm1' ||
      projectile.missileType === 'thunderstorm' ||
      projectile.missileType === 'lightninghit' ||
      isTurretEmitter
    if (!isHarmlessEmitter) {
      for (const target of targets) {
        if (!target.alive) continue
        if (hitTargets.has(target.index)) continue // already struck by piercing projectile
        if (projectile.missileType === 'blaze' && projectile.fromPlayer && (target as any).isPlayer) {
          continue
        }
        const isGroundPatch =
          projectile.missileType === 'meteorfire' ||
          projectile.missileType === 'immolationfire' ||
          projectile.missileType === 'poisonjavcloud' ||
          projectile.missileType === 'plaguejavcloud' ||
          projectile.missileType === 'firestorm' ||
          projectile.missileType === 'moltenboulderfirepath' ||
          projectile.missileType === 'eruption crack 1' ||
          projectile.missileType === 'armageddonfire' ||
          projectile.missileType === 'firewall' ||
          projectile.missileType === 'blaze' ||
          projectile.missileType === 'groundfirebig'
        const dist = isGroundPatch
          ? Math.hypot(target.x - x, (target.y - y) / ISO_GROUND_ASPECT_RATIO)
          : Math.hypot(target.x - x, target.y - y)
        const hitRadius =
          projectile.missileType === 'immolationfire' ||
          projectile.missileType === 'poisonjavcloud' ||
          projectile.missileType === 'plaguejavcloud' ||
          projectile.missileType === 'firestorm' ||
          projectile.missileType === 'moltenboulderfirepath' ||
          projectile.missileType === 'eruption crack 1' ||
          projectile.missileType === 'armageddonfire' ||
          projectile.missileType === 'tornado'
            ? Math.max(radius, projectile.aoeRadius ?? 24)
            : radius
        if (dist > target.radius + hitRadius) continue

        const hasNextDelay =
          (projectile.nextDelay !== undefined && projectile.nextDelay > 0) ||
          projectile.missileType === 'nova' ||
          projectile.missileType === 'electricnova'
        const nextDelayFrames = projectile.nextDelay ?? 4

        if (hasNextDelay) {
          if (waveNextDelayHits.has(target.index)) continue
          if (options.nextDelayByTarget && options.currentTick !== undefined) {
            const exp = options.nextDelayByTarget.get(target.index)
            if (exp !== undefined && exp > options.currentTick) continue
          }
        }

        const statusEffect =
          projectile.statusEffect ??
          (isBlizzardShard(projectile.missileType) || projectile.missileType?.startsWith('blizzardexplode')
            ? 'chill'
            : undefined)
        const statusDuration =
          projectile.statusDuration ??
          (isBlizzardShard(projectile.missileType) || projectile.missileType?.startsWith('blizzardexplode')
            ? 100
            : undefined)

        hits.push({
          targetIndex: target.index,
          damage: projectile.damage,
          x,
          y,
          skillId: projectile.skillId,
          missileType: projectile.missileType,
          aoeRadius:
            projectile.missileType === 'immolationfire' ||
            projectile.missileType === 'poisonjavcloud' ||
            projectile.missileType === 'plaguejavcloud' ||
            projectile.missileType === 'firestorm' ||
            projectile.missileType === 'moltenboulderfirepath' ||
            projectile.missileType === 'eruption crack 1' ||
            projectile.missileType === 'armageddonfire' ||
            projectile.missileType === 'tornado'
              ? 0
              : projectile.aoeRadius,
          aoeDamage: projectile.aoeDamage,
          statusEffect,
          statusDuration,
          stunDuration: projectile.stunDuration ?? (projectile.missileType === 'twister' ? 10 : undefined),
          knockback: projectile.knockback ?? (projectile.missileType === 'moltenboulder' ? true : undefined),
          isUndeadOnly: projectile.isUndeadOnly,
        })

        if (hasNextDelay) {
          waveNextDelayHits.add(target.index)
          if (options.nextDelayByTarget && options.currentTick !== undefined) {
            options.nextDelayByTarget.set(target.index, options.currentTick + nextDelayFrames)
          }
        }

        hitTargets.add(target.index)

        // Authentic 1.13c Chain Lightning / Lightning Strike (#34) retargeting / jump
        const isChainLightning =
          projectile.missileType === 'chainlightning' ||
          projectile.missileType === 'lightningstrike' ||
          (projectile.chainRemaining !== undefined && projectile.chainRemaining > 0)
        if (isChainLightning) {
          const jumpsLeft = projectile.chainRemaining !== undefined ? projectile.chainRemaining : 0
          if (jumpsLeft > 0) {
            // Search radius: 20 subtiles (400 px) for Chain Lightning & Lightning Strike
            const searchRadiusPx = projectile.aoeRadius ?? 400
            let closestCand: ProjectileTarget | null = null
            let closestDist = Infinity
            for (const cand of targets) {
              if (!cand.alive || cand.index === target.index) continue
              // Authentic ping-pong: only exclude immediate prior victim (target.index)
              const d = Math.hypot(cand.x - target.x, cand.y - target.y)
              if (d <= searchRadiusPx && d < closestDist) {
                closestDist = d
                closestCand = cand
              }
            }
            if (closestCand) {
              const dx = closestCand.x - target.x
              const dy = closestCand.y - target.y
              const len = Math.hypot(dx, dy)
              const speed = 30 // 1.13c Missiles.txt vel = 30 (750 px/s)
              const pVx = len > 0 ? (dx / len) * speed : speed
              const pVy = len > 0 ? (dy / len) * speed : 0
              spawned.push({
                skillId: projectile.skillId,
                x: target.x,
                y: target.y,
                vx: pVx,
                vy: pVy,
                damage: projectile.damage,
                ttl: 25,
                fromPlayer: projectile.fromPlayer,
                missileType: projectile.missileType === 'lightningstrike' ? 'lightningstrike' : 'chainlightning',
                aoeRadius: projectile.aoeRadius,
                chainRemaining: jumpsLeft - 1,
                lastHitTargetIndex: target.index,
                nextHit: 1,
                nextDelay: 4,
              })
            }
          }
          struck = true
          break
        }

        // Authentic 1.13c: Exploding Arrow (#16), Immolation Arrow (#27), Freezing Arrow (#31),
        // Plague Javelin (#25), and Lightning Fury (#35) trigger their on-hit sub-missiles on EVERY target hit, even when piercing!
        if (projectile.missileType === 'explodingarrow' || projectile.missileType === 'immolationarrow') {
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: 0,
            vy: 0,
            damage: 0,
            ttl: 16,
            fromPlayer: projectile.fromPlayer,
            missileType: 'explodingarrowexp',
            aoeRadius: projectile.aoeRadius ?? 80,
            pierce: true,
          })
          if (projectile.missileType === 'immolationarrow') {
            const fireDuration = projectile.fireDuration ?? 75
            spawned.push({
              skillId: projectile.skillId,
              x,
              y,
              vx: 0,
              vy: 0,
              damage: projectile.residualDamage ?? 2,
              ttl: fireDuration,
              fireDuration,
              fromPlayer: projectile.fromPlayer,
              missileType: 'immolationfire',
              aoeRadius: 48,
              pierce: true,
            })
          }
        } else if (projectile.missileType === 'freezingarrow') {
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: 0,
            vy: 0,
            damage: 0,
            ttl: 15,
            fromPlayer: projectile.fromPlayer,
            missileType: 'freezingarrowexp1',
            aoeRadius: projectile.aoeRadius ?? 80,
            pierce: true,
          })
          spawned.push({
            skillId: projectile.skillId,
            x,
            y,
            vx: 0,
            vy: 0,
            damage: 0,
            ttl: 15,
            fromPlayer: projectile.fromPlayer,
            missileType: 'freezingarrowexp2',
            aoeRadius: projectile.aoeRadius ?? 80,
            pierce: true,
          })
        } else if (projectile.missileType === 'plaguejavelin') {
          const cloudTtl = Math.min(18, 12 + Math.floor(Math.max(1, projectile.slvl ?? 1) / 3))
          const cloudDmg = projectile.residualDamage ?? projectile.aoeDamage ?? Math.max(1, Math.floor(projectile.damage / 6))
          for (let i = 0; i < 64; i += 4) {
            const offX = FROZEN_ORB_X_POSITIONS[i]!
            const offY = FROZEN_ORB_Y_POSITIONS[i]! * ISO_GROUND_ASPECT_RATIO
            const angle = Math.atan2(offY, offX)
            const speed = 8
            spawned.push({
              skillId: projectile.skillId,
              x,
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              damage: cloudDmg,
              ttl: cloudTtl,
              fromPlayer: projectile.fromPlayer,
              missileType: 'plaguejavcloud',
              statusEffect: 'poison',
              statusDuration: projectile.statusDuration ?? 75,
              aoeRadius: 24,
              pierce: true,
            })
          }
        } else if (projectile.missileType === 'lightningfury') {
          // Authentic 1.13c MISSMODE_SrvHit21_LightningFury (0x6FC5E2B0):
          // Releases 1 furylightning bolt per living monster within 15 subtiles (300px, excluding hit target), capped at 1 + slvl
          const searchRadiusPx = projectile.aoeRadius ?? 300
          const maxBolts = 1 + Math.max(1, projectile.slvl ?? 1)
          const boltDamage = projectile.aoeDamage ?? projectile.damage
          const nearby = targets.filter(
            t => t.alive && t.index !== target.index && Math.hypot(t.x - x, t.y - y) <= searchRadiusPx,
          )
          const count = Math.min(nearby.length, maxBolts)
          for (let i = 0; i < count; i++) {
            const tgt = nearby[i]!
            const angle = Math.atan2(tgt.y - y, tgt.x - x)
            const speed = 30
            spawned.push({
              skillId: projectile.skillId,
              x,
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              damage: boltDamage,
              ttl: 40,
              fromPlayer: projectile.fromPlayer,
              missileType: 'furylightning',
              pierce: true,
            })
          }
        }

        let canPierceTarget = Boolean(projectile.pierce)
        if (canPierceTarget && (projectile.pierceChancePct !== undefined || projectile.maxPierceCount !== undefined)) {
          const currentPierceCount = (moved as { pierceCount?: number }).pierceCount ?? projectile.pierceCount ?? 0
          const maxPierces = projectile.maxPierceCount ?? 4
          const chancePct = projectile.pierceChancePct ?? 100
          if (currentPierceCount >= maxPierces || chancePct <= 0) {
            canPierceTarget = false
          } else if (chancePct < 100) {
            const roll = options.rng
              ? Math.floor(options.rng() * 100)
              : (currentPierceCount * 20 + 15) % 100
            canPierceTarget = roll < chancePct
          }
          if (canPierceTarget) {
            ;(moved as { pierceCount?: number }).pierceCount = currentPierceCount + 1
          }
        }

        if (!canPierceTarget) {
          struck = true
          if (projectile.missileType === 'glacialspike') {
            spawned.push({
              skillId: projectile.skillId,
              x,
              y,
              vx: 0,
              vy: 0,
              damage: 0,
              ttl: 15,
              fromPlayer: projectile.fromPlayer,
              missileType: 'freezeexplode',
              aoeRadius: projectile.aoeRadius ?? 64,
              pierce: true,
            })
            spawned.push({
              skillId: projectile.skillId,
              x,
              y,
              vx: 0,
              vy: 0,
              damage: 0,
              ttl: 15,
              fromPlayer: projectile.fromPlayer,
              missileType: 'glacialspikeejecta',
              aoeRadius: projectile.aoeRadius ?? 64,
              pierce: true,
            })
          } else if (isBlizzardShard(projectile.missileType)) {
            const expType = getBlizzardExplosionMissile(projectile.missileType!)
            spawned.push({
              skillId: projectile.skillId,
              x,
              y,
              vx: 0,
              vy: 0,
              damage: 0,
              ttl: 6,
              fromPlayer: projectile.fromPlayer,
              missileType: expType,
              statusEffect: 'chill',
              statusDuration: 100,
              aoeRadius: 32,
              pierce: false,
            })
          } else if (projectile.missileType === 'fireball') {
            spawned.push({
              skillId: projectile.skillId,
              x,
              y,
              vx: 0,
              vy: 0,
              damage: 0,
              ttl: 16,
              fromPlayer: projectile.fromPlayer,
              missileType: 'explodingarrowexp',
              aoeRadius: projectile.aoeRadius ?? 80,
              pierce: true,
            })
          }
          break
        }
      }
    }

    if (!struck) {
      alive.push(moved)
    }
  }

  alive.push(...spawned)
  return { alive, hits, expired, wallHits, wallHitEvents, spawnedProjectiles: spawned }
}

// ============================================================================
// 1.13c Batch 1 Skills Execution, Synergy Integration, and Combat Calculations
// ============================================================================

/**
 * Computes min/max skill damage based on 1.13c 5-level-band progressions, HitShift precision,
 * hard-point synergy multiplier integration, and weapon damage scaling.
 *
 * @param skillId - Canonical numeric skill ID.
 * @param effectiveLevel - Current effective skill level (hard + soft points).
 * @param synergyMultiplier - Evaluated synergy multiplier: 1.0 + (synergyBonusPct / 100).
 * @param weaponDamage - Optional base weapon damage range { min, max }.
 */
export function calculateSkillDamage(
  skillId: number | string,
  slvl: number,
  synergies?: number | {
    readonly iceBolt?: number | undefined
    readonly iceBlast?: number | undefined
    readonly glacialSpike?: number | undefined
    readonly blizzard?: number | undefined
    readonly frozenOrb?: number | undefined
    readonly fireBolt?: number | undefined
    readonly fireBall?: number | undefined
    readonly fireMastery?: number | undefined
    readonly inferno?: number | undefined
    readonly [key: string]: any
  },
  weaponDamage?: { min: number; max: number }
): { min: number; max: number } {
  if (skillId === 6 || skillId === '6' || skillId === 'magicarrow' || skillId === 'magic arrow') {
    if (!weaponDamage) {
      return { min: 0, max: 0 }
    }
    const stats = calculateMagicArrowStats(slvl)
    const baseMin = weaponDamage.min ?? 0
    const baseMax = weaponDamage.max ?? 0
    return { min: baseMin + stats.flatMagicDamage, max: baseMax + stats.flatMagicDamage }
  }
  if (skillId === 7 || skillId === '7' || skillId === 'firearrow' || skillId === 'fire arrow') {
    const stats = calculateFireArrowStats(slvl, synergies as any)
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 'jab') {
    const stats = calculateJabStats(slvl)
    const ed = Math.max(0, 1 + stats.enhancedDamagePct / 100)
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: Math.floor(baseMin * ed), max: Math.floor(baseMax * ed) }
  }
  if (skillId === 11 || skillId === '11' || skillId === 'coldarrow' || skillId === 'cold arrow') {
    const stats = calculateColdArrowStats(slvl, synergies as any)
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 12 || skillId === '12' || skillId === 'multipleshot' || skillId === 'multiple shot') {
    const stats = calculateMultipleShotStats(slvl)
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: Math.floor(baseMin * stats.damageMultiplier), max: Math.floor(baseMax * stats.damageMultiplier) }
  }
  if (
    skillId === 'powerstrike' ||
    skillId === 'power strike' ||
    ((skillId === 14 || skillId === '14') && synergies !== undefined && typeof synergies === 'object')
  ) {
    const stats = calculatePowerStrikeStats(slvl, synergies as any)
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 15 || skillId === '15' || skillId === 'poisonjavelin' || skillId === 'poison javelin') {
    const stats = calculatePoisonJavelinStats(slvl, synergies as any)
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 16 || skillId === '16' || skillId === 'explodingarrow' || skillId === 'exploding arrow') {
    const stats = calculateExplodingArrowStats(slvl, synergies as any)
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: baseMin + stats.minBlastDamage, max: baseMax + stats.maxBlastDamage }
  }
  if (skillId === 19 || skillId === '19' || skillId === 'impale') {
    const stats = calculateImpaleStats(slvl)
    const ed = 1 + stats.enhancedDamagePct / 100
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: Math.floor(baseMin * ed), max: Math.floor(baseMax * ed) }
  }
  if (skillId === 20 || skillId === '20' || skillId === 'lightningbolt' || skillId === 'lightning bolt') {
    const stats = calculateLightningBoltStats(slvl, synergies as any)
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 21 || skillId === '21' || skillId === 'icearrow' || skillId === 'ice arrow') {
    const stats = calculateIceArrowStats(slvl, synergies as any)
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 22 || skillId === '22' || skillId === 'guidedarrow' || skillId === 'guided arrow') {
    const stats = calculateGuidedArrowStats(slvl)
    const ed = 1 + stats.enhancedDamagePct / 100
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: Math.floor(baseMin * ed), max: Math.floor(baseMax * ed) }
  }
  if (skillId === 24 || skillId === '24' || skillId === 'chargedstrike' || skillId === 'charged strike') {
    const stats = calculateChargedStrikeStats(slvl, synergies as any)
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 25 || skillId === '25' || skillId === 'plaguejavelin' || skillId === 'plague javelin') {
    const stats = calculatePlagueJavelinStats(slvl, synergies as any)
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 26 || skillId === '26' || skillId === 'strafe') {
    const stats = calculateStrafeStats(slvl)
    const mult = stats.damageMultiplier * (1 + stats.enhancedDamagePct / 100)
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: Math.floor(baseMin * mult), max: Math.floor(baseMax * mult) }
  }
  if (skillId === 27 || skillId === '27' || skillId === 'immolationarrow' || skillId === 'immolation arrow') {
    const stats = calculateImmolationArrowStats(slvl, synergies as any)
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: baseMin + stats.minExplosionDamage, max: baseMax + stats.maxExplosionDamage }
  }
  if (skillId === 30 || skillId === '30' || skillId === 'fend') {
    const stats = calculateFendStats(slvl)
    const ed = 1 + stats.enhancedDamagePct / 100
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: Math.floor(baseMin * ed), max: Math.floor(baseMax * ed) }
  }
  if (skillId === 31 || skillId === '31' || skillId === 'freezingarrow' || skillId === 'freezing arrow') {
    const stats = calculateFreezingArrowStats(slvl, synergies as any)
    const baseMin = weaponDamage?.min ?? 0
    const baseMax = weaponDamage?.max ?? 0
    return { min: baseMin + stats.minColdDamage, max: baseMax + stats.maxColdDamage }
  }
  if (skillId === 34 || skillId === '34' || skillId === 'lightningstrike' || skillId === 'lightning strike') {
    const stats = calculateLightningStrikeStats(slvl, synergies as any)
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (skillId === 35 || skillId === '35' || skillId === 'lightningfury' || skillId === 'lightning fury') {
    const stats = calculateLightningFuryStats(slvl, synergies as any)
    const baseMin = Number.isFinite(weaponDamage?.min) ? Math.max(0, Math.floor(weaponDamage!.min)) : 0
    const baseMax = Number.isFinite(weaponDamage?.max) ? Math.max(0, Math.floor(weaponDamage!.max)) : 0
    return { min: baseMin + stats.minDamage, max: baseMax + stats.maxDamage }
  }
  if (
    skillId === 8 || skillId === '8' || skillId === 'innersight' || skillId === 'inner sight' ||
    skillId === 9 || skillId === '9' || skillId === 'criticalstrike' || skillId === 'critical strike' ||
    skillId === 13 || skillId === '13' || skillId === 'dodge' ||
    skillId === 17 || skillId === '17' || skillId === 'slowmissiles' || skillId === 'slow missiles' ||
    skillId === 18 || skillId === '18' || skillId === 'avoid' ||
    skillId === 23 || skillId === '23' || skillId === 'penetrate' ||
    skillId === 28 || skillId === '28' || skillId === 'decoy' || skillId === 'dopplezon' ||
    skillId === 29 || skillId === '29' || skillId === 'evade' ||
    skillId === 32 || skillId === '32' || skillId === 'valkyrie' ||
    skillId === 33 || skillId === '33' || skillId === 'pierce'
  ) {
    return { min: 0, max: 0 }
  }
  if (skillId === 38 || skillId === '38' || skillId === 'chargedbolt' || skillId === 'charged bolt') {
    return calculateChargedBoltDamage(slvl, synergies as any)
  }
  if (skillId === 47 || skillId === '47' || skillId === 'fireball' || skillId === 'fire ball') {
    return calculateFireBallDamage(slvl, synergies as any)
  }
  if (skillId === 41 || skillId === '41' || skillId === 'inferno') {
    return calculateInfernoDamage(slvl, synergies as any)
  }
  if (skillId === 46 || skillId === '46' || skillId === 'blaze') {
    return calculateBlazeDamage(slvl, synergies as any)
  }
  if (skillId === 51 || skillId === '51' || skillId === 'firewall' || skillId === 'fire wall') {
    return calculateFireWallDamage(slvl, synergies as any)
  }
  if (skillId === 52 || skillId === '52' || skillId === 'enchant') {
    return calculateEnchantDamage(slvl, synergies as any)
  }
  if (skillId === 40 || skillId === '40' || skillId === 'frozenarmor' || skillId === 'frozen armor') {
    return { min: 0, max: 0 }
  }
  if (skillId === 43 || skillId === '43' || skillId === 'telekinesis') {
    return calculateTelekinesisDamage(slvl)
  }
  if (skillId === 44 || skillId === '44' || skillId === 'frostnova' || skillId === 'frost nova') {
    return calculateFrostNovaDamage(slvl, synergies as any)
  }
  if (skillId === 48 || skillId === '48' || skillId === 'nova') {
    return calculateNovaDamage(slvl, synergies as any)
  }
  if (skillId === 42 || skillId === '42' || skillId === 'staticfield' || skillId === 'static field') {
    return { min: 0, max: 0 }
  }
  if (skillId === 45 || skillId === '45' || skillId === 'iceblast' || skillId === 'ice blast') {
    return calculateIceBlastDamage(slvl, synergies as any)
  }
  if (skillId === 50 || skillId === '50' || skillId === 'shiverarmor' || skillId === 'shiver armor') {
    return calculateShiverArmorDamage(slvl, synergies as any)
  }
  if (skillId === 53 || skillId === '53' || skillId === 'chainlightning' || skillId === 'chain lightning') {
    return calculateChainLightningDamage(slvl, synergies as any)
  }
  if (skillId === 55 || skillId === '55' || skillId === 'glacialspike' || skillId === 'glacial spike') {
    return calculateGlacialSpikeDamage(slvl, synergies as any)
  }
  if (skillId === 60 || skillId === '60' || skillId === 'chillingarmor' || skillId === 'chilling armor') {
    return calculateChillingArmorDamage(slvl, synergies as any)
  }
  if (skillId === 49 || skillId === '49' || skillId === 'lightning') {
    return calculateLightningDamage(slvl, synergies as any)
  }
  if (skillId === 57 || skillId === '57' || skillId === 'thunderstorm' || skillId === 'thunder storm') {
    return calculateThunderStormDamage(slvl, synergies as any)
  }
  if (skillId === 58 || skillId === '58' || skillId === 'energyshield' || skillId === 'energy shield') {
    return { min: 0, max: 0 }
  }
  if (skillId === 61 || skillId === '61' || skillId === 'firemastery' || skillId === 'fire mastery') {
    return { min: 0, max: 0 }
  }
  if (skillId === 63 || skillId === '63' || skillId === 'lightningmastery' || skillId === 'lightning mastery') {
    return { min: 0, max: 0 }
  }
  if (skillId === 65 || skillId === '65' || skillId === 'coldmastery' || skillId === 'cold mastery') {
    return { min: 0, max: 0 }
  }
  if (skillId === 59 || skillId === '59' || skillId === 'blizzard') {
    return calculateBlizzardDamage(slvl, synergies)
  }
  if (skillId === 56 || skillId === '56' || skillId === 'meteor') {
    return calculateMeteorDamage(slvl, synergies as any)
  }
  if (skillId === 62 || skillId === '62' || skillId === 'hydra') {
    return calculateHydraDamage(slvl, synergies as any)
  }
  if (skillId === 67 || skillId === '67' || skillId === 'teeth') {
    return calculateTeethDamage(slvl, synergies as any)
  }
  if (skillId === 68 || skillId === '68' || skillId === 'bonearmor' || skillId === 'bone armor') {
    const lvl = Math.max(1, Math.floor(slvl))
    const base = 20 + (lvl - 1) * 10
    let cap = base
    if (typeof synergies === 'number' && Number.isFinite(synergies) && synergies > 0) {
      cap = Math.floor(base * synergies)
    } else if (synergies && typeof synergies === 'object') {
      cap = calculateBoneArmorCapacity(slvl, synergies as any)
    }
    return { min: cap, max: cap }
  }
  if (skillId === 70 || skillId === '70' || skillId === 'raiseskeleton' || skillId === 'raise skeleton') {
    return { min: 0, max: 0 }
  }
  if (skillId === 73 || skillId === '73' || skillId === 'poisondagger' || skillId === 'poison dagger') {
    const p = calculatePoisonDaggerDamage(slvl, synergies as any)
    return { min: p.minDamage, max: p.maxDamage }
  }
  if (skillId === 74 || skillId === '74' || skillId === 'corpseexplosion' || skillId === 'corpse explosion') {
    const hp = weaponDamage?.max ?? 1000
    const ce = calculateCorpseExplosionDamage(hp)
    const syn = typeof synergies === 'number' && Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
    return { min: Math.floor(ce.minTotal * syn), max: Math.floor(ce.maxTotal * syn) }
  }
  if (skillId === 78 || skillId === '78' || skillId === 'bonewall' || skillId === 'bone wall') {
    const bw = calculateBoneWallStats(slvl, synergies as any)
    return { min: bw.hp, max: bw.hp }
  }
  if (skillId === 83 || skillId === '83' || skillId === 'poisonexplosion' || skillId === 'poison explosion') {
    const pe = calculatePoisonExplosionDamage(slvl, synergies as any)
    return { min: pe.minDamage, max: pe.maxDamage }
  }
  if (skillId === 84 || skillId === '84' || skillId === 'bonespear' || skillId === 'bone spear') {
    return calculateBoneSpearDamage(slvl, synergies as any)
  }
  if (skillId === 88 || skillId === '88' || skillId === 'boneprison' || skillId === 'bone prison') {
    const bp = calculateBonePrisonStats(slvl, synergies as any)
    return { min: bp.hp, max: bp.hp }
  }
  if (skillId === 92 || skillId === '92' || skillId === 'poisonnova' || skillId === 'poison nova') {
    const pn = calculatePoisonNovaDamage(slvl, synergies as any)
    return { min: pn.minDamage, max: pn.maxDamage }
  }
  if (skillId === 93 || skillId === '93' || skillId === 'bonespirit' || skillId === 'bone spirit') {
    return calculateBoneSpiritDamage(slvl, synergies as any)
  }

  const numericSkillId = typeof skillId === 'number' ? skillId : Number(skillId)
  if ([66, 71, 72, 76, 77, 81, 82, 86, 87, 91].includes(numericSkillId)) {
    return { min: 0, max: 0 }
  }
  const def = Number.isFinite(numericSkillId) ? getBatch1SkillDef(numericSkillId) : undefined
  if (!def) {
    if (weaponDamage) {
      const wMin = Number.isFinite(weaponDamage.min) ? Math.max(0, Math.floor(weaponDamage.min)) : 0
      const wMax = Number.isFinite(weaponDamage.max) ? Math.max(0, Math.floor(weaponDamage.max)) : 0
      return { min: wMin, max: wMax }
    }
    return { min: 0, max: 0 }
  }

  const lvl = Number.isFinite(slvl) ? Math.max(1, Math.floor(slvl)) : 1
  let min = def.emin
  let max = def.emax

  // Level bands (Level 2..8: lev1, 9..16: lev2, 17..22: lev3, 23..28: lev4, 29+: lev5)
  if (lvl > 1) {
    const maxElev1 = def.emaxlev1 ?? def.elev1
    const maxElev2 = def.emaxlev2 ?? def.elev2
    const maxElev3 = def.emaxlev3 ?? def.elev3
    const maxElev4 = def.emaxlev4 ?? def.elev4
    const maxElev5 = def.emaxlev5 ?? def.elev5

    const b1 = Math.min(lvl - 1, 7)
    min += b1 * def.elev1
    max += b1 * maxElev1

    if (lvl > 8) {
      const b2 = Math.min(lvl - 8, 8)
      min += b2 * def.elev2
      max += b2 * maxElev2
    }
    if (lvl > 16) {
      const b3 = Math.min(lvl - 16, 6)
      min += b3 * def.elev3
      max += b3 * maxElev3
    }
    if (lvl > 22) {
      const b4 = Math.min(lvl - 22, 6)
      min += b4 * def.elev4
      max += b4 * maxElev4
    }
    if (lvl > 28) {
      const b5 = lvl - 28
      min += b5 * def.elev5
      max += b5 * maxElev5
    }
  }

  // Precision shift: HitShift 7 = 0.5 (128/256), HitShift 8 = 1.0 (256/256)
  const hitShift = def.hitshift ?? 8
  const shiftMultiplier = 2 ** (hitShift - 8)
  min *= shiftMultiplier
  max *= shiftMultiplier

  // Apply synergy multiplier
  const syn = typeof synergies === 'number' && Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
  min = Math.floor(min * syn)
  max = Math.floor(max * syn)

  // Weapon damage scaling via SrcDam (128 = 100% weapon damage)
  if (weaponDamage && def.srcDamage > 0) {
    const wpnMult = def.srcDamage / 128.0
    const wMin = Number.isFinite(weaponDamage.min) ? Math.max(0, Math.floor(weaponDamage.min)) : 0
    const wMax = Number.isFinite(weaponDamage.max) ? Math.max(0, Math.floor(weaponDamage.max)) : 0
    min += Math.floor(wMin * wpnMult)
    max += Math.floor(wMax * wpnMult)
  }

  return { min, max }
}

/**
 * Calculates Blizzard (Skill 59) synergy multiplier:
 * +5% damage per hard point in Ice Bolt (39), Ice Blast (45), and Glacial Spike (55).
 */
export function calculateBlizzardSynergyMultiplier(synergies: {
  readonly iceBolt?: number | undefined
  readonly iceBlast?: number | undefined
  readonly glacialSpike?: number | undefined
}): number {
  const points = (synergies.iceBolt ?? 0) + (synergies.iceBlast ?? 0) + (synergies.glacialSpike ?? 0)
  return 1.0 + points * 0.05
}

/**
 * Calculates Blizzard (Skill 59) min and max damage with 1.13c 5-band level scaling and synergies.
 */
export function calculateBlizzardDamage(
  effectiveLevel: number,
  synergies: {
    readonly iceBolt?: number | undefined
    readonly iceBlast?: number | undefined
    readonly glacialSpike?: number | undefined
  } | number = {},
): { min: number; max: number } {
  let syn = 1.0
  if (typeof synergies === 'number') {
    syn = Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
  } else if (synergies && typeof synergies === 'object') {
    syn = calculateBlizzardSynergyMultiplier(synergies)
  }
  const lvl = Number.isFinite(effectiveLevel) ? Math.max(1, Math.floor(effectiveLevel)) : 1
  let min = 45
  let max = 75
  if (lvl > 1) {
    const b1 = Math.min(lvl - 1, 7)
    min += b1 * 15
    max += b1 * 16

    if (lvl > 8) {
      const b2 = Math.min(lvl - 8, 8)
      min += b2 * 30
      max += b2 * 31
    }
    if (lvl > 16) {
      const b3 = Math.min(lvl - 16, 6)
      min += b3 * 45
      max += b3 * 46
    }
    if (lvl > 22) {
      const b4 = Math.min(lvl - 22, 6)
      min += b4 * 55
      max += b4 * 56
    }
    if (lvl > 28) {
      const b5 = lvl - 28
      min += b5 * 65
      max += b5 * 66
    }
  }
  return {
    min: Math.floor(min * syn),
    max: Math.floor(max * syn),
  }
}

/**
 * Calculates Meteor (Skill 56) synergy multiplier:
 * +5% fire damage per hard point in Fire Bolt (36) and Fire Ball (47).
 * Fire Mastery (61): +30% base, +7%/lvl if present.
 */
export function calculateMeteorSynergyMultiplier(synergies: {
  readonly fireBolt?: number | undefined
  readonly fireBall?: number | undefined
  readonly fireMastery?: number | undefined
}): number {
  const points = (synergies.fireBolt ?? 0) + (synergies.fireBall ?? 0)
  const synPct = points * 5 // +5% per hard point
  const masteryPct = synergies.fireMastery && synergies.fireMastery > 0
    ? 30 + (synergies.fireMastery - 1) * 7 // Fire Mastery: +30% base, +7%/lvl
    : 0
  return (1.0 + synPct / 100) * (1.0 + masteryPct / 100)
}

/**
 * Calculates Meteor (Skill 56) primary detonation fire damage with 1.13c 5-band level scaling and synergies.
 * Base: 80 - 100
 * 5 bands: [23, 39, 79, 81, 83] min / [25, 41, 81, 83, 85] max.
 */
export function calculateMeteorDamage(
  effectiveLevel: number,
  synergies: {
    readonly fireBolt?: number | undefined
    readonly fireBall?: number | undefined
    readonly fireMastery?: number | undefined
  } | number = {},
): { min: number; max: number } {
  let syn = 1.0
  if (typeof synergies === 'number') {
    syn = Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
  } else if (synergies && typeof synergies === 'object') {
    syn = calculateMeteorSynergyMultiplier(synergies)
  }

  const lvl = Number.isFinite(effectiveLevel) ? Math.max(1, Math.floor(effectiveLevel)) : 1
  let min = 80
  let max = 100

  if (lvl > 1) {
    const b1 = Math.min(lvl - 1, 7)
    min += b1 * 23
    max += b1 * 25

    if (lvl > 8) {
      const b2 = Math.min(lvl - 8, 8)
      min += b2 * 39
      max += b2 * 41
    }
    if (lvl > 16) {
      const b3 = Math.min(lvl - 16, 6)
      min += b3 * 79
      max += b3 * 81
    }
    if (lvl > 22) {
      const b4 = Math.min(lvl - 22, 6)
      min += b4 * 81
      max += b4 * 83
    }
    if (lvl > 28) {
      const b5 = lvl - 28
      min += b5 * 83
      max += b5 * 85
    }
  }

  return {
    min: Math.floor(min * syn),
    max: Math.floor(max * syn),
  }
}

/**
 * Calculates Meteor residual ground fire (meteorfire, ID 240) periodic damage.
 * 1.13c Ground Truth:
 * - Base: 15 - 25
 * - 5 bands: [4, 5, 6, 6, 6] min/max
 * - Synergies: +3% per hard point of Inferno (41); Fire Mastery (61) applies.
 * - HitShift: 3 (8/256 internal precision per tick).
 * - Per-second multiplier: 25 * 8 / 256 = 200 / 256 = 0.78125.
 */
export function calculateMeteorResidualFireDamage(
  effectiveLevel: number,
  synergies: {
    readonly inferno?: number | undefined
    readonly fireMastery?: number | undefined
  } | number = {},
): {
  min: number
  max: number
  perSecMin: number
  perSecMax: number
} {
  let syn = 1.0
  if (typeof synergies === 'number') {
    syn = Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
  } else if (synergies && typeof synergies === 'object') {
    const infernoPts = synergies.inferno ?? 0
    const infernoPct = infernoPts * 3 // +3% per point
    const masteryPct = synergies.fireMastery && synergies.fireMastery > 0
      ? 30 + (synergies.fireMastery - 1) * 7
      : 0
    syn = (1.0 + infernoPct / 100) * (1.0 + masteryPct / 100)
  }

  const lvl = Number.isFinite(effectiveLevel) ? Math.max(1, Math.floor(effectiveLevel)) : 1
  let min = 15
  let max = 25

  if (lvl > 1) {
    const b1 = Math.min(lvl - 1, 7)
    min += b1 * 4
    max += b1 * 4

    if (lvl > 8) {
      const b2 = Math.min(lvl - 8, 8)
      min += b2 * 5
      max += b2 * 5
    }
    if (lvl > 16) {
      const b3 = Math.min(lvl - 16, 6)
      min += b3 * 6
      max += b3 * 6
    }
    if (lvl > 22) {
      const b4 = Math.min(lvl - 22, 6)
      min += b4 * 6
      max += b4 * 6
    }
    if (lvl > 28) {
      const b5 = lvl - 28
      min += b5 * 6
      max += b5 * 6
    }
  }

  const rawMin = Math.floor(min * syn)
  const rawMax = Math.floor(max * syn)

  // In 1.13c HitShift is 3 (8/256) at 25 fps: per-second multiplier is 200/256 = 0.78125
  const perSecMin = Math.floor((rawMin * 200) / 256)
  const perSecMax = Math.floor((rawMax * 200) / 256)

  return {
    min: rawMin,
    max: rawMax,
    perSecMin,
    perSecMax,
  }
}

/**
 * Calculates Meteor detailed damage profile including impact fire, optional physical split,
 * and residual ground fire damage per second.
 */
export function calculateMeteorDetailedDamage(
  effectiveLevel: number,
  synergies: {
    readonly fireBolt?: number | undefined
    readonly fireBall?: number | undefined
    readonly fireMastery?: number | undefined
    readonly inferno?: number | undefined
  } = {},
  options?: { readonly physRatio?: number | undefined }
): {
  impactFire: { min: number; max: number }
  impactPhys: { min: number; max: number }
  residualFire: { min: number; max: number; perSecMin: number; perSecMax: number }
} {
  const det = calculateMeteorDamage(effectiveLevel, synergies)
  const physRatio = Math.max(0, Math.min(1, options?.physRatio ?? 0)) // 0 in vanilla 1.13c
  const fireRatio = 1.0 - physRatio

  const impactFire = {
    min: Math.floor(det.min * fireRatio),
    max: Math.floor(det.max * fireRatio),
  }
  const impactPhys = {
    min: Math.floor(det.min * physRatio),
    max: Math.floor(det.max * physRatio),
  }
  const residualFire = calculateMeteorResidualFireDamage(effectiveLevel, synergies)

  return {
    impactFire,
    impactPhys,
    residualFire,
  }
}

/**
 * Calculates Hydra (Skill 62) synergy multiplier:
 * +3% fire damage per hard point in Fire Bolt (36) and Fire Ball (47).
 */
function calculateHydraSynergyMultiplier(synergies: {
  readonly fireBolt?: number | undefined
  readonly fireBall?: number | undefined
  readonly fireMastery?: number | undefined
} | number = {}): number {
  if (typeof synergies === 'number') {
    return Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
  }
  const points = (synergies.fireBolt ?? 0) + (synergies.fireBall ?? 0)
  return 1.0 + points * 0.03
}

/**
 * Calculates Hydra (Skill 62) min and max damage with 1.13c 5-band level scaling and synergies.
 * 1.13c Ground Truth:
 * - EMin: 28, EMax: 39
 * - 5 bands: elev = [11, 15, 19, 23, 27], emaxlev = [13, 17, 21, 25, 29]
 * - HitShift: 7 (factor = 0.5)
 * - Synergies: +3% per hard point of Fire Bolt (36) and Fire Ball (47).
 */
function calculateHydraDamage(
  effectiveLevel: number,
  synergies: {
    readonly fireBolt?: number | undefined
    readonly fireBall?: number | undefined
    readonly fireMastery?: number | undefined
  } | number = {},
): { min: number; max: number } {
  let syn = 1.0
  if (typeof synergies === 'number') {
    syn = Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
  } else if (synergies && typeof synergies === 'object') {
    syn = calculateHydraSynergyMultiplier(synergies)
  }
  const lvl = Number.isFinite(effectiveLevel) ? Math.max(1, Math.floor(effectiveLevel)) : 1
  let min = 28
  let max = 39

  if (lvl > 1) {
    const b1 = Math.min(lvl - 1, 7)
    min += b1 * 11
    max += b1 * 13

    if (lvl > 8) {
      const b2 = Math.min(lvl - 8, 8)
      min += b2 * 15
      max += b2 * 17
    }
    if (lvl > 16) {
      const b3 = Math.min(lvl - 16, 6)
      min += b3 * 19
      max += b3 * 21
    }
    if (lvl > 22) {
      const b4 = Math.min(lvl - 22, 6)
      min += b4 * 23
      max += b4 * 25
    }
    if (lvl > 28) {
      const b5 = lvl - 28
      min += b5 * 27
      max += b5 * 29
    }
  }

  // HitShift 7 = 0.5 (128/256 precision)
  min *= 0.5
  max *= 0.5

  return {
    min: Math.floor(min * syn),
    max: Math.floor(max * syn),
  }
}

/**
 * Calculates Fire Ball (Skill 47) synergy multiplier:
 * +14% fire damage per hard point in Fire Bolt (36) and Meteor (56).
 * Fire Mastery (61): +30% base, +7%/lvl if present.
 */
function calculateFireBallSynergyMultiplier(synergies: {
  readonly fireBolt?: number | undefined
  readonly meteor?: number | undefined
  readonly fireMastery?: number | undefined
} | number = {}): number {
  if (typeof synergies === 'number') {
    return Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
  }
  const points = (synergies.fireBolt ?? 0) + (synergies.meteor ?? 0)
  const synPct = points * 14 // +14% per hard point
  const masteryPct = synergies.fireMastery && synergies.fireMastery > 0
    ? 30 + (synergies.fireMastery - 1) * 7 // Fire Mastery: +30% base, +7%/lvl
    : 0
  return (1.0 + synPct / 100) * (1.0 + masteryPct / 100)
}

/**
 * Calculates Fire Ball (Skill 47) min and max damage with 1.13c 5-band level scaling and synergies.
 * 1.13c Ground Truth (`Skills.txt` row 47):
 * - EMin: 12, EMax: 28
 * - 5 bands: elev = [13, 23, 28, 33, 38], emaxlev = [15, 25, 30, 35, 40]
 * - HitShift: 7 (factor = 0.5)
 * - Synergies: +14% per hard point in Fire Bolt (36) and Meteor (56).
 */
function calculateFireBallDamage(
  effectiveLevel: number,
  synergies: {
    readonly fireBolt?: number | undefined
    readonly meteor?: number | undefined
    readonly fireMastery?: number | undefined
  } | number = {},
): { min: number; max: number } {
  let syn = 1.0
  if (typeof synergies === 'number') {
    syn = Number.isFinite(synergies) && synergies > 0 ? synergies : 1.0
  } else if (synergies && typeof synergies === 'object') {
    syn = calculateFireBallSynergyMultiplier(synergies)
  }

  const lvl = Number.isFinite(effectiveLevel) ? Math.max(1, Math.floor(effectiveLevel)) : 1
  let min = 12
  let max = 28

  if (lvl > 1) {
    const b1 = Math.min(lvl - 1, 7)
    min += b1 * 13
    max += b1 * 15

    if (lvl > 8) {
      const b2 = Math.min(lvl - 8, 8)
      min += b2 * 23
      max += b2 * 25
    }
    if (lvl > 16) {
      const b3 = Math.min(lvl - 16, 6)
      min += b3 * 28
      max += b3 * 30
    }
    if (lvl > 22) {
      const b4 = Math.min(lvl - 22, 6)
      min += b4 * 33
      max += b4 * 35
    }
    if (lvl > 28) {
      const b5 = lvl - 28
      min += b5 * 38
      max += b5 * 40
    }
  }

  min *= 0.5
  max *= 0.5

  return {
    min: Math.floor(min * syn),
    max: Math.floor(max * syn),
  }
}

/** Result of executing a Batch 1 skill. */
export type SkillExecutionResult =
  | { readonly kind: 'cooldown'; readonly ticksLeft: number }
  | { readonly kind: 'mana'; readonly cost: number; readonly currentMana: number }
  | {
      readonly kind: 'projectile'
      readonly skillId: number
      readonly skillName: string
      readonly projectile: Projectile
      readonly manaCost: number
      readonly cooldownTicks: number
      readonly damage: { min: number; max: number }
    }
  | {
      readonly kind: 'melee'
      readonly skillId: number
      readonly skillName: string
      readonly damage: { min: number; max: number }
      readonly manaCost: number
      readonly cooldownTicks: number
      readonly hits: number
      readonly knockback: boolean
      readonly autoHit: boolean
      readonly selfDamagePct?: number | undefined
    }
  | {
      readonly kind: 'area'
      readonly skillId: number
      readonly skillName: string
      readonly radius: number
      readonly damage: { min: number; max: number }
      readonly manaCost: number
      readonly cooldownTicks: number
    }
  | {
      readonly kind: 'buff'
      readonly skillId: number
      readonly skillName: string
      readonly durationSeconds: number
      readonly manaCost: number
      readonly cooldownTicks: number
      readonly buffEffect: Readonly<Record<string, number>>
    }
  | {
      readonly kind: 'curse'
      readonly skillId: number
      readonly skillName: string
      readonly radius: number
      readonly durationSeconds: number
      readonly manaCost: number
      readonly cooldownTicks: number
      readonly debuffEffect: Readonly<Record<string, number>>
    }
  | {
      readonly kind: 'movement'
      readonly skillId: number
      readonly skillName: string
      readonly destination: { readonly x: number; readonly y: number }
      readonly manaCost: number
      readonly cooldownTicks: number
    }
  | {
      readonly kind: 'summon'
      readonly skillId: number
      readonly skillName: string
      readonly summonType: string
      readonly manaCost: number
      readonly cooldownTicks: number
      readonly count: number
    }
  | {
      readonly kind: 'aura'
      readonly skillId: number
      readonly skillName: string
      readonly radius: number
      readonly manaCost: number
      readonly cooldownTicks: number
      readonly auraBonusPct: number
    }
  | {
      readonly kind: 'passive'
      readonly skillId: number
      readonly skillName: string
      readonly passiveBonus: Readonly<Record<string, number>>
    }

/**
 * Executes combat mechanics for any of the Batch 1 essential combat skills across all 7 classes.
 * Enforces resource checks (cooldown, mana) and produces typed execution outcomes (projectile,
 * melee, area, buff, curse, movement, summon, aura, passive).
 */
export function executeSkill(
  skillId: number,
  context: SkillExecutionContext,
  options?: {
    readonly rng?: Rng
    readonly weaponDamage?: { min: number; max: number }
    readonly deductResources?: boolean
  }
): SkillExecutionResult {
  const def = getBatch1SkillDef(skillId)
  if (!def) {
    return {
      kind: 'melee',
      skillId,
      skillName: 'Unknown',
      damage: options?.weaponDamage
        ? { min: Math.max(0, options.weaponDamage.min), max: Math.max(0, options.weaponDamage.max) }
        : { min: 0, max: 0 },
      manaCost: 0,
      cooldownTicks: 0,
      hits: 1,
      knockback: false,
      autoHit: false,
    }
  }

  const { caster, target, skillLevel } = context
  const synergyMultiplier = context.synergyMultiplier ?? 1.0
  const cooldownLeft = caster.cooldown ?? 0
  if (cooldownLeft > 0 && def.delay > 0) {
    return { kind: 'cooldown', ticksLeft: cooldownLeft }
  }

  const manaCost = getSkillManaCost(skillId, skillLevel)
  const currentMana = Number.isFinite(caster.mana) ? caster.mana! : 0
  if (currentMana < manaCost) {
    return { kind: 'mana', cost: manaCost, currentMana }
  }

  const damage = calculateSkillDamage(skillId, skillLevel, synergyMultiplier, options?.weaponDamage)
  const cooldownTicks = def.delay

  if (options?.deductResources !== false) {
    caster.mana = Math.max(0, currentMana - manaCost)
    if (cooldownTicks > 0) {
      caster.cooldown = Math.max(caster.cooldown ?? 0, cooldownTicks)
    }
  }

  const facing = caster.facing ?? 0
  const vector = FACING_VECTORS[facing] ?? FACING_VECTORS[0]!
  let dx = vector[0]
  let dy = vector[1]
  if (target !== undefined) {
    const tdx = target.x - caster.x
    const tdy = target.y - caster.y
    const len = Math.hypot(tdx, tdy)
    if (len > 0) {
      dx = tdx / len
      dy = tdy / len
    }
  }

  switch (def.type) {
    case 'projectile': {
      const speed = def.speed ?? 450
      const range = def.range ?? 400
      const perTick = speed / 25
      const ttl = Math.max(1, Math.round(range / perTick))
      const projDamage = options?.rng
        ? options.rng.int(damage.min, Math.max(damage.min, damage.max))
        : Math.round((damage.min + damage.max) / 2)
      const projectile: Projectile = {
        skillId: String(skillId),
        x: caster.x,
        y: caster.y,
        vx: dx * perTick,
        vy: dy * perTick,
        damage: projDamage,
        ttl,
        fromPlayer: true,
      }
      return {
        kind: 'projectile',
        skillId,
        skillName: def.name,
        projectile,
        manaCost,
        cooldownTicks,
        damage,
      }
    }

    case 'melee': {
      let hits = 1
      let knockback = false
      let autoHit = false
      let selfDamagePct: number | undefined

      if (skillId === 10) hits = 3 // Jab: 3 strikes
      if (skillId === 106) hits = Math.min(Math.max(1, Math.floor(skillLevel)) + 1, 5) // Zeal: min(lvl+1, 5)
      if (skillId === 133) hits = 2 // Double Swing: 2 hits
      if (skillId === 126) knockback = true // Bash: knockback
      if (skillId === 97) { autoHit = true; knockback = true } // Smite: 100% hit, knockback
      if (skillId === 96) selfDamagePct = 8 // Sacrifice: 8% self-damage

      return {
        kind: 'melee',
        skillId,
        skillName: def.name,
        damage,
        manaCost,
        cooldownTicks,
        hits,
        knockback,
        autoHit,
        selfDamagePct,
      }
    }

    case 'area': {
      const radius = skillId === 44 ? 240 : skillId === 74 ? 80 + 20 * (skillLevel - 1) : 120
      return {
        kind: 'area',
        skillId,
        skillName: def.name,
        radius,
        damage,
        manaCost,
        cooldownTicks,
      }
    }

    case 'buff': {
      const durationSeconds = skillId === 258 ? 120 + 12 * (skillLevel - 1) : skillId === 138 ? 20 + 10 * (skillLevel - 1) : 40
      const buffEffect: Record<string, number> = {}
      if (skillId === 68) buffEffect.damageAbsorption = 20 + 10 * (skillLevel - 1) // Bone Armor
      if (skillId === 138) buffEffect.defensePct = 100 + 10 * (skillLevel - 1) // Shout
      if (skillId === 258) {
        buffEffect.attackSpeedPct = 20 + 2 * (skillLevel - 1) // Burst of Speed
        buffEffect.walkRunSpeedPct = 20 + 3 * (skillLevel - 1)
      }
      if (skillId === 223) {
        buffEffect.werewolfLifePct = 25 // 1.13c Werewolf par3 = 25% Max HP
        buffEffect.staminaPct = 25 // par4 = 25% Max Stamina
        buffEffect.attackSpeedPct = Math.floor((110 * skillLevel) / (skillLevel + 6) * (80 - 10) / 100) + 10 // dm(10, 80, slvl)
        buffEffect.toHitPct = 50 + 15 * (skillLevel - 1)
      }
      return {
        kind: 'buff',
        skillId,
        skillName: def.name,
        durationSeconds,
        manaCost,
        cooldownTicks,
        buffEffect: Object.freeze(buffEffect),
      }
    }

    case 'curse': {
      const radius = 80 + 20 * (skillLevel - 1)
      const durationSeconds = skillId === 66 ? 8 + 3 * (skillLevel - 1) : 10
      const debuffEffect: Record<string, number> = {}
      if (skillId === 66) debuffEffect.physicalResistPenaltyPct = 100 // Amplify Damage
      if (skillId === 130) debuffEffect.flee = 1 // Howl
      return {
        kind: 'curse',
        skillId,
        skillName: def.name,
        radius,
        durationSeconds,
        manaCost,
        cooldownTicks,
        debuffEffect: Object.freeze(debuffEffect),
      }
    }

    case 'movement': {
      const destination = target ? { x: target.x, y: target.y } : { x: caster.x + dx * 200, y: caster.y + dy * 200 }
      return {
        kind: 'movement',
        skillId,
        skillName: def.name,
        destination,
        manaCost,
        cooldownTicks,
      }
    }

    case 'summon': {
      const summonType = skillId === 70 ? 'skeleton' : skillId === 226 ? 'oak_sage' : 'charged_bolt_sentry'
      return {
        kind: 'summon',
        skillId,
        skillName: def.name,
        summonType,
        manaCost,
        cooldownTicks,
        count: skillId === 70 ? calculateSkeletonMaxCount(skillLevel) : 1,
      }
    }

    case 'aura': {
      const auraBonusPct = 40 + 10 * (skillLevel - 1) // Might
      return {
        kind: 'aura',
        skillId,
        skillName: def.name,
        radius: 200,
        manaCost: 0,
        cooldownTicks: 0,
        auraBonusPct,
      }
    }

    case 'passive': {
      const passiveBonus: Record<string, number> = {}
      if (skillId === 37) passiveBonus.manaRegenPct = 30 + 12 * (skillLevel - 1) // Warmth
      if (skillId === 224) passiveBonus.shapeshiftLifePct = 20 + 5 * (skillLevel - 1) // Lycanthropy
      if (skillId === 252) passiveBonus.clawDamagePct = 35 + 8 * (skillLevel - 1) // Claw Mastery
      return {
        kind: 'passive',
        skillId,
        skillName: def.name,
        passiveBonus: Object.freeze(passiveBonus),
      }
    }
  }
}

// ============================================================================
// Paladin Combat Skills (Tree 1 - 10 Skills) Standalone 1.13c Formulas
// ============================================================================

/**
 * 1. Sacrifice (96)
 * - %ED: 180 + (slvl - 1) * 15%
 * - AR: 20 + (slvl - 1) * 7%
 * - Synergies: Redemption (+15%/lvl), Fanaticism (+5%/lvl)
 * - Self-damage: strictly 8% of damage dealt
 */
export function calculateSacrificeStats(
  slvl: number,
  synergies?: { redemption?: number; fanaticism?: number },
): { toHitBonusPct: number; damagePct: number; selfDamagePct: number } {
  const lvl = Math.max(1, slvl)
  const toHitBonusPct = 20 + (lvl - 1) * 7
  const baseEd = 180 + (lvl - 1) * 15
  const redemptionBlvl = synergies?.redemption ?? 0
  const fanaticismBlvl = synergies?.fanaticism ?? 0
  const synBonus = redemptionBlvl * 15 + fanaticismBlvl * 5
  return {
    toHitBonusPct,
    damagePct: baseEd + synBonus,
    selfDamagePct: 8,
  }
}

/**
 * 2. Smite (97)
 * - %ED: 15 + (slvl - 1) * 15%
 * - Stun: Math.min(250, 15 + (slvl - 1) * 5) frames
 * - Damage: shield base min/max + Holy Shield flat bonus
 */
export function calculateSmiteStats(
  slvl: number,
  shieldMin: number,
  shieldMax: number,
  holyShieldBonus?: { min: number; max: number },
): { damagePct: number; stunDurationFrames: number; minDamage: number; maxDamage: number } {
  const lvl = Math.max(1, slvl)
  const damagePct = 15 + (lvl - 1) * 15
  const stunDurationFrames = Math.min(250, 15 + (lvl - 1) * 5)
  const hsMin = holyShieldBonus?.min ?? 0
  const hsMax = holyShieldBonus?.max ?? 0
  const minDamage = shieldMin + hsMin
  const maxDamage = shieldMax + hsMax
  return {
    damagePct,
    stunDurationFrames,
    minDamage,
    maxDamage,
  }
}

/**
 * 3. Holy Bolt (101) Magic Damage vs Undead
 * 5-band scaling:
 * EMin: 8, EMinLev: 8, 10, 13, 16, 20
 * EMax: 16, EMaxLev: 8, 11, 15, 18, 23
 * Synergies: Blessed Hammer (+50%/blvl), Fist of the Heavens (+50%/blvl)
 */
export function calculateHolyBoltDamage(
  slvl: number,
  synergies?: { blessedHammer?: number; fistOfTheHeavens?: number },
): { min: number; max: number } {
  const lvl = Math.max(1, slvl)
  let min = 8
  let max = 16

  if (lvl > 1) {
    const b1 = Math.min(lvl, 8) - 1
    min += b1 * 8
    max += b1 * 8
  }
  if (lvl > 8) {
    const b2 = Math.min(lvl, 16) - 8
    min += b2 * 10
    max += b2 * 11
  }
  if (lvl > 16) {
    const b3 = Math.min(lvl, 22) - 16
    min += b3 * 13
    max += b3 * 15
  }
  if (lvl > 22) {
    const b4 = Math.min(lvl, 28) - 22
    min += b4 * 16
    max += b4 * 18
  }
  if (lvl > 28) {
    const b5 = lvl - 28
    min += b5 * 20
    max += b5 * 23
  }

  const bhBlvl = synergies?.blessedHammer ?? 0
  const fohBlvl = synergies?.fistOfTheHeavens ?? 0
  const synBonusPct = (bhBlvl + fohBlvl) * 50
  const minFinal = Math.trunc((min * (100 + synBonusPct)) / 100)
  const maxFinal = Math.trunc((max * (100 + synBonusPct)) / 100)
  return { min: minFinal, max: maxFinal }
}

/**
 * 4. Holy Bolt (101) Friendly Heal
 * Min heal: 1 + (slvl - 1) * 2
 * Max heal: 6 + (slvl - 1) * 4
 * Synergy: Prayer (+15%/blvl)
 */
export function calculateHolyBoltHeal(
  slvl: number,
  prayerBlvl: number = 0,
): { min: number; max: number } {
  const lvl = Math.max(1, slvl)
  const rawMin = 1 + (lvl - 1) * 2
  const rawMax = 6 + (lvl - 1) * 4
  const prayerBonus = prayerBlvl * 15
  const min = Math.trunc((rawMin * (100 + prayerBonus)) / 100)
  const max = Math.trunc((rawMax * (100 + prayerBonus)) / 100)
  return { min, max }
}

/**
 * 5. Zeal (106)
 * - Hits: min(slvl + 1, 5) per par5=2, par6=5 -> min(2 + slvl - 1, 5) = min(slvl + 1, 5) (lvl 1 -> 2, lvl 4+ -> 5)
 * - AR: 10 + (slvl - 1) * 10%
 * - %ED: slvl >= 5 ? (slvl - 4) * 6% : 0
 * - Synergy: Sacrifice (+12%/blvl)
 */
export function calculateZealStats(
  slvl: number,
  synergies?: { sacrifice?: number },
): { hits: number; toHitBonusPct: number; damagePct: number } {
  const lvl = Math.max(1, slvl)
  const hits = Math.min(5, Math.max(2, 1 + lvl))
  const toHitBonusPct = 10 + (lvl - 1) * 10
  const baseEd = lvl >= 5 ? (lvl - 4) * 6 : 0
  const sacBlvl = synergies?.sacrifice ?? 0
  const damagePct = baseEd + sacBlvl * 12
  return { hits, toHitBonusPct, damagePct }
}

/**
 * 6. Charge (107)
 * - AR: 50 + (slvl - 1) * 15%
 * - %ED: 100 + (slvl - 1) * 25%
 * - Synergies: Vigor (+20%/blvl), Might (+20%/blvl)
 * - Speed multiplier: 3.0 (300% base run velocity)
 */
export function calculateChargeStats(
  slvl: number,
  synergies?: { vigor?: number; might?: number },
): { toHitBonusPct: number; damagePct: number; speedMultiplier: number } {
  const lvl = Math.max(1, slvl)
  const toHitBonusPct = 50 + (lvl - 1) * 15
  const baseEd = 100 + (lvl - 1) * 25
  const vigorBlvl = synergies?.vigor ?? 0
  const mightBlvl = synergies?.might ?? 0
  const synBonus = (vigorBlvl + mightBlvl) * 20
  return {
    toHitBonusPct,
    damagePct: baseEd + synBonus,
    speedMultiplier: 3.0,
  }
}

/**
 * 7. Vengeance (111)
 * - AR: 20 + (slvl - 1) * 10%
 * - Base Elemental %: 70 + (slvl - 1) * 6%
 * - Synergies:
 *   - Fire %: + Resist Fire (+10%/blvl) + Salvation (+2%/blvl)
 *   - Cold %: + Resist Cold (+10%/blvl) + Salvation (+2%/blvl)
 *   - Lightning %: + Resist Lightning (+10%/blvl) + Salvation (+2%/blvl)
 * - Cold Chill Duration: 30 + (slvl - 1) * 15 frames (1.2s + 0.6s/lvl)
 */
export function calculateVengeanceStats(
  slvl: number,
  synergies?: {
    resistFire?: number
    resistCold?: number
    resistLightning?: number
    salvation?: number
  },
): {
  toHitBonusPct: number
  firePct: number
  coldPct: number
  ltngPct: number
  chillDurationFrames: number
} {
  const lvl = Math.max(1, slvl)
  const toHitBonusPct = 20 + (lvl - 1) * 10
  const baseElemPct = 70 + (lvl - 1) * 6
  const salvBonus = (synergies?.salvation ?? 0) * 2
  const firePct = baseElemPct + (synergies?.resistFire ?? 0) * 10 + salvBonus
  const coldPct = baseElemPct + (synergies?.resistCold ?? 0) * 10 + salvBonus
  const ltngPct = baseElemPct + (synergies?.resistLightning ?? 0) * 10 + salvBonus
  const chillDurationFrames = 30 + (lvl - 1) * 15
  return {
    toHitBonusPct,
    firePct,
    coldPct,
    ltngPct,
    chillDurationFrames,
  }
}

/**
 * 8. Blessed Hammer (112) Magic Damage
 * 5-band scaling (1.13c Skills.txt):
 * EMin: 12, EMinLev: 8, 10, 12, 13, 14
 * EMax: 16, EMaxLev: 8, 10, 12, 13, 14
 * Synergies: Blessed Aim (+14%/blvl), Vigor (+14%/blvl)
 * Concentration: receives 50% of active Concentration %ED
 */
export function calculateBlessedHammerDamage(
  slvl: number,
  synergies?: { blessedAim?: number; vigor?: number },
  concentrationEd: number = 0,
): { min: number; max: number; concentrationBonusPct: number } {
  const lvl = Math.max(1, slvl)
  const min = computeBand5(lvl, 12, 8, 10, 12, 13, 14)
  const max = computeBand5(lvl, 16, 8, 10, 12, 13, 14)

  const aimBlvl = synergies?.blessedAim ?? 0
  const vigorBlvl = synergies?.vigor ?? 0
  const synBonusPct = (aimBlvl + vigorBlvl) * 14
  const concBonusPct = Math.trunc(concentrationEd / 2)
  const totalMultPct = 100 + synBonusPct

  let minFinal = Math.trunc((min * totalMultPct) / 100)
  let maxFinal = Math.trunc((max * totalMultPct) / 100)

  if (concBonusPct > 0) {
    minFinal = Math.trunc((minFinal * (100 + concBonusPct)) / 100)
    maxFinal = Math.trunc((maxFinal * (100 + concBonusPct)) / 100)
  }

  return { min: minFinal, max: maxFinal, concentrationBonusPct: concBonusPct }
}

/**
 * 9. Conversion (116)
 * - Chance %: dm34 -> computeDiminishingReturns(0, 50, slvl) = floor((110 * slvl * 50) / (100 * (slvl + 6)))
 * - Duration: 400 frames (16.0s)
 */
export function calculateConversionStats(slvl: number): {
  chancePct: number
  durationFrames: number
  durationSeconds: number
} {
  const lvl = Math.max(1, slvl)
  const chancePct = computeDiminishingReturns(0, 50, lvl)
  return {
    chancePct,
    durationFrames: 400,
    durationSeconds: 16,
  }
}

/**
 * 10. Holy Shield (117)
 * - Duration: 750 + (slvl - 1) * 625 frames (30s + 25s/lvl)
 * - Defense %: 25 + (slvl - 1) * 15% + Defiance (+15%/blvl)
 * - Blocking %: 10 + Math.floor((slvl * 40) / (slvl + 10))% (dm56)
 * - Flat Smite Damage: 3 + (slvl - 1) * 4 min / 6 + (slvl - 1) * 4 max (per 1.13c compute5BandScaling on Holy Shield min/maxDam)
 */
export function calculateHolyShieldStats(
  slvl: number,
  defianceBlvl: number = 0,
): {
  durationFrames: number
  defensePct: number
  blockChancePct: number
  smiteMinFlat: number
  smiteMaxFlat: number
} {
  const lvl = Math.max(1, slvl)
  const durationFrames = 750 + (lvl - 1) * 625
  const defensePct = 25 + (lvl - 1) * 15 + defianceBlvl * 15
  const blockChancePct = computeDiminishingReturns(10, 40, lvl)

  // Holy Shield flat smite min/max damage progression (Skills.txt: minDam=3, maxDam=6, levDam1=2..3 etc.)
  // Let's use exact 5-band scaling: minDam=3, lev=2..3, maxDam=6, lev=2..3
  // From 1.13c Skills.txt: minDam=3, minLevDam1=2, minLevDam2=3, minLevDam3=3, minLevDam4=4, minLevDam5=4
  // maxDam=6, maxLevDam1=2, maxLevDam2=3, maxLevDam3=3, maxLevDam4=4, maxLevDam5=4
  let smiteMinFlat = 3
  let smiteMaxFlat = 6
  if (lvl > 1) {
    const b1 = Math.min(lvl, 8) - 1
    smiteMinFlat += b1 * 2
    smiteMaxFlat += b1 * 2
  }
  if (lvl > 8) {
    const b2 = Math.min(lvl, 16) - 8
    smiteMinFlat += b2 * 3
    smiteMaxFlat += b2 * 3
  }
  if (lvl > 16) {
    const b3 = Math.min(lvl, 22) - 16
    smiteMinFlat += b3 * 4
    smiteMaxFlat += b3 * 4
  }
  if (lvl > 22) {
    const b4 = Math.min(lvl, 28) - 22
    smiteMinFlat += b4 * 4
    smiteMaxFlat += b4 * 4
  }
  if (lvl > 28) {
    const b5 = lvl - 28
    smiteMinFlat += b5 * 4
    smiteMaxFlat += b5 * 4
  }

  return {
    durationFrames,
    defensePct,
    blockChancePct,
    smiteMinFlat,
    smiteMaxFlat,
  }
}

/**
 * 11. Fist of the Heavens (121) Celestial Lightning Damage
 * 5-band scaling:
 * EMin: 150, EMinLev: 15, 30, 45, 55, 65
 * EMax: 200, EMaxLev: 15, 30, 45, 55, 65
 * Synergy: Holy Shock (+7%/blvl)
 */
export function calculateFistOfTheHeavensDamage(
  slvl: number,
  synergies?: { holyShock?: number },
): { lightningMin: number; lightningMax: number } {
  const lvl = Math.max(1, slvl)
  let min = 150
  let max = 200

  if (lvl > 1) {
    const b1 = Math.min(lvl, 8) - 1
    min += b1 * 15
    max += b1 * 15
  }
  if (lvl > 8) {
    const b2 = Math.min(lvl, 16) - 8
    min += b2 * 30
    max += b2 * 30
  }
  if (lvl > 16) {
    const b3 = Math.min(lvl, 22) - 16
    min += b3 * 45
    max += b3 * 45
  }
  if (lvl > 22) {
    const b4 = Math.min(lvl, 28) - 22
    min += b4 * 55
    max += b4 * 55
  }
  if (lvl > 28) {
    const b5 = lvl - 28
    min += b5 * 65
    max += b5 * 65
  }

  const holyShockBlvl = synergies?.holyShock ?? 0
  const synBonusPct = holyShockBlvl * 7
  const lightningMin = Math.trunc((min * (100 + synBonusPct)) / 100)
  const lightningMax = Math.trunc((max * (100 + synBonusPct)) / 100)
  return { lightningMin, lightningMax }
}

/**
 * 12. Fist of the Heavens (121) Radial Holy Bolt Damage
 * Base Holy Bolt from FoH (1.13c Missiles.txt #234 fistoftheheavensbolt):
 * EMin: 40, EMinLev: 6, 10, 16, 32, 48
 * EMax: 50, EMaxLev: 6, 10, 16, 32, 48
 * Synergy: Holy Bolt (+15%/blvl)
 */
export function calculateFistOfTheHeavensHolyBoltDamage(
  slvl: number,
  holyBoltBlvl: number = 0,
): { holyBoltMin: number; holyBoltMax: number } {
  const lvl = Math.max(1, slvl)
  const min = computeBand5(lvl, 40, 6, 10, 16, 32, 48)
  const max = computeBand5(lvl, 50, 6, 10, 16, 32, 48)

  const synBonusPct = holyBoltBlvl * 15
  const holyBoltMin = Math.trunc((min * (100 + synBonusPct)) / 100)
  const holyBoltMax = Math.trunc((max * (100 + synBonusPct)) / 100)
  return { holyBoltMin, holyBoltMax }
}

/** Helper 5-band scaling matching D2 1.13c Skills.txt (levels 1, 2..8, 9..16, 17..22, 23..28, 29+) */
function computeBand5(
  lvl: number,
  base: number,
  lev1: number,
  lev2: number,
  lev3: number,
  lev4: number,
  lev5: number,
): number {
  if (lvl <= 0) return 0
  let total = base
  if (lvl > 1) {
    const b1 = Math.min(lvl, 8) - 1
    total += b1 * lev1
  }
  if (lvl > 8) {
    const b2 = Math.min(lvl, 16) - 8
    total += b2 * lev2
  }
  if (lvl > 16) {
    const b3 = Math.min(lvl, 22) - 16
    total += b3 * lev3
  }
  if (lvl > 22) {
    const b4 = Math.min(lvl, 28) - 22
    total += b4 * lev4
  }
  if (lvl > 28) {
    const b5 = lvl - 28
    total += b5 * lev5
  }
  return total
}

/**
 * Compute `D2Common` diminishing-returns formula `dm(a, b, lvl)`:
 * `floor((110 * lvl * (b - a)) / (100 * (lvl + 6))) + a`
 */
function computeDiminishingReturns(a: number, b: number, lvl: number): number {
  if (lvl <= 0) return a
  const num = 110 * lvl * (b - a)
  const den = 100 * (lvl + 6)
  return Math.trunc(num / den) + a
}


// ============================================================================
// PALADIN OFFENSIVE & DEFENSIVE AURAS (20 SKILLS) — Re-exported from shared common module
// ============================================================================

export {
  PALADIN_OFFENSIVE_AURA_IDS,
  PALADIN_DEFENSIVE_AURA_IDS,
  PALADIN_AURA_STATE_BY_SKILL_ID,
  isPaladinAuraSkill,
  calculateMightStats,
  calculateHolyFireStats,
  calculateThornsStats,
  calculateBlessedAimStats,
  calculateConcentrationStats,
  calculateHolyFreezeStats,
  calculateHolyShockStats,
  calculateSanctuaryStats,
  calculateFanaticismStats,
  calculateConvictionStats,
  calculatePrayerStats,
  calculateResistFireStats,
  calculateDefianceStats,
  calculateResistColdStats,
  calculateCleansingStats,
  calculateResistLightningStats,
  calculateVigorStats,
  calculateMeditationStats,
  calculateRedemptionStats,
  calculateSalvationStats,
} from '../../common/skills/paladin-auras.ts'

export * from './assassin-traps.ts'





