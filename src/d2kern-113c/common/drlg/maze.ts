import {
  D2DrlgLevelStrc,
  D2DrlgStrc,
} from '../../mem/layout.generated.js'
import type { Memory113c } from '../../mem/sparse-memory.js'

/**
 * 0x6FD5E3E0 — DRLGMAZE_HasMapDS1 (73 bytes).
 * Custom register ABI: `ecx = pLevel` (`D2DrlgLevelStrc*`), plain `ret`.
 *
 * @va D2Common:0x6FD5E3E0
 */
export function DRLGMAZE_HasMapDS1113c(m: Memory113c, pLevel: number): number {
  if (pLevel === 0) {
    throw new Error('Fog.#10265: pLevel != NULL (line 28)')
  }
  const pMaze = m.get(pLevel, D2DrlgLevelStrc.pOutdoors)
  if (pMaze === 0) {
    throw new Error('Fog.#10265: pLevel->pMaze != NULL (line 30)')
  }
  const pDrlg = m.get(pLevel, D2DrlgLevelStrc.pDrlg)
  const nDiff = m.get(pDrlg, D2DrlgStrc.nDifficulty)
  const val = m.u32((pMaze + nDiff * 4 + 0x04) >>> 0) | 0
  return val === 1 ? 1 : 0
}
