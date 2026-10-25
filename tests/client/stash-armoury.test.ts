import { describe, expect, it } from 'vitest'
import { InventoryCare, type InventoryCareHost } from '../../src/client/input/inventory-care.ts'
import type { ItemData } from '../../src/netproto/index.ts'

const item = (fields: Partial<ItemData> & { readonly id: number; readonly code: string }): ItemData =>
  ({ itemId: fields.id, rawCode: fields.code, quality: 4, identified: true, stats: [], runewordStats: [], setBonusStats: [], totalSockets: 0, usedSockets: 0, socketedChildCount: 0, runeword: false, invWidth: 1, invHeight: 1, bodyLoc: 0, equippedSlot: 0, flags: 0, rawFlags: 0, container: 'stash', ...fields }) as ItemData

const life = (value: number) => [{ statId: 7, param: 0, value }]
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
