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

/** 1.13c D2BitBufferStrc quest bits. */
export const QUEST_FLAG_COMPLETED_113C = 0x0001 // reward granted
export const QUEST_FLAG_REWARD_PENDING_113C = 0x0002 // objective done, NPC reward pending
export const QUEST_FLAG_STARTED_113C = 0x0004 // quest accepted
export const QUEST_FLAG_CUSTOM_4_113C = 0x0010 // QFLAG_CUSTOM1 (bit 4): A3Q1 Cain showed Golden Bird ('g34', 0x6fd08c09)
export const QUEST_FLAG_CUSTOM_5_113C = 0x0020 // QFLAG_CUSTOM2 (bit 5): A2Q1 ('ass') & A3Q1 ('xyz') consumable reward armed
export const QUEST_FLAG_CUSTOM_6_113C = 0x0040 // QFLAG_CUSTOM3 (bit 6): A3Q1 Jade Figurine ('j34') picked up (0x6fd07734)
export const QUEST_FLAG_CUSTOM_7_113C = 0x0080 // QFLAG_CUSTOM4 (bit 7): A5Q3 ('tr2') Scroll of Resistance consumed (+10 all resist active)
export const QUEST_FLAG_CUSTOM_8_113C = 0x0100 // QFLAG_CUSTOM5 (bit 8): A5Q3 ('tr2') Scroll of Resistance granted by Malah
export const QUEST_FLAG_CUSTOM_9_113C = 0x0200 // QFLAG_CUSTOM6 (bit 9): NPC secondary reward granted (A1Q2 Kashya merc / A1Q3 Akara ring / A3Q2 Asheara merc)
export const QUEST_FLAG_CUSTOM_10_113C = 0x0400 // QFLAG_CUSTOM7 (bit 10): A5Q3 Anya class-specific Rare item granted (0x6fc7f9c7)
export const QUEST_FLAG_PRIMARY_GOAL_DONE_113C = 0x1000
export const QUEST_FLAG_COMPLETED_NOW_113C = 0x2000 // QFLAG_COMPLETEDNOW (bit 13: reward consumed in session)

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

export function clearQuestFlag113c(
  quests: Uint16Array,
  questId: string,
  mask: number,
): boolean {
  const idx = questWordIndex113c(questId)
  if (idx === undefined) return false
  const prev = quests[idx] ?? 0
  const next = prev & ~mask
  if (next === prev) return false
  quests[idx] = next
  return true
}

/** Quest-gated areas with the exact 1.13c required bit (STARTED vs COMPLETED). */
export const QUEST_AREA_GATES_113C: Readonly<
  Record<number, { readonly quest: string; readonly mask: number }>
> = Object.freeze({
  38: { quest: 'a1q3', mask: QUEST_FLAG_STARTED_113C }, // Tristram red portal
  46: { quest: 'a2q5', mask: QUEST_FLAG_COMPLETED_113C }, // Canyon of the Magi: Summoner dead
  73: { quest: 'a2q2', mask: QUEST_FLAG_COMPLETED_113C }, // Tal Rasha's Chamber: staff used
  74: { quest: 'a2q3', mask: QUEST_FLAG_STARTED_113C }, // Arcane Sanctuary: after Tainted Sun
  100: { quest: 'a3q3', mask: QUEST_FLAG_COMPLETED_113C }, // Durance of Hate 1: Khalim's Will
  101: { quest: 'a3q3', mask: QUEST_FLAG_COMPLETED_113C }, // Durance of Hate 2
  102: { quest: 'a3q3', mask: QUEST_FLAG_COMPLETED_113C }, // Durance of Hate 3
  128: { quest: 'a5q5', mask: QUEST_FLAG_COMPLETED_113C }, // Worldstone Keep 1
  129: { quest: 'a5q5', mask: QUEST_FLAG_COMPLETED_113C }, // Worldstone Keep 2
  131: { quest: 'a5q5', mask: QUEST_FLAG_COMPLETED_113C }, // Throne of Destruction
})

/** Quest objects that advance a quest when operated (Objects.txt class id). */
export const QUEST_OBJECT_TO_QUEST_113C: Readonly<Record<number, string>> = Object.freeze({
  8: 'a1q4', // The Moldy Tome (TowerTome, OperateFn 6 -> Forgotten Tower, D2Game 0x6fc861b0)
  17: 'a1q3', // Cairn Stone
  18: 'a1q3',
  19: 'a1q3',
  20: 'a1q3',
  21: 'a1q3',
  26: 'a1q3', // Cain's Gibbet
  30: 'a1q3', // Inifuss
  108: 'a1q5', // Horadric Malus
  149: 'a2q3', // Tainted Sun Altar
  193: 'a3q4', // Lam Esen's Tome
  251: 'a3q2', // Gidbinn Altar
  252: 'a3q2', // Gidbinn
  357: 'a2q4', // Horazon's Journal
  376: 'a4q2', // Hellforge
  392: 'a4q3', // Chaos Sanctuary Seal
  393: 'a4q3',
  394: 'a4q3',
  395: 'a4q3',
  396: 'a4q3',
  404: 'a3q3', // Compelling Orb
  546: 'a5q5', // Ancients' Altar
  473: 'a5q2', // Cage (rescue barbarians)
  558: 'a5q3', // Frozen Anya
})

/**
 * `D2Game.dll` @ `0x6fd03ce0..0x6fd03df0` (`ACT3Q1_StatusFilter`, questId `0x12`, word 20):
 * resolves the `S2C 0x52` / `0x5D` quest status byte (`0..5, 11, 13`) for `a3q1` (The Golden Bird).
 */
export function computeA3Q1StatusByte113c(
  quests: ArrayLike<number>,
  hasJ34: boolean,
  hasG34: boolean,
): number {
  const idx = questWordIndex113c('a3q1') ?? 20
  const w = (quests[idx] ?? 0) & 0xffff
  if ((w & QUEST_FLAG_REWARD_PENDING_113C) !== 0) return 5
  if ((w & QUEST_FLAG_COMPLETED_113C) !== 0) {
    return (w & QUEST_FLAG_COMPLETED_NOW_113C) !== 0 ? 13 : 11
  }
  if (hasG34) {
    return (w & QUEST_FLAG_CUSTOM_4_113C) !== 0 ? 4 : 3
  }
  if (hasJ34) {
    return (w & QUEST_FLAG_STARTED_113C) !== 0 ? 2 : 1
  }
  if ((w & QUEST_FLAG_CUSTOM_4_113C) !== 0) return 4
  if ((w & QUEST_FLAG_STARTED_113C) !== 0) return 2
  if ((w & QUEST_FLAG_CUSTOM_6_113C) !== 0) return 1
  return 0
}

/**
 * `D2Game.dll` `.rdata` `0x6FD2F15C..0x6FD2F3BF` & `0x6FC7F987..0x6FC7FA18` (`ACT5Q3` Anya Rare reward):
 * Tier 0 = Normal (`0x6FD2F1CC`), Tier 1 = Exceptional (`0x6FD2F194`, Nightmare `clvl > 45`),
 * Tier 2 = Elite (`0x6FD2F15C`, Hell `clvl > 65`), indexed by `[tier][classId]` (`0..6`: ama, sor, nec, pal, bar, dru, ass).
 */
export const ANYA_CLASS_REWARD_POOLS_113C: readonly (readonly (readonly string[])[])[] = Object.freeze([
  // Tier 0: Normal (0x6FD2F1CC)
  Object.freeze([
    Object.freeze(['am1', 'am2', 'am3', 'am4', 'am5']),
    Object.freeze(['ob1', 'ob2', 'ob3', 'ob4', 'ob5']),
    Object.freeze(['ne1', 'ne2', 'ne3', 'ne4', 'ne5']),
    Object.freeze(['pa1', 'pa2', 'pa3', 'pa4', 'pa5']),
    Object.freeze(['ba1', 'ba2', 'ba3', 'ba4', 'ba5']),
    Object.freeze(['dr1', 'dr2', 'dr3', 'dr4', 'dr5']),
    Object.freeze(['ktr', 'wrb', 'axf', 'ces', 'clw', 'btl', 'skr']),
  ]),
  // Tier 1: Exceptional (0x6FD2F194)
  Object.freeze([
    Object.freeze(['am6', 'am7', 'am8', 'am9', 'ama']),
    Object.freeze(['ob6', 'ob7', 'ob8', 'ob9', 'oba']),
    Object.freeze(['ne6', 'ne7', 'ne8', 'ne9', 'nea']),
    Object.freeze(['pa6', 'pa7', 'pa8', 'pa9', 'paa']),
    Object.freeze(['ba6', 'ba7', 'ba8', 'ba9', 'baa']),
    Object.freeze(['dr6', 'dr7', 'dr8', 'dr9', 'dra']),
    Object.freeze(['9ar', '9wb', '9xf', '9cs', '9lw', '9tw', '9qr']),
  ]),
  // Tier 2: Elite (0x6FD2F15C)
  Object.freeze([
    Object.freeze(['amb', 'amc', 'amd', 'ame', 'amf']),
    Object.freeze(['obb', 'obc', 'obd', 'obe', 'obf']),
    Object.freeze(['neb', 'nec', 'ned', 'nee', 'nef']),
    Object.freeze(['pab', 'pac', 'pad', 'pae', 'paf']),
    Object.freeze(['bab', 'bac', 'bad', 'bae', 'baf']),
    Object.freeze(['drb', 'drc', 'drd', 'dre', 'drf']),
    Object.freeze(['7ar', '7wb', '7xf', '7cs', '7lw', '7tw', '7qr']),
  ]),
])

