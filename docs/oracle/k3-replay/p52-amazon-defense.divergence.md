# K3 kernel replay: p52-amazon-defense

| | |
|---|---|
| Boot snapshot | F2 (`ceef3e26ea4964bb…`) |
| Golden | F1..F1800 (`53bc82effecbc59a…`) |
| Boot check (hydrated F2 vs golden, strict) | identical |
| Strict horizon (all fields incl. seeds, stats) | F716 |
| Position horizon (id/class/mode/x/y) | F716 |
| Kernel frames matched | 714 of 1798 |

## First strict divergence

- frame: F717
- key: `t1`
- unit id: 9
- field: `y`
- expected: `5795`
- actual: `5796`

## Root-cause analysis (`D2Game.dll` VAs & handlers)

- **Immediate `F717` root cause (`0` unported manifest VAs)**: At `F715`, `AiZombie` (`D2Game:0x6FCA38B0` @ `0x6FCA3A8C`) enters chase mode `MONMODE_RUN (15)` with `pAiControl->dwVelocityOverride = 100`. `D2Common.#10309` (`UNITS_UpdateAnimRateAndVelocity` `0x6FD83330` -> `0x6FD80D50` @ `0x6FD80D7B`) **always** reads `MonStats.Velocity << 8` (`+0x32`, `1 << 8 = 256` -> `dwVelocity = 448`), never `MonStats.Run` (`+0x34`). `MONSTER_StartMode113c` (`replay-kernel-113c.ts:1369`) uses `row.run (3)` for `mode === 15`, setting `dwVelocity = 1344` and stepping zombie `#9` to `y = 5796` at `F717` instead of `F721`.
- **Downstream combat handlers (`F717..F1800`)**: Hydrate Amazon `.d2s` passive skills/states (`64` Dodge `stat 338`, `65` Avoid `stat 339`, `66` Evade `stat 340`, `68` Critical Strike `stat 337`), wire defender Dodge/Avoid/Evade rolls + `S1` evade animation (`0x6FCFDE90` / `0x6FCFE0C0` / `0x6FC98610`), and wire attacker `stat 337` Critical Strike roll (`0x6FCFD51A..0x6FCFD5B4`, hit flag `0x2005`) during `F1200..F1750` `C2S 0x06` melee attacks.

## Golden context

| frame | row |
|---|---|
| F714 | `[9,5,2,5664,5795,1784359962,602803060,2,0,0,0,0,2304,2304,0,0,0,0,1,33,0,0]` |
| F715 | `[9,5,15,5664,5795,620862326,744242924,2,0,0,0,0,2304,2304,0,0,0,0,1,33,0,0]` |
| F716 | `[9,5,15,5664,5795,620862326,744242924,2,0,0,0,0,2304,2304,0,0,0,0,1,33,0,0]` |
| F717 | `[9,5,15,5664,5795,620862326,744242924,2,0,0,0,0,2304,2304,0,0,0,0,1,33,0,0]` |
