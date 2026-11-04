/**
 * 1.13c `SUNITDMG` helpers for a monster melee swing that lands on a PLAYER defender
 * (`kb/combat/d2game-sunitdmg-player-defender-113c.md`).
 *
 * - `monsterFillPacketPhysRange113c`: `SUNITDMG_FillPacket` (`D2Game.dll` `0x6FCFC530`) no-weapon branch.
 * - `monStatsCritPct113c`: `MonStats.txt` `crit` byte read by `0x6FC970E0`.
 * - `rollPlayerDefenderArmorDurability113c`: defender branch of `SUNITDMG_ItemDurability` (`0x6FCFEBA0`) and
 *   `ITEMS_DamageDurability` (`0x6FC32EE0`) — the three player-seed draws that follow a landed hit.
 */

import type { D2SeedStrc } from '../../../common/rng/d2-rng.ts'
import { itemTypeIsA } from '../../../common/items/item-types.ts'
import { MONSTATS_113C_ROWS } from '../../../common/units/monstats-113c-data.ts'
import { FIXED_ONE } from '../stat-list.ts'
import { collectItemStats, getBaseSizeTable } from './constants-and-helpers.ts'
import type { ServerItemEntry } from './types.ts'
import { rollLimitedSeed113c } from './unit-seeds-113c.ts'

/**
 * `SUNITDMG_FillPacket` (`0x6FCFC530`) for an attacker without a weapon (`0x6FCFC5A2..0x6FCFC5F8`):
 * `min = STAT_MINDAMAGE (21)` (`<= 0 -> 1`), `max = STAT_MAXDAMAGE (22)` (`<= 1 -> 2`), both `<< 8`, plus
 * `item_normaldamage (111) << 8`; `min < 1 -> 0x100`; `max <= min -> min + 0x100`.
 * `min`/`max` are the monster's current mode damage (A1 / A2 / S1 MonStats columns, MonLvl-scaled).
 */
export function monsterFillPacketPhysRange113c(
  statMinDamage: number,
  statMaxDamage: number,
  itemNormalDamage: number,
): { readonly min256: number; readonly max256: number } {
  const min = Math.trunc(statMinDamage) <= 0 ? 1 : Math.trunc(statMinDamage)
  const max = Math.trunc(statMaxDamage) <= 1 ? 2 : Math.trunc(statMaxDamage)
  const normal256 = Math.trunc(itemNormalDamage) * FIXED_ONE
  let min256 = min * FIXED_ONE + normal256
  let max256 = max * FIXED_ONE + normal256
  if (min256 < 1) min256 = 0x100
  if (max256 <= min256) max256 = min256 + 0x100
  return { min256, max256 }
}

/** `MonStats.txt` `crit` (`pMonStatsTxt + 0xA6`, read by `0x6FC9712A`). Throws on an unknown class. */
export function monStatsCritPct113c(hcIdx: number): number {
  const row = MONSTATS_113C_ROWS[hcIdx]
  if (row === undefined || row.hcIdx !== hcIdx) {
    throw new Error(`monStatsCritPct113c: no MonStats row for hcIdx ${hcIdx}`)
  }
  const crit = (row as { crit?: unknown }).crit
  if (typeof crit !== 'number') {
    throw new Error(`monStatsCritPct113c: MonStats row ${hcIdx} has no crit column`)
  }
  return crit
}

/**
 * `D2Game.dll` `0x6FD2E628` / `0x6FD2E62C` table used by `0x6FCFEBA0`: 7 body locations and their weights
 * (head 3, torso 5, right arm 4, left arm 4, belt 2, feet 2, gloves 2).
 */
export const ARMOR_DURABILITY_BODYLOC_WEIGHTS_113C: readonly (readonly [bodyLoc: number, weight: number])[] = [
  [1, 3],
  [3, 5],
  [4, 4],
  [5, 4],
  [8, 2],
  [9, 2],
  [10, 2],
]

/** `ITEMS_HasDurability` (`D2Common #10865` `0x6FD76D40`). Armor rows never set `nodurability`. */
function itemHasDurability113c(item: ServerItemEntry): boolean {
  const base = getBaseSizeTable().get(item.code.trim())
  if (base === undefined) {
    throw new Error(`itemHasDurability113c: unknown item code ${item.code}`)
  }
  if (base.maxDurability <= 0) return false
  if (item.maxDurability <= 0) return false
  return !collectItemStats(item).some((s) => s.statId === 152 && s.value > 0)
}

function itemIsArmor113c(item: ServerItemEntry): boolean {
  const base = getBaseSizeTable().get(item.code.trim())
  if (base === undefined) {
    throw new Error(`itemIsArmor113c: unknown item code ${item.code}`)
  }
  return itemTypeIsA(base.itemType, 'armo')
}

/**
 * Defender branch of `SUNITDMG_ItemDurability` (`0x6FCFEBD7..0x6FCFED15`), called from
 * `SUNITDMG_ExecuteCombat` (`0x6FCFEE2B`) after a landed (`wResultFlags & 1`) hit on a player:
 *
 * 1. For each of the 7 body locations, take the equipped item if it is `armo` (`#10744(item, 0x32)`);
 *    `sum` = total weight of those slots. `sum == 0` -> no draw.
 * 2. `start = RAND(&pDefender->pSeed, 7)`, `r = RAND(&pDefender->pSeed, sum)`; walk the slots from `start`
 *    (wrapping), subtracting the weight of present slots until `r < weight` -> that item.
 * 3. `ITEMS_DamageDurability` (`0x6FC32EE0`): if the item has durability (`#10865`) roll
 *    `pDefender->pSeed % 100 < 10` (armor threshold `0x6FC32F35`) -> durability `- 1` (`STAT 72`).
 *
 * Returns the number of player-seed draws taken (0, 2 or 3).
 */
export function rollPlayerDefenderArmorDurability113c(
  seed: D2SeedStrc,
  equippedActive: readonly ServerItemEntry[],
): number {
  const table = ARMOR_DURABILITY_BODYLOC_WEIGHTS_113C
  const slots: (ServerItemEntry | undefined)[] = []
  let sum = 0
  for (const [bodyLoc, weight] of table) {
    const item = equippedActive.find((i) => i.bodyLoc === bodyLoc)
    const armor = item !== undefined && itemIsArmor113c(item) ? item : undefined
    slots.push(armor)
    if (armor !== undefined) sum += weight
  }
  if (sum <= 0) return 0
  let idx = rollLimitedSeed113c(seed, table.length)
  let r = rollLimitedSeed113c(seed, sum)
  let picked: ServerItemEntry | undefined
  for (;;) {
    const item = slots[idx]
    if (item !== undefined) {
      const weight = table[idx]![1]
      if (r < weight) {
        picked = item
        break
      }
      r -= weight
    }
    idx = (idx + 1) % table.length
    if (r < 0) break
  }
  if (picked === undefined || !itemHasDurability113c(picked)) return 2
  if (rollLimitedSeed113c(seed, 100) < 10) {
    const nextDur = Math.max(0, picked.durability - 1)
    picked.durability = nextDur
    picked.stats.set(72, nextDur)
    if (picked.rawItemData !== undefined) {
      ;(picked.rawItemData as { durability?: number }).durability = nextDur
    }
  }
  return 3
}
