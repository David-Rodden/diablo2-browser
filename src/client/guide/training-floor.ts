type Floors = Record<string, { readonly quest: number; readonly level: number }>

const KEY = 'd2web.autopilot.training.v1'

export class TrainingFloor {
  private floors: Floors

  constructor(private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
    try {
      this.floors = (JSON.parse(store?.getItem(KEY) ?? '{}') as Floors | null) ?? {}
    } catch {
      this.floors = {}
    }
  }

  of(character: string, quest: number): number {
    const floor = this.floors[character]
    return floor?.quest === quest ? floor.level : 0
  }

  set(character: string, quest: number, level: number): void {
    if (!character) return
    this.floors = { ...this.floors, [character]: { quest, level } }
    try {
      this.store?.setItem(KEY, JSON.stringify(this.floors))
    } catch {
      return
    }
  }
}
