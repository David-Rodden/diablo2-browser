import { describe, expect, it, vi } from 'vitest'
import {
  computeCompactD2rHudMetrics,
  detectMobileTouchEnvironment,
  hitTestCompactD2rHud,
  TouchControlsHud,
} from '../../src/client/ui/touch-controls.ts'
import {
  buildCompactHudLayoutOptions,
  computeSelectedItemActionBar,
  executeTouchContextAction,
  handleCompactD2rHudClick,
  isPointInterceptedByHud,
  resolveTouchHudContext,
} from '../../src/client/ui/hud-input-router.ts'
import { isTouchCursorHidden } from '../../src/client/ui/hud-world-overlays.ts'
import { HudManager, type HudCommandSink } from '../../src/client/ui/hud-manager.ts'
import {
  CommandMapper,
  TOUCH_JOYSTICK_REPEAT_MS,
  TOUCH_POINTER_ID_OFFSET,
} from '../../src/client/input/command-mapper.ts'
import type { UiInventoryItem } from '../../src/client/ui/inventory.ts'
import { DEFAULT_SKILL_WHEEL_BANK_MODE } from '../../src/client/settings/client-settings.ts'

function createMockHudCanvas(width = 800, height = 600): HTMLCanvasElement {
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    getContext: () => ({
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      drawImage: vi.fn(),
      setLineDash: vi.fn(),
      measureText: (t: string) => ({ width: t.length * 8 }),
    }),
  } as unknown as HTMLCanvasElement
}

function helm(id: string): UiInventoryItem {
  return {
    id,
    code: 'uap',
    name: 'Shako',
    nameZh: '军帽',
    baseNameZh: '军帽',
    invFile: 'invcap',
    quality: 'unique',
    identified: true,
    invWidth: 2,
    invHeight: 2,
    allowedSlots: ['helm'],
    stats: [{ text: '+2 To All Skills' }],
  }
}

function makeTouchHud(width = 800, height = 600): HudManager {
  const hud = new HudManager(createMockHudCanvas(width, height))
  if (width !== 800) hud.resize(width, height)
  hud.touchControls.enabled = true
  hud.touchControls.hudLayoutMode = 'compact-d2r'
  return hud
}

function makeMapper(hud: HudManager, sent: unknown[]): CommandMapper {
  const world = {
    self: { x: 5000, y: 5000, leftSkill: 0, rightSkill: 0, maxStamina: 0, stamina: 0 },
    areaId: 1,
    listUnits: () => [],
    getUnit: () => undefined,
    getRevealedAreaIds: () => [],
    containers: { cursor: null },
    npcInteraction: {},
    pendingMeleeAttack: null,
    noteOutgoingCommand: () => {},
  }
  return new CommandMapper({
    world: world as never,
    hudManager: hud,
    sendCommand: (cmd) => sent.push(cmd),
  })
}

describe('#1966 multi-touch routing & joystick hold loop', () => {
  it('does not treat a short landscape desktop window as a touch device', () => {
    const desktop = {
      innerWidth: 1280,
      innerHeight: 500,
      navigator: { maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
      matchMedia: () => ({ matches: false }),
    } as unknown as Window
    expect(detectMobileTouchEnvironment(desktop)).toBe(false)
  })

  it('routes a joystick finger and an L2 finger independently and keeps moving while the stick is held', () => {
    const hud = makeTouchHud()
    const sent: unknown[] = []
    const mapper = makeMapper(hud, sent)
    const m = computeCompactD2rHudMetrics(800, 600)

    expect(mapper.handleTouchStart(1, 120, 450, 1000)).toBe('joystick')
    mapper.handleTouchMove(1, 180, 450, 1010)
    expect(hud.touchControls.joystick.active).toBe(true)
    expect(hud.touchControls.joystick.pointerId).toBe(1 + TOUCH_POINTER_ID_OFFSET)

    // Second finger on L2 holds Bank 2 without disturbing the joystick.
    expect(mapper.handleTouchStart(2, m.l2PreviewBar.l2Btn.x + 4, m.l2PreviewBar.l2Btn.y + 4, 1020)).toBe('l2Hold')
    expect(hud.touchControls.activeSkillBank).toBe(1)
    expect(hud.touchControls.joystick.active).toBe(true)

    // Stationary held stick keeps emitting forward Move commands from tick().
    const before = sent.filter((c: any) => c.type === 'Move').length
    mapper.tick(1020 + TOUCH_JOYSTICK_REPEAT_MS + 400)
    mapper.tick(1020 + TOUCH_JOYSTICK_REPEAT_MS * 2 + 800)
    const after = sent.filter((c: any) => c.type === 'Move').length
    expect(before).toBeGreaterThan(0)
    expect(after).toBeGreaterThan(before)

    // Releasing L2 returns to Bank 1 (hold mode default) and leaves the joystick alone.
    mapper.handleTouchEnd(2, 0, 0, 1500)
    expect(DEFAULT_SKILL_WHEEL_BANK_MODE).toBe('hold')
    expect(hud.touchControls.activeSkillBank).toBe(0)
    expect(hud.touchControls.joystick.active).toBe(true)

    mapper.handleTouchEnd(1, 180, 450, 1600)
    expect(hud.touchControls.joystick.active).toBe(false)
    expect(mapper.activeTouches.size).toBe(0)
  })
})

describe('#1967 skill wheel press / vector aim & context interact', () => {
  it('converts a dragged skill wheel press into vector aiming and casts on release', () => {
    const hud = makeTouchHud()
    hud.touchControls.wheelSlots = []
    hud.hotkeys.setAvailableSkills([
      { skillId: 59, name: 'Blizzard', nameZh: '暴风雪', level: 1, manaCost: 23, leftUsable: false, rightUsable: true },
    ])
    hud.hotkeys.bindHotkey('F1', 'right', 59)
    const mapper = makeMapper(hud, [])
    const castAt = vi.spyOn(mapper, 'castTouchSkillAtScreen').mockImplementation(() => {})
    const m = computeCompactD2rHudMetrics(800, 600)
    const arc0 = m.wheel.arcSlots[0]!
    expect(mapper.handleTouchStart(3, arc0.cx, arc0.cy, 2000)).toBe('skillWheel')
    expect(hud.hotkeys.rightSkillId).toBe(59)
    mapper.handleTouchMove(3, arc0.cx - 60, arc0.cy - 10, 2050)
    expect(hud.touchControls.vectorAim?.active).toBe(true)
    mapper.handleTouchEnd(3, arc0.cx - 60, arc0.cy - 10, 2100)
    expect(castAt).toHaveBeenCalledTimes(1)
    expect(hud.touchControls.vectorAim).toBeNull()
  })

  it('[A] context button routes the cone-locked NPC / foot loot through onTouchLootInteract', () => {
    const hud = makeTouchHud()
    const calls: unknown[] = []
    hud.onTouchLootInteract = (t) => calls.push(t)
    hud.touchControls.lockedInteractable = { id: 77, kind: 'npc', label: 'Akara', screenX: 400, screenY: 260 }
    const m = computeCompactD2rHudMetrics(800, 600)
    handleCompactD2rHudClick(hud, m.lootBtn.cx, m.lootBtn.cy)
    expect(calls).toEqual([{ id: 77, kind: 'npc' }])
  })
})

describe('#1968 HUD context switching & zero panel occlusion', () => {
  it('resolves world / panel / dialog / menu contexts', () => {
    const hud = makeTouchHud()
    expect(resolveTouchHudContext(hud)).toBe('world')
    hud.toggleRightPanel('inv')
    expect(resolveTouchHudContext(hud)).toBe('panel')
    hud.worldPanels.escapeMenuOpen = true
    expect(resolveTouchHudContext(hud)).toBe('menu')
  })

  it('never hit-tests combat wheel or joystick over open dock panels', () => {
    const hud = makeTouchHud()
    hud.toggleRightPanel('inv')
    const opts = buildCompactHudLayoutOptions(hud)
    const m = computeCompactD2rHudMetrics(800, 600)
    // Former wheel / belt positions now fall inside the inventory panel area: no compact hit.
    expect(hitTestCompactD2rHud(m.wheel.cx, m.wheel.cy, 800, 600, false, 0, opts)).toBeNull()
    for (let y = 0; y <= 553; y += 23) {
      for (let x = 0; x <= 800; x += 25) {
        const hit = hitTestCompactD2rHud(x, y, 800, 600, false, 0, opts)
        expect(hit === null || hit.kind === 'skillBindSlot').toBe(true)
      }
    }
    // Joystick zone is disabled while a panel is open.
    hud.touchControls.handlePointerDown(1, 60, 500, 800, 600, false)
    expect(isPointInterceptedByHud(hud, 60, 300)).toBe(false)
  })
})

describe('#1969 touch panel actions use authoritative commandSink packets', () => {
  it('dispatches equip via pickup + equip packets instead of mutating local arrays', () => {
    const hud = makeTouchHud()
    const sink = {
      pickupItemToCursor: vi.fn(),
      equipItem: vi.fn(),
      dropItem: vi.fn(),
      vendorSell: vi.fn(),
    } as unknown as HudCommandSink
    hud.commandSink = sink
    hud.toggleRightPanel('inv')
    const item = helm('42')
    hud.inventory.gridItems.push({ item, col: 0, row: 0 })
    hud.touchControls.selectPanelItem({ source: 'inv', item, col: 0, row: 0, anchorX: 460, anchorY: 340 })
    expect(computeSelectedItemActionBar(hud)?.buttons.some((b) => b.action === 'equip')).toBe(true)
    expect(executeTouchContextAction(hud, 'equip')).toBe(true)
    expect(sink.pickupItemToCursor).toHaveBeenCalledWith(42)
    expect(sink.equipItem).toHaveBeenCalledWith(42, 'helm')
    // Local model is untouched: the server answer drives the inventory.
    expect(hud.inventory.gridItems).toHaveLength(1)
    expect(hud.touchControls.selectedPanelItem).toBeNull()
  })

  it('binds a pending skill to F9 from the skill bind bar', () => {
    const hud = makeTouchHud(1068, 600)
    const assign = vi.fn()
    hud.commandSink = { assignSkillHotkey: assign } as unknown as HudCommandSink
    hud.toggleRightPanel('skill')
    hud.touchControls.pendingBindSkillId = 54
    const m = computeCompactD2rHudMetrics(1068, 600, buildCompactHudLayoutOptions(hud))
    const slot = m.skillBindBar.slots[8]!
    const hit = handleCompactD2rHudClick(hud, slot.x + 4, slot.y + 4)
    expect(hit?.kind).toBe('skillBindSlot')
    expect(hud.hotkeys.bindings.get('SKILL9')?.skillId).toBe(54)
    expect(assign).toHaveBeenCalledWith(8, 'right', 54)
    expect(hud.touchControls.pendingBindSkillId).toBeNull()
  })
})

describe('#1970 touch cursor & art', () => {
  it('hides the gauntlet cursor on touch unless it carries meaning', () => {
    const hud = makeTouchHud()
    expect(isTouchCursorHidden(hud)).toBe(true)
    hud.inventory.cursorItem = helm('9')
    expect(isTouchCursorHidden(hud)).toBe(false)
    const desktop = new HudManager(createMockHudCanvas())
    expect(isTouchCursorHidden(desktop)).toBe(false)
  })

  it('keeps the [A] button clear of the right globe on 800x600', () => {
    const m = computeCompactD2rHudMetrics(800, 600)
    const d = Math.hypot(m.lootBtn.cx - m.rightGlobe.cx, m.lootBtn.cy - m.rightGlobe.cy)
    expect(d).toBeGreaterThan(m.lootBtn.r + m.rightGlobe.r)
  })

  it('TouchControlsHud defaults to hold-to-L2 bank mode', () => {
    expect(new TouchControlsHud().skillWheelBankMode).toBe('hold')
  })
})
