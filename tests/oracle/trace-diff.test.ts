import { describe, expect, it } from 'vitest'
import { diffTraces, formatDivergence, parseTrace } from '../../tools/oracle/lib/trace-diff.ts'

const HDR = {
  schema: 'd2oracle/1',
  unitFields: ['id', 'class', 'mode', 'x', 'y', 'seedLo', 'seedHi'],
  statIds: [6, 7],
}

function trace(source: string, frames: Record<number, Record<string, unknown[]>>, hdr = HDR): string {
  const lines = [JSON.stringify({ ...hdr, source, initSeed: 12345 })]
  for (const [f, units] of Object.entries(frames)) lines.push(JSON.stringify({ frame: Number(f), ...units }))
  return lines.join('\n') + '\n'
}

const base = {
  1: { t0: [[1, 4, 5, 5653, 5918, 1, 666, 14080, 14080]], t1: [[2, 152, 1, 5697, 5952, 9, 9, 256, 256]], t3: [] },
  2: { t0: [[1, 4, 3, 5654, 5918, 1, 666, 14080, 14080]], t1: [[2, 152, 1, 5697, 5952, 9, 9, 256, 256]], t3: [] },
  3: { t0: [[1, 4, 3, 5655, 5918, 1, 666, 14080, 14080]], t1: [[2, 152, 2, 5698, 5952, 9, 9, 256, 256]], t3: [] },
}

describe('oracle trace diff', () => {
  it('reports no divergence for identical traces and ignores seeds by default', () => {
    const replicaFrames = structuredClone(base)
    for (const f of Object.values(replicaFrames)) {
      for (const row of [...f.t0, ...f.t1]) {
        row[5] = null as unknown as number
        row[6] = null as unknown as number
      }
    }
    const res = diffTraces(parseTrace(trace('oracle', base)), parseTrace(trace('replica', replicaFrames)))
    expect(res.firstDivergence).toBeNull()
    expect(res.comparedFrames).toBe(3)
  })

  it('pinpoints the first differing frame, unit and field with context', () => {
    const rep = structuredClone(base)
    rep[3].t0[0]![3] = 5656 // player x off by one at frame 3
    rep[3].t1[0]![2] = 1 // later column in same frame must not mask the player diff
    const o = parseTrace(trace('oracle', base))
    const r = parseTrace(trace('replica', rep))
    const res = diffTraces(o, r, { context: 2 })
    expect(res.firstDivergence).toMatchObject({ frame: 3, kind: 'field', type: 0, unitId: 1, field: 'x', oracle: 5655, replica: 5656 })
    expect(res.firstDivergence!.context.map((c) => c[0])).toEqual([1, 2])
    expect(formatDivergence(res.firstDivergence, o.header, r.header)).toContain('frame 3')
  })

  it('compares stats by id even when the stat column order differs', () => {
    const rep = structuredClone(base)
    for (const f of Object.values(rep)) {
      for (const row of [...f.t0, ...f.t1]) {
        const [hp, maxHp] = [row[7], row[8]]
        row[7] = maxHp!
        row[8] = hp!
      }
    }
    rep[2].t0[0]![8] = 13824 // stat 6 (hp) is now the second stat column
    const res = diffTraces(parseTrace(trace('oracle', base)), parseTrace(trace('replica', rep, { ...HDR, statIds: [7, 6] })))
    expect(res.firstDivergence).toMatchObject({ frame: 2, field: 'stat6', oracle: 14080, replica: 13824 })
  })

  it('honours per-field tolerance', () => {
    const rep = structuredClone(base)
    rep[2].t0[0]![7] = 14080 - 100
    const res = diffTraces(parseTrace(trace('oracle', base)), parseTrace(trace('replica', rep)), { tolerance: { stat6: 128 } })
    expect(res.firstDivergence).toBeNull()
  })

  it('reports missing and extra units and missing frames', () => {
    const missing = structuredClone(base)
    missing[2].t1 = []
    expect(diffTraces(parseTrace(trace('oracle', base)), parseTrace(trace('replica', missing))).firstDivergence).toMatchObject({
      frame: 2,
      kind: 'missing-unit',
      type: 1,
      unitId: 2,
    })
    const extra = structuredClone(base) as Record<number, Record<string, unknown[]>>
    extra[1].t3 = [[7, 1, 0, 1, 1, null, null]]
    expect(diffTraces(parseTrace(trace('oracle', base)), parseTrace(trace('replica', extra))).firstDivergence).toMatchObject({
      frame: 1,
      kind: 'extra-unit',
      type: 3,
      unitId: 7,
    })
    const short = { 1: base[1] }
    expect(diffTraces(parseTrace(trace('oracle', base)), parseTrace(trace('replica', short))).firstDivergence).toMatchObject({
      frame: 2,
      kind: 'missing-frame',
    })
  })

  it('treats a null (unmodelled) value against a real value as a divergence when the column is compared', () => {
    const rep = structuredClone(base)
    rep[1].t0[0]![2] = null as unknown as number
    const res = diffTraces(parseTrace(trace('oracle', base)), parseTrace(trace('replica', rep)))
    expect(res.firstDivergence).toMatchObject({ frame: 1, field: 'mode', oracle: 5, replica: null })
  })

  it('tolerates a truncated final line and rejects traces without a header', () => {
    const t = trace('oracle', base) + '{"frame":4,"t0":[[1,4'
    expect(parseTrace(t).frames.size).toBe(3)
    expect(() => parseTrace('{"frame":1}\n')).toThrow(/header/)
  })
})
