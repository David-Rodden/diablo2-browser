import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { Heap113c } from '../../src/server/route2/heap.ts'
import {
  D2ActiveRoomStrc,
  D2EventStrc,
  D2GameStrc,
  D2MonsterDataStrc,
  D2TimerStrc,
  D2UnitStrc,
} from '../../src/server/route2/layout.generated.ts'

/**
 * Route-2 pilot step 1: the generated layout is checked against raw 1.13c memory captured by the oracle
 * hook (`memdump`, a1c-bloodmoor-fallen F820/F821; docs/oracle/route2-pilot.md). Every block is copied
 * into its own heap allocation and read through the generated field offsets.
 */
interface Block {
  readonly n: string
  readonly a: number
  readonly h: string | null
}
interface Dump {
  readonly type: number
  readonly id: number
  readonly blocks: readonly Block[]
}
interface FrameRec {
  readonly frame: number
  readonly gs: readonly [number, number]
  readonly t0: readonly (readonly number[])[]
  readonly t1: readonly (readonly number[])[]
  readonly mem: readonly Dump[]
}

const REPO = join(import.meta.dirname, '..', '..')
const records: FrameRec[] = gunzipSync(
  readFileSync(join(REPO, 'tests/fixtures/oracle/route2/a1c-memdump-f820.ndjson.gz')),
)
  .toString('utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as FrameRec)

function load(heap: Heap113c, b: Block): number {
  if (b.h === null) throw new Error(`block ${b.n} unreadable`)
  const bytes = Uint8Array.from(Buffer.from(b.h, 'hex'))
  const p = heap.alloc(bytes.length)
  heap.loadBlock(p, bytes)
  return p
}

describe('route-2 layout vs oracle memory (a1c F820/F821)', () => {
  it('generated layout is up to date', () => {
    execFileSync(join(REPO, 'node_modules/.bin/tsx'), ['tools/oracle/gen-route2-layout.ts', '--check'], { cwd: REPO })
  })

  for (const rec of records) {
    for (const dump of rec.mem) {
      it(`F${rec.frame} unit ${dump.type}:${dump.id}`, () => {
        const heap = new Heap113c()
        const byName = new Map<string, { block: Block; ptr: number }>()
        const events: { block: Block; ptr: number }[] = []
        for (const b of dump.blocks) {
          if (b.h === null) continue
          const ptr = load(heap, b)
          if (b.n === 'event') events.push({ block: b, ptr })
          else byName.set(b.n, { block: b, ptr })
        }
        const game = byName.get('game')!
        const timer = byName.get('timer')!
        const unit = byName.get('unit')!
        expect(heap.get(game.ptr, D2GameStrc.dwGameFrame)).toBe(rec.frame)
        expect(heap.get(game.ptr, D2GameStrc.pTimer)).toBe(timer.block.a)
        expect([heap.get(game.ptr, D2GameStrc.seedLo), heap.get(game.ptr, D2GameStrc.seedHi)]).toEqual(rec.gs)
        expect(heap.get(timer.ptr, D2TimerStrc.nCurrentSlot)).toBe(rec.frame & 63)

        expect(heap.get(unit.ptr, D2UnitStrc.dwUnitType)).toBe(dump.type)
        expect(heap.get(unit.ptr, D2UnitStrc.dwUnitId)).toBe(dump.id)
        expect(heap.get(unit.ptr, D2UnitStrc.pGame)).toBe(game.block.a)
        const row = (dump.type === 0 ? rec.t0 : rec.t1).find((r) => r[0] === dump.id)!
        expect(heap.get(unit.ptr, D2UnitStrc.dwClassId)).toBe(row[1])
        expect(heap.get(unit.ptr, D2UnitStrc.dwAnimMode)).toBe(row[2])
        expect([heap.get(unit.ptr, D2UnitStrc.seedLo), heap.get(unit.ptr, D2UnitStrc.seedHi)]).toEqual([row[5], row[6]])
        expect(heap.get(unit.ptr, D2UnitStrc.pUnitData)).toBe(byName.get('data')!.block.a)
        if (dump.type === 1) {
          const data = byName.get('data')!
          expect(heap.get(data.ptr, D2MonsterDataStrc.pAiGeneral)).toBe(byName.get('aigeneral')!.block.a)
          expect(heap.get(data.ptr, D2MonsterDataStrc.pAiControl)).toBe(byName.get('aicontrol')!.block.a)
        }

        const partition = [0, 1, 3, 2, 4][dump.type]!
        expect(heap.get(unit.ptr, D2UnitStrc.pEventFirst)).toBe(events[0]?.block.a ?? 0)
        events.forEach((ev, i) => {
          expect(heap.get(ev.ptr, D2EventStrc.pUnit)).toBe(unit.block.a)
          expect(heap.get(ev.ptr, D2EventStrc.dwUnitId)).toBe(dump.id)
          expect(heap.get(ev.ptr, D2EventStrc.dwUnitType)).toBe(dump.type)
          expect(heap.get(ev.ptr, D2EventStrc.pUnitNext)).toBe(events[i + 1]?.block.a ?? 0)
          const frame = heap.get(ev.ptr, D2EventStrc.dwFrame)
          if (frame !== 0xffffffff) {
            const slot = partition * 64 + (frame & 63)
            expect(heap.get(timer.ptr, D2TimerStrc.pSlotHead, slot)).not.toBe(0)
            expect(heap.get(timer.ptr, D2TimerStrc.pSlotTail, slot)).not.toBe(0)
          }
        })

        const room = byName.get('room')
        if (room !== undefined) {
          expect(heap.get(room.ptr, D2ActiveRoomStrc.pUnitFirst)).not.toBe(0)
          expect(heap.get(room.ptr, D2ActiveRoomStrc.bDeathRingIdx)).toBeLessThan(4)
          if (dump.type === 1) {
            // Fallen #12 died in this room before F820: #10873 stored it in slot 0 and advanced the index.
            expect(heap.get(room.ptr, D2ActiveRoomStrc.dwDeathRing, 0)).toBe(12)
            expect(heap.get(room.ptr, D2ActiveRoomStrc.bDeathRingIdx)).toBe(1)
          }
        }
      })
    }
  }
})
