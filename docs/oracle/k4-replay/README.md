# K4 Act 1–5 Quest Golden Replay Suite (`k4-act1-quest` .. `k4-act5-quest`)

Milestone 35 `[K4]` longitudinal quest golden suite: 5 deterministic Act 1–5 quest scenarios captured on the headless Wine 1.13c DLL host (`d2host-113c.exe` + `d2oracle.dll`, `seed = 12345`, Normal difficulty `0`), hydrated from real Frame 2 (`F2`) memory snapshots into `SparseMemory113c`, and ratcheted frame-by-frame against `src/d2kern-113c/`.

## Layout & Artifacts

| Artifact | Path |
|---|---|
| Scenario & `.d2s` generator + Wine recorder | `tools/oracle/make-k4-quest-scenarios.py` |
| Quest `.d2s` save fixtures (Acts 1–5) | `tests/fixtures/oracle/saves/k4-act{1..5}-quest.d2s` |
| Deterministic scenario definitions | `tests/fixtures/oracle/scenarios/k4-act{1..5}-quest.json` |
| Wine 1.13c golden traces & F2 snapshots | `tests/fixtures/oracle/k4/k4-act{1..5}-quest.{oracle,snap-f002}.ndjson.gz` |
| Upward-only horizon ratchet | `tests/fixtures/oracle/k4/horizons.json` |
| Vitest replay ratchet harness | `tests/oracle/k4/replay-act-quests.test.ts` |
| Per-scenario divergence JSONs | `docs/oracle/k4-replay/k4-act{1..5}-quest.divergence.json` |

Regenerate scenarios/saves and re-record Wine 1.13c traces + F2 snapshots:
```bash
python3 tools/oracle/make-k4-quest-scenarios.py --record
```

## Act 1–5 Quest Scenario Design

Every scenario starts at Frame 2 inside its canonical Act town (`level` `1`, `40`, `75`, `103`, `109`), uses only pure C2S packets (`0x03`, `0x13`, `0x2F`, `0x31`, `0x30`, `0x20`) where **100% of C2S packets return `0`** in `D2Game.dll` `0x6FCEC550`, verified deterministic across two independent Wine runs, and produces a directly observable quest transition in `.oracle.ndjson.gz`:

| Scenario | Act & Town (`level`) | Quest (`Woo!` word / protocol ID) | Town NPC (`id`, `hcIdx`) & C2S Sequence | Verified 1.13c Golden Quest Outcome |
|---|---|---|---|---|
| `k4-act1-quest` | Act I — Rogue Encampment (`1`) | `A1Q1` Den of Evil (`word 1 = 0x0002`, `0x01`) | Akara (`#5`, `148`): `0x03` -> `0x13` -> `0x2F` -> `0x31` (`wScrollId = 0x004C`) -> `0x30` | `+1` `STAT_NEWSKILLS` (`stat 5`: `12 -> 13`) |
| `k4-act2-quest` | Act II — Lut Gholein (`40`) | `A2Q1` Radament's Lair (`word 9 = 0x2021`, `0x08`) + `'ass '` (`#9`) | Jerhyn (`#1`, `201`): `0x03` -> `0x13` -> `0x2F` -> `0x31` (`0x00FD`) -> `0x30`, then `0x20` (`UseItem #9`) | Consumes Book of Skill `'ass '`, `+1` `STAT_NEWSKILLS` (`stat 5`: `12 -> 13`) |
| `k4-act3-quest` | Act III — Kurast Docks (`75`) | `A3Q1` The Golden Bird (`word 20 = 0x0004`, `0x12`) + `'j34 '` (`#9`) | Meshif (`#3`, `264`): `0x03` -> `0x13` -> `0x2F` -> `0x31` (`wScrollId = 0x0211`) -> `0x30` | Deletes Jade Figurine `'j34 '`, mints Golden Bird `'g34 '` (`gs` advances `[3213594174, 158754329] -> [1040732530, 1118359132]` on F42) |
| `k4-act4-quest` | Act IV — Pandemonium Fortress (`103`) | `A4Q1` The Fallen Angel (`word 25 = 0x0002`, `0x16`) | Tyrael (`#3`, `367`): `0x03` -> `0x13` -> `0x2F` -> `0x31` (`wScrollId = 0x02A4`) -> `0x30` | `+2` `STAT_NEWSKILLS` (`stat 5`: `12 -> 14`) |
| `k4-act5-quest` | Act V — Harrogath (`109`) | `A5Q3` Prison of Ice (`word 37 = 0x0202`, `0x21`) | Malah (`#7`, `513`): `0x03` -> `0x13` -> `0x2F` -> `0x31` (`0x4EA4` mints `'tr2 '` `#9`) -> `0x30`, then `0x20` (`UseItem #9`) | Consumes Scroll of Resistance `'tr2 '`, `+10` Fire/Light/Cold/Poison Resist (`stats 39, 41, 43, 45`: `0 -> 10`) |

## Measured Replay Horizons (`2026-11-18`)

All 5 Act snapshots hydrate cleanly at `F2` with **zero strict field mismatch (`bootCheck === null`)** and run to **full-frame strict zero divergence (`t0 + t1 + t4 + s2c + gs`, `firstDivergence === null`, `firstPosDivergence === null`)** across their entire golden trace horizons:

| Scenario | Golden Frames | Boot Check (`F2`) | Strict Horizon | Pos Horizon | First Strict Divergence | First Pos Divergence |
|---|---:|---|---:|---:|---|---|
| `k4-act1-quest` | `F1..F160` | `null` (identical) | `F160` (158/158 frames) | `F160` (158/158 frames) | `null` (zero divergence) | `null` (zero divergence) |
| `k4-act2-quest` | `F1..F140` | `null` (identical) | `F140` (138/138 frames) | `F140` (138/138 frames) | `null` (zero divergence) | `null` (zero divergence) |
| `k4-act3-quest` | `F1..F130` | `null` (identical) | `F130` (128/128 frames) | `F130` (128/128 frames) | `null` (zero divergence) | `null` (zero divergence) |
| `k4-act4-quest` | `F1..F140` | `null` (identical) | `F140` (138/138 frames) | `F140` (138/138 frames) | `null` (zero divergence) | `null` (zero divergence) |
| `k4-act5-quest` | `F1..F140` | `null` (identical) | `F140` (138/138 frames) | `F140` (138/138 frames) | `null` (zero divergence) | `null` (zero divergence) |

## Closed 1.13c Kernel Subsystems Across Acts 1–5

### 1. Town NPC Patrol, Greeting & Waypoint AI (`Acts 1–5`)
- Town NPCs execute canonical 1.13c AI callbacks (`AI_TownNpc` `D2Game:0x6FC3DB40`, `AI_SimpleMapAiNpc` `D2Game:0x6FC3BC60`, `AI_RogueTown` `D2Game:0x6FCBCB00`, `AI_ThinkTyraelOrIzualGhost` `D2Game:0x6FC39880`, `AI_Npc_Town` `D2Game:0x6FCCA4D0`), including `MONSTER_EndToAiOrNeutral` (`D2Game:0x6FC96BF0`) re-dispatch through `AI_DispatchTargetByAiFlag` (`D2Game:0x6FCBD160`) and `AI_WarrivGreet` (`D2Game:0x6FC39C20`) player-interaction busy/greeting state.

### 2. Act 2–5 Town `D2RoomExStrc` Preset & Neighbor Hydration
- Hydrates Act 2–5 town DS1/DT1 preset rooms (`tests/fixtures/oracle/k4/drlg-act2-5-ds1-dt1-113c.json.gz`), `D2MapAIStrc` waypoint chains (`+0x38`), and `D2NpcInteractStrc` heads (`+0x30`) for seamless room boundary transitions (`CLIENTS_SetPlayerCurrentRoom` `D2Game:0x6FC6B1D0` -> `DRLGROOM_PropagateRoomStatusIncrement` `D2Common:0x6FD64860`).

### 3. Act 1–5 Quest State Machines & Consumable C2S Handlers (`F34..F160`)
All C2S opcodes and quest callbacks execute through canonical manifest-bound `tsSymbol` functions:
- `C2S 0x13` (`PACKET_Recv13_UnitInteract`, `D2Game:0x6FCF0910` -> `0x6FCF01D0` -> `NPC_StartPlayerNpcInteraction` `0x6FC687A0` -> `SUNIT_SetLastKillerInfo` `0x6FCFFAE0` `[+0x64 = dwUnitId, +0x68 = nUnitType, +0x6C = 1]`)
- `C2S 0x2F` (`PACKET_Recv2F_NpcInit`, `D2Game:0x6FCEE440` -> `0x6FCECCF0` -> `0x6FC68B60` -> `NPC_Activate` `0x6FCDD810`)
- `C2S 0x31` (`PACKET_Recv31_QuestMessage`, `D2Game:0x6FCEC9D0` -> `QUESTS_ScrollMessage` `0x6FC55C90` -> `QUESTS_TriggerCallback` `0x6FC53CE0` `event = 0x0B`):
  - **Act 1 `A1Q1`**: `D2Game:0x6FC85260` (`wScrollId = 0x004C`, clears bit `1`, sets bit `0`, `STATLIST_AddUnitStat(pPlayer, 5, 1, 0)`)
  - **Act 2 `A2Q0`**: `D2Game:0x6FCE4620` (`wScrollId = 0x00FD`, sets `word 8` bit `0`)
  - **Act 3 `A3Q1`**: `D2Game:0x6FD08B60` (`wScrollId = 0x0211`, calls `QUESTS_DeleteItem` `0x6FC566A0` for `'j34 '` and `QUESTS_CreateItem` `0x6FC56470` for `'g34 '`)
  - **Act 4 `A4Q1`**: `D2Game:0x6FCDA5E0` (`wScrollId = 0x02A4`, clears bit `1`, sets bit `0`, `STATLIST_AddUnitStat(pPlayer, 5, 2, 0)`)
  - **Act 5 `A5Q3`**: `D2Game:0x6FC7F5E0` (`wScrollId = 0x4EA4`, calls `QUESTS_CreateItem` `0x6FC56470` for `'tr2 '`, sets bit `8`, clears bit `1`, completes `word 37` when bit `9` is set)
- `C2S 0x30` (`PACKET_Recv30_NpcCancel`, `D2Game:0x6FCED480` -> `0x6FC685C0`, resetting `[+0x64 = 0xFFFFFFFF, +0x68 = 6, +0x6C = 0]`)
- `C2S 0x20` (`PACKET_Recv20_UseItem`, `D2Game:0x6FCEF730` -> `ITEMS_UseConsumableItem` `0x6FCF9B70`, handling `'ass '` `+1` `stat 5` and `'tr2 '` -> `0x6FC7B0B0` `+10` `stats 39, 41, 43, 45`)

## Fixture Provenance (`tests/fixtures/oracle/k4/`)

| File | Gzip Bytes | Raw Bytes | SHA-256 (gzip) |
|---|---:|---:|---|
| `k4-act1-quest.oracle.ndjson.gz` | 2,583 | 163,621 | `bbbc34234685b10e0b9d614c839f1512d3aa4d597da053da47ab1d93dd66983c` |
| `k4-act1-quest.snap-f002.ndjson.gz` | 28,045 | 619,765 | `267201c87786c884970cd6852577d0ec929e4ccc9595f6d72b6a51bafc43ad73` |
| `k4-act2-quest.oracle.ndjson.gz` | 2,037 | 127,286 | `be55e09b754c639ec9955e9d83434e7e4fbc38158018466578f2160db5e2e3b5` |
| `k4-act2-quest.snap-f002.ndjson.gz` | 23,744 | 551,636 | `a41695d14ba2c2675551b1cd512875668bac4ee9d56996276aa8df18421342f2` |
| `k4-act3-quest.oracle.ndjson.gz` | 1,141 | 63,462 | `8381a757b7ce1db1e640c47ddd60e78d8209b27ab4a2587c66aaaba7892786fb` |
| `k4-act3-quest.snap-f002.ndjson.gz` | 25,340 | 599,029 | `d9747b4ab629ad61c55ac28d433f8252ff55091fe689ae97d156e9c97264930c` |
| `k4-act4-quest.oracle.ndjson.gz` | 1,532 | 81,673 | `b61d900a08f370452d3ae8fa84db7db8c5a26fd5c29b38021a789c7bf354f629` |
| `k4-act4-quest.snap-f002.ndjson.gz` | 22,087 | 539,912 | `63c8fdfa1584b22ede34969f16446e1c9a9cba3335af86e2d42367a82df6514a` |
| `k4-act5-quest.oracle.ndjson.gz` | 1,750 | 122,082 | `f57f19eac1c2905ae60571457a57a6c666741663682f57f85a8b039c5227a756` |
| `k4-act5-quest.snap-f002.ndjson.gz` | 24,926 | 565,527 | `654dc76c966bcb431a1b3145dca078b341b17517f42bfb36ed68d9e7e493765d` |
