/**
 * Diablo II v1.13c `D2Common.dll` room collision grid bounding-box and subtile mask helpers
 * (`Collision\Collisn.cpp`), image base `0x6FD50000`.
 *
 * Every function below is a 1:1 port of the cited disassembly (`objdump -d -M intel` on `D2Common.dll`).
 */
import { D2RoomCollisionGridStrc } from '../mem/layout.generated.ts';
import type { Memory113c } from '../mem/sparse-memory.ts';
import { imul32 } from './int-math.ts';

/**
 * `@va D2Common:0x6FD9AB60` (`COLLISION_SetMaskForBoundingBox113c`, custom `eax = pCollGrid`, `edx = pBox`, `[esp+4] = wMask`, `ret 4`).
 *
 * Translates `pBox` (`[nMinX, nMinY, nMaxX, nMaxY]`) by `(pCollGrid->nSubtileX, pCollGrid->nSubtileY)` (`+0x00`, `+0x04`)
 * and ORs `(uint16)wMask` into every subtile cell of `pCollGrid->pMapStart (+0x20)` (stride `pCollGrid->nSubtileWidth` at `+0x08`)
 * across `[rMinY .. rMaxY] x [rMinX .. rMaxX]`.
 */
export function COLLISION_SetMaskForBoundingBox113c(
  m: Memory113c,
  pCollGrid: number,
  pBox: number,
  wMask: number,
): void {
  const box = pBox >>> 0;
  const gridX = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileX) | 0;
  const gridY = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileY) | 0;
  const rMinX = ((m.u32(box) | 0) - gridX) | 0;
  const rMinY = ((m.u32((box + 4) >>> 0) | 0) - gridY) | 0;
  const rMaxX = ((m.u32((box + 8) >>> 0) | 0) - gridX) | 0;
  const rMaxY = ((m.u32((box + 0x0c) >>> 0) | 0) - gridY) | 0;
  if (rMinY > rMaxY) return;

  const stride = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileWidth) | 0;
  const pMapStart = m.get(pCollGrid, D2RoomCollisionGridStrc.pMapStart);
  const mask16 = wMask & 0xffff;

  for (let y = rMinY; y <= rMaxY; y++) {
    if (rMinX <= rMaxX) {
      const rowBase = imul32(stride, y);
      for (let x = rMinX; x <= rMaxX; x++) {
        const pCell = (pMapStart + (((rowBase + x) | 0) << 1)) >>> 0;
        m.setU16(pCell, (m.u16(pCell) | mask16) & 0xffff);
      }
    }
  }
}

/**
 * `@va D2Common:0x6FD9ABD0` (`COLLISION_ClearMaskForBoundingBox113c`, custom `eax = pCollGrid`, `edx = pBox`, `[esp+4] = wMask`, `ret 4`).
 *
 * Translates `pBox` (`[nMinX, nMinY, nMaxX, nMaxY]`) by `(pCollGrid->nSubtileX, pCollGrid->nSubtileY)` (`+0x00`, `+0x04`)
 * and ANDs `~(uint16)wMask` into every subtile cell of `pCollGrid->pMapStart (+0x20)` across `[rMinY .. rMaxY] x [rMinX .. rMaxX]`.
 */
export function COLLISION_ClearMaskForBoundingBox113c(
  m: Memory113c,
  pCollGrid: number,
  pBox: number,
  wMask: number,
): void {
  const box = pBox >>> 0;
  const gridX = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileX) | 0;
  const gridY = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileY) | 0;
  const rMinX = ((m.u32(box) | 0) - gridX) | 0;
  const rMinY = ((m.u32((box + 4) >>> 0) | 0) - gridY) | 0;
  const rMaxX = ((m.u32((box + 8) >>> 0) | 0) - gridX) | 0;
  const rMaxY = ((m.u32((box + 0x0c) >>> 0) | 0) - gridY) | 0;
  if (rMinY > rMaxY) return;

  const stride = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileWidth) | 0;
  const pMapStart = m.get(pCollGrid, D2RoomCollisionGridStrc.pMapStart);
  const notMask16 = ~wMask & 0xffff;

  for (let y = rMinY; y <= rMaxY; y++) {
    if (rMinX <= rMaxX) {
      const rowBase = imul32(stride, y);
      for (let x = rMinX; x <= rMaxX; x++) {
        const pCell = (pMapStart + (((rowBase + x) | 0) << 1)) >>> 0;
        m.setU16(pCell, m.u16(pCell) & notMask16);
      }
    }
  }
}

/**
 * `@va D2Common:0x6FD9AC40` (`COLLISION_CheckMaskForBoundingBox113c`, custom `ecx = pCollGrid`, `eax = pBox`, `[esp+4] = wMask`, `ret 4`).
 *
 * Accumulates `(cell & wMask)` via bitwise OR across all subtile cells of `pCollGrid->pMapStart (+0x20)`
 * in `[rMinY .. rMaxY] x [rMinX .. rMaxX]` and returns the resulting `uint16` mask.
 */
export function COLLISION_CheckMaskForBoundingBox113c(
  m: Memory113c,
  pCollGrid: number,
  pBox: number,
  wMask: number,
): number {
  const box = pBox >>> 0;
  const gridX = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileX) | 0;
  const gridY = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileY) | 0;
  const rMinX = ((m.u32(box) | 0) - gridX) | 0;
  const rMinY = ((m.u32((box + 4) >>> 0) | 0) - gridY) | 0;
  const rMaxX = ((m.u32((box + 8) >>> 0) | 0) - gridX) | 0;
  const rMaxY = ((m.u32((box + 0x0c) >>> 0) | 0) - gridY) | 0;
  if (rMinY > rMaxY) return 0;

  const stride = m.get(pCollGrid, D2RoomCollisionGridStrc.nSubtileWidth) | 0;
  const pMapStart = m.get(pCollGrid, D2RoomCollisionGridStrc.pMapStart);
  const mask32 = wMask >>> 0;
  let acc = 0;

  for (let y = rMinY; y <= rMaxY; y++) {
    if (rMinX <= rMaxX) {
      const rowBase = imul32(stride, y);
      for (let x = rMinX; x <= rMaxX; x++) {
        const pCell = (pMapStart + (((rowBase + x) | 0) << 1)) >>> 0;
        acc = (acc | (m.u16(pCell) & mask32)) >>> 0;
      }
    }
  }
  return acc >>> 0;
}

/**
 * `@va D2Common:0x6FD9B560` (`COLLISION_FillTileSubtilesMask113c`, custom `ecx = nSubX`, `eax = nSubY`,
 * `[esp+4] = pCollGrid`, `[esp+8] = wMask`, `ret 8`).
 *
 * Clamps the 5x5 subtile region `[nSubX, nSubX + 5) x [nSubY, nSubY + 5)` against `0` on the low side
 * (`startX = max(0, nSubX)`, `startY = max(0, nSubY)`, `endX = nSubX + 5`, `endY = nSubY + 5`) and ORs
 * `(uint16)wMask` into `pCollGrid->pMapStart[y * nSubtileWidth + x]`.
 */
export function COLLISION_FillTileSubtilesMask113c(
  m: Memory113c,
  nSubX: number,
  nSubY: number,
  pCollGrid: number,
  wMask: number,
): void {
  const grid = pCollGrid >>> 0;
  if (grid === 0) return;
  const pMapStart = m.get(grid, D2RoomCollisionGridStrc.pMapStart);
  if (pMapStart === 0) return;

  const subX = nSubX | 0;
  const subY = nSubY | 0;
  const startY = subY <= 0 ? 0 : subY;
  const endY = (subY + 5) | 0;
  const startX = subX <= 0 ? 0 : subX;
  const endX = (subX + 5) | 0;
  if (startY >= endY) return;

  const stride = m.get(grid, D2RoomCollisionGridStrc.nSubtileWidth) | 0;
  const mask16 = wMask & 0xffff;

  for (let y = startY; y < endY; y++) {
    if (startX < endX) {
      const curMapStart = m.get(grid, D2RoomCollisionGridStrc.pMapStart);
      const rowByteOff = (imul32(y, stride) << 1) | 0;
      const pRow = (curMapStart + rowByteOff) >>> 0;
      for (let x = startX; x < endX; x++) {
        const pCell = (pRow + (x << 1)) >>> 0;
        m.setU16(pCell, (m.u16(pCell) | mask16) & 0xffff);
      }
    }
  }
}

/**
 * `@va D2Common:0x6FD9AA90` (`COLLISION_SplitClipRectByRoomBounds113c`, custom `eax = pRoom`, `edx = pInRect`, `ecx = pOutRects`, `ret`).
 *
 * Splits `pInRect` (`[nLeft, nTop, nRight, nBottom]`) against `pRoom->pCollisionGrid (+0x20)` right/bottom bounds
 * into up to 3 sub-rectangles at `pOutRects[0..2]` (stride `0x10`) and returns the resulting count (`0..3`).
 */
export function COLLISION_SplitClipRectByRoomBounds113c(
  m: Memory113c,
  pRoom: number,
  pInRect: number,
  pOutRects: number,
): number {
  const inRect = pInRect >>> 0;
  const outRects = pOutRects >>> 0;
  const inTop = m.u32((inRect + 0x04) >>> 0) | 0;
  const inBottom = m.u32((inRect + 0x0c) >>> 0) | 0;
  if (inTop > inBottom) {
    return 0;
  }
  const inLeft = m.u32(inRect) | 0;
  const inRight = m.u32((inRect + 0x08) >>> 0) | 0;
  if (inLeft > inRight) {
    return 0;
  }
  if (pRoom === 0) {
    throw new Error('COLLISION_SplitClipRectByRoomBounds113c: pRoom == NULL (line 709)');
  }
  const pCollGrid = m.u32(((pRoom >>> 0) + 0x20) >>> 0);
  if (pCollGrid === 0) {
    return 0;
  }

  m.setU32((outRects + 0x04) >>> 0, inTop >>> 0);
  m.setU32((outRects + 0x0c) >>> 0, inBottom >>> 0);
  m.setU32(outRects, inLeft >>> 0);
  m.setU32((outRects + 0x08) >>> 0, inRight >>> 0);

  const nRoomRight =
    ((m.u32(pCollGrid) | 0) + (m.u32((pCollGrid + 0x08) >>> 0) | 0)) | 0;
  let nCount = 1;
  if (inRight >= nRoomRight) {
    m.setU32((outRects + 0x08) >>> 0, ((nRoomRight - 1) | 0) >>> 0);
    m.setU32((outRects + 0x10) >>> 0, nRoomRight >>> 0);
    m.setU32((outRects + 0x18) >>> 0, m.u32((inRect + 0x08) >>> 0));
    m.setU32((outRects + 0x14) >>> 0, m.u32((outRects + 0x04) >>> 0));
    m.setU32((outRects + 0x1c) >>> 0, m.u32((outRects + 0x0c) >>> 0));
    nCount = 2;
  }

  const nRoomBottom =
    ((m.u32((pCollGrid + 0x04) >>> 0) | 0) + (m.u32((pCollGrid + 0x0c) >>> 0) | 0)) | 0;
  if (inBottom >= nRoomBottom) {
    m.setU32((outRects + 0x0c) >>> 0, ((nRoomBottom - 1) | 0) >>> 0);
    const pSlot = (outRects + (nCount << 4)) >>> 0;
    m.setU32(pSlot, m.u32(outRects));
    m.setU32((pSlot + 0x08) >>> 0, m.u32((outRects + 0x08) >>> 0));
    m.setU32((pSlot + 0x04) >>> 0, ((m.u32((outRects + 0x0c) >>> 0) | 0) + 1) >>> 0);
    m.setU32((pSlot + 0x0c) >>> 0, m.u32((inRect + 0x0c) >>> 0));
    nCount = (nCount + 1) | 0;
  }

  return nCount >>> 0;
}

/**
 * `@va D2CMP:0x6FE251E0` (`D2CMP.#10011` via `D2Common` thunk `0x6FD59318`, `__stdcall(pTileLibraryEntry)`, `ret 4`).
 *
 * Asserts `pTileLibraryEntry != 0` (line 129) and returns `pTileLibraryEntry + 0x28` (`uint8[25]` subtile flags).
 */
export function D2CMP_10011_GetTileSubtileFlagsPtr113c(
  _m: Memory113c,
  pTileLibraryEntry: number,
): number {
  if (pTileLibraryEntry === 0) {
    throw new Error('D2CMP_10011_GetTileSubtileFlagsPtr113c: pTileLibraryEntry == NULL (line 129)');
  }
  return ((pTileLibraryEntry >>> 0) + 0x28) >>> 0;
}

/**
 * `@va D2Common:0x6FD9B5F0` (`COLLISION_CopyTileSubtileFlagsToCollGrid113c`, custom `eax = nRelY`, `ecx = nRelX`,
 * `[esp+4] = pCollGrid`, `[esp+8] = pTileLibraryEntry`, `ret 8`).
 *
 * Copies the 5x5 subtile collision flags from `D2CMP.#10011(pTileLibraryEntry)` into `pCollGrid->pMapStart (+0x20)`,
 * reversing row order (`flagRow = 4 - (y - nRelY)`) and clipping low coordinates at `0`.
 */
export function COLLISION_CopyTileSubtileFlagsToCollGrid113c(
  m: Memory113c,
  nRelY: number,
  nRelX: number,
  pCollGrid: number,
  pTileLibraryEntry: number,
): void {
  const grid = pCollGrid >>> 0;
  if (grid === 0) return;
  const pMapStart = m.get(grid, D2RoomCollisionGridStrc.pMapStart);
  if (pMapStart === 0) return;

  const pSubtileFlags = D2CMP_10011_GetTileSubtileFlagsPtr113c(m, pTileLibraryEntry);
  const relY = nRelY | 0;
  const relX = nRelX | 0;
  const startY = relY <= 0 ? 0 : relY;
  const endY = (relY + 5) | 0;
  const startX = relX <= 0 ? 0 : relX;
  const endX = (relX + 5) | 0;

  const nStride = m.get(grid, D2RoomCollisionGridStrc.nSubtileWidth) | 0;
  if (startY >= endY) return;

  let flagRowPtr = (pSubtileFlags + imul32((relY - startY + 4) | 0, 5) - relX) >>> 0;
  let rowByteOffset = (imul32(startY, nStride) << 1) | 0;
  const rowByteStep = (nStride << 1) | 0;
  let remRows = (endY - startY) | 0;

  while (remRows !== 0) {
    if (startX < endX) {
      const pCurMapStart = m.get(grid, D2RoomCollisionGridStrc.pMapStart);
      const pRowDest = (pCurMapStart + rowByteOffset) >>> 0;
      for (let x = startX; x < endX; x++) {
        const flag = m.u8((flagRowPtr + x) >>> 0);
        m.setU16((pRowDest + (x << 1)) >>> 0, flag);
      }
    }
    flagRowPtr = (flagRowPtr - 5) >>> 0;
    rowByteOffset = (rowByteOffset + rowByteStep) | 0;
    remRows = (remRows - 1) | 0;
  }
}

/**
 * `@va D2Common:0x6FD9B6B0` (`COLLISION_ClearTileSubtileFlagsFromCollGrid113c`, custom `eax = nRelY`, `ecx = nRelX`,
 * `[esp+4] = pCollGrid`, `[esp+8] = pTileLibraryEntry`, `ret 8`).
 *
 * Clears (`&= ~flag`) the 5x5 subtile collision flags from `D2CMP.#10011(pTileLibraryEntry)` in `pCollGrid->pMapStart (+0x20)`.
 */
export function COLLISION_ClearTileSubtileFlagsFromCollGrid113c(
  m: Memory113c,
  nRelY: number,
  nRelX: number,
  pCollGrid: number,
  pTileLibraryEntry: number,
): void {
  const grid = pCollGrid >>> 0;
  if (grid === 0) return;
  const pMapStart = m.get(grid, D2RoomCollisionGridStrc.pMapStart);
  if (pMapStart === 0) return;

  const pSubtileFlags = D2CMP_10011_GetTileSubtileFlagsPtr113c(m, pTileLibraryEntry);
  const relY = nRelY | 0;
  const relX = nRelX | 0;
  const startY = relY <= 0 ? 0 : relY;
  const endY = (relY + 5) | 0;
  const startX = relX <= 0 ? 0 : relX;
  const endX = (relX + 5) | 0;

  const nStride = m.get(grid, D2RoomCollisionGridStrc.nSubtileWidth) | 0;
  if (startY >= endY) return;

  let flagRowPtr = (pSubtileFlags + imul32((relY - startY + 4) | 0, 5) - relX) >>> 0;
  let rowByteOffset = (imul32(startY, nStride) << 1) | 0;
  const rowByteStep = (nStride << 1) | 0;
  let remRows = (endY - startY) | 0;

  while (remRows !== 0) {
    if (startX < endX) {
      const pCurMapStart = m.get(grid, D2RoomCollisionGridStrc.pMapStart);
      const pRowDest = (pCurMapStart + rowByteOffset) >>> 0;
      for (let x = startX; x < endX; x++) {
        const flag = m.u8((flagRowPtr + x) >>> 0);
        const addr = (pRowDest + (x << 1)) >>> 0;
        m.setU16(addr, m.u16(addr) & (~flag & 0xffff));
      }
    }
    flagRowPtr = (flagRowPtr - 5) >>> 0;
    rowByteOffset = (rowByteOffset + rowByteStep) | 0;
    remRows = (remRows - 1) | 0;
  }
}

/**
 * `@va D2Common:0x6FD9B780` (`COLLISION_OrTileSubtileFlagsToCollGrid113c`, custom `eax = nRelY`, `ecx = nRelX`,
 * `[esp+4] = pCollGrid`, `[esp+8] = pTileLibraryEntry`, `ret 8`).
 *
 * ORs (`|= flag`) the 5x5 subtile collision flags from `D2CMP.#10011(pTileLibraryEntry)` into `pCollGrid->pMapStart (+0x20)`.
 */
export function COLLISION_OrTileSubtileFlagsToCollGrid113c(
  m: Memory113c,
  nRelY: number,
  nRelX: number,
  pCollGrid: number,
  pTileLibraryEntry: number,
): void {
  const grid = pCollGrid >>> 0;
  if (grid === 0) return;
  const pMapStart = m.get(grid, D2RoomCollisionGridStrc.pMapStart);
  if (pMapStart === 0) return;

  const pSubtileFlags = D2CMP_10011_GetTileSubtileFlagsPtr113c(m, pTileLibraryEntry);
  const relY = nRelY | 0;
  const relX = nRelX | 0;
  const startY = relY <= 0 ? 0 : relY;
  const endY = (relY + 5) | 0;
  const startX = relX <= 0 ? 0 : relX;
  const endX = (relX + 5) | 0;

  const nStride = m.get(grid, D2RoomCollisionGridStrc.nSubtileWidth) | 0;
  if (startY >= endY) return;

  let flagRowPtr = (pSubtileFlags + imul32((relY - startY + 4) | 0, 5) - relX) >>> 0;
  let rowByteOffset = (imul32(startY, nStride) << 1) | 0;
  const rowByteStep = (nStride << 1) | 0;
  let remRows = (endY - startY) | 0;

  while (remRows !== 0) {
    if (startX < endX) {
      const pCurMapStart = m.get(grid, D2RoomCollisionGridStrc.pMapStart);
      const pRowDest = (pCurMapStart + rowByteOffset) >>> 0;
      for (let x = startX; x < endX; x++) {
        const flag = m.u8((flagRowPtr + x) >>> 0);
        const addr = (pRowDest + (x << 1)) >>> 0;
        m.setU16(addr, (m.u16(addr) | flag) & 0xffff);
      }
    }
    flagRowPtr = (flagRowPtr - 5) >>> 0;
    rowByteOffset = (rowByteOffset + rowByteStep) | 0;
    remRows = (remRows - 1) | 0;
  }
}

/**
 * `@va D2Common:0x6FDCE390` (`D2Common.#10638` `COLLISION_InitBoundingBox113c`, `__stdcall(pBox, nLeft, nBottom)`, `ret 0xC`).
 *
 * Asserts `pBox != 0` (line 161) and writes `pBox->nLeft = nLeft`, `pBox->nBottom = nBottom`.
 */
export function COLLISION_InitBoundingBox113c(
  m: Memory113c,
  pBox: number,
  nLeft: number,
  nBottom: number,
): void {
  if (pBox === 0) {
    throw new Error('COLLISION_InitBoundingBox113c: pBox == NULL (line 161)');
  }
  const box = pBox >>> 0;
  m.setU32(box, nLeft >>> 0);
  m.setU32((box + 0x04) >>> 0, nBottom >>> 0);
}

/**
 * `@va D2Common:0x6FD9CA90` (`COLLISION_StampRoomTileGridToCollGrid113c`, custom `ecx = pTileEntryArray`, `esi = pCollGrid`,
 * `[esp+4] = pRoomCoords`, `[esp+8] = nTileCount`, `[esp+0xC] = bCopyMode`, `ret 0xC`).
 *
 * Iterates `nTileCount` `D2DrlgTileDataStrc` records (stride `0x30`) in `pTileEntryArray`; for each tile whose subtile origin
 * `((nPosX + pRoomCoords->nTileXPos) * 5, (nPosY + pRoomCoords->nTileYPos) * 5)` lies inside `pCollGrid`, copies (`bCopyMode != 0`)
 * or ORs (`bCopyMode == 0`) the tile's 5x5 subtile flags into `pCollGrid`, and fills extra mask bits (`0x10`, `0x01`, `0x04`)
 * via `0x6FD9B560` (`COLLISION_FillTileSubtilesMask113c`) when `dwFlags` has `0x02`, `0x40`, or `0x80` set.
 */
export function COLLISION_StampRoomTileGridToCollGrid113c(
  m: Memory113c,
  pTileEntryArray: number,
  pCollGrid: number,
  pRoomCoords: number,
  nTileCount: number,
  bCopyMode: number,
): void {
  const count = nTileCount | 0;
  if (count <= 0) {
    return;
  }
  let pTile = pTileEntryArray >>> 0;
  const coords = pRoomCoords >>> 0;
  const grid = pCollGrid >>> 0;

  for (let i = 0; i < count; i++) {
    const tileX = ((m.u32((pTile + 0x08) >>> 0) | 0) + (m.u32((coords + 0x10) >>> 0) | 0)) | 0;
    const subtileX = imul32(tileX, 5);
    const tileY = ((m.u32((pTile + 0x0c) >>> 0) | 0) + (m.u32((coords + 0x14) >>> 0) | 0)) | 0;
    const subtileY = imul32(tileY, 5);

    if (grid === 0) {
      throw new Error('COLLISION_StampRoomTileGridToCollGrid113c: pCollGrid == NULL (line 530)');
    }

    const posX = m.get(grid, D2RoomCollisionGridStrc.nSubtileX) | 0;
    if (subtileX >= posX) {
      const sizeX = m.get(grid, D2RoomCollisionGridStrc.nSubtileWidth) | 0;
      if (subtileX < ((posX + sizeX) | 0)) {
        const posY = m.get(grid, D2RoomCollisionGridStrc.nSubtileY) | 0;
        if (subtileY >= posY) {
          const sizeY = m.get(grid, D2RoomCollisionGridStrc.nSubtileHeight) | 0;
          if (subtileY < ((posY + sizeY) | 0)) {
            const relY = (subtileY - posY) | 0;
            const relX = (subtileX - posX) | 0;
            const pTileLibEntry = m.u32((pTile + 0x18) >>> 0);

            if ((bCopyMode | 0) !== 0) {
              COLLISION_CopyTileSubtileFlagsToCollGrid113c(
                m,
                relY,
                relX,
                grid,
                pTileLibEntry,
              );
            } else {
              COLLISION_OrTileSubtileFlagsToCollGrid113c(
                m,
                relY,
                relX,
                grid,
                pTileLibEntry,
              );
            }

            const dwFlags = m.u32((pTile + 0x14) >>> 0) & 0xff;
            let nExtraMask = 0;
            if ((dwFlags & 0x02) !== 0) {
              nExtraMask = 0x10;
            }
            if ((dwFlags & 0x40) !== 0) {
              nExtraMask |= 0x01;
            }
            if ((dwFlags & 0x80) !== 0) {
              nExtraMask |= 0x04;
            }
            if (nExtraMask !== 0) {
              COLLISION_FillTileSubtilesMask113c(m, relX, relY, grid, nExtraMask);
            }
          }
        }
      }
    }

    pTile = (pTile + 0x30) >>> 0;
  }
}

