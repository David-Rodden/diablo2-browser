import type { EquipSlotId } from '../../common/items/inventory-model.ts'
import { onlineItemDataToUiInventoryItem } from '../../common/items/item-bridge.ts'
import type { ItemData } from '../../netproto/index.ts'
import GEAR from './data/merc-gear.json'

export interface Hireling {
  readonly classId: number
  readonly stats: ReadonlyMap<number, number>
  readonly worn: Iterable<ItemData>
}

const SLOTS = GEAR.slots as Readonly<Partial<Record<EquipSlotId, number>>>
const SHIELD_USERS = new Set(Object.values(GEAR.shieldUsers))

const defenseOf = (item: ItemData) => onlineItemDataToUiInventoryItem(item).defense ?? 0

function wearable(item: ItemData, merc: Hireling): boolean {
  const ui = onlineItemDataToUiInventoryItem(item)
  const stat = (key: keyof typeof GEAR.stats) => merc.stats.get(GEAR.stats[key])
  const within = (need: number | undefined, have: number | undefined) => (need ?? 0) <= 0 || have === undefined || need! <= have
  return ui.reqClass === undefined && within(ui.reqStr, stat('strength')) && within(ui.reqDex, stat('dexterity')) && within(ui.reqLevel, stat('level'))
}

export function mercUpgrade(carried: Iterable<ItemData>, merc: Hireling): { readonly item: ItemData; readonly bodyLoc: number } | null {
  const worn = new Map([...merc.worn].map((item) => [item.bodyLoc || item.equippedSlot, item]))
  const slotsFor = (item: ItemData) =>
    onlineItemDataToUiInventoryItem(item).allowedSlots.flatMap((slot) => {
      const bodyLoc = SLOTS[slot]
      return bodyLoc === undefined || (slot === 'weapon2' && (!SHIELD_USERS.has(merc.classId) || onlineItemDataToUiInventoryItem(item).oneHandDamage !== undefined)) ? [] : [bodyLoc]
    })
  return (
    [...carried]
      .filter((item) => item.identified && wearable(item, merc))
      .flatMap((item) => slotsFor(item).map((bodyLoc) => ({ item, bodyLoc, gain: defenseOf(item) - (worn.get(bodyLoc) ? defenseOf(worn.get(bodyLoc)!) : 0) })))
      .filter((offer) => offer.gain >= GEAR.minGain)
      .sort((a, b) => b.gain - a.gain)[0] ?? null
  )
}
