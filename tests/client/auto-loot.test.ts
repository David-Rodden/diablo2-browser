import { describe, expect, it } from 'vitest'
import { CommandMapper } from '../../src/client/input/command-mapper.ts'
import { HudManager } from '../../src/client/ui/hud-manager.ts'
import { ClientWorld } from '../../src/client/world/client-world.ts'
import type { ClientCommand } from '../../src/netproto/index.ts'
import { fitsInInventory, isWantedLoot, type AutoLootRules } from '../../src/client/input/auto-loot.ts'

const NOTABLE: AutoLootRules = { runes: true, uniques: true, sets: true, charms: true, jewels: true, gems: false, rares: false }
const at = (gridX: number, gridY: number, invWidth: number, invHeight: number) => ({ gridX, gridY, invWidth, invHeight })

describe('auto loot', () => {
  it('wants runes, uniques, sets, charms and jewels, and gems or rares only when asked', () => {
    expect([{ code: 'r01 ' }, { code: 'cap', quality: 7 }, { code: 'lrg', quality: 5 }, { code: 'cm2', quality: 4 }, { code: 'jew', quality: 4 }].every((item) => isWantedLoot(NOTABLE, item as never))).toBe(true)
    expect([{ code: 'gpv' }, { code: 'cap', quality: 6 }, { code: 'hp1' }, { code: 'r34' }, { code: 'cap', quality: 4 }].some((item) => isWantedLoot(NOTABLE, item as never))).toBe(false)
    expect(isWantedLoot({ ...NOTABLE, gems: true }, { code: 'glr' } as never)).toBe(true)
    expect(isWantedLoot({ ...NOTABLE, gems: true }, { code: 'gcr' } as never)).toBe(false)
  })

  it('only picks up what the inventory has room for', () => {
    const fullButOneColumn = [...Array(9).keys()].map((x) => at(x, 0, 1, 4))
    expect(fitsInInventory(fullButOneColumn, 1, 3)).toBe(true)
    expect(fitsInInventory(fullButOneColumn, 2, 1)).toBe(false)
    expect(fitsInInventory([...fullButOneColumn, at(9, 1, 1, 1)], 1, 3)).toBe(false)
    expect(fitsInInventory([], 2, 4)).toBe(true)
  })
})

describe('auto loot pickup in play', () => {
  const setup = () => {
    const world = new ClientWorld()
    world.apply({ type: 'UnitAssign', unit: { unitType: 0, id: 1, classId: 1, name: 'Hero', x: 5000, y: 5000 }, isSelf: true })
    const sent: ClientCommand[] = []
    const mapper = new CommandMapper({ world, hudManager: new HudManager(), sendCommand: (cmd) => sent.push(cmd) })
    mapper.assists.autoLootRules = NOTABLE
    const drop = (id: number, code: string, quality: number, invWidth = 1, invHeight = 1) =>
      world.apply({ type: 'ItemEvent', action: 0, container: 'ground', item: { id, itemId: id, code, rawCode: `${code} `, quality, invWidth, invHeight, container: 'ground', action: 0, flags: 0x10, rawFlags: 0x10, x: 5001, y: 5000, worldX: 5001, worldY: 5000 } })
    return { world, mapper, drop, pickups: () => sent.flatMap((c) => (c.type === 'ItemPickup' ? [c.itemId] : [])) }
  }

  it('picks up a rune but leaves a magic sword', () => {
    const s = setup()
    s.drop(71, 'r08', 2)
    s.drop(72, 'lsd', 4, 1, 3)
    ;[1000, 1040, 1080].forEach((t) => s.mapper.assists.pickUpNearbyLoot(t))
    expect(s.pickups()).toEqual([71])
  })

  it('leaves a unique on the ground when the inventory is full', () => {
    const s = setup()
    ;[...Array(10).keys()].forEach((x) => s.world.containers.applyItemEvent(0x00, { id: 900 + x, itemId: 900 + x, code: 'tsc', quality: 2, invWidth: 1, invHeight: 4, gridX: x, gridY: 0, x, y: 0, container: 'inventory', location: 0 } as never, 'inventory', 1))
    s.drop(73, 'cap', 7, 2, 2)
    s.mapper.assists.pickUpNearbyLoot(1000)
    expect(s.pickups()).toEqual([])
  })
})
