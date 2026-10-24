import { describe, expect, it } from 'vitest'
import { mercUpgrade } from '../../src/client/guide/merc-gear.ts'
import type { ItemData } from '../../src/netproto/index.ts'

const item = (id: number, code: string, defense: number, extra: Partial<ItemData> = {}) =>
  ({ id, itemId: id, code, rawCode: code, quality: 2, identified: true, defense, stats: [], runewordStats: [], setBonusStats: [], totalSockets: 0, usedSockets: 0, socketedChildCount: 0, runeword: false, invWidth: 2, invHeight: 2, bodyLoc: 0, equippedSlot: 0, flags: 0, rawFlags: 0, container: 'inventory', ...extra }) as ItemData
const ROGUE = 271
const IRON_WOLF = 359
const DESERT = 338
const stats = new Map([[0, 60], [2, 60], [12, 20]])

describe('mercenary gear', () => {
  it('hands over a helm or armor with clearly more defense than the mercenary wears', () => {
    const worn = [item(1, 'cap', 4, { bodyLoc: 1 })]
    expect(mercUpgrade([item(10, 'skp', 9)], { classId: ROGUE, stats, worn })).toMatchObject({ bodyLoc: 1 })
    expect(mercUpgrade([item(10, 'skp', 6)], { classId: ROGUE, stats, worn })).toBeNull()
    expect(mercUpgrade([item(11, 'qui', 15)], { classId: ROGUE, stats, worn })).toMatchObject({ bodyLoc: 3 })
  })

  it('arms each mercenary with weapons of its own kind that hit harder', () => {
    const worn = [item(2, 'spr', 0, { bodyLoc: 4 })]
    expect(mercUpgrade([item(20, 'pik', 0)], { classId: DESERT, stats: new Map(), worn })).toMatchObject({ bodyLoc: 4 })
    expect(mercUpgrade([item(21, 'lbw', 0)], { classId: DESERT, stats: new Map(), worn })).toBeNull()
    expect(mercUpgrade([item(22, 'lbw', 0)], { classId: ROGUE, stats: new Map(), worn: [item(3, 'sbw', 0, { bodyLoc: 4 })] })).toMatchObject({ bodyLoc: 4 })
    expect(mercUpgrade([item(23, '2hs', 0)], { classId: IRON_WOLF, stats: new Map(), worn: [] })).toBeNull()
    expect(mercUpgrade([item(24, 'ssd', 0)], { classId: IRON_WOLF, stats: new Map(), worn: [] })).toMatchObject({ bodyLoc: 4 })
  })

  it('skips class items, gear it cannot carry, and shields for mercenaries without one', () => {
    expect(mercUpgrade([item(12, 'ba1', 20)], { classId: ROGUE, stats, worn: [] })).toBeNull()
    expect(mercUpgrade([item(13, 'plt', 60)], { classId: ROGUE, stats, worn: [] })).toBeNull()
    expect(mercUpgrade([item(14, 'lrg', 12)], { classId: ROGUE, stats, worn: [] })).toBeNull()
    expect(mercUpgrade([item(14, 'lrg', 12)], { classId: IRON_WOLF, stats, worn: [] })).toMatchObject({ bodyLoc: 5 })
  })
})
