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
  D2DrlgPresetRoomStrc,
  D2RoomExStrc,
} from '../../mem/layout.generated.ts';
import { DRLG_IsTownLevel113c, DUNGEON_AllocActiveRoom113c } from '../dungeon.ts';
import { ENVIRONMENT_Alloc113c } from '../env.ts';
import { D2CommonAssertError } from '../inline-helpers.ts';
import { imul32, sdiv32 } from '../int-math.ts';
import { SG_LEVEL_DEF_BIN_PTR_VA_6FDF0B38 } from './drlg.ts';
import {
  DRLGLOGIC_FreeRoomLogicalInfo113c,
  DRLGOUTROOM_FreeOutdoorRoomData113c,
  DRLGTILESUB_RollSubThemeMask113c,
} from './drlg-grid.ts';
import {
  DRLGMAZE_AssignMazeRoomPrestId113c,
  DRLGMAZE_LinkTouchingMazeRooms113c,
  DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c,
} from './maze.ts';

const DRLGROOM_STACK_BASE = 0x7ff80000;
const DRLGROOM_STACK_SIZE = 0x100;
const _drlgRoomStackBuf = new ArrayBuffer(DRLGROOM_STACK_SIZE);
const _drlgRoomStackU8 = new Uint8Array(_drlgRoomStackBuf);
const _drlgRoomStackDV = new DataView(_drlgRoomStackBuf);

function withDrlgRoomStackScratch113c(m: Memory113c): Memory113c {
  const isStack = (p: number): boolean => {
    const u = p >>> 0;
    return u >= DRLGROOM_STACK_BASE && u < DRLGROOM_STACK_BASE + DRLGROOM_STACK_SIZE;
  };
  const self: Memory113c = {
    alloc: size => m.alloc(size),
    u8: p => (isStack(p) ? _drlgRoomStackU8[(p >>> 0) - DRLGROOM_STACK_BASE]! : m.u8(p)),
    u16: p => (isStack(p) ? _drlgRoomStackDV.getUint16((p >>> 0) - DRLGROOM_STACK_BASE, true) : m.u16(p)),
    u32: p => (isStack(p) ? _drlgRoomStackDV.getUint32((p >>> 0) - DRLGROOM_STACK_BASE, true) : m.u32(p)),
    setU8: (p, v) => {
      if (isStack(p)) _drlgRoomStackU8[(p >>> 0) - DRLGROOM_STACK_BASE] = v & 0xff;
      else m.setU8(p, v);
    },
    setU16: (p, v) => {
      if (isStack(p)) _drlgRoomStackDV.setUint16((p >>> 0) - DRLGROOM_STACK_BASE, v & 0xffff, true);
      else m.setU16(p, v);
    },
    setU32: (p, v) => {
      if (isStack(p)) _drlgRoomStackDV.setUint32((p >>> 0) - DRLGROOM_STACK_BASE, v >>> 0, true);
      else m.setU32(p, v);
    },
    get: (base, f, idx = 0) => {
      const width = f.type === 'u8' ? 1 : f.type === 'u16' ? 2 : 4;
      const addr = ((base >>> 0) + f.off + idx * width) >>> 0;
      return width === 1 ? self.u8(addr) : width === 2 ? self.u16(addr) : self.u32(addr);
    },
    set: (base, f, v, idx = 0) => {
      const width = f.type === 'u8' ? 1 : f.type === 'u16' ? 2 : 4;
      const addr = ((base >>> 0) + f.off + idx * width) >>> 0;
      if (width === 1) self.setU8(addr, v);
      else if (width === 2) self.setU16(addr, v);
      else self.setU32(addr, v);
    },
    fill: (p, len, v) => {
      if (isStack(p)) {
        const off = (p >>> 0) - DRLGROOM_STACK_BASE;
        _drlgRoomStackU8.fill(v & 0xff, off, off + len);
      } else {
        m.fill(p, len, v);
      }
    },
  };
  return self;
}
import { DRLGOUTDOORS_ComputeVertexLevelLinkVisBit113c } from './outdoors.ts';
import { DRLGPRESET_FreePresetRoomData113c } from './preset.ts';
import {
  DATATBLS_FindFloorWindowTileCacheEntry113c,
  DRLGROOMTILE_FreeRoomTileGridAndAnimList113c,
  DRLGROOMTILE_GetWarpLevelsArray113c,
} from './room-tile.ts';


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
 * `D2Common.dll` `.data` address for `sgptDataTables`.
 */
export const SGPT_DATA_TABLES_PTR_VA_6FDE9E1C = 0x6fde9e1c;

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

/**
 * `D2Common.dll` `.text` switch index table at `0x6FD5B260` (40 bytes, `0..0x27`)
 * used by `0x6FD5AFD0` (`DRLGPRESET_SpawnMapAIPathPresets113c`).
 *
 * `@va D2Common:0x6FD5B260`
 */
export const MAP_AI_PATH_SWITCH_TABLE_VA_6FD5B260 = 0x6fd5b260;

/**
 * `D2Common.dll` `.bss` `sgptDataTables.pLevelsTxt` (`D2LevelsTxt*`).
 *
 * `@va D2Common:0x6FDF0B38`
 */
export const SGPT_LEVELS_TXT_VA_6FDF0B38 = 0x6fdf0b38;

/**
 * `D2Common.dll` `.bss` `sgptDataTables.pLvlTypesTxt` (`D2LvlTypesTxt*`).
 *
 * `@va D2Common:0x6FDF141C`
 */
export const SGPT_LVLTYPES_TXT_VA_6FDF141C = 0x6fdf141c;

/**
 * `D2Common.dll` `.rdata` `"DATA\\GLOBAL"` string for universal DT1 loading.
 *
 * `@va D2Common:0x6FDDAD5C`
 */
export const DT1_GLOBAL_PREFIX_VA_6FDDAD5C = 0x6fddad5c;

/**
 * `D2Common.dll` `.rdata` `"%s\\Tiles\\Act1\\Outdoors\\Blank.dt1"` format string.
 *
 * `@va D2Common:0x6FDDFFB4`
 */
export const DT1_BLANK_FMT_VA_6FDDFFB4 = 0x6fddffb4;

/**
 * `D2Common.dll` `.rdata` `"%s\\Tiles\\Act1\\Barracks\\InvisWal.dt1"` format string.
 *
 * `@va D2Common:0x6FDDFF90`
 */
export const DT1_INVISWAL_FMT_VA_6FDDFF90 = 0x6fddff90;

/**
 * `D2Common.dll` `.rdata` `"%s\\Tiles\\Act1\\Barracks\\Warp.dt1"` format string.
 *
 * `@va D2Common:0x6FDDFF70`
 */
export const DT1_WARP_FMT_VA_6FDDFF70 = 0x6fddff70;

/**
 * `@va D2Common:0x6FD5AF20` (`DRLGPRESET_SpawnHoradricOrifice113c`, not exported;
 * custom LTCG `esi = pDrlgMap`, stack `[esp+4] = pMemPool`, `ret 4`).
 *
 * Computes center subtile coordinates `subX = (nSizeX / 2 + nPosX) * 5`,
 * `subY = (nSizeY / 2 + nPosY) * 5`, checks `sgptDataTables->nMonStatsTxtRecordCount (+0xA80) > 0x10A`
 * (`266` if true else `-1`), allocates a `0x20`-byte `D2PresetUnitStrc`, populates
 * `{ nMode=1, nTxtFileNo, nXpos=subX, pNext=pDrlgMap->pPresetUnit, nUnitType=1, nYpos=subY }`,
 * and prepends it to `pDrlgMap->pPresetUnit (+0x38)`.
 */
export function DRLGPRESET_SpawnHoradricOrifice113c(
  m: Memory113c,
  pDrlgMap: number,
  _pMemPool: number,
): void {
  const map = pDrlgMap >>> 0;
  const sizeX = m.u32((map + 0x18) >>> 0) | 0;
  const posY = m.u32((map + 0x14) >>> 0) | 0;
  const posX = m.u32((map + 0x10) >>> 0) | 0;
  const subX = imul32((sdiv32(sizeX, 2) + posX) | 0, 5);
  const sizeY = m.u32((map + 0x1c) >>> 0) | 0;
  const subY = imul32((sdiv32(sizeY, 2) + posY) | 0, 5);
  const pDataTables = m.u32(SGPT_DATA_TABLES_PTR_VA_6FDE9E1C);
  const monCount = m.u32((pDataTables + 0xa80) >>> 0) | 0;
  const nTxtFileNo = monCount > 0x10a ? 0x10a : -1;

  const pUnit = m.alloc(0x20);
  m.fill(pUnit, 0x20, 0);
  m.setU32((pUnit + 0x08) >>> 0, subX >>> 0);
  m.setU32((pUnit + 0x04) >>> 0, nTxtFileNo >>> 0);
  m.setU32((pUnit + 0x18) >>> 0, subY >>> 0);
  m.setU32((pUnit + 0x0c) >>> 0, 0);
  m.setU32((pUnit + 0x14) >>> 0, 1);
  m.setU32(pUnit, 1);
  m.setU32((pUnit + 0x0c) >>> 0, m.u32((map + 0x38) >>> 0));
  m.setU32((map + 0x38) >>> 0, pUnit);
}

/**
 * `@va D2Common:0x6FD5AFD0` (`DRLGPRESET_SpawnMapAIPathPresets113c`, not exported;
 * custom LTCG `esi = pDrlgMap`, stack `[esp+4] = pMemPool`, `[esp+8] = nTileX`, `[esp+0xC] = pOrientationGrid`, `ret 0xC`).
 *
 * For each row `y < pDrlgMap->nSizeY (+0x1C)`, spawns 5 object `D2PresetUnitStrc` nodes (`nUnitType = 2`, `dwFlags = 1`,
 * `nTxtFileNo` = `0x28, 0x29, 0x29, 0x29, 0x2A`) at `subX = (nPosX + nTileX)*5 - 5 + 5*k` (`k = 0..4`), `subY = (nPosY + y)*5`.
 * Inspects `pOrientationGrid[y][max(0, nTileX)]`; if `style == 4`, `seq <= 0x27`, and `u8(0x6FD5B260 + seq) == 0`,
 * advances `y` by an extra `3` rows (`y += 4` total).
 */
export function DRLGPRESET_SpawnMapAIPathPresets113c(
  m: Memory113c,
  pDrlgMap: number,
  _pMemPool: number,
  nTileX: number,
  pOrientationGrid: number,
): void {
  const map = pDrlgMap >>> 0;
  const h0 = m.u32((map + 0x1c) >>> 0) | 0;
  if (h0 <= 0) return;

  const tileX = nTileX | 0;
  const gridX = tileX <= 0 ? 0 : tileX;
  const oriGrid = pOrientationGrid >>> 0;

  let y = 0;
  while (true) {
    const subY = imul32(((m.u32((map + 0x14) >>> 0) | 0) + y) | 0, 5);
    const baseSubX =
      (imul32(((m.u32((map + 0x10) >>> 0) | 0) + tileX) | 0, 5) - 5) | 0;

    const txtIds = [0x28, 0x29, 0x29, 0x29, 0x2a];
    for (let k = 0; k < 5; k++) {
      const pUnit = m.alloc(0x20);
      m.fill(pUnit, 0x20, 0);
      m.setU32(pUnit, 0);
      m.setU32((pUnit + 0x04) >>> 0, txtIds[k]!);
      m.setU32((pUnit + 0x08) >>> 0, ((baseSubX + k * 5) | 0) >>> 0);
      m.setU32((pUnit + 0x14) >>> 0, 2);
      m.setU32((pUnit + 0x18) >>> 0, subY >>> 0);
      m.setU32((pUnit + 0x1c) >>> 0, 1);
      m.setU32((pUnit + 0x0c) >>> 0, m.u32((map + 0x38) >>> 0));
      m.setU32((map + 0x38) >>> 0, pUnit);
    }

    const pRowOffsets = m.u32((oriGrid + 4) >>> 0);
    const rowOff = m.u32((pRowOffsets + y * 4) >>> 0) | 0;
    const pCells = m.u32(oriGrid);
    const cell = m.u32((pCells + (((rowOff + gridX) | 0) << 2)) >>> 0);
    const style = (cell >>> 20) & 0x3f;
    if (style === 4) {
      const seq = (cell >>> 8) & 0xff;
      if (seq <= 0x27) {
        const tag = m.u8((MAP_AI_PATH_SWITCH_TABLE_VA_6FD5B260 + seq) >>> 0);
        if (tag === 0) {
          y = (y + 3) | 0;
        }
      }
    }

    const curH = m.u32((map + 0x1c) >>> 0) | 0;
    y = (y + 1) | 0;
    if (y >= curH) break;
  }
}

/**
 * `@va D2Common:0x6FD5B290` (`DRLGPRESET_SpawnFortressWall2Presets113c`, not exported;
 * custom LTCG `eax = nTileY`, `ecx = nTileX`, `edi = pDrlgMap`, stack `[esp+4] = pMemPool`, `ret 4`).
 *
 * Sets `subX = nTileY * 5`, `curSubY = nTileX * 5`, `endSubY = (pDrlgMap->pFile (+0x0C)->nSizeY (+0x10) + nTileX) * 5`.
 * While `curSubY < endSubY` (step `+0x28`), allocates a `0x20`-byte `D2PresetUnitStrc`
 * (`nUnitType = 2`, `nTxtFileNo = 0x41`, `dwFlags = 1`, `nXpos = subX`, `nYpos = curSubY`)
 * and prepends it to `pDrlgMap->pPresetUnit (+0x38)`.
 */
export function DRLGPRESET_SpawnFortressWall2Presets113c(
  m: Memory113c,
  nTileY: number,
  nTileX: number,
  pDrlgMap: number,
  _pMemPool: number,
): void {
  const map = pDrlgMap >>> 0;
  const subX = imul32(nTileY | 0, 5);
  const pFile = m.u32((map + 0x0c) >>> 0);
  const endTile = ((m.u32((pFile + 0x10) >>> 0) | 0) + (nTileX | 0)) | 0;
  let curSubY = imul32(nTileX | 0, 5);
  const endSubY = imul32(endTile, 5);
  if (curSubY >= endSubY) return;

  while (curSubY < endSubY) {
    const pUnit = m.alloc(0x20);
    m.fill(pUnit, 0x20, 0);
    m.setU32((pUnit + 0x18) >>> 0, curSubY >>> 0);
    m.setU32((pUnit + 0x14) >>> 0, 2);
    m.setU32((pUnit + 0x04) >>> 0, 0x41);
    m.setU32(pUnit, 0);
    m.setU32((pUnit + 0x08) >>> 0, subX >>> 0);
    m.setU32((pUnit + 0x1c) >>> 0, 1);
    m.setU32((pUnit + 0x0c) >>> 0, m.u32((map + 0x38) >>> 0));
    m.setU32((map + 0x38) >>> 0, pUnit);
    curSubY = (curSubY + 0x28) | 0;
  }
}

/**
 * `@va D2Common:0x6FD94480` (`DRLGROOM_AllocPresetUnit113c`, not exported;
 * custom LTCG `ecx = pMemPool`, `esi = pRoomEx`,
 * stack `[esp+4] = nUnitType`, `[esp+8] = nTxtFileNo`, `[esp+0xC] = nMode`, `[esp+0x10] = nXpos`, `[esp+0x14] = nYpos`, `ret 0x14`).
 *
 * Allocates a `0x20`-byte `D2PresetUnitStrc`, zeroes it, sets `nUnitType (+0x14)`, `nTxtFileNo (+0x04)`,
 * `nMode (+0x00)`, `nXpos (+0x08)`, `nYpos (+0x18)`, and if `pRoomEx != 0` prepends it to `pRoomEx->pPresetUnits (+0x5C)`.
 */
export function DRLGROOM_AllocPresetUnit113c(
  m: Memory113c,
  _pMemPool: number,
  pRoomEx: number,
  nUnitType: number,
  nTxtFileNo: number,
  nMode: number,
  nXpos: number,
  nYpos: number,
): number {
  const pUnit = m.alloc(0x20);
  m.fill(pUnit, 0x20, 0);
  m.setU32((pUnit + 0x14) >>> 0, nUnitType >>> 0);
  m.setU32((pUnit + 0x04) >>> 0, nTxtFileNo >>> 0);
  m.setU32(pUnit, nMode >>> 0);
  m.setU32((pUnit + 0x08) >>> 0, nXpos >>> 0);
  m.setU32((pUnit + 0x18) >>> 0, nYpos >>> 0);
  if (pRoomEx !== 0) {
    const roomEx = pRoomEx >>> 0;
    m.setU32((pUnit + 0x0c) >>> 0, m.u32((roomEx + 0x5c) >>> 0));
    m.setU32((roomEx + 0x5c) >>> 0, pUnit);
  } else {
    m.setU32((pUnit + 0x0c) >>> 0, 0);
  }
  return pUnit | 0;
}

/**
 * `@va D2Common:0x6FD94950` (`DRLGROOM_AddOrthRoomData113c`, not exported;
 * custom LTCG `eax = pRoomExAdj`, `esi = pRoomEx`, stack `[esp+4] = nDirection`, `ret 4`).
 *
 * Walks `pRoomEx->pDrlgOrth (+0x00)` via `pNext (+0x14)`; if a node with `pRoomEx == pRoomExAdj` already exists,
 * returns immediately. Otherwise allocates a `0x18`-byte `D2DrlgOrthStrc`, sets `pRoomEx = pRoomExAdj`,
 * `nDirection`, `bInit (+0x0C) = 1`, `pBox (+0x10) = pRoomExAdj + 0x34`, and prepends it to `pRoomEx->pDrlgOrth (+0x00)`.
 */
export function DRLGROOM_AddOrthRoomData113c(
  m: Memory113c,
  pRoomExAdj: number,
  pRoomEx: number,
  nDirection: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const adj = pRoomExAdj >>> 0;
  for (
    let pCur = m.u32(roomEx);
    pCur !== 0;
    pCur = m.u32((pCur + 0x14) >>> 0)
  ) {
    if (m.u32(pCur) === adj) return;
  }

  const pLevel = m.u32((roomEx + 0x58) >>> 0);
  const pDrlg = m.u32((pLevel + 0x1b4) >>> 0);
  const _pMemPool = m.u32((pDrlg + 0x478) >>> 0);
  void _pMemPool;

  const pOrth = m.alloc(0x18);
  m.fill(pOrth, 0x18, 0);
  m.setU32((pOrth + 0x14) >>> 0, m.u32(roomEx));
  m.setU32(roomEx, pOrth);
  m.setU32(pOrth, adj);
  m.setU32((pOrth + 0x04) >>> 0, nDirection >>> 0);
  m.setU32((pOrth + 0x0c) >>> 0, 1);
  m.setU32((pOrth + 0x10) >>> 0, (adj + 0x34) >>> 0);
}

/**
 * `@va D2Common:0x6FD94A30` (`DRLGROOM_AppendAndSortAdjacentRoom113c`, custom `eax = pRoomEx`,
 * `ecx = pMemPool`, `[esp+4] = pAdjRoomEx`, `ret 4`).
 *
 * Increments `pRoomEx->nRoomsNear (+0x2C)`, reallocates `pRoomEx->ppRoomsNear (+0x08)` via `Fog.#10047`
 * (`0x6FD59252`) to `nRoomsNear * 4` bytes, appends `pAdjRoomEx`, and sorts via `0x6FD945A0`
 * (`DRLGROOM_SortRoomExArrayByBounds113c`).
 */
export function DRLGROOM_AppendAndSortAdjacentRoom113c(
  m: Memory113c,
  pRoomEx: number,
  _pMemPool: number,
  pAdjRoomEx: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pOldArr = m.u32((roomEx + 0x08) >>> 0);
  const nNewCount = ((m.u32((roomEx + 0x2c) >>> 0) | 0) + 1) | 0;
  m.setU32((roomEx + 0x2c) >>> 0, nNewCount >>> 0);

  const pNewArr = m.alloc((nNewCount << 2) >>> 0);
  if (pNewArr === 0) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\DrlgRoom.cpp', 789);
  }
  if (pOldArr !== 0) {
    for (let i = 0; i < nNewCount - 1; i++) {
      m.setU32((pNewArr + i * 4) >>> 0, m.u32((pOldArr + i * 4) >>> 0));
    }
  }
  m.setU32((roomEx + 0x08) >>> 0, pNewArr);

  const nCount = m.u32((roomEx + 0x2c) >>> 0) | 0;
  m.setU32((pNewArr + (nCount - 1) * 4) >>> 0, pAdjRoomEx >>> 0);
  DRLGROOM_SortRoomExArrayByBounds113c(
    m,
    m.u32((roomEx + 0x2c) >>> 0) | 0,
    m.u32((roomEx + 0x08) >>> 0),
  );
}

/**
 * `@va D2Common:0x6FD94BD0` (`DRLGROOM_AllocRoomEx113c`, not exported;
 * custom LTCG `ebx = pLevel`, stack `[esp+4] = nType`, `ret 4`).
 *
 * Allocates a `0xEC`-byte `D2RoomExStrc`, zeroes it, initializes `pLevel (+0x58)`, `nType (+0x48)`,
 * `u8(+0x44) = 4`, rolls `pLevel->pSeed (+0x1C4)` to seed `pRoomEx->pSeed (+0x14)` and `dwInitSeed (+0x04)`,
 * copies `0x40000` flag when `(u8(pLevel + 4) & 0x10) != 0`, and allocates `pTypeData (+0x20)`
 * (`0x70` bytes when `nType == 1`, `0xF8` bytes when `nType == 2`).
 */
export function DRLGROOM_AllocRoomEx113c(
  m: Memory113c,
  pLevel: number,
  nType: number,
): number {
  const lvl = pLevel >>> 0;
  const pDrlg0 = m.u32((lvl + 0x1b4) >>> 0);
  const _pMemPool0 = m.u32((pDrlg0 + 0x478) >>> 0);
  void _pMemPool0;

  const pRoomEx = m.alloc(0xec);
  m.fill(pRoomEx, 0xec, 0);
  m.setU32((pRoomEx + 0x58) >>> 0, lvl);
  m.setU32((pRoomEx + 0x48) >>> 0, nType >>> 0);
  m.setU8((pRoomEx + 0x44) >>> 0, 4);

  const lvlSeedLo = m.u32((lvl + 0x1c4) >>> 0);
  const lvlSeedHi = m.u32((lvl + 0x1c8) >>> 0);
  const prod1 = BigInt(lvlSeedLo) * 0x6ac690c5n + BigInt(lvlSeedHi);
  const nextLvlLo = Number(prod1 & 0xffffffffn) >>> 0;
  const nextLvlHi = Number((prod1 >> 32n) & 0xffffffffn) >>> 0;
  m.setU32((lvl + 0x1c8) >>> 0, nextLvlHi);
  m.setU32((lvl + 0x1c4) >>> 0, nextLvlLo);

  m.setU32((pRoomEx + 0x14) >>> 0, nextLvlLo);
  m.setU32((pRoomEx + 0x18) >>> 0, 0x29a);
  const prod2 = BigInt(nextLvlLo) * 0x6ac690c5n + 0x29an;
  const roomLo = Number(prod2 & 0xffffffffn) >>> 0;
  const roomHi = Number((prod2 >> 32n) & 0xffffffffn) >>> 0;
  m.setU32((pRoomEx + 0x18) >>> 0, roomHi);
  m.setU32((pRoomEx + 0x14) >>> 0, roomLo);
  m.setU32((pRoomEx + 0x04) >>> 0, roomLo);

  if ((m.u8((lvl + 0x04) >>> 0) & 0x10) !== 0) {
    m.setU32(
      (pRoomEx + 0x28) >>> 0,
      (m.u32((pRoomEx + 0x28) >>> 0) | 0x40000) >>> 0,
    );
  }

  const t = nType | 0;
  if (t === 1) {
    const pLvl1 = m.u32((pRoomEx + 0x58) >>> 0);
    const pDrlg1 = m.u32((pLvl1 + 0x1b4) >>> 0);
    void m.u32((pDrlg1 + 0x478) >>> 0);
    const pTypeData = m.alloc(0x70);
    m.fill(pTypeData, 0x70, 0);
    m.setU32((pRoomEx + 0x20) >>> 0, pTypeData);
  } else if (t === 2) {
    const pLvl2 = m.u32((pRoomEx + 0x58) >>> 0);
    const pDrlg2 = m.u32((pLvl2 + 0x1b4) >>> 0);
    void m.u32((pDrlg2 + 0x478) >>> 0);
    const pTypeData = m.alloc(0xf8);
    m.fill(pTypeData, 0xf8, 0);
    m.setU32((pRoomEx + 0x20) >>> 0, pTypeData);
  }

  return pRoomEx | 0;
}

/**
 * `@va D2Common:0x6FD94CE0` (`DRLGWARP_GetWarpDstAdjustData113c`, not exported;
 * custom LTCG `eax = pRoomEx`, `edx = nLevelId`, plain `ret`).
 *
 * Walks `pWarp = *(u32*)(pRoomEx + 0x90)` via `pNext = *(u32*)(pWarp + 0x44)`:
 * - Asserts `*(u32*)pWarp != 0` (`line 1040`, `0x410`).
 * - If `*(u32*)pWarp == nLevelId`, returns `pWarp + 4`.
 * If not found, looks up `D2LevelsTxt` for `nLevelId` (`0 <= nLevelId < sgptDataTables->nLevelsTxtRecordCount (+0xC5C)`)
 * via `sgpLevelsTxt` (`0x6FDF0B38`, stride `0x9C`) and returns `pLevelsTxtRecord + 0x48` (or `0x48` if out of range).
 */
export function DRLGWARP_GetWarpDstAdjustData113c(
  m: Memory113c,
  pRoomEx: number,
  nLevelId: number,
): number {
  const lvlId = nLevelId | 0;
  let pWarp = m.u32((pRoomEx + 0x90) >>> 0);
  while (pWarp !== 0) {
    const entryLvlId = m.u32(pWarp) | 0;
    if (entryLvlId === 0) {
      throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\OutRoom.cpp', 1040);
    }
    if (lvlId === entryLvlId) {
      return (pWarp + 4) | 0;
    }
    pWarp = m.u32((pWarp + 0x44) >>> 0);
  }

  if (lvlId >= 0) {
    const pDataTables = m.u32(SGPT_DATA_TABLES_PTR_VA_6FDE9E1C);
    const count = m.u32((pDataTables + 0xc5c) >>> 0) | 0;
    if (lvlId < count) {
      const pLevelsTxt = m.u32(SGPT_LEVELS_TXT_VA_6FDF0B38);
      return (pLevelsTxt + imul32(lvlId, 0x9c) + 0x48) | 0;
    }
  }
  return 0x48;
}

/**
 * `@va D2Common:0x6FD94DF0` (`DRLGROOM_BuildRoomExNearList113c`, custom `edi = pRoomEx`, `[esp+4] = pMemPool`, `ret 4`).
 *
 * Walks `pRoomEx->pLevel (+0x58)->pFirstRoomEx (+0x10)` via `pRoomNext (+0x24)`, collects all rooms whose
 * X and Y tile gaps from `pRoomEx` are both `< 6` into a 30-entry stack array, sorts via `0x6FD945A0`
 * (`DRLGROOM_SortRoomExArrayByBounds113c`), allocates `nCount * 4` bytes at `pRoomEx->ppRoomsNear (+0x08)`,
 * and copies the sorted pointers.
 */
export function DRLGROOM_BuildRoomExNearList113c(
  m: Memory113c,
  pRoomEx: number,
  _pMemPool = 0,
): void {
  const roomEx = pRoomEx >>> 0;
  const pLevel = m.u32((roomEx + 0x58) >>> 0);
  let pCur = m.u32((pLevel + 0x10) >>> 0);
  m.setU32((roomEx + 0x2c) >>> 0, 0);

  const tempNear = new Uint32Array(30);
  while (pCur !== 0) {
    const x1 = m.u32((roomEx + 0x34) >>> 0) | 0;
    const x2 = m.u32((pCur + 0x34) >>> 0) | 0;
    const gapX =
      x1 < x2
        ? ((x2 - (m.u32((roomEx + 0x3c) >>> 0) | 0)) - x1) | 0
        : ((x1 - (m.u32((pCur + 0x3c) >>> 0) | 0)) - x2) | 0;

    const y1 = m.u32((roomEx + 0x38) >>> 0) | 0;
    const y2 = m.u32((pCur + 0x38) >>> 0) | 0;
    const gapY =
      y1 < y2
        ? ((y2 - (m.u32((roomEx + 0x40) >>> 0) | 0)) - y1) | 0
        : ((y1 - (m.u32((pCur + 0x40) >>> 0) | 0)) - y2) | 0;

    if (gapX < 6 && gapY < 6) {
      const idx = m.u32((roomEx + 0x2c) >>> 0) | 0;
      tempNear[idx] = pCur;
      m.setU32((roomEx + 0x2c) >>> 0, ((idx + 1) | 0) >>> 0);
    }
    pCur = m.u32((pCur + 0x24) >>> 0);
  }

  const nCount = m.u32((roomEx + 0x2c) >>> 0) | 0;
  const pDest = m.alloc((nCount * 4) >>> 0);
  m.setU32((roomEx + 0x08) >>> 0, pDest);
  for (let i = 0; i < nCount; i++) {
    m.setU32((pDest + i * 4) >>> 0, tempNear[i]!);
  }
  DRLGROOM_SortRoomExArrayByBounds113c(m, nCount, pDest);
}

/**
 * `@va D2Common:0x6FD95240` (`DRLGROOM_AllocRoomTileWindowNode113c`, custom `edi = pRoomEx`,
 * `[esp+4] = nPackedCoords`, `[esp+8] = nSideIndex`, `ret 8`).
 *
 * Allocates and zeroes a `0x18`-byte window node via `Fog.#10045`, resolves `nTileId` from
 * `0x6FD69950` (`DRLGROOMTILE_GetWarpLevelsArray113c`) indexed by `nSideIndex & 0xFF`, looks up the
 * cache entry via `0x6FDBC5D0` (`DATATBLS_FindFloorWindowTileCacheEntry113c` with `0x62`), and prepends
 * the node to `pRoomEx + 0x4C`.
 */
export function DRLGROOM_AllocRoomTileWindowNode113c(
  m: Memory113c,
  pRoomEx: number,
  nPackedCoords: number,
  nSideIndex: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pLevel0 = m.u32((roomEx + 0x58) >>> 0);
  const pDrlg0 = m.u32((pLevel0 + 0x1b4) >>> 0);
  void m.u32((pDrlg0 + 0x478) >>> 0);

  const pNode = m.alloc(0x18);
  m.fill(pNode, 0x18, 0);
  m.setU32(pNode, nPackedCoords >>> 0);

  const pLevel = m.u32((roomEx + 0x58) >>> 0);
  const nLevelId = m.u32((pLevel + 0x1d0) >>> 0) | 0;
  const pDrlg = m.u32((pLevel + 0x1b4) >>> 0);
  const pWarpLevels = DRLGROOMTILE_GetWarpLevelsArray113c(m, pDrlg, nLevelId);
  const sideIdx = nSideIndex & 0xff;
  const nTileId = m.u32((pWarpLevels + sideIdx * 4) >>> 0) | 0;

  const pCacheEntry = DATATBLS_FindFloorWindowTileCacheEntry113c(
    m,
    nTileId,
    0x62,
  );
  m.setU32((pNode + 0x10) >>> 0, pCacheEntry);
  m.setU32((pNode + 0x08) >>> 0, 1);
  m.setU32((pNode + 0x04) >>> 0, m.u32((roomEx + 0x4c) >>> 0));
  m.setU32((roomEx + 0x4c) >>> 0, pNode);
}

/**
 * `@va D2Common:0x6FD958C0` (`DRLG_GetAutomapCoordSlotPtr113c`, not exported;
 * custom LTCG `ecx = pBase`, `edx = nGroup`, `eax = nIndex`, plain `ret`).
 *
 * Asserts `nGroup >>> 0 < 3` (`line 143`, `0x8F`) and `nIndex >>> 0 < 3` (`line 144`, `0x90`),
 * and returns `pBase + (nGroup + 1) * 0x30 + (nIndex << 4)`.
 */
export function DRLG_GetAutomapCoordSlotPtr113c(
  pBase: number,
  nGroup: number,
  nIndex: number,
): number {
  const grp = nGroup >>> 0;
  if (grp >= 3) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\DrlgRoom.cpp', 143);
  }
  const idx = nIndex >>> 0;
  if (idx >= 3) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\DrlgRoom.cpp', 144);
  }
  return ((pBase >>> 0) + (grp + 1) * 0x30 + (idx << 4)) | 0;
}

/**
 * `@va D2Common:0x6FD963F0` (`DRLGROOM_RollItemCoordinate113c`, not exported;
 * custom LTCG `eax = nMax`, `ecx = nMin`, `edx = pUnit`, plain `ret`).
 *
 * - If `nMax == nMin`, returns `nMin`; if `nMax < nMin`, swaps them.
 * - Asserts `pUnit != 0` (`line 5381`), `pUnit->dwUnitType (+0x00) == 4` (`line 5382`),
 *   and `pItemData = pUnit->pItemData (+0x14) != 0` (`line 5384`).
 * - Computes `range = (max - min) + (u16(pItemData + 0x30) >= 1 ? 1 : 0)`.
 * - Rolls `pItemData->pSeed` (`pItemData + 0x04`) and returns `min + roll(range)`.
 */
export function DRLGROOM_RollItemCoordinate113c(
  m: Memory113c,
  nMax: number,
  nMin: number,
  pUnit: number,
): number {
  let max = nMax | 0;
  let min = nMin | 0;
  if (max === min) return min;
  if (max < min) {
    const tmp = max;
    max = min;
    min = tmp;
  }
  if (pUnit === 0) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\DrlgRoom.cpp', 5381);
  }
  const unit = pUnit >>> 0;
  const unitType = m.u32(unit) | 0;
  if (unitType !== 4) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\DrlgRoom.cpp', 5382);
  }
  const pItemData = m.u32((unit + 0x14) >>> 0);
  if (pItemData === 0) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\DrlgRoom.cpp', 5384);
  }
  let range = (max - min) | 0;
  if (m.u16((pItemData + 0x30) >>> 0) >= 1) {
    range = (range + 1) | 0;
  }
  const pSeed = (pItemData + 4) >>> 0;
  if (range <= 0) {
    return min;
  }
  const lo0 = m.u32(pSeed);
  const hi0 = m.u32((pSeed + 4) >>> 0);
  const prod = BigInt(lo0) * 0x6ac690c5n + BigInt(hi0);
  const newLo = Number(prod & 0xffffffffn) >>> 0;
  const newHi = Number((prod >> 32n) & 0xffffffffn) >>> 0;
  m.setU32((pSeed + 4) >>> 0, newHi);
  m.setU32(pSeed, newLo);
  const uRange = range >>> 0;
  const rem =
    (uRange & ((uRange - 1) >>> 0)) === 0
      ? (newLo & ((uRange - 1) >>> 0)) >>> 0
      : (newLo % uRange) >>> 0;
  return (rem + min) | 0;
}

/**
 * `@va D2Common:0x6FD964D0` (`DRLGROOM_RollItemCoordinateAlt113c`, not exported;
 * custom LTCG `eax = nMax`, `ecx = nMin`, `edx = pUnit`, plain `ret`).
 *
 * Duplicate codegen twin of `0x6FD963F0` (`DRLGROOM_RollItemCoordinate113c`) in `D2Common.dll`.
 */
export function DRLGROOM_RollItemCoordinateAlt113c(
  m: Memory113c,
  nMax: number,
  nMin: number,
  pUnit: number,
): number {
  return DRLGROOM_RollItemCoordinate113c(m, nMax, nMin, pUnit);
}

function readCString113c(m: Memory113c, pStr: number): string {
  let out = '';
  for (let p = pStr >>> 0; ; p = (p + 1) >>> 0) {
    const b = m.u8(p);
    if (b === 0) break;
    out += String.fromCharCode(b);
  }
  return out;
}

function hashDt1PathIntoTiles113c(
  m: Memory113c,
  ppTiles: number,
  path: string,
): void {
  let h = m.u32(ppTiles >>> 0);
  for (let i = 0; i < path.length; i++) {
    h = (imul32(h, 33) + (path.charCodeAt(i) & 0xff)) >>> 0;
  }
  m.setU32(ppTiles >>> 0, h);
}

/**
 * `@va D2Common:0x6FDB8400` (`D2Common.#10006` `DRLGROOM_LoadDt1Files113c`,
 * custom LTCG `esi = pRoomEx`, plain `ret`).
 *
 * - Asserts `sgpLvlTypesTxt` (`*(u32*)0x6FDF141C`) `!= 0` (`line 593`, `0x251`).
 * - Computes `pLvlType = sgpLvlTypesTxt + pRoomEx->pLevel (+0x58)->nDrlgType (+0x1C0) * 0x788`.
 * - Iterates bits `0..31` of `pRoomEx->dwDT1Mask (+0x50)`: for each set bit `i`, passes
 *   `(&pRoomEx->pTiles (+0x68), pLvlType + i * 0x3C)` to `D2CMP.#10085` (`0x6FD592F4`).
 * - Formats and loads the 3 universal DT1 files (`Blank.dt1` at `0x6FDDFFB4`, `InvisWal.dt1` at `0x6FDDFF90`,
 *   `Warp.dt1` at `0x6FDDFF70`) with prefix `"DATA\\GLOBAL"` (`0x6FDDAD5C`) via `D2CMP.#10085`.
 * - Sets bit `0x01000000` on `pRoomEx->dwFlags (+0x28)`.
 */
export function DRLGROOM_LoadDt1Files113c(
  m: Memory113c,
  pRoomEx: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pLvlTypesTxt = m.u32(SGPT_LVLTYPES_TXT_VA_6FDF141C);
  const pLevel = m.u32((roomEx + 0x58) >>> 0);
  const nDrlgType = m.u32((pLevel + 0x1c0) >>> 0) | 0;
  if (pLvlTypesTxt === 0) {
    throw new D2CommonAssertError('..\\Source\\D2Common\\DRLG\\RoomTile.cpp', 593);
  }

  let mask = m.u32((roomEx + 0x50) >>> 0) >>> 0;
  let pEntry = (pLvlTypesTxt + imul32(nDrlgType, 0x788)) >>> 0;
  const ppTiles = (roomEx + 0x68) >>> 0;
  let bitIdx = 0;
  while (mask !== 0 && bitIdx < 0x20) {
    if ((mask & 1) !== 0) {
      const fileStr = readCString113c(m, pEntry);
      hashDt1PathIntoTiles113c(m, ppTiles, fileStr);
    }
    mask = mask >>> 1;
    pEntry = (pEntry + 0x3c) >>> 0;
    bitIdx++;
  }

  const prefix1 = readCString113c(m, DT1_GLOBAL_PREFIX_VA_6FDDAD5C);
  const fmt1 = readCString113c(m, DT1_BLANK_FMT_VA_6FDDFFB4);
  hashDt1PathIntoTiles113c(m, ppTiles, fmt1.replace('%s', prefix1));

  const prefix2 = readCString113c(m, DT1_GLOBAL_PREFIX_VA_6FDDAD5C);
  const fmt2 = readCString113c(m, DT1_INVISWAL_FMT_VA_6FDDFF90);
  hashDt1PathIntoTiles113c(m, ppTiles, fmt2.replace('%s', prefix2));

  const prefix3 = readCString113c(m, DT1_GLOBAL_PREFIX_VA_6FDDAD5C);
  const fmt3 = readCString113c(m, DT1_WARP_FMT_VA_6FDDFF70);
  hashDt1PathIntoTiles113c(m, ppTiles, fmt3.replace('%s', prefix3));

  m.setU32(
    (roomEx + 0x28) >>> 0,
    (m.u32((roomEx + 0x28) >>> 0) | 0x01000000) >>> 0,
  );
}

/**
 * `@va D2Common:0x6FD5AE10` (`DRLGPRESET_InitPresetRoomEx113c`, not exported;
 * custom LTCG `eax = pLevel`, `esi = pBox`, `edi = pMazeGrid`,
 * stack `[esp+4] = pMap`, `[esp+8] = dwDT1Mask`, `[esp+0xC] = dwFlags`, `[esp+0x10] = dwPresetFlags`, `ret 0x10`).
 *
 * Allocates a preset `D2RoomExStrc` (`nType = 2`) via `0x6FD94BD0` (`DRLGROOM_AllocRoomEx113c`),
 * sets `dwDT1Mask`, ORs `dwFlags`, copies 4 tile box dwords from `pBox` into `pRoomEx + 0x34..0x40`,
 * populates `pPreset = pRoomEx->pPreset (+0x20)` (`pMap`, `nLevelPrest = pMap->pLvlPrestTxt->dwDef`,
 * `dwFlags = dwPresetFlags`, `pMazeGrid`), sets `pMazeGrid->dwFlags |= 1` when `pMazeGrid != 0`,
 * sets `pRoomEx->dwFlags |= 0x800000` when `pMap->pLvlPrestTxt->bPopulate (+0x08) == 0`,
 * prepends `pRoomEx` to `pLevel->pFirstRoomEx (+0x10)`, increments `pLevel->nRooms (+0x08)`, and returns `pRoomEx`.
 */
export function DRLGPRESET_InitPresetRoomEx113c(
  m: Memory113c,
  pLevel: number,
  pBox: number,
  pMazeGrid: number,
  pMap: number,
  dwDT1Mask: number,
  dwFlags: number,
  dwPresetFlags: number,
): number {
  const lvl = pLevel >>> 0;
  const box = pBox >>> 0;
  const maze = pMazeGrid >>> 0;
  const map = pMap >>> 0;

  const pRoomEx = DRLGROOM_AllocRoomEx113c(m, lvl, 2) >>> 0;
  m.set(pRoomEx, D2RoomExStrc.dwDT1Mask, dwDT1Mask >>> 0);
  m.set(
    pRoomEx,
    D2RoomExStrc.dwFlags,
    (m.get(pRoomEx, D2RoomExStrc.dwFlags) | (dwFlags >>> 0)) >>> 0,
  );

  m.set(pRoomEx, D2RoomExStrc.nTileXPos, m.u32(box) | 0);
  m.set(pRoomEx, D2RoomExStrc.nTileYPos, m.u32((box + 0x04) >>> 0) | 0);
  m.set(pRoomEx, D2RoomExStrc.nTileWidth, m.u32((box + 0x08) >>> 0) | 0);
  m.set(pRoomEx, D2RoomExStrc.nTileHeight, m.u32((box + 0x0c) >>> 0) | 0);

  const pPreset = m.get(pRoomEx, D2RoomExStrc.pTypeData);
  m.set(pPreset, D2DrlgPresetRoomStrc.pMap, map);
  const pLvlPrestTxt = m.u32((map + 0x08) >>> 0);
  // +0x00 of D2LvlPrestTxt is dwDef (`mov edx, [edx]; mov [ecx], edx` at 0x6FD5AE56..0x6FD5AE58)
  m.set(pPreset, D2DrlgPresetRoomStrc.nLevelPrest, m.u32(pLvlPrestTxt) | 0);
  m.set(pPreset, D2DrlgPresetRoomStrc.dwFlags, dwPresetFlags >>> 0);
  m.set(pPreset, D2DrlgPresetRoomStrc.pMazeGrid, maze);

  if (maze !== 0) {
    m.setU32((maze + 0x0c) >>> 0, (m.u32((maze + 0x0c) >>> 0) | 1) >>> 0);
  }

  const pMapReload = m.get(pPreset, D2DrlgPresetRoomStrc.pMap);
  const pPrestTxtReload = m.u32((pMapReload + 0x08) >>> 0);
  // +0x08 of D2LvlPrestTxt is bPopulate (`mov ecx, [edx+0x8]; test ecx, ecx` at 0x6FD5AE73..0x6FD5AE76)
  const bPopulate = m.u32((pPrestTxtReload + 0x08) >>> 0);
  if (bPopulate === 0) {
    m.set(
      pRoomEx,
      D2RoomExStrc.dwFlags,
      (m.get(pRoomEx, D2RoomExStrc.dwFlags) | 0x800000) >>> 0,
    );
  }

  m.set(pRoomEx, D2RoomExStrc.pRoomNext, m.get(lvl, D2DrlgLevelStrc.pFirstRoomEx));
  const nextCount = ((m.get(lvl, D2DrlgLevelStrc.nRooms) | 0) + 1) | 0;
  m.set(lvl, D2DrlgLevelStrc.pFirstRoomEx, pRoomEx);
  m.set(lvl, D2DrlgLevelStrc.nRooms, nextCount);
  return pRoomEx >>> 0;
}

/**
 * `@va D2Common:0x6FD944F0` (`DRLGROOM_FlagIfAdjacentToTown113c`, not exported;
 * custom LTCG `edx = pRoomEx`, plain `ret`).
 *
 * If `pRoomEx->pLevel (+0x58)->nLevelId (+0x1D0)` is not a town level (`0x6FD7D320`) and
 * `pRoomEx->nRoomsNear (+0x2C) > 0`, scans `pRoomEx->ppRoomsNear[0..nRoomsNear-1]`; on the first
 * neighbor in a town level, sets `pRoomEx->dwFlags (+0x28) |= 0x800000` and returns.
 */
export function DRLGROOM_FlagIfAdjacentToTown113c(
  m: Memory113c,
  pRoomEx: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const pLevel = m.get(roomEx, D2RoomExStrc.pLevel);
  if (DRLG_IsTownLevel113c(m.get(pLevel, D2DrlgLevelStrc.nLevelId) | 0) !== 0) {
    return;
  }
  if ((m.get(roomEx, D2RoomExStrc.nRoomsNear) | 0) <= 0) {
    return;
  }
  const ppNear = m.get(roomEx, D2RoomExStrc.ppRoomsNear);
  let i = 0;
  while (true) {
    const pAdj = m.u32((ppNear + i * 4) >>> 0);
    const pAdjLevel = m.get(pAdj, D2RoomExStrc.pLevel);
    if (DRLG_IsTownLevel113c(m.get(pAdjLevel, D2DrlgLevelStrc.nLevelId) | 0) !== 0) {
      m.set(
        roomEx,
        D2RoomExStrc.dwFlags,
        (m.get(roomEx, D2RoomExStrc.dwFlags) | 0x800000) >>> 0,
      );
      return;
    }
    i = (i + 1) | 0;
    if (i >= (m.get(roomEx, D2RoomExStrc.nRoomsNear) | 0)) {
      break;
    }
  }
}

/**
 * `@va D2Common:0x6FD94B20` (`DRLGROOM_InsertOrthSorted113c`, not exported;
 * custom LTCG `ebx = pNew`, stack `[esp+4] = ppHead`, `ret 4`).
 *
 * Inserts `pNew` (`D2DrlgOrthStrc*`) into `*ppHead` using `0x6FD94870` (`DRLGROOM_CompareOrthoNodes113c`):
 * - `*ppHead == 0`: sets `*ppHead = pNew` (without modifying `pNew->pNext`).
 * - `(*ppHead)->pNext == 0`: compares `(pNew, *ppHead)`; if non-zero prepends `pNew` before `*ppHead`, else appends `pNew` after `*ppHead`.
 * - `(*ppHead)->pNext != 0`: walks starting at `cur = (*ppHead)->pNext` (head is not re-compared) until `cur == 0`
 *   or `CompareOrthoNodes(pNew, cur) != 0`, and splices `pNew` between `prev` and `cur`.
 */
export function DRLGROOM_InsertOrthSorted113c(
  m: Memory113c,
  pNew: number,
  ppHead: number,
): void {
  const newNode = pNew >>> 0;
  const pp = ppHead >>> 0;
  const h = m.u32(pp);
  if (h === 0) {
    m.setU32(pp, newNode);
    return;
  }
  let cur = m.get(h, D2DrlgOrthStrc.pNext);
  if (cur === 0) {
    if (DRLGROOM_CompareOrthoNodes113c(m, newNode, h) !== 0) {
      m.set(newNode, D2DrlgOrthStrc.pNext, h);
      m.setU32(pp, newNode);
      return;
    }
    m.set(newNode, D2DrlgOrthStrc.pNext, 0);
    m.set(h, D2DrlgOrthStrc.pNext, newNode);
    return;
  }
  let prev = h;
  while (cur !== 0) {
    if (DRLGROOM_CompareOrthoNodes113c(m, newNode, cur) !== 0) {
      break;
    }
    prev = cur;
    cur = m.get(cur, D2DrlgOrthStrc.pNext);
  }
  m.set(newNode, D2DrlgOrthStrc.pNext, cur);
  m.set(prev, D2DrlgOrthStrc.pNext, newNode);
}

/**
 * `@va D2Common:0x6FD94BA0` (`DRLGROOM_LinkRoomsBidirectional113c`, not exported;
 * custom LTCG `eax = nDir`, `ecx = pRoomExB`, `ebx = pRoomExA`, plain `ret`).
 *
 * Calls `0x6FD94950` (`DRLGROOM_AddOrthRoomData113c`) in both directions:
 * `(pRoomExA, pRoomExB, nDir)` and `(pRoomExB, pRoomExA, (nDir - 2) & 3)`.
 */
export function DRLGROOM_LinkRoomsBidirectional113c(
  m: Memory113c,
  nDir: number,
  pRoomExB: number,
  pRoomExA: number,
): void {
  DRLGROOM_AddOrthRoomData113c(m, pRoomExA, pRoomExB, nDir);
  DRLGROOM_AddOrthRoomData113c(m, pRoomExB, pRoomExA, ((nDir | 0) - 2) & 3);
}

/**
 * `@va D2Common:0x6FDD3630` (`DRLGROOM_CopyPresetUnitsInTileBox113c`, not exported;
 * custom LTCG `eax = pTileBox`, `ecx = nDstTileY`, `edx = nDstTileX`,
 * stack `[esp+4] = ppRoomEx`, `[esp+8] = pMemPool`, `[esp+0xC] = pSrc`, `ret 0xC`).
 *
 * Scales `nDstTileX/Y` and `pTileBox` (`{x, y, w, h}`) by `5` into subtile coordinates, walks
 * `u = *(*(pSrc + 0x50) + 0x54)` via `u = *(u + 0x0C)`, and for every unit strictly inside
 * `boxX < ux < boxX + boxW && boxY < uy < boxY + boxH` (`jle` / `jge` signed), clones it via
 * `0x6FD94480` (`DRLGROOM_AllocPresetUnit113c`) into `*ppRoomEx` at `(ux - boxX + dstX, uy - boxY + dstY)`.
 */
export function DRLGROOM_CopyPresetUnitsInTileBox113c(
  m: Memory113c,
  pTileBox: number,
  nDstTileY: number,
  nDstTileX: number,
  ppRoomEx: number,
  pMemPool: number,
  pSrc: number,
): void {
  const box = pTileBox >>> 0;
  const dstY = imul32(nDstTileY | 0, 5);
  const boxX = imul32(m.u32(box) | 0, 5);
  const dstX = imul32(nDstTileX | 0, 5);
  const boxY = imul32(m.u32((box + 0x04) >>> 0) | 0, 5);
  const boxW = imul32(m.u32((box + 0x08) >>> 0) | 0, 5);
  const boxH = imul32(m.u32((box + 0x0c) >>> 0) | 0, 5);

  const pSrcInner = m.u32(((pSrc >>> 0) + 0x50) >>> 0);
  let u = m.u32((pSrcInner + 0x54) >>> 0);
  const endX = (boxX + boxW) | 0;
  const endY = (boxY + boxH) | 0;

  while (u !== 0) {
    const ux = m.u32((u + 0x08) >>> 0) | 0;
    if (ux > boxX) {
      const uy = m.u32((u + 0x18) >>> 0) | 0;
      if (uy > boxY && ux < endX && uy < endY) {
        const newY = ((uy - boxY) + dstY) | 0;
        const nMode = m.u32(u);
        const newX = ((ux - boxX) + dstX) | 0;
        const nUnitType = m.u32((u + 0x14) >>> 0);
        const nTxtFileNo = m.u32((u + 0x04) >>> 0);
        const pDestRoomEx = m.u32(ppRoomEx >>> 0);
        DRLGROOM_AllocPresetUnit113c(
          m,
          pMemPool,
          pDestRoomEx,
          nUnitType,
          nTxtFileNo,
          nMode,
          newX,
          newY,
        );
      }
    }
    u = m.u32((u + 0x0c) >>> 0);
  }
}

/**
 * `@va D2Common:0x6FD94F20` (`DRLGROOM_AllocAndInsertOrthNode113c`, custom `eax = pLevel`,
 * stack `[esp+4] = ppOrthListHead`, `[esp+8] = nDirection`, `[esp+0xC] = bPreset`, `ret 0xC`).
 *
 * Reads `pLevel->pDrlg (+0x1B4) -> pMemPool (+0x478)`, allocates a 24-byte `D2DrlgOrthStrc` node
 * via `Fog.#10045` (`0x6FD59222`), zeroes it, initializes `pRoomEx/pLevel (+0x00) = pLevel`,
 * `nDirection (+0x04) = nDirection`, `bPreset (+0x08) = bPreset`, `bInit (+0x0C) = 0`,
 * `pBox (+0x10) = pLevel + 0x1C`, and calls `0x6FD94B20` (`DRLGROOM_InsertOrthSorted113c`).
 */
export function DRLGROOM_AllocAndInsertOrthNode113c(
  m: Memory113c,
  pLevel: number,
  ppOrthListHead: number,
  nDirection: number,
  bPreset: number,
): void {
  const lvl = pLevel >>> 0;
  const pDrlg = m.u32((lvl + 0x1b4) >>> 0);
  void m.u32((pDrlg + 0x478) >>> 0);
  const pNode = m.alloc(0x18);
  m.fill(pNode, 0x18, 0);
  m.setU32((pNode + 0x04) >>> 0, nDirection >>> 0);
  m.setU32(pNode, lvl);
  m.setU32((pNode + 0x08) >>> 0, bPreset >>> 0);
  m.setU32((pNode + 0x0c) >>> 0, 0);
  m.setU32((pNode + 0x10) >>> 0, (lvl + 0x1c) >>> 0);
  DRLGROOM_InsertOrthSorted113c(m, pNode, ppOrthListHead >>> 0);
}

/**
 * `@va D2Common:0x6FD94F90` (`DRLGROOM_FreeRoomEx113c`, not exported;
 * `__stdcall(pRoomEx) -> void`, `ret 4`).
 */
export function DRLGROOM_FreeRoomEx113c(m: Memory113c, pRoomEx: number): void {
  const roomEx = pRoomEx >>> 0;
  const freeFn = (m as { free?: (p: number) => void }).free;
  const pLevelInit = m.u32((roomEx + 0x58) >>> 0);
  const pDrlgInit = m.u32((pLevelInit + 0x1b4) >>> 0);
  void m.u32((pDrlgInit + 0x478) >>> 0);

  let pStatus = m.u32((roomEx + 0x4c) >>> 0);
  while (pStatus !== 0) {
    const pNextStatus = m.u32((pStatus + 0x04) >>> 0);
    freeFn?.call(m, pStatus);
    pStatus = pNextStatus;
  }
  m.setU32((roomEx + 0x4c) >>> 0, 0);

  const ppRoomsNear = m.u32((roomEx + 0x08) >>> 0);
  if (ppRoomsNear !== 0) {
    freeFn?.call(m, ppRoomsNear);
    m.setU32((roomEx + 0x2c) >>> 0, 0);
    m.setU32((roomEx + 0x08) >>> 0, 0);
  }

  const nType = m.u32((roomEx + 0x48) >>> 0) | 0;
  if (nType === 2) {
    DRLGPRESET_FreePresetRoomData113c(m, roomEx);
  } else if (nType === 1) {
    const pOutdoor = m.u32((roomEx + 0x20) >>> 0);
    const pLevelOut = m.u32((roomEx + 0x58) >>> 0);
    const pDrlgOut = m.u32((pLevelOut + 0x1b4) >>> 0);
    const pMemPoolOut = m.u32((pDrlgOut + 0x478) >>> 0);
    if (pOutdoor !== 0) {
      DRLGOUTROOM_FreeOutdoorRoomData113c(m, pMemPoolOut, pOutdoor);
      freeFn?.call(m, pOutdoor);
      m.setU32((roomEx + 0x20) >>> 0, 0);
    }
  }

  let pPresetUnit = m.u32((roomEx + 0x5c) >>> 0);
  while (pPresetUnit !== 0) {
    const pNextUnit = m.u32((pPresetUnit + 0x0c) >>> 0);
    const pSub = m.u32((pPresetUnit + 0x10) >>> 0);
    if (pSub !== 0) {
      freeFn?.call(m, m.u32((pSub + 0x04) >>> 0));
      freeFn?.call(m, pSub);
    }
    freeFn?.call(m, pPresetUnit);
    pPresetUnit = pNextUnit;
  }

  let pOrthWalk = m.u32(roomEx);
  while (pOrthWalk !== 0) {
    const pNextOrthWalk = m.u32((pOrthWalk + 0x14) >>> 0);
    if (m.u32((pOrthWalk + 0x0c) >>> 0) === 1) {
      const pNeighbor = m.u32(pOrthWalk);

      let pSelfNode = m.u32(roomEx);
      if (m.u32((pSelfNode + 0x0c) >>> 0) === 1 && m.u32(pSelfNode) === pNeighbor) {
        m.setU32(roomEx, m.u32((pSelfNode + 0x14) >>> 0));
        freeFn?.call(m, pSelfNode);
      } else {
        let pPrev = pSelfNode;
        let pCur = m.u32((pSelfNode + 0x14) >>> 0);
        while (pCur !== 0) {
          if (m.u32((pCur + 0x0c) >>> 0) === 1 && m.u32(pCur) === pNeighbor) {
            m.setU32((pPrev + 0x14) >>> 0, m.u32((pCur + 0x14) >>> 0));
            freeFn?.call(m, pCur);
            break;
          }
          pPrev = pCur;
          pCur = m.u32((pCur + 0x14) >>> 0);
        }
      }

      let pNeighHead = m.u32(pNeighbor);
      if (m.u32((pNeighHead + 0x0c) >>> 0) === 1 && m.u32(pNeighHead) === roomEx) {
        m.setU32(pNeighbor, m.u32((pNeighHead + 0x14) >>> 0));
        freeFn?.call(m, pNeighHead);
      } else {
        let pPrev = pNeighHead;
        let pCur = m.u32((pNeighHead + 0x14) >>> 0);
        while (pCur !== 0) {
          if (m.u32((pCur + 0x0c) >>> 0) === 1 && m.u32(pCur) === roomEx) {
            m.setU32((pPrev + 0x14) >>> 0, m.u32((pCur + 0x14) >>> 0));
            freeFn?.call(m, pCur);
            break;
          }
          pPrev = pCur;
          pCur = m.u32((pCur + 0x14) >>> 0);
        }
      }
    }
    pOrthWalk = pNextOrthWalk;
  }

  let pRemOrth = m.u32(roomEx);
  while (pRemOrth !== 0) {
    const pNextRem = m.u32((pRemOrth + 0x14) >>> 0);
    freeFn?.call(m, pRemOrth);
    pRemOrth = pNextRem;
  }

  const pLevel = m.u32((roomEx + 0x58) >>> 0);
  const pFirst = m.u32((pLevel + 0x10) >>> 0);
  if (pFirst === roomEx) {
    m.setU32((pLevel + 0x10) >>> 0, m.u32((roomEx + 0x24) >>> 0));
    m.setU32((pLevel + 0x08) >>> 0, ((m.u32((pLevel + 0x08) >>> 0) | 0) - 1) >>> 0);
  } else {
    let pPrevRoom = pFirst;
    while (pPrevRoom !== 0) {
      const pNextRoom = m.u32((pPrevRoom + 0x24) >>> 0);
      if (pNextRoom === 0) {
        break;
      }
      if (pNextRoom === roomEx) {
        m.setU32((pPrevRoom + 0x24) >>> 0, m.u32((roomEx + 0x24) >>> 0));
        m.setU32((pLevel + 0x08) >>> 0, ((m.u32((pLevel + 0x08) >>> 0) | 0) - 1) >>> 0);
        break;
      }
      pPrevRoom = pNextRoom;
    }
  }

  DRLGROOMTILE_FreeRoomTileGridAndAnimList113c(m, roomEx);
  DRLGLOGIC_FreeRoomLogicalInfo113c(m, roomEx);
  freeFn?.call(m, roomEx);
}

/**
 * `@va D2Common:0x6FD676F0` (`DRLGOUTPLACE_ApplyOutdoorVerticesToGrids113c`, not exported;
 * `__stdcall(pLevel) -> void`, `ret 4`).
 */
export function DRLGOUTPLACE_ApplyOutdoorVerticesToGrids113c(
  m: Memory113c,
  pLevel: number,
): void {
  const lvl = pLevel >>> 0;
  const pOutdoors = m.u32((lvl + 0x14) >>> 0);
  const pHead = m.u32((pOutdoors + 0x64) >>> 0);
  let pVertex = pHead;
  do {
    const pNext = m.u32((pVertex + 0x10) >>> 0);
    if ((m.u8((pVertex + 0x0c) >>> 0) & 0x01) !== 0) {
      const visFlags = DRLGOUTDOORS_ComputeVertexLevelLinkVisBit113c(m, pVertex, lvl);
      const wallFlags = m.u8((pVertex + 0x08) >>> 0) !== 0 ? 3 : 1;
      ENVIRONMENT_Alloc113c(m, (pOutdoors + 0x18) >>> 0, pVertex, visFlags, 0, 1);
      ENVIRONMENT_Alloc113c(m, (pOutdoors + 0x2c) >>> 0, pVertex, wallFlags, 0, 1);
    }
    pVertex = pNext;
  } while (pVertex !== pHead);
}

/**
 * `@va D2Common:0x6FD605C0` (`DRLGMAZE_SpawnAdjacentSpecialPresetRoom113c`, not exported;
 * custom LTCG `eax = pLevel`, `[esp+4] = nDir`, `[esp+8] = nLvlPrestId`, `[esp+0xC] = nPickedFile`, `ret 0xC`).
 */
export function DRLGMAZE_SpawnAdjacentSpecialPresetRoom113c(
  m: Memory113c,
  pLevel: number,
  nDir: number,
  nLvlPrestId: number,
  nPickedFile: number,
): number {
  const lvl = pLevel >>> 0;
  let pBaseRoomEx = m.u32((lvl + 0x10) >>> 0);
  while (pBaseRoomEx !== 0) {
    const pBasePreset = m.u32((pBaseRoomEx + 0x20) >>> 0);
    if ((m.u32((pBasePreset + 0x0c) >>> 0) & 0x02) === 0) {
      const pNewRoomEx = DRLGROOM_AllocRoomEx113c(m, m.u32((pBaseRoomEx + 0x58) >>> 0), 2);
      const pLevelNew = m.u32((pNewRoomEx + 0x58) >>> 0);
      const pMazeInfo = m.u32((pLevelNew + 0x14) >>> 0);
      m.setU32((pNewRoomEx + 0x3c) >>> 0, m.u32((pMazeInfo + 0x10) >>> 0));
      m.setU32((pNewRoomEx + 0x40) >>> 0, m.u32((pMazeInfo + 0x14) >>> 0));
      if (DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c(m, nDir, pBaseRoomEx, pNewRoomEx) === 0) {
        DRLGROOM_FreeRoomEx113c(m, pNewRoomEx);
      } else {
        DRLGROOM_AddOrthRoomData113c(m, pNewRoomEx, pBaseRoomEx, nDir);
        DRLGROOM_AddOrthRoomData113c(m, pBaseRoomEx, pNewRoomEx, ((nDir | 0) - 2) & 3);
        const pLevelBase = m.u32((pBaseRoomEx + 0x58) >>> 0);
        m.setU32((pNewRoomEx + 0x24) >>> 0, m.u32((pLevelBase + 0x10) >>> 0));
        m.setU32((pLevelBase + 0x10) >>> 0, pNewRoomEx);
        m.setU32((pLevelBase + 0x08) >>> 0, (m.u32((pLevelBase + 0x08) >>> 0) + 1) >>> 0);
        DRLGMAZE_AssignMazeRoomPrestId113c(m, pBaseRoomEx, 1);
        const pNewPreset = m.u32((pNewRoomEx + 0x20) >>> 0);
        m.setU32((pNewPreset + 0x04) >>> 0, nPickedFile >>> 0);
        m.setU32(pNewPreset, nLvlPrestId >>> 0);
        m.setU32((pNewPreset + 0x0c) >>> 0, (m.u32((pNewPreset + 0x0c) >>> 0) | 0x02) >>> 0);
        return pNewRoomEx >>> 0;
      }
    }
    pBaseRoomEx = m.u32((pBaseRoomEx + 0x24) >>> 0);
  }
  return 0;
}

/**
 * `@va D2Common:0x6FD60160` (`DRLGMAZE_ExpandRoomsToTargetCount113c`, not exported;
 * `__stdcall(pLevel) -> void`, `ret 4`).
 */
export function DRLGMAZE_ExpandRoomsToTargetCount113c(
  m: Memory113c,
  pLevel: number,
): void {
  const level = pLevel >>> 0;
  const pDrlg0 = m.u32((level + 0x1b4) >>> 0);
  const nDiff = m.u8((pDrlg0 + 0x450) >>> 0);
  const pMazeInfo0 = m.u32((level + 0x14) >>> 0);
  let nTarget = m.u32((pMazeInfo0 + 0x04 + nDiff * 4) >>> 0) | 0;
  const nLevelId = m.u32((level + 0x1d0) >>> 0) | 0;
  if (nLevelId === (m.u32((pDrlg0 + 0x94) >>> 0) | 0)) {
    nTarget = imul32(nTarget, 3);
  }
  const pDrlg1 = m.u32((level + 0x1b4) >>> 0);
  if (nLevelId === (m.u32((pDrlg1 + 0x484) >>> 0) | 0)) {
    nTarget = (nTarget + nTarget) | 0;
  }

  while ((m.u32((level + 0x08) >>> 0) | 0) < nTarget) {
    const nRooms = m.u32((level + 0x08) >>> 0) | 0;
    let idx = 0;
    if (nRooms > 0) {
      const lo = BigInt(m.u32((level + 0x1c4) >>> 0));
      const hi = BigInt(m.u32((level + 0x1c8) >>> 0));
      const next = lo * 0x6ac690c5n + hi;
      const newLo = Number(next & 0xffffffffn) >>> 0;
      const newHi = Number((next >> 32n) & 0xffffffffn) >>> 0;
      m.setU32((level + 0x1c4) >>> 0, newLo);
      m.setU32((level + 0x1c8) >>> 0, newHi);
      idx = (newLo % (nRooms >>> 0)) >>> 0;
    }

    let pRoomEx = m.u32((level + 0x10) >>> 0);
    for (let k = 0; k < idx; k++) {
      pRoomEx = m.u32((pRoomEx + 0x24) >>> 0);
    }

    const rLo = BigInt(m.u32((pRoomEx + 0x14) >>> 0));
    const rHi = BigInt(m.u32((pRoomEx + 0x18) >>> 0));
    const rNext = rLo * 0x6ac690c5n + rHi;
    const rNewLo = Number(rNext & 0xffffffffn) >>> 0;
    const rNewHi = Number((rNext >> 32n) & 0xffffffffn) >>> 0;
    m.setU32((pRoomEx + 0x14) >>> 0, rNewLo);
    m.setU32((pRoomEx + 0x18) >>> 0, rNewHi);
    const dir = rNewLo & 3;

    const pPreset = m.u32((pRoomEx + 0x20) >>> 0);
    if ((m.u32((pPreset + 0x0c) >>> 0) & 0x02) === 0) {
      const pNew = DRLGROOM_AllocRoomEx113c(m, m.u32((pRoomEx + 0x58) >>> 0), 2) >>> 0;
      const pNewLvl = m.u32((pNew + 0x58) >>> 0);
      const pMaze = m.u32((pNewLvl + 0x14) >>> 0);
      m.setU32((pNew + 0x3c) >>> 0, m.u32((pMaze + 0x10) >>> 0));
      m.setU32((pNew + 0x40) >>> 0, m.u32((pMaze + 0x14) >>> 0));
      if (DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c(m, dir, pRoomEx, pNew) === 0) {
        DRLGROOM_FreeRoomEx113c(m, pNew);
      } else {
        DRLGROOM_AddOrthRoomData113c(m, pNew, pRoomEx, dir);
        DRLGROOM_AddOrthRoomData113c(m, pRoomEx, pNew, (dir - 2) & 3);
        DRLGMAZE_LinkTouchingMazeRooms113c(m, pNew);
        const pRoomLvl = m.u32((pRoomEx + 0x58) >>> 0);
        m.setU32((pNew + 0x24) >>> 0, m.u32((pRoomLvl + 0x10) >>> 0));
        m.setU32((pRoomLvl + 0x10) >>> 0, pNew);
        m.setU32((pRoomLvl + 0x08) >>> 0, (m.u32((pRoomLvl + 0x08) >>> 0) + 1) >>> 0);
        DRLGMAZE_AssignMazeRoomPrestId113c(m, pRoomEx, 1);
        DRLGMAZE_AssignMazeRoomPrestId113c(m, pNew, 1);
      }
    }
  }
}

function findExpandableRoomInDir113c(
  m: Memory113c,
  pLevel: number,
  dir: number,
  coordOff: number,
  pickGreater: boolean,
): number {
  const level = pLevel >>> 0;
  let pRoomEx = m.u32((level + 0x10) >>> 0);
  let best = 0;

  while (pRoomEx !== 0) {
    let skip = false;
    if (best !== 0) {
      const curVal = m.u32((pRoomEx + coordOff) >>> 0) | 0;
      const bestVal = m.u32((best + coordOff) >>> 0) | 0;
      if (pickGreater ? curVal <= bestVal : curVal >= bestVal) {
        skip = true;
      }
    }

    if (!skip) {
      const pPreset = m.u32((pRoomEx + 0x20) >>> 0);
      if ((m.u32((pPreset + 0x0c) >>> 0) & 0x02) !== 0) {
        skip = true;
      }
    }

    if (!skip) {
      let pOrth = m.u32(pRoomEx);
      while (pOrth !== 0) {
        if (m.u32((pOrth + 0x04) >>> 0) === (dir >>> 0)) {
          skip = true;
          break;
        }
        pOrth = m.u32((pOrth + 0x14) >>> 0);
      }
    }

    if (!skip) {
      const pNew = DRLGROOM_AllocRoomEx113c(m, m.u32((pRoomEx + 0x58) >>> 0), 2) >>> 0;
      const pNewLvl = m.u32((pNew + 0x58) >>> 0);
      const pMaze = m.u32((pNewLvl + 0x14) >>> 0);
      m.setU32((pNew + 0x3c) >>> 0, m.u32((pMaze + 0x10) >>> 0));
      m.setU32((pNew + 0x40) >>> 0, m.u32((pMaze + 0x14) >>> 0));
      let pTrial = 0;
      if (DRLGMAZE_PositionAdjacentRoomAndCheckSeparation113c(m, dir, pRoomEx, pNew) === 0) {
        DRLGROOM_FreeRoomEx113c(m, pNew);
      } else {
        pTrial = pNew;
        DRLGROOM_AddOrthRoomData113c(m, pNew, pRoomEx, dir);
        DRLGROOM_AddOrthRoomData113c(m, pRoomEx, pNew, (dir - 2) & 3);
        const pRoomLvl = m.u32((pRoomEx + 0x58) >>> 0);
        m.setU32((pNew + 0x24) >>> 0, m.u32((pRoomLvl + 0x10) >>> 0));
        m.setU32((pRoomLvl + 0x10) >>> 0, pNew);
        m.setU32((pRoomLvl + 0x08) >>> 0, (m.u32((pRoomLvl + 0x08) >>> 0) + 1) >>> 0);
        DRLGMAZE_AssignMazeRoomPrestId113c(m, pNew, 1);
      }
      if (pTrial !== 0) {
        DRLGROOM_FreeRoomEx113c(m, pTrial);
        best = pRoomEx;
      }
    }

    pRoomEx = m.u32((pRoomEx + 0x24) >>> 0);
  }

  return best >>> 0;
}

/**
 * `@va D2Common:0x6FD60730` (`DRLGMAZE_FindSouthmostExpandableRoom113c`, not exported;
 * custom LTCG `ecx = pLevel`, `ret -> pRoomEx`).
 */
export function DRLGMAZE_FindSouthmostExpandableRoom113c(
  m: Memory113c,
  pLevel: number,
): number {
  return findExpandableRoomInDir113c(m, pLevel, 3, 0x38, true);
}

/**
 * `@va D2Common:0x6FD60820` (`DRLGMAZE_FindEastmostExpandableRoom113c`, not exported;
 * custom LTCG `ecx = pLevel`, `ret -> pRoomEx`).
 */
export function DRLGMAZE_FindEastmostExpandableRoom113c(
  m: Memory113c,
  pLevel: number,
): number {
  return findExpandableRoomInDir113c(m, pLevel, 2, 0x34, true);
}

/**
 * `@va D2Common:0x6FD60910` (`DRLGMAZE_FindWestmostExpandableRoom113c`, not exported;
 * custom LTCG `ecx = pLevel`, `ret -> pRoomEx`).
 */
export function DRLGMAZE_FindWestmostExpandableRoom113c(
  m: Memory113c,
  pLevel: number,
): number {
  return findExpandableRoomInDir113c(m, pLevel, 0, 0x34, false);
}

/**
 * `@va D2Common:0x6FD60A00` (`DRLGMAZE_FindNorthmostExpandableRoom113c`, not exported;
 * custom LTCG `eax = pLevel`, `ret -> pRoomEx`).
 */
export function DRLGMAZE_FindNorthmostExpandableRoom113c(
  m: Memory113c,
  pLevel: number,
): number {
  return findExpandableRoomInDir113c(m, pLevel, 1, 0x38, false);
}

/**
 * `@va D2Common:0x6FD9A5C0` (`DRLGPRESET_CreatePresetRoomEx113c`, not exported;
 * custom LTCG `eax = dwFlags`, `ecx = pLevel`, `[esp+4..0x1C] = (nTileX, nTileY, nTileW, nTileH, nLvlPrestId, nPickedFile, dwDT1Mask)`, `ret 0x1C -> pRoomEx`).
 */
export function DRLGPRESET_CreatePresetRoomEx113c(
  m: Memory113c,
  dwFlags: number,
  pLevel: number,
  nTileX: number,
  nTileY: number,
  nTileW: number,
  nTileH: number,
  nLvlPrestId: number,
  nPickedFile: number,
  dwDT1Mask: number,
): number {
  const level = pLevel >>> 0;
  const pRoomEx = DRLGROOM_AllocRoomEx113c(m, level, 1) >>> 0;
  m.setU32((pRoomEx + 0x34) >>> 0, nTileX >>> 0);
  m.setU32((pRoomEx + 0x38) >>> 0, nTileY >>> 0);
  m.setU32((pRoomEx + 0x3c) >>> 0, nTileW >>> 0);
  m.setU32((pRoomEx + 0x40) >>> 0, nTileH >>> 0);
  m.setU32((pRoomEx + 0x24) >>> 0, m.u32((level + 0x10) >>> 0));
  m.setU32((level + 0x10) >>> 0, pRoomEx);
  m.setU32((level + 0x08) >>> 0, (m.u32((level + 0x08) >>> 0) + 1) >>> 0);
  m.setU32(
    (pRoomEx + 0x28) >>> 0,
    (m.u32((pRoomEx + 0x28) >>> 0) | ((dwFlags | 0x80000) >>> 0)) >>> 0,
  );
  m.setU32((pRoomEx + 0x50) >>> 0, dwDT1Mask >>> 0);

  const pPreset = m.u32((pRoomEx + 0x20) >>> 0);
  m.setU32((pPreset + 0x54) >>> 0, nLvlPrestId >>> 0);
  m.setU32((pPreset + 0x58) >>> 0, nPickedFile >>> 0);

  const nLevelId = m.u32((level + 0x1d0) >>> 0) | 0;
  let pLevelDef = 0;
  if (nLevelId >= 0) {
    const sgptDataTables = m.u32(SGPT_DATA_TABLES_PTR_VA_6FDE9E1C);
    if (nLevelId < (m.u32((sgptDataTables + 0xc5c) >>> 0) | 0)) {
      pLevelDef = (m.u32(SG_LEVEL_DEF_BIN_PTR_VA_6FDF0B38) + imul32(nLevelId, 0x9c)) >>> 0;
    }
  }
  const nSubType = m.u32((pLevelDef + 0x38) >>> 0) | 0;
  const nSubTheme = m.u32((pLevelDef + 0x3c) >>> 0) | 0;
  m.setU32((pPreset + 0x64) >>> 0, nSubType >>> 0);
  m.setU32((pPreset + 0x68) >>> 0, nSubTheme >>> 0);
  m.setU32(
    (pPreset + 0x6c) >>> 0,
    DRLGTILESUB_RollSubThemeMask113c(m, pRoomEx, nSubType, nSubTheme) >>> 0,
  );
  return pRoomEx;
}

/**
 * `@va D2Common:0x6FD7E1F0` (`DRLG_ActivateRoomEx113c`, not exported;
 * custom LTCG `esi = pRoomEx`, `[esp+4] = pDrlg`, `ret 4`).
 */
export function DRLG_ActivateRoomEx113c(
  m: Memory113c,
  pRoomEx: number,
  pDrlg: number,
): void {
  const roomEx = pRoomEx >>> 0;
  const drlg = pDrlg >>> 0;
  const x = m.u32((roomEx + 0x34) >>> 0) | 0;
  const y = m.u32((roomEx + 0x38) >>> 0) | 0;
  const w = m.u32((roomEx + 0x3c) >>> 0) | 0;
  const h = m.u32((roomEx + 0x40) >>> 0) | 0;

  const pTileGrid = m.u32((roomEx + 0x54) >>> 0);
  const pRoomTiles = (pTileGrid + 0x14) >>> 0;
  if (
    m.u32((pRoomTiles + 0x04) >>> 0) === 0 &&
    m.u32((pRoomTiles + 0x0c) >>> 0) === 0
  ) {
    return;
  }

  const sm = withDrlgRoomStackScratch113c(m);
  const coords = DRLGROOM_STACK_BASE;
  sm.setU32(coords, imul32(x, 5) >>> 0);
  sm.setU32((coords + 0x04) >>> 0, imul32(y, 5) >>> 0);
  sm.setU32((coords + 0x08) >>> 0, imul32(w, 5) >>> 0);
  sm.setU32((coords + 0x0c) >>> 0, imul32(h, 5) >>> 0);
  sm.setU32((coords + 0x10) >>> 0, x >>> 0);
  sm.setU32((coords + 0x14) >>> 0, y >>> 0);
  sm.setU32((coords + 0x18) >>> 0, w >>> 0);
  sm.setU32((coords + 0x1c) >>> 0, h >>> 0);

  let dwFlags = 0;
  if ((sm.u32((roomEx + 0x28) >>> 0) & 0x40000) !== 0) {
    dwFlags = 4;
  } else if ((sm.u8((roomEx + 0x60) >>> 0) & 0x01) !== 0) {
    dwFlags = 1;
  }

  const lo = BigInt(sm.u32((roomEx + 0x14) >>> 0));
  const hi = BigInt(sm.u32((roomEx + 0x18) >>> 0));
  const next = lo * 0x6ac690c5n + hi;
  const newLo = Number(next & 0xffffffffn) >>> 0;
  const newHi = Number((next >> 32n) & 0xffffffffn) >>> 0;
  sm.setU32((roomEx + 0x14) >>> 0, newLo);
  sm.setU32((roomEx + 0x18) >>> 0, newHi);

  const pRoom1 = DUNGEON_AllocActiveRoom113c(
    sm,
    sm.u32((drlg + 0x46c) >>> 0),
    roomEx,
    coords,
    pRoomTiles,
    newLo,
    dwFlags,
  );
  sm.setU32((roomEx + 0x30) >>> 0, pRoom1 >>> 0);
}

