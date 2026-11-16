/**
 * Milestone 34 ([K3]) Longitudinal Golden Replay Suite:
 * Replays all 9 [K3] `p52-*` scenarios from their F2 boot snapshots
 * (`tests/fixtures/oracle/k3/replay/<scenario>.snap-f002.ndjson.gz`) through the pure
 * `ReplayKernel113c` (`src/d2kern-113c/`) against the authoritative 1.13c oracle goldens
 * (`tests/fixtures/oracle/golden/<scenario>.oracle.ndjson.gz`), enforces upward-only
 * ratchet horizons (`tests/fixtures/oracle/k3/replay/horizons.json`), verifies committed
 * divergence artifacts (`docs/oracle/k3-replay/<scenario>.divergence.json`), and locks in
 * dynamic `D2Common.dll` / `D2Game.dll` coverage baselines (`<scenario>.coverage.ndjson.gz`).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { D2GameStrc, D2UnitStrc } from '../../../src/d2kern-113c/mem/layout.generated.ts'
import { collectImportGraph, legacyReachable } from '../../../tools/oracle/kern-replay/import-graph.ts'
import {
  K3_DIVERGENCE_DIR_113C,
  K3_REPLAY_SCENARIOS_113C,
  computeK3Gaps113c,
  k3SnapshotPath113c,
  loadK3Coverage113c,
  loadK3Horizons113c,
  runK3Replay113c,
  type K3ReplayScenarioName113c,
} from '../../../tools/oracle/kern-replay/k3-replay.ts'
import {
  REPO_ROOT_113C,
  bootFromSnapshot113c,
  diffFrame113c,
  goldenPath113c,
  loadGolden113c,
  loadManifest113c,
  loadScenario113c,
  loadSnapshotFile113c,
  manifestKey113c,
  sampleFrame113c,
} from '../../../tools/oracle/kern-replay/replay-113c.ts'
import type { DivergenceArtifact113c } from '../../../tools/oracle/kern-replay/report.ts'

interface K3CoverageBaseline113c {
  readonly name: K3ReplayScenarioName113c
  readonly frames: number
  readonly totalHits: number
  readonly d2CommonExecuted: number
  readonly d2GameExecuted: number
  readonly initialD2GameGapCount: number
  readonly initialD2GameGapBytes: number
  readonly initialD2GameGapVas: readonly string[]
}

const K3_COVERAGE_BASELINES_113C: readonly K3CoverageBaseline113c[] = [
  {
    name: 'p52-amazon-defense',
    frames: 1800,
    totalHits: 958,
    d2CommonExecuted: 520,
    d2GameExecuted: 438,
    initialD2GameGapCount: 0,
    initialD2GameGapBytes: 0,
    initialD2GameGapVas: [],
  },
  {
    name: 'p52-amazon-valkyrie',
    frames: 1500,
    totalHits: 1132,
    d2CommonExecuted: 641,
    d2GameExecuted: 491,
    initialD2GameGapCount: 8,
    initialD2GameGapBytes: 4938,
    initialD2GameGapVas: [
      '0x6FC6D710',
      '0x6FCB7F50',
      '0x6FCC3090',
      '0x6FCC3610',
      '0x6FC3CAE0',
      '0x6FC3E140',
      '0x6FC3E640',
      '0x6FC3E900',
    ],
  },
  {
    name: 'p52-barbarian-warcries',
    frames: 1600,
    totalHits: 1072,
    d2CommonExecuted: 587,
    d2GameExecuted: 485,
    initialD2GameGapCount: 2,
    initialD2GameGapBytes: 266,
    initialD2GameGapVas: ['0x6FC49720', '0x6FC5EA60'],
  },
  {
    name: 'p52-necromancer-curses',
    frames: 2000,
    totalHits: 1141,
    d2CommonExecuted: 617,
    d2GameExecuted: 524,
    initialD2GameGapCount: 8,
    initialD2GameGapBytes: 4989,
    initialD2GameGapVas: [
      '0x6FC718B0',
      '0x6FCB7F50',
      '0x6FCC3090',
      '0x6FCC3610',
      '0x6FC3E140',
      '0x6FC3E640',
      '0x6FC3E900',
      '0x6FC3CAE0',
    ],
  },
  {
    name: 'p52-necromancer-poison-golem',
    frames: 1800,
    totalHits: 1131,
    d2CommonExecuted: 615,
    d2GameExecuted: 516,
    initialD2GameGapCount: 9,
    initialD2GameGapBytes: 4907,
    initialD2GameGapVas: [
      '0x6FC70070',
      '0x6FC71750',
      '0x6FCB7F50',
      '0x6FCC3090',
      '0x6FCC3610',
      '0x6FC3CAE0',
      '0x6FC3E140',
      '0x6FC3E640',
      '0x6FC3E900',
    ],
  },
  {
    name: 'p52-paladin-auras',
    frames: 1700,
    totalHits: 1083,
    d2CommonExecuted: 601,
    d2GameExecuted: 482,
    initialD2GameGapCount: 0,
    initialD2GameGapBytes: 0,
    initialD2GameGapVas: [],
  },
  {
    name: 'p52-paladin-merc-aura',
    frames: 1700,
    totalHits: 1210,
    d2CommonExecuted: 666,
    d2GameExecuted: 544,
    initialD2GameGapCount: 2,
    initialD2GameGapBytes: 2908,
    initialD2GameGapVas: ['0x6FC3D3C0', '0x6FC3DD40'],
  },
  {
    name: 'p52-sorceress-elemental',
    frames: 1800,
    totalHits: 986,
    d2CommonExecuted: 552,
    d2GameExecuted: 434,
    initialD2GameGapCount: 0,
    initialD2GameGapBytes: 0,
    initialD2GameGapVas: [],
  },
  {
    name: 'p52-sorceress-fire-dot',
    frames: 1800,
    totalHits: 969,
    d2CommonExecuted: 543,
    d2GameExecuted: 426,
    initialD2GameGapCount: 0,
    initialD2GameGapBytes: 0,
    initialD2GameGapVas: [],
  },
]

const DONE_STATUSES_113C = new Set(['ported', 'diff-verified'])

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function formatVa113c(va: number): string {
  return `0x${(va >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}

describe('K3 replay purity & suite roster', () => {
  const entries = ['tools/oracle/kern-replay/k3-replay.ts']
  const graph = collectImportGraph(REPO_ROOT_113C, entries)

  it('k3-replay runner never imports legacy src/common or src/server modules', () => {
    expect(legacyReachable(graph, entries)).toEqual([])
    for (const f of graph.files) {
      expect(f.startsWith('src/server/')).toBe(false)
      expect(f.startsWith('src/common/')).toBe(false)
    }
  })

  it('covers all 9 [K3] p52-* scenarios in horizons.json and coverage baselines', () => {
    const horizons = loadK3Horizons113c()
    expect(Object.keys(horizons).sort()).toEqual([...K3_REPLAY_SCENARIOS_113C].sort())
    expect(K3_COVERAGE_BASELINES_113C.map((b) => b.name)).toEqual([...K3_REPLAY_SCENARIOS_113C])
  })
})

const horizonsByScenario = loadK3Horizons113c()

for (const spec of K3_COVERAGE_BASELINES_113C) {
  const name = spec.name
  const H = horizonsByScenario[name]
  if (H === undefined) throw new Error(`k3/replay/horizons.json has no entry for ${name}`)

  describe(`K3 kernel replay ${name} (boot F${H.bootFrame}, strict F${H.strict}, pos F${H.pos})`, () => {
    const r = runK3Replay113c(name, H.bootFrame)
    const golden = loadGolden113c(name)
    const scenario = loadScenario113c(name)
    const cov = loadK3Coverage113c(name)

    it('hydrated F2 boot snapshot equals the golden boot frame on every field (strict)', () => {
      expect(r.bootCheck).toBeNull()
    })

    it('boot comparison detects a single corrupted player seed bit (negative control)', () => {
      const saveBytes =
        scenario.save !== undefined
          ? new Uint8Array(readFileSync(join(REPO_ROOT_113C, scenario.save)))
          : undefined
      const world = bootFromSnapshot113c(loadSnapshotFile113c(k3SnapshotPath113c(name, H.bootFrame)), saveBytes)
      const pPlayer = world.m.get(world.pGame, D2GameStrc.pUnitHash, 1)
      expect(pPlayer).not.toBe(0)
      expect(world.m.get(pPlayer, D2UnitStrc.dwUnitId)).toBe(1)
      world.m.set(pPlayer, D2UnitStrc.seedLo, (world.m.get(pPlayer, D2UnitStrc.seedLo) ^ 1) >>> 0)
      const bootGolden = golden.frames.get(H.bootFrame)
      expect(bootGolden).toBeDefined()
      const d = diffFrame113c(bootGolden!, sampleFrame113c(world, golden.header), golden.header, 'strict')
      expect(d).toMatchObject({ key: 't0', id: 1, field: 'seedLo' })
      expect(diffFrame113c(bootGolden!, sampleFrame113c(world, golden.header), golden.header, 'pos')).toBeNull()
    })

    it('matches the golden on every frame through the committed strict and position horizons', () => {
      expect(r.bootFrame).toBe(H.bootFrame)
      expect(r.lastGoldenFrame).toBe(spec.frames)
      expect(r.strictHorizon).toBeGreaterThanOrEqual(H.strict)
      expect(r.posHorizon).toBeGreaterThanOrEqual(H.pos)
      expect(r.posHorizon).toBeGreaterThanOrEqual(r.strictHorizon)
    })

    it('stops at an explicit first divergence (or matches through the end of the golden)', () => {
      if (r.strictHorizon === r.lastGoldenFrame) {
        expect(r.firstStrictDivergence).toBeNull()
        return
      }
      const d = r.firstStrictDivergence
      expect(d).not.toBeNull()
      expect(d!.frame).toBe(r.strictHorizon + 1)
      if (d!.key === 'step') {
        expect(r.unportedHit).not.toBeNull()
        expect(d!.field).toBe(`<unported ${r.unportedHit!.key}>`)
      }
      if (r.unportedHit !== null) expect(r.unportedHit.frame).toBe(r.posHorizon + 1)
    })

    it('committed divergence artifact matches golden/snapshot digests and never over-claims horizons', () => {
      const art = JSON.parse(
        readFileSync(join(K3_DIVERGENCE_DIR_113C, `${name}.divergence.json`), 'utf8'),
      ) as DivergenceArtifact113c
      expect(art.scenario).toBe(name)
      expect(art.strictHorizon).toBeLessThanOrEqual(r.strictHorizon)
      expect(art.posHorizon).toBeLessThanOrEqual(r.posHorizon)
      expect(art.goldenSha256).toBe(sha256(goldenPath113c(name)))
      expect(art.snapshotSha256).toBe(sha256(k3SnapshotPath113c(name, H.bootFrame)))
      expect(H.strict).toBeLessThanOrEqual(r.strictHorizon)
    })

    it('has 0 D2Common unported hits, 0 impure kernFile hits, and verified D2Game dynamic gap bounds', () => {
      expect(cov.from).toBe(1)
      expect(cov.to).toBe(spec.frames)
      expect(cov.to).toBe(scenario.frames)
      expect(cov.entries).toBe(loadManifest113c().size)
      expect(cov.hit).toBe(spec.totalHits)
      expect(cov.hits.length).toBe(spec.totalHits)

      const byKey = new Map(cov.hits.map((h) => [manifestKey113c(h.module, h.va), h.firstFrame]))
      expect(byKey.get('D2Game:0x6FC4E050')).toBe(1)
      const firstInput = Math.min(...scenario.inputs.map((i) => i.frame))
      expect(byKey.get('D2Game:0x6FCEC550')).toBe(firstInput)

      expect(spec.initialD2GameGapVas.length).toBe(spec.initialD2GameGapCount)
      const s = computeK3Gaps113c(name)
      const manifest = loadManifest113c()
      const hitKeySet = new Set(cov.hits.map((h) => manifestKey113c(h.module, h.va)))

      expect(s.executed.D2Common).toEqual({
        total: spec.d2CommonExecuted,
        done: spec.d2CommonExecuted,
        gap: 0,
        gapBytes: 0,
      })
      expect(s.gaps.filter((g) => g.module === 'D2Common')).toEqual([])
      expect(s.impure).toEqual([])

      expect(s.executed.D2Game?.total).toBe(spec.d2GameExecuted)
      expect(s.executed.D2Game!.gap).toBeLessThanOrEqual(spec.initialD2GameGapCount)
      expect(s.executed.D2Game!.gapBytes).toBeLessThanOrEqual(spec.initialD2GameGapBytes)

      for (const vaHex of spec.initialD2GameGapVas) {
        expect(hitKeySet.has(`D2Game:${vaHex}`), `D2Game:${vaHex} must be in recorded coverage`).toBe(true)
      }

      const expectedRemainingD2GameVas = spec.initialD2GameGapVas.filter((vaHex) => {
        const fn = manifest.get(`D2Game:${vaHex}`)
        expect(fn, `D2Game:${vaHex}`).toBeDefined()
        return !DONE_STATUSES_113C.has(fn!.status)
      })
      const actualD2GameGapVas = s.gaps.filter((g) => g.module === 'D2Game').map((g) => formatVa113c(g.va))

      expect(s.executed.D2Game!.gap).toBe(expectedRemainingD2GameVas.length)
      expect(s.executed.D2Game!.done).toBe(spec.d2GameExecuted - expectedRemainingD2GameVas.length)
      expect(actualD2GameGapVas).toEqual(expectedRemainingD2GameVas)
    })

    if (H.strict >= r.lastGoldenFrame) {
      it(`gate: zero divergence F${H.bootFrame + 1}..F${r.lastGoldenFrame}`, () => {
        expect(r.firstStrictDivergence).toBeNull()
      })
    } else {
      it.todo(
        `gate: zero divergence F${H.bootFrame + 1}..F${r.lastGoldenFrame} (enabled once k3/replay/horizons.json strict reaches F${r.lastGoldenFrame})`,
      )
    }
  })
}
