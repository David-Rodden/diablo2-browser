import type { EquipSlotId } from '../../common/items/inventory-model.ts'
import { slotOf } from '../../common/items/loot-appraisal.ts'
import type { LootItem } from '../../common/items/loot-item.ts'
import { getExperienceTable } from '../../common/skills/formulas.ts'
import { getLevelMonsterLevel113c, LEVELS_MONLVL_113C } from '../../common/world/levels-monlvl-113c.ts'
import { LEVEL_LINKS } from './level-links.ts'
import { ACT_TOWNS, actOfLevel, levelName, shortestRoute } from './route.ts'
import TRAINING from './data/training.json'

export interface Readiness {
  readonly level: number
  readonly gold: number
  readonly bare: number
  readonly why: string
}

export interface Trainee {
  readonly level: number
  readonly gold: number
  readonly bare: number
  readonly difficulty: 0 | 1 | 2
}

const AVOID = new Set(Object.values(TRAINING.avoid))
const TOWNS = new Set<number>(ACT_TOWNS)

const EXPERIENCE = getExperienceTable()
const DRESSED = TRAINING.dressed as readonly EquipSlotId[]

export const bareSlots = (equipped: Iterable<LootItem>) => {
  const worn = new Set([...equipped].map(slotOf))
  return DRESSED.filter((slot) => !worn.has(slot)).length
}

export const levelProgress = (level: number, gained: number) => gained / Math.max(1, (EXPERIENCE[level + 1] ?? Infinity) - (EXPERIENCE[level] ?? 0))

export const slowGround = (level: number, gained: number, elapsedMs: number) => elapsedMs >= TRAINING.rateCheckMs && levelProgress(level, gained) / (elapsedMs / 60_000) < TRAINING.minLevelPerMinute

export const setbacksOf = (deaths: number, retreats: number) => deaths + retreats * TRAINING.retreatWeight

export const monsterLevel = (level: number, difficulty: 0 | 1 | 2) => getLevelMonsterLevel113c(level, difficulty)

const DONE = 0x0001 | 0x2000

export const lockedLevels = (words: ArrayLike<number>): Set<number> =>
  new Set(Object.values(TRAINING.locks).flatMap(({ levels, quest, once }) => ((words[quest] ?? 0) & (once === 'done' ? DONE : 0xffff) ? [] : levels)))

export const GEAR_HUNT_MS = TRAINING.gearMinutes * 60_000
export const GEAR_REST_MS = TRAINING.gearRestMinutes * 60_000

export function readiness(me: Trainee, questLevel: number, setbacks: number, gearHunt = true): Readiness | null {
  const act = actOfLevel(questLevel)
  const fightable = TOWNS.has(questLevel) ? 0 : monsterLevel(questLevel, me.difficulty) - TRAINING.safety
  const level = Math.max(fightable, setbacks >= TRAINING.setbacks ? me.level + TRAINING.levelsPerSetback * Math.floor(setbacks / TRAINING.setbacks) : 0)
  const gold = TRAINING.goldPerAct[act] ?? 0
  if (me.level < level) return { level, gold: 0, bare: DRESSED.length, why: setbacks >= TRAINING.setbacks ? `Too strong for now, training to level ${level}` : `Training to level ${level} for ${levelName(questLevel)}` }
  if (gearHunt && me.level >= TRAINING.bareFromLevel && me.bare >= TRAINING.bareSlots) return { level: me.level, gold: 0, bare: TRAINING.bareSlots - 1, why: `Gathering gear before ${levelName(questLevel)}` }
  return me.gold < gold / 4 ? { level: me.level, gold, bare: DRESSED.length, why: `Gathering gold for supplies` } : null
}

export function trainingGround(from: number, me: Trainee, waypointLevels: ReadonlySet<number>, skip: ReadonlySet<number>, rateOf: (area: number) => number | undefined = () => undefined, sealed: ReadonlySet<number> = new Set()): number | null {
  const maxAct = actOfLevel(from)
  const ceiling = Math.max(Math.min(me.level - TRAINING.belowGoal, TRAINING.bareFromLevel), me.level - TRAINING.belowGoal - Math.round(me.bare * TRAINING.barePenalty))
  const links = new Map([...LEVEL_LINKS].filter(([level]) => !sealed.has(level)).map(([level, out]) => [level, out.filter((link) => !sealed.has(link.to))]))
  const hops = (level: number) => shortestRoute(from, level, waypointLevels, links)?.length ?? Infinity
  const candidates = LEVELS_MONLVL_113C.map((_, id) => id).filter((id) => id > 0 && !TOWNS.has(id) && !AVOID.has(id) && !skip.has(id) && actOfLevel(id) <= maxAct && monsterLevel(id, me.difficulty) <= ceiling)
  const scored = candidates.map((id) => ({ id, mon: monsterLevel(id, me.difficulty), hops: hops(id) })).filter((c) => Number.isFinite(c.hops))
  const best = Math.max(...scored.map((c) => c.mon))
  const fit = scored.filter((c) => c.mon >= Math.max(1, best - TRAINING.spread / 3))
  const known = fit.flatMap((c) => rateOf(c.id) ?? [])
  const value = (area: number) => (known.length === 0 ? 0 : (rateOf(area) ?? Math.max(...known) * TRAINING.ledger.optimism))
  return fit.sort((a, b) => value(b.id) - value(a.id) || a.hops - b.hops || b.mon - a.mon)[0]?.id ?? null
}
