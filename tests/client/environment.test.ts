import { describe, expect, it } from 'vitest'
import { buffRank, worthUsing } from '../../src/client/guide/environment.ts'
import type { ClientUnit } from '../../src/client/world/client-unit.ts'

const object = (classId: number, fields: Partial<ClientUnit> = {}) => ({ unitType: 'object', classId, mode: 0, flags: 0, ...fields }) as ClientUnit
const me = (fields: Partial<{ life: number; mana: number; states: ReadonlySet<number>; looting: boolean }> = {}) => ({ life: 1, mana: 1, states: new Set<number>(), looting: true, ...fields })
const CASKET = 5
const SHRINE = 2
const WELL = 130
const BARREL = 7

describe('making the most of the area', () => {
  it('opens chests while it can carry loot, but not once they are open', () => {
    expect(worthUsing(object(CASKET), me())).toMatch(/^Opening the /)
    expect(worthUsing(object(CASKET), me({ looting: false }))).toBeNull()
    expect(worthUsing(object(CASKET, { mode: 2 }), me())).toBeNull()
    expect(worthUsing(object(BARREL), me())).toBeNull()
  })

  it('takes a better shrine than the one it has, and never a harmful one', () => {
    expect(worthUsing(object(SHRINE, { interactType: 15 }), me())).toBe('Using the Experience Shrine')
    expect(worthUsing(object(SHRINE, { interactType: 6 }), me({ states: new Set([137]) }))).toBeNull()
    expect(worthUsing(object(SHRINE, { interactType: 15 }), me({ states: new Set([128]) }))).toBe('Using the Experience Shrine')
    expect([19, 20, 21, 22, 4, 16, 17].map((code) => worthUsing(object(SHRINE, { interactType: code }), me()))).toEqual(Array(7).fill(null))
    expect(buffRank(new Set([129, 131]))).toBe(7)
  })

  it('drinks from wells and refill shrines only when it needs to', () => {
    expect(worthUsing(object(WELL), me({ life: 0.5 }))).toBe('Drinking from the well')
    expect(worthUsing(object(WELL), me())).toBeNull()
    expect(worthUsing(object(SHRINE, { flags: 2 }), me({ life: 0.5 }))).toBe('Using the Health Shrine')
    expect(worthUsing(object(SHRINE, { flags: 3 }), me({ life: 0.5 }))).toBeNull()
    expect(worthUsing(object(SHRINE, { interactType: 1 }), me({ mana: 0.2 }))).toBe('Using the Refilling Shrine')
  })
})
