import { describe, expect, it } from 'vitest'
import { Heap113c } from '../../src/server/route2/heap.ts'
import {
  D2EventStrc,
  D2GameStrc,
} from '../../src/server/route2/layout.generated.ts'

/**
 * Candidate A: Strongly-Typed TypeScript Object Model for Event Wheel.
 */
export interface EventNodeA {
  id: number
  eventType: number
  unitId: number
  triggerFrame: number
  data0: number
  data1: number
}

export class EventWheelCandidateA {
  private slots: EventNodeA[][] = Array.from({ length: 64 }, () => [])
  private nextId: number = 1
  public currentFrame: number = 0

  constructor(initialFrame: number = 0) {
    this.currentFrame = initialFrame >>> 0
  }

  public schedule(eventType: number, unitId: number, triggerFrame: number, data0: number = 0, data1: number = 0): number {
    const id = this.nextId++
    const slotIdx = triggerFrame & 63
    const node: EventNodeA = {
      id,
      eventType,
      unitId,
      triggerFrame: triggerFrame >>> 0,
      data0,
      data1,
    }
    this.slots[slotIdx]!.push(node)
    return id
  }

  public cancel(eventId: number): boolean {
    for (let i = 0; i < 64; i++) {
      const slot = this.slots[i]!
      const idx = slot.findIndex((n) => n.id === eventId)
      if (idx !== -1) {
        slot.splice(idx, 1)
        return true
      }
    }
    return false
  }

  public step(targetFrame: number): EventNodeA[] {
    const fired: EventNodeA[] = []
    while (this.currentFrame <= targetFrame) {
      const slotIdx = this.currentFrame & 63
      const slot = this.slots[slotIdx]!
      // In 1.13c, events in current slot matching currentFrame fire in FIFO order
      const remaining: EventNodeA[] = []
      for (const node of slot) {
        if (node.triggerFrame <= this.currentFrame) {
          fired.push(node)
        } else {
          remaining.push(node)
        }
      }
      this.slots[slotIdx] = remaining
      this.currentFrame++
    }
    return fired
  }
}

/**
 * Candidate B: Linear/Sparse Memory Buffer with Exact C Offsets (1.13c Isomorphic).
 * Built on Heap113c and D2GameStrc / D2EventStrc layout.
 */
export class EventWheelCandidateB {
  private heap: Heap113c
  private pGame: number

  constructor(initialFrame: number = 0) {
    this.heap = new Heap113c()
    this.pGame = this.heap.alloc(0x2000)
    this.heap.setU32(this.pGame + D2GameStrc.dwGameFrame.off, initialFrame >>> 0)
  }

  public get currentFrame(): number {
    return this.heap.u32(this.pGame + D2GameStrc.dwGameFrame.off)
  }

  public schedule(eventType: number, unitId: number, triggerFrame: number, data0: number = 0, data1: number = 0): number {
    // 1.13c Event node allocation (sizeof D2EventStrc = 0x24)
    const pNode = this.heap.alloc(0x24)
    const slotIdx = triggerFrame & 63
    const pTimer = this.pGame + 0xb8 + slotIdx * 0x30

    // Set fields
    this.heap.setU32(pNode + 0x00, eventType)
    this.heap.setU32(pNode + 0x04, triggerFrame >>> 0)
    this.heap.setU32(pNode + 0x08, unitId)
    this.heap.setU32(pNode + 0x0c, data0)
    this.heap.setU32(pNode + 0x10, data1)

    // Append to linked list tail in slot
    const pHead = this.heap.u32(pTimer + 0x00)
    if (pHead === 0) {
      this.heap.setU32(pTimer + 0x00, pNode)
      this.heap.setU32(pTimer + 0x04, pNode)
      this.heap.setU32(pNode + 0x18, 0)
      this.heap.setU32(pNode + 0x1c, 0)
    } else {
      const pTail = this.heap.u32(pTimer + 0x04)
      this.heap.setU32(pTail + 0x1c, pNode) // pPrevTail->pNext = pNode
      this.heap.setU32(pNode + 0x18, pTail) // pNode->pPrev = pPrevTail
      this.heap.setU32(pNode + 0x1c, 0)
      this.heap.setU32(pTimer + 0x04, pNode) // timer->pTail = pNode
    }
    return pNode
  }

  public step(targetFrame: number): { eventType: number; unitId: number; triggerFrame: number }[] {
    const fired: { eventType: number; unitId: number; triggerFrame: number }[] = []
    let curFrame = this.heap.u32(this.pGame + D2GameStrc.dwGameFrame.off)
    while (curFrame <= targetFrame) {
      const slotIdx = curFrame & 63
      const pTimer = this.pGame + 0xb8 + slotIdx * 0x30

      let pCur = this.heap.u32(pTimer + 0x00)
      while (pCur !== 0) {
        const pNext = this.heap.u32(pCur + 0x1c)
        const trig = this.heap.u32(pCur + 0x04)
        if (trig <= curFrame) {
          const evType = this.heap.u32(pCur + 0x00)
          const uId = this.heap.u32(pCur + 0x08)
          fired.push({ eventType: evType, unitId: uId, triggerFrame: trig })

          // Unlink node
          const pPrev = this.heap.u32(pCur + 0x18)
          if (pPrev !== 0) {
            this.heap.setU32(pPrev + 0x1c, pNext)
          } else {
            this.heap.setU32(pTimer + 0x00, pNext)
          }
          if (pNext !== 0) {
            this.heap.setU32(pNext + 0x18, pPrev)
          } else {
            this.heap.setU32(pTimer + 0x04, pPrev)
          }
        }
        pCur = pNext
      }
      curFrame++
      this.heap.setU32(this.pGame + D2GameStrc.dwGameFrame.off, curFrame)
    }
    return fired
  }
}

describe('A/B Comparison: Candidate A (Object Model) vs Candidate B (Linear Memory Offset)', () => {
  it('both candidates produce identical scheduling, firing order and count across wrap-around frames', () => {
    const candA = new EventWheelCandidateA(100)
    const candB = new EventWheelCandidateB(100)

    // Schedule 50 events spanning multiple 64-slot cycles
    for (let i = 0; i < 50; i++) {
      const trig = 100 + (i * 7) % 150 // triggers between 100 and 249
      candA.schedule(1, i + 1, trig)
      candB.schedule(1, i + 1, trig)
    }

    const firedA = candA.step(250)
    const firedB = candB.step(250)

    expect(firedA.length).toBe(50)
    expect(firedB.length).toBe(50)

    for (let i = 0; i < 50; i++) {
      expect(firedA[i]!.unitId).toBe(firedB[i]!.unitId)
      expect(firedA[i]!.triggerFrame).toBe(firedB[i]!.triggerFrame)
      expect(firedA[i]!.eventType).toBe(firedB[i]!.eventType)
    }
  })
})
