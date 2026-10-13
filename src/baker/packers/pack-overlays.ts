/**
 * Offline Cast Overlay Asset & Data Baking Script.
 *
 * Extracts authentic Diablo II v1.13c cast overlay DCC sprites from d2data.mpq:
 * - FireCast_for_Sorceress.dcc (fire_cast_1, 14 frames, box: [-55, -127, 117, 164])
 * - FireCast2.dcc (fire_cast_2, 16 frames, box: [-74, -89, 145, 133])
 * - IceCastNew01.dcc (ice_cast_1, 15 frames, box: [-49, -90, 97, 55])
 * - IceCastNew02.dcc (ice_cast_2, 15 frames, box: [-58, -100, 115, 123])
 * - IceCastNew03.dcc (ice_cast_3, 16 frames, box: [-63, -113, 127, 148])
 * - LightningCast.dcc (light_cast_1, 10 frames, box: [-79, -107, 164, 144])
 * - LightningCastRunesFront.dcc (light_cast_2, 10 frames, box: [-73, -154, 147, 190])
 * - Teleport.dcc (teleport, 18 frames, box: [-61, -108, 136, 154])
 *
 * Bakes them into indexed-color PNG atlases and JSON metadata under:
 * - public/overlays/
 * - samples/d2-packs/overlays/
 *
 * And generates typed metadata in src/render/overlays-meta.ts.
 * Enforces Zero Runtime MPQ/DLL Architectural Invariant.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MpqArchive } from '../../common/mpq/archive.ts'
import { fileSource } from '../io/file-source.ts'
import { decodeDcc } from '../../common/formats/dcc.ts'
import { decodePl2 } from '../../common/formats/pl2.ts'
import { packMissileSheetToRgbaPng } from './pack-missiles.ts'
import type { SpriteFrame, SpriteSheet } from '../../common/formats/sprite.ts'
import type { OverlayTxtRow } from '../../common/data/overlay-txt-row-type.ts'
import { DEFAULT_NODE_MPQ_DIR, NodeMpqArchiveSource } from '../mpq-archive-source.ts'
import { extractOverlayRows } from './pack-overlay-rows.ts'

export interface OverlayFrameMeta {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly anchorX: number
  readonly anchorY: number
}

export type OverlayFrameTuple = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
]

export interface OverlayBox {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface OverlayMeta {
  readonly name: string
  readonly celFile: string
  readonly width: number
  readonly height: number
  readonly directions: number
  readonly frames: number
  readonly framesPerDirection: number
  readonly animRate: number
  readonly fps?: number
  readonly anchor?: 'head' | 'feet' | 'center'
  readonly trans: number
  readonly blendMode?: string
  readonly yOffset?: number
  readonly preDraw: boolean
  readonly lightRadius: number
  readonly lightColor: readonly [number, number, number]
  readonly box: OverlayBox
  readonly groups: readonly (readonly OverlayFrameTuple[])[]
}

export interface OverlayTarget {
  readonly name: string
  readonly celFile: string
  readonly aliases?: readonly string[]
  readonly animRate: number
  readonly fps?: number
  readonly anchor?: 'head' | 'feet' | 'center'
  readonly trans: number
  readonly yOffset?: number
  readonly preDraw: boolean
  readonly lightRadius: number
  readonly lightColor: readonly [number, number, number]
}

export const OVERLAY_TARGETS: readonly OverlayTarget[] = [
  {
    name: 'fire_cast_1',
    celFile: 'FireCast_for_Sorceress',
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 9,
    lightColor: [255, 178, 64] as const,
  },
  {
    name: 'fire_cast_2',
    celFile: 'FireCast2',
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 9,
    lightColor: [255, 178, 64] as const,
  },
  {
    name: 'ice_cast_1',
    celFile: 'IceCastNew01',
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 9,
    lightColor: [81, 81, 255] as const,
  },
  {
    name: 'ice_cast_2',
    celFile: 'IceCastNew02',
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 9,
    lightColor: [81, 81, 255] as const,
  },
  {
    name: 'ice_cast_3',
    celFile: 'IceCastNew03',
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 9,
    lightColor: [81, 81, 255] as const,
  },
  {
    name: 'light_cast_1',
    celFile: 'LightningCast',
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 9,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'light_cast_2',
    celFile: 'LightningCastRunesFront',
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 9,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'teleport',
    celFile: 'Teleport',
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 5,
    lightColor: [255, 255, 200] as const,
  },
  // 33 Authentic Diablo II v1.13c Paladin Aura Overlays (13 Pairs with Front & Back + 7 Full Rings)
  // 1. Might (#98)
  {
    name: 'might_front',
    celFile: 'AuraMightFront',
    aliases: ['might', 'aura_might_front', 'auramightfront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'might_back',
    celFile: 'AuraMightBack',
    aliases: ['might_back', 'aura_might_back', 'auramightback'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 2. Prayer (#99)
  {
    name: 'prayer_front',
    celFile: 'AuraPrayerFront',
    aliases: ['prayer', 'aura_prayer_front', 'auraprayerfront'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'prayer_back',
    celFile: 'AuraPrayerBack',
    aliases: ['prayer_back', 'aura_prayer_back', 'auraprayerback'],
    animRate: 8,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 3. Resist Fire (#100) - Full Ring
  {
    name: 'resist_fire',
    celFile: 'AuraResistFireFront',
    aliases: ['aura_resistfire', 'AuraResistFireFront'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 6,
    lightColor: [255, 193, 103] as const,
  },
  // 4. Holy Fire (#102)
  {
    name: 'holy_fire_front',
    celFile: 'AuraHolyFireFront',
    aliases: ['holy_fire', 'holyfire', 'aura_holyfire_front', 'auraholyfirefront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'holy_fire_back',
    celFile: 'AuraHolyFireBack',
    aliases: ['holy_fire_back', 'holyfire_back', 'aura_holyfire_back', 'auraholyfireback'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 5. Thorns (#103)
  {
    name: 'thorns_front',
    celFile: 'AuraThornsFront',
    aliases: ['thorns', 'aura_thorns_front', 'aurathornsfront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'thorns_back',
    celFile: 'AuraThornsBack',
    aliases: ['thorns_back', 'aura_thorns_back', 'aurathornsback'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 6. Defiance (#104)
  {
    name: 'defiance_front',
    celFile: 'AuraDefianceFront',
    aliases: ['defiance', 'aura_defiance_front', 'auradefiancefront'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'defiance_back',
    celFile: 'AuraDefianceBack',
    aliases: ['defiance_back', 'aura_defiance_back', 'auradefianceback'],
    animRate: 8,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 7. Resist Cold (#105) - Full Ring
  {
    name: 'resist_cold',
    celFile: 'AuraResistColdBack',
    aliases: ['aura_resistcold', 'AuraResistColdBack'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 6,
    lightColor: [210, 210, 255] as const,
  },
  // 8. Blessed Aim (#108)
  {
    name: 'blessed_aim_front',
    celFile: 'BlessedAim_front',
    aliases: ['blessed_aim', 'blessedaim', 'blessedaimfront', 'BlessedAim_front'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'blessed_aim_back',
    celFile: 'BlessedAim_back',
    aliases: ['blessed_aim_back', 'blessedaimback', 'BlessedAim_back'],
    animRate: 8,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 9. Cleansing (#109)
  {
    name: 'cleansing_front',
    celFile: 'Cleansing_front',
    aliases: ['cleansing', 'cleansingfront', 'Cleansing_front'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cleansing_back',
    celFile: 'Cleansing_back',
    aliases: ['cleansing_back', 'cleansingback', 'Cleansing_back'],
    animRate: 8,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 10. Resist Lightning (#110) - Full Ring
  {
    name: 'resist_lightning',
    celFile: 'AuraResistLightningBack',
    aliases: ['aura_resistlight', 'AuraResistLightningBack'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 6,
    lightColor: [255, 255, 200] as const,
  },
  // 11. Concentration (#113)
  {
    name: 'concentration_front',
    celFile: 'Concentration_front',
    aliases: ['concentration', 'concentrationfront', 'Concentration_front'],
    animRate: 3,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'concentration_back',
    celFile: 'Concentration_back',
    aliases: ['concentration_back', 'concentrationback', 'Concentration_back'],
    animRate: 3,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 12. Holy Freeze (#114) - Full Ring
  {
    name: 'holy_freeze',
    celFile: 'HolyFreeze',
    aliases: ['holyfreeze', 'holywind', 'HolyFreeze'],
    animRate: 8,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 13. Vigor (#115)
  {
    name: 'vigor_front',
    celFile: 'Stamina_front',
    aliases: ['vigor', 'stamina', 'staminafront', 'Stamina_front'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'vigor_back',
    celFile: 'Stamina_back',
    aliases: ['vigor_back', 'staminaback', 'Stamina_back'],
    animRate: 8,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 14. Holy Shock (#118)
  {
    name: 'holy_shock_front',
    celFile: 'HolyShock_front',
    aliases: ['holy_shock', 'holyshock', 'holyshockfront', 'HolyShock_front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'holy_shock_back',
    celFile: 'HolyShock_back',
    aliases: ['holy_shock_back', 'holyshockback', 'HolyShock_back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 15. Sanctuary (#119)
  {
    name: 'sanctuary_front',
    celFile: 'SanctuaryAura_Front',
    aliases: ['sanctuary', 'sanctuaryfront', 'SanctuaryAura_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'sanctuary_back',
    celFile: 'SanctuaryAura_Back',
    aliases: ['sanctuary_back', 'sanctuaryback', 'SanctuaryAura_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 16. Meditation (#120) - Full Ring
  {
    name: 'meditation',
    celFile: 'Meditation',
    aliases: ['meditationfront', 'Meditation'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 17. Fanaticism (#122)
  {
    name: 'fanaticism_front',
    celFile: 'Fanatacism_Front',
    aliases: ['fanaticism_front', 'fanaticismfront', 'Fanatacism_Front'],
    animRate: 6,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'fanaticism_back',
    celFile: 'Fanatacism_Back',
    aliases: ['fanaticism', 'fanaticismback', 'Fanatacism_Back'],
    animRate: 6,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // Overlay.txt row 25 `aura_fanatic` (AuraFanatic.dcc, Frames 20, PreDraw 1, AnimRate 16, Trans 3):
  // State 175 `fullsetgeneric` full-body golden glow for 5 class sets (M'avina, Tal Rasha, Griswold, Immortal King, Aldur).
  {
    name: 'aura_fanatic',
    celFile: 'AuraFanatic',
    aliases: ['AuraFanatic', 'aurafanatic'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 18. Conviction (#123) - Full Ring
  {
    name: 'conviction',
    celFile: 'Conviction',
    aliases: ['convictionback', 'Conviction'],
    animRate: 6,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 19. Redemption (#124) - Full Ring
  {
    name: 'redemption',
    celFile: 'Redemption',
    aliases: ['redemptionback', 'Redemption'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 20. Salvation (#125)
  {
    name: 'salvation_front',
    celFile: 'AuraResistAllFront',
    aliases: ['salvation', 'aura_resistall_front', 'AuraResistAllFront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [211, 148, 255] as const,
  },
  {
    name: 'salvation_back',
    celFile: 'AuraResistAllBack',
    aliases: ['salvation_back', 'aura_resistall_back', 'AuraResistAllBack'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 6,
    lightColor: [211, 148, 255] as const,
  },

  // ---------------------------------------------------------------------------
  // 9 Sorceress Skill & Hit Overlays (v1.13c Ground Truth)
  // ---------------------------------------------------------------------------
  // 1. ShockHitSm (lightning hit overlay for skills 38, 48, 49, 53, 57)
  {
    name: 'lightning',
    celFile: 'ShockHitSm',
    aliases: ['ShockHitSm', 'shockhitsm', 'holyshockhit', 'lightning_hit'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 11,
    lightColor: [255, 255, 255] as const,
  },
  // 2. FrozenArmor (frozenarmor buff overlay for Frozen/Shiver/Chilling Armor 40, 50, 60)
  {
    name: 'frozenarmor',
    celFile: 'FrozenArmor',
    aliases: ['FrozenArmor', 'shiverarmor', 'chillarmor', 'chillingarmor', 'frozen_armor', 'shiver_armor', 'chill_armor', 'chilling_armor'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 13,
    lightColor: [200, 200, 255] as const,
  },
  // 3. AuraResistColdCast (frozenarmor_hit hit overlay for 40, 50, 60)
  {
    name: 'frozenarmor_hit',
    celFile: 'AuraResistColdCast',
    aliases: ['AuraResistColdCast', 'cast_shivers', 'shiverarmor_hit', 'chillarmor_hit', 'chillingarmor_hit', 'chilling_armor_hit', 'frozen_armor_hit', 'shiver_armor_hit', 'chill_armor_hit'],
    animRate: 24,
    trans: 3,
    preDraw: true,
    lightRadius: 6,
    lightColor: [81, 81, 255] as const,
  },
  // 4. ManaShieldBall (energyshield buff overlay for Energy Shield 58)
  {
    name: 'energyshield',
    celFile: 'ManaShieldBall',
    aliases: ['ManaShieldBall', 'manashield', 'energy_shield'],
    animRate: 8,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 5. ManaShieldDir00 (energyshieldhit0 absorb hit overlay for Energy Shield 58)
  {
    name: 'energyshieldhit0',
    celFile: 'ManaShieldDir00',
    aliases: ['ManaShieldDir00', 'energyshield_hit', 'energyshieldhit', 'energy_shield_hit'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 3,
    lightColor: [255, 255, 255] as const,
  },
  // 6. ThunderstormCast (thunderstormcast cloud overlay for Thunder Storm 57)
  {
    name: 'thunderstormcast',
    celFile: 'ThunderstormCast',
    aliases: ['ThunderstormCast', 'thunderstorm_front', 'thunderstorm_cast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 8,
    lightColor: [255, 255, 255] as const,
  },
  // 7. ThunderstormCast_operate (thunderstormback rear cloud overlay for Thunder Storm 57)
  {
    name: 'thunderstormback',
    celFile: 'ThunderstormCast_operate',
    aliases: ['ThunderstormCast_operate', 'thunderstorm_back', 'thunderstormoperate'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 8,
    lightColor: [255, 255, 255] as const,
  },
  // 8. FireEnchant (enchant buff overlay for Enchant 52)
  {
    name: 'enchant',
    celFile: 'FireEnchant',
    aliases: ['FireEnchant', 'fireenchant', 'fire_enchant'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 9,
    lightColor: [255, 178, 64] as const,
  },
  // 9. IceExplode (ice_explode overlay)
  {
    name: 'ice_explode',
    celFile: 'IceExplode',
    aliases: ['IceExplode', 'iceexplode'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 14,
    lightColor: [210, 210, 255] as const,
  },

  // ---------------------------------------------------------------------------
  // 15 Necromancer Overlays (10 Curses, 2 Hits, 3 Bone Armor)
  // ---------------------------------------------------------------------------
  // 1. Amplify Damage (#66)
  {
    name: 'curseamplifydamage',
    celFile: 'CurseAmplifyDamageEffect',
    aliases: ['amplify_damage', 'amplifydamage', 'curse_amplify_damage', 'fingermagecurse'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [255, 64, 64] as const,
  },
  // 2. Dim Vision (#71)
  {
    name: 'cursedimvision',
    celFile: 'CurseDimVisionEffect',
    aliases: ['dim_vision', 'dimvision', 'curse_dim_vision'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [255, 210, 210] as const,
  },
  // 3. Weaken (#72)
  {
    name: 'curseweaken',
    celFile: 'CurseWeakenEffect',
    aliases: ['weaken', 'curse_weaken'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [255, 210, 210] as const,
  },
  // 4. Iron Maiden (#76)
  {
    name: 'curseironmaiden',
    celFile: 'CurseIronMaidenEffect',
    aliases: ['iron_maiden', 'ironmaiden', 'curse_iron_maiden'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [255, 0, 0] as const,
  },
  // 5. Terror (#77)
  {
    name: 'curseterror',
    celFile: 'CurseTerrorEffect',
    aliases: ['terror', 'curse_terror'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 6. Confuse (#81) & Barbarian Taunt (#137)
  {
    name: 'curseconfuse',
    celFile: 'CurseConfuseEffect',
    aliases: ['confuse', 'curse_confuse', 'taunt'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [0, 255, 0] as const,
  },
  // 7. Life Tap (#82)
  {
    name: 'cursereversevampire',
    celFile: 'CurseReverseVampireEffect',
    aliases: ['lifetap', 'life_tap', 'curse_lifetap', 'curselifetap', 'reversevampire'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 8. Attract (#86)
  {
    name: 'curseattract',
    celFile: 'CurseAttractHarmEffect',
    aliases: ['attract', 'curse_attract'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [255, 0, 0] as const,
  },
  // 9. Decrepify (#87)
  {
    name: 'cursedecrepify',
    celFile: 'CurseDecrepifyEffect',
    aliases: ['decrepify', 'curse_decrepify'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [0, 0, 255] as const,
  },
  // 10. Lower Resist (#91)
  {
    name: 'curselowerresist',
    celFile: 'CurseLowerResistEffect',
    aliases: ['lower_resist', 'lowerresist', 'curse_lower_resist'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [0, 0, 255] as const,
  },
  // 11. Iron Maiden Hit Overlay (#139)
  {
    name: 'hit_ironmaiden',
    celFile: 'AuraThornsHit',
    aliases: ['ironmaiden_hit', 'iron_maiden_hit'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 12. Life Tap Hit Overlay (#140)
  {
    name: 'hit_reversevampire',
    celFile: 'CurseRevVampireHit',
    aliases: ['lifetap_hit', 'life_tap_hit', 'reversevampire_hit'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 13. Bone Armor Cast Emerge (#141)
  {
    name: 'bonearmor_cast',
    celFile: 'BoneShieldEmerge',
    aliases: ['bonearmorcast', 'bone_armor_cast', 'boneshieldemerge'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 14. Bone Armor Front (#142)
  {
    name: 'bonearmor_front',
    celFile: 'BoneShieldFront',
    aliases: ['bonearmor', 'bone_armor', 'bonearmorfront', 'bone_armor_front', 'boneshieldfront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 15. Bone Armor Back (#143)
  {
    name: 'bonearmor_back',
    celFile: 'BoneShieldBack',
    aliases: ['bonearmorback', 'bone_armor_back', 'boneshieldback'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },

  // ---------------------------------------------------------------------------
  // 16 Authentic Diablo II v1.13c Paladin Combat, Cast, Hit & State Overlays
  // ---------------------------------------------------------------------------
  // 1. Charge (#107, Overlay ID 125)
  {
    name: 'charge',
    celFile: 'Charge',
    aliases: ['Charge'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 2. Conversion Aura (#116, Overlay ID 124)
  {
    name: 'conversion',
    celFile: 'Conversion',
    aliases: ['Conversion', 'conversionaura', 'conversion_aura'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 3. Conversion Cast (#116, Overlay ID 123)
  {
    name: 'conversioncast',
    celFile: 'AuraResistColdBackCast',
    aliases: ['conversion_cast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 4. Holy Bolt Cast (#101, cast_undead, Overlay ID 21)
  {
    name: 'holy_bolt_cast',
    celFile: 'HolyBoltCloud',
    aliases: ['HolyBoltCloud', 'cast_undead', 'holyboltcloud', 'holybolt_cast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 5. Fist of the Heavens Cast (#121, cast_fistofares, Overlay ID 32)
  {
    name: 'fist_of_the_heavens_cast',
    celFile: 'FOACast',
    aliases: ['FOACast', 'cast_fistofares', 'foacast', 'fistoftheheavenscast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 6. Fist of the Heavens Hit (#121, handofgod, Overlay ID 158)
  {
    name: 'handofgod',
    celFile: 'HolyShockHit',
    aliases: ['fist_of_the_heavens_hit', 'fistoftheheavenshit'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 7. Sanctuary Knockback (#119, sanctuaryknockback, Overlay ID 113)
  {
    name: 'sanctuary_knockback',
    celFile: 'SanctuaryKnockback',
    aliases: ['SanctuaryKnockback', 'sanctuaryknockback'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 8. Holy Fire Hit (#102, hit_holyfire, Overlay ID 21)
  {
    name: 'holy_fire_hit',
    celFile: 'AuraHolyFireHit',
    aliases: ['AuraHolyFireHit', 'hit_holyfire', 'auraholyfirehit'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 9. Holy Fire Indicate (#102, target_holyfire, Overlay ID 22)
  {
    name: 'holy_fire_indicate',
    celFile: 'AuraHfireIndicate',
    aliases: ['AuraHfireIndicate', 'target_holyfire', 'aurahfireindicate'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 10. Thorns Hit (#103, hit_thorns, Overlay ID 25)
  {
    name: 'thorns_hit',
    celFile: 'AuraThornsHit',
    aliases: ['hit_thorns'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 11. Thorns Indicate (#103, target_thorns, Overlay ID 26)
  {
    name: 'thorns_indicate',
    celFile: 'AuraHfireIndicate',
    aliases: ['target_thorns'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 12. Cast Resist Fire (#100, cast_resistfire, Overlay ID 6)
  {
    name: 'cast_resistfire',
    celFile: 'AuraResistFireFrontCast',
    aliases: ['AuraResistFireFrontCast', 'cast_resist_fire', 'auraresistfirefrontcast'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 13. Cast Resist Cold (#105, cast_resistcold, Overlay ID 8)
  {
    name: 'cast_resistcold',
    celFile: 'AuraResistColdBackCast',
    aliases: ['cast_resist_cold'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 14. Cast Resist Lightning (#110, cast_resistlight, Overlay ID 10)
  {
    name: 'cast_resistlight',
    celFile: 'AuraResistLightningBackCast',
    aliases: ['AuraResistLightningBackCast', 'cast_resist_light', 'auraresistlightningbackcast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 15. Cast Resist All (#125, cast_resistall, Overlay ID 12)
  {
    name: 'cast_resistall',
    celFile: 'AuraResistAllCast',
    aliases: ['AuraResistAllCast', 'cast_resist_all', 'auraresistallcast'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // 16. Stun (#97 Smite, Overlay ID 148)
  {
    name: 'stun',
    celFile: 'Stun',
    aliases: ['Stun'],
    animRate: 16,
    trans: 5,
    yOffset: -75,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },

  // ---------------------------------------------------------------------------
  // 10 Authentic Diablo II v1.13c Amazon Cast, Skill & Minion Overlays
  // ---------------------------------------------------------------------------
  {
    name: 'cast_innersight',
    celFile: 'EOZCast',
    aliases: ['castinnersight', 'eyeofzeus_cast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 5,
    lightColor: [255, 255, 200] as const,
  },
  {
    name: 'innersight',
    celFile: 'HardenArmor',
    aliases: ['innersight_target', 'hardenarmor'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [255, 255, 128] as const,
  },
  {
    name: 'cast_slowmissiles',
    celFile: 'HOAcast',
    aliases: ['castslowmissiles', 'handofathena_cast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 5,
    lightColor: [128, 200, 255] as const,
  },
  {
    name: 'handofathena',
    celFile: 'HOAmissileExplode',
    aliases: ['slowmissiles_aura', 'hoa_explode'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 5,
    lightColor: [128, 200, 255] as const,
  },
  {
    name: 'valkyriestart',
    celFile: 'ValkarieEmerge',
    aliases: ['valkyrie_emerge', 'valkyrie_cast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 8,
    lightColor: [255, 220, 100] as const,
  },
  {
    name: 'valkyrie',
    celFile: 'ValkarieGlow',
    aliases: ['valkyrie_glow', 'valkyrie_aura'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 7,
    lightColor: [255, 220, 100] as const,
  },
  {
    name: 'dopllezon_appear',
    celFile: 'DopplezonAppear',
    aliases: ['decoy_appear', 'dopplezon'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [200, 200, 255] as const,
  },
  {
    name: 'doubledamage1',
    celFile: 'impacting01',
    aliases: ['critical_strike_1', 'impacting01'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 4,
    lightColor: [255, 64, 64] as const,
  },
  {
    name: 'doubledamage2',
    celFile: 'impacting02',
    aliases: ['critical_strike_2', 'impacting02'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 4,
    lightColor: [255, 64, 64] as const,
  },
  {
    name: 'doubledamage3',
    celFile: 'impacting03',
    aliases: ['critical_strike_3', 'impacting03'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 4,
    lightColor: [255, 64, 64] as const,
  },

  // ---------------------------------------------------------------------------
  // 10 Authentic Diablo II v1.13c Barbarian Warcry & Combat Overlays
  // ---------------------------------------------------------------------------
  {
    name: 'shoutstart',
    celFile: 'ShoutStart',
    aliases: ['shout_start', 'shout_cast', 'shoutcast'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shout',
    celFile: 'Shout',
    aliases: ['shout_overlay', 'shout_buff'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'battlecry',
    celFile: 'BattleCry',
    aliases: ['battle_cry', 'battlecry_overlay'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'battleorderscast',
    celFile: 'BattleOrdersStart',
    aliases: ['battle_orders_start', 'battleorders_start', 'battleorders_cast'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'battleorders',
    celFile: 'BattleOrders',
    aliases: ['battle_orders', 'battleorders_overlay', 'battleorders_buff'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'battlecommandcast',
    celFile: 'BattleCommandStart',
    aliases: ['battle_command_start', 'battlecommand_start', 'battlecommand_cast'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'battlecommand',
    celFile: 'BattleCommand',
    aliases: ['battle_command', 'battlecommand_overlay', 'battlecommand_buff'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'berserkfront',
    celFile: 'BerserkOverlay',
    aliases: ['berserk', 'berserk_overlay', 'berserk_front', 'berserkfront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'frenzy',
    celFile: 'Frenzy',
    aliases: ['frenzy_overlay', 'frenzy_buff'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'warcry',
    celFile: 'WarcryHit',
    aliases: ['warcry_hit', 'warcryhit', 'warcry_overlay'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },

  // ---------------------------------------------------------------------------
  // 31 Authentic Diablo II v1.13c Druid Spells, Transformations & Combat Overlays
  // ---------------------------------------------------------------------------
  {
    name: 'druid_fire_cast_1',
    celFile: 'Expansion/Fire_Overlay_A',
    aliases: ['Expansion/Fire_Overlay_A', 'expansion/fire_overlay_a', 'Fire_Overlay_A', 'fire_overlay_a'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'druid_fire_cast_2',
    celFile: 'Expansion/Fire_Overlay_B',
    aliases: ['Expansion/Fire_Overlay_B', 'expansion/fire_overlay_b', 'Fire_Overlay_B', 'fire_overlay_b'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'druidmorph',
    celFile: 'expansion/druidmorph',
    aliases: ['wolf_into', 'wolf_undo', 'bear_into', 'bear_undo', 'expansion/druidmorph'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cyclonearmor1front',
    celFile: 'Expansion/CycloneArmorAFront',
    aliases: ['cyclonearmorafront', 'cyclone_armor_1_front', 'Expansion/CycloneArmorAFront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cyclonearmor1back',
    celFile: 'Expansion/CycloneArmorABack',
    aliases: ['cyclonearmoraback', 'cyclone_armor_1_back', 'Expansion/CycloneArmorABack'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cyclonearmor2front',
    celFile: 'Expansion/CycloneArmorBFront',
    aliases: ['cyclonearmorbfront', 'cyclone_armor_2_front', 'Expansion/CycloneArmorBFront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cyclonearmor2back',
    celFile: 'Expansion/CycloneArmorBBack',
    aliases: ['cyclonearmorbback', 'cyclone_armor_2_back', 'Expansion/CycloneArmorBBack'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cyclonearmor3front',
    celFile: 'Expansion/CycloneArmorCFront',
    aliases: ['cyclonearmorcfront', 'cyclone_armor_3_front', 'Expansion/CycloneArmorCFront'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cyclonearmor3back',
    celFile: 'Expansion/CycloneArmorCBack',
    aliases: ['cyclonearmorcback', 'cyclone_armor_3_back', 'Expansion/CycloneArmorCBack'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'rabiesplague',
    celFile: 'Expansion/rabies',
    aliases: ['rabies', 'rabies_overlay', 'Expansion/rabies'],
    animRate: 16,
    trans: 5,
    yOffset: -75,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul1front',
    celFile: 'expansion/Maul_A_Front',
    aliases: ['maul1', 'maul_1_front', 'expansion/Maul_A_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul2front',
    celFile: 'expansion/Maul_B_Front',
    aliases: ['maul2', 'maul_2_front', 'expansion/Maul_B_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul3front',
    celFile: 'expansion/Maul_C_Front',
    aliases: ['maul3', 'maul_3_front', 'expansion/Maul_C_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul4front',
    celFile: 'expansion/Maul_D_Front',
    aliases: ['maul4', 'maul_4_front', 'expansion/Maul_D_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul5front',
    celFile: 'expansion/Maul_E_Front',
    aliases: ['maul5', 'maul_5_front', 'expansion/Maul_E_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul1back',
    celFile: 'expansion/Maul_A_Back',
    aliases: ['maul_1_back', 'expansion/Maul_A_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul2back',
    celFile: 'expansion/Maul_B_Back',
    aliases: ['maul_2_back', 'expansion/Maul_B_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul3back',
    celFile: 'expansion/Maul_C_Back',
    aliases: ['maul_3_back', 'expansion/Maul_C_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul4back',
    celFile: 'expansion/Maul_D_Back',
    aliases: ['maul_4_back', 'expansion/Maul_D_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'maul5back',
    celFile: 'expansion/Maul_E_Back',
    aliases: ['maul_5_back', 'expansion/Maul_E_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage1front',
    celFile: 'expansion/feral_rage_A_Front',
    aliases: ['feralrage1', 'feral_rage_1_front', 'expansion/feral_rage_A_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage2front',
    celFile: 'expansion/feral_rage_B_Front',
    aliases: ['feralrage2', 'feral_rage_2_front', 'expansion/feral_rage_B_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage3front',
    celFile: 'expansion/feral_rage_C_Front',
    aliases: ['feralrage3', 'feral_rage_3_front', 'expansion/feral_rage_C_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage4front',
    celFile: 'expansion/feral_rage_D_Front',
    aliases: ['feralrage4', 'feral_rage_4_front', 'expansion/feral_rage_D_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage5front',
    celFile: 'expansion/feral_rage_E_Front',
    aliases: ['feralrage5', 'feral_rage_5_front', 'expansion/feral_rage_E_Front'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage1back',
    celFile: 'expansion/feral_rage_A_Back',
    aliases: ['feral_rage_1_back', 'expansion/feral_rage_A_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage2back',
    celFile: 'expansion/feral_rage_B_Back',
    aliases: ['feral_rage_2_back', 'expansion/feral_rage_B_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage3back',
    celFile: 'expansion/feral_rage_C_Back',
    aliases: ['feral_rage_3_back', 'expansion/feral_rage_C_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage4back',
    celFile: 'expansion/feral_rage_D_Back',
    aliases: ['feral_rage_4_back', 'expansion/feral_rage_D_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'feralrage5back',
    celFile: 'expansion/feral_rage_E_Back',
    aliases: ['feral_rage_5_back', 'expansion/feral_rage_E_Back'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'direwolfcharged',
    celFile: 'expansion/DireWolfCharged',
    aliases: ['dire_wolf_charged', 'direwolf_charged', 'expansion/DireWolfCharged'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },

  // Additional Necromancer & Druid Overlays (Issue #760)
  {
    name: 'curse_hit',
    celFile: 'CurseHit',
    aliases: ['cursehit', 'CurseHit'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'steallife',
    celFile: 'CurseRevVampireHit',
    aliases: ['steal_life'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'arctic_blast_cast',
    celFile: 'Expansion/ColdWindOverlay',
    aliases: ['arcticblastcast', 'ColdWindOverlay', 'Expansion/ColdWindOverlay'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'fire_hit',
    celFile: 'FireHit',
    aliases: ['firehit', 'FireHit'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'oak_sage',
    celFile: 'Expansion/oak_sage_Aura',
    aliases: ['oaksage', 'oak_sage_aura', 'Expansion/oak_sage_Aura'],
    animRate: 6,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'heart_of_wolverine',
    celFile: 'expansion/Heart_of_Wolverine',
    aliases: ['heartofwolverine', 'Heart_of_Wolverine', 'expansion/Heart_of_Wolverine'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'spirit_of_barbs',
    celFile: 'expansion/spirit_of_barbs',
    aliases: ['spiritofbarbs', 'expansion/spirit_of_barbs'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },

  // ---------------------------------------------------------------------------
  // Authentic Diablo II v1.13c Assassin Martial Arts, Shadow & Trap Overlays
  // ---------------------------------------------------------------------------
  {
    name: 'blade_shield',
    celFile: 'Expansion/blade_shield',
    aliases: ['bladeshield', 'Expansion/blade_shield'],
    animRate: 16,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'deathsentry_explode',
    celFile: 'expansion/dethsentry01',
    aliases: ['death_sentry', 'deathsentry', 'dethsentry01', 'expansion/dethsentry01'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'psychic_hammer_curse',
    celFile: 'Expansion/PsyHammerOverlay',
    aliases: ['fist_will_cast', 'PsyHammerOverlay', 'Expansion/PsyHammerOverlay'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'psychic_hammer_hit',
    celFile: 'Expansion/PsyHammerHit',
    aliases: ['PsyHammerHit', 'Expansion/PsyHammerHit'],
    animRate: 16,
    trans: 3,
    yOffset: -60,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'assassinfootimpact',
    celFile: 'Expansion/DeadlyFistHit',
    aliases: ['assassinfistimpact', 'DeadlyFistHit', 'Expansion/DeadlyFistHit'],
    animRate: 16,
    trans: 3,
    yOffset: -60,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'tigerstrike1',
    celFile: 'expansion/tiger_Strike_A',
    aliases: ['tiger_Strike_A', 'expansion/tiger_Strike_A'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'tigerstrike2',
    celFile: 'expansion/tiger_Strike_B',
    aliases: ['tiger_Strike_B', 'expansion/tiger_Strike_B'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'tigerstrike3',
    celFile: 'expansion/tiger_Strike_C',
    aliases: ['tiger_Strike_C', 'expansion/tiger_Strike_C'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cobrastrike1',
    celFile: 'expansion/Cobra_Strike_A',
    aliases: ['Cobra_Strike_A', 'expansion/Cobra_Strike_A'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cobrastrike2',
    celFile: 'expansion/Cobra_Strike_B',
    aliases: ['Cobra_Strike_B', 'expansion/Cobra_Strike_B'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cobrastrike3',
    celFile: 'expansion/Cobra_Strike_C',
    aliases: ['Cobra_Strike_C', 'expansion/Cobra_Strike_C'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_damage_1',
    celFile: 'expansion/MISSILE_A_A',
    aliases: ['MISSILE_A_A', 'expansion/MISSILE_A_A'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_damage_2',
    celFile: 'expansion/MISSILE_A_B',
    aliases: ['MISSILE_A_B', 'expansion/MISSILE_A_B'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_damage_3',
    celFile: 'expansion/MISSILE_A_C',
    aliases: ['MISSILE_A_C', 'expansion/MISSILE_A_C'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_steal_1',
    celFile: 'expansion/MISSILE_B_A',
    aliases: ['MISSILE_B_A', 'expansion/MISSILE_B_A'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_steal_2',
    celFile: 'expansion/MISSILE_B_B',
    aliases: ['MISSILE_B_B', 'expansion/MISSILE_B_B'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_steal_3',
    celFile: 'expansion/MISSILE_B_C',
    aliases: ['MISSILE_B_C', 'expansion/MISSILE_B_C'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_other_1',
    celFile: 'expansion/MISSILE_C_A',
    aliases: ['MISSILE_C_A', 'expansion/MISSILE_C_A'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_other_2',
    celFile: 'expansion/MISSILE_C_B',
    aliases: ['MISSILE_C_B', 'expansion/MISSILE_C_B'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_other_3',
    celFile: 'expansion/MISSILE_C_C',
    aliases: ['MISSILE_C_C', 'expansion/MISSILE_C_C'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_fire_1',
    celFile: 'expansion/MISSILE_RED_A',
    aliases: ['MISSILE_RED_A', 'expansion/MISSILE_RED_A'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_fire_2',
    celFile: 'expansion/MISSILE_RED_B',
    aliases: ['MISSILE_RED_B', 'expansion/MISSILE_RED_B'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_fire_3',
    celFile: 'expansion/MISSILE_RED_C',
    aliases: ['MISSILE_RED_C', 'expansion/MISSILE_RED_C'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_cold_1',
    celFile: 'expansion/MISSILE_BLUE_A',
    aliases: ['MISSILE_BLUE_A', 'expansion/MISSILE_BLUE_A'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_cold_2',
    celFile: 'expansion/MISSILE_BLUE_B',
    aliases: ['MISSILE_BLUE_B', 'expansion/MISSILE_BLUE_B'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_cold_3',
    celFile: 'expansion/MISSILE_BLUE_C',
    aliases: ['MISSILE_BLUE_C', 'expansion/MISSILE_BLUE_C'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_lightning_1',
    celFile: 'expansion/MISSILE_WHITE_A',
    aliases: ['MISSILE_WHITE_A', 'expansion/MISSILE_WHITE_A'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_lightning_2',
    celFile: 'expansion/MISSILE_WHITE_B',
    aliases: ['MISSILE_WHITE_B', 'expansion/MISSILE_WHITE_B'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'progressive_lightning_3',
    celFile: 'expansion/MISSILE_WHITE_C',
    aliases: ['MISSILE_WHITE_C', 'expansion/MISSILE_WHITE_C'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'quickness',
    celFile: 'expansion/quickness',
    aliases: ['expansion/quickness'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'fade',
    celFile: 'expansion/fade',
    aliases: ['expansion/fade'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'cloaked',
    celFile: 'Expansion/CloakOfShadows',
    aliases: ['cloakofshadows', 'CloakOfShadows', 'Expansion/CloakOfShadows'],
    animRate: 16,
    trans: 3,
    yOffset: -120,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'dragonflight',
    celFile: 'expansion/DragonFlight',
    aliases: ['DragonFlight', 'expansion/DragonFlight'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'venomclaws',
    celFile: 'expansion/venomclaws',
    aliases: ['venom', 'expansion/venomclaws'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shadowwarriorappear',
    celFile: 'expansion/ShadowAppear',
    aliases: ['shadowwarriordeath', 'ShadowAppear', 'expansion/ShadowAppear'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // Authentic Diablo II v1.13c Town Portal Object Art (Objects.txt ID 59, Token TP: tpophth.cof & tponhth.cof)
  {
    name: 'town_portal_op_tr',
    celFile: 'tptrlitophth',
    aliases: ['tptrlitophth'],
    animRate: 16,
    trans: 0,
    preDraw: false,
    lightRadius: 19,
    lightColor: [64, 64, 255] as const,
  },
  {
    name: 'town_portal_op_hd',
    celFile: 'tphdlitophth',
    aliases: ['tphdlitophth'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 19,
    lightColor: [64, 64, 255] as const,
  },
  {
    name: 'town_portal_on_tr',
    celFile: 'tptrlitonhth',
    aliases: ['tptrlitonhth'],
    animRate: 16,
    trans: 0,
    preDraw: false,
    lightRadius: 19,
    lightColor: [64, 64, 255] as const,
  },
  {
    name: 'town_portal_on_hd',
    celFile: 'tphdlitonhth',
    aliases: ['tphdlitonhth'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 19,
    lightColor: [64, 64, 255] as const,
  },
  // 11 Shrine Overhead & Player Buff Overlays (States.txt 128..137 & Overlay.txt)
  {
    name: 'shrine_armor',
    celFile: 'ShrineArmor',
    aliases: ['shrinearmor'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_combat',
    celFile: 'ShrineCombat',
    aliases: ['shrinecombat'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_resist_fire',
    celFile: 'ShrineResistFire',
    aliases: ['shrineresistfire'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_resist_cold',
    celFile: 'ShrineResistCold',
    aliases: ['shrineresistcold'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_resist_lightning',
    celFile: 'ShrineResistLightning',
    aliases: ['shrineresistlightning'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_resist_poison',
    celFile: 'ShrineResistPoison',
    aliases: ['shrineresistpoison'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_skill',
    celFile: 'ShrineSkill',
    aliases: ['shrineskill'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_mana_regen',
    celFile: 'ShrineManaRegen',
    aliases: ['shrinemanaregen'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_stamina',
    celFile: 'ShrineStamina',
    aliases: ['shrinestamina'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_experience',
    celFile: 'ShrineExperience',
    aliases: ['shrineexperience'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_shimmer00',
    celFile: 'ShrineShimmer00',
    aliases: ['shrineshimmer00', 'objsb'],
    animRate: 16,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'shrine_shimmer01',
    celFile: 'ShrineShimmer01',
    aliases: ['shrineshimmer01'],
    animRate: 8,
    fps: 15,
    anchor: 'head',
    yOffset: -60,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // Authentic Diablo II v1.13c NPC Overhead Quest Indicator (Overlay.txt row 72 `npcalert`)
  {
    name: 'npcalert',
    celFile: 'NPCSpeechBalloon',
    aliases: ['npcspeechballoon', 'questalert'],
    animRate: 9,
    anchor: 'head',
    yOffset: -57,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  // Authentic Diablo II v1.13c Additional States.txt Overlays (Issue #878)
  {
    name: 'fetish_aura',
    celFile: 'FetishFreakOut',
    aliases: ['fetishfreakout', 'FetishFreakOut'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'whirlwind',
    celFile: 'BAWhirlwind01',
    aliases: ['bawhirlwind01', 'BAWhirlwind01'],
    animRate: 16,
    trans: 0,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'monfrenzy',
    celFile: 'FrenzyThornhulk',
    aliases: ['frenzythornhulk', 'FrenzyThornhulk'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'bloodlust_state',
    celFile: 'BloodRipple',
    aliases: ['bloodripple', 'BloodRipple'],
    animRate: 16,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
  {
    name: 'defense_curse',
    celFile: 'expansion/succcurseoverlay1',
    aliases: ['succcurseoverlay1', 'expansion/succcurseoverlay1'],
    animRate: 8,
    yOffset: -60,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [255, 193, 103] as const,
  },
  {
    name: 'blood_mana',
    celFile: 'expansion/succcurseoverlay2',
    aliases: ['succcurseoverlay2', 'expansion/succcurseoverlay2'],
    animRate: 16,
    yOffset: -60,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'burning',
    celFile: 'Expansion/On_Fire',
    aliases: ['on_fire', 'On_Fire', 'Expansion/On_Fire'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 6,
    lightColor: [255, 64, 64] as const,
  },
  {
    name: 'impregnated',
    celFile: 'expansion/painwormcurse',
    aliases: ['painwormcurse', 'expansion/painwormcurse'],
    animRate: 8,
    trans: 3,
    preDraw: true,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'poisonhit',
    celFile: 'expansion/poisonhit',
    aliases: ['expansion/poisonhit'],
    animRate: 8,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  // Authentic Diablo II v1.13c Monster & Boss Death Overlays (Issue #872)
  {
    name: 'fire_explode',
    celFile: 'FireExplode',
    aliases: ['fireexplode_overlay', 'FireExplode'],
    animRate: 8,
    trans: 0,
    preDraw: false,
    lightRadius: 8,
    lightColor: [255, 86, 0] as const,
  },
  {
    name: 'durieldead_fwd',
    celFile: 'DurielBloodsplatOverlayFwd',
    aliases: ['durielbloodsplatoverlayfwd', 'DurielBloodsplatOverlayFwd'],
    animRate: 8,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'zakarumpriest_death',
    celFile: 'Zakarum_Priest_DeathGlow',
    aliases: ['zakarum_priest_deathglow', 'Zakarum_Priest_DeathGlow'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 11,
    lightColor: [255, 198, 0] as const,
  },
  {
    name: 'thornedhulk_death',
    celFile: 'ThornedHulkDeathOverlay',
    aliases: ['thornedhulkdeathoverlay', 'ThornedHulkDeathOverlay'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'frogdemon_death',
    celFile: 'FrogExplode',
    aliases: ['frogexplode', 'FrogExplode'],
    animRate: 8,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'fingermagespiderexplode',
    celFile: 'FingerMageSpiderXplode',
    aliases: ['fingermagespiderxplode', 'FingerMageSpiderXplode'],
    animRate: 8,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'durieldead_rear',
    celFile: 'DurielBloodsplatOverlayRear',
    aliases: ['durielbloodsplatoverlayrear', 'DurielBloodsplatOverlayRear'],
    animRate: 8,
    trans: 5,
    preDraw: true,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'willowispdeath',
    celFile: 'willodeathoverlay',
    aliases: ['willodeathoverlay'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'megademondeath',
    celFile: 'firedeath',
    aliases: ['firedeath'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'undeadhorrordeath',
    celFile: 'UMFire',
    aliases: ['umfire', 'UMFire'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'fetishdeath1',
    celFile: 'BoneFetishDeathBones',
    aliases: ['bonefetishdeathbones', 'BoneFetishDeathBones'],
    animRate: 16,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'fetishdeath2',
    celFile: 'BoneFetishDeathCloud',
    aliases: ['bonefetishdeathcloud', 'BoneFetishDeathCloud'],
    animRate: 16,
    trans: 0,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'siege_beast_dust',
    celFile: 'Expansion/SeigeBeast_Dust',
    aliases: ['seigebeast_dust', 'SeigeBeast_Dust', 'Expansion/SeigeBeast_Dust'],
    animRate: 16,
    trans: 0,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'spawnedminion',
    celFile: 'Expansion/minionspawnover',
    aliases: ['minionspawnover', 'Expansion/minionspawnover'],
    animRate: 12,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'suicide_death',
    celFile: 'Expansion/Suicide_Death_Overlay',
    aliases: ['suicide_death_overlay', 'Suicide_Death_Overlay', 'Expansion/Suicide_Death_Overlay'],
    animRate: 16,
    trans: 5,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'catapult_death_s',
    celFile: 'Expansion/catadeathoversouth',
    aliases: ['catadeathoversouth', 'Expansion/catadeathoversouth'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'catapult_death_e',
    celFile: 'Expansion/catadeathovereast',
    aliases: ['catadeathovereast', 'Expansion/catadeathovereast'],
    animRate: 16,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  {
    name: 'succubae_death',
    celFile: 'expansion/succ1deathoverlay',
    aliases: ['succ1deathoverlay', 'expansion/succ1deathoverlay'],
    animRate: 16,
    trans: 0,
    preDraw: false,
    lightRadius: 0,
    lightColor: [0, 0, 0] as const,
  },
  // Overlay.txt 181 `light_jet` (LIGHTJET, Frames 13, AnimRate 4, Trans 3, no light): put on the A2Q6 orifice by
  // special quest event 3 (D2Client 0x6fb03450 -> 0x6fb1b300, `mov eax,0xb5`). Issue #915.
  {
    name: 'light_jet',
    celFile: 'LIGHTJET',
    animRate: 4,
    trans: 3,
    preDraw: false,
    lightRadius: 0,
    lightColor: [255, 255, 255] as const,
  },
] as const

/**
 * Parse MPQ `data/global/excel/States.txt` and build the `STATE_OVERLAYS` table:
 * - Reads `overlay1..overlay4` for each state row;
 * - Expands `pgsv = 1` / `pgsvoverlay` states (122..127) to the 3 consecutive `overlay.bin`
 *   rows (`[baseIdx, baseIdx + 1, baseIdx + 2]`) per `D2Client.dll` `setfunc = 1 @ 0x6fb23410`;
 * - Fails fast if any referenced token does not exist in `overlayTxtRows` (`overlay.bin`).
 */
export function parseStatesTxtOverlays(
  statesTxt: string,
  overlayTxtRows: readonly OverlayTxtRow[] = extractOverlayRows(new NodeMpqArchiveSource(DEFAULT_NODE_MPQ_DIR)),
): Readonly<Record<number, readonly string[]>> {
  const lines = statesTxt.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) {
    throw new Error('States.txt is empty')
  }
  const headers = lines[0]!.split('\t').map(h => h.trim().toLowerCase())
  const idIdx = headers.indexOf('id')
  const ov1Idx = headers.indexOf('overlay1')
  const ov2Idx = headers.indexOf('overlay2')
  const ov3Idx = headers.indexOf('overlay3')
  const ov4Idx = headers.indexOf('overlay4')
  const pgsvIdx = headers.indexOf('pgsv')
  const pgsvOvIdx = headers.indexOf('pgsvoverlay')
  if (
    idIdx < 0 ||
    ov1Idx < 0 ||
    ov2Idx < 0 ||
    ov3Idx < 0 ||
    ov4Idx < 0 ||
    pgsvIdx < 0 ||
    pgsvOvIdx < 0
  ) {
    throw new Error('States.txt missing required Id / overlay1..4 / pgsv / pgsvoverlay columns')
  }

  const overlayIndexByName = new Map<string, number>()
  for (let i = 0; i < overlayTxtRows.length; i++) {
    overlayIndexByName.set(overlayTxtRows[i]!.name.toLowerCase(), i)
  }

  const result: Record<number, readonly string[]> = {}
  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cols = lines[lineIdx]!.split('\t')
    const stateName = (cols[0] ?? '').trim()
    const idRaw = (cols[idIdx] ?? '').trim()
    if (!stateName || stateName === 'Expansion' || !idRaw) continue
    const stateId = Number(idRaw)
    if (!Number.isInteger(stateId) || stateId < 0) {
      throw new Error(`Invalid state Id "${idRaw}" for state "${stateName}" in States.txt`)
    }

    const tokens: string[] = []
    for (const colIdx of [ov1Idx, ov2Idx, ov3Idx, ov4Idx]) {
      const tok = (cols[colIdx] ?? '').trim().toLowerCase()
      if (tok.length > 0) {
        if (!overlayIndexByName.has(tok)) {
          throw new Error(
            `States.txt state ${stateId} (${stateName}) references overlay token "${tok}" which is missing from overlay.bin`,
          )
        }
        tokens.push(tok)
      }
    }

    const pgsv = (cols[pgsvIdx] ?? '').trim() === '1'
    const pgsvOv = (cols[pgsvOvIdx] ?? '').trim().toLowerCase()
    if (tokens.length === 0 && pgsv && pgsvOv.length > 0) {
      const baseIdx = overlayIndexByName.get(pgsvOv)
      if (baseIdx === undefined) {
        throw new Error(
          `States.txt state ${stateId} (${stateName}) references pgsvoverlay "${pgsvOv}" which is missing from overlay.bin`,
        )
      }
      for (let offset = 0; offset < 3; offset++) {
        const row = overlayTxtRows[baseIdx + offset]
        if (!row) {
          throw new Error(
            `States.txt state ${stateId} (${stateName}) pgsvoverlay "${pgsvOv}" + ${offset} out of bounds in overlay.bin`,
          )
        }
        tokens.push(row.name.toLowerCase())
      }
    }

    if (tokens.length > 0) {
      result[stateId] = Object.freeze(tokens)
    }
  }

  return Object.freeze(result)
}

export async function bakeOverlays(
  projectRoot: string = process.cwd(),
  options?: { outDir?: string; skipMetaTs?: boolean }
): Promise<Record<string, OverlayMeta>> {
  const targetRoot = options?.outDir ?? process.env.D2_PACK_OUT_DIR ?? projectRoot

  const fallbackDir = process.env.D2_DATA_DIR ?? join(projectRoot, 'samples', 'd2')
  const archivePaths = [
    join(projectRoot, 'samples', 'd2', 'Patch_D2.mpq'),
    join(projectRoot, 'samples', 'd2', 'd2exp.mpq'),
    join(projectRoot, 'samples', 'd2', 'd2data.mpq'),
    join(fallbackDir, 'Patch_D2.mpq'),
    join(fallbackDir, 'd2exp.mpq'),
    join(fallbackDir, 'd2data.mpq'),
  ]
  const archives: MpqArchive[] = []
  for (const p of archivePaths) {
    try {
      archives.push(await MpqArchive.open(await fileSource(p)))
    } catch {
      // ignore
    }
  }

  async function readMpqFile(path: string): Promise<Uint8Array | null> {
    for (const a of archives) {
      const f = a.find(path)
      if (f) return a.read(f)
    }
    return null
  }

  const palBytes = await readMpqFile('data/global/palette/ACT1/pal.pl2')
  if (!palBytes) throw new Error('data/global/palette/ACT1/pal.pl2 not found in MPQ archives')
  const pl2 = decodePl2(palBytes)

  const publicOutDir = join(targetRoot, 'public', 'overlays')
  mkdirSync(publicOutDir, { recursive: true })


  const metaRecord: Record<string, OverlayMeta> = {}

  for (const target of OVERLAY_TARGETS) {
    const raw =
      (await readMpqFile(`data/global/overlays/${target.celFile}.dcc`)) ??
      (await readMpqFile(`data/global/objects/tp/tr/${target.celFile}.dcc`)) ??
      (await readMpqFile(`data/global/objects/tp/hd/${target.celFile}.dcc`))
    if (!raw) throw new Error(`Overlay DCC not found: data/global/overlays/${target.celFile}.dcc`)

    const dcc = decodeDcc(raw)
    const firstDir = dcc.directions[0]
    if (!firstDir) throw new Error(`Overlay DCC has no directions: ${target.celFile}`)

    const box: OverlayBox = {
      left: firstDir.box.left,
      top: firstDir.box.top,
      width: firstDir.box.width,
      height: firstDir.box.height,
    }

    const groups = dcc.directions.map(dir => ({
      frames: dir.frames.map(
        (frame): SpriteFrame => ({
          width: frame.frame.width,
          height: frame.frame.height,
          indices: frame.frame.indices,
          mask: frame.frame.mask,
          anchorX: dir.box.left,
          anchorY:
            target.anchor === 'head' && target.yOffset !== undefined && dir.box.top < -120
              ? dir.box.top - target.yOffset
              : dir.box.top,
        }),
      ),
    }))

    const sheet: SpriteSheet = { groups, width: null }
    const packTrans = target.trans === 5 ? 3 : target.trans
    const packed = packMissileSheetToRgbaPng(sheet, pl2.rgb, packTrans)
    const blendModeStr =
      target.trans === 0
        ? 'trans25'
        : target.trans === 1
          ? 'highlight'
          : target.trans === 2
            ? 'trans75'
            : target.trans === 3
              ? 'trans50'
              : target.trans === 4
                ? 'burn'
                : target.trans === 5
                  ? 'normal'
                  : target.trans === 6
                    ? 'modulate'
                    : target.trans === 7
                      ? 'transhighlight'
                      : 'normal'

    const meta: OverlayMeta = {
      name: target.name,
      celFile: target.celFile,
      width: packed.width,
      height: packed.height,
      directions: dcc.directions.length,
      frames: firstDir.frames.length,
      framesPerDirection: firstDir.frames.length,
      animRate: target.animRate,
      ...(target.fps !== undefined ? { fps: target.fps } : {}),
      trans: target.trans,
      blendMode: blendModeStr,
      ...(target.anchor !== undefined ? { anchor: target.anchor } : {}),
      ...(target.yOffset !== undefined ? { yOffset: target.yOffset } : {}),
      preDraw: target.preDraw,
      lightRadius: target.lightRadius,
      lightColor: target.lightColor,
      box,
      groups: packed.groups,
    }

    const rawKeys = [target.name, target.celFile, ...(target.aliases ?? [])]
    for (const key of rawKeys) {
      metaRecord[key] = meta
      metaRecord[key.toLowerCase()] = meta
      if (key.includes('/') || key.includes('\\')) {
        const base = key.split(/[/\\]/).pop()!
        metaRecord[base] = meta
        metaRecord[base.toLowerCase()] = meta
      }
    }

    const fileKeys = new Set<string>()
    for (const key of rawKeys) {
      const lower = key.toLowerCase()
      fileKeys.add(lower)
      if (lower.includes('/') || lower.includes('\\')) {
        fileKeys.add(lower.split(/[/\\]/).pop()!)
      }
    }

    const jsonStr = JSON.stringify(meta, null, 2)

    // Write primary name and aliases to public/overlays/ (strictly lowercase)
    for (const fileKey of fileKeys) {
      const pubPng = join(publicOutDir, `${fileKey}.png`)
      const pubJson = join(publicOutDir, `${fileKey}.json`)
      mkdirSync(join(pubPng, '..'), { recursive: true })
      writeFileSync(pubPng, packed.png)
      writeFileSync(pubJson, jsonStr, 'utf-8')
    }

    console.log(
      `[Overlay Packer] Baked ${target.name} (${target.celFile}.dcc): ` +
      `${meta.frames} frames, box [${box.left}, ${box.top}, ${box.width}, ${box.height}], ` +
      `${packed.width}x${packed.height}, ${packed.png.byteLength} bytes PNG`,
    )
  }

  const TARGET_CONST_NAMES: Record<string, string> = {
    fire_cast_1: 'FIRE_CAST_1_META',
    fire_cast_2: 'FIRE_CAST_2_META',
    ice_cast_1: 'ICE_CAST_1_META',
    ice_cast_2: 'ICE_CAST_2_META',
    ice_cast_3: 'ICE_CAST_3_META',
    light_cast_1: 'LIGHT_CAST_1_META',
    light_cast_2: 'LIGHT_CAST_2_META',
    teleport: 'TELEPORT_META',

    might_front: 'MIGHT_FRONT_AURA_META',
    might_back: 'MIGHT_BACK_AURA_META',
    prayer_front: 'PRAYER_FRONT_AURA_META',
    prayer_back: 'PRAYER_BACK_AURA_META',
    resist_fire: 'RESIST_FIRE_AURA_META',
    holy_fire_front: 'HOLY_FIRE_FRONT_AURA_META',
    holy_fire_back: 'HOLY_FIRE_BACK_AURA_META',
    thorns_front: 'THORNS_FRONT_AURA_META',
    thorns_back: 'THORNS_BACK_AURA_META',
    defiance_front: 'DEFIANCE_FRONT_AURA_META',
    defiance_back: 'DEFIANCE_BACK_AURA_META',
    resist_cold: 'RESIST_COLD_AURA_META',
    blessed_aim_front: 'BLESSED_AIM_FRONT_AURA_META',
    blessed_aim_back: 'BLESSED_AIM_BACK_AURA_META',
    cleansing_front: 'CLEANSING_FRONT_AURA_META',
    cleansing_back: 'CLEANSING_BACK_AURA_META',
    resist_lightning: 'RESIST_LIGHTNING_AURA_META',
    concentration_front: 'CONCENTRATION_FRONT_AURA_META',
    concentration_back: 'CONCENTRATION_BACK_AURA_META',
    holy_freeze: 'HOLY_FREEZE_AURA_META',
    vigor_front: 'VIGOR_FRONT_AURA_META',
    vigor_back: 'VIGOR_BACK_AURA_META',
    holy_shock_front: 'HOLY_SHOCK_FRONT_AURA_META',
    holy_shock_back: 'HOLY_SHOCK_BACK_AURA_META',
    sanctuary_front: 'SANCTUARY_FRONT_AURA_META',
    sanctuary_back: 'SANCTUARY_BACK_AURA_META',
    meditation: 'MEDITATION_AURA_META',
    fanaticism_front: 'FANATICISM_FRONT_AURA_META',
    fanaticism_back: 'FANATICISM_BACK_AURA_META',
    aura_fanatic: 'AURA_FANATIC_OVERLAY_META',
    conviction: 'CONVICTION_AURA_META',
    redemption: 'REDEMPTION_AURA_META',
    salvation_front: 'SALVATION_FRONT_AURA_META',
    salvation_back: 'SALVATION_BACK_AURA_META',

    // 9 Sorceress Overlays
    lightning: 'LIGHTNING_OVERLAY_META',
    frozenarmor: 'FROZEN_ARMOR_OVERLAY_META',
    frozenarmor_hit: 'FROZEN_ARMOR_HIT_OVERLAY_META',
    energyshield: 'ENERGY_SHIELD_OVERLAY_META',
    energyshieldhit0: 'ENERGY_SHIELD_HIT_OVERLAY_META',
    thunderstormcast: 'THUNDERSTORM_CAST_OVERLAY_META',
    thunderstormback: 'THUNDERSTORM_BACK_OVERLAY_META',
    enchant: 'ENCHANT_OVERLAY_META',
    ice_explode: 'ICE_EXPLODE_OVERLAY_META',

    // 15 Necromancer Overlays
    curseamplifydamage: 'CURSE_AMPLIFY_DAMAGE_OVERLAY_META',
    cursedimvision: 'CURSE_DIM_VISION_OVERLAY_META',
    curseweaken: 'CURSE_WEAKEN_OVERLAY_META',
    curseironmaiden: 'CURSE_IRON_MAIDEN_OVERLAY_META',
    curseterror: 'CURSE_TERROR_OVERLAY_META',
    curseconfuse: 'CURSE_CONFUSE_OVERLAY_META',
    cursereversevampire: 'CURSE_LIFE_TAP_OVERLAY_META',
    curseattract: 'CURSE_ATTRACT_OVERLAY_META',
    cursedecrepify: 'CURSE_DECREPIFY_OVERLAY_META',
    curselowerresist: 'CURSE_LOWER_RESIST_OVERLAY_META',
    hit_ironmaiden: 'HIT_IRON_MAIDEN_OVERLAY_META',
    hit_reversevampire: 'HIT_LIFE_TAP_OVERLAY_META',
    bonearmor_cast: 'BONE_ARMOR_CAST_OVERLAY_META',
    bonearmor_front: 'BONE_ARMOR_FRONT_OVERLAY_META',
    bonearmor_back: 'BONE_ARMOR_BACK_OVERLAY_META',

    // 16 Paladin Overlays
    charge: 'CHARGE_OVERLAY_META',
    conversion: 'CONVERSION_OVERLAY_META',
    conversioncast: 'CONVERSION_CAST_OVERLAY_META',
    holy_bolt_cast: 'HOLY_BOLT_CAST_OVERLAY_META',
    fist_of_the_heavens_cast: 'FIST_OF_THE_HEAVENS_CAST_OVERLAY_META',
    handofgod: 'HAND_OF_GOD_OVERLAY_META',
    sanctuary_knockback: 'SANCTUARY_KNOCKBACK_OVERLAY_META',
    holy_fire_hit: 'HOLY_FIRE_HIT_OVERLAY_META',
    holy_fire_indicate: 'HOLY_FIRE_INDICATE_OVERLAY_META',
    thorns_hit: 'THORNS_HIT_OVERLAY_META',
    thorns_indicate: 'THORNS_INDICATE_OVERLAY_META',
    cast_resistfire: 'CAST_RESIST_FIRE_OVERLAY_META',
    cast_resistcold: 'CAST_RESIST_COLD_OVERLAY_META',
    cast_resistlight: 'CAST_RESIST_LIGHTNING_OVERLAY_META',
    cast_resistall: 'CAST_RESIST_ALL_OVERLAY_META',
    stun: 'STUN_OVERLAY_META',

    // 10 Amazon Overlays
    cast_innersight: 'CAST_INNERSIGHT_OVERLAY_META',
    innersight: 'INNERSIGHT_OVERLAY_META',
    cast_slowmissiles: 'CAST_SLOWMISSILES_OVERLAY_META',
    handofathena: 'HANDOFATHENA_OVERLAY_META',
    valkyriestart: 'VALKYRIESTART_OVERLAY_META',
    valkyrie: 'VALKYRIE_OVERLAY_META',
    dopllezon_appear: 'DOPLLEZON_APPEAR_OVERLAY_META',
    doubledamage1: 'DOUBLEDAMAGE1_OVERLAY_META',
    doubledamage2: 'DOUBLEDAMAGE2_OVERLAY_META',
    doubledamage3: 'DOUBLEDAMAGE3_OVERLAY_META',

    // 10 Barbarian Overlays
    shoutstart: 'SHOUTSTART_OVERLAY_META',
    shout: 'SHOUT_OVERLAY_META',
    battlecry: 'BATTLECRY_OVERLAY_META',
    battleorderscast: 'BATTLEORDERSCAST_OVERLAY_META',
    battleorders: 'BATTLEORDERS_OVERLAY_META',
    battlecommandcast: 'BATTLECOMMANDCAST_OVERLAY_META',
    battlecommand: 'BATTLECOMMAND_OVERLAY_META',
    berserkfront: 'BERSERKFRONT_OVERLAY_META',
    frenzy: 'FRENZY_OVERLAY_META',
    warcry: 'WARCRY_OVERLAY_META',

    // 31 Druid Overlays
    druid_fire_cast_1: 'DRUID_FIRE_CAST_1_OVERLAY_META',
    druid_fire_cast_2: 'DRUID_FIRE_CAST_2_OVERLAY_META',
    druidmorph: 'DRUIDMORPH_OVERLAY_META',
    cyclonearmor1front: 'CYCLONEARMOR1FRONT_OVERLAY_META',
    cyclonearmor1back: 'CYCLONEARMOR1BACK_OVERLAY_META',
    cyclonearmor2front: 'CYCLONEARMOR2FRONT_OVERLAY_META',
    cyclonearmor2back: 'CYCLONEARMOR2BACK_OVERLAY_META',
    cyclonearmor3front: 'CYCLONEARMOR3FRONT_OVERLAY_META',
    cyclonearmor3back: 'CYCLONEARMOR3BACK_OVERLAY_META',
    rabiesplague: 'RABIESPLAGUE_OVERLAY_META',
    maul1front: 'MAUL1FRONT_OVERLAY_META',
    maul2front: 'MAUL2FRONT_OVERLAY_META',
    maul3front: 'MAUL3FRONT_OVERLAY_META',
    maul4front: 'MAUL4FRONT_OVERLAY_META',
    maul5front: 'MAUL5FRONT_OVERLAY_META',
    maul1back: 'MAUL1BACK_OVERLAY_META',
    maul2back: 'MAUL2BACK_OVERLAY_META',
    maul3back: 'MAUL3BACK_OVERLAY_META',
    maul4back: 'MAUL4BACK_OVERLAY_META',
    maul5back: 'MAUL5BACK_OVERLAY_META',
    feralrage1front: 'FERALRAGE1FRONT_OVERLAY_META',
    feralrage2front: 'FERALRAGE2FRONT_OVERLAY_META',
    feralrage3front: 'FERALRAGE3FRONT_OVERLAY_META',
    feralrage4front: 'FERALRAGE4FRONT_OVERLAY_META',
    feralrage5front: 'FERALRAGE5FRONT_OVERLAY_META',
    feralrage1back: 'FERALRAGE1BACK_OVERLAY_META',
    feralrage2back: 'FERALRAGE2BACK_OVERLAY_META',
    feralrage3back: 'FERALRAGE3BACK_OVERLAY_META',
    feralrage4back: 'FERALRAGE4BACK_OVERLAY_META',
    feralrage5back: 'FERALRAGE5BACK_OVERLAY_META',
    direwolfcharged: 'DIREWOLFCHARGED_OVERLAY_META',
  }

  const EXPORTED_OVERLAY_META_CONSTS = new Set<string>([
    'FIRE_CAST_2_META',
    'ICE_CAST_1_META',
    'ICE_CAST_2_META',
    'LIGHT_CAST_1_META',
    'LIGHT_CAST_2_META',
    'AURA_FANATIC_OVERLAY_META',
    'LIGHTNING_OVERLAY_META',
    'FROZEN_ARMOR_OVERLAY_META',
    'FROZEN_ARMOR_HIT_OVERLAY_META',
    'ENERGY_SHIELD_OVERLAY_META',
    'ENERGY_SHIELD_HIT_OVERLAY_META',
    'ENCHANT_OVERLAY_META',
  ])

  const formatOverlayMetaTs = (meta: OverlayMeta): string => {
    const { groups, box, lightColor, ...scalar } = meta
    const scalarPairs = Object.entries(scalar)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ')
    const groupsStr = groups
      .map(g => `    [${g.map(f => `[${f.join(', ')}]`).join(', ')}]`)
      .join(',\n')
    return `{\n  ${scalarPairs},\n  lightColor: [${lightColor.join(', ')}],\n  box: { left: ${box.left}, top: ${box.top}, width: ${box.width}, height: ${box.height} },\n  groups: [\n${groupsStr}\n  ],\n}`
  }

  const individualConsts = OVERLAY_TARGETS.map(t => {
    const constName = TARGET_CONST_NAMES[t.name] ?? `${t.name.toUpperCase()}_META`
    const prefix = EXPORTED_OVERLAY_META_CONSTS.has(constName) ? 'export const' : 'const'
    return `${prefix} ${constName}: OverlayMeta = ${formatOverlayMetaTs(metaRecord[t.name]!)}`
  }).join('\n')

  const compatAliases = `const BERSERKBACK_OVERLAY_META: OverlayMeta = { ...BERSERKFRONT_OVERLAY_META, name: 'berserkback', celFile: 'null', preDraw: true }`

  const overlayMetasEntries: string[] = [
    '  "berserkback": BERSERKBACK_OVERLAY_META,',
    '  "berserk_back": BERSERKBACK_OVERLAY_META,',
  ]
  const seenKeys = new Set<string>(['berserkback', 'berserk_back'])
  for (const t of OVERLAY_TARGETS) {
    const constName = TARGET_CONST_NAMES[t.name] ?? `${t.name.toUpperCase()}_META`
    const keys = new Set<string>([t.name, t.celFile, ...(t.aliases ?? [])])
    for (const k of keys) {
      if (!seenKeys.has(k)) {
        seenKeys.add(k)
        overlayMetasEntries.push(`  ${JSON.stringify(k)}: ${constName},`)
      }
      const lower = k.toLowerCase()
      if (!seenKeys.has(lower)) {
        seenKeys.add(lower)
        overlayMetasEntries.push(`  ${JSON.stringify(lower)}: ${constName},`)
      }
    }
  }

  const statesBytes = await readMpqFile('data/global/excel/States.txt')
  if (!statesBytes) {
    throw new Error('data/global/excel/States.txt not found in MPQ archives')
  }
  const overlayTxtRows = extractOverlayRows(new NodeMpqArchiveSource(fallbackDir))
  const statesTxt = new TextDecoder('utf-8').decode(statesBytes)
  const stateOverlaysMap = parseStatesTxtOverlays(statesTxt, overlayTxtRows)
  const stateOverlaysEntries = Object.entries(stateOverlaysMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([stateId, tokens]) => `  ${stateId}: [${tokens.map(t => JSON.stringify(t)).join(', ')}],`)
    .join('\n')

  const authenticOverlayEntries: string[] = []
  const seenAuthenticKeys = new Set<string>()
  for (const row of overlayTxtRows) {
    const key = row.name.toLowerCase()
    if (seenAuthenticKeys.has(key)) continue
    seenAuthenticKeys.add(key)
    const entryObj = {
      overlay: key,
      filename: row.filename.replace(/\\/g, '/'),
      frames: row.frames,
      animRate: row.animRate,
      trans: row.trans,
      preDraw: row.preDraw !== 0,
      radius: row.radius,
      red: row.red,
      green: row.green,
      blue: row.blue,
      xOffset: row.xOffset,
      yOffset: row.yOffset,
      height1: row.height[0],
      height2: row.height[1],
      height3: row.height[2],
      height4: row.height[3],
    }
    authenticOverlayEntries.push(`  ${JSON.stringify(key)}: ${JSON.stringify(entryObj)},`)
  }

  // Generate src/render/overlays-meta.ts
  const metaTsContent = `/**
 * Authentic Diablo II v1.13c Cast & Aura Overlay Atlas Metadata.
 * Auto-generated by scripts/pack-overlays.ts.
 * Enforces Zero Runtime MPQ/DLL Architectural Invariant.
 */

export interface OverlayFrameMeta {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly anchorX: number
  readonly anchorY: number
}

export type OverlayFrameTuple = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
]

export interface OverlayBox {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface OverlayMeta {
  readonly name: string
  readonly celFile: string
  readonly width: number
  readonly height: number
  readonly directions: number
  readonly frames: number
  readonly framesPerDirection: number
  readonly animRate: number
  readonly fps?: number
  readonly trans: number
  readonly blendMode?: string
  readonly anchor?: 'head' | 'feet' | 'center'
  readonly yOffset?: number
  readonly preDraw: boolean
  readonly lightRadius: number
  readonly lightColor: readonly [number, number, number]
  readonly box: OverlayBox
  readonly groups: readonly (readonly OverlayFrameTuple[])[]
}

${individualConsts}

${compatAliases}

export const ALL_OVERLAY_NAMES: readonly string[] = [
${OVERLAY_TARGETS.map(t => `  ${JSON.stringify(t.name)},`).join('\n')}
]

export const OVERLAY_METAS: Readonly<Record<string, OverlayMeta>> = {
${overlayMetasEntries.join('\n')}
}

export interface AuthenticOverlayTxtEntry {
  readonly overlay: string
  readonly filename: string
  readonly frames: number
  readonly animRate: number
  readonly trans: number
  readonly preDraw: boolean
  readonly radius: number
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly xOffset: number
  readonly yOffset: number
  readonly height1: number
  readonly height2: number
  readonly height3: number
  readonly height4: number
}

/**
 * Authentic Diablo II v1.13c Overlay.txt ground truth records.
 * Generated directly from OVERLAY_TXT_ROWS (overlay.bin).
 */
export const AUTHENTIC_113C_OVERLAYS: Readonly<Record<string, AuthenticOverlayTxtEntry>> = Object.freeze({
${authenticOverlayEntries.join('\n')}
})

/**
 * Authentic Diablo II v1.13c States.txt overlay mapping.
 * Auto-generated from data/global/excel/States.txt (overlay1..overlay4 + pgsv=1 / pgsvoverlay).
 * Every token is verified against overlay.bin (OVERLAY_TXT_ROWS).
 */
export const STATE_OVERLAYS: Readonly<Record<number, readonly string[]>> = Object.freeze({
${stateOverlaysEntries}
})
`
  // Also bake ShrineShimmer00.dcc as objsb.{png,json} for shrine shimmer overlays
  const shrineRaw = await readMpqFile('data/global/overlays/ShrineShimmer00.dcc')
  if (shrineRaw) {
    const sDcc = decodeDcc(shrineRaw)
    const sDir = sDcc.directions[0]
    if (sDir) {
      const sBox: OverlayBox = {
        left: sDir.box.left,
        top: sDir.box.top,
        width: sDir.box.width,
        height: sDir.box.height,
      }
      const sGroups = sDcc.directions.map(dir => ({
        frames: dir.frames.map(
          (frame): SpriteFrame => ({
            width: frame.frame.width,
            height: frame.frame.height,
            indices: frame.frame.indices,
            mask: frame.frame.mask,
            anchorX: dir.box.left,
            anchorY: dir.box.top,
          }),
        ),
      }))
      const sSheet: SpriteSheet = { groups: sGroups, width: null }
      const sPacked = packMissileSheetToRgbaPng(sSheet, pl2.rgb, 3)
      const sMeta: OverlayMeta = {
        name: 'objsb',
        celFile: 'ShrineShimmer00',
        width: sPacked.width,
        height: sPacked.height,
        directions: sDcc.directions.length,
        frames: sDir.frames.length,
        framesPerDirection: sDir.frames.length,
        animRate: 16,
        trans: 3,
        blendMode: 'trans50',
        preDraw: false,
        lightRadius: 0,
        lightColor: [255, 255, 255] as const,
        box: sBox,
        groups: sPacked.groups,
      }
      metaRecord['objsb'] = sMeta
      metaRecord['ShrineShimmer00'] = sMeta
      metaRecord['shrineshimmer00'] = sMeta
      const sJson = JSON.stringify(sMeta, null, 2)
      for (const k of ['objsb', 'shrineshimmer00']) {
        writeFileSync(join(publicOutDir, `${k}.png`), sPacked.png)
        writeFileSync(join(publicOutDir, `${k}.json`), sJson, 'utf-8')
      }
    }
  }

  const manifestStr = JSON.stringify(
    {
      schema: 1,
      totalOverlays: Object.keys(metaRecord).length,
      overlays: metaRecord,
    },
    null,
    2,
  )
  writeFileSync(join(publicOutDir, 'overlays-manifest.json'), manifestStr, 'utf-8')

  if (process.argv.includes('--write-meta-ts') && !options?.skipMetaTs && !process.env.D2_PACK_OUT_DIR && !options?.outDir) {
    const metaTsPath = join(projectRoot, 'src', 'client', 'render', 'overlays-meta.ts')
    writeFileSync(metaTsPath, metaTsContent, 'utf-8')
    console.log(`[Overlay Packer] Wrote ${metaTsPath}`)
  } else if (process.env.D2_PACK_OUT_DIR || options?.outDir) {
    const sandboxMetaPath = join(targetRoot, 'src', 'render', 'overlays-meta.ts')
    mkdirSync(join(targetRoot, 'src', 'render'), { recursive: true })
    writeFileSync(sandboxMetaPath, metaTsContent, 'utf-8')
    const clientSandboxMetaPath = join(targetRoot, 'src', 'client', 'render', 'overlays-meta.ts')
    mkdirSync(join(targetRoot, 'src', 'client', 'render'), { recursive: true })
    writeFileSync(clientSandboxMetaPath, metaTsContent, 'utf-8')
    console.log(`[Overlay Packer] Wrote sandboxed ${sandboxMetaPath}`)
  }

  return metaRecord
}

// Execute standalone if called from CLI
if (process.argv[1]?.endsWith('pack-overlays.ts')) {
  bakeOverlays().catch((err: unknown) => {
    console.error('Bake overlays failed:', err)
    process.exit(1)
  })
}


