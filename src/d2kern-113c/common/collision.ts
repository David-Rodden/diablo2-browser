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
