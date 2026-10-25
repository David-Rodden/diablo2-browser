import THREAT from '../../common/skills/data/monster-threat.json'
import { CHAMPION_MODIFIER, MINION_MODIFIER, UNIQUE_MODIFIER, getMonsterKindByHcIdx, scaleMonsterKindForLevel113c } from '../../common/units/monsters-data.ts'
import { monsterLevelOf } from '../ui/monster-level.ts'

export type Rank = 'normal' | 'champion' | 'unique' | 'superunique' | 'minion' | 'boss'

export interface Foe {
  readonly classId: number
  readonly rank: Rank
  readonly modifiers: readonly string[]
}

export interface Defender {
  readonly name: string
  readonly level: number
  readonly defense: number
  readonly resists: Readonly<Record<'fire' | 'cold' | 'lightning' | 'poison', number>>
  readonly difficulty: 0 | 1 | 2
  readonly areaId: number
  readonly guarded: boolean
}

export interface Danger {
  readonly dps: number
  readonly trusted: boolean
}

interface Entry {
  readonly dps: number
  readonly ms: number
}

type Book = Record<string, Record<string, Entry>>

const KEY = 'd2web.autopilot.threat.v2'
const PRIOR_CACHE = 2000
const DIFFICULTIES = ['normal', 'nightmare', 'hell'] as const
const RESISTED: Readonly<Record<string, keyof Defender['resists']>> = { fire: 'fire', ltng: 'lightning', cold: 'cold', pois: 'poison' }
const BONUS: Partial<Record<Rank, { readonly dmgBonusPct: Readonly<Record<(typeof DIFFICULTIES)[number], number>> }>> = { champion: CHAMPION_MODIFIER, unique: UNIQUE_MODIFIER, superunique: UNIQUE_MODIFIER, minion: MINION_MODIFIER }
const AFFIXES: Readonly<Record<string, number>> = THREAT.affixes
const entryKey = (me: Defender, classId: number) => `${me.difficulty}:${classId}:${me.guarded ? 'guarded' : 'exposed'}`
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export function priorDps(classId: number, me: Defender): number {
  const kind = getMonsterKindByHcIdx(classId, me.difficulty)
  if (!kind) return THREAT.unknownDps
  const level = monsterLevelOf(classId, 'normal', me.difficulty, me.areaId) ?? 1
  const scaled = scaleMonsterKindForLevel113c(kind, DIFFICULTIES[me.difficulty], level)
  const chance = clamp(((2 * scaled.a1ToHit) / Math.max(1, scaled.a1ToHit + me.defense)) * (level / (level + me.level)), 0.05, 0.95)
  const elemental = scaled.elementalAttacks.reduce((sum, attack) => {
    const resisted = RESISTED[attack.type]
    const hit = ((attack.minDamage ?? attack.min ?? 0) + (attack.maxDamage ?? attack.max ?? 0)) / 2
    return resisted ? sum + hit * (attack.chancePct / 100) * Math.max(0, 1 - me.resists[resisted] / 100) : sum
  }, 0)
  return Math.max(THREAT.floorDps, (((scaled.a1MinD + scaled.a1MaxD) / 2) * chance + elemental) * THREAT.attacksPerSecond)
}

export const rankFactor = (foe: Foe, difficulty: 0 | 1 | 2): number => (1 + (BONUS[foe.rank]?.dmgBonusPct[DIFFICULTIES[difficulty]] ?? 0) / 100) * foe.modifiers.reduce((factor, modifier) => factor * (AFFIXES[modifier] ?? 1), 1)

const readBook = (store: Pick<Storage, 'getItem'> | null): Book => {
  try {
    return (JSON.parse(store?.getItem(KEY) ?? '{}') as Book | null) ?? {}
  } catch {
    return {}
  }
}

export class ThreatSense {
  private readonly book: Book
  private window: { at: number; lost: number; life: number } | null = null
  private savedAt = Number.NEGATIVE_INFINITY
  private readonly priors = new Map<string, number>()

  constructor(private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
    this.book = readBook(store)
  }

  private learned(me: Defender, classId: number): Entry | undefined {
    return this.book[me.name]?.[entryKey(me, classId)]
  }

  private prior(me: Defender, classId: number): number {
    const key = `${classId}:${me.difficulty}:${me.areaId}:${me.level}:${me.defense}:${Object.values(me.resists).join()}`
    const known = this.priors.get(key)
    if (known !== undefined) return known
    if (this.priors.size > PRIOR_CACHE) this.priors.clear()
    const dps = priorDps(classId, me)
    this.priors.set(key, dps)
    return dps
  }

  dpsOf(me: Defender, foe: Foe): number {
    return (this.learned(me, foe.classId)?.dps ?? this.prior(me, foe.classId)) * rankFactor(foe, me.difficulty)
  }

  danger(me: Defender, foes: readonly Foe[]): Danger {
    return { dps: foes.reduce((sum, foe) => sum + this.dpsOf(me, foe), 0), trusted: foes.length > 0 && foes.every((foe) => (this.learned(me, foe.classId)?.ms ?? 0) >= THREAT.trustMs) }
  }

  observe(me: Defender, life: number, near: () => readonly Foe[], nowMs: number): void {
    const window = (this.window ??= { at: nowMs, lost: 0, life })
    window.lost += Math.max(0, window.life - life)
    window.life = life
    if (nowMs - window.at < THREAT.windowMs) return
    this.window = { at: nowMs, lost: 0, life }
    const foes = me.name ? near() : []
    if (foes.length === 0) return
    const seconds = (nowMs - window.at) / 1000
    const shares = new Map<number, number>()
    foes.forEach((foe) => shares.set(foe.classId, (shares.get(foe.classId) ?? 0) + this.dpsOf(me, foe)))
    const predicted = [...shares.values()].reduce((sum, dps) => sum + dps, 0)
    const ratio = Math.min(THREAT.maxRatio, window.lost / seconds / Math.max(1e-6, predicted))
    const book = (this.book[me.name] ??= {})
    shares.forEach((share, classId) => {
      const entry = this.learned(me, classId) ?? { dps: this.prior(me, classId), ms: 0 }
      book[entryKey(me, classId)] = { dps: Math.max(THREAT.floorDps, entry.dps * (1 + THREAT.learningRate * (share / predicted) * (ratio - 1))), ms: entry.ms + seconds * 1000 }
    })
    if (nowMs - this.savedAt < THREAT.saveMs) return
    this.savedAt = nowMs
    try {
      this.store?.setItem(KEY, JSON.stringify(this.book))
    } catch {
      return
    }
  }
}
