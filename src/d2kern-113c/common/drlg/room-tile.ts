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
import { DATATBLS_GetLvlWarpTxtRecordByIdAndDir113c } from '../../tables/datatbls-113c.ts';
import {
  D2CommonAssertError,
  DATATBLS_ValidateMonStatsIdInline113c,
  SEED_RollRandomNumberInline113c,
} from '../inline-helpers.ts';
import { imul32 } from '../int-math.ts';
import { DRLGGRID_RasterizeThickLine113c } from './drlg-grid.ts';
import { DRLGROOM_AllocPresetUnit113c } from './drlg-room.ts';

const ROOMTILE_STACK_BASE = 0x7ff90000;
const ROOMTILE_STACK_SIZE = 0x100;
const _roomTileStackBuf = new ArrayBuffer(ROOMTILE_STACK_SIZE);
const _roomTileStackU8 = new Uint8Array(_roomTileStackBuf);
const _roomTileStackDV = new DataView(_roomTileStackBuf);

function withRoomTileStackScratch113c(m: Memory113c): Memory113c {
  const isStack = (p: number): boolean => {
    const u = p >>> 0;
    return u >= ROOMTILE_STACK_BASE && u < ROOMTILE_STACK_BASE + ROOMTILE_STACK_SIZE;
  };
  const self: Memory113c = {
    alloc: size => m.alloc(size),
    u8: p => (isStack(p) ? _roomTileStackU8[(p >>> 0) - ROOMTILE_STACK_BASE]! : m.u8(p)),
    u16: p => (isStack(p) ? _roomTileStackDV.getUint16((p >>> 0) - ROOMTILE_STACK_BASE, true) : m.u16(p)),
    u32: p => (isStack(p) ? _roomTileStackDV.getUint32((p >>> 0) - ROOMTILE_STACK_BASE, true) : m.u32(p)),
    setU8: (p, v) => {
      if (isStack(p)) _roomTileStackU8[(p >>> 0) - ROOMTILE_STACK_BASE] = v & 0xff;
      else m.setU8(p, v);
    },
    setU16: (p, v) => {
      if (isStack(p)) _roomTileStackDV.setUint16((p >>> 0) - ROOMTILE_STACK_BASE, v & 0xffff, true);
      else m.setU16(p, v);
    },
    setU32: (p, v) => {
      if (isStack(p)) _roomTileStackDV.setUint32((p >>> 0) - ROOMTILE_STACK_BASE, v >>> 0, true);
      else m.setU32(p, v);
    },
    get: (base, f, idx = 0) => {
      const width = f.type === 'u8' ? 1 : f.type === 'u16' ? 2 : 4;
      const addr = ((base >>> 0) + f.off + idx * width) >>> 0;
      return width === 1 ? self.u8(addr) : width === 2 ? self.u16(addr) : self.u32(addr);
    },
    set: (base, f, v, idx = 0) => {
      const width = f.type === 'u8' ? 1 : f.type === 'u16' ? 2 : 4;
      const addr = ((base >>> 0) + f.off + idx * width) >>> 0;
      if (width === 1) self.setU8(addr, v);
      else if (width === 2) self.setU16(addr, v);
      else self.setU32(addr, v);
    },
    fill: (p, len, v) => {
      if (isStack(p)) {
        const off = (p >>> 0) - ROOMTILE_STACK_BASE;
        _roomTileStackU8.fill(v & 0xff, off, off + len);
      } else {
        m.fill(p, len, v);
      }
    },
  };
  return self;
}

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

/**
 * `@va D2CMP:0x6FE22700` (`D2CMP.#10051` via `D2Common` thunk `0x6FD592FA`, stdcall `(pTileEntry)`, `ret 4`).
 *
 * Returns `movzx eax, word ptr [pTileEntry + 0x06]`.
 */
export function D2CMP_10051_GetTileFlags113c(m: Memory113c, pTileEntry: number): number {
  if (pTileEntry === 0) {
    throw new Error('D2CMP_10051_GetTileFlags113c: pTileEntry == 0');
  }
  return m.u16((pTileEntry + 0x06) >>> 0);
}

/**
 * `@va D2CMP:0x6FE22730` (`D2CMP.#10027` via `D2Common` thunk `0x6FD5930C`, stdcall `(pTileEntry)`, `ret 4`).
 *
 * Returns `dword ptr [pTileEntry + 0x20]`.
 */
export function D2CMP_10027_GetTileRarity113c(m: Memory113c, pTileEntry: number): number {
  if (pTileEntry === 0) {
    throw new Error('D2CMP_10027_GetTileRarity113c: pTileEntry == 0');
  }
  return m.u32((pTileEntry + 0x20) >>> 0) | 0;
}

/**
 * `@va D2CMP:0x6FE23140` (`D2CMP.#10059` via `D2Common` thunk `0x6FD59306`, stdcall
 * `(ppTileLibraryHash, nOrientation, nStyle, nSeq, pOutArray, nMax)`, `ret 0x18`).
 *
 * Walks up to 32 `D2TileLibraryHashStrc*` slots at `ppTileLibraryHash[0..31]` (`bucket = (((nStyle << 1) - nOrientation + nSeq) & 0x7f)`),
 * matching `(nOrientation, nStyle, nSeq)` in `pHash->pNodes[bucket]` (`+0x0C + bucket * 4`) and storing up to `nMax`
 * `D2TileLibraryEntryStrc*` pointers into `pOutArray`.
 */
export function D2CMP_10059_FindTiles113c(
  m: Memory113c,
  ppTileLibraryHash: number,
  nOrientation: number,
  nStyle: number,
  nSeq: number,
  pOutArray: number | Uint32Array,
  nMax: number,
): number {
  if (ppTileLibraryHash === 0) {
    throw new Error('D2CMP_10059_FindTiles113c: ppTileLibraryHash == 0');
  }
  let total = 0;
  const orient = nOrientation | 0;
  const style = nStyle | 0;
  const seq = nSeq | 0;
  const maxCount = nMax >>> 0;
  const bucket = ((((seq & 0xff) << 1) - (orient & 0xff) + (style & 0xff)) & 0x7f) >>> 0;

  for (let slot = 0; slot < 32; slot++) {
    const pHash = m.u32((ppTileLibraryHash + slot * 4) >>> 0);
    if (pHash === 0 || (total >>> 0) >= maxCount) break;
    const rem = (maxCount - (total >>> 0)) >>> 0;
    if (rem === 0) break;
    let pNode = m.u32((pHash + bucket * 4) >>> 0);
    while (pNode !== 0) {
      if (
        (m.u32(pNode) | 0) === style &&
        (m.u32((pNode + 0x04) >>> 0) | 0) === seq &&
        (m.u32((pNode + 0x08) >>> 0) | 0) === orient
      ) {
        let pBlock = m.u32((pNode + 0x0c) >>> 0);
        let found = 0;
        while (pBlock !== 0) {
          const pEntry = m.u32(pBlock);
          const outIdx = (total + found) >>> 0;
          if (typeof pOutArray === 'number') {
            m.setU32((pOutArray + outIdx * 4) >>> 0, pEntry);
          } else {
            pOutArray[outIdx] = pEntry;
          }
          found = (found + 1) >>> 0;
          if (found === rem) break;
          pBlock = m.u32((pBlock + 0x04) >>> 0);
        }
        total = (total + found) >>> 0;
        break;
      }
      pNode = m.u32((pNode + 0x10) >>> 0);
    }
  }
  return total | 0;
}

/**
 * `@va D2Common:0x6FD62E50` (`DRLGROOMTILE_CountPresetTileTypes113c`, custom `edi = pRoomEx`,
 * `eax = bNoExtraWidth`, `edx = bNoExtraHeight`, stack `[esp+4] = pFlagGrid`, `[esp+8] = pTypeGrid`,
 * `[esp+0xC] = nDefaultType`, `ret 0xC`).
 *
 * Scans `maxW = nTileWidth + (bNoExtraWidth == 0 ? 1 : 0)` by `maxH = nTileHeight + (bNoExtraHeight == 0 ? 1 : 0)`
 * cells in `pFlagGrid`; for cells with `(ebx & 0x08000003) != 0`, queries `D2CMP.#10059` (`pRoomEx + 0x68`)
 * and `D2CMP.#10051` (`wFlags & 0x0100`) and adds `count - 1` to `nFloorCapacity`, `nWallCapacity`, or `nRoofCapacity`
 * while setting `pRoomEx->dwFlags |= 0x08000000`.
 */
export function DRLGROOMTILE_CountPresetTileTypes113c(
  m: Memory113c,
  edi: number,
  eax: number,
  edx: number,
  pFlagGrid: number,
  pTypeGrid: number,
  nDefaultType: number,
): void {
  const maxW = ((m.u32((edi + 0x3c) >>> 0) | 0) + ((eax | 0) === 0 ? 1 : 0)) | 0;
  const maxH = ((m.u32((edi + 0x40) >>> 0) | 0) + ((edx | 0) === 0 ? 1 : 0)) | 0;
  const ebp = (m.u32((edi + 0x54) >>> 0) + 0x14) >>> 0;
  if (maxH <= 0) return;

  const localBuf = new Uint32Array(40);
  for (let y = 0; y < maxH; y++) {
    if (maxW <= 0) continue;
    for (let x = 0; x < maxW; x++) {
      const pFlagRows = m.u32((pFlagGrid + 0x04) >>> 0);
      const flagRowBase = m.u32((pFlagRows + y * 4) >>> 0) | 0;
      const pFlagCells = m.u32(pFlagGrid);
      const ebx = m.u32((pFlagCells + ((flagRowBase + x) | 0) * 4) >>> 0);
      if ((ebx & 0x08000003) === 0) continue;

      let orient: number;
      if (pTypeGrid !== 0) {
        const pTypeRows = m.u32((pTypeGrid + 0x04) >>> 0);
        const typeRowBase = m.u32((pTypeRows + y * 4) >>> 0) | 0;
        const pTypeCells = m.u32(pTypeGrid);
        orient = m.u32((pTypeCells + ((typeRowBase + x) | 0) * 4) >>> 0) | 0;
      } else {
        orient = nDefaultType | 0;
      }

      const style = ebx !== 0 ? (ebx >>> 20) & 0x3f : 0;
      const seq = ebx !== 0 ? (ebx >>> 8) & 0xff : 0;

      const count = D2CMP_10059_FindTiles113c(
        m,
        (edi + 0x68) >>> 0,
        orient,
        style,
        seq,
        localBuf,
        40,
      );
      if (count !== 0) {
        const flags = D2CMP_10051_GetTileFlags113c(m, localBuf[0]!);
        if ((flags & 0x0100) !== 0) {
          const addCount = (count - 1) | 0;
          if ((ebx & 0x02) !== 0) {
            m.setU32((ebp + 0x0c) >>> 0, (m.u32((ebp + 0x0c) >>> 0) + addCount) >>> 0);
          } else if ((ebx & 0x01) !== 0) {
            m.setU32((ebp + 0x04) >>> 0, (m.u32((ebp + 0x04) >>> 0) + addCount) >>> 0);
          } else {
            m.setU32((ebp + 0x14) >>> 0, (m.u32((ebp + 0x14) >>> 0) + addCount) >>> 0);
          }
          m.setU32((edi + 0x28) >>> 0, (m.u32((edi + 0x28) >>> 0) | 0x08000000) >>> 0);
        }
      }
    }
  }
}

/**
 * `@va D2Common:0x6FD69950` (`DRLGROOMTILE_GetWarpLevelsArray113c`, custom `eax = pLevel`, `edx = nLevelId`, plain `ret`).
 *
 * Walks `pLevel->pPreset (`+0x90`)` list (next at `+0x44`) comparing `*[pNode + 0x00] == nLevelId`;
 * on match returns `pNode + 0x24`. Otherwise validates `0 <= nLevelId < sgptDataTables->nLevelsTxtRecordCount (+0xC5C)`
 * and returns `gpLevelDefBin (`0x6FDF0B38`) + nLevelId * 0x9C + 0x68` (or `0x68` if out of bounds).
 */
export function DRLGROOMTILE_GetWarpLevelsArray113c(
  m: Memory113c,
  eax: number,
  edx: number,
): number {
  let pNode = m.u32((eax + 0x90) >>> 0);
  const lvl = edx | 0;
  while (pNode !== 0) {
    const ecx = m.u32(pNode) | 0;
    if (ecx === 0) {
      throw new D2CommonAssertError('..\\Source\\D2Common\\DATATBLS\\DataTbls.cpp', 418);
    }
    if (lvl === ecx) {
      return (pNode + 0x24) >>> 0;
    }
    pNode = m.u32((pNode + 0x44) >>> 0);
  }
  if (lvl < 0) {
    return 0x68;
  }
  const sgpt = m.u32(0x6fde9e1c);
  const nLevels = m.u32((sgpt + 0x0c5c) >>> 0) | 0;
  if (lvl >= nLevels) {
    return 0x68;
  }
  const pLevelDefBin = m.u32(0x6fdf0b38);
  return (pLevelDefBin + Math.imul(lvl, 0x9c) + 0x68) >>> 0;
}

/**
 * `@va D2Common:0x6FDB7F50` (`DRLGROOMTILE_FreeTileDataArrays113c`, custom `eax = pRoomEx`, `edi = pMemPool`, plain `ret`).
 *
 * If `pRoomEx->pTileGrid (+0x54)` is non-NULL, frees non-NULL `pWalls (+0x14)`, `pFloors (+0x1C)`,
 * and `pRoofs (+0x24)` via `Fog.#10046` in that exact order.
 */
export function DRLGROOMTILE_FreeTileDataArrays113c(
  m: Memory113c,
  eax: number,
  _edi: number,
): void {
  const pTileGrid = m.u32((eax + 0x54) >>> 0);
  if (pTileGrid === 0) return;
  const esi = (pTileGrid + 0x14) >>> 0;
  if (esi === 0) return;
  const freeFn = (m as { free?: (p: number) => void }).free;
  const pWalls = m.u32(esi);
  if (pWalls !== 0) {
    freeFn?.call(m, pWalls);
  }
  const pFloors = m.u32((esi + 0x08) >>> 0);
  if (pFloors !== 0) {
    freeFn?.call(m, pFloors);
  }
  const pRoofs = m.u32((esi + 0x10) >>> 0);
  if (pRoofs !== 0) {
    freeFn?.call(m, pRoofs);
  }
}

/**
 * `@va D2Common:0x6FDB7FD0` (`DRLGROOMTILE_ReallocRoofTiles113c`, custom `esi = pTileGrid`, `edi = nAddRoofs`, plain `ret`).
 *
 * If `nAddRoofs != 0`, reallocates `pTileGrid->pRoofs (+0x24)` via `Fog.#10047` to `(nRoofCapacity + nAddRoofs) * 48`
 * bytes, links existing `0 .. nRoofs - 2` entries via `pNext (+0x20)`, zeroes `pNext` of `max(0, nRoofs - 1)`,
 * and increments `nRoofCapacity (+0x28)` by `nAddRoofs`.
 */
export function DRLGROOMTILE_ReallocRoofTiles113c(
  m: Memory113c,
  esi: number,
  edi: number,
): void {
  if (edi === 0) return;
  const curCap = m.u32((esi + 0x28) >>> 0);
  const newBytes = Math.imul((curCap + edi) | 0, 0x30) >>> 0;
  const newRoofs = m.alloc(newBytes);
  m.setU32((esi + 0x24) >>> 0, newRoofs);

  let eax = 0;
  const firstLimit = ((m.u32((esi + 0x10) >>> 0) | 0) - 1) | 0;
  if (firstLimit > 0) {
    let edx = 0;
    do {
      const ecx = (m.u32((esi + 0x24) >>> 0) + edx) >>> 0;
      m.setU32((ecx + 0x20) >>> 0, (ecx + 0x30) >>> 0);
      const limit = ((m.u32((esi + 0x10) >>> 0) | 0) - 1) | 0;
      eax = (eax + 1) | 0;
      edx = (edx + 0x30) | 0;
      if (eax >= limit) break;
    } while (true);
  }
  const tailOff = Math.imul(eax, 0x30) >>> 0;
  const baseRoofs = m.u32((esi + 0x24) >>> 0);
  m.setU32((baseRoofs + tailOff + 0x20) >>> 0, 0);
  m.setU32((esi + 0x28) >>> 0, (m.u32((esi + 0x28) >>> 0) + edi) >>> 0);
}

/**
 * `@va D2Common:0x6FDB8040` (`DRLGROOMTILE_AllocTileData113c`, custom `eax = pRoomEx`, plain `ret`).
 *
 * Allocates and zero-fills `pFloors` (`nFloorCapacity * 48`), `pWalls` (`nWallCapacity * 48`),
 * and `pRoofs` (`nRoofCapacity * 48`, only when `pRoofs == 0`) via `Fog.#10045`.
 */
export function DRLGROOMTILE_AllocTileData113c(m: Memory113c, eax: number): void {
  const pLevel = m.u32((eax + 0x58) >>> 0);
  const pDrlg = m.u32((pLevel + 0x1b4) >>> 0);
  void m.u32((pDrlg + 0x478) >>> 0);

  const pTileGrid = m.u32((eax + 0x54) >>> 0);
  const nFloorCap = m.u32((pTileGrid + 0x20) >>> 0);
  const esi = (pTileGrid + 0x14) >>> 0;

  if (nFloorCap !== 0) {
    const pFloors = m.alloc(Math.imul(nFloorCap, 0x30) >>> 0);
    const zeroBytes = Math.imul(m.u32((esi + 0x0c) >>> 0), 0x30) >>> 0;
    m.setU32((esi + 0x08) >>> 0, pFloors);
    m.fill(pFloors, zeroBytes, 0);
  }

  const nWallCap = m.u32((esi + 0x04) >>> 0);
  if (nWallCap !== 0) {
    const pWalls = m.alloc(Math.imul(nWallCap, 0x30) >>> 0);
    const zeroBytes = Math.imul(m.u32((esi + 0x04) >>> 0), 0x30) >>> 0;
    m.setU32(esi, pWalls);
    m.fill(pWalls, zeroBytes, 0);
  }

  const nRoofCap = m.u32((esi + 0x14) >>> 0);
  if (nRoofCap !== 0 && m.u32((esi + 0x10) >>> 0) === 0) {
    const pRoofs = m.alloc(Math.imul(nRoofCap, 0x30) >>> 0);
    m.setU32((esi + 0x10) >>> 0, pRoofs);
    const zeroBytes = Math.imul(m.u32((esi + 0x14) >>> 0), 0x30) >>> 0;
    m.fill(pRoofs, zeroBytes, 0);
  }
}

/**
 * `@va D2Common:0x6FDB8B90` (`DRLGROOMTILE_GetTileCache113c`, custom `ecx = pRoomEx`, `eax = dwTileFlags`,
 * stack `[esp+4] = nOrientation`, `ret 4`).
 *
 * Queries `D2CMP.#10059` (`pRoomEx + 0x68`, `nOrientation`, `style`, `seq`); if 0 matches, falls back to
 * `(10, 0, 0)` and returns the first entry. Otherwise sums `D2CMP.#10027` rarities across matches, rolls
 * `pRoomEx->pSeed (+0x14)` when `totalRarity > 0`, and selects the weighted tile entry.
 */
export function DRLGROOMTILE_GetTileCache113c(
  m: Memory113c,
  ecx: number,
  eax: number,
  nOrientation: number,
): number {
  let style = 0;
  let seq = 0;
  if (eax !== 0) {
    style = (eax >>> 20) & 0x3f;
    seq = (eax >>> 8) & 0xff;
  }

  const localTiles = new Uint32Array(40);
  const ppHash = (ecx + 0x68) >>> 0;
  const ebp = D2CMP_10059_FindTiles113c(
    m,
    ppHash,
    nOrientation | 0,
    style,
    seq,
    localTiles,
    40,
  );
  if (ebp === 0) {
    const fallback = D2CMP_10059_FindTiles113c(m, ppHash, 10, 0, 0, localTiles, 40);
    if (fallback === 0) {
      throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\RoomTile.cpp', 115);
    }
    return localTiles[0]!;
  }

  let totalRarity = 0;
  for (let i = 0; (i >>> 0) < (ebp >>> 0); i++) {
    const pEntry = localTiles[i]!;
    if (pEntry === 0) {
      throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\RoomTile.cpp', 124);
    }
    totalRarity = (totalRarity + D2CMP_10027_GetTileRarity113c(m, pEntry)) | 0;
  }

  const edx = SEED_RollRandomNumberInline113c(m, (ecx + 0x14) >>> 0, totalRarity);

  let idx = 0;
  let rem = (edx + 1) | 0;
  if (totalRarity !== 0) {
    while ((ebp >>> 0) > 1 && rem > 0) {
      const r = D2CMP_10027_GetTileRarity113c(m, localTiles[idx]!);
      rem = (rem - r) | 0;
      idx = (idx + 1) | 0;
    }
    if (idx !== 0) {
      idx = (idx - 1) | 0;
    }
  }
  return localTiles[idx]!;
}

/**
 * `@va D2Common:0x6FDB8CD0` (`DRLGROOMTILE_InitRoofTileData113c`, custom `ecx = pRoomEx`, `edx = nX`,
 * `ebx = dwTileFlags`, stack `[esp+4] = ppTileList`, `[esp+8] = nY`, `[esp+0xC] = pTileCache`, `ret 0xC`).
 *
 * Initializes roof `D2DrlgTileDataStrc` at `&pTileGrid->pRoofs[pTileGrid->nRoofs++]`, optionally prepends
 * it to `*ppTileList`, computes relative and isometric coordinates, and translates `dwTileFlags` +
 * `D2CMP.#10051(pTileCache)` into `pTileData->dwFlags (+0x14)`. Returns `pTileData`.
 */
export function DRLGROOMTILE_InitRoofTileData113c(
  m: Memory113c,
  ecx: number,
  edx: number,
  ebx: number,
  ppTileList: number,
  nY: number,
  pTileCache: number,
): number {
  const pTileGrid = m.u32((ecx + 0x54) >>> 0);
  const nRoofs = m.u32((pTileGrid + 0x10) >>> 0);
  const esi = (m.u32((pTileGrid + 0x24) >>> 0) + Math.imul(nRoofs, 0x30)) >>> 0;

  if (ppTileList !== 0) {
    const prevHead = m.u32(ppTileList);
    m.setU32((esi + 0x20) >>> 0, prevHead);
    m.setU32(ppTileList, esi);
  } else {
    m.setU32((esi + 0x20) >>> 0, 0);
  }

  m.setU32((pTileGrid + 0x10) >>> 0, (m.u32((pTileGrid + 0x10) >>> 0) + 1) >>> 0);

  const relX = (edx - (m.u32((ecx + 0x34) >>> 0) | 0)) | 0;
  m.setU32((esi + 0x08) >>> 0, relX >>> 0);

  const y = nY | 0;
  const relY = (y - (m.u32((ecx + 0x38) >>> 0) | 0)) | 0;
  m.setU32((esi + 0x0c) >>> 0, relY >>> 0);

  const yPlus1 = (y + 1) | 0;
  const isoX = (Math.imul((edx - yPlus1) | 0, 5) << 4) | 0;
  m.setU32(esi, isoX >>> 0);

  const isoY = (((Math.imul((yPlus1 + edx) | 0, 5) << 4) >> 1) + 0x28) | 0;
  m.setU32((esi + 0x04) >>> 0, isoY >>> 0);
  m.setU32((esi + 0x18) >>> 0, pTileCache >>> 0);
  m.setU32((esi + 0x1c) >>> 0, 0x0d);
  m.setU32((esi + 0x14) >>> 0, 0);
  m.setU32((esi + 0x24) >>> 0, 0);
  m.setU8((esi + 0x29) >>> 0, 0xff);
  m.setU8((esi + 0x2a) >>> 0, 0xff);
  m.setU8((esi + 0x28) >>> 0, 0xff);

  let flags = 0;
  if ((ebx & 0x80) !== 0) {
    flags = 1;
  }
  if ((ebx & 0x10000000) !== 0) {
    flags |= 0x102;
  }
  if ((ebx & 0x20000) !== 0) {
    flags |= 0x40;
  }
  if ((ebx & 0x10000) !== 0) {
    flags |= 0x80;
  }
  if ((ebx & 0x08) !== 0) {
    flags |= 0x04;
  }
  if ((ebx | 0) < 0) {
    flags |= 0x08;
  } else {
    flags &= ~0x08;
  }
  if ((ebx & 0x04000000) !== 0) {
    flags |= 0x20c;
  }
  if ((ebx & 0x20000000) !== 0) {
    flags |= 0x800;
  }
  if ((ebx & 0x04) !== 0) {
    flags |= 0x2000;
  }

  const tileFlags = D2CMP_10051_GetTileFlags113c(m, pTileCache);
  if ((tileFlags & 0x01) !== 0) {
    flags |= 0x04;
  }
  if ((tileFlags & 0x04) !== 0) {
    flags |= 0x800;
  }
  m.setU32((esi + 0x14) >>> 0, flags >>> 0);
  return esi >>> 0;
}

/**
 * `@va D2Common:0x6FDB8DF0` (`DRLGROOMTILE_InitTileData113c`, custom `eax = pRoomEx`, `esi = pTileData`,
 * `edx = nX`, `ecx = nY`, stack `[esp+4] = dwTileFlags`, `[esp+8] = pTileCache`, `ret 8`).
 *
 * Initializes floor/wall `D2DrlgTileDataStrc` at `esi`, computes relative and isometric coordinates
 * when `pRoomEx != 0`, and populates `pTileData->dwFlags (+0x14)` from `dwTileFlags` (including layer
 * bits `(((dwTileFlags >> 18) & 3) + 1) << 14`) and `D2CMP.#10051(pTileCache)`.
 */
export function DRLGROOMTILE_InitTileData113c(
  m: Memory113c,
  eax: number,
  esi: number,
  edx: number,
  ecx: number,
  dwTileFlags: number,
  pTileCache: number,
): void {
  m.setU32((esi + 0x18) >>> 0, pTileCache >>> 0);
  m.setU32((esi + 0x1c) >>> 0, 0);
  m.setU32((esi + 0x14) >>> 0, 0);
  m.setU32((esi + 0x24) >>> 0, 0);
  m.setU8((esi + 0x29) >>> 0, 0xff);
  m.setU8((esi + 0x2a) >>> 0, 0xff);
  m.setU8((esi + 0x28) >>> 0, 0xff);

  if (eax !== 0) {
    const relX = (edx - (m.u32((eax + 0x34) >>> 0) | 0)) | 0;
    m.setU32((esi + 0x08) >>> 0, relX >>> 0);
    const relY = (ecx - (m.u32((eax + 0x38) >>> 0) | 0)) | 0;
    const yPlus1 = (ecx + 1) | 0;
    const isoX = (Math.imul((edx - yPlus1) | 0, 5) << 4) | 0;
    m.setU32(esi, isoX >>> 0);
    const isoY = (((Math.imul((yPlus1 + edx) | 0, 5) << 4) >> 1) + 0x28) | 0;
    m.setU32((esi + 0x0c) >>> 0, relY >>> 0);
    m.setU32((esi + 0x04) >>> 0, isoY >>> 0);
  }

  let flags = ((((dwTileFlags >>> 18) & 0x03) + 1) << 14) >>> 0;
  if ((dwTileFlags & 0x80) !== 0) {
    flags |= 0x01;
  }
  if ((dwTileFlags & 0x10000000) !== 0) {
    flags |= 0x102;
  }
  if ((dwTileFlags & 0x20000) !== 0) {
    flags |= 0x40;
  }
  if ((dwTileFlags & 0x10000) !== 0) {
    flags |= 0x80;
  }
  if ((dwTileFlags & 0x08) !== 0) {
    flags |= 0x04;
  }
  if ((dwTileFlags | 0) < 0) {
    flags |= 0x08;
  } else {
    flags &= ~0x08;
  }
  if ((dwTileFlags & 0x04000000) !== 0) {
    flags |= 0x20c;
  }
  if ((dwTileFlags & 0x20000000) !== 0) {
    flags |= 0x800;
  }
  if ((dwTileFlags & 0x04) !== 0) {
    flags |= 0x2000;
  }

  const tileFlags = D2CMP_10051_GetTileFlags113c(m, pTileCache);
  if ((tileFlags & 0x01) !== 0) {
    flags |= 0x04;
  }
  if ((tileFlags & 0x04) !== 0) {
    flags |= 0x800;
  }
  m.setU32((esi + 0x14) >>> 0, flags >>> 0);
}

/**
 * `@va D2Common:0x6FDBC5D0` (`DATATBLS_FindFloorWindowTileCacheEntry113c`, custom `ebx = nTileId`, `dl = nWallType`, `ret`).
 *
 * Scans `gpFloorWindowTileCache` (`0x6FDF142C`, count at `0x6FDF1430`, stride `0x30` = 48 bytes) for
 * `[pCur] == nTileId` where `nWallType == 0x62` (`'b'`), `u8(pCur + 0x2C) == 0x62`, or `u8(pCur + 0x2C) == nWallType`.
 */
export function DATATBLS_FindFloorWindowTileCacheEntry113c(
  m: Memory113c,
  nTileId: number,
  nWallType: number,
): number {
  let pCur = m.u32(0x6fdf142c);
  if (pCur === 0) {
    throw new D2CommonAssertError(
      '..\\Source\\D2Common\\DATATBLS\\DataTbls.cpp',
      811,
    );
  }
  const nCount = m.u32(0x6fdf1430) | 0;
  const targetId = nTileId | 0;
  const dl = nWallType & 0xff;
  for (let i = 0; i < nCount; i++) {
    if ((m.u32(pCur) | 0) === targetId) {
      if (dl === 0x62) {
        return pCur >>> 0;
      }
      const cl = m.u8((pCur + 0x2c) >>> 0);
      if (cl === 0x62 || cl === dl) {
        return pCur >>> 0;
      }
    }
    pCur = (pCur + 0x30) >>> 0;
  }
  throw new D2CommonAssertError(
    '..\\Source\\D2Common\\DATATBLS\\DataTbls.cpp',
    826,
  );
}

/**
 * `@va D2Common:0x6FDB8510` (`DRLGROOMTILE_FreeRoomTileGridAndAnimList113c`, `__stdcall(pRoomEx)`, `ret 4`).
 *
 * Calls `0x6FDB7F50` (`DRLGROOMTILE_FreeTileDataArrays113c`), then if `pRoomEx->pTileGrid (+0x54) != 0`,
 * frees all nodes on `pTileGrid->pAnimTiles (+0x00)` (next at `+0x08`), all nodes and their `[pNode]`
 * buffers on `pTileGrid->pMapLinks (+0x04)` (next at `+0x10`), and `pTileGrid` itself via `Fog.#10046`,
 * zeroing `pRoomEx->pTileGrid (+0x54)`.
 */
export function DRLGROOMTILE_FreeRoomTileGridAndAnimList113c(
  m: Memory113c,
  pRoomEx: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pLevel = m.u32((roomEx + 0x58) >>> 0);
  const pDrlg = m.u32((pLevel + 0x1b4) >>> 0);
  const pMemPool = m.u32((pDrlg + 0x478) >>> 0);
  DRLGROOMTILE_FreeTileDataArrays113c(m, roomEx, pMemPool);

  const pTileGrid = m.u32((roomEx + 0x54) >>> 0);
  if (pTileGrid !== 0) {
    const freeFn = (m as { free?: (p: number) => void }).free;
    let pAnim = m.u32(pTileGrid);
    while (pAnim !== 0) {
      const curAnim = pAnim;
      pAnim = m.u32((curAnim + 0x08) >>> 0);
      freeFn?.call(m, curAnim);
    }
    let pWall = m.u32((pTileGrid + 0x04) >>> 0);
    m.setU32(pTileGrid, 0);
    while (pWall !== 0) {
      const curWall = pWall;
      const pWallData = m.u32(curWall);
      pWall = m.u32((curWall + 0x10) >>> 0);
      if (pWallData !== 0) {
        freeFn?.call(m, pWallData);
      }
      freeFn?.call(m, curWall);
    }
    freeFn?.call(m, pTileGrid);
    m.setU32((roomEx + 0x54) >>> 0, 0);
  }
}

/**
 * `@va D2Common:0x6FDB8800` (`DRLGROOMTILE_UpdateWindowTileCacheEntry113c`, custom `esi = pWindowNode`, `[esp+4] = nOrientation`, `ret 4`).
 *
 * Asserts `pWindowNode != 0` (`line 627`) and `pCacheEntry = pWindowNode->pCacheEntry (+0x10) != 0` (`line 628`).
 * If `u8(pCacheEntry + 0x2C) != 0x62` (`'b'`), maps `nOrientation == 11 ? 0x72 ('r') : 0x6C ('l')` and updates
 * `pWindowNode->pCacheEntry (+0x10)` via `0x6FDBC5D0` (`DATATBLS_FindFloorWindowTileCacheEntry113c`) when different.
 */
export function DRLGROOMTILE_UpdateWindowTileCacheEntry113c(
  m: Memory113c,
  pWindowNode: number,
  nOrientation: number,
): void {
  if (pWindowNode === 0) {
    throw new D2CommonAssertError(
      '..\\Source\\D2Common\\DRLG\\RoomTile.cpp',
      627,
    );
  }
  const node = pWindowNode >>> 0;
  const pCacheEntry = m.u32((node + 0x10) >>> 0);
  if (pCacheEntry === 0) {
    throw new D2CommonAssertError(
      '..\\Source\\D2Common\\DRLG\\RoomTile.cpp',
      628,
    );
  }
  const cl = m.u8((pCacheEntry + 0x2c) >>> 0);
  if (cl === 0x62) {
    return;
  }
  const dl = (nOrientation | 0) === 0x0b ? 0x72 : 0x6c;
  if (cl !== dl) {
    const nTileId = m.u32(pCacheEntry) | 0;
    const pNewEntry = DATATBLS_FindFloorWindowTileCacheEntry113c(m, nTileId, dl);
    m.setU32((node + 0x10) >>> 0, pNewEntry);
  }
}

/**
 * `@va D2Common:0x6FDB9170` (`DRLGROOMTILE_InitFloorTileData113c`, not exported;
 * custom LTCG `eax = pRoomEx`, `ecx = ppTileList`,
 * stack `[esp+4] = nX`, `[esp+8] = nY`, `[esp+0xC] = dwTileFlags`, `[esp+0x10] = pTileCache`, `ret 0x10`).
 *
 * Indexes `pTileData = &pRoomEx->pTileGrid (+0x54)->pFloors (+0x1C)[nFloorCount (+0x0C)]` (stride `0x30`),
 * optionally prepends `pTileData` to `*ppTileList` via `pTileData->pNext (+0x20)` (or zeroes `pNext` when `ppTileList == 0`),
 * increments `pTileGrid->nFloorCount (+0x0C)`, calls `0x6FDB8DF0` (`DRLGROOMTILE_InitTileData113c`), and returns `pTileData`.
 */
export function DRLGROOMTILE_InitFloorTileData113c(
  m: Memory113c,
  pRoomEx: number,
  ppTileList: number,
  nX: number,
  nY: number,
  dwTileFlags: number,
  pTileCache: number,
): number {
  const roomEx = pRoomEx >>> 0;
  const ppList = ppTileList >>> 0;
  const pTileGrid = m.get(roomEx, D2RoomExStrc.pTileGrid);
  const idx = m.get(pTileGrid, D2DrlgTileGridStrc.nFloorCount) | 0;
  const pTileData = (m.get(pTileGrid, D2DrlgTileGridStrc.pFloors) + imul32(idx, 0x30)) >>> 0;
  if (ppList !== 0) {
    m.set(pTileData, D2DrlgTileDataStrc.pNext, m.u32(ppList));
    m.setU32(ppList, pTileData);
  } else {
    m.set(pTileData, D2DrlgTileDataStrc.pNext, 0);
  }
  m.set(
    pTileGrid,
    D2DrlgTileGridStrc.nFloorCount,
    ((m.get(pTileGrid, D2DrlgTileGridStrc.nFloorCount) | 0) + 1) >>> 0,
  );
  DRLGROOMTILE_InitTileData113c(
    m,
    roomEx,
    pTileData,
    nX | 0,
    nY | 0,
    dwTileFlags >>> 0,
    pTileCache >>> 0,
  );
  return pTileData >>> 0;
}

/**
 * `@va D2Common:0x6FDB8780` (`DRLGROOMTILE_FindAdjacentRoomTileGrid113c`, custom `eax = dwPresetFlags`,
 * stack `[esp+4] = pRoomEx`, `[esp+8] = bFloor`, `[esp+0xC] = nX`, `[esp+0x10] = nY`, `[esp+0x14] = ppOutRoomEx`, `ret 0x14 -> D2DrlgTileDataStrc*`).
 *
 * Iterates `i = 0 .. pRoomEx->nRoomsNear (+0x2C) - 1`, skipping `pNear == pRoomEx`, and calls
 * `0x6FDB81A0` (`DRLGROOMTILE_FindPresetRoomTile113c`) on each neighbor `pNear = pRoomEx->ppRoomsNear (+0x08)[i]`.
 * On the first non-zero hit `pTile`, writes `*ppOutRoomEx = pRoomEx->ppRoomsNear[i]` and returns `pTile`;
 * otherwise writes `*ppOutRoomEx = 0` and returns `0`.
 */
export function DRLGROOMTILE_FindAdjacentRoomTileGrid113c(
  m: Memory113c,
  dwPresetFlags: number,
  pRoomEx: number,
  bFloor: number,
  nX: number,
  nY: number,
  ppOutRoomEx: number,
): number {
  const roomEx = pRoomEx >>> 0;
  const flags = dwPresetFlags >>> 0;
  const ppOut = ppOutRoomEx >>> 0;
  const nNear = m.get(roomEx, D2RoomExStrc.nRoomsNear) | 0;
  if (nNear > 0) {
    const ppNear = m.get(roomEx, D2RoomExStrc.ppRoomsNear);
    for (let i = 0; i < nNear; i++) {
      const pNear = m.u32((ppNear + i * 4) >>> 0);
      if (pNear !== roomEx) {
        const pTile = DRLGROOMTILE_FindPresetRoomTile113c(
          m,
          pNear,
          flags,
          bFloor | 0,
          nX | 0,
          nY | 0,
        );
        if (pTile !== 0) {
          m.setU32(ppOut, m.u32((ppNear + i * 4) >>> 0));
          return pTile >>> 0;
        }
      }
    }
  }
  m.setU32(ppOut, 0);
  return 0;
}

/**
 * `.rdata` extended warp tile preset unit descriptor fields at `0x6FDDBF34..0x6FDDC2DF`
 * (`34` rows × `[nClassId, nUnitType, nOffsetX, nOffsetY]` at `+0x0C, +0x10, +0x14, +0x18`
 * within each 28-byte `0x6FDDBF28` entry).
 */
export const WARP_TILE_PRESET_UNIT_6FDDBF34: ReadonlyArray<readonly [number, number, number, number]> = [
  [14, 2, 5, 0],
  [13, 2, 0, 5],
  [16, 2, 0, 0],
  [15, 2, 0, 0],
  [27, 2, 5, -2],
  [24, 2, 1, 2],
  [23, 2, 0, 0],
  [25, 2, 1, 0],
  [62, 2, 0, 3],
  [63, 2, 3, 0],
  [16, 2, 0, 0],
  [64, 2, 0, 0],
  [47, 2, 5, 0],
  [291, 2, 2, 0],
  [290, 2, 0, 2],
  [293, 2, 2, 0],
  [292, 2, 0, 2],
  [295, 2, 2, 0],
  [294, 2, 0, 2],
  [92, 2, 1, 0],
  [91, 2, 0, 2],
  [229, 2, 0, 0],
  [230, 2, 0, 0],
  [449, 2, -2, 4],
  [435, 1, 1, 2],
  [435, 1, 2, 1],
  [435, 1, 1, 1],
  [433, 1, 0, 1],
  [432, 1, 1, 0],
  [434, 1, 0, 1],
  [524, 1, 0, 0],
  [525, 1, 0, 0],
  [60, 2, 2, 0],
  [60, 2, 0, 2],
];

/**
 * `@va D2Common:0x6FD8DC90` (`DRLGROOMTILE_RasterizeOutdoorRoadsToPreset113c`, not exported;
 * custom LTCG `eax = pRoomEx`, `ecx = pLevel`, `ret`).
 */
export function DRLGROOMTILE_RasterizeOutdoorRoadsToPreset113c(
  m: Memory113c,
  pRoomEx: number,
  pLevel: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const level = pLevel >>> 0;
  const pPreset = m.u32((roomEx + 0x20) >>> 0);
  const pOutdoors = m.u32((level + 0x14) >>> 0);
  const sm = withRoomTileStackScratch113c(m);
  const clipRect = ROOMTILE_STACK_BASE;
  sm.setU32(clipRect, (((sm.u32((roomEx + 0x34) >>> 0) | 0) - 1) | 0) >>> 0);
  sm.setU32((clipRect + 0x04) >>> 0, (((sm.u32((roomEx + 0x38) >>> 0) | 0) - 1) | 0) >>> 0);
  sm.setU32((clipRect + 0x08) >>> 0, (((sm.u32((roomEx + 0x3c) >>> 0) | 0) + 3) | 0) >>> 0);
  sm.setU32((clipRect + 0x0c) >>> 0, (((sm.u32((roomEx + 0x40) >>> 0) | 0) + 3) | 0) >>> 0);

  const nLists = sm.u32((pOutdoors + 0x260) >>> 0) | 0;
  for (let i = 0; i < nLists; i++) {
    let pSeg = sm.u32((pOutdoors + 0x68 + i * 4) >>> 0);
    while (pSeg !== 0) {
      const pNext = sm.u32((pSeg + 0x10) >>> 0);
      if (pNext !== 0) {
        DRLGGRID_RasterizeThickLine113c(sm, pSeg, clipRect, (pPreset + 0x3c) >>> 0, 1, 0, 2);
      }
      pSeg = pNext;
    }
  }
}

/**
 * `@va D2Common:0x6FDB8970` (`DRLGROOMTILE_SpawnWarpPresetUnit113c`, not exported;
 * custom LTCG `eax = nTileX`, `ecx = pRoomEx`, `[esp+4] = pTileData`, `[esp+8] = dwTileFlags`,
 * `[esp+0xC] = nTileY`, `[esp+0x10] = nTileType`, `ret 0x10`).
 */
export function DRLGROOMTILE_SpawnWarpPresetUnit113c(
  m: Memory113c,
  nTileX: number,
  pRoomEx: number,
  pTileData: number,
  dwTileFlags: number,
  nTileY: number,
  nTileType: number,
): void {
  const tileData = pTileData >>> 0;
  const roomEx = pRoomEx >>> 0;
  let bIsType9 = 0;
  if (tileData !== 0) {
    if ((m.u32((tileData + 0x14) >>> 0) & 0x20) !== 0) {
      return;
    }
    bIsType9 = (m.u32((tileData + 0x1c) >>> 0) | 0) === 9 ? 1 : 0;
  } else {
    bIsType9 = (nTileType | 0) === 9 ? 1 : 0;
  }

  const pLevel = m.u32((roomEx + 0x58) >>> 0);
  const nLevelId = m.u32((pLevel + 0x1d0) >>> 0) | 0;
  const idx = DRLGROOMTILE_LookupWarpTileEntryIndex113c(bIsType9, nLevelId, dwTileFlags >>> 0) | 0;
  if (idx === -1) {
    return;
  }

  const desc = WARP_TILE_PRESET_UNIT_6FDDBF34[idx]!;
  let nClassId = desc[0];
  const nUnitType = desc[1];
  const subtileX = (imul32(((nTileX | 0) - (m.u32((roomEx + 0x34) >>> 0) | 0)) | 0, 5) + desc[2]) | 0;
  const subtileY = (imul32(((nTileY | 0) - (m.u32((roomEx + 0x38) >>> 0) | 0)) | 0, 5) + desc[3]) | 0;
  const maxX = imul32(m.u32((roomEx + 0x3c) >>> 0) | 0, 5);
  const maxY = imul32(m.u32((roomEx + 0x40) >>> 0) | 0, 5);
  if (subtileX < 0 || subtileY < 0 || subtileX >= maxX || subtileY >= maxY) {
    return;
  }

  let nMode = 0;
  let doSpawn = true;
  if (nUnitType === 1) {
    nClassId = DATATBLS_ValidateMonStatsIdInline113c(m, nClassId) | 0;
    nMode = 1;
  } else if (nUnitType === 2 && nClassId >= 0x5b && nClassId <= 0x5c) {
    if (SEED_RollRandomNumberInline113c(m, (roomEx + 0x14) >>> 0, 3) === 0) {
      doSpawn = false;
    }
  }

  if (doSpawn) {
    const pDrlg = m.u32((pLevel + 0x1b4) >>> 0);
    const pMemPool = m.u32((pDrlg + 0x478) >>> 0);
    DRLGROOM_AllocPresetUnit113c(m, pMemPool, roomEx, nUnitType, nClassId, nMode, subtileX, subtileY);
  }
  if (tileData !== 0) {
    m.setU32((tileData + 0x14) >>> 0, (m.u32((tileData + 0x14) >>> 0) | 0x20) >>> 0);
  }
}

/**
 * `@va D2Common:0x6FDB9090` (`DRLGROOMTILE_AllocLevelWarpPresetUnit113c`, not exported;
 * custom LTCG `eax = dwTileFlags`, `ecx = pRoomEx`, `[esp+4] = nTileX`, `[esp+8] = nTileY`,
 * `[esp+0xC] = nTileType`, `ret 0xC -> BOOL`).
 */
export function DRLGROOMTILE_AllocLevelWarpPresetUnit113c(
  m: Memory113c,
  dwTileFlags: number,
  pRoomEx: number,
  nTileX: number,
  nTileY: number,
  nTileType: number,
): number {
  const roomEx = pRoomEx >>> 0;
  const flags = dwTileFlags >>> 0;
  const pLevel = m.u32((roomEx + 0x58) >>> 0);
  const pDrlg = m.u32((pLevel + 0x1b4) >>> 0);
  const pWarpLevels = DRLGROOMTILE_GetWarpLevelsArray113c(
    m,
    pDrlg,
    m.u32((pLevel + 0x1d0) >>> 0) | 0,
  ) >>> 0;
  const nTargetLevel = m.u32((pWarpLevels + (((flags >>> 20) & 0x3f) << 2)) >>> 0) | 0;
  const nDir = (nTileType | 0) === 11 ? 0x72 : 0x6c;
  const pLvlWarp = DATATBLS_GetLvlWarpTxtRecordByIdAndDir113c(m, nTargetLevel, nDir) >>> 0;
  if (pLvlWarp === 0) {
    return 0;
  }

  const relX = ((nTileX | 0) - (m.u32((roomEx + 0x34) >>> 0) | 0)) | 0;
  const relY = ((nTileY | 0) - (m.u32((roomEx + 0x38) >>> 0) | 0)) | 0;
  if (
    relX === (m.u32((roomEx + 0x3c) >>> 0) | 0) ||
    relY === (m.u32((roomEx + 0x40) >>> 0) | 0)
  ) {
    return 0;
  }

  const subtileX = (imul32(relX, 5) + (m.u32((pLvlWarp + 0x1c) >>> 0) | 0)) | 0;
  const subtileY = (imul32(relY, 5) + (m.u32((pLvlWarp + 0x20) >>> 0) | 0)) | 0;
  const pMemPool = m.u32((pDrlg + 0x478) >>> 0);
  DRLGROOM_AllocPresetUnit113c(m, pMemPool, roomEx, 5, m.u32(pLvlWarp) | 0, 0, subtileX, subtileY);
  return 1;
}

/**
 * `@va D2Common:0x6FDB8A90` (`DRLGROOMTILE_ApplyTileFlagsAndSpawnWarp113c`, not exported;
 * custom LTCG `eax = nTileX`, `ebx = dwTileFlags`, `ecx = pRoomEx`, `esi = pTileData`,
 * `[esp+4] = nTileType`, `[esp+8] = nTileY`, `ret 8`).
 */
export function DRLGROOMTILE_ApplyTileFlagsAndSpawnWarp113c(
  m: Memory113c,
  nTileX: number,
  dwTileFlags: number,
  pRoomEx: number,
  pTileData: number,
  nTileType: number,
  nTileY: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const tileData = pTileData >>> 0;
  const flags = dwTileFlags >>> 0;
  const tileType = nTileType | 0;

  if (roomEx !== 0 && (tileType === 9 || tileType === 8)) {
    DRLGROOMTILE_SpawnWarpPresetUnit113c(m, nTileX, roomEx, tileData, flags, nTileY, 0);
  }

  let outFlags = m.u32((tileData + 0x14) >>> 0);
  if (tileType !== 13) {
    outFlags = (outFlags | (((((flags >>> 18) & 3) << 14) + 0x4000) >>> 0)) >>> 0;
  }
  if (tileType === 14) {
    outFlags = (outFlags | 0x04) >>> 0;
  } else if (tileType === 11 || tileType === 10 || tileType === 9 || tileType === 8) {
    outFlags = (outFlags | 0x02) >>> 0;
  }

  if ((flags & 0x80) !== 0) {
    outFlags = (outFlags | 0x01) >>> 0;
  }
  if ((flags & 0x10000000) !== 0) {
    outFlags = (outFlags | 0x102) >>> 0;
  }
  if ((flags & 0x20000) !== 0) {
    outFlags = (outFlags | 0x40) >>> 0;
  }
  if ((flags & 0x10000) !== 0) {
    outFlags = (outFlags | 0x80) >>> 0;
  }
  if ((flags & 0x08) !== 0) {
    outFlags = (outFlags | 0x04) >>> 0;
  }
  if ((flags | 0) < 0) {
    outFlags = (outFlags | 0x08) >>> 0;
  } else {
    outFlags = (outFlags & ~0x08) >>> 0;
  }
  if ((flags & 0x4000000) !== 0) {
    outFlags = (outFlags | 0x20c) >>> 0;
  }
  if ((flags & 0x20000000) !== 0) {
    outFlags = (outFlags | 0x800) >>> 0;
  }
  if ((flags & 0x04) !== 0) {
    outFlags = (outFlags | 0x2000) >>> 0;
  }

  m.setU32((tileData + 0x14) >>> 0, outFlags);
  const cmpFlags = D2CMP_10051_GetTileFlags113c(m, m.u32((tileData + 0x18) >>> 0));
  if ((cmpFlags & 0x01) !== 0) {
    m.setU32((tileData + 0x14) >>> 0, (m.u32((tileData + 0x14) >>> 0) | 0x04) >>> 0);
  }
  if ((cmpFlags & 0x04) !== 0) {
    m.setU32((tileData + 0x14) >>> 0, (m.u32((tileData + 0x14) >>> 0) | 0x800) >>> 0);
  }
}

