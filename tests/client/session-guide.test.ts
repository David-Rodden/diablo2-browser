import { describe, expect, it } from 'vitest'
import { sessionGuideHost } from '../../src/client/guide/session-guide.ts'
import type { OnlineSession } from '../../src/client/session/online-session.ts'

const sessionWith = (act: number, orificeIn: number | null, told = 3) => {
  const peeked: number[] = []
  const mapService = {
    getActiveAct: () => act,
    getActiveSeed: () => 7,
    getActiveDifficulty: () => 0,
    peekLevelView: (level: number) => {
      peeked.push(level)
      return { presetUnits: level === orificeIn ? [{ type: 2, index: 152, subX: 0, subY: 0 }] : [] }
    },
  }
  const session = { world: { questTombOffset: told }, mapService } as unknown as OnlineSession
  return { host: sessionGuideHost(session, { visible: false, lastRenderStats: { viewport: null } } as never), peeked }
}

describe('session guide host', () => {
  it('reads the true tomb off the act map, one tomb per look so it never stalls a frame', () => {
    const { host, peeked } = sessionWith(1, 70)
    const answers = Array.from({ length: 9 }, () => host.quests().tomb)
    expect(answers).toEqual([3, 3, 3, 3, 4, 4, 4, 4, 4])
    expect(peeked).toEqual([66, 67, 68, 69, 70])
  })

  it('falls back to what the server said outside act 2 or without an orifice', () => {
    expect(sessionWith(0, 70).host.quests().tomb).toBe(3)
    const lost = sessionWith(1, null).host
    expect(Array.from({ length: 9 }, () => lost.quests().tomb)).toEqual(Array(9).fill(3))
  })
})
