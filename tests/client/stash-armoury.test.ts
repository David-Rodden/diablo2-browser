import { describe, expect, it } from 'vitest'
import { InventoryCare, type InventoryCareHost } from '../../src/client/input/inventory-care.ts'
import type { ItemData } from '../../src/netproto/index.ts'

const item = (fields: Partial<ItemData> & { readonly id: number; readonly code: string }): ItemData =>
  ({ itemId: fields.id, rawCode: fields.code, quality: 4, identified: true, stats: [], runewordStats: [], setBonusStats: [], totalSockets: 0, usedSockets: 0, socketedChildCount: 0, runeword: false, invWidth: 1, invHeight: 1, bodyLoc: 0, equippedSlot: 0, flags: 0, rawFlags: 0, container: 'stash', ...fields }) as ItemData

const life = (value: number) => [{ statId: 7, param: 0, value: value << 8 }]
const byId = (...items: ItemData[]) => new Map(items.map((owned) => [owned.id, owned]))

function care(stash: ItemData[], inventory: ItemData[] = []) {
  const self = { charClass: 1, level: 30, stats: { get: (id: number) => (id === 0 ? 40 : 30) }, skillEntries: new Map([[59, { skillId: 59, level: 10 }]]) }
  const world = { self, containers: { equipment: new Map(), inventory: byId(...inventory), stash: byId(...stash), cube: new Map(), revision: 0 }, quests: [] }
  return new InventoryCare({ world, hudManager: {}, hudModel: null } as unknown as InventoryCareHost)
}

describe('better gear left in the stash', () => {
  it('takes out the best piece for each slot and keeps the rest stored', () => {
    const [weak, strong, ring] = [item({ id: 1, code: 'cap', stats: life(20) }), item({ id: 2, code: 'cap', stats: life(40) }), item({ id: 3, code: 'rin', stats: life(30) })]
    expect(care([weak, strong, ring]).armoury.map((picked) => picked.id).sort()).toEqual([2, 3])
  })

  it('brings charms back into the bag while there is still room for loot', () => {
    const charm = (id: number) => item({ id, code: 'cm3', invWidth: 1, invHeight: 3, quality: 4, stats: life(45) })
    const filler = (count: number) => Array.from({ length: count }, (_, i) => item({ id: 100 + i, code: 'tsc', container: 'inventory' }))
    expect(care([charm(10), charm(11)]).armoury.map((picked) => picked.id).sort()).toEqual([10, 11])
    expect(care([charm(10), charm(11)], filler(24)).armoury).toHaveLength(1)
    expect(care([charm(10)], filler(26)).armoury).toEqual([])
  })

  it('counts charms below great as spares to sell when money runs short, but never the quest items', () => {
    const charm = (id: number, value: number) => item({ id, code: 'cm3', invWidth: 1, invHeight: 3, container: 'inventory', stats: life(value) })
    const bag = care([], [charm(1, 5), charm(2, 45), charm(3, 400), item({ id: 4, code: 'box', container: 'inventory', quality: 2 })])
    expect(bag.spares.map((spare) => spare.id)).toEqual([1, 2])
  })
})

describe('clearing out the stash', () => {
  const jewel = (id: number, value: number, container: ItemData['container'] = 'stash') => item({ id, code: 'jew', container, stats: life(value) })

  it('brings surplus jewels out to sell and keeps them out of the stash', () => {
    const stored = [60, 50, 40, 35, 30, 25].map((value, i) => jewel(10 + i, value))
    const bag = care(stored, [jewel(1, 28, 'inventory')])
    expect(bag.untidy.map((out) => out.id).sort()).toEqual([14, 15])
    expect(bag.surplus.map((out) => out.id)).toEqual([1])
    expect(bag.stashable).toEqual([])
  })

  it('takes unidentified finds out once it can identify them, and stops stashing them', () => {
    const ring = (id: number, container: ItemData['container']) => item({ id, code: 'rin', quality: 6, identified: false, container })
    const bag = care([ring(1, 'stash')], [ring(2, 'inventory')])
    expect([bag.untidy.length, bag.stashable.length]).toEqual([0, 1])
    bag.identifiable = true
    expect([bag.untidy.map((out) => out.id), bag.stashable.length]).toEqual([[1], 0])
  })
})

describe('charms in the bags', () => {
  it('keeps the best charms per cell and lets the rest go, stashing only the great ones', () => {
    const charm = (id: number, code: string, height: number, value: number) => item({ id, code, invWidth: 1, invHeight: height, container: 'inventory', identified: true, stats: life(value) })
    const grands = [100, 90, 80, 70, 60, 50, 40, 35, 30, 28].map((value, i) => charm(10 + i, 'cm3', 3, value))
    const bag = care([], [...grands, charm(1, 'cm1', 1, 40)])
    expect(bag.excessCharms.map((out) => out.id)).toEqual([19])
    expect(bag.stashable.map((out) => out.id)).toEqual([])
  })
})

describe('putting on better gear', () => {
  it('gives up on a piece the server will not let it wear and sells it instead', async () => {
    const helm = item({ id: 7, code: 'cap', container: 'inventory', stats: life(40) })
    const bag = care([], [helm])
    const { containers } = (bag as unknown as { host: { world: { containers: { cursor: ItemData | null; inventory: Map<number, ItemData> } } } }).host.world
    containers.cursor = null
    const hudModel = {
      pickupItemToCursor: (id: number) => ((containers.cursor = containers.inventory.get(id) ?? null), containers.inventory.delete(id)),
      equipItem: () => true,
      placeCursorItem: (id: number) => (containers.inventory.set(id, containers.cursor!), (containers.cursor = null)),
    }
    Object.assign((bag as unknown as { host: object }).host, { hudModel })
    expect(bag.upgrades.map((up) => up.id)).toEqual([7])
    expect(await bag.wearUpgrades()).toBe(0)
    expect([bag.upgrades, bag.sellable.map((sold) => sold.id), containers.cursor]).toEqual([[], [7], null])
  }, 20_000)
})
