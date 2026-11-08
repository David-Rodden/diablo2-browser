/**
 * Diablo II v1.13c `D2Common.dll` `DRLG\DrlgMaze.cpp`, `DRLG\DrlgOutPlace.cpp`, `DATATBLS\DataTbls.cpp`,
 * and `MONSTERS\Monsters.cpp` pure-leaf functions (`0x6FD5E430..0x6FD6A5B0`, image base `0x6FD50000`).
 *
 * Batch `B018` (16 functions):
 * - `0x6FD5E430` `DRLG_ReplacePresetRoom113c` (internal LTCG helper)
 * - `0x6FD5E700` `DRLG_RandomizePresetRooms113c` (internal `__fastcall`)
 * - `0x6FD63FD0` `DRLG_ApplyOutdoorVertexFlags113c` (internal `__fastcall`)
 * - `0x6FD644C0` `DRLG_LinkOutdoorLevels113c` (internal `__fastcall`)
 * - `0x6FD645A0` `DRLG_GetLevelBorderStyle113c` (internal `__fastcall`)
 * - `0x6FD64630` `DRLG_CheckAct1LinkOverlap113c` (internal `__fastcall`)
 * - `0x6FD646C0` `DRLG_CheckAct1WildLinkOverlap113c` (internal `__fastcall`)
 * - `0x6FD64750` `DRLG_CheckAct2LinkOverlap113c` (internal `__fastcall`)
 * - `0x6FD647E0` `DRLG_CheckAct4LinkOverlap113c` (internal `__fastcall`)
 * - `0x6FD64870` `DRLG_CheckMonasteryLinkOverlap113c` (internal `__fastcall`)
 * - `0x6FD6A270` `DATATBLS_GetDirectionOffset113c` (`#10740`)
 * - `0x6FD6A2B0` `DATATBLS_NormalizeDirection113c` (`#10266`)
 * - `0x6FD6A3C0` `DATATBLS_UnusedStub10182_113c` (`#10182`)
 * - `0x6FD6A520` `MONSTERS_IsDead113c` (`#10648`)
 * - `0x6FD6A550` `MONSTERS_CheckMonStatsFlagBit6_113c` (`#10064`)
 * - `0x6FD6A5B0` `MONSTERS_IsDemonOrUndead113c` (`#10239`)
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import { imul32, sdiv32 } from '../common/int-math.ts'
import {
  D2DrlgCoordStrc,
  D2DrlgCoordStrc_SIZE,
  D2DrlgLevelLinkDataStrc,
  D2DrlgLevelStrc,
  D2DrlgOutdoorInfoStrc,
  D2DrlgPresetRoomStrc,
  D2LevelsTxt,
  D2LevelsTxt_SIZE,
  D2MonLvlTxt_SIZE,
  D2MonStatsTxt,
  D2MonStatsTxt_SIZE,
  D2RoomExStrc,
  D2ShrinesTxt_SIZE,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import {
  DATATABLES_LEVELS_COUNT_OFF_113C,
  DATATABLES_LEVELS_TXT_OFF_113C,
  SGPT_DATATABLES_VA_113C,
} from './lvl-tbls-113c.ts'

/** `.rdata` outdoor vertex flag rule table `[15][6]` (360 bytes) at `0x6FDE5350..0x6FDE54B8` (`0x6FD63FE4 mov eax, 0x6fde5350`). */
export const OUTDOOR_VERTEX_RULES_VA_113C = 0x6fde5350
export const OUTDOOR_VERTEX_RULES_END_VA_113C = 0x6fde54b8
export const OUTDOOR_VERTEX_RULE_STRIDE_113C = 0x18

/** `.rdata` level-link table base VAs for `0x6FD64630..0x6FD64870` (`cmp edx, [edi + <TABLE_VA>]`). */
export const LINK_TABLE_ACT1_VA_113C = 0x6fddd190
export const LINK_TABLE_ACT1_WILD_VA_113C = 0x6fddd0a0
export const LINK_TABLE_ACT2_VA_113C = 0x6fddcfb0
export const LINK_TABLE_ACT4_VA_113C = 0x6fddcec0
export const LINK_TABLE_MONASTERY_VA_113C = 0x6fddcdd0

/** `.rdata` direction Y/X signed byte offset tables at `0x6FDE4EC4` / `0x6FDE4EE4` (`0x6FD6A275`, `0x6FD6A282`). */
export const DIR_OFFSET_Y_VA_113C = 0x6fde4ec4
export const DIR_OFFSET_X_VA_113C = 0x6fde4ee4

/** `.data` direction ring lookup table `u8[256]` at `0x6FDEF0B0` (`0x6FD6A2B5 mov al, [eax + 0x6fdef0b0]`). */
export const DIR_RING_LUT_VA_113C = 0x6fdef0b0

/** `.data` pointer to `gdwBitMasks` table at `0x6FDD90B0` (`0x6FD6A590`, `0x6FD6A5EA mov ecx, [0x6fdd90b0]`). */
export const GDW_BITMASKS_PTR_VA_113C = 0x6fdd90b0

/** `sgptDataTables->pMonStatsTxt` (`+0xA78`) and `nMonStatsTxtRecordCount` (`+0xA80`) read via `0x6FDE9E1C` at `0x6FD6A572..0x6FD6A57A`. */
export const DATATABLES_MONSTATS_TXT_OFF_113C = 0xa78
export const DATATABLES_MONSTATS_COUNT_OFF_113C = 0xa80

/** `.bss` `B024` data-tables globals (`0x6FD8E900..0x6FDB08D0`). */
const G_OBJGROUP_COUNT_VA_113C = 0x6fdf0b90
const G_SHRINES_TXT_VA_113C = 0x6fdf0b9c
const G_SHRINES_COUNT_VA_113C = 0x6fdf0ba0
const G_SUPERUNIQUES_COUNT_VA_113C = 0x6fdf09b4
const G_CHEST_TC_TABLE_VA_113C = 0x6fdf089c
const G_COMPCODE_PTR_VA_113C = 0x6fdeff54
const G_COMPCODE_COUNT_VA_113C = 0x6fdeff5c
const G_EXPERIENCE_BIN_VA_113C = 0x6fdf0b50
const G_MONLVL_TXT_VA_113C = 0x6fdf0b54
const G_MONLVL_COUNT_VA_113C = 0x6fdf0b58

const UNIT_MONSTER = 1
const MONMODE_DEATH = 0
const MONMODE_DEAD = 12
const LCG_MUL_113C = 0x6ac690c5n

/**
 * `@va D2Common:0x6FD5E430` (internal LTCG helper, custom ABI `eax=pLevel, esi=nOldPrestId`,
 * stack `[esp+4]=nNewPrestId, [esp+8]=nNewOrient, [esp+0xC]=bClearBit1`, `ret 0xC` -> `eax`).
 *
 * Walks `pLevel->pFirstRoomEx` (`+0x10`) via `pRoomNext` (`+0x24`), inspects `pDungeonData = pRoomEx->pTypeData` (`+0x20`),
 * and finds the first room whose `(dwFlags & 2) === 0` (`shr edx, 1; not edx; test dl, 1`) and `nLevelPrest === nOldPrestId`.
 * Replaces `nLevelPrest`, `nOrientation`, and either clears bit 1 (`bClearBit1 !== 0`) or sets bit 1 (`bClearBit1 === 0`) of `dwFlags`.
 */
export function DRLG_ReplacePresetRoom113c(
  m: Memory113c,
  pLevel: number,
  nOldPrestId: number,
  nNewPrestId: number,
  nNewOrient: number,
  bClearBit1: number,
): number {
  let pRoomEx = m.get(pLevel >>> 0, D2DrlgLevelStrc.pFirstRoomEx)
  const targetPrest = nOldPrestId >>> 0
  while (pRoomEx !== 0) {
    const pDungeonData = m.get(pRoomEx, D2RoomExStrc.pTypeData)
    const dwFlags = m.get(pDungeonData, D2DrlgPresetRoomStrc.dwFlags)
    if (
      (dwFlags & 0x2) === 0 &&
      m.get(pDungeonData, D2DrlgPresetRoomStrc.nLevelPrest) === targetPrest
    ) {
      m.set(pDungeonData, D2DrlgPresetRoomStrc.nLevelPrest, nNewPrestId >>> 0)
      m.set(pDungeonData, D2DrlgPresetRoomStrc.nOrientation, nNewOrient >>> 0)
      if ((bClearBit1 | 0) !== 0) {
        m.set(pDungeonData, D2DrlgPresetRoomStrc.dwFlags, (dwFlags & ~0x2) >>> 0)
      } else {
        m.set(pDungeonData, D2DrlgPresetRoomStrc.dwFlags, (dwFlags | 0x2) >>> 0)
      }
      return pRoomEx
    }
    pRoomEx = m.get(pRoomEx, D2RoomExStrc.pRoomNext)
  }
  return 0
}

/**
 * `@va D2Common:0x6FD5E700` (internal LTCG helper, `__fastcall(ecx=pLevel) -> void`, `ret`).
 *
 * Maps `pLevel->nLevelType` (`+0x1C0`) to a base `LvlPrest` ID (`0x6FD5EB5C` / `0x6FD5EB30`), skips `nLevelId == 8`,
 * shuffles `0..14` via 15 swaps (`3 * 5` unrolled LCG pairs on `pLevel->sSeed` at `+0x1C4..+0x1C8`), and replaces up to
 * `max(2, (nRooms / 5) + 1)` preset rooms over `nRooms * 2` attempts with `targetPrest + 15` and `nOrientation = -1`.
 */
export function DRLG_RandomizePresetRooms113c(m: Memory113c, pLevel: number): void {
  const lvl = pLevel >>> 0
  let basePrest: number
  switch (m.get(lvl, D2DrlgLevelStrc.nLevelType)) {
    case 3:
      basePrest = 0x34
      break
    case 4:
      basePrest = 0x6c
      break
    case 7:
      basePrest = 0xa7
      break
    case 8:
      basePrest = 0xcd
      break
    case 10:
      basePrest = 0x101
      break
    case 13:
      basePrest = 0x12d
      break
    case 17:
      basePrest = 0x19d
      break
    case 22:
      basePrest = 0x2f1
      break
    case 24:
      basePrest = 0x298
      break
    case 25:
      basePrest = 0x2c0
      break
    default:
      return
  }

  if (m.get(lvl, D2DrlgLevelStrc.nLevelId) === 8) return

  const rollSeedMod15 = (): number => {
    const l = BigInt(m.get(lvl, D2DrlgLevelStrc.sSeed, 0))
    const h = BigInt(m.get(lvl, D2DrlgLevelStrc.sSeed, 1))
    const prod = l * LCG_MUL_113C + h
    const newL = Number(prod & 0xffffffffn) >>> 0
    const newH = Number((prod >> 32n) & 0xffffffffn) >>> 0
    m.set(lvl, D2DrlgLevelStrc.sSeed, newL, 0)
    m.set(lvl, D2DrlgLevelStrc.sSeed, newH, 1)
    return newL % 15
  }

  let curIdx = rollSeedMod15()
  const arr = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  const nRooms = m.get(lvl, D2DrlgLevelStrc.nRooms) | 0
  let roomsLeft = (sdiv32(nRooms, 5) + 1) | 0
  if (roomsLeft <= 2) {
    roomsLeft = 2
  }
  let attemptsLeft = (nRooms * 2) >>> 0

  for (let iter = 0; iter < 3; iter++) {
    for (let k = 0; k < 5; k++) {
      const idx1 = rollSeedMod15()
      const idx2 = rollSeedMod15()
      const tmp = arr[idx2]!
      arr[idx2] = arr[idx1]!
      arr[idx1] = tmp
    }
  }

  while (attemptsLeft !== 0 && roomsLeft !== 0) {
    const targetPrest = (basePrest + arr[curIdx]!) >>> 0
    const newPrest = (targetPrest + 15) >>> 0
    let pRoomEx = m.get(lvl, D2DrlgLevelStrc.pFirstRoomEx)
    while (pRoomEx !== 0) {
      const pDungeonData = m.get(pRoomEx, D2RoomExStrc.pTypeData)
      const dwFlags = m.get(pDungeonData, D2DrlgPresetRoomStrc.dwFlags)
      if (
        (dwFlags & 0x2) === 0 &&
        m.get(pDungeonData, D2DrlgPresetRoomStrc.nLevelPrest) === targetPrest
      ) {
        m.set(pDungeonData, D2DrlgPresetRoomStrc.nLevelPrest, newPrest)
        m.set(pDungeonData, D2DrlgPresetRoomStrc.nOrientation, 0xffffffff)
        m.set(pDungeonData, D2DrlgPresetRoomStrc.dwFlags, (dwFlags | 0x2) >>> 0)
        roomsLeft = (roomsLeft - 1) | 0
        break
      }
      pRoomEx = m.get(pRoomEx, D2RoomExStrc.pRoomNext)
    }
    attemptsLeft = (attemptsLeft - 1) >>> 0
    curIdx = (((curIdx + 1) | 0) % 15) | 0
  }
}

/**
 * `@va D2Common:0x6FD63FD0` (internal LTCG helper, `__fastcall(ecx=pLevel, edx=nIndex, [esp+4]=pDirArray) -> void`, `ret 4`).
 *
 * When `pLevel->nDrlgType === 3`, iterates the 15 outdoor vertex rules at `.rdata` `0x6FDE5350..0x6FDE54B8`
 * (`3` loop iterations * `5` unrolled 24-byte records) and ORs matching flag masks into `pLevel->pOutdoors->dwFlags`.
 */
export function DRLG_ApplyOutdoorVertexFlags113c(
  m: Memory113c,
  pLevel: number,
  nIndex: number,
  pDirArray: number,
): void {
  const lvl = pLevel >>> 0
  if (m.get(lvl, D2DrlgLevelStrc.nDrlgType) !== 3) return
  const pOutdoors = m.get(lvl, D2DrlgLevelStrc.pOutdoors)
  const idxOff = ((pDirArray >>> 0) + (((nIndex | 0) << 2) >>> 0)) >>> 0

  for (
    let ruleAddr = OUTDOOR_VERTEX_RULES_VA_113C;
    ruleAddr < OUTDOOR_VERTEX_RULES_END_VA_113C;
    ruleAddr += OUTDOOR_VERTEX_RULE_STRIDE_113C
  ) {
    const reqLvl = m.u32(ruleAddr) | 0
    const levelId = m.get(lvl, D2DrlgLevelStrc.nLevelId) | 0
    if (levelId !== reqLvl && reqLvl !== 0) continue
    if (levelId === (m.u32((ruleAddr + 0x04) >>> 0) | 0)) continue
    if (levelId === (m.u32((ruleAddr + 0x08) >>> 0) | 0)) continue
    if ((m.u32(idxOff) | 0) !== (m.u32((ruleAddr + 0x0c) >>> 0) | 0)) continue
    if ((m.u32((idxOff + 0x04) >>> 0) | 0) !== (m.u32((ruleAddr + 0x10) >>> 0) | 0)) continue
    const mask = m.u32((ruleAddr + 0x14) >>> 0)
    m.set(
      pOutdoors,
      D2DrlgOutdoorInfoStrc.dwFlags,
      (m.get(pOutdoors, D2DrlgOutdoorInfoStrc.dwFlags) | mask) >>> 0,
    )
  }
}

/**
 * `@va D2Common:0x6FD644C0` (internal LTCG helper, `__fastcall(ecx=pLinkData) -> eax`, `ret`).
 *
 * Resets `pLinkData->nRand[1][nIteration] = 0`, copies `pLinkData->nRand[1][nIteration]` to `pLinkData->nRand[0][nIteration]`,
 * and places `pLevelCoord[nIteration]` relative to `pLevelCoord[pLink[nIteration].nLevelLink]` according to `nRand[0][nIteration]` (`0..3`).
 * Preserves the exact 3 memory reloads of `pLinkData->nIteration` (`+0x1EC`) at `0x6FD644C0`, `0x6FD644D1`, and `0x6FD644EC`.
 */
export function DRLG_LinkOutdoorLevels113c(m: Memory113c, pLinkData: number): number {
  const base = pLinkData >>> 0
  const nIter0 = m.get(base, D2DrlgLevelLinkDataStrc.nIteration)
  m.setU32((base + D2DrlgLevelLinkDataStrc.nRand1.off + ((nIter0 << 2) >>> 0)) >>> 0, 0)

  const nIter1 = m.get(base, D2DrlgLevelLinkDataStrc.nIteration)
  const rand1Val = m.u32((base + D2DrlgLevelLinkDataStrc.nRand1.off + ((nIter1 << 2) >>> 0)) >>> 0)
  m.setU32((base + D2DrlgLevelLinkDataStrc.nRand0.off + ((nIter1 << 2) >>> 0)) >>> 0, rand1Val)

  const pLink = m.get(base, D2DrlgLevelLinkDataStrc.pLink)
  const nIter2 = m.get(base, D2DrlgLevelLinkDataStrc.nIteration)
  const dirMode = m.u32((base + D2DrlgLevelLinkDataStrc.nRand0.off + ((nIter2 << 2) >>> 0)) >>> 0)
  const iterScaled = (nIter2 << 4) >>> 0
  const nLevelLink = m.u32((pLink + iterScaled + 0x08) >>> 0)
  const pSrcBox = (base + ((nLevelLink << 4) >>> 0) + D2DrlgLevelLinkDataStrc.nPosX.off) >>> 0
  const pDstBox = (base + iterScaled + D2DrlgLevelLinkDataStrc.nPosX.off) >>> 0

  switch (dirMode) {
    case 0: {
      m.set(pDstBox, D2DrlgCoordStrc.nPosX, m.get(pSrcBox, D2DrlgCoordStrc.nPosX))
      const y =
        (m.get(pSrcBox, D2DrlgCoordStrc.nPosY) + m.get(pSrcBox, D2DrlgCoordStrc.nHeight)) >>> 0
      m.set(pDstBox, D2DrlgCoordStrc.nPosY, y)
      break
    }
    case 1: {
      const x =
        (m.get(pSrcBox, D2DrlgCoordStrc.nPosX) - m.get(pDstBox, D2DrlgCoordStrc.nWidth)) >>> 0
      m.set(pDstBox, D2DrlgCoordStrc.nPosX, x)
      m.set(pDstBox, D2DrlgCoordStrc.nPosY, m.get(pSrcBox, D2DrlgCoordStrc.nPosY))
      break
    }
    case 2: {
      const x =
        (m.get(pSrcBox, D2DrlgCoordStrc.nWidth) -
          m.get(pDstBox, D2DrlgCoordStrc.nWidth) +
          m.get(pSrcBox, D2DrlgCoordStrc.nPosX)) >>>
        0
      m.set(pDstBox, D2DrlgCoordStrc.nPosX, x)
      const y =
        (m.get(pSrcBox, D2DrlgCoordStrc.nPosY) - m.get(pDstBox, D2DrlgCoordStrc.nHeight)) >>> 0
      m.set(pDstBox, D2DrlgCoordStrc.nPosY, y)
      break
    }
    case 3: {
      const x =
        (m.get(pSrcBox, D2DrlgCoordStrc.nPosX) + m.get(pSrcBox, D2DrlgCoordStrc.nWidth)) >>> 0
      m.set(pDstBox, D2DrlgCoordStrc.nPosX, x)
      const y =
        (m.get(pSrcBox, D2DrlgCoordStrc.nHeight) -
          m.get(pDstBox, D2DrlgCoordStrc.nHeight) +
          m.get(pSrcBox, D2DrlgCoordStrc.nPosY)) >>>
        0
      m.set(pDstBox, D2DrlgCoordStrc.nPosY, y)
      break
    }
  }
  return 1
}

/**
 * `@va D2Common:0x6FD645A0` (internal LTCG helper, `__fastcall(ecx=pLevel, [esp+4]=bFlag) -> eax`, `ret 4`).
 *
 * Maps `pLevel->nLevelType` (`+0x1C0`) and `bFlag` (`[esp+4]` low byte) to outdoor border preset index (`-1..5`).
 */
export function DRLG_GetLevelBorderStyle113c(m: Memory113c, pLevel: number, bFlag: number): number {
  const lvl = pLevel >>> 0
  switch (m.get(lvl, D2DrlgLevelStrc.nLevelType)) {
    case 2:
      return (bFlag & 0xff) === 0 ? 1 : 0
    case 16:
      return 2
    case 27:
      return 3
    case 31:
      return m.get(lvl, D2DrlgLevelStrc.nLevelId) === 0x75 ? 5 : 4
    default:
      return -1
  }
}

function checkLinkBoxesNoOverlap113c(
  m: Memory113c,
  pLinkData: number,
  nIteration: number,
  tableBaseVa: number,
): number {
  const nIter = nIteration | 0
  if (nIter <= 0) return 1
  const base = pLinkData >>> 0
  const iterScaled = (nIter << 4) >>> 0
  const pCurBox = (base + iterScaled + D2DrlgLevelLinkDataStrc.nPosX.off) >>> 0

  for (let i = 0; i < nIter; i++) {
    const linkedIdx = m.u32((tableBaseVa + iterScaled) >>> 0) | 0
    if (i === linkedIdx) continue
    const pOtherBox =
      (base + Math.imul(i, D2DrlgCoordStrc_SIZE) + D2DrlgLevelLinkDataStrc.nPosX.off) >>> 0
    const xCur = m.get(pCurBox, D2DrlgCoordStrc.nPosX) | 0
    const xOther = m.get(pOtherBox, D2DrlgCoordStrc.nPosX) | 0
    const gapX =
      xCur < xOther
        ? ((xOther - (m.get(pCurBox, D2DrlgCoordStrc.nWidth) | 0)) - xCur) | 0
        : ((xCur - (m.get(pOtherBox, D2DrlgCoordStrc.nWidth) | 0)) - xOther) | 0

    const yCur = m.get(pCurBox, D2DrlgCoordStrc.nPosY) | 0
    const yOther = m.get(pOtherBox, D2DrlgCoordStrc.nPosY) | 0
    const gapY =
      yCur < yOther
        ? ((yOther - (m.get(pCurBox, D2DrlgCoordStrc.nHeight) | 0)) - yCur) | 0
        : ((yCur - (m.get(pOtherBox, D2DrlgCoordStrc.nHeight) | 0)) - yOther) | 0

    if (gapX < 0 && gapY < 0) return 0
  }
  return 1
}

/**
 * `@va D2Common:0x6FD64630` (internal LTCG helper, `__fastcall(ecx=pLinkData, edx=nIteration) -> eax`, `ret`).
 * Checks AABB overlap of `pLevelCoord[nIteration]` against prior boxes `0..nIteration-1` using `.rdata` table `0x6FDDD190`.
 */
export function DRLG_CheckAct1LinkOverlap113c(
  m: Memory113c,
  pLinkData: number,
  nIteration: number,
): number {
  return checkLinkBoxesNoOverlap113c(m, pLinkData, nIteration, LINK_TABLE_ACT1_VA_113C)
}

/**
 * `@va D2Common:0x6FD646C0` (internal LTCG helper, `__fastcall(ecx=pLinkData, edx=nIteration) -> eax`, `ret`).
 * Checks AABB overlap of `pLevelCoord[nIteration]` against prior boxes `0..nIteration-1` using `.rdata` table `0x6FDDD0A0`.
 */
export function DRLG_CheckAct1WildLinkOverlap113c(
  m: Memory113c,
  pLinkData: number,
  nIteration: number,
): number {
  return checkLinkBoxesNoOverlap113c(m, pLinkData, nIteration, LINK_TABLE_ACT1_WILD_VA_113C)
}

/**
 * `@va D2Common:0x6FD64750` (internal LTCG helper, `__fastcall(ecx=pLinkData, edx=nIteration) -> eax`, `ret`).
 * Checks AABB overlap of `pLevelCoord[nIteration]` against prior boxes `0..nIteration-1` using `.rdata` table `0x6FDDCFB0`.
 */
export function DRLG_CheckAct2LinkOverlap113c(
  m: Memory113c,
  pLinkData: number,
  nIteration: number,
): number {
  return checkLinkBoxesNoOverlap113c(m, pLinkData, nIteration, LINK_TABLE_ACT2_VA_113C)
}

/**
 * `@va D2Common:0x6FD647E0` (internal LTCG helper, `__fastcall(ecx=pLinkData, edx=nIteration) -> eax`, `ret`).
 * Checks AABB overlap of `pLevelCoord[nIteration]` against prior boxes `0..nIteration-1` using `.rdata` table `0x6FDDCEC0`.
 */
export function DRLG_CheckAct4LinkOverlap113c(
  m: Memory113c,
  pLinkData: number,
  nIteration: number,
): number {
  return checkLinkBoxesNoOverlap113c(m, pLinkData, nIteration, LINK_TABLE_ACT4_VA_113C)
}

/**
 * `@va D2Common:0x6FD64870` (internal LTCG helper, `__fastcall(ecx=pLinkData, edx=nIteration) -> eax`, `ret`).
 * Checks AABB overlap of `pLevelCoord[nIteration]` against prior boxes `0..nIteration-1` using `.rdata` table `0x6FDDCDD0`.
 */
export function DRLG_CheckMonasteryLinkOverlap113c(
  m: Memory113c,
  pLinkData: number,
  nIteration: number,
): number {
  return checkLinkBoxesNoOverlap113c(m, pLinkData, nIteration, LINK_TABLE_MONASTERY_VA_113C)
}

/**
 * `@va D2Common:0x6FD6A270` (`D2Common.#10740`, `__stdcall(nDir, pOutX, pOutY) -> void`, `ret 0xC`).
 * Sign-extends `.rdata` byte offsets at `0x6FDE4EE4[nDir & 0xFF]` and `0x6FDE4EC4[nDir & 0xFF]` into `*pOutX` and `*pOutY`.
 */
export function DATATBLS_GetDirectionOffset113c(
  m: Memory113c,
  nDir: number,
  pOutX: number,
  pOutY: number,
): void {
  const idx = nDir & 0xff
  const dx = (m.u8((DIR_OFFSET_X_VA_113C + idx) >>> 0) << 24) >> 24
  m.setU32(pOutX >>> 0, dx >>> 0)
  const dy = (m.u8((DIR_OFFSET_Y_VA_113C + idx) >>> 0) << 24) >> 24
  m.setU32(pOutY >>> 0, dy >>> 0)
}

/**
 * `@va D2Common:0x6FD6A2B0` (`D2Common.#10266`, `__stdcall(nDir) -> uint8_t`, `ret 4`).
 * Returns `m.u8(0x6FDEF0B0 + (nDir & 0xFF))`.
 */
export function DATATBLS_NormalizeDirection113c(m: Memory113c, nDir: number): number {
  const idx = nDir & 0xff
  return m.u8((DIR_RING_LUT_VA_113C + idx) >>> 0)
}

/**
 * `@va D2Common:0x6FD6A3C0` (`D2Common.#10182`, `__stdcall(a0, a1) -> void`, `ret 8`).
 * 3-byte empty stub (`c2 08 00`).
 */
export function DATATBLS_UnusedStub10182_113c(_m: Memory113c, _a0 = 0, _a1 = 0): void {}

/**
 * `@va D2Common:0x6FD6A520` (`D2Common.#10648`, `__stdcall(pUnit) -> BOOL`, `ret 4`).
 * Returns `1` iff `pUnit != 0 && pUnit->dwUnitType == 1` (`UNIT_MONSTER`) and `pUnit->dwAnimMode` (`+0x10`) is `0` (`MONMODE_DEATH`) or `12` (`MONMODE_DEAD`).
 */
export function MONSTERS_IsDead113c(m: Memory113c, pUnit: number): number {
  const u = pUnit >>> 0
  if (u === 0 || m.get(u, D2UnitStrc.dwUnitType) !== UNIT_MONSTER) return 0
  const mode = m.get(u, D2UnitStrc.dwAnimMode)
  if (mode === MONMODE_DEATH || mode === MONMODE_DEAD) return 1
  return 0
}

/**
 * `@va D2Common:0x6FD6A550` (`D2Common.#10064`, `__stdcall(pMonStatsTxt, pUnit) -> uint32_t`, `ret 8`).
 * Checks bit 6 (`gdwBitMasks[6]` at `*(0x6FDD90B0) + 0x18`, value `0x40`) of `pMonStatsTxt->nBitField1` (`+0x0C`),
 * resolving `pMonStatsTxt` from `sgptDataTables->pMonStatsTxt[pUnit->dwClassId]` when `pMonStatsTxt == 0`.
 */
export function MONSTERS_CheckMonStatsFlagBit6_113c(
  m: Memory113c,
  pMonStatsTxt: number,
  pUnit: number,
): number {
  const u = pUnit >>> 0
  if (u === 0 || m.get(u, D2UnitStrc.dwUnitType) !== UNIT_MONSTER) return 0
  let pRec = pMonStatsTxt >>> 0
  if (pRec === 0) {
    const classId = m.get(u, D2UnitStrc.dwClassId) | 0
    if (classId < 0) return 0
    const sgpt = m.u32(SGPT_DATATABLES_VA_113C)
    const count = m.u32((sgpt + DATATABLES_MONSTATS_COUNT_OFF_113C) >>> 0) | 0
    if (classId >= count) return 0
    const pBase = m.u32((sgpt + DATATABLES_MONSTATS_TXT_OFF_113C) >>> 0)
    pRec = (pBase + Math.imul(classId, D2MonStatsTxt_SIZE)) >>> 0
    if (pRec === 0) return 0
  }
  const flags0C = m.get(pRec, D2MonStatsTxt.nBitField1)
  const pBitMasks = m.u32(GDW_BITMASKS_PTR_VA_113C)
  return (flags0C & m.u32((pBitMasks + 0x18) >>> 0)) >>> 0
}

/**
 * `@va D2Common:0x6FD6A5B0` (`D2Common.#10239`, `__stdcall(pUnit) -> BOOL`, `ret 4`).
 * Looks up `sgptDataTables->pMonStatsTxt[pUnit->dwClassId]` and returns `1` if `nBitField2` (`+0x0D`) has
 * bit 3 (`gdwBitMasks[3]` at `*(0x6FDD90B0) + 0x0C`) or bit 4 (`gdwBitMasks[4]` at `*(0x6FDD90B0) + 0x10`) set, else `0`.
 */
export function MONSTERS_IsDemonOrUndead113c(m: Memory113c, pUnit: number): number {
  const u = pUnit >>> 0
  if (u === 0 || m.get(u, D2UnitStrc.dwUnitType) !== UNIT_MONSTER) return 0
  const classId = m.get(u, D2UnitStrc.dwClassId) | 0
  if (classId < 0) return 0
  const sgpt = m.u32(SGPT_DATATABLES_VA_113C)
  const count = m.u32((sgpt + DATATABLES_MONSTATS_COUNT_OFF_113C) >>> 0) | 0
  if (classId >= count) return 0
  const pBase = m.u32((sgpt + DATATABLES_MONSTATS_TXT_OFF_113C) >>> 0)
  const pRec = (pBase + Math.imul(classId, D2MonStatsTxt_SIZE)) >>> 0
  if (pRec === 0) return 0
  const flags0D = m.get(pRec, D2MonStatsTxt.nBitField2)
  const pBitMasks = m.u32(GDW_BITMASKS_PTR_VA_113C)
  if ((flags0D & m.u32((pBitMasks + 0x0c) >>> 0)) !== 0) return 1
  if ((flags0D & m.u32((pBitMasks + 0x10) >>> 0)) !== 0) return 1
  return 0
}

/**
 * `@va D2Common:0x6FD8E900` (`D2Common.#10620` `DATATBLS_GetObjGroupTxtRecordCount`,
 * 0-arg `ret` -> `m.u32(0x6FDF0B90)`).
 */
export function DATATBLS_GetObjGroupTxtRecordCount113c(m: Memory113c): number {
  return m.u32(G_OBJGROUP_COUNT_VA_113C)
}

/**
 * `@va D2Common:0x6FD8E960` (`D2Common.#10834` `DATATBLS_GetShrinesTxtRecord`,
 * stdcall `[esp+4] = nIndex`, `ret 4` -> `D2ShrinesTxt*` or `0` if `count <= nIndex`).
 * Note: binary has no `nIndex < 0` check (`0x6FD8E960 cmp ecx, eax; jle`).
 */
export function DATATBLS_GetShrinesTxtRecord113c(m: Memory113c, nIndex: number): number {
  const idx = nIndex | 0
  const count = m.u32(G_SHRINES_COUNT_VA_113C) | 0
  if (count <= idx) return 0
  return (m.u32(G_SHRINES_TXT_VA_113C) + imul32(idx, D2ShrinesTxt_SIZE)) >>> 0
}

/**
 * `@va D2Common:0x6FDA3AA0` (internal LTCG helper `DATATBLS_AdjustMonsterPresetIndex`,
 * stdcall `[esp+4] = nType`, `[esp+8] = nIndex`, `ret 8` -> adjusted preset index).
 */
export function DATATBLS_AdjustMonsterPresetIndex113c(
  m: Memory113c,
  nType: number,
  nIndex: number,
): number {
  const type = nType | 0
  const idx = nIndex >>> 0
  if (type === 0) {
    const superUniquesCount = m.u32(G_SUPERUNIQUES_COUNT_VA_113C)
    const sgpt = m.u32(SGPT_DATATABLES_VA_113C)
    return (superUniquesCount + idx + m.u32((sgpt + DATATABLES_MONSTATS_COUNT_OFF_113C) >>> 0)) >>> 0
  }
  if (type === 2) {
    const sgpt = m.u32(SGPT_DATATABLES_VA_113C)
    return (idx + m.u32((sgpt + DATATABLES_MONSTATS_COUNT_OFF_113C) >>> 0)) >>> 0
  }
  return idx
}

/**
 * `@va D2Common:0x6FDA43C0` (`D2Common.#10275` `DATATBLS_GetChestTreasureClass`,
 * stdcall `[esp+4] = nDifficulty`, `[esp+8] = nAct`, `[esp+0xC] = nTier`, `ret 0xC` -> `m.u32(0x6FDF089C + idx * 4)`).
 */
export function DATATBLS_GetChestTreasureClass113c(
  m: Memory113c,
  nDifficulty: number,
  nAct: number,
  nTier: number,
): number {
  let diff = nDifficulty | 0
  if (diff < 0) diff = 0
  else if (diff >= 3) diff = 2

  let act = nAct | 0
  if (act < 0) act = 0
  else if (act >= 5) act = 4

  let tier = nTier | 0
  if (tier < 0) tier = 0
  else if (tier >= 3) tier = 2

  const idx = (tier + (act + diff * 5) * 3) >>> 0
  return m.u32((G_CHEST_TC_TABLE_VA_113C + idx * 4) >>> 0)
}

/**
 * `@va D2Common:0x6FDAE1C0` (`D2Common.#10447` `DATATBLS_GetCompCodeString`,
 * stdcall `[esp+4] = nIndex`, `ret 4` -> `m.u32(m.u32(0x6FDEFF54) + nIndex * 4)` or `0`).
 * Note: binary has no `nIndex < 0` check (`0x6FDAE1C4 cmp eax, ds:0x6FDEFF5C; jge`).
 */
export function DATATBLS_GetCompCodeString113c(m: Memory113c, nIndex: number): number {
  const idx = nIndex | 0
  if (idx >= (m.u32(G_COMPCODE_COUNT_VA_113C) | 0)) return 0
  const pBase = m.u32(G_COMPCODE_PTR_VA_113C)
  return m.u32((pBase + imul32(idx, 4)) >>> 0)
}

/**
 * `@va D2Common:0x6FDAE7E0` (`D2Common.#10591` `DATATBLS_GetMaxLevel`,
 * stdcall `[esp+4] = nClass`, `ret 4` -> `m.u32(m.u32(0x6FDF0B50) + cls * 4)`).
 */
export function DATATBLS_GetMaxLevel113c(m: Memory113c, nClass: number): number {
  let cls = nClass | 0
  if (cls < 0 || cls >= 7) cls = 0
  const pExp = m.u32(G_EXPERIENCE_BIN_VA_113C)
  return m.u32((pExp + cls * 4) >>> 0)
}

/**
 * `@va D2Common:0x6FDAE810` (`D2Common.#11092` `DATATBLS_GetStartExpForLevel`,
 * stdcall `[esp+4] = nClass`, `[esp+8] = nLevel`, `ret 8` -> `m.u32(m.u32(0x6FDF0B50) + (cls + nLevel * 8 + 8) * 4)`).
 */
export function DATATBLS_GetStartExpForLevel113c(
  m: Memory113c,
  nClass: number,
  nLevel: number,
): number {
  let cls = nClass | 0
  if (cls < 0 || cls >= 7) cls = 0
  const pExp = m.u32(G_EXPERIENCE_BIN_VA_113C)
  const edx = (cls + imul32(nLevel | 0, 8) + 8) | 0
  return m.u32((pExp + imul32(edx, 4)) >>> 0)
}

/**
 * `@va D2Common:0x6FDAE840` (`D2Common.#10989` `DATATBLS_GetExpRatio`,
 * stdcall `[esp+4] = nLevel`, `ret 4` -> `ExpRatio` from `sgpExperienceBin`).
 */
export function DATATBLS_GetExpRatio113c(m: Memory113c, nLevel: number): number {
  const pExp = m.u32(G_EXPERIENCE_BIN_VA_113C)
  if (pExp === 0) return 0
  const lvl = nLevel | 0
  if (lvl <= 0) return m.u32((pExp + 0x1c) >>> 0)
  if (lvl > (m.u32(pExp) | 0)) return 0
  return m.u32((pExp + ((lvl << 5) >>> 0) + 0x3c) >>> 0)
}

/**
 * `@va D2Common:0x6FDB03C0` (`D2Common.#10237` `DATATBLS_GetMonLvlTxtRecord`,
 * stdcall `[esp+4] = nLevel`, `ret 4` -> `D2MonLvlTxt*`).
 */
export function DATATBLS_GetMonLvlTxtRecord113c(m: Memory113c, nLevel: number): number {
  const count = m.u32(G_MONLVL_COUNT_VA_113C) | 0
  let lvl = nLevel | 0
  if (lvl < 0) lvl = 0
  else if (lvl >= count) lvl = (count - 1) | 0
  return (m.u32(G_MONLVL_TXT_VA_113C) + imul32(lvl, D2MonLvlTxt_SIZE)) >>> 0
}

/**
 * `@va D2Common:0x6FDB08D0` (`D2Common.#10670` `DATATBLS_GetCurrentLevelFromExp`,
 * stdcall `[esp+4] = nClass`, `[esp+8] = dwExp`, `ret 8` -> level `0..maxLvl`).
 */
export function DATATBLS_GetCurrentLevelFromExp113c(
  m: Memory113c,
  nClass: number,
  dwExp: number,
): number {
  let cls = nClass | 0
  if (cls < 0 || cls >= 7) cls = 0
  const pExp = m.u32(G_EXPERIENCE_BIN_VA_113C)
  const pClassCol = (pExp + cls * 4) >>> 0
  const maxLvl = m.u32(pClassCol) | 0
  let ecx = (pClassCol + 0x20) >>> 0
  let edi = m.u32(ecx)
  let eax = 0
  const exp = dwExp >>> 0
  if (exp < edi) return 0
  while (eax < maxLvl) {
    edi = m.u32((ecx + 0x20) >>> 0)
    ecx = (ecx + 0x20) >>> 0
    eax = (eax + 1) | 0
    if (exp < edi) break
  }
  return eax >>> 0
}

/**
 * `@va D2Common:0x6FDBE0C0` (`D2Common.#10068` `DATATBLS_GetLevelMonsterLevel`,
 * stdcall `[esp+4] = nLevelId`, `[esp+8] = nDifficulty`, `[esp+0xC] = bExpansion`, `ret 0xC` -> sign-extended monster level or `1`).
 */
export function DATATBLS_GetLevelMonsterLevel113c(
  m: Memory113c,
  nLevelId: number,
  nDifficulty: number,
  bExpansion: number,
): number {
  const diff = nDifficulty & 0xff
  if (diff >= 3) return 1
  const id = nLevelId | 0
  if (id <= 0) return 1
  const sgpt = m.u32(SGPT_DATATABLES_VA_113C)
  const count = m.u32((sgpt + DATATABLES_LEVELS_COUNT_OFF_113C) >>> 0) | 0
  if (id >= count) return 1
  const pBase = m.u32((sgpt + DATATABLES_LEVELS_TXT_OFF_113C) >>> 0)
  const pRec = (pBase + imul32(id, D2LevelsTxt_SIZE)) >>> 0
  if (pRec === 0) return 1
  if ((bExpansion | 0) !== 0) {
    return ((m.get(pRec, D2LevelsTxt.wMonLvEx1, diff) << 16) >> 16) >>> 0
  }
  return ((m.get(pRec, D2LevelsTxt.wMonLv1, diff) << 16) >> 16) >>> 0
}

/**
 * `@va D2Common:0x6FDC1480` (internal LTCG helper `DATATBLS_GetBooksTxtRecordCountPtr`,
 * 0-arg `ret` -> `0x6FDEFD98`).
 */
export function DATATBLS_GetBooksTxtRecordCountPtr113c(_m: Memory113c): number {
  return 0x6fdefd98
}

/**
 * `@va D2Common:0x6FDC1520` (internal LTCG helper `DATATBLS_GetQualityItemsTxtRecordCountPtr`,
 * 0-arg `ret` -> `0x6FDEFDA0`).
 */
export function DATATBLS_GetQualityItemsTxtRecordCountPtr113c(_m: Memory113c): number {
  return 0x6fdefda0
}

/**
 * `@va D2Common:0x6FDC1660` (internal LTCG helper `DATATBLS_GetBeltsTxtRecordCountPtr`,
 * 0-arg `ret` -> `0x6FDEFD90`).
 */
export function DATATBLS_GetBeltsTxtRecordCountPtr113c(_m: Memory113c): number {
  return 0x6fdefd90
}

/**
 * `@va D2Common:0x6FDCF550` (`D2Common.#10997` `UNITS_IsPointWithinRadius`,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = pPoint`, `[esp+0xC] = nRadius`, `ret 0xC` -> `1` if `dx*dx + dy*dy <= nRadius*nRadius`, else `0`).
 * Note: unconditionally dereferences `pUnit`, `pPoint`, and (for `dwUnitType` in `{2, 4, 5}`) `pPath + 0x0C` / `pPath + 0x10`.
 */
export function UNITS_IsPointWithinRadius113c(
  m: Memory113c,
  pUnit: number,
  pPoint: number,
  nRadius: number,
): number {
  const u = pUnit >>> 0
  const unitType = m.get(u, D2UnitStrc.dwUnitType)
  let ux: number
  let uy: number
  switch (unitType) {
    case 0:
    case 1:
    case 3: {
      const pPath = m.get(u, D2UnitStrc.pPath)
      ux = pPath !== 0 ? m.u16((pPath + 0x02) >>> 0) : 0
      uy = pPath !== 0 ? m.u16((pPath + 0x06) >>> 0) : 0
      break
    }
    case 2:
    case 4:
    case 5: {
      const pPath = m.get(u, D2UnitStrc.pPath)
      ux = m.u32((pPath + 0x0c) >>> 0)
      uy = m.u32((pPath + 0x10) >>> 0)
      break
    }
    default:
      ux = 0
      uy = 0
      break
  }
  const pt = pPoint >>> 0
  const dx = (m.u32(pt) - ux) | 0
  const dy = (m.u32((pt + 4) >>> 0) - uy) | 0
  const r = nRadius | 0
  return ((imul32(dx, dx) + imul32(dy, dy)) | 0) <= imul32(r, r) ? 1 : 0
}

