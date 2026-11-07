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
 * - `#10051` (`0x6FD73970` `ITEMS_SetRareSuffix`): writes `(u16)[esp+8]` to `pItemData + 0x34` (`wRareSuffix`).
 * - `#10912` (`0x6FD739C0` `ITEMS_SetRarePrefix`): writes `(u16)[esp+8]` to `pItemData + 0x32` (`wRarePrefix`).
 * - `#10443` (`0x6FD73A10` `ITEMS_SetMagicSuffix`): writes `(u16)[esp+8]` to `pItemData + 0x3E + nIndex * 2` (`wMagicSuffix[nIndex]`).
 * - `#10683` (`0x6FD73AC0` `ITEMS_SetMagicPrefix`): writes `(u16)[esp+8]` to `pItemData + 0x38 + nIndex * 2` (`wMagicPrefix[nIndex]`).
 * - `#10417` (`0x6FD73C50` `ITEMS_GetBodyLocation`): reads `(u8)(pItemData + 0x44)` (`nBodyLoc`) into `al`
 *   (or `xor al, al` on NULL / non-item / NULL `pItemData`).
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import { D2ItemDataStrc, D2UnitStrc } from '../mem/layout.generated.ts'
import { imul32, sar32 } from './int-math.ts'
import { UNIT_ITEM, UNIT_PLAYER } from './unit.ts'

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
