# K3 kernel replay: p52-necromancer-poison-golem

| | |
|---|---|
| Boot snapshot | F2 (`105ac71370143a46…`) |
| Golden | F1..F1800 (`1b2af91a11215851…`) |
| Boot check (hydrated F2 vs golden, strict) | identical |
| Strict horizon (all fields incl. seeds, stats) | F636 |
| Position horizon (id/class/mode/x/y) | F636 |
| Kernel frames matched | 634 of 1798 |

## First strict divergence

- frame: F637
- key: `t0`
- unit id: 1
- field: `stat8`
- expected: `68121`
- actual: `75008`

## First position divergence

- frame: F637
- key: `t1`
- unit id: 12
- field: `presence`
- expected: `[12,289,8,5664,5831,3798512748,41304058,2,0,0,0,0,73728,73728,0,0,0,0,35,0,0,0]`
- actual: `null`

## Root-cause analysis (`D2Game.dll` VAs & handlers)

- **Immediate `F637` root cause (`9` unported `D2Game` VAs)**: `C2S 0x3C` selects `Clay Golem` (skill `#75`) at `F620` and `C2S 0x0C` starts `PLRMODE_CAST (10)` at `F630`. On the `F637` cast keyframe (`arg14 == 1`), `SKILLS_DoUsedSkillAction113c` skips mana deduction (`75008 -> 68121`) and `wSrvDoFunc = 56` (`SKILLS_SrvDo056_Golem` `0x6FC71750`).
- **Dynamic `D2Game` gap VAs (`gap-p52-necromancer-poison-golem.md`)**: `F637` summon chain `0x6FC71750` (`SKILLS_SrvDo056_Golem`), `0x6FC70070` (Golem Mastery passive bonus), `0x6FCC3610` (`D2GAME_SummonPet`), `0x6FCC3090`, `0x6FCB7F50` (spawns `claygolem` `hcIdx = 289` unit `#12` in mode `8` `S1` with `EventFunc27_SlowTarget` `0x6FC6EF70` on melee hit and `+25` frame first AI think at `F662`); `F662` `NecroPet` AI `0x6FC3E900`, `0x6FC3E640`, `0x6FC3E140`, `0x6FC3CAE0` (including breadcrumb-ring follow at `F919`). `Poison Nova` (`#92`, `SrvDo022` `0x6FC63AA0`) + `Event 3` poison ticks (`0x6FC96740`) at `F830+` are already wired.

## Golden context

| frame | row |
|---|---|
| F634 | `[1,2,10,5664,5837,3081094168,666,2,15,120,25,115,77696,77696,75008,75008,55808,55808,40,18000000,0,0]` |
| F635 | `[1,2,10,5664,5837,3081094168,666,2,15,120,25,115,77696,77696,75008,75008,55808,55808,40,18000000,0,0]` |
| F636 | `[1,2,10,5664,5837,3081094168,666,2,15,120,25,115,77696,77696,75008,75008,55808,55808,40,18000000,0,0]` |
| F637 | `[1,2,10,5664,5837,3081094168,666,2,15,120,25,115,77696,77696,68121,75008,55808,55808,40,18000000,0,0]` |
