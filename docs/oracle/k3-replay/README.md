# Milestone 34 (`[K3]`): Longitudinal Golden Replay Suite (`9 × p52-*`)

Pure-kernel (`src/d2kern-113c/`) frame-by-frame longitudinal replay suite covering all 9 Milestone 34 (`[K3]`) class combat, passive defense, summon, curse, warcry, aura, mercenary, and elemental/DoT missile scenarios in `tests/fixtures/oracle/golden/p52-*.oracle.ndjson.gz`.

## Architecture & Paths

| Piece | Path |
|---|---|
| K3 replay runner, coverage gap analyzer & horizon updater | `tools/oracle/kern-replay/k3-replay.ts` |
| Shared pure replay kernel & memory sampler | `tools/oracle/kern-replay/replay-113c.ts` -> `src/d2kern-113c/game/replay-kernel-113c.ts` |
| Headless Wine recorder (`d2host-113c.exe` + `d2oracle.dll`) | `tools/oracle/kern-replay/record-boot-headless.sh` -> `tools/oracle/run-headless-oracle.sh` |
| K3 ratchet, purity & coverage test suite | `tests/oracle/k3/replay-k3-p52-suite.test.ts` |
| K3 committed horizons (upward-only ratchet) | `tests/fixtures/oracle/k3/replay/horizons.json` |
| K3 `F2` boot snapshots & dynamic coverage | `tests/fixtures/oracle/k3/replay/<scenario>.{snap-f002,coverage}.ndjson.gz` |
| Per-scenario divergence artifacts & root causes | `docs/oracle/k3-replay/<scenario>.divergence.{json,md}` |
| Per-scenario dynamic `D2Game` / `D2Common` gap lists | `docs/oracle/k3-replay/gap-<scenario>.md` |

Regenerate divergence artifacts, gap lists, and upward-only horizons after a kernel change:

```bash
npx tsx tools/oracle/kern-replay/k3-replay.ts --write --update-horizons
```

Re-record `F2` boot snapshots or dynamic coverage on the original 1.13c DLLs via headless `d2host-113c.exe`:

```bash
tools/oracle/kern-replay/record-boot-headless.sh <scenario> snap
tools/oracle/kern-replay/record-boot-headless.sh <scenario> cover
```

All 18 headless recordings (`9 × snap` + `9 × cover`, `15,700` simulated frames each pass) verified **100% frame-by-frame identity** (`t0,t1,t3`) against the checked-in `Game.exe` goldens, aided by `d2host-113c.c`'s deterministic `25 fps` (`+40 ms/frame`) virtual `GetTickCount` IAT hook (`0x6FD18D10`) for `PLAYER_StepModeWalkOrRun` (`0x6FC99BE7`, `+25 ms` gate on `pPlayerData+0xA4` -> 20-entry breadcrumb ring `pPlayerData+0xA8` read by `NecroPet` `PetMove` state `1` `0x6FC3CE2A`).

---

## Baseline Horizon & Dynamic Coverage Table

Measured against the read-only `ReplayKernel113c` baseline (prior to `[K3]` handler wiring):

| Scenario | Golden Frames | Boot (`F2`) | `strict` Horizon | `pos` Horizon | Matched Kernel Frames | First `strict` Divergence | First `pos` Divergence | `D2Common` Gap / Exec | `D2Game` Gap / Exec |
|---|---:|---|---:|---:|---:|---|---|---|---|
| `p52-amazon-defense` | `1800` | identical | `F716` | `F716` | `714 / 1798` | `F717` `t1[9].y` (`5795` vs `5796`) | `F717` `t1[9].y` (`5795` vs `5796`) | `0 / 520` | `0 / 438` (`0 B`) |
| `p52-amazon-valkyrie` | `1500` | identical | `F641` | `F641` | `639 / 1498` | `F642` `t0[1].stat8` (`12422` vs `18816`) | `F642` `t1[12]` missing (`valkyrie` `#357`) | `0 / 641` | `8 / 491` (`4,938 B`) |
| `p52-barbarian-warcries` | `1600` | identical | `F637` | `F637` | `635 / 1598` | `F638` `t0[1].stat6` (`221045` vs `136448`) | `F638` `t3[1]` missing (`battleorders` `#237`) | `0 / 587` | `2 / 485` (`266 B`) |
| `p52-necromancer-curses` | `2000` | identical | `F629` | `F629` | `627 / 1998` | `F630` `t0[1].mode` (`10` vs `1`) | `F630` `t0[1].mode` (`10` vs `1`) | `0 / 617` | `8 / 524` (`4,989 B`) |
| `p52-necromancer-poison-golem` | `1800` | identical | `F636` | `F636` | `634 / 1798` | `F637` `t0[1].stat8` (`68121` vs `75008`) | `F637` `t1[12]` missing (`claygolem` `#289`) | `0 / 615` | `9 / 516` (`4,907 B`) |
| `p52-paladin-auras` | `1700` | identical | `F719` | `F719` | `717 / 1698` | `F720` `t0[1].seedLo` (`4059699577` vs `3081094168`) | `F720` `t1[10].mode` (`0` vs `2`) | `0 / 601` | `0 / 482` (`0 B`) |
| `p52-paladin-merc-aura` | `1700` | identical | `F2` | `F2` | `0 / 1698` | `F3` `t1[1].mode` (`2` vs `1`) | `F3` `t1[1].mode` (`2` vs `1`) | `0 / 666` | `2 / 544` (`2,908 B`) |
| `p52-sorceress-elemental` | `1800` | identical | `F629` | `F629` | `627 / 1798` | `F630` `t0[1].mode` (`10` vs `1`) | `F630` `t0[1].mode` (`10` vs `1`) | `0 / 552` | `0 / 434` (`0 B`) |
| `p52-sorceress-fire-dot` | `1800` | identical | `F635` | `F635` | `633 / 1798` | `F636` `t0[1].stat8` (`69664` vs `77568`) | `F636` `t3[1]` missing (`firewallmaker` `#68`) | `0 / 543` | `0 / 426` (`0 B`) |

**Aggregate baseline**:
- **Boot hydration**: `9 / 9` scenarios strictly match `F2` across every unit field, seed, level, stat, and `gs`.
- **Matched baseline frames**: `5,226 / 15,682` post-boot frames (`33.3%`) already match strictly (covering full Rogue Encampment exit navigation, Blood Moor room streaming/presets, stamina/mana regen, `C2S 0x3C` skill selection, and `C2S 0x0C` cast start animations).
- **`D2Common.dll` dynamic gap**: **`0` unported functions** across all 9 scenarios (`100%` ported/diff-verified).
- **`D2Game.dll` dynamic gap**: Only **`15` unique unported `D2Game.dll` VAs** across all 9 scenarios (`4` scenarios already have **`0`** unported manifest VAs and only need `replay-kernel-113c.ts` dispatch wiring).

---

## Consolidated Unported `D2Game.dll` VAs Across All 9 `[K3]` Scenarios (`15` Unique VAs)

| VA (`D2Game.dll`) | Size (B) | Subsystem / Role | Scenarios Hitting VA (First Frame) |
|---|---:|---|---|
| `0x6FC3DD40` | `1018` | `AI_Hireable` (`MonAI` entry for hired mercenaries, e.g. Act 1 Rogue Scout `hcIdx = 271`) | `p52-paladin-merc-aura` (`F3`) |
| `0x6FC3D3C0` | `1890` | `AI_Hireable_Sub` (mercenary town walk, owner follow, target selection, `#8 Inner Sight` / `#11 Cold Arrow` cast) | `p52-paladin-merc-aura` (`F3`) |
| `0x6FC49720` | `148` | `SKILLS_SrvDo068_BasicShout` (`Shout` `#138`, `Battle Orders` `#149`, `War Cry` `#154`, `Battle Command` `#155` radial missile ring) | `p52-barbarian-warcries` (`F638`) |
| `0x6FC5EA60` | `118` | `MISSMODE_SrvHit18_Shout_BattleCommand_BattleOrders` (`pSrvHitFunc = 18`: applies BO state `32`, BC state `51`, Shout state `26`) | `p52-barbarian-warcries` (`F653` / self-hit `F638`) |
| `0x6FC6D710` | `425` | `SKILLS_SrvDo016_Valkyrie` (skill `#32`: summons `valkyrie` `#357`, `MonEquip` rare gear, synergy passives, `+20f` AI think) | `p52-amazon-valkyrie` (`F642`) |
| `0x6FC71750` | `346` | `SKILLS_SrvDo056_Golem` (skill `#75` `Clay Golem`: summons `claygolem` `#289` in `S1`, Golem Mastery stats, `+25f` AI think) | `p52-necromancer-poison-golem` (`F637`) |
| `0x6FC70070` | `48` | Golem Mastery passive stat helper called by `SKILLS_SrvDo056_Golem` | `p52-necromancer-poison-golem` (`F637`) |
| `0x6FC718B0` | `476` | `SKILLS_SrvDo031_RaiseSkeleton_Mage` (skill `#70` `Raise Skeleton`: consumes corpse `#10`, spawns `necroskeleton` `#363`) | `p52-necromancer-curses` (`F1517`) |
| `0x6FCC3610` | `448` | `D2GAME_SummonPet` (shared summon unit spawner, cap enforcement, initial mode & `frame + 25` AI event) | `p52-necromancer-poison-golem` (`F637`), `p52-amazon-valkyrie` (`F642`), `p52-necromancer-curses` (`F1517`) |
| `0x6FCC3090` | `129` | Pet count / cap roster helper for `D2GAME_SummonPet` | `p52-necromancer-poison-golem` (`F637`), `p52-amazon-valkyrie` (`F642`), `p52-necromancer-curses` (`F1517`) |
| `0x6FCB7F50` | `273` | Player pet-owner table registration (`PetType.txt` linkage & S2C pet sync) | `p52-necromancer-poison-golem` (`F637`), `p52-amazon-valkyrie` (`F642`), `p52-necromancer-curses` (`F1517`) |
| `0x6FC3E900` | `81` | `AI_NecroPet` (`MonAI` `#67` top-level dispatcher for Golems, Valkyrie, Skeletons) | `p52-amazon-valkyrie` (`F662`), `p52-necromancer-poison-golem` (`F662`), `p52-necromancer-curses` (`F1542`) |
| `0x6FC3E640` | `693` | `AI_NecroPet_Melee` (owner distance check, target acquisition, `80%` `A1` swing vs approach/idle) | `p52-amazon-valkyrie` (`F662`), `p52-necromancer-poison-golem` (`F662`), `p52-necromancer-curses` (`F1542`) |
| `0x6FC3E140` | `655` | `AIPET_CheckFollow` (computes follow threshold & state `0..5` from owner mode/zone/warp pos) | `p52-amazon-valkyrie` (`F662`), `p52-necromancer-poison-golem` (`F662`), `p52-necromancer-curses` (`F1542`) |
| `0x6FC3CAE0` | `2234` | `AIPET_PetMove` (jump-table `0x6FC3D39C` states `0..5`: lead-ahead, `pPlayerData+0xA8` breadcrumb ring, idle wander, leash teleport) | `p52-amazon-valkyrie` (`F662`), `p52-necromancer-poison-golem` (`F662`), `p52-necromancer-curses` (`F1576`) |

---

## Per-Scenario `firstDivergence` Root-Cause Analysis

### 1. `p52-amazon-defense` (`strict F716`, `pos F716` / `1800`, `0` unported VAs)
- **First divergence (`F717`)**: `t1` zombie `#9` (`classId = 5`) `y = 5796` (actual) vs `5795` (golden).
- **Exact root cause**:
  1. At `F715`, `AiZombie` (`D2Game:0x6FCA38B0` @ `0x6FCA3A8C`) starts chase `MONMODE_RUN (15)` with `pAiControl->dwVelocityOverride = 100`. In `D2Common.#10309` (`UNITS_UpdateAnimRateAndVelocity` `0x6FD83330` -> `0x6FD80D50` @ `0x6FD80D7B`), monster base speed is unconditionally `MonStats.Velocity << 8` (`+0x32`, `1 << 8 = 256` -> `dwVelocity = 448`), **never** `MonStats.Run` (`+0x34`). `MONSTER_StartMode113c` (`replay-kernel-113c.ts:1369`) uses `row.run (3)` for `mode === 15`, producing `dwVelocity = 1344` (`3×` too fast) and advancing `y` at `F717` instead of `F721`.
  2. Downstream (`F720..F1800`): hydrate Amazon `.d2s` passives (`Dodge` `#13` state `64` `stat 338`, `Avoid` `#18` state `65` `stat 339`, `Evade` `#29` state `66` `stat 340`, `Critical Strike` `#9` state `68` `stat 337`), wire defender Dodge/Avoid/Evade + `PLRMODE_SEQUENCE` evade animation (`0x6FCFDE90` / `0x6FCFE0C0` / `0x6FC98610`), and wire `stat 337` Critical Strike (`0x6FCFD51A..0x6FCFD5B4`, hit flag `0x2005`) on `F1200..F1750` `C2S 0x06` melee hits.

### 2. `p52-amazon-valkyrie` (`strict F641`, `pos F641` / `1500`, `8` unported `D2Game` VAs)
- **First divergence (`F642`)**: `t0[1].stat8` (`STAT_MANA` `18816` actual vs `12422` golden) and `t1[12]` (`valkyrie` `hcIdx = 357`) missing.
- **Exact root cause**:
  1. `C2S 0x3C` selects `Valkyrie` (skill `#32`) at `F620`; `C2S 0x0C` (`(5664, 5829)`) enters `PLRMODE_CAST (10)` at `F630` (matching `F630..F641`). At the `F642` cast action keyframe (`arg14 == 1`), `SKILLS_DoUsedSkillAction113c` (`replay-kernel-113c.ts:3918-3923`) only dispatches `wDoFuncIdx === 22`, skipping mana consumption (`0x6FCC19A0`) and `wSrvDoFunc = 16` (`SKILLS_SrvDo016_Valkyrie` `0x6FC6D710`).
  2. Port & wire the `8` unported `D2Game` VAs: `0x6FC6D710`, `0x6FCC3610`, `0x6FCC3090`, `0x6FCB7F50` (`F642` summon + `MonEquip.txt` rare gear + synergy passives + `+20f` AI think at `0x6FC6D877`) and `0x6FC3E900`, `0x6FC3E640`, `0x6FC3E140`, `0x6FC3CAE0` (`F662+` `NecroPet` AI + `0x6FC99B90` `pPlayerData+0xA8` breadcrumb ring for `F988` `PetMove` state `1`).

### 3. `p52-barbarian-warcries` (`strict F637`, `pos F637` / `1600`, `2` unported `D2Game` VAs)
- **First divergence (`F638`)**: `t0[1].stat6` (`STAT_HITPOINTS` `136448` actual vs `221045` golden) and `t3[1]` (`battleorders` missile `#237`) missing.
- **Exact root cause**:
  1. `C2S 0x3C` selects `Battle Orders` (`#149`) at `F620`; `C2S 0x0C` starts `PLRMODE_CAST (10)` at `F630`. At the `F638` action keyframe, `SKILLS_DoUsedSkillAction113c` does not dispatch `wSrvDoFunc = 68` (`SKILLS_SrvDo068_BasicShout` `0x6FC49720`), so the radial `battleorders` (`#237`) missile ring is never spawned and `MISSMODE_SrvHit18_Shout_BattleCommand_BattleOrders` (`0x6FC5EA60`, `pSrvHitFunc = 18`) never applies state `32` (`maxhp%` / `maxmana%` / `maxstamina%`).
  2. Port `0x6FC49720` + `0x6FC5EA60` (covering `Battle Orders` `#149` at `F638`, `Battle Command` `#155` state `51` at `F718`, `Shout` `#138` state `26` at `F798`, and `War Cry` `#154` missile `#235` at `F918+`) and wire `MISSMODE_SrvDmg07_Warcry_ShockWave` (`0x6FC59600`, `pSrvDmgFunc = 7`, stun state `21` + physical damage).

### 4. `p52-necromancer-curses` (`strict F629`, `pos F629` / `2000`, `8` unported `D2Game` VAs)
- **First divergence (`F630`)**: `t0[1].mode` `1` (`PLRMODE_NEUTRAL`) actual vs `10` (`PLRMODE_CAST`) golden.
- **Exact root cause**:
  1. `C2S 0x3C` selects `Amplify Damage` (`#66`) at `F620`; `F630` sends **`C2S 0x0D`** (`CS_RIGHTSKILLONUNIT`, `0x6FCEEA40` -> `0x6FCEE690` -> `PLAYER_StartSkillOnTarget` `0x6FC98840`) on zombie `#10`. `applyPlayerPacket113c` (`replay-kernel-113c.ts:3520-3580`) currently ignores `0x0D`.
  2. Downstream (`F630..F2000`): wire `C2S 0x0D` (`0x6FC98840`) + `wSrvDoFunc = 30` (`SKILLS_SrvDo030_Curse` `0x6FC705D0`, already ported) for `Amplify Damage` (`#66`, state `9`), `Decrepify` (`#87`, state `60`), `Lower Resist` (`#91`, state `61`), and `Weaken` (`#72`, state `19`) with curse exclusivity + `Event 12` expiry; melee kill `#10` (`F860..F1500`); then port & wire `Raise Skeleton` (`#70` at `F1510+`, `wSrvStFunc = 15` `0x6FC6EF20`, `wSrvDoFunc = 31` `0x6FC718B0`, `0x6FCC3610`, `0x6FCC3090`, `0x6FCB7F50`, skeleton stat init `0x6FC6EB50`, and `NecroPet` AI `0x6FC3E900` / `0x6FC3E640` / `0x6FC3E140` / `0x6FC3CAE0`).

### 5. `p52-necromancer-poison-golem` (`strict F636`, `pos F636` / `1800`, `9` unported `D2Game` VAs)
- **First divergence (`F637`)**: `t0[1].stat8` (`STAT_MANA` `75008` actual vs `68121` golden) and `t1[12]` (`claygolem` `hcIdx = 289`) missing.
- **Exact root cause**:
  1. `C2S 0x3C` selects `Clay Golem` (`#75`) at `F620`; `C2S 0x0C` (`(5664, 5831)`) starts `PLRMODE_CAST (10)` at `F630`. At the `F637` action keyframe, `SKILLS_DoUsedSkillAction113c` skips mana deduction and `wSrvDoFunc = 56` (`SKILLS_SrvDo056_Golem` `0x6FC71750`).
  2. Port & wire the `9` unported `D2Game` VAs: `0x6FC71750`, `0x6FC70070`, `0x6FCC3610`, `0x6FCC3090`, `0x6FCB7F50` (`F637` Golem summon + `EventFunc27_SlowTarget` `0x6FC6EF70` slow state `24` on hit) and `0x6FC3E900`, `0x6FC3E640`, `0x6FC3E140`, `0x6FC3CAE0` (`F662+` `NecroPet` AI + `0x6FC99B90` breadcrumb ring at `F919`). `Poison Nova` (`#92`, `SrvDo022` `0x6FC63AA0`) + `Event 3` poison DoT (`0x6FC96740`) at `F830+` are already wired.

### 6. `p52-paladin-auras` (`strict F719`, `pos F719` / `1700`, `0` unported VAs)
- **First divergence (`F720`)**: `t0[1].seedLo` (`3081094168` actual vs `4059699577` golden) and `t1[10].mode` (`2` `WL` actual vs `0` `DT` golden).
- **Exact root cause**:
  1. **Mid-swing `C2S 0x06` guard**: `C2S 0x06` (`AttackUnit` on `#10`, sent every `20` frames from `F640`) arrives at `F720` pre-frame while the Paladin is in `PLRMODE_ATTACK1 (7)` (`dwFlags & 0x40 == 0`). `applyPlayerPacket113c` (`replay-kernel-113c.ts:3612-3616`) restarts `startPlayerAttackWithTarget113c` (`MONSTER_ClearModeEvents113c`), deleting the `F720` `arg14 == 1` hit event right before `EVENT_UpdateTimers113c` runs (in `D2Game:0x6FCEE9D0 -> 0x6FC983A0`, `PLRMODE_ATTACK1` cannot be restarted before `UNITFLAG_SKSRVDOFUNC`).
  2. **Player `Event 6` periodic aura (`0x6FCC00B0` -> `SKILLS_SrvDo065_BasicAura` `0x6FCBA8D0`)**: `C2S 0x3C` schedules player timer `evType = 6` at `F620` (`Concentration` `#113`, state `42`) and `F1100` (`Fanaticism` `#122`, state `49`), which `stepFallenSliceFrame113c` (`replay-kernel-113c.ts:3875-3946`) currently ignores; wiring `evType === 6` applies `+damagepercent` (`stat 25`), `+item_tohit_percent` (`stat 119`), and `+attackrate` (`stat 68`) needed for the `3361` raw `<<8` one-shot kill at `F720` and `F1100+` Fanaticism swings.

### 7. `p52-paladin-merc-aura` (`strict F2`, `pos F2` / `1700`, `2` unported `D2Game` VAs)
- **First divergence (`F3`)**: `t1[1].mode` (`1` `NU` actual vs `2` `WL` golden) on hired Act 1 Rogue Scout (`roguehire` `hcIdx = 271`).
- **Exact root cause**:
  1. Rogue `#1` spawns with `MON_EVENT_AI_THINK` (`Event 2`) scheduled at `F3`. Both unported `D2Game` VAs in the scenario fire at `F3`: `0x6FC3DD40` (`AI_Hireable`) and `0x6FC3D3C0` (`AI_Hireable_Sub`).
  2. Port & wire `0x6FC3DD40` / `0x6FC3D3C0`, wire Rogue skill casts `#8 Inner Sight` (`SKILLS_SrvDo006` `0x6FC6C2A0`, state `17`) and `#11 Cold Arrow` (`SKILLS_SrvDo110_Hireable_RogueMissile` `0x6FCD49F0` -> `coldarrow` `#40` `MISSMODE_SrvDmg01` `0x6FC59CE0`), wire mercenary kill XP split (`2 + 1` in `0x6FCFC030`), and wire Paladin `Event 6` (`0x6FCC00B0` -> `0x6FCBA8D0`) radial party aura onto friendly mercenary `#1` (`Concentration` `#113` state `42`, `Fanaticism` `#122` state `49`).

### 8. `p52-sorceress-elemental` (`strict F629`, `pos F629` / `1800`, `0` unported VAs)
- **First divergence (`F630`)**: `t0[1].mode` `1` (`PLRMODE_NEUTRAL`) actual vs `10` (`PLRMODE_CAST`) golden.
- **Exact root cause**:
  1. `C2S 0x3C` selects `Fire Ball` (`#47`) at `F620`; `F630` sends **`C2S 0x0D`** (`CS_RIGHTSKILLONUNIT`, `0x6FCEEA40` -> `0x6FC98840`) on zombie `#9`, which `applyPlayerPacket113c` ignores.
  2. Wire `C2S 0x0D` (`0x6FC98840`), `SKILLS_DoUsedSkillAction113c` mana deduction + missile-cast `SrvDo` handlers, and `MISSILE_DispatchFrameTick113c` `SrvDo` / `SrvHit` callbacks (all already ported in `src/d2kern-113c/game/`): `Fire Ball` (`#47` -> `fireball` `#62` `MISSMODE_SrvHit01` `0x6FC5B990`), `Chain Lightning` (`#53` `SKILLS_SrvDo026` `0x6FC63720` -> `chainlightning` `#93` `MISSMODE_SrvHit12` `0x6FC5D020`), `Frozen Orb` (`#64` -> `frozenorb` `#260` `MISSMODE_SrvDo15` `0x6FC60CA0` + `MISSMODE_SrvHit29` `0x6FC5C850` -> `frozenorbnova` `#262` `MISSMODE_SrvDo16` `0x6FC60BD0`), and `Glacial Spike` (`#55` -> `glacialspike` `#96` `MISSMODE_SrvHit13` `0x6FC5B3E0`).

### 9. `p52-sorceress-fire-dot` (`strict F635`, `pos F635` / `1800`, `0` unported VAs)
- **First divergence (`F636`)**: `t0[1].stat8` (`STAT_MANA` `77568` actual vs `69664` golden) and `t3[1]` (`firewallmaker` `#68`) missing.
- **Exact root cause**:
  1. `C2S 0x3C` selects `Fire Wall` (`#51`) at `F620`; `C2S 0x0C` (`(5662, 5794)`) enters `PLRMODE_CAST (10)` at `F630` (matching `F630..F635`). At the `F636` action keyframe, `SKILLS_DoUsedSkillAction113c` skips mana deduction (`31 << 8`) and `wSrvDoFunc = 24` (`SKILLS_SrvDo024_FireWall` `0x6FC637D0`).
  2. Wire `SKILLS_SrvDo024_FireWall` (`0x6FC637D0` + `skilldelay` state `121`), `MISSMODE_SrvDo06_FireWallMaker` (`0x6FC61850`), `MISSMODE_SrvDo05_FireWall` (`0x6FC61980`), and `MISSMODE_SrvDmg03_FireWall` (`0x6FC59670`) for `F636..F899`; then wire `C2S 0x0D` + `PLRMODE_SEQUENCE (14)` channeling (`SKILLS_SrvSt11_Inferno_ArcticBlast` `0x6FC64550` setting `STATE_INFERNO` `85`, `SKILLS_SrvDo019_Inferno_ArcticBlast` `0x6FC64390` spawning `infernoflame1` `#65` and draining per-tick mana) for `Inferno` (`#41`) at `F900..F1300`.

---

## Committed Fixtures (`tests/fixtures/oracle/k3/replay/`)

| File | Gzip Bytes | Raw Bytes | SHA-256 (Gzip) |
|---|---:|---:|---|
| `p52-amazon-defense.snap-f002.ndjson.gz` | `28,156` | `620,631` | `ceef3e26ea4964bb0d7838f388d6ff9529ef24d411f948196d48ba056b0c1a2a` |
| `p52-amazon-valkyrie.snap-f002.ndjson.gz` | `28,155` | `620,631` | `bf35615693a5030adaa54db144020ee10cc8e4e207aed3839ce9376747d101c3` |
| `p52-barbarian-warcries.snap-f002.ndjson.gz` | `27,828` | `619,235` | `ea6f058c2adf6e348754dd1d579e0feb8037fb9a6dc427443cd5cafe2cd404af` |
| `p52-necromancer-curses.snap-f002.ndjson.gz` | `27,610` | `616,396` | `4a6c992f7d31ea272c3d75b064192a94d05b1bafc1d1afabfd80777ad610e3dd` |
| `p52-necromancer-poison-golem.snap-f002.ndjson.gz` | `27,624` | `616,396` | `105ac71370143a464cb6a63c44362d21d476623d930c7d31f08db785e9105329` |
| `p52-paladin-auras.snap-f002.ndjson.gz` | `27,946` | `619,765` | `5d754d364d1670994a40e024caa16d03bb35d669f0d75d44a4defe70933a2445` |
| `p52-paladin-merc-aura.snap-f002.ndjson.gz` | `28,354` | `624,013` | `71e7118af1fe355e1bc90c3ea43e9e213ef78ef1e74b055d921fdddf7522412b` |
| `p52-sorceress-elemental.snap-f002.ndjson.gz` | `27,754` | `616,757` | `b62c41888d8595debd4241123fef29ef4c83411dc3bd9fa4aeedaaa6827eae5d` |
| `p52-sorceress-fire-dot.snap-f002.ndjson.gz` | `27,709` | `616,492` | `aed7b57697fcf7cb1e61e7b97b622bfb43926f7dafa213ee5f790a6bbdb5c663` |
| `p52-amazon-defense.coverage.ndjson.gz` | `3,792` | `39,775` | `74e41c65e0835700d14d88d89308d8b015c3f47ba5f6c545ac9094853b4f64f0` |
| `p52-amazon-valkyrie.coverage.ndjson.gz` | `4,390` | `46,992` | `c8240307a1b36ab0de6464ff86ea7bf08a641ad471c7515e59ecb8720368ee86` |
| `p52-barbarian-warcries.coverage.ndjson.gz` | `4,274` | `44,596` | `9430f6dc66f6e44b7dfc082d8dedb74df3e45c01c15f0ff8c8e679f4a905446f` |
| `p52-necromancer-curses.coverage.ndjson.gz` | `4,537` | `47,371` | `22c5b52ba8d571d8ce43d56ae069f72d523082e1eb3900ff52913b18af9dbf92` |
| `p52-necromancer-poison-golem.coverage.ndjson.gz` | `4,491` | `46,894` | `53d35acbb923a05dfcb767618ba594838582a2d4dc9c6c1f565b38e3b2184c41` |
| `p52-paladin-auras.coverage.ndjson.gz` | `4,198` | `44,918` | `f8f47ec494f53ca0c6cdd4c938831b77df028caea37e704ad74b4565b26ec35e` |
| `p52-paladin-merc-aura.coverage.ndjson.gz` | `4,735` | `50,171` | `d80ae2c55fa801878e4ee0f3a4d952d61e7971f00375c854a2e16e6204485be7` |
| `p52-sorceress-elemental.coverage.ndjson.gz` | `3,868` | `40,852` | `b0bc6875ce3d3e134e2db4610d62de8caf858d18228a99890d56a3194abdff07` |
| `p52-sorceress-fire-dot.coverage.ndjson.gz` | `3,759` | `40,103` | `448fbe2523f648d8f66a603c2db5f1b6aaa82422acde9e4c2a577e4afc8bb51f` |
