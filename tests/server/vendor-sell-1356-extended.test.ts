/**
 * Issue #1356 follow-up — NpcSell requires an open trade window.
 */
import { describe, expect, it } from 'vitest'
import { GameInstance } from '../../src/server/engine/game-instance.ts'

describe('issue #1356 sell window validation', () => {
  it('rejects NpcSell when no trade window is open', () => {
    const game = new GameInstance({ seed: 1356, areaId: 1 })
    const playerId = game.connectPlayer({ charClass: 'pal', name: 'Seller', x: 10, y: 10, areaId: 1 })
    const player = (game as unknown as {
      players: Map<number, { gold: number; items: unknown[]; activeNpcId: number | undefined }>
    }).players.get(playerId)!
    const npcId = game.spawnMonster({
      classId: 154, name: 'Charsi', x: 11, y: 10, areaId: 1, isNpc: true, isVendor: true,
    })
    player.items.push({
      unitId: 9601, code: 'cap', name: 'Cap', quality: 2, level: 1, location: 'inventory',
      x: 0, y: 0, width: 1, height: 1, areaId: 1, ownerId: playerId, bodyLoc: 0,
      storePage: 0, cost: 500, gamble: false, identified: true, ethereal: false,
      socketed: false, totalSockets: 0, durability: 10, maxDurability: 10,
      quantity: 1, stats: new Map(), socketedItems: [],
    })
    game.enqueueCommand(playerId, { type: 'NpcSell', npcId, itemId: 9601 } as never)
    game.stepFrames(1)
    expect(player.gold).toBe(0)
    expect((player.items as { unitId: number }[]).some((it) => it.unitId === 9601)).toBe(true)
  })
})