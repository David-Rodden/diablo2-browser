/**
 * Server-side area bootstrap resolver (issue #1325).
 *
 * The local game server (`GameInstance`) brings areas online on demand — at game entry and on every
 * waypoint / town portal / warp transition — from the DRLG build of the level. The level geometry is
 * produced by whichever DRLG host the process has (the browser's `MapService`, a test fixture, ...) and
 * handed in through `AreaLevelSource`; everything 1.13c-semantic about turning that geometry into game
 * units lives here, inside `src/server`:
 *
 * - preset objects (`UNIT_OBJECT = 2`): Objects.txt row as class; waypoints are the 16 OperateFn 23 rows
 *   (`WAYPOINT_CLASS_IDS_113C`) and start activated (mode 1) in towns; the DRLG `index < 0` "no object"
 *   presets and object 573 are not spawned;
 * - preset monsters (`UNIT_MONSTER = 1`): MonStats.txt hcIdx; town NPCs / vendors come from the canonical
 *   town NPC table (`getTownNpcDescriptorByHcIdx`, NPC.txt vendor ids); an index past the MonStats.txt
 *   rows is a SuperUniques.txt row (`index - monStatsCount`, D2Common MonPreset), never spawned in towns;
 * - warps (`UNIT_TILE = 5`): the level's LvlWarp.txt tiles with their destination level;
 * - spawn: the level's DRLG start cell (Act I town: bonfire, else Warriv), snapped onto standable floor.
 */

import type {
  LocalAreaBootstrap,
  LocalAreaBootstrapResolver,
  LocalAreaLevelGeometry,
  LocalAreaLevelPresetUnit,
  LocalAreaLevelRequest,
  LocalAreaLevelSource,
  LocalAreaLevelWarp,
  LocalAreaPresetMonster,
  LocalAreaPresetObject,
  LocalAreaWarp,
} from '../../netproto/index.ts'
import {
  MONSTATS_113C_ROWS,
  getCanonicalMonsterKinds,
  getSuperUniqueByIndex,
} from '../../common/units/monsters-data.ts'
import { getTownNpcDescriptorByHcIdx } from '../../common/units/npc-table.ts'
import { WAYPOINT_CLASS_IDS_113C } from '../../common/world/objects-meta.ts'
import { OBJECTS_TXT_113C } from '../../common/world/objects-txt-113c.ts'

/** Levels.txt ids of the five towns (Rogue Encampment, Lut Gholein, Kurast Docks, Pandemonium Fortress, Harrogath). */
export const TOWN_AREA_IDS_113C: ReadonlySet<number> = new Set([1, 40, 75, 103, 109])

/** Sub-tiles per DRLG tile. */
const SUB_TILES_PER_TILE = 5
/** Objects.txt 39 `fire` — the Rogue Encampment bonfire, the Act I town start. */
const OBJECT_ROGUE_BONFIRE = 39
/** Objects.txt 573 — never spawned from DRLG presets (`D2Game.dll` `0x6fd012f1`). */
const OBJECT_SKIPPED_PRESET = 573
/**
 * 1.13c D2Game preset chest pools (`0x6fc522b0`, `0x6fd2e1bc` dispatch for preset IDs `574..582`):
 * - Act 1/4/5 (`act === 0, 3, 4`): 13 chest classes (`0x6fd1ccd8`)
 * - Act 2 Arcane Sanctuary (`areaId === 74`): 4 chest classes (`0x6fd1cc9c`)
 * - Act 2 other (`areaId in 40..73`): 2 chest classes (`[87, 88]`)
 * - Act 3 Travincal (`areaId === 83`): 4 chest classes (`0x6fd1ccac`)
 * - Act 3 other (`areaId in 75..102`): 2 chest classes (`[181, 183]`)
 */
const PRESET_CHEST_POOL_ACT1_4_5: readonly number[] = [
  5, 6, 139, 140, 141, 144, 176, 177, 198, 240, 241, 242, 243,
]
const PRESET_CHEST_POOL_ARCANE: readonly number[] = [387, 389, 390, 391]
const PRESET_CHEST_POOL_ACT2: readonly number[] = [87, 88]
const PRESET_CHEST_POOL_TRAVINCAL: readonly number[] = [329, 330, 331, 332]
const PRESET_CHEST_POOL_ACT3: readonly number[] = [181, 183]

/**
 * Resolve a DRLG preset object index (`u.index`) to a real `Objects.txt` row (`0..572`)
 * per `D2Game.dll` `0x6fd012d0` -> `0x6fc4e830` (`0x6fd2e1bc` pseudo-object table):
 * - `< 0` or `573` or `> 582`: not spawned (`null`)
 * - `0..572`: direct `Objects.txt` row
 * - `574..579` (`0x6fc525c0`): `classId = 136`
 * - `580` (`0x6fc531b0` Super Chest): `371` in area 25, else Act/Level chest pool + `isSparkling`
 * - `581` (`0x6fc522b0` Preset Chest): Act/Level chest pool
 * - `582` (`0x6fc52110` Tomb Orifice placeholder): `classId = 307`
 */
export function resolvePresetObject113c(
  presetIndex: number,
  areaId: number,
  subXOrRng?: number | ((max: number) => number) | undefined,
  subY?: number,
  rng?: ((max: number) => number) | undefined,
): { readonly classId: number; readonly isSparkling?: boolean | undefined } | null {
  if (presetIndex < 0 || presetIndex === OBJECT_SKIPPED_PRESET || presetIndex > 582) {
    return null
  }
  if (presetIndex < OBJECT_SKIPPED_PRESET) {
    return { classId: presetIndex }
  }
  if (presetIndex >= 574 && presetIndex <= 579) {
    return { classId: 136 }
  }
  if (presetIndex === 582) {
    return { classId: 307 }
  }
  // 1.13c D2Game.dll 0x6fc522b0 & 0x6fc531b0:
  // Random chest class and sparkling status are rolled via game seed / RNG.
  const roll: (n: number) => number =
    typeof subXOrRng === 'function'
      ? subXOrRng
      : typeof rng === 'function'
        ? rng
        : (n: number) => {
            const sx = typeof subXOrRng === 'number' ? subXOrRng : 0
            const sy = typeof subY === 'number' ? subY : 0
            const h =
              (Math.imul(areaId, 73856093) ^
                Math.imul(sx, 19349663) ^
                Math.imul(sy, 83492791)) >>>
              0
            return h % n
          }

  let classId: number
  if (presetIndex === 580 && areaId === 25) {
    classId = 371
  } else {
    let pool: readonly number[]
    if (areaId === 74) {
      pool = PRESET_CHEST_POOL_ARCANE
    } else if (areaId >= 40 && areaId < 75) {
      pool = PRESET_CHEST_POOL_ACT2
    } else if (areaId === 83) {
      pool = PRESET_CHEST_POOL_TRAVINCAL
    } else if (areaId >= 75 && areaId < 103) {
      pool = PRESET_CHEST_POOL_ACT3
    } else {
      pool = PRESET_CHEST_POOL_ACT1_4_5
    }
    const idx = roll(pool.length)
    classId = pool[idx]!
  }
  if (presetIndex === 580) {
    // 1.13c D2Game.dll 0x6fc531b0: Maggot Lair (areas 62..64) rolls rand(100) <= 50 (51% chance, 51 values out of 100)
    // to mark as super chest; 100% elsewhere.
    const isSuper =
      areaId >= 62 && areaId <= 64
        ? roll(100) <= 50
        : true
    return isSuper ? { classId, isSparkling: true } : { classId }
  }
  return { classId }
}
/** MonStats.txt 155 `warriv1`. */
const MONSTER_WARRIV1 = 155
/** Spiral radius (sub-tiles) searched for standable floor around a landmark landing (waypoint, warp). */
export const LANDING_SEARCH_RADIUS = 25

/** Level geometry contract (netproto, shared with the browser DRLG host). */
export type AreaLevelPresetUnit = LocalAreaLevelPresetUnit
export type AreaLevelWarp = LocalAreaLevelWarp
export type AreaLevelGeometry = LocalAreaLevelGeometry
export type AreaLevelRequest = LocalAreaLevelRequest
export type AreaLevelSource = LocalAreaLevelSource

/** Walkability of world sub-tile `(x, y)` in `level` (outside the grid = void = blocked). */
export function isLevelSubTileWalkable(level: AreaLevelGeometry, x: number, y: number): boolean {
  const sx = Math.floor(x) - level.originX
  const sy = Math.floor(y) - level.originY
  if (sx < 0 || sy < 0 || sx >= level.subWidth || sy >= level.subHeight) return false
  return level.blocked[sy * level.subWidth + sx] === 0
}

/**
 * Standable floor: the sub-tile and its 8 neighbours are walkable, so the unit is grounded on connected
 * floor instead of a single isolated walkable sub-tile inside a wall.
 */
export function isStandableSubTile(
  isWalkable: (x: number, y: number) => boolean,
  x: number,
  y: number,
): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!isWalkable(x + dx, y + dy)) return false
    }
  }
  return true
}

/**
 * Nearest standable sub-tile to `(x, y)` on growing square rings (`r = 0..maxRadius`); `null` when
 * there is none (the caller must refuse the placement instead of dropping the unit in void).
 */
export function findStandableNear(
  isWalkable: (x: number, y: number) => boolean,
  x: number,
  y: number,
  maxRadius: number = LANDING_SEARCH_RADIUS,
): { readonly x: number; readonly y: number } | null {
  const cx = Math.round(x)
  const cy = Math.round(y)
  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        if (isStandableSubTile(isWalkable, cx + dx, cy + dy)) {
          return { x: cx + dx, y: cy + dy }
        }
      }
    }
  }
  return null
}

/** Turns one level's DRLG geometry into the units, warps, rooms and spawn the game server needs. */
export function buildAreaBootstrap(
  level: AreaLevelGeometry,
  rng?: ((max: number) => number) | undefined,
): LocalAreaBootstrap {
  const areaId = level.areaId
  const isTown = TOWN_AREA_IDS_113C.has(areaId)
  const walkable = (x: number, y: number): boolean => isLevelSubTileWalkable(level, x, y)

  const objects: LocalAreaPresetObject[] = []
  const monsters: LocalAreaPresetMonster[] = []
  let bonfire: { readonly x: number; readonly y: number } | null = null
  let warriv: { readonly x: number; readonly y: number } | null = null

  for (const u of level.presetUnits) {
    const x = level.originX + u.subX
    const y = level.originY + u.subY
    if (u.type === 2) {
      const resolved = resolvePresetObject113c(u.index, areaId, u.subX, u.subY, rng)
      if (resolved === null) continue
      if (resolved.classId === OBJECT_ROGUE_BONFIRE && bonfire === null) bonfire = { x, y }
      const isWaypoint = WAYPOINT_CLASS_IDS_113C.has(resolved.classId)
      objects.push({
        classId: resolved.classId,
        x,
        y,
        areaId,
        mode: isWaypoint && isTown ? 1 : u.mode,
        isWaypoint,
        ...(resolved.isSparkling ? { isSparkling: true } : {}),
      })
    } else if (u.type === 1) {
      if (u.index < 0) continue
      if (u.index >= MONSTATS_113C_ROWS.length) {
        const superUniqueIndex = u.index - MONSTATS_113C_ROWS.length
        const su = getSuperUniqueByIndex(superUniqueIndex)
        if (!su || isTown) continue
        const suKind = getCanonicalMonsterKinds('normal').get(su.monsterId)
        if (suKind?.hcIdx === undefined) continue
        monsters.push({ classId: suKind.hcIdx, x, y, areaId, superUniqueIndex })
        continue
      }
      if (u.index === MONSTER_WARRIV1 && warriv === null) warriv = { x, y }
      const townNpc = getTownNpcDescriptorByHcIdx(u.index)
      const isVendor = townNpc !== undefined && townNpc.vendorId !== null
      const row = MONSTATS_113C_ROWS[u.index]
      if (!row) {
        throw new Error(`area bootstrap: missing MonStats entry for hcIdx ${u.index}`)
      }
      const isNpc = row.npc || townNpc !== undefined
      const isKillable = !isNpc && row.killable
      monsters.push({
        classId: u.index,
        x,
        y,
        areaId,
        isNpc,
        isVendor,
        isKillable,
        aiDisabled: isNpc,
      })
    }
  }

  const warps: LocalAreaWarp[] = level.warps.map((w) => ({
    lvlWarpId: w.lvlWarpId,
    x: level.originX + w.subX,
    y: level.originY + w.subY,
    destAreaId: w.toLevelId,
  }))

  const candidate =
    bonfire !== null
      ? { x: bonfire.x, y: bonfire.y }
      : warriv !== null
        ? { x: warriv.x, y: warriv.y }
        : {
            x: level.originX + level.spawnTileX * SUB_TILES_PER_TILE + 2,
            y: level.originY + level.spawnTileY * SUB_TILES_PER_TILE + 2,
          }
  // The DRLG start cell is not always on floor (Tristram 38 / Uber Tristram 136 start on the edge of
  // the preset); the whole level grid is searched so the spawn is still the nearest standable floor.
  const spawn = findStandableNear(
    walkable,
    candidate.x,
    candidate.y,
    Math.max(level.subWidth, level.subHeight),
  )
  if (spawn === null) {
    throw new Error(`area bootstrap: level ${areaId} has no standable floor at all`)
  }

  return {
    areaId,
    spawnX: spawn.x,
    spawnY: spawn.y,
    rooms: level.rooms.map((r) => ({ areaId: r.areaId, tileX: r.tileX, tileY: r.tileY })),
    roomRects: level.roomRects.map((r) => ({ ...r })),
    adjacentAreaIds: level.adjacentAreaIds?.slice() ?? [],
    objects,
    monsters,
    warps,
    isWalkable: (checkAreaId, x, y) => checkAreaId === areaId && isLevelSubTileWalkable(level, x, y),
  }
}

/** The resolver injected into `GameInstance`: builds the level through `source`, then `buildAreaBootstrap`. */
export function createAreaBootstrapResolver(
  source: AreaLevelSource,
  rng?: ((max: number) => number) | undefined,
): LocalAreaBootstrapResolver {
  return (request) => {
    const level = source(request)
    if (level === null) return null
    if (level.areaId !== request.areaId) {
      throw new Error(
        `area bootstrap: level source returned level ${level.areaId} for requested area ${request.areaId}`,
      )
    }
    if (level.blocked.length !== level.subWidth * level.subHeight) {
      throw new Error(
        `area bootstrap: level ${level.areaId} collision grid has ${level.blocked.length} cells, expected ${level.subWidth}x${level.subHeight}`,
      )
    }
    return buildAreaBootstrap(level, rng)
  }
}
