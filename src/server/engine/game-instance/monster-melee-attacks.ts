/**
 * GameInstance Subsystem: Monster Melee Attacks, Corpse Resurrection, Player Defense & Hit Resolution (`src/server/engine/game-instance/monster-melee-attacks.ts`).
 */

import { getEmbeddedDropTables } from '../../../common/items/embedded-drop-tables.ts'
import { resolveArmorBlock113c, resolveWeaponBase113c } from '../../../common/units/char-anim-speed.ts'
import type { DeathKillerKind113c } from '../../../common/progression/experience-113c.ts'
import { MONSTATS_113C_ROWS } from '../../../common/units/monstats-113c-data.ts'
import { monaiParam113c, normalizeMonAiName113c } from '../../../common/units/monai-113c.ts'
import { MON_UMOD } from '../../../common/units/monster-death-fx.ts'
import { CURSED_PROC_CHANCE_PCT_113C, computeCursedAmplifyDamage113c, computeManaBurnDrainFixed113c, isPhysicalOrWeaponMonsterHit113c, rollEnchantedAttackBonus113c } from '../../ai/monumod-113c.ts'
import { scaleMonStatsPoisonRider113c } from '../../ai/monster-missile-damage-113c.ts'
import { computeEquippedArmorPieceDefense113c, computeWornSetSiblingMasks113c } from '../../items/server-item-data.ts'
import type { SummonedPetUnit } from '../../ai/summon-manager.ts'
import { executeSUnitDmg, getPrePierceResistance113c, rollItemKnockback113c, type CombatUnitContext } from '../combat-pipeline.ts'
import { FIXED_ONE, UnitStatList } from '../stat-list.ts'
import { StateBus } from '../state-bus.ts'
import { computeDiminishingReturns } from '../../../common/data/calc-ast.ts'
import { difficultyMonsterColdDivisor, difficultyMonsterFreezeDivisor, difficultyResistPenalty } from '../difficulty-resist-penalty.ts'
import type { GameInstanceHost } from './host.ts'
import type { InternalMonsterRecord, InternalPlayerRecord, MissileDamageChannel } from './types.ts'
import { monsterProfile113c, normalizeMissileElement, playerWirePosition, resolveArmorCombatMeta113c } from './constants-and-helpers.ts'


/** Pick the 1.13c melee mode (A1/A2/S1) and schedule damage on its action frame. */
function beginMonsterMeleeAttack(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  player: InternalPlayerRecord,
): void {
  const hasA2 = monster.hasAttack2 && monster.attack2MaxDmg > 0
  const hasS1 = monster.hasSpecial1 && monster.special1MaxDmg > 0
  const rawA2Chance = monster.aiParams[1] ?? 0
  const a2Chance = hasA2
    ? Math.max(0, Math.min(100, Math.floor(rawA2Chance > 0 ? rawA2Chance : 35)))
    : 0
  const s1Chance = hasS1 ? (!hasA2 && monster.maxDmg <= 0 ? 100 : 25) : 0
  const roll = this.rng.rand(100)
  const skillMode: 'A1' | 'A2' | 'S1' =
    roll < s1Chance ? 'S1' : roll < s1Chance + a2Chance ? 'A2' : 'A1'
  // ThornHulk row 27: `aip6` is the number of consecutive A2 swings needed
  // before the `aip4` frenzy chance; `aip5` is the frenzy speed bonus.
  const profile = monsterProfile113c(monster.ai)
  const frenzy = profile.frenzy
  if (frenzy !== undefined) {
    if (skillMode === 'A2') {
      monster.consecutiveA2 += 1
      const required = Math.max(
        1,
        Math.floor(
          monaiParam113c(profile, monster.aiParams, frenzy.consecutiveParam, 3),
        ),
      )
      if (monster.consecutiveA2 >= required) {
        monster.consecutiveA2 = 0
        const chance = Math.max(
          0,
          Math.min(
            100,
            monaiParam113c(profile, monster.aiParams, frenzy.thresholdParam, 0),
          ),
        )
        if (chance > 0 && this.rng.rand(100) < chance) {
          monster.frenzyUntilFrame = this.currentFrame + 100
          monster.frenzySpeedPct = Math.max(
            0,
            monaiParam113c(profile, monster.aiParams, frenzy.speedParam, 0),
          )
        }
      }
    } else {
      monster.consecutiveA2 = 0
    }
  }
  const mode = skillMode === 'A1' ? 4 : skillMode === 'A2' ? 5 : 8
  const minDmg =
    skillMode === 'S1'
      ? monster.special1MinDmg
      : skillMode === 'A2'
        ? monster.attack2MinDmg
        : monster.minDmg
  const maxDmg =
    skillMode === 'S1'
      ? monster.special1MaxDmg
      : skillMode === 'A2'
        ? monster.attack2MaxDmg
        : monster.maxDmg
  monster.mode = mode
  this.broadcastToArea(monster.areaId, {
    type: 'UnitMode',
    unitType: 1,
    id: monster.unitId,
    mode,
    at: { x: Math.round(player.x), y: Math.round(player.y) },
    lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
  })
  const timing = this.monsterAttackTiming(monster, skillMode)
  monster.cooldown = Math.max(monster.cooldownTicks, timing.totalFrames)
  monster.pendingAttack = {
    playerId: player.unitId,
    frame: this.currentFrame + timing.actionFrame,
    mode,
    skillMode,
    minDmg,
    maxDmg,
  }
}



/** AnimData `{code}A1/A2/S1HTH` action frame and full animation duration. */
function monsterAttackTiming(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  mode: 'A1' | 'A2' | 'S1',
): { readonly actionFrame: number; readonly totalFrames: number } {
  const attackRatePct = Math.max(
    15,
    100 -
      this.monsterSlowPercent(monster) +
      (this.currentFrame < monster.frenzyUntilFrame ? monster.frenzySpeedPct : 0) +
      (monster.umodIds.includes(37) ? 30 : 0) +
      (monster.states.has(49) ? 30 : 0) +
      (monster.states.has(140) ? 50 : 0) +
      monster.monProps.iasPct +
      (monster.monEquipLoadout?.iasPct ?? 0),
  )
  const code = MONSTATS_113C_ROWS[monster.hcIdx]?.code?.trim().toUpperCase()
  if (code !== undefined && code !== '') {
    const record = this.registry.getAnimDataRecord(`${code}${mode}HTH`)
    if (record !== undefined && record.framesPerDirection > 0 && record.hasSpeed) {
      const speed = Math.max(1, Math.floor((record.animationSpeed * attackRatePct) / 100))
      const event = record.events.find((entry) => entry.code !== 0)
      const actionIdx = event !== undefined ? event.frame + 1 : record.framesPerDirection
      return {
        actionFrame: Math.max(1, Math.floor((actionIdx * 256) / speed)),
        totalFrames: Math.max(1, Math.floor((record.framesPerDirection * 256) / speed)),
      }
    }
  }
  const baseAction = mode === 'A1' ? 4 : 5
  const baseTotal = mode === 'A1' ? 8 : 10
  return {
    actionFrame: Math.max(1, Math.floor((baseAction * 100) / attackRatePct)),
    totalFrames: Math.max(1, Math.floor((baseTotal * 100) / attackRatePct)),
  }
}



function stepPendingResurrection(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  const pending = monster.pendingResurrection
  if (pending === undefined || this.currentFrame < pending.frame) return
  if (
    monster.dead ||
    monster.frozenTicks > 0 ||
    monster.states.has(1) ||
    monster.states.has(29) ||
    monster.states.has(21) ||
    monster.states.has(25) ||
    this.currentFrame < monster.hitRecoveryUntilFrame
  ) {
    monster.pendingResurrection = undefined
    return
  }
  monster.pendingResurrection = undefined
  const corpse = this.monsters.get(pending.corpseUnitId)
  if (
    corpse === undefined ||
    !corpse.dead ||
    corpse.shattered ||
    corpse.corpseConsumed ||
    corpse.states.has(104) ||
    corpse.areaId !== monster.areaId
  ) {
    return
  }
  this.reviveMonsterCorpse(monster, corpse)
}



/** Apply the 1.13c Resurrect action frame: full life, cleared death states. */
function reviveMonsterCorpse(this: GameInstanceHost, 
  caster: InternalMonsterRecord,
  corpse: InternalMonsterRecord,
): void {
  if (corpse.pendingDropItems !== undefined) {
    const pendingItems = corpse.pendingDropItems
    corpse.pendingDropItems = undefined
    this.spawnDroppedItems(pendingItems, corpse.areaId, corpse.x, corpse.y)
  }
  corpse.dead = false
  corpse.hp = corpse.maxHp
  corpse.mode = 1
  corpse.revivedByShaman = true
  corpse.experience = 0
  corpse.baseXp = 0
  corpse.alreadyGrantedKillRewards = true
  for (const stateId of corpse.states) {
    this.broadcastToArea(caster.areaId, {
      type: 'UnitState',
      unitType: 'monster',
      unitId: corpse.unitId,
      state: stateId,
      active: false,
      areaId: caster.areaId,
    })
    this.broadcastToArea(caster.areaId, {
      type: 'StateEnd',
      unit: { unitType: 1, id: corpse.unitId },
      state: stateId,
    })
  }
  corpse.states.clear()
  corpse.stateTimers.clear()
  corpse.path = []
  corpse.pathIndex = 0
  corpse.pathTargetX = Number.NaN
  corpse.pathTargetY = Number.NaN
  this.broadcastToArea(caster.areaId, {
    type: 'UnitStatUpdate',
    unitType: 'monster',
    unitId: corpse.unitId,
    statId: 6,
    value: corpse.hp,
  })
  if (corpse.areaId === 8) {
    this.syncDenOfEvilProgress113c(undefined)
  }
  this.broadcastToArea(caster.areaId, {
    type: 'UnitMode',
    unitType: 1,
    id: corpse.unitId,
    mode: 1,
    lifePct: 128,
  })
}



function stepPendingMonsterAttack(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  const pending = monster.pendingAttack
  if (!pending || this.currentFrame < pending.frame) return
  if (
    monster.dead ||
    monster.frozenTicks > 0 ||
    monster.states.has(1) ||
    monster.states.has(29) ||
    monster.states.has(21) ||
    monster.states.has(25) ||
    this.currentFrame < monster.hitRecoveryUntilFrame
  ) {
    monster.pendingAttack = undefined
    return
  }
  monster.pendingAttack = undefined
  const player = this.players.get(pending.playerId)
  if (!player || player.dead || !this.isAreaSeamAdjacent(monster.areaId, player.areaId)) return
  const maxMeleeReach = Math.max(3.5, monster.meleeRange + 1.5)
  if (Math.hypot(player.x - monster.x, player.y - monster.y) > maxMeleeReach) return
  this.resolveMonsterAttackOnPlayer(monster, player, pending)
}



/** MonStats `El1..3` elemental rider attached to the chosen melee mode. */
function rollMonsterElementalRider(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  mode: 'A1' | 'A2' | 'S1',
): { readonly element: MissileDamageChannel; readonly damage: number; readonly durationFrames: number } | undefined {
  for (const el of monster.elementalAttacks) {
    if (el.mode !== mode) continue
    const chance = Math.max(0, Math.min(100, el.chancePct ?? 100))
    if (this.rng.rand(100) >= chance) continue
    const element = normalizeMissileElement(el.type)
    if (element === undefined || element === 'phys') continue
    const min = Math.max(0, el.minDamage ?? el.min ?? 0)
    const max = Math.max(min, el.maxDamage ?? el.max ?? min)
    if (element === 'pois') {
      const pois = scaleMonStatsPoisonRider113c(min, max, el.durationFrames ?? 25)
      return {
        element,
        damage: this.rollInclusive(pois.minCumulHp, pois.maxCumulHp),
        durationFrames: pois.durationFrames,
      }
    }
    return {
      element,
      damage: this.rollInclusive(min, max),
      durationFrames: Math.max(0, el.durationFrames ?? 0),
    }
  }
  return undefined
}



/** Schedule a melee swing against a mercenary / summon on the AnimData action frame. */
function beginMonsterMeleeAttackOnAlly(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  target: { readonly kind: 'merc' | 'pet'; readonly id: number | string },
): void {
  const timing = this.monsterAttackTiming(monster, 'A1')
  monster.cooldown = Math.max(monster.cooldownTicks, timing.totalFrames)
  monster.pendingAllyAttack = {
    targetKind: target.kind,
    targetId: target.id,
    frame: this.currentFrame + timing.actionFrame,
    mode: 4,
    skillMode: 'A1',
    minDmg: monster.minDmg,
    maxDmg: monster.maxDmg,
  }
}



function stepPendingAllyAttack(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  const pending = monster.pendingAllyAttack
  if (!pending || this.currentFrame < pending.frame) return
  if (
    monster.dead ||
    monster.frozenTicks > 0 ||
    monster.states.has(1) ||
    monster.states.has(29) ||
    monster.states.has(21) ||
    monster.states.has(25) ||
    this.currentFrame < monster.hitRecoveryUntilFrame
  ) {
    monster.pendingAllyAttack = undefined
    return
  }
  monster.pendingAllyAttack = undefined
  const rider = this.rollMonsterElementalRider(monster, pending.skillMode)
  const swing = {
    skillId: 0,
    physDamage: this.rollInclusive(pending.minDmg, pending.maxDmg),
    elemDamage: rider?.damage ?? 0,
    element: rider?.element ?? ('phys' as MissileDamageChannel),
    elemDurationFrames: rider?.durationFrames ?? 0,
  }
  if (pending.targetKind === 'merc') {
    const merc = this.mercenaries.get(pending.targetId as number)
    if (!merc || !merc.alive || !this.isAreaSeamAdjacent(monster.areaId, merc.areaId)) return
    const mercOwner = this.players.get(merc.ownerPlayerId)
    if (mercOwner !== undefined && (mercOwner.dead || !this.isAreaSeamAdjacent(monster.areaId, mercOwner.areaId))) return
    const maxAllyReach = Math.max(3.5, monster.meleeRange + 1.5)
    if (Math.hypot(merc.x - monster.x, merc.y - monster.y) > maxAllyReach) return
    const prevHp = merc.hp
    const nextHp = this.applyMonsterMissileToDefender(
      monster,
      swing,
      {
        id: `merc_${merc.unitId}`,
        name: merc.name,
        unitType: 'mercenary',
        level: merc.level,
        hp: merc.hp,
        maxHp: merc.maxHp,
        defense: merc.defense,
        resist: merc.resist,
        equipment: merc.equipment,
      },
      'melee',
    )
    if (nextHp < prevHp) {
      this.applyDamageToMerc(merc, prevHp - nextHp, merc.areaId)
    }
    return
  }
  let pet: SummonedPetUnit | undefined
  for (const [ownerId, mgr] of this.summonManagers) {
    const owner = this.players.get(ownerId)
    if (owner === undefined || owner.dead || !this.isAreaSeamAdjacent(monster.areaId, owner.areaId)) continue
    for (const candidate of mgr.getActivePets()) {
      const mappedId =
        this.petUnitIds.get(candidate.uid) ??
        (candidate as unknown as { unitId?: number }).unitId
      if (
        candidate.uid === String(pending.targetId) ||
        mappedId === pending.targetId ||
        Number(candidate.uid) === pending.targetId
      ) {
        pet = candidate
        break
      }
    }
    if (pet !== undefined) break
  }
  if (pet === undefined || pet.alive === false || pet.hp <= 0) return
  const maxPetReach = Math.max(3.5, monster.meleeRange + 1.5)
  if (Math.hypot(pet.x - monster.x, pet.y - monster.y) > maxPetReach) return
  const prevHp = pet.hp
  const nextHp = this.applyMonsterMissileToDefender(
    monster,
    swing,
    {
      id: pet.uid,
      name: pet.name,
      unitType: 'minion',
      level: pet.statList.getAccruedStat('level'),
      hp: pet.hp,
      maxHp: pet.maxHp,
      stats: pet.statList,
      stateBus: pet.stateBus,
      x: pet.x,
      y: pet.y,
    },
    'melee',
  )
  if (nextHp < prevHp) {
    pet.hp = prevHp
    this.applyDamageToSummon(pet, prevHp - nextHp, monster.areaId)
  }
}



function buildMonsterAttackerContext(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  skillMode: 'A1' | 'A2' | 'S1' = 'A1',
): CombatUnitContext {
  const attackerStats = new UnitStatList(this.registry, undefined, { ownerType: 'monster' })
  attackerStats.setBaseStat('level', monster.level)
  const modeToHit =
    skillMode === 'S1'
      ? monster.special1Ar
      : skillMode === 'A2'
        ? monster.attack2Ar
        : monster.ar
  attackerStats.setBaseStat('tohit', modeToHit)
  attackerStats.setBaseStat('armorclass', monster.ac)
  attackerStats.setBaseStat('maxhp', monster.maxHp * FIXED_ONE)
  attackerStats.setHp256(monster.hp * FIXED_ONE)
  attackerStats.setBaseStat('damageresist', monster.resistances.phys)
  attackerStats.setBaseStat('magicresist', monster.resistances.magic)
  attackerStats.setBaseStat('fireresist', monster.resistances.fire)
  attackerStats.setBaseStat('lightresist', monster.resistances.light)
  attackerStats.setBaseStat('coldresist', monster.resistances.cold)
  attackerStats.setBaseStat('poisonresist', monster.resistances.poison)
  const cbPct = monster.monProps.crushingBlowPct + (monster.monEquipLoadout?.crushingBlowPct ?? 0)
  if (cbPct > 0) attackerStats.setBaseStat('item_crushingblow', cbPct)
  const dsPct = monster.monEquipLoadout?.deadlyStrikePct ?? 0
  if (dsPct > 0) attackerStats.setBaseStat('item_deadlystrike', dsPct)
  const owPct = monster.monEquipLoadout?.openWoundsPct ?? 0
  if (owPct > 0) attackerStats.setBaseStat('item_openwounds', owPct)
  if (monster.monProps.extraFirePct > 0) {
    attackerStats.setBaseStat('passive_fire_mastery', monster.monProps.extraFirePct)
  }
  const attackerStateBus = new StateBus(attackerStats, this.registry)
  this.mirrorPersistentStates(this.monsterCombat.get(monster.unitId), attackerStateBus)
  return {
    id: `monster_${monster.unitId}`,
    name: monster.name,
    unitType: 'monster',
    statList: attackerStats,
    stateBus: attackerStateBus,
    x: monster.x,
    y: monster.y,
    isUndead: monster.isUndead,
    isDemon: monster.isDemon,
    isBoss: monster.isBoss,
    isPrimeEvil: monster.isPrimeEvil,
    weaponMinPhys: 0,
    weaponMaxPhys: 0,
  }
}



function computePlayerBaseDefense(this: GameInstanceHost, player: InternalPlayerRecord): number {
  // 1.13c `UNITS_GetDefense` (`0x6FD82890`, #1863): `floor(totalDex / 4)` includes base + gear +
  // active 10x4 charms + buff/modifier dexterity.
  const buffDex = this.playerCombat.get(player.unitId)?.statList.getModifierBonus('dexterity') ?? 0
  const totalDex = Math.max(0, player.dexterity + this.sumPlayerItemStat(player, 2) + buffDex)
  let defense = Math.floor(totalDex / 4)
  const worn = player.items.filter(
    (it) => it.location === 'equipped' && it.bodyLoc !== 11 && it.bodyLoc !== 12,
  )
  const hasSetGear = worn.some(
    (it) =>
      it.quality === 5 ||
      (it.rawItemData?.setItemId !== undefined &&
        it.rawItemData.setItemId >= 0 &&
        it.rawItemData.setItemId !== 0xfff),
  )
  const tables = hasSetGear ? getEmbeddedDropTables() : undefined
  const counts = hasSetGear ? this.wornSetPieceCounts(worn) : undefined
  const siblingMasks =
    hasSetGear && tables ? computeWornSetSiblingMasks113c(worn, tables.sets.items) : undefined
  for (const item of worn) {
    if (item.identified === false || item.rawItemData?.identified === false) {
      if (item.rawItemData?.defense !== undefined) {
        defense += item.rawItemData.defense
      } else {
        const meta = resolveArmorCombatMeta113c(item.code)
        if (meta !== undefined && meta.minAc > 0) {
          defense += item.ethereal ? Math.floor((meta.minAc * 3) / 2) : meta.minAc
        }
      }
      continue
    }
    if (item.rawItemData?.broken === true) continue
    const setId = item.rawItemData?.setItemId
    const setItem =
      tables && setId !== undefined && setId >= 0 && setId !== 0xfff
        ? tables.sets.items.getById(setId)
        : undefined
    defense += computeEquippedArmorPieceDefense113c(
      item,
      resolveArmorCombatMeta113c(item.code),
      setItem && tables
        ? {
            wornCount: counts?.get(setItem.set) ?? 1,
            siblingMask: siblingMasks?.get(setItem.set) ?? 0,
            setItemsTable: tables.sets.items,
          }
        : undefined,
    )
  }
  defense += this.sumPlayerItemStat(player, 31)
  return defense
}



/**
 * 1.13c player armor class (`D2Common_10672` / `UNITS_GetDefense` @ `0x6FD82890`, #1634 / #1800):
 * - Includes `214 item_armor_perlevel` (`/ 8`), `215 item_armorpercent_perlevel` (`/ 8`),
 *   `16 item_armor_percent` (off-armor/set/aura), `171 skill_armor_percent` (Shout / Defiance / Iron Skin / Chilling Armor / Conviction),
 *   Holy Shield (`state 101`, `Skills.txt` #117 `calc1 = 25 + 15*(slvl-1) + 15*blvl('Defiance')`), `182 armor_override_percent`, and Armor Shrine (`state 128`).
 */
function computePlayerDefense(this: GameInstanceHost, player: InternalPlayerRecord): number {
  let defense = this.computePlayerBaseDefense(player)
  const combat = this.playerCombatContext(player)
  const overridePct = combat.statList.getAccruedStat('armor_override_percent')
  if (overridePct <= -100) {
    return 0
  }
  if (overridePct !== 0) {
    defense += Math.trunc((defense * overridePct) / 100)
  }
  const hasEquippedGear = player.items.some(
    (i) => i.location === 'equipped' && i.bodyLoc !== 11 && i.bodyLoc !== 12,
  )
  const canApplyHolyShield = !hasEquippedGear || this.hasPlayerEquippedShield(player)
  const hsMod = canApplyHolyShield
    ? combat.statList
        .getActiveModifiers()
        .find((m) => m.stateId === 101 || m.stateName === 'holyshield')
    : undefined
  let hsPct = 0
  if (hsMod !== undefined || (canApplyHolyShield && player.states.has(101))) {
    const hsLvl = Math.max(
      1,
      hsMod?.stats['modifierlist_level'] ?? hsMod?.slvl ?? this.resolvePlayerSkillLevelById(player, 117),
    )
    const defianceBlvl = Math.max(
      0,
      player.skills.get(104) ?? combat.statList.getBaseSkillLevel(104),
    )
    hsPct = Math.max(
      0,
      25 + 15 * (hsLvl - 1) + 15 * defianceBlvl - (hsMod?.stats['skill_armor_percent'] ?? 0),
    )
  }
  const defensePct =
    combat.statList.getModifierBonus('skill_armor_percent') +
    combat.statList.getModifierBonus('item_armor_percent') +
    this.sumPlayerItemStat(player, 215) +
    hsPct +
    (player.states.has(128) && !combat.stateBus.hasState(128) ? 100 : 0)
  if (defensePct !== 0) {
    defense = Math.max(0, defense + Math.trunc((defense * defensePct) / 100))
  }
  return Math.max(0, defense)
}



function resolveMonsterAttackOnPlayer(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  player: InternalPlayerRecord,
  swing?: {
    readonly minDmg: number
    readonly maxDmg: number
    readonly skillMode: 'A1' | 'A2' | 'S1'
    /** Missile hits use the projectile block/dodge path; melee uses the melee path. */
    readonly attackKind?: 'melee' | 'missile' | undefined
    readonly skillId?: number | undefined
    readonly missileId?: number | undefined
    /** Skill `%AR` bonus (`Skills.txt` `ToHit` / `ToHitCalc`, e.g. Charge `+50%+15%/lvl`, Jab `+10%+9%/lvl`). */
    readonly arBonusPct?: number | undefined
    /** Explicit projectile element (Missiles.txt EType) instead of a MonStats El1..3 rider. */
    readonly elementType?: MissileDamageChannel | undefined
    readonly elemMin?: number | undefined
    readonly elemMax?: number | undefined
    readonly elemDurationFrames?: number | undefined
    /** Projectile hits must not re-roll the monster's melee El1..3 rider. */
    readonly fromMissile?: boolean | undefined
    /** Death-effect novae or `ResultFlags & 1` skills bypass `RollToHit` vs Defense. */
    readonly autoHit?: boolean | undefined
    /** Explicit block override (e.g. `false` on `#198 DiabRun` / `#301 Stomp` so Shield Block still rolls). */
    readonly unblockable?: boolean | undefined
  },
): boolean {
  const attackerCtx = this.buildMonsterAttackerContext(monster, swing?.skillMode ?? 'A1')

  const defenderStats = new UnitStatList(this.registry, undefined, {
    ownerType: 'player',
    charClass: player.classCode,
  })
  defenderStats.setBaseStat('level', player.level)
  defenderStats.setBaseStat('strength', player.strength + this.sumPlayerItemStat(player, 0))
  defenderStats.setBaseStat('vitality', player.vitality + this.sumPlayerItemStat(player, 3))
  defenderStats.setBaseStat('energy', player.energy + this.sumPlayerItemStat(player, 1))
  defenderStats.setBaseStat('tohit', this.computePlayerBaseToHit113c(player))
  // 1.13c defense & mitigation from active worn items (excluding swap 11/12), sockets, charms, set bonuses, and per-level stats (#1629, #1634).
  let blockChance = this.sumPlayerItemStat(player, 20)
  let hasEquippedShield = false
  let hasAnyEquippedGear = false
  let rightHandWeaponType: string | undefined
  let leftHandWeaponType: string | undefined
  for (const item of player.items) {
    if (item.location !== 'equipped' || item.bodyLoc === 11 || item.bodyLoc === 12) continue
    hasAnyEquippedGear = true
    const armorBlock = resolveArmorBlock113c(item.code)
    const isOffHandWeapon = item.bodyLoc === 5 && resolveWeaponBase113c(item.code) !== undefined
    if ((item.bodyLoc === 5 && !isOffHandWeapon) || (item.bodyLoc === 4 && armorBlock > 0)) {
      hasEquippedShield = true
    }
    if (item.bodyLoc === 4) {
      rightHandWeaponType = resolveWeaponBase113c(item.code)?.type
    } else if (item.bodyLoc === 5) {
      leftHandWeaponType = resolveWeaponBase113c(item.code)?.type
    }
    blockChance += armorBlock
  }
  const isClawType = (t: string | undefined) => t === 'h2h' || t === 'h2h2'
  const isDualClaw =
    !hasEquippedShield && isClawType(rightHandWeaponType) && isClawType(leftHandWeaponType)
  const equippedDex = this.sumPlayerItemStat(player, 2)
  let normalDr = this.sumPlayerItemStat(player, 34)
  let magicDr = this.sumPlayerItemStat(player, 35)
  let damageResist = this.sumPlayerItemStat(player, 36)
  let magicResist = this.sumPlayerItemStat(player, 37)
  let maxMagicResist = this.sumPlayerItemStat(player, 38)
  let fireResist = this.sumPlayerItemStat(player, 39)
  let maxFireResist = this.sumPlayerItemStat(player, 40)
  let lightResist = this.sumPlayerItemStat(player, 41)
  let maxLightResist = this.sumPlayerItemStat(player, 42)
  let coldResist = this.sumPlayerItemStat(player, 43)
  let maxColdResist = this.sumPlayerItemStat(player, 44)
  let poisonResist = this.sumPlayerItemStat(player, 45)
  let maxPoisonResist = this.sumPlayerItemStat(player, 46)
  let absorbFirePct = this.sumPlayerItemStat(player, 142)
  let absorbFire = this.sumPlayerItemStat(player, 143)
  let absorbLightPct = this.sumPlayerItemStat(player, 144)
  let absorbLight = this.sumPlayerItemStat(player, 145)
  let absorbMagicPct = this.sumPlayerItemStat(player, 146)
  let absorbMagic = this.sumPlayerItemStat(player, 147)
  let absorbColdPct = this.sumPlayerItemStat(player, 148)
  let absorbCold = this.sumPlayerItemStat(player, 149)
  const playerBaseDefense = this.computePlayerBaseDefense(player)
  const playerStats = this.playerCombatContext(player).statList
  // Passive statlists (`passive_skill_*`, e.g. `#153 Natural Resistance`) and persistent states (`state_*`,
  // e.g. `#267 Fade` `damageresist` & resistances) are re-attached on `defenderStats` by
  // `syncPlayerSkillLevelsToStatList113c` and `mirrorPersistentStates`; strip them from the copied base totals
  // so they count once (#1803, #1945).
  const passiveOrStateBonus = (stat: string): number => {
    let total = 0
    for (const m of playerStats.getActiveModifiers()) {
      if (
        m.id.startsWith('passive_skill_') ||
        m.id.startsWith('state:') ||
        m.id.startsWith('state_')
      ) {
        total += m.stats[stat] ?? 0
      }
    }
    return total
  }
  damageResist -= passiveOrStateBonus('damageresist')
  fireResist -= passiveOrStateBonus('fireresist')
  lightResist -= passiveOrStateBonus('lightresist')
  coldResist -= passiveOrStateBonus('coldresist')
  poisonResist -= passiveOrStateBonus('poisonresist')
  defenderStats.setBaseStat('dexterity', player.dexterity + equippedDex)
  blockChance += Math.trunc(playerStats.getAccruedStat('toblock', true))
  normalDr += Math.trunc(playerStats.getAccruedStat('normal_damage_reduction'))
  magicDr += Math.trunc(playerStats.getAccruedStat('magic_damage_reduction'))
  damageResist += Math.trunc(getPrePierceResistance113c(playerStats, 'damageresist'))
  magicResist += Math.trunc(playerStats.getAccruedStat('magicresist'))
  fireResist += Math.trunc(getPrePierceResistance113c(playerStats, 'fireresist'))
  lightResist += Math.trunc(getPrePierceResistance113c(playerStats, 'lightresist'))
  coldResist += Math.trunc(getPrePierceResistance113c(playerStats, 'coldresist'))
  poisonResist += Math.trunc(getPrePierceResistance113c(playerStats, 'poisonresist'))
  maxMagicResist += Math.trunc(playerStats.getAccruedStat('maxmagicresist'))
  maxFireResist += Math.trunc(playerStats.getAccruedStat('maxfireresist'))
  maxLightResist += Math.trunc(playerStats.getAccruedStat('maxlightresist'))
  maxColdResist += Math.trunc(playerStats.getAccruedStat('maxcoldresist'))
  maxPoisonResist += Math.trunc(playerStats.getAccruedStat('maxpoisonresist'))
  absorbFirePct += Math.trunc(playerStats.getAccruedStat('item_absorbfire_percent', true))
  absorbFire += Math.trunc(playerStats.getAccruedStat('item_absorbfire', true))
  absorbLightPct += Math.trunc(playerStats.getAccruedStat('item_absorblight_percent', true))
  absorbLight += Math.trunc(playerStats.getAccruedStat('item_absorblight', true))
  absorbMagicPct += Math.trunc(playerStats.getAccruedStat('item_absorbmagic_percent', true))
  absorbMagic += Math.trunc(playerStats.getAccruedStat('item_absorbmagic', true))
  absorbColdPct += Math.trunc(playerStats.getAccruedStat('item_absorbcold_percent', true))
  absorbCold += Math.trunc(playerStats.getAccruedStat('item_absorbcold', true))
  // Set base defense before skill/aura percentage scaling (`defenderStateBus` mirrors active states/auras,
  // so `defenderStats.getAccruedStat('armorclass')` applies `skill_armor_percent` once without double-scaling #1634).
  const armorShrineBonusPct =
    player.states.has(128) && !this.playerCombatContext(player).stateBus.hasState(128) ? 100 : 0
  const baseDefWithPerLvlPct =
    playerBaseDefense +
    Math.trunc((playerBaseDefense * (this.sumPlayerItemStat(player, 215) + armorShrineBonusPct)) / 100)
  defenderStats.setBaseStat('armorclass', Math.max(0, baseDefWithPerLvlPct))
  defenderStats.setBaseStat('armorclass_vs_missile', this.sumPlayerItemStat(player, 32))
  defenderStats.setBaseStat('armorclass_vs_hth', this.sumPlayerItemStat(player, 33))
  defenderStats.setBaseStat('toblock', Math.max(0, blockChance))
  defenderStats.setBaseStat('normal_damage_reduction', normalDr)
  defenderStats.setBaseStat('magic_damage_reduction', magicDr)
  defenderStats.setBaseStat('damageresist', damageResist)
  defenderStats.setBaseStat('magicresist', magicResist)
  defenderStats.setBaseStat('fireresist', fireResist)
  defenderStats.setBaseStat('lightresist', lightResist)
  defenderStats.setBaseStat('coldresist', coldResist)
  defenderStats.setBaseStat('poisonresist', poisonResist)
  defenderStats.setBaseStat('maxmagicresist', maxMagicResist)
  defenderStats.setBaseStat('maxfireresist', maxFireResist)
  defenderStats.setBaseStat('maxlightresist', maxLightResist)
  defenderStats.setBaseStat('maxcoldresist', maxColdResist)
  defenderStats.setBaseStat('maxpoisonresist', maxPoisonResist)
  defenderStats.setBaseStat('item_absorbfire_percent', absorbFirePct)
  defenderStats.setBaseStat('item_absorbfire', absorbFire)
  defenderStats.setBaseStat('item_absorblight_percent', absorbLightPct)
  defenderStats.setBaseStat('item_absorblight', absorbLight)
  defenderStats.setBaseStat('item_absorbmagic_percent', absorbMagicPct)
  defenderStats.setBaseStat('item_absorbmagic', absorbMagic)
  defenderStats.setBaseStat('item_absorbcold_percent', absorbColdPct)
  defenderStats.setBaseStat('item_absorbcold', absorbCold)
  defenderStats.setBaseStat(
    'item_poisonlengthresist',
    this.sumPlayerItemStat(player, 110) +
      Math.trunc(playerStats.getAccruedStat('item_poisonlengthresist', true)),
  )
  defenderStats.setBaseStat('item_cannotbefrozen', this.sumPlayerItemStat(player, 153))
  defenderStats.setBaseStat('item_halffreezeduration', this.sumPlayerItemStat(player, 118))
  defenderStats.setBaseStat('curse_resistance', this.sumPlayerItemStat(player, 109))
  defenderStats.setBaseStat('maxhp', player.maxHpFixed)
  defenderStats.setHp256(player.hpFixed)
  defenderStats.setBaseStat('maxmana', player.maxManaFixed)
  defenderStats.setMana256(player.manaFixed)
  // 1.13c defensive passive statlists at their exact `SKILLS_GetSkillLevel` level (`#13 Dodge`, `#18 Avoid`,
  // `#29 Evade`, `#263 Weapon Block`, `#145 Iron Skin`, `#153 Natural Resistance`; #1796, #1802..#1804).
  this.syncPlayerSkillLevelsToStatList113c(player, defenderStats, this.playerCombat.get(player.unitId)?.stateBus)

  const defenderStateBus = new StateBus(defenderStats, this.registry)
  // Mirror persistent buffs / received auras first, then overlay live Bone Armor / Cyclone Armor
  // remaining absorb pools so `StateBus.triggerReactiveEvents` uses the exact remaining pool (#1793).
  this.mirrorPersistentStates(this.playerCombat.get(player.unitId), defenderStateBus)
  // 1.13c `#267 Fade` (`state 159`, or legacy tests seeding `state 157` when `skills.get(267) > 0`, #1945):
  // grants `+slvl%` physical `damageresist` (`stat 36`), resistances (`dm34(10, 75)`), and `curse_resistance` (`dm12(19, 85)`).
  const hasFadeActive =
    player.states.has(159) ||
    (player.states.has(157) && (player.skills.get(267) ?? 0) > 0 && (player.skills.get(258) ?? 0) === 0)
  if (hasFadeActive && !defenderStateBus.hasState('fade')) {
    const fadeRow = this.registry.getSkillById(267)
    const fadeSlvl = Math.max(1, this.resolvePlayerSkillLevelById(player, 267))
    const fadeStats =
      fadeRow !== undefined
        ? this.evaluateSkillStateStats(fadeRow, fadeSlvl, defenderStats)
        : { damageresist: fadeSlvl }
    defenderStateBus.applyState({
      stateNameOrId: 'fade',
      sourceSkillId: 267,
      slvl: fadeSlvl,
      durationFrames: player.stateTimers.get(159) ?? player.stateTimers.get(157) ?? 300,
      stats: fadeStats,
    })
  }
  if (player.states.has(10) && !defenderStateBus.hasState(10)) {
    defenderStateBus.applyState({
      stateNameOrId: 'frozenarmor',
      sourceSkillId: 40,
      slvl: Math.max(1, this.resolvePlayerSkillLevelById(player, 40)),
      durationFrames: player.stateTimers.get(10) ?? 300,
    })
  }
  if (player.states.has(20) && !defenderStateBus.hasState(20)) {
    defenderStateBus.applyState({
      stateNameOrId: 'chillingarmor',
      sourceSkillId: 60,
      slvl: Math.max(1, this.resolvePlayerSkillLevelById(player, 60)),
      durationFrames: player.stateTimers.get(20) ?? 300,
    })
  }
  if (player.states.has(30) && !defenderStateBus.hasState(30)) {
    defenderStateBus.applyState({
      stateNameOrId: 'energyshield',
      sourceSkillId: 58,
      slvl: Math.max(1, this.resolvePlayerSkillLevelById(player, 58)),
      durationFrames: player.stateTimers.get(30) ?? 300,
    })
  }
  if (player.states.has(88) && !defenderStateBus.hasState(88)) {
    defenderStateBus.applyState({
      stateNameOrId: 'shiverarmor',
      sourceSkillId: 50,
      slvl: Math.max(1, this.resolvePlayerSkillLevelById(player, 50)),
      durationFrames: player.stateTimers.get(88) ?? 300,
    })
  }
  let activeBaPool: { current: number; max: number } | undefined
  const hadBoneArmor = player.states.has(14)
  if (hadBoneArmor) {
    const baLvl = Math.max(1, this.resolvePlayerSkillLevelById(player, 68))
    const defaultBaMax =
      20 + 10 * (baLvl - 1) + 15 * ((player.skills.get(78) ?? 0) + (player.skills.get(88) ?? 0))
    activeBaPool = this.playerBoneArmorPool.get(player.unitId)
    if (activeBaPool === undefined) {
      activeBaPool = { current: defaultBaMax, max: defaultBaMax }
      this.playerBoneArmorPool.set(player.unitId, activeBaPool)
    }
    defenderStateBus.applyState({
      stateNameOrId: 'bonearmor',
      sourceSkillId: 68,
      slvl: baLvl,
      durationFrames: player.stateTimers.get(14) ?? 300,
      stats: { bonearmor: activeBaPool.current, bonearmormax: activeBaPool.max },
    })
  }
  let activeCaPool: { current: number; max: number } | undefined
  const hadCycloneArmor = player.states.has(151)
  if (hadCycloneArmor) {
    const caLvl = Math.max(1, this.resolvePlayerSkillLevelById(player, 235))
    const defaultCaMax = Math.trunc(
      ((40 + 12 * (caLvl - 1)) *
        (100 +
          7 *
            ((player.skills.get(240) ?? 0) +
              (player.skills.get(245) ?? 0) +
              (player.skills.get(250) ?? 0)))) /
        100,
    )
    activeCaPool = this.playerCycloneArmorPool.get(player.unitId)
    if (activeCaPool === undefined) {
      activeCaPool = { current: defaultCaMax, max: defaultCaMax }
      this.playerCycloneArmorPool.set(player.unitId, activeCaPool)
    }
    defenderStateBus.applyState({
      stateNameOrId: 'cyclonearmor',
      sourceSkillId: 235,
      slvl: caLvl,
      durationFrames: player.stateTimers.get(151) ?? 300,
      stats: { bonearmor: activeCaPool.current, bonearmormax: activeCaPool.max },
    })
  }
  if (hasAnyEquippedGear && !hasEquippedShield) {
    defenderStateBus.removeState(101)
    defenderStateBus.removeState('holyshield')
  } else if (player.states.has(101) && !defenderStateBus.hasState(101)) {
    const hsLvl = Math.max(1, this.resolvePlayerSkillLevelById(player, 117))
    // Holy Shield #117 aurastatcalc1 = dm56 (10, 40) + modifierlist_skill/level (#1678, #1800).
    const hsBlock = computeDiminishingReturns(10, 40, hsLvl)
    defenderStateBus.applyState({
      stateNameOrId: 'holyshield',
      sourceSkillId: 117,
      slvl: hsLvl,
      durationFrames: player.stateTimers.get(101) ?? 300,
      stats: {
        toblock: hsBlock,
        modifierlist_skill: 117,
        modifierlist_level: hsLvl,
      },
    })
  }

  const motionMoving = this.playerMotion.get(player.unitId)?.moving === true
  const isWalking =
    player.mode === 2 ||
    player.mode === 6 ||
    (motionMoving && !player.run && player.mode !== 3)
  const isRunning =
    player.mode === 3 ||
    (motionMoving && player.run && player.mode !== 2 && player.mode !== 6)

  const defenderCtx: CombatUnitContext = {
    id: `player_${player.unitId}`,
    name: player.name,
    charClass: player.classCode,
    unitType: 'player',
    statList: defenderStats,
    stateBus: defenderStateBus,
    x: player.x,
    y: player.y,
    armorClassIncludesDex: true,
    hasShield: hasEquippedShield,
    ...(rightHandWeaponType !== undefined ? { weaponItemType: rightHandWeaponType } : {}),
    ...(leftHandWeaponType !== undefined ? { offHandWeaponItemType: leftHandWeaponType } : {}),
    isDualClaw,
    isMoving: motionMoving || isWalking || isRunning,
    isWalking,
    isRunning,
    resistPenalty: difficultyResistPenalty(this.difficulty),
  }

  const swingMode = swing?.skillMode ?? 'A1'
  const rider =
    swing?.fromMissile === true
      ? undefined
      : monster.elementalAttacks.find(
          (entry) =>
            entry.mode === swingMode &&
            (entry.chancePct >= 100 || this.rng.rand(100) < entry.chancePct),
        )
  const rawRiderType = rider?.type
  const resolvedRiderElem =
    rawRiderType === 'rand'
      ? (['fire', 'ltng', 'cold', 'pois'] as const)[this.rng.rand(4)]
      : rawRiderType === 'ltng'
        ? 'ltng'
        : rawRiderType === 'cold' || rawRiderType === 'frze'
          ? 'cold'
          : rawRiderType === 'pois'
            ? 'pois'
            : rawRiderType === 'mag'
              ? 'mag'
              : rawRiderType === 'fire'
                ? 'fire'
                : undefined
  const equipElem =
    swing?.fromMissile !== true || (swing.skillId === 0 && (swing.minDmg ?? 0) + (swing.maxDmg ?? 0) > 0)
      ? monster.monEquipLoadout
      : undefined
  const equipElemType =
    equipElem !== undefined
      ? equipElem.fireMaxDamage > 0
        ? 'fire'
        : equipElem.coldMaxDamage > 0
          ? 'cold'
          : equipElem.ltngMaxDamage > 0
            ? 'ltng'
            : equipElem.poisMaxDamage > 0
              ? 'pois'
              : equipElem.magicMaxDamage > 0
                ? 'mag'
                : undefined
      : undefined
  const elementalType = swing?.elementType ?? resolvedRiderElem ?? equipElemType
  const auraDmgPct = this.monsterAuraDamageBonusPct(monster)
  const physMin = swing?.fromMissile === true ? (swing.minDmg ?? 0) : (swing?.minDmg ?? monster.minDmg)
  const physMax = swing?.fromMissile === true ? (swing.maxDmg ?? 0) : (swing?.maxDmg ?? monster.maxDmg)
  const equipElemMin =
    equipElem !== undefined && elementalType !== undefined
      ? elementalType === 'fire'
        ? equipElem.fireMinDamage
        : elementalType === 'cold'
          ? equipElem.coldMinDamage
          : elementalType === 'ltng'
            ? equipElem.ltngMinDamage
            : elementalType === 'pois'
              ? equipElem.poisMinDamage
              : equipElem.magicMinDamage
      : 0
  const equipElemMax =
    equipElem !== undefined && elementalType !== undefined
      ? elementalType === 'fire'
        ? equipElem.fireMaxDamage
        : elementalType === 'cold'
          ? equipElem.coldMaxDamage
          : elementalType === 'ltng'
            ? equipElem.ltngMaxDamage
            : elementalType === 'pois'
              ? equipElem.poisMaxDamage
              : equipElem.magicMaxDamage
      : 0
  const riderPoisScaled =
    swing?.fromMissile !== true && elementalType === 'pois' && rider !== undefined
      ? scaleMonStatsPoisonRider113c(
          rider.minDamage ?? rider.min ?? 0,
          rider.maxDamage ?? rider.max ?? 0,
          rider.durationFrames ?? rider.duration ?? 25,
        )
      : undefined
  const rawElemMin =
    (swing?.fromMissile === true
      ? (swing.elemMin ?? 0)
      : riderPoisScaled !== undefined
        ? riderPoisScaled.minCumulHp
        : (rider?.minDamage ?? rider?.min ?? 0)) + equipElemMin
  const rawElemMax =
    (swing?.fromMissile === true
      ? (swing.elemMax ?? 0)
      : riderPoisScaled !== undefined
        ? riderPoisScaled.maxCumulHp
        : (rider?.maxDamage ?? rider?.max ?? 0)) + equipElemMax
  const fireMasteryScale =
    elementalType === 'fire' && monster.monProps.extraFirePct > 0
      ? (100 + monster.monProps.extraFirePct) / 100
      : 1
  const elemMin = Math.floor(rawElemMin * fireMasteryScale)
  const elemMax = Math.floor(rawElemMax * fireMasteryScale)
  const rawElemDuration =
    swing?.fromMissile === true
      ? (swing.elemDurationFrames ?? (elementalType === 'cold' ? (equipElem?.coldLengthFrames ?? 0) : 0))
      : (riderPoisScaled?.durationFrames ??
          rider?.durationFrames ??
          rider?.duration ??
          (elementalType === 'cold'
            ? (equipElem?.coldLengthFrames ?? 0)
            : elementalType === 'pois'
              ? (equipElem?.poisLengthFrames ?? 0)
              : 0))
  const elemDuration =
    elementalType === 'pois' && elemMax > 0 && rawElemDuration <= 0 ? 50 : rawElemDuration
  // Pure elemental monster projectiles (`physMax <= 0 && elemMax > 0`) are spell missiles (#1796):
  // Shield Block cannot block them (`unblockable: true`), whereas Assassin dual-claw `Weapon Block` (#263)
  // and Amazon `Avoid` (#18) / `Evade` (#28) CAN!
  const isPureElemMonsterMissile =
    swing?.fromMissile === true && physMax <= 0 && elemMax > 0
  const resolvedAttackKind = isPureElemMonsterMissile
    ? 'spell'
    : swing?.fromMissile === true
      ? 'missile'
      : (swing?.attackKind ?? 'melee')
  const dmgOut = executeSUnitDmg(attackerCtx, defenderCtx, {
    skillId: swing?.skillId ?? 0,
    attackKind: resolvedAttackKind,
    // `weaponMaxPhys` is `0` on `attackerCtx`, so `srcDam: 128` adds 0 weapon damage while
    // enabling `executeSUnitDmg`'s physical-missile Crushing Blow & knockback checks (`#1897`, `#1898`).
    srcDam: resolvedAttackKind === 'missile' ? 128 : 0,
    flatPhysMin256: Math.floor(physMin * FIXED_ONE * (1 + auraDmgPct / 100)),
    flatPhysMax256: Math.floor(physMax * FIXED_ONE * (1 + auraDmgPct / 100)),
    ...(elementalType !== undefined
      ? {
          elemType: elementalType,
          elemMin256: Math.max(0, elemMin) * FIXED_ONE,
          elemMax256: Math.max(0, elemMax) * FIXED_ONE,
          elemDurationFrames: elemDuration,
        }
      : {}),
    ...(swing?.arBonusPct !== undefined ? { toHitBonusPct: swing.arBonusPct } : {}),
    ...(swing?.autoHit === true || isPureElemMonsterMissile ? { autoHit: true } : {}),
    ...(swing?.unblockable !== undefined
      ? { unblockable: swing.unblockable }
      : isPureElemMonsterMissile
        ? { unblockable: true }
        : {}),
  }, this.rng)

  if (dmgOut.hit) {
    // Sync Energy Shield mana deduction & potential state collapse back to player
    const newMana256 = defenderStats.getMana256()
    if (newMana256 !== player.manaFixed) {
      player.manaFixed = Math.max(0, newMana256)
      player.mana = Math.floor(player.manaFixed / FIXED_ONE)
      this.emitToPlayer(player.unitId, {
        type: 'UnitStatUpdate',
        unitType: 'player',
        unitId: player.unitId,
        statId: 8,
        value: player.manaFixed,
      })
    }
    if (player.states.has(30) && !defenderStateBus.hasState('energyshield')) {
      this.clearUnitState(player.states, player.stateTimers, 'player', player.unitId, player.areaId, 30)
    }
    // Sync Bone Armor (#68, state 14) & Cyclone Armor (#235, state 151) remaining absorb pools & shatter (#1793)
    if (hadBoneArmor && activeBaPool !== undefined) {
      const postBa = defenderStateBus.getState('bonearmor')
      const newBaPts = postBa ? (postBa.stats['bonearmor'] ?? 0) : 0
      if (newBaPts <= 0 || !defenderStateBus.hasState('bonearmor')) {
        this.playerBoneArmorPool.delete(player.unitId)
        this.clearUnitState(player.states, player.stateTimers, 'player', player.unitId, player.areaId, 14)
      } else if (newBaPts !== activeBaPool.current) {
        this.playerBoneArmorPool.set(player.unitId, { current: newBaPts, max: activeBaPool.max })
        const persistent = this.playerCombat.get(player.unitId)
        persistent?.stateBus.applyState({
          stateNameOrId: 14,
          sourceUnitId: `player_${player.unitId}`,
          sourceSkillId: 68,
          slvl: postBa?.slvl ?? Math.max(1, this.resolvePlayerSkillLevelById(player, 68)),
          durationFrames: player.stateTimers.get(14) ?? 0,
          currentFrame: this.currentFrame,
          stats: {
            bonearmor: newBaPts * FIXED_ONE,
            bonearmormax: activeBaPool.max * FIXED_ONE,
          },
        })
        this.broadcastToArea(player.areaId, {
          type: 'StateSet',
          unit: { unitType: 0, id: player.unitId },
          state: 14,
          complete: true,
          stats: [
            { statId: 132, param: 0, value: newBaPts * FIXED_ONE },
            { statId: 133, param: 0, value: activeBaPool.max * FIXED_ONE },
          ],
        })
      }
    }
    if (hadCycloneArmor && activeCaPool !== undefined) {
      const postCa = defenderStateBus.getState('cyclonearmor')
      const newCaPts = postCa ? (postCa.stats['bonearmor'] ?? 0) : 0
      if (newCaPts <= 0 || !defenderStateBus.hasState('cyclonearmor')) {
        this.playerCycloneArmorPool.delete(player.unitId)
        this.clearUnitState(player.states, player.stateTimers, 'player', player.unitId, player.areaId, 151)
      } else if (newCaPts !== activeCaPool.current) {
        this.playerCycloneArmorPool.set(player.unitId, { current: newCaPts, max: activeCaPool.max })
        const persistent = this.playerCombat.get(player.unitId)
        persistent?.stateBus.applyState({
          stateNameOrId: 151,
          sourceUnitId: `player_${player.unitId}`,
          sourceSkillId: 235,
          slvl: postCa?.slvl ?? Math.max(1, this.resolvePlayerSkillLevelById(player, 235)),
          durationFrames: player.stateTimers.get(151) ?? 0,
          currentFrame: this.currentFrame,
          stats: {
            bonearmor: newCaPts * FIXED_ONE,
            bonearmormax: activeCaPool.max * FIXED_ONE,
          },
        })
        this.broadcastToArea(player.areaId, {
          type: 'StateSet',
          unit: { unitType: 0, id: player.unitId },
          state: 151,
          complete: true,
          stats: [
            { statId: 132, param: 0, value: newCaPts * FIXED_ONE },
            { statId: 133, param: 0, value: activeCaPool.max * FIXED_ONE },
          ],
        })
      }
    }

    // Sync reactive Cold Armor (Frozen Armor / Shiver Armor) states & damage onto attacking monster
    for (const stName of dmgOut.attackerStatesApplied ?? []) {
      if (stName === 'freeze' && monster.resistances.cold < 100 && monster.coldEffect !== 0) {
        const rawFreezeFrames =
          attackerCtx.stateBus.getState('freeze')?.durationFrames ??
          this.resolveSkillColdOrFreezeDuration113c(player, 40, 'cold').rawFrames
        const divisor = Math.max(1, difficultyMonsterFreezeDivisor(this.difficulty))
        const freezeTicks = Math.trunc(rawFreezeFrames / divisor)
        if (freezeTicks > 0) {
          this.applyMonsterState(monster.unitId, 1, freezeTicks)
        }
      } else if (
        (stName === 'cold' || stName === 'chill') &&
        monster.resistances.cold < 100 &&
        monster.coldEffect !== 0
      ) {
        const rawChillFrames =
          attackerCtx.stateBus.getState(stName)?.durationFrames ??
          this.resolveSkillColdOrFreezeDuration113c(player, 50, 'cold').rawFrames
        const divisor = Math.max(1, difficultyMonsterColdDivisor(this.difficulty))
        const chillTicks = Math.trunc(rawChillFrames / divisor)
        if (chillTicks > 0) {
          this.applyMonsterState(monster.unitId, 11, chillTicks)
        }
      }
    }
    const reactiveMonsterDmg = Math.floor(
      ((dmgOut.attackerColdDamage256 ?? 0) + (dmgOut.reflectedPhys256 ?? 0)) /
        FIXED_ONE,
    )
    if (reactiveMonsterDmg > 0 && !monster.dead && monster.isKillable) {
      monster.hp = Math.max(0, monster.hp - reactiveMonsterDmg)
      this.broadcastToArea(monster.areaId, {
        type: 'UnitStatUpdate',
        unitType: 'monster',
        unitId: monster.unitId,
        statId: 6,
        value: monster.hp,
      })
      if (monster.hp <= 0) {
        this.applyMonsterDeath(monster, player, 'phys')
      }
    }

    // 1.13c `SUNITDMG_ApplyPoison` (`0x6FCFCAB0`) & `SUNITDMG_ExecuteEvents` (`0x6FCFE237`, #1989):
    // Poison damage (`poisonBitrate256 * poisonDurationFrames`) is NEVER deducted instantaneously on impact;
    // it arms `STATE_POISON` (`2`) with `STAT_HPREGEN = -poisonBitrate256`, ticked per frame in `stepPlayerVitals`
    // (`0x6FC97CB0`, clamped at `256` = `1 HP`).
    const poisonBitrate256 = dmgOut.poisonBitrate256 ?? 0
    const poisonDurationFrames = dmgOut.poisonDurationFrames ?? 0
    const poisonTotal256 =
      poisonBitrate256 > 0 && poisonDurationFrames > 0 ? poisonBitrate256 * poisonDurationFrames : 0
    const instantDamage256 = Math.max(0, dmgOut.totalDamage256 - poisonTotal256)
    const finalDmg = Math.floor(instantDamage256 / FIXED_ONE)
    if (poisonBitrate256 > 0 && poisonDurationFrames > 0 && !player.dead) {
      const playerCtx = this.playerCombatContext(player)
      const prevPois = playerCtx.stateBus.getState(2) ?? playerCtx.stateBus.getState('poison')
      const prevBitrate256 = prevPois
        ? Math.max(0, prevPois.stats['poisonmindam'] ?? -(prevPois.stats['hpregen'] ?? 0))
        : 0
      if (!player.states.has(2) || prevPois === undefined || poisonBitrate256 >= prevBitrate256) {
        playerCtx.stateBus.removeState('poison')
        playerCtx.stateBus.applyState({
          stateNameOrId: 2,
          sourceUnitId: `monster_${monster.unitId}`,
          sourceSkillId: swing?.skillId ?? 0,
          slvl: Math.max(1, monster.level),
          durationFrames: poisonDurationFrames,
          currentFrame: this.currentFrame,
          stats: {
            hpregen: -poisonBitrate256,
            poisonmindam: poisonBitrate256,
            poisonlength: poisonDurationFrames,
          },
        })
        this.applyUnitState(
          player.states,
          player.stateTimers,
          'player',
          player.unitId,
          player.areaId,
          2,
          poisonDurationFrames,
        )
      }
    }
    // 1.13c `SUNITDMG_ExecuteEvents` (`0x6FCFE237` -> `SUNITDMG_AddLife` `0x6FCFB570`):
    // Add `dwAbsorbLife` (`dmgOut.absorbHeal256`) to defender life (clamped at `maxhp`) BEFORE
    // subtracting `dwTotalDamage` (`finalDmg`).
    const absorbHeal256 = dmgOut.absorbHeal256 ?? 0
    if (absorbHeal256 > 0 && !player.dead && player.hpFixed > 0 && !player.states.has(92)) {
      const accruedMaxHpFixed = this.getPlayerAccruedMaxHpFixed(player)
      const nextHpFixed = Math.min(accruedMaxHpFixed, player.hpFixed + absorbHeal256)
      if (nextHpFixed !== player.hpFixed) {
        player.hpFixed = nextHpFixed
        player.hp = Math.max(0, Math.ceil(player.hpFixed / FIXED_ONE))
        if (finalDmg <= 0) {
          this.emitToPlayer(player.unitId, {
            type: 'UnitStatUpdate',
            unitType: 'player',
            unitId: player.unitId,
            statId: 6,
            value: player.hpFixed,
          })
          this.emitToPlayer(player.unitId, {
            type: 'LifeMana',
            life: player.hp,
            mana: player.mana,
            stamina: player.stamina,
            at: playerWirePosition(player),
            vx: 0,
            vy: 0,
          })
        }
      }
    }
    if (
      elementalType === 'cold' &&
      elemDuration > 0 &&
      swing?.fromMissile !== true &&
      dmgOut.elemDamage256 > 0 &&
      !player.dead
    ) {
      this.applyUnitState(
        player.states,
        player.stateTimers,
        'player',
        player.unitId,
        player.areaId,
        11,
        elemDuration,
      )
    }
    if (finalDmg > 0) {
      const isPhysicalOrWeaponHit = isPhysicalOrWeaponMonsterHit113c({
        autoHit: swing?.autoHit,
        fromMissile: swing?.fromMissile,
        physMax,
        elemMax,
        elementType: swing?.elementType,
      })
      // 1.13c `MonUMod #7` (`Cursed`, `D2Game.dll` `0x6FC44250`, boss-only `bBoss != 0`, #1904 / #1993 / #2003):
      // Rolls `75%` chance (`rand(100) < 75`) on physical/weapon hits to apply `#66 Amplify Damage` (`state 9`)
      // at `slvl = floor(mlvl / 5) + 1` for `200 + 75 * (slvl - 1)` frames (scaled by `curse_resistance`).
      if (
        isPhysicalOrWeaponHit &&
        monster.rank !== 'minion' &&
        monster.umodIds.includes(MON_UMOD.CURSE) &&
        this.rng.rand(100) < CURSED_PROC_CHANCE_PCT_113C &&
        !player.states.has(57)
      ) {
        const curseRes = Math.trunc(defenderStats.getAccruedStat('curse_resistance'))
        const cursed = computeCursedAmplifyDamage113c(monster.level, curseRes)
        const rawCursed = computeCursedAmplifyDamage113c(monster.level, 0)
        if (cursed.durationFrames > 0) {
          const playerCtx = this.playerCombatContext(player)
          for (const prevCurseId of [19, 55, 58, 60, 61, 113, 114]) {
            if (player.states.has(prevCurseId)) {
              playerCtx.stateBus.removeState(prevCurseId)
              this.clearUnitState(
                player.states,
                player.stateTimers,
                'player',
                player.unitId,
                player.areaId,
                prevCurseId,
              )
            }
          }
          this.applyUnitState(
            player.states,
            player.stateTimers,
            'player',
            player.unitId,
            player.areaId,
            9,
            rawCursed.durationFrames,
          )
          playerCtx.stateBus.applyState({
            stateNameOrId: 'amplifydamage',
            sourceUnitId: `monster_${monster.unitId}`,
            sourceSkillId: 66,
            slvl: cursed.slvl,
            durationFrames: rawCursed.durationFrames,
            currentFrame: this.currentFrame,
            stats: { damageresist: -100 },
          })
        }
      }
      // 1.13c `MonUMod #25` (`Mana Burn`, `D2Game.dll` `0x6FC421D0` / `0x6FC422DD: shl esi, 0x8`, #1905 / #2003):
      // Drains `66%..100%` (`33%..50%` minion) of monster physical base damage on physical/weapon hits,
      // with melee `<< 8` (`256x`) shift. Pure elemental spell missiles never proc Mana Burn.
      if (isPhysicalOrWeaponHit && monster.umodIds.includes(MON_UMOD.MANahit)) {
        const drainFixed = computeManaBurnDrainFixed113c({
          isMinion: monster.rank === 'minion',
          isMelee: swing?.fromMissile !== true,
          baseMinDmg: swing?.minDmg ?? monster.minDmg,
          baseMaxDmg: swing?.maxDmg ?? monster.maxDmg,
          rollInt: (lo, hi) => lo + this.rng.rand(Math.max(1, hi - lo + 1)),
        })
        const nextManaFixed = Math.max(0, player.manaFixed - drainFixed)
        if (nextManaFixed !== player.manaFixed) {
          player.manaFixed = nextManaFixed
          player.mana = Math.floor(player.manaFixed / FIXED_ONE)
          this.emitToPlayer(player.unitId, {
            type: 'UnitStatUpdate',
            unitType: 'player',
            unitId: player.unitId,
            statId: 8,
            value: player.manaFixed,
          })
          this.emitPlayerVitals(player)
        }
      }
      const monKillerType: DeathKillerKind113c =
        monster.convertedUntilFrame > this.currentFrame && monster.convertedByPlayerId > 0
          ? 'player_pet'
          : 'monster'
      // 1.13c melee/weapon elemental riders (`#9 Fire`, `#17 Lightning`, `#18 Cold`, `#23 Poison`,
      // boss-only `#27 Spectral Hit` 1-of-5 roll, and `#36 Ghostly`; #1890, #1903, #2003).
      if (
        isPhysicalOrWeaponHit &&
        (monster.umodIds.includes(MON_UMOD.FIRE) ||
          monster.umodIds.includes(MON_UMOD.LIGHTNING) ||
          monster.umodIds.includes(MON_UMOD.COLD) ||
          monster.umodIds.includes(MON_UMOD.POISON) ||
          (monster.rank !== 'minion' && monster.umodIds.includes(MON_UMOD.SPECTRALHIT)) ||
          monster.umodIds.includes(MON_UMOD.GHOSTLY))
      ) {
        const ench = rollEnchantedAttackBonus113c({
          umodIds: monster.umodIds,
          isMinion: monster.rank === 'minion',
          mlvl: monster.level,
          baseMinDmg: swing?.minDmg ?? monster.minDmg,
          baseMaxDmg: swing?.maxDmg ?? monster.maxDmg,
          rollInt: (lo, hi) => lo + this.rng.rand(Math.max(1, hi - lo + 1)),
        })
        if (
          ench.fireDmg > 0 ||
          ench.lightDmg > 0 ||
          ench.coldDmg > 0 ||
          ench.magicDmg > 0 ||
          ench.poisonDmg > 0
        ) {
          this.applyPlayerElementalDamage(
            player,
            {
              ...(ench.fireDmg > 0 ? { fire: ench.fireDmg } : {}),
              ...(ench.lightDmg > 0 ? { light: ench.lightDmg } : {}),
              ...(ench.coldDmg > 0 ? { cold: ench.coldDmg } : {}),
              ...(ench.magicDmg > 0 ? { mag: ench.magicDmg } : {}),
              ...(ench.poisonDmg > 0
                ? {
                    pois: ench.poisonDmg,
                    poisDurationFrames: ench.poisonFrames > 0 ? ench.poisonFrames : 50,
                  }
                : {}),
            },
            { skipGetHit: true, killerType: monKillerType, killerUnitId: monster.unitId },
          )
        }
        if (
          ench.chillFrames > 0 &&
          !player.dead &&
          defenderStats.getAccruedStat('item_cannotbefrozen') <= 0
        ) {
          const effColdRes = this.playerResistPct(player, 'cold')
          if (effColdRes < 100) {
            let mitigatedChill = Math.floor((ench.chillFrames * (100 - effColdRes)) / 100)
            if (defenderStats.getAccruedStat('item_halffreezeduration') > 0) {
              mitigatedChill = Math.floor(mitigatedChill / 2)
            }
            if (mitigatedChill > 0) {
              this.applyUnitState(
                player.states,
                player.stateTimers,
                'player',
                player.unitId,
                player.areaId,
                11,
                Math.max(player.stateTimers.get(11) ?? 0, mitigatedChill),
              )
            }
          }
        }
      }
      this.applyDamageToPlayer(player, finalDmg, {
        hitClass: this.resolveMonsterHitClass113c(
          monster,
          swing?.skillId ?? 0,
          swing?.missileId ?? 0,
        ),
        isPurePoison: elementalType === 'pois' && physMin <= 0 && physMax <= 0,
        killerType: monKillerType,
        killerUnitId: monster.unitId,
      })
      // 1.13c `item_skillongethit` (201): a damaging hit that the player survives (#1797).
      if (!player.dead && player.hp > 0) {
        this.triggerPlayerCtcProcs113c(player, 201, { target: monster })
      }
      // `#1897` / `#1898` `MonProp.txt` & `MonEquip.txt` on-hit effects:
      // 1) Knockback (`bloodraven` in Hell, or Rare bow with `knock`):
      if (
        !player.dead &&
        (monster.monProps.knockback || Boolean(monster.monEquipLoadout?.knockback)) &&
        !isPureElemMonsterMissile &&
        rollItemKnockback113c(this.rng, { unitType: 'player', sizeX: 2 })
      ) {
        this.knockbackPlayerFromBoss113c(player, monster.x, monster.y, 2)
      }
      // 2) `MonEquip.txt` CtC curses on striking (`#66`, `#87`, `#72`, `#91`):
      if (!player.dead && monster.monEquipLoadout && monster.monEquipLoadout.ctcProcs.length > 0) {
        for (const proc of monster.monEquipLoadout.ctcProcs) {
          if (proc.chancePct > 0 && this.rng.rand(100) < proc.chancePct) {
            this.applyMonsterCurseToTarget113c(
              monster,
              { kind: 'player', player },
              proc.skillId,
              Math.max(1, proc.slvl),
            )
          }
        }
      }
      // 3) `#1895` `BloodLord` (`#328 BloodLordFrenzy`): stacks attack & move haste on melee hits!
      if (
        !monster.dead &&
        swing?.fromMissile !== true &&
        (monster.ai === 'BloodLord' || monster.skills.some((s) => s.skillId === 328))
      ) {
        const prevStacks = this.currentFrame < monster.frenzyUntilFrame ? monster.frenzySpeedPct : 0
        monster.frenzySpeedPct = Math.min(100, Math.max(25, prevStacks + 25))
        monster.frenzyUntilFrame = this.currentFrame + 150
        this.applyMonsterState(monster.unitId, 141, 150)
      }
      // 4) `MonStats.txt` `El1Type` (`mana` on `wraith1..9` Ghost, `stam` on `swarm`/`mosquito`,
      // `life` on `foulcrow6`, `stun` on `thornhulk`/`snowyeti`/`duriel`):
      const riderDrainOrStun = swing?.fromMissile === true ? undefined : rider?.type
      if (riderDrainOrStun === 'mana' && !player.dead) {
        const mLo = Math.max(1, rider?.minDamage ?? rider?.min ?? 1)
        const mHi = Math.max(mLo, rider?.maxDamage ?? rider?.max ?? mLo)
        const drained = this.rollInclusive(mLo, mHi)
        player.manaFixed = Math.max(0, player.manaFixed - drained * FIXED_ONE)
        player.mana = Math.floor(player.manaFixed / FIXED_ONE)
        this.emitToPlayer(player.unitId, {
          type: 'UnitStatUpdate',
          unitType: 'player',
          unitId: player.unitId,
          statId: 8,
          value: player.manaFixed,
        })
      } else if (riderDrainOrStun === 'stam' && !player.dead) {
        const sLo = Math.max(1, rider?.minDamage ?? rider?.min ?? 1)
        const sHi = Math.max(sLo, rider?.maxDamage ?? rider?.max ?? sLo)
        const drained = this.rollInclusive(sLo, sHi)
        player.staminaFixed = Math.max(0, player.staminaFixed - drained * FIXED_ONE)
        player.stamina = Math.floor(player.staminaFixed / FIXED_ONE)
        this.emitToPlayer(player.unitId, {
          type: 'UnitStatUpdate',
          unitType: 'player',
          unitId: player.unitId,
          statId: 10,
          value: player.staminaFixed,
        })
      } else if (riderDrainOrStun === 'life' && !monster.dead) {
        const lLo = Math.max(1, rider?.minDamage ?? rider?.min ?? 1)
        const lHi = Math.max(lLo, rider?.maxDamage ?? rider?.max ?? lLo)
        const healed = this.rollInclusive(lLo, lHi)
        const nextHp = Math.min(monster.maxHp, monster.hp + healed)
        if (nextHp !== monster.hp) {
          monster.hp = nextHp
          this.broadcastToArea(monster.areaId, {
            type: 'UnitStatUpdate',
            unitType: 'monster',
            unitId: monster.unitId,
            statId: 6,
            value: monster.hp,
          })
        }
      } else if (riderDrainOrStun === 'stun' && !player.dead) {
        const stunDur = Math.max(10, rider?.durationFrames ?? rider?.duration ?? 25)
        this.applyUnitState(
          player.states,
          player.stateTimers,
          'player',
          player.unitId,
          player.areaId,
          21,
          stunDur,
        )
      }
      // 1.13c `MISSMODE_SrvHit31_Firehead` (`D2Game.dll` `0x6FC5A920`, `#277 firehead` / `#333 VampireMissile`, #2007):
      // Heals `pOwner` by `100%` of actual damage dealt (`add eax, esi`), clamped to `maxHp`.
      // Other Vampire spells (`#169 VampireFireball`, `#170 VampireFirewall`, `#171 VampireMeteor`) do NOT steal life;
      // Vampire innate life drain applies strictly to melee swings (`!swing?.fromMissile`, `0x6FC95E10`).
      const missileSrvHitFunc =
        swing?.fromMissile === true && swing.missileId !== undefined
          ? this.registry.getMissileById(swing.missileId)?.pSrvHitFunc
          : undefined
      if (missileSrvHitFunc === 31 && finalDmg > 0 && !monster.dead) {
        const nextHp = Math.min(monster.maxHp, monster.hp + finalDmg)
        if (nextHp !== monster.hp) {
          monster.hp = nextHp
          this.broadcastToArea(monster.areaId, {
            type: 'UnitStatUpdate',
            unitType: 'monster',
            unitId: monster.unitId,
            statId: 6,
            value: monster.hp,
          })
        }
      }
      // MonAi innate drain rows (Vampire/BatDemon/BloodLord melee life, WillOWisp
      // mana, Swarm stamina, Mosquito life). 1.13c returns half the hit.
      const isVampireMissile =
        swing?.fromMissile === true && normalizeMonAiName113c(monster.ai) === 'vampire'
      const drainKind =
        riderDrainOrStun === 'mana' ||
        riderDrainOrStun === 'stam' ||
        riderDrainOrStun === 'life' ||
        missileSrvHitFunc === 31 ||
        isVampireMissile
          ? undefined
          : monsterProfile113c(monster.ai).drain
      const drainAmount = Math.max(1, Math.floor(finalDmg / 2))
      if (drainKind === 'life' && !monster.dead) {
        const nextHp = Math.min(monster.maxHp, monster.hp + drainAmount)
        if (nextHp !== monster.hp) {
          monster.hp = nextHp
          this.broadcastToArea(monster.areaId, {
            type: 'UnitStatUpdate',
            unitType: 'monster',
            unitId: monster.unitId,
            statId: 6,
            value: monster.hp,
          })
        }
      } else if (drainKind === 'mana') {
        player.manaFixed = Math.max(0, player.manaFixed - drainAmount * FIXED_ONE)
        player.mana = Math.floor(player.manaFixed / FIXED_ONE)
        this.emitToPlayer(player.unitId, {
          type: 'UnitStatUpdate',
          unitType: 'player',
          unitId: player.unitId,
          statId: 8,
          value: player.manaFixed,
        })
      } else if (drainKind === 'stamina') {
        player.staminaFixed = Math.max(
          0,
          player.staminaFixed - drainAmount * FIXED_ONE,
        )
        player.stamina = Math.floor(player.staminaFixed / FIXED_ONE)
        this.emitToPlayer(player.unitId, {
          type: 'UnitStatUpdate',
          unitType: 'player',
          unitId: player.unitId,
          statId: 10,
          value: player.staminaFixed,
        })
      }
    }
  } else if (
    dmgOut.avoidedReason === 'block' ||
    dmgOut.avoidedReason === 'weapon_block'
  ) {
    if (!this.isPlayerSkillUninterruptible113c(player)) {
      this.interruptPendingPlayerAnimAction113c(player, 'BL')
      const blockFrames = this.playerBlockRecoveryFrames(player)
      player.mode = 9
      player.blockRecoveryUntilFrame = this.currentFrame + blockFrames
      player.targetX = player.x
      player.targetY = player.y
      const motion = this.playerMotion.get(player.unitId)
      if (motion !== undefined) {
        motion.mover.setPosition(player.x, player.y)
        motion.x = player.x
        motion.y = player.y
        motion.moving = false
        motion.plannedX = Number.NaN
        motion.plannedY = Number.NaN
      }
      this.broadcastToArea(player.areaId, {
        type: 'UnitMode',
        unitType: 0,
        id: player.unitId,
        mode: 9,
        at: playerWirePosition(player),
        lifePct:
          player.maxHp > 0
            ? Math.max(0, Math.round((player.hp / player.maxHp) * 128))
            : 0,
      })
    }
  }
  return dmgOut.hit
}

export interface MonsterMeleeAttacksMethods {
  beginMonsterMeleeAttack(monster: InternalMonsterRecord, player: InternalPlayerRecord): void
  monsterAttackTiming(monster: InternalMonsterRecord, mode: 'A1' | 'A2' | 'S1'): { readonly actionFrame: number; readonly totalFrames: number }
  stepPendingResurrection(monster: InternalMonsterRecord): void
  reviveMonsterCorpse(caster: InternalMonsterRecord, corpse: InternalMonsterRecord): void
  stepPendingMonsterAttack(monster: InternalMonsterRecord): void
  rollMonsterElementalRider(monster: InternalMonsterRecord, mode: 'A1' | 'A2' | 'S1'): { readonly element: MissileDamageChannel; readonly damage: number; readonly durationFrames: number } | undefined
  beginMonsterMeleeAttackOnAlly(monster: InternalMonsterRecord, target: { readonly kind: 'merc' | 'pet'; readonly id: number | string }): void
  stepPendingAllyAttack(monster: InternalMonsterRecord): void
  buildMonsterAttackerContext(monster: InternalMonsterRecord, skillMode?: 'A1' | 'A2' | 'S1' | undefined): CombatUnitContext
  computePlayerBaseDefense(player: InternalPlayerRecord): number
  computePlayerDefense(player: InternalPlayerRecord): number
  resolveMonsterAttackOnPlayer(monster: InternalMonsterRecord, player: InternalPlayerRecord, swing?: {
    readonly minDmg: number
    readonly maxDmg: number
    readonly skillMode: 'A1' | 'A2' | 'S1'
    /** Missile hits use the projectile block/dodge path; melee uses the melee path. */
    readonly attackKind?: 'melee' | 'missile' | undefined
    readonly skillId?: number | undefined
    readonly missileId?: number | undefined
    readonly arBonusPct?: number | undefined
    /** Explicit projectile element (Missiles.txt EType) instead of a MonStats El1..3 rider. */
    readonly elementType?: MissileDamageChannel | undefined
    readonly elemMin?: number | undefined
    readonly elemMax?: number | undefined
    readonly elemDurationFrames?: number | undefined
    /** Projectile hits must not re-roll the monster's melee El1..3 rider. */
    readonly fromMissile?: boolean | undefined
    /** Death-effect novae or `ResultFlags & 1` skills bypass `RollToHit` vs Defense. */
    readonly autoHit?: boolean | undefined
    readonly unblockable?: boolean | undefined
  }): boolean
}

export const monsterMeleeAttacksMethods: Record<keyof MonsterMeleeAttacksMethods, unknown> = {
  beginMonsterMeleeAttack,
  monsterAttackTiming,
  stepPendingResurrection,
  reviveMonsterCorpse,
  stepPendingMonsterAttack,
  rollMonsterElementalRider,
  beginMonsterMeleeAttackOnAlly,
  stepPendingAllyAttack,
  buildMonsterAttackerContext,
  computePlayerBaseDefense,
  computePlayerDefense,
  resolveMonsterAttackOnPlayer,
}
