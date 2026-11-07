/**
 * Diablo II v1.13c `D2Common.dll` preset-map (`Drlg\Preset.cpp` block) leaf functions, image base `0x6FD50000`.
 *
 * 1:1 ports of the cited disassembly. Neither function calls anything. Offsets come from
 * `mem/layout.generated.ts` (`D2DrlgMapStrc`, `D2DrlgCoordStrc` in `docs/oracle/route2-layout.json`).
 */
import type { Memory113c } from '../../mem/sparse-memory.ts'
import { D2DrlgCoordStrc, D2DrlgCoordStrc_SIZE, D2DrlgMapStrc } from '../../mem/layout.generated.ts'
import { sdiv32 } from '../int-math.ts'

/**
 * `@va D2Common:0x6FD59C60` (`DRLGPRESET_FinalizePopsLocations`, not exported; LTCG `esi = pDrlgMap` + 1 stack arg `nPops`, `ret 4`).
 * Sole caller `0x6FD5C060` (`0x6FD5C562 push ecx; mov esi, ebp; call 0x6fd59c60`).
 *
 * - `0x6FD59C6C mov [esi+0x40], eax`: `pDrlgMap->nPops = nPops`; `jle` (signed) -> done when `nPops <= 0`.
 * - For `i` in `0 .. nPops)` (signed `jl`), `R = pDrlgMap->pPopsLocation (+0x50) + 0x10 * i` (re-read every iteration):
 *   - reads `R.x1 (+8)`, `R.x0 (+0)`, `R.y0 (+4)`, `R.y1 (+0xC)`; signed min/max (`jl` / `jg`);
 *   - `R.x0 = pDrlgMap->nPosX (+0x10) + xmin` (`0x6FD59CC0`), `R.y0 = pDrlgMap->nPosY (+0x14) + ymin` (`0x6FD59CCB`),
 *     `R.x1 = xmax - xmin + 1` (`0x6FD59CD5`), `R.y1 = ymax - ymin + 1` (`0x6FD59CD9`), all 32-bit wrapping;
 *   - `pDrlgMap->pPopsIndex (+0x44)[i] = idx / 4 - 1` with C truncating division (`0x6FD59CE4 cdq; and edx, 3;
 *     add eax, edx; sar eax, 2; dec eax`), i.e. `sdiv32(idx, 4) - 1`, NOT a flooring `>> 2`.
 */
export function DRLGPRESET_FinalizePopsLocations113c(m: Memory113c, pDrlgMap: number, nPops: number): void {
  const n = nPops | 0
  m.set(pDrlgMap, D2DrlgMapStrc.nPops, n >>> 0)
  if (n <= 0) return
  for (let i = 0; i < n; i++) {
    const pR = (m.get(pDrlgMap, D2DrlgMapStrc.pPopsLocation) + D2DrlgCoordStrc_SIZE * i) >>> 0
    const x1 = m.get(pR, D2DrlgCoordStrc.nWidth) | 0
    const x0 = m.get(pR, D2DrlgCoordStrc.nPosX) | 0
    const xmin = x0 < x1 ? x0 : x1
    const y0 = m.get(pR, D2DrlgCoordStrc.nPosY) | 0
    const y1 = m.get(pR, D2DrlgCoordStrc.nHeight) | 0
    const ymin = y0 < y1 ? y0 : y1
    const xmax = x0 > x1 ? x0 : x1
    const ymax = y0 > y1 ? y0 : y1
    m.set(pR, D2DrlgCoordStrc.nPosX, (m.get(pDrlgMap, D2DrlgMapStrc.nPosX) + xmin) >>> 0)
    m.set(pR, D2DrlgCoordStrc.nPosY, (m.get(pDrlgMap, D2DrlgMapStrc.nPosY) + ymin) >>> 0)
    m.set(pR, D2DrlgCoordStrc.nWidth, (xmax - xmin + 1) >>> 0)
    m.set(pR, D2DrlgCoordStrc.nHeight, (ymax - ymin + 1) >>> 0)
    const pIdx = (m.get(pDrlgMap, D2DrlgMapStrc.pPopsIndex) + i * 4) >>> 0
    m.setU32(pIdx, (sdiv32(m.u32(pIdx) | 0, 4) - 1) >>> 0)
  }
}

/**
 * `@va D2Common:0x6FD59DD0` (`D2Common.#10171` `DRLGPRESET_MovePointerAndClear`, fastcall `ecx = ppSrc`, `edx = ppDst`, plain `ret`).
 *
 * `mov eax, [ecx]; mov [edx], eax; mov dword [ecx], 0; mov eax, [edx]; ret`: moves ownership of a pointer and returns
 * the value re-read from `*ppDst` (so `ppSrc == ppDst` returns `0`).
 */
export function DRLGPRESET_MovePointerAndClear113c(m: Memory113c, ppSrc: number, ppDst: number): number {
  m.setU32(ppDst, m.u32(ppSrc))
  m.setU32(ppSrc, 0)
  return m.u32(ppDst)
}
