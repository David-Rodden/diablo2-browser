/**
 * GameInstance Subsystem: Server Missile Stepping, OnlineMissileEngine Bridge, Ground Fire & Child Spawns (`src/server/engine/game-instance/missiles-step.ts`).
 */

import type { MissileRecord } from '../../../common/data/data-registry.ts'
import { MONMODE_BLOCK } from '../../../common/path/types.ts'
import { getMonsterPathRecord } from '../../../common/path/units.ts'
import { resolveArmorBlock113c, resolveWeaponBase113c } from '../../../common/units/char-anim-speed.ts'
import { calcColdEnchantedDeathNova } from '../../../common/units/monster-death-fx.ts'
import type { ServerEvent } from '../../../netproto/index.ts'
import { computeEquippedArmorPieceDefense113c } from '../../items/server-item-data.ts'
import type { SummonedPetUnit } from '../../ai/summon-manager.ts'
import { executeSUnitDmg, type CombatUnitContext } from '../combat-pipeline.ts'
import { checkMissileSegmentFootprintOverlap113c, getMissileCollideEntry113c, MissileEngine as OnlineMissileEngine, type OnlineMissileSpawn113c, type OnlineMissileSplash113c, type OnlineMissileTarget113c } from '../missile-engine.ts'
import { FIXED_ONE, UnitStatList } from '../stat-list.ts'
import { resolveMissilePierceIdx } from '../missile-pierce.ts'
import { StateBus } from '../state-bus.ts'
import { compute5BandScaling } from '../../../common/data/calc-ast.ts'
import { difficultyResistPenalty } from '../difficulty-resist-penalty.ts'
import { STATE_SLOWMISSILES_113C, stepBladeSentinelPatrol113c } from '../../skills/p1-wave4-skills-113c.ts'
import type { GameInstanceHost } from './host.ts'
import type { InternalMercenaryRecord, InternalMissileRecord, InternalMonsterRecord, InternalPlayerRecord, PlayerSkillCast, PlayerSkillMissileLaunchOptions113c, ServerItemEntry } from './types.ts'
import { PLAYER_MISSILE_SPEED_SUBTILES, TOWN_AREAS, monsterProfile113c, normalizeMissileElement, playerWirePosition, stableUnitKey, UNIT_TYPE_113C } from './constants-and-helpers.ts'


/** Route a monster projectile hit through `executeSUnitDmg` for mercs/pets too (#1345). */
function applyMonsterMissileToDefender(this: GameInstanceHost, 
  monster: InternalMonsterRecord,
  missile: Pick<
    InternalMissileRecord,
    'skillId' | 'physDamage' | 'elemDamage' | 'element' | 'elemDurationFrames'
  > & { readonly guaranteedHit?: boolean | undefined },
  defender: {
    readonly id: string
    readonly name: string
    readonly unitType: 'mercenary' | 'minion'
    readonly level: number
    readonly hp: number
    readonly maxHp: number
    readonly defense?: number | undefined
    readonly resist?: number | undefined
    readonly equipment?: readonly ServerItemEntry[] | undefined
    readonly hasShield?: boolean | undefined
    readonly stats?: UnitStatList | undefined
    readonly stateBus?: StateBus | undefined
    readonly x?: number | undefined
    readonly y?: number | undefined
  },
  attackKind: 'melee' | 'missile' = 'missile',
): number {
  let hasShield = defender.hasShield ?? false
  const stats =
    defender.stats ??
    (() => {
      const list = new UnitStatList(this.registry, undefined, { ownerType: 'monster' })
      list.setBaseStat('level', Math.max(1, defender.level))
      list.setBaseStat('maxhp', Math.max(1, defender.maxHp) * FIXED_ONE)
      list.setHp256(Math.max(0, defender.hp) * FIXED_ONE)
      let defense = Math.max(0, defender.defense ?? 0)
      const baseRes = Math.max(0, defender.resist ?? 0)
      let fireRes = baseRes
      let lightRes = baseRes
      let coldRes = baseRes
      let poisonRes = baseRes
      let magicRes = baseRes
      let damageRes = 0
      let normalDr = 0
      let magicDr = 0
      let blockChance = 0
      // ItemStatCost 38/40/42/44/46: +max resist, read by D2Game 0x6FCFB45E for the cap.
      let maxMagicRes = 0
      let maxFireRes = 0
      let maxLightRes = 0
      let maxColdRes = 0
      let maxPoisonRes = 0
      let absorbFirePct = 0
      let absorbFire = 0
      let absorbLightPct = 0
      let absorbLight = 0
      let absorbMagicPct = 0
      let absorbMagic = 0
      let absorbColdPct = 0
      let absorbCold = 0
      let absorbColdPerLevel = 0
      let absorbFirePerLevel = 0
      let absorbLightPerLevel = 0
      let absorbMagicPerLevel = 0
      let cannotBeFrozen = 0
      let halfFreezeDuration = 0
      for (const item of defender.equipment ?? []) {
        const armorBlock = resolveArmorBlock113c(item.code)
        const isOffHandWeapon = item.bodyLoc === 5 && resolveWeaponBase113c(item.code) !== undefined
        if ((item.bodyLoc === 5 && !isOffHandWeapon) || (item.bodyLoc === 4 && armorBlock > 0)) {
          hasShield = true
        }
        if (
          item.identified !== false &&
          item.rawItemData?.identified !== false &&
          item.rawItemData?.broken !== true &&
          item.rawItemData?.defense !== undefined
        ) {
          defense += computeEquippedArmorPieceDefense113c(item, undefined)
        }
        defense += item.stats.get(31) ?? 0
        blockChance += armorBlock + (item.stats.get(20) ?? 0)
        normalDr += item.stats.get(34) ?? 0
        magicDr += item.stats.get(35) ?? 0
        damageRes += item.stats.get(36) ?? 0
        magicRes += item.stats.get(37) ?? 0
        maxMagicRes += item.stats.get(38) ?? 0
        fireRes += item.stats.get(39) ?? 0
        maxFireRes += item.stats.get(40) ?? 0
        lightRes += item.stats.get(41) ?? 0
        maxLightRes += item.stats.get(42) ?? 0
        coldRes += item.stats.get(43) ?? 0
        maxColdRes += item.stats.get(44) ?? 0
        poisonRes += item.stats.get(45) ?? 0
        maxPoisonRes += item.stats.get(46) ?? 0
        absorbFirePct += item.stats.get(142) ?? 0
        absorbFire += item.stats.get(143) ?? 0
        absorbLightPct += item.stats.get(144) ?? 0
        absorbLight += item.stats.get(145) ?? 0
        absorbMagicPct += item.stats.get(146) ?? 0
        absorbMagic += item.stats.get(147) ?? 0
        absorbColdPct += item.stats.get(148) ?? 0
        absorbCold += item.stats.get(149) ?? 0
        absorbColdPerLevel += item.stats.get(234) ?? 0
        absorbFirePerLevel += item.stats.get(235) ?? 0
        absorbLightPerLevel += item.stats.get(236) ?? 0
        absorbMagicPerLevel += item.stats.get(237) ?? 0
        cannotBeFrozen += item.stats.get(153) ?? 0
        halfFreezeDuration += item.stats.get(118) ?? 0
      }
      list.setBaseStat('maxmagicresist', maxMagicRes)
      list.setBaseStat('maxfireresist', maxFireRes)
      list.setBaseStat('maxlightresist', maxLightRes)
      list.setBaseStat('maxcoldresist', maxColdRes)
      list.setBaseStat('maxpoisonresist', maxPoisonRes)
      list.setBaseStat('armorclass', Math.max(0, defense))
      list.setBaseStat('toblock', Math.max(0, blockChance))
      list.setBaseStat('fireresist', fireRes)
      list.setBaseStat('lightresist', lightRes)
      list.setBaseStat('coldresist', coldRes)
      list.setBaseStat('poisonresist', poisonRes)
      list.setBaseStat('magicresist', magicRes)
      list.setBaseStat('damageresist', damageRes)
      list.setBaseStat('normal_damage_reduction', normalDr)
      list.setBaseStat('magic_damage_reduction', magicDr)
      list.setBaseStat('item_absorbfire_percent', absorbFirePct)
      list.setBaseStat('item_absorbfire', absorbFire)
      list.setBaseStat('item_absorblight_percent', absorbLightPct)
      list.setBaseStat('item_absorblight', absorbLight)
      list.setBaseStat('item_absorbmagic_percent', absorbMagicPct)
      list.setBaseStat('item_absorbmagic', absorbMagic)
      list.setBaseStat('item_absorbcold_percent', absorbColdPct)
      list.setBaseStat('item_absorbcold', absorbCold)
      list.setBaseStat('item_absorb_cold_perlevel', absorbColdPerLevel)
      list.setBaseStat('item_absorb_fire_perlevel', absorbFirePerLevel)
      list.setBaseStat('item_absorb_ltng_perlevel', absorbLightPerLevel)
      list.setBaseStat('item_absorb_pois_perlevel', absorbMagicPerLevel)
      list.setBaseStat('item_cannotbefrozen', cannotBeFrozen)
      list.setBaseStat('item_halffreezeduration', halfFreezeDuration)
      return list
    })()
  stats.setHp256(Math.max(0, defender.hp) * FIXED_ONE)
  const defenderStateBus = defender.stateBus ?? new StateBus(stats, this.registry)
  if (defender.unitType === 'mercenary' && defender.stateBus === undefined) {
    const mercId = Number.parseInt(defender.id.replace(/^merc_/, ''), 10)
    if (Number.isFinite(mercId)) {
      this.mirrorPersistentStates(this.mercCombat.get(mercId), defenderStateBus)
    }
  }
  const ctx: CombatUnitContext = {
    id: defender.id,
    name: defender.name,
    unitType: defender.unitType,
    statList: stats,
    stateBus: defenderStateBus,
    x: defender.x ?? monster.x,
    y: defender.y ?? monster.y,
    hasShield,
    // Hirelings take the player branch of D2Game 0x6FCFB3C0 (difficulty penalty + cap);
    // minions are plain monsters there.
    ...(defender.unitType === 'mercenary' ? { resistPenalty: difficultyResistPenalty(this.difficulty) } : {}),
  }
  const auraDmgPct = this.monsterAuraDamageBonusPct(monster)
  const dmgOut = executeSUnitDmg(this.buildMonsterAttackerContext(monster), ctx, {
    skillId: missile.skillId,
    attackKind,
    srcDam: 0,
    flatPhysMin256: Math.floor(missile.physDamage * FIXED_ONE * (1 + auraDmgPct / 100)),
    flatPhysMax256: Math.floor(missile.physDamage * FIXED_ONE * (1 + auraDmgPct / 100)),
    ...(missile.element !== 'phys'
      ? {
          elemType: missile.element,
          elemMin256: missile.elemDamage * FIXED_ONE,
          elemMax256: missile.elemDamage * FIXED_ONE,
          elemDurationFrames: missile.elemDurationFrames,
        }
      : {}),
    ...(missile.guaranteedHit === true ? { autoHit: true } : {}),
  }, this.rng)
  if (dmgOut.hit) {
    if (
      defender.unitType === 'mercenary' &&
      missile.element === 'cold' &&
      dmgOut.elemDamage256 > 0
    ) {
      const mercId = Number.parseInt(defender.id.replace(/^merc_/, ''), 10)
      const mercRecord = Number.isFinite(mercId) ? this.mercenaries.get(mercId) : undefined
      if (mercRecord !== undefined && mercRecord.alive) {
        const chillDur = missile.elemDurationFrames > 0 ? missile.elemDurationFrames : 50
        this.applyUnitState(
          mercRecord.states,
          mercRecord.stateTimers,
          'monster',
          mercRecord.unitId,
          mercRecord.areaId,
          11,
          chillDur,
        )
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
        const mercId =
          defender.unitType === 'mercenary'
            ? Number.parseInt(defender.id.replace(/^merc_/, ''), 10)
            : NaN
        const mercRecord = Number.isFinite(mercId) ? this.mercenaries.get(mercId) : undefined
        const ownerPlayer = mercRecord ? this.players.get(mercRecord.ownerPlayerId) : undefined
        if (mercRecord !== undefined) {
          monster.lastHitByMerc = true
        }
        this.applyMonsterDeath(monster, ownerPlayer, 'phys')
      }
    }
    const finalDmg = Math.floor(dmgOut.totalDamage256 / FIXED_ONE)
    if (finalDmg > 0 && monsterProfile113c(monster.ai).drain === 'life' && !monster.dead) {
      const drainAmount = Math.max(1, Math.floor(finalDmg / 2))
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
    }
  }
  return Math.max(0, Math.floor(stats.getHp256() / FIXED_ONE))
}



function missileSegmentBlocked(this: GameInstanceHost, 
  missile: InternalMissileRecord,
  prevX: number,
  prevY: number,
): boolean {
  const dx = missile.x - prevX
  const dy = missile.y - prevY
  const distance = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(distance / 0.5))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const sx = Math.round(prevX + dx * t)
    const sy = Math.round(prevY + dy * t)
    const pointArea = this.areaIdAtWorldPoint(sx, sy) ?? missile.areaId
    if (this.isClosedDoorAt(pointArea, sx, sy)) {
      return true
    }
    if (
      this.terrainWalkableCheck &&
      !this.terrainWalkableCheck(
        pointArea,
        sx,
        sy,
        missile.collideType !== 8,
      )
    ) {
      return true
    }
  }
  return false
}



/** #1790: the room's `MissileEngine` (srvdo / srvhit dispatch tables), bound to `registry`. */
function onlineMissileEngine(this: GameInstanceHost): OnlineMissileEngine {
  if (this.onlineMissileEngineInstance?.registry !== this.registry) {
    this.onlineMissileEngineInstance = new OnlineMissileEngine(this.registry)
  }
  return this.onlineMissileEngineInstance
}



/** Room key of a hostile unit in the online missile bridge. */
function onlineUnitKey113c(this: GameInstanceHost, kind: 'monster' | 'player' | 'merc' | 'pet', unitId: number): string {
  return `${kind === 'monster' ? 'm' : kind === 'player' ? 'p' : kind === 'merc' ? 'c' : 's'}:${unitId}`
}



/** Map an `onlineUnitKey113c` string (`m:id | p:id | c:id | s:id`) to its `missile.hitCooldowns` key. */
function onlineCooldownKeyFromUnitKey113c(this: GameInstanceHost, key: string): number | undefined {
  const sep = key.indexOf(':')
  if (sep <= 0) return undefined
  const prefix = key.slice(0, sep)
  const id = Number(key.slice(sep + 1))
  if (!Number.isFinite(id)) return undefined
  if (prefix === 'm') return id
  if (prefix === 'p') return -id
  if (prefix === 'c') return -(1_000_000 + id)
  if (prefix === 's') return -(2_000_000 + id)
  return undefined
}



/** Sub-tile missile blocker of `area` for child placement (`COLLISION_CheckMask` missile barrier). */
function onlineMissileBlocker113c(this: GameInstanceHost, areaId: number): ((x: number, y: number) => boolean) | undefined {
  const check = this.terrainWalkableCheck
  if (check === undefined) return undefined
  return (x, y) => !check(areaId, Math.round(x), Math.round(y), true)
}



/** Hostiles of `missile`'s owner that srvdo / srvhit functions may search. */
function onlineMissileTargets113c(this: GameInstanceHost, missile: InternalMissileRecord): OnlineMissileTarget113c[] {
  const out: OnlineMissileTarget113c[] = []
  if (missile.ownerType === 'player') {
    for (const m of this.monsters.values()) {
      const sameOrWildernessSeam =
        m.areaId === missile.areaId ||
        (!TOWN_AREAS.has(missile.areaId) &&
          !TOWN_AREAS.has(m.areaId) &&
          this.isAreaSeamAdjacent(missile.areaId, m.areaId))
      if (m.dead || m.isNpc || m.submerged || !m.isKillable || !sameOrWildernessSeam) continue
      if (this.isMonsterConverted(m)) continue
      out.push({ key: this.onlineUnitKey113c('monster', m.unitId), x: m.x, y: m.y })
    }
    const pvp = this.collectHostilePvpTargetsInArea113c(missile.ownerId, missile.areaId, true)
    for (const p of pvp.players) {
      out.push({ key: this.onlineUnitKey113c('player', p.unitId), x: p.x, y: p.y })
    }
    for (const c of pvp.mercs) {
      out.push({ key: this.onlineUnitKey113c('merc', c.unitId), x: c.x, y: c.y })
    }
    for (const entry of pvp.pets) {
      out.push({ key: this.onlineUnitKey113c('pet', entry.petUnitId), x: entry.pet.x, y: entry.pet.y })
    }
    return out
  }
  for (const p of this.players.values()) {
    if (p.dead || !this.isAreaSeamAdjacent(missile.areaId, p.areaId)) continue
    out.push({ key: this.onlineUnitKey113c('player', p.unitId), x: p.x, y: p.y })
  }
  for (const c of this.mercenaries.values()) {
    if (!c.alive || !this.isAreaSeamAdjacent(missile.areaId, c.areaId)) continue
    out.push({ key: this.onlineUnitKey113c('merc', c.unitId), x: c.x, y: c.y })
  }
  return out
}



/** Attach the `MissileEngine` srvdo / srvhit state to a room missile created from `row`. */
function attachOnlineMissileState113c(this: GameInstanceHost, 
  missile: InternalMissileRecord,
  row: MissileRecord,
  sourceSkillId: number,
  slvl: number,
  groundLegFrames: number,
  extra?: {
    readonly lockedTargetKey?: string | undefined
    readonly chainRemaining?: number | undefined
    readonly targetOffsetX?: number | undefined
    readonly targetOffsetY?: number | undefined
  },
): void {
  const engine = this.onlineMissileEngine()
  missile.online = engine.createOnlineMissileState113c({
    row,
    sourceSkillId,
    slvl,
    x: missile.x,
    y: missile.y,
    vx: missile.vx,
    vy: missile.vy,
    remainingFrames: missile.remainingFrames,
    groundLegFrames,
    lockedTargetKey: extra?.lockedTargetKey,
    chainRemaining: extra?.chainRemaining,
    targetOffsetX: extra?.targetOffsetX,
    targetOffsetY: extra?.targetOffsetY,
  })
  // Hit functions that never consume the missile on unit contact: persistent patches (`SrvHit08`),
  // ground fire (`SrvDo05` / `SrvDmg03`) and the Frozen Orb sphere (`SrvHit29` returns 2).
  const hitKind = engine.classifyOnlineSrvHit113c(row)
  if (missile.carrier === 'groundfire' || hitKind === 'persist' || hitKind === 'orbnova') {
    missile.pierce = true
  }
}



/**
 * #1790: register a player skill missile. Damage missiles and every missile with a 1.13c server
 * function (spawner / hit function / ground fire) get their `MissileEngine` state; zero-damage
 * carriers without one (warcry / curse visuals) stay visual only.
 */
function registerPlayerSkillMissile113c(this: GameInstanceHost, 
  cast: PlayerSkillCast,
  row: MissileRecord,
  missile: InternalMissileRecord,
  damage: number,
  tx: number,
  ty: number,
  speed: number,
  opts: PlayerSkillMissileLaunchOptions113c | undefined,
): void {
  const engine = this.onlineMissileEngine()
  const doKind = engine.classifyOnlineSrvDo113c(row)
  const hitKind = engine.classifyOnlineSrvHit113c(row)
  const isGroundFire = doKind === 'groundfire' || row.pSrvDmgFunc === 3
  const functional =
    doKind === 'pathspawner' ||
    doKind === 'areaspawner' ||
    doKind === 'orb' ||
    (hitKind !== 'none' && hitKind !== 'engine-only' && hitKind !== 'homing')
  if (damage <= 0 && !functional && !isGroundFire) return
  if (opts?.groundFire256 !== undefined) missile.groundFire256 = opts.groundFire256
  if (isGroundFire) {
    missile.carrier = 'groundfire'
    missile.groundFire256 ??= this.resolveOnlineGroundFire256113c(row, cast.slvl, {
      min: cast.evalResult.minElemDmg256,
      max: cast.evalResult.maxElemDmg256,
    })
    missile.groundFireCarry = new Map()
  } else if (damage <= 0) {
    missile.carrier = 'none'
  }
  const legDist = Math.hypot(tx - missile.x, ty - missile.y)
  this.attachOnlineMissileState113c(
    missile,
    row,
    cast.skill.id,
    cast.slvl,
    speed > 0 ? Math.ceil(legDist / speed) : 0,
    {
      lockedTargetKey:
        opts?.lockedTargetKey ??
        (opts?.lockedMonsterId !== undefined ? this.onlineUnitKey113c('monster', opts.lockedMonsterId) : undefined),
    },
  )
  this.missiles.set(missile.unitId, missile)
}



/** Per-frame 1/256 burning damage of a ground fire row: its own leveled `EMin..EMax`, else `inherited`. */
function resolveOnlineGroundFire256113c(this: GameInstanceHost, 
  row: MissileRecord,
  slvl: number,
  inherited: { readonly min: number; readonly max: number } | undefined,
): { readonly min: number; readonly max: number } | undefined {
  const own = this.onlineMissileEngine().evaluateOnlineRowElem256113c(row, slvl)
  if (own !== undefined) return { min: own.min256, max: own.max256 }
  if (inherited !== undefined && inherited.max > 0) return inherited
  return undefined
}



/**
 * SrvDo024 Fire Wall (`0x6FC637D0`): two makers from the target point toward
 * `(Xt - dY, Yt + dX)` / `(Xt + dY, Yt - dX)` (`dX, dY` = caster - target) and a centre pillar.
 */
function launchFireWall113c(this: GameInstanceHost, 
  player: InternalPlayerRecord,
  cast: PlayerSkillCast,
  makerRow: MissileRecord,
  tx: number,
  ty: number,
): void {
  const pillarName = cast.skill.srvMissileB.trim()
  const pillarRow = pillarName !== '' ? this.registry.getMissileByName(pillarName) : undefined
  if (pillarName !== '' && pillarRow === undefined) {
    throw new Error(`Skills.txt '${cast.skill.name}' srvmissileb '${pillarName}' has no Missiles.txt row`)
  }
  const groundFire256 = { min: cast.evalResult.minElemDmg256, max: cast.evalResult.maxElemDmg256 }
  const dX = player.x - tx
  const dY = player.y - ty
  const opts: PlayerSkillMissileLaunchOptions113c = { fromX: tx, fromY: ty, groundFire256 }
  this.launchPlayerSkillMissile(player, cast, makerRow, tx - dY, ty + dX, 0, opts)
  this.launchPlayerSkillMissile(player, cast, makerRow, tx + dY, ty - dX, 0, opts)
  if (pillarRow !== undefined) {
    this.launchPlayerSkillMissile(player, cast, pillarRow, tx, ty, 0, opts)
  }
}



/** Path-mode motion; `true` when `MissileEngine` placed the missile (linear step skipped). */
function advanceOnlineMissile113c(this: GameInstanceHost, missile: InternalMissileRecord): boolean {
  const online = missile.online
  if (online === undefined) return false
  online.vx = missile.vx
  online.vy = missile.vy
  const moved = this.onlineMissileEngine().advanceOnlineMissile113c(online)
  if (moved === false) return false
  missile.x = online.x
  missile.y = online.y
  if (moved === 'end') missile.remainingFrames = Math.min(missile.remainingFrames, 1)
  return true
}



/** Per-frame `pSrvDoFunc`; returns `true` when the function terminates the missile. */
function stepOnlineMissileSrvDo113c(this: GameInstanceHost, missile: InternalMissileRecord): boolean {
  const online = missile.online
  if (online === undefined) return false
  const engine = this.onlineMissileEngine()
  online.ageFrames += 1
  online.remainingFrames = missile.remainingFrames
  online.x = missile.x
  online.y = missile.y
  online.vx = missile.vx
  online.vy = missile.vy
  const kind = engine.classifyOnlineSrvDo113c(online.row)
  const targets = kind === 'homing' ? this.onlineMissileTargets113c(missile) : []
  const res = engine.stepOnlineMissileSrvDo113c(online, targets, this.onlineMissileBlocker113c(missile.areaId))
  missile.vx = online.vx
  missile.vy = online.vy
  for (const spawn of res.spawns) this.pendingOnlineMissileChildren.push({ parent: missile, spawn })
  return res.terminate
}



/** Makers / area spawners whose row has no hit function never collide with units. */
function isOnlinePassThroughMissile113c(this: GameInstanceHost, missile: InternalMissileRecord): boolean {
  const online = missile.online
  if (online === undefined) return false
  const engine = this.onlineMissileEngine()
  const doKind = engine.classifyOnlineSrvDo113c(online.row)
  return (
    (doKind === 'pathspawner' || doKind === 'areaspawner') && engine.classifyOnlineSrvHit113c(online.row) === 'none'
  )
}



/**
 * Unit-contact `pSrvHitFunc` of a player missile (before its damage): queues children, applies the
 * radial splash and adapts the missile's continuation (`'expire'` consumes it, `'pierce'` keeps it).
 */
function dispatchOnlineMissileUnitHit113c(this: GameInstanceHost, 
  missile: InternalMissileRecord,
  targetUnitId: number,
  x: number,
  y: number,
  hitKind: 'monster' | 'player' | 'merc' | 'pet' = 'monster',
): 'passthrough' | 'hit' {
  const online = missile.online
  if (online === undefined) return 'hit'
  const engine = this.onlineMissileEngine()
  const hitKey = this.onlineUnitKey113c(hitKind, targetUnitId)
  if (missile.pierceRemaining !== undefined) online.hitFired = false
  const res = engine.resolveOnlineMissileSrvHit113c(
    online,
    'unit',
    x,
    y,
    hitKey,
    this.onlineMissileTargets113c(missile),
    this.onlineMissileBlocker113c(missile.areaId),
  )
  if (res.outcome === 'passthrough') return 'passthrough'
  for (const spawn of res.spawns) this.pendingOnlineMissileChildren.push({ parent: missile, spawn })
  if (res.splash !== undefined) this.applyOnlineMissileSplash113c(missile, x, y, res.splash)
  if (missile.pierceRemaining !== undefined) {
    missile.pierce = missile.pierceRemaining > 0
  } else if (res.outcome === 'expire') {
    missile.pierce = false
  } else if (res.outcome === 'pierce') {
    missile.pierce = true
  }
  return 'hit'
}



/** Expiry / wall `pSrvHitFunc` (Frozen Orb nova, Meteor impact, AlwaysExplode rows). */
function finishOnlineMissile113c(this: GameInstanceHost, missile: InternalMissileRecord, trigger: 'wall' | 'expire'): void {
  const online = missile.online
  if (online === undefined) return
  const engine = this.onlineMissileEngine()
  const res = engine.resolveOnlineMissileSrvHit113c(
    online,
    trigger,
    missile.x,
    missile.y,
    undefined,
    this.onlineMissileTargets113c(missile),
    this.onlineMissileBlocker113c(missile.areaId),
  )
  for (const spawn of res.spawns) this.pendingOnlineMissileChildren.push({ parent: missile, spawn })
  if (res.splash !== undefined) this.applyOnlineMissileSplash113c(missile, missile.x, missile.y, res.splash)
}



/**
 * Radial splash (`sub_6FC5D450`): the missile's packet on every hostile within `radiusSubtiles` of
 * the impact except the directly struck unit. Player missiles hit monsters and hostile PvP units,
 * monster missiles hit players.
 */
function applyOnlineMissileSplash113c(this: GameInstanceHost, 
  missile: InternalMissileRecord,
  x: number,
  y: number,
  splash: OnlineMissileSplash113c,
): void {
  if (missile.carrier === 'none' || missile.carrier === 'groundfire' || missile.damage <= 0) return
  if (missile.ownerType === 'player') {
    const owner = this.players.get(missile.ownerId)
    if (owner === undefined) return
    for (const m of [...this.monsters.values()]) {
      const sameOrWildernessSeam =
        m.areaId === missile.areaId ||
        (!TOWN_AREAS.has(missile.areaId) &&
          !TOWN_AREAS.has(m.areaId) &&
          m.isKillable &&
          this.isAreaSeamAdjacent(missile.areaId, m.areaId))
      if (m.dead || m.isNpc || m.submerged || !sameOrWildernessSeam || this.isMonsterConverted(m)) continue
      if (splash.excludeKey === this.onlineUnitKey113c('monster', m.unitId)) continue
      if (Math.hypot(m.x - x, m.y - y) > splash.radiusSubtiles) continue
      this.applyDamageToMonster(owner, m, missile.damage, missile.skillId, undefined, 'player', {
        attackKind: 'spell',
        autoHit: true,
        unblockable: true,
        elemDurationFrames: missile.elemDurationFrames,
      })
    }
    const pvp = this.collectHostilePvpTargetsInArea113c(owner.unitId, missile.areaId, true)
    const ch = missile.element !== 'phys' ? missile.element : this.resolveSkillDamageChannel(missile.skillId)
    const splashSpec = {
      skillId: missile.skillId,
      physDamage: ch === 'phys' ? missile.damage : 0,
      elemDamage: ch === 'phys' ? 0 : missile.damage,
      elemType: ch,
      elemDurationFrames: missile.elemDurationFrames,
      attackKind: 'spell' as const,
      autoHit: true,
      unblockable: true,
    }
    for (const p of pvp.players) {
      if (splash.excludeKey === this.onlineUnitKey113c('player', p.unitId)) continue
      if (Math.hypot(p.x - x, p.y - y) > splash.radiusSubtiles) continue
      this.applyPvpHitToTarget113c(owner, { kind: 'player', player: p }, splashSpec)
    }
    for (const c of pvp.mercs) {
      if (splash.excludeKey === this.onlineUnitKey113c('merc', c.unitId)) continue
      if (Math.hypot(c.x - x, c.y - y) > splash.radiusSubtiles) continue
      this.applyPvpHitToTarget113c(owner, { kind: 'merc', merc: c }, splashSpec)
    }
    for (const entry of pvp.pets) {
      if (splash.excludeKey === this.onlineUnitKey113c('pet', entry.petUnitId)) continue
      if (Math.hypot(entry.pet.x - x, entry.pet.y - y) > splash.radiusSubtiles) continue
      this.applyPvpHitToTarget113c(owner, { kind: 'pet', ...entry }, splashSpec)
    }
    return
  }
  const ownerMon = missile.ownerIsObject ? undefined : this.monsters.get(missile.ownerId)
  if (ownerMon === undefined || this.isMonsterConverted(ownerMon)) return
  for (const player of this.players.values()) {
    if (player.dead || !this.isAreaSeamAdjacent(missile.areaId, player.areaId)) continue
    if (splash.excludeKey === this.onlineUnitKey113c('player', player.unitId)) continue
    if (Math.hypot(player.x - x, player.y - y) > splash.radiusSubtiles) continue
    this.resolveMonsterAttackOnPlayer(ownerMon, player, {
      minDmg: missile.physDamage,
      maxDmg: missile.physDamage,
      skillMode: 'A1',
      attackKind: 'missile',
      skillId: missile.skillId,
      missileId: missile.missileId,
      ...(missile.element !== 'phys'
        ? {
            elementType: missile.element,
            elemMin: missile.elemDamage,
            elemMax: missile.elemDamage,
            elemDurationFrames: missile.elemDurationFrames,
          }
        : {}),
      fromMissile: true,
      autoHit: true,
    })
  }
}



/**
 * One frame of a player ground fire patch on `monster` (`SrvDmg03` `0x6FC59670`): a per-frame
 * 1/256 roll accumulated per unit, re-armed every frame instead of once per patch.
 */
function applyOnlineGroundFireTick113c(this: GameInstanceHost, 
  owner: InternalPlayerRecord,
  monster: InternalMonsterRecord,
  missile: InternalMissileRecord,
): void {
  const range = missile.groundFire256
  missile.hitCooldowns.set(monster.unitId, this.currentFrame + 1)
  if (range === undefined || range.max <= 0) return
  const carryMap = (missile.groundFireCarry ??= new Map())
  const roll = this.rollInclusive(range.min, range.max)
  const carry = (carryMap.get(monster.unitId) ?? 0) + roll
  const whole = Math.floor(carry / FIXED_ONE)
  carryMap.set(monster.unitId, carry - whole * FIXED_ONE)
  if (whole <= 0) return
  const row = this.registry.getMissileById(missile.missileId)
  const skipElemMastery =
    row !== undefined && row.skill === '' && !row.applyMastery
  const suppressReturnFireThreat =
    row !== undefined &&
    !row.returnFire &&
    Math.hypot(owner.x - monster.x, owner.y - monster.y) > monster.aggroRadius
  this.applyDamageToMonster(owner, monster, whole, missile.skillId, 'fire', 'player', {
    attackKind: 'spell',
    autoHit: true,
    unblockable: true,
    isGroundFire: true,
    ...(skipElemMastery ? { skipElemMastery: true } : {}),
    ...(suppressReturnFireThreat ? { suppressReturnFireThreat: true } : {}),
    ...(missile.trapPetUid !== undefined ? { fromPet: true } : {}),
  })
}



/** One frame of a player ground fire patch on a hostile PvP target (`SrvDmg03` `0x6FC59670`). */
function applyOnlineGroundFirePvpTick113c(this: GameInstanceHost, 
  owner: InternalPlayerRecord,
  target:
    | { readonly kind: 'player'; readonly player: InternalPlayerRecord }
    | { readonly kind: 'merc'; readonly merc: InternalMercenaryRecord }
    | {
        readonly kind: 'pet'
        readonly ownerId: number
        readonly pet: SummonedPetUnit
        readonly petUnitId: number
        readonly areaId: number
      },
  cooldownKey: number,
  missile: InternalMissileRecord,
): void {
  const range = missile.groundFire256
  missile.hitCooldowns.set(cooldownKey, this.currentFrame + 1)
  if (range === undefined || range.max <= 0) return
  const carryMap = (missile.groundFireCarry ??= new Map())
  const roll = this.rollInclusive(range.min, range.max)
  const carry = (carryMap.get(cooldownKey) ?? 0) + roll
  const whole = Math.floor(carry / FIXED_ONE)
  carryMap.set(cooldownKey, carry - whole * FIXED_ONE)
  if (whole <= 0) return
  this.applyPvpHitToTarget113c(owner, target, {
    skillId: missile.skillId,
    elemDamage: whole,
    elemType: 'fire',
    attackKind: 'spell',
    autoHit: true,
    unblockable: true,
  })
}



/** Create the child missiles queued by srvdo / srvhit functions this frame (after the sweep). */
function flushOnlineMissileChildren113c(this: GameInstanceHost): void {
  if (this.pendingOnlineMissileChildren.length === 0) return
  const queued = this.pendingOnlineMissileChildren.splice(0)
  for (const { parent, spawn } of queued) this.spawnOnlineChildMissile113c(parent, spawn)
}



/** Create one child missile of `parent` (`MISSILE_CreateMissile` from a srvdo / srvhit function). */
function spawnOnlineChildMissile113c(this: GameInstanceHost, parent: InternalMissileRecord, spawn: OnlineMissileSpawn113c): void {
  const row = this.registry.getMissileByName(spawn.missileName)
  if (row === undefined) {
    throw new Error(`Missiles.txt row '${spawn.missileName}' (child of missile ${parent.missileId}) not found`)
  }
  const slvl = Math.max(1, parent.online?.slvl ?? 1)
  const sourceSkillId = parent.online?.sourceSkillId ?? parent.skillId
  const rawVel = row.vel + Math.trunc((row.velLev * slvl) / 8)
  const baseSpeed = row.vel <= 0 ? 0 : rawVel > 0 ? rawVel / 16 : PLAYER_MISSILE_SPEED_SUBTILES
  const ownerSlowed =
    parent.ownerType === 'monster'
      ? !parent.ownerIsObject && Boolean(this.monsters.get(parent.ownerId)?.states.has(STATE_SLOWMISSILES_113C))
      : Boolean(this.players.get(parent.ownerId)?.states.has(STATE_SLOWMISSILES_113C))
  const speed = baseSpeed > 0 && ownerSlowed ? baseSpeed * 0.33 : baseSpeed
  const dx = spawn.targetX - spawn.x
  const dy = spawn.targetY - spawn.y
  const dist = Math.hypot(dx, dy)
  const lifetime = Math.max(1, spawn.lifetimeFrames ?? row.range + row.levRange * slvl)
  const unitId = this.allocateUnitId(UNIT_TYPE_113C.missile)
  const ownerPlayer = parent.ownerType === 'player' ? this.players.get(parent.ownerId) : undefined
  const childPierceRemaining =
    row.pierce && row.collideKill && ownerPlayer !== undefined
      ? resolveMissilePierceIdx(row, this.playerCombatContext(ownerPlayer), this.registry)
      : undefined
  const childSrcDamage =
    row.srcDamage > 0
      ? row.srcDamage
      : row.srcDamage === 0 && row.skill !== ''
        ? (this.registry.getSkillByName(row.skill)?.srcDam ?? 0)
        : 0
  const child: InternalMissileRecord = {
    unitId,
    missileId: row.id,
    skillId: parent.skillId,
    ownerType: parent.ownerType,
    ...(parent.ownerIsObject ? { ownerIsObject: true } : {}),
    ownerId: parent.ownerId,
    areaId: parent.areaId,
    x: spawn.x,
    y: spawn.y,
    vx: dist > 1e-9 ? (dx / dist) * speed : 0,
    vy: dist > 1e-9 ? (dy / dist) * speed : 0,
    damage: parent.damage,
    ...(childSrcDamage > 0 ? { srcDamage: childSrcDamage } : {}),
    remainingFrames: lifetime,
    collideType: row.collideType,
    size: Math.max(1, row.size),
    pierce:
      childPierceRemaining !== undefined
        ? childPierceRemaining > 0
        : row.pierce && !row.collideKill,
    ...(childPierceRemaining !== undefined ? { pierceRemaining: childPierceRemaining } : {}),
    nextHit: row.nextHit,
    nextDelay: Math.max(0, row.nextDelay),
    element: normalizeMissileElement(row.eType) ?? parent.element,
    physDamage: parent.physDamage,
    elemDamage: parent.elemDamage,
    elemDurationFrames: parent.elemDurationFrames,
    ...(parent.poisonBitrate256 !== undefined ? { poisonBitrate256: parent.poisonBitrate256 } : {}),
    hitCooldowns: new Map(),
    guaranteedHit: !row.toHit,
    ...(parent.hitMonsters === true ? { hitMonsters: true } : {}),
  }
  if (spawn.damage === 'none' || (spawn.damage === 'inherit' && parent.carrier === 'none')) {
    child.carrier = 'none'
  } else if (spawn.damage === 'groundfire') {
    const fire256 = this.resolveOnlineGroundFire256113c(row, slvl, parent.groundFire256)
    child.element = 'fire'
    if (parent.ownerType === 'player') {
      child.carrier = 'groundfire'
      child.groundFire256 = fire256
      child.groundFireCarry = new Map()
    } else {
      // Monster ground fire keeps the once-per-unit monster missile hit: one second of burning.
      const perSecond = fire256 !== undefined ? Math.floor(((fire256.min + fire256.max) / 2) * 25 / FIXED_ONE) : 0
      child.physDamage = 0
      child.elemDamage = Math.max(1, perSecond)
      child.damage = child.elemDamage
    }
  } else if (parent.carrier === 'groundfire') {
    child.carrier = 'groundfire'
    child.groundFire256 = parent.groundFire256
    child.groundFireCarry = new Map()
  }
  if (spawn.excludeKey !== undefined) {
    const excludedKey = this.onlineCooldownKeyFromUnitKey113c(spawn.excludeKey)
    if (excludedKey !== undefined) child.hitCooldowns.set(excludedKey, Number.MAX_SAFE_INTEGER)
  }
  this.attachOnlineMissileState113c(child, row, sourceSkillId, slvl, speed > 0 ? Math.ceil(dist / speed) : 0, {
    chainRemaining: spawn.chainRemaining,
    targetOffsetX: spawn.targetOffsetX,
    targetOffsetY: spawn.targetOffsetY,
  })
  this.missiles.set(unitId, child)
  this.broadcastToArea(parent.areaId, {
    type: 'CreateMissile',
    missileId: unitId,
    missileClassId: row.id,
    at: { x: Math.round(spawn.x), y: Math.round(spawn.y) },
    target: { x: Math.round(spawn.targetX), y: Math.round(spawn.targetY) },
    x: Math.round(spawn.x),
    y: Math.round(spawn.y),
    targetX: Math.round(spawn.targetX),
    targetY: Math.round(spawn.targetY),
    skillId: parent.skillId,
    level: slvl,
    ownerType: parent.ownerType === 'player' ? 0 : 1,
    ownerUnitType: parent.ownerType,
    ownerId: parent.ownerId,
    ...(parent.ownerType === 'monster' ? { sourceUnitId: parent.ownerId } : {}),
    areaId: parent.areaId,
  } as ServerEvent)
}



function stepMissiles(this: GameInstanceHost): void {
  for (const [mId, missile] of this.missiles.entries()) {
    const prevX = missile.x
    const prevY = missile.y
    // `#1884` `#257 Blade Sentinel` (`Missiles.txt` `#392` `blade creeper`) back-and-forth shuttle patrol.
    if (missile.patrolState !== undefined) {
      const vel = stepBladeSentinelPatrol113c(missile.patrolState)
      missile.x = missile.patrolState.x
      missile.y = missile.patrolState.y
      missile.vx = vel.vx
      missile.vy = vel.vy
    } else if (!this.advanceOnlineMissile113c(missile)) {
      // #1790: path-mode trajectories (Blessed Hammer spiral) are advanced by `MissileEngine`.
      missile.x += missile.vx
      missile.y += missile.vy
    }
    missile.remainingFrames--
    // #1790: per-frame `pSrvDoFunc` (homing, Frozen Orb spiral, makers, Blizzard shards, nova curl).
    if (this.stepOnlineMissileSrvDo113c(missile)) {
      this.missiles.delete(mId)
      continue
    }

    const collideEntry = getMissileCollideEntry113c(missile.collideType)

    // 1.13c D2Game.dll 0x6FD2D928 CollideType:
    // - terrainMask 0x00 (CollideType 0, 4, 7): ignores terrain
    // - terrainMask 0x04 (CollideType 1, 2, 3, 5, 6): flies over walk-only obstacles (0x01), stops on missile barriers (0x04)
    // - terrainMask 0x05 (CollideType 8): stops on walk-only obstacles (0x01) and missile barriers (0x04)
    if (
      !missile.guaranteedHit &&
      collideEntry.terrainMask !== 0 &&
      this.missileSegmentBlocked(missile, prevX, prevY)
    ) {
      this.finishOnlineMissile113c(missile, 'wall')
      this.missiles.delete(mId)
      continue
    }

    // CollideType 0, 4, 6 (callbackVa === 0) and 7 (CanDestroy missile sweeper) never collide with units
    if (collideEntry.callbackVa === 0 || collideEntry.collideType === 7) {
      if (missile.remainingFrames <= 0) {
        this.finishOnlineMissile113c(missile, 'expire')
        this.missiles.delete(mId)
      }
      continue
    }
    // #1790: makers / area spawners without a hit function (Fire Wall makers) pass through units.
    if (this.isOnlinePassThroughMissile113c(missile)) {
      if (missile.remainingFrames <= 0) {
        this.finishOnlineMissile113c(missile, 'expire')
        this.missiles.delete(mId)
      }
      continue
    }

    let hit = false
    const canHit = (unitId: number): boolean => {
      const until = missile.hitCooldowns.get(unitId)
      return until === undefined || this.currentFrame >= until
    }
    // 1.13c `D2Game.dll` `MISSILE_HurtTarget` (`0x6FD13DC0..0x6FD13E85`, #1792):
    // Unit-global `STATE_JUSTHIT` (state 86) blocks ANY incoming `NextHit === 1` missile across all
    // volley instances and casters without consuming/expiring non-piercing volley arrows, while
    // `NextHit === 0` missiles (`fireball`, `arrow`, `blizzard`, `blessedhammer`) ignore and never set it!
    const isUnitInJustHit = (
      unitType: 'player' | 'monster' | 'merc' | 'pet',
      unitId: number,
      states?: ReadonlySet<number>,
    ): boolean => {
      if (!missile.nextHit) return false
      if (states?.has(86)) return true
      const until = this.unitJustHitUntilFrame.get(`${unitType}:${unitId}`)
      return until !== undefined && this.currentFrame < until
    }
    const armUnitJustHit = (
      unitType: 'player' | 'monster' | 'merc' | 'pet',
      unitId: number,
      areaId: number,
      states?: Set<number>,
      timers?: Map<number, number>,
    ): void => {
      if (!missile.nextHit || missile.nextDelay <= 0) return
      this.unitJustHitUntilFrame.set(`${unitType}:${unitId}`, this.currentFrame + missile.nextDelay)
      if (states !== undefined && timers !== undefined && (unitType === 'player' || unitType === 'monster')) {
        this.applyUnitState(states, timers, unitType, unitId, areaId, 86, missile.nextDelay)
      }
    }
    const markHit = (unitId: number): void => {
      // #1790: ground fire (`SrvDmg03`) burns every unit standing in it on every frame.
      if (missile.carrier === 'groundfire') {
        missile.hitCooldowns.set(unitId, this.currentFrame + 1)
        return
      }
      if (missile.pierce || (missile.vx === 0 && missile.vy === 0)) {
        missile.hitCooldowns.set(
          unitId,
          this.currentFrame + (missile.nextHit ? Math.max(1, missile.nextDelay) : 1_000_000),
        )
      }
    }
    const hitsTargetFootprint = (tx: number, ty: number, targetSize: number): boolean =>
      checkMissileSegmentFootprintOverlap113c(
        prevX,
        prevY,
        missile.x,
        missile.y,
        tx,
        ty,
        missile.size,
        targetSize,
        1,
      )
    if (missile.ownerType === 'monster') {
      const ownerMon = missile.ownerIsObject ? undefined : this.monsters.get(missile.ownerId)
      const ownerObj = missile.ownerIsObject ? this.objects.get(missile.ownerId) : undefined
      if (ownerMon === undefined && ownerObj === undefined) {
        this.missiles.delete(mId)
        continue
      }
      const ownerConverted = ownerMon !== undefined ? this.isMonsterConverted(ownerMon) : false
      if (!ownerConverted && (collideEntry.unitTypeMask & 0x0080) !== 0) {
        for (const player of this.players.values()) {
          if (player.dead || !this.isAreaSeamAdjacent(missile.areaId, player.areaId)) continue
          if (!hitsTargetFootprint(player.x, player.y, 2)) continue
          if (isUnitInJustHit('player', player.unitId, player.states)) continue
          if (!canHit(player.unitId)) continue
          if (ownerMon !== undefined) {
            this.resolveMonsterAttackOnPlayer(ownerMon, player, {
              minDmg: missile.physDamage,
              maxDmg: missile.physDamage,
              skillMode: 'A1',
              attackKind: 'missile',
              skillId: missile.skillId,
              missileId: missile.missileId,
              ...(missile.element !== 'phys'
                ? {
                    elementType: missile.element,
                    elemMin: missile.elemDamage,
                    elemMax: missile.elemDamage,
                    elemDurationFrames: missile.elemDurationFrames,
                  }
                : {}),
              fromMissile: true,
              autoHit: missile.guaranteedHit,
            })
          } else if (ownerObj !== undefined) {
            this.applyPlayerElementalDamage(
              player,
              {
                ...(missile.physDamage > 0 ? { phys: missile.physDamage } : {}),
                ...(missile.element === 'fire' && missile.elemDamage > 0
                  ? { fire: missile.elemDamage }
                  : missile.element === 'ltng' && missile.elemDamage > 0
                    ? { ltng: missile.elemDamage }
                    : missile.element === 'cold' && missile.elemDamage > 0
                      ? { cold: missile.elemDamage }
                      : missile.element === 'pois' && missile.elemDamage > 0
                        ? { pois: missile.elemDamage }
                        : missile.element === 'mag' && missile.elemDamage > 0
                          ? { mag: missile.elemDamage }
                          : {}),
              },
              { killerType: 'trap', killerUnitId: ownerObj.unitId },
            )
          }
          if (missile.element === 'cold') {
            const diffKey: 'normal' | 'nightmare' | 'hell' =
              this.difficulty === 2 ? 'hell' : this.difficulty === 1 ? 'nightmare' : 'normal'
            const chillFrames =
              missile.elemDurationFrames > 0
                ? missile.elemDurationFrames
                : calcColdEnchantedDeathNova(ownerMon?.level ?? 10, diffKey).chillFrames
            this.applyUnitState(
              player.states,
              player.stateTimers,
              'player',
              player.unitId,
              player.areaId,
              11,
              chillFrames,
            )
          }
          armUnitJustHit('player', player.unitId, player.areaId, player.states, player.stateTimers)
          markHit(player.unitId)
          hit = true
          if (!missile.pierce) break
        }
        if ((!hit || missile.pierce) && ownerMon !== undefined) {
          for (const merc of this.mercenaries.values()) {
            if (!merc.alive || !this.isAreaSeamAdjacent(missile.areaId, merc.areaId)) continue
            const mercOwner = this.players.get(merc.ownerPlayerId)
            if (mercOwner !== undefined && (mercOwner.dead || !this.isAreaSeamAdjacent(missile.areaId, mercOwner.areaId))) continue
            if (!hitsTargetFootprint(merc.x, merc.y, 2)) continue
            if (isUnitInJustHit('merc', merc.unitId, merc.states)) continue
            if (!canHit(merc.unitId)) continue
            const prevHp = merc.hp
            const nextHp = this.applyMonsterMissileToDefender(ownerMon, missile, {
              id: `merc_${merc.unitId}`,
              name: merc.name,
              unitType: 'mercenary',
              level: merc.level,
              hp: merc.hp,
              maxHp: merc.maxHp,
              defense: merc.defense,
              resist: merc.resist,
              equipment: merc.equipment,
            })
            if (nextHp < prevHp) {
              this.applyDamageToMerc(merc, prevHp - nextHp, merc.areaId)
            }
            armUnitJustHit('merc', merc.unitId, merc.areaId)
            markHit(merc.unitId)
            hit = true
            if (!missile.pierce) break
          }
        }
        if ((!hit || missile.pierce) && ownerMon !== undefined) {
          for (const [ownerId, mgr] of this.summonManagers) {
            const owner = this.players.get(ownerId)
            if (owner === undefined || owner.dead || !this.isAreaSeamAdjacent(missile.areaId, owner.areaId)) continue
            let petHit = false
            for (const pet of [...mgr.getActivePets()]) {
              if (pet.alive === false || pet.hp <= 0) continue
              const petAreaId =
                (pet as unknown as { areaId?: number }).areaId ?? owner.areaId
              if (!this.isAreaSeamAdjacent(missile.areaId, petAreaId)) continue
              const petHcIdx = (pet as unknown as { hcIdx?: number }).hcIdx ?? -1
              const petSize = Math.max(
                1,
                Math.min(3, (petHcIdx >= 0 ? getMonsterPathRecord(petHcIdx)?.sizeX : undefined) ?? 2),
              )
              if (!hitsTargetFootprint(pet.x, pet.y, petSize)) continue
              const petKey = stableUnitKey(pet.uid)
              if (isUnitInJustHit('pet', petKey)) continue
              if (!canHit(petKey)) continue
              const prevHp = pet.hp
              const nextHp = this.applyMonsterMissileToDefender(ownerMon, missile, {
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
              })
              if (nextHp < prevHp) {
                pet.hp = prevHp
                this.applyDamageToSummon(ownerId, pet, prevHp - nextHp, petAreaId)
              }
              armUnitJustHit('pet', petKey, petAreaId)
              markHit(petKey)
              hit = true
              petHit = true
              if (!missile.pierce) break
            }
            if (petHit && !missile.pierce) break
          }
        }
      }
      if (
        (!hit || missile.pierce) &&
        ownerMon !== undefined &&
        (collideEntry.unitTypeMask & 0x0100) !== 0 &&
        (missile.hitMonsters || ownerConverted || ownerMon.states.has(59))
      ) {
        for (const target of this.monsters.values()) {
          if (
            target.unitId === ownerMon.unitId ||
            target.dead ||
            target.isNpc ||
            target.areaId !== missile.areaId ||
            (ownerConverted && this.isMonsterConverted(target))
          ) {
            continue
          }
          const targetSize = Math.max(1, Math.min(3, getMonsterPathRecord(target.hcIdx)?.sizeX ?? 2))
          if (!hitsTargetFootprint(target.x, target.y, targetSize)) continue
          if (isUnitInJustHit('monster', target.unitId, target.states)) continue
          if (!canHit(target.unitId)) continue
          const defenderStats = new UnitStatList(this.registry, undefined, {
            ownerType: 'monster',
          })
          defenderStats.setBaseStat('level', target.level)
          defenderStats.setBaseStat('tohit', target.ar)
          defenderStats.setBaseStat('armorclass', target.ac)
          defenderStats.setBaseStat('toblock', target.toBlock)
          defenderStats.setBaseStat('maxhp', target.maxHp * FIXED_ONE)
          defenderStats.setHp256(target.hp * FIXED_ONE)
          defenderStats.setBaseStat('damageresist', target.resistances.phys)
          defenderStats.setBaseStat('magicresist', target.resistances.magic)
          defenderStats.setBaseStat('fireresist', target.resistances.fire)
          defenderStats.setBaseStat('lightresist', target.resistances.light)
          defenderStats.setBaseStat('coldresist', target.resistances.cold)
          defenderStats.setBaseStat('poisonresist', target.resistances.poison)
          const defenderStateBus = new StateBus(defenderStats, this.registry)
          this.mirrorPersistentStates(this.monsterCombat.get(target.unitId), defenderStateBus)
          const defenderCtx: CombatUnitContext = {
            id: `monster_${target.unitId}`,
            name: target.name,
            unitType: 'monster',
            statList: defenderStats,
            stateBus: defenderStateBus,
            x: target.x,
            y: target.y,
            isUndead: target.isUndead,
            isDemon: target.isDemon,
            isBoss: target.isBoss,
            isPrimeEvil: target.isPrimeEvil,
            coldEffect: target.coldEffect,
            drain: target.drain,
          }
          const isSpellMissile =
            missile.guaranteedHit || (missile.physDamage <= 0 && missile.elemDamage > 0)
          const dmgOut = executeSUnitDmg(
            this.buildMonsterAttackerContext(ownerMon),
            defenderCtx,
            {
              skillId: missile.skillId,
              attackKind: isSpellMissile ? 'spell' : 'missile',
              srcDam: 0,
              flatPhysMin256: missile.physDamage * FIXED_ONE,
              flatPhysMax256: missile.physDamage * FIXED_ONE,
              ...(missile.element !== 'phys'
                ? {
                    elemType: missile.element,
                    elemMin256: missile.elemDamage * FIXED_ONE,
                    elemMax256: missile.elemDamage * FIXED_ONE,
                    elemDurationFrames: missile.elemDurationFrames,
                  }
                : {}),
            },
            this.rng,
          )
          if (dmgOut.hit) {
            const dealtDamage = Math.floor(dmgOut.totalDamage256 / FIXED_ONE)
            if (dealtDamage > 0) {
              target.hp = Math.max(0, target.hp - dealtDamage)
              this.broadcastToArea(target.areaId, {
                type: 'UnitStatUpdate',
                unitType: 'monster',
                unitId: target.unitId,
                statId: 6,
                value: target.hp,
              })
              if (target.hp <= 0) {
                const credited = this.creditedPlayerForMonsterKill(ownerMon, target)
                this.applyMonsterDeath(
                  target,
                  credited,
                  missile.element === 'phys' ? 'phys' : missile.element,
                )
              } else {
                this.maybeEnterMonsterHitRecovery(target, dealtDamage, {
                  hitClass: this.resolveMonsterHitClass113c(
                    ownerMon,
                    missile.skillId,
                    missile.missileId,
                  ),
                  isPurePoison: missile.element === 'pois' && missile.physDamage <= 0,
                })
              }
            }
          } else if (dmgOut.avoidedReason === 'block') {
            target.mode = MONMODE_BLOCK
            this.broadcastToArea(target.areaId, {
              type: 'UnitMode',
              unitType: 1,
              id: target.unitId,
              mode: MONMODE_BLOCK,
              lifePct:
                target.maxHp > 0
                  ? Math.max(0, Math.round((target.hp / target.maxHp) * 128))
                  : 0,
            })
          }
          if (!target.dead) {
            armUnitJustHit('monster', target.unitId, target.areaId, target.states, target.stateTimers)
          }
          markHit(target.unitId)
          hit = true
          if (!missile.pierce) break
        }
      }
    } else if ((collideEntry.unitTypeMask & 0x0180) !== 0) {
      const owner = this.players.get(missile.ownerId)
      if (owner) {
        // 1.13c `#101 Holy Bolt` (`srvohit=37` `sub_6FC61E90` / `fistoftheheavensbolt` `#234`, #1943):
        // Collides with allied players (excluding caster), allied mercenaries, and allied summoned pets,
        // healing them by `#101` `Param1..Param4` + `#99 Prayer` (`blvl * 15%`) synergy and consuming the bolt.
        const isHolyBoltAllyHealer =
          missile.missileId === 55 || missile.skillId === 101 || missile.missileId === 234
        if (isHolyBoltAllyHealer && !hit) {
          const hbSlvl = Math.max(
            1,
            missile.online?.slvl ?? this.resolvePlayerSkillLevelById(owner, 101) ?? 1,
          )
          const prayerBlvl = owner.skills.get(99) ?? 0
          const rollHolyBoltHeal = (): number => {
            const minBase = compute5BandScaling(hbSlvl, 1, 2, 3, 4, 5, 6)
            const maxBase = compute5BandScaling(hbSlvl, 6, 4, 6, 8, 10, 12)
            const synMult = 100 + prayerBlvl * 15
            const minHeal = Math.floor((minBase * synMult) / 100)
            const maxHeal = Math.max(minHeal, Math.floor((maxBase * synMult) / 100))
            return Math.max(1, this.rollInclusive(minHeal, maxHeal))
          }
          for (const allyPlayer of this.players.values()) {
            if (
              allyPlayer.unitId === owner.unitId ||
              allyPlayer.dead ||
              allyPlayer.areaId !== missile.areaId ||
              this.isHostilePvpPair113c(
                owner.unitId,
                owner.areaId,
                allyPlayer.unitId,
                allyPlayer.areaId,
                true,
              )
            ) {
              continue
            }
            if (!canHit(-allyPlayer.unitId)) continue
            if (hitsTargetFootprint(allyPlayer.x, allyPlayer.y, 2)) {
              const healPts = rollHolyBoltHeal()
              const maxHpFixed = this.getPlayerAccruedMaxHpFixed(allyPlayer)
              allyPlayer.hpFixed = Math.min(maxHpFixed, allyPlayer.hpFixed + healPts * FIXED_ONE)
              allyPlayer.hp = Math.floor(allyPlayer.hpFixed / FIXED_ONE)
              this.emitToPlayer(allyPlayer.unitId, {
                type: 'UnitStatUpdate',
                unitType: 'player',
                unitId: allyPlayer.unitId,
                statId: 6,
                value: allyPlayer.hpFixed,
              })
              this.emitToPlayer(allyPlayer.unitId, {
                type: 'LifeMana',
                life: allyPlayer.hp,
                mana: allyPlayer.mana,
                stamina: allyPlayer.stamina,
                at: playerWirePosition(allyPlayer),
                vx: 0,
                vy: 0,
              })
              markHit(-allyPlayer.unitId)
              missile.pierce = false
              hit = true
              break
            }
          }
          if (!hit) {
            for (const allyMerc of this.mercenaries.values()) {
              if (
                !allyMerc.alive ||
                allyMerc.areaId !== missile.areaId ||
                this.isHostilePvpPair113c(
                  owner.unitId,
                  owner.areaId,
                  allyMerc.ownerPlayerId,
                  allyMerc.areaId,
                  true,
                )
              ) {
                continue
              }
              const mercKey = -(1_000_000 + allyMerc.unitId)
              if (!canHit(mercKey)) continue
              if (hitsTargetFootprint(allyMerc.x, allyMerc.y, 2)) {
                const healPts = rollHolyBoltHeal()
                allyMerc.hp = Math.min(allyMerc.maxHp, allyMerc.hp + healPts)
                this.broadcastToArea(allyMerc.areaId, {
                  type: 'UnitStatUpdate',
                  unitType: 'monster',
                  unitId: allyMerc.unitId,
                  statId: 6,
                  value: allyMerc.hp,
                })
                markHit(mercKey)
                missile.pierce = false
                hit = true
                break
              }
            }
          }
          if (!hit) {
            for (const [petOwnerId, mgr] of this.summonManagers.entries()) {
              const petOwner = this.players.get(petOwnerId)
              if (
                petOwner === undefined ||
                petOwner.areaId !== missile.areaId ||
                this.isHostilePvpPair113c(
                  owner.unitId,
                  owner.areaId,
                  petOwnerId,
                  petOwner.areaId,
                  true,
                )
              ) {
                continue
              }
              for (const pet of mgr.getActivePets()) {
                if (!pet.alive || pet.hp <= 0 || pet.maxHp <= 0) continue
                const petUnitId = this.resolvePetUnitId(pet)
                const petKey = -(2_000_000 + petUnitId)
                if (!canHit(petKey)) continue
                if (hitsTargetFootprint(pet.x, pet.y, 2)) {
                  const healPts = rollHolyBoltHeal()
                  pet.hp = Math.min(pet.maxHp, pet.hp + healPts)
                  pet.statList.setHp256(pet.hp * FIXED_ONE)
                  this.broadcastToArea(missile.areaId, {
                    type: 'UnitStatUpdate',
                    unitType: 'monster',
                    unitId: petUnitId,
                    statId: 6,
                    value: pet.hp,
                  })
                  markHit(petKey)
                  missile.pierce = false
                  hit = true
                  break
                }
              }
              if (hit) break
            }
          }
        }
        if (!hit && (collideEntry.unitTypeMask & 0x0100) !== 0) {
          for (const monster of this.monsters.values()) {
            const sameOrWildernessSeam =
              monster.areaId === missile.areaId ||
              (!TOWN_AREAS.has(missile.areaId) &&
                !TOWN_AREAS.has(monster.areaId) &&
                monster.isKillable &&
                this.isAreaSeamAdjacent(missile.areaId, monster.areaId))
            if (
              monster.dead ||
              monster.isNpc ||
              monster.submerged ||
              !sameOrWildernessSeam ||
              this.isMonsterConverted(monster)
            ) {
              continue
            }
            if (isUnitInJustHit('monster', monster.unitId, monster.states)) continue
            if (!canHit(monster.unitId)) continue
            const monsterSize = Math.max(1, Math.min(3, getMonsterPathRecord(monster.hcIdx)?.sizeX ?? 2))
            if (hitsTargetFootprint(monster.x, monster.y, monsterSize)) {
              // #1790: `pSrvHitFunc` runs on contact even for zero-damage carriers; a guided arrow
              // passes cleanly through units that are not its locked target.
              if (this.dispatchOnlineMissileUnitHit113c(missile, monster.unitId, monster.x, monster.y) === 'passthrough') {
                continue
              }
              const isWeaponProjectile = (missile.srcDamage ?? 0) > 0
              const mRow = this.registry.getMissileById(missile.missileId)
              const skipElemMastery =
                !isWeaponProjectile &&
                mRow !== undefined &&
                mRow.skill === '' &&
                !mRow.applyMastery
              const suppressReturnFireThreat =
                mRow !== undefined &&
                !mRow.returnFire &&
                Math.hypot(owner.x - monster.x, owner.y - monster.y) > monster.aggroRadius
              const missileHitCtx = {
                attackKind: (isWeaponProjectile || !missile.guaranteedHit ? 'missile' : 'spell') as 'spell' | 'missile',
                autoHit: missile.guaranteedHit,
                unblockable: missile.guaranteedHit && !isWeaponProjectile,
                elemDurationFrames: missile.elemDurationFrames,
                ...(missile.elemDamage256 !== undefined ? { elemDamage256: missile.elemDamage256 } : {}),
                ...(missile.concentrationSnapshotted === true ? { concentrationAlreadyApplied: true } : {}),
                ...(missile.bladeWeaponHit === true ? { bladeWeaponHit: true } : {}),
                ...(isWeaponProjectile ? { srcDam: missile.srcDamage } : {}),
                ...(skipElemMastery ? { skipElemMastery: true } : {}),
                ...(suppressReturnFireThreat ? { suppressReturnFireThreat: true } : {}),
                ...(missile.trapPetUid !== undefined ? { fromPet: true } : {}),
              }
              if (missile.carrier === 'groundfire') {
                this.applyOnlineGroundFireTick113c(owner, monster, missile)
              } else if (missile.carrier === 'none') {
                // Functional carrier: the hit function above is its whole effect (no minimum-1 damage).
              } else if (
                missile.element === 'pois' &&
                missile.elemDurationFrames > 0 &&
                (missile.poisonBitrate256 ?? 0) > 0
              ) {
                if (missile.physDamage > 0) {
                  this.applyDamageToMonster(
                    owner,
                    monster,
                    missile.physDamage,
                    missile.skillId,
                    'phys',
                    'player',
                    missileHitCtx,
                  )
                }
                if (!monster.dead) {
                  this.applyMonsterPoisonDot(
                    owner,
                    monster,
                    missile.poisonBitrate256!,
                    missile.elemDurationFrames,
                    missile.skillId,
                    missile.trapPetUid !== undefined ? 'pet' : 'player',
                  )
                }
              } else {
                this.applyDamageToMonster(
                  owner,
                  monster,
                  missile.damage,
                  missile.skillId,
                  undefined,
                  'player',
                  missileHitCtx,
                )
              }
              if (!monster.dead) {
                armUnitJustHit('monster', monster.unitId, monster.areaId, monster.states, monster.stateTimers)
              }
              markHit(monster.unitId)
              hit = true
              // 1.13c `0x6FC58F40`: `pierce_idx > 0` -> `pierce_idx -= 1`, keep flying; else CollideKill (#1802).
              if (missile.pierceRemaining !== undefined) {
                if (missile.pierceRemaining > 0) {
                  missile.pierceRemaining -= 1
                  missile.pierce = true
                } else {
                  missile.pierce = false
                }
              }
              if (!missile.pierce) break
            }
          }
        }

        if (!hit || missile.pierce) {
          const pvp = this.collectHostilePvpTargetsInArea113c(owner.unitId, missile.areaId, true)
          const applyPvpMissileContact = (
            target:
              | { readonly kind: 'player'; readonly player: InternalPlayerRecord }
              | { readonly kind: 'merc'; readonly merc: InternalMercenaryRecord }
              | {
                  readonly kind: 'pet'
                  readonly ownerId: number
                  readonly pet: SummonedPetUnit
                  readonly petUnitId: number
                  readonly areaId: number
                },
            unitId: number,
            cooldownKey: number,
            tx: number,
            ty: number,
            targetSize: number,
            justHitType: 'player' | 'merc' | 'pet',
            areaId: number,
            states?: Set<number>,
            timers?: Map<number, number>,
          ): boolean => {
            if (isUnitInJustHit(justHitType, unitId, states)) return false
            if (!canHit(cooldownKey)) return false
            if (!hitsTargetFootprint(tx, ty, targetSize)) return false
            if (this.dispatchOnlineMissileUnitHit113c(missile, unitId, tx, ty, target.kind) === 'passthrough') {
              return false
            }
            if (missile.carrier === 'groundfire') {
              this.applyOnlineGroundFirePvpTick113c(owner, target, cooldownKey, missile)
            } else if (missile.carrier === 'none') {
              // Functional carrier only.
            } else if (
              missile.element === 'pois' &&
              missile.elemDurationFrames > 0 &&
              (missile.poisonBitrate256 ?? 0) > 0
            ) {
              const poisDmg = Math.max(
                1,
                Math.floor((missile.poisonBitrate256! * missile.elemDurationFrames) / FIXED_ONE),
              )
              this.applyPvpHitToTarget113c(owner, target, {
                skillId: missile.skillId,
                physDamage: missile.physDamage,
                elemDamage: poisDmg,
                elemType: 'pois',
                elemDurationFrames: missile.elemDurationFrames,
                attackKind: missile.guaranteedHit ? 'spell' : 'missile',
                autoHit: missile.guaranteedHit,
                unblockable: missile.guaranteedHit,
              })
            } else {
              const ch =
                missile.element !== 'phys' ? missile.element : this.resolveSkillDamageChannel(missile.skillId)
              this.applyPvpHitToTarget113c(owner, target, {
                skillId: missile.skillId,
                physDamage: ch === 'phys' ? missile.damage : 0,
                elemDamage: ch === 'phys' ? 0 : missile.damage,
                elemType: ch,
                elemDurationFrames: missile.elemDurationFrames,
                attackKind: missile.guaranteedHit ? 'spell' : 'missile',
                autoHit: missile.guaranteedHit,
                unblockable: missile.guaranteedHit,
                ...(missile.elemDamage256 !== undefined ? { elemDamage256: missile.elemDamage256 } : {}),
                ...(missile.concentrationSnapshotted === true ? { concentrationAlreadyApplied: true } : {}),
              })
            }
            armUnitJustHit(justHitType, unitId, areaId, states, timers)
            markHit(cooldownKey)
            if (missile.pierceRemaining !== undefined) {
              if (missile.pierceRemaining > 0) {
                missile.pierceRemaining -= 1
                missile.pierce = true
              } else {
                missile.pierce = false
              }
            }
            return true
          }

          if ((collideEntry.unitTypeMask & 0x0080) !== 0) {
            for (const p of pvp.players) {
              if (
                applyPvpMissileContact(
                  { kind: 'player', player: p },
                  p.unitId,
                  -p.unitId,
                  p.x,
                  p.y,
                  2,
                  'player',
                  p.areaId,
                  p.states,
                  p.stateTimers,
                )
              ) {
                hit = true
                if (!missile.pierce) break
              }
            }
          }
          if ((!hit || missile.pierce) && (collideEntry.unitTypeMask & 0x0100) !== 0) {
            for (const c of pvp.mercs) {
              if (
                applyPvpMissileContact(
                  { kind: 'merc', merc: c },
                  c.unitId,
                  -(1_000_000 + c.unitId),
                  c.x,
                  c.y,
                  2,
                  'merc',
                  c.areaId,
                  c.states,
                  c.stateTimers,
                )
              ) {
                hit = true
                if (!missile.pierce) break
              }
            }
          }
          if ((!hit || missile.pierce) && (collideEntry.unitTypeMask & 0x0100) !== 0) {
            for (const entry of pvp.pets) {
              const petHcIdx = (entry.pet as unknown as { hcIdx?: number }).hcIdx ?? -1
              const petSize = Math.max(
                1,
                Math.min(3, (petHcIdx >= 0 ? getMonsterPathRecord(petHcIdx)?.sizeX : undefined) ?? 2),
              )
              if (
                applyPvpMissileContact(
                  { kind: 'pet', ...entry },
                  entry.petUnitId,
                  -(2_000_000 + entry.petUnitId),
                  entry.pet.x,
                  entry.pet.y,
                  petSize,
                  'pet',
                  entry.areaId,
                )
              ) {
                hit = true
                if (!missile.pierce) break
              }
            }
          }
        }
      }
    }

    if ((hit && !missile.pierce) || missile.remainingFrames <= 0) {
      if (!(hit && !missile.pierce)) this.finishOnlineMissile113c(missile, 'expire')
      if (missile.trapPetUid !== undefined && missile.trapOwnerPlayerId !== undefined) {
        this.summonManagers.get(missile.trapOwnerPlayerId)?.removePetByUid(missile.trapPetUid)
        const petUnitId = this.petUnitIds.get(missile.trapPetUid)
        if (petUnitId !== undefined) {
          this.petUnitIds.delete(missile.trapPetUid)
          this.petVisualStates.delete(petUnitId)
          this.broadcastToArea(missile.areaId, {
            type: 'UnitRemove',
            unitType: 1,
            id: petUnitId,
            unitId: petUnitId,
          })
        }
      }
      this.missiles.delete(mId)
    }
  }
  this.flushOnlineMissileChildren113c()
}

export interface MissilesStepMethods {
  applyMonsterMissileToDefender(monster: InternalMonsterRecord, missile: Pick<
    InternalMissileRecord,
    'skillId' | 'physDamage' | 'elemDamage' | 'element' | 'elemDurationFrames'
  > & { readonly guaranteedHit?: boolean | undefined }, defender: {
    readonly id: string
    readonly name: string
    readonly unitType: 'mercenary' | 'minion'
    readonly level: number
    readonly hp: number
    readonly maxHp: number
    readonly defense?: number | undefined
    readonly resist?: number | undefined
    readonly equipment?: readonly ServerItemEntry[] | undefined
    readonly hasShield?: boolean | undefined
    readonly stats?: UnitStatList | undefined
    readonly stateBus?: StateBus | undefined
    readonly x?: number | undefined
    readonly y?: number | undefined
  }, attackKind?: 'melee' | 'missile' | undefined): number
  missileSegmentBlocked(missile: InternalMissileRecord, prevX: number, prevY: number): boolean
  onlineMissileEngine(): OnlineMissileEngine
  onlineUnitKey113c(kind: 'monster' | 'player' | 'merc' | 'pet', unitId: number): string
  onlineCooldownKeyFromUnitKey113c(key: string): number | undefined
  onlineMissileBlocker113c(areaId: number): ((x: number, y: number) => boolean) | undefined
  onlineMissileTargets113c(missile: InternalMissileRecord): OnlineMissileTarget113c[]
  attachOnlineMissileState113c(missile: InternalMissileRecord, row: MissileRecord, sourceSkillId: number, slvl: number, groundLegFrames: number, extra?: {
    readonly lockedTargetKey?: string | undefined
    readonly chainRemaining?: number | undefined
    readonly targetOffsetX?: number | undefined
    readonly targetOffsetY?: number | undefined
  }): void
  registerPlayerSkillMissile113c(cast: PlayerSkillCast, row: MissileRecord, missile: InternalMissileRecord, damage: number, tx: number, ty: number, speed: number, opts: PlayerSkillMissileLaunchOptions113c | undefined): void
  resolveOnlineGroundFire256113c(row: MissileRecord, slvl: number, inherited: { readonly min: number; readonly max: number } | undefined): { readonly min: number; readonly max: number } | undefined
  launchFireWall113c(player: InternalPlayerRecord, cast: PlayerSkillCast, makerRow: MissileRecord, tx: number, ty: number): void
  advanceOnlineMissile113c(missile: InternalMissileRecord): boolean
  stepOnlineMissileSrvDo113c(missile: InternalMissileRecord): boolean
  isOnlinePassThroughMissile113c(missile: InternalMissileRecord): boolean
  dispatchOnlineMissileUnitHit113c(missile: InternalMissileRecord, targetUnitId: number, x: number, y: number, hitKind?: 'monster' | 'player' | 'merc' | 'pet' | undefined): 'passthrough' | 'hit'
  finishOnlineMissile113c(missile: InternalMissileRecord, trigger: 'wall' | 'expire'): void
  applyOnlineMissileSplash113c(missile: InternalMissileRecord, x: number, y: number, splash: OnlineMissileSplash113c): void
  applyOnlineGroundFireTick113c(owner: InternalPlayerRecord, monster: InternalMonsterRecord, missile: InternalMissileRecord): void
  applyOnlineGroundFirePvpTick113c(owner: InternalPlayerRecord, target: | { readonly kind: 'player'; readonly player: InternalPlayerRecord }
    | { readonly kind: 'merc'; readonly merc: InternalMercenaryRecord }
    | {
        readonly kind: 'pet'
        readonly ownerId: number
        readonly pet: SummonedPetUnit
        readonly petUnitId: number
        readonly areaId: number
      }, cooldownKey: number, missile: InternalMissileRecord): void
  flushOnlineMissileChildren113c(): void
  spawnOnlineChildMissile113c(parent: InternalMissileRecord, spawn: OnlineMissileSpawn113c): void
  stepMissiles(): void
}

export const missilesStepMethods: Record<keyof MissilesStepMethods, unknown> = {
  applyMonsterMissileToDefender,
  missileSegmentBlocked,
  onlineMissileEngine,
  onlineUnitKey113c,
  onlineCooldownKeyFromUnitKey113c,
  onlineMissileBlocker113c,
  onlineMissileTargets113c,
  attachOnlineMissileState113c,
  registerPlayerSkillMissile113c,
  resolveOnlineGroundFire256113c,
  launchFireWall113c,
  advanceOnlineMissile113c,
  stepOnlineMissileSrvDo113c,
  isOnlinePassThroughMissile113c,
  dispatchOnlineMissileUnitHit113c,
  finishOnlineMissile113c,
  applyOnlineMissileSplash113c,
  applyOnlineGroundFireTick113c,
  applyOnlineGroundFirePvpTick113c,
  flushOnlineMissileChildren113c,
  spawnOnlineChildMissile113c,
  stepMissiles,
}
