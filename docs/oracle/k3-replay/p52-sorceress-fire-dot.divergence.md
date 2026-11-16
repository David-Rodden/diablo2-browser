# K3 kernel replay: p52-sorceress-fire-dot

| | |
|---|---|
| Boot snapshot | F2 (`aed7b57697fcf7cb…`) |
| Golden | F1..F1800 (`2aea1b8ec7b7786f…`) |
| Boot check (hydrated F2 vs golden, strict) | identical |
| Strict horizon (all fields incl. seeds, stats) | F635 |
| Position horizon (id/class/mode/x/y) | F635 |
| Kernel frames matched | 633 of 1798 |

## First strict divergence

- frame: F636
- key: `t0`
- unit id: 1
- field: `stat8`
- expected: `69664`
- actual: `77568`

## First position divergence

- frame: F636
- key: `t3`
- unit id: 1
- field: `presence`
- expected: `[1,68,8,5662,5794,957346431,666,-1]`
- actual: `null`

## Root-cause analysis (`D2Game.dll` VAs & handlers)

- **Immediate `F636` root cause (`0` unported manifest VAs)**: `C2S 0x3C` selects `Fire Wall` (skill `#51`) at `F620` and `C2S 0x0C` (`(5662, 5794)`) enters `PLRMODE_CAST (10)` at `F630` (strictly matching `F630..F635`). On the `F636` cast keyframe (`arg14 == 1`), `SKILLS_DoUsedSkillAction113c` (`replay-kernel-113c.ts:3918-3923`) skips mana deduction (`77568 -> 69664`, `31 << 8`) and `wSrvDoFunc = 24` (`SKILLS_SrvDo024_FireWall` `0x6FC637D0`, spawning `firewallmaker` `#68` + `firewall` `#69` and applying `skilldelay` state `121`).
- **Downstream ported handlers to wire (`0` unported VAs)**: Wire `SKILLS_SrvDo024_FireWall` (`0x6FC637D0`), `MISSMODE_SrvDo06_FireWallMaker` (`0x6FC61850`), `MISSMODE_SrvDo05_FireWall` (`0x6FC61980`), and `MISSMODE_SrvDmg03_FireWall` (`0x6FC59670`) for `F636..F899`; then wire `C2S 0x0D` + `PLRMODE_SEQUENCE (14)` channeling (`SKILLS_SrvSt11_Inferno_ArcticBlast` `0x6FC64550` setting `STATE_INFERNO` `85`, `SKILLS_SrvDo019_Inferno_ArcticBlast` `0x6FC64390` spawning `infernoflame1` `#65` and draining per-tick mana) for `Inferno` (`#41`) on zombie `#11` at `F900..F1300`.

## Golden context

| frame | row |
|---|---|
| F633 | `[1,1,10,5664,5837,3081094168,666,2,10,130,25,110,71424,71424,77568,77568,54528,54528,40,18000000,0,0]` |
| F634 | `[1,1,10,5664,5837,3081094168,666,2,10,130,25,110,71424,71424,77568,77568,54528,54528,40,18000000,0,0]` |
| F635 | `[1,1,10,5664,5837,3081094168,666,2,10,130,25,110,71424,71424,77568,77568,54528,54528,40,18000000,0,0]` |
| F636 | `[1,1,10,5664,5837,3081094168,666,2,10,130,25,110,71424,71424,69664,77568,54528,54528,40,18000000,0,0]` |
