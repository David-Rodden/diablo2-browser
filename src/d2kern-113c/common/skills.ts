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
 *
 * Batch `B012` (13 functions):
 * - `0x6FD9E8C0` `SKILLS_GetClassIdFromSkillId113c` (`#10847`)
 * - `0x6FD9EA00` `SKILLS_EvaluateManaCost256ths113c` (`#10090`)
 * - `0x6FD9EB00` `SKILLS_GetReqLevel113c` (`#11070`)
 * - `0x6FD9F080` `SKILLS_GetSkillById113c` (`#10708`)
 * - `0x6FD9F0C0` `SKILLS_CalcMaxCallback113c` (internal)
 * - `0x6FD9F0D0` `SKILLS_CalcMinCallback113c` (internal)
 * - `0x6FD9F0E0` `SKILLS_GetPassiveState113c` (`#10313`)
 * - `0x6FD9F4C0` `SKILLS_GetBaseSkillLevelById113c` (internal)
 * - `0x6FD9F510` `SKILLS_GetRequiredLevelForNextRank113c` (`#10339`)
 * - `0x6FD9F780` `SKILLS_MapPlayerAnimModeToMonsterMode113c` (`#10568`)
 * - `0x6FDA2E00` `DATATBLS_GetMonSeqTableRecord113c` (`#10194`)
 * - `0x6FDB9DC0` `MISSILE_EvaluateElementalLength113c` (`#10242`)
 * - `0x6FDCF5E0` `UNITS_GetUnitDistanceToCoordinates113c` (`#10080`)
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import { sdiv32 } from './int-math.ts'
import {
  D2DynamicPathStrc,
  D2MissilesTxt,
  D2MissilesTxt_SIZE,
  D2MonStats2Txt_SIZE,
  D2MonStatsTxt,
  D2MonStatsTxt_SIZE,
  D2SkillListStrc,
  D2SkillsTxt,
  D2SkillsTxt_SIZE,
  D2SkillStrc,
  D2StaticPathStrc,
  D2StatListExStrc,
  D2UnitStrc,
} from '../mem/layout.generated.ts'

/** `.data` `D2DataTablesStrc* sgptDataTables` at `0x6FDE9E1C`. */
export const SGPT_DATATABLES_VA_113C = 0x6fde9e1c
/** `.rdata` IAT slot for `Fog.dll!gdwBitMasks` (`uint32[32]`) at `0x6FDD90B0`. */
export const GDW_BITMASKS_IAT_VA_113C = 0x6fdd90b0

/** `sgptDataTables` field offsets accessed by `B003` and `B012` functions. */
export const DATATABLES_MONSTATS_TXT_OFF_113C = 0xa78
export const DATATABLES_MONSTATS_COUNT_OFF_113C = 0xa80
export const DATATABLES_MONSTATS2_TXT_OFF_113C = 0xa90
export const DATATABLES_MONSTATS2_COUNT_OFF_113C = 0xa98
export const DATATABLES_MISSILES_TXT_OFF_113C = 0xb64
export const DATATABLES_MISSILES_COUNT_OFF_113C = 0xb6c
export const DATATABLES_SKILLS_TXT_OFF_113C = 0xb98
export const DATATABLES_SKILLS_COUNT_OFF_113C = 0xba0
export const DATATABLES_PLAYER_CLASS_SKILL_COUNT_OFF_113C = 0xba4
export const DATATABLES_MAX_CLASS_SKILLS_STRIDE_OFF_113C = 0xba8
export const DATATABLES_PLAYER_CLASS_SKILL_LIST_OFF_113C = 0xbac
export const DATATABLES_ITEMTYPES_COUNT_OFF_113C = 0xbfc
export const DATATABLES_ITEMTYPES_STRIDE_OFF_113C = 0xc00
export const DATATABLES_ITEMTYPES_EQUIV_MASK_OFF_113C = 0xc04

/** `.data` `sgptDataTables->pMonSeqTable` (`0x6FDA2E14 mov ecx, ds:0x6fdf0a5c`) and count (`0x6FDA2E06 cmp eax, ds:0x6fdf0a60`). */
export const G_MONSEQ_TABLE_VA_113C = 0x6fdf0a5c
export const G_MONSEQ_COUNT_VA_113C = 0x6fdf0a60
export const D2MONSEQ_TABLE_RECORD_SIZE_113C = 12

/** `.rdata` `int32[]` player-mode -> monster-mode mapping at `0x6FDE3088` (`0x6FD9F784 mov eax, [eax*4+0x6fde3088]`). */
export const PLR_TO_MON_MODE_TABLE_VA_113C = 0x6fde3088

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

function getSkillsTxtRecord(m: Memory113c, nSkillId: number): number {
  const id = nSkillId | 0
  if (id < 0) return 0
  const pDataTables = m.u32(SGPT_DATATABLES_VA_113C)
  const nCount = m.u32((pDataTables + DATATABLES_SKILLS_COUNT_OFF_113C) >>> 0) | 0
  if (id >= nCount) return 0
  const pBase = m.u32((pDataTables + DATATABLES_SKILLS_TXT_OFF_113C) >>> 0)
  const pRec = (pBase + Math.imul(id, D2SkillsTxt_SIZE)) >>> 0
  return pRec
}

/**
 * `@va D2Common:0x6FD9E8C0` (`D2Common.#10847`, `SKILLS_GetClassIdFromSkillId`, `__stdcall(nSkillId) -> int`, `ret 4`).
 *
 * Looks up `pSkillsTxt` for `nSkillId`; if null or `(int8)pSkillsTxt->nCharClass (+0x0C) < 0`, returns `7`,
 * else returns `(int8)pSkillsTxt->nCharClass`.
 */
export function SKILLS_GetClassIdFromSkillId113c(m: Memory113c, nSkillId: number): number {
  const pRec = getSkillsTxtRecord(m, nSkillId)
  if (pRec === 0) return 7
  const c = (m.get(pRec, D2SkillsTxt.nCharClass) << 24) >> 24
  return (c < 0 ? 7 : c) >>> 0
}

/**
 * `@va D2Common:0x6FD9EA00` (`D2Common.#10090`, `SKILLS_EvaluateManaCost256ths`,
 * `__stdcall(nSkillId, nSkillLevel) -> int`, `ret 8`).
 *
 * Computes `(((nSkillLevel - 1) * (int16)wLvlMana (+0x18C) + (int16)wMana (+0x18A)) << (nManaShift (+0x188) & 0x1F))`.
 */
export function SKILLS_EvaluateManaCost256ths113c(
  m: Memory113c,
  nSkillId: number,
  nSkillLevel: number,
): number {
  const pRec = getSkillsTxtRecord(m, nSkillId)
  if (pRec === 0) return 0
  const wLvlMana = i16(m.get(pRec, D2SkillsTxt.wLvlMana))
  const wMana = i16(m.get(pRec, D2SkillsTxt.wMana))
  const nManaShift = m.get(pRec, D2SkillsTxt.nManaShift) & 0x1f
  const base = (Math.imul(wLvlMana, ((nSkillLevel | 0) - 1) | 0) + wMana) | 0
  return (base << nManaShift) >>> 0
}

/**
 * `@va D2Common:0x6FD9EB00` (`D2Common.#11070`, `SKILLS_GetReqLevel`, `__stdcall(nSkillId) -> int`, `ret 4`).
 *
 * Returns `(int16)pSkillsTxt->wReqLevel (+0x174)` if `nSkillId` is valid, else `0x7FFFFFFF`.
 */
export function SKILLS_GetReqLevel113c(m: Memory113c, nSkillId: number): number {
  const pRec = getSkillsTxtRecord(m, nSkillId)
  if (pRec === 0) return 0x7fffffff
  return i16(m.get(pRec, D2SkillsTxt.wReqLevel)) >>> 0
}

/**
 * `@va D2Common:0x6FD9F080` (`D2Common.#10708`, `SKILLS_GetSkillById`,
 * custom `__fastcall(ecx=pUnit, edx=nSkillId, [esp+4]=nOwnerItemGuid) -> D2SkillStrc*`, `ret 4`).
 *
 * Walks `pUnit->pSkills (+0xA8)->pFirstSkill (+0x04)` for the first node matching
 * `(int16)pSkill->pSkillsTxt->wSkillId === nSkillId` and `pSkill->nOwnerItemGuid (+0x34) === nOwnerItemGuid`.
 */
export function SKILLS_GetSkillById113c(
  m: Memory113c,
  pUnit: number,
  nSkillId: number,
  nOwnerItemGuid: number,
): number {
  const pSkills = m.get(pUnit, D2UnitStrc.pSkills)
  if (pSkills === 0) return 0
  let pCur = m.get(pSkills, D2SkillListStrc.pFirstSkill)
  const targetId = nSkillId | 0
  const targetGuid = nOwnerItemGuid >>> 0
  while (pCur !== 0) {
    const pSkillsTxt = m.get(pCur, D2SkillStrc.pSkillsTxt)
    if (
      i16(m.get(pSkillsTxt, D2SkillsTxt.wSkillId)) === targetId &&
      m.get(pCur, D2SkillStrc.nOwnerItemGuid) === targetGuid
    ) {
      return pCur
    }
    pCur = m.get(pCur, D2SkillStrc.pNextSkill)
  }
  return 0
}

/**
 * `@va D2Common:0x6FD9F0C0` (internal, `ecx=a, edx=b, [esp+4]=arg0, [esp+8]=arg1 -> int`, `ret 8`).
 *
 * Signed max callback (`mov eax, ecx; cmp eax, edx; jg +2; mov eax, edx; ret 8`).
 */
export function SKILLS_CalcMaxCallback113c(
  _m: Memory113c,
  a: number,
  b: number,
  _arg0 = 0,
  _arg1 = 0,
): number {
  const x = a | 0
  const y = b | 0
  return (x > y ? x : y) >>> 0
}

/**
 * `@va D2Common:0x6FD9F0D0` (internal, `ecx=a, edx=b, [esp+4]=arg0, [esp+8]=arg1 -> int`, `ret 8`).
 *
 * Signed min callback (`mov eax, ecx; cmp eax, edx; jl +2; mov eax, edx; ret 8`).
 */
export function SKILLS_CalcMinCallback113c(
  _m: Memory113c,
  a: number,
  b: number,
  _arg0 = 0,
  _arg1 = 0,
): number {
  const x = a | 0
  const y = b | 0
  return (x < y ? x : y) >>> 0
}

/**
 * `@va D2Common:0x6FD9F0E0` (`D2Common.#10313`, `SKILLS_GetPassiveState`, `__stdcall(nSkillId) -> int`, `ret 4`).
 *
 * Returns `(int16)pSkillsTxt->wPassiveState (+0x94)` if positive (`jg`), else `0`.
 */
export function SKILLS_GetPassiveState113c(m: Memory113c, nSkillId: number): number {
  const pRec = getSkillsTxtRecord(m, nSkillId)
  if (pRec === 0) return 0
  const st = i16(m.get(pRec, D2SkillsTxt.wPassiveState))
  return st > 0 ? st >>> 0 : 0
}

/**
 * `@va D2Common:0x6FD9F4C0` (internal, custom reg `eax=pUnit, edx=nSkillId -> int`, `ret`).
 *
 * Returns `pSkill->nSkillLevel (+0x28)` for the unit's base skill (`nOwnerItemGuid (+0x34) == -1`) matching `nSkillId`,
 * or `0` if not found.
 */
export function SKILLS_GetBaseSkillLevelById113c(
  m: Memory113c,
  pUnit: number,
  nSkillId: number,
): number {
  if (pUnit === 0) return 0
  const pSkills = m.get(pUnit, D2UnitStrc.pSkills)
  if (pSkills === 0) return 0
  let pCur = m.get(pSkills, D2SkillListStrc.pFirstSkill)
  const targetId = nSkillId | 0
  while (pCur !== 0) {
    const pSkillsTxt = m.get(pCur, D2SkillStrc.pSkillsTxt)
    if (
      i16(m.get(pSkillsTxt, D2SkillsTxt.wSkillId)) === targetId &&
      (m.get(pCur, D2SkillStrc.nOwnerItemGuid) | 0) === -1
    ) {
      return m.get(pCur, D2SkillStrc.nSkillLevel)
    }
    pCur = m.get(pCur, D2SkillStrc.pNextSkill)
  }
  return 0
}

/**
 * `@va D2Common:0x6FD9F510` (`D2Common.#10339`, `SKILLS_GetRequiredLevelForNextRank`,
 * `__stdcall(pUnit, nSkillId) -> int`, `ret 8`).
 *
 * Returns `(int16)pSkillsTxt->wReqLevel (+0x174) + baseSkillLevel`, or `0x7FFFFFFF` if `nSkillId` is invalid.
 */
export function SKILLS_GetRequiredLevelForNextRank113c(
  m: Memory113c,
  pUnit: number,
  nSkillId: number,
): number {
  const pRec = getSkillsTxtRecord(m, nSkillId)
  if (pRec === 0) return 0x7fffffff
  let reqLvl = i16(m.get(pRec, D2SkillsTxt.wReqLevel))
  const pSkills = m.get(pUnit, D2UnitStrc.pSkills)
  if (pSkills !== 0) {
    let pCur = m.get(pSkills, D2SkillListStrc.pFirstSkill)
    const targetId = nSkillId | 0
    while (pCur !== 0) {
      const pSkillsTxt = m.get(pCur, D2SkillStrc.pSkillsTxt)
      if (
        i16(m.get(pSkillsTxt, D2SkillsTxt.wSkillId)) === targetId &&
        (m.get(pCur, D2SkillStrc.nOwnerItemGuid) | 0) === -1
      ) {
        reqLvl = (reqLvl + (m.get(pCur, D2SkillStrc.nSkillLevel) | 0)) | 0
        break
      }
      pCur = m.get(pCur, D2SkillStrc.pNextSkill)
    }
  }
  return reqLvl >>> 0
}

/**
 * `@va D2Common:0x6FD9F780` (`D2Common.#10568`, `SKILLS_MapPlayerAnimModeToMonsterMode`,
 * `__stdcall(nPlrMode, nMonClassId) -> int`, `ret 8`).
 */
export function SKILLS_MapPlayerAnimModeToMonsterMode113c(
  m: Memory113c,
  nPlrMode: number,
  nMonClassId: number,
): number {
  let mode = m.u32((PLR_TO_MON_MODE_TABLE_VA_113C + Math.imul(nPlrMode | 0, 4)) >>> 0) | 0
  const pDataTables = m.u32(SGPT_DATATABLES_VA_113C)
  const monId = nMonClassId | 0
  const pBitMasks = m.u32(GDW_BITMASKS_IAT_VA_113C)

  while (true) {
    const nMonCount = m.u32((pDataTables + DATATABLES_MONSTATS_COUNT_OFF_113C) >>> 0) | 0
    if (monId >= 0 && monId < nMonCount) {
      const pMonBase = m.u32((pDataTables + DATATABLES_MONSTATS_TXT_OFF_113C) >>> 0)
      const pMonStats = (pMonBase + Math.imul(monId, D2MonStatsTxt_SIZE)) >>> 0
      const wMonStatsEx = i16(m.get(pMonStats, D2MonStatsTxt.wMonStatsEx))
      const nMon2Count = m.u32((pDataTables + DATATABLES_MONSTATS2_COUNT_OFF_113C) >>> 0) | 0
      if (wMonStatsEx >= 0 && wMonStatsEx < nMon2Count) {
        const pMon2Base = m.u32((pDataTables + DATATABLES_MONSTATS2_TXT_OFF_113C) >>> 0)
        const pMonStats2 = (pMon2Base + Math.imul(wMonStatsEx, D2MonStats2Txt_SIZE)) >>> 0
        if (pMonStats2 !== 0) {
          const byteVal = m.u8((pMonStats2 + 0xf0 + (mode >> 3)) >>> 0)
          const bitMask = m.u32((pBitMasks + ((mode & 7) << 2)) >>> 0)
          if ((byteVal & bitMask) !== 0) {
            return mode >>> 0
          }
        }
      }
    }

    if (mode === 1) return 1
    if (mode === 15) {
      mode = 2
    } else if (mode === 9 || mode === 10 || mode === 11) {
      mode = 8
    } else if (mode === 6) {
      mode = 3
    } else if (mode === 5 || mode === 7) {
      mode = 4
    } else {
      mode = 1
    }
  }
}

/**
 * `@va D2Common:0x6FDA2E00` (`D2Common.#10194`, `DATATBLS_GetMonSeqTableRecord`,
 * `__stdcall(nSeqId) -> D2MonSeqTableStrc*`, `ret 4`).
 */
export function DATATBLS_GetMonSeqTableRecord113c(m: Memory113c, nSeqId: number): number {
  const id = nSeqId | 0
  if (id < 0) return 0
  const nCount = m.u32(G_MONSEQ_COUNT_VA_113C) | 0
  if (id >= nCount) return 0
  const pBase = m.u32(G_MONSEQ_TABLE_VA_113C)
  return (pBase + Math.imul(id, D2MONSEQ_TABLE_RECORD_SIZE_113C)) >>> 0
}

/**
 * `@va D2Common:0x6FDB9DC0` (`D2Common.#10242`, `MISSILE_EvaluateElementalLength`,
 * `__stdcall(pOwner, pUnit, nMissileId, nLevel) -> int`, `ret 0x10`).
 */
export function MISSILE_EvaluateElementalLength113c(
  m: Memory113c,
  _pOwner: number,
  _pUnit: number,
  nMissileId: number,
  nLevel: number,
): number {
  const id = nMissileId | 0
  if (id < 0) return 0
  const pDataTables = m.u32(SGPT_DATATABLES_VA_113C)
  const nCount = m.u32((pDataTables + DATATABLES_MISSILES_COUNT_OFF_113C) >>> 0) | 0
  if (id >= nCount) return 0
  const pBase = m.u32((pDataTables + DATATABLES_MISSILES_TXT_OFF_113C) >>> 0)
  const pRec = (pBase + Math.imul(id, D2MissilesTxt_SIZE)) >>> 0
  if (pRec === 0) return 0

  const eLen = m.get(pRec, D2MissilesTxt.dwELen) | 0
  const eLev1 = m.get(pRec, D2MissilesTxt.dwELevLen1) | 0
  const eLev2 = m.get(pRec, D2MissilesTxt.dwELevLen2) | 0
  const eLev3 = m.get(pRec, D2MissilesTxt.dwELevLen3) | 0
  const lvl = nLevel | 0

  if (lvl <= 0) return eLen >>> 0
  if (lvl <= 8) return (eLen + Math.imul((lvl - 1) | 0, eLev1)) >>> 0
  const t1 = Math.imul(7, eLev1)
  if (lvl <= 16) return (eLen + t1 + Math.imul((lvl - 8) | 0, eLev2)) >>> 0
  const t2 = (t1 + (eLev2 << 3)) | 0
  return (eLen + t2 + Math.imul((lvl - 16) | 0, eLev3)) >>> 0
}

/**
 * `@va D2Common:0x6FDCF5E0` (`D2Common.#10080`, `UNITS_GetUnitDistanceToCoordinates` / `UNITS_GetDistanceToCoordinates`,
 * `__stdcall(pUnit, nTargetX, nTargetY) -> int`, `ret 0xC`).
 */
export function UNITS_GetUnitDistanceToCoordinates113c(
  m: Memory113c,
  pUnit: number,
  nTargetX: number,
  nTargetY: number,
): number {
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType) | 0
  const pPath = m.get(pUnit, D2UnitStrc.pPath)
  let unitX = 0
  let unitY = 0

  if (unitType === 2 || (unitType > 3 && unitType <= 5)) {
    unitX = m.get(pPath, D2StaticPathStrc.nPosX) | 0
    unitY = m.get(pPath, D2StaticPathStrc.nPosY) | 0
  } else if (pPath !== 0) {
    unitX = m.get(pPath, D2DynamicPathStrc.wPosX)
    unitY = m.get(pPath, D2DynamicPathStrc.wPosY)
  }

  let dx = ((nTargetX | 0) - unitX) | 0
  if (dx < 0) dx = -dx | 0
  if (dx < 0) dx = 0

  let dy = ((nTargetY | 0) - unitY) | 0
  if (dy < 0) dy = -dy | 0
  if (dy < 0) dy = 0

  const sum = (dx > dy ? dy + (dx << 1) : dx + (dy << 1)) | 0
  return sdiv32(sum, 2) >>> 0
}

