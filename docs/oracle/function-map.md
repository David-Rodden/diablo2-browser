# Function Map — D2Game / D2Common 1.13c → TS server (draft)

Status legend: **diff-verified** = covered by an oracle golden scenario with no divergence in the
relevant columns; **diff-observed** = exercised by a golden scenario, divergence open (see
`P4-first-divergence.md` / `parity-baseline.json`); **unverified** = mapped by reading code only.

Evidence for addresses: `kb/engine/oracle-hooks-113c.md` and the kb documents listed per row.
This table is meant to grow one row per original function as P4 iterations proceed; the long-term
metric is the share of rows in **diff-verified**.

## Engine core

| Original (VA) | Name (role) | TS | Status |
|---|---|---|---|
| D2Game #10008 `0x6FC4E1E0` | `GAME_UpdateGames` wall-clock frame scheduler (40 ms) | replica runner fixed step (`tools/oracle/lib/replica.ts`), `LocalLoopbackAdapter.tick` | n/a (driver) |
| D2Game `0x6FC4E050` | `GAME_UpdateGameFrame` (`dwGameFrame++`, per-frame sub-updates, %20/%12/%11 periodic work) | `stepFrame` `src/server/engine/game-instance/frame-and-commands.ts:42` | diff-observed |
| D2Game `0x6FC4A900` | `GAME_InitSeed` (override `[0x6FD2E354]` / QPC; `pGame+0x7C`, seed `pGame+0xD0`) | `GameInstance` `mapSeed` → `D2Rng` (`state.ts`) | diff-observed (`initSeed` matches; `gs` stream not modelled) |
| D2Game #10017 `0x6FC4A210` | seed override setter (`-seed`) | scenario `seed` | verified (oracle `seedOverride=1`) |
| D2Game `0x6FCFF9C0` | `SUNIT_GetNewUnitId(type, pGame)` per-type counters `pGame+0x90` | `allocateUnitId(unitType)` `area-and-session.ts:955` | P4 iteration 1 |
| D2Game `0x6FD01D90` | `SUNIT_AllocUnitData` (type switch `0x6FD02084`) | per-kind spawn functions | unverified |
| D2Game `0x6FCEC550` | C2S dispatcher (`ebx`=packet, `esi`=player, stack `pGame,size`; table `0x6FD1A078`) | `decodeD2gsC2sPacketToCommand` `src/server/net/session.ts:51` → `enqueueCommand` `world-spawning-and-aoi.ts:1628` | diff-observed |
| D2Common `0x6FD51050` / `0x6FD51080` | `UNITS_GetX/Y` (dynamic `wPosX/wPosY`, static `+0x0C/+0x10`) | unit `x`,`y` | diff-observed |
| D2Common #10331 / #10826 | `UNITS_GetRoom`, `DUNGEON_GetLevelIdFromRoom` | `areaId` | diff-observed |
| D2Common `0x6FD51330`, `0x6FD9C570`, #10573 `0x6FD9CE00` | room-by-subtile, collision mask read, `COLLISION_CheckMaskWithSize` | collision maps (`MapService`) | unverified (oracle `dumpcoll` available) |

## Stats / states

| Original (VA) | Name | TS | Status |
|---|---|---|---|
| D2Common #10973 `0x6FD88B70` | `STATLIST_GetUnitStat` (accrued) | `UnitStatList` `stat-list.ts:496`, `playerCombatContext` | diff-observed (player stats match at frame 2) |
| D2Common #10587 `0x6FD88C20` | `STATLIST_GetUnitBaseStat` | base stat list | unverified |
| D2Common #10887 `0x6FD8A740` | `STATLIST_SetUnitStat` | stat setters | unverified |
| D2Common #10871 `0x6FD88520` → `0x6FD87F80` | `STATES_CheckState` | `stepUnitStates` / `StateBus` | diff-observed (p52 scenarios) |
| D2Game `0x6FD0B090` | `PLAYER_LevelUp` (`esi`=unit, stack pGame) | level-up path | unverified (used to author saves) |

## Combat

| Original (VA) | Name | TS | Status |
|---|---|---|---|
| D2Game `0x6FCFC0B0` | `SUNITDMG_ApplyDamage(pGame, att, def, pDamage)` (resists loop `0x6FCFBD00`/`0x6FCFB3C0`) | `executeSUnitDmg` `combat-pipeline.ts:1502`, `applyDamageToMonster` `monster-damage.ts:31`, `applyDamageToPlayer` `player-death-and-shrines.ts:37` | diff-observed (oracle `dmg` events in a1-bloodmoor-melee, p52-*) |
| D2Game `0x6FCFB3C0` | effective resistance | `computeEffectiveResistance` `combat-pipeline.ts:326` | unverified (P5.3 sweep) |
| D2Game `0x6FCBF210` | `SUNITDMG_RollDamage` | `executeSUnitDmg` rolls | unverified (needs per-unit seeds) |
| D2Game `0x6FCFBA40` | life/mana steal | combat pipeline | unverified (P5.3 sweep) |

## Skills

| Original | Name | TS | Status |
|---|---|---|---|
| skill calc evaluator (P5.3) | `skills.txt` calc columns | `evaluateCalc` `calc-ast.ts:694`, `evaluateSkill113c` `registry.ts:298` | see `P5-formula-sweep.md` |
