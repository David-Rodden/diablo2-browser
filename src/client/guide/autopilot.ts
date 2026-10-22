import { appraisalContextOf } from '../../common/items/loot-context.ts'
import { MONSTER_PATH_IDS } from '../../common/path/monster-path-data.ts'
import type { ItemData } from '../../netproto/index.ts'
import { TELEPORT } from '../input/combat-planner.ts'
import type { PlayAssists } from '../input/play-assists.ts'
import type { LevelView } from '../map/level-view.ts'
import type { SubTilePoint } from '../motion/pathfind.ts'
import type { HudModel } from '../ui-model/hud-model.ts'
import { waitFor } from '../ui-model/stash-deposit.ts'
import type { HudManager } from '../ui/hud-manager.ts'
import type { ClientUnit } from '../world/client-unit.ts'
import type { ClientWorld } from '../world/client-world.ts'
import { alongLine } from './chevron-flow.ts'
import { FlowField } from './flow-field.ts'
import type { GuidePlan, GuideTarget, PathGuide } from './path-guide.ts'
import { levelName } from './route.ts'
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

const TICK_MS = 150
const WALK_MS = 380
const LOOKAHEAD = 9
const TELEPORT_AHEAD = 17
const TELEPORT_MS = 420
const TELEPORT_MANA = 0.5
const TELEPORT_MISSES = 3
const TELEPORT_OFF_MS = 60_000
const REACH = 4
const USE_MS = 1400
const USE_TRIES = 5
const TALK_MS = 2200
const SPEECH_MS = 6000
const STUCK_TALK_MS = 20_000
const STUCK_MS = 3200
const STUCK_MOVE = 1.5
const MANUAL_PAUSE_MS = 4000
const ERRAND_COOLDOWN_MS = 300_000
const HEAL_COOLDOWN_MS = 45_000
const ERRAND_TIMEOUT_MS = 45_000
const RETREAT_LIFE = 0.3
const HEAL_LIFE = 0.7
const HEAL_MANA = 0.4
const REPAIR_BELOW = 0.3
const POTION_COLUMNS = { melee: [3, 1], caster: [2, 2] } as const
const POTION_GOLD = 600
const BUY_TRIES = 16
const ROOM_REACHED = 8
const STASH_CLASS = 267
const TOWN_PORTAL_CLASS = 59
const PORTAL_REACH = 12
const TRAVEL_OPTIONS = ['travel_east', 'travel_west', 'travel_harrogath']
const WARP_NEAR = 7
const SEAM_STEP = 8

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
    Object.assign(this, { active: false, job: null, talk: null })
    Object.assign(assists, { pilotCombat: false, questPickup: false })
    guide.pilotStatus = null
    this.toast(title, detail, color)
  }

  tick(nowMs: number): void {
    if (!this.active || nowMs - this.lastTick < TICK_MS) return
    this.lastTick = nowMs
    const { world, assists } = this.host
    if (assists.playerSteering) this.pausedUntil = nowMs + MANUAL_PAUSE_MS
    if (world.isDead) this.stop('Autopilot off', 'red', 'You died')
    else if (nowMs < this.pausedUntil) this.say('Paused while you play')
    else if (world.areaId > 0 && !this.job) this.decide(nowMs)
  }

  private decide(nowMs: number): void {
    const { assists } = this.host
    const town = this.town()
    this.trip = town && this.trip === 'retreat' ? 'return' : !town && this.trip === 'return' ? null : this.trip
    const fleeing = !town && this.shouldRetreat()
    assists.pilotCombat = assists.autoCombatKey !== null && !fleeing
    if (fleeing) this.retreat(nowMs)
    else if (assists.isFighting(nowMs)) this.say('Fighting')
    else if (assists.inventoryCare.busy || assists.hasLootNearby(nowMs)) this.say('Picking up loot')
    else if (!this.answerPanels(nowMs)) this.carryOn(town, nowMs)
  }

  private carryOn(town: (typeof TOWNS)['Rogue Encampment'] | null, nowMs: number): void {
    const { assists, guide } = this.host
    const errand = town ? this.nextErrand(town, nowMs) : null
    if (errand) this.run(errand, nowMs)
    else if (!(town && this.trip === 'return' && this.returnThroughPortal(nowMs)) && !(assists.smartSkills && assists.keepUp(null, nowMs))) this.follow(guide.update(nowMs), nowMs)
  }

  private say(status: string): void {
    this.host.guide.pilotStatus = status
  }

  private toast(title: string, detail: string, color: 'green' | 'tan' | 'red' | 'gold'): void {
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
    const door = plan.doors.map((id) => world.getUnit('object', id)).find((unit): unit is ClientUnit => unit !== undefined && distance(unit, world.self) <= REACH + 1)
    const unit = target?.unit && world.getUnit(target.unit.kind === 'object' ? 'object' : 'monster', target.unit.id)
    if (door) this.useOnce(door, nowMs)
    else if (!target) this.explore(nowMs, plan.hint)
    else if (step?.kind === 'waypoint' && unit) {
      this.waypointTo = step.level
      this.reachThen(target, nowMs, () => this.useOnce(unit, nowMs))
    } else if (unit && target.unit.kind === 'npc' && !assists.isHostile(unit)) this.reachThen(target, nowMs, () => this.speakTo(unit, plan, nowMs))
    else if (unit && target.unit.kind === 'object') this.reachThen(target, nowMs, () => this.useOnce(unit, nowMs))
    else if (step?.kind === 'exit') this.exitThrough(target, nowMs)
    else this.walkRoute(nowMs)
  }

  private reachThen(target: GuideTarget, nowMs: number, then: () => void): void {
    if (distance(target, this.host.world.self) <= REACH) then()
    else this.walkRoute(nowMs)
  }

  private walkRoute(nowMs: number, route = this.host.guide.routeFrom(this.host.world.self)): void {
    const { world, assists } = this.host
    const me = world.self
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
    assists.walkTo(aim.x, aim.y, nowMs)
    this.lastWalk = nowMs
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
    if (nowMs - this.lastWalk < WALK_MS) return
    this.host.assists.stepTo(target.x + (out.x / length) * SEAM_STEP, target.y + (out.y / length) * SEAM_STEP, nowMs)
    this.lastWalk = nowMs
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
    const topic = ours && (ids.find((id) => TRAVEL_OPTIONS.includes(id)) ?? ids.find((id) => id.startsWith('talk_quest') && !ours.heard.has(id)) ?? (!ours.opened && menu?.submenu !== 'talk' && ids.includes('talk') ? 'talk' : undefined))
    if (menu && ours && topic) {
      if (topic === 'talk') ours.opened = true
      else Object.assign(ours, { spoke: true, at: nowMs }).heard.add(topic)
      wp.clickNpcMenuOption(topic, menu.context)
      return true
    }
    if (wp.npcSpeech && talk && nowMs - talk.at < SPEECH_MS) return true
    if (!menu && !wp.npcSpeech) return false
    if (talk) Object.assign(talk, { spoke: true })
    hudModel.closeActiveNpcPanel()
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
    if (path.length === 0) visited.add(next.index)
    else this.walkRoute(nowMs, [me, ...field.corners(path, me)])
  }

  private shouldRetreat(): boolean {
    const { world, hudManager } = this.host
    const me = world.self
    const { belt, inventory } = world.containers
    const healing = [...belt.values(), ...inventory.values()].some((item) => /^(hp|rv)/.test(item.code))
    return me.life < (hudManager.maxHp || me.maxLife) * RETREAT_LIFE && !healing
  }

  private retreat(nowMs: number): void {
    const { world, assists } = this.host
    this.say('Low on life, heading to town')
    const portal = world.getUnitsByType(2).find((unit) => unit.classId === TOWN_PORTAL_CLASS && distance(unit, world.self) <= PORTAL_REACH)
    if (portal) {
      this.trip = 'retreat'
      this.useOnce(portal, nowMs)
    } else if (nowMs - (this.errandsAt.get('portal') ?? Number.NEGATIVE_INFINITY) > USE_MS * 2) {
      this.errandsAt.set('portal', nowMs)
      assists.castTownPortal()
    }
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
    const ready = (key: string) => nowMs - (this.errandsAt.get(key) ?? Number.NEGATIVE_INFINITY) >= (key === 'heal' ? HEAL_COOLDOWN_MS : ERRAND_COOLDOWN_MS)
    const wounded = me.life < (hudManager.maxHp || me.maxLife) * HEAL_LIFE || me.mana < (hudManager.maxMana || me.maxMana) * HEAL_MANA
    const merc = world.merc
    const worn = [...world.containers.equipment.values()].some((item) => (item.maxDurability ?? 0) > 0 && (item.curDurability ?? item.durability ?? 0) < (item.maxDurability ?? 0) * REPAIR_BELOW)
    const errands: readonly (Errand | false)[] = [
      wounded && ready('heal') && { key: 'heal', reason: 'Healing up', npc: 'healer' },
      Boolean(merc?.isDead) && (merc?.reviveCost ?? Infinity) <= me.gold && ready('mercs') && { key: 'mercs', reason: 'Reviving your mercenary', npc: 'mercs', action: 'resurrect' },
      worn && ready('repair') && { key: 'repair', reason: 'Repairing gear', npc: 'repair', action: 'trade_repair', work: () => this.repair() },
      (this.potionsWanted() > 0 && me.gold >= POTION_GOLD) || (care.config?.sellJunk === true && care.junk.length > 0) ? ready('potions') && { key: 'potions', reason: 'Buying potions', npc: 'potions', action: 'trade', work: () => this.buyPotions() } : false,
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

  private async errand(errand: Errand): Promise<void> {
    const { world, hudManager, hudModel } = this.host
    const town = this.town()
    if (!town || hudModel === null) return
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
    await waitFor(() => !hudManager.worldPanels.npcSpeech, SPEECH_MS)
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
    while (this.active && !this.host.assists.playerSteering && performance.now() < deadline) {
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
  }

  private async repair(): Promise<void> {
    const { hudManager, hudModel } = this.host
    if (hudModel !== null && hudManager.leftPanel === 'vendor') hudModel.vendorRepairAll()
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
}
