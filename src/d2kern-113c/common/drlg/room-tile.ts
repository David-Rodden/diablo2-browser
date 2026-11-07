/**
 * Diablo II v1.13c `D2Common.dll` room-tile (`Drlg\RoomTile.cpp` + `PathMisc.cpp`) leaf functions,
 * image base `0x6FD50000`.
 *
 * Every function below is a 1:1 port of the cited disassembly (`objdump -d -M intel` on `D2Common.dll`).
 */
import type { Memory113c } from '../../mem/sparse-memory.ts';
import {
  D2DrlgTileDataStrc,
  D2DrlgTileGridStrc,
  D2DrlgTileLinkStrc,
  D2DynamicPathStrc,
  D2RoomExStrc,
} from '../../mem/layout.generated.ts';

/**
 * `.rdata` table at `0x6FDDBD68` (`0x6FDDBD68..0x6FDDBF24`, 37 entries of 3 `int32_t`: `[nLevelId, nStartIdx, nEndIdx]`).
 * Copied verbatim from `D2Common.dll` v1.13c.
 */
export const WARP_LEVEL_RANGES_6FDDBD68: ReadonlyArray<readonly [number, number, number]> = [
  [28, 0, 3],
  [29, 0, 3],
  [30, 0, 3],
  [31, 0, 3],
  [26, 4, 6],
  [27, 4, 6],
  [32, 5, 9],
  [33, 5, 9],
  [34, 10, 11],
  [35, 10, 11],
  [36, 10, 11],
  [37, 10, 12],
  [51, 13, 14],
  [52, 15, 18],
  [53, 15, 18],
  [54, 15, 18],
  [55, 19, 20],
  [56, 19, 20],
  [57, 19, 20],
  [58, 19, 20],
  [59, 19, 20],
  [60, 19, 20],
  [61, 19, 20],
  [66, 19, 20],
  [67, 19, 20],
  [68, 19, 20],
  [69, 19, 20],
  [70, 19, 20],
  [71, 19, 20],
  [72, 19, 20],
  [62, 21, 22],
  [63, 21, 22],
  [64, 21, 22],
  [109, 23, 24],
  [111, 24, 33],
  [112, 24, 33],
  [117, 24, 33],
];

/**
 * `.rdata` table at `0x6FDDBF28` (34 entries of 28-byte warp tile descriptors;
 * first 3 `int32_t` fields at `+0x00, +0x04, +0x08` are `[nStyle, nSeq, bIsType9]`).
 * Copied verbatim from `D2Common.dll` v1.13c.
 */
export const WARP_TILE_DESC_6FDDBF28: ReadonlyArray<readonly [number, number, number]> = [
  [7, 0, 1],
  [7, 0, 0],
  [5, 0, 1],
  [5, 0, 0],
  [6, 0, 1],
  [4, 0, 1],
  [4, 0, 0],
  [4, 3, 1],
  [1, 2, 0],
  [1, 2, 1],
  [0, 0, 1],
  [0, 0, 0],
  [2, 0, 1],
  [0, 1, 1],
  [0, 1, 0],
  [5, 0, 1],
  [4, 0, 0],
  [0, 0, 1],
  [0, 0, 0],
  [2, 4, 1],
  [2, 1, 0],
  [0, 1, 1],
  [0, 1, 0],
  [3, 3, 0],
  [2, 1, 0],
  [2, 1, 1],
  [2, 6, 0],
  [2, 2, 0],
  [2, 3, 1],
  [26, 0, 0],
  [2, 4, 1],
  [2, 4, 0],
  [29, 0, 1],
  [29, 0, 0],
];

/**
 * `@va D2Common:0x6FD5CE90` (`D2Common.#10203` `PATH_CheckFlag08`, stdcall `(pPath)`, `ret 4`).
 *
 * Returns `pPath ? (pPath->dwFlags & 0x08) : 0`.
 */
export function PATH_CheckFlag08_113c(m: Memory113c, pPath: number): number {
  if (pPath === 0) return 0;
  return (m.get(pPath, D2DynamicPathStrc.dwFlags) & 0x08) >>> 0;
}

/**
 * `@va D2Common:0x6FD5D0A0` (`PATH_CheckStepTargetDistance113c`, custom `edx = pPath`, stack `[esp+4] = pOutStepVec`, `ret 4`).
 *
 * Copies `pPath->tVelocityVectorX (+0x72)` and `tVelocityVectorY (+0x76)` to `pOutStepVec[0..1]`.
 * If `pPath->dwPathType (+0x3C) == 4`, returns `0`.
 * Otherwise computes precision delta `((wPathPoints[dwCurrentPointIdx] << 16) + 0x8000) - curPrecisionPos`
 * and if `max(|dx|, |dy|) <= max(|velX|, |velY|)`, overwrites `pOutStepVec[0..1]` with `(dx, dy)` and returns `1`.
 */
export function PATH_CheckStepTargetDistance113c(
  m: Memory113c,
  pPath: number,
  pOutStepVec: number,
): number {
  const velX = m.get(pPath, D2DynamicPathStrc.tVelocityVectorX) | 0;
  const velY = m.get(pPath, D2DynamicPathStrc.tVelocityVectorY) | 0;
  m.setU32(pOutStepVec, velX >>> 0);
  m.setU32((pOutStepVec + 4) >>> 0, velY >>> 0);

  if ((m.get(pPath, D2DynamicPathStrc.dwPathType) | 0) === 4) {
    return 0;
  }

  const idx = m.get(pPath, D2DynamicPathStrc.dwCurrentPointIdx) | 0;
  const ptBase = (pPath + D2DynamicPathStrc.wPathPoints.off + idx * 4) >>> 0;
  const ptX = m.u16(ptBase);
  const ptY = m.u16((ptBase + 2) >>> 0);

  const targetPrecX = (((ptX << 16) | 0) + 0x8000) | 0;
  const targetPrecY = (((ptY << 16) | 0) + 0x8000) | 0;
  const curPrecX = m.u32(pPath) | 0;
  const curPrecY = m.u32((pPath + 4) >>> 0) | 0;

  const dx = (targetPrecX - curPrecX) | 0;
  const absDx = dx < 0 ? (-dx) | 0 : dx;
  const dy = (targetPrecY - curPrecY) | 0;
  const absDy = dy < 0 ? (-dy) | 0 : dy;

  const absVelY = velY < 0 ? (-velY) | 0 : velY;
  const absVelX = velX < 0 ? (-velX) | 0 : velX;
  const maxVel = absVelX > absVelY ? absVelX : absVelY;

  if (absDx > maxVel || absDy > maxVel) {
    return 0;
  }

  m.setU32(pOutStepVec, dx >>> 0);
  m.setU32((pOutStepVec + 4) >>> 0, dy >>> 0);
  return 1;
}

/**
 * `@va D2Common:0x6FDB81A0` (`DRLGROOMTILE_FindPresetRoomTile113c`, custom `esi = pRoomEx`, `ebx = dwPresetFlags`,
 * stack `[esp+4] = bFloor`, `[esp+8] = nX`, `[esp+0xC] = nY`, `ret 0xC`).
 *
 * Checks inclusive room tile bounds `[nTileXPos..nTileXPos+nTileWidth] x [nTileYPos..nTileYPos+nTileHeight]`,
 * then walks `pRoomEx->pTileGrid->pMapLinks` matching `bFloor` boolean equivalence, world tile coordinates
 * `(nTileXPos + pTile->nPosX == nX, nTileYPos + pTile->nPosY == nY)`, tile type != 4, roof/wall flag `0x08000000`,
 * and layer bits `((dwFlags >> 14) & 7) - 1 == ((dwPresetFlags >> 18) & 3)` when `(dwFlags & 0x1c000) != 0`.
 */
export function DRLGROOMTILE_FindPresetRoomTile113c(
  m: Memory113c,
  pRoomEx: number,
  dwPresetFlags: number,
  bFloor: number,
  nX: number,
  nY: number,
): number {
  const pTileGrid = m.get(pRoomEx, D2RoomExStrc.pTileGrid);
  if (pTileGrid === 0) return 0;

  const x = nX | 0;
  const y = nY | 0;
  const rx = m.get(pRoomEx, D2RoomExStrc.nTileXPos) | 0;
  if (x < rx) return 0;
  const ry = m.get(pRoomEx, D2RoomExStrc.nTileYPos) | 0;
  if (y < ry) return 0;
  const rw = m.get(pRoomEx, D2RoomExStrc.nTileWidth) | 0;
  if (x > ((rx + rw) | 0)) return 0;
  const rh = m.get(pRoomEx, D2RoomExStrc.nTileHeight) | 0;
  if (y > ((ry + rh) | 0)) return 0;

  for (
    let pLink = m.get(pTileGrid, D2DrlgTileGridStrc.pMapLinks);
    pLink !== 0;
    pLink = m.get(pLink, D2DrlgTileLinkStrc.pNext)
  ) {
    const linkIsFloor = m.get(pLink, D2DrlgTileLinkStrc.bFloor) !== 0;
    const wantFloor = (bFloor | 0) !== 0;
    if (linkIsFloor !== wantFloor) continue;

    for (
      let pTile = m.get(pLink, D2DrlgTileLinkStrc.pTileData);
      pTile !== 0;
      pTile = m.get(pTile, D2DrlgTileDataStrc.pNext)
    ) {
      const tileWorldX = ((m.get(pTile, D2DrlgTileDataStrc.nPosX) | 0) + rx) | 0;
      if (tileWorldX !== x) continue;
      const tileWorldY = ((m.get(pTile, D2DrlgTileDataStrc.nPosY) | 0) + ry) | 0;
      if (tileWorldY !== y) continue;

      const tileType = m.get(pTile, D2DrlgTileDataStrc.nTileType) | 0;
      if (tileType === 4) continue;
      if (tileType !== 13 && (dwPresetFlags & 0x08000000) !== 0) continue;

      const dwFlags = m.get(pTile, D2DrlgTileDataStrc.dwFlags);
      if ((dwFlags & 0x1c000) === 0) {
        return pTile;
      }
      const tileLayer = (((dwFlags >>> 14) & 0x7) - 1) | 0;
      const presetLayer = (dwPresetFlags >>> 18) & 0x3;
      if (tileLayer === presetLayer) {
        return pTile;
      }
    }
  }
  return 0;
}

/**
 * `@va D2Common:0x6FDB8340` (`DRLGROOMTILE_LookupWarpTileEntryIndex113c`, custom `ebx = bIsType9`,
 * stack `[esp+4] = nLevelId`, `[esp+8] = dwTileFlags`, `ret 8`).
 *
 * Scans `WARP_LEVEL_RANGES_6FDDBD68` for `nLevelId` and matches `nStyle = (dwTileFlags >>> 20) & 0x3f`,
 * `nSeq = (dwTileFlags >>> 8) & 0xff`, and `bIsType9 = ebx` in `WARP_TILE_DESC_6FDDBF28[startIdx..endIdx]`.
 */
export function DRLGROOMTILE_LookupWarpTileEntryIndex113c(
  bIsType9: number,
  nLevelId: number,
  dwTileFlags: number,
): number {
  const lvl = nLevelId | 0;
  const type9 = bIsType9 | 0;
  const style = (dwTileFlags >>> 20) & 0x3f;
  const seq = (dwTileFlags >>> 8) & 0xff;

  for (let i = 0; i < WARP_LEVEL_RANGES_6FDDBD68.length; i++) {
    const [entryLvl, startIdx, endIdx] = WARP_LEVEL_RANGES_6FDDBD68[i]!;
    if (entryLvl === lvl) {
      if (startIdx <= endIdx) {
        for (let idx = startIdx; idx <= endIdx; idx++) {
          const [wStyle, wSeq, wType9] = WARP_TILE_DESC_6FDDBF28[idx]!;
          if (wStyle === style && wSeq === seq && wType9 === type9) {
            return idx;
          }
        }
      }
    }
  }
  return -1;
}

/**
 * `@va D2Common:0x6FDB85D0` (`DRLGROOMTILE_CountPresetWallTileCells113c`, custom `eax = pRoomEx`, `edx = bNoExtraHeight`,
 * `ebx = pDefGrid`, `edi = pTypeGrid`, stack `[esp+4] = bNoExtraWidth`, `ret 4`).
 *
 * Scans `w = nTileWidth + (bNoExtraWidth == 0 ? 1 : 0)` by `h = nTileHeight + (bNoExtraHeight == 0 ? 1 : 0)` cells
 * in `pTypeGrid` (`D2DrlgGridStrc`: `+0x00 = pCells`, `+0x04 = pRowOffsets`) and `pDefGrid`:
 * - `tileType == 3`: `pTileGrid->nWallCapacity (+0x18) += 1`
 * - `tileType in {10, 11}`: if `pDefGrid[y][x] & 0x80000000`, `pTileGrid->nFloorCapacity (+0x20) += 6`;
 *   else `pTileGrid->nWallCapacity (+0x18) += 1`.
 */
export function DRLGROOMTILE_CountPresetWallTileCells113c(
  m: Memory113c,
  pRoomEx: number,
  bNoExtraHeight: number,
  pDefGrid: number,
  pTypeGrid: number,
  bNoExtraWidth: number,
): void {
  const w =
    ((m.get(pRoomEx, D2RoomExStrc.nTileWidth) | 0) + ((bNoExtraWidth | 0) === 0 ? 1 : 0)) | 0;
  const h =
    ((m.get(pRoomEx, D2RoomExStrc.nTileHeight) | 0) + ((bNoExtraHeight | 0) === 0 ? 1 : 0)) | 0;
  const pTileGrid = m.get(pRoomEx, D2RoomExStrc.pTileGrid);

  if (h > 0) {
    for (let y = 0; y < h; y++) {
      if (w > 0) {
        for (let x = 0; x < w; x++) {
          const typeRowOffsets = m.u32((pTypeGrid + 4) >>> 0);
          const typeRowStart = m.u32((typeRowOffsets + y * 4) >>> 0) | 0;
          const typeCells = m.u32(pTypeGrid);
          const typeVal = m.u32((typeCells + ((typeRowStart + x) | 0) * 4) >>> 0) | 0;

          if (typeVal === 3) {
            m.set(
              pTileGrid,
              D2DrlgTileGridStrc.nWallCapacity,
              (m.get(pTileGrid, D2DrlgTileGridStrc.nWallCapacity) + 1) >>> 0,
            );
          } else if (typeVal > 9 && typeVal <= 11) {
            const defRowOffsets = m.u32((pDefGrid + 4) >>> 0);
            const defRowStart = m.u32((defRowOffsets + y * 4) >>> 0) | 0;
            const defCells = m.u32(pDefGrid);
            const defVal = m.u32((defCells + ((defRowStart + x) | 0) * 4) >>> 0);
            if ((defVal & 0x80000000) !== 0) {
              m.set(
                pTileGrid,
                D2DrlgTileGridStrc.nFloorCapacity,
                (m.get(pTileGrid, D2DrlgTileGridStrc.nFloorCapacity) + 6) >>> 0,
              );
            } else {
              m.set(
                pTileGrid,
                D2DrlgTileGridStrc.nWallCapacity,
                (m.get(pTileGrid, D2DrlgTileGridStrc.nWallCapacity) + 1) >>> 0,
              );
            }
          }
        }
      }
    }
  }
}

/**
 * `@va D2Common:0x6FDB8660` (`DRLGROOMTILE_CountAllTileTypes113c`, custom `eax = pRoomEx`,
 * stack `[esp+4] = pFlagGrid`, `[esp+8] = bCheckRoomBounds`, `[esp+0xC] = bNoExtraWidth`, `[esp+0x10] = bNoExtraHeight`, `ret 0x10`).
 *
 * Scans `w = nTileWidth + (bNoExtraWidth == 0 ? 1 : 0)` by `h = nTileHeight + (bNoExtraHeight == 0 ? 1 : 0)` cells
 * in `pFlagGrid` (`D2DrlgGridStrc`: `+0x00 = pCells`, `+0x04 = pRowOffsets`):
 * - `cell & 0x01`: `pTileGrid->nWallCapacity (+0x18) += 1`
 * - `cell & 0x02`: `pTileGrid->nFloorCapacity (+0x20) += 1`
 * - else if `bCheckRoomBounds != 0` and `(nTileXPos + x, nTileYPos + y)` is inside `[nTileXPos..nTileXPos+nTileWidth) x [nTileYPos..nTileYPos+nTileHeight)`:
 *   `pTileGrid->nFloorCapacity (+0x20) += 1`
 * - `cell & 0x08000000`: `pTileGrid->nRoofCapacity (+0x28) += 1`.
 */
export function DRLGROOMTILE_CountAllTileTypes113c(
  m: Memory113c,
  pRoomEx: number,
  pFlagGrid: number,
  bCheckRoomBounds: number,
  bNoExtraWidth: number,
  bNoExtraHeight: number,
): void {
  const w =
    ((m.get(pRoomEx, D2RoomExStrc.nTileWidth) | 0) + ((bNoExtraWidth | 0) === 0 ? 1 : 0)) | 0;
  const h =
    ((m.get(pRoomEx, D2RoomExStrc.nTileHeight) | 0) + ((bNoExtraHeight | 0) === 0 ? 1 : 0)) | 0;
  const pTileGrid = m.get(pRoomEx, D2RoomExStrc.pTileGrid);
  const initX = m.get(pRoomEx, D2RoomExStrc.nTileXPos) | 0;
  let curTileY = m.get(pRoomEx, D2RoomExStrc.nTileYPos) | 0;

  if (h > 0) {
    for (let y = 0; y < h; y++, curTileY = (curTileY + 1) | 0) {
      if (w > 0) {
        for (let x = 0; x < w; x++) {
          const rowOffsets = m.u32((pFlagGrid + 4) >>> 0);
          const rowStart = m.u32((rowOffsets + y * 4) >>> 0) | 0;
          const cells = m.u32(pFlagGrid);
          const cell = m.u32((cells + ((rowStart + x) | 0) * 4) >>> 0);

          if ((cell & 0x01) !== 0) {
            m.set(
              pTileGrid,
              D2DrlgTileGridStrc.nWallCapacity,
              (m.get(pTileGrid, D2DrlgTileGridStrc.nWallCapacity) + 1) >>> 0,
            );
          }
          if ((cell & 0x02) !== 0) {
            m.set(
              pTileGrid,
              D2DrlgTileGridStrc.nFloorCapacity,
              (m.get(pTileGrid, D2DrlgTileGridStrc.nFloorCapacity) + 1) >>> 0,
            );
          } else if ((bCheckRoomBounds | 0) !== 0) {
            const curTileX = (initX + x) | 0;
            const rx = m.get(pRoomEx, D2RoomExStrc.nTileXPos) | 0;
            if (curTileX >= rx) {
              const ry = m.get(pRoomEx, D2RoomExStrc.nTileYPos) | 0;
              if (curTileY >= ry) {
                const rw = m.get(pRoomEx, D2RoomExStrc.nTileWidth) | 0;
                if (curTileX < ((rx + rw) | 0)) {
                  const rh = m.get(pRoomEx, D2RoomExStrc.nTileHeight) | 0;
                  if (curTileY < ((ry + rh) | 0)) {
                    m.set(
                      pTileGrid,
                      D2DrlgTileGridStrc.nFloorCapacity,
                      (m.get(pTileGrid, D2DrlgTileGridStrc.nFloorCapacity) + 1) >>> 0,
                    );
                  }
                }
              }
            }
          }
          if ((cell & 0x08000000) !== 0) {
            m.set(
              pTileGrid,
              D2DrlgTileGridStrc.nRoofCapacity,
              (m.get(pTileGrid, D2DrlgTileGridStrc.nRoofCapacity) + 1) >>> 0,
            );
          }
        }
      }
    }
  }
}

/**
 * `@va D2Common:0x6FDB9DA0` (`DRLGROOMTILE_MaxInt113c`, custom `ecx = a`, `edx = b`, `ret 8`).
 *
 * `mov eax, ecx; cmp eax, edx; jg +2; mov eax, edx; ret 8`.
 */
export function DRLGROOMTILE_MaxInt113c(a: number, b: number): number {
  const sa = a | 0;
  const sb = b | 0;
  return sa > sb ? sa : sb;
}

/**
 * `@va D2Common:0x6FDB9DB0` (`DRLGROOMTILE_MinInt113c`, custom `ecx = a`, `edx = b`, `ret 8`).
 *
 * `mov eax, ecx; cmp eax, edx; jl +2; mov eax, edx; ret 8`.
 */
export function DRLGROOMTILE_MinInt113c(a: number, b: number): number {
  const sa = a | 0;
  const sb = b | 0;
  return sa < sb ? sa : sb;
}
