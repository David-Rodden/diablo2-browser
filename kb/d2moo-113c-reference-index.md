# D2MOO (1.10f) to Diablo II v1.13c Binary Reference Index

> **License & Scope Notice**: [ThePhrozenKeep/D2MOO](https://github.com/ThePhrozenKeep/D2MOO) (MIT License, see `THIRD_PARTY_NOTICES.md`) describes **Diablo II v1.10f**. In this project, D2MOO is used **strictly as a read-only symbol, struct-field, and high-level intent reference**. Every address, register convention, ordinal, struct offset, and branch condition MUST be independently verified against the authoritative **v1.13c** binaries (`D2Game.dll` base `0x6FC20000`, `D2Common.dll` base `0x6FD50000`) before entering `kb/` or `src/d2kern-113c/`.

---

## 1. Verified Systematic Differences: 1.10f (D2MOO) vs. v1.13c Binaries

| Dimension | 1.10f (D2MOO C++ Signatures) | v1.13c (`D2Game.dll` / `D2Common.dll`) | Verification Impact |
|---|---|---|---|
| **Compiler & Internal Calling Convention** | MSVC 6.0 standard `__fastcall` (`ecx`, `edx`, stack right-to-left) | MSVC 7.1 (`.NET 2003`) LTCG custom register conventions (`eax`, `ecx`, `edx`, `esi`, `edi` mixed with stack cleanup) | Never trust D2MOO parameter order blindly; always verify prologue register reads and `ret N` stack cleanup in 1.13c x86 disassembly. Example: `0x6FCFE0C0` (`SUNITDMG_ApplyDamage`) takes `eax = pDefender` and stack `(pGame, pAttacker, bApplyResists, pDamage)` (`ret 0x10`). |
| **`D2Common.dll` Export Ordinals** | 1.10f ordinal numbering (`#10000..#111xx`) | Reshuffled in 1.11–1.13c (`D2Common.dll` base `0x6FD50000`) | Never copy D2MOO `#10xxx` ordinal numbers; always resolve IAT thunks in 1.13c `D2Game.dll` (`0x6FD18xxx`) to exact 1.13c `D2Common` VAs (`0x6FD5xxxx..0x6FDDxxxx`). |
| **Image Bases & Code Layout** | 1.10f `D2Game.dll` (`0x6FC30000`), `D2Common.dll` (`0x6FD40000`), source-file order | 1.13c `D2Game.dll` (`0x6FC20000`), `D2Common.dll` (`0x6FD50000`), LTCG-reordered `.text` | Subsystem clustering shifted substantially (e.g., `SUnitDmg` lives at `0x6FCFA660..0x6FCFF2B0` in 1.13c; `MonsterMode` at `0x6FC94800..0x6FC9B000`; `AiTactics` at `0x6FD11B10..0x6FD13500`). |
| **1.11–1.13c Balance & Bugfixes** | 1.10f Synergy / FE explosion / Mercenary aura / Oblivion Knight IM / Uber Pandemonium absent or pre-patch | 1.13c removes Iron Maiden from Act 4 Oblivion Knights, rescales Fire Enchanted death damage on Nightmare/Hell, adds Pandemonium/Token mechanics, and updates rune drop tables | Always treat 1.13c disassembly + 1.13c `Patch_D2.mpq` `.txt`/`.bin` tables as sole behavioral ground truth. |

---

## 2. Combat & Damage Pipeline (`SUnitDmg.cpp` $\leftrightarrow$ 1.13c `0x6FCFA660..0x6FCFF2B0`)

### Core Structs (`D2DamageStrc` = `0x70` bytes)
- `+0x00` `dwFlags` (`DAMAGEFLAG_*`): bit `0x01` = use `bSrcDam`, `0x20` = knockback, `0x80` = dodge/avoid, etc.
- `+0x04` `wResultFlags` (`RESULTFLAG_*`): `0x0001` hit, `0x0002` death, `0x0004` get-hit (`GH`), `0x0008` knockback, `0x0010` block, `0x0020` no-durability, `0x0100` dodge, `0x0200` avoid, `0x2000` weapon block, `0x4000` soft-death.
- `+0x08` `dwPhysDamage`, `+0x0C` `dwEnmgDamage`, `+0x10` `dwFireDamage`, `+0x14` `dwBurnDamage`, `+0x18` `dwBurnLen`, `+0x1C` `dwLtngDamage`, `+0x20` `dwMagDamage`, `+0x24` `dwColdDamage`, `+0x28` `dwPoisDamage`, `+0x2C` `dwPoisLen`, `+0x30` `dwColdLen`, `+0x34` `dwFrzLen`, `+0x38` `dwLifeLeech`, `+0x3C` `dwManaLeech`, `+0x40` `dwStamLeech`, `+0x44` `dwStunLen`, `+0x48` `dwAbsLife`, `+0x4C` `dwDmgTotal`, `+0x54` `dwPiercePct`, `+0x58` `dwDamageRate`, `+0x60` `dwHitClass`, `+0x64` `nHitClassActiveSet`, `+0x65` `nConvType`, `+0x68` `dwConvPct`, `+0x6C` `nOverlays`.

### Function Mapping (Batch 1 Combat Settlement Chain)

| 1.13c `D2Game` VA | Size | Manifest Symbol | D2MOO 1.10f Symbol (`SUnitDmg.h`) | Verified 1.13c Notes |
|---|---:|---|---|---|
| `0x6FCFD450` | `1,588B` | `SUNITDMG_FillDamageValues` | `SUNITDMG_FillDamageValues` | Computes weapon/monster base + mastery + `%ED` + elemental/poison/cold/freeze/leech/deadly-strike/crushing-blow into `D2DamageStrc`. Note: 1.13c player path initializes stack local leaving `dwBurnDamage` untouched unless burn stats exist. |
| `0x6FCFC0B0` | `1,152B` | `SUNITDMG_ApplyResistancesAndAbsorb` | `SUNITDMG_CalculateTotalDamage` / `SUNITDMG_ApplyResistancesAndAbsorb` | Iterates elemental/magic/physical channels (`0x6FCFBD00` channel helper), PvP/unit-type damage penalty (`0x6FCFA7A0`), resist pierce & caps (`[-100, maxResist]`), percent & flat absorb (`dwAbsLife`), and updates `dwDmgTotal`. |
| `0x6FCFE0C0` | `692B` | `SUNITDMG_ApplyDamage` | `SUNITDMG_ExecuteMissileDamage` / `SUNITDMG_ApplyDamage` | Custom 1.13c ABI (`eax = pDefender`, stack: `pGame, pAttacker, bApplyResists, pDamage`). Optionally runs `0x6FCFC0B0` when `bApplyResists != 0`, applies cold (`0x6FCFC780`), freeze (`0x6FCFDAC0`), poison (`0x6FCFCAB0`), burn (`0x6FCFC940`), stun (`0x6FCFCC20`), leech (`0x6FCFBA40`), subtracts HP (`STAT_HITPOINTS = 6`), and sets `RESULTFLAG_DEATH (0x02)` when HP reaches `0`. |
| `0x6FCFCF20` | `1,324B` | `SUNITDMG_ApplySideEffectsAndKill` | `SUNITDMG_ExecuteEvents` (post-damage tail) / `SUNITDMG_KillMonster` | Post-damage state transitions: triggers `MONMODE_GETHIT (3)` (`0x6FCFB910`), knockback, durability loss (`0x6FCFA660`), monster kill (`0x6FCFEEE0` $\to$ `MONSTER_StartDeath` `0x6FC96270`), experience (`0x6FCFFFD0` / `0x6FCFE380`), and S2C unit life/damage sync (`0x0C` / `0x0D`). |
| `0x6FCFBA40` | `690B` | `SUNITDMG_ApplyLifeManaSteal` | `SUNITDMG_AddLeechedLife` / `SUNITDMG_AddLeechedMana` (inlined caller) | Applies difficulty leech divisor (`DifficultyLevels.txt` LifeStealDivisor / ManaStealDivisor) + monster `Drain` effectiveness (`MonStats.txt` `Drain(N/Nm/H)`), adds HP/Mana/Stamina, and triggers `leech` overlay (`0x6FD82C10`). |
| `0x6FCFED30` | `632B` | `SUNITDMG_ExecuteEvents` | `SUNITDMG_ExecuteEvents` | Combat list (`D2CombatStrc`) melee/missile event dispatcher invoking attacker/defender melee events, `0x6FCFC0B0`, `0x6FCFE0C0`, and `0x6FCFCF20`. |
| `0x6FCFDE90` | `554B` | `SUNITDMG_GetResultFlags` | `SUNITDMG_GetResultFlags` | Rolls `IsHitSuccessful` (`0x6FCFDCA0`), `ApplyBlockOrDodge` (`0x6FCFB030`), weapon block, and sets `wResultFlags`. |
| `0x6FCFDDE0` | `172B` | `SUNITDMG_AllocCombat` | `SUNITDMG_AllocCombat` | Allocates `D2CombatStrc` node and prepends to `pAttacker` combat list. |

---

## 3. Monster AI & Mode Transitions (`AiThink.cpp`, `AiTactics.cpp`, `AiUtil.cpp`, `MonsterMode.cpp`)

### Function Mapping (Batch 2 Monster AI Chain)

| 1.13c `D2Game` VA | Size | Manifest Symbol | D2MOO 1.10f Symbol | Verified 1.13c Notes |
|---|---:|---|---|---|
| `0x6FCA3130` | `1,049B` | `AiFallen` | `AITHINK_Fn006_Fallen` (`AiThink.cpp`) | Index `6` in `gpMonsterAiFunctionTable` (`0x6FD2F9B8`). Checks popped `D2AiCmdStrc` (`0x6FC40EC0` flee trigger on ally death), shaman/boss rally, melee swing (`MONMODE_ATTACK1`/`ATTACK2`), approach (`0x6FD12540`), idle wander (`0x6FD11B10`), and stall (`0x6FD122C0`). |
| `0x6FCA38B0` | `619B` | `AiZombie` | `AITHINK_Fn001_Zombie` (`AiThink.cpp`) | Index `1` in `gpMonsterAiFunctionTable`. |
| `0x6FCBD3B0` | `351B` | `AI_RunMonsterAI` | `MONSTERAI_UpdateAiCallback` / `AIGENERAL_ExecuteAiFn` | Event `MON_EVENT_AI_THINK (2)` handler: validates mode/state and calls `0x6FCBD160` (`AI_DispatchTargetByAiFlag`). |
| `0x6FCBD160` | `583B` | `AI_DispatchTargetByAiFlag` | `AIUTIL_TargetDispatch` / `AITHINK_Execute` | Resolves `pAiGeneral` flags, invokes `0x6FD13220` (`AI_GeneralFindTargetOrThrottle`), computes melee range (`D2Common.#10399`), and calls `pAiGeneral->pfnThink` (`D2AiParamStrc` on stack). |
| `0x6FD13220` | `298B` | `AI_GeneralFindTargetOrThrottle` | `AITACTICS_IdleOrFindTarget` | Calls `0x6FCD1C90`; if no target within `aidist`, throttles via `AI_Stall` (`0x6FD122C0`). |
| `0x6FCD1C90` | `1,155B` | `AI_FindNearestPlayerOrAlly` | `AIUTIL_FindTarget` (`AiUtil.cpp`) | Walks active room + adjacent rooms (`0x6FCD1820` callback) to find closest valid hostile target, respecting alignment, untargetable states, and `aidist`. |
| `0x6FC95E10` | `560B` | `MONSTER_StartMode` | `D2GAME_MONSTERMODE_Change_6FC62E70` / `MONSTERMODE_EventHandler` | Central monster mode transition dispatcher via `monsterModeEventTable` (`0x6FD1A498`). |
| `0x6FC96270` | `768B` | `MONSTER_StartDeath` | `MONSTERMODE_StartDeath` (`MonsterMode.cpp`) | Mode `0` (`MONMODE_DEATH`) `pfnStart`: clears collision/events, inserts into room death ring (`D2Common.#10873` `0x6FD8AFD0`), broadcasts ally flee AI command (Fallen nearby flee!), runs boss/minion death hooks (`0x6FC955C0`), and rolls treasure-class item drops (`0x6FC95900` $\to$ `0x6FC31A70`). |
| `0x6FC96040` | `176B` | `MONSTER_EndDeath` | `MONSTERMODE_EndDeath` | Mode `0` `pfnEnd` (`20` frames later for Fallen): transitions unit `dwAnimMode` from `MONMODE_DEATH (0)` to `MONMODE_DEAD (12)` corpse state. |
| `0x6FC96BF0` | `809B` | `MONSTER_EndToAiOrNeutral` | `MONSTERMODE_EndToNeutralOrAi` | Mode `pfnEnd` for `GH`/`A1`/`A2`/`BL`/`SC`/`S1`/`WL`/`RN`: clears uninterruptible flag (`0x6FD02240`), transitions to `MONMODE_NEUTRAL (1)`, and schedules next `MON_EVENT_AI_THINK` tick (`aidel`). |
| `0x6FD12540` | `706B` | `AI_ApproachTarget` | `AITACTICS_WalkToTargetUnit` (`AiTactics.cpp`) | Pathfinds toward target unit and starts `MONMODE_WALK (2)` / `MONMODE_RUN (15)`. |
| `0x6FD12D80` | `664B` | `AI_FleeFrom` | `AITACTICS_WalkAwayFromUnit` (`AiTactics.cpp`) | Retreats away from threat source (`D2AiCmdStrc` cmd `2`). |
| `0x6FD11B10` | `460B` | `AI_IdleWander` | `AITACTICS_IdleWalk` (`AiTactics.cpp`) | Random short-step idle wander (`MONMODE_WALK`). |
| `0x6FD122C0` | `155B` | `AI_Stall` | `AITACTICS_Wait` (`AiTactics.cpp`) | Enters `MONMODE_NEUTRAL (1)` and schedules `MON_EVENT_AI_THINK` after `nDelay` frames. |

---

## 4. Spawn, Room Population, Item Stats & S2C Unit Sync (Batches 3–4 Preview)

| 1.13c `D2Game` VA | Manifest Symbol | D2MOO 1.10f Counterpart | Subsystem |
|---|---|---|---|
| `0x6FC67D00` / `0x6FC66A30` | `ROOM_SpawnMonsterPreset` / `MONREG_*` | `MONSTERREGION_SpawnMonsters` / `MONSTERSPAWN_*` (`MonsterRegion.cpp`, `MonsterSpawn.cpp`) | Room monster spawning & inactive node save/restore (`MONREG_RestoreRoomMonstersFromNode`, `MONSTER_SaveInactiveMonsterNode`, `MONREG_GenerateOutfitVariants`). |
| `0x6FC57190` / `0x6FC4Bxxx` | `D2GAME_ITEMSTAT_OnStatChangedCallback` / `D2GAME_ITEMS_UpdateAllInventoryAndEquipmentStats` | `ITEMS_StatChangedCallback` / `ITEMS_UpdateEquipmentStats` (`Items.cpp`) | Equipment stat recalculation & stat-change listener callbacks. |
| `0x6FCC56A0` / `0x6FCC58E0` | `UNIT_SendFullUnitSyncToClient` / `UNIT_SendGfxStatesBitstreamToClient` | `SUNITMSG_SendUnitToClient` / `D2GAME_STATES_SendUnitStates` (`SUnitMsg.cpp`) | S2C `0xAC` / `0x51` / `0xA7` / `0xA8` / `0xAA` unit appearance & state bitstream packets. |
