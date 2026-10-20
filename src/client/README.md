# `src/client` — Pure Browser WebGL2 Rendering & Interactive Client

`src/client` is the pure browser client implementation of **Diablo II: Lord of Destruction (v1.13c)**, corresponding to the original `D2Client.dll`, `D2Gfx.dll`, `D2Win.dll`, `D2Launch.dll`, and `D2Sound.dll`.

In **Single-Client Mode**, this module communicates with a remote native C++ PvPGN + D2GS (1.13c) server through `src/netproto`'s WebSocket bridge, performing seed-driven DRLG map reconstruction, 25Hz `LogicClock` simulation synchronization, WebGL2 isometric rendering (including authentic 1.13c sheared perspective ground shadows and 7-class paperdoll layer compositing), local movement prediction, and full classic HUD interactions in the browser.

### 1. Module Responsibilities & Architectural Boundaries

- **Composition Root & Non-Intrusive Plugin Host**:
  - [`play.html`](../../play.html) serves as the top-level Composition Root, using an inline `<script type="module">` to import `startPlayApp` from [`src/client/main.ts`](./main.ts) and `BUILTIN_PLUGINS` from [`plugins/index.ts`](../../plugins/index.ts).
  - Optional client extensions are completely decoupled into the top-level [`plugins/`](../../plugins) directory (shipping 5 built-in plugins: `kill-stats`, `drop-tracker`, `automap-reveal` [including automap reveal, radar markers, lighting presets & weather overrides], `extended-viewports`, and `hud-enhancements`, plus standalone dashboards [`plugins/kill-stats/index.html`](../../plugins/kill-stats/index.html) and [`plugins/drop-tracker/index.html`](../../plugins/drop-tracker/index.html)).
  - `src/client` exposes a read-only session view (`PluginSessionView`), controlled client capabilities (`PluginClientCapabilities`), dynamic toolbar contribution handles (`ToolbarContributionHandle.update`), lifecycle/language hooks, and the top toolbar plugin configuration modal (`PluginMenu`, `[data-d2-modal-overlay="plugins"]`) via [`src/client/plugin-host/`](./plugin-host). Disabling any plugin automatically reverts the client to 1.13c vanilla defaults (`automapReveal: 'off'`, automap radar disabled, `lightingPreset: 'auto'`, `weatherOverride: 'off'`, `640x480` / `800x600` viewports, and vanilla HUD display). **`src/client/**` has zero imports from `plugins/**` and zero string literal references to any plugin ID** (enforced by `tests/arch/boundaries.test.ts` Rule 2 and Rules 7–10).
- **TypeScript Compiler Constraints (`tsconfig.client.json` & `tsconfig.sw.json`)**:
  - `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: []` (the Service Worker uses `tsconfig.sw.json`).
  - **Never depends on `src/server` or `src/baker`**, and never imports Node.js builtins (`fs`, `path`, `net`, `Buffer`, etc.).
  - Depends solely on `src/common` (DRLG algorithms, dynamic pathing, binary parsers, data tables) and `src/netproto` (via the public barrel `src/netproto/index.ts` and `D2gsServerAdapter`).

---

### 2. Directory Structure

```text
src/client/
├── main.ts          # Main client entry: wires WebGL2 canvas, Toolbar, Battle.net frontend state machine, OnlineSession, PluginHost & render loop
├── loop/            # 1.13c LogicClock: 25Hz (40ms) tick accumulator, tick-debt catch-up before draw, and 10s/3s no-catch-up guard windows
├── session/         # OnlineSession coordinator, .d2cap offline capture replayer, and C2S OutboundRateLimiter
├── world/           # ClientWorld & ClientUnit: ServerEvent-driven authoritative state mirror, OP->ON object transitions, static NPC placeholder deduplication & unit hitboxes
├── map/             # Seed-driven client DRLG map service (MapService, LevelView, TileAtlas GPU streaming)
├── automap/         # 1.13c Automap cell manager, fog-of-war exploration persistence, reveal modes (off / level / act) & monster/shrine radar markers
├── input/           # CommandMapper: mouse/keyboard input mapping, melee interaction range checks, town skill restrictions (InTown), 120ms move coalescing & target lock
├── motion/          # Local player movement predictor (LocalMovementPredictor), remote entity interpolator & A* pathfinding
├── render/          # WebGL2 rendering pipeline (SpriteRenderer draw/drawQuad, TileAtlasGpuCache, EntityArtLoader, 8 D2Gfx blend modes)
├── scene/           # WorldRenderer (isometric depth sorting, unit perspective ground shadows, 7-class paperdoll PL2 tinting, missiles/overlays/monster death FX/shrine icons) & lighting presets
├── weather/         # 1.13c WeatherEngine rain/snow/lightning/splash/bubble particle simulation and weather asset loader (weather-assets)
├── view/            # Formula-derived viewport profiles (640x480 / 800x600 / 1024x768 / 1068x600 / 1280x720) & SceneSource
├── ui/              # In-game HUD rendering & interaction (HudManager, control bar, Minimap, 7 panels, Charsi Imbue panel, right-click identify scroll/tome, bitmap fonts)
├── ui-model/        # Pure UI view models (HudModel, character sheet dual AR/damage engine, Set item bonuses, skill tree, inventory/vendor/imbue/cube logic)
├── frontend/        # Battle.net pre-game UI (FrontendRenderer: bilingual ZH/EN Gateway select, login/registration, 8-slot 11-byte statstring paperdoll preview, lobby)
├── toolbar/         # Top 32px toolbar (connection status & RTT, server endpoint, viewport selector, audio/language toggles, Plugins menu & dynamic slot)
├── plugin-host/     # Non-intrusive plugin host & config store (PluginHost, PluginConfigStore, PluginMenu & public contract api.ts)
├── i18n/            # Client bilingual language state (lang.ts) and localization helpers
├── settings/        # Persistent client settings store (SettingsStore / client-settings.ts for server URLs and display preferences)
├── sw/              # Service Worker (sw.ts) + CacheUpdater: SHA-256 manifest-driven incremental asset caching
└── assets/          # OPFS (Origin Private File System) local MPQ import and cache support
```

---

### 3. Core Data Flows & Subsystems

#### 3.1 Single-Client Connection & Session Lifecycle (`frontend/`, `session/`, `world/`)
1. **Battle.net Pre-Game Flow (`FrontendRenderer` + `D2OnlineFlow`)**:
   - Loads `/ui/frontend/frontend-ui.json` on boot to render the authentic login screen, account registration, character selection (parsing 11-byte `statstring` data into live 7-class paperdoll avatars), and Battle.net lobby (Create Game / Join Game) with bilingual ZH/EN UI support.
   - Connects sequentially to BNCS (`/bnet`) and MCP (`/realm`) through `wsBridgeUrl` (default `/d2net`, configurable via `?wsBridge=...` or the toolbar Settings modal).
2. **Entering the Game (`OnlineSession` + `ClientWorld`)**:
   - Connects to D2GS (`/game`) using the `GameHash` and `GameToken` issued by MCP and initializes `D2gsServerAdapter`.
   - `OnlineSession` subscribes to all `ServerEvent` emissions to update `ClientWorld` with local player stats, inventory/equipped items, nearby monsters/NPCs (reconciling static town placeholder Objects against dynamic NPCs), ground drops, and quest/waypoint progress, while automatically transitioning operating objects (`OP (1) -> ON (2)`) such as Town Portals, Waypoints, and the Durance Level 3 `HellGate`.

#### 3.2 Seed-Driven Client DRLG Map Reconstruction (`map/`, `automap/`)
Native D2GS **never** transmits full tile maps over the network; it only sends the **32-bit `mapSeed`** and `areaId` in `0x03 (LoadAct)` (followed by `0x07/0x08` room notifications):
- Upon receiving `LoadAct`, `MapService` runs the deterministic 1.13c DRLG algorithms from `src/common/drlg` using `mapSeed` to reconstruct the entire Floor / Wall / Roof / Collision grid in milliseconds.
- Streams the required `LvlType` tile atlases from `/act-packs/tiles/` into `TileAtlasGpuCache`.

#### 3.3 25Hz LogicClock, Movement Prediction & Network Smoothing (`loop/`, `motion/`, `input/`)
- **`LogicClock` (`loop/`)**: Advances client simulation and animation ticks at the exact 1.13c 25Hz (40ms/tick) cadence, accumulating tick debt and catching up before rendering (with 10s/3s guard windows).
- **`LocalMovementPredictor` & `CommandMapper`**: Predicts local player movement across walkable subtiles, bridges (`MephistoBridge`), and opened doors while throttling outbound `0x01 (Walk)` / `0x03 (Run)` packets via `OutboundRateLimiter` (120ms movement coalescing) and enforcing melee contact range before interacting with NPCs, chests, waypoints, or portals.
- **`RemoteEntityInterpolator`**: Combines D2GS `0x67/0x68/0x69/0x6D` velocity and drift-check points to interpolate remote entities at 60fps with 25Hz frame-by-frame turn transitions.

#### 3.4 WebGL2 Isometric Renderer & Classic HUD (`render/`, `scene/`, `ui/`)
- **Depth Sorting & Isometric Perspective Ground Shadows (`WorldRenderer`)**:
  - Draws floor tiles, authentic 1.13c perspective unit ground shadows (`drawQuad` with `scaleY = 0.5`, `shearX = -0.5`, `rgba(0,0,0,0.5)` anchored at foot baselines), ground item flippy animations, 7-class multi-part paperdoll DCC/DC6 layers (with per-layer `PL2` palette row remapping), projectiles, state overlays (`States.txt` / `overlay.bin`), special monster affix & Boss death VFX, shrine overhead icons, and roof overhangs sorted by isometric sub-tile depth.
- **Complete Classic HUD Panels (`ui/`, `ui-model/`)**:
  - Character sheet (`C`/`A`, enforcing 1.13c Left=Max / Right=Current vital boxes and syncing equipment/state max vitals into HUD globes), Inventory & Equipment (`I`/`B`, supporting right-click Scroll/Tome of Identify `C2S 0x20` / `S2C 0x3F` targeting and instant `hoveredItem` tooltip refresh upon identification), full Set item bonus/roster tooltips, Skill Tree & Speedbar (`T`/`S`), Quest Log (`Q`), top-left Party/Mercenary/Summon portraits (`O`), Waypoint menu, NPC trade/gamble/repair panels, Charsi Imbue panel (`C2S 0x38` / `S2C 0x58`), Stash, Horadric Cube, and accurate Tab Automap (`Minimap`).

---

### 4. Common Development & Verification Commands

```bash
# Start local Vite dev server (listens on http://127.0.0.1:5173/play.html)
npm run dev

# Run strict typecheck for src/client and the Service Worker
npx tsc -p tsconfig.client.json --noEmit && npx tsc -p tsconfig.sw.json --noEmit

# Build production static client bundle
npm run build
```
