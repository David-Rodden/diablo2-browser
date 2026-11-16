/**
 * K4 longitudinal quest replay suite (Acts 1-5) against real Wine 1.13c golden traces
 * (tests/fixtures/oracle/k4/k4-act{1..5}-quest.oracle.ndjson.gz) and F2 memory snapshots
 * (tests/fixtures/oracle/k4/k4-act{1..5}-quest.snap-f002.ndjson.gz).
 *
 * Ratchet horizons: tests/fixtures/oracle/k4/horizons.json
 * Divergence artifacts & root-cause report: docs/oracle/k4-replay/
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { D2GameStrc, D2UnitStrc } from '../../../src/d2kern-113c/mem/layout.generated.ts'
import { parseTrace, type Trace, type TraceHeader, type UnitRow } from '../../../tools/oracle/lib/trace-diff.ts'
import {
  REPO_ROOT_113C,
  UnportedFunction113c,
  bootFromSnapshot113c,
  diffFrame113c,
  loadScenario113c,
  loadSnapshotFile113c,
  manifestKey113c,
  sampleFrame113c,
  stepFrame113c,
  type FieldDivergence113c,
  type ReplayResult113c,
} from '../../../tools/oracle/kern-replay/replay-113c.ts'
import type { DivergenceArtifact113c, Horizon113c } from '../../../tools/oracle/kern-replay/report.ts'

const K4_FIXTURES_DIR = join(REPO_ROOT_113C, 'tests/fixtures/oracle/k4')
const K4_HORIZONS_PATH = join(K4_FIXTURES_DIR, 'horizons.json')
const K4_DIVERGENCE_DIR = join(REPO_ROOT_113C, 'docs/oracle/k4-replay')

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function hexBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.replace(/\s+/g, ''), 'hex'))
}

function k4GoldenPath(name: string): string {
  return join(K4_FIXTURES_DIR, `${name}.oracle.ndjson.gz`)
}

function k4SnapshotPath(name: string, bootFrame: number): string {
  return join(K4_FIXTURES_DIR, `${name}.snap-f${String(bootFrame).padStart(3, '0')}.ndjson.gz`)
}

function loadK4Golden(name: string): Trace {
  return parseTrace(gunzipSync(readFileSync(k4GoldenPath(name))).toString('utf8'))
}

function loadK4Horizons(): Record<string, Horizon113c> {
  return JSON.parse(readFileSync(K4_HORIZONS_PATH, 'utf8')) as Record<string, Horizon113c>
}

function playerStat(header: TraceHeader, row: UnitRow, statId: number): number {
  const idx = header.statIds.indexOf(statId)
  if (idx < 0) throw new Error(`statId ${statId} not present in trace header`)
  const val = row[header.unitFields.length + idx]
  if (val === undefined || val === null) throw new Error(`missing stat column ${statId} in player row`)
  return val
}

function runK4QuestReplay113c(name: string, bootFrame = 2): { result: ReplayResult113c; golden: Trace } {
  const golden = loadK4Golden(name)
  const scenario = loadScenario113c(name)
  const saveBytes =
    scenario.save !== undefined
      ? new Uint8Array(readFileSync(join(REPO_ROOT_113C, scenario.save)))
      : undefined
  const world = bootFromSnapshot113c(loadSnapshotFile113c(k4SnapshotPath(name, bootFrame)), saveBytes)
  if (world.bootFrame !== bootFrame) {
    throw new Error(`snapshot boots at F${world.bootFrame}, expected F${bootFrame}`)
  }
  const header = golden.header
  let lastGoldenFrame = 0
  for (const f of golden.frames.keys()) if (f > lastGoldenFrame) lastGoldenFrame = f
  const bootGolden = golden.frames.get(bootFrame)
  if (bootGolden === undefined) throw new Error(`golden has no frame ${bootFrame}`)
  const bootCheck = diffFrame113c(bootGolden, sampleFrame113c(world, header), header, 'strict')

  let strictHorizon = bootFrame
  let posHorizon = bootFrame
  let firstStrict: FieldDivergence113c | null = bootCheck
  let firstPos: FieldDivergence113c | null =
    bootCheck === null ? null : diffFrame113c(bootGolden, sampleFrame113c(world, header), header, 'pos')
  let unportedHit: ReplayResult113c['unportedHit'] = null
  let framesStepped = 0

  if (bootCheck === null) {
    for (let f = bootFrame + 1; f <= lastGoldenFrame; f++) {
      const g = golden.frames.get(f)
      if (g === undefined) throw new Error(`golden has no frame ${f}`)
      const packets = scenario.inputs.filter((i) => i.frame === f).map((i) => hexBytes(i.c2s))
      try {
        stepFrame113c(world, packets)
      } catch (e) {
        if (e instanceof UnportedFunction113c) {
          const d: FieldDivergence113c = {
            frame: f,
            key: 'step',
            id: null,
            field: `<unported ${manifestKey113c(e.module, e.va)}>`,
            expected: 'frame simulated by the original game',
            actual: e.message,
          }
          unportedHit = { frame: f, key: manifestKey113c(e.module, e.va), status: e.status, reason: e.reason }
          if (firstStrict === null) firstStrict = d
          if (firstPos === null) firstPos = d
          break
        }
        if (e instanceof Error && e.message.startsWith('SparseMemory113c:')) {
          const d: FieldDivergence113c = {
            frame: f,
            key: 'step',
            id: null,
            field: '<unhydrated SparseMemory113c>',
            expected: 'frame simulated by the original game',
            actual: e.message,
          }
          if (firstStrict === null) firstStrict = d
          if (firstPos === null) firstPos = d
          break
        }
        throw e
      }
      framesStepped++
      const sample = sampleFrame113c(world, header)
      if (firstStrict === null) {
        const d = diffFrame113c(g, sample, header, 'strict')
        if (d === null) strictHorizon = f
        else firstStrict = d
      }
      const dp = diffFrame113c(g, sample, header, 'pos')
      if (dp !== null) {
        firstPos = dp
        break
      }
      posHorizon = f
    }
  }

  return {
    golden,
    result: {
      scenario: name,
      bootFrame,
      lastGoldenFrame,
      bootCheck,
      strictHorizon: bootCheck === null ? strictHorizon : bootFrame - 1,
      posHorizon: bootCheck === null ? posHorizon : bootFrame - 1,
      firstStrictDivergence: firstStrict,
      firstPosDivergence: firstPos,
      unportedHit,
      framesStepped,
    },
  }
}

interface K4QuestSpec {
  readonly name: string
  readonly expectedTownLevelId: number
  readonly verifyGoldenQuestOutcome: (golden: Trace, lastFrame: number) => void
}

const K4_QUEST_SPECS: readonly K4QuestSpec[] = [
  {
    name: 'k4-act1-quest',
    expectedTownLevelId: 1, // Rogue Encampment
    verifyGoldenQuestOutcome: (golden, lastFrame) => {
      const f2 = golden.frames.get(2)!.t0![0]!
      const end = golden.frames.get(lastFrame)!.t0![0]!
      expect(playerStat(golden.header, f2, 5)).toBe(12)
      expect(playerStat(golden.header, end, 5)).toBe(13) // A1Q1 Den of Evil +1 skill point
    },
  },
  {
    name: 'k4-act2-quest',
    expectedTownLevelId: 40, // Lut Gholein
    verifyGoldenQuestOutcome: (golden, lastFrame) => {
      const f2 = golden.frames.get(2)!.t0![0]!
      const end = golden.frames.get(lastFrame)!.t0![0]!
      expect(playerStat(golden.header, f2, 5)).toBe(12)
      expect(playerStat(golden.header, end, 5)).toBe(13) // A2Q1 Book of Skill +1 skill point
    },
  },
  {
    name: 'k4-act3-quest',
    expectedTownLevelId: 75, // Kurast Docks
    verifyGoldenQuestOutcome: (golden) => {
      // A3Q1 Meshif (wScrollId 0x0211 at F42) deletes 'j34 ' and mints 'g34 ' via QUESTS_CreateItem,
      // advancing pGame->pGameSeed (gs) deterministically on F42.
      const f41 = golden.frames.get(41)!
      const f42 = golden.frames.get(42)!
      expect(f41.gs).toEqual([3213594174, 158754329])
      expect(f42.gs).toEqual([1040732530, 1118359132])
    },
  },
  {
    name: 'k4-act4-quest',
    expectedTownLevelId: 103, // Pandemonium Fortress
    verifyGoldenQuestOutcome: (golden, lastFrame) => {
      const f2 = golden.frames.get(2)!.t0![0]!
      const end = golden.frames.get(lastFrame)!.t0![0]!
      expect(playerStat(golden.header, f2, 5)).toBe(12)
      expect(playerStat(golden.header, end, 5)).toBe(14) // A4Q1 The Fallen Angel +2 skill points
    },
  },
  {
    name: 'k4-act5-quest',
    expectedTownLevelId: 109, // Harrogath
    verifyGoldenQuestOutcome: (golden, lastFrame) => {
      const f2 = golden.frames.get(2)!.t0![0]!
      const end = golden.frames.get(lastFrame)!.t0![0]!
      for (const resistStat of [39, 41, 43, 45]) {
        expect(playerStat(golden.header, f2, resistStat)).toBe(0)
        expect(playerStat(golden.header, end, resistStat)).toBe(10) // A5Q3 Scroll of Resistance +10 all resists
      }
    },
  },
]

const horizons = loadK4Horizons()

for (const spec of K4_QUEST_SPECS) {
  const { name, expectedTownLevelId } = spec
  const H = horizons[name]
  if (H === undefined) throw new Error(`k4/horizons.json has no entry for ${name}`)
  const { result: r, golden } = runK4QuestReplay113c(name, H.bootFrame)

  describe(`K4 quest replay ${name} (boot F${H.bootFrame}, strict F${H.strict}, pos F${H.pos})`, () => {
    it('hydrates F2 boot snapshot identically to the 1.13c Wine golden in the expected Act town', () => {
      expect(r.bootCheck).toBeNull()
      const levelIdx = golden.header.unitFields.indexOf('level')
      expect(levelIdx).toBeGreaterThanOrEqual(0)
      const f2Player = golden.frames.get(H.bootFrame)!.t0![0]!
      expect(f2Player[levelIdx]).toBe(expectedTownLevelId)
    })

    it('detects a single corrupted player seed bit at F2 (negative control)', () => {
      const scenario = loadScenario113c(name)
      const saveBytes =
        scenario.save !== undefined
          ? new Uint8Array(readFileSync(join(REPO_ROOT_113C, scenario.save)))
          : undefined
      const world = bootFromSnapshot113c(loadSnapshotFile113c(k4SnapshotPath(name, H.bootFrame)), saveBytes)
      const pPlayer = world.m.get(world.pGame, D2GameStrc.pUnitHash, 1)
      expect(pPlayer).not.toBe(0)
      expect(world.m.get(pPlayer, D2UnitStrc.dwUnitId)).toBe(1)
      world.m.set(pPlayer, D2UnitStrc.seedLo, (world.m.get(pPlayer, D2UnitStrc.seedLo) ^ 1) >>> 0)
      const bootGolden = golden.frames.get(H.bootFrame)!
      const d = diffFrame113c(bootGolden, sampleFrame113c(world, golden.header), golden.header, 'strict')
      expect(d).toMatchObject({ key: 't0', id: 1, field: 'seedLo' })
      expect(diffFrame113c(bootGolden, sampleFrame113c(world, golden.header), golden.header, 'pos')).toBeNull()
    })

    it('verifies the 1.13c golden trace executes the authentic Act quest state/reward transition', () => {
      spec.verifyGoldenQuestOutcome(golden, r.lastGoldenFrame)
    })

    it('matches the golden on every frame through the committed strict and position horizons', () => {
      expect(r.bootFrame).toBe(H.bootFrame)
      expect(r.strictHorizon).toBeGreaterThanOrEqual(H.strict)
      expect(r.posHorizon).toBeGreaterThanOrEqual(H.pos)
      expect(r.posHorizon).toBeGreaterThanOrEqual(r.strictHorizon)
    })

    it('stops at an explicit first divergence and matches SHA-256 fixture provenance', () => {
      const art = JSON.parse(
        readFileSync(join(K4_DIVERGENCE_DIR, `${name}.divergence.json`), 'utf8'),
      ) as DivergenceArtifact113c
      expect(art.scenario).toBe(name)
      expect(art.strictHorizon).toBeLessThanOrEqual(r.strictHorizon)
      expect(art.posHorizon).toBeLessThanOrEqual(r.posHorizon)
      expect(art.goldenSha256).toBe(sha256(k4GoldenPath(name)))
      expect(art.snapshotSha256).toBe(sha256(k4SnapshotPath(name, H.bootFrame)))

      if (r.strictHorizon === r.lastGoldenFrame) {
        expect(r.firstStrictDivergence).toBeNull()
        return
      }
      expect(r.firstStrictDivergence).not.toBeNull()
      expect(r.firstStrictDivergence!.frame).toBe(r.strictHorizon + 1)
    })

    if (H.strict >= r.lastGoldenFrame) {
      it(`gate: zero divergence F${H.bootFrame + 1}..F${r.lastGoldenFrame}`, () => {
        expect(r.firstStrictDivergence).toBeNull()
      })
    } else {
      it.todo(
        `gate: zero divergence F${H.bootFrame + 1}..F${r.lastGoldenFrame} (enabled once k4/horizons.json strict reaches F${r.lastGoldenFrame})`,
      )
    }
  })
}
