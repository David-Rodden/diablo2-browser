import { describe, expect, it } from 'vitest'
import { artisanPick } from '../../src/client/guide/artisan.ts'
import type { ClientWorld } from '../../src/client/world/client-world.ts'
import type { ItemData } from '../../src/netproto/index.ts'

const item = (id: number, code: string, fields: Partial<ItemData> = {}) => ({ id, code, identified: true, quality: 2, socketed: false, ethereal: false, totalSockets: 0, invWidth: 2, invHeight: 2, ...fields }) as unknown as ItemData
const worldWith = (equipped: ItemData[], carried: ItemData[], level = 20) =>
  ({ self: { level, charClass: 2, stats: { get: () => 0 }, skills: new Map(), skillEntries: new Map() }, containers: { equipment: new Map(equipped.map((i) => [i.id, i])), inventory: new Map(carried.map((i) => [i.id, i])), belt: new Map(), stash: new Map(), cube: new Map() }, quests: [] }) as unknown as ClientWorld

describe('artisan rewards', () => {
  it('imbues a class item first, saves the reward rather than spend it early on plain gear, and never picks a magic one', () => {
    const helm = item(1, 'cap', { bodyLoc: 1 })
    const bagArmor = item(2, 'qui')
    const magic = item(3, 'lbt', { quality: 4 })
    const head = item(7, 'ne1', { invWidth: 2, invHeight: 2 })
    expect(artisanPick(worldWith([helm, magic], [bagArmor, head]), 'imbue')?.id).toBe(7)
    expect(artisanPick(worldWith([helm, magic], [bagArmor]), 'imbue')).toBeNull()
    expect(artisanPick(worldWith([helm, magic], [bagArmor], 25), 'imbue')?.id).toBe(1)
    expect(artisanPick(worldWith([magic], [], 25), 'imbue')).toBeNull()
  })

  it('sockets an unsocketed item but skips magic and already socketed ones', () => {
    const unique = item(4, 'qui', { quality: 7, bodyLoc: 3 })
    const socketed = item(5, 'cap', { socketed: true, totalSockets: 2 })
    expect(artisanPick(worldWith([unique], [socketed]), 'add_sockets')?.id).toBe(4)
    expect(artisanPick(worldWith([], [socketed, item(6, 'lbt', { quality: 4 })]), 'add_sockets')).toBeNull()
  })
})
