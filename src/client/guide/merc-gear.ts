import type { EquipSlotId } from '../../common/items/inventory-model.ts'
import { getEmbeddedDropTables } from '../../common/items/embedded-drop-tables.ts'
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
const WEAPONS = Object.values(GEAR.weapons)
const WEAPON_SLOT = GEAR.slots.weapon1

const ui = (item: ItemData) => onlineItemDataToUiInventoryItem(item)
const damageOf = (item: ItemData) => {
  const damage = ui(item).twoHanded ? ui(item).twoHandDamage : (ui(item).oneHandDamage ?? ui(item).twoHandDamage)
  return damage ? (damage.min + damage.max) / 2 : 0
}
const worthOf = (item: ItemData, bodyLoc: number) => (bodyLoc === WEAPON_SLOT ? damageOf(item) : (ui(item).defense ?? 0))

function wearable(item: ItemData, merc: Hireling): boolean {
  const { reqClass, reqStr, reqDex, reqLevel } = ui(item)
  const stat = (key: keyof typeof GEAR.stats) => merc.stats.get(GEAR.stats[key])
  const within = (need: number | undefined, have: number | undefined) => (need ?? 0) <= 0 || have === undefined || need! <= have
  return reqClass === undefined && within(reqStr, stat('strength')) && within(reqDex, stat('dexterity')) && within(reqLevel, stat('level'))
}

function slotsFor(item: ItemData, merc: Hireling): number[] {
  const weapon = WEAPONS.find((rule) => rule.classes.includes(merc.classId))
  const type = getEmbeddedDropTables().getBase(item.code.trim())?.type ?? ''
  return ui(item).allowedSlots.flatMap((slot) => {
    if (slot === 'weapon1') return weapon && weapon.types.includes(type) && (weapon.twoHanded || !ui(item).twoHanded) ? [WEAPON_SLOT] : []
    if (slot === 'weapon2') return SHIELD_USERS.has(merc.classId) && damageOf(item) === 0 ? [SLOTS.weapon2!] : []
    const bodyLoc = SLOTS[slot]
    return bodyLoc === undefined ? [] : [bodyLoc]
  })
}

export function mercUpgrade(carried: Iterable<ItemData>, merc: Hireling): { readonly item: ItemData; readonly bodyLoc: number } | null {
  const worn = new Map([...merc.worn].map((item) => [item.bodyLoc || item.equippedSlot, item]))
  return (
    [...carried]
      .filter((item) => item.identified && wearable(item, merc))
      .flatMap((item) => slotsFor(item, merc).map((bodyLoc) => ({ item, bodyLoc, gain: worthOf(item, bodyLoc) - (worn.get(bodyLoc) ? worthOf(worn.get(bodyLoc)!, bodyLoc) : 0) })))
      .filter((offer) => offer.gain >= (offer.bodyLoc === WEAPON_SLOT ? GEAR.weaponGain : GEAR.minGain))
      .sort((a, b) => b.gain - a.gain)[0] ?? null
  )
}
