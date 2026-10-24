import type { EquipSlotId } from '../../common/items/inventory-model.ts'
import { equipSlotsOf } from '../../common/items/loot-appraisal.ts'
import type { ItemData } from '../../netproto/index.ts'
import GAMBLING from './data/gambling.json'

export const GAMBLING_RULES = GAMBLING

const JEWELLERY = new Set(GAMBLING.jewellery)
const CIRCLETS = new Set(GAMBLING.circlets)

export const gambleReserve = (level: number) => GAMBLING.reserve.base + level * GAMBLING.reserve.perLevel

const rankOf = (item: ItemData, bare: ReadonlySet<EquipSlotId>) => {
  const code = item.code.trim()
  return equipSlotsOf(item).some((slot) => bare.has(slot)) ? 0 : JEWELLERY.has(code) ? 1 : CIRCLETS.has(code) ? 2 : null
}

export function gamblePick(offered: Iterable<ItemData>, bare: ReadonlySet<EquipSlotId>, budget: number, price: (item: ItemData) => number, fits: (item: ItemData) => boolean): ItemData | null {
  return (
    [...offered]
      .map((item) => ({ item, rank: rankOf(item, bare), cost: price(item) }))
      .filter((offer): offer is { item: ItemData; rank: number; cost: number } => offer.rank !== null && offer.cost <= budget && fits(offer.item))
      .sort((a, b) => a.rank - b.rank || a.cost - b.cost)[0]?.item ?? null
  )
}
