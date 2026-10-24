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
  it('reads the true tomb off the act map, once per map', () => {
    const { host, peeked } = sessionWith(1, 70)
    expect(host.quests().tomb).toBe(4)
    expect(host.quests().tomb).toBe(4)
    expect(peeked).toEqual([66, 67, 68, 69, 70])
  })

  it('falls back to what the server said outside act 2 or without an orifice', () => {
    expect(sessionWith(0, 70).host.quests().tomb).toBe(3)
    expect(sessionWith(1, null).host.quests().tomb).toBe(3)
  })
})
