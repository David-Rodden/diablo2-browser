import { getLevelNames } from '../../common/world/level-names-zh.ts'
import { LEVEL_LINKS, WAYPOINT_LEVELS, type LevelLink } from './level-links.ts'

export type GuideMode = 'story' | 'required'

interface Objective {
  readonly row: number
  readonly level: number
  readonly name: string
  readonly required?: true
}

const OBJECTIVES: readonly (readonly Objective[])[] = [
  [
    { row: 1, level: 8, name: 'Den of Evil' },
    { row: 2, level: 17, name: "Sisters' Burial Grounds" },
    { row: 4, level: 38, name: 'Search for Cain' },
    { row: 5, level: 25, name: 'The Forgotten Tower' },
    { row: 3, level: 28, name: 'Tools of the Trade' },
    { row: 6, level: 37, name: 'Sisters to the Slaughter', required: true },
  ],
  [
    { row: 9, level: 49, name: "Radament's Lair" },
    { row: 10, level: 64, name: 'The Horadric Staff', required: true },
    { row: 11, level: 61, name: 'The Tainted Sun', required: true },
    { row: 12, level: 74, name: 'Arcane Sanctuary', required: true },
    { row: 13, level: 74, name: 'The Summoner', required: true },
    { row: 14, level: 73, name: 'The Seven Tombs', required: true },
  ],
  [
    { row: 19, level: 78, name: 'Blade of the Old Religion' },
    { row: 17, level: 94, name: "Lam Esen's Tome" },
    { row: 18, level: 83, name: "Khalim's Will", required: true },
    { row: 21, level: 83, name: 'The Blackened Temple', required: true },
    { row: 22, level: 102, name: 'The Guardian', required: true },
  ],
  [
    { row: 25, level: 105, name: 'The Fallen Angel' },
    { row: 27, level: 107, name: "Hell's Forge" },
    { row: 26, level: 108, name: "Terror's End", required: true },
  ],
  [
    { row: 35, level: 110, name: 'Siege on Harrogath' },
    { row: 36, level: 111, name: 'Rescue on Mount Arreat' },
    { row: 37, level: 114, name: 'Prison of Ice' },
    { row: 38, level: 124, name: 'Betrayal of Harrogath' },
    { row: 39, level: 120, name: 'Rite of Passage', required: true },
    { row: 40, level: 132, name: 'Eve of Destruction', required: true },
  ],
]

export const ACT_TOWNS = [1, 40, 75, 103, 109] as const
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const PORTAL_HINTS: Readonly<Record<string, string>> = {
  '1>40': 'Talk to Warriv',
  '40>75': 'Talk to Meshif',
  '102>103': 'Take the red portal',
  '103>109': 'Talk to Tyrael',
  '4>38': 'Open the Cairn Stones',
  '54>74': 'Take the portal in the Palace Cellar',
  '74>46': "Take the Summoner's portal",
  '46>73': 'Enter the true tomb',
}
const REWARD_GRANTED = 0x0001
const REWARD_PENDING = 0x0002
const COMPLETED_NOW = 0x2000

export const levelName = (level: number): string => getLevelNames(level).nameEn
export const actOfLevel = (level: number): number => ACT_TOWNS.filter((town) => level >= town).length - 1
const isDone = (word: number) => (word & (REWARD_GRANTED | COMPLETED_NOW)) !== 0

export interface Goal {
  readonly level: number
  readonly title: string
  readonly inTown?: true
}

export function currentGoal(level: number, quests: ArrayLike<number>, mode: GuideMode = 'story'): Goal | null {
  const act = actOfLevel(level)
  const objective = OBJECTIVES[act]?.find((o) => (mode === 'story' || o.required) && !isDone(quests[o.row] ?? 0))
  if (objective && ((quests[objective.row] ?? 0) & REWARD_PENDING) !== 0) return { level: ACT_TOWNS[act]!, title: `${objective.name}: collect your reward`, inTown: true }
  if (objective) return { level: objective.level, title: objective.name }
  return act < 4 ? { level: ACT_TOWNS[act + 1]!, title: `Travel to Act ${ROMAN[act + 1]}` } : null
}

export type Step =
  | { readonly kind: 'arrived'; readonly level: number }
  | { readonly kind: 'exit'; readonly level: number }
  | { readonly kind: 'portal'; readonly level: number; readonly hint: string }
  | { readonly kind: 'waypoint'; readonly level: number }

export function shortestRoute(from: number, to: number, links: ReadonlyMap<number, readonly LevelLink[]> = LEVEL_LINKS): readonly number[] | null {
  const previous = new Map<number, number>([[from, from]])
  const queue = [from]
  for (let level = queue.shift(); level !== undefined; level = queue.shift()) {
    if (level === to) {
      const route = [to]
      while (route[0] !== from) route.unshift(previous.get(route[0]!)!)
      return route
    }
    for (const { to: next } of links.get(level) ?? []) if (!previous.has(next)) (previous.set(next, level), queue.push(next))
  }
  return null
}

const linkKind = (from: number, to: number) => LEVEL_LINKS.get(from)?.find((link) => link.to === to)?.kind

export function nextStep(from: number, to: number, waypoints: ReadonlySet<number> = new Set()): Step | null {
  if (from === to) return { kind: 'arrived', level: to }
  const walk = shortestRoute(from, to)
  const hasWaypointHere = [...WAYPOINT_LEVELS.values()].includes(from)
  const viaWaypoint = hasWaypointHere
    ? [...waypoints]
        .map((id) => WAYPOINT_LEVELS.get(id))
        .filter((level): level is number => level !== undefined && level !== from)
        .map((level) => ({ level, route: shortestRoute(level, to) }))
        .filter((option): option is { level: number; route: readonly number[] } => option.route !== null)
        .sort((a, b) => a.route.length - b.route.length)[0]
    : undefined
  if (viaWaypoint && (walk === null || viaWaypoint.route.length + 1 < walk.length - 1)) return { kind: 'waypoint', level: viaWaypoint.level }
  const next = walk?.[1]
  if (next === undefined) return null
  return linkKind(from, next) === 'portal' ? { kind: 'portal', level: next, hint: PORTAL_HINTS[`${from}>${next}`] ?? `Find the way to ${levelName(next)}` } : { kind: 'exit', level: next }
}
