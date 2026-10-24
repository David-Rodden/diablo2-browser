import { describe, expect, it } from 'vitest'
import { XpLedger } from '../../src/client/guide/xp-ledger.ts'
import { levelProgress } from '../../src/client/guide/training.ts'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
}
const MINUTE = 60_000

describe('experience ledger', () => {
  it('trusts an area only after a few minutes there, near the current level', () => {
    const ledger = new XpLedger(memory())
    ledger.add('Hero', 3, 20, 4000, 2 * MINUTE)
    expect(ledger.rate('Hero', 3, 20)).toBeUndefined()
    ledger.add('Hero', 3, 20, 2000, 2 * MINUTE)
    expect(ledger.rate('Hero', 3, 20)).toBeCloseTo(levelProgress(20, 6000) / 4)
    expect(ledger.rate('Hero', 3, 30)).toBeUndefined()
    expect(ledger.rate('Other', 3, 20)).toBeUndefined()
  })

  it('ignores short visits and remembers across sessions', () => {
    const store = memory()
    new XpLedger(store).add('Hero', 3, 20, 9000, 10_000)
    new XpLedger(store).add('Hero', 4, 20, 9000, 4 * MINUTE)
    const reopened = new XpLedger(store)
    expect(reopened.rate('Hero', 3, 20)).toBeUndefined()
    expect(reopened.rate('Hero', 4, 20)).toBeGreaterThan(0)
  })
})
