import { appraisalContextOf } from '../../common/items/loot-context.ts'
import { MONSTER_PATH_IDS } from '../../common/path/monster-path-data.ts'
import { getLevelMonsterLevel113c } from '../../common/world/levels-monlvl-113c.ts'
import { CANONICAL_113C_OBJECTS, WAYPOINT_CLASS_IDS_113C } from '../../common/world/objects-meta.ts'
import type { ItemData } from '../../netproto/index.ts'
import { BOSS_CLASSES, TELEPORT } from '../input/combat-planner.ts'
import { scrollsCarried, scrollSource } from '../input/town-portal.ts'
import { isClosedDoor, type PlayAssists } from '../input/play-assists.ts'
import type { LevelView } from '../map/level-view.ts'
import { firstPad, guessPartner, presetPartners, Regions, type Pad } from './pad-routes.ts'
import type { SubTilePoint } from '../motion/pathfind.ts'
import type { HudModel } from '../ui-model/hud-model.ts'
import { waitFor } from '../ui-model/stash-deposit.ts'
import type { HudManager } from '../ui/hud-manager.ts'
import type { ClientUnit } from '../world/client-unit.ts'
import type { ClientWorld } from '../world/client-world.ts'
import { useArtisan, type ArtisanKind } from './artisan.ts'
import { freeSpots } from '../input/auto-loot.ts'
import { inventoryPotions, potionCushion, STATE_HEALTHPOT } from '../input/auto-potion.ts'
import { vendorPrice113c } from '../ui-model/vendor-price.ts'
import { getInventoryGoldLimit, getStashGoldLimit } from '../../common/items/inventory-model.ts'
import { nextSocketMove, type SocketMove } from './socket-plan.ts'
import { readyRecipe, runeRecipe, takeOut, transmute, withdraw, withdrawItems, type ReadyRecipe } from './cube-recipes.ts'
import { buildOf, nextSkill, nextStat } from './build-plan.ts'
import { alongLine } from './chevron-flow.ts'
import { ENVIRONMENT, worthUsing } from './environment.ts'
import { mercUpgrade } from './merc-gear.ts'
import { XpLedger } from './xp-ledger.ts'
import { hireIdOf, MERCENARIES, pickMercenary, type HireCandidate } from './mercenary.ts'
import { bareSlotsOf, gamblePick, gambleReserve, gambleTreat, GAMBLING_RULES } from './gambling.ts'
import { gambleWorthy, misfits, slotOf } from '../../common/items/loot-appraisal.ts'
import { FlowField } from './flow-field.ts'
import type { GuidePlan, GuideTarget, PathGuide } from './path-guide.ts'
import LAIRS from './data/boss-lairs.json'
import { WAYPOINT_LEVELS } from './level-links.ts'
import { TrainingFloor } from './training-floor.ts'
import { OPTIONAL_ROWS } from './quest-stages.ts'
import { bareSlots, GEAR_HUNT_MS, GEAR_REST_MS, lockedLevels, NAKED_SLOTS, readiness, setbacksOf, slowGround, trainingGround, type Readiness, type Trainee } from './training.ts'
import { ACT_TOWNS, actOfLevel, levelName, type Goal } from './route.ts'
import TOWNS from './data/towns.json'
import THREAT from '../../common/skills/data/monster-threat.json'
import QUEST_OBJECTS from './data/quest-objects.json'
import POTIONS from './data/potions.json'

export interface AutopilotHost {
  readonly world: ClientWorld
  readonly hudManager: HudManager
  readonly hudModel: HudModel | null
  readonly assists: PlayAssists
  readonly guide: PathGuide
  readonly levelView: () => LevelView | null
}

type Service = keyof (typeof TOWNS)['Rogue Encampment']

interface Errand {
  readonly key: string
  readonly reason: string
  readonly npc?: Service
  readonly who?: string
  readonly stash?: true
  readonly action?: string
  readonly work?: () => Promise<unknown>
}

const TICK_MS = 60
const WALK_MS = 200
const LOOKAHEAD = 15
const TELEPORT_AHEAD = 24
const TELEPORT_MS = 300
const TELEPORT_MANA = 0.5
const TELEPORT_MISSES = 3
const TELEPORT_OFF_MS = 60_000
const REACH = 4
const ARRIVED = 8
const FIGHT_ROAM = 20
const FUTILE_FIGHT_MS = 120_000
const HARMLESS_MS = 180_000
const HARMLESS_BREAK_MS = 90_000
const TICK_GAP_MS = 1000
const DISENGAGE_MS = 25_000
const SPOT_NEAR = 20
const INTERACT_REACH = 14
const QUEST_FOCUS = 25
const LOOT_SETTLE_MS = 700
const STALL_MS = 1500
const PAD_CLASSES: ReadonlySet<number> = new Set([192, 304, 305, 306])
const PAD_SAME = 4
const CORPSE_SAME = 3
const ASSESS_MS = 5000
const STASH_OPEN_MS = 6000
const RALLY_MS = 45_000
const PREP = 'Stocking up before'
const CORPSE_GONE = 10
const BODY_GONE_MS = 3000
const PILE_NEAR = 6
const UNLOAD_MS = 600_000
const SHOP_FILL_MS = 3000
const SHOP_SETTLE_MS = 600
const SHOP_TRIES = 3
const VENDOR_ACTIONS = new Set(['trade', 'trade_repair', 'gamble'])
const LAST_STAND_MS = 20_000
const LAST_STAND_KITE = 0.35
const UNLOAD_ITEMS = 2
const GOLD = 'gld'
const REVIVE_MS = 2500
const DEATH_MEMORY_MS = 20 * 60_000
const SIDE_QUEST_MS = 30 * 60_000
const TRAINING_PATIENCE_MS = 45 * 60_000
const HUMBLED = 'Too strong'
const SPIRAL_MS = 15 * 60_000
const SPIRAL_DEATHS = 3
const DEATH_CAUTION = 0.08
const MAX_CAUTION = 0.24
const HUNT_CAUTION = 0.16
const DOOM_MS = 4000
const KITE_CROWD = 3
const DOOM_MAX_MS = 7000
const DOOM_CROWD = 4
const DOOM_PER_FOE_MS = 250
const DOOM_MIN_LOSS = 0.15
const POTION_TRUST = 0.5
const ELITE_PULL = 12
const PACK_PULL = 3
const PACK_RADIUS = 6
const UNREACHED_ROOM = 1000
const WAYPOINT_GRAB = 40
const PAD_REUSE_MS = 120_000
const PAD_ARRIVAL_MS = 4000
const PAD_JUMP = 20
const PAD_ARRIVAL_NEAR = 12
const PAD_FIELD_CELL = 4
const PAD_FIELD_MS = 3000
const PAD_PRESS_MS = 1500
const PAD_PRESSES = 5
const STALL_MOVE = 3
const DOOR_NEAR = 8
const DOOR_LOOKAHEAD = 20
const DOOR_ON_ROUTE = 4
const USE_MS = 600
const USE_TRIES = 8
const BACK_OFF = 5
const WAYPOINT_ROUNDS = 3
const PORTAL_LOOK_MS = 3000
const BODY_GRAB = 12
const CURSOR_SETTLE_MS = 1000
const INVENTORY_BUFFER = 0
const TALK_MS = 700
const SPEECH_SKIP_MS = 80
const BRIEFING_MS = 3000
const CARE_START_MS = 350
const REPAIR_MS = 300
const STUCK_TALK_MS = 20_000
const STUCK_MS = 3200
const STUCK_MOVE = 1.5
const HEADWAY_MS = 4000
const HEADWAY_GAIN = 3
const HEADWAY_TRAVEL = 8
const HEADWAY_IDLE_MS = 1000
const HEADWAY_SAME = 8
const BLOCKED_NEAR = 10
const UNSTICK_MOVES = [
  { ahead: LOOKAHEAD, side: 0, back: 0 },
  { ahead: 4, side: 0, back: 0 },
  { ahead: 2, side: 0, back: 0 },
  { ahead: 4, side: 4, back: 0 },
  { ahead: 4, side: -4, back: 0 },
  { ahead: 2, side: 0, back: 10 },
] as const
const MANUAL_PAUSE_MS = 4000
const ERRAND_COOLDOWN_MS = 300_000
const HEAL_COOLDOWN_MS = 8000
const RESTOCK_COOLDOWN_MS = 20_000
const ERRAND_TIMEOUT_MS = 45_000
const RETREAT_LIFE = 0.35
const DRY_LIFE = 0.6
const MIN_RETREAT_LIFE = 0.2
const MAX_RETREAT_LIFE = 0.5
const GAP_CAUTION = 0.03
const STOCKED_POTIONS = 4
const STOCKED_NERVE = 0.12
const HUNT_LIFE = 0.6
const HUNT_POTIONS = 2
const HUNT_GAP = 2
const HUNT_RADIUS = 30
const HUNT_MS = 8000
const HUNT_IGNORE_MS = 30_000
const LAST_POTION_LIFE = 0.45
const BURST_MS = 3000
const BURST_LOSS = 0.4
const KITE_NEAR = 5
const KITE_STEP = 9
const KITE_MS = 2500
const SEAM_JUMP = 20
const SPEND_MS = 1500
const HEAL_LIFE = 0.7
const HEAL_PATIENCE_MS = 15_000
const RECOVERED_LIFE = 0.85
const HEAL_MANA = 0.4
const REPAIR_BELOW = 0.3
const POTION_COLUMNS = { melee: [3, 1], caster: [2, 2] } as const
const POTION_GOLD = 100
const SPARE_POTIONS = { melee: [4, 1], caster: [3, 3] } as const
const SPARE_GOLD = 2000
const BELT_ROWS = 4
const GEAR_ROOM = 8
const INVENTORY_CELLS = 40
const SHOP_GOLD = 6000
const BARE_SHOP_GOLD = 300
const BARE_RESERVE = 150
const RESERVE_PER_LEVEL = 25
const PURSE_LOW = 3000
const PURSE_PER_LEVEL = 200
const SHOP_PURSE_PER_LEVEL = 1000
const WITHDRAW_SHORT = 0.9
const BANK_MARGIN = 2000
const POTION_SHARE = 4
const BUY_TRIES = 16
const MERC_ITEM_MS = 1500
const HIRE_LIST_MS = 3000
const BUY = 0 as const
const GAMBLE = 2 as const
const GEAR_BUYS = 6
const SCROLL_KINDS = {
  portal: { tome: 'tbk', scroll: 'tsc', tomeGold: 500, keep: 10, spare: 2 },
  identify: { tome: 'ibk', scroll: 'isc', tomeGold: 300, keep: 10, spare: 0 },
} as const
const SCROLL_GOLD = 100
const IDENTIFY_MS = 1500
const IDENTIFY_TRIES = 3
const QUEST_STALE_MS = 30_000
const RETHINK_MS = 90_000
const RETHINK_EXPLORE_MS = 30_000
const RETHINK_GAIN = 10
const REGROUP = 'Stuck here, regrouping in town'
const ERRAND = 'Heading to town by portal:'
const ERRAND_WALK = 50
const ON_FOOT = 'on foot'
const planned = (why: string) => why.startsWith(PREP) || why.startsWith(ERRAND) || why === REGROUP
const ROOM_REACHED = 8
const ROOM_END = 3
const STASH_CLASS = 267
const CUBE_CODE = 'box'
const STAFF_CODE = 'hst'
const TOWN_PORTAL_CLASS = 59
const PORTAL_REACH = 12
const TRAVEL_OPTIONS = ['travel_east', 'travel_west', 'travel_harrogath']
const ARTISANS: readonly ArtisanKind[] = ['imbue', 'add_sockets']
const WARP_NEAR = 7
const SEAM_STEP = 20
const CROSS_MS = 4000
const GAP_MS = 2500
const GAP_STEP = 12
const GAP_TRIES = 6

const distance = (a: SubTilePoint, b: SubTilePoint) => Math.hypot(a.x - b.x, a.y - b.y)
const isElite = (unit: ClientUnit) => [unit.isChampion, unit.isUnique, unit.isSuperUnique].includes(true)
const WIELD = new Map(Object.values(QUEST_OBJECTS.wield).map((entry) => [entry.object, entry]))
const TOOLS = new Set(Object.values(QUEST_OBJECTS.wield).map((entry) => entry.item))
const BOSSES = new Set(LAIRS.bosses.map((name) => MONSTER_PATH_IDS.indexOf(name)))
const BOONS = new Map(Object.entries(QUEST_OBJECTS.boons).map(([name, code]) => [code, name]))
const EXIT_OBJECTS: ReadonlySet<number> = new Set(Object.values(QUEST_OBJECTS.exits))
const LEVERS = new Map(Object.values(QUEST_OBJECTS.levers).map((entry) => [entry.object, entry.lever]))
const SWEEP: ReadonlySet<number> = new Set(Object.values(QUEST_OBJECTS.sweep))
const ROTATE: ReadonlySet<number> = new Set(Object.values(QUEST_OBJECTS.rotate).flat())
const BRIDGES = new Map(Object.values(QUEST_OBJECTS.bridges).map((entry) => [entry.object, entry]))
const selectable = (unit: ClientUnit) => (((CANONICAL_113C_OBJECTS[unit.classId]?.selectableMask ?? 1) >> unit.mode) & 1) === 1
const codeOf = (item: ItemData) => item.code.trim()
type PadSpot = Pad & { readonly unit?: ClientUnit; readonly partner?: SubTilePoint | undefined }
const padKey = (pad: SubTilePoint) => `${Math.round(pad.x)},${Math.round(pad.y)}`
const potionTier = (code: string) => Number(code.slice(2)) || 0

export class Autopilot {
  active = false
  private lastTick = Number.NEGATIVE_INFINITY
  private lastWalk = Number.NEGATIVE_INFINITY
  private blink: { readonly at: number; readonly from: SubTilePoint; readonly pending: boolean; readonly misses: number; readonly offUntil: number } | null = null
  private pausedUntil = Number.NEGATIVE_INFINITY
  private progress = { ms: 0, x: 0, y: 0 }
  private job: Promise<unknown> | null = null
  private bridge: { readonly id: number; at: number | null } | null = null
  private readonly briefed = new Set<string>()
  private readonly uses = new Map<number, { readonly at: number; readonly tries: number }>()
  private readonly stubborn = new Map<number, number>()
  private readonly scavenged = new Set<number>()
  private readonly mercTried = new Set<number>()
  private readonly ledger = new XpLedger()
  private stint: { readonly area: number; readonly level: number; readonly at: number; readonly xp: number } | null = null
  private game: { readonly selfId: number; readonly at: number } | null = null
  private headway: { readonly goal: SubTilePoint; best: number; from: SubTilePoint; at: number; tries: number } | null = null
  private blocked: SubTilePoint[] = []
  private held: { readonly id: number; readonly since: number; at: number; tries: number } | null = null
  private readonly errandsAt = new Map<string, number>()
  private talk: { readonly npcId: number; readonly hint: string; readonly since: number; at: number; spoke: boolean; opened: boolean; readonly heard: Set<string> } | null = null
  private waypointTo: number | null = null
  private readonly explored = new Map<number, Set<number>>()
  private exploreField: { readonly key: string; readonly field: FlowField } | null = null
  private trip: 'retreat' | 'return' | null = null
  private retreatWhy = ''
  private trail: { readonly level: number; readonly at: SubTilePoint; readonly before: SubTilePoint }[] = []
  private leftBehind: typeof this.trail = []
  private deadEnd: (typeof this.trail)[number] | null = null
  private sheathed: number | null = null
  private gearRestUntil = Number.NEGATIVE_INFINITY
  private rotatedAt = Number.NEGATIVE_INFINITY
  private reachedSpot: string | null = null
  private reading: Readonly<Record<string, number | null>> = {}
  private fightWatch: { readonly x: number; readonly y: number; readonly since: number } | null = null
  private disengagedUntil = Number.NEGATIVE_INFINITY
  private harm: { readonly xp: number; at: number; fought: number; warned: boolean } | null = null
  lastStop: { readonly title: string; readonly detail: string } | null = null
  private lastSpot: { readonly level: number; readonly x: number; readonly y: number } | null = null
  private kiteSince: number | null = null
  private questWatch = { hint: '', since: 0, asked: Number.NEGATIVE_INFINITY }
  private lastHeadway: { at: number; xp: number; area: number; hint: string; best: number; tries: number } | null = null
  private rethinkUntil = Number.NEGATIVE_INFINITY
  private chase: { readonly id: number; readonly since: number } | null = null
  private readonly ignored = new Map<number, number>()
  private readonly served = new Set<ArtisanKind>()
  private lootUntil = Number.NEGATIVE_INFINITY
  private stall = { x: 0, y: 0, at: 0 }
  private padsUsed: { readonly x: number; readonly y: number; readonly until: number }[] = []
  private padFrom: { readonly x: number; readonly y: number; readonly at: number; readonly pad: SubTilePoint } | null = null
  private regions: { readonly level: number; readonly regions: Regions } | null = null
  private readonly landings = new Map<string, SubTilePoint>()
  private padCache: { readonly key: string; readonly at: number; readonly field: FlowField } | null = null
  private healWait: { readonly life: number; readonly since: number } | null = null
  private lifeLog: readonly { readonly at: number; readonly life: number }[] = []
  private crossing: { readonly to: SubTilePoint; readonly until: number } | null = null
  private gapSearch: { readonly since: number; readonly from: SubTilePoint } | null = null
  private lastSpend = Number.NEGATIVE_INFINITY
  private corpse: { readonly level: number; readonly x: number; readonly y: number } | null = null
  private bodyTouch: { readonly id: number; readonly worn: number } | null = null
  private portalHome: { readonly x: number; readonly y: number; readonly at: number } | null = null
  private readonly ghosts = new Set<number>()
  private deaths: readonly { readonly at: number; readonly level: number }[] = []
  private retreats: readonly { readonly at: number; readonly level: number; readonly boss: boolean }[] = []
  private lastStand = Number.NEGATIVE_INFINITY
  private forgiven = Number.NEGATIVE_INFINITY
  private ground: { readonly level: number; readonly at: number; readonly experience: number; readonly charLevel: number } | null = null
  private readonly floor = new TrainingFloor()
  private sideQuest: { readonly row: number; readonly word: number; readonly at: number } | null = null
  private training: (Readiness & { readonly ground: number; readonly since: number }) | null = null
  private readonly trainedOut = new Set<number>()
  private questLevel: number | null = null
  private assessedAt = Number.NEGATIVE_INFINITY
  private lastRevive = Number.NEGATIVE_INFINITY
  private bodySeen = Number.NEGATIVE_INFINITY
  private unloadedAt = Number.NEGATIVE_INFINITY
  private pile: { readonly level: number; readonly x: number; readonly y: number; readonly selfId: number } | null = null
  private readonly prepared = new Map<string, number>()
  private rallying: { readonly boss: string; readonly since: number } | null = null
  spendPoints = false

  constructor(private readonly host: AutopilotHost) {}

  toggle(): void {
    if (this.active) this.stop('Autopilot off', 'tan')
    else this.start()
  }

  start(): void {
    const { assists, guide } = this.host
    Object.assign(this, { active: true, pausedUntil: Number.NEGATIVE_INFINITY, talk: null, waypointTo: null, trip: null })
    this.uses.clear()
    this.errandsAt.clear()
    guide.enabled = true
    assists.questPickup = true
    this.toast('Autopilot on', assists.pilotKey ? `Press ${assists.pilotKey} or click to take over` : 'Click anywhere to take over', 'green')
  }

  stop(title: string, color: 'tan' | 'red' | 'gold' = 'tan', detail = ''): void {
    const { assists, guide } = this.host
    Object.assign(this, { active: false, job: null, talk: null, crossing: null })
    Object.assign(assists, { pilotCombat: false, questPickup: false, standDown: false, holdLoot: false })
    guide.pilotStatus = null
    guide.detour = null
    this.lastStop = { title, detail }
    this.toast(title, detail, color)
  }

  tick(nowMs: number): void {
    if (!this.active || nowMs - this.lastTick < TICK_MS) return
    this.lastTick = nowMs
    const { world, assists } = this.host
    if (assists.playerSteering) this.pausedUntil = nowMs + MANUAL_PAUSE_MS
    if (world.areaId > 0) this.noteArea()
    if (world.areaId > 0 && !world.isDead) this.noteExperience(nowMs)
    this.noteArrival(nowMs)
    this.sideQuestCheck(nowMs)
    if (world.isDead) this.mourn(nowMs)
    else if (nowMs < this.pausedUntil) this.say('Paused while you play')
    else if (world.areaId > 0 && !this.job) this.decide(nowMs)
  }

  private mourn(nowMs: number): void {
    const { world, hudModel } = this.host
    if (this.corpse?.level !== world.areaId || distance(this.corpse, world.self) > CORPSE_SAME) {
      this.corpse = { level: world.areaId, x: world.self.x, y: world.self.y }
      this.deaths = [...this.deaths.filter((death) => nowMs - death.at < DEATH_MEMORY_MS), { at: nowMs, level: this.questLevel ?? world.areaId }]
      Object.assign(this, { trip: null, crossing: null, talk: null, chase: null })
      const spiral = this.deaths.filter((death) => nowMs - death.at < SPIRAL_MS && death.level === this.deaths.at(-1)!.level).length
      if (spiral >= SPIRAL_DEATHS) {
        this.host.assists.journal?.('spiral', { deaths: spiral, level: world.areaId })
        this.stop('Autopilot needs you', 'red', `Died ${spiral} times in ${levelName(world.areaId)}: get the body back by hand, and don't leave the game before you have it`)
        return
      }
      this.toast('You died', 'Going back for your body', 'red')
    }
    this.say('Died, going back for your body')
    if (nowMs - this.lastRevive < REVIVE_MS) return
    this.lastRevive = nowMs
    hudModel?.resurrect()
  }

  private corpseGoal(): Goal | null {
    const { corpse, pile } = this
    if (corpse) return { level: corpse.level, title: 'Your body', hint: 'Get your body back', spot: { x: corpse.x, y: corpse.y } }
    return pile && pile.selfId === this.host.world.selfId ? { level: pile.level, title: 'Your gold', hint: 'Pick up the gold you dropped', spot: { x: pile.x, y: pile.y } } : null
  }

  private dropped(corpse: { readonly level: number; readonly x: number; readonly y: number }): void {
    this.pile = { ...corpse, selfId: this.host.world.selfId }
  }

  private goldPile(): ClientUnit | null {
    const { world } = this.host
    const pile = this.pile
    if (pile?.level !== world.areaId || pile.selfId !== world.selfId) return null
    const unit = [...world.containers.ground.values()]
      .filter((item) => codeOf(item) === GOLD && distance(item, pile) <= PILE_NEAR)
      .map((item) => world.getUnit('item', item.id))
      .find((found) => found !== undefined)
    if (unit === undefined && distance(pile, world.self) <= CORPSE_GONE) this.pile = null
    return unit ?? null
  }

  private ownBody(): ClientUnit | undefined {
    const { world } = this.host
    return world.getUnitsByType(0).find((unit) => unit.id !== world.selfId && unit.name === world.self.name && !this.ghosts.has(unit.id))
  }

  private bodyRun(nowMs: number): ClientUnit | null {
    const corpse = this.corpse
    const { world } = this.host
    if (corpse?.level !== world.areaId) return null
    const body = this.ownBody()
    if (body && this.bodyTouch?.id === body.id && world.containers.equipment.size > this.bodyTouch.worn) {
      this.ghosts.add(body.id)
      this.dropped(corpse)
      Object.assign(this, { corpse: null, bodyTouch: null })
      this.toast('Got your body back', '', 'green')
      return null
    }
    if (body) {
      this.corpse = { level: corpse.level, x: body.x, y: body.y }
      this.bodySeen = nowMs
      return body
    }
    if (distance(corpse, world.self) <= CORPSE_GONE && nowMs - this.bodySeen > BODY_GONE_MS) {
      this.dropped(corpse)
      this.corpse = null
      this.toast('Got your body back', '', 'green')
    }
    return null
  }

  private recover(body: ClientUnit, nowMs: number): void {
    this.say(body.unitType === 'item' ? 'Picking up the gold you dropped' : 'Picking up your body')
    if (this.bodyTouch?.id !== body.id) this.bodyTouch = { id: body.id, worn: this.host.world.containers.equipment.size }
    const target = this.host.guide.update(nowMs)?.target
    const routed = target !== null && target !== undefined && distance(target, body) <= REACH * 2
    if (distance(body, this.host.world.self) <= REACH) this.touch(body, nowMs)
    else if (routed && this.takePad(target, nowMs)) return
    else if (routed) this.walkRoute(nowMs)
    else this.walkTowards(body, nowMs)
  }

  private bossAhead(): string | null {
    const { world, guide } = this.host
    const plan = guide.currentPlan
    const target = plan?.target
    const near = target !== null && target !== undefined && distance(target, world.self) <= LAIRS.range
    const marks = new Set([...(plan?.step?.kind === 'portal' ? plan.step.find.flat() : []), ...(plan?.goal.find ?? []).flat()])
    const lair = Object.entries(LAIRS.levels).find(([, level]) => level === world.areaId && plan?.goal.level === level)?.[0]
    const spot = near ? Object.entries(LAIRS.objects).find(([, classId]) => marks.has(classId))?.[0] : undefined
    return lair ?? spot ?? null
  }

  private prepareFor(nowMs: number): void {
    const { world, hudManager, assists } = this.host
    const boss = this.bossAhead()
    if (boss === null || nowMs - (this.prepared.get(boss) ?? Number.NEGATIVE_INFINITY) < LAIRS.lingerMs || !assists.hasTownPortal()) return
    if (this.potionsWanted() === 0 && world.self.life >= (hudManager.maxHp || world.self.maxLife) * RECOVERED_LIFE) return
    this.prepared.set(boss, nowMs)
    Object.assign(this, { trip: 'retreat', retreatWhy: `${PREP} ${boss}, heading to town` })
  }

  private unload(nowMs: number): void {
    const { world, assists } = this.host
    const care = assists.inventoryCare
    if (this.corpse !== null || nowMs - this.unloadedAt < UNLOAD_MS || !assists.hasTownPortal()) return
    if (new Set([...care.sellable, ...care.stashable, ...care.upgrades, ...this.unidentified()]).size < UNLOAD_ITEMS || freeSpots(world.containers.inventory.values(), 2, 2).length > 0) return
    this.unloadedAt = nowMs
    Object.assign(this, { trip: 'retreat', retreatWhy: `${ERRAND} bags are full` })
  }

  private rally(nowMs: number): boolean {
    const boss = this.bossAhead()
    if (boss === null || !this.host.assists.canRaise()) return false
    if (this.rallying?.boss !== boss || nowMs - this.rallying.since > LAIRS.lingerMs) this.rallying = { boss, since: nowMs }
    if (nowMs - this.rallying.since > RALLY_MS) return false
    this.say(`Raising an army before ${boss}`)
    return true
  }

  private assess(nowMs: number): void {
    const { world, guide } = this.host
    const plan = guide.currentPlan
    if (guide.detour === null && plan) this.questLevel = plan.goal.level
    if (nowMs - this.assessedAt < ASSESS_MS || this.corpse !== null || this.trip !== null || this.questLevel === null) return
    this.assessedAt = nowMs
    const me = this.trainee()
    const training = this.training
    const character = `${world.self.name}:${world.difficulty}`
    if (training) {
      const restless = training.why.startsWith(HUMBLED) && nowMs - training.since > TRAINING_PATIENCE_MS
      if (restless || (me.level >= training.level && me.gold >= training.gold && (me.bare <= training.bare || (nowMs - training.since > GEAR_HUNT_MS && me.bare < NAKED_SLOTS)))) {
        Object.assign(this, { training: null, ground: null, forgiven: nowMs, gearRestUntil: me.bare > training.bare ? nowMs + GEAR_REST_MS : this.gearRestUntil })
        if (restless) this.floor.set(character, this.questLevel, 0)
        this.toast(restless ? 'Trying again' : 'Ready to carry on', `Heading back to ${levelName(this.questLevel)}`, 'green')
      }
      return
    }
    const need = readiness(me, this.questLevel, this.setbacks(nowMs), nowMs >= this.gearRestUntil || me.bare >= NAKED_SLOTS, this.floor.of(character, this.questLevel))
    const ground = need && trainingGround(world.areaId, me, this.waypointLevels(), this.offLimits(), this.rateOf(), lockedLevels(this.host.world.quests))
    if (!need || ground === null) return
    if (need.level > me.level) this.floor.set(character, this.questLevel, need.level)
    this.training = { ...need, ground, since: nowMs }
    this.toast(need.why, `In ${levelName(ground)}`, 'gold')
  }

  private offLimits(): ReadonlySet<number> {
    return new Set([...this.trainedOut, ...lockedLevels(this.host.world.quests)])
  }

  private setbacks(nowMs: number): number {
    const counts = (log: readonly { readonly at: number; readonly level: number }[]) => log.filter((entry) => entry.level === this.questLevel && entry.at > this.forgiven && nowMs - entry.at < DEATH_MEMORY_MS).length
    return setbacksOf(counts(this.deaths) + counts(this.retreats.filter((entry) => entry.boss)), counts(this.retreats.filter((entry) => !entry.boss)))
  }

  private passingThrough(): boolean {
    return this.training !== null && this.host.world.areaId !== this.training.ground
  }

  private rateOf(): (area: number) => number | undefined {
    const { self } = this.host.world
    return (area) => this.ledger.rate(self.name, area, self.level)
  }

  private noteExperience(nowMs: number): void {
    const { world } = this.host
    const me = world.self
    const stint = this.stint
    const roundTrip = this.trip !== null && this.town() && stint !== null && !(ACT_TOWNS as readonly number[]).includes(stint.area)
    if (stint && (stint.area === world.areaId || roundTrip) && stint.level === me.level) return
    if (stint && !(ACT_TOWNS as readonly number[]).includes(stint.area)) this.ledger.add(me.name, stint.area, stint.level, me.experience - stint.xp, nowMs - stint.at)
    this.stint = { area: world.areaId, level: me.level, at: nowMs, xp: me.experience }
  }

  private trainee(): Trainee {
    const { world } = this.host
    return { level: world.self.level, gold: world.self.gold + world.self.stashGold, bare: this.bare(), difficulty: world.difficulty }
  }

  private bare(): number {
    const { equipment } = this.host.world.containers
    const build = appraisalContextOf(this.host.world).build
    return bareSlots(equipment.values()) + [...equipment.values()].filter((item) => Boolean(item.code) && misfits(item, build)).length
  }

  private waypointLevels(): ReadonlySet<number> {
    return new Set([...this.host.world.waypoints].flatMap((id) => WAYPOINT_LEVELS.get(id) ?? []))
  }

  private trainingGoal(): Goal | null {
    const training = this.training
    return training && { level: training.ground, title: 'Training', hint: `${training.why} in ${levelName(training.ground)}` }
  }

  private trainElsewhere(): boolean {
    const training = this.training
    if (training === null || this.host.guide.detour === null) return false
    this.trainedOut.add(training.ground)
    const next = trainingGround(this.host.world.areaId, this.trainee(), this.waypointLevels(), this.offLimits(), this.rateOf(), lockedLevels(this.host.world.quests))
    if (next === null) return false
    this.training = { ...training, ground: next }
    this.toast('Training somewhere else', `No way into ${levelName(training.ground)}, going to ${levelName(next)}`, 'tan')
    return true
  }

  private train(nowMs: number): boolean {
    const training = this.training
    const view = this.host.levelView()
    const me = this.host.world.self
    if (!training || !view || this.host.world.areaId !== training.ground) return false
    if (this.ground?.level !== training.ground || this.ground.charLevel !== me.level) this.ground = { level: training.ground, at: nowMs, experience: me.experience, charLevel: me.level }
    const slow = slowGround(me.level, me.experience - this.ground.experience, nowMs - this.ground.at)
    if (!slow && this.exploreLevel(view, nowMs, `${training.why} in ${levelName(training.ground)}`)) return true
    this.trainedOut.add(training.ground)
    this.explored.delete(training.ground)
    const next = trainingGround(training.ground, this.trainee(), this.waypointLevels(), this.offLimits(), this.rateOf(), lockedLevels(this.host.world.quests))
    if (next === null) this.trainedOut.clear()
    Object.assign(this, { training: { ...training, ground: next ?? training.ground }, ground: null })
    return true
  }

  private caution(nowMs: number): number {
    return Math.min(MAX_CAUTION, this.deaths.filter((death) => nowMs - death.at < DEATH_MEMORY_MS).length * DEATH_CAUTION)
  }

  private decide(nowMs: number): void {
    const { assists } = this.host
    this.refreshQuests(nowMs)
    this.rethink(nowMs)
    const town = this.town()
    if (town && this.trip === 'retreat') this.portalHome = { x: this.host.world.self.x, y: this.host.world.self.y, at: nowMs }
    this.trip = town && this.trip === 'retreat' ? 'return' : !town && this.trip === 'return' ? null : this.trip
    if (this.trip === 'retreat' && !town && this.recovered() && !planned(this.retreatWhy)) this.trip = null
    if (!town && this.trip === null) this.prepareFor(nowMs)
    if (!town && this.trip === null) this.unload(nowMs)
    const peril = town ? null : this.trip === 'retreat' ? this.retreatWhy : this.danger(nowMs)
    const danger = nowMs < this.lastStand ? null : peril
    this.assess(nowMs)
    this.host.guide.detour = this.corpseGoal() ?? this.trainingGoal()
    const body = town ? null : (this.bodyRun(nowMs) ?? this.goldPile())
    if (this.harmless(nowMs)) return
    const disengaged = this.futileFight(nowMs)
    assists.pilotCombat = assists.autoCombatKey !== null && danger === null && !disengaged && (body === null || this.cornered(nowMs))
    assists.standDown = (danger !== null || disengaged) && !this.cornered(nowMs)
    assists.holdLoot = this.questInReach()
    if (danger === null) this.spend(nowMs)
    if (this.host.hudManager.leftPanel === 'waypoint' || this.host.hudManager.leftPanel === 'orifice') this.answerPanels(nowMs)
    else if (this.clearCursor(nowMs)) this.say('Putting away the item in hand')
    else if (this.rearm()) this.say('Taking my weapon back')
    else if (!town && this.drinkResists(nowMs)) this.say('Drinking resist potions before the boss')
    else if ((danger === null || !assists.hasTownPortal()) && assists.dodging(nowMs)) this.say('Dodging')
    else if (this.keepCrossing(nowMs)) this.say(danger ?? 'Crossing over')
    else if (body !== null && distance(body, this.host.world.self) <= BODY_GRAB) this.recover(body, nowMs)
    else if (peril !== null && danger === null && this.backOff(nowMs)) this.say('Nowhere to run, backing off')
    else if (danger !== null) this.retreat(danger, nowMs)
    else if (body !== null && !this.cornered(nowMs)) this.recover(body, nowMs)
    else if (!disengaged && assists.isFighting(nowMs)) this.say('Fighting')
    else if (!this.questInReach() && this.looting(nowMs)) this.say('Picking up loot')
    else if (!town && this.gearUp(nowMs)) this.say('Putting on better gear')
    else if (this.repack(nowMs)) this.say('Tidying the bags')
    else if (!this.answerPanels(nowMs)) this.carryOn(town, nowMs)
  }

  private gearUp(nowMs: number): boolean {
    const care = this.host.assists.inventoryCare
    if (care.busy || care.upgrades.length === 0 || nowMs - (this.errandsAt.get('fieldGear') ?? Number.NEGATIVE_INFINITY) < ERRAND_COOLDOWN_MS) return false
    this.errandsAt.set('fieldGear', nowMs)
    this.job = care
      .wearUpgrades()
      .catch(() => 0)
      .finally(() => {
        this.job = null
      })
    return true
  }

  private repack(nowMs: number): boolean {
    const care = this.host.assists.inventoryCare
    if (care.busy || nowMs - (this.errandsAt.get('repack') ?? Number.NEGATIVE_INFINITY) < ERRAND_COOLDOWN_MS || !care.repacking) return false
    this.errandsAt.set('repack', nowMs)
    this.job = care
      .repack()
      .catch(() => false)
      .finally(() => {
        this.job = null
      })
    return true
  }

  private clearCursor(nowMs: number): boolean {
    const { world, hudModel, assists } = this.host
    const held = world.containers.cursor
    if (!held || hudModel === null || assists.inventoryCare.busy) {
      this.held = null
      return false
    }
    if (this.held?.id !== held.id) this.held = { id: held.id, since: nowMs, at: Number.NEGATIVE_INFINITY, tries: 0 }
    const hold = this.held
    if (nowMs - hold.since < CURSOR_SETTLE_MS) return false
    if (nowMs - hold.at < USE_MS) return true
    const spot = freeSpots(world.containers.inventory.values(), held.invWidth, held.invHeight)[0]
    if (spot && hold.tries < USE_TRIES) hudModel.placeCursorItem(held.id, spot.x, spot.y, INVENTORY_BUFFER)
    else {
      hudModel.dropItem(held.id)
      assists.inventoryCare.discarded.add(held.id)
    }
    Object.assign(hold, { at: nowMs, tries: hold.tries + 1 })
    return true
  }

  private carryOn(town: (typeof TOWNS)['Rogue Encampment'] | null, nowMs: number): void {
    const { assists, guide } = this.host
    const errand = town && !this.offTheGrid() ? this.nextErrand(town, nowMs) : null
    if (errand) this.run(errand, nowMs)
    else if (town && this.healing(nowMs)) this.say('Waiting to heal before heading out')
    else if (!(town && this.trip === 'return' && !guide.currentPlan?.goal.inTown && !this.dryAndBroke() && !this.retreatWhy.endsWith(ON_FOOT) && this.returnThroughPortal(nowMs)) && !(town === null && this.portalErrand(nowMs)) && !(town === null && this.portalFirst(nowMs)) && !(assists.smartSkills && assists.keepUp(null, nowMs)) && !(town === null && assists.pilotCombat && this.hunt(nowMs)) && !(town === null && this.scavenge(nowMs)) && !(town === null && this.grabWaypoint(nowMs)) && !(town === null && this.rally(nowMs)) && !(town === null && this.train(nowMs))) this.follow(guide.update(nowMs), nowMs)
  }

  private refreshQuests(nowMs: number): void {
    const hint = this.host.guide.currentPlan?.hint ?? ''
    if (this.questWatch.hint !== hint) this.questWatch = { hint, since: nowMs, asked: this.questWatch.asked }
    const stale = nowMs - this.questWatch.since >= QUEST_STALE_MS && nowMs - this.questWatch.asked >= QUEST_STALE_MS
    if (!stale || this.host.hudModel === null) return
    this.questWatch = { ...this.questWatch, asked: nowMs }
    this.host.hudModel.requestQuestData()
    this.host.assists.journal?.('quests', { hint })
  }

  private say(status: string): void {
    if (this.host.guide.pilotStatus !== status) this.host.assists.journal?.('status', { status })
    this.host.guide.pilotStatus = status
  }

  report(): Readonly<Record<string, unknown>> {
    const target = this.host.guide.currentPlan?.target
    return { on: this.active, trip: this.trip, job: this.job !== null, crossing: this.crossing !== null, trail: this.trail.map((spot) => spot.level), gap: this.levelGap(), potions: this.healingPotions(), target: target && [Math.round(target.x), Math.round(target.y), target.label], reaches: this.host.guide.reaches(this.host.world.self) }
  }

  private toast(title: string, detail: string, color: 'green' | 'tan' | 'red' | 'gold'): void {
    this.host.assists.journal?.('toast', { title, detail })
    this.host.hudManager.toasts.push({ title, detail, color }, performance.now())
  }

  private town(): (typeof TOWNS)['Rogue Encampment'] | null {
    return (TOWNS as Readonly<Record<string, (typeof TOWNS)['Rogue Encampment']>>)[levelName(this.host.world.areaId)] ?? null
  }

  private rethink(nowMs: number): void {
    const { world, guide } = this.host
    const me = world.self
    const plan = guide.currentPlan
    const hint = plan?.hint ?? ''
    const left = plan?.target ? distance(plan.target, me) : Number.POSITIVE_INFINITY
    const last = this.lastHeadway
    if (this.town() || nowMs < this.pausedUntil || this.host.assists.isFighting(nowMs)) {
      if (last) Object.assign(last, { at: nowMs })
      return
    }
    if (!last || last.hint !== hint || me.experience > last.xp) {
      this.lastHeadway = { at: nowMs, xp: me.experience, area: world.areaId, hint, best: left, tries: 0 }
      return
    }
    if (last.area !== world.areaId || left < last.best - RETHINK_GAIN) {
      Object.assign(last, { at: nowMs, area: world.areaId, best: left })
      return
    }
    if (nowMs - last.at < RETHINK_MS) return
    Object.assign(last, { at: nowMs, tries: last.tries + 1 })
    this.host.assists.journal?.('rethink', { tries: last.tries, hint, left: Math.round(left) })
    if (last.tries === 1) {
      this.uses.clear()
      this.ignored.clear()
      this.explored.delete(world.areaId)
      Object.assign(this, { padsUsed: [], blocked: [], headway: null, rethinkUntil: nowMs + RETHINK_EXPLORE_MS })
      this.toast('Trying another way', hint, 'tan')
    } else if (last.tries === 2 && this.host.assists.hasTownPortal()) this.retreat(REGROUP, nowMs)
    else if (plan && OPTIONAL_ROWS.has(plan.goal.row ?? -1) && !this.host.guide.skipped.has(plan.goal.row!)) this.skip(plan, 'No headway')
    else if (this.trainElsewhere()) last.tries = 0
    else this.stop('Autopilot needs you', 'gold', `No headway on ${hint}`)
  }

  private follow(plan: GuidePlan | null, nowMs: number): void {
    if (plan && nowMs < this.rethinkUntil) this.explore(nowMs, 'Looking for another way')
    else if (plan) this.pursue(plan, nowMs)
    else this.explore(nowMs, 'No route from here, exploring')
  }

  private pursue(plan: GuidePlan, nowMs: number): void {
    const { world, assists } = this.host
    const { target, step } = plan
    const door = plan.doors.map((id) => world.getUnit('object', id)).find((unit): unit is ClientUnit => unit !== undefined && isClosedDoor(unit) && distance(unit, world.self) <= REACH + 1)
    if (!door && target && this.takePad(target, nowMs)) return
    this.say(plan.hint)
    const unit = target?.unit && world.getUnit(target.unit.kind === 'object' ? 'object' : 'monster', target.unit.id)
    if (door) this.useOnce(door, nowMs)
    else if (!target) this.explore(nowMs, plan.hint)
    else if (step?.kind === 'waypoint' && unit) {
      this.waypointTo = step.level
      this.reachThen(target, nowMs, () => this.useOnce(unit, nowMs))
    } else if (unit && target.unit.kind === 'npc' && !assists.isHostile(unit)) this.reachThen(target, nowMs, () => this.speakTo(unit, plan, nowMs))
    else if (unit && ROTATE.has(unit.classId)) this.rotate(unit, nowMs)
    else if (unit && BRIDGES.has(unit.classId) && distance(unit, world.self) <= QUEST_OBJECTS.bridgeReach) this.crossBridge(unit, BRIDGES.get(unit.classId)!, nowMs)
    else if (unit && target.unit.kind === 'object') this.reachThen(target, nowMs, () => this.wieldFor(unit) || this.useOnce(unit, nowMs))
    else if (step?.kind === 'exit') this.exitThrough(target, nowMs)
    else if (this.arrivedAt(target)) this.explore(nowMs, plan.hint)
    else this.walkRoute(nowMs)
  }

  private crossBridge(unit: ClientUnit, { approach: [ax, ay], stand: [sx, sy] }: { readonly approach: readonly number[]; readonly stand: readonly number[] }, nowMs: number): void {
    const me = this.host.world.self
    const [approach, stand] = [{ x: ax!, y: ay! }, { x: sx!, y: sy! }]
    if (this.bridge?.id !== unit.id) this.bridge = { id: unit.id, at: null }
    const bridge = this.bridge
    if (bridge.at === null && distance(approach, me) <= REACH) bridge.at = nowMs
    if (bridge.at === null) this.walkTowards(approach, nowMs)
    else if (nowMs - bridge.at < QUEST_OBJECTS.bridgeSettleMs) this.say('Waiting for the bridge')
    else if (distance(stand, me) > REACH && nowMs - this.lastWalk >= WALK_MS) {
      this.host.assists.stepTo(stand.x, stand.y, nowMs)
      this.lastWalk = nowMs
    } else if (distance(stand, me) <= REACH) this.useOnce(unit, nowMs)
  }

  private rotate(unit: ClientUnit, nowMs: number): void {
    const me = this.host.world.self
    const lastTouch = (stone: ClientUnit) => this.uses.get(stone.id)?.at ?? Number.NEGATIVE_INFINITY
    const next = this.host.world.getUnitsByType(2).filter((stone) => ROTATE.has(stone.classId) && !stone.hidden && stone.mode === 0 && distance(stone, unit) <= QUEST_OBJECTS.exitReach).sort((a, b) => lastTouch(a) - lastTouch(b) || distance(a, me) - distance(b, me))[0] ?? unit
    this.host.guide.focus(next, nowMs)
    if (nowMs - this.rotatedAt < QUEST_OBJECTS.rotateMs) return
    if (distance(next, me) > INTERACT_REACH) this.walkTowards(next, nowMs)
    else {
      this.rotatedAt = nowMs
      this.useOnce(next, nowMs)
    }
  }

  private arrivedAt(spot: GuideTarget): boolean {
    const headway = this.headway
    const key = `${this.host.world.areaId}:${Math.round(spot.x)},${Math.round(spot.y)}`
    const stuckNear = !spot.unit && headway !== null && headway.tries > 0 && distance(headway.goal, spot) <= HEADWAY_SAME && headway.best <= SPOT_NEAR
    if (distance(spot, this.host.world.self) <= ARRIVED || stuckNear) this.reachedSpot = key
    return this.reachedSpot === key
  }

  private reachThen(target: GuideTarget, nowMs: number, then: () => void): void {
    if (distance(target, this.host.world.self) <= INTERACT_REACH) then()
    else this.walkRoute(nowMs)
  }

  private walkRoute(nowMs: number, found = this.host.guide.routeFrom(this.host.world.self)): void {
    const { world, assists } = this.host
    const me = world.self
    const goal = this.host.guide.currentPlan?.target
    const route = found.length >= 2 || !goal || distance(goal, me) <= REACH ? found : [me, goal]
    if (route.length < 2) return
    const door = this.doorAhead(route)
    if (door) {
      this.knock(door, nowMs)
      return
    }
    const blink = this.blink
    if (blink?.pending && nowMs - blink.at >= TELEPORT_MS) {
      const misses = distance(me, blink.from) < STUCK_MOVE ? blink.misses + 1 : 0
      this.blink = { ...blink, pending: false, misses, offUntil: misses >= TELEPORT_MISSES ? nowMs + TELEPORT_OFF_MS : blink.offUntil }
    }
    const teleport = !this.town() && me.mana >= (this.host.hudManager.maxMana || me.maxMana) * TELEPORT_MANA && assists.canCast(TELEPORT, nowMs) && nowMs >= (this.blink?.offUntil ?? 0)
    if (teleport) {
      const hop = alongLine(route, TELEPORT_AHEAD)
      if (!this.blink?.pending && assists.castAt(TELEPORT, hop.x, hop.y, nowMs)) this.blink = { at: nowMs, from: { x: me.x, y: me.y }, pending: true, misses: this.blink?.misses ?? 0, offUntil: 0 }
      return
    }
    this.watchProgress(nowMs)
    if (nowMs - this.lastWalk < WALK_MS && this.host.assists.moving) return
    const aim = this.unstuckAim(route, nowMs)
    if (this.offTheGrid()) this.findGap(aim, nowMs)
    else {
      this.gapSearch = null
      assists.walkTo(aim.x, aim.y, nowMs)
    }
    this.lastWalk = nowMs
  }

  private unstuckAim(route: readonly SubTilePoint[], nowMs: number): SubTilePoint {
    const me = this.host.world.self
    const end = route.at(-1)!
    const left = distance(end, me)
    const here = { x: me.x, y: me.y }
    const headway = this.headway
    if (headway && nowMs - this.lastWalk > HEADWAY_IDLE_MS) Object.assign(headway, { from: here, at: nowMs })
    if (!headway || distance(headway.goal, end) > HEADWAY_SAME) this.headway = { goal: end, best: left, from: here, at: nowMs, tries: 0 }
    else if (left < headway.best - HEADWAY_GAIN || distance(me, headway.from) > HEADWAY_TRAVEL) Object.assign(headway, { best: Math.min(left, headway.best), from: here, at: nowMs })
    else if (nowMs - headway.at > HEADWAY_MS) {
      Object.assign(headway, { at: nowMs, from: here, tries: headway.tries + 1 })
      this.host.assists.journal?.('unstick', { tries: headway.tries, from: [Math.round(me.x), Math.round(me.y)], to: [Math.round(end.x), Math.round(end.y)] })
      if (headway.tries >= UNSTICK_MOVES.length) {
        this.blocked.push(end)
        this.headway = null
      }
    }
    const move = UNSTICK_MOVES[this.headway?.tries ?? 0]!
    const ahead = alongLine(route, move.ahead)
    const length = Math.max(1e-6, distance(ahead, me))
    const [nx, ny] = [(ahead.x - me.x) / length, (ahead.y - me.y) / length]
    return { x: ahead.x - ny * move.side - nx * move.back, y: ahead.y + nx * move.side - ny * move.back }
  }

  private findGap(aim: SubTilePoint, nowMs: number): void {
    const me = this.host.world.self
    const search = (this.gapSearch ??= { since: nowMs, from: { x: me.x, y: me.y } })
    const tries = Math.floor((nowMs - search.since) / GAP_MS)
    const length = Math.max(1e-6, distance(aim, search.from))
    const [nx, ny] = [(aim.x - search.from.x) / length, (aim.y - search.from.y) / length]
    const side = (tries % 2 === 1 ? 1 : -1) * Math.ceil((tries % (GAP_TRIES + 1)) / 2) * GAP_STEP
    this.host.assists.stepTo(search.from.x + nx * GAP_STEP - ny * side, search.from.y + ny * GAP_STEP + nx * side, nowMs)
  }

  private offTheGrid(): boolean {
    const view = this.host.levelView()
    const me = this.host.world.self
    const [gx, gy] = view ? [Math.round(me.x) - view.originX, Math.round(me.y) - view.originY] : [0, 0]
    return view !== null && gx >= 0 && gy >= 0 && gx < view.subWidth && gy < view.subHeight && view.walkable[gy * view.subWidth + gx] === 0
  }

  private watchProgress(nowMs: number): void {
    const me = this.host.world.self
    if (distance(me, this.progress) >= STUCK_MOVE || nowMs - this.progress.ms > STUCK_MS * 3) this.progress = { ms: nowMs, x: me.x, y: me.y }
    else if (nowMs - this.progress.ms > STUCK_MS) {
      const angle = Math.random() * Math.PI * 2
      this.host.assists.walkTo(me.x + Math.cos(angle) * 6, me.y + Math.sin(angle) * 6, nowMs)
      this.lastWalk = nowMs
      this.progress = { ms: nowMs, x: me.x, y: me.y }
    }
  }

  private exitThrough(target: GuideTarget, nowMs: number): void {
    const { world } = this.host
    const me = world.self
    const warp = world.getUnitsByType(5).filter((tile) => distance(tile, target) <= WARP_NEAR).sort((a, b) => distance(a, target) - distance(b, target))[0]
    const stairs = warp ? undefined : world.getUnitsByType(2).filter((unit) => EXIT_OBJECTS.has(unit.classId) && distance(unit, target) <= QUEST_OBJECTS.exitReach).sort((a, b) => distance(a, target) - distance(b, target))[0]
    if (stairs && this.climb(stairs, nowMs)) return
    if (warp && distance(warp, me) <= REACH + 2) this.useOnce(warp, nowMs)
    else if (warp || distance(target, me) > REACH) this.walkRoute(nowMs)
    else this.stepAcross(target, nowMs)
  }

  private climb(stairs: ClientUnit, nowMs: number): boolean {
    const { world } = this.host
    const leverClass = LEVERS.get(stairs.classId)
    const lever = leverClass === undefined || selectable(stairs) ? undefined : world.getUnitsByType(2).find((unit) => unit.classId === leverClass && selectable(unit) && distance(unit, stairs) <= QUEST_OBJECTS.leverReach)
    const use = lever ?? (selectable(stairs) ? stairs : undefined)
    if (!use) return false
    this.say(lever ? 'Pulling the lever' : `Taking the ${CANONICAL_113C_OBJECTS[stairs.classId]?.nameEn ?? 'stairs'}`)
    if (distance(use, world.self) <= INTERACT_REACH) this.useOnce(use, nowMs)
    else this.walkTowards(use, nowMs)
    return true
  }

  private stepAcross(target: GuideTarget, nowMs: number): void {
    const me = this.host.world.self
    const inward = this.host.levelView()?.entrances.find((entrance) => entrance.toLevelId === this.host.guide.currentPlan?.step?.level)
    const out = inward ? { x: inward.x - inward.interiorX, y: inward.y - inward.interiorY } : { x: target.x - me.x, y: target.y - me.y }
    const length = Math.max(1e-6, Math.hypot(out.x, out.y))
    this.cross({ x: target.x + (out.x / length) * SEAM_STEP, y: target.y + (out.y / length) * SEAM_STEP }, nowMs)
  }

  private cross(to: SubTilePoint, nowMs: number): void {
    this.crossing = { to, until: nowMs + CROSS_MS }
    this.keepCrossing(nowMs)
  }

  private keepCrossing(nowMs: number): boolean {
    const crossing = this.crossing
    if (!crossing || nowMs >= crossing.until || distance(crossing.to, this.host.world.self) <= STUCK_MOVE) {
      this.crossing = null
      return false
    }
    if (nowMs - this.lastWalk >= WALK_MS) {
      this.host.assists.stepTo(crossing.to.x, crossing.to.y, nowMs)
      this.lastWalk = nowMs
    }
    return true
  }

  private useOnce(unit: ClientUnit, nowMs: number): void {
    const used = this.uses.get(unit.id)
    if (used && nowMs - used.at < USE_MS) return
    if (used && used.tries >= USE_TRIES) this.giveUpOn(unit, nowMs)
    else {
      this.uses.set(unit.id, { at: nowMs, tries: (used?.tries ?? 0) + 1 })
      this.host.assists.use(unit, nowMs)
    }
  }

  private giveUpOn(unit: ClientUnit, nowMs: number): void {
    const plan = this.host.guide.currentPlan
    const me = this.host.world.self
    const waypoint = WAYPOINT_CLASS_IDS_113C.has(unit.classId)
    const portal = unit.classId === TOWN_PORTAL_CLASS
    const rounds = this.stubborn.get(unit.id) ?? 0
    if (rounds < (waypoint || portal ? WAYPOINT_ROUNDS : 1)) {
      this.stubborn.set(unit.id, rounds + 1)
      this.uses.delete(unit.id)
      this.host.hudModel?.cancelNpcSession()
      this.host.assists.journal?.('stubborn', { classId: unit.classId, rounds: rounds + 1, npc: this.host.world.npcInteraction.npcId, window: this.host.world.npcInteraction.window })
      const away = Math.atan2(me.y - unit.y, me.x - unit.x) + (rounds * 2 * Math.PI) / WAYPOINT_ROUNDS
      this.host.assists.stepTo(unit.x + Math.cos(away) * BACK_OFF, unit.y + Math.sin(away) * BACK_OFF, nowMs)
    } else if (waypoint) this.stop('Autopilot needs you', 'gold', "The waypoint wouldn't open")
    else if (portal && this.town()) Object.assign(this, { trip: null, portalHome: null })
    else if (portal) this.castPortal(nowMs)
    else if (plan?.target?.unit?.id === unit.id) this.skip(plan, `${unit.name ?? 'It'} wouldn't respond`)
    else this.walkRoute(nowMs)
  }

  private speakTo(npc: ClientUnit, plan: GuidePlan, nowMs: number): void {
    const talk = this.talk
    const same = talk?.npcId === npc.id && talk.hint === plan.hint ? talk : null
    const briefing = (QUEST_OBJECTS.briefings as Readonly<Record<string, string>>)[MONSTER_PATH_IDS[npc.classId] ?? '']
    if (same?.spoke && nowMs - same.since > STUCK_TALK_MS && briefing !== undefined && !this.briefed.has(briefing)) {
      this.briefed.add(briefing)
      this.talk = null
      this.run({ key: 'briefing', reason: `Talking to ${briefing.charAt(0).toUpperCase()}${briefing.slice(1)} first`, who: briefing }, nowMs)
    } else if (same?.spoke && nowMs - same.since > STUCK_TALK_MS) this.skip(plan, `Talking to ${npc.name ?? 'them'} didn't move it on`)
    else if (!same || (nowMs - same.at >= TALK_MS && !this.host.hudManager.worldPanels.npcMenu)) {
      this.talk = same ? Object.assign(same, { at: nowMs, opened: false }) : { npcId: npc.id, hint: plan.hint, since: nowMs, at: nowMs, spoke: false, opened: false, heard: new Set<string>() }
      this.host.assists.use(npc, nowMs)
    }
  }

  private sideQuestCheck(nowMs: number): void {
    const { guide } = this.host
    const plan = guide.currentPlan
    const row = plan?.goal.row
    if (!plan || guide.detour !== null || row === undefined || !OPTIONAL_ROWS.has(row)) return
    const word = this.host.world.quests[row] ?? 0
    if (this.sideQuest?.row !== row || this.sideQuest.word !== word) this.sideQuest = { row, word, at: nowMs }
    else if (nowMs - this.sideQuest.at > SIDE_QUEST_MS) this.skip(plan, 'It was taking too long')
  }

  private skip(plan: GuidePlan, why: string): void {
    this.talk = null
    if (plan.goal.row === undefined || this.host.guide.skipped.has(plan.goal.row)) this.stop('Autopilot needs you', 'gold', `${plan.hint}: ${why}`)
    else {
      this.host.guide.skip(plan.goal.row)
      this.toast(`Skipping ${plan.goal.title} for now`, why, 'gold')
    }
  }

  private answerPanels(nowMs: number): boolean {
    const { hudManager, hudModel, world } = this.host
    if (hudModel === null) return false
    const wp = hudManager.worldPanels
    if (hudManager.leftPanel === 'orifice') {
      this.offerStaff()
      return true
    }
    if (hudManager.leftPanel === 'waypoint') {
      if (this.waypointTo !== null && this.waypointTo !== world.areaId) hudModel.teleportToLevel(this.waypointTo)
      else hudModel.closeWaypoint()
      this.waypointTo = null
      return true
    }
    const menu = wp.npcMenu
    const talk = this.talk
    const ours = menu !== null && talk !== null && (menu.npcUnitId ?? menu.npcId ?? 0) === talk.npcId ? talk : null
    const ids = (menu?.options ?? []).map((option) => option.id)
    const service = ours && ARTISANS.find((kind) => ids.includes(kind) && !this.served.has(kind))
    if (ours && service) {
      this.served.add(service)
      this.serve(service, ours.npcId)
      return true
    }
    const topic = ours && (ids.find((id) => TRAVEL_OPTIONS.includes(id)) ?? ids.find((id) => id.startsWith('talk_quest') && !ours.heard.has(id)) ?? (!ours.opened && menu?.submenu !== 'talk' && ids.includes('talk') ? 'talk' : undefined))
    if (menu && ours && topic) {
      if (topic === 'talk') ours.opened = true
      else Object.assign(ours, { spoke: true, at: nowMs }).heard.add(topic)
      wp.clickNpcMenuOption(topic, menu.context)
      return true
    }
    if (wp.npcSpeech) {
      if (!talk || nowMs - talk.at >= SPEECH_SKIP_MS) wp.closeNpcSpeech()
      return true
    }
    if (!menu) return false
    if (talk) Object.assign(talk, { spoke: true })
    hudModel.closeActiveNpcPanel()
    hudModel.requestQuestData()
    return true
  }

  private explore(nowMs: number, status: string): void {
    const view = this.host.levelView()
    if (!view || this.town()) this.say(status)
    else this.exploreLevel(view, nowMs, status)
  }

  private exploreLevel(view: LevelView, nowMs: number, status: string): boolean {
    const { world, assists } = this.host
    const visited = this.explored.get(view.id) ?? new Set<number>()
    this.explored.set(view.id, visited)
    const me = world.self
    const centre = (room: LevelView['rooms'][number]) => ({ x: room.worldSubX + room.subW / 2, y: room.worldSubY + room.subH / 2 })
    view.rooms.filter((room) => distance(centre(room), me) <= Math.max(room.subW, room.subH) / 2 + ROOM_REACHED).forEach((room) => visited.add(room.index))
    const here = this.padField(view, nowMs)
    const walk = (room: LevelView['rooms'][number]) => {
      const entry = here.pathFrom(centre(room).x, centre(room).y, 1, 1)[0]
      return (entry ? here.distanceFrom(entry.x, entry.y) : null) ?? distance(centre(room), me) + UNREACHED_ROOM
    }
    const next = view.rooms.filter((room) => !visited.has(room.index) && !this.blocked.some((spot) => distance(spot, centre(room)) <= BLOCKED_NEAR)).map((room) => ({ room, cost: walk(room) })).sort((a, b) => a.cost - b.cost)[0]?.room
    const sweeping = !next && SWEEP.has(view.id) && this.host.guide.currentPlan?.goal.level === view.id
    if (sweeping) visited.clear()
    this.say(next ? status : sweeping ? `${status} (sweeping again)` : `${status} (explored everything)`)
    if (!next) return false
    const goal = centre(next)
    const key = `${view.id}:${next.index}`
    if (this.exploreField?.key !== key) this.exploreField = { key, field: new FlowField({ ...view, walkable: assists.walkableWithDoorsOpen(view) }, goal.x, goal.y) }
    const field = this.exploreField.field
    const path = field.pathFrom(me.x, me.y, 1, 40)
    if (path.length <= ROOM_END) visited.add(next.index)
    else this.walkRoute(nowMs, [me, ...field.corners(path, me)])
    this.host.guide.focus(goal, nowMs)
    return true
  }

  private noteArea(): void {
    const { world } = this.host
    const { areaId, self } = world
    const last = this.lastSpot
    if (last && last.level !== areaId) {
      this.uses.clear()
      this.stubborn.clear()
      this.scavenged.clear()
      Object.assign(this, { headway: null, blocked: [] })
      const back = this.trail.findIndex((spot) => spot.level === areaId)
      const resumed = this.trail.length === 0 && this.leftBehind.at(-1)?.level === areaId
      if (this.town()) [this.leftBehind, this.trail] = [this.trail.length > 0 ? this.trail : this.leftBehind, []]
      else this.trail = resumed ? this.leftBehind : back >= 0 ? this.trail.slice(0, back + 1) : [...this.trail, { level: areaId, at: { x: self.x, y: self.y }, before: { x: last.x, y: last.y } }]
    }
    this.lastSpot = { level: areaId, x: self.x, y: self.y }
  }

  private danger(nowMs: number): string | null {
    const { world, hudManager } = this.host
    const me = world.self
    const life = me.life / (hudManager.maxHp || me.maxLife)
    const healing = this.healingPotions()
    const stocked = healing >= STOCKED_POTIONS
    this.lifeLog = [...this.lifeLog.filter((entry) => nowMs - entry.at <= BURST_MS), { at: nowMs, life }]
    const burst = Math.max(...this.lifeLog.map((entry) => entry.life)) - life
    const boss = world.getUnitsByType(1).some((unit) => !unit.dead && BOSSES.has(unit.classId) && distance(unit, me) <= THREAT.near)
    const retreatAt = Math.max(boss ? LAIRS.retreatLife : 0, Math.min(MAX_RETREAT_LIFE, Math.max(MIN_RETREAT_LIFE, RETREAT_LIFE + this.levelGap() * GAP_CAUTION - (stocked ? STOCKED_NERVE : 0))) + this.caution(nowMs))
    const crowd = world.getUnitsByType(1).filter((unit) => !unit.dead && this.host.assists.isHostile(unit) && distance(unit, me) <= THREAT.near).length
    const horizon = Math.min(DOOM_MAX_MS, DOOM_MS + Math.max(0, crowd - DOOM_CROWD) * DOOM_PER_FOE_MS) + (boss ? LAIRS.doomMarginMs : 0)
    const cushion = potionCushion(inventoryPotions([...world.containers.belt.values(), ...world.containers.inventory.values()].filter((item) => /^(hp|rv)/.test(item.code))), hudManager.maxHp || me.maxLife, me.charClass, horizon)
    const drain = burst / BURST_MS - (me.states.has(STATE_HEALTHPOT) ? 0 : cushion.lifePerMs * POTION_TRUST)
    const doomedIn = burst > DOOM_MIN_LOSS && drain > 0 ? (life + cushion.instant * POTION_TRUST) / drain : Infinity
    this.reading = { life: Math.round(life * 100) / 100, burst: Math.round(burst * 100) / 100, doomedIn: Number.isFinite(doomedIn) ? Math.round(doomedIn) : null, horizon, healing, retreatAt: Math.round(retreatAt * 100) / 100 }
    if (life < retreatAt) return 'Low on life, heading to town'
    if (doomedIn < horizon) return 'Taking a beating, heading to town'
    if (life < THREAT.doomLife && this.outmatched()) return 'Too dangerous here, heading to town'
    if (healing === 0 && life < DRY_LIFE) return 'Out of healing potions, heading to town'
    return (!stocked && burst >= BURST_LOSS && life < DRY_LIFE) || (healing <= 1 && life < LAST_POTION_LIFE) ? 'Taking a beating, heading to town' : null
  }

  private outmatched(): boolean {
    const { world, assists } = this.host
    const me = world.self
    const { dps, trusted } = assists.dangerOf(world.getUnitsByType(1).filter((unit) => !unit.dead && assists.isHostile(unit) && distance(unit, me) <= THREAT.near))
    return trusted && (me.life / Math.max(1e-6, dps)) * 1000 < THREAT.escapeMs
  }

  private harmless(nowMs: number): boolean {
    const { world, assists } = this.host
    const xp = world.self.experience
    const harm = this.harm
    if (!harm || xp > harm.xp) {
      this.harm = { xp, at: nowMs, fought: 0, warned: false }
      return false
    }
    const foes = world.getUnitsByType(1).filter((unit) => !unit.dead && assists.isHostile(unit) && distance(unit, world.self) <= HUNT_RADIUS)
    if (!this.town() && assists.isFighting(nowMs) && foes.length > 0 && !foes.some((unit) => BOSS_CLASSES.has(unit.classId))) harm.fought += Math.min(TICK_GAP_MS, nowMs - harm.at)
    harm.at = nowMs
    if (harm.fought < HARMLESS_MS) return false
    assists.journal?.('harmless', { fought: Math.round(harm.fought / 1000), weapon: this.wielded()?.code.trim() ?? null, gold: world.self.gold, warned: harm.warned })
    if (!harm.warned) {
      Object.assign(harm, { fought: 0, warned: true })
      this.disengagedUntil = nowMs + HARMLESS_BREAK_MS
      this.toast('Not hurting anything here', 'Moving on for a while', 'gold')
      return false
    }
    this.harm = null
    this.stop('Autopilot needs you', 'red', "It isn't hurting anything: check its weapon")
    return true
  }

  private futileFight(nowMs: number): boolean {
    const { world, assists } = this.host
    const me = world.self
    if (nowMs < this.disengagedUntil) return true
    const watch = this.fightWatch
    if (!assists.isFighting(nowMs) || this.town()) this.fightWatch = null
    else if (!watch || distance(watch, me) > FIGHT_ROAM) this.fightWatch = { x: me.x, y: me.y, since: nowMs }
    else if (nowMs - watch.since > FUTILE_FIGHT_MS && !world.getUnitsByType(1).some((unit) => !unit.dead && BOSS_CLASSES.has(unit.classId) && distance(unit, me) <= HUNT_RADIUS)) {
      this.fightWatch = null
      this.disengagedUntil = nowMs + DISENGAGE_MS
      assists.journal?.('disengage', { from: [Math.round(me.x), Math.round(me.y)], seconds: Math.round((nowMs - watch.since) / 1000) })
      return true
    }
    return false
  }

  private cornered(nowMs: number): boolean {
    const { world, assists } = this.host
    const me = world.self
    if (distance(me, this.stall) >= STALL_MOVE) this.stall = { x: me.x, y: me.y, at: nowMs }
    return nowMs - this.stall.at >= STALL_MS && world.getUnitsByType(1).some((unit) => !unit.dead && assists.isHostile(unit) && distance(unit, me) <= KITE_NEAR)
  }

  private doorAhead(route: readonly SubTilePoint[]): ClientUnit | undefined {
    const me = this.host.world.self
    const ahead = route.filter((point) => distance(point, me) <= DOOR_LOOKAHEAD)
    return this.host.world.getUnitsByType(2).find((unit) => isClosedDoor(unit) && (this.uses.get(unit.id)?.tries ?? 0) < USE_TRIES && distance(unit, me) <= DOOR_NEAR && ahead.some((point) => distance(point, unit) <= DOOR_ON_ROUTE))
  }

  private scavenge(nowMs: number): boolean {
    const { world, assists, hudManager } = this.host
    const me = world.self
    const bearing = {
      life: me.life / (hudManager.maxHp || me.maxLife),
      mana: me.mana / (hudManager.maxMana || me.maxMana),
      states: me.states,
      looting: this.corpse === null && (assists.autoGoldPickup || assists.autoLootRules !== null) && freeSpots(world.containers.inventory.values(), 2, 2).length > 0,
    }
    const pick = world
      .getUnitsByType(2)
      .filter((unit) => !this.scavenged.has(unit.id) && distance(unit, me) <= ENVIRONMENT.reach)
      .map((unit) => ({ unit, why: worthUsing(unit, bearing) }))
      .filter((found): found is { unit: ClientUnit; why: string } => found.why !== null)
      .sort((a, b) => distance(a.unit, me) - distance(b.unit, me))
      .find((found) => assists.canReach(found.unit, nowMs))
    if (!pick) return false
    if ((this.uses.get(pick.unit.id)?.tries ?? 0) >= ENVIRONMENT.giveUpAfter) {
      this.scavenged.add(pick.unit.id)
      return false
    }
    this.say(pick.why)
    if (distance(pick.unit, me) <= INTERACT_REACH) this.knock(pick.unit, nowMs)
    else this.walkTowards(pick.unit, nowMs)
    return true
  }

  private grabWaypoint(nowMs: number): boolean {
    const { world, guide } = this.host
    const me = world.self
    if (guide.knowsWaypointIn(world.areaId)) return false
    const view = this.host.levelView()
    const here = (unit: ClientUnit) => view !== null && unit.x >= view.originX && unit.y >= view.originY && unit.x < view.originX + view.subWidth && unit.y < view.originY + view.subHeight
    const waypoint = world.getUnitsByType(2).find((unit) => WAYPOINT_CLASS_IDS_113C.has(unit.classId) && here(unit) && distance(unit, me) <= WAYPOINT_GRAB && (this.uses.get(unit.id)?.tries ?? 0) < USE_TRIES)
    if (!waypoint) return false
    this.say('Activating the waypoint')
    if (distance(waypoint, me) <= INTERACT_REACH) this.knock(waypoint, nowMs)
    else this.walkTowards(waypoint, nowMs)
    return true
  }

  private takePad(target: SubTilePoint, nowMs: number): boolean {
    const { world } = this.host
    const view = this.host.levelView()
    const me = world.self
    const spots = view ? this.padSpots(view) : []
    if (!view || spots.length === 0) return false
    const regions = this.regionsOf(view)
    const free = (spot: (typeof spots)[number]) => !this.padUsed(spot, nowMs) && regions.at(spot) === regions.at(me)
    const pad = firstPad(regions, spots, me, target, (spot) => this.landingOf(spot, spots, regions), free)
    if (!pad) return false
    this.say('Taking the teleport pad')
    if (!pad.unit || distance(pad, me) > INTERACT_REACH) this.walkTowards(pad, nowMs)
    else this.pressPad(pad, pad.unit, nowMs)
    return true
  }

  private pressPad(pad: SubTilePoint, unit: ClientUnit, nowMs: number): void {
    const me = this.host.world.self
    const pressed = this.uses.get(unit.id)
    if (pressed && nowMs - pressed.at < PAD_PRESS_MS) return
    const presses = (pressed?.tries ?? 0) + 1
    this.host.assists.journal?.('pad', { presses, from: [Math.round(me.x), Math.round(me.y)], pad: [Math.round(pad.x), Math.round(pad.y)], classId: unit.classId, mode: unit.mode })
    if (presses > PAD_PRESSES) {
      this.banPad(pad, nowMs)
      this.uses.delete(unit.id)
      return
    }
    this.uses.set(unit.id, { at: nowMs, tries: presses })
    this.padFrom = { x: me.x, y: me.y, at: nowMs, pad }
    this.host.assists.use(unit, nowMs)
  }

  private regionsOf(view: LevelView): Regions {
    if (this.regions?.level !== view.id) this.regions = { level: view.id, regions: new Regions(view) }
    return this.regions.regions
  }

  private landingOf<P extends PadSpot>(pad: P, pads: readonly P[], regions: Regions): P | undefined {
    const landed = this.landings.get(padKey(pad)) ?? pad.partner
    return landed ? pads.find((other) => distance(other, landed) <= PAD_SAME) : guessPartner(pad, pads, regions)
  }

  private padSpots(view: LevelView): PadSpot[] {
    const preset = view.presetUnits.filter((u) => u.type === 2 && PAD_CLASSES.has(u.index)).map((u) => ({ x: view.originX + u.subX, y: view.originY + u.subY, classId: u.index }))
    const partners = presetPartners(preset)
    const partnerNear = (spot: SubTilePoint) => partners.get(preset.find((other) => distance(other, spot) <= PAD_SAME)!)
    const live = this.host.world.getUnitsByType(2).filter((unit) => PAD_CLASSES.has(unit.classId)).map((unit) => ({ x: unit.x, y: unit.y, classId: unit.classId, unit, partner: partnerNear(unit) }))
    return [...live, ...preset.filter((spot) => !live.some((pad) => distance(pad, spot) <= PAD_SAME)).map((spot) => ({ ...spot, partner: partners.get(spot) }))]
  }

  private padUsed(spot: SubTilePoint, nowMs: number): boolean {
    return this.padsUsed.some((used) => used.until > nowMs && distance(used, spot) <= PAD_SAME)
  }

  private banPad(spot: SubTilePoint, nowMs: number): void {
    this.padsUsed = [...this.padsUsed.filter((used) => used.until > nowMs), { x: spot.x, y: spot.y, until: nowMs + PAD_REUSE_MS }]
  }

  private padField(view: LevelView, nowMs: number): FlowField {
    const me = this.host.world.self
    const key = `${view.id}:${Math.round(me.x / PAD_FIELD_CELL)}:${Math.round(me.y / PAD_FIELD_CELL)}`
    if (this.padCache?.key !== key || nowMs - this.padCache.at > PAD_FIELD_MS) this.padCache = { key, at: nowMs, field: new FlowField({ ...view, walkable: this.host.assists.walkableWithDoorsOpen(view) }, me.x, me.y) }
    return this.padCache.field
  }

  private noteArrival(nowMs: number): void {
    const from = this.padFrom
    const me = this.host.world.self
    if (!from || nowMs - from.at > PAD_ARRIVAL_MS || distance(from, me) < PAD_JUMP) return
    this.padFrom = null
    this.banPad(from.pad, nowMs)
    const view = this.host.levelView()
    const arrived = view ? this.padSpots(view).filter((spot) => distance(spot, me) <= PAD_ARRIVAL_NEAR) : []
    arrived.forEach((spot) => this.banPad(spot, nowMs))
    const landing = arrived.sort((a, b) => distance(a, me) - distance(b, me))[0]
    if (landing) this.landings.set(padKey(from.pad), landing)
  }

  private knock(door: ClientUnit, nowMs: number): void {
    const used = this.uses.get(door.id)
    if (used && nowMs - used.at < USE_MS) return
    this.uses.set(door.id, { at: nowMs, tries: (used?.tries ?? 0) + 1 })
    this.host.assists.use(door, nowMs)
  }

  private looting(nowMs: number): boolean {
    const { assists } = this.host
    if (assists.inventoryCare.busy || assists.hasLootNearby(nowMs)) this.lootUntil = nowMs + LOOT_SETTLE_MS
    return nowMs < this.lootUntil
  }

  private questInReach(): boolean {
    const target = this.host.guide.currentPlan?.target
    return target?.unit?.kind === 'object' && distance(target, this.host.world.self) <= QUEST_FOCUS
  }

  private recovered(): boolean {
    const { world, hudManager } = this.host
    return world.self.life >= (hudManager.maxHp || world.self.maxLife) * RECOVERED_LIFE && this.healingPotions() >= HUNT_POTIONS
  }

  private healing(nowMs: number): boolean {
    const life = this.host.world.self.life
    if (!this.wounded()) this.healWait = null
    else if (this.healWait === null || life > this.healWait.life) this.healWait = { life, since: nowMs }
    return this.healWait !== null && nowMs - this.healWait.since < HEAL_PATIENCE_MS
  }

  private wounded(): boolean {
    const { world, hudManager } = this.host
    return world.self.life < (hudManager.maxHp || world.self.maxLife) * HEAL_LIFE
  }

  private dryAndBroke(): boolean {
    return this.healingPotions() === 0 && this.host.world.self.gold + this.host.world.self.stashGold < POTION_GOLD
  }

  private healingPotions(): number {
    const { belt, inventory } = this.host.world.containers
    return [...belt.values(), ...inventory.values()].filter((item) => /^(hp|rv)/.test(item.code)).length
  }

  private ignore(unit: ClientUnit, nowMs: number): boolean {
    this.ignored.set(unit.id, nowMs + HUNT_IGNORE_MS)
    return true
  }

  private levelGap(): number {
    const { world } = this.host
    return getLevelMonsterLevel113c(world.areaId, world.difficulty) - world.self.level
  }

  private hunt(nowMs: number): boolean {
    const { world, hudManager, assists } = this.host
    const me = world.self
    const bold = me.life >= (hudManager.maxHp || me.maxLife) * HUNT_LIFE && this.healingPotions() >= HUNT_POTIONS && this.levelGap() <= HUNT_GAP && this.caution(nowMs) < HUNT_CAUTION && this.corpse === null && !this.passingThrough()
    const chased = this.chase && world.getUnit('monster', this.chase.id)
    const huntable = (unit: ClientUnit) => !unit.dead && assists.isHostile(unit) && distance(unit, me) <= HUNT_RADIUS && (this.ignored.get(unit.id) ?? 0) <= nowMs && !assists.isHopeless(unit)
    const hostiles = world.getUnitsByType(1).filter(huntable)
    const packOf = (unit: ClientUnit) => hostiles.filter((other) => distance(other, unit) <= PACK_RADIUS)
    const worth = (unit: ClientUnit) => distance(unit, me) - (isElite(unit) ? ELITE_PULL : 0) - PACK_PULL * (packOf(unit).length - 1)
    const fresh = () => [...hostiles].sort((a, b) => worth(a) - worth(b)).find((unit) => (assists.canReach(unit, nowMs) || !this.ignore(unit, nowMs)) && this.dareFight(unit, packOf(unit), nowMs))
    const prey = bold ? (chased && huntable(chased) ? chased : fresh()) : undefined
    if (!prey) {
      this.chase = null
      return false
    }
    const chase = this.chase?.id === prey.id ? this.chase : (this.chase = { id: prey.id, since: nowMs })
    if (nowMs - chase.since > HUNT_MS) {
      this.ignored.set(prey.id, nowMs + HUNT_IGNORE_MS)
      return false
    }
    this.say(`Hunting ${prey.name ?? 'monsters'}`)
    this.walkTowards(prey, nowMs)
    return true
  }

  private dareFight(unit: ClientUnit, pack: readonly ClientUnit[], nowMs: number): boolean {
    const { dps } = this.host.assists.dangerOf(pack)
    const fall = this.host.world.self.life / Math.max(1e-6, dps)
    if (fall >= THREAT.huntSeconds) return true
    this.ignored.set(unit.id, nowMs + HUNT_IGNORE_MS)
    this.host.assists.journal?.('threat', { classId: unit.classId, pack: pack.length, dps: Math.round(dps), fall: Math.round(fall * 10) / 10 })
    return false
  }

  private retreat(why: string, nowMs: number): void {
    const { world, assists } = this.host
    const me = world.self
    if (this.trip !== 'retreat') this.host.assists.journal?.('retreat', { why, ...this.reading, hostiles: world.getUnitsByType(1).filter((unit) => !unit.dead && assists.isHostile(unit) && distance(unit, me) <= THREAT.near).length })
    const fromBoss = world.getUnitsByType(1).some((unit) => !unit.dead && BOSSES.has(unit.classId) && distance(unit, me) <= THREAT.near)
    if (this.trip !== 'retreat' && !planned(why)) this.retreats = [...this.retreats.filter((entry) => nowMs - entry.at < DEATH_MEMORY_MS), { at: nowMs, level: this.questLevel ?? this.host.world.areaId, boss: fromBoss }]
    Object.assign(this, { trip: 'retreat', retreatWhy: why })
    this.say(why)
    const threats = world.getUnitsByType(1).filter((unit) => !unit.dead && assists.isHostile(unit) && distance(unit, me) <= KITE_NEAR)
    this.kiteSince = threats.length === 0 ? null : (this.kiteSince ?? nowMs)
    const portal = world.getUnitsByType(2).find((unit) => unit.classId === TOWN_PORTAL_CLASS && distance(unit, me) <= PORTAL_REACH)
    if (portal) this.useOnce(portal, nowMs)
    else if (threats.length > 0 && threats.length <= KITE_CROWD && nowMs - this.kiteSince! < KITE_MS && this.kite(threats, nowMs)) return
    else if (assists.hasTownPortal()) this.castPortal(nowMs)
    else this.walkHome(nowMs)
  }

  private touch(unit: ClientUnit, nowMs: number): void {
    if (nowMs - (this.uses.get(unit.id)?.at ?? Number.NEGATIVE_INFINITY) < USE_MS) return
    this.uses.set(unit.id, { at: nowMs, tries: 0 })
    this.host.assists.use(unit, nowMs)
  }

  private castPortal(nowMs: number): void {
    if (nowMs - (this.errandsAt.get('portal') ?? Number.NEGATIVE_INFINITY) <= USE_MS * 2) return
    this.errandsAt.set('portal', nowMs)
    this.host.assists.castTownPortal()
  }

  private kite(threats: readonly ClientUnit[], nowMs: number): boolean {
    const view = this.host.levelView()
    if (!view) return false
    const me = this.host.world.self
    const walkable = this.host.assists.walkableWithDoorsOpen(view)
    const open = ({ x, y }: SubTilePoint) => {
      const [gx, gy] = [Math.round(x) - view.originX, Math.round(y) - view.originY]
      return gx >= 0 && gy >= 0 && gx < view.subWidth && gy < view.subHeight && walkable[gy * view.subWidth + gx] !== 0
    }
    const gap = (spot: SubTilePoint) => Math.min(...threats.map((threat) => distance(threat, spot)))
    const safest = Array.from({ length: 16 }, (_, i) => ({ x: me.x + Math.cos((i * Math.PI) / 8) * KITE_STEP, y: me.y + Math.sin((i * Math.PI) / 8) * KITE_STEP }))
      .filter((spot) => open(spot) && open({ x: (spot.x + me.x) / 2, y: (spot.y + me.y) / 2 }))
      .sort((a, b) => gap(b) - gap(a))[0]
    if (!safest || gap(safest) <= gap(me)) return false
    if (nowMs - this.lastWalk >= WALK_MS) {
      this.host.assists.walkTo(safest.x, safest.y, nowMs)
      this.lastWalk = nowMs
    }
    return true
  }

  private backOff(nowMs: number): boolean {
    const { world, assists, hudManager } = this.host
    const me = world.self
    const threats = world.getUnitsByType(1).filter((unit) => !unit.dead && assists.isHostile(unit) && distance(unit, me) <= KITE_NEAR)
    return me.life < (hudManager.maxHp || me.maxLife) * LAST_STAND_KITE && threats.length > 0 && this.kite(threats, nowMs)
  }

  private walkHome(nowMs: number): void {
    const me = this.host.world.self
    const here = this.trail.at(-1)
    if (here?.level !== this.host.world.areaId || here === this.deadEnd) this.homeByWaypoint(nowMs)
    else if (distance(here.at, me) > REACH) this.walkTowards(here.at, nowMs)
    else this.leaveBy(here, nowMs)
  }

  private leaveBy(here: (typeof this.trail)[number], nowMs: number): void {
    const { world } = this.host
    const near = (unit: ClientUnit) => distance(unit, here.at) <= WARP_NEAR
    const way = [...world.getUnitsByType(2).filter((unit) => unit.classId === TOWN_PORTAL_CLASS || WAYPOINT_CLASS_IDS_113C.has(unit.classId)), ...world.getUnitsByType(5)].find(near)
    const across = { x: here.before.x - here.at.x, y: here.before.y - here.at.y }
    const length = Math.hypot(across.x, across.y)
    if (way) this.takeHome(way, nowMs)
    else if (length > SEAM_JUMP || length < 1e-6) {
      this.deadEnd = here
      this.homeByWaypoint(nowMs)
    } else this.cross({ x: here.at.x + (across.x / length) * SEAM_STEP, y: here.at.y + (across.y / length) * SEAM_STEP }, nowMs)
  }

  private takeHome(way: ClientUnit, nowMs: number): void {
    const waypoint = WAYPOINT_CLASS_IDS_113C.has(way.classId)
    if (waypoint) this.waypointTo = ACT_TOWNS[actOfLevel(this.host.world.areaId)]!
    if (distance(way, this.host.world.self) <= (waypoint ? INTERACT_REACH : REACH)) this.touch(way, nowMs)
    else this.walkTowards(way, nowMs)
  }

  private homeByWaypoint(nowMs: number): void {
    const { world } = this.host
    const view = this.host.levelView()
    const seen = world.getUnitsByType(2).find((unit) => WAYPOINT_CLASS_IDS_113C.has(unit.classId))
    const preset = view?.presetUnits.find((unit) => unit.type === 2 && WAYPOINT_CLASS_IDS_113C.has(unit.index))
    if (seen) this.takeHome(seen, nowMs)
    else if (view && preset) this.walkTowards({ x: view.originX + preset.subX, y: view.originY + preset.subY }, nowMs)
    else {
      this.trip = null
      if (nowMs >= this.lastStand) {
        this.host.assists.journal?.('last-stand', { level: world.areaId, ...this.reading })
        this.toast('Nowhere to run', 'No town portal or way back, fighting on', 'red')
      }
      this.lastStand = nowMs + LAST_STAND_MS
    }
  }

  private spend(nowMs: number): void {
    const { world, hudManager, hudModel } = this.host
    if (!this.spendPoints || hudModel === null || nowMs - this.lastSpend < SPEND_MS) return
    const tree = hudManager.skillTree
    const build = buildOf(world.self.charClass, (id) => tree.getHardPoints(id))
    if (build === null) return
    const attrs = hudManager.charSheet.attrs
    const skill = tree.unspentSkillPoints > 0 ? nextSkill(build, (id) => tree.getHardPoints(id), (id) => tree.canAllocate(id), tree.unspentSkillPoints) : null
    const stat = attrs.statPoints > 0 ? nextStat(build, { str: attrs.baseStr ?? 0, dex: attrs.baseDex ?? 0, vit: attrs.baseVit ?? 0, ene: attrs.baseEne ?? 0 }) : null
    if (skill !== null) hudModel.allocateSkill(skill)
    else if (stat !== null) hudModel.allocateStat(stat)
    else return
    this.lastSpend = nowMs
  }

  private portalFirst(nowMs: number): boolean {
    const { world, assists, guide } = this.host
    const plan = guide.currentPlan
    if (plan && LAIRS.noExit.includes(world.areaId) && plan.goal.level !== world.areaId && assists.hasTownPortal()) {
      this.retreat(`${ERRAND} no way out of ${levelName(world.areaId)} ${ON_FOOT}`, nowMs)
      return true
    }
    const step = plan?.step
    if (step?.kind !== 'portal' || !LAIRS.noExit.includes(step.level) || assists.hasTownPortal() || this.corpse?.level === step.level) return false
    this.retreat(`${PREP} ${levelName(step.level)}: no way out without a Town Portal`, nowMs)
    return true
  }

  private portalErrand(nowMs: number): boolean {
    const { world, assists, guide } = this.host
    const plan = guide.currentPlan
    const target = plan?.target
    if (!plan?.goal.inTown || !assists.hasTownPortal() || this.crossing !== null) return false
    const close = (spot: SubTilePoint) => distance(spot, world.self) <= ERRAND_WALK
    if ((target && close(target)) || world.getUnitsByType(2).some((unit) => WAYPOINT_CLASS_IDS_113C.has(unit.classId) && close(unit))) return false
    this.retreat(`${ERRAND} ${plan.hint}`, nowMs)
    return true
  }

  private returnThroughPortal(nowMs: number): boolean {
    const { world } = this.host
    const portal = world.getUnitsByType(2).filter((unit) => unit.classId === TOWN_PORTAL_CLASS).sort((a, b) => distance(a, world.self) - distance(b, world.self))[0]
    const home = this.portalHome
    if (!portal && home && (distance(home, world.self) > REACH || nowMs - home.at < PORTAL_LOOK_MS)) {
      this.say('Back through the portal')
      this.walkTowards(home, nowMs)
      return true
    }
    if (!portal) {
      Object.assign(this, { trip: null, portalHome: null })
      return false
    }
    this.say('Back through the portal')
    if (distance(portal, world.self) <= REACH) this.useOnce(portal, nowMs)
    else this.walkTowards(portal, nowMs)
    return true
  }

  private nextErrand(town: (typeof TOWNS)['Rogue Encampment'], nowMs: number): Errand | null {
    const { world, hudManager, assists } = this.host
    const me = world.self
    const care = assists.inventoryCare
    care.hardUp = me.gold < Math.max(BARE_SHOP_GOLD, me.level * RESERVE_PER_LEVEL * 2) || (me.gold < BARE_SHOP_GOLD * 2 && this.healingPotions() === 0)
    care.identifiable = scrollSource(world.containers.inventory.values(), 'ibk', 'isc') !== null
    const selling = care.sellable.length > 0
    const cooldown = (key: string) => (key === 'heal' ? HEAL_COOLDOWN_MS : (key === 'potions' && (this.healingPotions() < STOCKED_POTIONS || selling || !this.host.assists.hasTownPortal())) || key === 'cube' ? RESTOCK_COOLDOWN_MS : ERRAND_COOLDOWN_MS)
    const ready = (key: string) => nowMs - (this.errandsAt.get(key) ?? Number.NEGATIVE_INFINITY) >= cooldown(key)
    const wounded = me.life < (hudManager.maxHp || me.maxLife) * HEAL_LIFE || me.mana < (hudManager.maxMana || me.maxMana) * HEAL_MANA
    const merc = world.merc
    const worn = [...world.containers.equipment.values()].some((item) => (item.maxDurability ?? 0) > 0 && (item.curDurability ?? item.durability ?? 0) < (item.maxDurability ?? 0) * REPAIR_BELOW)
    const recipe = readyRecipe(world) ?? runeRecipe(world, care.runeCube)
    const resist = this.resistWanted()
    const wealth = me.gold + me.stashGold
    const gambleFund = wealth - gambleReserve(me.level)
    const spend = gambleFund >= GAMBLING_RULES.spare && ready('gamble') ? gambleFund : wealth >= SHOP_GOLD && ready('shop') ? Math.min(wealth - SPARE_GOLD, me.level * SHOP_PURSE_PER_LEVEL) : 0
    const purse = Math.min(getInventoryGoldLimit(me.level), Math.max(spend, this.purseKeep()))
    const untidy = care.untidy.length > 0
    const errands: readonly (Errand | false)[] = [
      wounded && ready('heal') && { key: 'heal', reason: 'Healing up', npc: 'healer' },
      resist !== null && me.gold >= POTION_GOLD && ready('resist') && { key: 'resist', reason: `Buying ${resist.potion} for ${resist.boss}`, npc: 'resists', action: 'trade', work: () => this.buyResists(resist.code) },
      this.unidentified().length > 0 && scrollSource(world.containers.inventory.values(), 'ibk', 'isc') !== null && ready('identify') && { key: 'identify', reason: 'Identifying items', work: () => this.identifyAll() },
      this.boons().length > 0 && ready('boon') && { key: 'boon', reason: `Using the ${BOONS.get(this.boons()[0]!.code.trim())}`, work: () => this.useBoons() },
      Boolean(merc?.isDead) && (merc?.reviveCost ?? Infinity) <= me.gold && ready('mercs') && { key: 'mercs', reason: 'Reviving your mercenary', npc: 'mercs', action: 'resurrect' },
      merc === null && world.expansion === true && me.gold >= MERCENARIES.minGold && this.settledIn(nowMs) && ready('hire') && { key: 'hire', reason: 'Hiring a mercenary', npc: 'mercs', action: 'hire', work: () => this.hire() },
      this.mercGear() !== null && ready('mercGear') && { key: 'mercGear', reason: 'Giving your mercenary better gear', work: () => this.dressMerc() },
      me.gold < (spend > 0 ? purse * WITHDRAW_SHORT : Math.min(PURSE_LOW, purse / 2)) && me.stashGold > 0 && ready('purse') && { key: 'purse', reason: 'Taking gold out of the stash', work: () => this.fillPurse(purse) },
      worn && ready('repair') && { key: 'repair', reason: 'Repairing gear', npc: 'repair', action: 'trade_repair', work: () => this.repairAndShop() },
      (this.scrollsWanted('portal') > 0 && me.gold >= SCROLL_GOLD) || (this.potionsWanted() > 0 && me.gold >= POTION_GOLD) || (care.config?.sellJunk === true && care.sellable.length > 0)
        ? ready('potions') && { key: 'potions', reason: 'Buying potions and portals', npc: 'potions', action: 'trade', work: () => this.restock() }
        : false,
      (me.gold >= SHOP_GOLD || (this.bare() > 0 && me.gold >= BARE_SHOP_GOLD)) && ready('shop') && { key: 'shop', reason: 'Looking for better gear at the smith', npc: 'repair', action: 'trade_repair', work: () => this.buyUpgrade() },
      gambleFund >= GAMBLING_RULES.spare && me.gold >= GAMBLING_RULES.spare && ready('gamble') && { key: 'gamble', reason: 'Gambling for rings and amulets', npc: 'gamble', action: 'gamble', work: () => this.gamble() },
      care.config?.sellJunk === true && care.sellable.length > 0 && ready('sell') && { key: 'sell', reason: 'Selling junk', npc: 'potions', action: 'trade' },
      spend === 0 && me.gold > this.purseKeep() + BANK_MARGIN && me.stashGold < getStashGoldLimit(me.level) && ready('bank') && { key: 'bank', reason: 'Putting gold in the stash', work: () => this.bank() },
      untidy && ready('tidy') && { key: 'tidy', reason: 'Clearing out the stash', work: () => this.tidy() },
      this.storedQuestItem() !== null && ready('fetch') && { key: 'fetch', reason: 'Taking the quest item out of storage', work: () => this.fetch(this.storedQuestItem()!) },
      recipe !== null && ready('cube') && { key: 'cube', reason: `Making ${recipe.name} in the Horadric Cube`, work: () => this.cube(recipe) },
      care.armoury.length > 0 && ready('armoury') && { key: 'armoury', reason: 'Taking better gear out of the stash', work: () => this.arm() },
      this.socketMove() !== null && ready('socket') && { key: 'socket', reason: `Socketing ${this.socketMove()!.why}`, work: () => this.socketAll() },
      care.upgrades.length > 0 && ready('gear') && { key: 'gear', reason: 'Putting on better gear', work: () => care.wearUpgrades() },
      care.config?.stashValuables === true && care.stashable.length > 0 && ready('stash') && { key: 'stash', reason: 'Stashing valuables', stash: true },
    ]
    const errand = errands.find((e): e is Errand => e !== false) ?? null
    return errand && (errand.npc === undefined || town[errand.npc]) ? errand : null
  }

  private run(errand: Errand, nowMs: number): void {
    this.errandsAt.set(errand.key, nowMs)
    this.say(errand.reason)
    this.job = this.errand(errand)
      .catch(() => undefined)
      .finally(() => {
        this.job = null
      })
  }

  private storedQuestItem(): string | null {
    const code = this.host.guide.currentPlan?.goal.bring
    const { inventory, stash, cube } = this.host.world.containers
    const has = (items: ReadonlyMap<number, { readonly code: string }>) => [...items.values()].some((item) => item.code.trim() === code)
    return code !== undefined && !has(inventory) && (has(stash) || has(cube)) ? code : null
  }

  private async fetch(code: string): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    if (hudModel === null) return
    const host = { world, hudManager, hudModel }
    const inCube = [...world.containers.cube.values()].some((item) => item.code.trim() === code)
    const stored = [code, ...(inCube ? [CUBE_CODE] : [])].filter((wanted) => [...world.containers.stash.values()].some((item) => item.code.trim() === wanted))
    if (stored.length > 0 && !(await this.fromStash('fetch', () => withdraw(host, stored)))) return
    if (inCube) await takeOut(host, code)
  }

  private async fromStash(key: string, take: () => Promise<boolean>): Promise<boolean> {
    const { world, hudManager, hudModel } = this.host
    const stash = await this.reach(() => world.getUnitsByType(2).find((unit) => unit.classId === STASH_CLASS), { key, reason: '', stash: true })
    if (!stash || hudModel === null) return false
    const care = this.host.assists.inventoryCare
    care.hold = true
    try {
      this.host.assists.use(stash, performance.now())
      if (!(await waitFor(() => hudManager.leftPanel === 'stash', STASH_OPEN_MS))) return false
      const taken = await take()
      hudModel.closeStash()
      return taken
    } finally {
      care.hold = false
    }
  }

  private settledIn(nowMs: number): boolean {
    const { selfId } = this.host.world
    if (this.game === null || this.game.selfId !== selfId) this.game = { selfId, at: nowMs }
    return nowMs - this.game.at >= MERCENARIES.joinGraceMs
  }

  private async hire(): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    const npcId = world.npcInteraction.npcId
    const offered = () => hudManager.worldPanels.hireList as readonly HireCandidate[]
    if (hudModel === null || npcId === null || world.merc !== null || !(await waitFor(() => offered().length > 0, HIRE_LIST_MS))) return
    const pick = pickMercenary(offered(), world.self.gold)
    if (!pick || world.merc !== null) return
    hudModel.hireMerc(npcId, hireIdOf(pick))
    if (await waitFor(() => world.merc !== null, HIRE_LIST_MS)) this.toast('Hired a mercenary', `${pick.name}, level ${pick.level}`, 'green')
  }

  private mercGear(): ReturnType<typeof mercUpgrade> {
    const { world, assists } = this.host
    const merc = world.merc
    if (!merc || merc.isDead || merc.mercId <= 0) return null
    const spare = [...world.containers.inventory.values()].filter((item) => !this.mercTried.has(item.id) && assists.inventoryCare.appraise(item).upgradeSlot === undefined)
    return mercUpgrade(spare, { classId: merc.classId, stats: merc.stats, worn: world.containers.merc.values() })
  }

  private async dressMerc(): Promise<void> {
    const { world, hudModel } = this.host
    const gear = this.mercGear()
    if (hudModel === null || gear === null) return
    this.mercTried.add(gear.item.id)
    hudModel.cancelNpcSession()
    hudModel.pickupItemToCursor(gear.item.id)
    if (!(await waitFor(() => world.containers.cursor?.id === gear.item.id, MERC_ITEM_MS))) return
    hudModel.mercItem(gear.bodyLoc)
    if (!(await waitFor(() => world.containers.cursor?.id !== gear.item.id, MERC_ITEM_MS))) return
    this.toast('Gave your mercenary better gear', gear.item.code.trim(), 'green')
    const old = world.containers.cursor
    const spot = old && freeSpots(world.containers.inventory.values(), old.invWidth, old.invHeight)[0]
    if (old && spot) hudModel.placeCursorItem(old.id, spot.x, spot.y, INVENTORY_BUFFER)
  }

  private purseKeep(): number {
    return Math.max(PURSE_LOW, this.host.world.self.level * PURSE_PER_LEVEL)
  }

  private async bank(): Promise<void> {
    const { world, hudModel } = this.host
    const amount = Math.min(world.self.gold - this.purseKeep(), getStashGoldLimit(world.self.level) - world.self.stashGold)
    const before = world.self.gold
    if (hudModel === null || amount <= 0) return
    await this.fromStash('bank', () => {
      hudModel.depositGold(amount)
      return waitFor(() => world.self.gold < before, 1500)
    })
  }

  private async tidy(): Promise<void> {
    const { world, hudManager, hudModel, assists } = this.host
    const care = assists.inventoryCare
    const untidy = care.untidy
    if (hudModel === null || !(await this.fromStash('tidy', () => withdrawItems({ world, hudManager, hudModel }, untidy)))) return
    this.toast('Cleared out the stash', `${untidy.length} item${untidy.length === 1 ? '' : 's'} to sell or identify`, 'gold')
  }

  private async fillPurse(purse: number): Promise<void> {
    const { world, hudModel } = this.host
    const amount = Math.min(world.self.stashGold, purse - world.self.gold)
    const before = world.self.gold
    if (hudModel === null || amount <= 0) return
    await this.fromStash('purse', () => {
      hudModel.withdrawGold(amount)
      return waitFor(() => world.self.gold > before, 1500)
    })
  }

  private async arm(): Promise<void> {
    const { world, hudManager, hudModel, assists } = this.host
    if (hudModel !== null && (await this.fromStash('armoury', () => withdrawItems({ world, hudManager, hudModel }, assists.inventoryCare.armoury)))) await assists.inventoryCare.wearUpgrades()
  }

  private wieldFor(unit: ClientUnit): boolean {
    const { world, hudModel } = this.host
    const wield = WIELD.get(unit.classId)
    const tool = wield && [...world.containers.inventory.values()].find((item) => codeOf(item) === wield.item)
    if (!wield || !tool || hudModel === null) return false
    const held = this.wielded()
    const rest = [...world.containers.inventory.values()].filter((item) => item.id !== tool.id)
    if (held && !freeSpots(rest, held.invWidth, held.invHeight)[0]) return false
    this.say(`Wielding ${wield.tool}`)
    this.sheathed = held?.id ?? null
    this.job = this.equip(tool, held)
      .catch(() => undefined)
      .finally(() => {
        this.job = null
      })
    return true
  }

  private wielded(): ItemData | undefined {
    return [...this.host.world.containers.equipment.values()].find((item) => slotOf(item) === 'weapon1')
  }

  private async equip(item: ItemData, held: ItemData | undefined): Promise<void> {
    const { world, hudModel } = this.host
    if (hudModel === null) return
    hudModel.pickupItemToCursor(item.id)
    if (!(await waitFor(() => world.containers.cursor?.id === item.id, 3000))) return
    if (held) hudModel.swapEquipItem(item.id, 'weapon1')
    else hudModel.equipItem(item.id, 'weapon1')
    if (!(await waitFor(() => world.containers.cursor?.id !== item.id, 3000))) return
    const old = world.containers.cursor
    const spot = old && freeSpots(world.containers.inventory.values(), old.invWidth, old.invHeight)[0]
    if (old && spot) hudModel.placeCursorItem(old.id, spot.x, spot.y, INVENTORY_BUFFER)
    await waitFor(() => world.containers.cursor === null, 3000)
  }

  private rearm(): boolean {
    const id = this.sheathed
    const held = this.wielded()
    if (id === null || (held && TOOLS.has(codeOf(held)))) return false
    this.sheathed = null
    const spare = this.host.world.containers.inventory.get(id)
    if (held || !spare) return false
    this.job = this.equip(spare, undefined)
      .catch(() => undefined)
      .finally(() => {
        this.job = null
      })
    return true
  }

  private offerStaff(): void {
    const { world, hudManager, hudModel } = this.host
    const staff = [...world.containers.inventory.values()].find((item) => item.code.trim() === STAFF_CODE)
    if (hudModel === null || !staff) {
      hudModel?.closeHoradricOrifice()
      return
    }
    this.say('Placing the Horadric Staff')
    this.job = (async () => {
      hudModel.pickupItemToCursor(staff.id)
      if (await waitFor(() => world.containers.cursor?.id === staff.id, 3000)) hudModel.confirmQuestReward(staff.id)
      await waitFor(() => hudManager.leftPanel !== 'orifice', 4000)
      hudModel.requestQuestData()
    })()
      .catch(() => undefined)
      .finally(() => {
        this.job = null
      })
  }

  private async cube({ recipe, inStash }: ReadyRecipe): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    if (hudModel === null) return
    const host = { world, hudManager, hudModel }
    this.host.assists.journal?.('cube', { makes: recipe.makes, inStash })
    if (inStash.length > 0 && !(await this.fromStash('cube', () => withdraw(host, inStash)))) return
    const made = await transmute(host, recipe)
    this.toast(made ? 'Transmuted in the Horadric Cube' : "Couldn't use the Horadric Cube", made ? recipe.makes : 'Try it by hand', made ? 'green' : 'gold')
    hudModel.requestQuestData()
  }

  private serve(kind: ArtisanKind, npcId: number): void {
    const { world, hudManager, hudModel } = this.host
    if (hudModel === null) return
    this.say(kind === 'imbue' ? 'Imbuing your best white item' : 'Socketing your best item')
    this.job = useArtisan({ world, hudManager, hudModel }, kind, npcId)
      .then((item) => {
        this.toast(item ? (kind === 'imbue' ? 'Imbued an item' : 'Socketed an item') : 'Nothing worth using the reward on', item?.code.trim() ?? 'Saving it for later', item ? 'green' : 'gold')
        hudModel.requestQuestData()
      })
      .catch(() => undefined)
      .finally(() => {
        this.job = null
      })
  }

  private async errand(errand: Errand): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    const town = this.town()
    if (!town || hudModel === null) return
    if (!errand.npc && !errand.who && !errand.stash) {
      await errand.work?.()
      return
    }
    const find = errand.stash ? () => world.getUnitsByType(2).find((unit) => unit.classId === STASH_CLASS) : () => world.getUnitsByType(1).find((unit) => unit.classId === MONSTER_PATH_IDS.indexOf(errand.who ?? town[errand.npc!]))
    const unit = await this.reach(find, errand)
    if (!unit || !this.active) return
    this.host.assists.use(unit, performance.now())
    if (errand.stash) {
      if (!(await waitFor(() => hudManager.leftPanel === 'stash', 6000))) return
      await waitFor(() => this.host.assists.inventoryCare.busy, CARE_START_MS)
      await waitFor(() => !this.host.assists.inventoryCare.busy, 20000)
      hudModel.closeStash()
      return
    }
    try {
      if (!(await waitFor(() => Boolean(hudManager.worldPanels.npcMenu) || Boolean(hudManager.worldPanels.npcSpeech), 6000))) return
      if (hudManager.worldPanels.npcSpeech) hudManager.worldPanels.closeNpcSpeech()
      if (errand.who) await this.hearOut()
      if (errand.action) {
        if (VENDOR_ACTIONS.has(errand.action)) await this.openShop(errand.action, unit.id)
        else {
          hudModel.handleNpcMenuAction(errand.action, unit.id)
          await waitFor(() => hudManager.leftPanel === 'vendor' || !hudManager.worldPanels.npcMenu, 5000)
        }
        await waitFor(() => this.host.assists.inventoryCare.busy, CARE_START_MS)
        await waitFor(() => !this.host.assists.inventoryCare.busy, 20000)
        await errand.work?.()
      }
    } finally {
      hudModel.closeActiveNpcPanel()
      hudModel.cancelNpcSession(unit.id)
    }
  }

  private async hearOut(): Promise<void> {
    const panels = this.host.hudManager.worldPanels
    const menu = await waitFor(() => Boolean(panels.npcMenu), BRIEFING_MS).then(() => panels.npcMenu)
    const topic = (menu?.options ?? []).map((option) => option.id).find((id) => id.startsWith('talk_quest'))
    if (!menu || topic === undefined) return
    panels.clickNpcMenuOption(topic, menu.context)
    if (await waitFor(() => Boolean(panels.npcSpeech), BRIEFING_MS)) panels.closeNpcSpeech()
  }

  private async openShop(action: string, npcId: number): Promise<boolean> {
    const { hudManager, hudModel } = this.host
    for (let tries = 0; tries < SHOP_TRIES && hudModel !== null; tries++) {
      hudModel.handleNpcMenuAction(action, npcId)
      const open = await waitFor(() => hudManager.leftPanel === 'vendor' && this.store().length > 0, SHOP_FILL_MS)
      if (open && !(await waitFor(() => hudManager.leftPanel !== 'vendor', SHOP_SETTLE_MS))) return true
      if (!(await waitFor(() => Boolean(hudManager.worldPanels.npcMenu), SHOP_FILL_MS))) return false
    }
    return false
  }

  private async reach(find: () => ClientUnit | undefined, errand: Errand): Promise<ClientUnit | null> {
    const deadline = performance.now() + ERRAND_TIMEOUT_MS
    const preset = this.presetOf(errand)
    while (this.active && this.town() !== null && !this.host.assists.playerSteering && performance.now() < deadline) {
      const unit = find()
      const goal = unit ?? preset
      if (!goal) return null
      if (unit && distance(unit, this.host.world.self) <= REACH) return unit
      this.walkTowards(goal, performance.now())
      await new Promise((resolve) => setTimeout(resolve, TICK_MS * 2))
    }
    return null
  }

  private presetOf(errand: Errand): SubTilePoint | null {
    const view = this.host.levelView()
    const town = this.town()
    if (!view || !town) return null
    const preset = view.presetUnits.find((u) => (errand.stash ? u.type === 2 && u.index === STASH_CLASS : u.type === 1 && u.index === MONSTER_PATH_IDS.indexOf(errand.who ?? town[errand.npc!])))
    return preset ? { x: view.originX + preset.subX, y: view.originY + preset.subY } : null
  }

  private walkTowards(goal: SubTilePoint, nowMs: number): void {
    const view = this.host.levelView()
    if (!view) return
    this.host.guide.focus(goal, nowMs)
    const me = this.host.world.self
    const key = `walk:${Math.round(goal.x)},${Math.round(goal.y)}`
    if (this.exploreField?.key !== key) this.exploreField = { key, field: new FlowField({ ...view, walkable: this.host.assists.walkableWithDoorsOpen(view) }, goal.x, goal.y) }
    const field = this.exploreField.field
    const path = field.pathFrom(me.x, me.y, 1, 40)
    this.walkRoute(nowMs, path.length > 0 ? [me, ...field.corners(path, me)] : [me, goal])
  }

  private fits(item: ItemData): boolean {
    return freeSpots(this.host.world.containers.inventory.values(), item.invWidth, item.invHeight).length > 0
  }

  private freeCells(): number {
    return INVENTORY_CELLS - [...this.host.world.containers.inventory.values()].reduce((cells, item) => cells + item.invWidth * item.invHeight, 0)
  }

  private potionsWanted(): number {
    const { world, hudManager } = this.host
    const rows = hudManager.belt.maxRows
    const [healing, mana] = POTION_COLUMNS[this.isCaster() ? 'caster' : 'melee']
    const count = (prefix: string) => [...world.containers.belt.values()].filter((item) => item.code.startsWith(prefix)).length
    const free = rows * 4 - world.containers.belt.size
    return Math.min(free, Math.max(0, healing * rows - count('hp')) + Math.max(0, mana * rows - count('mp')))
  }

  private scrollsWanted(kind: keyof typeof SCROLL_KINDS): number {
    const { tome: tomeCode, scroll, keep, spare } = SCROLL_KINDS[kind]
    const { tome, scrolls } = scrollsCarried(this.host.world.containers.inventory.values(), tomeCode, scroll)
    return Math.max(0, (tome ? keep : spare) - scrolls)
  }

  private async restock(): Promise<void> {
    await this.buyScroll('portal')
    await this.buyPotions()
    await this.topUp('portal', BUY_TRIES)
    await this.buyScroll('identify')
    await this.topUp('identify', BUY_TRIES)
    await this.buyUpgrade()
  }

  private async repairAndShop(): Promise<void> {
    await this.repair()
    await this.buyUpgrade()
  }

  private priceList(transaction: typeof BUY | typeof GAMBLE = BUY): (item: ItemData) => number {
    const { world } = this.host
    const npcId = world.npcInteraction.npcId
    const npc = npcId === null ? undefined : world.getUnit('monster', npcId)
    return (item) => {
      try {
        return npc ? vendorPrice113c(item, transaction, { world, npcClass: npc.classId }) : Infinity
      } catch {
        return Infinity
      }
    }
  }

  private store(): ItemData[] {
    return [...this.host.world.containers.shop.values()]
  }

  private async gamble(gambled = 1): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    if (hudModel === null || world.npcInteraction.window !== 'gamble' || !(await waitFor(() => this.store().length > 0, HIRE_LIST_MS))) return
    const bare = bareSlotsOf(world.containers.equipment.values())
    const build = appraisalContextOf(world).build
    const offered = this.store().filter((item) => gambleWorthy(item, build))
    const fund = world.self.gold + world.self.stashGold - gambleReserve(world.self.level)
    const pick = gamblePick(offered, bare, Math.min(world.self.gold, fund), this.priceList(GAMBLE), (item) => this.fits(item), { fillFirst: this.bare() > 0, treat: gambleTreat(fund) })
    const before = world.self.gold
    if (!pick || hudManager.leftPanel !== 'vendor' || !hudModel.vendorBuy(pick.id, false) || !(await waitFor(() => world.self.gold < before, 1500))) return
    this.toast('Gambled', `${pick.code.trim()} for ${(before - world.self.gold).toLocaleString('en-US')} gold`, 'gold')
    if (gambled < GAMBLING_RULES.buys) await this.gamble(gambled + 1)
  }

  private async buyUpgrade(bought = 1, filled: ReadonlySet<string> = new Set()): Promise<void> {
    const { world, hudManager, hudModel, assists } = this.host
    if (hudModel === null || hudManager.leftPanel !== 'vendor' || world.npcInteraction.npcId === null) return
    const budget = world.self.gold - (this.bare() > 0 ? Math.max(BARE_RESERVE, world.self.level * RESERVE_PER_LEVEL) : SPARE_GOLD)
    const price = this.priceList()
    const pick = this.store()
      .map((item) => ({ item, appraisal: assists.inventoryCare.appraise(item), cost: price(item) }))
      .filter(({ item, appraisal, cost }) => appraisal.upgradeSlot !== undefined && !filled.has(appraisal.upgradeSlot) && cost <= budget && this.fits(item))
      .sort((a, b) => b.appraisal.score / Math.max(1, b.cost) - a.appraisal.score / Math.max(1, a.cost))[0]
    const before = world.self.gold
    if (!pick || !hudModel.vendorBuy(pick.item.id, false) || !(await waitFor(() => world.self.gold < before, 1500))) return
    this.toast('Bought better gear', pick.appraisal.reason, 'green')
    if (bought < GEAR_BUYS) await this.buyUpgrade(bought + 1, new Set([...filled, pick.appraisal.upgradeSlot!]))
  }

  private async topUp(kind: keyof typeof SCROLL_KINDS, tries: number): Promise<void> {
    if (tries > 0 && (await this.buyScroll(kind))) await this.topUp(kind, tries - 1)
  }

  private async buyScroll(kind: keyof typeof SCROLL_KINDS): Promise<boolean> {
    const { world, hudManager, hudModel } = this.host
    const { tome: tomeCode, scroll, tomeGold } = SCROLL_KINDS[kind]
    const { tome } = scrollsCarried(world.containers.inventory.values(), tomeCode, scroll)
    const code = tome ? scroll : world.self.gold >= tomeGold ? tomeCode : kind === 'portal' ? scroll : null
    const ware = this.store().find((item) => item.code.trim() === code)
    const before = world.self.gold
    const wanted = code === tomeCode || this.scrollsWanted(kind) > 0
    if (hudModel === null || hudManager.leftPanel !== 'vendor' || !ware || !wanted || (!(code === scroll && tome) && !this.fits(ware))) return false
    return hudModel.vendorBuy(ware.id, false) && waitFor(() => world.self.gold < before, 1500)
  }

  private socketMove(): SocketMove | null {
    const { equipment, inventory, sockets } = this.host.world.containers
    return nextSocketMove({ equipment: equipment.values(), inventory: inventory.values(), sockets }, appraisalContextOf(this.host.world).build)
  }

  private async socketAll(): Promise<void> {
    const { world, hudModel } = this.host
    for (let move = this.socketMove(); move && hudModel !== null && this.active; move = this.socketMove()) {
      const { filler, target, why } = move
      hudModel.pickupItemToCursor(filler.id)
      if (!(await waitFor(() => world.containers.cursor?.id === filler.id, IDENTIFY_MS))) break
      hudModel.socketItem(filler.id, target.id)
      if (!(await waitFor(() => world.containers.cursor === null, IDENTIFY_MS))) break
      this.toast('Socketed an item', why, 'green')
    }
  }

  private carried(code: string): ItemData[] {
    return [...this.host.world.containers.inventory.values()].filter((item) => item.code.trim() === code)
  }

  private resistWanted(): { readonly boss: string; readonly code: string; readonly potion: string } | null {
    const row = this.host.guide.currentPlan?.goal.row
    const found = Object.entries(LAIRS.resists).find(([, resist]) => resist.row === row)
    return found && this.carried(found[1].code).length < LAIRS.resistCount ? { boss: found[0], ...found[1] } : null
  }

  private async buyResists(code: string): Promise<void> {
    const { hudManager, hudModel } = this.host
    for (const ware of this.store().filter((item) => item.code.trim() === code)) {
      const before = this.carried(code).length
      if (hudModel === null || hudManager.leftPanel !== 'vendor' || before >= LAIRS.resistCount || !this.fits(ware) || !hudModel.vendorBuy(ware.id, false) || !(await waitFor(() => this.carried(code).length > before, 1500))) break
    }
  }

  private drinkResists(nowMs: number): boolean {
    const { world, hudModel } = this.host
    const boss = Object.entries(LAIRS.levels).find(([, level]) => level === world.areaId)?.[0]
    const resist = boss === undefined ? undefined : (LAIRS.resists as Readonly<Record<string, { readonly code: string }>>)[boss]
    const potion = resist && this.carried(resist.code)[0]
    if (!potion || hudModel === null) return false
    if (nowMs - (this.errandsAt.get('drink') ?? Number.NEGATIVE_INFINITY) >= USE_MS) {
      this.errandsAt.set('drink', nowMs)
      hudModel.useItem(potion.id)
    }
    return true
  }

  private boons(): ItemData[] {
    return [...this.host.world.containers.inventory.values()].filter((item) => BOONS.has(item.code.trim()))
  }

  private async useBoons(): Promise<void> {
    const { world, hudModel } = this.host
    for (const item of this.boons()) {
      if (hudModel === null || !this.active) break
      hudModel.useItem(item.id)
      await waitFor(() => !world.containers.inventory.has(item.id), IDENTIFY_MS)
    }
  }

  private unidentified(): ItemData[] {
    return [...this.host.world.containers.inventory.values()].filter((item) => !item.identified)
  }

  private async identifyAll(): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    if (hudManager.rightPanel !== 'inv') hudManager.toggleRightPanel('inv')
    for (const item of this.unidentified()) {
      const source = scrollSource(world.containers.inventory.values(), 'ibk', 'isc')
      if (!source || hudModel === null || !this.active) break
      if (!(await this.armIdentify(source.id, IDENTIFY_TRIES))) break
      hudModel.identifyItem(item.id, source.id)
      await waitFor(() => world.containers.inventory.get(item.id)?.identified !== false, IDENTIFY_MS)
    }
    if (hudManager.rightPanel === 'inv') hudManager.toggleRightPanel('inv')
  }

  private async armIdentify(sourceId: number, tries: number): Promise<boolean> {
    const { hudManager, hudModel } = this.host
    if (tries <= 0 || hudModel === null) return false
    hudModel.useItem(sourceId)
    return (await waitFor(() => hudManager.pendingIdentifyScrollId !== null, IDENTIFY_MS)) || this.armIdentify(sourceId, tries - 1)
  }

  private isCaster(): boolean {
    return appraisalContextOf(this.host.world).build.style !== 'melee'
  }

  private async buyPotions(): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    if (hudModel === null || hudManager.leftPanel !== 'vendor') return
    const rows = hudManager.belt.maxRows
    const [healing, mana] = POTION_COLUMNS[this.isCaster() ? 'caster' : 'melee']
    const belt = (prefix: string) => [...world.containers.belt.values()].filter((item) => item.code.startsWith(prefix)).length
    const price = this.priceList()
    const pool = { hp: hudManager.maxHp || world.self.maxLife, mp: hudManager.maxMana || world.self.maxMana }
    const restores = POTIONS.restores as Readonly<Record<string, number>>
    const bestIn = (prefix: 'hp' | 'mp'): ItemData | undefined => {
      const tiers = this.store().filter((item) => item.code.startsWith(prefix)).sort((a, b) => potionTier(a.code) - potionTier(b.code))
      const affordable = tiers.filter((item) => price(item) * POTION_SHARE <= world.self.gold)
      return affordable.find((item) => (restores[item.code.trim()] ?? 0) >= pool[prefix] * POTIONS.enough) ?? affordable.at(-1) ?? tiers[0]
    }
    for (const [prefix, columns] of [['hp', healing], ['mp', mana]] as const) {
      const potion = bestIn(prefix)
      for (let tries = 0; potion && tries < BUY_TRIES && belt(prefix) < columns * rows && world.containers.belt.size < rows * 4; tries++) {
        const before = belt(prefix)
        if (!hudModel.vendorBuy(potion.id, false) || !(await waitFor(() => belt(prefix) > before, 1500))) break
      }
    }
    const spares = this.isCaster() ? SPARE_POTIONS.caster : SPARE_POTIONS.melee
    const total = (prefix: string) => [...world.containers.belt.values(), ...world.containers.inventory.values()].filter((item) => item.code.startsWith(prefix)).length
    const bossFight = Object.values(LAIRS.resists).some((resist) => resist.row === this.host.guide.currentPlan?.goal.row) ? LAIRS.bossPotions : 0
    for (const [prefix, spare] of [['hp', spares[0] + (BELT_ROWS - rows) * healing + bossFight], ['mp', spares[1]]] as const) {
      const potion = bestIn(prefix)
      const wanted = Math.min(belt(prefix) + spare, total(prefix) + this.freeCells() - GEAR_ROOM)
      for (let tries = 0; potion && tries < BUY_TRIES && total(prefix) < wanted && world.self.gold >= (prefix === 'hp' ? price(potion) : SPARE_GOLD); tries++) {
        const before = total(prefix)
        if (!hudModel.vendorBuy(potion.id, false) || !(await waitFor(() => total(prefix) > before, 1500))) break
      }
    }
  }

  private async repair(): Promise<void> {
    const { hudManager, hudModel } = this.host
    if (hudModel !== null && hudManager.leftPanel === 'vendor') hudModel.vendorRepairAll()
    await new Promise((resolve) => setTimeout(resolve, REPAIR_MS))
  }
}
