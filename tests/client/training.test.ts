import { describe, expect, it } from 'vitest'
import { shortestRoute } from '../../src/client/guide/route.ts'
import { TrainingFloor } from '../../src/client/guide/training-floor.ts'
import { bareSlots, lockedLevels, monsterLevel, readiness, setbacksOf, slowGround, trainingGround } from '../../src/client/guide/training.ts'

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

  it('keeps a training level it set earlier, and gives the Chaos Sanctuary a wider margin', () => {
    expect(readiness(me(29), ARCANE, 0, true, 31)).toMatchObject({ level: 31, why: 'Too strong for now, training to level 31' })
    expect(readiness(me(31), ARCANE, 0, true, 31)).toBeNull()
    expect(readiness(me(29), 108, 0)).toMatchObject({ level: monsterLevel(108, 0) + 3 })
  })

  it('remembers the training level across games for the same goal only', () => {
    const saved = new Map<string, string>()
    const store = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => void saved.set(key, value) }
    new TrainingFloor(store).set('AutoSinA:0', 108, 31)
    expect([new TrainingFloor(store).of('AutoSinA:0', 108), new TrainingFloor(store).of('AutoSinA:0', 102), new TrainingFloor(store).of('AutoPalA:0', 108)]).toEqual([31, 0, 0])
  })

  it('never trains in the Durance from the Pandemonium Fortress without its waypoint, since no portal leads back', () => {
    expect(shortestRoute(103, 102, new Set([103, 107]))).toBeNull()
    expect(shortestRoute(103, 102, new Set([103, 101]))?.length).toBeGreaterThan(0)
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

  it('counts a retreat as a quarter of a death and moves on from areas that give too little experience', () => {
    expect(readiness(me(20), ARCANE, setbacksOf(1, 4))).toMatchObject({ level: 22 })
    expect(readiness(me(20), ARCANE, setbacksOf(0, 7))).toBeNull()
    expect(slowGround(20, 500, 5 * 60_000)).toBe(true)
    expect(slowGround(20, 20_000, 5 * 60_000)).toBe(false)
    expect(slowGround(20, 0, 60_000)).toBe(false)
  })

  it('keeps the palace, the Durance and the late act 5 areas off limits until the quest that opens them', () => {
    const words = new Uint16Array(48)
    expect([...lockedLevels(words)]).toEqual(expect.arrayContaining([50, 54, 100, 121, 128]))
    words[12] = 0x0004
    words[18] = 0x0001
    expect(lockedLevels(words).has(52)).toBe(false)
    expect(lockedLevels(words).has(101)).toBe(false)
    expect(lockedLevels(words).has(124)).toBe(true)
  })
  it('never routes training through a level that is still shut', () => {
    const words = new Uint16Array(41)
    words[9] = 0x0001
    const lut = 40, sealed = lockedLevels(words)
    const canyon = (area: number) => (area === 46 ? 1 : 0.01)
    const ground = trainingGround(lut, me(21), new Set([40, 42, 43, 44]), sealed, canyon, sealed)!
    expect(trainingGround(lut, me(21), new Set([40, 42, 43, 44]), new Set([50, 51, 52, 53, 54]), canyon)).toBe(46)
    expect([46, 50, 51, 52, 53, 54, 66]).not.toContain(ground)
    expect(ground).toBeGreaterThan(40)
  })

  it('trains a character with empty gear slots on easier ground', () => {
    const waypoints = new Set([40, 42, 43, 44, 46])
    const dressed = trainingGround(40, me(22), waypoints, new Set())!
    const naked = trainingGround(40, me(22, 50_000, 6), waypoints, new Set())!
    expect(monsterLevel(naked, 0)).toBeLessThanOrEqual(22 - 1 - 9)
    expect(monsterLevel(naked, 0)).toBeLessThan(monsterLevel(dressed, 0))
  })
})
