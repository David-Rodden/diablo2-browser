import type { PluginToast } from '../../src/client/plugin-host/api.ts'
import { onlineItemDataToUiInventoryItem } from '../../src/common/items/item-bridge.ts'
import { levelDisplayName } from '../../src/common/world/level-names-zh.ts'

export type AlertLevel = 'notable' | 'valuable' | 'runes'

export interface DroppedItem {
  readonly id: number
  readonly code: string
  readonly quality?: number | undefined
}

const NEW_DROP = 0x00
const CHARMS = new Set(['cm1', 'cm2', 'cm3'])
const PERFECT_GEMS = new Set(['gpv', 'gpw', 'gpg', 'gpr', 'gpb', 'gpy', 'skz'])
const [SET, RARE, UNIQUE] = [5, 6, 7]
const RUNE = /^r(0[1-9]|[12]\d|3[0-3])$/

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
  if (RUNE.test(code)) return 'rune'
  const byQuality = ({ [UNIQUE]: 'unique', [SET]: 'set', [RARE]: 'rare' } as const)[item.quality ?? 0]
  return byQuality ?? (CHARMS.has(code) ? 'charm' : code === 'jew' ? 'jewel' : PERFECT_GEMS.has(code) ? 'gem' : null)
}

const WANTED: Record<AlertLevel, ReadonlySet<Kind>> = {
  notable: new Set(['unique', 'set', 'rune']),
  valuable: new Set(['unique', 'set', 'rune', 'rare', 'charm', 'jewel', 'gem']),
  runes: new Set(['rune']),
}

const nameOf = (item: DroppedItem): string => onlineItemDataToUiInventoryItem(item).name || item.code

export function lootAlert(action: number, item: DroppedItem, level: AlertLevel, areaId: number): PluginToast | null {
  const kind = action === NEW_DROP ? kindOf(item) : null
  if (kind === null || !WANTED[level].has(kind)) return null
  const area = areaId > 0 ? levelDisplayName(areaId, 'en') : ''
  return { title: nameOf(item), detail: area ? `${STYLE[kind].label} · ${area}` : STYLE[kind].label, color: STYLE[kind].color }
}
