# D2GS `0x2C PlaySound` and `0xA4 MonsterSpecialSkill` Reverse Engineering (`D2Client.dll` v1.13c)

> **Ground Truth**: `D2Client.dll` v1.13c (`0x6fb5d740`, `0x6fb5d760`, `0x6fad3f20`, `0x6fad3200`, `0x6fb4cad0`, `.rdata:0x6fba7694`) and the 1.13c MPQ (`Sounds.txt` 4,699 rows, `MonStats.txt` 734 rows, `MonSounds.txt`).

---

## 1. Key Findings

1. **The `u16` field (`+6`) of D2GS `S2C 0x2C PlaySound` (`8` bytes) is a sound event code (`eventCode`), never a `Sounds.txt` row index**:
   - `0x6fb5d740` looks up the unit with `D2CLIENT_FindClientSideUnit(unitId, unitType)` (`0x6fb54e20`) and, on success, passes `*(u16*)(pkt+6)` to `0x6fad3f20` as `eventCode`.
   - If `pUnit == NULL`, it returns immediately and plays nothing.
2. **D2GS `S2C 0xA4 MonsterSpecialSkill` (`3` bytes) plays no sound at all**:
   - The handler `0x6fb5d760` only calls `0x6fb1a0c0(classId, 0)` to update UI state; there are no audio calls.

---

## 2. Outer Event Code Dispatch (`0x6fad3f20`, `eventCode 10..93`)

| `eventCode` | Resolution logic | Resulting `Sounds.txt` ID / behavior |
|---:|---|---|
| `10` | `PlaySound(2673 /* shrine_refill */, pUnit, 0, 0, 0)` + `SetSoundVolume(handle, 120)` | `soundId = 2673`, `volume = 120`, `volumeOverride = 120` |
| `12` | Reads `stat 350` (`modifierlist_skill`) from the unit StatList (`flag=0x44`) and looks up `Skills.txt` `stsound` | `soundId = stSoundId` |
| `13` | `PlaySound(2634 /* object_trap_trigger */, pUnit, 0, 0, 0)` | `soundId = 2634` |
| `14` | `PlaySound(2635 /* object_trap_release */, pUnit, 0, 0, 0)` | `soundId = 2635` |
| `15` | Only for `classId == 271` (`roguehire`): `PlaySound(4290 /* rogue_confirm_a_1 */, pUnit, 0, 0, 0)` | `speechSoundId = 4290` (`Stream = 1`) |
| `16` | Monster taunt (`MonStats.txt` -> `MonSounds.txt` `+0x74 Taunt`) | 19 boss/monster `classId`s map to their `Stream = 1` taunt speech (`MONSTER_TAUNT_BY_CLASS_ID_113C`) |
| `17` | Monster flee (`MonStats.txt` -> `MonSounds.txt` `+0x78 Flee`) | Only the `fallen` family (`classId` `19..23, 642..644`) maps to `soundId = 917` (`monster_fallen_flee_1`), `delayTicks = 6..8` |
| `18` | Town NPC greeting (`0x6fb4cce0` -> `0x6fb4cad0`, `.rdata:0x6fb8f0dc..0x6fb8f37c`) | 35 town NPC `classId`s map to `Stream = 1` greeting speech (`NPC_GREETING_BY_CLASS_ID_113C`) |
| `84..87` | Mercenary equip speech (`271` `roguehire` vs. other mercenaries) | `84: 4615/4625`, `85: 4612/4616`, `86: 4613/4619`, `87: 4614/4622` |
| `90` | Ancients speech (`4379 ancient_act5_reward_spiel`) | `speechSoundId = 4379` |
| `91` | Mercenary level-up sound (`8 cursor_level_up_hireling`, bound to the local player) | `soundId = 8` |
| `92` | Only updates the quest music timer global; plays no sound | `null` |
| `93` | Corpse loot sound (`2553 object_corpse_loot`) | `soundId = 2553` |
| `default` | Enters `0x6fad3200` only when `pUnit->dwUnitType == 0` (player unit) | Returns `null` for non-player units |

---

## 3. Per-Class Speech Table for the 7 Classes (`.rdata:0x6fba7694` -> `0x6fba7560..0x6fba7668`) and Inner Dispatch (`0x6fad3200`)

`.rdata:0x6fba7694` is a table of 7 per-class struct pointers; each struct holds `11 × uint32` (`44` bytes):

| Class (`classId`) | Struct VA | `+0x00 getHit1` | `+0x04 death1` | `+0x08 impossible1` (19) | `+0x0c needMana1` (21) | `+0x10 needKey1` (22) | `+0x14 cantCarry1` (23) | `+0x18 cantUseYet` (20) | `+0x1c notInTown1` (24) | `+0x20 chatBase` (25..32) | `+0x24 questBase` (33..83) | `+0x28 taunt1` (footstepBase) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `0` Amazon | `0x6fba7560` | `2878` | `2883` | `2953` | `2957` | `2955` | `2934` | `2936` | `2959` | `2937` | `2961` | `2768` |
| `1` Sorceress | `0x6fba7610` | `2910` | `2915` | `3265` | `3269` | `3267` | `3246` | `3248` | `3271` | `3249` | `3273` | `2720` |
| `2` Necromancer | `0x6fba75b8` | `2894` | `2899` | `3109` | `3113` | `3111` | `3090` | `3092` | `3115` | `3093` | `3117` | `2720` |
| `3` Paladin | `0x6fba75e4` | `2886` | `2891` | `3187` | `3191` | `3189` | `3168` | `3170` | `3193` | `3171` | `3195` | `2768` |
| `4` Barbarian | `0x6fba758c` | `2902` | `2907` | `3031` | `3035` | `3033` | `3012` | `3014` | `3037` | `3015` | `3039` | `2816` |
| `5` Druid | `0x6fba7668` | `2926` | `2931` | `3421` | `3425` | `3423` | `3402` | `3404` | `3427` | `3405` | `3429` | `2720` |
| `6` Assassin | `0x6fba763c` | `2918` | `2923` | `3343` | `3347` | `3345` | `3324` | `3326` | `3349` | `3327` | `3351` | `2720` |

- **Quest monologue delay (`0x6fad3474` + `.text:0x6fad35b4`)**:
  - Within `33..83`, every event code that is not on the quest music stinger path and satisfies either `((code - 38) >>> 0) > 18` (which covers `code == 36` and the non-stinger entries in `57..83`) or `byte_6fad35b4[code - 38] == 1` gets `delayTicks = 12` (`0x0c`).

---

## 4. Code Locations

- `src/client/audio/d2gs-play-sound-113c.ts`: `resolve0x2CPlaySound113c()`, `PLAYER_SOUND_TABLE_0x6FBA7694`, `MONSTER_TAUNT_BY_CLASS_ID_113C`, `FALLEN_CLASS_IDS_113C`, `NPC_GREETING_BY_CLASS_ID_113C`, `QUEST_VOICE_DELAY12_CODES`
- `src/client/world/client-world.ts`: `case 'PlaySound'` (including the guard for the missing `ev.unit` on `0xA4`), `pushSoundRequest()` and `drainWorldSoundRequests()`
- `src/client/session/online-session.ts`: `drainWorldSoundRequests()` → `this.audioRuntime.playSound(...)`
- `src/client/audio/audio-runtime-113c.ts`: `playSound()`, `drainWorldRequests()` and the `sessionEpoch` guard that isolates async decoding
