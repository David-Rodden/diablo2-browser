/**
 * Diablo II v1.13c `D2Common.dll` environment cycle and DRLG grid segment helpers
 * (`Enviro.cpp`, `Drlg\DrlgGrid.cpp`), image base `0x6FD50000`.
 *
 * Every function below is a 1:1 port of the cited disassembly (`objdump -d -M intel` on `D2Common.dll`).
 */
import {
  D2DrlgGridStrc,
  D2EnvironmentStrc,
} from '../mem/layout.generated.ts';
import type { Memory113c } from '../mem/sparse-memory.ts';
import { imul32 } from './int-math.ts';

/**
 * Environment cycle tables at `0x6FDEB160` (normal), `0x6FDEB1A8` (Act 3 eclipse), and `0x6FDEB1F0` (default eclipse).
 * Each table has 6 rows of `int32[3]` (`[nTicksBegin, nPeriodOfDay, dwRGB]`, 72 bytes per table).
 * Copied verbatim from `D2Common.dll` v1.13c.
 */
export const ENV_CYCLE_NORMAL_6FDEB160 = Int32Array.from([
  320, 3, 15962237,
  340, 3, 8632528,
  0, 0, 16777215,
  160, 1, 16777215,
  180, 1, 12687554,
  200, 2, 15962237,
]);

export const ENV_CYCLE_ACT3_ECLIPSE_6FDEB1A8 = Int32Array.from([
  340, 3, 15943411,
  350, 3, 8632528,
  0, 0, 1316095,
  180, 1, 2031615,
  190, 1, 12687380,
  200, 2, 15962237,
]);

export const ENV_CYCLE_ECLIPSE_6FDEB1F0 = Int32Array.from([
  300, 3, 15932928,
  0, 0, 15998464,
  60, 1, 15932928,
  120, 2, 15932928,
  180, 2, 15998464,
  240, 2, 15932928,
]);

function applyCellOp(
  m: Memory113c,
  pCell: number,
  uFlags: number,
  eOp: number,
): void {
  const addr = pCell >>> 0;
  const val = uFlags >>> 0;
  switch (eOp | 0) {
    case 0:
      m.setU32(addr, (m.u32(addr) | val) >>> 0);
      break;
    case 1:
      m.setU32(addr, (m.u32(addr) & val) >>> 0);
      break;
    case 2:
      m.setU32(addr, (m.u32(addr) ^ val) >>> 0);
      break;
    case 3:
      m.setU32(addr, val);
      break;
    case 4:
      if (m.u32(addr) === 0) {
        m.setU32(addr, val);
      }
      break;
    case 5:
      m.setU32(addr, (m.u32(addr) & ~val) >>> 0);
      break;
    default:
      throw new Error(`DRLGGRID applyCellOp: invalid eFlagOp=${eOp}`);
  }
}

/**
 * `@va D2Common:0x6FD86FE0` (`ENVIRONMENT_Init113c` / `DRLGGRID_ApplyPointListCellFlags`, custom `eax = pNode`, `edi = pGrid`, `ebx = uFlags`, `ret`).
 *
 * `Drlg\DrlgGrid.cpp` helper (historical manifest symbol `ENVIRONMENT_Init`):
 * walks the linked list of `D2DrlgVertexStrc` nodes (`+0x00 = nPosX`, `+0x04 = nPosY`, `+0x10 = pNext`);
 * for each node inside `[0, pGrid->nWidth) x [0, pGrid->nHeight)`, applies `gafGridCellOps[0]` (`OpOr`)
 * with `uFlags` to `&pGrid->pCells[pGrid->pRowOffsets[y] + x]`.
 */
export function ENVIRONMENT_Init113c(
  m: Memory113c,
  pNode: number,
  pGrid: number,
  uFlags: number,
): void {
  let esi = pNode >>> 0;
  const flags = uFlags >>> 0;
  while (esi !== 0) {
    const x = m.u32(esi) | 0;
    const y = m.u32((esi + 4) >>> 0) | 0;
    esi = m.u32((esi + 0x10) >>> 0);
    if (
      x >= 0 &&
      x < (m.get(pGrid, D2DrlgGridStrc.nWidth) | 0) &&
      y >= 0 &&
      y < (m.get(pGrid, D2DrlgGridStrc.nHeight) | 0)
    ) {
      const pRowOffsets = m.get(pGrid, D2DrlgGridStrc.pRowOffsets);
      const rowOff = m.u32((pRowOffsets + y * 4) >>> 0) | 0;
      const pCells = m.get(pGrid, D2DrlgGridStrc.pCells);
      const pCell = (pCells + (((rowOff + x) | 0) << 2)) >>> 0;
      m.setU32(pCell, (m.u32(pCell) | flags) >>> 0);
    }
  }
}

/**
 * `@va D2Common:0x6FD87020` (`ENVIRONMENT_Alloc113c` / `DRLGGRID_ApplySegmentCellFlags`, custom `esi = pGrid`, `[esp+4] = pNode`,
 * `[esp+8] = uFlags`, `[esp+0xC] = eOp`, `[esp+0x10] = bIncludeEnd`, `ret 0x10`).
 *
 * `Drlg\DrlgGrid.cpp` segment rasterizer (historical manifest symbol `ENVIRONMENT_Alloc`):
 * applies `gafGridCellOps[eOp]` with `uFlags` along the axis-aligned segment between `pNode` (`+0x00`, `+0x04`)
 * and `pNode->pNext` (`+0x10`), including the start vertex (`pNode`) and optionally the end vertex (`pNext`)
 * when `bIncludeEnd != 0`.
 */
export function ENVIRONMENT_Alloc113c(
  m: Memory113c,
  pGrid: number,
  pNode: number,
  uFlags: number,
  eOp: number,
  bIncludeEnd: number,
): void {
  const node = pNode >>> 0;
  const pNext = m.u32((node + 0x10) >>> 0);
  const x1 = m.u32(node) | 0;
  const x2 = m.u32(pNext) | 0;
  const y1 = m.u32((node + 4) >>> 0) | 0;
  const y2 = m.u32((pNext + 4) >>> 0) | 0;

  if (x1 === x2 && y1 === y2) {
    const pRowOffsets = m.get(pGrid, D2DrlgGridStrc.pRowOffsets);
    const rowOff = m.u32((pRowOffsets + y1 * 4) >>> 0) | 0;
    const pCells = m.get(pGrid, D2DrlgGridStrc.pCells);
    const pCell = (pCells + (((rowOff + x1) | 0) << 2)) >>> 0;
    applyCellOp(m, pCell, uFlags, eOp);
    return;
  }

  let curX: number;
  let curY: number;
  let targetX: number;
  let targetY: number;
  let stepMode: number;

  if (x1 === x2) {
    curX = x1;
    targetX = x1;
    stepMode = 0;
    if (y1 < y2) {
      curY = (y1 + 1) | 0;
      targetY = y2;
    } else {
      curY = (y2 + 1) | 0;
      targetY = y1;
    }
  } else {
    curY = y1;
    targetY = y1;
    stepMode = 1;
    if (x1 < x2) {
      curX = (x1 + 1) | 0;
      targetX = x2;
    } else {
      curX = (x2 + 1) | 0;
      targetX = x1;
    }
  }

  while (!(curX === targetX && curY === targetY)) {
    const pRowOffsets = m.get(pGrid, D2DrlgGridStrc.pRowOffsets);
    const rowOff = m.u32((pRowOffsets + curY * 4) >>> 0) | 0;
    const pCells = m.get(pGrid, D2DrlgGridStrc.pCells);
    const pCell = (pCells + (((rowOff + curX) | 0) << 2)) >>> 0;
    applyCellOp(m, pCell, uFlags, eOp);
    if (stepMode === 0) {
      curY = (curY + 1) | 0;
    } else {
      curX = (curX + 1) | 0;
    }
  }

  const startY = m.u32((node + 4) >>> 0) | 0;
  const startX = m.u32(node) | 0;
  const pRowOffsets0 = m.get(pGrid, D2DrlgGridStrc.pRowOffsets);
  const rowOff0 = m.u32((pRowOffsets0 + startY * 4) >>> 0) | 0;
  const pCells0 = m.get(pGrid, D2DrlgGridStrc.pCells);
  const pStartCell = (pCells0 + (((rowOff0 + startX) | 0) << 2)) >>> 0;
  applyCellOp(m, pStartCell, uFlags, eOp);

  if ((bIncludeEnd | 0) !== 0) {
    const endNode = m.u32((node + 0x10) >>> 0);
    const endY = m.u32((endNode + 4) >>> 0) | 0;
    const endX = m.u32(endNode) | 0;
    const pRowOffsets1 = m.get(pGrid, D2DrlgGridStrc.pRowOffsets);
    const rowOff1 = m.u32((pRowOffsets1 + endY * 4) >>> 0) | 0;
    const pCells1 = m.get(pGrid, D2DrlgGridStrc.pCells);
    const pEndCell = (pCells1 + (((rowOff1 + endX) | 0) << 2)) >>> 0;
    applyCellOp(m, pEndCell, uFlags, eOp);
  }
}

/**
 * `@va D2Common:0x6FD87170` (`ENVIRONMENT_SetCycleIndex113c`, custom `eax = pEnv`, `ret`).
 *
 * Updates `pEnv->nTimeOfDay (+0x04)` and `pEnv->dwTicks (+0x08)` from `ENV_CYCLE_NORMAL_6FDEB160`
 * (when `pEnv->bEclipse (+0x30) == 0`) or `ENV_CYCLE_ECLIPSE_6FDEB1F0` (when `bEclipse != 0`)
 * indexed by `pEnv->dwCycleIndex (+0x00)`.
 */
export function ENVIRONMENT_SetCycleIndex113c(
  m: Memory113c,
  pEnv: number,
): void {
  const bEclipse = m.get(pEnv, D2EnvironmentStrc.bEclipse) | 0;
  const idx = m.get(pEnv, D2EnvironmentStrc.dwCycleIndex) | 0;
  const table =
    bEclipse === 0 ? ENV_CYCLE_NORMAL_6FDEB160 : ENV_CYCLE_ECLIPSE_6FDEB1F0;
  const nBaseTicks = table[idx * 3]!;
  const nPeriod = table[idx * 3 + 1]!;
  m.set(pEnv, D2EnvironmentStrc.nTimeOfDay, nPeriod >>> 0);
  const nInitTick = m.get(pEnv, D2EnvironmentStrc.dwCyclePeriod) | 0;
  m.set(
    pEnv,
    D2EnvironmentStrc.dwTicks,
    imul32(nInitTick, nBaseTicks) >>> 0,
  );
}

/**
 * `@va D2Common:0x6FD87570` (`ENVIRONMENT_ApplyCycleColors113c`, custom `eax = pEnv`, `ecx = nAct`, `ret`).
 *
 * Advances `pEnv->dwTicks (+0x08)` with Act 2 / Act 3 non-eclipse accelerations, wraps at `360 * dwCyclePeriod`,
 * and advances `pEnv->dwCycleIndex (+0x00)` and `pEnv->nTimeOfDay (+0x04)` when `dwTicks` crosses
 * the next cycle row's scaled `nTicksBegin`.
 */
export function ENVIRONMENT_ApplyCycleColors113c(
  m: Memory113c,
  pEnv: number,
  nAct: number,
): void {
  const act = nAct | 0;
  let ticks = ((m.get(pEnv, D2EnvironmentStrc.dwTicks) | 0) + 1) | 0;
  m.set(pEnv, D2EnvironmentStrc.dwTicks, ticks >>> 0);

  const bEclipse = m.get(pEnv, D2EnvironmentStrc.bEclipse) | 0;
  if (bEclipse === 0) {
    if (act === 3) {
      ticks = (ticks + 0x0f) | 0;
      m.set(pEnv, D2EnvironmentStrc.dwTicks, ticks >>> 0);
    } else {
      const idx = m.get(pEnv, D2EnvironmentStrc.dwCycleIndex) | 0;
      if (ENV_CYCLE_NORMAL_6FDEB160[idx * 3 + 1]! === 2) {
        ticks = (ticks + 1) | 0;
        m.set(pEnv, D2EnvironmentStrc.dwTicks, ticks >>> 0);
        if (act === 2) {
          ticks = (ticks + 8) | 0;
          m.set(pEnv, D2EnvironmentStrc.dwTicks, ticks >>> 0);
        }
      }
    }
  }

  const nInitTick = m.get(pEnv, D2EnvironmentStrc.dwCyclePeriod) | 0;
  const curTicks = m.get(pEnv, D2EnvironmentStrc.dwTicks) | 0;
  if (curTicks >= imul32(nInitTick, 0x168)) {
    m.set(pEnv, D2EnvironmentStrc.dwTicks, 0);
  }

  const curIdx = m.get(pEnv, D2EnvironmentStrc.dwCycleIndex) | 0;
  const nextIdxRaw = (curIdx + 1) | 0;
  const nextIdx = nextIdxRaw < 6 ? nextIdxRaw : 0;

  const thresholdTable =
    bEclipse === 0
      ? ENV_CYCLE_NORMAL_6FDEB160
      : act === 3
        ? ENV_CYCLE_ACT3_ECLIPSE_6FDEB1A8
        : ENV_CYCLE_ECLIPSE_6FDEB1F0;
  const threshold = imul32(thresholdTable[nextIdx * 3]!, nInitTick);

  if ((m.get(pEnv, D2EnvironmentStrc.dwTicks) | 0) > threshold) {
    m.set(pEnv, D2EnvironmentStrc.dwCycleIndex, nextIdxRaw >>> 0);
    if (nextIdxRaw >= 6) {
      m.set(pEnv, D2EnvironmentStrc.dwCycleIndex, 0);
    }
    const finalIdx = m.get(pEnv, D2EnvironmentStrc.dwCycleIndex) | 0;
    const snapTable =
      bEclipse === 0 ? ENV_CYCLE_NORMAL_6FDEB160 : ENV_CYCLE_ECLIPSE_6FDEB1F0;
    m.set(
      pEnv,
      D2EnvironmentStrc.nTimeOfDay,
      snapTable[finalIdx * 3 + 1]! >>> 0,
    );
    m.set(
      pEnv,
      D2EnvironmentStrc.dwTicks,
      imul32(snapTable[finalIdx * 3]!, nInitTick) >>> 0,
    );
  }
}
