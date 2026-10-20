import { describe, expect, it } from 'vitest'
import { planGuide, type PathGuideHost } from '../../src/client/guide/path-guide.ts'
import { actOfLevel, currentGoal, nextStep, shortestRoute } from '../../src/client/guide/route.ts'
import type { LevelView } from '../../src/client/map/level-view.ts'
import type { ClientUnit } from '../../src/client/world/client-unit.ts'

const quests = (done: Record<number, number> = {}) => Object.assign(new Array(41).fill(0), done)

describe('path guide route', () => {
  it('follows the quest log in story order and skips side quests when asked', () => {
    expect(currentGoal(1, quests())).toEqual({ level: 8, title: 'Den of Evil' })
    expect(currentGoal(2, quests({ 1: 1 }))).toEqual({ level: 17, title: "Sisters' Burial Grounds" })
    expect(currentGoal(1, quests(), 'required')).toEqual({ level: 37, title: 'Sisters to the Slaughter' })
    expect(currentGoal(8, quests({ 1: 2 }))).toEqual({ level: 1, title: 'Den of Evil: collect your reward', inTown: true })
    expect(currentGoal(37, quests({ 6: 1 }), 'required')).toEqual({ level: 40, title: 'Travel to Act II' })
    expect(actOfLevel(108)).toBe(3)
  })

  it('walks level by level, and names the portal or waypoint when that is the way', () => {
    expect(shortestRoute(1, 8)).toEqual([1, 2, 8])
    expect(nextStep(1, 8)).toEqual({ kind: 'exit', level: 2 })
    expect(nextStep(8, 8)).toEqual({ kind: 'arrived', level: 8 })
    expect(nextStep(1, 40)).toEqual({ kind: 'portal', level: 40, hint: 'Talk to Warriv' })
    expect(nextStep(1, 25, new Set([3]))).toEqual({ kind: 'waypoint', level: 5 })
    expect(nextStep(1, 25)).toEqual({ kind: 'exit', level: 2 })
  })
})

describe('path guide plan', () => {
  const size = 40
  const walkable = new Uint8Array(size * size).fill(1)
  for (let y = 0; y < 30; y++) walkable[y * size + 20] = 0
  const view = {
    originX: 1000, originY: 2000, subOriginX: 1000, subOriginY: 2000, subWidth: size, subHeight: size, walkable,
    entrances: [{ x: 7, y: 1, interiorX: 7, interiorY: 2, toLevelId: 3, side: null, kind: 'gate' }],
    landmarks: [], presetUnits: [],
  } as unknown as LevelView
  const door = { id: 9, unitType: 'object', classId: 13, mode: 0, x: 1020, y: 2031, hidden: false, dead: false, objectMeta: { isDoor: true, hasCollisionMask: 1 } } as unknown as ClientUnit
  const host: PathGuideHost = {
    areaId: () => 2,
    self: () => ({ x: 1005, y: 2035, isDead: false }),
    quests: () => quests({ 1: 1, 2: 1 }),
    waypoints: () => new Set(),
    levelView: () => view,
    objects: () => [door],
    toScreen: (x, y) => ({ x, y }),
    automap: () => null,
  }

  it('routes around walls to the exit and rings the closed doors on the way', () => {
    const plan = planGuide(host, 'story')!
    expect([plan.goal.title, plan.hint, plan.target]).toEqual(['Search for Cain', 'Head to Cold Plains', { x: 1037, y: 2007, label: 'Cold Plains' }])
    expect(plan.path.some((p) => p.y >= 2030 && Math.abs(p.x - 1020) <= 1)).toBe(true)
    expect(plan.path.at(-1)).toEqual({ x: 1037, y: 2007 })
    expect(plan.doors).toEqual([9])
  })

  it('aims a seam exit at the open gap in the fence, not at the anchor tile', () => {
    const fenced = new Uint8Array(size * size).fill(1)
    for (let x = 0; x < size; x++) if (x < 24 || x > 28) fenced[x] = fenced[size + x] = fenced[2 * size + x] = 0
    const seam = { ...view, walkable: fenced, entrances: [{ x: 2, y: 0, interiorX: 2, interiorY: 1, toLevelId: 3, side: 'north', kind: 'gate', span: { from: 0, to: 8 } }] } as unknown as LevelView
    expect(planGuide({ ...host, levelView: () => seam }, 'story')!.target).toEqual({ x: 1026, y: 2000, label: 'Cold Plains' })
  })

  it('stays quiet while dead', () => {
    expect(planGuide({ ...host, self: () => ({ x: 1005, y: 2035, isDead: true }) }, 'story')).toBeNull()
  })
})
