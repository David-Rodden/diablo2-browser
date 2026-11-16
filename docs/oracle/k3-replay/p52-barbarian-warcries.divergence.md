# K3 kernel replay: p52-barbarian-warcries

| | |
|---|---|
| Boot snapshot | F2 (`ea6f058c2adf6e34…`) |
| Golden | F1..F1600 (`e1acd441aa6a6b81…`) |
| Boot check (hydrated F2 vs golden, strict) | identical |
| Strict horizon (all fields incl. seeds, stats) | F637 |
| Position horizon (id/class/mode/x/y) | F637 |
| Kernel frames matched | 635 of 1598 |

## First strict divergence

- frame: F638
- key: `t0`
- unit id: 1
- field: `stat6`
- expected: `221045`
- actual: `136448`

## First position divergence

- frame: F638
- key: `t3`
- unit id: 1
- field: `presence`
- expected: `[1,237,3,5664,5837,482075391,666,-1]`
- actual: `null`

## Root-cause analysis (`D2Game.dll` VAs & handlers)

- **Immediate `F638` root cause (`2` unported `D2Game` VAs)**: `C2S 0x3C` selects `Battle Orders` (skill `#149`) at `F620` and `C2S 0x0C` starts `PLRMODE_CAST (10)` at `F630`. On the `F638` cast keyframe (`arg14 == 1`), `SKILLS_DoUsedSkillAction113c` skips `wSrvDoFunc = 68` (`SKILLS_SrvDo068_BasicShout` `0x6FC49720`), so the radial `battleorders` missile ring (`Missiles.txt` `#237`) is not spawned and `MISSMODE_SrvHit18_Shout_BattleCommand_BattleOrders` (`0x6FC5EA60`, `pSrvHitFunc = 18`) never applies state `32` (`maxhp%` scaling HP `136448 -> 221045`).
- **Downstream handlers (`F638..F1600`)**: Port & wire `0x6FC49720` (`SrvDo068` for `Battle Orders` `#149` at `F638`, `Battle Command` `#155` state `51` at `F718`, `Shout` `#138` state `26` at `F798`, and `War Cry` `#154` missile `#235` at `F918+`), port `0x6FC5EA60` (`SrvHit18`), and wire `MISSMODE_SrvDmg07_Warcry_ShockWave` (`0x6FC59600`, `pSrvDmgFunc = 7`, stun state `21` + physical damage) before `F1100+` `C2S 0x06` melee.

## Golden context

| frame | row |
|---|---|
| F635 | `[1,4,10,5664,5837,3081094168,666,2,80,10,65,125,136448,136448,12544,12544,59136,59136,40,18000000,0,0]` |
| F636 | `[1,4,10,5664,5837,3081094168,666,2,80,10,65,125,136448,136448,12544,12544,59136,59136,40,18000000,0,0]` |
| F637 | `[1,4,10,5664,5837,3081094168,666,2,80,10,65,125,136448,136448,12544,12544,59136,59136,40,18000000,0,0]` |
| F638 | `[1,4,10,5664,5837,3081094168,666,2,80,10,65,125,221045,221045,18535,20321,95800,95800,40,18000000,0,0]` |
