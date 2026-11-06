/**
 * Records 10,000+ ground-truth stateful/snapshot differential cases directly from live
 * Diablo II v1.13c `D2Common.dll` and `D2Game.dll` (`FnOracleDaemon` / `fnharness v2`)
 * into `tests/fixtures/oracle/route2/kern-10k-diff.ndjson.gz` (`Plan §3.3` / K0 Gate #4).
 *
 * Domains recorded from the original binaries:
 *   1. `m` (`mulDiv113c`): 1,500 `(factor, value, divisor)` tuples × 2 DLLs
 *      (`D2Common 0x6FD511E0` op 20 + `D2Game 0x6FC214D0` op 51) = 3,000 DLL calls.
 *   2. `s` (`D2StatListEx` `SNAP_CALL` op 200): 3,600 stateful unit snapshots calling
 *      `D2Common.#10887` (`0x6FD8A740` `STATLIST_SetUnitStat`) & `#10973` (`0x6FD88B70`
 *      `STATLIST_GetUnitStat`) across all 7 character classes `0..6`, levels `1..99`,
 *      `bKeepZero`, `fMin`, `0x6FD89DEA` carrier suppression, and `ItemStatCost` `op`
 *      chains (`op 1` `162`, `op 2` `216/217/220/221/222/223`, `op 8` `222->1->9`,
 *      `op 9` `223->3->7&11`, `op 11` `76/77`), querying 20 `[statId, base, full]` triples
 *      per snapshot (72,000 `[base, full]` stat assertions).
 *   3. `t` (`STATES` `0x6FD88730` & `#10494` `0x6FD83CD0`): 2,000 live DLL state transition
 *      & bounds assertions across all 184 states (`0..183`) on both player (`sel=0`) and
 *      monster (`sel=1`) plus out-of-bounds indices (`< 0` and `>= 184`).
 *   4. `e` (`64`-slot `EventTimer` `0x6FCAEA80` / `0x6FCAE490` / `0x6FCAE8C0`): 2,200 live
 *      DLL probes across `sel in {0, 1}`, event types `0..14`, ring wrap boundaries, and
 *      past/current/future `targetFrame` clamping (`targetFrame <= dwGameFrame -> +1`).
 *
 * Combined in `tests/oracle/kern-10k-diff.test.ts` with 400 multi-sub-list `op 1..13`
 * (`op 3, 4, 5, 6, 7, 10, 12, 13` + equipped item sub-lists), 73 `fnrec` pre/post memory
 * snapshots (`a1c-fnrec-setevent-f700.ndjson.gz`), and 256 `D2TV` multi-frame DLL timer-wheel
 * scenarios (`eventwheel-113c.d2tv`, 45,101 fired events) => 11,529 total cases.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { seedInit, seedNext, seedRoll } from '../../src/d2kern-113c/prng.ts'
import {
  FnOracleDaemon,
  SNAP_PTR_PLAYER,
  type SnapCallRequest113c,
} from './fn-daemon.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
export const KERN_10K_FIXTURE_PATH = join(
  REPO,
  'tests/fixtures/oracle/route2/kern-10k-diff.ndjson.gz',
)

export const KERN_10K_QSTATS = [
  0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 76, 77, 162, 216, 217, 220, 221, 222, 223,
] as const

export interface MulDivDiffRecord113c {
  readonly k: 'm'
  readonly f: number
  readonly v: number
  readonly d: number
  readonly c: number
  readonly g: number
}

export interface StatSnapDiffRecord113c {
  readonly k: 's'
  readonly mode: 'set' | 'get'
  readonly cls: number
  /** Flat `[statId, val, ...]` applied in order before final call. */
  readonly p: readonly number[]
  /** Final call statId + val (for `set`) or queried `statId` (for `get`). */
  readonly sid: number
  readonly val: number
  readonly eax?: number
  /** Compact flat `[base0, full0, base1, full1, ...]` matching `KERN_10K_QSTATS`. */
  readonly q: readonly number[]
}

export interface StateDiffRecord113c {
  readonly k: 't'
  readonly sel: 0 | 1
  readonly sid: number
  /** `[afterClearAct, afterSetAct, afterSetDrt, afterOffAct, afterOffDrt]` or `[oobAct]` when out-of-bounds. */
  readonly r: readonly number[]
}

export interface EventProbeDiffRecord113c {
  readonly k: 'e'
  readonly sel: 0 | 1
  readonly ev: number
  readonly tf: number
  readonly gf: number
  readonly nf: number
}

export type Kern10kDiffRecord113c =
  | MulDivDiffRecord113c
  | StatSnapDiffRecord113c
  | StateDiffRecord113c
  | EventProbeDiffRecord113c

function buildMulDivInputs(): [number, number, number][] {
  const inputs: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 1],
    [15, 999, 0],
    [-15, 999, 0],
    [1, 0x100000, 100],
    [1, 0x100001, 100],
    [9, 1_100_037, 100],
    [-9, 1_100_037, 100],
    [9, -1_100_037, 100],
    [-9, -1_100_037, 100],
    [7, 0x100020, 0x10002], // divisor == (value >> 4) -> shortcut taken!
    [7, 0x100020, 0x10003], // divisor == (value >> 4) + 1 -> 64-bit path!
    [256, 0x150000, 3],
    [-256, 0x150000, 3],
    [256, 0x150000, -3],
    [-256, 0x150000, -3],
    [65536, 32767, 100],
    [-65536, 32767, 100],
    [50000, -40000, 77],
    [-50000, -40000, -77],
  ]

  const rng = seedInit(0x5a17113c, 666)
  while (inputs.length < 1500) {
    const mode = seedRoll(rng, 6)
    let f = 0
    let v = 0
    let d = 100
    if (mode === 0) {
      // Shortcut regime: v > 0x100000, small d
      f = (seedRoll(rng, 4096) - 2048) | 0
      v = (0x100001 + seedRoll(rng, 0x600000)) | 0
      d = (1 + seedRoll(rng, 512)) | 0
      if (seedRoll(rng, 4) === 0) d = -d
    } else if (mode === 1) {
      // Threshold boundary around 0x100000 and (v >> 4)
      f = (seedRoll(rng, 1000) - 500) | 0
      v = (0x0ffff8 + seedRoll(rng, 32)) | 0
      const baseDiv = v >> 4
      d = (baseDiv - 4 + seedRoll(rng, 9)) | 0
    } else if (mode === 2) {
      // Signed 64-bit intermediate product (> 32-bit before idiv)
      f = ((seedRoll(rng, 120000) - 60000) * 16) | 0
      v = ((seedRoll(rng, 120000) - 60000) * 16) | 0
      d = (5000 + seedRoll(rng, 50000)) | 0
      if (seedRoll(rng, 2) === 0) d = -d
    } else if (mode === 3) {
      // Zero divisor / zero operands edge cases
      const sub = seedRoll(rng, 3)
      f = (seedNext(rng) >> 8) | 0
      v = (seedNext(rng) >> 8) | 0
      d = sub === 0 ? 0 : sub === 1 ? 1 : -1
    } else {
      // General combat/stat percentages (1..300%, 8.8 fixed point values)
      f = (seedRoll(rng, 801) - 200) | 0
      v = ((seedRoll(rng, 20000) - 2000) << 8) | 0
      d = [100, 128, 256, 1024, 1000, 7, 13, -100][seedRoll(rng, 8)]!
    }
    inputs.push([f | 0, v | 0, d | 0])
  }
  return inputs
}

function buildStatSnapInputs(): Array<{
  readonly mode: 'set' | 'get'
  readonly cls: number
  readonly p: number[]
  readonly sid: number
  readonly val: number
  readonly req: SnapCallRequest113c
}> {
  const rng = seedInit(0x6fd89530, 666)
  const out: Array<{
    readonly mode: 'set' | 'get'
    readonly cls: number
    readonly p: number[]
    readonly sid: number
    readonly val: number
    readonly req: SnapCallRequest113c
  }> = []

  const total = 3600
  for (let i = 0; i < total; i++) {
    const cls = i % 7
    // Deliberately include str == 0 (~20% of cases) to exercise 0x6FD89DEA carrier retention vs suppression!
    const str = i % 5 === 0 ? 0 : i % 17 === 0 ? -15 : 10 + seedRoll(rng, 180)
    const ene = i % 19 === 0 ? 0 : i % 23 === 0 ? -10 : 10 + seedRoll(rng, 120)
    const dex = i % 13 === 0 ? 0 : 15 + seedRoll(rng, 140)
    const vit = i % 11 === 0 ? 0 : i % 29 === 0 ? -8 : 15 + seedRoll(rng, 160)
    const lvl = 1 + (i % 99)

    // Percentage & per-level ops (op 1, op 2, op 8 via 222, op 9 via 223, op 11)
    const pctHp76 = i % 4 === 0 ? 0 : i % 15 === 0 ? -120 : seedRoll(rng, 161) - 40
    const pctMana77 = i % 4 === 1 ? 0 : i % 17 === 0 ? -120 : seedRoll(rng, 161) - 40
    const pctStam162 = i % 3 === 0 ? 0 : i % 19 === 0 ? -120 : seedRoll(rng, 181) - 40
    const hpPerLvl216 = i % 3 === 1 ? 0 : seedRoll(rng, 32) << 6
    const manaPerLvl217 = i % 3 === 2 ? 0 : seedRoll(rng, 32) << 6
    const strPerLvl220 = i % 5 === 1 ? 0 : seedRoll(rng, 25)
    const dexPerLvl221 = i % 5 === 2 ? 0 : seedRoll(rng, 25)
    const enePerLvl222 = i % 3 === 0 ? 0 : seedRoll(rng, 33) // triggers op 2 -> energy -> op 8 -> maxmana!
    const vitPerLvl223 = i % 3 === 1 ? 0 : seedRoll(rng, 33) // triggers op 2 -> vitality -> op 9 -> maxhp & maxstamina!

    // Exercise bKeepZero (6, 8, 10) and fMin (7, 9, 11) with 0, negative (-512/-768/-256),
    // sub-minimum (128 < 256), negative accrued (-120% pct), and 8.8 fixed positive values!
    const hp6 = i % 7 === 0 ? 0 : (10 + seedRoll(rng, 500)) << 8
    const maxhp7 =
      i % 16 === 0 ? 0 : i % 16 === 1 ? -512 : i % 16 === 2 ? 128 : (30 + seedRoll(rng, 900)) << 8
    const mana8 = i % 6 === 0 ? 0 : (5 + seedRoll(rng, 400)) << 8
    const maxmana9 =
      i % 18 === 0 ? 0 : i % 18 === 1 ? -768 : i % 18 === 2 ? 128 : (15 + seedRoll(rng, 600)) << 8
    const stam10 = i % 8 === 0 ? 0 : (20 + seedRoll(rng, 400)) << 8
    const maxstam11 =
      i % 20 === 0 ? 0 : i % 20 === 1 ? -256 : i % 20 === 2 ? 128 : (40 + seedRoll(rng, 500)) << 8

    const targetChoices: readonly [number, number][] = [
      [223, vitPerLvl223],
      [222, enePerLvl222],
      [216, hpPerLvl216],
      [217, manaPerLvl217],
      [162, pctStam162],
      [76, pctHp76],
      [77, pctMana77],
      [12, lvl],
      [7, maxhp7],
      [8, mana8],
    ]
    const [finalSid, finalVal] = targetChoices[i % targetChoices.length]!
    const mode: 'set' | 'get' = i % 6 === 5 ? 'get' : 'set'

    // All 20 stats are staged in pStats so fnharness restores every modified slot cleanly in reverse order!
    const basePairs: [number, number][] = [
      [0, str],
      [1, ene],
      [2, dex],
      [3, vit],
      [6, hp6],
      [7, maxhp7],
      [8, mana8],
      [9, maxmana9],
      [10, stam10],
      [11, maxstam11],
      [12, lvl],
      [76, pctHp76],
      [77, pctMana77],
      [162, pctStam162],
      [216, hpPerLvl216],
      [217, manaPerLvl217],
      [220, strPerLvl220],
      [221, dexPerLvl221],
      [222, enePerLvl222],
      [223, vitPerLvl223],
    ]

    const p: number[] = []
    for (const [sid, v] of basePairs) {
      p.push(sid, mode === 'set' && sid === finalSid ? 0 : v)
    }

    if (mode === 'set') {
      out.push({
        mode: 'set',
        cls,
        p,
        sid: finalSid,
        val: finalVal,
        req: {
          mod: 1,
          va: 0x6fd8a740, // D2Common.#10887 STATLIST_SetUnitStat(pPlayer, finalSid, finalVal, 0)
          args: [SNAP_PTR_PLAYER, finalSid, finalVal, 0],
          pClass: cls,
          noStatCb: 1,
          pStats: p,
          qStats: KERN_10K_QSTATS,
        },
      })
    } else {
      const getSid = KERN_10K_QSTATS[i % KERN_10K_QSTATS.length]!
      out.push({
        mode: 'get',
        cls,
        p,
        sid: getSid,
        val: 0,
        req: {
          mod: 1,
          va: 0x6fd88b70, // D2Common.#10973 STATLIST_GetUnitStat(pPlayer, getSid, 0)
          args: [SNAP_PTR_PLAYER, getSid, 0],
          pClass: cls,
          noStatCb: 1,
          pStats: p,
          qStats: KERN_10K_QSTATS,
        },
      })
    }
  }
  return out
}

async function main(): Promise<void> {
  const daemon = new FnOracleDaemon({ workerId: 1 })
  console.log('[collect-kern-10k] Booting warm fnharness v2 Wine daemon...')
  const info = await daemon.start()
  console.log(
    `[collect-kern-10k] Daemon ready (pid=${info.pid}, game=0x${info.game.toString(16)}, player=0x${info.player.toString(16)}, monster=0x${info.monster.toString(16)})`,
  )

  const records: Kern10kDiffRecord113c[] = []

  try {
    // 1. Domain A: 1,500 tuples * 2 DLLs = 3,000 mulDiv113c calls
    const mulInputs = buildMulDivInputs()
    const mulOps: number[][] = []
    for (const [f, v, d] of mulInputs) {
      mulOps.push([20, v, f, d]) // D2Common 0x6FD511E0 (edx=v, eax=f, ecx=d)
      mulOps.push([51, v, f, d]) // D2Game   0x6FC214D0
    }
    const mulRes = await daemon.execArrayOps(mulOps, 60_000)
    for (let i = 0; i < mulInputs.length; i++) {
      const [f, v, d] = mulInputs[i]!
      const c = mulRes.results[i * 2]![0]
      const g = mulRes.results[i * 2 + 1]![0]
      if (typeof c !== 'number' || typeof g !== 'number') {
        throw new Error(`mulDiv fault at #${i}: c=${String(c)}, g=${String(g)}`)
      }
      records.push({ k: 'm', f, v, d, c, g })
    }
    console.log(
      `[collect-kern-10k] Recorded ${mulInputs.length * 2} mulDiv113c calls in ${mulRes.elapsedMs.toFixed(1)}ms`,
    )

    // 2. Domain B: 3,600 SNAP_CALL D2StatListEx snapshots (chunked by 400)
    const statInputs = buildStatSnapInputs()
    let statElapsed = 0
    const chunkSize = 400
    for (let start = 0; start < statInputs.length; start += chunkSize) {
      const slice = statInputs.slice(start, start + chunkSize)
      const batch = await daemon.execSnapBatch(
        slice.map((s) => s.req),
        60_000,
      )
      statElapsed += batch.elapsedMs
      for (let j = 0; j < slice.length; j++) {
        const item = slice[j]!
        const resp = batch.responses[j]!
        if (resp.fault !== 0) {
          throw new Error(`SNAP_CALL fault at stat #${start + j}`)
        }
        const flatQ: number[] = []
        for (const [, bv, fv] of resp.qStats) {
          flatQ.push(bv | 0, fv | 0)
        }
        records.push({
          k: 's',
          mode: item.mode,
          cls: item.cls,
          p: item.p,
          sid: item.sid,
          val: item.val,
          ...(item.mode === 'get' ? { eax: resp.eax | 0 } : {}),
          q: flatQ,
        })
      }
    }
    console.log(
      `[collect-kern-10k] Recorded ${statInputs.length} D2StatListEx SNAP_CALL snapshots (72,000 [base,full] pairs) in ${statElapsed.toFixed(1)}ms`,
    )

    // 3. Domain C: 2,000 STATES assertions (368 full 5-check cycles across sel=0..1, sid=0..183 = 1,840 + 160 OOB = 2,000)
    const stateOps: number[][] = []
    for (const sel of [0, 1] as const) {
      for (let sid = 0; sid < 184; sid++) {
        stateOps.push([70, sel, sid, 0]) // clear
        stateOps.push([71, sel, sid]) // [0] afterClearAct
        stateOps.push([70, sel, sid, 1]) // set
        stateOps.push([71, sel, sid]) // [1] afterSetAct
        stateOps.push([72, sel, sid]) // [2] afterSetDrt
        stateOps.push([70, sel, sid, 0]) // clear again
        stateOps.push([71, sel, sid]) // [3] afterOffAct
        stateOps.push([72, sel, sid]) // [4] afterOffDrt
        stateOps.push([73, sel, sid]) // restore baseline
      }
    }
    const oobPairs: [0 | 1, number][] = []
    for (const sel of [0, 1] as const) {
      for (let k = 1; k <= 40; k++) {
        oobPairs.push([sel, -k])
        oobPairs.push([sel, 183 + k])
      }
    }
    for (const [sel, sid] of oobPairs) {
      stateOps.push([71, sel, sid])
    }

    const stRes = await daemon.execArrayOps(stateOps, 60_000)
    let cur = 0
    for (const sel of [0, 1] as const) {
      for (let sid = 0; sid < 184; sid++) {
        cur += 1 // op 70 clear
        const c0 = stRes.results[cur++]![0] as number
        cur += 1 // op 70 set
        const c1 = stRes.results[cur++]![0] as number
        const c2 = stRes.results[cur++]![0] as number
        cur += 1 // op 70 off
        const c3 = stRes.results[cur++]![0] as number
        const c4 = stRes.results[cur++]![0] as number
        cur += 1 // op 73 restore
        records.push({ k: 't', sel, sid, r: [c0 | 0, c1 | 0, c2 | 0, c3 | 0, c4 | 0] })
      }
    }
    for (const [sel, sid] of oobPairs) {
      const v = stRes.results[cur++]![0] as number
      records.push({ k: 't', sel, sid, r: [v | 0] })
    }
    console.log(
      `[collect-kern-10k] Recorded 2,000 STATES transition & bounds checks in ${stRes.elapsedMs.toFixed(1)}ms`,
    )

    // 4. Domain D: 2,200 live op 77 EventTimer probes across sel=0..1, ev=0..14, ring wrap & frame clamp
    const evRng = seedInit(0x6fcaea80, 666)
    const evProbes: [0 | 1, number, number, number][] = []
    const baseFrames = [0, 1, 63, 64, 65, 127, 128, 789, 821, 4095, 65535, 0x00fffffe]
    const deltas = [-100, -1, 0, 1, 2, 15, 63, 64, 65, 128, 511]
    for (const sel of [0, 1] as const) {
      for (let ev = 0; ev < 15; ev++) {
        // Note: skip ev == 0 when persistent head might already hold a node? No: g_player & g_monster in town at pause:
        // Wait — check if g_player or g_monster already has an active event of type `ev`!
        // Let's probe with high unused event types or check! Actually g_monster in Blood Moor might have an AI event (type 2)!
        // If g_monster already has an event of type 2 at frame F0 < targetFrame, EVENT_GetNextEventFrame returns min(F0, targetFrame)!
        // Using `simGameFrame` >= 100_000 would still see F0 < 100_000 if an earlier event exists!
        // Let's test `sel = 0` (player in Rogue Encampment has NO unit events of types 0..12; type 13 might exist if poisoned, none on fresh L1 barb!)
        void sel
        void ev
      }
    }
    // First query existing EVENT_GetNextEventFrame on player & monster by probing with targetFrame = 0x70000000 so we know which (sel, ev) are clean!
    const cleanPairs: [0 | 1, number][] = []
    const checkOps: number[][] = []
    const candPairs: [0 | 1, number][] = []
    for (const sel of [0, 1] as const) {
      for (let ev = 0; ev < 15; ev++) {
        candPairs.push([sel, ev])
        checkOps.push([77, sel, ev, 500_000, 400_000])
      }
    }
    const checkRes = await daemon.execArrayOps(checkOps, 30_000)
    for (let i = 0; i < candPairs.length; i++) {
      if (checkRes.results[i]![0] === 500_000) {
        cleanPairs.push(candPairs[i]!)
      }
    }
    console.log(`[collect-kern-10k] Clean (sel, evType) pairs without pre-existing unit events: ${cleanPairs.length}/30`)

    while (evProbes.length < 2200) {
      const [sel, ev] = cleanPairs[evProbes.length % cleanPairs.length]!
      const gf =
        evProbes.length < baseFrames.length * deltas.length * 4
          ? baseFrames[Math.floor(evProbes.length / deltas.length) % baseFrames.length]!
          : 1 + seedRoll(evRng, 0x00ffff00)
      const delta =
        evProbes.length < baseFrames.length * deltas.length * 4
          ? deltas[evProbes.length % deltas.length]!
          : seedRoll(evRng, 600) - 150
      const tf = Math.max(0, gf + delta)
      evProbes.push([sel, ev, tf, gf])
    }

    const evOps = evProbes.map(([sel, ev, tf, gf]) => [77, sel, ev, tf, gf])
    const evRes = await daemon.execArrayOps(evOps, 60_000)
    for (let i = 0; i < evProbes.length; i++) {
      const [sel, ev, tf, gf] = evProbes[i]!
      const nf = evRes.results[i]![0]
      if (typeof nf !== 'number') {
        throw new Error(`EventTimer probe fault at #${i}: ${String(nf)}`)
      }
      records.push({ k: 'e', sel, ev, tf, gf, nf: nf | 0 })
    }
    console.log(
      `[collect-kern-10k] Recorded ${evProbes.length} EventTimer DLL probes in ${evRes.elapsedMs.toFixed(1)}ms`,
    )
  } finally {
    await daemon.close()
  }

  mkdirSync(dirname(KERN_10K_FIXTURE_PATH), { recursive: true })
  const ndjson = records.map((r) => JSON.stringify(r)).join('\n') + '\n'
  const gz = gzipSync(Buffer.from(ndjson, 'utf8'), { level: 9 })
  writeFileSync(KERN_10K_FIXTURE_PATH, gz)
  console.log(
    `[collect-kern-10k] Wrote ${records.length} records (${(gz.byteLength / 1024).toFixed(1)} KiB) -> ${KERN_10K_FIXTURE_PATH}`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
