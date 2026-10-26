type Skips = Record<string, readonly number[]>

const KEY = 'd2web.guide.skipped.v1'

export class SkipMemory {
  private skips: Skips

  constructor(private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
    try {
      this.skips = (JSON.parse(store?.getItem(KEY) ?? '{}') as Skips | null) ?? {}
    } catch {
      this.skips = {}
    }
  }

  rows(character: string): readonly number[] {
    return this.skips[character] ?? []
  }

  add(character: string, row: number): void {
    if (!character || this.rows(character).includes(row)) return
    this.skips = { ...this.skips, [character]: [...this.rows(character), row] }
    try {
      this.store?.setItem(KEY, JSON.stringify(this.skips))
    } catch {
      return
    }
  }
}
