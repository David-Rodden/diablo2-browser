import { describe, expect, it } from 'vitest'
import { InventoryCare, surplusSupplies, type InventoryCareHost } from '../../src/client/input/inventory-care.ts'
import { beltColumnKinds } from '../../src/client/input/belt-refill.ts'
import type { ItemData } from '../../src/netproto/index.ts'

const item = (id: number, code: string, container: ItemData['container'] = 'inventory'): ItemData =>
  ({ id, itemId: id, code, rawCode: code, container, quality: 2, identified: true, stats: [], runewordStats: [], setBonusStats: [], totalSockets: 0, usedSockets: 0, socketedChildCount: 0, runeword: false, invWidth: 1, invHeight: 1, gridX: id % 10, gridY: 0 }) as unknown as ItemData
const byId = (...items: ItemData[]) => new Map(items.map((owned) => [owned.id, owned]))

function care(inventory: ItemData[], stash: ItemData[] = []) {
  const self = { charClass: 2, level: 25, stats: { get: () => 30 }, skillEntries: new Map() }
  const world = { self, containers: { equipment: new Map(), inventory: byId(...inventory), stash: byId(...stash), cube: new Map(), belt: new Map(), revision: 0 }, quests: [] }
  return new InventoryCare({ world, hudManager: {}, hudModel: null } as unknown as InventoryCareHost)
}

describe('supplies in the bags', () => {
  it('keeps the best potions up to the spare count and sells the rest with the odd potions', () => {
    const bag = [item(1, 'hp1'), item(2, 'hp3'), item(3, 'hp2'), item(4, 'mp1'), item(5, 'mp4'), item(6, 'vps'), item(7, 'opl'), item(8, 'rvs'), item(9, 'tbk')]
    expect(surplusSupplies(bag, { hp: 2, mp: 1 }).map((sold) => sold.code).sort()).toEqual(['hp1', 'mp1', 'opl', 'vps'])
  })

  it('only sells spare supplies once the autopilot has said how many potions to keep', () => {
    const bags = care([item(1, 'hp1'), item(2, 'hp1'), item(3, 'vps')])
    expect(bags.sellable).toEqual([])
    bags.potionKeep = { hp: 1, mp: 0 }
    expect(bags.sellable.map((sold) => sold.id).sort()).toEqual([2, 3])
  })

  it('takes potions and odd supplies out of the stash so they can be sold or drunk', () => {
    const bags = care([], [item(20, 'mp2', 'stash'), item(21, 'gpl', 'stash'), item(22, 'r03', 'stash')])
    bags.potionKeep = { hp: 4, mp: 2 }
    expect(bags.untidy.map((taken) => taken.id).sort()).toEqual([20, 21])
  })
})

describe('belt columns', () => {
  it('forgets a column that only ever held a stamina potion', () => {
    const stamina = { kind: 'stamina' } as never, healing = { kind: 'hp' } as never
    const empty = { getSlot: () => null, findAutoPlacePotionSlot: () => null }
    expect(beltColumnKinds(empty, [healing, stamina, null, null])).toEqual([healing, null, null, null])
  })
})
