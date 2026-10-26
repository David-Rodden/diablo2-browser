import { describe, expect, it } from 'vitest'
import { gamblePick, gambleReserve } from '../../src/client/guide/gambling.ts'
import type { ItemData } from '../../src/netproto/index.ts'

const offer = (id: number, code: string, invWidth = 1, invHeight = 1) => ({ id, code, invWidth, invHeight }) as ItemData
const prices: Record<string, number> = { rin: 9000, amu: 14000, ci0: 6000, lbl: 3000, cap: 2500 }
const price = (item: ItemData) => prices[item.code] ?? Infinity
const always = () => true

describe('gambling', () => {
  it('fills an empty slot first, then goes for rings and amulets, then circlets', () => {
    const offered = [offer(1, 'amu'), offer(2, 'rin'), offer(3, 'ci0', 2, 2), offer(4, 'lbl', 2, 1), offer(5, 'cap', 2, 2)]
    expect(gamblePick(offered, new Set(['belt']), 50_000, price, always)?.id).toBe(4)
    expect(gamblePick(offered, new Set(), 50_000, price, always)?.id).toBe(2)
    expect(gamblePick(offered, new Set(), 8000, price, always)?.id).toBe(3)
    expect(gamblePick(offered, new Set(), 5000, price, always)).toBeNull()
    expect(gamblePick(offered, new Set(), 50_000, price, (item) => item.invWidth === 1 && item.code !== 'rin')?.id).toBe(1)
  })

  it('only gambles for the empty slots while the body is bare, and never sinks most of the fund into one ring', () => {
    const offered = [offer(1, 'amu'), offer(2, 'rin'), offer(4, 'lbl', 2, 1)]
    expect(gamblePick(offered, new Set(['belt']), 50_000, price, always, { fillFirst: true })?.id).toBe(4)
    expect(gamblePick(offered, new Set(['armor']), 50_000, price, always, { fillFirst: true })).toBeNull()
    expect(gamblePick(offered, new Set(), 50_000, price, always, { treat: 8000 })).toBeNull()
    expect(gamblePick(offered, new Set(), 50_000, price, always, { treat: 10_000 })?.id).toBe(2)
  })

  it('keeps a reserve that grows with level', () => {
    expect(gambleReserve(20)).toBeLessThan(gambleReserve(40))
  })
})
