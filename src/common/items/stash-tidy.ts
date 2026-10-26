import type { CharacterBuild } from './character-build.ts'
import { RUNE_INFO } from './gems-data.ts'
import type { Appraisal } from './loot-appraisal.ts'
import type { LootItem } from './loot-item.ts'
import { runewordsFor } from './runeword-advice.ts'
import TIDY from './data/stash-tidy.json'

export interface Holding {
  readonly item: LootItem
  readonly appraisal: Appraisal
}

export interface RuneCube {
  readonly rune: string
  readonly makes: string
  readonly count: number
}

const JEWELLERY = new Set(TIDY.jewelleryCodes)
const SOLD_GEAR = new Set<Appraisal['kind']>(['unique', 'set', 'rare', 'magic', 'base', 'normal'])

const codeOf = (item: LootItem) => item.code.trim().toLowerCase()
const runeNum = (code: string) => RUNE_INFO[code]?.num ?? 0
const runeCode = (num: number) => `r${String(num).padStart(2, '0')}`
const byScore = (a: Holding, b: Holding) => b.appraisal.score - a.appraisal.score || a.item.id - b.item.id
const kept = ({ appraisal }: Holding) => appraisal.locked || appraisal.tier === 'great' || appraisal.upgradeSlot !== undefined || TIDY.keptReasons.some((reason) => appraisal.reason.startsWith(reason))
const beyond = (limit: number) => (holdings: readonly Holding[]) => holdings.filter((h) => !kept(h)).sort(byScore).slice(limit)

const runesNeeded = (build: CharacterBuild) =>
  runewordsFor(build).reduce((need, rw) => {
    for (const code of new Set(rw.runes)) need.set(code, Math.max(need.get(code) ?? 0, rw.runes.filter((rune) => rune === code).length))
    return need
  }, new Map<string, number>())

export function runeCube(holdings: readonly Holding[], build: CharacterBuild): RuneCube | null {
  const need = runesNeeded(build)
  const counts = holdings.filter((h) => h.appraisal.kind === 'rune').reduce((all, { item }) => all.set(codeOf(item), (all.get(codeOf(item)) ?? 0) + 1), new Map<string, number>())
  const rune = [...counts.keys()].filter((code) => runeNum(code) <= TIDY.cubeRunesUpTo && counts.get(code)! - (need.get(code) ?? 0) >= TIDY.runesPerCube).sort((a, b) => runeNum(a) - runeNum(b))[0]
  return rune === undefined ? null : { rune, makes: runeCode(runeNum(rune) + 1), count: TIDY.runesPerCube }
}

export function surplus(holdings: readonly Holding[]): ReadonlySet<number> {
  const known = holdings.filter(({ item }) => item.identified)
  const jewellery = known.filter(({ item, appraisal }) => JEWELLERY.has(codeOf(item)) && appraisal.kind !== 'charm')
  const byCode = jewellery.reduce((all, h) => all.set(codeOf(h.item), [...(all.get(codeOf(h.item)) ?? []), h]), new Map<string, Holding[]>())
  const spare = [
    ...beyond(TIDY.jewels)(known.filter(({ appraisal }) => appraisal.kind === 'jewel')),
    ...beyond(TIDY.gems)(known.filter(({ appraisal }) => appraisal.kind === 'gem')),
    ...[...byCode.values()].flatMap(beyond(TIDY.jewellery)),
    ...known.filter((h) => !kept(h) && !JEWELLERY.has(codeOf(h.item)) && SOLD_GEAR.has(h.appraisal.kind) && h.appraisal.tier !== 'good'),
  ]
  return new Set(spare.map(({ item }) => item.id))
}
