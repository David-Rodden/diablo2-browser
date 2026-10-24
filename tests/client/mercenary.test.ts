import { describe, expect, it } from 'vitest'
import { SKILLS_CATALOG } from '../../src/common/data/skills-catalog.ts'
import { hireIdOf, pickMercenary } from '../../src/client/guide/mercenary.ts'

const skill = (name: string) => SKILLS_CATALOG.find((entry) => entry.name === name)!.id
const merc = (mercId: number, cost: number, level: number, skills: readonly string[]) => ({ mercId, nameId: mercId + 100, name: `Merc ${mercId}`, cost, level, hp: level * 10, skills: skills.map(skill) })

describe('hiring a mercenary', () => {
  it('prefers the strongest aura it can afford, then the higher level', () => {
    const offered = [merc(1, 1000, 20, ['Prayer']), merc(2, 1500, 18, ['Might']), merc(3, 9000, 25, ['Holy Freeze']), merc(4, 900, 21, ['Prayer'])]
    expect(pickMercenary(offered, 3000)?.mercId).toBe(2)
    expect(pickMercenary(offered, 1500)?.mercId).toBe(4)
    expect(pickMercenary(offered, 1000)).toBeNull()
    expect(hireIdOf(offered[0]!)).toBe(101)
  })
})
