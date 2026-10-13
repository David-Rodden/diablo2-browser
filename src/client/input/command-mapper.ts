/**
 * Input -> ClientCommand Mapper (Milestone M5 — F17)
 *
 * Translates browser mouse/pointer and keyboard events in any registered viewport profile
 * into rate-limited `ClientCommand`s and local movement predictions:
 * - Screen-to-world subtile conversion via `screenToSubTile` (isometric 2:1 projection).
 * - HUD hit-test gating via `HudManager.isPointInterceptedByHud(x, y)` so clicks on
 *   status bar, orbs, belt, skill popups, or open panels never trigger ground movement.
 * - Ground movement: `findPathWorld` -> `LocalMovementPredictor` +
 *   rate-limited `Move` (`0x01` walk / `0x03` run) via `OutboundRateLimiter`.
 * - Unit interaction: `MoveToUnit` (`0x02`/`0x04`), `Interact` (`0x13`), `ItemPickup` (`0x16`).
 * - Skill casting: `SkillAt` (`0x05` left / `0x08` right), `SkillOn` (`0x06` left / `0x0c` right).
 * - Hotkeys: `1..4` belt use (`0x26`), `F1..F8` skill select (`0x3c`), `W` weapon swap (`0x60`),
 *   `R` run/walk toggle, `Tab` automap toggle, `C`/`I`/`T`/`Q`/`P`/`M` panel toggles, `Alt` item labels.
 */

import {
  ClickButtonId,
  UNIT_TYPE_TO_ID,
  type ClientCommand,
  type Hand,
  type UnitRef,
} from '../../netproto/index.ts'
import type { HudManager } from '../ui/hud-manager.ts'
import type { AutomapView } from '../automap/automap-view.ts'
import type { LevelView } from '../map/level-view.ts'
import type { MapService } from '../map/map-service.ts'
import { findPathWorld, type SubTilePoint } from '../motion/pathfind.ts'
import type { LocalMovementPredictor } from '../motion/predictor.ts'
import { OutboundRateLimiter, type RateLimitAcquireResult } from '../session/rate-limiter.ts'
import type { HudModel } from '../ui-model/hud-model.ts'
import {
  VIEWPORT_800x600,
  getViewportProfile,
  getViewportProfileBySize,
  screenToSubTile,
  subTileToScreen,
  type ViewportProfile,
  type ViewportResolution,
} from '../view/viewport-profile.ts'
import type { ClientUnit } from '../world/client-unit.ts'
import type { ClientWorld } from '../world/client-world.ts'
import { getMonsterKindByHcIdx } from '../../common/units/monsters-data.ts'
import { getTownNpcDescriptorByHcIdx, isTownNpcHcIdx } from '../../common/units/npc-table.ts'
import {
  CANONICAL_113C_OBJECTS,
  WAYPOINT_CLASS_IDS_113C,
  isObjectInInteractRange113c,
  isObjectSelectableInMode,
} from '../../common/world/objects-meta.ts'
import { isSkillAllowedInTown } from '../../common/skills/skills-meta.ts'
import { isTownLevel } from '../../common/world/scene-population.ts'
import {
  clickGate113c,
  isNpcInInteractRange113c,
  isWarpInInteractRange113c,
  monsterHasInteractFlag113c,
  skillHasTargetItem113c,
  TARGET_CORPSE_SKILL_IDS_113C,
  TARGET_PET_OR_ALLY_SKILL_IDS_113C,
  WARP_CLICK_COOLDOWN_MS_113C,
  type NpcInteractPhase113c,
  type PressKind113c,
} from './click-rules-113c.ts'
import { MONSTATS2FLAG_REVIVE, getMonsterPathRecord } from '../../common/path/units.ts'
import { SKILL_INPUT_FLAGS_113C } from './generated/input-tables-113c.ts'
import { isMetalItemCode113c } from '../../common/items/metal-items-113c.ts'
import { PET_TYPE_UNSUMMON_IDX_113C } from '../../common/units/pet-type-table.ts'

export const CORPSE_TARGET_SKILL_IDS = new Set<number>([
  ...TARGET_CORPSE_SKILL_IDS_113C,
  54,  // Find Potion (alias)
  70,  // Raise Skeleton
  80,  // Raise Skeletal Mage
  95,  // Revive
  124, // Redemption
  131, // Find Potion
  142, // Find Item
  149, // Grim Ward (alias)
  150, // Grim Ward
  158, // Heart of Wolverine
  175, // Carrion Vine
  181, // Solar Creeper
  214, // Rest in Peace / corpse redemption
  276, // Death Sentry
  307, // Death Sentry (sub-skill)
  312, // Wake of Fire
  314, // Blade Sentinel
  325, // Blade Shield
  327, // Blade Fury
  351, // Carrion Vine / Creeper
])

export const ALLY_OR_PET_TARGET_SKILL_IDS = new Set<number>(TARGET_PET_OR_ALLY_SKILL_IDS_113C)

function canRightSkillTargetObjectOrItem(skillId: number): boolean {
  if (!Number.isInteger(skillId) || skillId < 0 || skillId >= SKILL_INPUT_FLAGS_113C.length) {
    return false
  }
  return skillHasTargetItem113c(skillId)
}

/**
 * Returns true if `classId` (`MonStats.txt` `hcIdx`) is a player summon, pet, or trap:
 * - `289..292`: Clay, Blood, Iron, Fire Golem
 * - `351..353`: Hydra heads
 * - `356..357`: Decoy (Dopplezon), Valkyrie
 * - `363..364`: Necromancer Skeleton, Skeletal Mage
 * - `411..418`: Assassin Traps (`411..416`) & Shadow Warrior/Master (`417..418`)
 * - `419..428`: Druid Raven, Spirit Wolf, Dire Wolf, Spirits, Vines, Grizzly
 */
export function isPlayerSummonClassId(classId: number): boolean {
  return (
    (classId >= 289 && classId <= 292) ||
    (classId >= 351 && classId <= 353) ||
    (classId >= 356 && classId <= 357) ||
    (classId >= 363 && classId <= 364) ||
    (classId >= 411 && classId <= 428)
  )
}

export interface CameraLike {
  readonly subX: number
  readonly subY: number
  readonly viewportProfile: ViewportProfile
  screenToSubtile(screenX: number, screenY: number): { readonly x: number; readonly y: number }
  subtileToScreen(subX: number, subY: number): { readonly x: number; readonly y: number }
  snapTo(subX: number, subY: number): void
  update(subX: number, subY: number): void
  resize(widthOrProfile: number | ViewportProfile | ViewportResolution, height?: number): void
}

/**
 * Isometric sub-tile camera tracking the player center for any registered `ViewportProfile`.
 */
export class ViewportCamera implements CameraLike {
  subX = 0
  subY = 0
  viewportProfile: ViewportProfile

  constructor(
    widthOrProfile: number | ViewportProfile | ViewportResolution = VIEWPORT_800x600,
    height?: number,
  ) {
    this.viewportProfile =
      typeof widthOrProfile === 'number'
        ? getViewportProfileBySize(widthOrProfile, height)
        : getViewportProfile(widthOrProfile)
  }

  screenToSubtile(screenX: number, screenY: number): { readonly x: number; readonly y: number } {
    const raw = screenToSubTile(screenX, screenY, this.subX, this.subY, this.viewportProfile)
    return {
      x: Math.round(raw.x),
      y: Math.round(raw.y),
    }
  }

  subtileToScreen(subX: number, subY: number): { readonly x: number; readonly y: number } {
    return subTileToScreen(subX, subY, this.subX, this.subY, this.viewportProfile)
  }

  snapTo(subX: number, subY: number): void {
    this.subX = subX
    this.subY = subY
  }

  update(subX: number, subY: number): void {
    this.subX = subX
    this.subY = subY
  }

  resize(widthOrProfile: number | ViewportProfile | ViewportResolution, height?: number): void {
    this.viewportProfile =
      typeof widthOrProfile === 'number'
        ? getViewportProfileBySize(widthOrProfile, height)
        : getViewportProfile(widthOrProfile)
  }
}

export interface SkillHotkeyBinding {
  readonly skillId: number
  readonly hand: Hand
  readonly itemId?: number | undefined
}

/**
 * Single source of truth for skill-hotkey keys *bindable* from the skill popup
 * (vanilla 1.13c: F1..F8 only). Widen this regex (and only this regex) to support
 * more bindable keys — hotkey *execution* follows the binding maps, not this regex,
 * so already-bound keys keep working regardless of range changes.
 */
export const SKILL_HOTKEY_KEY_RE_113C = /^F[1-8]$/

export interface CommandMapperDeps {
  readonly world: ClientWorld
  readonly camera?: CameraLike | undefined
  readonly hudManager: HudManager
  readonly hudModel?: HudModel | undefined
  readonly predictor?: LocalMovementPredictor | undefined
  readonly mapService?: MapService | undefined
  readonly automapView?: AutomapView | undefined
  readonly rateLimiter?: OutboundRateLimiter | undefined
  readonly sendCommand: (cmd: ClientCommand, nowMs?: number) => void
  /** Optional hook to check if an external UI overlay (e.g. top toolbar / chat input) intercepted the point. */
  readonly isExternalUiIntercepted?: ((screenX: number, screenY: number) => boolean) | undefined
  /** Optional callback when Enter key toggles chat input. */
  readonly onToggleChatInput?: (() => void) | undefined
  /** Optional callback when Escape is pressed with no open HUD panels. */
  readonly onEscapeMenu?: (() => void) | undefined
}

export interface PointerWorldTarget {
  readonly subtileX: number
  readonly subtileY: number
  readonly hoveredUnit: ClientUnit | null
}

export interface DispatchedCommandRecord {
  readonly command: ClientCommand
  readonly rateLimit: RateLimitAcquireResult
  readonly path: readonly SubTilePoint[]
}

function unitToRef(unit: ClientUnit): UnitRef {
  return {
    unitType: UNIT_TYPE_TO_ID[unit.unitType],
    id: unit.id,
  }
}

export class CommandMapper {
  private readonly world: ClientWorld
  private readonly camera: CameraLike
  private readonly hudManager: HudManager
  private readonly hudModel: HudModel | null
  private readonly predictor: LocalMovementPredictor | null
  private readonly mapService: MapService | null
  private readonly automapView: AutomapView | null
  private readonly rateLimiter: OutboundRateLimiter
  private readonly sendCommand: (cmd: ClientCommand, nowMs?: number) => void
  private readonly isExternalUiIntercepted?: ((screenX: number, screenY: number) => boolean) | undefined
  private readonly onToggleChatInput?: (() => void) | undefined
  private readonly onEscapeMenu?: (() => void) | undefined

  private shiftHeld = false
  private altHeld = false
  private leftMouseDown = false
  private rightMouseDown = false
  private lastPointerX = 0
  private lastPointerY = 0
  private pointerDownX = 0
  private pointerDownY = 0
  private hoveredUnit: ClientUnit | null = null
  private lockedPointerUnit: ClientUnit | null = null
  /** 1.13c D2Client 0x6fbcc2f8: selection lock active for the current mouse button press. */
  private selectionLocked = false
  /** 1.13c D2Client 0x6fbc9638/0x6fbc964c: unit locked on mouse-down when `selectionLocked` is true. */
  private lockedTargetUnit: ClientUnit | null = null
  /** 1.13c D2Client 0x6fbd34c0: 0 = none, 1 = pressed on ground, 2 = pressed on a unit. */
  private pressKind: PressKind113c = 0
  private pendingItemPickupId: number | null = null
  private pendingNpcInteractId: number | null = null
  private pendingObjectInteractId: number | null = null
  /** 1.13c D2Client pPlayerData+0x150..+0x15c (`0x6facaf0c` -> `0x6fab2d50`): deferred warp (type 5) 0x13 interaction. */
  private pendingWarpInteractId: number | null = null
  /** 1.13c D2Client `[0x6fbc9828]` (`0x6facaed0..0x6facaedc` / `0x6fadb11f`): 500ms warp click cooldown timestamp. */
  private nextWarpClickAllowedMs = -Infinity
  private lastMeleeChaseTargetPos: { unitType: number | string; id: number; x: number; y: number } | null =
    null
  private lastPath: readonly SubTilePoint[] = []
  private lastHoldDispatchMs = 0

  /**
   * NOT 1.13c: Quick Cast mode (Issue #952, PD2/D2R parity; toggled by the `quick-cast`
   * plugin). While `true`, pressing a bound skill hotkey casts the bound skill at the live
   * cursor via {@link quickCastSkillAtCursor} instead of switching the active skill
   * selection. Execution follows the binding maps (`skillHotkeys` / HUD `bindings`), so the
   * supported key set is whatever the binding flow allows. The native binding UX (skill
   * popup hover + bindable key) is unaffected.
   */
  quickCastMode = false

  /** Default F1..F8 skill hotkey bindings (`key.toUpperCase()` -> binding). */
  private readonly skillHotkeys = new Map<string, SkillHotkeyBinding>()

  constructor(deps?: Partial<CommandMapperDeps>) {
    this.world = deps?.world ?? ({} as ClientWorld)
    this.hudManager =
      deps?.hudManager ??
      ({
        screenWidth: 800,
        screenHeight: 600,
        isRunning: true,
        hotkeys: { leftSkillId: 0, rightSkillId: 0 },
        groundItemLabelBoxes: [],
        handleMouseMove: () => {},
        isPointInterceptedByHud: () => false,
        handleClick: () => false,
        syncPublishedState: () => {},
      } as unknown as HudManager)
    this.camera =
      deps?.camera ?? new ViewportCamera(this.hudManager.screenWidth, this.hudManager.screenHeight)
    this.hudModel = deps?.hudModel ?? null
    this.predictor = deps?.predictor ?? null
    this.mapService = deps?.mapService ?? null
    this.automapView = deps?.automapView ?? null
    this.rateLimiter = deps?.rateLimiter ?? new OutboundRateLimiter()
    this.sendCommand = deps?.sendCommand ?? (() => {})
    this.isExternalUiIntercepted = deps?.isExternalUiIntercepted
    this.onToggleChatInput = deps?.onToggleChatInput
    this.onEscapeMenu = deps?.onEscapeMenu
  }

  private isTownArea(world: ClientWorld = this.world): boolean {
    return isTownLevel(world.areaId)
  }

  private isSkillWeaponUsable(skillId: number): boolean {
    const hotkeys = (this.hudModel?.hudManager?.hotkeys ?? this.hudManager?.hotkeys) as
      | { isSkillWeaponUsable?: (id: number) => boolean }
      | undefined
    if (typeof hotkeys?.isSkillWeaponUsable === 'function') {
      return hotkeys.isSkillWeaponUsable(skillId)
    }
    return true
  }

  isFriendlySummonOrPet(unit: ClientUnit, world: ClientWorld = this.world): boolean {
    if (unit.unitType !== 'monster') return false
    if (isPlayerSummonClassId(unit.classId)) return true
    if (world.pets?.has(unit.id)) return true
    if (world.merc && world.merc.mercId === unit.id) return true
    if (unit.ownerType === 'player' || (unit as { ownerType?: unknown }).ownerType === 0) return true
    const selfId = world.selfId || (world.self as { id?: number | undefined })?.id || 0
    if (selfId !== 0 && unit.ownerId === selfId) return true
    if ((unit as { align?: number }).align === 1) return true
    if (
      (unit as { killable?: boolean }).killable === false &&
      !unit.isNpc &&
      !isTownNpcHcIdx(unit.classId)
    ) {
      return true
    }
    return false
  }

  /**
   * 1.13c Unsummon client start (`SkillCltStFunc[3]` 0x6FB51110): walks the client pet roster (S2C 0x7A, 0x6FBCC4D4)
   * for `pPet->dwUnitId == target && pPet->dwOwnerId == self`, then requires the pet's PetType.txt `unsummon = 1`.
   */
  isOwnUnsummonablePet113c(unit: ClientUnit, world: ClientWorld = this.world): boolean {
    if (unit.unitType !== 'monster') return false
    const selfId = world.selfId || (world.self as { id?: number | undefined })?.id || 0
    if (selfId === 0) return false
    const pet = world.pets?.get(unit.id)
    if (pet === undefined || pet.ownerId !== selfId) return false
    return PET_TYPE_UNSUMMON_IDX_113C.has(pet.petType)
  }

  isTownOrInteractiveNpc(unit: ClientUnit, world: ClientWorld = this.world): boolean {
    if (unit.unitType !== 'monster') return false
    if (this.isFriendlySummonOrPet(unit, world)) return false
    const inTown = this.isTownArea(world)
    const monKind = getMonsterKindByHcIdx(unit.classId, world.difficulty)
    return (
      Boolean(unit.isNpc) ||
      Boolean(monKind?.interact || monKind?.npc || monKind?.inTown) ||
      isTownNpcHcIdx(unit.classId) ||
      getTownNpcDescriptorByHcIdx(unit.classId) !== undefined ||
      inTown
    )
  }

  isMonsterCorpse(unit: ClientUnit, world: ClientWorld = this.world): boolean {
    if (unit.unitType !== 'monster') return false
    if (this.isTownOrInteractiveNpc(unit, world)) return false
    if (unit.corpseSuppressed) return false
    // 1.13c D2Common_10633_CheckCorpseCanBeSelected: corpses with udead/hide states
    // (99 redeemed, 104 corpse_nodraw, 107 shatter, 118 corpse_noselect, 173 corpseexp)
    // cannot be targeted by corpse skills.
    if (
      unit.states?.has(99) ||
      unit.states?.has(104) ||
      unit.states?.has(107) ||
      unit.states?.has(118) ||
      unit.states?.has(173)
    ) {
      return false
    }
    return (
      Boolean((unit as { dead?: boolean }).dead) ||
      unit.mode === 0 ||
      unit.mode === 12 ||
      unit.lifePct <= 0
    )
  }

  /**
   * A dead player-type unit other than the local player: a player body (Issue #922).
   *
   * 1.13c D2Game `D2GAME_CORPSE_Handler_6FC7FBD0` allocates the body as a new `UNIT_PLAYER` (own GUID, owner class and
   * name, `PLRMODE_DEAD`, `UNITFLAG_CANBEATTACKED` cleared); clients get `0x59`, the mode-17 `0x0D` (code `0x09`) and
   * `0x74`. D2Client `0x6fb55440` treats player modes `0` / `0x11` (and `UNITFLAG_ISDEAD`) as dead.
   */
  isPlayerCorpse(unit: ClientUnit, world: ClientWorld = this.world): boolean {
    if (unit.unitType !== 'player') return false
    const selfId = world.selfId || (world.self as { id?: number | undefined })?.id || 0
    if (selfId !== 0 && unit.id === selfId) return false
    return unit.dead
  }

  isPlayerHostile(_unit: ClientUnit, _world: ClientWorld = this.world): boolean {
    // Issue #909 R3: PvP and player hostility are permanently disabled.
    return false
  }

  isValidSkillTargetUnit(
    unit: ClientUnit | null | undefined,
    skillId: number,
    world: ClientWorld = this.world,
  ): boolean {
    if (!unit) return false
    // 1.13c SkillCltStFunc[23] (SKILLS_CltSt23_IronGolem 0x6FB782A0, Iron Golem #90): only ground items
    // (UNIT_ITEM = 4, not airborne ITEMMODE 5) whose base passes ITEMS_IsMetalItem (bitfield1 & 2).
    if (skillId === 90) {
      if (unit.unitType !== 'item') return false
      if (unit.mode === 5) return false
      const code = unit.itemCode ?? unit.itemData?.code
      if (code === undefined || code.trim() === '') return false
      return isMetalItemCode113c(code)
    }
    // 1.13c SkillCltStFunc[3] (Unsummon #3, 0x6FB51110): the target must be in the local pet roster
    // (S2C 0x7A, pPet->dwOwnerId == self) and its PetType.txt row must have `unsummon = 1`.
    if (skillId === 3) {
      return this.isOwnUnsummonablePet113c(unit, world)
    }
    if (unit.unitType === 'monster') {
      if (this.isTownOrInteractiveNpc(unit, world)) return false
      if (this.isFriendlySummonOrPet(unit, world)) {
        return ALLY_OR_PET_TARGET_SKILL_IDS.has(skillId)
      }
      if (this.isMonsterCorpse(unit, world)) {
        if (!CORPSE_TARGET_SKILL_IDS.has(skillId)) return false
        const monKind = getMonsterKindByHcIdx(unit.classId, world.difficulty)
        if (skillId === 70 || skillId === 80 || skillId === 95) {
          if (monKind?.boss || Boolean((unit as { isBoss?: boolean }).isBoss)) return false
        }
        // 1.13c SkillCltStFunc[24] (0x6FB78620) & SKILLS_CanUnitBeRevived (0x6FD13180):
        // Revive (#95) additionally requires MonStats2.txt revive == 1 and rejects
        // Unique / Champion / SuperUnique / already-revived (state 96) monsters.
        if (skillId === 95) {
          if (unit.isUnique || unit.isChampion || unit.isSuperUnique || unit.states?.has(96)) {
            return false
          }
          if (Number.isInteger(unit.classId) && unit.classId >= 0 && unit.classId < 734) {
            const pathRec = getMonsterPathRecord(unit.classId)
            if ((pathRec.monStats2Flags & MONSTATS2FLAG_REVIVE) === 0) {
              return false
            }
          }
        }
        return true
      }
      // Live monster: 1.13c TargetCorpse=1 skills (70/74/80/83/95/131/142/150) cannot target live monsters.
      if (TARGET_CORPSE_SKILL_IDS_113C.has(skillId)) return false
      const monKind = getMonsterKindByHcIdx(unit.classId, world.difficulty)
      if (monKind !== undefined && !monKind.killable) return false
      return true
    }
    if (unit.unitType === 'player') {
      const selfId = world.selfId || (world.self as { id?: number | undefined })?.id || 0
      if (selfId !== 0 && unit.id === selfId) return false
      // Player bodies have no UNITFLAG_CANBEATTACKED: D2Client click router 0x6facb7f0 sends them (any non-monster
      // that cannot be attacked) to the interact handler 0x6facab20 (@0x6facbb55), never to a skill (Issue #922).
      if (this.isPlayerCorpse(unit, world)) return false
      if (ALLY_OR_PET_TARGET_SKILL_IDS.has(skillId) && skillId !== 3) return true
      return false
    }
    return false
  }

  /**
   * Find the nearest valid corpse for a corpse-targeting skill (`TARGET_CORPSE_SKILL_IDS_113C`,
   * e.g. Raise Skeleton #70, Raise Skeletal Mage #80, Revive #95, Corpse Explosion #74, etc.)
   * within `radiusSubtiles` of `(subtileX, subtileY)`.
   * Allows casting skeleton/revive/corpse skills when the cursor is near a corpse or when a higher-priority
   * unit (such as a dropped ground item or live monster) overlaps the corpse under the cursor (Issue #1010).
   */
  findNearestValidCorpseForSkill(
    subtileX: number,
    subtileY: number,
    skillId: number,
    world: ClientWorld = this.world,
    radiusSubtiles = 10,
  ): ClientUnit | null {
    if (!TARGET_CORPSE_SKILL_IDS_113C.has(skillId)) return null
    const maxDistSq = radiusSubtiles * radiusSubtiles
    let bestCorpse: ClientUnit | null = null
    let bestDistSq = maxDistSq
    for (const unit of world.getUnitsByType(1)) {
      if (unit.hidden || unit.states?.has(0x8f)) continue
      if (!this.isValidSkillTargetUnit(unit, skillId, world)) continue
      const dx = unit.x - subtileX
      const dy = unit.y - subtileY
      const dSq = dx * dx + dy * dy
      if (dSq <= bestDistSq && (bestCorpse === null || dSq < bestDistSq)) {
        bestDistSq = dSq
        bestCorpse = unit
      }
    }
    return bestCorpse
  }

  /**
   * Direct world-coordinate mouse down translator (used by headless/unit tests and direct callers).
   * Respects 1.13c skill casting delay (`state 121` / `skilldelay`) and town skill restrictions (`InTown`).
   */
  fromMouseDown(
    ev: {
      readonly button: 'left' | 'right' | 0 | 2
      readonly shiftKey?: boolean | undefined
      readonly hold?: boolean | undefined
      readonly worldX: number
      readonly worldY: number
      readonly hoveredUnit?: ClientUnit | null | undefined
    },
    worldOverride?: ClientWorld,
    nowMs?: number,
  ): ClientCommand | null {
    const activeWorld = worldOverride ?? this.world
    const isRight = ev.button === 'right' || ev.button === 2
    const isShift = Boolean(ev.shiftKey ?? this.shiftHeld)
    const isHold = Boolean(ev.hold)
    const skillId = isRight
      ? (activeWorld.self?.rightSkill ?? this.hudModel?.rightSkillId ?? this.hudManager.hotkeys.rightSkillId)
      : (activeWorld.self?.leftSkill ?? this.hudModel?.leftSkillId ?? this.hudManager.hotkeys.leftSkillId)
    const canCastSkillHere = !this.isTownArea(activeWorld) || isSkillAllowedInTown(skillId)
    const hoveredUnit =
      canCastSkillHere &&
      TARGET_CORPSE_SKILL_IDS_113C.has(skillId) &&
      !(ev.hoveredUnit && this.isValidSkillTargetUnit(ev.hoveredUnit, skillId, activeWorld)) &&
      (isRight || isShift || !ev.hoveredUnit)
        ? this.findNearestValidCorpseForSkill(ev.worldX, ev.worldY, skillId, activeWorld)
        : ev.hoveredUnit
    const validTarget = canCastSkillHere && this.isValidSkillTargetUnit(hoveredUnit, skillId, activeWorld)

    if (isRight) {
      if (!canCastSkillHere) {
        return null
      }
      // 1.13c TargetCorpse=1 skills require a valid corpse target and never cast on empty ground or live monsters.
      if (TARGET_CORPSE_SKILL_IDS_113C.has(skillId) && !(hoveredUnit && validTarget)) {
        return null
      }
      // 1.13c Iron Golem (#90, TargetItem=1, cltstfunc=19) requires a valid metallic ground item target.
      if (skillId === 90 && !(hoveredUnit?.unitType === 'item' && validTarget)) {
        return null
      }
      if (typeof activeWorld.isSkillOnCooldown === 'function' && activeWorld.isSkillOnCooldown(skillId, nowMs)) {
        return null
      }
      const isRightItemOrObject =
        hoveredUnit !== null &&
        hoveredUnit !== undefined &&
        (hoveredUnit.unitType === 'object' || hoveredUnit.unitType === 'item')
      if (
        hoveredUnit &&
        (validTarget || (isRightItemOrObject && canRightSkillTargetObjectOrItem(skillId)))
      ) {
        return {
          type: 'SkillOn',
          hand: 'right',
          target: unitToRef(hoveredUnit),
          shift: isShift,
          hold: isHold,
        }
      }
      const targetAt =
        isRightItemOrObject && hoveredUnit
          ? { x: Math.round(hoveredUnit.x), y: Math.round(hoveredUnit.y) }
          : { x: ev.worldX, y: ev.worldY }
      return {
        type: 'SkillAt',
        hand: 'right',
        at: targetAt,
        hold: isHold,
      }
    }

    if (canCastSkillHere && (isShift || validTarget)) {
      if (typeof activeWorld.isSkillOnCooldown === 'function' && activeWorld.isSkillOnCooldown(skillId, nowMs)) {
        return null
      }
    }

    if (isShift && canCastSkillHere) {
      if (validTarget && hoveredUnit) {
        return {
          type: 'SkillOn',
          hand: 'left',
          target: unitToRef(hoveredUnit),
          shift: true,
          hold: isHold,
        }
      }
      return {
        type: 'SkillAt',
        hand: 'left',
        at: { x: ev.worldX, y: ev.worldY },
        hold: isHold,
      }
    }

    if (validTarget && hoveredUnit) {
      return {
        type: 'SkillOn',
        hand: 'left',
        target: unitToRef(hoveredUnit),
        shift: false,
        hold: isHold,
      }
    }

    return {
      type: 'Move',
      run: this.isCurrentlyRunning(),
      to: { x: ev.worldX, y: ev.worldY },
    }
  }

  // ─── State Queries & Configuration ───────────────────────────

  get isShiftHeld(): boolean {
    return this.shiftHeld
  }

  get isAltHeld(): boolean {
    return this.altHeld
  }

  get currentHoveredUnit(): ClientUnit | null {
    return this.hoveredUnit
  }

  get currentPath(): readonly SubTilePoint[] {
    return this.lastPath
  }

  getCamera(): CameraLike {
    return this.camera
  }

  getRateLimiter(): OutboundRateLimiter {
    return this.rateLimiter
  }

  bindSkillHotkey(key: string, binding: SkillHotkeyBinding): void {
    this.skillHotkeys.set(key.toUpperCase(), binding)
  }

  getSkillHotkey(key: string): SkillHotkeyBinding | undefined {
    return this.skillHotkeys.get(key.toUpperCase())
  }

  // ─── Coordinate & Hit-Testing Helpers ────────────────────────

  /**
   * 1.13c D2Client `0x6fb01e80` HoverUpdate priority score (`0x6fba2190`):
   * - `player`: `0` (`+1` when dead `0x6fb55440`)
   * - `monster`: `0` (`-8` when dead corpse `#10648` / mode DT/DD)
   * - `tile` (warp): `0`
   * - `item`: `-4` (`+10` when Alt is held so ground items take precedence)
   * - `object`: `-6`
   */
  private computeHoverPriority113c(unit: ClientUnit): number {
    switch (unit.unitType) {
      case 'player':
        return unit.dead ? 1 : 0
      case 'monster':
        return this.isMonsterCorpse(unit) ? -8 : 0
      case 'tile':
        return 0
      case 'item':
        return this.altHeld ? 10 : -4
      case 'object':
        return -6
      default:
        return -10
    }
  }

  /**
   * Test if unit's screen-space bounding box contains `(screenX, screenY)`.
   * Follows 1.13c `D2Client.dll` `0x6fb01e80` (`HoverUpdate`):
   * - Skips monsters with state `0x8F` (`143`).
   * - Applies type priority (`0x6fba2190`), breaking ties by smallest squared distance to the **local player**
   *   (`0x6fb010b0`), with sticky current selection when the previously hovered unit still passes hit-test
   *   at the top priority tier.
   */
  findUnitAtScreenPoint(screenX: number, screenY: number): ClientUnit | null {
    const localPlayerId = this.world.selfId
    const predSnap = this.predictor?.getSnapshot()
    const selfX =
      predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.x : this.world.self.x
    const selfY =
      predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.y : this.world.self.y
    const leftSkill = this.hudModel ? this.hudModel.leftSkillId : this.hudManager.hotkeys.leftSkillId
    const rightSkill = this.hudModel ? this.hudModel.rightSkillId : this.hudManager.hotkeys.rightSkillId
    const canTargetCorpse =
      CORPSE_TARGET_SKILL_IDS.has(this.world.self.leftSkill) ||
      CORPSE_TARGET_SKILL_IDS.has(this.world.self.rightSkill) ||
      CORPSE_TARGET_SKILL_IDS.has(leftSkill) ||
      CORPSE_TARGET_SKILL_IDS.has(rightSkill)
    const canTargetAllyOrPet =
      ALLY_OR_PET_TARGET_SKILL_IDS.has(this.world.self.leftSkill) ||
      ALLY_OR_PET_TARGET_SKILL_IDS.has(this.world.self.rightSkill) ||
      ALLY_OR_PET_TARGET_SKILL_IDS.has(leftSkill) ||
      ALLY_OR_PET_TARGET_SKILL_IDS.has(rightSkill)

    const isSelectableCandidate = (unit: ClientUnit): boolean => {
      if (unit.hidden) {
        return false
      }
      if (unit.unitType === 'player') {
        if (localPlayerId !== 0 && unit.id === localPlayerId) {
          return false
        }
        // 1.13c HoverUpdate 0x6fb01e80 skips only the local player unit (@0x6fb01fd7); a player body (dead player,
        // hover priority +1 via 0x6fb55440) is always a candidate (Issue #922).
        if (
          !this.isPlayerCorpse(unit) &&
          !this.isTownArea() &&
          !this.isPlayerHostile(unit) &&
          !canTargetAllyOrPet &&
          (this.world.party?.get(unit.id)?.hostile === false ||
            (unit as { hostile?: boolean }).hostile === false)
        ) {
          return false
        }
      } else if (unit.unitType === 'item') {
        // D2Client.dll 0x6fb32820: airborne items (ITEMMODE_DROPPING === 5) are non-targetable
        // until they land in mode 3 (ITEMMODE_ON_GROUND).
        if (unit.mode === 5) {
          return false
        }
      } else if (unit.unitType === 'object') {
        if (!isObjectSelectableInMode(unit.classId, unit.mode)) {
          return false
        }
      } else if (unit.unitType === 'monster') {
        if (unit.states?.has(0x8f)) {
          return false
        }
        if (this.isFriendlySummonOrPet(unit) && !canTargetAllyOrPet) {
          return false
        }
        if (this.isMonsterCorpse(unit) && !canTargetCorpse) {
          return false
        }
      }
      return true
    }

    const testUnit = (unit: ClientUnit): boolean => {
      const hb = typeof (unit as any).getHitBox === 'function'
        ? (unit as any).getHitBox()
        : ((unit as any).hitBox ?? { left: -24, top: -48, width: 48, height: 48 })
      const pos = this.camera.subtileToScreen(unit.x, unit.y)
      return (
        screenX >= pos.x + hb.left &&
        screenX <= pos.x + hb.left + hb.width &&
        screenY >= pos.y + hb.top &&
        screenY <= pos.y + hb.top + hb.height
      )
    }

    // 1. Sticky current selection (`0x6fb01ec0..0x6fb01eef`): if currently hovered unit still passes hit-test
    // and is not superseded by Alt-item mode, keep it when its priority is >= 0.
    if (
      this.hoveredUnit &&
      (!this.altHeld || this.hoveredUnit.unitType === 'item') &&
      this.world.getUnit(this.hoveredUnit.unitType, this.hoveredUnit.id) === this.hoveredUnit &&
      isSelectableCandidate(this.hoveredUnit) &&
      testUnit(this.hoveredUnit) &&
      this.computeHoverPriority113c(this.hoveredUnit) >= 0
    ) {
      return this.hoveredUnit
    }

    let bestUnit: ClientUnit | null = null
    let bestScore = -Infinity
    let bestPlayerDistSq = Infinity

    for (const unitType of [1, 0, 5, 4, 2] as const) {
      for (const unit of this.world.getUnitsByType(unitType)) {
        if (!isSelectableCandidate(unit)) continue
        if (!testUnit(unit)) continue
        const score = this.computeHoverPriority113c(unit)
        const playerDistSq = (unit.x - selfX) ** 2 + (unit.y - selfY) ** 2
        if (
          bestUnit === null ||
          score > bestScore ||
          (score === bestScore && playerDistSq < bestPlayerDistSq)
        ) {
          bestUnit = unit
          bestScore = score
          bestPlayerDistSq = playerDistSq
        }
      }
    }

    return bestUnit
  }

  /**
   * Convert screen coordinates `(screenX, screenY)` (in canvas pixels, supporting
   * any registered `ViewportProfile`) to world subtile coordinates and hit-test units.
   */
  resolvePointerTarget(screenX: number, screenY: number, hitRadiusSubtiles = 2.5): PointerWorldTarget {
    if (this.predictor) {
      const snap = this.predictor.getSnapshot()
      if (snap.x !== 0 || snap.y !== 0) {
        this.camera.update(snap.x, snap.y)
      }
    } else if (this.world.self.x !== 0 || this.world.self.y !== 0) {
      this.camera.update(this.world.self.x, this.world.self.y)
    }
    const subtile = this.camera.screenToSubtile(screenX, screenY)

    // 1. Hit-test visible ground item label plaques (`Alt` or hovered item label boxes)
    const labelBoxes = this.hudManager.groundItemLabelBoxes
    if (labelBoxes && labelBoxes.length > 0) {
      for (let i = labelBoxes.length - 1; i >= 0; i--) {
        const box = labelBoxes[i]!
        if (
          screenX >= box.x &&
          screenX <= box.x + box.width &&
          screenY >= box.y &&
          screenY <= box.y + box.height
        ) {
          const itemUnit = this.world.getUnit('item', box.id)
          if (itemUnit && itemUnit.mode !== 5) {
            return {
              subtileX: itemUnit.x,
              subtileY: itemUnit.y,
              hoveredUnit: itemUnit,
            }
          }
        }
      }
    }

    // 2. Hit-test world units using screen-space bounding box
    const screenUnit = this.findUnitAtScreenPoint(screenX, screenY)
    if (screenUnit) {
      return {
        subtileX: subtile.x,
        subtileY: subtile.y,
        hoveredUnit: screenUnit,
      }
    }

    // 3. Fall back to radial subtile distance
    const renderAlignedSubtile = this.camera.screenToSubtile(screenX, screenY - 16)
    const unit = this.pickUnitAtSubtile(
      subtile.x,
      subtile.y,
      hitRadiusSubtiles,
      renderAlignedSubtile.x,
      renderAlignedSubtile.y,
    )
    return {
      subtileX: subtile.x,
      subtileY: subtile.y,
      hoveredUnit: unit,
    }
  }

  /**
   * Pick the closest interactive unit within `radiusSubtiles` of `(subtileX, subtileY)`.
   * Excludes the local player unit, friendly summons/pets/traps, monsters with state `0x8F`,
   * and dead/corpse monsters unless corpse skill is active.
   */
  pickUnitAtSubtile(
    subtileX: number,
    subtileY: number,
    radiusSubtiles = 2.5,
    altSubtileX?: number,
    altSubtileY?: number,
  ): ClientUnit | null {
    const localPlayerId = this.world.selfId
    const radiusSq = radiusSubtiles * radiusSubtiles
    let bestUnit: ClientUnit | null = null
    let bestScore = -Infinity
    let bestDistSq = radiusSq
    const hasAlt = altSubtileX !== undefined && altSubtileY !== undefined
    const leftSkill = this.hudModel ? this.hudModel.leftSkillId : this.hudManager.hotkeys.leftSkillId
    const rightSkill = this.hudModel ? this.hudModel.rightSkillId : this.hudManager.hotkeys.rightSkillId
    const canTargetCorpse =
      CORPSE_TARGET_SKILL_IDS.has(this.world.self.leftSkill) ||
      CORPSE_TARGET_SKILL_IDS.has(this.world.self.rightSkill) ||
      CORPSE_TARGET_SKILL_IDS.has(leftSkill) ||
      CORPSE_TARGET_SKILL_IDS.has(rightSkill)
    const canTargetAllyOrPet =
      ALLY_OR_PET_TARGET_SKILL_IDS.has(this.world.self.leftSkill) ||
      ALLY_OR_PET_TARGET_SKILL_IDS.has(this.world.self.rightSkill) ||
      ALLY_OR_PET_TARGET_SKILL_IDS.has(leftSkill) ||
      ALLY_OR_PET_TARGET_SKILL_IDS.has(rightSkill)

    const candidateTypes = [1, 0, 5, 4, 2] as const
    for (const unitType of candidateTypes) {
      for (const unit of this.world.getUnitsByType(unitType)) {
        if (unit.hidden) {
          continue
        }
        if (unitType === 0) {
          if (localPlayerId !== 0 && unit.id === localPlayerId) {
            continue
          }
          if (
            !this.isPlayerCorpse(unit) &&
            !this.isTownArea() &&
            !this.isPlayerHostile(unit) &&
            !canTargetAllyOrPet &&
            (this.world.party?.get(unit.id)?.hostile === false ||
              (unit as { hostile?: boolean }).hostile === false)
          ) {
            continue
          }
        }
        if (unitType === 4 && unit.mode === 5) {
          continue
        }
        if (unitType === 2 && !isObjectSelectableInMode(unit.classId, unit.mode)) {
          continue
        }
        if (unitType === 1) {
          if (unit.states?.has(0x8f)) {
            continue
          }
          if (this.isFriendlySummonOrPet(unit) && !canTargetAllyOrPet) {
            continue
          }
          if (this.isMonsterCorpse(unit) && !canTargetCorpse) {
            continue
          }
        }
        const dx = unit.x - subtileX
        const dy = unit.y - subtileY
        const d2Primary = dx * dx + dy * dy
        const d2 = hasAlt
          ? Math.min(d2Primary, (unit.x - altSubtileX!) ** 2 + (unit.y - altSubtileY!) ** 2)
          : d2Primary
        const objMeta = unitType === 2 ? CANONICAL_113C_OBJECTS[unit.classId] : undefined
        const objMaxSpan = objMeta ? Math.max(objMeta.sizeX ?? 0, objMeta.sizeY ?? 0) : 0
        const isLargeInteractiveObj =
          unitType === 2 &&
          (objMaxSpan > 2 ||
            unit.classId === 342 ||
            WAYPOINT_CLASS_IDS_113C.has(unit.classId) ||
            Boolean(objMeta?.isDoor))
        const minObjRadius = Math.max(4, objMaxSpan / 2 + 1.5)
        const effRadiusSq = isLargeInteractiveObj
          ? Math.max(radiusSq, minObjRadius * minObjRadius)
          : radiusSq
        if (d2 <= effRadiusSq) {
          const score = this.computeHoverPriority113c(unit)
          if (bestUnit === null || score > bestScore || (score === bestScore && d2 < bestDistSq)) {
            bestScore = score
            bestDistSq = d2
            bestUnit = unit
          }
        }
      }
    }

    return bestUnit
  }

  /**
   * Returns true if `(screenX, screenY)` is intercepted by the HUD (any `ViewportProfile`)
   * or an external UI overlay.
   */
  isPointIntercepted(screenX: number, screenY: number): boolean {
    if (this.isExternalUiIntercepted?.(screenX, screenY)) {
      return true
    }
    return this.hudManager.isPointInterceptedByHud(screenX, screenY)
  }

  /**
   * Returns true if the local player is currently executing a non-expired cast
   * or attack animation window. Continuous channeling skills (#41 Inferno,
   * #230 Arctic Blast) are not considered blocked when sustaining the same skill.
   */
  isPlayerBusyCasting(nowMs = performance.now(), activeSkillId?: number): boolean {
    const selfUnit =
      this.world.selfId !== 0 ? this.world.getUnit('player', this.world.selfId) : undefined
    const castState = selfUnit?.castState ?? this.world.self.castState
    if (!castState) return false
    if (
      activeSkillId !== undefined &&
      castState.skillId === activeSkillId &&
      (activeSkillId === 41 || activeSkillId === 230)
    ) {
      return false
    }
    if (castState.untilMs !== undefined) {
      return nowMs < castState.untilMs
    }
    const elapsed = castState.elapsedMs ?? 0
    const duration = castState.durationMs ?? 0
    return duration > 0 && elapsed < duration
  }

  // ─── Mouse / Pointer Input Handlers ──────────────────────────

  /**
   * Explicitly set or clear the currently hovered world unit and sync HUD monster target.
   */
  setHoveredUnit(unit: ClientUnit | null): void {
    this.hoveredUnit = unit
    if (
      unit &&
      unit.unitType === 'monster' &&
      !this.isTownOrInteractiveNpc(unit) &&
      !this.isFriendlySummonOrPet(unit)
    ) {
      this.hudModel?.setHoveredMonster(unit.id)
    } else {
      this.hudModel?.setHoveredMonster(null)
    }
  }

  /**
   * Returns the server unit ID of the NPC currently targeted for deferred interaction upon arrival, or null.
   */
  getPendingNpcInteractId(): number | null {
    return this.pendingNpcInteractId
  }

  /**
   * Returns the server unit ID of the object currently targeted for deferred interaction upon arrival, or null.
   */
  getPendingObjectInteractId(): number | null {
    return this.pendingObjectInteractId
  }

  /**
   * Returns the server unit ID of the warp (`UNIT_TILE = 5`) currently targeted for deferred interaction upon arrival, or null.
   */
  getPendingWarpInteractId(): number | null {
    return this.pendingWarpInteractId
  }

  /**
   * Checks whether the player at `(selfX, selfY)` is within canonical 1.13c interaction range:
   * - For `UNIT_TILE` (warp): `D2Common #10407(warp, player) <= 4` (`0x6facaee7` / `0x6fcf02dc`,
   *   {@link isWarpInInteractRange113c}).
   * - For `UNIT_OBJECT`: `D2Common #10594` (`0x6fd81000`, `UNITS_IsObjectInInteractRange`) using
   *   `Objects.txt` `(SizeX, SizeY)` (`+0x0d0, +0x0d4`). Waypoints follow this box exactly like
   *   vanilla — the click walks the player up to the `SizeX/SizeY` footprint ±2 sub-tiles
   *   (corner-trimmed) before `C2S 0x13` fires (`OperateRange` is a legacy column unused by
   *   `#10594`); no extra Euclidean slack (the old `hypot <= 4.5` let 1x1 waypoints open from
   *   ~2x too far).
   * - For NPCs / monsters: the D2Client NPC interaction range {@link isNpcInInteractRange113c}
   *   (`#10407(npc, player)` table distance `<= 2` for MonStats `interact` NPCs and `<= 5` for other
   *   monsters on `'click'` (ProcessClick 0x6facb00f / 0x6facb01b), `<= 2` on `'arrival'` (deferred
   *   interaction 0x6fac9ef07)), on integer sub-tile coordinates (`Math.round` = `wPosX/wPosY`).
   *   Whether the NPC is walking does not matter (#890).
   */
  isWithinInteractionMeleeRange(
    selfX: number,
    selfY: number,
    targetUnit: ClientUnit,
    phase: NpcInteractPhase113c = 'click',
    world: ClientWorld = this.world,
  ): boolean {
    if (!Number.isFinite(selfX) || !Number.isFinite(selfY) || !Number.isFinite(targetUnit.x) || !Number.isFinite(targetUnit.y)) {
      return false
    }
    const sx = Math.round(selfX)
    const sy = Math.round(selfY)
    const tx = Math.round(targetUnit.x)
    const ty = Math.round(targetUnit.y)
    if (targetUnit.unitType === 'tile' || (targetUnit as { kind?: unknown }).kind === 'warp') {
      return isWarpInInteractRange113c(sx, sy, tx, ty)
    }
    if (targetUnit.unitType === 'object') {
      if (isObjectInInteractRange113c(sx, sy, 2, tx, ty, targetUnit.classId)) {
        return true
      }
      // #801 workaround kept ONLY for the Durance HellGate (342) and doors whose
      // canonical box needs the separate hitbox audit; waypoints are pure #10594.
      const objMeta = CANONICAL_113C_OBJECTS[targetUnit.classId]
      const isLargePortalOrDoor =
        targetUnit.classId === 342 || Boolean(objMeta?.isDoor)
      if (isLargePortalOrDoor) {
        return Math.hypot(targetUnit.x - selfX, targetUnit.y - selfY) <= 4.5
      }
      return false
    }
    if (targetUnit.unitType !== 'monster') {
      throw new RangeError(
        `isWithinInteractionMeleeRange: expected an object, monster, or tile target, got ${targetUnit.unitType} #${String(targetUnit.id)}`,
      )
    }
    return isNpcInInteractRange113c({
      phase,
      interact: monsterHasInteractFlag113c(targetUnit.classId),
      playerX: sx,
      playerY: sy,
      npcX: tx,
      npcY: ty,
      npcSizeX: world.getUnitSizeX(targetUnit),
    })
  }


  /**
   * 1.13c D2Client `GetSelectedUnit` (`0x6fb01a80` -> `HitTest(unit, 0, 0, 0)` `0x6fb568e0`)
   * + `ProcessClick` (`0x6facb7f0`):
   * Re-validates the unit locked on mouse-down (`this.lockedTargetUnit`) without testing cursor
   * point-in-box (`bCursor = 0`). If the locked unit no longer exists or is dead without a
   * `TargetCorpse` skill, clears `this.lockedTargetUnit = null` while keeping `this.selectionLocked = true`
   * so the remainder of the button hold falls through to location semantics (`0x08` / `0x0F` or walk)
   * and never re-picks another monster until button release.
   */
  private resolveLockedHoldTarget113c(skillId: number): ClientUnit | null {
    const locked = this.lockedTargetUnit
    if (!locked) return null
    const liveUnit = this.world.getUnit(locked.unitType, locked.id)
    if (!liveUnit) {
      this.lockedTargetUnit = null
      return null
    }
    if (liveUnit.unitType === 'monster') {
      if (liveUnit.states?.has(0x8f)) {
        this.lockedTargetUnit = null
        return null
      }
      if (TARGET_CORPSE_SKILL_IDS_113C.has(skillId)) {
        if (!this.isValidSkillTargetUnit(liveUnit, skillId)) {
          this.lockedTargetUnit = null
          return null
        }
      } else if (this.isMonsterCorpse(liveUnit) && !CORPSE_TARGET_SKILL_IDS.has(skillId)) {
        this.lockedTargetUnit = null
        return null
      }
    } else if (liveUnit.unitType === 'object') {
      if (!isObjectSelectableInMode(liveUnit.classId, liveUnit.mode)) {
        this.lockedTargetUnit = null
        return null
      }
    }
    this.lockedTargetUnit = liveUnit
    return liveUnit
  }

  /**
   * Returns the local player's current animation mode (`[player+0x10]`), or `null` if no self unit exists.
   */
  private getSelfPlayerMode(): number | null {
    const selfUnit =
      this.world.selfId !== 0 ? this.world.getUnit('player', this.world.selfId) : undefined
    return selfUnit ? selfUnit.mode : null
  }

  /**
   * Returns the live world sub-tile coordinates under `(screenX, screenY)`.
   */
  private resolveLiveCursorSubtile(screenX: number, screenY: number): { readonly x: number; readonly y: number } {
    if (this.predictor) {
      const snap = this.predictor.getSnapshot()
      if (snap.x !== 0 || snap.y !== 0) {
        this.camera.update(snap.x, snap.y)
      }
    } else if (this.world.self.x !== 0 || this.world.self.y !== 0) {
      this.camera.update(this.world.self.x, this.world.self.y)
    }
    return this.camera.screenToSubtile(screenX, screenY)
  }

  /**
   * Handle pointer move at `(screenX, screenY)` in canvas coordinates.
   */
  handlePointerMove(
    screenXOrEvent: number | { readonly clientX: number; readonly clientY: number },
    screenY = 0,
    nowMs = performance.now(),
  ): void {
    const screenX =
      typeof screenXOrEvent === 'number' ? screenXOrEvent : screenXOrEvent.clientX
    const resolvedY =
      typeof screenXOrEvent === 'number' ? screenY : screenXOrEvent.clientY
    const resolvedNowMs =
      typeof screenXOrEvent === 'number' ? nowMs : (screenY || performance.now())
    this.lastPointerX = screenX
    this.lastPointerY = resolvedY
    this.hudManager.handleMouseMove(screenX, resolvedY)

    if (this.isPointIntercepted(screenX, resolvedY)) {
      if (!this.selectionLocked) {
        this.hoveredUnit = null
        this.hudModel?.setHoveredMonster(null)
      }
      return
    }

    // 1.13c D2Client 0x6fb01e80 HoverUpdate: skipped while selection lock (0x6fbcc2f8) is active!
    if (!this.selectionLocked) {
      const target = this.resolvePointerTarget(screenX, resolvedY)
      this.hoveredUnit = target.hoveredUnit
      if (
        target.hoveredUnit &&
        target.hoveredUnit.unitType === 'monster' &&
        !this.isTownOrInteractiveNpc(target.hoveredUnit) &&
        !this.isFriendlySummonOrPet(target.hoveredUnit)
      ) {
        this.hudModel?.setHoveredMonster(target.hoveredUnit.id)
      } else {
        this.hudModel?.setHoveredMonster(null)
      }
    }

    const liveSubtile = this.resolveLiveCursorSubtile(screenX, resolvedY)

    // If holding left mouse button in world space, evaluate hold repeat against locked selection / ground lock
    if (this.leftMouseDown) {
      if (this.lockedPointerUnit?.unitType === 'item') {
        if (Math.hypot(screenX - this.pointerDownX, resolvedY - this.pointerDownY) <= 12) {
          return
        }
        this.lockedPointerUnit = null
      }
      const leftSkillId =
        this.world.self?.leftSkill ||
        (this.hudModel ? this.hudModel.leftSkillId : this.hudManager.hotkeys.leftSkillId)
      if (this.isPlayerBusyCasting(resolvedNowMs, leftSkillId)) {
        return
      }
      if (resolvedNowMs - this.lastHoldDispatchMs >= 40) {
        const holdUnit = this.selectionLocked
          ? this.resolveLockedHoldTarget113c(leftSkillId)
          : this.hoveredUnit
        const gate = clickGate113c({
          phase: 'hold',
          pressKind: this.pressKind,
          targetType: holdUnit ? holdUnit.unitType : null,
          selfMode: this.getSelfPlayerMode(),
        })
        if (!gate.pass) {
          return
        }
        this.lastHoldDispatchMs = resolvedNowMs
        this.triggerPrimaryWorldAction(
          liveSubtile.x,
          liveSubtile.y,
          holdUnit,
          resolvedNowMs,
          true,
        )
      }
    } else if (this.rightMouseDown) {
      const rightSkillId =
        this.world.self?.rightSkill ||
        (this.hudModel ? this.hudModel.rightSkillId : this.hudManager.hotkeys.rightSkillId)
      if (this.isPlayerBusyCasting(resolvedNowMs, rightSkillId)) {
        return
      }
      if (resolvedNowMs - this.lastHoldDispatchMs >= 40) {
        let holdUnit = this.selectionLocked
          ? this.resolveLockedHoldTarget113c(rightSkillId)
          : this.hoveredUnit
        if (!holdUnit && TARGET_CORPSE_SKILL_IDS_113C.has(rightSkillId)) {
          holdUnit = this.findNearestValidCorpseForSkill(liveSubtile.x, liveSubtile.y, rightSkillId)
        }
        const gate = clickGate113c({
          phase: 'hold',
          pressKind: this.pressKind,
          targetType: holdUnit ? holdUnit.unitType : null,
          selfMode: this.getSelfPlayerMode(),
        })
        if (!gate.pass) {
          return
        }
        this.lastHoldDispatchMs = resolvedNowMs
        this.triggerSecondaryWorldAction(
          liveSubtile.x,
          liveSubtile.y,
          holdUnit,
          resolvedNowMs,
          true,
        )
      }
    }
  }

  /**
   * Handle mouse/pointer button down at `(screenX, screenY)`.
   * @param button 0 = left button, 2 = right button
   */
  handlePointerDown(
    screenXOrEvent: number | { readonly clientX: number; readonly clientY: number; readonly button?: number },
    screenY = 0,
    button = 0,
    nowMs = performance.now(),
  ): DispatchedCommandRecord | null {
    const screenX =
      typeof screenXOrEvent === 'number' ? screenXOrEvent : screenXOrEvent.clientX
    const resolvedY =
      typeof screenXOrEvent === 'number' ? screenY : screenXOrEvent.clientY
    const resolvedButton =
      typeof screenXOrEvent === 'number' ? button : (screenXOrEvent.button ?? 0)
    const resolvedNowMs =
      typeof screenXOrEvent === 'number' ? nowMs : (screenY || performance.now())
    if (typeof screenXOrEvent !== 'number') {
      ;(screenXOrEvent as { _d2HandledByCommandMapper?: boolean })._d2HandledByCommandMapper = true
    }
    this.lastPointerX = screenX
    this.lastPointerY = resolvedY
    this.pointerDownX = screenX
    this.pointerDownY = resolvedY
    this.hudManager.handleMouseMove(screenX, resolvedY)

    // 1.13c D2Client 0x6faf48fb / 0x6faf474a: next button-down clears previous selection lock first
    if (resolvedButton === 0 || resolvedButton === 2) {
      this.selectionLocked = false
      this.lockedTargetUnit = null
      this.pressKind = 0
    }

    // 1. Check external UI interception first
    if (this.isExternalUiIntercepted?.(screenX, resolvedY)) {
      return null
    }

    // 2. Route HUD clicks to HudManager (status bar, orbs, skill popup, belt, open panels, or modal speech/cursor state)
    const wp = this.hudManager.worldPanels as
      | {
          readonly npcMenu?: { readonly talking?: boolean } | null
          readonly npcSpeech?: unknown
          readonly vendorTradeState?: string
        }
      | undefined
    const pendingIdentifyId = (this.hudManager as { readonly pendingIdentifyScrollId?: unknown })
      .pendingIdentifyScrollId
    const hasModalHudSpeechOrCursor = Boolean(
      wp?.npcMenu?.talking ||
        (!wp?.npcMenu && wp?.npcSpeech !== null && wp?.npcSpeech !== undefined) ||
        this.hudManager.inventory?.isIdentifyMode?.() ||
        (pendingIdentifyId !== null && pendingIdentifyId !== undefined) ||
        (wp?.vendorTradeState !== undefined && wp.vendorTradeState !== 'idle') ||
        (this.hudManager.inventory?.cursorItem !== null &&
          this.hudManager.inventory?.cursorItem !== undefined),
    )
    if (this.hudManager.isPointInterceptedByHud(screenX, resolvedY) || hasModalHudSpeechOrCursor) {
      if (resolvedButton === 0 || resolvedButton === 2) {
        this.hudManager.handleClick(screenX, resolvedY, resolvedButton)
      }
      return null
    }

    // 3. World-space action
    const preHovered = this.hoveredUnit
    const resolvedTarget = this.resolvePointerTarget(screenX, resolvedY)
    const target: PointerWorldTarget =
      resolvedTarget.hoveredUnit === null && preHovered !== null && screenX === 0 && resolvedY === 0
        ? { subtileX: preHovered.x, subtileY: preHovered.y, hoveredUnit: preHovered }
        : resolvedTarget
    this.hoveredUnit = target.hoveredUnit

    if (resolvedButton === 0) {
      this.leftMouseDown = true
      this.lastHoldDispatchMs = resolvedNowMs
      this.lockedPointerUnit =
        target.hoveredUnit?.unitType === 'item' ? target.hoveredUnit : null
      const leftSkillId =
        this.world.self?.leftSkill ||
        (this.hudModel ? this.hudModel.leftSkillId : this.hudManager.hotkeys.leftSkillId)
      const downGate = clickGate113c({
        phase: 'down',
        pressKind: this.pressKind,
        targetType: target.hoveredUnit ? target.hoveredUnit.unitType : null,
        selfMode: this.getSelfPlayerMode(),
      })
      this.pressKind = downGate.pressKind
      // 1.13c D2Client 0x6fb01e30 (unit lock) / 0x6facb8f0 (location lock):
      // Lock selection for the entire mouse press so moving monsters stay locked and ground holds never pick passing monsters.
      this.selectionLocked = true
      this.lockedTargetUnit = target.hoveredUnit
      if (this.isPlayerBusyCasting(resolvedNowMs, leftSkillId)) {
        return null
      }
      return this.triggerPrimaryWorldAction(
        target.subtileX,
        target.subtileY,
        target.hoveredUnit,
        resolvedNowMs,
        false,
      )
    }

    if (resolvedButton === 2) {
      this.rightMouseDown = true
      this.lastHoldDispatchMs = resolvedNowMs
      this.lockedPointerUnit = null
      const rightSkillId =
        this.world.self?.rightSkill ||
        (this.hudModel ? this.hudModel.rightSkillId : this.hudManager.hotkeys.rightSkillId)
      const resolvedRightUnit =
        TARGET_CORPSE_SKILL_IDS_113C.has(rightSkillId) &&
        !(target.hoveredUnit && this.isValidSkillTargetUnit(target.hoveredUnit, rightSkillId))
          ? this.findNearestValidCorpseForSkill(target.subtileX, target.subtileY, rightSkillId)
          : target.hoveredUnit
      const isRightItemOrObject =
        resolvedRightUnit !== null &&
        (resolvedRightUnit.unitType === 'object' || resolvedRightUnit.unitType === 'item')
      const effectiveRightUnit =
        resolvedRightUnit &&
        (this.isValidSkillTargetUnit(resolvedRightUnit, rightSkillId) ||
          (isRightItemOrObject && canRightSkillTargetObjectOrItem(rightSkillId)))
          ? resolvedRightUnit
          : null
      const downGate = clickGate113c({
        phase: 'down',
        pressKind: this.pressKind,
        targetType: effectiveRightUnit ? effectiveRightUnit.unitType : null,
        selfMode: this.getSelfPlayerMode(),
      })
      this.pressKind = downGate.pressKind
      this.selectionLocked = true
      this.lockedTargetUnit = effectiveRightUnit
      if (this.isPlayerBusyCasting(resolvedNowMs, rightSkillId)) {
        return null
      }
      return this.triggerSecondaryWorldAction(
        target.subtileX,
        target.subtileY,
        resolvedRightUnit,
        resolvedNowMs,
        false,
      )
    }

    return null
  }

  handleMouseDown(
    screenXOrEvent: number | { readonly clientX: number; readonly clientY: number; readonly button?: number },
    screenY = 0,
    button = 0,
    nowMs = performance.now(),
  ): DispatchedCommandRecord | null {
    return this.handlePointerDown(screenXOrEvent, screenY, button, nowMs)
  }

  /**
   * Handle mouse/pointer button release.
   */
  handlePointerUp(button: number): void {
    if (button === 0) {
      this.leftMouseDown = false
      this.lastHoldDispatchMs = 0
      this.lockedPointerUnit = null
      if (!this.rightMouseDown) {
        this.selectionLocked = false
        this.lockedTargetUnit = null
        this.pressKind = 0
      }
    } else if (button === 2) {
      this.rightMouseDown = false
      this.lastHoldDispatchMs = 0
      if (!this.leftMouseDown) {
        this.selectionLocked = false
        this.lockedTargetUnit = null
        this.pressKind = 0
      }
    }
  }

  // ─── World Action Execution ──────────────────────────────────

  /**
   * 1.13c `D2Client.dll` (`0x6faf7b20` `NPC_Cancel` / `0x6fb09ed0` `UI_CloseStash` -> `0x4F 0x12`):
   * Any world-space action (ground movement, item pickup, warp, casting, or clicking a different
   * entity) cancels an active NPC session (`C2S 0x30 NpcCancel`) or closes an open Stash (`C2S 0x4F 0x12`).
   */
  private cancelActiveNpcOrStashForWorldAction(
    hoveredUnit: ClientUnit | null,
    selfX: number,
    selfY: number,
    nowMs: number,
  ): void {
    const npcInt = this.world.npcInteraction
    const wp = this.hudManager.worldPanels as any
    const activeNpcId =
      (npcInt.unitType !== 2 ? npcInt.npcId : null) ??
      wp?.npcMenu?.npcUnitId ??
      wp?.npcMenu?.npcId ??
      (this.hudManager.leftPanel === 'vendor' ? wp?.vendorNpcId : null) ??
      (this.hudManager.leftPanel === 'hire' ||
      this.hudManager.leftPanel === 'imbue' ||
      this.hudManager.leftPanel === 'add_sockets' ||
      this.hudManager.leftPanel === 'personalize'
        ? wp?.activeNpcId
        : null) ??
      null
    const hasActiveNpcUi =
      (npcInt.unitType !== 2 && npcInt.npcId !== null) ||
      Boolean(wp?.npcMenu) ||
      this.hudManager.leftPanel === 'vendor' ||
      this.hudManager.leftPanel === 'hire' ||
      this.hudManager.leftPanel === 'imbue' ||
      this.hudManager.leftPanel === 'add_sockets' ||
      this.hudManager.leftPanel === 'personalize'

    if (hasActiveNpcUi) {
      const clickingSameNpcInRange =
        hoveredUnit !== null &&
        hoveredUnit.unitType === 'monster' &&
        activeNpcId !== null &&
        hoveredUnit.id === activeNpcId &&
        this.isWithinInteractionMeleeRange(selfX, selfY, hoveredUnit)
      if (!clickingSameNpcInRange) {
        if (this.hudModel) {
          this.hudModel.cancelNpcSession(activeNpcId ?? undefined)
          if (this.hudManager.leftPanel === 'vendor') {
            wp?.clearVendorShop?.()
            this.hudManager.hideLeftPanelFromWorld('vendor')
          }
        } else {
          if (activeNpcId !== null && activeNpcId > 0) {
            const cancelCmd: ClientCommand = {
              type: 'NpcCancel',
              target: { unitType: UNIT_TYPE_TO_ID.monster, id: activeNpcId },
            }
            this.world.noteOutgoingCommand(cancelCmd, nowMs)
            this.sendCommand(cancelCmd, nowMs)
          }
          if (wp) {
            wp.npcMenu = null
            if (wp.npcSpeech && (activeNpcId === null || wp.npcSpeech.npcId === activeNpcId)) {
              wp.npcSpeech = null
            }
          }
          if (this.hudManager.leftPanel === 'vendor') {
            wp?.clearVendorShop?.()
            this.hudManager.hideLeftPanelFromWorld('vendor')
          } else if (
            this.hudManager.leftPanel === 'hire' ||
            this.hudManager.leftPanel === 'imbue' ||
            this.hudManager.leftPanel === 'add_sockets' ||
            this.hudManager.leftPanel === 'personalize'
          ) {
            this.hudManager.leftPanel = 'none'
            if (wp) wp.activePanel = 'none'
            if (this.hudManager.rightPanel === 'inv') {
              this.hudManager.rightPanel = 'none'
              this.hudManager.inventory.visible = false
            }
            this.hudManager.syncPublishedState()
          }
        }
      }
    }

    const isStashOpen = Boolean(npcInt.stashOpen || this.hudManager.leftPanel === 'stash')
    if (isStashOpen) {
      const clickingStashInRange =
        hoveredUnit !== null &&
        hoveredUnit.unitType === 'object' &&
        hoveredUnit.classId === 267 &&
        this.isWithinInteractionMeleeRange(selfX, selfY, hoveredUnit)
      if (!clickingStashInRange) {
        if (this.hudModel) {
          this.hudModel.closeStash()
          if (this.hudManager.leftPanel === 'stash') {
            this.hudManager.hideLeftPanelFromWorld('stash')
          }
        } else {
          const closeCmd: ClientCommand = {
            type: 'ClickButton',
            buttonId: ClickButtonId.CloseStash,
            amount: 0,
          }
          this.world.noteOutgoingCommand(closeCmd, nowMs)
          this.sendCommand(closeCmd, nowMs)
          this.hudManager.hideLeftPanelFromWorld('stash')
        }
      }
    }

    const isCubeOpen = Boolean(npcInt.cubeOpen || this.hudManager.leftPanel === 'cube')
    if (isCubeOpen) {
      if (this.hudModel) {
        this.hudModel.closeCube()
        if (this.hudManager.leftPanel === 'cube') {
          this.hudManager.hideLeftPanelFromWorld('cube')
        }
      } else {
        const closeCmd: ClientCommand = {
          type: 'ClickButton',
          buttonId: ClickButtonId.CloseCube,
          amount: 0,
        }
        this.world.noteOutgoingCommand(closeCmd, nowMs)
        this.sendCommand(closeCmd, nowMs)
        this.hudManager.hideLeftPanelFromWorld('cube')
      }
    }
  }

  /**
   * Execute primary (left-click) action at world subtile `(subtileX, subtileY)`.
   */
  triggerPrimaryWorldAction(
    subtileX: number,
    subtileY: number,
    hoveredUnit: ClientUnit | null = null,
    nowMs = performance.now(),
    isHold = false,
  ): DispatchedCommandRecord | null {
    const isRunning = this.hudModel ? this.hudModel.isRunMode : this.hudManager.isRunning
    const leftSkillId =
      this.world.self?.leftSkill || (this.hudModel ? this.hudModel.leftSkillId : this.hudManager.hotkeys.leftSkillId)
    const canCastLeftSkillHere = !this.isTownArea() || isSkillAllowedInTown(leftSkillId)
    const predSnap = this.predictor?.getSnapshot()
    const selfX =
      predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.x : this.world.self.x
    const selfY =
      predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.y : this.world.self.y

    // Stand-still modifier (Shift): cast left skill on location/target instead of moving (when skill is allowed in current area)
    if (this.shiftHeld && canCastLeftSkillHere) {
      if (
        !this.isSkillWeaponUsable(leftSkillId) ||
        this.isPlayerBusyCasting(nowMs, leftSkillId) ||
        this.world.isSkillOnCooldown?.(leftSkillId, nowMs)
      ) {
        return null
      }
      this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
      this.pendingItemPickupId = null
      this.pendingNpcInteractId = null
      this.pendingObjectInteractId = null
      this.pendingWarpInteractId = null
      this.world.cancelPendingMeleeAttack()
      if (this.isValidSkillTargetUnit(hoveredUnit, leftSkillId)) {
        return this.dispatchRateLimited(
          {
            type: 'SkillOn',
            hand: 'left',
            target: unitToRef(hoveredUnit!),
            shift: true,
            hold: isHold,
          },
          nowMs,
        )
      }
      return this.dispatchRateLimited(
        {
          type: 'SkillAt',
          hand: 'left',
          at: { x: subtileX, y: subtileY },
          hold: isHold,
        },
        nowMs,
      )
    }

    // Unit interaction when clicking directly on an entity
    if (hoveredUnit) {
      if (hoveredUnit.unitType === 'item') {
        this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
        this.pendingNpcInteractId = null
        this.pendingObjectInteractId = null
        this.pendingWarpInteractId = null
        this.world.cancelPendingMeleeAttack()
        const path = this.startLocalPathPrediction(hoveredUnit.x, hoveredUnit.y, isRunning)
        const dist = Math.hypot(hoveredUnit.x - selfX, hoveredUnit.y - selfY)
        if (dist > 4) {
          this.pendingItemPickupId = hoveredUnit.id
          this.sendCommand(
            {
              type: 'MoveToUnit',
              run: isRunning,
              target: unitToRef(hoveredUnit),
            },
            nowMs,
          )
        } else {
          this.pendingItemPickupId = null
        }
        const toCursor = Boolean(
          this.hudManager.inventory?.visible ||
          this.hudManager.rightPanel === 'inv' ||
          (this.hudModel?.hudManager && (this.hudModel.hudManager.inventory?.visible || this.hudModel.hudManager.rightPanel === 'inv'))
        )
        return this.dispatchRateLimited(
          {
            type: 'ItemPickup',
            itemId: hoveredUnit.id,
            toCursor,
          },
          nowMs,
          path,
        )
      }

      if (hoveredUnit.unitType === 'tile' || (hoveredUnit as any).kind === 'warp') {
        // 1.13c D2Client 0x6facaed0..0x6facafe7 (`UNIT_TILE = 5` warp branch):
        // 1) 500ms warp click cooldown (`[0x6fbc9828]`): ignore click without side effects when `nowMs < nextWarpClickAllowedMs`.
        if (nowMs < this.nextWarpClickAllowedMs) {
          return null
        }
        this.nextWarpClickAllowedMs = nowMs + WARP_CLICK_COOLDOWN_MS_113C
        this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
        this.pendingItemPickupId = null
        this.pendingNpcInteractId = null
        this.pendingObjectInteractId = null
        this.world.cancelPendingMeleeAttack()
        const targetRef: UnitRef = {
          unitType: UNIT_TYPE_TO_ID.tile,
          id: hoveredUnit.id,
        }
        // 2) Range test `D2Common #10407(warp, player) <= 4` (`0x6facaee7..0x6facaeef`):
        //    - Outside range (`#10407 > 4`): walk/run via `MoveToUnit` (`0x02`/`0x04`) and queue deferred `0x13` (`0x6facaf0c`).
        //    - Within range (`#10407 <= 4`): stop movement and send `C2S 0x13 Interact` (`0x6facafbd..0x6facafd0`).
        const inRange = this.isWithinInteractionMeleeRange(selfX, selfY, hoveredUnit)
        if (!inRange) {
          const path = this.startLocalPathPrediction(hoveredUnit.x, hoveredUnit.y, isRunning)
          this.pendingWarpInteractId = hoveredUnit.id
          return this.dispatchRateLimited(
            {
              type: 'MoveToUnit',
              run: isRunning,
              target: targetRef,
            },
            nowMs,
            path,
          )
        }
        this.pendingWarpInteractId = null
        this.rateLimiter.clearPendingMove()
        this.predictor?.stop()
        return this.dispatchRateLimited(
          {
            type: 'Interact',
            target: targetRef,
          },
          nowMs,
        )
      }

      this.pendingItemPickupId = null
      this.pendingNpcInteractId = null
      this.pendingWarpInteractId = null

      if (hoveredUnit.unitType === 'object') {
        this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
        this.world.cancelPendingMeleeAttack()
        const inMeleeRange = this.isWithinInteractionMeleeRange(selfX, selfY, hoveredUnit)
        if (!inMeleeRange) {
          const path = this.startLocalPathPrediction(hoveredUnit.x, hoveredUnit.y, isRunning)
          this.pendingObjectInteractId = hoveredUnit.id
          return this.dispatchRateLimited(
            {
              type: 'MoveToUnit',
              run: isRunning,
              target: unitToRef(hoveredUnit),
            },
            nowMs,
            path,
          )
        }
        this.pendingObjectInteractId = null
        this.predictor?.stop()
        return this.dispatchRateLimited(
          {
            type: 'Interact',
            target: unitToRef(hoveredUnit),
          },
          nowMs,
        )
      }

      this.pendingObjectInteractId = null

      if (hoveredUnit.unitType === 'player') {
        if (canCastLeftSkillHere && this.isValidSkillTargetUnit(hoveredUnit, leftSkillId)) {
          if (
            !this.isSkillWeaponUsable(leftSkillId) ||
            this.isPlayerBusyCasting(nowMs, leftSkillId) ||
            this.world.isSkillOnCooldown?.(leftSkillId, nowMs)
          ) {
            return null
          }
          this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
          return this.dispatchRateLimited(
            {
              type: 'SkillOn',
              hand: 'left',
              target: unitToRef(hoveredUnit),
              shift: this.shiftHeld,
              hold: isHold,
            },
            nowMs,
          )
        }
        const partyMember = this.world.party?.get(hoveredUnit.id)
        const explicitlyFriendly =
          partyMember?.hostile === false ||
          (hoveredUnit as { hostile?: boolean | undefined }).hostile === false
        // A player body is not attackable: router 0x6facb7f0 -> interact handler 0x6facab20, player case 0x6facadba
        // sends C2S 0x13 (type 0, body GUID) whatever the left skill (D2Game sub_6FC828D0 picks a PLRMODE_DEAD target
        // up within 8, and walks the player there first up to 50) (Issue #922).
        if (
          this.isPlayerCorpse(hoveredUnit) ||
          this.isTownArea() ||
          (!explicitlyFriendly && leftSkillId === 0)
        ) {
          this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
          this.world.cancelPendingMeleeAttack()
          const path = this.startLocalPathPrediction(hoveredUnit.x, hoveredUnit.y, isRunning)
          const ref = unitToRef(hoveredUnit)
          const dist = Math.hypot(hoveredUnit.x - selfX, hoveredUnit.y - selfY)
          if (dist > 4) {
            this.sendCommand(
              {
                type: 'MoveToUnit',
                run: isRunning,
                target: ref,
              },
              nowMs,
            )
          }
          return this.dispatchRateLimited(
            {
              type: 'Interact',
              target: ref,
            },
            nowMs,
            path,
          )
        }
      }

      if (hoveredUnit.unitType === 'monster') {
        if (this.isTownOrInteractiveNpc(hoveredUnit)) {
          const activeNpcId =
            this.world.npcInteraction.unitType !== 2 ? this.world.npcInteraction.npcId : null
          const wp = this.hudManager.worldPanels as
            | { readonly npcMenu?: { readonly npcId?: number | null } | null }
            | undefined
          const isSameNpcActive =
            activeNpcId === hoveredUnit.id || wp?.npcMenu?.npcId === hoveredUnit.id
          if (isHold && isSameNpcActive) {
            return null
          }
          this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
          this.world.cancelPendingMeleeAttack()
          const ref = unitToRef(hoveredUnit)
          const inMeleeRange = this.isWithinInteractionMeleeRange(selfX, selfY, hoveredUnit)
          const dist = Math.hypot(hoveredUnit.x - selfX, hoveredUnit.y - selfY)
          if (!inMeleeRange) {
            const path = this.startLocalPathPrediction(hoveredUnit.x, hoveredUnit.y, isRunning)
            const moveRecord = this.dispatchRateLimited(
              {
                type: 'MoveToUnit',
                run: isRunning,
                target: ref,
              },
              nowMs,
              path,
            )
            if (dist <= 25) {
              this.sendCommand(
                {
                  type: 'MakeEntityMove',
                  target: ref,
                  to: { x: Math.round(selfX), y: Math.round(selfY) },
                },
                nowMs,
              )
            }
            this.pendingNpcInteractId = hoveredUnit.id
            return moveRecord
          }
          this.pendingNpcInteractId = null
          this.rateLimiter.clearPendingMove()
          this.predictor?.stop()
          if (dist <= 25) {
            this.sendCommand(
              {
                type: 'MakeEntityMove',
                target: ref,
                to: { x: Math.round(selfX), y: Math.round(selfY) },
              },
              nowMs,
            )
          }
          this.sendCommand(
            {
              type: 'Interact',
              target: ref,
            },
            nowMs,
          )
          return this.dispatchRateLimited(
            {
              type: 'NpcInit',
              target: ref,
            },
            nowMs,
          )
        }

        if (canCastLeftSkillHere && this.isValidSkillTargetUnit(hoveredUnit, leftSkillId)) {
          // Hostile monster or valid corpse/pet skill target: attack/cast left skill on unit
          this.pendingNpcInteractId = null
          if (
            !this.isSkillWeaponUsable(leftSkillId) ||
            this.isPlayerBusyCasting(nowMs, leftSkillId) ||
            this.world.isSkillOnCooldown?.(leftSkillId, nowMs)
          ) {
            return null
          }
          this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
          return this.dispatchRateLimited(
            {
              type: 'SkillOn',
              hand: 'left',
              target: unitToRef(hoveredUnit),
              shift: this.shiftHeld,
              hold: isHold,
            },
            nowMs,
          )
        }
      }
    }

    // Ground walk / run
    if (this.isPlayerBusyCasting(nowMs)) {
      return null
    }
    this.cancelActiveNpcOrStashForWorldAction(null, selfX, selfY, nowMs)
    this.pendingItemPickupId = null
    this.pendingNpcInteractId = null
    this.pendingObjectInteractId = null
    this.pendingWarpInteractId = null
    this.world.cancelPendingMeleeAttack()
    const path = this.startLocalPathPrediction(subtileX, subtileY, isRunning)
    return this.dispatchRateLimited(
      {
        type: 'Move',
        run: isRunning,
        to: { x: subtileX, y: subtileY },
      },
      nowMs,
      path,
    )
  }

  /**
   * Execute secondary (right-click) skill action at world subtile `(subtileX, subtileY)`.
   */
  triggerSecondaryWorldAction(
    subtileX: number,
    subtileY: number,
    hoveredUnit: ClientUnit | null = null,
    nowMs = performance.now(),
    isHold = false,
    /** Explicit skill id overriding the current right-hand slot read (Quick Cast, Issue #952). */
    overrideSkillId?: number | undefined,
  ): DispatchedCommandRecord | null {
    const rightSkillId =
      overrideSkillId ??
      (this.world.self?.rightSkill ||
        (this.hudModel ? this.hudModel.rightSkillId : this.hudManager.hotkeys.rightSkillId))
    if (this.isTownArea() && !isSkillAllowedInTown(rightSkillId)) {
      return null
    }
    if (!this.isSkillWeaponUsable(rightSkillId)) {
      return null
    }
    // 1.13c corpse skills (Skills.txt TargetCorpse=1: Raise Skeleton 70, Corpse Explosion 74,
    // Raise Skeletal Mage 80, Poison Explosion 83, Revive 95, Find Potion 131, Find Item 142,
    // Grim Ward 150) never cast on empty ground — if the cursor is near a valid corpse (or
    // another unit like a ground item / live monster overlaps the corpse), resolve the nearest
    // valid corpse within range (Issue #1010).
    if (
      TARGET_CORPSE_SKILL_IDS_113C.has(rightSkillId) &&
      !(hoveredUnit !== null && this.isValidSkillTargetUnit(hoveredUnit, rightSkillId, this.world))
    ) {
      hoveredUnit = this.findNearestValidCorpseForSkill(subtileX, subtileY, rightSkillId, this.world)
      if (!hoveredUnit) {
        return null
      }
    }
    // 1.13c Iron Golem (#90, TargetItem=1, cltstfunc=19) requires a valid metallic ground item target.
    if (
      rightSkillId === 90 &&
      !(
        hoveredUnit !== null &&
        hoveredUnit.unitType === 'item' &&
        this.isValidSkillTargetUnit(hoveredUnit, rightSkillId, this.world)
      )
    ) {
      return null
    }
    if (this.isPlayerBusyCasting(nowMs, rightSkillId) || this.world.isSkillOnCooldown?.(rightSkillId, nowMs)) {
      return null
    }
    const predSnap = this.predictor?.getSnapshot()
    const selfX =
      predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.x : this.world.self.x
    const selfY =
      predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.y : this.world.self.y
    this.cancelActiveNpcOrStashForWorldAction(hoveredUnit, selfX, selfY, nowMs)
    this.pendingItemPickupId = null
    this.pendingNpcInteractId = null
    this.pendingObjectInteractId = null
    this.pendingWarpInteractId = null
    const isRightItemOrObject =
      hoveredUnit !== null &&
      (hoveredUnit.unitType === 'object' || hoveredUnit.unitType === 'item')
    if (
      hoveredUnit &&
      (this.isValidSkillTargetUnit(hoveredUnit, rightSkillId) ||
        (isRightItemOrObject && canRightSkillTargetObjectOrItem(rightSkillId)))
    ) {
      return this.dispatchRateLimited(
        {
          type: 'SkillOn',
          hand: 'right',
          target: unitToRef(hoveredUnit),
          shift: this.shiftHeld,
          hold: isHold,
        },
        nowMs,
      )
    }

    const targetAt =
      isRightItemOrObject && hoveredUnit
        ? { x: Math.round(hoveredUnit.x), y: Math.round(hoveredUnit.y) }
        : { x: subtileX, y: subtileY }
    this.world.cancelPendingMeleeAttack()
    return this.dispatchRateLimited(
      {
        type: 'SkillAt',
        hand: 'right',
        at: targetAt,
        hold: isHold,
      },
      nowMs,
    )
  }

  /**
   * NOT 1.13c: Quick Cast (Issue #952, PD2/D2R parity) — cast `skillId` immediately at the
   * live cursor without permanently changing the right-hand skill selection.
   *
   * The 1.13c wire protocol carries no skill id on the cast packets (0x05..0x11): the server
   * casts whatever skill is currently selected on the hand. Quick Cast therefore issues the
   * PD2 atomic sequence — `SelectSkill (0x3C)` → `SkillAt`/`SkillOn` at the cursor →
   * `SelectSkill` restore — queued back-to-back on the same ordered channel so the server
   * executes select → cast → restore; the `0x23` acks converge the HUD back to the original
   * selection. The 1.13c shared-slot identical-packet dedupe (0x6fac4415) never fires because
   * the interleaved three-command sequence contains no adjacent byte-identical repeats.
   *
   * Mirrors the right-click gates of `triggerSecondaryWorldAction` (town skill restriction,
   * cast-lock, cooldown). Returns `true` when a cast command was dispatched.
   */
  quickCastSkillAtCursor(
    skillId: number,
    options?: { readonly itemId?: number | undefined },
    nowMs = performance.now(),
  ): boolean {
    if (!Number.isInteger(skillId) || skillId <= 0) return false
    const itemId = options?.itemId ?? 0xffffffff
    if (this.hudManager.goldDialog) return false
    // Pre-gate before the swap so a blocked cast never emits the SelectSkill round-trip.
    if (this.isTownArea() && !isSkillAllowedInTown(skillId)) return false
    if (!this.isSkillWeaponUsable(skillId)) return false
    if (this.isPlayerBusyCasting(nowMs, skillId) || this.world.isSkillOnCooldown?.(skillId, nowMs)) {
      return false
    }
    const originalRaw =
      this.world.self?.rightSkill ||
      (this.hudModel ? this.hudModel.rightSkillId : this.hudManager.hotkeys.rightSkillId)
    const originalSkillId = originalRaw > 0 ? originalRaw : null
    if (originalSkillId === skillId) {
      // Already selected: vanilla right-click path, no swap and no restore.
      const target = this.resolvePointerTarget(this.lastPointerX, this.lastPointerY)
      return this.triggerSecondaryWorldAction(
        target.subtileX,
        target.subtileY,
        target.hoveredUnit,
        nowMs,
        false,
      ) !== null
    }
    this.dispatchSkillSelectForQuickCast('right', skillId, itemId, nowMs)
    const target = this.resolvePointerTarget(this.lastPointerX, this.lastPointerY)
    const dispatched = this.triggerSecondaryWorldAction(
      target.subtileX,
      target.subtileY,
      target.hoveredUnit,
      nowMs,
      false,
      skillId,
    )
    if (originalSkillId !== null) {
      // Item-granted originals (charged items) restore as class skills (0xffffffff); the 0x23
      // ack re-asserts the authoritative assignment. v1 limitation.
      this.dispatchSkillSelectForQuickCast('right', originalSkillId, 0xffffffff, nowMs)
    }
    return dispatched !== null
  }

  private dispatchSkillSelectForQuickCast(
    hand: Hand,
    skillId: number,
    itemId: number,
    nowMs: number,
  ): void {
    const cmd: ClientCommand = { type: 'SelectSkill', hand, skill: skillId, itemId }
    // Optimistic mirror (ClientWorld `SelectSkill` case) so the cast prediction resolves the
    // just-selected skill before the 0x23 ack arrives.
    this.world.noteOutgoingCommand(cmd, nowMs)
    this.sendCommand(cmd, nowMs)
  }

  // ─── Keyboard Input Handlers ─────────────────────────────────

  /**
   * Handle keydown events for D2 hotkeys.
   * Returns true if the key was handled by the command mapper.
   */
  handleKeyDown(
    event: {
      key: string
      code?: string | undefined
      shiftKey?: boolean | undefined
      altKey?: boolean | undefined
      ctrlKey?: boolean | undefined
      metaKey?: boolean | undefined
      preventDefault?: (() => void) | undefined
    },
    nowMs = performance.now(),
  ): boolean {
    const handled = this.handleKeyDownInternal(event, nowMs)
    if (handled && event && typeof event === 'object') {
      ;(event as { _d2HandledByCommandMapper?: boolean })._d2HandledByCommandMapper = true
    }
    return handled
  }

  private handleKeyDownInternal(
    event: {
      key: string
      code?: string | undefined
      shiftKey?: boolean | undefined
      altKey?: boolean | undefined
      ctrlKey?: boolean | undefined
      metaKey?: boolean | undefined
      preventDefault?: (() => void) | undefined
    },
    nowMs = performance.now(),
  ): boolean {
    if (event.key === 'Shift' || event.shiftKey) {
      this.shiftHeld = true
    }
    if (event.key === 'Alt' || event.altKey) {
      this.altHeld = true
      this.hudManager.showGroundLabels = true
      this.hudManager.syncPublishedState()
      event.preventDefault?.()
      if (event.key === 'Alt') return true
    }

    // Ignore hotkeys if modifier keys (Ctrl/Meta) are pressed
    if (event.ctrlKey || event.metaKey) {
      return false
    }

    // Defer digit/Enter/Escape keys to HudManager when the gold drop/transfer dialog is open
    if (this.hudManager.goldDialog) {
      return false
    }

    const keyUpper = event.key.toUpperCase()

    // Escape: when dead -> Resurrect (0x41); otherwise close open HUD panels first, then escape menu
    if (event.key === 'Escape') {
      if (this.world.isSelfDead || this.world.isDead) {
        const cmd: ClientCommand = { type: 'Resurrect' }
        this.sendCommand(cmd)
        this.world.noteOutgoingCommand(cmd)
        event.preventDefault?.()
        return true
      }
      const worldPanelOpen =
        (this.hudManager.worldPanels as any)?.activePanel &&
        (this.hudManager.worldPanels as any).activePanel !== 'none'
      const isNpcMenuOrSpeechOpen = Boolean(
        this.hudManager.worldPanels.npcMenu ||
        this.hudManager.worldPanels.npcSpeech ||
        ((this.world as any)?.npcInteraction?.npcId !== null && (this.world as any)?.npcInteraction?.npcId !== undefined)
      )
      if (
        this.hudManager.leftPanel !== 'none' ||
        this.hudManager.rightPanel !== 'none' ||
        worldPanelOpen ||
        isNpcMenuOrSpeechOpen
      ) {
        const npcId =
          (this.hudManager.worldPanels as any)?.npcMenu?.npcUnitId ??
          (this.hudManager.worldPanels as any)?.npcMenu?.npcId ??
          (this.hudManager.worldPanels as any)?.npcSpeech?.npcUnitId ??
          (this.hudManager.worldPanels as any)?.npcSpeech?.npcId ??
          (this.hudManager.worldPanels as any)?.activeNpcId ??
          (this.world as any)?.npcInteraction?.npcId ??
          null

        if (this.hudModel) {
          this.hudModel.closeActiveNpcPanel()
        } else {
          this.hudManager.closeAllPanels()
          if (npcId !== null && npcId > 0) {
            const cancelCmd: ClientCommand = {
              type: 'NpcCancel',
              target: { unitType: 1, id: npcId },
              npcId,
            }
            this.sendCommand(cancelCmd)
            this.world.noteOutgoingCommand(cancelCmd)
          }
        }
        event.preventDefault?.()
        return true
      }

      if (this.onEscapeMenu) {
        this.onEscapeMenu()
        event.preventDefault?.()
        return true
      }
      if (this.hudModel) {
        this.hudModel.togglePanel('escapeMenu')
        event.preventDefault?.()
        return true
      }
      this.hudManager.toggleEscapeMenu()
      event.preventDefault?.()
      return true
    }

    // While Escape menu is open, route Up/Down/Enter to the Escape menu and block gameplay hotkeys
    if (this.hudManager.escapeMenuOpen || this.hudModel?.getSnapshot().panels.escapeMenu) {
      if (event.key === 'ArrowUp') {
        event.preventDefault?.()
        this.hudManager.moveEscapeMenuSelection(-1)
        return true
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault?.()
        this.hudManager.moveEscapeMenuSelection(1)
        return true
      }
      if (event.key === 'Enter') {
        event.preventDefault?.()
        this.hudManager.activateEscapeMenuIndex()
        return true
      }
      return true
    }

    // Enter: toggle chat input
    if (event.key === 'Enter') {
      if (this.onToggleChatInput) {
        this.onToggleChatInput()
        event.preventDefault?.()
        return true
      }
      return false
    }

    // Tab: toggle automap overlay
    if (event.key === 'Tab') {
      event.preventDefault?.()
      if (this.hudModel) {
        this.hudModel.toggleAutomap()
      } else if (this.automapView) {
        this.automapView.requestVisibilityToggle()
      }
      return true
    }

    // Belt slots 1..4 -> BeltUse (0x26) (match both key '1'..'4' and code 'Digit1'..'Digit4' for Shift+1..4)
    if (
      event.key === '1' ||
      event.key === '2' ||
      event.key === '3' ||
      event.key === '4' ||
      event.code === 'Digit1' ||
      event.code === 'Digit2' ||
      event.code === 'Digit3' ||
      event.code === 'Digit4'
    ) {
      const slotIndex =
        event.code === 'Digit1'
          ? 0
          : event.code === 'Digit2'
            ? 1
            : event.code === 'Digit3'
              ? 2
              : event.code === 'Digit4'
                ? 3
                : Number(event.key) - 1
      event.preventDefault?.()
      // BeltUse needs the real server item id of the potion, which only HudModel (ClientWorld) knows.
      if (!this.hudModel) return false
      // Route through HudManager.drinkBeltSlot when it is bound to this HudModel: it sends the
      // same `0x26 BeltUse` via `commandSink.onUseBeltSlot` and also plays the potion's
      // Misc.txt `usesound` (D2Client.dll 0x6fb31d70), which a bare `useBeltSlot` skips.
      if (this.hudManager.commandSink === this.hudModel) {
        this.hudManager.drinkBeltSlot(slotIndex, Boolean(event.shiftKey))
      } else {
        this.hudModel.useBeltSlot(slotIndex, Boolean(event.shiftKey))
      }
      return true
    }

    // ─── Skill hotkeys ────────────────────────────────────────────────────────
    // `SKILL_HOTKEY_KEY_RE_113C` is the single source of truth for which keys may be
    // *bound* from the skill popup (vanilla 1.13c = F1..F8) — widen it there (and only
    // there) to support more bindable keys. Execution follows the binding maps instead
    // of the regex, so any key that ever gets bound is executed — and Quick Cast
    // (Issue #952) reinterprets it as cast-at-cursor — without touching this branch.
    const skillHotkeyBinding = this.skillHotkeys.get(keyUpper)
    const hudSkillHotkeyBinding = this.hudManager.hotkeys.bindings.get(keyUpper)
    if (
      SKILL_HOTKEY_KEY_RE_113C.test(keyUpper) ||
      skillHotkeyBinding !== undefined ||
      hudSkillHotkeyBinding !== undefined
    ) {
      event.preventDefault?.()
      // Native bind: skill popup open + hovered skill + bindable key (vanilla gate).
      if (
        SKILL_HOTKEY_KEY_RE_113C.test(keyUpper) &&
        this.hudManager.hotkeys.openPopup !== null &&
        this.hudManager.hotkeys.hoveredPopupSkill !== null
      ) {
        this.hudManager.hotkeys.bindHotkey(keyUpper, this.hudManager.hotkeys.hoveredPopupSkill.side, this.hudManager.hotkeys.hoveredPopupSkill.skillId)
        return true
      }
      const hand =
        skillHotkeyBinding?.hand ?? hudSkillHotkeyBinding?.side ?? 'right'
      const skillId = skillHotkeyBinding?.skillId ?? hudSkillHotkeyBinding?.skillId
      const itemId = skillHotkeyBinding?.itemId ?? 0xffffffff
      if (skillId !== undefined) {
        if (this.quickCastMode) {
          // The 1.13c cast packets carry no skill id, so the cast executes the PD2 sequence
          // SelectSkill -> SkillAt/SkillOn -> SelectSkill restore regardless of which hand
          // the binding was made on.
          this.quickCastSkillAtCursor(skillId, { itemId }, nowMs)
        } else if (this.hudModel) {
          this.hudModel.selectSkill(hand, skillId, itemId)
        } else {
          this.dispatchRateLimited(
            {
              type: 'SelectSkill',
              hand,
              skill: skillId,
              itemId,
            },
            nowMs,
          )
        }
      }
      return true
    }

    // Panel & action hotkeys
    switch (keyUpper) {
      case 'R': {
        if (this.hudModel) {
          this.hudModel.toggleRunWalk()
        } else {
          this.hudManager.isRunning = !this.hudManager.isRunning
          this.hudManager.syncPublishedState()
        }
        return true
      }
      case 'W': {
        if (this.hudModel) {
          this.hudModel.swapWeapons()
        } else {
          this.dispatchRateLimited({ type: 'SwapWeapons' }, nowMs)
        }
        return true
      }
      case 'A':
      case 'C': {
        this.hudManager.toggleLeftPanel('char')
        return true
      }
      case 'I':
      case 'B': {
        this.hudManager.toggleRightPanel('inv')
        return true
      }
      case 'S': {
        this.hudManager.hotkeys.openPopup = this.hudManager.hotkeys.openPopup ? null : 'right'
        this.hudManager.syncPublishedState()
        return true
      }
      case 'T': {
        this.hudManager.toggleRightPanel('skill')
        return true
      }
      case 'V': {
        this.hudManager.belt.togglePopup()
        this.hudManager.syncPublishedState()
        return true
      }
      case 'Q': {
        this.hudManager.toggleLeftPanel('quest')
        return true
      }
      case 'P': {
        if (this.hudModel) {
          this.hudModel.togglePanel('party')
        } else {
          this.hudManager.toggleLeftPanel('party' as any)
        }
        return true
      }
      case 'M': {
        if (this.hudModel) {
          this.hudModel.togglePanel('msg')
        } else {
          this.hudManager.toggleLeftPanel('msg' as any)
        }
        return true
      }
      case 'O': {
        if (this.world.merc && !this.world.merc.isDead) {
          if (this.hudModel) {
            const prevLeft = this.hudManager.leftPanel as string
            const res = this.hudModel.togglePanel('merc')
            if (!res && prevLeft !== 'merc' && (this.hudManager.leftPanel as string) !== 'merc') {
              this.hudManager.toggleLeftPanel('merc' as any)
            }
          } else {
            this.hudManager.toggleLeftPanel('merc' as any)
          }
        }
        return true
      }
      default:
        return false
    }
  }

  /**
   * Handle keyup events (releases Shift stand-still and Alt item-labels).
   */
  handleKeyUp(event: {
    key: string
    shiftKey?: boolean | undefined
    altKey?: boolean | undefined
  }): void {
    if (event.key === 'Shift' || event.shiftKey === false) {
      this.shiftHeld = false
    }
    if (event.key === 'Alt' || event.altKey === false) {
      this.altHeld = false
      this.hudManager.showGroundLabels = false
      this.hudManager.syncPublishedState()
    }
  }

  /**
   * Reset transient modifier and mouse down states (e.g. on window blur).
   */
  resetModifiers(): void {
    this.shiftHeld = false
    this.altHeld = false
    this.leftMouseDown = false
    this.rightMouseDown = false
    this.lockedPointerUnit = null
    this.selectionLocked = false
    this.lockedTargetUnit = null
    this.pressKind = 0
    if (this.hudManager.showGroundLabels) {
      this.hudManager.showGroundLabels = false
      this.hudManager.syncPublishedState()
    }
  }

  // ─── Frame Tick & Rate-Limiter Coalescing ────────────────────

  /**
   * Advance periodic input state:
   * - Flushes any coalesced movement command when its 120ms cooldown expires.
   * - Completes deferred arrival pickup when player walks within <= 4 subtiles of a distant clicked item.
   * - Repeats held mouse actions at rate-limited intervals.
   */
  tick(nowMs = performance.now()): ClientCommand | null {
    const flushed = this.rateLimiter.flushPendingMove(nowMs)
    if (flushed) {
      const predSnap = this.predictor?.getSnapshot()
      const selfX =
        predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.x : undefined
      const selfY =
        predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.y : undefined
      this.world.noteOutgoingCommand?.(flushed, nowMs, selfX, selfY)
      this.sendCommand(flushed, nowMs)
      return flushed
    }

    // Check deferred melee chase arrival within 1.13c melee range (UNITS_IsInMeleeRange)
    this.checkPendingMeleeChaseArrival(nowMs)

    // Check deferred ground item pickup upon arrival within reach (<= 4 subtiles)
    if (this.pendingItemPickupId !== null) {
      const pendingItem = this.world.getUnit('item', this.pendingItemPickupId)
      if (!pendingItem) {
        this.pendingItemPickupId = null
      } else {
        const predSnap = this.predictor?.getSnapshot()
        const selfX =
          predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.x : this.world.self.x
        const selfY =
          predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.y : this.world.self.y
        const dist = Math.hypot(pendingItem.x - selfX, pendingItem.y - selfY)
        if (dist <= 4) {
          const record = this.dispatchRateLimited(
            {
              type: 'ItemPickup',
              itemId: pendingItem.id,
              toCursor: this.hudManager?.rightPanel === 'inv',
            },
            nowMs,
          )
          if (record.rateLimit.allowed) {
            this.pendingItemPickupId = null
            return record.command
          }
        }
      }
    }

    // Check deferred NPC interaction upon arrival: 1.13c deferred interaction 0x6fac9ef0 (#10407 <= 2)
    if (this.pendingNpcInteractId !== null) {
      const pendingNpc = this.world.getUnit('monster', this.pendingNpcInteractId)
      if (!pendingNpc || pendingNpc.lifePct <= 0 || pendingNpc.mode === 0 || pendingNpc.mode === 12) {
        this.pendingNpcInteractId = null
      } else {
        const predSnap = this.predictor?.getSnapshot()
        const hasPredPos = Boolean(predSnap && (predSnap.x !== 0 || predSnap.y !== 0))
        const selfX = hasPredPos ? predSnap!.x : this.world.self.x
        const selfY = hasPredPos ? predSnap!.y : this.world.self.y
        const arrivedViaPredictor = this.isWithinInteractionMeleeRange(selfX, selfY, pendingNpc, 'arrival')
        const arrivedViaServer =
          !arrivedViaPredictor &&
          !predSnap?.moving &&
          (this.world.self.x !== 0 || this.world.self.y !== 0) &&
          this.isWithinInteractionMeleeRange(this.world.self.x, this.world.self.y, pendingNpc, 'arrival')
        if (arrivedViaPredictor || arrivedViaServer) {
          const ref = unitToRef(pendingNpc)
          this.rateLimiter.clearPendingMove()
          this.predictor?.stop()
          this.sendCommand({ type: 'Interact', target: ref }, nowMs)
          const initRecord = this.dispatchRateLimited({ type: 'NpcInit', target: ref }, nowMs)
          if (initRecord.rateLimit.allowed) {
            this.pendingNpcInteractId = null
            return initRecord.command
          }
        }
      }
    }

    // Check deferred object interaction (e.g. waypoint, shrine, chest, portal) upon arrival within melee contact range
    if (this.pendingObjectInteractId !== null) {
      const pendingObj = this.world.getUnit('object', this.pendingObjectInteractId)
      if (!pendingObj) {
        this.pendingObjectInteractId = null
      } else {
        const predSnap = this.predictor?.getSnapshot()
        const hasPredPos = Boolean(predSnap && (predSnap.x !== 0 || predSnap.y !== 0))
        const selfX = hasPredPos ? predSnap!.x : this.world.self.x
        const selfY = hasPredPos ? predSnap!.y : this.world.self.y
        const arrivedViaPredictor = this.isWithinInteractionMeleeRange(selfX, selfY, pendingObj)
        const arrivedViaServer =
          !arrivedViaPredictor &&
          !predSnap?.moving &&
          (this.world.self.x !== 0 || this.world.self.y !== 0) &&
          this.isWithinInteractionMeleeRange(this.world.self.x, this.world.self.y, pendingObj)
        if (arrivedViaPredictor || arrivedViaServer) {
          this.pendingObjectInteractId = null
          const record = this.dispatchRateLimited(
            {
              type: 'Interact',
              target: unitToRef(pendingObj),
            },
            nowMs,
          )
          if (record.rateLimit.allowed) {
            this.predictor?.stop()
            return record.command
          }
          this.pendingObjectInteractId = pendingObj.id
        }
      }
    }

    // Check deferred warp (tile) interaction upon arrival: 1.13c D2Client 0x6fadb090 / 0x6facc41b (#10407 <= 4)
    if (this.pendingWarpInteractId !== null) {
      const pendingWarp = this.world.getUnit('tile', this.pendingWarpInteractId)
      if (!pendingWarp) {
        this.pendingWarpInteractId = null
      } else {
        const predSnap = this.predictor?.getSnapshot()
        const hasPredPos = Boolean(predSnap && (predSnap.x !== 0 || predSnap.y !== 0))
        const selfX = hasPredPos ? predSnap!.x : this.world.self.x
        const selfY = hasPredPos ? predSnap!.y : this.world.self.y
        const arrivedViaPredictor = this.isWithinInteractionMeleeRange(selfX, selfY, pendingWarp)
        const arrivedViaServer =
          !arrivedViaPredictor &&
          !predSnap?.moving &&
          (this.world.self.x !== 0 || this.world.self.y !== 0) &&
          this.isWithinInteractionMeleeRange(this.world.self.x, this.world.self.y, pendingWarp)
        if (arrivedViaPredictor || arrivedViaServer) {
          this.pendingWarpInteractId = null
          const record = this.dispatchRateLimited(
            {
              type: 'Interact',
              target: {
                unitType: UNIT_TYPE_TO_ID.tile,
                id: pendingWarp.id,
              },
            },
            nowMs,
          )
          if (record.rateLimit.allowed) {
            this.nextWarpClickAllowedMs = nowMs + WARP_CLICK_COOLDOWN_MS_113C
            this.rateLimiter.clearPendingMove()
            this.predictor?.stop()
            return record.command
          }
          this.pendingWarpInteractId = pendingWarp.id
        }
      }
    }

    if (this.leftMouseDown && !this.isPointIntercepted(this.lastPointerX, this.lastPointerY)) {
      if (this.lockedPointerUnit?.unitType === 'item' || this.lockedPointerUnit?.unitType === 'object') {
        return null
      }
      const leftSkillId =
        this.world.self?.leftSkill ||
        (this.hudModel ? this.hudModel.leftSkillId : this.hudManager.hotkeys.leftSkillId)
      if (this.isPlayerBusyCasting(nowMs, leftSkillId)) {
        return null
      }
      if (nowMs - this.lastHoldDispatchMs < 40) {
        return null
      }
      const liveSubtile = this.resolveLiveCursorSubtile(this.lastPointerX, this.lastPointerY)
      const holdUnit = this.selectionLocked
        ? this.resolveLockedHoldTarget113c(leftSkillId)
        : this.resolvePointerTarget(this.lastPointerX, this.lastPointerY).hoveredUnit
      const gate = clickGate113c({
        phase: 'hold',
        pressKind: this.pressKind,
        targetType: holdUnit ? holdUnit.unitType : null,
        selfMode: this.getSelfPlayerMode(),
      })
      if (!gate.pass) {
        return null
      }
      this.lastHoldDispatchMs = nowMs
      const record = this.triggerPrimaryWorldAction(
        liveSubtile.x,
        liveSubtile.y,
        holdUnit,
        nowMs,
        true,
      )
      return record?.rateLimit.allowed ? record.command : null
    }

    if (this.rightMouseDown && !this.isPointIntercepted(this.lastPointerX, this.lastPointerY)) {
      const rightSkillId =
        this.world.self?.rightSkill ||
        (this.hudModel ? this.hudModel.rightSkillId : this.hudManager.hotkeys.rightSkillId)
      if (this.isPlayerBusyCasting(nowMs, rightSkillId)) {
        return null
      }
      if (nowMs - this.lastHoldDispatchMs < 40) {
        return null
      }
      const liveSubtile = this.resolveLiveCursorSubtile(this.lastPointerX, this.lastPointerY)
      let holdUnit = this.selectionLocked
        ? this.resolveLockedHoldTarget113c(rightSkillId)
        : this.resolvePointerTarget(this.lastPointerX, this.lastPointerY).hoveredUnit
      if (!holdUnit && TARGET_CORPSE_SKILL_IDS_113C.has(rightSkillId)) {
        holdUnit = this.findNearestValidCorpseForSkill(liveSubtile.x, liveSubtile.y, rightSkillId)
      }
      const gate = clickGate113c({
        phase: 'hold',
        pressKind: this.pressKind,
        targetType: holdUnit ? holdUnit.unitType : null,
        selfMode: this.getSelfPlayerMode(),
      })
      if (!gate.pass) {
        return null
      }
      this.lastHoldDispatchMs = nowMs
      const record = this.triggerSecondaryWorldAction(
        liveSubtile.x,
        liveSubtile.y,
        holdUnit,
        nowMs,
        true,
      )
      return record?.rateLimit.allowed ? record.command : null
    }

    return null
  }

  /**
   * Check whether a pending melee chase has arrived within 1.13c `UNITS_IsInMeleeRange`
   * (`D2Common_10399`) and transition into the melee attack animation, or update the chase path
   * if the target unit moved.
   */
  checkPendingMeleeChaseArrival(nowMs = performance.now()): boolean {
    if (this.world.pendingMeleeAttack !== null) {
      const predSnap = this.predictor?.getSnapshot()
      const selfX =
        predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.x : this.world.self.x
      const selfY =
        predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.y : this.world.self.y
      if (this.world.checkPendingMeleeAttack(nowMs, selfX, selfY)) {
        this.lastMeleeChaseTargetPos = null
        this.predictor?.stop()
        const selfUnit = this.world.getUnit('player', this.world.selfId || 1)
        if (selfUnit && this.predictor) {
          this.predictor.setTargetDirection(selfUnit.targetDirection, false)
        }
        return true
      }
      if (this.world.pendingMeleeAttack !== null) {
        this.syncPendingMeleeChasePath()
      } else {
        this.lastMeleeChaseTargetPos = null
      }
    } else if (this.lastMeleeChaseTargetPos !== null) {
      this.lastMeleeChaseTargetPos = null
    }
    return false
  }

  /**
   * Synchronize local path prediction toward the pending melee chase target unit
   * when a melee attack was clicked out of range (`D2Game` `sub_6FC836D0` -> `sub_6FC82FB0`).
   */
  syncPendingMeleeChasePath(): readonly SubTilePoint[] {
    const pending = this.world.pendingMeleeAttack
    if (!pending) {
      this.lastMeleeChaseTargetPos = null
      return []
    }
    const targetUnit = this.world.getUnit(pending.target.unitType, pending.target.id)
    if (!targetUnit) {
      this.lastMeleeChaseTargetPos = null
      return []
    }
    const targetX = Math.round(targetUnit.x)
    const targetY = Math.round(targetUnit.y)
    const snap = this.predictor?.getSnapshot()
    const prev = this.lastMeleeChaseTargetPos
    if (
      !snap?.moving ||
      !prev ||
      prev.unitType !== pending.target.unitType ||
      prev.id !== pending.target.id ||
      prev.x !== targetX ||
      prev.y !== targetY
    ) {
      this.lastMeleeChaseTargetPos = {
        unitType: pending.target.unitType,
        id: pending.target.id,
        x: targetX,
        y: targetY,
      }
      return this.startLocalPathPrediction(targetX, targetY, this.isCurrentlyRunning())
    }
    return this.lastPath
  }

  private isCurrentlyRunning(): boolean {
    return this.hudModel ? this.hudModel.isRunMode : this.hudManager.isRunning
  }

  // ─── Internal Helpers ────────────────────────────────────────

  private applyDynamicCollisionsToGrid(
    baseWalkable: Uint8Array,
    subOriginX: number,
    subOriginY: number,
    subWidth: number,
    subHeight: number,
    startX: number,
    startY: number,
    isDuranceL3: boolean,
    objects: readonly ClientUnit[],
    cloneGrid: boolean,
  ): Uint8Array {
    const hasDynamicCollision =
      isDuranceL3 ||
      objects.some((u) => {
        if (u.hidden || u.dead || (u.x === 0 && u.y === 0)) return false
        if (u.classId === 341 || u.classId === 342) return true
        const meta = u.objectMeta ?? CANONICAL_113C_OBJECTS[u.classId]
        if (!meta || ((meta.subClass ?? 0) & 0x04) !== 0) return false
        const mode = Math.max(0, Math.min(7, Math.floor(u.mode || 0)))
        const hasCollision = ((meta.hasCollisionMask ?? 0) & (1 << mode)) !== 0
        if (meta.isDoor && !hasCollision) return true
        return hasCollision && (meta.sizeX ?? 0) >= 1 && (meta.sizeY ?? 0) >= 1
      })
    if (!hasDynamicCollision) {
      return baseWalkable
    }

    const walkable = cloneGrid ? new Uint8Array(baseWalkable) : baseWalkable
    const setLocalRect = (
      minLX: number,
      maxLX: number,
      minLY: number,
      maxLY: number,
      val: 0 | 1,
    ) => {
      const x0 = Math.max(0, Math.floor(minLX))
      const x1 = Math.min(subWidth - 1, Math.ceil(maxLX))
      const y0 = Math.max(0, Math.floor(minLY))
      const y1 = Math.min(subHeight - 1, Math.ceil(maxLY))
      for (let ly = y0; ly <= y1; ly++) {
        const rowOffset = ly * subWidth
        for (let lx = x0; lx <= x1; lx++) {
          walkable[rowOffset + lx] = val
        }
      }
    }
    const isLocalBlocked = (lx: number, ly: number): boolean => {
      if (lx < 0 || ly < 0 || lx >= subWidth || ly >= subHeight) return true
      return walkable[ly * subWidth + lx] === 0
    }

    // 1. Stamp solid object & closed door footprints (`Objects.txt` `HasCollision[mode] != 0`, `D2Common.dll` `0x6fd81850`)
    for (const obj of objects) {
      if (obj.hidden || obj.dead || (obj.x === 0 && obj.y === 0)) continue
      if (obj.classId === 341 || obj.classId === 342) continue
      const meta = obj.objectMeta ?? CANONICAL_113C_OBJECTS[obj.classId]
      if (!meta || ((meta.subClass ?? 0) & 0x04) !== 0) continue
      const mode = Math.max(0, Math.min(7, Math.floor(obj.mode || 0)))
      const hasCollision = ((meta.hasCollisionMask ?? 0) & (1 << mode)) !== 0
      if (!hasCollision) continue
      const sizeX = meta.sizeX ?? 0
      const sizeY = meta.sizeY ?? 0
      if (sizeX >= 1 && sizeY >= 1) {
        const minWX = Math.floor(obj.x) - (sizeX >>> 1)
        const minWY = Math.floor(obj.y) - (sizeY >>> 1)
        const minLX = minWX - subOriginX
        const maxLX = minWX + sizeX - 1 - subOriginX
        const minLY = minWY - subOriginY
        const maxLY = minWY + sizeY - 1 - subOriginY
        setLocalRect(minLX, maxLX, minLY, maxLY, 0)
        // 1.13c player `dwUnitSize = 2` ("+" 5-cell cross `0x6FD9C140`) cannot squeeze through a
        // 1-subtile gap between a closed door (`3x1` / `1x3`) and its flanking doorway wall.
        if (meta.isDoor) {
          if (sizeX >= sizeY) {
            for (let ly = minLY; ly <= maxLY; ly++) {
              if (isLocalBlocked(minLX - 2, ly)) setLocalRect(minLX - 1, minLX - 1, ly, ly, 0)
              if (isLocalBlocked(maxLX + 2, ly)) setLocalRect(maxLX + 1, maxLX + 1, ly, ly, 0)
            }
          }
          if (sizeY >= sizeX) {
            for (let lx = minLX; lx <= maxLX; lx++) {
              if (isLocalBlocked(lx, minLY - 2)) setLocalRect(lx, lx, minLY - 1, minLY - 1, 0)
              if (isLocalBlocked(lx, maxLY + 2)) setLocalRect(lx, lx, maxLY + 1, maxLY + 1, 0)
            }
          }
        }
      }
    }

    // 2. Open MephistoBridge / HellGate and open doors (`HasCollision[mode] === 0`, e.g. `mode === 2`)
    if (isDuranceL3) {
      // Canonical Durance of Hate Level 3 (102) MephistoBridge (341, 11x5) & HellGate (342) span
      setLocalRect(103, 120, 66, 74, 1)
    }
    for (const obj of objects) {
      if (obj.hidden || obj.dead || (obj.x === 0 && obj.y === 0)) continue
      const meta = obj.objectMeta ?? CANONICAL_113C_OBJECTS[obj.classId]
      const mode = Math.max(0, Math.min(7, Math.floor(obj.mode || 0)))
      const hasCollision = ((meta?.hasCollisionMask ?? 0) & (1 << mode)) !== 0
      if (obj.classId === 341 || obj.classId === 342) {
        const halfX = Math.max(3, Math.ceil((meta?.sizeX ?? 11) / 2) + 1)
        const halfY = Math.max(2, Math.ceil((meta?.sizeY ?? 5) / 2) + 1)
        const cx = obj.x - subOriginX
        const cy = obj.y - subOriginY
        setLocalRect(cx - halfX, cx + halfX, cy - halfY, cy + halfY, 1)
      } else if (meta?.isDoor && !hasCollision) {
        const halfX = Math.max(2, Math.ceil((meta.sizeX ?? 5) / 2))
        const halfY = Math.max(2, Math.ceil((meta.sizeY ?? 5) / 2))
        const cx = obj.x - subOriginX
        const cy = obj.y - subOriginY
        setLocalRect(cx - halfX, cx + halfX, cy - halfY, cy + halfY, 1)
      }
    }

    // Keep the player's current subtile walkable if it was walkable in static DS1
    const startLX = startX - subOriginX
    const startLY = startY - subOriginY
    if (startLX >= 0 && startLY >= 0 && startLX < subWidth && startLY < subHeight) {
      const startIdx = startLY * subWidth + startLX
      if (baseWalkable[startIdx] === 1) {
        walkable[startIdx] = 1
      }
    }
    return walkable
  }

  private startLocalPathPrediction(
    targetX: number,
    targetY: number,
    isRunning: boolean,
  ): readonly SubTilePoint[] {
    if (!this.predictor) {
      this.lastPath = [{ x: targetX, y: targetY }]
      return this.lastPath
    }
    this.lastPath = []

    const snap = this.predictor.getSnapshot()
    const sx = Math.round(snap.logicalX)
    const sy = Math.round(snap.logicalY)
    const candidateAreas = [
      ...(this.world.areaId > 0 ? [this.world.areaId] : []),
      ...this.world.getRevealedAreaIds(),
    ]
    const levelView =
      (this.mapService && candidateAreas.length > 0 && (sx !== 0 || sy !== 0)
        ? this.mapService.findLevelViewAtWorldSubTile(sx, sy, candidateAreas)
        : null) ??
      (this.world.areaId > 0 ? this.automapView?.getLevelView(this.world.areaId) : undefined) ??
      this.mapService?.getActiveLevelView() ??
      this.automapView?.getLevelView() ??
      null

    if (levelView && levelView.walkable.length > 0) {
      const ox = levelView.subOriginX ?? 0
      const oy = levelView.subOriginY ?? 0
      const startInBounds =
        sx >= ox &&
        sy >= oy &&
        sx < ox + levelView.subWidth &&
        sy < oy + levelView.subHeight
      const inBounds =
        startInBounds &&
        targetX >= ox &&
        targetY >= oy &&
        targetX < ox + levelView.subWidth &&
        targetY < oy + levelView.subHeight

      const objects = this.world.getUnitsByType ? this.world.getUnitsByType(2) : []
      const isDuranceL3 = levelView.levelId === 102 || this.world.areaId === 102
      let effectiveView = levelView
      if (startInBounds) {
        const stampedWalkable = this.applyDynamicCollisionsToGrid(
          levelView.walkable,
          ox,
          oy,
          levelView.subWidth,
          levelView.subHeight,
          sx,
          sy,
          isDuranceL3,
          objects,
          true,
        )
        if (stampedWalkable !== levelView.walkable) {
          effectiveView = { ...levelView, walkable: stampedWalkable }
        }
      }

      if (inBounds) {
        const pathResult = findPathWorld(effectiveView, sx, sy, targetX, targetY, { unitSize: 2 })
        const endPt = pathResult.path[pathResult.path.length - 1]
        const targetIdx = (Math.floor(targetY) - oy) * levelView.subWidth + (Math.floor(targetX) - ox)
        const targetStampedSolid =
          effectiveView !== levelView &&
          effectiveView.walkable[targetIdx] === 0 &&
          levelView.walkable[targetIdx] === 1
        if (
          pathResult.path.length > 0 &&
          pathResult.reachedGoal &&
          endPt &&
          (targetStampedSolid ||
            (Math.abs(endPt.x - targetX) <= 1 && Math.abs(endPt.y - targetY) <= 1))
        ) {
          this.lastPath = pathResult.path
          this.predictor.setPath(pathResult.path, isRunning)
          return this.lastPath
        }
        // Keep partial single-view path as fallback if no cross-border path succeeds below
        if (pathResult.path.length > 0) {
          this.lastPath = pathResult.path
        }
      }

      // Seamless cross-border pathfinding across connected LevelViews when target lies in an
      // adjacent level or on a border seam that is blocked/sparse in the primary LevelView.
      const extraViews: LevelView[] = []
      if (this.mapService) {
        if (typeof this.mapService.getConnectedLevelViews === 'function' && levelView.areaId > 0) {
          try {
            for (const nv of this.mapService.getConnectedLevelViews(
              levelView.areaId,
              candidateAreas,
            )) {
              if (nv !== levelView && nv.walkable.length > 0 && !extraViews.includes(nv)) {
                extraViews.push(nv)
              }
            }
          } catch {
            // Ignore in partial mocks
          }
        }
        if (typeof this.mapService.findAllLevelViewsAtWorldSubTile === 'function') {
          for (const nv of this.mapService.findAllLevelViewsAtWorldSubTile(
            targetX,
            targetY,
            candidateAreas,
          )) {
            if (nv !== levelView && nv.walkable.length > 0 && !extraViews.includes(nv)) {
              extraViews.push(nv)
            }
          }
        } else if (typeof this.mapService.findLevelViewAtWorldSubTile === 'function') {
          const targetView = this.mapService.findLevelViewAtWorldSubTile(
            targetX,
            targetY,
            candidateAreas,
          )
          if (
            targetView &&
            targetView !== levelView &&
            targetView.walkable.length > 0 &&
            !extraViews.includes(targetView)
          ) {
            extraViews.push(targetView)
          }
        }
      }

      if (extraViews.length > 0 && Math.hypot(targetX - sx, targetY - sy) <= 300) {
        const pad = 40
        const boxOriginX = Math.min(sx, targetX) - pad
        const boxOriginY = Math.min(sy, targetY) - pad
        const boxWidth = Math.min(400, Math.max(sx, targetX) + pad - boxOriginX + 1)
        const boxHeight = Math.min(400, Math.max(sy, targetY) + pad - boxOriginY + 1)
        if (boxWidth > 0 && boxHeight > 0) {
          const compositeWalkable = new Uint8Array(boxWidth * boxHeight)
          const allViews = [levelView, ...extraViews]
          for (const v of allViews) {
            const vox = v.subOriginX ?? 0
            const voy = v.subOriginY ?? 0
            const vw = v.subWidth
            const vh = v.subHeight
            const vWalk = v.walkable
            const startLX = Math.max(0, vox - boxOriginX)
            const endLX = Math.min(boxWidth - 1, vox + vw - 1 - boxOriginX)
            const startLY = Math.max(0, voy - boxOriginY)
            const endLY = Math.min(boxHeight - 1, voy + vh - 1 - boxOriginY)
            for (let ly = startLY; ly <= endLY; ly++) {
              const wy = boxOriginY + ly
              const vRow = (wy - voy) * vw
              const cRow = ly * boxWidth
              for (let lx = startLX; lx <= endLX; lx++) {
                const wx = boxOriginX + lx
                if (vWalk[vRow + (wx - vox)] !== 0) {
                  compositeWalkable[cRow + lx] = 1
                }
              }
            }
          }
          this.applyDynamicCollisionsToGrid(
            compositeWalkable,
            boxOriginX,
            boxOriginY,
            boxWidth,
            boxHeight,
            sx,
            sy,
            false,
            objects,
            false,
          )
          const crossPath = findPathWorld(
            {
              subOriginX: boxOriginX,
              subOriginY: boxOriginY,
              subWidth: boxWidth,
              subHeight: boxHeight,
              walkable: compositeWalkable,
            },
            sx,
            sy,
            targetX,
            targetY,
            { unitSize: 2 },
          )
          if (
            crossPath.path.length > 0 &&
            (!inBounds || this.lastPath.length === 0 || crossPath.reachedGoal)
          ) {
            this.lastPath = crossPath.path
            this.predictor.setPath(crossPath.path, isRunning)
            return this.lastPath
          }
        }
      }

      if (startInBounds && !inBounds && this.lastPath.length === 0) {
        const clampedX = Math.max(ox, Math.min(ox + levelView.subWidth - 1, targetX))
        const clampedY = Math.max(oy, Math.min(oy + levelView.subHeight - 1, targetY))
        const clampedRes = findPathWorld(effectiveView, sx, sy, clampedX, clampedY, { unitSize: 2 })
        if (clampedRes.path.length > 0) {
          this.lastPath = clampedRes.path
        }
      }

      if (startInBounds || this.lastPath.length > 0) {
        this.predictor.setPath(this.lastPath, isRunning)
        return this.lastPath
      }
    }

    this.lastPath = [{ x: targetX, y: targetY }]
    this.predictor.setPath(this.lastPath, isRunning)
    return this.lastPath
  }

  dispatchRateLimited(
    command: ClientCommand,
    nowMs = performance.now(),
    path: readonly SubTilePoint[] = [],
  ): DispatchedCommandRecord {
    const rateLimit = this.rateLimiter.tryAcquire(command, nowMs)
    if (rateLimit.allowed) {
      const predSnap = this.predictor?.getSnapshot()
      const selfX =
        predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.x : undefined
      const selfY =
        predSnap && (predSnap.x !== 0 || predSnap.y !== 0) ? predSnap.y : undefined
      if (
        command.type === 'Move' ||
        command.type === 'WalkToLocation' ||
        command.type === 'RunToLocation' ||
        command.type === 'MoveToUnit' ||
        command.type === 'WalkToTarget' ||
        command.type === 'RunToTarget' ||
        command.type === 'SkillAt' ||
        command.type === 'SkillOn' ||
        command.type === 'CastLeftSkillOnLocation' ||
        command.type === 'CastRightSkillOnLocation' ||
        command.type === 'CastLeftSkillOnTarget' ||
        command.type === 'CastRightSkillOnTarget' ||
        command.type === 'Interact' ||
        command.type === 'OperateObject' ||
        command.type === 'NpcInit' ||
        command.type === 'Resurrect'
      ) {
        this.world.noteOutgoingCommand(command, nowMs, selfX, selfY)
      }
      this.sendCommand(command, nowMs)
      if (this.predictor) {
        if (command.type === 'SkillAt') {
          this.predictor.stop()
          this.predictor.facePoint(command.at.x, command.at.y, false)
        } else if (
          command.type === 'CastLeftSkillOnLocation' ||
          command.type === 'CastRightSkillOnLocation'
        ) {
          this.predictor.stop()
          this.predictor.facePoint(command.x, command.y, false)
        } else if (command.type === 'SkillOn') {
          if (this.world.pendingMeleeAttack !== null) {
            path = this.syncPendingMeleeChasePath()
          } else {
            this.predictor.stop()
            const targetUnit = this.world.getUnit(command.target.unitType, command.target.id)
            if (targetUnit) {
              this.predictor.facePoint(targetUnit.x, targetUnit.y, false)
            }
          }
        } else if (
          command.type === 'Interact' ||
          command.type === 'NpcInit'
        ) {
          const keepWalkingToObject =
            command.type === 'Interact' &&
            command.target.unitType === UNIT_TYPE_TO_ID.object &&
            this.pendingObjectInteractId === command.target.id
          if (!keepWalkingToObject) {
            this.predictor.stop()
          }
          const targetUnit = this.world.getUnit(command.target.unitType, command.target.id)
          if (targetUnit) {
            this.predictor.facePoint(targetUnit.x, targetUnit.y, false)
          }
        } else if (
          command.type === 'CastLeftSkillOnTarget' ||
          command.type === 'CastRightSkillOnTarget'
        ) {
          if (this.world.pendingMeleeAttack !== null) {
            path = this.syncPendingMeleeChasePath()
          } else {
            this.predictor.stop()
            const targetUnit = this.world.getUnit(command.unitKind, command.unitId)
            if (targetUnit) {
              this.predictor.facePoint(targetUnit.x, targetUnit.y, false)
            }
          }
        } else if (command.type === 'OperateObject') {
          this.predictor.stop()
          const targetUnit = this.world.getUnit('object', command.objectId)
          if (targetUnit) {
            this.predictor.facePoint(targetUnit.x, targetUnit.y, false)
          }
        }
      }
    }
    return {
      command,
      rateLimit,
      path,
    }
  }
}
