# d2web

Diablo II: Lord of Destruction 1.13c, running in the browser, with a set of quality-of-life mods on top.

This is my own build of [troytt/diablo2-web](https://github.com/troytt/diablo2-web), a TypeScript/WebGL2 port of the 1.13c client. It speaks the original Battle.net, realm and game-server protocols, so it plays on a real PvPGN + D2GS 1.13c server. Upstream publishes snapshots of its source every few days. This repo pulls those in automatically and keeps my changes on top.

No Blizzard assets are included. You need your own copy of the game's MPQ files.

## What's added

Everything below is a plugin, and each one can be switched off from the Plugins button (the puzzle piece) in the toolbar. Choices are saved per browser.

### Gameplay
| Mod | Default | What it does |
|---|---|---|
| Auto-Fight | off | Press a hotkey (E by default) to toggle. Your left skill attacks the nearest enemy on screen that you can actually walk to, skipping anything behind walls or in other rooms. It opens closed doors in the way, and never swings at corpses. |
| Auto-Potion | off | Drinks healing, mana and rejuvenation potions at thresholds you set (life 65%, rejuvenation 35% by default), inventory first, then belt. It uses a rejuvenation when life and mana are both low, and feeds your mercenary. It picks up nearby potions when you're running low, and warns you above the life orb when you're out. |
| Auto Gold Pickup | off | Grabs gold within reach, and walks over to nearby piles when idle. |
| Hold-and-Drag Interact | on | Holding the mouse also picks up items and attacks whatever you drag across. |
| Stash: Deposit All | on | One button on the stash moves your inventory in. |

### Display
| Mod | Default | What it does |
|---|---|---|
| Experience Bar | on | XP bar at the top with live xp/hour and time-to-level on hover. Every gain floats up as "+1,234 xp" just under the map. |
| Item Info | on | Item level in tooltips, plus sockets, ethereal and item level on ground labels (`Short Staff [5os · eth · ilvl 26]`). Optional always-on labels and a loot filter (Hide junk / Valuables only). |
| Monster Resists | on | Every non-zero resistance under the monster health bar, e.g. "Fire 50%". |
| Upgrade Markers | on | A green + or ++ on items that beat what you're wearing, class-aware. |
| Run Timer | on | Toolbar readout of run count, current and average run time, and runs per hour. Click to reset. |

### Rendering
- The camera snaps to whole screen pixels, so sprites don't shimmer while moving.
- Dithered lighting removes banding in dark torch gradients.
- The 30 fps cap is evenly paced on high-refresh screens.
- Pixel-perfect integer scaling when post-processing is off.
- Clicks register immediately instead of waiting out the movement cooldown.

Upstream's own extras (automap reveal, drop tracker, kill stats, extended viewports, quick cast, next game, HUD and ground-item enhancements, PD2-style HD text and upscaling) are all still here.

## Running it

Requirements:
- Node 20 or newer.
- The 1.13c MPQs: d2data, d2exp, d2char, d2sfx, d2music, d2speech, d2xtalk, Patch_D2 and D2xMusic.
- ffmpeg 7 or newer with libopus, for the audio bake.

```bash
npm install
# copy your MPQs into samples/d2/
npm run bake -- all --ffmpeg /path/to/ffmpeg
npm run bake -- manifest
npm run dev
```

Then open http://127.0.0.1:5173/play.html.

By default, the dev server proxies the game connection (`/d2net`) to upstream's public test server at `www.laiseek.xyz`. To use your own PvPGN + D2GS server, change the proxy target in `vite.config.ts`, or enter its address in the server field on the login screen.

## Checks

```bash
npm run typecheck
npx vitest run
npm run verify:play   # headless end-to-end run against the live server; needs the dev server up
```

## Staying in sync with upstream

- **Branches:** `upstream` holds troytt's snapshots, each one stacked as a normal commit on the previous, and `main` is that plus my work.
- **The sync job:** a daily GitHub Action adds any new snapshot to `upstream` and opens a pull request to merge it into `main`. To run the same thing locally, use `tools/sync-upstream.sh`.
- **This README stays mine:** it's marked `merge=ours` in `.gitattributes`, so upstream's README never overwrites it.

## Credits

- [troytt/diablo2-web](https://github.com/troytt/diablo2-web) wrote the port itself: the renderer, the DRLG and the protocol stack.
- [D2MOO](https://github.com/ThePhrozenKeep/D2MOO), the community reconstruction of the original engine, which upstream ports from in places.
- [StormLib](https://github.com/ladislav-zezula/StormLib), the reference for the MPQ format (see THIRD_PARTY_NOTICES.md).

Diablo II is a trademark of Blizzard Entertainment. This project isn't affiliated with or endorsed by Blizzard.
