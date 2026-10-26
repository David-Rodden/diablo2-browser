import type { CharacterBuild } from '../../common/items/character-build.ts'
import { getEmbeddedDropTables } from '../../common/items/embedded-drop-tables.ts'
import { CANONICAL_GEMS_TABLE } from '../../common/items/gems.ts'
import { itemStats, propStats, scoreStats } from '../../common/items/item-score.ts'
import { slotOf } from '../../common/items/loot-appraisal.ts'
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

function runewordFor(base: ItemData, filled: readonly string[], picks: readonly RunewordPick[], build: CharacterBuild): RunewordPick | undefined {
  const { getBase, isA } = getEmbeddedDropTables()
  const type = getBase(codeOf(base))?.type ?? ''
  return picks.find((rw) => !rw.forMerc && rw.levelreq <= build.level && rw.runes.length === base.totalSockets && rw.itypes.some((t) => isA(type, t)) && filled.every((code, i) => rw.runes[i] === code))
}

function nextRune(stock: SocketStock, build: CharacterBuild): SocketMove | null {
  const picks = runewordsFor(build)
  const carried = [...stock.inventory]
  const bases = [...stock.equipment, ...carried].filter((item) => item.totalSockets > 0 && !item.runeword && RUNEWORD_QUALITIES.has(item.quality ?? 0) && freeSockets(item, stock.sockets) > 0)
  for (const base of bases) {
    const filled = inside(base, stock.sockets)
    const rw = runewordFor(base, filled, picks, build)
    if (!rw) continue
    const taken = new Set<number>()
    const take = (code: string) => {
      const rune = carried.find((item) => codeOf(item) === code && !taken.has(item.id))
      if (rune) taken.add(rune.id)
      return rune
    }
    const runes = rw.runes.slice(filled.length).map(take)
    if (runes.every((rune) => rune !== undefined)) return { filler: runes[0]!, target: base, why: `${rw.name} (${filled.length + 1}/${rw.runes.length})` }
  }
  return null
}

const gain = (filler: ItemData, target: ItemData, build: CharacterBuild) =>
  codeOf(filler) === JEWEL ? scoreStats(itemStats(filler), build) : scoreStats(propStats(CANONICAL_GEMS_TABLE.get(codeOf(filler))?.[modsFor(target)] ?? []), build)

function bestGem(stock: SocketStock, build: CharacterBuild): SocketMove | null {
  const picks = runewordsFor(build)
  const fillers = [...stock.inventory].filter((item) => !isRune(codeOf(item)) && (CANONICAL_GEMS_TABLE.get(codeOf(item)) !== undefined || (codeOf(item) === JEWEL && item.identified)))
  const targets = [...stock.equipment].filter((item) => freeSockets(item, stock.sockets) > 0 && !item.runeword && !(RUNEWORD_QUALITIES.has(item.quality ?? 0) && inside(item, stock.sockets).length === 0 && runewordFor(item, [], picks, build)))
  const moves = targets.flatMap((target) => fillers.map((filler) => ({ filler, target, score: gain(filler, target, build) })))
  const best = moves.sort((a, b) => b.score - a.score)[0]
  return best && best.score >= MIN_GAIN ? { filler: best.filler, target: best.target, why: `+${Math.round(best.score)} to your build` } : null
}

export const nextSocketMove = (stock: SocketStock, build: CharacterBuild): SocketMove | null => nextRune(stock, build) ?? bestGem(stock, build)
