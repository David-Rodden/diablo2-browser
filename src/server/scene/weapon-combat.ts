import { damageMonster, type Monster } from '../engine/combat.ts'
import type { GameEngine } from '../engine/engine.ts'
import { monsterDisplayName } from '../../common/units/monsters-data.ts'
import type { Projectile } from '../../common/skills/missiles-data.ts'
import { getTblLang } from '../../common/i18n/lang.ts'
import {
  PASSIVE_SKILL_IDS,
  isPassiveSkill,
  type AttackWeaponKind,
  type AttackWeaponSubtype,
  type AttackWeaponInfo,
  type AttackWeaponInputItem,
  getAttackWeaponInfo,
  checkAmmunition,
  type HudCombatStateLike,
  getSkillRange,
  getSkillMana,
  type SkillCastOutcome,
} from '../../common/skills/weapon-combat-meta.ts'
export {
  PASSIVE_SKILL_IDS,
  isPassiveSkill,
  type AttackWeaponKind,
  type AttackWeaponSubtype,
  type AttackWeaponInfo,
  type AttackWeaponInputItem,
  getAttackWeaponInfo,
  checkAmmunition,
  type HudCombatStateLike,
  getSkillRange,
  getSkillMana,
  type SkillCastOutcome,
} from '../../common/skills/weapon-combat-meta.ts'
import {
  calculateMightStats,
  calculateHolyFireStats,
  calculateConcentrationStats,
  calculateHolyFreezeStats,
  calculateHolyShockStats,
  calculateSanctuaryStats,
  calculateFanaticismStats,
} from '../../common/skills/paladin-auras.ts'
import {
  evaluateBarbarianMastery,
  isWeaponMatchingMastery,
  type WeaponMasteryStats,
} from '../skills/barbarian-masteries.ts'
import { resolveWeaponBase113c } from '../../common/units/char-anim-speed.ts'

function resolveLearnedSkillLevelFromHudOrPlayer(
  skillId: number,
  engine: GameEngine,
  hudLike?: HudCombatStateLike | null | undefined,
): number {
  const player = engine.world?.player as any
  const baseSkillLevels = (hudLike as any)?.baseSkillLevels ?? player?.baseSkillLevels
  if (baseSkillLevels && typeof baseSkillLevels === 'object' && skillId in baseSkillLevels) {
    if (Number(baseSkillLevels[skillId]) <= 0) return 0
  }
  if (typeof (hudLike as any)?.getBaseSkillLevel === 'function') {
    if (Number((hudLike as any).getBaseSkillLevel(skillId)) <= 0) return 0
  }
  const fromHudFn =
    typeof (hudLike as any)?.getSkillLevel === 'function'
      ? Number((hudLike as any).getSkillLevel(skillId))
      : 0
  if (Number.isFinite(fromHudFn) && fromHudFn > 0) return Math.floor(fromHudFn)
  const skillLevels = (hudLike as any)?.skillLevels ?? player?.skillLevels ?? {}
  const fromMap =
    typeof player?.skills?.get === 'function'
      ? Number(player.skills.get(skillId))
      : Number(skillLevels[skillId] ?? player?.skills?.[skillId] ?? 0)
  return Number.isFinite(fromMap) && fromMap > 0 ? Math.floor(fromMap) : 0
}

function resolveBarbarianMeleeMasteryCombat(
  weapon: AttackWeaponInputItem | null | undefined,
  weaponInfo: AttackWeaponInfo,
  engine: GameEngine,
  hudLike?: HudCombatStateLike | null | undefined,
): { readonly edPct: number; readonly arPct: number; readonly critPct: number; readonly critMult: 1 | 2 } {
  if (!weapon || weaponInfo.kind !== 'melee' || weaponInfo.isRanged) {
    return { edPct: 0, arPct: 0, critPct: 0, critMult: 1 }
  }
  const code = String(weapon.code ?? '').trim().toLowerCase()
  const wb = code ? resolveWeaponBase113c(code) : undefined
  const typeTokens = [
    wb?.type,
    weapon.type,
    weaponInfo.subtype,
    weapon.name,
  ]
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    .map(t => t.trim().toLowerCase())

  const meleeMasteryIds = [127, 128, 129, 134, 136] as const
  for (const mId of meleeMasteryIds) {
    const slvl = resolveLearnedSkillLevelFromHudOrPlayer(mId, engine, hudLike)
    if (slvl <= 0) continue
    if (typeTokens.some(tok => isWeaponMatchingMastery(tok, mId))) {
      const stats = evaluateBarbarianMastery(mId, slvl) as WeaponMasteryStats
      const player = engine.world?.player as any
      const csProc =
        Boolean(player?.criticalStrikeProc) ||
        (typeof player?.criticalStrikeRoll === 'number' &&
          player.criticalStrikeRoll < stats.criticalStrikeChancePct)
      const dsPct = Number(player?.deadlyStrikePct ?? 0)
      const dsProc =
        !csProc &&
        (Boolean(player?.deadlyStrikeProc) ||
          (typeof player?.deadlyStrikeRoll === 'number' && player.deadlyStrikeRoll < dsPct))
      return {
        edPct: stats.damageBonusPct,
        arPct: stats.attackRatingBonusPct,
        critPct: stats.criticalStrikeChancePct,
        critMult: csProc || dsProc ? 2 : 1,
      }
    }
  }
  return { edPct: 0, arPct: 0, critPct: 0, critMult: 1 }
}

function resolveActiveAuraWeaponCombat(
  baseMin: number,
  baseMax: number,
  engine: GameEngine,
  hudLike?: HudCombatStateLike | null | undefined,
  targetMonster?: Monster | null | undefined,
  extraEdPct = 0,
  critMult: 1 | 2 = 1,
): { readonly damage: number; readonly iasPct: number } {
  const rawAuraId =
    engine.activeAuraSkillId ??
    ((hudLike as any)?.rightSkill && [98, 102, 113, 114, 118, 119, 122].includes((hudLike as any).rightSkill)
      ? Number((hudLike as any).rightSkill)
      : null)
  if (!rawAuraId && extraEdPct === 0 && critMult === 1) {
    return { damage: Math.round((baseMin + baseMax) / 2), iasPct: 0 }
  }
  const skillLevels =
    (hudLike as any)?.skillLevels ??
    (engine.world?.player as any)?.skillLevels ??
    {}
  const slvl = rawAuraId
    ? Math.max(
        1,
        engine.activeAuraSkillId === rawAuraId && engine.activeAuraLevel > 0
          ? engine.activeAuraLevel
          : Number(skillLevels[rawAuraId] ?? 1),
      )
    : 0
  const resistFire = Math.max(0, Number(skillLevels[100] ?? 0))
  const resistCold = Math.max(0, Number(skillLevels[105] ?? 0))
  const resistLightning = Math.max(0, Number(skillLevels[110] ?? 0))
  const salvation = Math.max(0, Number(skillLevels[125] ?? 0))

  let edPct = extraEdPct
  let elemAvg = 0
  let iasPct = 0

  if (rawAuraId === 98) {
    edPct += calculateMightStats(slvl).damagePercent
  } else if (rawAuraId === 113) {
    edPct += calculateConcentrationStats(slvl).damagePercent
  } else if (rawAuraId === 122) {
    const fanat = calculateFanaticismStats(slvl)
    edPct += fanat.casterDamagePercent
    iasPct = fanat.casterIas
  } else if (rawAuraId === 119) {
    const isUndead = Boolean((targetMonster as any)?.isUndead || targetMonster?.stats?.isUndead)
    if (isUndead) {
      edPct += calculateSanctuaryStats(slvl).undeadDamagePercent
    }
  } else if (rawAuraId === 102) {
    const hf = calculateHolyFireStats(slvl, { resistFire, salvation })
    elemAvg = (hf.weaponFireMin + hf.weaponFireMax) / 2
  } else if (rawAuraId === 114) {
    const hfr = calculateHolyFreezeStats(slvl, { resistCold, salvation })
    elemAvg = (hfr.weaponColdMin + hfr.weaponColdMax) / 2
  } else if (rawAuraId === 118) {
    const hs = calculateHolyShockStats(slvl, { resistLightning, salvation })
    elemAvg = (hs.weaponLightningMin + hs.weaponLightningMax) / 2
  }

  if (edPct === 0 && elemAvg === 0 && critMult === 1) {
    return { damage: Math.round((baseMin + baseMax) / 2), iasPct }
  }
  const physMin = Math.floor((baseMin * (100 + edPct)) / 100) * critMult
  const physMax = Math.floor((baseMax * (100 + edPct)) / 100) * critMult
  return {
    damage: Math.max(1, Math.round((physMin + physMax) / 2 + elemAvg)),
    iasPct,
  }
}

/**
 * Pure simulation helper for normal weapon/unarmed attack (`skillId === 0`).
 */
export function executeNormalAttack(
  targetX: number,
  targetY: number,
  context: {
    readonly engine: GameEngine
    readonly hudLike?: HudCombatStateLike | null | undefined
    readonly equippedWeapon?: AttackWeaponInputItem | null | undefined
    readonly equippedAmmo?: any | null | undefined
    readonly hasAmmo?: boolean | undefined
  },
): SkillCastOutcome {
  const { engine, hudLike } = context
  const player = engine.world.player
  const isEn = (hudLike?.lang ?? getTblLang()) === 'ENG'
  const globalHud = (globalThis as Record<string, any>).__d2webHudInstance as HudCombatStateLike | null | undefined

  const rawW1 = hudLike?.inventory?.equipped?.weapon1 ?? globalHud?.inventory?.equipped?.weapon1 ?? null
  const rawW2 = hudLike?.inventory?.equipped?.weapon2 ?? globalHud?.inventory?.equipped?.weapon2 ?? null
  const w1Info = getAttackWeaponInfo(rawW1)
  const w2Info = getAttackWeaponInfo(rawW2)
  const swappedRanged = context.equippedWeapon === undefined && !w1Info.isRanged && w2Info.isRanged
  const weapon = context.equippedWeapon ?? (swappedRanged ? rawW2 : rawW1)
  const weaponInfo =
    context.equippedWeapon !== undefined ? getAttackWeaponInfo(weapon) : swappedRanged ? w2Info : w1Info

  if (weaponInfo.isRanged) {
    const ammo = context.equippedAmmo ?? (swappedRanged ? rawW1 : rawW2)
    const hasAmmo = context.hasAmmo ?? checkAmmunition(weaponInfo.ammoType!, ammo, hudLike?.inventory)
    if (!hasAmmo) {
      return {
        casted: false,
        animMode: 'a1',
        statusMessage: isEn
          ? (weaponInfo.ammoType === 'arrow' ? 'Out of arrows!' : 'Out of bolts!')
          : (weaponInfo.ammoType === 'arrow' ? '缺少箭矢！' : '缺少十字弓弹！'),
      }
    }

    const auraMod = resolveActiveAuraWeaponCombat(weaponInfo.damageMin, weaponInfo.damageMax, engine, hudLike)
    player.cooldown = auraMod.iasPct > 0 ? Math.max(1, Math.round((weaponInfo.cooldown * 100) / (100 + auraMod.iasPct))) : weaponInfo.cooldown
    player.swingTicks = auraMod.iasPct > 0 ? Math.max(1, Math.round((weaponInfo.swingTicks * 100) / (100 + auraMod.iasPct))) : weaponInfo.swingTicks

    const dx = targetX - player.x
    const dy = targetY - player.y
    const len = Math.hypot(dx, dy)
    const speed = 500
    const range = weaponInfo.reach
    const perTick = speed / 25
    const ttl = Math.max(1, Math.round(range / perTick))

    const damage = auraMod.damage

    const projectile: Projectile = {
      skillId: '0',
      x: player.x,
      y: player.y,
      vx: len > 0 ? (dx / len) * perTick : perTick,
      vy: len > 0 ? (dy / len) * perTick : 0,
      damage,
      ttl,
      fromPlayer: true,
    }

    engine.projectiles.push(projectile)
    engine.metrics.casts += 1
    return {
      casted: true,
      animMode: 'a1',
      statusMessage: isEn
        ? (weaponInfo.subtype === 'bow' ? 'Attack: Shoot Arrow' : 'Attack: Shoot Bolt')
        : (weaponInfo.subtype === 'bow' ? '普通攻击：发射箭矢' : '普通攻击：发射弩箭'),
    }
  }

  // Unarmed or Melee Attack
  let targetMonster: Monster | null = null
  let bestTargetDist = 36
  for (const monster of engine.world.monsters) {
    if (monster.state === 'dead' || monster.hp <= 0) continue
    const distToPlayer = Math.hypot(monster.x - player.x, monster.y - player.y)
    if (distToPlayer <= weaponInfo.reach) {
      const distFeet = Math.hypot(monster.x - targetX, monster.y - targetY)
      const distBody = Math.hypot(monster.x - targetX, (monster.y - 16) - targetY)
      const minD = Math.min(distFeet, distBody)
      if (minD <= bestTargetDist) {
        bestTargetDist = minD
        targetMonster = monster
      }
    }
  }
  if (targetMonster === null) {
    let bestDist = weaponInfo.reach
    for (const monster of engine.world.monsters) {
      if (monster.state === 'dead' || monster.hp <= 0) continue
      const dist = Math.hypot(monster.x - player.x, monster.y - player.y)
      if (dist <= bestDist) {
        bestDist = dist
        targetMonster = monster
      }
    }
  }

  const masteryMod = resolveBarbarianMeleeMasteryCombat(weapon, weaponInfo, engine, hudLike)
  const auraMod = resolveActiveAuraWeaponCombat(
    weaponInfo.damageMin,
    weaponInfo.damageMax,
    engine,
    hudLike,
    targetMonster,
    masteryMod.edPct,
    masteryMod.critMult,
  )
  player.cooldown = auraMod.iasPct > 0 ? Math.max(1, Math.round((weaponInfo.cooldown * 100) / (100 + auraMod.iasPct))) : weaponInfo.cooldown
  player.swingTicks = auraMod.iasPct > 0 ? Math.max(1, Math.round((weaponInfo.swingTicks * 100) / (100 + auraMod.iasPct))) : weaponInfo.swingTicks

  const damage = auraMod.damage
  let statusMessage: string | null = null
  if (targetMonster !== null) {
    damageMonster(engine.world, targetMonster.index, damage)
    engine.metrics.playerHits += 1
    if (isEn) {
      const attackLabel = weaponInfo.kind === 'unarmed' ? 'Unarmed Attack' : 'Attack'
      statusMessage = `${attackLabel} hit: ${monsterDisplayName(targetMonster.stats, 'ENG')}`
    } else {
      const attackLabel = weaponInfo.kind === 'unarmed' ? '普通攻击（空手拳击）' : '普通攻击'
      statusMessage = `${attackLabel}命中：${targetMonster.stats.name || targetMonster.stats.id}`
    }
  } else {
    engine.world.events.push({ kind: 'playerHit', x: player.x, y: player.y, amount: 0, text: 'whiff' })
  }
  return {
    casted: true,
    animMode: 'a1',
    statusMessage,
  }
}

