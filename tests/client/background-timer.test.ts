import { describe, expect, it, vi } from 'vitest'
import { backgroundInterval } from '../../src/client/loop/background-timer.ts'

describe('background timer', () => {
  it('keeps ticking where workers are unavailable, and stops when asked', () => {
    vi.useFakeTimers()
    try {
      const tick = vi.fn()
      const stop = backgroundInterval(tick, 40)
      vi.advanceTimersByTime(400)
      stop()
      vi.advanceTimersByTime(400)
      expect(tick).toHaveBeenCalledTimes(10)
    } finally {
      vi.useRealTimers()
    }
  })
})
