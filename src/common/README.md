# `src/common` — Pure TypeScript Shared Foundation Module

`src/common` is the pure computation and data-structure foundation of the **Diablo II: Lord of Destruction (v1.13c)** Web port, faithfully mirroring the core logic of `D2Common.dll`, `Storm.dll`, and `D2Lang.dll`.

### 1. Module Responsibilities & Architectural Boundaries

- **Original DLL Counterparts**: `D2Common.dll` (DRLG level generation, dynamic pathfinding & step collision engine, data tables, collision masks, unit/skill/item formulas, 64-bit PRNG), `Storm.dll` (MPQ archive parsing and PKWARE/Huffman/ADPCM decompression), and `D2Lang.dll` (`.tbl` string tables and localization).
- **TypeScript Compiler Constraints (`tsconfig.common.json`)**:
  - `lib: ["ES2022"]`, `types: []` — **Zero DOM dependencies, zero Node.js API dependencies, and zero external runtime dependencies**.
  - Never imports `src/client`, `src/server`, `src/baker`, or `src/netproto` (enforced by `tests/arch/boundaries.test.ts` Rules 1–4).
  - All file I/O is abstracted behind the dependency-injected `ArchiveSource` interface so this module runs identically in the browser main thread, WebWorkers, and Node.js CLI tools.

---

### 2. Directory Structure

```text
src/common/
├── mpq/             # Storm.dll MPQ archive reader, Hash/Block table decryption & multi-algorithm sector decompression
├── formats/         # Native binary format parsers (DC6, DCC, DT1, DS1, COF, PL2, PAL, CEL, PCX, TBL, AnimData, Automap, Bitstream)
├── data/            # D2DataRegistry data table center and TXT/JSON schema definitions
├── drlg/            # D2Common.dll 1.13c DRLG procedural level generators and collision/lighting grids
├── path/            # D2Common.dll 1.13c dynamic path computation (path-compute), step kinematics (step) & collision footprints (collision)
├── world/           # Shared level geometry, Objects.txt mode selectability / NPC static placeholder mapping (objects-meta) & environment lighting (environment)
├── items/           # Item stat engine, required level (ITEMS_GetRequiredLevel), Set bonuses (set-bonuses), affixes, sockets & tooltip builder
├── skills/          # Skill formulas, synergy calculations, town cast restrictions & level scaling curves
├── units/           # Unit StatList, 1.13c FCR/IAS/WSM animation speed formulas (char-anim-speed), dir64 helpers & unit states
├── i18n/            # D2Lang.dll string hashing and bilingual CHI/ENG TBL & tooltip lookup tables
├── rng/             # D2Rng (64-bit Carry-Multiply 0x6FDAA9E0) and SplitMix64 spatial hashing
└── pack-contract/   # Shared offline asset bundle schemas and fail-fast validators used by both Baker and Client
```

---

### 3. Core Subsystems

#### 3.1 MPQ & Binary Format Parsers (`mpq/`, `formats/`)
- **`mpq-reader.ts`**: Full MPQ v1 archive parser supporting Hash Table / Block Table seed decryption and single/multi-sector PKWARE DCL, Zlib, and Huffman decompression.
- **`dc6.ts` / `dcc.ts`**: Decodes UI, item, monster, and character sprite sequences and directional layers, including DCC variable-length bitstreams (`EqualCells` / `PixelMask` two-stage encoding).
- **`dt1.ts` / `ds1.ts`**: Parses floor/wall/roof isometric tiles (256×128 diamonds and RLE sub-blocks) and preset map stamps (Floor/Wall/Shadow/Object/Substitution layers and NPC paths).
- **`cof.ts` / `animdata.ts`**: Parses composite object animation frame counts, 16-layer draw priority tables, keyframe event triggers, and `AnimData.d2` frame speeds.
- **`pl2.ts` / `pal.ts`**: Parses 256-color act palettes, light attenuation tables, shadow blend tables, and `RandTransforms` / `Colormap` tint matrices.

#### 3.2 Data Registry (`data/`)
- **`D2DataRegistry` (`data/index.ts`)**: Central index for `Levels.txt`, `LvlTypes.txt`, `LvlPrest.txt`, `LvlMaze.txt`, `LvlSub.txt`, `MonStats.txt`, `MonStats2.txt`, `SuperUniques.txt`, `Missiles.txt`, `Overlays.txt`, `Objects.txt`, `Skills.txt`, `SkillDesc.txt`, `SetItems.txt`, `Sets.txt`, `Armor/Weapons/Misc.txt`, and all other 1.13c data tables.
- Supports both pre-baked JSON snapshots and on-demand MPQ parsing via `ArchiveSource`.

#### 3.3 1.13c DRLG Map Generation Engine (`drlg/`) & Dynamic Path Engine (`path/`)
Faithfully replicates `D2Common.dll`'s deterministic level generation and unit pathing pipelines:
- **Mandatory Universal DT1 Loading (`drlg-roomtile.ts`)**: Per `DRLGROOM_LoadDt1Files` (`0x6fdb8400`), every level unconditionally loads `Act1/Outdoors/Blank.dt1`, `InvisWal.dt1` (including `style=49, sequence=7` invisible collision floor), and `Warp.dt1`.
- **Three Generation Topologies**:
  - `drlg-preset.ts`: Fixed preset levels (Rogue Encampment, Lut Gholein, Tristram, Chaos Sanctuary, Durance of Hate Level 3, etc.).
  - `drlg-maze.ts`: Dungeon maze room stitching (Catacombs, Maggot Lair, Tal Rasha's Tomb, etc.).
  - `drlg-outdoors.ts` / `drlg-outwild.ts`: Outdoor borders, dirt roads, rivers, preset sub-maps, and themed wall enclosures (bit-exact against 1.13c `D2Common.dll`).
- **1.13c Dynamic Path & Collision Footprint Engine (`path/`)**:
  - Ports `D2Common` dynamic path computation (`path-compute.ts`), step kinematics (`step.ts`), and unit collision footprint checks (`collision.ts`).

#### 3.4 Deterministic PRNG (`rng/`) & Offline Asset Contracts (`pack-contract/`)
- **`D2Rng` (`rng/d2-rng.ts`)**: Bit-exact port of `D2Common.dll`'s 64-bit carry-multiply PRNG (`seed = (0x6AC690C5 * low32 + carry) >>> 0`), guaranteeing identical level topologies between the browser and native C++ D2GS for any 32-bit `mapSeed` and difficulty.
- **`pack-contract/`**: Defines schemas and fail-fast validators for all canonical offline asset bundles under `public/` (`act-packs/tiles`, `entities`, `chars`, `missiles`, `overlays`, `ui`, `ui/frontend`, `anim`, `weather`, etc., enforcing `missingFiles === 0` and verifying the 3 universal DT1s).

---

### 4. Common Verification Commands

```bash
# Run strict DOM-free / Node-free typecheck on src/common
npx tsc -p tsconfig.common.json --noEmit

# Run architectural boundary and DRLG / format unit tests
npx vitest run tests/arch/boundaries.test.ts tests/drlg-act1-oracle.test.ts
```
