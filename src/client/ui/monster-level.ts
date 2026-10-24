import { CHAMPION_MODIFIER, MINION_MODIFIER, UNIQUE_MODIFIER, getMonsterKindByHcIdx, monsterLevelFor } from '../../common/units/monsters-data.ts'
import { getLevelMonsterLevel113c } from '../../common/world/levels-monlvl-113c.ts'
import type { MonsterTargetHudInfo } from './panels/escape-monster-tooltip.ts'

const DIFFICULTIES = ['normal', 'nightmare', 'hell'] as const

const RANK_BONUS: Partial<Record<NonNullable<MonsterTargetHudInfo['rank']>, number>> = {
  champion: CHAMPION_MODIFIER.levelBonus,
  unique: UNIQUE_MODIFIER.levelBonus,
  superunique: UNIQUE_MODIFIER.levelBonus,
  minion: MINION_MODIFIER.levelBonus,
}

export function monsterLevelOf(classId: number, rank: MonsterTargetHudInfo['rank'], difficulty: 0 | 1 | 2, areaId: number): number | undefined {
  const kind = getMonsterKindByHcIdx(classId, difficulty)
  if (!kind) return undefined
  const base = monsterLevelFor(kind, DIFFICULTIES[difficulty], getLevelMonsterLevel113c(areaId, difficulty))
  return kind.boss ? base : base + (RANK_BONUS[rank ?? 'normal'] ?? 0)
}

export const withMonsterLevel = (info: MonsterTargetHudInfo, classId: number, world: { readonly difficulty: 0 | 1 | 2; readonly areaId: number }): MonsterTargetHudInfo => ({ ...info, level: monsterLevelOf(classId, info.rank, world.difficulty, world.areaId) })

export const titleWithLevel = <T extends { readonly paddedTitle: string }>(title: T, level: number | undefined): T => (level === undefined ? title : { ...title, paddedTitle: `  ${title.paddedTitle.trim()} (Lv ${level})  ` })
