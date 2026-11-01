import { describe, expect, it } from 'vitest'
import { chiSquareHomogeneity, chiSquareSurvival, ksTwoSample } from '../../tools/oracle/lib/stat-tests.ts'
import { D2Rng } from '../../src/common/rng/d2-rng.ts'

function sample(seed: number, n: number, f: (r: D2Rng) => number): number[] {
  const r = new D2Rng(seed)
  return Array.from({ length: n }, () => f(r))
}

describe('oracle statistical fallback (P5.5)', () => {
  it('chi-square survival matches known quantiles', () => {
    expect(chiSquareSurvival(3.841, 1)).toBeCloseTo(0.05, 3)
    expect(chiSquareSurvival(11.07, 5)).toBeCloseTo(0.05, 3)
    expect(chiSquareSurvival(0, 3)).toBe(1)
  })

  it('KS accepts two samples from the same roll distribution and rejects a shifted one', () => {
    const roll = (r: D2Rng): number => 3 + r.rand(8) // min + rand(max - min + 1)
    const a = sample(1, 20000, roll)
    const b = sample(2, 20000, roll)
    expect(ksTwoSample(a, b).pValue).toBeGreaterThan(0.01)
    const shifted = sample(3, 20000, (r) => 4 + r.rand(8))
    expect(ksTwoSample(a, shifted).pValue).toBeLessThan(1e-6)
  })

  it('chi-square detects a different crit rate (10% vs 12%) at 1e5 samples', () => {
    const tally = (seed: number, pct: number): Map<string, number> => {
      const m = new Map<string, number>()
      for (const v of sample(seed, 100000, (r) => (r.rand(100) < pct ? 1 : 0))) {
        m.set(String(v), (m.get(String(v)) ?? 0) + 1)
      }
      return m
    }
    expect(chiSquareHomogeneity(tally(5, 10), tally(6, 10)).pValue).toBeGreaterThan(0.01)
    expect(chiSquareHomogeneity(tally(5, 10), tally(7, 12)).pValue).toBeLessThan(1e-6)
  })
})
