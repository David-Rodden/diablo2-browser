/**
 * Diablo II v1.13c `D2Common.dll` animation-sequence (`AnimSeq.cpp`), unit object/gold (`Units.cpp`),
 * and composite weapon-class (`Composit.cpp`) leaf functions (image base `0x6FD50000`).
 *
 * Binary evidence (`objdump -d -M intel` on 1.13c `D2Common.dll`):
 * - `0x6FD7E6B0`: `ANIMSEQ_GetEventAtFrame` (`__stdcall(pSeqRecord, dwFrameFp8, pEventOut)`, `ret 0xC`)
 * - `0x6FD7E6E0`: `ANIMSEQ_EvaluateSequenceFrame` (`__stdcall(pSeqRecord, dwCurrFrameFp8, dwPrevFrameFp8, pModeOut, pFrameOut, pDirOut, pEventOut)`, `ret 0x1C`)
 * - `#11060` (`0x6FD7E9C0`): `UNITS_GetStashGoldLimit` (`__stdcall(pUnit)`, `ret 0x4`)
 * - `#10934` (`0x6FD7ED30`): `UNITS_HasObjectSubClassBit0` (`__stdcall(pUnit)`, `ret 0x4`)
 * - `#10923` (`0x6FD937F0`): `COMPOSIT_GetWeaponClassIdFromCode` (`__stdcall(dwWeaponClassCode)`, `ret 0x4`)
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import {
  D2AnimSeqTxt,
  D2AnimSeqTxt_SIZE,
  D2ObjectDataStrc,
  D2ObjectsTxt,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import { imul32 } from './int-math.ts'

const UNIT_OBJECT = 2

/**
 * `.rdata` weapon-class lookup table at `0x6FDE3368` (`13` entries × `8` bytes = `104` bytes:
 * `{ uint32_t dwCode; uint32_t nWeaponClassId; }`).
 * Read by `COMPOSIT_GetWeaponClassIdFromCode` (`0x6FD937F6 cmp [eax*8+0x6FDE3368], ecx` /
 * `0x6FD9380A mov eax, [eax*8+0x6FDE336C]`).
 */
export const D2COMMON_WEAPON_CLASS_TABLE_VA_113C = 0x6fde3368
export const WEAPON_CLASS_TABLE_COUNT_113C = 13

export const WEAPON_CLASS_CODE_TABLE_6FDE3368: readonly (readonly [number, number])[] = [
  [0x20736831, 2], // '1hs ' -> 2
  [0x20746831, 3], // '1ht ' -> 3
  [0x20776f62, 1], // 'bow ' -> 1
  [0x20736832, 5], // '2hs ' -> 5
  [0x20746832, 6], // '2ht ' -> 6
  [0x20736a31, 8], // '1js ' -> 8
  [0x20746a31, 9], // '1jt ' -> 9
  [0x20737331, 10], // '1ss ' -> 10
  [0x20747331, 11], // '1st ' -> 11
  [0x20667473, 4], // 'stf ' -> 4
  [0x20776278, 7], // 'xbw ' -> 7
  [0x20317468, 12], // 'ht1 ' -> 12
  [0x20327468, 13], // 'ht2 ' -> 13
]

/**
 * `@va D2Common:0x6FD7E6B0` (`ANIMSEQ_GetEventAtFrame`,
 * stdcall `[esp+4] = pSeqRecord`, `[esp+8] = dwFrameFp8`, `[esp+0xC] = pEventOut`, `ret 0xC`, void).
 *
 * If `pSeqRecord == 0`, writes `*pEventOut = 0` (`0x6FD7E6B8..0x6FD7E6BE`).
 * Otherwise computes `frameIdx = (dwFrameFp8 | 0) >> 8` (`0x6FD7E6C5 sar eax, 8`), indexes
 * `pSeqRecord + frameIdx * 6` (`lea edx, [eax+eax*2]; movzx eax, byte [ecx+edx*2+5]`), and stores
 * `nEvent` (`+0x05`) into `*pEventOut`.
 */
export function ANIMSEQ_GetEventAtFrame113c(
  m: Memory113c,
  pSeqRecord: number,
  dwFrameFp8: number,
  pEventOut: number,
): void {
  const seq = pSeqRecord >>> 0
  const out = pEventOut >>> 0
  if (seq === 0) {
    m.setU32(out, 0)
    return
  }
  const frameIdx = (dwFrameFp8 | 0) >> 8
  const rec = (seq + imul32(frameIdx, D2AnimSeqTxt_SIZE)) >>> 0
  const ev = m.get(rec, D2AnimSeqTxt.nEvent) & 0xff
  m.setU32(out, ev >>> 0)
}

/**
 * `@va D2Common:0x6FD7E6E0` (`ANIMSEQ_EvaluateSequenceFrame`,
 * stdcall `[esp+4] = pSeqRecord`, `[esp+8] = dwCurrFrameFp8`, `[esp+0xC] = dwPrevFrameFp8`,
 * `[esp+0x10] = pModeOut`, `[esp+0x14] = pFrameOut`, `[esp+0x18] = pDirOut`, `[esp+0x1C] = pEventOut`,
 * `ret 0x1C`, void).
 *
 * If `pSeqRecord == 0`, zeros `*pModeOut`, `*pFrameOut`, `*pDirOut`, and `*pEventOut` (`0x6FD7E6E9..0x6FD7E702`).
 * Otherwise reads `rec = pSeqRecord + ((dwCurrFrameFp8 | 0) >> 8) * 6`, writes `nMode (+0x02)`,
 * `nFrame (+0x03)`, and `nDir (+0x04)`. If `dwCurrFrameFp8 == dwPrevFrameFp8`, writes `*pEventOut = rec->nEvent (+0x05)`.
 * Otherwise initializes `*pEventOut = 0` and scans `idx` from `((dwPrevFrameFp8 | 0) >> 8) + 1` through
 * `(dwCurrFrameFp8 | 0) >> 8` inclusive (`0x6FD7E750..0x6FD7E77F`), overwriting `*pEventOut` whenever
 * `pSeqRecord[idx].nEvent != 0`.
 */
export function ANIMSEQ_EvaluateSequenceFrame113c(
  m: Memory113c,
  pSeqRecord: number,
  dwCurrFrameFp8: number,
  dwPrevFrameFp8: number,
  pModeOut: number,
  pFrameOut: number,
  pDirOut: number,
  pEventOut: number,
): void {
  const seq = pSeqRecord >>> 0
  const modePtr = pModeOut >>> 0
  const framePtr = pFrameOut >>> 0
  const dirPtr = pDirOut >>> 0
  const eventPtr = pEventOut >>> 0

  if (seq === 0) {
    m.setU32(modePtr, 0)
    m.setU32(framePtr, 0)
    m.setU32(dirPtr, 0)
    m.setU32(eventPtr, 0)
    return
  }

  const currFp8 = dwCurrFrameFp8 | 0
  const prevFp8 = dwPrevFrameFp8 | 0
  const currIdx = currFp8 >> 8
  const currRec = (seq + imul32(currIdx, D2AnimSeqTxt_SIZE)) >>> 0

  m.setU32(modePtr, m.get(currRec, D2AnimSeqTxt.nMode) & 0xff)
  m.setU32(framePtr, m.get(currRec, D2AnimSeqTxt.nFrame) & 0xff)
  m.setU32(dirPtr, m.get(currRec, D2AnimSeqTxt.nDir) & 0xff)

  if (currFp8 === prevFp8) {
    m.setU32(eventPtr, m.get(currRec, D2AnimSeqTxt.nEvent) & 0xff)
    return
  }

  const startIdx = ((prevFp8 >> 8) + 1) | 0
  m.setU32(eventPtr, 0)
  if (startIdx > currIdx) {
    return
  }

  let count = ((currIdx - startIdx) + 1) | 0
  let recPtr = (seq + imul32(startIdx, D2AnimSeqTxt_SIZE)) >>> 0
  while (count !== 0) {
    const ev = m.get(recPtr, D2AnimSeqTxt.nEvent) & 0xff
    if (ev !== 0) {
      m.setU32(eventPtr, ev >>> 0)
    }
    recPtr = (recPtr + D2AnimSeqTxt_SIZE) >>> 0
    count = (count - 1) | 0
  }
}

/**
 * `@va D2Common:0x6FD7E9C0` (`D2Common.#11060` `UNITS_GetStashGoldLimit`,
 * stdcall `[esp+4] = pUnit`, `ret 4` -> `0x2625A0` (`2500000`)).
 */
export function UNITS_GetStashGoldLimit113c(_pUnit: number): number {
  return 0x2625a0
}

/**
 * `@va D2Common:0x6FD7ED30` (`D2Common.#10934` `UNITS_HasObjectSubClassBit0`,
 * stdcall `[esp+4] = pUnit`, `ret 4` -> `1` if `pUnit->dwUnitType == 2` and `(pUnit->pObjectData->pObjectTxt->nSubClass & 1) != 0`, else `0`).
 */
export function UNITS_HasObjectSubClassBit0113c(m: Memory113c, pUnit: number): number {
  const u = pUnit >>> 0
  if (m.get(u, D2UnitStrc.dwUnitType) !== UNIT_OBJECT) {
    return 0
  }
  const pObjData = m.get(u, D2UnitStrc.pUnitData)
  const pObjTxt = m.get(pObjData, D2ObjectDataStrc.pObjectTxt)
  const nSubClass = m.get(pObjTxt, D2ObjectsTxt.nSubClass) & 0xff
  return (nSubClass & 1) !== 0 ? 1 : 0
}

/**
 * `@va D2Common:0x6FD937F0` (`D2Common.#10923` `COMPOSIT_GetWeaponClassIdFromCode`,
 * stdcall `[esp+4] = dwWeaponClassCode`, `ret 4` -> `nWeaponClassId` (`1..13`) or `0`).
 *
 * Scans the 13-entry `(dwCode, nWeaponClassId)` table at `0x6FDE3368` (`0x6FD937F6..0x6FD93811`).
 */
export function COMPOSIT_GetWeaponClassIdFromCode113c(
  m: Memory113c,
  dwWeaponClassCode: number,
): number {
  const target = dwWeaponClassCode >>> 0
  for (let i = 0; i < WEAPON_CLASS_TABLE_COUNT_113C; i++) {
    const code = m.u32((D2COMMON_WEAPON_CLASS_TABLE_VA_113C + i * 8) >>> 0)
    if (code === target) {
      return m.u32((D2COMMON_WEAPON_CLASS_TABLE_VA_113C + i * 8 + 4) >>> 0)
    }
  }
  return 0
}
