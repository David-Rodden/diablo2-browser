/**
 * Diablo II v1.13c `D2Common.dll` item flag, class potion scaling, and `D2ItemDataStrc` field
 * primitives (`Items.cpp`, `0x6FD71F60..0x6FD73C50`).
 *
 * Binary evidence (`objdump -d -M intel ~/d2-data/D2Common.dll`, image base `0x6FD50000`):
 * - `#10013` (`0x6FD71F60` `ITEMS_NoOpReturnZero`): `xor eax, eax; ret 8`.
 * - `#10758` (`0x6FD71FB0` `ITEMS_SetOrClearFlagMask`): `test [esp+0xC], [esp+0xC]; mov eax, [esp+4]`;
 *   if non-zero `*[esp+4] |= [esp+8]`, else `*[esp+4] &= ~[esp+8]`; `ret 0xC` (returns `pdwFlags` in `eax`).
 * - `#10197` (`0x6FD71FE0` `ITEMS_TestFlagMask`): `mov eax, [esp+4]; and eax, [esp+8]; ret 8`.
 * - `#10393` (`0x6FD72210` `ITEMS_ApplyClassManaPotionScale`): jump table at `0x6FD72248`, class index
 *   bytes at `0x6FD72254` (`00 01 01 00 02 01 00`):
 *   - NULL or `dwUnitType != 0` or `dwClassId > 6` (`ja`): returns `nValue`
 *   - `dwClassId` in `{0, 3, 6}` (Amazon, Paladin, Assassin): `nValue + (nValue >> 1)` (`sar eax, 1; add eax, edx`)
 *   - `dwClassId` in `{1, 2, 5}` (Sorceress, Necromancer, Druid): `nValue * 2` (`lea eax, [edx+edx]`)
 *   - `dwClassId == 4` (Barbarian): `nValue`
 * - `#10540` (`0x6FD72260` `ITEMS_ApplyClassLifePotionScale`): jump table at `0x6FD72298`, class index
 *   bytes at `0x6FD722A4` (`00 02 02 00 01 02 00`):
 *   - NULL or `dwUnitType != 0`: jumps to `0x6FD72292` (`lea eax, [ecx+ecx]`, returns `nValue * 2`!)
 *   - `dwClassId > 6` (`ja 0x6FD72295`): returns `nValue`
 *   - `dwClassId` in `{0, 3, 6}` (Amazon, Paladin, Assassin): `nValue + (nValue >> 1)` (`sar eax, 1; add eax, ecx`)
 *   - `dwClassId == 4` (Barbarian): `nValue * 2` (`lea eax, [ecx+ecx]`)
 *   - `dwClassId` in `{1, 2, 5}` (Sorceress, Necromancer, Druid): `nValue`
 * - `#10012` (`0x6FD737A0` `ITEMS_SetInvPage`): writes `(u8)[esp+8]` to `pItemData + 0x45` (`nInvPage`).
 * - `#10883` (`0x6FD73970` `ITEMS_SetRareSuffix`): writes `(u16)[esp+8]` to `pItemData + 0x34` (`wRareSuffix`).
 * - `#10611` (`0x6FD739C0` `ITEMS_SetRarePrefix`): writes `(u16)[esp+8]` to `pItemData + 0x32` (`wRarePrefix`).
 * - `#10525` (`0x6FD73A10` `ITEMS_SetMagicSuffix`): writes `(u16)[esp+8]` to `pItemData + 0x3E + nIndex * 2` (`wMagicSuffix[nIndex]`).
 * - `#10312` (`0x6FD73AC0` `ITEMS_SetMagicPrefix`): writes `(u16)[esp+8]` to `pItemData + 0x38 + nIndex * 2` (`wMagicPrefix[nIndex]`).
 * - `#10417` (`0x6FD73C50` `ITEMS_GetBodyLocation`): reads `(u8)(pItemData + 0x44)` (`nBodyLoc`) into `al`
 *   (or `xor al, al` on NULL / non-item / NULL `pItemData`).
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import {
  D2InventoryStrc,
  D2ItemDataStrc,
  D2ItemDataStrc_SIZE,
  D2ItemStatCostTxt,
  D2ItemStatCostTxt_SIZE,
  D2ItemsTxt,
  D2ItemsTxt_SIZE,
  D2ItemTypesTxt,
  D2ItemTypesTxt_SIZE,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import {
  D2COMMON_GDWBITMASKS_IAT_VA_113C,
  D2CommonAssertError,
  DATATABLES_OFF_113C,
} from './inline-helpers.ts'
import { imul32, sar32 } from './int-math.ts'
import {
  STATLIST_GetUnitBaseStat113c,
  STATLIST_GetUnitStat113c,
  STATLIST_RecordModStat113c,
  STATLIST_SetStat113c,
  STATLIST_SetUnitStat113c,
  statKey113c,
} from './statlist.ts'
import { UNIT_ITEM, UNIT_PLAYER } from './unit.ts'

/** `.data` `D2DataTablesStrc* sgptDataTables` at `0x6FDE9E1C` (`0x6FD72F88`, `0x6FD735D8`). */
const ITEMS_SGPT_DATATABLES_VA_113C = 0x6fde9e1c
/** `sgptDataTables->pItemTypesTxt` (`0x6FD72F96 mov edx, [ecx+0xBF8]`). */
const DATATABLES_ITEMTYPES_TXT_OFF_113C = 0xbf8
/** `sgptDataTables->nItemTypesTxtRecordCount` (`0x6FD72F8E cmp eax, [ecx+0xBFC]`). */
const DATATABLES_ITEMTYPES_COUNT_OFF_113C = 0xbfc
/** `.bss` `0x4C`-stride code table base pointer (`0x6FDA302C mov eax, ds:0x6FDF0880`). */
const DATATBLS_CODE_TABLE_PTR_VA_113C = 0x6fdf0880
/** `.bss` `0x4C`-stride code table record count (`0x6FDA3020 mov edx, ds:0x6FDF0884`). */
const DATATBLS_CODE_TABLE_COUNT_VA_113C = 0x6fdf0884
/** `.bss` `dwItemsTxtRecordCount` (`0x6FD722BA mov ecx, ds:0x6FDEFB94`). */
const ITEMS_TXT_COUNT_VA_113C = 0x6fdefb94
/** `.bss` `pItemsTxt` base pointer (`0x6FD722C2 mov ecx, ds:0x6FDEFB98`). */
const ITEMS_TXT_PTR_VA_113C = 0x6fdefb98
/** `.bss` `pItemsLink` (`D2LinkStrc*`) passed to `Fog.#10213` (`0x6FD79F7C mov eax, ds:0x6FDEFF6C`). */
const ITEMS_LINK_PTR_VA_113C = 0x6fdeff6c
/** `D2InventoryStrc.dwSignature` magic constant (`0x6FD73E41`, `0x6FD741A7`). */
const INVENTORY_SIGNATURE_113C = 0x01020304
/** Embedded `D2ItemExtraDataStrc` (`pItemData + 0x5C`) next-item offset (`0x6FD73EDB mov edi, [ecx+8]`). */
const ITEM_EXTRA_NEXT_ITEM_OFF_113C = 0x08
/** Embedded `D2ItemExtraDataStrc` (`pItemData + 0x5C`) node-pos byte offset (`0x6FD73E92 movsx ecx, byte [ecx+0xD]`). */
const ITEM_EXTRA_NODEPOS_OFF_113C = 0x0d

/**
 * `@va D2Common:0x6FD71F60` (`D2Common.#10013` `ITEMS_NoOpReturnZero`, stdcall 2 stack args, `ret 8` -> `0`).
 */
export function ITEMS_NoOpReturnZero113c(_m: Memory113c, _a0: number, _a1: number): number {
  return 0
}

/**
 * `@va D2Common:0x6FD71FB0` (`D2Common.#10758` `ITEMS_SetOrClearFlagMask`,
 * stdcall `[esp+4] = pdwFlags`, `[esp+8] = dwMask`, `[esp+0xC] = bSet`, `ret 0xC` -> `pdwFlags`).
 */
export function ITEMS_SetOrClearFlagMask113c(
  m: Memory113c,
  pdwFlags: number,
  dwMask: number,
  bSet: number,
): number {
  const ptr = pdwFlags >>> 0
  if ((bSet | 0) !== 0) {
    m.setU32(ptr, (m.u32(ptr) | dwMask) >>> 0)
  } else {
    m.setU32(ptr, (m.u32(ptr) & ~dwMask) >>> 0)
  }
  return ptr
}

/**
 * `@va D2Common:0x6FD71FE0` (`D2Common.#10197` `ITEMS_TestFlagMask`,
 * stdcall `[esp+4] = dwFlags`, `[esp+8] = dwMask`, `ret 8` -> `dwFlags & dwMask`).
 */
export function ITEMS_TestFlagMask113c(_m: Memory113c, dwFlags: number, dwMask: number): number {
  return (dwFlags & dwMask) >>> 0
}

/**
 * `@va D2Common:0x6FD72210` (`D2Common.#10393` `ITEMS_ApplyClassManaPotionScale`,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = nValue`, `ret 8` -> scaled value).
 */
export function ITEMS_ApplyClassManaPotionScale113c(m: Memory113c, pUnit: number, nValue: number): number {
  const v = nValue | 0
  if (pUnit === 0) return v
  if (m.get(pUnit, D2UnitStrc.dwUnitType) !== UNIT_PLAYER) return v
  const classId = m.get(pUnit, D2UnitStrc.dwClassId) >>> 0
  if (classId > 6) return v
  switch (classId) {
    case 0:
    case 3:
    case 6:
      return (sar32(v, 1) + v) | 0
    case 1:
    case 2:
    case 5:
      return (v + v) | 0
    default:
      return v
  }
}

/**
 * `@va D2Common:0x6FD72260` (`D2Common.#10540` `ITEMS_ApplyClassLifePotionScale`,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = nValue`, `ret 8` -> scaled value).
 */
export function ITEMS_ApplyClassLifePotionScale113c(m: Memory113c, pUnit: number, nValue: number): number {
  const v = nValue | 0
  if (pUnit === 0) return (v + v) | 0
  if (m.get(pUnit, D2UnitStrc.dwUnitType) !== UNIT_PLAYER) return (v + v) | 0
  const classId = m.get(pUnit, D2UnitStrc.dwClassId) >>> 0
  if (classId > 6) return v
  switch (classId) {
    case 0:
    case 3:
    case 6:
      return (sar32(v, 1) + v) | 0
    case 4:
      return (v + v) | 0
    default:
      return v
  }
}

/**
 * `@va D2Common:0x6FD737A0` (`D2Common.#10012` `ITEMS_SetInvPage`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nInvPage`, `ret 8`, void).
 */
export function ITEMS_SetInvPage113c(m: Memory113c, pItem: number, nInvPage: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.nInvPage, nInvPage & 0xff)
}

/**
 * `@va D2Common:0x6FD73970` (`D2Common.#10883` `ITEMS_SetRareSuffix`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = wSuffix`, `ret 8`, void).
 */
export function ITEMS_SetRareSuffix113c(m: Memory113c, pItem: number, wSuffix: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.wRareSuffix, wSuffix & 0xffff)
}

/**
 * `@va D2Common:0x6FD739C0` (`D2Common.#10611` `ITEMS_SetRarePrefix`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = wPrefix`, `ret 8`, void).
 */
export function ITEMS_SetRarePrefix113c(m: Memory113c, pItem: number, wPrefix: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.wRarePrefix, wPrefix & 0xffff)
}

/**
 * `@va D2Common:0x6FD73A10` (`D2Common.#10525` `ITEMS_SetMagicSuffix`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = wSuffix`, `[esp+0xC] = nIndex`, `ret 0xC`, void).
 */
export function ITEMS_SetMagicSuffix113c(m: Memory113c, pItem: number, wSuffix: number, nIndex: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.setU16((pItemData + D2ItemDataStrc.wMagicSuffix.off + imul32(nIndex | 0, 2)) >>> 0, wSuffix & 0xffff)
}

/**
 * `@va D2Common:0x6FD73AC0` (`D2Common.#10312` `ITEMS_SetMagicPrefix`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = wPrefix`, `[esp+0xC] = nIndex`, `ret 0xC`, void).
 */
export function ITEMS_SetMagicPrefix113c(m: Memory113c, pItem: number, wPrefix: number, nIndex: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.setU16((pItemData + D2ItemDataStrc.wMagicPrefix.off + imul32(nIndex | 0, 2)) >>> 0, wPrefix & 0xffff)
}

/**
 * `@va D2Common:0x6FD73C50` (`D2Common.#10417` `ITEMS_GetBodyLocation`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AL` = `pItemData->nBodyLoc (+0x44)` or `0`).
 */
export function ITEMS_GetBodyLocation113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return m.get(pItemData, D2ItemDataStrc.nBodyLoc)
}

/**
 * `@va D2Common:0x6FD71F70` (internal LTCG helper `ITEMS_CheckQualityTradable`,
 * custom reg `eax = nVal`, `ret` -> `1` if `nVal != 0 && (nVal <= 3 || nVal > 9)`, else `0`).
 */
export function ITEMS_CheckQualityTradable113c(_m: Memory113c, nVal: number): number {
  const v = nVal | 0
  if (v === 0) return 0
  if (v <= 3 || v > 9) return 1
  return 0
}

/**
 * `@va D2Common:0x6FD71F90` (internal LTCG helper `ITEMS_PackColorIndex`,
 * custom reg `eax, ecx`, `ret` -> `(((al << 5) & 0xff) + (cl & 0x1f)) & 0xff` or `0`).
 */
export function ITEMS_PackColorIndex113c(_m: Memory113c, eax: number, ecx: number): number {
  const a = eax | 0
  const c = ecx | 0
  if (a <= 0 || a >= 9 || c < 0 || c >= 0x15) return 0
  return (((a & 0xff) << 5) + (c & 0x1f)) & 0xff
}

/**
 * `@va D2Common:0x6FD71FF0` (internal LTCG helper `ITEMS_ReturnZero`, 0-arg `xor eax, eax; ret` -> `0`).
 */
export function ITEMS_ReturnZero113c(_m: Memory113c): number {
  return 0
}

/**
 * `@va D2Common:0x6FD72590` (`D2Common.#10572` `ITEMS_GetAutoAffixData`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = pOutField1C`, `[esp+0xC] = pOutField20`, `ret 0xC`, void).
 * Note: unconditionally writes to `pOutField1C` and `pOutField20` on both valid and fallback paths.
 */
export function ITEMS_GetAutoAffixData113c(
  m: Memory113c,
  pItem: number,
  pOutField1C: number,
  pOutField20: number,
): void {
  if (pItem !== 0 && m.get(pItem, D2UnitStrc.dwUnitType) === UNIT_ITEM) {
    const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
    if (pItemData !== 0) {
      m.setU32(pOutField1C >>> 0, m.get(pItemData, D2ItemDataStrc.dwActionStamp))
      m.setU32(pOutField20 >>> 0, m.get(pItemData, D2ItemDataStrc.dwFileIndex))
      return
    }
  }
  m.setU32(pOutField1C >>> 0, 0)
  m.setU32(pOutField20 >>> 0, 0)
}

/**
 * `@va D2Common:0x6FD72F80` (`D2Common.#10108` `ITEMS_GetItemTypeNormal`,
 * stdcall `[esp+4] = nItemType`, `ret 4` -> `D2ItemTypesTxt.nNormal (+0x10)` or `0`).
 */
export function ITEMS_GetItemTypeNormal113c(m: Memory113c, nItemType: number): number {
  const idx = nItemType | 0
  if (idx < 0) return 0
  const sgpt = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  const count = m.u32((sgpt + DATATABLES_ITEMTYPES_COUNT_OFF_113C) >>> 0) | 0
  if (idx >= count) return 0
  const base = m.u32((sgpt + DATATABLES_ITEMTYPES_TXT_OFF_113C) >>> 0)
  const pRec = (base + imul32(idx, D2ItemTypesTxt_SIZE)) >>> 0
  if (pRec === 0) return 0
  return m.get(pRec, D2ItemTypesTxt.nNormal)
}

/**
 * `@va D2Common:0x6FD72FC0` (internal LTCG helper `ITEMS_AccumulateItemLevelReq`,
 * custom reg `eax = nCurrentReq`, `ecx = pItemsTxt`, `edx = pUnit`, `ret` -> `max(nCurrentReq, req)`).
 */
export function ITEMS_AccumulateItemLevelReq113c(
  m: Memory113c,
  nCurrentReq: number,
  pItemsTxt: number,
  pUnit: number,
): number {
  const cur = nCurrentReq | 0
  const rec = pItemsTxt >>> 0
  if (rec === 0) return cur
  const nClass = m.get(rec, D2ItemsTxt.nClass)
  let req: number
  if (nClass !== 0xff && pUnit !== 0 && nClass === m.get(pUnit, D2UnitStrc.dwClassId)) {
    req = m.get(rec, D2ItemsTxt.nClassLevelReq)
  } else {
    req = m.get(rec, D2ItemsTxt.nLevelReq)
  }
  return cur > req ? cur : req
}

/**
 * `@va D2Common:0x6FD735D0` (`D2Common.#10430` `ITEMS_GetItemTypeShoots`,
 * stdcall `[esp+4] = nItemType`, `ret 4` -> sign-extended `D2ItemTypesTxt.wShoots (+0x0E)` or `0`).
 */
export function ITEMS_GetItemTypeShoots113c(m: Memory113c, nItemType: number): number {
  const idx = nItemType | 0
  if (idx < 0) return 0
  const sgpt = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  const count = m.u32((sgpt + DATATABLES_ITEMTYPES_COUNT_OFF_113C) >>> 0) | 0
  if (idx >= count) return 0
  const base = m.u32((sgpt + DATATABLES_ITEMTYPES_TXT_OFF_113C) >>> 0)
  const pRec = (base + imul32(idx, D2ItemTypesTxt_SIZE)) >>> 0
  if (pRec === 0) return 0
  return (m.get(pRec, D2ItemTypesTxt.wShoots) << 16) >> 16
}

/**
 * `@va D2Common:0x6FD73650` (`D2Common.#11019` `ITEMS_SetVarGfxIndex`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nIndex`, `ret 8`, void).
 */
export function ITEMS_SetVarGfxIndex113c(m: Memory113c, pItem: number, nIndex: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.bVarGfxIndex, nIndex & 0xff)
}

/**
 * `@va D2Common:0x6FD73690` (`D2Common.#10467` `ITEMS_SetEarLevel`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nEarLevel`, `ret 8`, void).
 */
export function ITEMS_SetEarLevel113c(m: Memory113c, pItem: number, nEarLevel: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.bEarLevel, nEarLevel & 0xff)
}

/**
 * `@va D2Common:0x6FD736B0` (`D2Common.#10588` `ITEMS_GetEarLevel`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AL` = `pItemData->bEarLevel (+0x48)` or `1`).
 */
export function ITEMS_GetEarLevel113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 1
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 1
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 1
  return m.get(pItemData, D2ItemDataStrc.bEarLevel)
}

/**
 * `@va D2Common:0x6FD736D0` (`D2Common.#10782` `ITEMS_SetEarName`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = szName`, `ret 8`, void).
 */
export function ITEMS_SetEarName113c(m: Memory113c, pItem: number, szName: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  let src = szName >>> 0
  const delta = ((pItemData + D2ItemDataStrc.szPlayerName.off) - src) >>> 0
  let cl: number
  do {
    cl = m.u8(src)
    m.setU8((delta + src) >>> 0, cl)
    src = (src + 1) >>> 0
  } while (cl !== 0)
}

/**
 * `@va D2Common:0x6FD73700` (`D2Common.#10083` `ITEMS_GetEarName`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `(pItemData + 0x4A) >>> 0` or `0`).
 */
export function ITEMS_GetEarName113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return (pItemData + D2ItemDataStrc.szPlayerName.off) >>> 0
}

/**
 * `@va D2Common:0x6FD73720` (`D2Common.#11030` `ITEMS_SetNodePage`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nNodePage`, `ret 8`, void).
 */
export function ITEMS_SetNodePage113c(m: Memory113c, pItem: number, nNodePage: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.bNodePage, nNodePage & 0xff)
}

/**
 * `@va D2Common:0x6FD73740` (`D2Common.#10728` `ITEMS_GetNodePage`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AL` = `pItemData->bNodePage (+0x47)` or `0xFF`).
 */
export function ITEMS_GetNodePage113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0xff
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0xff
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0xff
  return m.get(pItemData, D2ItemDataStrc.bNodePage)
}

/**
 * `@va D2Common:0x6FD73760` (`D2Common.#10152` `ITEMS_SetCmdFlagsByte`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nVal`, `ret 8`, void).
 */
export function ITEMS_SetCmdFlagsByte113c(m: Memory113c, pItem: number, nVal: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.bCmdFlags, nVal & 0xff)
}

/**
 * `@va D2Common:0x6FD737C0` (`D2Common.#10020` `ITEMS_GetInvPage`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AL` = `pItemData->nInvPage (+0x45)` or `0xFF`).
 */
export function ITEMS_GetInvPage113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0xff
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0xff
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0xff
  return m.get(pItemData, D2ItemDataStrc.nInvPage)
}

/**
 * `@va D2Common:0x6FD737E0` (`D2Common.#10377` `ITEMS_SetItemLevel`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nItemLevel`, `ret 8`, void).
 */
export function ITEMS_SetItemLevel113c(m: Memory113c, pItem: number, nItemLevel: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  const lvl = (nItemLevel | 0) >= 1 ? nItemLevel >>> 0 : 1
  m.set(pItemData, D2ItemDataStrc.dwItemLevel, lvl)
}

/**
 * `@va D2Common:0x6FD73810` (`D2Common.#10086` `ITEMS_GetItemLevel`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `pItemData->dwItemLevel (+0x2C)`, clamped to `>= 1` in-place).
 */
export function ITEMS_GetItemLevel113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 1
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 1
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 1
  if ((m.get(pItemData, D2ItemDataStrc.dwItemLevel) | 0) < 1) {
    m.set(pItemData, D2ItemDataStrc.dwItemLevel, 1)
  }
  return m.get(pItemData, D2ItemDataStrc.dwItemLevel)
}

/**
 * `@va D2Common:0x6FD73870` (`D2Common.#10892` `ITEMS_SetItemFlag`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = dwFlag`, `[esp+0xC] = bSet`, `ret 0xC`, void).
 */
export function ITEMS_SetItemFlag113c(
  m: Memory113c,
  pItem: number,
  dwFlag: number,
  bSet: number,
): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  if ((bSet | 0) !== 0) {
    m.set(pItemData, D2ItemDataStrc.dwItemFlags, (m.get(pItemData, D2ItemDataStrc.dwItemFlags) | dwFlag) >>> 0)
  } else {
    m.set(pItemData, D2ItemDataStrc.dwItemFlags, (m.get(pItemData, D2ItemDataStrc.dwItemFlags) & ~dwFlag) >>> 0)
  }
}

/**
 * `@va D2Common:0x6FD738B0` (`D2Common.#11051` `ITEMS_CheckItemFlag`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = dwFlag`, `ret 8` -> `pItemData->dwItemFlags & dwFlag` or `0`).
 */
export function ITEMS_CheckItemFlag113c(m: Memory113c, pItem: number, dwFlag: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return (m.get(pItemData, D2ItemDataStrc.dwItemFlags) & dwFlag) >>> 0
}

/**
 * `@va D2Common:0x6FD738E0` (`D2Common.#10838` `ITEMS_GetCommandFlags`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `pItemData->dwCommandFlags (+0x18)` or `0`).
 */
export function ITEMS_GetCommandFlags113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return m.get(pItemData, D2ItemDataStrc.dwCommandFlags)
}

/**
 * `@va D2Common:0x6FD73900` (`D2Common.#10695` `ITEMS_SetOrClearCommandFlags`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = dwFlag`, `[esp+0xC] = bSet`, `ret 0xC`, void).
 */
export function ITEMS_SetOrClearCommandFlags113c(
  m: Memory113c,
  pItem: number,
  dwFlag: number,
  bSet: number,
): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  if ((bSet | 0) !== 0) {
    m.set(pItemData, D2ItemDataStrc.dwCommandFlags, (m.get(pItemData, D2ItemDataStrc.dwCommandFlags) | dwFlag) >>> 0)
  } else {
    m.set(pItemData, D2ItemDataStrc.dwCommandFlags, (m.get(pItemData, D2ItemDataStrc.dwCommandFlags) & ~dwFlag) >>> 0)
  }
}

/**
 * `@va D2Common:0x6FD73940` (`D2Common.#10700` `ITEMS_CheckCommandFlags`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = dwFlag`, `[esp+0xC] = _u3`, `[esp+0x10] = _u4`, `ret 0x10` -> `pItemData->dwCommandFlags & dwFlag` or `0`).
 */
export function ITEMS_CheckCommandFlags113c(
  m: Memory113c,
  pItem: number,
  dwFlag: number,
  _u3 = 0,
  _u4 = 0,
): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return (m.get(pItemData, D2ItemDataStrc.dwCommandFlags) & dwFlag) >>> 0
}

/**
 * `@va D2Common:0x6FD73990` (`D2Common.#10212` `ITEMS_GetRareSuffix`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AX` = `pItemData->wRareSuffix (+0x34)` or `0`).
 */
export function ITEMS_GetRareSuffix113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return m.get(pItemData, D2ItemDataStrc.wRareSuffix)
}

/**
 * `@va D2Common:0x6FD739E0` (`D2Common.#10185` `ITEMS_GetRarePrefix`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AX` = `pItemData->wRarePrefix (+0x32)` or `0`).
 */
export function ITEMS_GetRarePrefix113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return m.get(pItemData, D2ItemDataStrc.wRarePrefix)
}

/**
 * `@va D2Common:0x6FD73A40` (`D2Common.#11035` `ITEMS_GetMagicSuffix`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nIndex`, `ret 8` -> `AX` = `pItemData->wMagicSuffix[nIndex]` (`+0x3E + nIndex * 2`) or `0`).
 */
export function ITEMS_GetMagicSuffix113c(m: Memory113c, pItem: number, nIndex: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return m.u16((pItemData + D2ItemDataStrc.wMagicSuffix.off + imul32(nIndex | 0, 2)) >>> 0)
}

/**
 * `@va D2Common:0x6FD73A70` (`D2Common.#10188` `ITEMS_SetAutoAffix`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = wAffix`, `ret 8`, void).
 */
export function ITEMS_SetAutoAffix113c(m: Memory113c, pItem: number, wAffix: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.wAutoAffix, wAffix & 0xffff)
}

/**
 * `@va D2Common:0x6FD73A90` (`D2Common.#10506` `ITEMS_GetAutoAffix`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AX` = `pItemData->wAutoAffix (+0x36)` or `0`).
 */
export function ITEMS_GetAutoAffix113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return m.get(pItemData, D2ItemDataStrc.wAutoAffix)
}

/**
 * `@va D2Common:0x6FD73AF0` (`D2Common.#10668` `ITEMS_GetMagicPrefix`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nIndex`, `ret 8` -> `AX` = `pItemData->wMagicPrefix[nIndex]` (`+0x38 + nIndex * 2`) or `0`).
 */
export function ITEMS_GetMagicPrefix113c(m: Memory113c, pItem: number, nIndex: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return m.u16((pItemData + D2ItemDataStrc.wMagicPrefix.off + imul32(nIndex | 0, 2)) >>> 0)
}

/**
 * `@va D2Common:0x6FD73B20` (`D2Common.#10510` `ITEMS_SetItemQuality`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nQuality`, `ret 8`, void).
 */
export function ITEMS_SetItemQuality113c(m: Memory113c, pItem: number, nQuality: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.dwQuality, nQuality >>> 0)
}

/**
 * `@va D2Common:0x6FD73B40` (`D2Common.#10627` `ITEMS_GetItemQuality`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `pItemData->dwQuality (+0x00)` or `2`).
 */
export function ITEMS_GetItemQuality113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 2
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 2
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 2
  return m.get(pItemData, D2ItemDataStrc.dwQuality)
}

/**
 * `@va D2Common:0x6FD73BC0` (`D2Common.#10145` `ITEMS_GetOwnerGuid`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `pItemData->dwOwnerGuid (+0x10)` or `0`).
 */
export function ITEMS_GetOwnerGuid113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return m.get(pItemData, D2ItemDataStrc.dwOwnerGuid)
}

/**
 * `@va D2Common:0x6FD73BE0` (`D2Common.#10073` `ITEMS_InitItemSeed`,
 * stdcall `[esp+4] = pItem`, `ret 4`, void: sets `dwSeedLo = 1`, `dwSeedHi = 666`).
 */
export function ITEMS_InitItemSeed113c(m: Memory113c, pItem: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.dwSeedLo, 1)
  m.set(pItemData, D2ItemDataStrc.dwSeedHi, 0x29a)
}

/**
 * `@va D2Common:0x6FD73C10` (`D2Common.#10690` `ITEMS_GetItemSeed`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `(pItemData + 0x04) >>> 0` or `0`).
 */
export function ITEMS_GetItemSeed113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return (pItemData + D2ItemDataStrc.dwSeedLo.off) >>> 0
}

/**
 * `@va D2Common:0x6FD73C30` (`D2Common.#10075` `ITEMS_SetBodyLocation`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nBodyLoc`, `ret 8`, void).
 */
export function ITEMS_SetBodyLocation113c(m: Memory113c, pItem: number, nBodyLoc: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return
  m.set(pItemData, D2ItemDataStrc.nBodyLoc, nBodyLoc & 0xff)
}

/**
 * `@va D2Common:0x6FD73D50` (internal LTCG fastcall helper `ITEMS_MaxIntFastcall`,
 * `ecx = a`, `edx = b`, `ret 8` -> signed `a > b ? a : b`).
 */
export function ITEMS_MaxIntFastcall113c(
  _m: Memory113c,
  a: number,
  b: number,
  _s0 = 0,
  _s1 = 0,
): number {
  const x = a | 0
  const y = b | 0
  return (x > y ? x : y) >>> 0
}

/**
 * `@va D2Common:0x6FD73D60` (internal LTCG fastcall helper `ITEMS_MinIntFastcall`,
 * `ecx = a`, `edx = b`, `ret 8` -> signed `a < b ? a : b`).
 */
export function ITEMS_MinIntFastcall113c(
  _m: Memory113c,
  a: number,
  b: number,
  _s0 = 0,
  _s1 = 0,
): number {
  const x = a | 0
  const y = b | 0
  return (x < y ? x : y) >>> 0
}

/**
 * `@va D2Common:0x6FD73E00` (`D2Common.#11099` `ITEMS_CheckEtherealFlag`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `(pItemData->dwCommandFlags & 0x400000) >>> 0` or `0`).
 */
export function ITEMS_CheckEtherealFlag113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  return (m.get(pItemData, D2ItemDataStrc.dwCommandFlags) & 0x400000) >>> 0
}

/**
 * `@va D2Common:0x6FD73E30` (`D2Common.#10640` `ITEMS_CountEquippedOrCarryItems`,
 * stdcall `[esp+4] = pUnit`, `ret 4` -> count of non-hidden items in `pUnit->pInventory`
 * where `nodePos == 3` or (`nodePos == 1 && (nInvPage == 0 || nInvPage == 3)`)).
 * Note: unconditionally dereferences `pUnit + 0x60` (`pInventory`).
 */
export function ITEMS_CountEquippedOrCarryItems113c(m: Memory113c, pUnit: number): number {
  const pInv = m.get(pUnit, D2UnitStrc.pInventory)
  let count = 0
  let pItem =
    pInv !== 0 && m.get(pInv, D2InventoryStrc.dwSignature) === INVENTORY_SIGNATURE_113C
      ? m.get(pInv, D2InventoryStrc.pFirstItem)
      : 0
  while (pItem !== 0) {
    if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) break
    const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
    if (pItemData === 0) break
    const pExtra = (pItemData + D2ItemDataStrc.pExtraOwnerInventory.off) >>> 0
    if ((m.get(pItemData, D2ItemDataStrc.dwCommandFlags) & 0x10) === 0) {
      const nodePos = (m.u8((pExtra + ITEM_EXTRA_NODEPOS_OFF_113C) >>> 0) << 24) >> 24
      if (nodePos === 3) {
        count = (count + 1) >>> 0
      } else if (nodePos === 1) {
        const invPage = m.get(pItemData, D2ItemDataStrc.nInvPage)
        if (invPage === 0 || invPage === 3) {
          count = (count + 1) >>> 0
        }
      }
    }
    pItem = m.u32((pExtra + ITEM_EXTRA_NEXT_ITEM_OFF_113C) >>> 0)
  }
  return count >>> 0
}

/**
 * `@va D2Common:0x6FD741A0` (internal LTCG helper `ITEMS_HasSocketedItems`,
 * custom reg `eax = pItem`, `ret` -> `1` if `pItem->pInventory` has a valid first item with `dwUnitType == 4`, else `0`).
 * Note: unconditionally dereferences `pItem + 0x60` (`pInventory`).
 */
export function ITEMS_HasSocketedItems113c(m: Memory113c, pItem: number): number {
  const pInv = m.get(pItem, D2UnitStrc.pInventory)
  if (pInv === 0 || m.get(pInv, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  const pFirst = m.get(pInv, D2InventoryStrc.pFirstItem)
  if (pFirst === 0 || m.get(pFirst, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  return 1
}

/**
 * `@va D2Common:0x6FD74210` (`D2Common.#10516` `ITEMS_IsHighQualityItem`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `1` if `4 <= dwQuality <= 9`, else `0`).
 */
export function ITEMS_IsHighQualityItem113c(m: Memory113c, pItem: number): number {
  let qual = 2
  if (pItem !== 0 && m.get(pItem, D2UnitStrc.dwUnitType) === UNIT_ITEM) {
    const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
    if (pItemData !== 0) {
      qual = m.get(pItemData, D2ItemDataStrc.dwQuality) | 0
    }
  }
  if (qual < 4 || qual > 9) return 0
  return 1
}

/**
 * `@va D2Common:0x6FDA3020` (`D2Common.#10079` `DATATBLS_FindCodeRecord4C`,
 * stdcall `[esp+4] = dwCode`, `ret 4` -> record pointer `base + i * 0x4C` where `*(u32*)(base + i * 0x4C) == dwCode`, or `0`).
 */
export function DATATBLS_FindCodeRecord4C113c(m: Memory113c, dwCode: number): number {
  const count = m.u32(DATATBLS_CODE_TABLE_COUNT_VA_113C) | 0
  if (count <= 0) return 0
  let ptr = m.u32(DATATBLS_CODE_TABLE_PTR_VA_113C)
  const code = dwCode >>> 0
  for (let i = 0; i < count; i++) {
    if (m.u32(ptr) === code) return ptr >>> 0
    ptr = (ptr + 0x4c) >>> 0
  }
  return 0
}

// ============================================================================
// K1r2 Iteration 6 Lane B — Batch B027 (15 D2Common hostImport functions)
// ============================================================================

function lookupItemsTxtRecord113c(m: Memory113c, nItemId: number): number {
  if (nItemId >>> 0 >= m.u32(ITEMS_TXT_COUNT_VA_113C)) return 0
  const base = m.u32(ITEMS_TXT_PTR_VA_113C)
  if (base === 0) {
    throw new D2CommonAssertError('DataTbls.cpp', 0x1ef)
  }
  return (base + imul32(nItemId, D2ItemsTxt_SIZE)) >>> 0
}

function lookupItemsTxtInlineOrAssert113c(m: Memory113c, nItemId: number, assertLine: number): number {
  if (nItemId >>> 0 >= m.u32(ITEMS_TXT_COUNT_VA_113C)) {
    throw new D2CommonAssertError('Items.cpp', assertLine)
  }
  const base = m.u32(ITEMS_TXT_PTR_VA_113C)
  if (base === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1ef)
  }
  const pRec = (base + imul32(nItemId, D2ItemsTxt_SIZE)) >>> 0
  if (pRec === 0) {
    throw new D2CommonAssertError('Items.cpp', assertLine)
  }
  return pRec
}

/**
 * `@va D2Common:0x6FD721C0` (`D2Common.#10207` `ITEMS_GetItemFormat`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AX` = `pItemData->wItemFormat (+0x30)`).
 */
export function ITEMS_GetItemFormat113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1505)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x1506)
  }
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1508)
  }
  return m.get(pItemData, D2ItemDataStrc.wItemFormat)
}

/**
 * `@va D2Common:0x6FD722B0` (internal LTCG helper `ITEMS_GetItemDropSound`,
 * custom reg `eax = pItem`, `ret` -> `D2ItemsTxt.nDropSound (+0x143)`).
 */
export function ITEMS_GetItemDropSound113c(m: Memory113c, pItem: number): number {
  const nItemId = pItem !== 0 ? m.get(pItem, D2UnitStrc.dwClassId) : 0xffffffff
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0x12e1)
  return m.get(pRec, D2ItemsTxt.nDropSound)
}

/**
 * `@va D2Common:0x6FD72380` (`D2Common.#10831` `ITEMS_GetQuestItemByte`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AL` = `D2ItemsTxt.bQuest (+0x13C)`).
 */
export function ITEMS_GetQuestItemByte113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1190)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x1191)
  }
  const pRec = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  if (pRec === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1193)
  }
  return m.get(pRec, D2ItemsTxt.bQuest)
}

/**
 * `@va D2Common:0x6FD72640` (`D2Common.#10434` `ITEMS_GetItemCell`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `pItemData->dwItemCell (+0x28)`).
 */
export function ITEMS_GetItemCell113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1071)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x1072)
  }
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1074)
  }
  return m.get(pItemData, D2ItemDataStrc.dwItemCell)
}

/**
 * `@va D2Common:0x6FD72690` (`D2Common.#10626` `ITEMS_IsScrollOrTome`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `0` if `nComponent >= 1` or `wType1 == 0x27`, else `1`).
 */
export function ITEMS_IsScrollOrTome113c(m: Memory113c, nItemId: number): number {
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0x105f)
  if (m.get(pRec, D2ItemsTxt.nComponent) >= 1) return 0
  const wType1 = (m.get(pRec, D2ItemsTxt.wType1) << 16) >> 16
  return wType1 !== 0x27 ? 1 : 0
}

/**
 * `@va D2Common:0x6FD727C0` (`D2Common.#10035` `ITEMS_IsThrowableBit`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `D2ItemsTxt.dwBitField1 (+0xDC) & 1`).
 */
export function ITEMS_IsThrowableBit113c(m: Memory113c, nItemId: number): number {
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0x1041)
  return (m.get(pRec, D2ItemsTxt.dwBitField1) & 1) >>> 0
}

/**
 * `@va D2Common:0x6FD72880` (`D2Common.#10394` `ITEMS_GetGemApplyType`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `D2ItemsTxt.nGemApplyType (+0x13E)`).
 */
export function ITEMS_GetGemApplyType113c(m: Memory113c, nItemId: number): number {
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0xf29)
  return m.get(pRec, D2ItemsTxt.nGemApplyType)
}

/**
 * `@va D2Common:0x6FD728D0` (`D2Common.#11044` `ITEMS_GetBeltTypeIndex`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `AL` = `D2ItemsTxt.bBelt (+0x138)` or `0` on out-of-range).
 */
export function ITEMS_GetBeltTypeIndex113c(m: Memory113c, nItemId: number): number {
  if (nItemId >>> 0 >= m.u32(ITEMS_TXT_COUNT_VA_113C)) return 0
  const base = m.u32(ITEMS_TXT_PTR_VA_113C)
  if (base === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1ef)
  }
  const pRec = (base + imul32(nItemId, D2ItemsTxt_SIZE)) >>> 0
  if (pRec === 0) return 0
  return m.get(pRec, D2ItemsTxt.bBelt)
}

/**
 * `@va D2Common:0x6FD72920` (`D2Common.#10530` `ITEMS_GetSubTypeByte`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `D2ItemsTxt.nSubType (+0x137)` or `0` on out-of-range).
 */
export function ITEMS_GetSubTypeByte113c(m: Memory113c, nItemId: number): number {
  if (nItemId >>> 0 >= m.u32(ITEMS_TXT_COUNT_VA_113C)) return 0
  const base = m.u32(ITEMS_TXT_PTR_VA_113C)
  if (base === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x1ef)
  }
  const pRec = (base + imul32(nItemId, D2ItemsTxt_SIZE)) >>> 0
  if (pRec === 0) return 0
  return m.get(pRec, D2ItemsTxt.nSubType)
}

/**
 * `@va D2Common:0x6FD72AD0` (`D2Common.#10212` `ITEMS_GetGambleCost`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `D2ItemsTxt.dwGambleCost (+0xE4)`).
 */
export function ITEMS_GetGambleCost113c(m: Memory113c, nItemId: number): number {
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0xd8b)
  return m.get(pRec, D2ItemsTxt.dwGambleCost)
}

/**
 * `@va D2Common:0x6FD72B20` (`D2Common.#11068` `ITEMS_GetBitField2`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `D2ItemsTxt.dwBitField2 (+0xEC)`).
 */
export function ITEMS_GetBitField2113c(m: Memory113c, nItemId: number): number {
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0xd6d)
  return m.get(pRec, D2ItemsTxt.dwBitField2)
}

/**
 * `@va D2Common:0x6FD72B70` (`D2Common.#10011` `ITEMS_GetBaseSpeed`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `D2ItemsTxt.dwSpeed (+0xE8)`).
 */
export function ITEMS_GetBaseSpeed113c(m: Memory113c, nItemId: number): number {
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0xd50)
  return m.get(pRec, D2ItemsTxt.dwSpeed)
}

/**
 * `@va D2Common:0x6FD72BC0` (`D2Common.#10489` `ITEMS_GetComponentByte`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `D2ItemsTxt.nComponent (+0x12A)`).
 */
export function ITEMS_GetComponentByte113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x9db)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x9dc)
  }
  const pRec = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  if (pRec === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x9df)
  }
  return m.get(pRec, D2ItemsTxt.nComponent)
}

/**
 * `@va D2Common:0x6FD72E20` (`D2Common.#10765` `ITEMS_GetTwoHandedFlag`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `D2ItemsTxt.nTwoHanded (+0x132)` or `0` on NULL / non-item).
 */
export function ITEMS_GetTwoHandedFlag113c(m: Memory113c, pItem: number): number {
  if (pItem === 0 || m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pRec = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  if (pRec === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x923)
  }
  return m.get(pRec, D2ItemsTxt.nTwoHanded)
}

/**
 * `@va D2Common:0x6FD72FF0` (`D2Common.#10602` `ITEMS_GetAltGfxOrBaseCode`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `dwAlternateGfx (+0x84)` if non-zero else `dwCode (+0x80)`).
 * Note: binary has no `pRec == 0` guard after `0x6FDC19A0` and dereferences `[eax+0x84]` directly.
 */
export function ITEMS_GetAltGfxOrBaseCode113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x798)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x799)
  }
  const pRec = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  const alt = m.get(pRec, D2ItemsTxt.dwAlternateGfx)
  if (alt !== 0) return alt >>> 0
  return m.get(pRec, D2ItemsTxt.dwCode) >>> 0
}

// ============================================================================
// K1r2 Iteration 6 Lane B — Batch B030 (14 D2Common hostImport functions)
// ============================================================================

/** `Fog.#10128` (`0x6FF64120`): writes `nBits` of `nValue` into `D2BitBufferStrc` (`pBitStream`). */
function fogWriteBits113c(m: Memory113c, pBitStream: number, nValue: number, nBits: number): void {
  const esi = pBitStream >>> 0
  const ecx = m.u32((esi + 0x0c) >>> 0) | 0
  const edx = m.u32((esi + 0x08) >>> 0) | 0
  const eax = m.u32((esi + 0x04) >>> 0) | 0
  let ebp = nBits | 0
  const newBitTotal = (ecx + (edx << 3) + ebp) | 0
  if (newBitTotal > eax) {
    m.setU32((esi + 0x10) >>> 0, 1)
    m.setU32((esi + 0x08) >>> 0, sar32((eax + ((eax >> 31) & 7)) | 0, 3) >>> 0)
    m.setU32((esi + 0x0c) >>> 0, 0)
    return
  }
  if (ecx === 0) {
    m.setU8(m.u32((esi + 0x00) >>> 0), 0)
  }
  if (ebp <= 0) return
  let ebx = nValue | 0
  while (ebp > 0) {
    const curBit = m.u32((esi + 0x0c) >>> 0) | 0
    let chunk = (8 - curBit) | 0
    if (chunk > ebp) chunk = ebp
    const mask = ((1 << chunk) - 1) & 0xff
    const edi = m.u32((esi + 0x00) >>> 0)
    const dl = ((ebx & mask) << (curBit & 31)) & 0xff
    m.setU8(edi, (m.u8(edi) | dl) & 0xff)
    const nextBit = (curBit + chunk) | 0
    m.setU32((esi + 0x0c) >>> 0, nextBit >>> 0)
    if (nextBit === 8) {
      const newBuf = (m.u32((esi + 0x00) >>> 0) + 1) >>> 0
      const newPos = (m.u32((esi + 0x08) >>> 0) + 1) | 0
      const maxBits = m.u32((esi + 0x04) >>> 0) | 0
      m.setU32((esi + 0x08) >>> 0, newPos >>> 0)
      m.setU32((esi + 0x00) >>> 0, newBuf)
      m.setU32((esi + 0x0c) >>> 0, 0)
      if ((newPos << 3) < maxBits) {
        m.setU8(newBuf, 0)
      }
    }
    ebp = (ebp - chunk) | 0
    ebx = sar32(ebx, chunk & 31)
  }
}

/** `Fog.#10130` (`0x6FF64100` -> `0x6FF63CD0`): reads `nBits` unsigned from `D2BitBufferStrc`. */
function fogReadBitsUnsigned113c(m: Memory113c, pBitStream: number, nBits: number): number {
  const esi = pBitStream >>> 0
  const eax = m.u32((esi + 0x08) >>> 0) | 0
  const ecx = m.u32((esi + 0x0c) >>> 0) | 0
  let ebp = nBits | 0
  let overflow = ((eax << 3) - (m.u32((esi + 0x04) >>> 0) | 0) + ebp + ecx) | 0
  if (overflow < 0) overflow = 0
  ebp = (ebp - overflow) | 0
  if (overflow !== 0) {
    m.setU32((esi + 0x10) >>> 0, 1)
  }
  let result = 0
  let shift = 0
  if (ebp <= 0) return 0
  while (ebp > 0) {
    const curBit = m.u32((esi + 0x0c) >>> 0) | 0
    let edx = (8 - curBit) | 0
    if (edx > ebp) edx = ebp
    const ebx = m.u32((esi + 0x0c) >>> 0) | 0
    const edi = m.u32((esi + 0x00) >>> 0)
    const byteVal = m.u8(edi)
    const highMask = (0xff << (ebx & 7)) & 0xff
    const extracted = ((byteVal & highMask) >>> (ebx & 31)) & ((1 << edx) - 1)
    result = (result + ((extracted << (shift & 31)) >>> 0)) >>> 0
    shift = (shift + edx) | 0
    ebp = (ebp - edx) | 0
    const nextBit = (ebx + edx) | 0
    m.setU32((esi + 0x0c) >>> 0, nextBit >>> 0)
    if (nextBit === 8) {
      m.setU32((esi + 0x00) >>> 0, (edi + 1) >>> 0)
      m.setU32((esi + 0x0c) >>> 0, 0)
      m.setU32((esi + 0x08) >>> 0, (m.u32((esi + 0x08) >>> 0) + 1) >>> 0)
    }
  }
  return result >>> 0
}

/** `Fog.#10213` (`0x6FF61F00`): binary-searches sorted 8-byte `{dwCode, nIndex}` table at `pLink`. */
function fogGetLinkIndex113c(m: Memory113c, pLink: number, dwCode: number): number {
  const esi = m.u32((pLink + 0x00) >>> 0) | 0
  const edi = m.u32((pLink + 0x08) >>> 0)
  const ebx = dwCode >>> 0
  let low = 0
  let high = esi
  if (high <= 0) return -1
  while (low < high) {
    const diff = (high - low) | 0
    const mid = (low + sar32((diff - (diff >> 31)) | 0, 1)) | 0
    const entryCode = m.u32((edi + mid * 8) >>> 0)
    if (ebx > entryCode) {
      low = (mid + 1) | 0
    } else if (ebx === entryCode) {
      return m.u32((edi + mid * 8 + 4) >>> 0) | 0
    } else {
      high = mid
    }
  }
  return -1
}

function checkItemTypeEquivMem113c(m: Memory113c, pItem: number, nItemType: number): number {
  const targetType = nItemType | 0
  if (targetType === 0) return 1
  if (pItem === 0 || m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pRec = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  if (pRec === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x670)
  }
  const wType1 = (m.get(pRec, D2ItemsTxt.wType1) << 16) >> 16
  const sgpt = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  let matched = 0
  if (wType1 > 0 && targetType > 0) {
    const typeCount = m.u32((sgpt + DATATABLES_OFF_113C.nItemTypesTxtRecordCount) >>> 0) | 0
    if (wType1 < typeCount && targetType < typeCount) {
      const equivDwords = m.u32((sgpt + DATATABLES_OFF_113C.nItemTypesEquivDwords) >>> 0)
      const pEquiv = m.u32((sgpt + DATATABLES_OFF_113C.pItemTypesEquiv) >>> 0)
      const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
      const mask = m.u32((pBitMasks + ((targetType & 0x1f) << 2)) >>> 0)
      const wordIdx = (imul32(wType1, equivDwords) + (targetType >> 5)) >>> 0
      matched = (m.u32((pEquiv + (wordIdx << 2)) >>> 0) & mask) !== 0 ? 1 : 0
    }
  }
  if (matched !== 0) return 1
  const pRec2 = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  if (pRec2 === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x680)
  }
  const wType2 = (m.get(pRec2, D2ItemsTxt.wType2) << 16) >> 16
  if (wType2 <= 0 || targetType <= 0) return 0
  const sgpt2 = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  const typeCount2 = m.u32((sgpt2 + DATATABLES_OFF_113C.nItemTypesTxtRecordCount) >>> 0) | 0
  if (wType2 >= typeCount2 || targetType >= typeCount2) return 0
  const equivDwords2 = m.u32((sgpt2 + DATATABLES_OFF_113C.nItemTypesEquivDwords) >>> 0)
  const pEquiv2 = m.u32((sgpt2 + DATATABLES_OFF_113C.pItemTypesEquiv) >>> 0)
  const pBitMasks2 = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
  const mask2 = m.u32((pBitMasks2 + ((targetType & 0x1f) << 2)) >>> 0)
  const wordIdx2 = (imul32(wType2, equivDwords2) + (targetType >> 5)) >>> 0
  return (m.u32((pEquiv2 + (wordIdx2 << 2)) >>> 0) & mask2) !== 0 ? 1 : 0
}

function checkIfThrowItemMem113c(m: Memory113c, pItem: number): number {
  if (pItem === 0 || m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const wType1 = ITEMS_IsTome113c(m, m.get(pItem, D2UnitStrc.dwClassId)) | 0
  if (wType1 < 0) return 0
  const sgpt = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  const count = m.u32((sgpt + DATATABLES_OFF_113C.nItemTypesTxtRecordCount) >>> 0) | 0
  if (wType1 >= count) return 0
  const pTypeRec = (m.u32((sgpt + DATATABLES_OFF_113C.pItemTypesTxt) >>> 0) + imul32(wType1, D2ItemTypesTxt_SIZE)) >>> 0
  if (pTypeRec === 0) return 0
  return m.u8((pTypeRec + 0x10) >>> 0)
}

function getUnitBaseStatWithIscCheck113c(m: Memory113c, pItem: number, nStatId: number, nLayer: number): number {
  if (pItem === 0 || nStatId < 0) return 0
  const sgpt = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  if (nStatId >= (m.u32((sgpt + DATATABLES_OFF_113C.nItemStatCostTxtRecordCount) >>> 0) | 0)) return 0
  const pIscRec = (m.u32((sgpt + DATATABLES_OFF_113C.pItemStatCostTxt) >>> 0) + imul32(nStatId, D2ItemStatCostTxt_SIZE)) >>> 0
  if (pIscRec === 0) return 0
  return STATLIST_GetUnitBaseStat113c(m, pItem, nStatId, nLayer)
}

/**
 * `@va D2Common:0x6FD730A0` (`D2Common.#10731` `ITEMS_IsTome`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> sign-extended `D2ItemsTxt.wType1 (+0x11E)`).
 */
export function ITEMS_IsTome113c(m: Memory113c, nItemId: number): number {
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0x68e)
  return ((m.get(pRec, D2ItemsTxt.wType1) << 16) >> 16) >>> 0
}

/**
 * `@va D2Common:0x6FD73290` (`D2Common.#10001` `ITEMS_GetBaseCode`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `D2ItemsTxt.dwCode (+0x80)`).
 */
export function ITEMS_GetBaseCode113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x61b)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x61c)
  }
  const pRec = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  if (pRec === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x61f)
  }
  return m.get(pRec, D2ItemsTxt.dwCode) >>> 0
}

/**
 * `@va D2Common:0x6FD73B70` (`D2Common.#10287` `ITEMS_SetOwnerGuid`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = dwOwnerGuid`, `ret 8`, void).
 */
export function ITEMS_SetOwnerGuid113c(m: Memory113c, pItem: number, dwOwnerGuid: number): void {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x188)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x189)
  }
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x18c)
  }
  m.set(pItemData, D2ItemDataStrc.dwOwnerGuid, dwOwnerGuid >>> 0)
}

/**
 * `@va D2Common:0x6FD73C70` (`D2Common.#10854` `ITEMS_AllocItemData`,
 * stdcall `[esp+4] = pMemPool`, `[esp+8] = pItem`, `ret 8`, void).
 */
export function ITEMS_AllocItemData113c(m: Memory113c, _pMemPool: number, pItem: number): void {
  if (pItem === 0) return
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return
  const pData = m.alloc(D2ItemDataStrc_SIZE)
  if (pData === 0) {
    throw new D2CommonAssertError('Items.cpp', 0xd6)
  }
  m.fill(pData, D2ItemDataStrc_SIZE, 0)
  m.set(pData, D2ItemDataStrc.dwInitSeed, 0xffffffff)
  m.set(pItem, D2UnitStrc.pUnitData, pData)
}

/**
 * `@va D2Common:0x6FD73DD0` (internal LTCG helper `ITEMS_WriteBitsClamped`,
 * custom reg `esi = nBits`, `edx = nValue`, stack `[esp+4] = pBitStream`, `ret 4`, void).
 */
export function ITEMS_WriteBitsClamped113c(
  m: Memory113c,
  nBits: number,
  nValue: number,
  pBitStream: number,
): void {
  let val = nValue | 0
  const bits = nBits | 0
  if (bits !== 0x20) {
    const maxVal = ((1 << (bits & 31)) - 1) | 0
    const mask = val <= 0 ? 0 : -1
    val = val & mask
    if (val >= maxVal) {
      val = maxVal
    }
  }
  fogWriteBits113c(m, pBitStream >>> 0, val, bits)
}

/**
 * `@va D2Common:0x6FD74320` (`D2Common.#10627` `ITEMS_CheckItemTypeRarityUnder7`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `1` if `D2ItemTypesTxt[wType1].nRarity < 7`, else `0`).
 */
export function ITEMS_CheckItemTypeRarityUnder7113c(m: Memory113c, nItemId: number): number {
  const pRec = lookupItemsTxtInlineOrAssert113c(m, nItemId, 0x68e)
  const wType1 = (m.get(pRec, D2ItemsTxt.wType1) << 16) >> 16
  if (wType1 < 0) return 0
  const sgpt = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  const count = m.u32((sgpt + DATATABLES_ITEMTYPES_COUNT_OFF_113C) >>> 0) | 0
  if (wType1 >= count) return 0
  const base = m.u32((sgpt + DATATABLES_ITEMTYPES_TXT_OFF_113C) >>> 0)
  const pTypeRec = (base + imul32(wType1, D2ItemTypesTxt_SIZE)) >>> 0
  if (pTypeRec === 0) return 0
  return m.get(pTypeRec, D2ItemTypesTxt.nRarity) < 7 ? 1 : 0
}

/**
 * `@va D2Common:0x6FD74A50` (internal LTCG helper `ITEMS_AccumulateSocketedItemCosts`,
 * custom reg `eax = pItem`, stack `[esp+4] = pOutCost1`, `[esp+8] = pOutCost2`, `[esp+0xC] = pOutCost3`, `ret 0xC`, void).
 */
export function ITEMS_AccumulateSocketedItemCosts113c(
  m: Memory113c,
  pItem: number,
  pOutCost1: number,
  pOutCost2: number,
  pOutCost3: number,
): void {
  const pInv = m.get(pItem, D2UnitStrc.pInventory)
  if (pInv === 0) return
  let sum = 0
  if (m.get(pInv, D2InventoryStrc.dwSignature) === INVENTORY_SIGNATURE_113C) {
    let ecx = m.get(pInv, D2InventoryStrc.pFirstItem)
    if (ecx !== 0) {
      const pItemsTxtBase = m.u32(ITEMS_TXT_PTR_VA_113C)
      while (ecx !== 0) {
        const uType = m.get(ecx, D2UnitStrc.dwUnitType)
        const edx = uType === UNIT_ITEM ? ecx : 0
        let nextItem = 0
        if (uType === UNIT_ITEM) {
          const pData = m.get(ecx, D2UnitStrc.pUnitData)
          if (pData !== 0) {
            const pExtra = (pData + D2ItemDataStrc.pExtraOwnerInventory.off) >>> 0
            if (pExtra !== 0) {
              nextItem = m.u32((pExtra + ITEM_EXTRA_NEXT_ITEM_OFF_113C) >>> 0)
            }
          }
        }
        ecx = nextItem
        if (edx !== 0) {
          const itemId = m.get(edx, D2UnitStrc.dwClassId)
          let pRec = 0
          if (itemId >>> 0 < m.u32(ITEMS_TXT_COUNT_VA_113C)) {
            if (pItemsTxtBase === 0) {
              throw new D2CommonAssertError('Items.cpp', 0x1ef)
            }
            pRec = (pItemsTxtBase + imul32(itemId, D2ItemsTxt_SIZE)) >>> 0
          }
          const cost = m.get(pRec, D2ItemsTxt.dwCost) | 0
          const half = sar32((cost - (cost >> 31)) | 0, 1)
          sum = (sum + half) | 0
        }
      }
    }
  }
  m.setU32(pOutCost1 >>> 0, (m.u32(pOutCost1 >>> 0) + sum) >>> 0)
  m.setU32(pOutCost2 >>> 0, (m.u32(pOutCost2 >>> 0) + sum) >>> 0)
  m.setU32(pOutCost3 >>> 0, (m.u32(pOutCost3 >>> 0) + sum) >>> 0)
}

/**
 * `@va D2Common:0x6FD76080` (`D2Common.#10815` `ITEMS_GetMaxSockets`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `STAT_ITEM_NUMSOCKETS (0xC2)` or `0`).
 */
export function ITEMS_GetMaxSockets113c(m: Memory113c, pItem: number): number {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0xea7)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0xea8)
  }
  const pStatListEx = m.get(pItem, D2UnitStrc.pStatListEx)
  if (pStatListEx === 0) return 0
  const sgpt = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  if ((m.u32((sgpt + DATATABLES_OFF_113C.nItemStatCostTxtRecordCount) >>> 0) | 0) <= 0xc2) return 0
  const pIscRec = (m.u32((sgpt + DATATABLES_OFF_113C.pItemStatCostTxt) >>> 0) + 0xf588) >>> 0
  if (pIscRec === 0) return 0
  return STATLIST_GetUnitStat113c(m, pItem, 0xc2, 0) >>> 0
}

/**
 * `@va D2Common:0x6FD79D90` (internal LTCG helper `ITEMS_DecodeAndSetSaveStat`,
 * custom reg `eax = nSaveSlot`, `ecx = nVersion`, `esi = pIscRec`,
 * stack `[esp+4] = pBitStream`, `[esp+8] = pStatList`, `[esp+0xC] = nStatId`, `ret 0xC`, void).
 */
export function ITEMS_DecodeAndSetSaveStat113c(
  m: Memory113c,
  nSaveSlot: number,
  nVersion: number,
  pIscRec: number,
  pBitStream: number,
  pStatList: number,
  nStatId: number,
): void {
  const slot = nSaveSlot | 0
  const ver = nVersion >>> 0
  const isc = pIscRec >>> 0
  const saveParamBits = m.get(isc, D2ItemStatCostTxt.dwSaveParamBits, slot) | 0
  let saveAdd = m.get(isc, D2ItemStatCostTxt.dwSaveAdd, slot) | 0
  let statId = nStatId | 0
  let saveBits = m.get(isc, D2ItemStatCostTxt.nSaveBits, slot)

  switch (statId) {
    case 0x17:
      if (ver <= 0x59) saveBits = 5
      break
    case 0x18:
      if (ver <= 0x59) saveBits = 6
      break
    case 0x4a:
      if (ver <= 0x59) {
        saveBits = 5
        saveAdd = 0x0a
      }
      break
    case 0x4f:
      if (ver <= 0x59) {
        saveBits = 8
        saveAdd = 0x14
      }
      break
    case 0x50:
      if (ver <= 0x59) {
        saveBits = 7
        saveAdd = 0x14
      }
      break
    case 0x5d:
    case 0x60:
    case 0x63:
    case 0x66:
    case 0x69:
      if (ver <= 0x57) saveBits = 6
      break
    case 0x5c:
    case 0x5e:
      if (ver < 0x5d) statId = 0x5d
      break
    case 0x5f:
    case 0x61:
      if (ver < 0x5d) statId = 0x60
      break
    case 0x62:
    case 0x64:
      if (ver < 0x5d) statId = 0x63
      break
    case 0x65:
    case 0x67:
      if (ver < 0x5d) statId = 0x66
      break
    case 0x68:
    case 0x6a:
      if (ver < 0x5d) statId = 0x69
      break
    default:
      break
  }

  let param = 0
  if (saveParamBits > 0) {
    param = fogReadBitsUnsigned113c(m, pBitStream >>> 0, saveParamBits)
  }
  const rawVal = (fogReadBitsUnsigned113c(m, pBitStream >>> 0, saveBits) - saveAdd) | 0
  if (pStatList !== 0) {
    const shift = m.get(isc, D2ItemStatCostTxt.bValShift)
    STATLIST_SetStat113c(m, pStatList >>> 0, statId, (rawVal << (shift & 31)) | 0, param)
  }
}

/**
 * `@va D2Common:0x6FD79F30` (internal LTCG helper `ITEMS_EnsureMinimumBaseDamageAndACStats`,
 * custom reg `esi = pItem`, stack `[esp+4] = nStatId`, `ret 4`, void).
 */
export function ITEMS_EnsureMinimumBaseDamageAndACStats113c(
  m: Memory113c,
  pItem: number,
  nStatId: number,
): void {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x61b)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x61c)
  }
  const pRec = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  if (pRec === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x61f)
  }
  const dwCode = m.get(pRec, D2ItemsTxt.dwCode)
  const idx = fogGetLinkIndex113c(m, m.u32(ITEMS_LINK_PTR_VA_113C), dwCode)
  if (idx < 0) return
  const pBaseRec = (m.u32(ITEMS_TXT_PTR_VA_113C) + imul32(idx, D2ItemsTxt_SIZE)) >>> 0
  if (pBaseRec === 0) return

  switch (nStatId | 0) {
    case 0x10:
    case 0x1f: {
      if (checkItemTypeEquivMem113c(m, pItem, 0x32) === 0) return
      const minAc = m.get(pBaseRec, D2ItemsTxt.nMinAc) | 0
      if (minAc === 0) return
      let val = (getUnitBaseStatWithIscCheck113c(m, pItem, 0x1f, 0) + 1) | 0
      if (val <= minAc) {
        val = (minAc + 1) | 0
      }
      STATLIST_SetUnitStat113c(m, pItem, 0x1f, val, 0)
      return
    }
    case 0x11:
    case 0x16: {
      if (checkItemTypeEquivMem113c(m, pItem, 0x2d) === 0) return
      const maxDam = m.get(pBaseRec, D2ItemsTxt.nMaxDam)
      if (maxDam !== 0) {
        const cur16 = getUnitBaseStatWithIscCheck113c(m, pItem, 0x16, 0) | 0
        if (cur16 < maxDam) {
          STATLIST_SetUnitStat113c(m, pItem, 0x16, maxDam, 0)
        }
      }
      const max2HandDam = m.get(pBaseRec, D2ItemsTxt.n2HandMaxDam)
      if (max2HandDam !== 0) {
        const cur18 = getUnitBaseStatWithIscCheck113c(m, pItem, 0x18, 0) | 0
        if (cur18 < max2HandDam) {
          STATLIST_SetUnitStat113c(m, pItem, 0x18, max2HandDam, 0)
        }
      }
      const curA0 = getUnitBaseStatWithIscCheck113c(m, pItem, 0xa0, 0) | 0
      if (checkIfThrowItemMem113c(m, pItem) === 0) return
      const maxMisDam = m.get(pBaseRec, D2ItemsTxt.nMaxMisDam)
      if (maxMisDam === 0 || curA0 >= maxMisDam) return
      STATLIST_SetUnitStat113c(m, pItem, 0xa0, maxMisDam, 0)
      return
    }
    case 0x12:
    case 0x15: {
      if (checkItemTypeEquivMem113c(m, pItem, 0x2d) === 0) return
      const minDam = m.get(pBaseRec, D2ItemsTxt.nMinDam)
      if (minDam !== 0) {
        const cur15 = getUnitBaseStatWithIscCheck113c(m, pItem, 0x15, 0) | 0
        if (cur15 < minDam) {
          STATLIST_SetUnitStat113c(m, pItem, 0x15, minDam, 0)
        }
      }
      const min2HandDam = m.get(pBaseRec, D2ItemsTxt.n2HandMinDam)
      if (min2HandDam !== 0) {
        const cur17 = getUnitBaseStatWithIscCheck113c(m, pItem, 0x17, 0) | 0
        if (cur17 < min2HandDam) {
          STATLIST_SetUnitStat113c(m, pItem, 0x17, min2HandDam, 0)
        }
      }
      const cur9F = getUnitBaseStatWithIscCheck113c(m, pItem, 0x9f, 0) | 0
      if (checkIfThrowItemMem113c(m, pItem) === 0) return
      const minMisDam = m.get(pBaseRec, D2ItemsTxt.nMinMisDam)
      if (minMisDam === 0 || cur9F >= minMisDam) return
      STATLIST_SetUnitStat113c(m, pItem, 0x9f, minMisDam, 0)
      return
    }
    default:
      return
  }
}

/**
 * `@va D2Common:0x6FD7D0F0` (internal helper `DRLGWARP_TestRoomTileBit`,
 * stdcall `[esp+4] = pRoomMaskPtr`, `[esp+8] = nX`, `[esp+0xC] = nY`, `ret 0xC` -> `0` or `1`).
 */
export function DRLGWARP_TestRoomTileBit113c(
  m: Memory113c,
  pRoomMaskPtr: number,
  nX: number,
  nY: number,
): number {
  if (pRoomMaskPtr === 0) {
    throw new D2CommonAssertError('DrlgWarp.cpp', 0x1f)
  }
  const bitIdx = ((nX << 4) + nY) | 0
  const pBitArray = m.u32(pRoomMaskPtr >>> 0)
  const byteVal = m.u8((pBitArray + (bitIdx >> 3)) >>> 0)
  return (byteVal & (1 << (bitIdx & 7))) !== 0 ? 1 : 0
}

/**
 * `@va D2Common:0x6FD95A40` (internal LTCG helper `ITEMS_GetItemsTxtRecordFromUnitOrAlt`,
 * custom reg `eax = pUnit1`, `ecx = pUnit2`, `ret` -> `D2ItemsTxt*` or `0`).
 */
export function ITEMS_GetItemsTxtRecordFromUnitOrAlt113c(
  m: Memory113c,
  pUnit1: number,
  pUnit2: number,
): number {
  if (pUnit1 !== 0 && m.get(pUnit1, D2UnitStrc.dwUnitType) === UNIT_ITEM) {
    return lookupItemsTxtRecord113c(m, m.get(pUnit1, D2UnitStrc.dwClassId))
  }
  const nItemId = pUnit2 !== 0 ? m.get(pUnit2, D2UnitStrc.dwClassId) : 0xffffffff
  return lookupItemsTxtRecord113c(m, nItemId)
}

function scaleItemBaseStatEthereal113c(m: Memory113c, pItem: number, statId: number): void {
  const sgpt = m.u32(ITEMS_SGPT_DATATABLES_VA_113C)
  const iscCount = m.u32((sgpt + DATATABLES_OFF_113C.nItemStatCostTxtRecordCount) >>> 0) | 0
  let cur = 0
  if (iscCount > statId) {
    const pIscRec = (m.u32((sgpt + DATATABLES_OFF_113C.pItemStatCostTxt) >>> 0) + imul32(statId, D2ItemStatCostTxt_SIZE)) >>> 0
    if (pIscRec !== 0 && m.get(pItem, D2UnitStrc.pStatListEx) !== 0) {
      cur = STATLIST_GetUnitBaseStat113c(m, pItem, statId, 0) | 0
    }
  }
  const pStatListEx = m.get(pItem, D2UnitStrc.pStatListEx)
  if (pStatListEx === 0) return
  const prod = imul32(cur, 3)
  const scaled = sar32((prod - (prod >> 31)) | 0, 1)
  const changed = STATLIST_SetStat113c(m, pStatListEx, statId, scaled, 0)
  if (changed !== 0 && m.get(pItem, D2UnitStrc.dwUnitType) === UNIT_PLAYER) {
    STATLIST_RecordModStat113c(m, pStatListEx, statKey113c(statId, 0))
  }
}

/**
 * `@va D2Common:0x6FD96A40` (internal helper `ITEMS_ApplyEtherealBonusStats`,
 * stdcall `[esp+4] = pItem`, `ret 4`, void).
 */
export function ITEMS_ApplyEtherealBonusStats113c(m: Memory113c, pItem: number): void {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x706)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) === UNIT_ITEM) {
    const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
    if (pItemData !== 0) {
      m.set(
        pItemData,
        D2ItemDataStrc.dwCommandFlags,
        (m.get(pItemData, D2ItemDataStrc.dwCommandFlags) | 0x400000) >>> 0,
      )
    }
  }
  if (checkItemTypeEquivMem113c(m, pItem, 0x2d) !== 0) {
    scaleItemBaseStatEthereal113c(m, pItem, 0x15)
    scaleItemBaseStatEthereal113c(m, pItem, 0x16)
    scaleItemBaseStatEthereal113c(m, pItem, 0x17)
    scaleItemBaseStatEthereal113c(m, pItem, 0x18)
    scaleItemBaseStatEthereal113c(m, pItem, 0x9f)
    scaleItemBaseStatEthereal113c(m, pItem, 0xa0)
  } else {
    scaleItemBaseStatEthereal113c(m, pItem, 0x1f)
  }
}

/**
 * `@va D2Common:0x6FD96E50` (internal LTCG helper `ITEMS_ResetBaseDamageOrACStatFromTxt`,
 * custom reg `esi = pItem`, stack `[esp+4] = nStatId`, `ret 4`, void).
 */
export function ITEMS_ResetBaseDamageOrACStatFromTxt113c(
  m: Memory113c,
  pItem: number,
  nStatId: number,
): void {
  if (pItem === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x61b)
  }
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    throw new D2CommonAssertError('Items.cpp', 0x61c)
  }
  const pRec = lookupItemsTxtRecord113c(m, m.get(pItem, D2UnitStrc.dwClassId))
  if (pRec === 0) {
    throw new D2CommonAssertError('Items.cpp', 0x61f)
  }
  const dwCode = m.get(pRec, D2ItemsTxt.dwCode)
  const idx = fogGetLinkIndex113c(m, m.u32(ITEMS_LINK_PTR_VA_113C), dwCode)
  if (idx < 0) return
  const pBaseRec = (m.u32(ITEMS_TXT_PTR_VA_113C) + imul32(idx, D2ItemsTxt_SIZE)) >>> 0
  if (pBaseRec === 0) return

  switch (nStatId | 0) {
    case 0x10:
    case 0x1f: {
      if (checkItemTypeEquivMem113c(m, pItem, 0x32) === 0) return
      const minAc = m.get(pBaseRec, D2ItemsTxt.nMinAc) | 0
      if (minAc === 0) return
      let val = (getUnitBaseStatWithIscCheck113c(m, pItem, 0x1f, 0) + 1) | 0
      if (val <= minAc) {
        val = (minAc + 1) | 0
      }
      STATLIST_SetUnitStat113c(m, pItem, 0x1f, val, 0)
      return
    }
    case 0x11:
    case 0x16: {
      if (checkItemTypeEquivMem113c(m, pItem, 0x2d) === 0) return
      const maxDam = m.get(pBaseRec, D2ItemsTxt.nMaxDam)
      if (maxDam !== 0) {
        STATLIST_SetUnitStat113c(m, pItem, 0x16, maxDam, 0)
      }
      const max2HandDam = m.get(pBaseRec, D2ItemsTxt.n2HandMaxDam)
      if (max2HandDam !== 0) {
        STATLIST_SetUnitStat113c(m, pItem, 0x18, max2HandDam, 0)
      }
      if (checkIfThrowItemMem113c(m, pItem) === 0) return
      const maxMisDam = m.get(pBaseRec, D2ItemsTxt.nMaxMisDam)
      if (maxMisDam === 0) return
      STATLIST_SetUnitStat113c(m, pItem, 0xa0, maxMisDam, 0)
      return
    }
    case 0x12:
    case 0x15: {
      if (checkItemTypeEquivMem113c(m, pItem, 0x2d) === 0) return
      const minDam = m.get(pBaseRec, D2ItemsTxt.nMinDam)
      if (minDam !== 0) {
        STATLIST_SetUnitStat113c(m, pItem, 0x15, minDam, 0)
      }
      const min2HandDam = m.get(pBaseRec, D2ItemsTxt.n2HandMinDam)
      if (min2HandDam !== 0) {
        STATLIST_SetUnitStat113c(m, pItem, 0x17, min2HandDam, 0)
      }
      if (checkIfThrowItemMem113c(m, pItem) === 0) return
      const minMisDam = m.get(pBaseRec, D2ItemsTxt.nMinMisDam)
      if (minMisDam === 0) return
      STATLIST_SetUnitStat113c(m, pItem, 0x9f, minMisDam, 0)
      return
    }
    default:
      return
  }
}
