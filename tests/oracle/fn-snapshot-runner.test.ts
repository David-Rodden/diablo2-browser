import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EVENT_SetEventFull113c,
  mulDiv113c,
  seedInit,
  seedNext,
  STATES_CheckGfxStateFlag113c,
  STATES_CheckState113c,
  STATES_ToggleState113c,
  STATLIST_CreateEx113c,
  STATLIST_GetUnitBaseStat113c,
  STATLIST_GetUnitStat113c,
  STATLIST_SetUnitStat113c,
  SUNIT_GetNewUnitId113c,
  GAME_Create113c,
  UNIT_PLAYER,
  UNITS_Create113c,
} from '../../src/d2kern-113c/index.ts'
import { Heap113c } from '../../src/server/route2/heap.ts'
import {
  FnOracleDaemon,
  isOracleToolchainAvailable113c,
  SNAP_PTR_GAME,
  SNAP_PTR_PLAYER,
} from '../../tools/oracle/fn-daemon.ts'
import {
  runFnrecDifferential113c,
  runLiveSnapshotSweep113c,
  type FnrecCallRecord113c,
  type SnapshotCase113c,
} from '../../tools/oracle/fn-snapshot-runner.ts'

const SETEVENT_FIXTURE = join(
  import.meta.dirname,
  '..',
  'fixtures/oracle/route2/a1c-fnrec-setevent-f700.ndjson.gz',
)

describe('fn-snapshot-runner §3.3 (offline fnrec differential)', () => {
  it('replays all recorded EVENT_SetEvent (0x6FCAEA80) snapshots byte-identically using d2kern-113c', () => {
    const lines = gunzipSync(readFileSync(SETEVENT_FIXTURE))
      .toString('utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)

    expect(lines.length).toBeGreaterThanOrEqual(70)
    for (const line of lines) {
      const rec = JSON.parse(line) as FnrecCallRecord113c
      const err = runFnrecDifferential113c(rec, (m, args) => {
        const [pGame, pUnit, type, frame, handler, arg14, arg18] = args as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ]
        EVENT_SetEventFull113c(m, pGame, pUnit, type, frame, handler, arg14, arg18, {
          checkState: () => false,
          onMonsterAiEventWithState36: () => {},
        })
      })
      expect(err).toBeNull()
    }
  })
})

const HAS_ORACLE = isOracleToolchainAvailable113c()

describe.skipIf(!HAS_ORACLE)('fn-snapshot-runner §3.3 (live warm fnharness v2 daemon)', () => {
  let daemon: FnOracleDaemon

  beforeAll(async () => {
    daemon = new FnOracleDaemon({ workerId: 0 })
    const info = await daemon.start()
    expect(info.game).toBeGreaterThan(0)
    expect(info.player).toBeGreaterThan(0)
  }, 120_000)

  afterAll(async () => {
    if (daemon) await daemon.close()
  }, 30_000)

  it('executes 500 mulDiv113c (0x6FD511E0 & 0x6FC214D0) differential calls on warm daemon in < 100ms', async () => {
    const rng = seedInit(0x1337c0de, 666)
    const inputs: [number, number, number][] = [
      [0, 0, 1],
      [10, 500, 0],
      [9, 1_100_037, 100],
      [-9, 1_100_037, 100],
      [9, -1_100_037, 100],
      [90_000, 50, 7],
      [-90_000, 50, 7],
      [0x20000, 0x30000, 1000],
      [256, 0x150000, 3],
    ]
    while (inputs.length < 250) {
      const a = seedNext(rng) >> 6
      const b = seedNext(rng) >> 4
      let c = seedNext(rng) % 5000
      if (c === 0) c = 100
      inputs.push([a, b, c])
    }

    // Warm-up ping (`[0, 42]`) so OS page cache is primed before timing the 500-op batch
    const warm = await daemon.execArrayOps([[0, 42]])
    expect(warm.results[0]).toEqual([42])

    // 250 D2Common (op 20: edx=value, eax=factor, ecx=divisor) + 250 D2Game (op 51) = 500 calls
    const ops: number[][] = []
    for (const [factor, value, divisor] of inputs) {
      ops.push([20, value, factor, divisor])
      ops.push([51, value, factor, divisor])
    }
    const { results, elapsedMs } = await daemon.execArrayOps(ops)
    expect(elapsedMs).toBeLessThan(100)
    for (let i = 0; i < inputs.length; i++) {
      const [factor, value, divisor] = inputs[i]!
      const expected = mulDiv113c(factor, value, divisor)
      expect(results[i * 2]).toEqual([expected])
      expect(results[i * 2 + 1]).toEqual([expected])
    }
  })

  it('verifies STATES_ToggleState (0x6FD88730), STATES_CheckState (#10494), SUNIT_GetNewUnitId (0x6FCFF9C0), EVENT_SetEvent (0x6FCAEA80) & D2Net.#10002 hook', async () => {
    const heap = new Heap113c()
    const pGame = GAME_Create113c(heap)
    const pPlayer = UNITS_Create113c(heap, UNIT_PLAYER, 4, 1, pGame)
    STATLIST_CreateEx113c(heap, pPlayer, 0, pGame)

    // 1. STATES bitvectors across representative states 0..183 + out-of-range -1, 184
    const testStates = [0, 1, 8, 31, 32, 0x36, 95, 128, 183]
    const stateOps: number[][] = []
    for (const sid of testStates) {
      stateOps.push([70, 0, sid, 0]) // ensure clear
      stateOps.push([70, 0, sid, 1]) // toggle on
      stateOps.push([71, 0, sid]) // check active
      stateOps.push([72, 0, sid]) // check dirty/gfx
      stateOps.push([70, 0, sid, 0]) // toggle off
      stateOps.push([71, 0, sid]) // check active == 0
      stateOps.push([73, 0, sid]) // restore baseline
    }
    stateOps.push([71, 0, -1])
    stateOps.push([71, 0, 184])

    const stRes = await daemon.execArrayOps(stateOps)
    let cursor = 0
    for (const sid of testStates) {
      STATES_ToggleState113c(heap, pPlayer, sid, false)
      STATES_ToggleState113c(heap, pPlayer, sid, true)
      const expAct = STATES_CheckState113c(heap, pPlayer, sid) | 0
      const expDrt = STATES_CheckGfxStateFlag113c(heap, pPlayer, sid) | 0
      STATES_ToggleState113c(heap, pPlayer, sid, false)
      const expOff = STATES_CheckState113c(heap, pPlayer, sid) | 0

      cursor += 2 // clear + set
      expect(stRes.results[cursor++]).toEqual([expAct])
      expect(stRes.results[cursor++]).toEqual([expDrt])
      cursor += 1 // off
      expect(stRes.results[cursor++]).toEqual([expOff])
      cursor += 1 // restore
    }
    expect(stRes.results[cursor++]).toEqual([0])
    expect(stRes.results[cursor++]).toEqual([0])

    // 2. SUNIT_GetNewUnitId (0x6FCFF9C0) including 0xFFFFFFFE -> 1 wrap, EVENT_SetEvent clamp, and D2Net.#10002 hook
    const miscOps: number[][] = [
      [76, 1, 0], // monster counter 0 -> 1
      [76, 1, 41], // monster counter 41 -> 42
      [76, 3, -2], // missile counter 0xFFFFFFFE -> wraps -1 to 1!
      [77, 0, 13, 500, 400], // targetFrame 500 > simGameFrame 400 -> scheduled at 500
      [77, 0, 13, 350, 400], // targetFrame 350 <= simGameFrame 400 -> clamped to 401!
      [77, 0, 13, 400, 400], // targetFrame 400 <= simGameFrame 400 -> clamped to 401!
      [78, 0, 1, 0x26, 0x01, 0x02, 0x99], // D2Net.#10002 IAT capture probe
    ]
    const miscRes = await daemon.execArrayOps(miscOps)
    expect(miscRes.results[0]).toEqual([SUNIT_GetNewUnitId113c(heap, pGame, 1)])
    heap.set(pGame, { off: 0x90, type: 'u32', count: 6 }, 41, 1)
    expect(miscRes.results[1]).toEqual([SUNIT_GetNewUnitId113c(heap, pGame, 1)])
    heap.set(pGame, { off: 0x90, type: 'u32', count: 6 }, 0xfffffffe, 3)
    expect(miscRes.results[2]).toEqual([SUNIT_GetNewUnitId113c(heap, pGame, 3)])
    expect(miscRes.results[3]).toEqual([500])
    expect(miscRes.results[4]).toEqual([401])
    expect(miscRes.results[5]).toEqual([401])
    expect(miscRes.results[6]).toEqual([(1 << 24) | (4 << 16) | (0x26 << 8) | 0x99])
  })

  it('runs SNAP_CALL (op 200) snapshot sweeps against D2Common STATLIST_SetUnitStat/EvalStatWithOps and emits minimal reproducers on mismatch', async () => {
    // Build SNAP_CALL cases testing STATLIST_SetUnitStat (#10887 0x6FD8A740, void return),
    // op 11 (76 item_maxhp_percent), op 2 (216 item_hp_perlevel + 0x6FD89DEA strength-gated carrier suppression),
    // and 0x6FD88A80/0x6FD88B00 fMin clamping (absent -> 0 vs present negative -> 256).
    const statCases: SnapshotCase113c[] = []
    for (const [str, lvl, baseHp256, pctHp, hpPerLvl] of [
      [20, 1, 50 << 8, 0, 0],
      [20, 10, 120 << 8, 25, 1024], // str > 0 -> stat 216 suppressed from FullStats (0)
      [20, 24, 300 << 8, 50, 2048],
      [20, 50, 800 << 8, -30, 512],
      [0, 50, 800 << 8, -30, 512], // str == 0 -> 0x6FD89DEA unk_DE[0].wOpBase (0) not > 0 -> stat 216 stays 512 in FullStats!
      [20, 80, 0, 0, 0], // absent maxhp (0 removed) -> 0x6FD88A9C returns 0 before fMin
      [20, 80, -500, 0, 0], // present negative maxhp (-500) -> 0x6FD88AE1 clamps Base & Full to 1 << 8 = 256!
    ] as const) {
      statCases.push({
        label: `str=${str},lvl=${lvl},hp=${baseHp256},pct=${pctHp},perLvl=${hpPerLvl}`,
        request: {
          mod: 1,
          va: 0x6fd8a740, // D2Common.#10887 STATLIST_SetUnitStat(pPlayer, 216, hpPerLvl, 0) (void return)
          args: [SNAP_PTR_PLAYER, 216, hpPerLvl, 0],
          pClass: 4,
          pStats: [0, str, 12, lvl, 7, baseHp256, 76, pctHp, 216, 0],
          qStats: [0, 12, 7, 76, 216],
        },
        evalTs: () => {
          const h = new Heap113c()
          const u = UNITS_Create113c(h, UNIT_PLAYER, 4, 1)
          STATLIST_CreateEx113c(h, u, 0)
          STATLIST_SetUnitStat113c(h, u, 0, str, 0)
          STATLIST_SetUnitStat113c(h, u, 12, lvl, 0)
          STATLIST_SetUnitStat113c(h, u, 7, baseHp256, 0)
          STATLIST_SetUnitStat113c(h, u, 76, pctHp, 0)
          STATLIST_SetUnitStat113c(h, u, 216, hpPerLvl, 0)
          return {
            qStats: [0, 12, 7, 76, 216].map((id) => [
              id,
              STATLIST_GetUnitBaseStat113c(h, u, id, 0),
              STATLIST_GetUnitStat113c(h, u, id, 0),
            ]),
          }
        },
      })
    }

    // Also verify exact eax return value on D2Common.#10973 STATLIST_GetUnitStat (0x6FD88B70)
    statCases.push({
      label: 'GetUnitStat_eax_parity',
      request: {
        mod: 1,
        va: 0x6fd88b70, // D2Common.#10973 STATLIST_GetUnitStat(pPlayer, 7, 0)
        args: [SNAP_PTR_PLAYER, 7, 0],
        pClass: 4,
        pStats: [0, 20, 12, 50, 7, 204800, 76, -30, 216, 512],
      },
      evalTs: () => {
        const h = new Heap113c()
        const u = UNITS_Create113c(h, UNIT_PLAYER, 4, 1)
        STATLIST_CreateEx113c(h, u, 0)
        STATLIST_SetUnitStat113c(h, u, 0, 20, 0)
        STATLIST_SetUnitStat113c(h, u, 12, 50, 0)
        STATLIST_SetUnitStat113c(h, u, 7, 204800, 0)
        STATLIST_SetUnitStat113c(h, u, 76, -30, 0)
        STATLIST_SetUnitStat113c(h, u, 216, 512, 0)
        return { eax: STATLIST_GetUnitStat113c(h, u, 7, 0) }
      },
    })

    const report = await runLiveSnapshotSweep113c(daemon, 'STATLIST_SetUnitStat_113c', statCases)
    expect(report.mismatches).toEqual([])
    expect(report.passedCases).toBe(statCases.length)
    expect(report.elapsedMs).toBeLessThan(100)

    // Negative control: intentionally wrong TS expectation must emit a minimal JSON reproducer
    const tmpRepro = mkdtempSync(join(tmpdir(), 'd2kern-repro-'))
    try {
      const badReport = await runLiveSnapshotSweep113c(
        daemon,
        'NegControl_NewUnitId',
        [
          {
            label: 'deliberate-wrong-eax',
            request: {
              mod: 0,
              va: 0x6fd0ad10, // D2Game VITALLOC(0 points) -> no-op
              eax: 0,
              esi: SNAP_PTR_PLAYER,
              gameSeed: [12345, 666],
            },
            evalTs: () => ({ gameSeed: [99999, 666] }), // deliberate seed mismatch
          },
        ],
        tmpRepro,
      )
      expect(badReport.passedCases).toBe(0)
      expect(badReport.mismatches).toHaveLength(1)
      expect(badReport.reproducerFiles).toHaveLength(1)
      expect(existsSync(badReport.reproducerFiles[0]!)).toBe(true)
    } finally {
      rmSync(tmpRepro, { recursive: true, force: true })
    }
  })
})
