import type { CharacterBuild } from '../../common/items/character-build.ts'
import { getEmbeddedDropTables } from '../../common/items/embedded-drop-tables.ts'
import { CANONICAL_GEMS_TABLE } from '../../common/items/gems.ts'
import { itemStats, propStats, scoreStats } from '../../common/items/item-score.ts'
import { isTwoHanded, slotOf, wieldable } from '../../common/items/loot-appraisal.ts'
import { runewordsFor, type RunewordPick } from '../../common/items/runeword-advice.ts'
import type { ItemData } from '../../netproto/index.ts'

export interface SocketMove {
  readonly filler: ItemData
  readonly target: ItemData
  readonly why: string
}

export interface SocketStock {
  readonly equipment: Iterable<ItemData>
  readonly inventory: Iterable<ItemData>
  readonly sockets: ReadonlyMap<number, readonly ItemData[]>
}

const RUNEWORD_QUALITIES = new Set([1, 2, 3])
const JEWEL = 'jew'
const MIN_GAIN = 5
const SHIELD_SLOT = 'weapon2'

const codeOf = (item: ItemData) => item.code.trim().toLowerCase()
const isRune = (code: string) => /^r\d\d$/.test(code)
const modsFor = (target: ItemData) => (slotOf(target) === 'weapon1' ? 'weaponMods' : slotOf(target) === SHIELD_SLOT ? 'shieldMods' : 'helmMods')

const inside = (target: ItemData, sockets: SocketStock['sockets']) => (sockets.get(target.id) ?? []).map(codeOf)
const freeSockets = (target: ItemData, sockets: SocketStock['sockets']) => target.totalSockets - Math.max(target.usedSockets, inside(target, sockets).length)

function runewordsInto(base: ItemData, filled: readonly string[], picks: readonly RunewordPick[], build: CharacterBuild): readonly RunewordPick[] {
  const { getBase, isA } = getEmbeddedDropTables()
  const type = getBase(codeOf(base))?.type ?? ''
  return picks.filter((rw) => !rw.forMerc && rw.levelreq <= build.level && rw.runes.length === base.totalSockets && rw.itypes.some((t) => isA(type, t)) && filled.every((code, i) => rw.runes[i] === code))
}

function nextRune(stock: SocketStock, build: CharacterBuild): SocketMove | null {
  const picks = runewordsFor(build)
  const carried = [...stock.inventory]
  const bases = [...stock.equipment, ...carried].filter((item) => item.totalSockets > 0 && !item.runeword && RUNEWORD_QUALITIES.has(item.quality ?? 0) && freeSockets(item, stock.sockets) > 0)
  for (const base of bases) {
    const filled = inside(base, stock.sockets)
    for (const rw of runewordsInto(base, filled, picks, build)) {
      const taken = new Set<number>()
      const take = (code: string) => {
        const rune = carried.find((item) => codeOf(item) === code && !taken.has(item.id))
        if (rune) taken.add(rune.id)
        return rune
      }
      const runes = rw.runes.slice(filled.length).map(take)
      if (runes.every((rune) => rune !== undefined)) return { filler: runes[0]!, target: base, why: `${rw.name} (${filled.length + 1}/${rw.runes.length})` }
    }
  }
  return null
}

const gain = (filler: ItemData, target: ItemData, build: CharacterBuild) =>
  codeOf(filler) === JEWEL ? scoreStats(itemStats(filler), build) : scoreStats(propStats(CANONICAL_GEMS_TABLE.get(codeOf(filler))?.[modsFor(target)] ?? []), build)

function bestGem(stock: SocketStock, build: CharacterBuild): SocketMove | null {
  const picks = runewordsFor(build)
  const fillers = [...stock.inventory].filter((item) => !isRune(codeOf(item)) && (CANONICAL_GEMS_TABLE.get(codeOf(item)) !== undefined || (codeOf(item) === JEWEL && item.identified)))
  const targets = [...stock.equipment].filter((item) => freeSockets(item, stock.sockets) > 0 && !item.runeword && !(RUNEWORD_QUALITIES.has(item.quality ?? 0) && inside(item, stock.sockets).length === 0 && runewordsInto(item, [], picks, build).length > 0))
  const moves = targets.flatMap((target) => fillers.map((filler) => ({ filler, target, score: gain(filler, target, build) })))
  const best = moves.sort((a, b) => b.score - a.score)[0]
  return best && best.score >= MIN_GAIN ? { filler: best.filler, target: best.target, why: `+${Math.round(best.score)} to your build` } : null
}

export interface RunewordKit {
  readonly name: string
  readonly runes: readonly ItemData[]
  readonly base: ItemData | null
}

export const fitsRuneword = (item: ItemData, rw: RunewordPick, sockets: SocketStock['sockets'], build: CharacterBuild): boolean =>
  item.totalSockets === rw.runes.length && item.usedSockets === 0 && inside(item, sockets).length === 0 && !item.runeword && RUNEWORD_QUALITIES.has(item.quality ?? 0) && rw.itypes.some((t) => getEmbeddedDropTables().isA(getEmbeddedDropTables().getBase(codeOf(item))?.type ?? '', t)) && wieldable(item, build)

export function runewordKit(owned: readonly ItemData[], sockets: SocketStock['sockets'], build: CharacterBuild): RunewordKit | null {
  const loose = owned.filter((item) => isRune(codeOf(item)))
  const kits = runewordsFor(build)
    .filter((pick) => !pick.forMerc && pick.levelreq <= build.level)
    .flatMap((rw): RunewordKit[] => {
      const taken = new Set<number>()
      const runes = rw.runes.map((code) => {
        const rune = loose.find((item) => codeOf(item) === code && !taken.has(item.id))
        if (rune) taken.add(rune.id)
        return rune
      })
      return runes.every((rune) => rune !== undefined) ? [{ name: rw.name, runes, base: owned.find((item) => fitsRuneword(item, rw, sockets, build)) ?? null }] : []
    })
  return kits.find((kit) => kit.base !== null) ?? kits[0] ?? null
}

export const baseFor = (kit: RunewordKit, offered: readonly ItemData[], sockets: SocketStock['sockets'], build: CharacterBuild): ItemData | null => {
  const rw = runewordsFor(build).find((pick) => pick.name === kit.name)
  return (rw && offered.filter((item) => fitsRuneword(item, rw, sockets, build)).sort((a, b) => Number(isTwoHanded(a)) - Number(isTwoHanded(b)))[0]) ?? null
}

export const nextSocketMove = (stock: SocketStock, build: CharacterBuild): SocketMove | null => nextRune(stock, build) ?? bestGem(stock, build)
