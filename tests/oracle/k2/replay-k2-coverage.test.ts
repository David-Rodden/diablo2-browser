/**
 * K2 replay coverage & runtime VA execution fixtures
 * (`tests/fixtures/oracle/k1/replay/<scenario>.coverage.ndjson.gz` vs live `va-trace-113c` in `runReplay113c`).
 */
import { describe, expect, it } from 'vitest'
import {
  computeGaps113c,
  loadCoverage113c,
  renderCombinedGapMd113c,
  renderScenarioGapMd113c,
} from '../../../tools/oracle/kern-replay/gap-report.ts'
import {
  loadManifest113c,
  loadScenario113c,
  manifestKey113c,
  runReplay113c,
} from '../../../tools/oracle/kern-replay/replay-113c.ts'

interface K2CoverageBaseline113c {
  readonly name: 'a1-bloodmoor-melee' | 'p52-dot-ticks' | 'p52-item-defense'
  readonly frames: number
  readonly totalHits: number
  readonly d2CommonExecuted: number
  readonly d2GameExecuted: number
  readonly initialD2GameGapCount: number
  readonly initialD2GameGapVas: readonly string[]
}

const K2_COVERAGE_BASELINES_113C: readonly K2CoverageBaseline113c[] = [
  {
    name: 'a1-bloodmoor-melee',
    frames: 1800,
    totalHits: 1045,
    d2CommonExecuted: 572,
    d2GameExecuted: 473,
    initialD2GameGapCount: 10,
    initialD2GameGapVas: [
      '0x6FC95210',
      '0x6FCB0F30',
      '0x6FC96740',
      '0x6FC9A260',
      '0x6FCABA50',
      '0x6FC21480',
      '0x6FC2F2F0',
      '0x6FC2F700',
      '0x6FC21CD0',
      '0x6FCAB010',
    ],
  },
  {
    name: 'p52-dot-ticks',
    frames: 1200,
    totalHits: 1119,
    d2CommonExecuted: 620,
    d2GameExecuted: 499,
    initialD2GameGapCount: 39,
    initialD2GameGapVas: [
      '0x6FC95210',
      '0x6FCB0F30',
      '0x6FC96740',
      '0x6FC9A260',
      '0x6FCABA50',
      '0x6FC21480',
      '0x6FC2F2F0',
      '0x6FC2F700',
      '0x6FCAB710',
      '0x6FCC2100',
      '0x6FC98840',
      '0x6FC21250',
      '0x6FC41880',
      '0x6FC63AA0',
      '0x6FC8F620',
      '0x6FC8F660',
      '0x6FC8F8A0',
      '0x6FC8F930',
      '0x6FCB1340',
      '0x6FCC2800',
      '0x6FC5AA20',
      '0x6FC5AD30',
      '0x6FC5E3F0',
      '0x6FC5F320',
      '0x6FC5F540',
      '0x6FD00A20',
      '0x6FC58FB0',
      '0x6FC59B40',
      '0x6FC5A4E0',
      '0x6FC5AE10',
      '0x6FC5AFF0',
      '0x6FC5E590',
      '0x6FC5EDE0',
      '0x6FC8F880',
      '0x6FD13360',
      '0x6FC57110',
      '0x6FC58E60',
      '0x6FCBF7A0',
      '0x6FC94870',
    ],
  },
  {
    name: 'p52-item-defense',
    frames: 1600,
    totalHits: 1039,
    d2CommonExecuted: 571,
    d2GameExecuted: 468,
    initialD2GameGapCount: 41,
    initialD2GameGapVas: [
      '0x6FC570E0',
      '0x6FC57110',
      '0x6FC57190',
      '0x6FCBE290',
      '0x6FCF1AA0',
      '0x6FCF43E0',
      '0x6FCF4630',
      '0x6FCF4670',
      '0x6FCF46B0',
      '0x6FCF47C0',
      '0x6FCB0F30',
      '0x6FCCCDA0',
      '0x6FCCD910',
      '0x6FCCDCE0',
      '0x6FCCF710',
      '0x6FD13360',
      '0x6FC96740',
      '0x6FC94C30',
      '0x6FC21CD0',
      '0x6FCAB010',
      '0x6FC62EC0',
      '0x6FC630D0',
      '0x6FC9A4C0',
      '0x6FCAD210',
      '0x6FCBE610',
      '0x6FCBEFE0',
      '0x6FCC0370',
      '0x6FCC0C70',
      '0x6FD114F0',
      '0x6FD117E0',
      '0x6FCAB710',
      '0x6FCC1D10',
      '0x6FCC2100',
      '0x6FC210D0',
      '0x6FC6E230',
      '0x6FCBA1A0',
      '0x6FCBA8D0',
      '0x6FCC00B0',
      '0x6FCC1E80',
      '0x6FD00570',
      '0x6FC97820',
    ],
  },
]

const DONE_STATUSES_113C = new Set(['ported', 'diff-verified'])

function formatVa113c(va: number): string {
  return `0x${(va >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}

for (const spec of K2_COVERAGE_BASELINES_113C) {
  describe(`K2 replay coverage ${spec.name}`, () => {
    const cov = loadCoverage113c(spec.name)
    const scenario = loadScenario113c(spec.name)

    it('covers every frame of the scenario with non-empty executed function coverage', () => {
      expect(cov.from).toBe(1)
      expect(cov.to).toBe(spec.frames)
      expect(cov.to).toBe(scenario.frames)
      expect(cov.entries).toBe(loadManifest113c().size)
      expect(cov.hit).toBeGreaterThan(0)
      expect(cov.hit).toBe(spec.totalHits)
      expect(cov.hits.length).toBe(spec.totalHits)
    })

    it('every hit is a unique manifest function first seen inside the recorded frame range', () => {
      const manifest = loadManifest113c()
      const seen = new Set<string>()
      for (const h of cov.hits) {
        const key = manifestKey113c(h.module, h.va)
        expect(manifest.has(key), key).toBe(true)
        expect(seen.has(key), key).toBe(false)
        seen.add(key)
        expect(h.firstFrame).toBeGreaterThanOrEqual(cov.from)
        expect(h.firstFrame).toBeLessThanOrEqual(cov.to)
      }
    })

    it('frame root runs from F1 and the C2S dispatcher first runs on the first input frame', () => {
      const byKey = new Map(cov.hits.map((h) => [manifestKey113c(h.module, h.va), h.firstFrame]))
      expect(byKey.get('D2Game:0x6FC4E050')).toBe(1)
      const firstInput = Math.min(...scenario.inputs.map((i) => i.frame))
      expect(byKey.get('D2Game:0x6FCEC550')).toBe(firstInput)
    })

    it('computes honest manifestGap + runtimeExecGap (tsExecutedVas vs dllExecutedVas) with 0 impure hits', () => {
      expect(spec.initialD2GameGapVas.length).toBe(spec.initialD2GameGapCount)

      const replay = runReplay113c(spec.name)
      expect(replay.bootCheck).toBeNull()
      expect(replay.tsExecutedVas.length).toBeGreaterThan(0)
      expect(replay.tsExecutedVas).toContain('D2Game:0x6FC4E050')

      const s = computeGaps113c(spec.name, { tsExecutedVas: replay.tsExecutedVas })
      const manifest = loadManifest113c()
      const hitKeySet = new Set(cov.hits.map((h) => manifestKey113c(h.module, h.va)))
      const tsSet = new Set(replay.tsExecutedVas)

      expect(s.executed.D2Common).toEqual({
        total: spec.d2CommonExecuted,
        done: spec.d2CommonExecuted,
        gap: 0,
        gapBytes: 0,
      })
      expect(s.manifestGap.filter((g) => g.module === 'D2Common')).toEqual([])
      expect(s.impure).toEqual([])

      expect(s.executed.D2Game?.total).toBe(spec.d2GameExecuted)
      for (const vaHex of spec.initialD2GameGapVas) {
        expect(hitKeySet.has(`D2Game:${vaHex}`), `D2Game:${vaHex} must be in recorded coverage`).toBe(true)
      }

      // Exact manifestGap invariance: every DLL-executed D2Game VA whose manifest status is unported
      const expectedManifestGapVas = [...cov.hits]
        .filter((h) => h.module === 'D2Game' && !DONE_STATUSES_113C.has(manifest.get(manifestKey113c(h.module, h.va))!.status))
        .sort((a, b) => a.firstFrame - b.firstFrame || a.va - b.va)
        .map((h) => formatVa113c(h.va))
      const actualManifestGapVas = s.manifestGap.filter((g) => g.module === 'D2Game').map((g) => formatVa113c(g.va))

      expect(s.executed.D2Game!.gap).toBe(expectedManifestGapVas.length)
      expect(s.executed.D2Game!.done).toBe(spec.d2GameExecuted - expectedManifestGapVas.length)
      expect(actualManifestGapVas).toEqual(expectedManifestGapVas)

      // Exact runtimeExecGap invariance: every DLL-executed VA not actually hit at runtime by TS
      const expectedRuntimeGapKeys = [...cov.hits]
        .sort((a, b) => a.firstFrame - b.firstFrame || a.va - b.va)
        .map((h) => manifestKey113c(h.module, h.va))
        .filter((k) => !tsSet.has(k))
      const actualRuntimeGapKeys = s.runtimeExecGap.map((g) => manifestKey113c(g.module, g.va))
      expect(actualRuntimeGapKeys).toEqual(expectedRuntimeGapKeys)

      const rg = s.runtimeExecuted.D2Game!
      expect(rg.dllExecuted).toBe(spec.d2GameExecuted)
      expect(rg.tsExecuted).toBeGreaterThan(0)
      expect(rg.tsExecuted + rg.runtimeGap).toBe(spec.d2GameExecuted)

      const rc = s.runtimeExecuted.D2Common!
      expect(rc.dllExecuted).toBe(spec.d2CommonExecuted)
      expect(rc.tsExecuted).toBeGreaterThan(0)
      expect(rc.tsExecuted + rc.runtimeGap).toBe(spec.d2CommonExecuted)

      // Markdown renderers report both tsExecuted / dllExecuted and manifestUnported / runtimeExecGap
      const scenarioMd = renderScenarioGapMd113c(s)
      expect(scenarioMd).toContain(`| D2Game | ${spec.d2GameExecuted} | ${rg.tsExecuted} / ${rg.dllExecuted} |`)
      const combinedMd = renderCombinedGapMd113c([s])
      expect(combinedMd).toContain(`| \`${spec.name}\` | \`${rg.tsExecuted} / ${rg.dllExecuted}\``)
    })
  })
}

const DIFF_VERIFIED_K2_ITEMDROP_VAS_113C = [
  '0x6FC2E5D0',
  '0x6FC2E930',
  '0x6FC2EA10',
  '0x6FC2EA70',
  '0x6FC2EBB0',
  '0x6FC2EC90',
  '0x6FC2EE90',
  '0x6FC2F260',
  '0x6FC2FC40',
  '0x6FC30550',
  '0x6FC307B0',
  '0x6FC30A20',
  '0x6FC31070',
  '0x6FC31490',
  '0x6FC31880',
  '0x6FC32380',
  '0x6FC32D60',
  '0x6FC32EE0',
  '0x6FC33DE0',
  '0x6FC95680',
  '0x6FC95900',
] as const

const DIFF_VERIFIED_K2_REPLAY_COMMON_VAS_113C = [
  '0x6FC400E0',
  '0x6FC40760',
  '0x6FC40E00',
  '0x6FC417D0',
  '0x6FCBD980',
  '0x6FCBDC10',
] as const

const DIFF_VERIFIED_K2_REPLAY_SCENARIO_VAS_113C = [
  '0x6FC57190',
  '0x6FCBF850',
  '0x6FCCCDA0',
  '0x6FCCD910',
  '0x6FCCDCE0',
] as const

describe('K2 diff-verified D2Game itemdrop, combat & S2C runtime execution parity', () => {
  it('executes all diff-verified K2 D2Game VAs in both Wine DLL and TS with strict t0+t1+t4+s2c+gs zero divergence', () => {
    const unionBoth = new Set<string>()
    for (const scen of ['a1-bloodmoor-melee', 'p52-dot-ticks', 'p52-item-defense'] as const) {
      const replay = runReplay113c(scen)
      expect(replay.bootCheck).toBeNull()
      expect(replay.strictHorizon).toBe(replay.lastGoldenFrame)
      expect(replay.firstStrictDivergence).toBeNull()
      const gap = computeGaps113c(scen, { tsExecutedVas: replay.tsExecutedVas })
      const dllSet = new Set(gap.dllExecutedVas)
      const tsSet = new Set(replay.tsExecutedVas)
      for (const k of replay.tsExecutedVas) {
        if (dllSet.has(k)) unionBoth.add(k)
      }
      for (const va of [
        ...DIFF_VERIFIED_K2_ITEMDROP_VAS_113C,
        ...DIFF_VERIFIED_K2_REPLAY_COMMON_VAS_113C,
      ]) {
        const key = `D2Game:${va}`
        expect(dllSet.has(key), `${scen} dllExecutedVas missing ${key}`).toBe(true)
        expect(tsSet.has(key), `${scen} tsExecutedVas missing ${key}`).toBe(true)
      }
    }
    for (const va of DIFF_VERIFIED_K2_REPLAY_SCENARIO_VAS_113C) {
      const key = `D2Game:${va}`
      expect(unionBoth.has(key), `K2 union dll∩ts missing ${key}`).toBe(true)
    }
  })
})
