# `src/server` — 1.13c Authoritative Game Simulation Engine (`D2Game.dll`)

> [!WARNING]
> **Server-Side Development Status Notice (Work in Progress)**:
> The `src/server` module is **currently under active development and NOT completed yet**. While foundational building blocks—such as the 25fps deterministic tick loop, combat formulas, skill handlers, TreasureClass drop pipeline, and `.d2s` binary save reader/writer—are in place and unit-tested, it does not yet provide a complete standalone server for end-to-end gameplay.
> **To play the game today, please follow the Single-Client Mode guide in the [root `README.md`](../../README.md) to connect the web client to a native C++ PvPGN + D2GS (v1.13c) server over the WebSocket bridge.**

`src/server` is the deterministic authoritative server simulation module for **Diablo II: Lord of Destruction (v1.13c)**, designed as a 1:1 port of `D2Game.dll`'s 25fps (40ms/tick) game loop, combat pipeline, 221 skills, monster AI, TreasureClass drop tables, and `.d2s` save system.

### 1. Module Responsibilities & Architectural Boundaries

- **Original DLL Counterpart**: `D2Game.dll`.
- **TypeScript Compiler Constraints (`tsconfig.server.json`)**:
  - `lib: ["ES2022", "WebWorker"]`, `types: []` — **Zero browser DOM globals and zero Node.js APIs** (enforced by `tests/arch/boundaries.test.ts` Rules 3 & 4).
  - **Strictly Deterministic Simulation**: Calling `Math.random`, `Date.now`, or `performance.now` inside `src/server` is strictly forbidden; all randomness must flow through seeded `D2Rng` instances, and all time progression is driven by discrete 25fps ticks (`tickCount`).
  - May only import `src/common` and `src/netproto` (via `src/netproto/index.ts`); importing `src/client` or `src/baker` is forbidden.

---

### 2. Directory Structure

```text
src/server/
├── index.ts             # Module barrel export (GameInstance, LocalLoopbackAdapter, LocalLobbyProvider, MultiClientRoomHost, .d2s reader/writer)
├── engine.ts            # Top-level simulation engine facade
├── loopback-adapter.ts  # LocalLoopbackAdapter & LocalLobbyProvider wrapping singlePlayer GameInstance behind GameServerAdapter & LobbyProvider
├── room-host.ts         # MultiClientRoomHost multiplexing 1..8 clients over a 25Hz multiplayer GameInstance (TsFramer & binary D2GS)
├── net/                 # Multiplayer network layer (aoi.ts spatial filtering, party.ts party/hostile roster, session.ts client wire session)
├── engine/              # 25fps core simulation engine (game-instance.ts, game-engine.ts, combat-pipeline, missile-engine, aura-scanner, stat-list, state-hash)
├── ai/                  # Monster AI decision trees, aggro/target acquisition, line-of-sight & room-streamer
├── skills/              # Server-side executors for all 221 skills across 7 classes (Amazon, Sorceress, Necromancer, Paladin, Barbarian, Druid, Assassin)
├── items/               # 1.13c drop pipeline (TC NoDrop/Quality/Affix), Charsi Imbue, runewords, gem socketing, Horadric Cube recipes & NPC vendor services
├── world/               # Interactive world objects (shrines/chests/portals/waypoints), quest state machines & NPC dialogue/healing/gambling
└── save/                # Authentic 1.13c .d2s v96 binary character save reader/writer (Checksum, Attributes, Skills, QuestData, Waypoints, ItemList)
```

---

### 3. Core Subsystems (Work in Progress)

#### 3.1 25fps Core Engine & Combat Pipeline (`engine/`)
- **`GameInstance` (`engine/game-instance.ts`) & `GameEngine` (`engine/game-engine.ts`)**: Maintains authoritative world state and advances in fixed 40ms steps:
  1. Consumes queued player input commands (movement, normal attacks, skill casts, item pickup/equip/potions, NPC interactions & Charsi Imbue).
  2. Ticks state durations (poison, freeze, curses, warcries, shrine buffs) and natural life/mana regeneration.
  3. Runs `engine/aura-scanner.ts` for periodic radial target scanning and stat application.
  4. Advances `engine/missile-engine.ts` for projectile step collision and sub-missile spawning.
  5. Steps monster and summon (`ai/summon-manager.ts`) AI decisions and action frames.
  6. Flushes dirty state deltas through `engine/state-bus.ts` into incremental `ServerEvent` emissions.
- **Combat Damage Pipeline (`engine/combat-pipeline.ts`)**: Implements 1.13c hit-chance formulas (AR vs. DR + level difference), shield blocking, 6-type damage resolution (Physical, Magic, Fire, Lightning, Cold, Poison), resistance piercing/caps, Crushing Blow, Deadly Strike / Critical Strike, and Open Wounds.

#### 3.2 All-Class Skill System (`skills/`)
- **`skills/registry.ts` & `skills/skills.ts`**: Dispatches `Skills.txt` `srvdofunc` / `srvstfunc` handlers across all 7 classes (**221 skills** total), including synergy formulas, casting delays (cooldowns), mana costs, multi-projectile emitters, and corpse interactions.

#### 3.3 Monster AI & Room Streaming (`ai/`)
- **`ai/monster-ai.ts`**: Uses `MonStats.txt` AI parameters (`aidel`, `aip1..aip8`) to drive Fallen shaman revives, ranged kiting, Stygian Doll death explosions, Unique monster boss modifiers (Lightning Enchanted, Fire Enchanted death explosion, Cold Enchanted death Frost Nova, Extra Fast, Fanaticism aura, immunities), and Act Boss AI & death sequences (Andariel fire pillars/screen shake/falling rocks, Duriel maggot burst, etc.).
- **`ai/room-streamer.ts`**: Dynamically activates and hibernates DRLG rooms in a 3×3 neighborhood around players, spawning monsters according to `MonDen` and `SuperUniques.txt`.

#### 3.4 1.13c Item Drop Pipeline & `.d2s` Save System (`items/`, `save/`)
- **Drop Pipeline & Charsi Imbue (`items/drop-pipeline.ts`, `items/imbue.ts`)**: Implements `TreasureClassEx.txt` recursive tree traversal, player-count `NoDrop` exponent scaling, diminishing-returns Magic Find (MF) conversion across Unique / Set / Rare / Magic rolls, weighted affix sampling from `MagicPrefix.txt` / `MagicSuffix.txt`, and Act 1 Quest 3 Charsi Imbue rare item generation (`ilvl = clvl + 4` with `StaffMods`).
- **`.d2s` Binary Save Compatibility (`save/d2s-reader.ts`, `save/d2s-writer.ts`)**: Reads and writes byte-authentic Diablo II v1.13c `.d2s` character save files (`0xAA55AA55` header, rotate-add checksum, `gf` stat bitstreams, `if` skill arrays, and `JM` item lists).

---

### 4. Common Verification Commands

```bash
# Run strict typecheck on src/server (verifies zero DOM / zero Node dependencies)
npx tsc -p tsconfig.server.json --noEmit

# Run architectural boundary and drop pipeline unit tests
npx vitest run tests/arch/boundaries.test.ts tests/drop-pipeline.test.ts
```
