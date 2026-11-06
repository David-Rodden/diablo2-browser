/**
 * Single-Function Snapshot Differential Harness (`Plan §3.3`).
 *
 * Bridges the two complementary function-level verification paths required to scale to all
 * 4,551 `D2Game`/`D2Common` server functions:
 * 1. Offline `fnrec` pre/post sparse-memory block replay (`SparseMemory113c`).
 * 2. Live warm `FnOracleDaemon` (`fnharness v2` `SNAP_CALL` `op 200`) comparing return `eax`,
 *    PRNG `D2SeedStrc`, `D2StatListExStrc` `[base, full]` stats, `STATES` `[active, dirty]`
 *    masks, and outbound `D2Net.#10002` S2C packets, emitting minimal JSON reproducers on mismatch.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SparseMemory113c } from '../../src/server/route2/sparse-memory.ts'
import {
  SNAP_PTR_BUF,
  SNAP_PTR_GAME,
  SNAP_PTR_MONSTER,
  SNAP_PTR_PLAYER,
  type FnOracleDaemon,
  type SnapCallRequest113c,
  type SnapCallResponse113c,
} from './fn-daemon.ts'

export { SNAP_PTR_BUF, SNAP_PTR_GAME, SNAP_PTR_MONSTER, SNAP_PTR_PLAYER }

export interface FnrecCallRecord113c {
  readonly fn: string
  readonly va: number
  readonly frame: number
  readonly args: readonly number[]
  readonly ret?: number
  readonly pre: readonly (readonly [number, string])[]
  readonly post: readonly (readonly [number, string])[]
}

export interface SnapshotExpected113c {
  readonly eax?: number
  readonly gameSeed?: readonly [number, number]
  readonly pSeed?: readonly [number, number]
  readonly qStats?: readonly (readonly [number, number, number])[]
  readonly qStates?: readonly (readonly [number, number, number])[]
  readonly s2cHex?: readonly string[]
}

export interface SnapshotCase113c<TCtx = unknown> {
  readonly label: string
  readonly request: SnapCallRequest113c
  readonly evalTs: () => SnapshotExpected113c
  readonly context?: TCtx
}

export interface SnapshotMismatch113c {
  readonly index: number
  readonly label: string
  readonly field: string
  readonly expected: unknown
  readonly actual: unknown
  readonly request: SnapCallRequest113c
  readonly response: SnapCallResponse113c
}

export interface SnapshotSweepReport113c {
  readonly fnName: string
  readonly totalCases: number
  readonly passedCases: number
  readonly elapsedMs: number
  readonly mismatches: readonly SnapshotMismatch113c[]
  readonly reproducerFiles: readonly string[]
}

function decodeHex(h: string): Uint8Array {
  return Uint8Array.from(Buffer.from(h, 'hex'))
}

/**
 * Replay a recorded `fnrec` pre/post memory record through a TypeScript port operating on `SparseMemory113c`.
 * Returns `null` when every pre-existing modified byte matches identically, or a diagnostic string on mismatch.
 */
export function runFnrecDifferential113c(
  rec: FnrecCallRecord113c,
  invokeTs: (m: SparseMemory113c, args: readonly number[]) => number | void,
): string | null {
  const m = new SparseMemory113c()
  for (const [addr, h] of rec.pre) {
    if (h !== '') m.loadBlock(addr, decodeHex(h))
  }
  let tsRet: number | void
  try {
    tsRet = invokeTs(m, rec.args)
  } catch (err) {
    return `F${rec.frame} ${rec.fn}: TS threw ${(err as Error).message}`
  }
  if (rec.ret !== undefined && tsRet !== undefined && (tsRet | 0) !== (rec.ret | 0)) {
    return `F${rec.frame} ${rec.fn}: eax got ${tsRet | 0}, want ${rec.ret | 0}`
  }

  const preAddrs = new Set(rec.pre.map(([a]) => a))
  for (const [addr, h] of rec.post) {
    if (!preAddrs.has(addr) || h === '') continue
    const want = decodeHex(h)
    const got = m.readBytes(addr, want.length)
    for (let i = 0; i < want.length; i++) {
      if (want[i] !== got[i]) {
        return `F${rec.frame} ${rec.fn}: block 0x${addr.toString(16)}+0x${i.toString(16)} got 0x${got[i]!.toString(16)}, want 0x${want[i]!.toString(16)}`
      }
    }
  }
  return null
}

/**
 * Execute a batch of `SnapshotCase113c` against the warm `FnOracleDaemon` (`SNAP_CALL` `op 200`)
 * and compare against the TypeScript kernel's expected outputs, writing minimal JSON reproducers
 * if `reproducerDir` is supplied.
 */
export async function runLiveSnapshotSweep113c(
  daemon: FnOracleDaemon,
  fnName: string,
  cases: readonly SnapshotCase113c[],
  reproducerDir?: string,
): Promise<SnapshotSweepReport113c> {
  if (cases.length === 0) {
    return {
      fnName,
      totalCases: 0,
      passedCases: 0,
      elapsedMs: 0,
      mismatches: [],
      reproducerFiles: [],
    }
  }

  const requests = cases.map((c) => c.request)
  const { responses, elapsedMs } = await daemon.execSnapBatch(requests)

  const mismatches: SnapshotMismatch113c[] = []
  const reproducerFiles: string[] = []
  let passedCases = 0

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!
    const resp = responses[i]!
    const exp = c.evalTs()
    let failed = false

    const recordMismatch = (field: string, expected: unknown, actual: unknown): void => {
      failed = true
      const mm: SnapshotMismatch113c = {
        index: i,
        label: c.label,
        field,
        expected,
        actual,
        request: c.request,
        response: resp,
      }
      mismatches.push(mm)
      if (reproducerDir && reproducerFiles.length < 20) {
        mkdirSync(reproducerDir, { recursive: true })
        const safeName = `${fnName.replace(/[^a-zA-Z0-9_-]/g, '_')}-case-${i}.json`
        const outPath = join(reproducerDir, safeName)
        writeFileSync(outPath, JSON.stringify(mm, null, 2) + '\n')
        reproducerFiles.push(outPath)
      }
    }

    if (resp.fault !== 0) {
      recordMismatch('fault', 0, resp.fault)
      continue
    }
    if (exp.eax !== undefined && (resp.eax | 0) !== (exp.eax | 0)) {
      recordMismatch('eax', exp.eax | 0, resp.eax | 0)
    }
    if (
      exp.gameSeed !== undefined &&
      (resp.gameSeed[0] !== exp.gameSeed[0] >>> 0 || resp.gameSeed[1] !== exp.gameSeed[1] >>> 0)
    ) {
      recordMismatch('gameSeed', [exp.gameSeed[0] >>> 0, exp.gameSeed[1] >>> 0], resp.gameSeed)
    }
    if (
      exp.pSeed !== undefined &&
      (resp.pSeed[0] !== exp.pSeed[0] >>> 0 || resp.pSeed[1] !== exp.pSeed[1] >>> 0)
    ) {
      recordMismatch('pSeed', [exp.pSeed[0] >>> 0, exp.pSeed[1] >>> 0], resp.pSeed)
    }
    if (exp.qStats !== undefined && JSON.stringify(resp.qStats) !== JSON.stringify(exp.qStats)) {
      recordMismatch('qStats', exp.qStats, resp.qStats)
    }
    if (exp.qStates !== undefined && JSON.stringify(resp.qStates) !== JSON.stringify(exp.qStates)) {
      recordMismatch('qStates', exp.qStates, resp.qStates)
    }
    if (exp.s2cHex !== undefined) {
      const gotHex = resp.s2c.map((p) => p.hex)
      if (JSON.stringify(gotHex) !== JSON.stringify(exp.s2cHex)) {
        recordMismatch('s2cHex', exp.s2cHex, gotHex)
      }
    }

    if (!failed) passedCases++
  }

  return {
    fnName,
    totalCases: cases.length,
    passedCases,
    elapsedMs,
    mismatches,
    reproducerFiles,
  }
}
