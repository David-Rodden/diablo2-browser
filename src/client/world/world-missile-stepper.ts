/**
 * Missile Frame Stepping, Impact Triggers, and 25Hz Discrete Simulation Ticks (`src/client/world/world-missile-stepper.ts`).
 */

import { resolveUnitMonSoundRow113c } from '../../common/audio/mon-sounds-113c.ts'
import { getMissileSoundEntry113c } from '../../common/audio/skill-sounds-113c.ts'
import { CHAT_LINE_TTL_MS, OVERHEAD_SPEECH_TTL_MS } from '../../common/chat/chat-113c.ts'
import {
  BLIZZARD_CIRCLE_X,
  BLIZZARD_CIRCLE_Y,
  ISO_GROUND_ASPECT_RATIO,
} from '../../common/data/blizzard-table.js'
import {
  METEOR_EXPLODE_SUBTILE_OFFSETS,
  METEOR_FIRE_SUBTILE_OFFSETS,
} from '../../common/data/meteor-table.ts'
import { d2Rand, LIGHT_SEED_HI, type D2Seed } from '../../common/drlg/light-grid.ts'
import { MONMODE_KNOCKBACK, MONMODE_NEUTRAL } from '../../common/path/index.ts'
import { SEED_RollRandomNumber } from '../../common/rng/d2-rng.ts'
import { dir64FromPoints } from '../../common/units/direction.ts'
import {
  computeIsoRadialRingVectors,
  isMaggotSmallMonster,
} from '../../common/units/monster-death-fx.ts'
import { getMonsterSizeXByHcIdx } from '../../common/units/monster-mapping.ts'
import { isTownNpcHcIdx } from '../../common/units/npc-table.ts'
import { getObjectsTxtRecord113c } from '../../common/world/objects-txt-113c.ts'
import { isTownLevel } from '../../common/world/scene-population.ts'
import { createOverlayFromTxtRow113c } from './bone-armor-overlays-113c.ts'
import type { ClientUnit, ClientUnitOverlay } from './client-unit.ts'
import { tickCurseCenter113c } from './curse-center-113c.ts'
import {
  BONESPIRIT_CLT_PARAM1_113C,
  BONESPIRIT_SIZE_113C,
  POISONEXPLOSIONCLOUD_113C,
  rollPoisonCloudPuffTargets113c,
  shouldCltDo07Repath113c,
  unitDistance113c,
} from './nec-poison-bone-113c.ts'
import { tickObjectAnim } from './object-light.ts'
import { updateObjectModeSound113c } from './object-sound-113c.ts'
import { ORB_MIST_MISSILE_ROWS, orbMistTick } from './quest-fx-compelling-orb-113c.ts'
import { QUEST_FX_MISSILES_113C } from './quest-fx-data-113c.ts'
import {
  HORADRIC_SHAKE_AMPLITUDE,
  HORADRIC_SHAKE_SUSTAIN_MS,
  TRAJ_FIXED_SHIFT,
  horadricStaffTick,
  stepTraj3dZ,
} from './quest-fx-horadric-113c.ts'
import {
  getMissileCollideType113c,
  isMonsterOneShotMode,
  type ClientWorldInternal,
} from './world-skill-state-tables.ts'

export function triggerMissileImpactImpl(
  this: ClientWorldInternal,
  missile: ClientUnit,
  hitX: number,
  hitY: number,
  isWallHit: boolean,
  hitUnit?: ClientUnit,
): void {
  this.emitMissileImpactSound({
    missileId: missile.classId > 0 ? missile.classId : missile.missileKey,
    entityId: missile.id,
    x: hitX,
    y: hitY,
  })
  // 1.13c D2Client.dll pCltHitFunc[10] (0x6FB62570) + Missiles.txt ProgOverlay="lightning":
  // Charged Bolt and Amazon lightning javelin/bolt missiles attach the "lightning" overlay directly to the hit target unit.
  if (
    !isWallHit &&
    hitUnit &&
    (missile.missileKey === 'chargedbolt' ||
      missile.missileKey === 'chargedstrikebolt' ||
      missile.missileKey === 'lightningjavelin' ||
      missile.missileKey === 'lightningstrike' ||
      missile.missileKey === 'furylightning' ||
      missile.missileKey === 'sentrychargedbolt' ||
      missile.missileKey === 'lightunique' ||
      missile.missileKey === 'buglightning')
  ) {
    this.attachUnitOverlay(hitUnit, 'lightning', false)
  }

  // Druid Elemental hit effects: Twister stun (state 21 + 'stun' overlay), Arctic Blast chill (state 29),
  // Molten Boulder knockback (and stop on SizeX >= 3 monsters)
  if (!isWallHit && hitUnit) {
    if (missile.missileKey === 'twister') {
      hitUnit.states.add(21)
      this.attachUnitOverlay(hitUnit, 'stun', false)
    } else if (missile.missileKey === 'arcticblast1' || missile.missileKey === 'arcticblast2') {
      hitUnit.states.add(29)
    } else if (missile.missileKey === 'moltenboulder') {
      const sizeX =
        hitUnit.unitType === 'monster' && hitUnit.classId >= 0
          ? getMonsterSizeXByHcIdx(hitUnit.classId)
          : 2
      if (sizeX >= 3) {
        missile.pierce = false
      } else {
        const bVx = missile.vx ?? 0
        const bVy = missile.vy ?? 0
        const bLen = Math.hypot(bVx, bVy) || 1
        hitUnit.x += (bVx / bLen) * 1.0
        hitUnit.y += (bVy / bLen) * 1.0
      }
    }
  }

  let expKey =
    missile.explosionMissile ||
    (!isWallHit &&
    (missile.missileKey === 'lightning' ||
      missile.missileKey === 'lightningjavelin' ||
      missile.missileKey === 'chainlightning' ||
      missile.missileKey === 'nova')
      ? 'lightninghit'
      : '')

  if (expKey === 'freezingarrowexp1') {
    expKey = 'freezeexplode'
  } else if (expKey === 'freezingarrowexp2') {
    expKey = 'glacialspikeejecta'
  } else if (expKey === 'plaguejavcloud' || expKey === 'furylightning') {
    // Handled by dedicated multi-projectile bursts below
    expKey = ''
  } else if (missile.missileKey === 'moltenboulder' && !isWallHit && hitUnit && missile.pierce) {
    // Rolling boulder continues piercing small/medium monsters without shattering until wall/expiry/large target
    expKey = ''
  }

  if (expKey) {
    const exp = this.spawnMissileByKey(expKey, hitX, hitY, hitX, hitY, {
      ownerType: missile.ownerType,
      ownerId: missile.ownerId,
      sourceSkillId: missile.sourceSkillId,
      skillLevel: missile.skillLevel,
      loopAnim: false,
    })
    exp.vx = 0
    exp.vy = 0
  }

  if (
    missile.missileKey === 'moltenboulder' &&
    (isWallHit || !hitUnit || !missile.pierce)
  ) {
    // 1.13c Molten Boulder CltHitFunc=25 (Missiles.txt row 299): burst into 8 flying rocks + fireexplosion
    const fireExp = this.spawnMissileByKey('fireexplosion', hitX, hitY, hitX, hitY, {
      ownerType: missile.ownerType,
      ownerId: missile.ownerId,
      sourceSkillId: missile.sourceSkillId,
      skillLevel: missile.skillLevel,
      loopAnim: false,
    })
    fireExp.vx = 0
    fireExp.vy = 0
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4
      const tx = hitX + Math.cos(angle) * 3
      const ty = hitY + Math.sin(angle) * 3
      this.spawnMissileByKey('moltenboulderflyingrocks', hitX, hitY, tx, ty, {
        ownerType: missile.ownerType,
        ownerId: missile.ownerId,
        sourceSkillId: missile.sourceSkillId,
        skillLevel: missile.skillLevel,
        maxTicks: 15,
        loopAnim: false,
      })
    }
  } else if (missile.missileKey === 'armageddonrock') {
    // 1.13c Armageddon rock impact spawns lingering ground fire patch (armageddonfire, 38 frames)
    const patch = this.spawnMissileByKey('armageddonfire', hitX, hitY, hitX, hitY, {
      ownerType: missile.ownerType,
      ownerId: missile.ownerId,
      sourceSkillId: missile.sourceSkillId,
      skillLevel: missile.skillLevel,
      maxTicks: 38,
    })
    patch.vx = 0
    patch.vy = 0
  }

  if (missile.missileKey === 'glacialspike' || missile.missileKey === 'freezingarrow') {
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4
      const tx = hitX + Math.cos(angle) * 2
      const ty = hitY + Math.sin(angle) * 2
      const ejecta = this.spawnMissileByKey('glacialspikeejecta', hitX, hitY, tx, ty, {
        ownerType: missile.ownerType,
        ownerId: missile.ownerId,
        sourceSkillId: missile.sourceSkillId,
        skillLevel: missile.skillLevel,
        loopAnim: false,
      })
      ejecta.vx = 0
      ejecta.vy = 0
    }
  } else if (missile.missileKey === 'explodingarrow' || missile.missileKey === 'immolationarrow') {
    // 1.13c D2Client.dll CltHitFunc=17 / 28: CltHitSubMissile1 = fireexplosion (cSubMissile1 = 3)
    for (let i = 0; i < 3; i++) {
      const angle = (2 * Math.PI * i) / 3
      const tx = hitX + Math.cos(angle) * 1.5
      const ty = hitY + Math.sin(angle) * 1.5
      const subExp = this.spawnMissileByKey('fireexplosion', tx, ty, tx, ty, {
        ownerType: missile.ownerType,
        ownerId: missile.ownerId,
        sourceSkillId: missile.sourceSkillId,
        skillLevel: missile.skillLevel,
        loopAnim: false,
      })
      subExp.vx = 0
      subExp.vy = 0
    }
    if (missile.missileKey === 'immolationarrow') {
      // 1.13c SrvHitFunc=16 / CltHitFunc=28: spawn 75-frame immolationfire ground fire patch (radius Param2=2)
      const patchOffsets = [
        { dx: 0, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
      ]
      for (const off of patchOffsets) {
        const fx = hitX + off.dx
        const fy = hitY + off.dy
        if (this.isSubTileBlocked(fx, fy)) continue
        const patch = this.spawnMissileByKey('immolationfire', fx, fy, fx, fy, {
          ownerType: missile.ownerType,
          ownerId: missile.ownerId,
          sourceSkillId: missile.sourceSkillId,
          skillLevel: missile.skillLevel,
          maxTicks: 75,
        })
        patch.vx = 0
        patch.vy = 0
      }
    }
  } else if (missile.missileKey === 'plaguejavelin') {
    // 1.13c Missiles.txt row 41 (plaguejavelin): CltHitFunc=6, CltHitSubMissile1=plaguejavcloud (expanding ring of 16 clouds)
    const slvl = Math.max(1, missile.skillLevel ?? 1)
    const cloudMaxTicks = Math.min(18, 12 + Math.floor(slvl / 3))
    for (let i = 0; i < 16; i++) {
      const angle = (2 * Math.PI * i) / 16
      const tx = hitX + Math.cos(angle) * 6
      const ty = hitY + Math.sin(angle) * 6
      this.spawnMissileByKey('plaguejavcloud', hitX, hitY, tx, ty, {
        ownerType: missile.ownerType,
        ownerId: missile.ownerId,
        sourceSkillId: missile.sourceSkillId,
        skillLevel: missile.skillLevel,
        maxTicks: cloudMaxTicks,
        pierce: true,
      })
    }
  } else if (missile.missileKey === 'lightningfury') {
    // 1.13c Skills.txt row 35 (Lightning Fury): Param1=2, Param2=1 (maxBolts = 1 + slvl), Param3=15 (search radius)
    // Missiles.txt row 43 (lightningfury): CltHitFunc=12, CltHitSubMissile1=furylightning (Pierce=1)
    const slvl = Math.max(1, missile.skillLevel ?? 1)
    const maxBolts = 1 + slvl
    const hostiles = Array.from(this._monsters.values())
      .filter(
        (m) =>
          !this.isFriendlyOrNonHostileMonster(m) &&
          (!hitUnit || m.id !== hitUnit.id) &&
          Math.hypot(m.x - hitX, m.y - hitY) <= 15,
      )
      .sort((a, b) => Math.hypot(a.x - hitX, a.y - hitY) - Math.hypot(b.x - hitX, b.y - hitY))
      .slice(0, maxBolts)
    if (hostiles.length > 0) {
      for (const tgt of hostiles) {
        const bolt = this.spawnMissileByKey('furylightning', hitX, hitY, tgt.x, tgt.y, {
          ownerType: missile.ownerType,
          ownerId: missile.ownerId,
          sourceSkillId: missile.sourceSkillId,
          skillLevel: missile.skillLevel,
          maxTicks: 40,
          pierce: true,
        })
        bolt.hitUnitIds = new Set(hitUnit ? [hitUnit.id] : [])
      }
    } else if (this._monsters.size === 0) {
      for (let i = 0; i < maxBolts; i++) {
        const angle = (2 * Math.PI * i) / maxBolts
        const bolt = this.spawnMissileByKey(
          'furylightning',
          hitX,
          hitY,
          hitX + Math.cos(angle) * 12,
          hitY + Math.sin(angle) * 12,
          {
            ownerType: missile.ownerType,
            ownerId: missile.ownerId,
            sourceSkillId: missile.sourceSkillId,
            skillLevel: missile.skillLevel,
            maxTicks: 40,
            pierce: true,
          },
        )
        bolt.hitUnitIds = new Set(missile.hitUnitIds)
      }
    }
  }

  // Chain Lightning (15 subtiles, 5 + slvl) / Lightning Strike (20 subtiles, 1 + slvl) bounce to nearest unhit alive hostile monster (1.13c CltHitFunc=11)
  if (
    !isWallHit &&
    (missile.missileKey === 'chainlightning' || missile.missileKey === 'lightningstrike')
  ) {
    const slvl = Math.max(1, missile.skillLevel ?? 1)
    const maxHits = missile.missileKey === 'lightningstrike' ? 1 + slvl : 5 + slvl
    const searchRadius = missile.missileKey === 'lightningstrike' ? 20 : 15
    const hitCount = missile.hitUnitIds?.size ?? 0
    if (hitCount >= maxHits) {
      missile.pierce = false
    } else {
      let nearest: ClientUnit | null = null
      let bestDist = searchRadius
      for (const m of this._monsters.values()) {
        if (this.isFriendlyOrNonHostileMonster(m)) continue
        if (missile.hitUnitIds?.has(m.id)) continue
        const d = Math.hypot(m.x - hitX, m.y - hitY)
        if (d <= bestDist) {
          bestDist = d
          nearest = m
        }
      }
      if (nearest) {
        const speed = Math.hypot(missile.vx ?? 0, missile.vy ?? 0) || 1.5
        const dx = nearest.x - hitX
        const dy = nearest.y - hitY
        const dist = Math.hypot(dx, dy) || 1
        missile.vx = (dx / dist) * speed
        missile.vy = (dy / dist) * speed
        missile.direction = dir64FromPoints(hitX, hitY, nearest.x, nearest.y, missile.direction)
      } else {
        missile.pierce = false
      }
    }
  }
}

export function isFriendlyOrNonHostileMonsterImpl(this: ClientWorldInternal, m: ClientUnit): boolean {
  if (m.dead || m.isNpc || m.ownerType === 'player') return true
  if (this._merc && m.id === this._merc.mercId) return true
  if (this._pets.has(m.id)) return true
  // Hireling HCIdx (Rogue 271, Desert Merc 338, Iron Wolf 359, Barbarian 560/561)
  if (
    m.classId === 271 ||
    m.classId === 338 ||
    m.classId === 359 ||
    m.classId === 560 ||
    m.classId === 561
  ) {
    return true
  }
  // Player summons/totems/sentries (Clay/Blood/Iron/Fire Golem 289..292, Hydra 351..353,
  // Decoy/Dopplezon 356, Valkyrie 357, Iron Wolf/Necro Skeletons 363..364, Assassin traps/Shadow & Druid pets 411..428)
  if (
    (m.classId >= 289 && m.classId <= 292) ||
    (m.classId >= 351 && m.classId <= 353) ||
    m.classId === 356 ||
    m.classId === 357 ||
    m.classId === 363 ||
    m.classId === 364 ||
    (m.classId >= 411 && m.classId <= 428)
  ) {
    return true
  }
  return false
}

export function syncPlayerTownModesImpl(this: ClientWorldInternal): void {
  const inTown = isTownLevel(this.areaId)
  for (const unit of this._units.values()) {
    if (unit.unitType !== 'player') continue
    if (unit.mode === 1 || unit.mode === 5) {
      unit.mode = inTown ? 5 : 1
    } else if (unit.mode === 2 || unit.mode === 6) {
      unit.mode = inTown ? 6 : 2
    }
  }
}

export function stepMissileUnitImpl(this: ClientWorldInternal, unit: ClientUnit): void {
  const prevX = unit.x
  const prevY = unit.y
  const prevAgeTicks = unit.ageTicks ?? 0
  const remBeforeStep = Math.max(0, (unit.maxTicks ?? 1) - prevAgeTicks)
  const vx = unit.vx ?? 0
  const vy = unit.vy ?? 0
  const isMeteor3D =
    unit.missileKey === 'meteor' ||
    unit.missileKey === 'meteortail' ||
    unit.missileKey === 'vampiremeteor' ||
    unit.missileKey === 'royalstrikemeteor' ||
    unit.missileKey === 'royalstrikemeteortail'
  const isQuestFxController =
    unit.missileKey === 'denofevillight' ||
    unit.missileKey === 'cairnstones' ||
    unit.missileKey === 'cairnstonesground' ||
    unit.missileKey === 'diablo appears' ||
    unit.missileKey === 'cairn stones bolt' ||
    unit.missileKey === 'andycontrol0' ||
    unit.missileKey === 'andycolumnfirebase' ||
    unit.missileKey === 'andyfirewallmaker' ||
    unit.missileKey === 'durieldeathcontrol' ||
    unit.missileKey === 'brdeathcontrol' ||
    unit.missileKey === 'radamentdeath' ||
    unit.missileKey === 'queendeathcenter' ||
    unit.missileKey === 'mephistodeathcontrol' ||
    unit.missileKey === 'mephistofirewallmaker' ||
    unit.missileKey === 'izual control' ||
    unit.missileKey === 'diabwallmaker' ||
    unit.missileKey === 'overseercontrol' ||
    unit.missileKey === 'nehlithakcontrol' ||
    unit.missileKey === 'ancient death center' ||
    unit.missileKey === 'baalfx control' ||
    unit.missileKey === 'horadricstaff' ||
    unit.missileKey === 'horadriclight' ||
    unit.missileKey === 'horadriclightning' ||
    unit.missileKey === 'dust' ||
    unit.missileKey === 'orbmist' ||
    unit.missileKey === 'orbmisttrail' ||
    unit.missileKey === 'orbmistfade'
  const isHurricaneOrbit =
    unit.missileKey === 'hurricaneswoosh' ||
    unit.missileKey === 'hurricanerock' ||
    unit.missileKey === 'hurricanetree' ||
    unit.missileKey === 'hurricanecart' ||
    unit.missileKey === 'hurricanesack' ||
    unit.missileKey === 'hurricanevase'
  const isMoving =
    vx !== 0 || vy !== 0 || unit.missileKey === 'blessedhammer' || isHurricaneOrbit || isMeteor3D
  // 1.13c UNIT_Step3DTrajectory (0x6fb77fb0, unit tick 0x6fadb2a5) for a trajectory a CltDoFunc set explicitly.
  const traj3d = unit.traj3d
  if (traj3d !== undefined) unit.altitude = stepTraj3dZ(traj3d)

  if (isMoving) {
    if (isMeteor3D) {
      // 1.13c D2Client.dll UNIT_Step3DTrajectory (0x6fb77fb0) & D2Common_10132 (0x6fd9db40):
      // Step xOffset (+15 sub-units/tick = +15/32 sub-tiles/tick) and zOffset (+25 px/tick)
      // continuously over 59 frames until landing at (targetX, targetY) with altitude = 0.
      const nextTick = (unit.ageTicks ?? 0) + 1
      const descentTicks = Math.max(1, (unit.maxTicks ?? 60) - 1)
      const rem = Math.max(0, descentTicks - nextTick)
      const destX = unit.targetX ?? unit.originX ?? unit.x
      const destY = unit.targetY ?? unit.originY ?? unit.y
      unit.vx = 15 / 32
      unit.vy = 0
      unit.x = destX - (15 * rem) / 32
      unit.y = destY
      unit.altitude = 25 * rem
    } else if (unit.missileKey === 'blessedhammer') {
      unit.spiralAngle = (unit.spiralAngle ?? 0) + 0.28
      unit.spiralRadius = (unit.spiralRadius ?? 0) + 0.45
      const nextX = (unit.originX ?? unit.x) + Math.cos(unit.spiralAngle) * unit.spiralRadius
      const nextY = (unit.originY ?? unit.y) + Math.sin(unit.spiralAngle) * unit.spiralRadius
      unit.vx = nextX - unit.x
      unit.vy = nextY - unit.y
      unit.x = nextX
      unit.y = nextY
    } else if (isHurricaneOrbit) {
      const ownerUnit =
        unit.ownerType && unit.ownerId !== undefined
          ? this.getUnit(unit.ownerType, unit.ownerId)
          : undefined
      const cx = ownerUnit ? ownerUnit.x : (unit.originX ?? unit.x)
      const cy = ownerUnit ? ownerUnit.y : (unit.originY ?? unit.y)
      unit.originX = cx
      unit.originY = cy
      unit.spiralAngle = (unit.spiralAngle ?? 0) + 0.18
      const rad = unit.spiralRadius ?? 3.0
      const nextX = cx + Math.cos(unit.spiralAngle) * rad
      const nextY = cy + Math.sin(unit.spiralAngle) * rad * ISO_GROUND_ASPECT_RATIO
      unit.vx = nextX - unit.x
      unit.vy = nextY - unit.y
      unit.x = nextX
      unit.y = nextY
    } else if (unit.pathWaypoints && unit.pathWaypoints.length > 0) {
      // 1.13c D2Common.dll sub_6FD5D0A0 (0x6FD5D0A0) + PATH_ComputeVelocityAndDirectionVectorsToNextPoint (0x6FD5D240):
      // Step along PATHTYPE_CHARGEDBOLT (0x6FDB6AA0) 2-sub-tile waypoints at missile velocity.
      const speed = Math.hypot(vx, vy) || 0.5625
      let remaining = speed
      let idx = unit.pathWaypointIndex ?? 0
      const waypoints = unit.pathWaypoints
      while (remaining > 1e-5 && idx < waypoints.length) {
        const wp = waypoints[idx]!
        const wpDx = wp.x - unit.x
        const wpDy = wp.y - unit.y
        const wpDist = Math.hypot(wpDx, wpDy)
        if (wpDist <= remaining) {
          unit.x = wp.x
          unit.y = wp.y
          remaining -= wpDist
          idx++
          unit.pathWaypointIndex = idx
          if (idx < waypoints.length) {
            const nextWp = waypoints[idx]!
            const nextDx = nextWp.x - unit.x
            const nextDy = nextWp.y - unit.y
            const nextDist = Math.hypot(nextDx, nextDy)
            if (nextDist > 1e-5) {
              unit.vx = (nextDx / nextDist) * speed
              unit.vy = (nextDy / nextDist) * speed
            }
          }
        } else {
          const inv = 1 / wpDist
          unit.vx = wpDx * inv * speed
          unit.vy = wpDy * inv * speed
          unit.x += wpDx * inv * remaining
          unit.y += wpDy * inv * remaining
          remaining = 0
        }
      }
      if (remaining > 1e-5) {
        const len = Math.hypot(unit.vx ?? 0, unit.vy ?? 0)
        if (len > 1e-5) {
          unit.x += ((unit.vx ?? 0) / len) * remaining
          unit.y += ((unit.vy ?? 0) / len) * remaining
        }
      }
    } else {
      if (unit.missileKey === 'guidedarrow' && prevAgeTicks > 0 && prevAgeTicks % 5 === 0) {
        // 1.13c Guided Arrow CltDoFunc=17 (0x6FB65EA0) / SrvDoFunc=18 (0x6FC5E2B0):
        // Re-acquire nearest alive hostile target within Param1=15 sub-tiles every Param2=5 frames.
        let nearest: ClientUnit | null = null
        let bestDist = 15
        for (const m of this._monsters.values()) {
          if (this.isFriendlyOrNonHostileMonster(m)) continue
          const d = Math.hypot(m.x - unit.x, m.y - unit.y)
          if (d < bestDist) {
            bestDist = d
            nearest = m
          }
        }
        if (nearest) {
          const curSpeed = Math.hypot(unit.vx ?? 0, unit.vy ?? 0) || 1.125
          const dx = nearest.x - unit.x
          const dy = nearest.y - unit.y
          const dist = Math.hypot(dx, dy) || 1
          unit.vx = (dx / dist) * curSpeed
          unit.vy = (dy / dist) * curSpeed
        }
      }
      if (
        (unit.missileKey === 'bonespirit' || unit.missileKey === 'monbonespirit') &&
        unit.homingTarget !== undefined
      ) {
        // 1.13c MISSMODE_CltDo07 (0x6FB62EB0): only a locked target (CltDo18 mode 1) is followed — the
        // client never searches for a new one. Every CltParam1 (5) elapsed frames, re-path toward it while
        // it is alive, hostile to the owner and 3 < D2Common #10522 distance < 25.
        const target = this.getUnit(unit.homingTarget.unitType, unit.homingTarget.id) as ClientUnit | undefined
        const hostile =
          target !== undefined &&
          !target.dead &&
          (unit.ownerType === 'monster'
            ? target.unitType === 'player' || Boolean(this._merc && target.id === this._merc.mercId)
            : target.unitType === 'monster' && !this.isFriendlyOrNonHostileMonster(target))
        if (target !== undefined && hostile) {
          const targetSize =
            target.unitType === 'monster' ? getMonsterSizeXByHcIdx(target.classId) : target.unitType === 'player' ? 2 : 0
          const distance = unitDistance113c(unit.x, unit.y, BONESPIRIT_SIZE_113C, target.x, target.y, targetSize)
          if (shouldCltDo07Repath113c(prevAgeTicks, BONESPIRIT_CLT_PARAM1_113C, distance)) {
            const curSpeed = Math.hypot(unit.vx ?? 0, unit.vy ?? 0)
            const dx = target.x - unit.x
            const dy = target.y - unit.y
            const dist = Math.hypot(dx, dy)
            if (curSpeed > 0 && dist > 1e-5) {
              unit.vx = (dx / dist) * curSpeed
              unit.vy = (dy / dist) * curSpeed
            }
          }
        }
      }
      if (unit.accel !== undefined && unit.accel < 0) {
        const speed = Math.hypot(unit.vx ?? 0, unit.vy ?? 0)
        if (speed > 0) {
          const nextSpeed = Math.max(0.15, speed * (1 + unit.accel / 12800))
          const scale = nextSpeed / speed
          unit.vx = (unit.vx ?? 0) * scale
          unit.vy = (unit.vy ?? 0) * scale
        }
      }
      unit.x += unit.vx ?? 0
      unit.y += unit.vy ?? 0
      if (
        unit.missileKey === 'firestormmaker' ||
        unit.missileKey === 'twister' ||
        unit.missileKey === 'tornado'
      ) {
        const speed = Math.hypot(unit.vx ?? 0, unit.vy ?? 0)
        if (speed > 1e-5) {
          const baseAng = Math.atan2(unit.vy ?? 0, unit.vx ?? 0)
          const phase = (prevAgeTicks + 1) * 0.6 + (unit.jitterIndex ?? 0) * 2.094
          const waveAmp = unit.missileKey === 'tornado' ? 0.35 : 0.45
          unit.x += -Math.sin(baseAng) * Math.sin(phase) * speed * waveAmp
          unit.y += Math.cos(baseAng) * Math.sin(phase) * speed * waveAmp
        }
      }
      if (traj3d !== undefined) {
        // altitude already stepped above
      } else if (unit.verticalDescentPerTick !== undefined && unit.verticalDescentPerTick > 0) {
        unit.altitude = Math.max(0, (unit.altitude ?? 0) - unit.verticalDescentPerTick)
      } else if (unit.altitude !== undefined && unit.altitude > 0 && unit.missileKey !== 'lightninghit') {
        const startAlt = unit.missileKey?.startsWith('blizzard') ? 120 : 240
        const progress = Math.min(
          1,
          ((unit.ageTicks ?? 0) + 1) / Math.max(1, unit.maxTicks ?? 1),
        )
        unit.altitude = Math.max(0, Math.round(startAlt * (1 - progress)))
      }
    }
    if (unit.fixedDirection !== true && ((unit.vx ?? 0) !== 0 || (unit.vy ?? 0) !== 0)) {
      unit.direction = dir64FromPoints(0, 0, unit.vx ?? 0, unit.vy ?? 0, unit.direction)
    }
    const mSoundEntry = getMissileSoundEntry113c(
      unit.classId > 0 ? unit.classId : (unit.missileKey ?? ''),
    )
    if (mSoundEntry && mSoundEntry.travelSound > 0) {
      this.pushSoundRequest({
        kind: 'missile-tick',
        entityId: unit.id,
        x: unit.x,
        y: unit.y,
      })
    }
  } else if (!isMeteor3D && traj3d === undefined && unit.altitude !== undefined && unit.altitude > 0) {
    if (unit.verticalDescentPerTick !== undefined && unit.verticalDescentPerTick > 0) {
      // 1.13c D2Client CltDoFunc 22 (0x6fb627a0): zOffset decreases by cltParam2 per tick
      unit.altitude = Math.max(0, unit.altitude - unit.verticalDescentPerTick)
    } else if (unit.missileKey !== 'lightninghit') {
      // Purely vertical falling missiles (e.g. 1.13c blizzard1..4 with vel=0, range=9)
      const startAlt = unit.missileKey?.startsWith('blizzard') ? 120 : 240
      const progress = Math.min(
        1,
        ((unit.ageTicks ?? 0) + 1) / Math.max(1, unit.maxTicks ?? 1),
      )
      unit.altitude = Math.max(0, Math.round(startAlt * (1 - progress)))
    }
  }

  unit.ageTicks = (unit.ageTicks ?? 0) + 1
  const animSpeed = Math.max(1, unit.animSpeed ?? 16)
  const totalFrames = Math.max(1, unit.totalFrames ?? 1)
  const rawFrame = (unit.initialFrame ?? 0) + Math.floor((unit.ageTicks * animSpeed) / 16)
  if (
    unit.subLoop === 1 &&
    unit.subStart !== undefined &&
    unit.subStop !== undefined &&
    unit.subStop > unit.subStart
  ) {
    const subStart = unit.subStart
    const subStop = unit.subStop
    const burnoutFrames = Math.max(0, totalFrames - 1 - subStop)
    const ticksRemaining = Math.max(0, (unit.maxTicks ?? 1) - unit.ageTicks)
    if (burnoutFrames === 0) {
      // 1.13c D2Client.dll MISSMODE_CltDo05_GroundFire (0x6fb62f90):
      // Emergence frames [0..subStart-1], active SubLoop [subStart..subStop] with per-unit phase
      // desynchronization, and reverse emergence fade-out during the final subStart ticks.
      if (ticksRemaining < subStart) {
        unit.frame = Math.max(0, Math.min(subStart - 1, ticksRemaining))
      } else if (rawFrame < subStart) {
        unit.frame = rawFrame
      } else {
        const loopSpan = subStop - subStart + 1
        const phaseOffset = (unit.id * 7) % Math.max(1, subStop - subStart)
        unit.frame = subStart + ((rawFrame - subStart + phaseOffset) % loopSpan)
      }
    } else if (ticksRemaining > burnoutFrames) {
      if (rawFrame < subStart) {
        unit.frame = rawFrame
      } else {
        unit.frame = subStart + ((rawFrame - subStart) % (subStop - subStart + 1))
      }
    } else {
      const burnoutProgress = burnoutFrames - ticksRemaining
      unit.frame = Math.min(totalFrames - 1, subStop + 1 + burnoutProgress)
    }
  } else {
    unit.frame =
      unit.loopAnim === false ? Math.min(totalFrames - 1, rawFrame) : rawFrame % totalFrames
  }

  if (unit.missileKey === 'cursecenter') {
    // 1.13c MISSMODE_CltDo17_CurseCenter (0x6fb6bb40): CurseArea scatter waves on elapsed 0/3/6.
    tickCurseCenter113c(this.spawnMissileByKey.bind(this), unit, prevAgeTicks)
  }

  if (unit.missileKey === 'poisonexplosioncloud') {
    // 1.13c MISSMODE_CltDo04 (0x6FB6BE00 -> 0x6FB69470), run before the CltDo01 step from the cloud's
    // position: CltParam2 poisonpuff (CltSubMissile1) per spawn, 1-in-CltParam1 chance per frame (always on
    // the last frame), aimed CltParam3..2*CltParam3-1 sub-tiles away per axis; puff Vel/Range from Missiles.txt.
    unit.missileSeed ??= { lo: unit.id >>> 0, hi: 666 }
    const cfg = POISONEXPLOSIONCLOUD_113C
    for (const aim of rollPoisonCloudPuffTargets113c(
      unit.missileSeed,
      remBeforeStep,
      prevX,
      prevY,
      cfg.cltParam1,
      cfg.cltParam2,
      cfg.cltParam3,
    )) {
      this.spawnMissileByKey(cfg.cltSubMissile1, prevX, prevY, aim.x, aim.y, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        sourceSkillId: unit.sourceSkillId,
        skillLevel: unit.skillLevel,
        // Missiles.txt poisonpuff: no CollideType / CollideKill — passes through units.
        pierce: true,
      })
    }
  }

  // 1.13c Quest FX & Boss Death FX missile CltDoFunc callbacks (Issues #872, #873)
  const mSeed = unit.missileSeed ?? this._questFxSeed
  if (unit.missileKey === 'denofevillight') {
    // 1.13c MISSMODE_CltDo23 (0x6fb62980): if remaining ticks < 100, extend lifetime by +500
    if ((unit.maxTicks ?? 300) - unit.ageTicks < 100) {
      unit.maxTicks = unit.ageTicks + 500
    }
  } else if (unit.missileKey === 'cairnstones') {
    // 1.13c MISSMODE_CltDo24 (0x6fb6b8f0):
    // Phase A: random sky lightning bolts (384) around StoneAlpha when 40 < rem < 260 and elapsed % 2 === 0
    // Phase B: stone-top sky lightning bolts (384) + inter-stone ground arcs (290) when 40 < rem < 165
    const row288 = QUEST_FX_MISSILES_113C[288]!
    const rem = remBeforeStep
    const elapsed = prevAgeTicks
    if (row288.cltParam1 < rem && rem < row288.range - row288.cltParam1) {
      if (elapsed % Math.max(1, row288.cltParam2) === 0) {
        const seed: D2Seed = {
          lo: (elapsed + Math.floor(unit.x)) >>> 0,
          hi: LIGHT_SEED_HI,
        }
        const rx = 16 - d2Rand(seed, 32)
        const ry = 16 - d2Rand(seed, 32)
        const bx = Math.floor(unit.x) + rx
        const by = Math.floor(unit.y) + ry
        if (!this.isSubTileBlocked(bx, by)) {
          this.spawnCairnSkyBolt(bx, by, unit)
        }
      }
    }
    if (row288.cltParam1 < rem && rem < row288.cltParam1 + 125) {
      const row290 = QUEST_FX_MISSILES_113C[290]!
      for (const stone of this._units.values()) {
        if (
          stone.unitType !== 'object' ||
          stone.classId < 17 ||
          stone.classId > 21 ||
          Math.abs(stone.x - unit.x) >= 40 ||
          Math.abs(stone.y - unit.y) >= 40
        ) {
          continue
        }
        this.spawnCairnSkyBolt(stone.x, stone.y, unit)
        if (rem % 8 === 0) {
          const prevStone =
            unit.cairnPrevStoneId !== undefined
              ? this.getUnit('object', unit.cairnPrevStoneId)
              : undefined
          if (!prevStone) {
            unit.cairnPrevStoneId = stone.id
          } else {
            const dist = Math.hypot(prevStone.x - stone.x, prevStone.y - stone.y)
            if (dist > 1e-5) {
              const dwVel = Math.floor(((row290.vel << 8) * 75) / 100)
              const groundSpeed = (16 * dwVel) / 65536
              const groundTicks = Math.max(1, Math.floor(dist / groundSpeed))
              const gBolt = this.spawnMissileByKey(
                'cairnstonesground',
                stone.x,
                stone.y,
                prevStone.x,
                prevStone.y,
                {
                  classId: row290.id,
                  ownerType: unit.ownerType,
                  ownerId: unit.ownerId,
                  maxTicks: groundTicks,
                  pierce: true,
                  missileSeed: {
                    lo: ((stone.id ^ 0x6ac690c5) + rem) >>> 0,
                    hi: LIGHT_SEED_HI,
                  },
                },
              )
              gBolt.alwaysExplode = false
            }
            const ctrlSeed = unit.missileSeed ?? this._questFxSeed
            if (d2Rand(ctrlSeed, 4) === 0) {
              unit.cairnPrevStoneId = stone.id
            }
          }
        }
      }
    }
  } else if (unit.missileKey === 'cairnstonesground') {
    // 1.13c MISSMODE_CltDo08 (0x6fb691c0) for cairnstonesground (290):
    // spawns CltSubMissile1 = lightninghit (99) at current position with zOffset = rand(16) - 8
    const row99 = QUEST_FX_MISSILES_113C[99]!
    const zOff = d2Rand(mSeed, 16) - 8
    const initFrame = d2Rand(mSeed, row99.animLen)
    const trail = this.spawnMissileByKey(
      'lightninghit',
      unit.x,
      unit.y,
      unit.x + (unit.vx ?? 1),
      unit.y + (unit.vy ?? 0),
      {
        classId: row99.id,
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        maxTicks: row99.range,
        altitude: zOff,
        initialFrame: initFrame,
        loopAnim: false,
        expandSubMissiles: false,
      },
    )
    trail.vx = 0
    trail.vy = 0
  } else if (unit.missileKey === 'horadricstaff') {
    // 1.13c MISSMODE_CltDo31 (0x6fb64b80); rem = #10737 before the CltDoFunc 1 tail decrements it.
    const staffSeed = unit.missileSeed
    if (staffSeed === undefined) throw new Error('horadricstaff: missing unit seed (unit+0x20)')
    const tick = horadricStaffTick(remBeforeStep, Math.floor(unit.x), Math.floor(unit.y), staffSeed)
    if (tick.shake) this.startScreenShake(HORADRIC_SHAKE_SUSTAIN_MS, HORADRIC_SHAKE_AMPLITUDE, 0, 0)
    for (const spawn of tick.spawns) this.spawnHoradricStaffChild(spawn, unit)
  } else if (unit.missileKey === 'orbmist') {
    // 1.13c MISSMODE_CltDo25 (0x6fb683d0) runs before the CltDoFunc 1 tail moves the mist: elapsed = #10985 and the
    // position is the one of this tick's start.
    const mistSeed = unit.missileSeed
    if (mistSeed === undefined) throw new Error('orbmist: missing unit seed (unit+0x20)')
    const spawn = orbMistTick(prevAgeTicks, Math.floor(prevX), Math.floor(prevY), mistSeed)
    if (spawn !== null) {
      const row = ORB_MIST_MISSILE_ROWS.trail
      this.spawnMissileByKey(row.name, spawn.x, spawn.y, spawn.targetX, spawn.targetY, {
        classId: row.id,
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        maxTicks: row.range,
      })
    }
  } else if (unit.missileKey === 'diablo appears') {
    // 1.13c MISSMODE_CltDo37 (0x6fb62500):
    // rem === 150 -> StartScreenShake(4000, 25, 0, 0)
    if (remBeforeStep === 150) {
      this.startScreenShake(4000, 25, 0, 0)
    }
  } else if (unit.missileKey === 'andycontrol0') {
    // 1.13c Andariel Death Controller (#167): fire pillars, fire walls, falling debris & screen shake
    if (prevAgeTicks % 8 === 0 && remBeforeStep > 20) {
      const rx = d2Rand(mSeed, 13) - 6
      const ry = d2Rand(mSeed, 13) - 6
      const base = this.spawnMissileByKey(
        'andycolumnfirebase',
        unit.x + rx,
        unit.y + ry,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 40,
          missileSeed: mSeed,
        },
      )
      base.vx = 0
      base.vy = 0
      const angle = (d2Rand(mSeed, 64) * 2 * Math.PI) / 64
      this.spawnMissileByKey(
        'andyfirewallmaker',
        unit.x,
        unit.y,
        unit.x + Math.cos(angle) * 12,
        unit.y + Math.sin(angle) * 12 * ISO_GROUND_ASPECT_RATIO,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 20,
        },
      )
    }
    if (prevAgeTicks % 5 === 0) {
      const dx = d2Rand(mSeed, 21) - 10
      const dy = d2Rand(mSeed, 21) - 10
      const debrisIdx = (d2Rand(mSeed, 3) % 3) + 1
      const debris = this.spawnMissileByKey(
        `andyfallingdebris${debrisIdx}`,
        unit.x + dx,
        unit.y + dy,
        unit.x + dx,
        unit.y + dy,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 19,
          altitude: 240,
          verticalDescentPerTick: 13,
        },
      )
      debris.vx = 0
      debris.vy = 0
      debris.explosionMissile = `andydebrisexplosion${debrisIdx}`
      debris.alwaysExplode = true
    }
    if (prevAgeTicks === 10 || prevAgeTicks === 90) {
      this.startScreenShake(3200, 16, 0, 0)
    }
  } else if (unit.missileKey === 'andycolumnfirebase') {
    if (prevAgeTicks % 3 === 0) {
      const col = this.spawnMissileByKey('andycolumnfire', unit.x, unit.y, unit.x, unit.y, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        maxTicks: 25,
      })
      col.vx = 0
      col.vy = 0
    }
  } else if (unit.missileKey === 'andyfirewallmaker') {
    // 1.13c andycontrol0 (#307) -> andyfirewallmaker (#308, pCltDoFunc 27) drops its SubMissile1 `andyfirewall`
    // (#309: Range 25, TravelSound 0) along its path — not the Sorceress `firewall` (#69) / `firemedium` (#105),
    // whose looping TravelSound 2577 (object_fire_loop_magic) kept burning after Andariel died (#991).
    if (prevAgeTicks % 2 === 0) {
      const fw = this.spawnMissileByKey('andyfirewall', unit.x, unit.y, unit.x, unit.y, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        maxTicks: 25,
      })
      fw.vx = 0
      fw.vy = 0
    }
  } else if (unit.missileKey === 'mephistofirewallmaker') {
    // 1.13c mephistodeathcontrol (#299) -> mephistofirewallmaker (#300, pCltDoFunc 27, the same CltDoFunc as
    // andyfirewallmaker #308) drops its CltSubMissile1 `mephistofirewall` (#301: Range 25, groundFireSmall,
    // TravelSound object_fire_loop_magic) along its path — not the Sorceress `firewall` (#69, Range 90,
    // groundFireBig) + `firemedium` (#105), which doubled the looping 2577 sources every 2 frames (#999).
    if (prevAgeTicks % 2 === 0) {
      const fw = this.spawnMissileByKey('mephistofirewall', unit.x, unit.y, unit.x, unit.y, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        maxTicks: 25,
      })
      fw.vx = 0
      fw.vy = 0
    }
  } else if (unit.missileKey === 'durieldeathcontrol') {
    if (prevAgeTicks % 4 === 0) {
      const rx = d2Rand(mSeed, 17) - 8
      const ry = d2Rand(mSeed, 17) - 8
      const rock = this.spawnMissileByKey(
        'durieldeathrock',
        unit.x + rx,
        unit.y + ry,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 22,
          altitude: 220,
          verticalDescentPerTick: 10,
        },
      )
      rock.vx = 0
      rock.vy = 0
      rock.explosionMissile = 'durieldeathsmoke'
      rock.alwaysExplode = true
    }
  } else if (unit.missileKey === 'brdeathcontrol') {
    if (prevAgeTicks % 5 === 0) {
      const rx = d2Rand(mSeed, 21) - 10
      const ry = d2Rand(mSeed, 21) - 10
      this.spawnMissileByKey(
        'brdeathlightningbolt',
        unit.x,
        unit.y,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 20,
        },
      )
      this.spawnMissileByKey('brdeathspirits', unit.x, unit.y, unit.x + rx, unit.y + ry, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        maxTicks: 30,
      })
    }
  } else if (unit.missileKey === 'radamentdeath') {
    if (prevAgeTicks % 6 === 0) {
      const rx = d2Rand(mSeed, 9) - 4
      const ry = d2Rand(mSeed, 9) - 4
      const hog = this.spawnMissileByKey(
        'radamenthandofgod',
        unit.x + rx,
        unit.y + ry,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          loopAnim: false,
        },
      )
      hog.vx = 0
      hog.vy = 0
    }
  } else if (unit.missileKey === 'queendeathcenter') {
    if (prevAgeTicks % 4 === 0) {
      const rx = d2Rand(mSeed, 13) - 6
      const ry = d2Rand(mSeed, 13) - 6
      const glob = this.spawnMissileByKey(
        'queendeathglob',
        unit.x,
        unit.y,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 16,
        },
      )
      glob.explosionMissile = prevAgeTicks % 8 === 0 ? 'queendeathsplat1' : 'queendeathsplat2'
      glob.alwaysExplode = true
    }
  } else if (unit.missileKey === 'mephistodeathcontrol') {
    if (prevAgeTicks % 6 === 0) {
      const angle = (d2Rand(mSeed, 64) * 2 * Math.PI) / 64
      this.spawnMissileByKey(
        'mephistofirewallmaker',
        unit.x,
        unit.y,
        unit.x + Math.cos(angle) * 12,
        unit.y + Math.sin(angle) * 12 * ISO_GROUND_ASPECT_RATIO,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 24,
        },
      )
    }
    if (prevAgeTicks === 20) {
      const hole = this.spawnMissileByKey('mephistoholedelay', unit.x, unit.y, unit.x, unit.y, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        maxTicks: 40,
      })
      hole.vx = 0
      hole.vy = 0
    }
  } else if (unit.missileKey === 'izual control') {
    if (prevAgeTicks % 4 === 0) {
      const rx = d2Rand(mSeed, 9) - 4
      const ry = d2Rand(mSeed, 9) - 4
      const mist = this.spawnMissileByKey(
        'izual mist loop',
        unit.x + rx,
        unit.y + ry,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 30,
        },
      )
      mist.vx = 0
      mist.vy = 0
      this.spawnMissileByKey(
        'izual lightning',
        unit.x,
        unit.y,
        unit.x + rx * 2,
        unit.y + ry * 2,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 20,
        },
      )
    }
  } else if (unit.missileKey === 'diabwallmaker') {
    if (prevAgeTicks % 2 === 0) {
      const dw = this.spawnMissileByKey('diabwall', unit.x, unit.y, unit.x, unit.y, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        maxTicks: 60,
      })
      dw.vx = 0
      dw.vy = 0
    }
  } else if (unit.missileKey === 'overseercontrol') {
    if (prevAgeTicks % 5 === 0) {
      const rx = d2Rand(mSeed, 29) - 14
      const ry = d2Rand(mSeed, 29) - 14
      const catKeys = [
        { key: 'catapult meteor', exp: 'catapult meteor exp' },
        { key: 'catapult cold', exp: 'catapult cold explode' },
        { key: 'catapult plague', exp: 'catapult plague cloud' },
        { key: 'catapult charged ball', exp: 'catapult charged ball bolt' },
      ] as const
      const pick = catKeys[d2Rand(mSeed, catKeys.length) % catKeys.length]!
      const bomb = this.spawnMissileByKey(
        pick.key,
        unit.x + rx,
        unit.y + ry,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 20,
          altitude: 240,
          verticalDescentPerTick: 12,
        },
      )
      bomb.vx = 0
      bomb.vy = 0
      bomb.explosionMissile = pick.exp
      bomb.alwaysExplode = true
    }
  } else if (unit.missileKey === 'nehlithakcontrol') {
    if (prevAgeTicks % 4 === 0) {
      const rx = d2Rand(mSeed, 9) - 4
      const ry = d2Rand(mSeed, 9) - 4
      const debIdx = (d2Rand(mSeed, 4) % 4) + 1
      this.spawnMissileByKey(
        `nehlithakdebris${debIdx}`,
        unit.x,
        unit.y,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 20,
        },
      )
      if (prevAgeTicks % 8 === 0) {
        const glow = this.spawnMissileByKey('nehlithakglow', unit.x, unit.y, unit.x, unit.y, {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          loopAnim: false,
        })
        glow.vx = 0
        glow.vy = 0
      }
    }
  } else if (unit.missileKey === 'ancient death center') {
    if (prevAgeTicks % 4 === 0) {
      const rx = d2Rand(mSeed, 7) - 3
      const ry = d2Rand(mSeed, 7) - 3
      const cloud = this.spawnMissileByKey(
        'ancient death cloud',
        unit.x + rx,
        unit.y + ry,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 25,
        },
      )
      cloud.vx = 0
      cloud.vy = 0
    }
  } else if (unit.missileKey === 'baalfx control') {
    if (prevAgeTicks % 5 === 0) {
      const rx = d2Rand(mSeed, 13) - 6
      const ry = d2Rand(mSeed, 13) - 6
      const spIdx = (d2Rand(mSeed, 5) % 5) + 1
      this.spawnMissileByKey(
        `baalfx spirit ${spIdx}`,
        unit.x,
        unit.y,
        unit.x + rx,
        unit.y + ry,
        {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          maxTicks: 30,
        },
      )
    }
  }

  // Sub-missile emitter logic
  if (unit.missileKey === 'firewallmaker') {
    const pillar = this.spawnMissileByKey('firewall', unit.x, unit.y, unit.x, unit.y, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 90,
    })
    pillar.vx = 0
    pillar.vy = 0
  } else if (unit.missileKey === 'bonespear') {
    const trail = this.spawnMissileByKey('bonespeartrail', prevX, prevY, prevX, prevY, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 10,
      loopAnim: false,
    })
    trail.vx = 0
    trail.vy = 0
  } else if (unit.missileKey === 'poisonjav' || unit.missileKey === 'plaguejavelin') {
    // 1.13c CltDoFunc=7 (Missiles.txt rows 38 & 41): emit stationary poisonjavcloud wake trail
    const cloud = this.spawnMissileByKey('poisonjavcloud', prevX, prevY, prevX, prevY, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 30,
    })
    cloud.vx = 0
    cloud.vy = 0
  } else if (
    isMoving &&
    (unit.missileKey === 'lightning' ||
      unit.missileKey === 'lightningbolt' ||
      unit.missileKey === 'lightningjavelin' ||
      unit.missileKey === 'lightningstrike' ||
      unit.missileKey === 'furylightning' ||
      unit.missileKey === 'chainlightning')
  ) {
    // 1.13c CltDoFunc=8: spawn 3 interpolated trailing lightninghit beam segments per tick
    for (let s = 1; s <= 3; s++) {
      const frac = s / 3
      const sx = prevX + (unit.x - prevX) * frac
      const sy = prevY + (unit.y - prevY) * frac
      const trail = this.spawnMissileByKey('lightninghit', sx, sy, sx + (unit.vx ?? 0), sy + (unit.vy ?? 0), {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        sourceSkillId: unit.sourceSkillId,
        skillLevel: unit.skillLevel,
        maxTicks: 8,
        loopAnim: false,
      })
      trail.vx = 0
      trail.vy = 0
    }
  }
  if (unit.missileKey === 'firestormmaker') {
    const fsPatch = this.spawnMissileByKey('firestorm', unit.x, unit.y, unit.x, unit.y, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 18,
    })
    fsPatch.vx = 0
    fsPatch.vy = 0
    if ((unit.ageTicks ?? 0) % 2 === 0) {
      const fSmall = this.spawnMissileByKey('firesmall', unit.x, unit.y, unit.x, unit.y, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        sourceSkillId: unit.sourceSkillId,
        skillLevel: unit.skillLevel,
        maxTicks: 30,
      })
      fSmall.vx = 0
      fSmall.vy = 0
    }
  } else if (unit.missileKey === 'moltenboulder' && (unit.ageTicks ?? 0) % 2 === 0) {
    const fbPath = this.spawnMissileByKey('moltenboulderfirepath', prevX, prevY, prevX, prevY, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 125,
    })
    fbPath.vx = 0
    fbPath.vy = 0
    const fSmall = this.spawnMissileByKey('firesmall', unit.x, unit.y, unit.x, unit.y, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 30,
    })
    fSmall.vx = 0
    fSmall.vy = 0
  } else if (unit.missileKey === 'eruptioncenter' && prevAgeTicks > 0 && prevAgeTicks % 5 === 0) {
    // 1.13c Fissure controller (eruptioncenter, Range=80): open random fire vents within 3 subtiles every 5 frames
    const rx = (d2Rand(mSeed, 7) - 3) * 0.85
    const ry = (d2Rand(mSeed, 7) - 3) * 0.85
    const crackKey = prevAgeTicks % 10 === 0 ? 'eruption crack 1' : 'eruption crack 2'
    const crack = this.spawnMissileByKey(crackKey, unit.x + rx, unit.y + ry, unit.x + rx, unit.y + ry, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 28,
    })
    crack.vx = 0
    crack.vy = 0
    const ventFire = this.spawnMissileByKey('firesmall', unit.x + rx, unit.y + ry, unit.x + rx, unit.y + ry, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 30,
    })
    ventFire.vx = 0
    ventFire.vy = 0
  } else if (unit.missileKey === 'volcanobase' && prevAgeTicks > 0 && prevAgeTicks % 5 === 0) {
    // 1.13c Volcano controller (volcanobase, Range=150): erupt radial lava rocks every 5 frames
    const angle = (prevAgeTicks * 1.15) % (Math.PI * 2)
    const rad = 1.5 + (prevAgeTicks % 3) * 0.8
    const tx = unit.x + Math.cos(angle) * rad
    const ty = unit.y + Math.sin(angle) * rad * ISO_GROUND_ASPECT_RATIO
    const rockKey = prevAgeTicks % 10 === 0 ? 'volcanorock' : 'volcano small fire'
    const rock = this.spawnMissileByKey(rockKey, unit.x, unit.y, tx, ty, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: 20,
      altitude: 60,
      verticalDescentPerTick: 3,
    })
    rock.explosionMissile = 'fireexplode'
    rock.alwaysExplode = true
  }
  if (unit.emitterKind === 'frozenorb' && unit.ageTicks % 2 === 0) {
    for (let b = 0; b < 2; b++) {
      const angle = unit.ageTicks * 0.65 + b * Math.PI
      const tx = unit.x + Math.cos(angle) * 16
      const ty = unit.y + Math.sin(angle) * 16
      this.spawnMissileByKey('frozenorbbolt', unit.x, unit.y, tx, ty, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        sourceSkillId: unit.sourceSkillId,
        skillLevel: unit.skillLevel,
      })
    }
  } else if (unit.emitterKind === 'blizzard_controller' && unit.ageTicks % 4 === 0) {
    // 1.13c MISSMODE_SrvDo10_blizzardcenter (0x6FC60CA0) & Missiles.txt blizzard1..4 (range=9, vel=0):
    // Sample the 64-entry circle lookup table with coprime step 13 (radius = 7 sub-tiles) and spawn
    // vertical-falling blizzard1..4 shards that burst into blizzardexplode1..3 + icebreaksmall.
    const stepIndex = Math.floor(unit.ageTicks / 4)
    const circleIdx = (stepIndex * 13) % 64
    const radius = 7
    const sx = unit.x + (BLIZZARD_CIRCLE_X[circleIdx]! * radius) / 30
    const sy =
      unit.y + (BLIZZARD_CIRCLE_Y[circleIdx]! * radius * ISO_GROUND_ASPECT_RATIO) / 30
    const fallTicks = 9
    const shardKey = `blizzard${(stepIndex % 4) + 1}`
    const shard = this.spawnMissileByKey(shardKey, sx, sy, sx, sy, {
      ownerType: unit.ownerType,
      ownerId: unit.ownerId,
      sourceSkillId: unit.sourceSkillId,
      skillLevel: unit.skillLevel,
      maxTicks: fallTicks,
      altitude: 120,
    })
    shard.vx = 0
    shard.vy = 0
    shard.explosionMissile = `blizzardexplode${(stepIndex % 3) + 1}`
    shard.alwaysExplode = true
  }

  // Wall / obstacle collision check along the step segment (only for ground-level flying projectiles)
  // 1.13c D2Client.dll 0x6FB81340 / D2Game.dll 0x6FD2A5B0:
  // Check COLLIDE_MISSILE_BARRIER | COLLIDE_DOOR (0x0804) for flying missiles (CollideType 1, 3, 6),
  // 0x0805 for floor-hugging missiles (CollideType 8), or 0 for CollideType 0.
  const missileCollideType = getMissileCollideType113c(unit.missileKey)
  if (
    isMoving &&
    !isMeteor3D &&
    !isQuestFxController &&
    (unit.altitude ?? 0) <= 0 &&
    missileCollideType !== 0
  ) {
    const stepDist = Math.hypot(unit.x - prevX, unit.y - prevY)
    const samples = Math.max(1, Math.ceil(stepDist * 2))
    for (let s = 1; s <= samples; s++) {
      const t = s / samples
      const sx = prevX + (unit.x - prevX) * t
      const sy = prevY + (unit.y - prevY) * t
      if (this.isSubTileMissileBlocked(sx, sy, missileCollideType)) {
        unit.x = sx
        unit.y = sy
        if (unit.emitterKind === 'frozenorb') {
          for (let i = 0; i < 16; i++) {
            const angle = (2 * Math.PI * i) / 16
            this.spawnMissileByKey(
              'frozenorbbolt',
              unit.x,
              unit.y,
              unit.x + Math.cos(angle) * 16,
              unit.y + Math.sin(angle) * 16,
              {
                ownerType: unit.ownerType,
                ownerId: unit.ownerId,
                sourceSkillId: unit.sourceSkillId,
                skillLevel: unit.skillLevel,
              },
            )
          }
        }
        this.triggerMissileImpact(unit, unit.x, unit.y, true)
        this._units.delete(unit.key)
        return
      }
    }
  }

  // Hostile unit collision check along the step segment (only for ground-level flying projectiles, excluding Frozen Orb carrier and Fire Wall maker)
  if (
    isMoving &&
    !isMeteor3D &&
    !isQuestFxController &&
    (unit.altitude ?? 0) <= 0 &&
    unit.emitterKind !== 'frozenorb' &&
    unit.missileKey !== 'firewallmaker'
  ) {
    const hitRadius = 1.75
    const segDx = unit.x - prevX
    const segDy = unit.y - prevY
    const segLenSq = segDx * segDx + segDy * segDy
    const distToSeg = (tx: number, ty: number): number => {
      if (segLenSq <= 1e-6) return Math.hypot(tx - unit.x, ty - unit.y)
      const t = Math.max(0, Math.min(1, ((tx - prevX) * segDx + (ty - prevY) * segDy) / segLenSq))
      return Math.hypot(tx - (prevX + segDx * t), ty - (prevY + segDy * t))
    }
    if (unit.ownerType === 'monster') {
      for (const target of this._units.values()) {
        if (target.unitType !== 'player' && !(this._merc && target.id === this._merc.mercId)) {
          continue
        }
        if (target.dead) continue
        if (unit.hitUnitIds?.has(target.id)) continue
        if (distToSeg(target.x, target.y) <= hitRadius) {
          unit.hitUnitIds?.add(target.id)
          this.triggerMissileImpact(unit, target.x, target.y, false, target)
          if (!unit.pierce) {
            this._units.delete(unit.key)
            return
          }
        }
      }
    } else {
      for (const target of this._monsters.values()) {
        if (target.dead) continue
        if (this._merc && target.id === this._merc.mercId) continue
        if (this._pets.has(target.id) || target.ownerType === 'player') continue
        if (unit.hitUnitIds?.has(target.id)) continue
        if (distToSeg(target.x, target.y) <= hitRadius) {
          unit.hitUnitIds?.add(target.id)
          this.triggerMissileImpact(unit, target.x, target.y, false, target)
          if (!unit.pierce) {
            this._units.delete(unit.key)
            return
          }
        }
      }
    }
  }

  // Lifetime / range expiry check
  if (unit.ageTicks >= (unit.maxTicks ?? 1)) {
    if (unit.emitterKind === 'frozenorb') {
      for (let i = 0; i < 16; i++) {
        const angle = (2 * Math.PI * i) / 16
        this.spawnMissileByKey(
          'frozenorbbolt',
          unit.x,
          unit.y,
          unit.x + Math.cos(angle) * 16,
          unit.y + Math.sin(angle) * 16,
          {
            ownerType: unit.ownerType,
            ownerId: unit.ownerId,
            sourceSkillId: unit.sourceSkillId,
            skillLevel: unit.skillLevel,
          },
        )
      }
      this.triggerMissileImpact(unit, unit.x, unit.y, false)
    } else if (
      unit.missileKey === 'meteorcenter' ||
      unit.missileKey === 'vampiremeteorcenter' ||
      unit.missileKey === 'royalstrikemeteorcenter' ||
      ((unit.missileKey === 'meteor' ||
        unit.missileKey === 'vampiremeteor' ||
        unit.missileKey === 'royalstrikemeteor') &&
        unit.alwaysExplode)
    ) {
      // 1.13c D2Client.dll MISSMODE_CltHit18_MeteorCenter (0x6fb66540):
      // 1) 5 CltHitSubMissile1 ('meteorexplode') at cross offsets [(0,0), (0,4), (4,0), (0,-4), (-4,0)]
      // 2) 1 'whitelightmissile' (ID 154 / 0x9a, table light=5 but SetRadius(12) at spawn, range=10+slvl*10)
      //    at impact center
      // 3) 18 ground fires at METEOR_FIRE_SUBTILE_OFFSETS: indices 0..2 = CltHitSubMissile2 ('firemedium'),
      //    indices 3..17 = CltHitSubMissile3 ('firesmall'), skipping blocked sub-tiles.
      const destX = unit.targetX ?? unit.x
      const destY = unit.targetY ?? unit.y
      const slvl = Math.max(1, unit.skillLevel ?? 1)
      const isVampire =
        unit.missileKey === 'vampiremeteorcenter' || unit.missileKey === 'vampiremeteor'
      const isRoyal =
        unit.missileKey === 'royalstrikemeteorcenter' || unit.missileKey === 'royalstrikemeteor'
      const explodeKey = isVampire
        ? 'vampiremeteorexp'
        : isRoyal
          ? 'royalstrikemeteorexplode'
          : 'meteorexplode'
      for (const off of METEOR_EXPLODE_SUBTILE_OFFSETS) {
        const ex = destX + off.x
        const ey = destY + off.y
        const exp = this.spawnMissileByKey(explodeKey, ex, ey, ex, ey, {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          sourceSkillId: unit.sourceSkillId,
          skillLevel: slvl,
          loopAnim: false,
          expandSubMissiles: false,
        })
        exp.vx = 0
        exp.vy = 0
      }
      const light = this.spawnMissileByKey('whitelightmissile', destX, destY, destX, destY, {
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        sourceSkillId: unit.sourceSkillId,
        skillLevel: slvl,
        maxTicks: 10 + slvl * 10,
        expandSubMissiles: false,
      })
      light.vx = 0
      light.vy = 0
      // 0x6fb666f2-0x6fb66702: when the spawned CltHitSubMissile2 (missiles.bin +0x2e = 154 for all three meteor
      // centres) owns a light, its radius is set to 12 (0x6fb58b60), replacing the table Light=5. Issue #830.
      light.missileLightRadius = 12
      for (let i = 0; i < METEOR_FIRE_SUBTILE_OFFSETS.length; i++) {
        const off = METEOR_FIRE_SUBTILE_OFFSETS[i]!
        const fx = destX + off.x
        const fy = destY + off.y
        if (this.isSubTileBlocked(fx, fy)) continue
        const fireKey = isRoyal
          ? 'royalstrikemeteorfire'
          : i < 3
            ? 'firemedium'
            : 'firesmall'
        const fm = this.spawnMissileByKey(fireKey, fx, fy, fx, fy, {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          sourceSkillId: unit.sourceSkillId,
          skillLevel: slvl,
          expandSubMissiles: false,
        })
        fm.vx = 0
        fm.vy = 0
      }
    } else if (unit.missileKey === 'fistofares' || unit.missileKey === 'foa') {
      for (const m of this._monsters.values()) {
        if (m.dead || (this._merc && m.id === this._merc.mercId)) continue
        if (Math.hypot(m.x - unit.x, m.y - unit.y) <= 20) {
          this.spawnMissileByKey('fistoftheheavensbolt', unit.x, unit.y, m.x, m.y, {
            ownerType: unit.ownerType,
            ownerId: unit.ownerId,
            sourceSkillId: unit.sourceSkillId,
            skillLevel: unit.skillLevel,
          })
        }
      }
    } else if (unit.alwaysExplode && unit.explosionMissile) {
      this.triggerMissileImpact(unit, unit.x, unit.y, false)
      if (unit.missileKey?.startsWith('blizzard') && unit.missileKey !== 'blizzardcenter') {
        this.spawnMissileByKey('icebreaksmall', unit.x, unit.y, unit.x, unit.y, {
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          sourceSkillId: unit.sourceSkillId,
          skillLevel: unit.skillLevel,
          loopAnim: false,
        })
      }
    }
    const expSoundEntry = getMissileSoundEntry113c(
      unit.classId > 0 ? unit.classId : (unit.missileKey ?? ''),
    )
    if (expSoundEntry && expSoundEntry.travelSound > 0) {
      this.pushSoundRequest({
        kind: 'missile-destroy',
        entityId: unit.id,
      })
    }
    this._units.delete(unit.key)
  }
}

export function expireCastStatesImpl(this: ClientWorldInternal, nowMs?: number, dtMs = 0): void {
  const safeDt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0)
  if (nowMs !== undefined && Number.isFinite(nowMs)) {
    if (!this._clockExplicit) {
      for (const unit of this._units.values()) {
        if (unit.castState && nowMs < unit.castState.startedAtMs) {
          const elapsed = unit.castState.elapsedMs ?? 0
          const duration =
            unit.castState.durationMs ??
            Math.max(40, unit.castState.untilMs - unit.castState.startedAtMs)
          unit.castState.startedAtMs = nowMs - elapsed
          unit.castState.untilMs = unit.castState.startedAtMs + duration
        }
        if (unit.modeStartedAtMs !== undefined && nowMs < unit.modeStartedAtMs) {
          const elapsed = unit.modeElapsedMs ?? 0
          const duration =
            unit.modeDurationMs ??
            (unit.modeUntilMs !== undefined ? Math.max(40, unit.modeUntilMs - unit.modeStartedAtMs) : 0)
          unit.modeStartedAtMs = nowMs - elapsed
          if (unit.animStartedAtMs !== undefined && nowMs < unit.animStartedAtMs) {
            unit.animStartedAtMs = unit.modeStartedAtMs
          }
          if (unit.modeUntilMs !== undefined) {
            unit.modeUntilMs = unit.modeStartedAtMs + duration
          }
        }
      }
    }
    this._clockMs = nowMs
    this._clockExplicit = true
  } else if (safeDt > 0 && this._clockMs !== null) {
    this._clockMs += safeDt
  }

  const effNow = nowMs !== undefined && Number.isFinite(nowMs) ? nowMs : this._clockMs

  for (const unit of this._units.values()) {
    if (unit.castState) {
      if (safeDt > 0) {
        unit.castState.elapsedMs = (unit.castState.elapsedMs ?? 0) + safeDt
      }
      // Action-frame missile trigger (1.13c AnimData frame events): fire the
      // cast's missiles once the animation reaches its event frame — before
      // expiry processing so a last-frame event still fires on the same tick.
      if (
        unit.castState.missileFireDelayMs !== undefined &&
        unit.castState.missileSpawned !== true &&
        !unit.dead
      ) {
        const firedByElapsed =
          (unit.castState.elapsedMs ?? 0) >= unit.castState.missileFireDelayMs
        const firedByClock =
          effNow !== null && effNow - unit.castState.startedAtMs >= unit.castState.missileFireDelayMs
        if (firedByElapsed || firedByClock) {
          unit.castState.missileSpawned = true
          const isSelfUnit =
            unit.unitType === 'player' && (unit.id === this.selfId || this.selfId === 0)
          this.emitSkillKeyframeSound({
            skillId: unit.castState.skillId,
            flag: 1,
            x: unit.x,
            y: unit.y,
            unitId: unit.id,
            local: isSelfUnit,
          })
          this.spawnMissilesForSkill(
            unit,
            unit.castState.skillId,
            unit.castState.targetX,
            unit.castState.targetY,
            unit.castState.missileSkillLevel ?? 1,
          )
        }
      }
      const durationMs =
        unit.castState.durationMs ??
        Math.max(40, unit.castState.untilMs - unit.castState.startedAtMs)
      const expiredByClock =
        effNow !== null &&
        effNow >= unit.castState.untilMs &&
        effNow >= unit.castState.startedAtMs
      const expiredByElapsed = (unit.castState.elapsedMs ?? 0) >= durationMs

      if (expiredByClock || expiredByElapsed) {
        const castMode = unit.castState.mode
        this.clearUnitCastState(unit)
        if (
          !unit.dead &&
          (unit.mode === castMode ||
              (unit.unitType === 'player' &&
                ((unit.mode >= 7 && unit.mode <= 16) || unit.mode === 18)) ||
              (unit.unitType === 'monster' &&
                (isMonsterOneShotMode(unit.mode) || unit.mode === 14)))
        ) {
          unit.mode = unit.unitType === 'player' && isTownLevel(this.areaId) ? 5 : 1
          if (!unit.moveMode || unit.moveMode === 'stop') {
            unit.targetX = undefined
            unit.targetY = undefined
          }
        }
      }
    } else if (unit.modeUntilMs !== undefined) {
      if (unit.unitType === 'monster' && this.npcMotion.getUnit(unit.id) !== undefined) {
        continue
      }
      if (safeDt > 0) {
        unit.modeElapsedMs = (unit.modeElapsedMs ?? 0) + safeDt
      }
      const durationMs =
        unit.modeDurationMs ??
        Math.max(40, unit.modeUntilMs - (unit.modeStartedAtMs ?? 0))
      const expiredByClock =
        effNow !== null &&
        effNow >= unit.modeUntilMs &&
        effNow >= (unit.modeStartedAtMs ?? 0)
      const expiredByElapsed = (unit.modeElapsedMs ?? 0) >= durationMs

      if (expiredByClock || expiredByElapsed) {
        unit.modeUntilMs = undefined
        unit.modeDurationMs = undefined
        unit.modeElapsedMs = undefined
        unit.animStepSpeed256 = undefined
        unit.animEffRate = undefined
        if (unit.unitType === 'object' && unit.mode === 1) {
          unit.mode = 2
          const transitionMs = effNow ?? Date.now()
          unit.modeStartedAtMs = transitionMs
          unit.animStartedAtMs = transitionMs
          this.updateObjectCollisionFootprint(unit)
        } else if (unit.unitType === 'item' && unit.mode === 5) {
          // D2Client.dll 0x6fb3286a: once dwFrame >= wTotalFrames << 8, ITEMMODE_DROPPING (5)
          // transitions to ITEMMODE_ON_GROUND (3).
          unit.mode = 3
          unit.modeStartedAtMs = undefined
          unit.animStartedAtMs = undefined
        } else if (
          !unit.dead &&
          ((unit.unitType === 'player' &&
            (unit.mode === 4 || (unit.mode >= 7 && unit.mode <= 16) || unit.mode === 18)) ||
            (unit.unitType === 'monster' &&
              (isMonsterOneShotMode(unit.mode) || unit.mode === 14)))
        ) {
          unit.mode = unit.unitType === 'player' && isTownLevel(this.areaId) ? 5 : 1
        }
      }
    }
  }

  if (this._self.castState) {
    const selfUnit = this.selfId !== 0 ? this.getUnit('player', this.selfId) : undefined
    if (!selfUnit || !selfUnit.castState) {
      this._self.castState = undefined
    }
  }

  if (this._skillDelayUntilMs > 0 && effNow !== null && effNow >= this._skillDelayUntilMs) {
    this._skillDelayUntilMs = 0
    this._skillDelayDurationMs = 0
    this._self.states.delete(121)
    if (this.selfId !== 0) {
      const selfUnit = this.getUnit('player', this.selfId)
      selfUnit?.states.remove(121)
    }
  }

  // 1.13c D2Client.dll 0x6fb2b470 (MSG_TickOverheadMessages): expire unit overhead speech after 10,000 ms (0x2710)
  for (const unit of this._units.values()) {
    if (unit.overheadText !== undefined && unit.overheadExpireMs !== undefined) {
      const prevElapsed = (unit as { _overheadElapsedMs?: number | undefined })._overheadElapsedMs ?? 0
      const nextElapsed = safeDt > 0 ? prevElapsed + safeDt : prevElapsed
      ;(unit as { _overheadElapsedMs?: number | undefined })._overheadElapsedMs = nextElapsed
      const expiredByElapsed = nextElapsed >= OVERHEAD_SPEECH_TTL_MS
      const expiredByClock = effNow !== null && effNow >= unit.overheadExpireMs
      if (expiredByElapsed || expiredByClock) {
        unit.overheadText = undefined
        unit.overheadExpireMs = undefined
        unit.overheadColor = undefined
        ;(unit as { _overheadElapsedMs?: number | undefined })._overheadElapsedMs = undefined
      }
    }
  }

  // 1.13c D2Client.dll 0x6fb2b730 (MSG_DrawChatOverlay): expire active chat stream lines after 10,000 ms (0x2710)
  for (let i = this._activeChatStream.length - 1; i >= 0; i--) {
    const entry = this._activeChatStream[i]!
    if (safeDt > 0) {
      entry.elapsedMs = (entry.elapsedMs ?? 0) + safeDt
    }
    const expiredByElapsed = (entry.elapsedMs ?? 0) >= CHAT_LINE_TTL_MS
    const expiredByClock =
      effNow !== null &&
      entry.expireAtMs !== undefined &&
      entry.createdAtMs !== undefined &&
      effNow >= entry.expireAtMs &&
      effNow >= entry.createdAtMs
    if (expiredByElapsed || expiredByClock) {
      this._activeChatStream.splice(i, 1)
    }
  }
}

export function tickWorldImpl(this: ClientWorldInternal, dtMs = 40, nowMs?: number): void {
  if (!Number.isFinite(dtMs)) {
    throw new RangeError(`dtMs must be a finite number, got ${String(dtMs)}`)
  }
  const safeDt = Math.min(200, Math.max(0, dtMs))
  this._tickAccumulatorMs = Math.min(200, this._tickAccumulatorMs + safeDt)
  this._simTimeMs += safeDt

  this.expireCastStates(nowMs, safeDt)
  this.refreshSelfLocomotionAnimSpeed()

  const D2_TICK_MS = 40
  const EPSILON = 1e-4
  while (this._tickAccumulatorMs >= D2_TICK_MS - EPSILON) {
    this._tickAccumulatorMs = Math.max(0, this._tickAccumulatorMs - D2_TICK_MS)
    this.stepDiscreteSimulationTick(D2_TICK_MS, nowMs)
  }
  this.updateScreenShake()

  for (const unit of this._units.values()) {
    if (unit.dead) continue
    if (unit.unitType === 'monster' && this.npcMotion.getUnit(unit.id) !== undefined) {
      continue
    }
    if (this.skipSelfTurnStep && unit.unitType === 'player' && (unit.id === this.selfId || (this.selfId === 0 && unit.id === 1))) {
      continue
    }
    unit.advanceTurn(safeDt)
  }

  if (!this.skipSelfTurnStep && this._pendingMeleeAttack !== null && this.selfId !== 0) {
    const targetUnit = this.getUnit(
      this._pendingMeleeAttack.target.unitType,
      this._pendingMeleeAttack.target.id,
    )
    const selfUnit = this.getUnit('player', this.selfId)
    if (targetUnit && selfUnit) {
      selfUnit.targetX = targetUnit.x
      selfUnit.targetY = targetUnit.y
      selfUnit.faceToward(targetUnit.x, targetUnit.y, false)
    }
  }

  // Continuous unit movement interpolation across display frames (standalone mode, non-monster units)
  if (safeDt > 0 && !this.skipRemoteUnitStep) {
    const inTown = isTownLevel(this.areaId)
    for (const unit of this._units.values()) {
      if (
        unit.dead ||
        unit.castState ||
        unit.unitType === 'missile' ||
        unit.unitType === 'monster'
      ) {
        continue
      }
      if (unit.targetX === undefined || unit.targetY === undefined) {
        unit.moving = false
        continue
      }
      const dx = unit.targetX - unit.x
      const dy = unit.targetY - unit.y
      const dist = Math.hypot(dx, dy)
      if (dist === 0) {
        unit.moving = false
        continue
      }
      const speedSubTilesPerSec = 10
      const step = (safeDt / 1000) * speedSubTilesPerSec
      if (step <= 0) continue

      const moveDist = Math.min(step, dist)
      const ux = dx / dist
      const uy = dy / dist
      const samples = Math.max(1, Math.ceil(moveDist / 0.125))
      let lastSafeX = unit.x
      let lastSafeY = unit.y
      let hitWall = false

      for (let i = 1; i <= samples; i++) {
        const stepFrac = (moveDist * i) / samples
        const sx = i === samples && dist <= step ? unit.targetX : unit.x + ux * stepFrac
        const sy = i === samples && dist <= step ? unit.targetY : unit.y + uy * stepFrac
        if (this.isSubTileBlocked(sx, sy)) {
          hitWall = true
          break
        }
        lastSafeX = sx
        lastSafeY = sy
      }

      if (hitWall) {
        unit.x = lastSafeX
        unit.y = lastSafeY
        unit.targetX = lastSafeX
        unit.targetY = lastSafeY
        unit.moving = false
        unit.moveMode = 'stop'
        if (
          unit.unitType === 'player' &&
          (unit.mode === 2 || unit.mode === 3 || unit.mode === 6 || unit.mode === 19)
        ) {
          unit.mode = inTown ? 5 : 1
        }
        continue
      }

      if (dist <= step) {
        unit.x = unit.targetX
        unit.y = unit.targetY
        unit.moving = false
        if (
          unit.unitType === 'player' &&
          (unit.mode === 2 || unit.mode === 3 || unit.mode === 6 || unit.mode === 19)
        ) {
          unit.mode = inTown ? 5 : 1
          unit.moveMode = 'stop'
          if (unit.id === this.selfId || this.selfId === 0) {
            this._self.mode = unit.mode
            this._self.moving = false
          }
        }
      } else {
        unit.x = lastSafeX
        unit.y = lastSafeY
        unit.moving = true
      }
    }
  }

  if (!this.skipSelfTurnStep && this._pendingMeleeAttack !== null) {
    this.checkPendingMeleeAttack(nowMs)
  }
}

export function stepDiscreteSimulationTickImpl(this: ClientWorldInternal, _tickDtMs = 40, nowMs?: number): void {
  this.frameCount++
  for (const unit of this._monsters.values()) {
    if (unit.dead) continue
    const npcUnit = this.npcMotion.getUnit(unit.id)
    if (!npcUnit) continue
    if (unit.mode !== npcUnit.dwAnimMode) {
      if (unit.mode === MONMODE_KNOCKBACK && unit.moveMode === 'knockback') {
        const tx = unit.targetX ?? unit.x
        const ty = unit.targetY ?? unit.y
        const dist = Math.hypot(tx - unit.x, ty - unit.y)
        if (dist <= 1.0) {
          unit.x = tx
          unit.y = ty
          unit.moving = false
          unit.moveMode = 'stop'
          unit.mode = MONMODE_NEUTRAL
          this.npcMotion.changeAnimMode0x6FADA6C0(npcUnit, MONMODE_NEUTRAL)
          continue
        }
      }
      this.npcMotion.changeAnimMode0x6FADA6C0(npcUnit, unit.mode)
    }
  }
  this.npcMotion.tick()

  let objectNowMs: number | undefined
  const unitsSnapshot = Array.from(this._units.values())
  for (const unit of unitsSnapshot) {
    if (!this._units.has(unit.key)) continue

    // 1. Step missile units (1 simulation tick)
    if (unit.unitType === 'missile') {
      this.stepMissileUnit(unit)
      continue
    }

    // 1a. Objects: the 25 Hz animation step 0x6fad5660 (run by the per-object update 0x6fad5b40 before ClientFn),
    // which owns the client auto transition 1 → 2 and its `SetObjectLight(Lit[2])` (object-light.ts).
    if (unit.unitType === 'object') {
      objectNowMs ??= this.resolveEventNowMs(nowMs)
      const objectRecord = getObjectsTxtRecord113c(unit.classId)
      if (tickObjectAnim(unit, objectRecord, objectNowMs)) {
        this.updateObjectCollisionFootprint(unit)
      }
      // 0x6fad5b60: the per-object update then runs the object mode sound handler 0x6fad37e0 (#991 / #998).
      for (const snd of updateObjectModeSound113c(unit, objectRecord)) {
        this.pushSoundRequest({
          ...(snd.kind !== undefined ? { kind: snd.kind } : {}),
          ...(snd.soundId > 0 ? { soundId: snd.soundId } : {}),
          unit: { unitType: 'object', id: unit.id, x: unit.x, y: unit.y },
          x: unit.x,
          y: unit.y,
          ...(snd.delayTicks !== undefined ? { delayTicks: snd.delayTicks } : {}),
        })
      }
    }

    // 1b. Movement skills (#107 Charge, #132 Leap, #143 Leap Attack, #151 Whirlwind) & periodic state/summon emitters
    if (unit.unitType === 'player' && !unit.dead) {
      if (unit.castState) {
        const csSkill = unit.castState.skillId
        if (csSkill === 107 || csSkill === 132 || csSkill === 143 || csSkill === 151) {
          const dx = unit.castState.targetX - unit.x
          const dy = unit.castState.targetY - unit.y
          const dist = Math.hypot(dx, dy)
          if (dist > 0.05) {
            const step = Math.min(dist, 1.5)
            unit.x += (dx / dist) * step
            unit.y += (dy / dist) * step
          }
          if (csSkill === 151) {
            unit.direction = (unit.direction + 8) & 63
          }
        }
      }
      const blazeActive =
        unit.states.has(12) ||
        unit.states.has(13) ||
        (unit.blazeUntilTick !== undefined && this.frameCount < unit.blazeUntilTick)
      if (blazeActive) {
        if (unit.lastBlazeX === undefined || unit.lastBlazeY === undefined) {
          unit.lastBlazeX = unit.x
          unit.lastBlazeY = unit.y
        }
        const blazeDx = unit.x - unit.lastBlazeX
        const blazeDy = unit.y - unit.lastBlazeY
        const blazeDist = Math.hypot(blazeDx, blazeDy)
        if (blazeDist >= 0.75) {
          const steps = Math.min(8, Math.floor(blazeDist / 0.75))
          for (let s = 1; s <= steps; s++) {
            const bx = unit.lastBlazeX + (blazeDx * (s * 0.75)) / blazeDist
            const by = unit.lastBlazeY + (blazeDy * (s * 0.75)) / blazeDist
            const b = this.spawnMissileByKey('blaze', bx, by, bx, by, {
              ownerType: 'player',
              ownerId: unit.id,
              sourceSkillId: 46,
              skillLevel: unit.blazeSkillLevel ?? 1,
              maxTicks: 112,
            })
            b.vx = 0
            b.vy = 0
          }
          unit.lastBlazeX = unit.x
          unit.lastBlazeY = unit.y
        }
      } else {
        unit.lastBlazeX = undefined
        unit.lastBlazeY = undefined
      }

      // #119 Sanctuary (state 47, SkillCltDoFunc[86] 0x6FB07FE0): periodically spawn stationary
      // client visual missile #266 ('sanctuarybolt', maxTicks = 8) on living Undead monsters in range
      if (unit.states.has(47) && !isTownLevel(this.areaId) && this.frameCount % 25 === 0) {
        for (const m of this._monsters.values()) {
          if (m.dead || m.mode === 0 || m.mode === 12 || m.lifePct <= 0) continue
          if ((m as any).isUndead === false) continue
          if (Math.hypot(m.x - unit.x, m.y - unit.y) <= 12) {
            const bolt = this.spawnMissileByKey('sanctuarybolt', m.x, m.y, m.x, m.y, {
              ownerType: 'player',
              ownerId: unit.id,
              sourceSkillId: 119,
              maxTicks: 8,
            })
            bolt.vx = 0
            bolt.vy = 0
          }
        }
      }

      // #249 Armageddon (state 145): periodic skyfall meteor rocks around caster every 8 frames
      if (unit.armageddonUntilTick !== undefined && this.frameCount >= unit.armageddonUntilTick) {
        unit.armageddonUntilTick = undefined
        unit.states.remove(145)
        if (unit.id === this.selfId || this.selfId === 0) {
          this._self.states.delete(145)
        }
      } else if (
        (unit.states.has(145) ||
          (unit.armageddonUntilTick !== undefined && this.frameCount < unit.armageddonUntilTick)) &&
        !isTownLevel(this.areaId) &&
        this.frameCount % 8 === 0
      ) {
        const stepIdx = Math.floor(this.frameCount / 8)
        const angle = (stepIdx * 2.39996) % (Math.PI * 2)
        const rad = 1.5 + ((stepIdx * 7) % 5)
        const dropX = unit.x + Math.cos(angle) * rad
        const dropY = unit.y + Math.sin(angle) * rad * ISO_GROUND_ASPECT_RATIO
        const sLvl = unit.armageddonSkillLevel ?? 1
        const rock = this.spawnMissileByKey('armageddonrock', dropX, dropY, dropX, dropY, {
          ownerType: 'player',
          ownerId: unit.id,
          sourceSkillId: 249,
          skillLevel: sLvl,
          maxTicks: 15,
          altitude: 375,
          verticalDescentPerTick: 25,
        })
        rock.vx = 0
        rock.vy = 0
        rock.explosionMissile = 'armageddonexplosion'
        rock.alwaysExplode = true
        const tail = this.spawnMissileByKey('armageddontail', dropX, dropY, dropX, dropY, {
          ownerType: 'player',
          ownerId: unit.id,
          sourceSkillId: 249,
          skillLevel: sLvl,
          maxTicks: 15,
          altitude: 375,
          verticalDescentPerTick: 25,
        })
        tail.vx = 0
        tail.vy = 0
      }

      // #250 Hurricane (state 144): periodic 20-frame cold vortex chill & orbiting debris around caster
      if (unit.hurricaneUntilTick !== undefined && this.frameCount >= unit.hurricaneUntilTick) {
        unit.hurricaneUntilTick = undefined
        unit.states.remove(144)
        if (unit.id === this.selfId || this.selfId === 0) {
          this._self.states.delete(144)
        }
      } else if (
        (unit.states.has(144) ||
          (unit.hurricaneUntilTick !== undefined && this.frameCount < unit.hurricaneUntilTick)) &&
        !isTownLevel(this.areaId) &&
        this.frameCount % 20 === 0
      ) {
        for (const m of this._monsters.values()) {
          if (this.isFriendlyOrNonHostileMonster(m)) continue
          if (Math.hypot(m.x - unit.x, m.y - unit.y) <= 6) {
            m.states.add(29) // State 29 = Cold/Chill
          }
        }
      }
    } else if (unit.unitType === 'monster' && !unit.dead) {
      if (unit.tempSummonExpireTick !== undefined && this.frameCount >= unit.tempSummonExpireTick) {
        unit.dead = true
        unit.mode = 0
        unit.lifePct = 0
        this.attachUnitOverlay(unit, 'spawnedminion', false)
        this.triggerMonsterDeathFx(unit)
        continue
      }
      if (unit.mode === MONMODE_NEUTRAL && !isTownNpcHcIdx(unit.classId)) {
        const monRow = resolveUnitMonSoundRow113c(unit)
        if (monRow && monRow.neutral > 0 && monRow.neuTime > 0) {
          let nextTick = this._monsterNextNeutralSoundTick.get(unit.id)
          if (nextTick === undefined) {
            const jitter = (SEED_RollRandomNumber(unit.seed) >>> 0) % Math.max(1, monRow.neuTime)
            nextTick = this.frameCount + monRow.neuTime + jitter
            this._monsterNextNeutralSoundTick.set(unit.id, nextTick)
          } else if (this.frameCount >= nextTick) {
            if (this.frameCount - (this._lastGlobalNeutralSoundTick ?? -200) >= 125) {
              this._lastGlobalNeutralSoundTick = this.frameCount
              this.pushSoundRequest({
                soundId: monRow.neutral,
                unit: { unitType: 'monster', id: unit.id, x: unit.x, y: unit.y },
                x: unit.x,
                y: unit.y,
              })
            }
            const jitter = (SEED_RollRandomNumber(unit.seed) >>> 0) % Math.max(1, monRow.neuTime)
            this._monsterNextNeutralSoundTick.set(unit.id, this.frameCount + monRow.neuTime + jitter)
          }
        }
      }
      if (isMaggotSmallMonster(unit.classId, unit.name)) {
        let stomped = false
        if ((this._self.x !== 0 || this._self.y !== 0) && !this._isSelfDead) {
          if (Math.hypot(this._self.x - unit.x, this._self.y - unit.y) <= 1.5) {
            stomped = true
          }
        }
        if (!stomped) {
          for (const u of this._units.values()) {
            if (u.unitType === 'player' && !u.dead && Math.hypot(u.x - unit.x, u.y - unit.y) <= 1.5) {
              stomped = true
              break
            }
          }
        }
        if (stomped) {
          unit.dead = true
          unit.mode = 12
          unit.lifePct = 0
          unit.deathFxTriggered = true
          const npcUnit = this.npcMotion.getUnit(unit.id)
          if (npcUnit) {
            npcUnit.dwAnimMode = 12
            npcUnit.lifeByte = 0
            npcUnit.dwFlags = (npcUnit.dwFlags | 0x10000) >>> 0
          }
          continue
        }
      }
      if (unit.classId >= 351 && unit.classId <= 353) {
        unit.ageTicks = (unit.ageTicks ?? 0) + 1
        if (unit.id >= 920000 && unit.maxTicks !== undefined) {
          if (unit.ageTicks >= unit.maxTicks) {
            this._units.delete(unit.key)
            this._monsters.delete(unit.id)
            this._pets.delete(unit.id)
            this.npcMotion.removeMonster(unit.id)
            continue
          }
        }
        if (unit.ageTicks >= 12 && unit.mode === 9) {
          unit.mode = 1
          const npcUnit = this.npcMotion.getUnit(unit.id)
          if (npcUnit) {
            this.npcMotion.changeAnimMode0x6FADA6C0(npcUnit, 1)
          }
        }
        // 1.13c Hydra AI (hydra1..3, MonStats.txt AIDelay=15 + 9-frame A1 attack = ~24 ticks per head,
        // staggered by 5 ticks across the 3 heads after 12-tick S1 emergence):
        const headOffset = (unit.classId - 351) * 5
        const ticksAfterEmerge = unit.ageTicks - 14
        if (
          unit.mode !== 9 &&
          ticksAfterEmerge >= headOffset &&
          (ticksAfterEmerge - headOffset) % 24 === 0
        ) {
          for (const m of this._monsters.values()) {
            if (m.id === unit.id || this.isFriendlyOrNonHostileMonster(m)) {
              continue
            }
            if (Math.hypot(m.x - unit.x, m.y - unit.y) <= 20) {
              unit.faceToward(m.x, m.y, false)
              unit.mode = 4 // A1 attack animation
              const npcUnit = this.npcMotion.getUnit(unit.id)
              if (npcUnit) {
                this.npcMotion.changeAnimMode0x6FADA6C0(npcUnit, 4)
              }
              unit.modeStartedAtMs = this._simTimeMs
              unit.modeDurationMs = 240
              unit.modeUntilMs = this._simTimeMs + 240
              unit.modeElapsedMs = 0
              this.spawnMissileByKey('hydra', unit.x, unit.y, m.x, m.y, {
                ownerType: 'player',
                ownerId: unit.ownerId ?? 1,
                sourceSkillId: 62,
                maxTicks: 25,
              })
              break
            }
          }
        }
      }
    }

    // 2. Continuous channeling skill emission (#41 Inferno & #230 Arctic Blast CltDoFunc=28)
    if (!unit.dead && unit.castState && (unit.castState.skillId === 41 || unit.castState.skillId === 230)) {
      const chSkillId = unit.castState.skillId
      const sLvl =
        unit.unitType === 'player' && (unit.id === this.selfId || this.selfId === 0)
          ? Math.max(1, this._self.skills.get(chSkillId) ?? unit.skillLevel ?? 1)
          : Math.max(1, unit.skillLevel ?? 1)
      const maxTicks = chSkillId === 230 ? 10 + 2 * sLvl : 10 + 3 * sLvl
      const mKey =
        chSkillId === 230
          ? this.frameCount % 2 === 0
            ? 'arcticblast1'
            : 'arcticblast2'
          : this.frameCount % 2 === 0
            ? 'infernoflame1'
            : 'infernoflame2'
      const rawDx = unit.castState.targetX - unit.x
      const rawDy = unit.castState.targetY - unit.y
      const rawDist = Math.hypot(rawDx, rawDy)
      const angle =
        rawDist > 0.05
          ? Math.atan2(rawDy, rawDx)
          : ((unit.direction & 63) / 64) * Math.PI * 2
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)
      const startX = unit.x + cosA * 0.5
      const startY = unit.y + sinA * 0.5
      const aimX = startX + cosA * 16
      const aimY = startY + sinA * 16
      this.spawnMissileByKey(mKey, startX, startY, aimX, aimY, {
        ownerType: unit.unitType,
        ownerId: unit.id,
        sourceSkillId: chSkillId,
        skillLevel: sLvl,
        maxTicks,
        pierce: true,
      })
    }

    // 3. Step unit overlays (one-shot cast overlays & state overlays)
    if (unit.overlays.length > 0) {
      const remainingOverlays: ClientUnitOverlay[] = []
      for (const ov of unit.overlays) {
        ov.ageTicks += 1
        const rawFrame = Math.floor((ov.ageTicks * ov.animRate) / 16)
        if (ov.loop) {
          ov.frame = rawFrame % Math.max(1, ov.totalFrames)
          remainingOverlays.push(ov)
        } else if (ov.ageTicks < ov.maxTicks) {
          ov.frame = Math.min(Math.max(0, ov.totalFrames - 1), rawFrame)
          remainingOverlays.push(ov)
        } else if (ov.onExpire !== undefined) {
          // 1.13c overlay completion switch (D2Client 0x6FB1C1D7): chained overlays replace this one.
          for (const step of ov.onExpire) {
            remainingOverlays.push(
              createOverlayFromTxtRow113c(this._nextOverlayId++, step.overlayIndex, step.loop, step.onExpire),
            )
          }
        }
      }
      unit.overlays = remainingOverlays
    }

    // 4. Drain per-unit queued packets (unit+0xd8, 0x6fadb290 -> 0x6fb5bc20 -> 0x6fb5f560 -> 0x6fada750 -> 0x6fad5ce0 -> 0x6fad59f0)
    if (this._units.has(unit.key) && unit.queuedPackets.length > 0) {
      objectNowMs ??= this.resolveEventNowMs(nowMs)
      while (unit.queuedPackets.length > 0 && this._units.has(unit.key)) {
        const pkt = unit.queuedPackets.shift()!
        this.applyUnitModeImmediate(unit, pkt, objectNowMs)
      }
    }
  }
}
