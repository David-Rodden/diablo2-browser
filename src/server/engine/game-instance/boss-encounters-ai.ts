/**
 * GameInstance Subsystem: Monster Skill/Utility Casting & Diablo, Baal, Uber Tristram and Ancients Boss AI (`src/server/engine/game-instance/boss-encounters-ai.ts`).
 */

import type { MissileRecord, SkillRecord } from '../../../common/data/data-registry.ts'
import { getEmbeddedDropTables } from '../../../common/items/embedded-drop-tables.ts'
import { PANDEMONIUM_FINALE_AREA_ID_113C, UBER_PRIME_EVIL_SET_113C, UBER_PRIME_MINION_SPECS_113C, computeUberPrimeMinionCap113c, createPandemoniumFinaleDrops113c } from '../../world/pandemonium-113c.ts'
import { MONSTATS_113C_ROWS } from '../../../common/units/monstats-113c-data.ts'
import { isBaalTentacleHcIdx113c, isBonePrisonMonsterHcIdx113c, monaiParam113c } from '../../../common/units/monai-113c.ts'
import { MON_UMOD } from '../../../common/units/monster-death-fx.ts'
import type { MonsterSkillEntry } from '../../../common/units/unit-types.ts'
import type { ServerEvent } from '../../../netproto/index.ts'
import type { SummonedPetUnit } from '../../ai/summon-manager.ts'
import { FIXED_ONE, UnitStatList } from '../stat-list.ts'
import { STATE_SLOWMISSILES_113C } from '../../skills/p1-wave4-skills-113c.ts'
import { evaluateSkill113c } from '../../skills/registry.ts'
import type { GameInstanceHost } from './host.ts'
import type { InternalMercenaryRecord, InternalMissileRecord, InternalMonsterRecord, InternalPlayerRecord, MissileDamageChannel } from './types.ts'
import { monsterProfile113c, normalizeMissileElement, playerWirePosition, UNIT_TYPE_113C } from './constants-and-helpers.ts'


/**
 * Cast one of MonStats `Skill1..8` when it is ready and in range. Projectile
 * skills are evaluated through the same `evaluateSkill113c` registry as player
 * casts; their `srvmissile`/`srvmissilea` row and `Missiles.txt` EType decide
 * the launch and damage channel. Non-projectile utility skills (resurrection,
 * curses, summons) keep their dedicated handlers.
 */
function tryCastMonsterSkill(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  target: { readonly x: number; readonly y: number },
  distance: number,
  options?: { readonly hitMonsters?: boolean | undefined },
): boolean {
  if (monster.skillCooldown > 0 || monster.skills.length === 0) return false
  const profile = monsterProfile113c(monster.ai)
  // Healers such as HighPriest (row 85) must evaluate ZakarumHeal before their
  // projectile slots; otherwise the projectile candidate list always wins.
  if (
    options?.hitMonsters !== true &&
    (profile.healRangeParam !== undefined || profile.whip === true) &&
    this.tryCastMonsterUtilitySkill(monster, target, distance, true)
  ) {
    return true
  }
  const difficulty = this.difficulty === 2 ? 2 : this.difficulty === 1 ? 1 : 0
  const ordered = [...monster.skills].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))

  // 1.13c Succubus / SuccubusWitch (`#309 Defense Curse` when `maxMana < maxHp`, `#310 Blood Mana` when
  // `maxMana >= maxHp`) & explicit `Skill1..8` monster curses (`#66`, `#72`, `#87`, #1822):
  if (options?.hitMonsters !== true && distance <= 25) {
    const hasSuccubusCurse = ordered.some((e) => e.skillId === 309 || e.skillId === 310)
    const explicitCurseEntry = ordered.find(
      (e) => e.skillId === 66 || e.skillId === 72 || e.skillId === 87,
    )
    if (hasSuccubusCurse || explicitCurseEntry !== undefined) {
      let targetPlayer: InternalPlayerRecord | undefined
      let bestPDist = 3
      for (const p of this.players.values()) {
        if (p.dead || p.areaId !== monster.areaId) continue
        const d = Math.hypot(p.x - target.x, p.y - target.y)
        if (d <= bestPDist) {
          bestPDist = d
          targetPlayer = p
        }
      }
      if (hasSuccubusCurse && targetPlayer !== undefined) {
        const wantBloodMana = targetPlayer.maxManaFixed >= targetPlayer.maxHpFixed
        const desiredSkillId = wantBloodMana ? 310 : 309
        const desiredStateId = wantBloodMana ? 114 : 113
        const curseEntry =
          ordered.find((e) => e.skillId === desiredSkillId) ??
          ordered.find((e) => e.skillId === 309 || e.skillId === 310)
        const castChance = Math.max(25, Math.min(100, monster.aiParams[1] || 50))
        if (
          curseEntry?.skillId !== undefined &&
          !targetPlayer.states.has(desiredStateId) &&
          this.rng.rand(100) < castChance
        ) {
          this.applyMonsterCurseToTarget113c(
            monster,
            { kind: 'player', player: targetPlayer },
            curseEntry.skillId,
            Math.max(1, curseEntry.level),
          )
          const curseMode = this.monsterSkillMode(curseEntry.mode)
          monster.mode = curseMode
          this.broadcastToArea(monster.areaId, {
            type: 'UnitMode',
            unitType: 1,
            id: monster.unitId,
            mode: curseMode,
            at: { x: Math.round(targetPlayer.x), y: Math.round(targetPlayer.y) },
            lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
          })
          monster.skillCooldown = Math.max(40, monster.cooldownTicks * 2)
          monster.cooldown = Math.max(monster.cooldown, monster.cooldownTicks)
          return true
        }
      } else if (explicitCurseEntry?.skillId !== undefined && targetPlayer !== undefined) {
        const stateMap: Record<number, number> = { 66: 9, 72: 19, 87: 60 }
        const wantState = stateMap[explicitCurseEntry.skillId] ?? 9
        if (!targetPlayer.states.has(wantState) && this.rng.rand(100) < 40) {
          this.applyMonsterCurseToTarget113c(
            monster,
            { kind: 'player', player: targetPlayer },
            explicitCurseEntry.skillId,
            Math.max(1, explicitCurseEntry.level),
          )
          const curseMode = this.monsterSkillMode(explicitCurseEntry.mode)
          monster.mode = curseMode
          this.broadcastToArea(monster.areaId, {
            type: 'UnitMode',
            unitType: 1,
            id: monster.unitId,
            mode: curseMode,
            at: { x: Math.round(targetPlayer.x), y: Math.round(targetPlayer.y) },
            lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
          })
          monster.skillCooldown = Math.max(40, monster.cooldownTicks * 2)
          monster.cooldown = Math.max(monster.cooldown, monster.cooldownTicks)
          return true
        }
      }
    }
  }
  if (
    this.tryCastMonsterCombatOrSummonSkill113c(
      monster,
      target,
      distance,
      options?.hitMonsters === true,
    )
  ) {
    return true
  }
  const candidates: {
    readonly entry: MonsterSkillEntry
    readonly skill: SkillRecord
    readonly missileRec: MissileRecord
  }[] = []
  for (const entry of ordered) {
    if (entry.skillId === undefined) continue
    // Resurrection (181/327/158) is executed by the shaman/undead handler with
    // its own corpse/race rules, not as a projectile.
    if (entry.skillId === 181 || entry.skillId === 327 || entry.skillId === 158) continue
    const skill = this.registry.getSkillById(entry.skillId)
    if (skill === undefined) continue
    if (skill.summon !== '' || skill.petType !== '') continue
    if (/heal|vortex|aura|teleport|armor|bestow/i.test(skill.name)) continue
    const missileName =
      skill.srvMissile !== ''
        ? skill.srvMissile
        : skill.srvMissileA !== ''
          ? skill.srvMissileA
          : ''
    if (missileName === '') continue
    const missileRec = this.registry.getMissileByName(missileName)
    if (missileRec === undefined) continue
    candidates.push({ entry, skill, missileRec })
  }
  if (candidates.length === 0) return this.tryCastMonsterUtilitySkill(monster, target, distance)
  // Melee-range monsters alternate between their skill and A1 instead of never
  // swinging; at range the cooldown alone paces the casts.
  if (distance <= 2.5 && this.rng.rand(2) !== 0) return false
  const chosen = candidates[monster.skillCursor % candidates.length]!
  const { entry, skill, missileRec } = chosen
  monster.skillCursor = (monster.skillCursor + 1) % Math.max(1, candidates.length)
  const skillLevel = Math.max(1, entry.level)
  const rangeFrames = Math.max(2, missileRec.range + missileRec.levRange * skillLevel)
  const missileReach =
    missileRec.vel > 0 ? Math.max(rangeFrames, (missileRec.vel / 16) * rangeFrames) : rangeFrames
  if (distance > Math.min(35, Math.max(4, missileReach))) return false
  const statList = new UnitStatList(this.registry)
  statList.setBaseStat('level', monster.level)
  statList.setBaseStat('tohit', monster.ar)
  statList.setBaseStat('armorclass', monster.ac)
  statList.setBaseStat('maxhp', monster.maxHp * FIXED_ONE)
  statList.setHp256(monster.hp * FIXED_ONE)
  statList.setBaseStat('strength', 0)
  statList.setBaseStat('dexterity', 0)
  statList.setBaseStat('vitality', 0)
  statList.setBaseStat('energy', 0)
  statList.setBaseSkillLevel(entry.skillId!, skillLevel)
  const evalResult = evaluateSkill113c({
    registry: this.registry,
    skill,
    slvl: skillLevel,
    blvl: skillLevel,
    statList,
    difficulty,
  })
  let phys = this.rollInclusive(evalResult.minPhysDmg, evalResult.maxPhysDmg)
  let elem = this.rollInclusive(evalResult.minElemDmg, evalResult.maxElemDmg)
  if (phys + elem <= 0 && missileRec.minDamage + missileRec.maxDamage > 0) {
    // Most rows store 8-bit fixed point (1792 = 7), but some flat rows store
    // the literal damage (Mephisto 12..16).
    const divisor =
      missileRec.minDamage >= 256 || missileRec.maxDamage >= 256 ? 256 : 1
    const lo = Math.trunc(missileRec.minDamage / divisor)
    const hi = Math.trunc(missileRec.maxDamage / divisor)
    if (normalizeMissileElement(missileRec.eType) !== undefined) {
      elem = this.rollInclusive(lo, hi)
    } else {
      phys = this.rollInclusive(lo, hi)
    }
  }
  if (phys + elem <= 0) {
    phys = this.rollInclusive(monster.minDmg, monster.maxDmg)
  }
  const element =
    normalizeMissileElement(missileRec.eType) ??
    normalizeMissileElement(skill.eType) ??
    'phys'
  if (element !== 'phys') {
    elem += phys
    phys = 0
  }
  if (element === 'fire' && monster.monProps.extraFirePct > 0) {
    elem = Math.max(1, Math.floor((elem * (100 + monster.monProps.extraFirePct)) / 100))
  }
  const mode = this.monsterSkillMode(entry.mode)
  monster.mode = mode
  this.broadcastToArea(monster.areaId, {
    type: 'UnitMode',
    unitType: 1,
    id: monster.unitId,
    mode,
    at: { x: Math.round(target.x), y: Math.round(target.y) },
    lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
  })
  this.spawnMonsterMissile(monster, target.x, target.y, phys + elem, missileRec.id, skill.id, {
    missile: missileRec,
    skillLevel: Math.max(1, entry.level),
    physDamage: phys,
    elemDamage: elem,
    element,
    ...(options?.hitMonsters === true ? { hitMonsters: true } : {}),
  })
  const delay = Number.parseInt(skill.delay, 10)
  const rawCooldown =
    Number.isFinite(delay) && delay > 0
      ? delay
      : Math.max(25, monster.cooldownTicks * 2)
  monster.skillCooldown =
    monster.monProps.fcrPct > 0
      ? Math.max(5, Math.floor((rawCooldown * 100) / (100 + monster.monProps.fcrPct)))
      : rawCooldown
  return true
}



/**
 * Non-projectile `Skill1..8` (`#179 ZakarumHeal`, `#182 Bestow`, `MonTeleport`, `MonBoneArmor`,
 * `FetishAura`, `#295 Overseer Whip`): heal, blink or apply the skill's self/ally state.
 */
function tryCastMonsterUtilitySkill(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  target: { readonly x: number; readonly y: number },
  distance: number,
  healOrWhipOnly = false,
): boolean {
  // Heal slots (`#179 ZakarumHeal`, `#182 Bestow`, `#1896`) must win over summon/projectile slots
  // (HighPriest has Hydra in slot 1 and ZakarumHeal in slot 2).
  const healEntry = monster.skills.find((entry) => {
    if (entry.skillId === undefined) return false
    if (entry.skillId === 179 || entry.skillId === 182 || entry.skillId === 192) return true
    const skill = this.registry.getSkillById(entry.skillId)
    return skill !== undefined && /(?:^|\b)(?:zakarumheal|monheal|bestow)\b/i.test(skill.name)
  })
  if (healEntry?.skillId !== undefined) {
    const healSkill = this.registry.getSkillById(healEntry.skillId)
    const healDelay = healSkill?.delay && healSkill.delay !== '0' ? healSkill.delay : '25'
    const profile = monsterProfile113c(monster.ai)
    const healRange = Math.max(
      12,
      monaiParam113c(profile, monster.aiParams, profile.healRangeParam, 12),
    )
    let healTarget: InternalMonsterRecord | undefined =
      !monster.states.has(52) && monster.hp < monster.maxHp ? monster : undefined
    let lowestPct =
      healTarget !== undefined && monster.maxHp > 0 ? monster.hp / monster.maxHp : 1
    for (const ally of this.monsters.values()) {
      if (
        ally.dead ||
        ally.isNpc ||
        ally.states.has(52) ||
        ally.areaId !== monster.areaId ||
        ally.hp >= ally.maxHp ||
        Math.hypot(ally.x - monster.x, ally.y - monster.y) > healRange
      ) {
        continue
      }
      const pct = ally.maxHp > 0 ? ally.hp / ally.maxHp : 1
      if (pct < lowestPct) {
        lowestPct = pct
        healTarget = ally
      }
    }
    if (healTarget !== undefined) {
      const healFrac =
        0.25 + 0.03 * Math.max(1, healEntry.level) + 0.05 * this.difficulty
      const heal = Math.max(4, Math.floor(healTarget.maxHp * healFrac))
      const nextHp = Math.min(healTarget.maxHp, healTarget.hp + heal)
      if (nextHp > healTarget.hp) {
        healTarget.hp = nextHp
        this.monsterCombat.get(healTarget.unitId)?.statList.setHp256(healTarget.hp * FIXED_ONE)
        const healMode = this.monsterSkillMode(healEntry.mode)
        monster.mode = healMode
        const atPt = { x: Math.round(healTarget.x), y: Math.round(healTarget.y) }
        this.broadcastToArea(monster.areaId, {
          type: 'UnitMode',
          unitType: 1,
          id: monster.unitId,
          mode: healMode,
          at: atPt,
          lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
        })
        this.broadcastToArea(monster.areaId, {
          type: 'SkillCast',
          caster: { unitType: 1, id: monster.unitId },
          skill: healEntry.skillId,
          skillId: healEntry.skillId,
          level: Math.max(1, healEntry.level),
          target: { unitType: 1, id: healTarget.unitId },
          at: atPt,
        })
        this.broadcastToArea(healTarget.areaId, {
          type: 'UnitStatUpdate',
          unitType: 'monster',
          unitId: healTarget.unitId,
          statId: 6,
          value: healTarget.hp,
        })
        this.setMonsterSkillCooldown(monster, healDelay)
        return true
      }
    }
  }
  for (const entry of monster.skills) {
    if (entry.skillId === undefined) continue
    if (
      entry.skillId === 181 ||
      entry.skillId === 327 ||
      entry.skillId === 183 ||
      entry.skillId === 190 ||
      entry.skillId === 158
    ) {
      continue
    }
    const skill = this.registry.getSkillById(entry.skillId)
    const name = skill?.name.toLowerCase() ?? ''
    if (entry.skillId === 179 || entry.skillId === 182 || /(?:^|\b)(?:heal|bestow)/.test(name)) {
      continue
    }
    if (entry.skillId === 290 && !healOrWhipOnly) {
      // Overseer `Cry Help`: rally nearby un-rallied allies onto the current target.
      const nearest = this.players.values()
      let nearestPlayer: InternalPlayerRecord | undefined
      let nearestDist = Infinity
      for (const player of nearest) {
        if (player.dead || player.areaId !== monster.areaId) continue
        const dist = Math.hypot(player.x - monster.x, player.y - monster.y)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestPlayer = player
        }
      }
      if (nearestPlayer === undefined) continue
      let rallied = 0
      for (const ally of this.monsters.values()) {
        if (
          ally.dead ||
          ally.isNpc ||
          ally.unitId === monster.unitId ||
          ally.areaId !== monster.areaId ||
          ally.threatUntilFrame > this.currentFrame ||
          Math.hypot(ally.x - monster.x, ally.y - monster.y) > 20
        ) {
          continue
        }
        ally.threatPlayerId = nearestPlayer.unitId
        ally.threatUntilFrame = this.currentFrame + 150
        rallied++
      }
      if (rallied <= 0) continue
      const cryMode = this.monsterSkillMode(entry.mode)
      monster.mode = cryMode
      this.broadcastToArea(monster.areaId, {
        type: 'UnitMode',
        unitType: 1,
        id: monster.unitId,
        mode: cryMode,
        at: { x: Math.round(nearestPlayer.x), y: Math.round(nearestPlayer.y) },
        lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
      })
      this.setMonsterSkillCooldown(monster, skill?.delay ?? '50')
      return true
    }
    if (entry.skillId === 295) {
      // Overseer `Overseer Whip` (`D2Game.dll` `0x6fc2d9c0`, `srvdofunc=131`, `Param1=65`, #1824, #1894):
      // - Heals wounded ally by 25% `maxHp` (unless Prevent Monster Heal `state 52`),
      // - Buffs ally with `bloodlust` (state 140: +50% velocity & +50% attack rate, 250 frames),
      // - 35% chance on `minion1..8` (`hcIdx 453..460`): transforms in-place into `suicideminion1..8` (`461..468`)!
      let whipTarget: InternalMonsterRecord | undefined
      let bestWhipDist = 14
      for (const ally of this.monsters.values()) {
        if (
          ally.dead ||
          ally.isNpc ||
          ally.unitId === monster.unitId ||
          ally.areaId !== monster.areaId
        ) {
          continue
        }
        const isTransformableMinion = ally.hcIdx >= 453 && ally.hcIdx <= 460
        if (!isTransformableMinion && ally.states.has(140) && ally.hp >= ally.maxHp) {
          continue
        }
        const d = Math.hypot(ally.x - monster.x, ally.y - monster.y)
        if (
          d <= bestWhipDist &&
          (whipTarget === undefined ||
            isTransformableMinion ||
            ally.monType === 'minion')
        ) {
          bestWhipDist = d
          whipTarget = ally
        }
      }
      if (whipTarget === undefined) continue
      if (!whipTarget.states.has(52) && whipTarget.hp < whipTarget.maxHp) {
        whipTarget.hp = Math.min(
          whipTarget.maxHp,
          whipTarget.hp + Math.max(4, Math.floor(whipTarget.maxHp * 0.25)),
        )
        this.monsterCombat.get(whipTarget.unitId)?.statList.setHp256(whipTarget.hp * FIXED_ONE)
        this.broadcastToArea(whipTarget.areaId, {
          type: 'UnitStatUpdate',
          unitType: 'monster',
          unitId: whipTarget.unitId,
          statId: 6,
          value: whipTarget.hp,
        })
      }
      this.applyMonsterState(whipTarget.unitId, 140, 250)
      if (whipTarget.hcIdx >= 453 && whipTarget.hcIdx <= 460 && this.rng.rand(100) < 35) {
        const newHcIdx = whipTarget.hcIdx + 8
        const newDefId = `suicideminion${String(newHcIdx - 460)}`
        whipTarget.hcIdx = newHcIdx
        whipTarget.classId = newHcIdx
        whipTarget.defId = newDefId
        whipTarget.ai = 'SuicideMinion'
        whipTarget.aiDelay = Math.min(whipTarget.aiDelay, 5)
        whipTarget.cooldownTicks = Math.min(whipTarget.cooldownTicks, 5)
        whipTarget.velocity = Math.max(whipTarget.velocity, 10)
        whipTarget.runSpeed = Math.max(whipTarget.runSpeed, 14)
        whipTarget.minDmg = Math.max(whipTarget.minDmg * 3, 100)
        whipTarget.maxDmg = Math.max(whipTarget.maxDmg * 3, 150)
        if (!whipTarget.umodIds.includes(MON_UMOD.SUICIDEMINION)) {
          whipTarget.umodIds = [...whipTarget.umodIds, MON_UMOD.SUICIDEMINION]
        }
        this.applyMonsterState(whipTarget.unitId, 142, 2500)
        this.broadcastToArea(whipTarget.areaId, this.buildMonsterUnitAssignEvent(whipTarget))
      }
      monster.mode = 5
      const whipPt = { x: Math.round(whipTarget.x), y: Math.round(whipTarget.y) }
      this.broadcastToArea(monster.areaId, {
        type: 'UnitMode',
        unitType: 1,
        id: monster.unitId,
        mode: 5,
        at: whipPt,
        lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
      })
      this.broadcastToArea(monster.areaId, {
        type: 'SkillCast',
        caster: { unitType: 1, id: monster.unitId },
        skill: 295,
        skillId: 295,
        level: Math.max(1, entry.level),
        target: { unitType: 1, id: whipTarget.unitId },
        at: whipPt,
      })
      this.setMonsterSkillCooldown(monster, skill?.delay ?? '35')
      return true
    }
    if (healOrWhipOnly) {
      continue
    }
    if (entry.skillId === 54 || entry.skillId === 212 || /teleport/.test(name)) {
      const tx = monster.x + (target.x - monster.x) * 0.6
      const ty = monster.y + (target.y - monster.y) * 0.6
      if (
        this.isClosedDoorAt(monster.areaId, Math.round(tx), Math.round(ty)) ||
        (this.terrainWalkableCheck &&
          !this.terrainWalkableCheck(monster.areaId, Math.round(tx), Math.round(ty), monster.isFlying)) ||
        this.isMonsterCellOccupied(monster, tx, ty)
      ) {
        continue
      }
      const from = { x: Math.round(monster.x), y: Math.round(monster.y) }
      monster.x = tx
      monster.y = ty
      monster.path = []
      monster.pathIndex = 0
      monster.pathTargetX = Number.NaN
      monster.pathTargetY = Number.NaN
      this.broadcastToArea(monster.areaId, {
        type: 'UnitMove',
        unitType: 'monster',
        id: monster.unitId,
        unitId: monster.unitId,
        mode: 'run',
        from,
        to: { x: Math.round(tx), y: Math.round(ty) },
        x: Math.round(tx),
        y: Math.round(ty),
        currentX: Math.round(tx),
        currentY: Math.round(ty),
        targetX: Math.round(tx),
        targetY: Math.round(ty),
        areaId: monster.areaId,
      })
      this.setMonsterSkillCooldown(monster, skill?.delay ?? '35')
      return true
    }
    if (skill !== undefined && skill.summon !== '') {
      const summonMode = this.monsterSkillMode(entry.mode)
      monster.mode = summonMode
      this.broadcastToArea(monster.areaId, {
        type: 'UnitMode',
        unitType: 1,
        id: monster.unitId,
        mode: summonMode,
        at: { x: Math.round(target.x), y: Math.round(target.y) },
        lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
      })
      try {
        this.spawnMonster({
          defId: skill.summon,
          x: target.x,
          y: target.y,
          areaId: monster.areaId,
          level: monster.level,
          experience: 0,
          bossUnitId: monster.unitId,
        })
      } catch {
        continue
      }
      this.setMonsterSkillCooldown(monster, skill.delay)
      return true
    }
    if (skill !== undefined) {
      const stateName = skill.auraState !== '' ? skill.auraState : skill.state1
      if (stateName !== '') {
        const state = this.registry.getStateByName(stateName)
        if (state === undefined) continue
        this.applyMonsterState(monster.unitId, state.id, 100)
        const stateMode = this.monsterSkillMode(entry.mode)
        monster.mode = stateMode
        this.broadcastToArea(monster.areaId, {
          type: 'UnitMode',
          unitType: 1,
          id: monster.unitId,
          mode: stateMode,
          at: { x: Math.round(monster.x), y: Math.round(monster.y) },
          lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
        })
        this.setMonsterSkillCooldown(monster, skill.delay)
        return true
      }
    }
    if (distance > 20) continue
  }
  return false
}



function setMonsterSkillCooldown(this: GameInstanceHost, monster: InternalMonsterRecord, delay: string): void {
  const parsed = Number.parseInt(delay, 10)
  const raw =
    Number.isFinite(parsed) && parsed > 0
      ? parsed
      : Math.max(25, monster.cooldownTicks * 2)
  monster.skillCooldown =
    monster.monProps.fcrPct > 0
      ? Math.max(5, Math.floor((raw * 100) / (100 + monster.monProps.fcrPct)))
      : raw
}



/** Map `MonStats.txt Sk*Mode` onto the 1.13c unit mode ids. */
function monsterSkillMode(this: GameInstanceHost, mode?: string): number {
  switch ((mode ?? '').toUpperCase()) {
    case 'A1':
      return 4
    case 'A2':
      return 5
    case 'S1':
      return 8
    case 'S2':
      return 9
    case 'S3':
      return 10
    case 'S4':
      return 11
    case 'C':
      return 4
    case 'SC':
    case 'SQ':
      return 8
    default:
      return 8
  }
}



/** Despawn a temporary monster summon (`baalclone`, `baaltentacle`, `boneprison`, `hydra`) with zero XP/drops/quest side-effects. */
function despawnTemporaryMonsterUnit113c(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  deathMissileId?: number,
): void {
  if (deathMissileId !== undefined) {
    this.broadcastExplosionMissile(monster, deathMissileId)
  }
  this.monsters.delete(monster.unitId)
  this.monsterCombat.delete(monster.unitId)
  this.broadcastToArea(monster.areaId, {
    type: 'UnitRemove',
    unitType: 'monster',
    id: monster.unitId,
    unitId: monster.unitId,
    areaId: monster.areaId,
  })
}



/** Immediately despawn `#570 baalclone` & `#562..566 baaltentacle1..5` when real `#544 baalcrab` / `#709 uberbaal` dies (#1826). */
function despawnBaalMinionsOnBossDeath113c(this: GameInstanceHost, baal: InternalMonsterRecord): void {
  for (const other of [...this.monsters.values()]) {
    if (
      other.bossUnitId === baal.unitId &&
      (other.hcIdx === 570 || isBaalTentacleHcIdx113c(other.hcIdx))
    ) {
      this.despawnTemporaryMonsterUnit113c(other, other.hcIdx === 570 ? 614 : undefined)
    }
  }
  baal.activeBaalCloneUnitId = 0
}



function emitBossSkillCast113c(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  skillId: number,
  slvl: number,
  mode: number,
  targetX: number,
  targetY: number,
  targetRef?: { readonly unitType: 0 | 1; readonly id: number },
): void {
  monster.mode = mode
  const mx = Math.round(monster.x)
  const my = Math.round(monster.y)
  const tx = Math.round(targetX)
  const ty = Math.round(targetY)
  this.broadcastToArea(monster.areaId, {
    type: 'UnitMode',
    unitType: 1,
    id: monster.unitId,
    mode,
    at: { x: tx, y: ty },
    lifePct: monster.maxHp > 0 ? Math.max(0, Math.round((monster.hp / monster.maxHp) * 128)) : 0,
  })
  this.broadcastToArea(monster.areaId, {
    type: 'SkillCast',
    caster: { unitType: 1, id: monster.unitId },
    skill: skillId,
    skillId,
    level: Math.max(1, slvl),
    target: targetRef ?? { x: tx, y: ty },
    at: { x: tx, y: ty },
    from: { x: mx, y: my },
  } as ServerEvent)
}



/** Emit a 1.13c monster/boss projectile with explicit origin, velocity, range, pierce, and `nextDelay` (works with or without MPQ registry). */
function emitBossProjectile113c(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  spec: {
    readonly missileId: number
    readonly skillId: number
    readonly slvl: number
    readonly originX: number
    readonly originY: number
    readonly targetX: number
    readonly targetY: number
    readonly speedSubTilesPerFrame: number
    readonly rangeFrames: number
    readonly size?: number | undefined
    readonly collideType?: number | undefined
    readonly pierce?: boolean | undefined
    readonly nextHit?: boolean | undefined
    readonly nextDelay?: number | undefined
    readonly element: MissileDamageChannel
    readonly physDamage: number
    readonly elemDamage: number
    readonly elemDurationFrames?: number | undefined
    readonly guaranteedHit?: boolean | undefined
    readonly hitMonsters?: boolean | undefined
  },
): number {
  const rec = this.registry.getMissileById(spec.missileId)
  const dx = spec.targetX - spec.originX
  const dy = spec.targetY - spec.originY
  const dist = Math.max(0.25, Math.hypot(dx, dy))
  const rawSpeed =
    rec !== undefined && rec.vel > 0
      ? (rec.vel + Math.trunc((rec.velLev * spec.slvl) / 8)) / 16
      : spec.speedSubTilesPerFrame
  const speed = monster.states.has(STATE_SLOWMISSILES_113C) ? rawSpeed * 0.33 : rawSpeed
  const rangeFrames =
    rec !== undefined && rec.range > 0
      ? Math.max(2, rec.range + rec.levRange * spec.slvl)
      : Math.max(2, spec.rangeFrames)
  const physDamage = Math.max(0, Math.floor(spec.physDamage))
  const elemDamage = Math.max(0, Math.floor(spec.elemDamage))
  const totalDamage = Math.max(1, physDamage + elemDamage)
  const missileUnitId = this.allocateUnitId(UNIT_TYPE_113C.missile)
  const missile: InternalMissileRecord = {
    unitId: missileUnitId,
    missileId: spec.missileId,
    skillId: spec.skillId,
    ownerType: 'monster',
    ownerId: monster.unitId,
    areaId: monster.areaId,
    x: spec.originX,
    y: spec.originY,
    vx: speed > 0 ? (dx / dist) * speed : 0,
    vy: speed > 0 ? (dy / dist) * speed : 0,
    damage: totalDamage,
    remainingFrames: rangeFrames,
    collideType: rec?.collideType ?? spec.collideType ?? 3,
    size: Math.max(1, rec?.size ?? spec.size ?? 2),
    pierce: (rec !== undefined && !rec.collideKill) || spec.pierce === true,
    nextHit: rec?.nextHit === true || spec.nextHit === true,
    nextDelay: Math.max(0, rec?.nextDelay ?? spec.nextDelay ?? 0),
    element: spec.element,
    physDamage,
    elemDamage,
    elemDurationFrames: Math.max(0, spec.elemDurationFrames ?? 0),
    hitCooldowns: new Map(),
    guaranteedHit: spec.guaranteedHit === true,
    ...(spec.hitMonsters === true ? { hitMonsters: true } : {}),
  }
  this.missiles.set(missileUnitId, missile)
  this.broadcastToArea(monster.areaId, {
    type: 'CreateMissile',
    missileId: missileUnitId,
    missileClassId: spec.missileId,
    at: { x: Math.round(spec.originX), y: Math.round(spec.originY) },
    target: { x: Math.round(spec.targetX), y: Math.round(spec.targetY) },
    x: Math.round(spec.originX),
    y: Math.round(spec.originY),
    targetX: Math.round(spec.targetX),
    targetY: Math.round(spec.targetY),
    skillId: spec.skillId,
    level: Math.max(1, spec.slvl),
    ownerType: 1,
    ownerUnitType: 'monster',
    ownerId: monster.unitId,
    sourceUnitId: monster.unitId,
    areaId: monster.areaId,
  } as ServerEvent)
  return missileUnitId
}



/** Push a player away from `(fromX, fromY)` up to `maxSteps` walkable sub-tiles (1.13c Smite / Charge / Hoarfrost knockback). */
function knockbackPlayerFromBoss113c(this: GameInstanceHost, 
  player: InternalPlayerRecord,
  fromX: number,
  fromY: number,
  maxSteps = 3,
): boolean {
  if (player.dead) return false
  const dx = player.x - fromX
  const dy = player.y - fromY
  const d = Math.hypot(dx, dy)
  const dirX = d > 0.01 ? dx / d : 1
  const dirY = d > 0.01 ? dy / d : 0
  let endX = player.x
  let endY = player.y
  for (let step = 1; step <= maxSteps; step++) {
    const cx = player.x + dirX * step
    const cy = player.y + dirY * step
    if (!this.isWorldWalkableForPlayer(player.areaId, Math.round(cx), Math.round(cy))) {
      break
    }
    endX = cx
    endY = cy
  }
  if (Math.hypot(endX - player.x, endY - player.y) < 0.25) return false
  player.x = endX
  player.y = endY
  player.targetX = endX
  player.targetY = endY
  this.broadcastToArea(player.areaId, {
    type: 'UnitReassign',
    unitType: 0,
    id: player.unitId,
    unitId: player.unitId,
    at: { x: Math.round(endX), y: Math.round(endY) },
    x: Math.round(endX),
    y: Math.round(endY),
    snap: true,
  })
  return true
}



/** Apply direct boss/monster combat skill damage + optional chill, stun, and knockback to a hostile player, merc, or pet. */
function dealMonsterDirectHitToHostile113c(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  target:
    | { readonly kind: 'player'; readonly player: InternalPlayerRecord }
    | { readonly kind: 'merc'; readonly merc: InternalMercenaryRecord }
    | { readonly kind: 'pet'; readonly pet: SummonedPetUnit },
  parts: {
    readonly phys?: number | undefined
    readonly fire?: number | undefined
    readonly cold?: number | undefined
    readonly light?: number | undefined
    readonly magic?: number | undefined
  },
  effects?: {
    readonly chillFrames?: number | undefined
    readonly stunFrames?: number | undefined
    readonly knockbackSteps?: number | undefined
    readonly knockbackOriginX?: number | undefined
    readonly knockbackOriginY?: number | undefined
  },
): void {
  if (target.kind === 'player') {
    const p = target.player
    if (p.dead) return
    const elemTotal =
      (parts.phys ?? 0) + (parts.fire ?? 0) + (parts.cold ?? 0) + (parts.light ?? 0)
    if (elemTotal > 0) {
      this.applyPlayerElementalDamage(
        p,
        {
          phys: parts.phys,
          fire: parts.fire,
          cold: parts.cold,
          light: parts.light,
        },
        { killerType: 'monster', killerUnitId: monster.unitId },
      )
    }
    if ((parts.magic ?? 0) > 0 && !p.dead) {
      this.applyDamageToPlayer(p, Math.max(1, Math.round(parts.magic!)), {
        killerType: 'monster',
        killerUnitId: monster.unitId,
      })
    }
    if (!p.dead) {
      if ((effects?.chillFrames ?? 0) > 0) {
        this.applyUnitState(
          p.states,
          p.stateTimers,
          'player',
          p.unitId,
          p.areaId,
          11,
          effects!.chillFrames!,
        )
      }
      if ((effects?.stunFrames ?? 0) > 0) {
        this.applyUnitState(
          p.states,
          p.stateTimers,
          'player',
          p.unitId,
          p.areaId,
          21,
          effects!.stunFrames!,
        )
      }
      if ((effects?.knockbackSteps ?? 0) > 0) {
        this.knockbackPlayerFromBoss113c(
          p,
          effects?.knockbackOriginX ?? monster.x,
          effects?.knockbackOriginY ?? monster.y,
          effects!.knockbackSteps!,
        )
      }
    }
    return
  }
  const rawTotal = Math.max(
    1,
    Math.round(
      (parts.phys ?? 0) +
        (parts.fire ?? 0) +
        (parts.cold ?? 0) +
        (parts.light ?? 0) +
        (parts.magic ?? 0),
    ),
  )
  if (target.kind === 'merc') {
    this.applyDamageToMerc(target.merc, rawTotal, monster.areaId)
    return
  }
  this.applyDamageToSummon(target.pet, rawTotal, monster.areaId)
}



/** Enumerate all living hostile units (players, mercs, pets) in `monster.areaId`. */
function listHostilesInMonsterArea113c(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
): (
  | { readonly kind: 'player'; readonly key: number; readonly x: number; readonly y: number; readonly player: InternalPlayerRecord }
  | { readonly kind: 'merc'; readonly key: number; readonly x: number; readonly y: number; readonly merc: InternalMercenaryRecord }
  | { readonly kind: 'pet'; readonly key: number; readonly x: number; readonly y: number; readonly pet: SummonedPetUnit }
)[] {
  const out: (
    | { readonly kind: 'player'; readonly key: number; readonly x: number; readonly y: number; readonly player: InternalPlayerRecord }
    | { readonly kind: 'merc'; readonly key: number; readonly x: number; readonly y: number; readonly merc: InternalMercenaryRecord }
    | { readonly kind: 'pet'; readonly key: number; readonly x: number; readonly y: number; readonly pet: SummonedPetUnit }
  )[] = []
  for (const p of this.players.values()) {
    if (!p.dead && p.areaId === monster.areaId) {
      out.push({ kind: 'player', key: p.unitId, x: p.x, y: p.y, player: p })
    }
  }
  for (const merc of this.mercenaries.values()) {
    if (!merc.alive || merc.areaId !== monster.areaId) continue
    const owner = this.players.get(merc.ownerPlayerId)
    if (owner && !owner.dead && owner.areaId === monster.areaId) {
      out.push({ kind: 'merc', key: 100000 + merc.unitId, x: merc.x, y: merc.y, merc })
    }
  }
  for (const [ownerId, mgr] of this.summonManagers) {
    const owner = this.players.get(ownerId)
    if (!owner || owner.dead || owner.areaId !== monster.areaId) continue
    for (const pet of mgr.getActivePets()) {
      if (pet.alive !== false && pet.hp > 0) {
        out.push({
          kind: 'pet',
          key: 200000 + (this.petUnitIds.get(pet.uid) ?? 0),
          x: pet.x,
          y: pet.y,
          pet,
        })
      }
    }
  }
  return out
}



/**
 * Per-tick boss channel, Hoarfrost V-wedge, Armageddon meteor, and summon lifespan stepper (#1825, #1826, #1827).
 * Returns `true` when the monster despawned or is locked in an active multi-frame boss channel.
 */
function stepBossChannelsAndSummonLifespans113c(this: GameInstanceHost, monster: InternalMonsterRecord): boolean {
  if (monster.despawnAtFrame > 0 && this.currentFrame >= monster.despawnAtFrame) {
    this.despawnTemporaryMonsterUnit113c(monster, monster.hcIdx === 570 ? 614 : undefined)
    return true
  }
  if (
    (monster.hcIdx === 570 || isBaalTentacleHcIdx113c(monster.hcIdx)) &&
    monster.bossUnitId !== undefined
  ) {
    const parent = this.monsters.get(monster.bossUnitId)
    if (parent === undefined || parent.dead) {
      this.despawnTemporaryMonsterUnit113c(monster, monster.hcIdx === 570 ? 614 : undefined)
      return true
    }
  }

  // `#349 Diablogeddon` (`Armageddon`) periodic meteor impacts on `#333 diabloclone` / `#705 uberdiablo` (#1825).
  if (monster.diablogeddonUntilFrame > this.currentFrame && this.currentFrame % 12 === 0) {
    const near = this.nearestHostileForMonster(monster, 18)
    const jitterX = (this.rng.rand(7) - 3) * 0.8
    const jitterY = (this.rng.rand(7) - 3) * 0.8
    const mx = (near?.x ?? monster.x) + jitterX
    const my = (near?.y ?? monster.y) + jitterY
    this.emitBossProjectile113c(monster, {
      missileId: 674,
      skillId: 349,
      slvl: 10 + this.difficulty * 2,
      originX: mx,
      originY: my,
      targetX: mx,
      targetY: my,
      speedSubTilesPerFrame: 0,
      rangeFrames: 18,
      size: 2,
      collideType: 0,
      nextHit: true,
      nextDelay: 6,
      element: 'fire',
      physDamage: this.rollInclusive(25, 45),
      elemDamage: this.rollInclusive(60, 100) + 25 * this.difficulty,
    })
  }

  // Baal `#318 Baal Cold Missiles` (`Hoarfrost`) expanding V-wedge wave (#1826).
  if (monster.activeHoarfrostWaves !== undefined && monster.activeHoarfrostWaves.length > 0) {
    const hostiles = this.listHostilesInMonsterArea113c(monster)
    for (const wave of monster.activeHoarfrostWaves) {
      wave.x += wave.vx
      wave.y += wave.vy
      wave.stepDone += 1
      wave.remainingSteps -= 1
      const halfWidth = 1.5 + wave.stepDone * 0.45
      const speedNorm = Math.max(0.01, Math.hypot(wave.vx, wave.vy))
      const dirX = wave.vx / speedNorm
      const dirY = wave.vy / speedNorm
      if (wave.stepDone % 2 === 1) {
        for (const side of [-1, 1] as const) {
          const lx = wave.x + wave.perpX * halfWidth * side
          const ly = wave.y + wave.perpY * halfWidth * side
          this.broadcastToArea(monster.areaId, {
            type: 'CreateMissile',
            missileId: this.allocateUnitId(UNIT_TYPE_113C.missile),
            missileClassId: 590,
            at: { x: Math.round(lx), y: Math.round(ly) },
            target: { x: Math.round(lx + wave.vx), y: Math.round(ly + wave.vy) },
            x: Math.round(lx),
            y: Math.round(ly),
            targetX: Math.round(lx + wave.vx),
            targetY: Math.round(ly + wave.vy),
            skillId: 318,
            level: wave.slvl,
            ownerType: 1,
            ownerUnitType: 'monster',
            ownerId: monster.unitId,
            sourceUnitId: monster.unitId,
            areaId: monster.areaId,
          } as ServerEvent)
        }
      }
      for (const h of hostiles) {
        if (wave.hitUnits.has(h.key)) continue
        const rx = h.x - wave.x
        const ry = h.y - wave.y
        const along = rx * dirX + ry * dirY
        const lat = Math.abs(rx * wave.perpX + ry * wave.perpY)
        if (Math.abs(along) <= 1.8 && lat <= halfWidth) {
          wave.hitUnits.add(h.key)
          const coldDmg =
            this.rollInclusive(20, 40) +
            9 * Math.max(0, wave.slvl - 1) +
            25 * this.difficulty
          const kbSteps = this.rng.rand(100) < 75 ? 3 : 0
          this.dealMonsterDirectHitToHostile113c(
            monster,
            h,
            { cold: coldDmg },
            {
              chillFrames: 200 + 25 * wave.slvl,
              knockbackSteps: kbSteps,
              knockbackOriginX: monster.x,
              knockbackOriginY: monster.y,
            },
          )
        }
      }
    }
    monster.activeHoarfrostWaves = monster.activeHoarfrostWaves.filter(
      (w) => w.remainingSteps > 0,
    )
  }

  const ch = monster.activeBossChannel
  if (ch === undefined) return false
  if (ch.remainingFrames <= 0) {
    monster.activeBossChannel = undefined
    if (monster.mode !== 1) monster.mode = 1
    return false
  }
  ch.remainingFrames -= 1

  const nearHostile = this.nearestHostileForMonster(monster, 35)
  if (nearHostile !== null && (ch.kind === 'diablight' || ch.kind === 'baalinferno')) {
    const desired = Math.atan2(nearHostile.y - monster.y, nearHostile.x - monster.x)
    let delta = desired - ch.angle
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    const maxTurn = ch.kind === 'diablight' ? 0.08 : 0.06
    ch.angle += Math.max(-maxTurn, Math.min(maxTurn, delta))
  }

  if (ch.kind === 'diablight') {
    // 1.13c `#193 DiabLight` (`0x6FCD6840`, #1825): 40-frame channel, stream pulse every 2 frames.
    // Normal (`startOffset = 0`) hits point-blank; NM/Hell (`startOffset = 5.5` sub-tiles) leaves `< 4.5` inside the blind spot!
    if (ch.remainingFrames % 2 === 0) {
      const cos = Math.cos(ch.angle)
      const sin = Math.sin(ch.angle)
      const beamEnd = 24
      const ox = monster.x + cos * ch.startOffset
      const oy = monster.y + sin * ch.startOffset
      const ex = monster.x + cos * beamEnd
      const ey = monster.y + sin * beamEnd
      this.broadcastToArea(monster.areaId, {
        type: 'CreateMissile',
        missileId: this.allocateUnitId(UNIT_TYPE_113C.missile),
        missileClassId: 172,
        at: { x: Math.round(ox), y: Math.round(oy) },
        target: { x: Math.round(ex), y: Math.round(ey) },
        x: Math.round(ox),
        y: Math.round(oy),
        targetX: Math.round(ex),
        targetY: Math.round(ey),
        skillId: 193,
        level: ch.slvl,
        ownerType: 1,
        ownerUnitType: 'monster',
        ownerId: monster.unitId,
        sourceUnitId: monster.unitId,
        areaId: monster.areaId,
      } as ServerEvent)
      for (const h of this.listHostilesInMonsterArea113c(monster)) {
        const nextReady = ch.nextHitFrames.get(h.key) ?? 0
        if (this.currentFrame < nextReady) continue
        const rx = h.x - monster.x
        const ry = h.y - monster.y
        const proj = rx * cos + ry * sin
        const perp = Math.abs(-rx * sin + ry * cos)
        if (proj >= ch.startOffset && proj <= beamEnd && perp <= 1.75) {
          ch.nextHitFrames.set(h.key, this.currentFrame + 3)
          const physDmg = this.rollInclusive(12, 22) + 5 * ch.slvl
          const ltngDmg = this.rollInclusive(22, 48) + 9 * ch.slvl
          this.dealMonsterDirectHitToHostile113c(monster, h, {
            phys: physDmg,
            light: ltngDmg,
          })
        }
      }
    }
    if (ch.remainingFrames <= 0) {
      monster.activeBossChannel = undefined
      monster.mode = 1
    }
    return true
  }

  if (ch.kind === 'baalinferno') {
    // 1.13c `#317 Baal Inferno` (`Mana Rift`, `SrvHit55` `0x6FC5FD60`, #1826): Magic beam + 50% current Mana drain.
    if (ch.remainingFrames % 2 === 0) {
      const cos = Math.cos(ch.angle)
      const sin = Math.sin(ch.angle)
      const beamEnd = 16
      const ex = monster.x + cos * beamEnd
      const ey = monster.y + sin * beamEnd
      this.broadcastToArea(monster.areaId, {
        type: 'CreateMissile',
        missileId: this.allocateUnitId(UNIT_TYPE_113C.missile),
        missileClassId: 554,
        at: { x: Math.round(monster.x), y: Math.round(monster.y) },
        target: { x: Math.round(ex), y: Math.round(ey) },
        x: Math.round(monster.x),
        y: Math.round(monster.y),
        targetX: Math.round(ex),
        targetY: Math.round(ey),
        skillId: 317,
        level: ch.slvl,
        ownerType: 1,
        ownerUnitType: 'monster',
        ownerId: monster.unitId,
        sourceUnitId: monster.unitId,
        areaId: monster.areaId,
      } as ServerEvent)
      for (const h of this.listHostilesInMonsterArea113c(monster)) {
        const nextReady = ch.nextHitFrames.get(h.key) ?? 0
        if (this.currentFrame < nextReady) continue
        const rx = h.x - monster.x
        const ry = h.y - monster.y
        const proj = rx * cos + ry * sin
        const perp = Math.abs(-rx * sin + ry * cos)
        if (proj >= 0.5 && proj <= beamEnd && perp <= 2.0) {
          ch.nextHitFrames.set(h.key, this.currentFrame + 4)
          const magicDmg =
            this.rollInclusive(32, 52) + 10 * ch.slvl + 15 * this.difficulty
          this.dealMonsterDirectHitToHostile113c(monster, h, { magic: magicDmg })
          if (h.kind === 'player' && !h.player.dead && h.player.manaFixed > 0) {
            const drained = Math.floor(h.player.manaFixed / 2)
            h.player.manaFixed = Math.max(0, h.player.manaFixed - drained)
            h.player.mana = Math.floor(h.player.manaFixed / FIXED_ONE)
            this.emitToPlayer(h.player.unitId, {
              type: 'UnitStatUpdate',
              unitType: 'player',
              unitId: h.player.unitId,
              statId: 8,
              value: h.player.manaFixed,
            })
            this.emitToPlayer(h.player.unitId, {
              type: 'LifeMana',
              life: h.player.hp,
              mana: h.player.mana,
              stamina: h.player.stamina,
              at: playerWirePosition(h.player),
              vx: 0,
              vy: 0,
            })
          }
        }
      }
    }
    if (ch.remainingFrames <= 0) {
      monster.activeBossChannel = undefined
      monster.mode = 1
    }
    return true
  }

  // Talic `#151 Whirlwind` (`#540 ancientbarb1`, #1827): continuous spin-through-target movement + 4-frame multi-hits.
  const vx = ch.stepVx ?? Math.cos(ch.angle) * 0.9
  const vy = ch.stepVy ?? Math.sin(ch.angle) * 0.9
  const nx = monster.x + vx
  const ny = monster.y + vy
  if (
    !this.isClosedDoorAt(monster.areaId, Math.round(nx), Math.round(ny)) &&
    (!this.terrainWalkableCheck ||
      this.terrainWalkableCheck(monster.areaId, Math.round(nx), Math.round(ny), false)) &&
    !this.isBlockedByBonePrison(monster.areaId, nx, ny)
  ) {
    const from = { x: Math.round(monster.x), y: Math.round(monster.y) }
    monster.x = nx
    monster.y = ny
    this.broadcastToArea(monster.areaId, {
      type: 'UnitMove',
      unitType: 'monster',
      id: monster.unitId,
      unitId: monster.unitId,
      mode: 'run',
      from,
      to: { x: Math.round(nx), y: Math.round(ny) },
      x: Math.round(nx),
      y: Math.round(ny),
      currentX: Math.round(nx),
      currentY: Math.round(ny),
      targetX: Math.round(ch.targetX),
      targetY: Math.round(ch.targetY),
      areaId: monster.areaId,
    })
  }
  for (const h of this.listHostilesInMonsterArea113c(monster)) {
    const nextReady = ch.nextHitFrames.get(h.key) ?? 0
    if (this.currentFrame < nextReady) continue
    if (Math.hypot(h.x - monster.x, h.y - monster.y) <= 3.1) {
      ch.nextHitFrames.set(h.key, this.currentFrame + 4)
      const wwDmg = Math.max(
        4,
        Math.round(
          this.rollInclusive(monster.minDmg, monster.maxDmg) *
            (1 + (50 + Math.max(0, ch.slvl - 1) * 8) / 100),
        ),
      )
      this.dealMonsterDirectHitToHostile113c(monster, h, { phys: wwDmg })
    }
  }
  if (ch.remainingFrames <= 0) {
    monster.activeBossChannel = undefined
    monster.mode = 1
  }
  return true
}



/** Spawn 16 `boneprison1..4` (`hcIdx 340..343`, `0` XP/drops, 600-frame lifespan) around `(cx, cy)` (`#199 DiabPrison`, #1825). */
function spawnDiabloBonePrisonRing113c(this: GameInstanceHost, 
  diablo: InternalMonsterRecord,
  cx: number,
  cy: number,
  slvl: number,
): number {
  this.emitBossSkillCast113c(diablo, 199, slvl, 10, cx, cy)
  const radius = 2.8
  const segHp = Math.max(
    40,
    Math.round((80 + 60 * slvl) * (this.difficulty === 2 ? 4 : this.difficulty === 1 ? 2.2 : 1)),
  )
  let spawned = 0
  for (let i = 0; i < 16; i++) {
    const theta = (i / 16) * Math.PI * 2
    const sx = cx + Math.cos(theta) * radius
    const sy = cy + Math.sin(theta) * radius
    if (
      this.terrainWalkableCheck &&
      !this.terrainWalkableCheck(diablo.areaId, Math.round(sx), Math.round(sy), false)
    ) {
      continue
    }
    const segHcIdx = 340 + (i % 4)
    const segId = this.spawnMonster({
      classId: segHcIdx,
      hcIdx: segHcIdx,
      defId: `boneprison${String((i % 4) + 1)}`,
      ai: 'BoneWall',
      x: sx,
      y: sy,
      areaId: diablo.areaId,
      level: diablo.level,
      hp: segHp,
      maxHp: segHp,
      experience: 0,
      noRatio: true,
      velocity: 0,
      runSpeed: 0,
      bossUnitId: diablo.unitId,
    })
    const seg = this.monsters.get(segId)
    if (seg !== undefined) {
      seg.despawnAtFrame = this.currentFrame + 600
    }
    spawned += 1
  }
  return spawned
}



/**
 * 1.13c `AITHINK_Fn051_Diablo` (`D2Game.dll` `0x6FCCAF30`, `#243 diablo`, `#333 diabloclone`, `#705 uberdiablo`, #1825):
 * Executes Red Lightning Hose (`#193`, NM/Hell `< 4.5` blind spot), 32-bolt radial Fire Nova (`#195`),
 * Firestorm (`#197`), PrimeFirewall (`#188`), Cold Touch (`#194`), Four-Legged Charge (`#198`),
 * Bone Prison (`#199` on player AND active Chaos Sanctuary Town Portals `classId = 59`), and Diablogeddon (`#349`).
 */
function stepDiabloBossAi113c(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  const diffBonus = this.difficulty === 2 ? 4 : this.difficulty === 1 ? 2 : 0
  if (
    (monster.hcIdx === 333 || monster.hcIdx === 705) &&
    monster.diablogeddonUntilFrame <= this.currentFrame
  ) {
    const geddonSlvl = 5 + diffBonus
    monster.diablogeddonUntilFrame = this.currentFrame + 1000
    this.applyMonsterState(monster.unitId, 144, 1000)
    this.emitBossSkillCast113c(monster, 349, geddonSlvl, 8, monster.x, monster.y)
    monster.cooldown = Math.max(8, monster.cooldownTicks)
    return
  }

  const nearest = this.nearestHostileForMonster(monster, Math.max(35, monster.aggroRadius))
  if (nearest === null) return
  const dist = Math.hypot(nearest.x - monster.x, nearest.y - monster.y)

  if (monster.hcIdx === 705 && this.trySpawnUberPrimeMinion113c(monster, nearest)) {
    return
  }

  // 1.13c Town Portal trap (`0x6FCCAF30`): Diablo cages any un-trapped player Town Portal (`classId === 59`) within 85 sub-tiles!
  if (monster.skillCooldown <= 0) {
    for (const obj of this.objects.values()) {
      if (obj.areaId !== monster.areaId || obj.classId !== 59) continue
      if (Math.hypot(obj.x - monster.x, obj.y - monster.y) > 85) continue
      const alreadyCaged = [...this.monsters.values()].some(
        (m) =>
          !m.dead &&
          m.areaId === monster.areaId &&
          isBonePrisonMonsterHcIdx113c(m.hcIdx) &&
          Math.hypot(m.x - obj.x, m.y - obj.y) <= 5,
      )
      if (!alreadyCaged) {
        this.spawnDiabloBonePrisonRing113c(monster, obj.x, obj.y, 4 + diffBonus)
        monster.skillCooldown = 50
        monster.cooldown = Math.max(10, monster.cooldownTicks)
        return
      }
    }
  }

  if (monster.cooldown <= 0 && monster.skillCooldown <= 0) {
    const slot = monster.skillCursor % 7
    monster.skillCursor = (monster.skillCursor + 1) % 7

    // Close-range melee Cold Touch (`#194 DiabCold`) when target is un-chilled in melee range.
    const targetChilled =
      nearest.kind === 'player'
        ? nearest.player.states.has(11)
        : nearest.kind === 'merc'
          ? nearest.merc.states.has(11)
          : false
    if (dist <= 3.8 && (!targetChilled || slot === 4)) {
      const slvl = 3 + diffBonus
      this.emitBossSkillCast113c(monster, 194, slvl, 9, nearest.x, nearest.y)
      const magicDmg = this.rollInclusive(35, 55) + 12 * slvl + 20 * this.difficulty
      this.dealMonsterDirectHitToHostile113c(
        monster,
        nearest,
        { magic: magicDmg },
        { chillFrames: 100 + 50 * Math.max(0, slvl - 1) },
      )
      monster.cooldown = Math.max(10, monster.cooldownTicks)
      monster.skillCooldown = 18
      return
    }

    // Four-Legged Charge (`#198 DiabRun`) at mid/long range (`dist >= 6`).
    if (slot === 5 && dist >= 6 && dist <= 24) {
      const slvl = 5 + diffBonus
      this.emitBossSkillCast113c(monster, 198, slvl, 14, nearest.x, nearest.y)
      const dx = nearest.x - monster.x
      const dy = nearest.y - monster.y
      const d = Math.max(1, Math.hypot(dx, dy))
      const ux = dx / d
      const uy = dy / d
      let destX = monster.x
      let destY = monster.y
      const stopDist = Math.max(1, Math.floor(d - 1.5))
      for (let step = 1; step <= stopDist; step++) {
        const cx = monster.x + ux * step
        const cy = monster.y + uy * step
        if (
          this.isClosedDoorAt(monster.areaId, Math.round(cx), Math.round(cy)) ||
          (this.terrainWalkableCheck &&
            !this.terrainWalkableCheck(monster.areaId, Math.round(cx), Math.round(cy), false)) ||
          this.isBlockedByBonePrison(monster.areaId, cx, cy)
        ) {
          break
        }
        destX = cx
        destY = cy
      }
      const from = { x: Math.round(monster.x), y: Math.round(monster.y) }
      monster.x = destX
      monster.y = destY
      this.broadcastToArea(monster.areaId, {
        type: 'UnitMove',
        unitType: 'monster',
        id: monster.unitId,
        unitId: monster.unitId,
        mode: 'run',
        from,
        to: { x: Math.round(destX), y: Math.round(destY) },
        x: Math.round(destX),
        y: Math.round(destY),
        currentX: Math.round(destX),
        currentY: Math.round(destY),
        targetX: Math.round(destX),
        targetY: Math.round(destY),
        areaId: monster.areaId,
      })
      if (Math.hypot(nearest.x - monster.x, nearest.y - monster.y) <= 3.8) {
        const chargeDmg = this.rollInclusive(monster.minDmg, monster.maxDmg) + 55 + 10 * slvl
        this.dealMonsterDirectHitToHostile113c(
          monster,
          nearest,
          { phys: chargeDmg },
          { knockbackSteps: 3 },
        )
      }
      monster.cooldown = Math.max(12, monster.cooldownTicks)
      monster.skillCooldown = 25
      return
    }

    // Bone Prison (`#199 DiabPrison`) around ranged player target (`dist >= 4.5`).
    if (slot === 6 && nearest.kind === 'player' && dist >= 4.5 && dist <= 26) {
      const playerAlreadyCaged = [...this.monsters.values()].some(
        (m) =>
          !m.dead &&
          m.areaId === monster.areaId &&
          isBonePrisonMonsterHcIdx113c(m.hcIdx) &&
          Math.hypot(m.x - nearest.x, m.y - nearest.y) <= 4.5,
      )
      if (!playerAlreadyCaged) {
        this.spawnDiabloBonePrisonRing113c(monster, nearest.x, nearest.y, 4 + diffBonus)
        monster.cooldown = Math.max(12, monster.cooldownTicks)
        monster.skillCooldown = 50
        return
      }
    }

    // `#193 DiabLight` (Red Lightning Hose, 40 frames; NM/Hell blind spot `startOffset = 5.5` sub-tiles).
    if (slot === 0) {
      const slvl = 3 + diffBonus
      const angle = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      this.emitBossSkillCast113c(monster, 193, slvl, 8, nearest.x, nearest.y)
      monster.activeBossChannel = {
        kind: 'diablight',
        skillId: 193,
        slvl,
        remainingFrames: 40,
        angle,
        targetX: nearest.x,
        targetY: nearest.y,
        startOffset: this.difficulty >= 1 ? 5.5 : 0,
        nextHitFrames: new Map(),
      }
      monster.cooldown = 44
      monster.skillCooldown = 44
      return
    }

    // `#195 DiabFire` (32-bolt 360° radial Fire Nova, `diabfire` #176, `nextHit=true, nextDelay=4`).
    if (slot === 1) {
      const slvl = 4 + diffBonus
      this.emitBossSkillCast113c(monster, 195, slvl, 8, nearest.x, nearest.y)
      const fireDmg = this.rollInclusive(24, 48) + 8 * slvl + 15 * this.difficulty
      for (let i = 0; i < 32; i++) {
        const theta = (i / 32) * Math.PI * 2
        this.emitBossProjectile113c(monster, {
          missileId: 176,
          skillId: 195,
          slvl,
          originX: monster.x,
          originY: monster.y,
          targetX: monster.x + Math.cos(theta) * 28,
          targetY: monster.y + Math.sin(theta) * 28,
          speedSubTilesPerFrame: 30 / 16,
          rangeFrames: 50,
          size: 2,
          pierce: true,
          nextHit: true,
          nextDelay: 4,
          element: 'fire',
          physDamage: 0,
          elemDamage: fireDmg,
        })
      }
      monster.cooldown = Math.max(12, monster.cooldownTicks)
      monster.skillCooldown = 25
      return
    }

    // `#197 DiabWall` (Firestorm: diverging `diabwallmaker` #179 / `diabwall` #180 fire + phys ground streams).
    if (slot === 2) {
      const slvl = 3 + diffBonus
      this.emitBossSkillCast113c(monster, 197, slvl, 10, nearest.x, nearest.y)
      const baseAngle = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      const tongues = Math.min(5, Math.max(3, slvl))
      for (let t = 0; t < tongues; t++) {
        const spread = (t - (tongues - 1) / 2) * 0.22
        const ang = baseAngle + spread
        this.emitBossProjectile113c(monster, {
          missileId: 180,
          skillId: 197,
          slvl,
          originX: monster.x + Math.cos(ang) * 1.5,
          originY: monster.y + Math.sin(ang) * 1.5,
          targetX: monster.x + Math.cos(ang) * 18,
          targetY: monster.y + Math.sin(ang) * 18,
          speedSubTilesPerFrame: 20 / 16,
          rangeFrames: 24,
          size: 2,
          collideType: 8,
          pierce: true,
          nextHit: true,
          nextDelay: 4,
          element: 'fire',
          physDamage: this.rollInclusive(10, 20) + 3 * slvl,
          elemDamage: this.rollInclusive(20, 42) + 6 * slvl,
        })
      }
      monster.cooldown = Math.max(12, monster.cooldownTicks)
      monster.skillCooldown = 24
      return
    }

    // `#188 PrimeFirewall` (perpendicular wall of `vampirefirewall` #131 ground fire patches across target).
    {
      const slvl = 5 + diffBonus
      this.emitBossSkillCast113c(monster, 188, slvl, 10, nearest.x, nearest.y)
      const baseAngle = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      const perpX = -Math.sin(baseAngle)
      const perpY = Math.cos(baseAngle)
      const patchFire = this.rollInclusive(18, 34) + 5 * slvl + 10 * this.difficulty
      for (let k = -3; k <= 3; k++) {
        const px = nearest.x + perpX * k * 1.5
        const py = nearest.y + perpY * k * 1.5
        this.emitBossProjectile113c(monster, {
          missileId: 131,
          skillId: 188,
          slvl,
          originX: px,
          originY: py,
          targetX: px,
          targetY: py,
          speedSubTilesPerFrame: 0,
          rangeFrames: 75,
          size: 2,
          collideType: 0,
          pierce: true,
          nextHit: true,
          nextDelay: 5,
          element: 'fire',
          physDamage: 0,
          elemDamage: patchFire,
        })
      }
      monster.cooldown = Math.max(12, monster.cooldownTicks)
      monster.skillCooldown = 28
      return
    }
  }

  if (dist <= 3.5) {
    if (
      monster.cooldown <= 0 &&
      monster.pendingAttack === undefined &&
      monster.pendingAllyAttack === undefined
    ) {
      monster.cooldown = monster.cooldownTicks
      if (nearest.kind === 'player') {
        this.beginMonsterMeleeAttack(monster, nearest.player)
      } else if (nearest.kind === 'merc') {
        this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'merc', id: nearest.merc.unitId })
      } else {
        this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'pet', id: nearest.pet.uid })
      }
    }
  } else {
    this.moveMonsterToward(monster, nearest.x, nearest.y, dist > 5)
  }
}



/**
 * 1.13c `AITHINK_Fn135_BaalCrab` (`0x6FCCCBE0`) & `Fn137_BaalCrabClone` (`0x6FCCCA40`)
 * (`#544 baalcrab`, `#570 baalclone` Vile Effigy, `#709 uberbaal`, #1826).
 */
function stepBaalCrabBossAi113c(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  const isClone = monster.hcIdx === 570
  const isUber = monster.hcIdx === 709
  const diffBonus = this.difficulty === 2 ? 4 : this.difficulty === 1 ? 2 : 0

  if (isUber && !monster.states.has(20)) {
    this.applyMonsterState(monster.unitId, 20, 3600)
    this.emitBossSkillCast113c(monster, 60, 15 + diffBonus, 8, monster.x, monster.y)
    monster.cooldown = Math.max(8, monster.cooldownTicks)
    return
  }

  if (monster.activeBaalCloneUnitId !== 0) {
    const existingClone = this.monsters.get(monster.activeBaalCloneUnitId)
    if (existingClone === undefined || existingClone.dead) {
      monster.activeBaalCloneUnitId = 0
    }
  }

  const nearest = this.nearestHostileForMonster(monster, Math.max(35, monster.aggroRadius))
  if (nearest === null) return
  const dist = Math.hypot(nearest.x - monster.x, nearest.y - monster.y)

  if (isUber && this.trySpawnUberPrimeMinion113c(monster, nearest)) {
    return
  }

  if (monster.cooldown <= 0 && monster.skillCooldown <= 0) {
    const slot = monster.skillCursor % 6
    monster.skillCursor = (monster.skillCursor + 1) % 6

    // 1) Spawn Vile Effigy (`#570 baalclone`): ONLY real `#544 baalcrab` (`!isClone && !isUber`), max 1 active, up to 2 per fight!
    if (
      !isClone &&
      !isUber &&
      monster.activeBaalCloneUnitId === 0 &&
      monster.baalCloneSpawnCount < 2 &&
      slot === 0
    ) {
      let cx = nearest.x + 3
      let cy = nearest.y + 3
      for (const ang of [0.6, -0.6, 1.4, -1.4, 2.4, -2.4, Math.PI]) {
        const tx = nearest.x + Math.cos(ang) * 4
        const ty = nearest.y + Math.sin(ang) * 4
        if (
          !this.isClosedDoorAt(monster.areaId, Math.round(tx), Math.round(ty)) &&
          (!this.terrainWalkableCheck ||
            this.terrainWalkableCheck(monster.areaId, Math.round(tx), Math.round(ty), false)) &&
          !this.isMonsterCellOccupied(monster, tx, ty)
        ) {
          cx = tx
          cy = ty
          break
        }
      }
      this.emitBossSkillCast113c(monster, 331, 1 + diffBonus, 8, cx, cy)
      this.broadcastExplosionMissile(monster, 614)
      // `rClone = max(-100, 2 * r - 100)` guarantees `(100 - rClone)/100 = 2 * (100 - r)/100` (exact 2x incoming damage vs real Baal!).
      const doubleVuln = (r: number): number => Math.max(-100, 2 * Math.min(95, r) - 100)
      const cloneId = this.spawnMonster({
        classId: 570,
        hcIdx: 570,
        defId: 'baalclone',
        ai: 'BaalCrabClone',
        x: cx,
        y: cy,
        areaId: monster.areaId,
        level: monster.level,
        hp: monster.hp,
        maxHp: monster.maxHp,
        experience: 0,
        noRatio: true,
        minDmg: monster.minDmg,
        maxDmg: monster.maxDmg,
        ar: monster.ar,
        ac: monster.ac,
        resistances: {
          phys: doubleVuln(monster.resistances.phys),
          magic: doubleVuln(monster.resistances.magic),
          fire: doubleVuln(monster.resistances.fire),
          light: doubleVuln(monster.resistances.light),
          cold: doubleVuln(monster.resistances.cold),
          poison: doubleVuln(monster.resistances.poison),
        },
        bossUnitId: monster.unitId,
      })
      const cloneRec = this.monsters.get(cloneId)
      if (cloneRec !== undefined) {
        cloneRec.despawnAtFrame = this.currentFrame + 750
        cloneRec.skillCursor = 1
      }
      monster.activeBaalCloneUnitId = cloneId
      monster.baalCloneSpawnCount += 1
      monster.cooldown = Math.max(12, monster.cooldownTicks)
      monster.skillCooldown = 40
      return
    }

    // 2) `#315 Baal Tentacle` (`Festering Appendages`): ONLY non-clone Baal (`!isClone`), spawns `2..4` (N) / `3..5` (NM) / `4..6` (H) `baaltentacle1..5` (`#562..566`).
    if (!isClone && slot === 1) {
      const activeTentacles = [...this.monsters.values()].filter(
        (m) => !m.dead && m.bossUnitId === monster.unitId && isBaalTentacleHcIdx113c(m.hcIdx),
      ).length
      if (activeTentacles < 8) {
        const count = this.difficulty + 2 + this.rng.rand(3)
        const slvl = 4 + diffBonus
        this.emitBossSkillCast113c(monster, 315, slvl, 9, nearest.x, nearest.y)
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 + (this.rng.rand(10) - 5) * 0.05
          const tx = nearest.x + Math.cos(ang) * (2.2 + (i % 2) * 1.1)
          const ty = nearest.y + Math.sin(ang) * (2.2 + (i % 2) * 1.1)
          if (
            this.terrainWalkableCheck &&
            !this.terrainWalkableCheck(monster.areaId, Math.round(tx), Math.round(ty), false)
          ) {
            continue
          }
          const tHcIdx = 562 + (i % 5)
          const tId = this.spawnMonster({
            classId: tHcIdx,
            hcIdx: tHcIdx,
            defId: `baaltentacle${String((i % 5) + 1)}`,
            ai: 'BaalTentacle',
            x: tx,
            y: ty,
            areaId: monster.areaId,
            level: monster.level,
            experience: 0,
            noRatio: true,
            velocity: 0,
            runSpeed: 0,
            meleeRange: 5,
            bossUnitId: monster.unitId,
          })
          const tRec = this.monsters.get(tId)
          if (tRec !== undefined) {
            tRec.despawnAtFrame = this.currentFrame + 25 * (10 + this.rng.rand(10))
          }
        }
        monster.cooldown = Math.max(12, monster.cooldownTicks)
        monster.skillCooldown = 35
        return
      }
    }

    // 3) `#309 Defense Curse` (`state 113` when `maxHp > maxMana`) vs `#310 Blood Mana` (`state 114` when `maxMana >= maxHp`).
    if (nearest.kind === 'player' && !nearest.player.states.has(113) && !nearest.player.states.has(114) && slot === 2) {
      const wantBloodMana = nearest.player.maxManaFixed >= nearest.player.maxHpFixed
      const curseSkillId = wantBloodMana ? 310 : 309
      const curseSlvl = 2 + diffBonus
      this.applyMonsterCurseToTarget113c(
        monster,
        { kind: 'player', player: nearest.player },
        curseSkillId,
        curseSlvl,
      )
      monster.mode = 10
      this.broadcastToArea(monster.areaId, {
        type: 'UnitMode',
        unitType: 1,
        id: monster.unitId,
        mode: 10,
        at: { x: Math.round(nearest.x), y: Math.round(nearest.y) },
        lifePct: monster.maxHp > 0 ? Math.round((monster.hp / monster.maxHp) * 128) : 0,
      })
      monster.cooldown = Math.max(12, monster.cooldownTicks)
      monster.skillCooldown = 30
      return
    }

    // 4) `#318 Baal Cold Missiles` (`Hoarfrost` expanding V-wedge + Cold + Chill + 75% Knockback).
    if (slot === 3) {
      const slvl = 7 + diffBonus
      this.emitBossSkillCast113c(monster, 318, slvl, 4, nearest.x, nearest.y)
      const ang = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      const cos = Math.cos(ang)
      const sin = Math.sin(ang)
      this.broadcastToArea(monster.areaId, {
        type: 'CreateMissile',
        missileId: this.allocateUnitId(UNIT_TYPE_113C.missile),
        missileClassId: 589,
        at: { x: Math.round(monster.x), y: Math.round(monster.y) },
        target: { x: Math.round(nearest.x), y: Math.round(nearest.y) },
        x: Math.round(monster.x),
        y: Math.round(monster.y),
        targetX: Math.round(nearest.x),
        targetY: Math.round(nearest.y),
        skillId: 318,
        level: slvl,
        ownerType: 1,
        ownerUnitType: 'monster',
        ownerId: monster.unitId,
        sourceUnitId: monster.unitId,
        areaId: monster.areaId,
      } as ServerEvent)
      if (monster.activeHoarfrostWaves === undefined) {
        monster.activeHoarfrostWaves = []
      }
      monster.activeHoarfrostWaves.push({
        x: monster.x + cos * 1.2,
        y: monster.y + sin * 1.2,
        vx: cos * 1.25,
        vy: sin * 1.25,
        perpX: -sin,
        perpY: cos,
        remainingSteps: 15,
        stepDone: 0,
        slvl,
        hitUnits: new Set(),
      })
      monster.cooldown = Math.max(12, monster.cooldownTicks)
      monster.skillCooldown = 26
      return
    }

    // 5) `#317 Baal Inferno` (`Mana Rift` 20-frame Magic beam + 50% current Mana drain).
    if (slot === 4 && dist <= 18) {
      const slvl = 8 + diffBonus
      const ang = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      this.emitBossSkillCast113c(monster, 317, slvl, 14, nearest.x, nearest.y)
      monster.activeBossChannel = {
        kind: 'baalinferno',
        skillId: 317,
        slvl,
        remainingFrames: 20,
        angle: ang,
        targetX: nearest.x,
        targetY: nearest.y,
        startOffset: 0.5,
        nextHitFrames: new Map(),
      }
      monster.cooldown = 24
      monster.skillCooldown = 28
      return
    }

    // 6) `#329 Baal Teleport` (`#331` on clone): closes distance TOWARD target when `dist >= 8` (`0x6FCCCBE0`).
    if (dist >= 8) {
      const tpSkillId = isClone ? 331 : 329
      const slvl = 1 + diffBonus
      const ang = Math.atan2(nearest.y - monster.x + monster.x - monster.y, nearest.x - monster.x)
      const targetAng = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      void ang
      let chosen: { x: number; y: number } | undefined
      for (const standOff of [2.5, 3.5, 4.5]) {
        for (const spread of [0, 0.5, -0.5, 1.0, -1.0]) {
          const tx = nearest.x - Math.cos(targetAng + spread) * standOff
          const ty = nearest.y - Math.sin(targetAng + spread) * standOff
          if (Math.hypot(nearest.x - tx, nearest.y - ty) >= dist) continue
          if (
            !this.isClosedDoorAt(monster.areaId, Math.round(tx), Math.round(ty)) &&
            (!this.terrainWalkableCheck ||
              this.terrainWalkableCheck(monster.areaId, Math.round(tx), Math.round(ty), false)) &&
            !this.isMonsterCellOccupied(monster, tx, ty)
          ) {
            chosen = { x: tx, y: ty }
            break
          }
        }
        if (chosen !== undefined) break
      }
      if (chosen !== undefined) {
        const from = { x: Math.round(monster.x), y: Math.round(monster.y) }
        this.broadcastExplosionMissile(monster, 613)
        monster.x = chosen.x
        monster.y = chosen.y
        monster.path = []
        monster.pathIndex = 0
        monster.pathTargetX = Number.NaN
        monster.pathTargetY = Number.NaN
        this.emitBossSkillCast113c(monster, tpSkillId, slvl, 8, chosen.x, chosen.y)
        this.broadcastExplosionMissile(monster, 613)
        this.broadcastToArea(monster.areaId, {
          type: 'UnitMove',
          unitType: 'monster',
          id: monster.unitId,
          unitId: monster.unitId,
          mode: 'run',
          from,
          to: { x: Math.round(chosen.x), y: Math.round(chosen.y) },
          x: Math.round(chosen.x),
          y: Math.round(chosen.y),
          currentX: Math.round(chosen.x),
          currentY: Math.round(chosen.y),
          targetX: Math.round(chosen.x),
          targetY: Math.round(chosen.y),
          areaId: monster.areaId,
        })
        monster.cooldown = Math.max(10, monster.cooldownTicks)
        monster.skillCooldown = 25
        return
      }
    }

    // 7) `#316 Baal Nova` (`Incineration Nova` — 32 radial `baal nova` #555 fire bolts, `nextHit=true, nextDelay=4`).
    {
      const slvl = 7 + diffBonus
      this.emitBossSkillCast113c(monster, 316, slvl, 10, nearest.x, nearest.y)
      const novaFire = this.rollInclusive(50, 75) + 18 * Math.max(0, slvl - 1) + 20 * this.difficulty
      for (let i = 0; i < 32; i++) {
        const theta = (i / 32) * Math.PI * 2
        this.emitBossProjectile113c(monster, {
          missileId: 555,
          skillId: 316,
          slvl,
          originX: monster.x,
          originY: monster.y,
          targetX: monster.x + Math.cos(theta) * 26,
          targetY: monster.y + Math.sin(theta) * 26,
          speedSubTilesPerFrame: 20 / 16,
          rangeFrames: 40,
          size: 2,
          pierce: true,
          nextHit: true,
          nextDelay: 4,
          element: 'fire',
          physDamage: 0,
          elemDamage: novaFire,
        })
      }
      monster.cooldown = Math.max(12, monster.cooldownTicks)
      monster.skillCooldown = 26
      return
    }
  }

  if (dist <= 3.5) {
    if (
      monster.cooldown <= 0 &&
      monster.pendingAttack === undefined &&
      monster.pendingAllyAttack === undefined
    ) {
      monster.cooldown = monster.cooldownTicks
      if (nearest.kind === 'player') {
        this.beginMonsterMeleeAttack(monster, nearest.player)
      } else if (nearest.kind === 'merc') {
        this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'merc', id: nearest.merc.unitId })
      } else {
        this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'pet', id: nearest.pet.uid })
      }
    }
  } else {
    this.moveMonsterToward(monster, nearest.x, nearest.y, dist > 5)
  }
}



/**
 * 1.13c Pandemonium Finale (`D2Game.dll` `0x6FD0AA30..0x6FD0AB09`, #1841):
 * Records killed Uber Prime Evils (`#704`, `#705`, `#709`) in Area `136`. Only when all three
 * have been killed and none remain alive does the last boss drop `Hellfire Torch` (`cm2` unique `id=400`,
 * `ilvl=110`) + `max(1, players.size)` × `Standard of Heroes` (`std`, `ilvl=90`) and despawn all
 * remaining summoned Uber Tristram minions.
 */
function handleUberTristramBossKilled113c(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  this.uberTristramKilledBosses.add(monster.hcIdx)
  const hasLivingUberPrime = [...this.monsters.values()].some(
    (m) =>
      m.unitId !== monster.unitId &&
      !m.dead &&
      m.areaId === PANDEMONIUM_FINALE_AREA_ID_113C &&
      UBER_PRIME_EVIL_SET_113C.has(m.hcIdx),
  )
  if (
    !this.uberTristramRewardDropped &&
    this.uberTristramKilledBosses.size >= 3 &&
    !hasLivingUberPrime
  ) {
    this.uberTristramRewardDropped = true
    const finaleDrops = createPandemoniumFinaleDrops113c({
      dropTables: getEmbeddedDropTables(),
      nextSeed: () => this.rng.rand(0x7fffffff) || 1,
      activePlayerCount: Math.max(1, this.players.size),
      spawnedUniqueIds: this.spawnedUniqueIds,
    })
    if (finaleDrops.length > 0) {
      monster.pendingDropItems = finaleDrops
      monster.pendingDropFrame = this.currentFrame + this.monsterDeathDropDelayFrames(monster)
    }
    for (const other of [...this.monsters.values()]) {
      if (
        !other.dead &&
        other.areaId === PANDEMONIUM_FINALE_AREA_ID_113C &&
        other.isUberSummonedMinion
      ) {
        this.despawnTemporaryMonsterUnit113c(other)
      }
    }
  }
}



/**
 * 1.13c Uber Prime Evil Minion Spawner (`D2Game.dll` `0x6FD0A730..0x6FD0AA30` & `0x6FCD0C40`, #1841):
 * - `#704 ubermephisto`: `#725..730` undead warriors/archers/mages (`cap = 15` together / `30` isolated).
 * - `#705 uberdiablo`: `#712 megademon6` Pit Lords (`cap = 4` together / `10` isolated).
 * - `#709 uberbaal`: `#732 wraith9` Specters & `#731 vampire9` Dark Lords (`cap = 7` together / `15` isolated).
 * All summoned Uber minions have `experience: 0` and `isUberSummonedMinion: true` (zero drops).
 */
function trySpawnUberPrimeMinion113c(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  target: { readonly x: number; readonly y: number },
): boolean {
  if (monster.cooldown > 0 || this.currentFrame < monster.uberSummonNextFrame) return false
  const spec = UBER_PRIME_MINION_SPECS_113C[monster.hcIdx]
  if (!spec || spec.pool.length === 0) return false

  const livingPrimes = [...this.monsters.values()].filter(
    (m) => !m.dead && m.areaId === monster.areaId && UBER_PRIME_EVIL_SET_113C.has(m.hcIdx),
  )
  const cap = computeUberPrimeMinionCap113c(
    monster.hcIdx,
    monster.unitId,
    monster.x,
    monster.y,
    livingPrimes,
  )
  const activeOwned = [...this.monsters.values()].filter(
    (m) =>
      !m.dead &&
      m.areaId === monster.areaId &&
      m.isUberSummonedMinion &&
      m.bossUnitId === monster.unitId,
  ).length
  if (activeOwned >= cap) return false

  const minionHcIdx = spec.pool[this.rng.rand(spec.pool.length)]!
  let spawnDest: { x: number; y: number } | undefined
  const baseAng = (this.rng.rand(360) * Math.PI) / 180
  for (const anchor of [target, monster]) {
    for (let k = 0; k < 8; k++) {
      const ang = baseAng + (k * Math.PI) / 4
      const sx = anchor.x + Math.cos(ang) * 3
      const sy = anchor.y + Math.sin(ang) * 3
      if (
        !this.isClosedDoorAt(monster.areaId, Math.round(sx), Math.round(sy)) &&
        (!this.terrainWalkableCheck ||
          this.terrainWalkableCheck(monster.areaId, Math.round(sx), Math.round(sy), false)) &&
        !this.isMonsterCellOccupied(monster, sx, sy)
      ) {
        spawnDest = { x: sx, y: sy }
        break
      }
    }
    if (spawnDest !== undefined) break
  }
  if (spawnDest === undefined) return false

  this.emitBossSkillCast113c(monster, spec.summonSkillId, 10, 8, spawnDest.x, spawnDest.y)
  const minionRow = MONSTATS_113C_ROWS[minionHcIdx]
  this.spawnMonster({
    classId: minionHcIdx,
    hcIdx: minionHcIdx,
    ...(minionRow ? { defId: minionRow.id } : {}),
    x: spawnDest.x,
    y: spawnDest.y,
    areaId: monster.areaId,
    experience: 0,
    bossUnitId: monster.unitId,
    isUberSummonedMinion: true,
  })
  monster.uberSummonNextFrame = this.currentFrame + spec.cooldownFrames
  monster.cooldown = Math.max(8, monster.cooldownTicks)
  return true
}



/**
 * 1.13c `AITHINK_Fn049_Mephisto` & `AITHINK_Fn140_UberMephisto` (`D2Game.dll`, `#242 mephisto` & `#704 ubermephisto`, #1841):
 * Casts `#334 MephistoMissile` (skull ball `#276`), `#185 PrimeLightning` (`#680`),
 * `#186 PrimeBolt` (`#56` 7-bolt fan), `#192 PrimePoisonNova` (`#118` 16-bolt ring),
 * `#346 MephFrostNova` (`#679` cold ring + chill), and `#59 Blizzard` (`#159` cold shards),
 * while `#704 ubermephisto` radiates innate level 20 `Conviction` (`#123`) and summons `#725..730` undead.
 */
function stepUberMephistoBossAi113c(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  const isUber = monster.hcIdx === 704
  const nearest = this.nearestHostileForMonster(monster, Math.max(35, monster.aggroRadius))
  if (nearest === null) return
  const dist = Math.hypot(nearest.x - monster.x, nearest.y - monster.y)

  if (isUber && this.trySpawnUberPrimeMinion113c(monster, nearest)) {
    return
  }

  if (monster.cooldown <= 0 && monster.skillCooldown <= 0) {
    const slot = monster.skillCursor % 6
    monster.skillCursor = (monster.skillCursor + 1) % 6
    const baseSlvl = isUber ? 20 : 7 + this.difficulty * 3

    // `#346 MephFrostNova` when target is within 12 sub-tiles (`mephfrostnova` `#679`).
    if (slot === 4 && dist <= 12) {
      this.emitBossSkillCast113c(monster, 346, baseSlvl, 8, monster.x, monster.y)
      const coldDmg = this.rollInclusive(45, 75) + 12 * baseSlvl + 25 * this.difficulty
      for (let i = 0; i < 16; i++) {
        const theta = (i / 16) * Math.PI * 2
        this.emitBossProjectile113c(monster, {
          missileId: 679,
          skillId: 346,
          slvl: baseSlvl,
          originX: monster.x,
          originY: monster.y,
          targetX: monster.x + Math.cos(theta) * 12,
          targetY: monster.y + Math.sin(theta) * 12,
          speedSubTilesPerFrame: 20 / 16,
          rangeFrames: 18,
          size: 2,
          pierce: true,
          nextHit: true,
          nextDelay: 4,
          element: 'cold',
          physDamage: 0,
          elemDamage: coldDmg,
        })
      }
      for (const h of this.listHostilesInMonsterArea113c(monster)) {
        if (Math.hypot(h.x - monster.x, h.y - monster.y) <= 10) {
          this.dealMonsterDirectHitToHostile113c(
            monster,
            h,
            { cold: coldDmg },
            { chillFrames: 150 + 15 * baseSlvl },
          )
        }
      }
      const fcrDiv = 100 + monster.monProps.fcrPct
      monster.cooldown = Math.max(6, Math.floor((Math.max(12, monster.cooldownTicks) * 100) / fcrDiv))
      monster.skillCooldown = Math.max(6, Math.floor((24 * 100) / fcrDiv))
      return
    }

    // `#334 MephistoMissile` (icy/magic skull orb `#276 mephisto`: cold + physical impact).
    if (slot === 0) {
      const slvl = isUber ? 20 : 10 + this.difficulty * 2
      this.emitBossSkillCast113c(monster, 334, slvl, 8, nearest.x, nearest.y)
      this.emitBossProjectile113c(monster, {
        missileId: 276,
        skillId: 334,
        slvl,
        originX: monster.x,
        originY: monster.y,
        targetX: nearest.x,
        targetY: nearest.y,
        speedSubTilesPerFrame: 22 / 16,
        rangeFrames: 38,
        size: 2,
        element: 'cold',
        physDamage: this.rollInclusive(30, 55) + 6 * slvl,
        elemDamage: this.rollInclusive(55, 95) + 14 * slvl + 25 * this.difficulty,
      })
      const fcrDiv = 100 + monster.monProps.fcrPct
      monster.cooldown = Math.max(6, Math.floor((Math.max(10, monster.cooldownTicks) * 100) / fcrDiv))
      monster.skillCooldown = Math.max(6, Math.floor((20 * 100) / fcrDiv))
      return
    }

    // `#185 PrimeLightning` (`#680 mephlight` piercing lightning bolt).
    if (slot === 1) {
      const slvl = isUber ? 20 : 7 + this.difficulty * 3
      this.emitBossSkillCast113c(monster, 185, slvl, 8, nearest.x, nearest.y)
      this.emitBossProjectile113c(monster, {
        missileId: 680,
        skillId: 185,
        slvl,
        originX: monster.x,
        originY: monster.y,
        targetX: nearest.x,
        targetY: nearest.y,
        speedSubTilesPerFrame: 26 / 16,
        rangeFrames: 36,
        size: 2,
        pierce: true,
        nextHit: true,
        nextDelay: 4,
        element: 'ltng',
        physDamage: 0,
        elemDamage: this.rollInclusive(15, 140) + 18 * slvl + 30 * this.difficulty,
      })
      const fcrDiv = 100 + monster.monProps.fcrPct
      monster.cooldown = Math.max(6, Math.floor((Math.max(10, monster.cooldownTicks) * 100) / fcrDiv))
      monster.skillCooldown = Math.max(6, Math.floor((22 * 100) / fcrDiv))
      return
    }

    // `#186 PrimeBolt` (`#56 chargedbolt` 7-bolt fan).
    if (slot === 2) {
      const slvl = isUber ? 20 : 7 + this.difficulty * 2
      this.emitBossSkillCast113c(monster, 186, slvl, 8, nearest.x, nearest.y)
      const baseAngle = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      const boltLtng = this.rollInclusive(18, 45) + 8 * slvl + 15 * this.difficulty
      for (let b = -3; b <= 3; b++) {
        const ang = baseAngle + b * 0.16
        this.emitBossProjectile113c(monster, {
          missileId: 56,
          skillId: 186,
          slvl,
          originX: monster.x,
          originY: monster.y,
          targetX: monster.x + Math.cos(ang) * 22,
          targetY: monster.y + Math.sin(ang) * 22,
          speedSubTilesPerFrame: 14 / 16,
          rangeFrames: 36,
          size: 1,
          element: 'ltng',
          physDamage: 0,
          elemDamage: boltLtng,
        })
      }
      const fcrDiv = 100 + monster.monProps.fcrPct
      monster.cooldown = Math.max(6, Math.floor((Math.max(10, monster.cooldownTicks) * 100) / fcrDiv))
      monster.skillCooldown = Math.max(6, Math.floor((22 * 100) / fcrDiv))
      return
    }

    // `#192 PrimePoisonNova` (`#118 poisonnova` 16-bolt poison ring).
    if (slot === 3) {
      const slvl = isUber ? 20 : 5 + this.difficulty * 2
      this.emitBossSkillCast113c(monster, 192, slvl, 8, monster.x, monster.y)
      const poisDmg = this.rollInclusive(35, 65) + 10 * slvl + 20 * this.difficulty
      for (let i = 0; i < 16; i++) {
        const theta = (i / 16) * Math.PI * 2
        this.emitBossProjectile113c(monster, {
          missileId: 118,
          skillId: 192,
          slvl,
          originX: monster.x,
          originY: monster.y,
          targetX: monster.x + Math.cos(theta) * 18,
          targetY: monster.y + Math.sin(theta) * 18,
          speedSubTilesPerFrame: 18 / 16,
          rangeFrames: 26,
          size: 2,
          pierce: true,
          nextHit: true,
          nextDelay: 4,
          element: 'pois',
          physDamage: 0,
          elemDamage: poisDmg,
        })
      }
      const fcrDiv = 100 + monster.monProps.fcrPct
      monster.cooldown = Math.max(6, Math.floor((Math.max(12, monster.cooldownTicks) * 100) / fcrDiv))
      monster.skillCooldown = Math.max(6, Math.floor((26 * 100) / fcrDiv))
      return
    }

    // `#59 Blizzard` (`#159 blizzard1` cold shards around target).
    {
      const slvl = isUber ? 20 : 7 + this.difficulty * 2
      this.emitBossSkillCast113c(monster, 59, slvl, 8, nearest.x, nearest.y)
      const coldDmg = this.rollInclusive(36, 62) + 11 * slvl + 20 * this.difficulty
      for (const [ox, oy] of [
        [0, 0],
        [2, -1],
        [-2, 1],
        [1, 2],
        [-1, -2],
      ] as const) {
        this.emitBossProjectile113c(monster, {
          missileId: 159,
          skillId: 59,
          slvl,
          originX: nearest.x + ox,
          originY: nearest.y + oy,
          targetX: nearest.x + ox,
          targetY: nearest.y + oy,
          speedSubTilesPerFrame: 0,
          rangeFrames: 45,
          size: 2,
          collideType: 0,
          pierce: true,
          nextHit: true,
          nextDelay: 5,
          element: 'cold',
          physDamage: 0,
          elemDamage: coldDmg,
        })
      }
      const fcrDiv = 100 + monster.monProps.fcrPct
      monster.cooldown = Math.max(6, Math.floor((Math.max(12, monster.cooldownTicks) * 100) / fcrDiv))
      monster.skillCooldown = Math.max(6, Math.floor((28 * 100) / fcrDiv))
      return
    }
  }

  if (dist <= 3.5) {
    if (
      monster.cooldown <= 0 &&
      monster.pendingAttack === undefined &&
      monster.pendingAllyAttack === undefined
    ) {
      monster.cooldown = monster.cooldownTicks
      if (nearest.kind === 'player') {
        this.beginMonsterMeleeAttack(monster, nearest.player)
      } else if (nearest.kind === 'merc') {
        this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'merc', id: nearest.merc.unitId })
      } else {
        this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'pet', id: nearest.pet.uid })
      }
    }
  } else {
    this.moveMonsterToward(monster, nearest.x, nearest.y, dist > 5)
  }
}



/** Stationary `#562..566 baaltentacle1..5` (`Festering Appendages`, #1826): rooted melee whip within `meleeRange + 1`. */
function stepBaalTentacleAi113c(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  const reach = Math.max(5, monster.meleeRange) + 1
  const nearest = this.nearestHostileForMonster(monster, reach)
  if (
    nearest !== null &&
    monster.cooldown <= 0 &&
    monster.pendingAttack === undefined &&
    monster.pendingAllyAttack === undefined
  ) {
    monster.cooldown = Math.max(8, monster.cooldownTicks)
    if (nearest.kind === 'player') {
      this.beginMonsterMeleeAttack(monster, nearest.player)
    } else if (nearest.kind === 'merc') {
      this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'merc', id: nearest.merc.unitId })
    } else {
      this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'pet', id: nearest.pet.uid })
    }
  }
}



/**
 * 1.13c `AITHINK_Fn133_Ancient` (`D2Game.dll` `0x6FCC9390`, `MonStats.txt` `#540..542` `ancientbarb1..3`, #1827):
 * - `#540 Talic` (`ancientbarb1`): `#151 Whirlwind` (`slvl = 15`), spinning through & `+8` sub-tiles past target.
 * - `#541 Madawc` (`ancientbarb2`): `#138 Shout` (`slvl = 5`, `state 26`, `+140%` Defense on self & nearby allies) + `#140 Double Throw` (`slvl = 12`, dual `#525 ancient throwing axe`).
 * - `#542 Korlic` (`ancientbarb3`): `#143 Leap Attack` (`slvl = 5`, airborne gap-close + `+200%` ED physical impact).
 */
function stepAncientBarbAi113c(this: GameInstanceHost, monster: InternalMonsterRecord): void {
  const nearest = this.nearestHostileForMonster(monster, Math.max(35, monster.aggroRadius))
  if (nearest === null) return
  const dist = Math.hypot(nearest.x - monster.x, nearest.y - monster.y)

  // `#540 Talic` — Whirlwind (`#151`, `slvl = 15`, `aip1 = 15` range, `aip4 = 8` overshoot).
  if (monster.hcIdx === 540) {
    const wwRange = Math.max(8, monster.aiParams[0] || 15)
    const overshoot = Math.max(4, monster.aiParams[3] || 8)
    if (dist <= wwRange && monster.skillCooldown <= 0 && monster.cooldown <= 0) {
      const slvl = 15
      const ang = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      const totalDist = Math.min(22, Math.max(6, dist + overshoot))
      const tx = monster.x + Math.cos(ang) * totalDist
      const ty = monster.y + Math.sin(ang) * totalDist
      const frames = Math.max(8, Math.min(28, Math.ceil(totalDist / 0.9)))
      this.emitBossSkillCast113c(monster, 151, slvl, 14, tx, ty)
      monster.activeBossChannel = {
        kind: 'whirlwind',
        skillId: 151,
        slvl,
        remainingFrames: frames,
        angle: ang,
        targetX: tx,
        targetY: ty,
        startOffset: 0,
        stepVx: Math.cos(ang) * 0.9,
        stepVy: Math.sin(ang) * 0.9,
        nextHitFrames: new Map(),
      }
      monster.cooldown = frames + 6
      monster.skillCooldown = frames + 18
      return
    }
  }

  // `#541 Madawc` — Shout (`#138`, `slvl = 5`, `+140%` Defense, `state 26`) + Double Throw (`#140`, `slvl = 12`, `#525 ancient throwing axe`).
  if (monster.hcIdx === 541) {
    const unbuffedAncientNearby = [...this.monsters.values()].some(
      (ally) =>
        !ally.dead &&
        !ally.isNpc &&
        ally.areaId === monster.areaId &&
        Math.hypot(ally.x - monster.x, ally.y - monster.y) <= 20 &&
        !ally.states.has(26),
    )
    if (unbuffedAncientNearby && monster.skillCooldown <= 0 && monster.cooldown <= 0) {
      const slvl = 5
      const defPct = 100 + 10 * Math.max(0, slvl - 1) // slvl 5 => +140% Defense
      this.emitBossSkillCast113c(monster, 138, slvl, 8, monster.x, monster.y)
      this.broadcastExplosionMissile(monster, 149) // Missiles.txt #149 `shout`
      for (const ally of this.monsters.values()) {
        if (
          ally.dead ||
          ally.isNpc ||
          ally.areaId !== monster.areaId ||
          Math.hypot(ally.x - monster.x, ally.y - monster.y) > 20
        ) {
          continue
        }
        ally.ac = Math.max(ally.baseAcBeforeShout, Math.round(ally.baseAcBeforeShout * (1 + defPct / 100)))
        this.applyUnitState(
          ally.states,
          ally.stateTimers,
          'monster',
          ally.unitId,
          ally.areaId,
          26,
          1500,
        )
      }
      monster.cooldown = Math.max(10, monster.cooldownTicks)
      monster.skillCooldown = 45
      return
    }

    if (dist < 4 && this.rng.rand(100) < 25) {
      const dx = monster.x - nearest.x
      const dy = monster.y - nearest.y
      const d = Math.max(0.5, Math.hypot(dx, dy))
      this.moveMonsterToward(monster, monster.x + (dx / d) * 6, monster.y + (dy / d) * 6, true)
      return
    }

    const throwRange = Math.max(12, monster.aiParams[0] || 18)
    if (dist <= throwRange && monster.cooldown <= 0) {
      const slvl = 12
      this.emitBossSkillCast113c(monster, 140, slvl, 4, nearest.x, nearest.y)
      const baseAng = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      const axePhys = Math.max(
        8,
        Math.round(this.rollInclusive(monster.minDmg, monster.maxDmg) * 1.35),
      )
      for (const spread of [-0.07, 0.07] as const) {
        const ang = baseAng + spread
        this.emitBossProjectile113c(monster, {
          missileId: 525, // Missiles.txt #525 `ancient throwing axe`
          skillId: 140,
          slvl,
          originX: monster.x,
          originY: monster.y,
          targetX: monster.x + Math.cos(ang) * Math.max(18, dist + 6),
          targetY: monster.y + Math.sin(ang) * Math.max(18, dist + 6),
          speedSubTilesPerFrame: 24 / 16,
          rangeFrames: 24,
          size: 1,
          pierce: true,
          element: 'phys',
          physDamage: axePhys,
          elemDamage: 0,
        })
      }
      monster.cooldown = Math.max(10, monster.cooldownTicks)
      monster.skillCooldown = 14
      return
    }
  }

  // `#542 Korlic` — Leap Attack (`#143`, `slvl = 5`, `aip1 = 15` range, airborne leap over ground obstacles + `+200%` ED impact).
  if (monster.hcIdx === 542) {
    const leapRange = Math.max(10, monster.aiParams[0] || 15)
    if (dist > 3.0 && dist <= leapRange && monster.skillCooldown <= 0 && monster.cooldown <= 0) {
      const slvl = 5
      const ang = Math.atan2(nearest.y - monster.y, nearest.x - monster.x)
      let landing: { x: number; y: number } | undefined
      for (const standOff of [1.4, 2.0, 2.6]) {
        for (const spread of [0, 0.5, -0.5, 1.0, -1.0]) {
          const lx = nearest.x - Math.cos(ang + spread) * standOff
          const ly = nearest.y - Math.sin(ang + spread) * standOff
          if (
            !this.isClosedDoorAt(monster.areaId, Math.round(lx), Math.round(ly)) &&
            (!this.terrainWalkableCheck ||
              this.terrainWalkableCheck(monster.areaId, Math.round(lx), Math.round(ly), false)) &&
            !this.isMonsterCellOccupied(monster, lx, ly)
          ) {
            landing = { x: lx, y: ly }
            break
          }
        }
        if (landing !== undefined) break
      }
      if (landing !== undefined) {
        const from = { x: Math.round(monster.x), y: Math.round(monster.y) }
        monster.x = landing.x
        monster.y = landing.y
        monster.path = []
        monster.pathIndex = 0
        monster.pathTargetX = Number.NaN
        monster.pathTargetY = Number.NaN
        this.emitBossSkillCast113c(monster, 143, slvl, 14, nearest.x, nearest.y)
        this.broadcastToArea(monster.areaId, {
          type: 'UnitMove',
          unitType: 'monster',
          id: monster.unitId,
          unitId: monster.unitId,
          mode: 'run',
          from,
          to: { x: Math.round(landing.x), y: Math.round(landing.y) },
          x: Math.round(landing.x),
          y: Math.round(landing.y),
          currentX: Math.round(landing.x),
          currentY: Math.round(landing.y),
          targetX: Math.round(landing.x),
          targetY: Math.round(landing.y),
          areaId: monster.areaId,
        })
        // `+100 + 30*(slvl-1)%` = `+220%` (`3.2x`) physical Leap Attack impact!
        const leapMult = 1 + (100 + 30 * Math.max(0, slvl - 1)) / 100
        const leapDmg = Math.max(
          12,
          Math.round(this.rollInclusive(monster.minDmg, monster.maxDmg) * leapMult),
        )
        this.dealMonsterDirectHitToHostile113c(
          monster,
          nearest,
          { phys: leapDmg },
          { knockbackSteps: 2 },
        )
        monster.cooldown = Math.max(12, monster.cooldownTicks)
        monster.skillCooldown = 28
        return
      }
    }
  }

  if (dist <= 3.2) {
    if (
      monster.cooldown <= 0 &&
      monster.pendingAttack === undefined &&
      monster.pendingAllyAttack === undefined
    ) {
      monster.cooldown = monster.cooldownTicks
      if (nearest.kind === 'player') {
        this.beginMonsterMeleeAttack(monster, nearest.player)
      } else if (nearest.kind === 'merc') {
        this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'merc', id: nearest.merc.unitId })
      } else {
        this.beginMonsterMeleeAttackOnAlly(monster, { kind: 'pet', id: nearest.pet.uid })
      }
    }
  } else {
    this.moveMonsterToward(monster, nearest.x, nearest.y, true)
  }
}

export interface BossEncountersAiMethods {
  tryCastMonsterSkill(monster: InternalMonsterRecord, target: { readonly x: number; readonly y: number }, distance: number, options?: { readonly hitMonsters?: boolean | undefined }): boolean
  tryCastMonsterUtilitySkill(monster: InternalMonsterRecord, target: { readonly x: number; readonly y: number }, distance: number, healOrWhipOnly?: boolean | undefined): boolean
  setMonsterSkillCooldown(monster: InternalMonsterRecord, delay: string): void
  monsterSkillMode(mode?: string): number
  despawnTemporaryMonsterUnit113c(monster: InternalMonsterRecord, deathMissileId?: number): void
  despawnBaalMinionsOnBossDeath113c(baal: InternalMonsterRecord): void
  emitBossSkillCast113c(monster: InternalMonsterRecord, skillId: number, slvl: number, mode: number, targetX: number, targetY: number, targetRef?: { readonly unitType: 0 | 1; readonly id: number }): void
  emitBossProjectile113c(monster: InternalMonsterRecord, spec: {
    readonly missileId: number
    readonly skillId: number
    readonly slvl: number
    readonly originX: number
    readonly originY: number
    readonly targetX: number
    readonly targetY: number
    readonly speedSubTilesPerFrame: number
    readonly rangeFrames: number
    readonly size?: number | undefined
    readonly collideType?: number | undefined
    readonly pierce?: boolean | undefined
    readonly nextHit?: boolean | undefined
    readonly nextDelay?: number | undefined
    readonly element: MissileDamageChannel
    readonly physDamage: number
    readonly elemDamage: number
    readonly elemDurationFrames?: number | undefined
    readonly guaranteedHit?: boolean | undefined
    readonly hitMonsters?: boolean | undefined
  }): number
  knockbackPlayerFromBoss113c(player: InternalPlayerRecord, fromX: number, fromY: number, maxSteps?: number | undefined): boolean
  dealMonsterDirectHitToHostile113c(monster: InternalMonsterRecord, target: | { readonly kind: 'player'; readonly player: InternalPlayerRecord }
    | { readonly kind: 'merc'; readonly merc: InternalMercenaryRecord }
    | { readonly kind: 'pet'; readonly pet: SummonedPetUnit }, parts: {
    readonly phys?: number | undefined
    readonly fire?: number | undefined
    readonly cold?: number | undefined
    readonly light?: number | undefined
    readonly magic?: number | undefined
  }, effects?: {
    readonly chillFrames?: number | undefined
    readonly stunFrames?: number | undefined
    readonly knockbackSteps?: number | undefined
    readonly knockbackOriginX?: number | undefined
    readonly knockbackOriginY?: number | undefined
  }): void
  listHostilesInMonsterArea113c(monster: InternalMonsterRecord): (
  | { readonly kind: 'player'; readonly key: number; readonly x: number; readonly y: number; readonly player: InternalPlayerRecord }
  | { readonly kind: 'merc'; readonly key: number; readonly x: number; readonly y: number; readonly merc: InternalMercenaryRecord }
  | { readonly kind: 'pet'; readonly key: number; readonly x: number; readonly y: number; readonly pet: SummonedPetUnit }
)[]
  stepBossChannelsAndSummonLifespans113c(monster: InternalMonsterRecord): boolean
  spawnDiabloBonePrisonRing113c(diablo: InternalMonsterRecord, cx: number, cy: number, slvl: number): number
  stepDiabloBossAi113c(monster: InternalMonsterRecord): void
  stepBaalCrabBossAi113c(monster: InternalMonsterRecord): void
  handleUberTristramBossKilled113c(monster: InternalMonsterRecord): void
  trySpawnUberPrimeMinion113c(monster: InternalMonsterRecord, target: { readonly x: number; readonly y: number }): boolean
  stepUberMephistoBossAi113c(monster: InternalMonsterRecord): void
  stepBaalTentacleAi113c(monster: InternalMonsterRecord): void
  stepAncientBarbAi113c(monster: InternalMonsterRecord): void
}

export const bossEncountersAiMethods: Record<keyof BossEncountersAiMethods, unknown> = {
  tryCastMonsterSkill,
  tryCastMonsterUtilitySkill,
  setMonsterSkillCooldown,
  monsterSkillMode,
  despawnTemporaryMonsterUnit113c,
  despawnBaalMinionsOnBossDeath113c,
  emitBossSkillCast113c,
  emitBossProjectile113c,
  knockbackPlayerFromBoss113c,
  dealMonsterDirectHitToHostile113c,
  listHostilesInMonsterArea113c,
  stepBossChannelsAndSummonLifespans113c,
  spawnDiabloBonePrisonRing113c,
  stepDiabloBossAi113c,
  stepBaalCrabBossAi113c,
  handleUberTristramBossKilled113c,
  trySpawnUberPrimeMinion113c,
  stepUberMephistoBossAi113c,
  stepBaalTentacleAi113c,
  stepAncientBarbAi113c,
}
