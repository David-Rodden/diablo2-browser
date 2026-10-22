import { describe, expect, it } from 'vitest'
import { SKILLS_CATALOG } from '../../src/common/data/skills-catalog.ts'
import { MONSTER_PATH_IDS } from '../../src/common/path/monster-path-data.ts'
import { STATE_OVERLAY_ROWS_113C } from '../../src/common/skills/skill-state-overlays-113c.ts'
import { attackSkill, auraSkill, BASIC_ATTACK, supportSkill, type CombatSelf, type CombatTarget } from '../../src/client/input/combat-planner.ts'

const id = (name: string) => SKILLS_CATALOG.find((skill) => skill.name === name)!.id
const state = (name: string) => STATE_OVERLAY_ROWS_113C.find((row) => row.state === name)!.id
const noStates = { has: () => false }
const character = (skills: Record<string, number>, extra: Partial<CombatSelf> = {}): CombatSelf => ({
  skills: new Map(Object.entries(skills).map(([name, level]) => [id(name), level])),
  mainSkills: [],
  states: noStates,
  petClasses: [],
  lifeFraction: 1,
  ...extra,
})
const monster = (extra: Partial<CombatTarget> = {}): CombatTarget => ({ distance: 6, resists: {}, states: noStates, trapsNear: 0, ...extra })
const anything = () => true

describe('combat planner', () => {
  const sorc = character({ 'Fire Ball': 20, 'Frozen Orb': 4, 'Ice Bolt': 1, 'Frozen Armor': 1, 'Shiver Armor': 5, Teleport: 1 }, { mainSkills: [id('Fire Ball')] })

  it('casts the main attack, and switches element on a monster immune to it', () => {
    expect(attackSkill(sorc, monster(), anything)).toEqual({ skillId: id('Fire Ball'), hand: 'left', reach: 'ranged', on: 'target' })
    expect(attackSkill(sorc, monster({ resists: { fire: 100 } }), anything).skillId).toBe(id('Frozen Orb'))
    expect(attackSkill(sorc, monster({ resists: { fire: 100, cold: 100 } }), anything).skillId).toBe(BASIC_ATTACK)
  })

  it('prefers the stronger of two equally trained attacks, but not one with a cooldown', () => {
    const fire = character({ 'Fire Bolt': 20, 'Fire Ball': 20, Meteor: 20 }, { mainSkills: [id('Fire Bolt'), id('Fire Ball'), id('Meteor')] })
    expect(attackSkill(fire, monster(), anything).skillId).toBe(id('Fire Ball'))
  })

  it('falls back to a plain attack when nothing can be cast', () => {
    expect(attackSkill(sorc, monster(), () => false)).toMatchObject({ skillId: BASIC_ATTACK, hand: 'left', reach: 'melee' })
  })

  it('keeps only the strongest armor of a kind up, and stops once it is on', () => {
    expect(supportSkill(sorc, null, anything)).toMatchObject({ skillId: id('Shiver Armor'), hand: 'right', on: 'self' })
    expect(supportSkill({ ...sorc, states: { has: (s) => s === state('shiverarmor') } }, null, anything)).toBeNull()
  })

  it('shouts the barbarian warcries in order', () => {
    const barb = character({ 'Battle Command': 1, 'Battle Orders': 10, Shout: 5, Bash: 8 })
    const shouted = (names: string[]) => supportSkill({ ...barb, states: { has: (s) => names.map(state).includes(s) } }, null, anything)?.skillId
    expect([shouted([]), shouted(['battlecommand']), shouted(['battlecommand', 'battleorders']), shouted(['battlecommand', 'battleorders', 'shout'])]).toEqual([id('Battle Command'), id('Battle Orders'), id('Shout'), undefined])
  })

  it('summons a Valkyrie only while she is gone, and curses the target before attacking', () => {
    const zon = character({ Valkyrie: 5, Strafe: 15 })
    expect(supportSkill(zon, null, anything)?.skillId).toBe(id('Valkyrie'))
    expect(supportSkill({ ...zon, petClasses: [MONSTER_PATH_IDS.indexOf('valkyrie')] }, null, anything)).toBeNull()
    const necro = character({ 'Amplify Damage': 3, 'Bone Spear': 10 })
    expect(supportSkill(necro, monster(), anything)).toMatchObject({ skillId: id('Amplify Damage'), on: 'target' })
    expect(supportSkill(necro, monster({ states: { has: (s) => s === state('amplifydamage') } }), anything)).toBeNull()
  })

  it('lays assassin traps up to five near the target', () => {
    const sin = character({ 'Lightning Sentry': 12, 'Death Sentry': 6 })
    expect(supportSkill(sin, monster(), anything)?.skillId).toBe(id('Lightning Sentry'))
    expect(supportSkill(sin, monster({ trapsNear: 5 }), anything)).toBeNull()
    expect(supportSkill(sin, monster({ distance: 30 }), anything)).toBeNull()
  })

  it('gets close for hammers and picks the paladin aura for the moment', () => {
    const hammerdin = character({ 'Blessed Hammer': 20, Concentration: 20, Vigor: 10, Prayer: 1, 'Holy Shield': 1 })
    expect(attackSkill(hammerdin, monster(), anything)).toMatchObject({ skillId: id('Blessed Hammer'), reach: 'close', hand: 'left' })
    expect([auraSkill(hammerdin, true, anything), auraSkill(hammerdin, false, anything), auraSkill({ ...hammerdin, lifeFraction: 0.3 }, true, anything)]).toEqual([id('Concentration'), id('Vigor'), id('Prayer')])
  })
})
