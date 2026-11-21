# Milestone #37 (`[K6]` Complete — `4,810 / 4,810 = 100.00%`): Real 1.13c DLL Coverage Audit, Multi-Subsystem Scenarios & Function Differential Vectors

Generated and verified deterministically via:

```bash
python3 tools/oracle/k6/audit-dll-coverage.py
python3 tools/oracle/callgraph/sync-gates.py --check --strict-standins --ratchet origin/main
python3 tools/oracle/callgraph/instrument-va-trace.py --check
npx vitest run tests/oracle/k6* tests/oracle/k5 tests/oracle/k4 tests/oracle/k3
```

---

## 1. Executive Summary — `4,810 / 4,810` (`100.00%`) Real 1.13c DLL Verification

All counts below are computed deterministically against `tools/oracle/callgraph/manifest-113c.json` (`1,479` `D2Common` + `3,331` `D2Game` = `4,810` reachable server-closure functions) by `tools/oracle/k6/audit-dll-coverage.py`, counting **only**:
1. **Scenario DLL-executed VAs**: one-shot `INT3` function-entry hits recorded inside live headless `D2Game.dll` + `D2Common.dll` (`d2host-113c.exe` + `d2oracle.dll` under Wine) across `tests/fixtures/oracle/{k1,k3,k4,k6*}/**/*.coverage.ndjson.gz`.
2. **Real-DLL emitter VAs**: target VAs directly invoked against real `D2Common.dll` / `D2Game.dll` in `tools/oracle/vectors/*.c` (`+ requests/*.req.json`) and `tools/oracle/k6*/*.c` (strictly excluding patched/stubbed hooks, verified across `-O2`, `-O2 -fno-omit-frame-pointer`, and `-O1` compiler profiles with 3-way SHA-256 output identity).

| Module | Metric | Pre-K6 Baseline | Final K6 (`100.00%`) | Net Delta |
|---|---|---:|---:|---:|
| **`D2Common`** (`1,479`) | Scenario DLL-executed VAs | `838 / 1,479` (`56.66%`) | **`1,303 / 1,479`** (`88.10%`) | **`+465`** |
| **`D2Common`** (`1,479`) | Real-DLL emitter VAs | `1,441 / 1,479` (`97.43%`) | **`1,448 / 1,479`** (`97.90%`) | **`+7`** |
| **`D2Common`** (`1,479`) | **Combined real-DLL-verified VAs** | `1,477 / 1,479` (`99.86%`) | **`1,479 / 1,479`** (**`100.00%`**) | **`0` remaining (`100.00%` closed)** |
| **`D2Game`** (`3,331`) | Scenario DLL-executed VAs | `887 / 3,331` (`26.63%`) | **`2,114 / 3,331`** (`63.46%`) | **`+1,227`** |
| **`D2Game`** (`3,331`) | Real-DLL emitter VAs | `50 / 3,331` (`1.50%`) | **`1,976 / 3,331`** (`59.32%`) | **`+1,926`** |
| **`D2Game`** (`3,331`) | **Combined real-DLL-verified VAs** | `910 / 3,331` (`27.32%`) | **`3,331 / 3,331`** (**`100.00%`**) | **`+2,421` net new (`0` remaining)** |
| **Combined (`4,810`)** | **Total Real-DLL Verified Kernel Closure** | `2,387 / 4,810` (`49.63%`) | **`4,810 / 4,810`** (**`100.00%`**) | **`+2,423` (`0` remaining)** |

---

## 2. `D2Game` Real-DLL Verification Breakdown by Subsystem (`3,331 / 3,331 = 100.00%`)

| Subsystem | Real-DLL Verified | Remaining Un-hit | Total | Verified % |
|---|---:|---:|---:|---:|
| `C2S` | **`80`** | `0` | `80` | **`100.0%`** |
| `Skills` | **`472`** | `0` | `472` | **`100.0%`** |
| `Missiles` | **`148`** | `0` | `148` | **`100.0%`** |
| `MonAI` | **`343`** | `0` | `343` | **`100.0%`** |
| `Combat/SUnitDmg` | **`336`** | `0` | `336` | **`100.0%`** |
| `Items/Cube/Trade` | **`310`** | `0` | `310` | **`100.0%`** |
| `Quests` | **`887`** | `0` | `887` | **`100.0%`** |
| `DRLG/Room/SUnit` | **`339`** | `0` | `339` | **`100.0%`** |
| `Party/Player/Client` | **`416`** | `0` | `416` | **`100.0%`** |
| **Total `D2Game`** | **`3,331`** | **`0`** | **`3,331`** | **`100.00%`** |

---

## 3. `[K6]` Headless 1.13c DLL Golden Scenario Suites (`23` Scenarios across `k6`, `k6-s2`, `k6-s3`)

Executed against genuine 1.13c `D2Game.dll` + `D2Common.dll` under rootless Wine (`d2host-113c.exe` + `d2oracle.dll`, 2-run SHA-256 identical, `otherThreadHits === 0`):

| Suite | Scenario | Frames | `D2Common` Hits | `D2Game` Hits | Coverage Focus |
|---|---|---:|---:|---:|---|
| `k6` | `k6-bloodmoor-consumables-auras-combat` | `380` | `609` | `487` | Full-horizon zero-divergence combat, potions, auras |
| `k6` | `k6-act3-consumables-quest` | `140` | `397` | `329` | Act 3 Golden Bird / Lam Esen's Tome quest consumables |
| `k6` | `k6-druid-skills` | `390` | `719` | `529` | Druid skill tree (`221..250`), summons, shapeshifting |
| `k6` | `k6-assassin-skills` | `390` | `745` | `582` | Assassin skill tree (`251..280`), traps, charge-ups |
| `k6` | `k6-items-potions-belt-combat` | `340` | `716` | `568` | Belt/inventory/equip/swap/TP scroll/gold & combat |
| `k6` | `k6-town-npc-gamble-waypoint` | `275` | `578` | `413` | Stash, Cube, Waypoint, Vendor repair/sell, Gamble, Merc |
| `k6` | `k6-nightmare-bloodmoor-combat` | `360` | `577` | `493` | Nightmare Champion/Unique monster UMods & missile AI |
| `k6-s2` | `k6s2-amazon-skills` | `715` | `762` | `598` | All 30 Amazon bow/javelin/passive skills |
| `k6-s2` | `k6s2-sorceress-skills` | `680` | `742` | `623` | All 30 Sorceress fire/lightning/cold skills |
| `k6-s2` | `k6s2-necromancer-skills` | `775` | `763` | `663` | All 30 Necromancer curses/poison/bone/summons |
| `k6-s2` | `k6s2-paladin-skills` | `775` | `741` | `575` | All 30 Paladin combat skills & defensive/offensive auras |
| `k6-s2` | `k6s2-barbarian-skills` | `665` | `775` | `591` | All 30 Barbarian warcries, masteries & combat skills |
| `k6-s2` | `k6s2-act2-sewers-cube-merc` | `1,290` | `809` | `643` | Act 2 Lut Gholein Sewers, Cube transmutation, Act 2 Merc |
| `k6-s2` | `k6s2-act4-hell-chaos-shrines` | `1,225` | `896` | `759` | Hell Act 4 River of Flame, Chaos Sanctuary, Shrines |
| `k6-s2` | `k6s2-act5-harrogath-shenk-anya` | `860` | `828` | `760` | Act 5 Harrogath, Bloody Foothills, Shenk & Anya |
| `k6-s3` | `k6s3-act1-bosses-cowlevel-imbue` | `1,611` | `924` | `877` | Secret Cow Level, Charsi Imbue, Andariel boss kill |
| `k6-s3` | `k6s3-act2-bosses-staff-duriel` | `3,028` | `932` | `924` | Radament, Horadric Staff orifice, Summoner & Duriel |
| `k6-s3` | `k6s3-act3-council-mephisto-quests` | `2,001` | `914` | `902` | Khalim's Will flail, Travincal Council & Mephisto |
| `k6-s3` | `k6s3-act4-izual-hellforge-diablo` | `4,217` | `931` | `879` | Izual, Hellforge Soulstone, 5 Chaos Seals & Diablo |
| `k6-s3` | `k6s3-act5-shenk-anya-ancients-baal` | `6,547` | `940` | `994` | Shenk, Larzuk Socket, Anya, 3 Ancients, 5 Waves & Baal |
| `k6-s3` | `k6s3-druid-full-30-skills` | `1,475` | `859` | `750` | Full 30-skill Druid deep combat & summon progression |
| `k6-s3` | `k6s3-assassin-full-30-skills` | `1,480` | `835` | `770` | Full 30-skill Assassin traps, shadows & finishers |
| `k6-s3` | `k6s3-crafting-runewords-c2s-monai` | `1,834` | `956` | `731` | `Leaf`/`Stealth` Runewords, `Hel+TP` unsocket, rare upgrade, `0x62` merc revive, Akara respec |

---

## 4. `[K6]` Real-DLL Function Differential Emitter Ledger (`17` Suites)

Every emitter below compiles with `i686-w64-mingw32-gcc-win32 -m32 -Wall -Wextra -Werror -static-libgcc`, enforces register-only inline-asm constraints, verifies 3-way SHA-256 identity across `-O2` / `-O2 -fno-omit-frame-pointer` / `-O1`, and asserts bit-exact parity (`return`, `Fog.#10024` assert line, staged memory, and heap allocations) against `src/d2kern-113c/`:

| Emitter Suite | File | `D2Common` VAs | `D2Game` VAs | Scope |
|---|---|---:|---:|---|
| `k6` (Wave 1) | `tools/oracle/k6/k6-w1-d2game-emitter.c` | `0` | `53` | Initial C2S, town NPC, item & combat differential vectors |
| `k6-w2` | `tools/oracle/k6-w2/k6-w2-d2game-emitter.c` | `12` | `111` | `0x6FC80000..0x6FD15000` upper-half sweep |
| `k6-w3` | `tools/oracle/k6-w3/k6-w3-d2game-emitter.c` | `2` | `123` | Closed `D2Common` `1,479/1,479 (100.00%)` + `0x6FC20000..0x6FC7FFFF` |
| `k6-w5` | `tools/oracle/k6-w5/k6-w5-d2game-emitter.c` | `0` | `150` | Lo-VA Part 1 (`0x6FC20000..0x6FCBFFFF`) |
| `k6-w6` | `tools/oracle/k6-w6/k6-w6-d2game-emitter.c` | `12` | `151` | Hi-VA Part 1 (`0x6FCC0000..0x6FD18000`) |
| `k6-w7` | `tools/oracle/k6-w7/k6-w7-d2game-emitter.c` | `12` | `151` | Hi-VA Part 2 (`0x6FCC0000..0x6FD18000`) |
| `k6-w8` | `tools/oracle/k6-w8/k6-w8-d2game-emitter.c` | `0` | `150` | Lo-VA Part 2 (`0x6FC20000..0x6FCBFFFF`) |
| `k6-w10` | `tools/oracle/k6-w10/k6-w10-d2game-emitter.c` | `12` | `150` | Hi-VA Part 3 (closed `C2S` `80/80 = 100.0%`) |
| `k6-w11` | `tools/oracle/k6-w11/k6-w11-d2game-emitter.c` | `0` | `150` | Lo-VA Part 3 (`0x6FC20000..0x6FCBFFFF`) |
| `k6-w12` | `tools/oracle/k6-w12/k6-w12-d2game-emitter.c` | `12` | `153` | Hi-VA Part 4 (`0x6FCC0000..0x6FD142D0`) |
| `k6-w13` | `tools/oracle/k6-w13/k6-w13-d2game-emitter.c` | `0` | `150` | Lo-VA Part 4 (crossed `3,000` & `90%` `D2Game`) |
| `k6-w14` | `tools/oracle/k6-w14/k6-w14-d2game-emitter.c` | `0` | `93` | Lo-VA Part 5 (all 9 `D2Game` subsystems `> 90%`) |
| `k6-w15` | `tools/oracle/k6-w15/k6-w15-d2game-emitter.c` | `0` | `83` | Lo-VA Part 6 (`99.29%` combined, `34` remaining) |
| `k6-fix1` | `tools/oracle/k6-fix1/k6-fix1-d2game-emitter.c` | `1` | `47` | Round-1 kernel parity fixes (54 stack-allocs, `STATLIST_AllocList`, Packet `0x5A`, `0x6FCFCF20`, `MONSTER_StartMode`) |
| `k6-fix2` | `tools/oracle/k6-fix2/k6-fix2-d2game-emitter.c` | `0` | `117` | Round-2 kernel parity fixes & `MonAI` hydrated dispatcher unlock (`+102` `MonAI` VAs) |
| `k6-fix3` | `tools/oracle/k6-fix3/k6-fix3-d2game-emitter.c` | `0` | `92` | Round-3 kernel parity fixes & `100.0%` upper-half `D2Game` closer (`0` Hi-VAs remaining) |
| `k6-fix4` | `tools/oracle/k6-fix4/k6-fix4-d2game-emitter.c` | `0` | `34` | Round-4 Grand Slam closer (`3,331 / 3,331 = 100.00%` `D2Game`, `4,810 / 4,810 = 100.00%` combined) |
