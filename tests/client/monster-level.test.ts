import { describe, expect, it } from 'vitest'
import { getLevelMonsterLevel113c } from '../../src/common/world/levels-monlvl-113c.ts'
import { monsterLevelOf, titleWithLevel } from '../../src/client/ui/monster-level.ts'

const FALLEN = 19
const ANDARIEL = 156
const BLOOD_MOOR = 2
const CATACOMBS_4 = 37

describe('monster level', () => {
  it('uses the monster level on Normal and the area level on Nightmare and Hell', () => {
    expect(monsterLevelOf(FALLEN, 'normal', 0, BLOOD_MOOR)).toBe(1)
    expect(monsterLevelOf(FALLEN, 'normal', 2, BLOOD_MOOR)).toBe(getLevelMonsterLevel113c(BLOOD_MOOR, 2))
  })

  it('adds the champion and unique bonus, but keeps act bosses at their own level', () => {
    expect(monsterLevelOf(FALLEN, 'champion', 0, BLOOD_MOOR)).toBe(3)
    expect(monsterLevelOf(FALLEN, 'unique', 0, BLOOD_MOOR)).toBe(4)
    expect(monsterLevelOf(FALLEN, 'minion', 0, BLOOD_MOOR)).toBe(4)
    expect(monsterLevelOf(ANDARIEL, 'boss', 2, CATACOMBS_4)).toBe(75)
  })

  it('puts the level after the name in the health bar title', () => {
    expect(titleWithLevel({ paddedTitle: '  Fallen  ', titleColor: 'white' }, 3).paddedTitle).toBe('  Fallen (Lv 3)  ')
    expect(titleWithLevel({ paddedTitle: '  Fallen  ' }, undefined).paddedTitle).toBe('  Fallen  ')
  })
})
