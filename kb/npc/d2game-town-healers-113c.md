# 1.13c Town Healer NPCs (`0x6FCDCBE0` / `0x6FCDC920` / D2Common #10590)

## Overview & Architecture

In Diablo II: Lord of Destruction v1.13c, town healer NPCs (Akara in Act 1, Fara in Act 2, Ormus in Act 3, Jamella in Act 4, and Malah in Act 5) provide life restoration and curse/poison/freeze curing upon opening their interaction menu or explicitly selecting "Heal".

## Binary Ground Truth

### 1. Healer Execution Function: `D2Game.dll` `0x6FCDCBE0`

Disassembly from `samples/d2/D2Game.dll`:
```assembly
6fcdcbe0: push ebx
6fcdcbe1: mov ebx, [esp+8]             ; Unit* pUnit (player or mercenary)
6fcdcbe5: push esi
6fcdcbe6: push edi
6fcdcbe7: push 0
6fcdcbe9: push 6                       ; STAT_HITPOINTS (stat 6)
6fcdcbeb: push ebx
6fcdcbec: call 0x6fc2a42a              ; STATLIST_UnitGetStatValue(pUnit, 6, 0) -> current HP
6fcdcbf1: push ebx
6fcdcbf2: mov esi, eax
6fcdcbf4: call 0x6fc2a3a0              ; STATLIST_GetMaxLife(pUnit) -> max HP
6fcdcbf9: cmp esi, eax
6fcdcbfb: mov edi, [esp+0x14]          ; BOOL* pbUsed
6fcdcbff: jge 0x6fcdcc0f
6fcdcc01: push 0
6fcdcc03: push eax                     ; max HP
6fcdcc04: push 6                       ; STAT_HITPOINTS
6fcdcc06: push ebx
6fcdcc07: call 0x6fc2a472              ; STATLIST_SetUnitStat(pUnit, 6, maxHp, 0)
6fcdcc0c: mov byte ptr [edi], 1        ; *pbUsed = 1
6fcdcc0f: call 0x6fcdc920              ; clearCurableStates(pUnit)
6fcdcc14: test eax, eax
6fcdcc16: je 0x6fcdcc1b
6fcdcc18: mov byte ptr [edi], 1
6fcdcc1b: push 2                       ; STATE_POISON
6fcdcc1d: push ebx
6fcdcc1e: call 0x6fc2a5d4              ; find state 2
...
6fcdcc39: push 1                       ; STATE_FREEZE
6fcdcc3b: push ebx
6fcdcc3c: call 0x6fc2a5d4              ; find state 1
...
6fcdcc57: pop edi
6fcdcc58: pop esi
6fcdcc59: pop ebx
6fcdcc5a: ret 8
```

Key observations:
1. **Health Only**: Healers compare `STAT_HITPOINTS` with max HP and restore health. **Neither Mana (stat 8) nor Stamina (stat 10) is restored by town healers in 1.13c**. (Wells, by contrast, restore 50% HP, Mana, and Stamina via `0x6fc8a560`).
2. **Mercenary & Pet Healing**: Town healer interaction dispatches `0x6FCDCBE0` via `sub_6FCB6AF0` to both the player and their active mercenary/summons.
3. **Curable States Dispatch**: `0x6FCDC920` iterates all states in `States.txt` and calls D2Common ordinal #10590. If true, the state is cleared. Afterwards, state 2 (`STATE_POISON`) and state 1 (`STATE_FREEZE`) are explicitly checked and removed.

### 2. Curable States Bitmask: D2Common Ordinal #10590 & `States.txt`

D2Common #10590 checks the bitmask compiled from the `curable` column in `States.txt`:
```
stateId >> 5, bit (stateId & 0x1F) in sgptDataTables->pStatesCurableBitmask
```

In 1.13c `States.txt`, exactly 13 states have `curable == 1`:
- `9` (`amplifydamage`)
- `19` (`weaken`)
- `23` (`dimvision`)
- `27` (`taunt`)
- `55` (`ironmaiden`)
- `56` (`terror`)
- `57` (`attract`)
- `58` (`lifetap`)
- `59` (`confuse`)
- `60` (`decrepify`)
- `61` (`lowerresist`)
- `113` (`defense_curse`)
- `114` (`blood_mana`)

Combined with `STATE_FREEZE` (1) and `STATE_POISON` (2), the complete set of states cured by 1.13c healers and wells is:
`[1, 2, 9, 19, 23, 27, 55, 56, 57, 58, 59, 60, 61, 113, 114]`.

Non-curable states (such as `11` Cold slow, `17` Inner Sight, `28`/`29` Conviction, `89` Battle Cry, `156` Cloaked) are NOT cleared by town healers.
