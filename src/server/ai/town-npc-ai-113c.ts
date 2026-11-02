import { MONSTATS_113C_ROWS } from '../../common/units/monstats-113c-data.ts';
import {
  buildAdjacentRoomLists,
  D2Common_10142,
  D2Common_10226,
  D2Common_10399,
  D2COMMON_10170_PathSetTargetPos,
  D2COMMON_10193_PATH_AdjustDirection,
  DynamicPath,
  getMonsterModeBaseAnimSpeed256,
  getMonsterModeBaseFrameCount113c,
  getMonsterPathRecord,
  MONMODE_NEUTRAL,
  MONMODE_SKILL1,
  MONMODE_SKILL4,
  MONMODE_WALK,
  PATH_AddCollisionFootprintForUnit,
  PATH_AllocDynamicPath,
  PATH_FreeDynamicPath,
  PATH_RemoveCollisionFootprintForUnit,
  PATH_SetDistance,
  PATH_SetNewDistance,
  PATH_SetStepNum,
  PATH_SetTargetUnit,
  PATH_SetType,
  PATH_SetUnitDeadCollision,
  PATH_SetVelocity,
  PATH_StopMovement,
  PATHTYPE_MON_CIRCLE_CW,
  PATHTYPE_STRAIGHT,
  PATHTYPE_WALL_FOLLOW,
  subtileCenter,
  UNIT_MONSTER,
  UNIT_OBJECT,
  UNIT_PLAYER,
  type PathCollisionGrid,
  type PathObjectTxt,
  type PathRoom,
  type PathUnit,
} from '../../common/path/index.ts';
import { CANONICAL_113C_OBJECTS } from '../../common/world/objects-meta.ts';
import type { LocalAreaMapAiNode } from '../../netproto/index.ts';
import type { D2SeedStrc } from '../../common/rng/d2-rng.ts';
import { rollLimitedSeed113c } from '../engine/game-instance/unit-seeds-113c.ts';

const TOWN_AREA_IDS_113C: ReadonlySet<number> = new Set<number>([1, 40, 75, 103, 109]);

/**
 * Exact set of 1.13c Objects.txt row IDs with Orientation === 1
 * (extracted from d2data.mpq + d2exp.mpq + Patch_D2.mpq, 573 rows total).
 */
export const OBJECT_ORIENTATION_1_IDS_113C: ReadonlySet<number> = new Set<number>([
  8, 14, 16, 24, 25, 27, 32, 33, 47, 49, 63, 77, 92, 99, 104, 106, 109, 116,
  152, 165, 167, 168, 193, 196, 260, 261, 267, 273, 274, 291, 293, 295, 296,
  297, 301, 302, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 326,
  357, 401, 452, 453, 459, 460, 461, 462, 548, 550,
]);

const objectPathTxtCache = new Map<number, PathObjectTxt>();

export function getObjectPathTxt113c(classId: number): PathObjectTxt {
  const cached = objectPathTxtCache.get(classId);
  if (cached) return cached;
  const meta = CANONICAL_113C_OBJECTS[classId];
  const mask = meta?.hasCollisionMask ?? 0;
  const hasCollision: readonly boolean[] = [
    Boolean((mask >>> 0) & 1),
    Boolean((mask >>> 1) & 1),
    Boolean((mask >>> 2) & 1),
    Boolean((mask >>> 3) & 1),
    Boolean((mask >>> 4) & 1),
    Boolean((mask >>> 5) & 1),
    Boolean((mask >>> 6) & 1),
    Boolean((mask >>> 7) & 1),
  ];
  const txt: PathObjectTxt = {
    sizeX: meta?.sizeX ?? 0,
    sizeY: meta?.sizeY ?? 0,
    subClass: meta?.subClass ?? 0,
    isDoor: Boolean(meta?.isDoor),
    blocksVis: Boolean(meta?.blocksVis),
    blockMissile: Boolean(meta?.blockMissile),
    orientation: OBJECT_ORIENTATION_1_IDS_113C.has(classId) ? 1 : 0,
    hasCollision,
  };
  objectPathTxtCache.set(classId, txt);
  return txt;
}

export function isTownNpcMonster113c(hcIdx: number): boolean {
  return MONSTATS_113C_ROWS[hcIdx]?.ai === 'Npc';
}

/**
 * D2Common_10396 / integer octile approximation:
 * max(|dx|, |dy|) + (min(|dx|, |dy|) >> 1).
 */
export function distApprox113c(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = Math.abs(x1 - x2);
  const dy = Math.abs(y1 - y2);
  return dx >= dy ? dx + (dy >> 1) : dy + (dx >> 1);
}

interface NpcNode4State {
  x: number;
  y: number;
  count: number;
  delay: number;
}

interface NpcNode7State {
  mode: number;
  x: number;
  y: number;
  ticks: number;
}

export interface TownNpcAiState113c {
  homeInitialized: boolean;
  homeX: number;
  homeY: number;
  nextAiFrame: number;
  animEndFrame: number;
  node4: NpcNode4State | null;
  node4RetryCounter: number;
  node7: NpcNode7State | null;
}

export interface TownNpcMonsterLike {
  unitId: number;
  hcIdx: number;
  areaId: number;
  x: number;
  y: number;
  mode: number;
  dead: boolean;
  mapAi?: readonly LocalAreaMapAiNode[] | undefined;
  townNpcAiEnabled?: boolean | undefined;
}

export interface TownNpcPlayerContext {
  unitId: number;
  areaId: number;
  x: number;
  y: number;
  activeNpcId: number | undefined;
  warrivGreeted: boolean;
}

interface MonsterPathEntry {
  unit: PathUnit;
  npcAi: TownNpcAiState113c | null;
}

interface PlayerPathEntry {
  unit: PathUnit;
  run: boolean;
  velocityFp8: number;
  targetUnitType: number | null;
  targetUnitId: number | null;
  stopRange: number;
}

const ROOM_CHUNK_SUBTILES = 40;

interface AreaPathContext113c {
  areaId: number;
  originX: number;
  originY: number;
  subWidth: number;
  subHeight: number;
  roomCols: number;
  roomRows: number;
  rooms: PathRoom[];
  objects: Map<number, PathUnit>;
  monsters: Map<number, MonsterPathEntry>;
  players: Map<number, PlayerPathEntry>;
}

/**
 * 1.13c CharStats.txt WalkVelocity = 6 (1536 -> 6/16 = 3/8 sub-tile/frame = 9.375/s),
 * RunVelocity = 9 (2304 -> 9/16 sub-tile/frame = 14.0625/s).
 * UNITS_UpdateAnimRateAndVelocity (#10819, 0x6FD83110) computes:
 *   pct = max(25, 100 + velocityPercentBonus)
 *   pathVel = trunc((pct * (baseVel << 8)) / 100)
 */
export function computePlayerVelocity113c(
  run: boolean,
  velocityPercentBonus = 0,
): number {
  const baseVelFp8 = 6 << 8;
  const pct = Math.max(25, 100 + (run ? 50 : 0) + velocityPercentBonus);
  return Math.trunc(Math.imul(pct, baseVelFp8) / 100) | 0;
}

/**
 * 1.13c monster walk velocity in UNITS_UpdateAnimRateAndVelocity (#10819, 0x6FD83110):
 * MONSTER_InitStats (D2Game.dll 0x6FCCFFD1) initializes base stat 67 (STAT_VELOCITYPERCENT) = 75 (0x4B)
 * on all monsters (confirmed by 0x67 NPCMove captures in 04-d2gs-idle-60s.d2cap and a1-town-walk Oracle trace).
 */
export function computeMonsterWalkVelocity113c(hcIdx: number, pct = 75): number {
  const rec = getMonsterPathRecord(hcIdx);
  const clamped = Math.max(25, pct | 0);
  return Math.trunc(Math.imul(clamped, rec.velocity << 8) / 100) | 0;
}

/**
 * 1.13c MONSTER_StartMove (0x6FC95E10 -> 0x6FC94F90 -> 0x6FC94D50):
 * - Sets target coord and PATH_SetDistance(pPath, 20) (#10022 0x6FD84630, called at 0x6FC95EE7).
 * - Sets PATH_SetType(pPath, pathType) and calls D2Common_10142(pPath, npcUnit, 0).
 * - When pts === 0 and pathType is in {2, 7, 9, 13} (jump table 0x6FC94E2C),
 *   falls back to PATHTYPE_WALL_FOLLOW (15) and retries D2Common_10142 (0x6FC94DF0).
 */
function startNpcWalkToPos113c(
  pPath: DynamicPath,
  npcUnit: PathUnit,
  hcIdx: number,
  targetX: number,
  targetY: number,
  pathType: number,
  stepNum: number,
): number {
  PATH_SetStepNum(pPath, stepNum);
  PATH_SetTargetUnit(pPath, null);
  D2COMMON_10170_PathSetTargetPos(pPath, targetX, targetY);
  PATH_SetDistance(pPath, 20);
  PATH_SetVelocity(pPath, computeMonsterWalkVelocity113c(hcIdx));
  PATH_SetType(pPath, pathType);
  let pts = D2Common_10142(pPath, npcUnit, 0);
  if (
    pts <= 0 &&
    (pathType === 2 || pathType === PATHTYPE_STRAIGHT || pathType === 9 || pathType === 13)
  ) {
    PATH_SetType(pPath, PATHTYPE_WALL_FOLLOW);
    pts = D2Common_10142(pPath, npcUnit, 0);
  }
  return pts;
}

function computeMonsterSkillAnimTicks113c(hcIdx: number, mode: number): number {
  const frames = getMonsterModeBaseFrameCount113c(hcIdx, mode);
  const speed = getMonsterModeBaseAnimSpeed256(hcIdx, mode);
  if (frames <= 0 || speed <= 0) return 15;
  return Math.max(1, Math.floor(((frames << 8) + speed - 1) / speed));
}

function makeRoomCollisionGrid(
  originX: number,
  originY: number,
  subWidth: number,
  subHeight: number,
  cells: Uint16Array,
): PathCollisionGrid {
  return {
    get(x: number, y: number): number {
      const lx = (x - originX) | 0;
      const ly = (y - originY) | 0;
      if (lx < 0 || ly < 0 || lx >= subWidth || ly >= subHeight) return 0xffff;
      return cells[ly * subWidth + lx]!;
    },
    set(x: number, y: number, value: number): void {
      const lx = (x - originX) | 0;
      const ly = (y - originY) | 0;
      if (lx < 0 || ly < 0 || lx >= subWidth || ly >= subHeight) return;
      cells[ly * subWidth + lx] = value & 0xffff;
    },
  };
}

export class AreaPathWorld113c {
  private readonly areas = new Map<number, AreaPathContext113c>();
  private readonly playerAreaById = new Map<number, number>();
  private readonly monsterAreaById = new Map<number, number>();
  private readonly objectAreaById = new Map<number, number>();

  initArea(
    areaId: number,
    originX?: number,
    originY?: number,
    subWidth?: number,
    subHeight?: number,
    collision?: Uint16Array,
  ): boolean {
    if (
      originX === undefined ||
      originY === undefined ||
      !subWidth ||
      !subHeight ||
      !collision ||
      collision.length < subWidth * subHeight
    ) {
      return false;
    }
    const cells = collision.slice();
    const grid = makeRoomCollisionGrid(originX, originY, subWidth, subHeight, cells);
    const isTown = TOWN_AREA_IDS_113C.has(areaId);
    const roomCols = Math.max(1, Math.ceil(subWidth / ROOM_CHUNK_SUBTILES));
    const roomRows = Math.max(1, Math.ceil(subHeight / ROOM_CHUNK_SUBTILES));
    const rooms: PathRoom[] = [];
    for (let ry = 0; ry < roomRows; ry += 1) {
      const sy = originY + ry * ROOM_CHUNK_SUBTILES;
      const sh = Math.min(ROOM_CHUNK_SUBTILES, originY + subHeight - sy);
      for (let rx = 0; rx < roomCols; rx += 1) {
        const sx = originX + rx * ROOM_CHUNK_SUBTILES;
        const sw = Math.min(ROOM_CHUNK_SUBTILES, originX + subWidth - sx);
        rooms.push({
          subX: sx,
          subY: sy,
          subW: sw,
          subH: sh,
          isTown,
          adjacentRooms: [],
          grid,
        });
      }
    }
    const adjacentMap = buildAdjacentRoomLists(rooms);
    for (const room of rooms) {
      (room as { adjacentRooms: readonly PathRoom[] }).adjacentRooms =
        adjacentMap.get(room) ?? [];
    }
    this.areas.set(areaId, {
      areaId,
      originX,
      originY,
      subWidth,
      subHeight,
      roomCols,
      roomRows,
      rooms,
      objects: new Map(),
      monsters: new Map(),
      players: new Map(),
    });
    return true;
  }

  private findRoom(ctx: AreaPathContext113c, x: number, y: number): PathRoom | null {
    const lx = (x - ctx.originX) | 0;
    const ly = (y - ctx.originY) | 0;
    if (lx < 0 || ly < 0 || lx >= ctx.subWidth || ly >= ctx.subHeight) return null;
    const col = Math.floor(lx / ROOM_CHUNK_SUBTILES);
    const row = Math.floor(ly / ROOM_CHUNK_SUBTILES);
    return ctx.rooms[row * ctx.roomCols + col] ?? null;
  }

  hasArea(areaId: number): boolean {
    return this.areas.has(areaId);
  }

  /**
   * Ensures deleted or newly-slain units across any GameInstance subsystem
   * release or convert their collision footprints before pathfinding/stepping.
   */
  syncWorldUnits(
    hasMonster: (unitId: number) => boolean,
    isMonsterDead: (unitId: number) => boolean,
    hasObject: (unitId: number) => boolean,
    hasPlayer: (unitId: number) => boolean,
  ): void {
    for (const [unitId, areaId] of [...this.monsterAreaById.entries()]) {
      if (!hasMonster(unitId)) {
        this.removeMonster(unitId);
        continue;
      }
      if (isMonsterDead(unitId)) {
        const entry = this.areas.get(areaId)?.monsters.get(unitId);
        if (entry && entry.unit.dwAnimMode !== 12 && entry.unit.dwAnimMode !== 0) {
          this.setMonsterDead(unitId);
        }
      }
    }
    for (const unitId of [...this.objectAreaById.keys()]) {
      if (!hasObject(unitId)) {
        this.removeObject(unitId);
      }
    }
    for (const unitId of [...this.playerAreaById.keys()]) {
      if (!hasPlayer(unitId)) {
        this.removePlayer(unitId);
      }
    }
  }

  isInBounds(areaId: number, x: number, y: number): boolean {
    const ctx = this.areas.get(areaId);
    if (!ctx || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const ix = Math.round(x);
    const iy = Math.round(y);
    return (
      ix >= ctx.originX &&
      iy >= ctx.originY &&
      ix < ctx.originX + ctx.subWidth &&
      iy < ctx.originY + ctx.subHeight
    );
  }

  spawnObject(
    areaId: number,
    unitId: number,
    classId: number,
    x: number,
    y: number,
    mode: number,
  ): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const ctx = this.areas.get(areaId);
    if (!ctx || !this.isInBounds(areaId, ix, iy)) return;
    this.removeObject(unitId);
    const room = this.findRoom(ctx, ix, iy);
    if (!room) return;
    const unit: PathUnit = {
      dwUnitType: UNIT_OBJECT,
      dwClassId: classId,
      dwUnitId: unitId,
      dwAnimMode: mode,
      dwFlags: 0,
      dwFlagEx: 0,
      pDynamicPath: null,
      pStaticPath: { room, x: ix, y: iy },
      objectTxt: getObjectPathTxt113c(classId),
    };
    if (unit.objectTxt?.hasCollision[mode]) {
      PATH_AddCollisionFootprintForUnit(unit);
    }
    ctx.objects.set(unitId, unit);
    this.objectAreaById.set(unitId, areaId);
  }

  setObjectMode(unitId: number, mode: number): void {
    const areaId = this.objectAreaById.get(unitId);
    if (areaId === undefined) return;
    const ctx = this.areas.get(areaId);
    const unit = ctx?.objects.get(unitId);
    if (!unit) return;
    if (unit.dwAnimMode === mode) return;
    PATH_RemoveCollisionFootprintForUnit(unit, false);
    unit.dwAnimMode = mode;
    if (unit.objectTxt?.hasCollision[mode]) {
      PATH_AddCollisionFootprintForUnit(unit);
    }
  }

  removeObject(unitId: number): void {
    const areaId = this.objectAreaById.get(unitId);
    if (areaId === undefined) return;
    this.objectAreaById.delete(unitId);
    const ctx = this.areas.get(areaId);
    const unit = ctx?.objects.get(unitId);
    if (!unit) return;
    PATH_RemoveCollisionFootprintForUnit(unit, false);
    ctx!.objects.delete(unitId);
  }

  spawnMonster(
    areaId: number,
    monster: TownNpcMonsterLike,
    currentFrame: number,
  ): void {
    const ix = Math.round(monster.x);
    const iy = Math.round(monster.y);
    const ctx = this.areas.get(areaId);
    if (!ctx || !this.isInBounds(areaId, ix, iy)) return;
    this.removeMonster(monster.unitId);
    const room = this.findRoom(ctx, ix, iy);
    if (!room) return;
    const unit: PathUnit = {
      dwUnitType: UNIT_MONSTER,
      dwClassId: monster.hcIdx,
      dwUnitId: monster.unitId,
      dwAnimMode: monster.mode,
      dwFlags: 0,
      dwFlagEx: 0,
      pDynamicPath: null,
      pStaticPath: null,
      objectTxt: null,
    };
    PATH_AllocDynamicPath(room, ix, iy, unit, false);
    if (monster.dead || monster.mode === 0 || monster.mode === 12) {
      PATH_SetUnitDeadCollision(unit, true);
    }
    const npcAi: TownNpcAiState113c | null = monster.townNpcAiEnabled
      ? {
          homeInitialized: false,
          homeX: 0,
          homeY: 0,
          // Bootstrap monsters (currentFrame === 0) fire initial AI event on frame 4;
          // dynamically activated monsters fire on currentFrame + 2.
          nextAiFrame: currentFrame === 0 ? 4 : currentFrame + 2,
          animEndFrame: 0,
          node4: null,
          node4RetryCounter: 0,
          node7: null,
        }
      : null;
    ctx.monsters.set(monster.unitId, { unit, npcAi });
    this.monsterAreaById.set(monster.unitId, areaId);
  }

  syncMonsterPosition(
    areaId: number,
    unitId: number,
    x: number,
    y: number,
    mode: number,
  ): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const prevArea = this.monsterAreaById.get(unitId);
    if (prevArea !== undefined && prevArea !== areaId) {
      this.removeMonster(unitId);
    }
    const ctx = this.areas.get(areaId);
    const entry = ctx?.monsters.get(unitId);
    if (!ctx || !entry) return;
    const pPath = entry.unit.pDynamicPath;
    entry.unit.dwAnimMode = mode;
    if (!pPath) return;
    if (pPath.wPosX === ix && pPath.wPosY === iy) return;
    if (!this.isInBounds(areaId, ix, iy)) return;
    const room = this.findRoom(ctx, ix, iy);
    if (!room) return;
    PATH_RemoveCollisionFootprintForUnit(entry.unit, false);
    pPath.dwPrecisionX = subtileCenter(ix);
    pPath.dwPrecisionY = subtileCenter(iy);
    pPath.pRoom = room;
    PATH_StopMovement(pPath);
    PATH_AddCollisionFootprintForUnit(entry.unit);
  }

  setMonsterDead(unitId: number): void {
    const areaId = this.monsterAreaById.get(unitId);
    if (areaId === undefined) return;
    const ctx = this.areas.get(areaId);
    const entry = ctx?.monsters.get(unitId);
    if (!entry) return;
    entry.unit.dwAnimMode = 12;
    PATH_SetUnitDeadCollision(entry.unit, true);
  }

  removeMonster(unitId: number): void {
    const areaId = this.monsterAreaById.get(unitId);
    if (areaId === undefined) return;
    this.monsterAreaById.delete(unitId);
    const ctx = this.areas.get(areaId);
    const entry = ctx?.monsters.get(unitId);
    if (!entry) return;
    PATH_RemoveCollisionFootprintForUnit(entry.unit, false);
    if (entry.unit.pDynamicPath) {
      PATH_FreeDynamicPath(entry.unit.pDynamicPath);
    }
    ctx!.monsters.delete(unitId);
  }

  spawnOrSyncPlayer(
    areaId: number,
    unitId: number,
    charClassId: number,
    x: number,
    y: number,
    mode: number,
  ): PlayerPathEntry | null {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const prevArea = this.playerAreaById.get(unitId);
    if (prevArea !== undefined && prevArea !== areaId) {
      this.removePlayer(unitId);
    }
    const ctx = this.areas.get(areaId);
    if (!ctx || !this.isInBounds(areaId, ix, iy)) return null;
    let entry = ctx.players.get(unitId);
    if (!entry) {
      const room = this.findRoom(ctx, ix, iy);
      if (!room) return null;
      const unit: PathUnit = {
        dwUnitType: UNIT_PLAYER,
        dwClassId: charClassId,
        dwUnitId: unitId,
        dwAnimMode: mode,
        dwFlags: 0,
        dwFlagEx: 0,
        pDynamicPath: null,
        pStaticPath: null,
        objectTxt: null,
      };
      PATH_AllocDynamicPath(room, ix, iy, unit, false);
      entry = {
        unit,
        run: false,
        velocityFp8: computePlayerVelocity113c(false, 0),
        targetUnitType: null,
        targetUnitId: null,
        stopRange: 0,
      };
      ctx.players.set(unitId, entry);
      this.playerAreaById.set(unitId, areaId);
      return entry;
    }
    entry.unit.dwAnimMode = mode;
    const pPath = entry.unit.pDynamicPath;
    if (pPath && (pPath.wPosX !== ix || pPath.wPosY !== iy)) {
      const room = this.findRoom(ctx, ix, iy);
      if (room) {
        PATH_RemoveCollisionFootprintForUnit(entry.unit, false);
        pPath.dwPrecisionX = subtileCenter(ix);
        pPath.dwPrecisionY = subtileCenter(iy);
        pPath.pRoom = room;
        PATH_StopMovement(pPath);
        PATH_AddCollisionFootprintForUnit(entry.unit);
      }
    }
    return entry;
  }

  removePlayer(unitId: number): void {
    const areaId = this.playerAreaById.get(unitId);
    if (areaId === undefined) return;
    this.playerAreaById.delete(unitId);
    const ctx = this.areas.get(areaId);
    const entry = ctx?.players.get(unitId);
    if (!entry) return;
    PATH_RemoveCollisionFootprintForUnit(entry.unit, false);
    if (entry.unit.pDynamicPath) {
      PATH_FreeDynamicPath(entry.unit.pDynamicPath);
    }
    ctx!.players.delete(unitId);
  }

  stopPlayer(unitId: number, neutralMode: number): void {
    const areaId = this.playerAreaById.get(unitId);
    if (areaId === undefined) return;
    const ctx = this.areas.get(areaId);
    const entry = ctx?.players.get(unitId);
    if (!entry) return;
    entry.unit.dwAnimMode = neutralMode;
    entry.targetUnitType = null;
    entry.targetUnitId = null;
    entry.stopRange = 0;
    const pPath = entry.unit.pDynamicPath;
    if (pPath) {
      PATH_SetTargetUnit(pPath, null);
      PATH_StopMovement(pPath);
    }
  }

  isPlayerMoving(areaId: number, unitId: number): boolean {
    const ctx = this.areas.get(areaId);
    const pPath = ctx?.players.get(unitId)?.unit.pDynamicPath;
    if (!pPath) return false;
    return pPath.dwPathPoints > 0 && pPath.dwCurrentPointIdx < pPath.dwPathPoints;
  }

  getPlayerNextWaypoint(
    areaId: number,
    unitId: number,
  ): { x: number; y: number } | null {
    const ctx = this.areas.get(areaId);
    const pPath = ctx?.players.get(unitId)?.unit.pDynamicPath;
    if (!pPath || pPath.dwPathPoints <= 0 || pPath.dwCurrentPointIdx >= pPath.dwPathPoints) {
      return null;
    }
    const pt = pPath.PathPoints[pPath.dwPathPoints - 1]!;
    return { x: pt.X, y: pt.Y };
  }

  planPlayerMoveToLocation(
    areaId: number,
    unitId: number,
    charClassId: number,
    curX: number,
    curY: number,
    targetX: number,
    targetY: number,
    run: boolean,
    velocityPercentBonus: number,
    moveMode: number,
  ): boolean {
    const tx = Math.round(targetX);
    const ty = Math.round(targetY);
    if (!this.isInBounds(areaId, curX, curY) || !this.isInBounds(areaId, tx, ty)) {
      return false;
    }
    const entry = this.spawnOrSyncPlayer(areaId, unitId, charClassId, curX, curY, moveMode);
    const pPath = entry?.unit.pDynamicPath;
    if (!entry || !pPath) return false;
    entry.run = run;
    entry.velocityFp8 = computePlayerVelocity113c(run, velocityPercentBonus);
    entry.targetUnitType = null;
    entry.targetUnitId = null;
    entry.stopRange = 0;
    PATH_SetTargetUnit(pPath, null);
    PATH_SetVelocity(pPath, entry.velocityFp8);
    PATH_SetStepNum(pPath, 0);
    PATH_SetNewDistance(pPath, 73);
    PATH_SetType(pPath, PATHTYPE_STRAIGHT);
    D2COMMON_10170_PathSetTargetPos(pPath, tx, ty);
    const pts = D2Common_10142(pPath, entry.unit, 0);
    if (pts > 0) {
      entry.unit.dwAnimMode = moveMode;
      return true;
    }
    return false;
  }

  planPlayerMoveToUnit(
    areaId: number,
    unitId: number,
    charClassId: number,
    curX: number,
    curY: number,
    targetUnitType: number,
    targetUnitId: number,
    fallbackX: number,
    fallbackY: number,
    run: boolean,
    velocityPercentBonus: number,
    moveMode: number,
    stopRange = 0,
  ): boolean {
    if (!this.isInBounds(areaId, curX, curY)) return false;
    const ctx = this.areas.get(areaId);
    if (!ctx) return false;
    const targetUnit = this.findTargetPathUnit(ctx, targetUnitType, targetUnitId);
    if (!targetUnit) {
      return this.planPlayerMoveToLocation(
        areaId,
        unitId,
        charClassId,
        curX,
        curY,
        fallbackX,
        fallbackY,
        run,
        velocityPercentBonus,
        moveMode,
      );
    }
    const entry = this.spawnOrSyncPlayer(areaId, unitId, charClassId, curX, curY, moveMode);
    const pPath = entry?.unit.pDynamicPath;
    if (!entry || !pPath) return false;
    entry.run = run;
    entry.velocityFp8 = computePlayerVelocity113c(run, velocityPercentBonus);
    entry.targetUnitType = targetUnitType;
    entry.targetUnitId = targetUnitId;
    entry.stopRange = stopRange;
    PATH_SetVelocity(pPath, entry.velocityFp8);
    PATH_SetStepNum(pPath, Math.max(0, stopRange));
    PATH_SetNewDistance(pPath, 73);
    PATH_SetType(pPath, PATHTYPE_STRAIGHT);
    const tPos = targetUnit.pDynamicPath
      ? { x: targetUnit.pDynamicPath.wPosX, y: targetUnit.pDynamicPath.wPosY }
      : targetUnit.pStaticPath
        ? { x: targetUnit.pStaticPath.x, y: targetUnit.pStaticPath.y }
        : { x: Math.round(fallbackX), y: Math.round(fallbackY) };
    D2COMMON_10170_PathSetTargetPos(pPath, tPos.x, tPos.y);
    PATH_SetTargetUnit(pPath, targetUnit);
    const pts = D2Common_10142(pPath, entry.unit, 0);
    if (pts > 0) {
      entry.unit.dwAnimMode = moveMode;
      return true;
    }
    return false;
  }

  /**
   * Advances the player DynamicPath by 1 server frame (40ms).
   * Returns { x, y, stillMoving } or null if player has no active DynamicPath.
   */
  stepPlayerTick(
    areaId: number,
    unitId: number,
    run: boolean,
    velocityPercentBonus: number,
  ): { x: number; y: number; stillMoving: boolean } | null {
    const ctx = this.areas.get(areaId);
    const entry = ctx?.players.get(unitId);
    const pPath = entry?.unit.pDynamicPath;
    if (!ctx || !entry || !pPath) return null;
    if (pPath.dwPathPoints <= 0 || pPath.dwCurrentPointIdx >= pPath.dwPathPoints) {
      return { x: pPath.wPosX, y: pPath.wPosY, stillMoving: false };
    }
    entry.run = run;
    entry.velocityFp8 = computePlayerVelocity113c(run, velocityPercentBonus);
    PATH_SetVelocity(pPath, entry.velocityFp8);
    const stepped = D2Common_10226(entry.unit, 0);
    D2COMMON_10193_PATH_AdjustDirection(pPath);
    if (stepped === 0) {
      return { x: pPath.wPosX, y: pPath.wPosY, stillMoving: false };
    }
    return {
      x: pPath.wPosX,
      y: pPath.wPosY,
      stillMoving: pPath.dwCurrentPointIdx < pPath.dwPathPoints,
    };
  }

  /**
   * Steps all Town NPC monsters (MonStats.ai === 'Npc') for 1 server frame.
   */
  stepTownNpcs(
    monsters: Iterable<TownNpcMonsterLike>,
    getUnitSeed: (unitId: number) => D2SeedStrc | undefined,
    players: readonly TownNpcPlayerContext[],
    currentFrame: number,
    difficulty: number,
    onNpcMoved?: (
      mon: TownNpcMonsterLike,
      prevX: number,
      prevY: number,
    ) => void,
  ): void {
    const diffIdx = Math.max(0, Math.min(2, difficulty));
    for (const mon of monsters) {
      if (mon.dead || !mon.townNpcAiEnabled) continue;
      const ctx = this.areas.get(mon.areaId);
      const entry = ctx?.monsters.get(mon.unitId);
      const pPath = entry?.unit.pDynamicPath;
      const ai = entry?.npcAi;
      if (!ctx || !entry || !pPath || !ai) continue;
      const unitSeed = getUnitSeed(mon.unitId);
      if (!unitSeed) continue;

      const interacting = players.some(
        (p) => p.areaId === mon.areaId && p.activeNpcId === mon.unitId,
      );
      if (interacting && mon.mode === MONMODE_WALK) {
        PATH_StopMovement(pPath);
        mon.mode = MONMODE_NEUTRAL;
        entry.unit.dwAnimMode = MONMODE_NEUTRAL;
      }

      let immediateAi = false;

      if (mon.mode === MONMODE_WALK) {
        const prevX = mon.x;
        const prevY = mon.y;
        const vel = computeMonsterWalkVelocity113c(mon.hcIdx);
        PATH_SetVelocity(pPath, vel);
        const stepped = D2Common_10226(entry.unit, 0x400);
        D2COMMON_10193_PATH_AdjustDirection(pPath);
        mon.x = pPath.wPosX;
        mon.y = pPath.wPosY;
        if (mon.x !== prevX || mon.y !== prevY) {
          onNpcMoved?.(mon, prevX, prevY);
        }
        if (stepped === 0) {
          mon.mode = MONMODE_NEUTRAL;
          entry.unit.dwAnimMode = MONMODE_NEUTRAL;
          immediateAi = true;
        }
      } else if (mon.mode >= MONMODE_SKILL1 && mon.mode <= MONMODE_SKILL4) {
        if (currentFrame >= ai.animEndFrame) {
          mon.mode = MONMODE_NEUTRAL;
          entry.unit.dwAnimMode = MONMODE_NEUTRAL;
          const aidel = MONSTATS_113C_ROWS[mon.hcIdx]?.aidel?.[diffIdx] ?? 15;
          ai.nextAiFrame = currentFrame + aidel;
        }
      }

      if (
        mon.mode !== MONMODE_WALK &&
        !(mon.mode >= MONMODE_SKILL1 && mon.mode <= MONMODE_SKILL4) &&
        (immediateAi || currentFrame >= ai.nextAiFrame)
      ) {
        this.runAiNpc113c(
          ctx,
          entry.unit,
          pPath,
          mon,
          unitSeed,
          ai,
          players,
          currentFrame,
        );
      }
    }
  }

  private runAiNpc113c(
    ctx: AreaPathContext113c,
    npcUnit: PathUnit,
    pPath: DynamicPath,
    mon: TownNpcMonsterLike,
    unitSeed: D2SeedStrc,
    ai: TownNpcAiState113c,
    players: readonly TownNpcPlayerContext[],
    currentFrame: number,
  ): void {
    // 1. Player interaction freeze (0x6FC3DB40)
    const interacting = players.some(
      (p) => p.areaId === mon.areaId && p.activeNpcId === mon.unitId,
    );
    if (interacting) {
      if (mon.mode === MONMODE_WALK) {
        PATH_StopMovement(pPath);
        mon.mode = MONMODE_NEUTRAL;
        npcUnit.dwAnimMode = MONMODE_NEUTRAL;
      }
      ai.nextAiFrame = currentFrame + 20;
      return;
    }

    // 2. Initialize node10 home anchor on first AI tick
    if (!ai.homeInitialized) {
      ai.homeInitialized = true;
      ai.homeX = pPath.wPosX;
      ai.homeY = pPath.wPosY;
      ai.nextAiFrame = currentFrame + 20;
      return;
    }

    // 3. QUESTS_NpcGreetingAi (0x6FC39C20) — Act 1 Warriv (hcIdx 155 in area 1)
    if (mon.hcIdx === 155 && mon.areaId === 1) {
      let nearestPlayer: TownNpcPlayerContext | null = null;
      let nearestPlayerUnit: PathUnit | null = null;
      let bestDist = Infinity;
      for (const p of players) {
        if (p.areaId !== mon.areaId || p.warrivGreeted) continue;
        const pEntry = ctx.players.get(p.unitId);
        if (!pEntry) continue;
        const d = D2Common_10399(pEntry.unit, npcUnit);
        if (d < bestDist) {
          bestDist = d;
          nearestPlayer = p;
          nearestPlayerUnit = pEntry.unit;
        }
      }
      if (nearestPlayer && nearestPlayerUnit) {
        const dist = bestDist;
        if (dist > 2 && dist < 24) {
          if (distApprox113c(pPath.wPosX, pPath.wPosY, ai.homeX, ai.homeY) > 16) {
            ai.node4 = { x: ai.homeX, y: ai.homeY, count: 12, delay: 10 };
            ai.nextAiFrame = currentFrame + 10;
            return;
          }
          const pPosPath = nearestPlayerUnit.pDynamicPath;
          const playerX = pPosPath ? pPosPath.wPosX : Math.round(nearestPlayer.x);
          const playerY = pPosPath ? pPosPath.wPosY : Math.round(nearestPlayer.y);
          const npcX = pPath.wPosX;
          const npcY = pPath.wPosY;
          const maxStep = dist >= 5 ? 3 : dist - 2;
          const step = Math.min(Math.abs(dist - 2), maxStep);
          const dx = Math.abs(npcX - playerX);
          const dy = Math.abs(npcY - playerY);
          const sum = Math.max(dx + dy, step);
          let stepX = sum > 0 ? Math.trunc((dx * step) / sum) : 0;
          let stepY = sum > 0 ? Math.trunc((dy * step) / sum) : 0;
          while (sum > 0 && stepX + stepY < step) {
            stepX += 1;
            stepY += 1;
          }
          const dirX = playerX > npcX ? 1 : playerX < npcX ? -1 : 0;
          const dirY = playerY > npcY ? 1 : playerY < npcY ? -1 : 0;
          const targetX = npcX + dirX * stepX;
          const targetY = npcY + dirY * stepY;
          const pts = startNpcWalkToPos113c(
            pPath,
            npcUnit,
            mon.hcIdx,
            targetX,
            targetY,
            PATHTYPE_STRAIGHT,
            1,
          );
          if (pts > 0) {
            mon.mode = MONMODE_WALK;
            npcUnit.dwAnimMode = MONMODE_WALK;
          } else {
            ai.nextAiFrame = currentFrame + 10;
          }
          return;
        }
        // dist <= 2 || dist >= 24 while greeting active: stand still and wait 20 frames
        if (mon.mode === MONMODE_WALK) {
          PATH_StopMovement(pPath);
          mon.mode = MONMODE_NEUTRAL;
          npcUnit.dwAnimMode = MONMODE_NEUTRAL;
        }
        ai.nextAiFrame = currentFrame + 20;
        return;
      }
    }

    // 4. AI_HandleNpcNodes (0x6FC36A30)
    if (ai.node4 && ai.node4.count > 0) {
      const n4 = ai.node4;
      if (
        n4.x !== 0 &&
        n4.y !== 0 &&
        distApprox113c(pPath.wPosX, pPath.wPosY, n4.x, n4.y) > 3
      ) {
        const pathType =
          (ai.node4RetryCounter & 3) === 0
            ? PATHTYPE_MON_CIRCLE_CW
            : PATHTYPE_STRAIGHT;
        ai.node4RetryCounter = (ai.node4RetryCounter + 1) | 0;
        const pts = startNpcWalkToPos113c(
          pPath,
          npcUnit,
          mon.hcIdx,
          n4.x,
          n4.y,
          pathType,
          0,
        );
        if (pts > 0) {
          mon.mode = MONMODE_WALK;
          npcUnit.dwAnimMode = MONMODE_WALK;
        } else {
          ai.nextAiFrame = currentFrame + n4.delay;
        }
      } else {
        ai.nextAiFrame = currentFrame + n4.delay;
      }
      n4.count -= 1;
      return;
    }

    if (ai.node7 && ai.node7.mode !== 0) {
      const n7 = ai.node7;
      if (n7.mode >= MONMODE_SKILL1 && n7.mode <= MONMODE_SKILL4) {
        const dist = distApprox113c(pPath.wPosX, pPath.wPosY, n7.x, n7.y);
        if (dist > 0) {
          if (n7.ticks > 0) {
            const pts = startNpcWalkToPos113c(
              pPath,
              npcUnit,
              mon.hcIdx,
              n7.x,
              n7.y,
              PATHTYPE_STRAIGHT,
              0,
            );
            if (pts > 0) {
              mon.mode = MONMODE_WALK;
              npcUnit.dwAnimMode = MONMODE_WALK;
            } else {
              ai.nextAiFrame = currentFrame + 25;
            }
            n7.ticks -= 1;
            return;
          }
          if (dist > 1) {
            n7.mode = 0;
          }
        }

        if (n7.mode !== 0) {
          if (mon.hcIdx === 154) {
            pPath.nDirection = 0x38;
          } else if (mon.hcIdx === 155) {
            pPath.nDirection = 0x34;
          } else if (mon.hcIdx === 178) {
            pPath.nDirection = 0x04;
          } else if (mon.hcIdx === 405) {
            if (n7.mode === MONMODE_SKILL1) pPath.nDirection = 0x34;
            else if (n7.mode === 9) pPath.nDirection = 0x30;
          }

          if (mon.hcIdx === 511 && rollLimitedSeed113c(unitSeed, 100) > 4) {
            n7.mode = 0;
            ai.nextAiFrame = currentFrame + 50;
            return;
          }

          if (mon.mode === n7.mode) {
            ai.nextAiFrame = currentFrame + 50;
            return;
          }
          const skillMode = n7.mode;
          n7.mode = 0;
          mon.mode = skillMode;
          npcUnit.dwAnimMode = skillMode;
          ai.animEndFrame =
            currentFrame + computeMonsterSkillAnimTicks113c(mon.hcIdx, skillMode);
          return;
        }
      } else {
        n7.mode = 0;
        ai.nextAiFrame = currentFrame + 50;
        return;
      }
    }

    // Fara (hcIdx === 178) spontaneous skill node7 trigger (falls through!)
    if (
      mon.hcIdx === 178 &&
      (!ai.node7 || ai.node7.mode === 0) &&
      rollLimitedSeed113c(unitSeed, 100) < 66
    ) {
      ai.node7 = {
        mode: MONMODE_SKILL1,
        x: pPath.wPosX,
        y: pPath.wPosY,
        ticks: 0,
      };
    }

    // 5. AI_FollowDs1NpcPath (0x6FC3BBC0)
    const mapAi = mon.mapAi;
    if (!mapAi || mapAi.length === 0) {
      ai.nextAiFrame = currentFrame + 20;
      return;
    }

    if (rollLimitedSeed113c(unitSeed, 100) >= 66) {
      ai.nextAiFrame = currentFrame + 8;
      return;
    }

    const wpIdx = rollLimitedSeed113c(unitSeed, mapAi.length);
    const wp = mapAi[wpIdx]!;
    if (wp.action <= 0 || wp.action >= 6) {
      ai.nextAiFrame = currentFrame + 8;
      return;
    }

    const canMove =
      wp.x !== 0 &&
      wp.y !== 0 &&
      distApprox113c(pPath.wPosX, pPath.wPosY, wp.x, wp.y) > 0;
    let pts = 0;
    if (canMove) {
      pts = startNpcWalkToPos113c(
        pPath,
        npcUnit,
        mon.hcIdx,
        wp.x,
        wp.y,
        PATHTYPE_STRAIGHT,
        0,
      );
      if (pts > 0) {
        mon.mode = MONMODE_WALK;
        npcUnit.dwAnimMode = MONMODE_WALK;
      }
    }

    if (wp.action === 2) {
      ai.node4 = { x: wp.x, y: wp.y, count: 20, delay: 10 };
    } else if (canMove) {
      ai.node4 = { x: wp.x, y: wp.y, count: 12, delay: 10 };
    }

    if (canMove && wp.action === 4) {
      const hasS1 =
        (getMonsterPathRecord(mon.hcIdx).modeFlags & (1 << MONMODE_SKILL1)) !== 0;
      ai.node7 = {
        mode: hasS1 ? MONMODE_SKILL1 : MONMODE_NEUTRAL,
        x: wp.x,
        y: wp.y,
        ticks: 4,
      };
    } else if (canMove && wp.action === 5) {
      const hasS2 = (getMonsterPathRecord(mon.hcIdx).modeFlags & (1 << 9)) !== 0;
      ai.node7 = {
        mode: hasS2 ? 9 : MONMODE_NEUTRAL,
        x: wp.x,
        y: wp.y,
        ticks: 4,
      };
    }

    if (pts <= 0) {
      ai.nextAiFrame = currentFrame + 8;
    }
  }

  private findTargetPathUnit(
    ctx: AreaPathContext113c,
    targetUnitType: number,
    targetUnitId: number,
  ): PathUnit | null {
    if (targetUnitType === UNIT_MONSTER) {
      return ctx.monsters.get(targetUnitId)?.unit ?? null;
    }
    if (targetUnitType === UNIT_OBJECT) {
      return ctx.objects.get(targetUnitId) ?? null;
    }
    if (targetUnitType === UNIT_PLAYER) {
      return ctx.players.get(targetUnitId)?.unit ?? null;
    }
    return null;
  }
}
