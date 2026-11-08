/**
 * Diablo II v1.13c `D2Common.dll` DRLG grid, seed, preset-unit, and template helpers
 * (`Drlg\DrlgGrid.cpp`, `Drlg\DrlgPreset.cpp`, `Drlg\DrlgTileSub.cpp`, `Seed.cpp`),
 * image base `0x6FD50000`.
 *
 * Every function below is a 1:1 port of the cited disassembly (`objdump -d -M intel` on `D2Common.dll`).
 */
import {
  D2DrlgCoordStrc,
  D2DrlgGridStrc,
  D2DrlgMapStrc,
  D2PresetUnitStrc,
  D2RoomExStrc,
} from '../../mem/layout.generated.ts';
import type { Memory113c } from '../../mem/sparse-memory.ts';
import { SEED_RollRandomNumberInline113c } from '../inline-helpers.ts';
import { imul32, sdiv32, smod32 } from '../int-math.ts';
import {
  DRLGOUTDOORS_ClearOutdoorCellFlag200_113c,
  DRLGOUTDOORS_MapPresetSlotIndex113c,
  DRLGOUTDOORS_SetOutdoorCellFlag200_113c,
  DRLGOUTDOORS_SpawnOutdoorRoomEx113c,
} from './outdoors.ts';

/**
 * Function pointer table `gafGridCellOps` at `0x6FDEB244` (`uint32[6]`, 24 bytes: `0x6FDEB244 .. 0x6FDEB25B`).
 * Copied verbatim from `D2Common.dll` v1.13c `.data`:
 * - `[0]` (`0x6FDEB244`): `0x6FD86C10` (`DRLGGRID_OpOr113c`, `*pCell |= uVal`)
 * - `[1]` (`0x6FDEB248`): `0x6FD86C00` (`DRLGGRID_OpAnd113c`, `*pCell &= uVal`)
 * - `[2]` (`0x6FDEB24C`): `0x6FD86BF0` (`DRLGGRID_OpXor113c`, `*pCell ^= uVal`)
 * - `[3]` (`0x6FDEB250`): `0x6FD86C20` (`DRLGGRID_OpOverwrite113c`, `*pCell = uVal`)
 * - `[4]` (`0x6FDEB254`): `0x6FD86BE0` (`DRLGGRID_OpOverwriteIfZero113c`, `if (*pCell == 0) *pCell = uVal`)
 * - `[5]` (`0x6FDEB258`): `0x6FD86BD0` (`DRLGGRID_OpAndNegated113c`, `*pCell &= ~uVal`)
 */
export const GAF_GRID_CELL_OPS_6FDEB244 = Uint32Array.from([
  0x6fd86c10,
  0x6fd86c00,
  0x6fd86bf0,
  0x6fd86c20,
  0x6fd86be0,
  0x6fd86bd0,
]);

function applyCellOp(
  m: Memory113c,
  pCell: number,
  uVal: number,
  eFlagOp: number,
): void {
  const addr = pCell >>> 0;
  const v = uVal >>> 0;
  switch (eFlagOp | 0) {
    case 0:
      m.setU32(addr, (m.u32(addr) | v) >>> 0);
      break;
    case 1:
      m.setU32(addr, (m.u32(addr) & v) >>> 0);
      break;
    case 2:
      m.setU32(addr, (m.u32(addr) ^ v) >>> 0);
      break;
    case 3:
      m.setU32(addr, v);
      break;
    case 4: {
      const cur = m.u32(addr);
      m.setU32(addr, cur === 0 ? v : cur);
      break;
    }
    case 5:
      m.setU32(addr, (m.u32(addr) & (~v >>> 0)) >>> 0);
      break;
    default:
      throw new Error(`DRLGGRID applyCellOp: invalid eFlagOp=${eFlagOp}`);
  }
}

/**
 * `@va D2Common:0x6FD5A360` (`DRLGPRESET_RelinkMapPresetUnitsToRoomEx113c`, custom `ebx = pRoomEx`, `ret`).
 *
 * Walks `pDrlgMap = pRoomEx->pTypeData (+0x20) -> pMap (+0x08)` preset unit list (`pDrlgMap + 0x38`),
 * unlinks every `D2PresetUnitStrc` whose `(nXpos, nYpos)` lies in `[5*nTileXPos, 5*(nTileXPos+nTileWidth)) x [5*nTileYPos, 5*(nTileYPos+nTileHeight))`,
 * translates `(nXpos, nYpos)` to room-relative subtiles, and prepends it to `pRoomEx->pPresetUnits (+0x5C)`.
 */
export function DRLGPRESET_RelinkMapPresetUnitsToRoomEx113c(
  m: Memory113c,
  pRoomEx: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pPresetRoom = m.get(roomEx, D2RoomExStrc.pTypeData);
  const pDrlgMap = m.u32((pPresetRoom + 0x08) >>> 0);
  let pNode = m.get(pDrlgMap, D2DrlgMapStrc.pPresetUnit);
  let pPrev = 0;
  if (pNode === 0) return;

  const tileX = m.get(roomEx, D2RoomExStrc.nTileXPos) | 0;
  const tileY = m.get(roomEx, D2RoomExStrc.nTileYPos) | 0;
  const tileW = m.get(roomEx, D2RoomExStrc.nTileWidth) | 0;
  const tileH = m.get(roomEx, D2RoomExStrc.nTileHeight) | 0;
  const minSubX = imul32(tileX, 5);
  const minSubY = imul32(tileY, 5);
  const maxSubX = imul32((tileX + tileW) | 0, 5);
  const maxSubY = imul32((tileY + tileH) | 0, 5);

  while (pNode !== 0) {
    const unitX = m.get(pNode, D2PresetUnitStrc.nXpos) | 0;
    const unitY = m.get(pNode, D2PresetUnitStrc.nYpos) | 0;
    if (
      unitX >= minSubX &&
      unitX < maxSubX &&
      unitY >= minSubY &&
      unitY < maxSubY
    ) {
      m.set(pNode, D2PresetUnitStrc.nXpos, ((unitX - minSubX) | 0) >>> 0);
      m.set(pNode, D2PresetUnitStrc.nYpos, ((unitY - minSubY) | 0) >>> 0);
      const pNext = m.get(pNode, D2PresetUnitStrc.pNext);
      if (pPrev === 0) {
        m.set(pDrlgMap, D2DrlgMapStrc.pPresetUnit, pNext);
      } else {
        m.set(pPrev, D2PresetUnitStrc.pNext, pNext);
      }
      const oldHead = m.get(roomEx, D2RoomExStrc.pPresetUnits);
      m.set(pNode, D2PresetUnitStrc.pNext, oldHead);
      m.set(roomEx, D2RoomExStrc.pPresetUnits, pNode);
      pNode = pNext;
    } else {
      pPrev = pNode;
      pNode = m.get(pNode, D2PresetUnitStrc.pNext);
    }
  }
}

/**
 * `@va D2Common:0x6FD86710` (`SEED_GetSeeds113c`, Ordinal `#10320`, `__fastcall(ecx=pSeed, edx=pLowSeed, [esp+4]=pHighSeed)`, `ret 4`).
 */
export function SEED_GetSeeds113c(
  m: Memory113c,
  pSeed: number,
  pLowSeed: number,
  pHighSeed: number,
): void {
  const addr = pSeed >>> 0;
  m.setU32(pLowSeed >>> 0, m.u32(addr));
  m.setU32(pHighSeed >>> 0, m.u32((addr + 4) >>> 0));
}

/**
 * `@va D2Common:0x6FD86720` (`SEED_SetSeeds113c`, Ordinal `#10963`, `__fastcall(ecx=pSeed, edx=nLowSeed, [esp+4]=nHighSeed)`, `ret 4`).
 */
export function SEED_SetSeeds113c(
  m: Memory113c,
  pSeed: number,
  nLowSeed: number,
  nHighSeed: number,
): void {
  const addr = pSeed >>> 0;
  m.setU32(addr, nLowSeed >>> 0);
  m.setU32((addr + 4) >>> 0, nHighSeed >>> 0);
}

/**
 * `@va D2Common:0x6FD86730` (`SEED_GetLowSeed113c`, Ordinal `#10513`, `__fastcall(ecx=pSeed) -> int32`, `ret`).
 */
export function SEED_GetLowSeed113c(m: Memory113c, pSeed: number): number {
  return m.u32(pSeed >>> 0) | 0;
}

/**
 * `@va D2Common:0x6FD867F0` (`DRLGGRID_InitializeGridWindow113c`, custom `ecx=pOutGrid, eax=pWindowBox, edi=nRowStride, [esp+4]=pBaseCells, [esp+8]=pRowOffsets`, `ret 8`).
 */
export function DRLGGRID_InitializeGridWindow113c(
  m: Memory113c,
  pOutGrid: number,
  pWindowBox: number,
  nRowStride: number,
  pBaseCells: number,
  pRowOffsets: number,
): void {
  const grid = pOutGrid >>> 0;
  const box = pWindowBox >>> 0;
  const stride = nRowStride | 0;
  const w = m.get(box, D2DrlgCoordStrc.nWidth) | 0;
  const h = m.get(box, D2DrlgCoordStrc.nHeight) | 0;
  const posX = m.get(box, D2DrlgCoordStrc.nPosX) | 0;
  const posY = m.get(box, D2DrlgCoordStrc.nPosY) | 0;
  m.set(grid, D2DrlgGridStrc.nWidth, w >>> 0);
  m.set(grid, D2DrlgGridStrc.nHeight, h >>> 0);
  const startCellIdx = (imul32(posY, stride) + posX) | 0;
  m.set(grid, D2DrlgGridStrc.pCells, (pBaseCells + (startCellIdx << 2)) >>> 0);
  m.set(grid, D2DrlgGridStrc.pRowOffsets, pRowOffsets >>> 0);
  let rowOff = 0;
  for (let i = 0; i < h; i++) {
    const curRowOffsets = m.get(grid, D2DrlgGridStrc.pRowOffsets);
    m.setU32((curRowOffsets + i * 4) >>> 0, rowOff >>> 0);
    rowOff = (rowOff + stride) | 0;
  }
  m.set(grid, D2DrlgGridStrc.bInitialized, 1);
}

/**
 * `@va D2Common:0x6FD86900` (`DRLGGRID_InitializeGridCells113c`, custom `edx=pOutGrid, eax=pCellsBuf, ebx=nWidth, esi=nHeight, [esp+4]=pRowOffsetsBuf`, `ret 4`).
 */
export function DRLGGRID_InitializeGridCells113c(
  m: Memory113c,
  pOutGrid: number,
  pCellsBuf: number,
  nWidth: number,
  nHeight: number,
  pRowOffsetsBuf: number,
): void {
  const grid = pOutGrid >>> 0;
  const cells = pCellsBuf >>> 0;
  const w = nWidth | 0;
  const h = nHeight | 0;
  m.set(grid, D2DrlgGridStrc.pCells, cells);
  m.set(grid, D2DrlgGridStrc.nWidth, w >>> 0);
  m.set(grid, D2DrlgGridStrc.nHeight, h >>> 0);
  const totalBytes = (imul32(w, h) << 2) >>> 0;
  m.fill(cells, totalBytes, 0);
  m.set(grid, D2DrlgGridStrc.pRowOffsets, pRowOffsetsBuf >>> 0);
  let rowOff = 0;
  for (let i = 0; i < h; i++) {
    const curRowOffsets = m.get(grid, D2DrlgGridStrc.pRowOffsets);
    m.setU32((curRowOffsets + i * 4) >>> 0, rowOff >>> 0);
    rowOff = (rowOff + w) | 0;
  }
  m.set(grid, D2DrlgGridStrc.bInitialized, 0);
}

/**
 * `@va D2Common:0x6FD86A60` (`DRLGGRID_ApplyBorderCellFlags113c`, custom `esi=pGrid, ebx=nValue, edi=eFlagOp`, `ret`).
 */
export function DRLGGRID_ApplyBorderCellFlags113c(
  m: Memory113c,
  pGrid: number,
  nValue: number,
  eFlagOp: number,
): void {
  const grid = pGrid >>> 0;
  const w = m.get(grid, D2DrlgGridStrc.nWidth) | 0;
  if (w > 0) {
    for (let x = 0; x < w; x++) {
      const h = m.get(grid, D2DrlgGridStrc.nHeight) | 0;
      const pRowOffsets = m.get(grid, D2DrlgGridStrc.pRowOffsets);
      const botRowOff = m.u32((pRowOffsets + (h - 1) * 4) >>> 0) | 0;
      const pCells = m.get(grid, D2DrlgGridStrc.pCells);
      applyCellOp(
        m,
        (pCells + (((botRowOff + x) | 0) << 2)) >>> 0,
        nValue,
        eFlagOp,
      );
      const pRowOffsets2 = m.get(grid, D2DrlgGridStrc.pRowOffsets);
      const topRowOff = m.u32(pRowOffsets2) | 0;
      const pCells2 = m.get(grid, D2DrlgGridStrc.pCells);
      applyCellOp(
        m,
        (pCells2 + (((topRowOff + x) | 0) << 2)) >>> 0,
        nValue,
        eFlagOp,
      );
    }
  }
  const h = m.get(grid, D2DrlgGridStrc.nHeight) | 0;
  let rem = (h - 1) | 0;
  if (rem > 0) {
    let rowPtr = (m.get(grid, D2DrlgGridStrc.pRowOffsets) + 4) >>> 0;
    while (rem !== 0) {
      const rowOff = m.u32(rowPtr) | 0;
      const curW = m.get(grid, D2DrlgGridStrc.nWidth) | 0;
      const pCells = m.get(grid, D2DrlgGridStrc.pCells);
      applyCellOp(
        m,
        (pCells + (((rowOff + curW - 1) | 0) << 2)) >>> 0,
        nValue,
        eFlagOp,
      );
      const rowOff2 = m.u32(rowPtr) | 0;
      const pCells2 = m.get(grid, D2DrlgGridStrc.pCells);
      applyCellOp(m, (pCells2 + (rowOff2 << 2)) >>> 0, nValue, eFlagOp);
      rowPtr = (rowPtr + 4) >>> 0;
      rem = (rem - 1) | 0;
    }
  }
}

/**
 * `@va D2Common:0x6FD86B10` (`DRLGGRID_ApplyAllCellFlags113c`, custom `ebx=pGrid, [esp+4]=nValue, [esp+8]=eFlagOp`, `ret 8`).
 */
export function DRLGGRID_ApplyAllCellFlags113c(
  m: Memory113c,
  pGrid: number,
  nValue: number,
  eFlagOp: number,
): void {
  const grid = pGrid >>> 0;
  const h = m.get(grid, D2DrlgGridStrc.nHeight) | 0;
  if (h <= 0) return;
  for (let y = 0; y < h; y++) {
    const w = m.get(grid, D2DrlgGridStrc.nWidth) | 0;
    if (w > 0) {
      for (let x = 0; x < w; x++) {
        const pRowOffsets = m.get(grid, D2DrlgGridStrc.pRowOffsets);
        const rowOff = m.u32((pRowOffsets + y * 4) >>> 0) | 0;
        const pCells = m.get(grid, D2DrlgGridStrc.pCells);
        applyCellOp(
          m,
          (pCells + (((rowOff + x) | 0) << 2)) >>> 0,
          nValue,
          eFlagOp,
        );
      }
    }
  }
}

/**
 * `@va D2Common:0x6FD86BD0` (`DRLGGRID_OpAndNegated113c`, `__fastcall(ecx=pCell, edx=nValue) -> uint32`, `ret`).
 *
 * `gafGridCellOps[5]`: `*pCell &= ~nValue; return *pCell;`.
 */
export function DRLGGRID_OpAndNegated113c(
  m: Memory113c,
  pCell: number,
  nValue: number,
): number {
  const addr = pCell >>> 0;
  const res = (m.u32(addr) & (~nValue >>> 0)) >>> 0;
  m.setU32(addr, res);
  return res | 0;
}

/**
 * `@va D2Common:0x6FD86BE0` (`DRLGGRID_OpOverwriteIfZero113c`, `__fastcall(ecx=pCell, edx=nValue) -> uint32`, `ret`).
 *
 * `gafGridCellOps[4]`: `old = *pCell; if (old == 0) *pCell = nValue; else *pCell = old; return old;`.
 */
export function DRLGGRID_OpOverwriteIfZero113c(
  m: Memory113c,
  pCell: number,
  nValue: number,
): number {
  const addr = pCell >>> 0;
  const old = m.u32(addr);
  if (old === 0) {
    m.setU32(addr, nValue >>> 0);
  } else {
    m.setU32(addr, old);
  }
  return old | 0;
}

/**
 * `@va D2Common:0x6FD86BF0` (`DRLGGRID_OpXor113c`, `__fastcall(ecx=pCell, edx=nValue)`, `ret`).
 *
 * `gafGridCellOps[2]`: `*pCell ^= nValue`.
 */
export function DRLGGRID_OpXor113c(
  m: Memory113c,
  pCell: number,
  nValue: number,
): void {
  const addr = pCell >>> 0;
  m.setU32(addr, (m.u32(addr) ^ nValue) >>> 0);
}

/**
 * `@va D2Common:0x6FD86C00` (`DRLGGRID_OpAnd113c`, `__fastcall(ecx=pCell, edx=nValue)`, `ret`).
 *
 * `gafGridCellOps[1]`: `*pCell &= nValue`.
 */
export function DRLGGRID_OpAnd113c(
  m: Memory113c,
  pCell: number,
  nValue: number,
): void {
  const addr = pCell >>> 0;
  m.setU32(addr, (m.u32(addr) & nValue) >>> 0);
}

/**
 * `@va D2Common:0x6FD86C10` (`DRLGGRID_OpOr113c`, `__fastcall(ecx=pCell, edx=nValue)`, `ret`).
 *
 * `gafGridCellOps[0]`: `*pCell |= nValue`.
 */
export function DRLGGRID_OpOr113c(
  m: Memory113c,
  pCell: number,
  nValue: number,
): void {
  const addr = pCell >>> 0;
  m.setU32(addr, (m.u32(addr) | nValue) >>> 0);
}

/**
 * `@va D2Common:0x6FD86C20` (`DRLGGRID_OpOverwrite113c`, `__fastcall(ecx=pCell, edx=nValue)`, `ret`).
 *
 * `gafGridCellOps[3]`: `*pCell = nValue`.
 */
export function DRLGGRID_OpOverwrite113c(
  m: Memory113c,
  pCell: number,
  nValue: number,
): void {
  m.setU32(pCell >>> 0, nValue >>> 0);
}

/**
 * `@va D2Common:0x6FD86CD0` (`DRLGGRID_RasterizeThickLine113c`, custom `eax=pSegNode, esi=pClipRect, [esp+4]=pGrid, [esp+8]=nValue, [esp+0xC]=eFlagOp, [esp+0x10]=nThickness`, `ret 0x10`).
 */
export function DRLGGRID_RasterizeThickLine113c(
  m: Memory113c,
  pSegNode: number,
  pClipRect: number,
  pGrid: number,
  nValue: number,
  eFlagOp: number,
  nThickness: number,
): void {
  const seg = pSegNode >>> 0;
  const clip = pClipRect >>> 0;
  const grid = pGrid >>> 0;
  const thick = nThickness | 0;

  let curX = m.u32(seg) | 0;
  let curY = m.u32((seg + 4) >>> 0) | 0;
  const pNext = m.u32((seg + 0x10) >>> 0);
  const rawDx = ((m.u32(pNext) | 0) - curX) | 0;
  const rawDy = ((m.u32((pNext + 4) >>> 0) | 0) - curY) | 0;

  const dx = rawDx < 0 ? -rawDx | 0 : rawDx;
  const signX = rawDx < 0 ? -1 : 1;
  const dy = rawDy < 0 ? -rawDy | 0 : rawDy;
  const signY = rawDy < 0 ? -1 : 1;

  let err = 0;

  const stampIfInClip = (wx: number, wy: number): void => {
    const clipX = m.get(clip, D2DrlgCoordStrc.nPosX) | 0;
    const clipY = m.get(clip, D2DrlgCoordStrc.nPosY) | 0;
    const clipW = m.get(clip, D2DrlgCoordStrc.nWidth) | 0;
    const clipH = m.get(clip, D2DrlgCoordStrc.nHeight) | 0;
    if (
      wx >= clipX &&
      wy >= clipY &&
      wx < ((clipX + clipW) | 0) &&
      wy < ((clipY + clipH) | 0)
    ) {
      const gx = (wx - clipX) | 0;
      const gy = (wy - clipY) | 0;
      const pRowOffsets = m.get(grid, D2DrlgGridStrc.pRowOffsets);
      const rowOff = m.u32((pRowOffsets + gy * 4) >>> 0) | 0;
      const pCells = m.get(grid, D2DrlgGridStrc.pCells);
      applyCellOp(
        m,
        (pCells + (((rowOff + gx) | 0) << 2)) >>> 0,
        nValue,
        eFlagOp,
      );
    }
  };

  if (dx < dy) {
    for (let k = 0; k < thick; k++) {
      stampIfInClip((curX + k) | 0, curY);
    }
    for (let step = 0; step < dy; step++) {
      curY = (curY + signY) | 0;
      err = (err + dx) | 0;
      if (err > dy) {
        curX = (curX + signX) | 0;
        err = (err - dy) | 0;
      }
      for (let k = 0; k < thick; k++) {
        stampIfInClip((curX + k) | 0, curY);
      }
    }
  } else {
    for (let k = 0; k < thick; k++) {
      stampIfInClip(curX, (curY + k) | 0);
    }
    for (let step = 0; step < dx; step++) {
      curX = (curX + signX) | 0;
      err = (err + dy) | 0;
      if (err > dx) {
        curY = (curY + signY) | 0;
        err = (err - dx) | 0;
      }
      for (let k = 0; k < thick; k++) {
        stampIfInClip(curX, (curY + k) | 0);
      }
    }
  }
}

function getGridCellPtr(
  m: Memory113c,
  pGridBase: number,
  x: number,
  y: number,
): number {
  const grid = pGridBase >>> 0;
  const pRowOffsets = m.u32((grid + 4) >>> 0);
  const rowOff = m.u32((pRowOffsets + (y | 0) * 4) >>> 0) | 0;
  const pCells = m.u32(grid);
  return (pCells + (((rowOff + (x | 0)) | 0) << 2)) >>> 0;
}

function readGridCellAt(
  m: Memory113c,
  pGridBase: number,
  x: number,
  y: number,
): number {
  return m.u32(getGridCellPtr(m, pGridBase, x, y));
}

/**
 * `@va D2Common:0x6FDD34D0` (`DRLGTILESUB_TestStampRoomTemplate113c`, `__stdcall(nX, nY, pSubstCtx, pBox, pLvlSub) -> int32`, `ret 0x14`).
 */
export function DRLGTILESUB_TestStampRoomTemplate113c(
  m: Memory113c,
  nX: number,
  nY: number,
  pSubstCtx: number,
  pBox: number,
  pLvlSub: number,
): number {
  const ctx = pSubstCtx >>> 0;
  const box = pBox >>> 0;
  const lvlSub = pLvlSub >>> 0;
  const nExtraGrids = m.u32((ctx + 0x2c) >>> 0) | 0;
  const boxH = m.get(box, D2DrlgCoordStrc.nHeight) | 0;
  if (boxH <= 0) return 1;

  for (let dy = 0; dy < boxH; dy++) {
    const boxW = m.get(box, D2DrlgCoordStrc.nWidth) | 0;
    if (boxW <= 0) continue;
    const boxX = m.get(box, D2DrlgCoordStrc.nPosX) | 0;
    const boxY = ((m.get(box, D2DrlgCoordStrc.nPosY) | 0) + dy) | 0;
    const pFloorCells = m.u32((lvlSub + 0xf4) >>> 0);
    const pFloorRowOffsets = m.u32((lvlSub + 0xf8) >>> 0);
    const floorRowBase =
      ((m.u32((pFloorRowOffsets + boxY * 4) >>> 0) | 0) + boxX) | 0;

    for (let dx = 0; dx < boxW; dx++) {
      const floorCellAddr =
        (pFloorCells + (((floorRowBase + dx) | 0) << 2)) >>> 0;
      let bActive = (m.u8(floorCellAddr) & 0x02) !== 0;
      if (!bActive && m.u32((lvlSub + 0xac) >>> 0) !== 0) {
        const curBoxY = ((m.get(box, D2DrlgCoordStrc.nPosY) | 0) + dy) | 0;
        const curBoxX = ((m.get(box, D2DrlgCoordStrc.nPosX) | 0) + dx) | 0;
        const pTypeRowOffsets = m.u32((lvlSub + 0xa8) >>> 0);
        const typeRowOff =
          ((m.u32((pTypeRowOffsets + curBoxY * 4) >>> 0) | 0) + curBoxX) | 0;
        const pTypeCells = m.u32((lvlSub + 0xa4) >>> 0);
        bActive = (m.u8((pTypeCells + (typeRowOff << 2)) >>> 0) & 0x01) !== 0;
      }
      if (bActive) {
        const wx = ((nX | 0) + dx) | 0;
        const wy = ((nY | 0) + dy) | 0;
        const pCtxFloorGrid = m.u32((ctx + 0x24) >>> 0);
        const ctxFloorVal = readGridCellAt(m, pCtxFloorGrid, wx, wy);
        if ((ctxFloorVal & 0x03f0ff00) !== 0 || (ctxFloorVal & 0x02) === 0) {
          return 0;
        }
        for (let k = 0; k < nExtraGrids; k++) {
          const pExtraGrid = m.u32((ctx + 0x14 + k * 4) >>> 0);
          if (pExtraGrid !== 0) {
            if ((readGridCellAt(m, pExtraGrid, wx, wy) & 0x01) !== 0) {
              return 0;
            }
          }
        }
      }
    }
  }
  return 1;
}

/**
 * `@va D2Common:0x6FDD37F0` (`DRLGTILESUB_MatchRoomTemplate113c`, custom `eax=nY, edi=pLvlSub, [esp+4]=nX, [esp+8]=pSubstCtx, [esp+0xC]=pBox -> int32`, `ret 0xC`).
 */
export function DRLGTILESUB_MatchRoomTemplate113c(
  m: Memory113c,
  nY: number,
  pLvlSub: number,
  nX: number,
  pSubstCtx: number,
  pBox: number,
): number {
  const lvlSub = pLvlSub >>> 0;
  const ctx = pSubstCtx >>> 0;
  const box = pBox >>> 0;
  const boxH = m.get(box, D2DrlgCoordStrc.nHeight) | 0;
  if (boxH <= 0) return 1;

  for (let dy = 0; dy < boxH; dy++) {
    const boxW = m.get(box, D2DrlgCoordStrc.nWidth) | 0;
    if (boxW <= 0) continue;
    const boxX = m.get(box, D2DrlgCoordStrc.nPosX) | 0;
    const boxY = ((m.get(box, D2DrlgCoordStrc.nPosY) | 0) + dy) | 0;

    for (let dx = 0; dx < boxW; dx++) {
      const tx = (boxX + dx) | 0;
      const wx = ((nX | 0) + dx) | 0;
      const wy = ((nY | 0) + dy) | 0;

      const tmplWall = readGridCellAt(m, (lvlSub + 0x54) >>> 0, tx, boxY);
      const pCtxWallGrid = m.u32((ctx + 0x04) >>> 0);
      const ctxWall = readGridCellAt(m, pCtxWallGrid, wx, wy);
      if (tmplWall !== ctxWall) return 0;

      const pDs1 = m.u32((lvlSub + 0x50) >>> 0);
      const tmplFloor =
        m.u32((pDs1 + 0x18) >>> 0) !== 0
          ? readGridCellAt(m, (lvlSub + 0xf4) >>> 0, tx, boxY)
          : 0;
      if ((tmplFloor & 0x02) !== 0) {
        const pCtxFloorGrid = m.u32((ctx + 0x24) >>> 0);
        const ctxFloor = readGridCellAt(m, pCtxFloorGrid, wx, wy);
        if (
          (ctxFloor & 0x02) === 0 ||
          ((ctxFloor ^ tmplFloor) & 0x03f0ff00) !== 0
        ) {
          return 0;
        }
      }

      const tmplType =
        m.u32((pDs1 + 0x14) >>> 0) !== 0
          ? readGridCellAt(m, (lvlSub + 0xa4) >>> 0, tx, boxY)
          : 0;
      if ((tmplType & 0x01) !== 0) {
        const pCtxTypeGrid = m.u32((ctx + 0x14) >>> 0);
        const ctxType = readGridCellAt(m, pCtxTypeGrid, wx, wy);
        if (
          (ctxType & 0x01) === 0 ||
          ((ctxType ^ tmplType) & 0x03f0ff00) !== 0
        ) {
          return 0;
        }
      }
    }
  }
  return 1;
}

/**
 * Static `.rdata` table at `0x6FDE36A8..0x6FDE3770` (`10` rows × `5` `int32`s = `200` bytes)
 * used by `0x6FD90C20` (`pfMapPresetId` in Act 5 substitution context `0x6FD91AD0`).
 * Columns: `[nStyle, nSeqMin, nSeqMax, nBaseDef, nBaseTundra]`.
 */
export const ACT5_SUB_PRESET_TABLE_6FDE36A8 = Int32Array.from([
  49, 1, 16, 915, 987,
  49, 31, 46, 915, 987,
  48, 1, 1, 883, 959,
  48, 2, 3, 881, 957,
  48, 4, 4, 884, 960,
  48, 5, 5, 895, 971,
  48, 6, 7, 893, 969,
  48, 8, 8, 896, 972,
  48, 30, 30, 0, 0,
  48, 31, 31, -5, -5,
]);

/**
 * `@va D2Common:0x6FD90C20` (`DRLGOUTROOM_MapAct5PresetId113c`, `__fastcall(ecx=pLevel, edx=nStyle, [esp+4]=nSeq) -> int32`, `ret 4`).
 * Genuine `D2DrlgSubstContextStrc.pfMapPresetId` (`ctx + 0x28`) wired at `0x6FD91B2D`.
 * Asserts via `Fog.#10024` + `exit(-1)` at `0x6FD90C3A` (when `nStyle != 0x30 && nStyle != 0x31`)
 * and at `0x6FD90C8A` (when no row in `ACT5_SUB_PRESET_TABLE_6FDE36A8` matches).
 */
export function DRLGOUTROOM_MapAct5PresetId113c(
  m: Memory113c,
  pLevel: number,
  nStyle: number,
  nSeq: number,
): number {
  const lvl = pLevel >>> 0;
  const style = nStyle | 0;
  const seq = nSeq | 0;
  if (style !== 0x30 && style !== 0x31) {
    throw new Error(
      `DRLGOUTROOM_MapAct5PresetId113c: Fog_10024 assert at 0x6FD90C3A (nStyle=${style})`,
    );
  }
  const bIsTundra = (m.u32((lvl + 0x1d0) >>> 0) | 0) === 0x75 ? 1 : 0;
  for (let row = 0; row < 10; row++) {
    const base = row * 5;
    if (
      style === ACT5_SUB_PRESET_TABLE_6FDE36A8[base]! &&
      seq >= ACT5_SUB_PRESET_TABLE_6FDE36A8[base + 1]! &&
      seq <= ACT5_SUB_PRESET_TABLE_6FDE36A8[base + 2]!
    ) {
      const presetBase =
        ACT5_SUB_PRESET_TABLE_6FDE36A8[base + 3 + bIsTundra]!;
      return (presetBase - ACT5_SUB_PRESET_TABLE_6FDE36A8[base + 1]! + seq) | 0;
    }
  }
  throw new Error(
    `DRLGOUTROOM_MapAct5PresetId113c: Fog_10024 assert at 0x6FD90C8A (nStyle=${style}, nSeq=${seq})`,
  );
}

/**
 * `@va D2Common:0x6FD90DB0` (`DRLGOUTROOM_CheckAct5Preset113c`, `__fastcall(ecx=pLevel, edx=worldX, [esp+4]=worldY, [esp+8]=curPresetVal, [esp+0xC]=valFloor, [esp+0x10]=valType) -> int32`, `ret 0x10`).
 * Genuine `D2DrlgSubstContextStrc.pfCustomCheck` (`ctx + 0x24`) wired at `0x6FD91B0D`.
 */
export function DRLGOUTROOM_CheckAct5Preset113c(
  m: Memory113c,
  pLevel: number,
  worldX: number,
  worldY: number,
  curPresetVal: number,
  _valFloor: number,
  valType: number,
): number {
  const lvl = pLevel >>> 0;
  const nSeq = (valType >>> 8) & 0xff;
  const nStyle = (valType >>> 20) & 0x3f;
  const mappedId = DRLGOUTROOM_MapAct5PresetId113c(m, lvl, nStyle, nSeq);
  if (mappedId === -5) return 1;
  if (mappedId !== (curPresetVal | 0)) return 0;
  const pOutdoors = m.u32((lvl + 0x14) >>> 0);
  const cellVal = readGridCellAt(m, (pOutdoors + 0x2c) >>> 0, worldX, worldY);
  return (~(cellVal >>> 10)) & 1;
}

/**
 * `@va D2Common:0x6FD92920` (`DRLGOUTDOORS_PickPresetFileIndex113c`, custom `eax=nLvlPrestId, edi=pLevel -> int32`, `ret`).
 *
 * Searches `pLevel->pCurrentPresets` (`pLevel + 0x1CC`, 16-byte nodes `{ dwDef, nFiles, nCurFile, pNext }`)
 * for a node matching `nLvlPrestId`. If not found, allocates a 16-byte node via `Fog.#10045` (`m.alloc(16)`),
 * initializes `dwDef = pPrest->dwDef (+0x00)`, `nFiles = pPrest->dwFiles (+0x40)`,
 * `nCurFile = SEED_RollRandomNumber(pLevel + 0x1C4, nFiles)`, prepends it to `pLevel + 0x1CC`,
 * and advances `nCurFile = (nCurFile + 1) % nFiles` (signed `idiv`), returning the new `nCurFile`.
 */
export function DRLGOUTDOORS_PickPresetFileIndex113c(
  m: Memory113c,
  nLvlPrestId: number,
  pLevel: number,
): number {
  const lvl = pLevel >>> 0;
  const prestId = nLvlPrestId | 0;
  let pNode = m.u32((lvl + 0x1cc) >>> 0);
  const pDrlg = m.u32((lvl + 0x1b4) >>> 0);
  const _pMemPool = m.u32((pDrlg + 0x478) >>> 0);
  void _pMemPool;
  while (pNode !== 0) {
    if ((m.u32(pNode) | 0) === prestId) break;
    pNode = m.u32((pNode + 0x0c) >>> 0);
  }
  if (pNode === 0) {
    let pPrest = 0;
    if (prestId >= 0) {
      const sgptDataTables = m.u32(0x6fde9e1c);
      const count = m.u32((sgptDataTables + 0xc68) >>> 0) | 0;
      if (prestId < count) {
        const sgpLvlPrestTxt = m.u32(0x6fdf0b3c);
        pPrest = (sgpLvlPrestTxt + imul32(prestId, 0x1b0)) >>> 0;
      }
    }
    pNode = m.alloc(0x10);
    m.fill(pNode, 0x10, 0);
    m.setU32(pNode, m.u32(pPrest));
    const nFiles = m.u32((pPrest + 0x40) >>> 0) | 0;
    m.setU32((pNode + 4) >>> 0, nFiles >>> 0);
    const initPick = SEED_RollRandomNumberInline113c(
      m,
      (lvl + 0x1c4) >>> 0,
      m.u32((pPrest + 0x40) >>> 0) | 0,
    );
    m.setU32((pNode + 8) >>> 0, initPick >>> 0);
    m.setU32((pNode + 0x0c) >>> 0, m.u32((lvl + 0x1cc) >>> 0));
    m.setU32((lvl + 0x1cc) >>> 0, pNode);
  }
  const nextPick = smod32(
    ((m.u32((pNode + 8) >>> 0) | 0) + 1) | 0,
    m.u32((pNode + 4) >>> 0) | 0,
  );
  m.setU32((pNode + 8) >>> 0, nextPick >>> 0);
  return nextPick;
}

/**
 * `@va D2Common:0x6FD92A70` (`DRLGOUTDOORS_SpawnPresetInGrid113c`, `__fastcall(ecx=pLevel, edx=worldX, [esp+4]=worldY, [esp+8]=nLvlPrestId, [esp+0xC]=nPickedFile, [esp+0x10]=bBorder) -> void`, `ret 0x10`).
 *
 * Genuine `D2DrlgSubstContextStrc.pfSpawnPreset` (`ctx + 0x34`) wired at `0x6FD91B25` and `0x6FD9316C`.
 * When `nPickedFile == -1`, calls `DRLGOUTDOORS_PickPresetFileIndex113c` (`0x6FD92920`).
 * Stamps `grid2C` (`pOutdoors + 0x2C`) via `DRLGGRID_OpAndNegated(0x000F0000)` + `DRLGGRID_OpOr((pickedFile << 16) | 0x200)`
 * (+ `DRLGGRID_OpOr(1)` when `bBorder != 0` and `nLvlPrestId` in `4..15` or `0x16C..0x177`),
 * clears `grid04` (`pOutdoors + 0x04`) over `[worldX..worldX+sizeX) x [worldY..worldY+sizeY)` via `DRLGGRID_OpOverwrite(0)` (`0x6FD86C20`),
 * and writes `nLvlPrestId` into `grid04[worldY][worldX]` via `DRLGGRID_OpOverwrite` (`0x6FD86C20`).
 */
export function DRLGOUTDOORS_SpawnPresetInGrid113c(
  m: Memory113c,
  pLevel: number,
  worldX: number,
  worldY: number,
  nLvlPrestId: number,
  nPickedFile: number,
  bBorder: number,
): void {
  const lvl = pLevel >>> 0;
  const pOutdoors = m.u32((lvl + 0x14) >>> 0);
  const prestId = nLvlPrestId | 0;
  let pPrest = 0;
  if (prestId >= 0) {
    const sgptDataTables = m.u32(0x6fde9e1c);
    const count = m.u32((sgptDataTables + 0xc68) >>> 0) | 0;
    if (prestId < count) {
      const sgpLvlPrestTxt = m.u32(0x6fdf0b3c);
      pPrest = (sgpLvlPrestTxt + imul32(prestId, 0x1b0)) >>> 0;
    }
  }
  const sizeX = sdiv32(m.u32((pPrest + 0x28) >>> 0) | 0, 8);
  const sizeY = sdiv32(m.u32((pPrest + 0x2c) >>> 0) | 0, 8);
  let pickedFile = nPickedFile | 0;
  if (pickedFile === -1) {
    pickedFile = DRLGOUTDOORS_PickPresetFileIndex113c(m, prestId, lvl);
  }
  const wx = worldX | 0;
  const wy = worldY | 0;
  const endY = (wy + sizeY) | 0;
  if (wy < endY) {
    const endX = (wx + sizeX) | 0;
    const orMask = ((pickedFile << 16) | 0x200) >>> 0;
    const grid2C = (pOutdoors + 0x2c) >>> 0;
    const grid04 = (pOutdoors + 0x04) >>> 0;
    for (let cy = wy; cy < endY; cy++) {
      for (let cx = wx; cx < endX; cx++) {
        const pCell2C = getGridCellPtr(m, grid2C, cx, cy);
        applyCellOp(m, pCell2C, 0x000f0000, 5);
        applyCellOp(m, pCell2C, orMask, 0);
        if (
          bBorder !== 0 &&
          ((prestId >= 4 && prestId <= 15) ||
            (prestId >= 0x16c && prestId <= 0x177))
        ) {
          applyCellOp(m, pCell2C, 1, 0);
        }
        const pCell04 = getGridCellPtr(m, grid04, cx, cy);
        applyCellOp(m, pCell04, 0, 3);
      }
    }
  }
  const pOrigin04 = getGridCellPtr(m, (pOutdoors + 0x04) >>> 0, wx, wy);
  applyCellOp(m, pOrigin04, prestId >>> 0, 3);
}

/**
 * `@va D2Common:0x6FDD3990` (`DRLGTILESUB_ApplyRoomTemplateCallbacks113c`, custom `edx=nOffset, [esp+4]=nX, [esp+8]=nY, [esp+0xC]=pSubstCtx, [esp+0x10]=pBox, [esp+0x14]=pLvlSub`, `ret 0x14`).
 */
export function DRLGTILESUB_ApplyRoomTemplateCallbacks113c(
  m: Memory113c,
  nOffset: number,
  nX: number,
  nY: number,
  pBox: number,
  pSubstCtx: number,
  pLvlSub: number,
): void {
  const ctx = pSubstCtx >>> 0;
  const box = pBox >>> 0;
  const lvlSub = pLvlSub >>> 0;
  const gridSize = m.u32((lvlSub + 0x4c) >>> 0) | 0;
  const startX = ((m.get(box, D2DrlgCoordStrc.nPosX) | 0) + (nOffset | 0)) | 0;
  const baseX = ((nX | 0) - smod32(nX | 0, gridSize)) | 0;
  const baseY = ((nY | 0) - smod32(nY | 0, gridSize)) | 0;
  const boxH = m.get(box, D2DrlgCoordStrc.nHeight) | 0;
  if (boxH <= 0) return;

  for (let dy = 0; dy < boxH; dy++) {
    const boxW = m.get(box, D2DrlgCoordStrc.nWidth) | 0;
    if (boxW <= 0) continue;
    const boxY = ((m.get(box, D2DrlgCoordStrc.nPosY) | 0) + dy) | 0;

    for (let dx = 0; dx < boxW; dx++) {
      const tx = (startX + dx) | 0;
      const pDs1 = m.u32((lvlSub + 0x50) >>> 0);
      const valType =
        m.u32((pDs1 + 0x14) >>> 0) !== 0
          ? readGridCellAt(m, (lvlSub + 0xa4) >>> 0, tx, boxY)
          : 0;
      const valFloor =
        m.u32((pDs1 + 0x18) >>> 0) !== 0
          ? readGridCellAt(m, (lvlSub + 0xf4) >>> 0, tx, boxY)
          : 0;
      const curGridSize = m.u32((lvlSub + 0x4c) >>> 0) | 0;
      const worldX = (baseX + imul32(dx, curGridSize)) | 0;
      const worldY = (baseY + imul32(dy, curGridSize)) | 0;
      const pLevel = m.u32(ctx);

      if ((valType & 0x01) !== 0) {
        const byte1 = (valType >>> 8) & 0xff;
        const idx = (byte1 - 1) | 0;
        const pfMapPresetId = m.u32((ctx + 0x28) >>> 0);
        let mappedId: number;
        if (pfMapPresetId !== 0) {
          if (pfMapPresetId !== 0x6fd90c20) {
            throw new Error(
              `DRLGTILESUB_ApplyRoomTemplateCallbacks113c: unknown pfMapPresetId=0x${pfMapPresetId.toString(16)}`,
            );
          }
          const argEdx = (valType >>> 20) & 0x3f;
          mappedId = DRLGOUTROOM_MapAct5PresetId113c(m, pLevel, argEdx, byte1);
        } else {
          mappedId = ((m.u32((ctx + 0x10) >>> 0) | 0) + idx) | 0;
        }
        const ignoreIdx = m.u32((ctx + 0x14) >>> 0) | 0;
        if (mappedId !== -5 && idx !== ignoreIdx) {
          const pfSpawnPreset = m.u32((ctx + 0x34) >>> 0);
          if (pfSpawnPreset !== 0x6fd92a70) {
            throw new Error(
              `DRLGTILESUB_ApplyRoomTemplateCallbacks113c: unknown pfSpawnPreset=0x${pfSpawnPreset.toString(16)}`,
            );
          }
          DRLGOUTDOORS_SpawnPresetInGrid113c(
            m,
            pLevel,
            worldX,
            worldY,
            mappedId,
            0,
            1,
          );
        }
      } else {
        const fnVa =
          (valFloor & 0x02) !== 0
            ? m.u32((ctx + 0x2c) >>> 0)
            : m.u32((ctx + 0x30) >>> 0);
        if (fnVa === 0x6fd922f0) {
          DRLGOUTDOORS_ClearOutdoorCellFlag200_113c(m, pLevel, worldX, worldY);
        } else if (fnVa === 0x6fd922a0) {
          DRLGOUTDOORS_SetOutdoorCellFlag200_113c(m, pLevel, worldX, worldY);
        } else {
          throw new Error(
            `DRLGTILESUB_ApplyRoomTemplateCallbacks113c: unknown floor callback=0x${fnVa.toString(16)}`,
          );
        }
      }
    }
  }
}

/**
 * `@va D2Common:0x6FDD3B30` (`DRLGTILESUB_CheckRoomTemplateCallbacks113c`, custom `esi=pSubstCtx, [esp+4]=nX, [esp+8]=nY, [esp+0xC]=pBox, [esp+0x10]=pLvlSub -> int32`, `ret 0x10`).
 */
export function DRLGTILESUB_CheckRoomTemplateCallbacks113c(
  m: Memory113c,
  pSubstCtx: number,
  nX: number,
  nY: number,
  pBox: number,
  pLvlSub: number,
): number {
  const ctx = pSubstCtx >>> 0;
  const box = pBox >>> 0;
  const lvlSub = pLvlSub >>> 0;
  const gridSize = m.u32((lvlSub + 0x4c) >>> 0) | 0;
  const baseX = ((nX | 0) - smod32(nX | 0, gridSize)) | 0;
  const baseY = ((nY | 0) - smod32(nY | 0, gridSize)) | 0;
  const boxH = m.get(box, D2DrlgCoordStrc.nHeight) | 0;
  if (boxH <= 0) return 1;

  for (let dy = 0; dy < boxH; dy++) {
    const boxW = m.get(box, D2DrlgCoordStrc.nWidth) | 0;
    if (boxW <= 0) continue;
    const boxX = m.get(box, D2DrlgCoordStrc.nPosX) | 0;
    const boxY = ((m.get(box, D2DrlgCoordStrc.nPosY) | 0) + dy) | 0;

    for (let dx = 0; dx < boxW; dx++) {
      const tx = (boxX + dx) | 0;
      const pDs1 = m.u32((lvlSub + 0x50) >>> 0);
      const valFloor =
        m.u32((pDs1 + 0x18) >>> 0) !== 0
          ? readGridCellAt(m, (lvlSub + 0xf4) >>> 0, tx, boxY)
          : 0;
      const valType =
        m.u32((pDs1 + 0x14) >>> 0) !== 0
          ? readGridCellAt(m, (lvlSub + 0xa4) >>> 0, tx, boxY)
          : 0;
      const curGridSize = m.u32((lvlSub + 0x4c) >>> 0) | 0;
      const worldX = (baseX + imul32(dx, curGridSize)) | 0;
      const worldY = (baseY + imul32(dy, curGridSize)) | 0;
      const pPresetGrid = m.u32((ctx + 0x08) >>> 0);
      const curPresetVal = readGridCellAt(m, pPresetGrid, worldX, worldY) | 0;
      const pfCustomCheck = m.u32((ctx + 0x24) >>> 0);
      const pLevel = m.u32(ctx);

      if (pfCustomCheck !== 0) {
        if (pfCustomCheck !== 0x6fd90db0) {
          throw new Error(
            `DRLGTILESUB_CheckRoomTemplateCallbacks113c: unknown pfCustomCheck=0x${pfCustomCheck.toString(16)}`,
          );
        }
        const ok = DRLGOUTROOM_CheckAct5Preset113c(
          m,
          pLevel,
          worldX,
          worldY,
          curPresetVal,
          valFloor,
          valType,
        );
        if (ok === 0) return 0;
      } else if ((valType & 0x01) !== 0) {
        const idx = (((valType >>> 8) & 0xff) - 1) | 0;
        if (idx !== (m.u32((ctx + 0x14) >>> 0) | 0)) {
          const expected = ((m.u32((ctx + 0x10) >>> 0) | 0) + idx) | 0;
          if (expected !== curPresetVal) return 0;
        }
        const pfTestFree1 = m.u32((ctx + 0x1c) >>> 0);
        if (pfTestFree1 !== 0x6fd92270) {
          throw new Error(
            `DRLGTILESUB_CheckRoomTemplateCallbacks113c: unknown pfTestFree1=0x${pfTestFree1.toString(16)}`,
          );
        }
        const ok = DRLGOUTDOORS_MapPresetSlotIndex113c(
          m,
          pLevel,
          worldX,
          worldY,
        );
        if (ok === 0) return 0;
      } else if ((valFloor & 0x02) !== 0) {
        const pfTestFree4 = m.u32((ctx + 0x20) >>> 0);
        if (pfTestFree4 !== 0x6fd92370) {
          throw new Error(
            `DRLGTILESUB_CheckRoomTemplateCallbacks113c: unknown pfTestFree4=0x${pfTestFree4.toString(16)}`,
          );
        }
        const ok = DRLGOUTDOORS_SpawnOutdoorRoomEx113c(
          m,
          pLevel,
          worldX,
          worldY,
          0,
          0,
          0,
        );
        if (ok === 0) return 0;
      }
    }
  }
  return 1;
}

/**
 * `D2Common.dll` `.idata` slot for `KERNEL32.GetSystemTimeAsFileTime` (used by `_time` at `0x6FD5265D`).
 *
 * `@va D2Common:0x6FDD91D4`
 */
export const KERNEL32_TIME_IAT_VA_6FDD91D4 = 0x6fdd91d4;

/**
 * `D2Common.dll` `.idata` slot for `KERNEL32.GetTickCount` (called at `0x6FD86770`).
 *
 * `@va D2Common:0x6FDD91FC`
 */
export const KERNEL32_GET_TICK_COUNT_IAT_VA_6FDD91FC = 0x6fdd91fc;

/**
 * `@va D2Common:0x6FD5A440` (`DRLGPRESET_FreePresetRoomGrids113c`, not exported;
 * custom LTCG `eax = pRoomEx`, `ebx = pMemPool`, plain `ret`).
 *
 * - Reads `pPresetRoom = pRoomEx->pTypeData (+0x20)`; if `0`, returns.
 * - Reads `pDrlgMap = pPresetRoom->pMap (+0x08)`; if `0`, returns.
 * - Reads `pDrlgFile = pDrlgMap->pFile (+0x0C)`; if `0`, returns.
 * - For `i = 0 .. pDrlgFile->nWalls (+0x14) - 1`:
 *   - frees non-NULL `pPresetRoom->pOrientationGrid[i].pRowOffsets (+0x64 + i*0x14)` and zeroes `[+0x60, +0x64]`;
 *   - frees non-NULL `pPresetRoom->pWallGrid[i].pRowOffsets (+0x14 + i*0x14)` and zeroes `[+0x10, +0x14]`.
 * - For `i = 0 .. pDrlgFile->nFloors (+0x18) - 1`:
 *   - frees non-NULL `pPresetRoom->pFloorGrid[i].pRowOffsets (+0xB4 + i*0x14)` and zeroes `[+0xB0, +0xB4]`.
 * - Frees non-NULL `pPresetRoom->pShadowGrid.pRowOffsets (+0xDC)` and zeroes `[+0xD8, +0xDC]`.
 */
export function DRLGPRESET_FreePresetRoomGrids113c(
  m: Memory113c,
  pRoomEx: number,
  _pMemPool: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pPresetRoom = m.u32((roomEx + 0x20) >>> 0);
  if (pPresetRoom === 0) return;
  const pDrlgMap = m.u32((pPresetRoom + 0x08) >>> 0);
  if (pDrlgMap === 0) return;
  const pDrlgFile = m.u32((pDrlgMap + 0x0c) >>> 0);
  if (pDrlgFile === 0) return;

  const freeFn = (m as { free?: (p: number) => void }).free;
  const nWalls = m.u32((pDrlgFile + 0x14) >>> 0) | 0;
  if (nWalls > 0) {
    for (let i = 0; i < nWalls; i++) {
      const oriOff = (pPresetRoom + 0x64 + i * 0x14) >>> 0;
      const pOriRowOffsets = m.u32(oriOff);
      if (pOriRowOffsets !== 0) {
        freeFn?.call(m, pOriRowOffsets);
      }
      m.setU32((oriOff - 4) >>> 0, 0);
      m.setU32(oriOff, 0);

      const wallOff = (pPresetRoom + 0x14 + i * 0x14) >>> 0;
      const pWallRowOffsets = m.u32(wallOff);
      if (pWallRowOffsets !== 0) {
        freeFn?.call(m, pWallRowOffsets);
      }
      m.setU32((wallOff - 4) >>> 0, 0);
      m.setU32(wallOff, 0);
    }
  }

  const nFloors = m.u32((pDrlgFile + 0x18) >>> 0) | 0;
  if (nFloors > 0) {
    for (let i = 0; i < nFloors; i++) {
      const flrOff = (pPresetRoom + 0xb4 + i * 0x14) >>> 0;
      const pFlrRowOffsets = m.u32(flrOff);
      if (pFlrRowOffsets !== 0) {
        freeFn?.call(m, pFlrRowOffsets);
      }
      m.setU32((flrOff - 4) >>> 0, 0);
      m.setU32(flrOff, 0);
    }
  }

  const pShadowRowOffsets = m.u32((pPresetRoom + 0xdc) >>> 0);
  if (pShadowRowOffsets !== 0) {
    freeFn?.call(m, pShadowRowOffsets);
  }
  m.setU32((pPresetRoom + 0xd8) >>> 0, 0);
  m.setU32((pPresetRoom + 0xdc) >>> 0, 0);
}

/**
 * `@va D2Common:0x6FD86760` (`D2Common.#10995` `SEED_GenerateLoopSeed113c`,
 * fastcall `ecx = nSalt`, plain `ret`).
 *
 * Combines `_time(0)` (`m.u32(0x6FDD91D4)`), `nSalt`, and `GetTickCount()` (`m.u32(0x6FDD91FC)`),
 * steps `eax = eax * 0x19660D + 0x3C6EF35F` 3 times, and returns `eax & 0x7FFFFFFF`.
 */
export function SEED_GenerateLoopSeed113c(
  m: Memory113c,
  nSalt: number,
): number {
  const t = m.u32(KERNEL32_TIME_IAT_VA_6FDD91D4);
  const ticks = m.u32(KERNEL32_GET_TICK_COUNT_IAT_VA_6FDD91FC);
  let eax = (((t + (nSalt | 0)) | 0) + ticks) | 0;
  eax = (imul32(eax, 0x19660d) + 0x3c6ef35f) | 0;
  eax = (imul32(eax, 0x19660d) + 0x3c6ef35f) | 0;
  eax = (imul32(eax, 0x19660d) + 0x3c6ef35f) | 0;
  return eax & 0x7fffffff;
}

/**
 * `@va D2Common:0x6FD86840` (`DRLGGRID_AllocGridWindowRowOffsets113c`, not exported;
 * custom LTCG `edi = pOutGrid`, `esi = pWindowBox`, `ebx = nRowStride`,
 * stack `[esp+4] = pMemPool`, `[esp+8] = pBaseCells`, `ret 8`).
 *
 * Sets `pOutGrid->nWidth`, `pOutGrid->nHeight`, and `pOutGrid->pCells = pBaseCells + (nPosY * nRowStride + nPosX) * 4`,
 * allocates `nHeight * 4` bytes at `pOutGrid->pRowOffsets (+0x04)`, fills row offsets `i * nRowStride`,
 * and sets `pOutGrid->bInitialized (+0x10) = 1`.
 */
export function DRLGGRID_AllocGridWindowRowOffsets113c(
  m: Memory113c,
  pOutGrid: number,
  pWindowBox: number,
  nRowStride: number,
  _pMemPool: number,
  pBaseCells: number,
): void {
  const grid = pOutGrid >>> 0;
  const box = pWindowBox >>> 0;
  const stride = nRowStride | 0;
  m.set(grid, D2DrlgGridStrc.nWidth, m.get(box, D2DrlgCoordStrc.nWidth));
  m.set(grid, D2DrlgGridStrc.nHeight, m.get(box, D2DrlgCoordStrc.nHeight));
  const posY = m.get(box, D2DrlgCoordStrc.nPosY) | 0;
  const posX = m.get(box, D2DrlgCoordStrc.nPosX) | 0;
  const startIdx = (imul32(posY, stride) + posX) | 0;
  m.set(grid, D2DrlgGridStrc.pCells, (pBaseCells + (startIdx << 2)) >>> 0);
  const hAlloc = m.get(box, D2DrlgCoordStrc.nHeight) | 0;
  const pRowOffsets = m.alloc((hAlloc << 2) >>> 0);
  m.set(grid, D2DrlgGridStrc.pRowOffsets, pRowOffsets);
  const h0 = m.get(box, D2DrlgCoordStrc.nHeight) | 0;
  if (h0 > 0) {
    let curOff = 0;
    let i = 0;
    do {
      const pRow = m.get(grid, D2DrlgGridStrc.pRowOffsets);
      m.setU32((pRow + i * 4) >>> 0, curOff >>> 0);
      const curH = m.get(box, D2DrlgCoordStrc.nHeight) | 0;
      curOff = (curOff + stride) | 0;
      i = (i + 1) | 0;
      if (i >= curH) break;
    } while (true);
  }
  m.set(grid, D2DrlgGridStrc.bInitialized, 1);
}

/**
 * `@va D2Common:0x6FD86950` (`DRLGGRID_AllocAndInitGridCells113c`, not exported;
 * custom LTCG `ebx = pOutGrid`, `ecx = pMemPool`, stack `[esp+4] = nWidth`, `[esp+8] = nHeight`, `ret 8`).
 *
 * Allocates a combined buffer of `((nWidth + 1) * nHeight) * 4` bytes, zeroes it, assigns
 * `pOutGrid->pRowOffsets = pBuf` and `pOutGrid->pCells = pBuf + nHeight * 4`, populates
 * `pRowOffsets[i] = i * nWidth` for `0 <= i < nHeight`, and sets `pOutGrid->bInitialized (+0x10) = 0`.
 */
export function DRLGGRID_AllocAndInitGridCells113c(
  m: Memory113c,
  pOutGrid: number,
  _pMemPool: number,
  nWidth: number,
  nHeight: number,
): void {
  const grid = pOutGrid >>> 0;
  const w = nWidth | 0;
  const h = nHeight | 0;
  m.set(grid, D2DrlgGridStrc.nWidth, w >>> 0);
  const totalBytes = (imul32((w + 1) | 0, h) << 2) >>> 0;
  m.set(grid, D2DrlgGridStrc.nHeight, h >>> 0);
  const pBuf = m.alloc(totalBytes);
  m.set(grid, D2DrlgGridStrc.pRowOffsets, pBuf);
  m.fill(pBuf, totalBytes, 0);
  const pRow0 = m.get(grid, D2DrlgGridStrc.pRowOffsets);
  m.set(grid, D2DrlgGridStrc.pCells, (pRow0 + (h << 2)) >>> 0);
  if (h > 0) {
    let curOff = 0;
    for (let i = 0; i < h; i++) {
      const pRow = m.get(grid, D2DrlgGridStrc.pRowOffsets);
      m.setU32((pRow + i * 4) >>> 0, curOff >>> 0);
      curOff = (curOff + w) | 0;
    }
  }
  m.set(grid, D2DrlgGridStrc.bInitialized, 0);
}

/**
 * `@va D2Common:0x6FDD0F70` (`DRLGLOGIC_FreeRoomLogicalInfo113c`, not exported;
 * stdcall `(pRoomEx)`, `ret 4`).
 *
 * Frees `pRoomEx->pTileGrid` (`+0x64` / logical room info):
 * - Reads `pRoomEx->pLevel (+0x58) -> pDrlg (+0x1B4) -> pMemPool (+0x478)`.
 * - If `pLogic = pRoomEx->pTileGrid (+0x64)` is non-NULL:
 *   - If `(u8(pLogic) & 0x02) != 0`, frees non-NULL `*(u32*)(pLogic + 0x0C)` and zeroes `[+0x08, +0x0C]`,
 *     then frees non-NULL `*(u32*)(pLogic + 0x20)` and zeroes `[+0x1C, +0x20]`.
 *   - Walks `pNode = *(u32*)(pLogic + 0x30)` via `pNext = *(u32*)(pNode + 0x2C)` and frees each node.
 *   - Frees `pLogic` and stores `0` at `pRoomEx + 0x64`.
 */
export function DRLGLOGIC_FreeRoomLogicalInfo113c(
  m: Memory113c,
  pRoomEx: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pLevel = m.get(roomEx, D2RoomExStrc.pLevel);
  const pDrlg = m.u32((pLevel + 0x1b4) >>> 0);
  const _pMemPool = m.u32((pDrlg + 0x478) >>> 0);
  void _pMemPool;
  const pLogic = m.u32((roomEx + 0x64) >>> 0);
  if (pLogic === 0) return;

  const freeFn = (m as { free?: (p: number) => void }).free;
  if ((m.u8(pLogic) & 0x02) !== 0) {
    const pRow0 = m.u32((pLogic + 0x0c) >>> 0);
    if (pRow0 !== 0) {
      freeFn?.call(m, pRow0);
    }
    m.setU32((pLogic + 0x08) >>> 0, 0);
    m.setU32((pLogic + 0x0c) >>> 0, 0);

    const pRow1 = m.u32((pLogic + 0x20) >>> 0);
    if (pRow1 !== 0) {
      freeFn?.call(m, pRow1);
    }
    m.setU32((pLogic + 0x1c) >>> 0, 0);
    m.setU32((pLogic + 0x20) >>> 0, 0);
  }

  let pNode = m.u32((pLogic + 0x30) >>> 0);
  while (pNode !== 0) {
    const pNext = m.u32((pNode + 0x2c) >>> 0);
    freeFn?.call(m, pNode);
    pNode = pNext;
  }
  freeFn?.call(m, pLogic);
  m.setU32((roomEx + 0x64) >>> 0, 0);
}

