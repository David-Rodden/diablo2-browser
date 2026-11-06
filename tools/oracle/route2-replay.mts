/**
 * Route-2 replay: run recorded 1.13c calls (oracle hook `fnrec`, scenario key `oracleFnRec`) through the
 * TS ports on `SparseMemory113c` and compare the post-call memory byte for byte.
 *
 *   npx tsx tools/oracle/route2-replay.mts <fnrec.ndjson>
 *
 * Every block of the post set whose address was also in the pre set is compared; blocks only in the post
 * set are state the call did not read (e.g. the next free pool node) and are skipped.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { SparseMemory113c } from '../../src/server/route2/sparse-memory.ts'
import { EVENT_PartitionFireOrder113c, EVENT_SetEvent113c } from '../../src/server/route2/event-wheel-113c.ts'
import { D2EventStrc } from '../../src/server/route2/layout.generated.ts'

interface Rec {
  readonly fn: string
  readonly va: number
  readonly frame: number
  readonly args: readonly number[]
  readonly pre: readonly (readonly [number, string])[]
  readonly post: readonly (readonly [number, string])[]
}

export interface ReplayResult {
  readonly fn: string
  readonly calls: number
  readonly passed: number
  readonly failures: readonly string[]
}

function hex(b: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b, 'hex'))
}

/**
 * `EVENT_UpdateTimers` order check: the monster partition fire order computed from the recorded wheel
 * state must equal the oracle `ord` log of the same frame (default-handler nodes, kinds 1 / 2).
 */
export function replayTimersRecord(rec: Rec, ord: readonly (readonly number[])[] | undefined): string | null {
  const m = new SparseMemory113c()
  for (const [addr, h] of rec.pre) if (h !== '') m.loadBlock(addr, hex(h))
  const got = EVENT_PartitionFireOrder113c(m, rec.args[0]!, 1)
    .filter((f) => m.get(f.node, D2EventStrc.pfnHandler) === 0)
    .map((f) => [
      f.persistent ? 2 : 1,
      m.get(f.node, D2EventStrc.nType),
      m.get(f.node, D2EventStrc.dwUnitType),
      m.get(f.node, D2EventStrc.dwUnitId),
    ])
  const want = (ord ?? []).filter((e) => e[0] === 1 || e[0] === 2).map((e) => e.slice(0, 4))
  return JSON.stringify(got) === JSON.stringify(want)
    ? null
    : `F${rec.frame}: order ${JSON.stringify(got)} != oracle ${JSON.stringify(want)}`
}

export function replayRecord(rec: Rec): string | null {
  const m = new SparseMemory113c()
  for (const [addr, h] of rec.pre) if (h !== '') m.loadBlock(addr, hex(h))
  if (rec.fn !== 'EVENT_SetEvent') return `no TS port for ${rec.fn}`
  const [pGame, pUnit, type, frame, handler, arg14, arg18] = rec.args as [number, number, number, number, number, number, number]
  try {
    EVENT_SetEvent113c(
      m,
      {
        checkState: () => false,
        onMonsterAiEventWithState36: () => {
          throw new Error('0x6FD02240 not ported')
        },
      },
      pGame,
      pUnit,
      type,
      frame,
      handler,
      arg14,
      arg18,
    )
  } catch (e) {
    return `F${rec.frame}: threw ${(e as Error).message}`
  }
  const preAddrs = new Set(rec.pre.map(([a]) => a))
  for (const [addr, h] of rec.post) {
    if (!preAddrs.has(addr) || h === '') continue
    const want = hex(h)
    const got = m.readBytes(addr, want.length)
    for (let i = 0; i < want.length; i++) {
      if (want[i] !== got[i]) {
        return `F${rec.frame} type ${type} unit ${pUnit.toString(16)}: block 0x${addr.toString(16)} byte +0x${i.toString(16)} want ${want[i]} got ${got[i]}`
      }
    }
  }
  return null
}

export async function replayFile(
  path: string,
  ordByFrame?: ReadonlyMap<number, readonly (readonly number[])[]>,
): Promise<ReplayResult> {
  const input = path.endsWith('.gz') ? createReadStream(path).pipe(createGunzip()) : createReadStream(path)
  const rl = createInterface({ input, crlfDelay: Infinity })
  let calls = 0
  let passed = 0
  const failures: string[] = []
  let fn = ''
  for await (const line of rl) {
    if (line.trim() === '') continue
    const rec = JSON.parse(line) as Rec
    fn = rec.fn
    calls++
    const err = rec.fn === 'EVENT_UpdateTimers' ? replayTimersRecord(rec, ordByFrame?.get(rec.frame)) : replayRecord(rec)
    if (err === null) passed++
    else if (failures.length < 20) failures.push(err)
  }
  return { fn, calls, passed, failures }
}

if (/route2-replay\.m?ts$/.test(process.argv[1] ?? '')) {
  const path = process.argv[2]
  if (path === undefined) throw new Error('usage: route2-replay.mts <fnrec.ndjson[.gz]> [trace.ndjson with ord]')
  // Optional oracle trace with the `ord` key (orderlog) for EVENT_UpdateTimers records.
  const tracePath = process.argv[3]
  const ordByFrame = new Map<number, readonly (readonly number[])[]>()
  if (tracePath !== undefined) {
    const rl = createInterface({ input: createReadStream(tracePath), crlfDelay: Infinity })
    for await (const line of rl) {
      if (!line.includes('"ord"')) continue
      const o = JSON.parse(line) as { frame: number; ord: number[][] }
      ordByFrame.set(o.frame, o.ord)
    }
  }
  const r = await replayFile(path, ordByFrame)
  console.log(`${r.fn}: ${r.passed}/${r.calls} calls byte-identical`)
  for (const f of r.failures) console.log('  FAIL', f)
  process.exit(r.passed === r.calls ? 0 : 1)
}
