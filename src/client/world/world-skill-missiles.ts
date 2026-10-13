/**
 * Client-side Skill Missiles, Overlays, Cast Spawners, and Audio Dispatchers (`src/client/world/world-skill-missiles.ts`).
 */

import {
  convertMonsterSoundMode113c,
  isUnshippedMonsterSoundId113c,
  resolveUnitMonSoundRow113c,
  type MonSoundRow113c,
} from '../../common/audio/mon-sounds-113c.ts'
import {
  getMissileSoundEntry113c,
  getSkillSoundEntry113c,
  normalizePlayerClassCode113c,
} from '../../common/audio/skill-sounds-113c.ts'
import { ISO_GROUND_ASPECT_RATIO } from '../../common/data/blizzard-table.js'
import { SKILLS_BY_ID } from '../../common/data/skills-catalog.ts'
import {
  D2COMMON_10160_PathUpdateDirection,
  PATH_ComputePathChargedBolt_6FDB6AA0,
} from '../../common/path/index.ts'
import { SEED_RollRandomNumber } from '../../common/rng/d2-rng.ts'
import {
  CANONICAL_113C_MISSILES,
  getMissileTxtData,
  getOverlayTxtData,
  getSkillCastOverlay,
} from '../../common/skills/missiles-data.ts'
import { getSkillAnimModes, resolveSkillSequenceFrame } from '../../common/skills/skill-anim-modes.ts'
import { resolveThrowMissileForItemCode } from '../../common/skills/weapon-combat-meta.ts'
import {
  computeActionFrameTicks,
  computeOneShotDurationMs,
  computeSequenceDurationMs,
  getCharAnimClip113c,
  resolveEquippedWeaponClass,
} from '../../common/units/char-anim-speed.ts'
import { dir64FromPoints } from '../../common/units/direction.ts'
import {
  MONSTATS2_FLAGINDEX,
  canMonsterClassBeCursed113c,
  hasMonStats2Flag,
} from '../../common/units/monstats2-flags.ts'
import { computeIsoRadialRingVectors } from '../../common/units/monster-death-fx.ts'
import { getMonsterSizeXByHcIdx } from '../../common/units/monster-mapping.ts'
import {
  PLAYER_SOUND_TABLE_0x6FBA7694,
  type WorldSoundRequest,
} from '../audio/d2gs-play-sound-113c.ts'
import { OVERLAY_TXT_ROWS } from '../render/overlay-txt-rows.ts'
import { STATE_OVERLAYS } from '../render/overlays-meta.ts'
import { syncBoneArmorOverlays113c } from './bone-armor-overlays-113c.ts'
import { ClientUnit, type ClientUnitOverlay, type UnitCastState } from './client-unit.ts'
import { CURSECENTER_RANGE_113C, curseVisualRadius113c } from './curse-center-113c.ts'
import { stateOnSoundRequest113c } from './state-on-sound-113c.ts'
import {
  POISONEXPLOSIONCLOUD_113C,
  computeCltDo17FanAimPoints113c,
  poisonExplosionCloudOffsets113c,
  ringMissileSpeedSubTilesPerTick113c,
} from './nec-poison-bone-113c.ts'
import {
  ALL_CURSE_TARGET_OVERLAY_SET,
  ALL_PALADIN_AURA_STATES,
  ALL_TYPE1_CURSE_STATES,
  CROSSBOW_ITEM_CODES,
  CURSE_CLT_MISSILE_A,
  CURSE_SKILL_STATES,
  CURSE_TARGET_OVERLAYS,
  LINEAR_SKILL_MISSILES,
  OVERLAY_INDICES_NOT_REPLACED,
  PALADIN_AURA_SKILL_STATES,
  RADIAL_RING_SKILLS,
  SELF_BUFF_SKILL_STATES,
  getCurseRadiusSubtiles113c,
  type ClientWorldInternal,
  type SpawnMissileOptions,
} from './world-skill-state-tables.ts'

export function pushSoundRequestImpl(this: ClientWorldInternal, req: WorldSoundRequest): void {
  if (req.soundId !== undefined && isUnshippedMonsterSoundId113c(req.soundId)) {
    return
  }
  const clean: Record<string, unknown> = {}
  if (req.kind !== undefined) clean.kind = req.kind
  if (req.soundId !== undefined) clean.soundId = req.soundId
  if (req.speechSoundId !== undefined) clean.speechSoundId = req.speechSoundId
  if (req.stingerSoundId !== undefined) {
    clean.stingerSoundId = req.stingerSoundId
  } else if (req.soundId !== undefined && req.soundId >= 4685 && req.soundId <= 4698) {
    clean.stingerSoundId = req.soundId
  }
  if (req.eventCode !== undefined) clean.eventCode = req.eventCode
  if (req.skillId !== undefined) clean.skillId = req.skillId
  if (req.charclass !== undefined) clean.charclass = req.charclass
  if (req.flag !== undefined) clean.flag = req.flag
  if (req.weaponSoundId !== undefined) clean.weaponSoundId = req.weaponSoundId
  if (req.missileId !== undefined) clean.missileId = req.missileId
  if (req.entityId !== undefined) clean.entityId = req.entityId
  if (req.prog !== undefined) clean.prog = req.prog
  if (req.local !== undefined) clean.local = req.local
  if (req.unitId !== undefined) clean.unitId = req.unitId
  if (req.unitType !== undefined) clean.unitType = req.unitType
  if (req.classId !== undefined) clean.classId = req.classId
  if (req.unit !== undefined) {
    const uType = req.unit.unitType
    const uId = req.unit.id
    const isLocalPlayer =
      req.unit.isLocalPlayer ??
      (uType === 'player' && (uId === this.selfId || this.selfId === 0))
    const unitObj = this.getUnit(uType, uId)
    const resolvedX =
      req.unit.x ??
      req.x ??
      (unitObj ? unitObj.x : isLocalPlayer ? this._self.x : 0)
    const resolvedY =
      req.unit.y ??
      req.y ??
      (unitObj ? unitObj.y : isLocalPlayer ? this._self.y : 0)
    clean.unit = {
      unitType: uType,
      id: uId,
      x: resolvedX,
      y: resolvedY,
      ...(isLocalPlayer ? { isLocalPlayer: true } : {}),
    }
    clean.x = req.x ?? resolvedX
    clean.y = req.y ?? resolvedY
  } else {
    if (req.x !== undefined) clean.x = req.x
    if (req.y !== undefined) clean.y = req.y
  }
  if (req.delayTicks !== undefined) clean.delayTicks = req.delayTicks
  if (req.volume !== undefined) clean.volume = req.volume
  if (req.volumeOverride !== undefined) clean.volumeOverride = req.volumeOverride
  const queue: WorldSoundRequest[] = this._soundRequests
  const entityId = req.entityId
  if (req.kind === 'missile-tick' && entityId !== undefined) {
    // A travel-sound position update supersedes the previous one for the same missile (#991): keep one per id
    // so a crowd of looping missiles (Andariel's death fire) cannot flood the queue.
    const prev = queue.findIndex(q => q.kind === 'missile-tick' && q.entityId === entityId)
    if (prev >= 0) {
      queue[prev] = clean as unknown as WorldSoundRequest
      return
    }
  }
  if (entityId !== undefined) {
    const tracked = this._soundMissileIds as Set<number> | undefined
    if (req.kind === 'missile-spawn') tracked?.add(entityId)
    else if (req.kind === 'missile-destroy') tracked?.delete(entityId)
  }
  if (req.unit !== undefined && req.unit.unitType === 'object') {
    const trackedObjects = this._soundLoopObjectIds as Set<number> | undefined
    if (req.kind === 'unit-loop-start') trackedObjects?.add(req.unit.id)
    else if (req.kind === 'unit-loop-stop') trackedObjects?.delete(req.unit.id)
  }
  queue.push(clean as unknown as WorldSoundRequest)
  while (queue.length > WORLD_SOUND_QUEUE_CAP) {
    // Evict the oldest droppable request. Lifecycle requests (missile-destroy stops a looping travel sound,
    // speech-stop / npc-cancel stop speech) are never dropped, or the sound they stop would play forever (#991).
    const victim = queue.findIndex(q => !isLifecycleSoundRequest(q))
    if (victim < 0) break
    queue.splice(victim, 1)
  }
}

/** Soft cap of the per-frame world sound queue (droppable requests only). */
export const WORLD_SOUND_QUEUE_CAP = 64

/** Requests that stop a running sound; dropping them leaks the sound (e.g. a looping travel or object sound). */
export function isLifecycleSoundRequest(req: WorldSoundRequest): boolean {
  return (
    req.kind === 'missile-destroy' ||
    req.kind === 'unit-loop-stop' ||
    req.kind === 'speech-stop' ||
    req.kind === 'npc-cancel'
  )
}

export function emitSkillCastSoundImpl(this: ClientWorldInternal, opts: {
  readonly skillId?: number | undefined
  readonly charclass?: string | number | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly unitId?: number | undefined
  readonly local?: boolean | undefined
}): void {
  const skillId = Number(opts.skillId ?? 0)
  if (!Number.isFinite(skillId) || skillId <= 0) return
  const entry = getSkillSoundEntry113c(skillId)
  if (!entry) return
  const cls = normalizePlayerClassCode113c(opts.charclass ?? this._self.charClass)
  const soundId =
    cls && entry.charclass === cls && entry.stsoundclass > 0
      ? entry.stsoundclass
      : entry.stsound
  if (soundId <= 0) return
  const isLocal =
    opts.local ??
    (opts.unitId !== undefined
      ? opts.unitId === this.selfId || (this.selfId === 0 && opts.unitId === 1)
      : true)
  this.pushSoundRequest({
    kind: 'skill-cast',
    soundId,
    skillId,
    ...(cls ? { charclass: cls } : {}),
    ...(opts.x !== undefined ? { x: Number(opts.x) } : {}),
    ...(opts.y !== undefined ? { y: Number(opts.y) } : {}),
    ...(opts.unitId !== undefined ? { unitId: Number(opts.unitId) } : {}),
    local: isLocal,
    ...(entry.stsounddelay > 0 ? { delayTicks: entry.stsounddelay } : {}),
  })
}

export function emitSkillKeyframeSoundImpl(this: ClientWorldInternal, opts: {
  readonly skillId?: number | undefined
  readonly flag?: number | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly unitId?: number | undefined
  readonly local?: boolean | undefined
  readonly weaponSoundId?: number | undefined
}): void {
  const skillId = Number(opts.skillId ?? 0)
  if (!Number.isFinite(skillId) || skillId <= 0) return
  const entry = getSkillSoundEntry113c(skillId)
  if (!entry) return
  const flag = opts.flag ?? 1
  const soundId =
    flag === 2 && entry.dosoundA > 0
      ? entry.dosoundA
      : flag === 3 && entry.dosoundB > 0
        ? entry.dosoundB
        : entry.dosound > 0
          ? entry.dosound
          : entry.dosoundA > 0
            ? entry.dosoundA
            : entry.dosoundB
  const effSoundId = soundId > 0 ? soundId : (opts.weaponSoundId ?? 0)
  if (effSoundId <= 0) return
  this.pushSoundRequest({
    kind: 'skill-keyframe',
    soundId: effSoundId,
    skillId,
    flag,
    ...(opts.weaponSoundId !== undefined ? { weaponSoundId: opts.weaponSoundId } : {}),
    ...(opts.x !== undefined ? { x: Number(opts.x) } : {}),
    ...(opts.y !== undefined ? { y: Number(opts.y) } : {}),
    ...(opts.unitId !== undefined ? { unitId: Number(opts.unitId) } : {}),
    ...(opts.local !== undefined ? { local: opts.local } : {}),
  })
}

export function emitMissileSpawnSoundImpl(this: ClientWorldInternal, opts: {
  readonly missileId?: number | string | undefined
  readonly entityId?: number | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
}): void {
  if (opts.missileId === undefined) return
  const entry = getMissileSoundEntry113c(opts.missileId)
  if (!entry || entry.travelSound <= 0) return
  this.pushSoundRequest({
    kind: 'missile-spawn',
    soundId: entry.travelSound,
    missileId: entry.id,
    ...(opts.entityId !== undefined ? { entityId: Number(opts.entityId) } : {}),
    ...(opts.x !== undefined ? { x: Number(opts.x) } : {}),
    ...(opts.y !== undefined ? { y: Number(opts.y) } : {}),
  })
}

export function emitMissileImpactSoundImpl(this: ClientWorldInternal, opts: {
  readonly missileId?: number | string | undefined
  readonly entityId?: number | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly prog?: boolean | undefined
}): void {
  if (opts.missileId === undefined) return
  const entry = getMissileSoundEntry113c(opts.missileId)
  if (!entry) return
  const soundId = opts.prog
    ? entry.progSound > 0
      ? entry.progSound
      : entry.hitSound
    : entry.hitSound > 0
      ? entry.hitSound
      : entry.progSound
  if (soundId <= 0) return
  this.pushSoundRequest({
    kind: 'missile-impact',
    soundId,
    missileId: entry.id,
    ...(opts.entityId !== undefined ? { entityId: Number(opts.entityId) } : {}),
    ...(opts.x !== undefined ? { x: Number(opts.x) } : {}),
    ...(opts.y !== undefined ? { y: Number(opts.y) } : {}),
    ...(opts.prog !== undefined ? { prog: Boolean(opts.prog) } : {}),
  })
}

export function emitUnitDeathSoundImpl(this: ClientWorldInternal, opts: {
  readonly unitType?: number | string | undefined
  readonly unitId?: number | undefined
  readonly classId?: number | undefined
  readonly soundId?: number | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
}): void {
  const unitId = opts.unitId !== undefined ? Number(opts.unitId) : undefined
  if (unitId !== undefined && unitId > 0) {
    if (this._deadSoundUnitIds.has(unitId)) {
      return
    }
    this._deadSoundUnitIds.add(unitId)
  }
  let soundId = opts.soundId !== undefined ? Number(opts.soundId) : 0
  let delayTicks: number | undefined
  if (soundId <= 0) {
    const isPlayer = opts.unitType === 0 || opts.unitType === 'player'
    if (isPlayer) {
      const clsIdx = Math.max(0, Math.min(6, Number(opts.classId ?? this._self.charClass ?? 0)))
      soundId = PLAYER_SOUND_TABLE_0x6FBA7694[clsIdx]?.death1 ?? 2883
    } else {
      const mUnit = unitId !== undefined ? this._monsters.get(unitId) : undefined
      const monRow = resolveUnitMonSoundRow113c(
        mUnit ?? { classId: Number(opts.classId ?? 1) },
      )
      soundId = monRow?.deathSound && monRow.deathSound > 0 ? monRow.deathSound : 1094
      if (monRow && monRow.deaDelay > 0) {
        delayTicks = monRow.deaDelay
      }
    }
  }
  if (soundId <= 0) return
  this.pushSoundRequest({
    kind: 'unit-death',
    soundId,
    ...(opts.unitType !== undefined ? { unitType: opts.unitType } : {}),
    ...(unitId !== undefined ? { unitId } : {}),
    ...(opts.classId !== undefined ? { classId: Number(opts.classId) } : {}),
    ...(opts.x !== undefined ? { x: Number(opts.x) } : {}),
    ...(opts.y !== undefined ? { y: Number(opts.y) } : {}),
    ...(delayTicks !== undefined && delayTicks > 0 ? { delayTicks } : {}),
  })
}

export function emitMonsterModeSoundImpl(this: ClientWorldInternal, unit: ClientUnit, rawMode: number, skillId?: number): void {
  if (unit.unitType !== 'monster') return
  const row: MonSoundRow113c | undefined = resolveUnitMonSoundRow113c(unit)
  if (!row) return
  const effSkillId = skillId ?? unit.castState?.skillId ?? unit.lastSkillId
  const mode = convertMonsterSoundMode113c(row, rawMode, effSkillId)
  const unitRef = {
    unitType: 'monster' as const,
    id: unit.id,
    x: unit.x,
    y: unit.y,
  }
  switch (mode) {
    case 0: {
      // DT: DeathSound + DeaDelay (deduped per unitId via _deadSoundUnitIds)
      if (unit.id > 0) {
        if (this._deadSoundUnitIds.has(unit.id)) return
        this._deadSoundUnitIds.add(unit.id)
      }
      // D2Client.dll 0x6fad37e9..0x6fad3802: skip monster death vocal when STATE_FREEZE (43) is active
      if (unit.states?.has(43)) return
      if (row.deathSound > 0) {
        this.pushSoundRequest({
          kind: 'unit-death',
          soundId: row.deathSound,
          unit: unitRef,
          unitType: 1,
          unitId: unit.id,
          classId: unit.classId,
          x: unit.x,
          y: unit.y,
          ...(row.deaDelay > 0 ? { delayTicks: row.deaDelay } : {}),
        })
      }
      break
    }
    case 3:
    case 13: {
      // GH (3) / KB (13): HitSound + HitDelay
      if (row.hitSound > 0) {
        this.pushSoundRequest({
          soundId: row.hitSound,
          unit: unitRef,
          x: unit.x,
          y: unit.y,
          ...(row.hitDelay > 0 ? { delayTicks: row.hitDelay } : {}),
        })
      }
      break
    }
    case 4: {
      // A1: Attack1 (Att1Prb / Att1Del) + Weapon1 (Wea1Del / Wea1Vol)
      if (row.attack1 > 0) {
        const playAtt1 =
          row.att1Prb <= 0 ||
          row.att1Prb >= 100 ||
          ((SEED_RollRandomNumber(unit.seed) >>> 0) % 100) < row.att1Prb
        if (playAtt1) {
          this.pushSoundRequest({
            soundId: row.attack1,
            unit: unitRef,
            x: unit.x,
            y: unit.y,
            ...(row.att1Del > 0 ? { delayTicks: row.att1Del } : {}),
          })
        }
      }
      if (row.weapon1 > 0) {
        this.pushSoundRequest({
          soundId: row.weapon1,
          unit: unitRef,
          x: unit.x,
          y: unit.y,
          ...(row.wea1Del > 0 ? { delayTicks: row.wea1Del } : {}),
          ...(row.wea1Vol > 0 ? { volume: row.wea1Vol } : {}),
        })
      }
      break
    }
    case 5: {
      // A2: Attack2 (Att2Prb / Att2Del) + Weapon2 (Wea2Del / Wea2Vol)
      if (row.attack2 > 0) {
        const playAtt2 =
          row.att2Prb <= 0 ||
          row.att2Prb >= 100 ||
          ((SEED_RollRandomNumber(unit.seed) >>> 0) % 100) < row.att2Prb
        if (playAtt2) {
          this.pushSoundRequest({
            soundId: row.attack2,
            unit: unitRef,
            x: unit.x,
            y: unit.y,
            ...(row.att2Del > 0 ? { delayTicks: row.att2Del } : {}),
          })
        }
      }
      if (row.weapon2 > 0) {
        this.pushSoundRequest({
          soundId: row.weapon2,
          unit: unitRef,
          x: unit.x,
          y: unit.y,
          ...(row.wea2Del > 0 ? { delayTicks: row.wea2Del } : {}),
          ...(row.wea2Vol > 0 ? { volume: row.wea2Vol } : {}),
        })
      }
      break
    }
    case 8: {
      if (row.skill1 > 0) {
        this.pushSoundRequest({
          soundId: row.skill1,
          unit: unitRef,
          x: unit.x,
          y: unit.y,
        })
      }
      break
    }
    case 9: {
      if (row.skill2 > 0) {
        this.pushSoundRequest({
          soundId: row.skill2,
          unit: unitRef,
          x: unit.x,
          y: unit.y,
        })
      }
      break
    }
    case 10: {
      if (row.skill3 > 0) {
        this.pushSoundRequest({
          soundId: row.skill3,
          unit: unitRef,
          x: unit.x,
          y: unit.y,
        })
      }
      break
    }
    case 11: {
      if (row.skill4 > 0) {
        this.pushSoundRequest({
          soundId: row.skill4,
          unit: unitRef,
          x: unit.x,
          y: unit.y,
        })
      }
      break
    }
    case 2:
    case 15: {
      // WL (2) / RN (15): Footstep (FsPrb / FsOff) + FootstepLayer (FsOff)
      if (row.footstep > 0) {
        const playFs =
          row.fsPrb <= 0 ||
          row.fsPrb >= 100 ||
          ((SEED_RollRandomNumber(unit.seed) >>> 0) % 100) < row.fsPrb
        if (playFs) {
          this.pushSoundRequest({
            soundId: row.footstep,
            unit: unitRef,
            x: unit.x,
            y: unit.y,
            ...(row.fsOff > 0 ? { delayTicks: row.fsOff } : {}),
          })
        }
      }
      if (row.footstepLayer > 0) {
        this.pushSoundRequest({
          soundId: row.footstepLayer,
          unit: unitRef,
          x: unit.x,
          y: unit.y,
          ...(row.fsOff > 0 ? { delayTicks: row.fsOff } : {}),
        })
      }
      break
    }
    default:
      break
  }
}

export function attachUnitOverlayImpl(this: ClientWorldInternal, unit: ClientUnit, overlayToken: string, loop = false): ClientUnitOverlay {
  const cleanToken = overlayToken.trim().toLowerCase()
  const ovData = getOverlayTxtData(cleanToken)
  const totalFrames = Math.max(1, ovData.frames || 14)
  const animRate = Math.max(1, ovData.animRate || 16)
  const maxTicks = Math.max(1, Math.ceil((totalFrames * 16) / animRate))
  // Overlay.txt `Trans` draw level passed through unclamped (0 none .. 5 modulate);
  // the drawable layer maps it via `overlayTransToBlendMode`.
  const blendMode = ovData.trans
  const entry: ClientUnitOverlay = {
    overlayId: this._nextOverlayId++,
    token: cleanToken,
    frame: 0,
    totalFrames,
    animRate,
    loop,
    blendMode,
    xOffset: ovData.xOffset ?? 0,
    yOffset: ovData.yOffset ?? 0,
    preDraw: Boolean(ovData.preDraw),
    startedAtMs: Date.now(),
    ageTicks: 0,
    maxTicks,
    lightRadius: ovData.radius ?? 0,
    lightColor: [ovData.red ?? 255, ovData.green ?? 255, ovData.blue ?? 255] as const,
  }
  if (!(unit.unitType === 'monster' && hasMonStats2Flag(unit.classId, MONSTATS2_FLAGINDEX.NOOVLY))) {
    unit.overlays = unit.overlays.filter(o => o.token !== cleanToken || o.loop !== loop)
    unit.overlays.push(entry)
  }
  return entry
}

export function attachServerOverlayImpl(this: ClientWorldInternal, unit: ClientUnit, overlayIndex: number): ClientUnitOverlay | undefined {
  const row = Number.isInteger(overlayIndex) ? OVERLAY_TXT_ROWS[overlayIndex] : undefined
  if (row === undefined) return undefined
  if (unit.unitType === 'monster' && hasMonStats2Flag(unit.classId, MONSTATS2_FLAGINDEX.NOOVLY)) {
    return undefined
  }
  const token = row.name.trim().toLowerCase()
  if (!OVERLAY_INDICES_NOT_REPLACED.has(overlayIndex)) {
    const existing = unit.overlays.findIndex(o => o.token === token)
    if (existing >= 0) {
      unit.overlays = unit.overlays.filter((_, i) => i !== existing)
    }
  }
  const entry: ClientUnitOverlay = {
    overlayId: this._nextOverlayId++,
    token,
    frame: 0,
    totalFrames: row.frames,
    animRate: row.animRate,
    loop: false,
    blendMode: row.trans,
    xOffset: row.xOffset,
    yOffset: row.yOffset,
    preDraw: row.preDraw !== 0,
    startedAtMs: Date.now(),
    ageTicks: 0,
    maxTicks: row.animRate > 0 ? Math.ceil((row.frames * 16) / row.animRate) : Number.POSITIVE_INFINITY,
    lightRadius: row.radius,
    lightColor: [row.red, row.green, row.blue] as const,
  }
  unit.overlays = [...unit.overlays, entry]
  return entry
}

export function spawnMissileByKeyImpl(
  this: ClientWorldInternal,
  missileKey: string,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  opts?: SpawnMissileOptions,
): ClientUnit {
  const cleanKey = missileKey.trim().toLowerCase()
  const data = getMissileTxtData(cleanKey)
  const canonical = CANONICAL_113C_MISSILES[cleanKey]
  const classId = opts?.classId ?? canonical?.id ?? data.id ?? 0
  const id = opts?.id ?? this._nextMissileId++
  const level = Math.max(1, opts?.skillLevel ?? 1)

  const dx = targetX - startX
  const dy = targetY - startY
  const dist = Math.hypot(dx, dy)
  const dir64 =
    opts?.direction !== undefined
      ? opts.direction & 0x3f
      : dir64FromPoints(startX, startY, targetX, targetY, 0)

  const velLev = data.velLev ?? 0
  let effVel = data.vel + Math.floor((level * velLev) / 8)
  if (data.maxVel > 0 && effVel > data.maxVel) {
    effVel = data.maxVel
  }
  const dwVelocity = effVel > 0 ? Math.floor(((effVel << 8) * 75) / 100) : 0
  let speedSubTilesPerTick = dwVelocity > 0 ? (16 * dwVelocity) / 65536 : 0
  if (opts?.ownerType === 'monster' && opts?.ownerId !== undefined) {
    const ownerMonster = this._monsters.get(opts.ownerId)
    if (ownerMonster && ownerMonster.states.has(87) && (data as any).canSlow !== false) {
      speedSubTilesPerTick *= 0.33
    }
  }
  let vx = 0
  let vy = 0
  if (
    speedSubTilesPerTick > 0 &&
    !(opts?.verticalDescentPerTick !== undefined && opts.verticalDescentPerTick > 0)
  ) {
    if (dist > 1e-5) {
      vx = (dx / dist) * speedSubTilesPerTick
      vy = (dy / dist) * speedSubTilesPerTick
    } else {
      vx = speedSubTilesPerTick
      vy = 0
    }
  }

  const totalFrames = Math.max(1, data.animLen || 1)
  const animSpeed = Math.max(1, data.animSpeed || 16)
  const loopAnim = opts?.loopAnim ?? (data.loopAnim !== 0)
  const baseMaxTicks =
    !loopAnim && data.vel === 0
      ? Math.max(1, Math.ceil((totalFrames * 16) / animSpeed))
      : Math.max(1, data.range + level * (data.levRange ?? 0))
  const defaultMaxTicks =
    cleanKey === 'lightning' || cleanKey === 'lightningbolt' || cleanKey === 'chainlightning'
      ? Math.max(35, baseMaxTicks)
      : baseMaxTicks
  const maxTicks = opts?.maxTicks ?? defaultMaxTicks

  const unit = new ClientUnit({
    unitType: 'missile',
    id,
    classId,
    name: cleanKey,
    x: startX,
    y: startY,
    mode: 1,
    direction: dir64,
    ownerType: opts?.ownerType,
    ownerId: opts?.ownerId,
  })
  unit.missileKey = cleanKey
  unit.targetX = targetX
  unit.targetY = targetY
  unit.vx = vx
  unit.vy = vy
  unit.accel = data.accel ?? 0
  unit.ageTicks = 0
  unit.maxTicks = maxTicks
  const initFrame =
    opts?.initialFrame !== undefined ? ((opts.initialFrame % totalFrames) + totalFrames) % totalFrames : 0
  unit.initialFrame = opts?.initialFrame !== undefined ? initFrame : undefined
  unit.frame = initFrame
  unit.totalFrames = totalFrames
  unit.animSpeed = animSpeed
  unit.loopAnim = loopAnim
  unit.numDirections = data.numDirections || 1
  const rawRow = CANONICAL_113C_MISSILES[cleanKey]
  const isGroundFire37 =
    totalFrames === 37 &&
    (data.celFile === 'groundFireBig' ||
      data.celFile === 'groundFireMedium' ||
      data.celFile === 'groundFireSmall')
  if (isGroundFire37) {
    unit.subLoop = 1
    unit.subStart = rawRow?.subStart ?? 12
    unit.subStop = rawRow?.subStop ?? 36
  } else if (rawRow?.subLoop) {
    unit.subLoop = Number(rawRow.subLoop)
    unit.subStart = rawRow.subStart ?? 0
    unit.subStop = rawRow.subStop ?? totalFrames - 1
  }
  unit.explosionMissile = data.explosionMissile || ''
  unit.alwaysExplode = Boolean(rawRow?.alwaysExplode)
  unit.pierce = opts?.pierce ?? Boolean(rawRow?.pierce)
  unit.hitUnitIds = new Set<number>()
  unit.altitude = opts?.altitude
  unit.verticalDescentPerTick = opts?.verticalDescentPerTick
  unit.missileSeed = opts?.missileSeed ? { lo: opts.missileSeed.lo >>> 0, hi: opts.missileSeed.hi >>> 0 } : undefined
  unit.originX = opts?.originX ?? startX
  unit.originY = opts?.originY ?? startY
  unit.spiralAngle = opts?.spiralAngle
  unit.spiralRadius = opts?.spiralRadius
  unit.jitterIndex = opts?.jitterIndex
  unit.emitterKind = opts?.emitterKind
  unit.startedAtMs = Date.now()
  unit.startedAtTick = this.frameCount
  unit.sourceSkillId = opts?.sourceSkillId
  unit.skillLevel = level

  if (
    cleanKey === 'chargedbolt' ||
    cleanKey === 'chargedstrikebolt' ||
    cleanKey === 'sentrychargedbolt' ||
    cleanKey === 'lightunique' ||
    cleanKey === 'buglightning'
  ) {
    // 1.13c SKILLS_InitChargedBolt (0x6FC61F50) & SKILLS_CltInitChargedBolt (0x6FB23B60):
    // clamp range to 77 (0x4D) and compute PATHTYPE_CHARGEDBOLT (0x6FDB6AA0) random-walk path.
    if (opts?.maxTicks === undefined && unit.maxTicks >= 78) {
      unit.maxTicks = 77
    }
    const boltIdx = opts?.jitterIndex ?? unit.id
    const lowSeed =
      (Math.imul(this.frameCount + 1, 0x6ac690c5) +
        Math.imul(opts?.ownerId ?? 1, 0x19660d) +
        Math.imul(boltIdx, 0x5f95)) >>>
      0
    const waypoints = PATH_ComputePathChargedBolt_6FDB6AA0(
      startX,
      startY,
      targetX,
      targetY,
      unit.maxTicks,
      lowSeed,
    )
    unit.pathWaypoints = waypoints
    unit.pathWaypointIndex = 0
    if (waypoints.length > 0 && speedSubTilesPerTick > 0) {
      const wp0 = waypoints[0]!
      const wpDx = wp0.x - startX
      const wpDy = wp0.y - startY
      const wpDist = Math.hypot(wpDx, wpDy)
      if (wpDist > 1e-5) {
        unit.vx = (wpDx / wpDist) * speedSubTilesPerTick
        unit.vy = (wpDy / wpDist) * speedSubTilesPerTick
        unit.direction = dir64FromPoints(startX, startY, wp0.x, wp0.y, unit.direction)
      }
    }
  }

  this._units.set(unit.key, unit)

  // 1.13c D2Client.dll MISSMODE_CltDo09_MeteorCenter (0x6fb68f00) & UNIT_Set3DTrajectory (0x6fb77e30):
  // meteorcenter (id=101, Range=60, CltParam1=59, CltParam2=25, CltParam3=15) spawns
  // ClientSubMissile1 ('meteor') and ClientSubMissile2 ('meteortail') with identical 3D trajectory
  // (xOffset = -15 * 59 = -885 sub-units = -(15 * 59)/32 sub-tiles, zOffset = -25 * 59 = -1475 px).
  if (
    cleanKey === 'meteorcenter' ||
    cleanKey === 'vampiremeteorcenter' ||
    cleanKey === 'royalstrikemeteorcenter'
  ) {
    unit.vx = 0
    unit.vy = 0
    unit.alwaysExplode = true
    if (opts?.expandSubMissiles !== false) {
      const descentFrames = Math.max(1, unit.maxTicks - 1)
      const skyX = targetX - (15 * descentFrames) / 32
      const skyY = targetY
      const initAlt = 25 * descentFrames
      const tailKey =
        cleanKey === 'royalstrikemeteorcenter' ? 'royalstrikemeteortail' : 'meteortail'
      const coreKey =
        cleanKey === 'vampiremeteorcenter'
          ? 'vampiremeteor'
          : cleanKey === 'royalstrikemeteorcenter'
            ? 'royalstrikemeteor'
            : 'meteor'
      const tail = this.spawnMissileByKey(tailKey, skyX, skyY, targetX, targetY, {
        ownerType: opts?.ownerType,
        ownerId: opts?.ownerId,
        sourceSkillId: opts?.sourceSkillId ?? 56,
        skillLevel: level,
        maxTicks: unit.maxTicks,
        altitude: initAlt,
        originX: targetX,
        originY: targetY,
        pierce: true,
        expandSubMissiles: false,
      })
      tail.vx = 15 / 32
      tail.vy = 0
      tail.alwaysExplode = false
      tail.explosionMissile = ''
      const core = this.spawnMissileByKey(coreKey, skyX, skyY, targetX, targetY, {
        ownerType: opts?.ownerType,
        ownerId: opts?.ownerId,
        sourceSkillId: opts?.sourceSkillId ?? 56,
        skillLevel: level,
        maxTicks: unit.maxTicks,
        altitude: initAlt,
        originX: targetX,
        originY: targetY,
        pierce: true,
        expandSubMissiles: false,
      })
      core.vx = 15 / 32
      core.vy = 0
      core.alwaysExplode = false
      core.explosionMissile = ''
    }
  } else if (
    (cleanKey === 'meteor' ||
      cleanKey === 'vampiremeteor' ||
      cleanKey === 'royalstrikemeteor') &&
    opts?.expandSubMissiles !== false
  ) {
    const descentFrames = Math.max(1, unit.maxTicks - 1)
    const skyX = targetX - (15 * descentFrames) / 32
    const skyY = targetY
    const initAlt = opts?.altitude ?? 25 * descentFrames
    unit.originX = targetX
    unit.originY = targetY
    unit.x = skyX
    unit.y = skyY
    unit.altitude = initAlt
    unit.vx = 15 / 32
    unit.vy = 0
    unit.pierce = true
    unit.alwaysExplode = true
    const tailKey =
      cleanKey === 'royalstrikemeteor' ? 'royalstrikemeteortail' : 'meteortail'
    const tail = this.spawnMissileByKey(tailKey, skyX, skyY, targetX, targetY, {
      ownerType: opts?.ownerType,
      ownerId: opts?.ownerId,
      sourceSkillId: opts?.sourceSkillId ?? 56,
      skillLevel: level,
      maxTicks: unit.maxTicks,
      altitude: initAlt,
      originX: targetX,
      originY: targetY,
      pierce: true,
      expandSubMissiles: false,
    })
    tail.vx = 15 / 32
    tail.vy = 0
    tail.alwaysExplode = false
    tail.explosionMissile = ''
  }

  this.emitMissileSpawnSound({
    missileId: classId > 0 ? classId : cleanKey,
    entityId: unit.id,
    x: unit.x,
    y: unit.y,
  })

  return unit
}

export function isCrossbowEquippedImpl(this: ClientWorldInternal, caster: ClientUnit): boolean {
  if (caster.unitType === 'player') {
    const isSelf = caster.id === this.selfId || this.selfId === 0
    if (isSelf) {
      const eqWeapon =
        this._containers.equipmentBySlot.get(4) ?? this._containers.equipmentBySlot.get(5)
      if (eqWeapon) {
        const code = (eqWeapon.code ?? '').trim().toLowerCase()
        if (CROSSBOW_ITEM_CODES.has(code)) return true
      }
    }
    const weaponType = (caster as any).equippedWeaponType ?? (caster as any).weaponItemType
    if (typeof weaponType === 'string' && weaponType.toLowerCase() === 'crossbow') return true
  }
  return false
}

export function resolveThrowMissileKeyForCasterImpl(this: ClientWorldInternal, caster: ClientUnit, skillId: number): string {
  if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
    const primarySlot = skillId === 4 ? 5 : 4
    const item =
      this._containers.equipmentBySlot.get(primarySlot) ??
      this._containers.equipmentBySlot.get(primarySlot === 4 ? 5 : 4)
    const key = resolveThrowMissileForItemCode(item?.code)
    if (key) return key
  }
  return 'javelin'
}

export function resolveCastActionFrameDelayMsImpl(
  this: ClientWorldInternal,
  unit: ClientUnit,
  mode: number,
  skillId: number,
  _seqNum: number,
  stepSpeed256: number,
  durationMs: number,
): number {
  if (unit.unitType !== 'player') return 0
  const step = stepSpeed256 > 0 ? stepSpeed256 : 256
  const isSelf = unit.id === this.selfId || this.selfId === 0
  const wclass = isSelf
    ? resolveEquippedWeaponClass(Array.from(this._containers.equipment.values()))
    : 'hth'
  if (mode === 18) {
    // SQ sequence clips (mode 18): walk the canonical SequenceTbls.cpp player sequence
    // with the unit's equipped weapon class and fire on the first event frame.
    const maxTicks = Math.max(1, Math.ceil(durationMs / 40))
    for (let ticks = 0; ticks <= maxTicks; ticks += 1) {
      const rec = resolveSkillSequenceFrame(skillId, wclass, ticks, step)
      if (rec && rec.event !== 0) return Math.min(durationMs, ticks * 40)
    }
    return 0
  }
  const hasWolf = Boolean(unit.states.has(139)) || (isSelf && this._self.states.has(139))
  const hasBear =
    !hasWolf && (Boolean(unit.states.has(140)) || (isSelf && this._self.states.has(140)))
  const hasVamp =
    !hasWolf &&
    !hasBear &&
    (Boolean(unit.states.has(176)) ||
      Boolean(unit.states.has(65)) ||
      (isSelf && (this._self.states.has(176) || this._self.states.has(65))))
  const morphMonsterClassId = hasWolf ? 430 : hasBear ? 431 : hasVamp ? 135 : undefined
  const clip = getCharAnimClip113c(unit.classId, mode, {
    weaponClass: wclass,
    morphMonsterClassId,
  })
  const actionFrame = clip?.actionFrame ?? 0
  if (!(actionFrame > 0)) return 0
  return Math.min(durationMs, computeActionFrameTicks(actionFrame, step) * 40)
}

export function spawnMissilesForSkillImpl(
  this: ClientWorldInternal,
  caster: ClientUnit,
  skillId: number,
  targetX: number,
  targetY: number,
  skillLevel = 1,
): void {
  const ownerType = caster.unitType
  const ownerId = caster.id
  const startX = caster.x
  const startY = caster.y
  const dx = targetX - startX
  const dy = targetY - startY
  const baseAngle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx)

  if (skillId === 3) {
    // #3 Unsummon: cltstfunc 3 (0x6FB51110) only validates the targeted own pet and cltdofunc is 0. The pet is
    // despawned by the server (SKILLS_SrvDo004_Unsummon -> S2C UnitRemove / 0x7A action 0), never client-side.
    return
  }

  if (skillId === 338) {
    // #338 NecromageMissile (Skeletal Mage), SkillCltDoFunc[95] SKILLS_CltDo95_NecromageMissile (0x6FB088B0):
    // fires cltmissilea + element, element = the mage's S4 component (0xAC component index 11, set equal to S5 by
    // D2GAME_SetUnitComponent): 0 necromage1 (poison) / 1 necromage2 (cold) / 2 necromage3 (fire) / 3 necromage4 (ltng).
    const element = caster.compVariants?.[11]
    if (element === undefined || element < 0 || element > 3) {
      throw new RangeError(
        `NecromageMissile (#338): caster ${String(caster.id)} (class ${String(caster.classId)}) has no S4 element component (got ${String(element)})`,
      )
    }
    this.spawnMissileByKey(`necromage${String(element + 1)}`, startX, startY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    return
  }

  // 0. Amazon & Sorceress Summons, Melee triggers, Buffs & Special Trajectories
  if (skillId === 8 || skillId === 17) {
    // #8 Inner Sight / #17 Slow Missiles: cast overlay on caster, innersight overlay on nearby monsters
    // 1.13c Skills.txt: fixed 20 subtiles (13.33 yards) radius (Param1 = 20 for #8, Param2 = 20 for #17), does NOT scale with slvl!
    const castOverlay = skillId === 8 ? 'cast_innersight' : 'cast_slowmissiles'
    const stateId = skillId === 8 ? 17 : 87
    this.attachUnitOverlay(caster, castOverlay, false)
    const radius = 20
    for (const m of this._monsters.values()) {
      if (m.dead || this.isFriendlyOrNonHostileMonster(m) || !canMonsterClassBeCursed113c(m.classId)) continue
      if (Math.hypot(m.x - startX, m.y - startY) <= radius) {
        m.states.add(stateId)
        this.attachUnitOverlay(m, 'innersight', true)
      }
    }
    return
  }

  if (skillId === 10 || skillId === 19 || skillId === 30) {
    // #10 Jab / #19 Impale / #30 Fend: pure physical melee skills (cltmissilea = empty, tgtoverlay = empty)
    return
  }

  if (skillId === 14) {
    // #14 Power Strike (1.13c Skills.txt row 14): melee hit with tgtoverlay = lightning (no cltmissilea)
    let targetMon: ClientUnit | undefined
    let bestDist = 4
    for (const m of this._monsters.values()) {
      if (this.isFriendlyOrNonHostileMonster(m)) continue
      const d = Math.min(Math.hypot(m.x - targetX, m.y - targetY), Math.hypot(m.x - startX, m.y - startY))
      if (d <= bestDist) {
        bestDist = d
        targetMon = m
      }
    }
    if (targetMon) {
      this.attachUnitOverlay(targetMon, 'lightning', false)
    }
    return
  }

  if (skillId === 24) {
    // #24 Charged Strike (1.13c Skills.txt row 24: srvdofunc=17 / cltdofunc=23, Param1=3, Param2=5):
    // cltcalc1 = par1 + lvl/par2 -> 3 + floor(slvl / 5) chargedstrikebolt missiles + tgtoverlay = lightning
    let targetMon: ClientUnit | undefined
    let bestDist = 4
    for (const m of this._monsters.values()) {
      if (this.isFriendlyOrNonHostileMonster(m)) continue
      const d = Math.min(Math.hypot(m.x - targetX, m.y - targetY), Math.hypot(m.x - startX, m.y - startY))
      if (d <= bestDist) {
        bestDist = d
        targetMon = m
      }
    }
    if (targetMon) {
      this.attachUnitOverlay(targetMon, 'lightning', false)
    }
    const count = 3 + Math.floor(Math.max(1, skillLevel) / 5)
    const tx = targetX + Math.cos(baseAngle) * 16
    const ty = targetY + Math.sin(baseAngle) * 16
    for (let i = 0; i < count; i++) {
      this.spawnMissileByKey('chargedstrikebolt', targetX, targetY, tx, ty, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        jitterIndex: i + 1,
      })
    }
    return
  }

  if (skillId === 26) {
    // #26 Strafe (1.13c Skills.txt SrvDoFunc=12 / CltDoFunc=20):
    // Param1=2, Param2=4 (minArrows = 2 + floor(slvl/4)), Param3=4, Param4=1 (maxArrows = min(10, 3 + slvl)), Param5=35 (search radius)
    const isXBow = this.isCrossbowEquipped(caster)
    const missileKey = isXBow ? 'strafebolt' : 'strafearrow'
    const slvl = Math.max(1, skillLevel)
    const minArrows = 2 + Math.floor(slvl / 4)
    const maxArrows = Math.min(10, 3 + slvl)
    const hostiles = Array.from(this._monsters.values())
      .filter((m) => !this.isFriendlyOrNonHostileMonster(m) && Math.hypot(m.x - startX, m.y - startY) <= 35)
      .sort((a, b) => Math.hypot(a.x - startX, a.y - startY) - Math.hypot(b.x - startX, b.y - startY))
    const count = hostiles.length > 0 ? Math.min(maxArrows, Math.max(minArrows, hostiles.length)) : maxArrows
    const totalSpread = Math.min(Math.PI * 0.35, 0.08 * Math.max(1, count - 1))
    for (let i = 0; i < count; i++) {
      let tx: number
      let ty: number
      if (hostiles.length > 0) {
        const tgt = hostiles[i % hostiles.length]!
        tx = tgt.x
        ty = tgt.y
      } else {
        const offset = count === 1 ? 0 : -totalSpread / 2 + (totalSpread * i) / (count - 1)
        const angle = baseAngle + offset
        tx = startX + Math.cos(angle) * 20
        ty = startY + Math.sin(angle) * 20
      }
      this.spawnMissileByKey(missileKey, startX, startY, tx, ty, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
      })
    }
    return
  }

  if (skillId === 28) {
    for (const m of this._units.values()) {
      if (m.unitType === 'monster' && m.classId === 356 && !m.dead) {
        m.dead = true
        m.mode = 12
        this._units.delete(m.key)
        this._monsters.delete(m.id)
      }
    }
    // #28 Decoy (Dopplezon): summon monster hcIdx=356, sumoverlay=dopllezon_appear
    const summonId = 900000 + Math.floor(Math.random() * 90000)
    const decoyUnit = new ClientUnit({
      unitType: 'monster',
      id: summonId,
      classId: 356, // dopplezon
      x: targetX,
      y: targetY,
      mode: 1, // NU
      direction: caster.direction,
    })
    decoyUnit.name = 'Decoy'
    decoyUnit.nameZh = '诱饵'
    this._units.set(decoyUnit.key, decoyUnit)
    this._monsters.set(decoyUnit.id, decoyUnit)
    this._pets.set(decoyUnit.id, {
      unitId: decoyUnit.id,
      ownerId: caster.id,
      petType: 6, // dopplezon
      classId: 356,
      lifePct: 128,
      isDead: false,
    })
    this.attachUnitOverlay(decoyUnit, 'dopllezon_appear', false)
    return
  }

  if (skillId === 32) {
    for (const m of this._units.values()) {
      if (m.unitType === 'monster' && m.classId === 357 && !m.dead) {
        m.dead = true
        m.mode = 12
        this._units.delete(m.key)
        this._monsters.delete(m.id)
      }
    }
    // #32 Valkyrie: summon monster hcIdx=357, sumoverlay=valkyriestart, state=valkyrie
    const summonId = 910000 + Math.floor(Math.random() * 90000)
    const valkUnit = new ClientUnit({
      unitType: 'monster',
      id: summonId,
      classId: 357, // valkyrie
      x: targetX,
      y: targetY,
      mode: 1, // NU
      direction: caster.direction,
    })
    valkUnit.name = 'Valkyrie'
    valkUnit.nameZh = '女武神'
    valkUnit.states.add(93) // valkyrie
    this._units.set(valkUnit.key, valkUnit)
    this._monsters.set(valkUnit.id, valkUnit)
    this._pets.set(valkUnit.id, {
      unitId: valkUnit.id,
      ownerId: caster.id,
      petType: 7, // valkyrie
      classId: 357,
      lifePct: 128,
      isDead: false,
    })
    this.attachUnitOverlay(valkUnit, 'valkyriestart', false)
    this.attachUnitOverlay(valkUnit, 'valkyrie', true)
    return
  }

  if (skillId === 34) {
    // #34 Lightning Strike (1.13c Skills.txt row 34): tgtoverlay = lightning + lightningstrike chaining missile
    let targetMon: ClientUnit | undefined
    let bestDist = 4
    for (const m of this._monsters.values()) {
      if (this.isFriendlyOrNonHostileMonster(m)) continue
      const d = Math.min(Math.hypot(m.x - targetX, m.y - targetY), Math.hypot(m.x - startX, m.y - startY))
      if (d <= bestDist) {
        bestDist = d
        targetMon = m
      }
    }
    if (targetMon) {
      this.attachUnitOverlay(targetMon, 'lightning', false)
    }
    const ls = this.spawnMissileByKey('lightningstrike', startX, startY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 25,
      pierce: true,
    })
    ls.hitUnitIds = new Set<number>()
    return
  }

  if (skillId === 41) {
    // #41 Inferno: continuous collinear flame stream towards target (1.13c CltDoFunc=28)
    const count = 3
    const maxTicks = 10 + 3 * Math.max(1, skillLevel)
    const cosA = Math.cos(baseAngle)
    const sinA = Math.sin(baseAngle)
    for (let i = 0; i < count; i++) {
      const d = i * 0.7
      const sx = startX + cosA * d
      const sy = startY + sinA * d
      const tx = sx + cosA * 16
      const ty = sy + sinA * 16
      const mKey = i % 2 === 0 ? 'infernoflame1' : 'infernoflame2'
      this.spawnMissileByKey(mKey, sx, sy, tx, ty, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks,
        pierce: true,
      })
    }
    return
  }

  if (skillId === 62) {
    // #62 Hydra: summon 3 hydra monster heads hcIdx=351..353.
    // Do not synthesize duplicate local 920000+ ghost units when authoritative server Hydras exist.
    for (const m of this._monsters.values()) {
      if (!m.dead && m.id < 900000 && m.classId >= 351 && m.classId <= 353) {
        return
      }
    }
    const offsets = [
      { dx: -0.8, dy: -0.8, classId: 351 },
      { dx: 0, dy: 0, classId: 352 },
      { dx: 0.8, dy: 0.8, classId: 353 },
    ]
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i]!
      const summonId = 920000 + Math.floor(Math.random() * 70000) + i
      const hUnit = new ClientUnit({
        unitType: 'monster',
        id: summonId,
        classId: off.classId,
        x: targetX + off.dx,
        y: targetY + off.dy,
        mode: 9, // S2 emergence
        direction: caster.direction,
      })
      hUnit.name = `Hydra ${i + 1}`
      hUnit.nameZh = `九头海蛇 ${i + 1}`
      hUnit.ownerType = ownerType
      hUnit.ownerId = ownerId
      hUnit.ageTicks = 0
      hUnit.maxTicks = 250 // 1.13c Skills.txt Param1=250 ticks (10s)
      hUnit.modeStartedAtMs = this._simTimeMs
      hUnit.modeDurationMs = 480
      hUnit.modeUntilMs = this._simTimeMs + 480
      this._units.set(hUnit.key, hUnit)
      this._monsters.set(hUnit.id, hUnit)
      this._pets.set(hUnit.id, {
        unitId: hUnit.id,
        ownerId: caster.id,
        petType: 8, // hydra
        classId: off.classId,
        lifePct: 128,
        isDead: false,
      })
    }
    return
  }

  // 1. Single-bolt linear projectiles
  // Skills 2/4 (Throw / Left Hand Throw): weapon-dependent missile — no
  // Skills.txt missile (srvdofunc 3/5), so resolve from the equipped weapon.
  if (skillId === 2 || skillId === 4) {
    this.spawnMissileByKey(
      this.resolveThrowMissileKeyForCaster(caster, skillId),
      startX,
      startY,
      targetX,
      targetY,
      {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
      },
    )
    return
  }
  // 140 Double Throw (srvdofunc 74): throws BOTH hand weapons at once —
  // right-hand (slot 4) and left-hand (slot 5) missiles, slightly fanned.
  if (skillId === 140) {
    const rightKey = this.resolveThrowMissileKeyForCaster(caster, 2)
    const leftKey = this.resolveThrowMissileKeyForCaster(caster, 4)
    const spread = 0.08
    for (const [key, angOff] of [
      [rightKey, -spread],
      [leftKey, spread],
    ] as const) {
      const ang = baseAngle + angOff
      this.spawnMissileByKey(key, startX, startY, startX + Math.cos(ang) * 30, startY + Math.sin(ang) * 30, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
      })
    }
    return
  }
  const linear = LINEAR_SKILL_MISSILES[skillId]
  if (linear) {
    const destX = dx === 0 && dy === 0 ? startX + 10 : targetX
    const destY = dx === 0 && dy === 0 ? startY : targetY
    const mUnit = this.spawnMissileByKey(linear.key, startX, startY, destX, destY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      pierce: linear.pierce,
    })
    if (skillId === 16 || skillId === 27) {
      mUnit.explosionMissile = 'explodingarrowexp'
      mUnit.alwaysExplode = true
    } else if (skillId === 25) {
      mUnit.explosionMissile = 'plaguejavcloud'
      mUnit.alwaysExplode = true
    } else if (skillId === 31) {
      mUnit.explosionMissile = 'freezingarrowexp1'
      mUnit.alwaysExplode = true
    } else if (skillId === 35) {
      mUnit.explosionMissile = 'furylightning'
      mUnit.alwaysExplode = true
    } else if (skillId === 93) {
      // SKILLS_CltDo18 (0x6FAC5C40): tracking mode 1 locked on the caster's target unit (0x6FB55F70);
      // a ground cast is mode 2 and the client missile does not home (MISSMODE_CltDo07 tests mode & 1).
      if (caster.targetUnit !== undefined) mUnit.homingTarget = caster.targetUnit
    }
    return
  }

  // 2a. Charged Bolt (38): 1.13c srvdofunc[17] (0x6FC63B60) / cltdofunc[23] (0x6FB24AC0)
  // spawns all bolts at the caster position aiming at the exact same target coordinates;
  // divergence comes from PATHTYPE_CHARGEDBOLT (0x6FDB6AA0) random-walk waypoints.
  if (skillId === 38) {
    const count = Math.min(24, 2 + Math.max(1, skillLevel))
    const tx = dx === 0 && dy === 0 ? startX + Math.cos(baseAngle) * 20 : targetX
    const ty = dx === 0 && dy === 0 ? startY + Math.sin(baseAngle) * 20 : targetY
    for (let i = 0; i < count; i++) {
      this.spawnMissileByKey('chargedbolt', startX, startY, tx, ty, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        jitterIndex: i + 1,
      })
    }
    return
  }

  // 2b. Multi-projectile fan spells: Teeth (67), Multiple Shot (12)
  // Both use 1.13c Param1=2, Param2=1 (ln12 = 2 + (slvl - 1) = 1 + slvl), capped at 24.
  if (skillId === 67 || skillId === 12) {
    const missileKey =
      skillId === 67
        ? 'teeth'
        : this.isCrossbowEquipped(caster)
          ? 'multipleshotbolt'
          : 'multipleshotarrow'
    const count = Math.min(24, 1 + Math.max(1, skillLevel))
    // SKILLS_CltDo17 (0x6FAC5DA0): perpendicular fan across the target point; tooth floor(count/2)
    // aims exactly at (targetX, targetY), the others step one perpendicular unit apart.
    for (const aim of computeCltDo17FanAimPoints113c(startX, startY, targetX, targetY, count)) {
      this.spawnMissileByKey(missileKey, startX, startY, aim.x, aim.y, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
      })
    }
    return
  }

  // 3. Radial ring spells: Frost Nova (44), Nova (48), Poison Nova (92)
  const radialKey = RADIAL_RING_SKILLS[skillId]
  if (radialKey) {
    const ringVectors = computeIsoRadialRingVectors(32, 16)
    for (const vec of ringVectors) {
      const tx = startX + vec.dx
      const ty = startY + vec.dy
      this.spawnMissileByKey(radialKey, startX, startY, tx, ty, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
      })
    }
    return
  }

  // 4. Spiral trajectory: Blessed Hammer (112)
  if (skillId === 112) {
    const tx = dx === 0 && dy === 0 ? startX + 8 : targetX
    const ty = dx === 0 && dy === 0 ? startY : targetY
    this.spawnMissileByKey('blessedhammer', startX, startY, tx, ty, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      pierce: true,
      originX: startX,
      originY: startY,
      spiralAngle: baseAngle,
      spiralRadius: 0,
    })
    return
  }

  // 5. Sub-missile emitter: Frozen Orb (64)
  if (skillId === 64) {
    const tx = dx === 0 && dy === 0 ? startX + 16 : targetX
    const ty = dx === 0 && dy === 0 ? startY : targetY
    const orb = this.spawnMissileByKey('frozenorb', startX, startY, tx, ty, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      pierce: true,
      emitterKind: 'frozenorb',
    })
    const orbSpeed = Math.hypot(orb.vx ?? 0, orb.vy ?? 0)
    if (orbSpeed > 0 && orbSpeed < 0.55) {
      orb.vx = ((orb.vx ?? 0) / orbSpeed) * 0.55
      orb.vy = ((orb.vy ?? 0) / orbSpeed) * 0.55
    }
    return
  }

  // 6. Ground / Skyfall / Instant-target spells
  // Static Field (#42) & Telekinesis (#43): 1.13c Skills.txt has an EMPTY tgtoverlay for
  // both — no target overlay is attached client-side (the old 'staticfield' /
  // 'telekinesis' attachments were invented tokens absent from Overlay.txt and aborted
  // the render loop via pushOverlayLight, Issue #955). Static Field's caster visual is
  // its real castOverlay 'light_cast_1', applied by the generic cast path.

  if (skillId === 46) {
    // #46 Blaze: set state 12 (blaze), record emission origin, and spawn initial blaze patch (Range=112)
    caster.states.add(12)
    caster.lastBlazeX = startX
    caster.lastBlazeY = startY
    caster.blazeSkillLevel = skillLevel
    caster.blazeUntilTick = this.frameCount + 115 + (Math.max(1, skillLevel) - 1) * 50
    const b = this.spawnMissileByKey('blaze', startX, startY, startX, startY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 112,
    })
    b.vx = 0
    b.vy = 0
    return
  }

  if (skillId === 51) {
    // #51 Fire Wall: center firewall (id=69, Range=90) + two opposing perpendicular firewallmaker (id=68, Vel=12, Range=7+2*slvl) controllers
    const centerWall = this.spawnMissileByKey('firewall', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 90,
    })
    centerWall.vx = 0
    centerWall.vy = 0
    const makerRange = 7 + 2 * Math.max(1, skillLevel)
    for (const sign of [-1, 1] as const) {
      const perpAngle = baseAngle + sign * (Math.PI / 2)
      const destX = targetX + Math.cos(perpAngle) * 32
      const destY = targetY + Math.sin(perpAngle) * 32
      const maker = this.spawnMissileByKey('firewallmaker', targetX, targetY, destX, destY, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks: makerRange,
        pierce: true,
      })
      maker.vx = Math.cos(perpAngle) * 0.9
      maker.vy = Math.sin(perpAngle) * 0.9
    }
    return
  }

  if (skillId === 56) {
    // #56 Meteor: 1.13c Skills.txt srvmissile/cltmissilea = meteorcenter (id=101, Range=60).
    // spawnMissileByKey('meteorcenter') expands ClientSubMissile1 ('meteor') and ClientSubMissile2 ('meteortail')
    // along the 59-tick 3D trajectory (fallrate=25, sliderate=15) per MISSMODE_CltDo09_MeteorCenter (0x6fb68f00).
    this.spawnMissileByKey('meteorcenter', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 60,
    })
    return
  }

  if (skillId === 59) {
    // Blizzard (#59): 1.13c Missiles.txt blizzardcenter (id=153, CltDoFunc=17) + falling blizzard1..4 shards
    this.spawnMissileByKey('blizzardcenter', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      emitterKind: 'blizzard_controller',
      maxTicks: 100,
    })
    // 1.13c MISSMODE_SrvDo10_blizzardcenter (0x6FC60CA0) & Missiles.txt blizzard1..4 (range=9, vel=0):
    // Shards spawn at the ground impact sub-tile and descend vertically over 9 ticks (altitude 120 -> 0).
    const fallTicks = 9
    const shard = this.spawnMissileByKey(
      'blizzard1',
      targetX,
      targetY,
      targetX,
      targetY,
      {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks: fallTicks,
        altitude: 120,
      },
    )
    shard.vx = 0
    shard.vy = 0
    shard.explosionMissile = 'blizzardexplode1'
    shard.alwaysExplode = true
    return
  }

  if (skillId === 74) {
    // Corpse Explosion (SkillSrvDoFunc[55] / SkillCltDoFunc[50] 0x6FB784D0):
    // Marks consumed corpse with STATE_CORPSE_NODRAW (104) and spawns cltmissilea=corpseexplosion, cltmissileb=explodingarrowexp
    let corpseUnit: ClientUnit | undefined
    let bestDistSq = 16 // 4 subtiles radius squared
    for (const m of this._monsters.values()) {
      if (!m.dead && m.mode !== 0 && m.mode !== 12 && m.lifePct > 0) continue
      if (
        m.states.has(99) ||
        m.states.has(104) ||
        m.states.has(107) ||
        m.states.has(118) ||
        m.states.has(173)
      ) {
        continue
      }
      const dx = m.x - targetX
      const dy = m.y - targetY
      const dSq = dx * dx + dy * dy
      if (dSq <= bestDistSq) {
        bestDistSq = dSq
        corpseUnit = m
      }
    }
    if (corpseUnit) {
      corpseUnit.states.add(104)
    }
    const cx = corpseUnit ? corpseUnit.x : targetX
    const cy = corpseUnit ? corpseUnit.y : targetY
    this.spawnMissileByKey('corpseexplosion', cx, cy, cx, cy, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    this.spawnMissileByKey('explodingarrowexp', cx, cy, cx, cy, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    if (corpseUnit) {
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3
        const gx = cx + Math.cos(angle) * 2
        const gy = cy + Math.sin(angle) * 2
        this.spawnMissileByKey(i % 2 === 0 ? 'bigblood1' : 'bigblood2', cx, cy, gx, gy, {
          ownerType,
          ownerId,
          sourceSkillId: skillId,
          maxTicks: 16,
        })
      }
    }
    return
  }

  if (skillId === 83) {
    // Poison Explosion (Skills.txt cltdofunc=33, SKILLS_CltDo33 0x6FB78C90 -> 0x6FB78710):
    // cltmissilea=poisoncorpseexplosion at the corpse, cltmissilec=greenlightmissile, then the
    // 0x6FB66BC0 ring of cltmissileb=poisonexplosioncloud on the 8 even entries of the radius-2
    // 16-point table, drifting outward at Param1<<7. The server (SrvDo063 0x6FC70190) toggles
    // STATE_CORPSE_NOSELECT (118, not hide) on the corpse; the prediction marks it unselectable.
    let corpseUnit: ClientUnit | undefined
    let bestDistSq = 16 // 4 subtiles radius squared
    for (const m of this._monsters.values()) {
      if (!m.dead && m.mode !== 0 && m.mode !== 12 && m.lifePct > 0) continue
      if (
        m.states.has(99) ||
        m.states.has(104) ||
        m.states.has(107) ||
        m.states.has(118) ||
        m.states.has(173)
      ) {
        continue
      }
      const dx = m.x - targetX
      const dy = m.y - targetY
      const dSq = dx * dx + dy * dy
      if (dSq <= bestDistSq) {
        bestDistSq = dSq
        corpseUnit = m
      }
    }
    if (corpseUnit) {
      corpseUnit.states.add(118)
    }
    const cx = corpseUnit ? corpseUnit.x : targetX
    const cy = corpseUnit ? corpseUnit.y : targetY
    this.spawnMissileByKey('poisoncorpseexplosion', cx, cy, cx, cy, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    this.spawnMissileByKey('greenlightmissile', cx, cy, cx, cy, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    const cloudSpeed = ringMissileSpeedSubTilesPerTick113c(POISONEXPLOSIONCLOUD_113C.param1)
    for (const off of poisonExplosionCloudOffsets113c()) {
      const cloud = this.spawnMissileByKey('poisonexplosioncloud', cx, cy, cx + off.x, cy + off.y, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        // Missiles.txt poisonexplosioncloud: CollideKill=0 — unit collisions do not end it.
        pierce: true,
      })
      const len = Math.hypot(off.x, off.y)
      cloud.vx = (off.x / len) * cloudSpeed
      cloud.vy = (off.y / len) * cloudSpeed
    }
    return
  }

  if (skillId === 96) {
    // #96 Sacrifice (Skills.txt row 96: castoverlay=sacrifice_1, tgtoverlay=sacrifice_2, cltmissilea=blood1)
    this.attachUnitOverlay(caster, 'sacrifice_1', false)
    let targetMon: ClientUnit | undefined
    let bestDist = 4
    for (const m of this._monsters.values()) {
      if (this.isFriendlyOrNonHostileMonster(m)) continue
      const d = Math.min(Math.hypot(m.x - targetX, m.y - targetY), Math.hypot(m.x - startX, m.y - startY))
      if (d <= bestDist) {
        bestDist = d
        targetMon = m
      }
    }
    if (targetMon) {
      this.attachUnitOverlay(targetMon, 'sacrifice_2', false)
    }
    const blood = this.spawnMissileByKey('blood1', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    blood.vx = 0
    blood.vy = 0
    return
  }

  if (skillId === 97) {
    // #97 Smite (Skills.txt row 97: tgtoverlay=smite + state 21 stun)
    for (const m of this._monsters.values()) {
      if (m.dead || this.isFriendlyOrNonHostileMonster(m)) continue
      if (Math.hypot(m.x - targetX, m.y - targetY) <= 3) {
        m.states.add(21) // State 21 = Stun
        this.attachUnitOverlay(m, 'smite', false)
        this.attachUnitOverlay(m, 'stun', false)
      }
    }
    return
  }

  if (skillId === 101) {
    // #101 Holy Bolt
    this.spawnMissileByKey('holybolt', startX, startY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    return
  }

  if (skillId === 106) {
    // #106 Zeal: multi-strike melee attack (no client missile)
    return
  }

  if (skillId === 107) {
    // #107 Charge (Skills.txt row 107: tgtoverlay=charge on impact)
    for (const m of this._monsters.values()) {
      if (m.dead || this.isFriendlyOrNonHostileMonster(m)) continue
      if (Math.hypot(m.x - targetX, m.y - targetY) <= 4) {
        this.attachUnitOverlay(m, 'charge', false)
        break
      }
    }
    return
  }

  if (skillId === 111) {
    // #111 Vengeance (Skills.txt row 111: tgtoverlay=vengeance on hit)
    for (const m of this._monsters.values()) {
      if (m.dead || this.isFriendlyOrNonHostileMonster(m)) continue
      if (Math.hypot(m.x - targetX, m.y - targetY) <= 4) {
        this.attachUnitOverlay(m, 'vengeance', false)
        break
      }
    }
    return
  }

  if (skillId === 116) {
    // #116 Conversion (Skills.txt row 116: state 53 conversion is server-authoritative via dm34 roll;
    // do not unconditionally force state 53 on all monsters within 3 subtiles on client cast).
    for (const m of this._monsters.values()) {
      if (m.dead || this.isFriendlyOrNonHostileMonster(m)) continue
      if (m.states.has(53) && Math.hypot(m.x - targetX, m.y - targetY) <= 4) {
        this.attachUnitOverlay(m, 'conversion', true)
      }
    }
    return
  }

  if (skillId === 117) {
    // #117 Holy Shield (Skills.txt row 117: state 101 holyshield, overlay=holyshield)
    caster.states.add(101)
    this.attachUnitOverlay(caster, 'holyshield', true)
    return
  }

  if (skillId === 121) {
    // #121 Fist of the Heavens (Skills.txt row 121: tgtoverlay=handofgod, cltmissilea=fistofares)
    let targetMon: ClientUnit | undefined
    let bestDist = 4
    for (const m of this._monsters.values()) {
      if (m.dead || this.isFriendlyOrNonHostileMonster(m)) continue
      const d = Math.hypot(m.x - targetX, m.y - targetY)
      if (d <= bestDist) {
        bestDist = d
        targetMon = m
      }
    }
    if (targetMon) {
      this.attachUnitOverlay(targetMon, 'handofgod', false)
    }
    const foa = this.spawnMissileByKey('fistofares', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 6,
    })
    foa.vx = 0
    foa.vy = 0
    return
  }

  if (skillId === 70 || skillId === 80 || skillId === 95) {
    // Necromancer corpse summons (1.13c SkillCltStFunc[14] 0x6FB784E0 & SkillCltStFunc[24] 0x6FB78620).
    // Find the targeted corpse at (targetX, targetY) and mark STATE_CORPSE_NODRAW (104) so the
    // corpse visually disappears and cannot be re-targeted.
    let corpseUnit: ClientUnit | undefined
    let fallbackCorpseUnit: ClientUnit | undefined
    let bestDistSq = 100
    let bestFallbackDistSq = 100
    for (const m of this._monsters.values()) {
      if (!(m.dead || m.mode === 0 || m.mode === 12 || m.lifePct <= 0)) continue
      if (m.states.has(99) || m.states.has(104) || m.states.has(107) || m.states.has(118) || m.states.has(173)) {
        continue
      }
      if (skillId === 95) {
        if (
          m.states.has(96) ||
          m.isUnique ||
          m.isChampion ||
          m.isSuperUnique ||
          (m as any).revivable === false
        ) {
          continue
        }
      }
      const dSq = (m.x - targetX) ** 2 + (m.y - targetY) ** 2
      if (
        skillId === 95 &&
        Number.isInteger(m.classId) &&
        m.classId >= 0 &&
        m.classId < 734 &&
        !hasMonStats2Flag(m.classId, MONSTATS2_FLAGINDEX.REVIVE)
      ) {
        if (dSq <= bestFallbackDistSq) {
          bestFallbackDistSq = dSq
          fallbackCorpseUnit = m
        }
        continue
      }
      if (dSq <= bestDistSq) {
        bestDistSq = dSq
        corpseUnit = m
      }
    }
    if (!corpseUnit && fallbackCorpseUnit) {
      corpseUnit = fallbackCorpseUnit
    }
    if (corpseUnit && skillId !== 95) {
      // SKILLS_CltDo31 (0x6FB788A0): Raise Skeleton / Skeletal Mage consume the corpse.
      // Revive (#95, SKILLS_CltSt24 0x6FB78620) never touches the corpse states client-side:
      // the server resurrects the SAME unitId in place (SKILLS_SrvDo058) and sends STATE_REVIVE (96).
      corpseUnit.states.add(104)
    }
    const cx = corpseUnit ? corpseUnit.x : targetX
    const cy = corpseUnit ? corpseUnit.y : targetY
    if (skillId === 70 || skillId === 80) {
      // cltmissilea = corpseexplosion (MissileCltDoFunc[11] 0x6FB62DC0 spawns 6 flying gore chunks)
      this.spawnMissileByKey('corpseexplosion', cx, cy, cx, cy, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
      })
      if (corpseUnit) {
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3
          const gx = cx + Math.cos(angle) * 2
          const gy = cy + Math.sin(angle) * 2
          this.spawnMissileByKey(i % 2 === 0 ? 'bigblood1' : 'bigblood2', cx, cy, gx, gy, {
            ownerType,
            ownerId,
            sourceSkillId: skillId,
            maxTicks: 16,
          })
        }
      }
    } else {
      // Revive (95, SkillCltStFunc[24] 0x6FB78620): selects exactly ONE revive missile by MonStats2 SizeX / small / large:
      // SizeX <= 1 (or small=1) -> revivesmall (#268), SizeX === 2 -> revivemedium (#269), SizeX >= 3 (or large=1) -> revivelarge (#270).
      const validClassId =
        corpseUnit && Number.isInteger(corpseUnit.classId) && corpseUnit.classId >= 0 && corpseUnit.classId < 734
          ? corpseUnit.classId
          : -1
      const sizeX = validClassId >= 0 ? getMonsterSizeXByHcIdx(validClassId) : 2
      const isSmall =
        sizeX <= 1 || (validClassId >= 0 && !hasMonStats2Flag(validClassId, MONSTATS2_FLAGINDEX.LARGE) && sizeX === 1)
      const isLarge =
        sizeX >= 3 || (validClassId >= 0 && hasMonStats2Flag(validClassId, MONSTATS2_FLAGINDEX.LARGE) && sizeX >= 3)
      const reviveMissileKey =
        isSmall ? 'revivesmall' : isLarge ? 'revivelarge' : 'revivemedium'
      this.spawnMissileByKey(reviveMissileKey, cx, cy, cx, cy, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
      })
    }
    return
  }

  // 7. Necromancer curses (1.13c States.txt / D2Client SKILLS_CltDo30_Curse 0x6fb78b40):
  // cltmissilec="cursecast" (#147) is spawned at cast start by SKILLS_CltSt18_Curse (applySkillCastToUnit).
  // On the Do frame ONE invisible cursecenter (#191) is created at the target carrying wCltMissileA (#181..#190,
  // CurseArea) and nVisualRadius = max(aurarangecalc - 3, 2); MISSMODE_CltDo17 (world-missile-stepper) scatters
  // the CurseArea particles on elapsed 0/3/6. Friendly units/pets/mercs are filtered, the 1.13c aurarangecalc
  // subtile radius is enforced, and replaced curse target overlays are cleaned up so only one curse overlay renders.
  const curseStateId = CURSE_SKILL_STATES[skillId]
  if (curseStateId !== undefined) {
    const cltMissileA = CURSE_CLT_MISSILE_A[skillId]
    const radiusSubtiles = getCurseRadiusSubtiles113c(skillId, skillLevel)
    if (cltMissileA) {
      const center = this.spawnMissileByKey('cursecenter', targetX, targetY, targetX, targetY, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks: CURSECENTER_RANGE_113C,
      })
      center.curseSubMissileKey = cltMissileA
      center.curseVisualRadius = curseVisualRadius113c(radiusSubtiles)
    }
    const curseOverlay = CURSE_TARGET_OVERLAYS[skillId]
    const isAiCurse = skillId === 71 || skillId === 77 || skillId === 81 || skillId === 86
    const candidates: ClientUnit[] = []
    for (const m of this._units.values()) {
      if (m.unitType !== 'monster' || m.dead) continue
      if (this.isFriendlyOrNonHostileMonster(m)) continue
      if (!canMonsterClassBeCursed113c(m.classId)) continue
      if (isAiCurse && (m.isUnique || m.isChampion || m.isSuperUnique)) continue
      if (Math.hypot(m.x - targetX, m.y - targetY) <= radiusSubtiles) {
        candidates.push(m)
      }
    }
    if (curseStateId === 57) {
      // #86 Attract (SkillDo035_Attract, cursetype=2, TargetableOnly=1): single closest hostile target
      candidates.sort(
        (a, b) => Math.hypot(a.x - targetX, a.y - targetY) - Math.hypot(b.x - targetX, b.y - targetY),
      )
      const targetMon = candidates[0]
      if (targetMon && !targetMon.states.has(57)) {
        for (const s of ALL_TYPE1_CURSE_STATES) {
          targetMon.states.remove(s)
        }
        targetMon.overlays = targetMon.overlays.filter(
          (o) => !ALL_CURSE_TARGET_OVERLAY_SET.has(o.token),
        )
        const attractOnSound = stateOnSoundRequest113c(targetMon, 57, false)
        if (attractOnSound) this.pushSoundRequest(attractOnSound)
        targetMon.states.add(57)
        this.attachUnitOverlay(targetMon, 'curse_hit', false)
        if (curseOverlay) {
          this.attachUnitOverlay(targetMon, curseOverlay, true)
        }
      }
    } else {
      for (const m of candidates) {
        // Standard type-1 curse: cannot overwrite Attract (state 57, cursetype=2)
        if (m.states.has(57)) continue
        // D2Client 0x6fb23760: onsound only on the inactive -> active transition (a refresh is silent).
        const curseOnSound = stateOnSoundRequest113c(m, curseStateId, m.states.has(curseStateId))
        for (const s of ALL_TYPE1_CURSE_STATES) {
          m.states.remove(s)
        }
        m.overlays = m.overlays.filter((o) => !ALL_CURSE_TARGET_OVERLAY_SET.has(o.token))
        if (curseOnSound) this.pushSoundRequest(curseOnSound)
        m.states.add(curseStateId)
        this.attachUnitOverlay(m, 'curse_hit', false)
        if (curseOverlay) {
          this.attachUnitOverlay(m, curseOverlay, true)
        }
      }
    }
    return
  }

  // 8. Barbarian Warcries (radial 32-missile shockwave rings, corpse horking, & overlays)
  if (skillId === 130 || skillId === 138 || skillId === 146 || skillId === 149 || skillId === 155) {
    const rayCount = 32
    const missileKey =
      skillId === 130
        ? 'howl'
        : skillId === 138
          ? 'shout'
          : skillId === 146
            ? 'battlecry'
            : skillId === 149
              ? 'battleorders'
              : 'battlecommand'
    const maxTicks =
      skillId === 130 ? 12 + Math.max(0, skillLevel - 1) : skillId === 146 ? 8 : 16
    const ringRadius = skillId === 146 ? 5.33 : skillId === 130 ? 12 : 10.67
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2
      const destX = caster.x + Math.cos(angle) * ringRadius
      const destY = caster.y + Math.sin(angle) * ringRadius
      this.spawnMissileByKey(missileKey, caster.x, caster.y, destX, destY, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks,
      })
    }
    if (skillId === 130) {
      for (const m of this._units.values()) {
        if (
          m.unitType === 'monster' &&
          !m.dead &&
          !this.isFriendlyOrNonHostileMonster(m) &&
          canMonsterClassBeCursed113c(m.classId) &&
          Math.hypot(m.x - caster.x, m.y - caster.y) <= 12
        ) {
          m.states.add(56)
          this.attachUnitOverlay(m, 'curseterror', false)
        }
      }
    } else if (skillId === 138) {
      caster.states.add(26)
      this.attachUnitOverlay(caster, 'shout_cast', false)
    } else if (skillId === 149) {
      caster.states.add(32)
      this.attachUnitOverlay(caster, 'battleorders_cast', false)
    } else if (skillId === 155) {
      caster.states.add(51)
      this.attachUnitOverlay(caster, 'battlecommand_cast', false)
    } else if (skillId === 146) {
      for (const m of this._monsters.values()) {
        if (
          !m.dead &&
          !this.isFriendlyOrNonHostileMonster(m) &&
          canMonsterClassBeCursed113c(m.classId) &&
          Math.hypot(m.x - caster.x, m.y - caster.y) <= 8
        ) {
          m.states.add(89)
          this.attachUnitOverlay(m, 'battlecry', false)
        }
      }
    }
    return
  }

  if (skillId === 154) {
    // War Cry: single ring of 32 'warcry' radial missiles + State #28 (stunned)
    const rayCount = 32
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2
      const destX = caster.x + Math.cos(angle) * 5.33
      const destY = caster.y + Math.sin(angle) * 5.33
      this.spawnMissileByKey('warcry', caster.x, caster.y, destX, destY, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks: 8,
      })
    }
    this.attachUnitOverlay(caster, 'warcry', false)
    for (const m of this._monsters.values()) {
      if (!m.dead && !(m as any).isBoss && Math.hypot(m.x - caster.x, m.y - caster.y) <= 8) {
        m.states.add(28)
        this.attachUnitOverlay(m, 'stun', false)
      }
    }
    return
  }

  if (skillId === 131 || skillId === 142) {
    // Find Potion (#131, soft corpse only) & Find Item (#142, all non-boss corpses)
    let bestCorpse: any = null
    let bestDist = 12
    for (const m of this._monsters.values()) {
      if (!m.dead || m.states.has(104) || m.states.has(118)) continue
      if (skillId === 131 && (m as any).isSoft === false) continue
      const d = Math.hypot(m.x - targetX, m.y - targetY)
      if (d <= bestDist) {
        bestDist = d
        bestCorpse = m
      }
    }
    if (bestCorpse) {
      bestCorpse.states.add(118)
      const cx = bestCorpse.x
      const cy = bestCorpse.y
      const puff = this.spawnMissileByKey('corpseexplosion', cx, cy, cx, cy, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks: 16,
      })
      puff.vx = 0
      puff.vy = 0
    }
    return
  }

  if (skillId === 137) {
    // Taunt: single-target non-boss monster
    let bestTarget: any = null
    let bestDist = 12
    for (const m of this._monsters.values()) {
      if (m.dead || (m as any).isBoss) continue
      const d = Math.hypot(m.x - targetX, m.y - targetY)
      if (d <= bestDist) {
        bestDist = d
        bestTarget = m
      }
    }
    if (bestTarget) {
      bestTarget.states.add(27)
      this.attachUnitOverlay(bestTarget, 'taunt', false)
    }
    return
  }

  // Barbarian Combat Skills (#126 Bash, #132 Leap, #139 Stun, #143 Leap Attack, #144 Concentrate, #147 Frenzy, #151 Whirlwind, #152 Berserk)
  if (skillId === 126 || skillId === 139) {
    let bestTarget: any = null
    let bestDist = 4
    for (const m of this._monsters.values()) {
      if (m.dead) continue
      const d = Math.min(Math.hypot(m.x - targetX, m.y - targetY), Math.hypot(m.x - caster.x, m.y - caster.y))
      if (d <= bestDist) {
        bestDist = d
        bestTarget = m
      }
    }
    if (bestTarget) {
      if (skillId === 126) {
        this.attachUnitOverlay(bestTarget, 'bash', false)
      } else {
        bestTarget.states.add(21)
        this.attachUnitOverlay(bestTarget, 'stun', false)
      }
    }
    return
  }

  if (skillId === 132 || skillId === 143) {
    caster.x = targetX
    caster.y = targetY
    this.attachUnitOverlay(caster, 'dust', false)
    if (skillId === 132) {
      const kbRadius = 4 + Math.max(0, skillLevel - 1) * 2
      for (const m of this._monsters.values()) {
        if (m.dead) continue
        const dxKb = m.x - targetX
        const dyKb = m.y - targetY
        const d = Math.hypot(dxKb, dyKb)
        if (d <= kbRadius) {
          const norm = d > 0.01 ? d : 1
          m.x += Math.round((dxKb / norm) * 2)
          m.y += Math.round((dyKb / norm) * 2)
        }
      }
    } else {
      let bestTarget: any = null
      let bestDist = 4
      for (const m of this._monsters.values()) {
        if (m.dead) continue
        const d = Math.hypot(m.x - targetX, m.y - targetY)
        if (d <= bestDist) {
          bestDist = d
          bestTarget = m
        }
      }
      if (bestTarget) {
        this.attachUnitOverlay(bestTarget, 'bash', false)
      }
    }
    return
  }

  if (skillId === 144) {
    caster.states.add(15)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(15)
    }
    return
  }

  if (skillId === 147) {
    caster.states.add(94)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(94)
    }
    this.attachUnitOverlay(caster, 'frenzy', true)
    return
  }

  if (skillId === 151) {
    caster.states.add(174)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(174)
    }
    this.attachUnitOverlay(caster, 'whirlwind', false)
    return
  }

  if (skillId === 152) {
    caster.states.add(95)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(95)
    }
    this.attachUnitOverlay(caster, 'berserkfront', false)
    this.attachUnitOverlay(caster, 'berserkback', false)
    return
  }

  if (skillId === 150) {
    // Grim Ward: consume soft corpse (states 104 + 118), spawn corpseexplosion + size-matched start/loop totem (1000 frames)
    let bestCorpse: any = null
    let bestDist = 12
    for (const m of this._monsters.values()) {
      if (!m.dead || m.states.has(104) || m.states.has(118) || (m as any).isSoft === false) continue
      const d = Math.hypot(m.x - targetX, m.y - targetY)
      if (d <= bestDist) {
        bestDist = d
        bestCorpse = m
      }
    }
    const wardX = bestCorpse ? bestCorpse.x : targetX
    const wardY = bestCorpse ? bestCorpse.y : targetY
    const sizeX = bestCorpse ? ((bestCorpse as any).sizeX ?? 2) : 2
    if (bestCorpse) {
      bestCorpse.states.add(104)
      bestCorpse.states.add(118)
    }
    const startKey =
      sizeX === 1 ? 'grimwardsmallstart' : sizeX === 3 ? 'grimwardlargestart' : 'grimwardmediumstart'
    const loopKey =
      sizeX === 1 ? 'grimwardsmall' : sizeX === 3 ? 'grimwardlarge' : 'grimwardmedium'
    const wardUnit = this.ensureUnit('monster', 8600)
    wardUnit.classId = 345
    wardUnit.ownerType = ownerType
    wardUnit.ownerId = ownerId
    wardUnit.x = wardX
    wardUnit.y = wardY
    wardUnit.mode = 8 // S1
    wardUnit.dead = false
    wardUnit.lifePct = 128
    const ce = this.spawnMissileByKey('corpseexplosion', wardX, wardY, wardX, wardY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 18,
    })
    ce.vx = 0
    ce.vy = 0
    const gwStart = this.spawnMissileByKey(startKey, wardX, wardY, wardX, wardY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 25,
    })
    gwStart.vx = 0
    gwStart.vy = 0
    const gwLoop = this.spawnMissileByKey(loopKey, wardX, wardY, wardX, wardY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 1000,
    })
    gwLoop.vx = 0
    gwLoop.vy = 0
    return
  }

  // 9. Druid Elemental Missiles (1.13c Skills.txt #225-#250)
  if (skillId === 225) {
    // #225 Firestorm (SrvDoFunc=113 / CltDoFunc=72): 3 weaving S-curve firestormmaker trails (Range=19)
    const angles = [-0.25, 0, 0.25]
    const fBaseAngle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx)
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!
      const destX = caster.x + Math.cos(fBaseAngle + a) * 15
      const destY = caster.y + Math.sin(fBaseAngle + a) * 15
      this.spawnMissileByKey('firestormmaker', caster.x, caster.y, destX, destY, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks: 19,
        pierce: true,
        jitterIndex: i,
      })
    }
    return
  }

  if (skillId === 229) {
    // #229 Molten Boulder (SrvDoFunc=116 / CltDoFunc=75): stationary emerge FX + rolling piercing boulder
    const emerge = this.spawnMissileByKey('moltenboulderemerge', caster.x, caster.y, caster.x, caster.y, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 12,
      loopAnim: false,
    })
    emerge.vx = 0
    emerge.vy = 0
    const destX = dx === 0 && dy === 0 ? caster.x + 10 : targetX
    const destY = dx === 0 && dy === 0 ? caster.y : targetY
    const boulder = this.spawnMissileByKey('moltenboulder', caster.x, caster.y, destX, destY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 50,
      pierce: true,
    })
    boulder.explosionMissile = 'moltenboulderemerge'
    boulder.alwaysExplode = true
    return
  }

  if (skillId === 230) {
    // #230 Arctic Blast (SrvDoFunc=117 / CltDoFunc=28): continuous cold stream (Range = 10 + 2*slvl)
    this.attachUnitOverlay(caster, 'arctic_blast_cast', false)
    const maxTicks = 10 + 2 * Math.max(1, skillLevel)
    const cosA = Math.cos(baseAngle)
    const sinA = Math.sin(baseAngle)
    for (let i = 0; i < 3; i++) {
      const d = i * 0.7
      const sx = caster.x + cosA * d
      const sy = caster.y + sinA * d
      const tx = sx + cosA * 16
      const ty = sy + sinA * 16
      const mKey = i % 2 === 0 ? 'arcticblast1' : 'arcticblast2'
      this.spawnMissileByKey(mKey, sx, sy, tx, ty, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks,
        pierce: true,
      })
    }
    return
  }

  if (skillId === 234) {
    // #234 Fissure (SrvDoFunc=118 / CltDoFunc=76): 80-frame ground eruption controller + initial vents
    this.attachUnitOverlay(caster, 'druid_fire_cast_2', false)
    const center = this.spawnMissileByKey('eruptioncenter', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 80,
    })
    center.vx = 0
    center.vy = 0
    const crack1 = this.spawnMissileByKey('eruption crack 1', targetX - 1, targetY, targetX - 1, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 28,
    })
    crack1.vx = 0
    crack1.vy = 0
    const crack2 = this.spawnMissileByKey('eruption crack 2', targetX + 1, targetY, targetX + 1, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 28,
    })
    crack2.vx = 0
    crack2.vy = 0
    const ventFire = this.spawnMissileByKey('firesmall', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 30,
    })
    ventFire.vx = 0
    ventFire.vy = 0
    return
  }

  if (skillId === 235) {
    // #235 Cyclone Armor (SrvDoFunc=119 / CltDoFunc=82, state 151): looping front/back wind shield overlays
    caster.states.add(151)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(151)
    }
    this.attachUnitOverlay(caster, 'cyclonearmor1front', true)
    this.attachUnitOverlay(caster, 'cyclonearmor1back', true)
    return
  }

  if (skillId === 232) {
    // #232 Feral Rage (SrvDoFunc=56, state 120): progressive red charge orb (feralrage1..3front)
    caster.states.add(120)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(120)
    }
    const maxCharges = Math.floor(Math.max(1, skillLevel) / 2) + 3
    const prevCharges = (caster as any).feralRageCharges || 0
    const nextCharges = Math.min(maxCharges, prevCharges + 1)
    ;(caster as any).feralRageCharges = nextCharges
    const overlayIdx = Math.min(3, Math.max(1, Math.ceil((nextCharges / maxCharges) * 3)))
    caster.overlays = caster.overlays.filter(o => !o.token.toLowerCase().startsWith('feralrage'))
    this.attachUnitOverlay(caster, `feralrage${overlayIdx}front`, true)
    return
  }

  if (skillId === 233) {
    // #233 Maul (SrvDoFunc=57, state 117): progressive green charge orb (maul1..3front) + stun on hit
    caster.states.add(117)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(117)
    }
    const maxCharges = Math.floor(Math.max(1, skillLevel) / 2) + 3
    const prevCharges = (caster as any).maulCharges || 0
    const nextCharges = Math.min(maxCharges, prevCharges + 1)
    ;(caster as any).maulCharges = nextCharges
    const overlayIdx = Math.min(3, Math.max(1, Math.ceil((nextCharges / maxCharges) * 3)))
    caster.overlays = caster.overlays.filter(o => !o.token.toLowerCase().startsWith('maul'))
    this.attachUnitOverlay(caster, `maul${overlayIdx}front`, true)
    for (const m of this._monsters.values()) {
      if (!m.dead && Math.hypot(m.x - targetX, m.y - targetY) <= 4 && !(m as any).isBoss && !m.isUnique && !m.isSuperUnique && !m.isChampion) {
        m.states.add(21)
        this.attachUnitOverlay(m, 'stun', false)
      }
    }
    return
  }

  if (skillId === 238) {
    // #238 Rabies (SrvDoFunc=120, state 112): plague overlay on target and nearby contagion targets (7 subtiles)
    for (const m of this._monsters.values()) {
      if (!m.dead && Math.hypot(m.x - targetX, m.y - targetY) <= 7) {
        m.states.add(112)
        this.attachUnitOverlay(m, 'rabiesplague', false)
      }
    }
    return
  }

  if (skillId === 239) {
    // Fire Claws: fire_hit overlay on target
    for (const m of this._monsters.values()) {
      if (!m.dead && Math.hypot(m.x - targetX, m.y - targetY) <= 4) {
        this.attachUnitOverlay(m, 'fire_hit', false)
      }
    }
    return
  }

  if (skillId === 242) {
    // #242 Hunger (SrvDoFunc=122): life/mana leech bite overlay on caster
    this.attachUnitOverlay(caster, 'stealskull', false)
    return
  }

  if (skillId === 248) {
    // #248 Fury (SrvDoFunc=123): multi-hit werewolf melee flurry
    return
  }

  if (skillId === 240) {
    // #240 Twister (SrvDoFunc=123 / CltDoFunc=78): 3 wavy piercing wind vortices (Range=25, StunLen=10)
    const angles = [-0.3, 0, 0.3]
    const tBaseAngle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx)
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!
      const destX = caster.x + Math.cos(tBaseAngle + a) * 16
      const destY = caster.y + Math.sin(tBaseAngle + a) * 16
      this.spawnMissileByKey('twister', caster.x, caster.y, destX, destY, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks: 25,
        pierce: true,
        jitterIndex: i,
      })
    }
    return
  }

  if (skillId === 243) {
    // #243 Shock Wave (SrvDoFunc=121 / CltDoFunc=67): 5 piercing fan missiles with non-boss stun
    const angles = [-0.5, -0.25, 0, 0.25, 0.5]
    const baseAngle = Math.atan2(targetY - caster.y, targetX - caster.x)
    for (const a of angles) {
      const destX = caster.x + Math.cos(baseAngle + a) * 14
      const destY = caster.y + Math.sin(baseAngle + a) * 14
      this.spawnMissileByKey('shockwave', caster.x, caster.y, destX, destY, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        pierce: true,
      })
    }
    for (const m of this._monsters.values()) {
      if (!m.dead && Math.hypot(m.x - targetX, m.y - targetY) <= 8 && !(m as any).isBoss && !m.isUnique && !m.isSuperUnique && !m.isChampion) {
        m.states.add(21)
        this.attachUnitOverlay(m, 'stun', false)
      }
    }
    return
  }

  if (skillId === 244) {
    // #244 Volcano (SrvDoFunc=124 / CltDoFunc=79): 150-frame volcano cone + periodic erupting lava balls
    this.attachUnitOverlay(caster, 'druid_fire_cast_2', false)
    const vBase = this.spawnMissileByKey('volcanobase', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 150,
    })
    vBase.vx = 0
    vBase.vy = 0
    const vFire = this.spawnMissileByKey('volcanofire', targetX, targetY, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 150,
    })
    vFire.vx = 0
    vFire.vy = 0
    const vRock = this.spawnMissileByKey('volcanorock', targetX, targetY, targetX + 1.5, targetY + 1.5, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 20,
      altitude: 60,
      verticalDescentPerTick: 3,
    })
    vRock.explosionMissile = 'fireexplode'
    vRock.alwaysExplode = true
    return
  }

  if (skillId === 245) {
    // #245 Tornado (SrvDoFunc=125 / CltDoFunc=80): wavy piercing vortex (Range=35, Param1=5, NextDelay=25)
    const destX = dx === 0 && dy === 0 ? caster.x + 12 : targetX
    const destY = dx === 0 && dy === 0 ? caster.y : targetY
    this.spawnMissileByKey('tornado', caster.x, caster.y, destX, destY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 35,
      pierce: true,
      jitterIndex: 0,
    })
    return
  }

  if (skillId === 249) {
    // #249 Armageddon (SrvDoFunc=126 / CltDoFunc=82, state 145): 250 + Fissure*50 frame meteor storm around caster
    this.attachUnitOverlay(caster, 'druid_fire_cast_2', false)
    caster.states.add(145)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(145)
    }
    const syn234 = Math.max(0, caster.stats.get(234) ?? 0)
    caster.armageddonSkillLevel = skillLevel
    caster.armageddonUntilTick = this.frameCount + 250 + syn234 * 50
    const dropX = dx === 0 && dy === 0 ? caster.x + 2 : targetX
    const dropY = dy === 0 && dx === 0 ? caster.y + 1 : targetY
    const rock = this.spawnMissileByKey('armageddonrock', dropX, dropY, dropX, dropY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 15,
      altitude: 375,
      verticalDescentPerTick: 25,
    })
    rock.vx = 0
    rock.vy = 0
    rock.explosionMissile = 'armageddonground'
    rock.alwaysExplode = true
    const tail = this.spawnMissileByKey('armageddontail', dropX, dropY, dropX, dropY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 15,
      altitude: 375,
      verticalDescentPerTick: 25,
    })
    tail.vx = 0
    tail.vy = 0
    return
  }

  if (skillId === 250) {
    // #250 Hurricane (SrvDoFunc=126 / CltDoFunc=82, state 144): 250 + CycloneArmor*50 frame cold vortex around caster
    caster.states.add(144)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(144)
    }
    const syn235 = Math.max(0, caster.stats.get(235) ?? 0)
    caster.hurricaneSkillLevel = skillLevel
    caster.hurricaneUntilTick = this.frameCount + 250 + syn235 * 50
    const debrisKeys = ['hurricaneswoosh', 'hurricanerock', 'hurricanetree'] as const
    for (let i = 0; i < debrisKeys.length; i++) {
      const angle = (i * 2 * Math.PI) / debrisKeys.length
      const radius = 2.5 + (i % 2) * 1.2
      const sx = caster.x + Math.cos(angle) * radius
      const sy = caster.y + Math.sin(angle) * radius * ISO_GROUND_ASPECT_RATIO
      this.spawnMissileByKey(debrisKeys[i]!, sx, sy, sx, sy, {
        ownerType,
        ownerId,
        sourceSkillId: skillId,
        skillLevel,
        maxTicks: 100,
        pierce: true,
        originX: caster.x,
        originY: caster.y,
        spiralAngle: angle,
        spiralRadius: radius,
      })
    }
    return
  }

  // 10. Druid Summons: 1.13c Skills.txt has NO cltmissile and NO cast overlay for any
  // druid summon — the client only plays the cast animation; the summoned unit arrives
  // via the server's UnitAssign. The previous client-side predicted summon unit and
  // pet-group eviction scans were non-vanilla and are removed (Issue #955).

  // 11. Assassin Traps, Shadow Clones, and Thrown Blades
  if (skillId === 251) {
    // Fire Blast
    this.spawnMissileByKey('firetrauma', caster.x, caster.y, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    return
  }

  if (skillId === 256) {
    // Shock Web
    this.spawnMissileByKey('shockfieldair', caster.x, caster.y, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    return
  }

  if (skillId === 257) {
    // Blade Sentinel
    this.spawnMissileByKey('bladecreeper', caster.x, caster.y, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    this.spawnMissileByKey('bladefragment1', caster.x, caster.y, targetX, targetY, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
    })
    return
  }

  if (skillId === 266) {
    // Blade Fury (single stream shuriken per 1.13c SrvDo048 / CltDo6)
    const tx = dx === 0 && dy === 0 ? startX + Math.cos(baseAngle) * 20 : targetX
    const ty = dx === 0 && dy === 0 ? startY + Math.sin(baseAngle) * 20 : targetY
    const bf = this.spawnMissileByKey('bladefury1', startX, startY, tx, ty, {
      ownerType,
      ownerId,
      sourceSkillId: skillId,
      skillLevel,
      maxTicks: 22,
    })
    bf.explosionMissile = 'bladefragment1'
    bf.alwaysExplode = true
    return
  }

  if (skillId === 277) {
    // Blade Shield (State 158 bladeshield, periodic 25-frame aura)
    caster.states.add(158)
    if (caster.unitType === 'player' && (caster.id === this.selfId || this.selfId === 0)) {
      this._self.states.add(158)
    }
    return
  }

  if (skillId === 253) {
    // Psychic Hammer: the caster's 'psychic_hammer_curse' comes from Skills.txt
    // castoverlay via the generic cast path; only the target hits attach here.
    for (const m of this._monsters.values()) {
      if (!m.dead && Math.hypot(m.x - targetX, m.y - targetY) <= 4) {
        this.attachUnitOverlay(m, 'psychic_hammer_hit', false)
      }
    }
    return
  }

  if (skillId === 273) {
    // Mind Blast (1.13c radius = 4 sub-tiles = 2.6 yards; hit overlay 'mindblast_hit' + 'stun', converted State 21 'conversion')
    for (const m of this._monsters.values()) {
      if (!m.dead && Math.hypot(m.x - targetX, m.y - targetY) <= 4) {
        this.attachUnitOverlay(m, 'mindblast_hit', false)
        this.attachUnitOverlay(m, 'stun', false)
        const isBossOrUnique = Boolean(
          (m as any).isBoss ||
            (m as any).isUnique ||
            (m as any).isSuperUnique ||
            (m as any).isChampion ||
            (m as any).rank === 'boss' ||
            (m as any).rank === 'unique' ||
            (m as any).rank === 'champion',
        )
        if (!isBossOrUnique) {
          m.states.add(21) // State 21 = conversion
        }
      }
    }
    return
  }

  // Trap Sentries: 261, 262, 271, 272, 276
  if (
    skillId === 261 ||
    skillId === 262 ||
    skillId === 271 ||
    skillId === 272 ||
    skillId === 276
  ) {
    let trapClassId = 412
    let trapMissile = 'sentrychargedbolt'
    if (skillId === 261) {
      trapClassId = 412 // chargeboltsentry
      trapMissile = 'sentrychargedbolt'
    } else if (skillId === 262) {
      trapClassId = 414 // wakeofdestruction (MonStats.txt hcIdx = 414)
      trapMissile = 'wakeofdestruction'
    } else if (skillId === 271) {
      trapClassId = 413 // lightningsentry
      trapMissile = 'sentrylightningbolt'
    } else if (skillId === 272) {
      trapClassId = 415 // infernosentry
      trapMissile = 'inferno sentry 1'
    } else if (skillId === 276) {
      trapClassId = 416 // deathsentry
      trapMissile = 'sentrylightningbolt'
    }

    // Maintain max 5 traps per caster
    if (!(this as any)._trapIdsByOwner) (this as any)._trapIdsByOwner = new Map<number, number[]>()
    const trapIds: number[] = (this as any)._trapIdsByOwner.get(ownerId) ?? []
    if (trapIds.length >= 5) {
      const oldestTrapId = trapIds.shift()!
      const oldestTrap = this.getUnit('monster', oldestTrapId)
      if (oldestTrap) {
        this._units.delete(oldestTrap.key)
        this._monsters.delete(oldestTrap.id)
      }
    }

    const trapId = 8600 + skillId * 10 + (trapIds.length % 5)
    trapIds.push(trapId)
    ;(this as any)._trapIdsByOwner.set(ownerId, trapIds)

    const trapUnit = this.ensureUnit('monster', trapId)
    trapUnit.classId = trapClassId
    trapUnit.ownerType = ownerType
    trapUnit.ownerId = ownerId
    trapUnit.x = targetX
    trapUnit.y = targetY
    trapUnit.mode = 1 // NU mode
    trapUnit.dead = false
    trapUnit.lifePct = 128
    this._monsters.set(trapId, trapUnit)

    if (skillId === 276) {
      this.attachUnitOverlay(trapUnit, 'death_sentry', false)
    }

    // Spawn initial projectile(s) from trap toward target
    if (skillId === 261) {
      const shockWebBlvl = Math.max(0, caster.stats.get(256) ?? 0)
      const boltCount = 5 + Math.floor(shockWebBlvl / 3)
      for (let i = 0; i < boltCount; i++) {
        this.spawnMissileByKey(trapMissile, targetX, targetY, targetX + 10, targetY, {
          ownerType: 'monster',
          ownerId: trapId,
          sourceSkillId: skillId,
          skillLevel,
          jitterIndex: i + 1,
        })
      }
    } else {
      this.spawnMissileByKey(trapMissile, targetX, targetY, targetX + 10, targetY, {
        ownerType: 'monster',
        ownerId: trapId,
        sourceSkillId: skillId,
        skillLevel,
        pierce: skillId === 271 || skillId === 276 ? true : undefined,
      })
    }
    return
  }

  // Shadow Clones: 268 Shadow Warrior, 279 Shadow Master
  if (skillId === 268 || skillId === 279) {
    const cloneClassId = skillId === 268 ? 417 : 418
    const cloneId = 8800 + ownerId
    // Clones are unique per caster: replace old clone if exists
    const oldClone = this.getUnit('monster', cloneId)
    if (oldClone) {
      this._units.delete(oldClone.key)
      this._monsters.delete(oldClone.id)
    }

    const cloneUnit = this.ensureUnit('monster', cloneId)
    cloneUnit.classId = cloneClassId
    cloneUnit.ownerType = ownerType
    cloneUnit.ownerId = ownerId
    cloneUnit.x = targetX
    cloneUnit.y = targetY
    cloneUnit.mode = 1 // NU mode
    cloneUnit.dead = false
    cloneUnit.lifePct = 128
    cloneUnit.states.add(119) // state 119 = shadowwarrior
    this._monsters.set(cloneId, cloneUnit)
    return
  }
}

export function applySkillCastToUnitImpl(
  this: ClientWorldInternal,
  unit: ClientUnit,
  skillId: number,
  targetX: number,
  targetY: number,
  skillLevel = 1,
  spawnVisuals = true,
  nowMs?: number,
): void {
  unit.lastSkillId = skillId
  unit.skillLevel = Math.max(1, skillLevel)
  unit.moveMode = 'stop'
  // Turn toward the cast/attack target via D2Common.#10425 (bInstant = 0); 25Hz tick steps
  // `unit.direction` toward `unit.targetDirection`.
  unit.faceToward(targetX, targetY, false)
  if (unit.unitType === 'monster') {
    const npcUnit = this.npcMotion.getUnit(unit.id)
    if (npcUnit?.pDynamicPath) {
      D2COMMON_10160_PathUpdateDirection(npcUnit.pDynamicPath, unit.targetDirection)
    }
  }
  const animModes = getSkillAnimModes(skillId)
  const mode = unit.unitType === 'monster' ? animModes.monsterMode : animModes.playerMode
  const isSelf = unit.unitType === 'player' && (unit.id === this.selfId || this.selfId === 0)
  unit.mode = mode
  if (unit.unitType === 'monster') {
    const npcUnit = this.npcMotion.getUnit(unit.id)
    if (npcUnit) {
      this.npcMotion.changeAnimMode0x6FADA6C0(npcUnit, mode)
      npcUnit.dwFlags = (npcUnit.dwFlags & ~0x01) >>> 0
    }
    if (spawnVisuals) {
      this.emitMonsterModeSound(unit, mode, skillId)
    }
  }
  const castOverlayToken = getSkillCastOverlay(skillId)
  const now = this.resolveEventNowMs(nowMs)
  let frames = 12
  let baseSpeed = 256
  let effRate = 0
  let stepSpeed256 = 256
  let durationMs = computeOneShotDurationMs(frames, stepSpeed256)

  if (unit.unitType === 'player') {
    const animParams = this.resolvePlayerAnimSpeed(mode, unit.id, skillId)
    frames = animParams.frames
    baseSpeed = animParams.baseSpeed
    effRate = animParams.effRate
    stepSpeed256 = animParams.stepSpeed256
    durationMs = animParams.durationMs
    if (mode === 18) {
      const wclass = isSelf
        ? resolveEquippedWeaponClass(Array.from(this._containers.equipment.values()))
        : 'hth'
      const seq0 = resolveSkillSequenceFrame(skillId, wclass, 0, stepSpeed256)
      if (seq0) {
        frames = seq0.totalSequenceFrames
        durationMs = computeSequenceDurationMs(frames, stepSpeed256)
      }
    }
  } else if (unit.unitType === 'monster') {
    if (unit.totalFrames && unit.totalFrames > 0) {
      frames = unit.totalFrames
    }
    if (unit.animStepSpeed256 && unit.animStepSpeed256 > 0) {
      stepSpeed256 = unit.animStepSpeed256
      baseSpeed = stepSpeed256
    } else if (unit.animSpeed && unit.animSpeed > 0) {
      baseSpeed = Math.round((unit.animSpeed / 16) * 256)
      stepSpeed256 = baseSpeed
    }
    durationMs = computeOneShotDurationMs(frames, stepSpeed256)
  }

  const castState: UnitCastState = {
    skillId,
    targetX,
    targetY,
    mode,
    startedAtMs: now,
    untilMs: now + durationMs,
    castOverlayToken,
    durationMs,
    elapsedMs: 0,
    stepSpeed256,
    frames,
    baseSpeed,
    effRate,
  }
  unit.castState = castState
  unit.modeStartedAtMs = now
  unit.modeUntilMs = now + durationMs
  unit.modeDurationMs = durationMs
  unit.modeElapsedMs = 0
  unit.animStepSpeed256 = stepSpeed256
  unit.animEffRate = effRate
  if (isSelf) {
    this._self.castState = castState
  }

  if (spawnVisuals) {
    this.emitSkillCastSound({
      skillId,
      ...(unit.unitType === 'player'
        ? { charclass: (isSelf ? this._self.charClass : unit.classId) ?? unit.classId }
        : {}),
      x: unit.x,
      y: unit.y,
      unitId: unit.id,
      local: isSelf,
    })
    if (castOverlayToken) {
      // 1.13c attaches exactly the skill's castoverlay — the extra 'light_cast_3'
      // companion attach was an invented token absent from Overlay.txt (Issue #955).
      this.attachUnitOverlay(unit, castOverlayToken, false)
    }
    if (CURSE_SKILL_STATES[skillId] !== undefined) {
      // 1.13c SKILLS_CltSt18_Curse (0x6fb785c0): Skills.txt cltmissilec = cursecast (#147) at the caster on cast start.
      this.spawnMissileByKey('cursecast', unit.x, unit.y, unit.x, unit.y, {
        ownerType: unit.unitType,
        ownerId: unit.id,
        sourceSkillId: skillId,
        skillLevel: Math.max(1, skillLevel),
      })
    }
    if (skillId === 68) {
      // #68 Bone Armor (state 14, nooverlays=1): StateSetFunc[6] 0x6FB23230 owns the bonearmor_cast →
      // bonearmor_front/back chain and the 1..3 phase-offset bone pairs (stats 132/133 via 0xA8).
      unit.states.add(14)
      if (isSelf) this._self.states.add(14)
      syncBoneArmorOverlays113c(unit, () => this._nextOverlayId++)
    }
    if (skillId === 40 || skillId === 50 || skillId === 60) {
      // 1.13c Cold Armors are strictly mutually exclusive: clear existing cold armor states (10, 88, 20)
      unit.states.remove(10)
      unit.states.remove(88)
      unit.states.remove(20)
      unit.overlays = unit.overlays.filter(
        (o) =>
          o.token !== 'frozenarmor' &&
          o.token !== 'shiverarmor' &&
          o.token !== 'chillarmor' &&
          o.token !== 'chillingarmor',
      )
      if (isSelf) {
        this._self.states.delete(10)
        this._self.states.delete(88)
        this._self.states.delete(20)
      }
    }
    if (PALADIN_AURA_SKILL_STATES[skillId] !== undefined) {
      // 1.13c Paladin Auras are strictly mutually exclusive: clear existing 20 aura states & overlays
      this.removePaladinAuraStatesAndOverlays(unit, isSelf)
      if (skillId === 100) this.attachUnitOverlay(unit, 'cast_resistfire', false)
      if (skillId === 105) this.attachUnitOverlay(unit, 'cast_resistcold', false)
      if (skillId === 110) this.attachUnitOverlay(unit, 'cast_resistlight', false)
      if (skillId === 125) this.attachUnitOverlay(unit, 'cast_resistall', false)
    }
    if (skillId === 223) {
      // Werewolf: if already in wolf form (state 139), revert to human and play wolf_undo
      unit.states.remove(120)
      unit.states.remove(117)
      if (isSelf) {
        this._self.states.delete(120)
        this._self.states.delete(117)
      }
      ;(unit as any).feralRageCharges = 0
      ;(unit as any).maulCharges = 0
      unit.overlays = unit.overlays.filter(
        o => !o.token.toLowerCase().startsWith('feralrage') && !o.token.toLowerCase().startsWith('maul'),
      )
      if (unit.states.has(139)) {
        unit.states.remove(139)
        if (isSelf) this._self.states.delete(139)
        this.attachUnitOverlay(unit, 'wolf_undo', false)
      } else {
        unit.states.remove(140)
        if (isSelf) this._self.states.delete(140)
        unit.states.add(139)
        if (isSelf) this._self.states.add(139)
        this.attachUnitOverlay(unit, 'wolf_into', false)
      }
    } else if (skillId === 228) {
      // Werebear: if already in bear form (state 140), revert to human and play bear_undo
      unit.states.remove(120)
      unit.states.remove(117)
      if (isSelf) {
        this._self.states.delete(120)
        this._self.states.delete(117)
      }
      ;(unit as any).feralRageCharges = 0
      ;(unit as any).maulCharges = 0
      unit.overlays = unit.overlays.filter(
        o => !o.token.toLowerCase().startsWith('feralrage') && !o.token.toLowerCase().startsWith('maul'),
      )
      if (unit.states.has(140)) {
        unit.states.remove(140)
        if (isSelf) this._self.states.delete(140)
        this.attachUnitOverlay(unit, 'bear_undo', false)
      } else {
        unit.states.remove(139)
        if (isSelf) this._self.states.delete(139)
        unit.states.add(140)
        if (isSelf) this._self.states.add(140)
        this.attachUnitOverlay(unit, 'bear_into', false)
      }
    } else if (skillId === 235) {
      // Cyclone Armor (state 151): persistent front + back wind shield overlays
      unit.states.add(151)
      if (isSelf) this._self.states.add(151)
      this.attachUnitOverlay(unit, 'cyclonearmor1front', true)
      this.attachUnitOverlay(unit, 'cyclonearmor1back', true)
    } else if (skillId === 249) {
      // Armageddon (state 145): 250 + Fissure*50 frame meteor storm timer
      unit.states.add(145)
      if (isSelf) this._self.states.add(145)
      const syn234 = Math.max(0, (isSelf ? this._self.skills.get(234) : undefined) ?? unit.stats.get(234) ?? 0)
      unit.armageddonSkillLevel = Math.max(1, skillLevel)
      unit.armageddonUntilTick = this.frameCount + 250 + syn234 * 50
    } else if (skillId === 250) {
      // Hurricane (state 144): 250 + CycloneArmor*50 frame cold vortex timer
      unit.states.add(144)
      if (isSelf) this._self.states.add(144)
      const syn235 = Math.max(0, (isSelf ? this._self.skills.get(235) : undefined) ?? unit.stats.get(235) ?? 0)
      unit.hurricaneSkillLevel = Math.max(1, skillLevel)
      unit.hurricaneUntilTick = this.frameCount + 250 + syn235 * 50
    }

    // Assassin Self-Buffs & Shadow Disciplines
    if (skillId === 258) {
      // Burst of Speed (state 157) removes Fade (state 159); one-shot cast overlay 'quickness' (loop: false)
      unit.states.remove(159)
      if (isSelf) this._self.states.delete(159)
      unit.overlays = unit.overlays.filter(o => o.token !== 'fade' && o.token !== 'ethereal')
      unit.states.add(157)
      if (isSelf) this._self.states.add(157)
      this.attachUnitOverlay(unit, 'quickness', false)
    } else if (skillId === 267) {
      // Fade (state 159 translucent render) removes Burst of Speed (state 157); cast overlay 'ethereal' (not nonexistent 'fade')
      unit.states.remove(157)
      if (isSelf) this._self.states.delete(157)
      unit.overlays = unit.overlays.filter(o => o.token !== 'quickness' && o.token !== 'fade')
      unit.states.add(159)
      if (isSelf) this._self.states.add(159)
      this.attachUnitOverlay(unit, 'ethereal', false)
    } else if (skillId === 277) {
      // Blade Shield (state 158): Skills.txt has no cast overlay — only the persistent
      // 'bladeshield' state overlay ('blade_shield_cast' was an invented token, #955)
      unit.states.add(158)
      if (isSelf) this._self.states.add(158)
      this.attachUnitOverlay(unit, 'bladeshield', true)
    } else if (skillId === 278) {
      // Venom (state 31 'venomclaws' only; remove bogus state 178 'antidote')
      unit.states.remove(178)
      unit.states.add(31)
      if (isSelf) {
        this._self.states.delete(178)
        this._self.states.add(31)
      }
      this.attachUnitOverlay(unit, 'venomclaws', false)
    } else if (skillId === 264) {
      // Cloak of Shadows: caster gets State 153 ('cloaked'), monsters in 30 sub-tiles get State 156 ('cloak_of_shadows') with overhead 'blindaura'
      unit.states.add(153)
      if (isSelf) this._self.states.add(153)
      this.attachUnitOverlay(unit, 'cloaked', false)
      for (const m of this._monsters.values()) {
        if (
          !m.dead &&
          !this.isFriendlyOrNonHostileMonster(m) &&
          canMonsterClassBeCursed113c(m.classId) &&
          Math.hypot(m.x - unit.x, m.y - unit.y) <= 30
        ) {
          m.states.add(156)
          this.attachUnitOverlay(m, 'blindaura', true)
        }
      }
    }

    // Martial Arts Charge-Up skills (1.13c Overlay.txt: chargeup1..3, Stealup1..3, Royalup1..3, Fireup1..3, Coldup1..3, Lightup1..3)
    const chargeSkillMap: Record<number, { state: number; altState: number; canonicalPrefix: string; prefix: string }> = {
      254: { state: 122, altState: 147, canonicalPrefix: 'chargeup', prefix: 'progressive_damage_' },
      265: { state: 123, altState: 148, canonicalPrefix: 'Stealup', prefix: 'progressive_steal_' },
      280: { state: 124, altState: 149, canonicalPrefix: 'Royalup', prefix: 'progressive_other_' },
      259: { state: 125, altState: 150, canonicalPrefix: 'Fireup', prefix: 'progressive_fire_' },
      274: { state: 126, altState: 151, canonicalPrefix: 'Coldup', prefix: 'progressive_cold_' },
      269: { state: 127, altState: 152, canonicalPrefix: 'Lightup', prefix: 'progressive_lightning_' },
    }
    if (chargeSkillMap[skillId]) {
      const { state, altState, canonicalPrefix, prefix } = chargeSkillMap[skillId]
      if (!(unit as any).chargeCounts) (unit as any).chargeCounts = new Map<number, number>()
      const currentCharges = (unit as any).chargeCounts.get(skillId) ?? 0
      const nextCharge = Math.min(3, currentCharges + 1)
      ;(unit as any).chargeCounts.set(skillId, nextCharge)
      unit.states.add(state)
      unit.states.add(altState)
      if (isSelf) {
        this._self.states.add(state)
        this._self.states.add(altState)
      }
      const lowerCanonical = canonicalPrefix.toLowerCase()
      unit.overlays = unit.overlays.filter(
        (o) =>
          !o.token.startsWith(prefix) &&
          !o.token.startsWith(canonicalPrefix) &&
          !o.token.startsWith(lowerCanonical),
      )
      this.attachUnitOverlay(unit, `${canonicalPrefix}${nextCharge}`, true)
      this.attachUnitOverlay(unit, `${prefix}${nextCharge}`, true)
      if (skillId === 254) {
        unit.overlays = unit.overlays.filter((o) => !o.token.startsWith('tigerstrike'))
        this.attachUnitOverlay(unit, `tigerstrike${nextCharge}`, true)
        for (const m of this._monsters.values()) {
          if (Math.hypot(m.x - targetX, m.y - targetY) <= 3) {
            this.attachUnitOverlay(m, 'assassinfootimpact', false)
          }
        }
      }
      if (skillId === 265) {
        unit.overlays = unit.overlays.filter((o) => !o.token.startsWith('cobrastrike'))
        this.attachUnitOverlay(unit, `cobrastrike${nextCharge}`, true)
      }
    }

    // Martial Arts Finishing moves (Normal Attack 0, Dragon Talon 255, Dragon Claw 260, Dragon Tail 270, Dragon Flight 275)
    const isFinisher =
      skillId === 0 || skillId === 255 || skillId === 260 || skillId === 270 || skillId === 275
    if (isFinisher) {
      if (skillId === 270) {
        // Dragon Tail: explosive kick
        this.attachUnitOverlay(unit, 'assassinfootimpact', false)
        this.spawnMissileByKey('dragontail missile', targetX, targetY, targetX, targetY, {
          ownerType: unit.unitType,
          ownerId: unit.id,
          sourceSkillId: skillId,
        })
        this.spawnMissileByKey('fireexplode', targetX, targetY, targetX, targetY, {
          ownerType: unit.unitType,
          ownerId: unit.id,
          sourceSkillId: skillId,
        })
      } else if (skillId === 275) {
        // Dragon Flight: teleport kick
        unit.x = targetX
        unit.y = targetY
        this.attachUnitOverlay(unit, 'dragonflight', false)
      }

      const chargeCounts: Map<number, number> | undefined = (unit as any).chargeCounts
      if (chargeCounts && chargeCounts.size > 0) {
        for (const [cSkill, count] of chargeCounts.entries()) {
          if (cSkill === 259) {
            // Fists of Fire discharges
            if (count >= 2) {
              this.spawnMissileByKey('fistsoffireexplode', targetX, targetY, targetX, targetY, {
                ownerType: unit.unitType,
                ownerId: unit.id,
                sourceSkillId: cSkill,
              })
            }
            if (count === 3) {
              this.spawnMissileByKey('fistsoffirefirewall', targetX, targetY, targetX, targetY, {
                ownerType: unit.unitType,
                ownerId: unit.id,
                sourceSkillId: cSkill,
              })
            }
          } else if (cSkill === 269) {
            // Claws of Thunder discharges (C2: clawsofthundernova, C3: 16x clawsofthunderbolt)
            if (count >= 2) {
              this.spawnMissileByKey('clawsofthundernova', targetX, targetY, targetX, targetY, {
                ownerType: unit.unitType,
                ownerId: unit.id,
                sourceSkillId: cSkill,
              })
            }
            if (count === 3) {
              for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2
                const tx = targetX + Math.cos(angle) * 16
                const ty = targetY + Math.sin(angle) * 16
                this.spawnMissileByKey('clawsofthunderbolt', targetX, targetY, tx, ty, {
                  ownerType: unit.unitType,
                  ownerId: unit.id,
                  sourceSkillId: cSkill,
                })
              }
            }
          } else if (cSkill === 274) {
            // Blades of Ice discharges
            if (count >= 2) {
              this.spawnMissileByKey('bladesoficeexplode', targetX, targetY, targetX, targetY, {
                ownerType: unit.unitType,
                ownerId: unit.id,
                sourceSkillId: cSkill,
              })
            }
            if (count === 3) {
              this.spawnMissileByKey('bladesoficecubes', targetX, targetY, targetX, targetY, {
                ownerType: unit.unitType,
                ownerId: unit.id,
                sourceSkillId: cSkill,
              })
            }
          } else if (cSkill === 280) {
            // Phoenix Strike discharges (C1: royalstrikemeteorcenter + royalstrikemeteorfire, C2: 7x royalstrikechainlightning, C3: 16x royalstrikechaosice)
            if (count === 1) {
              this.spawnMissileByKey('royalstrikemeteorcenter', targetX, targetY, targetX, targetY, {
                ownerType: unit.unitType,
                ownerId: unit.id,
                sourceSkillId: cSkill,
              })
              this.spawnMissileByKey('royalstrikemeteorfire', targetX, targetY, targetX, targetY, {
                ownerType: unit.unitType,
                ownerId: unit.id,
                sourceSkillId: cSkill,
              })
            } else if (count === 2) {
              for (let i = 0; i < 7; i++) {
                const angle = (i * 10 * Math.PI * 2) / 64
                const tx = targetX + Math.cos(angle) * 16
                const ty = targetY + Math.sin(angle) * 16
                this.spawnMissileByKey('royalstrikechainlightning', targetX, targetY, tx, ty, {
                  ownerType: unit.unitType,
                  ownerId: unit.id,
                  sourceSkillId: cSkill,
                })
              }
            } else if (count === 3) {
              for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2
                const tx = targetX + Math.cos(angle) * 16
                const ty = targetY + Math.sin(angle) * 16
                this.spawnMissileByKey('royalstrikechaosice', targetX, targetY, tx, ty, {
                  ownerType: unit.unitType,
                  ownerId: unit.id,
                  sourceSkillId: cSkill,
                })
              }
            }
          } else if (cSkill === 254 || cSkill === 265) {
            this.attachUnitOverlay(unit, 'assassinfootimpact', false)
          }
        }
        // Clear all charges and overlays
        for (let st = 122; st <= 127; st++) {
          unit.states.remove(st)
          if (isSelf) this._self.states.delete(st)
        }
        for (let st = 147; st <= 152; st++) {
          unit.states.remove(st)
          if (isSelf) this._self.states.delete(st)
        }
        unit.overlays = unit.overlays.filter(
          (o) =>
            !o.token.startsWith('progressive_') &&
            !o.token.startsWith('chargeup') &&
            !o.token.startsWith('Stealup') &&
            !o.token.startsWith('stealup') &&
            !o.token.startsWith('Royalup') &&
            !o.token.startsWith('royalup') &&
            !o.token.startsWith('Fireup') &&
            !o.token.startsWith('fireup') &&
            !o.token.startsWith('Lightup') &&
            !o.token.startsWith('lightup') &&
            !o.token.startsWith('Coldup') &&
            !o.token.startsWith('coldup') &&
            !o.token.startsWith('tigerstrike') &&
            !o.token.startsWith('cobrastrike'),
        )
        chargeCounts.clear()
      }
    }

    const buffStateId = SELF_BUFF_SKILL_STATES[skillId]
    if (
      buffStateId !== undefined &&
      skillId !== 223 &&
      skillId !== 228 &&
      skillId !== 258 &&
      skillId !== 267
    ) {
      unit.states.add(buffStateId)
      if (isSelf) {
        this._self.states.add(buffStateId)
      }
    }
    const effectiveLevel =
      unit.unitType === 'player' && (unit.id === this.selfId || this.selfId === 0)
        ? Math.max(1, this._self.skills.get(skillId) ?? skillLevel)
        : Math.max(1, skillLevel)
    // 1.13c D2Client spawns cltmissilea on the cast animation's ACTION FRAME
    // (AnimData.d2 frame event), not at cast start — otherwise the projectile
    // visibly leaves while the actor is still winding up (Issue #905 feedback:
    // knife/fireball flying out before the character's motion).
    const actionFrameDelayMs = this.resolveCastActionFrameDelayMs(
      unit,
      mode,
      skillId,
      animModes.seqNum,
      stepSpeed256,
      durationMs,
    )
    if (actionFrameDelayMs > 0) {
      castState.missileFireDelayMs = actionFrameDelayMs
      castState.missileSkillLevel = effectiveLevel
      castState.missileSpawned = false
    } else {
      this.emitSkillKeyframeSound({
        skillId,
        flag: 1,
        x: unit.x,
        y: unit.y,
        unitId: unit.id,
        local: isSelf,
      })
      this.spawnMissilesForSkill(unit, skillId, targetX, targetY, effectiveLevel)
    }

    const delayFrames = SKILLS_BY_ID[skillId]?.delay ?? 0
    if (delayFrames > 0) {
      const delayMs = delayFrames * 40
      this._skillDelayUntilMs = now + delayMs
      this._skillDelayDurationMs = delayMs
      unit.states.add(121)
      if (isSelf) {
        this._self.states.add(121)
      }
    }
  }
}

export function removePaladinAuraStatesAndOverlaysImpl(this: ClientWorldInternal, unit?: ClientUnit, isSelf = false): void {
  const auraOverlayTokens = new Set<string>()
  for (const s of ALL_PALADIN_AURA_STATES) {
    unit?.states.remove(s)
    if (isSelf) {
      this._self.states.delete(s)
    }
    const ovs = STATE_OVERLAYS[s]
    if (ovs) {
      const arr = Array.isArray(ovs) ? ovs : [ovs]
      for (const t of arr) {
        auraOverlayTokens.add(String(t).toLowerCase())
      }
    }
  }
  if (unit && auraOverlayTokens.size > 0) {
    unit.overlays = unit.overlays.filter(o => !auraOverlayTokens.has(o.token.toLowerCase()))
  }
}

export function syncSelfRightHandAuraStateImpl(this: ClientWorldInternal, skillId: number): void {
  const resolvedSelfId = this.selfId || (this.getUnit('player', 1) ? 1 : 0)
  const selfUnit = resolvedSelfId !== 0 ? this.getUnit('player', resolvedSelfId) : undefined
  const hadPaladinAura = ALL_PALADIN_AURA_STATES.some(
    s => this._self.states.has(s) || Boolean(selfUnit?.states.has(s)),
  )
  const nextAuraState = PALADIN_AURA_SKILL_STATES[skillId]
  if (hadPaladinAura || nextAuraState !== undefined) {
    this.removePaladinAuraStatesAndOverlays(selfUnit, true)
  }
  if (nextAuraState !== undefined) {
    this._self.states.add(nextAuraState)
    if (selfUnit) {
      selfUnit.states.add(nextAuraState)
      if (skillId === 100) this.attachUnitOverlay(selfUnit, 'cast_resistfire', false)
      if (skillId === 105) this.attachUnitOverlay(selfUnit, 'cast_resistcold', false)
      if (skillId === 110) this.attachUnitOverlay(selfUnit, 'cast_resistlight', false)
      if (skillId === 125) this.attachUnitOverlay(selfUnit, 'cast_resistall', false)
    }
  }
}
