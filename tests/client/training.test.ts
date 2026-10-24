import { describe, expect, it } from 'vitest'
import { bareSlots, monsterLevel, readiness, setbacksOf, slowGround, trainingGround } from '../../src/client/guide/training.ts'

const BLOOD_MOOR = 2
const COLD_PLAINS = 3
const CATACOMBS_4 = 37
const ARCANE = 74
const me = (level: number, gold = 50_000, bare = 0) => ({ level, gold, bare, difficulty: 0 as const })

describe('training before a hard goal', () => {
  it('trains when the goal area outlevels the character, and after repeated setbacks', () => {
    expect(readiness(me(5), CATACOMBS_4, 0)).toMatchObject({ level: monsterLevel(CATACOMBS_4, 0) - 2 })
    expect(readiness(me(20), ARCANE, 0)).toBeNull()
    expect(readiness(me(20), ARCANE, 2)).toMatchObject({ level: 22, why: 'Too strong for now, training to level 22' })
    expect(readiness(me(20, 100), ARCANE, 0)).toMatchObject({ why: 'Gathering gold for supplies' })
  })

  it('goes gathering gear first when most of the gear slots are empty', () => {
    expect(bareSlots([{ bodyLoc: 4 }, { bodyLoc: 3 }, { bodyLoc: 2 }] as never)).toBe(4)
    expect(readiness(me(20, 50_000, 4), ARCANE, 0)).toMatchObject({ level: 20, bare: 2, why: 'Gathering gear before Arcane Sanctuary' })
    expect(readiness(me(20, 50_000, 2), ARCANE, 0)).toBeNull()
    expect(readiness(me(6, 50_000, 6), BLOOD_MOOR, 0)).toBeNull()
    expect(readiness(me(20, 50_000, 4), ARCANE, 0, false)).toBeNull()
  })

  it('picks a nearby area with monsters just below the character', () => {
    const ground = trainingGround(COLD_PLAINS, me(4), new Set([1, 3]), new Set())!
    expect(monsterLevel(ground, 0)).toBeLessThanOrEqual(3)
    expect(ground).not.toBe(1)
    expect(trainingGround(COLD_PLAINS, me(4), new Set([1, 3]), new Set([ground]))).not.toBe(ground)
    expect(trainingGround(BLOOD_MOOR, me(1), new Set(), new Set())).toBeNull()
  })

  it('goes where it measured the best experience, and tries unmeasured areas before settling', () => {
    const nearest = trainingGround(COLD_PLAINS, me(12), new Set([1, 3, 4]), new Set())!
    const rival = trainingGround(COLD_PLAINS, me(12), new Set([1, 3, 4]), new Set([nearest]))!
    expect(trainingGround(COLD_PLAINS, me(12), new Set([1, 3, 4]), new Set(), (area) => (area === rival ? 0.05 : area === nearest ? 0.01 : undefined))).not.toBe(nearest)
    const everything = (area: number) => (area === rival ? 0.05 : 0.01)
    expect(trainingGround(COLD_PLAINS, me(12), new Set([1, 3, 4]), new Set(), everything)).toBe(rival)
  })

  it('counts a retreat as half a death and moves on from areas that give too little experience', () => {
    expect(readiness(me(20), ARCANE, setbacksOf(1, 2))).toMatchObject({ level: 22 })
    expect(readiness(me(20), ARCANE, setbacksOf(0, 3))).toBeNull()
    expect(slowGround(20, 500, 5 * 60_000)).toBe(true)
    expect(slowGround(20, 20_000, 5 * 60_000)).toBe(false)
    expect(slowGround(20, 0, 60_000)).toBe(false)
  })
})
