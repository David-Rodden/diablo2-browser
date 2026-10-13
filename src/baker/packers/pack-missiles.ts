/**
 * Offline Missile Asset & Data Baking Script.
 *
 * Extracts authentic Diablo II v1.13c missile DCC sprites from MPQ archives:
 * - Fire: Firebolt, Fireball, FireArrowExplode2
 * - Cold: Icebolt, IceBlast, GlacialSpike, IceArrowExplode, FreezeExplodeCenter
 * - Lightning: ChargedBolt
 * - Necromancer: teethMissile, teethexplode, BoneSpear, BoneSpirit, BoneSpiritExplode, poisonNova
 * - Paladin: HolyBoltMissile, blessedhammer
 * - Amazon: SafeArrow, FireArrow, IceArrow, Arrow, LightningJavelin
 *
 * Bakes them into indexed-color PNG atlases and JSON metadata under:
 * - public/missiles/
 * - samples/d2-packs/missiles/
 *
 * And generates typed metadata in src/render/missiles-meta.ts.
 * Enforces Zero Runtime MPQ/DLL Architectural Invariant.
 */

import { copyFileSync, linkSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MpqArchive } from '../../common/mpq/archive.ts'
import { fileSource } from '../io/file-source.ts'
import { decodeDcc } from '../../common/formats/dcc.ts'
import { decodePl2 } from '../../common/formats/pl2.ts'
import { encodeRgbaPng } from '../io/png.ts'
import type { SpriteFrame, SpriteSheet } from '../../common/formats/sprite.ts'

export interface MissileFrameMeta {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly anchorX: number
  readonly anchorY: number
}

export type MissileFrameTuple = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
]

export interface MissileMeta {
  readonly name: string
  readonly celFile: string
  readonly width: number
  readonly height: number
  readonly directions: number
  readonly framesPerDirection: number
  readonly animSpeed: number
  readonly trans?: number
  readonly blendMode?: string
  readonly groups: readonly (readonly MissileFrameTuple[])[]
}

const MISSILE_TARGETS = [
  // Fire spells & explosions
  { name: 'firebolt', celFile: 'Firebolt', animSpeed: 16, trans: 1 },
  { name: 'fireball', celFile: 'Fireball', animSpeed: 16, trans: 1 },
  { name: 'fireexplode', celFile: 'FireArrowExplode2', animSpeed: 16, trans: 1 },

  // Ice spells & explosions
  { name: 'icebolt', celFile: 'Icebolt', animSpeed: 16, trans: 1 },
  { name: 'iceblast', celFile: 'IceBlast', animSpeed: 16, trans: 1 },
  { name: 'glacialspike', celFile: 'GlacialSpike', animSpeed: 16, trans: 1 },
  { name: 'iceexplode', celFile: 'IceArrowExplode', animSpeed: 16, trans: 1 },
  { name: 'freezeexplode', celFile: 'FreezeExplodeCenter', animSpeed: 16, trans: 1 },
  { name: 'frozenorb', celFile: 'IceOrb', animSpeed: 16, trans: 1 },
  { name: 'frozenorbexplode', celFile: 'IceOrbExplode', animSpeed: 16, trans: 1 },
  { name: 'blizzard1', celFile: 'icestormfallvar01', animSpeed: 16, trans: 1 },
  { name: 'blizzard2', celFile: 'icestormfallvar02', animSpeed: 16, trans: 1 },
  { name: 'blizzard3', celFile: 'Blizzard', animSpeed: 16, trans: 1 },
  { name: 'blizzardexplode1', celFile: 'icestormimpactvar01', animSpeed: 16, trans: 1 },
  { name: 'blizzardexplode2', celFile: 'icestormimpactvar02', animSpeed: 16, trans: 1 },
  { name: 'icebreaksmall', celFile: 'IceBreakSmall', animSpeed: 16, trans: 0 },
  { name: 'icebreaksmallmelt', celFile: 'IceBreakSmallMelt', animSpeed: 16, trans: 0 },

  // Lightning
  { name: 'chargedbolt', celFile: 'ChargedBolt', animSpeed: 16, trans: 1 },

  // Necromancer
  { name: 'teeth', celFile: 'teethMissile', animSpeed: 16, trans: 1 },
  { name: 'teethexplode', celFile: 'teethexplode', animSpeed: 16, trans: 1 },
  { name: 'bonespear', celFile: 'BoneSpear', animSpeed: 16, trans: 1 }, // Missiles.txt #192 Trans=1 (Issue #993 item 9)
  { name: 'bonespirit', celFile: 'BoneSpirit', animSpeed: 16, trans: 1 },
  { name: 'bonespiritexplode', celFile: 'BoneSpiritExplode', animSpeed: 16, trans: 1 },
  { name: 'poisonnova', celFile: 'poisonNova', animSpeed: 16, trans: 1 },
  { name: 'corpseexplosion', celFile: 'CorpseExplodeGuts', animSpeed: 16, trans: 1 },
  { name: 'poisoncorpseexplosion', celFile: 'CorpseExplodeGutsPoison', animSpeed: 16, trans: 1 },
  { name: 'poisonexplosioncloud', celFile: 'PoisonSparks', animSpeed: 16, trans: 1 },
  { name: 'poisonpuff', celFile: 'PoisonSmokePuff', animSpeed: 16, trans: 1 },
  { name: 'cursecast', celFile: 'CurseCast', animSpeed: 16, trans: 1 },
  { name: 'curseall', celFile: 'CurseArea', animSpeed: 16, trans: 1 },
  { name: 'bonecast', celFile: 'BoneCast', animSpeed: 16, trans: 1 },
  { name: 'bonespeartrail', celFile: 'BoneSpearTrail', animSpeed: 16, trans: 1 },
  { name: 'revive', celFile: 'Revive', animSpeed: 16, trans: 1 },
  // Missiles.txt 1.13c #208..#211 CelFile (elements poison/cold/fire/lightning, all Trans=1).
  { name: 'necromage1', celFile: 'poisonNova', animSpeed: 16, trans: 1 },
  { name: 'necromage2', celFile: 'Icebolt', animSpeed: 16, trans: 1 },
  { name: 'necromage3', celFile: 'Firebolt', animSpeed: 16, trans: 1 },
  { name: 'necromage4', celFile: 'ChargedBolt', animSpeed: 16, trans: 1 },
  { name: 'bigblood1', celFile: 'BloodLarge01', animSpeed: 16, trans: 0 },
  { name: 'bigblood2', celFile: 'BloodLarge02', animSpeed: 16, trans: 0 },

  // Paladin
  { name: 'holybolt', celFile: 'HolyBoltMissile', animSpeed: 16, trans: 1 },
  { name: 'blessedhammer', celFile: 'blessedhammer', animSpeed: 16, trans: 1 },
  { name: 'fistoftheheavensbolt', celFile: 'HolyBoltMissile', animSpeed: 16, trans: 1 },
  { name: 'foa', celFile: 'FOAorbiter', animSpeed: 16, trans: 1 },
  { name: 'blessedhammerex', celFile: 'blessedhammer', animSpeed: 16, trans: 1 },
  { name: 'blood1', celFile: 'BloodSmall01', animSpeed: 16, trans: 1 },
  { name: 'blood2', celFile: 'BloodSmall01', animSpeed: 16, trans: 1 },
  { name: 'redeem', celFile: 'RedemptionGhost', animSpeed: 16, trans: 1 },

  // Amazon
  { name: 'magicarrow', celFile: 'SafeArrow', animSpeed: 16, trans: 1 },
  { name: 'firearrow', celFile: 'FireArrow', animSpeed: 16, trans: 1 },
  { name: 'icearrow', celFile: 'IceArrow', animSpeed: 16, trans: 1 },
  { name: 'arrow', celFile: 'Arrow', animSpeed: 16, trans: 0 },
  { name: 'bolt', celFile: 'XBowBolt', animSpeed: 16, trans: 0 },

  // Inherent throw skills (2/4): weapon-dependent missiles, Trans 0 (physical).
  // Plain 'javelin' is already served by the 'poisonjav' entry's Javelin celFile alias.
  { name: 'throwknife', celFile: 'MissileDagger', animSpeed: 16, trans: 0 },
  { name: 'throwaxe', celFile: 'MissileHandAxe', animSpeed: 16, trans: 0 },

  // Throwing potions (Weapons.txt tpot, Missiles.txt ids 44..49; Trans 0 physical)
  { name: 'oilpotion', celFile: 'mslops', animSpeed: 16, trans: 0 },
  { name: 'explosivepotion', celFile: 'mslopm', animSpeed: 16, trans: 0 },
  { name: 'fulminatingpotion', celFile: 'mslopl', animSpeed: 16, trans: 0 },
  { name: 'rancidgasepotion', celFile: 'mslgps', animSpeed: 16, trans: 0 },
  { name: 'chokinggaspoition', celFile: 'mslgpm', animSpeed: 16, trans: 0 },
  { name: 'stranglinggaspotion', celFile: 'mslgpl', animSpeed: 16, trans: 0 },

  // Amazon
  { name: 'lightningjavelin', celFile: 'LightningJavelin', animSpeed: 16, trans: 1 },
  { name: 'coldarrow', celFile: 'IceArrow', animSpeed: 16, trans: 1 },
  { name: 'explodingarrow', celFile: 'FireArrow', animSpeed: 16, trans: 1 },
  { name: 'explodingarrowexp', celFile: 'ExpArrowExplode', animSpeed: 16, trans: 1 },
  { name: 'icearrowexplode', celFile: 'IceArrowExplode', animSpeed: 16, trans: 1 },
  { name: 'freezingarrow', celFile: 'IceArrow', animSpeed: 16, trans: 1 },
  { name: 'guidedarrow', celFile: 'SafeArrow', animSpeed: 16, trans: 1 },
  { name: 'strafearrow', celFile: 'Arrow', animSpeed: 16, trans: 0 },
  { name: 'strafebolt', celFile: 'XBowBolt', animSpeed: 16, trans: 0 },
  { name: 'immolationarrow', celFile: 'FireArrow', animSpeed: 16, trans: 1 },
  { name: 'immolationarrowexp', celFile: 'ExpArrowExplode', animSpeed: 16, trans: 1 },
  { name: 'immolationfire', celFile: 'groundFireBig', animSpeed: 16, trans: 1 },
  { name: 'poisonjav', celFile: 'Javelin', animSpeed: 16, trans: 0 },
  { name: 'poisonjavcloud', celFile: 'PoisonSparks', animSpeed: 16, trans: 1 },
  { name: 'chargedstrikebolt', celFile: 'ChargedBolt', animSpeed: 16, trans: 1 },
  { name: 'plaguejavelin', celFile: 'Javelin', animSpeed: 16, trans: 0 },
  { name: 'plaguejavcloud', celFile: 'PoisonSparks', animSpeed: 16, trans: 1 },
  { name: 'lightningfury', celFile: 'LightningJavelin', animSpeed: 16, trans: 1 },
  { name: 'furylightning', celFile: 'LightningStrike', animSpeed: 16, trans: 1 },

  // Meteor (Skill 56)
  { name: 'meteor', celFile: 'Meteor', animSpeed: 16, trans: 1 },
  { name: 'meteortail', celFile: 'MeteorTail', animSpeed: 16, trans: 1 },
  { name: 'meteorcenter', celFile: 'MeteorTargetIndicator', animSpeed: 16, trans: 1 },
  { name: 'meteorexplode', celFile: 'ExpArrowExplode', animSpeed: 16, trans: 1 },
  { name: 'meteorfire', celFile: 'groundFireMedium', animSpeed: 16, trans: 1 },
  { name: 'firesmall', celFile: 'groundFireSmall', animSpeed: 16, trans: 1 },

  // 18 Sorceress Skills Missiles (v1.13c Parity)
  { name: 'nova', celFile: 'ElectricNova', animSpeed: 16, trans: 1 },
  { name: 'lightningstrike', celFile: 'LightningStrike', animSpeed: 16, trans: 1 },
  { name: 'thunderstorm1', celFile: 'LightningboltBig', animSpeed: 16, trans: 1 },
  { name: 'sparkle', celFile: 'Gleam', animSpeed: 16, trans: 1 },
  { name: 'freezingarrowexp2', celFile: 'FreezeExplodeEjecta', animSpeed: 16, trans: 1 },
  { name: 'firewall', celFile: 'groundFireBig', animSpeed: 16, trans: 1 },
  { name: 'infernoflame1', celFile: 'Flamethrower', animSpeed: 16, trans: 1 },
  { name: 'infernoflame2', celFile: 'Flamethrower2', animSpeed: 16, trans: 1 },
  { name: 'frostnova', celFile: 'FrostNova', animSpeed: 16, trans: 1 },

  // Barbarian
  { name: 'howl', celFile: 'BAYellShockWave01', animSpeed: 16, trans: 1 },
  { name: 'shout', celFile: 'BAYellShockWave01', animSpeed: 16, trans: 1 },
  { name: 'battlecry', celFile: 'BAYellShockWave01', animSpeed: 16, trans: 1 },
  { name: 'battleorders', celFile: 'BAYellShockWave01', animSpeed: 16, trans: 1 },
  { name: 'battlecommand', celFile: 'BAYellShockWave01', animSpeed: 16, trans: 1 },
  { name: 'warcry', celFile: 'WarcryShockwave', animSpeed: 16, trans: 1 },
  { name: 'grimwardsmallstart', celFile: 'GrimWardSmallStart', animSpeed: 16, trans: 0 },
  { name: 'grimwardsmall', celFile: 'GrimWardSmall', animSpeed: 16, trans: 0 },
  { name: 'grimwardsmallstop', celFile: 'GrimWardSmallStop', animSpeed: 16, trans: 0 },
  { name: 'grimwardmediumstart', celFile: 'GrimWardMediumStart', animSpeed: 16, trans: 0 },
  { name: 'grimwardmedium', celFile: 'GrimWardMedium', animSpeed: 16, trans: 0 },
  { name: 'grimwardmediumstop', celFile: 'GrimWardMediumStop', animSpeed: 16, trans: 0 },
  { name: 'grimwardlargestart', celFile: 'GrimWardLargeStart', animSpeed: 16, trans: 0 },
  { name: 'grimwardlarge', celFile: 'GrimWardLarge', animSpeed: 16, trans: 0 },
  { name: 'grimwardlargestop', celFile: 'GrimWardLargeStop', animSpeed: 16, trans: 0 },

  // Druid
  { name: 'moltenboulder', celFile: 'expansion/MoltenBoulderRoll', animSpeed: 16, trans: 0 },
  { name: 'moltenboulderemerge', celFile: 'expansion/MoltenBoulderEmerge', animSpeed: 16, trans: 0 },
  { name: 'firestormmaker', celFile: 'expansion/FirestormEmitter', animSpeed: 16, trans: 1 },
  { name: 'firestorm', celFile: 'expansion/FireSpikes', animSpeed: 16, trans: 1 },
  { name: 'firespikesground', celFile: 'expansion/FireSpikesGround', animSpeed: 16, trans: 1 },
  { name: 'arcticblast1', celFile: 'expansion/ArcticBlastIce', animSpeed: 16, trans: 1 },
  { name: 'arcticblast2', celFile: 'expansion/ArcticBlastIce_2', animSpeed: 16, trans: 1 },
  { name: 'twister', celFile: 'expansion/twister', animSpeed: 16, trans: 0 },
  { name: 'tornado', celFile: 'expansion/tornado', animSpeed: 16, trans: 0 },
  { name: 'volcanobase', celFile: 'Expansion/volcano_base', animSpeed: 16, trans: 0 },
  { name: 'volcanofire', celFile: 'Expansion/volcano_Fire', animSpeed: 16, trans: 1 },
  { name: 'volcanorock', celFile: 'expansion/volcano_rock', animSpeed: 16, trans: 0 },
  { name: 'shockwave', celFile: 'expansion/shockwave', animSpeed: 8, trans: 1 },
  { name: 'armageddonrock', celFile: 'expansion/armageddon_rock', animSpeed: 16, trans: 0 },
  { name: 'armageddontail', celFile: 'expansion/armageddon_fire', animSpeed: 16, trans: 1 },
  { name: 'hurricaneswoosh', celFile: 'expansion/hurricane_swoosh', animSpeed: 8, trans: 1 },
  { name: 'hurricanerock', celFile: 'expansion/hurricane_rocks', animSpeed: 16, trans: 0 },
  { name: 'hurricanetree', celFile: 'expansion/hurricane_tree', animSpeed: 16, trans: 0 },
  { name: 'vines', celFile: 'Expansion/vines', animSpeed: 16, trans: 0 },
  { name: 'vinesdeath', celFile: 'Expansion/Vines_Death', animSpeed: 16, trans: 0 },
  { name: 'eruptioncrack', celFile: 'expansion/EruptionCrack', animSpeed: 16, trans: 0 },
  { name: 'eruptionsmoke', celFile: 'expansion/EruptionSmoke', animSpeed: 16, trans: 1 },
  { name: 'rocklavaexplosion', celFile: 'Expansion/rock_lava_explosion', animSpeed: 16, trans: 1 },
  { name: 'rocklavapool', celFile: 'Expansion/rock_lava_pool', animSpeed: 16, trans: 1 },

  // Assassin Traps & Martial Arts
  { name: 'firetrauma', celFile: 'expansion/FireTraumaMissile', animSpeed: 16, trans: 1 },
  { name: 'firetraumaground', celFile: 'expansion/FireTraumaGround', animSpeed: 16, trans: 1 },
  { name: 'firetraumaexplode', celFile: 'expansion/FireTraumaXplosion', animSpeed: 16, trans: 1 },
  { name: 'shockfieldair', celFile: 'expansion/caltrops', animSpeed: 16, trans: 0 },
  { name: 'shockfieldground', celFile: 'Expansion/ShockField', animSpeed: 16, trans: 1 },
  { name: 'bladefury', celFile: 'Expansion/bladefury', animSpeed: 16, trans: 0 },
  { name: 'bladefuryb', celFile: 'Expansion/bladefury_B', animSpeed: 16, trans: 0 },
  { name: 'bladefuryc', celFile: 'Expansion/bladefury_C', animSpeed: 16, trans: 0 },
  { name: 'deathsentryexplode', celFile: 'Expansion/dethsentry02', animSpeed: 16, trans: 1 },
  { name: 'bladeshieldmissile', celFile: 'Expansion/blade_shield_missile', animSpeed: 16, trans: 1 },
  { name: 'throwingstar', celFile: 'expansion/ThrowingStarMissile', animSpeed: 16, trans: 0 },
  { name: 'mindblast', celFile: 'Expansion/Mindblast', animSpeed: 16, trans: 1 },

  // Quest FX Client Missiles (Issue #873)
  { name: 'denofevillight', celFile: 'LightBeams', animSpeed: 16, trans: 1 },
  // A2Q6 staff in orifice (Issue #915): Missiles.txt 338 horadricstaff / 340 horadriclight CelFile. 339
  // horadriclightning (LightningStrike) and 150 dust (FireSmoke) reuse atlases baked above / below.
  { name: 'horadricstaff', celFile: 'HoradricStaff', animSpeed: 16, trans: 1 },
  { name: 'horadriclight', celFile: 'HoradricLightBeamstreaks', animSpeed: 16, trans: 1 },

  // Monster & Boss Death FX Missiles (Issue #872 - 1.13c Ground Truth)
  { name: 'fireexplosion', celFile: 'Fsexplode', animSpeed: 16, trans: 1 },
  { name: 'icebreaklarge', celFile: 'IceBreakLarge', animSpeed: 16, trans: 0 },
  { name: 'icebreaklargemelt', celFile: 'IceBreakLargeMelt', animSpeed: 16, trans: 0 },
  { name: 'icebreaksmoke', celFile: 'IceBreakSmoke', animSpeed: 16, trans: 1 },
  { name: 'brdeathspirits', celFile: 'BRSpiritS1', animSpeed: 16, trans: 1 },
  { name: 'brspiritnu', celFile: 'BRSpiritNU', animSpeed: 16, trans: 1 },
  { name: 'brspiritdt', celFile: 'BRSpiritDT', animSpeed: 16, trans: 1 },
  { name: 'brsmokes1', celFile: 'BRSmokeS1', animSpeed: 16, trans: 1 },
  { name: 'brsmokenu', celFile: 'BRSmokeNU', animSpeed: 16, trans: 1 },
  { name: 'brsmokedt', celFile: 'BRSmokeDT', animSpeed: 16, trans: 1 },
  { name: 'andycolumnfire', celFile: 'AndarielFlameDeath', animSpeed: 16, trans: 1 },
  { name: 'andyfallingdebris1', celFile: 'CeilingChunkFall01', animSpeed: 16, trans: 0 },
  { name: 'andyfallingdebris2', celFile: 'CeilingChunkFall02', animSpeed: 16, trans: 0 },
  { name: 'andyfallingdebris3', celFile: 'CeilingChunkFall03', animSpeed: 16, trans: 0 },
  { name: 'andydebrisexplosion1', celFile: 'CeilingChunkVanish01', animSpeed: 16, trans: 0 },
  { name: 'andydebrisexplosion2', celFile: 'CeilingChunkVanish02', animSpeed: 16, trans: 0 },
  { name: 'andydebrisexplosion3', celFile: 'CeilingChunkRemain01', animSpeed: 16, trans: 0 },
  { name: 'andydebrisexplosion4', celFile: 'CeilingChunkRemain02', animSpeed: 16, trans: 0 },
  { name: 'andydebrisexplosion5', celFile: 'CeilingChunkRemain03', animSpeed: 16, trans: 0 },
  { name: 'radamenthandofgod', celFile: 'HandOfGod', animSpeed: 24, trans: 1 },
  { name: 'queendeathglob', celFile: 'QueenDeathGuts', animSpeed: 12, trans: 0 },
  { name: 'queendeathsplat1', celFile: 'QueenDeathPuddle', animSpeed: 16, trans: 0 },
  { name: 'queendeathsplat2', celFile: 'QueenDeathPuddle2', animSpeed: 16, trans: 0 },
  { name: 'healingvortex', celFile: 'ExplosionSparkSmall', animSpeed: 16, trans: 1 },
  { name: 'mephistoholebirth', celFile: 'smithholebirth', animSpeed: 16, trans: 0 },
  { name: 'mephistoholeneutral', celFile: 'smithholeneutral', animSpeed: 16, trans: 0 },
  { name: 'mephistoholedeath', celFile: 'smithholedeath', animSpeed: 16, trans: 0 },
  { name: 'mephistoholedead', celFile: 'smithholedead', animSpeed: 16, trans: 0 },
  { name: 'durieldeathrock', celFile: 'Rock_large', animSpeed: 16, trans: 0 },
  { name: 'durieldeathdebris', celFile: 'Rock_small', animSpeed: 16, trans: 0 },
  { name: 'durieldeathsmoke', celFile: 'FireSmoke', animSpeed: 16, trans: 1 },
  { name: 'orbmist', celFile: 'mist_Fade_Orb_Loop', animSpeed: 16, trans: 1 },
  { name: 'orbmistfade', celFile: 'mist_Fade_Orb', animSpeed: 16, trans: 1 },
  { name: 'izualmistloop', celFile: 'IzualDeathClouds', animSpeed: 8, trans: 1 },
  { name: 'izuallightning', celFile: 'IzualDeathParticles', animSpeed: 16, trans: 1 },
  { name: 'dopplezonexplode', celFile: 'DopplezonExplode', animSpeed: 16, trans: 1 },
  { name: 'catapultspikeexplosion', celFile: 'expansion/FireSpikeExplode', animSpeed: 16, trans: 0 },
  { name: 'towerdeath', celFile: 'expansion/TowerDebris', animSpeed: 16, trans: 0 },
  { name: 'ancientdeathcloud', celFile: 'expansion/AncientDeathMissile', animSpeed: 8, trans: 1 },
  { name: 'overseermissile', celFile: 'expansion/overseer_missile', animSpeed: 16, trans: 1 },
  { name: 'nihlithak1', celFile: 'expansion/Nihlathak A', animSpeed: 8, trans: 0 },
  { name: 'nihlithak2', celFile: 'expansion/Nihlathak B', animSpeed: 8, trans: 0 },
  { name: 'nihlithak3', celFile: 'expansion/Nihlathak C', animSpeed: 8, trans: 0 },
  { name: 'nehlithakswoosh', celFile: 'expansion/nehlthak_Swoosh', animSpeed: 8, trans: 1 },
  { name: 'nehlithakdebris1', celFile: 'expansion/Skeleton_pieces_A', animSpeed: 16, trans: 0 },
  { name: 'nehlithakdebris2', celFile: 'expansion/Skeleton_pieces_B', animSpeed: 16, trans: 0 },
  { name: 'nehlithakdebris3', celFile: 'expansion/Skeleton_pieces_C', animSpeed: 16, trans: 0 },
  { name: 'nehlithakdebris4', celFile: 'expansion/Skeleton_pieces_D', animSpeed: 16, trans: 0 },
  { name: 'baalteleport', celFile: 'Expansion/Baalsummonoverlay', animSpeed: 24, trans: 1 },
  { name: 'baalclonedeath', celFile: 'Expansion/Baalteleport', animSpeed: 24, trans: 1 },
  { name: 'nehlithakhole', celFile: 'expansion/nehlthak_Hole', animSpeed: 16, trans: 0 },
  { name: 'nehlithakholelight', celFile: 'expansion/nehlthak_Hole_light', animSpeed: 16, trans: 1 },
  { name: 'nehlithakglow2', celFile: 'expansion/NehlithakGlow', animSpeed: 16, trans: 1 },
  { name: 'nehlithakbonechips', celFile: 'expansion/BonePieces', animSpeed: 16, trans: 0 },
  { name: 'baalfxspirit1', celFile: 'expansion/baaldeathghostie02', animSpeed: 6, trans: 1 },
  { name: 'baalfxspirit2', celFile: 'expansion/baaldeathghostie01', animSpeed: 6, trans: 1 },
  { name: 'baalfxbaalheadappear', celFile: 'expansion/baaldeathswirl', animSpeed: 16, trans: 1 },
  { name: 'baalfxbaalhead1', celFile: 'expansion/baaldeathhead01', animSpeed: 12, trans: 1 },
  { name: 'baalfxbaalhead2', celFile: 'expansion/baaldeathhead02', animSpeed: 12, trans: 1 },
  { name: 'baalfxbaalhead3', celFile: 'expansion/baaldeathhead03', animSpeed: 12, trans: 1 },
  { name: 'baalfxtyrealdebris1', celFile: 'expansion/BCeilingChunkFall1', animSpeed: 16, trans: 0 },
  { name: 'baalfxtyrealdebris2', celFile: 'expansion/BCeilingChunkFall2', animSpeed: 16, trans: 0 },
  { name: 'baalfxtyrealdebris3', celFile: 'expansion/BCeilingChunkFall3', animSpeed: 16, trans: 0 },
  { name: 'baalfxtyrealdebrisbreak', celFile: 'expansion/BCeilingChunkBreak', animSpeed: 12, trans: 0 },
] as const

const PAGE_SIZE = 4096

/**
 * Shelf-pack all frames of a missile SpriteSheet into a 32-bit RGBA PNG buffer.
 * Enforces Diablo II 1.13c Trans=1 transparency:
 * - Pure black / background antialiasing fringe pixels (max(r,g,b) <= 4 or idx 172) are strictly transparent (alpha=0).
 * - Semi-dark edge pixels ramp smoothly so no black borders or dark smudge boxes appear over the ground.
 * - Core pixels remain solid (alpha=255) for vibrant spell rendering.
 */
export function packMissileSheetToRgbaPng(
  sheet: SpriteSheet,
  palette: Uint8Array,
  trans: number = 1,
): {
  png: Uint8Array
  width: number
  height: number
  groups: [number, number, number, number, number, number][][]
} {
  const frames = sheet.groups.flatMap(g => g.frames)
  const widest = Math.max(1, ...frames.map(f => f.width))
  const area = frames.reduce((sum, f) => sum + (f.width + 1) * (f.height + 1), 0)
  let pageWidth = Math.min(PAGE_SIZE, Math.max(widest + 2, 512))
  while (pageWidth < PAGE_SIZE && pageWidth * pageWidth < area * 1.15) {
    pageWidth *= 2
  }
  pageWidth = Math.min(PAGE_SIZE, pageWidth)

  let cursorX = 0
  let shelfY = 0
  let shelfHeight = 0
  const placements: { x: number; y: number; width: number; height: number }[] = []

  for (const frame of frames) {
    const w = Math.max(1, Math.min(frame.width, pageWidth))
    const h = Math.max(1, Math.min(frame.height, PAGE_SIZE))
    if (cursorX + w > pageWidth) {
      shelfY += shelfHeight + 1
      shelfHeight = 0
      cursorX = 0
    }
    placements.push({ x: cursorX, y: shelfY, width: w, height: h })
    cursorX += w + 1
    shelfHeight = Math.max(shelfHeight, h)
  }

  const pageHeight = Math.max(1, shelfY + shelfHeight)
  const rgba = new Uint8Array(pageWidth * pageHeight * 4)

  let idx = 0
  for (const frame of frames) {
    const place = placements[idx]!
    idx += 1
    for (let row = 0; row < place.height; row += 1) {
      const fromRow = row * frame.width
      const toRow = (place.y + row) * pageWidth + place.x
      for (let col = 0; col < place.width; col += 1) {
        const srcAt = fromRow + col
        const dst = (toRow + col) * 4
        if (frame.mask[srcAt] === 0) {
          rgba[dst] = 0
          rgba[dst + 1] = 0
          rgba[dst + 2] = 0
          rgba[dst + 3] = 0
        } else {
          const val = frame.indices[srcAt]!
          if (val === 0) {
            rgba[dst] = 0
            rgba[dst + 1] = 0
            rgba[dst + 2] = 0
            rgba[dst + 3] = 0
          } else {
            const r = palette[val * 3]!
            const g = palette[val * 3 + 1]!
            const b = palette[val * 3 + 2]!
            if (trans === 1 || trans === 3) {
              const m = Math.max(r, g, b)
              if (m === 0 || val === 172) {
                rgba[dst] = 0
                rgba[dst + 1] = 0
                rgba[dst + 2] = 0
                rgba[dst + 3] = 0
              } else {
                rgba[dst] = r
                rgba[dst + 1] = g
                rgba[dst + 2] = b
                rgba[dst + 3] = 255
              }
            } else {
              rgba[dst] = r
              rgba[dst + 1] = g
              rgba[dst + 2] = b
              rgba[dst + 3] = 255
            }
          }
        }
      }
    }
  }

  const groups: [number, number, number, number, number, number][][] = []
  let consumed = 0
  for (const group of sheet.groups) {
    const gList: [number, number, number, number, number, number][] = []
    for (let i = 0; i < group.frames.length; i += 1) {
      const p = placements[consumed]!
      const f = group.frames[i]!
      consumed += 1
      gList.push([p.x, p.y, p.width, p.height, f.anchorX ?? 0, f.anchorY ?? 0])
    }
    groups.push(gList)
  }

  const png = encodeRgbaPng({ width: pageWidth, height: pageHeight, pixels: rgba })
  return { png, width: pageWidth, height: pageHeight, groups }
}

function formatMetaTs(meta: MissileMeta): string {
  const groupsStr = meta.groups
    .map(group => `    [${group.map(f => `[${f.join(', ')}]`).join(', ')}]`)
    .join(',\n')
  const trans = meta.trans ?? 1
  const blendMode = meta.blendMode ?? (trans === 0 ? 'opaque' : 'lighter')
  return `{\n  name: ${JSON.stringify(meta.name)}, celFile: ${JSON.stringify(meta.celFile)}, width: ${meta.width}, height: ${meta.height}, directions: ${meta.directions}, framesPerDirection: ${meta.framesPerDirection}, animSpeed: ${meta.animSpeed}, trans: ${trans}, blendMode: ${JSON.stringify(blendMode)},\n  groups: [\n${groupsStr}\n  ],\n}`
}

export async function bakeMissiles(projectRoot: string = process.cwd()): Promise<Record<string, MissileMeta>> {
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

  const publicOutDir = join(projectRoot, 'public', 'missiles')
  mkdirSync(publicOutDir, { recursive: true })

  const metaRecord: Record<string, MissileMeta> = {}
  const pngByName = new Map<string, Uint8Array>()

  const linkOrWritePng = (srcPath: string, destPath: string, pngBytes?: Uint8Array): void => {
    if (srcPath === destPath) return
    if (srcPath.toLowerCase() === destPath.toLowerCase()) {
      if (pngBytes !== undefined) writeFileSync(destPath, pngBytes)
      else copyFileSync(srcPath, destPath)
      return
    }
    rmSync(destPath, { force: true })
    try {
      linkSync(srcPath, destPath)
    } catch {
      if (pngBytes !== undefined) {
        writeFileSync(destPath, pngBytes)
      } else {
        copyFileSync(srcPath, destPath)
      }
    }
  }

  for (const target of MISSILE_TARGETS) {
    const raw = await readMpqFile(`data/global/missiles/${target.celFile}.dcc`)
    if (!raw) throw new Error(`Missile DCC not found: data/global/missiles/${target.celFile}.dcc`)

    const dcc = decodeDcc(raw)
    const groups = dcc.directions.map(dir => ({
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

    const sheet: SpriteSheet = { groups, width: null }
    const trans: number = 'trans' in target ? (target as { trans: number }).trans : 1
    const blendMode = trans === 0 ? 'opaque' : 'lighter'
    const packed = packMissileSheetToRgbaPng(sheet, pl2.rgb, trans)

    const meta: MissileMeta = {
      name: target.name,
      celFile: target.celFile,
      width: packed.width,
      height: packed.height,
      directions: dcc.directions.length,
      framesPerDirection: dcc.directions[0]?.frames.length ?? 0,
      animSpeed: target.animSpeed,
      trans,
      blendMode,
      groups: packed.groups,
    }

    const primaryName = target.name.toLowerCase()
    metaRecord[target.name] = meta
    metaRecord[primaryName] = meta
    pngByName.set(target.name, packed.png)
    pngByName.set(primaryName, packed.png)

    // Write PNG and JSON to public/missiles/ (strictly lowercase)
    const jsonStr = JSON.stringify(meta, null, 2)
    const primaryPngPath = join(publicOutDir, `${primaryName}.png`)
    rmSync(primaryPngPath, { force: true })
    writeFileSync(primaryPngPath, packed.png)
    writeFileSync(join(publicOutDir, `${primaryName}.json`), jsonStr, 'utf-8')

    const baseCel = target.celFile.split(/[/\\]/).pop()!.toLowerCase()
    if (!metaRecord[baseCel]) {
      metaRecord[baseCel] = meta
      if (baseCel !== primaryName) {
        pngByName.set(baseCel, packed.png)
        linkOrWritePng(primaryPngPath, join(publicOutDir, `${baseCel}.png`), packed.png)
        writeFileSync(join(publicOutDir, `${baseCel}.json`), jsonStr, 'utf-8')
      }
    }

    console.log(`[Missile Packer] Baked ${target.name} (${target.celFile}.dcc): ${packed.width}x${packed.height}, ${packed.png.byteLength} bytes PNG`)
  }

  // Aliases for missiles
  const copyAlias = (aliasNameRaw: string, sourceNameRaw: string) => {
    const aliasName = aliasNameRaw.toLowerCase()
    const sourceName = sourceNameRaw.toLowerCase()
    const srcMeta = metaRecord[sourceName] ?? metaRecord[sourceNameRaw]
    if (!srcMeta) return
    const aliasMeta: MissileMeta = { ...srcMeta, name: aliasName }
    metaRecord[aliasName] = aliasMeta
    metaRecord[aliasNameRaw] = aliasMeta
    if (!aliasName.includes('/') && !aliasName.includes('\\')) {
      const jsonStr = JSON.stringify(aliasMeta, null, 2)
      writeFileSync(join(publicOutDir, `${aliasName}.json`), jsonStr, 'utf-8')
      const srcPngPath = join(publicOutDir, `${sourceName}.png`)
      const srcPngBytes = pngByName.get(sourceName) ?? pngByName.get(sourceNameRaw)
      if (srcPngBytes !== undefined) {
        pngByName.set(aliasName, srcPngBytes)
        pngByName.set(aliasNameRaw, srcPngBytes)
      }
      linkOrWritePng(srcPngPath, join(publicOutDir, `${aliasName}.png`), srcPngBytes)
    }
    console.log(`[Missile Packer] Aliased ${aliasName} -> ${sourceName}`)
  }
  copyAlias('blizzard4', 'blizzard3')
  copyAlias('blizzardexplode3', 'blizzardexplode2')
  copyAlias('blizzardcenter', 'blizzard1')
  copyAlias('meteortargetindicator', 'meteorcenter')
  copyAlias('firemedium', 'meteorfire')
  copyAlias('hydra', 'firebolt')
  copyAlias('hydrafire', 'firebolt')
  copyAlias('hydracenter', 'firebolt')

  // 18 Sorceress Skills Missiles aliases
  copyAlias('electricnova', 'nova')
  copyAlias('chainlightning', 'lightningstrike')
  copyAlias('lightninghit', 'lightningstrike')
  copyAlias('lightning', 'lightningstrike')
  copyAlias('lightningbolt', 'lightningstrike')
  copyAlias('thunderstorm', 'thunderstorm1')
  copyAlias('lightningboltbig', 'thunderstorm1')
  copyAlias('cairn stones bolt', 'thunderstorm1')
  copyAlias('gleam', 'sparkle')
  copyAlias('freezeexplodeejecta', 'freezingarrowexp2')
  copyAlias('glacialspikeejecta', 'freezingarrowexp2')
  copyAlias('freezingarrowexp3', 'freezingarrowexp2')
  copyAlias('iceexplode1', 'iceexplode')
  copyAlias('iceexplode2', 'iceexplode')
  copyAlias('blaze', 'firewall')
  copyAlias('firewallmaker', 'firewall')
  copyAlias('firewall1', 'firewall')
  copyAlias('firewall2', 'firewall')
  copyAlias('firewall3', 'firewall')
  copyAlias('firewall4', 'firewall')
  copyAlias('firewall5', 'firewall')
  copyAlias('groundfirebig', 'firewall')
  copyAlias('flamethrower', 'infernoflame1')
  copyAlias('flamethrower2', 'infernoflame2')
  copyAlias('inferno', 'infernoflame1')
  copyAlias('coldunique', 'frostnova')
  copyAlias('mephfrostnova', 'frostnova')
  copyAlias('chillingarmorbolt', 'icebolt')
  copyAlias('freezingarrowexp1', 'freezeexplode')
  copyAlias('FreezingArrowExp1', 'freezeexplode')
  copyAlias('StaticField', 'lightningstrike')
  copyAlias('staticfield', 'lightningstrike')

  // Amazon aliases
  copyAlias('multishotarrow', 'arrow')
  copyAlias('multishotbolt', 'bolt')
  copyAlias('criticalarrow', 'arrow')
  copyAlias('dodge', 'arrow')
  copyAlias('avoid', 'arrow')
  copyAlias('evade', 'arrow')
  copyAlias('penetrate', 'arrow')
  copyAlias('decoy', 'magicarrow')
  copyAlias('valkyrie', 'magicarrow')
  copyAlias('PowerStrike', 'chargedstrikebolt')
  copyAlias('powerstrike', 'chargedstrikebolt')
  copyAlias('Impale', 'arrow')
  copyAlias('impale', 'arrow')
  copyAlias('Fend', 'arrow')
  copyAlias('fend', 'arrow')
  copyAlias('ChargedStrike', 'chargedstrikebolt')
  copyAlias('chargedstrike', 'chargedstrikebolt')

  // Necromancer aliases
  copyAlias('revivesmall', 'revive')
  copyAlias('revivemedium', 'revive')
  copyAlias('revivelarge', 'revive')
  copyAlias('bonespearexplode', 'teethexplode')
  copyAlias('curseamplifydamage', 'curseall')
  copyAlias('cursedimvision', 'curseall')
  copyAlias('curseweaken', 'curseall')
  copyAlias('curseironmaiden', 'curseall')
  copyAlias('curseterror', 'curseall')
  copyAlias('curseconfuse', 'curseall')
  copyAlias('cursereversevampire', 'curseall')
  copyAlias('curseattract', 'curseall')
  copyAlias('cursedecrepify', 'curseall')
  copyAlias('curselowerresist', 'curseall')
  copyAlias('amplifydamage', 'cursecast')
  copyAlias('dimvision', 'cursecast')
  copyAlias('weaken', 'cursecast')
  copyAlias('ironmaiden', 'cursecast')
  copyAlias('terror', 'cursecast')
  copyAlias('confuse', 'cursecast')
  copyAlias('lifetap', 'cursecast')
  copyAlias('attract', 'cursecast')
  copyAlias('decrepify', 'cursecast')
  copyAlias('lowerresist', 'cursecast')
  copyAlias('poisonexplosion', 'poisonexplosioncloud')
  copyAlias('bonewall', 'bonecast')
  copyAlias('bonewallmaker', 'bonecast')
  copyAlias('boneprison', 'bonecast')
  copyAlias('skeleton', 'revive')
  copyAlias('skeletonmage', 'revive')
  copyAlias('claygolem', 'revive')
  copyAlias('bloodgolem', 'revive')
  copyAlias('irongolem', 'revive')
  copyAlias('firegolem', 'revive')

  // Paladin aliases
  copyAlias('smite', 'holybolt')
  copyAlias('zeal', 'holybolt')
  copyAlias('vengeance', 'holybolt')
  copyAlias('charge', 'holybolt')
  copyAlias('conversion', 'holybolt')
  copyAlias('sacrifice', 'holybolt')
  copyAlias('holyshield', 'holybolt')
  copyAlias('fist_of_the_heavens', 'foa')
  copyAlias('fistoftheheavens', 'foa')
  copyAlias('fistoftheheavensdelay', 'foa')

  // Barbarian aliases
  copyAlias('findpotion', 'grimwardsmall')
  copyAlias('finditem', 'grimwardsmall')
  copyAlias('grimward', 'grimwardsmall')
  copyAlias('grimwardscare', 'grimwardsmall')
  copyAlias('taunt', 'howl')
  copyAlias('bash', 'arrow')
  copyAlias('leap', 'arrow')
  copyAlias('doublethrow', 'arrow')
  copyAlias('doubleswing', 'arrow')
  copyAlias('leapattack', 'arrow')
  copyAlias('stun', 'arrow')
  copyAlias('concentrate', 'arrow')
  copyAlias('frenzy', 'arrow')
  copyAlias('whirlwind', 'arrow')
  copyAlias('berserk', 'arrow')

  // Druid aliases
  copyAlias('moltenboulderroll', 'moltenboulder')
  copyAlias('moltenboulderemergerock', 'rocklavaexplosion')
  copyAlias('moltenboulderexplode', 'rocklavaexplosion')
  copyAlias('moltenboulderfirepath', 'rocklavapool')
  copyAlias('moltenboulderflyingrocks', 'volcanorock')
  copyAlias('arcticblast', 'arcticblast1')
  copyAlias('fissure', 'eruptioncrack')
  copyAlias('eruptioncenter', 'eruptioncrack')
  copyAlias('eruption crack 1', 'eruptioncrack')
  copyAlias('eruption crack 2', 'eruptioncrack')
  copyAlias('eruption smoke 1', 'eruptionsmoke')
  copyAlias('eruption smoke 2', 'eruptionsmoke')
  copyAlias('volcano', 'volcanobase')
  copyAlias('volcano_fire', 'volcanofire')
  copyAlias('volcano_rock', 'volcanorock')
  copyAlias('volcanodebris2', 'volcanofire')
  copyAlias('volcanosmallfire', 'volcanofire')
  copyAlias('armageddon', 'armageddonrock')
  copyAlias('armageddonrocks', 'armageddonrock')
  copyAlias('armageddonexplode', 'volcanofire')
  copyAlias('armageddonfire', 'volcanofire')
  copyAlias('hurricane', 'hurricaneswoosh')
  copyAlias('hurricanemaker', 'hurricaneswoosh')
  copyAlias('plaguevines', 'vines')
  copyAlias('plaguevinemaker', 'vines')
  copyAlias('carrionvine', 'vines')
  copyAlias('carrionvinemaker', 'vines')
  copyAlias('solarscreecher', 'vines')
  copyAlias('solarscreechermaker', 'vines')

  // Assassin aliases
  copyAlias('tigerstrike', 'fireexplode')
  copyAlias('dragonclaw', 'fireexplode')
  copyAlias('ClawsOfThunderBolt', 'chargedstrikebolt')
  copyAlias('clawsofthunderbolt', 'chargedstrikebolt')
  copyAlias('ClawsOfThunderNova', 'nova')
  copyAlias('clawsofthundernova', 'nova')
  copyAlias('BladesOfIceExplode', 'iceexplode')
  copyAlias('bladesoficeexplode', 'iceexplode')
  copyAlias('BladesOfIceCubes', 'icebreaksmall')
  copyAlias('bladesoficecubes', 'icebreaksmall')
  copyAlias('BladesOfIceCubesMelt', 'icebreaksmallmelt')
  copyAlias('bladesoficecubesmelt', 'icebreaksmallmelt')
  copyAlias('RoyalStrikeMeteor', 'meteor')
  copyAlias('royalstrikemeteor', 'meteor')
  copyAlias('RoyalStrikeMeteorCenter', 'meteorcenter')
  copyAlias('royalstrikemeteorcenter', 'meteorcenter')
  copyAlias('RoyalStrikeMeteorTail', 'meteortail')
  copyAlias('royalstrikemeteortail', 'meteortail')
  copyAlias('RoyalStrikeMeteorExplode', 'meteorexplode')
  copyAlias('royalstrikemeteorexplode', 'meteorexplode')
  copyAlias('RoyalStrikeMeteorFire', 'meteorfire')
  copyAlias('royalstrikemeteorfire', 'meteorfire')
  copyAlias('RoyalStrikeChainLightning', 'lightningstrike')
  copyAlias('royalstrikechainlightning', 'lightningstrike')
  copyAlias('RoyalStrikeChaosIce', 'icebolt')
  copyAlias('royalstrikechaosice', 'icebolt')
  copyAlias('fistsoffire', 'fireexplode')
  copyAlias('FistsOfFireExplode', 'fireexplode')
  copyAlias('fistsoffireexplode', 'fireexplode')
  copyAlias('FistsOfFireFirewall', 'firewall')
  copyAlias('fistsoffirefirewall', 'firewall')
  copyAlias('clawsofthunder', 'chargedstrikebolt')
  copyAlias('bladesofice', 'iceexplode')
  copyAlias('phoenixstrike', 'meteor')
  copyAlias('cobrastrike', 'poisonpuff')
  copyAlias('dragontail', 'fireexplode')
  copyAlias('DragonTailMissile', 'fireexplode')
  copyAlias('dragontailmissile', 'fireexplode')
  copyAlias('dragonflight', 'fireexplode')
  copyAlias('psychichammer', 'mindblast')
  copyAlias('lightningsentry', 'lightningstrike')
  copyAlias('chargedboltsentry', 'chargedbolt')
  copyAlias('chargeboltsentry', 'chargedbolt')
  copyAlias('sentrylightning', 'lightningstrike')
  copyAlias('sentrychargedbolt', 'chargedbolt')
  copyAlias('wakeoffire', 'firesmall')
  copyAlias('wakeofdestructionmaker', 'firesmall')
  copyAlias('wakeofinferno', 'infernoflame1')
  copyAlias('infernosentry1', 'infernoflame1')
  copyAlias('infernosentry2', 'infernoflame2')
  copyAlias('deathsentry', 'deathsentryexplode')
  copyAlias('corpseexplosion_ds', 'corpseexplosion')
  copyAlias('lightning_ds', 'lightningstrike')
  copyAlias('bladesentinel', 'bladefury')
  copyAlias('shockweb', 'shockfieldground')
  copyAlias('blade_shield_attachment', 'bladeshieldmissile')

  // Monster & Boss Death FX aliases (Issue #872)
  copyAlias('monstercorpseexplode', 'corpseexplosion')
  copyAlias('suicidecorpseexplode', 'corpseexplosion')
  copyAlias('suicidefireexplode', 'fireexplosion')
  copyAlias('suicideiceexplode', 'freezeexplode')
  copyAlias('lightunique', 'chargedbolt')
  copyAlias('buglightning', 'chargedbolt')
  copyAlias('corpsepoisoncloud', 'poisonpuff')
  copyAlias('queenpoisoncloud', 'poisonpuff')
  copyAlias('brdeathlightningbolt', 'lightningstrike')
  copyAlias('brdeathlightninghit', 'lightningstrike')
  copyAlias('mephistofirewallmaker', 'firewall')
  copyAlias('mephistofirewall', 'firewall')
  copyAlias('mephistoexplosionbig', 'meteorexplode')
  copyAlias('mephistoexplosionsmall', 'fireexplode')
  copyAlias('andyfirewallmaker', 'firewall')
  copyAlias('andyfirewall', 'firewall')
  copyAlias('andycolumnfirebase', 'meteorfire')
  copyAlias('radamentholybolt', 'holybolt')
  copyAlias('orbfire', 'meteorfire')
  copyAlias('izual mist loop', 'izualmistloop')
  copyAlias('izual mist fade', 'orbmistfade')
  copyAlias('izual lightning', 'izuallightning')
  copyAlias('izual lightning trail', 'lightningstrike')
  copyAlias('catapult spike explosion', 'catapultspikeexplosion')
  copyAlias('tower death', 'towerdeath')
  copyAlias('ancient death cloud', 'ancientdeathcloud')
  copyAlias('baalfx spirit 1', 'baalfxspirit1')
  copyAlias('baalfx spirit 2', 'baalfxspirit2')
  copyAlias('baalfx baal head appear', 'baalfxbaalheadappear')
  copyAlias('baalfx baal head 1', 'baalfxbaalhead1')
  copyAlias('baalfx baal head 2', 'baalfxbaalhead2')
  copyAlias('baalfx baal head 3', 'baalfxbaalhead3')
  copyAlias('baalfx tyreal debris 1', 'baalfxtyrealdebris1')
  copyAlias('baalfx tyreal debris 2', 'baalfxtyrealdebris2')
  copyAlias('baalfx tyreal debris 3', 'baalfxtyrealdebris3')
  copyAlias('baalfx tyreal debris break', 'baalfxtyrealdebrisbreak')

  // Generate src/render/missiles-meta.ts
  const EXPORTED_MISSILE_META_CONSTS = new Set<string>([
    'FIREBOLT_META',
    'ICEBOLT_META',
    'ICEBLAST_META',
    'GLACIALSPIKE_META',
    'FREEZEEXPLODE_META',
    'BLIZZARD1_META',
    'BLIZZARD2_META',
    'BLIZZARD3_META',
    'BLIZZARDEXPLODE1_META',
    'BLIZZARDEXPLODE2_META',
    'CHARGEDBOLT_META',
    'THROWKNIFE_META',
    'THROWAXE_META',
    'METEOR_META',
    'METEORTAIL_META',
    'METEORCENTER_META',
    'METEOREXPLODE_META',
    'METEORFIRE_META',
    'LIGHTNINGSTRIKE_META',
    'THUNDERSTORM1_META',
    'FIREWALL_META',
    'INFERNOFLAME1_META',
    'INFERNOFLAME2_META',
    'FROSTNOVA_META',
    'BLIZZARD4_META',
    'BLIZZARDEXPLODE3_META',
    'HYDRA_META',
    'HYDRAFIRE_META',
    'ELECTRICNOVA_META',
    'CHAINLIGHTNING_META',
    'GLACIALSPIKEEJECTA_META',
    'BLAZE_META',
    'GROUNDFIREBIG_META',
  ])

  const metaExports = MISSILE_TARGETS.map(t => {
    const constName = `${t.name.toUpperCase()}_META`
    const prefix = EXPORTED_MISSILE_META_CONSTS.has(constName) ? 'export const' : 'const'
    return `${prefix} ${constName}: MissileMeta = ${formatMetaTs(metaRecord[t.name]!)}`
  }).join('\n')

  const mapEntries = MISSILE_TARGETS.map(t => {
    return `  '${t.name}': ${t.name.toUpperCase()}_META,`
  }).join('\n')

  const metaTsContent = `/**
 * Authentic Diablo II v1.13c Missile Atlas Metadata.
 * Auto-generated by scripts/pack-missiles.ts.
 * Enforces Zero Runtime MPQ/DLL Architectural Invariant.
 */

export interface MissileFrameMeta {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly anchorX: number
  readonly anchorY: number
}

export type MissileFrameTuple = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
]

export interface MissileMeta {
  readonly name: string
  readonly celFile: string
  readonly width: number
  readonly height: number
  readonly directions: number
  readonly framesPerDirection: number
  readonly animSpeed: number
  readonly trans?: number
  readonly blendMode?: string
  readonly groups: readonly (readonly MissileFrameTuple[])[]
}

import { dir64ToDcc } from '../../common/units/character.ts'
import { dir64FromPoints } from '../../common/units/direction.ts'

/**
 * Calculate DCC direction index for a missile based on 2D velocity vector.
 *
 * In Diablo II's 64-direction space:
 * - South (0, +y) is dir 0
 * - West (-x, 0) is dir 16
 * - North (0, -y) is dir 32
 * - East (+x, 0) is dir 48
 */
export function velocityToDccDirection(vx: number, vy: number, directions = 16): number {
  if (directions <= 1) return 0
  if (vx === 0 && vy === 0) return 0
  const angle = Math.atan2(vy, vx) // -PI to PI
  // Map angle so that South (PI/2) is 0, turning clockwise
  const fraction = (angle - Math.PI / 2) / (2 * Math.PI)
  const dir64 = Math.round((((fraction % 1) + 1) % 1) * 64) % 64
  return dir64ToDcc(dir64, directions)
}

/**
 * Calculate DCC direction index from start to target coordinates using
 * Diablo II 1.13c integer path direction calculation (0x6FD5CF40).
 */
export function pointsToDccDirection(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  directions = 16,
  fallback = 0,
): number {
  if (directions <= 1) return 0
  const dir64 = dir64FromPoints(startX, startY, targetX, targetY, fallback)
  return dir64ToDcc(dir64, directions)
}

${metaExports}

export const BLIZZARD4_META: MissileMeta = { ...BLIZZARD3_META, name: 'blizzard4' }
export const BLIZZARDEXPLODE3_META: MissileMeta = { ...BLIZZARDEXPLODE2_META, name: 'blizzardexplode3' }
export const HYDRA_META: MissileMeta = { ...FIREBOLT_META, name: 'hydra' }
export const HYDRAFIRE_META: MissileMeta = { ...FIREBOLT_META, name: 'hydrafire' }
const METEORTARGETINDICATOR_META: MissileMeta = { ...METEORCENTER_META, name: 'meteortargetindicator' }
const FIREMEDIUM_META: MissileMeta = { ...METEORFIRE_META, name: 'firemedium' }
export const ELECTRICNOVA_META: MissileMeta = { ...NOVA_META, name: 'electricnova' }
export const CHAINLIGHTNING_META: MissileMeta = { ...LIGHTNINGSTRIKE_META, name: 'chainlightning' }
const LIGHTNINGHIT_META: MissileMeta = { ...LIGHTNINGSTRIKE_META, name: 'lightninghit' }
const LIGHTNING_META: MissileMeta = { ...LIGHTNINGSTRIKE_META, name: 'lightning' }
const LIGHTNINGBOLT_META: MissileMeta = { ...LIGHTNINGSTRIKE_META, name: 'lightningbolt' }
const THUNDERSTORM_META: MissileMeta = { ...THUNDERSTORM1_META, name: 'thunderstorm' }
const LIGHTNINGBOLTBIG_META: MissileMeta = { ...THUNDERSTORM1_META, name: 'lightningboltbig' }
const GLEAM_META: MissileMeta = { ...SPARKLE_META, name: 'gleam' }
const FREEZEEXPLODEEJECTA_META: MissileMeta = { ...FREEZINGARROWEXP2_META, name: 'freezeexplodeejecta' }
export const GLACIALSPIKEEJECTA_META: MissileMeta = { ...FREEZINGARROWEXP2_META, name: 'glacialspikeejecta' }
export const BLAZE_META: MissileMeta = { ...FIREWALL_META, name: 'blaze' }
const FIREWALLMAKER_META: MissileMeta = { ...FIREWALL_META, name: 'firewallmaker' }
export const GROUNDFIREBIG_META: MissileMeta = { ...FIREWALL_META, name: 'groundfirebig' }
const FLAMETHROWER_META: MissileMeta = { ...INFERNOFLAME1_META, name: 'flamethrower' }
const FLAMETHROWER2_META: MissileMeta = { ...INFERNOFLAME2_META, name: 'flamethrower2' }
const COLDUNIQUE_META: MissileMeta = { ...FROSTNOVA_META, name: 'coldunique' }
const MEPHFROSTNOVA_META: MissileMeta = { ...FROSTNOVA_META, name: 'mephfrostnova' }
const REVIVESMALL_META: MissileMeta = { ...REVIVE_META, name: 'revivesmall' }
const REVIVEMEDIUM_META: MissileMeta = { ...REVIVE_META, name: 'revivemedium' }
const REVIVELARGE_META: MissileMeta = { ...REVIVE_META, name: 'revivelarge' }
const BONESPEAREXPLODE_META: MissileMeta = { ...TEETHEXPLODE_META, name: 'bonespearexplode' }

export const MISSILE_METAS: Readonly<Record<string, MissileMeta>> = Object.freeze({
${mapEntries}
  'revivesmall': REVIVESMALL_META,
  'revivemedium': REVIVEMEDIUM_META,
  'revivelarge': REVIVELARGE_META,
  'bonespearexplode': BONESPEAREXPLODE_META,
  'chillingarmorbolt': ICEBOLT_META,
  'freezingarrowexp1': FREEZEEXPLODE_META,
  'FreezingArrowExp1': FREEZEEXPLODE_META,
  'freezingarrowexp3': FREEZINGARROWEXP2_META,
  'iceexplode1': ICEEXPLODE_META,
  'iceexplode2': ICEEXPLODE_META,
  'blizzard4': BLIZZARD4_META,
  'blizzardexplode3': BLIZZARDEXPLODE3_META,
  'blizzardcenter': BLIZZARD1_META,
  'hydra': HYDRA_META,
  'hydrafire': HYDRAFIRE_META,
  'hydracenter': HYDRA_META,
  'meteortargetindicator': METEORTARGETINDICATOR_META,
  'firemedium': FIREMEDIUM_META,
  'electricnova': ELECTRICNOVA_META,
  'chainlightning': CHAINLIGHTNING_META,
  'lightning': LIGHTNING_META,
  'lightningbolt': LIGHTNINGBOLT_META,
  'lightninghit': LIGHTNINGHIT_META,
  'thunderstorm': THUNDERSTORM_META,
  'lightningboltbig': LIGHTNINGBOLTBIG_META,
  'gleam': GLEAM_META,
  'freezeexplodeejecta': FREEZEEXPLODEEJECTA_META,
  'glacialspikeejecta': GLACIALSPIKEEJECTA_META,
  'blaze': BLAZE_META,
  'firewallmaker': FIREWALLMAKER_META,
  'firewall1': FIREWALL_META,
  'firewall2': FIREWALL_META,
  'firewall3': FIREWALL_META,
  'firewall4': FIREWALL_META,
  'firewall5': FIREWALL_META,
  'groundfirebig': GROUNDFIREBIG_META,
  'flamethrower': FLAMETHROWER_META,
  'flamethrower2': FLAMETHROWER2_META,
  'inferno': INFERNOFLAME1_META,
  'coldunique': COLDUNIQUE_META,
  'mephfrostnova': MEPHFROSTNOVA_META,
  'StaticField': LIGHTNINGSTRIKE_META,
  'staticfield': LIGHTNINGSTRIKE_META,

  // Amazon skill & missile aliases
  'multishotarrow': ARROW_META,
  'multishotbolt': BOLT_META,
  'criticalarrow': ARROW_META,
  'dodge': ARROW_META,
  'avoid': ARROW_META,
  'evade': ARROW_META,
  'penetrate': ARROW_META,
  'decoy': MAGICARROW_META,
  'valkyrie': MAGICARROW_META,
  'PowerStrike': CHARGEDSTRIKEBOLT_META,
  'powerstrike': CHARGEDSTRIKEBOLT_META,
  'Impale': ARROW_META,
  'impale': ARROW_META,
  'Fend': ARROW_META,
  'fend': ARROW_META,
  'ChargedStrike': CHARGEDSTRIKEBOLT_META,
  'chargedstrike': CHARGEDSTRIKEBOLT_META,

  // Necromancer skill & missile aliases
  'curseamplifydamage': CURSEALL_META,
  'cursedimvision': CURSEALL_META,
  'curseweaken': CURSEALL_META,
  'curseironmaiden': CURSEALL_META,
  'curseterror': CURSEALL_META,
  'curseconfuse': CURSEALL_META,
  'cursereversevampire': CURSEALL_META,
  'curseattract': CURSEALL_META,
  'cursedecrepify': CURSEALL_META,
  'curselowerresist': CURSEALL_META,
  'amplifydamage': CURSECAST_META,
  'dimvision': CURSECAST_META,
  'weaken': CURSECAST_META,
  'ironmaiden': CURSECAST_META,
  'terror': CURSECAST_META,
  'confuse': CURSECAST_META,
  'lifetap': CURSECAST_META,
  'attract': CURSECAST_META,
  'decrepify': CURSECAST_META,
  'lowerresist': CURSECAST_META,
  'poisonexplosion': POISONEXPLOSIONCLOUD_META,
  'bonewall': BONECAST_META,
  'bonewallmaker': BONECAST_META,
  'boneprison': BONECAST_META,
  'skeleton': REVIVE_META,
  'skeletonmage': REVIVE_META,
  'claygolem': REVIVE_META,
  'bloodgolem': REVIVE_META,
  'irongolem': REVIVE_META,
  'firegolem': REVIVE_META,

  // Paladin skill & missile aliases
  'smite': HOLYBOLT_META,
  'zeal': HOLYBOLT_META,
  'vengeance': HOLYBOLT_META,
  'charge': HOLYBOLT_META,
  'conversion': HOLYBOLT_META,
  'sacrifice': HOLYBOLT_META,
  'holyshield': HOLYBOLT_META,
  'fist_of_the_heavens': FOA_META,
  'fistoftheheavens': FOA_META,
  'fistoftheheavensdelay': FOA_META,

  // Barbarian skill & missile aliases
  'findpotion': GRIMWARDSMALL_META,
  'finditem': GRIMWARDSMALL_META,
  'grimward': GRIMWARDSMALL_META,
  'grimwardscare': GRIMWARDSMALL_META,
  'taunt': HOWL_META,
  'bash': ARROW_META,
  'leap': ARROW_META,
  'doublethrow': ARROW_META,
  'doubleswing': ARROW_META,
  'leapattack': ARROW_META,
  'stun': ARROW_META,
  'concentrate': ARROW_META,
  'frenzy': ARROW_META,
  'whirlwind': ARROW_META,
  'berserk': ARROW_META,

  // Druid skill & missile aliases
  'moltenboulderemergerock': ROCKLAVAEXPLOSION_META,
  'moltenboulderexplode': ROCKLAVAEXPLOSION_META,
  'moltenboulderfirepath': ROCKLAVAPOOL_META,
  'moltenboulderflyingrocks': VOLCANOROCK_META,
  'arcticblast': ARCTICBLAST1_META,
  'fissure': ERUPTIONCRACK_META,
  'eruptioncenter': ERUPTIONCRACK_META,
  'eruption crack 1': ERUPTIONCRACK_META,
  'eruption crack 2': ERUPTIONCRACK_META,
  'eruption smoke 1': ERUPTIONSMOKE_META,
  'eruption smoke 2': ERUPTIONSMOKE_META,
  'volcano': VOLCANOBASE_META,
  'volcanodebris2': VOLCANOFIRE_META,
  'volcanosmallfire': VOLCANOFIRE_META,
  'armageddon': ARMAGEDDONROCK_META,
  'armageddonrocks': ARMAGEDDONROCK_META,
  'armageddonexplode': VOLCANOFIRE_META,
  'armageddonfire': VOLCANOFIRE_META,
  'hurricane': HURRICANESWOOSH_META,
  'hurricanemaker': HURRICANESWOOSH_META,
  'plaguevines': VINES_META,
  'plaguevinemaker': VINES_META,
  'carrionvine': VINES_META,
  'carrionvinemaker': VINES_META,
  'solarscreecher': VINES_META,
  'solarscreechermaker': VINES_META,

  // Assassin skill & missile aliases
  'tigerstrike': FIREEXPLODE_META,
  'dragonclaw': FIREEXPLODE_META,
  'ClawsOfThunderBolt': CHARGEDSTRIKEBOLT_META,
  'clawsofthunderbolt': CHARGEDSTRIKEBOLT_META,
  'ClawsOfThunderNova': NOVA_META,
  'clawsofthundernova': NOVA_META,
  'BladesOfIceExplode': ICEEXPLODE_META,
  'bladesoficeexplode': ICEEXPLODE_META,
  'BladesOfIceCubes': ICEBREAKSMALL_META,
  'bladesoficecubes': ICEBREAKSMALL_META,
  'BladesOfIceCubesMelt': ICEBREAKSMALLMELT_META,
  'bladesoficecubesmelt': ICEBREAKSMALLMELT_META,
  'RoyalStrikeMeteor': METEOR_META,
  'royalstrikemeteor': METEOR_META,
  'RoyalStrikeMeteorCenter': METEORCENTER_META,
  'royalstrikemeteorcenter': METEORCENTER_META,
  'RoyalStrikeMeteorTail': METEORTAIL_META,
  'royalstrikemeteortail': METEORTAIL_META,
  'RoyalStrikeMeteorExplode': METEOREXPLODE_META,
  'royalstrikemeteorexplode': METEOREXPLODE_META,
  'RoyalStrikeMeteorFire': METEORFIRE_META,
  'royalstrikemeteorfire': METEORFIRE_META,
  'RoyalStrikeChainLightning': LIGHTNINGSTRIKE_META,
  'royalstrikechainlightning': LIGHTNINGSTRIKE_META,
  'RoyalStrikeChaosIce': ICEBOLT_META,
  'royalstrikechaosice': ICEBOLT_META,
  'fistsoffire': FIREEXPLODE_META,
  'FistsOfFireExplode': FIREEXPLODE_META,
  'fistsoffireexplode': FIREEXPLODE_META,
  'FistsOfFireFirewall': FIREWALL_META,
  'fistsoffirefirewall': FIREWALL_META,
  'clawsofthunder': CHARGEDSTRIKEBOLT_META,
  'bladesofice': ICEEXPLODE_META,
  'phoenixstrike': METEOR_META,
  'cobrastrike': POISONPUFF_META,
  'dragontail': FIREEXPLODE_META,
  'DragonTailMissile': FIREEXPLODE_META,
  'dragontailmissile': FIREEXPLODE_META,
  'dragonflight': FIREEXPLODE_META,
  'psychichammer': MINDBLAST_META,
  'lightningsentry': LIGHTNINGSTRIKE_META,
  'chargedboltsentry': CHARGEDBOLT_META,
  'chargeboltsentry': CHARGEDBOLT_META,
  'sentrylightning': LIGHTNINGSTRIKE_META,
  'sentrychargedbolt': CHARGEDBOLT_META,
  'wakeoffire': FIRESMALL_META,
  'wakeofdestructionmaker': FIRESMALL_META,
  'wakeofinferno': INFERNOFLAME1_META,
  'infernosentry1': INFERNOFLAME1_META,
  'infernosentry2': INFERNOFLAME2_META,
  'deathsentry': DEATHSENTRYEXPLODE_META,
  'corpseexplosion_ds': CORPSEEXPLOSION_META,
  'lightning_ds': LIGHTNINGSTRIKE_META,
  'bladesentinel': BLADEFURY_META,
  'shockweb': SHOCKFIELDGROUND_META,
  'blade_shield_attachment': BLADESHIELDMISSILE_META,

  // Exact CelFile aliases for 18 Sorceress Skills Missiles & Ground Truth CelFiles
  'ElectricNova': ELECTRICNOVA_META,
  'LightningStrike': LIGHTNINGSTRIKE_META,
  'ChainLightning': CHAINLIGHTNING_META,
  'LightningHit': LIGHTNINGHIT_META,
  'Thunderstorm': THUNDERSTORM_META,
  'LightningboltBig': LIGHTNINGBOLTBIG_META,
  'Gleam': GLEAM_META,
  'FreezeExplodeEjecta': FREEZEEXPLODEEJECTA_META,
  'GlacialSpikeEjecta': GLACIALSPIKEEJECTA_META,
  'Blaze': BLAZE_META,
  'FirewallMaker': FIREWALLMAKER_META,
  'groundFireBig': GROUNDFIREBIG_META,
  'Flamethrower': FLAMETHROWER_META,
  'Flamethrower2': FLAMETHROWER2_META,
  'ColdUnique': COLDUNIQUE_META,
  'MephFrostNova': MEPHFROSTNOVA_META,
  'FrostNova': FROSTNOVA_META,
  'IceBreakSmall': ICEBREAKSMALL_META,
  'IceBreakSmallMelt': ICEBREAKSMALLMELT_META,

  // Base missiles CelFiles
  'Firebolt': FIREBOLT_META,
  'Fireball': FIREBALL_META,
  'FireArrowExplode2': FIREEXPLODE_META,
  'firearrowexplode2': FIREEXPLODE_META,
  'Icebolt': ICEBOLT_META,
  'IceBlast': ICEBLAST_META,
  'GlacialSpike': GLACIALSPIKE_META,
  'IceArrowExplode': ICEEXPLODE_META,
  'FreezeExplodeCenter': FREEZEEXPLODE_META,
  'freezeexplodecenter': FREEZEEXPLODE_META,
  'IceOrb': FROZENORB_META,
  'iceorb': FROZENORB_META,
  'IceOrbExplode': FROZENORBEXPLODE_META,
  'iceorbexplode': FROZENORBEXPLODE_META,
  'Blizzard': BLIZZARD3_META,
  'blizzard': BLIZZARD3_META,
  'ChargedBolt': CHARGEDBOLT_META,
  'teethMissile': TEETH_META,
  'teethmissile': TEETH_META,
  'BoneSpear': BONESPEAR_META,
  'BoneSpirit': BONESPIRIT_META,
  'BoneSpiritExplode': BONESPIRITEXPLODE_META,
  'poisonNova': POISONNOVA_META,
  'HolyBoltMissile': HOLYBOLT_META,
  'holyboltmissile': HOLYBOLT_META,
  'SafeArrow': MAGICARROW_META,
  'safearrow': MAGICARROW_META,
  'FireArrow': FIREARROW_META,
  'IceArrow': ICEARROW_META,
  'Arrow': ARROW_META,
  'LightningJavelin': LIGHTNINGJAVELIN_META,
  'Meteor': METEOR_META,
  'MeteorTail': METEORTAIL_META,
  'MeteorTargetIndicator': METEORTARGETINDICATOR_META,
  'ExpArrowExplode': METEOREXPLODE_META,
  'exparrowexplode': METEOREXPLODE_META,
  'groundFireMedium': FIREMEDIUM_META,
  'groundfiremedium': FIREMEDIUM_META,
  'groundFireSmall': FIRESMALL_META,
  'groundfiresmall': FIRESMALL_META,

  // Necromancer CelFiles
  'CorpseExplodeGuts': CORPSEEXPLOSION_META,
  'corpseexplodeguts': CORPSEEXPLOSION_META,
  'CorpseExplodeGutsPoison': POISONCORPSEEXPLOSION_META,
  'corpseexplodegutspoison': POISONCORPSEEXPLOSION_META,
  'PoisonSparks': POISONEXPLOSIONCLOUD_META,
  'poisonsparks': POISONEXPLOSIONCLOUD_META,
  'PoisonSmokePuff': POISONPUFF_META,
  'poisonsmokepuff': POISONPUFF_META,
  'CurseCast': CURSECAST_META,
  'CurseArea': CURSEALL_META,
  'cursearea': CURSEALL_META,
  'BoneCast': BONECAST_META,
  'BoneSpearTrail': BONESPEARTRAIL_META,
  'Revive': REVIVE_META,
  'BloodLarge01': BIGBLOOD1_META,
  'bloodlarge01': BIGBLOOD1_META,
  'BloodLarge02': BIGBLOOD2_META,
  'bloodlarge02': BIGBLOOD2_META,

  // Paladin CelFiles
  'FOAorbiter': FOA_META,
  'foaorbiter': FOA_META,
  'BloodSmall01': BLOOD1_META,
  'bloodsmall01': BLOOD1_META,
  'RedemptionGhost': REDEEM_META,
  'redemptionghost': REDEEM_META,

  // Amazon CelFiles
  'XBowBolt': BOLT_META,
  'xbowbolt': BOLT_META,
  'Javelin': POISONJAV_META,
  'javelin': POISONJAV_META,

  // Barbarian CelFiles
  'BAYellShockWave01': HOWL_META,
  'bayellshockwave01': HOWL_META,
  'WarcryShockwave': WARCRY_META,
  'warcryshockwave': WARCRY_META,
  'GrimWardSmallStart': GRIMWARDSMALLSTART_META,
  'GrimWardSmall': GRIMWARDSMALL_META,
  'GrimWardSmallStop': GRIMWARDSMALLSTOP_META,
  'GrimWardMediumStart': GRIMWARDMEDIUMSTART_META,
  'GrimWardMedium': GRIMWARDMEDIUM_META,
  'GrimWardMediumStop': GRIMWARDMEDIUMSTOP_META,
  'GrimWardLargeStart': GRIMWARDLARGESTART_META,
  'GrimWardLarge': GRIMWARDLARGE_META,
  'GrimWardLargeStop': GRIMWARDLARGESTOP_META,

  // Druid CelFiles
  'expansion/MoltenBoulderRoll': MOLTENBOULDER_META,
  'MoltenBoulderRoll': MOLTENBOULDER_META,
  'moltenboulderroll': MOLTENBOULDER_META,
  'expansion/MoltenBoulderEmerge': MOLTENBOULDEREMERGE_META,
  'MoltenBoulderEmerge': MOLTENBOULDEREMERGE_META,
  'expansion/FirestormEmitter': FIRESTORMMAKER_META,
  'FirestormEmitter': FIRESTORMMAKER_META,
  'firestormemitter': FIRESTORMMAKER_META,
  'expansion/FireSpikes': FIRESTORM_META,
  'FireSpikes': FIRESTORM_META,
  'firespikes': FIRESTORM_META,
  'expansion/FireSpikesGround': FIRESPIKESGROUND_META,
  'FireSpikesGround': FIRESPIKESGROUND_META,
  'expansion/ArcticBlastIce': ARCTICBLAST1_META,
  'ArcticBlastIce': ARCTICBLAST1_META,
  'arcticblastice': ARCTICBLAST1_META,
  'expansion/ArcticBlastIce_2': ARCTICBLAST2_META,
  'ArcticBlastIce_2': ARCTICBLAST2_META,
  'arcticblastice_2': ARCTICBLAST2_META,
  'expansion/twister': TWISTER_META,
  'expansion/tornado': TORNADO_META,
  'Expansion/volcano_base': VOLCANOBASE_META,
  'volcano_base': VOLCANOBASE_META,
  'Expansion/volcano_Fire': VOLCANOFIRE_META,
  'volcano_Fire': VOLCANOFIRE_META,
  'volcano_fire': VOLCANOFIRE_META,
  'expansion/volcano_rock': VOLCANOROCK_META,
  'volcano_rock': VOLCANOROCK_META,
  'expansion/shockwave': SHOCKWAVE_META,
  'expansion/armageddon_rock': ARMAGEDDONROCK_META,
  'armageddon_rock': ARMAGEDDONROCK_META,
  'expansion/armageddon_fire': ARMAGEDDONTAIL_META,
  'armageddon_fire': ARMAGEDDONTAIL_META,
  'expansion/hurricane_swoosh': HURRICANESWOOSH_META,
  'hurricane_swoosh': HURRICANESWOOSH_META,
  'expansion/hurricane_rocks': HURRICANEROCK_META,
  'hurricane_rocks': HURRICANEROCK_META,
  'expansion/hurricane_tree': HURRICANETREE_META,
  'hurricane_tree': HURRICANETREE_META,
  'Expansion/vines': VINES_META,
  'Expansion/Vines_Death': VINESDEATH_META,
  'Vines_Death': VINESDEATH_META,
  'vines_death': VINESDEATH_META,
  'expansion/EruptionCrack': ERUPTIONCRACK_META,
  'EruptionCrack': ERUPTIONCRACK_META,
  'expansion/EruptionSmoke': ERUPTIONSMOKE_META,
  'EruptionSmoke': ERUPTIONSMOKE_META,
  'Expansion/rock_lava_explosion': ROCKLAVAEXPLOSION_META,
  'rock_lava_explosion': ROCKLAVAEXPLOSION_META,
  'Expansion/rock_lava_pool': ROCKLAVAPOOL_META,
  'rock_lava_pool': ROCKLAVAPOOL_META,
  'frozenorbbolt': ICEBOLT_META,
  'frozenorbnova': ICEBOLT_META,
  'icestormimpactvar02': BLIZZARDEXPLODE3_META,
  'hydra_turret': HYDRA_META,

  // Assassin CelFiles
  'expansion/FireTraumaMissile': FIRETRAUMA_META,
  'FireTraumaMissile': FIRETRAUMA_META,
  'expansion/FireTraumaGround': FIRETRAUMAGROUND_META,
  'FireTraumaGround': FIRETRAUMAGROUND_META,
  'expansion/FireTraumaXplosion': FIRETRAUMAEXPLODE_META,
  'FireTraumaXplosion': FIRETRAUMAEXPLODE_META,
  'expansion/caltrops': SHOCKFIELDAIR_META,
  'caltrops': SHOCKFIELDAIR_META,
  'Expansion/ShockField': SHOCKFIELDGROUND_META,
  'ShockField': SHOCKFIELDGROUND_META,
  'shockfield': SHOCKFIELDGROUND_META,
  'Expansion/bladefury': BLADEFURY_META,
  'Expansion/bladefury_B': BLADEFURYB_META,
  'bladefury_B': BLADEFURYB_META,
  'Expansion/bladefury_C': BLADEFURYC_META,
  'bladefury_C': BLADEFURYC_META,
  'Expansion/dethsentry02': DEATHSENTRYEXPLODE_META,
  'dethsentry02': DEATHSENTRYEXPLODE_META,
  'Expansion/blade_shield_missile': BLADESHIELDMISSILE_META,
  'blade_shield_missile': BLADESHIELDMISSILE_META,
  'expansion/ThrowingStarMissile': THROWINGSTAR_META,
  'ThrowingStarMissile': THROWINGSTAR_META,
  'throwingstarmissile': THROWINGSTAR_META,
  'Expansion/Mindblast': MINDBLAST_META,
  'Mindblast': MINDBLAST_META,

  // Quest FX Client Missiles (Issue #873)
  'LightBeams': DENOFEVILLIGHT_META,
  'lightbeams': DENOFEVILLIGHT_META,
  'cairn stones bolt': LIGHTNINGBOLTBIG_META,

  // Monster & Boss Death FX Missiles & CelFiles (Issue #872)
  'monstercorpseexplode': CORPSEEXPLOSION_META,
  'suicidecorpseexplode': CORPSEEXPLOSION_META,
  'suicidefireexplode': FIREEXPLOSION_META,
  'suicideiceexplode': FREEZEEXPLODE_META,
  'Fsexplode': FIREEXPLOSION_META,
  'fsexplode': FIREEXPLOSION_META,
  'IceBreakLarge': ICEBREAKLARGE_META,
  'IceBreakLargeMelt': ICEBREAKLARGEMELT_META,
  'IceBreakSmoke': ICEBREAKSMOKE_META,
  'lightunique': CHARGEDBOLT_META,
  'buglightning': CHARGEDBOLT_META,
  'corpsepoisoncloud': POISONPUFF_META,
  'queenpoisoncloud': POISONPUFF_META,
  'brdeathlightningbolt': LIGHTNINGSTRIKE_META,
  'brdeathlightninghit': LIGHTNINGSTRIKE_META,
  'BRSpiritS1': BRDEATHSPIRITS_META,
  'BRSpiritNU': BRSPIRITNU_META,
  'BRSpiritDT': BRSPIRITDT_META,
  'BRSmokeS1': BRSMOKES1_META,
  'BRSmokeNU': BRSMOKENU_META,
  'BRSmokeDT': BRSMOKEDT_META,
  'mephistofirewallmaker': FIREWALL_META,
  'mephistofirewall': FIREWALL_META,
  'mephistoexplosionbig': METEOREXPLODE_META,
  'mephistoexplosionsmall': FIREEXPLODE_META,
  'andyfirewallmaker': FIREWALL_META,
  'andyfirewall': FIREWALL_META,
  'andycolumnfirebase': METEORFIRE_META,
  'AndarielFlameDeath': ANDYCOLUMNFIRE_META,
  'andarielflamedeath': ANDYCOLUMNFIRE_META,
  'CeilingChunkFall01': ANDYFALLINGDEBRIS1_META,
  'CeilingChunkFall02': ANDYFALLINGDEBRIS2_META,
  'CeilingChunkFall03': ANDYFALLINGDEBRIS3_META,
  'CeilingChunkVanish01': ANDYDEBRISEXPLOSION1_META,
  'CeilingChunkVanish02': ANDYDEBRISEXPLOSION2_META,
  'CeilingChunkRemain01': ANDYDEBRISEXPLOSION3_META,
  'CeilingChunkRemain02': ANDYDEBRISEXPLOSION4_META,
  'CeilingChunkRemain03': ANDYDEBRISEXPLOSION5_META,
  'radamentholybolt': HOLYBOLT_META,
  'HandOfGod': RADAMENTHANDOFGOD_META,
  'handofgod': RADAMENTHANDOFGOD_META,
  'QueenDeathGuts': QUEENDEATHGLOB_META,
  'queendeathguts': QUEENDEATHGLOB_META,
  'QueenDeathPuddle': QUEENDEATHSPLAT1_META,
  'queendeathpuddle': QUEENDEATHSPLAT1_META,
  'QueenDeathPuddle2': QUEENDEATHSPLAT2_META,
  'queendeathpuddle2': QUEENDEATHSPLAT2_META,
  'healing vortex': HEALINGVORTEX_META,
  'ExplosionSparkSmall': HEALINGVORTEX_META,
  'explosionsparksmall': HEALINGVORTEX_META,
  'smithholebirth': MEPHISTOHOLEBIRTH_META,
  'smithholeneutral': MEPHISTOHOLENEUTRAL_META,
  'smithholedeath': MEPHISTOHOLEDEATH_META,
  'smithholedead': MEPHISTOHOLEDEAD_META,
  'Rock_large': DURIELDEATHROCK_META,
  'rock_large': DURIELDEATHROCK_META,
  'Rock_small': DURIELDEATHDEBRIS_META,
  'rock_small': DURIELDEATHDEBRIS_META,
  'FireSmoke': DURIELDEATHSMOKE_META,
  'firesmoke': DURIELDEATHSMOKE_META,
  'orbfire': METEORFIRE_META,
  'mist_Fade_Orb_Loop': ORBMIST_META,
  'mist_fade_orb_loop': ORBMIST_META,
  'mist_Fade_Orb': ORBMISTFADE_META,
  'mist_fade_orb': ORBMISTFADE_META,
  'izual mist loop': IZUALMISTLOOP_META,
  'IzualDeathClouds': IZUALMISTLOOP_META,
  'izualdeathclouds': IZUALMISTLOOP_META,
  'izual mist fade': ORBMISTFADE_META,
  'izual lightning': IZUALLIGHTNING_META,
  'IzualDeathParticles': IZUALLIGHTNING_META,
  'izualdeathparticles': IZUALLIGHTNING_META,
  'izual lightning trail': LIGHTNINGSTRIKE_META,
  'DopplezonExplode': DOPPLEZONEXPLODE_META,
  'catapult spike explosion': CATAPULTSPIKEEXPLOSION_META,
  'expansion/FireSpikeExplode': CATAPULTSPIKEEXPLOSION_META,
  'FireSpikeExplode': CATAPULTSPIKEEXPLOSION_META,
  'firespikeexplode': CATAPULTSPIKEEXPLOSION_META,
  'tower death': TOWERDEATH_META,
  'expansion/TowerDebris': TOWERDEATH_META,
  'TowerDebris': TOWERDEATH_META,
  'towerdebris': TOWERDEATH_META,
  'ancient death cloud': ANCIENTDEATHCLOUD_META,
  'expansion/AncientDeathMissile': ANCIENTDEATHCLOUD_META,
  'AncientDeathMissile': ANCIENTDEATHCLOUD_META,
  'ancientdeathmissile': ANCIENTDEATHCLOUD_META,
  'expansion/overseer_missile': OVERSEERMISSILE_META,
  'overseer_missile': OVERSEERMISSILE_META,
  'expansion/Nihlathak A': NIHLITHAK1_META,
  'Nihlathak A': NIHLITHAK1_META,
  'nihlathak a': NIHLITHAK1_META,
  'expansion/Nihlathak B': NIHLITHAK2_META,
  'Nihlathak B': NIHLITHAK2_META,
  'nihlathak b': NIHLITHAK2_META,
  'expansion/Nihlathak C': NIHLITHAK3_META,
  'Nihlathak C': NIHLITHAK3_META,
  'nihlathak c': NIHLITHAK3_META,
  'expansion/nehlthak_Swoosh': NEHLITHAKSWOOSH_META,
  'nehlthak_Swoosh': NEHLITHAKSWOOSH_META,
  'nehlthak_swoosh': NEHLITHAKSWOOSH_META,
  'expansion/Skeleton_pieces_A': NEHLITHAKDEBRIS1_META,
  'Skeleton_pieces_A': NEHLITHAKDEBRIS1_META,
  'skeleton_pieces_a': NEHLITHAKDEBRIS1_META,
  'expansion/Skeleton_pieces_B': NEHLITHAKDEBRIS2_META,
  'Skeleton_pieces_B': NEHLITHAKDEBRIS2_META,
  'skeleton_pieces_b': NEHLITHAKDEBRIS2_META,
  'expansion/Skeleton_pieces_C': NEHLITHAKDEBRIS3_META,
  'Skeleton_pieces_C': NEHLITHAKDEBRIS3_META,
  'skeleton_pieces_c': NEHLITHAKDEBRIS3_META,
  'expansion/Skeleton_pieces_D': NEHLITHAKDEBRIS4_META,
  'Skeleton_pieces_D': NEHLITHAKDEBRIS4_META,
  'skeleton_pieces_d': NEHLITHAKDEBRIS4_META,
  'Expansion/Baalsummonoverlay': BAALTELEPORT_META,
  'Baalsummonoverlay': BAALTELEPORT_META,
  'baalsummonoverlay': BAALTELEPORT_META,
  'Expansion/Baalteleport': BAALCLONEDEATH_META,
  'Baalteleport': BAALCLONEDEATH_META,
  'expansion/nehlthak_Hole': NEHLITHAKHOLE_META,
  'nehlthak_Hole': NEHLITHAKHOLE_META,
  'nehlthak_hole': NEHLITHAKHOLE_META,
  'expansion/nehlthak_Hole_light': NEHLITHAKHOLELIGHT_META,
  'nehlthak_Hole_light': NEHLITHAKHOLELIGHT_META,
  'nehlthak_hole_light': NEHLITHAKHOLELIGHT_META,
  'expansion/NehlithakGlow': NEHLITHAKGLOW2_META,
  'NehlithakGlow': NEHLITHAKGLOW2_META,
  'nehlithakglow': NEHLITHAKGLOW2_META,
  'expansion/BonePieces': NEHLITHAKBONECHIPS_META,
  'BonePieces': NEHLITHAKBONECHIPS_META,
  'bonepieces': NEHLITHAKBONECHIPS_META,
  'baalfx spirit 1': BAALFXSPIRIT1_META,
  'expansion/baaldeathghostie02': BAALFXSPIRIT1_META,
  'baaldeathghostie02': BAALFXSPIRIT1_META,
  'baalfx spirit 2': BAALFXSPIRIT2_META,
  'expansion/baaldeathghostie01': BAALFXSPIRIT2_META,
  'baaldeathghostie01': BAALFXSPIRIT2_META,
  'baalfx baal head appear': BAALFXBAALHEADAPPEAR_META,
  'expansion/baaldeathswirl': BAALFXBAALHEADAPPEAR_META,
  'baaldeathswirl': BAALFXBAALHEADAPPEAR_META,
  'baalfx baal head 1': BAALFXBAALHEAD1_META,
  'expansion/baaldeathhead01': BAALFXBAALHEAD1_META,
  'baaldeathhead01': BAALFXBAALHEAD1_META,
  'baalfx baal head 2': BAALFXBAALHEAD2_META,
  'expansion/baaldeathhead02': BAALFXBAALHEAD2_META,
  'baaldeathhead02': BAALFXBAALHEAD2_META,
  'baalfx baal head 3': BAALFXBAALHEAD3_META,
  'expansion/baaldeathhead03': BAALFXBAALHEAD3_META,
  'baaldeathhead03': BAALFXBAALHEAD3_META,
  'baalfx tyreal debris 1': BAALFXTYREALDEBRIS1_META,
  'expansion/BCeilingChunkFall1': BAALFXTYREALDEBRIS1_META,
  'BCeilingChunkFall1': BAALFXTYREALDEBRIS1_META,
  'bceilingchunkfall1': BAALFXTYREALDEBRIS1_META,
  'baalfx tyreal debris 2': BAALFXTYREALDEBRIS2_META,
  'expansion/BCeilingChunkFall2': BAALFXTYREALDEBRIS2_META,
  'BCeilingChunkFall2': BAALFXTYREALDEBRIS2_META,
  'bceilingchunkfall2': BAALFXTYREALDEBRIS2_META,
  'baalfx tyreal debris 3': BAALFXTYREALDEBRIS3_META,
  'expansion/BCeilingChunkFall3': BAALFXTYREALDEBRIS3_META,
  'BCeilingChunkFall3': BAALFXTYREALDEBRIS3_META,
  'bceilingchunkfall3': BAALFXTYREALDEBRIS3_META,
  'baalfx tyreal debris break': BAALFXTYREALDEBRISBREAK_META,
  'expansion/BCeilingChunkBreak': BAALFXTYREALDEBRISBREAK_META,
  'BCeilingChunkBreak': BAALFXTYREALDEBRISBREAK_META,
  'bceilingchunkbreak': BAALFXTYREALDEBRISBREAK_META,
  'monsterpoisoncloud': POISONPUFF_META,
  'universalpoisoncloud': POISONPUFF_META,
  'andycontrol0': ANDYCOLUMNFIRE_META,
  'andyspurt': ANDYCOLUMNFIRE_META,
  'andyfallingdebris': ANDYFALLINGDEBRIS1_META,
  'durieldeathcontrol': DURIELDEATHROCK_META,
  'radamentdeath': RADAMENTHANDOFGOD_META,
  'taintedsunflash': HEALINGVORTEX_META,
  'taintedsunball': HEALINGVORTEX_META,
  'mephistodeathcontrol': MEPHISTOHOLEBIRTH_META,
  'mephistoflyingrocksbig': METEOREXPLODE_META,
  'mephistoflyingrockssmall': HEALINGVORTEX_META,
  'mephistosmoke': DURIELDEATHSMOKE_META,
  'izualcontrol': IZUALMISTLOOP_META,
  'izual control': IZUALMISTLOOP_META,
  'izualice': IZUALLIGHTNING_META,
  'izualmist': IZUALMISTLOOP_META,
  'izualsparks': IZUALLIGHTNING_META,
  'diablolight': FIREWALL_META,
  'towermist': ORBMIST_META,
  'TowerMistTrail': ORBMIST_META,
  'towermisttrail': ORBMIST_META,
  'TowerMistFade': ORBMISTFADE_META,
  'towermistfade': ORBMISTFADE_META,
  'shenkcontrol': OVERSEERMISSILE_META,
  'overseercontrol': OVERSEERMISSILE_META,
  'shenkdeath1': OVERSEERMISSILE_META,
  'ancientdeathcontrol': ANCIENTDEATHCLOUD_META,
  'ancient death center': ANCIENTDEATHCLOUD_META,
  'nihlathakcontrol': NEHLITHAKDEBRIS1_META,
  'nehlithakcontrol': NEHLITHAKDEBRIS1_META,
  'nihlathak1': NIHLITHAK1_META,
  'nihlathak2': NIHLITHAK2_META,
  'nihlathak3': NIHLITHAK3_META,
  'nihlathak4': NEHLITHAKDEBRIS1_META,
  'nihlathak5': NEHLITHAKDEBRIS2_META,
  'nihlathak6': NEHLITHAKDEBRIS3_META,
  'nihlathakswoosh': NEHLITHAKSWOOSH_META,
  'nihlathakdebris1': NEHLITHAKDEBRIS1_META,
  'nihlathakdebris2': NEHLITHAKDEBRIS2_META,
  'nihlathakdebris3': NEHLITHAKDEBRIS3_META,
  'nihlathakdebris4': NEHLITHAKDEBRIS4_META,
  'nihlathakglow': NEHLITHAKGLOW2_META,
  'baalcontrol': BAALTELEPORT_META,
  'baalspawn': BAALTELEPORT_META,
  'baalfxcontrol': BAALFXSPIRIT1_META,
  'baalfx control': BAALFXSPIRIT1_META,
  'baalfxspirit3': BAALFXSPIRIT1_META,
  'baalfx spirit 3': BAALFXSPIRIT1_META,
  'baalfxspirit4': BAALFXSPIRIT2_META,
  'baalfx spirit 4': BAALFXSPIRIT2_META,
  'baalfxspirit5': BAALFXSPIRIT1_META,
  'baalfx spirit 5': BAALFXSPIRIT1_META,
  'firetower death': TOWERDEATH_META,
  'baal clone death': BAALCLONEDEATH_META,
})
`

  const manifestStr = JSON.stringify(
    {
      schema: 1,
      totalMissiles: Object.keys(metaRecord).length,
      missiles: metaRecord,
    },
    null,
    2,
  )
  writeFileSync(join(publicOutDir, 'missiles-manifest.json'), manifestStr, 'utf-8')

  if (process.argv.includes('--write-meta-ts')) {
    const outTsPath = join(projectRoot, 'src', 'client', 'render', 'missiles-meta.ts')
    writeFileSync(outTsPath, metaTsContent, 'utf-8')
    console.log(`[Missile Packer] Wrote ${outTsPath}`)
  }

  return metaRecord
}

// Direct invocation via tsx
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  bakeMissiles()
    .then(() => {
      console.log('[Missile Packer] All missile assets baked successfully.')
      process.exit(0)
    })
    .catch(err => {
      console.error('[Missile Packer] Failed:', err)
      process.exit(1)
    })
}

