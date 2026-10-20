# `src/baker` — Offline MPQ Asset & Data Table Baking Pipeline

`src/baker` is the Node.js offline asset baking toolchain. It decodes, palette-maps, packs, and validates original **Diablo II: Lord of Destruction (v1.13c)** MPQ archives (`d2data.mpq`, `d2char.mpq`, `d2exp.mpq`, `Patch_D2.mpq`, `d2sfx.mpq`, etc.) into static sprite atlases and binary bundles under `public/` so the browser client can consume them directly with zero runtime MPQ overhead.

### 1. Module Responsibilities & Architectural Boundaries

- **TypeScript Compiler Constraints (`tsconfig.baker.json`)**:
  - `lib: ["ES2022"]`, `types: ["node"]` — **Pure Node.js CLI module; referencing any browser DOM global is strictly forbidden** (enforced by `tests/arch/boundaries.test.ts` Rule 5).
  - Depends solely on `src/common` (shared MPQ reader, binary format parsers, and `pack-contract` validators); never imports `src/client`, `src/server`, or `src/netproto`.
- **Unified CLI Entry**: [`src/baker/cli.ts`](./cli.ts) (invoked via `npm run bake -- <target>`).

---

### 2. Directory Structure

```text
src/baker/
├── cli.ts                  # Unified CLI entry point supporting individual targets, full bake (all), and contract verification (--verify)
├── index.ts                # Module barrel export
├── mpq-archive-source.ts   # Multi-archive priority MPQ reader backed by local files in samples/d2/
├── packers/                # Asset & data packers (tiles, entities, character paperdoll layers, missiles, overlays, UI, frontend, animdata, drop/path tables)
├── extract/                # 1.13c TXT/BIN table extractors, skill-tree/affix/gem dictionary generators, TTF font builder & D2Net/D2Common table scripts
├── io/                     # 32-bit RGBA PNG encoder, TBL writer, SHA-256 asset-manifest.ts generator & pack publishing utilities
└── audit/                  # Fail-fast bake integrity auditors (verify-packs, verify-tiles, verify-tile-alignment, verify-entity-packs, verify-audio-113c)
```

---

### 3. Bake Targets & Output Artifacts

Running `npm run bake -- <target>` (or the corresponding `npm run pack:*` shortcut) extracts and generates the following static assets from the MPQ files in `samples/d2/`:

| Bake Subcommand (`cli.ts`) | `npm run` Shortcut | Implementation File | Output Path | Description |
| :--- | :--- | :--- | :--- | :--- |
| `tiles` | `npm run pack:tiles` | `packers/pack-tiles.ts` | `public/act-packs/tiles/` | Bakes all 233 level DT1s across 5 acts + the 3 universal DT1s (`Blank.dt1`, `InvisWal.dt1`, `Warp.dt1`) into tile atlases and `drlg-bundle.{json,bin}` |
| `ui` | `npm run pack:ui` | `packers/pack-ui.ts` | `public/ui/` | Bakes in-game HUD control panel, panel backgrounds, buttons, 7-class skill icons, cursors, and inventory grid DC6 sprites |
| `frontend-ui` | `npm run pack:frontend` | `packers/pack-frontend-ui.ts` | `public/ui/frontend/` | Bakes Battle.net login screen, character selection campfire background, 7-class character creation animations, and lobby UI assets |
| `cursor` | `npm run bake -- cursor` | `packers/pack-cursor.ts` | `public/ui/cursor.png` | Bakes cursor sprite atlas and generates `cursor-meta.ts` |
| `skills` | `npm run bake -- skills` | `packers/pack-skill-assets.ts` | `public/skills/` | Extracts 7-class and general skill icon sprites and `manifest.json` |
| `animdata` | `npm run pack:animdata` | `packers/pack-animdata.ts` | `public/anim/` | Extracts `data/global/AnimData.d2` COF frame counts, animation speeds, and keyframe trigger events |
| `characters` | `npm run bake -- characters` | `packers/pack-characters.ts` | `public/entities/` | Bakes 7-class base torso atlases (`char-*.r8` / `char-*.json`) and `character-manifest.json` |
| `char-layers` (`char-so`) | `npm run pack:char-so` | `packers/pack-char-so-layers.ts` | `public/chars/` | Bakes 7-class 16-component paperdoll weapon/armor layer DCC/COF atlases |
| `entities` | `npm run pack:entities` | `packers/pack-entity-assets.ts` | `public/entities/` | Bakes all monsters, SuperUniques (automatically bundling their Minions), NPCs, and interactive world Objects into DCC/DC6/COF atlases |
| `missiles` | `npm run pack:missiles` | `packers/pack-missiles.ts` | `public/missiles/` | Bakes all `Missiles.txt` projectile 32-bit RGBA atlases (with zero-black-fringe alpha filtering for `Trans: 1` spells and blend mode metadata) |
| `overlays` | `npm run pack:overlays` | `packers/pack-overlays.ts` | `public/overlays/` | Bakes all `Overlays.txt` auras, curses, buffs, hit effects, shrine icons, and level-up beams into DCC atlases |
| `overlay-rows` | `npm run bake -- overlay-rows` | `packers/pack-overlay-rows.ts` | `src/common/data/overlay-rows-113c.ts` | Extracts 1.13c state overlay parameter tables from `overlay.bin` and `States.txt` |
| `input-tables` | `npm run bake -- input-tables` | `packers/pack-input-tables-113c.ts` | `src/common/data/input-tables-113c.ts` | Extracts 1.13c hotkey, control action, and input mapping tables |
| `monstats2-flags` | `npm run bake -- monstats2-flags` | `packers/pack-monstats2-flags.ts` | `src/common/data/monstats2-flags-113c.ts` | Extracts `MonStats2.txt` monster collision/draw/corpse/automap flag tables |
| `monster-path` | `npm run bake -- monster-path` | `packers/pack-monster-path-data.ts` | `src/common/data/monster-path-data-113c.ts` | Extracts `MonStats.txt` / `MonStats2.txt` monster pathfinding footprint, velocity, and door flags |
| `acts` | `npm run pack:acts` | `packers/pack-act-assets.ts` | `public/packs/act1..act5/` | Bakes 5-act prebaked level scenes (`act1..act5/`), object pages, `index.json`, and `world-graph.json` |
| `drop-data` | `npm run bake -- drop-data` | `packers/pack-canonical-drop-data.ts` | `src/common/data/canonical-drop-data.ts` | Extracts and audits `MonStats`, `SuperUniques`, and `DifficultyLevels` canonical drop tables |
| `tbl` | `npm run bake -- tbl` | `packers/pack-canonical-tbl.ts` | `src/common/i18n/canonical-tbl-data.ts` | Extracts canonical bilingual `.tbl` string tables (including expansion NPC dialogue Chinese translations) |
| `weather` | `npm run pack:weather` | `packers/pack-weather.ts` | `public/weather/weather.json` | Extracts what the 1.13c weather (LoadWeather 0x6fb31750) reads: the 5 act `pal.dat` palettes and the drawn `Rain3`/`Rain4`/`bubble3` DC6 splash/bubble frames (indexed atlas) |
| `sound-tables` | `npm run pack:sound-tables` | `packers/pack-sound-tables.ts` | `src/common/audio/sounds-113c.ts`, `src/common/audio/sound-environ-113c.ts` | Extracts the 1.13c `Sounds.txt` (4,699 rows, with the D2Client 0x6fb0e8e1 load post-processing), `SoundEnviron.txt` (50 rows) and `Levels.txt` `SoundEnv` (136 levels) from `Patch_D2.mpq` |
| `sfx` | `npm run pack:sfx` | `packers/pack-sfx.ts` | `public/sound/packs/sfx-core{,-2,-3}.bin` | Transcodes the 653 core resident SFX from `d2sfx.mpq` / `d2exp.mpq` into 32 kbps CBR Ogg Opus (`core.bin` + `core.json`) via `ffmpeg` (`libopus`) |
| `music` | `npm run pack:music` | `packers/pack-music.ts` | `public/music/` | Transcodes the 34 BGM & cutscene tracks from `d2music.mpq` / `D2xMusic.mpq` into 64 kbps CBR WebM Opus under `public/music/` via `ffmpeg` (`libopus`) |
| `manifest` | `npm run pack:manifest` | `io/asset-manifest.ts` | `public/asset-manifest.json` | Recursively scans `public/` to compute byte sizes and SHA-256 hashes for incremental Service Worker caching |
| `--verify` | `npm run bake:verify` | `cli.ts` + `audit/verify-entity-packs.ts` + `audit/verify-audio-113c.ts` | *(Console audit report)* | Runs strict `src/common/pack-contract` validation, enforcing `missingFiles === 0`, verifying all 3 universal DT1s across 136 levels, and auditing entity packs & drop data parity; finally runs the same 1.13c audio audit as `npm run verify:audio` (`tables` / `sfx-core` / `music`; any failure fails the command) |

---

### 4. Usage

#### 4.1 Prepare Original 1.13c MPQ Files & `ffmpeg`
All baked artifacts under `public/` are git-ignored (`.gitignore`). On a fresh clone, install `ffmpeg` compiled with `libopus` (`ffmpeg >= 7.0` recommended; defaults to `/usr/bin/ffmpeg` and can be overridden via `FFMPEG_PATH=/path/to/ffmpeg` or `--ffmpeg /path/to/ffmpeg`), and place or symlink your original **Diablo II: Lord of Destruction v1.13c** MPQ archives in `samples/d2/` at the repository root (or set `D2_DATA_DIR`):

```text
samples/d2/
├── d2data.mpq       # Required: base data, Act 1-4 tiles, monsters, UI
├── d2char.mpq       # Required: character paperdoll layer DCC/COF animations
├── d2exp.mpq        # Required: Lord of Destruction expansion (Act 5, Druid/Assassin, expansion items/runes/SFX)
├── Patch_D2.mpq     # Required: final 1.13c patch data tables (Levels.txt, Skills.txt, SuperUniques.txt, Sounds.txt, etc.)
├── d2sfx.mpq        # Required: base game SFX WAVs (pack:sfx / verify:audio)
├── d2music.mpq      # Required: Act 1-4 music WAVs (pack:music / verify:audio)
├── D2xMusic.mpq     # Required: Act 5 expansion music WAVs (pack:music / verify:audio)
├── d2speech.mpq     # Required: Act 1-4 speech/cinematic audio WAVs
└── d2xtalk.mpq      # Required: Act 5 expansion speech WAVs
```

> **Notes (`ffmpeg` Version Sensitivity & Orphan Cleanup)**:
> - `verify-audio-113c.ts` (`sfx-core`) requires decoded Opus durations to match the 1.13c 22.05 kHz WAV duration within `±2.00ms`. Legacy `ffmpeg` builds (e.g. 2018 `N-47683`) append `~158` trailing samples (`+3.3ms`) during `22.05kHz -> 48kHz` resampling, causing 627/653 rows in `sfx-core` to fail. Upgrade to `ffmpeg >= 7.0` (e.g. `7.0.2` / `8.1.2`) and re-run `npm run pack:sfx && npm run pack:manifest`.
> - When bake targets change across milestones, clean `public/` before running `npm run bake -- all` so stale orphan files are not indexed into `public/asset-manifest.json`.

#### 4.2 Run Full or Granular Baking

```bash
# Run full offline asset bake (animdata -> tiles -> characters -> char-layers -> entities -> overlay-rows -> cursor -> missiles -> overlays -> ui -> frontend-ui -> skills -> drop-data -> tbl -> weather -> sound-tables -> sfx -> music -> manifest)
npm run bake -- all

# Override ffmpeg binary path if not located at /usr/bin/ffmpeg:
# FFMPEG_PATH=/opt/homebrew/bin/ffmpeg npm run bake -- all
# npm run bake -- all --ffmpeg /opt/homebrew/bin/ffmpeg

# (Optional) Bake 5-act prebaked map scenes & world graph (public/packs/) and refresh manifest
npm run pack:acts && npm run pack:manifest

# Or bake individual asset categories on demand:
npm run pack:tiles
npm run pack:frontend
npm run pack:entities
npm run pack:char-so
npm run pack:weather
npm run pack:sfx
npm run pack:music
npm run pack:manifest

# Verify baked output against fail-fast contracts
npm run bake:verify
```
