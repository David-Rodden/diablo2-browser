import { describe, expect, it } from 'vitest'
import { RAW_MISC } from '../../src/common/data/canonical-drop-data.ts'
import TOWNS from '../../src/client/guide/data/towns.json'

const [head, ...rows] = RAW_MISC.split('\r\n').map((row) => row.split('\t'))
const stocks = (npc: string, code: string) => {
  const name = npc[0]!.toUpperCase() + npc.slice(1)
  const row = rows.find((cells) => cells[head!.indexOf('code')] === code)!
  return [`${name}Min`, `${name}Max`].some((column) => Number(row[head!.indexOf(column)]) > 0)
}

describe('town supply vendors', () => {
  it('sell town portal scrolls and healing potions in every act', () => {
    expect(Object.entries(TOWNS).filter(([, town]) => !['tsc', 'isc', 'hp1', 'mp1'].every((code) => stocks(town.potions, code))).map(([name]) => name)).toEqual([])
    expect(stocks('lysander', 'tsc')).toBe(false)
  })
})
