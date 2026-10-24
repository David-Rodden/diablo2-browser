import { describe, expect, it } from 'vitest'
import { priorDps, rankFactor, ThreatSense, type Defender } from '../../src/client/input/threat-sense.ts'
import { MONSTER_PATH_IDS } from '../../src/common/path/monster-path-data.ts'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
}
const me: Defender = { name: 'Hero', level: 21, defense: 150, resists: { fire: 0, cold: 0, lightning: 0, poison: 0 }, difficulty: 0, areaId: 74 }
const VAMPIRE = MONSTER_PATH_IDS.indexOf('vampire1')
const ZOMBIE = MONSTER_PATH_IDS.indexOf('zombie1')
const foe = (classId: number) => ({ classId, rank: 'normal' as const, modifiers: [] })

describe('threat sense', () => {
  it('reads a first guess from the monster tables, softened by defense', () => {
    expect(priorDps(VAMPIRE, me)).toBeGreaterThan(priorDps(ZOMBIE, { ...me, areaId: 2 }))
    expect(priorDps(VAMPIRE, { ...me, defense: 3000 })).toBeLessThan(priorDps(VAMPIRE, me))
  })

  it('weighs champions and their affixes', () => {
    expect(rankFactor({ classId: VAMPIRE, rank: 'champion', modifiers: ['strong'] }, 0)).toBeCloseTo(4)
    expect(rankFactor(foe(VAMPIRE), 0)).toBe(1)
  })

  it('learns how hard a monster really hits and trusts it after a while', () => {
    const store = memory()
    const sense = new ThreatSense(store)
    const guess = sense.dpsOf(me, foe(VAMPIRE))
    let [life, now] = [1000, 0]
    for (let second = 0; second <= 60; second++, now += 1000) {
      sense.observe(me, life, () => [foe(VAMPIRE)], now)
      life -= 30
    }
    const learned = sense.danger(me, [foe(VAMPIRE)])
    expect(learned.dps).toBeGreaterThan(guess * 3)
    expect(learned.trusted).toBe(true)
    expect(new ThreatSense(store).dpsOf(me, foe(VAMPIRE))).toBeCloseTo(learned.dps)
    expect(sense.danger({ ...me, name: 'Other' }, [foe(VAMPIRE)]).trusted).toBe(false)
  })

  it('learns that a monster is harmless when nothing is lost near it', () => {
    const sense = new ThreatSense(memory())
    const guess = sense.dpsOf(me, foe(VAMPIRE))
    for (let now = 0; now <= 30_000; now += 1000) sense.observe(me, 500, () => [foe(VAMPIRE)], now)
    expect(sense.dpsOf(me, foe(VAMPIRE))).toBeLessThan(guess / 4)
  })
})
