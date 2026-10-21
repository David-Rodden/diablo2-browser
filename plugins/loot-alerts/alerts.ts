import type { PluginToast } from '../../src/client/plugin-host/api.ts'
import { onlineItemDataToUiInventoryItem } from '../../src/common/items/item-bridge.ts'
import { levelDisplayName } from '../../src/common/world/level-names-zh.ts'
import { classifyDropItem, resolveDropItemNames } from '../drop-tracker/drop-tracker.ts'

export type AlertLevel = 'notable' | 'valuable' | 'runes'

export interface DroppedItem {
  readonly id: number
  readonly code: string
  readonly quality?: number | undefined
}

const NEW_DROP = 0x00
const CHARMS = new Set(['cm1', 'cm2', 'cm3'])
const PERFECT_GEMS = new Set(['gpv', 'gpw', 'gpg', 'gpr', 'gpb', 'gpy', 'skz'])
const RARE = 6

type Kind = 'unique' | 'set' | 'rune' | 'rare' | 'charm' | 'jewel' | 'gem'

const STYLE: Record<Kind, { readonly label: string; readonly color: PluginToast['color'] }> = {
  unique: { label: 'Unique', color: 'gold' },
  set: { label: 'Set item', color: 'green' },
  rune: { label: 'Rune', color: 'orange' },
  rare: { label: 'Rare', color: 'yellow' },
  charm: { label: 'Charm', color: 'blue' },
  jewel: { label: 'Jewel', color: 'blue' },
  gem: { label: 'Perfect gem', color: 'white' },
}

const kindOf = (item: DroppedItem): Kind | null => {
  const code = item.code.trim().toLowerCase()
  return classifyDropItem(item) ?? (item.quality === RARE ? 'rare' : CHARMS.has(code) ? 'charm' : code === 'jew' ? 'jewel' : PERFECT_GEMS.has(code) ? 'gem' : null)
}

const WANTED: Record<AlertLevel, ReadonlySet<Kind>> = {
  notable: new Set(['unique', 'set', 'rune']),
  valuable: new Set(['unique', 'set', 'rune', 'rare', 'charm', 'jewel', 'gem']),
  runes: new Set(['rune']),
}

const nameOf = (item: DroppedItem, kind: Kind): string =>
  kind === 'unique' || kind === 'set' || kind === 'rune' ? resolveDropItemNames(item).name : (onlineItemDataToUiInventoryItem(item).name ?? item.code)

export function lootAlert(action: number, item: DroppedItem, level: AlertLevel, areaId: number): PluginToast | null {
  const kind = action === NEW_DROP ? kindOf(item) : null
  if (kind === null || !WANTED[level].has(kind)) return null
  const area = areaId > 0 ? levelDisplayName(areaId, 'en') : ''
  return { title: nameOf(item, kind), detail: area ? `${STYLE[kind].label} · ${area}` : STYLE[kind].label, color: STYLE[kind].color }
}
