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
| D2Game `0x6FC4A900` | `GAME_InitSeed` (override `[0x6FD2E354]` / QPC; `pGame+0x7C`, seed `pGame+0xD0`) | `initGameSeed113c` `src/common/rng/unit-seeds-113c.ts`, `GameInstanceState.gameSeed113c` | **diff-verified** (P4 iteration 5; `gs` matches frames 2..23 across all 10 scenarios) |
| D2Game #10017 `0x6FC4A210` | seed override setter (`-seed`) | scenario `seed` | **diff-verified** (oracle `seedOverride=1`) |
| D2Game `0x6FCFF9C0` | `SUNIT_GetNewUnitId(type, pGame)` per-type counters `pGame+0x90` | `allocateUnitId(unitType)` `area-and-session.ts` | **diff-verified** (P4 iteration 1) |
| D2Game `0x6FD01D90` → `0x6FD00110` / `0x6FD000C0` | `SUNIT_AllocUnitData` & unit/item `D2SeedStrc` allocation | `allocUnitSeed113c` / `allocItemUnitSeedDraws113c` `unit-seeds-113c.ts` | **diff-verified** (P4 iteration 5; `seedLo`/`seedHi` match all players & town monsters) |
| D2Game `0x6FC4CBE0` → `0x6FD01430` | DRLG room activation & preset spawn order (objects incl. `Sync=0` -> monsters -> tiles) | `activatePresetRoomsNearPlayer113c` `world-spawning-and-aoi.ts` | **diff-verified** (P4 iterations 2 & 5) |
| D2Game `0x6FCEA5F0` → `0x6FCFF1A0`, `0x6FCCF730` | Per-Act 13-slot monster outfit palette & `MONSTER_ChooseOutfit` | `registerMonsterOutfitPalette113c`, `chooseMonsterOutfit113c` `monstats2-outfit-113c.ts` | **diff-verified** (P4 iteration 5) |
| D2Game `0x6FCCFDB0`, D2Common #11089 `0x6FDA4A00` | `MONSTER_InitStats` level, inclusive HP roll & `STAT_VELOCITYPERCENT = 75` (`0x6FCCFFD1`) | `spawnMonsterInternal` `world-spawning-and-aoi.ts`, `computeMonsterWalkVelocity113c` `town-npc-ai-113c.ts` (note: legacy float hostile monster stepper in `pvp-and-monster-locomotion.ts` still uses `100%` pending hostile `D2Path` migration) | **diff-verified** (P4 iterations 5 & 6) |
| D2Common #10819 `0x6FD83140`, `0x6FD82EA0`, #10149 `0x6FD84D40` | `UNITS_UpdateAnimRateAndVelocity`, `UNITS_SetRunBonus` (`+50%`), `PATH_SetVelocity` | `computePlayerVelocity113c`, `computeMonsterWalkVelocity113c` `src/server/ai/town-npc-ai-113c.ts` | **diff-verified** (P4 iteration 6; `a1-town-walk` player matches through frame 155) |
| D2Common #10334 `0x6FD86230`, #10226 `0x6FD8E9A0` | `D2Common_10142` (`PATH_ComputePath`), `PATH_StepDynamicPath` (Q16.16) | `D2Common_10142` `path-compute.ts`, `D2Common_10226` `step.ts`, `TownNpcPathEngine113c` | **diff-verified** (P4 iteration 6; Kashya `#3` & Akara `#5` 0 diffs over 750 frames) |
| D2Game `0x6FC3DB40`, `0x6FC39C20`, `0x6FC36A30`, `0x6FC3BBC0`, `0x6FC95E10` | `AI_Npc`, `QUESTS_NpcGreetingAi`, `AI_HandleNpcNodes`, `AI_FollowDs1NpcPath`, `MONSTER_StartMove` | `TownNpcPathEngine113c.runNpcAiThink` & `startNpcWalkToPos113c` `src/server/ai/town-npc-ai-113c.ts` | **diff-verified** through frames 59..65 across all 10 scenarios (P4 iteration 6) |
| D2Game `0x6FCEC550` | C2S dispatcher (`ebx`=packet, `esi`=player, stack `pGame,size`; table `0x6FD1A078`) | `decodeD2gsC2sPacketToCommand` `src/server/net/session.ts:51` → `enqueueCommand` `world-spawning-and-aoi.ts:1628` | diff-observed |
| D2Common `0x6FD51050` / `0x6FD51080` | `UNITS_GetX/Y` (dynamic `wPosX/wPosY`, static `+0x0C/+0x10`) | unit `x`,`y` | diff-observed |
| D2Common #10331 / #10826 | `UNITS_GetRoom`, `DUNGEON_GetLevelIdFromRoom` | `areaId` | diff-observed |
| D2Common `0x6FD51330`, `0x6FD9C570`, #10573 `0x6FD9CE00` | room-by-subtile, collision mask read, `COLLISION_CheckMaskWithSize` | collision maps (`MapService`) | unverified (oracle `dumpcoll` available) |

## Stats / states

| Original (VA) | Name | TS | Status |
|---|---|---|---|
| D2Common #10973 `0x6FD88B70` | `STATLIST_GetUnitStat` (accrued) | `UnitStatList` `stat-list.ts`, `playerCombatContext` / `monsterCombatContext` | **diff-verified** (P4 iteration 5; player & monster stats match frames 2..23) |
| D2Common #10587 `0x6FD88C20` | `STATLIST_GetUnitBaseStat` | `UnitStatList.getBaseStat` `stat-list.ts` | **diff-verified** |
| D2Common `0x6FD8A280` / #10887 `0x6FD8A740` | `STATLIST_SetStat` / `STATLIST_SetUnitStat` (sparse zero deletion) | `UnitStatList.setBaseStat` / `addStat` `stat-list.ts` | **diff-verified** (P4 iteration 5; `0`-HP NPC `maxhp = 0`) |
| D2Common #10871 `0x6FD88520` → `0x6FD87F80` | `STATES_CheckState` (`st` bitmap) | `StateBus` / `PASSIVE_SKILL_TABLE_113C` / `STATE_ALIGNMENT = 105` | **diff-verified** (P4 iteration 5; `st` matches across all 10 scenarios) |
| D2Game `0x6FD0B090` | `PLAYER_LevelUp` (`esi`=unit, stack pGame) | level-up path | unverified (used to author saves) |

## Math / Primitives / Progression

| Original (VA) | Name | TS | Status |
|---|---|---|---|
| D2Common `0x6FD511E0`, D2Game `0x6FC214D0`, Fog `0x6FF687A0` | `muldiv` (`imul` + `idiv` 64-bit signed intermediate) | `mulDiv113c` `src/common/data/mul-div-113c.ts`, `fogMulDiv113c` `src/common/items/transaction-cost.ts` | **diff-verified** (P5.3 `primitives.ndjson`: 100.00% agreement on 99,953 non-faulting vectors) |
| D2Common #10115 `0x6FD9DC30` | `SKILLS_CalcDiminishingReturns` (`dm12..dm78`) | `computeDiminishingReturnsRaw` `src/common/data/calc-ast.ts` | **diff-verified** (P5.3 `primitives.ndjson`, in-domain `lvl >= 1`) |
| D2Common `0x6FD9DDB0` | `SKILLS_Calc5BandLinear` (`ln12..ln78` / `edmn..edln`) | `compute5BandScaling` `src/common/data/calc-ast.ts` | **diff-verified** (P5.3 `primitives.ndjson`, normal `lvl <= 99` domain) |
| D2Common #10385 `0x6FD82240`, `0x6FD823E0` | `AnimData.d2` character clip lookup & diminishing-rate table | `getCharAnimClip113c`, `computeDiminishingRate113c` `src/common/units/char-anim-speed.ts`, `char-anim-clips-113c.generated.ts` | **diff-verified** (P5.3 `frames.ndjson`: `animdata.frames` & `animdata.speed` 755/755 = 100.00%) |
| D2Game `0x6FC7D2F0`, `0x6FC7D1C0` | `EXP_ScaleByLevelDiff` (`explvl`), `EXP_ApplyExpRatio` (`expratio`) | `computeMonsterExpGrant113c`, `applyExpRatio113c` `src/common/progression/experience-113c.ts` | **diff-verified** (P5.3 `exp.ndjson`, normal `clvl 1..99` & positive `exp`) |

## Combat

| Original (VA) | Name | TS | Status |
|---|---|---|---|
| D2Game `0x6FCFC0B0` | `SUNITDMG_ApplyDamage(pGame, att, def, pDamage)` (resists loop `0x6FCFBD00`, absorb `0x6FCFB500`, DR->MDR overflow `0x6FCFBD41..0x6FCFBD80`) | `executeSUnitDmg`, `applyResist113c`, `applyElementalAbsorb113c` `src/server/engine/combat-pipeline.ts` | **diff-verified** on isolated P5.3 `dmg.ndjson` channels; wild-area trace `dmg` diff-observed |
| D2Game `0x6FCFB3C0` | `SUNITDMG_GetEffectiveResistance` (player/merc cap + `DifficultyLevels.ResistPenalty` + `1/5` pierce) | `computeEffectiveResistance`, `defenderResistParams113c` `src/server/engine/combat-pipeline.ts` | **diff-verified** (P5.3 `resist.ndjson`) |
| D2Game `0x6FCFE011`, `0x6FCFDE90` | `SUNITDMG_CheckToHit` (`AR` vs `Def` + `Alvl`/`Dlvl` `[5..95]`) | `computeToHitChance` `src/server/engine/combat-pipeline.ts` | **diff-verified** (P5.3 `hit.ndjson`) |
| D2Game `0x6FCFB7A0`, D2Common #10802 `0x6FD837E0` | Shield block chance (`block`, running `1/3`, `[0..75]` cap) | `computeBlockRate113c` `src/server/engine/combat-pipeline.ts` | **diff-verified** (P5.3 `block.ndjson`) |
| D2Game `0x6FCFCD80` → `0x6FCFBED0`, `0x6FCFD51A` | `SUNITDMG_RollDamageValue` & sequential Mastery/CS/DS crit rolls | `rollDamageRange256`, `executeSUnitDmg` `src/server/engine/combat-pipeline.ts` | P5.5 statistical fallback (`tests/oracle/stat-tests.test.ts`, `N = 100,000`, retired once hostile wild-area AI reaches frame-exact `dmg[]` parity) |
| D2Game `0x6FCFBA40` | `SUNITDMG_ApplyLifeManaSteal` (`LifeStealDivisor` / `ManaStealDivisor` + `MonStats.Drain`) | `computeLifeManaSteal113c` `src/server/engine/combat-pipeline.ts` | **diff-verified** (P5.3 `steal.ndjson`) |

## Skills & Client Display (D2Client.dll 1.13c)

| Original (VA) | Name | TS | Status |
|---|---|---|---|
| D2Common #10147 `0x6FDA174C`, #10121 `0x6FDA0460`, #11091 `0x6FDA0360` | `Skills.txt` calc evaluator (`skcalc`, `skform`, `elmin`, `elmax`, `elen`, `tohit`, `rawmana`) | `evaluateCalc` `src/common/data/calc-ast.ts`, `evaluateSkill113c` `src/server/skills/registry.ts`, `skill-calc-engine.ts` | **diff-verified** (`elmin`/`elmax` 100.00%, `tohit` 99.84%, `skills` overall 98.49% in `P5-formula-sweep.md`) |
| D2Game / D2Common `unit+0xA8` skill list init | Classless default skills `0..5` (`Attack`, `Kick`, `Throw`, `Unsummon`, `Left Hand Throw/Swing`) & `217..220` (scroll/tome skills) | `DEFAULT_SKILLS_113C` `src/common/units/default-skills-113c.ts`, `world-event-applier.ts`, `self.ts` | **diff-verified** (P5.4 `skills.list` 5/5 classes 100%) |
| D2Client `0x6FB6CEA0` (table `0x6FB8D6F0`) | `UI_DrawCharSheet` 18 stat cells + block / AR | `CharacterSheetPanel` `src/client/ui/character-sheet.ts`, `hud-world-sync.ts` | **diff-verified** (P5.4 `sheet.*` 23/23 = 100.0% across all 5 classes) |
| D2Client `0x6FADFD30` (`0x6FBA5210[descdam]`, `0x6FBA52A0[descatt]`) | Per-skill left/right attack block (`str short`, conditional Damage / AR visibility, item requirement guard) | `doesSkillShowDamageRow`, `doesSkillUseAttackRating` `src/client/ui/character-sheet.ts`, `pack-skilldesc.ts` | **diff-verified** (P5.4 `skill.*` 95.5%–98.5% across all 5 classes; see `P5-client-display.md`) |
| D2Client `0x6FAE3B50` / `0x6FAE16C0` | Skill tree & popup tooltip line builder (`descline1..6`, `dsc2line1..4`, `dsc3line1..7`) | `formatSkillDescLines113c` `src/common/skills/skilldesc-lines.ts`, `skilldesc-table.ts` | diff-observed (P5.4 tooltip lines ~86%–90%; remaining `no-tooltip-nontree` & `kick-damage` tracked in `client-ui-known-mismatches.json`) |
