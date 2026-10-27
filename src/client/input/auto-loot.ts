import type { ItemData } from '../../netproto/index.ts'
import { GEM_INFO } from '../../common/items/gems-data.ts'
import { TIER_RANK, type Appraisal, type LootTier } from '../../common/items/loot-appraisal.ts'

export interface LootCategories {
  readonly runes: boolean
  readonly uniques: boolean
  readonly sets: boolean
  readonly rares: boolean
  readonly charms: boolean
  readonly jewels: boolean
  readonly gems: boolean
}

export type AutoLootRules = { readonly mode: 'smart'; readonly minTier: LootTier } | ({ readonly mode: 'categories' } & LootCategories)

const INVENTORY_COLUMNS = 10
const INVENTORY_ROWS = 4
const FLAWLESS = 4
const MAX_DROPPED_RANK = TIER_RANK.keep

const CATEGORY_OF_KIND: Partial<Record<Appraisal['kind'], keyof LootCategories>> = { rune: 'runes', unique: 'uniques', set: 'sets', rare: 'rares', charm: 'charms', jewel: 'jewels', gem: 'gems' }

const inCategory = (rules: LootCategories, { code }: Pick<ItemData, 'code'>, { kind }: Appraisal): boolean => {
  const category = CATEGORY_OF_KIND[kind]
  return category !== undefined && rules[category] && (kind !== 'gem' || (GEM_INFO[code.trim().toLowerCase()]?.tier ?? 0) >= FLAWLESS)
}

export const isWantedLoot = (rules: AutoLootRules, item: Pick<ItemData, 'code'>, appraisal: Appraisal): boolean =>
  rules.mode === 'smart' ? appraisal.kind !== 'gold' && appraisal.kind !== 'consumable' && TIER_RANK[appraisal.tier] >= TIER_RANK[rules.minTier] : inCategory(rules, item, appraisal)

export type Placed = Pick<ItemData, 'id' | 'gridX' | 'gridY' | 'invWidth' | 'invHeight'>

const cellsOf = (item: Pick<Placed, 'gridX' | 'gridY' | 'invWidth' | 'invHeight'>, columns = INVENTORY_COLUMNS): number[] =>
  [...Array(Math.max(1, item.invHeight)).keys()].flatMap((dy) => [...Array(Math.max(1, item.invWidth)).keys()].map((dx) => (item.gridY + dy) * columns + item.gridX + dx))

export function freeSpots(items: Iterable<Placed>, width: number, height: number, columns = INVENTORY_COLUMNS, rows = INVENTORY_ROWS): { readonly x: number; readonly y: number }[] {
  const taken = new Set([...items].flatMap((item) => cellsOf(item, columns)))
  const spots = [...Array(Math.max(0, rows - height + 1)).keys()].flatMap((y) => [...Array(Math.max(0, columns - width + 1)).keys()].map((x) => ({ x, y })))
  return spots.filter(({ x, y }) => cellsOf({ gridX: x, gridY: y, invWidth: width, invHeight: height }, columns).every((cell) => !taken.has(cell)))
}

export const fitsInInventory = (items: Iterable<Placed>, width: number, height: number): boolean => freeSpots(items, width, height).length > 0

export interface Move {
  readonly itemId: number
  readonly x: number
  readonly y: number
}

export type RoomPlan = { readonly kind: 'fits' } | { readonly kind: 'move'; readonly moves: readonly Move[] } | { readonly kind: 'drop'; readonly itemIds: readonly number[] }

const SHAPES = [[2, 4], [2, 3], [2, 2], [1, 3], [1, 2], [1, 1]] as const
const MAX_MOVES = 12

const placedAt = <T extends Placed>(item: T, spot: { readonly x: number; readonly y: number }): T => ({ ...item, gridX: spot.x, gridY: spot.y })
const columnFirst = (spots: readonly { readonly x: number; readonly y: number }[]) => [...spots].sort((a, b) => a.x - b.x || a.y - b.y)
const cellsTaken = (items: readonly Placed[]) => new Set(items.flatMap((item) => cellsOf(item)))

export function packed<T extends Placed>(items: readonly T[]): T[] | null {
  return [...items]
    .sort((a, b) => b.invWidth * b.invHeight - a.invWidth * a.invHeight || b.invHeight - a.invHeight || a.id - b.id)
    .reduce<T[] | null>((placed, item) => {
      const spot = placed && columnFirst(freeSpots(placed, item.invWidth, item.invHeight))[0]
      return placed && spot ? [...placed, placedAt(item, spot)] : null
    }, [])
}

export function movesTo(items: readonly Placed[], target: readonly Placed[]): Move[] | null {
  const goals = new Map(target.map((item) => [item.id, item]))
  let current = [...items]
  const moves: Move[] = []
  const shift = (item: Placed, spot: { readonly x: number; readonly y: number }) => {
    current = current.map((other) => (other.id === item.id ? placedAt(other, spot) : other))
    moves.push({ itemId: item.id, x: spot.x, y: spot.y })
  }
  while (moves.length <= items.length * 2) {
    const pending = current.filter((item) => goals.get(item.id)?.gridX !== item.gridX || goals.get(item.id)?.gridY !== item.gridY)
    if (pending.length === 0) return moves
    const others = (item: Placed) => current.filter((other) => other.id !== item.id)
    const ready = pending.find((item) => { const goal = goals.get(item.id)!; return freeSpots(others(item), item.invWidth, item.invHeight).some(({ x, y }) => x === goal.gridX && y === goal.gridY) })
    if (ready) {
      shift(ready, { x: goals.get(ready.id)!.gridX, y: goals.get(ready.id)!.gridY })
      continue
    }
    const reserved = cellsTaken(pending.map((item) => goals.get(item.id)!))
    const parking = pending.flatMap((item) => freeSpots(others(item), item.invWidth, item.invHeight).filter((spot) => !cellsOf(placedAt(item, spot)).some((cell) => reserved.has(cell)) && (spot.x !== item.gridX || spot.y !== item.gridY)).map((spot) => ({ item, spot })))[0]
    if (!parking) return null
    shift(parking.item, parking.spot)
  }
  return null
}

export const roomShape = (items: readonly Placed[]): number => {
  const index = SHAPES.findIndex(([width, height]) => fitsInInventory(items, width, height))
  return index < 0 ? SHAPES.length : index
}

export function tidyMoves(items: readonly Placed[]): Move[] | null {
  const target = packed(items)
  const moves = target && roomShape(target) < roomShape(items) ? movesTo(items, target) : null
  return moves && moves.length <= MAX_MOVES ? moves : null
}

function repacked(items: readonly Placed[], width: number, height: number): Move[] | null {
  const target = packed(items)
  const moves = target && fitsInInventory(target, width, height) ? movesTo(items, target) : null
  return moves && moves.length <= MAX_MOVES ? moves : null
}

export interface JudgedItem extends Placed {
  readonly appraisal: Appraisal
}

const rankOf = ({ appraisal }: JudgedItem) => TIER_RANK[appraisal.tier] * 1000 + appraisal.score

export function planRoom(items: readonly JudgedItem[], width: number, height: number, incoming: Appraisal, allowDrops: boolean): RoomPlan | null {
  if (fitsInInventory(items, width, height)) return { kind: 'fits' }
  const without = (gone: readonly JudgedItem[]) => items.filter((item) => !gone.includes(item))
  const move = items
    .flatMap((item) => freeSpots(without([item]), item.invWidth, item.invHeight).filter(({ x, y }) => x !== item.gridX || y !== item.gridY).map((spot) => ({ item, spot })))
    .find(({ item, spot }) => fitsInInventory([...without([item]), { ...item, gridX: spot.x, gridY: spot.y }], width, height))
  if (move) return { kind: 'move', moves: [{ itemId: move.item.id, x: move.spot.x, y: move.spot.y }] }
  const moves = repacked(items, width, height)
  if (moves) return { kind: 'move', moves }
  if (!allowDrops) return null
  const quest = incoming.kind === 'quest'
  const expendable = items.filter(({ appraisal }) => !appraisal.locked && appraisal.kind !== 'quest' && (quest ? TIER_RANK[appraisal.tier] < TIER_RANK.great : TIER_RANK[appraisal.tier] <= MAX_DROPPED_RANK && TIER_RANK[appraisal.tier] < TIER_RANK[incoming.tier])).sort((a, b) => rankOf(a) - rankOf(b))
  const single = expendable.find((item) => fitsInInventory(without([item]), width, height))
  if (single) return { kind: 'drop', itemIds: [single.id] }
  const greedy = expendable.reduce<JudgedItem[]>((dropped, item) => (fitsInInventory(without(dropped), width, height) ? dropped : [...dropped, item]), [])
  if (!fitsInInventory(without(greedy), width, height)) return null
  const needed = [...greedy].reverse().reduce((dropped, item) => (fitsInInventory(without(dropped.filter((other) => other !== item)), width, height) ? dropped.filter((other) => other !== item) : dropped), greedy)
  return { kind: 'drop', itemIds: needed.map(({ id }) => id) }
}
