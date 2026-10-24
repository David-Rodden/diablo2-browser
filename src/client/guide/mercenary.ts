import { SKILLS_CATALOG } from '../../common/data/skills-catalog.ts'
import MERCS from './data/mercenaries.json'

export interface HireCandidate {
  readonly mercId: number
  readonly nameId?: number | undefined
  readonly name: string
  readonly cost: number
  readonly level: number
  readonly hp: number
  readonly skills: readonly number[]
}

export const MERCENARIES = MERCS

const AURA_RANK = new Map(MERCS.auras.map((name, i) => [SKILLS_CATALOG.find((skill) => skill.name === name)?.id, MERCS.auras.length - i]))

const auraRank = (candidate: HireCandidate) => Math.max(0, ...candidate.skills.map((skillId) => AURA_RANK.get(skillId) ?? 0))

export const hireIdOf = (candidate: HireCandidate) => Number(candidate.nameId ?? candidate.mercId)

export const pickMercenary = (candidates: readonly HireCandidate[], gold: number): HireCandidate | null =>
  candidates.filter((candidate) => candidate.cost <= gold - MERCS.keepGold).sort((a, b) => auraRank(b) - auraRank(a) || b.level - a.level || b.hp - a.hp)[0] ?? null
