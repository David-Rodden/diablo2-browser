/**
 * Deterministic simulation state hashing and lockstep verification (`src/server/engine/state-hash.ts`).
 *
 * Extracted from legacy `src/net/lockstep.ts` and `src/scene/backend/net-simulation.ts`
 * so `src/server/` retains deterministic 32-bit FNV-1a state hashing without `src/net/`.
 */

import type { SpriteSheet } from '../../common/formats/sprite.ts'
import { executeDropPipeline, type DropTables } from '../../common/items/drop-tables.ts'
import { getEmbeddedDropTables } from '../../common/items/embedded-drop-tables.ts'
import { Inventory, type Item } from '../../common/items/items.ts'
import { parseTable } from '../../common/items/tables.ts'
import { D2Rng, Rng } from '../../common/rng/d2-rng.ts'
import {
  MONSTER_TABLE,
  getMonsterTreasureClass,
  monsterStatsOf,
  readMonsterKinds,
  type Difficulty,
} from '../../common/units/monsters-data.ts'
import type {
  CombatInput,
  CombatOptions,
  CombatTerrain,
  CombatWorld,
  MonsterStats,
} from '../../common/units/unit-types.ts'
import { parseTable as parseActTable } from '../../common/world/acts.ts'
import { findIsometricDropPosition, getPickupEdgeDistance } from '../items/ground-items.ts'
import { QuestLog } from '../world/quests.ts'
import { monsterStatsFromTable, tickCombatMulti } from './combat.ts'

/** One peer's input for one tick. */
export interface InputFrame {
  /** Which tick this input is for. */
  readonly tick: number
  /** Normalized movement, screen axes (`[-1, 1]`). */
  readonly movement: { readonly x: number; readonly y: number }
  /** Attack button held this tick. */
  readonly attack: boolean
  /** Pickup button pressed this tick. */
  readonly pickup: boolean
  /** Optional talk button pressed this tick. */
  readonly talk?: boolean | undefined
  /** Optional skill index selected this tick. */
  readonly skill?: number | undefined
}

/** A state hash at a specific tick. */
export interface StateHash {
  readonly tick: number
  /** 32-bit unsigned digest (`>>> 0`). */
  readonly hash: number
}

/** What {@link LockstepSession.step} did. */
export type StepOutcome =
  | { readonly kind: 'stepped'; readonly tick: number; readonly hash: number }
  | { readonly kind: 'waiting'; readonly tick: number; readonly missing: readonly number[] }
  | { readonly kind: 'desync'; readonly tick: number; readonly local: number; readonly remote: number }

/** A divergence between two peers' worlds at the same tick. */
export interface DesyncReport {
  readonly tick: number
  readonly local: number
  readonly remote: number
  readonly localHash: number
  readonly remoteHash: number
}

/** Tuning for {@link LockstepSession}. */
export interface LockstepOptions {
  /** Total number of peers in the session (including the local one). */
  readonly peers: number
  /** Ticks between a peer reading its keys and the world acting on them. */
  readonly inputDelayTicks: number
  /** How many past state hashes to keep for late-arriving comparisons. */
  readonly historyTicks?: number
  /** Maximum future ticks ahead of `currentTick` accepted into the inbox (default 64). */
  readonly maxFutureTicks?: number
}

/** What the session needs from the simulation it drives. */
export interface LockstepSimulation {
  /** Advance one tick using every peer's input, in peer-index order. */
  advance: (inputs: readonly InputFrame[]) => void
  /** Digest the world's state into a 32-bit unsigned integer. */
  hash: () => number
}

/** Number of past hashes kept for late comparisons. */
export const DEFAULT_HISTORY = 64

/** Maximum future ticks ahead of currentTick accepted into the inbox. */
export const MAX_FUTURE_TICKS = 64

/**
 * One lockstep session: input inbox, tick clock and hash history.
 */
export class LockstepSession {
  private readonly options: LockstepOptions
  private readonly simulation: LockstepSimulation
  private readonly inputs = new Map<number, Map<number, InputFrame>>()
  private readonly remoteHashHistory = new Map<number, Map<number, number>>()
  private readonly hashes: StateHash[] = []
  private currentTick = 0
  private stallTicks = 0
  private desync: DesyncReport | null = null

  constructor(options: LockstepOptions, simulation: LockstepSimulation) {
    this.options = options
    this.simulation = simulation
    for (let peer = 0; peer < options.peers; peer += 1) {
      this.inputs.set(peer, new Map())
      this.remoteHashHistory.set(peer, new Map())
    }
  }

  get tick(): number {
    return this.currentTick
  }

  get stalls(): number {
    return this.stallTicks
  }

  get desyncReport(): DesyncReport | null {
    return this.desync
  }

  get history(): readonly StateHash[] {
    return this.hashes
  }

  get pendingInputs(): ReadonlyMap<number, ReadonlyMap<number, InputFrame>> {
    return this.inputs
  }

  get remoteHashes(): ReadonlyMap<number, ReadonlyMap<number, number>> {
    return this.remoteHashHistory
  }

  submit(peer: number, frame: InputFrame): boolean {
    if (!Number.isInteger(peer)) return false
    const peerInputs = this.inputs.get(peer)
    if (peerInputs === undefined) return false
    if (!Number.isInteger(frame.tick) || frame.tick < this.currentTick) return false
    const maxFuture = this.options.maxFutureTicks ?? MAX_FUTURE_TICKS
    if (frame.tick > this.currentTick + maxFuture) return false
    if (
      !Number.isFinite(frame.movement.x) ||
      !Number.isFinite(frame.movement.y) ||
      Math.abs(frame.movement.x) > 1 ||
      Math.abs(frame.movement.y) > 1
    ) {
      return false
    }
    if (peerInputs.has(frame.tick)) return false
    peerInputs.set(frame.tick, frame)
    return true
  }

  recordRemoteHash(peer: number, tick: number, hash: number): boolean {
    if (!Number.isInteger(peer)) return false
    const peerMap = this.remoteHashHistory.get(peer)
    if (peerMap === undefined) return false
    const historyWindow = this.options.historyTicks ?? DEFAULT_HISTORY
    const maxFuture = this.options.maxFutureTicks ?? MAX_FUTURE_TICKS
    if (!Number.isInteger(tick) || tick < this.currentTick - historyWindow || tick > this.currentTick + maxFuture) {
      return false
    }
    if (peerMap.has(tick)) return false
    peerMap.set(tick, hash >>> 0)
    const oldest = this.currentTick - historyWindow
    for (const oldTick of peerMap.keys()) {
      if (oldTick < oldest) peerMap.delete(oldTick)
    }
    return true
  }

  step(): StepOutcome {
    const tick = this.currentTick
    const missing: number[] = []
    const frames: InputFrame[] = []
    for (let peer = 0; peer < this.options.peers; peer += 1) {
      const frame = this.inputs.get(peer)?.get(tick)
      if (frame === undefined) {
        missing.push(peer)
        continue
      }
      frames.push(frame)
    }
    if (missing.length > 0) {
      this.stallTicks += 1
      return { kind: 'waiting', tick, missing }
    }

    this.simulation.advance(frames)
    const hash = this.simulation.hash()
    const historyWindow = this.options.historyTicks ?? DEFAULT_HISTORY
    this.hashes.push({ tick, hash })
    if (this.hashes.length > historyWindow) this.hashes.shift()
    for (const peer of this.inputs.keys()) this.inputs.get(peer)!.delete(tick)
    this.currentTick += 1
    const oldest = this.currentTick - historyWindow
    for (const peerMap of this.remoteHashHistory.values()) {
      for (const oldTick of peerMap.keys()) {
        if (oldTick < oldest) peerMap.delete(oldTick)
      }
      const remoteHash = peerMap.get(tick)
      if (remoteHash !== undefined && remoteHash !== (hash >>> 0)) {
        this.desync ??= {
          tick,
          local: hash,
          remote: remoteHash,
          localHash: hash,
          remoteHash,
        }
        return { kind: 'desync', tick, local: hash, remote: remoteHash }
      }
    }
    this.stallTicks = 0
    return { kind: 'stepped', tick, hash }
  }

  get inputDueTick(): number {
    return this.currentTick + this.options.inputDelayTicks
  }

  compare(remote: StateHash): DesyncReport | null {
    const local = this.hashes.find(entry => entry.tick === remote.tick)
    if (local === undefined) return null
    if (local.hash === remote.hash) return null
    this.desync ??= {
      tick: remote.tick,
      local: local.hash,
      remote: remote.hash,
      localHash: local.hash,
      remoteHash: remote.hash,
    }
    return this.desync
  }

  static digest(text: string): number {
    let hash = 2166136261
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619) >>> 0
    }
    return hash >>> 0
  }
}

export interface HashablePlayer {
  readonly x: number
  readonly y: number
  readonly hp: number
  readonly xp?: number | undefined
  readonly level?: number | undefined
  readonly alive?: boolean | undefined
  readonly maxHp?: number | undefined
  readonly mana?: number | undefined
  readonly maxMana?: number | undefined
  readonly cooldown?: number | undefined
}

export interface HashableMonster {
  readonly id?: number | undefined
  readonly kind?: string | undefined
  readonly x: number
  readonly y: number
  readonly hp: number
  readonly maxHp?: number | undefined
  readonly cooldown?: number | undefined
  readonly deadTicks?: number | undefined
  readonly state?: string | undefined
}

export interface HashableWorld {
  readonly tick: number
  readonly kills: number
  readonly rngState?: number | undefined
  readonly xp?: number | undefined
  readonly level?: number | undefined
  readonly players?: readonly HashablePlayer[] | undefined
  readonly player?: HashablePlayer | undefined
  readonly monsters: readonly HashableMonster[] | ReadonlyMap<number, HashableMonster>
}

export interface HashableItem {
  readonly name: string
  readonly stack?: number | undefined
  readonly value?: number | undefined
  readonly quality?: string | number | undefined
  readonly uniqueId?: number | undefined
  readonly dwInitSeed?: number | undefined
}

export interface HashablePlacedItem {
  readonly x: number
  readonly y: number
  readonly item: HashableItem
}

export interface HashableInventory {
  readonly contents: readonly HashablePlacedItem[]
}

export interface HashableGroundItem {
  readonly x: number
  readonly y: number
  readonly item: HashableItem
}

export interface HashableQuest {
  readonly def: { readonly id: string }
  readonly status: string
  readonly kills: number
}

export function computeLockstepHash(
  worldOrEngine:
    | HashableWorld
    | {
        readonly world: HashableWorld
        readonly bag?: HashableInventory | undefined
        readonly ground?: readonly HashableGroundItem[] | undefined
        readonly questLog?: { readonly all: readonly HashableQuest[] } | undefined
      },
  inventories?: readonly HashableInventory[],
  ground?: readonly HashableGroundItem[],
  quests?: readonly HashableQuest[],
): number {
  const isEngineWrapper =
    worldOrEngine !== null &&
    typeof worldOrEngine === 'object' &&
    'world' in worldOrEngine &&
    worldOrEngine.world !== undefined &&
    typeof (worldOrEngine as { readonly world: HashableWorld }).world.tick === 'number'

  const world: HashableWorld = isEngineWrapper
    ? (worldOrEngine as { readonly world: HashableWorld }).world
    : (worldOrEngine as HashableWorld)

  const resolvedInventories: readonly HashableInventory[] =
    inventories ??
    (isEngineWrapper && (worldOrEngine as { readonly bag?: HashableInventory }).bag
      ? [(worldOrEngine as { readonly bag: HashableInventory }).bag]
      : [])
  const resolvedGround: readonly HashableGroundItem[] =
    ground ??
    (isEngineWrapper && (worldOrEngine as { readonly ground?: readonly HashableGroundItem[] }).ground
      ? (worldOrEngine as { readonly ground: readonly HashableGroundItem[] }).ground
      : [])
  const resolvedQuests: readonly HashableQuest[] =
    quests ??
    (isEngineWrapper &&
    (worldOrEngine as { readonly questLog?: { readonly all: readonly HashableQuest[] } }).questLog
      ? (worldOrEngine as { readonly questLog: { readonly all: readonly HashableQuest[] } }).questLog.all
      : [])

  let hash = 2166136261

  function mix(value: number): void {
    hash ^= value & 0xffffffff
    hash = Math.imul(hash, 16777619) >>> 0
  }
  function mixString(text: string): void {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619) >>> 0
    }
  }
  const round = (val: number): number => Math.round(val * 1000)

  // 1. Hash World
  mix(world.tick ?? 0)
  mix(world.kills ?? 0)

  const playersList = world.players ?? (world.player ? [world.player] : [])
  for (const player of playersList) {
    mix(round(player.x))
    mix(round(player.y))
    mix(player.hp)
    mix(player.xp ?? world.xp ?? 0)
    mix(player.level ?? world.level ?? 1)
    mix((player.alive ?? player.hp > 0) ? 1 : 0)
  }

  const monsters = world.monsters instanceof Map ? world.monsters.values() : (world.monsters ?? [])
  for (const monster of monsters) {
    mix(round(monster.x))
    mix(round(monster.y))
    mix(monster.hp)
    mixString(monster.state ?? '')
  }

  // 2. Hash Inventories
  for (const inventory of resolvedInventories) {
    let invHash = 0
    if (inventory && inventory.contents) {
      for (const entry of inventory.contents) {
        let itemHash = 2166136261
        const mixItem = (v: number): void => {
          itemHash ^= v & 0xffffffff
          itemHash = Math.imul(itemHash, 16777619) >>> 0
        }
        const mixItemString = (t: string): void => {
          for (let i = 0; i < t.length; i += 1) {
            itemHash ^= t.charCodeAt(i)
            itemHash = Math.imul(itemHash, 16777619) >>> 0
          }
        }

        mixItem(entry.x)
        mixItem(entry.y)
        mixItemString(entry.item.name)
        mixItem(entry.item.stack ?? 1)
        mixItem(entry.item.value ?? 0)
        if (typeof entry.item.quality === 'string') {
          mixItemString(entry.item.quality)
        } else {
          mixItem(entry.item.quality ?? 0)
        }
        mixItem(((entry.item as { uniqueId?: number; dwInitSeed?: number }).uniqueId ?? (entry.item as { dwInitSeed?: number }).dwInitSeed ?? 0) >>> 0)
        invHash = (invHash + itemHash) >>> 0
      }
    }
    mix(invHash)
  }

  // 3. Hash Ground Loot (order-independent sum)
  if (resolvedGround.length > 0 || ground !== undefined) {
    let groundHash = 0
    for (const entry of resolvedGround) {
      let elHash = 2166136261
      const mixEl = (v: number): void => {
        elHash ^= v & 0xffffffff
        elHash = Math.imul(elHash, 16777619) >>> 0
      }
      const mixElString = (t: string): void => {
        for (let i = 0; i < t.length; i += 1) {
          elHash ^= t.charCodeAt(i)
          elHash = Math.imul(elHash, 16777619) >>> 0
        }
      }

      mixEl(round(entry.x))
      mixEl(round(entry.y))
      mixElString(entry.item.name)
      mixEl(entry.item.stack ?? 1)
      mixEl(entry.item.value ?? 0)
      if (typeof entry.item.quality === 'string') {
        mixElString(entry.item.quality)
      } else {
        mixEl(entry.item.quality ?? 0)
      }
      mixEl(((entry.item as { uniqueId?: number; dwInitSeed?: number }).uniqueId ?? (entry.item as { dwInitSeed?: number }).dwInitSeed ?? 0) >>> 0)
      groundHash = (groundHash + elHash) >>> 0
    }
    mix(groundHash)
  }

  // 4. Hash Quests (order-independent sum)
  if (resolvedQuests.length > 0 || quests !== undefined) {
    let questsHash = 0
    for (const entry of resolvedQuests) {
      let qHash = 2166136261
      const mixQ = (v: number): void => {
        qHash ^= v & 0xffffffff
        qHash = Math.imul(qHash, 16777619) >>> 0
      }
      const mixQString = (t: string): void => {
        for (let i = 0; i < t.length; i += 1) {
          qHash ^= t.charCodeAt(i)
          qHash = Math.imul(qHash, 16777619) >>> 0
        }
      }

      mixQString(entry.def.id)
      mixQString(entry.status)
      mixQ(entry.kills)
      questsHash = (questsHash + qHash) >>> 0
    }
    mix(questsHash)
  }

  return hash >>> 0
}

export const computeStateHash = computeLockstepHash

/** World seed: fixed, because both peers must build the same world. */
export const NET_SEED = 0x0d2c0de

/** Raw members the scene needs. */
export interface NetSources {
  readonly ds1: Uint8Array
  readonly libraries: readonly Uint8Array[]
  readonly palette: Uint8Array
  readonly paletteName: string
  readonly actor: { readonly name: string; readonly sheet: SpriteSheet } | null
  readonly monstats: Uint8Array | null
}

/** The monster table used when the archive has none, so the page is never empty. */
export const DEMO_MONSTERS: MonsterStats[] = monsterStatsFromTable(
  parseTable(
    [
      'Id\tName\tHP\tDamage\tCooldownTicks\tReach\tAggroRadius\tSpeed\tXP',
      'fallen\tFallen One\t16\t2\t24\t38\t420\t150\t12',
      'zombie\tZombie\t30\t3\t32\t42\t360\t120\t20',
    ].join('\n'),
  ),
)

/** Fallback experience thresholds: the co-op sandbox is not about levelling. */
export const DEMO_EXPERIENCE: readonly number[] = [0, 0, 250, 700, 1500, 3000]

const WALK_SPEED = 180

/**
 * Parse monster stats from either a 255-column `MonStats.txt` table or a 9-column test fixture table.
 */
export function parseNetMonsterStats(monstatsBytes: Uint8Array | string): readonly MonsterStats[] {
  const bytes =
    typeof monstatsBytes === 'string' ? new TextEncoder().encode(monstatsBytes) : monstatsBytes
  const text =
    typeof monstatsBytes === 'string' ? monstatsBytes : new TextDecoder().decode(monstatsBytes)
  const actTable = parseActTable(bytes)
  if (actTable.header.includes('NameStr') || actTable.header.includes('minHP')) {
    const hasCombatCols =
      actTable.header.includes('minHP') && actTable.header.includes('Velocity')
    const kinds = hasCombatCols ? readMonsterKinds(actTable) : MONSTER_TABLE
    const rng = new Rng(NET_SEED)
    const result: MonsterStats[] = []
    for (const kind of kinds.values()) {
      if (kind.enabled && kind.killable && !kind.inTown && kind.maxHp > 0) {
        result.push(monsterStatsOf(kind, rng, WALK_SPEED))
      }
    }
    return result.length > 0 ? result : DEMO_MONSTERS
  }
  return monsterStatsFromTable(parseTable(text))
}

export function createNetSimulation(
  world: CombatWorld,
  options: CombatOptions,
  terrain: CombatTerrain,
  xpTable: readonly number[],
  numPeers: number,
  seed: number = NET_SEED,
  dropTables: DropTables = getEmbeddedDropTables(),
  difficulty: Difficulty = 'normal',
) {
  const inventories = Array.from({ length: Math.max(numPeers, 1) }, () => new Inventory(10, 4))
  const quests = new QuestLog([])
  const ground: { x: number; y: number; item: Item }[] = []

  world.pendingKills = world.pendingKills ?? []
  for (let i = 0; i < world.monsters.length; i += 1) {
    const monster = world.monsters[i]!
    if (monster.dwInitSeed === undefined) {
      monster.dwInitSeed = (seed ^ Math.imul(monster.index + 1, 0x9e3779b9)) >>> 0 || 1
    }
  }

  const mapTerrain =
    'widthPx' in terrain
      ? (terrain as CombatTerrain & { widthPx: number; heightPx: number })
      : { ...terrain, widthPx: 10000, heightPx: 10000 }

  const simulation: LockstepSimulation = {
    advance: (inputs: readonly InputFrame[]) => {
      const frames: CombatInput[] = inputs.map(input => ({
        movement: input.movement,
        attack: input.attack,
      }))
      tickCombatMulti(world, frames, options, terrain, xpTable)

      const killEvents = [
        ...(world.pendingKills ?? []),
        ...world.events.filter(e => e.kind === 'kill'),
      ]
      if (world.pendingKills !== undefined) {
        world.pendingKills.length = 0
      }

      const activePlayers = Math.max(
        1,
        Math.min(8, world.players.filter(p => p.alive).length || numPeers || 1),
      )

      for (const event of killEvents) {
        if (event.kind !== 'kill') continue
        const monster =
          event.monsterIndex !== undefined
            ? (world.monsters[event.monsterIndex] ??
              world.monsters.find(m => m.index === event.monsterIndex))
            : world.monsters.find(
                m => m.stats.id === event.subjectId && Math.hypot(m.x - event.x, m.y - event.y) < 10,
              )
        if (monster?.dropRolled) continue
        if (monster) {
          monster.dropRolled = true
        }

        const subjectId = (event.subjectId ?? monster?.stats.id ?? '').trim()
        const monsterRank = event.monsterRank ?? monster?.stats.rank ?? 'normal'
        const isMinion = monsterRank === 'minion'
        const monsterType = isMinion
          ? 3
          : (event.monsterType ??
            (monsterRank === 'boss'
              ? 4
              : monsterRank === 'unique'
                ? 3
                : monsterRank === 'champion'
                  ? 2
                  : 1))

        const suDef = event.superUniqueId
          ? (dropTables.superUniques.get(event.superUniqueId) ??
            (() => {
              const target = event.superUniqueId!.trim().toLowerCase()
              for (const [k, v] of dropTables.superUniques) {
                if (
                  k.toLowerCase() === target ||
                  v.id.toLowerCase() === target ||
                  v.nameKey?.toLowerCase() === target
                ) {
                  return v
                }
              }
              return undefined
            })())
          : undefined

        let tcName = ''
        if (!isMinion && suDef) {
          tcName =
            typeof suDef.getTreasureClass === 'function'
              ? suDef.getTreasureClass(difficulty)
              : suDef.treasureClass
        }

        const monsterKind =
          dropTables.monsterKinds.get(subjectId) ??
          dropTables.monsterKinds.get(`${subjectId}1`) ??
          (suDef ? dropTables.monsterKinds.get(suDef.monsterId) : undefined)

        if (!tcName && monsterKind) {
          tcName = getMonsterTreasureClass(monsterKind, difficulty, monsterType)
        }
        if (!tcName && !monsterKind && !suDef) {
          tcName = 'Act 1 H2H A'
        }
        if (!tcName) continue

        const rawKindLevel = (monsterKind as unknown as { level?: unknown })?.level
        const diffIdx = difficulty === 'nightmare' ? 1 : difficulty === 'hell' ? 2 : 0
        const kindLevel =
          typeof rawKindLevel === 'number'
            ? rawKindLevel
            : Array.isArray(rawKindLevel)
              ? Number(rawKindLevel[diffIdx] ?? rawKindLevel[0] ?? 1)
              : typeof rawKindLevel === 'object' && rawKindLevel !== null
                ? Number((rawKindLevel as Record<string, number>)[difficulty] ?? 1)
                : undefined
        const nLevel = Math.max(1, event.monsterLevel ?? monster?.stats.level ?? kindLevel ?? 1)
        const monsterIndex = monster?.index ?? event.monsterIndex ?? 0
        const monsterSeed =
          monster?.dwInitSeed ?? ((seed ^ Math.imul(monsterIndex + 1, 0x9e3779b9)) >>> 0 || 1)

        const droppedItems = executeDropPipeline(dropTables, {
          tcName,
          nLevel,
          monsterType,
          difficulty,
          gamePlayers: activePlayers,
          partyPlayers: activePlayers,
          playerMf: 0,
          playerGf: 0,
          isBoss: isMinion ? false : Boolean(monsterKind?.boss),
          isNoRatio: Boolean(monsterKind?.noRatio),
          monsterRng: new D2Rng(monsterSeed),
        })

        const burstOccupied: { x: number; y: number }[] = ground.map(g => ({ x: g.x, y: g.y }))
        const alivePlayers = world.players.filter(p => p.alive)
        const refPlayers = alivePlayers.length > 0 ? alivePlayers : world.players
        let reachableFrom: { x: number; y: number } | undefined
        if (refPlayers.length > 0) {
          let bestPlayer = refPlayers[0]!
          let bestDist = Math.hypot(bestPlayer.x - event.x, bestPlayer.y - event.y)
          for (let pIdx = 1; pIdx < refPlayers.length; pIdx += 1) {
            const p = refPlayers[pIdx]!
            const d = Math.hypot(p.x - event.x, p.y - event.y)
            if (d < bestDist) {
              bestDist = d
              bestPlayer = p
            }
          }
          reachableFrom = { x: bestPlayer.x, y: bestPlayer.y }
        }
        for (const drop of droppedItems) {
          const dropPos = findIsometricDropPosition(
            event.x,
            event.y,
            burstOccupied,
            mapTerrain,
            undefined,
            undefined,
            undefined,
            undefined,
            reachableFrom,
          )
          burstOccupied.push(dropPos)
          ground.push({ x: dropPos.x, y: dropPos.y, item: drop })
        }
      }

      inputs.forEach((input, index) => {
        if (input.pickup && ground.length > 0) {
          const player = world.players[index]
          if (player) {
            let bestIndex = -1
            let bestEdgeDist = 64
            for (let gIdx = 0; gIdx < ground.length; gIdx += 1) {
              const g = ground[gIdx]!
              const edgeDist = getPickupEdgeDistance(player.x, player.y, g.x, g.y)
              if (edgeDist <= bestEdgeDist) {
                bestEdgeDist = edgeDist
                bestIndex = gIdx
              }
            }
            if (bestIndex !== -1 && inventories[index]!.add(ground[bestIndex]!.item) !== null) {
              ground.splice(bestIndex, 1)
            }
          }
        }
      })
    },
    hash: () => computeLockstepHash(world, inventories, ground, quests.all),
  }
  return { simulation, inventories, quests, ground }
}
