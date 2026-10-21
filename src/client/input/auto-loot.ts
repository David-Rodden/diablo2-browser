import type { ItemData } from '../../netproto/index.ts'

export interface AutoLootRules {
  readonly runes: boolean
  readonly uniques: boolean
  readonly sets: boolean
  readonly rares: boolean
  readonly charms: boolean
  readonly jewels: boolean
  readonly gems: boolean
}

const INVENTORY_COLUMNS = 10
const INVENTORY_ROWS = 4
const RUNE = /^r(0[1-9]|[12]\d|3[0-3])$/
const CHARMS = new Set(['cm1', 'cm2', 'cm3'])
const GOOD_GEMS = new Set(['gzv', 'glw', 'glg', 'glr', 'glb', 'gly', 'skl', 'gpv', 'gpw', 'gpg', 'gpr', 'gpb', 'gpy', 'skz'])
const [SET, RARE, UNIQUE] = [5, 6, 7]

type LootItem = Pick<ItemData, 'code' | 'quality'>

export const isWantedLoot = (rules: AutoLootRules, { code, quality }: LootItem): boolean => {
  const c = code.trim().toLowerCase()
  return (
    (rules.runes && RUNE.test(c)) ||
    (rules.uniques && quality === UNIQUE) ||
    (rules.sets && quality === SET) ||
    (rules.rares && quality === RARE) ||
    (rules.charms && CHARMS.has(c)) ||
    (rules.jewels && c === 'jew') ||
    (rules.gems && GOOD_GEMS.has(c))
  )
}

type Placed = Pick<ItemData, 'gridX' | 'gridY' | 'invWidth' | 'invHeight'>

export function fitsInInventory(items: Iterable<Placed>, width: number, height: number): boolean {
  const taken = new Set<number>()
  for (const item of items) {
    for (let dy = 0; dy < Math.max(1, item.invHeight); dy++) for (let dx = 0; dx < Math.max(1, item.invWidth); dx++) taken.add((item.gridY + dy) * INVENTORY_COLUMNS + item.gridX + dx)
  }
  const freeAt = (x: number, y: number) => [...Array(height).keys()].every((dy) => [...Array(width).keys()].every((dx) => !taken.has((y + dy) * INVENTORY_COLUMNS + x + dx)))
  return [...Array(INVENTORY_ROWS - height + 1).keys()].some((y) => [...Array(INVENTORY_COLUMNS - width + 1).keys()].some((x) => freeAt(x, y)))
}
