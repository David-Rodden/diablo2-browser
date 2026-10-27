import { describe, expect, it } from 'vitest'
import { lifeCap, lifeShare } from '../../src/client/input/life-cap.ts'

describe('lifeCap', () => {
  it('judges life against what the server heals to under Battle Orders', () => {
    expect(lifeCap({ maxHp: 576, healableHp: 400 }, 377)).toBe(400)
    expect(lifeShare({ maxHp: 576, healableHp: 400 }, { life: 400, maxLife: 377 })).toBe(1)
  })

  it('caps a freshly boosted pool at full', () => {
    expect(lifeShare({ maxHp: 576, healableHp: 400 }, { life: 554, maxLife: 377 })).toBe(1)
  })

  it('falls back to the world max before the HUD syncs', () => {
    expect(lifeCap({ maxHp: 0, healableHp: 0 }, 377)).toBe(377)
    expect(lifeShare({ maxHp: 0, healableHp: 0 }, { life: 188, maxLife: 377 })).toBeCloseTo(0.5, 2)
  })
})
