/**
 * Diablo II v1.13c `D2Common.dll` formatted trace logging helper (`0x6FD62AF0`, image base `0x6FD50000`).
 *
 * Binary evidence (`objdump -d -M intel` on 1.13c `D2Common.dll`):
 * - `0x6FD62AF0`: `LOGGING_WriteFormattedEntry` (`__stdcall(a0, a1, a2, a3, szFile, nLine, szFormat, vaList)`, `ret 0x20`)
 *   - `0x6FD62AF0`: `mov eax, ds:0x6FDF1474; sub esp, 0x204; test eax, eax; je 0x6FD62BF4`
 *   - When `bLogEnabled (0x6FDF1474) != 0`, formats timestamp via `GetLocalTime` + `sprintf`,
 *     formats `(a0, a1, a2, a3, szFile, nLine)` via `sprintf(..., "%01d\t%01d\t%01d\t%02d\t%.50s\t%.5d\t", ...)` (`0x6FDE5F24`),
 *     formats `szFormat` + `vaList` via `vsprintf`, appends `"\n"`, and writes to the host CRT `FILE*` (`fwrite` + `fflush`).
 */
import type { Memory113c } from '../mem/sparse-memory.ts'

export const D2COMMON_LOG_ENABLED_VA_113C = 0x6fdf1474

/**
 * `@va D2Common:0x6FD62AF0` (`LOGGING_WriteFormattedEntry`,
 * stdcall `[esp+4..0x20] = (a0, a1, a2, a3, szFile, nLine, szFormat, vaList)`, `ret 0x20`, void).
 */
export function LOGGING_WriteFormattedEntry113c(
  m: Memory113c,
  _a0: number,
  _a1: number,
  _a2: number,
  _a3: number,
  szFile: number,
  _nLine: number,
  szFormat: number,
  vaList: number,
): void {
  const bLogEnabled = m.u32(D2COMMON_LOG_ENABLED_VA_113C)
  if (bLogEnabled === 0) return

  let pFile = szFile >>> 0
  for (let i = 0; i < 50; i++) {
    if (m.u8((pFile + i) >>> 0) === 0) break
  }

  let pFmt = szFormat >>> 0
  let pVa = vaList >>> 0
  while (true) {
    const ch = m.u8(pFmt)
    pFmt = (pFmt + 1) >>> 0
    if (ch === 0) break
    if (ch === 0x25) {
      const spec = m.u8(pFmt)
      if (spec === 0) break
      pFmt = (pFmt + 1) >>> 0
      if (spec !== 0x25 && pVa !== 0) {
        m.u32(pVa)
        pVa = (pVa + 4) >>> 0
      }
    }
  }
}
