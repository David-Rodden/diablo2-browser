/**
 * Diablo II v1.13c `D2Common.dll` inventory grid, item-extra node, and item-gfx cache primitives
 * (`Inventory.cpp`, `0x6FD6E360..0x6FD6F8F0`).
 *
 * Binary evidence (`objdump -d -M intel ~/d2-data/D2Common.dll`, image base `0x6FD50000`):
 * - `D2UnitStrc.dwUnitType == 4` (`UNIT_ITEM`): `cmp dword [reg], 4` at `0x6FD6E40F`, `0x6FD6E794`, `0x6FD6E893`, etc.
 * - `D2ItemExtraDataStrc` is embedded at `pItemData + 0x5C` (`add eax, 0x5C` at `0x6FD6E7A0`, `0x6FD6E89F`, `0x6FD6E8D6`,
 *   `0x6FD6E906`, `0x6FD6F642`, `0x6FD6F6A2`, `0x6FD6F701`, `0x6FD6F906`):
 *   - `+0x00` `pOwnerInventory` (`[eax]` at `0x6FD6E8A5`, `[edx]` at `0x6FD6F649`, `0x6FD6F6CD`)
 *   - `+0x04` `pPrevItem` (`[edx+0x4]` at `0x6FD6F6C7`, `[eax+0x4]` at `0x6FD6F90B`)
 *   - `+0x08` `pNextItem` (`[eax+0x8]` at `0x6FD6E910`, `0x6FD6F6C1`, `0x6FD6F903`)
 *   - `+0x0D` `nNodePosOther` (`movsx eax, byte [eax+0xD]` at `0x6FD6E8E0`)
 *   - `+0x10` `pPrevGridItem` (`[edx+0x10]` at `0x6FD6F66F`)
 *   - `+0x14` `pNextGridItem` (`[eax+0x14]` at `0x6FD6F669`)
 * - `INVENTORY_InitItemGfxCodeTable` (`0x6FD6E920`):
 *   - Guard flag `0x6FDF1488` (`mov eax, ds:0x6FDF1488; test eax,eax; jne` at `0x6FD6E920..0x6FD6E92A`)
 *   - Cache array `0x6FDF0BA8` (`255` entries x `8` bytes `{ u32 dwCode, i32 nItemType }`, zeroed via `mov ecx, 0x1FE; rep stosd` at `0x6FD6E933..0x6FD6E93D`)
 *   - Count dword `0x6FDF13A0` set to `0xFF` at `0x6FD6EC1D`
 *   - Reads `nItemsTxtRecordCount` at `0x6FDEFB94`, `pItemsTxt` at `0x6FDEFB98` (stride `0x1A8`, `dwCode` `+0x80`, `dwAlternateGfx` `+0x90`, `wType[0]` `+0x11E`),
 *     `sgptDataTables` at `0x6FDE9E1C` (`nItemTypesTxtRecordCount` `+0xBFC`, `nItemTypesEquivDwords` `+0xC00`, `pItemTypesEquiv` `+0xC04`),
 *     Fog `gdwBitMasks` IAT slot `0x6FDD90B0`, and static reference table at `0x6FDED888` (`mov esi, [edx*8+0x6FDED88C]` at `0x6FD6EB04`).
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import {
  D2CorpseStrc,
  D2InventoryGridStrc,
  D2InventoryNodeStrc,
  D2InventoryStrc,
  D2ItemDataStrc,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import {
  D2COMMON_GDWBITMASKS_IAT_VA_113C,
  D2COMMON_SGPT_DATATABLES_VA_113C,
  DATATABLES_OFF_113C,
} from './inline-helpers.ts'
import { imul32 } from './int-math.ts'
import { UNIT_ITEM } from './unit.ts'

export const INVENTORY_SIGNATURE_113C = 0x01020304

/** Offsets inside the embedded `D2ItemExtraDataStrc` at `pItemData + 0x5C` (evidence in file header). */
export const ITEM_EXTRA_OFF_113C = {
  pOwnerInventory: 0x00,
  pPrevItem: 0x04,
  pNextItem: 0x08,
  nNodePosOther: 0x0d,
  pPrevGridItem: 0x10,
  pNextGridItem: 0x14,
} as const

/** Globals read and written by `INVENTORY_InitItemGfxCodeTable` (`0x6FD6E920`). */
export const D2COMMON_ITEM_GFX_STATIC_TABLE_VA_113C = 0x6fded888
export const D2COMMON_ITEMS_TXT_COUNT_VA_113C = 0x6fdefb94
export const D2COMMON_ITEMS_TXT_PTR_VA_113C = 0x6fdefb98
export const D2COMMON_ITEM_GFX_CACHE_VA_113C = 0x6fdf0ba8
export const D2COMMON_ITEM_GFX_CACHE_COUNT_VA_113C = 0x6fdf13a0
export const D2COMMON_ITEM_GFX_INIT_FLAG_VA_113C = 0x6fdf1488

export const ITEMS_TXT_STRIDE_113C = 0x1a8
export const ITEMS_TXT_OFF_DWCODE_113C = 0x80
export const ITEMS_TXT_OFF_DWALTERNATEGFX_113C = 0x90
export const ITEMS_TXT_OFF_WTYPE0_113C = 0x11e

function s8(v: number): number {
  return (v << 24) >> 24
}

function s16(v: number): number {
  return (v << 16) >> 16
}

/**
 * Shared item-extra pointer resolution (`test reg,reg; je 0; cmp [reg],4; jne 0; mov eax,[reg+0x14];
 * test eax,eax; je 0; add eax,0x5C`). Note that callers after `0x6FD6E790` also test the post-add `eax != 0`.
 */
function itemExtraOrZero(m: Memory113c, pItem: number, checkPostAddZero: boolean): number {
  if (pItem === 0) return 0
  if (m.get(pItem, D2UnitStrc.dwUnitType) !== UNIT_ITEM) return 0
  const pItemData = m.get(pItem, D2UnitStrc.pUnitData)
  if (pItemData === 0) return 0
  const pExtra = (pItemData + D2ItemDataStrc.pExtraOwnerInventory.off) >>> 0
  if (checkPostAddZero && pExtra === 0) return 0
  return pExtra
}

/**
 * `@va D2Common:0x6FD6DC70` (`D2Common.#10155` `INVENTORY_GetCorpseUnitId`,
 * stdcall `[esp+4] = pCorpse`, `ret 4` -> `pCorpse->dwUnitId (+0x04)` or `0`).
 */
export function INVENTORY_GetCorpseUnitId113c(m: Memory113c, pCorpse: number): number {
  if (pCorpse === 0) return 0
  return m.get(pCorpse, D2CorpseStrc.dwUnitId) >>> 0
}

/**
 * `@va D2Common:0x6FD6DC90` (`D2Common.#10348` `INVENTORY_GetNextCorpse`,
 * stdcall `[esp+4] = pCorpse`, `ret 4` -> `pCorpse->pNextCorpse (+0x0C)` or `0`).
 */
export function INVENTORY_GetNextCorpse113c(m: Memory113c, pCorpse: number): number {
  if (pCorpse === 0) return 0
  return m.get(pCorpse, D2CorpseStrc.pNextCorpse) >>> 0
}

/**
 * `@va D2Common:0x6FD6DCB0` (`D2Common.#11096` `INVENTORY_GetCorpseCount`,
 * stdcall `[esp+4] = pInventory`, `ret 4` -> `pInventory->nCorpseCount (+0x3C)` or `0`).
 */
export function INVENTORY_GetCorpseCount113c(m: Memory113c, pInventory: number): number {
  if (pInventory === 0) return 0
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  return m.get(pInventory, D2InventoryStrc.nCorpseCount) >>> 0
}

/**
 * `@va D2Common:0x6FD6DD20` (`D2Common.#10284` `INVENTORY_GetFirstCorpse`,
 * stdcall `[esp+4] = pInventory`, `ret 4` -> `pInventory->pFirstCorpse (+0x34)` or `0`).
 */
export function INVENTORY_GetFirstCorpse113c(m: Memory113c, pInventory: number): number {
  if (pInventory === 0) return 0
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  return m.get(pInventory, D2InventoryStrc.pFirstCorpse) >>> 0
}

/**
 * `@va D2Common:0x6FD6DE50` (`D2Common.#11134` `INVENTORY_GetLeftItemGuid`,
 * stdcall `[esp+4] = pInventory`, `ret 4` -> `pInventory->dwLeftItemGuid (+0x24)` or `-1` (`0xFFFFFFFF`)).
 */
export function INVENTORY_GetLeftItemGuid113c(m: Memory113c, pInventory: number): number {
  if (pInventory === 0) return -1
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return -1
  return m.get(pInventory, D2InventoryStrc.dwLeftItemGuid) >>> 0
}

/**
 * `@va D2Common:0x6FD6DE70` (`D2Common.#10268` `INVENTORY_SetLeftItemGuid`,
 * stdcall `[esp+4] = pInventory`, `[esp+8] = dwItemGuid`, `ret 8`, void).
 */
export function INVENTORY_SetLeftItemGuid113c(
  m: Memory113c,
  pInventory: number,
  dwItemGuid: number,
): void {
  if (pInventory === 0) return
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return
  m.set(pInventory, D2InventoryStrc.dwLeftItemGuid, dwItemGuid >>> 0)
}

/**
 * `@va D2Common:0x6FD6DE90` (`D2Common.#10508` `INVENTORY_GetItemCount`,
 * stdcall `[esp+4] = pInventory`, `ret 4` -> `pInventory->dwItemCount (+0x28)` or `0`).
 */
export function INVENTORY_GetItemCount113c(m: Memory113c, pInventory: number): number {
  if (pInventory === 0) return 0
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  return m.get(pInventory, D2InventoryStrc.dwItemCount) >>> 0
}

/**
 * `@va D2Common:0x6FD6DEB0` (`D2Common.#10727` `INVENTORY_GetNodeItemGuid`,
 * stdcall `[esp+4] = pNode`, `ret 4` -> `pNode->dwItemId (+0x00)` or `0`).
 */
export function INVENTORY_GetNodeItemGuid113c(m: Memory113c, pNode: number): number {
  if (pNode === 0) return 0
  return m.get(pNode, D2InventoryNodeStrc.dwItemId) >>> 0
}

/**
 * `@va D2Common:0x6FD6DEC0` (`D2Common.#10691` `INVENTORY_GetNextNode`,
 * stdcall `[esp+4] = pNode`, `ret 4` -> `pNode->pNext (+0x04)` or `0`).
 */
export function INVENTORY_GetNextNode113c(m: Memory113c, pNode: number): number {
  if (pNode === 0) return 0
  return m.get(pNode, D2InventoryNodeStrc.pNext) >>> 0
}

/**
 * `@va D2Common:0x6FD6DEE0` (`D2Common.#10642` `INVENTORY_CheckNodeExists`,
 * stdcall `[esp+4] = pInventory`, `[esp+8] = dwItemId`, `ret 8` -> `1` if found, else `0`).
 */
export function INVENTORY_CheckNodeExists113c(
  m: Memory113c,
  pInventory: number,
  dwItemId: number,
): number {
  if (pInventory === 0) return 0
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  let pNode = m.get(pInventory, D2InventoryStrc.pFirstNode)
  const target = dwItemId >>> 0
  while (pNode !== 0) {
    if (m.get(pNode, D2InventoryNodeStrc.dwItemId) === target) return 1
    pNode = m.get(pNode, D2InventoryNodeStrc.pNext)
  }
  return 0
}

/**
 * `@va D2Common:0x6FD6DF70` (`D2Common.#10170` `INVENTORY_GetFirstNode`,
 * stdcall `[esp+4] = pInventory`, `ret 4` -> `pInventory->pFirstNode (+0x2C)` or `0`).
 */
export function INVENTORY_GetFirstNode113c(m: Memory113c, pInventory: number): number {
  if (pInventory === 0) return 0
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  return m.get(pInventory, D2InventoryStrc.pFirstNode) >>> 0
}

/**
 * `@va D2Common:0x6FD6DF90` (`D2Common.#10267` `INVENTORY_NoOpRet8A`,
 * stdcall 2 stack args, `ret 8`, void).
 */
export function INVENTORY_NoOpRet8A113c(_m: Memory113c, _a0: number, _a1: number): void {}

/**
 * `@va D2Common:0x6FD6DFB0` (`D2Common.#11017` `INVENTORY_GetCursorItem`,
 * stdcall `[esp+4] = pInventory`, `ret 4` -> `pInventory->pCursorItem (+0x20)` or `0`).
 */
export function INVENTORY_GetCursorItem113c(m: Memory113c, pInventory: number): number {
  if (pInventory === 0) return 0
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  return m.get(pInventory, D2InventoryStrc.pCursorItem) >>> 0
}

/**
 * `@va D2Common:0x6FD6DFD0` (`D2Common.#10608` `INVENTORY_NoOpRet8B`,
 * stdcall 2 stack args, `ret 8`, void).
 */
export function INVENTORY_NoOpRet8B113c(_m: Memory113c, _a0: number, _a1: number): void {}

/**
 * `@va D2Common:0x6FD6DFF0` (`D2Common.#10869` `INVENTORY_NoOpRet20`,
 * stdcall 8 stack args, `ret 0x20`, void).
 */
export function INVENTORY_NoOpRet20113c(
  _m: Memory113c,
  _a0: number,
  _a1: number,
  _a2: number,
  _a3: number,
  _a4: number,
  _a5: number,
  _a6: number,
  _a7: number,
): void {}

/**
 * `@va D2Common:0x6FD6E010` (`INVENTORY_ScoreGridRectPlacement`,
 * custom LTCG `eax = nY`, `cl = nHeight`, stack `[esp+4] = pGrid`, `[esp+8] = nX`, `[esp+0xC] = nWidth`,
 * `ret 0xC` -> placement adjacency/border score, clamped to `0xFF` when `score >= 2 * (w + h)`).
 */
export function INVENTORY_ScoreGridRectPlacement113c(
  m: Memory113c,
  nY: number,
  nHeight: number,
  pGrid: number,
  nX: number,
  nWidth: number,
): number {
  const y0 = nY | 0
  const h = nHeight & 0xff
  const x0 = nX | 0
  const w = nWidth & 0xff
  let score = 0
  const yEnd = (y0 + h) | 0

  if (x0 <= 0) {
    score = (score + h) | 0
  } else if (y0 < yEnd) {
    const ppItems = m.get(pGrid, D2InventoryGridStrc.ppItems)
    const gw = m.get(pGrid, D2InventoryGridStrc.nGridWidth)
    const rowStrideBytes = (gw * 4) | 0
    let pCell = (ppItems + imul32(imul32(gw, y0) + ((x0 - 1) | 0), 4)) >>> 0
    for (let y = y0; y < yEnd; y = (y + 1) | 0) {
      if (m.u32(pCell) !== 0) {
        score = (score + 1) | 0
      }
      pCell = (pCell + rowStrideBytes) >>> 0
    }
  }

  const gw = m.get(pGrid, D2InventoryGridStrc.nGridWidth)
  const xEnd = (x0 + w) | 0
  if (xEnd >= gw) {
    score = (score + h) | 0
  } else if (y0 < yEnd) {
    const ppItems = m.get(pGrid, D2InventoryGridStrc.ppItems)
    const rowStrideBytes = (gw * 4) | 0
    let pCell = (ppItems + imul32(imul32(gw, y0) + xEnd, 4)) >>> 0
    for (let y = y0; y < yEnd; y = (y + 1) | 0) {
      if (m.u32(pCell) !== 0) {
        score = (score + 1) | 0
      }
      pCell = (pCell + rowStrideBytes) >>> 0
    }
  }

  if (y0 <= 0) {
    score = (score + w) | 0
  } else if (x0 < xEnd) {
    const ppItems = m.get(pGrid, D2InventoryGridStrc.ppItems)
    const pRow = (ppItems + imul32(imul32(gw, (y0 - 1) | 0), 4)) >>> 0
    for (let x = x0; x < xEnd; x = (x + 1) | 0) {
      if (m.u32((pRow + imul32(x, 4)) >>> 0) !== 0) {
        score = (score + 1) | 0
      }
    }
  }

  const gh = m.get(pGrid, D2InventoryGridStrc.nGridHeight)
  if (yEnd >= gh) {
    score = (score + w) | 0
  } else if (x0 < xEnd) {
    const ppItems = m.get(pGrid, D2InventoryGridStrc.ppItems)
    const pRow = (ppItems + imul32(imul32(gw, yEnd), 4)) >>> 0
    for (let x = x0; x < xEnd; x = (x + 1) | 0) {
      if (m.u32((pRow + imul32(x, 4)) >>> 0) !== 0) {
        score = (score + 1) | 0
      }
    }
  }

  const maxPerimeter = ((w + h) << 1) | 0
  if (score >= maxPerimeter) return 0xff
  return score >>> 0
}

/**
 * `@va D2Common:0x6FD6E190` (`D2Common.#10460` `INVENTORY_GetFirstItem`,
 * stdcall `[esp+4] = pInventory`, `ret 4` -> `pInventory->pFirstItem (+0x0C)` or `0`).
 */
export function INVENTORY_GetFirstItem113c(m: Memory113c, pInventory: number): number {
  if (pInventory === 0) return 0
  if (m.get(pInventory, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  return m.get(pInventory, D2InventoryStrc.pFirstItem) >>> 0
}

/**
 * `@va D2Common:0x6FD6E310` (`INVENTORY_FillGridRect`,
 * custom LTCG `al = nHeight`, `ecx = nY`, `edx = nX`, stack `[esp+4] = pGrid`, `[esp+8] = nWidth`, `[esp+0xC] = pItem`,
 * `ret 0xC`, void).
 */
export function INVENTORY_FillGridRect113c(
  m: Memory113c,
  nHeight: number,
  nY: number,
  nX: number,
  pGrid: number,
  nWidth: number,
  pItem: number,
): void {
  const y0 = nY | 0
  const yEnd = ((nHeight & 0xff) + y0) | 0
  if (y0 >= yEnd) return
  const x0 = nX | 0
  const xEnd = (x0 + (nWidth & 0xff)) | 0
  const gw = m.get(pGrid, D2InventoryGridStrc.nGridWidth)
  const rowStrideBytes = (gw * 4) | 0
  const ppItems = m.get(pGrid, D2InventoryGridStrc.ppItems)
  let pRow = (ppItems + imul32(imul32(gw, y0), 4)) >>> 0
  const itemVal = pItem >>> 0
  for (let y = y0; y < yEnd; y = (y + 1) | 0) {
    for (let x = x0; x < xEnd; x = (x + 1) | 0) {
      m.setU32((pRow + imul32(x, 4)) >>> 0, itemVal)
    }
    pRow = (pRow + rowStrideBytes) >>> 0
  }
}

/**
 * `@va D2Common:0x6FD6E360` (`INVENTORY_IsGridRectEmpty`, `eax = pGrid`, `ecx = nY`, `dl = nWidth`,
 * stack `[esp+4] = nX`, `[esp+8] = nHeight`, `ret 8` -> `0` or `1`).
 *
 * Notice how `0x6FD6E363` reads `movzx esi, byte [esp+0x14]` after 3 pushes (`ebx, ebp, esi`), which is
 * stack arg 2 (`nHeight`), then pushes `edi` at `0x6FD6E36C` and reads `mov eax, [esp+0x14]` at `0x6FD6E373`,
 * which is now stack arg 1 (`nX`). If `nY >= nY + (u8)nHeight` (`cmp ecx, esi; jge 0x6FD6E3B2`), returns `1`
 * immediately without dereferencing `pGrid`.
 */
export function INVENTORY_IsGridRectEmpty113c(
  m: Memory113c,
  pGrid: number,
  nY: number,
  nWidth: number,
  nX: number,
  nHeight: number,
): number {
  const yStart = nY | 0
  const yEnd = ((nHeight & 0xff) + yStart) | 0
  if (yStart >= yEnd) return 1

  const xStart = nX | 0
  const xEnd = (xStart + (nWidth & 0xff)) | 0
  const gridWidth = m.get(pGrid, D2InventoryGridStrc.nGridWidth)
  const rowStrideBytes = (gridWidth * 4) | 0
  const initialWordOff = imul32(gridWidth, yStart)
  const ppItems = m.get(pGrid, D2InventoryGridStrc.ppItems)
  let rowPtr = (ppItems + imul32(initialWordOff, 4)) >>> 0

  for (let y = yStart; y < yEnd; y = (y + 1) | 0) {
    if (xStart < xEnd) {
      for (let x = xStart; x < xEnd; x = (x + 1) | 0) {
        const cellAddr = (rowPtr + imul32(x, 4)) >>> 0
        if (m.u32(cellAddr) !== 0) return 0
      }
    }
    rowPtr = (rowPtr + rowStrideBytes) >>> 0
  }
  return 1
}

/**
 * `@va D2Common:0x6FD6E400` (`D2Common.#11147` `INVENTORY_UnitIsItem`, stdcall `[esp+4] = pUnit`, `ret 4`
 * -> `pUnit` if `pUnit != NULL && pUnit->dwUnitType == 4`, else `0`).
 */
export function INVENTORY_UnitIsItem113c(m: Memory113c, pUnit: number): number {
  if (pUnit === 0) return 0
  return m.get(pUnit, D2UnitStrc.dwUnitType) === UNIT_ITEM ? pUnit >>> 0 : 0
}

/**
 * `@va D2Common:0x6FD6E790` (`INVENTORY_GetItemExtraData`, `eax = pItem`, `ret`
 * -> `pItemData + 0x5C` or `0`).
 */
export function INVENTORY_GetItemExtraData113c(m: Memory113c, pItem: number): number {
  return itemExtraOrZero(m, pItem, false)
}

/**
 * `@va D2Common:0x6FD6E880` (`D2Common.#10004` `INVENTORY_GetItemIfOwnedByInventory`,
 * stdcall `[esp+4] = pInventory`, `[esp+8] = pItem`, `ret 8` -> `pItem` or `0`).
 */
export function INVENTORY_GetItemIfOwnedByInventory113c(m: Memory113c, pInventory: number, pItem: number): number {
  if (pInventory === 0) return 0
  const pExtra = itemExtraOrZero(m, pItem, true)
  if (pExtra === 0) return 0
  return m.u32(pExtra) === pInventory >>> 0 ? pItem >>> 0 : 0
}

/**
 * `@va D2Common:0x6FD6E8C0` (`D2Common.#10698` `INVENTORY_GetItemNodePositionOther`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> signed `int8` at `pExtra + 0x0D` or `0`).
 */
export function INVENTORY_GetItemNodePositionOther113c(m: Memory113c, pItem: number): number {
  const pExtra = itemExtraOrZero(m, pItem, true)
  if (pExtra === 0) return 0
  return s8(m.u8((pExtra + ITEM_EXTRA_OFF_113C.nNodePosOther) >>> 0))
}

/**
 * `@va D2Common:0x6FD6E8F0` (`D2Common.#10464` `INVENTORY_GetNextItem`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `pExtra->pNextItem (+0x08)` or `0`).
 */
export function INVENTORY_GetNextItem113c(m: Memory113c, pItem: number): number {
  const pExtra = itemExtraOrZero(m, pItem, true)
  if (pExtra === 0) return 0
  return m.u32((pExtra + ITEM_EXTRA_OFF_113C.pNextItem) >>> 0)
}

/**
 * `@va D2Common:0x6FD6E920` (`INVENTORY_InitItemGfxCodeTable`, no args, `ret`, void).
 *
 * One-shot initializer for the 255-slot item gfx code lookup table at `0x6FDF0BA8` (`255 * 8` bytes).
 * Seeds slots `1..3` with `'lit '`, `'med '`, `'hvy '` (type `3`), sets `0x6FDF1488 = 1`, scans
 * `nItemsTxtRecordCount` (`0x6FDEFB94`) records at `pItemsTxt` (`0x6FDEFB98`, stride `0x1A8`), tests
 * `ItemTypes` equivalence bits (`45` weapon, `3` body armor, `51` shield, `37` helm, excluding `75` circlet),
 * resolves slot collisions against the static table at `0x6FDED888` (`45` weapon / `50` any armor) and
 * existing cache entries, clamps `s >= 255` back to `nextFree`, and writes `0xFF` to `0x6FDF13A0`.
 */
export function INVENTORY_InitItemGfxCodeTable113c(m: Memory113c): void {
  if (m.u32(D2COMMON_ITEM_GFX_INIT_FLAG_VA_113C) !== 0) return

  for (let i = 0; i < 0x1fe; i++) {
    m.setU32((D2COMMON_ITEM_GFX_CACHE_VA_113C + i * 4) >>> 0, 0)
  }
  m.setU32(0x6fdf0bb4, 3)
  m.setU32(0x6fdf0bbc, 3)
  m.setU32(0x6fdf0bc4, 3)

  const nItems = m.u32(D2COMMON_ITEMS_TXT_COUNT_VA_113C) | 0
  m.setU32(D2COMMON_ITEM_GFX_INIT_FLAG_VA_113C, 1)
  m.setU32(0x6fdf0bb0, 0x2074696c) // 'lit '
  m.setU32(0x6fdf0bb8, 0x2064656d) // 'med '
  m.setU32(0x6fdf0bc0, 0x20797668) // 'hvy '

  let nextFree = 4
  if (nItems > 0) {
    let edx = (m.u32(D2COMMON_ITEMS_TXT_PTR_VA_113C) + ITEMS_TXT_OFF_WTYPE0_113C) >>> 0
    const dt = m.u32(D2COMMON_SGPT_DATATABLES_VA_113C)

    const checkEquiv = (typeId: number, gateType: number, dwordOff: number, bmByteOff: number): boolean => {
      if (typeId < 0) return false
      const nt = m.u32(dt + DATATABLES_OFF_113C.nItemTypesTxtRecordCount) | 0
      if (typeId >= nt || nt <= gateType) return false
      const w = m.u32(dt + DATATABLES_OFF_113C.nItemTypesEquivDwords) | 0
      const equiv = m.u32(dt + DATATABLES_OFF_113C.pItemTypesEquiv)
      const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
      const mask = m.u32((pBitMasks + bmByteOff) >>> 0)
      const val = m.u32((equiv + imul32(w, typeId) * 4 + dwordOff) >>> 0)
      return (val & mask) !== 0
    }

    for (let rem = nItems; rem !== 0; rem = (rem - 1) | 0) {
      let code = m.u32((edx - 0x8e) >>> 0) // rec + 0x90 (dwAlternateGfx)
      if (code === 0) {
        code = m.u32((edx - 0x9e) >>> 0) // rec + 0x80 (dwCode)
      }
      const t = s16(m.u16(edx))
      let ok = 0
      if (t >= 0) {
        const matched =
          checkEquiv(t, 0x2d, 0x4, 0x34) ||
          checkEquiv(t, 0x03, 0x0, 0x0c) ||
          checkEquiv(t, 0x33, 0x4, 0x4c) ||
          checkEquiv(t, 0x25, 0x4, 0x14)
        if (matched && !checkEquiv(t, 0x4b, 0x8, 0x2c)) {
          ok = 1
        }
      }

      let dup = false
      if (nextFree > 0) {
        for (let i = 0; i < nextFree; i++) {
          if (m.u32((D2COMMON_ITEM_GFX_CACHE_VA_113C + i * 8) >>> 0) === code) {
            dup = true
            break
          }
        }
      }

      if (!dup && ok === 1) {
        const tRec = s16(m.u16(edx))
        let s = nextFree
        while (true) {
          const tt = m.u32((D2COMMON_ITEM_GFX_STATIC_TABLE_VA_113C + 4 + s * 8) >>> 0) | 0
          if (checkEquiv(tt, 0x2d, 0x4, 0x34) && checkEquiv(tRec, 0x2d, 0x4, 0x34)) {
            s = (s + 1) | 0
            continue
          }
          if (checkEquiv(tt, 0x32, 0x4, 0x48) && checkEquiv(tRec, 0x32, 0x4, 0x48)) {
            s = (s + 1) | 0
            continue
          }
          if (m.u32((D2COMMON_ITEM_GFX_CACHE_VA_113C + s * 8) >>> 0) !== 0) {
            s = (s + 1) | 0
            continue
          }
          break
        }
        if (s >= 0xff) {
          s = nextFree
        }
        m.setU32((D2COMMON_ITEM_GFX_CACHE_VA_113C + s * 8) >>> 0, code)
        m.setU32((D2COMMON_ITEM_GFX_CACHE_VA_113C + 4 + s * 8) >>> 0, s16(m.u16(edx)) >>> 0)
        if (s === nextFree) {
          nextFree = (nextFree + 1) | 0
        }
      }

      edx = (edx + ITEMS_TXT_STRIDE_113C) >>> 0
    }
  }

  m.setU32(D2COMMON_ITEM_GFX_CACHE_COUNT_VA_113C, 0xff)
}

/**
 * `@va D2Common:0x6FD6F630` (`INVENTORY_LinkItemToGridList`, `ecx = pItem`, `esi = pGrid`,
 * stack `[esp+4] = pInventory`, `ret 4`, void).
 */
export function INVENTORY_LinkItemToGridList113c(
  m: Memory113c,
  pItem: number,
  pGrid: number,
  pInventory: number,
): void {
  const pExtra = itemExtraOrZero(m, pItem, true)
  if (pExtra === 0) return
  if (m.u32(pExtra) !== pInventory >>> 0) return

  const pLast = m.get(pGrid, D2InventoryGridStrc.pLastItem)
  if (pLast === 0) {
    m.set(pGrid, D2InventoryGridStrc.pFirstItem, pItem >>> 0)
  } else {
    const pLastExtra = itemExtraOrZero(m, pLast, true)
    if (pLastExtra !== 0) {
      m.setU32((pLastExtra + ITEM_EXTRA_OFF_113C.pNextGridItem) >>> 0, pItem >>> 0)
    }
  }
  const prevLast = m.get(pGrid, D2InventoryGridStrc.pLastItem)
  m.setU32((pExtra + ITEM_EXTRA_OFF_113C.pPrevGridItem) >>> 0, prevLast)
  m.set(pGrid, D2InventoryGridStrc.pLastItem, pItem >>> 0)
}

/**
 * `@va D2Common:0x6FD6F690` (`INVENTORY_LinkItemToInventoryList`, `ecx = pItem`, `esi = pInventory`,
 * `ret`, void).
 */
export function INVENTORY_LinkItemToInventoryList113c(m: Memory113c, pItem: number, pInventory: number): void {
  const pExtra = itemExtraOrZero(m, pItem, true)
  if (pExtra === 0) return

  const pLast = m.get(pInventory, D2InventoryStrc.pLastItem)
  if (pLast === 0) {
    m.set(pInventory, D2InventoryStrc.pFirstItem, pItem >>> 0)
  } else {
    const pLastExtra = itemExtraOrZero(m, pLast, true)
    if (pLastExtra !== 0) {
      m.setU32((pLastExtra + ITEM_EXTRA_OFF_113C.pNextItem) >>> 0, pItem >>> 0)
    }
  }
  const prevLast = m.get(pInventory, D2InventoryStrc.pLastItem)
  m.setU32((pExtra + ITEM_EXTRA_OFF_113C.pPrevItem) >>> 0, prevLast)
  m.set(pInventory, D2InventoryStrc.pLastItem, pItem >>> 0)
  m.setU32(pExtra, pInventory >>> 0)
}

/**
 * `@va D2Common:0x6FD6F6E0` (`D2Common.#10391` `INVENTORY_IsItemOwnedByInventory`,
 * stdcall `[esp+4] = pInventory`, `[esp+8] = pItem`, `ret 8` -> `0` or `1`).
 */
export function INVENTORY_IsItemOwnedByInventory113c(m: Memory113c, pInventory: number, pItem: number): number {
  if (pInventory === 0) return 0
  const pExtra = itemExtraOrZero(m, pItem, true)
  if (pExtra === 0) return 0
  return m.u32(pExtra) === pInventory >>> 0 ? 1 : 0
}

/**
 * `@va D2Common:0x6FD6F8F0` (`INVENTORY_UnlinkItemFromList`, `edx = pItem`, `esi = pListHeader`
 * (`{ pFirstItem (+0), pLastItem (+4) }`, e.g. `pInventory + 0x0C`), `ret`, void).
 */
export function INVENTORY_UnlinkItemFromList113c(m: Memory113c, pItem: number, pListHeader: number): void {
  const pExtra = itemExtraOrZero(m, pItem, true)
  if (pExtra === 0) return

  const pPrev = m.u32((pExtra + ITEM_EXTRA_OFF_113C.pPrevItem) >>> 0)
  if (pPrev === 0) {
    if (m.u32(pListHeader >>> 0) === pItem >>> 0) {
      const pNext0 = m.u32((pExtra + ITEM_EXTRA_OFF_113C.pNextItem) >>> 0)
      m.setU32(pListHeader >>> 0, pNext0)
    }
  } else {
    const pPrevExtra = itemExtraOrZero(m, pPrev, true)
    if (pPrevExtra !== 0) {
      const pNext0 = m.u32((pExtra + ITEM_EXTRA_OFF_113C.pNextItem) >>> 0)
      m.setU32((pPrevExtra + ITEM_EXTRA_OFF_113C.pNextItem) >>> 0, pNext0)
    }
  }

  const pNext = m.u32((pExtra + ITEM_EXTRA_OFF_113C.pNextItem) >>> 0)
  if (pNext === 0) {
    if (m.u32((pListHeader + 0x4) >>> 0) === pItem >>> 0) {
      const pPrev0 = m.u32((pExtra + ITEM_EXTRA_OFF_113C.pPrevItem) >>> 0)
      m.setU32((pListHeader + 0x4) >>> 0, pPrev0)
    }
  } else {
    const pNextExtra = itemExtraOrZero(m, pNext, true)
    if (pNextExtra !== 0) {
      const pPrev0 = m.u32((pExtra + ITEM_EXTRA_OFF_113C.pPrevItem) >>> 0)
      m.setU32((pNextExtra + ITEM_EXTRA_OFF_113C.pPrevItem) >>> 0, pPrev0)
    }
  }

  m.setU32((pExtra + ITEM_EXTRA_OFF_113C.pNextItem) >>> 0, 0)
  m.setU32((pExtra + ITEM_EXTRA_OFF_113C.pPrevItem) >>> 0, 0)
}
