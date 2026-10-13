# `tools/d2moo-oracle` — D2MOO 原生 C++ DRLG 差分基准 / Native D2MOO C++ DRLG Reference Oracle

**[简体中文](#简体中文) | [English](#english)**

---

<a id="简体中文"></a>

## 简体中文

本目录包含基于 [D2MOO](https://github.com/ThePhrozenKeep/D2MOO) 的 `D2Common` 关卡生成器（DRLG）原生 32 位 C++ 构建驱动。它是本仓库 TypeScript 版 Act I 野外关卡生成器（[`src/common/drlg/`](../../src/common/drlg)）逐阶段、逐次 RNG 调用进行位级差分比对（Bit-Exact Diff）的黄金基准（Oracle）。

D2MOO 源码**不**直接内置于本仓库中。构建脚本默认从环境变量 `D2MOO_SRC`（默认路径 `~/tmp/D2MOO`）读取源码，固定对应提交 `5596f5cb6c5251a0a07c6637d26458b06099d516`（MIT 协议）。本目录仅存放驱动入口、运行时桩代码（Shims）与构建脚本。

### 1. 构建与运行

```sh
# 1. 提取游戏数据：编译后的二进制表、LvlPrest/LvlSub 的全部 DS1，以及 DRLG 加载的全部 DT1
npx tsx src/baker/extract/extract-d2moo-tables.ts samples/d2 tools/d2moo-oracle/data

# 2. 编译 32 位原生二进制（需要支持 -m32 的 g++ / gcc-multilib）
./tools/d2moo-oracle/build.sh                 # 或指定输出目录：OUT=/some/dir ./tools/d2moo-oracle/build.sh

# 3. 运行生成器并导出 JSON 与 RNG 轨迹
./tools/d2moo-oracle/build/d2moo-oracle --data tools/d2moo-oracle/data \
  --seed 0x12345678 --levels 2,3,4,5,6,7,17,39 \
  [--difficulty 0] [--isolated] [--trace out.trace] --out out.json
```

- `--seed` 是 D2 **游戏种子**（`DRLG_AllocDrlg` 的 `nInitSeed`）。整幕地图（包括 `DRLGOUTPLACE_CreateLevelConnections` 的关卡拓扑连接）均由此种子派生。
- `--levels` 必须为 Act I 野外关卡 ID（`DrlgType 3`：鲜血荒地 `2`、冰冷之原 `3`、乱石旷野 `4`、黑暗森林 `5`、黑色荒地 `6`、泰摩高地 `7`、埋骨之地 `17`、秘密奶牛关 `39`）。
- `--isolated` 为每个关卡单独分配全新的 Act 结构。其输出必须与顺序执行完全一致，从而证明单个关卡的生成不依赖其他关卡的中间副作用。
- `build.sh` 在临时目录中编译，并通过先 `cp` 到 `d2moo-oracle.tmp` 再原子 `mv` 覆盖 `$OUT/d2moo-oracle`（默认 `tools/d2moo-oracle/build`）的方式安装二进制文件，防止并发运行的 Oracle 读到写了一半的可执行文件。
- `build/` 与 `data/` 均已加入 `.gitignore`。

该二进制强制使用 32 位（`-m32`）编译，以确保每个 D2MOO 结构体与原版 1.13c 编译后的 `.bin` 数据表字节布局完全一致。`LoadBinTable` 会对每张表严格校验 `count * sizeof(record) == body`。

### 2. 原生执行的流水线范围

本驱动直接运行 D2MOO 原生代码完成以下阶段：

- `DRLG_AllocDrlg`：种子链初始化、`DRLGOUTPLACE_CreateLevelConnections` 与城镇初始化。
- `DRLG_InitLevel`，随后执行 `DRLGOUTDOORS_GenerateLevel` 与 `DRLGOUTWILD_InitAct1OutdoorLevel`。
- 房间（RoomEx）创建。
- 房间激活，完整镜像 `DRLGACTIVATE_InitializeRoomEx` (`DrlgActivate.cpp:317-331`) 与 `DRLGACTIVATE_RoomEx_EnsureHasRoom` (`95-115`) 直至 `DRLGROOMTILE_AddRoomMapTiles`：
  1. `DRLGROOMTILE_LoadDT1FilesForRoom`
  2. `DRLGPRESET_SpawnHardcodedPresetUnits`（仅限预设房间）
  3. `sub_6FD77BB0`
  4. `DRLGROOMTILE_InitRoomGrids`（从 `dwInitSeed` 重新初始化房间种子）
  5. `DRLGROOMTILE_AddRoomMapTiles`：生成房间的瓦片数据（`DRLGROOMTILE_GetTileCache` 的变体选择会推进房间种子）、与相邻房间的接缝合并（`DRLGROOMTILE_GetCreateLinkedTileData` / `DRLGROOMTILE_LinkedTileDataManager`）、传送点（`DRLGROOMTILE_AddWarp`），随后执行 `DRLGOUTROOM_InitializeDrlgOutdoorRoom` 或 `DRLGPRESET_AddPresetRoomMapTiles`（构建 `DRLGLOGIC_*` 坐标列表）。

  注：由 `D2Game` 构建的 `DRLG_CreateRoomForRoomEx`（`D2ActiveRoomStrc`）不在本 Oracle 范围内。

外部依赖由 `src/stubs.cpp` 提供，其策略为：凡是生成器真正需要的功能均使用真实数据完整实现，其余一切未用接口**快速失败（Fail-Fast，退出码 2）**。

#### 真实实现的部分：
- **数据表加载**：严格按 `DATATBLS_LoadAllTxts` 的相对顺序加载。怪物表最先加载，因为 `LvlSub` DS1 加载器需要通过 `MonPreset` 转换预设怪物单位。
- **DS1 归档读取**。
- `DUNGEON_GameTileToSubtileCoords` 与 `DUNGEON_GameTileToClientCoords`。
- `sub_6FDAB750` 与 `sub_6FDAB610`（位于 `src/path_misc.cpp`，移植自 D2MOO `PathMisc.cpp`）。
- **D2CMP 瓦片库**：从真实 DT1 文件解析。这是必需的：当且仅当匹配瓦片的稀有度总和（rarity sum）`> 0` 时，`DRLGROOMTILE_GetTileCache` 会推进房间 RNG 种子。该调用发生在 `LvlSub` 盖章阶段内部（`sub_6FD8ACE0` $\rightarrow$ `DRLGROOMTILE_InitTileShadow`），因此瓦片数据会直接推进替换（Substitution）RNG 流。
  - 对于 Act I，所有阴影查找返回的稀有度均为 0，因此不会额外摇号，在轨迹中体现为 `T 13 … 1 0`。
  - 返回瓦片的顺序（先按槽位顺序，再按 DT1 文件顺序）决定了 `DRLGROOMTILE_GetTileCache` 选中的具体瓦片变体（`pTile`）；TypeScript 端适配层（[`src/common/drlg/drlg-d2cmp.ts`](../../src/common/drlg/drlg-d2cmp.ts)）采用完全相同的顺序。
- `FOG_AllocPool` / `FOG_ReallocPool` 映射为 `calloc` / `realloc`，并对扩容部分零填充，确保 `DRLGROOMTILE_ReallocRoofTileGrid` 追加的条目完全确定。

#### 建模决策（明确记录而非猜测）：
- 房间按 `pFirstRoomEx` 链表顺序激活。跨多个房间的预设地图使用第一个激活房间的种子加载其 DS1。
- 激活顺序同时决定了房间接缝合并（Seam Merge）：后激活的房间会修改先激活相邻房间的边缘瓦片（包括跨关卡接缝）并推进其种子。
- 激活房间会初始化其传送点（Warp）背后的目标关卡（`sub_6FD77BB0` $\rightarrow$ `DRLG_InitLevel`）。因此顺序模式下会先生成所有请求的关卡，再统一激活房间，使每个关卡的 RNG 轨迹保持在各自上下文中。

### 3. 输出格式（Schema 3）

```text
{schema: 3, oracle: {d2moo, arch: "i386"}, gameSeed, difficulty, isolated,
 drlg: {startSeed, seed: [low, high]},
 act: [{id, drlgType, levelType, coord: [x, y, w, h], flags, seed,
        outdoor?: {flags, roomData: [orth]}, preset?: {direction, map}}],   // 按 id 排序
 levels: [{id,
   levelGrid: {flags, coord, grids: [grid x4], ring: [vertex], nVertices,
               vertices: [vertex x24], pathStarts: [null | [[x, y, dir, flags]...] x6],
               roomData: [orth], seed},                 // InitAct1OutdoorLevel 之后、创建房间之前
   nRooms, rooms: [{type, coord, flags, otherFlags, dt1Mask, initSeed, seed,
                    outdoor?: {flags, flagsEx, subType, subTheme, subThemePicked},
                    preset?: {prest, picked, flags, map}}],                  // 按创建顺序
   maps: [{prest, picked, coord, file, hasInfo, units}],
   levelSeedAfterRooms, warp: {n, xy},
   activation: [{seed, tile, wall, floor, dirt, units, seedAfterTiles, mapTiles} |       // 野外房间
                {seed, walls: [grid], tiles: [grid], floors: [grid], shadow, units,      // 预设房间
                 seedAfterTiles, mapTiles}]}]}

mapTiles: {nWalls, nFloors, nShadows,                   // pTileGrid 计数
           pTiles: {nWalls, nFloors, nRoofs},           // pTileGrid->pTiles 计数
           walls: [tile], floors: [tile], roofs: [tile],// pTiles 数组
           links: [[bFloor, tileRef]],                  // pTileGrid->pMapLinks 链
           warps: [[[levelId, room] | null, lvlWarpRow, bEnabled, tileRef, tileRef]],  // pRoomTiles 链
           units,                                       // pPresetUnits (含 AddWarp 的 UNIT_TILE)
           logical: null | {flags, nLists, indexX: grid, indexY: grid, lists: [coordList]}}
tile:      [nWidth, nHeight, nPosX, nPosY, unk0x10, dwFlags, pTile, nTileType, unk0x20, unk0x24,
            nRed, nGreen, nBlue, nIntensity, unk0x2C]  // D2DrlgTileDataStrc 全部字段
```

### 4. RNG 轨迹格式（`--trace`）

轨迹每行记录一个事件，TypeScript 移植版输出完全相同的格式：

```text
I <label> <low>                    SEED_InitLowSeed (高位种子固定为 666)
S <label> <low> <high>             SEED_SetSeeds
R <label> 0 <low>:<high>           SEED_RollRandomNumber，摇号后的 64 位状态 (十六进制)
L <label> <max> <result>           SEED_RollLimitedRandomNumber (max <= 0 时不摇号)
P <label> 100 <result>             SEED_RollPercentage
T <type> <style> <seq> <n> <sum>   D2CMP_10088_GetTiles 查找：匹配瓦片数 n，稀有度总和 sum
# <context>                        驱动上下文 (drlg, L<id>, L<id>/a<room>)
```

---
---

<a id="english"></a>

## English

Native 32-bit C++ build of [D2MOO](https://github.com/ThePhrozenKeep/D2MOO)'s `D2Common` level generator (DRLG). It serves as the ground-truth reference oracle that the TypeScript Act I outdoor port ([`src/common/drlg/`](../../src/common/drlg)) is diffed against, stage by stage and RNG call by RNG call.

D2MOO's source is **not** vendored in this repository. The build script reads it from `D2MOO_SRC` (default `~/tmp/D2MOO`), pinned to commit `5596f5cb6c5251a0a07c6637d26458b06099d516` (MIT license). Only this driver, the runtime shims, and the build script live in this repository.

### 1. Build and Run

```sh
# 1. Extract game data: compiled tables, every DS1 of LvlPrest/LvlSub, and every DT1 loaded by DRLG.
npx tsx src/baker/extract/extract-d2moo-tables.ts samples/d2 tools/d2moo-oracle/data

# 2. 32-bit build (requires g++ with -m32 / gcc-multilib).
./tools/d2moo-oracle/build.sh                 # or: OUT=/some/dir ./tools/d2moo-oracle/build.sh

# 3. Generate level dumps and optional RNG traces.
./tools/d2moo-oracle/build/d2moo-oracle --data tools/d2moo-oracle/data \
  --seed 0x12345678 --levels 2,3,4,5,6,7,17,39 \
  [--difficulty 0] [--isolated] [--trace out.trace] --out out.json
```

- `--seed` is the D2 **game** seed (`DRLG_AllocDrlg` `nInitSeed`). The whole act, including the level layout of `DRLGOUTPLACE_CreateLevelConnections`, derives from it.
- `--levels` must be Act I outdoor levels (`DrlgType 3`).
- `--isolated` allocates a fresh act for every level. The output must equal the sequential run, which proves that a level's generation does not depend on other levels.
- `build.sh` compiles in a temporary directory and installs the binary into `$OUT` (default `tools/d2moo-oracle/build`) with `cp` to `d2moo-oracle.tmp` followed by an atomic `mv` over `d2moo-oracle`, so a concurrently running oracle is never replaced by a half-written file.
- Both `build/` and `data/` are git-ignored.

The binary is 32-bit so that every D2MOO struct has the exact byte layout of the compiled 1.13c `.bin` tables. `LoadBinTable` checks `count * sizeof(record) == body` for every table.

### 2. What Runs Natively

The driver runs D2MOO's own code for:

- `DRLG_AllocDrlg`: the seed chain, `DRLGOUTPLACE_CreateLevelConnections`, and the town.
- `DRLG_InitLevel`, then `DRLGOUTDOORS_GenerateLevel` and `DRLGOUTWILD_InitAct1OutdoorLevel`.
- Room creation.
- Room activation, mirroring `DRLGACTIVATE_InitializeRoomEx` (`DrlgActivate.cpp:317-331`) and `DRLGACTIVATE_RoomEx_EnsureHasRoom` (`95-115`) up to `DRLGROOMTILE_AddRoomMapTiles`:
  1. `DRLGROOMTILE_LoadDT1FilesForRoom`
  2. `DRLGPRESET_SpawnHardcodedPresetUnits` (preset rooms only)
  3. `sub_6FD77BB0`
  4. `DRLGROOMTILE_InitRoomGrids`, which re-seeds the room from `dwInitSeed`.
  5. `DRLGROOMTILE_AddRoomMapTiles`: the tile data of the room (the variant picks of `DRLGROOMTILE_GetTileCache` roll the room seed), the room-seam merge with neighboring rooms (`DRLGROOMTILE_GetCreateLinkedTileData` / `DRLGROOMTILE_LinkedTileDataManager`), the warps (`DRLGROOMTILE_AddWarp`), then `DRLGOUTROOM_InitializeDrlgOutdoorRoom` or `DRLGPRESET_AddPresetRoomMapTiles` (both build the `DRLGLOGIC_*` coord lists).

  `DRLG_CreateRoomForRoomEx` (the `D2ActiveRoomStrc`, built by `D2Game`) is not run.

The outside world is provided by `src/stubs.cpp`. Its policy: anything the generator genuinely needs is implemented with real data, and everything else **fails fast** (exit code 2).

#### Real Implementations:
- **Data tables**: loaded in the same relative order as `DATATBLS_LoadAllTxts`. The monster tables come first because the `LvlSub` DS1 loader translates monster preset units through `MonPreset`.
- **DS1 archive reads**.
- `DUNGEON_GameTileToSubtileCoords` and `DUNGEON_GameTileToClientCoords`.
- `sub_6FDAB750` and `sub_6FDAB610` (`src/path_misc.cpp`, copied from D2MOO `PathMisc.cpp`).
- **D2CMP tile libraries**, parsed from the real DT1 files. This is not optional: `DRLGROOMTILE_GetTileCache` rolls the room seed iff the rarity sum of the matching tiles is `> 0`. It runs inside `LvlSub` stamping (`sub_6FD8ACE0` $\rightarrow$ `DRLGROOMTILE_InitTileShadow`), so the tile data advances the substitution RNG stream.
  - For Act I every shadow lookup returns rarity 0, so there is no roll. This is visible in the trace as `T 13 … 1 0`.
  - The order of the returned tiles (slot order, then DT1 file order) decides which tile variant `DRLGROOMTILE_GetTileCache` picks, which `mapTiles` dumps (`pTile`); the TypeScript shim ([`src/common/drlg/drlg-d2cmp.ts`](../../src/common/drlg/drlg-d2cmp.ts)) uses the exact same order.
- `FOG_AllocPool` / `FOG_ReallocPool` are `calloc` / `realloc`. `FOG_ReallocPool` zero-fills the grown part of the block, so the entries that `DRLGROOMTILE_ReallocRoofTileGrid` appends are deterministic.

#### Modelling Decisions (Documented, Not Guessed):
- Rooms are activated in `pFirstRoomEx` order. A preset map that spans several rooms loads its DS1 with the seed of the first activated room.
- The activation order also decides the room-seam merge: the room activated later edits the tiles of the neighboring rooms activated before it (including across level seams) and rolls their seeds.
- Activating a room initialises the levels behind its warps (`sub_6FD77BB0` $\rightarrow$ `DRLG_InitLevel`). The sequential mode therefore generates every requested level first and activates the rooms afterwards, so each level's RNG trace stays under its own context.
- `pDrlgRoom->pRoom` stays `NULL` for every room, so `D2Common_COLLISION_FirstFn_6FD41000` is a no-op (`D2Collision.cpp` returns when `pRoom` is `NULL`).
- Unit spawning and `DRLG_CreateRoomForRoomEx` are outside the oracle.

### 3. Output (Schema 3)

```text
{schema: 3, oracle: {d2moo, arch: "i386"}, gameSeed, difficulty, isolated,
 drlg: {startSeed, seed: [low, high]},
 act: [{id, drlgType, levelType, coord: [x, y, w, h], flags, seed,
        outdoor?: {flags, roomData: [orth]}, preset?: {direction, map}}],   // sorted by id
 levels: [{id,
   levelGrid: {flags, coord, grids: [grid x4], ring: [vertex], nVertices,
               vertices: [vertex x24], pathStarts: [null | [[x, y, dir, flags]...] x6],
               roomData: [orth], seed},                 // after InitAct1OutdoorLevel, before rooms
   nRooms, rooms: [{type, coord, flags, otherFlags, dt1Mask, initSeed, seed,
                    outdoor?: {flags, flagsEx, subType, subTheme, subThemePicked},
                    preset?: {prest, picked, flags, map}}],                  // creation order
   maps: [{prest, picked, coord, file, hasInfo, units}],
   levelSeedAfterRooms, warp: {n, xy},
   activation: [{seed, tile, wall, floor, dirt, units, seedAfterTiles, mapTiles} |       // outdoor rooms
                {seed, walls: [grid], tiles: [grid], floors: [grid], shadow, units,      // preset rooms
                 seedAfterTiles, mapTiles}]}]}

mapTiles: {nWalls, nFloors, nShadows,                   // pTileGrid counters
           pTiles: {nWalls, nFloors, nRoofs},           // pTileGrid->pTiles counters
           walls: [tile], floors: [tile], roofs: [tile],// pTiles arrays, exactly pTiles.nX entries each
           links: [[bFloor, tileRef]],                  // pTileGrid->pMapLinks chain
           warps: [[[levelId, room] | null, lvlWarpRow, bEnabled, tileRef, tileRef]],  // pRoomTiles chain
           units,                                       // pPresetUnits (incl. AddWarp's UNIT_TILE units)
           logical: null | {flags, nLists, indexX: grid, indexY: grid, lists: [coordList]}}
tile:      [nWidth, nHeight, nPosX, nPosY, unk0x10, dwFlags, pTile, nTileType, unk0x20, unk0x24,
            nRed, nGreen, nBlue, nIntensity, unk0x2C]  // every D2DrlgTileDataStrc field in order
```

### 4. RNG Trace (`--trace`)

The trace has one event per line. The TypeScript port writes the exact same format:

```text
I <label> <low>                    SEED_InitLowSeed (high seed 666)
S <label> <low> <high>             SEED_SetSeeds
R <label> 0 <low>:<high>           SEED_RollRandomNumber, 64-bit state after the roll (hex)
L <label> <max> <result>           SEED_RollLimitedRandomNumber (max <= 0 does not roll)
P <label> 100 <result>             SEED_RollPercentage
T <type> <style> <seq> <n> <sum>   D2CMP_10088_GetTiles lookup: n tiles, rarity sum
# <context>                        driver context (drlg, L<id>, L<id>/a<room>)
```

Labels are `<context>#<n>`, assigned when a seed is initialized. The build fails if any D2MOO object that rolls a seed was not compiled against the traced `include/D2Seed.h`.
