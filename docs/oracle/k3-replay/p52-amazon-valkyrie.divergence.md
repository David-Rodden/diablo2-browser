# K3 kernel replay: p52-amazon-valkyrie

| | |
|---|---|
| Boot snapshot | F2 (`bf35615693a5030a…`) |
| Golden | F1..F1500 (`85d55018e01eb489…`) |
| Boot check (hydrated F2 vs golden, strict) | identical |
| Strict horizon (all fields incl. seeds, stats) | F641 |
| Position horizon (id/class/mode/x/y) | F641 |
| Kernel frames matched | 639 of 1498 |

## First strict divergence

- frame: F642
- key: `t0`
- unit id: 1
- field: `stat8`
- expected: `12422`
- actual: `18816`

## First position divergence

- frame: F642
- key: `t1`
- unit id: 12
- field: `presence`
- expected: `[12,357,1,5664,5829,1470782001,937853370,2,27,0,12,0,143616,143616,0,1280,0,0,31,0,0,0]`
- actual: `null`

## Root-cause analysis (`D2Game.dll` VAs & handlers)

- **Immediate `F642` root cause (`8` unported `D2Game` VAs)**: `C2S 0x3C` selects `Valkyrie` (skill `#32`) at `F620` and `C2S 0x0C` starts `PLRMODE_CAST (10)` at `F630`. On the `F642` cast keyframe (`arg14 == 1`), `SKILLS_DoUsedSkillAction113c` (`replay-kernel-113c.ts:3918-3923`) only dispatches `wDoFuncIdx === 22`, skipping mana deduction (`0x6FCC19A0`, `18816 -> 12422`) and `wSrvDoFunc = 16` (`SKILLS_SrvDo016_Valkyrie` `0x6FC6D710`).
- **Dynamic `D2Game` gap VAs (`gap-p52-amazon-valkyrie.md`)**: `F642` summon chain `0x6FC6D710` (`SKILLS_SrvDo016_Valkyrie`), `0x6FCC3610` (`D2GAME_SummonPet`), `0x6FCC3090`, `0x6FCB7F50` (spawns `valkyrie` `hcIdx = 357` unit `#12` with `MonEquip.txt` rare gear, synergy passives, and `+20` frame initial AI event at `0x6FC6D877`); `F662` `NecroPet` AI (`MonAI` `#67`) `0x6FC3E900` (`AI_NecroPet`), `0x6FC3E640` (`AI_NecroPet_Melee`), `0x6FC3E140` (`AIPET_CheckFollow`), `0x6FC3CAE0` (`AIPET_PetMove`, including state `1` breadcrumb-ring follow at `F988` reading `pPlayerData+0xA8` written by `0x6FC99B90`).

## Golden context

| frame | row |
|---|---|
| F639 | `[1,0,10,5664,5837,3081094168,666,2,70,15,70,120,109568,109568,18816,18816,57088,57088,40,18000000,0,0]` |
| F640 | `[1,0,10,5664,5837,3081094168,666,2,70,15,70,120,109568,109568,18816,18816,57088,57088,40,18000000,0,0]` |
| F641 | `[1,0,10,5664,5837,3081094168,666,2,70,15,70,120,109568,109568,18816,18816,57088,57088,40,18000000,0,0]` |
| F642 | `[1,0,10,5664,5837,3081094168,666,2,70,15,70,120,109568,109568,12422,18816,57088,57088,40,18000000,0,0]` |
