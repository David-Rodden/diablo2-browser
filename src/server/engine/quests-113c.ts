/**
 * 1.13c server-side quest flags (`.d2s` "Woo!" block / S2C 0x29 GameQuestLog).
 *
 * Each difficulty stores 48 little-endian words. The act bases and quest word indices
 * match `src/client/ui/panels/quest-waypoint-data.ts`: word 0 = Act I intro,
 * 1..6 = Act I quests, 9..14 = Act II, 17..22 = Act III, 25..27 = Act IV, 35..40 = Act V.
 */
import { CANONICAL_QUESTS_BY_ACT } from '../../common/data/canonical-quest-data.ts'

export interface QuestFlagInfo113c {
  readonly act: number
  readonly wordIndex: number
  readonly titleEn: string
}

const ACT_BASE: Readonly<Record<number, number>> = { 1: 1, 2: 9, 3: 17, 4: 25, 5: 35 }

export const QUEST_INFO_BY_ID_113C: ReadonlyMap<string, QuestFlagInfo113c> = (() => {
  const out = new Map<string, QuestFlagInfo113c>()
  for (const act of [1, 2, 3, 4, 5]) {
    const base = ACT_BASE[act]!
    for (const quest of CANONICAL_QUESTS_BY_ACT[act] ?? []) {
      const m = /^qstsa(\d)q(\d)$/.exec(quest.titleKey)
      if (!m || Number(m[1]) !== act) continue
      out.set(quest.id, {
        act,
        wordIndex: base + Number(m[2]) - 1,
        titleEn: quest.titleEn,
      })
    }
  }
  return out
})()

/** Bit 0: quest completed / reward granted. Bit 1: quest accepted (in progress). */
export const QUEST_FLAG_COMPLETED_113C = 0x0001
export const QUEST_FLAG_STARTED_113C = 0x0002

export function questWordIndex113c(questId: string): number | undefined {
  return QUEST_INFO_BY_ID_113C.get(questId)?.wordIndex
}

export function hasQuestFlag113c(
  quests: Uint16Array,
  questId: string,
  mask: number,
): boolean {
  const idx = questWordIndex113c(questId)
  return idx !== undefined && ((quests[idx] ?? 0) & mask) !== 0
}

export function setQuestFlag113c(
  quests: Uint16Array,
  questId: string,
  mask: number,
): boolean {
  const idx = questWordIndex113c(questId)
  if (idx === undefined) return false
  const next = (quests[idx] ?? 0) | mask
  if (next === quests[idx]) return false
  quests[idx] = next
  return true
}

/** Quest-gated areas: entering requires the quest to be accepted or completed. */
export const QUEST_AREA_GATES_113C: Readonly<Record<number, string>> = Object.freeze({
  38: 'a1q3', // Tristram
  74: 'a2q4', // Arcane Sanctuary
  102: 'a3q6', // Durance of Hate Level 2
  103: 'a3q6', // Durance of Hate Level 3
  108: 'a4q3', // Chaos Sanctuary
  120: 'a5q5', // Arreat Summit
  128: 'a5q6', // Worldstone Keep Level 1
  129: 'a5q6', // Worldstone Keep Level 2
})

/** Quest objects that advance a quest when operated (Objects.txt class id). */
export const QUEST_OBJECT_TO_QUEST_113C: Readonly<Record<number, string>> = Object.freeze({
  30: 'a1q3', // Inifuss
  149: 'a2q3', // Tainted Sun Altar
  193: 'a3q4', // Lam Esen's Tome
  376: 'a4q2', // Hellforge
  392: 'a4q3', // Chaos Sanctuary Seal
  393: 'a4q3',
  394: 'a4q3',
  395: 'a4q3',
  396: 'a4q3',
  404: 'a3q3', // Compelling Orb
  546: 'a5q5', // Ancients' Altar
})