/**
 * Diablo II v1.13c `D2Common.dll` dungeon / active-room leaf functions (`Dungeon.cpp` block, image base `0x6FD50000`).
 *
 * Every function below is a 1:1 port of the cited disassembly (`objdump -d -M intel` on the 1.13c image).
 * None of them calls another function. Register-convention (LTCG) arguments are explicit TS parameters, and
 * the doc comment of each function names the register that carries them. Signedness follows the branch
 * mnemonics: `jl/jg/jle/jge` are signed compares, `ja/jb/jae/jbe` are unsigned.
 *
 * Struct offsets come from `mem/layout.generated.ts` (`docs/oracle/route2-layout.json`). The two `.bss` globals
 * read by `DUNGEON_GetPortalLevelBit` are declared below with their writer/reader instruction VAs, because the
 * layout generator has no notion of globals.
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import { D2ActStrc, D2ActiveRoomStrc, D2DrlgLevelStrc, D2RoomExStrc } from '../mem/layout.generated.ts'

/**
 * `.bss` `int32_t* gpPortalLevelIds` at `0x6FDF1420` (array of level ids whose `LevelDefs.bin` `dwPortal` is set).
 * - Written by the `DATATBLS\LvlTbls.cpp` loader `0x6FDBCB50` at `0x6FDBCBB6` (`mov ds:0x6fdf1420, eax` after the alloc).
 * - Read by `0x6FD8BC46` (`mov eax, ds:0x6fdf1420`).
 */
export const G_PORTAL_LEVEL_IDS_VA_113C = 0x6fdf1420
/**
 * `.bss` `int32_t gnPortalLevelIds` at `0x6FDF1424` (element count of `gpPortalLevelIds`).
 * - Written at `0x6FDBCB86`. Read at `0x6FD8BC40` (`mov edx, ds:0x6fdf1424`). The sibling `0x6FD8BC80` asserts it is `<= 0x20`.
 */
export const G_PORTAL_LEVEL_COUNT_VA_113C = 0x6fdf1424

/** `D2RoomExStrc.dwFlags` bit toggled by `DUNGEON_ToggleHasPortalFlag` (`0x6FD8BC26 and ecx, 0xFFBFFFFF` / `0x6FD8BC32 or ecx, 0x400000`). */
export const DRLGROOMFLAG_HAS_PORTAL_113C = 0x00400000
/** `D2RoomExStrc.dwFlags` bit returned by `DUNGEON_CheckLOSDraw` for type-2 rooms (`0x6FD8BDBC and eax, 0x80000`). */
export const DRLGROOMFLAG_NO_LOS_DRAW_113C = 0x00080000

/**
 * `DRLG_IsTownLevel` index table at `0x6FD7D348` (109 bytes, one per `nLevelId - 1` in `0..0x6C`).
 * Copied byte-for-byte from the 1.13c image; `tests/oracle/k1/laneC-B001.test.ts` re-reads the PE bytes
 * at `0x6FD7D348` and compares them to this constant. Value `0` selects case 0 (town), `1` selects case 1.
 */
export const DRLG_ISTOWN_CASE_INDEX_6FD7D348 = Uint8Array.from(
  [
    0x00, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x00, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00,
  ],
)
/**
 * `DRLG_IsTownLevel` jump table at `0x6FD7D340` = `{0x6FD7D334, 0x6FD7D33A}`:
 * case 0 -> `0x6FD7D334 mov eax, 1; ret`, case 1 -> `0x6FD7D33A xor eax, eax; ret`.
 */
export const DRLG_ISTOWN_CASE_RESULT_6FD7D340: readonly [number, number] = [1, 0]

/**
 * `@va D2Common:0x6FD51330` (`DUNGEON_GetRoomAtPosition`, not exported; LTCG `eax = pRoom`, `ebx = nX`, `edi = nY`, plain `ret`).
 *
 * Returns `pRoom` when the subtile `(nX, nY)` lies inside it, otherwise the first non-NULL entry of
 * `pRoom->ppRoomsNear[0 .. nRoomsNear)` that contains it, otherwise `0`.
 * - `0x6FD51331 test eax, eax; jne` -> NULL room returns `0` (eax unchanged).
 * - `0x6FD51337..0x6FD51355`: `x >= X (jl)`, `x < X + W (jge, 32-bit wrapping add)`, `y >= Y`, `y < Y + H`, all signed.
 * - `0x6FD51357..0x6FD51398`: `ppRoomsNear (+0x00)`, `nRoomsNear (+0x24)`; the loop bound test is unsigned (`jbe`/`jb`).
 *   NULL near entries are skipped (`0x6FD5136D je`). A hit re-reads `ppRoomsNear[i]` (`0x6FD513A0`).
 */
export function DUNGEON_GetRoomAtPosition113c(m: Memory113c, pRoom: number, nX: number, nY: number): number {
  if (pRoom === 0) return 0
  const x = nX | 0
  const y = nY | 0
  const roomX = m.get(pRoom, D2ActiveRoomStrc.nSubtileX) | 0
  if (x >= roomX) {
    if (x < ((m.get(pRoom, D2ActiveRoomStrc.nSubtileWidth) + roomX) | 0)) {
      const roomY = m.get(pRoom, D2ActiveRoomStrc.nSubtileY) | 0
      if (y >= roomY) {
        if (y < ((m.get(pRoom, D2ActiveRoomStrc.nSubtileHeight) + roomY) | 0)) return pRoom >>> 0
      }
    }
  }
  const nRoomsNear = m.get(pRoom, D2ActiveRoomStrc.nRoomsNear) >>> 0
  const ppRoomsNear = m.get(pRoom, D2ActiveRoomStrc.ppRoomsNear)
  for (let i = 0; i < nRoomsNear; i++) {
    const pNear = m.u32((ppRoomsNear + i * 4) >>> 0)
    if (pNear === 0) continue
    if (x < (m.get(pNear, D2ActiveRoomStrc.nSubtileX) | 0)) continue
    const endX = (m.get(pNear, D2ActiveRoomStrc.nSubtileWidth) + m.get(pNear, D2ActiveRoomStrc.nSubtileX)) | 0
    if (x >= endX) continue
    if (y < (m.get(pNear, D2ActiveRoomStrc.nSubtileY) | 0)) continue
    const endY = (m.get(pNear, D2ActiveRoomStrc.nSubtileHeight) + m.get(pNear, D2ActiveRoomStrc.nSubtileY)) | 0
    if (y < endY) return m.u32((ppRoomsNear + i * 4) >>> 0)
  }
  return 0
}

/**
 * `@va D2Common:0x6FD7D320` (`DRLG_IsTownLevel`, not exported; LTCG `eax = nLevelId`, plain `ret`).
 *
 * `0x6FD7D320 dec eax; cmp eax, 0x6C; ja -> return 0` (unsigned, so `nLevelId <= 0` and `> 0x6D` return 0),
 * then `movzx eax, byte [eax + 0x6FD7D348]; jmp [eax*4 + 0x6FD7D340]`.
 * Not to be confused with `DUNGEON_CheckRoomIsTown` (`0x6FD8C390`), which calls this with `pLevel->nLevelId`.
 */
export function DRLG_IsTownLevel113c(nLevelId: number): number {
  const t = (nLevelId - 1) >>> 0
  if (t > 0x6c) return 0
  return DRLG_ISTOWN_CASE_RESULT_6FD7D340[DRLG_ISTOWN_CASE_INDEX_6FD7D348[t]!]!
}

/**
 * `@va D2Common:0x6FD8B6B0` (`D2Common.#10345` `DUNGEON_IncreaseRoomPlayerCount`, stdcall 1 arg, `ret 4`).
 *
 * `0x6FD8B6B4 test eax, eax; je` then `0x6FD8B6B8 inc dword [eax + 0x28]` (`D2ActiveRoomStrc.nPlayers`, wraps).
 */
export function DUNGEON_IncreaseRoomPlayerCount113c(m: Memory113c, pRoom: number): void {
  if (pRoom === 0) return
  m.set(pRoom, D2ActiveRoomStrc.nPlayers, (m.get(pRoom, D2ActiveRoomStrc.nPlayers) + 1) >>> 0)
}

/**
 * `@va D2Common:0x6FD8B710` (`D2Common.#11010` `DUNGEON_FindRoomBySubtileCoordinates`, stdcall `(pAct, nX, nY)`, `ret 0xC`).
 *
 * Walks `pAct->pRoom1 (+0x10)` through `pRoomNext (+0x7C)` and returns the first room whose subtile rectangle
 * contains `(nX, nY)`: `0x6FD8B72F..0x6FD8B74A` signed `jl/jge` with wrapping `X + W` / `Y + H`. NULL act -> `0`.
 */
export function DUNGEON_FindRoomBySubtileCoordinates113c(m: Memory113c, pAct: number, nX: number, nY: number): number {
  if (pAct === 0) return 0
  const x = nX | 0
  const y = nY | 0
  for (let pRoom = m.get(pAct, D2ActStrc.pRoom1); pRoom !== 0; pRoom = m.get(pRoom, D2ActiveRoomStrc.pRoomNext)) {
    const roomX = m.get(pRoom, D2ActiveRoomStrc.nSubtileX) | 0
    if (x < roomX) continue
    if (x >= ((m.get(pRoom, D2ActiveRoomStrc.nSubtileWidth) + roomX) | 0)) continue
    const roomY = m.get(pRoom, D2ActiveRoomStrc.nSubtileY) | 0
    if (y < roomY) continue
    if (y < ((m.get(pRoom, D2ActiveRoomStrc.nSubtileHeight) + roomY) | 0)) return pRoom >>> 0
  }
  return 0
}

/**
 * `D2DrlgRoomTilesStrc` field offsets. The struct is not heap-allocated on its own: it is embedded at `+0x14`
 * of the `0x2C`-byte tile grid (`0x6FD5C977 mov edx, 0x2C` alloc, stored to `D2RoomExStrc +0x54` at `0x6FD5C98A`),
 * and `D2ActiveRoomStrc.pRoomTiles (+0x08)` points at it (`0x6FD7E230 mov ecx, [esi+0x54]; 0x6FD7E23A add ecx, 0x14`,
 * passed to the room allocator which stores it at `0x6FD8C79F mov [ebx+0x8], edx`). Field evidence from the three
 * sibling getters (`ret = +0/+8/+0x10`, `*out = +4/+0xC/+0x14`): walls `0x6FD8BB3A/0x6FD8BB46`, floors
 * `0x6FD8BB5F mov edx, [ecx+0xC]` / `0x6FD8BB6B mov eax, [edx+0x8]`, roofs `0x6FD8BAFA/0x6FD8BB06`.
 */
export const D2DRLG_ROOMTILES_PFLOORTILES_OFF_113C = 0x08
export const D2DRLG_ROOMTILES_NFLOORS_OFF_113C = 0x0c

/**
 * `@va D2Common:0x6FD8BB50` (`D2Common.#10544` `DUNGEON_GetFloorTilesFromRoom`, stdcall `(pRoom, int* pnFloors)`, `ret 8`).
 *
 * - `pRoom != 0 && pRoom->pRoomTiles (+0x08) != 0`: `*pnFloors = tiles->nFloors (+0xC)` (`0x6FD8BB66`), then re-reads
 *   `pRoom->pRoomTiles` (`0x6FD8BB68`) and returns `tiles->pFloorTiles (+0x8)`.
 * - otherwise `*pnFloors = 0` (`0x6FD8BB75`) and returns `0`. `pnFloors` is never NULL-checked.
 */
export function DUNGEON_GetFloorTilesFromRoom113c(m: Memory113c, pRoom: number, pnFloors: number): number {
  if (pRoom !== 0) {
    const pTiles = m.get(pRoom, D2ActiveRoomStrc.pRoomTiles)
    if (pTiles !== 0) {
      m.setU32(pnFloors, m.u32((pTiles + D2DRLG_ROOMTILES_NFLOORS_OFF_113C) >>> 0))
      const pTilesAgain = m.get(pRoom, D2ActiveRoomStrc.pRoomTiles)
      return m.u32((pTilesAgain + D2DRLG_ROOMTILES_PFLOORTILES_OFF_113C) >>> 0)
    }
  }
  m.setU32(pnFloors, 0)
  return 0
}

/**
 * `@va D2Common:0x6FD8BC10` (`D2Common.#10346` `DUNGEON_ToggleHasPortalFlag`, stdcall `(pRoom, bReset)`, `ret 8`).
 *
 * NULL room -> no-op. Otherwise `pRoomEx = pRoom->pRoomEx (+0x10)`; a **nonzero** `bReset` clears bit `0x400000` of
 * `pRoomEx->dwFlags (+0x28)` (`0x6FD8BC26`), zero sets it (`0x6FD8BC32`). `pRoomEx` is not NULL-checked.
 */
export function DUNGEON_ToggleHasPortalFlag113c(m: Memory113c, pRoom: number, bReset: number): void {
  if (pRoom === 0) return
  const pRoomEx = m.get(pRoom, D2ActiveRoomStrc.pRoomEx)
  const flags = m.get(pRoomEx, D2RoomExStrc.dwFlags)
  if (bReset !== 0) m.set(pRoomEx, D2RoomExStrc.dwFlags, (flags & ~DRLGROOMFLAG_HAS_PORTAL_113C) >>> 0)
  else m.set(pRoomEx, D2RoomExStrc.dwFlags, (flags | DRLGROOMFLAG_HAS_PORTAL_113C) >>> 0)
}

/**
 * `@va D2Common:0x6FD8BC40` (`D2Common.#10805` `DUNGEON_GetPortalLevelBit`, stdcall `(nLevelId)`, `ret 4`).
 *
 * `n = *(int*)0x6FDF1424; a = *(int**)0x6FDF1420` (both read up front, `0x6FD8BC40/0x6FD8BC46`); for `i` in `0 .. n)`
 * (signed `jle`/`jl`): if `a[i] == nLevelId` return `1 << (i & 31)` (`0x6FD8BC68 mov eax, 1; shl eax, cl`); else `0`.
 */
export function DUNGEON_GetPortalLevelBit113c(m: Memory113c, nLevelId: number): number {
  const n = m.u32(G_PORTAL_LEVEL_COUNT_VA_113C) | 0
  const pIds = m.u32(G_PORTAL_LEVEL_IDS_VA_113C)
  for (let i = 0; i < n; i++) {
    if ((nLevelId | 0) === (m.u32((pIds + i * 4) >>> 0) | 0)) return (1 << (i & 31)) >>> 0
  }
  return 0
}

/**
 * `@va D2Common:0x6FD8BDA0` (`D2Common.#10685` `DUNGEON_CheckLOSDraw`, stdcall `(pRoom)`, `ret 4`).
 *
 * NULL -> `0`. `pRoomEx = pRoom->pRoomEx (+0x10)`; switch on `pRoomEx->nType (+0x48)` (`dec eax; je / dec eax; je`):
 * type 1 -> `1` (`0x6FD8BDC4`), type 2 -> `pRoomEx->dwFlags & 0x80000` (`0x6FD8BDB9`, the raw masked bit, not 1),
 * any other type -> `0`.
 */
export function DUNGEON_CheckLOSDraw113c(m: Memory113c, pRoom: number): number {
  if (pRoom === 0) return 0
  const pRoomEx = m.get(pRoom, D2ActiveRoomStrc.pRoomEx)
  const nType = m.get(pRoomEx, D2RoomExStrc.nType) | 0
  if (nType === 1) return 1
  if (nType === 2) return (m.get(pRoomEx, D2RoomExStrc.dwFlags) & DRLGROOMFLAG_NO_LOS_DRAW_113C) >>> 0
  return 0
}

/**
 * `@va D2Common:0x6FD8C000` (`D2Common.#10826` `DUNGEON_GetLevelIdFromRoom`, stdcall `(pRoom)`, `ret 4`).
 *
 * NULL -> `0`; otherwise `pRoom->pRoomEx (+0x10)->pLevel (+0x58)->nLevelId (+0x1D0)` with no further NULL checks
 * (`0x6FD8C00B / 0x6FD8C00E / 0x6FD8C011`).
 */
export function DUNGEON_GetLevelIdFromRoom113c(m: Memory113c, pRoom: number): number {
  if (pRoom === 0) return 0
  const pRoomEx = m.get(pRoom, D2ActiveRoomStrc.pRoomEx)
  const pLevel = m.get(pRoomEx, D2RoomExStrc.pLevel)
  return m.get(pLevel, D2DrlgLevelStrc.nLevelId) | 0
}
