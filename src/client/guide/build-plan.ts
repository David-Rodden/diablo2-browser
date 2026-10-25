import { SKILLS_CATALOG } from '../../common/data/skills-catalog.ts'
import type { BaseStatKey } from '../../common/units/unit-types.ts'
import BUILDS from './data/builds.json'

export const CLASS_NAMES = ['Amazon', 'Sorceress', 'Necromancer', 'Paladin', 'Barbarian', 'Druid', 'Assassin'] as const

type Attribute = keyof (typeof BUILDS)['Amazon']['start']

export interface Build {
  readonly name: string
  readonly start: Readonly<Record<Attribute, number>>
  readonly stats: Readonly<Partial<Record<Attribute, { readonly weight: number; readonly upTo?: number }>>>
  readonly skills: readonly (readonly [string, number])[]
}

const STAT_KEYS: Readonly<Record<Attribute, BaseStatKey>> = { strength: 'str', dexterity: 'dex', vitality: 'vit', energy: 'ene' }
const SKILL_IDS = new Map(SKILLS_CATALOG.map((skill) => [skill.name, skill.id]))
const PREREQS = new Map(SKILLS_CATALOG.map((skill) => [skill.id, skill.reqskills]))
const SAVED_POINTS = 3

interface ClassBuilds {
  readonly start: Build['start']
  readonly builds: readonly Omit<Build, 'start'>[]
}

const CLASSES = BUILDS as unknown as Readonly<Record<string, ClassBuilds>>

export const buildsOf = (charClass: number | null): readonly Build[] => {
  const options = CLASSES[CLASS_NAMES[charClass ?? -1] ?? '']
  return options ? options.builds.map((build) => ({ ...build, start: options.start })) : []
}

const invested = (build: Build, hard: (skillId: number) => number) => [...new Set(build.skills.map(([name]) => SKILL_IDS.get(name)!))].reduce((sum, skillId) => sum + hard(skillId), 0)

export const buildOf = (charClass: number | null, hard: (skillId: number) => number = () => 0): Build | null =>
  buildsOf(charClass).reduce<Build | null>((best, build) => (best === null || invested(build, hard) > invested(best, hard) ? build : best), null)

const withPrereqs = (skillId: number, hard: (id: number) => number): readonly number[] => [...(PREREQS.get(skillId) ?? []).filter((id) => hard(id) === 0).flatMap((id) => withPrereqs(id, hard)), skillId]

export function nextSkill(build: Build, hard: (skillId: number) => number, canAllocate: (skillId: number) => boolean, banked = 0): number | null {
  for (const { id } of build.skills.map(([name, level]) => ({ id: SKILL_IDS.get(name)!, level })).filter(({ id, level }) => hard(id) < level)) {
    const pick = withPrereqs(id, hard).find(canAllocate)
    if (pick !== undefined) return pick
    if (hard(id) === 0 && banked < SAVED_POINTS) return null
  }
  return null
}

export function nextStat(build: Build, base: Readonly<Record<BaseStatKey, number>>): BaseStatKey | null {
  const share = (attribute: Attribute) => (base[STAT_KEYS[attribute]] - build.start[attribute]) / build.stats[attribute]!.weight
  const open = (Object.keys(build.stats) as Attribute[]).filter((attribute) => base[STAT_KEYS[attribute]] < (build.stats[attribute]!.upTo ?? Infinity))
  const pick = open.sort((a, b) => share(a) - share(b))[0]
  return pick ? STAT_KEYS[pick] : null
}
