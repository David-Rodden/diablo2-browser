import { describe, expect, it, vi } from 'vitest'
import type { BnetFlowState } from '../../src/client/frontend/flow-state.ts'
import { freshGame } from '../../src/client/guide/fresh-game.ts'

const lobby = (playMode: 'bnet' | 'single' = 'bnet') => {
  let phase = 'ingame'
  const flow = { playMode, stage: 'in_game', roster: [{ name: 'AutoNecA' }], selectedSlotIndex: 0, gameName: '', gamePassword: '', difficulty: 'normal', lobbySubPanel: 'join' } as unknown as BnetFlowState
  const create = vi.fn(() => void (phase = 'ingame'))
  const host = { phase: () => phase, difficulty: () => 1 as const, inWorld: () => true, leave: vi.fn(async () => void Object.assign(flow, { stage: 'bnet_lobby' }, (phase = 'lobby'))), flow, create }
  return { host, flow, create }
}

describe('fresh game', () => {
  it('leaves, makes a passworded game on the same difficulty and waits until it is in', async () => {
    const { host, flow, create } = lobby()
    expect(await freshGame(host)).toBe(true)
    expect(create).toHaveBeenCalledWith(flow)
    expect(flow).toMatchObject({ lobbySubPanel: 'create', difficulty: 'nightmare', gameName: expect.stringMatching(/^autone\d+$/), gamePassword: expect.stringMatching(/^q\d+$/) })
  })

  it('does nothing in single player', async () => {
    const { host, create } = lobby('single')
    expect(await freshGame(host)).toBe(false)
    expect([host.leave.mock.calls.length, create.mock.calls.length]).toEqual([0, 0])
  })
})
