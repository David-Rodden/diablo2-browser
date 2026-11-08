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
  D2ItemsTxt,
  D2StaticPathStrc,
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

/** `.bss` `gpInventoryTxtTable` (`D2InventoryTxt*`, stride `0x108`) at `0x6FDF13DC` (`0x6FD632AA add eax, ds:0x6fdf13dc`). */
export const G_INVENTORY_TXT_TABLE_VA_113C = 0x6fdf13dc
/** `.bss` `sgptDataTables_nWeapClassCount` (`u32`) at `0x6FDEF020` (`0x6FD7247C mov edx, ds:0x6fdef020`). */
export const D2COMMON_WEAP_CLASS_COUNT_VA_113C = 0x6fdef020
/** `.bss` `sgptDataTables_WeapClassTable` (`{ u32 dwCode, u16 wIdx, u16 pad }[]`) at `0x6FDEF028` (`0x6FD7248B cmp [ecx*8+0x6fdef028], eax`). */
export const D2COMMON_WEAP_CLASS_TABLE_VA_113C = 0x6fdef028
/** `.bss` `sgptDataTables_pItemsCodeIndex` (`D2TxtLinkStrc*`) at `0x6FDEFF6C` (`0x6FD72145 mov ecx, ds:0x6fdeff6c`). */
export const D2COMMON_ITEMS_CODE_LINK_VA_113C = 0x6fdeff6c

/** `.data` `sgptCharInvRecCount` (`u32`) at `0x6FDEEFE4` (`0x6FD7FBBA mov edx, ds:0x6fdeefe4`). */
export const D2COMMON_CHAR_INV_REC_COUNT_VA_113C = 0x6fdeefe4
/** `.data` `sgptCharInvRecTable` (`{ u32 dwClassId, u32 nInvRecId }[7]`) at `0x6FDEEFE8` (`0x6FD7FBC9 cmp [ecx*8+0x6fdeefe8], eax`). */
export const D2COMMON_CHAR_INV_REC_TABLE_VA_113C = 0x6fdeefe8

function fogAssert113c(line: number, expr: string): never {
  throw new Error(`Fog.#10024/10265 assert at line ${line}: ${expr}`)
}

interface FogBitBufferState113c {
  pBuffer: number
  nBits: number
  nPos: number
  nPosBits: number
  bFull: number
}

/**
 * Exact 1.13c `Fog:0x6FF63CD0` core bit reader invoked by `Fog.#10129` (`BITMANIP_ReadSigned`)
 * and `Fog.#10130` (`BITMANIP_Read`).
 */
function fogBitManipReadCore113c(
  m: Memory113c,
  bitBuf: FogBitBufferState113c,
  nBitsToRead: number,
): number {
  const nBits = bitBuf.nBits | 0
  let overflow = (((bitBuf.nPos << 3) - nBits + nBitsToRead + bitBuf.nPosBits) | 0)
  if (overflow < 0) {
    overflow = 0
  }
  let edx = (nBitsToRead - overflow) | 0
  if (overflow !== 0) {
    bitBuf.bFull = 1
  }
  let edi = 0
  let eax = 0
  while (edx > 0) {
    let ebx = (8 - bitBuf.nPosBits) | 0
    if (ebx >= edx) {
      ebx = edx
    }
    const rawByte = m.u8((bitBuf.pBuffer + bitBuf.nPos) >>> 0)
    const shifted = rawByte >>> (bitBuf.nPosBits & 31)
    const masked = (shifted & ((1 << ebx) - 1)) >>> 0
    eax = (eax | ((masked << (edi & 31)) >>> 0)) >>> 0
    edi = (edi + ebx) | 0
    bitBuf.nPosBits = (bitBuf.nPosBits + ebx) | 0
    if (bitBuf.nPosBits === 8) {
      bitBuf.nPos = (bitBuf.nPos + 1) | 0
      bitBuf.nPosBits = 0
    }
    edx = (edx - ebx) | 0
  }
  return eax >>> 0
}

/**
 * Exact 1.13c `Fog.#10130` (`0x6FF64060` `BITMANIP_Read`, `__stdcall(pBitBuf, nBits)`).
 */
function fogBitManipReadUnsigned113c(
  m: Memory113c,
  bitBuf: FogBitBufferState113c,
  nBitsToRead: number,
): number {
  return fogBitManipReadCore113c(m, bitBuf, nBitsToRead)
}

/**
 * Exact 1.13c `Fog.#10129` (`0x6FF640C0` `BITMANIP_ReadSigned`, `__stdcall(pBitBuf, nBits)`).
 */
function fogBitManipReadSigned113c(
  m: Memory113c,
  bitBuf: FogBitBufferState113c,
  nBitsToRead: number,
): number {
  const eax = fogBitManipReadCore113c(m, bitBuf, nBitsToRead)
  if ((nBitsToRead | 0) < 32) {
    const signBit = (1 << ((nBitsToRead - 1) & 31)) >>> 0
    if ((eax & signBit) !== 0) {
      const negMask = (~((signBit - 1) >>> 0)) >>> 0
      return (eax | negMask) | 0
    }
  }
  return eax | 0
}

/**
 * Exact 1.13c `Fog.#10213` (`0x6FF61F00` `DATATBLS_GetLinkIndex`, `__stdcall(pLinker, dwCode, bLogError)`).
 * Performs half-open `[0, nRecords)` binary search over `pLinker->nRecords` (`+0x00`) sorted entries
 * at `pLinker->pEntries` (`+0x08`, 8-byte `{ u32 dwCode, u32 nIndex }` stride).
 */
function fogGetLinkIndex113c(m: Memory113c, pLinker: number, dwCode: number): number {
  const linker = pLinker >>> 0
  let hi = m.u32(linker) | 0
  let lo = 0
  const pEntries = m.u32((linker + 0x08) >>> 0) >>> 0
  if (hi <= 0) return -1
  const target = dwCode >>> 0
  while (lo < hi) {
    const mid = (lo + (((hi - lo) / 2) | 0)) | 0
    const entryAddr = (pEntries + ((mid * 8) | 0)) >>> 0
    const entryCode = m.u32(entryAddr) >>> 0
    if (target === entryCode) {
      return m.u32((entryAddr + 4) >>> 0) | 0
    }
    if (target < entryCode) {
      hi = mid
    } else {
      lo = (mid + 1) | 0
    }
  }
  return -1
}

/**
 * `@va D2Common:0x6FD632A0` (`D2Common.#10691` `DATATBLS_GetInventoryTxtRecord`,
 * stdcall `[esp+4] = nInvId`, `[esp+8] = bHigherRes`, `[esp+0xC] = pOutRecord`, `ret 0xC`, void).
 *
 * Asserts `(m.u32(0x6FDF13DC) + nInvId * 0x108) != 0` (`line 0x83`), then copies 66 dwords (`0x108` bytes)
 * from `m.u32(0x6FDF13DC) + (bHigherRes * 7 + nInvId) * 0x108` into `pOutRecord`.
 */
export function DATATBLS_GetInventoryTxtRecord113c(
  m: Memory113c,
  nInvId: number,
  bHigherRes: number,
  pOutRecord: number,
): void {
  const base = m.u32(G_INVENTORY_TXT_TABLE_VA_113C)
  const checkAddr = (base + imul32(nInvId | 0, 0x108)) >>> 0
  if (checkAddr === 0) {
    fogAssert113c(0x83, 'ptStats')
  }
  const idx = (imul32(bHigherRes | 0, 7) + (nInvId | 0)) | 0
  const src = (m.u32(G_INVENTORY_TXT_TABLE_VA_113C) + imul32(idx, 0x108)) >>> 0
  const dst = pOutRecord >>> 0
  for (let i = 0; i < 0x108; i += 4) {
    m.setU32((dst + i) >>> 0, m.u32((src + i) >>> 0))
  }
}

/**
 * `@va D2Common:0x6FD6DD40` (`D2Common.#10617` `INVENTORY_FreeCorpse`,
 * stdcall `[esp+4] = pInventory`, `[esp+8] = dwUnitId`, `[esp+0xC] = bCountAsCorpse`, `ret 0xC` -> `BOOL`).
 *
 * Validates `pInventory != 0` and `dwSignature == 0x01020304`, searches `pFirstCorpse` (`+0x34`) for
 * `dwUnitId (+0x04) == dwUnitId && bCountAsCorpse (+0x00) == bCountAsCorpse`, unlinks it (updating
 * `pFirstCorpse` / `pLastCorpse`), decrements `nCorpseCount (+0x3C)` if `pCorpse->bCountAsCorpse != 0`,
 * and returns `1` (`0` if not found).
 */
export function INVENTORY_FreeCorpse113c(
  m: Memory113c,
  pInventory: number,
  dwUnitId: number,
  bCountAsCorpse: number,
): number {
  const inv = pInventory >>> 0
  if (inv === 0) return 0
  if (m.get(inv, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return 0
  let pCur = m.get(inv, D2InventoryStrc.pFirstCorpse)
  if (pCur === 0) return 0
  let pPrev = 0
  const targetId = dwUnitId >>> 0
  const targetCountFlag = bCountAsCorpse >>> 0
  while (pCur !== 0) {
    if (
      m.get(pCur, D2CorpseStrc.dwUnitId) === targetId &&
      m.get(pCur, D2CorpseStrc.bCountAsCorpse) === targetCountFlag
    ) {
      break
    }
    pPrev = pCur
    pCur = m.get(pCur, D2CorpseStrc.pNextCorpse)
  }
  if (pCur === 0) return 0
  const pNext = m.get(pCur, D2CorpseStrc.pNextCorpse)
  if (pPrev !== 0) {
    m.set(pPrev, D2CorpseStrc.pNextCorpse, pNext)
    if (m.get(pPrev, D2CorpseStrc.pNextCorpse) === 0) {
      m.set(inv, D2InventoryStrc.pLastCorpse, pPrev)
    }
  } else {
    m.set(inv, D2InventoryStrc.pFirstCorpse, pNext)
    if (m.get(inv, D2InventoryStrc.pFirstCorpse) === 0) {
      m.set(inv, D2InventoryStrc.pLastCorpse, 0)
    }
  }
  if (m.get(pCur, D2CorpseStrc.bCountAsCorpse) !== 0) {
    m.set(
      inv,
      D2InventoryStrc.nCorpseCount,
      (m.get(inv, D2InventoryStrc.nCorpseCount) - 1) >>> 0,
    )
  }
  m.u32((inv + 0x04) >>> 0)
  return 1
}

/**
 * `@va D2Common:0x6FD6DDD0` (`D2Common.#10903` `INVENTORY_AllocCorpse`,
 * stdcall `[esp+4] = pInventory`, `[esp+8] = dwUnitId`, `[esp+0xC] = eClass`, `[esp+0x10] = bCountAsCorpse`, `ret 0x10` -> `D2CorpseStrc*`).
 *
 * Returns `0` if `pInventory == 0 || pInventory->dwSignature != 0x01020304`. Otherwise allocates a 16-byte
 * `D2CorpseStrc`, appends it to the tail of `pFirstCorpse` / `pLastCorpse` (`+0x34` / `+0x38`), increments
 * `nCorpseCount (+0x3C)` if `pCorpse->bCountAsCorpse != 0`, and returns the allocated `D2CorpseStrc*`.
 */
export function INVENTORY_AllocCorpse113c(
  m: Memory113c,
  pInventory: number,
  dwUnitId: number,
  eClass: number,
  bCountAsCorpse: number,
): number {
  const inv = pInventory >>> 0
  if (inv === 0 || m.get(inv, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) {
    return 0
  }
  m.u32((inv + 0x04) >>> 0)
  const pLast = m.get(inv, D2InventoryStrc.pLastCorpse)
  const pCorpse = m.alloc(0x10) >>> 0
  m.set(pCorpse, D2CorpseStrc.bCountAsCorpse, bCountAsCorpse >>> 0)
  m.set(pCorpse, D2CorpseStrc.dwUnitId, dwUnitId >>> 0)
  m.set(pCorpse, D2CorpseStrc.eClass, eClass >>> 0)
  m.set(pCorpse, D2CorpseStrc.pNextCorpse, 0)
  const pFirst = m.get(inv, D2InventoryStrc.pFirstCorpse)
  m.set(inv, D2InventoryStrc.pLastCorpse, pCorpse)
  if (pFirst === 0) {
    m.set(inv, D2InventoryStrc.pFirstCorpse, pCorpse)
  } else {
    m.set(pLast, D2CorpseStrc.pNextCorpse, pCorpse)
  }
  if (m.get(pCorpse, D2CorpseStrc.bCountAsCorpse) !== 0) {
    m.set(
      inv,
      D2InventoryStrc.nCorpseCount,
      (m.get(inv, D2InventoryStrc.nCorpseCount) + 1) >>> 0,
    )
  }
  return pCorpse
}

/**
 * `@va D2Common:0x6FD6DF20` (`D2Common.#10652` `INVENTORY_FreeAllNodes`,
 * stdcall `[esp+4] = pInventory`, `ret 4`, void).
 *
 * If `pInventory != 0 && dwSignature == 0x01020304`, walks `pFirstNode` (`+0x2C`) via `pNode->pNext` (`+0x04`,
 * `0x6FD6DF3F mov esi, [edx+4]`), frees each node via `Fog.#10046`, and zeroes `pFirstNode (+0x2C)` and `pLastNode (+0x30)`.
 */
export function INVENTORY_FreeAllNodes113c(m: Memory113c, pInventory: number): void {
  const inv = pInventory >>> 0
  if (inv === 0) return
  if (m.get(inv, D2InventoryStrc.dwSignature) !== INVENTORY_SIGNATURE_113C) return
  let pNode = m.get(inv, D2InventoryStrc.pFirstNode)
  while (pNode !== 0) {
    m.u32((inv + 0x04) >>> 0)
    const pNext = m.get(pNode, D2InventoryNodeStrc.pNext)
    pNode = pNext
  }
  m.set(inv, D2InventoryStrc.pFirstNode, 0)
  m.set(inv, D2InventoryStrc.pLastNode, 0)
}

/**
 * `@va D2Common:0x6FD6E420` (internal LTCG `INVENTORY_GetItemSaveGridPageLimits`,
 * custom reg `eax = pItem`, `ecx = pOutPageLimits6`, `ret`, void).
 *
 * If `pItem == 0`, zeroes 6 bytes at `pOutPageLimits6` (`u32 +0x00 = 0`, `u16 +0x04 = 0`) and returns.
 * Otherwise looks up `pItemsTxt[pItem->dwClassId]` (asserting `dwClassId < nItemsTxtRecordCount` at `line 0x121F`
 * and `pItemsTxt != 0` at `line 0x1EF`) and copies the 6 page-limit bytes `pRec + 0x116 .. pRec + 0x11B` into
 * `pOutPageLimits6[0..5]`.
 */
export function INVENTORY_GetItemSaveGridPageLimits113c(
  m: Memory113c,
  pItem: number,
  pOutPageLimits6: number,
): void {
  const item = pItem >>> 0
  const out = pOutPageLimits6 >>> 0
  if (item === 0) {
    m.setU32(out, 0)
    m.setU16((out + 4) >>> 0, 0)
    return
  }
  const dwClassId = m.get(item, D2UnitStrc.dwClassId) >>> 0
  if (dwClassId >= (m.u32(D2COMMON_ITEMS_TXT_COUNT_VA_113C) >>> 0)) {
    fogAssert113c(0x121f, 'ptItemStats')
  }
  const base = m.u32(D2COMMON_ITEMS_TXT_PTR_VA_113C) >>> 0
  if (base === 0) {
    fogAssert113c(0x1ef, 'ptItemTables')
  }
  const pRec = (base + imul32(dwClassId | 0, ITEMS_TXT_STRIDE_113C)) >>> 0
  if (pRec === 0) {
    fogAssert113c(0x121f, 'ptItemStats')
  }
  m.setU8(out, m.u8((pRec + 0x116) >>> 0))
  m.setU8((out + 1) >>> 0, m.u8((pRec + 0x117) >>> 0))
  m.setU8((out + 2) >>> 0, m.u8((pRec + 0x118) >>> 0))
  m.setU8((out + 3) >>> 0, m.u8((pRec + 0x119) >>> 0))
  m.setU8((out + 4) >>> 0, m.u8((pRec + 0x11a) >>> 0))
  m.setU8((out + 5) >>> 0, m.u8((pRec + 0x11b) >>> 0))
}

/**
 * `@va D2Common:0x6FD6E710` (`D2Common.#10523` `INVENTORY_AllocInventory`,
 * stdcall `[esp+4] = pMemPool`, `[esp+8] = pOwnerUnit`, `ret 8` -> `D2InventoryStrc*`).
 *
 * Resolves `pMemPool` (falling back to `pOwnerUnit->pMemPool (+0x08)` if `pMemPool == 0 && pOwnerUnit != 0`),
 * allocates a 64-byte (`0x40`) `D2InventoryStrc` via `Fog.#10045`, zeroes all 16 dwords, sets `dwSignature = 0x01020304`,
 * `pMemPool (+0x04)`, `pOwner (+0x08)`, and if `pOwnerUnit != 0` links `pOwnerUnit->pInventory (+0x60) = pInv`
 * and `pInv->dwLeftItemGuid (+0x24) = pOwnerUnit->dwUnitId (+0x0C)`.
 */
export function INVENTORY_AllocInventory113c(
  m: Memory113c,
  pMemPool: number,
  pOwnerUnit: number,
): number {
  let ebx = pMemPool >>> 0
  const esi = pOwnerUnit >>> 0
  if (ebx === 0 && esi !== 0) {
    ebx = m.get(esi, D2UnitStrc.pMemPool)
  }
  const pInv = m.alloc(0x40) >>> 0
  if (pInv === 0) {
    return 0
  }
  for (let i = 0; i < 0x40; i += 4) {
    m.setU32((pInv + i) >>> 0, 0)
  }
  m.set(pInv, D2InventoryStrc.dwSignature, INVENTORY_SIGNATURE_113C)
  m.setU32((pInv + 0x04) >>> 0, ebx)
  m.setU32((pInv + 0x08) >>> 0, esi)
  if (esi !== 0) {
    m.set(esi, D2UnitStrc.pInventory, pInv)
    m.set(pInv, D2InventoryStrc.dwLeftItemGuid, m.get(esi, D2UnitStrc.dwUnitId))
  }
  return pInv
}

/**
 * `@va D2Common:0x6FD72000` (internal `ITEMS_DecodeItemCompactBitstream`,
 * stdcall `[esp+4] = pBitstreamData`, `[esp+8] = nDataSize`, `[esp+0xC] = bCheckHeader`,
 * `[esp+0x10] = pOutHeader`, `[esp+0x14] = nVersion`, `ret 0x14` -> `BOOL`).
 *
 * Initializes a local `D2BitBufferStrc` (`Fog.#10126`), optionally checks the 16-bit `'JM'` (`0x4D4A`) magic via
 * `Fog.#10129`, unpacks `dwItemFlags (+0x0C)`, discards 10-bit format, unpacks 3-bit `nItemMode (+0x08)`, unpacks
 * either 16-bit `nPosX (+0x04)` / `nPosY (+0x06)` (when `mode == 3 || mode == 5`) or `nBodyLoc (+0x11)`, `nGridX (+0x04)`,
 * `nGridY (+0x06)`, `nInvPage (+0x10)`, resolves the 4-byte item code (or `'ear '` when `edi & 0x10000`, remapping `'nec '` -> `'neg '`
 * when `nVersion <= 0x5C`) via `Fog.#10213(m.u32(0x6FDEFF6C), dwCode, 0)` into `nClassId (+0x00)`, and unpacks
 * `nGemSockets (+0x14)` (`0` when `edi & 0x02200000`, else 3 bits).
 */
export function ITEMS_DecodeItemCompactBitstream113c(
  m: Memory113c,
  pBitstreamData: number,
  nDataSize: number,
  bCheckHeader: number,
  pOutHeader: number,
  nVersion: number,
): number {
  const out = pOutHeader >>> 0
  const bitBuf: FogBitBufferState113c = {
    pBuffer: pBitstreamData >>> 0,
    nBits: imul32(nDataSize | 0, 8),
    nPos: 0,
    nPosBits: 0,
    bFull: 0,
  }

  if ((bCheckHeader | 0) !== 0) {
    const hdr = fogBitManipReadSigned113c(m, bitBuf, 16)
    if (hdr !== 0x4d4a) {
      return 0
    }
  }

  const edi = fogBitManipReadUnsigned113c(m, bitBuf, 32)
  m.setU32((out + 0x0c) >>> 0, edi)
  fogBitManipReadUnsigned113c(m, bitBuf, 10)

  const mode = fogBitManipReadUnsigned113c(m, bitBuf, 3) & 0xff
  m.setU8((out + 0x08) >>> 0, mode)

  const al = m.u8((out + 0x08) >>> 0)
  if (al === 3 || al === 5) {
    const posX = fogBitManipReadUnsigned113c(m, bitBuf, 16) & 0xffff
    m.setU16((out + 0x04) >>> 0, posX)
    const posY = fogBitManipReadUnsigned113c(m, bitBuf, 16) & 0xffff
    m.setU16((out + 0x06) >>> 0, posY)
  } else {
    const bodyLoc = fogBitManipReadUnsigned113c(m, bitBuf, 4) & 0xff
    m.setU8((out + 0x11) >>> 0, bodyLoc)
    const gridX = fogBitManipReadUnsigned113c(m, bitBuf, 4) & 0xffff
    m.setU16((out + 0x04) >>> 0, gridX)
    const gridY = fogBitManipReadUnsigned113c(m, bitBuf, 4) & 0xffff
    m.setU16((out + 0x06) >>> 0, gridY)
    const invPage = (fogBitManipReadUnsigned113c(m, bitBuf, 3) - 1) & 0xff
    m.setU8((out + 0x10) >>> 0, invPage)
  }

  let dwCode = 0x20726165
  if ((edi & 0x00010000) === 0) {
    dwCode = fogBitManipReadUnsigned113c(m, bitBuf, 32) >>> 0
    if ((nVersion | 0) <= 0x5c && dwCode === 0x2063656e) {
      dwCode = 0x2067656e
    }
  }

  const pLinker = m.u32(D2COMMON_ITEMS_CODE_LINK_VA_113C)
  const linkIdx = fogGetLinkIndex113c(m, pLinker, dwCode) >>> 0
  m.setU32((out + 0x00) >>> 0, linkIdx)

  if ((edi & 0x02200000) !== 0) {
    m.setU32((out + 0x14) >>> 0, 0)
    return 1
  }

  const nSockets = fogBitManipReadUnsigned113c(m, bitBuf, 3) >>> 0
  m.setU32((out + 0x14) >>> 0, nSockets)
  return 1
}

/**
 * `@va D2Common:0x6FD72170` (`D2Common.#10075` `ITEMS_SetItemFormat`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = wFormat`, `ret 8`, void).
 *
 * Asserts `pItem != 0` (`line 0x1510`), `pItem->dwUnitType == 4` (`line 0x1511`), and `pItemData != 0` (`line 0x1513`),
 * then writes `pItemData->wItemFormat (+0x30) = wFormat & 0xFFFF`.
 */
export function ITEMS_SetItemFormat113c(m: Memory113c, pItem: number, wFormat: number): void {
  const item = pItem >>> 0
  if (item === 0) {
    fogAssert113c(0x1510, 'hItem')
  }
  if (m.get(item, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    fogAssert113c(0x1511, 'UnitGetType(hItem) == UNIT_ITEM')
  }
  const pItemData = m.get(item, D2UnitStrc.pUnitData)
  if (pItemData === 0) {
    fogAssert113c(0x1513, 'ptItemData')
  }
  m.setU16((pItemData + 0x30) >>> 0, wFormat & 0xffff)
}

/**
 * `@va D2Common:0x6FD72310` (`D2Common.#10906` `ITEMS_CanPlayerClassUseItem`,
 * stdcall `[esp+4] = pPlayer`, `[esp+8] = pItem`, `ret 8` -> `BOOL`).
 *
 * Asserts `pItem != 0` (`line 0x119C`) and `pPlayer != 0` (`line 0x119E`). If `pPlayer->dwUnitType != 0`
 * or `pPlayer->dwClassId != 4` (`PLAYERCLASS_BARBARIAN`), returns `0`. Otherwise resolves `pItemsTxt` via
 * `DATATBLS_GetItemsTxtRecord` (`0x6FDC19A0`, asserting `pRec != 0` at `line 0x11A6`) and returns
 * `m.u8(pRec + 0x13D) != 0 ? 1 : 0`.
 */
export function ITEMS_CanPlayerClassUseItem113c(
  m: Memory113c,
  pPlayer: number,
  pItem: number,
): number {
  const item = pItem >>> 0
  if (item === 0) {
    fogAssert113c(0x119c, 'hItem')
  }
  const player = pPlayer >>> 0
  if (player === 0) {
    fogAssert113c(0x119e, 'hPlayer')
  }
  if (m.get(player, D2UnitStrc.dwUnitType) !== 0) {
    return 0
  }
  if (m.get(player, D2UnitStrc.dwClassId) !== 4) {
    return 0
  }
  const classId = m.get(item, D2UnitStrc.dwClassId) >>> 0
  if (classId >= (m.u32(D2COMMON_ITEMS_TXT_COUNT_VA_113C) >>> 0)) {
    fogAssert113c(0x11a6, 'ptItemStats')
  }
  const base = m.u32(D2COMMON_ITEMS_TXT_PTR_VA_113C) >>> 0
  if (base === 0) {
    fogAssert113c(0x1ef, 'ptItemTables')
  }
  const pRec = (base + imul32(classId | 0, ITEMS_TXT_STRIDE_113C)) >>> 0
  if (pRec === 0) {
    fogAssert113c(0x11a6, 'ptItemStats')
  }
  return m.u8((pRec + 0x13d) >>> 0) !== 0 ? 1 : 0
}

/**
 * `@va D2Common:0x6FD72430` (`D2Common.#10633` `ITEMS_GetWeaponClassCodeIdx`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AX` `u16`).
 *
 * Resolves `dwClassId = pItem != 0 ? pItem->dwClassId : -1`, looks up `pItemsTxt[dwClassId]`
 * (asserting `dwClassId < nItemsTxtRecordCount` at `line 0x1146` and `pItemsTxt != 0` at `line 0x1EF`),
 * reads `dwWeapClass = m.u32(pRec + 0xC0)`, and scans `sgptDataTables_WeapClassTable` (`0x6FDEF028`,
 * count at `0x6FDEF020`) returning the matching `u16` index at `0x6FDEF02C + i * 8` (or `0` if not found).
 */
export function ITEMS_GetWeaponClassCodeIdx113c(m: Memory113c, pItem: number): number {
  const item = pItem >>> 0
  const dwClassId = item !== 0 ? m.get(item, D2UnitStrc.dwClassId) >>> 0 : 0xffffffff
  if (dwClassId >= (m.u32(D2COMMON_ITEMS_TXT_COUNT_VA_113C) >>> 0)) {
    fogAssert113c(0x1146, 'ptItemStats')
  }
  const base = m.u32(D2COMMON_ITEMS_TXT_PTR_VA_113C) >>> 0
  if (base === 0) {
    fogAssert113c(0x1ef, 'ptItemTables')
  }
  const pRec = (base + imul32(dwClassId | 0, ITEMS_TXT_STRIDE_113C)) >>> 0
  if (pRec === 0) {
    fogAssert113c(0x1146, 'ptItemStats')
  }
  const count = m.u32(D2COMMON_WEAP_CLASS_COUNT_VA_113C) >>> 0
  if (count === 0) return 0
  const dwWeapClass = m.u32((pRec + 0xc0) >>> 0) >>> 0
  for (let ecx = 0; ecx < count; ecx++) {
    const entryAddr = (D2COMMON_WEAP_CLASS_TABLE_VA_113C + ecx * 8) >>> 0
    if (m.u32(entryAddr) === dwWeapClass) {
      return m.u16((entryAddr + 4) >>> 0)
    }
  }
  return 0
}

/**
 * `@va D2Common:0x6FD724C0` (`D2Common.#10815` `ITEMS_GetCellOverwrite`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `pItemData->dwItemFlags2 (+0x0C)`).
 *
 * Asserts `pItem != 0` (`line 0x10C8`), `pItem->dwUnitType == 4` (`line 0x10C9`), and `pItemData != 0` (`line 0x10CB`),
 * then returns `m.u32(pItemData + 0x0C)`.
 */
export function ITEMS_GetCellOverwrite113c(m: Memory113c, pItem: number): number {
  const item = pItem >>> 0
  if (item === 0) {
    fogAssert113c(0x10c8, 'hItem')
  }
  if (m.get(item, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    fogAssert113c(0x10c9, 'UnitGetType(hItem) == UNIT_ITEM')
  }
  const pItemData = m.get(item, D2UnitStrc.pUnitData)
  if (pItemData === 0) {
    fogAssert113c(0x10cb, 'ptItemData')
  }
  return m.u32((pItemData + 0x0c) >>> 0)
}

/**
 * `@va D2Common:0x6FD72510` (`D2Common.#10485` `ITEMS_SetCellOverwrite`,
 * stdcall `[esp+4] = pItem`, `[esp+8] = nCell`, `ret 8`, void).
 *
 * Asserts `pItem != 0` (`line 0x10BD`), `pItem->dwUnitType == 4` (`line 0x10BE`), and `pItemData != 0` (`line 0x10C0`),
 * then writes `m.setU32(pItemData + 0x0C, nCell)`.
 */
export function ITEMS_SetCellOverwrite113c(m: Memory113c, pItem: number, nCell: number): void {
  const item = pItem >>> 0
  if (item === 0) {
    fogAssert113c(0x10bd, 'hItem')
  }
  if (m.get(item, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    fogAssert113c(0x10be, 'UnitGetType(hItem) == UNIT_ITEM')
  }
  const pItemData = m.get(item, D2UnitStrc.pUnitData)
  if (pItemData === 0) {
    fogAssert113c(0x10c0, 'ptItemData')
  }
  m.setU32((pItemData + 0x0c) >>> 0, nCell >>> 0)
}

/**
 * `@va D2Common:0x6FD72760` (`D2Common.#10751` `ITEMS_CheckItemFlagCompactSaveByClassId`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `(m.u32(pRec + 0xDC) & 0x2) >>> 0`).
 *
 * Looks up `pItemsTxt[nItemId]` (asserting `(nItemId >>> 0) < nItemsTxtRecordCount` at `line 0x104B`
 * and `pItemsTxt != 0` at `line 0x1EF`) and returns `(m.u32(pRec + 0xDC) & 0x2) >>> 0`.
 */
export function ITEMS_CheckItemFlagCompactSaveByClassId113c(
  m: Memory113c,
  nItemId: number,
): number {
  const id = nItemId >>> 0
  if (id >= (m.u32(D2COMMON_ITEMS_TXT_COUNT_VA_113C) >>> 0)) {
    fogAssert113c(0x104b, 'ptItemStats')
  }
  const base = m.u32(D2COMMON_ITEMS_TXT_PTR_VA_113C) >>> 0
  if (base === 0) {
    fogAssert113c(0x1ef, 'ptItemTables')
  }
  const pRec = (base + imul32(id | 0, ITEMS_TXT_STRIDE_113C)) >>> 0
  if (pRec === 0) {
    fogAssert113c(0x104b, 'ptItemStats')
  }
  return (m.u32((pRec + 0xdc) >>> 0) & 0x2) >>> 0
}

/**
 * `@va D2Common:0x6FD72E70` (`D2Common.#10599` `ITEMS_GetInvWidthFromId`,
 * stdcall `[esp+4] = nItemId`, `ret 4` -> `m.u8(pRec + 0x11C)`).
 *
 * Looks up `pItemsTxt[nItemId]` (asserting `(nItemId >>> 0) < nItemsTxtRecordCount` at `line 0x907`
 * and `pItemsTxt != 0` at `line 0x1EF`) and returns `m.u8(pRec + 0x11C)`.
 */
export function ITEMS_GetInvWidthFromId113c(m: Memory113c, nItemId: number): number {
  const id = nItemId >>> 0
  if (id >= (m.u32(D2COMMON_ITEMS_TXT_COUNT_VA_113C) >>> 0)) {
    fogAssert113c(0x907, 'ptItemStats')
  }
  const base = m.u32(D2COMMON_ITEMS_TXT_PTR_VA_113C) >>> 0
  if (base === 0) {
    fogAssert113c(0x1ef, 'ptItemTables')
  }
  const pRec = (base + imul32(id | 0, ITEMS_TXT_STRIDE_113C)) >>> 0
  if (pRec === 0) {
    fogAssert113c(0x907, 'ptItemStats')
  }
  return m.u8((pRec + 0x11c) >>> 0)
}

/**
 * `@va D2Common:0x6FD731E0` (`D2Common.#10505` `ITEMS_GetComponentFromItem`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `AL` `m.u8(pRec + 0x115)`).
 *
 * Asserts `pItem != 0` (`line 0x635`) and `pItem->dwUnitType == 4` (`line 0x636`), resolves `pItemsTxt`
 * via `DATATBLS_GetItemsTxtRecord` (`0x6FDC19A0`, asserting `pRec != 0` at `line 0x639`), and returns
 * `m.u8(pRec + 0x115)`.
 */
export function ITEMS_GetComponentFromItem113c(m: Memory113c, pItem: number): number {
  const item = pItem >>> 0
  if (item === 0) {
    fogAssert113c(0x635, 'hItem')
  }
  if (m.get(item, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    fogAssert113c(0x636, 'UnitGetType(hItem) == UNIT_ITEM')
  }
  const classId = m.get(item, D2UnitStrc.dwClassId) >>> 0
  if (classId >= (m.u32(D2COMMON_ITEMS_TXT_COUNT_VA_113C) >>> 0)) {
    fogAssert113c(0x639, 'ptItemStats')
  }
  const base = m.u32(D2COMMON_ITEMS_TXT_PTR_VA_113C) >>> 0
  if (base === 0) {
    fogAssert113c(0x1ef, 'ptItemTables')
  }
  const pRec = (base + imul32(classId | 0, ITEMS_TXT_STRIDE_113C)) >>> 0
  if (pRec === 0) {
    fogAssert113c(0x639, 'ptItemStats')
  }
  return m.u8((pRec + 0x115) >>> 0)
}

/**
 * `@va D2Common:0x6FD7F270` (`D2Common.#11124` `UNITS_SetStaticPathPosY`,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = nPosY`, `ret 8`, void).
 *
 * Asserts `pUnit != 0` (`line 0x706`) and `dwUnitType == 2 || (dwUnitType > 3 && dwUnitType <= 5)` (`line 0x711`),
 * then writes `pUnit->pPath->nPosY (+0x10) = nPosY`.
 */
export function UNITS_SetStaticPathPosY113c(m: Memory113c, pUnit: number, nPosY: number): void {
  const u = pUnit >>> 0
  if (u === 0) {
    fogAssert113c(0x706, 'hUnit')
  }
  const unitType = m.get(u, D2UnitStrc.dwUnitType) | 0
  if (unitType !== 2 && (unitType <= 3 || unitType > 5)) {
    fogAssert113c(0x711, 'UnitIsStaticPath(hUnit)')
  }
  const pPath = m.get(u, D2UnitStrc.pPath)
  m.set(pPath, D2StaticPathStrc.nPosY, nPosY >>> 0)
}

/**
 * `@va D2Common:0x6FD7F2C0` (`D2Common.#10500` `UNITS_SetStaticPathPosX`,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = nPosX`, `ret 8`, void).
 *
 * Asserts `pUnit != 0` (`line 0x6EF`) and `dwUnitType == 2 || (dwUnitType > 3 && dwUnitType <= 5)` (`line 0x6FA`),
 * then writes `pUnit->pPath->nPosX (+0x0C) = nPosX`.
 */
export function UNITS_SetStaticPathPosX113c(m: Memory113c, pUnit: number, nPosX: number): void {
  const u = pUnit >>> 0
  if (u === 0) {
    fogAssert113c(0x6ef, 'hUnit')
  }
  const unitType = m.get(u, D2UnitStrc.dwUnitType) | 0
  if (unitType !== 2 && (unitType <= 3 || unitType > 5)) {
    fogAssert113c(0x6fa, 'UnitIsStaticPath(hUnit)')
  }
  const pPath = m.get(u, D2UnitStrc.pPath)
  m.set(pPath, D2StaticPathStrc.nPosX, nPosX >>> 0)
}

/**
 * `@va D2Common:0x6FD7F8A0` (`D2Common.#10817` `UNITS_GetBeltTypeFromItem`,
 * stdcall `[esp+4] = pItem`, `ret 4` -> `m.u8(pRec + 0x130)`).
 *
 * Asserts `pItem != 0 && pItem->dwUnitType == 4` (`line 0xF20`), looks up `pItemsTxt[pItem->dwClassId]`
 * (asserting `dwClassId < nItemsTxtRecordCount` at `line 0xF24` and `pItemsTxt != 0` at `line 0x1EF`),
 * and returns `m.u8(pRec + 0x130)`.
 */
export function UNITS_GetBeltTypeFromItem113c(m: Memory113c, pItem: number): number {
  const item = pItem >>> 0
  if (item === 0 || m.get(item, D2UnitStrc.dwUnitType) !== UNIT_ITEM) {
    fogAssert113c(0xf20, 'hItem && UnitGetType(hItem) == UNIT_ITEM')
  }
  const classId = m.get(item, D2UnitStrc.dwClassId) >>> 0
  if (classId >= (m.u32(D2COMMON_ITEMS_TXT_COUNT_VA_113C) >>> 0)) {
    fogAssert113c(0xf24, 'ptItemStats')
  }
  const base = m.u32(D2COMMON_ITEMS_TXT_PTR_VA_113C) >>> 0
  if (base === 0) {
    fogAssert113c(0x1ef, 'ptItemTables')
  }
  const pRec = (base + imul32(classId | 0, ITEMS_TXT_STRIDE_113C)) >>> 0
  if (pRec === 0) {
    fogAssert113c(0xf24, 'ptItemStats')
  }
  return m.u8((pRec + 0x130) >>> 0)
}

/**
 * `@va D2Common:0x6FD7FB60` (`D2Common.#10402` `UNITS_GetInventoryRecordId`,
 * stdcall `[esp+4] = pUnit`, `[esp+8] = nInvPage`, `[esp+0xC] = bLoD`, `ret 0xC` -> `nInvRecordId`).
 *
 * Asserts `pUnit != 0` (`line 0xA2F` / `2607`), then dispatches on `pUnit->dwUnitType`:
 * - `0` (`UNIT_PLAYER`): switches on `nInvPage & 0xFF` (`1 -> 6`, `2 -> 7`, `3 -> 9`, `4 -> bLoD ? 12 : 8`,
 *   default scans `sgptCharInvRecTable` at `0x6FDEEFE8` with count at `0x6FDEEFE4` for `pUnit->dwClassId`).
 * - `1` (`UNIT_MONSTER`): returns `5`.
 * - `2` (`UNIT_OBJECT`): returns `10` for `dwClassId == 0x152`, `11` for `dwClassId == 0x153`, else `-1`.
 * - Otherwise returns `-1` (`0xFFFFFFFF`).
 */
export function UNITS_GetInventoryRecordId113c(
  m: Memory113c,
  pUnit: number,
  nInvPage: number,
  bLoD: number,
): number {
  const u = pUnit >>> 0
  if (u === 0) {
    fogAssert113c(0xa2f, 'hUnit')
  }
  const dwUnitType = m.get(u, D2UnitStrc.dwUnitType) >>> 0
  if (dwUnitType === 0) {
    switch (nInvPage & 0xff) {
      case 1:
        return 6
      case 2:
        return 7
      case 3:
        return 9
      case 4:
        return (bLoD | 0) !== 0 ? 12 : 8
      default: {
        const count = m.u32(D2COMMON_CHAR_INV_REC_COUNT_VA_113C) | 0
        if (count <= 0) return 0xffffffff
        const dwClassId = m.get(u, D2UnitStrc.dwClassId) >>> 0
        for (let ecx = 0; ecx < count; ecx++) {
          if (m.u32((D2COMMON_CHAR_INV_REC_TABLE_VA_113C + ecx * 8) >>> 0) === dwClassId) {
            return m.u32((D2COMMON_CHAR_INV_REC_TABLE_VA_113C + 4 + ecx * 8) >>> 0) >>> 0
          }
        }
        return 0xffffffff
      }
    }
  }
  if (dwUnitType === 1) {
    return 5
  }
  if (dwUnitType === 2) {
    const dwClassId = m.get(u, D2UnitStrc.dwClassId) >>> 0
    if (dwClassId === 0x152) return 10
    if (dwClassId === 0x153) return 11
    return 0xffffffff
  }
  return 0xffffffff
}

/**
 * `@va D2Common:0x6FD93710` (`D2Common.#10698` `COMPOSIT_GetItemPageLimitByBodyLoc`,
 * stdcall `[esp+4] = nBodyLoc`, `[esp+8] = pPageLimits6`, `ret 8` -> `u8` page limit).
 *
 * Asserts `nBodyLoc < 0x10` (`line 0x265` / `613`), switches on `(nBodyLoc - 1) >>> 0`
 * (`0 -> [ptr+2]`, `1 -> [ptr+3]`, `2 -> [ptr+0]`, `3 -> [ptr+1]`, `7 -> [ptr+4]`, `8 -> [ptr+5]`),
 * and asserts at `line 0x274` (`628`) on any other `nBodyLoc`.
 */
export function COMPOSIT_GetItemPageLimitByBodyLoc113c(
  m: Memory113c,
  nBodyLoc: number,
  pPageLimits6: number,
): number {
  if ((nBodyLoc | 0) >= 0x10) {
    fogAssert113c(0x265, 'nBodyLoc < NUM_BODYLOC')
  }
  const ptr = pPageLimits6 >>> 0
  switch (((nBodyLoc | 0) - 1) >>> 0) {
    case 0:
      return m.u8((ptr + 2) >>> 0)
    case 1:
      return m.u8((ptr + 3) >>> 0)
    case 2:
      return m.u8(ptr)
    case 3:
      return m.u8((ptr + 1) >>> 0)
    case 7:
      return m.u8((ptr + 4) >>> 0)
    case 8:
      return m.u8((ptr + 5) >>> 0)
    default:
      fogAssert113c(0x274, '0')
  }
}


