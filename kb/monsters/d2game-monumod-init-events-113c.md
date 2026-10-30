# D2Game.dll 1.13c MonUMod Init/Event Dispatch & Booster/Hazard Shrine Parity

## 1. MonUMod Init & Event Handler Table (`D2Game.dll` `0x6FD137D0`)

Each `MonUMod.txt` ID dispatches an initialization handler (`fpInit` at `0x6FC41BE0`) and up to 7 unit-event callbacks (`ev1..ev7`):

| `MonUMod` ID | Code | `fpInit` / Event Address | 1.13c Binary Behavior |
| --- | --- | --- | --- |
| `5` | `strong` (`Extra Strong`) | `0x6FC41DF0` | Boss `+150%` physical damage (`2.5x`), minion `+75%` (`1.75x`), `+25%` AR. |
| `6` | `fast` (`Extra Fast`) | `0x6FC41FA0` | Walk/run velocity bonus (`+10` / `~1.4x`), boss `+100%` attack rate (`STAT_ITEM_FASTERATTACKRATE`). |
| `7` | `cursed` (`Cursed`) | `0x6FC44250` (`ev4`) | Does **not** increase physical damage on init. On physical hit (`ev4`), rolls `rand(100) < 75` (`75%` chance) to cast `#66 Amplify Damage` (`state 9`, `damageresist: -100`) at `slvl = floor(mlvl / 5) + 1`, duration `(200 + 75 * (slvl - 1)) * (100 - curse_resistance) / 100` frames, clearing mutually exclusive curses. |
| `8` | `resist` (`Magic Resistant`) | `0x6FCCF610` | Adds `+40%` Fire, `+40%` Lightning, `+40%` Cold resistance sequentially while total immunities `< 2`. Does **not** scale HP or physical damage. |
| `9` | `fire` (`Fire Enchanted`) | `0x6FC42740` (`fpInit`), `0x6FC460D0` (`ev6`) | Adds `+75%` Fire resist (subject to 2-immunity cap) and `+66%..+100%` (`+33%..+50%` minion) of base physical `minDmg..maxDmg` as Fire damage on physical attacks. Does **not** scale base physical damage. |
| `16` | `champion` (`Champion`) | `0x6FC42DA0` | `+2` mlvl, `3.0x / 2.5x / 2.0x` HP (`N / NM / H`), `2.0x / 1.75x / 1.5x` physical damage (`WillOWisp` `hcIdx 118` exception at `0x6FC42D70`: `1.5x` in Normal), `+120% / +75% / +75%` AR, `+20%` velocity, `0.5x` AI delay. |
| `17` | `lightning` (`Lightning Enchanted`) | `0x6FC42600` (`fpInit`), `0x6FC45560` (`ev2`) | Adds `+75%` Lightning resist (subject to 2-immunity cap), `+66%..+100%` (`+33%..+50%` minion) Lightning damage on physical attacks, and 8-bolt `#195 lightunique` Charged Bolt ring on struck. Does **not** scale base physical damage. |
| `18` | `cold` (`Cold Enchanted`) | `0x6FC42880` (`fpInit`), `0x6FC45380` (`ev6`) | Adds `+75%` Cold resist (subject to 2-immunity cap), `+66%..+100%` (`+33%..+50%` minion) Cold damage + chill on hit, and death Frost Nova. Does **not** scale base physical damage. |
| `25` | `manahit` (`Mana Burn`) | `0x6FC421D0` / `0x6FC422DD` | Boss `+20%` Magic resist and `+75%` AR (`1.75x`). Drains `66%..100%` (`33%..50%` minion) of base physical damage as mana (`STAT_MANADRAINMINDAM` / `MAXDAM`); melee hits execute an extra `shl esi, 0x8` (`0x6FC422DD`), multiplying mana drain by `256x` relative to ranged missiles. |
| `26` | `teleport` (`Teleportation`) | `0x6FC441B0` / `0x6FCBCDE0` | Does **not** boost walk/run speed. Casts `#184 MonTeleport` when `hp * 100 < maxHp * 30` (`0x6FCBCEB5`: `cmp eax, 0x1e`), when distance `>= 12`, or when melee approach is blocked (`60`-frame cooldown). When `hp < 30%` and neither `STATE_PREVENTHEAL (52)` (`stat 117 item_preventheal`) nor active DoT (`state 2` poison / `state 62` openwounds) is present, rolls `rand(100) < 25` (`0x6FCBCF61`: `cmp eax, 0x19`) to heal `floor(maxHp / 4)`. |
| `27` | `spectralhit` (`Spectral Hit`) | `0x6FC42430` | Boss `+20%` Fire/Lightning/Cold resist (if `< 75` and `< 2` immunities) and `+20%` AR; rolls random elemental rider (`fire` / `ltng` / `mag` / `cold` / `pois`) at `+66%..+100%` (`+33%..+50%` minion). Does **not** scale base physical damage. |
| `28` | `stoneskin` (`Stone Skin`) | `0x6FC41C09` | Boss `2x` Defense (`+100%` `STAT_ARMORCLASS`) and `+50%` Physical resist (`STAT_DAMAGERESIST`). Does **not** multiply HP (`1x` HP). |
| `29` | `multishot` (`Multiple Shots`) | `0x6FC45AD0` (`ev5`) | Spawns `+2` angled fan projectiles (`3` total) on ranged monster missile launches (mode missiles, skill missiles, and MSLE `#195 lightunique`) for both unique bosses and minions. |
| `30` | `aura` (`Aura Enchanted`) | `0x6FC423B0` | Grants a periodic Paladin offensive aura (`98, 102, 103, 108, 114, 118, 122, 123`); does **not** bake static base physical damage or velocity onto the monster record. |
| `34` | `ai_after_death` (`Self-resurrect`) | `0x6FC43570` / `0x6FC43E20`, `0x6FC38A90` | Implicit on Act 5 `reanimatedhorde1..6` (`hcIdx 436..440, 698`) except Unique/SuperUnique leaders (e.g. Pindleskin). Unshattered/unconsumed corpses (`!STATE_RESTINPEACE`) arm a `100..224`-frame timer and roll `aip1%` (`30%..70%`) to revive at full HP with `alreadyGrantedKillRewards = true` (`0` repeat XP/drops). |
| `36` | `ghostly` (`Ghostly`) | `0x6FC43850` | Regular Champion stats with `0.5x` velocity, `80%` Physical resist, and `+20%..+30%` Cold damage + `150`-frame chill on hit (`0x6FC43917..0x6FC43975`). |
| `37` | `fanatic` (`Fanatic`) | `0x6FC43810` | Regular Champion stats with `2.0x` velocity, `0.3x` AI delay, and `-70%` AR (`0.3x` base AR). |
| `38` | `possessed` (`Possessed`) | `0x6FC437C0` | `2x` regular-Champion HP (`6x` base in Normal, `5x` NM, `4x` Hell) and `pMonsterData->nTypeFlags |= 0x20` (`0x6FC437E5`, `uncursable`), blocking all curse states (`9, 19, 23, 27, 55, 56, 57, 58, 59, 60, 61, 113, 114`). |
| `39` | `berserk` (`Berserker`) | `0x6FC42D00` | `0.75x` regular-Champion HP (`2.25x` base in Normal, `1.875x` NM, `1.5x` Hell), `4x` physical damage in Normal (`WillOWisp` exception at `0x6FC42EE4`: `2.5x`), and `4x` AR (`+300%`). |
| `41` | `always_run_ai` | `0x6FC469F0` | Bypasses AOI room/distance culling so quest/event bosses continue stepping AI; **never** triggers minion death waves. Minion death waves are driven strictly by `MonStats.txt` `killminions=1` / `SplEndDeath=1`, Blood Raven (`#267`), Shenk (`#479`), or `umod 15` (`partydead`). |

## 2. Booster & Hazard Shrine Handlers (`D2Game.dll` `0x6FC8ABB0..0x6FC8C798`)

- **Armor Shrine (`Code 6`, `state 128`, `0x6FC8ABB0`)**:
  Attaches **only** `STAT_SKILL_ARMOR_PERCENT` (`171`) = `+100` (`Arg0`). Attaching `item_armor_percent` (`16`) alongside `skill_armor_percent` double-counted `+200%` Defense.
- **Combat Shrine (`Code 7`, `state 129`, `0x6FC8ACE0` / `0x6FC89EE0` / `0x6FC89B00`)**:
  - `0x6FC8AD23`: calls `0x6FC89EE0(STAT_TOHIT = 0x13)`, which invokes `0x6FC89B00` to evaluate the player's touch-time total Attack Rating and computes `arBonus = trunc(currentAR * Arg0 / 100)` (`Arg0 = 200`).
  - `0x6FC8AD3F..0x6FC8AD4A`: attaches `STAT_DAMAGEPERCENT` (`25`) = `Arg1` (`200`).
  - `0x6FC8AD4F..0x6FC8AD55`: attaches `STAT_TOHIT` (`19`) = `arBonus`.
- **Exploding Shrine (`Code 21`, `0x6FC8C580`) & Poison Shrine (`Code 22`, `0x6FC8C200`)**:
  Reads the 6 radial `(dx, dy)` target coordinate pairs from `0x6FC8C798..0x6FC8C7C4`:
  `[(-6, 6), (-6, -6), (0, 6), (0, -6), (6, 6), (6, -6)]`, launching 6 distinct projectiles (`missile 45` `explosivepotion` or `missile 48` `chokinggaspoition`) at `slvl = clamp(trunc(clvl / 5), 1, 8)`.
