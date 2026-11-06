# Phase 0 (`[K0]`) Go/No-Go Quantitative Report — Diablo II v1.13c Isomorphic Server Kernel

> **Milestone:** Gitea Milestone 31 (`[K0]`)
> **Target:** `src/d2kern-113c/` + `src/server/route2/` + `tools/oracle/{callgraph,headless,vectors}/`
> **Verdict:** **GO** — All 8 exit gates verified with `0` errors across `11,529` stateful recorded/snapshot differential cases, `45,101` binary `D2TV` event-wheel firings, `10,000` `D2TV` PRNG vectors, `581.8x` headless 1.13c server acceleration, and exact `a1c-bloodmoor-fallen` `F790` / `F821..F999` monster phase parity without post-loop workarounds or `.sort()`.

---

## 1. Deliverables & Exit Gate Matrix

| # | `[K0]` Exit Gate | Deliverable | Verification Result |
|---|---|---|---|
| 1 | Static reachable callgraph closure & topological layers (`0..K`) | `tools/oracle/callgraph/{extract-callgraph.py,dispatch-tables-113c.json,manifest-113c.json,status.ts}` | **PASS** — `4,551` reachable functions (`3,394` `D2Game.dll` + `1,157` `D2Common.dll`), `4,409` Tarjan SCCs, `31` topological layers (`0..30`), `1,967` root & dispatch-table seeds. |
| 2 | Empirical per-function port + verify velocity & `ready` frontier width | `tools/oracle/callgraph/status.ts` + §2 below | **PASS** — `85 / 4,551` core functions `diff-verified` (`+37` in `[K0]`); **`1,169` Level-0 leaf functions unblocked `ready`** (`1,167` pending with `0` internal dependencies); measured **`9.5 min/function`** (`0.16 hr/fn`) end-to-end with `FnOracleDaemon` + `D2TV`. |
| 3 | Isomorphic kernel vertical slice driving `a1c-bloodmoor-fallen` monster phase (`F790 / F821`) | `src/d2kern-113c/game/{timer-wheel.ts,monster-events.ts}`, `src/server/engine/game-instance/kern-monster-wheel-113c.ts`, `tests/oracle/kern-fallen-f790-f821.test.ts` | **PASS** — `MONSTER_RegisterContinuousModeEvent113c` (`0x6FD00B40`), `MONSTER_DispatchEvent113c` (`0x6FC969A0`), `AI_RunMonsterAI113c` (`0x6FCBD3B0`) pass `F1..F999` (`F790` `DD->DT` deferred transition + `F821` multi-corpse FIFO revival order) + all `15/15` golden scenarios with `0` `.sort()` calls and `0` post-loop `DT -> DD` patches. |
| 4 | `10,000+` stateful recorded/snapshot differential cases (`0` errors) | `tools/oracle/{fn-daemon.ts,fn-snapshot-runner.ts,collect-kern-10k-diff.ts}`, `tests/fixtures/oracle/route2/kern-10k-diff.ndjson.gz`, `tests/oracle/kern-10k-diff.test.ts` | **PASS** — **`11,529` stateful differential cases (`0` mismatches)**: `3,000` `mulDiv113c` (`0x6FD511E0` & `0x6FC214D0`), `4,000` `D2StatListEx` (`3,600` live `SNAP_CALL` snapshots = `72,000` `[base,full]` pairs + `400` sub-list `op 1..13`), `2,000` `STATES` (`0..183` + OOB), `2,529` `64`-slot `EventTimer` (`2,200` `op 77` + `73` `fnrec` + `256` `D2TV`). |
| 5 | Headless original 1.13c server host (`> 500x` target) | `tools/oracle/headless/{d2host-113c.c,build.sh}`, `tools/oracle/run-headless-oracle.sh`, `tests/oracle/headless-host.test.ts` | **PASS** — **`581.8x` simulation speedup** (`1,800` frames: `72,000ms` real-time -> `123.76ms` = **`14,543.8 FPS`**), **`47.24x` warm CLI wall-clock speedup** (`90,318.5ms -> 1,912.0ms`), SHA-256 bit-identical `trace.ndjson` vs full `Game.exe` (`395eea4595d5947f8e16560bd74f18b989da7605911cc6fb1c4e3b7e3b12f6f4`). |
| 6 | Subsystem binary test vector (`D2TV`) harness (`PRNG` + `EVTWHEEL`) | `tools/oracle/vectors/{vector-format.h,prng-emitter.c,eventwheel-emitter.c,prng-10k.d2tv,eventwheel-113c.d2tv}`, `tests/oracle/vector-format.test.ts` | **PASS** — `prng-10k.d2tv` (`10,000` DLL records from `0x6FC21180`/`0x6FD510B0` including signed `nMax <= 0` guard) + `eventwheel-113c.d2tv` (`256` DLL scenarios / `45,101` fired events across `0x6FCAE9A0`/`0x6FCAEA80`/`0x6FCAF070`). |
| 7 | Struct layout freeze & Route A vs Route B empirical benchmark | `docs/oracle/{route2-layout.json,ab-comparison-eventwheel.md}`, `src/d2kern-113c/mem/{sparse-memory.ts,layout.generated.ts}` | **PASS** — Frozen binary offsets for `D2GameStrc` (`0x1DE8`), `D2TimerStrc` (`0xA20`), `D2EventStrc` (`0x30`), `D2UnitStrc` (`0x100`), `D2ActiveRoomStrc` (`0x80`), `D2StatListStrc` (`0x3C`), `D2StatListExStrc` (`0x64` + `48`-byte `pStateFlags`), `D2DamageStrc` (`0x70`). |
| 8 | Reverse-engineering documentation & manifest bookkeeping | `kb/{README.md,engine/d2game-headless-host-113c.md,stats/d2common-statlist-struct-113c.md,monsters/d2game-monster-events-113c.md}`, `docs/oracle/function-map.md` | **PASS** — All `184` `kb/` specs indexed; `manifest-113c.json` & `function-map.md` synchronized via `extract-callgraph.py`. |

---

## 2. Quantitative Velocity Calibration & Effort Model

### 2.1 Measured `[K0]` Port + Verify Throughput
- **Functions ported & differential-verified in `src/d2kern-113c/` during `[K0]`:** `37` reachable binary functions across `PRNG`, `mulDiv`, `UNITS`/`UNITROOM`, `D2StatList`/`D2StatListEx`/`STATES`, `SUNIT` hash tables, `64`-slot `D2TimerStrc`, and `MONSTER`/`AI` event dispatch.
- **Oracle harness throughput:**
  - `FnOracleDaemon` (`fnharness v2` warm Wine daemon):
    - Primitive calls (`mulDiv`, `STATES`, `EventTimer` probes): **`294,117 calls/sec`** (`3,000` calls in `10.2ms`).
    - Stateful unit `SNAP_CALL` (`op 200`: 20-stat setup + native VA invocation + 20-stat `[base,full]` readback + reverse restore): **`13,260 snapshots/sec`** (`3,600` snapshots in `271.5ms`, `75.4µs/snapshot`).
  - `d2host-113c.exe` headless full-frame simulation: **`14,543.8 FPS`** (`68.8µs/frame`).
  - `D2TV` native binary vector replay in Vitest: **`45,101` fired timer-wheel events verified in `~38ms`**.
- **Measured per-function port + kb + differential verification cost:**
  - **Leaf / data-table / accessor functions (Topo Layers `0..1`, `~1,655` functions):** **`4–7 min/fn`** (`~0.09 hr/fn`), highly batchable (`15–30` functions per module wave).
  - **Medium stateful subsystem functions (Topo Layers `2..8`, `~2,079` functions):** **`10–15 min/fn`** (`~0.20 hr/fn`) with `SNAP_CALL` / `D2TV`.
  - **Complex orchestrators (`SUNITDMG`, `DRLG`, Boss/Quest scripts, `SrvDo` tables, `~817` functions):** **`20–35 min/fn`** (`~0.45 hr/fn`) verified with `d2host-113c` multi-thousand-frame scenarios.
  - **Weighted average across remaining `4,466` functions:** **`~0.20 agent-hours/fn`** (`~890` agent-hours total -> **`~110–150` wall-clock hours** under 6–8 parallel worktree workers gated by topological `ready` waves).

### 2.2 Real Binary Subtle Bugs Caught Automatically by `[K0]` Harnesses
1. **`PRNG` signed `nMax <= 0` guard (`0x6FC21180` / `0x6FD510B0`):** Uses signed `test esi, esi; jg` (`nMax <= 0` returns `0` without advancing `D2SeedStrc`). Caught by `prng-10k.d2tv`.
2. **`D2TimerStrc` re-entrant deletion flag (`0x6FCAE6F0`):** `fFlags & 0x01` defers node free via `fFlags |= 0x08` when a callback deletes its own persistent event (`evType 0`). Caught by `eventwheel-113c.d2tv`.
3. **`SUNIT` swapped server hash table offsets (`0x6FD1B014`):** `UNIT_ITEM (4)` is at `+0x1720` while `UNIT_MISSILE (3)` is at `+0x1920`, and `UNIT_TILE (5)` at `+0x1B20` is a single unbucketed list head.
4. **`ItemStatCost` `wBaseDepStats` (`0x6FDC3CE3..0x6FDC3D35`):** Stores `entry.statId` (`216/217/222/223`), **not** `wOpStat[i]`, enabling both multi-hop chains (`12 -> 222 -> 1 -> 9`) and unconditional carrier writeback (`0x6FD89F22`) on level-up. Caught at snapshot `#7` of `kern-10k-diff.test.ts`.
5. **`CharStats.txt` Assassin `ManaPerMagic` (`+0x48`):** Verified `7` fourths (`1.75` mana/energy), caught at snapshot `#13` of `kern-10k-diff.test.ts`.
6. **`MONSTER_DispatchEvent` (`0x6FC969A0`) deferred `DD (8) -> DT (12)` transition:** `MONMODE_DEATH (8)` remains mode `8` at animation end until event `2` (`AITHINK`) fires on the wheel, eliminating the `a1c-bloodmoor-fallen` `F790` / `F821` timing & FIFO revival drift.

---

## 3. Architectural Decision for Phases 1–5 (`[K1]`–`[K5]`)

Based on the empirical `[K0]` benchmarks (`docs/oracle/ab-comparison-eventwheel.md` and `src/d2kern-113c/`):
1. **Stateful Server Structs (`D2GameStrc`, `D2TimerStrc`, `D2UnitStrc`, `D2StatListExStrc`, `D2InventoryStrc`, `D2ItemDataStrc`, `D2SkillListStrc`, `D2DamageStrc`, `D2AiGeneralStrc`, `D2BitBuffer`):** Strictly reside in **`SparseMemory113c` + `layout.generated.ts`** (`docs/oracle/route2-layout.json`) so pointer links (`pNext`, `pRoomUnitNext`, `pGameHashNext`), re-entrant iterator cursors (`pSavedNext`), bitfields, and raw `fnrec` memory snapshots match 1.13c byte-for-byte with zero `.sort()` or GC object-graph impedance.
2. **Read-Only Data Tables & Pure Geometric Kernels (`DRLG` room generation, `COLLISION` subtile grids, `AnimData.d2`, `.bin` excel registries):** Kept as zero-allocation typed views (`Int32Array` / `Uint16Array` / `StatTableRegistry113c`) bound to exact `.bin` offsets and verified by `D2TV` binary vectors + `d2host-113c` scenarios.
