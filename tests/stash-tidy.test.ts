import { describe, expect, it } from 'vitest'
import { characterBuild } from '../src/common/items/character-build.ts'
import type { Appraisal } from '../src/common/items/loot-appraisal.ts'
import type { LootItem } from '../src/common/items/loot-item.ts'
import { runeCube, surplus, type Holding } from '../src/common/items/stash-tidy.ts'

const barb = characterBuild({ classIndex: 4, level: 24, strength: 60, dexterity: 30, skillPoints: new Map([[126, 10], [139, 5]]) })

let nextId = 1
const held = (code: string, appraisal: Partial<Appraisal>, identified = true): Holding => ({
  item: { id: nextId++, code, identified } as LootItem,
  appraisal: { tier: 'good', kind: 'rare', score: 10, reason: '', locked: false, ...appraisal },
})

describe('stash tidying', () => {
  it('cubes three spare low runes into the next one, keeping what its runewords need', () => {
    const nef = (n: number) => Array.from({ length: n }, () => held('r04', { kind: 'rune' }))
    expect(runeCube([...nef(4)], barb)).toEqual({ rune: 'r04', makes: 'r05', count: 3 })
    expect(runeCube([...nef(3)], barb)).toBeNull()
    expect(runeCube([...nef(5), ...Array.from({ length: 3 }, () => held('r01', { kind: 'rune' }))], barb)).toMatchObject({ rune: 'r04' })
    expect(runeCube(Array.from({ length: 6 }, () => held('r10', { kind: 'rune' })), barb)).toBeNull()
  })

  it('keeps the best few jewels, gems and rings and sells the rest', () => {
    const jewels = [50, 40, 30, 25, 22, 21].map((score) => held('jew', { kind: 'jewel', score }))
    const rings = [30, 20, 10].map((score) => held('rin', { kind: 'rare', score }))
    const spare = surplus([...jewels, ...rings])
    expect(jewels.filter((h) => spare.has(h.item.id)).map((h) => h.appraisal.score)).toEqual([22, 21])
    expect(rings.filter((h) => spare.has(h.item.id)).map((h) => h.appraisal.score)).toEqual([10])
  })

  it('sells gear that is no upgrade, but never upgrades, bases, great finds or unidentified items', () => {
    const plain = held('lsd', { kind: 'rare', tier: 'keep', reason: 'Worth 90 to your build' })
    const kept = [
      held('lsd', { kind: 'rare', tier: 'keep', reason: 'Better weapon at level 26' }),
      held('lsd', { kind: 'base', tier: 'good', reason: 'Base for Steel · 2 sockets' }),
      held('uap', { kind: 'unique', tier: 'great' }),
      held('lsd', { kind: 'rare', tier: 'good', upgradeSlot: 'weapon1' }),
      held('lsd', { kind: 'rare', tier: 'keep' }, false),
      held('pa1', { kind: 'rare', tier: 'good', reason: '+2 to your Combat Skills' }),
    ]
    expect([...surplus([plain, ...kept])]).toEqual([plain.item.id])
  })
})
