/**
 * Diablo II v1.13c `D2Common.dll` room/outdoor/item-mods (`Drlg\DrlgRoom.cpp`, `Drlg\OutPlace.cpp`, `Items\ItemMods.cpp`)
 * leaf functions, image base `0x6FD50000`.
 *
 * Every function below is a 1:1 port of the cited disassembly (`objdump -d -M intel` on `D2Common.dll`).
 */
import type { Memory113c } from '../../mem/sparse-memory.ts';
import {
  D2DrlgCoordStrc,
  D2DrlgLevelStrc,
  D2DrlgOrthStrc,
  D2RoomExStrc,
  D2StatListExStrc,
  D2StatListStrc,
  D2UnitStrc,
} from '../../mem/layout.generated.ts';
import { imul32 } from '../int-math.ts';
import { STATLIST_AddStat113c, STATLIST_SetStat113c } from '../statlist.ts';

/**
 * Switch index table at `0x6FD95668` (212 bytes for `u = (nStatId - 6) >>> 0 <= 0xD3`).
 * - `0` (`u in {0..5, 210, 211}`, i.e. `nStatId in {6..11, 216, 217}`): shifts `*pValue <<= 8` and returns `0` (`EAX = 0`).
 * - `1` (`u in {51, 52}`, i.e. `nStatId in {57, 58}`): no-op, returns `1` (`EAX = 1`).
 * - `2` (all other `u <= 0xD3`): no-op, returns `2` (`EAX = 2`).
 * Copied verbatim from `D2Common.dll` v1.13c.
 */
export const FIXED_POINT_STAT_SWITCH_6FD95668 = Uint8Array.from([
  0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1,
  1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 0, 0,
]);

/**
 * `D2Common.dll` `.data` addresses used by `D2Common_10665_ApplyMonProp113c` (`0x6FD95990`).
 */
export const SGPT_DATA_TABLES_PTR_VA_6FDE9E1C = 0x6fde9e1c;
export const ITEMMOD_FUNCS_TABLE_VA_6FDEB0C8 = 0x6fdeb0c8;
export const ITEMMOD_FUNCS_COUNT_VA_6FDEB15C = 0x6fdeb15c;

/**
 * `@va D2Common:0x6FD67B70` (`DRLGOUTPLACE_StepMazeLinkNode113c`, custom `eax = pNode`, `edi = ppRootNode`, `ret`).
 *
 * Advances a maze link node's direction cursor (`+0x18`), direction (`+0x1C`), and step count (`+0x14`).
 * When step count reaches `3`, walks up the parent chain (`+0x20`) until reaching `*ppRootNode` (returns `0`)
 * or finding an ancestor whose incremented step count is not `3`.
 */
export function DRLGOUTPLACE_StepMazeLinkNode113c(
  m: Memory113c,
  pNode: number,
  ppRootNode: number,
): number {
  let cur = pNode >>> 0;
  let nStep = m.u32((cur + 0x14) >>> 0) | 0;
  if (nStep < 4) {
    const pCursor = (m.u32((cur + 0x18) >>> 0) + 1) >>> 0;
    m.setU32((cur + 0x18) >>> 0, pCursor);
    const dir = (m.u8((cur + 0x1c) >>> 0) + m.u8(pCursor)) & 0x03;
    m.setU8((cur + 0x1c) >>> 0, dir);
  }
  nStep = (nStep + 1) | 0;
  m.setU32((cur + 0x14) >>> 0, nStep >>> 0);
  if (nStep !== 3) {
    return cur;
  }

  while (true) {
    if (cur === m.u32(ppRootNode)) {
      return 0;
    }
    cur = m.u32((cur + 0x20) >>> 0);
    const pCursor = (m.u32((cur + 0x18) >>> 0) + 1) >>> 0;
    m.setU32((cur + 0x18) >>> 0, pCursor);
    const dir = (m.u8((cur + 0x1c) >>> 0) + m.u8(pCursor)) & 0x03;
    m.setU8((cur + 0x1c) >>> 0, dir);
    const parentStep = ((m.u32((cur + 0x14) >>> 0) | 0) + 1) | 0;
    m.setU32((cur + 0x14) >>> 0, parentStep >>> 0);
    if (parentStep !== 3) {
      return cur;
    }
  }
}

/**
 * `@va D2Common:0x6FD94540` (`DRLGROOM_PackAdjacentRooms113c`, custom `edx = pRoomEx`, `edi = ppOutRooms1`, `ret`).
 *
 * Iterates `i = 0 .. pRoomEx->nRoomsNear - 1`, packs non-NULL `pRoomEx->ppRoomsNear[i]->pRoom1 (+0x30)` pointers
 * into `ppOutRooms1[0..writeCount-1]`, zeroes `ppOutRooms1[writeCount..nRoomsNear-1]`, and returns `writeCount`.
 */
export function DRLGROOM_PackAdjacentRooms113c(
  m: Memory113c,
  pRoomEx: number,
  ppOutRooms1: number,
): number {
  let writeCount = 0;
  const nNear = m.get(pRoomEx, D2RoomExStrc.nRoomsNear) | 0;
  if (nNear > 0) {
    for (let i = 0; i < nNear; i++) {
      const ppRoomsNear = m.get(pRoomEx, D2RoomExStrc.ppRoomsNear);
      const pNearRoomEx = m.u32((ppRoomsNear + i * 4) >>> 0);
      const pRoom1 = m.get(pNearRoomEx, D2RoomExStrc.pRoom1);
      if (pRoom1 !== 0) {
        m.setU32((ppOutRooms1 + writeCount * 4) >>> 0, pRoom1);
        writeCount = (writeCount + 1) | 0;
      }
    }
  }
  const finalNear = m.get(pRoomEx, D2RoomExStrc.nRoomsNear) | 0;
  for (let c = writeCount; c < finalNear; c++) {
    m.setU32((ppOutRooms1 + c * 4) >>> 0, 0);
  }
  return writeCount;
}

/**
 * `@va D2Common:0x6FD945A0` (`DRLGROOM_SortRoomExArrayByBounds113c`, custom `eax = nCount`, `esi = ppRoomsEx`, `ret`).
 *
 * Performs `nCount - 1` passes over `i = 0 .. nCount - 2`, swapping adjacent pointers `ppRoomsEx[i]` (`edx`)
 * and `ppRoomsEx[i + 1]` (`ecx`) whenever `edx->nTileXPos >= ecx->nTileXPos + ecx->nTileWidth` OR
 * `edx->nTileYPos >= ecx->nTileYPos + ecx->nTileHeight`.
 */
export function DRLGROOM_SortRoomExArrayByBounds113c(
  m: Memory113c,
  nCount: number,
  ppRoomsEx: number,
): void {
  const limit = ((nCount | 0) - 1) | 0;
  if (limit <= 0) return;

  for (let pass = limit; pass !== 0; pass = (pass - 1) | 0) {
    for (let i = 0; i < limit; i++) {
      const pNext = m.u32((ppRoomsEx + (i + 1) * 4) >>> 0);
      const nextEndX =
        ((m.get(pNext, D2RoomExStrc.nTileWidth) | 0) +
          (m.get(pNext, D2RoomExStrc.nTileXPos) | 0)) |
        0;
      const pCur = m.u32((ppRoomsEx + i * 4) >>> 0);
      const curX = m.get(pCur, D2RoomExStrc.nTileXPos) | 0;
      let shouldSwap = curX >= nextEndX;
      if (!shouldSwap) {
        const nextEndY =
          ((m.get(pNext, D2RoomExStrc.nTileHeight) | 0) +
            (m.get(pNext, D2RoomExStrc.nTileYPos) | 0)) |
          0;
        const curY = m.get(pCur, D2RoomExStrc.nTileYPos) | 0;
        if (curY >= nextEndY) {
          shouldSwap = true;
        }
      }
      if (shouldSwap) {
        m.setU32((ppRoomsEx + i * 4) >>> 0, pNext);
        m.setU32((ppRoomsEx + (i + 1) * 4) >>> 0, pCur);
      }
    }
  }
}

/**
 * `@va D2Common:0x6FD94740` (`DRLGROOM_CheckPointInRect113c`, custom `eax = pRect`, `esi = nX`, `edi = nY`, `ret`).
 *
 * Half-open rectangle containment test: returns `1` iff `nPosX <= nX < nPosX + nWidth` and `nPosY <= nY < nPosY + nHeight`.
 */
export function DRLGROOM_CheckPointInRect113c(
  m: Memory113c,
  pRect: number,
  nX: number,
  nY: number,
): number {
  const x = nX | 0;
  const y = nY | 0;
  const rx = m.get(pRect, D2DrlgCoordStrc.nPosX) | 0;
  if (x < rx) return 0;
  const ry = m.get(pRect, D2DrlgCoordStrc.nPosY) | 0;
  if (y < ry) return 0;
  const rw = m.get(pRect, D2DrlgCoordStrc.nWidth) | 0;
  if (x >= ((rx + rw) | 0)) return 0;
  const rh = m.get(pRect, D2DrlgCoordStrc.nHeight) | 0;
  return y < ((ry + rh) | 0) ? 1 : 0;
}

/**
 * `@va D2Common:0x6FD94870` (`DRLGROOM_CompareOrthoNodes113c`, fastcall `ecx = pOrth1`, `edx = pOrth2`, `ret`).
 *
 * Compares two `D2DrlgOrthStrc` nodes:
 * - If `pOrth2->nDirection > pOrth1->nDirection` (signed), returns `1`.
 * - If `pOrth2->nDirection != pOrth1->nDirection`, returns `0`.
 * - When directions are equal (`0..3`), compares `pOrth2->pBox` vs `pOrth1->pBox`:
 *   - `dir == 0`: `box2.nPosY > box1.nPosY ? 1 : 0`
 *   - `dir == 1`: `box2.nPosX < box1.nPosX ? 1 : 0`
 *   - `dir == 2`: `box2.nPosY < box1.nPosY ? 1 : 0`
 *   - `dir == 3`: `box2.nPosX > box1.nPosX ? 1 : 0`
 *   - `dir > 3` (unsigned): `0`.
 */
export function DRLGROOM_CompareOrthoNodes113c(
  m: Memory113c,
  pOrth1: number,
  pOrth2: number,
): number {
  const dir1 = m.get(pOrth1, D2DrlgOrthStrc.nDirection) | 0;
  const dir2 = m.get(pOrth2, D2DrlgOrthStrc.nDirection) | 0;
  if (dir2 > dir1) return 1;
  if (dir2 !== dir1) return 0;
  if (dir1 >>> 0 > 3) return 0;

  const pBox2 = m.get(pOrth2, D2DrlgOrthStrc.pBox);
  const pBox1 = m.get(pOrth1, D2DrlgOrthStrc.pBox);
  switch (dir1 >>> 0) {
    case 0:
      return (m.get(pBox2, D2DrlgCoordStrc.nPosY) | 0) > (m.get(pBox1, D2DrlgCoordStrc.nPosY) | 0)
        ? 1
        : 0;
    case 1:
      return (m.get(pBox2, D2DrlgCoordStrc.nPosX) | 0) < (m.get(pBox1, D2DrlgCoordStrc.nPosX) | 0)
        ? 1
        : 0;
    case 2:
      return (m.get(pBox2, D2DrlgCoordStrc.nPosY) | 0) < (m.get(pBox1, D2DrlgCoordStrc.nPosY) | 0)
        ? 1
        : 0;
    case 3:
      return (m.get(pBox2, D2DrlgCoordStrc.nPosX) | 0) > (m.get(pBox1, D2DrlgCoordStrc.nPosX) | 0)
        ? 1
        : 0;
    default:
      return 0;
  }
}

/**
 * `@va D2Common:0x6FD94EB0` (`DRLGROOM_CheckLevelRoomsSeparation113c`, custom `eax = pLevel`, `ebx = nMinDist`,
 * `esi = pRoomEx1`, stack `[esp+4] = pRoomEx2`, `ret 4`).
 *
 * Walks `pLevel->pFirstRoomEx (+0x10)` via `pRoomNext (+0x24)`. For every room other than `pRoomEx1` and `pRoomEx2`,
 * computes axis separation `distX` and `distY`. If both `distX < nMinDist` and `distY < nMinDist`, returns `0`;
 * otherwise returns `1`.
 */
export function DRLGROOM_CheckLevelRoomsSeparation113c(
  m: Memory113c,
  pLevel: number,
  nMinDist: number,
  pRoomEx1: number,
  pRoomEx2: number,
): number {
  const minDist = nMinDist | 0;
  for (
    let pCur = m.get(pLevel, D2DrlgLevelStrc.pFirstRoomEx);
    pCur !== 0;
    pCur = m.get(pCur, D2RoomExStrc.pRoomNext)
  ) {
    if (pCur === pRoomEx1 || pCur === pRoomEx2) continue;

    const x1 = m.get(pRoomEx1, D2RoomExStrc.nTileXPos) | 0;
    const xCur = m.get(pCur, D2RoomExStrc.nTileXPos) | 0;
    let distX: number;
    if (x1 < xCur) {
      const w1 = m.get(pRoomEx1, D2RoomExStrc.nTileWidth) | 0;
      distX = ((xCur - w1) | 0) - x1;
    } else {
      const wCur = m.get(pCur, D2RoomExStrc.nTileWidth) | 0;
      distX = ((x1 - wCur) | 0) - xCur;
    }
    distX |= 0;

    const y1 = m.get(pRoomEx1, D2RoomExStrc.nTileYPos) | 0;
    const yCur = m.get(pCur, D2RoomExStrc.nTileYPos) | 0;
    let distY: number;
    if (y1 < yCur) {
      const h1 = m.get(pRoomEx1, D2RoomExStrc.nTileHeight) | 0;
      distY = ((yCur - h1) | 0) - y1;
    } else {
      const hCur = m.get(pCur, D2RoomExStrc.nTileHeight) | 0;
      distY = ((y1 - hCur) | 0) - yCur;
    }
    distY |= 0;

    if (distX < minDist && distY < minDist) {
      return 0;
    }
  }
  return 1;
}

/**
 * `@va D2Common:0x6FD95630` (`ITEMMODS_StubReturnOne113c`, stdcall 7 stack args, `ret 0x1C`).
 *
 * `mov eax, 1; ret 0x1c`.
 */
export function ITEMMODS_StubReturnOne113c(
  _a0 = 0,
  _a1 = 0,
  _a2 = 0,
  _a3 = 0,
  _a4 = 0,
  _a5 = 0,
  _a6 = 0,
): number {
  return 1;
}

/**
 * `@va D2Common:0x6FD95640` (`ITEMMODS_ShiftStatValueIfFixedPoint113c`, custom `eax = nStatId`, `ecx = pValue`, `ret`).
 *
 * `add eax, -6; cmp eax, 0xd3; ja ret; movzx eax, [eax+0x6fd95668]; jmp [eax*4+0x6fd9565c]`.
 * When `tag == 0` (`nStatId in {6..11, 216, 217}`), shifts `*pValue <<= 8` in place and returns `EAX = 0`.
 * Otherwise leaves `*pValue` untouched and returns `EAX = tag` (or `u = (nStatId - 6) | 0` when `u >>> 0 > 0xd3`).
 */
export function ITEMMODS_ShiftStatValueIfFixedPoint113c(
  m: Memory113c,
  nStatId: number,
  pValue: number,
): number {
  const u = ((nStatId - 6) | 0) >>> 0;
  if (u > 0xd3) {
    return u | 0;
  }
  const tag = FIXED_POINT_STAT_SWITCH_6FD95668[u]!;
  if (tag === 0) {
    m.setU32(pValue, (m.u32(pValue) << 8) >>> 0);
  }
  return tag;
}

export const D2COMMON_ITEMMOD_TABLE_VA_113C = 0x6fdeb0c8;
export const D2COMMON_ITEMMOD_COUNT_VA_113C = 0x6fdeb15c;
export const D2COMMON_ITEMMOD_DEFAULT_COUNT_113C = 37;

/**
 * Canonical 37-entry `.data` function pointer table `0x6FDEB0C8[0..36]` in `D2Common.dll` (`u32[0x6FDEB15C] = 37`).
 * Indices `0` and `25..35` are `0x00000000`.
 */
export const CANONICAL_ITEMMOD_FUNC_TABLE_113C: readonly number[] = [
  0x00000000, 0x6fd98ae0, 0x6fd98a40, 0x6fd989d0, 0x6fd98960, 0x6fd987c0, 0x6fd98630, 0x6fd99340,
  0x6fd985d0, 0x6fd98550, 0x6fd98470, 0x6fd98340, 0x6fd98100, 0x6fd98070, 0x6fd96830, 0x6fd992d0,
  0x6fd99260, 0x6fd991c0, 0x6fd97350, 0x6fd97420, 0x6fd972e0, 0x6fd982b0, 0x6fd98190, 0x6fd97290,
  0x6fd984f0, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
  0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x6fd98220,
];

export type ItemModHandler113c = (
  m: Memory113c,
  funcId: number,
  fp: number,
  nType: number,
  pUnit: number,
  pItem: number,
  pItemProp: number,
  nSet: number,
  wStat: number,
  wVal: number,
  prevResult: number,
  nState: number,
  fStatListFlags: number,
  pStatList: number,
) => number;

/**
 * Helper for `D2Common.dll` `0x6FD965B0` (`ITEMMODS_RollPropertyRandomRange`).
 */
function rollPropertyRandomRange113c(m: Memory113c, pItemProp: number, pItem: number): number {
  if (pItemProp === 0) return 0;
  const nPropId = m.u32(pItemProp) | 0;
  if (nPropId < 0) return 0;
  const sgpt = m.u32(0x6fde9e1c);
  if (sgpt === 0) return 0;
  const nPropsCount = m.u32(sgpt + 0xac) | 0;
  if (nPropId >= nPropsCount) return 0;
  const pPropsTxt = m.u32(sgpt + 0xa4);
  if (pPropsTxt === 0) return 0;
  const pRec = (pPropsTxt + imul32(nPropId, 0x2e)) >>> 0;
  if (pRec === 0) return 0;
  const nMin = m.u32(pItemProp + 0x08) | 0;
  const nMax = m.u32(pItemProp + 0x0c) | 0;
  if (nMin === nMax) return nMin;
  const diff = (nMax - nMin) | 0;
  if (diff <= 0) return nMin;
  if (pItem !== 0 && (m.u32(pItem) | 0) === 4) {
    const pItemData = m.u32(pItem + 0x14);
    if (pItemData !== 0) {
      const lo = m.u32(pItemData + 0x20);
      const hi = m.u32(pItemData + 0x24);
      const prod = BigInt(lo >>> 0) * 0x6ac690c5n + BigInt(hi >>> 0);
      const nextLo = Number(prod & 0xffffffffn) >>> 0;
      const nextHi = Number((prod >> 32n) & 0xffffffffn) >>> 0;
      m.setU32(pItemData + 0x20, nextLo);
      m.setU32(pItemData + 0x24, nextHi);
      return (nMin + ((nextLo >>> 0) % ((diff + 1) >>> 0))) | 0;
    }
  }
  return nMin;
}

/**
 * Helper for `D2Common.dll` `0x6FD97020` (`ITEMMODS_GetOrCreateStatList`).
 * Searches `owner->pStatListEx` (`+0x5C`, where `owner = pUnit != 0 ? pUnit : pItem`)
 * via `0x6FD87F80` (`nState != 0`) or `0x6FD87F40` (`nState == 0`).
 */
function resolveItemModStatList113c(
  m: Memory113c,
  pUnit: number,
  pItem: number,
  nState: number,
  fStatListFlags: number,
): number {
  const owner = pUnit !== 0 ? pUnit : pItem;
  if (owner === 0) return 0;
  const pListEx = m.get(owner, D2UnitStrc.pStatListEx);
  if (pListEx === 0) return 0;
  if ((m.get(pListEx, D2StatListStrc.dwFlags) & 0x80000000) === 0) return 0;
  if (nState !== 0) {
    // 0x6FD87F80: walk pMyLastList (+0x3C) via pPrevLink (+0x2C), skip (dwFlags & 0x40) != 0, match dwStateNo
    const targetState = nState >>> 0;
    for (
      let cur = m.get(pListEx, D2StatListExStrc.pMyLastList);
      cur !== 0;
      cur = m.get(cur, D2StatListStrc.pPrevLink)
    ) {
      if ((m.get(cur, D2StatListStrc.dwFlags) & 0x40) !== 0) continue;
      if (m.get(cur, D2StatListStrc.dwStateNo) === targetState) return cur;
    }
    return 0;
  }
  // 0x6FD87F40: start at pMyStats (+0x40) if (fStatListFlags & 0x2000), else pMyLastList (+0x3C)
  const start =
    (fStatListFlags & 0x2000) !== 0
      ? m.get(pListEx, D2StatListExStrc.pMyStats)
      : m.get(pListEx, D2StatListExStrc.pMyLastList);
  const mask = (fStatListFlags & ~0x2000) >>> 0;
  for (let cur = start; cur !== 0; cur = m.get(cur, D2StatListStrc.pPrevLink)) {
    if (((m.get(cur, D2StatListStrc.dwFlags) >>> 0) & mask) !== 0) return cur;
  }
  return 0;
}

/**
 * Helper for `D2Common.dll` `0x6FD975E0` (`ITEMMODS_AssignPropertyStat`).
 */
function assignPropertyStat113c(
  m: Memory113c,
  wStatSigned: number,
  nSet: number,
  pUnit: number,
  pItem: number,
  pItemProp: number,
  wLayer: number,
  nValue: number,
  nState: number,
  fStatListFlags: number,
): number {
  if (pItemProp === 0 || (nValue | 0) === 0) return 0;
  const statId = (wStatSigned << 16) >> 16;
  if (statId < 0) return 0;
  const sgpt = m.u32(0x6fde9e1c);
  if (sgpt === 0) return 0;
  const nIscCount = m.u32(sgpt + 0xbd4) | 0;
  if (statId >= nIscCount) return 0;
  const pIscTxt = m.u32(sgpt + 0xbcc);
  if (pIscTxt === 0) return 0;
  const pIscRec = (pIscTxt + imul32(statId, 0x144)) >>> 0;
  if (pIscRec === 0) return 0;
  const nValShift = m.u8(pIscRec + 0x18) & 0x1f;
  const targetList = resolveItemModStatList113c(m, pUnit, pItem, nState, fStatListFlags);
  if (targetList === 0) return 0;
  const shiftedVal = (nValue << nValShift) | 0;
  if ((nSet & 0xff) !== 0) {
    STATLIST_SetStat113c(m, targetList, statId, shiftedVal, wLayer & 0xffff);
  } else {
    STATLIST_AddStat113c(m, targetList, statId, shiftedVal, wLayer & 0xffff);
  }
  return nValue | 0;
}

/**
 * Default `D2Common.dll` `.data` `0x6FDEB0C8` handler dispatcher for `0x6FD95990`.
 * Implements the native 1.13c property handlers (`[8] = 0x6FD985D0`, `[9] = 0x6FD98550`,
 * `[18] = 0x6FD97350`, `[20] = 0x6FD972E0`).
 */
export const dispatchItemModHandler113c: ItemModHandler113c = (
  m,
  funcId,
  _fp,
  _nType,
  pUnit,
  pItem,
  pItemProp,
  nSet,
  wStat,
  _wVal,
  prevResult,
  nState,
  fStatListFlags,
  _pStatList,
): number => {
  switch (funcId) {
    case 8: {
      // 0x6FD985D0: ITEMMODS_ApplyDirectStatMod
      const val =
        (prevResult | 0) !== 0 ? prevResult | 0 : rollPropertyRandomRange113c(m, pItemProp, pItem);
      return assignPropertyStat113c(
        m,
        (wStat << 16) >> 16,
        nSet,
        pUnit,
        pItem,
        pItemProp,
        0,
        val,
        nState,
        fStatListFlags,
      );
    }
    case 9: {
      // 0x6FD98550: ITEMMODS_ApplySkillOrParamStatMod
      if (pItemProp === 0) return 0;
      const val =
        (prevResult | 0) !== 0 ? prevResult | 0 : rollPropertyRandomRange113c(m, pItemProp, pItem);
      if (val === 0) return 0;
      const nLayer = m.u32(pItemProp + 0x04) | 0;
      const sgpt = m.u32(0x6fde9e1c);
      if (sgpt === 0) return 0;
      const nSkillsCount = m.u32(sgpt + 0xba0) | 0;
      if (nLayer < 0 || nLayer >= nSkillsCount) return 0;
      return assignPropertyStat113c(
        m,
        (wStat << 16) >> 16,
        nSet,
        pUnit,
        pItem,
        pItemProp,
        nLayer & 0xffff,
        val,
        nState,
        fStatListFlags,
      );
    }
    case 18: {
      // 0x6FD97350: ITEMMODS_ApplyLightColorMod
      if (pItemProp === 0) return 0;
      let r = m.u32(pItemProp + 0x04) | 0;
      if (r < 0) r = 0;
      else if (r > 3) r = 3;
      let g = (m.u32(pItemProp + 0x08) + 0x100) | 0;
      if (g < 0) g = 0;
      else if (g > 0x3ff) g = 0x3ff;
      let b = (m.u32(pItemProp + 0x0c) + 0x100) | 0;
      if (b < 0) b = 0;
      else if (b > 0x3ff) b = 0x3ff;
      const targetList = resolveItemModStatList113c(m, pUnit, pItem, nState, fStatListFlags);
      if (targetList === 0) return 0;
      const packed = (r + (((b << 10) + g) << 2)) | 0;
      STATLIST_SetStat113c(m, targetList, (wStat << 16) >> 16, packed, 0);
      return b | 0;
    }
    case 20: {
      // 0x6FD972E0: ITEMMODS_ApplyIndestructibleMod (adds stat 0x98 = 152 with value 1)
      if (pItem === 0 || (m.u32(pItem) | 0) !== 4 || pItemProp === 0) return 0;
      const sgpt = m.u32(0x6fde9e1c);
      if (sgpt === 0) return 0;
      const nIscCount = m.u32(sgpt + 0xbd4) | 0;
      if (nIscCount <= 0x98) return 0;
      const pIscTxt = m.u32(sgpt + 0xbcc);
      if (pIscTxt === 0) return 0;
      const pIscRec = (pIscTxt + 0x98 * 0x144) >>> 0;
      if (pIscRec === 0) return 0;
      const targetList = resolveItemModStatList113c(m, pUnit, pItem, nState, fStatListFlags);
      if (targetList === 0) return 0;
      STATLIST_AddStat113c(m, targetList, 0x98, 1, 0);
      return 1;
    }
    default:
      return 0;
  }
};

/**
 * `@va D2Common:0x6FD95990` (`D2Common_10665_ApplyMonProp`, `__stdcall`, 10 dwords / `ret 0x28`)
 * Dispatches up to 7 modifier function slots (`esi = 0..6`) from `Properties.txt` (`sgptDataTables + 0xA4`,
 * count at `+0xAC`, record stride `0x2E`) through `.data` table `0x6FDEB0C8` (count at `0x6FDEB15C`, default `37`).
 */
export function D2Common_10665_ApplyMonProp113c(
  m: Memory113c,
  nType: number,
  pUnit: number,
  pItem: number,
  _nValue: number,
  _nIndex: number,
  _nStatId: number,
  pItemProp: number,
  nState: number,
  fStatListFlags: number,
  pStatList: number,
  itemModDispatch: ItemModHandler113c = dispatchItemModHandler113c,
): void {
  if (pItemProp === 0) return;
  const nPropId = m.u32(pItemProp) | 0;
  if (nPropId < 0) return;

  const sgpt = m.u32(0x6fde9e1c);
  if (sgpt === 0) return;
  const nPropsCount = m.u32(sgpt + 0xac) | 0;
  if (nPropId >= nPropsCount) return;

  const pPropsTxt = m.u32(sgpt + 0xa4);
  const pRec = (pPropsTxt + imul32(nPropId, 0x2e)) >>> 0;
  if (pRec === 0) return;

  const rawMaxFunc = m.u32(D2COMMON_ITEMMOD_COUNT_VA_113C) | 0;
  const maxFuncId = rawMaxFunc > 0 ? rawMaxFunc : D2COMMON_ITEMMOD_DEFAULT_COUNT_113C;
  let prevResult = 0;
  for (let esi = 0; esi < 7; esi++) {
    const funcId = m.u8(pRec + 0x18 + esi);
    if (funcId >= maxFuncId) break;
    const memFp = m.u32((D2COMMON_ITEMMOD_TABLE_VA_113C + funcId * 4) >>> 0);
    const fp =
      memFp !== 0
        ? memFp
        : funcId < CANONICAL_ITEMMOD_FUNC_TABLE_113C.length
          ? CANONICAL_ITEMMOD_FUNC_TABLE_113C[funcId]!
          : 0;
    if (fp === 0) break;

    const wVal = m.u16(pRec + 0x0a + esi * 2);
    const wStat = m.u16(pRec + 0x20 + esi * 2);
    const nSet = m.u8(pRec + 0x02 + esi);

    const ret =
      itemModDispatch(
        m,
        funcId,
        fp,
        nType,
        pUnit,
        pItem,
        pItemProp,
        nSet,
        wStat,
        wVal,
        prevResult,
        nState,
        fStatListFlags,
        pStatList,
      ) | 0;

    if (esi === 0) {
      prevResult = ret;
    }
  }
}
