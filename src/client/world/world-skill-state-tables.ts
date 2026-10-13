/**
 * Canonical 1.13c skill/state/missile tables, types, and pure helpers for ClientWorld (`src/client/world/world-skill-state-tables.ts`).
 */

import {
  unitTypeFromId,
  type ItemData,
  type Pt,
  type UnitRef,
  type UnitType,
  type UnitTypeName,
} from '../../netproto/index.ts'
import { PALADIN_AURA_STATE_BY_SKILL_ID } from '../../common/skills/paladin-auras.ts'
import type { D2Seed } from '../../common/drlg/light-grid.ts'
import type { ClientUnit } from './client-unit.ts'
import type { ClientInventoryManager } from './inventory.ts'

export interface PartyMemberState {
  readonly unitId: number
  charName?: string | undefined
  charClass?: number | undefined
  charLevel?: number | undefined
  partyId?: number | undefined
  relation?: number | undefined
  lifePct?: number | undefined
  areaId?: number | undefined
  levelId?: number | undefined
  at?: Pt | undefined
  x?: number | undefined
  y?: number | undefined
  /** 0 = unpartied, 1 = in-party, 2 = invited-by-me, 3 = invited-me */
  partyState?: number | undefined
  hostile?: boolean | undefined
  lootPermit?: boolean | undefined
  /** 1.13c Party Screen Squelch: drops 0x26 normal chat (0x01), overhead speech (0x05), and whispers (0x02). */
  squelched?: boolean | undefined
  /** 1.13c Party Screen Ignore Whispers: drops 0x26 incoming whispers (0x02). */
  ignored?: boolean | undefined
}

export interface TradeSessionState {
  active: boolean
  lastAction: number
  pendingModal?: 'wait' | 'request' | null | undefined
  partnerId?: number | undefined
  partnerName?: string | undefined
  partnerGold: number
  selfGold: number
  selfAccepted: boolean
  partnerAccepted: boolean
  acceptDisabled: boolean
}

export interface MercHireEntry {
  readonly nameId: number
  readonly seed: number
}

export interface MercenaryState {
  mercId: number
  ownerId: number
  classId: number
  nameId?: number | undefined
  seed?: number | undefined
  name?: string | undefined
  nameZh?: string | undefined
  exp?: number | undefined
  lifePct: number
  isDead: boolean
  reviveCost: number
  deadNameId?: number | undefined
  reviveNameId?: number | undefined
  readonly stats: Map<number, number>
  readonly hireList: readonly MercHireEntry[]
}

export interface RosterPetState {
  readonly unitId: number
  readonly ownerId: number
  readonly petType: number
  readonly classId: number
  lifePct: number
  isDead: boolean
}

export interface ChatLogEntry {
  readonly id?: number | undefined
  readonly kind: 'say' | 'whisper' | 'overhead' | 'system' | 'event'
  readonly from?: string | undefined
  readonly unit?: UnitRef | undefined
  readonly text: string
  readonly rawText?: string | undefined
  readonly formattedEn?: string | undefined
  readonly formattedZh?: string | undefined
  readonly color?: number | undefined
  readonly eventType?: number | undefined
  readonly subType?: number | undefined
  readonly arg?: number | undefined
  readonly createdAtMs?: number | undefined
  readonly expireAtMs?: number | undefined
  elapsedMs?: number | undefined
}

/** 1.13c D2Client UpdateScreenShake (0x6fb3afd0) state. */
export interface ScreenShakeState {
  readonly active: boolean
  readonly startMs: number
  readonly rampUpMs: number
  readonly sustainMs: number
  readonly rampDownMs: number
  readonly amplitude: number
  readonly offsetX: number
  readonly offsetY: number
}

export interface PortalState {
  readonly localId: number
  readonly remoteId?: number | undefined
  readonly ownerName?: string | undefined
  readonly ownerId?: number | undefined
  readonly areaId: number
  readonly flags?: number | undefined
}

export type NpcInteractionWindow =
  | 'none'
  | 'trade'
  | 'gamble'
  | 'hire'
  | 'imbue'
  | 'add_sockets'
  | 'personalize'
  | 'orifice'

/**
 * Local NPC/stash interaction state. D2Client tracks this itself: the server never
 * reports "window closed" (no RemoveFromShop after 0x30, no reply to 0x4F 0x12;
 * captures 05 and 08). Stash opening is server-driven (0x77 action 0x10, capture 08).
 */
export interface NpcInteractionState {
  /** NPC unit id from the last `NpcInit` (0x2F); `null` after `NpcCancel` (0x30). */
  readonly npcId: number | null
  /** NPC unit id from the last `S2C 0x27 NPCInfo` packet. */
  readonly infoNpcId?: number | null | undefined
  /** Unit type from the last `S2C 0x27 NPCInfo` (`1` = NPC/Monster, `2` = Object). */
  readonly unitType?: number | undefined
  /** Store window opened by 0x38 action 1 (`trade`) or 2 (`gamble`) or quest rewards. */
  readonly window: 'none' | 'trade' | 'gamble' | 'imbue' | 'add_sockets' | 'personalize' | 'orifice'
  /** Extended window kind including `hire` and quest reward windows (`imbue`, `add_sockets`, `personalize`, `orifice`). */
  readonly activeWindow?: NpcInteractionWindow | undefined
  /** Set by S2C 0x77 action 0x10, cleared when the client sends 0x4F button 0x12. */
  readonly stashOpen: boolean
  /** Set by S2C 0x77 action 0x15 (UPDATEUI_OPENCUBE, D2Client.dll 0x6fb48070), cleared when the client sends 0x4F button 0x17. */
  readonly cubeOpen?: boolean | undefined
  /** Last raw payload from S2C 0x27 (`NPCInfo`). */
  readonly npcInfoRaw?: Uint8Array | undefined
  /** Last raw payload from S2C 0x91 (`NPCGetShow`). */
  readonly npcTalkRaw?: Uint8Array | undefined
  /** Parsed D2MessageStrc[8] entries from S2C 0x27 where stringId > 0. */
  readonly messages?: readonly { readonly menu: number; readonly stringId: number }[] | undefined
  /** All 8 raw parsed D2MessageStrc entries from S2C 0x27. */
  readonly allMessages?: readonly { readonly menu: number; readonly stringId: number }[] | undefined
  /**
   * True when the target unit carried the S2C 0x8A `wantsInteract` (overhead `!`) flag at the
   * moment the client sent `NpcInit` (0x2F) — captured before the optimistic local clear.
   * One-shot: consumed by the HUD via `consumeNpcInitWantsInteract()`.
   */
  readonly hadWantsInteract?: boolean | undefined
}

/** One S2C 0x2A NPCTransaction, numbered so the HUD can react to each reply once. */
export interface NpcTransactionRecord {
  readonly seq: number
  readonly result: number
  readonly flag: number
  readonly itemId: number
  readonly gold: number
}

/** S2C 0x77 ButtonActions action that opens the stash panel (capture 08; D2Client jump table 0x6fb0a520[0x10]). */
export const BUTTON_ACTION_OPEN_STASH = 0x10
/** S2C 0x77 ButtonActions action that closes the stash panel (D2Client jump table 0x6fb0a520[0x11] -> 0x6fb09ed0). */
export const BUTTON_ACTION_CLOSE_STASH = 0x11
/** S2C 0x77 ButtonActions action that opens the Horadric Cube panel (D2Constants.h UPDATEUI_OPENCUBE = 21; D2Client jump table 0x6fb0a520[0x15] -> 0x6fb48070). */
export const BUTTON_ACTION_OPEN_CUBE = 0x15

/** Largest 1.13c stat id: stat ids are 9 bits wide in the stat bitstream (ItemStatCost.txt). */
export const MAX_D2_STAT_ID = 0x1ff

/** 1.13c crossbow item codes (normal, exceptional, elite). */
export const CROSSBOW_ITEM_CODES = new Set([
  'lxb', 'mxb', 'hxb', 'rxb',
  '8lx', '8mx', '8hx', '8rx',
  '6lx', '6mx', '6hx', '6rx',
])

/**
 * Single-bolt linear projectile skills (1.13c Skills.txt srvmissile / cltmissilea).
 * Skills 2/4 (Throw / Left Hand Throw) are intentionally absent: their Skills.txt
 * missile columns are empty (srvdofunc 3/5) and the missile is picked from the
 * equipped throwing weapon — see `resolveThrowMissileKeyForCaster`.
 */
export const LINEAR_SKILL_MISSILES: Readonly<Record<number, { key: string; pierce?: boolean }>> =
  Object.freeze({
    6: { key: 'magicarrow' },
    7: { key: 'firearrow' },
    11: { key: 'coldarrow' },
    15: { key: 'poisonjav', pierce: true },
    16: { key: 'explodingarrow' },
    20: { key: 'lightningjavelin', pierce: true },
    21: { key: 'icearrow' },
    22: { key: 'guidedarrow' },
    25: { key: 'plaguejavelin' },
    27: { key: 'immolationarrow' },
    31: { key: 'freezingarrow' },
    35: { key: 'lightningfury', pierce: true },
    36: { key: 'firebolt' },
    39: { key: 'icebolt' },
    45: { key: 'iceblast' },
    47: { key: 'fireball' },
    49: { key: 'lightning', pierce: true },
    53: { key: 'chainlightning', pierce: true },
    55: { key: 'glacialspike' },
    84: { key: 'bonespear', pierce: true },
    93: { key: 'bonespirit' },
    101: { key: 'holybolt' },
  })

/** Radial ring skills (32 bolts in 360 degrees around caster). */
export const RADIAL_RING_SKILLS: Readonly<Record<number, string>> = Object.freeze({
  44: 'frostnova',
  48: 'nova',
  92: 'poisonnova',
})

/** Necromancer curse target overlays (1.13c Skills.txt / Overlay.txt). */
export const CURSE_TARGET_OVERLAYS: Readonly<Record<number, string>> = Object.freeze({
  66: 'curseamplifydamage',
  71: 'cursedimvision',
  72: 'curseweaken',
  76: 'curseironmaiden',
  77: 'curseterror',
  81: 'curseconfuse',
  82: 'cursereversevampire',
  86: 'curseattract',
  87: 'cursedecrepify',
  91: 'curselowerresist',
})

/** Set of all 10 Necromancer curse target overlay tokens for mutual-exclusion cleanup. */
export const ALL_CURSE_TARGET_OVERLAY_SET: ReadonlySet<string> = new Set(
  Object.values(CURSE_TARGET_OVERLAYS),
)

/** Necromancer curse client missiles (1.13c Skills.txt cltmissilea #181..#190). */
export const CURSE_CLT_MISSILE_A: Readonly<Record<number, string>> = Object.freeze({
  66: 'curseamplifydamage',
  71: 'cursedimvision',
  72: 'curseweaken',
  76: 'curseironmaiden',
  77: 'curseterror',
  81: 'curseconfuse',
  82: 'cursereversevampire',
  86: 'curseattract',
  87: 'cursedecrepify',
  91: 'curselowerresist',
})

/**
 * Computes the authentic 1.13c Skills.txt aurarangecalc in subtiles for all 10 Necromancer curses.
 */
export function getCurseRadiusSubtiles113c(skillId: number, slvl: number): number {
  const lvl = Math.max(1, slvl)
  switch (skillId) {
    case 66: // Amplify Damage: ln12 (par1=3, par2=1)
      return 3 + (lvl - 1)
    case 71: // Dim Vision: ln12 (par1=4, par2=1)
    case 82: // Life Tap: ln12 (par1=4, par2=1)
      return 4 + (lvl - 1)
    case 72: // Weaken: ln12 (par1=9, par2=1)
      return 9 + (lvl - 1)
    case 76: // Iron Maiden: fixed 7
      return 7
    case 77: // Terror: fixed 4
      return 4
    case 81: // Confuse: ln12 (par1=6, par2=1)
      return 6 + (lvl - 1)
    case 86: // Attract: 9 subtiles (6 yards) single-target search radius
      return 9
    case 87: // Decrepify: fixed 6
      return 6
    case 91: // Lower Resist: ln12 (par1=7, par2=1)
      return 7 + (lvl - 1)
    default:
      return 6
  }
}

/** Necromancer curse skill ID to 1.13c States.txt state ID mapping. */
export const CURSE_SKILL_STATES: Readonly<Record<number, number>> = Object.freeze({
  66: 9,  // Amplify Damage -> state 9 (curseamplifydamage)
  71: 23, // Dim Vision -> state 23 (cursedimvision)
  72: 19, // Weaken -> state 19 (curseweaken)
  76: 55, // Iron Maiden -> state 55 (curseironmaiden)
  77: 56, // Terror -> state 56 (curseterror)
  81: 59, // Confuse -> state 59 (curseconfuse)
  82: 58, // Life Tap -> state 58 (cursereversevampire)
  86: 57, // Attract -> state 57 (curseattract, cursetype 2)
  87: 60, // Decrepify -> state 60 (cursedecrepify)
  91: 61, // Lower Resist -> state 61 (curselowerresist)
})


/** All standard type-1 curse states in 1.13c States.txt (mutually exclusive). */
export const ALL_TYPE1_CURSE_STATES: readonly number[] = Object.freeze([
  9, 23, 19, 55, 56, 59, 58, 60, 61,
])

/** All 20 canonical Paladin aura skill ID to States.txt state ID mappings. */
export const PALADIN_AURA_SKILL_STATES: Readonly<Record<number, number>> = PALADIN_AURA_STATE_BY_SKILL_ID

export const ALL_PALADIN_AURA_STATES: readonly number[] = Object.freeze(
  Object.values(PALADIN_AURA_STATE_BY_SKILL_ID),
)

/** Canonical 1.13c self-buff skills that set an active state ID on the caster (States.txt). */
export const SELF_BUFF_SKILL_STATES: Readonly<Record<number, number>> = Object.freeze({
  40: 10, // Frozen Armor -> state 10 (FrozenArmor)
  46: 12, // Blaze -> state 12 (Blaze)
  50: 88, // Shiver Armor -> state 88 (ShiverArmor)
  52: 16, // Enchant -> state 16 (Enchant)
  57: 38, // Thunder Storm -> state 38 (Thunderstorm)
  58: 30, // Energy Shield -> state 30 (EnergyShield)
  60: 20, // Chilling Armor -> state 20 (ChillingArmor)
  68: 14, // Bone Armor -> state 14 (BoneArmor)
  ...PALADIN_AURA_STATE_BY_SKILL_ID,
  117: 101, // Holy Shield -> state 101 (HolyShield)
  138: 26, // Shout -> state 26
  144: 15, // Concentrate -> state 15
  147: 94, // Frenzy -> state 94
  149: 32, // Battle Orders -> state 32
  151: 174, // Whirlwind -> state 174
  152: 95, // Berserk -> state 95
  155: 51, // Battle Command -> state 51
  223: 139, // Werewolf -> state 139
  228: 140, // Werebear -> state 140
  232: 120, // Feral Rage -> state 120
  233: 117, // Maul -> state 117
  235: 151, // Cyclone Armor -> state 151
  249: 145, // Armageddon -> state 145
  250: 144, // Hurricane -> state 144
  258: 157, // Burst of Speed -> state 157
  267: 159, // Fade -> state 159
  277: 158, // Blade Shield -> state 158
  278: 31, // Venom -> state 31 (venomclaws)
})

export interface SpawnMissileOptions {
  readonly id?: number | undefined
  readonly classId?: number | undefined
  readonly ownerType?: UnitTypeName | undefined
  readonly ownerId?: number | undefined
  readonly sourceSkillId?: number | undefined
  readonly skillLevel?: number | undefined
  readonly pierce?: boolean | undefined
  readonly loopAnim?: boolean | undefined
  readonly maxTicks?: number | undefined
  readonly altitude?: number | undefined
  readonly verticalDescentPerTick?: number | undefined
  readonly direction?: number | undefined
  readonly initialFrame?: number | undefined
  readonly missileSeed?: D2Seed | undefined
  readonly jitterIndex?: number | undefined
  readonly emitterKind?: 'frozenorb' | 'meteor_controller' | 'blizzard_controller' | undefined
  readonly originX?: number | undefined
  readonly originY?: number | undefined
  readonly spiralAngle?: number | undefined
  readonly spiralRadius?: number | undefined
  readonly expandSubMissiles?: boolean | undefined
}

export class UnitMap extends Map<string, ClientUnit> {
  override get(key: string): ClientUnit | undefined {
    const direct = super.get(key)
    if (direct !== undefined) return direct
    const colonIdx = key.indexOf(':')
    if (colonIdx > 0) {
      const prefix = key.slice(0, colonIdx)
      const rest = key.slice(colonIdx + 1)
      const num = Number(prefix)
      if (Number.isInteger(num) && num >= 0 && num <= 5) {
        return super.get(`${unitTypeFromId(num as UnitType)}:${rest}`)
      }
    }
    return undefined
  }

  override has(key: string): boolean {
    if (super.has(key)) return true
    const colonIdx = key.indexOf(':')
    if (colonIdx > 0) {
      const prefix = key.slice(0, colonIdx)
      const rest = key.slice(colonIdx + 1)
      const num = Number(prefix)
      if (Number.isInteger(num) && num >= 0 && num <= 5) {
        return super.has(`${unitTypeFromId(num as UnitType)}:${rest}`)
      }
    }
    return false
  }
}

export function isMonsterOneShotMode(mode: number): boolean {
  return (
    mode === 3 ||
    mode === 4 ||
    mode === 5 ||
    mode === 6 ||
    mode === 7 ||
    mode === 8 ||
    mode === 9 ||
    mode === 10 ||
    mode === 11 ||
    mode === 13
  )
}

export function getMonsterOneShotDefaultFrames(mode: number): number {
  if (mode === 3) return 8
  if (mode === 8) return 24
  if (mode === 9) return 18
  return 15
}

/**
 * Overlay.txt indices that D2Client `0x6FB1B300` creates WITHOUT first removing the unit's existing overlay of the
 * same index (`0x6fb1b3ab`-`0x6fb1b3c5`: `0x8C..0x8E` bonearmor_cast/front/back and `0x9E` handofgod). For every
 * other index `0x6FB19660` removes the first existing overlay with that index before the new one is linked.
 */
export const OVERLAY_INDICES_NOT_REPLACED = new Set<number>([0x8c, 0x8d, 0x8e, 0x9e])

/**
 * 1.13c `Missiles.txt` moving missiles with `CollideType === 0` (`D2Client.dll` `0x6FB81340` /
 * `D2Game.dll` `0x6FD2A5B0`): ignore terrain/walls completely (`mask = 0x0000`).
 */
export const MISSILE_COLLIDE_TYPE_0_KEYS_113C = new Set<string>([
  'blood1',
  'blood2',
  'bigblood1',
  'bigblood2',
  'stuckarrow',
  'fistofares',
  'poisonpuff',
  'cursecast',
  'dust',
  'chillbloodpuff',
  'brdeathlightningbolt',
  'cairnstonesground',
  'towermist',
  'towermisttrail',
  'mephistofirewallmaker',
  'mephistoflyingrocksbig',
  'mephistoflyingrockssmall',
  'andyfirewallmaker',
  'horadriclightning',
  'taintedsunball',
  'queendeathglob',
  'durieldeathdebris',
  'orbmist',
  'orbmisttrail',
  'orbmistfade',
  'hffragment1',
  'hfspirit1',
  'izual mist loop',
  'explodingjavalinexp',
  'imp teleport',
  'vines',
  'plague vines',
  'volcano debris 2',
  'ancient death center',
  'ancient death cloud',
  'world stone chip 1',
  'world stone chip 2',
  'world stone chip 3',
  'world stone chip 4',
  'hurricaneswoosh',
  'hurricanecart',
  'hurricanerock',
  'hurricanesack',
  'hurricanetree',
  'hurricanevase',
  'eruptioncenter',
  'volcanobase',
  'armageddonrock',
  'armageddontail',
  'nehlithakswoosh',
  'nehlithakdebris1',
  'nehlithakdebris2',
  'nehlithakdebris3',
  'nehlithakdebris4',
  'volcanofiretrail',
  'baalfx spirit 1',
  'baalfx spirit 2',
  'baalfx spirit 3',
  'baalfx spirit 4',
  'baalfx spirit 5',
])

/**
 * 1.13c `Missiles.txt` moving missiles with `CollideType === 8` (`D2Client.dll` `0x6FB81340` /
 * `D2Game.dll` `0x6FD2A5B0`): floor-hugging missiles blocked by
 * `COLLIDE_WALL | COLLIDE_MISSILE_BARRIER | COLLIDE_DOOR` (`0x0805`).
 */
export const MISSILE_COLLIDE_TYPE_8_KEYS_113C = new Set<string>([
  'firewallmaker',
  'vampirefirewallmaker',
  'bonewallmaker',
  'moltenboulder',
  'moltenboulderemerge',
  'moltenboulderfirepath',
  'moltenboulder-flyingrocks',
  'moltenboulderflyingrocks',
  'firestormmaker',
  'firestorm',
  'wake of destruction maker',
  'fistsoffirefirewall',
  'royalstrikemeteorfire',
  'armageddonfire',
  'countessfirewallmaker',
  'diablogeddonfire',
])

export function getMissileCollideType113c(missileKey?: string): number {
  if (!missileKey) return 3
  const k = missileKey.toLowerCase()
  if (MISSILE_COLLIDE_TYPE_0_KEYS_113C.has(k)) return 0
  if (MISSILE_COLLIDE_TYPE_8_KEYS_113C.has(k)) return 8
  return 3
}

export type ClientWorldInternal = Record<string, any> & {
  _units: UnitMap
  _monsters: Map<number, ClientUnit>
  _containers: ClientInventoryManager
  ensureUnit(unitType: UnitType, id: number): ClientUnit
  ensureWorldOrGroundUnit(unitType: UnitType, id: number): ClientUnit | undefined
  getUnit(unitType: UnitType, id: number): ClientUnit | undefined
  resolveEventNowMs(nowMs?: number): number
  resolvePlayerActiveEquipment(unitId: number, isSelf: boolean): Iterable<ItemData> | undefined
}
