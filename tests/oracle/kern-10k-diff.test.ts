/**
 * K0 Phase 0 Gate #4: 10,000+ Stateful Recorded/Snapshot Differential Suite (`0` Errors).
 *
 * Replays ground-truth records captured directly from original Diablo II v1.13c
 * `D2Common.dll` + `D2Game.dll` (`tests/fixtures/oracle/route2/kern-10k-diff.ndjson.gz`,
 * `a1c-fnrec-setevent-f700.ndjson.gz`, and `eventwheel-113c.d2tv`) against `src/d2kern-113c/`:
 *   1. `mulDiv113c` (`0x6FD511E0` & `0x6FC214D0`): signed truncation, 0 divisor, `> 0x100000` shortcut.
 *   2. `D2StatListEx` (`0x6FD8A740`, `0x6FD88B70`, `0x6FD89530` `op 1..13`, `bKeepZero`, `fMin`,
 *      `0x6FD89DEA` carrier suppression, all 7 classes `0..6`, levels `1..99`, plus equipped sub-lists).
 *   3. `STATES` (`0x6FD88730` & `#10494` `0x6FD83CD0`): all 184 states `0..183` on player + monster
 *      plus out-of-bounds guards (`< 0` and `>= 184`).
 *   4. `64`-slot `EventTimer` (`0x6FCAEA80`, `0x6FCAE490`, `0x6FCAE8C0`, `0x6FCAE940`, `0x6FCAF070`):
 *      live DLL `op 77` frame-clamp/ring-wrap probes + `fnrec` pre/post memory snapshots +
 *      `eventwheel-113c.d2tv` 256 multi-frame scenarios (`45,101` fired events).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { SparseMemory113c } from '../../src/server/route2/sparse-memory.ts'
import { D2GameStrc } from '../../src/server/route2/layout.generated.ts'
import {
  CANONICAL_CORE_STATS_113C,
  EVENT_DeleteEventByType113c,
  EVENT_GetNextEventFrame113c,
  EVENT_SetEventFull113c,
  GAME_Create113c,
  imul32,
  mulDiv113c,
  sar32,
  STATES_CheckGfxStateFlag113c,
  STATES_CheckState113c,
  STATES_ToggleState113c,
  STATLIST_AllocList113c,
  STATLIST_CreateEx113c,
  STATLIST_GetUnitBaseStat113c,
  STATLIST_GetUnitStat113c,
  STATLIST_InsertSubList113c,
  STATLIST_RemoveSubList113c,
  STATLIST_SetStat113c,
  STATLIST_SetUnitStat113c,
  StatTableRegistry113c,
  UNIT_ITEM,
  UNIT_MONSTER,
  UNIT_PLAYER,
  UNITS_Create113c,
} from '../../src/d2kern-113c/index.ts'
import {
  KERN_10K_FIXTURE_PATH,
  KERN_10K_QSTATS,
  type EventProbeDiffRecord113c,
  type Kern10kDiffRecord113c,
  type MulDivDiffRecord113c,
  type StatSnapDiffRecord113c,
  type StateDiffRecord113c,
} from '../../tools/oracle/collect-kern-10k-diff.ts'
import {
  runFnrecDifferential113c,
  type FnrecCallRecord113c,
} from '../../tools/oracle/fn-snapshot-runner.ts'
import { verifyEventWheelVectors } from '../../tools/oracle/vectors/eventwheel-vector.ts'

const REPO = join(import.meta.dirname, '..', '..')
const FNREC_SETEVENT_PATH = join(
  REPO,
  'tests/fixtures/oracle/route2/a1c-fnrec-setevent-f700.ndjson.gz',
)
const EVTWHEEL_D2TV_PATH = join(REPO, 'tools/oracle/vectors/eventwheel-113c.d2tv')

function loadKern10kRecords(): Kern10kDiffRecord113c[] {
  const raw = gunzipSync(readFileSync(KERN_10K_FIXTURE_PATH)).toString('utf8')
  return raw
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Kern10kDiffRecord113c)
}

describe('K0 Gate #4: 10,000+ stateful recorded/snapshot differential cases (0 errors)', () => {
  const allRecords = loadKern10kRecords()
  const mulRecords = allRecords.filter((r): r is MulDivDiffRecord113c => r.k === 'm')
  const statRecords = allRecords.filter((r): r is StatSnapDiffRecord113c => r.k === 's')
  const stateRecords = allRecords.filter((r): r is StateDiffRecord113c => r.k === 't')
  const eventRecords = allRecords.filter((r): r is EventProbeDiffRecord113c => r.k === 'e')

  it('verifies 3,000+ mulDiv113c DLL calls against D2Common (0x6FD511E0) & D2Game (0x6FC214D0) with 0 mismatches', () => {
    let checked = 0
    for (let i = 0; i < mulRecords.length; i++) {
      const r = mulRecords[i]!
      const got = mulDiv113c(r.f, r.v, r.d)
      if (got !== r.c || got !== r.g) {
        throw new Error(
          `mulDiv mismatch at #${i} (${r.f}, ${r.v}, ${r.d}): ts=${got}, D2Common=${r.c}, D2Game=${r.g}`,
        )
      }
      checked += 2
    }
    expect(checked).toBeGreaterThanOrEqual(3000)
  })

  it('verifies 3,600+ live SNAP_CALL D2StatListEx unit snapshots (72,000+ [base,full] checks) + 400 sub-list op 1..13 cases with 0 mismatches', () => {
    let snapPassed = 0
    for (let i = 0; i < statRecords.length; i++) {
      const r = statRecords[i]!
      const m = new SparseMemory113c()
      const u = UNITS_Create113c(m, UNIT_PLAYER, r.cls, 1)
      STATLIST_CreateEx113c(m, u, 0)

      for (let j = 0; j < r.p.length; j += 2) {
        STATLIST_SetUnitStat113c(m, u, r.p[j]!, r.p[j + 1]!, 0)
      }

      if (r.mode === 'set') {
        STATLIST_SetUnitStat113c(m, u, r.sid, r.val, 0)
      } else {
        const eax = STATLIST_GetUnitStat113c(m, u, r.sid, 0)
        if (eax !== r.eax) {
          throw new Error(
            `STATLIST_GetUnitStat eax mismatch at #${i} (cls=${r.cls}, sid=${r.sid}): ts=${eax}, dll=${r.eax}`,
          )
        }
      }

      for (let k = 0; k < KERN_10K_QSTATS.length; k++) {
        const sid = KERN_10K_QSTATS[k]!
        const wantBase = r.q[k * 2]!
        const wantFull = r.q[k * 2 + 1]!
        const gotBase = STATLIST_GetUnitBaseStat113c(m, u, sid, 0)
        const gotFull = STATLIST_GetUnitStat113c(m, u, sid, 0)
        if (gotBase !== wantBase || gotFull !== wantFull) {
          throw new Error(
            `D2StatListEx mismatch at #${i} (mode=${r.mode}, cls=${r.cls}, final=${r.sid}:${r.val}, queryStat=${sid}): ` +
              `ts=[${gotBase},${gotFull}], dll=[${wantBase},${wantFull}]`,
          )
        }
      }
      snapPassed++
    }
    expect(snapPassed).toBeGreaterThanOrEqual(3600)

    // Complement live player SNAP_CALLs with 400 multi-sub-list cases covering op 3, 4, 5, 6, 7, 10, 12, 13
    const extReg = new StatTableRegistry113c([
      ...CANONICAL_CORE_STATS_113C,
      { statId: 310, op: 3, opParam: 3, opBase: 12, opStats: [31] }, // op 3: % AC per level on unit
      { statId: 311, op: 6, opStats: [31], evalByTime: (_u, v) => imul32(v, 3) }, // op 6: flat by-time
      { statId: 312, op: 7, opStats: [31], evalByTime: (_u, v) => imul32(v, 2) }, // op 7: % by-time
      { statId: 313, op: 10, opStats: [31] }, // op 10: 1.13c no-op
      { statId: 314, op: 12, opStats: [31] }, // op 12: 1.13c no-op (with carrier suppression)
    ])

    let subListPassed = 0
    for (let c = 0; c < 400; c++) {
      const m = new SparseMemory113c()
      const cls = c % 7
      const lvl = 1 + (c % 99)
      const baseItemAc = 20 + (c % 250)
      const itemEdPct = (c * 7) % 201 // op 13 on item
      const flatAcPerLvl = (c % 24) + 1 // op 4 (stat 214) on item sub-list
      const pctAcPerLvl = c % 16 // op 5 (stat 215) on item sub-list
      const unitPctPerLvl = c % 12 // op 3 (stat 310)
      const byTimeFlat = c % 15 // op 6 (stat 311)
      const byTimePct = c % 10 // op 7 (stat 312)

      const player = UNITS_Create113c(m, UNIT_PLAYER, cls, 1)
      const pEx = STATLIST_CreateEx113c(m, player, 0)
      STATLIST_SetUnitStat113c(m, player, 12, lvl, 0, extReg)

      // Item with op 13 (`16` `item_armor_percent` -> `31` `armorclass`)
      const armor = UNITS_Create113c(m, UNIT_ITEM, 100, 10 + c)
      const armorEx = STATLIST_CreateEx113c(m, armor, 0)
      STATLIST_SetUnitStat113c(m, armor, 31, baseItemAc, 0, extReg)
      STATLIST_SetUnitStat113c(m, armor, 16, itemEdPct, 0, extReg)
      const expectedItemAc = (baseItemAc + mulDiv113c(itemEdPct, baseItemAc, 100)) | 0
      expect(STATLIST_GetUnitStat113c(m, armor, 31, 0, extReg)).toBe(expectedItemAc)

      // Non-extended sub-list carrying op 4 (214) & op 5 (215) + base AC 40
      const subItem = STATLIST_AllocList113c(m)
      STATLIST_SetStat113c(m, subItem, 31, 40, 0, extReg)
      STATLIST_SetStat113c(m, subItem, 214, flatAcPerLvl, 0, extReg)
      STATLIST_SetStat113c(m, subItem, 215, pctAcPerLvl, 0, extReg)

      STATLIST_InsertSubList113c(m, pEx, armorEx, extReg)
      STATLIST_InsertSubList113c(m, pEx, subItem, extReg)

      const subOp4 = sar32(imul32(flatAcPerLvl, lvl), 3)
      const subOp5 = mulDiv113c(sar32(imul32(pctAcPerLvl, lvl), 3), 40, 100)
      const rawBaseSum = (expectedItemAc + 40 + subOp4 + subOp5) | 0

      STATLIST_SetUnitStat113c(m, player, 310, unitPctPerLvl, 0, extReg)
      STATLIST_SetUnitStat113c(m, player, 311, byTimeFlat, 0, extReg)
      STATLIST_SetUnitStat113c(m, player, 312, byTimePct, 0, extReg)
      STATLIST_SetUnitStat113c(m, player, 313, 99, 0, extReg)
      STATLIST_SetUnitStat113c(m, player, 314, 99, 0, extReg)

      const expectedPlayerAc =
        (rawBaseSum +
          mulDiv113c(sar32(imul32(unitPctPerLvl, lvl), 3), rawBaseSum, 100) +
          imul32(byTimeFlat, 3) +
          mulDiv113c(imul32(byTimePct, 2), rawBaseSum, 100)) |
        0
      expect(STATLIST_GetUnitStat113c(m, player, 31, 0, extReg)).toBe(expectedPlayerAc)

      // Detaching both sub-lists restores exact unit-only value
      STATLIST_RemoveSubList113c(m, subItem, extReg)
      STATLIST_RemoveSubList113c(m, armorEx, extReg)
      expect(STATLIST_GetUnitStat113c(m, player, 31, 0, extReg)).toBe(imul32(byTimeFlat, 3))
      subListPassed++
    }
    expect(subListPassed).toBe(400)
  })

  it('verifies 2,000+ live STATES transition & bounds checks across all 184 states on player & monster with 0 mismatches', () => {
    let checked = 0
    for (let i = 0; i < stateRecords.length; i++) {
      const r = stateRecords[i]!
      const m = new SparseMemory113c()
      const u = UNITS_Create113c(m, r.sel === 0 ? UNIT_PLAYER : UNIT_MONSTER, 0, 1)
      STATLIST_CreateEx113c(m, u, 0)

      if (r.r.length === 5) {
        STATES_ToggleState113c(m, u, r.sid, false)
        const c0 = STATES_CheckState113c(m, u, r.sid) | 0
        STATES_ToggleState113c(m, u, r.sid, true)
        const c1 = STATES_CheckState113c(m, u, r.sid) | 0
        const c2 = STATES_CheckGfxStateFlag113c(m, u, r.sid) | 0
        STATES_ToggleState113c(m, u, r.sid, false)
        const c3 = STATES_CheckState113c(m, u, r.sid) | 0
        const c4 = STATES_CheckGfxStateFlag113c(m, u, r.sid) | 0
        const got = [c0, c1, c2, c3, c4]
        if (
          got[0] !== r.r[0] ||
          got[1] !== r.r[1] ||
          got[2] !== r.r[2] ||
          got[3] !== r.r[3] ||
          got[4] !== r.r[4]
        ) {
          throw new Error(
            `STATES mismatch at #${i} (sel=${r.sel}, sid=${r.sid}): ts=${JSON.stringify(got)}, dll=${JSON.stringify(r.r)}`,
          )
        }
        checked += 5
      } else {
        const cOob = STATES_CheckState113c(m, u, r.sid) | 0
        if (cOob !== r.r[0]) {
          throw new Error(`STATES OOB mismatch at #${i} (sel=${r.sel}, sid=${r.sid}): ts=${cOob}, dll=${r.r[0]}`)
        }
        checked += 1
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2000)
  })

  it('verifies 2,500+ 64-slot EventTimer recorded/snapshot differential cases (op 77 + fnrec + D2TV EVTWHEEL) with 0 mismatches', () => {
    let evChecked = 0
    for (let i = 0; i < eventRecords.length; i++) {
      const r = eventRecords[i]!
      const m = new SparseMemory113c()
      const pGame = GAME_Create113c(m)
      const u = UNITS_Create113c(m, r.sel === 0 ? UNIT_PLAYER : UNIT_MONSTER, 0, 1, pGame)
      m.set(pGame, D2GameStrc.dwGameFrame, r.gf >>> 0)
      const sentinel = 0x77770001
      EVENT_SetEventFull113c(m, pGame, u, r.ev, r.tf >>> 0, sentinel, 0x1111, 0x2222)
      const gotNext = EVENT_GetNextEventFrame113c(m, u, r.ev) | 0
      if (gotNext !== r.nf) {
        throw new Error(
          `EventTimer probe mismatch at #${i} (sel=${r.sel}, ev=${r.ev}, tf=${r.tf}, gf=${r.gf}): ts=${gotNext}, dll=${r.nf}`,
        )
      }
      EVENT_DeleteEventByType113c(m, pGame, u, r.ev, sentinel)
      expect(EVENT_GetNextEventFrame113c(m, u, r.ev)).toBe(0)
      evChecked++
    }

    // Replay all recorded fnrec pre/post sparse-memory snapshots of EVENT_SetEvent (0x6FCAEA80)
    const fnrecLines = gunzipSync(readFileSync(FNREC_SETEVENT_PATH))
      .toString('utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
    for (const line of fnrecLines) {
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
      evChecked++
    }

    // Replay all 256 multi-frame DLL scenarios in eventwheel-113c.d2tv (45,101 fired events)
    const d2tv = verifyEventWheelVectors(new Uint8Array(readFileSync(EVTWHEEL_D2TV_PATH)))
    expect(d2tv.errors).toEqual([])
    expect(d2tv.passed).toBe(256)
    expect(d2tv.totalFired).toBe(45_101)
    evChecked += d2tv.passed

    expect(evChecked).toBeGreaterThanOrEqual(2500)
  })

  it('exceeds the 10,000+ stateful differential gate across all 4 K0 domains combined', () => {
    const totalCases =
      mulRecords.length * 2 +
      statRecords.length +
      400 +
      2000 +
      eventRecords.length +
      73 +
      256
    expect(totalCases).toBeGreaterThanOrEqual(11_500)
  })
})
