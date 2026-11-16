# K3 kernel replay: p52-sorceress-elemental

| | |
|---|---|
| Boot snapshot | F2 (`b62c41888d8595de…`) |
| Golden | F1..F1800 (`efd9d548f79c950f…`) |
| Boot check (hydrated F2 vs golden, strict) | identical |
| Strict horizon (all fields incl. seeds, stats) | F629 |
| Position horizon (id/class/mode/x/y) | F629 |
| Kernel frames matched | 627 of 1798 |

## First strict divergence

- frame: F630
- key: `t0`
- unit id: 1
- field: `mode`
- expected: `10`
- actual: `1`

## Root-cause analysis (`D2Game.dll` VAs & handlers)

- **Immediate `F630` root cause (`0` unported manifest VAs)**: `C2S 0x3C` selects `Fire Ball` (skill `#47`) at `F620`, and `F630` sends `C2S 0x0D` (`CS_RIGHTSKILLONUNIT`, `0x6FCEEA40` -> `PLAYER_StartSkillOnTarget` `0x6FC98840`) targeting zombie `#9`. `applyPlayerPacket113c` ignores `0x0D`, leaving the Sorceress in `PLRMODE_NEUTRAL (1)` instead of `PLRMODE_CAST (10)`.
- **Downstream ported handlers to wire (`0` unported VAs)**: Wire `C2S 0x0D` (`0x6FC98840`), `SKILLS_DoUsedSkillAction113c` mana deduction + missile-cast `SrvDo` dispatch, and `MISSILE_DispatchFrameTick113c` `SrvDo`/`SrvHit` handlers: `Fire Ball` (`#47`, `fireball` `#62` -> `MISSMODE_SrvHit01_Fireball` `0x6FC5B990` radial fire splash `F630..F899`), `Chain Lightning` (`#53`, `SKILLS_SrvDo026_ChainLightning` `0x6FC63720` -> `chainlightning` `#93` `MISSMODE_SrvHit12` `0x6FC5D020` `F900..F1149`), `Frozen Orb` (`#64`, `frozenorb` `#260` `MISSMODE_SrvDo15` `0x6FC60CA0` + `MISSMODE_SrvHit29` `0x6FC5C850` -> `frozenorbnova` `#262` `MISSMODE_SrvDo16` `0x6FC60BD0` `F1150..F1399`), and `Glacial Spike` (`#55`, `glacialspike` `#96` `MISSMODE_SrvHit13` `0x6FC5B3E0` radial freeze `F1400..F1650`).

## Golden context

| frame | row |
|---|---|
| F627 | `[1,1,1,5664,5837,3081094168,666,2,10,130,25,110,71424,71424,77568,77568,54528,54528,40,18000000,0,0]` |
| F628 | `[1,1,1,5664,5837,3081094168,666,2,10,130,25,110,71424,71424,77568,77568,54528,54528,40,18000000,0,0]` |
| F629 | `[1,1,1,5664,5837,3081094168,666,2,10,130,25,110,71424,71424,77568,77568,54528,54528,40,18000000,0,0]` |
| F630 | `[1,1,10,5664,5837,3081094168,666,2,10,130,25,110,71424,71424,77568,77568,54528,54528,40,18000000,0,0]` |
