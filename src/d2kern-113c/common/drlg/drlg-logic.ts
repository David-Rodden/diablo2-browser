/**
 * Diablo II v1.13c `D2Common.dll` room logical coordinate grid and flood-fill helpers (`Drlg\DrlgLogic.cpp`),
 * image base `0x6FD50000`.
 *
 * Every function below is a 1:1 port of the cited disassembly (`objdump -d -M intel` on `D2Common.dll`).
 */
import {
  D2DrlgGridStrc,
  D2DrlgLevelStrc,
  D2DrlgTileDataStrc,
  D2DrlgTileGridStrc,
  D2DrlgTileLinkStrc,
  D2RoomCoordListStrc,
  D2RoomExStrc,
  D2RoomLogicalInfoStrc,
} from '../../mem/layout.generated.ts';
import type { Memory113c } from '../../mem/sparse-memory.ts';

/**
 * Wall style group lookup table at `0x6FDDA758` (`int32[15]`, 60 bytes: `0x6FDDA758 .. 0x6FDDA793`).
 * Maps wall tile style (`0..14`) to flood-fill group (`-1..4`).
 * Copied verbatim from `D2Common.dll` v1.13c.
 */
export const WALL_STYLE_GROUP_TABLE_6FDDA758 = Int32Array.from([
  -1, 0, 1, 2, 2, 0, 1, 3, 0, 1, 0, 1, 4, -1, 4,
]);

/**
 * Wall flood-fill action bitmask table at `0x6FDDA794` (`uint32[30]`, 120 bytes: `0x6FDDA794 .. 0x6FDDA80B`),
 * indexed in the binary as `*(uint32*)(0x6FDDA7AC + (group * 5 + nFromDir) * 4)` for `group in -1..4` and `nFromDir in -1..3`
 * (i.e. `index = (group + 1) * 5 + (nFromDir + 1) = group * 5 + nFromDir + 6`).
 * Copied verbatim from `D2Common.dll` v1.13c.
 */
export const WALL_FLOOD_ACTION_TABLE_6FDDA794 = Uint32Array.from([
  /* group -1 (0x6FDDA794): */ 0x00, 0x00, 0x00, 0x00, 0x00,
  /* group  0 (0x6FDDA7A8): */ 0x17, 0x00, 0x05, 0x15, 0x11,
  /* group  1 (0x6FDDA7BC): */ 0x0f, 0x03, 0x00, 0x09, 0x07,
  /* group  2 (0x6FDDA7D0): */ 0x27, 0x00, 0x00, 0x05, 0x03,
  /* group  3 (0x6FDDA7E4): */ 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
  /* group  4 (0x6FDDA7F8): */ 0x1f, 0x1f, 0x1f, 0x1f, 0x1f,
]);

/**
 * 4-connected step delta table `(dx, dy)` at `0x6FDDA80C` (`int32[8]`, 32 bytes: `0x6FDDA80C .. 0x6FDDA82B`).
 * Copied verbatim from `D2Common.dll` v1.13c.
 */
export const FLOOD_DIR_DELTAS_6FDDA80C = Int32Array.from([
  1, 0,
  0, 1,
  -1, 0,
  0, -1,
]);

/**
 * `@va D2Common:0x6FDD0EE0` (`DRLGLOGIC_ReplaceRoomCoordListIndex113c`, `__fastcall(pRoomEx, nOldIdx, nNewIdx, bNodeFlag)`, `ret 8`).
 *
 * If `pRoomEx->pLogicalRoomInfo (+0x64)` is non-NULL and `(pLogicalRoomInfo->dwFlags & 1) == 0`, walks
 * `pLogicalRoomInfo->pCoordList (+0x30)` via `D2RoomCoordListStrc.pNext (+0x2C)` replacing every node where
 * `nIndex (+0x28) == nOldIdx` with `nNewIdx`. If at least one node matched, recurses onto adjacent rooms
 * `pRoomEx->ppRoomsNear[i]` (`0 <= i < pRoomEx->nRoomsNear`) belonging to the same `pLevel->nLevelId (+0x1D0)`.
 */
export function DRLGLOGIC_ReplaceRoomCoordListIndex113c(
  m: Memory113c,
  pRoomEx: number,
  nOldIdx: number,
  nNewIdx: number,
  bNodeFlag: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pLogical = m.get(roomEx, D2RoomExStrc.pLogicalRoomInfo);
  if (pLogical === 0) return;
  if ((m.get(pLogical, D2RoomLogicalInfoStrc.dwFlags) & 1) !== 0) return;

  let pCoord = m.get(pLogical, D2RoomLogicalInfoStrc.pCoordList);
  if (pCoord === 0) return;

  const oldIdx = nOldIdx | 0;
  const newIdx = nNewIdx >>> 0;
  let found = 0;

  while (pCoord !== 0) {
    if ((m.get(pCoord, D2RoomCoordListStrc.nIndex) | 0) === oldIdx) {
      found = 1;
      m.set(pCoord, D2RoomCoordListStrc.nIndex, newIdx);
    }
    pCoord = m.get(pCoord, D2RoomCoordListStrc.pNext);
  }

  if (found === 0) return;

  const nNear = m.get(roomEx, D2RoomExStrc.nRoomsNear) | 0;
  if (nNear <= 0) return;

  for (let i = 0; i < nNear; i++) {
    const ppRoomsNear = m.get(roomEx, D2RoomExStrc.ppRoomsNear);
    const pNear = m.u32((ppRoomsNear + i * 4) >>> 0);
    if (pNear !== roomEx) {
      const pNearLevel = m.get(pNear, D2RoomExStrc.pLevel);
      const pSelfLevel = m.get(roomEx, D2RoomExStrc.pLevel);
      if (
        m.get(pNearLevel, D2DrlgLevelStrc.nLevelId) ===
        m.get(pSelfLevel, D2DrlgLevelStrc.nLevelId)
      ) {
        DRLGLOGIC_ReplaceRoomCoordListIndex113c(
          m,
          pNear,
          oldIdx,
          newIdx,
          bNodeFlag,
        );
      }
    }
  }
}

/**
 * `@va D2Common:0x6FDD14C0` (`DRLGLOGIC_MarkWallTileCells113c`, custom `edi = pRoomEx`, `[esp+4] = pGrid`, `ret 4`).
 *
 * Marks wall cells (`gafGridCellOps[0]` `OpOr` with `0x1`) in `pGrid` from `pRoomEx->pTileGrid->pWalls` (`+0x14`, count `+0x18`)
 * and from adjacent rooms' `pTileGrid->pMapLinks` (`bFloor == 0`) overlapping `pRoomEx`'s tile bounds
 * whenever `(dwFlags & 0x1C000) == 0x4000`, `nTileType != 15`, and `((~dwFlags >>> 11) & 1) != 0`.
 */
export function DRLGLOGIC_MarkWallTileCells113c(
  m: Memory113c,
  pRoomEx: number,
  pGrid: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const grid = pGrid >>> 0;
  const pTileGrid = m.get(roomEx, D2RoomExStrc.pTileGrid);
  const pWallsSlot = (pTileGrid + 0x14) >>> 0;
  const nWallsInitial = m.u32((pTileGrid + 0x18) >>> 0);

  if (nWallsInitial > 0) {
    let idx = 0;
    let byteOff = 0;
    while (true) {
      const pWallsBase = m.u32(pWallsSlot);
      const pTile = (pWallsBase + byteOff) >>> 0;
      const dwFlags = m.get(pTile, D2DrlgTileDataStrc.dwFlags);
      if (
        (dwFlags & 0x1c000) === 0x4000 &&
        (m.get(pTile, D2DrlgTileDataStrc.nTileType) | 0) !== 0x0f &&
        ((~(dwFlags >>> 11)) & 1) !== 0
      ) {
        const y = m.get(pTile, D2DrlgTileDataStrc.nPosY) | 0;
        const x = m.get(pTile, D2DrlgTileDataStrc.nPosX) | 0;
        const pRowOffsets = m.get(grid, D2DrlgGridStrc.pRowOffsets);
        const rowOff = m.u32((pRowOffsets + y * 4) >>> 0) | 0;
        const pCells = m.get(grid, D2DrlgGridStrc.pCells);
        const pCell = (pCells + (((rowOff + x) | 0) << 2)) >>> 0;
        m.setU32(pCell, (m.u32(pCell) | 1) >>> 0);
      }
      const curCount = m.u32((pWallsSlot + 4) >>> 0);
      idx = (idx + 1) >>> 0;
      byteOff = (byteOff + 0x30) >>> 0;
      if (idx >= curCount) break;
    }
  }

  const nNearInitial = m.get(roomEx, D2RoomExStrc.nRoomsNear) >>> 0;
  if (nNearInitial > 0) {
    let i = 0;
    while (true) {
      const ppRoomsNear = m.get(roomEx, D2RoomExStrc.ppRoomsNear);
      const pNear = m.u32((ppRoomsNear + i * 4) >>> 0);
      if (pNear !== roomEx) {
        const pNearTileGrid = m.get(pNear, D2RoomExStrc.pTileGrid);
        if (pNearTileGrid !== 0) {
          let pLink = m.get(pNearTileGrid, D2DrlgTileGridStrc.pMapLinks);
          while (pLink !== 0) {
            if (m.get(pLink, D2DrlgTileLinkStrc.bFloor) === 0) {
              let pTile = m.get(pLink, D2DrlgTileLinkStrc.pTileData);
              while (pTile !== 0) {
                const dwFlags = m.get(pTile, D2DrlgTileDataStrc.dwFlags);
                if (
                  (dwFlags & 0x1c000) === 0x4000 &&
                  (m.get(pTile, D2DrlgTileDataStrc.nTileType) | 0) !== 0x0f &&
                  ((~(dwFlags >>> 11)) & 1) !== 0
                ) {
                  const worldY =
                    ((m.get(pNear, D2RoomExStrc.nTileYPos) | 0) +
                      (m.get(pTile, D2DrlgTileDataStrc.nPosY) | 0)) |
                    0;
                  const worldX =
                    ((m.get(pNear, D2RoomExStrc.nTileXPos) | 0) +
                      (m.get(pTile, D2DrlgTileDataStrc.nPosX) | 0)) |
                    0;
                  const selfX = m.get(roomEx, D2RoomExStrc.nTileXPos) | 0;
                  const selfY = m.get(roomEx, D2RoomExStrc.nTileYPos) | 0;
                  const selfW = m.get(roomEx, D2RoomExStrc.nTileWidth) | 0;
                  const selfH = m.get(roomEx, D2RoomExStrc.nTileHeight) | 0;
                  if (
                    worldX >= selfX &&
                    worldY >= selfY &&
                    worldX <= ((selfX + selfW) | 0) &&
                    worldY <= ((selfY + selfH) | 0)
                  ) {
                    const relY = (worldY - selfY) | 0;
                    const pRowOffsets = m.get(grid, D2DrlgGridStrc.pRowOffsets);
                    const rowOff = m.u32((pRowOffsets + relY * 4) >>> 0) | 0;
                    const cellIdx = ((rowOff - selfX + worldX) | 0) >>> 0;
                    const pCells = m.get(grid, D2DrlgGridStrc.pCells);
                    const pCell = (pCells + (cellIdx << 2)) >>> 0;
                    m.setU32(pCell, (m.u32(pCell) | 1) >>> 0);
                  }
                }
                pTile = m.get(pTile, D2DrlgTileDataStrc.pNext);
              }
            }
            pLink = m.get(pLink, D2DrlgTileLinkStrc.pNext);
          }
        }
      }
      i = (i + 1) >>> 0;
      const curNear = m.get(roomEx, D2RoomExStrc.nRoomsNear) >>> 0;
      if (i >= curNear) break;
    }
  }
}

/**
 * `@va D2Common:0x6FDD1650` (`DRLGLOGIC_MarkFloorTileCells113c`, custom `eax = pRoomEx`, `[esp+4] = pGrid`, `ret 4`).
 *
 * Iterates `pRoomEx->pTileGrid->pWalls` (`+0x14`, count at `+0x18`) and sets bit `0x8` (`OpOr` with `0x8`)
 * on `&pGrid[pTile->nPosY][pTile->nPosX]` whenever `(pTile->dwFlags & 0x04) != 0` and `(pTile->dwFlags & 0x1C000) == 0`.
 */
export function DRLGLOGIC_MarkFloorTileCells113c(
  m: Memory113c,
  pRoomEx: number,
  pGrid: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const grid = pGrid >>> 0;
  const pTileGrid = m.get(roomEx, D2RoomExStrc.pTileGrid);
  const pWallsSlot = (pTileGrid + 0x14) >>> 0;
  const nCountInitial = m.u32((pTileGrid + 0x18) >>> 0);
  if (nCountInitial === 0) return;

  let idx = 0;
  let byteOff = 0;
  while (true) {
    const pBase = m.u32(pWallsSlot);
    const pTile = (pBase + byteOff) >>> 0;
    const dwFlags = m.get(pTile, D2DrlgTileDataStrc.dwFlags);
    if ((dwFlags & 0x04) !== 0 && (dwFlags & 0x1c000) === 0) {
      const y = m.get(pTile, D2DrlgTileDataStrc.nPosY) | 0;
      const x = m.get(pTile, D2DrlgTileDataStrc.nPosX) | 0;
      const pRowOffsets = m.get(grid, D2DrlgGridStrc.pRowOffsets);
      const rowOff = m.u32((pRowOffsets + y * 4) >>> 0) | 0;
      const pCells = m.get(grid, D2DrlgGridStrc.pCells);
      const pCell = (pCells + (((rowOff + x) | 0) << 2)) >>> 0;
      m.setU32(pCell, (m.u32(pCell) | 8) >>> 0);
    }
    const curCount = m.u32((pWallsSlot + 4) >>> 0);
    idx = (idx + 1) >>> 0;
    byteOff = (byteOff + 0x30) >>> 0;
    if (idx >= curCount) break;
  }
}

/**
 * `@va D2Common:0x6FDD17A0` (`DRLGLOGIC_FloodFillLogicalCoordGrid113c`, `__fastcall(pContext, nX, nY, nFromDir)`, `ret 8`).
 *
 * Recursive/tail-looping flood-fill over logical room grids:
 * - `pContext + 0x00` = `pRoomEx`
 * - `pContext + 0x04` = `pIndexGrid` (`D2DrlgGridStrc*`, visited cells marked with `0x10000000 | uFillValue`)
 * - `pContext + 0x08` = `pWallTypeGrid` (`D2DrlgGridStrc*`, optional)
 * - `pContext + 0x14` = `pWallFloorGrid` (`D2DrlgGridStrc*`)
 * - `pContext + 0x1C` = `uFillValue` (`uint32`)
 */
export function DRLGLOGIC_FloodFillLogicalCoordGrid113c(
  m: Memory113c,
  pContext: number,
  nX: number,
  nY: number,
  nFromDir: number,
): void {
  const ctx = pContext >>> 0;
  let curX = nX | 0;
  let curY = nY | 0;
  let fromDir = nFromDir | 0;

  while (true) {
    const pRoomEx = m.u32(ctx);
    const rx = m.get(pRoomEx, D2RoomExStrc.nTileXPos) | 0;
    const ry = m.get(pRoomEx, D2RoomExStrc.nTileYPos) | 0;
    const rw = m.get(pRoomEx, D2RoomExStrc.nTileWidth) | 0;
    const rh = m.get(pRoomEx, D2RoomExStrc.nTileHeight) | 0;
    const worldX = (rx + curX) | 0;
    const worldY = (ry + curY) | 0;
    if (
      worldX < rx ||
      worldY < ry ||
      worldX > ((rx + rw) | 0) ||
      worldY > ((ry + rh) | 0)
    ) {
      return;
    }

    const pIndexGrid = m.u32((ctx + 4) >>> 0);
    const pIndexRowOffsets = m.get(pIndexGrid, D2DrlgGridStrc.pRowOffsets);
    const idxRowOff = m.u32((pIndexRowOffsets + curY * 4) >>> 0) | 0;
    const pIndexCells = m.get(pIndexGrid, D2DrlgGridStrc.pCells);
    const pIndexCell = (pIndexCells + (((idxRowOff + curX) | 0) << 2)) >>> 0;
    if ((m.u32(pIndexCell) & 0x10000000) !== 0) {
      return;
    }

    const pWallFloorGrid = m.u32((ctx + 0x14) >>> 0);
    const pWfRowOffsets = m.get(pWallFloorGrid, D2DrlgGridStrc.pRowOffsets);
    const wfRowOff = m.u32((pWfRowOffsets + curY * 4) >>> 0) | 0;
    const pWfCells = m.get(pWallFloorGrid, D2DrlgGridStrc.pCells);
    const wfVal = m.u32((pWfCells + (((wfRowOff + curX) | 0) << 2)) >>> 0);

    if (wfVal === 0) {
      const uFillValue = m.u32((ctx + 0x1c) >>> 0);
      m.setU32(pIndexCell, (m.u32(pIndexCell) | uFillValue) >>> 0);
      for (let dir = 0; dir < 4; dir++) {
        const dx = FLOOD_DIR_DELTAS_6FDDA80C[dir * 2]!;
        const dy = FLOOD_DIR_DELTAS_6FDDA80C[dir * 2 + 1]!;
        DRLGLOGIC_FloodFillLogicalCoordGrid113c(
          m,
          ctx,
          (curX + dx) | 0,
          (curY + dy) | 0,
          dir,
        );
      }
      return;
    }

    const pWallTypeGrid = m.u32((ctx + 8) >>> 0);
    let style = 0;
    if (pWallTypeGrid !== 0) {
      const pWtCells = m.get(pWallTypeGrid, D2DrlgGridStrc.pCells);
      if (pWtCells !== 0) {
        const pWtRowOffsets = m.get(pWallTypeGrid, D2DrlgGridStrc.pRowOffsets);
        const wtRowOff = m.u32((pWtRowOffsets + curY * 4) >>> 0) | 0;
        style = m.u32((pWtCells + (((wtRowOff + curX) | 0) << 2)) >>> 0) | 0;
      }
    }

    const group = WALL_STYLE_GROUP_TABLE_6FDDA758[style]!;
    const actionIdx = (group * 5 + fromDir + 6) | 0;
    const actionMask = WALL_FLOOD_ACTION_TABLE_6FDDA794[actionIdx]!;

    if ((actionMask & 0x01) !== 0) {
      const uFillValue = m.u32((ctx + 0x1c) >>> 0);
      const curRowOff =
        m.u32(
          (m.get(pIndexGrid, D2DrlgGridStrc.pRowOffsets) + curY * 4) >>> 0,
        ) | 0;
      const pCell =
        (m.get(pIndexGrid, D2DrlgGridStrc.pCells) +
          (((curRowOff + curX) | 0) << 2)) >>>
        0;
      m.setU32(pCell, (m.u32(pCell) | uFillValue) >>> 0);
    }
    if ((actionMask & 0x02) !== 0 && fromDir !== 2) {
      DRLGLOGIC_FloodFillLogicalCoordGrid113c(
        m,
        ctx,
        (curX + 1) | 0,
        curY,
        0,
      );
    }
    if ((actionMask & 0x04) !== 0 && fromDir !== 3) {
      DRLGLOGIC_FloodFillLogicalCoordGrid113c(
        m,
        ctx,
        curX,
        (curY + 1) | 0,
        1,
      );
    }
    if ((actionMask & 0x08) !== 0 && fromDir !== 0) {
      DRLGLOGIC_FloodFillLogicalCoordGrid113c(
        m,
        ctx,
        (curX - 1) | 0,
        curY,
        2,
      );
    }
    if ((actionMask & 0x10) !== 0 && fromDir !== 1) {
      DRLGLOGIC_FloodFillLogicalCoordGrid113c(
        m,
        ctx,
        curX,
        (curY - 1) | 0,
        3,
      );
    }
    if ((actionMask & 0x20) === 0) {
      return;
    }
    curY = (curY + 1) | 0;
    curX = (curX + 1) | 0;
    fromDir = -1;
  }
}

/**
 * `@va D2Common:0x6FDD1A20` (`DRLGLOGIC_AssignTileDataCoordListPointers113c`, `__stdcall(pRoomEx)`, `ret 4`).
 *
 * Iterates `pRoomEx->pTileGrid->pWalls` (`+0x14`, count at `+0x18`) and sets `pTile->pRoomCoordList (+0x10)`
 * to `0` if `pRoomEx->pLogicalRoomInfo (+0x64)` is NULL or has bit `0x1` set on `dwFlags (+0x00)`, or else
 * to `pLogicalRoomInfo->pIndexCells[pLogicalRoomInfo->pIndexRowOffsets[nPosY] + nPosX]`.
 */
export function DRLGLOGIC_AssignTileDataCoordListPointers113c(
  m: Memory113c,
  pRoomEx: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pTileGrid = m.get(roomEx, D2RoomExStrc.pTileGrid);
  const pWallsSlot = (pTileGrid + 0x14) >>> 0;
  const nCountInitial = m.u32((pTileGrid + 0x18) >>> 0);
  if (nCountInitial === 0) return;

  let idx = 0;
  let byteOff = 0;
  while (true) {
    const pBase = m.u32(pWallsSlot);
    const pTile = (pBase + byteOff) >>> 0;
    const x = m.get(pTile, D2DrlgTileDataStrc.nPosX) | 0;
    const y = m.get(pTile, D2DrlgTileDataStrc.nPosY) | 0;
    const pLogical = m.get(roomEx, D2RoomExStrc.pLogicalRoomInfo);

    if (pLogical === 0) {
      m.set(pTile, D2DrlgTileDataStrc.pRoomCoordList, 0);
    } else if ((m.get(pLogical, D2RoomLogicalInfoStrc.dwFlags) & 1) !== 0) {
      m.set(pTile, D2DrlgTileDataStrc.pRoomCoordList, 0);
    } else {
      const pRowOffsets = m.get(
        pLogical,
        D2RoomLogicalInfoStrc.pIndexRowOffsets,
      );
      const rowOff = m.u32((pRowOffsets + y * 4) >>> 0) | 0;
      const pCells = m.get(pLogical, D2RoomLogicalInfoStrc.pIndexCells);
      const pCoordList = m.u32((pCells + (((rowOff + x) | 0) << 2)) >>> 0);
      m.set(pTile, D2DrlgTileDataStrc.pRoomCoordList, pCoordList);
    }

    byteOff = (byteOff + 0x30) >>> 0;
    idx = (idx + 1) >>> 0;
    const curCount = m.u32((pWallsSlot + 4) >>> 0);
    if (idx >= curCount) break;
  }
}
