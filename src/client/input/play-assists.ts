import type { ClientCommand } from '../../netproto/index.ts'
import type { LevelView } from '../map/level-view.ts'
import { findPathWorld, type SubTilePoint, type SubTileWalkabilityGrid } from '../motion/pathfind.ts'
import type { HudModel } from '../ui-model/hud-model.ts'
import type { HudManager } from '../ui/hud-manager.ts'
import type { ClientUnit } from '../world/client-unit.ts'
import type { ClientWorld } from '../world/client-world.ts'
import { CANONICAL_113C_OBJECTS } from '../../common/world/objects-meta.ts'
import { AutoPotionPlanner, bottomBeltPotions, inventoryPotions, potionShortage, wantedPotionPickup, type AutoPotionThresholds, type PotionDrink } from './auto-potion.ts'
import type { CameraLike, DispatchedCommandRecord } from './command-mapper.ts'

export const ITEM_PICKUP_REACH_SUBTILES = 4
const PICKUP_RETRY_MS = 1000
const PICKUP_DETOUR_RETRY_MS = 2500
const AUTO_PICKUP_RADIUS_SUBTILES = 20
const CARRIED_GOLD_PER_LEVEL = 10_000
const AUTO_COMBAT_REPEAT_MS = 40
const HIT_CONFIRM_SLACK_MS = 120
const DEFAULT_PING_MS = 200
const STATE_HEALTHPOT = 100
const STATE_MANAPOT = 106
const REACH_CACHE_MS = 400
const REACH_MAX_NODES = 4000
const REACH_DETOUR_FACTOR = 1.6
const REACH_DETOUR_SLACK = 12
const DOOR_SEARCH_MS = 400
const DOOR_RETRY_MS = 1500
const DOOR_PATH_RADIUS = 3
const INTERACTION_PANELS = new Set(['stash', 'cube', 'vendor', 'hire', 'imbue', 'add_sockets', 'personalize', 'trade', 'waypoint'])

export interface PlayAssistHost {
  readonly world: ClientWorld
  readonly hudManager: HudManager
  readonly hudModel: HudModel | null
  readonly camera: CameraLike
  readonly mouseHeld: () => { readonly left: boolean; readonly right: boolean }
  readonly isMoving: () => boolean
  readonly distanceFromSelf: () => (unit: ClientUnit) => number
  readonly centerCameraOnSelf: () => void
  readonly levelViewAt: (sx: number, sy: number) => LevelView | null
  readonly walkableWith: (view: LevelView, sx: number, sy: number, objects: readonly ClientUnit[]) => Uint8Array
  readonly triggerPrimaryWorldAction: (x: number, y: number, unit: ClientUnit | null, nowMs: number, isHold?: boolean) => DispatchedCommandRecord | null
  readonly sendCommand: (command: ClientCommand, nowMs?: number) => void
  readonly isHostile: (unit: ClientUnit) => boolean
  readonly isPointIntercepted: (screenX: number, screenY: number) => boolean
  readonly isPlayerBusyCasting: (nowMs: number) => boolean
  readonly isTownArea: () => boolean
}

const objectMetaOf = (unit: ClientUnit) => unit.objectMeta ?? CANONICAL_113C_OBJECTS[unit.classId]
const collisionMask = (unit: ClientUnit) => objectMetaOf(unit)?.hasCollisionMask ?? 0
const objectMode = (unit: ClientUnit) => Math.max(0, Math.min(7, Math.floor(unit.mode || 0)))
const isClosedDoor = (unit: ClientUnit) => !unit.hidden && !unit.dead && Boolean(objectMetaOf(unit)?.isDoor) && (collisionMask(unit) & (1 << objectMode(unit))) !== 0
const openModeOf = (door: ClientUnit) => [0, 1, 2, 3, 4, 5, 6, 7].find((mode) => (collisionMask(door) & (1 << mode)) === 0)
const asOpened = (door: ClientUnit): ClientUnit => {
  const mode = openModeOf(door)
  return mode === undefined ? door : (Object.create(door, { mode: { value: mode } }) as ClientUnit)
}
const isInGrid = (grid: SubTileWalkabilityGrid, x: number, y: number) => {
  const [ox, oy] = [grid.subOriginX ?? 0, grid.subOriginY ?? 0]
  return x >= ox && y >= oy && x < ox + grid.subWidth && y < oy + grid.subHeight
}

export class PlayAssists {
  autoGoldPickup = false
  autoPotionThresholds: AutoPotionThresholds | null = null
  private readonly autoPotion = new AutoPotionPlanner()
  private readonly pickupRetryAt = new Map<number, number>()
  private autoCombatKeyValue: string | null = null
  private autoCombatOn = false
  private targetId: number | null = null
  private lastAutoCombatMs = Number.NEGATIVE_INFINITY
  private lastHit: { readonly id: number; readonly life: number } | null = null
  private swingFinishedAtMs: number | null = null
  private engagedMonsterId: number | null = null
  private readonly reachability = new Map<number, { readonly atMs: number; readonly reachable: boolean }>()
  private collisionGrids: { readonly atMs: number; readonly grids: Map<boolean, SubTileWalkabilityGrid | null> } = { atMs: Number.NEGATIVE_INFINITY, grids: new Map() }
  private readonly doorAttemptAt = new Map<number, number>()
  private lastDoorSearchMs = Number.NEGATIVE_INFINITY

  constructor(private readonly host: PlayAssistHost) {}

  get autoCombatKey(): string | null {
    return this.autoCombatKeyValue
  }

  set autoCombatKey(key: string | null) {
    this.autoCombatKeyValue = key
    this.setAutoCombatOn(false)
  }

  tick(nowMs: number): void {
    this.drinkPotionsIfLow(nowMs)
    this.pickUpNearbyLoot(nowMs)
    this.runAutoCombat(nowMs)
  }

  handleKey(event: { readonly key: string; readonly repeat?: boolean | undefined; readonly preventDefault?: (() => void) | undefined }): boolean {
    if (this.autoCombatKey === null || (event.key === ' ' ? 'SPACE' : event.key.toUpperCase()) !== this.autoCombatKey) return false
    if (!event.repeat) this.setAutoCombatOn(!this.autoCombatOn)
    event.preventDefault?.()
    return true
  }

  reset(): void {
    this.targetId = null
  }

  engageMonster(id: number): void {
    this.engagedMonsterId = id
    this.host.hudModel?.setHoveredMonster(id)
  }

  showHoveredMonster(id: number | null): void {
    const engaged = this.engagedMonsterId === null ? undefined : this.host.world.getUnit('monster', this.engagedMonsterId)
    const isShowingEngaged = (this.host.mouseHeld().left || this.autoCombatOn) && engaged !== undefined && this.host.isHostile(engaged)
    if (!isShowingEngaged) this.host.hudModel?.setHoveredMonster(id)
  }

  pickUpNearbyLoot(nowMs: number): void {
    const { world } = this.host
    const { ground } = world.containers
    ;[...this.pickupRetryAt.keys()].filter((id) => !ground.has(id)).forEach((id) => this.pickupRetryAt.delete(id))
    if (world.isDead || this.isInWorldInteraction()) return
    const wanted = this.lootWanted()
    const distance = this.host.distanceFromSelf()
    const nearest = [...ground.values()]
      .filter((item) => wanted(item.code.trim()) && (this.pickupRetryAt.get(item.id) ?? 0) <= nowMs)
      .map((item) => world.getUnit('item', item.id))
      .filter((unit): unit is ClientUnit => unit !== undefined && distance(unit) <= AUTO_PICKUP_RADIUS_SUBTILES)
      .sort((a, b) => distance(a) - distance(b))[0]
    if (nearest === undefined) return
    const inReach = distance(nearest) <= ITEM_PICKUP_REACH_SUBTILES
    if (!inReach && !this.isFreeForLootDetour(nowMs)) return
    this.pickupRetryAt.set(nearest.id, nowMs + (inReach ? PICKUP_RETRY_MS : PICKUP_DETOUR_RETRY_MS))
    if (inReach) this.host.sendCommand({ type: 'ItemPickup', itemId: nearest.id, toCursor: false }, nowMs)
    else this.host.triggerPrimaryWorldAction(nearest.x, nearest.y, nearest, nowMs)
  }

  drinkPotionsIfLow(nowMs: number): void {
    const { world, hudManager, hudModel } = this.host
    const thresholds = this.autoPotionThresholds
    const active = thresholds !== null && !world.isDead && !this.host.isTownArea()
    const { inventory, belt } = world.containers
    const potions = active ? [...inventoryPotions(inventory.values()), ...bottomBeltPotions(belt.values())] : []
    const { self } = world
    const maxLife = hudManager.maxHp || self.maxLife
    const maxMana = hudManager.maxMana || self.maxMana
    const vitals = {
      life: Math.min(self.life, maxLife),
      maxLife,
      mana: Math.min(self.mana, maxMana),
      maxMana,
      mercLifePct: active ? this.mercLifePct() : null,
      healingActive: self.states.has(STATE_HEALTHPOT),
      manaActive: self.states.has(STATE_MANAPOT),
      charClass: self.charClass,
    }
    hudManager.potionShortage = active ? potionShortage(potions, thresholds, vitals) : null
    if (!active || hudModel === null) return
    const drink = this.autoPotion.plan(potions, vitals, thresholds, nowMs)
    if (drink !== null && this.drinkPotion(drink, hudModel)) this.autoPotion.record(drink, nowMs)
  }

  runAutoCombat(nowMs: number): void {
    if (!this.autoCombatOn || this.host.mouseHeld().left || this.host.world.isDead || this.isInWorldInteraction() || nowMs - this.lastAutoCombatMs < AUTO_COMBAT_REPEAT_MS) return
    const target = this.resolveTarget(nowMs)
    if (target === null) return this.openDoorTowardMonster(nowMs)
    if (this.isAwaitingHitResult(target, nowMs)) return
    const freshTarget = target.id !== this.targetId
    this.targetId = target.id
    this.lastAutoCombatMs = nowMs
    const record = this.host.triggerPrimaryWorldAction(target.x, target.y, target, nowMs, !freshTarget)
    if (record?.command.type === 'SkillOn' && record.rateLimit.allowed) {
      this.lastHit = { id: target.id, life: target.lifePct }
      this.swingFinishedAtMs = null
    }
  }

  private setAutoCombatOn(on: boolean): void {
    this.autoCombatOn = on
    this.targetId = null
    this.host.hudManager.autoCombatBadge = this.autoCombatKeyValue === null ? null : { on, key: this.autoCombatKeyValue }
  }

  private isInWorldInteraction(): boolean {
    const { hudManager } = this.host
    return INTERACTION_PANELS.has(hudManager.leftPanel) || Boolean(hudManager.worldPanels?.npcMenu)
  }

  private lootWanted(): (code: string) => boolean {
    const { self, containers } = this.host.world
    const wantsGold = this.autoGoldPickup && self.gold < self.level * CARRIED_GOLD_PER_LEVEL
    const thresholds = this.autoPotionThresholds
    const wantsPotion = thresholds === null ? () => false : wantedPotionPickup(inventoryPotions([...containers.inventory.values(), ...containers.belt.values()]), thresholds)
    return (code) => (wantsGold && code === 'gld') || wantsPotion(code)
  }

  private isFreeForLootDetour(nowMs: number): boolean {
    const { left, right } = this.host.mouseHeld()
    const fighting = this.autoCombatOn && this.resolveTarget(nowMs) !== null
    return !left && !right && !fighting && !this.host.isMoving()
  }

  private drinkPotion(drink: PotionDrink, hudModel: HudModel): boolean {
    const { hudManager } = this.host
    const withSound = hudManager.commandSink === hudModel
    if ('itemId' in drink) {
      if (withSound) return hudManager.drinkInventoryPotion(drink.itemId, drink.code)
      hudModel.useItem(drink.itemId)
      return true
    }
    const toMerc = drink.kind === 'merc'
    return withSound ? hudManager.drinkBeltSlot(drink.column, toMerc) : hudModel.useBeltSlot(drink.column, toMerc)
  }

  private mercLifePct(): number | null {
    const { world } = this.host
    const unit = world.merc && !world.merc.isDead && world.merc.mercId > 0 ? world.getUnit('monster', world.merc.mercId) : undefined
    return unit === undefined ? null : (unit.lifePct * 100) / 128
  }

  private isAwaitingHitResult(target: ClientUnit, nowMs: number): boolean {
    const last = this.lastHit
    if (last === null || last.id !== target.id || last.life !== target.lifePct) return false
    if (this.host.isPlayerBusyCasting(nowMs)) {
      this.swingFinishedAtMs = null
      return true
    }
    this.swingFinishedAtMs ??= nowMs
    return nowMs - this.swingFinishedAtMs < (this.host.hudManager.pingMs || DEFAULT_PING_MS) + HIT_CONFIRM_SLACK_MS
  }

  private isOnScreenHostile(unit: ClientUnit): boolean {
    if (!this.host.isHostile(unit)) return false
    const { camera } = this.host
    const screen = camera.subtileToScreen(unit.x, unit.y)
    const { width, height } = camera.viewportProfile
    return screen.x >= 0 && screen.y >= 0 && screen.x <= width && screen.y <= height && !this.host.isPointIntercepted(screen.x, screen.y)
  }

  private resolveTarget(nowMs: number): ClientUnit | null {
    this.host.centerCameraOnSelf()
    const current = this.targetId === null ? undefined : this.host.world.getUnit('monster', this.targetId)
    if (current !== undefined && this.isOnScreenHostile(current) && this.isReachable(current, nowMs)) return current
    return this.visibleHostilesByDistance().find((unit) => this.isReachable(unit, nowMs)) ?? null
  }

  private visibleHostilesByDistance(): ClientUnit[] {
    const distance = this.host.distanceFromSelf()
    return [...this.host.world.units.values()].filter((unit) => this.isOnScreenHostile(unit)).sort((a, b) => distance(a) - distance(b))
  }

  private isReachable(unit: ClientUnit, nowMs: number): boolean {
    const cached = this.reachability.get(unit.id)
    if (cached !== undefined && nowMs - cached.atMs < REACH_CACHE_MS) return cached.reachable
    const reachable = this.walkPathTo(unit, false, nowMs) !== null
    this.reachability.set(unit.id, { atMs: nowMs, reachable })
    return reachable
  }

  private walkPathTo(unit: ClientUnit, openDoors: boolean, nowMs: number): readonly SubTilePoint[] | null {
    const [sx, sy] = [Math.round(this.host.world.self.x), Math.round(this.host.world.self.y)]
    const grid = this.collisionGridAt(sx, sy, openDoors, nowMs)
    if (grid === null || !isInGrid(grid, unit.x, unit.y)) return []
    const { rawPath, reachedGoal } = findPathWorld(grid, sx, sy, Math.round(unit.x), Math.round(unit.y), { unitSize: 2, allowPartial: false, smooth: false, nearestTargetRadius: 2, maxExpandedNodes: REACH_MAX_NODES })
    return reachedGoal && rawPath.length <= Math.hypot(unit.x - sx, unit.y - sy) * REACH_DETOUR_FACTOR + REACH_DETOUR_SLACK ? rawPath : null
  }

  private collisionGridAt(sx: number, sy: number, openDoors: boolean, nowMs: number): SubTileWalkabilityGrid | null {
    if (nowMs - this.collisionGrids.atMs >= REACH_CACHE_MS) this.collisionGrids = { atMs: nowMs, grids: new Map() }
    const { grids } = this.collisionGrids
    if (grids.has(openDoors)) return grids.get(openDoors) ?? null
    const view = this.host.levelViewAt(sx, sy)
    const objects = this.objects().map((unit) => (openDoors && isClosedDoor(unit) ? asOpened(unit) : unit))
    const grid = view && view.walkable.length > 0 && isInGrid(view, sx, sy) ? { ...view, walkable: this.host.walkableWith(view, sx, sy, objects) } : null
    grids.set(openDoors, grid)
    return grid
  }

  private objects(): readonly ClientUnit[] {
    const { world } = this.host
    return world.getUnitsByType ? world.getUnitsByType(2) : []
  }

  private openDoorTowardMonster(nowMs: number): void {
    if (nowMs - this.lastDoorSearchMs < DOOR_SEARCH_MS) return
    this.lastDoorSearchMs = nowMs
    const doors = this.objects().filter((door) => isClosedDoor(door) && (this.doorAttemptAt.get(door.id) ?? 0) <= nowMs)
    if (doors.length === 0) return
    const doorOnPath = (path: readonly SubTilePoint[]) => path.map((step) => doors.find((door) => Math.hypot(door.x - step.x, door.y - step.y) <= DOOR_PATH_RADIUS)).find((door) => door !== undefined)
    const door = this.visibleHostilesByDistance().reduce<ClientUnit | undefined>((found, monster) => found ?? doorOnPath(this.walkPathTo(monster, true, nowMs) ?? []), undefined)
    if (door === undefined) return
    this.doorAttemptAt.set(door.id, nowMs + DOOR_RETRY_MS)
    this.lastAutoCombatMs = nowMs
    this.host.triggerPrimaryWorldAction(door.x, door.y, door, nowMs)
  }
}
