/**
 * Diablo II v1.13c `D2Common.dll` skills, item-type equivalence, and unit state-mask pure-leaf functions
 * (`0x6FD72820..0x6FD9E550`, image base `0x6FD50000`).
 *
 * Batch `B003` (14 functions):
 * - `0x6FD72820` `ITEMS_CheckItemTypeIdEquivalent113c` (`#11034`)
 * - `0x6FD87DB0` `STATES_CheckStateMaskOnUnitFast113c` (internal)
 * - `0x6FD9DC30` `SKILLS_CalcDiminishingReturns113c` (`#10115`)
 * - `0x6FD9DDB0` `SKILLS_Calc5BandLinear113c` (internal)
 * - `0x6FD9E180` `SKILLS_GetLeftSkillFromSkillList113c` (`#10136`)
 * - `0x6FD9E1A0` `SKILLS_SetSkillSlotIndex113c` (`#10368`)
 * - `0x6FD9E1C0` `SKILLS_GetSkillsTxtFromSkill113c` (`#10858`)
 * - `0x6FD9E1D0` `SKILLS_GetSkillIdFromSkill113c` (`#10601`)
 * - `0x6FD9E3B0` `SKILLS_GetNextSkill113c` (`#10784`)
 * - `0x6FD9E3D0` `SKILLS_GetFirstSkillFromSkillList113c` (`#10273`)
 * - `0x6FD9E460` `SKILLS_GetSkillSlotIndex113c` (`#10952`)
 * - `0x6FD9E480` `SKILLS_GetHighestLevelSkillFromUnitAndId113c` (internal)
 * - `0x6FD9E520` `SKILLS_GetClassSkillCount113c` (`#11120`)
 * - `0x6FD9E550` `SKILLS_GetClassSkillId113c` (`#10044`)
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import { sdiv32 } from './int-math.ts'
import {
  D2SkillListStrc,
  D2SkillsTxt,
  D2SkillStrc,
  D2StatListExStrc,
  D2UnitStrc,
} from '../mem/layout.generated.ts'

/** `.data` `D2DataTablesStrc* sgptDataTables` at `0x6FDE9E1C`. */
export const SGPT_DATATABLES_VA_113C = 0x6fde9e1c
/** `.rdata` IAT slot for `Fog.dll!gdwBitMasks` (`uint32[32]`) at `0x6FDD90B0`. */
export const GDW_BITMASKS_IAT_VA_113C = 0x6fdd90b0

/** `sgptDataTables` field offsets accessed by `B003` functions. */
export const DATATABLES_PLAYER_CLASS_SKILL_COUNT_OFF_113C = 0xba4
export const DATATABLES_MAX_CLASS_SKILLS_STRIDE_OFF_113C = 0xba8
export const DATATABLES_PLAYER_CLASS_SKILL_LIST_OFF_113C = 0xbac
export const DATATABLES_ITEMTYPES_COUNT_OFF_113C = 0xbfc
export const DATATABLES_ITEMTYPES_STRIDE_OFF_113C = 0xc00
export const DATATABLES_ITEMTYPES_EQUIV_MASK_OFF_113C = 0xc04

function i16(v: number): number {
  return (v << 16) >> 16
}

/**
 * `@va D2Common:0x6FD72820` (`D2Common.#11034`, `ITEMS_CheckItemTypeIdEquivalent`, `__stdcall(nItemType1, nItemType2) -> BOOL`).
 *
 * - Checks `0 <= (nItemType1 | 0) < sgptDataTables->nItemTypesTxtRecordCount (+0xBFC)` (`jl` / `jge`).
 * - Checks `0 <= (nItemType2 | 0) < sgptDataTables->nItemTypesTxtRecordCount (+0xBFC)` (`jl` / `jge`).
 * - Reads `stride = sgptDataTables->nItemTypesIndexStride (+0xC00)` and `pMask = sgptDataTables->pItemTypesEquivMask (+0xC04)`.
 * - Computes `idx = (Math.imul(stride, nItemType1) + (nItemType2 >> 5)) | 0`, reads `word = pMask[idx]`,
 *   and masks it with `gdwBitMasks[nItemType2 & 31]`.
 */
export function ITEMS_CheckItemTypeIdEquivalent113c(
  m: Memory113c,
  nItemType1: number,
  nItemType2: number,
): number {
  const t1 = nItemType1 | 0
  if (t1 < 0) return 0
  const pDataTables = m.u32(SGPT_DATATABLES_VA_113C)
  const nCount = m.u32((pDataTables + DATATABLES_ITEMTYPES_COUNT_OFF_113C) >>> 0) | 0
  if (t1 >= nCount) return 0
  const t2 = nItemType2 | 0
  if (t2 < 0 || t2 >= nCount) return 0

  const nStride = m.u32((pDataTables + DATATABLES_ITEMTYPES_STRIDE_OFF_113C) >>> 0) | 0
  const pMask = m.u32((pDataTables + DATATABLES_ITEMTYPES_EQUIV_MASK_OFF_113C) >>> 0)
  const wordIdx = (Math.imul(nStride, t1) + (t2 >> 5)) | 0
  const maskVal = m.u32((pMask + ((wordIdx << 2) >>> 0)) >>> 0)
  const pBitMasks = m.u32(GDW_BITMASKS_IAT_VA_113C)
  const bitMask = m.u32((pBitMasks + ((t2 & 0x1f) << 2)) >>> 0)
  return (maskVal & bitMask) >>> 0
}

/**
 * `@va D2Common:0x6FD87DB0` (internal, custom reg `eax=pUnit, ecx=nStateId -> uint32`).
 *
 * - If `pUnit === 0` or `pStatListEx = pUnit->pStatListEx (+0x5C) === 0`, returns `0`.
 * - If `(pStatListEx->dwFlags (+0x10) & 0x80000000) === 0` (`test edx, edx; js`), returns `0`.
 * - Reads `pStateFlags = pStatListEx->pStateFlags (+0x58)`, `word = pStateFlags[nStateId >> 5]`,
 *   and returns `(word & gdwBitMasks[nStateId & 31]) >>> 0`.
 */
export function STATES_CheckStateMaskOnUnitFast113c(
  m: Memory113c,
  pUnit: number,
  nStateId: number,
): number {
  if (pUnit === 0) return 0
  const pStatListEx = m.get(pUnit, D2UnitStrc.pStatListEx)
  if (pStatListEx === 0) return 0
  const dwFlags = m.get(pStatListEx, D2StatListExStrc.dwFlags)
  if ((dwFlags | 0) >= 0) return 0

  const st = nStateId | 0
  const pStateFlags = m.get(pStatListEx, D2StatListExStrc.pStateFlags)
  const word = m.u32((pStateFlags + (((st >> 5) << 2) >>> 0)) >>> 0)
  const pBitMasks = m.u32(GDW_BITMASKS_IAT_VA_113C)
  const bitMask = m.u32((pBitMasks + ((st & 0x1f) << 2)) >>> 0)
  return (word & bitMask) >>> 0
}

/**
 * `@va D2Common:0x6FD9DC30` (`D2Common.#10115`, `SKILLS_CalcDiminishingReturns`, `__stdcall(nLevel, nMin, nMax) -> int`).
 *
 * - Computes `factor = sdiv32(Math.imul(nLevel | 0, 110), (nLevel + 6) | 0)`.
 * - Computes `res = (sdiv32(Math.imul(factor, (nMax - nMin) | 0), 100) + nMin) | 0`.
 * - If `(res | 0) > (nMax | 0)` (`cmp eax, esi; jle`), clamps `res = nMax | 0`.
 */
export function SKILLS_CalcDiminishingReturns113c(
  _m: Memory113c,
  nLevel: number,
  nMin: number,
  nMax: number,
): number {
  const lvl = nLevel | 0
  const p1 = nMin | 0
  const p2 = nMax | 0
  const factor = sdiv32(Math.imul(lvl, 110), (lvl + 6) | 0)
  const scaled = Math.imul(factor, (p2 - p1) | 0)
  let res = (sdiv32(scaled, 100) + p1) | 0
  if (res > p2) {
    res = p2
  }
  return res >>> 0
}

/**
 * `@va D2Common:0x6FD9DDB0` (internal, custom reg `eax=nLevel, ecx=pCoeffs -> int`).
 *
 * Evaluates a 5-band piecewise-linear progression from `pCoeffs` (`int32[5]` at `+0x00..+0x10`):
 * - `nLevel <= 1 || pCoeffs == 0`: `0`
 * - `1 < nLevel <= 8`: `(nLevel - 1) * c0`
 * - `8 < nLevel <= 16`: `7 * c0 + (nLevel - 8) * c1`
 * - `16 < nLevel <= 22`: `7 * c0 + 8 * c1 + (nLevel - 16) * c2`
 * - `22 < nLevel <= 28`: `7 * c0 + 8 * c1 + 6 * c2 + (nLevel - 22) * c3`
 * - `nLevel > 28`: `7 * c0 + 8 * c1 + 6 * (c2 + c3) + (nLevel - 28) * c4`
 */
export function SKILLS_Calc5BandLinear113c(
  m: Memory113c,
  nLevel: number,
  pCoeffs: number,
): number {
  const lvl = nLevel | 0
  if (lvl <= 1 || pCoeffs === 0) return 0
  const c0 = m.u32(pCoeffs) | 0
  if (lvl <= 8) {
    return Math.imul((lvl - 1) | 0, c0) >>> 0
  }
  const c1 = m.u32((pCoeffs + 4) >>> 0) | 0
  const t1 = Math.imul(7, c0)
  if (lvl <= 16) {
    return (t1 + Math.imul((lvl - 8) | 0, c1)) >>> 0
  }
  const c2 = m.u32((pCoeffs + 8) >>> 0) | 0
  const t2 = (t1 + (c1 << 3)) | 0
  if (lvl <= 22) {
    return (t2 + Math.imul((lvl - 16) | 0, c2)) >>> 0
  }
  const c3 = m.u32((pCoeffs + 12) >>> 0) | 0
  if (lvl <= 28) {
    const t3 = (t2 + Math.imul(6, c2)) | 0
    return (t3 + Math.imul((lvl - 22) | 0, c3)) >>> 0
  }
  const c4 = m.u32((pCoeffs + 16) >>> 0) | 0
  const t4 = (t2 + Math.imul(6, (c2 + c3) | 0)) | 0
  return (t4 + Math.imul((lvl - 28) | 0, c4)) >>> 0
}

/**
 * `@va D2Common:0x6FD9E180` (`D2Common.#10136`, `SKILLS_GetLeftSkillFromSkillList`, `__stdcall(pSkillList) -> D2SkillStrc*`).
 */
export function SKILLS_GetLeftSkillFromSkillList113c(m: Memory113c, pSkillList: number): number {
  if (pSkillList === 0) return 0
  return m.get(pSkillList, D2SkillListStrc.pLeftSkill)
}

/**
 * `@va D2Common:0x6FD9E1A0` (`D2Common.#10368`, `SKILLS_SetSkillSlotIndex`, `__stdcall(pSkill, nSlotIndex) -> void`).
 *
 * Writes `pSkill->nSlotIndex (+0x08) = nSlotIndex` iff `pSkill !== 0` and `0 <= (nSlotIndex | 0) <= 32` (`0x20`).
 */
export function SKILLS_SetSkillSlotIndex113c(
  m: Memory113c,
  pSkill: number,
  nSlotIndex: number,
): void {
  if (pSkill === 0) return
  const slot = nSlotIndex | 0
  if (slot < 0 || slot > 0x20) return
  m.set(pSkill, D2SkillStrc.nSlotIndex, slot >>> 0)
}

/**
 * `@va D2Common:0x6FD9E1C0` (`D2Common.#10858`, `SKILLS_GetSkillsTxtFromSkill`, `__fastcall(ecx=pSkill) -> D2SkillsTxt*`).
 */
export function SKILLS_GetSkillsTxtFromSkill113c(m: Memory113c, pSkill: number): number {
  if (pSkill === 0) return 0
  return m.get(pSkill, D2SkillStrc.pSkillsTxt)
}

/**
 * `@va D2Common:0x6FD9E1D0` (`D2Common.#10601`, `SKILLS_GetSkillIdFromSkill`, `__stdcall(pSkill, pFile, nLine) -> int`).
 *
 * - If `pSkill === 0`, returns `0` (`test eax, eax; jne; ret 0xc`).
 * - Otherwise reads `pSkillsTxt = pSkill->pSkillsTxt (+0x00)` and returns sign-extended `(int16)pSkillsTxt->wSkillId (+0x00)`.
 */
export function SKILLS_GetSkillIdFromSkill113c(
  m: Memory113c,
  pSkill: number,
  _pFile = 0,
  _nLine = 0,
): number {
  if (pSkill === 0) return 0
  const pSkillsTxt = m.get(pSkill, D2SkillStrc.pSkillsTxt)
  return i16(m.get(pSkillsTxt, D2SkillsTxt.wSkillId)) >>> 0
}

/**
 * `@va D2Common:0x6FD9E3B0` (`D2Common.#10784`, `SKILLS_GetNextSkill`, `__stdcall(pSkill) -> D2SkillStrc*`).
 */
export function SKILLS_GetNextSkill113c(m: Memory113c, pSkill: number): number {
  if (pSkill === 0) return 0
  return m.get(pSkill, D2SkillStrc.pNextSkill)
}

/**
 * `@va D2Common:0x6FD9E3D0` (`D2Common.#10273`, `SKILLS_GetFirstSkillFromSkillList`, `__stdcall(pSkillList) -> D2SkillStrc*`).
 */
export function SKILLS_GetFirstSkillFromSkillList113c(m: Memory113c, pSkillList: number): number {
  if (pSkillList === 0) return 0
  return m.get(pSkillList, D2SkillListStrc.pFirstSkill)
}

/**
 * `@va D2Common:0x6FD9E460` (`D2Common.#10952`, `SKILLS_GetSkillSlotIndex`, `__stdcall(pUnit, pSkill) -> int`).
 *
 * - If `pUnit === 0` or `pSkill === 0`, returns `0`.
 * - Otherwise returns `pSkill->nSlotIndex (+0x08)`.
 */
export function SKILLS_GetSkillSlotIndex113c(
  m: Memory113c,
  pUnit: number,
  pSkill: number,
): number {
  if (pUnit === 0 || pSkill === 0) return 0
  return m.get(pSkill, D2SkillStrc.nSlotIndex)
}

/**
 * `@va D2Common:0x6FD9E480` (internal, custom reg `eax=pUnit, esi=nSkillId -> D2SkillStrc*`).
 *
 * Walks `pUnit->pSkills (+0xA8)->pFirstSkill (+0x04)` for skills with `(int16)pSkillsTxt->wSkillId == nSkillId`
 * and `dwFlags (+0x3C) == 0`:
 * - First matching skill becomes `pBestSkill`.
 * - Any matching skill with `nOwnerItemGuid (+0x34) == -1` (`0xFFFFFFFF`) replaces `pBestSkill`.
 * - Otherwise, if `pBestSkill->nOwnerItemGuid != -1`, a candidate replaces `pBestSkill` iff
 *   `(candidate->nSkillLevel (+0x28) | 0) > (pBestSkill->nSkillLevel (+0x28) | 0)`.
 */
export function SKILLS_GetHighestLevelSkillFromUnitAndId113c(
  m: Memory113c,
  pUnit: number,
  nSkillId: number,
): number {
  const pSkills = m.get(pUnit, D2UnitStrc.pSkills)
  if (pSkills === 0) return 0
  let pCur = m.get(pSkills, D2SkillListStrc.pFirstSkill)
  if (pCur === 0) return 0

  const targetId = nSkillId | 0
  let pBest = 0
  while (pCur !== 0) {
    const pSkillsTxt = m.get(pCur, D2SkillStrc.pSkillsTxt)
    const wSkillId = i16(m.get(pSkillsTxt, D2SkillsTxt.wSkillId))
    if (wSkillId === targetId && m.get(pCur, D2SkillStrc.dwFlags) === 0) {
      if (pBest === 0) {
        pBest = pCur
      } else if ((m.get(pCur, D2SkillStrc.nOwnerItemGuid) | 0) === -1) {
        pBest = pCur
      } else if ((m.get(pBest, D2SkillStrc.nOwnerItemGuid) | 0) !== -1) {
        const curLvl = m.get(pCur, D2SkillStrc.nSkillLevel) | 0
        const bestLvl = m.get(pBest, D2SkillStrc.nSkillLevel) | 0
        if (curLvl > bestLvl) {
          pBest = pCur
        }
      }
    }
    pCur = m.get(pCur, D2SkillStrc.pNextSkill)
  }
  return pBest
}

/**
 * `@va D2Common:0x6FD9E520` (`D2Common.#11120`, `SKILLS_GetClassSkillCount`, `__stdcall(nCharClass) -> int`).
 *
 * Returns `sgptDataTables->pPlayerClassSkillCount (+0xBA4)[nCharClass]` if `0 <= (nCharClass | 0) < 7`, else `0`.
 */
export function SKILLS_GetClassSkillCount113c(m: Memory113c, nCharClass: number): number {
  const cls = nCharClass | 0
  if (cls < 0 || cls >= 7) return 0
  const pDataTables = m.u32(SGPT_DATATABLES_VA_113C)
  const pCounts = m.u32((pDataTables + DATATABLES_PLAYER_CLASS_SKILL_COUNT_OFF_113C) >>> 0)
  return m.u32((pCounts + (cls << 2)) >>> 0)
}

/**
 * `@va D2Common:0x6FD9E550` (`D2Common.#10044`, `SKILLS_GetClassSkillId`, `__stdcall(nCharClass, nIndex) -> int`).
 *
 * - If `(nCharClass | 0) < 0` or `(nCharClass | 0) >= 7` or `(nIndex | 0) < 0`, returns `-1` (`0xFFFFFFFF`).
 * - Reads `nCount = sgptDataTables->pPlayerClassSkillCount (+0xBA4)[nCharClass]`; if `(nIndex | 0) >= (nCount | 0)`, returns `-1`.
 * - Reads `nStride = sgptDataTables->nMaxClassSkillsStride (+0xBA8)` and `pList = sgptDataTables->pPlayerClassSkillList (+0xBAC)`,
 *   and returns sign-extended `(int16)pList[nCharClass * nStride + nIndex]`.
 */
export function SKILLS_GetClassSkillId113c(
  m: Memory113c,
  nCharClass: number,
  nIndex: number,
): number {
  const cls = nCharClass | 0
  if (cls < 0 || cls >= 7) return 0xffffffff
  const idx = nIndex | 0
  if (idx < 0) return 0xffffffff
  const pDataTables = m.u32(SGPT_DATATABLES_VA_113C)
  const pCounts = m.u32((pDataTables + DATATABLES_PLAYER_CLASS_SKILL_COUNT_OFF_113C) >>> 0)
  const nCount = m.u32((pCounts + (cls << 2)) >>> 0) | 0
  if (idx >= nCount) return 0xffffffff
  const nStride = m.u32((pDataTables + DATATABLES_MAX_CLASS_SKILLS_STRIDE_OFF_113C) >>> 0) | 0
  const pList = m.u32((pDataTables + DATATABLES_PLAYER_CLASS_SKILL_LIST_OFF_113C) >>> 0)
  const elemIdx = (Math.imul(nStride, cls) + idx) | 0
  return i16(m.u16((pList + ((elemIdx << 1) >>> 0)) >>> 0)) >>> 0
}
