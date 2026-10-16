/**
 * Pure unit, monster, combat world, and character attribute type definitions.
 */

import type { CharacterClassCode } from './classes.ts'

export type MonsterRank = 'normal' | 'champion' | 'unique' | 'minion' | 'boss'

export type BaseStatKey = 'str' | 'dex' | 'vit' | 'ene'

export interface CharacterAttributes {
  classCode?: CharacterClassCode | undefined
  name: string
  classNameZh: string
  classNameEn: string
  level: number
  xp: number
  nextLevelXp: number
  str: number
  dex: number
  vit: number
  ene: number
  statPoints: number
  baseMaxHp: number
  baseMaxMana: number
  baseMaxStamina: number
  defense: number
  attackRating: number
  fireRes: number
  coldRes: number
  lightRes: number
  poisRes: number
}

/** Movement request and intent for one tick. */
export interface CombatInput {
  /** Normalized movement, screen axes (y grows downward). */
  readonly movement: { readonly x: number; readonly y: number }
  /** Whether the attack control is held this tick. */
  readonly attack: boolean
}

export interface CombatTerrain {
  readonly overlap: (x: number, y: number) => number
}

/** Tuning that is not per-monster. */
export interface CombatOptions {
  /** Player walk speed in pixels per second. */
  readonly playerSpeed: number
  /** Player melee reach in pixels. */
  readonly playerReach: number
  /** Ticks between player attacks. */
  readonly playerCooldownTicks: number
  /** Player damage per hit. */
  readonly playerDamage: number
  /** Mana spent per attack (0 disables the cost). */
  readonly playerManaPerAttack: number
  /** Ticks before a dead player is restored, at full resources. */
  readonly respawnTicks: number
  /** When true, monsters ignore aggro distance and remain standing still (idle). */
  readonly disableMonsterAggro?: boolean
  /** When true, world.events is preserved across ticks instead of cleared at tick start. */
  readonly preserveEvents?: boolean | undefined
}

/** One monster's immutable numbers, read from a table row. */
export interface MonsterStats {
  /** Identifier, as written in the table. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** Maximum health. */
  readonly hp: number
  /** Damage per hit. */
  readonly damage: number
  /** Ticks between attacks. */
  readonly cooldownTicks: number
  /** Reach in pixels. */
  readonly reach: number
  /** Distance at which the monster notices the player, in pixels. */
  readonly aggroRadius: number
  /** Speed in pixels per second. */
  readonly speed: number
  /** Experience awarded on death. */
  readonly xp: number
  /** Elite rank: normal, champion, unique, minion, or boss. */
  readonly rank?: MonsterRank
  /** Rolled elite/superunique modifiers from MonUMod.txt. */
  readonly modifiers?: readonly string[]
  /** SuperUnique identifier if this is a fixed SuperUnique boss (e.g. 'Bishibosh'). */
  readonly superUniqueId?: string
  /** Monster level for drops and scaling. */
  readonly level?: number
  /** Resistances per damage type (from MonStats.txt). */
  readonly resistances?: {
    readonly physical?: number
    readonly magic?: number
    readonly fire?: number
    readonly lightning?: number
    readonly cold?: number
    readonly poison?: number
  }
  /** Explicit lightning resistance percentage. */
  readonly lightningResist?: number
  /** Generic resists bag for compatibility. */
  readonly resists?: {
    readonly physical?: number
    readonly magic?: number
    readonly lightning?: number
    readonly fire?: number
    readonly cold?: number
    readonly poison?: number
    readonly [k: string]: number | undefined
  }
  /** Canonical `.tbl` key for monster name (`MonStats.txt` `NameStr` or `SuperUniques.txt` `Name`). */
  readonly nameKey?: string | undefined
  /** Canonical `.tbl` key for monster special ability subtext (`MonStats.txt` `DescStr`). */
  readonly descKey?: string | undefined
  /** True when `MonStats.txt` `lUndead` or `hUndead` is non-zero (`0x6FD62B50`). */
  readonly isUndead?: boolean | undefined
  /** True when `MonStats.txt` `demon` is non-zero (`0x6FD62BA0`). */
  readonly isDemon?: boolean | undefined
  /** True when `MonStats.txt` `boss` is non-zero. */
  readonly isBoss?: boolean | undefined
  /** True when `MonStats.txt` `killable` is non-zero. */
  readonly killable?: boolean | undefined
  /** True when `MonStats.txt` `inTown` is non-zero. */
  readonly inTown?: boolean | undefined
}

export interface MonsterCurseState {
  name: string
  slvl: number
  curseType: number
  ticksRemaining: number
  overlayName?: string | undefined
  casterX?: number | undefined
  casterY?: number | undefined
  fleeTarget?: { x: number; y: number } | undefined
  returnPct?: number | undefined
}

/** One monster's mutable state. */
export interface Monster {
  /** Stable index, for events and debugging. */
  readonly index: number
  /** Its table numbers. */
  readonly stats: MonsterStats
  /** World x. */
  x: number
  /** World y. */
  y: number
  /** Current health. */
  hp: number
  /** Ticks until it may attack again. */
  cooldown: number
  /** What it is doing. */
  state: 'idle' | 'chase' | 'attack' | 'dead'
  /** Facing (0 = south, turning west), for the renderer. */
  facing: number
  /** Ticks left of the hit flash, for the renderer. */
  hitFlash: number
  /** Ticks left of the death animation. */
  corpseTicks: number
  /** Whether the monster is sleeping (inactive off-screen room). */
  sleeping?: boolean | undefined
  /** Ticks remaining frozen (cannot move or attack). */
  frozenTicks?: number | undefined
  /** Ticks remaining chilled (slowed movement). */
  chillTicks?: number | undefined
  /** Ticks remaining poisoned (damage over time). */
  poisonTicks?: number | undefined
  /** Ticks remaining stunned (e.g. Twister 10f stun). */
  stunTicks?: number | undefined
  /** Active Necromancer curse debuff state. */
  curse?: MonsterCurseState | undefined
  /** Whether drops have already been rolled for this monster instance. */
  dropRolled?: boolean | undefined
  /** Authentic animation mode ('dt' during death sequence, 'dd' once dead/corpse). */
  animMode?: 'dt' | 'dd' | string | undefined
  /** Remaining ticks of death animation before drop triggers (for headless/simulated drops). */
  deathTicks?: number | undefined
  /** Explicit flag indicating drop execution is gated on death animation completion. */
  deathGated?: boolean | undefined
  /** Queued pending drop data prepared upon lethal hit, awaiting DT sequence completion. */
  pendingDrop?: any | undefined
  /** Deterministic per-unit seed derived from world/level seed and spawn index (D2 1.13c pUnit->dwInitSeed). */
  dwInitSeed?: number | undefined
  /** Rendered world-space sprite bounding box for mouse hover/click hit-testing (`D2Client.dll` `0x6FB01A80`). */
  drawBounds?: { x: number; y: number; w: number; h: number } | undefined
  /** True when corpse is suppressed on death (freeze shatter, Bone Fetish explosion, Suicide Minion). */
  corpseSuppressed?: boolean | undefined
}

/** The player's combat-relevant state. */
export interface CombatPlayer {
  /** World x. */
  x: number
  /** World y. */
  y: number
  /** Current health. */
  hp: number
  /** Maximum health. */
  maxHp: number
  /** Current mana. */
  mana: number
  /** Maximum mana. */
  maxMana: number
  /** Character level. */
  level: number
  /** Experience accumulated. */
  xp: number
  /** Ticks until the next attack. */
  cooldown: number
  /** Facing (0 = south, turning west). */
  facing: number
  /** Whether the player is alive. */
  alive: boolean
  /** Ticks left until respawn while dead. */
  respawnIn: number
  /** Ticks left of the swing animation, for the renderer. */
  swingTicks: number
  /** Thunder Storm active remaining ticks. */
  thunderstormTicks?: number
  thunderstormInterval?: number
  thunderstormNextStrike?: number
  thunderstormDamage?: number
  thunderstormDamageRange?: { readonly min: number; readonly max: number } | undefined
  thunderstormSlvl?: number
  /** Energy Shield active remaining ticks. */
  energyshieldTicks?: number
  energyshieldPct?: number
  energyshieldSlvl?: number
  /** Cold Armor active remaining ticks and type ('frozenarmor' | 'shiverarmor' | 'chillingarmor'). */
  coldArmorType?: 'frozenarmor' | 'shiverarmor' | 'chillingarmor' | undefined
  coldArmorTicks?: number | undefined
  coldArmorSlvl?: number | undefined
  /** Blaze active remaining ticks and patch config. */
  blazeTicks?: number | undefined
  blazeSlvl?: number | undefined
  blazeDamage?: number | undefined
  blazePatchDuration?: number | undefined
  lastBlazeX?: number | undefined
  lastBlazeY?: number | undefined
  /** Inferno continuous channeling state and sub-mana fractional accumulator (256ths). */
  infernoChanneling?: boolean | undefined
  infernoManaRemainder256?: number | undefined
  /** Enchant active remaining ticks, added fire damage, and attack rating % bonus. */
  enchantTicks?: number | undefined
  enchantDamage?: { min: number; max: number } | undefined
  enchantAttackRatingPercent?: number | undefined
  fireMasterySlvl?: number | undefined
  isSorceress?: boolean | undefined
  isRanged?: boolean | undefined
  /** Canonical character class code ('ama' | 'sor' | 'nec' | 'pal' | 'bar' | 'dru' | 'ass'). */
  classCode?: CharacterClassCode | undefined
  /** Canonical primary attributes. */
  str?: number | undefined
  dex?: number | undefined
  vit?: number | undefined
  ene?: number | undefined
  strength?: number | undefined
  dexterity?: number | undefined
  vitality?: number | undefined
  energy?: number | undefined
  experience?: number | undefined
  nextLevelExp?: number | undefined
  /** Unallocated stat and skill points. */
  statPoints?: number | undefined
  skillPoints?: number | undefined
  /** Stamina and running state. */
  stamina?: number | undefined
  maxStamina?: number | undefined
  isRunning?: boolean | undefined
  /** Sub-mana fractional accumulator in 256ths for 1.13c mana regeneration. */
  manaRemainder256?: number | undefined
  /** Over-time healing/mana potion and resistance potion timers. */
  hpRegenTicksRemaining?: number | undefined
  hpRegenRatePerTick?: number | undefined
  manaRegenTicksRemaining?: number | undefined
  manaRegenRatePerTick?: number | undefined
  coldResistBonusTicks?: number | undefined
  poisonResistBonusTicks?: number | undefined
  /** Druid form ('human' | 'wolf' | 'bear') and Elemental active states (#235 Cyclone Armor, #249 Armageddon, #250 Hurricane). */
  druidForm?: 'human' | 'wolf' | 'bear' | undefined
  cycloneArmorHp?: number | undefined
  cycloneArmorMaxHp?: number | undefined
  cycloneArmorSlvl?: number | undefined
  armageddonTicks?: number | undefined
  armageddonDamage?: number | undefined
  armageddonResidualDamage?: number | undefined
  armageddonSlvl?: number | undefined
  hurricaneTicks?: number | undefined
  hurricaneDamage?: number | undefined
  hurricaneSlvl?: number | undefined
}

/** Something worth telling the player (and the renderer) about. */
export interface CombatEvent {
  /** Event kind. */
  readonly kind:
    | 'playerHit'
    | 'monsterHit'
    | 'kill'
    | 'levelUp'
    | 'playerDeath'
    | 'respawn'
    | 'noMana'
    | 'missileHit'
    | 'missileExplode'
    | 'unitSkillEvent'
    | 'unitOverlay'
  /** World x the event happened at. */
  readonly x: number
  /** World y the event happened at. */
  readonly y: number
  /** Magnitude (damage), when meaningful. */
  readonly amount?: number
  /** Text to float above the point, when meaningful. */
  readonly text?: string
  /** Subject identity (a monster's table id on a kill, for quest counters). */
  readonly subjectId?: string
  /** Stable monster index for kill and hit events. */
  readonly monsterIndex?: number | undefined
  /** Monster level when event is 'kill'. */
  readonly monsterLevel?: number | undefined
  /** Monster rank when event is 'kill'. */
  readonly monsterRank?: MonsterRank | undefined
  /** Monster type code (1=normal, 2=champion, 3=unique, 4=boss). */
  readonly monsterType?: number | undefined
  /** SuperUnique ID if applicable. */
  readonly superUniqueId?: string | undefined
  /** Missile type identifier if applicable (e.g. 'firebolt', 'fireexplode'). */
  readonly missileType?: string | undefined
  /** Source skill ID if applicable. */
  readonly skillId?: string | undefined
  /** S2C 0xA3 24-byte packet emitted for unitSkillEvent (D2Game 0x6fc9a190 + 0x6fcaba90). */
  readonly packet0xA3?: Uint8Array | undefined
  /** Decoded UnitSkillEvent payload for S2C 0xA3. */
  readonly unitSkillEvent?: {
    readonly type: 'UnitSkillEvent'
    readonly flag: number
    readonly skill: number
    readonly level: number
    readonly caster: { readonly rawUnitType: number; readonly id: number }
    readonly target: { readonly rawUnitType: number; readonly id: number }
    readonly x: number
    readonly y: number
  } | undefined
  /** Overlay.txt token name when kind === 'unitOverlay' (e.g. 'frozenarmor_hit', 'shiverarmor_hit', 'energyshieldhit3'). */
  readonly overlayToken?: string | undefined
  /** Overlay.txt row index when kind === 'unitOverlay' (e.g. 42, 43, 87..94). */
  readonly overlayIndex?: number | undefined
  /** Target raw unit type for S2C 0x11 UnitOverlay (0=player, 1=monster). */
  readonly targetUnitType?: number | undefined
  /** Target unit GUID for S2C 0x11 UnitOverlay. */
  readonly targetUnitId?: number | undefined
  /** S2C 0x11 8-byte packet emitted for unitOverlay (D2Game STAT_UNIT_DOOVERLAY). */
  readonly packet0x11?: Uint8Array | undefined
  /** Decoded UnitOverlay payload for S2C 0x11. */
  readonly unitOverlay?: {
    readonly type: 'UnitOverlay'
    readonly rawUnitType: number
    readonly id: number
    readonly overlayIndex: number
  } | undefined
}

/** The whole simulation state. */
export interface CombatWorld {
  player: CombatPlayer
  players: CombatPlayer[]
  monsters: Monster[]
  tick: number
  events: CombatEvent[]
  pendingKills?: CombatEvent[] | undefined
  kills: number
  level?: number | undefined
  xp?: number | undefined
}

/** A circular exclusion zone where ordinary monster camps must not spawn. */
export interface SafeZone {
  readonly x: number
  readonly y: number
  readonly radius: number
}

/** A group of monsters that belongs together on the ground. */
export interface MonsterPack {
  readonly members: readonly MonsterStats[]
  readonly fixedPosition?: { readonly x: number; readonly y: number }
  readonly landmarkTile?: { readonly tileX: number; readonly tileY: number }
  readonly superUniqueId?: string
}

import type { NpcDef } from '../world/npc.ts'
import { totalStat } from '../items/items.ts'

export interface AnimClipMeta {
  readonly group: number
  readonly directions?: number
  readonly frames: number
  readonly speed: number
  readonly loop: boolean
  readonly events: readonly { readonly f: number; readonly c: number }[]
}

export interface ActorAnimatorLike {
  readonly mode: string | null
  readonly clip: AnimClipMeta | null
  readonly frameIndex: number
  readonly finished: boolean
  setLoop(mode: string, clip: AnimClipMeta): void
  triggerOneShot(mode: string, clip: AnimClipMeta): void
  play(mode: string, clip: AnimClipMeta, options?: { readonly restart?: boolean }): void
  tick(): readonly { readonly frame: number; readonly code: number }[]
}

export interface ActiveExplosion {
  readonly x: number
  readonly y: number
  readonly missileType: string
  frame: number
  readonly maxFrames: number
  readonly radius?: number | undefined
  readonly isSmoke?: boolean | undefined
  readonly tint?: 'fire' | 'cold' | 'lightning' | 'poison' | 'magic' | undefined
}

export interface NpcSpriteFrame {
  readonly width: number
  readonly height: number
  readonly offsetX: number
  readonly offsetY: number
}

export interface NpcEntity {
  def: NpcDef
  x: number
  y: number
  hasSprite: boolean
  frame?: NpcSpriteFrame | null | undefined
}

export interface EngineViewState {
  monstersSpawned?: number
  monstersAlive?: number
  kills?: number
  playerHp?: number
  playerMaxHp?: number
  playerMana?: number
  playerMaxMana?: number
  playerLevel?: number
  playerXp?: number
  playerHits?: number
  groundItems?: number
  inventoryItems?: number
  cellsUsed?: number
  cellsTotal?: number
  gold?: number
  defense?: number
  dropsRolled?: number
  pickups?: number
  inventoryRefusals?: number
  lastDrops?: string[]
  skills?: string[]
  selectedSkill?: number
  casts?: number
  castRefusals?: number
  castHits?: number
  projectilesAlive?: number
  npcs?: number
  npcsNear?: NpcEntity[]
  monstersNear?: unknown[]
  quests?: unknown[]
  dialog?: string[]
  questXp?: number
  questGold?: number
  worldTick?: number
  saves?: number
  loads?: number
  saveError?: string | null
  tick?: number
  x?: number
  y?: number
  bagItems?: number
  gamePlayers?: number
  partyPlayers?: number
}

export function syncEngineState(engine: any, state: EngineViewState): void {
  state.monstersSpawned = engine.world.monsters.length
  state.monstersAlive = engine.world.monsters.filter((m: any) => m.state !== 'dead').length
  state.kills = engine.world.kills
  state.playerHp = engine.world.player.hp
  state.playerMaxHp = engine.world.player.maxHp
  state.playerMana = engine.world.player.mana
  state.playerMaxMana = engine.world.player.maxMana
  state.playerLevel = engine.world.player.level
  state.playerXp = engine.world.player.xp
  state.playerHits = engine.metrics.playerHits
  state.groundItems = engine.ground.length
  state.inventoryItems = engine.bag.contents.length
  state.cellsUsed = engine.bag.usedCells
  state.cellsTotal = engine.bag.width * engine.bag.height
  state.gold = engine.bag.gold
  state.defense = totalStat(engine.bag.contents, 'defense')
  state.dropsRolled = engine.metrics.dropsRolled
  state.pickups = engine.metrics.pickups
  state.inventoryRefusals = engine.metrics.inventoryRefusals
  state.lastDrops = [...engine.metrics.lastDrops]
  state.skills = engine.opts.skills.map((s: any) => s.name)
  state.selectedSkill = engine.selectedSkill
  state.casts = engine.metrics.casts
  state.castRefusals = engine.metrics.castRefusals
  state.castHits = engine.metrics.castHits
  state.projectilesAlive = engine.projectiles.length
  state.npcs = engine.npcEntities.length
  state.npcsNear = engine.npcEntities.filter((n: any) => Math.hypot(n.x - engine.world.player.x, n.y - engine.world.player.y) <= 800)
  state.monstersNear = engine.world.monsters.filter((m: any) => Math.hypot(m.x - engine.world.player.x, m.y - engine.world.player.y) <= 800)
  state.quests = engine.questLog.active.map((q: any) => q.def.name)
  state.dialog = engine.dialog
  state.questXp = engine.metrics.questXp
  state.questGold = engine.metrics.questGold
  state.worldTick = engine.world.tick
  state.saves = engine.metrics.saves
  state.loads = engine.metrics.loads
  state.saveError = engine.metrics.saveError
  state.tick = engine.world.tick
  state.x = engine.world.player.x
  state.y = engine.world.player.y
  state.bagItems = engine.bag.contents.length
  state.gamePlayers = engine.gamePlayers
  state.partyPlayers = engine.partyPlayers
}

export type SceneEngineLike = any
