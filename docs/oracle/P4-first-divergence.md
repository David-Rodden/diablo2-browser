# P4 — First-Divergence Parity Loop

Scenario: `tests/fixtures/oracle/scenarios/a1-town-walk.json` (seed 12345, level-1 Barbarian, Rogue
Encampment, 750 frames, 5 run/walk inputs). Oracle golden:
`tests/fixtures/oracle/golden/a1-town-walk.oracle.ndjson.gz`.

Loop (one root cause per iteration):

```sh
npx tsx tools/oracle/run-replica.ts tests/fixtures/oracle/scenarios/a1-town-walk.json /tmp/rep/tw.ndjson
zcat tests/fixtures/oracle/golden/a1-town-walk.oracle.ndjson.gz > /tmp/rep/tw.oracle.ndjson
npx tsx tools/oracle/diff.ts /tmp/rep/tw.oracle.ndjson /tmp/rep/tw.ndjson --from 2 --types 0,1
```

`--from 2`: the oracle player joins during frame 1 (its frame-1 line has no units); that offset is a
known later divergence. `--types 0,1`: only players and monsters are compared. (Oracle rows are grouped
by real `dwType` across the five game hash lists — list 3 items, list 4 missiles, tiles not hashed — so
oracle `t3` is the missile list in the newer goldens; the replica emits missiles under `t3` too.)

Evidence references: `D2Game.dll` / `D2Common.dll` 1.13c VAs (preferred base), disassembly via
`objdump -d -M intel` of the binaries in `samples/d2`.

---

## Iteration 1 — per-type unit ids

**First divergence (before):**

```
FIRST DIVERGENCE at frame 2: extra-unit monster #28   (replica ids 28..42, oracle ids 1..8)
```

**Root cause.** 1.13c keeps one unit id counter per unit type. `SUNIT_GetNewUnitId` `D2Game 0x6FCFF9C0`
(`ecx` = type, `edx` = `pGame`): asserts `type < 6` (`0x6FCFF9C0..0x6FCFF9DF`), then
`eax = [pGame + type*4 + 0x90]; inc eax; if eax == -1 -> 1; store` (`0x6FCFF9E4..0x6FCFF9F6`). The six
counters `pGame->dwLastUnitId[0..5]` (`+0x90..+0xA4`) are zeroed at game creation
(`0x6FC4C703..0x6FC4C721`), so the first id of every type is 1. Called from `SUNIT_AllocUnitData`
`0x6FD01D90` (`0x6FD01ECC`). The TS server used one shared `nextUnitId` for every kind.

**Fix.**

- `GameInstanceState.nextUnitIdByType` (six counters, first id 1, `0xFFFFFFFF` skipped) replaces
  `nextUnitId`; `allocateUnitId(unitType)` takes the 1.13c type (`UNIT_TYPE_113C`): players and player
  corpses 0 (corpses are `UNIT_PLAYER` units, `UnitAssign unitType 0`), monsters / mercenaries / summons
  1, objects 2, missiles (incl. merc/pet projectiles, `CreateMissile` ids) 3, items (incl. cube outputs,
  vendor clones, ears, split stacks) 4, warp tiles 5 — all 50 call sites.
- Id-only lookups that searched several kinds now take the type:
  - `findUnitPosition(id, areaId?, unitType?)`; `MoveToUnit`/`WalkToTarget`/`RunToTarget` keep the
    target type (`player.moveTargetUnitType`) and only treat tiles/objects as static targets by type.
  - `handleInteract(player, id, type?)` resolves only the clicked type (C2S `0x13` carries it): corpse /
    player trade (0), object (2), NPC (1); pending object / corpse interactions pass their type.
  - AOI event positions (`extractEventPosition113c`) resolve ids with the event's `unitType` or the key's
    implied type (`itemId` 4, `portalId` 2, `missileId` 3, `mercId` 1, `corpseId` 0; item owner from
    `ownerType` / merc container).
  - `applyDamageToMonster(monsterId, dmg, attackerId)`: a bare attacker id is a player id first; it is
    read as a mercenary id only for a merc source or when no player has that id.
  - Chest-trap missiles (owner = object, combat side `'monster'`) carry `ownerIsObject` so owner lookups
    never pick a monster with the same id (also inherited by child missiles).
  - `isUnitIdAlreadyInUse` → `isItemUnitIdInUse` (only items); the item counter is bumped past adopted
    item ids (former `nextUnitId` watermark in `itemDataToServerEntry`).
  - Bone-prison / door index watermarks use the monster / object counters.
- Already type-keyed (no change needed): per-kind containers (`players`, `monsters`, `objects`,
  `groundItems`, `missiles`, `warpTiles`, `mercenaries`), AOI keys `${type}:${id}`
  (`src/server/net/aoi.ts`), client unit maps (the client already handles real D2GS ids, which repeat
  across types).

**Files.** `src/server/engine/game-instance/{state,constants-and-helpers,area-and-session,frame-and-commands,
trade-party-and-progression,quests-objects-and-portals,monster-damage,missiles-step,player-death-and-shrines,
item-stats-and-drops,player-combat-and-vitals,types,...}.ts` (all `allocateUnitId` call sites).
Tests whose assertions matched ids without a type: `tests/server/p1-quests-objects-wave4.test.ts`
(monster #1 and chest #1 now coexist), `tests/merc-and-corpse-summon-1395.test.ts` (`getAllUnits` lookup
by `unitType` + id).

**Tests.** Full `npx vitest run`: no new failures versus the pre-change baseline (see the report table
for counts; remaining failures need baked assets / other agents' fixtures).

**Next divergence:**

```
FIRST DIVERGENCE at frame 2: field monster #1
  field class: oracle=152 replica=179
```

---

## Iteration 2 — preset monsters spawn on room activation; critters are never spawned

**First divergence (before):**

```
FIRST DIVERGENCE at frame 2: field monster #1
  field class: oracle=152 replica=179
```

The replica spawned all 15 Rogue Encampment DS1 preset monsters (plus a Blood Moor monster) when the
area loaded; the oracle has exactly 8 units at frame 2: rogue1 ×2 (room 23), Kashya + Warriv (24),
Akara (30), Charsi (32), rogue1 ×2 (31) — ids 1..8 in that order. The player stands in room 31
(sub-tiles 5640..5680 × 5880..5920).

**Root cause (two parts).**

1. *Room activation.* 1.13c spawns a room's presets when the room becomes active, not when the level
   is built. `D2Game 0x6FC4CBE0` (called from the game frame `0x6FC4E0D0`) walks, for each act, the
   new-room list `[pDrlg+0x54]` head-first (`next = [room+0x7C]`), and for every room without flag
   `0x1` calls `0x6FD01430` (preset units), `0x6FC400E0`, `0x6FC4F0D0`, `0x6FC67A20` (random density)
   and sets the flag. `0x6FD01430` iterates the room's preset list twice: first every non-monster preset
   (`[preset+0x14] != 1`), then the monsters (`type == 1`), skipping presets with `[preset+0x1C] & 1`;
   each goes through `0x6FD013B0` → `0x6FD012D0` (monsters → `0x6FC67CF0`). Only the rooms near the
   player's room are active (the touching-rectangle neighbourhood the TS wilderness streamer already
   uses). The oracle's id order (rooms 23, 24, 25, 30, 32, then the player's room 31) equals head
   insertion of the activation order `[current room, near rooms ascending (y, x)]` — the D2Common
   near-room list is position-sorted (`DRLGROOM_SortRoomListByPosition`, `D2Common 0x6FD77EB0`); the
   exact activation call was not disassembled, the order is taken from the oracle trace.
2. *Critters.* The spawn worker `0x6FC66F70` returns 0 when `0x6FC213B0(classId, 0xD)` is set
   (`0x6FC66FC0..0x6FC66FCE`). `0x6FC213B0` reads the MonStats2 row of the class (`MonStats +0x18`
   `wMonStatsEx`, stride `0x134`) and tests bit 13 of its flag bytes (`+4`), i.e.
   `MONSTATS2_FLAGINDEX.CRITTER` (`critter` column). `chicken` (149) has `critter = 1`, so the two
   chickens in active rooms 25 and 30 never spawn; `cow` (179, `critter = 0`) is only in inactive rooms.

**Fix.**

- `loadArea` no longer spawns DRLG preset monsters. They are kept per room
  (`GameInstanceState.pendingPresetMonsters`, room = `roomRects` rectangle containing the preset);
  presets outside every rectangle (synthetic test geometry without rooms) still spawn immediately.
- `activatePresetRoomsNearPlayer113c(player)` activates the player's room and its touching rooms
  once, and spawns their presets in reverse activation order (head insertion). It runs each frame for
  every player (before the wilderness density streamer, like `0x6FD01430` before `0x6FC67A20`), right
  after `connectPlayer` adds the player, and after an area transition places the player.
- `spawnAreaPresetMonster113c` skips classes with the MonStats2 `critter` flag
  (`hasMonStats2Flag(classId, MONSTATS2_FLAGINDEX.CRITTER)`).
- Not changed (follow-up): preset *objects* are still spawned at area load (1.13c spawns them in the
  same room pass, before the monsters); object ids are not in the trace yet.

**Files.** `src/server/engine/game-instance/{area-and-session,world-spawning-and-aoi,frame-and-commands,
quests-objects-and-portals,state}.ts`.

**Next divergence:** every frame-2 unit now matches (ids, classes, modes, positions):

```
FIRST DIVERGENCE at frame 2: field monster #1
  field stat6: oracle=256 replica=2304
```

---

## Iteration 3 — replica sub-tile convention (trace runner)

Comparing the player track (`--types 0`): the oracle's first displacement appears in the frame the
`0x03` packet is delivered (frame 50, `x` 5653 → 5654), the replica's one frame later, with the same
speed afterwards.

**Root cause.** Not the engine: the runner converted positions with `Math.floor(x)`. 1.13c places a
unit at the sub-tile centre — `PATH_AllocDynamicPath` (`D2Common #11003`, `0x6FD86030`) stores the
precise position `(n << 16) + 0x8000` and `wPosX` is its integer part — whereas TS logical `N.0` is the
centre of sub-tile N (`src/common/path/movement-predictor.ts`: "logical N.0 is the centre of sub-tile N,
so `Math.round`"; the server's own wire position is `playerWirePosition` = `Math.round`). The 1.13c
coordinate of a TS position is therefore `floor(x + 0.5)`.

**Fix.** `tools/oracle/lib/replica.ts` `subtile(v) = Math.floor(v + 0.5)`; documented in
`docs/oracle/scenario-schema.md`.

**Next divergence:**

```
FIRST DIVERGENCE at frame 50: field player #1
  field stat10: oracle=23552 replica=23512
```

---

## Iteration 4 — no stamina drain while running in town

**Root cause.** The run-drain routine `D2Game 0x6FC97BB0` starts with
`DUNGEON_IsRoomInTown(UNITS_GetRoom(unit))` (`0x6FC2A478` → D2Common #10331, `0x6FC2A808` → D2Common
#10057) and returns 1 without touching stat 10 when the room is in town (`0x6FC97BB4..0x6FC97BC9`); the
drain itself (`CharStats.RunDrain * 2` at `+0x42`, armour speed, stat `0x9A`) follows at
`0x6FC97BCA..0x6FC97C92`. The recovery routine `0x6FC97A50` switches on `mode - 1` (jump table
`0x6FC97B04`: NU/TN → shift 8, WL → shift 9 if stamina ≥ 256, TW → shift 9, RN/GH → default) and its
default case only recovers when stat 28 (`staminarecoverybonus`) ≥ 1000 (`0x6FC97AAD`). The TS server
drained `RunDrain * 2` per running frame everywhere (23552 → 23512 → …).

**Fix.** `stepPlayerVitals`: running in a town area neither drains nor (unless stat 28 ≥ 1000)
recovers stamina; outdoor running is unchanged.

**Files.** `src/server/engine/game-instance/player-combat-and-vitals.ts`.

**Next divergence:**

```
FIRST DIVERGENCE at frame 57: field player #1
  field x: oracle=5658 replica=5657
```

---

## Current first divergences (not fixed)

**Player track (`--types 0`), frame 57: run velocity.** The oracle's run positions after the `0x03` at
frame 50 (start 5653.5) cross sub-tiles at frames 50, 52, 54, 56, 57, 59, 61, 63, 65, 66, which bounds
the per-frame speed to `[0.5625, 0.5667)` sub-tiles — exactly `RunVelocity 9 / 16 = 0.5625`
(`CharStats.txt`), i.e. 14.0625 sub-tiles/s. The TS predictor uses `D2_BASE_RUN_SUBTILES_PER_SEC = 13.5`
(0.54 / frame; walk 9.0 vs `6 / 16 * 25 = 9.375`). The D2Common step is
`tVelocityVector = (tDirectionVector * dwVelocity) >> 8` (`0x6FD5D240`, ported in
`src/common/path/step.ts`); where D2Game sets `dwVelocity` for the player's walk/run mode
(`PATH_SetVelocity` #10488 call sites `0x6FC46B0A`, `0x6FC483F5`, `0x6FC8FD16`, `0x6FC8FD90`,
`0x6FCB97F5`, `0x6FCCFAD5`, `0x6FCD4027`, `0x6FCD634B`) still has to be confirmed before changing the
shared client/server predictor.

**Monster track (`--types 0,1`), frame 2: monster stats.** Oracle town monsters have level (stat 12)
0; rogue1 (minHP 142, maxHP 284) has HP 256/512 (1 or 2 points) and the NPCs 0/0. This matches
`MonLvl.txt` row 0 (`HP = 1`): `rand(142..284) * 1 / 100 ∈ {1, 2}` with the town's `Levels.txt`
monster level 0; the TS server gives NPCs their `MonStats` level (1) and full HP (9 points for the
rogues). The NPCs' 0 HP and the per-unit HP roll (1 vs 2) depend on the monster stat-init path and on
per-unit `D2SeedStrc` seeds, which the TS server does not have yet (P0 audit §3.2). Excluding HP/level
(`--fields class,mode,x,y --stats 0,1,2,3,8,9,10,11,13,14,15`), the next monster divergence is NPC
wandering (Kashya `mode 1 → 2` at frame 24), also driven by per-unit seeds.
