# Diablo II v1.13c Reverse-Engineering Knowledge Base (`kb/`)

> **Ground Truth Invariant**: All documents in this knowledge base are reverse-engineered strictly and exclusively from the original Diablo II: Lord of Destruction v1.13c binary assembly (`D2Client.dll`, `D2Game.dll`, `D2Common.dll`, `D2CMP.dll`, `D2Multi.dll`, `D2MCPClient.dll`, `D2Gfx.dll`, `D2Win.dll`, `D2Lang.dll`, `Storm.dll`, `Fog.dll`, etc.) and official Blizzard 1.13c MPQ data tables (`Skills.txt`, `Missiles.txt`, `MonStats.txt`, `SuperUniques.txt`, `Objects.txt`, `Inventory.txt`, `States.txt`, `PetType.txt`, etc.) in `/usr/local/google/home/taodao/d2-data/` (`samples/d2/`) as the sole ground truth.

---

## Directory Structure

```
kb/
├── README.md                                  # Knowledge base index and architecture overview (this file)
├── audio/                                     # Sound tables and the sound record layer
│   ├── d2gs-0x2c-playsound-113c.md            # D2GS 0x2C sound event code dispatch (0x6fb5d740 -> 0x6fad3f20 -> 0x6fad3200) and the 0xA4 guard
│   └── sound-records-113c.md                  # Sounds.txt post-load processing, PlaySound/SoundUpdate/StartSound/AllocChannel and D2sound output
├── items/                                     # Item system and rendering rules
│   ├── d2client-ethereal-item-rendering.md    # Ethereal item 50% translucent rendering and the GFX_DrawItem calling convention
│   ├── d2client-unidentified-tooltip-reqlevel.md # Gating of the required level line in unidentified item tooltips
│   └── item-addskill-tab-encoding-113c.md     # stat 188 skill tab param encoding tab + 8*class (func 10 / descfunc 14)
├── monsters/                                  # Monster system and attribute resolution
│   ├── d2client-champion-monster-name-113c.md # Champion flag bits, affixes and lifebar name priority
│   └── d2client-npc-interaction-range-113c.md # NPC click interaction range (#10407) and per-frame dialog guard (alive check only)
├── objects/                                   # World objects and interaction logic
│   ├── d2-npc-placeholder-objects-113c.md     # Static town NPC placeholder Objects (InitFn 18/19) and mutual hiding with dynamic entities
│   └── d2client-object-interact-hittest-113c.md # Object interaction range calculation (#10594) and screen click hit testing
├── render/                                    # Rendering and lighting
│   ├── d2client-drawmode-113c.md              # Draw mode summary, client missile animation rate (AnimSpeed<<4), CltDoFunc 25 64-missile ring, States castoverlay
│   └── d2client-unit-light-records-113c.md    # Unit light records (player/monster/missile/overlay) and stat 89/90 callbacks
├── ui/                                        # User interface, HUD and lobby protocol
│   ├── d2client-automap-waypoint-parity.md    # Automap waypoint glyphs for all 39 waypoints (307 / 617..619), floor layer vs. object layer alignment
│   ├── d2client-charsheet-vitals-113c.md      # Character sheet (C/A key) stamina/life/mana two-box layout and bottom bar orb max aggregation
│   ├── d2client-hireables-portrait-lifebar.md # Top-left minion/mercenary portrait and lifebar sizes and rendering rules
│   ├── d2client-level-entry-title-113c.md     # Centered "Entering xxx" area title (0x6fb6f0d0): EntryFile DC6, quest override table, 120 frames, textShifts[1]
│   ├── d2client-npc-menu-quest-gates-113c.md  # NPC menu quest gate table (0x6fba2330): Tyrael travel to Harrogath = q[28] bit0 + expansion
│   ├── d2client-mercenary-screen-113c.md      # Mercenary equipment/stats panel (O key screen) coordinates and layout
│   ├── d2client-vendor-stash-gold-display.md  # Vendor/personal stash gold box rendering layout and text alignment
│   └── d2multi-join-game-panel-113c.md        # Multiplayer lobby join game panel control table and MCP 0x06 protocol
└── skills/                                    # Skill and missile reverse-engineering reference
    ├── d2-skills-missiles-dispatch-tables.md  # Master dispatch function tables for all skills and missiles, plus generic actions (Dispatch Tables)
    ├── client-state-ids-113c.md               # Real States.txt row numbers used by client skill prediction (blaze 13 / conviction 28 / stunned 21 / cold 11 etc.) and durations in frames
    ├── bosses/                                # Boss and super unique skills
    │   ├── skills-boss-act1-act2-act3.md      # Act 1-3 boss skills (Andariel, Duriel, Mephisto, etc.)
    │   ├── skills-boss-act4-diablo.md         # Act 4 boss skills (Diablo, Chaos Sanctuary seal bosses, etc.)
    │   └── skills-boss-act5-baal-ubers.md     # Act 5 & 6 boss skills (Baal, the three Hellfire Torch ubers, etc.)
    ├── missiles/                              # Missile mechanics and client trajectory rendering
    │   └── d2client-meteor-cltdofunc-clthitfunc.md # Meteor fall trajectory, impact flash and ground fire logic
    └── player/                                # Skill trees for the seven player classes (21 docs, 210 skills)
        ├── skills-ama-bow-crossbow.md         # Amazon: Bow & Crossbow
        ├── skills-ama-javelin-spear.md        # Amazon: Javelin & Spear
        ├── skills-ama-passive-magic.md        # Amazon: Passive & Magic
        ├── skills-ass-martial-arts.md         # Assassin: Martial Arts
        ├── skills-ass-shadow-disciplines.md   # Assassin: Shadow Disciplines
        ├── skills-ass-traps.md                # Assassin: Traps
        ├── skills-bar-combat.md               # Barbarian: Combat Skills
        ├── skills-bar-masteries.md            # Barbarian: Combat Masteries
        ├── skills-bar-warcries.md             # Barbarian: Warcries
        ├── skills-dru-elemental.md            # Druid: Elemental Skills
        ├── skills-dru-shapeshifting.md        # Druid: Shape Shifting
        ├── skills-dru-summoning.md            # Druid: Summoning
        ├── skills-nec-curses.md               # Necromancer: Curses
        ├── skills-nec-poison-bone.md          # Necromancer: Poison & Bone
        ├── skills-nec-summoning.md            # Necromancer: Summoning
        ├── skills-pal-combat.md               # Paladin: Combat Skills
        ├── skills-pal-defensive-auras.md      # Paladin: Defensive Auras
        ├── skills-pal-offensive-auras.md      # Paladin: Offensive Auras
        ├── skills-sor-cold.md                 # Sorceress: Cold Spells
        ├── skills-sor-fire.md                 # Sorceress: Fire Spells
        └── skills-sor-lightning.md            # Sorceress: Lightning Spells
```

---

## 1. Item System and Rendering Rules (`items/`)

| Document | Key RE addresses / modules | Key mechanics and rules |
|---|---|---|
| [`items/d2client-ethereal-item-rendering.md`](./items/d2client-ethereal-item-rendering.md) | `D2Client.dll` `0x6FB1B5A0` (`GFX_DrawItem`), `D2gfx.dll` `0x6FA8B080` | 2D UI sprites of ethereal items (`IFLAG_ETHEREAL = 0x00400000`) are drawn with `DRAWMODE_TRANS50 = 1` (50% opacity); gems/runes socketed into ethereal items stay 100% opaque (`DRAWMODE_NORMAL = 5`). |
| [`items/d2client-unidentified-tooltip-reqlevel.md`](./items/d2client-unidentified-tooltip-reqlevel.md) | `D2Client.dll` `0x6FB43D89`, `D2Common.dll` `0x6FD76190` | The `Required Level` line is strictly suppressed in tooltips of unidentified items; affixes only contribute to the required level once the item is identified (`IFLAG_IDENTIFIED = 0x10`). Unidentified charms have no effect in the inventory. |
| [`items/item-addskill-tab-encoding-113c.md`](./items/item-addskill-tab-encoding-113c.md) | `D2Common.dll` `0x6FD98470` (property func 10), `D2Client.dll` `0x6FB052E2` (descfunc 14) | The `skilltab` par (linear `class*3+tab`, 0..20) is encoded as `tab + 8*class` when written to stat 188 (Save Param Bits 16); on display `class = param>>3`, `tab = param&7`, and `tab>=3` is not shown. Sorceress Fire = 8 (previously misread as linear key 8 = Necromancer Summoning, #925). |

---

## 2. Monster System and Attribute Resolution (`monsters/`)

| Document | Key RE addresses / modules | Key mechanics and rules |
|---|---|---|
| [`monsters/d2client-champion-monster-name-113c.md`](./monsters/d2client-champion-monster-name-113c.md) | `D2Game.dll` `0x6FC43D5E`, `D2Client.dll` `0x6FAD0620` | Champions set the `0x04` flag on spawn and carry a Champion-only `MonUMod.txt` affix (36: Ghostly, 37: Fanatic, 38: Possessed, 39: Berserker). When the client resolves the display name and lifebar color, `0x04` takes priority over the plain `0x08` (Unique), and the lifebar is always blue (`color = 3`). |
| [`monsters/d2client-npc-interaction-range-113c.md`](./monsters/d2client-npc-interaction-range-113c.md) | `D2Common.dll` `#10407` (`0x6FDCFCD0`), `D2Client.dll` `0x6facafea`, `0x6fac9ef0`, `0x6faf83b0` | Clicking a monster/NPC is checked with the unit-size-corrected distance `#10407`: threshold `2` if MonStats `interact` is set, otherwise `5`; the pending interaction after walking up requires `#10407 <= 2` and `#10324(..., 0x804) == 0`. Once the NPC dialog is open, the per-frame guard `0x6faf83b0` only checks that the player/NPC are alive (player mode `0x11`, NPC mode `0xC`) and **does not recheck distance** (Issue #890). |

---

## 3. World Objects and Interaction Logic (`objects/`)

| Document | Key RE addresses / modules | Key mechanics and rules |
|---|---|---|
| [`objects/d2-npc-placeholder-objects-113c.md`](./objects/d2-npc-placeholder-objects-113c.md) | `D2Game.dll` `0x6fc89140`, `D2Client.dll` `0x6fad5120`, `Objects.txt` (`InitFn 18/19`) | Static town NPC placeholder Objects (`121/122` Jerhyn, `378/379` Hratli, `461/462` Qual-Kehk, `542/543` Anya, `Token=ss`, `Selectable=0`) and the dynamic NPC entities from `0xAC AssignNPC` (`hcIdx = 201, 253, 515, 512`) hide each other, which removes the duplicate ghost clone (Issue #900). |
| [`objects/d2client-object-interact-hittest-113c.md`](./objects/d2client-object-interact-hittest-113c.md) | `D2Common.dll` `#10594` (`0x6fd81000`), `D2Client.dll` `0x6fb568e0` | Object interaction range is computed strictly from the `SizeX`/`SizeY` bounding box in `Objects.txt` with the 4 extreme corners excluded (e.g. the 5×5 footprint of the Tree of Inifuss `Id=30` lets you interact from its edge); the screen hit test branches between the fixed `CollisionSubst` bounding box and the extended bounds of the DCC/DC6 animation frame. |

---

## 4. User Interface, HUD and Lobby Protocol (`ui/`)

| Document | Key RE addresses / modules | Key mechanics and rules |
|---|---|---|
| [`ui/d2client-automap-waypoint-parity.md`](./ui/d2client-automap-waypoint-parity.md) | `D2Client.dll` `0x6FB12580` (`AUTOMAP_RevealRoom`), `0x6FB11D00..0x6FB11E60` (`AUTOMAP_AddRoomUnits`) | Automap waypoint glyphs are kept strictly in line with `Objects.txt` / `AutoMap.txt`: Act 1–4 and Harrogath waypoints with `AutoMap == 0` are expressed only through the floor layer (`Tile="fl", Style=0, Seq=54 -> 307`), the saved town base maps (`40, 103, 109`) or the Arcane Sanctuary floor (`617..619`), and never inject an extra offset `307` into `pObjects`; only `Id = 402` (Level 74 only) and the Act 5 outdoor/cave/temple waypoints (`494, 496, 511, 539`) write a single `307` into `pObjects` (Issue #867). |
| [`ui/d2client-charsheet-vitals-113c.md`](./ui/d2client-charsheet-vitals-113c.md) | `D2Client.dll` `0x6FB6CEA0` (`UI_DrawCharSheet`), `0x6FB8D6F0`, `0x6FAD7BD0`, `0x6FAD7A90`, `D2Common.dll` `#10913/#10186/#10578` | The character sheet's stamina/life/mana two-box layout follows `0x6FB8D6F0` entries `[7]..[13]` exactly: **the left box (`ox+250`) shows the max value** (blue text when boosted), **the right box (`ox+291`) shows the current value** (white text); the max values for the bottom bar life/mana orbs and stamina bar are all aggregated through `StatOpEngine` from equipment, charms, passives and state bonuses, so a full-life current value is not clamped to the naked `BaseStats` (Issue #903). |
| [`ui/d2client-hireables-portrait-lifebar.md`](./ui/d2client-hireables-portrait-lifebar.md) | `D2Client.dll` `0x6FB0AC70..0x6FB0C7F0` (`Hireables.cpp`) | Rules for drawing the top-left minion and mercenary portrait frames: 46×41 px portrait, 46×5 px lifebar, three-color life percentage thresholds (green $\ge 50\%$, yellow $25\%\sim 49\%$, red $< 25\%$) and a 56px horizontal step. |
| [`ui/d2client-mercenary-screen-113c.md`](./ui/d2client-mercenary-screen-113c.md) | `D2Client.dll` `0x6fb4ae80` (`UI_DrawMercScreen`) | 800×600 and 640×480 layouts of the mercenary equipment/stats panel (opened with `O`), head/body/left/right hand slot coordinates, layout of the 12 stat text lines and the gold/red text gating for resistances. |
| [`ui/d2client-vendor-stash-gold-display.md`](./ui/d2client-vendor-stash-gold-display.md) | `D2Client.dll` `0x6FB3CFB0` (`HUD_DrawPanelGoldBox`) | Rules for drawing the recessed gold box at the bottom of the stash (`nMode=0`), inventory (`nMode=1`) and vendor shop (`nMode=2`), covering the `STAT_GOLDBANK` and `STAT_GOLD` reads, right-aligned layout, and skipping the gold button in shop mode. |
| [`ui/d2client-player-corpse-pickup-113c.md`](./ui/d2client-player-corpse-pickup-113c.md) | `D2Game.dll` `D2GAME_CORPSE_Handler_6FC7FBD0`, `sub_6FC828D0`, `sub_6FC80440`; `D2Client.dll` `0x6fb01e80`, `0x6fb55440`, `0x6facb7f0`, `0x6facab20`, `0x6fac94e0` | A player corpse is a `UNIT_PLAYER` with a new GUID (`0x59` → `0x0D` code 9 → `0x74`); hover only skips the local player, and dead players get +1 priority; clicking a non-attackable non-monster unit goes through interaction handling `C2S 0x13` (unrelated to the left-click skill); the server picks up within 8 tiles and auto-walks within 50 tiles (Issue #922). |
| [`ui/d2multi-join-game-panel-113c.md`](./ui/d2multi-join-game-panel-113c.md) | `D2Multi.dll` `0x6F9E3280`, `D2MCPClient.dll` `0x6FA26280` | Multiplayer lobby join panel (`joingamebckg.dc6` stitched to 373×373), the control descriptor table (`0x6F9EA510`), parsing of the `MCP_GAMEINFO (0x06)` binary message, and the formatting of the details list on the right. |

---

## 5. Skill and Missile System (`skills/`)

### 5.1 Master Dispatch Tables and Core Mechanics
- [`skills/d2-skills-missiles-dispatch-tables.md`](./skills/d2-skills-missiles-dispatch-tables.md): Skill dispatch function tables for all classes and monsters (`gpSkillSrvStartFnTable`, `gpSkillSrvDoFnTable`, `g_apfnSkillCltStFunc`, `g_apfnSkillCltDoFunc`, `g_apfnMissileCltDoFunc`, `g_apfnMissileCltHitFunc`) and generic player actions such as normal attack, kick, throw, unsummon, and Identify/Town Portal scrolls.

### 5.2 Missile and Effect Mechanics (`skills/missiles/`)
- [`skills/missiles/d2client-meteor-cltdofunc-clthitfunc.md`](./skills/missiles/d2client-meteor-cltdofunc-clthitfunc.md): Client-side 3D trajectory of the Sorceress Meteor skill (`CltDoFunc=9`, $vx=15, vz=-25$), isometric projection, impact flash, screen shake and the scattered spawning of 18 ground fire pieces.

### 5.3 Monster and Boss Skills (`skills/bosses/`)
- [`skills/bosses/skills-boss-act1-act2-act3.md`](./skills/bosses/skills-boss-act1-act2-act3.md): Act 1 to Act 3 quest bosses and super unique skills (Andariel, Blood Raven, The Countess, Griswold, The Cow King, Radament, Coldworm the Burrower, The Summoner, Duriel, the Council members, Mephisto).
- [`skills/bosses/skills-boss-act4-diablo.md`](./skills/bosses/skills-boss-act4-diablo.md): Act 4 bosses and Chaos Sanctuary seal bosses (Izual, Hephasto, Diablo, Diablo Clone).
- [`skills/bosses/skills-boss-act5-baal-ubers.md`](./skills/bosses/skills-boss-act5-baal-ubers.md): Act 5 quest bosses and the three Hellfire Torch event ubers (Shenk, Nihlathak, the Ancients, Baal, Uber Mephisto, Uber Diablo, Uber Baal, Lilith, Uber Duriel, Uber Izual).

### 5.4 Player Class Skill Trees (`skills/player/`, 21 docs / 210 skills)
- **Amazon**:
  - [`skills/player/skills-ama-bow-crossbow.md`](./skills/player/skills-ama-bow-crossbow.md) — Bow & Crossbow skills (Magic Arrow, Multiple Shot, Guided Arrow, Strafe, etc.)
  - [`skills/player/skills-ama-passive-magic.md`](./skills/player/skills-ama-passive-magic.md) — Passive & Magic skills (Inner Sight, Dodge, Avoid, Evade, Valkyrie, Pierce, etc.)
  - [`skills/player/skills-ama-javelin-spear.md`](./skills/player/skills-ama-javelin-spear.md) — Javelin & Spear skills (Jab, Power Strike, Charged Strike, Lightning Fury, etc.)
- **Assassin**:
  - [`skills/player/skills-ass-martial-arts.md`](./skills/player/skills-ass-martial-arts.md) — Martial Arts (Tiger Strike, Dragon Talon, Phoenix Strike, etc.)
  - [`skills/player/skills-ass-shadow-disciplines.md`](./skills/player/skills-ass-shadow-disciplines.md) — Shadow Disciplines (Burst of Speed, Fade, Weapon Block, Shadow Master, etc.)
  - [`skills/player/skills-ass-traps.md`](./skills/player/skills-ass-traps.md) — Traps (Fire Blast, Lightning Sentry, Death Sentry, etc.)
- **Barbarian**:
  - [`skills/player/skills-bar-combat.md`](./skills/player/skills-bar-combat.md) — Combat Skills (Bash, Leap Attack, Concentrate, Frenzy, Whirlwind, etc.)
  - [`skills/player/skills-bar-masteries.md`](./skills/player/skills-bar-masteries.md) — Combat Masteries (Sword Mastery, Iron Skin, Natural Resistance and other passive mechanics)
  - [`skills/player/skills-bar-warcries.md`](./skills/player/skills-bar-warcries.md) — Warcries (Howl, Shout, Battle Orders, Battle Command, War Cry, etc.)
- **Druid**:
  - [`skills/player/skills-dru-elemental.md`](./skills/player/skills-dru-elemental.md) — Elemental Skills (Firestorm, Fissure, Tornado, Hurricane, Armageddon, etc.)
  - [`skills/player/skills-dru-shapeshifting.md`](./skills/player/skills-dru-shapeshifting.md) — Shape Shifting (Werewolf, Werebear, Feral Rage, Fury, etc.)
  - [`skills/player/skills-dru-summoning.md`](./skills/player/skills-dru-summoning.md) — Summoning (Raven, Oak Sage, Spirit Wolf, Summon Grizzly, etc.)
- **Necromancer**:
  - [`skills/player/skills-nec-curses.md`](./skills/player/skills-nec-curses.md) — Curses (Amplify Damage, Iron Maiden, Decrepify, Lower Resist, etc.)
  - [`skills/player/skills-nec-poison-bone.md`](./skills/player/skills-nec-poison-bone.md) — Poison & Bone (Teeth, Corpse Explosion, Bone Spear, Bone Spirit, Poison Nova, etc.)
  - [`skills/player/skills-nec-summoning.md`](./skills/player/skills-nec-summoning.md) — Summoning (Raise Skeleton, Clay Golem, Iron Golem, Revive, etc.)
- **Paladin**:
  - [`skills/player/skills-pal-combat.md`](./skills/player/skills-pal-combat.md) — Combat Skills (Smite, Charge, Blessed Hammer, Holy Shield, Zeal, etc.)
  - [`skills/player/skills-pal-defensive-auras.md`](./skills/player/skills-pal-defensive-auras.md) — Defensive Auras (Prayer, Cleansing, Defiance, Vigor, Salvation, etc.)
  - [`skills/player/skills-pal-offensive-auras.md`](./skills/player/skills-pal-offensive-auras.md) — Offensive Auras (Might, Holy Fire, Thorns, Blessed Aim, Fanaticism, Conviction, etc.)
- **Sorceress**:
  - [`skills/player/skills-sor-cold.md`](./skills/player/skills-sor-cold.md) — Cold Spells (Ice Bolt, Frost Nova, Blizzard, Frozen Orb, Cold Mastery, etc.)
  - [`skills/player/skills-sor-fire.md`](./skills/player/skills-sor-fire.md) — Fire Spells (Fire Bolt, Warmth, Fire Ball, Meteor, Hydra, Fire Mastery, etc.)
  - [`skills/player/skills-sor-lightning.md`](./skills/player/skills-sor-lightning.md) — Lightning Spells (Charged Bolt, Static Field, Teleport, Nova, Chain Lightning, Lightning Mastery, etc.)

---

## 6. Rendering and Lighting (`render/`)

| Document | Key RE addresses / modules | Key mechanics and rules |
|---|---|---|
| [`render/d2client-unit-light-records-113c.md`](./render/d2client-unit-light-records-113c.md) | `D2Client.dll` `0x6fac92f5`, `0x6fac8bc0`, `0x6fac89a0`, `0x6fad0510`, `0x6fb63647`, `0x6fb1b360`, `0x6fb1b49f`, `0x6fb23410` | Unit light records and state overlays: player radius 13 + stat 89 (unchanged if ≤0), stat 90 color; monster MonStats2 lights and MonUMod 3 (radius 7, random B/G/R for Champions); missile lights are only created at high Light Quality, with Flicker and fade-out at end; overlays from `States.txt`/`states.bin` (`wOverlay[0..3]` + `pgsvoverlay` expanded to 3 rows) map to `overlay.bin` draw parameters and `InitRadius → Radius` lights (Issue #830, #878). For the lighting grid pipeline see [`docs/lighting_grid_113c.md`](../docs/lighting_grid_113c.md) |
| [`render/d2gfx-draw-mode-113c.md`](./render/d2gfx-draw-mode-113c.md) | `D2Client.dll` `0x6FB1B11D`, `0x6FB1B2B2`, `0x6FB1CF32`; `D2gfx.dll` `#10041` (`0x6FA8B080`); `D2Direct3D.dll` `0x6F886B90` | The raw Overlay.txt `Trans` value is the eDrawMode (identity); Missiles.txt `Trans` 0/1/2 → 5/3/4; D3D blend state per eDrawMode (0-2 α25/50/75, 3 additive ONE/ONE, 4 multiplicative ZERO/SRCCOLOR, 5/6/7/≥8 opaque); baking does no black color keying (Issue #1050-#1055) |
| [`render/d2client-drawmode-113c.md`](./render/d2client-drawmode-113c.md) | `D2Client.dll` `0x6FB633F7`, `0x6FB23CB0`, `0x6FB50DB0`, `0x6FB22C80`, `0x6FB23760`; `D2Direct3D.dll` `0x6F886CF4`; `D2Gdi.dll` `0x6F87633C` | eDrawMode summary (Overlay Trans identity, Missile Trans 0/1/2→5/3/4, 3=additive ONE/ONE, 4=multiplicative ZERO/SRCCOLOR); client missile visual frame rate is overridden to `AnimSpeed<<4` (`animrate` is server-only); CltDoFunc 25 spawns a client-side ring of 64 missiles at radius 30 (Range+LevRange*lvl); States.txt castoverlay plays as LOOPEX(4)/AURAEX(9) when the state is set, then hands over to overlay1/2 (Issue #1057) |
| [`render/dt1-material-flags-animated-113c.md`](./render/dt1-material-flags-animated-113c.md) | `D2Common.dll` `0x6fd62f20`, `0x6fd62ff0`; `D2CMP.dll` `#10051` (`0x6fe25300`) | DT1 `+0x06` is a u16 material flags field (byte +7 is its high byte, not a separate animated byte); only `TILE_FLAGS_LAVA` (`0x100`) animates, and Act 5 snow `0x400` is an ordinary random variant tile (Issue #923) |

---

## 7. Sound Tables and the Sound Record Layer (`audio/`)

| Document | Key RE addresses / modules | Key mechanics and rules |
|---|---|---|
| [`audio/d2gs-0x2c-playsound-113c.md`](./audio/d2gs-0x2c-playsound-113c.md) | `D2Client.dll` `0x6fb5d740` (`0x2C`), `0x6fb5d760` (`0xA4`), `0x6fad3f20` (outer `10..93`), `0x6fad3200` (player `1..83`), `.rdata:0x6fba7694` | The `u16` field of `S2C 0x2C PlaySound` is a sound event code, not a `Sounds.txt` row index (e.g. `10 -> 2673 shrine_refill` vol 120, `13 -> 2634 object_trap_trigger`, `14 -> 2635 object_trap_release`, `93 -> 2553 object_corpse_loot`, plus the 22-slot speech tables for the 7 classes); `S2C 0xA4 MonsterSpecialSkill` plays no sound (Issue #944) |
| [`audio/sound-records-113c.md`](./audio/sound-records-113c.md) | `D2Client.dll` `0x6fb0e8e1` (post-load table processing), `0x6fb38a70` (PlaySound), `0x6fb38dd0` (SoundUpdate), `0x6fb0d7a0` (StartSound), `0x6fb0ce70` (AllocChannel), `0x6fb0d1d0` (UpdateChannel), `0x6fb0ee70` (variant selection); `D2Common.dll` `#10628`; `D2sound.dll` `#10047/#10008/#10028` | `Sounds.txt` 4699-row groupBase/Group Size/nBlocks post-processing; 200-entry sound record pool, Compound reuse, +80 byte addition for the local player, screen coordinates `(Δcx, 2·Δcy, 640)`; same-id 2-tick debounce compares scheduled start times; 16 channels = 4 stereo + 12 mono partitioned preemption; binary quirks such as looping records whose fade-in start failed staying at vol 0 and never restarting (Issue #943) |
