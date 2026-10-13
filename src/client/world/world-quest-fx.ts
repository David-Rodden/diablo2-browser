/**
 * 1.13c Monster Hit/Death FX, Screen Shake, and Quest Visual Controllers (`src/client/world/world-quest-fx.ts`).
 */

import { ISO_GROUND_ASPECT_RATIO } from '../../common/data/blizzard-table.js'
import { d2Rand, LIGHT_SEED_HI, type D2Seed } from '../../common/drlg/light-grid.ts'
import {
  DURIEL_MAGGOT_HCIDX,
  DURIEL_MAGGOT_OFFSETS,
  MON_UMOD,
  calcColdEnchantedDeathNova,
  computeChargedBolt8WayVectors,
  computeIsoRadialRingVectors,
  getBossDeathFxSpec,
  getFreezeShatterMissiles,
  getInnateMonsterDeathOverlays,
  hasMonsterUMod,
  isBaalCloneMonster,
  isBoneFetishMonster,
  isDurielMonster,
  isFireTowerMonster,
  isMaggotSmallMonster,
  isPoisonDeadMonster,
  isScarabMonster,
  isSuicideMinionMonster,
} from '../../common/units/monster-death-fx.ts'
import { ClientUnit } from './client-unit.ts'
import {
  COMPELLING_ORB_MONSTER_CLASS,
  DURANCE_STAIRS_OBJECT_CLASS,
  MONUMOD_QUESTCOMPLETE,
  ORB_MIST_MISSILE_ROWS,
  orbMistTarget,
} from './quest-fx-compelling-orb-113c.ts'
import { QUEST_FX_MISSILES_113C } from './quest-fx-data-113c.ts'
import {
  HORADRIC_MISSILE_ROWS,
  HORADRIC_ORIFICE_OBJECT_CLASS,
  HORADRIC_ORIFICE_OVERLAY,
  TRAJ_FIXED_SHIFT,
  lightningTraj3d,
  staffTraj3d,
  type HoradricStaffSpawn,
} from './quest-fx-horadric-113c.ts'
import type { ClientWorldInternal } from './world-skill-state-tables.ts'

export function triggerMonsterGetHitFxImpl(this: ClientWorldInternal, unit: ClientUnit): void {
  if (unit.unitType !== 'monster' || unit.dead || unit.isMinion) return
  if (
    unit.isNpc ||
    unit.ownerType === 'player' ||
    this._pets.has(unit.id) ||
    (this._merc && unit.id === this._merc.mercId)
  ) {
    return
  }
  const vectors = computeChargedBolt8WayVectors(16)
  const mlvl = Math.max(1, unit.stats.get(12) || 1)
  if (hasMonsterUMod(unit, MON_UMOD.LIGHTNING)) {
    for (const vec of vectors) {
      this.spawnMissileByKey(
        'lightunique',
        unit.x,
        unit.y,
        unit.x + vec.dx,
        unit.y + vec.dy,
        {
          ownerType: 'monster',
          ownerId: unit.id,
          sourceSkillId: 38,
          skillLevel: Math.max(1, Math.floor(mlvl / 2)),
          jitterIndex: vec.index + 1,
        },
      )
    }
  }
  if (hasMonsterUMod(unit, MON_UMOD.SCARAB) || isScarabMonster(unit.classId, unit.name)) {
    for (const vec of vectors) {
      this.spawnMissileByKey(
        'buglightning',
        unit.x,
        unit.y,
        unit.x + vec.dx,
        unit.y + vec.dy,
        {
          ownerType: 'monster',
          ownerId: unit.id,
          sourceSkillId: 38,
          skillLevel: Math.max(1, Math.floor(mlvl / 2)),
          jitterIndex: vec.index + 1,
        },
      )
    }
  }
}

export function triggerMonsterDeathFxImpl(this: ClientWorldInternal, unit: ClientUnit): void {
  if (unit.unitType !== 'monster' || unit.deathFxTriggered) return
  this.emitMonsterModeSound(unit, 0)
  if (
    unit.isNpc ||
    unit.ownerType === 'player' ||
    this._pets.has(unit.id) ||
    (this._merc && unit.id === this._merc.mercId)
  ) {
    return
  }
  unit.deathFxTriggered = true
  const mlvl = Math.max(1, unit.stats.get(12) || 1)

  // 1. Freeze / Shatter on Death (STATE_FREEZE = 1 or MonUMod #35 shatter_on_death)
  if (unit.states.has(1) || hasMonsterUMod(unit, MON_UMOD.SHATTER_ON_DEATH)) {
    unit.corpseSuppressed = true
    const shatterMissiles = getFreezeShatterMissiles(unit.classId, this.getUnitSizeX(unit))
    for (const mKey of shatterMissiles) {
      const shard = this.spawnMissileByKey(mKey, unit.x, unit.y, unit.x, unit.y, {
        ownerType: 'monster',
        ownerId: unit.id,
        loopAnim: false,
      })
      shard.vx = 0
      shard.vy = 0
    }
  }

  // 2. MonUMod Death Effects (minions excluded per MonUMod.txt exclude=1)
  if (!unit.isMinion) {
    if (hasMonsterUMod(unit, MON_UMOD.FIRE)) {
      this.attachUnitOverlay(unit, 'fire_explode', false)
      const exp1 = this.spawnMissileByKey('fireexplode', unit.x, unit.y, unit.x, unit.y, {
        ownerType: 'monster',
        ownerId: unit.id,
        loopAnim: false,
      })
      exp1.vx = 0
      exp1.vy = 0
      const exp2 = this.spawnMissileByKey('explosion', unit.x, unit.y, unit.x, unit.y, {
        ownerType: 'monster',
        ownerId: unit.id,
        loopAnim: false,
      })
      exp2.vx = 0
      exp2.vy = 0
    }

    if (hasMonsterUMod(unit, MON_UMOD.COLD)) {
      const novaSpec = calcColdEnchantedDeathNova(mlvl)
      const ringVectors = computeIsoRadialRingVectors(novaSpec.boltCount, 16)
      for (const vec of ringVectors) {
        this.spawnMissileByKey(
          novaSpec.missileKey,
          unit.x,
          unit.y,
          unit.x + vec.dx,
          unit.y + vec.dy,
          {
            ownerType: 'monster',
            ownerId: unit.id,
            sourceSkillId: novaSpec.skillId,
            skillLevel: novaSpec.skillLevel,
          },
        )
      }
    }

    if (
      hasMonsterUMod(unit, MON_UMOD.POISON) ||
      isPoisonDeadMonster(unit.classId, unit.name)
    ) {
      const centerCloud = this.spawnMissileByKey(
        'universalpoisoncloud',
        unit.x,
        unit.y,
        unit.x,
        unit.y,
        {
          ownerType: 'monster',
          ownerId: unit.id,
          skillLevel: mlvl,
        },
      )
      centerCloud.vx = 0
      centerCloud.vy = 0
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2
        const px = unit.x + Math.cos(angle) * 1.5
        const py = unit.y + Math.sin(angle) * 1.5 * ISO_GROUND_ASPECT_RATIO
        const cloud = this.spawnMissileByKey('monsterpoisoncloud', px, py, px, py, {
          ownerType: 'monster',
          ownerId: unit.id,
          skillLevel: mlvl,
        })
        cloud.vx = 0
        cloud.vy = 0
      }
    }

    if (
      hasMonsterUMod(unit, MON_UMOD.BONEFETISH) ||
      isBoneFetishMonster(unit.classId, unit.name)
    ) {
      unit.corpseSuppressed = true
      this.attachUnitOverlay(unit, 'fetishdeath1', false)
      this.attachUnitOverlay(unit, 'fetishdeath2', false)
      for (let i = 1; i <= 4; i++) {
        const angle = ((i - 1) * Math.PI) / 2 + Math.PI / 4
        const sx = unit.x + Math.cos(angle) * 4
        const sy = unit.y + Math.sin(angle) * 4 * ISO_GROUND_ASPECT_RATIO
        this.spawnMissileByKey(`undeadmissile${i}`, unit.x, unit.y, sx, sy, {
          ownerType: 'monster',
          ownerId: unit.id,
          loopAnim: false,
        })
      }
    }

    if (hasMonsterUMod(unit, MON_UMOD.KILL_MINIONS)) {
      for (const m of this._monsters.values()) {
        if (m.id === unit.id || m.dead) continue
        if (
          (m.isMinion || m.ownerId === unit.id) &&
          Math.hypot(m.x - unit.x, m.y - unit.y) <= 25
        ) {
          m.tempSummonExpireTick = this.frameCount + 1
        }
      }
    }

    if (
      hasMonsterUMod(unit, MON_UMOD.CHARGED_BOLTS) ||
      hasMonsterUMod(unit, MON_UMOD.SCARAB) ||
      isScarabMonster(unit.classId, unit.name)
    ) {
      const boltKey =
        hasMonsterUMod(unit, MON_UMOD.SCARAB) || isScarabMonster(unit.classId, unit.name)
          ? 'buglightning'
          : 'lightunique'
      const vectors = computeChargedBolt8WayVectors(16)
      for (const vec of vectors) {
        this.spawnMissileByKey(boltKey, unit.x, unit.y, unit.x + vec.dx, unit.y + vec.dy, {
          ownerType: 'monster',
          ownerId: unit.id,
          sourceSkillId: 38,
          skillLevel: Math.max(1, Math.floor(mlvl / 2)),
          jitterIndex: vec.index + 1,
        })
      }
    }
  } else if (isBoneFetishMonster(unit.classId, unit.name)) {
    // Innate Bone Fetish death explosion applies even to minion Bone Fetishes
    unit.corpseSuppressed = true
    this.attachUnitOverlay(unit, 'fetishdeath1', false)
    this.attachUnitOverlay(unit, 'fetishdeath2', false)
    for (let i = 1; i <= 4; i++) {
      const angle = ((i - 1) * Math.PI) / 2 + Math.PI / 4
      const sx = unit.x + Math.cos(angle) * 4
      const sy = unit.y + Math.sin(angle) * 4 * ISO_GROUND_ASPECT_RATIO
      this.spawnMissileByKey(`undeadmissile${i}`, unit.x, unit.y, sx, sy, {
        ownerType: 'monster',
        ownerId: unit.id,
        loopAnim: false,
      })
    }
  } else if (isPoisonDeadMonster(unit.classId, unit.name)) {
    const centerCloud = this.spawnMissileByKey(
      'universalpoisoncloud',
      unit.x,
      unit.y,
      unit.x,
      unit.y,
      {
        ownerType: 'monster',
        ownerId: unit.id,
        skillLevel: mlvl,
      },
    )
    centerCloud.vx = 0
    centerCloud.vy = 0
  }

  // 3. Innate Monster Death Overlays & Special Monster Death Missiles
  const innateOverlays = getInnateMonsterDeathOverlays(unit.classId, unit.name)
  for (const ovToken of innateOverlays) {
    this.attachUnitOverlay(unit, ovToken, false)
  }
  if (isSuicideMinionMonster(unit.classId, unit.name)) {
    unit.corpseSuppressed = true
    const suiExp = this.spawnMissileByKey('explosion', unit.x, unit.y, unit.x, unit.y, {
      ownerType: 'monster',
      ownerId: unit.id,
      loopAnim: false,
    })
    suiExp.vx = 0
    suiExp.vy = 0
  }
  if (isFireTowerMonster(unit.classId, unit.name)) {
    const ftExp = this.spawnMissileByKey('firetower death', unit.x, unit.y, unit.x, unit.y, {
      ownerType: 'monster',
      ownerId: unit.id,
      loopAnim: false,
    })
    ftExp.vx = 0
    ftExp.vy = 0
  }
  if (isBaalCloneMonster(unit.classId, unit.name)) {
    unit.corpseSuppressed = true
    const bcExp = this.spawnMissileByKey('baal clone death', unit.x, unit.y, unit.x, unit.y, {
      ownerType: 'monster',
      ownerId: unit.id,
      loopAnim: false,
    })
    bcExp.vx = 0
    bcExp.vy = 0
  }

  // 4. Duriel (hcIdx=211) Death: 5x Small Maggots (hcIdx=227) + durieldead_fwd / durieldead_rear
  if (isDurielMonster(unit.classId, unit.name)) {
    for (let i = 0; i < DURIEL_MAGGOT_OFFSETS.length; i++) {
      const off = DURIEL_MAGGOT_OFFSETS[i]!
      let mx = unit.x + off.dx
      let my = unit.y + off.dy
      if (this.isSubTileBlocked(mx, my)) {
        mx = unit.x
        my = unit.y
      }
      const maggotId = 960000 + ((unit.id * 10 + i) % 30000)
      const maggot = new ClientUnit({
        unitType: 'monster',
        id: maggotId,
        classId: DURIEL_MAGGOT_HCIDX,
        name: 'maggot',
        x: mx,
        y: my,
        mode: 1,
        direction: (i * 12) & 0x3f,
        lifePct: 128,
        isMinion: true,
        ownerType: 'monster',
        ownerId: unit.id,
      })
      this._units.set(maggot.key, maggot)
      this._monsters.set(maggot.id, maggot)
      this.npcMotion.spawnMonster({
        unitId: maggot.id,
        classId: maggot.classId,
        x: maggot.x,
        y: maggot.y,
        mode: maggot.mode,
        direction: maggot.direction,
        lifePct: maggot.lifePct,
        isDead: false,
      })
    }
  }

  // 5. Act Boss & Quest Boss Death FX Controller + Screen Shake + Minion Purge
  const bossSpec = getBossDeathFxSpec(unit.classId, unit.name)
  if (bossSpec) {
    const ctrlSeed: D2Seed = {
      lo: ((unit.id ^ 0x6ac690c5) + Math.floor(unit.x) * 31 + Math.floor(unit.y)) >>> 0,
      hi: LIGHT_SEED_HI,
    }
    if (bossSpec.bossKey === 'diablo') {
      const ringVectors = computeIsoRadialRingVectors(16, 16)
      for (const vec of ringVectors) {
        this.spawnMissileByKey(
          'diabwallmaker',
          unit.x,
          unit.y,
          unit.x + vec.dx,
          unit.y + vec.dy,
          {
            ownerType: 'monster',
            ownerId: unit.id,
            maxTicks: bossSpec.controllerRange,
          },
        )
      }
    } else {
      const ctrl = this.spawnMissileByKey(
        bossSpec.controllerMissile,
        unit.x,
        unit.y,
        unit.x,
        unit.y,
        {
          ownerType: 'monster',
          ownerId: unit.id,
          maxTicks: bossSpec.controllerRange,
          loopAnim: true,
          missileSeed: ctrlSeed,
        },
      )
      ctrl.vx = 0
      ctrl.vy = 0
    }

    if (bossSpec.shakeAmplitude > 0 && bossSpec.shakeDurationMs > 0) {
      this.startScreenShake(bossSpec.shakeDurationMs, bossSpec.shakeAmplitude, 0, 0)
    }

    if (bossSpec.purgeSurroundingMonstersRadius > 0) {
      for (const m of this._monsters.values()) {
        if (m.id === unit.id || m.dead) continue
        if (this.isFriendlyOrNonHostileMonster(m)) continue
        if (isMaggotSmallMonster(m.classId, m.name)) continue
        const dist = Math.hypot(m.x - unit.x, m.y - unit.y)
        if (dist <= bossSpec.purgeSurroundingMonstersRadius) {
          if (
            bossSpec.bossKey === 'andariel' ||
            bossSpec.bossKey === 'shenk' ||
            m.isMinion ||
            m.ownerId === unit.id
          ) {
            m.tempSummonExpireTick = this.frameCount + 12 + (m.id % 20)
          }
        }
      }
    }
  }

  // 6. 1.13c MonUMod 22 `questcomplete` event 1 (0x6fba9fe0[22 * 5 + 1] = 0x6fad0fb0): MonStats 366 `compellingorb`
  // in mode 0 -> 0x6fb030d0, the orb mist that flows to the Durance stairs (Issue #917).
  if (
    unit.classId === COMPELLING_ORB_MONSTER_CLASS &&
    unit.mode === 0 &&
    hasMonsterUMod(unit, MONUMOD_QUESTCOMPLETE)
  ) {
    this.spawnCompellingOrbMist(unit)
  }
}

export function startScreenShakeImpl(this: ClientWorldInternal, sustainMs: number, amplitude: number, rampUpMs = 0, rampDownMs = 0): void {
  this._screenShake = {
    active: true,
    startMs: this._simTimeMs,
    rampUpMs: Math.max(0, Math.trunc(rampUpMs)),
    sustainMs: Math.max(0, Math.trunc(sustainMs)),
    rampDownMs: Math.max(0, Math.trunc(rampDownMs)),
    amplitude: Math.max(0, Math.trunc(amplitude)),
    offsetX: 0,
    offsetY: 0,
  }
  this.updateScreenShake()
}

export function updateScreenShakeImpl(this: ClientWorldInternal): void {
  const sh = this._screenShake
  if (!sh.active) return
  const dt = this._simTimeMs - sh.startMs
  const totalMs = sh.rampUpMs + sh.sustainMs + sh.rampDownMs
  if (dt < 0 || dt >= totalMs) {
    this._screenShake = {
      active: false,
      startMs: 0,
      rampUpMs: 0,
      sustainMs: 0,
      rampDownMs: 0,
      amplitude: 0,
      offsetX: 0,
      offsetY: 0,
    }
    return
  }
  let amp = 0
  if (dt < sh.rampUpMs && sh.rampUpMs > 0) {
    amp = Math.trunc((sh.amplitude * dt) / sh.rampUpMs)
  } else if (dt < sh.rampUpMs + sh.sustainMs) {
    amp = sh.amplitude
  } else if (sh.rampDownMs > 0) {
    const remDown = sh.rampDownMs - (dt - sh.rampUpMs - sh.sustainMs)
    amp = Math.trunc((sh.amplitude * remDown) / sh.rampDownMs)
  }
  if (amp > 0) {
    const offsetX = d2Rand(this._questFxSeed, 2 * amp) - amp
    const offsetY = d2Rand(this._questFxSeed, 2 * amp) - amp
    this._screenShake = { ...sh, offsetX, offsetY }
  } else {
    this._screenShake = { ...sh, offsetX: 0, offsetY: 0 }
  }
}

export function spawnDenOfEvilLightsInRoomImpl(
  this: ClientWorldInternal,
  roomSubX: number,
  roomSubY: number,
  roomSubW: number,
  roomSubH: number,
): ClientUnit[] {
  if (roomSubW <= 0 || roomSubH <= 0) return []
  const row287 = QUEST_FX_MISSILES_113C[287]!
  const spawned: ClientUnit[] = []
  let attempts = 0
  while (spawned.length < 3 && attempts < 25) {
    attempts += 1
    const dx = d2Rand(this._questFxSeed, roomSubW)
    const dy = d2Rand(this._questFxSeed, roomSubH)
    const x = roomSubX + dx
    const y = roomSubY + dy
    if (this.isSubTileBlocked(x, y)) continue
    const missileSeed: D2Seed = {
      lo: d2Rand(this._questFxSeed, 0x7fffffff),
      hi: LIGHT_SEED_HI,
    }
    const dir64 = d2Rand(missileSeed, 64)
    const initialFrame = d2Rand(missileSeed, row287.animLen)
    const lightUnit = this.spawnMissileByKey('denofevillight', x, y, x, y, {
      classId: row287.id,
      ownerType: 'player',
      ownerId: this.selfId || 1,
      maxTicks: row287.range,
      loopAnim: true,
      direction: dir64,
      initialFrame,
      missileSeed,
    })
    lightUnit.vx = 0
    lightUnit.vy = 0
    spawned.push(lightUnit)
  }
  return spawned
}

export function spawnCairnStonesControllerImpl(this: ClientWorldInternal, stoneX: number, stoneY: number): ClientUnit {
  const row288 = QUEST_FX_MISSILES_113C[288]!
  const missileSeed: D2Seed = {
    lo: (Math.floor(stoneX) ^ 0x6ac690c5) >>> 0,
    hi: LIGHT_SEED_HI,
  }
  const ctrl = this.spawnMissileByKey('cairnstones', stoneX, stoneY, stoneX, stoneY, {
    classId: row288.id,
    ownerType: 'player',
    ownerId: this.selfId || 1,
    maxTicks: row288.range,
    loopAnim: true,
    missileSeed,
  })
  ctrl.vx = 0
  ctrl.vy = 0
  return ctrl
}

export function spawnDiabloAppearsControllerImpl(this: ClientWorldInternal, x: number, y: number): ClientUnit {
  const row372 = QUEST_FX_MISSILES_113C[372]!
  const ctrl = this.spawnMissileByKey('diablo appears', x, y, x, y, {
    classId: row372.id,
    ownerType: 'player',
    ownerId: this.selfId || 1,
    maxTicks: row372.range,
    loopAnim: false,
  })
  ctrl.vx = 0
  ctrl.vy = 0
  return ctrl
}

export function spawnCompellingOrbMistImpl(this: ClientWorldInternal, orb: ClientUnit): ClientUnit {
  if (orb.unitType !== 'monster' || orb.classId !== COMPELLING_ORB_MONSTER_CLASS) {
    throw new Error(`spawnCompellingOrbMist: unit ${orb.key} is not MonStats 366 compellingorb`)
  }
  const finder = this._nearRoomObjectFinder
  if (finder === null) {
    throw new Error('spawnCompellingOrbMist: no D2Common #10754 room object finder registered')
  }
  const x = Math.floor(orb.x)
  const y = Math.floor(orb.y)
  const stairs = finder(x, y, DURANCE_STAIRS_OBJECT_CLASS)
  const target = orbMistTarget({ x, y }, stairs === null ? null : { x: Math.floor(stairs.x), y: Math.floor(stairs.y) })
  const row = ORB_MIST_MISSILE_ROWS.mist
  const mist = this.spawnMissileByKey(row.name, x, y, target.x, target.y, {
    classId: row.id,
    ownerType: 'monster',
    ownerId: orb.id,
    maxTicks: row.range,
    loopAnim: true,
    // UNVERIFIED: the initial unit seed of a client missile (unit+0x20) is not ported; the RAND steps are.
    missileSeed: { lo: d2Rand(this._questFxSeed, 0x7fffffff), hi: LIGHT_SEED_HI },
  })
  this.pushSoundRequest({ stingerSoundId: 4687 })
  return mist
}

export function spawnHoradricStaffAtOrificeImpl(this: ClientWorldInternal, orifice: ClientUnit): ClientUnit {
  if (orifice.unitType !== 'object' || orifice.classId !== HORADRIC_ORIFICE_OBJECT_CLASS) {
    throw new Error(`spawnHoradricStaffAtOrifice: unit ${orifice.key} is not objects.txt 152 orifice`)
  }
  const row = HORADRIC_MISSILE_ROWS.staff
  const x = Math.floor(orifice.x)
  const y = Math.floor(orifice.y)
  const staff = this.spawnMissileByKey(row.name, x, y, x, y, {
    classId: row.id,
    ownerType: 'player',
    ownerId: this.selfId || 1,
    maxTicks: row.range,
    loopAnim: true,
    // UNVERIFIED: the initial unit seed of a client missile (unit+0x20) is not ported; the RAND steps are.
    missileSeed: { lo: d2Rand(this._questFxSeed, 0x7fffffff), hi: LIGHT_SEED_HI },
  })
  staff.vx = 0
  staff.vy = 0
  staff.traj3d = staffTraj3d()
  staff.altitude = staff.traj3d.z >> TRAJ_FIXED_SHIFT
  if (this.attachServerOverlay(orifice, HORADRIC_ORIFICE_OVERLAY) === undefined) {
    throw new Error('spawnHoradricStaffAtOrifice: Overlay.txt 181 light_jet was not created')
  }
  this.pushSoundRequest({ stingerSoundId: 4690 })
  return staff
}

export function spawnHoradricStaffChildImpl(this: ClientWorldInternal, spawn: HoradricStaffSpawn, staff: ClientUnit): ClientUnit {
  const owner = { ownerType: staff.ownerType, ownerId: staff.ownerId }
  switch (spawn.kind) {
    case 'light': {
      const row = HORADRIC_MISSILE_ROWS.light
      const unit = this.spawnMissileByKey(row.name, spawn.x, spawn.y, spawn.x, spawn.y, {
        classId: row.id,
        ...owner,
        maxTicks: spawn.frames, // #10558 / #10970
        direction: spawn.dir, // #10706
        loopAnim: true,
      })
      unit.vx = 0
      unit.vy = 0
      unit.fixedDirection = true
      return unit
    }
    case 'lightning': {
      const row = HORADRIC_MISSILE_ROWS.lightning
      const unit = this.spawnMissileByKey(row.name, spawn.x, spawn.y, spawn.targetX, spawn.targetY, {
        classId: row.id,
        ...owner,
        maxTicks: row.range,
        direction: spawn.dir,
      })
      unit.direction = spawn.dir // #10706 after create; #10520(path, 0) keeps it
      unit.fixedDirection = true
      unit.traj3d = lightningTraj3d()
      unit.altitude = unit.traj3d.z >> TRAJ_FIXED_SHIFT
      return unit
    }
    case 'dust': {
      const row = HORADRIC_MISSILE_ROWS.dust
      const unit = this.spawnMissileByKey(row.name, spawn.x, spawn.y, spawn.targetX, spawn.targetY, {
        classId: row.id,
        ...owner,
        maxTicks: row.range,
      })
      unit.animSpeed = spawn.animSpeed // #10441(unit, 0x40)
      return unit
    }
  }
}

export function spawnCairnSkyBoltImpl(this: ClientWorldInternal, x: number, y: number, parent: ClientUnit): ClientUnit {
  const row384 = QUEST_FX_MISSILES_113C[384]!
  const descentTicks = Math.max(1, Math.trunc(row384.cltParam1 / Math.max(1, row384.cltParam2)))
  const bolt = this.spawnMissileByKey('cairn stones bolt', x, y, x, y, {
    classId: row384.id,
    ownerType: parent.ownerType,
    ownerId: parent.ownerId,
    maxTicks: descentTicks,
    altitude: row384.cltParam1,
    verticalDescentPerTick: row384.cltParam2,
    loopAnim: true,
    expandSubMissiles: false,
  })
  bolt.vx = 0
  bolt.vy = 0
  return bolt
}
