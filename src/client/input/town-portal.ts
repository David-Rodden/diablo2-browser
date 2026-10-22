const QUANTITY_STAT = 70

export interface TownPortalItem {
  readonly id: number
  readonly code: string
  readonly quantity?: number | undefined
  readonly stats?: readonly { readonly statId: number; readonly value: number }[] | undefined
}

export type TownPortalRefusal = 'no-scrolls' | 'in-town'

const codeOf = (item: TownPortalItem) => item.code.trim().toLowerCase()
const charges = (item: TownPortalItem) => item.quantity ?? item.stats?.find((s) => s.statId === QUANTITY_STAT)?.value ?? 0

export const townPortalSource = (items: Iterable<TownPortalItem>): TownPortalItem | null => {
  const carried = [...items]
  return carried.find((item) => codeOf(item) === 'tbk' && charges(item) > 0) ?? carried.find((item) => codeOf(item) === 'tsc') ?? null
}

export const portalsCarried = (items: Iterable<TownPortalItem>): { readonly tome: boolean; readonly portals: number } => {
  const carried = [...items]
  const tomes = carried.filter((item) => codeOf(item) === 'tbk')
  return { tome: tomes.length > 0, portals: tomes.reduce((sum, tome) => sum + charges(tome), 0) + carried.filter((item) => codeOf(item) === 'tsc').length }
}

export const townPortalRefusalText = (refusal: TownPortalRefusal, lang: 'ENG' | 'CHI'): string =>
  refusal === 'in-town' ? (lang === 'ENG' ? "You're already in town" : '你已经在城里了') : lang === 'ENG' ? 'No Town Portal scrolls' : '没有城镇传送卷轴'
