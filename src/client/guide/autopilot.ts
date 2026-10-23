import { appraisalContextOf } from '../../common/items/loot-context.ts'
import { MONSTER_PATH_IDS } from '../../common/path/monster-path-data.ts'
import { getLevelMonsterLevel113c } from '../../common/world/levels-monlvl-113c.ts'
import { WAYPOINT_CLASS_IDS_113C } from '../../common/world/objects-meta.ts'
import type { ItemData } from '../../netproto/index.ts'
import { TELEPORT } from '../input/combat-planner.ts'
import { scrollsCarried, scrollSource } from '../input/town-portal.ts'
import { isClosedDoor, type PlayAssists } from '../input/play-assists.ts'
import type { LevelView } from '../map/level-view.ts'
import type { SubTilePoint } from '../motion/pathfind.ts'
import type { HudModel } from '../ui-model/hud-model.ts'
import { waitFor } from '../ui-model/stash-deposit.ts'
import type { HudManager } from '../ui/hud-manager.ts'
import type { ClientUnit } from '../world/client-unit.ts'
import type { ClientWorld } from '../world/client-world.ts'
import { useArtisan, type ArtisanKind } from './artisan.ts'
import { readyRecipe, transmute } from './cube-recipes.ts'
import { buildOf, nextSkill, nextStat } from './build-plan.ts'
import { alongLine } from './chevron-flow.ts'
import { FlowField } from './flow-field.ts'
import type { GuidePlan, GuideTarget, PathGuide } from './path-guide.ts'
import { ACT_TOWNS, actOfLevel, levelName } from './route.ts'
import TOWNS from './data/towns.json'

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
  readonly stash?: true
  readonly action?: string
  readonly work?: () => Promise<unknown>
}

const TICK_MS = 100
const WALK_MS = 260
const LOOKAHEAD = 15
const TELEPORT_AHEAD = 17
const TELEPORT_MS = 420
const TELEPORT_MANA = 0.5
const TELEPORT_MISSES = 3
const TELEPORT_OFF_MS = 60_000
const REACH = 4
const INTERACT_REACH = 14
const QUEST_FOCUS = 25
const USE_MS = 900
const USE_TRIES = 8
const TALK_MS = 1200
const SPEECH_SKIP_MS = 250
const STUCK_TALK_MS = 20_000
const STUCK_MS = 3200
const STUCK_MOVE = 1.5
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
const RECOVERED_LIFE = 0.85
const HEAL_MANA = 0.4
const REPAIR_BELOW = 0.3
const POTION_COLUMNS = { melee: [3, 1], caster: [2, 2] } as const
const POTION_GOLD = 100
const SPARE_POTIONS = { melee: [4, 1], caster: [3, 3] } as const
const SPARE_GOLD = 2000
const BUY_TRIES = 16
const SCROLL_KINDS = {
  portal: { tome: 'tbk', scroll: 'tsc', tomeGold: 500, keep: 10, spare: 2 },
  identify: { tome: 'ibk', scroll: 'isc', tomeGold: 300, keep: 10, spare: 0 },
} as const
const SCROLL_GOLD = 100
const IDENTIFY_MS = 1500
const QUEST_STALE_MS = 30_000
const ROOM_REACHED = 8
const ROOM_END = 3
const STASH_CLASS = 267
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
const potionTier = (code: string) => Number(code.slice(2)) || 0

export class Autopilot {
  active = false
  private lastTick = Number.NEGATIVE_INFINITY
  private lastWalk = Number.NEGATIVE_INFINITY
  private blink: { readonly at: number; readonly from: SubTilePoint; readonly pending: boolean; readonly misses: number; readonly offUntil: number } | null = null
  private pausedUntil = Number.NEGATIVE_INFINITY
  private progress = { ms: 0, x: 0, y: 0 }
  private job: Promise<unknown> | null = null
  private readonly uses = new Map<number, { readonly at: number; readonly tries: number }>()
  private readonly errandsAt = new Map<string, number>()
  private talk: { readonly npcId: number; readonly hint: string; readonly since: number; at: number; spoke: boolean; opened: boolean; readonly heard: Set<string> } | null = null
  private waypointTo: number | null = null
  private readonly explored = new Map<number, Set<number>>()
  private exploreField: { readonly key: string; readonly field: FlowField } | null = null
  private trip: 'retreat' | 'return' | null = null
  private retreatWhy = ''
  private trail: { readonly level: number; readonly at: SubTilePoint; readonly before: SubTilePoint }[] = []
  private leftBehind: typeof this.trail = []
  private lastSpot: { readonly level: number; readonly x: number; readonly y: number } | null = null
  private kiteSince: number | null = null
  private questWatch = { hint: '', since: 0, asked: Number.NEGATIVE_INFINITY }
  private chase: { readonly id: number; readonly since: number } | null = null
  private readonly ignored = new Map<number, number>()
  private readonly served = new Set<ArtisanKind>()
  private lifeLog: readonly { readonly at: number; readonly life: number }[] = []
  private crossing: { readonly to: SubTilePoint; readonly until: number } | null = null
  private gapSearch: { readonly since: number; readonly from: SubTilePoint } | null = null
  private lastSpend = Number.NEGATIVE_INFINITY
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
    this.toast(title, detail, color)
  }

  tick(nowMs: number): void {
    if (!this.active || nowMs - this.lastTick < TICK_MS) return
    this.lastTick = nowMs
    const { world, assists } = this.host
    if (assists.playerSteering) this.pausedUntil = nowMs + MANUAL_PAUSE_MS
    if (world.areaId > 0) this.noteArea()
    if (world.isDead) this.stop('Autopilot off', 'red', 'You died')
    else if (nowMs < this.pausedUntil) this.say('Paused while you play')
    else if (world.areaId > 0 && !this.job) this.decide(nowMs)
  }

  private decide(nowMs: number): void {
    const { assists } = this.host
    this.refreshQuests(nowMs)
    const town = this.town()
    this.trip = town && this.trip === 'retreat' ? 'return' : !town && this.trip === 'return' ? null : this.trip
    if (this.trip === 'retreat' && !town && this.recovered()) this.trip = null
    const danger = town ? null : this.trip === 'retreat' ? this.retreatWhy : this.danger(nowMs)
    assists.pilotCombat = assists.autoCombatKey !== null && danger === null
    assists.standDown = danger !== null
    assists.holdLoot = this.questInReach()
    if (danger === null) this.spend(nowMs)
    if (this.keepCrossing(nowMs)) this.say(danger ?? 'Crossing over')
    else if (danger !== null) this.retreat(danger, nowMs)
    else if (assists.isFighting(nowMs)) this.say('Fighting')
    else if (!this.questInReach() && (assists.inventoryCare.busy || assists.hasLootNearby(nowMs))) this.say('Picking up loot')
    else if (!this.answerPanels(nowMs)) this.carryOn(town, nowMs)
  }

  private carryOn(town: (typeof TOWNS)['Rogue Encampment'] | null, nowMs: number): void {
    const { assists, guide } = this.host
    const errand = town && !this.offTheGrid() ? this.nextErrand(town, nowMs) : null
    if (errand) this.run(errand, nowMs)
    else if (town && this.wounded()) this.say('Waiting to heal before heading out')
    else if (!(town && this.trip === 'return' && this.returnThroughPortal(nowMs)) && !(assists.smartSkills && assists.keepUp(null, nowMs)) && !(town === null && assists.pilotCombat && this.hunt(nowMs))) this.follow(guide.update(nowMs), nowMs)
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
    return { on: this.active, trip: this.trip, job: this.job !== null, crossing: this.crossing !== null, trail: this.trail.map((spot) => spot.level), gap: this.levelGap(), potions: this.healingPotions() }
  }

  private toast(title: string, detail: string, color: 'green' | 'tan' | 'red' | 'gold'): void {
    this.host.assists.journal?.('toast', { title, detail })
    this.host.hudManager.toasts.push({ title, detail, color }, performance.now())
  }

  private town(): (typeof TOWNS)['Rogue Encampment'] | null {
    return (TOWNS as Readonly<Record<string, (typeof TOWNS)['Rogue Encampment']>>)[levelName(this.host.world.areaId)] ?? null
  }

  private follow(plan: GuidePlan | null, nowMs: number): void {
    if (plan) this.pursue(plan, nowMs)
    else this.explore(nowMs, 'No route from here, exploring')
  }

  private pursue(plan: GuidePlan, nowMs: number): void {
    const { world, assists } = this.host
    const { target, step } = plan
    this.say(plan.hint)
    const door = plan.doors.map((id) => world.getUnit('object', id)).find((unit): unit is ClientUnit => unit !== undefined && isClosedDoor(unit) && distance(unit, world.self) <= REACH + 1)
    const unit = target?.unit && world.getUnit(target.unit.kind === 'object' ? 'object' : 'monster', target.unit.id)
    if (door) this.useOnce(door, nowMs)
    else if (!target) this.explore(nowMs, plan.hint)
    else if (step?.kind === 'waypoint' && unit) {
      this.waypointTo = step.level
      this.reachThen(target, nowMs, () => this.useOnce(unit, nowMs))
    } else if (unit && target.unit.kind === 'npc' && !assists.isHostile(unit)) this.reachThen(target, nowMs, () => this.speakTo(unit, plan, nowMs))
    else if (unit && target.unit.kind === 'object') this.reachThen(target, nowMs, () => this.useOnce(unit, nowMs))
    else if (step?.kind === 'exit') this.exitThrough(target, nowMs)
    else if (distance(target, world.self) <= REACH) this.explore(nowMs, plan.hint)
    else this.walkRoute(nowMs)
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
    const aim = alongLine(route, LOOKAHEAD)
    if (this.offTheGrid()) this.findGap(aim, nowMs)
    else {
      this.gapSearch = null
      assists.walkTo(aim.x, aim.y, nowMs)
    }
    this.lastWalk = nowMs
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
    if (warp && distance(warp, me) <= REACH + 2) this.useOnce(warp, nowMs)
    else if (warp || distance(target, me) > REACH) this.walkRoute(nowMs)
    else this.stepAcross(target, nowMs)
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
    if (plan?.target?.unit?.id === unit.id) this.skip(plan, `${unit.name ?? 'It'} wouldn't respond`)
    else this.walkRoute(nowMs)
  }

  private speakTo(npc: ClientUnit, plan: GuidePlan, nowMs: number): void {
    const talk = this.talk
    const same = talk?.npcId === npc.id && talk.hint === plan.hint ? talk : null
    if (same?.spoke && nowMs - same.since > STUCK_TALK_MS) this.skip(plan, `Talking to ${npc.name ?? 'them'} didn't move it on`)
    else if (!same || (nowMs - same.at >= TALK_MS && !this.host.hudManager.worldPanels.npcMenu)) {
      this.talk = same ? Object.assign(same, { at: nowMs, opened: false }) : { npcId: npc.id, hint: plan.hint, since: nowMs, at: nowMs, spoke: false, opened: false, heard: new Set<string>() }
      this.host.assists.use(npc, nowMs)
    }
  }

  private skip(plan: GuidePlan, why: string): void {
    this.talk = null
    if (plan.goal.row === undefined) this.stop('Autopilot needs you', 'gold', plan.hint)
    else {
      this.host.guide.skip(plan.goal.row)
      this.toast(`Skipping ${plan.goal.title} for now`, why, 'gold')
    }
  }

  private answerPanels(nowMs: number): boolean {
    const { hudManager, hudModel, world } = this.host
    if (hudModel === null) return false
    const wp = hudManager.worldPanels
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

  private exploreLevel(view: LevelView, nowMs: number, status: string): void {
    const { world, assists } = this.host
    const visited = this.explored.get(view.id) ?? new Set<number>()
    this.explored.set(view.id, visited)
    const me = world.self
    const centre = (room: LevelView['rooms'][number]) => ({ x: room.worldSubX + room.subW / 2, y: room.worldSubY + room.subH / 2 })
    view.rooms.filter((room) => distance(centre(room), me) <= Math.max(room.subW, room.subH) / 2 + ROOM_REACHED).forEach((room) => visited.add(room.index))
    const next = view.rooms.filter((room) => !visited.has(room.index)).sort((a, b) => distance(centre(a), me) - distance(centre(b), me))[0]
    this.say(next ? status : `${status} (explored everything)`)
    if (!next) return
    const goal = centre(next)
    const key = `${view.id}:${next.index}`
    if (this.exploreField?.key !== key) this.exploreField = { key, field: new FlowField({ ...view, walkable: assists.walkableWithDoorsOpen(view) }, goal.x, goal.y) }
    const field = this.exploreField.field
    const path = field.pathFrom(me.x, me.y, 1, 40)
    if (path.length <= ROOM_END) visited.add(next.index)
    else this.walkRoute(nowMs, [me, ...field.corners(path, me)])
  }

  private noteArea(): void {
    const { world } = this.host
    const { areaId, self } = world
    const last = this.lastSpot
    if (last && last.level !== areaId) {
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
    const retreatAt = Math.min(MAX_RETREAT_LIFE, Math.max(MIN_RETREAT_LIFE, RETREAT_LIFE + this.levelGap() * GAP_CAUTION - (stocked ? STOCKED_NERVE : 0)))
    if (life < retreatAt) return 'Low on life, heading to town'
    if (healing === 0 && life < DRY_LIFE) return 'Out of healing potions, heading to town'
    return (!stocked && burst >= BURST_LOSS && life < DRY_LIFE) || (healing <= 1 && life < LAST_POTION_LIFE) ? 'Taking a beating, heading to town' : null
  }

  private questInReach(): boolean {
    const target = this.host.guide.currentPlan?.target
    return target?.unit?.kind === 'object' && distance(target, this.host.world.self) <= QUEST_FOCUS
  }

  private recovered(): boolean {
    const { world, hudManager } = this.host
    return world.self.life >= (hudManager.maxHp || world.self.maxLife) * RECOVERED_LIFE && this.healingPotions() >= HUNT_POTIONS
  }

  private wounded(): boolean {
    const { world, hudManager } = this.host
    return world.self.life < (hudManager.maxHp || world.self.maxLife) * HEAL_LIFE
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
    const bold = me.life >= (hudManager.maxHp || me.maxLife) * HUNT_LIFE && this.healingPotions() >= HUNT_POTIONS && this.levelGap() <= HUNT_GAP
    const chased = this.chase && world.getUnit('monster', this.chase.id)
    const huntable = (unit: ClientUnit) => !unit.dead && assists.isHostile(unit) && distance(unit, me) <= HUNT_RADIUS && (this.ignored.get(unit.id) ?? 0) <= nowMs
    const fresh = () => world.getUnitsByType(1).filter(huntable).sort((a, b) => distance(a, me) - distance(b, me)).find((unit) => assists.canReach(unit, nowMs) || !this.ignore(unit, nowMs))
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

  private retreat(why: string, nowMs: number): void {
    const { world, assists } = this.host
    const me = world.self
    Object.assign(this, { trip: 'retreat', retreatWhy: why })
    this.say(why)
    const threats = world.getUnitsByType(1).filter((unit) => !unit.dead && assists.isHostile(unit) && distance(unit, me) <= KITE_NEAR)
    this.kiteSince = threats.length === 0 ? null : (this.kiteSince ?? nowMs)
    const portal = world.getUnitsByType(2).find((unit) => unit.classId === TOWN_PORTAL_CLASS && distance(unit, me) <= PORTAL_REACH)
    if (portal) this.touch(portal, nowMs)
    else if (threats.length > 0 && nowMs - this.kiteSince! < KITE_MS && this.kite(threats, nowMs)) return
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

  private walkHome(nowMs: number): void {
    const me = this.host.world.self
    const here = this.trail.at(-1)
    if (here?.level !== this.host.world.areaId) this.homeByWaypoint(nowMs)
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
    else if (length > SEAM_JUMP || length < 1e-6) this.homeByWaypoint(nowMs)
    else this.cross({ x: here.at.x + (across.x / length) * SEAM_STEP, y: here.at.y + (across.y / length) * SEAM_STEP }, nowMs)
  }

  private takeHome(way: ClientUnit, nowMs: number): void {
    if (WAYPOINT_CLASS_IDS_113C.has(way.classId)) this.waypointTo = ACT_TOWNS[actOfLevel(this.host.world.areaId)]!
    if (distance(way, this.host.world.self) <= REACH) this.touch(way, nowMs)
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
      this.stop('Autopilot needs you', 'red', 'Low on life with no town portal or way back')
    }
  }

  private spend(nowMs: number): void {
    const { world, hudManager, hudModel } = this.host
    const build = buildOf(world.self.charClass)
    if (!this.spendPoints || build === null || hudModel === null || nowMs - this.lastSpend < SPEND_MS) return
    const tree = hudManager.skillTree
    const attrs = hudManager.charSheet.attrs
    const skill = tree.unspentSkillPoints > 0 ? nextSkill(build, (id) => tree.getHardPoints(id), (id) => tree.canAllocate(id)) : null
    const stat = attrs.statPoints > 0 ? nextStat(build, { str: attrs.baseStr ?? 0, dex: attrs.baseDex ?? 0, vit: attrs.baseVit ?? 0, ene: attrs.baseEne ?? 0 }) : null
    if (skill !== null) hudModel.allocateSkill(skill)
    else if (stat !== null) hudModel.allocateStat(stat)
    else return
    this.lastSpend = nowMs
  }

  private returnThroughPortal(nowMs: number): boolean {
    const { world } = this.host
    const portal = world.getUnitsByType(2).filter((unit) => unit.classId === TOWN_PORTAL_CLASS).sort((a, b) => distance(a, world.self) - distance(b, world.self))[0]
    if (!portal) {
      this.trip = null
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
    const dry = this.healingPotions() === 0
    const cooldown = (key: string) => (key === 'heal' ? HEAL_COOLDOWN_MS : (key === 'potions' && dry) || key === 'cube' ? RESTOCK_COOLDOWN_MS : ERRAND_COOLDOWN_MS)
    const ready = (key: string) => nowMs - (this.errandsAt.get(key) ?? Number.NEGATIVE_INFINITY) >= cooldown(key)
    const wounded = me.life < (hudManager.maxHp || me.maxLife) * HEAL_LIFE || me.mana < (hudManager.maxMana || me.maxMana) * HEAL_MANA
    const merc = world.merc
    const worn = [...world.containers.equipment.values()].some((item) => (item.maxDurability ?? 0) > 0 && (item.curDurability ?? item.durability ?? 0) < (item.maxDurability ?? 0) * REPAIR_BELOW)
    const recipe = readyRecipe(world)
    const errands: readonly (Errand | false)[] = [
      wounded && ready('heal') && { key: 'heal', reason: 'Healing up', npc: 'healer' },
      Boolean(merc?.isDead) && (merc?.reviveCost ?? Infinity) <= me.gold && ready('mercs') && { key: 'mercs', reason: 'Reviving your mercenary', npc: 'mercs', action: 'resurrect' },
      worn && ready('repair') && { key: 'repair', reason: 'Repairing gear', npc: 'repair', action: 'trade_repair', work: () => this.repair() },
      (this.scrollsWanted('portal') > 0 && me.gold >= SCROLL_GOLD) || (this.potionsWanted() > 0 && me.gold >= POTION_GOLD) || (care.config?.sellJunk === true && care.junk.length + care.clutter.length > 0)
        ? ready('potions') && { key: 'potions', reason: 'Buying potions and portals', npc: 'potions', action: 'trade', work: () => this.restock() }
        : false,
      recipe !== null && ready('cube') && { key: 'cube', reason: `Making ${recipe[0]} in the Horadric Cube`, work: () => this.cube(recipe[1]) },
      care.upgrades.length > 0 && ready('gear') && { key: 'gear', reason: 'Putting on better gear', work: () => care.wearUpgrades() },
      this.unidentified().length > 0 && scrollSource(world.containers.inventory.values(), 'ibk', 'isc') !== null && ready('identify') && { key: 'identify', reason: 'Identifying items', work: () => this.identifyAll() },
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

  private async cube(recipe: Parameters<typeof transmute>[1]): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    if (hudModel === null) return
    const made = await transmute({ world, hudManager, hudModel }, recipe)
    if (made) this.toast('Transmuted in the Horadric Cube', recipe.makes, 'green')
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
    if (!errand.npc && !errand.stash) {
      await errand.work?.()
      return
    }
    const find = errand.stash ? () => world.getUnitsByType(2).find((unit) => unit.classId === STASH_CLASS) : () => world.getUnitsByType(1).find((unit) => unit.classId === MONSTER_PATH_IDS.indexOf(town[errand.npc!]))
    const unit = await this.reach(find, errand)
    if (!unit || !this.active) return
    this.host.assists.use(unit, performance.now())
    if (errand.stash) {
      if (!(await waitFor(() => hudManager.leftPanel === 'stash', 6000))) return
      await waitFor(() => this.host.assists.inventoryCare.busy, 1200)
      await waitFor(() => !this.host.assists.inventoryCare.busy, 20000)
      hudModel.closeStash()
      return
    }
    if (!(await waitFor(() => Boolean(hudManager.worldPanels.npcMenu) || Boolean(hudManager.worldPanels.npcSpeech), 6000))) return
    if (hudManager.worldPanels.npcSpeech) hudManager.worldPanels.closeNpcSpeech()
    if (errand.action) {
      hudModel.handleNpcMenuAction(errand.action, unit.id)
      await waitFor(() => hudManager.leftPanel === 'vendor' || !hudManager.worldPanels.npcMenu, 5000)
      await waitFor(() => this.host.assists.inventoryCare.busy, 1200)
      await waitFor(() => !this.host.assists.inventoryCare.busy, 20000)
      await errand.work?.()
    }
    hudModel.closeActiveNpcPanel()
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
      await new Promise((resolve) => setTimeout(resolve, WALK_MS))
    }
    return null
  }

  private presetOf(errand: Errand): SubTilePoint | null {
    const view = this.host.levelView()
    const town = this.town()
    if (!view || !town) return null
    const preset = view.presetUnits.find((u) => (errand.stash ? u.type === 2 && u.index === STASH_CLASS : u.type === 1 && u.index === MONSTER_PATH_IDS.indexOf(town[errand.npc!])))
    return preset ? { x: view.originX + preset.subX, y: view.originY + preset.subY } : null
  }

  private walkTowards(goal: SubTilePoint, nowMs: number): void {
    const view = this.host.levelView()
    if (!view) return
    const me = this.host.world.self
    const key = `walk:${Math.round(goal.x)},${Math.round(goal.y)}`
    if (this.exploreField?.key !== key) this.exploreField = { key, field: new FlowField({ ...view, walkable: this.host.assists.walkableWithDoorsOpen(view) }, goal.x, goal.y) }
    const field = this.exploreField.field
    const path = field.pathFrom(me.x, me.y, 1, 40)
    this.walkRoute(nowMs, path.length > 0 ? [me, ...field.corners(path, me)] : [me, goal])
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
  }

  private async topUp(kind: keyof typeof SCROLL_KINDS, tries: number): Promise<void> {
    if (tries > 0 && (await this.buyScroll(kind))) await this.topUp(kind, tries - 1)
  }

  private async buyScroll(kind: keyof typeof SCROLL_KINDS): Promise<boolean> {
    const { world, hudManager, hudModel } = this.host
    const { tome: tomeCode, scroll, tomeGold } = SCROLL_KINDS[kind]
    const { tome } = scrollsCarried(world.containers.inventory.values(), tomeCode, scroll)
    const code = tome ? scroll : world.self.gold >= tomeGold ? tomeCode : kind === 'portal' ? scroll : null
    const ware = [...world.containers.shop.values()].find((item) => item.code.trim() === code)
    const before = world.self.gold
    const wanted = code === tomeCode || this.scrollsWanted(kind) > 0
    if (hudModel === null || hudManager.leftPanel !== 'vendor' || !ware || !wanted) return false
    return hudModel.vendorBuy(ware.id, false) && waitFor(() => world.self.gold < before, 1500)
  }

  private unidentified(): ItemData[] {
    return [...this.host.world.containers.inventory.values()].filter((item) => !item.identified)
  }

  private async identifyAll(): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    for (const item of this.unidentified()) {
      const source = scrollSource(world.containers.inventory.values(), 'ibk', 'isc')
      if (!source || hudModel === null || !this.active) break
      hudModel.useItem(source.id)
      if (!(await waitFor(() => hudManager.pendingIdentifyScrollId !== null, IDENTIFY_MS))) break
      hudModel.identifyItem(item.id, source.id)
      await waitFor(() => world.containers.inventory.get(item.id)?.identified !== false, IDENTIFY_MS)
    }
    if (hudManager.rightPanel === 'inv') hudManager.toggleRightPanel('inv')
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
    const bestIn = (prefix: string): ItemData | undefined => [...world.containers.shop.values()].filter((item) => item.code.startsWith(prefix)).sort((a, b) => potionTier(b.code) - potionTier(a.code))[0]
    for (const [prefix, columns] of [['hp', healing], ['mp', mana]] as const) {
      const potion = bestIn(prefix)
      for (let tries = 0; potion && tries < BUY_TRIES && belt(prefix) < columns * rows && world.containers.belt.size < rows * 4; tries++) {
        const before = belt(prefix)
        if (!hudModel.vendorBuy(potion.id, false) || !(await waitFor(() => belt(prefix) > before, 1500))) break
      }
    }
    const spares = this.isCaster() ? SPARE_POTIONS.caster : SPARE_POTIONS.melee
    const total = (prefix: string) => [...world.containers.belt.values(), ...world.containers.inventory.values()].filter((item) => item.code.startsWith(prefix)).length
    for (const [prefix, spare] of [['hp', spares[0]], ['mp', spares[1]]] as const) {
      const potion = bestIn(prefix)
      const wanted = belt(prefix) + spare
      for (let tries = 0; potion && tries < BUY_TRIES && total(prefix) < wanted && world.self.gold >= SPARE_GOLD; tries++) {
        const before = total(prefix)
        if (!hudModel.vendorBuy(potion.id, false) || !(await waitFor(() => total(prefix) > before, 1500))) break
      }
    }
  }

  private async repair(): Promise<void> {
    const { hudManager, hudModel } = this.host
    if (hudModel !== null && hudManager.leftPanel === 'vendor') hudModel.vendorRepairAll()
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
}
