/**
 * Diablo II v1.13c `D2Common.dll` pathfinding / velocity / dynamic-path leaf functions (`Path.cpp` / `PathMisc.cpp`,
 * image base `0x6FD50000`).
 *
 * Every function below is a 1:1 port of the cited disassembly (`objdump -d -M intel` on the 1.13c image).
 * None of them calls another function. Register-convention (LTCG) arguments are explicit TS parameters, and
 * the doc comment of each function names the register that carries them. Signedness follows the branch
 * mnemonics: `jl/jg/jle/jge/idiv/sar/cdq` are signed, `ja/jb/jae/jbe` are unsigned.
 *
 * Struct offsets come from `mem/layout.generated.ts` (`docs/oracle/route2-layout.json`).
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import {
  D2ActiveRoomStrc,
  D2AStarNodeStrc,
  D2DynamicPathStrc,
  D2IdaStarNodeStrc,
  D2MonStatsTxt,
  D2MonStatsTxt_SIZE,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import {
  D2COMMON_GDWBITMASKS_IAT_VA_113C,
  D2COMMON_SGPT_DATATABLES_VA_113C,
  DATATABLES_OFF_113C,
} from './inline-helpers.ts'
import { imul32, sar32, sdiv32 } from './int-math.ts'
import { seedNext, type D2SeedStrc } from '../prng.ts'

/**
 * `PATH_GetDirectionVector` `.rdata` lookup table at `0x6FDDD470` (128 rows × 3 `int32_t` `{a, b, ang}`, stride 12,
 * 1,536 bytes total). Copied verbatim from the 1.13c PE image; `tests/oracle/k1/laneC-B007-path.test.ts` re-reads
 * the PE bytes at `0x6FDDD470` and verifies byte-for-byte identity against this constant.
 */
export const PATH_DIRECTION_TABLE_6FDDD470 = Int32Array.from([
  0, 4096, 0, 32, 4095, 0, 64, 4095, 0, 96, 4094, 0,
  128, 4093, 0, 161, 4092, 0, 193, 4091, 0, 225, 4089, 0,
  257, 4087, 0, 289, 4085, 0, 321, 4083, 0, 353, 4080, 0,
  385, 4077, 0, 417, 4074, 1, 448, 4071, 1, 480, 4067, 1,
  511, 4063, 1, 543, 4059, 1, 574, 4055, 1, 606, 4050, 1,
  637, 4046, 1, 668, 4041, 1, 699, 4035, 1, 729, 4030, 1,
  760, 4024, 1, 791, 4018, 1, 821, 4012, 2, 851, 4006, 2,
  881, 3999, 2, 911, 3993, 2, 941, 3986, 2, 971, 3979, 2,
  1000, 3971, 2, 1030, 3964, 2, 1059, 3956, 2, 1088, 3948, 2,
  1117, 3940, 2, 1145, 3932, 2, 1174, 3924, 2, 1202, 3915, 3,
  1230, 3906, 3, 1258, 3897, 3, 1286, 3888, 3, 1313, 3879, 3,
  1340, 3870, 3, 1368, 3860, 3, 1394, 3851, 3, 1421, 3841, 3,
  1448, 3831, 3, 1474, 3821, 3, 1500, 3811, 3, 1526, 3800, 3,
  1552, 3790, 3, 1577, 3780, 4, 1602, 3769, 4, 1627, 3758, 4,
  1652, 3747, 4, 1677, 3736, 4, 1701, 3725, 4, 1725, 3714, 4,
  1749, 3703, 4, 1773, 3692, 4, 1796, 3680, 4, 1820, 3669, 4,
  1843, 3657, 4, 1866, 3646, 4, 1888, 3634, 4, 1911, 3622, 4,
  1933, 3610, 5, 1955, 3599, 5, 1977, 3587, 5, 1998, 3575, 5,
  2020, 3563, 5, 2041, 3551, 5, 2062, 3539, 5, 2082, 3526, 5,
  2103, 3514, 5, 2123, 3502, 5, 2143, 3490, 5, 2163, 3478, 5,
  2183, 3465, 5, 2202, 3453, 5, 2221, 3441, 5, 2240, 3428, 5,
  2259, 3416, 5, 2278, 3403, 6, 2296, 3391, 6, 2314, 3379, 6,
  2332, 3366, 6, 2350, 3354, 6, 2368, 3341, 6, 2385, 3329, 6,
  2402, 3317, 6, 2419, 3304, 6, 2436, 3292, 6, 2453, 3279, 6,
  2469, 3267, 6, 2486, 3255, 6, 2502, 3242, 6, 2518, 3230, 6,
  2533, 3218, 6, 2549, 3205, 6, 2564, 3193, 6, 2580, 3181, 6,
  2595, 3169, 6, 2609, 3156, 7, 2624, 3144, 7, 2639, 3132, 7,
  2653, 3120, 7, 2667, 3108, 7, 2681, 3096, 7, 2695, 3084, 7,
  2709, 3072, 7, 2722, 3060, 7, 2736, 3048, 7, 2749, 3036, 7,
  2762, 3024, 7, 2775, 3012, 7, 2788, 3000, 7, 2800, 2988, 7,
  2813, 2977, 7, 2825, 2965, 7, 2837, 2953, 7, 2849, 2942, 7,
  2861, 2930, 7, 2873, 2919, 7, 2884, 2907, 7, 2896, 2896, 7,
])

/**
 * `@va D2Common:0x6FD5CEB0` (`PATH_StepVelocity`, not exported; LTCG `eax = pPath`, `ecx = nRate`, plain `ret`).
 * Sole caller `0x6FD5E230` (`PATH_Step`).
 *
 * - `0x6FD5CEB1 mov edi, ecx; test edi, edi; jg -> rate = nRate > 0 ? nRate : 0x400`.
 * - If `dwAcceleration (+0x88) != 0` (`0x6FD5CEBC`):
 *   - increments `nAccelStepCounter (+0x8C)` (`0x6FD5CECC`);
 *   - when `cnt >= 5` (signed `jl` at `0x6FD5CED6`): `vel = dwVelocity (+0x7C) + acc`; if `vel > dwMaxVelocity (+0x84)`
 *     (signed `jle`) clamps `dwVelocity = dwMaxVelocity` and clears `dwAcceleration = 0`; else if `vel < 0` clamps
 *     `dwVelocity = 0`; resets `nAccelStepCounter = 0` (`0x6FD5CF04`).
 * - Computes `s = imul32(dwVelocity, rate) >> 6` (`0x6FD5CF14..0x6FD5CF17`), then writes unaligned int32s
 *   `tVelocityVectorX (+0x72) = imul32(tDirectionVectorX (+0x6A), s) >> 12` (`0x6FD5CF20`) and
 *   `tVelocityVectorY (+0x76) = imul32(tDirectionVectorY (+0x6E), s) >> 12` (`0x6FD5CF2C`).
 */
export function PATH_StepVelocity113c(m: Memory113c, pPath: number, nRate: number): void {
  const rate = (nRate | 0) > 0 ? nRate | 0 : 0x400
  const acc = m.get(pPath, D2DynamicPathStrc.dwAcceleration) | 0
  if (acc !== 0) {
    const cnt = (m.get(pPath, D2DynamicPathStrc.nAccelStepCounter) + 1) | 0
    m.set(pPath, D2DynamicPathStrc.nAccelStepCounter, cnt >>> 0)
    if (cnt >= 5) {
      const vel = ((m.get(pPath, D2DynamicPathStrc.dwVelocity) | 0) + acc) | 0
      const maxVel = m.get(pPath, D2DynamicPathStrc.dwMaxVelocity) | 0
      m.set(pPath, D2DynamicPathStrc.dwVelocity, vel >>> 0)
      if (vel > maxVel) {
        m.set(pPath, D2DynamicPathStrc.dwVelocity, maxVel >>> 0)
        m.set(pPath, D2DynamicPathStrc.dwAcceleration, 0)
      } else if (vel < 0) {
        m.set(pPath, D2DynamicPathStrc.dwVelocity, 0)
      }
      m.set(pPath, D2DynamicPathStrc.nAccelStepCounter, 0)
    }
  }
  const s = sar32(imul32(m.get(pPath, D2DynamicPathStrc.dwVelocity) | 0, rate), 6)
  const dirX = m.get(pPath, D2DynamicPathStrc.tDirectionVectorX) | 0
  m.set(pPath, D2DynamicPathStrc.tVelocityVectorX, sar32(imul32(dirX, s), 12) >>> 0)
  const dirY = m.get(pPath, D2DynamicPathStrc.tDirectionVectorY) | 0
  m.set(pPath, D2DynamicPathStrc.tVelocityVectorY, sar32(imul32(dirY, s), 12) >>> 0)
}

/**
 * `@va D2Common:0x6FD5CF40` (`PATH_GetDirectionVector`, not exported; stdcall `(nX1, nY1, nX2, nY2, int* pVec, int* pDir)`, `ret 0x18`).
 *
 * - `0x6FD5CF4B cmp ecx, esi; ja` (unsigned) -> `bXPos = (u32)x1 <= (u32)x2`, `xMax/xMin` by unsigned compare.
 * - `0x6FD5CF72 cmp edx, edi; ja` (unsigned) -> `bYPos = (u32)y1 <= (u32)y2`, `yMax/yMin` by unsigned compare.
 * - `0x6FD5CF88 cmp ebx, edi; jg` (signed) -> `xMajor = (int32)(xMax - xMin) > (int32)(yMax - yMin)`.
 * - `0x6FD5CFA1..0x6FD5CFAD`: `idx = major != 0 ? sdiv32(imul32(minor, 127), major) : 0`.
 * - Reads `{a, b, ang}` from `PATH_DIRECTION_TABLE_6FDDD470[idx * 3 .. +2]`, folds octant/quadrant signs and angles,
 *   stores `pVec[0..1]` and `*pDir = (d + 8) & 0x3F`, and returns `*pDir`.
 */
export function PATH_GetDirectionVector113c(
  m: Memory113c,
  nX1: number,
  nY1: number,
  nX2: number,
  nY2: number,
  pVec: number,
  pDir: number,
): number {
  const uX1 = nX1 >>> 0
  const uX2 = nX2 >>> 0
  const bXPos = uX1 <= uX2 ? 1 : 0
  const xMax = bXPos !== 0 ? uX2 : uX1
  const xMin = bXPos !== 0 ? uX1 : uX2

  const uY1 = nY1 >>> 0
  const uY2 = nY2 >>> 0
  const bYPos = uY1 <= uY2 ? 1 : 0
  const yMax = bYPos !== 0 ? uY2 : uY1
  const yMin = bYPos !== 0 ? uY1 : uY2

  const dx = (xMax - xMin) | 0
  const dy = (yMax - yMin) | 0
  const xMajor = dx > dy ? 1 : 0
  const major = xMajor !== 0 ? dx : dy
  const minor = xMajor !== 0 ? dy : dx
  const idx = major !== 0 ? sdiv32(imul32(minor, 0x7f), major) : 0

  const base = idx * 3
  const a = PATH_DIRECTION_TABLE_6FDDD470[base]! | 0
  const b = PATH_DIRECTION_TABLE_6FDDD470[base + 1]! | 0
  const ang = PATH_DIRECTION_TABLE_6FDDD470[base + 2]! | 0

  let d: number
  if (xMajor !== 0) {
    m.setU32((pVec + 4) >>> 0, a >>> 0)
    m.setU32(pVec, b >>> 0)
    d = ~ang & 0x0f
  } else {
    m.setU32(pVec, a >>> 0)
    m.setU32((pVec + 4) >>> 0, b >>> 0)
    d = ang
  }

  if (bYPos === 0) {
    const vy = (-m.u32((pVec + 4) >>> 0)) | 0
    m.setU32((pVec + 4) >>> 0, vy >>> 0)
    d = ~d & 0x1f
  }

  if (bXPos !== 0) {
    d = ~d & 0x3f
  } else {
    const vx = (-m.u32(pVec)) | 0
    m.setU32(pVec, vx >>> 0)
  }

  const outDir = (d + 8) & 0x3f
  m.setU32(pDir, outDir >>> 0)
  return outDir
}

/**
 * `@va D2Common:0x6FD68310` (`PATH_SimplifyToLines`, not exported; LTCG `edx = pPoints` + 3 stack args
 * `(dwStartPt, pOut, nPoints)`, `ret 0xC`). Sole caller `0x6FD68C40` (`0x6FD68D6B`).
 *
 * Compresses a `u16 (x, y)` point array into line segment endpoints:
 * - `nPoints < 2` (`0x6FD68316`): if `nPoints == 1`, copies `pPoints[0]` (dword) to `pOut[0]` and returns `1`; else `0`.
 * - `pdx = pts[0].x - (u16)dwStartPt`, `pdy = pts[0].y - (dwStartPt >>> 16)` (`0x6FD68342..0x6FD6834E`).
 * - Walks `i = 0 .. nPoints - 2` (`0x6FD68370..0x6FD683DC`):
 *   - same `(dx, dy)` as `(pdx, pdy)` -> `run++`;
 *   - `run <= 0 && pdx != dx && pdy != dy` -> `run = 1; dx = -2` (sentinel stored into `pdx` so a single-step diagonal
 *     jog can continue without emitting a vertex, unless the very next real step has `dx == -2 && dy == pdy`);
 *   - otherwise emits `pts[i]` to `pOut[cnt++]` and resets `run = 0`.
 * - Always appends `pts[nPoints - 1]` (`0x6FD683E5`) and returns `cnt`.
 */
export function PATH_SimplifyToLines113c(
  m: Memory113c,
  pPoints: number,
  dwStartPt: number,
  pOut: number,
  nPoints: number,
): number {
  const n = nPoints | 0
  if (n < 2) {
    if (n === 1) {
      m.setU32(pOut, m.u32(pPoints))
      return 1
    }
    return 0
  }
  const startX = dwStartPt & 0xffff
  const startY = dwStartPt >>> 16
  let pdx = (m.u16(pPoints) - startX) | 0
  let pdy = (m.u16((pPoints + 2) >>> 0) - startY) | 0
  let cnt = 0
  let run = 0
  const last = (n - 1) | 0
  for (let i = 0; i < last; i++) {
    const pCur = (pPoints + i * 4) >>> 0
    const x0 = m.u16(pCur)
    const x1 = m.u16((pCur + 4) >>> 0)
    const y0 = m.u16((pCur + 2) >>> 0)
    let dx = (x1 - x0) | 0
    const y1 = m.u16((pCur + 6) >>> 0)
    const dy = (y1 - y0) | 0
    if (dx === pdx && dy === pdy) {
      run = (run + 1) | 0
    } else if (run <= 0 && pdx !== dx && pdy !== dy) {
      run = 1
      dx = -2
    } else {
      m.setU32((pOut + cnt * 4) >>> 0, m.u32(pCur))
      cnt = (cnt + 1) | 0
      run = 0
    }
    pdx = dx
    pdy = dy
  }
  m.setU32((pOut + cnt * 4) >>> 0, m.u32((pPoints + last * 4) >>> 0))
  return (cnt + 1) | 0
}

/**
 * `@va D2Common:0x6FD684C0` (`PATH_BresenhamLine`, not exported; LTCG `edi = pOut` + 4 stack args
 * `(dwStartPt, dwEndPt, nMax, int* pDir)`, `ret 0x10`). Sole caller `0x6FD68C40` (`0x6FD68CCC`).
 *
 * Rasterises a 16-bit `(x, y)` Bresenham line from `dwStartPt` (exclusive) to `dwEndPt` (inclusive) into `pOut`:
 * - Initializes `*pDir = 0` (`0x6FD684F1`), `lim = nMax - 1` (`0x6FD684DA`).
 * - Updates `*pDir` (`1`/+X, `3`/-X for X-major or horizontal; `2`/+Y, `0`/-Y for Y-major or vertical) BEFORE checking
 *   whether `major > lim` (`0x6FD6853B/0x6FD68589/0x6FD685D3/0x6FD68639`).
 * - On `(0, 0)` delta (`0x6FD68528`) or `major > lim` (`0x6FD68641`), writes `pOut[0].x = 0` (16-bit word only;
 *   `pOut[0].y` is untouched) and returns `0`.
 * - Otherwise writes `major` `(u16 x, u16 y)` points, terminates with `pOut[major].x = 0` (16-bit word only,
 *   `0x6FD68561/0x6FD685B1/0x6FD68621/0x6FD68693`), and returns `major`.
 */
export function PATH_BresenhamLine113c(
  m: Memory113c,
  pOut: number,
  dwStartPt: number,
  dwEndPt: number,
  nMax: number,
  pDir: number,
): number {
  const lim = (nMax - 1) | 0
  const x0 = dwStartPt & 0xffff
  const y0 = dwStartPt >>> 16
  const x1 = dwEndPt & 0xffff
  const y1 = dwEndPt >>> 16
  let dx = (x1 - x0) | 0
  let dy = (y1 - y0) | 0
  m.setU32(pDir, 0)

  let sx = 1
  if (dx < 0) {
    dx = (-dx) | 0
    sx = -1
  }
  let sy = 1
  if (dy < 0) {
    dy = (-dy) | 0
    sy = -1
  }

  let count = 0
  if (dx === 0) {
    if (dy <= 0) {
      m.setU16(pOut, 0)
      return 0
    }
    m.setU32(pDir, sy > 0 ? 2 : 0)
    if (dy > lim) {
      m.setU16(pOut, 0)
      return 0
    }
    let y = y0
    for (let i = 0; i < dy; i++) {
      y = (y + sy) & 0xffff
      const p = (pOut + count * 4) >>> 0
      m.setU16(p, x0)
      m.setU16((p + 2) >>> 0, y)
      count = (count + 1) | 0
    }
    m.setU16((pOut + count * 4) >>> 0, 0)
    return count
  }

  if (dy === 0) {
    m.setU32(pDir, sx <= 0 ? 3 : 1)
    if (dx > lim) {
      m.setU16(pOut, 0)
      return 0
    }
    let x = x0
    for (let i = 0; i < dx; i++) {
      x = (x + sx) & 0xffff
      const p = (pOut + count * 4) >>> 0
      m.setU16(p, x)
      m.setU16((p + 2) >>> 0, y0)
      count = (count + 1) | 0
    }
    m.setU16((pOut + count * 4) >>> 0, 0)
    return count
  }

  if (dx >= dy) {
    m.setU32(pDir, sx <= 0 ? 3 : 1)
    if (dx > lim) {
      m.setU16(pOut, 0)
      return 0
    }
    let err = 0
    let x = x0
    let y = y0
    for (let i = 0; i < dx; i++) {
      err = (err + dy) | 0
      x = (x + sx) & 0xffff
      if (err >= dx) {
        err = (err - dx) | 0
        y = (y + sy) & 0xffff
      }
      const p = (pOut + count * 4) >>> 0
      m.setU16((p + 2) >>> 0, y)
      m.setU16(p, x)
      count = (count + 1) | 0
    }
    m.setU16((pOut + count * 4) >>> 0, 0)
    return count
  }

  m.setU32(pDir, sy > 0 ? 2 : 0)
  if (dy > lim) {
    m.setU16(pOut, 0)
    return 0
  }
  let err = 0
  let x = x0
  let y = y0
  for (let i = 0; i < dy; i++) {
    y = (y + sy) & 0xffff
    err = (err + dx) | 0
    if (err >= dy) {
      err = (err - dy) | 0
      x = (x + sx) & 0xffff
    }
    const p = (pOut + count * 4) >>> 0
    m.setU16(p, x)
    m.setU16((p + 2) >>> 0, y)
    count = (count + 1) | 0
  }
  m.setU16((pOut + count * 4) >>> 0, 0)
  return count
}

/**
 * `@va D2Common:0x6FD84580` (`D2Common.#10769` `PATH_ComputeSquaredDistance`, stdcall `(nX1, nY1, nX2, nY2)`, `ret 0x10`).
 *
 * `dx = nX2 - nX1; dy = nY2 - nY1; return imul32(dy, dy) + imul32(dx, dx)` (`0x6FD8458C..0x6FD8459E`, 32-bit wrapping).
 */
export function PATH_ComputeSquaredDistance113c(nX1: number, nY1: number, nX2: number, nY2: number): number {
  const dx = (nX2 - nX1) | 0
  const dy = (nY2 - nY1) | 0
  return (imul32(dy, dy) + imul32(dx, dx)) | 0
}

/**
 * `@va D2Common:0x6FD845B0` (`D2Common.#10671` `PATH_SetUnitCollisionPattern`, stdcall `(pUnit, dwCollisionPattern)`, `ret 8`).
 *
 * `pUnit->pPath (+0x2C)->dwCollisionPattern (+0x48) = dwCollisionPattern` (`0x6FD845B4 / 0x6FD845BB`, no NULL checks).
 */
export function PATH_SetUnitCollisionPattern113c(m: Memory113c, pUnit: number, dwCollisionPattern: number): void {
  const pPath = m.get(pUnit, D2UnitStrc.pPath)
  m.set(pPath, D2DynamicPathStrc.dwCollisionPattern, dwCollisionPattern >>> 0)
}

/**
 * `@va D2Common:0x6FD845D0` (`D2Common.#10123` `PATH_GetUnitCollisionPattern`, stdcall `(pUnit)`, `ret 4`).
 *
 * Returns `pUnit->pPath (+0x2C)->dwCollisionPattern (+0x48)` (`0x6FD845D4 / 0x6FD845D7`, no NULL checks).
 */
export function PATH_GetUnitCollisionPattern113c(m: Memory113c, pUnit: number): number {
  const pPath = m.get(pUnit, D2UnitStrc.pPath)
  return m.get(pPath, D2DynamicPathStrc.dwCollisionPattern)
}

/**
 * `@va D2Common:0x6FD84690` (`D2Common.#10229` `PATH_GetStepNum`, stdcall `(pPath)`, `ret 4`).
 *
 * `movzx eax, byte [eax+0x93]; inc eax; ret 4` (`0x6FD84694 / 0x6FD8469B`, no NULL check; returns `1..256`).
 */
export function PATH_GetStepNum113c(m: Memory113c, pPath: number): number {
  return (m.get(pPath, D2DynamicPathStrc.nStepNum) + 1) | 0
}

/**
 * `@va D2Common:0x6FD846A0` (`D2Common.#11005` `PATH_SetStepNum`, stdcall `(pPath, nSteps)`, `ret 8`).
 *
 * NULL -> no-op (`0x6FD846A4`). Otherwise `al = (u8)nSteps`; if `al != 0 && al < 0x14` (`jbe` / `jae` unsigned)
 * writes `al - 1` to `pPath->nStepNum (+0x93)` (`0x6FD846B6`), else writes `0` (`0x6FD846BF`).
 */
export function PATH_SetStepNum113c(m: Memory113c, pPath: number, nSteps: number): void {
  if (pPath === 0) return
  const b = nSteps & 0xff
  m.set(pPath, D2DynamicPathStrc.nStepNum, b !== 0 && b < 0x14 ? (b - 1) & 0xff : 0)
}

/**
 * `@va D2Common:0x6FD846D0` (`D2Common.#10723` `PATH_ClearPrevTargetCoord`, stdcall `(pPath)`, `ret 4`).
 *
 * Zeroes `pPath->wPrevTargetX (+0x14)` and `pPath->wPrevTargetY (+0x16)` as 16-bit words (`0x6FD846D6 / 0x6FD846DA`,
 * no NULL check).
 */
export function PATH_ClearPrevTargetCoord113c(m: Memory113c, pPath: number): void {
  m.set(pPath, D2DynamicPathStrc.wPrevTargetX, 0)
  m.set(pPath, D2DynamicPathStrc.wPrevTargetY, 0)
}

/**
 * `@va D2Common:0x6FD84860` (`D2Common.#11058` `PATH_GetMaxDistance`, stdcall `(pPath)`, `ret 4`).
 *
 * `mov eax, [esp+4]; mov al, [eax+0x91]; ret 4`: returns the low byte `AL = pPath->nDistMax (+0x91)` (no NULL check;
 * upper 24 bits of `eax` in the x86 caller are the pointer high bits, so callers read `AL` / `u8`).
 */
export function PATH_GetMaxDistance113c(m: Memory113c, pPath: number): number {
  return m.get(pPath, D2DynamicPathStrc.nDistMax)
}

/**
 * `@va D2Common:0x6FD84870` (`D2Common.#10981` `PATH_GetDistance`, stdcall `(pPath)`, `ret 4`).
 *
 * `mov eax, [esp+4]; mov al, [eax+0x90]; ret 4`: returns the low byte `AL = pPath->nDist (+0x90)` (no NULL check).
 */
export function PATH_GetDistance113c(m: Memory113c, pPath: number): number {
  return m.get(pPath, D2DynamicPathStrc.nDist)
}

/**
 * `@va D2Common:0x6FD84880` (`D2Common.#10527` `PATH_SetDistance`, stdcall `(pPath, nDist)`, `ret 8`).
 *
 * `mov al, [esp+8]; mov ecx, [esp+4]; mov [ecx+0x90], al; ret 8` (`pPath->nDist = (u8)nDist`, no NULL check).
 */
export function PATH_SetDistance113c(m: Memory113c, pPath: number, nDist: number): void {
  m.set(pPath, D2DynamicPathStrc.nDist, nDist & 0xff)
}

/**
 * `@va D2Common:0x6FD848A0` (`D2Common.#10471` `PATH_GetType`, stdcall `(pPath)`, `ret 4`).
 *
 * Returns `pPath->dwPathType (+0x3C)` (`0x6FD848A4`, no NULL check).
 */
export function PATH_GetType113c(m: Memory113c, pPath: number): number {
  return m.get(pPath, D2DynamicPathStrc.dwPathType)
}

/**
 * `@va D2Common:0x6FD848B0` (`D2Common.#11164` `PATH_SetMoveTestCollisionMask`, stdcall `(pPath, dwMask)`, `ret 8`).
 *
 * Stores full 32-bit `dwMask` at `pPath->nMoveTestCollisionMask (+0x50)` (`0x6FD848B8 mov [ecx+0x50], eax`, no NULL check).
 */
export function PATH_SetMoveTestCollisionMask113c(m: Memory113c, pPath: number, dwMask: number): void {
  m.set(pPath, D2DynamicPathStrc.nMoveTestCollisionMask, dwMask >>> 0)
}

/**
 * `@va D2Common:0x6FD848C0` (`D2Common.#11083` `PATH_GetMoveTestCollisionMask`, stdcall `(pPath)`, `ret 4`).
 *
 * Loads full 32-bit `pPath->nMoveTestCollisionMask (+0x50)` (`0x6FD848C4 mov eax, [eax+0x50]`, no NULL check).
 */
export function PATH_GetMoveTestCollisionMask113c(m: Memory113c, pPath: number): number {
  return m.get(pPath, D2DynamicPathStrc.nMoveTestCollisionMask)
}

/**
 * `@va D2Common:0x6FD848D0` (`D2Common.#10259` `PATH_GetFootprintCollisionMask`, stdcall `(pPath)`, `ret 4`).
 *
 * NULL -> `0xFFFF` (`0x6FD848D8 mov eax, 0xffff`); otherwise `pPath->nFootprintCollisionMask (+0x4C)` (`0x6FD848E0`).
 */
export function PATH_GetFootprintCollisionMask113c(m: Memory113c, pPath: number): number {
  if (pPath === 0) return 0xffff
  return m.get(pPath, D2DynamicPathStrc.nFootprintCollisionMask)
}

/**
 * `@va D2Common:0x6FD848F0` (`D2Common.#10392` `PATH_GetTargetUnit`, stdcall `(pPath)`, `ret 4`).
 *
 * NULL -> `0` (`0x6FD848F4 test eax, eax; jne; ret 4`); otherwise `pPath->pTargetUnit (+0x58)` (`0x6FD848FB`).
 */
export function PATH_GetTargetUnit113c(m: Memory113c, pPath: number): number {
  if (pPath === 0) return 0
  return m.get(pPath, D2DynamicPathStrc.pTargetUnit)
}

/**
 * `PATH_SetDirection` `.rdata` turn-rate table at `0x6FDE41C8` (64 `int32_t` entries, 256 bytes total;
 * read as `mov al, byte [eax*4+0x6fde41c8]` at `0x6FD850DD`).
 */
export const PATH_DIR_TURN_RATE_TABLE_6FDE41C8 = Int32Array.from([
  0, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4,
  4, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
  -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8,
  -4, -4, -4, -4, -4, -4, -4, -4, -1, -1, -1, -1, -1, -1, -1, -1,
])

/**
 * `PATH_OctileDistanceWithTable` `.rdata` 8x8 lookup table at `0x6FDE3F20` (64 `int32_t` entries, 256 bytes total).
 */
export const PATH_OCTILE_DISTANCE_TABLE_6FDE3F20 = Int32Array.from([
  -1, -1, -1, 0, 2, 4, 6, 8,
  -1, -1, 0, 1, 2, 4, 6, 8,
  -1, 0, 0, 2, 3, 5, 7, 8,
  0, 1, 2, 2, 4, 5, 7, 8,
  2, 2, 3, 4, 5, 6, 7, 9,
  4, 4, 5, 5, 6, 7, 8, 9,
  6, 6, 7, 7, 7, 8, 10, 10,
  8, 8, 8, 8, 9, 9, 10, 11,
])

/**
 * `PATH_IdaStar_AdvanceNeighborIndex` `.rdata` 32-entry jitter table at `0x6FDDB960` (32 `int32_t` entries, 128 bytes).
 */
export const PATH_IDASTAR_JITTER_TABLE_6FDDB960 = Int32Array.from([
  -2, -1, 0, 1, 2, -2, -1, 0,
  1, 2, -2, -1, 0, 1, 2, -2,
  -1, 0, 1, 2, -2, -1, 0, 1,
  2, -2, -1, 0, 1, 2, -1, 1,
])

/**
 * `PATH_AStar` `.rdata` X-coordinate permutation table at `0x6FDDB458` (128 `uint32_t` entries, 512 bytes).
 */
export const PATH_ASTAR_HASH_X_6FDDB458 = Uint32Array.from([
  57, 92, 72, 94, 119, 80, 14, 84, 93, 17, 20, 37, 87, 70, 100, 108,
  30, 91, 85, 60, 40, 3, 118, 78, 81, 109, 43, 26, 67, 27, 49, 75,
  69, 2, 58, 36, 55, 5, 122, 125, 11, 35, 77, 59, 29, 18, 28, 82,
  63, 86, 83, 105, 90, 48, 101, 38, 115, 9, 41, 89, 95, 19, 1, 61,
  51, 7, 110, 34, 126, 47, 15, 6, 99, 22, 104, 4, 71, 97, 121, 114,
  0, 112, 62, 54, 23, 111, 74, 123, 45, 120, 44, 50, 31, 39, 42, 66,
  33, 113, 53, 64, 16, 65, 106, 96, 88, 24, 46, 56, 103, 68, 10, 117,
  25, 32, 124, 127, 76, 8, 79, 21, 102, 52, 107, 73, 13, 116, 98, 12,
])

/**
 * `PATH_AStar` `.rdata` Y-coordinate permutation table at `0x6FDDB658` (128 `uint32_t` entries, 512 bytes).
 */
export const PATH_ASTAR_HASH_Y_6FDDB658 = Uint32Array.from([
  114, 80, 68, 91, 97, 73, 127, 88, 18, 58, 101, 41, 19, 108, 6, 8,
  24, 99, 83, 33, 77, 56, 74, 37, 43, 107, 85, 12, 75, 30, 27, 23,
  92, 69, 115, 2, 84, 7, 17, 20, 117, 67, 31, 121, 111, 105, 120, 96,
  94, 122, 47, 25, 4, 112, 34, 62, 10, 89, 1, 40, 76, 71, 49, 51,
  90, 55, 118, 50, 116, 106, 109, 42, 45, 65, 28, 60, 123, 36, 98, 48,
  124, 22, 64, 38, 15, 102, 110, 79, 57, 125, 59, 21, 70, 63, 93, 86,
  66, 35, 16, 53, 61, 103, 29, 52, 119, 46, 100, 3, 0, 126, 32, 81,
  87, 9, 26, 14, 95, 113, 13, 54, 104, 82, 44, 72, 5, 78, 11, 39,
])

/**
 * `@va D2Common:0x6FD84D30` (`D2Common.#10777` `PATH_GetVelocity`, stdcall `(pPath)`, `ret 4`).
 *
 * Returns `pPath->dwVelocity (+0x7C)` (`0x6FD84D34`, no NULL check).
 */
export function PATH_GetVelocity113c(m: Memory113c, pPath: number): number {
  return m.get(pPath, D2DynamicPathStrc.dwVelocity)
}

/**
 * `@va D2Common:0x6FD84D40` (`D2Common.#10488` `PATH_SetVelocity`, stdcall `(pPath, nVelocity, szFile, nLine)`, `ret 0x10`).
 *
 * - NULL `pPath` -> no-op (`0x6FD84D44`).
 * - If `nVelocity != pPath->dwVelocity (+0x7C)`, writes `0x0F` to `pPath->dwVelocityChangeCounter (+0x38)` (`0x6FD84D54`).
 * - Writes `nVelocity` to `pPath->dwVelocity (+0x7C)` and `pPath->dwMaxVelocity (+0x84)` (`0x6FD84D5B..0x6FD84D5E`).
 */
export function PATH_SetVelocity113c(
  m: Memory113c,
  pPath: number,
  nVelocity: number,
  _szFile = 0,
  _nLine = 0,
): void {
  if (pPath === 0) return
  const v = nVelocity >>> 0
  if (v !== m.get(pPath, D2DynamicPathStrc.dwVelocity)) {
    m.set(pPath, D2DynamicPathStrc.dwVelocityChangeCounter, 0x0f)
  }
  m.set(pPath, D2DynamicPathStrc.dwVelocity, v)
  m.set(pPath, D2DynamicPathStrc.dwMaxVelocity, v)
}

/**
 * `@va D2Common:0x6FD84E70` (`PATH_UpdateOutOfRoomFlag`, not exported; LTCG `eax = pPath`, plain `ret`).
 *
 * - Clears bit 0 of `pPath->dwFlags (+0x34)` (`0x6FD84E79..0x6FD84E83`).
 * - If `(int32)pPath->dwPathPoints (+0x28) > 0` (`0x6FD84E86`), walks `i = 0 .. dwPathPoints - 1`:
 *   - Reads `pRoom = pPath->pRoom (+0x1C)`, `x = pPath->wPathPoints[i].x (+0x9C + i*4)`,
 *     `y = pPath->wPathPoints[i].y (+0x9E + i*4)`.
 *   - If `pRoom == 0` or `x < r.nSubtileX` or `x >= r.nSubtileX + r.nSubtileWidth` or
 *     `y < r.nSubtileY` or `y >= r.nSubtileY + r.nSubtileHeight` (signed `jl`/`jge`), sets bit 0 of `dwFlags`
 *     and returns (`0x6FD84ED1..0x6FD84EDB`).
 */
export function PATH_UpdateOutOfRoomFlag113c(m: Memory113c, pPath: number): void {
  let flags = (m.get(pPath, D2DynamicPathStrc.dwFlags) & ~1) >>> 0
  m.set(pPath, D2DynamicPathStrc.dwFlags, flags)
  const nPts = m.get(pPath, D2DynamicPathStrc.dwPathPoints) | 0
  if (nPts <= 0) return
  for (let i = 0; i < nPts; i++) {
    const pRoom = m.get(pPath, D2DynamicPathStrc.pRoom)
    if (pRoom === 0) {
      flags = (flags | 1) >>> 0
      m.set(pPath, D2DynamicPathStrc.dwFlags, flags)
      return
    }
    const ptOff = (pPath + 0x9c + i * 4) >>> 0
    const x = m.u16(ptOff)
    const y = m.u16((ptOff + 2) >>> 0)
    const rx = m.get(pRoom, D2ActiveRoomStrc.nSubtileX) | 0
    if (x < rx) {
      flags = (flags | 1) >>> 0
      m.set(pPath, D2DynamicPathStrc.dwFlags, flags)
      return
    }
    const rw = m.get(pRoom, D2ActiveRoomStrc.nSubtileWidth) | 0
    if (x >= ((rx + rw) | 0)) {
      flags = (flags | 1) >>> 0
      m.set(pPath, D2DynamicPathStrc.dwFlags, flags)
      return
    }
    const ry = m.get(pRoom, D2ActiveRoomStrc.nSubtileY) | 0
    if (y < ry) {
      flags = (flags | 1) >>> 0
      m.set(pPath, D2DynamicPathStrc.dwFlags, flags)
      return
    }
    const rh = m.get(pRoom, D2ActiveRoomStrc.nSubtileHeight) | 0
    if (y >= ((ry + rh) | 0)) {
      flags = (flags | 1) >>> 0
      m.set(pPath, D2DynamicPathStrc.dwFlags, flags)
      return
    }
  }
}

/**
 * `@va D2Common:0x6FD84F50` (`D2Common.#10168` `PATH_SetNewDistance`, stdcall `(pPath, nNewDist)`, `ret 8`).
 *
 * - NULL `pPath` -> no-op (`0x6FD84F56`).
 * - Zero-extends low byte `v = nNewDist & 0xFF`; clamps `if (v >= 0x4D) v = 0x4D`; writes `v` to both
 *   `pPath->nDistMax (+0x91)` and `pPath->nDist (+0x90)` (`0x6FD84F64..0x6FD84F6A`).
 */
export function PATH_SetNewDistance113c(m: Memory113c, pPath: number, nNewDist: number): void {
  if (pPath === 0) return
  let v = nNewDist & 0xff
  if (v >= 0x4d) v = 0x4d
  m.set(pPath, D2DynamicPathStrc.nDistMax, v)
  m.set(pPath, D2DynamicPathStrc.nDist, v)
}

/**
 * `@va D2Common:0x6FD85040` (`D2Common.#10336` `PATH_SetTargetUnit`, stdcall `(pPath, pUnit)`, `ret 8`).
 *
 * Writes `pPath->pTargetUnit (+0x58) = pUnit`; if `pUnit != 0`, also copies `pUnit->dwUnitType (+0x00)` to
 * `pPath->dwTargetType (+0x5C)` and `pUnit->dwUnitId (+0x0C)` to `pPath->dwTargetId (+0x60)`.
 */
export function PATH_SetTargetUnit113c(m: Memory113c, pPath: number, pUnit: number): void {
  const u = pUnit >>> 0
  m.set(pPath, D2DynamicPathStrc.pTargetUnit, u)
  if (u !== 0) {
    m.set(pPath, D2DynamicPathStrc.dwTargetType, m.get(u, D2UnitStrc.dwUnitType))
    m.set(pPath, D2DynamicPathStrc.dwTargetId, m.get(u, D2UnitStrc.dwUnitId))
  }
}

/**
 * `@va D2Common:0x6FD85080` (`D2Common.#10165` `PATH_SetNumberOfPathPoints`, stdcall `(pPath, nPoints)`, `ret 8`).
 *
 * Clamps signed `nPoints > 0x4D` to `0x4D` (`cmp eax, 0x4d; jle` at `0x6FD85084..0x6FD85087`, no lower bound clamp)
 * and stores into `pPath->dwPathPoints (+0x28)`.
 */
export function PATH_SetNumberOfPathPoints113c(m: Memory113c, pPath: number, nPoints: number): void {
  const pts = (nPoints | 0) > 0x4d ? 0x4d : nPoints | 0
  m.set(pPath, D2DynamicPathStrc.dwPathPoints, pts >>> 0)
}

/**
 * `@va D2Common:0x6FD850B0` (`PATH_SetDirection`, not exported; LTCG `ecx = pPath`, `al = nDir`, plain `ret`).
 *
 * - Masks `dir = nDir & 0x3F`; reads `pUnit = pPath->pUnit (+0x30)` and `uType = pUnit ? pUnit->dwUnitType : 6`.
 * - `uType == 2` (object) or `uType == 4` (item): writes `pPath->nDirection (+0x64) = dir`.
 * - `uType == 3` (missile): if `(pPath->dwFlags (+0x34) & 0x40) == 0`, writes `pPath->nDirection (+0x64) = dir`.
 * - Otherwise (`uType == 0, 1, 5, 6, ...`): if `dir != pPath->nNewDirection (+0x65)`, sets `nNewDirection = dir` and
 *   `nDiffDirection (+0x66) = PATH_DIR_TURN_RATE_TABLE_6FDE41C8[(dir - nDirection) & 0x3F] & 0xFF`.
 */
export function PATH_SetDirection113c(m: Memory113c, pPath: number, nDir: number): void {
  const dir = nDir & 0x3f
  const pUnit = m.get(pPath, D2DynamicPathStrc.pUnit)
  const uType = pUnit === 0 ? 6 : m.get(pUnit, D2UnitStrc.dwUnitType) | 0
  if (uType === 2 || uType === 4) {
    m.set(pPath, D2DynamicPathStrc.nDirection, dir)
    return
  }
  if (uType === 3) {
    if ((m.get(pPath, D2DynamicPathStrc.dwFlags) & 0x40) === 0) {
      m.set(pPath, D2DynamicPathStrc.nDirection, dir)
    }
    return
  }
  if (dir !== m.get(pPath, D2DynamicPathStrc.nNewDirection)) {
    const oldDir = m.get(pPath, D2DynamicPathStrc.nDirection)
    m.set(pPath, D2DynamicPathStrc.nNewDirection, dir)
    const diff = (dir - oldDir) & 0x3f
    m.set(pPath, D2DynamicPathStrc.nDiffDirection, PATH_DIR_TURN_RATE_TABLE_6FDE41C8[diff]! & 0xff)
  }
}

/**
 * `@va D2Common:0x6FD85100` (`PATH_GetMonsterMoveTestMask`, not exported; LTCG `eax = pMonsterUnit`, plain `ret`).
 *
 * - Resolves `pMonStatsTxt` for `pMonsterUnit->dwClassId (+0x04)` via `sgptDataTables (+0xA78 / +0xA80)`.
 * - Loads `pBitMasks = *(u32*)0x6FDD90B0` (`__imp_gdwBitMasks`).
 * - If `(pMonStatsTxt->nBitField2 (+0x0D) & u8(pBitMasks + 0x18)) != 0` (flying bit), returns `0x1804`.
 * - Else if `(pMonStatsTxt->nBitField1 (+0x0C) & u8(pBitMasks + 0x0C)) != 0` (open-doors bit), returns `0x3401`,
 *   otherwise `0x3C01`.
 */
export function PATH_GetMonsterMoveTestMask113c(m: Memory113c, pMonsterUnit: number): number {
  let pMonStats = 0
  if (pMonsterUnit !== 0) {
    const classId = m.get(pMonsterUnit, D2UnitStrc.dwClassId) | 0
    if (classId >= 0) {
      const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)
      const count = m.u32((dt + DATATABLES_OFF_113C.nMonStatsTxtRecordCount) >>> 0) | 0
      if (classId < count) {
        pMonStats = (m.u32((dt + DATATABLES_OFF_113C.pMonStatsTxt) >>> 0) + imul32(classId, D2MonStatsTxt_SIZE)) >>> 0
      }
    }
  }
  const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
  const bf2 = m.get(pMonStats, D2MonStatsTxt.nBitField2)
  if ((bf2 & m.u8((pBitMasks + 0x18) >>> 0)) !== 0) {
    return 0x1804
  }
  const bf1 = m.get(pMonStats, D2MonStatsTxt.nBitField1)
  return (bf1 & m.u8((pBitMasks + 0x0c) >>> 0)) !== 0 ? 0x3401 : 0x3c01
}

/**
 * `@va D2Common:0x6FD8E110` (`PATH_NormalizePrecisionVector`, not exported; LTCG `eax = pVecX`, `ecx = pVecY`, plain `ret`).
 *
 * Arithmetic-shifts (`sar 1`) both `*pVecX` and `*pVecY` while `*pVecX > 0x10000` or `*pVecX < -0x10000`,
 * then again while `*pVecY > 0x10000` or `*pVecY < -0x10000`.
 */
export function PATH_NormalizePrecisionVector113c(m: Memory113c, pVecX: number, pVecY: number): void {
  const x0 = m.u32(pVecX) | 0
  if (x0 >= 0) {
    if (x0 > 0x10000) {
      do {
        m.setU32(pVecX, sar32(m.u32(pVecX) | 0, 1) >>> 0)
        m.setU32(pVecY, sar32(m.u32(pVecY) | 0, 1) >>> 0)
      } while ((m.u32(pVecX) | 0) > 0x10000)
    }
  } else if (x0 < -0x10000) {
    do {
      m.setU32(pVecX, sar32(m.u32(pVecX) | 0, 1) >>> 0)
      m.setU32(pVecY, sar32(m.u32(pVecY) | 0, 1) >>> 0)
    } while ((m.u32(pVecX) | 0) < -0x10000)
  }

  const y0 = m.u32(pVecY) | 0
  if (y0 >= 0) {
    if (y0 > 0x10000) {
      do {
        m.setU32(pVecX, sar32(m.u32(pVecX) | 0, 1) >>> 0)
        const ny = sar32(m.u32(pVecY) | 0, 1)
        m.setU32(pVecY, ny >>> 0)
        if (ny <= 0x10000) break
      } while (true)
    }
  } else if (y0 < -0x10000) {
    do {
      m.setU32(pVecX, sar32(m.u32(pVecX) | 0, 1) >>> 0)
      const ny = sar32(m.u32(pVecY) | 0, 1)
      m.setU32(pVecY, ny >>> 0)
      if (ny >= -0x10000) break
    } while (true)
  }
}

/**
 * `@va D2Common:0x6FD8E190` (`PATH_QuantizeDirectionIndex25`, not exported; stdcall `(dwStartCoord, dwEndCoord)`, `ret 8`).
 *
 * Quantizes the 16-bit `(x, y)` delta between `dwStartCoord` and `dwEndCoord` into a 5x5 grid index `5*sx + sy + 12` (`0..24`).
 */
export function PATH_QuantizeDirectionIndex25_113c(dwStartCoord: number, dwEndCoord: number): number {
  let edx = ((dwEndCoord & 0xffff) - (dwStartCoord & 0xffff)) | 0
  let esi = ((dwEndCoord >>> 16) - (dwStartCoord >>> 16)) | 0
  const absX = edx >= 0 ? edx : -edx | 0
  const absY = esi >= 0 ? esi : -esi | 0

  if (absX >= ((absY * 2) | 0)) {
    esi = esi < 0 ? -1 : esi & 1
    if (edx < -1) edx = -2
    else if (edx > 1) edx = 2
  } else {
    if (absY >= ((absX * 2) | 0)) {
      if (edx < 0) {
        edx = -1
      } else {
        edx = edx & 1
        if (edx < -1) edx = -2
        else if (edx > 1) edx = 2
      }
    } else {
      if (edx < -1) edx = -2
      else if (edx > 1) edx = 2
    }
  }

  if (esi < -1) esi = -2
  else if (esi > 1) esi = 2
  return (esi + edx * 5 + 12) | 0
}

/**
 * `@va D2Common:0x6FD8E2B0` (`PATH_OctileDistanceWithTable`, not exported; stdcall `(dwCoord1, dwCoord2)`, `ret 8`).
 *
 * For `|dx| < 8 && |dy| < 8`, returns `v < 0 ? 0 : v + 1` where `v = PATH_OCTILE_DISTANCE_TABLE_6FDE3F20[dx + dy * 8]`.
 * Otherwise returns `dx > dy ? dy + dx * 2 : dx + dy * 2`.
 */
export function PATH_OctileDistanceWithTable113c(dwCoord1: number, dwCoord2: number): number {
  let dx = ((dwCoord1 & 0xffff) - (dwCoord2 & 0xffff)) | 0
  if (dx < 0) dx = -dx | 0
  let dy = ((dwCoord1 >>> 16) - (dwCoord2 >>> 16)) | 0
  if (dy < 0) dy = -dy | 0
  if (dx < 8 && dy < 8) {
    const v = PATH_OCTILE_DISTANCE_TABLE_6FDE3F20[dx + dy * 8]! | 0
    return v < 0 ? 0 : (v + 1) | 0
  }
  return dx > dy ? (dy + dx * 2) | 0 : (dx + dy * 2) | 0
}

/**
 * `@va D2Common:0x6FDC0650` (`PATH_IdaStar_FlushNodeToDynamicPath`, not exported; LTCG `eax = pPathInfo`, `ecx = pNode`, plain `ret`).
 *
 * Walks the IDA* parent chain (`pNode->pParent` at `+0x14`, `(wPosX, wPosY)` at `+0x08..+0x0A`), pushing non-collinear
 * step vertices onto a reverse stack (up to 78 entries; root node with `pParent == 0` is excluded). If `1 < count < 78`,
 * copies `count` `uint32_t` coordinates in forward order into `pPathInfo->pDynamicPath (+0x30)->wPathPoints (+0x9C)`
 * and returns `count`; else returns `0`.
 */
export function PATH_IdaStar_FlushNodeToDynamicPath113c(m: Memory113c, pPathInfo: number, pNode: number): number {
  const pOut = (m.u32((pPathInfo + 0x30) >>> 0) + 0x9c) >>> 0
  if (pNode === 0) return 0
  const stack = new Uint32Array(0x4e)
  let count = 0
  let prevDx = -2
  let prevDy = -2
  let cur = pNode >>> 0
  while (cur !== 0 && count < 0x4e) {
    const pParent = m.get(cur, D2IdaStarNodeStrc.pParent)
    if (pParent !== 0) {
      const dx = (m.get(cur, D2IdaStarNodeStrc.wPosX) - m.get(pParent, D2IdaStarNodeStrc.wPosX)) | 0
      const dy = (m.get(cur, D2IdaStarNodeStrc.wPosY) - m.get(pParent, D2IdaStarNodeStrc.wPosY)) | 0
      if (dx !== prevDx || dy !== prevDy) {
        stack[count] = m.u32((cur + 0x08) >>> 0)
        count = (count + 1) | 0
        prevDx = dx
        prevDy = dy
      }
    }
    cur = pParent
  }
  if (count <= 1 || count >= 0x4e) return 0
  for (let i = 0; i < count; i++) {
    m.setU32((pOut + i * 4) >>> 0, stack[count - 1 - i]!)
  }
  return count
}

/**
 * `@va D2Common:0x6FDC07E0` (`PATH_IdaStar_AdvanceNeighborIndex`, not exported; LTCG `eax = pContext`, `esi = pNode`, plain `ret`).
 *
 * Advances `pNode->nNextNeighborIndex (+0x10)` modulo 8:
 * - If `*(u32*)(pContext + 0x36FD0) != 0`, steps the 64-bit LCG seed pointed to by `*(u32*)(pContext + 0x36FD4)`
 *   (writing `hi` at `+4` then `lo` at `+0`) and sets
 *   `pNode->nNextNeighborIndex = (PATH_IDASTAR_JITTER_TABLE_6FDDB960[newLo & 0x1F] + *pNode->pBestDirection + pNode->nNextNeighborIndex) & 7`.
 * - Otherwise sets `pNode->nNextNeighborIndex = (*pNode->pBestDirection + pNode->nNextNeighborIndex) & 7`.
 */
export function PATH_IdaStar_AdvanceNeighborIndex113c(m: Memory113c, pContext: number, pNode: number): void {
  const bRandom = m.u32((pContext + 0x36fd0) >>> 0)
  if (bRandom !== 0) {
    const pSeed = m.u32((pContext + 0x36fd4) >>> 0)
    const seed: D2SeedStrc = { lo: m.u32(pSeed), hi: m.u32((pSeed + 4) >>> 0) }
    seedNext(seed)
    m.setU32((pSeed + 4) >>> 0, seed.hi)
    m.setU32(pSeed, seed.lo)
    const pDelta = m.get(pNode, D2IdaStarNodeStrc.pBestDirection)
    const delta = m.u32(pDelta) | 0
    const curIdx = m.get(pNode, D2IdaStarNodeStrc.nNextNeighborIndex) | 0
    const jitter = PATH_IDASTAR_JITTER_TABLE_6FDDB960[seed.lo & 0x1f]! | 0
    const nextIdx = (jitter + delta + curIdx) & 7
    m.set(pNode, D2IdaStarNodeStrc.nNextNeighborIndex, nextIdx >>> 0)
    return
  }
  const pDelta = m.get(pNode, D2IdaStarNodeStrc.pBestDirection)
  const nextIdx = (m.u32(pDelta) + m.get(pNode, D2IdaStarNodeStrc.nNextNeighborIndex)) & 7
  m.set(pNode, D2IdaStarNodeStrc.nNextNeighborIndex, nextIdx >>> 0)
}

/**
 * `@va D2Common:0x6FDCAB50` (`PATH_AStar_FlushNodeToDynamicPath`, not exported; LTCG `eax = pPathInfo`, `ecx = pNode`, plain `ret`).
 *
 * Walks the A* parent chain (`pNode->pParent` at `+0x0C`, `(wPosX, wPosY)` at `+0x00..+0x02`), pushing non-collinear
 * step vertices onto a reverse stack (up to 78 entries; root node with `pParent == 0` is excluded). If `1 <= count < 78`,
 * copies `count` `uint32_t` coordinates in forward order into `pPathInfo->pDynamicPath (+0x30)->wPathPoints (+0x9C)`
 * and returns `count`; else returns `0`.
 */
export function PATH_AStar_FlushNodeToDynamicPath113c(m: Memory113c, pPathInfo: number, pNode: number): number {
  const pOut = (m.u32((pPathInfo + 0x30) >>> 0) + 0x9c) >>> 0
  if (pNode === 0) return 0
  const stack = new Uint32Array(0x4e)
  let count = 0
  let prevDx = -2
  let prevDy = -2
  let cur = pNode >>> 0
  while (cur !== 0 && count < 0x4e) {
    const pParent = m.get(cur, D2AStarNodeStrc.pParent)
    if (pParent !== 0) {
      const dx = (m.get(cur, D2AStarNodeStrc.wPosX) - m.get(pParent, D2AStarNodeStrc.wPosX)) | 0
      const dy = (m.get(cur, D2AStarNodeStrc.wPosY) - m.get(pParent, D2AStarNodeStrc.wPosY)) | 0
      if (dx !== prevDx || dy !== prevDy) {
        stack[count] = m.u32(cur)
        count = (count + 1) | 0
        prevDx = dx
        prevDy = dy
      }
    }
    cur = pParent
  }
  if (count < 1 || count >= 0x4e) return 0
  for (let i = 0; i < count; i++) {
    m.setU32((pOut + i * 4) >>> 0, stack[count - 1 - i]!)
  }
  return count
}

/**
 * `@va D2Common:0x6FDCAE20` (`PATH_AStar_PushToOpenAndHash`, not exported; LTCG `edi = pContext`, `esi = pNode`, plain `ret`).
 *
 * - Computes 7-bit bucket index `h = (PATH_ASTAR_HASH_Y_6FDDB658[u8(pNode+2) & 0x7F] + PATH_ASTAR_HASH_X_6FDDB458[u8(pNode) & 0x7F]) & 0x7F`.
 * - Pushes `pNode` at head of `pContext->pOpenHeaders[h]` (`pContext + h*4`, linked via `pNode->pHashNext` at `+0x30`).
 * - Inserts `pNode` into the ascending `wFScore` (`int16` at `+0x04`) chain rooted at `pContext->pOpenBest` (`pContext + 0x400`,
 *   linked via `pNode->pBestNext` at `+0x34`), placing `pNode` before the first node with `cur->wFScore >= pNode->wFScore`.
 */
export function PATH_AStar_PushToOpenAndHash113c(m: Memory113c, pContext: number, pNode: number): void {
  let cur = m.u32((pContext + 0x400) >>> 0)
  const yIdx = m.u8((pNode + 2) >>> 0) & 0x7f
  const xIdx = m.u8(pNode) & 0x7f
  const hash = (PATH_ASTAR_HASH_Y_6FDDB658[yIdx]! + PATH_ASTAR_HASH_X_6FDDB458[xIdx]!) & 0x7f
  const bucketAddr = (pContext + hash * 4) >>> 0
  m.set(pNode, D2AStarNodeStrc.pHashNext, m.u32(bucketAddr))
  m.setU32(bucketAddr, pNode >>> 0)

  const nodeF = (m.get(pNode, D2AStarNodeStrc.wFScore) << 16) >> 16
  if (cur !== 0) {
    let prev = 0
    while (cur !== 0) {
      const curF = (m.get(cur, D2AStarNodeStrc.wFScore) << 16) >> 16
      if (curF >= nodeF) break
      prev = cur
      cur = m.get(cur, D2AStarNodeStrc.pBestNext)
    }
    if (prev !== 0) {
      m.set(prev, D2AStarNodeStrc.pBestNext, pNode >>> 0)
      m.set(pNode, D2AStarNodeStrc.pBestNext, cur)
      return
    }
  }
  const head = m.u32((pContext + 0x400) >>> 0)
  m.set(pNode, D2AStarNodeStrc.pBestNext, head)
  m.setU32((pContext + 0x400) >>> 0, pNode >>> 0)
}

/**
 * `@va D2Common:0x6FDCAF70` (`PATH_AStar_EvaluateHeuristic`, not exported; stdcall `(dwCoord1, dwCoord2)`, `ret 8`).
 *
 * Returns `dx >= dy ? dy + dx * 2 : dx + dy * 2` where `dx = |(u16)dwCoord1 - (u16)dwCoord2|` and
 * `dy = |(dwCoord1 >>> 16) - (dwCoord2 >>> 16)|`.
 */
export function PATH_AStar_EvaluateHeuristic113c(dwCoord1: number, dwCoord2: number): number {
  let dx = ((dwCoord1 & 0xffff) - (dwCoord2 & 0xffff)) | 0
  if (dx < 0) dx = -dx | 0
  let dy = ((dwCoord1 >>> 16) - (dwCoord2 >>> 16)) | 0
  if (dy < 0) dy = -dy | 0
  return dx >= dy ? (dy + dx * 2) | 0 : (dx + dy * 2) | 0
}

/**
 * `@va D2Common:0x6FDCB220` (`PATH_AStar_PopBestOpenToClosed`, not exported; LTCG `esi = pContext`, plain `ret`).
 *
 * - Pops `pNode = pContext->pOpenBest` (`*(u32*)(pContext + 0x400)`); if `0`, returns `0`.
 * - Advances `pContext->pOpenBest = pNode->pBestNext (+0x34)`.
 * - Unlinks `pNode` from `pContext->pOpenHeaders[h]` (`pContext + h*4`, linked via `pHashNext` at `+0x30`),
 *   then pushes `pNode` onto `pContext->pClosedHeaders[h]` (`pContext + 0x200 + h*4`) and returns `pNode`.
 */
export function PATH_AStar_PopBestOpenToClosed113c(m: Memory113c, pContext: number): number {
  const pNode = m.u32((pContext + 0x400) >>> 0)
  if (pNode === 0) return 0
  m.setU32((pContext + 0x400) >>> 0, m.get(pNode, D2AStarNodeStrc.pBestNext))

  const yIdx = m.u8((pNode + 2) >>> 0) & 0x7f
  const xIdx = m.u8(pNode) & 0x7f
  const hash = (PATH_ASTAR_HASH_Y_6FDDB658[yIdx]! + PATH_ASTAR_HASH_X_6FDDB458[xIdx]!) & 0x7f
  const openBucketAddr = (pContext + hash * 4) >>> 0
  let cur = m.u32(openBucketAddr)
  let prev = 0
  if (cur !== pNode) {
    do {
      prev = cur
      cur = m.get(cur, D2AStarNodeStrc.pHashNext)
    } while (cur !== pNode)
  }
  if (prev !== 0) {
    m.set(prev, D2AStarNodeStrc.pHashNext, m.get(pNode, D2AStarNodeStrc.pHashNext))
  } else {
    m.setU32(openBucketAddr, m.get(pNode, D2AStarNodeStrc.pHashNext))
  }

  m.set(pNode, D2AStarNodeStrc.pHashNext, 0)
  const closedBucketAddr = (pContext + 0x200 + hash * 4) >>> 0
  const oldClosed = m.u32(closedBucketAddr)
  m.set(pNode, D2AStarNodeStrc.pHashNext, oldClosed)
  m.setU32(closedBucketAddr, pNode)
  return pNode
}

