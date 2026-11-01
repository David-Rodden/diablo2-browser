/**
 * GameInstance Subsystem: Area Bootstrap, Room Streaming & Player Session Lifecycle (`src/server/engine/game-instance/area-and-session.ts`).
 */

import { ACT_SPAWN_TILE_ENTRY } from '../../../common/world/act-spawn-location.ts'
import { SPARKLY_CHEST_INIT57_CLASS_IDS_113C, PRE_OPERATE_ROLLED_OBJECTS_113C, rollChestLocked113c } from '../../../common/world/object-operate-113c.ts'
import { getLevelMonsterLevel113c } from '../../../common/world/levels-monlvl-113c.ts'
import { PANDEMONIUM_AREA_IDS_113C, findFreePortalCoordNear113c } from '../../world/pandemonium-113c.ts'
import { QUEST_FLAG_COMPLETED_113C, QUEST_FLAG_COMPLETED_NOW_113C, QUEST_FLAG_LEAVE_BEFORE_113C, questWordIndex113c } from '../quests-113c.ts'
import { D2Rng } from '../../../common/rng/d2-rng.ts'
import { hirelingLevelFromExp, MAX_MERCENARY_LEVEL_113C } from '../../../common/progression/experience-113c.ts'
import { isTentacleHeadHcIdx113c } from '../../../common/units/monai-113c.ts'
import { hasMonStats2Flag, MONSTATS2_FLAGINDEX } from '../../../common/units/monstats2-flags.ts'
import { CANONICAL_CHARSTATS } from '../../../common/units/classes.ts'
import { HIRELING_RECORDS } from '../../../common/units/hireling-table.ts'
import type { LocalAreaPresetMonster, ServerEvent, UnitId } from '../../../netproto/index.ts'
import { findStandableNear, resolvePresetObject113c } from '../../world/area-bootstrap.ts'
import { readD2sSave113c, type D2sDecodedCharacterSave } from '../../save/d2s-reader.ts'
import { createDefaultNpcIntroData } from '../../save/d2s-writer.ts'
import { FIXED_ONE } from '../stat-list.ts'
import type { AnimDispatcher } from '../anim-dispatcher.ts'
import type { GameInstanceHost } from './host.ts'
import type { AreaArrival, ConnectPlayerSpec, InternalPlayerRecord, InternalWarpTileRecord, LoadedAreaRecord, ServerItemEntry } from './types.ts'
import { ACT_TOWN_AREA, CLASS_ID_TO_CODE, CLASS_SKILL_OFFSET, LEGACY_TEST_GRID_SPAWN, PLAYER_UNIT_SIZE, ROOM_HIDE_RADIUS_TILES, ROOM_REVEAL_RADIUS_TILES, ROOM_TILE_SPAN_113C, SUBTILES_PER_TILE, TOWN_AREAS, WAYPOINT_AREA_IDS, areaToAct, experienceForLevel113c, lookupBaseInfo, normalizeClassId, type UnitType113c, UNIT_TYPE_113C } from './constants-and-helpers.ts'


/** Enable or disable 25Hz `AnimDispatcher` windup, keyframe release, and frame-lock (`#1789`). */
function setAnimActionWindup(this: GameInstanceHost, enabled: boolean): void {
  this.animActionWindupEnabled = Boolean(enabled)
  for (const disp of this.playerAnimDispatchers.values()) {
    disp.setEnforceFrameLock(this.animActionWindupEnabled)
  }
}



function isAnimActionWindupEnabled(this: GameInstanceHost): boolean {
  return this.animActionWindupEnabled
}



function getPlayerAnimDispatcher(this: GameInstanceHost, playerUnitId: number): AnimDispatcher | undefined {
  const player = this.players.get(playerUnitId)
  if (player === undefined) return undefined
  return this.syncPlayerAnimDispatcher113c(player)
}



/** Returns the deterministic per-game 5-stone sequence (`17..21`) deciphered onto `'bkd'` (`#1926`). */
function getCairnStoneOrder(this: GameInstanceHost): readonly number[] {
  return this.cairnStoneOrder
}



/** Whether the area bootstrap resolver brought `areaId` online. */
function isAreaLoaded(this: GameInstanceHost, areaId: number): boolean {
  return this.loadedAreas.has(areaId)
}



/**
 * Bring `areaId` online once (D2Game room/level allocation on first entry): register its collision and
 * rooms and spawn its preset objects, NPCs/monsters and warp tiles. Returns `false` without a resolver
 * or when the resolver cannot build the level (map assets not loaded).
 */
function ensureAreaLoaded(this: GameInstanceHost, areaId: number): boolean {
  return this.loadArea(areaId) !== null
}



/**
 * Spawn one DRLG preset monster (`D2Game.dll` `0x6FD012D0` -> `0x6FC67CF0`). Classes whose MonStats2 row
 * has `critter` set are never spawned by the server (`0x6FC66FC0`: `0x6FC213B0(classId, 13)` -> return 0;
 * flag 13 = `MONSTATS2_FLAGINDEX.CRITTER`, e.g. the Rogue Encampment chickens `149`).
 */
function spawnAreaPresetMonster113c(this: GameInstanceHost, areaId: number, mon: LocalAreaPresetMonster): void {
  if (mon.superUniqueIndex !== undefined) {
    this.spawnSuperUnique({ superUniqueIndex: mon.superUniqueIndex, x: mon.x, y: mon.y, areaId })
    return
  }
  if (hasMonStats2Flag(mon.classId, MONSTATS2_FLAGINDEX.CRITTER)) return
  this.spawnMonster({
    classId: mon.classId,
    x: mon.x,
    y: mon.y,
    areaId,
    name: mon.name,
    isNpc: mon.isNpc,
    isVendor: mon.isVendor,
    isKillable: mon.isKillable,
    aiDisabled: mon.aiDisabled,
    spawnTentacleLimbs: isTentacleHeadHcIdx113c(mon.classId),
  })
}



function loadArea(this: GameInstanceHost, areaId: number): LoadedAreaRecord | null {
  const existing = this.loadedAreas.get(areaId)
  if (existing) return existing
  const resolver = this.areaBootstrapResolver
  if (!resolver) return null
  const bootstrap = resolver({
    act: areaToAct(areaId),
    areaId,
    mapSeed: this.currentMapSeed,
    difficulty: this.difficulty,
  })
  if (!bootstrap) return null
  if (bootstrap.areaId !== areaId) {
    throw new Error(
      `GameInstance.ensureAreaLoaded: resolver returned area ${bootstrap.areaId} for area ${areaId}`,
    )
  }
  const record: LoadedAreaRecord = {
    areaId,
    spawnX: bootstrap.spawnX,
    spawnY: bootstrap.spawnY,
    rooms: bootstrap.rooms,
    roomRects: bootstrap.roomRects,
    adjacentAreaIds: bootstrap.adjacentAreaIds ?? [],
    isWalkable: bootstrap.isWalkable,
    ...(bootstrap.findActSpawnLocation !== undefined
      ? { findActSpawnLocation: bootstrap.findActSpawnLocation }
      : {}),
  }
  this.loadedAreas.set(areaId, record)
  const areaLvl = getLevelMonsterLevel113c(areaId, this.difficulty, true)
  for (const obj of bootstrap.objects) {
    const resolved = resolvePresetObject113c(obj.classId, areaId, (n: number) => this.rng.rand(n))
    if (!resolved) continue
    const isSparkling = Boolean(
      obj.isSparkling ??
        resolved.isSparkling ??
        SPARKLY_CHEST_INIT57_CLASS_IDS_113C.has(resolved.classId),
    )
    this.spawnObject({
      classId: resolved.classId,
      x: obj.x,
      y: obj.y,
      areaId,
      mode: obj.mode === 0 ? undefined : obj.mode,
      isWaypoint: obj.isWaypoint,
      isShrine: obj.isShrine,
      isLocked:
        isSparkling
          ? false
          : ((obj as { readonly isLocked?: boolean }).isLocked ??
            rollChestLocked113c(resolved.classId, areaLvl, this.rng)),
      isSparkling,
      destAreaId: obj.destAreaId,
      rollTrap: !TOWN_AREAS.has(areaId),
      rollPreOperate: !TOWN_AREAS.has(areaId) && !PRE_OPERATE_ROLLED_OBJECTS_113C.has(obj),
    })
  }
  // Preset monsters belong to their DRLG room and are spawned when that room is activated by a nearby
  // player (`activatePresetRoomsNearPlayer113c`, D2Game new-room processing `0x6FC4CBE0` ->
  // `0x6FD01430`). Presets outside every room rectangle (synthetic geometry) are spawned right away.
  const pendingByRoom = new Map<number, LocalAreaPresetMonster[]>()
  for (const mon of bootstrap.monsters) {
    const room = bootstrap.roomRects.find(
      (r) => mon.x >= r.x && mon.x < r.x + r.w && mon.y >= r.y && mon.y < r.y + r.h,
    )
    if (room === undefined) {
      this.spawnAreaPresetMonster113c(areaId, mon)
      continue
    }
    let list = pendingByRoom.get(room.index)
    if (list === undefined) {
      list = []
      pendingByRoom.set(room.index, list)
    }
    list.push(mon)
  }
  if (pendingByRoom.size > 0) {
    this.pendingPresetMonsters.set(areaId, { byRoom: pendingByRoom, activated: new Set() })
  }
  for (const warp of bootstrap.warps) {
    const unitId = this.allocateUnitId(UNIT_TYPE_113C.tile)
    const tile: InternalWarpTileRecord = {
      unitId,
      lvlWarpId: warp.lvlWarpId,
      areaId,
      x: warp.x,
      y: warp.y,
      destAreaId: warp.destAreaId,
    }
    this.warpTiles.set(unitId, tile)
    this.broadcastToArea(areaId, this.warpTileAssignEvent(tile))
  }
  if (PANDEMONIUM_AREA_IDS_113C.has(areaId) || areaId === 39 || areaId === 121) {
    const returnTownAreaId = areaId === 39 ? 1 : 109
    let returnObj = [...this.objects.values()].find(
      (o) => o.areaId === areaId && o.classId === 60 && o.destAreaId === returnTownAreaId,
    )
    if (returnObj === undefined) {
      const portalPos = findFreePortalCoordNear113c({
        originX: record.spawnX,
        originY: record.spawnY,
        existingPortals: [...this.objects.values()].filter(
          (o) => o.areaId === areaId && (o.classId === 59 || o.classId === 60),
        ),
        isWalkable: (x, y) => record.isWalkable(areaId, x, y),
      })
      const returnPortalId = this.spawnObject({
        classId: 60,
        x: portalPos.x,
        y: portalPos.y,
        areaId,
        mode: 2,
        destAreaId: returnTownAreaId,
      })
      returnObj = this.objects.get(returnPortalId)
    }
    if (returnObj !== undefined) {
      const townObj = [...this.objects.values()].find(
        (o) => o.areaId === returnTownAreaId && o.classId === 60 && o.destAreaId === areaId,
      )
      if (townObj !== undefined) {
        returnObj.linkedPortalId = townObj.unitId
        townObj.linkedPortalId = returnObj.unitId
      }
    }
  }
  if (areaId === 1) {
    this.syncRogueEncampmentA1Q3State113c()
  }
  if (areaId === 25) {
    this.syncTowerCellarA1Q4State113c(25)
  }
  if (areaId === 73) {
    this.syncDurielsLairA2Q6State113c(73)
  }
  if (areaId === 109) {
    this.syncHarrogathA5Q3State113c()
  }
  return record
}



/**
 * Bring the 1-hop seam neighbours of `areaId` online so collision at an outdoor border is
 * composited across both regions (#1335). Idempotent; failures are retried by the next call.
 */
function ensureAdjacentAreasLoaded(this: GameInstanceHost, areaId: number): void {
  const area = this.loadedAreas.get(areaId)
  if (!area) return
  for (const id of area.adjacentAreaIds) {
    if (id > 0 && id !== areaId && !this.loadedAreas.has(id)) this.loadArea(id)
  }
}



/** S2C 0x09 AssignWarp (`UNIT_TILE = 5`, class = LvlWarp.txt `Id`), in its decoded `UnitAssign` form. */
function warpTileAssignEvent(this: GameInstanceHost, tile: InternalWarpTileRecord): ServerEvent {
  return {
    type: 'UnitAssign',
    areaId: tile.areaId,
    classId: tile.lvlWarpId,
    unit: {
      unitType: 5,
      id: tile.unitId,
      classId: tile.lvlWarpId,
      warpId: tile.lvlWarpId,
      x: tile.x,
      y: tile.y,
    },
  }
}



interface ComputedRoomSubtileBounds113c {
  readonly subX: number
  readonly subY: number
  readonly subW: number
  readonly subH: number
  readonly tileW: number
  readonly tileH: number
  readonly rect:
    | {
        readonly x: number
        readonly y: number
        readonly w: number
        readonly h: number
        readonly seed?: number
      }
    | undefined
}

interface IndexedAreaRoomBounds113c {
  readonly key: string
  readonly bounds: ComputedRoomSubtileBounds113c
}

interface AreaRoomBoundsSpatialIndex113c {
  readonly rectByTileKey: Map<string, ComputedRoomSubtileBounds113c['rect']>
  readonly boundsByTileKey: Map<string, ComputedRoomSubtileBounds113c>
  readonly buckets: Map<number, IndexedAreaRoomBounds113c[]>
}

const AREA_ROOM_BUCKET_SHIFT_113C = 6 // 64x64 sub-tile buckets
const areaRoomBoundsIndexByRecord113c = new WeakMap<
  LoadedAreaRecord,
  AreaRoomBoundsSpatialIndex113c
>()

function areaRoomBucketKey113c(bx: number, by: number): number {
  return bx * 65536 + by
}

function computeRoomSubtileBoundsFromRect113c(
  tileX: number,
  tileY: number,
  rect: ComputedRoomSubtileBounds113c['rect'],
): ComputedRoomSubtileBounds113c {
  const tileW = rect
    ? Math.max(1, Math.round(rect.w / SUBTILES_PER_TILE))
    : ROOM_TILE_SPAN_113C
  const tileH = rect
    ? Math.max(1, Math.round(rect.h / SUBTILES_PER_TILE))
    : ROOM_TILE_SPAN_113C
  return {
    subX: tileX * SUBTILES_PER_TILE,
    subY: tileY * SUBTILES_PER_TILE,
    subW: tileW * SUBTILES_PER_TILE,
    subH: tileH * SUBTILES_PER_TILE,
    tileW,
    tileH,
    rect,
  }
}

function getAreaRoomBoundsIndex113c(
  area: LoadedAreaRecord,
): AreaRoomBoundsSpatialIndex113c {
  let index = areaRoomBoundsIndexByRecord113c.get(area)
  if (index !== undefined) return index
  const rectByTileKey = new Map<string, ComputedRoomSubtileBounds113c['rect']>()
  for (const r of area.roomRects ?? []) {
    const tx = Math.floor(r.x / SUBTILES_PER_TILE)
    const ty = Math.floor(r.y / SUBTILES_PER_TILE)
    const tKey = `${tx}:${ty}`
    if (!rectByTileKey.has(tKey)) {
      rectByTileKey.set(tKey, r)
    }
  }
  const boundsByTileKey = new Map<string, ComputedRoomSubtileBounds113c>()
  const buckets = new Map<number, IndexedAreaRoomBounds113c[]>()
  for (const room of area.rooms) {
    const tKey = `${room.tileX}:${room.tileY}`
    let bounds = boundsByTileKey.get(tKey)
    if (bounds === undefined) {
      bounds = computeRoomSubtileBoundsFromRect113c(
        room.tileX,
        room.tileY,
        rectByTileKey.get(tKey),
      )
      boundsByTileKey.set(tKey, bounds)
    }
    if (bounds.subW <= 0 || bounds.subH <= 0) continue
    const entry: IndexedAreaRoomBounds113c = {
      key: `${room.areaId}:${room.tileX}:${room.tileY}`,
      bounds,
    }
    const minBx = Math.floor(bounds.subX) >> AREA_ROOM_BUCKET_SHIFT_113C
    const maxBx =
      Math.floor(bounds.subX + bounds.subW - 1e-6) >> AREA_ROOM_BUCKET_SHIFT_113C
    const minBy = Math.floor(bounds.subY) >> AREA_ROOM_BUCKET_SHIFT_113C
    const maxBy =
      Math.floor(bounds.subY + bounds.subH - 1e-6) >> AREA_ROOM_BUCKET_SHIFT_113C
    for (let bx = minBx; bx <= maxBx; bx++) {
      for (let by = minBy; by <= maxBy; by++) {
        const bKey = areaRoomBucketKey113c(bx, by)
        let list = buckets.get(bKey)
        if (list === undefined) {
          list = []
          buckets.set(bKey, list)
        }
        list.push(entry)
      }
    }
  }
  index = { rectByTileKey, boundsByTileKey, buckets }
  areaRoomBoundsIndexByRecord113c.set(area, index)
  return index
}

function getRoomSubtileBounds113c(this: GameInstanceHost, 
  area: LoadedAreaRecord | undefined,
  tileX: number,
  tileY: number,
): ComputedRoomSubtileBounds113c {
  if (!area) {
    return computeRoomSubtileBoundsFromRect113c(tileX, tileY, undefined)
  }
  const index = getAreaRoomBoundsIndex113c(area)
  const tKey = `${tileX}:${tileY}`
  const cached = index.boundsByTileKey.get(tKey)
  if (cached !== undefined) return cached
  const computed = computeRoomSubtileBoundsFromRect113c(
    tileX,
    tileY,
    index.rectByTileKey.get(tKey),
  )
  index.boundsByTileKey.set(tKey, computed)
  return computed
}



/**
 * 1.13c room AOI (`D2Game.dll` `PLAYER_UpdateRooms` `0x6FC6AC84`, #1857):
 * Reveals rooms near the player (`MapAdd 0x07`) across the active area and already-loaded
 * stitched outdoor seam neighbors, and emits `UnitRemove (0x0A)` BEFORE `MapRemove (0x08)`
 * whenever a room drops out of `revealedRoomKeys`.
 */
function revealAreaRoomsNearPlayer(this: GameInstanceHost, 
  player: InternalPlayerRecord,
  emitRoomUnits = false,
): void {
  const area = this.loadedAreas.get(player.areaId)
  if (!area) return
  const candidateAreas: LoadedAreaRecord[] = [area]
  const seenAreaIds = new Set<number>([player.areaId])
  for (const [adjId, adjArea] of this.loadedAreas) {
    if (seenAreaIds.has(adjId)) continue
    if (
      area.adjacentAreaIds.includes(adjId) ||
      this.isAreaSeamAdjacent(player.areaId, adjId)
    ) {
      seenAreaIds.add(adjId)
      candidateAreas.push(adjArea)
    }
  }
  for (const key of [...player.revealedRoomKeys]) {
    const [rawAreaId, rawTileX, rawTileY] = key.split(':')
    const roomAreaId = Number(rawAreaId)
    if (seenAreaIds.has(roomAreaId)) continue
    player.revealedRoomKeys.delete(key)
    const roomArea = this.loadedAreas.get(roomAreaId)
    const tileX = Number(rawTileX)
    const tileY = Number(rawTileY)
    const bounds = this.getRoomSubtileBounds113c(roomArea, tileX, tileY)
    this.emitRoomUnitsRemovedToPlayer(
      player,
      roomAreaId,
      bounds.subX,
      bounds.subY,
      bounds.subW,
      bounds.subH,
    )
    this.emitToPlayer(player.unitId, {
      type: 'RoomHide',
      areaId: roomAreaId,
      tileX,
      tileY,
    })
  }

  const px = Math.floor(player.x / SUBTILES_PER_TILE)
  const py = Math.floor(player.y / SUBTILES_PER_TILE)
  for (const candArea of candidateAreas) {
    for (const room of candArea.rooms) {
      const key = `${room.areaId}:${room.tileX}:${room.tileY}`
      const bounds = this.getRoomSubtileBounds113c(candArea, room.tileX, room.tileY)
      const { tileW, tileH, rect } = bounds
      const dx = Math.max(
        room.tileX - px,
        0,
        px - (room.tileX + tileW - 1),
      )
      const dy = Math.max(
        room.tileY - py,
        0,
        py - (room.tileY + tileH - 1),
      )
      const dist = Math.max(dx, dy)
      if (player.revealedRoomKeys.has(key)) {
        if (dist > ROOM_HIDE_RADIUS_TILES) {
          player.revealedRoomKeys.delete(key)
          this.emitRoomUnitsRemovedToPlayer(
            player,
            room.areaId,
            bounds.subX,
            bounds.subY,
            bounds.subW,
            bounds.subH,
          )
          this.emitToPlayer(player.unitId, {
            type: 'RoomHide',
            areaId: room.areaId,
            tileX: room.tileX,
            tileY: room.tileY,
          })
        }
      } else if (dist <= ROOM_REVEAL_RADIUS_TILES) {
        const firstEverReveal = !this.everRevealedRoomKeys.has(key)
        this.everRevealedRoomKeys.add(key)
        player.revealedRoomKeys.add(key)
        if (
          firstEverReveal &&
          this.worldEventTriggered &&
          !this.diabloCloneSpawned &&
          this.difficulty === 2 &&
          !TOWN_AREAS.has(room.areaId)
        ) {
          this.maybeReplacePreloadedRoomSuperUniqueWithDiabloClone113c(
            room.areaId,
            bounds.subX,
            bounds.subY,
            bounds.subW,
            bounds.subH,
          )
        }
        this.emitToPlayer(player.unitId, {
          type: 'RoomReveal',
          areaId: room.areaId,
          tileX: room.tileX,
          tileY: room.tileY,
          ...(rect !== undefined
            ? {
                roomSeed: rect.seed,
                tileW,
                tileH,
              }
            : {}),
        })
        if (emitRoomUnits) {
          this.emitRoomUnitsToPlayer(
            player,
            room.areaId,
            bounds.subX,
            bounds.subY,
            bounds.subW,
            bounds.subH,
          )
        }
      }
    }
  }
}



/**
 * Stream `UnitAssign` / `ItemEvent` for all world units (remote players, corpses, monsters,
 * mercenaries, summons, objects, ground items, warp tiles) inside a newly-revealed room
 * rectangle `[subX, subX + subW) × [subY, subY + subH)` (`S2C 0x07 MapAdd` AOI, #1857).
 */
function emitRoomUnitsToPlayer(this: GameInstanceHost, 
  player: InternalPlayerRecord,
  areaId: number,
  subX: number,
  subY: number,
  subW: number,
  subH: number,
): void {
  const inRoom = (x: number, y: number): boolean =>
    x >= subX && x < subX + subW && y >= subY && y < subY + subH
  for (const ent of this.getAoiWorldEntities()) {
    if (ent.unitType === 'missile') continue
    if (ent.unitType === 'player' && ent.unitId === player.unitId) continue
    if (ent.areaId !== areaId || !inRoom(ent.x, ent.y)) continue
    for (const ev of this.buildEntityEnterAoiEvents(ent.unitType, ent.unitId)) {
      this.emitToPlayer(player.unitId, ev)
    }
  }
}



/**
 * Emit `S2C 0x0A UnitRemove` for known world units inside a room rectangle right before
 * `S2C 0x08 RoomHide` (`D2Game.dll` `PLAYER_UpdateRooms` `0x6FC6AC84`, #1857).
 */
function emitRoomUnitsRemovedToPlayer(this: GameInstanceHost, 
  player: InternalPlayerRecord,
  areaId: number,
  subX: number,
  subY: number,
  subW: number,
  subH: number,
): void {
  const inRoom = (x: number, y: number): boolean =>
    x >= subX && x < subX + subW && y >= subY && y < subY + subH
  for (const ent of this.getAoiWorldEntities()) {
    if (ent.unitType === 'missile' || ent.unitType === 'tile') continue
    if (ent.unitType === 'player' && ent.unitId === player.unitId) continue
    if (ent.areaId !== areaId || !inRoom(ent.x, ent.y)) continue
    const wireUnitType =
      ent.unitType === 'player'
        ? 0
        : ent.unitType === 'monster'
          ? 1
          : ent.unitType === 'object'
            ? 2
            : 4
    this.emitToPlayer(player.unitId, {
      type: 'UnitRemove',
      unitType: wireUnitType,
      id: ent.unitId,
      unitId: ent.unitId,
      areaId,
    })
  }
}



/** Hide every room of `areaId` this player currently sees (leaving the area). */
function hidePlayerAreaRooms(this: GameInstanceHost, player: InternalPlayerRecord, areaId: number): void {
  const prefix = `${areaId}:`
  const roomArea = this.loadedAreas.get(areaId)
  for (const key of [...player.revealedRoomKeys]) {
    if (!key.startsWith(prefix)) continue
    player.revealedRoomKeys.delete(key)
    const [, rawTileX, rawTileY] = key.split(':')
    const tileX = Number(rawTileX)
    const tileY = Number(rawTileY)
    const bounds = this.getRoomSubtileBounds113c(roomArea, tileX, tileY)
    this.emitRoomUnitsRemovedToPlayer(
      player,
      areaId,
      bounds.subX,
      bounds.subY,
      bounds.subW,
      bounds.subH,
    )
    this.emitToPlayer(player.unitId, {
      type: 'RoomHide',
      areaId,
      tileX,
      tileY,
    })
  }
}



/**
 * 1.13c `UNITROOM_Broadcast` (`0x6FC4C830`, #1857): test whether world coordinate `(x, y)` in
 * `targetAreaId` lies within `viewer`'s active room AOI (including stitched outdoor seam areas).
 */
function isPointInViewerAoi113c(this: GameInstanceHost, 
  viewer: InternalPlayerRecord,
  targetAreaId: number,
  x: number,
  y: number,
): boolean {
  if (
    viewer.areaId !== targetAreaId &&
    !this.isAreaSeamAdjacent(viewer.areaId, targetAreaId)
  ) {
    return false
  }
  const targetArea = this.loadedAreas.get(targetAreaId)
  if (targetArea && targetArea.rooms.length > 0) {
    const index = getAreaRoomBoundsIndex113c(targetArea)
    const bx = Math.floor(x) >> AREA_ROOM_BUCKET_SHIFT_113C
    const by = Math.floor(y) >> AREA_ROOM_BUCKET_SHIFT_113C
    const bucketRooms = index.buckets.get(areaRoomBucketKey113c(bx, by))
    let coveredByAnyRoom = false
    if (bucketRooms !== undefined) {
      for (let i = 0; i < bucketRooms.length; i++) {
        const entry = bucketRooms[i]!
        const { bounds, key } = entry
        if (
          x >= bounds.subX &&
          x < bounds.subX + bounds.subW &&
          y >= bounds.subY &&
          y < bounds.subY + bounds.subH
        ) {
          coveredByAnyRoom = true
          if (viewer.revealedRoomKeys.has(key)) {
            return true
          }
          if (
            viewer.revealedRoomKeys.size === 0 &&
            Math.max(Math.abs(viewer.x - x), Math.abs(viewer.y - y)) <=
              ROOM_REVEAL_RADIUS_TILES * SUBTILES_PER_TILE
          ) {
            return true
          }
        }
      }
    }
    if (coveredByAnyRoom) {
      return false
    }
    return (
      Math.max(Math.abs(viewer.x - x), Math.abs(viewer.y - y)) <=
      ROOM_HIDE_RADIUS_TILES * SUBTILES_PER_TILE
    )
  }
  if (viewer.areaId === targetAreaId) {
    return true
  }
  return (
    Math.max(Math.abs(viewer.x - x), Math.abs(viewer.y - y)) <=
    ROOM_HIDE_RADIUS_TILES * SUBTILES_PER_TILE
  )
}



/**
 * Synchronize `UnitAssign` / `UnitRemove` (`0x0A`) for every connected viewer when a dynamic
 * unit (`player`, `monster`, `merc`, `pet`) moves across room/seam AOI boundaries (#1857).
 */
function syncUnitMoveAcrossViewerAoi113c(this: GameInstanceHost, 
  unitType: 'player' | 'monster',
  unitId: number,
  prevAreaId: number,
  prevX: number,
  prevY: number,
  nextAreaId: number,
  nextX: number,
  nextY: number,
  excludeViewerUnitId?: number,
): void {
  for (const viewer of this.players.values()) {
    if (viewer.unitId === unitId || viewer.unitId === excludeViewerUnitId) continue
    const wasIn = this.isPointInViewerAoi113c(viewer, prevAreaId, prevX, prevY)
    const nowIn = this.isPointInViewerAoi113c(viewer, nextAreaId, nextX, nextY)
    if (wasIn && !nowIn) {
      this.emitToPlayer(viewer.unitId, {
        type: 'UnitRemove',
        unitType: unitType === 'player' ? 0 : 1,
        id: unitId,
        unitId,
        areaId: prevAreaId,
      })
    } else if (!wasIn && nowIn) {
      for (const ev of this.buildEntityEnterAoiEvents(unitType, unitId)) {
        this.emitToPlayer(viewer.unitId, ev)
      }
    }
  }
}



/**
 * Landing spot in `area` for `arrival`, grounded on standable floor (never the geometric centre or void):
 * - waypoint: the area's waypoint object;
 * - warp: the destination area's warp tile leading back to the area the player came from;
 * - town portal / respawn: the area's DRLG start (town entry).
 * `null` when the area has no such landmark or no standable floor next to it.
 */
function resolveArrivalPosition(this: GameInstanceHost, 
  area: LoadedAreaRecord,
  arrival: AreaArrival,
): { readonly x: number; readonly y: number } | null {
  let anchor: { readonly x: number; readonly y: number } | null = null
  if (arrival.kind === 'waypoint') {
    for (const obj of this.objects.values()) {
      if (obj.areaId === area.areaId && obj.isWaypoint) {
        anchor = obj
        break
      }
    }
  } else if (arrival.kind === 'levelSpawn') {
    if (area.findActSpawnLocation !== undefined) {
      // #1983: 1.13c `D2Game.dll` `LEVEL_WarpUnit` (`0x6FCBE170`) calls `D2Common.#10816`
      // (`DUNGEON_FindActSpawnLocationEx`) with explicit `nTileIndex` (`0` entry or `11` town-portal mouth)
      // and player unit size `2` (`OperateFn 34` `298`, `OperateFn 43` `100`, `OperateFn 70` `563/569`).
      return area.findActSpawnLocation(arrival.tileIndex, PLAYER_UNIT_SIZE)
    }
    if (arrival.fallbackFromAreaId !== undefined) {
      for (const tile of this.warpTiles.values()) {
        if (tile.areaId === area.areaId && tile.destAreaId === arrival.fallbackFromAreaId) {
          anchor = tile
          break
        }
      }
      if (anchor === null) {
        for (const obj of this.objects.values()) {
          if (obj.areaId === area.areaId && obj.destAreaId === arrival.fallbackFromAreaId) {
            anchor = obj
            break
          }
        }
      }
    }
    if (anchor === null) {
      anchor = { x: area.spawnX, y: area.spawnY }
    }
  } else if (arrival.kind === 'warp') {
    for (const tile of this.warpTiles.values()) {
      if (tile.areaId === area.areaId && tile.destAreaId === arrival.fromAreaId) {
        anchor = tile
        break
      }
    }
  } else if (arrival.kind === 'townPortal' && arrival.x !== undefined && arrival.y !== undefined) {
    anchor = { x: arrival.x, y: arrival.y }
  } else if (area.findActSpawnLocation !== undefined) {
    // #1693: game join, act change and respawn call D2Common #10816 with nTileIndex 0 and the player's
    // unit size 2 (D2Game 0x6FC6B571 / 0x6FC6B6FE / 0x6FC8BC22 / 0x6FC8D362). Every call rolls the
    // level seed, and the result already passed COLLISION_GetFreeCoordinates (0x1C09): no re-snap.
    return area.findActSpawnLocation(ACT_SPAWN_TILE_ENTRY, PLAYER_UNIT_SIZE)
  } else {
    anchor = { x: area.spawnX, y: area.spawnY }
  }
  if (anchor === null) return null
  const isWalkable = (x: number, y: number): boolean => area.isWalkable(area.areaId, x, y)
  const near = findStandableNear(isWalkable, anchor.x, anchor.y)
  if (near !== null) return near
  // Town-portal tile not on standable floor (level variant/synthetic map): use the town entry.
  if (anchor.x !== area.spawnX || anchor.y !== area.spawnY) {
    return findStandableNear(isWalkable, area.spawnX, area.spawnY)
  }
  return null
}



function setTerrainWalkableCheck(this: GameInstanceHost, 
  fn: ((areaId: number, x: number, y: number, isFlying?: boolean) => boolean) | undefined,
): void {
  this.terrainWalkableCheck = fn
}



function setWalkabilityCallback(this: GameInstanceHost, 
  fn:
    | ((x: number, y: number, isFlying?: boolean) => boolean)
    | ((areaId: number, x: number, y: number, isFlying?: boolean) => boolean)
    | undefined,
): void {
  if (!fn) {
    this.terrainWalkableCheck = undefined
    return
  }
  if (fn.length <= 2) {
    const cb = fn as (x: number, y: number) => boolean
    this.terrainWalkableCheck = (_areaId: number, x: number, y: number) => cb(x, y)
  } else {
    this.terrainWalkableCheck = fn as (
      areaId: number,
      x: number,
      y: number,
      isFlying?: boolean,
    ) => boolean
  }
}



function movePlayer(this: GameInstanceHost, playerUnitId: number, x: number, y: number): void {
  const p = this.players.get(playerUnitId)
  if (!p) return
  p.x = x
  p.y = y
  p.targetX = x
  p.targetY = y
  const motion = this.playerMotion.get(playerUnitId)
  if (motion !== undefined) {
    motion.mover.setPosition(x, y)
    motion.x = x
    motion.y = y
    motion.moving = false
    motion.plannedX = Number.NaN
    motion.plannedY = Number.NaN
  }
}



function isMonsterStepWalkable(this: GameInstanceHost, 
  areaId: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  isFlying: boolean,
  ignoreObjectUnitId?: number,
): boolean {
  if (!Number.isFinite(fromX) || !Number.isFinite(fromY) || !Number.isFinite(toX) || !Number.isFinite(toY)) {
    return false
  }

  const check = this.terrainWalkableCheck
  const dist = Math.hypot(toX - fromX, toY - fromY)
  const steps = Math.max(4, Math.ceil(dist / 0.25))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const px = fromX + (toX - fromX) * t
    const py = fromY + (toY - fromY) * t
    const rx = Math.round(px)
    const ry = Math.round(py)
    const pArea = this.areaIdAtWorldPoint(Math.floor(px), Math.floor(py)) ?? areaId
    const rArea = this.areaIdAtWorldPoint(rx, ry) ?? areaId
    // Closed doors block every walker, including flying units.
    if (this.isClosedDoorAt(rArea, rx, ry, ignoreObjectUnitId)) return false
    if (!check) continue
    if (!check(pArea, px, py, isFlying) || !check(rArea, rx, ry, isFlying)) {
      return false
    }
  }
  return true
}



function isPaused(this: GameInstanceHost): boolean {
  return this.pausedState
}



function setPaused(this: GameInstanceHost, paused: boolean): void {
  const canPause = Boolean(
    this.policy.allowPause ?? this.policy.pauseOnSinglePlayerEscape,
  )
  if (canPause) {
    this.pausedState = Boolean(paused)
  }
}



function getPlayersX(this: GameInstanceHost): number {
  return this.playersX
}



function setPlayersX(this: GameInstanceHost, 
  value: number,
  options?: { readonly syncMonsterPlayerCount?: boolean | undefined },
): number {
  const clamped = Math.max(1, Math.min(8, Math.floor(Number(value) || 1)))
  this.manualPlayersX = clamped
  this.rescaleActiveMonsters(Boolean(options?.syncMonsterPlayerCount))
  this.onPlayersXChange?.(this.playersX)
  return this.playersX
}



/**
 * Allocates the next unit id of `unitType` (`SUNIT_GetNewUnitId`, `D2Game.dll` `0x6FCFF9C0`):
 * `id = ++pGame->dwLastUnitId[type]`, with `-1` (`0xFFFFFFFF`, the "no unit" id) skipped to 1.
 */
function allocateUnitId(this: GameInstanceHost, unitType: UnitType113c): number {
  if (!Number.isInteger(unitType) || unitType < 0 || unitType > 5) {
    throw new RangeError(`allocateUnitId: unit type ${String(unitType)} is outside 0..5`)
  }
  const id = this.nextUnitIdByType[unitType]!
  this.nextUnitIdByType[unitType] = id >= 0xfffffffe ? 1 : id + 1
  return id
}



function canPersistMapSeed(this: GameInstanceHost): boolean {
  return Boolean(
    this.policy.persistMapSeedAndFog ?? this.policy.persistMapSeedOnSave,
  )
}



function rescaleActiveMonsters(this: GameInstanceHost, syncMonsterPlayerCount = false): void {
  const px = this.playersX
  const multNum = px + 1
  const arDmgNum = 15 + px
  for (const m of this.monsters.values()) {
    if (m.isNpc || m.dead) continue
    if (syncMonsterPlayerCount && m.monsterPlayerCount < px) {
      m.monsterPlayerCount = px
    }
    if (m.noRatio) continue
    const ratio = m.maxHp > 0 ? m.hp / m.maxHp : 1
    m.maxHp = Math.max(1, Math.floor((m.baseMaxHp * multNum) / 2))
    m.hp = Math.max(1, Math.round(m.maxHp * ratio))
    if (!m.unscaledXp) {
      m.experience = Math.max(0, Math.floor((m.baseXp * multNum) / 2))
      m.minDmg = Math.max(1, Math.floor((m.baseMinDmg * arDmgNum) / 16))
      m.maxDmg = Math.max(m.minDmg, Math.floor((m.baseMaxDmg * arDmgNum) / 16))
      m.attack2MinDmg = Math.max(1, Math.floor((m.baseAttack2MinDmg * arDmgNum) / 16))
      m.attack2MaxDmg = Math.max(m.attack2MinDmg, Math.floor((m.baseAttack2MaxDmg * arDmgNum) / 16))
      m.special1MinDmg = Math.max(1, Math.floor((m.baseSpecial1MinDmg * arDmgNum) / 16))
      m.special1MaxDmg = Math.max(m.special1MinDmg, Math.floor((m.baseSpecial1MaxDmg * arDmgNum) / 16))
      m.ar = Math.max(1, Math.floor((m.baseAr * arDmgNum) / 16))
      m.attack2Ar = Math.max(1, Math.floor((m.baseAttack2Ar * arDmgNum) / 16))
      m.special1Ar = Math.max(1, Math.floor((m.baseSpecial1Ar * arDmgNum) / 16))
      if (m.baseElementalAttacks.length > 0) {
        m.elementalAttacks = m.baseElementalAttacks.map((ea) => {
          const minBase = ea.minDamage ?? ea.min ?? 0
          const maxBase = ea.maxDamage ?? ea.max ?? 0
          const scaledMin = minBase > 0 ? Math.max(1, Math.floor((minBase * arDmgNum) / 16)) : 0
          const scaledMax = maxBase > 0 ? Math.max(scaledMin, Math.floor((maxBase * arDmgNum) / 16)) : 0
          return {
            ...ea,
            min: scaledMin,
            max: scaledMax,
            minDamage: scaledMin,
            maxDamage: scaledMax,
          }
        })
      }
    }
    const combat = this.monsterCombat.get(m.unitId)
    if (combat) {
      combat.statList.setBaseStat('maxhp', m.maxHp * FIXED_ONE)
      combat.statList.setHp256(m.hp * FIXED_ONE)
      combat.statList.setBaseStat('tohit', m.ar)
    }
  }
}



function connectPlayer(this: GameInstanceHost, spec: ConnectPlayerSpec = {}): number {
  if (this.players.size >= this.policy.maxPlayers) {
    throw new Error(
      `GameInstance: room is full (${this.players.size}/${this.policy.maxPlayers} players)`,
    )
  }

  const d2sRaw = spec.d2s ?? spec.d2sBytes
  let parsedD2s: D2sDecodedCharacterSave | undefined
  if (d2sRaw instanceof Uint8Array) {
    parsedD2s = readD2sSave113c(d2sRaw)
    if (
      this.canPersistMapSeed() &&
      parsedD2s.mapSeed !== 0 &&
      !this.hasExplicitMapSeed
    ) {
      this.currentMapSeed = parsedD2s.mapSeed >>> 0
      this.rng = new D2Rng(this.currentMapSeed)
    }
  }

  const charName = (
    spec.charName ??
    spec.name ??
    parsedD2s?.name ??
    `Hero${this.nextUnitIdByType[UNIT_TYPE_113C.player]}`
  ).trim()
  for (const existing of this.players.values()) {
    if (existing.name.toLowerCase() === charName.toLowerCase()) {
      throw new Error(`GameInstance: character "${charName}" is already in the game`)
    }
  }

  const baseStatusFlags =
    spec.statusFlags !== undefined ? spec.statusFlags & 0xff : (parsedD2s?.statusFlags ?? 0x20)
  const isHardcoreChar =
    Boolean(spec.hardcore ?? spec.isHardcore ?? parsedD2s?.isHardcore) ||
    (baseStatusFlags & 0x04) !== 0
  const initialStatusFlags = ((baseStatusFlags | (isHardcoreChar ? 0x04 : 0)) & 0xff)
  if (isHardcoreChar && (parsedD2s?.isDead === true || (initialStatusFlags & 0x08) !== 0)) {
    throw new Error(
      `GameInstance.connectPlayer: hardcore character "${charName}" is permanently dead (0x08)`,
    )
  }

  const classId =
    parsedD2s !== undefined
      ? normalizeClassId(parsedD2s.classId)
      : normalizeClassId(spec.classId ?? spec.charClass)
  const classCode = CLASS_ID_TO_CODE[classId] ?? 'ama'
  const baseStats = CANONICAL_CHARSTATS[classCode]
  const unitId = this.allocateUnitId(UNIT_TYPE_113C.player)

  const level = Math.max(1, parsedD2s?.level ?? spec.level ?? 1)
  const areaId =
    spec.areaId ??
    this.defaultAreaId ??
    ACT_TOWN_AREA[parsedD2s?.activeAct ?? this.defaultAct ?? 0] ??
    1
  const act = areaToAct(areaId)
  // With an area bootstrap resolver the entry area comes online first and the player is grounded on
  // its start floor (`resolveArrivalPosition` → town entry); without one, the legacy test grid spawn.
  const entryArea = this.loadArea(areaId)
  let entrySpawn: { readonly x: number; readonly y: number } | null = null
  if (entryArea && (spec.x === undefined || spec.y === undefined)) {
    entrySpawn = this.resolveArrivalPosition(entryArea, { kind: 'townPortal' })
    if (entrySpawn === null) {
      throw new Error(`GameInstance.connectPlayer: area ${areaId} has no standable entry floor`)
    }
  }
  const spawnX = spec.x ?? entrySpawn?.x ?? LEGACY_TEST_GRID_SPAWN + (this.players.size % 4) * 2
  const spawnY = spec.y ?? entrySpawn?.y ?? LEGACY_TEST_GRID_SPAWN + Math.floor(this.players.size / 4) * 2

  const attrs = parsedD2s?.attributes
  const strength = spec.strength ?? attrs?.strength ?? baseStats.baseAttributes.strength
  const dexterity = spec.dexterity ?? attrs?.dexterity ?? baseStats.baseAttributes.dexterity
  const vitality = spec.vitality ?? attrs?.vitality ?? baseStats.baseAttributes.vitality
  const energy = spec.energy ?? attrs?.energy ?? baseStats.baseAttributes.energy
  const statPts =
    spec.statPts ??
    attrs?.statPts ??
    (parsedD2s === undefined ? Math.max(0, (level - 1) * 5) : 0)
  const newSkills =
    spec.newSkills ??
    attrs?.newSkills ??
    (parsedD2s === undefined ? Math.max(0, level - 1) : 0)

  const lvlGain = Math.max(0, level - 1)
  const vitAdded = Math.max(0, vitality - baseStats.baseAttributes.vitality)
  const eneAdded = Math.max(0, energy - baseStats.baseAttributes.energy)
  const defaultMaxHpFixed =
    baseStats.baseVitals.life * FIXED_ONE +
    Math.round(
      (lvlGain * baseStats.perLevel.life + vitAdded * baseStats.perStatPoint.lifePerVitality) *
        FIXED_ONE,
    )
  const defaultMaxManaFixed =
    baseStats.baseVitals.mana * FIXED_ONE +
    Math.round(
      (lvlGain * baseStats.perLevel.mana + eneAdded * baseStats.perStatPoint.manaPerEnergy) *
        FIXED_ONE,
    )
  const defaultMaxStaminaFixed =
    baseStats.baseVitals.stamina * FIXED_ONE +
    Math.round(
      (lvlGain * baseStats.perLevel.stamina +
        vitAdded * baseStats.perStatPoint.staminaPerVitality) *
        FIXED_ONE,
    )

  const maxHpFixed =
    spec.maxHp !== undefined && spec.maxHp > 0
      ? spec.maxHp * FIXED_ONE
      : attrs && attrs.maxHpFixed > 0
        ? attrs.maxHpFixed
        : defaultMaxHpFixed
  const hpFixed =
    spec.hp !== undefined && spec.hp > 0
      ? Math.min(maxHpFixed, spec.hp * FIXED_ONE)
      : attrs && attrs.hitpointsFixed > 0
        ? attrs.hitpointsFixed
        : maxHpFixed
  const maxManaFixed =
    spec.maxMana !== undefined && spec.maxMana >= 0
      ? spec.maxMana * FIXED_ONE
      : attrs && attrs.maxManaFixed > 0
        ? attrs.maxManaFixed
        : defaultMaxManaFixed
  const manaFixed =
    spec.mana !== undefined && spec.mana >= 0
      ? Math.min(maxManaFixed, spec.mana * FIXED_ONE)
      : attrs !== undefined
        ? attrs.manaFixed
        : maxManaFixed
  const maxStaminaFixed =
    spec.maxStamina !== undefined && spec.maxStamina > 0
      ? spec.maxStamina * FIXED_ONE
      : attrs && attrs.maxStaminaFixed > 0
        ? attrs.maxStaminaFixed
        : defaultMaxStaminaFixed
  const staminaFixed =
    spec.stamina !== undefined && spec.stamina >= 0
      ? Math.min(maxStaminaFixed, spec.stamina * FIXED_ONE)
      : attrs && attrs.staminaFixed > 0
        ? attrs.staminaFixed
        : maxStaminaFixed

  const maxHp = Math.max(1, Math.floor(maxHpFixed / FIXED_ONE))
  const hp = Math.max(1, Math.min(maxHp, Math.floor(hpFixed / FIXED_ONE)))
  const maxMana = Math.max(0, Math.floor(maxManaFixed / FIXED_ONE))
  const mana = Math.max(0, Math.min(maxMana, Math.floor(manaFixed / FIXED_ONE)))
  const maxStamina = Math.max(1, Math.floor(maxStaminaFixed / FIXED_ONE))
  const stamina = Math.max(
    1,
    Math.min(maxStamina, Math.floor(staminaFixed / FIXED_ONE)),
  )

  const experience =
    spec.experience !== undefined
      ? Math.max(0, Math.trunc(spec.experience))
      : (attrs?.experience ?? experienceForLevel113c(level))
  const gold = spec.gold !== undefined ? Math.max(0, Math.trunc(spec.gold)) : (attrs?.gold ?? 0)
  const goldBank =
    spec.goldBank !== undefined ? Math.max(0, Math.trunc(spec.goldBank)) : (attrs?.goldBank ?? 0)

  const skills = new Map<number, number>()
  const skillOffset = CLASS_SKILL_OFFSET[classId] ?? 6
  if (parsedD2s?.skills) {
    for (let i = 0; i < parsedD2s.skills.length; i++) {
      const slvl = parsedD2s.skills[i] ?? 0
      if (slvl > 0) {
        skills.set(skillOffset + i, slvl)
      }
    }
  }
  if (spec.skills !== undefined) {
    for (const [rawId, rawLvl] of Object.entries(spec.skills)) {
      const id = Number(rawId)
      if (!Number.isInteger(id) || this.registry.getSkillById(id) === undefined) {
        throw new Error(`GameInstance.connectPlayer: unknown Skills.txt row ${rawId} in spec.skills`)
      }
      if (rawLvl > 0) skills.set(id, Math.trunc(rawLvl))
      else skills.delete(id)
    }
  }

  const items: ServerItemEntry[] = []
  if (parsedD2s) {
    for (const itemData of parsedD2s.items) {
      items.push(this.itemDataToServerEntry(itemData, unitId, areaId, true))
    }
  } else {
    const potInfo = lookupBaseInfo('hpot')
    for (let i = 0; i < 4; i++) {
      items.push({
        unitId: this.allocateUnitId(UNIT_TYPE_113C.item),
        code: 'hpot',
        name: potInfo.name,
        quality: 2,
        level: 1,
        location: 'belt',
        x: i,
        y: 0,
        width: 1,
        height: 1,
        areaId,
        ownerId: unitId,
        bodyLoc: 0,
        storePage: 0,
        cost: potInfo.cost,
        gamble: false,
        identified: true,
        ethereal: false,
        socketed: false,
        totalSockets: 0,
        durability: 0,
        maxDurability: 0,
        quantity: 1,
        stats: new Map(),
        socketedItems: [],
      })
    }
  }

  const corpseItems: ServerItemEntry[] = []
  if (parsedD2s?.corpseItems) {
    for (const ci of parsedD2s.corpseItems) {
      corpseItems.push(this.itemDataToServerEntry(ci, unitId, areaId, true))
    }
  }
  const ironGolemItem = parsedD2s?.ironGolem
    ? this.itemDataToServerEntry(parsedD2s.ironGolem, unitId, areaId, true)
    : null

  const waypoints = new Set<number>([1])
  let hasExplicitWaypoints = false
  const wpBytes = parsedD2s?.waypoints?.[this.difficulty]
  if (wpBytes instanceof Uint8Array && wpBytes.byteLength >= 7) {
    hasExplicitWaypoints = true
    for (let bitIndex = 0; bitIndex < WAYPOINT_AREA_IDS.length; bitIndex++) {
      const byteIdx = 2 + (bitIndex >> 3)
      const bitMask = 1 << (bitIndex & 7)
      if (((wpBytes[byteIdx] ?? 0) & bitMask) !== 0) {
        waypoints.add(WAYPOINT_AREA_IDS[bitIndex]!)
      }
    }
  }

  const unlockedAct = [...waypoints].reduce(
    (maxAct, wpArea) => Math.max(maxAct, areaToAct(wpArea)),
    areaToAct(areaId),
  )
  const savedQuestWords = spec.questFlags ?? parsedD2s?.quests?.[this.difficulty]
  const questFlags = savedQuestWords
    ? new Uint16Array(savedQuestWords)
    : new Uint16Array(48)
  // 1.13c `PlrSave2.cpp` / `QUESTS_PlayerJoined` (`#1960`): joining a new game clears `QFLAG_COMPLETEDNOW (0x2000)`
  // on `a1q6` (word 6); if Andariel was killed in a prior game without talking to Warriv (`0x0001` unset),
  // `QFLAG_COMPLETEDBEFORE (0x8000)` is armed so later kills use normal `Andariel` instead of `Andarielq`.
  if (savedQuestWords) {
    const a1q6Idx = questWordIndex113c('a1q6')
    if (a1q6Idx !== undefined) {
      const a1q6Bits = questFlags[a1q6Idx] ?? 0
      if ((a1q6Bits & QUEST_FLAG_COMPLETED_NOW_113C) !== 0) {
        let nextA1q6 = a1q6Bits & ~QUEST_FLAG_COMPLETED_NOW_113C
        if ((a1q6Bits & QUEST_FLAG_COMPLETED_113C) === 0) {
          nextA1q6 |= QUEST_FLAG_LEAVE_BEFORE_113C
        }
        questFlags[a1q6Idx] = nextA1q6
      }
    }
  }

  const record: InternalPlayerRecord = {
    unitId,
    name: charName,
    classId,
    classCode,
    level,
    act,
    areaId,
    x: spawnX,
    y: spawnY,
    targetX: spawnX,
    targetY: spawnY,
    run: true,
    mode: TOWN_AREAS.has(areaId) ? 5 : 1,
    hp,
    maxHp,
    hpFixed,
    maxHpFixed,
    mana,
    maxMana,
    manaFixed,
    maxManaFixed,
    stamina,
    maxStamina,
    staminaFixed,
    maxStaminaFixed,
    staminaExhausted: false,
    experience,
    gold,
    goldBank,
    strength,
    dexterity,
    vitality,
    energy,
    ar: spec.ar,
    tohit: spec.tohit,
    statPts,
    newSkills,
    leftSkill: spec.leftSkill ?? parsedD2s?.leftSkill ?? 0,
    rightSkill: spec.rightSkill ?? parsedD2s?.rightSkill ?? 0,
    hotkeys: Array.from({ length: 16 }, (_, idx) => (parsedD2s?.hotkeys?.[idx] ?? 0xffff) & 0xffff),
    hotkeyItemIds: new Array<number>(16).fill(0xffffffff),
    altLeftSkill: parsedD2s?.altLeftSkill ?? 0,
    altRightSkill: parsedD2s?.altRightSkill ?? 0,
    weaponSet: parsedD2s?.activeWeapon === 1 ? 1 : 0,
    npcIntro:
      parsedD2s?.npcIntro && parsedD2s.npcIntro.byteLength === 52
        ? new Uint8Array(parsedD2s.npcIntro)
        : createDefaultNpcIntroData(),
    createdTimestampSec:
      parsedD2s?.createdTimestamp || parsedD2s?.timestampSec || 1_700_000_000,
    lastPlayedTimestampSec:
      parsedD2s?.lastPlayedTimestamp ||
      parsedD2s?.timestampSec ||
      parsedD2s?.createdTimestamp ||
      1_700_000_000,
    connectedFrame: this.currentFrame,
    skills,
    states: new Set(),
    stateTimers: new Map(),
    items,
    corpseItems,
    ironGolemItem,
    waypoints,
    hasExplicitWaypoints,
    activeWaypointUnitId: 0,
    unlockedAct,
    lastWarpInteractFrame: -1000,
    revealedRoomKeys: new Set(),
    questFlags,
    vendorPools: new Map(),
    vendorPoolModes: new Map(),
    vendorPoolsByMode: new Map(),
    activeVendorMode: null,
    dead: false,
    isHardcore: isHardcoreChar,
    hasDied: false,
    statusFlags: initialStatusFlags,
    // Player corpses are UNIT_PLAYER units in 1.13c (S2C `UnitAssign` unitType 0).
    corpseId: corpseItems.length > 0 ? this.allocateUnitId(UNIT_TYPE_113C.player) : undefined,
    corpseAreaId: corpseItems.length > 0 ? areaId : undefined,
    corpseX: spawnX,
    corpseY: spawnY,
    corpseRequiresClick: corpseItems.length > 0,
    extraCorpses: undefined,
    lastDeathExpLoss: 0,
    lastDeathGoldLoss: 0,
    activeNpcId: undefined,
    hitRecoveryUntilFrame: 0,
    hostilePortalLockUntilFrame: 0,
    partyId: 0xffff,
    d2sTemplate: parsedD2s,
  }

  if (areaId === 1) {
    this.syncRogueEncampmentA1Q3State113c(record)
  }
  this.syncTowerCellarA1Q4State113c(25, record)
  if (areaId === 73) {
    this.syncDurielsLairA2Q6State113c(73, undefined, undefined, record)
  }
  if (areaId === 109) {
    this.syncHarrogathA5Q3State113c(record)
  }
  this.players.set(unitId, record)
  this.activatePresetRoomsNearPlayer113c(record)
  this.refreshPlayerAccruedMaxPools(record, {
    fillHpIfAtBaseMax:
      spec.hp === undefined &&
      (attrs === undefined || attrs.hitpointsFixed >= maxHpFixed),
    fillManaIfAtBaseMax:
      spec.mana === undefined &&
      (attrs === undefined || attrs.manaFixed >= maxManaFixed),
    fillStaminaIfAtBaseMax:
      spec.stamina === undefined &&
      (attrs === undefined || attrs.staminaFixed >= maxStaminaFixed),
  })
  this.partyManager.addPlayer(unitId, charName, classId, level, areaId)
  this.outbox.set(unitId, [])
  this.rescaleActiveMonsters()

  const isExpansionChar =
    parsedD2s !== undefined ? parsedD2s.isExpansion : (initialStatusFlags & 0x20) !== 0
  this.emitToPlayer(unitId, {
    type: 'GameFlags',
    difficulty: this.difficulty,
    hardcore: isHardcoreChar,
    expansion: isExpansionChar,
    ladder: this.isLadderRulesEnabled(),
    ...(isHardcoreChar ? { arenaFlags: 0x0800 } : {}),
  })
  this.emitToPlayer(unitId, {
    type: 'GameLogonAck',
    playerUnitId: unitId,
    mapSeed: this.currentMapSeed,
    difficulty: this.difficulty,
    act,
    areaId,
  })
  this.emitQuestLog(record)
  this.emitQuestAvailability(record)
  this.emitToPlayer(unitId, {
    type: 'LoadAct',
    act,
    mapSeed: this.currentMapSeed,
    areaId,
  })
  this.revealAreaRoomsNearPlayer(record)
  this.emitToPlayer(unitId, {
    type: 'PlayerAssign',
    unitId,
    classId,
    charClass: classId,
    charName,
    name: charName,
    x: spawnX,
    y: spawnY,
    areaId,
  })
  this.emitToPlayer(unitId, {
    type: 'UnitAssign',
    isSelf: true,
    unitType: 'player',
    unitId,
    classId,
    name: charName,
    x: spawnX,
    y: spawnY,
    areaId,
    unit: {
      unitType: 0,
      id: unitId,
      classId,
      name: charName,
      x: spawnX,
      y: spawnY,
      mode: record.mode,
    },
  })
  this.emitInitialPlayerStats(record)
  this.emitSavedPlayerHotkeys(record)

  for (const other of this.players.values()) {
    if (other.unitId === unitId) continue
    this.emitToPlayer(other.unitId, {
      type: 'Party',
      kind: 'roster',
      action: 'join',
      playerId: unitId,
      charClass: classId,
      charName,
      charLevel: level,
      partyId: 0xffff,
      areaId,
    })
    this.emitToPlayer(unitId, {
      type: 'Party',
      kind: 'roster',
      action: 'join',
      playerId: other.unitId,
      charClass: other.classId,
      charName: other.name,
      charLevel: other.level,
      partyId: other.partyId,
      areaId: other.areaId,
    })
    if (this.isPointInViewerAoi113c(other, areaId, spawnX, spawnY)) {
      this.emitToPlayer(other.unitId, {
        type: 'UnitAssign',
        unitType: 'player',
        unitId,
        classId,
        name: charName,
        x: spawnX,
        y: spawnY,
        areaId,
        unit: {
          unitType: 0,
          id: unitId,
          classId,
          name: charName,
          x: spawnX,
          y: spawnY,
          mode: record.mode,
        },
      })
    }
  }

  this.emitAreaSnapshotToPlayer(record)
  if (this.hasLivePrimaryCorpse113c(record)) {
    const corpseEvents = this.buildPlayerCorpseEvents113c(record)
    for (const other of this.players.values()) {
      if (
        other.unitId === unitId ||
        !this.isPointInViewerAoi113c(other, areaId, record.corpseX, record.corpseY)
      ) {
        continue
      }
      for (const ev of corpseEvents) {
        this.emitToPlayer(other.unitId, ev)
      }
    }
  }
  if (spec.restoreMercenary && parsedD2s?.merc && parsedD2s.merc.seed !== 0 && parsedD2s.merc.typeId > 0) {
    const hireRec =
      HIRELING_RECORDS.find(
        (entry) => entry.version === 100 && entry.subTypeId === parsedD2s.merc.typeId,
      ) ??
      HIRELING_RECORDS.find(
        (entry) => entry.version === 100 && entry.id === parsedD2s.merc.typeId,
      )
    if (hireRec) {
      // 1.13c `0x6FD0DA40` (`0x6FD0DA99..0x6FD0DACF`): derive hireling level from saved `.d2s`
      // mercenary experience and `Hireling.txt` `Exp/Lvl`, capped by owner level and 98.
      const mercExp = Math.max(0, Math.floor(parsedD2s.merc.experience ?? 0))
      const mercLevel =
        mercExp > 0
          ? Math.min(record.level, hirelingLevelFromExp(mercExp, hireRec.expPerLvl))
          : Math.min(MAX_MERCENARY_LEVEL_113C, record.level)
      const mercId = this.hireMercenary(unitId, {
        act: (hireRec.act === 1 || hireRec.act === 2 || hireRec.act === 3 || hireRec.act === 5
          ? hireRec.act
          : 2) as 1 | 2 | 3 | 5,
        subType: hireRec.subTypeId,
        level: mercLevel,
        experience: mercExp,
        difficulty: ((hireRec.difficulty ?? (this.difficulty + 1)) === 3
          ? 3
          : (hireRec.difficulty ?? (this.difficulty + 1)) === 2
            ? 2
            : 1) as 1 | 2 | 3,
        dead: parsedD2s.merc.dead,
      })
      const mercRecord = mercId !== null ? this.mercenaries.get(mercId) : undefined
      const savedMercItems = parsedD2s.mercItems ?? parsedD2s.merc.items
      if (mercRecord && Array.isArray(savedMercItems) && savedMercItems.length > 0) {
        for (const mi of savedMercItems) {
          const entry = this.itemDataToServerEntry(mi, mercRecord.unitId, areaId, true)
          entry.location = 'equipped'
          if (entry.bodyLoc <= 0) {
            entry.bodyLoc = this.resolveMercDefaultBodyLoc113c(entry.code, mercRecord.act) ?? 4
          }
          if (entry.rawItemData !== undefined) {
            entry.rawItemData = {
              ...entry.rawItemData,
              ownerType: 1,
              ownerId: mercRecord.unitId as UnitId,
              location: 1,
              bodyLoc: entry.bodyLoc,
              equippedSlot: entry.bodyLoc,
            }
          }
          mercRecord.equipment.push(entry)
          if (mercRecord.alive) {
            this.emitToPlayer(record.unitId, {
              type: 'ItemEvent',
              action: 0x06,
              itemId: entry.unitId,
              code: entry.code,
              x: entry.x,
              y: entry.y,
              container: 'equipment',
              item: {
                ...this.serverEntryToItemData(entry),
                opcode: 0x9d,
                action: 0x06,
                ownerType: 1,
                ownerId: mercRecord.unitId as UnitId,
              },
            })
            this.emitSocketChildrenToPlayer(record.unitId, entry, 0x13)
          }
        }
        if (mercRecord.alive) {
          this.syncMercenaryOwnerAura(record, mercRecord.activeAura, mercRecord, true)
        }
      }
    }
  }
  this.syncPlayerItemAuras113c(record, true)
  this.syncPlayerSelectedRightAura113c(record)
  // 1.13c `D2Game.dll` `0x6FD0DF50`: auto-summon saved `.d2s` `kf` Iron Golem (`#90`) upon game entry (#1787).
  if (record.ironGolemItem !== null) {
    const igSkill = this.registry.getSkillById(90)
    const igSlvl = Math.max(
      1,
      (igSkill ? this.resolvePlayerSkillLevel(record, igSkill) : 0) ||
        (record.skills.get(90) ?? 0) ||
        1,
    )
    const igOutcome = this.summonPet(unitId, {
      skillId: 90,
      slvl: igSlvl,
      x: spawnX + 2,
      y: spawnY + 2,
      restoreSavedIronGolem: true,
    })
    if (!igOutcome.created) {
      record.ironGolemItem = null
    }
  }
  return unitId
}



function addPlayer(this: GameInstanceHost, spec: ConnectPlayerSpec = {}): number {
  return this.connectPlayer(spec)
}



function disconnectPlayer(this: GameInstanceHost, playerUnitId: number): Uint8Array | null {
  const existing = this.players.get(playerUnitId)
  if (!existing) return null
  this.abortPlayerTrade(playerUnitId)
  const savedD2s = this.exportPlayerD2s(playerUnitId)
  const prevArea = existing.areaId
  const partyEvents = this.partyManager.removePlayer(playerUnitId)
  this.players.delete(playerUnitId)
  this.clearVendorPools(existing, prevArea)
  this.playerSkillDelayUntilFrame.delete(playerUnitId)
  this.playerAnimDispatchers.delete(playerUnitId)
  this.pendingPlayerAnimActions.delete(playerUnitId)
  this.playerActiveAuraState.delete(playerUnitId)
  this.playerCombat.delete(playerUnitId)
  this.playerBoneArmorPool.delete(playerUnitId)
  this.playerCycloneArmorPool.delete(playerUnitId)
  this.unitJustHitUntilFrame.delete(`player:${playerUnitId}`)
  this.playerAuraScanners.delete(playerUnitId)
  this.playerItemAuraScanners.delete(playerUnitId)
  for (const [mercId, merc] of this.mercenaries.entries()) {
    if (merc.ownerPlayerId === playerUnitId) {
      this.stopMercenaryAura(merc)
      this.mercCombat.delete(mercId)
    }
  }
  this.playerMotion.delete(playerUnitId)
  this.outbox.delete(playerUnitId)
  this.rescaleActiveMonsters()

  for (const other of this.players.values()) {
    this.emitToPlayer(other.unitId, {
      type: 'UnitRemove',
      unitType: 0,
      id: playerUnitId,
      unitId: playerUnitId,
    })
    for (const ev of partyEvents) {
      if (ev.type === 'Party' && ev.kind === 'roster' && ev.action === 'update') {
        this.emitToPlayer(other.unitId, ev)
      }
    }
    this.emitToPlayer(other.unitId, {
      type: 'Party',
      kind: 'roster',
      action: 'leave',
      playerId: playerUnitId,
    })
  }
  return savedD2s
}



function removePlayer(this: GameInstanceHost, playerUnitId: number): Uint8Array | null {
  return this.disconnectPlayer(playerUnitId)
}



/** Whether an item unit id (unit type 4; ids are per type in 1.13c) is held by any live item. */
function isItemUnitIdInUse(this: GameInstanceHost, id: number): boolean {
  if (this.groundItems.has(id)) return true
  for (const p of this.players.values()) {
    for (const it of p.items) {
      if (it.unitId === id || it.socketedItems.some((c) => c.unitId === id)) return true
    }
    for (const it of p.corpseItems) {
      if (it.unitId === id || it.socketedItems.some((c) => c.unitId === id)) return true
    }
    if (
      p.ironGolemItem &&
      (p.ironGolemItem.unitId === id ||
        p.ironGolemItem.socketedItems.some((c) => c.unitId === id))
    ) {
      return true
    }
  }
  for (const m of this.mercenaries.values()) {
    for (const it of m.equipment) {
      if (it.unitId === id || it.socketedItems.some((c) => c.unitId === id)) return true
    }
  }
  return false
}

export interface AreaAndSessionMethods {
  setAnimActionWindup(enabled: boolean): void
  isAnimActionWindupEnabled(): boolean
  getPlayerAnimDispatcher(playerUnitId: number): AnimDispatcher | undefined
  getCairnStoneOrder(): readonly number[]
  isAreaLoaded(areaId: number): boolean
  ensureAreaLoaded(areaId: number): boolean
  loadArea(areaId: number): LoadedAreaRecord | null
  ensureAdjacentAreasLoaded(areaId: number): void
  warpTileAssignEvent(tile: InternalWarpTileRecord): ServerEvent
  getRoomSubtileBounds113c(area: LoadedAreaRecord | undefined, tileX: number, tileY: number): {
  readonly subX: number
  readonly subY: number
  readonly subW: number
  readonly subH: number
  readonly tileW: number
  readonly tileH: number
  readonly rect:
    | {
        readonly x: number
        readonly y: number
        readonly w: number
        readonly h: number
        readonly seed?: number
      }
    | undefined
}
  revealAreaRoomsNearPlayer(player: InternalPlayerRecord, emitRoomUnits?: boolean | undefined): void
  emitRoomUnitsToPlayer(player: InternalPlayerRecord, areaId: number, subX: number, subY: number, subW: number, subH: number): void
  emitRoomUnitsRemovedToPlayer(player: InternalPlayerRecord, areaId: number, subX: number, subY: number, subW: number, subH: number): void
  hidePlayerAreaRooms(player: InternalPlayerRecord, areaId: number): void
  isPointInViewerAoi113c(viewer: InternalPlayerRecord, targetAreaId: number, x: number, y: number): boolean
  syncUnitMoveAcrossViewerAoi113c(unitType: 'player' | 'monster', unitId: number, prevAreaId: number, prevX: number, prevY: number, nextAreaId: number, nextX: number, nextY: number, excludeViewerUnitId?: number): void
  resolveArrivalPosition(area: LoadedAreaRecord, arrival: AreaArrival): { readonly x: number; readonly y: number } | null
  setTerrainWalkableCheck(fn: ((areaId: number, x: number, y: number, isFlying?: boolean) => boolean) | undefined): void
  setWalkabilityCallback(fn: | ((x: number, y: number, isFlying?: boolean) => boolean)
    | ((areaId: number, x: number, y: number, isFlying?: boolean) => boolean)
    | undefined): void
  movePlayer(playerUnitId: number, x: number, y: number): void
  isMonsterStepWalkable(areaId: number, fromX: number, fromY: number, toX: number, toY: number, isFlying: boolean, ignoreObjectUnitId?: number): boolean
  isPaused(): boolean
  setPaused(paused: boolean): void
  getPlayersX(): number
  setPlayersX(value: number, options?: { readonly syncMonsterPlayerCount?: boolean | undefined }): number
  allocateUnitId(unitType: UnitType113c): number
  spawnAreaPresetMonster113c(areaId: number, mon: LocalAreaPresetMonster): void
  canPersistMapSeed(): boolean
  rescaleActiveMonsters(syncMonsterPlayerCount?: boolean | undefined): void
  connectPlayer(spec?: ConnectPlayerSpec | undefined): number
  addPlayer(spec?: ConnectPlayerSpec | undefined): number
  disconnectPlayer(playerUnitId: number): Uint8Array | null
  removePlayer(playerUnitId: number): Uint8Array | null
  isItemUnitIdInUse(id: number): boolean
}

export const areaAndSessionMethods: Record<keyof AreaAndSessionMethods, unknown> = {
  setAnimActionWindup,
  isAnimActionWindupEnabled,
  getPlayerAnimDispatcher,
  getCairnStoneOrder,
  isAreaLoaded,
  ensureAreaLoaded,
  loadArea,
  ensureAdjacentAreasLoaded,
  warpTileAssignEvent,
  getRoomSubtileBounds113c,
  revealAreaRoomsNearPlayer,
  emitRoomUnitsToPlayer,
  emitRoomUnitsRemovedToPlayer,
  hidePlayerAreaRooms,
  isPointInViewerAoi113c,
  syncUnitMoveAcrossViewerAoi113c,
  resolveArrivalPosition,
  setTerrainWalkableCheck,
  setWalkabilityCallback,
  movePlayer,
  isMonsterStepWalkable,
  isPaused,
  setPaused,
  getPlayersX,
  setPlayersX,
  allocateUnitId,
  spawnAreaPresetMonster113c,
  canPersistMapSeed,
  rescaleActiveMonsters,
  connectPlayer,
  addPlayer,
  disconnectPlayer,
  removePlayer,
  isItemUnitIdInUse,
}
