/**
 * Diablo II v1.13c `D2Game.dll` per-frame act room loop (image base `0x6FC20000`).
 *
 * `GAME_UpdateActRooms113c` (`0x6FC4CBE0`) walks the active rooms of every act whose room list changed
 * (`pAct+0x54`), ticks each room seed, rolls the ambient wilderness spawn and populates every room that
 * has not been populated yet (`pRoom->dwFlags & 1`): preset units (`0x6FD01430`), `0x6FC400E0`, room
 * objects (`0x6FC4F0D0`) and random monster density (`REGPOP_PopulateRoomMonsters`, `0x6FC67A20`).
 *
 * Every function below is a 1:1 port of the cited `objdump -d -M intel` disassembly of `D2Game.dll`.
 * Callees that do not have a kernel port yet are reached through `ActRoomsCallees113c`, whose members
 * are all required: the caller wires either the kernel port or an explicit unported stand-in, so there is
 * no silent default.
 */
import { DRLG_GetActNoFromLevelId113c } from '../common/drlg/drlg.ts'
import {
  DUNGEON_AddClientToRoom113c,
  DUNGEON_CanFreeActiveRoom113c,
  DUNGEON_CheckRoomFlag2_113c,
  DUNGEON_FreeActiveRoom113c,
  DUNGEON_GetAdjacentRoomsListFromRoom113c,
  DUNGEON_GetLevelIdFromRoom113c,
  DUNGEON_GetRoomCoordinates113c,
  DUNGEON_GetRoomExFromRoom113c,
  DUNGEON_IsTownLevelId113c,
  DUNGEON_RemoveClientFromRoom113c,
  DUNGEON_SetRoomFlag2_113c,
  DUNGEON_SyncActiveRoomStatusChange113c,
  DUNGEON_UpdateRoomIdleCounter113c,
  DUNGEON_UpdateRoomLevelChange113c,
} from '../common/dungeon.ts'
import { D2COMMON_SGPT_DATATABLES_VA_113C } from '../common/inline-helpers.ts'
import { STATLIST_GetStatListFromUnitAndStateMemPort113c } from '../common/k0-d2common-memports.ts'
import { PATH_GetPosX113c, PATH_GetPosY113c } from '../common/path.ts'
import {
  STATES_CheckState113c,
  STATLIST_FreeStatListIfNonExtended113c,
  STATLIST_GetMaxLifeFromUnit113c,
  STATLIST_GetUnitStat113c,
  STATLIST_SetUnitStat113c,
  STATLIST_UnlinkSubList113c,
} from '../common/statlist.ts'
import {
  DATATBLS_GetObjectsTxtRecord113c,
  UNIT_GetAlignment113c,
  UNITROOM_RefreshUnit113c,
  UNITS_GetRoom113c,
  UNITS_SetUnitAnimMode113c,
} from '../common/unit.ts'
import type { Memory113c } from '../mem/sparse-memory.ts'
import { seedRoll } from '../prng.ts'
import { DATATBLS_GetLevelsTxtRecord113c } from '../tables/lvl-tbls-113c.ts'
import { NET_QueuePacketToClient113c } from '../net/packet-sink.ts'
import {
  SUNIT_GetServerUnit113c,
  SUNIT_InsertServerUnit113c,
  SUNIT_RemoveServerUnit113c,
} from './game-strc.ts'
import {
  D2GAME_IAT_SGPT_DATATABLES_VA_113C,
  MONSTER_ScheduleInitialAiEvent113c,
  MONSTER_SpawnAtCoords113c,
  REGPOP_FindPackSpawnCoords113c,
  REGPOP_PopulateRoomMonsters113c,
  SUNIT_AllocUnitData113c,
  SUNIT_PlaceServerUnitInRoom113c,
  type RegpopSpawnHooks113c,
} from './regpop-spawn-113c.ts'
import { OBJECTS_PopulateRoom113c, type ObjectsPopulateCallees113c } from './objects-populate-113c.ts'
import { ROOM_SpawnPresetUnits113c, type RoomPresetCallees113c } from './room-presets-113c.ts'
import {
  EVENT_DeleteEventByType113c,
  EVENT_GetNextEventFrame113c,
  EVENT_RemoveUnitEvents113c,
  EVENT_SetEventFull113c,
} from './timer-wheel.ts'
import { hitD2GameVa113c } from '../va-trace-113c.ts'

/** `pGame->pAct[5]` (`0x6FC4CC0B lea ebx, [edi+0xBC]`). */
const GAME_OFF_PACT_113C = 0xbc
/** `pGame->pMonReg[nLevelId]` (`0x6FC6785A mov eax, [edi+eax*4+0xF0]`). */
const GAME_OFF_PMONREG_113C = 0xf0
/** `pAct->bRoomListDirty` (`0x6FC4CC2A mov ecx, [eax+0x54]`, cleared at `0x6FC4CCEB`). */
const ACT_OFF_ROOMS_DIRTY_113C = 0x54
/** `pRoom->tSeed` (`0x6FC4CC4B lea ecx, [esi+0x6C]`). */
const ROOM_OFF_SEED_113C = 0x6c
/** `pRoom->dwFlags` (`0x6FC4CC93 mov al, [esi+0x34]`); bit 0 = populated. */
const ROOM_OFF_FLAGS_113C = 0x34
/** `pRoom->nNumClients` (`0x6FC4CC67 mov eax, [esi+0x78]`). */
const ROOM_OFF_NUM_CLIENTS_113C = 0x78
/** `pRoom->pRoomNext` (`0x6FC4CCDA mov esi, [esi+0x7C]`). */
const ROOM_OFF_NEXT_113C = 0x7c
/** `LevelsTxt` byte at `+0x2E` gating the ambient spawn (`0x6FC4CC7C mov cl, [eax+0x2E]`). */
const LEVELSTXT_OFF_AMBIENT_GATE_113C = 0x2e
/** `pMonReg->nAmbientSpawned` (`0x6FC67861 cmp dword [eax+0x2C4], 3`). */
const MONREG_OFF_AMBIENT_COUNT_113C = 0x2c4

/** Callees of the act room loop without a kernel port yet (all required, see file header). */
export interface ActRoomsCallees113c {
  /** `D2Game:0x6FC400E0` (`__stdcall(pGame, pRoom)`). */
  readonly refreshRoomUnits: (m: Memory113c, pGame: number, pRoom: number) => void
  /** Callees of `OBJECTS_PopulateRoom113c` (`0x6FC4F0D0`). */
  readonly objects: ObjectsPopulateCallees113c
  /** `D2Game:0x6FD0FDB0` (`ebx = 8`, `__stdcall(pUnit, 0)`), applied to an ambient spawn. */
  readonly initAmbientMonster: (m: Memory113c, pUnit: number) => void
  /** Callees of `ROOM_SpawnPresetUnits113c` (`0x6FD01430`). */
  readonly presets: RoomPresetCallees113c
  /** External callees of the ported `REGPOP_*` / `MONSTER_*` functions (`0x6FC67A20`, `0x6FC67450`, `0x6FD0F650`). */
  readonly regpop: RegpopSpawnHooks113c
}

/** Scratch "stack" for the out-parameters of the ported callees (outside every recorded heap range). */
let actRoomsStackPtr = 0x7fe00000

/**
 * `byte[5][2]` at `0x6FD2F3FC` (`first, count` per act, indexed by `LevelsTxt+0x03`) and `int[]` at
 * `0x6FD2F408` (ambient monster class ids), copied verbatim from `D2Game.dll` v1.13c.
 */
const AMBIENT_SPAWN_RANGES_6FD2F3FC: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
]
const AMBIENT_SPAWN_CLASSES_6FD2F408: readonly number[] = [270]

/** `D2Game:0x6FC21180` (`seedRoll`, diff-verified K0 port) on a `D2SeedStrc` in memory. */
function seedRollMem113c(m: Memory113c, pSeed: number, nMax: number): number {
  const seed = { lo: m.u32(pSeed >>> 0) >>> 0, hi: m.u32((pSeed + 4) >>> 0) >>> 0 }
  const r = seedRoll(seed, nMax)
  m.setU32((pSeed + 4) >>> 0, seed.hi >>> 0)
  m.setU32(pSeed >>> 0, seed.lo >>> 0)
  return r
}

/** `pSeed = pSeed * 0x6AC690C5 + carry` (`mul edx; add eax, hi; adc edx, 0`); returns the new low dword. */
function seedStep113c(m: Memory113c, pSeed: number): number {
  const lo = m.u32(pSeed >>> 0) >>> 0
  const hi = m.u32((pSeed + 4) >>> 0) >>> 0
  const prod = BigInt(lo) * 0x6ac690c5n + BigInt(hi)
  const newLo = Number(prod & 0xffffffffn) >>> 0
  const newHi = Number((prod >> 32n) & 0xffffffffn) >>> 0
  m.setU32((pSeed + 4) >>> 0, newHi)
  m.setU32(pSeed >>> 0, newLo)
  return newLo
}

/**
 * Ambient monster spawn (`eax = pLevelsTxt`, `ecx = pRoom`, `edx = pGame`, stack `pMonReg`, `ret 4`):
 * `nAct = LevelsTxt+0x03`; `nAct >= 5` returns. With `(first, count)` from `0x6FD2F3FC[nAct]` and
 * `count != 0`, picks `nClassId = 0x6FD2F408[first + roll(pRoom->tSeed, count)]` (`0x6FC21180`), probes a
 * spawn point with `0x6FC67450(pGame, pRoom, NULL, nClassId, &x, &y, 0)`, spawns with
 * `0x6FD0F650(nClassId, mode 1, pGame, pRoom, x, y, -1, 0)`, then calls `0x6FD0FDB0(pUnit, 0)` (`ebx = 8`) and
 * increments `pMonReg->nAmbientSpawned` (`+0x2C4`).
 *
 * @va D2Game:0x6FC67660 (153B)
 */
export function REGPOP_SpawnAmbientPack113c(
  m: Memory113c,
  pLevelsTxt: number,
  pRoom: number,
  pGame: number,
  pMonReg: number,
  callees: ActRoomsCallees113c,
): void {
  hitD2GameVa113c(0x6FC67660)
  const nAct = m.u8((pLevelsTxt + 3) >>> 0)
  if (nAct >= 5) return
  const range = AMBIENT_SPAWN_RANGES_6FD2F3FC[nAct]!
  const first = range[0]
  const count = range[1]
  if (count === 0) return
  const pSeed = pRoom !== 0 ? (pRoom + ROOM_OFF_SEED_113C) >>> 0 : 0
  const roll = seedRollMem113c(m, pSeed, count)
  const nClassId = AMBIENT_SPAWN_CLASSES_6FD2F408[(roll + first) | 0]!
  const sp = actRoomsStackPtr
  actRoomsStackPtr = (sp + 16) >>> 0
  try {
    const pX = sp
    const pY = (sp + 8) >>> 0
    if (REGPOP_FindPackSpawnCoords113c(m, pRoom, pGame, 0, nClassId, pX, pY, 0, callees.regpop) === 0) return
    const pUnit = MONSTER_SpawnAtCoords113c(
      m,
      nClassId,
      1,
      pGame,
      pRoom,
      m.u32(pX) | 0,
      m.u32(pY) | 0,
      -1,
      0,
      callees.regpop,
    )
    if (pUnit === 0) return
    callees.initAmbientMonster(m, pUnit)
    const pCount = (pMonReg + MONREG_OFF_AMBIENT_COUNT_113C) >>> 0
    m.setU32(pCount, ((m.u32(pCount) | 0) + 1) >>> 0)
  } finally {
    actRoomsStackPtr = sp
  }
}

/**
 * Ambient wilderness spawn roll (`ecx = pRoom`, `edi = pGame`, stack `(nLevelId, pLevelsTxt)`, `ret 8`):
 * steps `pRoom->tSeed`; if `lo % 100 < 3` (signed `jge` on the unsigned remainder) and
 * `pGame->pMonReg[nLevelId]->nAmbientSpawned < 3`, calls `0x6FC67660(pLevelsTxt, pRoom, pGame, pMonReg)`.
 *
 * @va D2Game:0x6FC67820 (89B)
 */
export function REGPOP_RollAmbientSpawn113c(
  m: Memory113c,
  pRoom: number,
  pGame: number,
  nLevelId: number,
  pLevelsTxt: number,
  callees: ActRoomsCallees113c,
): void {
  hitD2GameVa113c(0x6FC67820)
  const pSeed = pRoom !== 0 ? (pRoom + ROOM_OFF_SEED_113C) >>> 0 : 0
  const lo = seedStep113c(m, pSeed)
  if ((lo % 100 | 0) >= 3) return
  const pMonReg = m.u32((pGame + GAME_OFF_PMONREG_113C + Math.imul(nLevelId, 4)) >>> 0) >>> 0
  if ((m.u32((pMonReg + MONREG_OFF_AMBIENT_COUNT_113C) >>> 0) | 0) >= 3) return
  REGPOP_SpawnAmbientPack113c(m, pLevelsTxt, pRoom, pGame, pMonReg, callees)
}

/**
 * Per-room seed tick + ambient spawn gate (`esi = pRoom`, stack `pGame`, `ret 4`): steps `pRoom->tSeed`;
 * when `(lo & 0x7FFF) == 0` and the room has no clients, resolves `nLevelId` (`D2Common.#10826`) and its
 * `LevelsTxt` record (`D2Common.#10014`) and, if `LevelsTxt+0x2E != 0`, calls `0x6FC67820`.
 *
 * @va D2Game:0x6FC67950 (96B)
 */
export function ROOM_TickSeedAndAmbientSpawn113c(
  m: Memory113c,
  pRoom: number,
  pGame: number,
  callees: ActRoomsCallees113c,
): void {
  hitD2GameVa113c(0x6FC67950)
  const pSeed = pRoom !== 0 ? (pRoom + ROOM_OFF_SEED_113C) >>> 0 : 0
  const lo = seedStep113c(m, pSeed)
  if ((lo & 0x7fff) !== 0) return
  if (m.u32((pRoom + ROOM_OFF_NUM_CLIENTS_113C) >>> 0) !== 0) return
  const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom)
  const pLevelsTxt = DATATBLS_GetLevelsTxtRecord113c(m, nLevelId)
  if (m.u8((pLevelsTxt + LEVELSTXT_OFF_AMBIENT_GATE_113C) >>> 0) === 0) return
  if (((pLevelsTxt + 0x1c) >>> 0) === 0) return
  REGPOP_RollAmbientSpawn113c(m, pRoom, pGame, nLevelId, pLevelsTxt, callees)
}

/**
 * Per-frame act room loop (`eax = pGame`, plain `ret`). `pGame == NULL` asserts (line
 * `0xC0E`) and exits. For each of the 5 acts with `pAct->bRoomListDirty` set, walks the active room list
 * (`D2Common.#10717` returns `pAct+0x10`, rooms chained by `pRoom->pRoomNext`):
 * 1. step `pRoom->tSeed`; on `(lo & 0x7FFF) == 0` with no clients and `LevelsTxt+0x2E != 0` call
 *    `0x6FC67820` (inlined copy of `0x6FC67950`);
 * 2. if `pRoom->dwFlags & 1` is clear: `0x6FD01430`, `0x6FC400E0`, `0x6FC4F0D0`, `0x6FC67A20`, set the
 *    bit, then `D2Common.#10774(pRoom, 1)`; else if `D2Common.#10752(pRoom) == 0`: `0x6FC400E0` and
 *    `D2Common.#10774(pRoom, 1)`.
 * The dirty flag is cleared after the walk (also when the act has no active room).
 *
 * @va D2Game:0x6FC4CBE0 (304B)
 */
export function GAME_UpdateActRooms113c(m: Memory113c, pGame: number, callees: ActRoomsCallees113c): void {
  hitD2GameVa113c(0x6FC4CBE0)
  if (pGame === 0) {
    // 0x6FC4CBEA push 0xC0E; call Fog assert (empty file string 0x6FD19FF9); push -1; call exit
    throw new Error('GAME_UpdateActRooms113c: pGame == NULL (line 3086)')
  }
  for (let nAct = 0; nAct < 5; nAct++) {
    const ppAct = (pGame + GAME_OFF_PACT_113C + nAct * 4) >>> 0
    const pAct = m.u32(ppAct) >>> 0
    if (pAct === 0) continue
    if (m.u32((pAct + ACT_OFF_ROOMS_DIRTY_113C) >>> 0) === 0) continue
    let pRoom = DUNGEON_GetRoomExFromRoom113c(m, pAct) >>> 0
    while (pRoom !== 0) {
      const lo = seedStep113c(m, (pRoom + ROOM_OFF_SEED_113C) >>> 0)
      if ((lo & 0x7fff) === 0 && m.u32((pRoom + ROOM_OFF_NUM_CLIENTS_113C) >>> 0) === 0) {
        const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom)
        const pLevelsTxt = DATATBLS_GetLevelsTxtRecord113c(m, nLevelId)
        if (
          m.u8((pLevelsTxt + LEVELSTXT_OFF_AMBIENT_GATE_113C) >>> 0) !== 0 &&
          ((pLevelsTxt + 0x1c) >>> 0) !== 0
        ) {
          REGPOP_RollAmbientSpawn113c(m, pRoom, pGame, nLevelId, pLevelsTxt, callees)
        }
      }
      if ((m.u8((pRoom + ROOM_OFF_FLAGS_113C) >>> 0) & 1) === 0) {
        ROOM_SpawnPresetUnits113c(m, pGame, pRoom, callees.presets)
        callees.refreshRoomUnits(m, pGame, pRoom)
        OBJECTS_PopulateRoom113c(m, pGame, pRoom, callees.objects)
        REGPOP_PopulateRoomMonsters113c(m, pGame, pRoom, callees.regpop)
        const flags = m.u32((pRoom + ROOM_OFF_FLAGS_113C) >>> 0)
        m.setU32((pRoom + ROOM_OFF_FLAGS_113C) >>> 0, (flags | 1) >>> 0)
        DUNGEON_SetRoomFlag2_113c(m, pRoom, 1)
      } else if (DUNGEON_CheckRoomFlag2_113c(m, pRoom) === 0) {
        callees.refreshRoomUnits(m, pGame, pRoom)
        DUNGEON_SetRoomFlag2_113c(m, pRoom, 1)
      }
      pRoom = m.u32((pRoom + ROOM_OFF_NEXT_113C) >>> 0) >>> 0
    }
    m.setU32((m.u32(ppAct) + ACT_OFF_ROOMS_DIRTY_113C) >>> 0, 0)
  }
}

/**
 * `D2Game:0x6FCAA3E0` (`NET_QueuePacketToClient`): appends `pktBytes` to `pClient`'s `0x208`-byte
 * `D2PacketDataStrc` queue (`+0x1B8` head, `+0x1BC` tail, `+0x1C0` free list).
 */
function queueClientBytesActRooms113c(
  m: Memory113c,
  pClient: number,
  pktBytes: Uint8Array,
): void {
  NET_QueuePacketToClient113c(m, pClient >>> 0, pktBytes)
}

/**
 * `@va D2Game:0x6FD00D00` (`SUNIT_RelocateUnitToRoom`, `edx = pUnit`, `ecx = pRoom`, `eax = posY`, stack `(pGame, posX)`).
 */
function relocateSavedUnitToRoom113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  pRoom: number,
  posX: number,
  posY: number,
): void {
  void pGame
  if (pUnit === 0 || pRoom === 0) return
  const oldRoom = UNITS_GetRoom113c(m, pUnit) >>> 0
  if (oldRoom !== 0 && oldRoom !== (pRoom >>> 0)) {
    let prev = 0
    let cur = m.u32((oldRoom + 0x74) >>> 0) >>> 0
    while (cur !== 0) {
      const next = m.u32((cur + 0xe8) >>> 0) >>> 0
      if (cur === (pUnit >>> 0)) {
        if (prev === 0) {
          m.setU32((oldRoom + 0x74) >>> 0, next)
        } else {
          m.setU32((prev + 0xe8) >>> 0, next)
        }
        break
      }
      prev = cur
      cur = next
    }
  }

  const uType = m.u32(pUnit) >>> 0
  let pPath = m.u32((pUnit + 0x2c) >>> 0) >>> 0
  if (uType === 0 || uType === 1 || uType === 3) {
    if (pPath === 0) {
      pPath = m.alloc(0x200) >>> 0
      m.setU32((pUnit + 0x2c) >>> 0, pPath)
      m.setU32((pPath + 0x50) >>> 0, pUnit >>> 0)
    }
    m.setU16((pPath + 0x02) >>> 0, posX & 0xffff)
    m.setU16((pPath + 0x06) >>> 0, posY & 0xffff)
    m.setU16((pPath + 0x10) >>> 0, posX & 0xffff)
    m.setU16((pPath + 0x12) >>> 0, posY & 0xffff)
    m.setU32((pPath + 0x1c) >>> 0, pRoom >>> 0)
  } else {
    if (pPath === 0) {
      pPath = m.alloc(0x14) >>> 0
      m.setU32((pUnit + 0x2c) >>> 0, pPath)
    }
    m.setU32(pPath, pRoom >>> 0)
    m.setU32((pPath + 0x04) >>> 0, posX >>> 0)
    m.setU32((pPath + 0x08) >>> 0, posY >>> 0)
    m.setU32((pPath + 0x0c) >>> 0, posX >>> 0)
    m.setU32((pPath + 0x10) >>> 0, posY >>> 0)
  }

  if (oldRoom !== (pRoom >>> 0)) {
    m.setU32((pUnit + 0xe8) >>> 0, m.u32((pRoom + 0x74) >>> 0) >>> 0)
    m.setU32((pRoom + 0x74) >>> 0, pUnit >>> 0)
  }
  UNITROOM_RefreshUnit113c(m, pUnit)
}

function freeMemNodeAct113c(m: Memory113c, ptr: number): void {
  if (ptr === 0) return
  const candidate = m as unknown as { free?: (p: number) => void }
  if (typeof candidate.free === 'function') {
    candidate.free(ptr)
  }
}

/**
 * `@va D2Game:0x6FD012D0` (`SUNIT_AllocAndPlaceUnit`, `edx = dwUnitType`, `eax = dwClassId`, stack `(pGame, nMode, x, y)`).
 */
function allocAndPlaceSavedUnit113c(
  m: Memory113c,
  unitType: number,
  classId: number,
  animMode: number,
  pGame: number,
  pRoom: number,
  posX: number,
  posY: number,
): number {
  const pUnit = SUNIT_AllocUnitData113c(
    m,
    unitType,
    classId,
    posX,
    posY,
    pGame,
    pRoom,
    1,
    animMode,
    0,
  ) >>> 0
  if (pUnit === 0) return 0
  m.setU32((pUnit + 0x10) >>> 0, animMode >>> 0)
  if (SUNIT_GetServerUnit113c(m, pGame, unitType, m.u32((pUnit + 0x0c) >>> 0) >>> 0) === 0) {
    SUNIT_InsertServerUnit113c(m, pGame, pUnit)
  }
  if (UNITS_GetRoom113c(m, pUnit) === 0) {
    SUNIT_PlaceServerUnitInRoom113c(m, pRoom, posY, pUnit, posX, pGame, 0)
  }
  if (UNITS_GetRoom113c(m, pUnit) === 0) {
    relocateSavedUnitToRoom113c(m, pGame, pUnit, pRoom, posX, posY)
  }
  return pUnit
}

/**
 * Finds an inactive room node in `[pGame + 0xD8 + nAct * 4]` matching `(roomX, roomY)` (`0x6FC3E960(..., bAlloc=0)`).
 */
function findInactiveRoomNodeInAct113c(
  m: Memory113c,
  pGame: number,
  nAct: number,
  roomX: number,
  roomY: number,
): { pNode: number; pPrev: number } {
  if (pGame === 0 || (nAct >>> 0) >= 5) return { pNode: 0, pPrev: 0 }
  let pPrev = 0
  let pCur = m.u32((pGame + 0xd8 + nAct * 4) >>> 0) >>> 0
  while (pCur !== 0) {
    const curX = m.u32(pCur) | 0
    if (roomX > curX) break
    if (roomX === curX && roomY === (m.u32((pCur + 0x04) >>> 0) | 0)) {
      return { pNode: pCur, pPrev }
    }
    pPrev = pCur
    pCur = m.u32((pCur + 0x14) >>> 0) >>> 0
  }
  return { pNode: 0, pPrev: 0 }
}

/**
 * `@va D2Game:0x6FC3FB90` (`MONSTER_RestoreSavedMonstersInRoom`, `eax = pGame`, `[esp+4] = pRoom`).
 */
function restoreSavedMonstersInRoom113c(m: Memory113c, pGame: number, pRoom: number): void {
  if (pGame === 0 || pRoom === 0) return
  const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom)
  const nAct = DRLG_GetActNoFromLevelId113c(m, nLevelId) & 0xff
  if (nAct >= 5) return

  const sp = actRoomsStackPtr
  actRoomsStackPtr = (sp + 0x20) >>> 0
  try {
    DUNGEON_GetRoomCoordinates113c(m, pRoom, sp)
    const roomX = m.u32(sp) | 0
    const roomY = m.u32((sp + 0x04) >>> 0) | 0
    const { pNode: pRoomNode } = findInactiveRoomNodeInAct113c(m, pGame, nAct, roomX, roomY)
    if (pRoomNode === 0) return

    let pMon = m.u32((pRoomNode + 0x0c) >>> 0) >>> 0
    m.setU32((pRoomNode + 0x0c) >>> 0, 0)
    const bChaosSealsCleared =
      nLevelId === 0x6c &&
      m.u32((pGame + 0x10f4) >>> 0) !== 0 &&
      (m.u8((m.u32((pGame + 0x10f4) >>> 0) + 0x14) >>> 0) & 1) !== 0
        ? 1
        : 0

    while (pMon !== 0) {
      const pNext = m.u32((pMon + 0x58) >>> 0) >>> 0
      const posX = m.u32(pMon) | 0
      const posY = m.u32((pMon + 0x04) >>> 0) | 0
      const nClassId = m.u32((pMon + 0x08) >>> 0) | 0
      const dwSavedGuid = m.u32((pMon + 0x0c) >>> 0) >>> 0
      const dwFlags10 = m.u32((pMon + 0x10) >>> 0) >>> 0
      const dwFlags14 = m.u32((pMon + 0x14) >>> 0) >>> 0
      const dwFlags18 = m.u32((pMon + 0x18) >>> 0) >>> 0
      const nAnimMode = (dwFlags18 & 0x04) !== 0 ? 0x0c : 1

      if (nAnimMode !== 0x0c && bChaosSealsCleared !== 0 && nClassId !== 0xf3) {
        const pCmdChain = m.u32((pMon + 0x24) >>> 0) >>> 0
        if (pCmdChain !== 0) freeMemNodeAct113c(m, pCmdChain)
        freeMemNodeAct113c(m, pMon)
        pMon = pNext
        continue
      }

      if ((dwFlags14 & 0x0100) !== 0) {
        const pExisting = SUNIT_GetServerUnit113c(m, pGame, 1, dwSavedGuid)
        if (pExisting !== 0) {
          relocateSavedUnitToRoom113c(m, pGame, pExisting, pRoom, posX, posY)
        }
        let pExtra = m.u32((pMon + 0x20) >>> 0) >>> 0
        while (pExtra !== 0) {
          const pExtraNext = m.u32((pExtra + 0x04) >>> 0) >>> 0
          freeMemNodeAct113c(m, pExtra)
          pExtra = pExtraNext
        }
      } else {
        const skipBoss =
          (dwFlags18 & 0x0400) !== 0 && ((dwFlags18 & 0x0100) !== 0 || (dwFlags18 & 0x80) !== 0)
        if (!skipBoss) {
          const wSpawnFlags = (dwFlags18 & 0x40) !== 0 ? 0x6a : 0x62
          let pSpawned = MONSTER_SpawnAtCoords113c(
            m,
            nClassId,
            nAnimMode,
            pGame,
            pRoom,
            posX,
            posY,
            -1,
            wSpawnFlags,
            {},
          )
          if (pSpawned === 0) {
            pSpawned = MONSTER_SpawnAtCoords113c(
              m,
              nClassId,
              nAnimMode,
              pGame,
              pRoom,
              posX,
              posY,
              5,
              wSpawnFlags,
              {},
            )
          }
          if (pSpawned !== 0) {
            const savedExp = m.u32((pMon + 0x40) >>> 0) | 0
            const savedMaxHp = m.u32((pMon + 0x44) >>> 0) | 0
            const savedCurHp = m.u32((pMon + 0x48) >>> 0) | 0
            const savedFrame = m.u32((pMon + 0x54) >>> 0) >>> 0
            const curGameFrame = m.u32((pGame + 0xa8) >>> 0) >>> 0
            STATLIST_SetUnitStat113c(m, pSpawned, 0x0d, savedExp, 0)
            if (savedMaxHp > 0) {
              STATLIST_SetUnitStat113c(m, pSpawned, 0x07, savedMaxHp, 0)
              const restoredHp =
                ((curGameFrame - savedFrame) >>> 0) >= 0x1d4c ? savedMaxHp : savedCurHp
              STATLIST_SetUnitStat113c(m, pSpawned, 0x06, restoredHp, 0)
            }
            const pMonData = m.u32((pSpawned + 0x14) >>> 0) >>> 0
            if (pMonData !== 0) {
              for (let k = 0; k < 9; k++) {
                m.setU8((pMonData + 0x1c + k) >>> 0, m.u8((pMon + 0x32 + k) >>> 0))
              }
            }
            if ((dwFlags14 & 0x0200) !== 0) {
              m.setU32((pSpawned + 0xc8) >>> 0, (m.u32((pSpawned + 0xc8) >>> 0) | 0x0200) >>> 0)
            }
            const curUnitFlags = m.u32((pSpawned + 0xc4) >>> 0) >>> 0
            m.setU32(
              (pSpawned + 0xc4) >>> 0,
              (curUnitFlags | (dwFlags10 & 0x20000) | 0x03000000) >>> 0,
            )
          }
        }
      }

      const pSaveDesc = m.u32((pMon + 0x24) >>> 0) >>> 0
      if (pSaveDesc !== 0) {
        freeMemNodeAct113c(m, pSaveDesc)
      }
      freeMemNodeAct113c(m, pMon)
      pMon = pNext
    }
  } finally {
    actRoomsStackPtr = sp
  }
}

/**
 * `@va D2Game:0x6FC400E0` (`ROOM_RefreshUnitsAndLoadSaved`, `__stdcall(pGame, pRoom)`, `739B`).
 *
 * Exact binary sequence (`0x6FC400E0..0x6FC403C2`):
 * 1. Calls `0x6FC3FB90(pGame, pRoom)` to restore saved `0x5C`-byte monster nodes from `[pRoomNode + 0x0C]`.
 * 2. Calls `0x6FC3EA40(pRoom, pGame, &pSavedUnits, &pSavedItems)` to unlink the `0x18`-byte inactive room node
 *    from `[pGame + 0xD8 + nAct * 4]`, extracting `pSavedUnits = [pRoomNode + 0x10]` and `pSavedItems = [pRoomNode + 0x08]`.
 * 3. Calls `0x6FC3FB40(pSavedItems, pGame, pRoom)` to restore non-expired saved ground item nodes (`dwGameFrame <= dwExpire`)
 *    and free every node in `pSavedItems`.
 * 4. Walks `pSavedUnits` (`0x34`-byte nodes chained via `+0x30`):
 *    - `(flags1C & 0x100) != 0`: resolves existing server unit via `0x6FD003A0`, relocates via `0x6FD00D00`,
 *      sets `dwFlags |= 0x10`, sets player corpse `animMode = 0x11` (asserting line `0x157` if `!= 0x11`) or
 *      object `pObjData[+0x04] = node[+0x28]`, and frees `node`.
 *    - `(flags1C & 0x100) == 0`: allocates and places unit via `0x6FD012D0` when `unitType != 1`; for objects
 *      (`unitType == 2`, asserting line `0x171` if NULL): restores Shrine recharge `Event 5` + `pObjData[+0x04]`
 *      (`ObjectsTxt[+0x167] & 0x01`), Well offline charge regeneration + `Event 2` recharge ticks
 *      (`ObjectsTxt[+0x167] & 0x20`, asserting line `0x18C` if `dwParm[0] == 0`), or generic object state
 *      (`pObjData[+0x04] = node[+0x28]`, `pUnit[+0x78] = node[+0x24]`, optional `pUnit[+0xB8] = node[+0x2C]`),
 *      then frees `node`.
 */
export function ROOM_RefreshUnitsAndLoadSaved113c(
  m: Memory113c,
  pGame: number,
  pRoom: number,
): void {
  hitD2GameVa113c(0x6FC400E0)
  if (pGame === 0 || pRoom === 0) return

  // 1. 0x6FC400F2: call 0x6FC3FB90 (restore saved monsters)
  restoreSavedMonstersInRoom113c(m, pGame, pRoom)

  // 2. 0x6FC4010F: call 0x6FC3EA40 (unlink inactive room node & extract +0x10 saved units / +0x08 saved items)
  const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom)
  const nAct = DRLG_GetActNoFromLevelId113c(m, nLevelId) & 0xff
  if (nAct >= 5) return

  let pSavedUnits = 0
  let pSavedItems = 0
  const sp = actRoomsStackPtr
  actRoomsStackPtr = (sp + 0x20) >>> 0
  try {
    DUNGEON_GetRoomCoordinates113c(m, pRoom, sp)
    const roomX = m.u32(sp) | 0
    const roomY = m.u32((sp + 0x04) >>> 0) | 0
    const { pNode: pRoomNode, pPrev } = findInactiveRoomNodeInAct113c(m, pGame, nAct, roomX, roomY)
    if (pRoomNode !== 0) {
      const pNextRoomNode = m.u32((pRoomNode + 0x14) >>> 0) >>> 0
      if (pPrev !== 0) {
        m.setU32((pPrev + 0x14) >>> 0, pNextRoomNode)
      } else {
        m.setU32((pGame + 0xd8 + nAct * 4) >>> 0, pNextRoomNode)
      }
      pSavedUnits = m.u32((pRoomNode + 0x10) >>> 0) >>> 0
      pSavedItems = m.u32((pRoomNode + 0x08) >>> 0) >>> 0
      freeMemNodeAct113c(m, pRoomNode)
    }
  } finally {
    actRoomsStackPtr = sp
  }

  // 3. 0x6FC40119: call 0x6FC3FB40 (restore non-expired saved ground items & free item save nodes)
  const curGameFrame = m.u32((pGame + 0xa8) >>> 0) | 0
  while (pSavedItems !== 0) {
    const pNextItem = m.u32(pSavedItems) >>> 0
    const dwExpireFrame = m.u32((pSavedItems + 0x04) >>> 0) | 0
    if (dwExpireFrame === 0 || curGameFrame <= dwExpireFrame) {
      const savedItemGuid = m.u32((pSavedItems + 0x08) >>> 0) >>> 0
      if (savedItemGuid !== 0) {
        const pItem = SUNIT_GetServerUnit113c(m, pGame, 4, savedItemGuid)
        if (pItem !== 0) {
          const itemX = m.u16((pSavedItems + 0x0c) >>> 0)
          const itemY = m.u16((pSavedItems + 0x0e) >>> 0)
          relocateSavedUnitToRoom113c(m, pGame, pItem, pRoom, itemX, itemY)
        }
      }
    }
    freeMemNodeAct113c(m, pSavedItems)
    pSavedItems = pNextItem
  }

  // 4. 0x6FC4011E..0x6FC40385: walk 0x34-byte saved unit nodes along +0x30
  let pNode = pSavedUnits
  while (pNode !== 0) {
    const posX = m.u32(pNode) | 0
    const posY = m.u32((pNode + 0x04) >>> 0) | 0
    const unitType = m.u32((pNode + 0x08) >>> 0) >>> 0
    const classId = m.u32((pNode + 0x0c) >>> 0) | 0
    const animMode = m.u32((pNode + 0x10) >>> 0) | 0
    const savedFrame = m.u32((pNode + 0x14) >>> 0) | 0
    const flags1C = m.u32((pNode + 0x1c) >>> 0) >>> 0
    const pNext = m.u32((pNode + 0x30) >>> 0) >>> 0

    if ((flags1C & 0x0100) !== 0) {
      // 0x6FC4014B..0x6FC401B6: existing server unit relocation (player corpse / portal)
      const dwGuid = m.u32((pNode + 0x20) >>> 0) >>> 0
      const pExisting = SUNIT_GetServerUnit113c(m, pGame, unitType, dwGuid)
      if (pExisting !== 0) {
        relocateSavedUnitToRoom113c(m, pGame, pExisting, pRoom, posX, posY)
        m.setU32((pExisting + 0xc4) >>> 0, (m.u32((pExisting + 0xc4) >>> 0) | 0x10) >>> 0)
        if (unitType === 0) {
          if (animMode !== 0x11) {
            throw new Error('ROOM_RefreshUnitsAndLoadSaved113c: player corpse animMode != 0x11 (line 343)')
          }
          UNITS_SetUnitAnimMode113c(m, pExisting, 0x11)
        } else if (unitType === 2) {
          const pObjData = m.u32((pExisting + 0x14) >>> 0) >>> 0
          if (pObjData !== 0) {
            m.setU8((pObjData + 0x04) >>> 0, m.u8((pNode + 0x28) >>> 0))
          }
        }
      }
      freeMemNodeAct113c(m, pNode)
      pNode = pNext
      continue
    }

    // 0x6FC401BB..0x6FC40369: fresh unit allocation & object state restoration
    let pUnit = 0
    if (unitType !== 1) {
      pUnit = allocAndPlaceSavedUnit113c(m, unitType, classId, animMode, pGame, pRoom, posX, posY)
    }
    if (unitType === 2) {
      if (pUnit === 0) {
        throw new Error('ROOM_RefreshUnitsAndLoadSaved113c: failed to spawn saved object (line 369)')
      }
      const hcIdx = m.u32((pUnit + 0x04) >>> 0) | 0
      const pObjTxt = DATATBLS_GetObjectsTxtRecord113c(m, hcIdx) >>> 0
      const subClass = pObjTxt !== 0 ? m.u8((pObjTxt + 0x167) >>> 0) : 0

      if ((subClass & 0x01) !== 0 && savedFrame !== 0) {
        // 0x6FC40203..0x6FC40252: Shrine recharge timer (`Event 5`) + `bShrineId` (`+0x04`)
        const targetFrame = ((m.u16((pNode + 0x20) >>> 0) << 16) | m.u16((pNode + 0x24) >>> 0)) | 0
        if (targetFrame > 0) {
          const gameFrame = m.u32((pGame + 0xa8) >>> 0) | 0
          const fireFrame = targetFrame > gameFrame ? targetFrame : ((gameFrame + 1) | 0)
          EVENT_SetEventFull113c(m, pGame, pUnit, 5, fireFrame >>> 0, 0, 0, 0)
        }
        const shrineId = m.u8((pNode + 0x28) >>> 0)
        const pObjData = m.u32((pUnit + 0x14) >>> 0) >>> 0
        if (pObjData !== 0) {
          m.setU8((pObjData + 0x04) >>> 0, shrineId)
        }
      } else if ((subClass & 0x20) !== 0) {
        // 0x6FC40257..0x6FC4034B: Well offline charge regeneration + `Event 2` recharge schedule
        const maxCharges = ((m.u8((pObjTxt + 0x180) >>> 0) << 1) & 0xff) >>> 0
        let charges = m.u8((pNode + 0x28) >>> 0) >>> 0
        if (charges < maxCharges) {
          const regenRate = m.u32((pObjTxt + 0x178) >>> 0) | 0
          if (regenRate === 0) {
            throw new Error('ROOM_RefreshUnitsAndLoadSaved113c: well dwParm[0] == 0 (line 396)')
          }
          const gameFrame = m.u32((pGame + 0xa8) >>> 0) | 0
          let skipSchedule = false
          if (savedFrame < ((gameFrame + regenRate) | 0)) {
            let addTicks = Math.trunc(((gameFrame - savedFrame) | 0) / regenRate)
            if (addTicks >= 1) addTicks = 1
            charges = ((charges + addTicks) & 0xff) >>> 0
            if (charges > maxCharges) charges = maxCharges
            const parm0Dword = m.u32((pObjTxt + 0x180) >>> 0) | 0
            const stage = parm0Dword !== 0 ? Math.trunc(charges / parm0Dword) : 2
            const newMode = (2 - stage) >>> 0
            m.setU32((pUnit + 0x10) >>> 0, newMode)
            if (newMode > 2) {
              m.setU32((pUnit + 0x10) >>> 0, 0)
              const pObjData = m.u32((pUnit + 0x14) >>> 0) >>> 0
              if (pObjData !== 0) {
                m.setU8((pObjData + 0x04) >>> 0, maxCharges & 0xff)
              }
              skipSchedule = true
            }
          }
          if (!skipSchedule) {
            const pObjData = m.u32((pUnit + 0x14) >>> 0) >>> 0
            if (pObjData !== 0) {
              m.setU8((pObjData + 0x04) >>> 0, charges & 0xff)
            }
            if (charges < maxCharges) {
              const missing = (maxCharges - charges) | 0
              let stepOffset = regenRate
              for (let i = 0; i < missing; i++) {
                const curFrameNow = m.u32((pGame + 0xa8) >>> 0) | 0
                EVENT_SetEventFull113c(
                  m,
                  pGame,
                  pUnit,
                  2,
                  ((curFrameNow + stepOffset) | 0) >>> 0,
                  0,
                  0,
                  0,
                )
                stepOffset = (stepOffset + regenRate) | 0
              }
            }
          }
        }
      } else {
        // 0x6FC4034D..0x6FC40369: Generic object restore
        const pObjData = m.u32((pUnit + 0x14) >>> 0) >>> 0
        if (pObjData !== 0) {
          m.setU8((pObjData + 0x04) >>> 0, m.u8((pNode + 0x28) >>> 0))
        }
        m.setU8((pUnit + 0x78) >>> 0, m.u8((pNode + 0x24) >>> 0))
        const interactType = m.u32((pNode + 0x2c) >>> 0) >>> 0
        if (interactType !== 0) {
          m.setU32((pUnit + 0xb8) >>> 0, interactType)
        }
      }
    }

    freeMemNodeAct113c(m, pNode)
    pNode = pNext
  }
}

/**
 * `@va D2Game:0x6FCBD950` (`ROOM_WakeRoomMonsters`, `eax = pRoom`, `esi = pGame`).
 *
 * Walks `pRoom->pUnitFirst (+0x74)` via `pRoomUnitNext (+0xE8)`; for every monster (`dwUnitType == 1`),
 * schedules its initial AI event via `0x6FCCF920` (`MONSTER_ScheduleInitialAiEvent113c`).
 */
export function ROOM_WakeRoomMonsters113c(
  m: Memory113c,
  pRoom: number,
  pGame: number,
): void {
  hitD2GameVa113c(0x6FCBD950)
  let pUnit = m.u32((pRoom + 0x74) >>> 0) >>> 0
  while (pUnit !== 0) {
    const uType = m.u32(pUnit) >>> 0
    if (uType === 1) {
      MONSTER_ScheduleInitialAiEvent113c(m, pGame, pUnit)
    }
    pUnit = m.u32((pUnit + 0xe8) >>> 0) >>> 0
  }
}

/**
 * `@va D2Game:0x6FCBD8E0` (`ROOM_SleepRoomMonsters`, `eax = pRoom`, `ecx = pGame`).
 *
 * Walks `pRoom->pUnitFirst (+0x74)` via `pRoomUnitNext (+0xE8)`; for every monster (`dwUnitType == 1`),
 * removes event types `2` (`MON_EVENT_AI_THINK`) and `3` from `pUnit->pEventFirst (+0xDC)`.
 */
export function ROOM_SleepRoomMonsters113c(
  m: Memory113c,
  pRoom: number,
  pGame: number,
): void {
  hitD2GameVa113c(0x6FCBD8E0)
  let pUnit = m.u32((pRoom + 0x74) >>> 0) >>> 0
  while (pUnit !== 0) {
    const uType = m.u32(pUnit) >>> 0
    if (uType === 1) {
      EVENT_DeleteEventByType113c(m, pGame, pUnit, 2)
      EVENT_DeleteEventByType113c(m, pGame, pUnit, 3)
    }
    pUnit = m.u32((pUnit + 0xe8) >>> 0) >>> 0
  }
}

/**
 * `@va D2Game:0x6FCBDC10` (`ROOM_ActivateRoomForClient`, `ebx = pClient`, `eax = pRoom`, `__stdcall(pPlayer)`).
 *
 * 1. Adds `pClient` to `pRoom` via `D2Common.#10879` (`DUNGEON_AddClientToRoom113c`), and if
 *    `pRoom->nNumClients (+0x78) <= 1`, wakes all monsters in `pRoom` via `0x6FCBD950`.
 * 2. When `pClient->dwClientState (+0x04) == 4` (in-game), queues `0x07` (`AddRoom`: `[0x07, u16 tileX, u16 tileY, u8 levelId]`, `6B`)
 *    onto `pClient`'s `0x6FCAA3E0` S2C buffer list.
 */
export function ROOM_ActivateRoomForClient113c(
  m: Memory113c,
  pClient: number,
  pRoom: number,
  pPlayer = 0,
): void {
  hitD2GameVa113c(0x6FCBDC10)
  if (pRoom === 0 || pClient === 0) return
  DUNGEON_AddClientToRoom113c(m, pRoom, pClient)
  if ((m.u32((pRoom + 0x78) >>> 0) >>> 0) <= 1) {
    const pGame =
      pPlayer !== 0
        ? ((m.u32((pPlayer + 0x80) >>> 0) || m.u32((pPlayer + 0x84) >>> 0)) >>> 0)
        : 0
    if (pGame !== 0) {
      ROOM_WakeRoomMonsters113c(m, pRoom, pGame)
    }
  }
  if (m.u32((pClient + 0x04) >>> 0) === 4) {
    const sp = actRoomsStackPtr
    actRoomsStackPtr = (sp + 0x20) >>> 0
    try {
      DUNGEON_GetRoomCoordinates113c(m, pRoom, sp)
      const tileX = m.u16((sp + 0x10) >>> 0)
      const tileY = m.u16((sp + 0x14) >>> 0)
      const levelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom) & 0xff
      const pkt = new Uint8Array(6)
      pkt[0] = 0x07
      pkt[1] = tileX & 0xff
      pkt[2] = (tileX >>> 8) & 0xff
      pkt[3] = tileY & 0xff
      pkt[4] = (tileY >>> 8) & 0xff
      pkt[5] = levelId
      queueClientBytesActRooms113c(m, pClient, pkt)
    } finally {
      actRoomsStackPtr = sp
    }
  }
}

/**
 * `@va D2Game:0x6FCBD980` (`ROOM_DeactivateRoomForClient`, `edi = pRoom`, `__stdcall(pPlayer, pClient)`).
 *
 * 1. When `pClient->dwClientState (+0x04) == 4`, sends `0x0A` (`RemoveUnit`: `[0x0A, u8 unitType, u32 unitId]`, `6B`)
 *    for every non-missile (`dwUnitType != 3`) unit in `pRoom->pUnitFirst (+0x74)`.
 * 2. Removes `pClient` from `pRoom` via `D2Common.#10144` (`DUNGEON_RemoveClientFromRoom113c`), and if
 *    `pRoom->nNumClients (+0x78) == 0`, sleeps all monsters in `pRoom` via `0x6FCBD8E0`.
 * 3. Sends `0x08` (`RemoveRoom`: `[0x08, u16 tileX, u16 tileY, u8 levelId]`, `6B`) via `0x6FCAA3E0`.
 */
export function ROOM_DeactivateRoomForClient113c(
  m: Memory113c,
  pRoom: number,
  pPlayer: number,
  pClient: number,
): void {
  hitD2GameVa113c(0x6FCBD980)
  if (pRoom === 0 || pClient === 0) return
  const sendPackets = m.u32((pClient + 0x04) >>> 0) === 4
  if (sendPackets) {
    const pkt0A = new Uint8Array(6)
    pkt0A[0] = 0x0a
    let pUnit = m.u32((pRoom + 0x74) >>> 0) >>> 0
    while (pUnit !== 0) {
      const uType = m.u8(pUnit) & 0xff
      if (uType !== 3) {
        const uId = m.u32((pUnit + 0x0c) >>> 0) >>> 0
        pkt0A[1] = uType
        pkt0A[2] = uId & 0xff
        pkt0A[3] = (uId >>> 8) & 0xff
        pkt0A[4] = (uId >>> 16) & 0xff
        pkt0A[5] = (uId >>> 24) & 0xff
        queueClientBytesActRooms113c(m, pClient, pkt0A)
      }
      pUnit = m.u32((pUnit + 0xe8) >>> 0) >>> 0
    }
  }

  DUNGEON_RemoveClientFromRoom113c(m, pRoom, pClient)
  if ((m.u32((pRoom + 0x78) >>> 0) >>> 0) === 0) {
    const pGame =
      pPlayer !== 0
        ? ((m.u32((pPlayer + 0x80) >>> 0) || m.u32((pPlayer + 0x84) >>> 0)) >>> 0)
        : 0
    if (pGame !== 0) {
      ROOM_SleepRoomMonsters113c(m, pRoom, pGame)
    }
  }

  if (sendPackets) {
    const sp = actRoomsStackPtr
    actRoomsStackPtr = (sp + 0x20) >>> 0
    try {
      DUNGEON_GetRoomCoordinates113c(m, pRoom, sp)
      const tileX = m.u16((sp + 0x10) >>> 0)
      const tileY = m.u16((sp + 0x14) >>> 0)
      const levelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom) & 0xff
      const pkt08 = new Uint8Array(6)
      pkt08[0] = 0x08
      pkt08[1] = tileX & 0xff
      pkt08[2] = (tileX >>> 8) & 0xff
      pkt08[3] = tileY & 0xff
      pkt08[4] = (tileY >>> 8) & 0xff
      pkt08[5] = levelId
      queueClientBytesActRooms113c(m, pClient, pkt08)
    } finally {
      actRoomsStackPtr = sp
    }
  }
}

/**
 * `@va D2Game:0x6FC6B1D0` (`CLIENTS_SetPlayerCurrentRoom`, `esi = pClient`, `__stdcall(pNewRoom)`).
 *
 * 1. If `pClient == 0 || pClient->pPlayer (+0x1A8) == 0` or `pClient->pRoom (+0x1B4) == pNewRoom`, returns.
 * 2. Calls `D2Common.#10622` (`DUNGEON_SyncActiveRoomStatusChange113c(m, pOldRoom, pNewRoom)`) and
 *    `D2Common.#10043` (`DUNGEON_UpdateRoomLevelChange113c(m, pOldRoom, pNewRoom)`).
 * 3. Fetches `ppNewNear[0..nNew)` and `ppOldNear[0..nOld)` via `D2Common.#10688` (`DUNGEON_GetAdjacentRoomsListFromRoom113c`).
 * 4. For each room in `ppNewNear` not in `ppOldNear`, calls `0x6FCBDC10` (`ROOM_ActivateRoomForClient113c`).
 * 5. For each room in `ppOldNear` not in `ppNewNear`, calls `0x6FCBD980` (`ROOM_DeactivateRoomForClient113c`).
 * 6. Sets `pClient->pRoom (+0x1B4) = pNewRoom`.
 */
export function CLIENTS_SetPlayerCurrentRoom113c(
  m: Memory113c,
  pClient: number,
  pNewRoom: number,
): void {
  hitD2GameVa113c(0x6FC6B1D0)
  if (pClient === 0) return
  const pPlayer = (m.u32((pClient + 0x174) >>> 0) || m.u32((pClient + 0x1a8) >>> 0)) >>> 0
  if (pPlayer === 0) return
  const pOldRoom = m.u32((pClient + 0x1b4) >>> 0) >>> 0
  if (pOldRoom === (pNewRoom >>> 0)) return

  DUNGEON_SyncActiveRoomStatusChange113c(m, pOldRoom, pNewRoom)
  DUNGEON_UpdateRoomLevelChange113c(m, pOldRoom, pNewRoom)

  const sp = actRoomsStackPtr
  actRoomsStackPtr = (sp + 0x20) >>> 0
  try {
    let ppNew = 0
    let nNew = 0
    if (pNewRoom !== 0) {
      DUNGEON_GetAdjacentRoomsListFromRoom113c(m, pNewRoom, sp, (sp + 0x04) >>> 0)
      ppNew = m.u32(sp) >>> 0
      nNew = m.u32((sp + 0x04) >>> 0) | 0
    }
    let ppOld = 0
    let nOld = 0
    if (pOldRoom !== 0) {
      DUNGEON_GetAdjacentRoomsListFromRoom113c(m, pOldRoom, (sp + 0x08) >>> 0, (sp + 0x0c) >>> 0)
      ppOld = m.u32((sp + 0x08) >>> 0) >>> 0
      nOld = m.u32((sp + 0x0c) >>> 0) | 0
    }

    for (let i = 0; i < nNew; i++) {
      const rNew = m.u32((ppNew + i * 4) >>> 0) >>> 0
      let inOld = false
      for (let j = 0; j < nOld; j++) {
        if ((m.u32((ppOld + j * 4) >>> 0) >>> 0) === rNew) {
          inOld = true
          break
        }
      }
      if (!inOld) {
        ROOM_ActivateRoomForClient113c(m, pClient, rNew, pPlayer)
      }
    }

    for (let j = 0; j < nOld; j++) {
      const rOld = m.u32((ppOld + j * 4) >>> 0) >>> 0
      let inNew = false
      for (let i = 0; i < nNew; i++) {
        if ((m.u32((ppNew + i * 4) >>> 0) >>> 0) === rOld) {
          inNew = true
          break
        }
      }
      if (!inNew) {
        ROOM_DeactivateRoomForClient113c(m, rOld, pPlayer, pClient)
      }
    }

    m.setU32((pClient + 0x1b4) >>> 0, pNewRoom >>> 0)
  } finally {
    actRoomsStackPtr = sp
  }
}

function resolveSgptDataTablesActRooms113c(m: Memory113c): number {
  const iatVal = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C) >>> 0
  if (iatVal !== 0) {
    const deref = m.u32(iatVal) >>> 0
    if (deref !== 0 && m.u32((deref + 0xa80) >>> 0) !== 0) {
      return deref
    }
    if (m.u32((iatVal + 0xa80) >>> 0) !== 0) {
      return iatVal
    }
  }
  return m.u32(D2COMMON_SGPT_DATATABLES_VA_113C) >>> 0
}

function getUnitCoordsActRooms113c(m: Memory113c, pUnit: number): { x: number; y: number } {
  const uType = m.u32(pUnit) >>> 0
  const pPath = m.u32((pUnit + 0x2c) >>> 0) >>> 0
  if (pPath === 0) return { x: 0, y: 0 }
  if (uType === 2 || uType === 4 || uType === 5) {
    return {
      x: m.u32((pPath + 0x0c) >>> 0) | 0,
      y: m.u32((pPath + 0x10) >>> 0) | 0,
    }
  }
  return {
    x: PATH_GetPosX113c(m, pPath) | 0,
    y: PATH_GetPosY113c(m, pPath) | 0,
  }
}

function unlinkUnitFromRoomListActRooms113c(m: Memory113c, pRoom: number, pUnit: number): void {
  if (pRoom === 0 || pUnit === 0) return
  let prev = 0
  let cur = m.u32((pRoom + 0x74) >>> 0) >>> 0
  while (cur !== 0) {
    const next = m.u32((cur + 0xe8) >>> 0) >>> 0
    if (cur === (pUnit >>> 0)) {
      if (prev === 0) {
        m.setU32((pRoom + 0x74) >>> 0, next)
      } else {
        m.setU32((prev + 0xe8) >>> 0, next)
      }
      m.setU32((pUnit + 0xe8) >>> 0, 0)
      break
    }
    prev = cur
    cur = next
  }
  const pPath = m.u32((pUnit + 0x2c) >>> 0) >>> 0
  if (pPath !== 0) {
    const uType = m.u32(pUnit) >>> 0
    if (uType === 2 || uType === 4 || uType === 5) {
      m.setU32(pPath, 0)
    } else {
      m.setU32((pPath + 0x1c) >>> 0, 0)
    }
  }
}

function findOrAllocInactiveRoomNodeInAct113c(
  m: Memory113c,
  pGame: number,
  nAct: number,
  roomX: number,
  roomY: number,
): number {
  if (pGame === 0 || (nAct >>> 0) >= 5) return 0
  let pPrev = 0
  let pCur = m.u32((pGame + 0xd8 + nAct * 4) >>> 0) >>> 0
  while (pCur !== 0) {
    const curX = m.u32(pCur) | 0
    const curY = m.u32((pCur + 0x04) >>> 0) | 0
    if (roomX === curX && roomY === curY) {
      return pCur
    }
    if (roomX > curX) {
      break
    }
    pPrev = pCur
    pCur = m.u32((pCur + 0x14) >>> 0) >>> 0
  }
  const pNew = m.alloc(0x18) >>> 0
  m.setU32(pNew, roomX >>> 0)
  m.setU32((pNew + 0x04) >>> 0, roomY >>> 0)
  m.setU32((pNew + 0x08) >>> 0, 0)
  m.setU32((pNew + 0x0c) >>> 0, 0)
  m.setU32((pNew + 0x10) >>> 0, 0)
  m.setU32((pNew + 0x14) >>> 0, pCur)
  if (pPrev !== 0) {
    m.setU32((pPrev + 0x14) >>> 0, pNew)
  } else {
    m.setU32((pGame + 0xd8 + nAct * 4) >>> 0, pNew)
  }
  return pNew
}

/**
 * `@va D2Game:0x6FC3F600` (`ROOM_SaveInactiveMonsterNode`, `eax = pMonster`, `__stdcall(pGame)`).
 *
 * Purges aura/curse sub-statlists, removes AI event `2`, allocates a `0x5C`-byte monster save node
 * preserving coords, `dwClassId`, `dwUnitId`, `dwFlags`/`dwFlagsEx`, `MonUMod[0..8]`, `exp`, `maxHp`,
 * `curHp`, and `dwGameFrame`, and prepends it to `[pRoomNode + 0x0C]` in `[pGame + 0xD8 + nAct * 4]`.
 */
export function ROOM_SaveInactiveMonsterNode113c(
  m: Memory113c,
  pGame: number,
  pMonster: number,
): void {
  if (pMonster === 0 || pGame === 0) return
  const pRoom = UNITS_GetRoom113c(m, pMonster) >>> 0
  if (pRoom === 0) return

  const pDataTables = resolveSgptDataTablesActRooms113c(m)
  if (pDataTables !== 0) {
    const nAuraStates = (m.u16((pDataTables + 0x178) >>> 0) << 16) >> 16
    const pAuraStateArr = m.u32((pDataTables + 0x174) >>> 0) >>> 0
    if (pAuraStateArr !== 0) {
      for (let i = 0; i < nAuraStates; i++) {
        const stateId = (m.u16((pAuraStateArr + i * 2) >>> 0) << 16) >> 16
        if (STATES_CheckState113c(m, pMonster, stateId) !== 0) {
          const pSl = STATLIST_GetStatListFromUnitAndStateMemPort113c(m, pMonster, stateId) >>> 0
          if (pSl !== 0) {
            STATLIST_UnlinkSubList113c(m, pMonster, pSl)
            STATLIST_FreeStatListIfNonExtended113c(m, pSl)
          }
        }
      }
    }
  }

  EVENT_DeleteEventByType113c(m, pGame, pMonster, 2)

  const pNode = m.alloc(0x5c) >>> 0
  m.setU32((pNode + 0x1c) >>> 0, 0xffffffff)
  const coords = getUnitCoordsActRooms113c(m, pMonster)
  m.setU32(pNode, coords.x >>> 0)
  m.setU32((pNode + 0x04) >>> 0, coords.y >>> 0)
  m.setU32((pNode + 0x08) >>> 0, m.u32((pMonster + 0x04) >>> 0) >>> 0)
  m.setU32((pNode + 0x54) >>> 0, m.u32((pGame + 0xa8) >>> 0) >>> 0)

  const uType = m.u32(pMonster) >>> 0
  const pMonData = uType === 1 ? (m.u32((pMonster + 0x14) >>> 0) >>> 0) : 0
  const pAiGen = pMonData !== 0 ? (m.u32((pMonData + 0x28) >>> 0) >>> 0) : 0
  if (pAiGen !== 0) {
    m.setU32((pNode + 0x28) >>> 0, m.u32(pAiGen) >>> 0)
  }
  const monField14 = pMonData !== 0 ? m.u16((pMonData + 0x14) >>> 0) : 0x1506
  m.setU16((pNode + 0x30) >>> 0, monField14)

  let flags18 = 0
  if (pMonData !== 0) {
    const monTypeFlags = m.u8((pMonData + 0x16) >>> 0)
    if ((monTypeFlags & 0x04) !== 0) flags18 |= 0x02
    if ((monTypeFlags & 0x02) !== 0) {
      flags18 |= 0x0800
      m.setU16((pNode + 0x3c) >>> 0, m.u16((pMonData + 0x26) >>> 0))
    }
    if ((monTypeFlags & 0x01) !== 0) flags18 |= 0x01
    if ((monTypeFlags & 0x10) !== 0) flags18 |= 0x20
    if ((m.u8((pMonData + 0x5c) >>> 0) & 0x02) !== 0) flags18 |= 0x40
  }

  const align = UNIT_GetAlignment113c(m, pMonster) | 0
  if (align === 2) flags18 |= 0x0100
  else if (align === 0) flags18 |= 0x0200
  else if (align === 1) flags18 |= 0x80

  const spawnType = m.u32((pMonster + 0xd0) >>> 0) >>> 0
  if (spawnType !== 0x0b) {
    flags18 |= 0x0400
  }
  const animMode = m.u32((pMonster + 0x10) >>> 0) | 0
  if (animMode === 0 || animMode === 0x0c) {
    flags18 |= 0x04
  }
  m.setU32((pNode + 0x18) >>> 0, flags18 >>> 0)

  m.setU32((pNode + 0x40) >>> 0, STATLIST_GetUnitStat113c(m, pMonster, 0x0d, 0) >>> 0)
  m.setU32((pNode + 0x44) >>> 0, STATLIST_GetMaxLifeFromUnit113c(m, pMonster) >>> 0)
  m.setU32((pNode + 0x48) >>> 0, STATLIST_GetUnitStat113c(m, pMonster, 0x06, 0) >>> 0)

  if (pMonData !== 0) {
    m.setU32((pNode + 0x2c) >>> 0, m.u32((pMonData + 0x58) >>> 0) >>> 0)
    for (let k = 0; k < 9; k++) {
      m.setU8((pNode + 0x32 + k) >>> 0, m.u8((pMonData + 0x1c + k) >>> 0))
    }
  }
  if (pAiGen !== 0 && m.u32((pAiGen + 0x30) >>> 0) === 1) {
    const aiFlags = m.u16((pAiGen + 0x08) >>> 0)
    const saved2C = m.u32((pAiGen + 0x2c) >>> 0) >>> 0
    const saved34 = m.u32((pAiGen + 0x34) >>> 0) >>> 0
    m.setU32((pAiGen + 0x2c) >>> 0, 0xffffffff)
    m.setU32((pAiGen + 0x34) >>> 0, 0)
    if (saved2C !== 0xffffffff) {
      m.setU32((pNode + 0x1c) >>> 0, saved2C)
      m.setU32((pNode + 0x20) >>> 0, saved34)
      let f18 = m.u32((pNode + 0x18) >>> 0)
      if ((aiFlags & 0x01) !== 0) f18 |= 0x08
      if ((aiFlags & 0x02) !== 0) f18 |= 0x10
      m.setU32((pNode + 0x18) >>> 0, f18 >>> 0)
    }
  }

  m.setU32((pNode + 0x0c) >>> 0, m.u32((pMonster + 0x0c) >>> 0) >>> 0)
  m.setU32((pNode + 0x10) >>> 0, m.u32((pMonster + 0xc4) >>> 0) >>> 0)
  m.setU32((pNode + 0x14) >>> 0, m.u32((pMonster + 0xc8) >>> 0) >>> 0)

  const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom)
  const nAct = DRLG_GetActNoFromLevelId113c(m, nLevelId) & 0xff
  if (nAct >= 5) {
    freeMemNodeAct113c(m, pNode)
    return
  }
  const sp = actRoomsStackPtr
  actRoomsStackPtr = (sp + 0x20) >>> 0
  try {
    DUNGEON_GetRoomCoordinates113c(m, pRoom, sp)
    const roomX = m.u32(sp) | 0
    const roomY = m.u32((sp + 0x04) >>> 0) | 0
    const pRoomNode = findOrAllocInactiveRoomNodeInAct113c(m, pGame, nAct, roomX, roomY)
    if (pRoomNode !== 0) {
      m.setU32((pNode + 0x58) >>> 0, m.u32((pRoomNode + 0x0c) >>> 0) >>> 0)
      m.setU32((pRoomNode + 0x0c) >>> 0, pNode)
    }
  } finally {
    actRoomsStackPtr = sp
  }
}

/**
 * `@va D2Game:0x6FC404E0` (`ROOM_SaveInactiveUnitToActNode`, `eax = pUnit`, `__stdcall(pGame)`).
 *
 * Dispatches monsters (`uType == 1`) to `0x6FC3F600`, ground items (`uType == 4`) to `[pRoomNode + 0x08]`,
 * and objects/corpses/warps (`uType` `0`, `2`, `5`) into `0x34`-byte saved unit nodes at `[pRoomNode + 0x10]`.
 */
export function ROOM_SaveInactiveUnitToActNode113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
): void {
  if (pUnit === 0 || pGame === 0) return
  const uType = m.u32(pUnit) >>> 0
  if (uType === 1) {
    ROOM_SaveInactiveMonsterNode113c(m, pGame, pUnit)
    return
  }
  const pRoom = UNITS_GetRoom113c(m, pUnit) >>> 0
  if (pRoom === 0) return
  const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom)
  const nAct = DRLG_GetActNoFromLevelId113c(m, nLevelId) & 0xff
  if (nAct >= 5) return

  let pRoomNode = 0
  const sp = actRoomsStackPtr
  actRoomsStackPtr = (sp + 0x20) >>> 0
  try {
    DUNGEON_GetRoomCoordinates113c(m, pRoom, sp)
    const roomX = m.u32(sp) | 0
    const roomY = m.u32((sp + 0x04) >>> 0) | 0
    pRoomNode = findOrAllocInactiveRoomNodeInAct113c(m, pGame, nAct, roomX, roomY)
  } finally {
    actRoomsStackPtr = sp
  }
  if (pRoomNode === 0) return

  const coords = getUnitCoordsActRooms113c(m, pUnit)
  if (uType === 4) {
    hitD2GameVa113c(0x6fc403d0)
    const pItemData = m.u32((pUnit + 0x14) >>> 0) >>> 0
    const expireFrame =
      pItemData !== 0 && m.u32((pItemData + 0x50) >>> 0) !== 0
        ? (m.u32((pItemData + 0x50) >>> 0) >>> 0)
        : ((m.u32((pGame + 0xa8) >>> 0) + 15000) >>> 0)
    const pItemNode = m.alloc(0x18) >>> 0
    m.setU32((pItemNode + 0x04) >>> 0, expireFrame)
    m.setU16((pItemNode + 0x08) >>> 0, coords.x & 0xffff)
    m.setU16((pItemNode + 0x0a) >>> 0, coords.y & 0xffff)
    m.setU16((pItemNode + 0x0c) >>> 0, 0)
    m.setU32((pItemNode + 0x0e) >>> 0, m.u32((pUnit + 0x04) >>> 0) >>> 0)
    m.setU32(pItemNode, m.u32((pRoomNode + 0x08) >>> 0) >>> 0)
    m.setU32((pRoomNode + 0x08) >>> 0, pItemNode)
    EVENT_RemoveUnitEvents113c(m, pGame, pUnit)
    SUNIT_RemoveServerUnit113c(m, pGame, pUnit)
    unlinkUnitFromRoomListActRooms113c(m, pRoom, pUnit)
    return
  }

  const pSavedNode = m.alloc(0x34) >>> 0
  m.setU32(pSavedNode, coords.x >>> 0)
  m.setU32((pSavedNode + 0x04) >>> 0, coords.y >>> 0)
  m.setU32((pSavedNode + 0x08) >>> 0, uType)
  const classId = m.u32((pUnit + 0x04) >>> 0) | 0
  m.setU32((pSavedNode + 0x0c) >>> 0, classId >>> 0)

  if (uType === 0) {
    m.setU32((pSavedNode + 0x20) >>> 0, m.u32((pUnit + 0x0c) >>> 0) >>> 0)
    m.setU32((pSavedNode + 0x10) >>> 0, m.u32((pUnit + 0x10) >>> 0) >>> 0)
  } else if (uType === 2) {
    const pObjTxt = DATATBLS_GetObjectsTxtRecord113c(m, classId) >>> 0
    let animMode = m.u32((pUnit + 0x10) >>> 0) | 0
    if (
      animMode === 1 &&
      pObjTxt !== 0 &&
      m.u8((pObjTxt + 0x109) >>> 0) === 0 &&
      m.u8((pObjTxt + 0x141) >>> 0) !== 0
    ) {
      animMode = 2
      m.setU32((pUnit + 0x10) >>> 0, 2)
    }
    m.setU32((pSavedNode + 0x10) >>> 0, animMode >>> 0)
    const subClass = pObjTxt !== 0 ? m.u8((pObjTxt + 0x167) >>> 0) : 0
    if ((subClass & 0x01) !== 0) {
      const nextEv5 = EVENT_GetNextEventFrame113c(m, pUnit, 5) >>> 0
      m.setU32((pSavedNode + 0x20) >>> 0, (nextEv5 >>> 16) & 0xffff)
      m.setU32((pSavedNode + 0x24) >>> 0, nextEv5 & 0xffff)
    } else if (classId === 0x3b || classId === 0x3c || classId === 0x64) {
      m.setU32((pSavedNode + 0x20) >>> 0, m.u32((pUnit + 0x0c) >>> 0) >>> 0)
    } else {
      m.setU32((pSavedNode + 0x24) >>> 0, m.u8((pUnit + 0x78) >>> 0))
    }
    m.setU32((pSavedNode + 0x2c) >>> 0, m.u32((pUnit + 0xb8) >>> 0) >>> 0)
    const pObjData = m.u32((pUnit + 0x14) >>> 0) >>> 0
    if (pObjData !== 0) {
      m.setU8((pSavedNode + 0x28) >>> 0, m.u8((pObjData + 0x04) >>> 0))
    }
  } else {
    m.setU32((pSavedNode + 0x10) >>> 0, m.u32((pUnit + 0x10) >>> 0) >>> 0)
  }

  m.setU32((pSavedNode + 0x14) >>> 0, m.u32((pGame + 0xa8) >>> 0) >>> 0)
  m.setU32((pSavedNode + 0x18) >>> 0, m.u32((pUnit + 0xc4) >>> 0) >>> 0)
  m.setU32((pSavedNode + 0x1c) >>> 0, m.u32((pUnit + 0xc8) >>> 0) >>> 0)
  m.setU32((pSavedNode + 0x30) >>> 0, m.u32((pRoomNode + 0x10) >>> 0) >>> 0)
  m.setU32((pRoomNode + 0x10) >>> 0, pSavedNode)
}

/**
 * `@va D2Game:0x6FC40760` (`ROOM_DeactivateMonsterInRoom`, `eax = pMonster`, `__stdcall(pGame)`).
 *
 * Exact 1:1 port of `0x6FC40760..0x6FC409A1` (`580B`):
 * 1. Evaluates corpse 1-in-3 room-seed survival (`pRoom + 0x6C`), alignment (`!= 2`), summon/pet
 *    exclusion (`dwFlags >> 31`), `MonStats2Txt.nRestore (+0x130)`, and quest/preset persistence (`+0xD0 < 8`).
 * 2. When `bSave != 0`, serializes `pMonster` via `0x6FC404E0` -> `0x6FC3F600`.
 * 3. Either retains `pMonster` in server hash with `dwFlagsEx |= 0x100` (`bKeepUnit != 0`) or removes
 *    its events and server unit entry (`0x6FD020A0`).
 */
export function ROOM_DeactivateMonsterInRoom113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  onUnitRemoved?: (pUnit: number, dwUnitType: number, dwUnitId: number) => void,
): void {
  hitD2GameVa113c(0x6FC40760)
  if (pUnit === 0) return
  const pRoom = UNITS_GetRoom113c(m, pUnit) >>> 0
  const uType = m.u32(pUnit) >>> 0
  const uId = m.u32((pUnit + 0x0c) >>> 0) >>> 0
  const animMode = m.u32((pUnit + 0x10) >>> 0) | 0
  const bKeepUnit = m.u8((pUnit + 0xc6) >>> 0) & 0x01

  let isActive = 0
  if (bKeepUnit !== 0) {
    isActive = 1
  } else if (uType === 0) {
    if (animMode === 0 || animMode !== 0x11) isActive = 1
  } else if (uType === 1) {
    if (animMode === 0 || animMode !== 0x0c) isActive = 1
  } else {
    isActive = 1
  }

  let bSave = 0
  if (pRoom !== 0) {
    const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom)
    if (!DUNGEON_IsTownLevelId113c(m, nLevelId)) {
      bSave = 1
    }
  }
  const dwFlags = m.u32((pUnit + 0xc4) >>> 0) >>> 0
  if ((dwFlags & 0x02000000) !== 0) {
    bSave = 1
  }

  if (animMode === 0x0c) {
    const seedAddr = pRoom !== 0 ? ((pRoom + 0x6c) >>> 0) : 0
    if (seedAddr !== 0) {
      const lo = BigInt(m.u32(seedAddr) >>> 0)
      const hi = BigInt(m.u32((seedAddr + 4) >>> 0) >>> 0)
      const next = lo * 0x6ac690c5n + hi
      const nextLo = Number(next & 0xffffffffn) >>> 0
      const nextHi = Number((next >> 32n) & 0xffffffffn) >>> 0
      m.setU32(seedAddr, nextLo)
      m.setU32((seedAddr + 4) >>> 0, nextHi)
      if (nextLo % 3 !== 0) {
        bSave = 0
      }
    }
  }

  if (isActive !== 0) {
    if (UNIT_GetAlignment113c(m, pUnit) === 2) {
      bSave = 0
    }
  }

  const spawnMode = m.u32((pUnit + 0xd0) >>> 0) | 0
  if (spawnMode < 8) {
    if (isActive === 0) {
      bSave = 1
    } else {
      bSave = 0
    }
  }
  const classId = m.u32((pUnit + 0x04) >>> 0) | 0
  if (isActive !== 0 && (classId === 0x16b || classId === 0x16c)) {
    bSave = 0
  }
  if (uType === 1) {
    const pMonData = m.u32((pUnit + 0x14) >>> 0) >>> 0
    if (pMonData !== 0 && (m.u8((pMonData + 0x16) >>> 0) & 0x18) !== 0 && isActive !== 0) {
      bSave = 0
    }
  }
  if ((dwFlags >>> 31) !== 0) {
    bSave = 0
  }
  if (((dwFlags >>> 9) & 1) !== 0) {
    bSave = 0
  }

  const pDataTables = resolveSgptDataTablesActRooms113c(m)
  if (classId < 0 || pDataTables === 0) {
    bSave = 0
  } else {
    const nMonStats = m.u32((pDataTables + 0xa80) >>> 0) | 0
    const pMonStats = m.u32((pDataTables + 0xa78) >>> 0) >>> 0
    if (classId >= nMonStats || pMonStats === 0) {
      bSave = 0
    } else {
      const exIdx = (m.u16((pMonStats + Math.imul(classId, 0x1a8) + 0x18) >>> 0) << 16) >> 16
      const nMonStats2 = m.u32((pDataTables + 0xa98) >>> 0) | 0
      const pMonStats2 = m.u32((pDataTables + 0xa90) >>> 0) >>> 0
      if (exIdx < 0 || exIdx >= nMonStats2 || pMonStats2 === 0) {
        bSave = 0
      } else {
        const nRestore = m.u8((pMonStats2 + Math.imul(exIdx, 0x134) + 0x130) >>> 0)
        if (nRestore === 0) {
          bSave = 0
        } else if (nRestore === 2) {
          bSave = 1
        }
      }
    }
  }

  if (bKeepUnit !== 0) {
    m.setU32((pUnit + 0xc8) >>> 0, (m.u32((pUnit + 0xc8) >>> 0) | 0x100) >>> 0)
    if (bSave !== 0 && pGame !== 0) {
      ROOM_SaveInactiveUnitToActNode113c(m, pGame, pUnit)
    }
    unlinkUnitFromRoomListActRooms113c(m, pRoom, pUnit)
    return
  }

  if (bSave !== 0 && pGame !== 0) {
    ROOM_SaveInactiveUnitToActNode113c(m, pGame, pUnit)
  }
  EVENT_RemoveUnitEvents113c(m, pGame, pUnit)
  SUNIT_RemoveServerUnit113c(m, pGame, pUnit)
  unlinkUnitFromRoomListActRooms113c(m, pRoom, pUnit)
  onUnitRemoved?.(pUnit, uType, uId)
}

/**
 * `@va D2Game:0x6FC409B0` (`ROOM_DeactivateUnitInRoom`, `esi = pUnit`, `__stdcall(pGame)`).
 *
 * Exact 1:1 port of `0x6FC409B0..0x6FC40B15` (`368B`):
 * - `uType == 1`: tail-calls `0x6FC40760` (`ROOM_DeactivateMonsterInRoom113c`).
 * - `uType == 0`: preserves player corpses (`STATE_PLAYERBODY = 7`) with `dwFlagsEx |= 0x100` in `[pRoomNode + 0x10]`.
 * - `uType == 2`: preserves portals (`0x3B`/`0x3C`) in server unit hash with `dwFlagsEx |= 0x100`; saves stateful objects
 *   (Shrines, Wells, opened chests) into `[pRoomNode + 0x10]` and removes their active unit instances.
 * - `uType == 4`: saves ground items into `[pRoomNode + 0x08]` when `bSave != 0` or removes them.
 */
export function ROOM_DeactivateUnitInRoom113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  onUnitRemoved?: (pUnit: number, dwUnitType: number, dwUnitId: number) => void,
): void {
  if (pUnit === 0) return
  const uType = m.u32(pUnit) >>> 0
  if (uType === 1) {
    ROOM_DeactivateMonsterInRoom113c(m, pGame, pUnit, onUnitRemoved)
    return
  }

  const uId = m.u32((pUnit + 0x0c) >>> 0) >>> 0
  const classId = m.u32((pUnit + 0x04) >>> 0) | 0
  const pRoom = UNITS_GetRoom113c(m, pUnit) >>> 0

  let bSave = 0
  if (pRoom !== 0) {
    const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom)
    if (!DUNGEON_IsTownLevelId113c(m, nLevelId)) {
      bSave = 1
    }
  }
  if ((m.u32((pUnit + 0xc4) >>> 0) & 0x02000000) !== 0) {
    bSave = 1
  }

  if (uType === 0) {
    if (STATES_CheckState113c(m, pUnit, 7) !== 0) {
      EVENT_DeleteEventByType113c(m, pGame, pUnit, 1)
      m.setU32((pUnit + 0xc8) >>> 0, (m.u32((pUnit + 0xc8) >>> 0) | 0x100) >>> 0)
      if (pGame !== 0) {
        ROOM_SaveInactiveUnitToActNode113c(m, pGame, pUnit)
      }
      unlinkUnitFromRoomListActRooms113c(m, pRoom, pUnit)
      return
    }
    if (bSave !== 0 && pGame !== 0) {
      ROOM_SaveInactiveUnitToActNode113c(m, pGame, pUnit)
    }
    EVENT_RemoveUnitEvents113c(m, pGame, pUnit)
    SUNIT_RemoveServerUnit113c(m, pGame, pUnit)
    unlinkUnitFromRoomListActRooms113c(m, pRoom, pUnit)
    onUnitRemoved?.(pUnit, uType, uId)
    return
  }

  if (uType === 2) {
    if (classId === 0x3b || classId === 0x3c) {
      EVENT_DeleteEventByType113c(m, pGame, pUnit, 1)
      m.setU32((pUnit + 0xc8) >>> 0, (m.u32((pUnit + 0xc8) >>> 0) | 0x100) >>> 0)
      if (pGame !== 0) {
        ROOM_SaveInactiveUnitToActNode113c(m, pGame, pUnit)
      }
      unlinkUnitFromRoomListActRooms113c(m, pRoom, pUnit)
      return
    }
    const pObjTxt = DATATBLS_GetObjectsTxtRecord113c(m, classId) >>> 0
    if (pObjTxt !== 0) {
      if (m.u8((pObjTxt + 0x173) >>> 0) !== 0) {
        const spawnFlag = m.u8((pUnit + 0xd0) >>> 0)
        if ((spawnFlag & 0x02) === 0 && (m.u32((pUnit + 0xc4) >>> 0) & 0x02000000) === 0) {
          bSave = 0
        }
      }
      if (m.u8((pObjTxt + 0x174) >>> 0) !== 0 && m.u32((pUnit + 0x10) >>> 0) !== 0) {
        bSave = 0
      }
    }
    EVENT_DeleteEventByType113c(m, pGame, pUnit, 1)
    if (bSave !== 0 && pGame !== 0) {
      ROOM_SaveInactiveUnitToActNode113c(m, pGame, pUnit)
    }
    EVENT_RemoveUnitEvents113c(m, pGame, pUnit)
    SUNIT_RemoveServerUnit113c(m, pGame, pUnit)
    unlinkUnitFromRoomListActRooms113c(m, pRoom, pUnit)
    onUnitRemoved?.(pUnit, uType, uId)
    return
  }

  if (uType === 4) {
    if (bSave !== 0 && pGame !== 0) {
      ROOM_SaveInactiveUnitToActNode113c(m, pGame, pUnit)
    }
    return
  }

  EVENT_RemoveUnitEvents113c(m, pGame, pUnit)
  SUNIT_RemoveServerUnit113c(m, pGame, pUnit)
  unlinkUnitFromRoomListActRooms113c(m, pRoom, pUnit)
  onUnitRemoved?.(pUnit, uType, uId)
}

/**
 * `@va D2Game:0x6FC4CF30` (`GAME_DeactivateUnusedRoomsTick`, `__stdcall(pGame)`).
 *
 * Called every 12 frames (`dwGameFrame % 12 == 0` at `0x6FC4E106..0x6FC4E119`):
 * Walks `pGame->pAct[0..4]` and each active room `pRoom = DUNGEON_GetRoomExFromRoom113c(m, pAct)`:
 * 1. Calls `D2Common.#10557` (`DUNGEON_UpdateRoomIdleCounter113c(m, pRoom)`).
 * 2. If `idleCounter > 10` and `D2Common.#10163` (`DUNGEON_CanFreeActiveRoom113c(m, pAct, pRoom) != 0`):
 *    - Walks `pUnit = pRoom->pUnitFirst (+0x74)` via `pRoomUnitNext (+0xE8)` and calls `0x6FC409B0`
 *      (`ROOM_DeactivateUnitInRoom113c`).
 *    - Calls `D2Common.#10150` (`DUNGEON_FreeActiveRoom113c(m, pAct, pRoom)`).
 */
export function GAME_DeactivateUnusedRoomsTick113c(
  m: Memory113c,
  pGame: number,
  onRoomDeactivated?: (pRoom: number) => void,
  onUnitRemoved?: (pUnit: number, dwUnitType: number, dwUnitId: number) => void,
): void {
  hitD2GameVa113c(0x6FC4CF30)
  for (let actIdx = 0; actIdx < 5; actIdx++) {
    const pAct = m.u32((pGame + GAME_OFF_PACT_113C + actIdx * 4) >>> 0) >>> 0
    if (pAct === 0) continue
    let pRoom = DUNGEON_GetRoomExFromRoom113c(m, pAct) >>> 0
    while (pRoom !== 0) {
      const pNext = m.u32((pRoom + ROOM_OFF_NEXT_113C) >>> 0) >>> 0
      const idleCount = DUNGEON_UpdateRoomIdleCounter113c(m, pRoom)
      if (idleCount > 10 && DUNGEON_CanFreeActiveRoom113c(m, pAct, pRoom) !== 0) {
        let pUnit = m.u32((pRoom + 0x74) >>> 0) >>> 0
        while (pUnit !== 0) {
          const pUnitNext = m.u32((pUnit + 0xe8) >>> 0) >>> 0
          ROOM_DeactivateUnitInRoom113c(m, pGame, pUnit, onUnitRemoved)
          pUnit = pUnitNext
        }
        DUNGEON_FreeActiveRoom113c(m, pAct, pRoom)
        onRoomDeactivated?.(pRoom)
      }
      pRoom = pNext
    }
  }
}

export { DUNGEON_IsTownLevelId113c }

