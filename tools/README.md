# `tools` — Developer Debugging, Protocol Replay & Automated Verification Tooling

The `tools/` directory contains CLI utilities, a headless protocol test bot, a packet capture replayer, a `.d2s` save editor, 1.13c DRLG differential comparison tools, and automated verification scripts for the **Diablo II: Lord of Destruction (v1.13c) Web Port**.

---

### 1. Core Tools Overview

| Script / Directory | Example Command | Description |
| :--- | :--- | :--- |
| [`d2-bot.ts`](./d2-bot.ts) | `npm run bot -- --help` | Headless Battle.net / D2GS protocol test bot. Uses `src/netproto` over raw TCP or a WebSocket bridge to execute the full BNCS login $\rightarrow$ MCP character select / room creation $\rightarrow$ D2GS in-game walk/cast lifecycle without launching a browser. |
| [`netproto-replay.ts`](./netproto-replay.ts) | `npx tsx tools/netproto-replay.ts <file.d2cap>` | Offline replayer and analyzer for `.d2cap` packet capture files. Reconstructs frame-by-frame Huffman-decompressed S2C/C2S hex streams and decoded `ServerEvent` payloads to diagnose protocol bugs or unknown opcodes. |
| [`d2s-unlock.ts`](./d2s-unlock.ts) | `npx tsx tools/d2s-unlock.ts <char.d2s>` | One-click unlocker and editor for authentic 1.13c `.d2s` character save files. Modifies character level, stat/skill points, and gold, unlocks all 5-act waypoints and quest states across Normal / Nightmare / Hell, and recalculates the `.d2s` checksum. |
| [`drlg-diff.ts`](./drlg-diff.ts) | `npx tsx tools/drlg-diff.ts` | Deterministic DRLG differential comparison tool. Given a `mapSeed` and `areaId`, compares our TypeScript DRLG output against `D2Common.dll` ground truth across room topology, tile Style/Sequence, and collision grids. |
| [`render-drlg-compare.ts`](./render-drlg-compare.ts) | `npx tsx tools/render-drlg-compare.ts` | Renders DRLG collision grids, room boundaries, and tile layers into side-by-side comparison PNGs to visually inspect wall seams and doorway connectivity. |
| [`verify-play.ts`](./verify-play.ts) | `npx tsx tools/verify-play.ts` | End-to-end `play.html` smoke verifier: launches a headless browser to verify Battle.net frontend UI boot, WebGL2 context initialization, zero 404 static assets, and HUD responsiveness. |

---

### 2. Subsystem Verification Scripts (`tools/verify-*.ts`)

In addition to daily developer tools, `tools/` provides targeted verification scripts for core subsystems:

- **`verify-automap.ts` / `verify-plugin-menu-browser.ts` / `verify-quest-fx-browser.ts`**: Full-spectrum 136-level automap atlas (including 39-waypoint parity) verification, headless browser E2E testing for the plugin menu, and special monster affix / Boss death VFX browser verification.
- **`verify-environment-browser.ts`**: Headless browser verification of the 1.13c day/night clock (live S2C 0x53, injected Day / Dusk / Night / Dawn goldens with screenshots, campfire day/night switch, 136-level rendered ambient light audit). Needs `D2W_PUBLIC_DIR` (with `act-packs/tiles/index.json`) and `D2_DATA_DIR` (1.13c MPQs).
- **`verify-weather-browser.ts`**: Headless browser verification of the 1.13c weather (weather assets and LoadWeather, live rain in the Rogue Encampment, the `automap-reveal` plugin's `weatherOverride` select in PluginMenu switching between snow / rain / Default plus disable / re-enable, a 136-level rendered weather audit of rain / snow / splashes / bubbles against MPQ Levels.txt `Act` / `Rain` / `Mud`, and a 136-level × forced rain / snow simulation sweep). Per-pixel frame check: every rain / snow line pixel must hold its palette colour, and every other changed pixel must lie inside a splash / bubble cel rect. Needs `D2W_PUBLIC_DIR` (with `act-packs/tiles/index.json` and `weather/weather.json`) and `D2_DATA_DIR` (1.13c MPQs).
- **`verify-world-graph.ts` / `verify-world-walk.ts`**: Multi-act level connectivity graph and cross-level walkability verification.
- **`verify-combat.ts` / `verify-items.ts` / `verify-monsters.ts` / `verify-objects.ts`**: Combat simulation, 1.13c drop tables, monster attributes, and world object metadata verification.
- **`verify-formats.ts` / `verify-dc6.ts` / `verify-dcc.ts` / `verify-dt1-pixels.ts` / `verify-tbl.ts`**: Low-level binary format (DC6/DCC/DT1/DS1/TBL) and MPQ decompression verification.
- **`verify-bundle-no-mpq.ts` / `verify-deploy.ts` / `verify-renderer-lifecycle.ts`**: Verifies MPQ-free static bundle operation, deployment integrity, and WebGL2 renderer resource lifecycle.

---

### 3. Typical Usage Examples

#### Test Remote D2GS Connectivity with `d2-bot.ts`
```bash
# Connect to a remote Battle.net server over the WebSocket bridge, log in, and create a game
npm run bot -- \
  --bridge wss://www.laiseek.xyz/d2net \
  --user myaccount \
  --pass mypassword \
  --char MySorceress \
  --game test01
```

#### Replay a `.d2cap` Capture with `netproto-replay.ts`
After exporting a `.d2cap` session capture from `OnlineSession` or `d2-bot.ts`, replay it offline in the terminal:
```bash
npx tsx tools/netproto-replay.ts ./captures/session-2026.d2cap
```
