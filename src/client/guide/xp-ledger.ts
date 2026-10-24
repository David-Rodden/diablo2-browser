import TRAINING from './data/training.json'
import { levelProgress } from './training.ts'

interface Sample {
  readonly level: number
  readonly xp: number
  readonly ms: number
}

type Book = Record<string, Record<string, Sample[]>>

const KEY = 'd2web.autopilot.xp.v1'
const { minMs, trustMs, levelWindow, keep } = TRAINING.ledger

const readBook = (store: Pick<Storage, 'getItem'> | null): Book => {
  try {
    return (JSON.parse(store?.getItem(KEY) ?? '{}') as Book | null) ?? {}
  } catch {
    return {}
  }
}

export class XpLedger {
  private readonly book: Book

  constructor(private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
    this.book = readBook(store)
  }

  add(character: string, area: number, level: number, xp: number, ms: number): void {
    if (ms < minMs || xp < 0 || !character) return
    const areas = (this.book[character] ??= {})
    areas[area] = [...(areas[area] ?? []), { level, xp, ms }].slice(-keep)
    try {
      this.store?.setItem(KEY, JSON.stringify(this.book))
    } catch {
      return
    }
  }

  rate(character: string, area: number, level: number): number | undefined {
    const near = (this.book[character]?.[area] ?? []).filter((sample) => Math.abs(sample.level - level) <= levelWindow)
    const ms = near.reduce((sum, sample) => sum + sample.ms, 0)
    return ms < trustMs ? undefined : near.reduce((sum, sample) => sum + levelProgress(sample.level, sample.xp), 0) / (ms / 60_000)
  }
}
