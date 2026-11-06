import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { replayFile, replayRecord } from '../../tools/oracle/route2-replay.mts'

/**
 * Route-2 pilot step 3: `EVENT_SetEvent` (`0x6FCAEA80`) replayed byte for byte against calls recorded in
 * the original game (oracle hook `fnrec setevent`, a1c-bloodmoor-fallen F700..F1100, 15 calls per event
 * type sampled from 628; the full recording replays 628/628).
 */
const FIXTURE = join(import.meta.dirname, '..', 'fixtures/oracle/route2/a1c-fnrec-setevent-f700.ndjson.gz')

describe('route-2 replay: EVENT_SetEvent', () => {
  it('all recorded calls are byte-identical', async () => {
    const r = await replayFile(FIXTURE)
    expect(r.failures).toEqual([])
    expect(r.passed).toBe(r.calls)
    expect(r.calls).toBeGreaterThanOrEqual(70)
  })

  it('detects a wrong result (negative control: frame shifted by one)', () => {
    const first = gunzipSync(readFileSync(FIXTURE)).toString('utf8').split('\n')[0]!
    const rec = JSON.parse(first) as { args: number[] }
    rec.args[3] = (rec.args[3]! + 1) >>> 0
    expect(replayRecord(rec as never)).not.toBeNull()
  })
})

describe('route-2 replay: EVENT_UpdateTimers monster partition order', () => {
  it('fire order from the recorded wheel equals the oracle order log (F785..F825)', async () => {
    const ord = new Map<number, number[][]>()
    for (const line of gunzipSync(readFileSync(join(import.meta.dirname, '..', 'fixtures/oracle/route2/a1c-ord-f785.ndjson.gz')))
      .toString('utf8')
      .split('\n')) {
      if (line.trim() === '') continue
      const o = JSON.parse(line) as { frame: number; ord: number[][] }
      ord.set(o.frame, o.ord)
    }
    const r = await replayFile(join(import.meta.dirname, '..', 'fixtures/oracle/route2/a1c-fnrec-timers-f785.ndjson.gz'), ord)
    // F801: Fallen #12 dies in the player partition (walked before monsters), which frees its persistent node
    // before the monster walk; the pre-walk snapshot still holds it (kb event-wheel §3, in-walk frees).
    expect(r.failures.length).toBe(1)
    expect(r.failures[0]).toMatch(/^F801: /)
    expect(r.calls).toBe(41)
  })
})
