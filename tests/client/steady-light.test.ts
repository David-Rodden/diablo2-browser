import { describe, expect, it } from 'vitest'
import { steadyLightSub } from '../../src/client/loop/steady-light.ts'
import { LightFpsCounter } from '../../src/common/drlg/light-grid.ts'

describe('steady dungeon light', () => {
  it('places the player light at the last tick position instead of the smoothed one', () => {
    expect(steadyLightSub({ playerSubX: 100.4, playerSubY: 50.2, lightSubX: 100, lightSubY: 50 }, { x: 20.4, y: 10.2 })).toEqual({ x: 20, y: 10 })
    expect(steadyLightSub({ playerSubX: 100.4, playerSubY: 50.2 }, { x: 20.4, y: 10.2 })).toEqual({ x: 20.4, y: 10.2 })
  })

  it('does not count a loading stall as a slow frame rate', () => {
    const fps = new LightFpsCounter()
    Array.from({ length: 10 }, (_, i) => fps.onFrameRendered(i * 16))
    Array.from({ length: 150 }, (_, i) => fps.onFrameRendered(2500 + i * 16))
    expect(fps.fps).toBe(25)
    Array.from({ length: 40 }, (_, i) => fps.onFrameRendered(2500 + (150 + i) * 16))
    expect(fps.fps).toBe(Math.floor(189 / 3))
  })
})
