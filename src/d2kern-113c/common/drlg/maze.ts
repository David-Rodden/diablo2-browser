import {
  D2DrlgLevelStrc,
  D2DrlgStrc,
} from '../../mem/layout.generated.js'
import type { Memory113c } from '../../mem/sparse-memory.js'
import { COLLISION_MoveUnitToRoomAndCoord113c } from '../collision.ts'
import { D2CommonAssertError, SEED_RollRandomNumberInline113c } from '../inline-helpers.js'
import { smod32 } from '../int-math.js'
import { DRLG_GetRectTouchDirection113c } from './drlg.ts'
import {
  DRLGMAZE_SpawnAdjacentSpecialPresetRoom113c,
  DRLGROOM_AddOrthRoomData113c,
  DRLGROOM_AllocRoomEx113c,
  DRLGROOM_CheckLevelRoomsSeparation113c,
  DRLGROOM_FreeRoomEx113c,
  DRLGROOM_LinkRoomsBidirectional113c,
} from './drlg-room.ts'

/**
 * 0x6FD5E3E0 — DRLGMAZE_HasMapDS1 (73 bytes).
 * Custom register ABI: `ecx = pLevel` (`D2DrlgLevelStrc*`), plain `ret`.
 *
 * @va D2Common:0x6FD5E3E0
 */
export function DRLGMAZE_HasMapDS1113c(m: Memory113c, pLevel: number): number {
  if (pLevel === 0) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\Maze.cpp', 28)
  }
  const pMaze = m.get(pLevel, D2DrlgLevelStrc.pOutdoors)
  if (pMaze === 0) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\Maze.cpp', 30)
  }
  const pDrlg = m.get(pLevel, D2DrlgLevelStrc.pDrlg)
  const nDiff = m.get(pDrlg, D2DrlgStrc.nDifficulty)
  const val = m.u32((pMaze + nDiff * 4 + 0x04) >>> 0) | 0
  return val === 1 ? 1 : 0
}

const MAZE_LVLT_SWITCH_6FD5E6D0 = Uint8Array.from([
  0, 1, 20, 20, 2, 3, 20, 4, 20, 20, 5, 6, 7, 20, 8, 9,
  10, 20, 20, 11, 12, 13, 14, 20, 20, 15, 20, 20, 20, 16, 17, 18, 19,
])

const TABLE_6FDE6DF0 = Int32Array.from([
  0, 0, 0, 0, 0, 356, 355, 0, 0, 357, 354, 0, 0, 0, 0, 0,
])
const TABLE_6FDE6DF4 = Int32Array.from([
  0, 0, 0, 0, 0, 360, 359, 0, 0, 361, 358, 0, 0, 0, 0, 0,
])
const TABLE_6FDE6DF8 = Int32Array.from([
  0, 0, 0, 0, 0, 659, 660, 0, 0, 661, 662, 0, 0, 0, 0, 0,
])
const TABLE_6FDE6D70 = Int32Array.from([
  0, 0, 0, 0, 0, 1045, 1044, 0, 0, 1043, 1042, 0, 0, 0, 0, 0,
])
const TABLE_6FDE6D74 = Int32Array.from([
  0, 1056, 1055, 1057, 1054, 0, 0, 0, 1053, 0, 0, 0, 1058, 0, 0, 0,
])

/**
 * `@va D2Common:0x6FD5E490` (`DRLGMAZE_AssignMazeRoomPrestId113c`,
 * custom register ABI `ebx = pRoomEx`, `[esp+4] = bClearFlag2`, `ret 4 -> eax = pRoomEx`).
 */
export function DRLGMAZE_AssignMazeRoomPrestId113c(
  m: Memory113c,
  pRoomEx: number,
  bClearFlag2: number,
): number {
  const roomEx = pRoomEx >>> 0
  let esi = 0
  let edi = -1

  let pOrth = m.u32(roomEx)
  while (pOrth !== 0) {
    const dir = m.u32((pOrth + 0x04) >>> 0)
    if (dir === 0) esi |= 1
    else if (dir === 1) esi |= 8
    else if (dir === 2) esi |= 2
    else if (dir === 3) esi |= 4
    pOrth = m.u32((pOrth + 0x14) >>> 0)
  }

  const pLevel = m.u32((roomEx + 0x58) >>> 0)
  const nDrlgType = m.u32((pLevel + 0x1c0) >>> 0) | 0
  const idx = (nDrlgType - 3) >>> 0
  if (idx > 32) {
    throw new D2CommonAssertError('DrlgMaze.cpp', 0x160) // Fog.#10265: unhandled level type (line 352)
  }

  const caseId = MAZE_LVLT_SWITCH_6FD5E6D0[idx]!
  switch (caseId) {
    case 0:
      esi = (esi + 0x34) | 0
      break
    case 1:
      esi = (esi + 0x6c) | 0
      break
    case 2:
      esi = (esi + 0xa7) | 0
      break
    case 3:
      esi = (esi + 0xcd) | 0
      break
    case 4:
      esi = (esi + 0x101) | 0
      break
    case 5:
      esi = (esi + 0x12d) | 0
      break
    case 6:
      esi = TABLE_6FDE6DF0[esi]!
      break
    case 7: {
      const nLevelId = m.u32((pLevel + 0x1d0) >>> 0) | 0
      esi = TABLE_6FDE6DF4[esi]!
      if (nLevelId === 0x34) {
        if (esi === 0x169) edi = 2
      } else if (nLevelId === 0x36) {
        if (esi === 0x169 || esi === 0x167) edi = 3
      }
      break
    }
    case 8:
      esi = (esi + 0x19d) | 0
      break
    case 9:
      esi = (esi + 0x1e1) | 0
      break
    case 10:
      esi = (esi + 0x1fd) | 0
      break
    case 11:
      esi = (esi + 0x2f1) | 0
      break
    case 12: {
      const nLevelId = m.u32((pLevel + 0x1d0) >>> 0) | 0
      esi = TABLE_6FDE6DF8[esi]!
      if (nLevelId === 0x54) {
        if (esi === 0x296) esi = 0x298
      } else if (nLevelId === 0x55) {
        if (esi === 0x295) esi = 0x297
      }
      break
    }
    case 13:
      esi = (esi + 0x298) | 0
      break
    case 14:
      esi = (esi + 0x2c0) | 0
      break
    case 15:
      esi = (esi + 0x344) | 0
      break
    case 16:
      esi = TABLE_6FDE6D70[esi]!
      break
    case 17:
      if (DRLGMAZE_HasMapDS1113c(m, pLevel) === 0) {
        esi = (esi + 0x3ea) | 0
      }
      break
    case 18:
      esi = (esi + 0x422) | 0
      break
    case 19:
      esi = TABLE_6FDE6D74[esi]!
      break
    default:
      throw new D2CommonAssertError('DrlgMaze.cpp', 0x160) // Fog.#10265: unhandled level type (line 352)
  }

  if (esi !== 0) {
    const pPreset = m.u32((roomEx + 0x20) >>> 0)
    m.setU32(pPreset, esi >>> 0)
    m.setU32((pPreset + 0x04) >>> 0, edi >>> 0)
    const curFlags = m.u32((pPreset + 0x0c) >>> 0)
    if ((bClearFlag2 | 0) !== 0) {
      m.setU32((pPreset + 0x0c) >>> 0, (curFlags & ~2) >>> 0)
    } else {
      m.setU32((pPreset + 0x0c) >>> 0, (curFlags | 2) >>> 0)
    }
  }
  return roomEx
}

const MAZE_SPECIAL_SWITCH_6FD5EE24 = Uint8Array.from([
  0, 1, 15, 15, 2, 3, 15, 4, 15, 15, 5, 15, 15, 15, 6, 7,
  15, 15, 15, 8, 15, 9, 10, 15, 15, 11, 15, 15, 15, 15, 12, 13, 14,
])

const MAZE_SPECIAL_BASE_DEF = Int32Array.from([
  0x34, 0x6c, 0xa7, 0xcd, 0x101, 0x12d, 0x19d, 0x1e1,
  0x2f1, 0x298, 0x2c0, 0x344, 0x3ea, 0x422, 0x41c,
])

/**
 * `@va D2Common:0x6FD5ECB0` (`DRLGMAZE_PickSequentialSpecialPresetFileIndex113c`,
 * custom register ABI `eax = nPickedFile`, `ebx = pLevel`, `[esp+4] = pDrlgMap`, `ret 4`).
 */
export function DRLGMAZE_PickSequentialSpecialPresetFileIndex113c(
  m: Memory113c,
  nPickedFile: number,
  pLevel: number,
  pDrlgMap: number,
): void {
  const lvl = pLevel >>> 0
  const map = pDrlgMap >>> 0
  void m.u32((m.u32((lvl + 0x1b4) >>> 0) + 0x478) >>> 0)

  if ((nPickedFile | 0) !== -1) {
    m.setU32((map + 0x04) >>> 0, nPickedFile >>> 0)
    return
  }

  const pLvlPrestTxt = m.u32((map + 0x08) >>> 0)
  const nFiles = m.u32((pLvlPrestTxt + 0x40) >>> 0) | 0
  const nDef = m.u32(pLvlPrestTxt) | 0
  const idx = ((m.u32((lvl + 0x1c0) >>> 0) | 0) - 3) >>> 0
  if (idx > 32) {
    return
  }

  const caseId = MAZE_SPECIAL_SWITCH_6FD5EE24[idx]!
  if (caseId >= 15) {
    return
  }
  const baseDef = MAZE_SPECIAL_BASE_DEF[caseId]!
  if (nDef <= baseDef || nDef >= ((baseDef + 16) | 0)) {
    return
  }

  let pNode = m.u32((lvl + 0x1cc) >>> 0)
  while (pNode !== 0) {
    if ((m.u32(pNode) | 0) === nDef) {
      break
    }
    pNode = m.u32((pNode + 0x0c) >>> 0)
  }

  if (pNode === 0) {
    pNode = m.alloc(0x10)
    m.setU32(pNode, 0)
    m.setU32((pNode + 0x04) >>> 0, 0)
    m.setU32((pNode + 0x08) >>> 0, 0)
    m.setU32((pNode + 0x0c) >>> 0, 0)
    m.setU32(pNode, nDef >>> 0)
    m.setU32((pNode + 0x04) >>> 0, nFiles >>> 0)
    const randInit = SEED_RollRandomNumberInline113c(m, (lvl + 0x1c4) >>> 0, nFiles)
    m.setU32((pNode + 0x08) >>> 0, randInit >>> 0)
    m.setU32((pNode + 0x0c) >>> 0, m.u32((lvl + 0x1cc) >>> 0))
    m.setU32((lvl + 0x1cc) >>> 0, pNode)
  }

  const nextVal = smod32(((m.u32((pNode + 0x08) >>> 0) | 0) + 1) | 0, m.u32((pNode + 0x04) >>> 0) | 0)
  m.setU32((pNode + 0x08) >>> 0, nextVal >>> 0)
  m.setU32((map + 0x04) >>> 0, nextVal >>> 0)
}

/**
 * `@va D2Common:0x6FD5EEC0` (`DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c`, not exported;
 * custom LTCG `eax = nDir`, `ecx = pBaseRoomEx`, `edx = pNewRoomEx`, `ret`).
 */
export function DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c(
  m: Memory113c,
  nDir: number,
  pBaseRoomEx: number,
  pNewRoomEx: number,
): number {
  const baseRoom = pBaseRoomEx >>> 0
  const newRoom = pNewRoomEx >>> 0
  const baseX = m.u32((baseRoom + 0x34) >>> 0) | 0
  const baseY = m.u32((baseRoom + 0x38) >>> 0) | 0
  const baseW = m.u32((baseRoom + 0x3c) >>> 0) | 0
  const baseH = m.u32((baseRoom + 0x40) >>> 0) | 0

  switch (nDir >>> 0) {
    case 0:
      m.setU32((newRoom + 0x34) >>> 0, ((baseX - baseW) | 0) >>> 0)
      m.setU32((newRoom + 0x38) >>> 0, baseY >>> 0)
      break
    case 1:
      m.setU32((newRoom + 0x34) >>> 0, baseX >>> 0)
      m.setU32((newRoom + 0x38) >>> 0, ((baseY - baseH) | 0) >>> 0)
      break
    case 2:
      m.setU32((newRoom + 0x34) >>> 0, ((baseX + baseW) | 0) >>> 0)
      m.setU32((newRoom + 0x38) >>> 0, baseY >>> 0)
      break
    case 3:
      m.setU32((newRoom + 0x34) >>> 0, baseX >>> 0)
      m.setU32((newRoom + 0x38) >>> 0, ((baseY + baseH) | 0) >>> 0)
      break
    case 4:
      m.setU32((newRoom + 0x34) >>> 0, ((baseX - baseW) | 0) >>> 0)
      m.setU32((newRoom + 0x38) >>> 0, ((baseY - baseH) | 0) >>> 0)
      break
    case 5:
      m.setU32((newRoom + 0x34) >>> 0, ((baseX + baseW) | 0) >>> 0)
      m.setU32((newRoom + 0x38) >>> 0, ((baseY - baseH) | 0) >>> 0)
      break
    case 6:
      m.setU32((newRoom + 0x34) >>> 0, ((baseX + baseW) | 0) >>> 0)
      m.setU32((newRoom + 0x38) >>> 0, ((baseY + baseH) | 0) >>> 0)
      break
    case 7:
      m.setU32((newRoom + 0x34) >>> 0, ((baseX - baseW) | 0) >>> 0)
      m.setU32((newRoom + 0x38) >>> 0, ((baseY + baseH) | 0) >>> 0)
      break
    default:
      break
  }

  let pOrth = m.u32(baseRoom)
  while (pOrth !== 0) {
    const pBox = m.u32((pOrth + 0x10) >>> 0)
    const boxX = m.u32(pBox) | 0
    const boxY = m.u32((pBox + 0x04) >>> 0) | 0
    const boxW = m.u32((pBox + 0x08) >>> 0) | 0
    const boxH = m.u32((pBox + 0x0c) >>> 0) | 0
    const newX = m.u32((newRoom + 0x34) >>> 0) | 0
    const newY = m.u32((newRoom + 0x38) >>> 0) | 0
    const newW = m.u32((newRoom + 0x3c) >>> 0) | 0
    const newH = m.u32((newRoom + 0x40) >>> 0) | 0

    const distX = newX < boxX ? (boxX - newW - newX) | 0 : (newX - boxW - boxX) | 0
    const distY = newY < boxY ? (boxY - newH - newY) | 0 : (newY - boxH - boxY) | 0
    if (distX < 0 && distY < 0) {
      return 0
    }
    pOrth = m.u32((pOrth + 0x14) >>> 0)
  }

  return DRLGROOM_CheckLevelRoomsSeparation113c(
    m,
    m.u32((newRoom + 0x58) >>> 0),
    0,
    newRoom,
    baseRoom,
  )
}

/**
 * `@va D2Common:0x6FD5EB80` (`DRLGMAZE_LinkTouchingMazeRooms113c`, not exported;
 * `__stdcall(pRoomEx) -> void`, `ret 4`).
 */
export function DRLGMAZE_LinkTouchingMazeRooms113c(m: Memory113c, pRoomEx: number): void {
  const roomEx = pRoomEx >>> 0
  if ((m.u32((m.u32((roomEx + 0x20) >>> 0) + 0x0c) >>> 0) & 0x02) !== 0) {
    return
  }

  const pLevel = m.u32((roomEx + 0x58) >>> 0)
  const pMazeInfo = m.u32((pLevel + 0x14) >>> 0)
  let pOther = m.u32((pLevel + 0x10) >>> 0)

  while (pOther !== 0) {
    if (pOther !== roomEx) {
      if ((m.u32((m.u32((pOther + 0x20) >>> 0) + 0x0c) >>> 0) & 0x02) === 0) {
        const rX = m.u32((roomEx + 0x34) >>> 0) | 0
        const oX = m.u32((pOther + 0x34) >>> 0) | 0
        const rW = m.u32((roomEx + 0x3c) >>> 0) | 0
        const oW = m.u32((pOther + 0x3c) >>> 0) | 0
        const distX = rX < oX ? (oX - rW - rX) | 0 : (rX - oW - oX) | 0

        const rY = m.u32((roomEx + 0x38) >>> 0) | 0
        const oY = m.u32((pOther + 0x38) >>> 0) | 0
        const rH = m.u32((roomEx + 0x40) >>> 0) | 0
        const oH = m.u32((pOther + 0x40) >>> 0) | 0
        const distY = rY < oY ? (oY - rH - rY) | 0 : (rY - oH - oY) | 0

        if (distX < 1 && distY < 1 && distX !== distY) {
          let alreadyLinked = false
          let pOrth = m.u32(roomEx)
          while (pOrth !== 0) {
            if (m.u32(pOrth) === pOther) {
              alreadyLinked = true
              break
            }
            pOrth = m.u32((pOrth + 0x14) >>> 0)
          }
          if (!alreadyLinked) {
            const lo = BigInt(m.u32((pOther + 0x14) >>> 0))
            const hi = BigInt(m.u32((pOther + 0x18) >>> 0))
            const nextSeed = lo * 0x6ac690c5n + hi
            const newLo = Number(nextSeed & 0xffffffffn) >>> 0
            const newHi = Number((nextSeed >> 32n) & 0xffffffffn) >>> 0
            m.setU32((pOther + 0x14) >>> 0, newLo)
            m.setU32((pOther + 0x18) >>> 0, newHi)
            const roll = (newLo % 0x3e8) | 0
            if (roll < (m.u32((pMazeInfo + 0x18) >>> 0) | 0)) {
              const nDir = DRLG_GetRectTouchDirection113c(
                m,
                (pOther + 0x34) >>> 0,
                (roomEx + 0x34) >>> 0,
              ) | 0
              if (nDir !== -1) {
                DRLGROOM_LinkRoomsBidirectional113c(m, nDir, pOther, roomEx)
                DRLGMAZE_AssignMazeRoomPrestId113c(m, pOther, 1)
              }
            }
          }
        }
      }
    }
    pOther = m.u32((pOther + 0x24) >>> 0)
  }
}

/**
 * `@va D2Common:0x6FD5F000` (`DRLGMAZE_SpawnAndLinkAdjacentRoomEx113c`, not exported;
 * `__stdcall(pBaseRoomEx, nDir, bLinkTouching) -> D2RoomExStrc*`, `ret 0xC`).
 */
export function DRLGMAZE_SpawnAndLinkAdjacentRoomEx113c(
  m: Memory113c,
  pBaseRoomEx: number,
  nDir: number,
  bLinkTouching: number,
): number {
  const baseRoom = pBaseRoomEx >>> 0
  const pNewRoomEx = DRLGROOM_AllocRoomEx113c(m, m.u32((baseRoom + 0x58) >>> 0), 2)
  const pLevelNew = m.u32((pNewRoomEx + 0x58) >>> 0)
  const pMazeInfo = m.u32((pLevelNew + 0x14) >>> 0)
  m.setU32((pNewRoomEx + 0x3c) >>> 0, m.u32((pMazeInfo + 0x10) >>> 0))
  m.setU32((pNewRoomEx + 0x40) >>> 0, m.u32((pMazeInfo + 0x14) >>> 0))

  if (DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c(m, nDir, baseRoom, pNewRoomEx) === 0) {
    DRLGROOM_FreeRoomEx113c(m, pNewRoomEx)
    return 0
  }

  DRLGROOM_AddOrthRoomData113c(m, pNewRoomEx, baseRoom, nDir)
  DRLGROOM_AddOrthRoomData113c(m, baseRoom, pNewRoomEx, ((nDir | 0) - 2) & 3)
  if ((bLinkTouching | 0) !== 0) {
    DRLGMAZE_LinkTouchingMazeRooms113c(m, pNewRoomEx)
  }

  const pLevelBase = m.u32((baseRoom + 0x58) >>> 0)
  m.setU32((pNewRoomEx + 0x24) >>> 0, m.u32((pLevelBase + 0x10) >>> 0))
  m.setU32((pLevelBase + 0x08) >>> 0, (m.u32((pLevelBase + 0x08) >>> 0) + 1) >>> 0)
  m.setU32((pLevelBase + 0x10) >>> 0, pNewRoomEx)
  return pNewRoomEx >>> 0
}

/**
 * `.rdata` corner maze preset table at `0x6FDE6CC8..0x6FDE6CE7` (`[lvlType17, lvlType34]`, indexed by dir `0..3`).
 */
export const MAZE_CORNER_PRESET_BY_DIR_6FDE6CC8: ReadonlyArray<readonly [number, number]> = [
  [447, 1075],
  [444, 1077],
  [446, 1076],
  [445, 1074],
]

/**
 * `.rdata` tunnels special preset pairs at `0x6FDE6CE8..0x6FDE6D47` (`[nLvlPrestId, nDir, nPickedFile]`).
 */
export const TUNNELS_SPECIAL_PRESETS_6FDE6CE8: ReadonlyArray<readonly [number, number, number]> = [
  [1054, 1, 0],
  [1053, 3, 1],
  [1054, 1, 1],
  [1053, 3, 0],
  [1055, 0, 1],
  [1056, 2, 0],
  [1055, 0, 0],
  [1056, 2, 1],
]

/**
 * `@va D2Common:0x6FD5FD20` (`DRLGMAZE_SpawnAndAssignCornerRoomPresets113c`, not exported;
 * `__stdcall(pLevel) -> void`, `ret 4`).
 */
export function DRLGMAZE_SpawnAndAssignCornerRoomPresets113c(
  m: Memory113c,
  pLevel: number,
): void {
  const level = pLevel >>> 0
  const lo = BigInt(m.u32((level + 0x1c4) >>> 0))
  const hi = BigInt(m.u32((level + 0x1c8) >>> 0))
  const next = lo * 0x6ac690c5n + hi
  const newLo = Number(next & 0xffffffffn) >>> 0
  const newHi = Number((next >> 32n) & 0xffffffffn) >>> 0
  m.setU32((level + 0x1c4) >>> 0, newLo)
  m.setU32((level + 0x1c8) >>> 0, newHi)

  const pBase = m.u32((level + 0x10) >>> 0)
  let dir = newLo & 3
  for (let iter = 0; iter < 3; iter++) {
    const pNew = DRLGROOM_AllocRoomEx113c(m, m.u32((pBase + 0x58) >>> 0), 2) >>> 0
    const pNewLvl = m.u32((pNew + 0x58) >>> 0)
    const pMaze = m.u32((pNewLvl + 0x14) >>> 0)
    m.setU32((pNew + 0x3c) >>> 0, m.u32((pMaze + 0x10) >>> 0))
    m.setU32((pNew + 0x40) >>> 0, m.u32((pMaze + 0x14) >>> 0))
    if (DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c(m, dir, pBase, pNew) === 0) {
      DRLGROOM_FreeRoomEx113c(m, pNew)
    } else {
      DRLGROOM_AddOrthRoomData113c(m, pNew, pBase, dir)
      DRLGROOM_AddOrthRoomData113c(m, pBase, pNew, (dir - 2) & 3)
      DRLGMAZE_LinkTouchingMazeRooms113c(m, pNew)
      const pBaseLvl = m.u32((pBase + 0x58) >>> 0)
      m.setU32((pNew + 0x24) >>> 0, m.u32((pBaseLvl + 0x10) >>> 0))
      m.setU32((pBaseLvl + 0x10) >>> 0, pNew)
      m.setU32((pBaseLvl + 0x08) >>> 0, (m.u32((pBaseLvl + 0x08) >>> 0) + 1) >>> 0)
      DRLGMAZE_AssignMazeRoomPrestId113c(m, pBase, 1)
      DRLGMAZE_AssignMazeRoomPrestId113c(m, pNew, 1)
    }
    dir = (dir + 1) & 3
  }

  const nLevelType = m.u32((level + 0x1c0) >>> 0) | 0
  if (nLevelType === 17 || nLevelType === 34) {
    const pPreset = m.u32((pBase + 0x20) >>> 0)
    const entry = MAZE_CORNER_PRESET_BY_DIR_6FDE6CC8[dir]!
    m.setU32(pPreset, (nLevelType === 17 ? entry[0] : entry[1]) >>> 0)
    m.setU32((pPreset + 0x04) >>> 0, 0xffffffff)
    m.setU32((pPreset + 0x0c) >>> 0, (m.u32((pPreset + 0x0c) >>> 0) | 2) >>> 0)
  }
}

/**
 * `@va D2Common:0x6FD5FE70` (`DRLGMAZE_SpawnCrossOrPairSpecialRooms113c`, not exported;
 * custom LTCG `eax = bAllFourDirs`, `ecx = pLevel`, `ret`).
 */
export function DRLGMAZE_SpawnCrossOrPairSpecialRooms113c(
  m: Memory113c,
  bAllFourDirs: number,
  pLevel: number,
): void {
  const level = pLevel >>> 0
  const pBase = m.u32((level + 0x10) >>> 0)
  let prestId = 0x122
  if ((bAllFourDirs | 0) !== 0) {
    const dirs = [1, 2, 3, 0]
    for (let i = 0; i < 4; i++) {
      const pNew = DRLGMAZE_SpawnAndLinkAdjacentRoomEx113c(m, pBase, dirs[i]!, 1) >>> 0
      if (pNew !== 0) {
        DRLGMAZE_AssignMazeRoomPrestId113c(m, pBase, 1)
        DRLGMAZE_AssignMazeRoomPrestId113c(m, pNew, 1)
      }
    }
  } else {
    const lo = BigInt(m.u32((level + 0x1c4) >>> 0))
    const hi = BigInt(m.u32((level + 0x1c8) >>> 0))
    const next = lo * 0x6ac690c5n + hi
    const newLo = Number(next & 0xffffffffn) >>> 0
    const newHi = Number((next >> 32n) & 0xffffffffn) >>> 0
    m.setU32((level + 0x1c4) >>> 0, newLo)
    m.setU32((level + 0x1c8) >>> 0, newHi)
    const dirs = (newLo & 1) !== 0 ? [0, 2] : [1, 3]
    prestId = (newLo & 1) !== 0 ? 0x120 : 0x121
    for (let i = 0; i < 2; i++) {
      const pNew = DRLGMAZE_SpawnAndLinkAdjacentRoomEx113c(m, pBase, dirs[i]!, 1) >>> 0
      if (pNew !== 0) {
        DRLGMAZE_AssignMazeRoomPrestId113c(m, pBase, 1)
        DRLGMAZE_AssignMazeRoomPrestId113c(m, pNew, 1)
      }
    }
  }
  const pPreset = m.u32((pBase + 0x20) >>> 0)
  m.setU32(pPreset, prestId >>> 0)
  m.setU32((pPreset + 0x04) >>> 0, 0xffffffff)
  m.setU32((pPreset + 0x0c) >>> 0, (m.u32((pPreset + 0x0c) >>> 0) | 2) >>> 0)
}

/**
 * `@va D2Common:0x6FD60010` (`DRLGMAZE_FillAdjacentRoomsWithPreset113c`, not exported;
 * custom LTCG `eax = pLevel`, `[esp+4] = nLvlPrestId`, `[esp+8] = pIgnoreRoomEx`, `ret 8`).
 */
export function DRLGMAZE_FillAdjacentRoomsWithPreset113c(
  m: Memory113c,
  pLevel: number,
  nLvlPrestId: number,
  pIgnoreRoomEx: number,
): void {
  const level = pLevel >>> 0
  const ignore = pIgnoreRoomEx >>> 0
  const nRooms = m.u32((level + 0x08) >>> 0) | 0
  const arr = m.alloc((nRooms << 2) >>> 0) >>> 0
  let pCur = m.u32((level + 0x10) >>> 0)
  for (let i = 0; i < nRooms; i++) {
    m.setU32((arr + i * 4) >>> 0, pCur)
    pCur = m.u32((pCur + 0x24) >>> 0)
  }
  for (let i = 0; i < nRooms; i++) {
    const pRoomEx = m.u32((arr + i * 4) >>> 0)
    if (pRoomEx === ignore) {
      continue
    }
    for (let dir = 0; dir < 8; dir++) {
      const pNew = DRLGROOM_AllocRoomEx113c(m, m.u32((pRoomEx + 0x58) >>> 0), 2) >>> 0
      const pNewLvl = m.u32((pNew + 0x58) >>> 0)
      const pMaze = m.u32((pNewLvl + 0x14) >>> 0)
      m.setU32((pNew + 0x3c) >>> 0, m.u32((pMaze + 0x10) >>> 0))
      m.setU32((pNew + 0x40) >>> 0, m.u32((pMaze + 0x14) >>> 0))
      if (DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c(m, dir, pRoomEx, pNew) === 0) {
        DRLGROOM_FreeRoomEx113c(m, pNew)
      } else {
        DRLGROOM_AddOrthRoomData113c(m, pNew, pRoomEx, dir)
        DRLGROOM_AddOrthRoomData113c(m, pRoomEx, pNew, (dir - 2) & 3)
        const pRoomLvl = m.u32((pRoomEx + 0x58) >>> 0)
        m.setU32((pNew + 0x24) >>> 0, m.u32((pRoomLvl + 0x10) >>> 0))
        m.setU32((pRoomLvl + 0x10) >>> 0, pNew)
        m.setU32((pRoomLvl + 0x08) >>> 0, (m.u32((pRoomLvl + 0x08) >>> 0) + 1) >>> 0)
        const pPreset = m.u32((pNew + 0x20) >>> 0)
        m.setU32(pPreset, nLvlPrestId >>> 0)
        m.setU32((pPreset + 0x04) >>> 0, 0xffffffff)
        m.setU32((pPreset + 0x0c) >>> 0, (m.u32((pPreset + 0x0c) >>> 0) | 2) >>> 0)
      }
    }
  }
  ;(m as { free?: (p: number) => void }).free?.(arr)
}

/**
 * `@va D2Common:0x6FD606B0` (`DRLGMAZE_PlaceOrReplaceSpecialRoomPreset113c`, not exported;
 * custom LTCG `edx = pPresetSpec`, `[esp+4] = pLevel`, `[esp+8] = pOutDir`, `ret 8`).
 */
export function DRLGMAZE_PlaceOrReplaceSpecialRoomPreset113c(
  m: Memory113c,
  pPresetSpec: number,
  pLevel: number,
  pOutDir: number,
): void {
  const spec = pPresetSpec >>> 0
  const level = pLevel >>> 0
  const outDir = pOutDir >>> 0
  const nMatchPrest = m.u32(spec) | 0
  const nNewPrest = m.u32((spec + 0x04) >>> 0) | 0
  const nPickedFile = m.u32((spec + 0x08) >>> 0) | 0

  let pRoomEx = m.u32((level + 0x10) >>> 0)
  let replaced = false
  while (pRoomEx !== 0) {
    const pPreset = m.u32((pRoomEx + 0x20) >>> 0)
    if (
      (m.u32((pPreset + 0x0c) >>> 0) & 0x02) === 0 &&
      (m.u32(pPreset) | 0) === nMatchPrest
    ) {
      m.setU32(pPreset, nNewPrest >>> 0)
      m.setU32((pPreset + 0x04) >>> 0, nPickedFile >>> 0)
      m.setU32((pPreset + 0x0c) >>> 0, (m.u32((pPreset + 0x0c) >>> 0) | 0x02) >>> 0)
      replaced = true
      break
    }
    pRoomEx = m.u32((pRoomEx + 0x24) >>> 0)
  }

  if (!replaced) {
    const nDir = m.u32((spec + 0x0c) >>> 0) | 0
    DRLGMAZE_SpawnAdjacentSpecialPresetRoom113c(m, level, nDir, nNewPrest, nPickedFile)
  }

  if (outDir !== 0) {
    m.setU32(outDir, ((m.u32(outDir) | 0) + 1) & 3)
  }
}

/**
 * `@va D2Common:0x6FD5E1E0` (`D2Common.#10533` `PATH_WarpUnitToRoomAndCoord113c`,
 * `__stdcall(pDynamicPath, _pUnused, pRoom, nX, nY) -> BOOL`, `ret 0x14`).
 */
export function PATH_WarpUnitToRoomAndCoord113c(
  m: Memory113c,
  pDynamicPath: number,
  _pUnused: number,
  pRoom: number,
  nX: number,
  nY: number,
): number {
  const path = pDynamicPath >>> 0
  const packedXY = (((nY & 0xffff) << 16) | (nX & 0xffff)) >>> 0
  if (COLLISION_MoveUnitToRoomAndCoord113c(m, path, pRoom, packedXY) === 0) {
    return 0
  }
  m.setU32((path + 0x28) >>> 0, 0)
  return 1
}

/**
 * `@va D2Common:0x6FD60AF0` (`DRLGMAZE_PlaceTunnelsSpecialPresets113c`, not exported;
 * `__stdcall(pLevel) -> void`, `ret 4`).
 */
export function DRLGMAZE_PlaceTunnelsSpecialPresets113c(
  m: Memory113c,
  pLevel: number,
): void {
  const level = pLevel >>> 0
  const pBase = m.u32((level + 0x10) >>> 0)
  const lo = BigInt(m.u32((pBase + 0x14) >>> 0))
  const hi = BigInt(m.u32((pBase + 0x18) >>> 0))
  const next = lo * 0x6ac690c5n + hi
  const newLo = Number(next & 0xffffffffn) >>> 0
  const newHi = Number((next >> 32n) & 0xffffffffn) >>> 0
  m.setU32((pBase + 0x14) >>> 0, newLo)
  m.setU32((pBase + 0x18) >>> 0, newHi)

  const baseIdx = (newLo & 3) << 1
  if (baseIdx >= 7) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\Maze.cpp', 683)
  }

  for (let k = 0; k < 2; k++) {
    const entry = TUNNELS_SPECIAL_PRESETS_6FDE6CE8[baseIdx + k]!
    const nLvlPrestId = entry[0]
    const nDir = entry[1]
    const nPickedFile = entry[2]
    const pNew = DRLGMAZE_SpawnAndLinkAdjacentRoomEx113c(m, pBase, nDir, 0) >>> 0
    if (pNew !== 0) {
      DRLGMAZE_AssignMazeRoomPrestId113c(m, pBase, 1)
      const pPreset = m.u32((pNew + 0x20) >>> 0)
      m.setU32(pPreset, nLvlPrestId >>> 0)
      m.setU32((pPreset + 0x04) >>> 0, nPickedFile >>> 0)
      m.setU32((pPreset + 0x0c) >>> 0, (m.u32((pPreset + 0x0c) >>> 0) | 2) >>> 0)
    }
  }

  DRLGMAZE_FillAdjacentRoomsWithPreset113c(m, level, 0x344, 0)
}

