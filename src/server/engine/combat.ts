/**
 * Combat sandbox: monsters, melee, resources and experience, at the game's tick
 * rate.
 *
 * The module is deliberately free of rendering and input concerns. It advances
 * one 25 Hz tick at a time from a small input record and a collision predicate,
 * which is what allows the whole system to be simulated headlessly in a test —
 * combat that can only be verified by looking at the screen is combat that will
 * be broken most of the time.
 *
 * Numbers come from data tables (see `tables.ts`), never from constants baked
 * into the AI: a monster's health, damage, speed and aggro range are its table
 * row, so swapping in the real `MonStats.txt` changes behaviour without touching
 * code.
 *
 * What this is *not*: it is not Diablo II's combat model. Real damage involves
 * attack rating versus defence, hit recovery, block, resistances, elemental
 * damage and per-skill formulas. This is the skeleton those formulas plug into —
 * the states, cooldowns, resource pools and event stream are the parts that need
 * to exist first, and they are the parts whose shape is independent of the exact
 * arithmetic.
 */
import { numberCell, textCell } from '../../common/items/tables.ts'
import type { DataTable } from '../../common/items/tables.ts'
import {
  allocatePacksToRooms,
  partitionMapIntoRooms,
  spawnMonsterPacksByRooms,
  spawnPacksInRoom,
  PACK_RADIUS_PX,
} from '../../common/units/monster-rooms.ts'
import type { MapRoom } from '../../common/units/monster-rooms.ts'
import {
  calculateFrozenArmorFreezeLength,
  calculateShiverArmorDamage,
  calculateShiverArmorChillLength,
  calculateChillingArmorDamage,
  calculateChillingArmorChillLength,
  calculateEnchantDamage,
  calculateEnchantAttackRating,
  calculateEnchantDuration,
  calculateFireMasteryBonus,
  calculateEnchantAttackDamage,
} from './missile-engine.ts'
import { computeEffectiveResistance } from './combat-pipeline.ts'
import type { MonsterRank } from '../../common/units/monsters-data.ts'
import { CANONICAL_CHARSTATS, type CharacterClassCode } from '../../common/units/classes.ts'
import {
  MON_UMOD,
  hasMonsterUMod,
  isBoneFetishMonster,
  isSuicideMinionMonster,
} from '../../common/units/monster-death-fx.ts'
import {
  calculateDodgeStats,
  calculateAvoidStats,
  calculateEvadeStats,
  calculateCriticalStrikeStats,
  calculatePenetrateStats,
} from '../../common/skills/amazon-passive.ts'

export {
  allocatePacksToRooms,
  partitionMapIntoRooms,
  spawnMonsterPacksByRooms,
  spawnPacksInRoom,
  type MapRoom,
  calculateEnchantDamage,
  calculateEnchantAttackRating,
  calculateEnchantDuration,
  calculateFireMasteryBonus,
  calculateEnchantAttackDamage,
  CANONICAL_CHARSTATS,
  type CharacterClassCode,
}


/** Movement request and intent for one tick. */
export interface CombatInput {
  /** Normalized movement, screen axes (y grows downward). */
  readonly movement: { readonly x: number; readonly y: number }
  /** Whether the attack control is held this tick. */
  readonly attack: boolean
}

/**
 * What the simulation needs from the world it moves in.
 *
 * The predicate reports *how many* solid sub-tiles a position overlaps rather
 * than a yes/no, because movement needs the count: a body that is already
 * overlapping something (a bad spawn, a tile that turned solid under it) must
 * still be able to walk out, and the rule that allows it is "never make the
 * overlap worse". A boolean cannot express that, and a body stuck forever is a
 * far worse failure than one that briefly clips a corner.
 */
export interface CombatTerrain {
  /**
   * Count solid sub-tiles overlapping a body position.
   *
   * @param x - body centre x.
   * @param y - body centre y.
   * @returns the overlap count (0 = clear ground).
   */
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
  /** Active Inner Sight (#8) remaining ticks and flat defense reduction. */
  innerSightTicks?: number | undefined
  innerSightDefReduction?: number | undefined
  /** Active Slow Missiles (#17) remaining ticks and projectile velocity multiplier (0.33). */
  slowMissilesTicks?: number | undefined
  slowMissilesMult?: number | undefined
  /** Light radius bonus applied by Inner Sight (#8) or Slow Missiles (#17). */
  lightRadiusBonus?: number | undefined
  /** Optional monster defense value for hit-chance calculations. */
  defense?: number | undefined
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
  /** Amazon passive skill levels when active in CombatWorld. */
  dodgeSlvl?: number | undefined
  avoidSlvl?: number | undefined
  evadeSlvl?: number | undefined
  criticalStrikeSlvl?: number | undefined
  penetrateSlvl?: number | undefined
  /** Optional deterministic roll override (0-99) for avoidance/crit testing. */
  passiveRollOverride?: number | undefined
  /** Whether the player moved during the current tick (for Evade vs Dodge/Avoid selection). */
  isMovingThisTick?: boolean | undefined
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
}

/** The whole simulation state. */
export interface CombatWorld {
  /**
   * The local player, for the single-player scene and every existing caller.
   *
   * In a networked game this is one of {@link CombatWorld.players}, and which one
   * is a *view* decision: the simulation must not depend on it, which is why the
   * state digest covers `players` in peer order and never this field.
   *
   * **Invariant:** this object is the same object as one entry of `players`. A
   * world assembled by copying fields — a save being loaded, a snapshot being
   * restored — breaks that unless {@link rebindPlayer} is called, and the symptom
   * is a world that simulates one body while the screen draws another.
   */
  player: CombatPlayer
  /**
   * Every player in the world, in peer order, index 0 first.
   *
   * Monsters pick the nearest living entry, so two peers whose worlds hold the
   * same players in the same order see the same monsters make the same choices.
   */
  players: CombatPlayer[]
  /** Every monster, dead ones included until their corpse timer expires. */
  monsters: Monster[]
  /** Ticks simulated. */
  tick: number
  /** Events produced during the last tick (cleared each tick). */
  events: CombatEvent[]
  /** Kill events pending drop resolution. */
  pendingKills?: CombatEvent[] | undefined
  /** Monsters killed. */
  kills: number
  /** Optional world-mirrored player level and xp. */
  level?: number | undefined
  xp?: number | undefined
}

/** Defaults that keep the sandbox playable when a table is thin. */
const DEFAULTS = {
  hp: 20,
  damage: 3,
  cooldownTicks: 25,
  reach: 40,
  aggroRadius: 220,
  speed: 90,
  xp: 10,
} as const

/**
 * Read one monster's numbers from a table row.
 *
 * @param row - the record.
 * @param rowIndex - row position, used to build a fallback id.
 * @returns the stats.
 */
export function monsterStatsFromRow(row: Readonly<Record<string, string>>, rowIndex: number): MonsterStats {
  const ltngRaw = row['ResLi'] ?? row['ResistLightning'] ?? row['ResLi(N)'] ?? row['ResLi(H)']
  const ltngRes = ltngRaw !== undefined && ltngRaw.trim() !== '' ? Number(ltngRaw) : undefined
  return {
    id: textCell(row, 'Id', `monster${String(rowIndex)}`),
    name: textCell(row, 'Name', textCell(row, 'Id', `Monster ${String(rowIndex)}`)),
    hp: numberCell(row, 'HP', DEFAULTS.hp),
    damage: numberCell(row, 'Damage', DEFAULTS.damage),
    cooldownTicks: numberCell(row, 'CooldownTicks', DEFAULTS.cooldownTicks),
    reach: numberCell(row, 'Reach', DEFAULTS.reach),
    aggroRadius: numberCell(row, 'AggroRadius', DEFAULTS.aggroRadius),
    speed: numberCell(row, 'Speed', DEFAULTS.speed),
    xp: numberCell(row, 'XP', DEFAULTS.xp),
    ...(ltngRes !== undefined ? { lightningResist: ltngRes, resists: { lightning: ltngRes }, resistances: { lightning: ltngRes } } : {}),
  }
}

/**
 * Read every monster definition in a table.
 *
 * @param table - a `MonStats`-shaped table.
 * @returns the definitions.
 */
export function monsterStatsFromTable(table: DataTable): MonsterStats[] {
  return table.rows.map((row, index) => monsterStatsFromRow(row, index))
}

/**
 * Read the experience required per level.
 *
 * @param table - an `Experience`-shaped table with a `Level` and an `XP` column.
 * @returns required cumulative experience by level, index 1 = level 1.
 */
export function experienceTable(table: DataTable): number[] {
  const levels: number[] = [0, 0]
  for (const row of table.rows) {
    const level = numberCell(row, 'Level', 0)
    if (level < 1) continue
    levels[level] = numberCell(row, 'XP', 0)
  }
  for (let level = 2; level < levels.length; level += 1) {
    levels[level] = Math.max(levels[level] ?? 0, levels[level - 1] ?? 0)
  }
  return levels
}

const DEFAULT_XP_TABLE: readonly number[] = [
  0, 0, 500, 1500, 3750, 7875, 14175, 22680, 32886, 44396, 57715, 72144, 90180,
]

/**
 * Compute character level for a cumulative XP total against an experience table.
 */
export function levelForXp(xp: number, xpTable: readonly number[] = DEFAULT_XP_TABLE): number {
  if (!xpTable || xpTable.length === 0) return 1
  const oneIndexed = xpTable.length > 2 && (xpTable[1] ?? 0) === 0
  let level = 1
  if (oneIndexed) {
    for (let i = 2; i < xpTable.length; i += 1) {
      if (xp >= (xpTable[i] ?? Number.POSITIVE_INFINITY)) level = i
      else break
    }
  } else {
    for (let i = 1; i < xpTable.length; i += 1) {
      if (xp >= (xpTable[i] ?? Number.POSITIVE_INFINITY)) level = i + 1
      else break
    }
  }
  return level
}

/**
 * Create a world with a player at a position.
 *
 * @param x - player x.
 * @param y - player y.
 * @param maxHp - starting maximum health.
 * @param maxMana - starting maximum mana.
 * @returns the world.
 */
export function createWorld(
  x: number,
  y: number,
  maxHp?: number,
  maxMana?: number,
  classCode?: CharacterClassCode,
): CombatWorld {
  const player = createPlayer(x, y, maxHp, maxMana, classCode)
  return {
    player,
    players: [player],
    monsters: [],
    tick: 0,
    events: [],
    pendingKills: [],
    kills: 0,
  }
}

/**
 * Create one player body.
 *
 * @param x - x.
 * @param y - y.
 * @param maxHp - starting maximum health.
 * @param maxMana - starting maximum mana.
 * @param classCode - optional character class code (defaults to 'sor').
 * @returns the player.
 */
export function createPlayer(
  x: number,
  y: number,
  maxHp?: number,
  maxMana?: number,
  classCode?: CharacterClassCode,
): CombatPlayer {
  const resolvedClass: CharacterClassCode = classCode ?? 'sor'
  const cStats = CANONICAL_CHARSTATS[resolvedClass]
  const resolvedMaxHp = maxHp ?? cStats.baseVitals.life
  const resolvedMaxMana = maxMana ?? cStats.baseVitals.mana
  const resolvedMaxStamina = cStats.baseVitals.stamina
  const p: CombatPlayer = {
    x,
    y,
    hp: resolvedMaxHp,
    maxHp: resolvedMaxHp,
    mana: resolvedMaxMana,
    maxMana: resolvedMaxMana,
    level: 1,
    xp: 0,
    cooldown: 0,
    facing: 0,
    alive: true,
    respawnIn: 0,
    swingTicks: 0,
    classCode: resolvedClass,
    str: cStats.baseAttributes.strength,
    dex: cStats.baseAttributes.dexterity,
    vit: cStats.baseAttributes.vitality,
    ene: cStats.baseAttributes.energy,
    statPoints: 0,
    skillPoints: 0,
    stamina: resolvedMaxStamina,
    maxStamina: resolvedMaxStamina,
    isRunning: true,
    manaRemainder256: 0,
  }
  Object.defineProperties(p, {
    strength: {
      get() { return p.str ?? cStats.baseAttributes.strength },
      set(v: number) { p.str = v },
      enumerable: false,
      configurable: true,
    },
    dexterity: {
      get() { return p.dex ?? cStats.baseAttributes.dexterity },
      set(v: number) { p.dex = v },
      enumerable: false,
      configurable: true,
    },
    vitality: {
      get() { return p.vit ?? cStats.baseAttributes.vitality },
      set(v: number) { p.vit = v },
      enumerable: false,
      configurable: true,
    },
    energy: {
      get() { return p.ene ?? cStats.baseAttributes.energy },
      set(v: number) { p.ene = v },
      enumerable: false,
      configurable: true,
    },
    experience: {
      get() { return p.xp },
      set(v: number) { p.xp = v },
      enumerable: false,
      configurable: true,
    },
    nextLevelExp: {
      get() { return DEFAULT_XP_TABLE[Math.min(p.level + 1, DEFAULT_XP_TABLE.length - 1)] ?? 500 },
      set(_v: number) {},
      enumerable: false,
      configurable: true,
    },
  })
  return p
}

/**
 * Re-establish the invariant that the local player is in the player list.
 *
 * The combat tick drives `players` while the scene and the renderer read
 * `player`; a world built by spreading one object over another ends up with a
 * fresh `player` and the *previous* `players` array, so those two would drift
 * apart on the next tick. A loaded save is a single-player world by definition,
 * so the list becomes exactly this one player.
 *
 * @param world - the world to repair (mutated in place).
 * @returns the same world.
 */
export function rebindPlayer(world: CombatWorld): CombatWorld {
  world.players = [world.player]
  return world
}

/**
 * The player a monster should go for: the nearest of this tick's targets.
 *
 * Nearest rather than "player 0" because a monster that ignores the peer standing
 * on top of it reads as broken, and because the choice has to be a pure function
 * of the world for two peers to agree.
 *
 * @param monster - the monster choosing.
 * @param targets - the players it may attack.
 * @returns the target, or null when there is none.
 */
function nearestTarget(monster: Monster, targets: readonly CombatPlayer[]): CombatPlayer | null {
  let best: CombatPlayer | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of targets) {
    const distance = Math.hypot(candidate.x - monster.x, candidate.y - monster.y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

/**
 * Place monsters around a point, skipping unwalkable spots.
 *
 * Spawns are rejected rather than nudged: dropping a monster into a wall because
 * nothing better was found is how units end up permanently stuck, and the caller
 * can see the shortfall in the return value.
 *
 * @param world - the world to populate.
 * @param stats - the definitions to spawn from.
 * @param count - how many to spawn.
 * @param around - spawn centre.
 * @param spread - spawn radius in pixels.
 * @param terrain - collision predicate.
 * @returns how many were actually placed.
 */
export function spawnMonsters(
  world: CombatWorld,
  stats: readonly MonsterStats[],
  count: number,
  around: { readonly x: number; readonly y: number },
  spread: number,
  terrain: CombatTerrain,
  seed = 0x6ac690c5,
): number {
  if (stats.length === 0) return 0
  let placed = 0
  let attempt = 0
  while (placed < count && attempt < count * 24) {
    attempt += 1
    // A deterministic spiral keeps spawns reproducible, which is what makes a
    // failing test repeatable.
    const angle = attempt * 2.399963
    const radius = spread * Math.sqrt(attempt / (count * 24))
    const x = around.x + Math.cos(angle) * radius
    const y = around.y + Math.sin(angle) * radius
    if (terrain.overlap(x, y) > 0) continue
    const definition = stats[placed % stats.length]!
    const idx = world.monsters.length
    world.monsters.push({
      index: idx,
      stats: definition,
      x, y,
      hp: definition.hp,
      cooldown: 0,
      state: 'idle',
      facing: 0,
      hitFlash: 0,
      corpseTicks: 0,
      dwInitSeed: (((seed ^ Math.imul(idx + 1, 0x9e3779b9)) >>> 0) || 1),
    })
    placed += 1
  }
  return placed
}

/** A circular exclusion zone where ordinary monster camps must not spawn. */
export interface SafeZone {
  readonly x: number
  readonly y: number
  readonly radius: number
}

/** A group of monsters that belongs together on the ground. */
export interface MonsterPack {
  /**
   * The members, already rolled — one entry per monster.
   *
   * A pack is a list rather than a definition plus a count because members are
   * not interchangeable: health is rolled per monster, and a unique's pack has
   * a stronger leader followed by its minions.
   */
  readonly members: readonly MonsterStats[]
  /** Fixed world pixel coordinates for landmark-bound SuperUnique packs. */
  readonly fixedPosition?: { readonly x: number; readonly y: number }
  /** Landmark tile coordinates (tileX, tileY) if pixel coordinates are resolved at scene load. */
  readonly landmarkTile?: { readonly tileX: number; readonly tileY: number }
  /** SuperUnique boss identifier if this pack belongs to a fixed SuperUnique. */
  readonly superUniqueId?: string
}



function isInsideSafeZone(x: number, y: number, safeZones: readonly SafeZone[] | undefined): boolean {
  if (safeZones === undefined || safeZones.length === 0) return false
  for (const sz of safeZones) {
    if (Math.hypot(x - sz.x, y - sz.y) < sz.radius) return true
  }
  return false
}

/**
 * Place packs, keeping each pack's members together.
 *
 * {@link spawnMonsters} scatters its monsters on a golden-angle spiral, which
 * is the right shape for spreading *unrelated* things evenly and exactly the
 * wrong one for a Fallen camp: consecutive spiral points are deliberately far
 * apart, so a pack placed that way arrives as a field of loners. Here the
 * spiral places the *camps*, and members are clustered inside their own camp.
 *
 * Both loops reject blocked ground rather than nudging, for the same reason
 * {@link spawnMonsters} does: a monster shoved into a wall is stuck forever.
 * A camp that cannot fit its whole pack keeps whichever members found room, so
 * the caller can see the shortfall in the return value.
 *
 * @param world - the world to populate.
 * @param packs - the packs to place, in order.
 * @param around - the centre to spread camps around.
 * @param spread - how far camps may be from that centre, in pixels.
 * @param terrain - collision predicate.
 * @param safeZones - optional safe zones (spawn point, town bridge, waypoints) to exclude ordinary packs from.
 * @returns how many monsters were actually placed.
 */
export function spawnMonsterPacks(
  world: CombatWorld,
  packs: readonly MonsterPack[],
  around: { readonly x: number; readonly y: number },
  spread: number,
  terrain: CombatTerrain,
  safeZones?: readonly SafeZone[],
  rooms?: readonly MapRoom[],
  seed = 0x6ac690c5,
): number {
  if (rooms !== undefined && rooms.length > 0) {
    const count = spawnMonsterPacksByRooms(world, packs, rooms, terrain, safeZones !== undefined ? { safeZones } : undefined)
    for (const m of world.monsters) {
      if (m.dwInitSeed === undefined) {
        m.dwInitSeed = (((seed ^ Math.imul(m.index + 1, 0x9e3779b9)) >>> 0) || 1)
      }
    }
    return count
  }
  if (packs.length === 0) return 0
  let placed = 0
  let campIndex = 0
  let attempt = 0
  const attemptLimit = packs.length * 32
  while (campIndex < packs.length && attempt < attemptLimit) {
    const pack = packs[campIndex]!
    let campX: number
    let campY: number
    let angle: number

    if (pack.fixedPosition !== undefined) {
      // Fixed landmark SuperUnique pack: anchor camp center to the landmark position.
      campX = pack.fixedPosition.x
      campY = pack.fixedPosition.y
      angle = campIndex * 2.399963
      if (terrain.overlap(campX, campY) > 0) {
        // Search outward from landmark if exact center tile is slightly blocked
        let foundClear = false
        for (let searchStep = 1; searchStep <= 16; searchStep += 1) {
          const sAngle = searchStep * 2.399963
          const sx = campX + Math.cos(sAngle) * (searchStep * 12)
          const sy = campY + Math.sin(sAngle) * (searchStep * 12)
          if (terrain.overlap(sx, sy) === 0) {
            campX = sx
            campY = sy
            foundClear = true
            break
          }
        }
        if (!foundClear) {
          campIndex += 1
          continue
        }
      }
    } else {
      attempt += 1
      angle = attempt * 2.399963
      const radius = spread * Math.sqrt(attempt / (packs.length * 24))
      campX = around.x + Math.cos(angle) * radius
      campY = around.y + Math.sin(angle) * radius
      if (isInsideSafeZone(campX, campY, safeZones)) continue
      if (terrain.overlap(campX, campY) > 0) continue
    }

    campIndex += 1
    let memberAttempt = 0
    let memberPlaced = 0
    while (memberPlaced < pack.members.length && memberAttempt < pack.members.length * 16) {
      // The leader stands on the camp centre; the rest ring it. Offsetting the
      // ring by the camp's own angle stops every camp in the level from having
      // an identically oriented formation.
      const memberAngle = angle + memberAttempt * 2.399963
      const memberRadius = memberAttempt === 0
        ? 0
        : PACK_RADIUS_PX * Math.sqrt(memberAttempt / (pack.members.length * 12))
      memberAttempt += 1
      const x = campX + Math.cos(memberAngle) * memberRadius
      const y = campY + Math.sin(memberAngle) * memberRadius
      if (pack.fixedPosition === undefined && isInsideSafeZone(x, y, safeZones)) continue
      if (terrain.overlap(x, y) > 0) continue
      const definition = pack.members[memberPlaced]!
      const idx = world.monsters.length
      world.monsters.push({
        index: idx,
        stats: definition,
        x, y,
        hp: definition.hp,
        cooldown: 0,
        state: 'idle',
        facing: 0,
        hitFlash: 0,
        corpseTicks: 0,
        dwInitSeed: (((seed ^ Math.imul(idx + 1, 0x9e3779b9)) >>> 0) || 1),
      })
      memberPlaced += 1
      placed += 1
    }
  }
  return placed
}

/**
 * Direction index (0 = south, turning west) for a vector.
 *
 * @param dx - horizontal component.
 * @param dy - vertical component.
 * @returns the facing.
 */
export function facingOf(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0
  const angle = Math.atan2(-dx, dy)
  return Math.round((angle / (Math.PI / 4)) + 8) % 8
}

/**
 * Move a body one tick, sliding along blocked axes.
 *
 * @param from - current position.
 * @param dx - desired delta x.
 * @param dy - desired delta y.
 * @param terrain - collision predicate.
 * @returns the new position.
 */
function moveWithCollision(
  from: { readonly x: number; readonly y: number },
  dx: number,
  dy: number,
  terrain: CombatTerrain,
): { x: number; y: number } {
  let { x, y } = from
  const current = terrain.overlap(x, y)
  // Axis-separated: a blocked axis stops while the other slides along the wall.
  if (dx !== 0 && terrain.overlap(x + dx, y) <= current) x += dx
  if (dy !== 0 && terrain.overlap(x, y + dy) <= current) y += dy
  return { x, y }
}

/**
 * Apply damage to one monster from any source (a melee swing, a projectile).
 *
 * Kill handling lives here rather than at each call site so experience, the kill
 * counter, the corpse timer and the event stream behave identically however the
 * damage arrived — which is the difference between "the skill works" and "the
 * skill works but kills do not count".
 *
 * @param world - the world.
 * @param monsterIndex - which monster.
 * @param amount - damage to apply.
 * @param attacker - who dealt it; the killer is credited with the experience.
 * Defaults to the local player, which is what a single-player caller means.
 * @returns true when this damage killed it.
 */
function buildKillEvent(monster: Monster): CombatEvent {
  const rank = monster.stats.rank ?? 'normal'
  const monsterType = rank === 'boss' ? 4 : (rank === 'unique' || rank === 'minion' ? 3 : (rank === 'champion' ? 2 : 1))
  return {
    kind: 'kill',
    x: monster.x,
    y: monster.y,
    text: monster.stats.name,
    subjectId: monster.stats.id,
    monsterIndex: monster.index,
    monsterLevel: monster.stats.level,
    monsterRank: monster.stats.rank,
    monsterType,
    superUniqueId: monster.stats.superUniqueId,
  }
}

export function damageMonster(world: CombatWorld, monsterIndex: number, amount: number, attacker: CombatPlayer | string = world.player): boolean {
  const realAttacker = typeof attacker === 'object' && attacker !== null ? attacker : world.player
  const monster = world.monsters[monsterIndex]
  if (monster === undefined || monster.state === 'dead') return false
  monster.hp -= amount
  monster.hitFlash = 4
  world.events.push({ kind: 'monsterHit', x: monster.x, y: monster.y, amount })
  if (monster.curse?.name === 'lifetap' && amount > 0 && realAttacker) {
    const heal = Math.floor(amount * 0.50)
    realAttacker.hp = Math.min(realAttacker.maxHp ?? 1000, realAttacker.hp + heal)
  }
  if (monster.hp > 0) return false
  monster.state = 'dead'
  monster.animMode = 'dt'
  monster.corpseTicks = 100
  if (
    (monster.frozenTicks ?? 0) > 0 ||
    isBoneFetishMonster(0, monster.stats.id) ||
    isSuicideMinionMonster(0, monster.stats.id) ||
    hasMonsterUMod(monster.stats.modifiers, MON_UMOD.GOBOOM) ||
    hasMonsterUMod(monster.stats.modifiers, MON_UMOD.SUICIDE)
  ) {
    monster.corpseSuppressed = true
  }
  monster.dropRolled = monster.dropRolled ?? false
  world.kills += 1
  const killEvent = buildKillEvent(monster)
  world.events.push(killEvent)
  if (world.pendingKills !== undefined) {
    world.pendingKills.push(killEvent)
  }
  if (realAttacker) {
    realAttacker.xp += monster.stats.xp
  }
  return true
}

/**
 * Advance the simulation one tick for one player.
 *
 * @param world - the world to advance (mutated in place).
 * @param input - this tick's movement and attack intent.
 * @param options - non-per-monster tuning.
 * @param terrain - collision predicate.
 * @param xpTable - cumulative experience required per level, index 1 = level 1.
 */
export function tickCombat(
  world: CombatWorld,
  input: CombatInput,
  options: CombatOptions,
  terrain: CombatTerrain,
  xpTable: readonly number[],
): void {
  tickCombatMulti(world, [input], options, terrain, xpTable)
}

/**
 * Advance the simulation one tick for several players at once.
 *
 * One tick, not one per player: the tick counter, the event stream and the
 * monster turn all happen once, while every player's own input is applied before
 * the monsters act. Calling {@link tickCombat} once per player instead would run
 * the monsters twice in a tick and desync two peers against each other.
 *
 * `inputs[i]` drives `players[i]`. A peer with no input this tick simply does not
 * act — it does not fall back to someone else's controls.
 *
 * @param world - the world to advance (mutated in place).
 * @param inputs - one input per player, in peer order.
 * @param options - non-per-monster tuning.
 * @param terrain - collision predicate.
 * @param xpTable - cumulative experience required per level, index 1 = level 1.
 */
export function tickCombatMulti(
  world: CombatWorld,
  inputs: readonly CombatInput[],
  options: CombatOptions,
  terrain: CombatTerrain,
  xpTable: readonly number[],
): void {
  world.tick += 1
  if (!options.preserveEvents) {
    world.events = []
  }
  // Who the monsters may attack is decided at the *start* of the tick. A player
  // who comes back to life during this tick is therefore safe in it, and a world
  // with nobody alive gives the monsters nothing to do: their cooldowns and the
  // corpses hold still rather than running down against a player who cannot
  // answer. Both rules exist to keep death and respawn reading the way they do in
  // single player — you die, the world waits, you come back with a moment to move.
  const targets = world.players.filter(player => player.alive)
  for (let index = 0; index < inputs.length; index += 1) {
    const player = world.players[index]
    if (player === undefined) continue
    tickPlayer(world, player, inputs[index]!, options, terrain, xpTable)
  }
  if (targets.length > 0) tickMonsters(world, options, terrain, targets)
}

/**
 * Apply one player's turn: respawn, movement, attack.
 *
 * @param world - the world.
 * @param player - the player acting.
 * @param input - its input.
 * @param options - non-per-monster tuning.
 * @param terrain - collision predicate.
 * @param xpTable - cumulative experience required per level.
 */
function tickPlayer(
  world: CombatWorld,
  player: CombatPlayer,
  input: CombatInput,
  options: CombatOptions,
  terrain: CombatTerrain,
  xpTable: readonly number[],
): void {
  if (!player.alive) {
    player.respawnIn -= 1
    if (player.respawnIn <= 0) {
      player.alive = true
      player.hp = player.maxHp
      player.mana = player.maxMana
      world.events.push({ kind: 'respawn', x: player.x, y: player.y })
    }
    return
  }

  if (player.cooldown > 0) player.cooldown -= 1
  if (player.swingTicks > 0) player.swingTicks -= 1
  if (player.enchantTicks && player.enchantTicks > 0) {
    player.enchantTicks -= 1
    if (player.enchantTicks <= 0) {
      player.enchantTicks = 0
      player.enchantDamage = undefined
      player.enchantAttackRatingPercent = undefined
    }
  }

  // Over-time potion regeneration and resistance timers (25 Hz ticks)
  if (player.hpRegenTicksRemaining !== undefined && player.hpRegenTicksRemaining > 0) {
    player.hpRegenTicksRemaining -= 1
    const rate = player.hpRegenRatePerTick ?? 0
    if (rate > 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + rate)
    }
    if (player.hpRegenTicksRemaining <= 0) {
      player.hpRegenTicksRemaining = 0
      player.hpRegenRatePerTick = 0
    }
  }
  if (player.manaRegenTicksRemaining !== undefined && player.manaRegenTicksRemaining > 0) {
    player.manaRegenTicksRemaining -= 1
    const rate = player.manaRegenRatePerTick ?? 0
    if (rate > 0 && player.mana < player.maxMana) {
      player.mana = Math.min(player.maxMana, player.mana + rate)
    }
    if (player.manaRegenTicksRemaining <= 0) {
      player.manaRegenTicksRemaining = 0
      player.manaRegenRatePerTick = 0
    }
  }
  if (player.coldResistBonusTicks !== undefined && player.coldResistBonusTicks > 0) {
    player.coldResistBonusTicks -= 1
  }
  if (player.poisonResistBonusTicks !== undefined && player.poisonResistBonusTicks > 0) {
    player.poisonResistBonusTicks -= 1
  }

  // Movement first, so an attack this tick happens from where the player ended up.
  const frwMultiplier = player.blazeTicks && player.blazeTicks > 0 ? 1.3 : 1.0
  const speed = (options.playerSpeed / 25) * frwMultiplier
  const mx = Number.isFinite(input.movement.x) ? input.movement.x : 0
  const my = Number.isFinite(input.movement.y) ? input.movement.y : 0
  const moved = moveWithCollision(player, mx * speed, my * speed, terrain)
  player.x = moved.x
  player.y = moved.y
  const isMoving = mx !== 0 || my !== 0
  player.isMovingThisTick = isMoving
  if (isMoving) {
    player.facing = facingOf(mx, my)
  }
  if (player.stamina !== undefined && player.maxStamina !== undefined) {
    if (isMoving && player.isRunning) {
      player.stamina = Math.max(0, player.stamina - 0.2)
      if (player.stamina <= 0) {
        player.isRunning = false
      }
    } else {
      player.stamina = Math.min(player.maxStamina, player.stamina + (isMoving ? 0.15 : 0.4))
    }
  }

  // Player melee: nearest living monster in reach, if the attack is ready.
  if (input.attack && player.cooldown === 0) {
    const cost = options.playerManaPerAttack
    if (cost > 0 && player.mana < cost) {
      world.events.push({ kind: 'noMana', x: player.x, y: player.y, text: 'no mana' })
    } else {
      player.mana = Math.max(0, player.mana - cost)
      player.cooldown = options.playerCooldownTicks
      player.swingTicks = Math.max(1, Math.floor(options.playerCooldownTicks / 2))
      let target: Monster | null = null
      let bestDistance = Number.POSITIVE_INFINITY
      for (const monster of world.monsters) {
        if (monster.state === 'dead') continue
        const distance = Math.hypot(monster.x - player.x, monster.y - player.y)
        if (distance <= options.playerReach && distance < bestDistance) {
          bestDistance = distance
          target = monster
        }
      }
      if (target === null) {
        world.events.push({ kind: 'playerHit', x: player.x, y: player.y, amount: 0, text: 'whiff' })
      } else {
        player.facing = facingOf(target.x - player.x, target.y - player.y)
        const basePhysRes = (target.stats as any).resistances?.physical ?? (target.stats as any).resists?.physical ?? 0
        let physPierce = 0
        if (target.curse?.name === 'amplifydamage') physPierce = 100
        else if (target.curse?.name === 'decrepify') physPierce = 50
        const physRes = computeEffectiveResistance({ baseRes: basePhysRes, convictionPierce: physPierce })
        let rawPhysDmg = options.playerDamage
        if ((player.criticalStrikeSlvl ?? 0) > 0) {
          const csChancePct = calculateCriticalStrikeStats(player.criticalStrikeSlvl!).chancePct
          const roll = player.passiveRollOverride ?? ((world.tick * 37 + target.index * 17) % 100)
          if (roll < csChancePct) {
            rawPhysDmg *= 2
          }
        }
        let totalDamage = physRes.isImmune ? 0 : Math.max(0, Math.round((rawPhysDmg * (100 - physRes.effectiveRes)) / 100))
        if (player.enchantTicks && player.enchantTicks > 0 && player.enchantDamage) {
          const enchantRes = calculateEnchantAttackDamage({
            enchantDamage: player.enchantDamage,
            isRanged: player.isRanged,
            isSorceress: player.isSorceress,
            fireMasterySlvl: player.fireMasterySlvl,
            targetFireResist: (target as any).fireResist ?? (target.stats as any).fireResist,
          })
          totalDamage += Math.round(enchantRes.average)
        }
        target.hp -= totalDamage
        target.hitFlash = 4
        world.events.push({ kind: 'monsterHit', x: target.x, y: target.y, amount: totalDamage })
        if (target.curse?.name === 'lifetap' && totalDamage > 0) {
          const heal = Math.floor(totalDamage * 0.50)
          player.hp = Math.min(player.maxHp, player.hp + heal)
        }
        if (target.hp <= 0) {
          target.state = 'dead'
          target.animMode = 'dt'
          target.corpseTicks = 100
          if (
            (target.frozenTicks ?? 0) > 0 ||
            isBoneFetishMonster(0, target.stats.id) ||
            isSuicideMinionMonster(0, target.stats.id) ||
            hasMonsterUMod(target.stats.modifiers, MON_UMOD.GOBOOM) ||
            hasMonsterUMod(target.stats.modifiers, MON_UMOD.SUICIDE)
          ) {
            target.corpseSuppressed = true
          }
          target.dropRolled = target.dropRolled ?? false
          world.kills += 1
          const killEvent = buildKillEvent(target)
          world.events.push(killEvent)
          if (world.pendingKills !== undefined) {
            world.pendingKills.push(killEvent)
          }
          player.xp += target.stats.xp
        }
      }
    }
  }

  // Level up while the threshold is crossed; the table is cumulative.
  while (xpTable && player.level + 1 < xpTable.length && player.xp >= (xpTable[player.level + 1] ?? Number.POSITIVE_INFINITY)) {
    player.level += 1
    const cStats = CANONICAL_CHARSTATS[player.classCode ?? 'sor']
    const hpGain = Math.floor(cStats.perLevel.life)
    const manaGain = Math.floor(cStats.perLevel.mana)
    const staminaGain = Math.floor(cStats.perLevel.stamina)
    const statPtsGain = cStats.perLevel.statPoints
    player.maxHp += hpGain
    player.maxMana += manaGain
    player.maxStamina = (player.maxStamina ?? cStats.baseVitals.stamina) + staminaGain
    player.stamina = player.maxStamina
    player.statPoints = (player.statPoints ?? 0) + statPtsGain
    player.skillPoints = (player.skillPoints ?? 0) + 1
    player.hp = player.maxHp
    player.mana = player.maxMana
    world.events.push({ kind: 'levelUp', x: player.x, y: player.y, text: `level ${String(player.level)}` })
  }
}

/**
 * The monsters' turn: notice, close in, strike. Corpses decay.
 *
 * @param world - the world.
 * @param options - non-per-monster tuning.
 * @param terrain - collision predicate.
 * @param targets - the players that were alive when the tick began.
 */
export function tickMonsters(world: CombatWorld, options: CombatOptions, terrain: CombatTerrain, targets: readonly CombatPlayer[]): void {
  for (const monster of world.monsters) {
    if (monster.sleeping) continue
    if (monster.state === 'dead') {
      if (monster.corpseTicks > 0) monster.corpseTicks -= 1
      continue
    }
    if (monster.hitFlash > 0) monster.hitFlash -= 1
    if (monster.cooldown > 0) monster.cooldown -= 1
    if (monster.innerSightTicks !== undefined && monster.innerSightTicks > 0) {
      monster.innerSightTicks -= 1
      if (monster.innerSightTicks <= 0) {
        monster.innerSightTicks = 0
        monster.innerSightDefReduction = undefined
      }
    }
    if (monster.slowMissilesTicks !== undefined && monster.slowMissilesTicks > 0) {
      monster.slowMissilesTicks -= 1
      if (monster.slowMissilesTicks <= 0) {
        monster.slowMissilesTicks = 0
        monster.slowMissilesMult = undefined
      }
    }
    if (monster.frozenTicks !== undefined && monster.frozenTicks > 0) {
      monster.frozenTicks -= 1
      monster.state = 'idle'
      continue
    }
    if (monster.stunTicks !== undefined && monster.stunTicks > 0) {
      monster.stunTicks -= 1
      monster.state = 'idle'
      continue
    }
    if (monster.chillTicks !== undefined && monster.chillTicks > 0) {
      monster.chillTicks -= 1
    }
    if (monster.poisonTicks !== undefined && monster.poisonTicks > 0) {
      monster.poisonTicks -= 1
      if (world.tick % 5 === 0 && monster.hp > 1) {
        monster.hp -= 1
      }
    }

    if (monster.curse !== undefined && monster.curse.ticksRemaining > 0) {
      monster.curse.ticksRemaining -= 1
      if (monster.curse.ticksRemaining <= 0) {
        monster.curse = undefined
      }
    }

    if (options.disableMonsterAggro) {
      monster.state = 'idle'
      continue
    }

    const player = nearestTarget(monster, targets)
    if (player === null) {
      monster.state = 'idle'
      continue
    }

    // Terror flee behavior: flee directly opposite caster/player
    if (monster.curse?.name === 'terror') {
      const fleeFromX = monster.curse.casterX ?? player.x
      const fleeFromY = monster.curse.casterY ?? player.y
      const fdx = monster.x - fleeFromX
      const fdy = monster.y - fleeFromY
      const flen = Math.hypot(fdx, fdy) || 1
      monster.facing = facingOf(fdx, fdy)
      const chillFactor = monster.chillTicks !== undefined && monster.chillTicks > 0 ? 0.5 : 1
      const step = (monster.stats.speed / 25) * chillFactor
      const moved = moveWithCollision(monster, (fdx / flen) * step, (fdy / flen) * step, terrain)
      monster.x = moved.x
      monster.y = moved.y
      monster.state = 'chase'
      continue
    }

    const sightRadius = monster.curse?.name === 'dimvision' ? 40 : monster.stats.aggroRadius

    // Attract & Confuse target redirection:
    let targetMonster: Monster | null = null
    let bestTargetDist = sightRadius
    for (const other of world.monsters) {
      if (other.index === monster.index || other.state === 'dead' || other.hp <= 0) continue
      if (other.curse?.name === 'attract') {
        const d = Math.hypot(other.x - monster.x, other.y - monster.y)
        if (d <= bestTargetDist) {
          bestTargetDist = d
          targetMonster = other
        }
      }
    }
    if (monster.curse?.name === 'confuse' && targetMonster === null) {
      for (const other of world.monsters) {
        if (other.index === monster.index || other.state === 'dead' || other.hp <= 0) continue
        const d = Math.hypot(other.x - monster.x, other.y - monster.y)
        if (d <= bestTargetDist) {
          bestTargetDist = d
          targetMonster = other
        }
      }
    }

    if (targetMonster !== null) {
      const mdx = targetMonster.x - monster.x
      const mdy = targetMonster.y - monster.y
      const mdist = Math.hypot(mdx, mdy)
      monster.facing = facingOf(mdx, mdy)
      if (mdist <= monster.stats.reach) {
        monster.state = 'attack'
        if (monster.cooldown === 0) {
          monster.cooldown = monster.curse?.name === 'decrepify' ? monster.stats.cooldownTicks * 2 : monster.stats.cooldownTicks
          let dmg = monster.stats.damage
          if (monster.curse?.name === 'weaken') dmg = Math.floor(dmg * 0.67)
          if (monster.curse?.name === 'decrepify') dmg = Math.floor(dmg * 0.50)
          damageMonster(world, targetMonster.index, dmg, player)
        }
        continue
      }
      monster.state = 'chase'
      const chillFactor = monster.chillTicks !== undefined && monster.chillTicks > 0 ? 0.5 : 1
      const decrepFactor = monster.curse?.name === 'decrepify' ? 0.5 : 1
      const step = (monster.stats.speed / 25) * chillFactor * decrepFactor
      const moved = moveWithCollision(monster, (mdx / mdist) * step, (mdy / mdist) * step, terrain)
      monster.x = moved.x
      monster.y = moved.y
      continue
    }

    const dx = player.x - monster.x
    const dy = player.y - monster.y
    const distance = Math.hypot(dx, dy)

    if (distance > sightRadius) {
      monster.state = 'idle'
      continue
    }
    if (monster.curse?.name === 'dimvision' && monster.stats.reach > 40) {
      monster.state = 'idle'
      continue
    }
    monster.facing = facingOf(dx, dy)
    if (distance <= monster.stats.reach) {
      monster.state = 'attack'
      if (monster.cooldown === 0) {
        monster.cooldown = monster.curse?.name === 'decrepify' ? monster.stats.cooldownTicks * 2 : monster.stats.cooldownTicks
        let dmg = monster.stats.damage
        if (monster.curse?.name === 'weaken') dmg = Math.floor(dmg * 0.67)
        if (monster.curse?.name === 'decrepify') dmg = Math.floor(dmg * 0.50)
        const isRanged = monster.stats.reach > 40

        // Amazon Passive Avoidance (#13 Dodge / #18 Avoid / #29 Evade):
        // Evade applies while moving (melee or missile); Dodge (melee) and Avoid (missile) apply while stationary/attacking.
        if (player.isMovingThisTick && (player.evadeSlvl ?? 0) > 0) {
          const evadeChance = calculateEvadeStats(player.evadeSlvl!).chancePct
          const roll = player.passiveRollOverride ?? ((world.tick * 37 + monster.index * 17) % 100)
          if (roll < evadeChance) {
            world.events.push({ kind: 'playerHit', x: player.x, y: player.y, amount: 0, text: 'evade' })
            continue
          }
        } else if (!player.isMovingThisTick) {
          if (!isRanged && (player.dodgeSlvl ?? 0) > 0) {
            const dodgeChance = calculateDodgeStats(player.dodgeSlvl!).chancePct
            const roll = player.passiveRollOverride ?? ((world.tick * 37 + monster.index * 17) % 100)
            if (roll < dodgeChance) {
              player.swingTicks = Math.max(player.swingTicks ?? 0, 8)
              world.events.push({ kind: 'playerHit', x: player.x, y: player.y, amount: 0, text: 'dodge' })
              continue
            }
          } else if (isRanged && (player.avoidSlvl ?? 0) > 0) {
            const avoidChance = calculateAvoidStats(player.avoidSlvl!).chancePct
            const roll = player.passiveRollOverride ?? ((world.tick * 37 + monster.index * 17) % 100)
            if (roll < avoidChance) {
              player.swingTicks = Math.max(player.swingTicks ?? 0, 8)
              world.events.push({ kind: 'playerHit', x: player.x, y: player.y, amount: 0, text: 'avoid' })
              continue
            }
          }
        }

        // Iron Maiden reflection on melee attack
        if (monster.curse?.name === 'ironmaiden' && !isRanged && dmg > 0) {
          const returnPct = monster.curse.returnPct ?? (200 + (monster.curse.slvl - 1) * 25)
          const physRes = monster.stats.resistances?.physical ?? monster.stats.resists?.physical ?? 0
          const rawReflect = Math.floor((dmg * returnPct) / 100)
          const effReflect = physRes >= 100 ? 0 : Math.max(0, Math.floor((rawReflect * (100 - physRes)) / 100))
          if (effReflect > 0) {
            damageMonster(world, monster.index, effReflect, player)
          }
        }

        // Cold Armor: Shiver Armor (Skill 50) proactive melee defense
        if (!isRanged && player.coldArmorType === 'shiverarmor') {
          const slvl = player.coldArmorSlvl ?? 1
          const dmgRange = calculateShiverArmorDamage(slvl)
          const coldDmg = Math.round((dmgRange.min + dmgRange.max) / 2)
          damageMonster(world, monster.index, coldDmg, player)
          const chillFrames = calculateShiverArmorChillLength(slvl)
          monster.chillTicks = Math.max(monster.chillTicks ?? 0, chillFrames)
        }

        // Cold Armor: Chilling Armor (Skill 60) ranged retaliatory reflection
        if (isRanged && player.coldArmorType === 'chillingarmor') {
          const slvl = player.coldArmorSlvl ?? 1
          const dmgRange = calculateChillingArmorDamage(slvl)
          const boltDmg = Math.round((dmgRange.min + dmgRange.max) / 2)
          world.events.push({
            kind: 'missileHit',
            x: player.x,
            y: player.y,
            missileType: 'chillingarmorbolt',
            skillId: '60',
            amount: boltDmg,
          })
          damageMonster(world, monster.index, boltDmg, player)
          const chillFrames = calculateChillingArmorChillLength(slvl)
          monster.chillTicks = Math.max(monster.chillTicks ?? 0, chillFrames)
        }

        if (monster.hp <= 0) {
          continue
        }

        if (player.energyshieldTicks && player.energyshieldTicks > 0 && player.mana > 0) {
          const absorbPct = player.energyshieldPct ?? 20
          const absorbed = Math.floor((dmg * absorbPct) / 100)
          const ratio = 2.0
          const manaNeeded = Math.ceil(absorbed * ratio)
          if (player.mana >= manaNeeded) {
            player.mana -= manaNeeded
            dmg -= absorbed
          } else {
            const actualAbsorbed = Math.floor(player.mana / ratio)
            player.mana = 0
            dmg -= actualAbsorbed
            player.energyshieldTicks = 0
          }
        }
        player.hp -= dmg
        world.events.push({ kind: 'playerHit', x: player.x, y: player.y, amount: dmg })

        // Cold Armor: Frozen Armor (Skill 40) reactive melee freeze on physical damage
        if (!isRanged && player.coldArmorType === 'frozenarmor' && dmg > 0) {
          const slvl = player.coldArmorSlvl ?? 1
          const freezeFrames = calculateFrozenArmorFreezeLength(slvl)
          monster.frozenTicks = Math.max(monster.frozenTicks ?? 0, freezeFrames)
        }

        if (player.hp <= 0) {
          player.hp = 0
          player.alive = false
          player.respawnIn = options.respawnTicks
          world.events.push({ kind: 'playerDeath', x: player.x, y: player.y, text: 'you died' })
        }
      }
      continue
    }
    monster.state = 'chase'
    const chillFactor = monster.chillTicks !== undefined && monster.chillTicks > 0 ? 0.5 : 1
    const decrepFactor = monster.curse?.name === 'decrepify' ? 0.5 : 1
    const step = (monster.stats.speed / 25) * chillFactor * decrepFactor
    const movedMonster = moveWithCollision(monster, (dx / distance) * step, (dy / distance) * step, terrain)
    monster.x = movedMonster.x
    monster.y = movedMonster.y
  }
}

/**
 * Compute effective monster defense after Inner Sight (#8) flat defense reduction (`armorclass -= edmn`).
 */
export function computeEffectiveMonsterDefense(monster: Monster): number {
  const baseDef = monster.defense ?? (monster.stats as any).defense ?? 0
  const reduction = (monster.innerSightTicks ?? 0) > 0 ? Math.abs(monster.innerSightDefReduction ?? 0) : 0
  return Math.max(0, baseDef - reduction)
}

/**
 * Compute effective monster projectile speed after Slow Missiles (#17) velocity scaling (`skill_handofathena = 33%`).
 */
export function computeEffectiveMonsterMissileSpeed(monster: Monster, baseSpeed: number, canSlow = true): number {
  if (!canSlow) return baseSpeed
  if ((monster.slowMissilesTicks ?? 0) > 0) {
    const mult = monster.slowMissilesMult ?? 0.33
    return baseSpeed * mult
  }
  return baseSpeed
}

/**
 * Apply Enchant buff to a combat player or ally/pet unit.
 * Authentic 1.13c: duration = 3600 + (slvl - 1) * 600 frames, AR bonus = 20 + (slvl - 1) * 9 %,
 * damage = calculateEnchantDamage(slvl, synergies, fmSlvl).
 */
export function applyEnchantBuff(
  target: CombatPlayer | {
    enchantTicks?: number | undefined
    enchantDamage?: { min: number; max: number } | undefined
    enchantAttackRatingPercent?: number | undefined
  },
  slvl: number,
  options?: {
    casterWarmth?: number | undefined
    casterFireMasterySlvl?: number | undefined
    isCasterSorceress?: boolean | undefined
  } | undefined,
): void {
  const duration = calculateEnchantDuration(slvl)
  const arBonus = calculateEnchantAttackRating(slvl)
  const dmg = calculateEnchantDamage(
    slvl,
    options?.casterWarmth !== undefined ? { warmth: options.casterWarmth } : undefined,
    options?.casterFireMasterySlvl,
  )

  target.enchantTicks = duration
  target.enchantAttackRatingPercent = arBonus
  target.enchantDamage = { min: dmg.min, max: dmg.max }
}

/**
 * Determine whether a unit can be targeted for Enchant (Skill 52).
 * 1.13c Skills.txt: InTown: 1, TargetAlly: 1, TargetPet: 1.
 * Enemies cannot be enchanted. Self, party allies, and pets are allowed, even in town.
 */
export function canCastEnchantOn(
  targetType: 'self' | 'ally' | 'pet' | 'enemy' | string,
  _inTown = true,
): boolean {
  if (targetType === 'enemy') return false
  return true
}

